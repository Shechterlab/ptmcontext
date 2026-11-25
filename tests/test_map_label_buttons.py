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
    assert (
        'siteGlance' not in prot and 'id="site-glance"' not in prot
    )  # one site table: the Sites table of kit-sitetable.js
    assert 'K.siteTable?.fold(p, rec, fold)' in prot
    assert prot.index('headline(p, rec) || legacyFacts') < prot.index(
        'K.siteTable?.fold(p, rec, fold)'
    )  # tiles, then the table
    st = read('kit-sitetable.js')
    assert 'OPEN_MAX = 40' in st and 'st-show' in st
    assert "'site-glance': 'p-sitetab'" in read('kit-openlink.js')


def test_sites_tab_has_writer_column():
    js = read('kit-sitetable.js')
    assert "label: 'Writer (UniProt)'" in js and 'K.prot.summaryAt' in js


def test_sites_tab_writer_column_reads_uniprot_for_shown_rows():
    js = read('kit-sites.js')
    assert "label: 'Writer (UniProt)'" in js and "show: ['writer']" in js  # added on every explorer
    assert 'ft_mod_res' in js and 'K.card.summaryItems(' in js and 'writerHtml(m, true)' in js  # sorting never fetches
    assert 'show: [writer], default: true' in (
        Path(__file__).resolve().parents[1] / 'sites' / 'phospho.yaml'
    ).read_text(encoding='utf-8')


def test_merged_map_label_names_every_site_with_its_letter():
    js = read('kit-map.js')
    assert '/${resName(prev.pos[1])}' in js and '/${resName(a.pos[1])}' in js
    assert '${prev.base}/${shown(' not in js and '${a.base}/${shown(' not in js


def test_human_less_writers_say_so_and_fold_the_others():
    js = read('kit-sitecard.js')
    assert 'No human ${esc(noun)}' in js and 'in other species ▸' in js
    for noun in ('writer', 'eraser', 'binder'):
        assert f"'{noun}'" in js
