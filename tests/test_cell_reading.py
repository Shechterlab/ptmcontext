"""website.reading on the maps of the cell (kit-cell.js, run in Node on a toy site): each map's value for a part is
the fold; a map speaks for a part only when the part holds at least min_group selected proteins and as many others; a
part is colored only when at least min_maps such maps differ the same way. A selection that names its proteins is not
compared, and the answer says so instead of claiming no difference."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
from test_cell_and_values import _toy

from ptmcontext import site as S
from ptmcontext import web

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _run(tmp_path, read, cyto_b=(80, 40), named=False):
    tmp_path.mkdir(parents=True, exist_ok=True)
    root = _toy(tmp_path)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    dfile = tmp_path / 'd.json'
    dfile.write_text(json.dumps(data))
    # 200 proteins, 60 selected (P1..P60); map A's cytosol: 80 members, 40 selected; map B's: as given
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop; global.requestAnimationFrame = f => 0; global.matchMedia = () => ({{ matches: false }});
const el0 = () => ({{ style: {{}}, setAttribute: noop, appendChild: noop, remove: noop, querySelectorAll: () => [], dataset: {{}} }});
global.document = {{ createElement: el0, head: {{ appendChild: noop }}, body: {{ appendChild: noop }}, addEventListener: noop, getElementById: () => null, querySelectorAll: () => [] }};
const D = JSON.parse(require('fs').readFileSync({json.dumps(str(dfile))}, 'utf8')), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const NL = String.fromCharCode(10), TAB = String.fromCharCode(9);
const [head, ...lines] = D.statistics_tsv.trim().split(NL), col = Object.fromEntries(head.split(TAB).map((c, k) => [c, k]));
const num = v => (v === '' || v === 'nan' ? null : v === 'inf' ? 1e300 : Number(v));
D.rows = lines.map(l => {{ const x = l.split(TAB), g = c => x[col[c]];
  return {{ analysis: g('analysis'), category: g('category'), method: g('method'), a: +g('a'), b: +g('b'), c: +g('c'), d: +g('d'), or: num(g('odds_ratio')), fold: num(g('fold_enrichment')),
    lo: num(g('odds_ratio_ci_low')), hi: num(g('odds_ratio_ci_high')), p: num(g('p')), q: num(g('q')), strata: g('n_strata') ? +g('n_strata') : null }}; }});
const P = (a, b) => Array.from({{ length: b - a + 1 }}, (_, i) => 'P' + (a + i));
const [mb, kb] = {json.dumps(list(cyto_b))};
const sets = {{
  map_a: {{ N: 200, in_background: P(1, 200), sets: [['cytosol', 80, [...P(1, 40), ...P(101, 140)]], ['membrane', 80, [...P(1, 40), ...P(141, 180)]]] }},
  map_b: {{ N: 200, in_background: P(1, 200), sets: [['cyto', mb, [...P(1, kb), ...P(101, 100 + mb - kb)]]] }},
}};
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}} }}, esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), int: n => String(n), cap: s => s[0].toUpperCase() + s.slice(1),
  READ: {json.dumps(read)},
  fx: x => x.toFixed(2) + '×', fxn: x => x.toFixed(2), fq: q => q.toExponential(1), PADJ: 0.05, MIN_EFFECT: 1.1, LESS: 1 / 1.1, MIN: {{}}, link: (...a) => '#' + a.join('/'), render: noop, writeHash: noop,
  selOn: () => true, vsOn: () => false, questions: {{}}, methods: [], clicks: [], tips: [], afterRender: [], expBar: () => '', figureFrame: noop, preamble: () => '', exportFigure: noop, tw: s => 6 * s.length, wrap: s => [s], fit: s => s, detailsLink: () => '',
  sel: {{ data: () => ({{ protein_sets: sets }}), testable: () => true, setHas: () => false, compute: () => ({{ proteins: new Set(P(1, 60)) }}), namesProteins: () => {json.dumps(named)},
    ownSets: () => ({{ all: false, sets: new Set() }}), MIN: {{ proteins: 10, marks: 30 }} }} }};
global.PTMC_STATS = {{ mh: () => ({{}}), bh: ps => ps, hyperSF: () => 0.001 }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-cell.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const parts = Object.fromEntries(K.cell.parts().map(p => [p.part, p]));
const one = p => [p.tone, p.value, p.maps];
console.log(JSON.stringify({{ cyto: one(parts.cytosol), answer: K.cell.answer() }}));"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    return json.loads(run.stdout)


DEFAULT = {'min_maps': 2, 'min_group': 20}


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_two_maps_agreeing_on_groups_of_twenty_color_a_part_with_their_median_fold(tmp_path):
    out = _run(tmp_path, DEFAULT)
    fold = (40 / 60) / (80 / 200)
    assert out['cyto'][0][0] == 'u' and out['cyto'][1] == f'{fold:.2f}×' and out['cyto'][2] == 2


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_small_group_or_a_higher_floor_leaves_the_part_gray(tmp_path):
    assert _run(tmp_path / 'a', {**DEFAULT, 'min_maps': 3})['cyto'][:2] == ['ns', 'fewer than 3 maps']
    out = _run(tmp_path / 'b', DEFAULT, cyto_b=(30, 15))  # map B: 15 selected, 15 others in the part
    assert out['cyto'][:2] == ['ns', 'fewer than 2 maps']


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_selection_that_names_its_proteins_is_not_said_to_differ_nowhere(tmp_path):
    out = _run(tmp_path, DEFAULT, named=True)
    assert out['cyto'][0] == 'na' and out['answer'].startswith('Not compared')
