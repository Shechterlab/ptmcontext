"""The cell and the nucleus in one download ("Both"): the choice is the first in the card's export bar, and its figure takes both drawings
under one title, summary sentence, color key and credit. A toy site's maps stand in; the DOM is a stub."""

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


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_both_drawings_download_as_one_figure_with_one_key(tmp_path):
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
const el0 = () => ({{ firstElementChild: {{ innerHTML: '<g></g>' }}, style: {{}}, setAttribute: noop, appendChild: noop, remove: noop, querySelectorAll: () => [], dataset: {{}} }});
global.document = {{ createElement: el0, head: {{ appendChild: noop }}, body: {{ appendChild: noop }}, addEventListener: noop, getElementById: () => null, querySelectorAll: () => [] }};
const D = JSON.parse(require('fs').readFileSync({json.dumps(str(dfile))}, 'utf8')), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const NL = String.fromCharCode(10), TAB = String.fromCharCode(9);
const [head, ...lines] = D.statistics_tsv.trim().split(NL), col = Object.fromEntries(head.split(TAB).map((c, k) => [c, k]));
const num = v => (v === '' || v === 'nan' ? null : v === 'inf' ? 1e300 : Number(v));
D.rows = lines.map(l => {{ const x = l.split('\t'), g = c => x[col[c]];
  return {{ analysis: g('analysis'), category: g('category'), method: g('method'), a: +g('a'), b: +g('b'), c: +g('c'), d: +g('d'), or: num(g('odds_ratio')), fold: num(g('fold_enrichment')),
    lo: num(g('odds_ratio_ci_low')), hi: num(g('odds_ratio_ci_high')), p: num(g('p')), q: num(g('q')), strata: g('n_strata') ? +g('n_strata') : null }}; }});
D.rows.forEach(r => {{ r.eff = r.or ?? r.fold; r.label = r.category; r.help = ''; r.dir = 'x'; r.title = r.analysis; }});
const sv = {{ attrs: {{}}, style: {{}}, setAttribute(k, v) {{ this.attrs[k] = v; }}, querySelectorAll: () => [] }};
const host = {{ innerHTML: '', get firstElementChild() {{ return sv; }}, addEventListener: noop, removeEventListener: noop }};
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}} }}, esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), int: n => String(n), cap: s => s[0].toUpperCase() + s.slice(1),
  fx: x => x.toFixed(2) + '×', fxn: x => x.toFixed(2), fq: q => q.toExponential(1), PADJ: 0.05, MIN_EFFECT: 1.1, LESS: 1 / 1.1, MIN: {{}}, link: (...a) => '#' + a.join('/'), render: noop, writeHash: noop,
  selOn: () => false, vsOn: () => false, questions: {{}}, methods: [], clicks: [], tips: [], afterRender: [], expBar: () => '', figureFrame: o => o, preamble: () => '', exportFigure: (kind, make, name) => {{ (global.EXPORTS ||= []).push([kind, make, name]); }}, EXP_HELP: {{ pdf: 'PDF.', svg: 'SVG.', png: 'PNG.' }}, PAL: {{ ink: '#111', muted: '#666' }}, tw: s => 6 * s.length, wrap: (s, w) => [s], fit: s => s, detailsLink: () => '',
  sel: {{ data: () => null, testable: () => true, setHas: () => false, MIN: {{ proteins: 10, marks: 30 }} }} }};
global.PTMC_STATS = {{}}; global.EXPORTS = [];
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-cell.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const h = K.clicks.find(c => c[0] === '[data-cell-exp]')[1];
const out = {{}};
for (const fig of ['both', 'cell']) {{ EXPORTS.length = 0; h({{ dataset: {{ cellExp: 'svg', cellFig: fig }} }}); const [kind, make, name] = EXPORTS[0]; const f = make(); out[fig] = {{ kind, name, title: f.title, W: f.W, legend: f.legend.length, body: f.body, bodyH: f.bodyH }}; }}
console.log(JSON.stringify(out));"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    both, one = out['both'], out['cell']
    assert both['name'].endswith('_both') and one['name'].endswith('_cell')
    assert both['title'].endswith(': the cell and the nucleus') and ': ' not in one['title']
    assert both['legend'] == one['legend'] == 4  # the same color key, drawn once
    assert both['body'].count('<g transform="translate(') == 2 and one['body'].count('<g transform="translate(') == 1
    assert '>Cell</text>' in both['body'] and '>Nucleus</text>' in both['body']  # each drawing is named above it
    assert both['W'] > 1.5 * one['W'] - 100 and both['bodyH'] < 1.2 * one['bodyH'] + 40  # side by side, not stacked
