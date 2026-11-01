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
