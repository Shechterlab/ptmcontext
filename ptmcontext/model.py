"""Which factors tell a marked residue from the other candidate residues of its protein, taken together?

The residue questions test one class at a time. This is the several-factors version of the within-protein test: a
conditional logistic regression (ptmstats.conditional_logit; the multi-covariate generalisation of Mantel-Haenszel,
Breslow & Day 1980), one stratum per protein, the marked residues the cases and the other candidate residues the
controls. Each factor's adjusted odds ratio is its association with a mark holding the other factors fixed; the same
factor alone, in a model of its own, is its crude odds ratio. A site file lists the factors (covariates):

  {name, label, help, layer: <layer>, with: {...}, is: [class, ...]}    1 for a residue in one of the layer's classes
  {name, ..., layer: <layer>, flags: [flag, ...]}                       1 for a residue with any of a flags layer's flags
  {name, ..., window_sum: {window: 7, weights: {K: 1, R: 1, D: -1, E: -1}}, per: 1}
                                                                        the sum of the weights of the residues within
                                                                        the window (the residue itself left out), per
                                                                        `per` units: a local net charge, say

Rows (statistics.COLUMNS): one per factor and model, method conditional_logit, stratum 'adjusted' (all factors
together) or 'alone' (that factor only), category the factor's name. odds_ratio, its Wald 95% interval, p (Wald) and q
(Benjamini-Hochberg over the factors of the model) are the regression's; n_strata is the proteins that carry
information (a mark and another candidate residue). a, b, c, d count the marked residues with and without a yes-or-no
factor and the other candidate residues with and without it; a numeric factor has a (marked residues) and c (others)
only. Whole dataset: the browser cannot refit it for a selection.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import layers as L
from . import stats
from .residue_tests import candidates_and_marks, inside_regions

BACKGROUND = 'other {residues} of the same protein, each protein a stratum, in a model of the factors together or alone'


def covariate_columns(spec: dict) -> list[str]:
    return [c['name'] for c in spec['covariates']]


def covariate_roles(spec: dict) -> list[str]:
    """The roles the factors' layers read."""
    out = []
    for c in spec.get('covariates', []):
        if c.get('layer'):
            try:
                out += list(L.get(c['layer'], None, c.get('with'), spec['id']).needs)
            except (ValueError, KeyError, TypeError):
                pass
    return list(dict.fromkeys(out))


def covariate_problems(spec: dict) -> list[str]:
    out, seen = [], set()
    if not spec.get('covariates'):
        return [f"{spec['id']}: a conditional_logit analysis needs covariates"]
    for c in spec['covariates']:
        where = f"{spec['id']}: covariate {c.get('name')!r}"
        if c['name'] in seen:
            out.append(f'{where} is listed twice')
        seen.add(c['name'])
        kinds = [k for k in ('layer', 'window_sum') if c.get(k)]
        if len(kinds) != 1:
            out.append(f'{where} needs layer: or window_sum: (one of them)')
        elif c.get('layer'):
            if c['layer'] not in L.BUILT_IN and c['layer'] not in L.FACTORIES:
                out.append(f"{where}: no layer {c['layer']!r}")
                continue
            try:
                layer = L.get(c['layer'], None, c.get('with'), spec['id'])
            except (ValueError, KeyError, TypeError) as exc:
                out.append(f'{where}: {exc}')
                continue
            if bool(c.get('is')) == bool(c.get('flags')):
                out.append(f'{where} needs is: (classes of a class layer) or flags: (flags of a flags layer), one of them')
            elif c.get('is') and layer.shape != 'class':
                out.append(f"{where}: is: reads a class layer; {c['layer']!r} makes flags")
            elif c.get('flags') and layer.shape != 'flags':
                out.append(f"{where}: flags: reads a flags layer; {c['layer']!r} makes classes")
            elif c.get('is') and layer.labels and set(c['is']) - set(layer.labels):
                out.append(f"{where}: {c['layer']!r} has no class {sorted(set(c['is']) - set(layer.labels))} (it has {sorted(layer.labels)})")
        elif not (c['window_sum'].get('weights') and c['window_sum'].get('window')):
            out.append(f'{where}: window_sum needs window and weights')
    return out


def window_sum(residues: pd.DataFrame, sequences: dict, window: int, weights: dict) -> np.ndarray:
    """For each (accession, position) row, the sum of the weights of the residues within window of it along the chain,
    the residue itself left out."""
    from .layers.configured import sticker_counts
    total = np.zeros(len(residues))
    for letter, w in weights.items():
        total += float(w) * sticker_counts(residues, sequences, {letter}, window)
    return total


def design(ctx: L.Context, spec: dict, cand: pd.DataFrame) -> pd.DataFrame:
    """The factors (one column each, in the site file's order) of the candidate residues."""
    cols = {}
    for c in spec['covariates']:
        if c.get('window_sum'):
            ws = c['window_sum']
            cols[c['name']] = window_sum(cand, ctx.snapshot.sequences, int(ws['window']), ws['weights']) / float(c.get('per', 1))
            continue
        layer = L.get(c['layer'], ctx, c.get('with'), spec['id'])
        got = layer(cand, ctx)
        if c.get('is'):
            cols[c['name']] = got['category'].isin(set(c['is'])).to_numpy().astype(float)
        else:
            cols[c['name']] = got[list(c['flags'])].any(axis=1).to_numpy().astype(float)
    return pd.DataFrame(cols, index=cand.index)


def conditional_model(ctx: L.Context, marked: pd.DataFrame, spec: dict, left_out: pd.DataFrame | None = None,
                      proteins: set | None = None) -> tuple[pd.DataFrame, dict]:
    """(statistics rows, a record of the fit) of the analysis's conditional logistic regression on the marked residues
    and the other candidate residues of the marked proteins."""
    if proteins is not None:
        marked = marked[marked['accession'].isin(proteins)]
    cand, is_marked, is_left = candidates_and_marks(ctx, marked, left_out)
    if spec.get('only_in'):
        inside = inside_regions(ctx, cand, spec['only_in'])
        cand, is_marked, is_left = cand[inside], is_marked[inside], is_left[inside]
    keep = ~is_left.to_numpy()
    cand, y = cand[keep], is_marked.to_numpy()[keep].astype(int)
    X = design(ctx, spec, cand)
    strata = cand['accession'].to_numpy()
    names = covariate_columns(spec)
    # proteins that carry information: a mark and another candidate residue
    per = pd.DataFrame({'a': strata, 'y': y}).groupby('a')['y'].agg(['sum', 'size'])
    used = set(per.index[(per['sum'] > 0) & (per['sum'] < per['size'])])
    inc = np.isin(strata, list(used))
    Xv, yv, sv = X.to_numpy()[inc], y[inc], strata[inc]
    flat = [n for j, n in enumerate(names) if np.ptp(Xv[:, j]) == 0] if len(Xv) else list(names)
    fit_names = [n for n in names if n not in flat]
    rows, record = [], {'covariates': names, 'dropped': flat, 'strata': len(used), 'marks': int(yv.sum()), 'residues': int(len(yv))}
    fits = {}
    if fit_names:
        cols = [names.index(n) for n in fit_names]
        fits['adjusted'] = (fit_names, stats.conditional_logit(yv, Xv[:, cols], sv, fit_names))
        for n in fit_names:
            fits.setdefault('alone', []).append(stats.conditional_logit(yv, Xv[:, [names.index(n)]], sv, [n]))
        record.update(converged=bool(fits['adjusted'][1]['converged']), loglik=fits['adjusted'][1]['loglik'],
                      null_loglik=fits['adjusted'][1]['null_loglik'], lr_p=fits['adjusted'][1]['lr_p'])
    label = BACKGROUND.format(residues=ctx.profile.word('residues'))
    for stratum in ('adjusted', 'alone'):
        block = []
        for n in names:
            binary = set(np.unique(X[n])) <= {0.0, 1.0}
            m, o = y == 1, y == 0
            sel = np.isin(strata, list(used))
            xm, xo = X[n].to_numpy()[sel & m], X[n].to_numpy()[sel & o]
            if binary:
                a, c = int((xm == 1).sum()), int((xo == 1).sum())
                counts = {'a': a, 'b': len(xm) - a, 'c': c, 'd': len(xo) - c}
            else:
                counts = {'a': len(xm), 'b': None, 'c': len(xo), 'd': None}
            row = {'analysis': spec['id'], 'category': n, 'stratum': stratum, **counts, 'method': 'conditional_logit',
                   'background': label, 'n_strata': len(used)}
            if n in fit_names:
                r = fits['adjusted'][1] if stratum == 'adjusted' else fits['alone'][fit_names.index(n)]
                j = r['names'].index(n)
                if r['converged']:
                    f = r['odds_ratio'][j]
                    row.update(odds_ratio=f, log2_odds_ratio=stats.log2_or_nan(f), odds_ratio_ci_low=r['ci_low'][j],
                               odds_ratio_ci_high=r['ci_high'][j], p=r['p'][j])
            block.append(row)
        q = stats.benjamini_hochberg(pd.Series([r.get('p', np.nan) for r in block], dtype=float))
        for r, v in zip(block, q):
            r['q'] = v
        rows += block
    return pd.DataFrame(rows), record
