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
  // the overlap of the terms against chance: for each pair, n and m elements, a shared, N in the universe; expected = n*m/N,
  // fold = a/expected, p = P(X >= a) for X hypergeometric (N, m, n), q = BH over the pairs of one universe. Two universes: every element,
  // and the elements with sites (marked; none for a count of sites). ptmstats.pair_overlap is the same arithmetic.
  function overlapPairs(nT, mask, marked) {
    const fam = (only) => {
      const cnt = new Array(nT).fill(0),
        both = {};
      let N = 0;
      for (let e = 0; e < mask.length; e++) {
        if (only && !only[e]) continue;
        N++;
        const m = mask[e];
        for (let i = 0; i < nT; i++)
          if (m & (1 << i)) {
            cnt[i]++;
            for (let j = i + 1; j < nT; j++) if (m & (1 << j)) both[i * 8 + j] = (both[i * 8 + j] || 0) + 1;
          }
      }
      const rows = [];
      for (let i = 0; i < nT; i++)
        for (let j = i + 1; j < nT; j++) {
          const n = cnt[i],
            m = cnt[j],
            a = both[i * 8 + j] || 0,
            exp = N ? (n * m) / N : NaN;
          rows.push({
            i,
            j,
            n,
            m,
            a,
            N,
            expected: exp,
            fold: exp ? a / exp : null,
            p: n && m ? (a ? ST.hyperSF(a, N, m, n) : 1) : null,
            mask: (1 << i) | (1 << j),
          });
        }
      const t = rows.filter((r) => r.p != null),
        q = ST.bh(t.map((r) => r.p));
      rows.forEach((r) => (r.q = null));
      t.forEach((r, k) => (r.q = q[k]));
      return rows;
    };
    return { all: fam(null), marked: marked ? fam(marked) : null };
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
  const clean = () => ({ ot: [], ou: 'proteins', ov: 'auto', or: '', oq: 'auto' });
  Object.assign(S, clean());
  K.paramsIn.push((p) => {
    S.qn = p.get('qn') ? { q: p.get('q') || '', name: p.get('qn') } : null; // a selection this page made and named
    if (!['t', 'ou', 'oq', 'or'].some((k) => p.has(k))) return; // another page's address: the page keeps what was chosen
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
    S.or = /^a?\d+$/.test(p.get('or') || '') ? p.get('or') : ''; // a region (its mask), or a pair's overlap (a + the mask)
    S.oq = ['a', 'b'].includes(p.get('oq')) ? p.get('oq') : 'auto';
  });
  K.paramsOut.push((p) => {
    if (S.qn && S.qn.q === S.q && S.q) p.set('qn', S.qn.name);
    if (S.view !== 'overlap') return;
    if (S.ot.length) p.set('t', S.ot.map((x) => x.replace(/%/g, '%25').replace(/,/g, '%2C')).join(','));
    if (S.ou !== 'proteins') p.set('ou', S.ou);
    if (S.or) p.set('or', S.or);
    if (S.oq !== 'auto') p.set('oq', S.oq);
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
  // a term's name as shown: no leading article, a capital first letter; a trailing "(writer)" and the like becomes a tag
  const ROLE_TAG = /\s*\((writer|eraser|reader|cofactor|anti-reader)\)\s*$/i;
  function plainName(label) {
    let s0 = String(label ?? ''),
      tag = '';
    const m = ROLE_TAG.exec(s0);
    if (m) {
      tag = m[1].toLowerCase();
      s0 = s0.replace(ROLE_TAG, '');
    }
    s0 = s0.replace(/^(an?|the)\s+/i, '');
    return { name: s0.charAt(0).toUpperCase() + s0.slice(1), tag };
  }
  // the heading a question's or a source's terms are listed under (website.overlap.groups), else the question's own name
  const GROUP_OF = {};
  (C.groups || []).forEach((g) => g.from.forEach((id) => (GROUP_OF[id] ||= g.name)));
  const groupName = (id, fallback) => GROUP_OF[id] || fallback;
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
          group: groupName(aid, short(aid)),
          from: A[aid]?.title || short(aid),
          size: r.size,
          broad: C.n && r.size > 0.25 * C.n,
          note: C.notes?.[aid] || '',
        })
      )
    );
    classQs.forEach((aid) =>
      uniq(rowsOf(aid)).forEach((r) =>
        pool.push({
          id: `c:${aid}:${r.id}`,
          label: r.label,
          group: groupName(aid, short(aid)),
          from: A[aid]?.title || short(aid),
        })
      )
    );
    (C.sources || []).forEach((src) =>
      (srcTerms[src.id] || []).forEach(([id, name, n]) =>
        pool.push({
          id: `x:${src.id}:${id}`,
          label: name,
          ref: id,
          size: n,
          group: groupName(src.id, src.title),
          from: src.title,
          broad: C.n && n > 0.25 * C.n,
        })
      )
    );
    (C.families?.readers || []).forEach((f) =>
      pool.push({
        id: `f:readers:${f.id}`,
        label: C.names?.[f.id] || f.name,
        tag: 'reader',
        size: f.n,
        group: 'Readers',
      })
    );
    (C.families?.enzymes || []).forEach((f) => {
      const pn = plainName(f.name);
      pool.push({
        id: `f:enzymes:${f.id}`,
        label: C.names?.[f.id] || pn.name,
        tag: f.role || pn.tag,
        size: f.n,
        group: 'Enzymes',
      });
    });
    const pa = D.protein_attributes;
    Object.entries(pa?.specs || {}).forEach(([name, sp]) => {
      if (sp.kind === 'number' || sp.kind === 'list' || !pa.values?.[name]) return;
      [...new Set(pa.values[name].filter((v) => v != null && v !== ''))]
        .slice(0, 60)
        .forEach((v) =>
          pool.push({ id: `a:${name}:${v}`, label: `${(sp.values || {})[v] || v}`, group: sp.label || name })
        );
    });
    pool = [...new Map(pool.map((t) => [t.id, t])).values()];
    return pool;
  }
  const specials = () => [
    ...(K.sel.active() ? [{ id: 'sel', label: 'The current selection', group: 'Selection' }] : []),
    ...savedList().map((x) => ({ id: `sv:${x.name}`, label: `Saved: ${x.name}`, group: 'Selection' })),
  ];
  const termLabel = (id) => {
    const t = [...termPool(), ...specials()].find((x) => x.id === id);
    if (t) return t.label;
    if (id === 'sel') return 'The current selection';
    if (id.startsWith('g:')) return 'Gene list';
    if (id.startsWith('sv:')) return `Saved: ${id.slice(3)}`;
    if (id.startsWith('x:')) return id.split(':').slice(2).join(':');
    return id.replace(/^[a-z]+:/, '');
  };
  const termTag = (id) => [...termPool(), ...specials()].find((x) => x.id === id)?.tag || '';

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
      U = {
        acc,
        gene: u?.gene,
        ix,
        n: acc.length,
        partial: !u,
        marked,
        pu,
        weight,
        nMarked: marked.reduce((s, x) => s + x, 0),
      };
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
      t.tag = termTag(id);
      t.markedOnly = ['c', 'sel', 'sv', 'g', 'a'].includes(kind); // its members all have sites, by definition
      t.n = count(t.prot);
    }
    return (cache[id] = t);
  }

  // ---- the result: regions of the chosen terms in the chosen unit ---------------------------------------------------------
  let RES = null;
  async function compute(ids, unit, minN = MIN_N) {
    await loadUniverse();
    const got = await Promise.all(ids.map(resolve)),
      ts = got.filter(Boolean),
      nT = ts.length;
    if (ts.length < ids.length)
      return { ts, unit, nT: ids.length, missing: ids.filter((_, i) => !got[i]), rows: [], totals: [], pairs: {} };
    const fams = await DATA.families();
    const circ = ts.filter((t) => t.markedOnly).map((t) => t.label),
      res = { ts, unit, nT, partial: U.partial, circ, rows: [], totals: [], note: '' };
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
        ...(U.partial || circ.length ? { k: r.k, n: r.n } : proteinTest(r.k, r.n, M, N)),
        sites: r.w,
      }));
      res.N = N;
      res.M = M;
      if (!U.partial && !circ.length) {
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
    res.pairs = overlapPairs(nT, mask, marked);
    if (U.partial && unit !== 'sites') res.pairs = { all: null, marked: res.pairs.all }; // only the proteins with sites are known
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
    // a leader must not cross another leader or pass through a label
    const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x),
      segX = (p1, p2, p3, p4) => ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4),
      segBox = (a, b, bx) => {
        const inside = (p) => p.x > bx.x && p.x < bx.x + bx.w && p.y > bx.y && p.y < bx.y + bx.h,
          c = [
            { x: bx.x, y: bx.y },
            { x: bx.x + bx.w, y: bx.y },
            { x: bx.x + bx.w, y: bx.y + bx.h },
            { x: bx.x, y: bx.y + bx.h },
          ];
        return inside(a) || inside(b) || c.some((p, i) => segX(a, b, p, c[(i + 1) % 4]));
      };
    outside.sort((x, y) => x.r.n - y.r.n);
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
          if (!clearOf(b, 0)) continue;
          const end = {
              x: Math.max(b.x + 2, Math.min(P.x, b.x + b.w - 2)),
              y: Math.max(b.y + 2, Math.min(P.y, b.y + b.h - 2)),
            },
            from = { x: P.x, y: P.y };
          if (
            leaders.some((L) => segX(from, end, { x: L.x1, y: L.y1 }, { x: L.x2, y: L.y2 })) ||
            boxes.some((o2) => segBox(from, end, o2))
          )
            continue;
          const score = rho + Math.ceil(s / 2) * 6;
          if (!best || score < best.score) best = { score, bx, by, b };
          break;
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
    if (r.noBar) {
      kids.length = 0; // a set listed by its size only
      kids.push(el('text', { x: 2, y: yc + 4, 'font-size': 12, fill: 'var(--fig-ink-2)' }, [r.tipText]));
      return svgEl(w, H, kids);
    }
    if (r.expected != null) {
      // where chance would put the bar: a tick across the row
      const ex = X(Math.min(r.expected, sc.max));
      kids.push(el('line', { x1: ex, x2: ex, y1: yc - 10, y2: yc + 10, stroke: 'var(--fig-ink)', 'stroke-width': 2 }));
    }
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
      const t = el('text', {
        x: Math.max(end, r.expected != null ? X(Math.min(r.expected, sc.max)) : 0) + 6,
        y: yc + 4,
        'font-size': 12,
        fill: 'var(--fig-ink-2)',
      });
      if (r.tipText) t.appendChild(el('tspan', { fill: 'var(--fig-ink)', 'font-weight': 600 }, [r.tipText]));
      else if (r.sitesOnly) t.appendChild(el('tspan', { fill: 'var(--fig-ink)', 'font-weight': 600 }, [fmtInt(r.n)]));
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
      const [lo, hi] = r.noci ? [r.or, r.or] : woolf(r.a, r.b, r.c, r.d);
      [lo, hi, r.or].forEach((v) => {
        if (v > 0 && Number.isFinite(v)) m = Math.max(m, Math.abs(Math.log2(v)));
      });
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
        [lo, hi] = r.noci ? [f, f] : woolf(r.a, r.b, r.c, r.d),
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
      if (!r.noci)
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
  const expTick = () =>
    svgEl(6, 14, [el('line', { x1: 3, x2: 3, y1: 0, y2: 14, stroke: 'var(--fig-ink)', 'stroke-width': 2 })]);
  const refTick = () =>
    svgEl(6, 14, [el('line', { x1: 3, x2: 3, y1: 0, y2: 14, stroke: 'var(--fig-ref)', 'stroke-width': 1.5 })]);
  const regionWords = (res, m) => regWords(res, m);
  function regWords(res, m) {
    const inn = res.ts.filter((_, i) => m & (1 << i)).map((t) => t.label),
      out = res.ts.filter((_, i) => !(m & (1 << i))).map((t) => t.label);
    return inn.join(' and ') + (out.length ? `, not ${out.join(', not ')}` : '');
  }
  const expText = (v) => (v == null || Number.isNaN(v) ? '–' : v < 10 ? v.toFixed(1) : fmtInt(Math.round(v)));

  // -- the two questions as figure specs: what the key says, the columns, the rows and how each cell is drawn
  function specB(res, fd) {
    const sitesU = fd.sitesU,
      nT = res.nT,
      uw = unitWord(res.unit),
      L2 = sitesU ? foldDomain(fd.regs) : 0,
      pairTip = null;
    const valsOf = (r) => {
      if (!fd.tested) return null;
      if (r.few) return { msg: `${sitesU ? '' : `${r.k} of `}${r.n} · not tested (n < ${MIN_N})` };
      if (!isTested(r)) return { msg: '–' };
      return {
        parts: [
          ['sh', sitesU ? foldFmt(r.or ?? r.fold) : pct(r.k / r.n)],
          ['fo', sitesU ? '' : foldFmt(r.k / r.n / fd.base, r.k)],
          ['q', 'q ' + fqf(r.q)],
        ],
      };
    };
    const text = (r) => (sitesU ? fmtInt(r.n) : `${fmtInt(r.k)} / ${fmtInt(r.n)}`);
    const regs = fd.regs.map((r) => ({
      ...r,
      sel: String(r.m),
      hl: { m: r.m },
      dm: r.m,
      text: regLabel(r.m, nT),
      sitesOnly: sitesU,
      tipText: undefined,
    }));
    return {
      q: 'b',
      keyLines: [
        sitesU
          ? ['Bar length', [[keyBar('var(--fig-count-k)'), 'sites']]]
          : [
              'Bar length',
              [
                [keyBar('var(--fig-count-k)'), 'with sites'],
                [keyBar('var(--fig-count-n)'), 'without'],
              ],
            ],
        ...(fd.tested
          ? [
              [
                sitesU ? 'Odds ratio' : `Share ${W.marked}`,
                [
                  [keyBar('var(--fig-more)'), 'more'],
                  [keyBar('var(--fig-less)'), 'fewer'],
                  [keyBar('var(--fig-surface)', 'var(--fig-muted)'), 'no clear difference'],
                  [whisker(), '95% interval'],
                  [refTick(), sitesU ? 'OR 1' : `all reviewed proteins, ${pct(fd.base)}`],
                ],
              ],
            ]
          : []),
      ],
      heads: {
        size: [sitesU ? cap(uw) : cap(uw), sitesU ? '' : 'with sites / all'],
        mid: !fd.tested ? 'Not tested here' : sitesU ? 'Odds ratio, log scale (Fisher)' : `Share ${W.marked}`,
        vals: !fd.tested ? null : sitesU ? ['OR', '', 'q'] : ['share', 'fold', 'q'],
      },
      sections: [
        {
          title: 'Sets',
          sub: `· every ${sitesU ? W.mark : 'protein'} of each set`,
          rows: fd.terms.map((t) => ({ ...t, term: true, sitesOnly: sitesU, dm: t.m })),
        },
        { title: 'Regions', sub: `· ${uw} in exactly these sets, largest first`, rows: regs },
      ],
      scaleValues: [...fd.terms.map((t) => t.n), ...fd.regs.map((r) => r.n)],
      tipTexts: [...fd.terms, ...fd.regs].map(text),
      sizeCell,
      midCell: fd.tested
        ? (r, w, phone) => (sitesU ? foldCell(r, L2, w, phone) : shareCell(r, fd.base, w, phone))
        : null,
      midAxis: fd.tested ? (w) => (sitesU ? axisFold(L2, w) : axisShare(fd.base, w)) : null,
      vals: valsOf,
      phoneA: text,
      pairTip,
      tip(rec) {
        const out = { lines: [], extra: [] };
        if (sitesU)
          out.lines.push(['var(--fig-count-k)', fmtInt(rec.n), `${W.marks} on ${fmtInt(rec.proteins ?? 0)} proteins`]);
        else out.lines.push(['var(--fig-count-k)', `${fmtInt(rec.k)} / ${fmtInt(rec.n)}`, `${uw} with sites`]);
        if (isTested(rec)) {
          if (sitesU) {
            const [lo, hi] = woolf(rec.a, rec.b, rec.c, rec.d);
            out.lines.push([
              `var(--fig-${dirOf(rec, 0, true)})`,
              foldFmt(rec.or ?? rec.fold),
              `odds ratio · 95% interval ${lo.toFixed(2)}–${hi.toFixed(2)}`,
            ]);
          } else {
            const [lo, hi] = wilson(rec.k, rec.n);
            out.lines.push([
              `var(--fig-${dirOf(rec, fd.base)})`,
              pct(rec.k / rec.n),
              `${W.marked} · 95% interval ${Math.round(lo * 100)}–${Math.round(hi * 100)}%`,
            ]);
            out.extra.push(`${foldFmt(rec.k / rec.n / fd.base, rec.k)} all reviewed proteins (${pct(fd.base)})`);
          }
          out.extra.push(`p ${fqf(rec.p)} · q ${fqf(rec.q)}`);
        }
        out.hint = `${fmtInt(rec.sites ?? rec.n)} ${W.marks} · click to list the ${uw}`;
        return out;
      },
      notes: (sc) => {
        const o = [];
        if (res.test)
          o.push(
            (sitesU
              ? TESTS.sites
              : `${TESTS.proteins} ${fmtInt(res.M)} of ${fmtInt(res.N)} reviewed proteins (${pct(fd.base)}) have sites.`) +
              ` Regions under ${MIN_N} are counted, not tested.`
          );
        else
          o.push(
            res.circ?.length
              ? `Not tested: ${joinNames(res.circ)} ${res.circ.length === 1 ? 'is' : 'are'} defined by having sites, so testing it for having sites would be circular. Counts only; the first question has no such problem.`
              : res.partial
                ? 'Not tested here: only the proteins with sites are known for these sets.'
                : 'No test: a set describes sites, and the comparison residues are not known for several features at once. Counts only.'
          );
        if (sc.brk < Infinity) o.push('Bars marked // are cut: they are longer than the axis.');
        const bigs = fd.regs.filter(broad);
        if (bigs.length)
          o.push(
            `${bigs.map((r) => regLabel(r.m, nT)).join(', ')}: a very large set, so a tiny p at a small fold (large set; small effect).`
          );
        return o;
      },
    };
  }
  function specA(res) {
    const uw = unitWord(res.unit),
      groups = ['all', 'marked'].filter((u) => res.pairs?.[u]?.length),
      recs = (u) =>
        res.pairs[u].map((r) => ({
          ...r,
          u,
          pair: true,
          nA: r.n, // the sizes of the two sets; the bar is the shared count
          nB: r.m,
          m: r.mask, // the pair's mask (for the glyph and the rows)
          n: r.a,
          k: r.a,
          or: r.fold,
          noci: true,
          sel: `a${r.mask}`,
          hl: { m: r.mask, sup: true },
          dm: r.mask,
          text: `${LETTERS[r.i]} and ${LETTERS[r.j]}`,
          tipText: `${fmtInt(r.a)} · ${expText(r.expected)} expected`,
          sitesOnly: true,
          unit: u,
        })),
      all = groups.flatMap(recs),
      L2 = foldDomain(all.map((r) => ({ ...r, q: r.q }))),
      tested = all.some((r) => r.q != null);
    const terms = res.ts.map((t, i) => {
      const n = res.rows.filter((r) => r.mask & (1 << i)).reduce((s, r) => s + r.n, 0);
      return {
        L: LETTERS[i],
        name: t.label,
        tag: t.tag,
        i,
        m: 1 << i,
        n,
        k: n,
        term: true,
        noBar: true,
        tipText: `${fmtInt(n)} ${uw}`,
        dm: 1 << i,
      };
    });
    return {
      q: 'a',
      keyLines: [
        [
          'Bar length',
          [
            [keyBar('var(--fig-count-k)'), 'shared'],
            [expTick(), 'expected by chance'],
          ],
        ],
        [
          'Times the expected overlap',
          [
            [keyBar('var(--fig-more)'), 'more than chance'],
            [keyBar('var(--fig-surface)', 'var(--fig-muted)'), 'not clearly more'],
            [refTick(), '1× (as expected)'],
          ],
        ],
      ],
      heads: {
        size: ['Shared', `${uw} in both`],
        mid: 'Times the expected overlap, log scale',
        vals: ['fold', '', 'q'],
      },
      sections: [
        { title: 'Sets', sub: `· ${uw} in each set`, rows: terms },
        ...groups.map((u) => ({
          title: `Among ${universeLabel(res, u)
            .toLowerCase()
            .replace(/^(\w)/, (c) => c)}`,
          sub: `· ${fmtInt(res.pairs[u][0].N)} counted`,
          rows: recs(u),
        })),
      ],
      scaleValues: all.flatMap((r) => [r.a, Number.isNaN(r.expected) ? 0 : r.expected]),
      tipTexts: all.map((r) => r.tipText),
      sizeCell,
      midCell: (r, w, phone) => (r.term ? svgEl(w, phone ? 22 : 30, []) : foldCell(r, L2, w, phone)),
      midAxis: (w) => axisFold(L2, w),
      vals: (r) => {
        if (r.term) return { msg: '' };
        if (r.q == null) return { msg: 'not tested' };
        return {
          parts: [
            ['sh', r.a === 0 ? '0×' : foldFmt(r.fold, r.a)],
            ['fo', ''],
            ['q', 'q ' + fqf(r.q)],
          ],
        };
      },
      phoneA: (r) => r.tipText,
      tip(rec) {
        const out = { lines: [], extra: [] };
        out.lines.push(['var(--fig-count-k)', fmtInt(rec.a), `${uw} in both`]);
        out.extra.push(
          `${expText(rec.expected)} expected by chance, from ${fmtInt(rec.nA)} and ${fmtInt(rec.nB)} of ${fmtInt(rec.N)} ${universeLabel(res, rec.u).toLowerCase()}`
        );
        if (rec.q != null)
          out.extra.push(
            `${rec.a === 0 ? '0×' : foldFmt(rec.fold, rec.a)} the expected overlap · p ${fqf(rec.p)} · q ${fqf(rec.q)}`
          );
        out.hint = `click to list the ${uw} in both`;
        return out;
      },
      notes: (sc) => {
        const o = [
          `One-sided hypergeometric test: the chance that two random sets of these sizes, drawn from the ${uw} counted, share this many or more. Fold = shared / expected (n × m / N). q: Benjamini–Hochberg across the pairs of each group.`,
        ];
        if (sc.brk < Infinity) o.push('Bars marked // are cut: they are longer than the axis.');
        return o;
      },
      tested,
    };
  }
  const specOf = (res) => {
    const fd = figData(res);
    return { fd, spec: question(res) === 'a' ? specA(res) : specB(res, fd) };
  };

  // -- the figure on the page: built as DOM from a result and a spec, redrawn when its width changes
  const UI = {
    hover: '',
    sel: '',
    layout: null,
    rows: [],
    fig: null,
    res: null,
    fd: null,
    spec: null,
    glyphHost: null,
    tip: null,
  };
  const glyphState = (key) => {
    if (!key) return 0;
    const o = parseOr(key);
    return { m: o.m, sup: o.sup };
  };
  const regAria = (res, spec, r) => {
    const v = spec.vals(r);
    return `${r.text}: ${
      v?.parts
        ? v.parts
            .map((p) => p[1])
            .filter(Boolean)
            .join(', ')
        : v?.msg || ''
    }. Open this ${r.pair ? 'overlap' : 'region'}.`;
  };
  function valuesCell(r, spec) {
    const c = html('div', 'c vals'),
      v = spec.vals(r);
    if (!v) return c;
    if (v.msg != null) c.appendChild(html('span', 'nt', v.msg));
    else v.parts.forEach(([cls, t]) => c.appendChild(html('span', cls, t)));
    return c;
  }
  function phoneLine(r, spec) {
    const pl = html('div', 'phline'),
      a = html('span', 'a', spec.phoneA(r)),
      b = html('span', 'b'),
      v = spec.vals(r);
    if (v?.msg != null) b.appendChild(html('span', 'nt', v.msg));
    else if (v) {
      b.appendChild(html('span', 'sh', v.parts[0][1]));
      b.appendChild(document.createTextNode(` · ${[v.parts[1][1], v.parts[2][1]].filter(Boolean).join(' · ')}`));
    }
    pl.appendChild(a);
    pl.appendChild(b);
    return pl;
  }
  const keyLineDom = ([lead, items]) => {
    const line = html('div', 'kline');
    line.appendChild(html('span', 'kh', lead));
    items.forEach(([glyph, txt]) => {
      const s = html('span', 'k');
      s.appendChild(glyph);
      s.appendChild(document.createTextNode(txt));
      line.appendChild(s);
    });
    return line;
  };
  function buildFigure(host, res) {
    host.textContent = '';
    const { fd, spec } = specOf(res),
      nT = res.nT,
      fig = html('figure', 'ovx');
    fig.style.margin = 0;
    host.appendChild(fig);
    const phone = fig.clientWidth <= 560;
    fig.style.setProperty('--dotsw', `${12 + (nT - 1) * 16 + 4}px`);
    Object.assign(UI, { fig, res, fd, spec, rows: [], tip: null, glyphHost: null, layout: null });
    UI.hover = '';
    UI.sel = String(S.or || '');
    const top = html('div', 'ovx-top');
    fig.appendChild(top);
    const sizes = res.ts.map((t, i) => res.rows.filter((r) => r.mask & (1 << i)).reduce((s, r) => s + r.n, 0));
    if (nT <= 3 && sizes.every((n) => n > 0)) {
      UI.layout = glyphLayout(
        sizes,
        res.rows.filter((r) => r.mask).map((r) => ({ m: r.mask, n: r.n })),
        { w: phone ? 300 : 380, h: phone ? 210 : 270 }
      );
      const gw = html('div', 'ovx-glyph');
      gw.title = `Circle and overlap areas are proportional to the counts${UI.layout.err > 0.01 ? ` (largest misfit ${(UI.layout.err * 100).toFixed(1)}% of the total)` : ''}.`;
      gw.appendChild(glyphSvg(UI.layout, nT, { sel: glyphState(UI.sel) }));
      top.appendChild(gw);
      UI.glyphHost = gw;
    }
    const key = html('div', 'ovx-key');
    top.appendChild(key);
    spec.keyLines.forEach((k) => key.appendChild(keyLineDom(k)));
    if (!UI.layout)
      key.appendChild(
        html(
          'p',
          'ovx-note',
          nT > 3
            ? 'No diagram for four sets: four circles cannot all show true overlaps. The rows give the counts.'
            : `No diagram: a set has no ${unitWord(res.unit)} here, so there is nothing to draw. The rows give the counts.`
        )
      );
    const grid = html('div', 'ovx-grid');
    fig.appendChild(grid);
    const sc = sizeScale(spec.scaleValues);
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
    h2.appendChild(ch(...spec.heads.size));
    h3.appendChild(ch(spec.heads.mid, ''));
    if (spec.heads.vals) {
      const hv = html('span', 'vals vh');
      ['sh', 'fo', 'q'].forEach((c, i) => hv.appendChild(html('span', c, spec.heads.vals[i])));
      h4.appendChild(hv);
    }
    [h1, h2, h3, h4].forEach((c) => head.appendChild(c));
    grid.appendChild(head);
    const rows = [];
    const addRow = (rec) => {
      const isTerm = !!rec.term,
        r = html('div', `r ${isTerm ? 'term-r' : 'data'}`),
        c2 = html('div', 'c sz'),
        c3 = html('div', 'c sh'),
        c4 = valuesCell(rec, spec),
        lab = html('div', 'c lab');
      if (isTerm) {
        const tm = html('span', 'term'),
          sw = html('span', 'sw'),
          nm = html('span', 'nm', rec.name);
        sw.style.background = `var(--fig-c${rec.i + 1})`;
        tm.appendChild(sw);
        tm.appendChild(html('b', '', rec.L));
        tm.appendChild(nm);
        if (rec.tag) tm.appendChild(html('span', 'ov-tag', rec.tag));
        lab.appendChild(tm);
        if (phone) {
          lab.textContent = '';
          lab.appendChild(dotsSvg(rec.dm, nT));
        }
      } else {
        const rg = html('span', 'reg');
        rg.appendChild(dotsSvg(rec.dm, nT));
        rg.appendChild(html('span', 'rl', rec.text));
        lab.appendChild(rg);
        r.dataset.ovReg = rec.sel;
        lab.tabIndex = -1;
        lab.setAttribute('role', 'button');
        lab.setAttribute('aria-label', regAria(res, spec, rec));
        if (rec.sel === UI.sel) r.classList.add('sel');
      }
      [lab, c2, c3, c4].forEach((c) => r.appendChild(c));
      if (isTerm) {
        const t = html('div', 'phline top'),
          n1 = html('span', 'nm1');
        n1.appendChild(html('b', '', rec.L));
        n1.appendChild(document.createTextNode(rec.name));
        if (rec.tag) n1.appendChild(html('span', 'ov-tag', rec.tag));
        t.appendChild(n1);
        grid.appendChild(t);
      } else if (rec.pair) {
        const t = html('div', 'phline top'),
          n1 = html('span', 'nm1');
        n1.appendChild(document.createTextNode(rec.text));
        t.appendChild(n1);
        grid.appendChild(t);
      }
      grid.appendChild(r);
      grid.appendChild(phoneLine(rec, spec));
      rows.push({ rec, c2, c3, r, lab });
    };
    spec.sections.forEach((sec) => {
      const g = html('div', 'grp', sec.title + ' ');
      g.appendChild(html('i', '', sec.sub));
      grid.appendChild(g);
      sec.rows.forEach(addRow);
    });
    const first = rows.find((x) => !x.rec.term);
    (rows.find((x) => x.rec.sel === UI.sel && !x.rec.term) || first)?.lab &&
      ((rows.find((x) => x.rec.sel === UI.sel && !x.rec.term) || first).lab.tabIndex = 0);
    const w2 = rows[0].c2.clientWidth,
      w3 = rows[0].c3.clientWidth;
    sc.tip = Math.ceil(Math.max(...spec.tipTexts.map((t) => tw(t, 12, 600)))) + 12;
    {
      const pw = (phone ? w2 : w2 - sc.tip) * (sc.brk < Infinity ? 0.86 : 1),
        want = Math.max(2, Math.min(6, Math.floor(pw / 38)));
      sc.ticks = niceTicks(sc.base, want);
      sc.max = Math.max(sc.base, sc.ticks.at(-1));
    }
    h2.appendChild(axisSize(sc, w2, phone));
    if (spec.midAxis) h3.appendChild(spec.midAxis(w3));
    rows.forEach(({ rec, c2, c3 }) => {
      c2.appendChild(spec.sizeCell(rec, sc, w2, phone));
      if (spec.midCell) c3.appendChild(spec.midCell(rec, w3, phone));
    });
    const f = html('div', 'foot');
    f.textContent = spec.notes(sc).join(' ');
    fig.appendChild(f);
    UI.rows = rows;
    UI.sc = sc;
    UI.phone = phone;
  }
  // hover: a row's wash, its region outlined in the glyph, and a tooltip with the values first
  function setHover(key, row) {
    if (!UI.fig || UI.hover === key) return;
    UI.hover = key;
    UI.rows.forEach((x) => x.r.classList.toggle('hover', !x.rec.term && x.rec.sel === key));
    if (UI.layout && UI.glyphHost) {
      UI.glyphHost.textContent = '';
      UI.glyphHost.appendChild(glyphSvg(UI.layout, UI.res.nT, { hover: glyphState(key), sel: glyphState(UI.sel) }));
    }
    UI.tip?.remove();
    UI.tip = null;
    if (!key || !row || matchMedia?.('(hover: none)').matches) return;
    const { res, spec } = UI,
      rec = row.rec,
      tip = html('div', 'tip'),
      t1 = html('div', 't1');
    t1.appendChild(html('b', '', rec.text));
    t1.appendChild(
      document.createTextNode(
        ' · ' + (rec.pair ? `in ${res.ts[rec.i].label} and ${res.ts[rec.j].label}` : regWords(res, rec.m))
      )
    );
    tip.appendChild(t1);
    const t = spec.tip(rec);
    t.lines.forEach(([keyCol, big, rest]) => {
      const l = html('div', 'ln'),
        kk = html('span', 'key');
      kk.style.borderColor = keyCol;
      l.appendChild(kk);
      l.appendChild(html('span', 'big', big));
      l.appendChild(html('span', '', rest));
      tip.appendChild(l);
    });
    t.extra.forEach((x) => tip.appendChild(html('div', 'ln', x)));
    tip.appendChild(html('div', 'hint', t.hint));
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
    setHover(row ? row.rec.sel : '', row);
  });
  document.addEventListener('focusin', (e) => {
    if (!UI.fig) return;
    const row = rowOf(e.target);
    if (row) setHover(row.rec.sel, row);
  });
  document.addEventListener('focusout', (e) => {
    if (UI.fig && rowOf(e.target)) setHover('', null);
  });
  // the glyph's regions are targets too: the row of that region (or the first pair that holds it)
  const glyphMask = (e) => {
    const svg = e.target.closest?.('.ovx-glyph svg');
    if (!svg || !UI.layout) return 0;
    const b = svg.getBoundingClientRect(),
      L = UI.layout;
    return L.at(((e.clientX - b.left) / b.width) * L.vw + L.vx, ((e.clientY - b.top) / b.height) * L.vh + L.vy);
  };
  const rowForMask = (m) =>
    m ? UI.rows.find((x) => !x.rec.term && (x.rec.pair ? (m & x.rec.m) === x.rec.m : x.rec.m === m)) : null;
  document.addEventListener('mousemove', (e) => {
    if (!UI.fig || !e.target.closest?.('.ovx-glyph')) return;
    const row = rowForMask(glyphMask(e));
    setHover(row ? row.rec.sel : '', row || null);
  });
  document.addEventListener('click', (e) => {
    if (!UI.fig || S.view !== 'overlap') return;
    const row = rowForMask(glyphMask(e));
    if (row) set({ or: String(S.or) === row.rec.sel ? '' : row.rec.sel });
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

  // -- the export: the same rows as one SVG at a preset's width, no hover or selection
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
  const wrapText = (s, maxW, size, w = 400, maxLines = 3) => {
    const words = String(s).split(/\s+/),
      lines = [''];
    words.forEach((word) => {
      const cur = lines.at(-1),
        next = cur ? `${cur} ${word}` : word;
      if (cur && tw(next, size, w) > maxW && lines.length < maxLines) lines.push(word);
      else lines[lines.length - 1] = next;
    });
    return lines;
  };
  function exportBody(res, Wd = 920) {
    const { spec } = specOf(res),
      nT = res.nT,
      two = Wd < 760,
      root = el('g', { transform: 'translate(20,0)' }), // the frame's margin
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
    const sizes = res.ts.map((t, i) => res.rows.filter((r) => r.mask & (1 << i)).reduce((s, r) => s + r.n, 0));
    if (nT <= 3 && sizes.every((n) => n > 0)) {
      const L = glyphLayout(
          sizes,
          res.rows.filter((r) => r.mask).map((r) => ({ m: r.mask, n: r.n })),
          { w: two ? 300 : 360, h: two ? 210 : 250 }
        ),
        g = glyphSvg(L, nT, {});
      place(g, 0, 0);
      gw = L.vw + 24;
      y = L.vh;
    }
    let ky = 14;
    spec.keyLines.forEach(([lead, items]) => {
      T(gw, ky, lead, { size: 12.5, fill: 'var(--fig-muted)' });
      let kx = gw + tw(lead, 12.5, 400) + 12;
      items.forEach(([glyph, txt]) => {
        const w = tw(txt, 12.5, 400) + 30;
        if (kx > gw + 40 && kx + w > Wd) {
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
    const cols = two ? { lab: 128, a: 220, b: 252, gap: 12 } : { lab: 220, a: 220, b: 230, gap: 14 },
      xa = cols.lab + cols.gap,
      xb = xa + cols.a + cols.gap,
      xv = xb + cols.b + cols.gap,
      sc = sizeScale(spec.scaleValues);
    sc.tip = Math.ceil(Math.max(...spec.tipTexts.map((t) => tw(t, 12, 600)))) + 12;
    sc.ticks = niceTicks(
      sc.base,
      Math.max(2, Math.min(6, Math.floor(((cols.a - sc.tip) * (sc.brk < Infinity ? 0.86 : 1)) / 38)))
    );
    sc.max = Math.max(sc.base, sc.ticks.at(-1));
    T(xa, y + 11, spec.heads.size[0], { w: 600, fill: 'var(--fig-ink-2)' });
    if (spec.heads.mid) T(xb, y + 11, spec.heads.mid, { w: 600, fill: 'var(--fig-ink-2)' });
    if (spec.heads.vals && !two) {
      T(xv, y + 11, spec.heads.vals[0], { size: 12, fill: 'var(--fig-muted)' });
      if (spec.heads.vals[1]) T(xv + 62, y + 11, spec.heads.vals[1], { size: 12, fill: 'var(--fig-muted)' });
      T(xv + 116, y + 11, spec.heads.vals[2], { size: 12, fill: 'var(--fig-muted)' });
    }
    y += 16;
    place(axisSize(sc, cols.a, false), xa, y);
    if (spec.midAxis) place(spec.midAxis(cols.b), xb, y);
    y += 24;
    const pitch = two ? 46 : 30;
    const row = (rec) => {
      let h = pitch;
      if (rec.term) {
        const lines = wrapText(rec.name + (rec.tag ? ` · ${rec.tag}` : ''), cols.lab - 36, 13);
        h = Math.max(pitch, lines.length * 16 + 14);
        root.appendChild(
          el('rect', { x: 0, y: y + 9, width: 11, height: 11, rx: 3, fill: `var(--fig-c${rec.i + 1})` })
        );
        T(18, y + 19, rec.L, { w: 700, size: 13 });
        lines.forEach((ln, i) => T(32, y + 19 + i * 16, ln, { size: 13 }));
      } else {
        place(dotsSvg(rec.dm, nT), 0, y + 5);
        T(12 + (nT - 1) * 16 + 10, y + 19, rec.text, { size: 12.5, fill: 'var(--fig-ink-2)' });
      }
      place(spec.sizeCell(rec, sc, cols.a, false), xa, y);
      if (spec.midCell) place(spec.midCell(rec, cols.b, false), xb, y);
      const v = spec.vals(rec);
      if (v) {
        if (v.msg != null) T(two ? xb : xv, y + (two ? 41 : 19), v.msg, { size: 12, fill: 'var(--fig-muted)' });
        else if (two) {
          T(xb, y + 41, v.parts[0][1], { size: 13, w: 700 });
          T(xb + tw(v.parts[0][1], 13, 700) + 8, y + 41, [v.parts[1][1], v.parts[2][1]].filter(Boolean).join(' · '), {
            size: 12,
            fill: 'var(--fig-muted)',
          });
        } else {
          T(xv + 48, y + 19, v.parts[0][1], { w: 700, size: 13, anchor: 'end' });
          if (v.parts[1][1]) T(xv + 110, y + 19, v.parts[1][1], { size: 13, fill: 'var(--fig-ink-2)', anchor: 'end' });
          T(xv + 116, y + 19, v.parts[2][1], { size: 12, fill: 'var(--fig-muted)' });
        }
      }
      y += h;
    };
    spec.sections.forEach((sec) => {
      T(0, y + 14, sec.title.toUpperCase(), { size: 10.5, fill: 'var(--fig-muted)' });
      T(tw(sec.title.toUpperCase(), 10.5, 400) + 8, y + 14, sec.sub, { size: 11, fill: 'var(--fig-muted)' });
      root.appendChild(
        el('line', { x1: 0, x2: Wd, y1: y + 20, y2: y + 20, stroke: 'var(--fig-grid)', 'stroke-width': 1 })
      );
      y += 26;
      sec.rows.forEach(row);
    });
    const str = new XMLSerializer()
      .serializeToString(root)
      .replace(/ xmlns="[^"]*"/g, '')
      .replace(/var\(--([a-z0-9-]+)\)/g, (m, n) => TOK[n] ?? m);
    return { svg: str, h: Math.ceil(y) + 4, notes: spec.notes(sc), bigs: [] };
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
      : `<td class="num">${r.k === 0 ? '0×' : fn(r.or ?? r.fold)}</td><td class="num">${r.p == null ? '–' : K.fq(r.p)}</td><td class="num">${r.q == null ? '–' : K.fq(r.q)}</td>`;
  const broad = (r) => {
    const e = r.or ?? r.fold;
    return !r.few && e != null && e > 0.8 && e < 1.25 && r.q != null && r.q < 1e-3;
  };
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
          `<button type="button" class="linkish" data-ov-reg="${r.mask}" title="${esc(regionWords(res, r.mask))}">${esc(regLabel(r.mask, res.nT))}</button>`,
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
  // what a universe is called, per unit
  const universeLabel = (res, u) =>
    u === 'marked'
      ? `${cap(W.marked)} proteins`
      : {
          proteins: 'All reviewed proteins',
          sites: `All ${W.marks}`,
          readers: 'All reader proteins',
          enzymes: 'All enzyme proteins',
        }[res.unit];
  const pairName = (res, r) => `${LETTERS[r.i]} and ${LETTERS[r.j]}`;
  // the overlap test as a table: one row per pair and universe
  function pairTableHtml(res) {
    const body = ['all', 'marked']
      .flatMap((u) => (res.pairs?.[u] || []).map((r) => ({ ...r, u })))
      .map(
        (r) =>
          `<tr${String(S.or) === 'a' + r.mask ? ' class="ov-on"' : ''}><th scope="row"><button type="button" class="linkish" data-ov-reg="a${r.mask}" title="${esc(`${res.ts[r.i].label} and ${res.ts[r.j].label}`)}">${esc(pairName(res, r))}</button></th>` +
          `<td>${esc(universeLabel(res, r.u))}</td><td class="num">${int(r.n)}</td><td class="num">${int(r.m)}</td><td class="num">${int(r.a)}</td>` +
          `<td class="num">${Number.isNaN(r.expected) ? '–' : r.expected < 10 ? r.expected.toFixed(1) : int(Math.round(r.expected))}</td>` +
          `<td class="num">${r.fold == null ? '–' : r.a === 0 ? '0×' : foldFmt(r.fold, r.a)}</td><td class="num">${fqf(r.p)}</td><td class="num">${fqf(r.q)}</td></tr>`
      )
      .join('');
    return (
      `<div class="tbl-card"><table class="tbl ov-tbl"><caption class="vh">Overlap of each pair of sets against chance</caption><thead><tr><th scope="col">Pair</th><th scope="col">Among</th>` +
      `<th scope="col" class="num">In first</th><th scope="col" class="num">In second</th><th scope="col" class="num">In both</th><th scope="col" class="num" title="first × second / all counted">Expected</th>` +
      `<th scope="col" class="num" title="in both / expected">Fold</th><th scope="col" class="num" title="one-sided hypergeometric: the chance of this many or more in both">p</th><th scope="col" class="num">q</th></tr></thead>` +
      `<tbody>${body || '<tr><td colspan="9">Nothing to test.</td></tr>'}</tbody></table></div>`
    );
  }
  // a region's list
  // S.or: "5" is the region of exactly the terms of mask 5; "a5" is every element in those terms (and maybe more)
  const parseOr = (v) => ({ m: +String(v).replace('a', '') || 0, sup: String(v).startsWith('a') });
  const orTitle = (res, v) => {
    const { m, sup } = parseOr(v),
      idx = [...Array(res.nT).keys()].filter((i) => m & (1 << i));
    return sup
      ? {
          head: `In ${joinNames(idx.map((i) => LETTERS[i]))}`,
          words: `in ${joinNames(idx.map((i) => res.ts[i].label))}`,
        }
      : { head: regLabel(m, res.nT), words: regionWords(res, m) };
  };
  function regionHtml(res) {
    const k = S.or,
      o = parseOr(k);
    if (!S.or || !o.m || o.m >= 1 << res.nT) return '';
    const sites = res.unit === 'sites',
      items = regionItems(res, k);
    const withSites = items.filter((x) => x.pi != null);
    const shown = items.slice(0, 200);
    const li = (x) =>
      x.pi != null
        ? `<li><a href="${esc(K.link('protein', x.acc))}"><b>${esc(K.sel.nameOf(K.sel.byAcc[x.acc]) || x.acc)}</b></a>${x.pos ? ` <span class="muted">${esc(x.pos)}</span>` : ''}</li>`
        : `<li><a href="https://www.uniprot.org/uniprotkb/${esc(x.acc)}" title="${esc(x.acc)}, no ${esc(W.mark)} here">${x.gene ? `<b>${esc(x.gene)}</b> <span class="muted">${esc(x.acc)}</span>` : esc(x.acc)}</a></li>`;
    const sel = [...new Set(withSites.map((x) => x.acc))],
      unitNoun = sites ? 'sites' : unitWord(res.unit);
    return (
      `<section class="ov-region" id="ov-region" aria-live="polite"><h3>${esc(orTitle(res, k).head)}: ${esc(orTitle(res, k).words)}</h3>` +
      `<p class="muted">${int(items.length)} ${unitNoun}${sites ? `, on ${int(sel.length)} proteins` : `; ${int(withSites.length)} have ${esc(W.marks)} (linked to their pages), ${int(items.length - withSites.length)} have none`}.</p>` +
      `<p class="actions"><button type="button" class="btn small" data-ov-use${sel.length && sel.length <= SELMAX ? '' : ' disabled'} title="${
        sel.length > SELMAX
          ? `Over ${SELMAX} proteins: too many for a link`
          : `The selection holds the ${sel.length} protein${sel.length === 1 ? '' : 's'} with ${W.marks}; the ${sites ? '' : `${int(items.length - withSites.length)} without `}cannot be selected`
      }">Use the ${int(sel.length)}${sites ? '' : ` of ${int(items.length)}`} with ${esc(W.marks)} as the selection</button> <button type="button" class="btn small" data-ov-list>TSV</button> <button type="button" class="linkish" data-ov-close>Close</button></p>` +
      `<ul class="ov-list">${shown.map(li).join('')}</ul>` +
      (items.length > shown.length
        ? `<p class="muted">The first ${shown.length} of ${int(items.length)}; the TSV has all.</p>`
        : '') +
      '</section>'
    );
  }
  function regionItems(res, k) {
    const out = [],
      { m: want, sup } = parseOr(k),
      hit = (mk) => (sup ? (mk & want) === want : mk === want);
    if (res.unit === 'sites') {
      const SD = DATA.sd();
      res.mask.forEach((mk, e) => {
        if (!hit(mk)) return;
        const m = SD.marks[e],
          acc = D.proteins[m[0]][0];
        out.push({ acc, pi: m[0], pos: m[1] });
      });
      return out.sort((a, b) => a.acc.localeCompare(b.acc) || a.pos - b.pos);
    }
    const byAcc = K.sel.byAcc;
    res.mask.forEach((mk, e) => {
      if (!hit(mk)) return;
      const acc = U.acc[res.elems[e]];
      out.push({ acc, pi: byAcc[acc] ? byAcc[acc].i : null, gene: U.gene?.[res.elems[e]] || '' });
    });
    return out.sort((a, b) => (b.pi != null) - (a.pi != null) || a.acc.localeCompare(b.acc));
  }
  // ---- the picker, the question, the answer ------------------------------------------------------------------------------
  const UIP = { group: '', q: '' };
  const groupOrder = () => {
    const have = [...new Set(termPool().map((t) => t.group))],
      first = (C.groups || []).map((g) => g.name).filter((n) => have.includes(n)),
      last = ['Readers', 'Enzymes'].filter((n) => have.includes(n));
    return [...first, ...have.filter((n) => !first.includes(n) && !last.includes(n)), ...last];
  };
  const termOf = (id) => [...termPool(), ...specials()].find((x) => x.id === id);
  function chipHtml(id, i) {
    const t = termOf(id),
      lab = id.startsWith('g:') ? `Gene list: ${id.slice(2, 40)}` : termLabel(id),
      tag = termTag(id);
    return (
      `<span class="ov-chip${RES?.res?.missing?.includes(id) ? ' bad' : ''}">${SWATCH(i)}<b>${LETTERS[i]}</b> ${esc(lab)}` +
      `${t?.from && t.from !== t.group ? ` <span class="muted">${esc(t.from)}</span>` : ''}` +
      `${tag ? ` <span class="ov-tag">${esc(tag)}</span>` : ''}${t?.size ? ` <span class="muted">${int(t.size)}</span>` : ''} ` +
      `<button type="button" class="linkish" data-ov-del="${i}" aria-label="Remove ${esc(lab)}">×</button></span>`
    );
  }
  function pickerHtml() {
    const full = S.ot.length >= MAXT,
      groups = groupOrder(),
      pool0 = termPool(),
      chips = [['', 'All', pool0.length], ...groups.map((g) => [g, g, pool0.filter((t) => t.group === g).length])]
        .map(
          ([g, label, n]) =>
            `<button type="button" class="ov-gchip${UIP.group === g ? ' on' : ''}" aria-pressed="${UIP.group === g}" data-ov-group="${esc(g)}">${esc(label)} <span class="muted">${int(n)}</span></button>`
        )
        .join('');
    return (
      `<div class="ov-pick"><div class="ov-chips">${S.ot.map(chipHtml).join(' ') || '<span class="muted">No set chosen yet.</span>'}</div>` +
      `<label class="flabel" for="ov-q">${full ? `${MAXT} of ${MAXT} sets chosen` : `Add a set (${int(pool0.length)} to choose from)`}</label>` +
      `<div class="ov-gchips" role="group" aria-label="Where the sets come from">${chips}</div>` +
      `<input id="ov-q" type="search" autocomplete="off" value="${esc(UIP.q)}" placeholder="${full ? `At most ${MAXT} sets` : 'Search by name or GO id: a pathway, a location, a disease, a protein family…'}"${full ? ' disabled' : ''}>` +
      `<div id="ov-res" class="ov-res" role="listbox" aria-label="Matching sets">${resultsHtml(UIP.q)}</div>` +
      `<details class="ov-genes"><summary>Add a list of genes</summary><textarea id="ov-genes" rows="2" placeholder="Gene names or accessions"></textarea> <button type="button" class="btn small" data-ov-genes${full ? ' disabled' : ''}>Add</button></details></div>`
    );
  }
  function resultsHtml(q) {
    if (S.ot.length >= MAXT)
      return `<p class="muted">${MAXT} sets are chosen, the most that can be compared. Remove one to add another.</p>`;
    const w = q.trim().toLowerCase(),
      g = UIP.group,
      all = [...specials(), ...termPool()].filter((t) => !S.ot.includes(t.id) && (!g || t.group === g));
    let hit;
    if (w)
      hit = all
        .filter(
          (t) =>
            t.label.toLowerCase().includes(w) ||
            (t.ref || '').toLowerCase().includes(w) ||
            (!g && t.group.toLowerCase().includes(w))
        )
        .map((t, i) => [
          t,
          i,
          t.label.toLowerCase() === w || (t.ref || '').toLowerCase() === w
            ? 0
            : t.label.toLowerCase().startsWith(w)
              ? 1
              : t.label.toLowerCase().includes(w)
                ? 2
                : 3,
        ])
        .sort((x, y) => x[2] - y[2] || x[1] - y[1])
        .map((x) => x[0]);
    else if (g) hit = all.slice().sort((x, y) => (y.size || 0) - (x.size || 0));
    else hit = all.filter((t) => ['Selection', 'Readers', 'Enzymes'].includes(t.group));
    if (!hit.length) return `<p class="muted">${w ? 'No set matches.' : 'Pick a source above, or type to search.'}</p>`;
    const shown = hit.slice(0, 40);
    let head0 = '';
    return (
      shown
        .map((t) => {
          const head = t.group !== head0 ? `<p class="ov-grp">${esc((head0 = t.group))}</p>` : '';
          const more = [
            t.ref || '',
            t.size ? `${int(t.size)} ${unitWord('proteins')}` : '',
            t.broad ? 'very broad' : '',
            t.from && (t.from !== t.group || !g) ? t.from : '',
            t.note,
          ]
            .filter(Boolean)
            .join(' · ');
          return `${head}<button type="button" class="ov-opt" role="option" data-ov-add="${esc(t.id)}">${esc(t.label)}${t.tag ? ` <span class="ov-tag">${esc(t.tag)}</span>` : ''}${more ? ` <span class="muted ov-more">${esc(more)}</span>` : ''}</button>`;
        })
        .join('') +
      (hit.length > shown.length ? `<p class="muted">${int(hit.length - shown.length)} more: type to narrow.</p>` : '')
    );
  }
  // what is counted, in words
  const unitNote = (u) =>
    ({
      proteins: `Counts reviewed proteins. A protein is in a set when it is one of the set’s members; the ${W.marked} proteins are those with a ${W.mark}.`,
      sites: `Counts ${W.marks}. A ${W.mark} is in a set when its protein is (or, for a selection, when the ${W.mark} itself is).`,
      readers: 'Counts only reader proteins: those that carry a reader domain family of this site.',
      enzymes: 'Counts only enzyme proteins: those of the site’s writer and eraser classes.',
    })[u];
  // which question is asked: the one the reader chose; else the overlap of two sets (a), or the regions of more (b)
  const question = (res) => (S.oq === 'a' || S.oq === 'b' ? S.oq : res && res.nT === 2 ? 'a' : 'b');
  const questionTitle = (res) => {
    const uw = unitWord(res.unit);
    return question(res) === 'a'
      ? `Do these sets share more ${uw} than chance?`
      : res.unit === 'sites'
        ? `Do the ${uw} in each region stand out?`
        : `Are the ${uw} in each region ${W.marked} more often?`;
  };
  function controls(res) {
    const u =
        C.units.length > 1
          ? `<div class="ov-unit" role="group" aria-label="What is counted">${C.units.map((x) => `<button type="button" class="btn small${S.ou === x ? ' on' : ''}" aria-pressed="${S.ou === x}" data-ov-unit="${x}">${UNITS[x]}</button>`).join('')}</div>` +
            `<p class="ov-unitnote muted">${esc(unitNote(S.ou))}</p>`
          : '',
      q = question(res),
      uw = unitWord(S.ou),
      qs =
        S.ou === 'sites'
          ? [
              ['a', `Do these sets share more ${uw} than chance?`, `Overlap of the sets themselves, pair by pair.`],
              [
                'b',
                `Do the ${uw} in each region stand out?`,
                `Each region’s ${uw} against the other residues of the proteins with ${W.marks}.`,
              ],
            ]
          : [
              ['a', `Do these sets share more ${uw} than chance?`, `Overlap of the sets themselves, pair by pair.`],
              [
                'b',
                `Are the ${uw} in each region ${W.marked} more often?`,
                `Each region’s ${W.marked} share against all reviewed proteins.`,
              ],
            ];
    return (
      `<div class="ov-ctl">${u}</div>` +
      `<div class="ov-qs" role="radiogroup" aria-label="Question">${qs
        .map(
          ([k, t, sub]) =>
            `<button type="button" class="ov-qbtn${q === k ? ' on' : ''}" role="radio" aria-checked="${q === k}" data-ov-q="${k}"><b>${esc(t)}</b><span>${esc(sub)}</span></button>`
        )
        .join('')}</div>`
    );
  }
  // the answer in a sentence, from the terms and the result
  const joinNames = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  // "Proteins in both sets", "Proteins only in B", "Proteins in A and B but not C"
  const regionPhrase = (res, m, noun) => {
    const inn = res.ts.filter((_, i) => m & (1 << i)).map((t) => t.label),
      out = res.ts.filter((_, i) => !(m & (1 << i))).map((t) => t.label);
    if (inn.length === res.nT) return `${noun} in ${res.nT === 2 ? 'both sets' : `all ${res.nT} sets`}`;
    return inn.length === 1 ? `${noun} only in ${inn[0]}` : `${noun} in ${joinNames(inn)} but not ${joinNames(out)}`;
  };
  const sigUp = (r) => r.q != null && r.q <= PADJ && r.fold != null && r.fold >= MIN_EFF;
  function answerText(res, q, bare = false) {
    const uw = unitWord(res.unit),
      names = joinNames(res.ts.map((t) => t.label)),
      pre = bare ? '' : `${names}: `,
      L = (i) => LETTERS[i],
      fq1 = (v) => (v == null ? '' : K.fq(v)),
      f1 = (v) => (v >= 10 ? Math.round(v) : v.toFixed(1)) + '×';
    if (q === 'a') {
      const fam = res.pairs?.all || res.pairs?.marked;
      if (!fam || !fam.length) return `${pre}no pair can be tested.`;
      const tested = fam.filter((r) => r.q != null),
        best = (tested.length ? tested : fam).slice().sort((x, y) => (x.q ?? 1) - (y.q ?? 1) || y.a - x.a)[0],
        up = fam.filter(sigUp).length,
        pairName = `${L(best.i)} and ${L(best.j)}`,
        sentence = (r, where) =>
          (r.a === 0
            ? `No ${uw.replace(/s$/, '')} is in both ${L(r.i)} and ${L(r.j)}${where}`
            : `${int(r.a)} ${r.a === 1 ? uw.replace(/s$/, '') : uw} ${r.a === 1 ? 'is' : 'are'} in both ${L(r.i)} and ${L(r.j)}${where}`) +
          (r.expected != null && !Number.isNaN(r.expected) && r.a > 0
            ? sigUp(r)
              ? `, ${f1(r.fold)} more than the ${r.expected < 10 ? r.expected.toFixed(1) : int(Math.round(r.expected))} expected by chance (q ${fq1(r.q)})`
              : `; ${r.expected < 10 ? r.expected.toFixed(1) : int(Math.round(r.expected))} would be expected by chance, so this is not more than chance (q ${fq1(r.q)})`
            : '');
      let out = pre;
      if (res.nT > 2) out += `${up} of ${fam.length} pairs share more ${uw} than chance. The clearest, ${pairName}: `;
      out += sentence(best, '') + '.';
      const m =
        res.pairs?.all && res.pairs?.marked ? res.pairs.marked.find((r) => r.i === best.i && r.j === best.j) : null;
      if (m && res.unit !== 'sites' && m.a > 0)
        out += ` Among the ${W.marked} proteins alone: ${int(m.a)} shared, ${m.fold != null ? f1(m.fold) : '–'} the expected overlap (q ${fq1(m.q)}).`;
      return out;
    }
    // question b
    const fd = figData(res),
      full = (1 << res.nT) - 1;
    if (!res.test)
      return `${pre}${res.circ?.length ? `${joinNames(res.circ)} ${res.circ.length === 1 ? 'is' : 'are'} defined by having sites, so the regions are not tested for it (that would be circular). The first question can still be asked.` : res.partial ? 'only the proteins with sites are known for these sets, so no test is made.' : 'the regions can only be counted here, not tested.'}`;
    const pick =
      fd.regs.find((r) => r.m === full && isTested(r)) || fd.regs.filter(isTested).sort((x, y) => x.q - y.q)[0];
    if (!pick) return `${pre}no region has enough ${uw} to test.`;
    const d = dirOf(pick, fd.base, fd.sitesU),
      noun = res.unit === 'sites' ? cap(W.marks) : cap(uw),
      lead = regionPhrase(res, pick.m, noun);
    if (fd.sitesU) {
      const or = pick.or ?? pick.fold;
      return `${pre}${lead} ${d === 'ns' ? 'do not clearly differ from the other residues' : `stand out from the other residues: ${d === 'more' ? 'higher' : 'lower'} odds`} (OR ${or >= 10 ? Math.round(or) : or.toFixed(1)}, q ${fq1(pick.q)}).`;
    }
    const sh = (v) => `${Math.round(v * 100)}%`;
    return `${pre}${lead} are ${W.marked} ${d === 'more' ? 'more often than' : d === 'less' ? 'less often than' : 'about as often as'} proteins in general (${sh(pick.k / pick.n)} vs ${sh(fd.base)}${d === 'ns' ? `; not a clear difference, q ${fq1(pick.q)}` : `; q ${fq1(pick.q)}`}).`;
  }
  let loadedFor = '';
  function view() {
    loadSources();
    const key = JSON.stringify([S.ot, S.ou, !!K.sel.peek()]);
    const head =
      trail +
      `<div class="page-head"><h2>Overlap</h2></div><p class="page-sub">Compare 2 to ${MAXT} sets of proteins: how many they share, and whether the shared proteins are ${W.marked} more often. <a href="${esc(K.link('method', 'overlap'))}">Methods</a></p>`;
    if (S.ot.length < 2) {
      RES = null;
      return head + pickerHtml();
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
          : '<p class="muted" role="status">Reading the sets…</p>')
      );
    }
    const res = RES.res;
    if (res.missing?.length)
      return (
        head +
        pickerHtml() +
        `<p class="ov-warn" role="alert">Not available here: ${esc(res.missing.map((id) => termLabel(id)).join('; '))}. ${res.missing.some((id) => id.startsWith('sv:')) ? 'A saved selection stays in the browser that saved it, so a link cannot carry it. ' : 'It is not in this dataset. '}Remove it to compare the others; the letters of the other sets stay as they are.</p>`
      );
    const q = question(res);
    return (
      head +
      pickerHtml() +
      controls(res) +
      `<p class="ov-answer" role="status">${esc(answerText(res, q))}</p>` +
      `<div id="ov-fig" class="ov-figwrap"></div>` +
      `<div class="exp-row">${K.expBar(['svg', 'png', 'tsv'], 'ovexp', 'the overlap figure', '').replace(/<\/div>$/, '<button type="button" class="exp-btn" data-ovexp="png-paper" title="PNG for a journal column: 180 mm wide at 300 dpi">PNG, 180 mm</button><button type="button" class="exp-btn" data-ovexp="svg-paper" title="SVG for a journal column: 180 mm wide">SVG, 180 mm</button></div>')}</div>` +
      regionHtml(res) +
      '<h3>Table</h3>' +
      (q === 'a' ? pairTableHtml(res) : tableHtml(res))
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
      title: questionTitle(res),
      sub: `${res.ts.map((t, i) => `${LETTERS[i]} ${t.label}`).join('; ')}. ${answerText(res, question(res), true)}`,
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
  // the overlap test as a table: one row per pair and universe
  function tsvPairs(res) {
    const g = (v) => (v == null || Number.isNaN(v) ? '' : K.g6(v));
    const rows = ['all', 'marked'].flatMap((u) =>
      (res.pairs?.[u] || []).map((r) =>
        [
          `${LETTERS[r.i]} and ${LETTERS[r.j]}`,
          `${res.ts[r.i].label}; ${res.ts[r.j].label}`,
          universeLabel(res, u),
          r.n,
          r.m,
          r.a,
          r.N,
          g(r.expected),
          g(r.fold),
          g(r.p),
          g(r.q),
        ].join('\t')
      )
    );
    return (
      K.preamble(
        'overlap of sets against chance',
        `${res.ts.map((t, i) => `${LETTERS[i]} = ${t.label}`).join('; ')}; unit ${res.unit}. For each pair: one-sided hypergeometric test of the shared ${unitWord(res.unit)} against two random sets of the same sizes drawn from those counted (expected = n × m / N; fold = shared / expected; q: Benjamini–Hochberg across the pairs of each group).${citeFor(res.ts.map((t) => t.id)) ? ` ${citeFor(res.ts.map((t) => t.id))}` : ''}`
      ) +
      ['pair', 'sets', 'among', 'in_first', 'in_second', 'in_both', 'counted', 'expected', 'fold', 'p', 'q'].join(
        '\t'
      ) +
      '\n' +
      rows.join('\n') +
      '\n'
    );
  }
  function tsv(res = RES.res) {
    if (question(res) === 'a') return tsvPairs(res);
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
          ? [name, words, r.n, r.proteins ?? '', g(r.or ?? r.fold), g(ci[0]), g(ci[1]), g(r.p), g(r.q), t]
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
      K.preamble('overlap region', `${orTitle(res, k).words}; unit ${res.unit}`) +
      `accession\tgene\t${res.unit === 'sites' ? 'position\t' : ''}has_sites\n` +
      regionItems(res, k)
        .map((x) =>
          [
            x.acc,
            x.pi != null ? D.proteins[x.pi][1] || '' : x.gene || '',
            ...(res.unit === 'sites' ? [x.pos ?? ''] : []),
            x.pi != null ? 'yes' : 'no',
          ].join('\t')
        )
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
    if (e.target.id !== 'ov-q') return;
    UIP.q = e.target.value;
    document.getElementById('ov-res').innerHTML = resultsHtml(UIP.q);
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
    ['[data-ov-q]', (el) => set({ oq: el.dataset.ovQ, or: '' })],
    [
      '[data-ov-group]',
      (el) => {
        UIP.group = el.dataset.ovGroup;
        K.render();
      },
    ],
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
        const res = RES.res,
          accs = [
            ...new Set(
              regionItems(res, S.or)
                .filter((x) => x.pi != null)
                .map((x) => x.acc)
            ),
          ];
        if (!accs.length || accs.length > SELMAX) return;
        const t = orTitle(res, S.or),
          q = accs.join(' ');
        // the pill is named after the region; the address keeps the sets and the region (t, or), so Back returns to them
        K.go('overview', {
          q,
          f: {},
          qn: {
            q,
            cat: 'Overlap',
            name: `${cap(res.unit === 'sites' ? W.marks : unitWord(res.unit))} ${t.words.startsWith('in ') ? t.words : `in ${t.words}`}`,
          },
        });
      },
    ],
    [
      '[data-ov-list]',
      () =>
        K.download(`${D.site.id || 'site'}_overlap_region.tsv`, listTsv(RES.res, S.or), 'text/tab-separated-values'),
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
  K.views.overlap = {
    render: view,
    title: () => 'Overlap',
    offNote:
      'Not filtered by your selection: this page compares the sets chosen on it. Add “The current selection” as a set to compare it.',
  };
  K.tabs.push(() => ['overlap', 'Overlap', null]);
  (K.methodParts ||= []).push(
    () =>
      `<section id="m-overlap"><h3>Overlap</h3><p>The Overlap page compares two to four sets: the sets of the protein-set questions, reader families, enzymes, ` +
      `the selection or a list of genes. It answers two questions, and the reader chooses which.</p>` +
      `<p><b>Do these sets share more proteins than chance?</b> For each pair of sets, the proteins in both are counted and compared with the number ` +
      `two random sets of the same sizes would share: expected = n × m / N, where n and m are the sizes of the two sets and N the proteins counted; ` +
      `fold = shared / expected. The p value is one-sided: the chance of this many or more in both, from the hypergeometric distribution ` +
      `(the test of the protein-set questions, applied to the sets themselves); q is Benjamini–Hochberg across the pairs of one comparison group. ` +
      `There are two comparison groups: every reviewed protein (N = ${(C.n || 0).toLocaleString('en')}), and the ${esc(W.marked)} proteins alone (the proteins with a ${esc(W.mark)}). ` +
      `For ${esc(W.marks)}, the group is all ${esc(W.marks)}; for readers or enzymes, the group is those proteins.</p>` +
      `<p><b>Are the proteins in each region ${esc(W.marked)} more often?</b> A region holds the proteins in exactly one combination of sets. ` +
      `A one-sided hypergeometric test compares the region’s ${esc(W.marked)} proteins with all reviewed proteins, as the protein-set questions do ` +
      `(fold = share ${esc(W.marked)} in the region / share among all reviewed proteins; q is Benjamini–Hochberg across the regions shown; ` +
      `a region of fewer than 5 is counted, not tested). A bar is filled when q ≤ 0.05 and the effect is at least 1.1×. ` +
      `For ${esc(W.marks)}, a pooled Fisher’s exact test of the residues of proteins with ${esc(W.marks)} compares the ${esc(W.marks)} in a region with the other residues, ` +
      `when every set describes proteins. Computed in your browser. Reader families: ${
        (C.families?.readers || []).map((f) => `${esc(f.name)} (${(f.ids || []).map(esc).join(', ')})`).join('; ') ||
        'none'
      }; a protein is a reader when it carries any of a family’s Pfam or InterPro entries.${(C.sources || []).map((src) => ` ${esc(src.title)}: ${src.n.toLocaleString('en')} sets; ${src.cite?.length ? 'cite ' + src.cite.map(esc).join('; ') : ''}.`).join('')}</p></section>`
  );
  K.overlap = {
    tableHtml,
    pairTableHtml,
    answerText,
    exportBody,
    core: {
      overlapPairs,
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
