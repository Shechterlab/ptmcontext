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
    S.ov = ['venn', 'upset'].includes(p.get('ov')) ? p.get('ov') : 'auto';
    S.or = /^\d+$/.test(p.get('or') || '') ? p.get('or') : '';
  });
  K.paramsOut.push((p) => {
    if (S.view !== 'overlap') return;
    if (S.ot.length) p.set('t', S.ot.map(encodeURIComponent).join(','));
    if (S.ou !== 'proteins') p.set('ou', S.ou);
    if (S.ov !== 'auto') p.set('ov', S.ov);
    if (S.or) p.set('or', S.or);
  });

  // ---- terms --------------------------------------------------------------------------------------------------------------
  const sets = (C.terms_from || []).filter((a) => A[a]?.kind === 'protein_sets');
  const classQs = (C.terms_from || []).filter((a) => A[a] && A[a].kind !== 'protein_sets');
  const labelCache = {};
  const rowsOf = (aid) =>
    (labelCache[aid] ||= (
      A[aid]?.kind === 'protein_sets' ? K.rowsFor(A[aid], 'enricher') : K.rowsFor(A[aid], 'mantel_haenszel') || []
    ).map((r) => ({ id: r.category, label: F.row_labels?.[aid]?.[r.category] || r.label || r.category })));
  const uniq = (rows) => [...new Map(rows.map((r) => [r.id, r])).values()];
  const short = (aid) => F.short?.[aid] || A[aid]?.title || aid;
  const savedList = () => (K.sel.savedList ? K.sel.savedList() : []);
  // every term the picker can offer, built when first asked
  let pool = null;
  function termPool() {
    if (pool) return pool;
    pool = [];
    sets.forEach((aid) =>
      uniq(rowsOf(aid)).forEach((r) => pool.push({ id: `s:${aid}:${r.id}`, label: r.label, group: short(aid) }))
    );
    classQs.forEach((aid) =>
      uniq(rowsOf(aid)).forEach((r) => pool.push({ id: `c:${aid}:${r.id}`, label: r.label, group: short(aid) }))
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
  async function compute(ids, unit) {
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
        bhAll(tests);
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
        bhAll(res.rows.filter((r) => r.mask && r.n));
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
        bhAll(res.totals);
      }
    }
    res.rows[0].outside = true; // the proteins in none of the terms: counted, not shown as a region
    res.mask = mask;
    res.elems = elems;
    res.marked = marked;
    return res;
  }

  // ---- drawing ---------------------------------------------------------------------------------------------------------------
  const lens = (r1, r2, d) => {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
    const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)),
      b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
    return a + b - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  };
  function distance(r1, r2, area) {
    let lo = Math.abs(r1 - r2),
      hi = r1 + r2;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (lens(r1, r2, mid) > area) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  // circles for two or three terms: areas proportional to the sizes; the overlaps of pairs set the distances (for three
  // terms the triple overlap follows from them, and is only approximate)
  function circles(res) {
    const n = res.ts.map((t, i) => res.rows.reduce((s, r) => s + (r.mask & (1 << i) ? r.n : 0), 0)),
      rad = n.map((x) => Math.sqrt(x / Math.PI)),
      pair = (i, j) => res.rows.reduce((s, r) => s + (r.mask & (1 << i) && r.mask & (1 << j) ? r.n : 0), 0),
      d = (i, j) => (rad[i] && rad[j] ? distance(rad[i], rad[j], pair(i, j)) : rad[i] + rad[j]);
    const pos = [[0, 0]];
    pos.push([d(0, 1), 0]);
    if (res.nT === 3) {
      const d12 = d(0, 1),
        d13 = d(0, 2),
        d23 = d(1, 2),
        x = d12 ? (d13 * d13 - d23 * d23 + d12 * d12) / (2 * d12) : 0;
      pos.push([x, Math.sqrt(Math.max(0, d13 * d13 - x * x))]);
    }
    return { rad, pos, n };
  }
  const regionLetters = (mask, nT) =>
    [...Array(nT).keys()]
      .filter((i) => mask & (1 << i))
      .map((i) => LETTERS[i])
      .join(' + ') +
    ([...Array(nT).keys()].filter((i) => !(mask & (1 << i))).length
      ? ` (not ${[...Array(nT).keys()]
          .filter((i) => !(mask & (1 << i)))
          .map((i) => LETTERS[i])
          .join(', ')})`
      : '');
  const regionWords = (res, k) => regionLetters(k, res.nT).replace(/[A-D]/g, (c) => res.ts[LETTERS.indexOf(c)].label);
  const PAGE = {
    c: (i) => `var(--ov${i + 1})`,
    ink: 'var(--ink)',
    muted: 'var(--muted)',
    line: 'var(--line-strong)',
    bg: 'var(--surface)',
    page: true,
  };
  const EXPORT = { c: (i) => LIGHT[i], ink: '#111827', muted: '#5f6f78', line: '#c7d4d9', bg: '#ffffff', page: false };
  const label = (st, x, y, text, k, w = 34) =>
    (st.page
      ? `<g data-ov-reg="${k}" role="button" tabindex="0" aria-label="${esc(`${text}: open this region`)}" class="ov-reg${String(S.or) === String(k) ? ' on' : ''}">`
      : '<g>') +
    `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - 9).toFixed(1)}" width="${w}" height="18" rx="9" fill="${st.bg}" fill-opacity=".86" stroke="${st.line}"/>` +
    `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="${st.ink}">${esc(text)}</text></g>`;
  function drawVenn(res, st) {
    const { rad, pos } = circles(res),
      Wd = 340,
      pad = 8;
    const xs = pos.flatMap(([x], i) => [x - rad[i], x + rad[i]]),
      ys = pos.flatMap(([, y], i) => [y - rad[i], y + rad[i]]),
      x0 = Math.min(...xs),
      y0 = Math.min(...ys),
      sc = Math.min((Wd - 2 * pad) / (Math.max(...xs) - x0 || 1), 260 / (Math.max(...ys) - y0 || 1)),
      H = Math.ceil((Math.max(...ys) - y0) * sc + 2 * pad),
      px = (x) => (x - x0) * sc + pad,
      py = (y) => (y - y0) * sc + pad;
    const g = [];
    res.ts.forEach((t, i) => {
      if (!rad[i]) return;
      g.push(
        `<circle cx="${px(pos[i][0]).toFixed(1)}" cy="${py(pos[i][1]).toFixed(1)}" r="${(rad[i] * sc).toFixed(1)}" fill="${st.c(i)}" fill-opacity=".28" stroke="${st.c(i)}" stroke-width="2"/>`
      );
    });
    // the label of a region sits at the centre of the points of the plane that are in it (and in no other)
    const acc = new Map();
    for (let y = pad; y < H - pad; y += 3)
      for (let x = pad; x < Wd - pad; x += 3) {
        let m = 0;
        for (let i = 0; i < res.nT; i++)
          if (rad[i] && (x - px(pos[i][0])) ** 2 + (y - py(pos[i][1])) ** 2 <= (rad[i] * sc) ** 2) m |= 1 << i;
        if (m) {
          const a = acc.get(m) || [0, 0, 0];
          acc.set(m, [a[0] + x, a[1] + y, a[2] + 1]);
        }
      }
    res.rows.forEach((r) => {
      if (!r.mask || !r.n) return;
      const a = acc.get(r.mask) || [Wd / 2, H / 2, 1];
      g.push(label(st, a[0] / a[2], a[1] / a[2], int(r.n), r.mask, 14 + 7 * String(int(r.n)).length));
    });
    res.ts.forEach((t, i) => {
      if (!rad[i]) return;
      const cx = px(pos[i][0]),
        cy = py(pos[i][1]),
        ang = res.nT === 3 && i === 2 ? Math.PI / 2 : i === 0 ? -2.4 : -0.7;
      g.push(
        `<text x="${(cx + Math.cos(ang) * (rad[i] * sc + 9)).toFixed(1)}" y="${(cy + Math.sin(ang) * (rad[i] * sc + 9) + 4).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="${st.c(i)}">${LETTERS[i]}</text>`
      );
    });
    return { svg: g.join(''), w: Wd, h: H };
  }
  function drawUpset(res, st) {
    const rows = res.rows.filter((r) => r.mask && r.n).sort((a, b) => b.n - a.n || a.mask - b.mask),
      Wd = 340,
      rh = 24,
      x0 = 16,
      bx = x0 + res.nT * 20 + 8,
      bw = Wd - bx - 56,
      max = Math.max(1, ...rows.map((r) => r.n)),
      g = [];
    rows.forEach((r, j) => {
      const y = 12 + j * rh,
        on = [...Array(res.nT).keys()].filter((i) => r.mask & (1 << i));
      if (on.length > 1)
        g.push(
          `<line x1="${x0 + on[0] * 20}" x2="${x0 + on[on.length - 1] * 20}" y1="${y}" y2="${y}" stroke="${st.ink}" stroke-width="2"/>`
        );
      for (let i = 0; i < res.nT; i++)
        g.push(
          r.mask & (1 << i)
            ? `<circle cx="${x0 + i * 20}" cy="${y}" r="6" fill="${st.c(i)}" stroke="${st.ink}" stroke-width="1"/>`
            : `<circle cx="${x0 + i * 20}" cy="${y}" r="4" fill="${st.line}"/>`
        );
      const col = on.length === 1 ? st.c(on[0]) : st.ink;
      const body =
        `<rect x="${bx}" y="${y - 8}" width="${Math.max(2, (r.n / max) * bw).toFixed(1)}" height="16" fill="${col}" fill-opacity="${on.length === 1 ? 0.85 : 0.6}" stroke="${col}"/>` +
        `<text x="${(bx + Math.max(2, (r.n / max) * bw) + 4).toFixed(1)}" y="${y + 4}" font-size="11" fill="${st.ink}">${int(r.n)}</text>`;
      g.push(
        st.page
          ? `<g data-ov-reg="${r.mask}" role="button" tabindex="0" aria-label="${esc(regionLetters(r.mask, res.nT) + ': ' + int(r.n) + ' ' + unitWord(res.unit))}" class="ov-reg${String(S.or) === String(r.mask) ? ' on' : ''}"><rect x="0" y="${y - 12}" width="${Wd}" height="${rh}" fill="transparent"/>${body}</g>`
          : body
      );
    });
    return { svg: g.join(''), w: Wd, h: 12 + rows.length * rh };
  }
  const unitWord = (u) => ({ proteins: 'proteins', sites: 'sites', enzymes: 'enzymes', readers: 'readers' })[u];
  const useVenn = (res) => (S.ov === 'venn' || (S.ov === 'auto' && res.nT <= 3)) && res.nT <= 3;
  const draw = (res, st) => (useVenn(res) ? drawVenn(res, st) : drawUpset(res, st));

  // ---- the page ---------------------------------------------------------------------------------------------------------------
  const trail = `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <b>Overlap</b></p>`;
  const fn = (v) => (v == null ? '–' : K.fx(v));
  const SWATCH = (i) => `<span class="ov-sw" style="background:var(--ov${i + 1})" aria-hidden="true"></span>`;
  const TESTS = {
    proteins:
      'One-sided hypergeometric test (as the protein-set questions): the region’s proteins with sites against all reviewed proteins; fold = share with sites in the region / share with sites among all reviewed proteins; q is Benjamini–Hochberg across the regions shown.',
    sites:
      'Fisher’s exact test (pooled, as the residue questions’ “across all proteins” rows) of the residues of the proteins with sites: the share that are sites in the region against outside it; q is Benjamini–Hochberg across the regions shown.',
  };
  function tableHtml(res) {
    const sites = res.unit === 'sites',
      rows = res.rows.filter((r) => r.mask && r.n).sort((a, b) => b.n - a.n);
    const t = res.test;
    const head = sites
      ? `<th scope="col">Region</th><th scope="col" class="num">Sites</th><th scope="col" class="num">Proteins</th>` +
        (t
          ? `<th scope="col" class="num" title="${esc(TESTS.sites)}">Fold</th><th scope="col" class="num" title="${esc(TESTS.sites)}">p</th><th scope="col" class="num">q</th>`
          : '')
      : `<th scope="col">Region</th><th scope="col" class="num">${esc(cap(unitWord(res.unit)))}</th><th scope="col" class="num">With sites</th>` +
        `<th scope="col" class="num">Share with sites</th>` +
        (t
          ? `<th scope="col" class="num" title="${esc(TESTS.proteins)}">Fold</th><th scope="col" class="num" title="${esc(TESTS.proteins)}">p</th><th scope="col" class="num">q</th>`
          : '') +
        `<th scope="col" class="num">Sites</th>`;
    const body = (r, name, attrs = '') =>
      sites
        ? `<tr${attrs}><th scope="row">${name}</th><td class="num">${int(r.n)}</td><td class="num">${int(r.proteins ?? 0)}</td>` +
          (t
            ? `<td class="num">${r.p == null ? '–' : fn(r.fold)}</td><td class="num">${r.p == null ? '–' : K.fq(r.p)}</td><td class="num">${r.q == null ? '–' : K.fq(r.q)}</td>`
            : '') +
          '</tr>'
        : `<tr${attrs}><th scope="row">${name}</th><td class="num">${int(r.n)}</td><td class="num">${int(r.k)}</td>` +
          `<td class="num">${r.n ? `${((100 * r.k) / r.n).toFixed(1)}%` : '–'}</td>` +
          (t
            ? `<td class="num">${fn(r.fold)}</td><td class="num">${r.p == null ? '–' : K.fq(r.p)}</td><td class="num">${r.q == null ? '–' : K.fq(r.q)}</td>`
            : '') +
          `<td class="num">${int(r.sites ?? 0)}</td></tr>`;
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
  function legendHtml(res) {
    return `<ul class="ov-legend">${res.ts
      .map(
        (t, i) =>
          `<li>${SWATCH(i)}<b>${LETTERS[i]}</b> ${esc(t.label)} <span class="muted">${int(t.n)} proteins</span></li>`
      )
      .join('')}</ul>`;
  }
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
      `<label class="flabel" for="ov-q">Add a term (${int(termPool().length)}: ${esc([...new Set(termPool().map((t) => t.group))].slice(0, 4).join(', '))}…)</label>` +
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
        ? all.filter((t) => t.label.toLowerCase().includes(w) || t.group.toLowerCase().includes(w))
        : all.filter((t) => t.group === 'Selections' || t.group === 'Readers' || t.group === 'Enzymes')
    ).slice(0, 40);
    if (!hit.length) return `<p class="muted">${w ? 'No term matches.' : 'Type to search.'}</p>`;
    let g = '';
    return hit
      .map((t) => {
        const head = t.group !== g ? `<p class="ov-grp">${esc((g = t.group))}</p>` : '';
        return `${head}<button type="button" class="ov-opt" role="option" data-ov-add="${esc(t.id)}">${esc(t.label)}</button>`;
      })
      .join('');
  }
  function controls(res) {
    const u =
      C.units.length > 1
        ? `<div class="ov-unit" role="group" aria-label="What is overlapped">${C.units.map((x) => `<button type="button" class="btn small${S.ou === x ? ' on' : ''}" aria-pressed="${S.ou === x}" data-ov-unit="${x}">${UNITS[x]}</button>`).join('')}</div>`
        : '';
    const v =
      res && res.nT >= 2
        ? `<div class="ov-unit" role="group" aria-label="Display">${[
            ['venn', 'Diagram'],
            ['upset', 'Bars'],
          ]
            .map(
              ([k, t]) =>
                `<button type="button" class="btn small${(useVenn(res) ? 'venn' : 'upset') === k ? ' on' : ''}" aria-pressed="${(useVenn(res) ? 'venn' : 'upset') === k}" data-ov-view="${k}"${k === 'venn' && res.nT > 3 ? ' disabled' : ''}>${t}</button>`
            )
            .join('')}</div>`
        : '';
    return `<div class="ov-ctl">${u}${v}</div>`;
  }
  let loadedFor = '';
  function view() {
    const key = JSON.stringify([S.ot, S.ou, !!K.sel.peek()]);
    const head =
      trail +
      `<div class="page-head"><h2>Overlap</h2></div><p class="page-sub">Choose two to ${MAXT} terms. See which ${unitWord(S.ou)} they share, and whether the ${S.ou === 'sites' ? 'sites' : `${W.marked} proteins`} in each region are more or fewer than expected.</p>`;
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
    const d = draw(res, PAGE);
    const note =
      (res.partial
        ? '<p class="gl-note">Only the proteins with sites are known for these terms here, so no test is made.</p>'
        : '') +
      (res.unit === 'sites' && !res.test
        ? `<p class="gl-note">No test: ${res.partial ? 'the sets of every protein are not in this copy' : 'a term is a property of sites, and the comparison residues are not known for several features at once'}. Counts only.</p>`
        : '') +
      (res.unit === 'sites' && res.test ? `<p class="gl-note">${esc(TESTS.sites)}</p>` : '') +
      (res.unit !== 'sites' && res.test
        ? `<p class="gl-note">${esc(TESTS.proteins)} ${int(res.M)} of ${int(res.N)} reviewed proteins (${((100 * res.M) / res.N).toFixed(1)}%) have sites.${res.unit !== 'proteins' ? ` The ${unitWord(res.unit)} are those of the site’s own definitions; the test is still against all reviewed proteins.` : ''}</p>`
        : '') +
      (useVenn(res) && res.nT === 3
        ? '<p class="muted">Circle areas are proportional to the sizes; the triple overlap is approximate. The table has the exact counts.</p>'
        : '');
    return (
      head +
      pickerHtml() +
      controls(res) +
      legendHtml(res) +
      `<figure class="ov-fig"><div class="ov-svg" id="ov-fig"><svg viewBox="0 0 ${d.w} ${d.h}" width="100%" role="img" aria-label="${esc(`Overlap of ${res.ts.map((t) => t.label).join(', ')}; the table below has the counts`)}" font-family="inherit">${d.svg}</svg></div></figure>` +
      `<div class="exp-row">${K.expBar(['svg', 'png', 'tsv'], 'ovexp', 'the overlap figure', '')}</div>` +
      note +
      regionHtml(res) +
      '<h3>Table</h3>' +
      tableHtml(res)
    );
  }

  // ---- export ----------------------------------------------------------------------------------------------------------------
  function figure() {
    const res = RES.res,
      d = draw(res, EXPORT);
    const sub = `Overlap of ${res.ts.map((t, i) => `${LETTERS[i]} ${t.label} (${int(t.n)} proteins)`).join('; ')}. Unit: ${unitWord(res.unit)}.`;
    const note = res.test ? (res.unit === 'sites' ? TESTS.sites : TESTS.proteins) : 'Counts only; no test.';
    return K.figureFrame({
      title: `Overlap of ${res.nT} terms`,
      sub,
      legend: res.ts.map((t, i) => [EXPORT.c(i), EXPORT.c(i), `${LETTERS[i]} ${t.label}`]),
      body: d.svg,
      bodyH: d.h,
      note,
      extra: { terms: S.ot, unit: res.unit },
    });
  }
  function tsv(res = RES.res) {
    const sites = res.unit === 'sites',
      rows = res.rows.filter((r) => r.mask && r.n).sort((a, b) => b.n - a.n);
    const head = sites
      ? ['region', 'terms', 'sites', 'proteins', 'fold', 'p', 'q']
      : ['region', 'terms', res.unit, 'with_sites', 'share_with_sites', 'fold', 'p', 'q', 'sites'];
    const g = (v) => (v == null ? '' : K.g6(v));
    const line = (r, name, words) =>
      (sites
        ? [name, words, r.n, r.proteins ?? '', g(r.fold), g(r.p), g(r.q)]
        : [name, words, r.n, r.k, r.n ? g(r.k / r.n) : '', g(r.fold), g(r.p), g(r.q), r.sites ?? '']
      ).join('\t');
    return (
      K.preamble(
        'overlap of terms',
        `${res.ts.map((t, i) => `${LETTERS[i]} = ${t.label}`).join('; ')}; unit ${res.unit}. ${res.test ? (sites ? TESTS.sites : TESTS.proteins) : 'Counts only; no test.'}${res.N ? ` ${res.M} of ${res.N} reviewed proteins have sites.` : ''}`
      ) +
      head.join('\t') +
      '\n' +
      rows.map((r) => line(r, regionLetters(r.mask, res.nT), regionWords(res, r.mask))).join('\n') +
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
    ['[data-ov-view]', (el) => set({ ov: el.dataset.ovView })],
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
      (btn) => K.exportFigure(btn.dataset.ovexp, figure, `${D.site.id || 'site'}_overlap`, btn, () => tsv()),
    ],
    ['[data-ov-compare]', (el) => K.go('overlap', { ot: [el.dataset.ovCompare], ou: 'proteins', or: '', ov: 'auto' })]
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
      }; a protein is a reader when it carries any of a family’s Pfam or InterPro entries.</p></section>`
  );
  K.overlap = {
    core: { regions, proteinTest, siteTest, bhAll, lens, distance },
    resolve,
    compute,
    tsv,
    DATA,
    termPool,
    regionLetters,
  };
});
