"""ptmstats.js equals the Python module on random tables, and both equal SciPy / statsmodels. Needs Node; skipped without it."""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from scipy.stats import hypergeom

import ptmstats as stats

JS = Path(__file__).resolve().parents[1] / 'ptmstats' / 'ptmstats.js'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_browser_statistics_equal_the_kits():
    rng = np.random.default_rng(3)
    cases = []
    for _ in range(40):
        tables = [[int(x) for x in rng.integers(0, 30, 4)] for _ in range(int(rng.integers(2, 40)))]
        a, b, c, d = (int(x) for x in rng.integers(0, 400, 4))
        N = int(rng.integers(50, 20000))
        M, n = int(rng.integers(1, N)), int(rng.integers(1, N))
        k = int(rng.integers(1, min(M, n) + 1))
        cases.append({'tables': tables, 'abcd': [a, b, c, d], 'hyper': [k, N, M, n]})
    script = f"""global.window = {{}}; eval(require('fs').readFileSync({json.dumps(str(JS))}, 'utf8'));
const S = window.PTMC_STATS, cases = {json.dumps(cases)};
console.log(JSON.stringify(cases.map(c => ({{ mh: S.mh(c.tables), f: S.fisher(...c.abcd), h: S.hyperSF(...c.hyper) }}))));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    rel = lambda x, y: abs(x - y) <= 1e-7 * max(abs(y), 1e-300)  # noqa: E731
    for c, r in zip(cases, out):
        odds, lo, hi, p, used = stats.mantel_haenszel_ci(c['tables'])
        if odds is not None and np.isfinite(odds):
            assert rel(r['mh']['or'], odds) and r['mh']['strata'] == used
            if lo is not None:
                assert rel(r['mh']['lo'], lo) and rel(r['mh']['hi'], hi)
            if p is not None and p > 1e-290:
                assert abs(np.log10(r['mh']['p']) - np.log10(p)) < 1e-6
        a, b, cc, d = c['abcd']
        assert rel(r['f']['or'], stats.haldane_odds_ratio(a, b, cc, d))
        fp = stats.fisher_p(a, b, cc, d)
        if fp > 1e-290:
            assert abs(np.log10(r['f']['p']) - np.log10(fp)) < 1e-6
        k, N, M, n = c['hyper']
        hp = float(hypergeom.sf(k - 1, N, M, n))
        if hp > 1e-290:
            assert abs(np.log10(r['h']) - np.log10(hp)) < 1e-6
