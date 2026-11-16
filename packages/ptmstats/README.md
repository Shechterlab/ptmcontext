# ptmstats

The statistics behind ptmcontext, in Python (`import ptmstats`) and in plain JavaScript (`ptmstats/ptmstats.js`, no
build step; it sets `window.PTMC_STATS`). MIT licence. They are the functions of the Methylarginine Site Explorer
v1.4.3 (Shechterlab/PTM_Pipeline `scripts/common.py` at b0d9049); a change that moves a number is a deliberate one.

| Function (Python / JS) | What it is |
|---|---|
| `benjamini_hochberg` / `bh` | BH adjusted p; NaN (null) is kept and not counted (Benjamini and Hochberg 1995) |
| `haldane_odds_ratio` / `fisher().or` | (a+.5)(d+.5) / ((b+.5)(c+.5)) (Haldane 1956; Anscombe 1956) |
| `fisher_p` / `fisher().p` | two-sided Fisher exact p of [[a, b], [c, d]] (SciPy `fisher_exact`) |
| `hypergeom_sf` / `hyperSF` | P(X >= k), N in the universe, M in the set, n drawn: the one-sided enrichment test of clusterProfiler's `enricher` |
| `gene_list_test` / `listTest` | the gene-list test: for a named list, each set of each protein-set question, within the units its source annotates (its own background): k of the list's n in the set, M of the background's N; fold (k/n)/(M/N), the one-sided hypergeometric p (p = 1 at k = 0) and the BH q over every set tested, small sets included. The list is chosen, not drawn: p describes the overlap, not the mark |
| `informative_strata` | strata with no empty margin and at least two observations |
| `cmh_statistic` | continuity-corrected CMH: (max(0, abs(O - E) - 0.5))^2 / V, O = sum a, E = sum (a+b)(a+c)/n, V = sum (a+b)(c+d)(a+c)(b+d) / (n^2 (n-1)) (Mantel and Haenszel 1959); p = chi-square survival, 1 df |
| `mantel_haenszel` / `mh().or, .p` | common odds ratio of the strata (statsmodels `StratifiedTable`, Mantel-Haenszel 1959) with the CMH p |
| `mantel_haenszel_ci` / `mh().lo, .hi` | the same with the Robins-Breslow-Greenland 95% CI (Robins et al. 1986) |
| `conditional_logit` (Python only) | conditional logistic regression, one stratum per group, several covariates at once: the multi-covariate generalisation of Mantel-Haenszel (Breslow and Day 1980, ch. 7). Exact likelihood, Newton's method, Wald intervals; its score test for one binary covariate is the uncorrected CMH statistic. Checked against statsmodels' `ConditionalLogit` to 1e-6. Not in `ptmstats.js`: a site runs it on the whole dataset |

JS exactness: about 1e-10 relative to SciPy over the counts a site has.

References: Benjamini Y, Hochberg Y. J R Stat Soc B 1995;57:289. Mantel N, Haenszel W. J Natl Cancer Inst 1959;22:719.
Robins J, Breslow N, Greenland S. Biometrics 1986;42:311. Haldane JBS. Ann Hum Genet 1956;20:309. Anscombe FJ.
Biometrika 1956;43:461. Breslow NE, Day NE. Statistical Methods in Cancer Research, vol. 1: the analysis of case-control studies. IARC Scientific Publications 32, 1980.

## Tests

`pip install -e "packages/ptmstats[test]" && pytest packages/ptmstats/tests`: the Python against SciPy, and the
JavaScript against the Python on random tables (needs Node; skipped without it).
