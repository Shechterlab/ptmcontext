"""Where a residue lies relative to folded domains, and what kind of domain is nearest.

  domain_context     in_domain, boundary (within 20 residues of a domain edge), inter_domain_linker (between two
                     domains, further than 20 from both), distal, or no_domain_annotation;
  domain_class       the class of the nearest domain (config/domain_classes.json), or 'No domain annotation';
  structure_context  disorder and domains in one class, from inside a folded domain to deep in a disordered region.

Domains are any unit table of kind domain (InterPro domain and repeat intervals for the release; UniProt's DOMAIN and
REPEAT features serve elsewhere). The nearest domain is the one at the smallest edge distance (0 inside), then by
subtype (domain before repeat), shorter span, earlier start and source accession. These are the
definitions of the Methylarginine Site Explorer's release v1.4.3 (PTM_Pipeline scripts/05 and 07, and
common.structure_context), checked by tests/test_parity_v1_4_3.py.
"""
from __future__ import annotations

import json
import re
from importlib import resources
from pathlib import Path

import numpy as np
import pandas as pd

from .. import units as U
from . import Context, get, register

WINDOW = 20
TYPE_PRIORITY = {'domain': 0, 'repeat': 1, 'homologous_superfamily': 2, 'family': 3}
STRUCTURE_NEAR, STRUCTURE_MID = 10, 30


def domain_classes() -> list[dict]:
    path = Path(str(resources.files('proteomekit') / 'config' / 'domain_classes.json'))
    return json.loads(path.read_text())['domain_classes']


def classify_text(text: str, blocks: list[dict], default: str) -> str:
    t = str(text).lower()
    for block in blocks:
        if any(re.search(p, t) for p in block['patterns']):
            return block['label']
    return default


def _nearest(ctx: Context, residues: pd.DataFrame) -> pd.DataFrame:
    """distance to the nearest domain edge, the nearest domain (row of the unit table), and whether the residue lies
    in a gap between domains; NaN / -1 / False on a protein without domains."""
    def compute():
        units = ctx.cached('units:domain', lambda: U.load(ctx.path('domains'), 'domain'))
        out_d = np.full(len(residues), np.nan)
        out_i = np.full(len(residues), -1, dtype=np.int64)
        out_gap = np.zeros(len(residues), dtype=bool)
        acc_rank = {a: i for i, a in enumerate(sorted(set(units['ref'].astype(str))))}
        groups = {a: g for a, g in units.groupby('accession', sort=False)}
        pos_all = residues['position'].to_numpy(dtype=np.int64)
        for acc, idx in residues.groupby('accession', sort=False).indices.items():
            if acc not in groups:
                continue
            g = groups[acc]
            starts = g['start'].to_numpy(dtype=np.int64)
            ends = g['end'].to_numpy(dtype=np.int64)
            prio = g['subtype'].map(lambda t: TYPE_PRIORITY.get(str(t), 9)).to_numpy()
            rank = g['ref'].astype(str).map(acc_rank).to_numpy()
            order = np.lexsort((rank, starts, ends - starts, prio))       # the tie-breaks, best first
            p = pos_all[idx][:, None]
            dist = np.where(p < starts, starts - p, np.where(p > ends, p - ends, 0))
            best = order[np.argmin(dist[:, order], axis=1)]                 # first minimum: smallest distance, best tie-break
            out_d[idx] = dist[np.arange(len(idx)), best]
            out_i[idx] = g.index.to_numpy()[best]
            # gaps between domains: after the furthest end so far and before the next start
            spans = sorted(set(zip(starts.tolist(), ends.tolist())))
            if len(spans) >= 2:
                run_end = np.maximum.accumulate(np.array([e for _, e in spans]))
                lo = run_end[:-1]
                hi = np.array([s for s, _ in spans])[1:]
                pp = pos_all[idx][:, None]
                out_gap[idx] = ((pp > lo) & (pp < hi)).any(axis=1)
        return pd.DataFrame({'distance': out_d, 'unit_row': out_i, 'gap': out_gap}, index=residues.index), units
    key = int(pd.util.hash_pandas_object(residues[['accession', 'position']], index=False).sum())
    return ctx.cached(f'nearest_domain:{len(residues)}:{key}', compute)


@register('domain_context', 'class', 'InterPro domain or repeat: in_domain, boundary (<= 20 residues from an edge), '
          'inter_domain_linker, distal, no_domain_annotation', needs=('domains',))
def domain_context(residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
    near, _ = _nearest(ctx, residues)
    d = near['distance']
    cat = np.where(d.isna(), 'no_domain_annotation',
                   np.where(d == 0, 'in_domain',
                            np.where(d <= WINDOW, 'boundary', np.where(near['gap'], 'inter_domain_linker', 'distal'))))
    return pd.DataFrame({'category': cat.astype(object), 'edge_distance': d}, index=residues.index)


@register('domain_class', 'class', 'the class of the nearest InterPro domain or repeat (config/domain_classes.json)',
          needs=('domains',))
def domain_class(residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
    near, units = _nearest(ctx, residues)
    blocks = domain_classes()
    text = (units['label'].fillna('').astype(str) + ' ' + units['subtype'].fillna('').astype(str) + ' '
            + units['members'].fillna('').astype(str))
    labels: dict[int, str] = {}
    out = []
    for row in near['unit_row']:
        if row < 0:
            out.append('No domain annotation')
            continue
        if row not in labels:
            labels[row] = classify_text(text.loc[row], blocks, 'Other domain')
        out.append(labels[row])
    return pd.DataFrame({'category': out}, index=residues.index)


def structure_context_of(disorder_class, domain_class_, domain_edge_distance) -> str:
    if str(disorder_class) == 'no_disorder_annotation':
        return 'no_disorder_annotation'
    disordered = str(disorder_class) == 'disordered'
    if str(domain_class_) == 'in_domain':
        return 'domain_disordered' if disordered else 'domain_folded'
    if not disordered:
        return 'ordered_outside_domain'
    d = pd.to_numeric(domain_edge_distance, errors='coerce')
    if pd.isna(d) or d > STRUCTURE_MID:
        return 'idr_far_from_domain'
    return 'idr_near_domain' if d <= STRUCTURE_NEAR else 'idr_mid_domain'


@register('structure_context', 'class', 'disorder and domains together: domain_folded, domain_disordered, '
          'ordered_outside_domain, idr_near_domain (<= 10), idr_mid_domain (11-30), idr_far_from_domain, '
          'no_disorder_annotation', needs=('disorder', 'domains'))
def structure_context(residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
    dis = get('disorder')(residues, ctx)
    dom = get('domain_context')(residues, ctx)
    cat = [structure_context_of(a, b, c) for a, b, c in zip(dis['category'], dom['category'], dom['edge_distance'])]
    return pd.DataFrame({'category': cat}, index=residues.index)
