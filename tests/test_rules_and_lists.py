"""Sets made by rules on a table's columns, rows in a given order, and residue questions on lists of residues counted
only on the proteins a table lists: small tables built by hand, with the answers worked out on paper."""
import json
from pathlib import Path

import pandas as pd
import pytest
from scipy.stats import fisher_exact, hypergeom

from ptmcontext import layers as L
from ptmcontext import residue_tests as RT
from ptmcontext import set_tests as T
from ptmcontext import site as S
from ptmcontext.profile import load_profile
from ptmcontext.snapshot import Snapshot


def write(path: Path, rows: list[list[str]]) -> Path:
    path.write_text('\n'.join('\t'.join(r) for r in rows) + '\n')
    return path


# ---- sets by rules ---------------------------------------------------------------------------------------------------

RULES = [{'set': 'common', 'when': [{'column': 'essential', 'equals': 'True'}]},
         {'set': 'most', 'when': [{'ratio': ['dependent', 'lines'], 'at_least': 0.5}]},
         {'set': 'some', 'when': [{'ratio': ['dependent', 'lines'], 'at_least': 0.05}]},
         {'set': 'few'}]


@pytest.fixture()
def genes(tmp_path):
    # P1 is essential though every line depends on it (the first rule wins); P3 sits on the threshold (at_least: in);
    # P6 has no screened line (no share: no numeric rule holds, so the last rule takes it); P1-2 is an isoform of P1
    return {'genes': write(tmp_path / 'genes.tsv', [['acc', 'essential', 'dependent', 'lines'],
                                                    ['P1', 'True', '10', '10'], ['P2', 'False', '6', '10'], ['P3', 'False', '5', '10'],
                                                    ['P4', 'False', '1', '10'], ['P5', 'False', '0', '10'], ['P6', 'False', '3', '0'],
                                                    ['P1-2', 'False', '0', '10']])}


def rule_spec(**kw):
    return {'id': 'dep', 'test': 'protein_sets', 'whole_universe': True,
            'sets': {'input': 'genes', 'protein': 'acc', 'rules': RULES}, **kw}


def test_rules_place_each_row_in_the_first_set_that_holds(genes):
    pairs, names, annotated = T.read_sets(rule_spec(), genes)
    got = {s: set(g) for s, g in pairs.groupby('set')['protein']}
    # the isoform's row counts for its entry: P1 is also in few
    assert got == {'common': {'P1'}, 'most': {'P2', 'P3'}, 'some': {'P4'}, 'few': {'P5', 'P6', 'P1'}}
    assert names == {} and annotated == {'P1', 'P2', 'P3', 'P4', 'P5', 'P6'}


def test_numeric_conditions_bound_a_half_open_interval(tmp_path):
    t = write(tmp_path / 'v.tsv', [['acc', 'v'], ['A', '0.19'], ['B', '0.2'], ['C', '0.79'], ['D', '0.8'], ['E', '']])
    spec = {'sets': {'input': 'v', 'protein': 'acc', 'rules': [
        {'set': 'high', 'when': [{'column': 'v', 'at_least': 0.8}]},
        {'set': 'mid', 'when': [{'column': 'v', 'at_least': 0.2, 'below': 0.8}]},
        {'set': 'low', 'when': [{'column': 'v', 'below': 0.2}]}]}}
    pairs, _, annotated = T.read_sets(spec, {'v': t})
    assert sorted(map(tuple, pairs.to_numpy())) == [('high', 'D'), ('low', 'A'), ('mid', 'B'), ('mid', 'C')]
    assert annotated == {'A', 'B', 'C', 'D', 'E'}           # E has no value: in no set, still in the table


def test_rule_sets_tested_and_ordered(genes, tmp_path):
    # background: the table's proteins P1-P6 (P7 and P8 are not in it); marked in it: P1, P2, P4 (n = 3, N = 6)
    marked, proteome = {'P1', 'P2', 'P4', 'P8'}, {f'P{i}' for i in range(1, 9)}
    rows, _ = T.protein_set_test(rule_spec(), genes, marked, proteome)
    # by p: common and some (p 0.5), most (0.8), then few (P1, through its isoform's row: k 1 of M 3, p 0.95)
    assert list(rows['category']) == ['common', 'some', 'most', 'few']
    assert rows.set_index('category').loc['few', 'p'] == pytest.approx(hypergeom.sf(0, 6, 3, 3))
    rows, _ = T.protein_set_test(rule_spec(order=[{'categories': ['common', 'most', 'some', 'few']}]), genes, marked, proteome)
    assert list(rows['category']) == ['common', 'most', 'some', 'few']
    most = rows.set_index('category').loc['most']
    assert (most['a'], most['b'], most['c'], most['d']) == (1, 2, 1, 2)
    assert most['fold_enrichment'] == pytest.approx((1 / 3) / (2 / 6))
    assert most['p'] == pytest.approx(hypergeom.sf(0, 6, 2, 3))


def test_check_names_columns_rules_read(genes):
    spec = rule_spec()
    spec['sets']['rules'] = [{'set': 'x', 'when': [{'ratio': ['dependent', 'nope'], 'at_least': 1}]}]
    assert T.spec_problems(spec, files=genes) == ["dep: role genes (genes.tsv) has no column ['nope']"]


# ---- residues listed in tables, on the proteins a table lists ----------------------------------------------------------

@pytest.fixture()
def lists(tmp_path):
    a = write(tmp_path / 'a.tsv', [['acc', 'pos', 'sample'], ['P1', '2', 's1'], ['P1', '2', 's2'], ['P1', '8', 's1'],
                                   ['P2', '4', 's1'], ['P3', '3', 's3'], ['P9', '1', 's1']])
    b = write(tmp_path / 'b.tsv', [['acc', 'pos'], ['P1', '5'], ['P2', '2']])
    g = write(tmp_path / 'g.tsv', [['acc', 'kept'], ['P1', 'yes'], ['P2', 'no'], ['P3', 'yes']])
    mapping = {'accession': 'acc', 'position': 'pos'}
    # arginines: P1 at 2, 5, 8; P2 at 2, 4; P3 at 2, 3 (both marked: no other arginine)
    snap = Snapshot({'P1': 'MRAARAAR', 'P2': 'MRARA', 'P3': 'MRR'})
    ctx = L.Context(snap, load_profile('methylarginine'), {'in_a': a, 'in_b': b, 'genes': g},
                    formats={str(a): mapping, str(b): mapping})
    marks = pd.DataFrame({'accession': ['P1', 'P1', 'P2', 'P3', 'P3'], 'position': [2, 5, 2, 2, 3]})
    return ctx, marks


def lists_layer():
    return L.get('residue_lists', None, {'flags': {'in_a': 'in_a', 'in_b': 'in_b'}, 'noun': 'listed arginine'}, 'listed')


def test_a_residue_is_flagged_by_each_list_that_names_it(lists):
    ctx, _ = lists
    res = ctx.snapshot.residues(['R'])
    got = lists_layer()(res, ctx)
    flagged = {(a, p, f) for (a, p), row in zip(zip(res['accession'], res['position']), got.to_dict('records')) for f, v in row.items() if v}
    assert list(got.columns) == ['in_a', 'in_b']             # in the order given
    assert flagged == {('P1', 2, 'in_a'), ('P1', 8, 'in_a'), ('P2', 4, 'in_a'), ('P3', 3, 'in_a'), ('P1', 5, 'in_b'), ('P2', 2, 'in_b')}


def test_only_listed_proteins_and_their_lone_marks_count(lists):
    ctx, marks = lists
    only = S.listed_proteins({'input': 'genes', 'column': 'acc', 'include': [{'column': 'kept', 'equals': 'yes'}]}, ctx)
    assert only == {'P1', 'P3'}
    rows = RT.residue_test(ctx, marks, lists_layer(), 'listed', proteins=only, alone='count', order=[{'categories': ['in_a', 'in_b']}],
                           pooled_label=' that a table lists').set_index(['method', 'category'])
    # marks: P1 R2 (a), P1 R5 (b), P3 R2, P3 R3 (a); the other arginine: P1 R8 (a). P2 is not counted
    assert tuple(rows.loc[('fisher', 'in_a'), ['a', 'b', 'c', 'd']]) == (2, 2, 1, 0)
    assert tuple(rows.loc[('fisher', 'in_b'), ['a', 'b', 'c', 'd']]) == (1, 3, 0, 1)
    assert rows.loc[('fisher', 'in_a'), 'odds_ratio'] == pytest.approx(2.5 * 0.5 / (2.5 * 1.5))
    assert rows.loc[('fisher', 'in_a'), 'p'] == pytest.approx(fisher_exact([[2, 2], [1, 0]]).pvalue)
    assert rows.loc[('fisher', 'in_a'), 'background'] == 'other arginines of the methylated proteins that a table lists'
    # within protein: the same counts; P3's table (marks only) is not informative, so one stratum is used
    assert tuple(rows.loc[('mantel_haenszel', 'in_a'), ['a', 'b', 'c', 'd']]) == (2, 2, 1, 0)
    assert rows.loc[('mantel_haenszel', 'in_a'), 'n_strata'] == 1
    assert rows.loc[('mantel_haenszel', 'in_a'), 'background'] == 'other arginines of the same protein, each protein a stratum'


def test_lone_marks_dropped_by_default_and_rows_ordered(lists):
    ctx, marks = lists
    rows = RT.residue_test(ctx, marks, lists_layer(), 'listed', proteins={'P1', 'P3'})
    fisher = rows[rows['method'] == 'fisher']
    assert list(fisher['category']) == ['in_b', 'in_a']     # by odds ratio unless an order is given
    assert tuple(fisher.set_index('category').loc['in_a', ['a', 'b', 'c', 'd']]) == (1, 1, 1, 0)
    ordered = RT.residue_test(ctx, marks, lists_layer(), 'listed', proteins={'P1', 'P3'}, order=[{'categories': ['in_a']}])
    assert list(ordered['category']) == ['in_a', 'in_b', 'in_a', 'in_b']


def test_a_list_needs_its_column_mapping(lists, tmp_path):
    ctx, _ = lists
    ctx.inputs['bare'] = write(tmp_path / 'bare.tsv', [['acc', 'pos'], ['P1', '2']])
    with pytest.raises(ValueError, match='column mapping'):
        ctx.listed('bare')
    with pytest.raises(ValueError, match='flags'):
        L.get('residue_lists', None, {'flags': ['in_a']}, 'x')


def test_check_names_a_proteins_role_the_site_does_not_fill():
    site = {'inputs': {'in_a': 'x'}, 'analyses': [{'id': 'q', 'layer': 'residue_lists', 'with': {'flags': {'f': 'in_a'}},
                                                     'proteins': {'input': 'genes', 'column': 'acc'}}]}
    assert S.roles_missing(site) == ["q: proteins: reads role 'genes', which inputs: does not fill"]


def test_selection_data_says_which_proteins_a_question_counts(tmp_path):
    from ptmcontext.web import selection_data
    write(tmp_path / 'marks.tsv', [['accession', 'position', 'residue', 'window_15', 'listed'], ['P1', '2', 'R', 'x', 'in_a'],
                                   ['P2', '2', 'R', 'x', '']])
    write(tmp_path / 'protein_counts.tsv', [['accession', 'analysis', 'category', 'marks_in', 'others_in', 'marks_total', 'others_total'],
                                            ['P1', 'listed', 'in_a', '1', '1', '1', '2']])
    (tmp_path / 'run.json').write_text(json.dumps({'analyses': {'listed': {'proteins': {'not_counted': ['P2']}, 'marks_alone': 'count'}}}))
    listing = [['P1', 'G1', 'n', 8, 1, 3, ''], ['P2', 'G2', 'n', 5, 1, 2, '']]
    sd = selection_data(tmp_path, listing, ['listed'])
    assert sd['counted'] == {'listed': {'skip': [1], 'alone': True}}
