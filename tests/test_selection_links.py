"""A selection in a link (f=) is written once-escaped and read back from every older form: the filter values are escaped
once, their separators (~ ; |) stay plain, and a link an earlier version wrote (the whole value escaped a second time, so
%20 became %2520) still loads, unwrapped until it is stable (kit-select.js, K.sel.fRaw / decode / encode)."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from test_search import _build, _page_data, _toy

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_links_carry_single_encoding_and_old_double_encoded_links_load(tmp_path):
    data = _page_data(_build(_toy(tmp_path)))
    (tmp_path / 'd.json').write_text(json.dumps(data))
    script = f"""
const fs = require('fs');
global.window = global; global.PTMC_STATS = undefined;
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-select.js'))}, 'utf8'));
const D = JSON.parse(fs.readFileSync({json.dumps(str(tmp_path / 'd.json'))}, 'utf8')), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}}, vs: 'residues' }}, esc: s => String(s ?? ''), int: n => String(n), cap: t => t, clicks: [], render: () => {{}}, writeHash: () => {{}},
  link: v => '#' + v, decorate: r => r, sections: {{}}, views: {{}}, tabs: [] }};
window.PTMC_MODULES.forEach(m => m(K));
const val = 'A / B|C';
K.S.f = {{ 't:kind': [val, 'x'] }};
const once = K.sel.encode();
const old = encodeURIComponent(once).replace(/~/g, '%7E');            // what the earlier version wrote: URLSearchParams over the value
const twice = encodeURIComponent(old);                                  // and a link carried through that once more
const read = q => {{ K.sel.decode(K.sel.fRaw(q)); return K.S.f['t:kind']; }};
console.log(JSON.stringify({{ once, old, read: [read('f=' + once), read('q=a&f=' + old), read('f=' + twice + '&m=x'), read('?f=' + once + '&q=a')], none: K.sel.fRaw('q=a') }}));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert out['once'] == 't:kind~A%20%2F%20B%7CC|x'                     # one escape; the separators are plain
    assert '%25' in out['old'] and '%25' not in out['once']
    assert out['read'] == [['A / B|C', 'x']] * 4
    assert out['none'] is None


def test_the_core_writes_f_through_a_query_that_does_not_escape_it_again():
    src = (ASSETS / 'kit.js').read_text()
    assert 'class Query extends URLSearchParams' in src and 'const p = new Query();' in src
