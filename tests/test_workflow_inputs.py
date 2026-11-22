"""Every data-repository file the Pages build checks out is also checked out by each test job, so a site that builds on
Pages never fails CI for a missing input. The lists come from the site files (tools/ci_plan.py)."""

from ci_sites import PLAN


def test_each_test_job_checks_out_what_the_pages_build_reads():
    plan = PLAN.plan(PLAN.ROOT)
    assert plan['build_files'], 'no published site'
    for key in ('audit_files', 'test_files'):
        missing = sorted(set(plan['build_files']) - set(plan[key]))
        assert not missing, f'{key} lacks {missing}'
