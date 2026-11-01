"""Where a residue lies relative to units: inside one, near one's edge, away from all, or on a protein without units.

unit_context is the general rule, for any unit kind. With MobiDB's disordered regions as the units and a window of 20
residues it gives the disorder classes of the Methylarginine Site Explorer's releases (PTM_Pipeline scripts/06
classify_positions), which tests/test_parity_v1_4_3.py checks.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import units as U
from . import Context, register

NONE = np.iinfo(np.int32).max


def classify(positions: np.ndarray, starts: np.ndarray, ends: np.ndarray, window: int, length: int | None):
    """(class codes, distances) of 1-based positions against one protein's units. Codes: 'inside', 'near' (outside,
    within window residues of a unit), 'far'. The distance is to the nearest unit edge; with the protein's length, a
    unit's end at a terminus is not an edge (a position inside such a unit measures to its other edge, and one inside
    a unit spanning the whole protein has no distance)."""
    n = len(positions)
    min_d = np.full(n, NONE, dtype=np.int64)
    inside = np.zeros(n, dtype=bool)
    for start, end in zip(starts, ends):
        overlap = (positions >= start) & (positions <= end)
        inside |= overlap
        to_start = positions - start if length is None or start > 1 else np.full(n, NONE)
        to_end = end - positions if length is None or end < length else np.full(n, NONE)
        d = np.where(positions < start, start - positions,
                     np.where(positions > end, positions - end, np.minimum(to_start, to_end)))
        min_d = np.minimum(min_d, d)
    whole = inside & (min_d == NONE)
    codes = np.where(inside, 'inside', np.where(min_d <= window, 'near', 'far')).astype(object)
    dist = min_d.astype(float)
    dist[whole] = np.nan
    return codes, dist


def unit_context(residues: pd.DataFrame, units: pd.DataFrame, lengths: dict[str, int], window: int,
                 labels: dict[str, str]) -> pd.DataFrame:
    """category and edge_distance of each residue against units. labels names the classes: inside, near, far, and
    none (a protein without units of this kind)."""
    by_acc = U.by_accession(units)
    category = np.full(len(residues), labels['none'], dtype=object)
    distance = np.full(len(residues), np.nan)
    acc = residues['accession'].to_numpy()
    pos = residues['position'].to_numpy(dtype=np.int64)
    order = np.argsort(acc, kind='stable')
    acc_sorted = acc[order]
    bounds = np.flatnonzero(np.r_[True, acc_sorted[1:] != acc_sorted[:-1], True])
    for i in range(len(bounds) - 1):
        idx = order[bounds[i]:bounds[i + 1]]
        a = acc_sorted[bounds[i]]
        if a not in by_acc:
            continue
        starts, ends = by_acc[a]
        codes, dist = classify(pos[idx], starts, ends, window, lengths.get(a))
        category[idx] = [labels[c] for c in codes]
        distance[idx] = dist
    return pd.DataFrame({'category': category, 'edge_distance': distance}, index=residues.index)


DISORDER_LABELS = {'inside': 'disordered', 'near': 'disorder_boundary', 'far': 'ordered', 'none': 'no_disorder_annotation'}


@register('disorder', 'class', 'MobiDB disordered region: inside, within 20 residues outside, further out, or a protein '
          'without MobiDB regions (the release disorder classes)', needs=('disorder',), title='Disorder',
          labels={'disordered': 'In a disordered region', 'disorder_boundary': 'Within 20 aa outside one',
                  'ordered': 'Further from disorder', 'no_disorder_annotation': 'No disorder annotation'})
def disorder(residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
    units = ctx.cached('units:disordered', lambda: U.load(ctx.path('disorder'), 'disordered'))
    return unit_context(residues, units, ctx.snapshot.lengths(), 20, DISORDER_LABELS)


@register('idr', 'class', 'IDR (MobiDB regions merged, at least 20 residues): inside, within 20 residues outside, further '
          'out, or a protein without one', needs=('disorder',), title='Intrinsically disordered regions',
          labels={'idr': 'In an IDR (20 aa or longer)', 'idr_boundary': 'Within 20 aa outside one',
                  'outside_idr': 'Further from IDRs', 'no_idr': 'Protein without an IDR'})
def idr(residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
    units = ctx.cached('units:idr', lambda: U.idrs(ctx.cached('units:disordered', lambda: U.load(ctx.path('disorder'), 'disordered')),
                                                    ctx.snapshot))
    return unit_context(residues, units, ctx.snapshot.lengths(), 20,
                        {'inside': 'idr', 'near': 'idr_boundary', 'far': 'outside_idr', 'none': 'no_idr'})


@register('domain', 'class', 'InterPro domain or repeat: inside, within 20 residues outside, further out, or a protein '
          'without one', needs=('domains',), title='Domains',
          labels={'in_domain': 'In a domain', 'domain_boundary': 'Within 20 aa outside one',
                  'outside_domain': 'Further from domains', 'no_domain_annotation': 'Protein without domains'})
def domain(residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
    units = ctx.cached('units:domain', lambda: U.load(ctx.path('domains'), 'domain'))
    return unit_context(residues, units, ctx.snapshot.lengths(), 20,
                        {'inside': 'in_domain', 'near': 'domain_boundary', 'far': 'outside_domain', 'none': 'no_domain_annotation'})


def units_layer(name: str, units: pd.DataFrame, window: int = 20, labels: dict[str, str] | None = None, describe: str = ''):
    """A class layer from any unit table (one made in another repository and read with units.read_units)."""
    from . import Layer
    labels = labels or {'inside': f'in_{name}', 'near': f'{name}_boundary', 'far': f'outside_{name}', 'none': f'no_{name}'}
    return Layer(name, 'class', describe or f'{name} units: inside, within {window} residues, further, none',
                 lambda residues, ctx: unit_context(residues, units, ctx.snapshot.lengths(), window, labels))
