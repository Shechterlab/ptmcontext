"""Is a mark over-represented in a class of residues, against the other candidate residues?

One function serves every mark (the profile names its residues), every layer (disorder, IDRs, domains, motifs, a unit
table from anywhere) and writes statistics rows. Two tests, as the releases report them:

  fisher           pooled: the marked residues against the other candidate residues of the marked proteins
                   (Haldane-Anscombe odds ratio, two-sided Fisher p);
  mantel_haenszel  within protein: the same counts with each protein a stratum (Mantel-Haenszel odds ratio with its
                   Robins-Breslow-Greenland 95% CI, continuity-corrected CMH p), which separates where a protein's
                   marks fall from which proteins are marked.

Both count the same sites: those on a protein with at least one other candidate residue (or, with alone='count', every
site: one on a protein with no other candidate residue adds to a and b, and nothing to the within-protein odds ratio or
test). q is Benjamini-Hochberg over the categories of the analysis, within each method. An analysis may count only the
marks and candidate residues of some proteins (proteins: those a table lists), and may give its rows' order.
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


def candidates_and_marks(
    ctx: L.Context, marked: pd.DataFrame, left_out: pd.DataFrame | None = None, scope: str = 'marked_proteins'
) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """(candidate residues, is_marked, is_left_out). Candidates are the profile's residues in the marked proteins
    (scope 'marked_proteins') or in every protein of the snapshot ('proteome'). Marked residues on proteins outside the
    snapshot are not counted; a marked residue that is not one of the profile's residues is an error."""
    profile, snap = ctx.profile, ctx.snapshot
    marked = marked[['accession', 'position']].copy()
    marked['position'] = marked['position'].astype(int)
    marked = marked[marked['accession'].isin(snap.sequences)].drop_duplicates()
    bad = check_residues(profile, snap, marked)
    if len(bad):
        raise ValueError(
            f'{len(bad)} marked residues are not {profile.residues} on the snapshot, e.g. {bad.head(3).to_dict("records")}'
        )
    proteins = None if scope == 'proteome' else sorted(set(marked['accession']))
    cand = snap.residues(profile.residues, accessions=proteins)
    keys = _keys(cand)
    is_marked = keys.isin(set(_keys(marked)))
    is_left = (
        keys.isin(set(_keys(left_out))) & ~is_marked
        if left_out is not None and len(left_out)
        else pd.Series(False, index=cand.index)
    )
    return cand, is_marked, is_left


def residue_test(
    ctx: L.Context,
    marked: pd.DataFrame,
    layer: str | L.Layer,
    analysis: str,
    *,
    left_out: pd.DataFrame | None = None,
    methods: Iterable[str] = ('fisher', 'mantel_haenszel'),
    stratum: str = 'all',
    keep: dict | None = None,
    proteins: set | None = None,
    alone: str = 'drop',
    order: list | None = None,
    pooled_label: str = '',
    only_in=None,
) -> pd.DataFrame:
    """Statistics rows (statistics.COLUMNS) of the marked residues against the other candidate residues of the same
    proteins, for each class (or flag) of the layer. left_out: residues counted on neither side (sites kept pending).
    proteins: count only the marks (and so the candidate residues) of these proteins. alone: 'drop' (default) leaves
    out the marks of a protein with no other candidate residue, 'count' counts them. order: the rows' order, as a
    protein-set question's (default: pooled rows by odds ratio, within-protein rows by category). pooled_label:
    added to the pooled rows' background. only_in: count only the marks and candidate residues inside the regions of
    'idr' (the IDRs) or of {role, kind} (any interval table)."""
    layer = L.get(layer, ctx) if isinstance(layer, str) else layer
    if proteins is not None:
        marked = marked[marked['accession'].isin(proteins)]
    cand, is_marked, is_left = candidates_and_marks(ctx, marked, left_out)
    if only_in:
        inside = inside_regions(ctx, cand, only_in)
        cand, is_marked, is_left = cand[inside], is_marked[inside], is_left[inside]
    annotated = pd.concat([cand, layer(cand, ctx)], axis=1)
    if layer.shape == 'class':
        columns = None
        annotated['category'] = annotated['category'].fillna(OTHER).astype(str)
    else:
        columns = sorted(c for c in annotated.columns if c not in cand.columns)
    targets = annotated[is_marked]
    background = annotated[~is_marked & ~is_left]
    if keep is not None:  # for the per-protein outputs: every candidate residue, annotated, and which are marks
        keep.update(
            annotated=annotated, is_marked=is_marked, is_left=is_left, columns=columns, restricted=bool(only_in)
        )
    if alone not in ('drop', 'count'):
        raise ValueError(f"{analysis}: alone must be 'drop' or 'count', not {alone!r}")
    # sites on a protein with no other candidate residue have no background: neither test counts them, unless the
    # analysis counts them (alone='count': in a and b of both tests, adding nothing within proteins)
    same = targets if alone == 'count' else targets[targets['accession'].isin(set(background['accession']))]
    rows = []
    methods = tuple(methods)
    among = layer.among if columns is not None else {}

    def label_of(scope: str, suffix: str = '') -> str | dict:
        # a flag tested among some residues is compared with those residues only: its own background wording
        if not among:
            return ctx.profile.background(scope) + suffix
        return {col: ctx.profile.background(scope, among.get(col)) + suffix for col in columns}

    if 'fisher' in methods:
        rows += _fisher(
            same,
            background,
            columns,
            analysis,
            stratum,
            label_of('marked_proteins', pooled_label),
            order,
            among,
        )
    if 'mantel_haenszel' in methods:
        rows += _within_protein(
            same,
            background,
            columns,
            analysis,
            stratum,
            label_of('same_protein'),
            order,
            alone == 'count',
            among,
        )
    return pd.DataFrame(rows)


def residues_matching(ctx: L.Context, cand: pd.DataFrame, rule: dict) -> np.ndarray:
    """Whether each candidate residue is one of `residues` (letters) and, with `motif` ({pattern, start} or {patterns},
    flank: as a motif family), has the pattern in its window: the residues a question counts when it is about one class
    of them (the serines and threonines followed by a proline)."""
    unknown = sorted(set(rule) - {'residues', 'motif', 'flank'})
    if unknown:
        raise ValueError(f'only_in: unknown keys {unknown} (residues, motif, flank)')
    keep = np.ones(len(cand), dtype=bool)
    if rule.get('residues'):
        keep &= cand['residue'].isin(set(str(rule['residues']).upper())).to_numpy()
    if rule.get('motif'):
        from .layers.configured import _motif_family, motif_match

        flank = int(rule.get('flank', 10))
        fam = _motif_family({'name': 'only_in', **rule['motif']}, 'only_in', flank)
        windows = ctx.snapshot.windows(cand, flank).to_numpy()
        keep &= np.array([bool(w) and motif_match(w, flank, fam['patterns']) for w in windows], dtype=bool)
    return keep


def inside_regions(ctx: L.Context, cand: pd.DataFrame, only_in) -> np.ndarray:
    """Whether each candidate residue is inside a region of 'idr' (the IDRs) or of {role, kind} (an interval table)."""
    from .question import covered

    if isinstance(only_in, dict) and ({'residues', 'motif'} & set(only_in)) and 'role' not in only_in:
        return residues_matching(ctx, cand, only_in)
    if only_in == 'idr':
        from .layers.context import idr_units

        units = idr_units(ctx)
    elif isinstance(only_in, dict) and 'role' in only_in:
        units = ctx.units(only_in['role'], only_in.get('kind', only_in['role']))
    else:
        raise ValueError(f"only_in must be 'idr' or {{role, kind}}, not {only_in!r}")
    return covered(cand['accession'].to_numpy(), cand['position'].to_numpy(dtype=np.int64), units)


def _ordered(rows: list[dict], order: list | None) -> list[dict]:
    """The rows in the order an analysis names (the keys of set_tests.ordered: {categories: [...]} first, or {by,
    descending}), each method's rows apart; without one, as they were."""
    if not order or not rows:
        return rows
    from .set_tests import ordered

    return ordered(pd.DataFrame(rows), order).to_dict('records')


def _scoped(frame, col, among):
    """The rows a flag is tested among: all of them, or the residues the flag names (a family's `among`)."""
    return frame[frame['residue'].isin(set(among[col]))] if col in among else frame


def _label_for(label, cat):
    """The background wording of one row: the question's, or a flag's own when it is tested among some residues."""
    return label[cat] if isinstance(label, dict) else label


def _counts_by_category(targets, background, columns, among=None):
    """(category, a, n_target, c, n_background) for a class layer (categories in sorted order) or a flags layer, each
    flag counted among its own residues when it names them."""
    nt, nb = len(targets), len(background)
    if columns is None:
        ta, bc = targets['category'].value_counts(), background['category'].value_counts()
        for cat in sorted(set(ta.index) | set(bc.index)):
            yield cat, int(ta.get(cat, 0)), nt, int(bc.get(cat, 0)), nb
    else:
        for col in columns:
            t, b = _scoped(targets, col, among or {}), _scoped(background, col, among or {})
            yield col, int(t[col].sum()), len(t), int(b[col].sum()), len(b)


def _fisher(targets, background, columns, analysis, stratum, label, order=None, among=None):
    rows = []
    for cat, a, nt, c, nb in _counts_by_category(targets, background, columns, among):
        b, d = nt - a, nb - c
        odds = stats.haldane_odds_ratio(a, b, c, d)
        rows.append(
            {
                'analysis': analysis,
                'category': cat,
                'stratum': stratum,
                'a': a,
                'b': b,
                'c': c,
                'd': d,
                'odds_ratio': odds,
                'log2_odds_ratio': stats.log2_or_nan(odds),
                'p': stats.fisher_p(a, b, c, d),
                'method': 'fisher',
                'background': _label_for(label, cat),
            }
        )
    if not rows:
        return rows
    out = pd.DataFrame(rows)
    out['q'] = stats.benjamini_hochberg(out['p'].astype(float))
    out = out.sort_values(['odds_ratio', 'a'], ascending=[False, False])
    return _ordered(out.to_dict('records'), order)


def _within_protein(targets, background, columns, analysis, stratum, label, order=None, alone=False, among=None):
    # each protein with marks and other candidate residues a stratum; with alone, also those with marks only, whose
    # tables add to a and b and nothing else (they are not informative)
    proteins = sorted(set(targets['accession']) if alone else set(targets['accession']) & set(background['accession']))
    if columns is None:
        cats = sorted(set(targets['category']) | set(background['category']))
        t = pd.crosstab(targets['accession'], targets['category']).reindex(index=proteins, columns=cats, fill_value=0)
        o = pd.crosstab(background['accession'], background['category']).reindex(
            index=proteins, columns=cats, fill_value=0
        )
        n_t = targets.groupby('accession').size().reindex(proteins, fill_value=0)
        n_o = background.groupby('accession').size().reindex(proteins, fill_value=0)
        n_by = {}
    else:
        cats = columns
        tt = targets[targets['accession'].isin(proteins)]
        bb = background[background['accession'].isin(proteins)]
        t = tt.groupby('accession')[columns].sum().reindex(proteins, fill_value=0)
        o = bb.groupby('accession')[columns].sum().reindex(proteins, fill_value=0)
        n_t = tt.groupby('accession').size().reindex(proteins, fill_value=0)
        n_o = bb.groupby('accession').size().reindex(proteins, fill_value=0)
        n_by = {}
        for col in among or {}:  # a flag tested among some residues: its own totals
            n_by[col] = tuple(
                _scoped(f, col, among).groupby('accession').size().reindex(proteins, fill_value=0) for f in (tt, bb)
            )
            t[col] = _scoped(tt, col, among).groupby('accession')[col].sum().reindex(proteins, fill_value=0)
            o[col] = _scoped(bb, col, among).groupby('accession')[col].sum().reindex(proteins, fill_value=0)
    rows = []
    for cat in cats:
        nt_arr, no_arr = (x.to_numpy(dtype=np.int64) for x in n_by.get(cat, (n_t, n_o)))
        a = t[cat].to_numpy(dtype=np.int64)
        c = o[cat].to_numpy(dtype=np.int64)
        tables = [(int(x), int(y - x), int(z), int(w - z)) for x, y, z, w in zip(a, nt_arr, c, no_arr)]
        odds, lo, hi, p, used = stats.mantel_haenszel_ci(tables)
        rows.append(
            {
                'analysis': analysis,
                'category': cat,
                'stratum': stratum,
                'a': int(a.sum()),
                'b': int(nt_arr.sum() - a.sum()),
                'c': int(c.sum()),
                'd': int(no_arr.sum() - c.sum()),
                'odds_ratio': odds,
                'log2_odds_ratio': math.log2(odds) if odds and odds > 0 and math.isfinite(odds) else None,
                'odds_ratio_ci_low': lo,
                'odds_ratio_ci_high': hi,
                'p': p,
                'method': 'mantel_haenszel',
                'background': _label_for(label, cat),
                'n_strata': used,
            }
        )
    if rows:
        q = stats.benjamini_hochberg(pd.Series([r['p'] for r in rows], dtype=float))
        for r, v in zip(rows, q):
            r['q'] = v
    return _ordered(rows, order)
