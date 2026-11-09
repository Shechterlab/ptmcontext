"""The channel that links a protein's sites across the map, sequence, tables, 3D and conservation (kit-link.js)."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSET = Path(__file__).resolve().parent.parent / 'ptmcontext' / 'web' / 'assets' / 'kit-link.js'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_channel_tells_every_view_once_and_ignores_a_failing_one():
    script = f"""
global.window = global;
const K = {{ S: {{}} }};
eval(require('fs').readFileSync({json.dumps(str(ASSET))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const a = [], b = [];
const off = K.site.on(e => a.push([e.kind, e.acc, e.pos, e.from]));
K.site.on(() => {{ throw new Error('a view that fails'); }});
K.site.on(e => b.push(e.kind));
const log = console.error; console.error = () => {{}};
K.site.hover('P1', 216, {{ from: 'map' }}); K.site.hover('P1', 216, {{ from: 'map' }});   // the same hover twice: once
K.site.hover('P1', null);
K.site.focus('P1', '216', {{ from: 'sequence' }});
K.site.residue('P1', 40, {{ from: '3d' }});
const st = JSON.stringify(K.site.state);
off(); K.site.focus('P1', null, {{ from: 'keyboard' }});
console.error = log;
console.log(JSON.stringify({{ a, b, st, after: K.site.state.focus }}));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert out['a'] == [
        ['hover', 'P1', 216, 'map'],
        ['hover', 'P1', None, ''],
        ['focus', 'P1', 216, 'sequence'],
        ['residue', 'P1', 40, '3d'],
    ]
    assert out['b'] == [
        'hover',
        'hover',
        'focus',
        'residue',
        'focus',
    ]  # the failing view did not stop the others; a stopped one stops
    assert json.loads(out['st'])['focus'] == 216 and json.loads(out['st'])['residue'] == 40
    assert out['after'] is None
