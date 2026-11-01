import math

import numpy as np
import pytest

from ptmcontext import stats


def test_bh_known_values():
    # R: p.adjust(c(0.01, 0.04, 0.03, 0.2), 'BH') = 0.04 0.0533 0.0533 0.2
    q = stats.benjamini_hochberg([0.01, 0.04, 0.03, 0.2])
    assert np.allclose(q, [0.04, 0.04 * 4 / 3, 0.04, 0.2][:1] + [0.0533333, 0.0533333, 0.2], atol=1e-6)


def test_bh_keeps_nan_out_of_the_count():
    q = stats.benjamini_hochberg([0.01, float('nan'), 0.02])
    assert math.isnan(q[1]) and np.allclose(q[[0, 2]], [0.02, 0.02])


def test_haldane_odds_ratio():
    assert stats.haldane_odds_ratio(0, 10, 10, 0) == pytest.approx((0.5 * 0.5) / (10.5 * 10.5))


def test_cmh_floored_at_expectation():
    # observed within 0.5 of expected: the floored statistic is 0, p = 1 (statsmodels' correction gives a spurious p)
    tables = [(0, 1, 1, 50), (0, 1, 1, 60)]
    assert stats.cmh_statistic(tables) == 0.0
    odds, p, used = stats.mantel_haenszel(tables)
    assert p == pytest.approx(1.0) and used == 2


def test_mh_of_identical_strata_is_their_odds_ratio():
    odds, lo, hi, p, used = stats.mantel_haenszel_ci([(10, 20, 30, 40)] * 5)
    assert odds == pytest.approx((10 * 40) / (20 * 30)) and lo < odds < hi and used == 5


def test_mh_without_informative_strata():
    assert stats.mantel_haenszel([(1, 0, 0, 0), (0, 0, 3, 0)]) == (None, None, 0)
