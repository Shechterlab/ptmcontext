"""Motif families around each residue, from the mark profile's rules (a 'flags' layer)."""
from __future__ import annotations

import pandas as pd

from . import Context, register


@register('motif', 'flags', "the mark profile's motif families, read in the window around each residue", title='Sequence motifs',
          question='Which sequence motifs surround {marks}, against the other {residues} of the same proteins?',
          sub='Motifs around {marked} vs other {residues} of the same proteins')
def motif(residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
    if ctx.profile is None:
        raise ValueError('the motif layer needs a mark profile')
    windows = ctx.snapshot.windows(residues, ctx.profile.motif_flank)
    return ctx.profile.motif_flags(windows)
