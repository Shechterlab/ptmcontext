"""One scheme for the names of downloaded files (K.stem in kit-tabfig.js), the export bar for a table that has none, and the
page PDF of the Interactions pages going through the same download path."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_file_names_follow_one_scheme():
    script = f"""
const fs = require('fs');
global.window = global; global.document = {{ createElement: () => ({{}}), head: {{ appendChild() {{}} }}, addEventListener() {{}}, getElementById: () => null }};
const S = {{ view: 'idrs', arg: '' }};
const K = {{ D: {{ site: {{ id: 'toy' }} }}, W: {{ marks: 'toyarginines' }}, S, esc: s => String(s), int: n => String(n), clicks: [], tw: t => t.length * 6, followsSelection: () => true,
  sel: {{ active: () => true, byAcc: {{ P1: {{ gene: 'GENEA', acc: 'P1' }} }} }} }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-tabfig.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const out = [K.stem('toyarginines_proteins_selection_2026-01-02.tsv'), K.stem('toy_idrs_diagram.png'), K.stem('other_file.fasta')];
S.view = 'protein'; S.arg = 'P1'; K.sel.active = () => false;
out.push(K.stem('toy_where_in_the_cell_p-cell.pdf'), K.stem('toy_P1_map.svg'));
console.log(JSON.stringify(out.map(x => x.replace(/\\d{{4}}-\\d{{2}}-\\d{{2}}/, 'DATE'))));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    assert json.loads(run.stdout) == [
        'toy_proteins_selection_DATE.tsv',
        'toy_idrs_diagram_selection_DATE.png',
        'other_file.fasta',
        'toy_GENEA_where_in_the_cell_DATE.pdf',
        'toy_GENEA_map_DATE.svg',
    ]


def test_tables_without_an_export_get_one_and_the_interactions_pdf_downloads():
    tf, ix, kit, cons = [
        (ASSETS / n).read_text() for n in ('kit-tabfig.js', 'kit-interactions.js', 'kit.js', 'kit-conserve.js')
    ]
    assert 'data-tblx' in tf and 'domTsv' in tf and 'svg.minimap' in tf
    assert 'K.pagePdf(' in ix and '() => print()' not in ix
    assert 'K.stem(name)' in kit
    assert "st?.phase === 'ok' ? K.expBar(" in cons
