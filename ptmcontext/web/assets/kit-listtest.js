/* The numbers behind a pasted list of sites (Disease variants page, "Test the sites you chose" > Paste a list). A module of the
   site kit: K.listTest = { pooled, bh, resolve }.
     pooled(units, k)   the release's site-set test, for a set of sites: units are [n, share, k] per protein and residue type (n =
                        the changes at the protein's residues of that type, share = the listed sites' share of the expected
                        count, k = the changes at the listed sites). Under the null the total is a sum of Binomial(n, share), the
                        model of scripts/propensity.py set_test in the data release; the release estimates p from 10,000
                        draws (the smallest it can give is 1e-4), this gives the exact tail of that distribution. {expected, oe, pu, pl}.
     bh(ps)             Benjamini-Hochberg q (null in, null out; nulls are not counted), as the release's bh()
     resolve(text)      what a pasted text names, as the search reads it: its proteins, its sites (a protein's marks, or the site
                        typed), the names it did not find. A promise.
   Pure arithmetic apart from resolve, which reads K.sel. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';

  // ---- log-gamma (Lanczos, g = 7), for the binomial's pmf -------------------------------------------------------------
  const LG = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  function lgamma(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
    z -= 1;
    let x = LG[0];
    const t = z + 7.5;
    for (let i = 1; i < 9; i++) x += LG[i] / (z + i);
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  const lfact = (n) => (n < 2 ? 0 : lgamma(n + 1));

  // a window of the pmf of Binomial(n, s): { lo, pmf } over the values within 12 standard deviations (and 30) of the mean
  function binomial(n, s) {
    if (!(s > 0)) return { lo: 0, pmf: [1] };
    if (s >= 1) return { lo: n, pmf: [1] };
    const mean = n * s,
      half = 12 * Math.sqrt(n * s * (1 - s)) + 30,
      lo = Math.max(0, Math.floor(mean - half)),
      hi = Math.min(n, Math.ceil(mean + half)),
      ls = Math.log(s),
      lt = Math.log1p(-s),
      pmf = new Float64Array(hi - lo + 1);
    for (let j = lo; j <= hi; j++) pmf[j - lo] = Math.exp(lfact(n) - lfact(j) - lfact(n - j) + j * ls + (n - j) * lt);
    return { lo, pmf };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // The distribution of a sum of independent binomials, kept to a window around its mean (the mass outside it, below about 1e-30,
  // is dropped). units: [[n, share], ...]. A promise (it yields to the page every 400 units).
  async function sumOfBinomials(units) {
    let off = 0,
      cur = new Float64Array([1]),
      mean = 0,
      vari = 0;
    for (let u = 0; u < units.length; u++) {
      const [n, s] = units[u];
      const b = binomial(n, Math.min(1, s));
      const out = new Float64Array(cur.length + b.pmf.length - 1);
      for (let i = 0; i < cur.length; i++) {
        const c = cur[i];
        if (c === 0) continue;
        for (let j = 0; j < b.pmf.length; j++) out[i + j] += c * b.pmf[j];
      }
      off += b.lo;
      mean += n * s;
      vari += n * s * (1 - s);
      const half = 12 * Math.sqrt(vari) + 30,
        from = Math.max(off, Math.floor(mean - half)),
        to = Math.min(off + out.length - 1, Math.ceil(mean + half));
      cur = from > off || to < off + out.length - 1 ? out.slice(from - off, to - off + 1) : out;
      off = from;
      if (u % 400 === 399) await tick();
    }
    return { off, pmf: cur };
  }

  // The set test. units: [[n, share, k], ...] (a unit with n < 1 is left out). p's are the exact tails of the null sum:
  // pu = P(total >= observed), pl = P(total <= observed); a tail below the window is 0 (read it as < 1e-30).
  async function pooled(units) {
    const us = units.filter((u) => u[0] >= 1),
      observed = us.reduce((a, u) => a + u[2], 0),
      expected = us.reduce((a, u) => a + u[0] * Math.min(1, u[1]), 0);
    if (!us.length) return { units: 0, observed: 0, expected: null, oe: null, pu: null, pl: null };
    const { off, pmf } = await sumOfBinomials(us.map((u) => [u[0], u[1]]));
    let pu = 0,
      pl = 0;
    for (let i = 0; i < pmf.length; i++) {
      if (off + i >= observed) pu += pmf[i];
      if (off + i <= observed) pl += pmf[i];
    }
    // outside the window the tail is all or nothing
    if (observed < off) pu = 1;
    if (observed > off + pmf.length - 1) pl = 1;
    return {
      units: us.length,
      observed,
      expected,
      oe: expected > 0 ? observed / expected : null,
      pu: Math.min(1, pu),
      pl: Math.min(1, pl),
    };
  }

  // Benjamini-Hochberg, as scripts/propensity.py bh: nulls stay null and are not counted
  function bh(ps) {
    const idx = [];
    ps.forEach((p, i) => p != null && !Number.isNaN(p) && idx.push(i));
    const m = idx.length,
      out = ps.map(() => null);
    idx.sort((a, b) => ps[a] - ps[b] || a - b);
    let run = 1;
    for (let r = m - 1; r >= 0; r--) {
      run = Math.min(run, (ps[idx[r]] * m) / (r + 1));
      out[idx[r]] = Math.min(1, run);
    }
    return out;
  }

  // ---- what a pasted text names ----------------------------------------------------------------------------------------
  const MAX_SITES = 5000;
  const wait = async (f, ms = 60000) => {
    const t0 = Date.now();
    for (;;) {
      const v = f();
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await new Promise((r) => setTimeout(r, 80));
    }
  };
  // { proteins: accessions named (a gene or accession, or a site's protein), sites: [[acc, position, residue]] in the order named,
  //   nGenes, notFound: [names], rejected: [sentences], capped: sites before the cap | 0, notMarked: sites typed that are not marks }
  async function resolve(text) {
    const SD = await wait(() => K.sel.data());
    if (!SD) return null;
    const D = K.D;
    let q = K.sel.parse(text);
    // a typed site is checked against the sequence: read the proteins' sequences, then read the text again
    const sp = [...new Set(q.sites.map((x) => x[0]))].slice(0, 200);
    if (sp.length) {
      await Promise.all(sp.map((i) => K.sel.seqReady(K.sel.byAcc[D.proteins[i][0]])));
      q = K.sel.parse(text);
    }
    const marksOf = new Map(),
      isMark = new Set();
    SD.marks.forEach((m) => {
      const k = m[0] + ':' + m[1];
      if (isMark.has(k)) return;
      isMark.add(k);
      if (!marksOf.has(m[0])) marksOf.set(m[0], []);
      marksOf.get(m[0]).push([m[1], (m[4] || '')[7] || '']);
    });
    const sites = [],
      seen = new Set(),
      prots = new Set();
    let notMarked = 0;
    const add = (i, pos, res, typed) => {
      const key = i + ':' + pos;
      if (seen.has(key)) return;
      seen.add(key);
      if (typed && !isMark.has(key)) notMarked++;
      sites.push([D.proteins[i][0], pos, res]);
    };
    // the names in the order typed would need the parser's order; genes first, then typed sites, each in the order read
    for (const i of q.genes) {
      prots.add(i);
      for (const [pos, res] of marksOf.get(i) || []) add(i, pos, res, false);
    }
    for (const [i, pos, res] of q.sites) {
      prots.add(i);
      add(i, pos, res || (marksOf.get(i) || []).find((x) => x[0] === pos)?.[1] || '', true);
    }
    const notFound = [...new Set([...(q.absent || []), ...(q.unmatched || []), ...(q.ignored || [])])];
    return {
      proteins: [...prots].map((i) => D.proteins[i][0]),
      sites: sites.slice(0, MAX_SITES),
      nGenes: prots.size,
      notFound,
      rejected: q.rejected || [],
      capped: sites.length > MAX_SITES ? sites.length : 0,
      notMarked,
      noMarks: [...prots].filter((i) => !(marksOf.get(i) || []).length && !q.sites.some((x) => x[0] === i)).length,
    };
  }

  K.listTest = { pooled, bh, resolve, MAX_SITES, sumOfBinomials };
});
