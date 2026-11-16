"""A selection too small to test draws where its own proteins are found (the protein page's card, for one protein or
several), not the whole dataset's tested map; the banner says so."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def test_small_selection_reuses_the_protein_card_renderer():
    js = (ASSETS / 'kit-cell.js').read_text()
    assert 'function foundTile(' in js and 'oneDrawings(p)' in js
    assert '!K.sel.testable() && K.sel.proteinIds().size)\n      return foundTile(card)' in js
    assert '`${found.length} of ${ids.length} proteins`' in js
    assert 'Where these ${ids.length} proteins are found' in js and 'Where ${p.gene} is found' in js


def test_banner_no_longer_counts_the_cell_among_whole_dataset_tiles():
    kit = (ASSETS / 'kit.js').read_text()
    assert 'except the cell, which shows where your selection is found' in kit
    assert 'proteinIds' in (ASSETS / 'kit-select.js').read_text()
