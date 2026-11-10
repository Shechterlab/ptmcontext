from pathlib import Path
from importlib import metadata

import numpy as np
import pandas as pd
import pytest

from ptmcontext import layers as L
from ptmcontext import residue_tests as RT
from ptmcontext import units as U
from ptmcontext.layers.context import classify, unit_context
from ptmcontext.profile import load_profile
from ptmcontext.snapshot import Snapshot

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'


def test_classify_inside_near_far_and_termini():
    pos = np.array([1, 5, 10, 25, 31, 60])
    codes, dist = classify(pos, np.array([1]), np.array([10]), window=20, length=100)
    assert list(codes) == ['inside', 'inside', 'inside', 'near', 'far', 'far']  # 31 is 21 past the edge: beyond 20
    # the unit starts at the N-terminus: inside positions measure to its C-terminal edge only
    assert list(dist[:3]) == [9, 5, 0] and list(dist[3:]) == [15, 21, 50]


def test_unit_spanning_the_protein_has_no_edge():
    codes, dist = classify(np.array([3]), np.array([1]), np.array([10]), window=20, length=10)
    assert codes[0] == 'inside' and np.isnan(dist[0])


def test_unit_context_on_a_protein_without_units():
    residues = pd.DataFrame({'accession': ['A', 'B'], 'position': [5, 5]})
    units = U.make_units(pd.DataFrame({'accession': ['A'], 'start': [1], 'end': [9]}), 'disordered', 'test')
    out = unit_context(
        residues, units, {'A': 50, 'B': 50}, 20, {'inside': 'in', 'near': 'near', 'far': 'far', 'none': 'none'}
    )
    assert list(out['category']) == ['in', 'none']


def test_idrs_merge_and_keep_long_regions():
    snap = Snapshot({'A': 'A' * 100})
    dis = U.make_units(
        pd.DataFrame({'accession': ['A'] * 3, 'start': [1, 10, 60], 'end': [15, 30, 70]}), 'disordered', 'test'
    )
    idr = U.idrs(dis, snap, min_len=20)
    assert idr[['start', 'end']].values.tolist() == [[1, 30]]


def _toy_context(tmp_path):
    #                 1        10        20        30        40
    seq = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
    snap = Snapshot({'P1': seq, 'P2': 'MRAAARAAAR'})
    mobidb = tmp_path / 'mobidb.tsv'
    pd.DataFrame({'canonical_UniProtAC': ['P1'], 'fragment_start': [1], 'fragment_end': [12]}).to_csv(
        mobidb, sep='\t', index=False
    )
    return L.Context(snap, load_profile(MARKS / 'methylarginine.yaml'), {'disorder': mobidb})


def test_residue_test_counts_and_rows(tmp_path):
    ctx = _toy_context(tmp_path)
    marked = pd.DataFrame({'accession': ['P1', 'P1', 'P2'], 'position': [2, 5, 2]})
    rows = RT.residue_test(ctx, marked, 'disorder', 'disorder')
    f = rows[(rows['method'] == 'fisher') & (rows['category'] == 'disordered')].iloc[0]
    # P1: R at 2, 5, 11, 22, 32, 43 -> marked 2, 5 (disordered); others: 11 disordered, 22 and 32 boundary (32 is exactly
    # 20 from the region's edge at 12), 43 ordered
    # P2: no MobiDB region -> no_disorder_annotation for its R at 2 (marked), 6, 10
    assert (f['a'], f['b'], f['c'], f['d']) == (2, 1, 1, 5)
    assert set(rows['method']) == {'fisher', 'mantel_haenszel'}


def test_a_mark_off_the_profile_residue_is_an_error(tmp_path):
    ctx = _toy_context(tmp_path)
    with pytest.raises(ValueError):
        RT.residue_test(ctx, pd.DataFrame({'accession': ['P1'], 'position': [1]}), 'disorder', 'disorder')


class _FakeDist:
    name, version = 'someone-elses-layers', '0.0.1'


def test_a_plugin_is_not_loaded_unless_trusted(monkeypatch, tmp_path):
    ep = metadata.EntryPoint('charge', 'pk_example_plugin:charge_class', L.ENTRY_POINT_GROUP)
    object.__setattr__(ep, 'dist', _FakeDist()) if hasattr(ep, 'dist') else None
    monkeypatch.setattr(L, 'plugins', lambda: {'charge': ep})
    ctx = _toy_context(tmp_path)
    with pytest.raises(PermissionError):
        L.get('charge', ctx)


def test_protein_outputs_count_each_protein(tmp_path):
    from ptmcontext.site import protein_outputs

    ctx = _toy_context(tmp_path)
    marked = pd.DataFrame({'accession': ['P1', 'P1', 'P2'], 'position': [2, 5, 2]})
    kept = {'disorder': {}}
    RT.residue_test(ctx, marked, 'disorder', 'disorder', keep=kept['disorder'])
    out = protein_outputs(ctx.snapshot, ctx.profile, marked, kept, ctx)
    marks = out['marks.tsv']
    assert list(marks['disorder']) == ['disordered', 'disordered', 'no_disorder_annotation']
    assert list(marks['window_15'])[0] == '______MRGGRAAAA'
    c = out['protein_counts.tsv'].set_index(['accession', 'category'])
    # P1: marks at 2 and 5 (disordered); its other arginines: 11 disordered, 22 and 32 boundary, 43 ordered
    assert (c.loc[('P1', 'disordered'), 'marks_in'], c.loc[('P1', 'disordered'), 'others_in']) == (2, 1)
    assert (c.loc[('P1', 'disorder_boundary'), 'marks_in'], c.loc[('P1', 'disorder_boundary'), 'others_in']) == (0, 2)
    assert (c.loc[('P1', 'ordered'), 'marks_in'], c.loc[('P1', 'ordered'), 'others_in']) == (0, 1)
    assert c.loc[('P1', 'ordered'), 'marks_total'] == 2 and c.loc[('P1', 'ordered'), 'others_total'] == 4
    prot = out['proteins.tsv'].set_index('accession')
    assert prot.loc['P1', 'marks'] == 2 and prot.loc['P1', 'candidates'] == 6


def test_built_in_layers_take_with_parameters_and_their_labels_follow():
    default = L.get('idr')
    assert default.labels['idr_boundary'] == 'Ordered, ≤20 aa from an IDR'
    bound = L.get('idr', None, {'window': 15, 'min_length': 30})
    assert bound.labels['idr_boundary'] == 'Ordered, ≤15 aa from an IDR'
    assert bound.labels['no_idr'] == 'No IDR of 30 aa or more' and '30 or more' in bound.question
    assert bound.tracks[0].help.endswith('of 30 residues or more')
    s = L.get('structure_context', None, {'near': 5, 'mid': 25})
    assert (
        s.labels['idr_mid_domain'] == 'IDR 6–25 aa from a domain'
        and s.labels['idr_far_from_domain'] == 'IDR >25 aa from any domain'
    )
    with pytest.raises(ValueError, match='takes no parameter'):
        L.get('idr', None, {'nope': 1})
    with pytest.raises(ValueError, match='takes no parameters'):
        L.get('motif', None, {'window': 3})


def test_domain_class_needs_its_class_list_from_the_site_file(tmp_path):
    from ptmcontext.layers.domains import classify_text, domain_classes

    (tmp_path / 'c.json').write_text('{"domain_classes": [{"label": "Toy", "patterns": ["toy"]}]}')
    blocks = domain_classes('c.json', tmp_path)
    assert classify_text('A toy domain', blocks, 'Other') == 'Toy'
    with pytest.raises(ValueError, match='needs its class list'):
        L.get('domain_class').compute(pd.DataFrame(), None)
