"""Protein-set questions whose table's rows are kept by other tables (where), whose members are brought to current
entries through an accession history (history), whose rows have an order of their own (order), and whose memberships
carry a score for the website's filter (scores): a small proteome built by hand, with the answer worked out on paper.

    snapshot   P1 ... P8;  marked proteins P1, P3, P5
    members    C1: P5, P6, M1       C2: P1, P2, Q9, X1, P4-2      C3: P1, P7      C4: P8      C5: P5
    proteins   human: P1, P2-3 (an isoform: P2 counts), Q9, X1, P4, P5, P6, P7, P8; mouse: M1
    condensates  C1, C2, C5 human and biomolecular; C3 human but synthetic; C4 mouse
    history    secondary Q9 -> P3; X1 -> P5 and X1 -> P6 (two entries: dropped); synonym Q9 -> P8 (not read)

so C1 = {P5, P6} (M1 is a mouse protein), C2 = {P1, P2, P3, P4} (Q9 is P3, X1 has no one entry, P4-2 is P4), C5 = {P5};
C3 and C4 are not kept. The proteins in any set: P1 ... P6.
"""
from pathlib import Path

import pandas as pd
import pytest
from scipy.stats import hypergeom

from ptmcontext import set_tests as T

SNAPSHOT = {f'P{i}' for i in range(1, 9)}
MARKED = {'P1', 'P3', 'P5'}


def write(path: Path, rows: list[list[str]], sep: str = '\t') -> Path:
    path.write_text('\n'.join(sep.join(r) for r in rows) + '\n')
    return path


@pytest.fixture()
def tables(tmp_path):
    paths = {
        'members': write(tmp_path / 'members.tsv', [['acc', 'cond'], ['P5', 'C1'], ['P6', 'C1'], ['M1', 'C1'],
                                                    ['P1', 'C2'], ['P2', 'C2'], ['Q9', 'C2'], ['X1', 'C2'], ['P4-2', 'C2'],
                                                    ['P1', 'C3'], ['P7', 'C3'], ['P8', 'C4'], ['P5', 'C5']]),
        'proteins': write(tmp_path / 'proteins.csv', [['uid', 'species'], ['P1', 'Homo sapiens'], ['P2-3', 'Homo sapiens'],
                                                      ['Q9', 'Homo sapiens'], ['X1', 'Homo sapiens'], ['P4', 'Homo sapiens'],
                                                      ['P5', 'Homo sapiens'], ['P6', 'Homo sapiens'], ['M1', 'Mus musculus'],
                                                      ['P7', 'Homo sapiens'], ['P8', 'Homo sapiens']], sep=','),
        'condensates': write(tmp_path / 'condensates.csv', [['uid', 'name', 'species', 'type'],
                                                            ['C1', '"Beta granules, small"', 'Homo sapiens', 'biomolecular'],
                                                            ['C2', 'Alpha bodies', 'Homo sapiens', 'biomolecular'],
                                                            ['C3', 'Synthetic one', 'Homo sapiens', 'synthetic'],
                                                            ['C4', 'Mouse bodies', 'Mus musculus', 'biomolecular'],
                                                            ['C5', 'Gamma speckles', 'Homo sapiens', 'biomolecular']], sep=','),
        'history': write(tmp_path / 'history.tsv', [['kind', 'key', 'accession'], ['secondary', 'Q9', 'P3'], ['secondary', 'X1', 'P5'],
                                                    ['secondary', 'X1', 'P6'], ['synonym', 'Q9', 'P8']]),
        'scores': write(tmp_path / 'scores.tsv', [['cond', 'acc', 'score'], ['C2', 'P1', '4'], ['C2', 'P3', '2'], ['C2', 'Q9', '5'],
                                                  ['C1', 'P5', '3'], ['C9', 'P1', '5'], ['C1', 'P6', '']]),
    }
    formats = {str(paths['proteins']): {'sep': ','}, str(paths['condensates']): {'sep': ','}}
    return paths, formats


def spec(**kw):
    return {'id': 'cond', 'test': 'protein_sets', 'min_size': 1,
            'sets': {'input': 'members', 'set': 'cond', 'protein': 'acc',
                     'where': [{'column': 'acc', 'input': 'proteins', 'key': 'uid', 'include': [{'column': 'species', 'equals': 'Homo sapiens'}]},
                               {'column': 'cond', 'input': 'condensates', 'key': 'uid', 'include': [{'column': 'species', 'equals': 'Homo sapiens'}],
                                'exclude': [{'column': 'type', 'equals': 'synthetic'}]}],
                     'history': {'input': 'history', 'from': 'key', 'to': 'accession', 'include': [{'column': 'kind', 'equals': 'secondary'}]}},
            'names': {'input': 'condensates', 'set': 'uid', 'name': 'name'}, **kw}


def test_where_and_history_keep_the_members_worked_out_by_hand(tables):
    paths, formats = tables
    pairs, names, annotated = T.read_sets(spec(), paths, SNAPSHOT, formats=formats)
    got = pairs.groupby('set')['protein'].agg(lambda x: sorted(set(x))).to_dict()
    assert got == {'C1': ['P5', 'P6'], 'C2': ['P1', 'P2', 'P3', 'P4'], 'C5': ['P5']}
    assert annotated == {'P1', 'P2', 'P3', 'P4', 'P5', 'P6'}
    assert names['C1'] == 'Beta granules, small'            # a comma-separated file, its quotes read as such
    # without the history, Q9 and X1 are not entries but stay members; without where, M1, C3 and C4 come back
    no_hist = spec()
    no_hist['sets'].pop('history')
    assert {'Q9', 'X1'} <= set(T.read_sets(no_hist, paths, SNAPSHOT, formats=formats)[0]['protein'])
    no_where = spec()
    no_where['sets'].pop('where')
    assert set(T.read_sets(no_where, paths, SNAPSHOT, formats=formats)[0]['set']) == {'C1', 'C2', 'C3', 'C4', 'C5'}


def test_against_the_proteins_in_any_set_and_in_the_order_asked(tables):
    paths, formats = tables
    order = [{'by': 'fold_enrichment', 'descending': True}, {'by': 'a', 'descending': True}]
    rows, names = T.protein_set_test(spec(order=order), paths, MARKED, SNAPSHOT, formats=formats)
    # background: P1 ... P6 (N = 6), marked P1, P3, P5 (n = 3)
    #   C5 {P5}            k 1, M 1   fold (1/3)/(1/6) = 2   p = P(X >= 1 | 6, 1, 3) = 3/6
    #   C2 {P1 P2 P3 P4}   k 2, M 4   fold (2/3)/(4/6) = 1   p = (C(4,2)C(2,1) + C(4,3)) / C(6,3) = 16/20
    #   C1 {P5 P6}         k 1, M 2   fold (1/3)/(2/6) = 1   p = 1 - C(4,3)/C(6,3) = 16/20
    # by p then name: C5, C1, C2; by fold, then marked members: C5, C2, C1
    e = rows[rows['method'] == 'enricher']
    assert list(e['category']) == ['C5', 'C2', 'C1']
    assert [tuple(r) for r in e[['a', 'b', 'c', 'd']].itertuples(index=False)] == [(1, 2, 0, 3), (2, 1, 2, 1), (1, 2, 1, 2)]
    assert list(e['fold_enrichment']) == pytest.approx([2, 1, 1])
    assert list(e['p']) == pytest.approx([0.5, 0.8, 0.8])
    assert list(e['p']) == pytest.approx([hypergeom.sf(0, 6, 1, 3), hypergeom.sf(1, 6, 4, 3), hypergeom.sf(0, 6, 2, 3)])
    assert names['C2'] == 'Alpha bodies'
    default, _ = T.protein_set_test(spec(), paths, MARKED, SNAPSHOT, formats=formats)
    assert list(default['category']) == ['C5', 'C1', 'C2']


def test_against_the_proteome(tables):
    paths, formats = tables
    rows, _ = T.protein_set_test(spec(universe='snapshot', whole_universe=True), paths, MARKED, SNAPSHOT, formats=formats)
    # background: P1 ... P8 (N = 8); C2: k 2, M 4, so a, b, c, d = 2, 1, 2, 3 and p = (24 + 4) / 56
    c2 = rows.set_index('category').loc['C2']
    assert (c2['a'], c2['b'], c2['c'], c2['d']) == (2, 1, 2, 3)
    assert c2['fold_enrichment'] == pytest.approx((2 / 3) / (4 / 8))
    assert c2['p'] == pytest.approx(28 / 56)


def test_fold_enrichment_ties_are_exact():
    # 4 of 6 and 14 of 21 members marked, among 2,015 of 4,023: the same fold, one ulp apart in floating point
    a, b = (4 / 2015) / (6 / 4023), (14 / 2015) / (21 / 4023)
    assert a != b
    rows = pd.DataFrame({'category': ['small', 'large'], 'a': [4, 14], 'b': [2011, 2001], 'c': [2, 7], 'd': [2006, 2001],
                         'fold_enrichment': [a, b], 'p': [0.35, 0.095]})
    out = T.ordered(rows, [{'by': 'fold_enrichment', 'descending': True}, {'by': 'a', 'descending': True}])
    assert list(out['category']) == ['large', 'small']
    with pytest.raises(ValueError):
        T.ordered(rows, [{'by': 'odds'}])


def test_what_the_website_keeps_for_the_filters(tables):
    paths, formats = tables
    s = spec(min_size=2, filter={'label': 'Condensate', 'any': 'In any condensate', 'sets': 'all'},
             scores={'input': 'scores', 'set': 'cond', 'protein': 'acc', 'value': 'score', 'label': 'Confidence', 'levels': [2, 3, 4, 5], 'max': 5})
    keep = {}
    rows, _ = T.protein_set_test(s, paths, MARKED, SNAPSHOT, keep=keep, formats=formats)
    assert set(rows['category']) == {'C1', 'C2'}                 # C5 has one member: not tested
    assert keep['marked_in_any'] == ['P1', 'P3', 'P5']
    assert keep['filter_sets'] == {'C5': {'name': 'Gamma speckles', 'marked': ['P5']}}   # offered by the filter
    # scores: Q9 is P3, so P3 has 2 and 5 in C2 and keeps 5; C9 is no set of the source; P6 is not marked, and has none
    assert keep['scores']['sets'] == {'C2': {'P1': 4, 'P3': 5}, 'C1': {'P5': 3}}
    assert keep['scores']['any'] == {'P1': 4, 'P3': 5, 'P5': 3}
    assert T.membership_scores(s, paths, SNAPSHOT, formats)['C9'] == {'P1': 5}


def test_check_names_what_is_wrong(tables):
    paths, formats = tables
    assert not T.spec_problems(spec(), files=paths, formats=formats)
    bad = spec(order=[{'by': 'odds'}], identifiers={'map': [{'input': 'history', 'from': 'key', 'to': 'accession'}]})
    bad['sets']['where'][0]['key'] = 'accession'
    problems = T.spec_problems(bad, files=paths, formats=formats)
    assert any('order by' in p for p in problems)
    assert any('history' in p and 'other identifiers' in p for p in problems)
    assert any("role proteins (proteins.csv) has no column ['accession']" in p for p in problems)
    with pytest.raises(ValueError):
        T.protein_set_test(bad, paths, MARKED, SNAPSHOT, formats=formats)
    assert T.roles_of(spec()) == ['members', 'proteins', 'condensates', 'history']
    assert T.question_roles(spec()) == ['members', 'proteins', 'condensates']
