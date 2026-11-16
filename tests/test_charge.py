"""Charge parameters (ptmcontext.charge) and the IDR charge layer, on sequences worked out by hand."""

import itertools
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ptmcontext import charge as CH
from ptmcontext import layers as L
from ptmcontext import units as U
from ptmcontext.snapshot import Snapshot

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'


def test_fractions_and_regions():
    c = CH.charge('KKKKKEEEEE' + 'G' * 10)
    assert (c.f_plus, c.f_minus, c.fcr, c.ncpr) == (0.25, 0.25, 0.5, 0.0) and c.region == 3
    assert CH.charge('RGG' * 8).region == 2  # FCR 1/3: Janus
    assert CH.charge('RGGGGGGGGG' * 3).region == 1  # FCR 0.1
    assert CH.charge('DEDEDGGG' * 3).region == 4 and CH.charge('KRKRKGGG' * 3).region == 5
    assert CH.charge('HHHHHHHHHH').kappa is None  # histidine counts as neutral: no charge, no kappa


def test_kappa_from_well_mixed_to_segregated():
    assert CH.charge('EK' * 25).kappa < 0.01  # alternating: well mixed
    assert CH.charge('E' * 25 + 'K' * 25).kappa == pytest.approx(1.0)
    mid = CH.charge(('E' * 5 + 'K' * 5) * 5).kappa
    assert 0.1 < mid < 0.5


def test_delta_max_reaches_the_best_arrangement_of_short_sequences():
    # every composition of 6 to 9 residues: never above the best arrangement (it is one), and within 6.4% of it
    exact = total = 0
    for n in range(6, 10):
        for npos in range(n + 1):
            for nneg in range(n - npos + 1):
                if npos + nneg == 0:
                    continue
                base = [1] * npos + [-1] * nneg + [0] * (n - npos - nneg)
                best = max(CH.delta_avg(np.array(p, np.int8)) for p in set(itertools.permutations(base)))
                mine = CH.delta_max(npos, nneg, n)
                assert best * (1 - 0.064) <= mine <= best + 1e-12, (n, npos, nneg)
                exact += abs(best - mine) < 1e-12
                total += 1
    assert exact / total > 0.9


def test_idr_charge_layer(tmp_path):
    seq = 'A' * 30 + 'RGG' * 8 + 'L' * 30 + 'EEDEEDKEEDEEDEEKEEDEDE' + 'A' * 10
    snap = Snapshot({'A': seq, 'B': 'R' * 5 + 'A' * 40})
    path = tmp_path / 'dis.tsv'
    U.write_units(
        U.make_units(
            pd.DataFrame({'accession': ['A', 'A'], 'start': [31, 85], 'end': [54, 106]}), 'disordered', 'test'
        ),
        path,
    )
    ctx = L.Context(snap, None, {'disorder': path})
    res = pd.DataFrame({'accession': ['A', 'A', 'A', 'A', 'B'], 'position': [31, 40, 60, 90, 2]})
    assert L.BUILT_IN['idr_charge'](res, ctx)['category'].tolist() == ['r2', 'r2', 'outside_idr', 'r4', 'no_idr']
    idrs = ctx._cache['units:idr_charge']
    assert idrs['label'].iloc[0].startswith('Janus IDR: FCR 0.33, NCPR +0.33')


def test_the_run_writes_each_idr_with_its_charge_and_what_is_inside(tmp_path):
    """units_idr.tsv: every IDR of the marked proteins with its parameters, its marks and its other candidate residues
    (a left-out mark counted on neither side), and the website's coding of it (data/units.json)."""
    from ptmcontext import residue_tests as RT
    from ptmcontext import web
    from ptmcontext.profile import load_profile
    from ptmcontext.site import protein_outputs

    #      1..30        31..54 (R at 31, 34, ..., 52)  55..68     69   70..84     85..106 (acidic)          107  108..116
    seq = 'M' + 'A' * 29 + 'RGG' * 8 + 'L' * 14 + 'R' + 'L' * 15 + 'EEDEEDKEEDEEDEEKEEDEDE' + 'R' + 'A' * 9
    snap = Snapshot({'A': seq, 'B': 'R' * 5 + 'A' * 40, 'C': 'R' * 30})
    path = tmp_path / 'dis.tsv'
    U.write_units(
        U.make_units(
            pd.DataFrame({'accession': ['A', 'A', 'C'], 'start': [31, 85, 1], 'end': [54, 106, 30]}),
            'disordered',
            'test',
        ),
        path,
    )
    ctx = L.Context(snap, load_profile(MARKS / 'methylarginine.yaml'), {'disorder': path})
    marked = pd.DataFrame({'accession': ['A', 'A', 'A', 'B'], 'position': [31, 34, 69, 2]})
    pending = pd.DataFrame({'accession': ['A'], 'position': [37]})
    layer = L.BUILT_IN['idr_charge']
    kept = {'idr_charge': {}}
    RT.residue_test(ctx, marked, layer, 'idr_charge', keep=kept['idr_charge'], left_out=pending)
    out = protein_outputs(snap, ctx.profile, marked, kept, ctx, layers={'idr_charge': layer})
    track = next(t for t in out['tracks.json'] if t['kind'] == 'idr')
    assert track['values']['table'] == 'units_idr.tsv'
    assert [c['name'] for c in track['values']['columns']] == [
        'f_plus',
        'f_minus',
        'fcr',
        'ncpr',
        'kappa',
        'region',
        'stickers',
        'sticker_spacing',
        'sticker_free',
    ]
    t = out['units_idr.tsv']
    assert list(t.columns) == [
        'accession',
        'start',
        'end',
        'length',
        'class',
        'f_plus',
        'f_minus',
        'fcr',
        'ncpr',
        'kappa',
        'region',
        'stickers',
        'sticker_spacing',
        'sticker_free',
        'marks',
        'other_candidates',
    ]
    # only the marked proteins' IDRs: C has one, but no mark; B has a mark and no IDR
    assert t[['accession', 'start', 'end', 'length', 'class']].values.tolist() == [
        ['A', 31, 54, 24, 'r2'],
        ['A', 85, 106, 22, 'r4'],
    ]
    first, second = t.iloc[0], t.iloc[1]
    # the first: 8 arginines in 24 residues; marks at 31 and 34; 37 left out; 40, 43, ..., 52 the other five
    assert (first['f_plus'], first['f_minus'], first['fcr'], first['ncpr'], first['region']) == (
        '0.333333',
        '0',
        '0.333333',
        '0.333333',
        '2',
    )
    assert (first['marks'], first['other_candidates']) == (2, 5)
    # the second: no arginine inside (107, just past its end, is not counted); every residue charged, 20 of 22 negative
    assert (second['marks'], second['other_candidates']) == (0, 0)
    assert (
        second['fcr'] == '1'
        and second['f_minus'] == '0.909091'
        and second['ncpr'] == '-0.818182'
        and second['region'] == '4'
    )
    assert 0 <= float(second['kappa']) <= 1
    # what the website reads: the rows coded by protein and class
    folder = tmp_path / 'out'
    folder.mkdir()
    t.to_csv(folder / 'units_idr.tsv', sep='\t', index=False)
    listing = [['A', 'ONE', 'one', len(seq), 3, 11, ''], ['B', 'TWO', 'two', 45, 1, 5, '']]
    v = web.unit_value_data(folder, listing, out['tracks.json'])['idr']
    assert v['classes'] == ['r2', 'r4'] and v['columns'][2] == 'fcr'
    assert (
        v['rows'][0][:8] == [0, 31, 54, 0, 0.333333, 0, 0.333333, 0.333333]
        and v['rows'][0][9:11] == [2, v['rows'][0][10]]
        and v['rows'][0][-2:] == [2, 5]
    )
    assert v['columns'][-3:] == ['stickers', 'sticker_spacing', 'sticker_free']
