"""The charge of the IDR a residue sits in: its region of the Das-Pappu diagram of states (ptmcontext.charge).

  idr_charge  r1 to r5 for a residue inside an IDR (the IDR's region: weakly charged, Janus, strong polyampholyte,
              strongly negative, strongly positive); outside_idr; no_idr (a protein without an IDR of min_length or more, 20 by default)

Not in the Methylarginine Site Explorer's releases: a question the rebuild adds. Each IDR is drawn on the protein pages
(units.tsv), and its parameters (f+, f-, FCR, NCPR, kappa, region) are the track's values: the run writes them, with
the marks and other candidate residues inside each IDR, to units_idr.tsv, which the website's IDRs page reads.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .. import charge as CH
from . import Context, Track, register
from .context import IDR_MIN_LENGTH, idr_units

LABELS = {
    'r1': 'Weakly charged IDR',
    'r2': 'Janus IDR',
    'r3': 'Strong polyampholyte IDR',
    'r4': 'Negatively charged IDR',
    'r5': 'Positively charged IDR',
    'outside_idr': 'Not in an IDR',
    'no_idr': 'No IDR of <min_length> aa or more',
}
HELP = {
    'r1': 'In an IDR with fewer than a quarter of its residues charged (FCR < 0.25): weak polyampholytes and polyelectrolytes',
    'r2': 'In an IDR with a quarter to a third of its residues charged (FCR 0.25 to 0.35): Janus sequences',
    'r3': 'In an IDR with more than a third charged and the charges balanced (FCR > 0.35, |NCPR| < 0.35): strong polyampholytes',
    'r4': 'In an IDR with more than a third of its residues negative (D, E) and the rest not balancing them: strong polyelectrolytes',
    'r5': 'In an IDR with more than a third of its residues positive (K, R) and the rest not balancing them: strong polyelectrolytes',
    'outside_idr': 'Not inside an IDR of <min_length> or more residues',
    'no_idr': 'Protein has no disordered region of <min_length> or more residues',
}
# each IDR's parameters, written with it (Track.values): (column, label, definition)
VALUES = (
    ('f_plus', 'f+', 'Fraction of the IDR’s residues that are positive (K, R)'),
    ('f_minus', 'f−', 'Fraction of the IDR’s residues that are negative (D, E)'),
    ('fcr', 'FCR', 'Fraction of charged residues: f+ + f−'),
    ('ncpr', 'NCPR', 'Net charge per residue: f+ − f−'),
    (
        'kappa',
        'κ',
        'How far the IDR’s charges are segregated from each other: 0 well mixed, 1 fully segregated (Das & Pappu 2013); '
        'none without charged residues',
    ),
    ('region', 'Das–Pappu region', 'Its region of the diagram of states, 1 to 5 (the class r1 to r5)'),
    # the mark file's sticker residues along the IDR: described, not tested (Martin et al. 2020)
    (
        'stickers',
        'Stickers',
        'Number of sticker residues (those the mark file names) in the IDR; empty when it names none',
    ),
    (
        'sticker_spacing',
        'Sticker spacing',
        'Median distance, in residues, between neighboring sticker residues of the IDR (evenly spaced stickers have a small spread, clustered ones a few short gaps and long stretches); none with fewer than two stickers',
    ),
    (
        'sticker_free',
        'Longest stretch without a sticker',
        'Longest run of residues of the IDR with no sticker residue, counted to its ends',
    ),
)


def sticker_patterning(segment: str, letters: set) -> tuple[int, float | None, int]:
    """(number of sticker residues, median spacing between neighbors, longest stretch without one) of an IDR's sequence."""
    at = [i for i, c in enumerate(segment) if c in letters]
    if not at:
        return 0, None, len(segment)
    gaps = [b - a for a, b in zip(at, at[1:])]
    free = max([at[0], len(segment) - 1 - at[-1], *[g - 1 for g in gaps]])
    return len(at), (float(np.median(gaps)) if gaps else None), free


def idr_charge_units(ctx: Context, accessions: set, min_length: int = IDR_MIN_LENGTH) -> pd.DataFrame:
    """The IDRs of these proteins with their charge parameters and a label for the protein pages. Each protein's are
    worked out once per run and kept (ctx 'units:idr_charge' holds every one worked out so far)."""
    tag = '' if min_length == IDR_MIN_LENGTH else f':{min_length}'
    done = ctx.cached('idr_charge:done' + tag, set)
    todo = set(accessions) - done
    if todo:
        units = idr_units(ctx, min_length)
        units = units[units['accession'].isin(todo)].copy()
        params = [
            CH.charge(ctx.snapshot.sequences[a][s - 1 : e])
            for a, s, e in zip(units['accession'], units['start'], units['end'])
        ]
        for f in ('f_plus', 'f_minus', 'fcr', 'ncpr', 'kappa', 'region'):
            units[f] = [getattr(c, f) for c in params]
        st = ctx.profile.stickers if ctx.profile is not None else None
        pat = [
            sticker_patterning(ctx.snapshot.sequences[a][s - 1 : e], set(st['residues'])) if st else (None, None, None)
            for a, s, e in zip(units['accession'], units['start'], units['end'])
        ]
        units['stickers'], units['sticker_spacing'], units['sticker_free'] = ([x[i] for x in pat] for i in range(3))
        units['class'] = [f'r{c.region}' for c in params]
        units['label'] = [
            f'{LABELS[f"r{c.region}"]}: FCR {c.fcr:.2f}, NCPR {c.ncpr:+.2f}, κ {c.kappa:.2f}'
            if c.kappa is not None
            else f'{LABELS[f"r{c.region}"]}: no charged residue'
            for c in params
        ]
        before = ctx._cache.get('units:idr_charge' + tag)
        ctx._cache['units:idr_charge' + tag] = (
            units if before is None else pd.concat([before, units]).sort_values(['accession', 'start'], kind='stable')
        )
        done |= todo
    every = ctx._cache.get('units:idr_charge' + tag)
    return every[every['accession'].isin(accessions)] if every is not None else idr_units(ctx, min_length).iloc[:0]


@register(
    'idr_charge',
    'class',
    'The Das-Pappu region of the IDR (the disorder input’s regions merged, <min_length> residues or more) a residue sits '
    'in, from its fractions of positive (K, R) and negative (D, E) residues; outside_idr; no_idr',
    needs=('disorder',),
    title='Charge of the IDR',
    labels=LABELS,
    help=HELP,
    question='Do {marks} sit in IDRs of a particular charge, against the other {residues} of the same proteins?',
    sub='{Marks} against the other {residues} of the same proteins, by the charge class of the IDR they sit in (Das–Pappu diagram of states)',
    tracks=(
        lambda values: Track(
            'idr',
            'IDR charge',
            'segments',
            lambda ctx, accs: idr_charge_units(ctx, accs, values['min_length']),
            roles=('disorder',),
            help=f'IDRs (disordered regions merged, {values["min_length"]} residues or more), each in its region of the Das–Pappu diagram of states (from its FCR and NCPR)',
            # negative polyelectrolytes red and positive blue, as the map's charge row
            colours=(('r1', '#9DB8C7'), ('r2', '#E2B44C'), ('r3', '#8E7CC3'), ('r4', '#D64545'), ('r5', '#2F6FD6')),
            values=VALUES,
        ),
    ),
    params={'min_length': IDR_MIN_LENGTH},
)
def idr_charge(residues: pd.DataFrame, ctx: Context, min_length: int = IDR_MIN_LENGTH) -> pd.DataFrame:
    accs = set(residues['accession'])
    units = idr_charge_units(ctx, accs, min_length)
    category = np.where(
        residues['accession'].isin(set(idr_units(ctx, min_length)['accession'])), 'outside_idr', 'no_idr'
    ).astype(object)
    pos = residues['position'].to_numpy(dtype=np.int64)
    by = residues.groupby('accession', sort=False).indices
    for a, g in units.groupby('accession', sort=False):
        idx = by.get(a)
        if idx is None:
            continue
        starts, ends, regions = g['start'].to_numpy(), g['end'].to_numpy(), g['region'].to_numpy()
        k = np.searchsorted(starts, pos[idx], side='right') - 1  # the IDR starting at or before each residue
        inside = (k >= 0) & (pos[idx] <= ends[np.clip(k, 0, None)])
        category[idx[inside]] = ['r' + str(r) for r in regions[k[inside]]]
    return pd.DataFrame({'category': category}, index=residues.index)
