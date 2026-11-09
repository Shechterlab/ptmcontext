import os
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='session')
def reference_root():
    """A folder holding the manifest's inputs (for now, a PTM_Pipeline checkout at the recorded commit): PTMCONTEXT_ROOT,
    or ../PTM_Pipeline beside this repository. Tests that need it are skipped without it."""
    root = Path(os.environ.get('PTMCONTEXT_ROOT', REPO.parent / 'PTM_Pipeline'))
    if not (root / 'inputs' / 'reference').exists():
        pytest.skip(f'no inputs under {root} (set PTMCONTEXT_ROOT)')
    return root


class _Source(str):
    """The text of a kit script or stylesheet. The kit is formatted by prettier, so a test that looks for a piece of source with `in`
    asks whether it is there whatever the line breaks, quotes, commas and parentheses are."""

    @staticmethod
    def squash(text):
        import re

        text = str(text).replace('"', "'")
        text = re.sub(r'[\s()]', '', text).replace('`+`', '').replace("'+'", '')
        return re.sub(r',([\]}])', r'\1', text)

    def __contains__(self, needle):
        return super().__contains__(needle) or self.squash(needle) in self.squash(self)


@pytest.fixture(autouse=True, scope='session')
def _kit_source_as_text():
    """Path.read_text of a file under web/assets returns a _Source (see above)."""
    from pathlib import Path

    real = Path.read_text

    def read_text(self, *a, **k):
        text = real(self, *a, **k)
        return _Source(text) if self.suffix in ('.js', '.css') and 'assets' in self.parts else text

    Path.read_text = read_text
    yield
    Path.read_text = real
