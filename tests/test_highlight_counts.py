"""Highlight beyond the figures (kit-hilite.js): per-row counts, "Select these" / "Compare with selection", and the protein pages' previous/next,
run under Node against a stub page of a toy site (two proteins have sites, one name has none)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'

PRELUDE = r"""
const fs = require('fs');
global.window = global;
const noop = () => {};
const inserted = [], hooks = {};
const rows = [
  { dataset: { f: 'a:cls', v: 'x' }, classList: { contains: () => false }, nextElementSibling: null, insertAdjacentHTML(w, h) { inserted.push(h); } },
  { dataset: { f: 'a:cls', v: 'y' }, classList: { contains: () => false }, nextElementSibling: null, insertAdjacentHTML(w, h) { inserted.push(h); } },
];
global.scrollY = 0; global.scrollX = 0; global.scrollTo = noop;
global.document = { createElement: () => ({ style: {} }), head: { appendChild: noop }, addEventListener: noop, getElementById: () => null,
  querySelectorAll: sel => (/fr-row/.test(sel) ? rows : []), querySelector: sel => (global.qs ? global.qs(sel) : null), body: { appendChild: noop } };
const S = { q: '', f: {}, hl: HL, view: 'overview', arg: '', vs: 'residues', cmp: '' };
// proteins: 0 ALPHA, 1 BETA, 2 GAMMA (GAMMA has no marked site); class x holds proteins 0 and 2, class y holds 1
const SD = { marks: [[0, 10], [0, 12], [1, 5]] };
const names = { ALPHA: [0], BETA: [1], GAMMA: [] };
let active = ACTIVE; const calls = { hash: [], render: 0 };
const K = { esc: s => String(s), int: n => String(n), S, clicks: [], paramsIn: [], paramsOut: [], tw: (t, s) => t.length * s, afterRender: [],
  writeHash: p => calls.hash.push(p), render: () => { calls.render++; }, link: (v, a) => '#' + v + '/' + a,
  sel: { active: () => active, compute: () => ({ proteins: new Set([0, 1]) }), data: () => SD, peek: () => SD, encode: () => 'k~v', byAcc: { A0: { i: 0 }, B1: { i: 1 } },
    select: (tok, f) => {
      if (f && f['a:cls']) { const ps = f['a:cls'][0] === 'x' ? [0, 2] : [1]; return { active: true, proteins: new Set(ps), marks: [], q: {} }; }
      const g = names[tok] || []; return { active: true, proteins: new Set(g), marks: g.length ? SD.marks.map((m, i) => (g.includes(m[0]) ? i : -1)).filter(i => i >= 0) : [], q: { genes: g, sites: [] } };
    } } };
K.D = { proteins: [['A0', 'ALPHA', '', 300], ['B1', 'BETA', '', 200], ['C2', 'GAMMA', '', 100]], words: { mark: 'site' }, site: { id: 'toy' } };
eval(fs.readFileSync(ASSETS + '/kit-hilite.js', 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const click = sel => K.clicks.find(c => c[0] === sel)[1];
"""


def run(hl, body, active='false'):
    script = (
        PRELUDE.replace('HL', json.dumps(hl)).replace('ACTIVE', active).replace('ASSETS', json.dumps(str(ASSETS)))
        + body
    )
    r = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-900:]
    return json.loads(r.stdout)


node = pytest.mark.skipif(not shutil.which('node'), reason='needs Node')


@node
def test_a_row_shows_how_many_highlighted_proteins_it_holds_and_nothing_without_a_highlight():
    body = 'K.afterRender.forEach(f => f()); console.log(JSON.stringify(inserted));'
    got = run('ALPHA, BETA, GAMMA', body)
    # class x holds ALPHA (GAMMA has no sites, so it is not counted); class y holds BETA
    assert len(got) == 2 and '1 highlighted' in got[0] and 'data-hl-v="x"' in got[0] and '1 highlighted' in got[1]
    assert run('', body) == []
    assert run('ALPHA R10, ALPHA', body)[0].count('1 highlighted') == 1  # a site entry counts its protein, once


