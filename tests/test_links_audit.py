"""The link audit (tools/audit/links.js): it parses, its CI jobs call it (internal on each push, external weekly), and the figure
panels page it found throwing draws before the marks are loaded."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
node = pytest.mark.skipif(not shutil.which('node'), reason='needs Node')


@node
def test_the_audit_script_parses_and_the_workflows_run_it():
    script = ROOT / 'tools' / 'audit' / 'links.js'
    assert subprocess.run(['node', '--check', str(script)], capture_output=True).returncode == 0
    tests = (ROOT / '.github' / 'workflows' / 'tests.yml').read_text()
    weekly = (ROOT / '.github' / 'workflows' / 'links.yml').read_text()
    assert 'tools/audit/links.js' in tests and '--external' not in tests
    assert 'cron:' in weekly and '--external' in weekly and 'tools/audit/links.js' in weekly
    assert 'unverified' in weekly and 'unverified' in script.read_text()


@node
def test_the_figure_panels_page_does_not_read_the_marks_before_they_are_loaded():
    script = f"""
const fs = require('fs');
global.window = global; global.document = {{ addEventListener() {{}} }};
let loaded = false, asked = 0;
const K = {{ W: {{ marks: 'sites', mark: 'site' }}, esc: s => String(s), int: n => String(n), folds: {{}}, views: {{}},
  logoPanel: () => {{ asked++; if (!loaded) throw new TypeError('marks not loaded'); return {{ n: 2, html: () => '' }}; }},
  sel: {{ data: () => (loaded ? {{}} : null), active: () => false }} }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-figures.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const before = K.views.figures.render();
loaded = true;
console.log(JSON.stringify({{ before: before.includes('Loading'), asked, after: K.views.figures.render().includes('Site alignment') }}));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-600:]
    assert json.loads(run.stdout) == {'before': True, 'asked': 0, 'after': True}


def test_the_figure_panels_use_the_whole_dataset_when_nothing_is_selected():
    assert 'no selection: the whole dataset' in (ASSETS / 'kit-conserve.js').read_text()
