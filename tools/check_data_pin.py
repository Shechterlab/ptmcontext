"""Check that the data pin is one thing everywhere, and a tagged release of the data repository.

    python tools/check_data_pin.py [--require-tag] [--offline]

data_pin.json names the data repository, the release, the tag and the commit. Every workflow `ref:` of the data repository and
every `blob/<hash>` in a manifest must name that commit. When the tag is set, `git ls-remote` must resolve it to the same
commit (a peeled annotated tag counts); `--offline` skips that lookup (and passes with a notice). A tag that still reads
TODO( ... ) passes with a notice, unless `--require-tag` (CI) says a site may not be published from an untagged release.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def problems(require_tag: bool = False, offline: bool = False, root: Path = ROOT, ls_remote=None) -> list[str]:
    pin = json.loads((root / 'data_pin.json').read_text())
    repo, commit, tag = pin['repository'], pin['commit'], pin.get('tag', '')
    out: list[str] = []
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        out.append(f'data_pin.json: commit {commit!r} is not a full hash')
    for wf in sorted((root / '.github' / 'workflows').glob('*.yml')):
        lines = wf.read_text().splitlines()
        for k, line in enumerate(lines):
            if line.strip() == f'repository: {repo}':
                ref = next((x for x in lines[k + 1 : k + 4] if x.strip().startswith('ref:')), '')
                if commit not in ref:
                    out.append(f'{wf.name}: the {repo} checkout at line {k + 1} is not at {commit[:7]}')
    for m in [root / 'inputs.json', *sorted((root / 'sites').glob('*.inputs.json'))]:
        for h in set(re.findall(rf'github\.com/{repo}/blob/([0-9a-f]{{40}})/', m.read_text())):
            if h != commit:
                out.append(f'{m.name}: a source is pinned at {h[:7]}, not {commit[:7]}')
    if tag.startswith('TODO'):
        if require_tag:
            out.append(f'the data release {pin.get("release")} is not tagged yet (data_pin.json tag is a TODO)')
        else:
            print(f'notice: {pin.get("release")} is not tagged yet; set data_pin.json tag when it is')
    elif offline:
        print('notice: offline, the tag was not looked up')
    else:
        ls = ls_remote or (
            lambda: (
                subprocess.run(
                    ['git', 'ls-remote', f'https://github.com/{repo}.git', f'refs/tags/{tag}', f'refs/tags/{tag}^{{}}'],
                    capture_output=True,
                    text=True,
                    timeout=60,
                ).stdout
            )
        )
        got = {ln.split()[1]: ln.split()[0] for ln in ls().splitlines() if ln.strip()}
        peeled = got.get(f'refs/tags/{tag}^{{}}') or got.get(f'refs/tags/{tag}')
        if not peeled:
            out.append(f'the tag {tag} does not exist in {repo}')
        elif peeled != commit:
            out.append(f'the tag {tag} resolves to {peeled[:7]}, not the pinned {commit[:7]}')
    return out


if __name__ == '__main__':
    found = problems('--require-tag' in sys.argv, '--offline' in sys.argv)
    print('\n'.join(found) if found else 'data pin ok')
    sys.exit(1 if found else 0)
