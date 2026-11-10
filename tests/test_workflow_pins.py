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
