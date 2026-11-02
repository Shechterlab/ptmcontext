"""The input manifest (inputs.json): every file a build reads, with its source and MD5.

A file is used only if its bytes match the manifest, so it does not matter who staged it or which checkout it sits
in. An entry marked role 'reference_output' is a published result read only to check parity, never as an input to a
result of this repository.
"""
from __future__ import annotations

import json
from pathlib import Path

from .profile import validate
from .snapshot import md5_file

MANIFEST = Path(__file__).resolve().parents[1] / 'inputs.json'


def load(manifest: str | Path = MANIFEST) -> dict:
    data = json.loads(Path(manifest).read_text())
    validate(data, 'inputs')
    return data['inputs']


def resolve(root: str | Path, names: list[str] | None = None, manifest: str | Path = MANIFEST,
            allow_untrusted: bool = False) -> dict[str, Path]:
    """name -> path under root of each named input, after checking its MD5. Entries whose note starts with 'NOT
    TRUSTED' are refused unless allow_untrusted."""
    entries = load(manifest)
    names = list(entries) if names is None else names
    out = {}
    for name in names:
        if name not in entries:
            raise KeyError(f'{name!r} is not in the input manifest')
        e = entries[name]
        if e.get('note', '').startswith('NOT TRUSTED') and not allow_untrusted:
            raise PermissionError(f'input {name!r} is marked not trusted in the manifest: {e["note"]}')
        path = Path(root) / e['file']
        if not path.exists():
            raise FileNotFoundError(f'input {name!r}: {path} does not exist')
        md5 = md5_file(path)
        if md5 != e['md5']:
            raise ValueError(f'input {name!r}: {path} has MD5 {md5}, the manifest says {e["md5"]}')
        out[name] = path
    return out


def role_inputs(value) -> tuple[str, list[str]]:
    """A site's role, as written: one manifest name, or {first_of: [names]} or {all_of: [names]} (units.combine)."""
    if isinstance(value, str):
        return 'one', [value]
    if isinstance(value, dict) and len(value) == 1:
        (rule, names), = value.items()
        return rule, list(names)
    raise ValueError(f'a role is a manifest name, or {{first_of: [...]}} or {{all_of: [...]}}, not {value!r}')


def site_input_names(site: dict) -> list[str]:
    """Every manifest name a site reads: its snapshot, its marks (and the tables added to them), each role's inputs,
    its per-mark tables (for the website), its reference and the tables its website shows."""
    names = [site['snapshot']['input'], site['marks']['input'], *[a['input'] for a in site['marks'].get('add', [])]]
    if site.get('proteins'):
        names.append(site['proteins']['input'])
    for value in site.get('inputs', {}).values():
        names += role_inputs(value)[1]
    names += [t['input'] for t in (site['marks'].get('tables') or {}).values()]
    if site.get('reference', {}).get('statistics'):
        names.append(site['reference']['statistics'])
    # the tables the protein pages show (website.tables): checked and recorded like every input, read by ptmc web
    names += [t['input'] for t in ((site.get('website') or {}).get('tables') or {}).values()]
    names += [x['input'] for x in (site.get('reference', {}).get('tables') or {}).values()]
    return list(dict.fromkeys(names))
