"""Table cells never break inside a word: a line breaks at a space or a hyphen; only the cells named for long tokens
(a sequence, a list of identifiers) may break anywhere."""

from __future__ import annotations

import re
from pathlib import Path

CSS = (Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets' / 'kit.css').read_text()
CELLS = ('.tbl th', '.tbl td', '.stbl td', '.sites-tbl td')
OPT_IN = (
    '.tbl td.mono.wrap-any',
    '#m-data .tbl td.mono',
    '.tbl td .wrap-any',
    '.tbl td.ids',
    '.stbl td.ids',
    '.sites-tbl td.ids',
)


def _rules():
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', re.sub(r'/\*.*?\*/', '', CSS, flags=re.S)):
        yield [x.strip() for x in m.group(1).split(',')], m.group(2)


def test_no_cell_rule_breaks_inside_a_word():
    for sels, body in _rules():
        if any(s in CELLS for s in sels) and not all(s in OPT_IN for s in sels):
            assert not re.search(r'overflow-wrap:\s*(anywhere|break-word)|word-break:\s*break-all', body), sels


def test_cells_are_set_to_normal_wrapping_and_manual_hyphens():
    body = ''.join(b for sels, b in _rules() if '.tbl th' in sels and '.tbl td' in sels)
    assert 'overflow-wrap: normal' in body and 'word-break: normal' in body and 'hyphens: manual' in body
