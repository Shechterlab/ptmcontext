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
