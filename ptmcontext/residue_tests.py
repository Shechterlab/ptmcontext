"""Is a mark over-represented in a class of residues, against the other candidate residues?

One function serves every mark (the profile names its residues), every layer (disorder, IDRs, domains, motifs, a unit
table from anywhere) and writes statistics rows. Two tests, as the releases report them:

  fisher           pooled: the marked residues against the other candidate residues of the marked proteins
                   (Haldane-Anscombe odds ratio, two-sided Fisher p);
  mantel_haenszel  within protein: the same counts with each protein a stratum (Mantel-Haenszel odds ratio with its
                   Robins-Breslow-Greenland 95% CI, continuity-corrected CMH p), which separates where a protein's
                   marks fall from which proteins are marked.

Both count the same sites: those on a protein with at least one other candidate residue. q is Benjamini-Hochberg
over the categories of the analysis, within each method.
"""
from __future__ import annotations

import math
from typing import Iterable

import numpy as np
import pandas as pd

from . import layers as L
from . import stats
from .profile import check_residues

OTHER = 'Other / unclassified'


def _keys(frame: pd.DataFrame) -> pd.Series:
    return frame['accession'].astype(str) + ':' + frame['position'].astype(int).astype(str)


def candidates_and_marks(ctx: L.Context, marked: pd.DataFrame, left_out: pd.DataFrame | None = None,
                         scope: str = 'marked_proteins') -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """(candidate residues, is_marked, is_left_out). Candidates are the profile's residues in the marked proteins
    (scope 'marked_proteins') or in every protein of the snapshot ('proteome'). Marked residues on proteins outside the
    snapshot are not counted; a marked residue that is not one of the profile's residues is an error."""
    profile, snap = ctx.profile, ctx.snapshot
    marked = marked[['accession', 'position']].copy()
    marked['position'] = marked['position'].astype(int)
    marked = marked[marked['accession'].isin(snap.sequences)].drop_duplicates()
    bad = check_residues(profile, snap, marked)
    if len(bad):
        raise ValueError(f'{len(bad)} marked residues are not {profile.residues} on the snapshot, e.g. {bad.head(3).to_dict("records")}')
    proteins = None if scope == 'proteome' else sorted(set(marked['accession']))
    cand = snap.residues(profile.residues, accessions=proteins)
    keys = _keys(cand)
    is_marked = keys.isin(set(_keys(marked)))
    is_left = keys.isin(set(_keys(left_out))) & ~is_marked if left_out is not None and len(left_out) else pd.Series(False, index=cand.index)
    return cand, is_marked, is_left


def residue_test(ctx: L.Context, marked: pd.DataFrame, layer: str | L.Layer, analysis: str, *,
                 left_out: pd.DataFrame | None = None, methods: Iterable[str] = ('fisher', 'mantel_haenszel'),
                 stratum: str = 'all', keep: dict | None = None) -> pd.DataFrame:
    """Statistics rows (statistics.COLUMNS) of the marked residues against the other candidate residues of the same
    proteins, for each class (or flag) of the layer. left_out: residues counted on neither side (sites kept pending)."""
    layer = L.get(layer, ctx) if isinstance(layer, str) else layer
    cand, is_marked, is_left = candidates_and_marks(ctx, marked, left_out)
    annotated = pd.concat([cand, layer(cand, ctx)], axis=1)
    if layer.shape == 'class':
        columns = None
        annotated['category'] = annotated['category'].fillna(OTHER).astype(str)
    else:
        columns = sorted(c for c in annotated.columns if c not in cand.columns)
    targets = annotated[is_marked]
    background = annotated[~is_marked & ~is_left]
    if keep is not None:   # for the per-protein outputs: every candidate residue, annotated, and which are marks
        keep.update(annotated=annotated, is_marked=is_marked, is_left=is_left, columns=columns)
    # sites on a protein with no other candidate residue have no background: neither test counts them
    same = targets[targets['accession'].isin(set(background['accession']))]
    rows = []
    methods = tuple(methods)
    if 'fisher' in methods:
        rows += _fisher(same, background, columns, analysis, stratum, ctx.profile.background('marked_proteins'))
    if 'mantel_haenszel' in methods:
        rows += _within_protein(targets, background, columns, analysis, stratum, ctx.profile.background('same_protein'))
    return pd.DataFrame(rows)


def _counts_by_category(targets, background, columns):
    """(category, a, n_target, c, n_background) for a class layer (categories in sorted order) or a flags layer."""
    nt, nb = len(targets), len(background)
    if columns is None:
        ta, bc = targets['category'].value_counts(), background['category'].value_counts()
        for cat in sorted(set(ta.index) | set(bc.index)):
            yield cat, int(ta.get(cat, 0)), nt, int(bc.get(cat, 0)), nb
    else:
        for col in columns:
            yield col, int(targets[col].sum()), nt, int(background[col].sum()), nb


def _fisher(targets, background, columns, analysis, stratum, label):
    rows = []
    for cat, a, nt, c, nb in _counts_by_category(targets, background, columns):
        b, d = nt - a, nb - c
        odds = stats.haldane_odds_ratio(a, b, c, d)
        rows.append({'analysis': analysis, 'category': cat, 'stratum': stratum, 'a': a, 'b': b, 'c': c, 'd': d,
                     'odds_ratio': odds, 'log2_odds_ratio': stats.log2_or_nan(odds), 'p': stats.fisher_p(a, b, c, d),
                     'method': 'fisher', 'background': label})
    if not rows:
        return rows
    out = pd.DataFrame(rows)
    out['q'] = stats.benjamini_hochberg(out['p'].astype(float))
    out = out.sort_values(['odds_ratio', 'a'], ascending=[False, False])
    return out.to_dict('records')


def _within_protein(targets, background, columns, analysis, stratum, label):
    proteins = sorted(set(targets['accession']) & set(background['accession']))
    if columns is None:
        cats = sorted(set(targets['category']) | set(background['category']))
        t = pd.crosstab(targets['accession'], targets['category']).reindex(index=proteins, columns=cats, fill_value=0)
        o = pd.crosstab(background['accession'], background['category']).reindex(index=proteins, columns=cats, fill_value=0)
        n_t = targets.groupby('accession').size().reindex(proteins, fill_value=0)
        n_o = background.groupby('accession').size().reindex(proteins, fill_value=0)
    else:
        cats = columns
        tt = targets[targets['accession'].isin(proteins)]
        bb = background[background['accession'].isin(proteins)]
        t = tt.groupby('accession')[columns].sum().reindex(proteins, fill_value=0)
        o = bb.groupby('accession')[columns].sum().reindex(proteins, fill_value=0)
        n_t = tt.groupby('accession').size().reindex(proteins, fill_value=0)
        n_o = bb.groupby('accession').size().reindex(proteins, fill_value=0)
    nt_arr, no_arr = n_t.to_numpy(dtype=np.int64), n_o.to_numpy(dtype=np.int64)
    rows = []
    for cat in cats:
        a = t[cat].to_numpy(dtype=np.int64)
        c = o[cat].to_numpy(dtype=np.int64)
        tables = [(int(x), int(y - x), int(z), int(w - z)) for x, y, z, w in zip(a, nt_arr, c, no_arr)]
        odds, lo, hi, p, used = stats.mantel_haenszel_ci(tables)
        rows.append({'analysis': analysis, 'category': cat, 'stratum': stratum,
                     'a': int(a.sum()), 'b': int(nt_arr.sum() - a.sum()), 'c': int(c.sum()), 'd': int(no_arr.sum() - c.sum()),
                     'odds_ratio': odds,
                     'log2_odds_ratio': math.log2(odds) if odds and odds > 0 and math.isfinite(odds) else None,
                     'odds_ratio_ci_low': lo, 'odds_ratio_ci_high': hi, 'p': p, 'method': 'mantel_haenszel',
                     'background': label, 'n_strata': used})
    if rows:
        q = stats.benjamini_hochberg(pd.Series([r['p'] for r in rows], dtype=float))
        for r, v in zip(rows, q):
            r['q'] = v
    return rows
