"""Every PTM_Pipeline file the Pages build checks out is also checked out by each test job, so a site that builds on
Pages never fails CI for a missing input (and the other way round is caught when a test needs a new file)."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _lists(name: str) -> list[set[str]]:
    text = (ROOT / '.github' / 'workflows' / name).read_text()
    blocks = re.split(r'sparse-checkout: \|', text)[1:]
    return [set(re.findall(r'^\s{12}(\S+)\s*$', b.split('\n\n')[0], re.MULTILINE)) for b in blocks]


def test_each_test_job_checks_out_what_the_pages_build_reads():
    pages = set().union(*_lists('pages.yml'))
    assert pages, 'pages.yml has no sparse checkout'
    for i, job in enumerate(_lists('tests.yml')):
        missing = sorted(pages - job)
        assert not missing, f'tests.yml sparse checkout #{i + 1} lacks {missing}'
