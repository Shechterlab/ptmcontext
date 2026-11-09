"""Sets from per-protein calls (sets.member_when: every protein the source tests is background, members only where the
call holds), the same sets compared by size (sizes: Mann-Whitney U), reference rows excused with a reason, and a
release's per-protein denominators checked against protein_counts: small tables built by hand."""

import math
from pathlib import Path

import pandas as pd
from scipy.stats import hypergeom, mannwhitneyu

from ptmcontext import parity as P
from ptmcontext import set_tests as T
from ptmcontext import statistics as ST


def write(path: Path, rows: list[list[str]]) -> Path:
    path.write_text('\n'.join('\t'.join(r) for r in rows) + '\n')
    return path


# P1..P8 are each tested in compartments X and Y (map m); map n is another map the question leaves out
ROWS = [['acc', 'map', 'compartment', 'odds_ratio', 'gathers']]
OR = {'X': [4.0, 3.0, 2.5, 0.0, 2.0, 0.5, 1.0, 0.8], 'Y': [1.0, 1.1, 0.9, 1.2, 3.0, 2.0, 2.2, 4.0]}
CALL = {'X': {'P1', 'P2', 'P3', 'P5'}, 'Y': {'P5', 'P6', 'P7', 'P8'}}
for c in ('X', 'Y'):
    for i, v in enumerate(OR[c], start=1):
        ROWS.append([f'P{i}', 'm', c, str(v), 'true' if f'P{i}' in CALL[c] else 'false'])
ROWS.append(['P9', 'n', 'X', '9.0', 'true'])
MARKED = {'P1', 'P2', 'P3', 'P4', 'P9'}
SNAPSHOT = {f'P{i}' for i in range(1, 12)}


def spec(**kw):
    return {
        'id': 'calls',
        'test': 'protein_sets',
        'whole_universe': True,
        'min_size': 2,
        'sets': {
            'input': 'calls',
            'set': 'compartment',
            'protein': 'acc',
            'include': [{'column': 'map', 'equals': 'm'}],
            'member_when': [{'column': 'gathers', 'equals': 'true'}],
        },
        **kw,
    }


def test_member_when_keeps_every_tested_protein_in_the_background(tmp_path):
    paths = {'calls': write(tmp_path / 'calls.tsv', ROWS)}
    pairs, _, annotated = T.read_sets(spec(), paths)
    assert annotated == {f'P{i}' for i in range(1, 9)}  # P9 is on the other map only
    assert {s: set(g) for s, g in pairs.groupby('set')['protein']} == CALL
    rows, _ = T.protein_set_test(spec(), paths, MARKED, SNAPSHOT)
    x = rows[rows['category'] == 'X'].iloc[0]
    # 4 marked of 8 tested; X holds 4, 3 of them marked
    assert (x['a'], x['b'], x['c'], x['d']) == (3, 1, 1, 3)
    assert math.isclose(x['p'], hypergeom.sf(2, 8, 4, 4))


def test_sizes_compare_every_tested_proteins_value_called_or_not(tmp_path):
    paths = {'calls': write(tmp_path / 'calls.tsv', ROWS)}
    s = spec(sizes={'value': 'odds_ratio', 'log2': True, 'background': 'the log2 odds ratio of each other protein'})
    rows, _ = T.protein_set_test(s, paths, MARKED, SNAPSHOT)
    mw = rows[rows['method'] == 'mann_whitney'].set_index('category')
    assert list(mw.index) == ['X', 'Y']
    lg = lambda v: math.log2(v) if v > 0 else -math.inf  # noqa: E731
    for c in ('X', 'Y'):
        yes, no = [lg(v) for v in OR[c][:4]], [lg(v) for v in OR[c][4:]]
        assert (mw.loc[c, 'a'], mw.loc[c, 'c']) == (4, 4)
        assert mw.loc[c, 'p'] == float(mannwhitneyu(yes, no).pvalue)
    assert mw.loc['X', 'background'] == 'the log2 odds ratio of each other protein'


def test_an_excused_row_is_left_out_and_said_why():
    def row(cat, p):
        return {
            'analysis': 'q1',
            'category': cat,
            'stratum': 'all',
            'a': 1,
            'b': None,
            'c': 2,
            'd': None,
            'p': p,
            'q': p,
            'method': 'mann_whitney',
            'background': 'b',
            'n_strata': '',
        }

    mine = pd.DataFrame([row('A', 0.5), row('B', 0.25)])
    ref = pd.DataFrame([row('A', 0.5), row('B', 0.2)])
    ref = pd.DataFrame([dict(zip(ST.NAMES, line.split('\t'))) for line in ST.lines(ref)])
    assert not P.compare(mine, ref, 'q1')[0].equal
    r = P.compare(mine, ref, 'q1', excused=[{'method': 'mann_whitney', 'category': 'B', 'why': 'rounded input'}])[0]
    assert r.equal and r.rows == 1 and r.excused == ['B: rounded input']


def test_background_table_against_protein_counts():
    counts = pd.DataFrame(
        [['P1', 'motif', 'RGG', 1, 2, 3, 5], ['P1', 'motif', 'RXR', 0, 1, 3, 5], ['P2', 'motif', 'RGG', 1, 0, 1, 4]],
        columns=['accession', 'analysis', 'category', 'marks_in', 'others_in', 'marks_total', 'others_total'],
    )
    table = pd.DataFrame(
        [
            ['P1', 'motif', '*', '5'],
            ['P1', 'motif', 'RGG', '2'],
            ['P1', 'motif', 'RXR', '1'],
            ['P2', 'motif', '*', '4'],
        ],
        columns=['acc', 'analysis', 'category', 'n'],
    ).astype(str)
    ref = {'input': 'bg', 'accession': 'acc', 'analysis': 'analysis', 'category': 'category', 'others': 'n'}
    (r,) = P.compare_background(counts, table, ref)
    assert r.equal and r.rows == 4 and r.method == 'background'
    table.loc[1, 'n'] = '3'
    assert not P.compare_background(counts, table, ref)[0].equal
