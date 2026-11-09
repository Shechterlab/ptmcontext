"""The gene-list test: ptmstats.gene_list_test equals SciPy's hypergeometric and the BH helper, and ptmstats.js listTest
equals it on fixed cases, edge cases included (k = 0, tiny sets, a list outside the background, ties). Node for the JS."""

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from scipy.stats import hypergeom

import ptmstats as stats

JS = Path(__file__).resolve().parents[1] / 'ptmstats' / 'ptmstats.js'


def cases():
    bg = list(range(100))
    return [
        # question, listed, background, sets
        (
            'a',
            [0, 1, 2, 3, 4, 200],
            bg,
            [
                ('big', range(50)),
                ('none', range(60, 70)),
                ('one', [0]),
                ('pair', [1, 99]),
                ('empty', []),
                ('outside', [150, 151]),
                ('all', bg),
                ('tie1', [2, 50]),
                ('tie2', [3, 51]),
            ],
        ),
        ('b', [5, 6], range(10), [('tiny', [5]), ('half', range(5)), ('both', [5, 6, 7])]),
        ('c', [500], range(20), [('x', range(10))]),  # nothing of the list in the background: n = 0
        ('d', list(range(30)), range(4000), [(f's{i}', range(i, 4000, 97 + i)) for i in range(12)]),
    ]


def expected(qs):
    rows = []
    for qn, listed, background, sets in qs:
        bg = set(background)
        sel = set(listed) & bg
        for name, members in sets:
            m = set(members) & bg
            k, n, M, N = len(m & sel), len(sel), len(m), len(bg)
            rows.append(
                (
                    qn,
                    name,
                    k,
                    n,
                    M,
                    N,
                    (k / n) / (M / N) if n and M else None,
                    float(hypergeom.sf(k - 1, N, M, n)) if k else 1.0,
                )
            )
    return rows


def test_python_equals_scipy_and_bh():
    got, want = stats.gene_list_test(cases()), expected(cases())
    assert len(got) == len(want) == 9 + 3 + 1 + 12
    for g, (qn, name, k, n, M, N, fold, p) in zip(got, want):
        assert (g['question'], g['set'], g['k'], g['n'], g['M'], g['N']) == (qn, name, k, n, M, N)
        assert (g['fold'] is None) == (fold is None) and (fold is None or abs(g['fold'] - fold) <= 1e-12 * fold + 1e-15)
        assert g['p'] == pytest.approx(p, rel=1e-12, abs=0)
    q = stats.benjamini_hochberg([w[-1] for w in want])
    assert [g['q'] for g in got] == pytest.approx(list(q), rel=1e-12)
    by = {(g['question'], g['set']): g for g in got}
    assert by['a', 'none']['k'] == 0 and by['a', 'none']['p'] == 1.0 and by['a', 'none']['fold'] == 0
    assert by['a', 'empty']['fold'] is None and by['c', 'x']['n'] == 0 and by['a', 'outside']['M'] == 0
    assert by['a', 'big']['n'] == 5  # 200 is not in the background
    assert by['a', 'tie1']['p'] == by['a', 'tie2']['p'] and by['a', 'tie1']['q'] == by['a', 'tie2']['q']
    assert by['a', 'all']['p'] == pytest.approx(1.0) and by['a', 'one']['p'] == pytest.approx(0.05)  # 5 drawn of 100


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_js_equals_python():
    qs = [
        {'question': q, 'listed': list(li), 'background': list(bg), 'sets': [[n, list(m)] for n, m in s]}
        for q, li, bg, s in cases()
    ]
    script = f"""global.window = {{}}; eval(require('fs').readFileSync({json.dumps(str(JS))}, 'utf8'));
const S = window.PTMC_STATS; const qs = {json.dumps(qs)};
console.log(JSON.stringify({{ rows: S.listTest(qs), bh: S.bh(S.listTest(qs).map(r => r.p)) }}));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    py = stats.gene_list_test(cases())
    assert len(out['rows']) == len(py)
    for j, p in zip(out['rows'], py):
        assert (j['question'], j['set'], j['k'], j['n'], j['M'], j['N']) == (
            p['question'],
            p['set'],
            p['k'],
            p['n'],
            p['M'],
            p['N'],
        )
        assert (j['fold'] is None) == (p['fold'] is None) and (
            p['fold'] is None or abs(j['fold'] - p['fold']) <= 1e-12 * p['fold'] + 1e-15
        )
        assert j['p'] == pytest.approx(p['p'], rel=1e-9, abs=1e-15)
        assert j['q'] == pytest.approx(p['q'], rel=1e-9, abs=1e-15)
    assert out['bh'] == [r['q'] for r in out['rows']]
    assert np.allclose(
        stats.benjamini_hochberg([r['p'] for r in out['rows']]), [r['q'] for r in out['rows']], rtol=1e-9
    )
