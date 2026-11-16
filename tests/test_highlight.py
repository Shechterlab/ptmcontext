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
  sel: {{ active: () => false, data: () => ({{}}), select: (q) => ({{ active: true, proteins: new Set([q.length]), marks: [1, 2], q: {{ sites: [], genes: [0] }} }}) }} }};
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
    assert out == {
        'hl': 'FUS, TARDBP R5',
        'keys': ['hl'],
        'on': True,
        'n': 2,
        'chips': 2,
        'q': '',
        'f': {},
        'none': False,
    }


def test_exports_can_draw_the_highlighted_items_alone():
    hl, idrs = (ASSETS / 'kit-hilite.js').read_text(), (ASSETS / 'kit-idrs.js').read_text()
    assert 'data-hl-only' in hl and 'localStorage' in hl and 'catch' in hl
    assert idrs.count('K.hl.only') >= 3  # the diagram's dots, the kappa strip, the subtitle


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
S.hl = ''; changes.forEach(f => f({{ target: {{ matches: x => x === '[data-hl-switch]', value: '0' }} }}));
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


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_each_entry_is_resolved_alone_a_site_names_one_residue_and_a_miss_is_reported():
    script = f"""
const fs = require('fs');
global.window = global; global.document = {{ createElement: () => ({{}}), head: {{ appendChild() {{}} }}, addEventListener() {{}} }};
const S = {{ q: '', f: {{}}, hl: 'ALPHA, ALPHA R10, ALPHA R999, ALPHAA, TDP-43' }};
const toy = {{ ALPHA: [[0], []], 'ALPHA R10': [[], [[0, 10]]], 'ALPHA R999': [[], [[0, 999]]], 'TDP-43': [[1], []] }};
const K = {{ esc: s => String(s), int: n => String(n), S, clicks: [], paramsIn: [], paramsOut: [], tw: (t, s) => t.length * s * 0.55, writeHash() {{}}, render() {{}}, afterRender: [],
  sel: {{ active: () => false, data: () => ({{}}), peek: () => ({{}}), byAcc: {{}}, select: tok => {{ const [g, s] = toy[tok] || [[], []]; return {{ active: true, proteins: new Set(g), marks: s.length && s[0][1] < 100 ? [7] : [], q: {{ genes: g, sites: s }} }}; }} }} }};
K.D = {{ proteins: [['P1', 'ALPHA', '', 300]], words: {{ mark: 'methylarginine' }} }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-hilite.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const p = K.hl.pasted(), line = K.hl.line(1, 'IDRs');
console.log(JSON.stringify({{ prots: [...p.prots], sites: p.sites.map(x => [x.p, x.pos]), notFound: p.notFound, bad: [...p.bad], line: line.includes('not found: ALPHAA'), protOfSite: K.hl.isProt(0),
  siteOnly: K.hl.isSite(0, 10, true) && !K.hl.isSite(0, 11, true), gene: K.hl.isProt(1) && K.hl.isSite(0, 99) }}));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert out == {
        'prots': [0, 1],
        'sites': [[0, 10]],
        'notFound': ['R999 of ALPHA is not in its sequence', 'ALPHAA'],
        'bad': ['ALPHA R999', 'ALPHAA'],
        'protOfSite': True,
        'line': True,
        'siteOnly': True,
        'gene': True,
    }


def test_the_box_is_in_the_sidebar_filters_tab_and_the_tables_and_figures_carry_the_highlight():
    web = ASSETS.parent
    assert 'hl-bar' not in (web / 'template.html').read_text()  # nothing about highlighting in the opening header
    rail = (ASSETS / 'kit-rail.js').read_text()
    assert 'K.hl?.section?.()' in rail and 'data-hl-goto' in rail
    assert 'K.hl?.summary?.()' in (ASSETS / 'kit.js').read_text()
    idrs, hl = (ASSETS / 'kit-idrs.js').read_text(), (ASSETS / 'kit-hilite.js').read_text()
    assert (
        'K.hl?.control()' not in idrs
        and 'outside your selection' in idrs
        and 'is in no IDR' in idrs
        and 'kappaFew' in idrs
    )
    assert (
        'firstSort' in (ASSETS / 'kit-tables.js').read_text() and 'firstSort' in (ASSETS / 'kit-sites.js').read_text()
    )
    assert 'hl-row' in (ASSETS / 'kit-tabfig.js').read_text() and 'isSite(p.i' in (ASSETS / 'kit-map.js').read_text()
    assert 'decorate' in hl and 'Highlighted first' in hl


def test_a_pasted_list_is_the_only_highlight_and_the_box_is_one_compact_row():
    idrs, hl, tf = (
        (ASSETS / 'kit-idrs.js').read_text(),
        (ASSETS / 'kit-hilite.js').read_text(),
        (ASSETS / 'kit-tabfig.js').read_text(),
    )
    assert 'K.hl?.any()' in idrs and 'parts.filter(r => r.pasted)' in idrs and 'K.hl.limit) HLS = st' in idrs
    assert 'data-hl-menu' in hl and 'aria-haspopup' in hl and "e.key === 'Escape'" in hl and 'aria-expanded' in hl
    assert '(t.closest(CONTAINER) || root).querySelector' in tf


def test_idr_page_says_what_each_count_counts_and_exports_follow_highlighted_only():
    idrs = (ASSETS / 'kit-idrs.js').read_text()
    hl = (ASSETS / 'kit-hilite.js').read_text()
    assert (
        'labels shown for' in idrs and 'so ${m === 1' in idrs and 'IDRs only' in idrs
    )  # the κ chart's scope and the label cap
    assert (
        "hname('diagram')" in idrs and '_highlighted' in idrs and 'data-idr-hltsv' not in idrs
    )  # one TSV, which honors the switch
    assert "'Search:'" in hl and 'hl-chip-nf' in hl and 'ci = have ?' in hl  # a search is not a highlight; struck chips
    assert "return ['idrs', 'IDRs', scoped().length]" in idrs  # the tab's number is the heading's


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_entries_that_resolve_to_one_protein_share_one_chip_named_by_the_gene():
    script = f"""
const fs = require('fs');
global.window = global; global.document = {{ createElement: () => ({{}}), head: {{ appendChild() {{}} }}, addEventListener() {{}} }};
const S = {{ q: '', f: {{}} }};
const byName = {{ tdp43: 7, tardbp: 7, fus: 3 }};
const K = {{ esc: s => String(s), int: n => String(n), S, clicks: [], paramsIn: [], paramsOut: [], tw: (t, s) => t.length * s * 0.55, writeHash() {{}}, render() {{}},
  D: {{ proteins: Array.from({{ length: 8 }}, (_, i) => (i === 7 ? ['Q13148', 'TARDBP'] : i === 3 ? ['P35637', 'FUS'] : ['X' + i, 'G' + i])) }},
  sel: {{ active: () => false, data: () => ({{}}), select: (q) => (byName[q.toLowerCase()] != null ? {{ active: true, proteins: new Set([byName[q.toLowerCase()]]), marks: [1], q: {{ sites: [], genes: [0] }} }} : {{ active: true, proteins: new Set(), marks: [], q: {{ sites: [], genes: [] }} }}) }} }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-hilite.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
K.paramsIn.forEach(f => f(new URLSearchParams('hl=tdp43%2C+FUS%2C+tardbp%2C+zzz')));
const line = K.hl.line(3, 'IDRs'), p = new URLSearchParams(); K.paramsOut.forEach(f => f(p));
const chips = [...line.matchAll(/<span class="hl-chip([^"]*)"[^>]*>([^<]*?) <button/g)].map(m => [m[2], m[1].trim()]);
console.log(JSON.stringify({{ chips, hl: p.get('hl') }}));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert out['chips'] == [['tdp43 → TARDBP', ''], ['FUS', ''], ['zzz', 'hl-chip-nf']]
    assert out['hl'] == 'tdp43, FUS, zzz'
