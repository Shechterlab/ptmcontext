"""The protein page's context cards (CONTRACTS.md, "Protein page cards"): the site file's blocks are checked, a protein-level
table in the protein_records format reaches the page, and the cards (assets/kit-pcards.js) are made from a toy site's tables
with none of the explorer's words in the module. A site without the blocks has no card."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import jsonschema
import pytest
import yaml

from ptmcontext import web
from ptmcontext.web import pcards, tables

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
TABLES = {
    'loc': {'input': 'x', 'format': 'protein_records', 'columns': {'accession': 'ac', 'location': 'where'}},
    'members': {'input': 'x', 'format': 'protein_records', 'columns': {'accession': 'ac', 'condensate': 'c', 'score': 's'}},
    'names': {'input': 'x', 'format': 'lookup', 'columns': {'key': 'id'}, 'values': ['name']},
}


def _site(cards=None, **protein):
    return {'analyses': [{'id': 'terms'}, {'id': 'fams'}], 'website': {'tables': TABLES, 'protein': {'cards': cards or {}, **protein}}}


def test_a_site_without_the_blocks_has_nothing_to_check():
    assert pcards.problems({'website': {}}) == []
    assert pcards.problems({}) == []


def test_the_blocks_are_checked():
    good = {'location': {'hpa': {'table': 'loc'}, 'condensates': {'members': 'members', 'names': 'names'}}}
    assert pcards.problems(_site(good, order=['p-map', 'p-cond'], open=['p-map'])) == []
    bad = {'location': {'hpa': {'table': 'members'}, 'condensates': {'members': 'nope'}}, 'dependency': {'table': 'loc'}, 'ghost': {}}
    out = ' | '.join(pcards.problems(_site(bad, order=['map', 'p-a', 'p-a'])))
    for part in ("'map' is not a fold id", "'p-a' listed twice", "table 'members' has no column 'location'", "no table 'nope'", "has no column 'lines'", "no card 'ghost'"):
        assert part in out
    perturb = pcards.problems(_site({'perturbations': {}}))
    assert any('card.calls' in x for x in perturb)
    sets = [{'title': 'D', 'analyses': ['terms'], 'id': 'dis', 'term_groups': {'terms': 'other', 'families': ['none']}, 'live': {'open_targets': {'graphql': 'http://x'}}}]
    out = ' | '.join(pcards.problems(_site(sets=sets)))
    assert "'dis' is not a fold id" in out and "'other' is not one of the card's analyses" in out and "no analysis 'none'" in out and 'not an https address' in out


def test_the_schema_takes_the_blocks_and_the_bundled_sites_pass():
    schema = json.loads((ROOT / 'ptmcontext' / 'schemas' / 'site.schema.json').read_text())
    for name in ('methylarginine', 'yeast_phospho'):
        site = yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())
        jsonschema.validate(site, schema)
        assert pcards.problems(site) == [], name
    ma = yaml.safe_load((ROOT / 'sites' / 'methylarginine.yaml').read_text())['website']['protein']
    assert set(ma['cards']) == set(pcards.CARDS) and ma['order'][0] == 'p-map' and 'p-cons' in ma['open']
    assert not pcards.config(yaml.safe_load((ROOT / 'sites' / 'yeast_phospho.yaml').read_text())).get('cards')      # no data, no card
    with pytest.raises(jsonschema.ValidationError):
        ma_site = yaml.safe_load((ROOT / 'sites' / 'methylarginine.yaml').read_text())
        ma_site['website']['protein']['cards']['clustering']['extra'] = 1
        jsonschema.validate(ma_site, schema)


def test_protein_records_keep_every_row_and_a_column_named_position(tmp_path):
    f = tmp_path / 'x.tsv'
    f.write_text('ac\tc\ts\tposition\nP1\ta\t3\t12\nP1\tb\t5\t\nP2\ta\t1\t\nP9\ta\t1\t\n')
    spec = {'input': 'x', 'format': 'protein_records', 'columns': {'accession': 'ac', 'condensate': 'c', 'score': 's', 'position': 'position'}}
    assert tables.problems('t', spec) == []                              # an open format: the card names the columns
    header, rows, partner, lookups = tables.pack({'t': spec}, {'x': f}, {'P1', 'P2'}, {'P1', 'P2', 'P9'}, log=lambda *a: None)
    assert header['t']['columns'] == ['condensate', 'score', 'position']
    assert rows['P1']['t'] == [['a', '3', '12'], ['b', '5', '']] and rows['P2']['t'] == [['a', '1', '']] and 'P9' not in rows and not partner


def test_the_module_comes_before_the_core():
    assert 'kit-pcards.js' in web.MODULES and web.MODULES.index('kit-pcards.js') < web.MODULES.index('kit.js')
    assert web.MODULES.index('kit-pcards.js') > web.MODULES.index('kit-conserve.js')       # its nav wraps the conservation card's


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_cards_are_made_from_a_toy_sites_tables():
    cards = {
        'location': {'hpa': {'table': 'loc', 'title': 'Places', 'source': 'Atlas 1', 'unsure': 'Low'},
                     'condensates': {'members': 'members', 'names': 'names', 'title': 'Droplets', 'source': 'Drop 2', 'max_score': 5, 'default_type': 'plain',
                                     'url': 'https://d/{id}', 'roles': {'driver': 'drives'}, 'evidence': {'ms': 'mass spec'}}},
        'clustering': {'table': 'cl', 'windows': [3, 10]}, 'other_ptms': {'table': 'ptm', 'kinds': {'ph': 'Phospho'}, 'near': 5},
        'dependency': {'table': 'dep', 'unit': 'lines', 'histogram': {'from': -2, 'to': 2}}, 'experiments': {'table': 'ex'}}
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop;
global.document = {{ addEventListener: noop, createElement: () => ({{}}), head: {{ appendChild: noop }}, getElementById: () => null, querySelectorAll: () => [] }};
const T = {{ loc: {{ columns: ['location', 'main', 'reliability'] }}, members: {{ columns: ['condensate', 'score', 'roles', 'evidence', 'pmids'] }}, cl: {{ columns: [] }}, ptm: {{ columns: [] }}, dep: {{ columns: [] }}, ex: {{ columns: [] }} }};
const D = {{ proteins: [], run: {{}}, tables: T, lookups: {{ names: {{ c1: {{ name: 'Alpha body', condensate_type: 'plain' }}, c2: {{ name: 'Beta granule', condensate_type: 'odd' }} }} }},
  protein_view: {{ cards: {json.dumps(cards)} }}, mark_attributes: [], attribute_specs: {{}} }};
const tb = {{
  loc: [{{ location: 'Nucleus', main: '1', reliability: 'High' }}, {{ location: 'Cytosol', main: '0', reliability: 'Low' }}],
  members: [{{ condensate: 'c1', score: '3', roles: 'member', evidence: '', pmids: '' }}, {{ condensate: 'c2', score: '5', roles: 'driver', evidence: 'ms', pmids: '11; 22' }}],
  cl: [{{ spacing_min: '1', spacing_median: '4', max_3: '2', max_10: '5', window_size: '30', window_start: '10', window_end: '39', window_sites: '6', window_log2: '0.5', window_q: '0.003', architecture: 'spread', clusters: '10,12,14; 30,33' }}],
  ptm: [{{ kind: 'ph', start: 12, end: 12, source: 's' }}, {{ kind: 'ph', start: 90, end: 90, source: 's' }}], ex: [],
  dep: [{{ lines: '100', dependent: '7', median: '-0.5', common_essential: 'False', histogram: '0;1;5;20;30;20;15;5;3;1', lineages: 'Lung|10|-0.2' }}] }};
const K = {{ D, W: {{ mark: 'site', marks: 'sites', residues: 'serines' }}, A: {{}}, S: {{}}, esc: s => String(s ?? ''), int: n => String(n), cap: s => s, fq: q => q.toExponential(1), PADJ: 0.05,
  link: (...a) => '#' + a.join('/'), sections: {{}}, proteinFolds: [], afterRender: [], hasData: {{}},
  card: {{ rows: (t, n) => t[n] || [], at: () => [], load: () => Promise.resolve({{}}) }}, sel: {{ data: () => null, setHas: () => false }} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-pcards.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const p = {{ acc: 'P1', gene: 'GENE', i: 0 }}, rec = {{ seq: 'AAAAAAAAAASAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', marks: [[10, 0, [], []], [12, 0, [], []]] }};
const out = {{ n: K.proteinFolds.length, ids: [] }};
for (const f of K.proteinFolds) out.ids.push((/id="([^"]+)"/.exec(f(p, rec, (id, title, sum, body) => `<details id="${{id}}">${{title}}</details>`)) || [])[1] || null);
out.loc = K.pcards.location(p, rec, tb); out.cl = K.pcards.clustering(p, rec, tb); out.ptm = K.pcards.other_ptms(p, rec, tb); out.dep = K.pcards.dependency(p, rec, tb); out.ex = K.pcards.experiments(p, rec, tb);
console.log(JSON.stringify(out));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert [i for i in out['ids'] if i] == ['p-cond', 'p-depmap', 'p-exp', 'p-cluster', 'p-ptm']
    loc = out['loc']
    assert loc['html'].index('Beta granule') < loc['html'].index('Alpha body')            # the more confident membership first
    assert 'Nucleus' in loc['sum'] and '2 Drop condensates, most confident Beta granule (5 of 5 stars)' in loc['sum']
    assert 'drives' in loc['html'] and 'mass spec' in loc['html'] and 'https://d/c2' in loc['html'] and 'no evidence type recorded' in loc['html']
    assert 'Places' in loc['html'] and 'Atlas 1' in loc['html'] and '<span class="tag">odd</span>' in loc['html'] and '<span class="tag">plain</span>' not in loc['html']
    assert 'median spacing 4 aa' in out['cl']['sum'] and 'top window 6 sites in 30 aa' in out['cl']['sum'] and '10–14 (3)' in out['cl']['html'] and 'A10–39' in out['cl']['html']
    assert out['ptm']['sum'] == 'Phospho 2 · 1 within 5 aa of a site'
    assert out['dep']['sum'] == '7 of 100 lines depend on it'
    assert 'Lung' in out['dep']['html'] and '<svg' in out['dep']['html']
    assert out['ex'] == {'hide': True, 'html': '', 'sum': ''}                              # no rows, no card


def test_groups_name_each_fold_once():
    ok = {'website': {'protein': {'groups': [{'id': 'g-a', 'title': 'A', 'folds': ['p-map']}, {'id': 'g-b', 'title': 'B', 'folds': ['p-sites']}]}}}
    assert pcards.problems(ok) == []
    twice = {'website': {'protein': {'groups': [{'id': 'g-a', 'title': 'A', 'folds': ['p-map']}, {'id': 'g-b', 'title': 'B', 'folds': ['p-map']}]}}}
    assert any("'p-map' is in both" in x for x in pcards.problems(twice))
