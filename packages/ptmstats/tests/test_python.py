"""The Python functions against SciPy and statsmodels directly."""

import numpy as np
from scipy.stats import fisher_exact, hypergeom

import ptmstats


def test_fisher_haldane_hypergeom_and_bh():
    assert ptmstats.fisher_p(3, 7, 10, 2) == float(fisher_exact([[3, 7], [10, 2]]).pvalue)
    assert ptmstats.haldane_odds_ratio(3, 7, 10, 2) == (3.5 * 2.5) / (7.5 * 10.5)
    assert ptmstats.hypergeom_sf(4, 100, 20, 10) == float(hypergeom.sf(3, 100, 20, 10))
    q = ptmstats.benjamini_hochberg([0.01, 0.04, float('nan'), 0.03])
    assert np.allclose(q[[0, 1, 3]], [0.03, 0.04, 0.04]) and np.isnan(q[2])


def test_mantel_haenszel_single_stratum_is_the_table_odds_ratio():
    odds, p, used = ptmstats.mantel_haenszel([(10, 5, 4, 20)])
    assert used == 1 and abs(odds - (10 * 20) / (5 * 4)) < 1e-9 and 0 < p < 1


def test_mann_whitney_is_scipys_two_sided_test():
    from scipy.stats import mannwhitneyu

    x, y = [0.1, 1.2, 2.5, -0.3, 4.0, 1.1], [0.0, -1.0, 0.4, 0.2, -2.0, 0.3, 0.5, -0.1, 0.05]
    assert ptmstats.mann_whitney_p(x, y) == float(mannwhitneyu(x, y).pvalue)
    assert np.isnan(ptmstats.mann_whitney_p([], y))


# ---- conditional logistic regression ---------------------------------------------------------------------------------
def _clogit_data(seed=1, n_strata=120, binary_only=False):
    rng = np.random.default_rng(seed)
    xs, ys, gs = [], [], []
    for g in range(n_strata):
        n = int(rng.integers(3, 20))
        k = int(rng.integers(1, min(4, n - 1) + 1))
        x = np.c_[
            rng.integers(0, 2, n), rng.integers(0, 2, n), rng.integers(0, 2, n) if binary_only else rng.normal(size=n)
        ]
        w = np.exp(0.8 * x[:, 0] - 0.5 * x[:, 1] + 0.3 * x[:, 2])
        w /= w.sum()
        y = np.zeros(n, int)
        y[rng.choice(n, size=k, replace=False, p=w)] = 1
        xs.append(x)
        ys.append(y)
        gs.append(np.full(n, g))
    return np.concatenate(ys), np.vstack(xs), np.concatenate(gs)


def test_conditional_logit_matches_statsmodels_to_1e6():
    from statsmodels.discrete.conditional_models import ConditionalLogit

    y, X, g = _clogit_data()
    ours = ptmstats.conditional_logit(y, X, g)
    sm = ConditionalLogit(y, X, groups=g)
    theirs = sm.fit(method='newton', disp=0, maxiter=100)
    assert ours['converged']
    assert np.allclose(ours['coef'], theirs.params, atol=1e-6, rtol=0)
    assert np.allclose(ours['se'], theirs.bse, atol=1e-6, rtol=0)
    assert abs(ours['loglik'] - sm.loglike(np.array(ours['coef']))) < 1e-8
    assert abs(ours['null_loglik'] - sm.loglike(np.zeros(3))) < 1e-8
    assert np.allclose(
        sm.score(np.array(ours['coef'])), 0, atol=1e-6
    )  # a stationary point of statsmodels' likelihood too


def test_conditional_logit_likelihood_is_the_sum_over_all_subsets():
    import itertools

    y, X, g = _clogit_data(seed=4, n_strata=12)
    beta = np.array([0.4, -0.2, 0.7])
    ll = 0.0
    for s in np.unique(g):
        i = g == s
        xs, ys = X[i], y[i]
        den = sum(np.exp(xs[list(c)].sum(0) @ beta) for c in itertools.combinations(range(len(ys)), int(ys.sum())))
        ll += xs[ys == 1].sum(0) @ beta - np.log(den)
    from statsmodels.discrete.conditional_models import ConditionalLogit

    assert abs(ConditionalLogit(y, X, groups=g).loglike(beta) - ll) < 1e-9
    # the null log likelihood is minus the log of the number of subsets, summed over informative strata
    from math import comb

    r = ptmstats.conditional_logit(y, X, g)
    informative = [s for s in np.unique(g) if 0 < y[g == s].sum() < (g == s).sum()]
    assert (
        abs(r['null_loglik'] + sum(np.log(comb(int((g == s).sum()), int(y[g == s].sum()))) for s in informative)) < 1e-9
    )


def test_conditional_logit_score_test_is_the_uncorrected_mantel_haenszel_test():
    rng = np.random.default_rng(7)
    tables, ys, xs, gs = [], [], [], []
    for s in range(60):
        n = int(rng.integers(4, 15))
        x = rng.integers(0, 2, n)
        y = np.zeros(n, int)
        y[rng.choice(n, size=int(rng.integers(1, 3)), replace=False)] = 1
        a = int(((x == 1) & (y == 1)).sum())
        b = int(((x == 0) & (y == 1)).sum())
        c = int(((x == 1) & (y == 0)).sum())
        d = int(((x == 0) & (y == 0)).sum())
        tables.append((a, b, c, d))
        ys.append(y)
        xs.append(x)
        gs.append(np.full(n, s))
    r = ptmstats.conditional_logit(np.concatenate(ys), np.concatenate(xs), np.concatenate(gs))
    used = ptmstats.informative_strata(tables)
    o = sum(t[0] for t in used)
    e = sum((t[0] + t[1]) * (t[0] + t[2]) / sum(t) for t in used)
    v = sum((t[0] + t[1]) * (t[2] + t[3]) * (t[0] + t[2]) * (t[1] + t[3]) / (sum(t) ** 2 * (sum(t) - 1)) for t in used)
    assert abs(r['score_chi2'] - (o - e) ** 2 / v) < 1e-9
    # and its odds ratio is near the Mantel-Haenszel one
    assert abs(r['odds_ratio'][0] / ptmstats.mantel_haenszel(tables)[0] - 1) < 0.25


def test_conditional_logit_one_case_per_stratum_is_a_softmax_and_matched_pairs_are_a_logistic_regression():
    from statsmodels.api import Logit

    rng = np.random.default_rng(3)
    d = rng.normal(size=(200, 2))
    true = np.array([0.7, -0.4])
    case_first = rng.random(200) < 1 / (1 + np.exp(-(d @ true)))  # pair: x_case - x_control = d (or -d)
    X, y, g = [], [], []
    for i in range(200):
        a, b = (d[i], np.zeros(2)) if case_first[i] else (np.zeros(2), d[i])
        # the case is the member with the larger draw: build pairs whose case-control difference is sign * d
        X += [a, b]
        y += [1, 0] if case_first[i] else [0, 1]
        g += [i, i]
    r = ptmstats.conditional_logit(y, np.array(X), g)
    diff = np.array([X[2 * i] - X[2 * i + 1] for i in range(200)])
    out = np.array([y[2 * i] for i in range(200)])
    fit = Logit(out, diff).fit(disp=0)  # no intercept: logistic regression on the pair difference
    assert np.allclose(r['coef'], fit.params, atol=1e-6) and np.allclose(r['se'], fit.bse, atol=1e-6)


def test_conditional_logit_leaves_out_uninformative_strata_and_reports_separation():
    y = [1, 0, 0, 0, 0, 0, 1, 1, 1]
    x = [1, 0, 1, 0, 1, 0, 1, 0, 1]
    g = [0, 0, 0, 1, 1, 1, 2, 2, 2]
    r = ptmstats.conditional_logit(y, x, g)
    assert (r['n_strata'], r['n_cases'], r['n_rows']) == (1, 1, 3)  # stratum 1 has no case, stratum 2 no control
    sep = ptmstats.conditional_logit([1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0], [0, 0, 0, 1, 1, 1])
    assert not sep['converged'] and np.isnan(sep['p'][0])
    assert not ptmstats.conditional_logit([1, 1], [0, 1], [0, 0])['converged']
