"""Guard: ptmcontext/ holds no mark-specific or site-specific literal (AGENTS.md rule 3). Marks, residues, enzymes,
example genes, patterns and colors come from the mark file and the site file. Comments and descriptions that name the
release the method came from are listed, with a reason and a count, in site_literal_allowlist.txt."""

import re
from pathlib import Path

PKG = Path(__file__).resolve().parents[1] / 'ptmcontext'
ALLOW = Path(__file__).with_name('site_literal_allowlist.txt')
LITERALS = {
    'methylarginine': r'(?i)methylarginine',
    'arginine': r'(?i)arginine',
    'methyllysine': r'(?i)methyllysine',
    'lysine': r'(?i)lysine',
    'PRMT': r'PRMT',
    'Rme': r'\bRme',
    'Kme': r'\bKme',
    'FUS': r'\bFUS\b',
    'H3C1': r'H3C1',
    '#c2410c': r'(?i)#c2410c',
    '#fdba74': r'(?i)#fdba74',
    'PRPR': r'PRPR',
    'RGRG': r'RGRG',
}


def _allowed() -> dict:
    out = {}
    for line in ALLOW.read_text().splitlines():
        if line.strip() and not line.startswith('#'):
            path, literal, count, _why = (x.strip() for x in line.split('|', 3))
            assert _why, f'the allowlist line for {path} {literal} gives no reason'
            out[(path, literal)] = int(count)
    return out


def _found() -> dict:
    out = {}
    for p in sorted(PKG.rglob('*')):
        if not p.is_file() or '__pycache__' in p.parts or p.suffix == '.pyc':
            continue
        text = p.read_text()
        for name, rx in LITERALS.items():
            n = len(re.findall(rx, text))
            if n:
                out[(str(p.relative_to(PKG.parent)), name)] = n
    return out


def test_ptmcontext_names_no_mark_or_site():
    allowed, found = _allowed(), _found()
    new = {k: n for k, n in found.items() if n > allowed.get(k, 0)}
    assert not new, f'mark/site literals in ptmcontext/ (move them to a mark file or a site file): {new}'


def test_the_allowlist_has_no_stale_lines():
    allowed, found = _allowed(), _found()
    stale = [k for k, n in allowed.items() if found.get(k, 0) < n]
    assert not stale, f'allowlist lines that allow more than the code has (lower or remove them): {stale}'
