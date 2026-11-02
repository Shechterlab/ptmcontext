"""Every input the methylarginine site reads (and its variants) is in the reference checkout of both workflows, so a new
input cannot pass here and fail in CI."""
import json
from pathlib import Path

import pytest

from ptmcontext import inputs as I
from ptmcontext import site as S

REPO = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('workflow', ['tests.yml', 'pages.yml'])
def test_every_reference_input_is_checked_out(workflow):
    site = S.load_site(REPO / 'sites' / 'methylarginine.yaml')
    names = set(I.site_input_names(site))
    for v in site.get('variants') or {}:
        names |= set(I.site_input_names(S.with_variant(site, v)))
    manifest = json.loads((REPO / 'inputs.json').read_text())
    entries = manifest.get('inputs', manifest)
    text = (REPO / '.github' / 'workflows' / workflow).read_text()
    paths = [line.strip() for line in text.splitlines() if line.startswith(' ' * 12) and '/' in line and ':' not in line]
    missing = [entries[n]['file'] for n in sorted(names) if n in entries and not any(entries[n]['file'].startswith(p) for p in paths)]
    assert not missing, f'{workflow}: add to the sparse checkout: {missing}'
