"""The page's data is split for a phone: the inline block holds what the first screen draws, data/site.json the rest of the
protein attributes (read when asked for), data/selection.json only when a search, a filter or a page needs it; the
one-file copy keeps everything inline. A toy site stands in; nothing here names a mark or a source."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from test_search import _build, _page_data, _toy

from ptmcontext.web import first_screen_attributes

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def test_the_first_screen_keeps_only_the_attributes_it_lists():
    web = {
        'overview': {
            'starting_points': {
                'lists': [{'by': 'a', 'where': {'attribute': 'b', 'max': 1}, 'show': '{c}/{a} aa'}, {'by': 'marks'}]
            }
        }
    }
    assert first_screen_attributes(web) == {'a', 'b', 'c', 'marks'}
    assert first_screen_attributes({}) == set()


def test_the_page_holds_the_first_screen_and_the_rest_waits_in_a_file(tmp_path):
    index = _build(_toy(tmp_path))
    data = _page_data(index)
    assert data['late'] == {'file': 'data/site.json', 'protein_attributes': ['go']}
    assert (
        data['protein_attributes']['values'] == {} and 'go' in data['protein_attributes']['specs']
    )  # the specs stay: filters name them
    late = json.loads((index.parent / 'data' / 'site.json').read_text())
    assert late == {'protein_attributes': {'go': ['experimental', 'none']}}
    page = index.read_text()
    assert 'selection-data' not in page and 'id="protein-data"' not in page  # the files hold them
    assert 'kit-late.js' in page and 'kit-cols.js' in page
    # the copy in one file has all of it inline, no late data and nothing to fetch
    one = (index.parent / 'toy.html').read_text()
    od = _page_data(index.parent / 'toy.html')
    assert 'late' not in od and od['protein_attributes']['values']['go'] == ['experimental', 'none']
    assert (
        'id="selection-data"' in one
        and len(one) > len(page) + (index.parent / 'data' / 'selection.json').stat().st_size
    )


def test_the_first_load_does_not_grow_with_the_files_it_defers(tmp_path):
    """index.html and its scripts are the first load; selection.json and site.json are not in it."""
    index = _build(_toy(tmp_path))
    sel = (index.parent / 'data' / 'selection.json').stat().st_size
    first = index.stat().st_size + sum(p.stat().st_size for p in (index.parent / 'assets').iterdir())
    one = (index.parent / 'toy.html').stat().st_size
    assert first + sel <= one + 10_000  # nothing the one-file copy holds is counted twice in the first load
    src = (ASSETS / 'kit-select.js').read_text()  # the one fetch is behind need(): a search, a filter or a page asking
    assert (
        src.count("fetch('data/selection.json')") == 1
        and 'const need = ' in src
        and 'data: () => { need(); return SD; }' in src
    )


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_late_attribute_is_fetched_once_when_first_read(tmp_path):
    script = f"""
global.window = global;
let fetched = 0, drawn = 0;
global.fetch = u => {{ fetched++; return Promise.resolve({{ ok: true, json: () => Promise.resolve({{ protein_attributes: {{ go: ['x', 'y'] }} }}) }}); }};
const D = {{ late: {{ file: 'data/site.json', protein_attributes: ['go'] }}, protein_attributes: {{ specs: {{ go: {{}}, n: {{}} }}, values: {{ n: [1, 2] }} }} }};
const K = {{ D, render: () => {{ drawn++; }} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-late.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const v = D.protein_attributes.values, out = {{ before: [v.n, Object.keys(v), K.late.done()] }};
out.first = v.go ?? null; out.again = v.go ?? null;                                // asked twice before it came: one fetch
setTimeout(() => {{ out.after = [v.go, fetched, drawn, K.late.done(), Object.keys(v).sort()]; console.log(JSON.stringify(out)); }}, 20);"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert out['before'] == [[1, 2], ['n'], False] and out['first'] is None and out['again'] is None
    assert out['after'] == [['x', 'y'], 1, 1, True, ['go', 'n']]
