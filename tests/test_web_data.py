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


def test_left_out_sites_count_on_neither_side(tmp_path):
    """A pending site (marks.left_out) is neither a mark nor one of the other residues; an excluded row's residue is."""
    from ptmcontext import layers as L
    from ptmcontext import residue_tests as RT
    from ptmcontext.profile import load_profile
    from ptmcontext.snapshot import Snapshot
    snap = Snapshot({'P1': 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'})
    mob = tmp_path / 'mobidb.tsv'
    pd.DataFrame({'canonical_UniProtAC': ['P1'], 'fragment_start': [1], 'fragment_end': [12]}).to_csv(mob, sep='\t', index=False)
    ctx = L.Context(snap, load_profile('methylarginine'), {'disorder': mob})
    table = pd.DataFrame({'acc': ['P1', 'P1', 'P1'], 'pos': ['2', '5', '11'], 'flag': ['', 'pending', 'dropped']})
    spec = {'accession': 'acc', 'position': 'pos', 'left_out': [{'column': 'flag', 'equals': 'pending'}],
            'exclude': [{'column': 'flag', 'equals': 'dropped'}]}
    marked, report = S.select_marks(spec, table, snap, ctx.profile)
    pending = S.left_out_marks(spec, table)
    assert list(marked['position']) == [2] and list(pending['position']) == [5]
    f = RT.residue_test(ctx, marked, 'disorder', 'disorder', left_out=pending)
    row = f[(f['method'] == 'fisher') & (f['category'] == 'disordered')].iloc[0]
    # R at 2 (marked) | 5 (pending: on neither side) | 11 (excluded row: an other residue), 22, 32, 43
    assert (row['a'], row['c']) == (1, 1) and row['a'] + row['b'] + row['c'] + row['d'] == 5


def test_header_names_the_reporting_studies_most_marks_first(tmp_path):
    from ptmcontext.web import reporters
    pd.DataFrame({'accession': ['P1', 'P1', 'P2'], 'position': [1, 2, 3],
                  'a.studies': ['S1; DB', 'DB', 'DB; S2'], 'a.studies.link': ['10.1/s1; 10.1/db', '10.1/db', '10.1/db; 10.1/s2']}
                 ).to_csv(tmp_path / 'marks.tsv', sep='\t', index=False)
    site = {'marks': {'attributes': {'studies': {'column': 'studies', 'label': 'Studies', 'kind': 'list', 'separator': '; ',
                                                 'link': {'column': 'dois', 'url': 'https://doi.org/{}'}, 'values': {'DB': 'A Database'}}}},
            'website': {'stats': ['marks', {'attribute': 'studies', 'label': 'studies'}]}}
    r = reporters(site, tmp_path)
    assert r['label'] == 'Studies' and r['url'] == 'https://doi.org/{}'
    assert r['items'] == [['DB', 'A Database', '10.1/db', 3], ['S1', 'S1', '10.1/s1', 1], ['S2', 'S2', '10.1/s2', 1]]


def test_compare_stratify_must_name_a_list_attribute():
    site = S.load_site(SITES / 'methylarginine.yaml')
    assert site['website']['compare']['stratify'] == 'studies' and S.website_problems(site) == []
    bad = copy.deepcopy(site)
    bad['website']['compare']['stratify'] = 'state'
    assert any('website.compare.stratify' in p for p in S.website_problems(bad))


def test_attribute_present_and_pair_with():
    """present: whether a column holds anything; pair_with: two lists in step become '<value>:<partner>'."""
    table = pd.DataFrame({'acc': ['P1', 'P1'], 'pos': ['5', '9'], 'flag': ['', ''],
                          'changes': ['R5C; R5H', ''], 'pert': ['ko_a; kd_b', ''], 'call': ['decreased; no_change', '']})
    marked = pd.DataFrame({'accession': ['P1', 'P1'], 'position': [5, 9]})
    spec = _spec(changed={'column': 'changes', 'label': 'Changed', 'kind': 'category', 'present': True},
                 changes={'column': 'changes', 'label': 'Changes', 'kind': 'list'},
                 pert={'column': 'pert', 'label': 'Perturbations', 'kind': 'list', 'pair_with': 'call'})
    out = S.mark_attributes(spec, table, marked).set_index('position')
    assert list(out['a.changed']) == ['yes', 'no']
    assert out.loc[5, 'a.changes'] == 'R5C; R5H'                  # the column itself is still read as it is
    assert out.loc[5, 'a.pert'] == 'ko_a:decreased; kd_b:no_change' and out.loc[9, 'a.pert'] == ''
    bad = table.assign(call=['decreased', ''])
    with pytest.raises(ValueError, match='pair_with'):
        S.mark_attributes(spec, bad, marked)


def test_ordered_classes_and_their_groups_reach_the_website():
    from ptmcontext import layers as L
    from ptmcontext.web import _class_order
    words = S.layer_words(L.BUILT_IN['structure_context'])
    assert words['ordered'] and list(words['labels'])[:2] == ['domain_folded', 'domain_disordered']
    assert [g['name'] for g in words['groups']] == ['In a domain', 'Outside domains']
    assert not S.layer_words(L.BUILT_IN['domain_class'])['ordered']
    # a run written before runs recorded the order takes the built-in layer's; the site file's own wins
    assert _class_order({'layer': 'structure_context'}, {})['ordered']
    assert _class_order({'layer': 'motif'}, {}) == {'ordered': False, 'groups': []}
    assert _class_order({'layer': 'structure_context', 'ordered': False, 'groups': []}, words) == {'ordered': False, 'groups': []}
    site = S.load_site(SITES / 'methylarginine.yaml')
    bad = copy.deepcopy(site)
    a = next(x for x in bad['analyses'] if x['id'] == 'structure_context')
    a['groups'] = [{'name': 'Inside', 'classes': ['domain_folded', 'no_such_class']}, {'name': 'Again', 'classes': ['domain_folded']}]
    problems = S.website_problems(bad)
    assert any('no_such_class' in p for p in problems) and any('more than one group' in p for p in problems), problems
