"""A site's letter comes from its own row (K.markRes: the middle of its window), never from the explorer's first residue
(a phospho-like fixture mixing S, T and Y)."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parent.parent / 'ptmcontext' / 'web' / 'assets'
MARKS = [  # [protein index, position, state, class, 15-residue window centered on the site]
    [0, 26, 0, 0, 'RPHFPQFYYSASGTA'],
    [0, 308, 0, 0, 'FGGKTTRTFCGTPEY'],
    [0, 473, 0, 0, 'RPHFPQFSYSASGTA'],
]


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_site_labels_take_the_letter_from_the_row():
    sel = (ASSETS / 'kit-select.js').read_text()
    mark_res = re.search(r'  K\.markRes = .*?\n  \};\n', sel, re.DOTALL).group(0)
    script = f"""
global.window = {{}}; global.document = {{ createElement: () => ({{}}), head: {{ appendChild: () => {{}} }} }};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const marks = {json.dumps(MARKS)};
const K = {{ esc, int: String, W: {{ marks: 'sites' }}, D: {{ residues: ['S', 'T', 'Y'], proteins: [['P31749', 'AKT1']] }},
  link: (a, b) => '#' + a + '/' + b, sel: {{ active: () => true, testable: () => true }} }};
{mark_res}
K.prot = {{ siteLabel: (acc, pos) => K.markRes(marks.find(m => m[1] === pos)) + pos }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-few.js'))}, 'utf8')); window.PTMC_MODULES.forEach(m => m(K));
console.log(JSON.stringify({{ res: marks.map(K.markRes), links: marks.map(m => K.few.siteLink(0, m[1])) }}));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert out['res'] == ['Y', 'T', 'S']
    for link, name in zip(out['links'], ['Y26', 'T308', 'S473']):
        assert f'#protein/P31749/{name}"' in link and f' {name}</a>' in link  # text and address agree


def test_no_module_assumes_the_first_residue_for_a_site_name():
    for name in ['kit-few.js', 'kit-interactions.js', 'kit-sites.js', 'kit-sitetable.js']:
        src = (ASSETS / name).read_text()
        assert not re.search(r"D\.residues \|\| \[''\]\)\[0\]", src), name
        assert "(m[4] || '')[7]" not in src, name
