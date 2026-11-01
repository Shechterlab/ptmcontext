"""Charge parameters (ptmcontext.charge) and the IDR charge layer, on sequences worked out by hand."""
import itertools

import numpy as np
import pandas as pd
import pytest

from ptmcontext import charge as CH
from ptmcontext import layers as L
from ptmcontext import units as U
from ptmcontext.snapshot import Snapshot


def test_fractions_and_regions():
    c = CH.charge('KKKKKEEEEE' + 'G' * 10)
    assert (c.f_plus, c.f_minus, c.fcr, c.ncpr) == (0.25, 0.25, 0.5, 0.0) and c.region == 3
    assert CH.charge('RGG' * 8).region == 2                  # FCR 1/3: Janus
    assert CH.charge('RGGGGGGGGG' * 3).region == 1            # FCR 0.1
    assert CH.charge('DEDEDGGG' * 3).region == 4 and CH.charge('KRKRKGGG' * 3).region == 5
    assert CH.charge('HHHHHHHHHH').kappa is None              # histidine counts as neutral: no charge, no kappa


def test_kappa_from_well_mixed_to_segregated():
    assert CH.charge('EK' * 25).kappa < 0.01                  # alternating: well mixed
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
    U.write_units(U.make_units(pd.DataFrame({'accession': ['A', 'A'], 'start': [31, 85], 'end': [54, 106]}), 'disordered', 'test'), path)
    ctx = L.Context(snap, None, {'disorder': path})
    res = pd.DataFrame({'accession': ['A', 'A', 'A', 'A', 'B'], 'position': [31, 40, 60, 90, 2]})
    assert L.BUILT_IN['idr_charge'](res, ctx)['category'].tolist() == ['r2', 'r2', 'outside_idr', 'r4', 'no_idr']
    idrs = ctx._cache['units:idr_charge']
    assert idrs['label'].iloc[0].startswith('Janus IDR: FCR 0.33, NCPR +0.33')
