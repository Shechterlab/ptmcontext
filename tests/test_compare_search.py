"""The Compare marks page's search, and the link to it from each explorer's question page (read from the sources)."""

from pathlib import Path

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'


def _src(name):
    return (ASSETS / name).read_text()


def test_the_compare_page_searches_by_word_prefix_and_keeps_it_in_the_hash():
    js = _src('land-compare.js')
    assert "p.set('q'" in js and "p.has('q')" in js  # #q= is written and read beside x, g and s
    assert 'startsWith(w)' in js and 'every(' in js  # each typed word starts a word of the class or question name
    assert 'data-clear-q' in js and 'classes match' in js


def test_a_question_page_links_to_the_compare_page_through_one_helper():
    link = _src('kit-cmplink.js')
    assert link.count('../compare/#') == 1  # the one place an address is built
    assert 'K.D.site.id' in link and 'compare.json' in link
    assert 'K.compareLink(aid)' in _src('kit.js')
    assert "'kit-cmplink.js'" in (Path(web.__file__).parent / '__init__.py').read_text()
