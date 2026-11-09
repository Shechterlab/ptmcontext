"""The cell drawing for a card of another page (K.cell.list, K.cell.parts, K.cell.draw): the drawings, each part's value and the
drawing itself, without scraping the cell page. A toy site's maps stand in; the DOM is a stub that keeps the markup."""

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
def test_a_card_draws_the_cell_and_reads_its_parts(tmp_path):
    root = _toy(tmp_path)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    assert data['cell_crops'] == {'cell': [205, 40, 590, 420], 'nucleus': [210, 10, 580, 450]}
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
const sv = {{ attrs: {{}}, style: {{}}, setAttribute(k, v) {{ this.attrs[k] = v; }}, querySelectorAll: () => [] }};
const host = {{ innerHTML: '', get firstElementChild() {{ return sv; }}, addEventListener: noop, removeEventListener: noop }};
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}} }}, esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), int: n => String(n), cap: s => s[0].toUpperCase() + s.slice(1),
  fx: x => x.toFixed(2) + '×', fxn: x => x.toFixed(2), fq: q => q.toExponential(1), PADJ: 0.05, MIN_EFFECT: 1.1, LESS: 1 / 1.1, MIN: {{}}, link: (...a) => '#' + a.join('/'), render: noop, writeHash: noop,
  selOn: () => false, vsOn: () => false, questions: {{}}, methods: [], clicks: [], tips: [], afterRender: [], expBar: () => '', figureFrame: noop, preamble: () => '', exportFigure: noop, tw: s => 6 * s.length, wrap: s => [s], fit: s => s, detailsLink: () => '',
  sel: {{ data: () => null, testable: () => true, setHas: () => false, MIN: {{ proteins: 10, marks: 30 }} }} }};
global.PTMC_STATS = {{}};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-cell.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const out = {{ list: K.cell.list().map(d => [d.drawing, d.parts.length, d.crop]) }};
out.parts = K.cell.parts().map(p => [p.part, p.drawings, p.row, p.direction, p.maps, p.cells.map(c => c.map)]);
const r = K.cell.draw(host, 'cell', {{ crop: true, labels: false }});
out.draw = [r.drawing, r.W, r.H, r.parts.map(p => p.part).sort(), sv.attrs.viewBox, sv.style.maxWidth, /class="cell-svg cell-cell"/.test(host.innerHTML), /data-cell-part="cytosol"/.test(host.innerHTML)];
out.nucleus = K.cell.draw(host, 'nucleus', {{ crop: [0, 0, 10, 10] }}).parts.map(p => p.part);
out.none = K.cell.draw(host, 'nowhere');
// a part chosen as a filter (w:<cell id>): the marks of proteins that any map places in the part
K.sel.setHas = (a, st, p) => a === 'map_a' && p === 7;
const w = K.filterKinds.w, wid = D.cell.id, t = w.test(wid, ['cytosol']);
out.w = [w.valid(wid), w.valid('other'), w.value(wid, 'cytosol'), t([7]), t([8]), w.test(wid, ['nowhere'])([7])];
console.log(JSON.stringify(out));"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert [d[0] for d in out['list']] == ['cell', 'nucleus'] and out['list'][0][2] == [205, 40, 590, 420]
    parts = {p[0]: p for p in out['parts']}
    assert {'nucleoplasm', 'cytosol', 'pm'} <= set(parts)
    assert (
        parts['cytosol'][1] == ['cell']
        and parts['cytosol'][2] == 'Cytosol'
        and parts['cytosol'][4] == 2
        and parts['cytosol'][5] == ['map_a', 'map_b']
    )
    assert (
        parts['nucleoplasm'][1] == ['nucleus'] and parts['nucleoplasm'][5] == ['map_a', 'map_b'] and parts['pm'][4] == 0
    )  # membrane: no marked protein in it, no test
    assert all(p[3] in ('more', 'less', 'ns', 'na') for p in out['parts'])
    d = out['draw']
    assert d[0] == 'cell' and d[1:3] == [1000, 500] and 'cytosol' in d[3] and 'nucleoplasm' not in d[3]
    assert d[4] == '205 40 590 420' and d[5] == '590px' and d[6] and d[7]
    assert 'nucleoplasm' in out['nucleus'] and 'cytosol' not in out['nucleus'] and out['none'] is None
    assert out['w'] == [
        True,
        False,
        'Cytosol',
        True,
        False,
        False,
    ]  # a part is a filter by name; a part the drawings do not have keeps nothing
