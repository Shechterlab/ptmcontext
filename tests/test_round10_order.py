"""Round 10, order: the owner's order of groups on the filter rail, the Compare page, Methods, Interactions, the Overview
of lysine, the site card and Help."""

from __future__ import annotations

from pathlib import Path

import yaml
from test_context_marks import ENTRY, _site, table  # noqa: F401

from ptmcontext import context_marks as CM

ROOT = Path(__file__).resolve().parents[1]
HUMAN = ('methylarginine', 'methyllysine', 'lysine', 'phospho')
RAIL_FIRST = ['Localization', 'Disease associations and mutations', 'Classes and pathways']


def site(name: str) -> dict:
    return yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())


def test_a_filters_group_of_the_context_name_holds_its_place(table):  # noqa: F811
    s = _site()
    s['website']['filters'] = [{'name': 'Other modifications'}, {'name': 'Last', 'analyses': []}]
    w = CM.expand(s)['website']
    assert [g['name'] for g in w['filters']] == ['Other modifications', 'Last']
    assert w['filters'][0]['attributes'] == ['ctx_near_phos']


def test_every_explorer_lists_the_filter_groups_in_the_owner_order():
    for n in HUMAN:
        names = [g['name'] for g in site(n)['website']['filters']]
        assert names[: len(RAIL_FIRST)] == RAIL_FIRST, n
        assert names[-1] in ('Studies and databases', 'Databases'), n
        assert 'Disease associations and variants' not in names
        assert names.index('Other modifications') < names.index('Sequence motif'), n
        assert names.index('Sequence motif') < names.index('Structural context'), n


def test_compare_lists_its_groups_in_the_owner_order():
    ids = [g['id'] for g in yaml.safe_load((ROOT / 'sites' / 'landing.yml').read_text())['compare']['groups']]
    assert ids == ['cell', 'disease', 'panther', 'condensates', 'nucleic', 'disorder', 'motifs']


def test_methods_lists_the_questions_in_the_overview_order_with_controls_last():
    js = (ROOT / 'ptmcontext' / 'web' / 'assets' / 'kit.js').read_text()
    assert 'const methodOrder = () =>' in js
    assert 'methodOrder().map(questionMethod)' in js and '...methodOrder().map((a) => [`m-q-${a.id}`' in js
    assert 'D.analyses.map(questionMethod)' not in js
    assert 'a.control_of ? 2e6 : 0' in js
