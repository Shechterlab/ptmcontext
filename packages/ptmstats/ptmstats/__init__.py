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
from scipy.stats import chi2, fisher_exact, hypergeom, norm


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


# Several factors at once, within protein: conditional logistic regression (the multi-covariate Mantel-Haenszel).
def _stratum_chunks(groups, size=256):
    """Strata (each a (k, X) pair: k cases among the rows of X) in chunks of similar size, to be summed together."""
    order = sorted(range(len(groups)), key=lambda i: groups[i][1].shape[0])
    for i in range(0, len(order), size):
        yield [groups[j] for j in order[i:i + size]]


def _clogit_chunk(chunk, beta):
    """The strata's part of the log likelihood, score and information that the cases do not carry, exactly: each stratum's conditional probability of the cases
    among all the subsets of its rows of the same size (the elementary symmetric functions of exp(X beta), with their
    first and second derivatives, by the standard recursion over the rows). Strata are summed side by side."""
    s, p = len(chunk), len(beta)
    n = max(g[1].shape[0] for g in chunk)
    kmax = max(g[0] for g in chunk)
    x = np.zeros((s, n, p))
    eta = np.full((s, n), -np.inf)
    ks = np.array([g[0] for g in chunk])
    for i, (_, xs) in enumerate(chunk):
        x[i, :xs.shape[0]] = xs
        eta[i, :xs.shape[0]] = xs @ beta
    shift = np.max(eta, axis=1)                          # w <= 1 per stratum: the sums stay in range
    w = np.exp(eta - shift[:, None])                     # padded rows: w = 0, x = 0, and they add nothing
    z = np.zeros((s, kmax + 1))
    z[:, 0] = 1.0
    g = np.zeros((s, kmax + 1, p))
    h = np.zeros((s, kmax + 1, p, p))
    for j in range(n):
        wj, xj = w[:, j][:, None], x[:, j]
        zp, gp, hp = z[:, :-1], g[:, :-1], h[:, :-1]
        xg = np.einsum('sp,stq->stpq', xj, gp)
        h[:, 1:] += wj[:, :, None, None] * (hp + xg + xg.transpose(0, 1, 3, 2) + zp[:, :, None, None] * (xj[:, None, :, None] * xj[:, None, None, :]))
        g[:, 1:] += wj[:, :, None] * (gp + zp[:, :, None] * xj[:, None, :])
        z[:, 1:] += wj * zp
    r = np.arange(s)
    zk, gk, hk = z[r, ks], g[r, ks], h[r, ks]
    mean = gk / zk[:, None]
    ll = -np.sum(ks * shift) - np.sum(np.log(zk))
    score = -mean.sum(axis=0)
    info = (hk / zk[:, None, None] - mean[:, :, None] * mean[:, None, :]).sum(axis=0)
    return float(ll), score, info


def conditional_logit(y, X, strata, names=None, tol=1e-10, max_iter=50):
    """Conditional (fixed-effects) logistic regression of y (1 for a case) on the columns of X, one stratum per value
    of strata: the multi-covariate generalisation of the Mantel-Haenszel test (Breslow and Day 1980, ch. 7). Exact
    (no Breslow or Efron approximation for several cases in a stratum). A stratum without a case or without a
    control carries no information and is left out.

    Returns a dict: names, coef, se (inverse observed information), odds_ratio, ci_low and ci_high (Wald 95%), z, p
    (Wald, two-sided), loglik, null_loglik, lr_p (likelihood ratio, all coefficients 0), score_chi2 (the score test
    of all coefficients 0; with one binary covariate, the Cochran-Mantel-Haenszel statistic without continuity
    correction), n_strata, n_cases, n_rows, converged. Coefficients that diverge (a covariate that separates the cases
    from the controls) are returned with converged False and no standard errors."""
    y = np.asarray(y).astype(int)
    X = np.asarray(X, dtype=float)
    if X.ndim == 1:
        X = X[:, None]
    p = X.shape[1]
    names = list(names) if names is not None else [f'x{i}' for i in range(p)]
    strata = np.asarray(strata)
    order = np.argsort(strata, kind='stable')
    y, X, strata = y[order], X[order], strata[order]
    cut = np.flatnonzero(np.r_[True, strata[1:] != strata[:-1], True])
    groups, case_x = [], np.zeros(p)
    n_cases = n_rows = 0
    for a, b in zip(cut[:-1], cut[1:]):
        k = int(y[a:b].sum())
        if k == 0 or k == b - a:
            continue
        groups.append((k, X[a:b]))
        case_x += X[a:b][y[a:b] == 1].sum(axis=0)
        n_cases += k
        n_rows += b - a
    nan = float('nan')
    out = {'names': names, 'coef': [nan] * p, 'se': [nan] * p, 'odds_ratio': [nan] * p, 'ci_low': [nan] * p, 'ci_high': [nan] * p,
           'z': [nan] * p, 'p': [nan] * p, 'loglik': nan, 'null_loglik': nan, 'lr_p': nan, 'score_chi2': nan,
           'n_strata': len(groups), 'n_cases': n_cases, 'n_rows': n_rows, 'converged': False}
    if not groups:
        return out

    def evaluate(beta):
        ll, score, info = 0.0, np.zeros(p), np.zeros((p, p))
        for chunk in _stratum_chunks(groups):
            l_, s_, i_ = _clogit_chunk(chunk, beta)
            ll += l_
            score += s_
            info += i_
        return ll + case_x @ beta, score + case_x, info
    beta = np.zeros(p)
    ll, score, info = evaluate(beta)
    out['null_loglik'] = ll
    try:
        out['score_chi2'] = float(score @ np.linalg.solve(info, score))
    except np.linalg.LinAlgError:
        return out
    for _ in range(max_iter):
        try:
            step = np.linalg.solve(info, score)
        except np.linalg.LinAlgError:
            return out
        t = 1.0
        while True:                                       # halve the step until the likelihood does not fall
            new = beta + t * step
            ll_new, score_new, info_new = evaluate(new)
            if ll_new >= ll - 1e-12 or t < 1e-8:
                break
            t /= 2
        done = abs(ll_new - ll) < tol * (1 + abs(ll)) and np.max(np.abs(step)) * t < 1e-7
        beta, ll, score, info = new, ll_new, score_new, info_new
        if done:
            out['converged'] = True
            break
        if np.max(np.abs(beta)) > 25:                     # separation: the estimate runs away
            break
    out['coef'] = [float(b) for b in beta]
    out['loglik'] = float(ll)
    if not out['converged']:
        return out
    try:
        cov = np.linalg.inv(info)
    except np.linalg.LinAlgError:
        out['converged'] = False
        return out
    se = np.sqrt(np.diag(cov))
    z = beta / se
    out.update(se=[float(v) for v in se], z=[float(v) for v in z],
               odds_ratio=[float(v) for v in np.exp(beta)],
               ci_low=[float(v) for v in np.exp(beta - 1.959963984540054 * se)],
               ci_high=[float(v) for v in np.exp(beta + 1.959963984540054 * se)],
               p=[float(v) for v in 2 * norm.sf(np.abs(z))],
               lr_p=float(chi2.sf(max(0.0, 2 * (ll - out['null_loglik'])), p)))
    return out


def hypergeom_sf(k: int, N: int, M: int, n: int) -> float:
    """P(X >= k) of the hypergeometric (N in the universe, M in the set, n drawn): the one-sided enrichment test."""
    return float(hypergeom.sf(k - 1, N, M, n))


def gene_list_test(questions) -> list:
    """The gene-list test: a list of proteins (or genes) the reader names, against the sets of each protein-set question.

    ``questions`` is an iterable of ``(question, listed, background, sets)``: ``listed`` the units of the list (proteins,
    or genes for a gene-based source), ``background`` the units the source annotates among the marked proteins (each
    source its own background, e.g. the methylated proteins HPA annotates), and ``sets`` a mapping of set name to its
    units. Only units in the background count: the list's n = |listed & background|, the background's N, the set's
    M = |set & background| and k = |listed & set & background|.

    For each set: p = P(X >= k), X hypergeometric (N, M, n), the one-sided upper test (``hypergeom_sf``; p = 1 for
    k = 0); fold = (k/n)/(M/N) (None when n or M is 0); q = Benjamini-Hochberg over every set of every question tested,
    small sets and k = 0 included. Returns one dict per set, in the order given, with question, set, k, n, M, N, fold, p
    and q. A hand-picked list is not a random draw: p and q say how unusual the overlap would be for n marked proteins
    taken at random, not anything about the mark. ptmstats.js ``listTest`` is the same test for the browser.
    """
    rows = []
    for question, listed, background, sets in questions:
        bg = set(background)
        sel = set(listed) & bg
        n, N = len(sel), len(bg)
        for name, members in (sets.items() if hasattr(sets, 'items') else sets):
            m = set(members) & bg
            M, k = len(m), len(m & sel)
            fold = (k / n) / (M / N) if n and M else None
            rows.append({'question': question, 'set': name, 'k': k, 'n': n, 'M': M, 'N': N, 'fold': fold,
                         'p': hypergeom_sf(k, N, M, n) if k else 1.0})
    q = benjamini_hochberg([r['p'] for r in rows]) if rows else []
    for r, v in zip(rows, q):
        r['q'] = float(v)
    return rows


def mann_whitney_p(x: Iterable[float], y: Iterable[float]) -> float:
    """Two-sided Mann-Whitney U test of two samples (SciPy's default: exact for small samples without ties, else the
    normal approximation with tie and continuity corrections); NaN when either is empty. As the release's
    scripts/cell_maps.py size_tests."""
    from scipy.stats import mannwhitneyu
    x, y = list(x), list(y)
    return float(mannwhitneyu(x, y).pvalue) if x and y else math.nan


def js_path() -> str:
    """Where ptmstats.js, the same tests for the browser, is installed."""
    from importlib import resources
    return str(resources.files('ptmstats') / 'ptmstats.js')
