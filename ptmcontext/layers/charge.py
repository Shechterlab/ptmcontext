"""The charge of the IDR a residue sits in: its region of the Das-Pappu diagram of states (ptmcontext.charge).

  idr_charge  r1 to r5 for a residue inside an IDR (the IDR's region: weakly charged, Janus, strong polyampholyte,
              strongly negative, strongly positive); outside_idr; no_idr (a protein without an IDR of 20 or more)

Not in the Methylarginine Site Explorer's releases: a question the rebuild adds. Each IDR's parameters (f+, f-, FCR,
NCPR, kappa, region) are kept with the run's regions (units.tsv) for the protein pages.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import charge as CH
from . import Context, Track, register
from .context import idr_units

LABELS = {'r1': 'Weakly charged IDR', 'r2': 'Janus IDR', 'r3': 'Strong polyampholyte IDR',
          'r4': 'Negatively charged IDR', 'r5': 'Positively charged IDR', 'outside_idr': 'Not in an IDR', 'no_idr': 'No IDR of 20 aa or more'}
HELP = {'r1': 'In an IDR with fewer than a quarter of its residues charged (FCR < 0.25): weak polyampholytes and polyelectrolytes',
        'r2': 'In an IDR with a quarter to a third of its residues charged (FCR 0.25 to 0.35): Janus sequences',
        'r3': 'In an IDR with more than a third charged and the charges balanced (FCR > 0.35, |NCPR| < 0.35): strong polyampholytes',
        'r4': 'In an IDR with more than a third of its residues negative (D, E) and the rest not balancing them: strong polyelectrolytes',
        'r5': 'In an IDR with more than a third of its residues positive (K, R) and the rest not balancing them: strong polyelectrolytes',
        'outside_idr': 'Not inside an IDR of 20 or more residues',
        'no_idr': 'Protein has no disordered region of 20 or more residues'}


def idr_charge_units(ctx: Context, accessions: set) -> pd.DataFrame:
    """The IDRs of these proteins with their charge parameters and a label for the protein pages. Each protein's are
    worked out once per run and kept (ctx 'units:idr_charge' holds every one worked out so far)."""
    done = ctx.cached('idr_charge:done', set)
    todo = set(accessions) - done
    if todo:
        units = idr_units(ctx)
        units = units[units['accession'].isin(todo)].copy()
        params = [CH.charge(ctx.snapshot.sequences[a][s - 1:e]) for a, s, e in zip(units['accession'], units['start'], units['end'])]
        for f in ('f_plus', 'f_minus', 'fcr', 'ncpr', 'kappa', 'region'):
            units[f] = [getattr(c, f) for c in params]
        units['class'] = [f'r{c.region}' for c in params]
        units['label'] = [f"{LABELS[f'r{c.region}']}: FCR {c.fcr:.2f}, NCPR {c.ncpr:+.2f}, κ {c.kappa:.2f}" if c.kappa is not None
                          else f"{LABELS[f'r{c.region}']}: no charged residue" for c in params]
        before = ctx._cache.get('units:idr_charge')
        ctx._cache['units:idr_charge'] = units if before is None else pd.concat([before, units]).sort_values(['accession', 'start'], kind='stable')
        done |= todo
    every = ctx._cache.get('units:idr_charge')
    return every[every['accession'].isin(accessions)] if every is not None else idr_units(ctx).iloc[:0]


@register('idr_charge', 'class', 'The Das-Pappu region of the IDR (the disorder input’s regions merged, 20 residues or more) a residue sits '
          'in, from its fractions of positive (K, R) and negative (D, E) residues; outside_idr; no_idr',
          needs=('disorder',), title='Charge of the IDR', labels=LABELS, help=HELP,
          question='Do {marks} sit in IDRs of a particular charge, against the other {residues} of the same proteins?',
          sub='{Marks} against the other {residues} of the same proteins, by the charge class of the IDR they sit in (Das–Pappu diagram of states)',
          tracks=(Track('idr', 'IDR charge', 'segments', lambda ctx, accs: idr_charge_units(ctx, accs), roles=('disorder',),
                        help='IDRs (disordered regions merged, 20 residues or more) coloured by their region of the Das–Pappu diagram of states (FCR and NCPR)'),))
def idr_charge(residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
    accs = set(residues['accession'])
    units = idr_charge_units(ctx, accs)
    category = np.where(residues['accession'].isin(set(idr_units(ctx)['accession'])), 'outside_idr', 'no_idr').astype(object)
    pos = residues['position'].to_numpy(dtype=np.int64)
    by = residues.groupby('accession', sort=False).indices
    for a, g in units.groupby('accession', sort=False):
        idx = by.get(a)
        if idx is None:
            continue
        starts, ends, regions = g['start'].to_numpy(), g['end'].to_numpy(), g['region'].to_numpy()
        k = np.searchsorted(starts, pos[idx], side='right') - 1          # the IDR starting at or before each residue
        inside = (k >= 0) & (pos[idx] <= ends[np.clip(k, 0, None)])
        category[idx[inside]] = ['r' + str(r) for r in regions[k[inside]]]
    return pd.DataFrame({'category': category}, index=residues.index)
