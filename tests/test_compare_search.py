"""The Compare marks page's search, and the link to it from each explorer's question page (read from the sources)."""

from pathlib import Path

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'


def _src(name):
    return (ASSETS / name).read_text()


def test_the_compare_page_searches_by_word_prefix_and_keeps_it_in_the_hash():
    js, match = _src('land-compare.js'), _src('land-match.js')
    assert "p.set('q'" in js and "p.has('q')" in js  # #q= is written and read beside x, g and s
    assert 'startsWith(w)' in match and 'every(' in match  # each typed word starts a word of the class or question name
    assert 'data-clear-q' in js and 'classes match' in js


def test_a_question_page_links_to_the_compare_page_through_one_helper():
    link = _src('kit-cmplink.js')
    assert link.count('../compare/#') == 1  # the one place an address is built
    assert 'K.D.site.id' in link and 'compare.json' in link
    assert 'K.compareLink(aid)' in _src('kit.js')
    assert "'kit-cmplink.js'" in (Path(web.__file__).parent / '__init__.py').read_text()


def test_both_pages_match_categories_with_one_function():
    match, land, cmp_js = _src('land-match.js'), _src('land-search.js'), _src('land-compare.js')
    assert 'startsWith(w)' not in cmp_js and 'startsWith' in match  # the compare page keeps no matching of its own
    assert 'PTMMatch.matcher' in cmp_js and 'PTMMatch.count' in land
    assert "'land-match.js'" in (Path(web.__file__).parent / 'landing.py').read_text()
    assert 'land-match.js' in (Path(web.__file__).parent / 'compare.py').read_text()
    assert 'compare/#' in land and 'compare/compare.json' in land


def test_the_matching_function_reads_case_prefixes_plurals_and_labels():
    import json
    import shutil
    import subprocess

    node = shutil.which('node')
    if not node:
        import pytest

        pytest.skip('node is not installed')
    data = {
        'groups': [
            {
                'questions': [
                    {'title': 'Condensates', 'rows': [{'label': 'Stress granule'}, {'label': 'P-body'}]},
                    {'title': 'Disease families', 'rows': [{'label': 'ALS / motor neuron / FTD'}, {'label': 'Cancer'}]},
                ]
            }
        ]
    }
    src = f'global.window = {{}}; eval({json.dumps(_src("land-match.js"))}); const D = {json.dumps(data)};'
    src += "console.log(JSON.stringify(['stress gran', 'Stress Granules', 'als', 'condensate', 'disease', 'zzz', ''].map(q => window.PTMMatch.count(D, q).classes)))"
    out = subprocess.run([node, '-e', src], capture_output=True, text=True, check=True).stdout
    # a question's name keeps all its classes; an empty query matches nothing here (the page shows every row then)
    assert json.loads(out) == [1, 1, 1, 2, 2, 0, 0]
