"""The pasted-list test of the Mutations page (kit-listtest.js): the set-level test and the Benjamini-Hochberg q.

The set test is the release's (PTM_Pipeline scripts/propensity.py set_test: the total at the listed sites under the null is a sum of
Binomial(n, share) over the proteins, n = a protein's changes at its tested residues of the type). The release draws 10,000 times;
the page computes the exact tail. The release's own rows are checked here: the sums of k and expected from its per-site tables
equal the rows of site_set_propensity, and the page's p agrees with the release's within the release's sampling error."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from scipy.stats import binom

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'

STUB = r"""
const fs = require('fs');
global.window = global;
eval(fs.readFileSync(process.argv[1], 'utf8'));
const K = { D: {} };
window.PTMC_MODULES.forEach((m) => m(K));
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  const out = { pooled: [], bh: input.bh ? K.listTest.bh(input.bh) : null };
  for (const units of input.sets || []) out.pooled.push(await K.listTest.pooled(units));
  console.log(JSON.stringify(out));
})();
"""


def _node(tmp_path, payload):
    if not shutil.which('node'):
        pytest.skip('needs Node')
    f = tmp_path / 'in.json'
    f.write_text(json.dumps(payload))
    run = subprocess.run(['node', '-e', STUB, str(ASSETS / 'kit-listtest.js'), str(f)], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1500:]
    return json.loads(run.stdout)


def _exact(units, k):
    """The tails of a sum of independent binomials by full convolution (scipy's pmf)."""
    pmf = np.array([1.0])
    for n, share in units:
        pmf = np.convolve(pmf, binom.pmf(np.arange(n + 1), n, share))
    return float(pmf[k:].sum()), float(pmf[: k + 1].sum())


def _bh(p):
    """The release's bh() (scripts/propensity.py), written out: NaN not counted."""
    p = np.asarray(p, float)
    q = np.full(len(p), np.nan)
    ok = ~np.isnan(p)
    m = int(ok.sum())
    pv = p[ok]
    order = np.argsort(pv, kind='stable')
    ranked = pv[order] * m / np.arange(1, m + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(m)
    out[order] = np.minimum(ranked, 1.0)
    q[ok] = out
    return q


def test_pooled_matches_the_exact_sum_of_binomials(tmp_path):
    rng = np.random.default_rng(3)
    sets = []
    for size in (1, 2, 7, 60):
        n = rng.integers(1, 40, size)
        s = rng.uniform(0.001, 0.3, size)
        k = int(rng.binomial(n, s).sum()) + 2
        sets.append([[int(a), float(b), 0] for a, b in zip(n, s)])
        sets[-1][0][2] = k
    got = _node(tmp_path, {'sets': sets})['pooled']
    for units, g in zip(sets, got):
        k = sum(u[2] for u in units)
        pu, pl = _exact([(u[0], u[1]) for u in units], k)
        assert g['observed'] == k
        assert g['expected'] == pytest.approx(sum(u[0] * u[1] for u in units))
        assert g['pu'] == pytest.approx(pu, rel=1e-9, abs=1e-12)
        assert g['pl'] == pytest.approx(pl, rel=1e-9, abs=1e-12)


def test_one_unit_is_the_per_site_binomial(tmp_path):
    n, s, k = 25, 0.04, 3
    g = _node(tmp_path, {'sets': [[[n, s, k]]]})['pooled'][0]
    assert g['pu'] == pytest.approx(binom.sf(k - 1, n, s), rel=1e-9)
    assert g['pl'] == pytest.approx(binom.cdf(k, n, s), rel=1e-9)


def test_bh_equals_the_releases(tmp_path):
    p = [0.001, None, 0.04, 0.03, 0.5, 0.0004, 0.9, 0.03]
    got = _node(tmp_path, {'bh': p})['bh']
    want = _bh([np.nan if x is None else x for x in p])
    assert got[1] is None
    for g, w in zip(got, want):
        if w == w:
            assert g == pytest.approx(w)


# ---- the release's rows -------------------------------------------------------------------------------------------------------
TABLES = {'tcga_mc3': 'tcga_mc3', 'depmap_24q4': 'depmap_24q4', 'gnomad_v4_1': 'gnomad_v4_1'}


def _units(df, set_name, res, sfx):
    """One unit per protein with a site of the set (release: units in 71_release_propensity.py): n = the changes at the protein's
    tested residues of the type, share = the set's sites' expected count over n, k = the changes at the set's sites."""
    d = df[(df['residue'] == res) & df['p_upper' + sfx].notna()]
    inset = d['site_sets'].fillna('').str.split(';').map(lambda s: set_name in s)
    out = []
    for _, g in d.assign(_in=inset).groupby('canonical_UniProtAC', sort=False):
        if not g['_in'].any():
            continue
        n = int(g['k' + sfx].sum())
        assert n == int(g['n' + sfx].iloc[0])  # the page derives n as the sum of k over the protein's rows
        out.append([n, float(g.loc[g['_in'], 'expected' + sfx].sum() / n), int(g.loc[g['_in'], 'k' + sfx].sum())])
    return out


def test_release_site_set_rows(reference_root, tmp_path):
    sup = Path(reference_root) / 'releases' / 'v1.7.0' / 'supporting'
    sets = sup / 'site_set_propensity_v1.7.0.tsv'
    if not sets.exists():
        pytest.skip('no v1.7.0 release folder')
    rel = pd.read_csv(sets, sep='\t')
    rel = rel[
        (rel['site_set'] == 'methyllysine') | ((rel['site_set'] == 'methylarginine') & (rel['source'] != 'clinvar'))
    ]
    rel = rel[rel['source'].isin(TABLES) & (rel['sites'] < 12000)]
    frames = {}
    jobs = []
    for _, row in rel.iterrows():
        src = row['source']
        if src not in frames:
            frames[src] = pd.read_csv(sup / f'site_propensity_{TABLES[src]}_v1.7.0.tsv.gz', sep='\t', low_memory=False)
        sfx = '_no_hypermutated' if row['cohort'] == 'no_hypermutated' else ''
        jobs.append((row, _units(frames[src], row['site_set'], row['residue'], sfx)))
    assert jobs
    got = _node(tmp_path, {'sets': [u for _, u in jobs]})['pooled']
    for (row, units), g in zip(jobs, got):
        name = f'{row["site_set"]} {row["residue"]} {row["source"]} {row["cohort"]}'
        assert len(units) == row['proteins'], name
        assert g['observed'] == row['observed'], name
        assert g['expected'] == pytest.approx(row['expected'], rel=1e-5), name
        for mine, theirs in ((g['pu'], row['p_upper']), (g['pl'], row['p_lower'])):
            # the release's p is (1 + draws at least as extreme) / 10,001
            se = (theirs * (1 - theirs) / 10001) ** 0.5
            assert abs(mine - theirs) <= 5 * se + 2e-4, (name, mine, theirs)
