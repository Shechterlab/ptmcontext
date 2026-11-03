"""The statistics every analysis uses (ptmstats; ptmcontext.stats re-exports them).

This module is the definition. The functions are the same as those behind the Methylarginine Site Explorer's release
v1.4.3 (Shechterlab/PTM_Pipeline scripts/common.py at b0d9049: benjamini_hochberg, informative_strata, cmh_statistic,
mantel_haenszel, mantel_haenszel_ci, and the Haldane-Anscombe odds ratio with the two-sided Fisher test of its pooled
tests), so that the rebuild can be checked against that release: tests/test_parity_v1_4_3.py recomputes release rows
with them. A change here that changes a number must be recorded as a deliberate change, never made silently.
"""
from __future__ import annotations

import math
from typing import Iterable

import numpy as np
from scipy.stats import chi2, fisher_exact, hypergeom


def benjamini_hochberg(p_values: Iterable[float]) -> np.ndarray:
    """Benjamini-Hochberg adjusted p values; NaN stays NaN and is not counted."""
    p = np.asarray(list(p_values), dtype=float)
    out = np.full(p.shape, np.nan, dtype=float)
    valid = np.isfinite(p)
    if not valid.any():
        return out
    pv = p[valid]
    order = np.argsort(pv)
    ranked = pv[order]
    n = len(ranked)
    adjusted = np.empty(n, dtype=float)
    cumulative = 1.0
    for i in range(n - 1, -1, -1):
        rank = i + 1
        bh = ranked[i] * n / rank
        cumulative = min(cumulative, bh)
        adjusted[i] = min(cumulative, 1.0)
    restored = np.empty(n, dtype=float)
    restored[order] = adjusted
    out[valid] = restored
    return out


def log2_or_nan(value: float) -> float:
    """log2, NaN for a value that is not positive (common.log2_odds_ratio)."""
    value = float(value)
    if value <= 0 or math.isnan(value):
        return math.nan
    return math.log2(value)


def haldane_odds_ratio(a: int, b: int, c: int, d: int) -> float:
    """The odds ratio of a 2x2 table with 0.5 added to every cell (Haldane-Anscombe), as the pooled tests report it."""
    return ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5))


def fisher_p(a: int, b: int, c: int, d: int) -> float:
    """Two-sided Fisher exact p of [[a, b], [c, d]]."""
    return float(fisher_exact([[a, b], [c, d]], alternative='two-sided').pvalue)


# Within-protein tests: Mantel-Haenszel with each protein a stratum.
def informative_strata(tables):
    """Strata that carry information for a Mantel-Haenszel analysis (no empty margin, at least two observations)."""
    return [(a, b, c, d) for a, b, c, d in tables if a + b + c + d >= 2 and (a + b) and (c + d) and (a + c) and (b + d)]


def cmh_statistic(tables) -> float:
    """The continuity-corrected Cochran-Mantel-Haenszel statistic of 2x2 tables (a, b, c, d): (|O - E| - 0.5)^2 / V,
    with the bracket floored at 0, so that a count within 0.5 of its expectation gives 0 (p = 1). statsmodels'
    test_null_odds(correction=True) leaves the bracket negative there, and the square then grows as V shrinks: a sparse
    test with nothing observed and almost nothing expected came out significant. NaN when V is 0."""
    o = e = v = 0.0
    for a, b, c, d in tables:
        n = a + b + c + d
        o += a
        e += (a + b) * (a + c) / n
        v += (a + b) * (c + d) * (a + c) * (b + d) / (n * n * (n - 1))
    return max(0.0, abs(o - e) - 0.5) ** 2 / v if v > 0 else float('nan')


def mantel_haenszel(tables):
    """Mantel-Haenszel common odds ratio (statsmodels StratifiedTable) and the continuity-corrected CMH test (cmh_statistic).

    Returns (odds, p, informative strata); odds may be inf when no stratum has b*c > 0."""
    strata = informative_strata(tables)
    if not strata:
        return None, None, 0
    from statsmodels.stats.contingency_tables import StratifiedTable
    st = StratifiedTable([np.array([[a, b], [c, d]], dtype=float) for a, b, c, d in strata])
    den = sum(b * c / (a + b + c + d) for a, b, c, d in strata)
    odds = float(st.oddsratio_pooled) if den > 0 else float('inf')
    # scipy's survival function, which stays accurate where 1 - cdf underflows (below ~1e-16)
    stat = cmh_statistic(strata)
    return odds, (float(chi2.sf(stat, 1)) if math.isfinite(stat) else None), len(strata)


def mantel_haenszel_ci(tables):
    """Mantel-Haenszel OR with its Robins-Breslow-Greenland 95% CI (statsmodels): (odds, lo, hi, p, informative strata)."""
    odds, p, used = mantel_haenszel(tables)
    if odds is None or not math.isfinite(odds) or odds <= 0:
        return odds, None, None, p, used
    strata = informative_strata(tables)
    from statsmodels.stats.contingency_tables import StratifiedTable
    st = StratifiedTable([np.array([[a, b], [c, d]], dtype=float) for a, b, c, d in strata])
    lo, hi = st.oddsratio_pooled_confint(alpha=0.05)
    return odds, (float(lo) if math.isfinite(lo) else None), (float(hi) if math.isfinite(hi) else None), p, used


def hypergeom_sf(k: int, N: int, M: int, n: int) -> float:
    """P(X >= k) of the hypergeometric (N in the universe, M in the set, n drawn): the one-sided enrichment test."""
    return float(hypergeom.sf(k - 1, N, M, n))


def js_path() -> str:
    """Where ptmstats.js, the same tests for the browser, is installed."""
    from importlib import resources
    return str(resources.files('ptmstats') / 'ptmstats.js')
