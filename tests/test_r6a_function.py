"""Round-6 function and layout fixes, read from the sources."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def src(name: str) -> str:
    return (ASSETS / name).read_text()


def test_the_site_scan_has_no_time_limit_that_ends_in_none_and_reads_listed_entries_first():
    js = src('kit-3d.js')
    scan = js[js.index('function scanSite') : js.index('function bestPdb')]
    assert 'withTimeout' not in scan and 'entriesAt(pos)' in scan and 'Math.min(6, pool.length)' in scan
    assert "'Experimental (searching…)'" in js and 'looking…' not in js


def test_the_small_selection_cards_share_the_writer_chip_and_say_the_legend_once():
    st, few = src('kit-sitetable.js'), src('kit-few.js')
    assert st.count('function writerChip') + st.count('const writerChip') == 1 and st.count('writerChip()') == 2
    assert st.count('A ring means q below') == 2  # the table's note and the cards' single legend
    assert 'o.legend' in few and 'o.lead' in few
    assert 'loadUni' in src('kit-proteins.js')


def test_search_suggestion_counts_pluralize_through_one_helper():
    assert 'const plural = (n, one, many)' in src('kit.js')
    assert 'K.plural(t.n, noun())' in src('kit-terms.js')
    assert 'K.plural(n, `${W.marked} protein`)' in src('kit-search.js')


def test_the_bar_charts_value_column_wraps_the_shares_instead_of_overflowing():
    css = src('kit.css')
    assert 'minmax(9rem, 2fr) 6rem;' in css and '.qrow .val .sh {\n  white-space: normal;' in css


def test_the_landing_search_has_a_short_placeholder_on_a_phone():
    js = src('land-search.js')
    assert "'Gene, site or topic'" in js and 'max-width: 640px' in js


def test_a_variant_word_with_a_site_opens_the_card_at_its_variants_from_one_word_list():
    names = src('kit-names.js')
    assert names.count('VARIANT_WORD') == 2 and 'mutations?|variants?|cancer' in names
    assert "open: 'sc-variants'" in src('kit.js') and "open: 'sc-variants'" in src('land-search.js')
    assert src('kit.js').count('asksVariants') == 1 and src('land-search.js').count('asksVariants') == 1
