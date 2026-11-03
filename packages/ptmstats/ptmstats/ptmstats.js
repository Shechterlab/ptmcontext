/* Statistics in the browser, for a selection: the same tests as the Python module ptmstats, so that a
   selection made on the page is tested as the site's own rows were.
     mh(tables)       Mantel–Haenszel odds ratio over strata [a, b, c, d] (each protein a stratum), its
                      Robins–Breslow–Greenland 95% CI and the continuity-corrected CMH p (bracket floored at 0)
     fisher(a,b,c,d)  two-sided Fisher exact p, and the Haldane–Anscombe odds ratio (0.5 added to each cell)
     hyperSF(k,N,M,n) P(X >= k) for the hypergeometric (one-sided enrichment test, as clusterProfiler's enricher)
     bh(ps)           Benjamini–Hochberg q values; null stays null
   Exact to about 1e-10 relative against SciPy over the counts a site has; results computed here are labelled as
   retested on the selection, never as the site's published rows. Plain JavaScript, no build step; ptmcontext's site kit loads it as kit-stats.js. */
(function () {
  const K = window.PTMC_STATS = {};
  // log Γ (Lanczos, g = 7): accurate to ~1e-15 relative for the arguments used here
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = LG[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  // log P(X = k) for the hypergeometric: N items, M of a kind, n drawn
  const lpmf = (k, N, M, n) => lchoose(M, k) + lchoose(N - M, n - k) - lchoose(N, n);
  // a tail of the hypergeometric, summed away from the mode (its terms then only shrink), scaled by its first term
  function tail(from, to, step, N, M, n) {
    const top = lpmf(from, N, M, n); let s = 0;
    for (let x = from; step > 0 ? x <= to : x >= to; x += step) { const t = Math.exp(lpmf(x, N, M, n) - top); s += t; if (t < 1e-17 * s) break; }
    return s * Math.exp(top);
  }
  function hyperSF(k, N, M, n) {
    const lo = Math.max(0, n - (N - M)), hi = Math.min(M, n);
    if (k <= lo) return 1; if (k > hi) return 0;
    const mode = Math.floor((n + 1) * (M + 1) / (N + 2));
    // above the mode the upper tail is small: sum it; below it, 1 minus the lower tail
    return k > mode ? Math.min(1, tail(k, hi, 1, N, M, n)) : Math.max(0, 1 - tail(k - 1, lo, -1, N, M, n));
  }
  function fisher(a, b, c, d) {
    const n1 = a + b, n2 = c + d, m1 = a + c, N = n1 + n2;
    const lo = Math.max(0, m1 - n2), hi = Math.min(m1, n1), obs = lpmf(a, N, m1, n1);
    let s = 0; const tol = 1e-7;
    for (let x = lo; x <= hi; x++) { const l = lpmf(x, N, m1, n1); if (l <= obs + tol * Math.abs(obs) + 1e-12) s += Math.exp(l); }
    return { or: ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)), p: Math.min(1, s) };
  }
  // the upper tail of χ² with 1 df: erfc(√(x/2)), by the continued fraction where it is small
  function erfc(x) {
    if (x < 0) return 2 - erfc(-x);
    if (x < 3) {                              // series for erf
      let sum = x, term = x; const x2 = x * x;
      for (let n = 1; n < 200; n++) { term *= -x2 / n; const t = term / (2 * n + 1); sum += t; if (Math.abs(t) < 1e-17 * Math.abs(sum)) break; }
      return 1 - 2 / Math.sqrt(Math.PI) * sum;
    }
    let f = 0; for (let n = 60; n >= 1; n--) f = (n / 2) / (x + f);   // Laplace continued fraction
    return Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
  }
  const chi2sf1 = s => (s > 0 ? erfc(Math.sqrt(s / 2)) : 1);
  const informative = tables => tables.filter(([a, b, c, d]) => a + b + c + d >= 2 && (a + b) && (c + d) && (a + c) && (b + d));
  function mh(tables) {
    const st = informative(tables);
    if (!st.length) return { or: null, lo: null, hi: null, p: null, strata: 0 };
    let R = 0, S = 0, PR = 0, PSQR = 0, QS = 0, o = 0, e = 0, v = 0;
    for (const [a, b, c, d] of st) {
      const n = a + b + c + d, r = a * d / n, s = b * c / n, P = (a + d) / n, Q = (b + c) / n;
      R += r; S += s; PR += P * r; PSQR += P * s + Q * r; QS += Q * s;
      o += a; e += (a + b) * (a + c) / n; v += (a + b) * (c + d) * (a + c) * (b + d) / (n * n * (n - 1));
    }
    const or = S > 0 ? R / S : Infinity;
    const stat = v > 0 ? Math.max(0, Math.abs(o - e) - 0.5) ** 2 / v : NaN;
    let lo = null, hi = null;
    if (S > 0 && R > 0) {
      const se = Math.sqrt(PR / (2 * R * R) + PSQR / (2 * R * S) + QS / (2 * S * S));
      lo = Math.exp(Math.log(or) - 1.959963984540054 * se); hi = Math.exp(Math.log(or) + 1.959963984540054 * se);
    }
    return { or, lo, hi, p: Number.isFinite(stat) ? chi2sf1(stat) : null, strata: st.length };
  }
  function bh(ps) {
    const idx = ps.map((p, i) => [p, i]).filter(([p]) => p != null && Number.isFinite(p)).sort((x, y) => x[0] - y[0]);
    const out = ps.map(() => null), n = idx.length; let cum = 1;
    for (let i = n - 1; i >= 0; i--) { cum = Math.min(cum, idx[i][0] * n / (i + 1)); out[idx[i][1]] = Math.min(cum, 1); }
    return out;
  }
  Object.assign(K, { lgamma, hyperSF, fisher, mh, bh, chi2sf1 });
})();
