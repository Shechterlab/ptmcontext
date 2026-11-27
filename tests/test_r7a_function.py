"""Round-7 function and layout fixes, read from the sources."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def src(name: str) -> str:
    return (ASSETS / name).read_text()


def test_a_listed_entry_is_opened_first_and_the_toggle_names_only_the_entry_being_loaded():
    js = src('kit-3d.js')
    start = js[js.index('function startPdbOrAf') : js.index('function start()')]
    assert 'const afFirst' in start and 'entriesAt(pos)' in start
    assert start.index('showPdb(e, ch, pos)') < start.index('scanSite(acc, pos).then(() => {\n              if (T.acc')
    assert 'T.loadingId = id' in js and 'loading ? { id: loading }' in js
    assert '!T.loadingId && !scanSite.shown' in js


def test_partner_counts_use_the_shared_plural():
    assert 'K.plural(k, `${W.marked} partner`)' in src('kit-near.js')


def test_the_selection_card_close_button_is_labelled():
    js = src('kit-proteins.js')
    assert js.count('data-site-close aria-label="Clear selection" title="Clear selection"') == 2


def test_the_phone_bar_controls_are_not_stretched_to_the_bar_height():
    css = src('kit.css')
    i = css.index('the bar is 44px high')
    block = css[i : css.index('\n}\n', i)]
    assert '.dock .dock-ico' in block and 'min-height: 32px' in block and 'inset: -6px' in block


ANSWER = r"""
const fs = require('fs'), vm = require('vm');
const win = { PTMC_MODULES: [], addEventListener() {} };
const doc = { addEventListener() {}, querySelectorAll: () => [] };
const K = { esc: s => String(s ?? ''), int: n => String(n), W: { residues: 'sites' }, fxn: v => String(v), PADJ: 0.05, PAL: {}, clicks: [] };
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), vm.createContext({ window: win, document: doc, console }));
win.PTMC_MODULES.forEach(f => f(K));
const r = (label, v, dir) => ({ label, v, q: 0.001, dir, n: 10 });
const T = K.tilekit;
console.log(JSON.stringify([
  T.answerOf([r('In a disordered region', 1.8, 'more'), r('Ordered', 0.3, 'less')], false, 'Disorder context'),
  T.answerOf([r('2 or more aromatic residues within ±5', 13, 'more'), r('One', 1.1, 'same')], false,
    'Next to aromatic residues (within 5)'),
  T.answerOf([r('RGG', 21, 'more')], false, 'Sequence motifs'),
]));
"""


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_tile_answer_names_each_row_once_and_has_no_less_often_prefix(tmp_path):
    script = tmp_path / 'h.js'
    script.write_text(ANSWER)
    out = json.loads(
        subprocess.run(
            ['node', str(script), str(ASSETS / 'kit-tile.js')], capture_output=True, text=True, check=True
        ).stdout
    )
    assert out[0] == 'In a disordered region: 1.8×; Ordered: 0.3×.'
    assert out[1] == '13×.'
    assert out[2] == 'RGG: 21×.'
