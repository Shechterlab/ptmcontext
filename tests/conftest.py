import os
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='session')
def reference_root():
    """A folder holding the manifest's inputs (for now, a PTM_Pipeline checkout at the recorded commit): PROTEOMEKIT_ROOT,
    or ../PTM_Pipeline beside this repository. Tests that need it are skipped without it."""
    root = Path(os.environ.get('PROTEOMEKIT_ROOT', REPO.parent / 'PTM_Pipeline'))
    if not (root / 'inputs' / 'reference').exists():
        pytest.skip(f'no inputs under {root} (set PROTEOMEKIT_ROOT)')
    return root
