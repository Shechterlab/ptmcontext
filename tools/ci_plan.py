"""What CI builds, derived from the site files: the published sites, their per-site CI parameters and the files of the
data repository they read.

    python tools/ci_plan.py                         the plan as JSON
    python tools/ci_plan.py --github-output FILE    the plan as step outputs, for `fromJSON` and `sparse-checkout`

A site is published to CI when its file has `website.ci` (CONTRACTS.md, "Site CI parameters"). The plan holds:

  sites           the published site ids, in `website.ci.order`
  pages_sites     the site files, in that order, as `ptmc pages` takes them
  pages_matrix    one entry per site: {site, lower}; lower is true when the site builds its with_lower_confidence variant
  link_matrix     {site, workers, budget} for the link audit
  export_matrix   {site, proteins, selection} for the export audits
  build_files     the files of the data repository the sites read (sparse checkout of the Pages build)
  audit_files     build_files and the release's release.json (the audits)
  test_files      audit_files and tools/ci_test_files.txt: the files the tests read that no site does (the parity checks)

Nothing here needs the data repository: a site's files come from its manifest.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

AUDIT_DEFAULTS = {'workers': 4, 'budget': 150, 'proteins': '', 'selection': ''}
LOWER_VARIANT = 'with_lower_confidence'


def published_sites(root: Path = ROOT) -> list[tuple[str, Path, dict]]:
    """(id, file, website.ci) of each published site, in `ci.order`; a duplicate order is an error."""
    found = []
    for path in sorted((root / 'sites').glob('*.yaml')):
        ci = ((yaml.safe_load(path.read_text()) or {}).get('website') or {}).get('ci')
        if ci is not None:
            found.append((path.stem, path, ci))
    found.sort(key=lambda x: (x[2]['order'], x[0]))
    orders = [x[2]['order'] for x in found]
    if len(set(orders)) != len(orders):
        raise ValueError(
            f'website.ci.order is not unique among the published sites: {dict(zip([x[0] for x in found], orders))}'
        )
    return found


def site_files(path: Path) -> list[str]:
    """The data files a site (and each of its variants) reads, as the manifest names them, and the folder of its
    snapshot (which also holds the snapshot's release record)."""
    from ptmcontext import inputs as I
    from ptmcontext import site as S

    site = S.load_site(path)
    entries = I.load(S.manifest_of(site))
    names = list(I.site_input_names(site))
    for v in site.get('variants') or {}:
        names += I.site_input_names(S.with_variant(site, v))
    files = [entries[n]['file'] for n in dict.fromkeys(names)]
    folder = str(Path(entries[site['snapshot']['input']]['file']).parent)  # the snapshot's tables and release record
    return [f for f in files if not f.startswith(folder + '/')] + [folder]


def plan(root: Path = ROOT) -> dict:
    sites = published_sites(root)
    pin = json.loads((root / 'data_pin.json').read_text())
    build: list[str] = []
    for _, path, _ in sites:
        build += site_files(path)
    build = list(dict.fromkeys(build))
    audit = build + [f'releases/{pin["release"]}/release.json']
    extra = [
        x.strip()
        for x in (root / 'tools' / 'ci_test_files.txt').read_text().splitlines()
        if x.strip() and not x.startswith('#')
    ]
    link, export, pages = [], [], []
    for sid, path, ci in sites:
        audit_cfg = {**AUDIT_DEFAULTS, **(ci.get('audit') or {})}
        if ci.get('lower_confidence'):
            variants = (yaml.safe_load(path.read_text()) or {}).get('variants') or {}
            if LOWER_VARIANT not in variants:
                raise ValueError(f'{sid}: website.ci.lower_confidence needs the variant {LOWER_VARIANT}')
        pages.append({'site': sid, 'lower': bool(ci.get('lower_confidence'))})
        link.append({'site': sid, 'workers': audit_cfg['workers'], 'budget': audit_cfg['budget']})
        export.append({'site': sid, 'proteins': audit_cfg['proteins'], 'selection': audit_cfg['selection']})
    return {
        'sites': [s[0] for s in sites],
        'pages_sites': ' '.join(f'sites/{s[0]}.yaml' for s in sites),
        'pages_matrix': {'include': pages},
        'link_matrix': {'include': link},
        'export_matrix': {'include': export},
        'build_files': build,
        'audit_files': audit,
        'test_files': list(dict.fromkeys(audit + extra)),
    }


def github_outputs(p: dict) -> str:
    """The plan as `name<<EOF` step outputs: JSON for the matrices, one path per line for the sparse checkouts."""
    out = []
    for k, v in p.items():
        text = '\n'.join(v) if isinstance(v, list) else v if isinstance(v, str) else json.dumps(v)
        eof = f'EOF_{uuid.uuid4().hex}'
        out.append(f'{k}<<{eof}\n{text}\n{eof}\n')
    return ''.join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--github-output', help='append the plan as step outputs to this file ($GITHUB_OUTPUT)')
    a = ap.parse_args(argv)
    p = plan()
    if a.github_output:
        with open(a.github_output, 'a') as fh:
            fh.write(github_outputs(p))
    print(json.dumps(p, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
