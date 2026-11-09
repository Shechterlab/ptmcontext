"""The export overlap audit (tools/audit/export_overlap.js) is shipped and well-formed. It drives a browser over a built page, so it
is not run here: that needs Playwright and a served site (see the script's header for the command)."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / 'tools' / 'audit' / 'export_overlap.js'


def test_the_audit_script_exists_and_says_what_it_checks():
    text = SCRIPT.read_text()
    for word in ('overlap', 'outline', 'outside', 'mark', 'getBoundingClientRect', 'exits with the number of hits'):
        assert word in text


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_audit_script_parses():
    assert subprocess.run(['node', '--check', str(SCRIPT)], capture_output=True).returncode == 0


def test_the_cell_drawings_carry_their_summary_and_key_into_the_export():
    cell = (SCRIPT.parents[2] / 'ptmcontext' / 'web' / 'assets' / 'kit-cell.js').read_text()
    assert 'lead: () =>' in cell and 'legend: () => colourLegend()' in cell
    assert 'Within them' not in cell
