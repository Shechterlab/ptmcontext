"""A selection made with a part of the cell drawings: only that part is left out of the retest, the others are compared as for any
other selection, and the one-line answer names the selected part and does not describe a comparison that did not happen."""

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


def _run(tmp_path, cytosol):
    root = _toy(tmp_path)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    dfile = tmp_path / 'd.json'
    dfile.write_text(json.dumps(data))
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop; global.requestAnimationFrame = f => 0; global.matchMedia = () => ({{ matches: false }});
const el0 = () => ({{ style: {{}}, setAttribute: noop, appendChild: noop, remove: noop, querySelectorAll: () => [], dataset: {{}} }});
global.document = {{ createElement: el0, head: {{ appendChild: noop }}, body: {{ appendChild: noop }}, addEventListener: noop, getElementById: () => null, querySelectorAll: () => [] }};
const D = JSON.parse(require('fs').readFileSync({json.dumps(str(dfile))}, 'utf8')), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const NL = String.fromCharCode(10), TAB = String.fromCharCode(9);
const [head, ...lines] = D.statistics_tsv.trim().split(NL), col = Object.fromEntries(head.split(TAB).map((c, k) => [c, k]));
const num = v => (v === '' || v === 'nan' ? null : v === 'inf' ? 1e300 : Number(v));
D.rows = lines.map(l => {{ const x = l.split('\t'), g = c => x[col[c]];
  return {{ analysis: g('analysis'), category: g('category'), method: g('method'), a: +g('a'), b: +g('b'), c: +g('c'), d: +g('d'), or: num(g('odds_ratio')), fold: num(g('fold_enrichment')),
    lo: num(g('odds_ratio_ci_low')), hi: num(g('odds_ratio_ci_high')), p: num(g('p')), q: num(g('q')), strata: g('n_strata') ? +g('n_strata') : null }}; }});
D.rows.forEach(r => {{ r.eff = r.or ?? r.fold; r.label = r.category; r.help = ''; r.dir = 'x'; r.title = r.analysis; }});
const noopK = {{}};
const P = n => Array.from({{ length: n }}, (_, i) => 'P' + (i + 1));
const sets = {{
  map_a: {{ N: 10, in_background: P(10), sets: [['nucleus', 4, ['P1', 'P2', 'P3', 'P4']], ['cytosol', {len(cytosol)}, {json.dumps(cytosol)}], ['membrane', 3, ['P8', 'P9', 'P10']]] }},
  map_b: {{ N: 8, in_background: P(8), sets: [['nuclear', 3, ['P1', 'P2', 'P3']]] }},
}};
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{ ['w:' + D.cell.id]: ['nucleoplasm'] }} }}, esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), int: n => String(n), cap: s => s[0].toUpperCase() + s.slice(1),
  fx: x => x.toFixed(2) + '×', fxn: x => x.toFixed(2), fq: q => q.toExponential(1), PADJ: 0.05, MIN_EFFECT: 1.1, LESS: 1 / 1.1, MIN: {{}}, link: (...a) => '#' + a.join('/'), render: noop, writeHash: noop,
  selOn: () => true, vsOn: () => false, questions: {{}}, methods: [], clicks: [], tips: [], afterRender: [], expBar: () => '', figureFrame: noop, preamble: () => '', exportFigure: noop, tw: s => 6 * s.length, wrap: s => [s], fit: s => s, detailsLink: () => '',
  sel: {{ data: () => ({{ protein_sets: sets }}), testable: () => true, setHas: () => false, compute: () => ({{ proteins: new Set(['P1', 'P2', 'P3', 'P4']) }}), namesProteins: () => false,
    ownSets: aid => ({{ all: false, sets: new Set(aid === 'map_a' ? ['nucleus'] : ['nuclear']) }}), MIN: {{ proteins: 10, marks: 30 }} }} }};
global.PTMC_STATS = {{ mh: () => ({{}}), bh: ps => ps, hyperSF: () => 0.001 }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-cell.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const parts = Object.fromEntries(K.cell.parts().map(p => [p.part, p]));
console.log(JSON.stringify({{ nuc: [parts.nucleoplasm.tone, parts.nucleoplasm.value, parts.nucleoplasm.selected, parts.nucleoplasm.maps],
  cyto: [parts.cytosol.tone, parts.cytosol.direction, parts.cytosol.maps, parts.cytosol.selected], pm: parts.pm.tone, answer: K.cell.answer() }}));"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    return json.loads(run.stdout)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_only_the_selected_part_is_left_out_and_the_answer_names_it(tmp_path):
    out = _run(tmp_path, ['P1', 'P2', 'P3', 'P5', 'P6'])
    assert out['nuc'] == ['sel', 'your selection', True, 0]  # the selected part: marked, not compared
    assert out['cyto'] == ['u1', 'more', 1, False]  # another part of the same map: retested and colored
    assert out['pm'] == 'na'  # no selected protein in it: no test, as for any selection
    assert out['answer'] == 'Proteins at nucleus are also more often in <b>cytosol</b> (1.50×).'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_answer_says_so_when_nothing_else_differs(tmp_path):
    out = _run(tmp_path, ['P1', 'P2', 'P5', 'P6', 'P7'])
    assert out['cyto'][0] == 'ns'
    assert out['answer'].startswith('Apart from nucleus, about as often in each region as ')
