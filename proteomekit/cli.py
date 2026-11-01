"""pk: the command line, so any repository's scripts (shell, HPC jobs, Makefiles) can use the kit without importing it.

  pk run sites/methylarginine.yaml --root DIR   run a site: its analyses, its statistics table, its parity check
  pk check sites/phospho.yaml                   validate a site config (and the profile it names) without running
  pk inputs --root DIR                          check every file of the manifest under DIR against its MD5
  pk inputs record NAME FILE --root DIR --source URL --version V --licence L
                                                add (or update) a manifest entry, with the file's MD5
  pk stage uniprot UP000002311 --out DIR/inputs --manifest sites/yeast.inputs.json --prefix yeast
  pk stage mobidb --out DIR/inputs --manifest sites/yeast.inputs.json --prefix yeast
                                                stage a proteome from upstream, recording release, date and MD5
  pk layers                                     the layers built in, and those installed packages offer
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import inputs as I
from . import layers as L
from . import site as S
from .profile import load_profile
from .snapshot import md5_file


def cmd_run(a) -> int:
    result = S.run(a.site, a.root, allow_untrusted=a.allow_untrusted, out_root=a.out_root, write=not a.no_write)
    if result.parity and not result.parity_ok:
        for r in result.parity:
            for got, exp in r.diffs:
                print(f'  {r.analysis} {r.method}\n    rebuilt   {got}\n    reference {exp}')
        return 1
    return 0


def cmd_check(a) -> int:
    site = S.load_site(a.site)
    profile = load_profile(site['mark'])
    entries = I.load(S.REPO / site['manifest']) if site.get('manifest') else I.load()
    named = [site['snapshot']['input'], site['marks']['input'], *site.get('inputs', {}).values(),
             *([site['reference']['statistics']] if site.get('reference', {}).get('statistics') else [])]
    missing = [n for n in named if n not in entries]
    unknown = [x['layer'] for x in site['analyses'] if x['layer'] not in L.BUILT_IN and x['layer'] not in L.plugins()]
    print(f"{site['id']}: mark {profile.id} ({', '.join(profile.residues)}), {len(site['analyses'])} analyses")
    for problem, items in (('inputs not in the manifest', missing), ('layers not found', unknown)):
        if items:
            print(f'  {problem}: {items}')
    return 1 if missing or unknown else 0


def cmd_inputs(a) -> int:
    if a.action == 'record':
        return cmd_inputs_record(a)
    bad = 0
    for name, e in I.load().items():
        try:
            I.resolve(a.root, [name], allow_untrusted=True)
            status = 'ok' + ('  (not trusted)' if e.get('note', '').startswith('NOT TRUSTED') else '')
        except Exception as exc:     # noqa: BLE001  (report every failure, then fail)
            status, bad = f'FAILS: {exc}', bad + 1
        print(f'{name:36s} {e.get("role", "input"):17s} {status}')
    return 1 if bad else 0


def cmd_inputs_record(a) -> int:
    path = Path(a.root) / a.file
    if not path.exists():
        print(f'{path} does not exist')
        return 1
    data = json.loads(I.MANIFEST.read_text())
    entry = {'file': a.file, 'md5': md5_file(path), 'source': a.source, 'version': a.version, 'licence': a.licence,
             'role': a.role}
    if a.note:
        entry['note'] = a.note
    old = data['inputs'].get(a.name)
    data['inputs'][a.name] = entry
    from .profile import validate
    validate(data, 'inputs')
    I.MANIFEST.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    print(f"{'updated' if old else 'added'} {a.name}: {entry['md5']}")
    if old and old['md5'] != entry['md5']:
        print(f"  the MD5 changed ({old['md5']} -> {entry['md5']}): every result that read it must be rebuilt and the change recorded")
    return 0


def cmd_stage(a) -> int:
    from . import stage
    out, manifest = Path(a.out), Path(a.manifest)
    if a.source == 'uniprot':
        if not a.proteome:
            print('pk stage uniprot needs a UniProt proteome id (e.g. UP000002311)')
            return 1
        print(stage.uniprot(a.proteome, out, manifest, a.prefix))
    else:
        fasta = sorted(out.glob(f'{a.prefix}_uniprot_*.fasta'))
        if not fasta:
            print(f'stage uniprot first: no {a.prefix}_uniprot_*.fasta in {out}')
            return 1
        print(stage.mobidb(fasta[-1], out, manifest, a.prefix))
    return 0


def cmd_layers(a) -> int:
    for row in L.available():
        print(f'{row["name"]:18s} {row["shape"]:6s} {row["origin"]:34s} {row["describe"]}')
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog='pk', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    s = sub.add_parser('run', help='run a site config')
    s.add_argument('site')
    s.add_argument('--root', required=True, help='folder the manifest paths are relative to')
    s.add_argument('--allow-untrusted', action='store_true', help='allow inputs the manifest marks not trusted (offline pilots)')
    s.add_argument('--out-root', default=None, help='where outputs.folder is written (default: this repository)')
    s.add_argument('--no-write', action='store_true')
    s.set_defaults(fn=cmd_run)

    s = sub.add_parser('check', help='validate a site config')
    s.add_argument('site')
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
    s.set_defaults(fn=cmd_inputs)

    s = sub.add_parser('stage', help='download a source from upstream and record it in a manifest')
    s.add_argument('source', choices=['uniprot', 'mobidb'])
    s.add_argument('proteome', nargs='?', help='UniProt proteome id, for uniprot')
    s.add_argument('--out', required=True, help='folder for the staged files (its parent is the --root of pk run)')
    s.add_argument('--manifest', required=True, help="the site's input manifest (written or updated)")
    s.add_argument('--prefix', required=True, help='file name prefix, e.g. yeast')
    s.set_defaults(fn=cmd_stage)

    s = sub.add_parser('layers', help='list layers')
    s.set_defaults(fn=cmd_layers)

    a = ap.parse_args(argv)
    if a.cmd == 'inputs' and a.action == 'record' and not (a.name and a.file and a.source and a.version and a.licence):
        ap.error('pk inputs record NAME FILE needs --source, --version and --licence')
    return a.fn(a)


if __name__ == '__main__':
    sys.exit(main())
