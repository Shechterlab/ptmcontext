"""Charge parameters of a sequence, as CIDER defines them, written out from the published definitions:

  f+, f-        the fractions of positive (K, R) and negative (D, E) residues; histidine counts as neutral
  FCR, NCPR     fraction of charged residues (f+ + f-) and net charge per residue (f+ - f-)
  kappa         how far the charges are segregated: delta / delta_max (Das & Pappu 2013), where delta is the mean
                squared difference between the sequence's sigma = NCPR^2 / FCR and that of each window ("blob") of 5
                and of 6 residues, averaged over the two sizes; delta_max is the largest delta of any rearrangement of
                the same residues. 0 is well mixed, 1 fully segregated. Undefined (None) without charged residues.
  region        the Das-Pappu diagram of states: 1 weak polyampholytes and polyelectrolytes (FCR < 0.25), 2 Janus
                sequences (0.25 to 0.35), 3 strong polyampholytes (FCR > 0.35, |NCPR| < 0.35), 4 strong negative
                and 5 strong positive polyelectrolytes (f- or f+ > 0.35 otherwise)

References: Das RK, Pappu RV. PNAS 110:13392 (2013), doi:10.1073/pnas.1304749110; Holehouse AS et al. Biophys J 112:16
(2017), doi:10.1016/j.bpj.2016.11.3200 (localCIDER); Das RK, Ruff KM, Pappu RV. Curr Opin Struct Biol 32:102
(2015), doi:10.1016/j.sbi.2015.03.008 (the diagram's regions). This module shares no code with localCIDER (GPL-2.0)
and was not compared with it run for run.

delta_max is the best of a family of block arrangements (_candidates), not an exhaustive search. Checked
(tests/test_charge.py): it equals the best of every arrangement for 285 of the 302 compositions of 6 to 11 residues,
and is at most 6.3% lower for the others (short sequences, where the best arrangements nest two split blocks); for
39 compositions of 20 to 40 residues, no local search from 195 random arrangements beat it. Its kappa is therefore
exact or, for sequences under 12 residues, slightly high (it is capped at 1). IDRs here are 20 residues or more.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

POSITIVE, NEGATIVE = frozenset('KR'), frozenset('DE')
BLOBS = (5, 6)
REGIONS = {
    1: 'Weak polyampholytes and polyelectrolytes',
    2: 'Janus sequences',
    3: 'Strong polyampholytes',
    4: 'Strong negative polyelectrolytes',
    5: 'Strong positive polyelectrolytes',
}


def pattern(seq: str) -> np.ndarray:
    """+1, -1 or 0 per residue."""
    s = np.frombuffer(seq.upper().encode(), dtype='S1')
    return np.isin(s, [b'K', b'R']).astype(np.int8) - np.isin(s, [b'D', b'E']).astype(np.int8)


def _sigma(n_pos: int, n_neg: int, n: int) -> float:
    fcr = (n_pos + n_neg) / n
    return 0.0 if fcr == 0 else ((n_pos - n_neg) / n) ** 2 / fcr


def delta(p: np.ndarray, blob: int) -> float:
    """Mean over every window of `blob` residues of (sigma of the sequence - sigma of the window)^2."""
    n = len(p)
    if n < blob:
        raise ValueError(f'a sequence of {n} residues has no window of {blob}')
    cp = np.concatenate([[0], np.cumsum(p > 0)])
    cn = np.concatenate([[0], np.cumsum(p < 0)])
    bp, bn = cp[blob:] - cp[:-blob], cn[blob:] - cn[:-blob]
    fcr, ncpr = (bp + bn) / blob, (bp - bn) / blob
    with np.errstate(divide='ignore', invalid='ignore'):
        bsig = np.where(fcr > 0, ncpr**2 / np.where(fcr > 0, fcr, 1), 0.0)
    s = _sigma(int((p > 0).sum()), int((p < 0).sum()), n)
    return float(np.mean((s - bsig) ** 2))


def delta_avg(p: np.ndarray) -> float:
    return sum(delta(p, b) for b in BLOBS) / len(BLOBS)


def _splits(n: int) -> list[int]:
    """Where a block of n residues may be cut: every count near either end, and one representative between. A delta
    changes only while some block is shorter than a window, so these reach every value the arrangements can take."""
    edge = max(BLOBS) + 1
    if n <= 4 * edge:
        return list(range(n + 1))
    return sorted(set(range(edge + 1)) | set(range(n - edge, n + 1)) | {n // 2})


def _candidates(n_pos: int, n_neg: int, n0: int):
    """Arrangements of the residues into blocks: the three kinds (+, -, neutral) in any order, one of them split
    between the two ends (windows at the ends count less often, so a split end block can raise delta); and the
    neutral residues split before, between and after the two charged blocks."""
    count = {1: n_pos, -1: n_neg, 0: n0}
    # a sequence and its reverse have the same delta, so X Y Z X and X Z Y X need not both be tried
    for x, y, z in ((1, -1, 0), (-1, 1, 0), (0, 1, -1)):
        for a in _splits(count[x]):
            yield [(x, a), (y, count[y]), (z, count[z]), (x, count[x] - a)]
    for before in _splits(n0):
        rest = n0 - before
        for after in sorted(set(_splits(rest)) | {rest - m for m in _splits(rest)}):
            if 0 <= after <= rest:
                yield [(0, before), (1, n_pos), (0, rest - after), (-1, n_neg), (0, after)]


def _delta_rows(rows: np.ndarray, blob: int) -> np.ndarray:
    """delta of each row of a 2-D array of charge patterns of one composition, at one window size."""
    n = rows.shape[1]
    cp = np.concatenate([np.zeros((len(rows), 1), np.int32), np.cumsum(rows > 0, axis=1)], axis=1)
    cn = np.concatenate([np.zeros((len(rows), 1), np.int32), np.cumsum(rows < 0, axis=1)], axis=1)
    bp, bn = cp[:, blob:] - cp[:, :-blob], cn[:, blob:] - cn[:, :-blob]
    fcr, ncpr = (bp + bn) / blob, (bp - bn) / blob
    bsig = np.divide(ncpr**2, fcr, out=np.zeros_like(fcr), where=fcr > 0)
    s = _sigma(int((rows[0] > 0).sum()), int((rows[0] < 0).sum()), n)
    return np.mean((s - bsig) ** 2, axis=1)


@lru_cache(maxsize=65536)
def delta_max(n_pos: int, n_neg: int, n: int) -> float:
    """The largest delta over the block arrangements of n_pos positive, n_neg negative and n - n_pos - n_neg neutral
    residues (_candidates). tests/test_charge.py checks it against every arrangement of short sequences."""
    if n_pos + n_neg == 0:
        return 0.0
    rows = np.array(
        [
            np.concatenate([np.full(k, v, np.int8) for v, k in blocks])
            for blocks in _candidates(n_pos, n_neg, n - n_pos - n_neg)
        ]
    )
    return float(max(sum(_delta_rows(rows, b) for b in BLOBS) / len(BLOBS)))


@dataclass(frozen=True)
class Charge:
    length: int
    f_plus: float
    f_minus: float
    fcr: float
    ncpr: float
    kappa: float | None
    region: int

    @property
    def region_name(self) -> str:
        return REGIONS[self.region]


def region(f_plus: float, f_minus: float) -> int:
    fcr, ncpr = f_plus + f_minus, f_plus - f_minus
    if fcr < 0.25:
        return 1
    if fcr <= 0.35:
        return 2
    if abs(ncpr) < 0.35:
        return 3
    return 5 if f_plus > 0.35 else 4


def charge(seq: str) -> Charge:
    """The charge parameters of a sequence of at least 6 residues."""
    p = pattern(seq)
    n = len(p)
    n_pos, n_neg = int((p > 0).sum()), int((p < 0).sum())
    f_plus, f_minus = n_pos / n, n_neg / n
    kappa = None
    if n_pos + n_neg:
        dmax = delta_max(n_pos, n_neg, n)
        # a sequence already as segregated as its composition allows can tie delta_max: kappa 1
        kappa = 1.0 if dmax == 0 else min(1.0, delta_avg(p) / dmax)
    return Charge(n, f_plus, f_minus, f_plus + f_minus, f_plus - f_minus, kappa, region(f_plus, f_minus))
