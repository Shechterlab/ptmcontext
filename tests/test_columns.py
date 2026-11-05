"""Values by name (kit-cols.js, data.column_index): the same toy site built with its questions and attributes in another
order has the same value for each name, at another place in the arrays, so a page that counted to a place would be wrong
and one that asks by name is not."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml
from test_pages import _toy_site

from ptmcontext import site as S
from ptmcontext import web

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _build(tmp_path, name, reverse):
    root = _toy_site(tmp_path / name)
    p = root / 'sites' / 'toy.yaml'
    s = yaml.safe_load(p.read_text())
    if reverse:
        s['marks']['attributes'] = dict(reversed(list(s['marks']['attributes'].items())))
        s['analyses'] = [a for a in s['analyses'] if a['id'] != 'bound'][::-1] + [a for a in s['analyses'] if a['id'] == 'bound']
    p.write_text(yaml.safe_dump(s, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    out = web.build(p, log=lambda *_: None)
    page = out.read_text()
    D = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    recs = {}
    for f in (out.parent / 'data' / 'p').glob('*.json'):
        recs.update(json.loads(f.read_text()))
    return D, recs


def test_the_data_names_the_places_of_its_columns(tmp_path):
    a, _ = _build(tmp_path, 'a', False)
    b, _ = _build(tmp_path, 'b', True)
    assert a['mark_attributes'] == ['status', 'ev'] and b['mark_attributes'] == ['ev', 'status']
    assert a['column_index']['mark_attributes'] == {'status': 0, 'ev': 1} and b['column_index']['mark_attributes'] == {'ev': 0, 'status': 1}
    assert [a['column_index']['mark_columns'][c] for c in ('xl', 'near')] != [b['column_index']['mark_columns'][c] for c in ('xl', 'near')]
    assert a['column_index']['proteins'] == {'accession': 0, 'gene': 1, 'name': 2, 'length': 3, 'marks': 4, 'candidates': 5, 'entry': 6}
    assert a['proteins'][0][a['column_index']['proteins']['length']] == 43              # P1


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_value_is_the_same_by_name_in_another_column_order(tmp_path):
    got = {}
    for name, rev in (('a', False), ('b', True)):
        D, recs = _build(tmp_path, name, rev)
        script = f"""
global.window = global;
const D = {json.dumps({k: D[k] for k in ('column_index', 'mark_columns', 'mark_attributes', 'proteins')})};
const rec = {json.dumps(recs['P1'])};
const K = {{ D }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-cols.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const m = rec.marks.find(x => x[0] === 2);
console.log(JSON.stringify({{ status: K.cols.markAttr(m, 'status'), ev: K.cols.markAttr(m, 'ev'), xl: K.cols.markClass(m, 'xl'), none: K.cols.markAttr(m, 'nope') ?? null,
  noneC: K.cols.markClass(m, 'nope') ?? null, idx: K.cols.attr('nope'), length: K.cols.field(D.proteins[0], 'length') }}));"""
        got[name] = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert got['a'] == got['b']
    assert got['a']['status'] == 'exp' and got['a']['ev'] == 'xl; pdb' and got['a']['length'] == 43
    assert got['a']['none'] is None and got['a']['noneC'] is None and got['a']['idx'] == -1
