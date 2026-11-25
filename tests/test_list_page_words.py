"""The gene-list page and the overlap page word what a pasted list is: no off-note on the list page, one method
sentence with a Method link, an "At the sites" block read through K.selAnswer, and the overlap page's reason for a
list (every protein has sites) apart from the circular reason for a set defined by having sites."""

from __future__ import annotations

from pathlib import Path

A = Path(__file__).resolve().parent.parent / 'ptmcontext' / 'web' / 'assets'
GL = (A / 'kit-genelist.js').read_text()
KIT = (A / 'kit.js').read_text()
OV = (A / 'kit-overlap.js').read_text()


def test_off_note_can_be_empty_and_list_page_has_none():
    assert "n === undefined ? 'Not filtered by your selection.' : n" in KIT
    assert "offNote: ''" in GL


def test_list_page_method_is_one_sentence_with_link():
    assert 'A new test, not in the release statistics' not in GL
    assert "K.link('method', 'list')" in GL
    assert 'id="m-list"' in GL


def test_sites_block_uses_the_overviews_retest():
    assert 'K.selAnswer' in GL and 'K.sel.MIN' in GL
    assert 'Open these ${int(n)} proteins in the Overview ›' in GL
    assert "K.sel.rows(aid, 'mantel_haenszel')" in KIT


def test_overlap_reason_for_a_list_is_not_circular():
    assert "can't be tested; the overlap test below can." in OV
    assert "t.id.startsWith('g:')" in OV
    assert 'defined by having sites' in OV


def test_summary_line_has_no_doubled_in_and_shows_counts_for_huge_folds():
    assert 'const afterIn = ' in KIT and 'afterIn(top.label)' in KIT and 'afterIn(low.label)' in KIT
    assert 'const foldOrCounts = ' in KIT and 'foldOrCounts(top)' in KIT
    assert '${fx(valOf(top))}' not in KIT


def test_list_sets_carry_their_source_and_the_cell_map_names_its_own():
    assert 'withSrc(r.question, r.label)' in GL
    assert 'class="muted small gl-foot"' in GL and 'class="gl-new"' not in GL
    for site in ('methylarginine', 'lysine', 'methyllysine', 'phospho'):
        y = (A.parent.parent.parent / 'sites' / f'{site}.yaml').read_text()
        assert 'name: "P-bodies (cell map)"' in y


def test_overlap_reason_covers_every_user_selection_and_is_shown_once():
    assert "['g', 'sel', 'sv'].includes(t.id.split(':')[0])" in OV
    assert 'proteins in your ${what} carry' in OV
    assert 'The first question' not in OV
    assert "? 'Counts only.'" in OV
    assert 'const once = (t) =>' in OV
