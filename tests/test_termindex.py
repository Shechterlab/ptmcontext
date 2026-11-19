"""The search box's term index (web/termindex.py, kit-terms.js): protein sets and ontology terms by name or id.

The Python half builds a toy site with an overlap term source and reads data/search/terms.json; the Node half runs the
module's matching and ranking on a small made-up index: exact name, then prefix, then word match; at most 8 terms,
grouped by source; ids with or without leading zeros; synonyms."""

from __future__ import annotations

import json
import shutil
import subprocess

import pytest
from test_overlap import _build

from ptmcontext.web import termindex as TI
from node_harness import ASSETS


def test_index_has_sets_and_ontology_terms_with_marked_protein_counts(tmp_path):
    root, index = _build(tmp_path)
    page = index.parent
    raw = json.loads((page / TI.FILE).read_text())
    src = {i: s for i, s in enumerate(raw['sources'])}
    kinds = {s['id']: s['kind'] for s in raw['sources']}
    assert kinds['proc'] == 'term' and kinds['onto'] == 'set'
    terms = {(src[t[0]]['id'], t[1]): t for t in raw['terms']}
    # the toy term source holds G1 and G2 (3 proteins each); only proteins with a mark count (P1 and P2 have marks)
    assert terms[('proc', 'G1')][2] == 'first process'
    assert 0 < terms[('proc', 'G1')][3] <= 3
    assert all(t[3] > 0 for t in raw['terms'])  # a term with no marked protein is left out
    assert 'G3' not in {t[1] for t in raw['terms'] if src[t[0]]['id'] == 'proc'}
    data = json.loads((page / 'data' / 'search' / 'terms.json').read_text())
    assert data == raw


def test_families_are_found_by_each_part():
    assert TI._parts('ALS / motor neuron / FTD') == ['ALS', 'motor neuron', 'FTD']
    assert TI._parts('Plain name') == []


MATCH = r"""
global.window = global;
const fs = require('fs');
const K = { D: { term_index: { file: 'x', sources: [] } }, int: String, W: { marked: 'methylated' } };
eval(fs.readFileSync(ASSETS + '/kit-terms.js', 'utf8'));
window.PTMC_MODULES.forEach((m) => m(K));
const sources = [
  { id: 'go', kind: 'term', title: 'GO biological process', group: 'GO', key: 'g:go' },
  { id: 'dis', kind: 'set', title: 'Disease Ontology', group: 'Disease', key: 'p:dis' },
];
const terms = [
  [0, 'GO:0008380', 'RNA splicing', 208],
  [0, 'GO:0000375', 'RNA splicing, via transesterification reactions', 182],
  [0, 'GO:0006397', 'mRNA processing', 300],
  [1, 'DOID:332', 'amyotrophic lateral sclerosis', 52],
  [1, 'DOID:3324', 'mood disorder', 39],
  [1, 'ALS / motor neuron / FTD', '', 482, ['ALS', 'motor neuron', 'FTD']],
];
for (let i = 0; i < 12; i++) terms.push([0, 'GO:99' + i, 'kinase signaling ' + i, 10 + i]);
const ix = K.terms.prepare({ sources, terms });
const names = (q, ...a) => K.terms.rank(ix, q, ...a).map((h) => h.t.id);
console.log(JSON.stringify({
  exact: names('rna splicing').slice(0, 2),
  id: names('GO:0008380'),
  zeros: names('DOID:0000332'),
  idNumber: names('doid:332'),
  syn: names('als')[0],
  word: names('lateral sclerosis'),
  none: names('zzzz'),
  short: names('rn'),
  cap: names('kinase').length,
  groups: K.terms.rank(ix, 'kinase').map((h) => h.t.src.group),
  rows: K.terms.suggest('mood')[0],
}));
"""


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_matching_and_ranking():
    run = subprocess.run(
        ['node', '-e', f'const ASSETS = {json.dumps(str(ASSETS))};' + MATCH], capture_output=True, text=True
    )
    assert run.returncode == 0, run.stderr[-1000:]
    got = json.loads(run.stdout)
    assert got['exact'][0] == 'GO:0008380'  # an exact name before a longer name that begins with it
    assert got['id'] == ['GO:0008380'] and got['zeros'] == ['DOID:332'] and got['idNumber'][0] == 'DOID:332'
    assert got['syn'] == 'ALS / motor neuron / FTD'  # a synonym that is the whole word, before names that hold it
    assert got['word'] == ['DOID:332']
    assert got['none'] == [] and got['short'] == []
    assert got['cap'] <= 4  # at most four of one source
    assert set(got['groups']) == {'GO'}
