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
