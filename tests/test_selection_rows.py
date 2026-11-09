"""A tile or question row for a class the selection itself filters on is the selection, 100% by construction: it is marked
"Your selection" and has no bar, fold or count (display only: the rows and their statistics are the same). A row that
selects its class returns the page to its top and keeps the scroll position Back returns to."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
HARNESS = r"""
const fs = require('fs'), vm = require('vm');
const win = { PTMC_MODULES: [], addEventListener() {} };
const doc = { addEventListener() {}, querySelectorAll: () => [] };
const K = { esc: s => String(s ?? ''), int: n => String(n), W: { residues: 'sites', marks: 'sites' }, fxn: v => String(v), PADJ: 0.05, PAL: {}, clicks: [] };
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), vm.createContext({ window: win, document: doc, console }));
win.PTMC_MODULES.forEach(f => f(K));
const T = K.tilekit, rows = [{ label: 'A', v: 3, q: 0.001, dir: 'more', n: 10 }, { label: 'B', v: 12, q: 0.001, dir: 'more', n: 20, mine: true }];
const ax = T.axisOf(T.valsOf(rows));
console.log(JSON.stringify({ mine: T.rowHtml(rows[1], ax), other: T.rowHtml(rows[0], ax), vals: T.valsOf(rows), answer: T.answerOf(rows, true) }));
"""


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_selections_own_row_has_a_pill_and_no_bar_or_fold(tmp_path):
    script = tmp_path / 'h.js'
    script.write_text(HARNESS)
    out = json.loads(subprocess.run(['node', str(script), str(ASSETS / 'kit-tile.js')], capture_output=True, text=True, check=True).stdout)
    assert 'Your selection' in out['mine'] and 'fr-track' not in out['mine'] and '×' not in out['mine'] and 'fr-val' not in out['mine']
    assert 'fr-track' in out['other'] and 'Your selection' not in out['other']
    assert 12 not in out['vals']                        # the axis does not stretch to a row that is not compared
    assert 'B' not in out['answer'] and 'A' in out['answer']


def test_the_question_page_marks_the_row_the_same_way():
    kit = (ASSETS / 'kit.js').read_text()
    assert 'const ownClasses = a =>' in kit and "own && own.has(it.r.category)" in kit
    assert 'Other ${esc(lcFirst(a.title))}' in kit                      # the other rows are named from the question's own title
    css = (ASSETS / 'kit.css').read_text()
    assert '.sel-pill' in css and '.fr-row.pick:focus-visible' in css and 'content: "Select' in css


def test_a_row_click_goes_to_the_top_and_back_restores_the_scroll():
    rail = (ASSETS / 'kit-rail.js').read_text()
    assert "K.rememberScroll?.()" in rail and 'scrollTo(0, 0)' in rail
    assert 'K.rememberScroll = ' in (ASSETS / 'kit.js').read_text()
