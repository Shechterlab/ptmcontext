"""Every script the website ships parses: a merge that drops a bracket fails here, not in a reader's browser."""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = (
    sorted((ROOT / 'ptmcontext' / 'web' / 'assets').glob('*.js'))
    + sorted((ROOT / 'packages').rglob('*.js'))
    + sorted((ROOT / 'tools').rglob('*.js'))
)


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
@pytest.mark.parametrize('path', SCRIPTS, ids=lambda p: str(p.relative_to(ROOT)))
def test_script_parses(path):
    r = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
