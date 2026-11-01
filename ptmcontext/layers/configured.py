"""Layers made from a site file's parameters, so that a new table becomes a new question without code.

  regions          residues inside, near, further from, or on a protein without the regions of any table (a role
                   filled by any interval table: a unit table, or any layout its manifest entry maps with `columns`)
  residue_values   residues by a per-residue value (pLDDT, a conservation or variant-effect score), cut into classes at
                   the site's thresholds (a role filled by a per-residue table mapped with `columns`)

An analysis names one with its parameters:

  - {id: condensates, layer: regions, with: {role: condensates, noun: condensate-forming region}}
  - {id: plddt, layer: residue_values, with: {role: plddt, bins: [50, 70, 90],
                                               classes: [very_low, low, confident, very_high]}}

Each draws its regions (or its runs of residues in one class) as a row of the protein map. Words a page shows (title,
question, sub, labels, help, section, track, track_help) and the row's colours (colours: {class: colour}) may be given
with the parameters; otherwise they are made from the noun.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import Layer, Track, factory
from .context import unit_context


def _art(noun: str) -> str:
    return ('an ' if noun[:1].lower() in 'aeiou' else 'a ') + noun


def _words(params: dict, default_title: str, default_question: str, default_sub: str) -> dict:
    return {'title': params.get('title', default_title), 'question': params.get('question', default_question),
            'sub': params.get('sub', default_sub), 'section': params.get('section', 'Structural context')}


def _need(params: dict, aid: str, *keys: str) -> None:
    missing = [k for k in keys if k not in params]
    if missing:
        raise ValueError(f'analysis {aid!r}: with: needs {missing}')


@factory('regions')
def regions(params: dict, aid: str) -> Layer:
    """Inside, within a window of, further from, or on a protein without the regions of any interval table."""
    _need(params, aid, 'role')
    role, kind, w = params['role'], params.get('kind', params['role']), int(params.get('window', 20))
    noun = params.get('noun', kind.replace('_', ' ') + ' region')
    nouns = params.get('nouns', noun + 's')
    code = params.get('code', aid)
    codes = {'inside': f'in_{code}', 'near': f'{code}_boundary', 'far': f'outside_{code}', 'none': f'no_{code}'}
    labels = {codes['inside']: f'In {_art(noun)}', codes['near']: f'Outside, ≤{w} aa from {_art(noun)}',
              codes['far']: f'More than {w} aa from {_art(noun)}', codes['none']: f'Protein has no {noun}'}
    helps = {codes['inside']: f'Inside {_art(noun)} (the site’s {role} input)', codes['near']: f'Outside, but within {w} residues of, {_art(noun)}',
             codes['far']: f'More than {w} residues from any {noun}', codes['none']: f'The protein has no {noun} in the {role} input'}
    labels.update(params.get('labels', {}))
    helps.update(params.get('help', {}))

    def compute(residues: pd.DataFrame, ctx) -> pd.DataFrame:
        return unit_context(residues, ctx.units(role, kind), ctx.snapshot.lengths(), w, codes)

    def drawn(ctx, accs: set) -> pd.DataFrame:
        u = ctx.units(role, kind)
        return u[u['accession'].isin(accs)]
    track = Track(kind, params.get('track', nouns[:1].upper() + nouns[1:]), 'segments', drawn, roles=(role,),
                  help=params.get('track_help', f'{nouns[:1].upper() + nouns[1:]}: the site’s {role} input'),
                  colours=tuple((params.get('colours') or {}).items()))
    return Layer('regions', 'class', f'{noun}s ({role}): inside, within {w} residues, further, or none', compute, needs=(role,),
                 labels=labels, help=helps, tracks=(track,),
                 **_words(params, nouns[:1].upper() + nouns[1:], f'Are {{marks}} in {nouns}, against the other {{residues}} of the same proteins?',
                          f'{{Marks}} against the other {{residues}} of the same proteins, by {nouns}'))


@factory('residue_values')
def residue_values(params: dict, aid: str) -> Layer:
    """Residues by a per-residue value, cut into classes at the site's thresholds (bins)."""
    _need(params, aid, 'role', 'bins', 'classes')
    role, bins, classes = params['role'], [float(b) for b in params['bins']], list(params['classes'])
    if sorted(bins) != bins or len(classes) != len(bins) + 1:
        raise ValueError(f'analysis {aid!r}: bins must ascend, and classes must be one more than bins')
    missing = params.get('missing', 'no_value')
    noun = params.get('noun', role.replace('_', ' '))
    edges = [None, *bins, None]
    labels = {c: params.get('labels', {}).get(c) or (f'{noun} < {edges[i + 1]:g}' if edges[i] is None else
              f'{noun} ≥ {edges[i]:g}' if edges[i + 1] is None else f'{noun} {edges[i]:g} to {edges[i + 1]:g}')
              for i, c in enumerate(classes)}
    labels[missing] = params.get('labels', {}).get(missing, f'No {noun}')
    helps = {c: f'{labels[c]} (the site’s {role} input)' for c in classes} | {missing: f'The {role} input has no value for the residue'}
    helps.update(params.get('help', {}))

    def classify(values: np.ndarray) -> np.ndarray:
        out = np.array(classes, dtype=object)[np.searchsorted(np.asarray(bins), values, side='right')]
        out[np.isnan(values)] = missing
        return out

    def compute(residues: pd.DataFrame, ctx) -> pd.DataFrame:
        v = ctx.values(role).set_index(['accession', 'position'])['value']
        idx = pd.MultiIndex.from_arrays([residues['accession'], residues['position']])
        vals = v.reindex(idx).to_numpy(dtype=float)
        return pd.DataFrame({'category': classify(vals)}, index=residues.index)

    def drawn(ctx, accs: set) -> pd.DataFrame:
        """Runs of consecutive residues in one class, one unit each."""
        v = ctx.values(role)
        v = v[v['accession'].isin(accs)].sort_values(['accession', 'position'])
        if not len(v):
            return pd.DataFrame(columns=['accession', 'start', 'end', 'label', 'source', 'class'])
        cls = classify(v['value'].to_numpy(dtype=float))
        acc, pos = v['accession'].to_numpy(), v['position'].to_numpy()
        new = np.r_[True, (acc[1:] != acc[:-1]) | (pos[1:] != pos[:-1] + 1) | (cls[1:] != cls[:-1])]
        run = np.cumsum(new)
        g = pd.DataFrame({'accession': acc, 'position': pos, 'class': cls, 'value': v['value'].to_numpy(), 'run': run}).groupby('run')
        out = g.agg(accession=('accession', 'first'), start=('position', 'min'), end=('position', 'max'), cls=('class', 'first'),
                    lo=('value', 'min'), hi=('value', 'max')).reset_index(drop=True)
        out['label'] = [f'{labels[c]}: {lo:g} to {hi:g}' if lo != hi else f'{labels[c]}: {lo:g}' for c, lo, hi in zip(out['cls'], out['lo'], out['hi'])]
        out['source'] = role
        return out.rename(columns={'cls': 'class'})[['accession', 'start', 'end', 'label', 'source', 'class']]
    title = params.get('title', noun[:1].upper() + noun[1:])
    track = Track(params.get('kind', aid), params.get('track', title), 'segments', drawn, roles=(role,),
                  help=params.get('track_help', f'{title} along the chain, in the classes of the question (the site’s {role} input)'),
                  colours=tuple((params.get('colours') or {}).items()))
    return Layer('residue_values', 'class', f'{noun} ({role}) in classes at {bins}; {missing} without a value', compute, needs=(role,),
                 labels=labels, help=helps, tracks=(track,),
                 **_words(params, title, f'Do {{marks}} sit at a particular {noun}, against the other {{residues}} of the same proteins?',
                          f'{{Marks}} against the other {{residues}} of the same proteins, by {noun}'))
