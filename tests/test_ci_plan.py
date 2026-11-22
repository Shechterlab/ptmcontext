"""tools/ci_plan.py: what CI builds and checks out comes from the site files (website.ci), and the workflows use it."""

import json
import re
from pathlib import Path

import pytest
import yaml
from ci_sites import PLAN, PUBLISHED

REPO = Path(__file__).resolve().parents[1]
WORKFLOWS = REPO / '.github' / 'workflows'
# the values the hand-maintained lists held before the plan derived them (four sites, at 6f0ec7c)
EXPECTED = json.loads((Path(__file__).parent / 'ci_expected.json').read_text())


@pytest.fixture(scope='module')
def plan():
    return PLAN.plan(REPO)


def test_the_published_sites_are_the_four_and_in_the_old_order(plan):
    assert plan['sites'] == EXPECTED['sites'] == PUBLISHED
    assert plan['pages_sites'] == ' '.join(f'sites/{s}.yaml' for s in EXPECTED['sites'])


def test_the_matrices_equal_the_hand_lists(plan):
    assert plan['link_matrix']['include'] == EXPECTED['link_matrix']
    assert plan['export_matrix']['include'] == EXPECTED['export_matrix']
    assert plan['pages_matrix']['include'] == [{'site': s, 'lower': EXPECTED['lower'][s]} for s in EXPECTED['sites']]


@pytest.mark.parametrize('key', ['build_files', 'audit_files', 'test_files'])
def test_the_sparse_checkout_lists_equal_the_hand_lists(plan, key):
    assert sorted(set(plan[key])) == EXPECTED[key]
    assert len(plan[key]) == len(set(plan[key]))


def test_a_site_without_ci_is_not_published():
    for stem in ('yeast_phospho', 'methylarginine_ecod', 'methylarginine_interpro_ecod'):
        assert stem not in PUBLISHED


def test_the_order_is_unique(tmp_path):
    (tmp_path / 'sites').mkdir()
    for n in 'ab':
        (tmp_path / 'sites' / f'{n}.yaml').write_text('website: {ci: {order: 1}}\n')
    with pytest.raises(ValueError, match='not unique'):
        PLAN.published_sites(tmp_path)


def test_github_outputs_carry_paths_one_per_line_and_matrices_as_json(plan):
    text = PLAN.github_outputs(plan)
    block = re.search(r'build_files<<(EOF_\w+)\n(.*?)\n\1\n', text, re.S).group(2)
    assert block.split('\n') == plan['build_files']
    m = re.search(r'link_matrix<<(EOF_\w+)\n(.*)\n\1\n', text)
    assert json.loads(m.group(2)) == plan['link_matrix']


def test_the_workflows_use_the_plan_and_name_no_site():
    for name in ('pages.yml', 'tests.yml'):
        text = (WORKFLOWS / name).read_text()
        flow = yaml.safe_load(text)
        assert 'plan' in flow['jobs'] and 'tools/ci_plan.py --github-output' in text
        for job, body in flow['jobs'].items():
            if job in ('plan', 'data-pin', 'lint', 'report', 'deploy'):
                continue
            assert 'plan' in ([body['needs']] if isinstance(body['needs'], str) else body['needs']), (name, job)
        assert not re.search(r'^            (inputs|releases)/', text, re.M), f'{name}: a hand-written sparse path'
    pages = yaml.safe_load((WORKFLOWS / 'pages.yml').read_text())['jobs']
    assert pages['build']['strategy']['matrix'] == '${{ fromJSON(needs.plan.outputs.pages_matrix) }}'
    tests = yaml.safe_load((WORKFLOWS / 'tests.yml').read_text())['jobs']
    assert tests['link-audit']['strategy']['matrix'] == '${{ fromJSON(needs.plan.outputs.link_matrix) }}'
    assert tests['export-audits']['strategy']['matrix'] == '${{ fromJSON(needs.plan.outputs.export_matrix) }}'
    want = {
        ('pages', 'build'): 'build_files',
        ('tests', 'test'): 'test_files',
        ('tests', 'link-audit'): 'audit_files',
        ('tests', 'export-audits'): 'audit_files',
    }
    for (wf, job), key in want.items():
        jobs = pages if wf == 'pages' else tests
        sparse = [
            s['with']['sparse-checkout'] for s in jobs[job]['steps'] if 'sparse-checkout' in (s.get('with') or {})
        ]
        assert sparse == ['${{ needs.plan.outputs.%s }}' % key], (wf, job)
    assert 'needs.plan.outputs.pages_sites' in (WORKFLOWS / 'pages.yml').read_text()


def test_the_pages_and_audit_steps_read_each_sites_parameters_from_the_matrix():
    pages = (WORKFLOWS / 'pages.yml').read_text()
    assert 'matrix.lower' in pages and 'phospho|lysine' not in pages
    tests = (WORKFLOWS / 'tests.yml').read_text()
    for field in ('matrix.workers', 'matrix.budget', 'matrix.proteins', 'matrix.selection'):
        assert field in tests


def test_the_sparse_lists_are_deterministic_and_use_the_pin_release(plan):
    pin = json.loads((REPO / 'data_pin.json').read_text())
    assert f'releases/{pin["release"]}/release.json' in plan['audit_files']
    assert f'releases/{pin["release"]}/release.json' not in plan['build_files']
