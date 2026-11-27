"""The published sites (those with website.ci), for tests that must hold on every site: a new explorer joins them by its site
file alone. PUBLISHED is their ids in CI's order; PLAN is tools/ci_plan.py's module."""

import importlib.util
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('ci_plan', REPO / 'tools' / 'ci_plan.py')
PLAN = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(PLAN)

PUBLISHED = [sid for sid, _, _ in PLAN.published_sites(REPO)]
