"""Round-6 wording: the conservation species note, the faded-marks note, the classes note, the compare notes and
the help notes carry the short wording only."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / 'ptmcontext' / 'web' / 'assets'


def test_conservation_species_note():
    for f in (ROOT / 'sites').glob('*.yaml'):
        t = f.read_text()
        assert 'few proteins have a yeast relative' not in t
        assert 'the set used here: mouse' not in t
    assert 'note: "Species: mouse to budding yeast"' in (ROOT / 'sites' / 'methylarginine.yaml').read_text()


def test_faded_marks_note():
    s = (A / 'kit-proteins.js').read_text()
    assert 'selected ` +' in s and '(others faded).' in s
    assert 'match your' not in s and 'the others are faded' not in s
