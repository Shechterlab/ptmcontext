/* The Overlap page (#overlap?t=<terms>; website.overlap): the reader picks 2 to 4 terms (the sets of the site's protein-set questions,
   the classes of its other questions, reader families, enzymes, the current or a saved selection, a pasted list of genes, protein
   kinds) and sees how their proteins overlap: a proportional diagram for two or three terms, an UpSet-style bar chart of the
   intersections for any number. Each region shows its proteins, those with sites, the share with sites against the share among all
   reviewed proteins, the fold, a one-sided hypergeometric test against all reviewed proteins (ptmstats.hypergeom_sf, the test of the
   protein-set engine, on the same counts) and Benjamini-Hochberg q across the regions shown, and the sites in it. Units: proteins,
   sites (pooled Fisher test over the residues of proteins with sites, where every term is a property of proteins; counts otherwise),
   enzymes and readers (the proteins of those families). A region opens its protein list and can become the selection. A module of the
   site kit; the data it reads come through the accessors in DATA, and the arithmetic is in K.overlap.core. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, S, esc, int } = K;
  const C = D.overlap;
  if (!C) return;
  const ST = window.PTMC_STATS;
  const F = D.front || {};
  const MAXT = Math.min(4, C.max_terms || 4);
  const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100']; // categorical slots 1 to 4 (validate_palette.js, light and dark)
  const LETTERS = 'ABCD';
  const UNITS = { proteins: 'Proteins', sites: 'Sites', enzymes: 'Enzymes', readers: 'Readers' };
  const SELMAX = 300; // most proteins a region puts in the address as a selection

  // ---- the core: counts and tests, in plain arrays (tested against Python) ----------------------------------------------
  // regions(nT, masks, marked, weight): per mask of terms, {n elements, k marked, sites}
  function regions(nT, mask, marked, weight) {
    const out = Array.from({ length: 1 << nT }, () => ({ n: 0, k: 0, w: 0 }));
    for (let e = 0; e < mask.length; e++) {
      const r = out[mask[e]];
      r.n++;
      if (marked && marked[e]) r.k++;
      if (weight) r.w += weight[e];
    }
    return out;
  }
  // one row of the protein test: k of the n proteins have sites; M of the N reviewed proteins have
  function proteinTest(k, n, M, N) {
    const share = n ? k / n : null,
      base = M / N,
      fold = n && M ? share / base : null;
    return { k, n, M, N, share, base, fold, p: n ? (k ? ST.hyperSF(k, N, M, n) : 1) : null };
  }
  // one row of the site test: a sites of the region's residues are sites, b other candidates; c, d outside
  function siteTest(a, b, c, d) {
    const f = ST.fisher(a, b, c, d),
      s1 = a + b ? a / (a + b) : null,
      s2 = c + d ? c / (c + d) : null;
    return { a, b, c, d, or: f.or, p: f.p, fold: s1 != null && s2 ? s1 / s2 : null };
  }
  const MIN_N = 5; // a region of fewer elements is counted, not tested
  // a region too small to test has no fold, p or q, and is left out of the Benjamini-Hochberg family
  const settle = (rows, minN) => {
    rows.forEach((r) => {
      if (r.n < minN) Object.assign(r, { few: true, p: null, q: null, fold: null });
    });
    return bhAll(rows.filter((r) => !r.few));
  };
  const bhAll = (rows) => {
    const q = ST.bh(rows.map((r) => r.p));
    rows.forEach((r, i) => {
      r.q = q[i];
    });
    return rows;
  };

  // ---- the data: one small accessor each; selection.json is read only through SD() ------------------------------------------
  const DATA = {
    json: (path) =>
      fetch(C.dir + path).then(
        (r) => (r.ok ? r.json() : null),
        () => null
      ),
    cache: {},
    get(path) {
      return (this.cache[path] ||= this.json(path));
    },
    universe: () => DATA.get('universe.json'),
    sets: (aid) => DATA.get(`sets/${aid}.json`),
    families: () => DATA.get('families.json'),
    sd: () => K.sel.data(), // selection.json: the marks, their classes, and the protein sets' marked members
    sdReady: () => K.sel.ready,
  };

  // ---- state in the address -----------------------------------------------------------------------------------------------
  const clean = () => ({ ot: [], ou: 'proteins', ov: 'auto', or: '' });
  Object.assign(S, clean());
  K.paramsIn.push((p) => {
    S.ot = (p.get('t') || '')
      .split(',')
      .filter(Boolean)
      .map((x) => {
        try {
          return decodeURIComponent(x);
        } catch (e) {
          return x;
        }
      })
      .slice(0, MAXT);
    S.ou = C.units.includes(p.get('ou')) ? p.get('ou') : 'proteins';
    S.ov = 'auto'; // an old link's display choice is read and ignored
    S.or = /^\d+$/.test(p.get('or') || '') ? p.get('or') : '';
  });
  K.paramsOut.push((p) => {
    if (S.view !== 'overlap') return;
    if (S.ot.length) p.set('t', S.ot.map((x) => x.replace(/%/g, '%25').replace(/,/g, '%2C')).join(','));
    if (S.ou !== 'proteins') p.set('ou', S.ou);
    if (S.or) p.set('or', S.or);
  });

  // ---- terms --------------------------------------------------------------------------------------------------------------
  const sets = (C.terms_from || []).filter((a) => A[a]?.kind === 'protein_sets');
  const classQs = (C.terms_from || []).filter((a) => A[a] && A[a].kind !== 'protein_sets');
  const labelCache = {};
  const rowsOf = (aid) =>
    (labelCache[aid] ||= (
      A[aid]?.kind === 'protein_sets' ? K.rowsFor(A[aid], 'enricher') : K.rowsFor(A[aid], 'mantel_haenszel') || []
    )
      .filter((r) => !(C.leave_out?.[aid] || []).includes(r.category))
      .map((r) => ({
        id: r.category,
        label: F.row_labels?.[aid]?.[r.category] || r.label || r.category,
        size: (r.a ?? 0) + (r.c ?? 0),
      })));
  const uniq = (rows) => [...new Map(rows.map((r) => [r.id, r])).values()];
  const short = (aid) => F.short?.[aid] || A[aid]?.title || aid;
  const savedList = () => (K.sel.savedList ? K.sel.savedList() : []);
  // every term the picker can offer, built when first asked
  let pool = null;
  const srcTerms = {}; // term source id -> [[term id, name, proteins]], read when the page opens
  let srcLoading = null;
  function loadSources() {
    return (srcLoading ||= Promise.all(
      (C.sources || []).map((src) =>
        DATA.get(`sources/${src.id}/terms.json`).then((d) => {
          srcTerms[src.id] = d?.terms || [];
        })
      )
    ).then(() => {
      pool = null;
      if (S.view === 'overlap') K.render();
    }));
  }
  function termPool() {
    if (pool) return pool;
    pool = [];
    sets.forEach((aid) =>
      uniq(rowsOf(aid)).forEach((r) =>
        pool.push({
          id: `s:${aid}:${r.id}`,
          label: r.label,
          group: short(aid),
          size: r.size,
          broad: C.n && r.size > 0.25 * C.n,
          note: C.notes?.[aid] || '',
        })
      )
    );
    classQs.forEach((aid) =>
      uniq(rowsOf(aid)).forEach((r) => pool.push({ id: `c:${aid}:${r.id}`, label: r.label, group: short(aid) }))
    );
    (C.sources || []).forEach((src) =>
      (srcTerms[src.id] || []).forEach(([id, name, n]) =>
        pool.push({
          id: `x:${src.id}:${id}`,
          label: name,
          ref: id,
          size: n,
          group: src.title,
          broad: C.n && n > 0.25 * C.n,
        })
      )
    );
    (C.families?.readers || []).forEach((f) =>
      pool.push({ id: `f:readers:${f.id}`, label: `${f.name} (reader)`, group: 'Readers' })
    );
    (C.families?.enzymes || []).forEach((f) => pool.push({ id: `f:enzymes:${f.id}`, label: f.name, group: 'Enzymes' }));
    const pa = D.protein_attributes;
    Object.entries(pa?.specs || {}).forEach(([name, sp]) => {
      if (sp.kind === 'number' || sp.kind === 'list' || !pa.values?.[name]) return;
      [...new Set(pa.values[name].filter((v) => v != null && v !== ''))]
        .slice(0, 60)
        .forEach((v) =>
          pool.push({ id: `a:${name}:${v}`, label: `${(sp.values || {})[v] || v}`, group: sp.label || name })
        );
    });
    return pool;
  }
  const specials = () => [
    ...(K.sel.active() ? [{ id: 'sel', label: 'The current selection', group: 'Selections' }] : []),
    ...savedList().map((x) => ({ id: `sv:${x.name}`, label: `Saved: ${x.name}`, group: 'Selections' })),
  ];
  const termLabel = (id) => {
    const t = [...termPool(), ...specials()].find((x) => x.id === id);
    if (t) return t.label;
    if (id === 'sel') return 'The current selection';
    if (id.startsWith('g:')) return 'Gene list';
    if (id.startsWith('x:')) return id.split(':').slice(2).join(':');
    return id.replace(/^[a-z]+:/, '');
  };

  // ---- universe, marks and terms as arrays ------------------------------------------------------------------------------
  let U = null; // {acc, n, partial, marked: Uint8Array, pu: [universe index of each protein with sites], weight}
  let loadingU = null;
  function loadUniverse() {
    return (loadingU ||= DATA.universe().then((u) => {
      const acc = u?.acc || D.proteins.map((p) => p[0]),
        ix = new Map(acc.map((a, i) => [a, i])),
        marked = new Uint8Array(acc.length),
        weight = new Uint32Array(acc.length),
        pu = D.proteins.map((p, i) => {
          const j = ix.get(p[0]);
          if (j != null) {
            marked[j] = 1;
            weight[j] = p[4] || 0;
          }
          return j ?? -1;
        });
      U = { acc, ix, n: acc.length, partial: !u, marked, pu, weight, nMarked: marked.reduce((s, x) => s + x, 0) };
      return U;
    }));
  }
  const fromIdx = (list) => {
    const a = new Uint8Array(U.n);
    (list || []).forEach((i) => {
      a[i] = 1;
    });
    return a;
  };
  const fromProteins = (set) => {
    const a = new Uint8Array(U.n);
    set.forEach((pi) => {
      if (U.pu[pi] >= 0) a[U.pu[pi]] = 1;
    });
    return a;
  };
  const count = (a) => a.reduce((s, x) => s + x, 0);
  // a term's file: the sum of its id's character codes, modulo the number of files (web/overlap.py shard_name)
  const shardName = (id, n = 16) =>
    String([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % n).padStart(2, '0') + '.json';
  const cache = {};
  async function resolve(id) {
    if (cache[id] !== undefined) return cache[id];
    let t = null;
    const [kind, a1, ...r] = id.split(':'),
      rest = r.join(':');
    if (kind === 's') {
      const set = a1 && rest;
      let prot = null;
      const f = await DATA.sets(a1);
      if (f?.[rest]) prot = fromIdx(f[rest]);
      else {
        // without the sets of every protein: the marked proteins of the set, from selection.json
        await DATA.sdReady();
        const ps = DATA.sd()?.protein_sets?.[a1];
        const row = ps && !ps.of ? ps.sets.find((x) => x[0] === rest) : null;
        if (row) prot = fromProteins(new Set(row[2]));
      }
      if (set && prot) t = { prot };
    } else if (kind === 'x') {
      await loadSources();
      const src = (C.sources || []).find((x) => x.id === a1),
        file = src && (await DATA.get(`sources/${a1}/${shardName(rest, src.shards)}`));
      if (file?.[rest]) t = { prot: fromIdx(file[rest]) };
    } else if (kind === 'f') {
      const fam = (await DATA.families())?.[a1]?.find((x) => x.id === rest);
      if (fam) t = { prot: fromIdx(fam.m) };
    } else if (kind === 'a') {
      const v = D.protein_attributes?.values?.[a1];
      if (v) t = { prot: fromProteins(new Set(v.map((x, i) => (x === rest ? i : -1)).filter((i) => i >= 0))) };
    } else if (kind === 'c' || kind === 'sel' || kind === 'sv' || kind === 'g') {
      await DATA.sdReady();
      const SD = DATA.sd();
      if (SD) {
        let marks = null;
        if (kind === 'c') {
          const ai = SD.analyses.indexOf(a1),
            ci = SD.classes[a1]?.indexOf(rest);
          if (ai >= 0 && ci >= 0)
            marks = SD.marks.map((m, i) => (m[2][ai].includes(ci) ? i : -1)).filter((i) => i >= 0);
        } else if (kind === 'sel') {
          marks = K.sel.compute().marks;
        } else if (kind === 'sv') {
          const x = savedList().find((y) => y.name === [a1, ...r].join(':'));
          if (x) {
            const st = K.sel.stateOfHash(x.hash);
            marks = K.sel.select(st.q, st.f).marks;
          }
        } else {
          const q = K.sel.parse(id.slice(2)),
            ps = new Set([...q.genes, ...q.sites.map((s) => s[0])]);
          marks = SD.marks.map((m, i) => (ps.has(m[0]) ? i : -1)).filter((i) => i >= 0);
        }
        if (marks) {
          const mk = new Uint8Array(SD.marks.length);
          marks.forEach((i) => {
            mk[i] = 1;
          });
          t = {
            prot: fromProteins(new Set(marks.map((i) => SD.marks[i][0]))),
            mark: kind === 'g' || kind === 'sel' || kind === 'sv' || kind === 'c' ? mk : null,
          };
        }
      }
    }
    if (t) {
      t.id = id;
      t.label = kind === 'g' ? `Gene list (${count(t.prot)})` : termLabel(id);
      t.n = count(t.prot);
    }
    return (cache[id] = t);
  }

  // ---- the result: regions of the chosen terms in the chosen unit ---------------------------------------------------------
  let RES = null;
  async function compute(ids, unit, minN = MIN_N) {
    await loadUniverse();
    const ts = (await Promise.all(ids.map(resolve))).filter(Boolean),
      nT = ts.length;
    const fams = await DATA.families();
    const res = { ts, unit, nT, partial: U.partial, rows: [], totals: [], note: '' };
    if (nT < 2) return res;
    const SD = ts.some((t) => t.mark) || unit === 'sites' ? (await DATA.sdReady(), DATA.sd()) : null;
    let mask, marked, weight, elems;

    if (unit === 'sites') {
      const m = SD.marks;
      mask = new Uint8Array(m.length);
      const siteLevel = ts.some((t) => t.mark);
      ts.forEach((t, i) => {
        for (let e = 0; e < m.length; e++) {
          const on = t.mark ? t.mark[e] : U.pu[m[e][0]] >= 0 && t.prot[U.pu[m[e][0]]];
          if (on) mask[e] |= 1 << i;
        }
      });
      const byMark = regions(nT, mask, null, null);
      res.rows = byMark.map((r, k) => ({ mask: k, n: r.n }));
      // proteins and candidate residues of the proteins of each region (a region is a set of residues; protein-level terms only)
      if (!siteLevel && !U.partial) {
        const A_ = m.length,
          CAND = SD.others_total.reduce((s, x) => s + x, 0),
          cand = new Array(1 << nT).fill(0);
        const pm = new Map();
        for (let e = 0; e < m.length; e++) if (!pm.has(m[e][0])) pm.set(m[e][0], mask[e]);
        pm.forEach((mk, pi) => {
          cand[mk] += SD.others_total[pi] || 0;
        });
        const tests = res.rows
          .map((r, k) => {
            if (!k || !r.n) return r;
            const t = siteTest(r.n, cand[k], A_ - r.n, CAND - cand[k]);
            Object.assign(r, t);
            return r;
          })
          .filter((r) => r.mask && r.n);
        settle(tests, minN);
        res.test = 'sites';
      }
      const pset = new Array(1 << nT).fill(0).map(() => new Set());
      for (let e = 0; e < m.length; e++) pset[mask[e]].add(m[e][0]);
      res.rows.forEach((r, k) => {
        r.proteins = pset[k].size;
      });
    } else {
      const inUnit =
        unit === 'proteins'
          ? null
          : (() => {
              const a = new Uint8Array(U.n);
              (fams?.[unit] || []).forEach((f) => f.m.forEach((i) => (a[i] = 1)));
              return a;
            })();
      const idx = [];
      for (let u = 0; u < U.n; u++) if (!inUnit || inUnit[u]) idx.push(u);
      mask = new Uint8Array(idx.length);
      marked = new Uint8Array(idx.length);
      weight = new Uint32Array(idx.length);
      idx.forEach((u, e) => {
        let mk = 0;
        for (let i = 0; i < nT; i++) if (ts[i].prot[u]) mk |= 1 << i;
        mask[e] = mk;
        marked[e] = U.marked[u];
        weight[e] = U.weight[u];
      });
      elems = idx;
      const reg = regions(nT, mask, marked, weight),
        N = U.n,
        M = U.nMarked;
      res.rows = reg.map((r, k) => ({
        mask: k,
        ...(U.partial ? { k: r.k, n: r.n } : proteinTest(r.k, r.n, M, N)),
        sites: r.w,
      }));
      res.N = N;
      res.M = M;
      if (!U.partial) {
        settle(
          res.rows.filter((r) => r.mask && r.n),
          minN
        );
        res.test = 'proteins';
        // each term's every protein (a family of its own for q)
        res.totals = ts.map((t, i) => {
          let n = 0,
            k = 0,
            w = 0;
          for (let e = 0; e < mask.length; e++)
            if (mask[e] & (1 << i)) {
              n++;
              k += marked[e];
              w += weight[e];
            }
          return { i, ...proteinTest(k, n, M, N), sites: w };
        });
        settle(res.totals, minN);
      }
    }
    res.rows[0].outside = true; // the proteins in none of the terms: counted, not shown as a region
    res.mask = mask;
    res.elems = elems;
    res.marked = marked;
    return res;
  }

  // a region's letters for the table: "A + B (not C)"
  const regionLetters = (mask, nT) => {
    const idx = [...Array(nT).keys()],
      inn = idx.filter((i) => mask & (1 << i)).map((i) => LETTERS[i]),
      out = idx.filter((i) => !(mask & (1 << i))).map((i) => LETTERS[i]);
    return inn.join(' + ') + (out.length ? ` (not ${out.join(', ')})` : '');
  };
  const unitWord = (u) => ({ proteins: 'proteins', sites: 'sites', enzymes: 'enzymes', readers: 'readers' })[u];
  // ---- the figure: a region matrix with size and share bars, and an area-proportional glyph for two or three terms -------------
  const NS = 'http://www.w3.org/2000/svg';
  const PADJ = K.PADJ ?? 0.05,
    MIN_EFF = K.MIN_EFFECT ?? 1.1; // the site's significance rule: q <= PADJ and at least MIN_EFF
  const fmtInt = (v) => Number(v).toLocaleString('en-US');
  const pct = (v) => (v * 100 >= 99.95 ? '100' : (v * 100).toFixed(1)) + '%';
  const fqf = (v) => (v == null ? '–' : K.fq(v));
  const foldFmt = (f, k) =>
    k === 0 ? '0×' : f == null ? '–' : f < 0.01 ? '< 0.01×' : (f >= 1.25 ? f.toFixed(1) : f.toFixed(2)) + '×';
  // the 95% Wilson score interval of k/n
  function wilson(k, n, z = 1.959963984540054) {
    const p = k / n,
      d = 1 + (z * z) / n,
      c = (p + (z * z) / (2 * n)) / d,
      h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  // Woolf's 95% interval of the Haldane odds ratio of a 2x2 table (as the pooled Fisher rows)
  function woolf(a, b, c, d, z = 1.959963984540054) {
    const o = Math.log(((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5))),
      s = Math.sqrt(1 / (a + 0.5) + 1 / (b + 0.5) + 1 / (c + 0.5) + 1 / (d + 0.5));
    return [Math.exp(o - z * s), Math.exp(o + z * s)];
  }
  let ctx2d = null;
  const tw = (s, px = 12, w = 600) => {
    try {
      ctx2d ||= document.createElement('canvas').getContext('2d');
      ctx2d.font = `${w} ${px}px Inter, sans-serif`;
      return ctx2d.measureText(s).width;
    } catch (e) {
      return String(s).length * px * 0.56;
    }
  };
  const el = (tag, attrs = {}, kids = []) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    kids.forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };
  const svgEl = (w, h, kids) => el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, overflow: 'visible' }, kids);
  const html = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  // a bar with a rounded data end and a square end at its baseline
  function barPath(x0, x1, yc, h, r) {
    const w = Math.abs(x1 - x0);
    r = Math.min(r, w / 2, h / 2);
    const y0 = yc - h / 2,
      y1 = yc + h / 2;
    if (x1 >= x0)
      return `M${x0},${y0}H${x1 - r}A${r},${r} 0 0 1 ${x1},${y0 + r}V${y1 - r}A${r},${r} 0 0 1 ${x1 - r},${y1}H${x0}Z`;
    return `M${x0},${y0}H${x1 + r}A${r},${r} 0 0 0 ${x1},${y0 + r}V${y1 - r}A${r},${r} 0 0 0 ${x1 + r},${y1}H${x0}Z`;
  }
  function niceTicks(max, want = 4) {
    const raw = max / want,
      mag = 10 ** Math.floor(Math.log10(raw)),
      st = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw),
      out = [];
    for (let v = 0; v <= max * 1.0001; v += st) out.push(+v.toFixed(6));
    return out;
  }
  // the size axis; one value far above the rest cuts the axis (the bars above the gap run to the edge, marked //)
  function sizeScale(values) {
    const v = [...values].sort((a, b) => b - a);
    let cut = -1,
      ratio = 0;
    for (let i = 0; i < v.length - 1; i++)
      if (v[i] / Math.max(1, v[i + 1]) > ratio) {
        ratio = v[i] / Math.max(1, v[i + 1]);
        cut = i;
      }
    if (ratio > 4 && cut + 1 <= v.length / 3) {
      const ticks = niceTicks(v[cut + 1] * 1.08);
      return { max: Math.max(v[cut + 1], ticks.at(-1)), ticks, brk: v[cut], base: v[cut + 1] * 1.08 };
    }
    const ticks = niceTicks(v[0] || 1);
    return { max: Math.max(v[0] || 1, ticks.at(-1)), ticks, brk: Infinity, base: v[0] || 1 };
  }

  // -- the layout of two or three circles with areas proportional to the counts
  const lens = (r1, r2, d) => {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
    const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)),
      b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
    return a + b - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  };
  function distFor(r1, r2, area) {
    let lo = Math.abs(r1 - r2),
      hi = r1 + r2;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (lens(r1, r2, mid) > area) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  // the area common to three circles: exact vertical chords integrated over x (smooth in the parameters)
  function tripleArea(c) {
    const lo = Math.max(...c.map((k) => k.x - k.r)),
      hi = Math.min(...c.map((k) => k.x + k.r));
    if (lo >= hi) return 0;
    const S_ = 600,
      h = (hi - lo) / S_;
    let s = 0;
    for (let i = 0; i < S_; i++) {
      const x = lo + (i + 0.5) * h;
      let a = -Infinity,
        b = Infinity;
      for (const k of c) {
        const dy = Math.sqrt(Math.max(0, k.r * k.r - (x - k.x) ** 2));
        a = Math.max(a, k.y - dy);
        b = Math.min(b, k.y + dy);
      }
      if (b > a) s += (b - a) * h;
    }
    return s;
  }
  function regionAreas(c) {
    const A_ = c.map((k) => Math.PI * k.r * k.r),
      d = (i, j) => Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y);
    if (c.length === 2) {
      const o = lens(c[0].r, c[1].r, d(0, 1));
      return { 1: A_[0] - o, 2: A_[1] - o, 3: o };
    }
    const o01 = lens(c[0].r, c[1].r, d(0, 1)),
      o02 = lens(c[0].r, c[2].r, d(0, 2)),
      o12 = lens(c[1].r, c[2].r, d(1, 2)),
      t = tripleArea(c);
    return {
      1: A_[0] - o01 - o02 + t,
      2: A_[1] - o01 - o12 + t,
      4: A_[2] - o02 - o12 + t,
      3: o01 - t,
      5: o02 - t,
      6: o12 - t,
      7: t,
    };
  }
  function nelderMead(f, x0, it = 600) {
    const n = x0.length;
    let P = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + (Math.abs(v) * 0.1 || 0.5) : v)))],
      F = P.map(f);
    for (let k = 0; k < it; k++) {
      const o = [...P.keys()].sort((a, b) => F[a] - F[b]);
      P = o.map((i) => P[i]);
      F = o.map((i) => F[i]);
      const c = P[0].map((_, j) => P.slice(0, n).reduce((s, p) => s + p[j], 0) / n),
        at = (t) => c.map((v, j) => v + t * (P[n][j] - v)),
        xr = at(-1),
        fr = f(xr);
      if (fr < F[0]) {
        const xe = at(-2),
          fe = f(xe);
        [P[n], F[n]] = fe < fr ? [xe, fe] : [xr, fr];
      } else if (fr < F[n - 1]) {
        P[n] = xr;
        F[n] = fr;
      } else {
        const xc = at(0.5),
          fc = f(xc);
        if (fc < F[n]) {
          P[n] = xc;
          F[n] = fc;
        } else
          for (let i = 1; i <= n; i++) {
            P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j]));
            F[i] = f(P[i]);
          }
      }
    }
    return P[F.indexOf(Math.min(...F))];
  }
  // circles of area = the term's size, fitted to the exclusive regions (target: mask -> count); a pair that shares nothing keeps a gap
  function euler(sizes, target) {
    const r = sizes.map((s) => Math.sqrt(s / Math.PI)),
      tot = Object.values(target).reduce((a, b) => a + b, 0) || 1,
      pairT = (i, j) => Object.entries(target).reduce((s, [m, v]) => s + (m & (1 << i) && m & (1 << j) ? v : 0), 0),
      gap = (i, j) => 0.18 * Math.min(r[i], r[j]),
      d0 = (i, j) => (pairT(i, j) > 0 ? distFor(r[i], r[j], pairT(i, j)) : r[i] + r[j] + gap(i, j));
    if (sizes.length === 2)
      return {
        c: [
          { x: 0, y: 0, r: r[0] },
          { x: d0(0, 1), y: 0, r: r[1] },
        ],
        err: 0,
      };
    const build = (p) => [
        { x: 0, y: 0, r: r[0] },
        { x: p[0], y: 0, r: r[1] },
        { x: p[1], y: p[2], r: r[2] },
      ],
      loss = (p) => {
        const c = build(p),
          a = regionAreas(c);
        let s = 0;
        for (const m of [1, 2, 3, 4, 5, 6, 7]) s += ((a[m] - (target[m] || 0)) / tot) ** 2;
        for (const [i, j] of [
          [0, 1],
          [0, 2],
          [1, 2],
        ])
          if (!pairT(i, j)) {
            const d = Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y),
              want = r[i] + r[j] + gap(i, j);
            if (d < want) s += 4 * ((want - d) / (r[i] + r[j])) ** 2;
          }
        return s;
      };
    const a01 = d0(0, 1),
      a02 = d0(0, 2),
      a12 = d0(1, 2),
      x = (a02 * a02 - a12 * a12 + a01 * a01) / (2 * a01),
      p = nelderMead(loss, [a01, x, Math.sqrt(Math.max(0, a02 * a02 - x * x)) || 0.01]),
      c = build(p),
      a = regionAreas(c),
      fa = Object.values(a).reduce((s, v) => s + Math.max(0, v), 0),
      err = Math.max(...[1, 2, 3, 4, 5, 6, 7].map((m) => Math.abs(Math.max(0, a[m]) / fa - (target[m] || 0) / tot)));
    if (c[2].y < 0) c.forEach((k) => (k.y = -k.y));
    return { c, err };
  }
  // the glyph's layout: circles in pixels, a label for each region (inside at its pole of inaccessibility if it fits, else outside on a
  // leader), a letter beside each circle; nothing overlaps; the region under any point (mask) for the pointer
  function glyphLayout(sizes, regions, opt) {
    const target = {};
    regions.forEach((r) => (target[r.m] = r.n));
    const { c, err } = euler(sizes, target),
      PAD = 34,
      x0 = Math.min(...c.map((k) => k.x - k.r)),
      x1 = Math.max(...c.map((k) => k.x + k.r)),
      y0 = Math.min(...c.map((k) => k.y - k.r)),
      y1 = Math.max(...c.map((k) => k.y + k.r)),
      sc = Math.min((opt.w - 2 * PAD) / (x1 - x0 || 1), (opt.h - 2 * PAD) / (y1 - y0 || 1)),
      W_ = Math.ceil((x1 - x0) * sc + 2 * PAD),
      H_ = Math.ceil((y1 - y0) * sc + 2 * PAD),
      C_ = c.map((k) => ({ x: (k.x - x0) * sc + PAD, y: (k.y - y0) * sc + PAD, r: k.r * sc })),
      mask = new Uint8Array(W_ * H_);
    for (let y = 0; y < H_; y++)
      for (let x = 0; x < W_; x++) {
        let m = 0;
        C_.forEach((k, i) => {
          if ((x + 0.5 - k.x) ** 2 + (y + 0.5 - k.y) ** 2 <= k.r * k.r) m |= 1 << i;
        });
        mask[y * W_ + x] = m;
      }
    const at = (x, y) => (x < 0 || y < 0 || x >= W_ || y >= H_ ? 0 : mask[(y | 0) * W_ + (x | 0)]);
    function pole(m) {
      const Dm = new Float32Array(W_ * H_),
        INF = 1e9;
      for (let i = 0; i < W_ * H_; i++) Dm[i] = mask[i] === m ? INF : 0;
      const g = (x, y) => (x < 0 || y < 0 || x >= W_ || y >= H_ ? 0 : Dm[y * W_ + x]);
      for (let y = 0; y < H_; y++)
        for (let x = 0; x < W_; x++) {
          const i = y * W_ + x;
          if (Dm[i])
            Dm[i] = Math.min(Dm[i], g(x - 1, y) + 1, g(x, y - 1) + 1, g(x - 1, y - 1) + 1.414, g(x + 1, y - 1) + 1.414);
        }
      for (let y = H_ - 1; y >= 0; y--)
        for (let x = W_ - 1; x >= 0; x--) {
          const i = y * W_ + x;
          if (Dm[i])
            Dm[i] = Math.min(Dm[i], g(x + 1, y) + 1, g(x, y + 1) + 1, g(x + 1, y + 1) + 1.414, g(x - 1, y + 1) + 1.414);
        }
      let b = -1,
        bi = -1;
      for (let i = 0; i < W_ * H_; i++)
        if (Dm[i] > b) {
          b = Dm[i];
          bi = i;
        }
      return b > 0 ? { x: (bi % W_) + 0.5, y: ((bi / W_) | 0) + 0.5, d: b } : null;
    }
    const boxes = [],
      clearOf = (b, m) => {
        for (let y = Math.floor(b.y); y < b.y + b.h; y++)
          for (let x = Math.floor(b.x); x < b.x + b.w; x++) if (at(x, y) !== m) return false;
        return !boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
      },
      tot2 = C_.reduce((s, k) => s + k.r * k.r, 0),
      cx = C_.reduce((s, k) => s + k.x * k.r * k.r, 0) / tot2,
      cy = C_.reduce((s, k) => s + k.y * k.r * k.r, 0) / tot2,
      labels = [],
      letters = [],
      leaders = [],
      outside = [];
    regions
      .filter((r) => r.n > 0)
      .forEach((r) => {
        const P = pole(r.m),
          txt = fmtInt(r.n),
          w = tw(txt, 12, 650) + 6,
          h = 15;
        if (P) {
          const b = { x: P.x - w / 2, y: P.y - h / 2, w, h };
          if (clearOf(b, r.m)) {
            boxes.push(b);
            labels.push({ r, x: P.x, y: P.y, txt });
            return;
          }
        }
        outside.push({ r, P, txt, w, h });
      });
    C_.forEach((k, i) => {
      const base = Math.atan2(k.y - cy, k.x - cx) || -Math.PI / 2;
      let best = null;
      for (let s = 0; s < 48 && !best; s++) {
        const a = base + (s % 2 ? 1 : -1) * Math.ceil(s / 2) * (Math.PI / 24),
          lx = k.x + Math.cos(a) * (k.r + 11),
          ly = k.y + Math.sin(a) * (k.r + 11),
          b = { x: lx - 6, y: ly - 8, w: 12, h: 16 };
        if (b.x > -PAD && b.y > -PAD && clearOf(b, 0)) best = { b, lx, ly };
      }
      if (best) {
        boxes.push(best.b);
        letters.push({ i, x: best.lx, y: best.ly });
      }
    });
    outside.forEach((o) => {
      const P =
        o.P ||
        (() => {
          let sx = 0,
            sy = 0,
            n = 0;
          for (let i = 0; i < W_ * H_; i++)
            if (mask[i] === o.r.m) {
              sx += i % W_;
              sy += (i / W_) | 0;
              n++;
            }
          return { x: sx / (n || 1), y: sy / (n || 1) };
        })();
      const base = Math.atan2(P.y - cy, P.x - cx);
      let best = null;
      for (let s = 0; s < 36; s++) {
        const a = base + (s % 2 ? 1 : -1) * Math.ceil(s / 2) * (Math.PI / 18);
        for (let rho = 6; rho < 140; rho += 2) {
          const bx = P.x + Math.cos(a) * rho,
            by = P.y + Math.sin(a) * rho,
            b = { x: bx - o.w / 2 - 2, y: by - o.h / 2 - 2, w: o.w + 4, h: o.h + 4 };
          if (clearOf(b, 0)) {
            const score = rho + Math.ceil(s / 2) * 6;
            if (!best || score < best.score) best = { score, bx, by, b };
            break;
          }
        }
      }
      if (!best) return;
      boxes.push(best.b);
      labels.push({ r: o.r, x: best.bx, y: best.by, txt: o.txt, out: true });
      leaders.push({
        x1: P.x,
        y1: P.y,
        x2: Math.max(best.b.x + 2, Math.min(P.x, best.b.x + best.b.w - 2)),
        y2: Math.max(best.b.y + 2, Math.min(P.y, best.b.y + best.b.h - 2)),
      });
    });
    const all = [...boxes, ...C_.map((k) => ({ x: k.x - k.r - 2, y: k.y - k.r - 2, w: 2 * k.r + 4, h: 2 * k.r + 4 }))],
      vx = Math.floor(Math.min(...all.map((b) => b.x))) - 2,
      vy = Math.floor(Math.min(...all.map((b) => b.y))) - 2,
      vw = Math.ceil(Math.max(...all.map((b) => b.x + b.w))) - vx + 2,
      vh = Math.ceil(Math.max(...all.map((b) => b.y + b.h))) - vy + 2;
    return { C: C_, labels, letters, leaders, boxes, err, vx, vy, vw, vh, at };
  }
  // the glyph as SVG: circles, the hovered and the selected region washed and outlined through a mask, counts, letters
  function glyphSvg(L, nTerms, st = {}) {
    const S_ = el('svg', {
        width: L.vw,
        height: L.vh,
        viewBox: `${L.vx} ${L.vy} ${L.vw} ${L.vh}`,
        role: 'img',
        'aria-label': 'Euler diagram of the terms; circle areas are proportional to the counts',
      }),
      uid = 'ovg' + Math.random().toString(36).slice(2, 8),
      defs = el('defs');
    S_.appendChild(defs);
    const { C: C_ } = L;
    C_.forEach((k, i) =>
      S_.appendChild(
        el('circle', {
          cx: k.x,
          cy: k.y,
          r: k.r,
          fill: `var(--fig-c${i + 1})`,
          'fill-opacity': 'var(--fig-euler-op)',
          style: 'fill-opacity:var(--fig-euler-op)',
        })
      )
    );
    [
      ['hover', 'var(--fig-ink)', 0.06],
      ['sel', 'var(--fig-select-edge)', 0.14],
    ].forEach(([key, col, op]) => {
      const m = st[key];
      if (!m) return;
      const id = uid + key,
        mk = el('mask', {
          id,
          maskUnits: 'userSpaceOnUse',
          x: L.vx - 10,
          y: L.vy - 10,
          width: L.vw + 20,
          height: L.vh + 20,
        });
      mk.appendChild(el('rect', { x: L.vx - 10, y: L.vy - 10, width: L.vw + 20, height: L.vh + 20, fill: 'black' }));
      C_.forEach((k, i) => {
        if (m & (1 << i)) mk.appendChild(el('circle', { cx: k.x, cy: k.y, r: k.r, fill: 'white' }));
      });
      C_.forEach((k, i) => {
        if (!(m & (1 << i))) mk.appendChild(el('circle', { cx: k.x, cy: k.y, r: k.r, fill: 'black' }));
      });
      defs.appendChild(mk);
      const g = el('g', { mask: `url(#${id})` }),
        inn = C_.filter((_, i) => m & (1 << i));
      if (inn.length > 1) {
        let ref = null;
        inn.forEach((k, j) => {
          const cp = el('clipPath', { id: `${id}c${j}` }, [el('circle', { cx: k.x, cy: k.y, r: k.r })]);
          if (ref) cp.setAttribute('clip-path', `url(#${ref})`);
          defs.appendChild(cp);
          ref = `${id}c${j}`;
        });
        g.setAttribute('clip-path', `url(#${ref})`);
      }
      g.appendChild(el('rect', { x: L.vx, y: L.vy, width: L.vw, height: L.vh, fill: col, 'fill-opacity': op }));
      C_.forEach((k) =>
        g.appendChild(el('circle', { cx: k.x, cy: k.y, r: k.r, fill: 'none', stroke: col, 'stroke-width': 3.2 }))
      );
      S_.appendChild(g);
    });
    C_.forEach((k, i) =>
      S_.appendChild(
        el('circle', { cx: k.x, cy: k.y, r: k.r, fill: 'none', stroke: `var(--fig-c${i + 1})`, 'stroke-width': 1.5 })
      )
    );
    L.leaders.forEach((l) => {
      S_.appendChild(
        el('line', { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, stroke: 'var(--fig-ink-2)', 'stroke-width': 1 })
      );
      S_.appendChild(
        el('circle', {
          cx: l.x1,
          cy: l.y1,
          r: 2,
          fill: 'var(--fig-ink-2)',
          stroke: 'var(--fig-surface)',
          'stroke-width': 1,
        })
      );
    });
    L.labels.forEach((l) =>
      S_.appendChild(
        el(
          'text',
          {
            x: l.x,
            y: l.y + 4.2,
            'text-anchor': 'middle',
            'font-size': 12,
            'font-weight': 650,
            fill: 'var(--fig-ink)',
            stroke: 'var(--fig-surface)',
            'stroke-width': 3,
            'paint-order': 'stroke',
            'stroke-linejoin': 'round',
          },
          [l.txt]
        )
      )
    );
    L.letters.forEach((l) =>
      S_.appendChild(
        el(
          'text',
          {
            x: l.x,
            y: l.y + 4.5,
            'text-anchor': 'middle',
            'font-size': 13,
            'font-weight': 700,
            fill: 'var(--fig-ink-2)',
          },
          [LETTERS[l.i]]
        )
      )
    );
    return S_;
  }

  // -- the records the rows are drawn from
  function figData(res) {
    const sitesU = res.unit === 'sites',
      base = res.M && res.N ? res.M / res.N : null,
      regs = res.rows
        .filter((r) => r.mask && r.n)
        .sort((a, b) => b.n - a.n || a.mask - b.mask)
        .map((r) => ({ ...r, m: r.mask, k: sitesU ? r.n : r.k })),
      terms = res.ts.map((t, i) => {
        const tot = res.totals?.[i],
          n = tot ? tot.n : res.rows.filter((r) => r.mask & (1 << i)).reduce((s, r) => s + r.n, 0),
          k = tot ? tot.k : sitesU ? n : res.rows.filter((r) => r.mask & (1 << i)).reduce((s, r) => s + (r.k || 0), 0);
        return {
          L: LETTERS[i],
          name: t.label,
          i,
          m: 1 << i,
          n,
          k,
          p: tot?.p,
          q: tot?.q,
          few: tot?.few,
          sites: tot?.sites,
          fold: tot?.fold,
          term: true,
        };
      });
    return { base, regs, terms, sitesU, tested: !!res.test };
  }
  const isTested = (r) => !r.few && r.q != null;
  // a bar is filled when q <= PADJ and the effect is at least MIN_EFFECT (up: more, down: less); hollow otherwise
  const dirOf = (r, base, sitesU) => {
    if (!isTested(r)) return 'nt';
    const e = sitesU ? (r.or ?? r.fold) : r.k / r.n / base;
    if (r.q > PADJ || !(e >= MIN_EFF || e <= 1 / MIN_EFF)) return 'ns';
    return e > 1 ? 'more' : 'less';
  };
  const regLabel = (m, nT) => {
    const l = [...Array(nT).keys()].filter((i) => m & (1 << i)).map((i) => LETTERS[i]);
    return l.length === 1 ? `only ${l[0]}` : l.join(' + ');
  };

  // -- cells (SVG, drawn at the measured width of their column)
  function sizeCell(r, sc, w, phone) {
    const tip = phone ? 0 : sc.tip,
      H = 30,
      yc = H / 2,
      plotW = w - tip,
      X = (v) => (v / sc.max) * plotW * (sc.brk < Infinity ? 0.86 : 1),
      kids = sc.ticks.map((t) =>
        el('line', { x1: X(t) + 0.5, x2: X(t) + 0.5, y1: 0, y2: H, stroke: 'var(--fig-grid)', 'stroke-width': 1 })
      ),
      broken = r.n >= sc.brk,
      end = broken ? plotW : X(r.n),
      kx = broken ? end * (r.k / r.n) : X(r.k);
    kids.push(el('line', { x1: 0.5, x2: 0.5, y1: 0, y2: H, stroke: 'var(--fig-axis)', 'stroke-width': 1 }));
    if (r.n) {
      if (r.k > 0)
        kids.push(
          el('path', {
            d: r.k === r.n ? barPath(0, Math.max(end, 2), yc, 12, 3) : `M0,${yc - 6}H${kx}V${yc + 6}H0Z`,
            fill: 'var(--fig-count-k)',
          })
        );
      if (r.k < r.n)
        kids.push(
          el('path', {
            d: barPath(r.k ? Math.min(kx + 2, end - 1) : 0, Math.max(end, 2), yc, 12, 3),
            fill: 'var(--fig-count-n)',
          })
        );
      if (broken) {
        const bx = plotW * 0.9;
        kids.push(
          el('path', {
            d: `M${bx - 3},${yc + 9}L${bx + 1},${yc - 9}M${bx + 3},${yc + 9}L${bx + 7},${yc - 9}`,
            stroke: 'var(--fig-surface)',
            'stroke-width': 3,
            fill: 'none',
          })
        );
        kids.push(
          el('path', {
            d: `M${bx - 4.5},${yc + 9}L${bx - 0.5},${yc - 9}M${bx + 4.5},${yc + 9}L${bx + 8.5},${yc - 9}`,
            stroke: 'var(--fig-muted)',
            'stroke-width': 1,
            fill: 'none',
          })
        );
      }
    }
    if (!phone) {
      const t = el('text', { x: end + 6, y: yc + 4, 'font-size': 12, fill: 'var(--fig-ink-2)' });
      if (r.sitesOnly) t.appendChild(el('tspan', { fill: 'var(--fig-ink)', 'font-weight': 600 }, [fmtInt(r.n)]));
      else {
        t.appendChild(el('tspan', {}, [fmtInt(r.k) + ' / ']));
        t.appendChild(el('tspan', { fill: 'var(--fig-ink)', 'font-weight': 600 }, [fmtInt(r.n)]));
      }
      kids.push(t);
    }
    return svgEl(w, H, kids);
  }
  function shareCell(r, base, w, phone) {
    const H = phone ? 22 : 30,
      yc = H / 2,
      X = (v) => v * (w - 6),
      d = dirOf(r, base),
      kids = [];
    [0, 0.25, 0.5, 0.75, 1].forEach((t) =>
      kids.push(
        el('line', { x1: X(t) + 0.5, x2: X(t) + 0.5, y1: 0, y2: H, stroke: 'var(--fig-grid)', 'stroke-width': 1 })
      )
    );
    kids.push(el('line', { x1: X(base), x2: X(base), y1: 0, y2: H, stroke: 'var(--fig-ref)', 'stroke-width': 1.5 }));
    if (isTested(r)) {
      const s = r.k / r.n,
        [lo, hi] = wilson(r.k, r.n),
        x0 = X(base),
        x1 = X(s),
        p = el('path', { d: barPath(x0, Math.abs(x1 - x0) < 1.5 ? x0 + (x1 >= x0 ? 1.5 : -1.5) : x1, yc, 10, 3) });
      if (d === 'ns') {
        p.setAttribute('fill', 'var(--fig-surface)');
        p.setAttribute('stroke', 'var(--fig-muted)');
        p.setAttribute('stroke-width', 1.25);
      } else p.setAttribute('fill', `var(--fig-${d})`);
      kids.push(p);
      kids.push(
        el('path', {
          d: `M${X(lo)},${yc}H${X(hi)}M${X(lo)},${yc - 4}V${yc + 4}M${X(hi)},${yc - 4}V${yc + 4}`,
          stroke: 'var(--fig-ink-2)',
          'stroke-width': 1.25,
          fill: 'none',
        })
      );
    }
    return svgEl(w, H, kids);
  }
  // the Sites unit's result: fold on a log axis centred at 1x, with the odds ratio's interval
  function foldDomain(rows) {
    let m = 1;
    rows.forEach((r) => {
      if (!isTested(r)) return;
      const [lo, hi] = woolf(r.a, r.b, r.c, r.d);
      m = Math.max(m, Math.abs(Math.log2(lo)), Math.abs(Math.log2(hi)), Math.abs(Math.log2(r.or ?? 1)));
    });
    return Math.min(8, Math.max(2, Math.ceil(m)));
  }
  function foldCell(r, L2, w, phone) {
    const H = phone ? 22 : 30,
      yc = H / 2,
      X = (v) => ((Math.max(-L2, Math.min(L2, Math.log2(v))) + L2) / (2 * L2)) * (w - 6),
      kids = [];
    for (let t = -L2; t <= L2; t++)
      kids.push(
        el('line', {
          x1: X(2 ** t) + 0.5,
          x2: X(2 ** t) + 0.5,
          y1: 0,
          y2: H,
          stroke: 'var(--fig-grid)',
          'stroke-width': 1,
        })
      );
    kids.push(el('line', { x1: X(1), x2: X(1), y1: 0, y2: H, stroke: 'var(--fig-ref)', 'stroke-width': 1.5 }));
    if (isTested(r)) {
      const f = r.or ?? r.fold,
        [lo, hi] = woolf(r.a, r.b, r.c, r.d),
        d = dirOf(r, 0, true),
        x0 = X(1),
        x1 = X(f),
        p = el('path', { d: barPath(x0, Math.abs(x1 - x0) < 1.5 ? x0 + 1.5 : x1, yc, 10, 3) });
      if (d === 'ns') {
        p.setAttribute('fill', 'var(--fig-surface)');
        p.setAttribute('stroke', 'var(--fig-muted)');
        p.setAttribute('stroke-width', 1.25);
      } else p.setAttribute('fill', `var(--fig-${d})`);
      kids.push(p);
      kids.push(
        el('path', {
          d: `M${X(lo)},${yc}H${X(hi)}M${X(lo)},${yc - 4}V${yc + 4}M${X(hi)},${yc - 4}V${yc + 4}`,
          stroke: 'var(--fig-ink-2)',
          'stroke-width': 1.25,
          fill: 'none',
        })
      );
    }
    return svgEl(w, H, kids);
  }
  const tick = (x, anchor, s, ref) =>
    el(
      'text',
      {
        x,
        y: 12,
        'text-anchor': anchor,
        'font-size': 12,
        fill: ref ? 'var(--fig-ink)' : 'var(--fig-muted)',
        ...(ref ? { 'font-weight': 650 } : {}),
      },
      [s]
    );
  function axisSize(sc, w, phone) {
    const tip = phone ? 0 : sc.tip,
      plotW = w - tip,
      X = (v) => (v / sc.max) * plotW * (sc.brk < Infinity ? 0.86 : 1),
      kids = [];
    sc.ticks.forEach((t, i) => {
      const s = t >= 10000 ? t / 1000 + 'K' : fmtInt(t),
        hw = tw(s, 12, 400) / 2;
      kids.push(tick(X(t), i === 0 ? 'start' : X(t) + hw > w ? 'end' : 'middle', s));
    });
    return svgEl(w, 17, kids);
  }
  function axisShare(base, w) {
    const X = (v) => v * (w - 6),
      kids = [],
      rw = tw(pct(base), 12, 650),
      rx0 = X(base) - rw / 2 - 5,
      rx1 = X(base) + rw / 2 + 5;
    [
      [0, '0%'],
      [0.5, '50%'],
      [1, '100%'],
    ].forEach(([v, s], i) => {
      const w0 = tw(s, 12, 400),
        a = i === 0 ? X(v) : i === 2 ? X(v) - w0 : X(v) - w0 / 2;
      if (a < rx1 && a + w0 > rx0) return;
      kids.push(tick(X(v), i === 0 ? 'start' : i === 2 ? 'end' : 'middle', s));
    });
    kids.push(tick(X(base), 'middle', pct(base), true));
    kids.push(el('line', { x1: X(base), x2: X(base), y1: 16, y2: 20, stroke: 'var(--fig-ref)', 'stroke-width': 1.5 }));
    return svgEl(w, 20, kids);
  }
  function axisFold(L2, w) {
    const X = (v) => ((Math.log2(v) + L2) / (2 * L2)) * (w - 6),
      kids = [],
      step = L2 > 4 ? 2 : 1;
    for (let t = -L2; t <= L2; t += step) {
      const v = 2 ** t,
        s = t === 0 ? '1×' : t > 0 ? `${v}×` : `1/${2 ** -t}`;
      kids.push(tick(X(v), t === -L2 ? 'start' : t === L2 ? 'end' : 'middle', s, t === 0));
    }
    kids.push(el('line', { x1: X(1), x2: X(1), y1: 16, y2: 20, stroke: 'var(--fig-ref)', 'stroke-width': 1.5 }));
    return svgEl(w, 20, kids);
  }
  function dotsSvg(m, nT) {
    const sp = 16,
      kids = [],
      on = [...Array(nT).keys()].filter((i) => m & (1 << i));
    if (on.length > 1)
      kids.push(
        el('line', {
          x1: 6 + on[0] * sp,
          x2: 6 + on.at(-1) * sp,
          y1: 10,
          y2: 10,
          stroke: 'var(--fig-ink-2)',
          'stroke-width': 1.5,
        })
      );
    for (let i = 0; i < nT; i++)
      kids.push(
        m & (1 << i)
          ? el('circle', {
              cx: 6 + i * sp,
              cy: 10,
              r: 5,
              fill: `var(--fig-c${i + 1})`,
              stroke: 'var(--fig-surface)',
              'stroke-width': 1.5,
            })
          : el('circle', {
              cx: 6 + i * sp,
              cy: 10,
              r: 3,
              fill: 'var(--fig-surface)',
              stroke: 'var(--fig-axis)',
              'stroke-width': 1.25,
            })
      );
    return svgEl(12 + (nT - 1) * sp, 20, kids);
  }
  const keyBar = (fill, stroke) =>
    svgEl(18, 10, [
      el('rect', {
        x: 0.6,
        y: 1,
        width: 16.8,
        height: 8,
        rx: 2,
        fill,
        ...(stroke ? { stroke, 'stroke-width': 1.25 } : {}),
      }),
    ]);
  const whisker = () =>
    svgEl(18, 10, [
      el('path', { d: 'M2,5H16M2,1V9M16,1V9', stroke: 'var(--fig-ink-2)', 'stroke-width': 1.25, fill: 'none' }),
    ]);
  // the key: its items (a function of what the figure shows)
  function keyItems(fd, res) {
    const sitesU = fd.sitesU,
      g1 = sitesU
        ? [['Sites in the region', [[keyBar('var(--fig-count-k)'), 'sites']]]]
        : [
            [
              'Proteins in the region',
              [
                [keyBar('var(--fig-count-k)'), 'with sites'],
                [keyBar('var(--fig-count-n)'), 'without'],
              ],
            ],
          ],
      g2 = !fd.tested
        ? []
        : [
            [
              sitesU
                ? 'Odds ratio (Fisher), sites against the other residues, log scale'
                : 'Share with sites, against all reviewed proteins',
              [
                [keyBar('var(--fig-more)'), 'more (q ≤ 0.05, ≥ 1.1×)'],
                [keyBar('var(--fig-less)'), 'fewer (q ≤ 0.05, ≥ 1.1×)'],
                [keyBar('var(--fig-surface)', 'var(--fig-muted)'), 'q > 0.05 or under 1.1×'],
                [whisker(), '95% interval'],
                [
                  svgEl(6, 14, [
                    el('line', { x1: 3, x2: 3, y1: 0, y2: 14, stroke: 'var(--fig-ref)', 'stroke-width': 1.5 }),
                  ]),
                  sitesU ? 'no difference (OR 1)' : `all reviewed proteins, ${pct(fd.base)}`,
                ],
              ],
            ],
          ];
    return [...g1, ...g2];
  }
  // the footnote's sentences
  function footNotes(res, fd, sc, cut) {
    const out = [];
    if (res.test)
      out.push(
        (fd.sitesU
          ? TESTS.sites
          : `${TESTS.proteins} ${fmtInt(res.M)} of ${fmtInt(res.N)} reviewed proteins (${pct(fd.base)}) have sites.`) +
          ` Regions under ${MIN_N} are counted, not tested.`
      );
    else
      out.push(
        res.partial
          ? 'Not tested here: only the proteins with sites are known for these terms.'
          : 'No test: a term describes sites, and the comparison residues are not known for several features at once. Counts only.'
      );
    if (cut) out.push('Bars marked // are cut: they are longer than the axis.');
    return out;
  }
  // -- the figure on the page: built as DOM from a result, redrawn when its width changes
  const UI = { hover: 0, sel: 0, layout: null, rows: [], fig: null, res: null, fd: null, glyphHost: null, tip: null };
  const regionWords = (res, m) => regWords(res, m);
  function regWords(res, m) {
    const inn = res.ts.filter((_, i) => m & (1 << i)).map((t) => t.label),
      out = res.ts.filter((_, i) => !(m & (1 << i))).map((t) => t.label);
    return inn.join(' and ') + (out.length ? `, not ${out.join(', not ')}` : '');
  }
  const regAria = (res, fd, r) =>
    `${regLabel(r.m, res.nT)}: ${fmtInt(r.n)} ${unitWord(res.unit)}` +
    (isTested(r) && !fd.sitesU
      ? `, ${fmtInt(r.k)} with sites, ${pct(r.k / r.n)}, ${foldFmt(r.k / r.n / fd.base, r.k).replace('×', ' times')} all reviewed proteins, q ${fqf(r.q)}`
      : '') +
    '. Open this region.';
  function valuesCell(r, fd) {
    const c = html('div', 'c vals');
    if (!fd.tested) return c;
    if (!isTested(r)) {
      c.appendChild(
        html('span', 'nt', r.few ? `${fd.sitesU ? '' : `${r.k} of `}${r.n} · not tested (n < ${MIN_N})` : '–')
      );
      return c;
    }
    if (fd.sitesU) {
      c.appendChild(html('span', 'sh', foldFmt(r.or ?? r.fold)));
      c.appendChild(html('span', 'fo', ''));
    } else {
      c.appendChild(html('span', 'sh', pct(r.k / r.n)));
      c.appendChild(html('span', 'fo', foldFmt(r.k / r.n / fd.base, r.k)));
    }
    c.appendChild(html('span', 'q', 'q ' + fqf(r.q)));
    return c;
  }
  function phoneLine(r, fd) {
    const pl = html('div', 'phline'),
      a = html('span', 'a', fd.sitesU ? fmtInt(r.n) : `${fmtInt(r.k)} / ${fmtInt(r.n)}`),
      b = html('span', 'b');
    if (fd.tested) {
      if (isTested(r)) {
        b.appendChild(html('span', 'sh', fd.sitesU ? foldFmt(r.or ?? r.fold) : pct(r.k / r.n)));
        b.appendChild(document.createTextNode(fd.sitesU ? ' · ' : ` · ${foldFmt(r.k / r.n / fd.base, r.k)} · `));
        b.appendChild(html('span', 'q', 'q ' + fqf(r.q)));
      } else b.appendChild(html('span', 'nt', `not tested (n < ${MIN_N})`));
    }
    pl.appendChild(a);
    pl.appendChild(b);
    return pl;
  }
  function buildFigure(host, res) {
    host.textContent = '';
    const fd = figData(res),
      nT = res.nT,
      fig = html('figure', 'ovx');
    fig.style.margin = 0;
    host.appendChild(fig);
    const phone = fig.clientWidth <= 560;
    fig.style.setProperty('--dotsw', `${12 + (nT - 1) * 16 + 4}px`);
    Object.assign(UI, { fig, res, fd, rows: [], tip: null, glyphHost: null, layout: null });
    UI.hover = 0;
    UI.sel = +S.or || 0;
    const top = html('div', 'ovx-top');
    fig.appendChild(top);
    let err = 0;
    const sizes = fd.terms.map((t) => t.n);
    if (nT <= 3 && sizes.every((n) => n > 0)) {
      UI.layout = glyphLayout(
        sizes,
        res.rows.filter((r) => r.mask).map((r) => ({ m: r.mask, n: r.n })),
        { w: 300, h: phone ? 200 : 210 }
      );
      err = UI.layout.err;
      const gw = html('div', 'ovx-glyph');
      gw.appendChild(glyphSvg(UI.layout, nT, { sel: UI.sel }));
      top.appendChild(gw);
      UI.glyphHost = gw;
    }
    const key = html('div', 'ovx-key');
    top.appendChild(key);
    keyItems(fd, res).forEach(([head, items]) => {
      const line = html('div', 'kline');
      line.appendChild(html('span', 'kh', head));
      items.forEach(([glyph, txt]) => {
        const s = html('span', 'k');
        s.appendChild(glyph);
        s.appendChild(document.createTextNode(txt));
        line.appendChild(s);
      });
      key.appendChild(line);
    });
    if (UI.layout)
      key.appendChild(
        html(
          'p',
          'ovx-note',
          `Circle and overlap areas are proportional to the counts${err > 0.01 ? ` (largest misfit ${(err * 100).toFixed(1)}% of the total)` : ''}. Small regions are labelled outside, on a leader.`
        )
      );
    const grid = html('div', 'ovx-grid');
    fig.appendChild(grid);
    const sc = sizeScale([...fd.terms.map((t) => t.n), ...fd.regs.map((r) => r.n)]),
      L2 = fd.sitesU ? foldDomain(fd.regs) : 0;
    const head = html('div', 'r head'),
      h1 = html('div', 'c lab'),
      h2 = html('div', 'c'),
      h3 = html('div', 'c'),
      h4 = html('div', 'c vals');
    h2.style.flexDirection = h3.style.flexDirection = 'column';
    h2.style.alignItems = h3.style.alignItems = 'stretch';
    const ch = (a, b) => {
      const s = html('span', 'colh', a);
      if (b) {
        s.appendChild(document.createTextNode(' '));
        s.appendChild(html('span', 'muted', b));
      }
      return s;
    };
    h2.appendChild(ch(fd.sitesU ? 'Sites' : cap(unitWord(res.unit)), fd.sitesU ? '' : 'with sites / all'));
    h3.appendChild(
      ch(!fd.tested ? 'Not tested here' : fd.sitesU ? 'Odds ratio, log scale (Fisher)' : 'Share with sites', '')
    );
    if (fd.tested) {
      const hv = html('span', 'vals vh');
      hv.appendChild(html('span', 'sh', fd.sitesU ? 'OR' : 'share'));
      hv.appendChild(html('span', 'fo', fd.sitesU ? '' : 'fold'));
      hv.appendChild(html('span', 'q', 'q'));
      h4.appendChild(hv);
    }
    [h1, h2, h3, h4].forEach((c) => head.appendChild(c));
    grid.appendChild(head);
    const rows = [];
    const group = (txt, sub) => {
      const g = html('div', 'grp', txt + ' ');
      g.appendChild(html('i', '', sub));
      grid.appendChild(g);
    };
    const addRow = (rec, lab, isTerm) => {
      const r = html('div', `r ${isTerm ? 'term-r' : 'data'}`),
        c2 = html('div', 'c sz'),
        c3 = html('div', 'c sh'),
        c4 = valuesCell(rec, fd);
      if (!isTerm) {
        r.dataset.ovReg = String(rec.m);
        lab.tabIndex = rec.m === (UI.sel || fd.regs[0]?.m) ? 0 : -1;
        lab.setAttribute('role', 'button');
        lab.setAttribute('aria-label', regAria(res, fd, rec));
        if (rec.m === UI.sel) r.classList.add('sel');
      }
      [lab, c2, c3, c4].forEach((c) => r.appendChild(c));
      if (isTerm) {
        const t = html('div', 'phline top'),
          n1 = html('span', 'nm1');
        n1.appendChild(html('b', '', rec.L));
        n1.appendChild(document.createTextNode(rec.name));
        t.appendChild(n1);
        grid.appendChild(t);
      }
      grid.appendChild(r);
      grid.appendChild(phoneLine(rec, fd));
      rows.push({ rec, c2, c3, r, lab });
      return r;
    };
    group('Terms', '· every protein of each term');
    fd.terms.forEach((t, i) => {
      const lab = html('div', 'c lab'),
        tm = html('span', 'term'),
        sw = html('span', 'sw'),
        nm = html('span', 'nm', t.name);
      sw.style.background = `var(--fig-c${i + 1})`;
      tm.appendChild(sw);
      tm.appendChild(html('b', '', t.L));
      nm.title = t.name;
      tm.appendChild(nm);
      lab.appendChild(tm);
      if (phone) {
        lab.textContent = '';
        lab.appendChild(HTMLSvg(dotsSvg(t.m, nT)));
      }
      addRow({ ...t, sitesOnly: fd.sitesU }, lab, true);
    });
    group('Regions', `· ${unitWord(res.unit)} in exactly these terms, largest first`);
    fd.regs.forEach((r) => {
      const lab = html('div', 'c lab'),
        rg = html('span', 'reg');
      rg.appendChild(HTMLSvg(dotsSvg(r.m, nT)));
      rg.appendChild(html('span', 'rl', regLabel(r.m, nT)));
      lab.appendChild(rg);
      addRow({ ...r, sitesOnly: fd.sitesU }, lab, false);
    });
    const w2 = rows[0].c2.clientWidth,
      w3 = rows[0].c3.clientWidth;
    sc.tip =
      Math.ceil(
        Math.max(
          ...rows.map(({ rec }) => tw(fd.sitesU ? fmtInt(rec.n) : `${fmtInt(rec.k)} / ${fmtInt(rec.n)}`, 12, 600))
        )
      ) + 12;
    {
      const pw = (phone ? w2 : w2 - sc.tip) * (sc.brk < Infinity ? 0.86 : 1),
        want = Math.max(2, Math.min(6, Math.floor(pw / 38)));
      sc.ticks = niceTicks(sc.base, want);
      sc.max = Math.max(sc.base, sc.ticks.at(-1));
    }
    h2.appendChild(axisSize(sc, w2, phone));
    if (fd.tested) h3.appendChild(fd.sitesU ? axisFold(L2, w3) : axisShare(fd.base, w3));
    rows.forEach(({ rec, c2, c3 }) => {
      c2.appendChild(sizeCell(rec, sc, w2, phone));
      if (fd.tested) c3.appendChild(fd.sitesU ? foldCell(rec, L2, w3, phone) : shareCell(rec, fd.base, w3, phone));
    });
    const f = html('div', 'foot');
    footNotes(res, fd, sc, sc.brk < Infinity).forEach((t, i) => {
      if (i) f.appendChild(document.createTextNode(' '));
      f.appendChild(document.createTextNode(t));
    });
    const bigs = fd.regs.filter(broad);
    if (bigs.length) {
      f.appendChild(document.createTextNode(' '));
      f.appendChild(
        html(
          'b',
          '',
          `${bigs.map((r) => regLabel(r.m, nT)).join(', ')}: a very large set, so a tiny p at a small fold (large set; small effect).`
        )
      );
    }
    fig.appendChild(f);
    UI.rows = rows;
    UI.sc = sc;
    UI.phone = phone;
  }
  // an HTML wrapper for an SVG element (so a cell can hold it)
  const HTMLSvg = (s) => s;
  // hover: a row's wash, its region outlined in the glyph, and a tooltip with the values first
  function setHover(m, row) {
    if (!UI.fig || UI.hover === m) return;
    UI.hover = m;
    UI.rows.forEach((x) => x.r.classList.toggle('hover', !x.rec.term && x.rec.m === m));
    if (UI.layout && UI.glyphHost) {
      UI.glyphHost.textContent = '';
      UI.glyphHost.appendChild(glyphSvg(UI.layout, UI.res.nT, { hover: m, sel: UI.sel }));
    }
    UI.tip?.remove();
    UI.tip = null;
    if (!m || !row || matchMedia?.('(hover: none)').matches) return;
    const { res, fd } = UI,
      rec = row.rec,
      tip = html('div', 'tip'),
      t1 = html('div', 't1');
    t1.appendChild(html('b', '', regLabel(rec.m, res.nT)));
    t1.appendChild(document.createTextNode(' · ' + regWords(res, rec.m)));
    tip.appendChild(t1);
    const ln = (keyCol, big, rest) => {
      const l = html('div', 'ln'),
        kk = html('span', 'key');
      kk.style.borderColor = keyCol;
      l.appendChild(kk);
      l.appendChild(html('span', 'big', big));
      l.appendChild(html('span', '', rest));
      tip.appendChild(l);
    };
    if (fd.sitesU) ln('var(--fig-count-k)', fmtInt(rec.n), `sites on ${fmtInt(rec.proteins ?? 0)} proteins`);
    else ln('var(--fig-count-k)', `${fmtInt(rec.k)} / ${fmtInt(rec.n)}`, `${unitWord(res.unit)} with sites`);
    if (isTested(rec)) {
      if (fd.sitesU) {
        const [lo, hi] = woolf(rec.a, rec.b, rec.c, rec.d);
        ln(
          `var(--fig-${dirOf(rec, 0, true) === 'ns' ? 'ns' : dirOf(rec, 0, true)})`,
          foldFmt(rec.or ?? rec.fold),
          `odds ratio · 95% interval ${lo.toFixed(2)}–${hi.toFixed(2)}`
        );
      } else {
        const [lo, hi] = wilson(rec.k, rec.n);
        ln(
          `var(--fig-${dirOf(rec, fd.base) === 'ns' ? 'ns' : dirOf(rec, fd.base)})`,
          pct(rec.k / rec.n),
          `with sites · 95% interval ${Math.round(lo * 100)}–${Math.round(hi * 100)}%`
        );
        tip.appendChild(
          html('div', 'ln', `${foldFmt(rec.k / rec.n / fd.base, rec.k)} all reviewed proteins (${pct(fd.base)})`)
        );
      }
      tip.appendChild(html('div', 'ln', `p ${fqf(rec.p)} · q ${fqf(rec.q)}`));
    }
    tip.appendChild(
      html('div', 'hint', `${fmtInt(rec.sites ?? rec.n)} sites · click to list the ${unitWord(res.unit)}`)
    );
    UI.fig.appendChild(tip);
    UI.tip = tip;
    const fr = UI.fig.getBoundingClientRect(),
      rr = row.c3.getBoundingClientRect();
    tip.style.top = `${rr.bottom - fr.top + 6}px`;
    tip.style.left = `${Math.max(8, Math.min(rr.left - fr.left + 40, fr.width - tip.offsetWidth - 8))}px`;
  }
  const rowOf = (target) => {
    const r = target.closest?.('.ovx .r.data');
    return r ? UI.rows.find((x) => x.r === r) : null;
  };
  document.addEventListener('mouseover', (e) => {
    if (!UI.fig) return;
    const row = rowOf(e.target);
    setHover(row ? row.rec.m : 0, row);
  });
  document.addEventListener('focusin', (e) => {
    if (!UI.fig) return;
    const row = rowOf(e.target);
    if (row) setHover(row.rec.m, row);
  });
  document.addEventListener('focusout', (e) => {
    if (UI.fig && rowOf(e.target)) setHover(0, null);
  });
  // the glyph's regions are targets too
  const glyphMask = (e) => {
    const svg = e.target.closest?.('.ovx-glyph svg');
    if (!svg || !UI.layout) return 0;
    const b = svg.getBoundingClientRect(),
      L = UI.layout;
    return L.at(((e.clientX - b.left) / b.width) * L.vw + L.vx, ((e.clientY - b.top) / b.height) * L.vh + L.vy);
  };
  document.addEventListener('mousemove', (e) => {
    if (!UI.fig || !e.target.closest?.('.ovx-glyph')) return;
    const m = glyphMask(e),
      row = UI.rows.find((x) => !x.rec.term && x.rec.m === m);
    setHover(row ? m : 0, row || null);
  });
  document.addEventListener('click', (e) => {
    if (!UI.fig || S.view !== 'overlap') return;
    const m = glyphMask(e);
    if (m && UI.rows.some((x) => !x.rec.term && x.rec.m === m))
      set({ or: String(S.or) === String(m) ? '' : String(m) });
  });
  // arrows move between rows, Escape clears the selection
  document.addEventListener('keydown', (e) => {
    if (!UI.fig || S.view !== 'overlap') return;
    const row = rowOf(e.target);
    if (e.key === 'Escape' && S.or) return set({ or: '' });
    if (!row || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const reg = UI.rows.filter((x) => !x.rec.term),
      i = reg.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1),
      to = reg[Math.max(0, Math.min(reg.length - 1, i))];
    e.preventDefault();
    reg.forEach((x) => (x.lab.tabIndex = x === to ? 0 : -1));
    to.lab.focus();
  });
  // redraw when the figure's width changes
  let ro = null,
    lastW = 0;
  function drawFigure() {
    const host = document.getElementById('ov-fig');
    ro?.disconnect();
    UI.fig = null;
    if (!host || S.view !== 'overlap' || !RES?.res || RES.res.ts.length < 2) return;
    buildFigure(host, RES.res);
    lastW = host.clientWidth;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        const w = host.clientWidth;
        if (Math.abs(w - lastW) > 6 && S.view === 'overlap') {
          lastW = w;
          buildFigure(host, RES.res);
        }
      });
      ro.observe(host);
    }
  }
  (K.afterRender ||= []).push(drawFigure);

  // -- the export: the same rows as one SVG at a fixed width, no hover or selection
  // the literal light values an export draws with (the figure style guide's FIG_EXPORT): never the dark page's
  const TOK = {
    'fig-surface': '#ffffff',
    'fig-ink': '#111827',
    'fig-ink-2': '#374151',
    'fig-muted': '#5f6f78',
    'fig-grid': '#e0e8eb',
    'fig-axis': '#c7d4d9',
    'fig-ref': '#374151',
    'fig-more': '#b42318',
    'fig-less': '#334155',
    'fig-ns': '#5f6f78',
    'fig-c1': LIGHT[0],
    'fig-c2': LIGHT[1],
    'fig-c3': LIGHT[2],
    'fig-c4': LIGHT[3],
    'fig-count-k': '#155e75',
    'fig-count-n': '#94bac6',
    'fig-euler-op': '.16',
  };
  // the figure as one SVG at a preset's width: screen (a wide grid with a values column) or paper (the values go on a second line)
  function exportBody(res, Wd = 920) {
    const fd = figData(res),
      nT = res.nT,
      two = Wd < 760,
      root = el('g', {}),
      T = (x, y, s, o = {}) =>
        root.appendChild(
          el(
            'text',
            {
              x,
              y,
              'font-size': o.size || 12,
              fill: o.fill || 'var(--fig-ink)',
              ...(o.w ? { 'font-weight': o.w } : {}),
              ...(o.anchor ? { 'text-anchor': o.anchor } : {}),
            },
            [s]
          )
        ),
      place = (node, x, yy) => {
        node.setAttribute('x', x);
        node.setAttribute('y', yy);
        root.appendChild(node);
      };
    let y = 0,
      gw = 0;
    const sizes = fd.terms.map((t) => t.n);
    if (nT <= 3 && sizes.every((n) => n > 0)) {
      const L = glyphLayout(
          sizes,
          res.rows.filter((r) => r.mask).map((r) => ({ m: r.mask, n: r.n })),
          { w: 300, h: 210 }
        ),
        g = glyphSvg(L, nT, {});
      place(g, 0, 0);
      gw = L.vw + 24;
      y = L.vh;
    }
    let ky = 12;
    keyItems(fd, res).forEach(([head, items]) => {
      T(gw, ky, head.toUpperCase(), { size: 10, fill: 'var(--fig-muted)' });
      ky += 16;
      let kx = gw;
      items.forEach(([glyph, txt]) => {
        const w = tw(txt, 12.5, 400) + 30;
        if (kx > gw && kx + w > Wd) {
          kx = gw;
          ky += 17;
        }
        place(glyph, kx, ky - 9);
        T(kx + 24, ky, txt, { size: 12.5, fill: 'var(--fig-ink-2)' });
        kx += w + 8;
      });
      ky += 22;
    });
    y = Math.max(y, ky) + 8;
    const cols = two ? { lab: 128, a: 220, b: 252, v: 0, gap: 12 } : { lab: 200, a: 230, b: 240, v: 188, gap: 14 },
      xa = cols.lab + cols.gap,
      xb = xa + cols.a + cols.gap,
      xv = xb + cols.b + cols.gap,
      pitch = two ? 46 : 30,
      sc = sizeScale([...fd.terms.map((t) => t.n), ...fd.regs.map((r) => r.n)]),
      L2 = fd.sitesU ? foldDomain(fd.regs) : 0;
    sc.tip =
      Math.ceil(
        Math.max(
          ...[...fd.terms, ...fd.regs].map((r) =>
            tw(fd.sitesU ? fmtInt(r.n) : `${fmtInt(r.k)} / ${fmtInt(r.n)}`, 12, 600)
          )
        )
      ) + 12;
    sc.ticks = niceTicks(
      sc.base,
      Math.max(2, Math.min(6, Math.floor(((cols.a - sc.tip) * (sc.brk < Infinity ? 0.86 : 1)) / 38)))
    );
    sc.max = Math.max(sc.base, sc.ticks.at(-1));
    T(xa, y + 11, fd.sitesU ? 'Sites' : cap(unitWord(res.unit)), { w: 600, fill: 'var(--fig-ink-2)' });
    if (fd.tested)
      T(xb, y + 11, fd.sitesU ? 'Odds ratio, log scale (Fisher)' : 'Share with sites', {
        w: 600,
        fill: 'var(--fig-ink-2)',
      });
    if (fd.tested && !two) {
      T(xv, y + 11, fd.sitesU ? 'OR' : 'share', { size: 12, fill: 'var(--fig-muted)' });
      if (!fd.sitesU) T(xv + 62, y + 11, 'fold', { size: 12, fill: 'var(--fig-muted)' });
      T(xv + 116, y + 11, 'q', { size: 12, fill: 'var(--fig-muted)' });
    }
    y += 16;
    place(axisSize(sc, cols.a, false), xa, y);
    if (fd.tested) place(fd.sitesU ? axisFold(L2, cols.b) : axisShare(fd.base, cols.b), xb, y);
    y += 24;
    const valueText = (rec) =>
      isTested(rec)
        ? [
            fd.sitesU ? foldFmt(rec.or ?? rec.fold) : pct(rec.k / rec.n),
            fd.sitesU ? '' : foldFmt(rec.k / rec.n / fd.base, rec.k),
            'q ' + fqf(rec.q),
          ]
        : null;
    const row = (rec, isTerm) => {
      if (isTerm) {
        root.appendChild(
          el('rect', { x: 0, y: y + 9, width: 11, height: 11, rx: 3, fill: `var(--fig-c${rec.i + 1})` })
        );
        T(18, y + 19, rec.L, { w: 700, size: 13 });
        let nm = rec.name;
        while (nm.length > 3 && tw(nm, 13, 400) > cols.lab - 38) nm = nm.slice(0, -2);
        T(32, y + 19, nm === rec.name ? nm : nm + '…', { size: 13 });
      } else {
        place(dotsSvg(rec.m, nT), 0, y + 5);
        T(12 + (nT - 1) * 16 + 10, y + 19, regLabel(rec.m, nT), { size: 12.5, fill: 'var(--fig-ink-2)' });
      }
      place(sizeCell({ ...rec, sitesOnly: fd.sitesU }, sc, cols.a, false), xa, y);
      if (fd.tested)
        place(fd.sitesU ? foldCell(rec, L2, cols.b, false) : shareCell(rec, fd.base, cols.b, false), xb, y);
      if (fd.tested) {
        const v = valueText(rec);
        if (two) {
          // the values under the bars, as on a phone
          if (v) {
            T(xb, y + 41, v[0], { size: 13, w: 700 });
            T(xb + tw(v[0], 13, 700) + 8, y + 41, [v[1], v[2]].filter(Boolean).join(' · '), {
              size: 12,
              fill: 'var(--fig-muted)',
            });
          } else
            T(xb, y + 41, `${fd.sitesU ? '' : `${rec.k} of `}${rec.n} · not tested (n < ${MIN_N})`, {
              size: 12,
              fill: 'var(--fig-muted)',
            });
        } else if (v) {
          T(xv + 48, y + 19, v[0], { w: 700, size: 13, anchor: 'end' });
          if (v[1]) T(xv + 110, y + 19, v[1], { size: 13, fill: 'var(--fig-ink-2)', anchor: 'end' });
          T(xv + 116, y + 19, v[2], { size: 12, fill: 'var(--fig-muted)' });
        } else
          T(xv, y + 19, `${fd.sitesU ? '' : `${rec.k} of `}${rec.n} · not tested (n < ${MIN_N})`, {
            size: 12,
            fill: 'var(--fig-muted)',
          });
      }
      y += pitch;
    };
    const grp = (a, b) => {
      T(0, y + 14, a.toUpperCase(), { size: 10.5, fill: 'var(--fig-muted)' });
      T(tw(a.toUpperCase(), 10.5, 400) + 8, y + 14, b, { size: 11, fill: 'var(--fig-muted)' });
      root.appendChild(
        el('line', { x1: 0, x2: Wd, y1: y + 20, y2: y + 20, stroke: 'var(--fig-grid)', 'stroke-width': 1 })
      );
      y += 26;
    };
    grp('Terms', '· every protein of each term');
    fd.terms.forEach((t) => row({ ...t, term: true }, true));
    grp('Regions', `· ${unitWord(res.unit)} in exactly these terms, largest first`);
    fd.regs.forEach((r) => row(r, false));
    const str = new XMLSerializer()
      .serializeToString(root)
      .replace(/ xmlns="[^"]*"/g, '')
      .replace(/var\(--([a-z0-9-]+)\)/g, (m, n) => TOK[n] ?? m);
    return {
      svg: str,
      h: Math.ceil(y) + 4,
      notes: footNotes(res, fd, sc, sc.brk < Infinity),
      bigs: fd.regs.filter(broad).map((r) => regLabel(r.m, nT)),
    };
  }

  // ---- the page ---------------------------------------------------------------------------------------------------------------
  const trail = `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <b>Overlap</b></p>`;
  const fn = (v) => (v == null ? '–' : K.fx(v));
  const SWATCH = (i) => `<span class="ov-sw" style="background:var(--fig-c${i + 1})" aria-hidden="true"></span>`;
  const TESTS = {
    proteins:
      'One-sided hypergeometric test (as the protein-set questions): the region’s proteins with sites against all reviewed proteins; fold = share with sites in the region / share with sites among all reviewed proteins; q is Benjamini–Hochberg across the regions shown.',
    sites:
      'Fisher’s exact test (pooled, as the residue questions’ “across all proteins” rows) of the residues of the proteins with sites: the odds ratio (OR) of being a site in the region against outside it (Haldane–Anscombe, Woolf interval); q is Benjamini–Hochberg across the regions shown.',
  };
  // fold, p and q of a row: too few to test; 0x when none has sites; a note where a huge set gives a tiny p at a small fold
  const foldCells = (r) =>
    r.few
      ? `<td class="num">—</td><td class="num" colspan="2">too few to test</td>`
      : `<td class="num">${r.k === 0 ? '0×' : fn(r.fold)}</td><td class="num">${r.p == null ? '–' : K.fq(r.p)}</td><td class="num">${r.q == null ? '–' : K.fq(r.q)}</td>`;
  const broad = (r) => !r.few && r.fold != null && r.fold > 0.8 && r.fold < 1.25 && r.q != null && r.q < 1e-3;
  function tableHtml(res) {
    const sites = res.unit === 'sites',
      rows = res.rows.filter((r) => r.mask && r.n).sort((a, b) => b.n - a.n);
    const t = res.test;
    const head = sites
      ? `<th scope="col">Region</th><th scope="col" class="num">Sites</th><th scope="col" class="num">Proteins</th>` +
        (t
          ? `<th scope="col" class="num" title="${esc(TESTS.sites)}">OR</th><th scope="col" class="num" title="${esc(TESTS.sites)}">p</th><th scope="col" class="num">q</th>`
          : '')
      : `<th scope="col">Region</th><th scope="col" class="num">${esc(cap(unitWord(res.unit)))}</th><th scope="col" class="num">With sites</th>` +
        `<th scope="col" class="num">Share with sites</th>` +
        (t
          ? `<th scope="col" class="num" title="${esc(TESTS.proteins)}">Fold</th><th scope="col" class="num" title="${esc(TESTS.proteins)}">p</th><th scope="col" class="num">q</th>`
          : '') +
        `<th scope="col" class="num">Sites</th>`;
    const body = (r, name0, attrs = '') => {
      const name = name0 + (broad(r) ? ' <span class="muted ov-flag">large set; small effect</span>' : '');
      return sites
        ? `<tr${attrs}><th scope="row">${name}</th><td class="num">${int(r.n)}</td><td class="num">${int(r.proteins ?? 0)}</td>` +
            (t ? foldCells(r) : '') +
            '</tr>'
        : `<tr${attrs}><th scope="row">${name}</th><td class="num">${int(r.n)}</td><td class="num">${int(r.k)}</td>` +
            `<td class="num">${r.n ? `${((100 * r.k) / r.n).toFixed(1)}%` : '–'}</td>` +
            (t ? foldCells(r) : '') +
            `<td class="num">${int(r.sites ?? 0)}</td></tr>`;
    };
    const main = rows
      .map((r) =>
        body(
          r,
          `<button type="button" class="linkish" data-ov-reg="${r.mask}" title="${esc(regionWords(res, r.mask))}">${esc(regionLetters(r.mask, res.nT))}</button>`,
          String(S.or) === String(r.mask) ? ' class="ov-on"' : ''
        )
      )
      .join('');
    const tot =
      !sites && res.totals.length
        ? res.totals.map((r) => body(r, `All of ${LETTERS[r.i]}`, ' class="ov-tot"')).join('')
        : '';
    return (
      `<div class="tbl-card"><table class="tbl ov-tbl"><caption class="vh">Regions of the ${res.nT} terms</caption><thead><tr>${head}</tr></thead>` +
      `<tbody>${main || `<tr><td colspan="8">No ${unitWord(res.unit)} in any term.</td></tr>`}</tbody>` +
      (tot ? `<tbody class="ov-totals">${tot}</tbody>` : '') +
      '</table></div>'
    );
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // a region's list
  function regionHtml(res) {
    const k = +S.or;
    if (!S.or || !res.rows[k] || !k) return '';
    const sites = res.unit === 'sites',
      items = regionItems(res, k);
    const withSites = items.filter((x) => x.pi != null);
    const shown = items.slice(0, 200);
    const li = (x) =>
      x.pi != null
        ? `<li><a href="${esc(K.link('protein', x.acc))}"><b>${esc(K.sel.nameOf(K.sel.byAcc[x.acc]) || x.acc)}</b></a>${x.pos ? ` <span class="muted">${esc(x.pos)}</span>` : ''}</li>`
        : `<li><a href="https://www.uniprot.org/uniprotkb/${esc(x.acc)}">${esc(x.acc)}</a></li>`;
    const sel = [...new Set(withSites.map((x) => x.acc))];
    return (
      `<section class="ov-region" id="ov-region" aria-live="polite"><h3>${esc(regionLetters(k, res.nT))}: ${esc(regionWords(res, k))}</h3>` +
      `<p class="muted">${int(items.length)} ${sites ? 'sites' : unitWord(res.unit)}${sites ? '' : `, ${int(withSites.length)} with sites (linked)`}.</p>` +
      `<p class="actions"><button type="button" class="btn small" data-ov-use${sel.length && sel.length <= SELMAX ? '' : ' disabled'} title="${
        sel.length > SELMAX
          ? `Over ${SELMAX} proteins: too many for a link`
          : 'Make these proteins with sites the selection of the whole site'
      }">Use as selection</button> <button type="button" class="btn small" data-ov-list>TSV</button> <button type="button" class="linkish" data-ov-close>Close</button></p>` +
      `<ul class="ov-list">${shown.map(li).join('')}</ul>` +
      (items.length > shown.length
        ? `<p class="muted">The first ${shown.length} of ${int(items.length)}; the TSV has all.</p>`
        : '') +
      '</section>'
    );
  }
  function regionItems(res, k) {
    const out = [];
    if (res.unit === 'sites') {
      const SD = DATA.sd();
      res.mask.forEach((mk, e) => {
        if (mk !== k) return;
        const m = SD.marks[e],
          acc = D.proteins[m[0]][0];
        out.push({ acc, pi: m[0], pos: m[1] });
      });
      return out.sort((a, b) => a.acc.localeCompare(b.acc) || a.pos - b.pos);
    }
    const byAcc = K.sel.byAcc;
    res.mask.forEach((mk, e) => {
      if (mk !== k) return;
      const acc = U.acc[res.elems[e]];
      out.push({ acc, pi: byAcc[acc] ? byAcc[acc].i : null });
    });
    return out.sort((a, b) => (b.pi != null) - (a.pi != null) || a.acc.localeCompare(b.acc));
  }
  function pickerHtml() {
    const chips = S.ot
      .map(
        (id, i) =>
          `<span class="ov-chip">${SWATCH(i)}<b>${LETTERS[i]}</b> ${esc(termLabel(id).replace(/^Gene list.*/, id.startsWith('g:') ? `Gene list: ${id.slice(2, 40)}` : 'Gene list'))} ` +
          `<button type="button" class="linkish" data-ov-del="${i}" aria-label="Remove ${esc(termLabel(id))}">×</button></span>`
      )
      .join(' ');
    const full = S.ot.length >= MAXT;
    return (
      `<div class="ov-pick"><div class="ov-chips">${chips || '<span class="muted">No term chosen.</span>'}</div>` +
      `<label class="flabel" for="ov-q">Add a term (${int(termPool().length)} to choose from)</label>` +
      `<input id="ov-q" type="search" autocomplete="off" placeholder="${full ? `At most ${MAXT} terms` : 'Search: a pathway, a location, a disease, a family…'}"${full ? ' disabled' : ''}>` +
      `<div id="ov-res" class="ov-res" role="listbox" aria-label="Matching terms">${resultsHtml('')}</div>` +
      `<details class="ov-genes"><summary>Add a list of genes</summary><textarea id="ov-genes" rows="2" placeholder="Gene names or accessions"></textarea> <button type="button" class="btn small" data-ov-genes${full ? ' disabled' : ''}>Add</button></details></div>`
    );
  }
  function resultsHtml(q) {
    const w = q.trim().toLowerCase();
    const all = [...specials(), ...termPool()].filter((t) => !S.ot.includes(t.id));
    const hit = (
      w
        ? all.filter(
            (t) =>
              t.label.toLowerCase().includes(w) ||
              t.group.toLowerCase().includes(w) ||
              (t.ref || '').toLowerCase().includes(w)
          )
        : all.filter((t) => t.group === 'Selections' || t.group === 'Readers' || t.group === 'Enzymes')
    ).slice(0, 40);
    if (!hit.length) return `<p class="muted">${w ? 'No term matches.' : 'Type to search.'}</p>`;
    let g = '';
    return hit
      .map((t) => {
        const head = t.group !== g ? `<p class="ov-grp">${esc((g = t.group))}</p>` : '';
        const more = [t.ref || '', t.size ? `${int(t.size)} proteins` : '', t.broad ? 'very broad' : '', t.note]
          .filter(Boolean)
          .join(' · ');
        return `${head}<button type="button" class="ov-opt" role="option" data-ov-add="${esc(t.id)}">${esc(t.label)}${more ? ` <span class="muted ov-more">${esc(more)}</span>` : ''}</button>`;
      })
      .join('');
  }
  function controls(res) {
    const u =
      C.units.length > 1
        ? `<div class="ov-unit" role="group" aria-label="What is overlapped">${C.units.map((x) => `<button type="button" class="btn small${S.ou === x ? ' on' : ''}" aria-pressed="${S.ou === x}" data-ov-unit="${x}">${UNITS[x]}</button>`).join('')}</div>`
        : '';
    return `<div class="ov-ctl">${u}</div>`;
  }
  let loadedFor = '';
  function view() {
    loadSources();
    const key = JSON.stringify([S.ot, S.ou, !!K.sel.peek()]);
    const head =
      trail +
      `<div class="page-head"><h2>Overlap</h2></div><p class="page-sub">Choose 2 to ${MAXT} terms. See which ${unitWord(S.ou)} they share, and whether the ${S.ou === 'sites' ? 'sites' : `${W.marked} proteins`} in each region are more or fewer than expected.</p>`;
    if (S.ot.length < 2) {
      RES = null;
      return head + pickerHtml() + (S.ot.length ? '' : '');
    }
    if (RES?.key !== key || !RES.res) {
      if (loadedFor !== key) {
        loadedFor = key;
        const mine = key;
        compute(S.ot, S.ou).then(
          (res) => {
            if (loadedFor !== mine) return;
            RES = { key: mine, res };
            if (S.view === 'overlap') K.render();
          },
          (e) => {
            RES = { key: mine, res: null, err: String(e) };
            if (S.view === 'overlap') K.render();
          }
        );
      }
      return (
        head +
        pickerHtml() +
        (RES?.err
          ? `<p role="alert">The data could not be read.</p>`
          : '<p class="muted" role="status">Reading the terms…</p>')
      );
    }
    const res = RES.res;
    if (res.ts.length < 2)
      return head + pickerHtml() + '<p>A chosen term is not in this dataset; remove it and choose another.</p>';
    return (
      head +
      pickerHtml() +
      controls(res) +
      `<div id="ov-fig" class="ov-figwrap"></div>` +
      `<div class="exp-row">${K.expBar(['svg', 'png', 'tsv'], 'ovexp', 'the overlap figure', '').replace(/<\/div>$/, '<button type="button" class="exp-btn" data-ovexp="png-paper" title="PNG for a journal column: 180 mm wide at 300 dpi">PNG, 180 mm</button><button type="button" class="exp-btn" data-ovexp="svg-paper" title="SVG for a journal column: 180 mm wide">SVG, 180 mm</button></div>')}</div>` +
      regionHtml(res) +
      '<h3>Table</h3>' +
      tableHtml(res)
    );
  }

  // the citations of the term sources a figure or file uses
  const citeFor = (ids) =>
    (C.sources || [])
      .filter((src) => ids.some((id) => id.startsWith(`x:${src.id}:`)) && src.cite?.length)
      .map((src) => `${src.title}: ${src.cite.join('; ')}.`)
      .join(' ');
  // ---- export ----------------------------------------------------------------------------------------------------------------
  // preset: screen (960 units wide) or paper (680 units = 180 mm, 300 dpi)
  function figure(preset = 'screen') {
    const paper = preset === 'paper',
      W_ = paper ? 680 : 960,
      res = RES.res,
      b = exportBody(res, W_ - 40),
      cite = citeFor(res.ts.map((t) => t.id));
    const f = K.figureFrame({
      title: `Overlap of ${res.nT} terms`,
      sub: `${res.ts.map((t, i) => `${LETTERS[i]} ${t.label} (${int(t.n)} ${unitWord(res.unit)})`).join('; ')}. Unit: ${unitWord(res.unit)}.`,
      legend: [],
      body: b.svg,
      bodyH: b.h,
      W: W_,
      note: [...b.notes, ...(b.bigs.length ? [`${b.bigs.join(', ')}: large set; small effect.`] : []), cite]
        .filter(Boolean)
        .join(' '),
      extra: { terms: S.ot, unit: res.unit },
    });
    if (paper) {
      f.mm = 180;
      f.dpi = 300;
      f.svg = f.svg.replace(
        `width="${W_}" height="${f.H}"`,
        `width="180mm" height="${((f.H / W_) * 180).toFixed(1)}mm"`
      );
    }
    return f;
  }
  function tsv(res = RES.res) {
    const sites = res.unit === 'sites',
      fd = figData(res),
      rows = fd.regs;
    const head = sites
      ? ['region', 'terms', 'sites', 'proteins', 'odds_ratio', 'ci95_lo', 'ci95_hi', 'p', 'q', 'tested']
      : [
          'region',
          'terms',
          res.unit,
          'with_sites',
          'share_with_sites',
          'ci95_lo',
          'ci95_hi',
          'fold',
          'p',
          'q',
          'tested',
          'sites',
        ];
    const g = (v) => (v == null ? '' : K.g6(v));
    const line = (r, name, words) => {
      const ci = sites ? (r.a != null ? woolf(r.a, r.b, r.c, r.d) : []) : r.n ? wilson(r.k, r.n) : [],
        t = isTested(r) ? 1 : 0;
      return (
        sites
          ? [name, words, r.n, r.proteins ?? '', g(r.fold), g(ci[0]), g(ci[1]), g(r.p), g(r.q), t]
          : [
              name,
              words,
              r.n,
              r.k,
              r.n ? g(r.k / r.n) : '',
              g(ci[0]),
              g(ci[1]),
              g(r.fold),
              g(r.p),
              g(r.q),
              t,
              r.sites ?? '',
            ]
      ).join('\t');
    };
    return (
      K.preamble(
        'overlap of terms',
        `${res.ts.map((t, i) => `${LETTERS[i]} = ${t.label}`).join('; ')}; unit ${res.unit}. ${res.test ? (sites ? TESTS.sites : TESTS.proteins) : 'Counts only; no test.'} Regions under ${MIN_N} are counted, not tested (tested = 0). ci95: Wilson interval of the share with sites${sites ? ' (for sites: Woolf interval of the odds ratio)' : ''}.${res.N ? ` ${res.M} of ${res.N} reviewed proteins have sites.` : ''}${citeFor(res.ts.map((t) => t.id)) ? ` ${citeFor(res.ts.map((t) => t.id))}` : ''}`
      ) +
      head.join('\t') +
      '\n' +
      rows.map((r) => line(r, regionLetters(r.m, res.nT), regionWords(res, r.m))).join('\n') +
      '\n' +
      (!sites ? res.totals.map((r) => line(r, `all of ${LETTERS[r.i]}`, res.ts[r.i].label)).join('\n') + '\n' : '')
    );
  }
  function listTsv(res, k) {
    return (
      K.preamble('overlap region', `${regionWords(res, k)}; unit ${res.unit}`) +
      'accession\tgene\tposition\n' +
      regionItems(res, k)
        .map((x) => [x.acc, x.pi != null ? D.proteins[x.pi][1] || '' : '', x.pos ?? ''].join('\t'))
        .join('\n') +
      '\n'
    );
  }

  // ---- events ----------------------------------------------------------------------------------------------------------------
  const set = (extra) => {
    Object.assign(S, extra);
    K.writeHash(true);
    K.render();
  };
  const add = (id) => {
    if (S.ot.length < MAXT && !S.ot.includes(id)) set({ ot: [...S.ot, id], or: '' });
  };
  document.addEventListener('input', (e) => {
    if (e.target.id === 'ov-q') document.getElementById('ov-res').innerHTML = resultsHtml(e.target.value);
  });
  document.addEventListener('keydown', (e) => {
    const g = e.target.closest?.('[data-ov-reg]');
    if (g && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      set({ or: String(g.dataset.ovReg) });
    }
  });
  K.clicks.push(
    ['[data-ov-add]', (el) => add(el.dataset.ovAdd)],
    ['[data-ov-del]', (el) => set({ ot: S.ot.filter((_, i) => i !== +el.dataset.ovDel), or: '' })],
    ['[data-ov-unit]', (el) => set({ ou: el.dataset.ovUnit, or: '' })],
    ['[data-ov-reg]', (el) => set({ or: String(S.or) === String(el.dataset.ovReg) ? '' : String(el.dataset.ovReg) })],
    ['[data-ov-close]', () => set({ or: '' })],
    [
      '[data-ov-genes]',
      () => {
        const t = document.getElementById('ov-genes').value.trim();
        if (t) add('g:' + t);
      },
    ],
    [
      '[data-ov-use]',
      () => {
        const accs = [
          ...new Set(
            regionItems(RES.res, +S.or)
              .filter((x) => x.pi != null)
              .map((x) => x.acc)
          ),
        ];
        if (accs.length && accs.length <= SELMAX) K.go('overview', { q: accs.join(' '), f: {} });
      },
    ],
    [
      '[data-ov-list]',
      () =>
        K.download(`${D.site.id || 'site'}_overlap_region.tsv`, listTsv(RES.res, +S.or), 'text/tab-separated-values'),
    ],
    [
      '[data-ovexp]',
      (btn) => {
        const k = btn.dataset.ovexp,
          paper = k.endsWith('-paper');
        K.exportFigure(
          paper ? k.replace('-paper', '') : k,
          () => figure(paper ? 'paper' : 'screen'),
          `${D.site.id || 'site'}_overlap${paper ? '_paper' : ''}`,
          btn,
          () => tsv()
        );
      },
    ],
    ['[data-ov-compare]', (el) => K.go('overlap', { ot: [el.dataset.ovCompare], ou: 'proteins', or: '' })]
  );

  // a "Compare with…" button on the rows of the protein-set questions
  function rowButtons() {
    const mk = (aid, cat, name) =>
      `<button type="button" class="btn small ov-cmp" data-ov-compare="${esc(`s:${aid}:${cat}`)}" aria-label="Compare ${esc(name)} with other terms">Compare with…</button>`;
    if (S.view === 'overview' && !S.arg)
      document.querySelectorAll('#view .fr-row[data-f][data-v]').forEach((r) => {
        const aid = String(r.dataset.f).split(':')[1];
        if (!sets.includes(aid) || r.nextElementSibling?.matches?.('.ov-cmp')) return;
        r.insertAdjacentHTML('afterend', mk(aid, r.dataset.v, r.querySelector('.fr-lab')?.textContent || r.dataset.v));
      });
    if (S.view === 'overview' && S.arg && sets.includes(S.arg))
      document.querySelectorAll('#view .drow[data-cat]').forEach((r) => {
        if (r.querySelector('.ov-cmp')) return;
        r.querySelector('.lab')?.insertAdjacentHTML(
          'beforeend',
          ' ' + mk(S.arg, r.dataset.cat, r.querySelector('.ln')?.textContent || r.dataset.cat)
        );
      });
  }
  (K.afterRender ||= []).push(rowButtons);
  K.views.overlap = { render: view, title: () => 'Overlap' };
  K.tabs.push(() => ['overlap', 'Overlap', null]);
  (K.methodParts ||= []).push(
    () =>
      `<section id="m-overlap"><h3>Overlap</h3><p>The Overlap page compares two to four terms: the sets of the protein-set questions, reader families, enzymes, ` +
      `the selection or a list of genes. Each region is the proteins in exactly those terms. For proteins, a one-sided hypergeometric test compares the ` +
      `region’s proteins with sites against all reviewed proteins, as the protein-set questions do (fold = share with sites in the region / share among all ` +
      `reviewed proteins; q is Benjamini–Hochberg across the regions shown). For sites, a pooled Fisher’s exact test of the residues of proteins with sites, ` +
      `when every term describes proteins. Computed in your browser. Reader families: ${
        (C.families?.readers || []).map((f) => `${esc(f.name)} (${(f.ids || []).map(esc).join(', ')})`).join('; ') ||
        'none'
      }; a protein is a reader when it carries any of a family’s Pfam or InterPro entries.${(C.sources || []).map((src) => ` ${esc(src.title)}: ${src.n.toLocaleString('en')} terms; ${src.cite?.length ? 'cite ' + src.cite.map(esc).join('; ') : ''}.`).join('')}</p></section>`
  );
  K.overlap = {
    tableHtml,
    exportBody,
    core: {
      regions,
      proteinTest,
      siteTest,
      bhAll,
      settle,
      wilson,
      woolf,
      euler,
      glyphLayout,
      sizeScale,
      niceTicks,
      lens,
      MIN_N,
    },
    resolve,
    compute,
    tsv,
    DATA,
    termPool,
    regionLetters,
  };
});
