"""PubMed identifiers: one link per identifier, whatever separates them, and a long list collapses to "N papers"."""

import json
import subprocess
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'

SCRIPT = r"""
const fs = require('fs');
global.window = global;
eval(fs.readFileSync(ASSETS + '/kit-papers.js', 'utf8'));
const K = { esc: s => String(s) };
window.PTMC_MODULES.forEach(m => m(K));
const out = {
  semi: K.papers.ids('123;456'), spaced: K.papers.ids('123; 456'), comma: K.papers.ids('123,456 , 789'),
  dup: K.papers.ids('1;1;2'), none: K.papers.ids(''), arr: K.papers.ids(['5', '6;7']),
  two: K.papers.links(['1', '2']), many: K.papers.links(['1', '2', '3', '4']),
};
console.log(JSON.stringify(out));
"""


def test_identifiers_split_on_semicolon_comma_and_space():
    run = subprocess.run(
        ['node', '-e', f'const ASSETS = {json.dumps(str(ASSETS))};' + SCRIPT], capture_output=True, text=True
    )
    assert run.returncode == 0, run.stderr[-800:]
    o = json.loads(run.stdout)
    assert o['semi'] == o['spaced'] == ['123', '456']
    assert o['comma'] == ['123', '456', '789']
    assert o['dup'] == ['1', '2'] and o['none'] == [] and o['arr'] == ['5', '6', '7']
    assert o['two'].count('<a ') == 2 and ';' not in o['two'].replace('&', '')
    assert '4 papers' in o['many'] and o['many'].count('<a ') == 4 and '<details' in o['many']
