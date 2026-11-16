"""The workflows check out PTM_Pipeline at a pinned commit: actions/checkout takes a branch, a tag or a full hash only."""

import pathlib
import re

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_pinned_checkouts_use_full_hashes():
    for wf in sorted((ROOT / '.github' / 'workflows').glob('*.yml')):
        for job in (yaml.safe_load(wf.read_text()).get('jobs') or {}).values():
            for step in job.get('steps') or []:
                if str(step.get('uses', '')).startswith('actions/checkout') and 'repository' in (
                    step.get('with') or {}
                ):
                    ref = str(step['with'].get('ref', ''))
                    if re.fullmatch(r'[0-9a-f]{4,39}', ref):
                        raise AssertionError(f'{wf.name}: short hash {ref!r}; use the full 40-character hash')


def test_every_action_has_a_version():
    """Each `uses:` names a version (a tag such as v5, or a full hash), never a bare action."""
    for wf in sorted((ROOT / '.github' / 'workflows').glob('*.yml')):
        for job in (yaml.safe_load(wf.read_text()).get('jobs') or {}).values():
            for step in job.get('steps') or []:
                uses = str(step.get('uses', ''))
                if uses:
                    assert re.search(r'@(v\d+(\.\d+)*|[0-9a-f]{40})$', uses), (
                        f'{wf.name}: {uses!r} has no pinned version'
                    )


def test_lint_job_checks_commit_messages():
    wf = yaml.safe_load((ROOT / '.github' / 'workflows' / 'tests.yml').read_text())
    steps = wf['jobs']['lint']['steps']
    assert steps[0]['uses'].startswith('actions/checkout') and steps[0]['with']['fetch-depth'] == 0
    assert any('check_commit_messages.sh' in str(s.get('run', '')) for s in steps)


def test_commit_message_check_script(tmp_path):
    """A toy repository: a clean message passes; a Co-Authored-By: Claude or Claude-Session line, in any case, fails."""
    import subprocess

    def git(*a):
        return subprocess.run(['git', *a], cwd=tmp_path, check=True, capture_output=True, text=True).stdout.strip()

    git('init', '-q')
    git('config', 'user.name', 't')
    git('config', 'user.email', 't@example.org')
    git('commit', '-q', '--allow-empty', '-m', 'base')
    base = git('rev-parse', 'HEAD')
    script = ROOT / 'tools' / 'check_commit_messages.sh'

    def run():
        return subprocess.run([str(script), base], cwd=tmp_path, capture_output=True, text=True).returncode

    git('commit', '-q', '--allow-empty', '-m', 'plain\n\nA body.')
    assert run() == 0
    git('commit', '-q', '--allow-empty', '-m', 'x\n\nco-authored-by: CLAUDE <n@example.org>')
    assert run() == 1
    git('reset', '-q', '--hard', 'HEAD~1')
    git('commit', '-q', '--allow-empty', '-m', 'x\n\nclaude-session: https://example.org/s')
    assert run() == 1
