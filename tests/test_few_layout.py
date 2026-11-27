"""The small-selection layout (kit-few.js, run in Node): a header per site, key-fact chips that open a section, folded
sections with a one-line summary, and the rule for when a selection counts as small."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parent.parent / 'ptmcontext' / 'web' / 'assets'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_few_layout_folds_sections_and_links_chips_to_them():
    script = f"""
global.window = {{}}; global.document = {{ createElement: () => ({{}}), head: {{ appendChild: () => {{}} }} }};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
let on = true, testable = true;
const K = {{ esc, int: String, W: {{ marks: 'sites' }}, sel: {{ active: () => on, testable: () => testable }},
  fold: (id, t, sum, body, open) => `<details id="${{id}}"${{open ? ' open' : ''}}><h3>${{t}}</h3><i>${{sum}}</i>${{body}}</details>` }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-few.js'))}, 'utf8')); window.PTMC_MODULES.forEach(m => m(K));
const html = K.few.html({{ title: 'T', note: 'N', more: 2, sites: [{{ key: 'a/1', head: 'HEAD',
  facts: [{{ text: '3 partners', to: 'p' }}, {{ text: 'gone', to: 'none' }}, {{ text: 'plain' }}],
  sections: [{{ id: 'p', title: 'Partners', sum: '3 partners', body: '<p>x</p>' }}, {{ id: 'q', title: 'Empty', sum: '', body: '' }}] }}] }});
console.log(JSON.stringify({{ html, small: K.few.active(3), big: (testable = true, K.few.active(K.few.MAX + 1)),
  bigUntestable: (testable = false, K.few.active(K.few.MAX + 1)), none: (on = false, K.few.active(3)) }}));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    h = out['html']
    assert 'HEAD' in h and h.count('<details') == 1 and ' open' not in h  # folded; an empty section is left out
    assert 'data-open-fold="few-a-1-p"' in h and 'id="few-a-1-p"' in h
    assert 'data-open-fold="few-a-1-none"' not in h and '<span class="few-chip">gone</span>' in h
    assert 'Showing the first 1 of 3.' in h
    assert out['small'] and not out['big'] and out['bigUntestable'] and not out['none']
