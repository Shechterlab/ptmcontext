"""What ptmc run keeps for the website (marks.attributes) and what ptmc web hands the browser (selection.json), on
small tables: the right row, the right separator, values and links aligned, and the site file's cross-references."""
from __future__ import annotations

import copy
from pathlib import Path

import pandas as pd
import pytest

from ptmcontext import site as S
from ptmcontext.web import selection_data

SITES = Path(__file__).resolve().parents[1] / 'sites'


def _spec(**attrs):
    return {'accession': 'acc', 'position': 'pos', 'exclude': [{'column': 'flag', 'equals': 'drop'}], 'attributes': attrs}


def test_mark_attributes_take_the_kept_row_and_keep_counts():
    table = pd.DataFrame({'acc': ['P1', 'P1', 'P2'], 'pos': ['5', '5', '9'], 'flag': ['drop', '', ''],
                          'state': ['FROM_EXCLUDED_ROW', 'Rme2', 'Rme1'], 'st': ['A|B', 'C', 'A'], 'doi': ['1|2', '3', '1']})
    marked = pd.DataFrame({'accession': ['P1', 'P2'], 'position': [5, 9]})
    spec = _spec(state={'column': 'state', 'label': 'State', 'kind': 'category'},
                 studies={'column': 'st', 'label': 'Studies', 'kind': 'list', 'separator': '|', 'link': {'column': 'doi', 'url': 'https://doi.org/{}'}})
    out = S.mark_attributes(spec, table, marked)
    assert len(out) == len(marked)                       # one row per counted mark: nothing added, nothing dropped
    assert out.set_index('accession').loc['P1', 'a.state'] == 'Rme2'
    assert out.set_index('accession').loc['P1', 'a.studies'] == 'C'
    assert list(out.columns) == ['accession', 'position', 'a.state', 'a.studies', 'a.studies.link']


@pytest.mark.parametrize('name', ['studies.link', '2', 'a-b', ''])
def test_mark_attribute_names_are_plain(name):
    table = pd.DataFrame({'acc': ['P1'], 'pos': ['5'], 'flag': [''], 'x': ['v']})
    with pytest.raises(ValueError):
        S.mark_attributes(_spec(**{name: {'column': 'x', 'label': 'X', 'kind': 'category'}}), table, pd.DataFrame({'accession': ['P1'], 'position': [5]}))


def test_selection_data_splits_on_each_attributes_separator(tmp_path):
    pd.DataFrame({'accession': ['P1', 'P1', 'P2'], 'position': [5, 7, 9], 'residue': ['R'] * 3, 'window_15': ['A' * 15] * 3,
                  'motif': ['RGG;GAR', '', 'RGG'], 'a.state': ['Rme2', 'Rme1', ''],
                  'a.studies': ['S1|S2', 'S2', 'S1'], 'a.studies.link': ['10.1/a|10.1/b', '10.1/b', '10.1/a']}
                 ).to_csv(tmp_path / 'marks.tsv', sep='\t', index=False)
    pd.DataFrame({'accession': ['P1', 'P1', 'P2'], 'analysis': ['motif'] * 3, 'category': ['RGG', 'GAR', 'RGG'],
                  'marks_in': [1, 1, 1], 'others_in': [3, 0, 2], 'marks_total': [2, 2, 1], 'others_total': [10, 10, 4]}
                 ).to_csv(tmp_path / 'protein_counts.tsv', sep='\t', index=False)
    listing = [['P1', 'G1', 'n', 100, 2, 12], ['P2', 'G2', 'n', 50, 1, 5]]
    specs = {'state': {'kind': 'category'}, 'studies': {'kind': 'list', 'separator': '|'}}
    d = selection_data(tmp_path, listing, ['motif'], specs)
    assert d['attribute_names'] == ['state', 'studies']
    assert d['attributes']['studies'] == ['S1', 'S2']
    assert d['attribute_links']['studies'] == {'S1': '10.1/a', 'S2': '10.1/b'}
    # each mark's codes decode back to its own values, in the order the table gives them
    for row, (_, m) in zip(d['marks'], pd.read_csv(tmp_path / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False).iterrows()):
        assert [d['attributes']['studies'][k] for k in row[3][1]] == m['a.studies'].split('|')
        assert [d['classes']['motif'][k] for k in row[2][0]] == (m['motif'].split(';') if m['motif'] else [])
    assert d['others_total'] == [10, 4]                 # candidates − marks, per protein
    assert d['others']['motif'] == {0: {d['classes']['motif'].index('RGG'): 3}, 1: {d['classes']['motif'].index('RGG'): 2}}


def test_website_cross_references():
    site = S.load_site(SITES / 'methylarginine.yaml')
    assert S.website_problems(site) == []
    bad = copy.deepcopy(site)
    bad['website']['filters'].append({'name': 'Broken', 'analyses': ['no_such_analysis'], 'attributes': ['no_such_attribute']})
    bad['website']['overview']['sections'][0]['cards'].append('missing_card')
    bad['website']['stats'].append({'attribute': 'state', 'label': 'states'})       # a category, not a list
    bad['website']['examples'].append('nokey:value')
    problems = S.website_problems(bad)
    for word in ('no_such_analysis', 'no_such_attribute', 'missing_card', "'state' is not a list", 'nokey:value'):
        assert any(word in p for p in problems), (word, problems)
