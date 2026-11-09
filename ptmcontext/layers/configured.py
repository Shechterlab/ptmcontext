"""Layers made from a site file's parameters, so that a new table becomes a new question without code.

  regions          residues inside, near, further from, or on a protein without the regions of any table (a role
                   filled by any interval table: a unit table, or any layout its manifest entry maps with `columns`)
  residue_values   residues by a per-residue value (pLDDT, a conservation or variant-effect score), cut into classes at
                   the site's thresholds (a role filled by a per-residue table mapped with `columns`)
  residue_lists    flags: whether a residue is listed in each of several tables (a change seen in tumors, a crosslink),
                   each table a role filled by a list of residues mapped with `columns` {accession, position}
  neighbors       residues by how many residues of a set (the profile's stickers, or with: residues) lie within a
                   window along the chain, the residue itself left out: none, one, two_plus (with: window, and
                   two_plus, the count that makes the last class, default 2)

An analysis names one with its parameters:

  - {id: condensates, layer: regions, with: {role: condensates, noun: condensate-forming region}}
  - {id: plddt, layer: residue_values, with: {role: plddt, bins: [50, 70, 90],
                                               classes: [very_low, low, confident, very_high]}}
  - {id: changes, layer: residue_lists, with: {flags: {in_tumours: tumour_changes, in_cell_lines: line_changes}}}

The classes they make (for filters, website.protein.facts and labels):

  regions          in_<code>, <code>_boundary, outside_<code>, no_<code> (code: the analysis id, or with: code)
  residue_values   the classes given, from the lowest bin up (a value equal to a threshold goes to the class above
                   it), and missing (default no_value) for a residue without a value
  residue_lists    the flags given, in their order (a residue may carry several, or none)
  neighbors       none, one, two_plus (a residue is in exactly one)

Their classes have an order (inside to far, the lowest bin up), which the website keeps (ordered; the site file's
analysis may say `ordered: false`, or give headed `groups` of them). Each draws its regions (or its runs of residues in
one class) as a row of the protein map. Words a page shows (title,
question, sub, labels, help, section, track, track_help) and the row's colors (colours: {class: color}) may be given
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
    return {
        'title': params.get('title', default_title),
        'question': params.get('question', default_question),
        'sub': params.get('sub', default_sub),
        'section': params.get('section', 'Structural context'),
    }


WORDS = {'title', 'question', 'sub', 'section', 'labels', 'help', 'noun', 'track', 'track_help', 'colours'}
ALLOWED = {
    'regions': WORDS | {'role', 'kind', 'window', 'nouns', 'code'},
    'residue_values': WORDS | {'role', 'kind', 'bins', 'classes', 'missing'},
    'residue_lists': WORDS - {'track', 'track_help', 'colours'} | {'flags'},
    'neighbours': WORDS - {'track', 'track_help', 'colours'} | {'residues', 'window', 'many'},
}


def _need(params: dict, aid: str, *keys: str, layer: str = '') -> None:
    missing = [k for k in keys if k not in params]
    if missing:
        raise ValueError(f'analysis {aid!r}: with: needs {missing}')
    unknown = sorted(set(params) - ALLOWED.get(layer, set(params)))
    if unknown:
        raise ValueError(
            f'analysis {aid!r}: with: has keys layer {layer} does not know: {unknown} (it knows {sorted(ALLOWED[layer])})'
        )


def _cap(text: str) -> str:
    """The first letter capitalized, unless the word is written with capitals inside (pLDDT, mRNA)."""
    first = text.split(' ')[0]
    return text if any(c.isupper() for c in first[1:]) else text[:1].upper() + text[1:]


@factory('regions')
def regions(params: dict, aid: str) -> Layer:
    """Inside, within a window of, further from, or on a protein without the regions of any interval table."""
    _need(params, aid, 'role', layer='regions')
    role, kind, w = params['role'], params.get('kind', params['role']), int(params.get('window', 20))
    noun = params.get('noun', kind.replace('_', ' ') + ' region')
    nouns = params.get('nouns', noun + 's')
    code = params.get('code', aid)
    codes = {'inside': f'in_{code}', 'near': f'{code}_boundary', 'far': f'outside_{code}', 'none': f'no_{code}'}
    labels = {
        codes['inside']: f'In {_art(noun)}',
        codes['near']: f'Outside, ≤{w} aa from {_art(noun)}',
        codes['far']: f'More than {w} aa from {_art(noun)}',
        codes['none']: f'Protein has no {noun}',
    }
    helps = {
        codes['inside']: f'Inside {_art(noun)} (the site’s {role} input)',
        codes['near']: f'Outside, but within {w} residues of, {_art(noun)}',
        codes['far']: f'More than {w} residues from any {noun}',
        codes['none']: f'The protein has no {noun} in the {role} input',
    }
    labels.update(params.get('labels', {}))
    helps.update(params.get('help', {}))

    def compute(residues: pd.DataFrame, ctx) -> pd.DataFrame:
        return unit_context(residues, ctx.units(role, kind), ctx.snapshot.lengths(), w, codes)

    def drawn(ctx, accs: set) -> pd.DataFrame:
        u = ctx.units(role, kind)
        return u[u['accession'].isin(accs)]

    track = Track(
        kind,
        params.get('track', _cap(nouns)),
        'segments',
        drawn,
        roles=(role,),
        help=params.get('track_help', f'{_cap(nouns)}: the site’s {role} input'),
        colours=tuple((params.get('colours') or {}).items()),
    )
    return Layer(
        'regions',
        'class',
        f'{noun}s ({role}): inside, within {w} residues, further, or none',
        compute,
        needs=(role,),
        labels=labels,
        help=helps,
        tracks=(track,),
        ordered=True,
        **_words(
            params,
            _cap(nouns),
            f'Are {{marks}} in {nouns}, against the other {{residues}} of the same proteins?',
            f'{{Marks}} against the other {{residues}} of the same proteins, by {nouns}',
        ),
    )


@factory('residue_values')
def residue_values(params: dict, aid: str) -> Layer:
    """Residues by a per-residue value, cut into classes at the site's thresholds (bins)."""
    _need(params, aid, 'role', 'bins', 'classes', layer='residue_values')
    role, bins, classes = params['role'], [float(b) for b in params['bins']], list(params['classes'])
    if sorted(bins) != bins or len(classes) != len(bins) + 1:
        raise ValueError(f'analysis {aid!r}: bins must ascend, and classes must be one more than bins')
    missing = params.get('missing', 'no_value')
    noun = params.get('noun', role.replace('_', ' '))
    edges = [None, *bins, None]
    labels = {
        c: params.get('labels', {}).get(c)
        or (
            f'{noun} < {edges[i + 1]:g}'
            if edges[i] is None
            else f'{noun} ≥ {edges[i]:g}'
            if edges[i + 1] is None
            else f'{noun} {edges[i]:g} to {edges[i + 1]:g}'
        )
        for i, c in enumerate(classes)
    }
    labels[missing] = params.get('labels', {}).get(missing, f'No {noun}')
    helps = {c: f'{labels[c]} (the site’s {role} input)' for c in classes} | {
        missing: f'The {role} input has no value for the residue'
    }
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
        g = pd.DataFrame(
            {'accession': acc, 'position': pos, 'class': cls, 'value': v['value'].to_numpy(), 'run': run}
        ).groupby('run')
        out = g.agg(
            accession=('accession', 'first'),
            start=('position', 'min'),
            end=('position', 'max'),
            cls=('class', 'first'),
            lo=('value', 'min'),
            hi=('value', 'max'),
        ).reset_index(drop=True)
        out['label'] = [
            f'{labels[c]}: {lo:g} to {hi:g}' if lo != hi else f'{labels[c]}: {lo:g}'
            for c, lo, hi in zip(out['cls'], out['lo'], out['hi'])
        ]
        out['source'] = role
        return out.rename(columns={'cls': 'class'})[['accession', 'start', 'end', 'label', 'source', 'class']]

    title = params.get('title', _cap(noun))
    track = Track(
        params.get('kind', aid),
        params.get('track', title),
        'segments',
        drawn,
        roles=(role,),
        help=params.get(
            'track_help', f'{title} along the chain, in the classes of the question (the site’s {role} input)'
        ),
        colours=tuple((params.get('colours') or {}).items()),
    )
    return Layer(
        'residue_values',
        'class',
        f'{noun} ({role}) in classes at {bins}; {missing} without a value',
        compute,
        needs=(role,),
        labels=labels,
        help=helps,
        tracks=(track,),
        ordered=True,
        **_words(
            params,
            title,
            f'Do {{marks}} sit at a particular {noun}, against the other {{residues}} of the same proteins?',
            f'{{Marks}} against the other {{residues}} of the same proteins, by {noun}',
        ),
    )


@factory('residue_lists')
def residue_lists(params: dict, aid: str) -> Layer:
    """Flags: whether each residue is listed in each of several tables (flags: {flag: role})."""
    _need(params, aid, 'flags', layer='residue_lists')
    flags = params['flags']
    if not isinstance(flags, dict) or not flags or not all(isinstance(r, str) for r in flags.values()):
        raise ValueError(f'analysis {aid!r}: with: flags must map each flag to the role of a list of residues')
    noun = params.get('noun', 'listed residue')
    labels = {f: params.get('labels', {}).get(f, f'Listed in {role}') for f, role in flags.items()}
    helps = {
        f: params.get('help', {}).get(f, f'The residue is in the site’s {role} input') for f, role in flags.items()
    }

    def compute(residues: pd.DataFrame, ctx) -> pd.DataFrame:
        idx = pd.MultiIndex.from_arrays([residues['accession'], residues['position'].astype(int)])
        out = {}
        for f, role in flags.items():  # in the order given
            listed = ctx.listed(role)
            out[f] = idx.isin(pd.MultiIndex.from_arrays([listed['accession'], listed['position']]))
        return pd.DataFrame(out, index=residues.index)

    return Layer(
        'residue_lists',
        'flags',
        f'{noun}s: listed in {", ".join(flags.values())}',
        compute,
        needs=tuple(dict.fromkeys(flags.values())),
        labels=labels,
        help=helps,
        **_words(
            params,
            _cap(noun + 's'),
            f'Are {{marks}} {noun}s more often than the other {{residues}} of the same proteins?',
            f'{{Marks}} against the other {{residues}} of the same proteins: {noun}s',
        ),
    )


def sticker_counts(residues: pd.DataFrame, sequences: dict, letters: set, window: int) -> np.ndarray:
    """For each (accession, position) row, how many residues of the set lie within window residues of it along the
    chain, the residue itself left out (positions are 1-based; the ends of a chain have fewer neighbors)."""
    out = np.zeros(len(residues), dtype=np.int64)
    pos = residues['position'].to_numpy(dtype=np.int64)
    for acc, idx in residues.groupby('accession', sort=False).indices.items():
        seq = sequences.get(acc, '')
        hit = np.fromiter((c in letters for c in seq), dtype=np.int64, count=len(seq))
        cum = np.concatenate([[0], np.cumsum(hit)])
        p = pos[idx]
        lo, hi = np.clip(p - window - 1, 0, len(seq)), np.clip(p + window, 0, len(seq))
        valid = (p >= 1) & (p <= len(seq))
        own = np.zeros(len(p), dtype=np.int64)
        own[valid] = hit[p[valid] - 1]
        out[idx] = cum[hi] - cum[lo] - own
    return out


@factory('neighbours')
def neighbours(params: dict, aid: str) -> Layer:
    """Residues by how many residues of a set (stickers) lie within a window along the chain: none, one, two or more."""
    _need(params, aid, 'window', layer='neighbours')
    window, many = int(params['window']), int(params.get('many', 2))
    given = params.get('residues')
    given = list(given) if given else None
    noun = params.get('noun', 'sticker residue')
    codes = ('none', 'one', 'two_plus')

    def letters(ctx) -> set:
        st = ctx.profile.stickers if ctx.profile is not None else None
        if given:
            return set(given)
        if not st:
            raise ValueError(f'analysis {aid!r}: with: residues is needed, because the mark profile names no stickers')
        return set(st['residues'])

    labels = {
        'none': f'No {noun} within ±{window}',
        'one': f'One {noun} within ±{window}',
        'two_plus': f'{many} or more {noun}s within ±{window}',
    }
    helps = {
        'none': f'No {noun} among the {2 * window} residues on either side (±{window} along the chain)',
        'one': f'Exactly one {noun} within {window} residues on either side',
        'two_plus': f'{many} or more {noun}s within {window} residues on either side',
    }
    labels.update(params.get('labels', {}))
    helps.update(params.get('help', {}))

    def compute(residues: pd.DataFrame, ctx) -> pd.DataFrame:
        n = sticker_counts(residues, ctx.snapshot.sequences, letters(ctx), window)
        return pd.DataFrame(
            {'category': np.where(n == 0, codes[0], np.where(n < many, codes[1], codes[2])).astype(object)},
            index=residues.index,
        )

    return Layer(
        'neighbours',
        'class',
        f'residues by the number of sticker residues within ±{window}: none, one, {many} or more',
        compute,
        labels=labels,
        help=helps,
        ordered=True,
        **_words(
            params,
            params.get('title', f'Next to {noun}s (±{window})'),
            f'Are {{marks}} more often next to {noun}s, within {window} residues on either side, than the other {{residues}} of the same proteins?',
            f'{{Marks}} against the other {{residues}} of the same proteins, by how many {noun}s lie within {window} residues on either side',
        ),
    )
