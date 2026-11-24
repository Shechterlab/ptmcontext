"""Open sections in the address (kit-openlink.js, run in Node with a small DOM stand-in): `open=` lists the folds whose state
differs from the default, a leading "-" marks one closed that opens by default, a link reopens them after a render, an id the
page lacks is ignored, and another page starts clean."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parent.parent / 'ptmcontext' / 'web' / 'assets'


def _src(name):
    return (ASSETS / name).read_text()


def test_the_address_writes_and_reads_open_with_plain_commas_and_the_modules_are_wired():
    kit, mod = _src('kit.js'), _src('kit-openlink.js')
    assert "'open=' + v.split(',').map(encodeURIComponent).join(',')" in kit
    assert '(K.hashOut || []).forEach((f) => f(p))' in kit and 'K.hashOut = [];' in kit
    assert 'K.paramsIn.push' in mod and 'K.hashOut.push' in mod and 'K.afterRender' in mod
    assert 'kit-openlink.js' in (ASSETS.parent / '__init__.py').read_text()
    assert 'keeps the sections that are open' in _src('kit-help.js')


def test_folds_without_an_id_get_one_from_their_section_key():
    assert 'class="dis-group" id="dg-${esc(aid)}-' in _src('kit-questions.js')
    assert 'class="ix-fold" id="ixf-${esc(bkey(pg, sec, bi))}-' in _src('kit-interactions.js')
    assert 'const fid = (site, sid) => `few-${slug(site.key)}-${slug(sid)}`' in _src('kit-few.js')


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_open_ids_round_trip_through_the_address_and_reapply_after_a_render():
    script = f"""
global.window = {{}}; global.HTMLDetailsElement = class {{}};
const listeners = {{}};
global.document = {{ addEventListener: (t, f) => (listeners[t] = f), querySelectorAll: () => dom, getElementById: () => null }};
const mk = (id, open) => Object.assign(new HTMLDetailsElement(), {{ id, open }});
let dom = [];
const S = {{ view: 'interactions', arg: '' }}, writes = [];
const K = {{ S, folds: {{}}, paramsIn: [], hashOut: [], afterRender: [], writeHash: () => writes.push(1) }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-openlink.js'))}, 'utf8')); window.PTMC_MODULES.forEach(m => m(K));
const out = () => {{ const p = new URLSearchParams(); K.hashOut.forEach(f => f(p)); return p.get('open'); }};
const res = {{}};
// a link: one fold opened, one closed that opens by default, one the page lacks
K.paramsIn.forEach(f => f(new URLSearchParams('open=few-a-p,-ix-b,nope')));
dom = [mk('few-a-p', false), mk('ix-b', true), mk('other', false)];
K.afterRender.forEach(f => f());
res.applied = dom.map(d => d.open);
res.back = out();
// the reader closes the first again: it is the default, so it leaves the address
dom[0].open = false; listeners.toggle({{ target: dom[0] }});
res.after = out();
// a new fold opened by a click is recorded; one drawn open without a click is not
dom.push(mk('late', false)); K.afterRender.forEach(f => f());
dom[3].open = true; listeners.click(); listeners.toggle({{ target: dom[3] }});
res.late = out();
// another page starts clean
S.view = 'sites'; K.paramsIn.forEach(f => f(new URLSearchParams('')));
res.other = out();
console.log(JSON.stringify(res));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert out['applied'] == [True, False, False]
    assert out['back'] == 'few-a-p,-ix-b,nope'
    assert out['after'] == '-ix-b,nope'
    assert out['late'] == '-ix-b,nope,late'
    assert out['other'] is None


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_an_old_fold_id_in_the_address_opens_the_renamed_group():
    script = f"""
global.window = {{}}; global.HTMLDetailsElement = class {{}};
global.document = {{ addEventListener: () => {{}}, querySelectorAll: () => dom, getElementById: () => null }};
const mk = (id, open) => Object.assign(new HTMLDetailsElement(), {{ id, open }});
let dom = [];
const K = {{ S: {{ view: 'interactions', arg: '' }}, folds: {{}}, paramsIn: [], hashOut: [], afterRender: [], writeHash: () => {{}} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-openlink.js'))}, 'utf8')); window.PTMC_MODULES.forEach(m => m(K));
K.paramsIn.forEach(f => f(new URLSearchParams('open=ixg-partners-and-complexes,-ixg-partners')));
dom = [mk('ixg-protein-partners-and-complexes', false), mk('ixg-binding-proteins', true)];
K.afterRender.forEach(f => f());
console.log(JSON.stringify({{ applied: dom.map(d => d.open), id: K.foldId('ixg-partners'), same: K.foldId('p-ix') }}));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert out == {'applied': [True, False], 'id': 'ixg-binding-proteins', 'same': 'p-ix'}
    assert 'K.foldId?.(id)' in _src('kit.js')  # a saved selection's folds are read through the same table
