"""Every input a published site reads (and its variants) is in the data-repository checkout of each workflow job that builds or
tests it, so a new input cannot pass here and fail in CI. The checkouts' file lists come from the site files
(tools/ci_plan.py), so a new site is covered when it has website.ci."""

import pytest
from ci_sites import PLAN, PUBLISHED

from ptmcontext import inputs as I
from ptmcontext import site as S

REPO = PLAN.ROOT


@pytest.fixture(scope='module')
def plan():
    return PLAN.plan(REPO)


@pytest.mark.parametrize('listing', ['build_files', 'audit_files', 'test_files'])
@pytest.mark.parametrize('site_id', PUBLISHED)
def test_every_input_of_a_site_is_checked_out(plan, site_id, listing):
    site = S.load_site(REPO / 'sites' / f'{site_id}.yaml')
    names = set(I.site_input_names(site))
    for v in site.get('variants') or {}:
        names |= set(I.site_input_names(S.with_variant(site, v)))
    entries = I.load(S.manifest_of(site))
    paths = plan[listing]
    missing = [entries[n]['file'] for n in sorted(names) if not any(entries[n]['file'].startswith(p) for p in paths)]
    assert not missing, f'{listing}: add to the sparse checkout: {missing}'
