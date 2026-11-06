"""The selection model (kit-select.js, K.sel) without a page: it loads and runs with no document at all, reads the marks
(data/selection.json) when first asked, answers the search and filters, tests a question again (rows / retest) and tells
subscribers when the selection changes. The sidebar and the selection line are kit-rail.js."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from test_search import _build, _page_data, _toy

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_model_runs_without_a_document_and_tells_subscribers(tmp_path):
    index = _build(_toy(tmp_path))
    data = _page_data(index)
    (tmp_path / 'd.json').write_text(json.dumps(data))
    sel = index.parent / 'data' / 'selection.json'
    script = f"""
const fs = require('fs');
global.window = global; global.PTMC_STATS = undefined;
let fetched = 0;
global.fetch = u => {{ fetched++; return Promise.resolve({{ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync({json.dumps(str(sel))}, 'utf8'))) }}); }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-select.js'))}, 'utf8'));
const D = JSON.parse(fs.readFileSync({json.dumps(str(tmp_path / 'd.json'))}, 'utf8')), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
let renders = 0;
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}}, vs: 'residues' }}, esc: s => String(s ?? ''), int: n => String(n), cap: t => t, clicks: [], render: () => {{ renders++; }}, writeHash: () => {{}},
  link: v => '#' + v, decorate: r => r, sections: {{}}, views: {{}}, tabs: [] }};
window.PTMC_MODULES.forEach(m => m(K));
const out = {{ hasUi: [typeof K.rail, typeof K.sel.bar, typeof K.watchSections], api: ['state', 'subscribe', 'rows', 'retest', 'data', 'peek', 'compute', 'select'].map(k => typeof K.sel[k]) }};
out.stateIsK = K.sel.state === K.S;
out.peekQuiet = [K.sel.peek(), fetched];                      // looking does not read the file
(async () => {{
  const calls = []; const stop = K.sel.subscribe(s => calls.push([s.q, Object.keys(s.f)]));
  const tell = () => K.afterRender.forEach(f => f());
  K.S.q = 'ONE'; K.sel.nMarks();                                // a search needs the marks: the file is asked for once
  K.sel.data(); K.sel.data();
  await K.sel.ready;
  out.loaded = [fetched, !!K.sel.peek(), renders];
  tell(); tell();                                               // an unchanged selection is not told twice
  K.S.q = ''; K.S.f = {{ 't:kind': ['x'] }}; tell();
  out.marks = [K.sel.nMarks(), K.sel.nProteins()];
  stop(); K.S.f = {{}}; tell();
  out.calls = calls;
  out.same = K.sel.retest === K.sel.rows;
  console.log(JSON.stringify(out));
}})();"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert out['hasUi'] == ['undefined', 'undefined', 'undefined'] and out['api'] == ['object', 'function', 'function', 'function', 'function', 'function', 'function', 'function']
    assert out['stateIsK'] and out['peekQuiet'] == [None, 0]
    assert out['loaded'] == [1, True, 1]                         # one fetch, one redraw when it arrived
    assert out['calls'] == [['ONE', []], ['', ['t:kind']]]
    assert out['marks'] == [3, 2] and out['same']
