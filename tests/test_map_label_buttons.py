"""Protein map labels are buttons (one site opens it, a merged label opens a chooser), the protein page has a flat site
table under the map from the site card's own summary items, and the Sites table has a writer column."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def read(name: str) -> str:
    return (ASSETS / name).read_text(encoding='utf-8')


def test_map_labels_are_buttons_with_a_chooser():
    js = read('kit-map.js')
    assert 'data-mlabel=' in js and 'role="button"' in js
    assert 'map-chooser' in js and "e.key === 'Escape'" in js
    assert "'[data-mlabel]', (el) => openLabel(el)" in js
    assert js.count('[data-comb],[data-mlabel]') == 2  # a label press neither starts a zoom drag nor clears it
    assert 'hideMapTip' in js and "addEventListener('hashchange'" in js


def test_site_table_uses_summary_items_and_is_capped():
    prot, card = read('kit-proteins.js'), read('kit-sitecard.js')
    assert 'function summaryItems(' in card and 'summaryItems,' in card
    assert 'K.card.summaryItems(' in prot
    assert 'const GL_CAP = 25' in prot and 'marks.slice(0, GL_CAP)' in prot
    assert 'siteGlance(p, rec) +' in prot
    assert "'All site tables'" in prot


def test_sites_tab_has_writer_column():
    js = read('kit-sitetable.js')
    assert "label: 'Writer (UniProt)'" in js and 'K.prot.summaryAt' in js
