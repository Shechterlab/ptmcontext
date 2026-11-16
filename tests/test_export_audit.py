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


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_legend_audit_and_the_walk_they_share_parse():
    for name in ('export_legend.js', 'export_common.js'):
        assert subprocess.run(['node', '--check', str(SCRIPT.parent / name)], capture_output=True).returncode == 0
    text = (SCRIPT.parent / 'export_legend.js').read_text()
    for word in ('missing a key in the export', 'pdftotext', 'KEY_SEL'):
        assert word in text


def test_the_tests_workflow_runs_both_export_audits_on_every_site_and_pages_does_not():
    pages = (SCRIPT.parents[2] / '.github' / 'workflows' / 'pages.yml').read_text()
    assert 'export_overlap.js' not in pages and 'export_legend.js' not in pages  # a deploy does not wait for them
    flow = (SCRIPT.parents[2] / '.github' / 'workflows' / 'tests.yml').read_text()
    assert all(f'site: {s}' in flow for s in ('methylarginine', 'methyllysine', 'phospho'))
    assert 'tools/audit/export_overlap.js' in flow and 'tools/audit/export_legend.js' in flow
    assert 'npx playwright install --with-deps chromium' in flow and '|| fail=1' in flow and 'exit $fail' in flow


def test_every_export_takes_its_key_through_the_figure_frame():
    kit = (SCRIPT.parents[2] / 'ptmcontext' / 'web' / 'assets' / 'kit.js').read_text()
    assert (
        'const dirLegend' in kit and 'DIR_WORDS' in kit and 'dirLegend,' in kit
    )  # one wording for a page's key and its exports
