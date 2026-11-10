"""ptmc: the command line, so any repository's scripts (shell, HPC jobs, Makefiles) can use the kit without importing it.

ptmc run sites/methylarginine.yaml --root DIR   run a site: its analyses, its statistics table, its parity check
ptmc check sites/phospho.yaml                   validate a site config (and the profile it names) without running
ptmc inputs --root DIR                          check every file of the manifest under DIR against its MD5
ptmc inputs record NAME FILE --root DIR --source URL --version V --licence L [--site S | --manifest M]
             [--columns '{"accession": ..., "start": ..., "end": ...}'] [--record URL]
                                              add (or update) a manifest entry, with the file's MD5
ptmc stage uniprot UP000002311 --out DIR/inputs --manifest sites/yeast.inputs.json --prefix yeast
ptmc stage mobidb --out DIR/inputs --manifest sites/yeast.inputs.json --prefix yeast
ptmc stage shephard s_cerevisiae --out DIR/inputs --manifest sites/yeast.inputs.json --prefix yeast
                                              stage a proteome from upstream, recording release, date and MD5
ptmc web sites/methylarginine.yaml            the site's website, from its run: out/<site>/web/index.html and <site>.html
ptmc pages sites/a.yaml sites/b.yaml --out _site  the built sites (not their one-file copies) and a landing page, ready to publish
ptmc layers                                     the layers built in, and those installed packages offer
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import inputs as I
from . import layers as L
from . import site as S
from .profile import site_profile
from .snapshot import md5_file


def cmd_run(a) -> int:
    result = S.run(
        a.site, a.root, allow_untrusted=a.allow_untrusted, out_root=a.out_root, write=not a.no_write, variant=a.variant
    )
    if result.parity and not result.parity_ok:
        for r in result.parity:
            for got, exp in r.diffs:
                print(f'  {r.analysis} {r.method}\n    rebuilt   {got}\n    reference {exp}')
        return 1
    return 0


def cmd_check(a) -> int:
    site = S.load_site(a.site)
    profile = site_profile(site)
    entries = I.load(S.manifest_of(site))
    named = I.site_input_names(site)
    missing = [n for n in named if n not in entries]
    unknown = [
        x['layer']
        for x in site['analyses']
        if 'layer' in x
        and x['layer'] not in L.BUILT_IN
        and x['layer'] not in L.FACTORIES
        and x['layer'] not in L.plugins()
    ]
    for x in site['analyses']:  # a layer made from parameters: are they enough to make it?
        if x.get('layer') in L.FACTORIES:
            try:
                L.get(x['layer'], None, x.get('with'), x['id'])
            except (ValueError, KeyError, TypeError) as exc:
                unknown.append(f'{x["id"]}: {exc}')
        elif x.get('with'):
            unknown.append(f'{x["id"]}: layer {x.get("layer")!r} takes no with:')
    from .set_tests import roles_of, spec_problems

    unknown += [r for x in site['analyses'] if 'sets' in x for r in roles_of(x) if r not in site.get('inputs', {})]
    files, formats = {}, {}  # role -> file under --root, to read the columns a test names
    if a.root:
        for role, value in site.get('inputs', {}).items():
            rule, given = I.role_inputs(value)
            if rule == 'one' and given[0] in entries:
                files[role] = Path(a.root) / entries[given[0]]['file']
                if entries[given[0]].get('columns'):  # its separator, if not a tab
                    formats[str(files[role])] = entries[given[0]]['columns']
    sets = [p for x in site['analyses'] if 'sets' in x for p in spec_problems(x, S.root_of(site), files, formats)]
    web = (
        S.website_problems(site)
        + S.roles_missing(site)
        + (S.mapping_problems(site, a.root) + S.mark_table_problems(site, a.root) if a.root else [])
        + sets
    )
    print(f'{site["id"]}: mark {profile.id} ({", ".join(profile.residues)}), {len(site["analyses"])} analyses')
    for problem, items in (('inputs not in the manifest', missing), ('layers not found or not made', unknown)):
        if items:
            print(f'  {problem}: {items}')
    for w in web:
        print(f'  {w}')
    return 1 if missing or unknown or web else 0


def _manifest_arg(a) -> Path:
    """The manifest a command works on: --manifest, or the one a --site file names, or the package's own."""
    if getattr(a, 'manifest', None):
        return Path(a.manifest)
    if getattr(a, 'site', None):
        return S.manifest_of(S.load_site(a.site))
    return I.MANIFEST


def cmd_inputs(a) -> int:
    if a.action == 'record':
        return cmd_inputs_record(a)
    bad = 0
    manifest = _manifest_arg(a)
    for name, e in I.load(manifest).items():
        try:
            I.resolve(a.root, [name], manifest=manifest, allow_untrusted=True)
            status = 'ok' + ('  (not trusted)' if e.get('note', '').startswith('NOT TRUSTED') else '')
        except Exception as exc:  # noqa: BLE001  (report every failure, then fail)
            status, bad = f'FAILS: {exc}', bad + 1
        print(f'{name:36s} {e.get("role", "input"):17s} {status}')
    return 1 if bad else 0


def cmd_inputs_record(a) -> int:
    path = Path(a.root) / a.file
    if not path.exists():
        print(f'{path} does not exist')
        return 1
    manifest = _manifest_arg(a)
    data = json.loads(manifest.read_text()) if manifest.exists() else {'schema_version': 1, 'inputs': {}}
    entry = {
        'file': a.file,
        'md5': md5_file(path),
        'source': a.source,
        'version': a.version,
        'licence': a.licence,
        'role': a.role,
    }
    if a.note:
        entry['note'] = a.note
    if a.columns:
        try:
            entry['columns'] = json.loads(a.columns)
        except json.JSONDecodeError as exc:
            print(
                f'--columns is not JSON ({exc}); write it as, e.g., \'{{"accession": "uniprot", "start": "from", "end": "to"}}\''
            )
            return 1
    if a.record:
        entry['record'] = a.record
    old = data['inputs'].get(a.name)
    data['inputs'][a.name] = entry
    from .profile import validate
    import jsonschema

    try:
        validate(data, 'inputs')
    except jsonschema.ValidationError as exc:
        print(f'the entry does not meet the manifest contract: {exc.message}')
        return 1
    manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    print(f'{"updated" if old else "added"} {a.name}: {entry["md5"]}')
    if old and old['md5'] != entry['md5']:
        print(
            f'  the MD5 changed ({old["md5"]} -> {entry["md5"]}): every result that read it must be rebuilt and the change recorded'
        )
    return 0


def cmd_stage(a) -> int:
    from . import stage

    fn, _ = stage.STAGERS[a.source]
    try:
        print(fn(a))
    except (ValueError, FileNotFoundError) as exc:
        print(exc)
        return 1
    return 0


def cmd_web(a) -> int:
    from . import web

    web.build(a.site, out_root=a.out_root, variant=a.variant)
    return 0


def cmd_pages(a) -> int:
    from . import web

    web.pages(a.sites, a.out, out_root=a.out_root, skip_missing=a.skip_missing)
    return 0


def cmd_layers(a) -> int:
    for row in L.available():
        print(f'{row["name"]:18s} {row["shape"]:6s} {row["origin"]:34s} {row["describe"]}')
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog='ptmc', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    s = sub.add_parser('run', help='run a site config')
    s.add_argument('site')
    s.add_argument('--root', required=True, help='folder the manifest paths are relative to')
    s.add_argument(
        '--allow-untrusted', action='store_true', help='allow inputs the manifest marks not trusted (offline pilots)'
    )
    s.add_argument('--out-root', default=None, help='where outputs.folder is written (default: this repository)')
    s.add_argument('--no-write', action='store_true')
    s.add_argument(
        '--variant',
        default=None,
        help="run one of the site's variants (variants: in the site file), written under <outputs.folder>/variants/<name>",
    )
    s.set_defaults(fn=cmd_run)

    s = sub.add_parser('check', help='validate a site config')
    s.add_argument('site')
    s.add_argument(
        '--root', default=None, help="the inputs' folder: also check each column mapping against its file's columns"
    )
    s.set_defaults(fn=cmd_check)

    s = sub.add_parser('inputs', help='check, or record, manifest inputs')
    s.add_argument('action', nargs='?', default='check', choices=['check', 'record'])
    s.add_argument('name', nargs='?')
    s.add_argument('file', nargs='?', help='path relative to --root')
    s.add_argument('--root', required=True)
    s.add_argument('--source', default='')
    s.add_argument('--version', default='')
    s.add_argument('--licence', default='')
    s.add_argument('--role', default='input', choices=['input', 'reference_output'])
    s.add_argument('--note', default='')
    s.add_argument('--manifest', default=None, help='the manifest to check or write (default: the package inputs.json)')
    s.add_argument('--site', default=None, help='a site file: work on the manifest it names')
    s.add_argument(
        '--columns', default=None, help='a column mapping, as JSON: how to read a file no reader knows (CONTRACTS.md)'
    )
    s.add_argument('--record', default=None, help="the source's own page for a protein, with {acc}")
    s.set_defaults(fn=cmd_inputs)

    s = sub.add_parser('stage', help='download a source from upstream and record it in a manifest')
    from . import stage as _stage

    s.add_argument(
        'source',
        choices=sorted(_stage.STAGERS),
        help='; '.join(f'{k}: {d}' for k, (_, d) in sorted(_stage.STAGERS.items())),
    )
    s.add_argument(
        'proteome', nargs='?', help='UniProt proteome id (uniprot), or shephard-data proteome folder (shephard)'
    )
    s.add_argument('--commit', help='shephard-data commit (default: the one this version of ptmcontext pins)')
    s.add_argument(
        '--feature', help='MobiDB feature to keep (mobidb; default: the consensus prediction-disorder-th_50)'
    )
    s.add_argument('--out', required=True, help='folder for the staged files (its parent is the --root of ptmc run)')
    s.add_argument('--manifest', required=True, help="the site's input manifest (written or updated)")
    s.add_argument('--prefix', required=True, help='file name prefix, e.g. yeast')
    s.set_defaults(fn=cmd_stage)

    s = sub.add_parser('web', help="build a site's website from its run (ptmc run first)")
    s.add_argument('site')
    s.add_argument('--out-root', default=None, help='where outputs.folder is (default: this repository)')
    s.add_argument(
        '--variant',
        default=None,
        help="build one of the site's variants (run it first), into <outputs.folder>/web/<name>",
    )
    s.set_defaults(fn=cmd_web)

    s = sub.add_parser('pages', help='gather built sites and a landing page into one folder to publish')
    s.add_argument('sites', nargs='+')
    s.add_argument('--out', required=True)
    s.add_argument('--out-root', default=None)
    s.add_argument(
        '--skip-missing', action='store_true', help='leave out, with a warning, a site whose website was not built'
    )
    s.set_defaults(fn=cmd_pages)

    s = sub.add_parser('layers', help='list layers')
    s.set_defaults(fn=cmd_layers)

    a = ap.parse_args(argv)
    if a.cmd == 'inputs' and a.action == 'record' and not (a.name and a.file and a.source and a.version and a.licence):
        ap.error('ptmc inputs record NAME FILE needs --source, --version and --licence')
    return a.fn(a)


if __name__ == '__main__':
    sys.exit(main())
