"""Highlighting candidates in figures (kit-hilite.js): the placement of direct labels leaves no two overlapping, stays in the
chart's box, and the IDR charts draw the highlighted items on top of gray context."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_labels_do_not_overlap_and_stay_in_the_box():
    script = f"""
const fs = require('fs');
global.window = global; global.document = {{ createElement: () => ({{}}), head: {{ appendChild() {{}} }}, addEventListener() {{}} }};
const K = {{ esc: s => String(s), int: n => String(n), S: {{}}, clicks: [], paramsIn: [], paramsOut: [], tw: (t, s) => t.length * s * 0.55, writeHash() {{}}, render() {{}} }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-hilite.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const items = Array.from({{ length: 12 }}, (_, i) => ({{ x: 300 + (i % 4) * 14, y: 200 + (i % 3) * 9, r: 4, t: 'GENE' + i + ' ' + (i * 10) + '–' + (i * 10 + 50) }}));
const box = [0, 760, 0, 400], out = K.hl.place(items, box);
const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
let overlaps = 0, outside = 0;
out.forEach((o, i) => {{ if (o.box[0] < box[0] || o.box[2] > box[1] || o.box[1] < box[2] || o.box[3] > box[3]) outside++; out.slice(i + 1).forEach(p => {{ if (hit(o.box, p.box)) overlaps++; }}); }});
console.log(JSON.stringify({{ n: out.length, overlaps, outside, limit: K.hl.limit, svg: K.hl.labels({{ bg: '#fff', ink: '#000' }}, out.slice(0, 1)).includes('GENE0') }}));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert out == {'n': 12, 'overlaps': 0, 'outside': 0, 'limit': 12, 'svg': True}


def test_the_idr_charts_draw_gray_context_and_ringed_highlights():
    src = (ASSETS / 'kit-idrs.js').read_text()
    assert 'K.hl.labels(' in src and 'GRAY' in src and 'hlTsv' in src and 'withHl(' in src
    assert 'kit-hilite.js' in (ASSETS.parent / '__init__.py').read_text()


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_pasted_list_is_its_own_link_parameter_and_narrows_nothing():
    script = f"""
const fs = require('fs');
global.window = global; global.document = {{ createElement: () => ({{}}), head: {{ appendChild() {{}} }}, addEventListener() {{}} }};
const S = {{ q: '', f: {{}} }};
const K = {{ esc: s => String(s), int: n => String(n), S, clicks: [], paramsIn: [], paramsOut: [], tw: (t, s) => t.length * s * 0.55, writeHash() {{}}, render() {{}},
  sel: {{ active: () => false, data: () => ({{}}), select: (q) => ({{ active: true, proteins: new Set(q.split(', ').map((_, i) => i)), marks: [1, 2] }}) }} }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-hilite.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
K.paramsIn.forEach(f => f(new URLSearchParams('hl=FUS%2C+TARDBP+R5&q=x')));
const p = new URLSearchParams(); K.paramsOut.forEach(f => f(p));
const st = K.hl.state(), line = K.hl.line(2, 'IDRs');
S.hl = ''; const none = K.hl.state().on;
console.log(JSON.stringify({{ hl: p.get('hl'), keys: [...p.keys()], on: st.on, n: st.prots.size, chips: (line.match(/data-hl-drop/g) || []).length, q: S.q, f: S.f, none }}));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert out == {'hl': 'FUS, TARDBP R5', 'keys': ['hl'], 'on': True, 'n': 2, 'chips': 2, 'q': '', 'f': {}, 'none': False}


def test_exports_can_draw_the_highlighted_items_alone():
    hl, idrs = (ASSETS / 'kit-hilite.js').read_text(), (ASSETS / 'kit-idrs.js').read_text()
    assert 'data-hl-only' in hl and 'localStorage' in hl and 'catch' in hl
    assert idrs.count('K.hl.only') >= 3                                    # the diagram's dots, the kappa strip, the subtitle


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_named_lists_are_saved_renamed_deleted_and_switched_in_this_browser_only():
    script = f"""
const fs = require('fs');
const store = {{}}; global.localStorage = {{ getItem: k => (k in store ? store[k] : null), setItem: (k, v) => {{ store[k] = v; }} }};
global.window = global; global.prompt = null; global.confirm = () => true;
let changes = [];
global.document = {{ createElement: () => ({{}}), head: {{ appendChild() {{}} }}, addEventListener: (t, f) => {{ if (t === 'change') changes.push(f); }} }};
const S = {{ q: '', f: {{}}, hl: 'FUS, TARDBP' }};
const K = {{ D: {{ site: {{ id: 'toy' }} }}, esc: s => String(s), int: n => String(n), S, clicks: [], paramsIn: [], paramsOut: [], tw: (t, s) => t.length * s * 0.55, writeHash() {{}}, render() {{}}, sel: {{ active: () => false, data: () => null }} }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-hilite.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const click = sel => K.clicks.find(([s]) => s === sel)[1];
const out = {{}};
global.prompt = () => 'ALS candidates'; click('[data-hl-save]')();
out.saved = JSON.parse(store['ptmc-hl-sets-toy']);
global.prompt = () => 'ALS list'; click('[data-hl-rename]')();
out.renamed = JSON.parse(store['ptmc-hl-sets-toy']).map(x => x.name);
S.hl = ''; changes[changes.length - 1]({{ target: {{ matches: () => true, value: '0' }} }});
out.switched = S.hl; out.html = K.hl.control().includes('ALS list');
click('[data-hl-delete]')();
out.deleted = JSON.parse(store['ptmc-hl-sets-toy']).length;
global.localStorage = {{ getItem() {{ throw new Error('blocked'); }}, setItem() {{ throw new Error('blocked'); }} }};
out.blocked = K.hl.sets().length;
console.log(JSON.stringify(out));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert out['saved'] == [{'name': 'ALS candidates', 'list': 'FUS, TARDBP'}] and out['renamed'] == ['ALS list']
    assert out['switched'] == 'FUS, TARDBP' and out['html'] and out['deleted'] == 0 and out['blocked'] == 0
