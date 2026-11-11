"""Every site file loads with no duplicate key: PyYAML keeps the last of two equal keys without a word, so a merge that
writes a key twice would silently drop the first one."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.profile import load_profile

REPO = Path(__file__).resolve().parents[1]


class _StrictLoader(yaml.SafeLoader):
    """A safe loader that refuses a mapping with a key twice."""


def _mapping(loader, node, deep=False):
    seen = set()
    for k, _ in node.value:
        key = loader.construct_object(k, deep=deep)
        if key in seen:
            raise yaml.constructor.ConstructorError(None, None, f'duplicate key {key!r}', k.start_mark)
        seen.add(key)
    return yaml.SafeLoader.construct_mapping(loader, node, deep)


_StrictLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)

SITE_FILES = sorted(
    [*REPO.glob('sites/*.yaml'), *REPO.glob('sites/*.yml'), *REPO.glob('sites/marks/*.yaml')]
)


@pytest.mark.parametrize('path', SITE_FILES, ids=lambda p: p.name)
def test_site_file_has_no_duplicate_keys(path):
    yaml.load(path.read_text(), Loader=_StrictLoader)


def test_residue_names_are_plural_in_the_background_wording():
    profile = load_profile(REPO / 'sites' / 'marks' / 'phospho.yaml')
    assert profile.background('same_protein', 'ST') == (
        'other serines and threonines of the same protein, each protein a stratum'
    )
    assert profile.background('marked_proteins', 'Y') == 'other tyrosines of the phosphorylated proteins'
    # without letters the profile's own wording stays
    assert profile.background('same_protein') == (
        'other serines, threonines and tyrosines of the same protein, each protein a stratum'
    )


def test_any_of_row_condition_holds_when_one_part_does():
    frame = pd.DataFrame({'sources': ['UniProt; CPLM', 'CPLM', 'iPTMnet', 'Berryhill 2023']})
    cond = {
        'any_of': [
            {'column': 'sources', 'contains': 'UniProt'},
            {'column': 'sources', 'contains': 'iPTMnet'},
        ]
    }
    assert list(S._holds(frame, cond)) == [True, False, True, False]
    only = {'column': 'sources', 'equals': 'Berryhill 2023'}
    assert list(S._holds(frame, only)) == [False, False, False, True]


def test_note_numbers_come_from_the_statistics():
    stats = pd.DataFrame(
        [
            {'analysis': 'q_cplm', 'category': 'near', 'stratum': 'all', 'method': 'fisher', 'odds_ratio': 9.9, 'q': 0.5},
            {'analysis': 'q_cplm', 'category': 'near', 'stratum': 'all', 'method': 'mantel_haenszel', 'odds_ratio': 2.418, 'q': 0.001},
            {'analysis': 'q_b', 'category': 'near', 'stratum': 'all', 'method': 'mantel_haenszel', 'odds_ratio': 0.84, 'q': 0.4},
        ]
    )
    text = web.note_text('CPLM {or:q_cplm:near}; other {or:q_b:near} ({sig:q_b:near}), {sig:q_cplm:near}.', stats)
    assert text == 'CPLM 2.42x; other 0.84x (not significant), significant.'
    with pytest.raises(ValueError, match='no statistics row'):
        web.note_text('{or:missing:near}', stats)


def test_location_findings_skip_classes_that_are_not_compartments():
    import importlib

    G = importlib.import_module('ptmcontext.web.glance')

    analyses = [
        {'id': 'cell_hcm_domain', 'kind': 'residue', 'shape': 'class', 'labels': {}, 'title': 'Domains'},
        {'id': 'cell_chromatin', 'kind': 'residue', 'shape': 'class', 'labels': {}, 'title': 'Chromatin'},
    ]

    def row(aid, cat, orr, q=0.001, a=40):
        return {'analysis': aid, 'category': cat, 'method': 'mantel_haenszel', 'or': orr, 'odds_ratio': orr,
                'q': q, 'a': a, 'fold': None}

    rows = [row('cell_hcm_domain', '14-3-3 scaffold', 3.0), row('cell_hcm_domain', 'nucleolus', 1.5),
            row('cell_chromatin', 'ICP >= 0.8 (chromatin)', 1.3)]
    only = {'cell_hcm_domain', 'cell_chromatin'}
    free = G.findings(analyses, rows, None, only=only)
    assert free[0]['class'] == '14-3-3 scaffold'
    located = G.findings(
        analyses, rows, None, only=only,
        locations={'cell_hcm_domain': {'nucleolus'}, 'cell_chromatin': {'ICP >= 0.8 (chromatin)'}},
    )
    assert [f['class'] for f in located] == ['nucleolus', 'ICP >= 0.8 (chromatin)']
