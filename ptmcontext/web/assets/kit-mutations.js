/* The Disease variants page (#mutations): views of the sites of the current selection (the whole site list when nothing
   is selected, a site set or any search or filter otherwise), from the release's frequency tables (data/wf.json, data/onco.json,
   data/gn.json, data/cv.json; ptmcontext/web/propensity.py writes them, read when the page opens):
     ranked      three short tables, each the sites with q < 0.05 ranked by p: more changes than expected in tumors and in cell
                 lines (upper tail), fewer inherited variants than expected (gnomAD, lower tail). The default view (mv=ranked).
     oncoprint   Cancer: tumors (mv=oncoprint): the sites with the most changed samples (rows) against the TCGA tumors that carry
                 them (columns), joined to the sample's burden: coding calls per Mb, with the hypermutated threshold marked.
     clinvar     Inherited disease (mv=clinvar): the sites with a ClinVar pathogenic or likely pathogenic variant (rows) against
                 disease families (columns), a cell the number of variants; the families come from the release's own rules at build time.
     waterfall   (mv=waterfall; "Show all sites as a chart") every site ranked from the most enriched to the most depleted (x) by the signed -log10 p of the release's test (y: up
                 for more than expected, the upper-tail p; down for fewer, the lower-tail p); a gray curve shows the other residues of the
                 same type on the same score, their ranks scaled to the number of sites. p and q are pooled over the cancer types.
                 Labels: the top and bottom sites and the ones the reader adds (wl in the address), placed without overlap.
   Hypermutated samples (more than 10 coding calls per Mb, Campbell et al., Cell 171:1042 (2017)) are left out unless the reader
   puts them back. Frequencies are changed samples over samples profiled in the chosen group (group_denominators). A module of
   the site kit; without website.propensity and its frequency tables it does nothing. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, S, esc, int } = K;
  const PR = D.propensity;
  if (!PR || !PR.wf || !K.prop) return;
  // the sources with a waterfall: those with samples by group, and the germline source whose variants are summed (data/gn.json)
  const SRC = [
    ...PR.sources.filter((s) => s.frequency_source),
    ...(PR.gn ? PR.sources.filter((s) => s.id === PR.gn.source) : []),
  ];
  if (!SRC.length) return;
  const byAcc = Object.fromEntries((D.proteins || []).map((p) => [p[0], p]));

  // ---- the choices (kept in the address: ms source, mg cancer type, mv view, mz zoom, wl the sites labeled on the waterfall; hyper is kit-propensity's) -------------
  const M = {
    src: SRC[0].id,
    group: '',
    view: 'ranked',
    stars: 0,
    cell: '',
    all: {},
    rows: 50,
    zoom: 0,
    chosen: [],
    labels: [],
    genes: [],
    res: {},
    note: '',
  };
  const VIEWS = ['ranked', 'oncoprint', 'clinvar', 'waterfall'];
  const MAX_CHOSEN = 20,
    MAX_LABELS = 20;
  K.paramsIn.push((p) => {
    M.src = SRC.some((s) => s.id === p.get('ms')) ? p.get('ms') : SRC[0].id;
    M.group = p.get('mg') || '';
    // an address from before the views were renamed has no mv, or mv=waterfall; one that carries a waterfall's labels, genes, zoom
    // or source opens the waterfall
    const mv = p.get('mv');
    M.view = VIEWS.includes(mv) ? mv : ['wl', 'wg', 'mz', 'ms'].some((k) => p.has(k)) ? 'waterfall' : 'ranked';
    if (M.view === 'clinvar' && !PR.cv) M.view = 'ranked';
    M.stars = [1, 2].includes(+p.get('mr')) ? +p.get('mr') : 0; // mr: the least ClinVar review stars
    M.zoom = [100, 1000].includes(+p.get('mz')) ? +p.get('mz') : 0;
    // a list of sites (mt: sites chosen for a test; wl: sites labeled on the waterfall), read as K.sel.siteKey reads them
    const list = (v, n) => {
      const out = [];
      (v || '')
        .split(',')
        .map((x) => K.sel.siteKey(x))
        .filter(Boolean)
        .forEach((x) => {
          if (out.length >= n || out.some((o) => o.key === x.key)) return;
          out.push(x);
        });
      return out;
    };
    M.res = {};
    M.chosen = list(p.get('mt'), MAX_CHOSEN).map((x) => {
      if (x.res) M.res[x.key] = x.res;
      return x.key;
    });
    M.labels = list(p.get('wl'), MAX_LABELS).map((x) => x.key);
    M.genes = K.prop.geneWords(p.get('wg')); // wg: the genes highlighted on the waterfall
  });
  const keyOut = (key) => {
    const [acc, pos] = key.split(':'),
      sq = SEQ[acc];
    return `${acc}:${M.res[key] || (sq ? sq[pos - 1] : '') || ''}${pos}`;
  };
  K.paramsOut.push((p) => {
    if (M.chosen.length) p.set('mt', M.chosen.map(keyOut).join(','));
    if (S.view !== 'mutations') return;
    if (M.src !== SRC[0].id) p.set('ms', M.src);
    if (M.group) p.set('mg', M.group);
    // mv is left out for the default view, unless a waterfall's own choices are in the address (they would open the waterfall)
    if (M.view !== 'ranked' || M.labels.length || M.genes.length || M.zoom || M.src !== SRC[0].id) p.set('mv', M.view);
    if (M.stars && M.view === 'clinvar') p.set('mr', String(M.stars));
    if (M.zoom) p.set('mz', String(M.zoom));
    if (M.labels.length) p.set('wl', M.labels.map(keyOut).join(','));
    if (M.genes.length) p.set('wg', M.genes.join(','));
  });
  const sourceOf = () => SRC.find((s) => s.id === M.src) || SRC[0];

  // ---- the data, read when the page opens ---------------------------------------------------------------------------------
  const FILES = {};
  const get = (key, url) =>
    (FILES[key] ||= fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (j) => {
          FILES[key + ':v'] = j;
          if (S.view === 'mutations') K.render();
          return j;
        },
        () => (FILES[key + ':v'] = null)
      ));
  const wfData = () => (get('wf', PR.wf.file), FILES['wf:v']);
  const gnData = () => (get('gn', PR.gn.file), FILES['gn:v']);
  const germ = () => sourceOf().kind === 'germline';
  const ocData = () => (PR.onco ? (get('onco', PR.onco.file), FILES['onco:v']) : null);
  let SITE_IDX = null;
  const siteIdx = (wf) => {
    if (SITE_IDX && SITE_IDX.wf === wf) return SITE_IDX.map;
    const map = new Map();
    for (const [acc, list] of Object.entries(wf.sites)) for (const e of list) map.set(acc + ':' + e[0], e);
    SITE_IDX = { wf, map };
    return map;
  };

  // ---- the sites of the selection: each once (a site counted for several types is one site), with its residue -----------------
  function selSites() {
    const SD = K.sel.data();
    if (!SD) return null;
    const idx = K.sel.active() ? K.sel.compute().marks || [] : null;
    const seen = new Set(),
      out = [];
    const add = (m) => {
      if (!m) return;
      const acc = D.proteins[m[0]][0],
        key = acc + ':' + m[1];
      if (seen.has(key)) return;
      seen.add(key);
      out.push([acc, m[1], (m[4] || '')[7] || '']);
    };
    if (idx) idx.forEach((i) => add(SD.marks[i]));
    else SD.marks.forEach(add);
    return out;
  }
  const siteName = (acc, pos, res) =>
    `${byAcc[acc]?.[1] || acc} ${res || ''}${K.prot?.shownPos ? K.prot.shownPos(acc, pos) : pos}`.replace(/\s+/g, ' ');
  const gname = (g) => g || '(no lineage)';

  // ---- the waterfall's numbers ------------------------------------------------------------------------------------------------
  const hyper = () => K.prop.state.hyper;
  // changed samples of a site in the chosen group and cohort: the entry is [position, residue, per source ([group, changed,
  // changed without hypermutated] triples)]
  function changed(entry, si, gi, hy = hyper()) {
    const a = entry?.[2 + si] || [];
    let m = 0;
    for (let i = 0; i < a.length; i += 3) if (gi === '' || a[i] === gi) m += a[i + (hy ? 1 : 2)];
    return m;
  }
  // the numbers of the known sites with a change, by position, for a source of the frequency file: [position, ...c1, ...c2], each c
  // [O/E, q, k, expected, p of the upper tail, p of the lower tail] (c1 all samples, c2 without hypermutated; left out: the same)
  const STATS = new Map();
  function statOf(wf, id) {
    if (!STATS.has(wf + id)) {
      const map = new Map();
      for (const [acc, list] of Object.entries(wf.stats?.[id] || {}))
        for (const e of list) map.set(acc + ':' + e[0], e);
      STATS.set(wf + id, map);
    }
    return STATS.get(wf + id);
  }
  const ZEROS = new Map();
  function zeroOf(wf, id, cohort) {
    const key = wf.zero?.[id] && id + cohort;
    if (!ZEROS.has(wf + key)) {
      const map = new Map();
      for (const z of wf.zero?.[id]?.[cohort] || []) map.set(z[0] + ':' + z[1], z);
      ZEROS.set(wf + key, map);
    }
    return ZEROS.get(wf + key);
  }
  // most enriched first: by the signed score (a site with no test counts as 0), then by site
  const byScore = (rows) =>
    rows.sort((a, b) => (b.y ?? 0) - (a.y ?? 0) || (a.acc < b.acc ? -1 : a.acc > b.acc ? 1 : a.pos - b.pos));
  function model(s = sourceOf()) {
    const sites = selSites();
    if (!sites) return null;
    if (s.kind === 'germline') {
      // germline: a site's frequency is the sum of its variants' allele frequencies; no groups, no hypermutated samples
      const gn = gnData();
      if (!gn) return null;
      const idx = new Map();
      for (const [acc, list] of Object.entries(gn.sites)) for (const e of list) idx.set(acc + ':' + e[0], e);
      const rows = sites.map(([acc, pos, res]) => {
        const e = idx.get(acc + ':' + pos);
        const r = {
          acc,
          pos,
          res,
          m: e ? e[2] : 0,
          mAll: e ? e[2] : 0,
          f: e ? e[2] : 0,
          k: e ? e[2] : 0,
          af: e ? e[3] : 0,
          o: e ? e[4] : null,
          q: e ? e[5] : null,
          ql: e ? e[6] : null,
          e: e ? e[7] : null,
          pl: e ? e[8] : null,
          pu: e ? e[9] : null,
        };
        r.y = K.prop.signed(r.o, r.pu, r.pl);
        r.hot = K.prop.hotPick(gn.hot?.[acc], res, pos);
        return r;
      });
      byScore(rows);
      const letters = [...new Set(rows.map((r) => r.res).filter((r) => PR.residues.includes(r)))];
      return {
        gn,
        s,
        g: '',
        den: 0,
        rows,
        index: new Map(rows.map((r, i) => [r.acc + ':' + r.pos, i])),
        letters: letters.length ? letters : PR.residues,
        n: rows.length,
        germ: true,
        nFewer: rows.filter((r) => r.ql != null && r.ql < 0.05).length,
        nZeroP: rows.filter((r) => r.f === 0 && r.pl != null && r.pl < 0.05).length,
      };
    }
    const wf = wfData();
    if (!wf) return null;
    const si = PR.sources.filter((x) => x.frequency_source).indexOf(s);
    const g = ''; // p and q are pooled over the cancer types: the waterfall does not follow the cancer type
    const den = wf.all[s.id][hyper() ? 0 : 1];
    const idx = siteIdx(wf),
      st = statOf(wf, s.id),
      zero = zeroOf(wf, s.id, hyper() ? 'all' : 'no_hypermutated');
    const rows = sites.map(([acc, pos, res]) => {
      const key = acc + ':' + pos,
        e = idx.get(key),
        ent = st.get(key),
        c = ent ? (hyper() || ent.length < 8 ? ent.slice(1, 7) : ent.slice(7, 13)) : null,
        z = c ? null : zero.get(key),
        m = changed(e, si, g);
      const r = {
        acc,
        pos,
        res,
        m,
        mAll: changed(e, si, g, true),
        f: den ? m / den : 0,
        k: c ? c[2] : 0,
        kAll: ent ? ent[3] : 0,
        e: c ? c[3] : z ? z[3] : null,
        o: c ? c[0] : z ? 0 : null,
        q: c ? c[1] : null,
        ql: null,
        pu: c ? c[4] : z ? 1 : null,
        pl: c ? c[5] : z ? z[4] : null,
      };
      r.y = K.prop.signed(r.o, r.pu, r.pl);
      r.hot = K.prop.hotPick(wf.hot?.[s.id]?.[hyper() ? 'all' : 'no_hypermutated']?.[acc], res, pos);
      return r;
    });
    byScore(rows);
    const letters = [...new Set(rows.map((r) => r.res).filter((r) => PR.residues.includes(r)))];
    return {
      wf,
      s,
      g,
      den,
      rows,
      index: new Map(rows.map((r, i) => [r.acc + ':' + r.pos, i])),
      letters: letters.length ? letters : PR.residues,
      n: rows.length,
      germ: false,
      lowerOk: !!wf.lower?.[s.id]?.[hyper() ? 0 : 1],
    };
  }
  // the curve of the signed score of the residues that are not sites: the residue types of the selection mixed, as the value at
  // a fraction of the way down the ranking (the twin of propensity.py rank_value for one curve; step between the segments of a mix)
  function backdrop(m) {
    const cohort = hyper() ? 'all' : 'no_hypermutated';
    const segs = [];
    let total = 0;
    for (const res of m.letters) {
      const c = m.germ ? m.gn.bg[res] : m.wf.bg[m.s.id]?.[cohort]?.[res];
      if (!c) continue;
      const [mm, nn, ranks, vals] = c;
      total += nn;
      let prev = 0,
        pv = vals[0];
      ranks.forEach((r, i) => {
        segs.push([i ? (pv + vals[i]) / 2 : vals[0], r - prev]);
        prev = r;
        pv = vals[i];
      });
      if (nn > mm) segs.push([0, nn - mm]);
    }
    segs.sort((a, b) => b[0] - a[0]);
    const cum = [];
    let acc = 0;
    for (const [v, w] of segs) cum.push([(acc += w), v]);
    return (u) => {
      const r = u * total;
      let lo = 0,
        hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid][0] < r) lo = mid + 1;
        else hi = mid;
      }
      return cum.length ? cum[lo][1] : 0;
    };
  }
  // ---- the waterfall's drawing: `c` the colors (the page's tokens, or fixed colors for an export) ----------------------------
  // O/E colors: blue below 1, gray at 1, red above 1, on a log scale that is full at 1/8 and 8 (the dataviz palette's diverging
  // pair; the gray is the palette's neutral). `mix` blends a pole into the gray.
  const hexMix = (a, b, p) => {
    const f = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    return (
      '#' +
      f(a)
        .map((x, k) =>
          Math.round((x * p) / 100 + (f(b)[k] * (100 - p)) / 100)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    );
  };
  const THEME = {
    ink: 'var(--ink)',
    muted: 'var(--muted)',
    line: 'var(--line-strong)',
    site: 'var(--accent)',
    bg: 'var(--ink-2)',
    cap: 'var(--surface)',
    hot: 'var(--wf-hot)',
    cold: 'var(--wf-cold)',
    mid: 'var(--wf-mid)',
    mix: (a, b, p) => `color-mix(in srgb, ${a} ${p}%, ${b})`,
    seq: ['var(--accent)', 'var(--surface)'], // one hue, light to full: the counts of the inherited view
  };
  const LIGHT = {
    ink: '#1f2937',
    muted: '#6b7280',
    line: '#cbd5e1',
    site: '#0f766e',
    bg: '#4b5563',
    cap: '#ffffff',
    hot: '#e34948',
    cold: '#2a78d6',
    mid: '#f0efec',
    mix: hexMix,
    seq: ['#1f5fa8', '#ffffff'],
  };
  const oeFill = (o, c) => {
    if (o == null) return 'none';
    const t = Math.max(-3, Math.min(3, Math.log2(Math.max(o, 1 / 64)))) / 3;
    return c.mix(t >= 0 ? c.hot : c.cold, c.mid, Math.round(Math.abs(t) * 100));
  };
  const RING_Q = 0.05;
  // a frequency or allele frequency in a tooltip
  const afText = (v) =>
    v === 0 ? '0' : v >= 0.01 ? String(+v.toPrecision(2)) : v.toExponential(1).replace('.0e', 'e').replace('e-', 'e−');
  const minus = (v) => String(v).replace('-', '−');
  const niceStep = (range) => {
    const t = Math.max(1, range) / 5,
      e = 10 ** Math.floor(Math.log10(t)),
      f = t / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  };
  const LAST = { m: null, f: null, w: 0, cur: null };
  // the listed genes as the search reads them (names, aliases, isoforms): the accessions, the names it did not find, and the names it read as another
  let GS = { key: null, v: null };
  function geneSet() {
    const key = M.genes.join(',');
    if (GS.key === key) return GS.v;
    const q = K.sel.parse(M.genes.join(' ')),
      accs = new Set();
    [...(q.genes || []), ...(q.sites || []).map((x) => x[0])].forEach(
      (i) => D.proteins[i] && accs.add(D.proteins[i][0])
    );
    const notFound = [...new Set([...(q.absent || []), ...(q.unmatched || []), ...(q.ignored || [])])];
    GS = { key, v: { accs, notFound, via: q.via || [] } };
    return GS.v;
  }
  const geneHits = (m, shown) => (M.genes.length ? K.prop.geneHits(m.rows, geneSet().accs, shown) : null);
  // the labeled sites: the top and bottom of the ranking (3 each end on a phone, 5 otherwise; a site of a protein dominated by its enriched residues is skipped, K.prop.defaultLabels) and the sites the reader added
  const defaultLabels = (m, shown, phone) => K.prop.defaultLabels(m, shown, phone);
  // the waterfall: x = rank from the most enriched site to the most depleted, y = the signed score (up: more than expected,
  // down: fewer). `c` the colors; `o.links` true on the page (labels open the site's card).
  function waterfallSvg(m, c, w, o = {}) {
    const phone = w < 500,
      fs = phone ? 10.5 : 11,
      H = phone ? 330 : 350,
      mt = 14,
      mb = 46,
      mr = phone ? 10 : 16;
    const shown = Math.max(1, Math.min(m.n, M.zoom || m.n)),
      rows = m.rows,
      ys = rows.map((r) => r.y ?? 0);
    const bg = backdrop(m),
      bgAt = (rank) => bg(Math.min(1, rank / m.n));
    // the scale follows the sites; the gray curve is cut at the frame (a few other residues are far beyond every site)
    const top0 = Math.max(1, ys[0] || 0),
      bot0 = Math.min(-1, ys[shown - 1] || 0);
    const step = niceStep(top0 - bot0),
      ymax = Math.ceil((top0 * 1.04) / step - 1e-9) * step,
      ymin = Math.floor((bot0 * 1.04) / step + 1e-9) * step;
    const ticks = [];
    for (let v = ymin; v <= ymax + 1e-9; v += step) ticks.push(+v.toFixed(6));
    const tl = (v) => minus(+v.toPrecision(3));
    const tickW = Math.max(...ticks.map((v) => tl(v).length)) * fs * 0.6;
    const ml = Math.round(24 + tickW + 8),
      pw = w - ml - mr,
      ph = H - mt - mb;
    const X = (i) => ml + ((i + 0.5) / shown) * pw,
      Y = (v) => mt + (ph * (ymax - v)) / (ymax - ymin);
    const y0 = Y(0),
      yb = mt + ph;
    // axes: the zero line, the ticks, the titles
    let ax = `<line x1="${ml}" x2="${ml}" y1="${mt}" y2="${yb}" stroke="${c.line}"/><line x1="${ml}" x2="${ml + pw}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="${c.muted}"/>`;
    ticks.forEach((v) => {
      const y = Y(v).toFixed(1);
      ax += `<line x1="${ml - 4}" x2="${ml}" y1="${y}" y2="${y}" stroke="${c.line}"/><text x="${ml - 7}" y="${(Y(v) + fs * 0.33).toFixed(1)}" text-anchor="end" font-size="${fs}" fill="${c.muted}">${tl(v)}</text>`;
    });
    const xt = (phone ? [1, 0.5, 1] : [1, 0.25, 0.5, 0.75, 1]).map((f, k) =>
      k === 0 ? 1 : Math.max(1, Math.round(f * shown))
    );
    xt.filter((v, i, a) => a.indexOf(v) === i).forEach((r, k, a) => {
      const x = X(r - 1).toFixed(1);
      ax += `<line x1="${x}" x2="${x}" y1="${yb}" y2="${yb + 4}" stroke="${c.line}"/><text x="${x}" y="${yb + 6 + fs}" text-anchor="${k === 0 ? 'start' : k === a.length - 1 ? 'end' : 'middle'}" font-size="${fs}" fill="${c.muted}">${int(r)}</text>`;
    });
    const xTitle =
      (w - ml < 340
        ? `${esc(W.marks)}, most enriched first`
        : `${esc(W.marks)} ranked from most enriched to most depleted`) +
      (shown < m.n ? `, top ${int(shown)} of ${int(m.n)}` : '');
    ax += `<text x="${(ml + pw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="${fs}" fill="${c.muted}">${xTitle}</text>`;
    ax += `<text transform="translate(11,${(mt + ph / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="${fs}" fill="${c.muted}">signed −log10 p</text>`;
    const sideMore = `more than expected ↑`,
      sideLess = `fewer than expected ↓`,
      tw = (s) => Math.round(s.length * fs * 0.62 + 6);
    ax += `<text x="${ml + pw - 4}" y="${mt + fs}" text-anchor="end" font-size="${fs}" fill="${c.muted}">${sideMore}</text>`;
    if (ymin < 0) ax += `<text x="${ml + 6}" y="${yb - 5}" font-size="${fs}" fill="${c.muted}">${sideLess}</text>`;
    const fixed = [{ x: ml + pw - 4 - tw(sideMore), y: mt, w: tw(sideMore), h: fs + 4 }];
    if (ymin < 0) fixed.push({ x: ml + 4, y: yb - 5 - fs, w: tw(sideLess), h: fs + 5 });
    // the curve of the residues that are not sites, on the same score
    const cols = Math.max(2, Math.floor(pw / 2));
    let b = '';
    const segs = [[ml, y0, ml + pw, y0]]; // the zero line and the gray curve: no label crosses them
    let prev = null;
    for (let j = 0; j < cols; j++) {
      const x = ml + ((j + 0.5) / cols) * pw,
        y = Y(Math.max(ymin, Math.min(ymax, bgAt(1 + ((j + 0.5) / cols) * shown))));
      b += `${j ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      if (prev) segs.push([prev[0], prev[1], x, y]);
      prev = [x, y];
    }
    // labels first (their sites are drawn emphasized), then the points
    const user = (M.labels || []).map((k) => m.index.get(k)).filter((i) => i != null && i < shown);
    const gh = geneHits(m, shown);
    const want = [...user];
    [...(gh ? gh.labels : []), ...defaultLabels(m, shown, phone)].forEach((i) => !want.includes(i) && want.push(i));
    const items = want.map((i) => {
      const r = rows[i],
        name = siteName(r.acc, r.pos, r.res);
      return { key: i, x: X(i), y: Y(r.y ?? 0), w: tw(name), h: fs + 4, name };
    });
    const lay = K.prop.layoutLabels(items, { x0: ml + 2, y0: mt, x1: ml + pw, y1: yb - 1 }, fixed, segs);
    const marked = new Set(want);
    // points: each site, thinned where they touch (every site stays in the hover); rings q < 0.05
    let pts = '',
      lastAny = null,
      lastRing = null;
    const far = (p, x, y, g) => !p || Math.hypot(p[0] - x, p[1] - y) >= g;
    rows.forEach((r, i) => {
      if (i >= shown) return;
      const x = X(i),
        y = Y(r.y ?? 0),
        more = r.q != null && r.q < RING_Q,
        fewer = r.ql != null && r.ql < RING_Q,
        ring = more || fewer,
        hl = !!gh?.marked.has(i),
        lab = marked.has(i) || hl;
      if (!lab && !(ring ? far(lastRing, x, y, 6) && far(lastAny, x, y, 2) : far(lastAny, x, y, 3))) return;
      lastAny = [x, y];
      if (ring) lastRing = [x, y];
      const xs = x.toFixed(1),
        ysx = y.toFixed(1);
      if (hl) pts += `<circle cx="${xs}" cy="${ysx}" r="10" fill="none" stroke="${c.site}" stroke-width="2.2"/>`;
      if (more) pts += `<circle cx="${xs}" cy="${ysx}" r="6.5" fill="none" stroke="${c.ink}" stroke-width="1.5"/>`;
      if (fewer)
        pts += `<circle cx="${xs}" cy="${ysx}" r="6.5" fill="none" stroke="${c.ink}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`;
      pts += `<circle cx="${xs}" cy="${ysx}" r="${ring || lab ? 3.4 : 2.7}" fill="${oeFill(r.o, c)}" stroke="${r.o == null ? c.muted : c.ink}" stroke-width="${lab ? 1.6 : ring ? 0.8 : 0.6}"/>`;
    });
    let labels = '';
    lay.placed.forEach((p) => {
      const r = rows[p.key],
        nm = esc(items.find((x) => x.key === p.key).name);
      const tx = p.x + 2,
        ty = p.y + p.h - 4;
      let g = p.leader
        ? `<line x1="${p.leader[0].toFixed(1)}" y1="${p.leader[1].toFixed(1)}" x2="${p.leader[2].toFixed(1)}" y2="${p.leader[3].toFixed(1)}" stroke="${c.muted}" stroke-width="0.8"/>`
        : '';
      const t = `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fs}" fill="${c.ink}" stroke="${c.cap}" stroke-width="3" paint-order="stroke">${nm}</text>`;
      g += o.links
        ? `<a class="mu-link" href="${esc(K.link('protein', `${r.acc}/${r.pos}`))}" aria-label="Open the card of ${nm}" data-prtip="${esc(rowTip(m, r, p.key))}">${t}</a>`
        : t;
      labels += g;
    });
    const dropped = new Set(lay.dropped);
    return {
      H,
      w,
      ml,
      pw,
      shown,
      X,
      Y,
      dropped,
      body: `<path d="${b}" fill="none" stroke="${c.bg}" stroke-width="1.4" stroke-opacity="0.65"/>` + ax + pts,
      labels,
    };
  }
  // the words for one site of the waterfall (tooltip, readout)
  function rowTip(m, r, i) {
    const unit = m.germ ? ['variant', 'variants'] : [m.s.unit?.[0] || 'sample', m.s.unit?.[1] || 'samples'],
      what = m.germ ? 'variants' : 'with a change';
    const L = [`${siteName(r.acc, r.pos, r.res)} · rank ${int(i + 1)} of ${int(m.n)}`];
    L.push(
      r.k === 0
        ? `no ${m.germ ? 'variant' : 'change'}${r.e != null ? `, expected ${K.prop.fe(r.e)}` : ''}`
        : `${int(r.k)} ${r.k === 1 ? unit[0] : unit[1]}${m.germ ? '' : ' ' + what}${r.e != null ? `, expected ${K.prop.fe(r.e)}` : ''}`
    );
    if (m.germ && r.af) L[1] += `; summed allele frequency ${afText(r.af)}`;
    if (!m.germ && !hyper() && r.kAll > r.k) L[1] += ` (without hypermutated; ${int(r.kAll)} in all)`;
    if (r.o != null) L.push(`O/E ${K.prop.fo(r.o)}`);
    if (r.y == null)
      L.push(
        r.o == null
          ? `no test: no change, and an expected count too small to list`
          : `no test: ${r.o < 1 && !m.germ && !m.lowerOk ? 'the release gives no lower tail for this source' : 'no coding sequence matches UniProt'}`
      );
    else {
      const side = r.y > 0 ? 'more than expected' : r.y < 0 ? 'fewer than expected' : 'as expected';
      L.push(`${side}: signed −log10 p ${minus(+r.y.toFixed(2))}`);
    }
    const ps = [];
    if (r.pu != null) ps.push(`p (more) ${K.prop.fq(r.pu)}${r.q != null ? `, q ${K.prop.fq(r.q)}` : ''}`);
    if (r.pl != null) ps.push(`p (fewer) ${K.prop.fq(r.pl)}${r.ql != null ? `, q ${K.prop.fq(r.ql)}` : ''}`);
    if (ps.length) L.push(ps.join(' · '));
    if (r.hot) L.push(K.prop.hotTip(r.acc, r.hot, m.germ ? 'variants' : 'changes', r.y != null && r.y < 0));
    if (LAST.f?.dropped?.has(i)) L.push('its label is left out: no room');
    return L.join('\n');
  }
  const waterfallNote = (m) =>
    `Height is the signed −log10 p of the release's binomial test: up for more ${m.germ ? 'variants' : 'changes'} than expected, down for fewer. ` +
    `The x axis ranks the ${esc(W.marks)} from the most enriched to the most depleted in ${esc(m.s.long || m.s.label)}. ` +
    (m.germ
      ? `A ${esc(W.mark)} with no variant sits on the lower side. `
      : `p and q pool all cancer types. ` +
        (m.lowerOk
          ? `The release gives no lower tail for ${esc(m.s.label)}; this explorer computes it with the release's own binomial. A ${esc(W.mark)} with no change sits on the lower side. `
          : `The release gives no lower tail for ${esc(m.s.label)}, so a ${esc(W.mark)} with fewer changes than expected is drawn at 0. `) +
        `A ${esc(W.mark)} with no change and a small expected count has no stored test and is drawn at 0. `) +
    `The thin gray curve is the same score for ${esc(W.residues)} that are not ${esc(W.marks)}, ranks scaled to the number of ${esc(W.marks)}. ` +
    `Where the enriched residues (q < 0.05) carry ${Math.round((PR.hotspot?.min_share ?? 0.3) * 100)}% or more of a protein's ${m.germ ? 'variants' : 'changes'} (at least ${PR.hotspot?.min_changes ?? 20}), the expected count at its other residues is inflated and they look depleted; the default labels skip those ${esc(W.marks)}, and you can still label one by a click or the Label box. ` +
    `Highlight genes outlines every site of the proteins you list and labels each one's most extreme site; it changes no statistic. ` +
    (m.germ
      ? ''
      : hyper()
        ? 'Hypermutated samples are included.'
        : 'Hypermutated samples (more than 10 coding calls per Mb) are left out.');
  // ---- the waterfall on the page: drawn at the width it is shown at (text keeps its size on a phone), redrawn when that changes -----
  const wfWidth = () => Math.max(280, Math.min(800, (document.documentElement.clientWidth || 800) - 32));
  const wfHeight = (w) => (w < 500 ? 330 : 350);
  // the svg's content: the plot, then the layer that takes the pointer (its tooltip), the cursor ring and the labels over it
  function wfInner(m, w) {
    const f = waterfallSvg(m, THEME, w, { links: true });
    if (LAST.m !== m) LAST.cur = null;
    LAST.m = m;
    LAST.f = f;
    LAST.w = w;
    const ph = wfHeight(w) - 60;
    return (
      f.body +
      `<rect id="mu-hover" class="mu-hover" x="${f.ml}" y="14" width="${f.pw}" height="${ph}" fill="transparent" data-prtip=""/>` +
      `<circle id="mu-cur" r="8" fill="none" stroke="var(--accent)" stroke-width="2" display="none" pointer-events="none"/>` +
      f.labels
    );
  }
  function fitWaterfall() {
    const sv = document.getElementById('mu-svg');
    if (!sv || S.view !== 'mutations' || M.view !== 'waterfall' || !LAST.m) return;
    const w = Math.round(sv.getBoundingClientRect().width);
    if (!w || Math.abs(w - LAST.w) < 2) return;
    sv.setAttribute('viewBox', `0 0 ${w} ${wfHeight(w)}`);
    sv.innerHTML = wfInner(LAST.m, w);
  }
  (K.afterRender ||= []).push(fitWaterfall);
  let fitTimer = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(fitTimer);
    fitTimer = requestAnimationFrame(fitWaterfall);
  });
  // the reader's labels: a point clicked or a site typed (wl in the address, apart from mt, the sites chosen for a test)
  function labelForm() {
    return (
      `<form class="mu-add" data-mu-lform><input id="mu-lab-site" type="text" autocomplete="off" placeholder="H4 R3" data-mu-lsite aria-label="Label a site, as a gene and a position"> ` +
      `<button type="submit" class="btn small"${M.labels.length >= MAX_LABELS ? ' disabled' : ''}>Label</button> <span class="small muted" data-mu-lmsg role="status"></span></form>` +
      (M.labels.length
        ? `<p class="mu-chips">${M.labels
            .map((k) => {
              const [acc, pos] = k.split(':');
              return `<span class="mu-chip">${esc(siteName(acc, +pos, ''))} <button type="button" data-mu-ldel="${esc(k)}" aria-label="Remove the label of ${esc(siteName(acc, +pos, ''))}">×</button></span>`;
            })
            .join(' ')}</p>`
        : '')
    );
  }
  // the genes to highlight (wg in the address): a pasted list read by the search's own parser, and a line saying what it found
  function geneForm(m) {
    const shown = Math.max(1, Math.min(m.n, M.zoom || m.n)),
      gh = geneHits(m, shown);
    let sum = '';
    if (gh) {
      const gs = geneSet(),
        n = (k, one, many) => `${int(k)} ${k === 1 ? one : many}`,
        none = [...gs.accs].filter((a) => !gh.by.has(a)).map((a) => byAcc[a]?.[1] || a),
        bits = [
          `${n(gh.genes, 'gene', 'genes')}, ${n(gh.sites, 'site', 'sites')}: ${int(gh.up)} above 0, ${int(gh.down)} below 0`,
        ];
      if (none.length) bits.push(`no ${esc(W.mark)} in this waterfall: ${none.map(esc).join(', ')}`);
      sum =
        `<p class="small" data-mu-gsum>${bits.join('; ')}.` +
        (gs.via.length
          ? ` Matched by another name: ${gs.via.map(([t, g]) => `${esc(t)} → ${esc(g.join('/'))}`).join(', ')}.`
          : '') +
        `</p>` +
        (gs.notFound.length
          ? `<p class="small muted">${K.sel.leftOut(gs.notFound.map((x) => `<b>${esc(x)}</b>`).join(', '))}</p>`
          : '');
    }
    return (
      `<form class="mu-add" data-mu-gform><textarea id="mu-genes" rows="2" autocomplete="off" spellcheck="false" placeholder="Gene names or UniProt IDs" data-mu-gtext aria-label="Highlight genes: gene names or UniProt IDs, separated by spaces, commas, semicolons or new lines">${esc(M.genes.join(' '))}</textarea> ` +
      `<button type="submit" class="btn small">Highlight genes</button>` +
      (M.genes.length ? ` <button type="button" class="btn small" data-mu-gclear>Clear</button>` : '') +
      `</form>` +
      sum
    );
  }
  document.addEventListener('submit', (e) => {
    if (!e.target.matches?.('[data-mu-gform]')) return;
    e.preventDefault();
    M.genes = K.prop.geneWords(e.target.querySelector('[data-mu-gtext]').value);
    K.writeHash?.();
    K.render();
  });
  K.clicks.push([
    '[data-mu-gclear]',
    () => {
      M.genes = [];
      K.writeHash?.();
      K.render();
    },
  ]);
  function toggleLabel(key) {
    if (M.labels.includes(key)) M.labels = M.labels.filter((k) => k !== key);
    else if (M.labels.length >= MAX_LABELS) return false;
    else M.labels.push(key);
    K.writeHash?.();
    K.render();
    return true;
  }
  // the site under the pointer, or at a rank
  const rowAt = (frac) => {
    const f = LAST.f;
    return Math.min(f.shown - 1, Math.max(0, Math.floor(frac * f.shown)));
  };
  function inspect(i, tipEl) {
    const m = LAST.m,
      f = LAST.f;
    if (!m || !f || !m.rows[i]) return;
    LAST.cur = i;
    const r = m.rows[i],
      t = rowTip(m, r, i);
    if (tipEl) tipEl.setAttribute('data-prtip', t);
    const cur = document.getElementById('mu-cur');
    if (cur) {
      cur.setAttribute('cx', f.X(i).toFixed(1));
      cur.setAttribute('cy', f.Y(r.y ?? 0).toFixed(1));
      cur.setAttribute('display', 'inline');
    }
    const rd = document.getElementById('mu-read');
    if (rd) rd.innerHTML = t.split('\n').map(esc).join('<br>');
  }
  document.addEventListener('submit', async (e) => {
    if (!e.target.matches?.('[data-mu-lform]')) return;
    e.preventDefault();
    const msg = e.target.querySelector('[data-mu-lmsg]'),
      q = K.sel.parse(e.target.querySelector('[data-mu-lsite]').value),
      hit = (q.sites || [])[0];
    if (!hit) {
      msg.textContent = q.rejected?.[0] || 'Not found. Type a gene and a residue, as in H4 R3.';
      return;
    }
    // the sequence settles the residue typed, as for the sites chosen for a test
    const p = K.sel.byAcc[D.proteins[hit[0]][0]];
    await K.sel.seqReady(p);
    const bad = K.sel.siteProblem(p, hit[1] + (K.numbering?.(p)?.offset || 0), hit[2] || '');
    if (bad) {
      msg.textContent = bad;
      return;
    }
    const key = `${p.acc}:${hit[1]}`,
      m = LAST.m;
    if (!m?.index.has(key)) msg.textContent = `Not among the ${int(m?.n || 0)} ${W.marks} of the selection.`;
    else if (M.labels.includes(key)) msg.textContent = 'Already labeled.';
    else if (!toggleLabel(key)) msg.textContent = `At most ${MAX_LABELS} labels.`;
  });
  K.clicks.push([
    '[data-mu-ldel]',
    (b) => {
      M.labels = M.labels.filter((k) => k !== b.dataset.muLdel);
      K.writeHash?.();
      K.render();
    },
  ]);

  // ---- the oncoprint's numbers ---------------------------------------------------------------------------------------------
  const TOP = 30;
  function onco() {
    const oc = ocData(),
      sites = selSites();
    if (!oc || !sites) return null;
    const hy = hyper();
    const proj = M.group ? oc.projects.indexOf(M.group) : -1;
    const ok = (i) => (hy || !oc.samples[i][2]) && (proj < 0 || oc.samples[i][1] === proj);
    const idx = new Map();
    for (const [acc, list] of Object.entries(oc.sites))
      for (const [pos, cells] of list) idx.set(acc + ':' + pos, cells);
    const rows = [];
    for (const [acc, pos, res] of sites) {
      const all = (idx.get(acc + ':' + pos) || []).filter((v) => proj < 0 || oc.samples[v >> 1][1] === proj),
        cells = all.filter((v) => ok(v >> 1));
      if (cells.length) rows.push({ acc, pos, res, cells, nAll: all.length });
    }
    rows.sort((a, b) => b.cells.length - a.cells.length || (a.acc < b.acc ? -1 : 1) || a.pos - b.pos);
    const top = rows.slice(0, TOP);
    const has = top.map((r) => new Map(r.cells.map((v) => [v >> 1, v & 1])));
    const cols = [...new Set(top.flatMap((r) => r.cells.map((v) => v >> 1)))];
    // the usual order: the samples with the first row first, then the second, ...
    cols.sort((a, b) => {
      for (const h of has) {
        const d = (h.has(b) ? 1 : 0) - (h.has(a) ? 1 : 0);
        if (d) return d;
      }
      return a - b;
    });
    return { oc, top, has, cols, nSites: rows.length, nSelected: sites.length };
  }
  // the oncoprint's frame: left margin, width, a column's width, where the rows start and their height
  const oncoGeo = (o, w) => {
    const ml = 128,
      mr = 150,
      mt = 12,
      burdenH = 34,
      gap = 8,
      rowH = 13,
      pw = w - ml - mr;
    return {
      ml,
      mr,
      mt,
      burdenH,
      gap,
      rowH,
      pw,
      cw: pw / (o.cols.length || 1),
      y0: mt + burdenH + gap,
      H: mt + burdenH + gap + o.top.length * rowH + 30,
    };
  };
  function oncoprintSvg(o, c, w, cellColors, links = false) {
    const geo = oncoGeo(o, w),
      { ml, mt, burdenH, rowH, pw, cw, H } = geo;
    let s = '';
    // the burden track: coding calls per Mb, capped, the hypermutated threshold marked
    const CAP = 40,
      th = PR.hypermutated.per_mb;
    const yb = (v) => mt + burdenH - (Math.min(v, CAP) / CAP) * burdenH;
    o.cols.forEach((i, k) => {
      const smp = o.oc.samples[i];
      s += `<rect x="${(ml + k * cw).toFixed(2)}" y="${yb(smp[3]).toFixed(1)}" width="${Math.max(0.6, cw - (cw > 3 ? 0.6 : 0)).toFixed(2)}" height="${(mt + burdenH - yb(smp[3])).toFixed(1)}" fill="${smp[2] ? c.hyp : c.muted}"/>`;
    });
    s += `<line x1="${ml}" x2="${ml + pw}" y1="${yb(th).toFixed(1)}" y2="${yb(th).toFixed(1)}" stroke="${c.line}" stroke-dasharray="3 3"/><text x="${ml - 6}" y="${(yb(th) + 3.5).toFixed(1)}" text-anchor="end" font-size="10.5" fill="${c.muted}">${th} per Mb</text>`;
    s += `<text x="${ml - 6}" y="${mt + 8}" text-anchor="end" font-size="10.5" fill="${c.muted}">calls per Mb</text>`;
    s += `<text x="${ml + pw + 6}" y="${mt + burdenH + 4}" font-size="10.5" fill="${c.muted}">${hyper() ? 'tumors' : 'tumors (in all)'}</text>`;
    const y0 = geo.y0;
    o.top.forEach((r, j) => {
      const y = y0 + j * rowH;
      s += `<rect x="${ml}" y="${y}" width="${pw}" height="${rowH - 2}" fill="${c.track}"/>`;
      o.cols.forEach((i, k) => {
        const st = o.has[j].get(i);
        if (st === undefined) return;
        s += `<rect x="${(ml + k * cw).toFixed(2)}" y="${y}" width="${Math.max(0.8, cw - (cw > 3 ? 0.6 : 0)).toFixed(2)}" height="${rowH - 2}" fill="${cellColors[st]}"/>`;
      });
      const nm = esc(siteName(r.acc, r.pos, r.res)),
        lab = `<text x="${ml - 6}" y="${y + rowH - 4}" text-anchor="end" font-size="11" fill="${c.ink}">${nm}</text>`;
      // on the page a row's name opens the site's card (a link: the keyboard reaches it)
      s += links
        ? `<a class="mu-link" href="${esc(K.link('protein', `${r.acc}/${r.pos}`))}" aria-label="Open the card of ${nm}">${lab}</a>`
        : lab;
      s += `<text x="${ml + pw + 6}" y="${y + rowH - 4}" font-size="11" fill="${c.ink}">${int(r.cells.length)}${!hyper() && r.nAll > r.cells.length ? `<tspan fill="${c.muted}" font-size="10.5"> (${int(r.nAll)} in all)</tspan>` : ''}</text>`;
    });
    s += `<text x="${ml + pw / 2}" y="${H - 8}" text-anchor="middle" font-size="11.5" fill="${c.muted}">${int(o.cols.length)} TCGA tumors with a change at one of these ${esc(W.marks)}</text>`;
    return { svg: s, H, ml, pw, cw, y0, rowH };
  }
  const oncoNote = (o) =>
    `The ${int(o.top.length)} ${esc(W.marks)} with the most changed TCGA tumors, out of ${int(o.nSites)} with at least one${
      M.group ? ` in ${esc(M.group)}` : ''
    }. Each column is a tumor. The bar above it is the tumor's coding calls per Mb (capped at 40); the dashed line is the hypermutated threshold. ${
      hyper()
        ? 'Hypermutated tumors are included (teal bars).'
        : 'Hypermutated tumors are left out. The counts at the right are without them, with the count in all tumors in parentheses. A tumor with two changes at one site counts once, so a table that counts changes can show a higher number.'
    }`;

  // ---- the page ------------------------------------------------------------------------------------------------------------------
  const seg = (attr, label, items, cur) =>
    `<div class="seg" role="group" aria-label="${esc(label)}"><span class="seg-l">${esc(label)}</span>` +
    items
      .map(
        ([v, t]) =>
          `<button type="button" ${attr}="${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(t)}</button>`
      )
      .join('') +
    '</div>';
  function controls(wf) {
    const V = M.view;
    if (V === 'clinvar') return '';
    const groups = wf?.groups[SRC[0].id] || [];
    return (
      `<div class="mu-ctl">` +
      (SRC.length > 1 && V === 'waterfall'
        ? seg(
            'data-mu-src',
            'Source',
            SRC.map((x) => [x.id, x.label]),
            M.src
          )
        : '') +
      (V === 'oncoprint'
        ? `<label class="mu-ct"><span class="seg-l">Cancer type</span><select data-mu-ct aria-label="Cancer type"><option value="">All cancer types</option>` +
          groups
            .map((g) => `<option value="${esc(g)}"${g === M.group ? ' selected' : ''}>${esc(gname(g))}</option>`)
            .join('') +
          `</select></label>`
        : '') +
      (V === 'waterfall' && germ() ? '' : K.prop.hyperSwitch('Samples')) +
      `</div>`
    );
  }
  // a residue letter spelled out: "Serine (S)"
  const resLabel = (l) => (D.residue_names?.[l] ? `${cap1(D.residue_names[l])} (${l})` : l);
  function setSummary() {
    const rows = PR.summary?.sets || [];
    if (!rows.length || K.sel.active()) return '';
    const pick = rows.filter((r) => ['tcga_mc3', 'depmap_24q4', 'clinvar', 'gnomad_v4_1'].includes(r.source));
    const lab = { tcga_mc3: 'TCGA', depmap_24q4: 'DepMap', clinvar: 'ClinVar', gnomad_v4_1: 'gnomAD' };
    const fo = (v) => (v == null ? '–' : v >= 10 ? v.toFixed(0) : v.toFixed(2));
    const fp = (v) => (v == null ? '–' : v < 0.001 ? v.toExponential(1).replace('e-', 'e−') : v.toFixed(3));
    return (
      `<details class="mu-set"><summary>Whole list against expectation (the release's site set test)</summary>` +
      `<p class="small muted">${esc(PR.summary.set_label || '')}: the changes (k) at the ${esc(W.marks)} against the expected count, summed over their proteins (each protein's changes at its residues of the type, times the ${esc(W.marks)}' share of its expected rate of change). p comes from ${int(PR.summary.iterations || 10000)} permutation draws; the smallest possible p is about 1e−4. This table does not change with your selection.</p>` +
      `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Source</th><th>Residue</th><th>Samples</th><th>${esc(cap1(W.marks))}</th><th>k</th><th>Expected</th><th>O/E</th><th>p (more)</th><th>p (fewer)</th></tr></thead><tbody>` +
      pick
        .map(
          (r) =>
            `<tr><td>${esc(lab[r.source] || r.source)}${r.oe_status === 'descriptive' ? ' <span class="muted">(descriptive)</span>' : ''}</td><td>${esc(resLabel(r.residue))}</td><td>${r.cohort === 'no_hypermutated' ? 'without hypermutated' : 'all'}</td><td>${int(r.sites)}</td><td>${int(r.observed)}</td><td>${fo(r.expected)}</td><td>${fo(r.oe)}</td><td>${r.oe_status === 'descriptive' ? '–' : fp(r.p_upper)}</td><td>${r.oe_status === 'descriptive' ? '–' : fp(r.p_lower)}</td></tr>`
        )
        .join('') +
      `</tbody></table></div></details>`
    );
  }
  const cap1 = (t) =>
    String(t || '')
      .charAt(0)
      .toUpperCase() + String(t || '').slice(1);
  // ---- the sites you chose: a test of sites picked in advance ------------------------------------------------------------------
  // For a site chosen beforehand the raw p is the right number: q corrects across every residue of the release. The Holm p
  // corrects across the sites chosen here (their tails and sources shown), and nothing else.
  const SEQ = {};
  const seqOf = (acc) => {
    if (!(acc in SEQ)) {
      SEQ[acc] = null;
      K.loadProtein?.(acc).then(
        (rec) => {
          SEQ[acc] = rec.seq || '';
          if (S.view === 'mutations') K.render();
        },
        () => {}
      );
    }
    return SEQ[acc];
  };
  // the other explorers (sites.json beside the sites' folders), for a chosen site this explorer does not cover
  let SIBS;
  const sibs = () => {
    if (SIBS === undefined) {
      SIBS = null;
      fetch('../sites.json')
        .then((r) => (r.ok ? r.json() : { sites: [] }))
        .catch(() => ({ sites: [] }))
        .then((j) => {
          SIBS = j.sites || [];
          if (S.view === 'mutations') K.render();
        });
    }
    return SIBS;
  };
  // the residues this explorer covers, in words (the site's own noun for them)
  const coversWords = () => W.residues;
  // 'not in this explorer', with a link that carries the site to each explorer that covers its residue
  function notHere(key) {
    const [acc, pos] = key.split(':'),
      sq = seqOf(acc),
      letter = sq ? sq[pos - 1] : '',
      keyR = `${acc}:${letter}${pos}`,
      here = D.site.id,
      list = (sibs() || []).filter((s) => s.id !== here && letter && (s.residues || []).includes(letter));
    return (
      `not in this explorer (it covers ${esc(coversWords())}).` +
      (list.length
        ? ` Test it in the ${list
            .map(
              (s) =>
                `<a href="../${encodeURIComponent(s.id)}/#mutations?mt=${encodeURIComponent(keyR)}">${esc(s.id)}</a>`
            )
            .join(' or ')} explorer.`
        : '')
    );
  }
  const chosenName = (key) => {
    const [acc, pos] = key.split(':'),
      sq = seqOf(acc);
    return siteName(acc, +pos, sq ? sq[pos - 1] : '');
  };
  const fpv = (v) => (v == null ? '–' : K.prop.fq(v));
  // the rows of the table: per chosen site and source, k, expected, O/E, the raw p of each tail and the Holm p
  function chosenRows() {
    const rows = [];
    for (const key of M.chosen) {
      const [acc, pos] = key.split(':');
      if (K.prop.peek(acc) === undefined) {
        K.prop.load(acc).then(() => S.view === 'mutations' && K.render());
        rows.push({ key, wait: true });
        continue;
      }
      for (const s of PR.sources) {
        const v = K.prop.at(acc, s.id, +pos);
        rows.push({ key, s, v, more: null, fewer: null });
      }
    }
    // the family: every p shown (upper tail of each source with a test, lower tail of the sources that have one)
    const ps = [];
    rows.forEach((r) => {
      if (!r.v || r.s.descriptive) return;
      if (r.v.p != null) ps.push([r, 'more', r.v.p]);
      if (r.s.lower_tail && r.v.pl != null) ps.push([r, 'fewer', r.v.pl]);
    });
    K.prop.holm(ps.map((x) => x[2])).forEach((a, i) => (ps[i][0][ps[i][1]] = a));
    return { rows, n: ps.length };
  }
  function chosenSection() {
    const { rows } = chosenRows();
    // a site that no source has a row for (a residue this site's tables do not cover) is one line
    const none = new Set(
      M.chosen.filter(
        (k) => rows.filter((r) => r.key === k && !r.wait).every((r) => !r.v) && rows.some((r) => r.key === k && !r.wait)
      )
    );
    const body = rows
      .filter((r) => !none.has(r.key) || r.s === PR.sources[0])
      .map((r) =>
        r.wait
          ? `<tr><td>${esc(chosenName(r.key))}</td><td colspan="8" class="muted">Loading…</td></tr>`
          : none.has(r.key)
            ? `<tr><td>${esc(chosenName(r.key))}</td><td colspan="8" class="muted">${notHere(r.key)}</td></tr>`
            : !r.v
              ? `<tr><td>${esc(chosenName(r.key))}</td><td>${esc(r.s.label)}</td><td colspan="7" class="muted">no row in the release</td></tr>`
              : `<tr><td>${esc(chosenName(r.key))}${r.v.hot ? `<br><span class="small muted">${esc(K.prop.hotNote(r.key.split(':')[0], r.v.hot, r.s.id))}</span>` : ''}</td><td>${esc(r.s.label)}</td><td>${int(r.v.k ?? 0)}</td><td>${K.prop.fe(r.v.e)}</td><td>${K.prop.fo(r.v.o)}</td>` +
                (r.s.descriptive
                  ? `<td colspan="4" class="muted">descriptive: no test</td>`
                  : `<td>${fpv(r.v.p)}</td><td>${r.s.lower_tail ? fpv(r.v.pl) : '–'}</td><td>${fpv(r.more)}</td><td>${r.s.lower_tail ? fpv(r.fewer) : '–'}</td>`) +
                `</tr>`
      )
      .join('');
    return (
      `<section class="mu-chosen" id="mu-chosen"><h3>Test the sites you chose</h3>` +
      `<p class="small muted">Pick sites before you look at the results. Up to ${MAX_CHOSEN}, kept in the address.</p>` +
      `<form class="mu-add" data-mu-form>` +
      `<input id="mu-site" type="text" autocomplete="off" placeholder="H4 R3" data-mu-site aria-label="Add a site, as a gene and a position"> ` +
      `<button type="submit" class="btn small"${M.chosen.length >= MAX_CHOSEN ? ' disabled' : ''}>Add</button> <span class="small muted" data-mu-msg role="status">${esc(M.note)}</span></form>` +
      (M.chosen.length
        ? `<p class="mu-chips">${M.chosen
            .map(
              (k) =>
                `<span class="mu-chip">${esc(chosenName(k))} <button type="button" data-mu-del="${esc(k)}" aria-label="Remove ${esc(chosenName(k))}">×</button></span>`
            )
            .join(' ')}</p>` +
          `<div class="mu-top"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Site</th><th>Source</th><th>k</th><th>Expected</th><th>O/E</th><th>Raw p (more)</th><th>Raw p (fewer)</th><th>Adjusted p (more)</th><th>Adjusted p (fewer)</th></tr></thead><tbody>${body}</tbody></table></div>` +
          `${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'muchosen', 'tested sites', 'propensity')}</div>`
        : '') +
      `</section>`
    );
  }
  const chosenTsv = () => {
    const { rows } = chosenRows();
    return (
      K.preamble(
        'Sites chosen for a test',
        `k, expected and O/E from the release's propensity tables; p = the release's raw binomial p (more: upper tail; fewer: lower tail, gnomAD); adjusted p = Holm over the p values listed, which corrects only for the sites chosen`
      ) +
      'site\taccession\tposition\tsource\tk\texpected\toe\tp_more\tp_fewer\tadjusted_p_more\tadjusted_p_fewer\n' +
      rows
        .filter((r) => r.v)
        .map((r) =>
          [
            chosenName(r.key),
            r.key.split(':')[0],
            r.key.split(':')[1],
            r.s.label,
            r.v.k ?? '',
            r.v.e ?? '',
            r.v.o ?? '',
            r.s.descriptive ? '' : (r.v.p ?? ''),
            r.s.descriptive || !r.s.lower_tail ? '' : (r.v.pl ?? ''),
            r.more ?? '',
            r.fewer ?? '',
          ].join('\t')
        )
        .join('\n') +
      '\n'
    );
  };
  // adding a site: a name and a position as the page numbers them (H4 R3), or a site card's button
  function addSite(key) {
    if (M.chosen.includes(key) || M.chosen.length >= MAX_CHOSEN) return false;
    M.chosen.push(key);
    K.writeHash?.();
    return true;
  }
  document.addEventListener('submit', async (e) => {
    if (!e.target.matches?.('[data-mu-form]')) return;
    e.preventDefault();
    const input = e.target.querySelector('[data-mu-site]'),
      msg = e.target.querySelector('[data-mu-msg]');
    const q = K.sel.parse(input.value);
    const hit = (q.sites || [])[0];
    if (!hit) {
      msg.textContent = q.rejected[0] || 'Not found. Type a gene and a residue, as in H4 R3.';
      return;
    }
    // the sequence settles the residue typed (and the end of the protein); a position with no residue typed takes the sequence's
    const p = K.sel.byAcc[D.proteins[hit[0]][0]],
      sq = await K.sel.seqReady(p),
      letter = hit[2] || '';
    const bad = K.sel.siteProblem(p, hit[1] + (K.numbering?.(p)?.offset || 0), letter);
    if (bad) {
      msg.textContent = bad;
      return;
    }
    const key = `${p.acc}:${hit[1]}`;
    if (!addSite(key)) msg.textContent = M.chosen.includes(key) ? 'Already added.' : `At most ${MAX_CHOSEN} sites.`;
    else {
      const r = letter || sq[hit[1] - 1] || '';
      if (r) M.res[key] = r;
      SEQ[p.acc] ??= sq || null;
      M.note = K.sel.notesOf(q).join(' ');
      K.writeHash?.();
      K.render();
    }
  });
  K.clicks.push(
    [
      '[data-mu-del]',
      (b) => {
        M.chosen = M.chosen.filter((k) => k !== b.dataset.muDel);
        K.writeHash?.();
        K.render();
      },
    ],
    [
      '[data-mu-add]',
      (b) => {
        const ok = addSite(b.dataset.muAdd);
        b.textContent = ok
          ? 'Added to my tested sites'
          : M.chosen.includes(b.dataset.muAdd)
            ? 'Already added'
            : `At most ${MAX_CHOSEN}`;
        b.disabled = true;
      },
    ],
    [
      '[data-muchosen]',
      (b) =>
        b.dataset.muchosen === 'tsv'
          ? K.exportFigure('tsv', null, `${D.site.id}_tested_sites`, b, chosenTsv)
          : K.tableExport(
              b.dataset.muchosen,
              b,
              b.closest('section'),
              { title: 'Tested sites' },
              `${D.site.id}_tested_sites`,
              chosenTsv
            ),
    ]
  );
  // for a site card: a button that adds the site to the tested sites
  K.mut = {
    addButton: (acc, pos) =>
      `<button type="button" class="btn small" data-mu-add="${esc(acc)}:${pos}"${M.chosen.includes(`${acc}:${pos}`) ? ' disabled' : ''}>${M.chosen.includes(`${acc}:${pos}`) ? 'Already in my tested sites' : 'Add to my tested sites'}</button>`,
  };

  // ---- sites with no change, the most expected first ------------------------------------------------------------------------------
  function zeroRows(m) {
    if (m.germ) return m.rows.filter((r) => r.k === 0 && r.e > 0).map((r) => ({ ...r, p: r.pl }));
    const cohort = hyper() ? 'all' : 'no_hypermutated',
      sel = new Map(m.rows.map((r) => [r.acc + ':' + r.pos, r]));
    return ((m.wf.zero?.[m.s.id] || {})[cohort] || [])
      .filter(([acc, pos]) => sel.has(acc + ':' + pos))
      .map(([acc, pos, res, e, p]) => ({ acc, pos, res, e, p }));
  }
  const ZERO_SHOWN = 200;
  function zeroSection(m) {
    const rows = zeroRows(m);
    if (!rows.length) return '';
    const hasP = m.germ || m.lowerOk;
    return (
      `<section class="mu-zero"><h3>Sites with no ${m.germ ? 'variant' : 'change'}</h3>` +
      `<p class="small muted">Most expected first${hasP ? '; p is the raw lower-tail p' : ''}.</p>` +
      `<div class="mu-top"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Site</th><th>Expected</th>${hasP ? '<th>p (fewer)</th>' : ''}</tr></thead><tbody>` +
      rows
        .slice(0, ZERO_SHOWN)
        .map(
          (r) =>
            `<tr><td><a href="${esc(K.link('protein', `${r.acc}/${r.pos}`))}">${esc(siteName(r.acc, r.pos, r.res))}</a></td><td>${K.prop.fe(r.e)}</td>${hasP ? `<td>${fpv(r.p)}</td>` : ''}</tr>`
        )
        .join('') +
      `</tbody></table></div>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'muzero', 'sites with no change', 'propensity')}</div>` +
      (rows.length > ZERO_SHOWN
        ? `<p class="small muted">${int(ZERO_SHOWN)} of ${int(rows.length)} shown; the download has all.</p>`
        : '') +
      `</section>`
    );
  }
  const zeroTsv = () => {
    const m = model(),
      rows = zeroRows(m);
    return (
      K.preamble('Sites with no change', `${m.s.long || m.s.label}; sorted by expected, highest first`) +
      `site\taccession\tposition\texpected\tp_fewer\n` +
      rows.map((r) => [siteName(r.acc, r.pos, r.res), r.acc, r.pos, r.e, r.p ?? ''].join('\t')).join('\n') +
      '\n'
    );
  };
  K.clicks.push([
    '[data-muzero]',
    (b) =>
      b.dataset.muzero === 'tsv'
        ? K.exportFigure('tsv', null, `${D.site.id}_sites_with_no_change`, b, zeroTsv)
        : K.tableExport(
            b.dataset.muzero,
            b,
            b.closest('section'),
            { title: 'Sites with no change' },
            `${D.site.id}_sites_with_no_change`,
            zeroTsv
          ),
  ]);

  // ---- Ranked sites: the sites with q < 0.05 of each source, ranked by p ---------------------------------------------------------
  const RANK_N = 20;
  const geneOf = (acc) => byAcc[acc]?.[1] || acc;
  const shownPos = (acc, pos) => (K.prot?.shownPos ? K.prot.shownPos(acc, pos) : pos);
  const siteOnly = (r) => `${r.res || ''}${shownPos(r.acc, r.pos)}`;
  const goTo = (acc, pos) => (location.hash = K.link('protein', `${acc}/${pos}`).replace(/^[^#]*#/, ''));
  const rankTitle = (s) =>
    s.kind === 'germline'
      ? `Fewer inherited ${s.unit?.[1] || 'variants'} than expected (${s.label})`
      : `Changed more than expected in ${s.unit?.[1] || 'samples'} (${s.label})`;
  // the lists, one per source with a test: somatic sources by the upper tail, the germline source with a lower tail by its lower
  // tail (the dashed-ring rows of the waterfall); null while a file is being read
  function rankedLists() {
    const lists = [];
    for (const s of SRC) {
      const g = s.kind === 'germline';
      if (g) {
        if (!s.lower_tail || PR.gn?.source !== s.id) continue;
        const d = gnData();
        if (d === undefined) return null;
        if (d === null) continue;
      }
      const m = model(s);
      if (!m) return null;
      const rows = m.rows
        .map((r) => ({ ...r, qq: g ? r.ql : r.q, pp: g ? r.pl : r.pu }))
        .filter((r) => r.qq != null && r.qq < RING_Q);
      rows.sort(
        (a, b) =>
          (a.pp ?? 1) - (b.pp ?? 1) ||
          (g ? (a.o ?? 0) - (b.o ?? 0) : (b.o ?? 0) - (a.o ?? 0)) ||
          (a.acc < b.acc ? -1 : a.acc > b.acc ? 1 : a.pos - b.pos)
      );
      lists.push({ s, g, rows, n: m.n });
    }
    return lists;
  }
  function rankSection(l) {
    const { s, rows } = l,
      title = rankTitle(s),
      all = !!M.all[s.id],
      shown = all ? rows : rows.slice(0, RANK_N);
    const head =
      `<div class="mu-top"><div><h3>${esc(title)}</h3><p class="small muted">${int(rows.length)} ${rows.length === 1 ? 'site' : 'sites'} with q &lt; 0.05</p></div>` +
      (rows.length ? K.expBar(['pdf', 'svg', 'png', 'tsv'], 'murank', title, 'propensity') : '') +
      `</div>`;
    if (!rows.length)
      return `<section class="mu-rank" data-mu-rank="${esc(s.id)}">${head}<p class="muted small">${
        l.n ? `No ${esc(W.mark)} of the selection has q &lt; 0.05 here.` : `The selection has no ${esc(W.marks)}.`
      }</p></section>`;
    const body = shown
      .map((r) => {
        const note = r.hot ? `<br><span class="small muted">${esc(K.prop.hotNote(r.acc, r.hot, s.id))}</span>` : '';
        return (
          `<tr class="mu-go" data-mu-go="${esc(r.acc)}:${r.pos}"><td>${esc(geneOf(r.acc))}${note}</td>` +
          `<td><a href="${esc(K.link('protein', `${r.acc}/${r.pos}`))}">${esc(siteOnly(r))}</a></td>` +
          `<td class="num">${int(r.k)}</td><td class="num">${K.prop.fe(r.e)}</td><td class="num">${K.prop.fo(r.o)}</td><td class="num">${fpv(r.qq)}</td></tr>`
        );
      })
      .join('');
    return (
      `<section class="mu-rank" data-mu-rank="${esc(s.id)}">${head}` +
      `<div class="tbl-wrap"><table class="tbl mu-rt"><thead><tr><th>Gene</th><th>Site</th><th class="num">k</th><th class="num">Expected</th><th class="num">O/E</th><th class="num" title="p and q pool all cancer types">q</th></tr></thead><tbody>${body}</tbody></table></div>` +
      (rows.length > RANK_N
        ? `<p class="small"><button type="button" class="btn small" data-mu-all="${esc(s.id)}" aria-expanded="${all}">${all ? `Show the top ${RANK_N}` : `Show all ${int(rows.length)}`}</button></p>`
        : '') +
      `</section>`
    );
  }
  const rankTsv = (id) => {
    const l = (rankedLists() || []).find((x) => x.s.id === id);
    if (!l) return '';
    const g = l.g;
    return (
      K.preamble(
        rankTitle(l.s),
        `${l.s.long || l.s.label}; q < 0.05, sorted by p (${g ? 'fewer' : 'more'}); ${K.sel.describe() || 'every ' + W.mark}${g ? '' : `; ${hyper() ? 'with' : 'without'} hypermutated samples`}`
      ) +
      `rank\tgene\taccession\tsite\tk\texpected\toe\tp_${g ? 'fewer' : 'more'}\tq_${g ? 'fewer' : 'more'}\tprotein_flag\n` +
      l.rows
        .map((r, i) =>
          [
            i + 1,
            geneOf(r.acc),
            r.acc,
            siteOnly(r),
            r.k,
            r.e ?? '',
            r.o ?? '',
            r.pp ?? '',
            r.qq,
            r.hot ? K.prop.hotNote(r.acc, r.hot, l.s.id) : '',
          ].join('\t')
        )
        .join('\n') +
      '\n'
    );
  };
  function rankedBody() {
    const lists = rankedLists();
    if (!lists) return null;
    return lists.map(rankSection).join('');
  }
  K.clicks.push(
    [
      '[data-murank]',
      (b) => {
        const sec = b.closest('[data-mu-rank]'),
          id = sec.dataset.muRank,
          name = `${D.site.id}_ranked_sites_${id}`;
        return b.dataset.murank === 'tsv'
          ? K.exportFigure('tsv', null, name, b, () => rankTsv(id))
          : K.tableExport(b.dataset.murank, b, sec, { title: sec.querySelector('h3').textContent }, name, () =>
              rankTsv(id)
            );
      },
    ],
    ['[data-mu-all]', (b) => ((M.all[b.dataset.muAll] = !M.all[b.dataset.muAll]), K.render())],
    [
      '[data-mu-go]',
      (r, e) => {
        if (e?.target?.closest?.('a')) return;
        const [acc, pos] = r.dataset.muGo.split(':');
        goTo(acc, pos);
      },
    ]
  );

  // ---- Inherited disease: ClinVar pathogenic and likely pathogenic variants by disease family -------------------------------------
  const cvData = () => (PR.cv ? (get('cv', PR.cv.file), FILES['cv:v']) : null);
  // the release's family names, in American spelling
  const famName = (t) =>
    String(t)
      .replace(/behavioural/g, 'behavioral')
      .replace(/haematological/g, 'hematological');
  const starWord = (n) => `${n} ${n === 1 ? 'star' : 'stars'}`;
  let CV_IDX = null;
  // the rows (sites with at least one variant that passes the review filter), the columns (families with at least one), and
  // each cell's variants: [variation id, review stars, alt, [conditions]]. A variant counts once in each of its families.
  function clinvarModel() {
    const cv = cvData(),
      sites = selSites();
    if (!cv || !sites) return null;
    if (!CV_IDX || CV_IDX.cv !== cv) {
      const map = new Map();
      for (const [acc, list] of Object.entries(cv.sites)) for (const [pos, vs] of list) map.set(acc + ':' + pos, vs);
      CV_IDX = { cv, map };
    }
    const rows = [],
      tot = new Array(cv.fam.length).fill(0);
    for (const [acc, pos, res] of sites) {
      const vs = (CV_IDX.map.get(acc + ':' + pos) || []).filter((v) => v[1] >= M.stars);
      if (!vs.length) continue;
      const cells = new Map();
      for (const v of vs)
        for (const f of new Set(v[3].map((c) => cv.cond[c][1]))) {
          if (!cells.has(f)) cells.set(f, []);
          cells.get(f).push(v);
        }
      cells.forEach((a, f) => (tot[f] += a.length));
      rows.push({ acc, pos, res, vs, cells });
    }
    rows.sort((a, b) => b.vs.length - a.vs.length || (a.acc < b.acc ? -1 : a.acc > b.acc ? 1 : a.pos - b.pos));
    // by total, the catch-all family last
    const cols = cv.fam
      .map((_, i) => i)
      .filter((i) => tot[i])
      .sort((a, b) => (a === cv.other) - (b === cv.other) || tot[b] - tot[a] || a - b);
    const max = rows.reduce((m, r) => r.cells.forEach((a) => (m = Math.max(m, a.length))) || m, 0);
    return {
      cv,
      rows,
      cols,
      tot,
      max,
      nVar: rows.reduce((n, r) => n + r.vs.length, 0),
      nSites: rows.length,
      nSelected: sites.length,
    };
  }
  const cvLink = (id) => `https://www.ncbi.nlm.nih.gov/clinvar/variation/${id}/`;
  const varName = (r, v) => `${r.res || ''}${shownPos(r.acc, r.pos)}${v[2]}`;
  // a variant's conditions that put it in the family
  // all of a variant's condition names (ClinVar's own), the ones that put it in the family first
  const famConds = (g, f, v) => {
    const cs = v[3].map((c) => g.cv.cond[c]);
    return [...cs.filter((c) => c[1] === f), ...cs.filter((c) => c[1] !== f)].map((c) => c[0]);
  };
  // a cell's shade: one hue, from light (one variant) to full (the most in any cell), by the square root of the count
  const cellShade = (n, max, c) =>
    c.mix(c.seq[0], c.seq[1], Math.round(14 + 54 * Math.sqrt((n - 1) / Math.max(1, max - 1))));
  const cellTip = (g, r, f) => {
    const a = r.cells.get(f);
    return (
      `${siteName(r.acc, r.pos, r.res)} · ${famName(g.cv.fam[f])}: ${a.length} ${a.length === 1 ? 'variant' : 'variants'}\n` +
      a
        .slice(0, 6)
        .map((v) => `${varName(r, v)} · ${starWord(v[1])} · ${famConds(g, f, v).join('; ')}`.slice(0, 160))
        .join('\n') +
      (a.length > 6 ? `\nand ${a.length - 6} more (click the cell)` : '')
    );
  };
  function clinvarDetail(g) {
    const [key, fs] = M.cell.split('|'),
      f = +fs,
      r = g.rows.find((x) => x.acc + ':' + x.pos === key);
    const a = r?.cells.get(f);
    if (!a) return '';
    return (
      `<div class="mu-cvd"><h4>${esc(siteName(r.acc, r.pos, r.res))} · ${esc(famName(g.cv.fam[f]))}</h4><ul>` +
      a
        .map(
          (v) =>
            `<li><a href="${cvLink(v[0])}" target="_blank" rel="noopener">${esc(varName(r, v))}</a> (ClinVar ${v[0]}) · ${esc(starWord(v[1]))} · ${esc(famConds(g, f, v).join('; '))}</li>`
        )
        .join('') +
      `</ul></div>`
    );
  }
  function clinvarBody() {
    const g = clinvarModel();
    if (!g) return null;
    const stars = seg(
      'data-mu-stars',
      'Review',
      [
        [0, 'Any'],
        [1, '1+ stars'],
        [2, '2+ stars'],
      ],
      M.stars
    );
    if (!g.rows.length)
      return `<div class="mu-bar">${stars}</div><p class="muted">No ${esc(W.mark)} of the selection has a pathogenic or likely pathogenic ClinVar variant${M.stars ? ` with ${M.stars}+ review stars` : ''}.</p>`;
    const shown = g.rows.slice(0, M.rows);
    const th = g.cols
      .map(
        (f) => `<th class="mu-fam" title="${esc(famName(g.cv.fam[f]))}"><span>${esc(famName(g.cv.fam[f]))}</span></th>`
      )
      .join('');
    const tr = shown
      .map(
        (r) =>
          `<tr><th class="mu-site" scope="row"><a href="${esc(K.link('protein', `${r.acc}/${r.pos}`))}">${esc(siteName(r.acc, r.pos, r.res))}</a></th><td class="num mu-all">${int(r.vs.length)}</td>` +
          g.cols
            .map((f) => {
              const a = r.cells.get(f);
              return a
                ? `<td class="mu-c"><button type="button" class="mu-cell" style="background:${cellShade(a.length, g.max, THEME)}" data-mu-cell="${esc(r.acc)}:${r.pos}|${f}" aria-label="${esc(cellTip(g, r, f).split('\n')[0])}" data-prtip="${esc(cellTip(g, r, f))}">${int(a.length)}</button></td>`
                : '<td class="mu-c"></td>';
            })
            .join('') +
          `</tr>`
      )
      .join('');
    const key = [1, Math.max(2, Math.round(g.max / 2)), g.max]
      .filter((v, i, a) => v <= g.max && a.indexOf(v) === i)
      .map(
        (v) =>
          `<span class="pr-k"><span class="mu-sw" style="background:${cellShade(v, g.max, THEME)}"></span>${int(v)}</span>`
      )
      .join('');
    return (
      `<div class="mu-bar">${stars}</div>` +
      `<section class="mu-card mu-cv"><div class="mu-top"><p class="small muted">${int(g.nSites)} ${g.nSites === 1 ? esc(W.mark) : esc(W.marks)} with ${int(g.nVar)} ${g.nVar === 1 ? 'variant' : 'variants'}, in ${int(g.cols.length)} disease ${g.cols.length === 1 ? 'family' : 'families'}.</p>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'mucv', 'inherited disease', 'propensity')}</div>` +
      `<div class="tbl-wrap mu-cvw"><table class="tbl mu-cvt"><thead><tr><th class="mu-site">Site</th><th class="num">All</th>${th}</tr></thead><tbody>${tr}</tbody></table></div>` +
      (g.rows.length > shown.length
        ? `<p class="small"><button type="button" class="btn small" data-mu-more>Show ${Math.min(50, g.rows.length - shown.length)} more</button> <span class="muted">${int(shown.length)} of ${int(g.rows.length)} shown; the download has all.</span></p>`
        : '') +
      `<div id="mu-cvd" aria-live="polite">${M.cell ? clinvarDetail(g) : ''}</div>` +
      `<p class="pr-key small muted">${key}<span class="pr-k">variants per cell</span></p></section>`
    );
  }
  // the figure: the rows shown, the families as vertical labels
  function clinvarSvg(g, c, w) {
    const rows = g.rows.slice(0, M.rows),
      ml = 126,
      top = 176,
      rh = 15,
      n = g.cols.length,
      cw = Math.max(14, Math.min(30, (w - ml - 10) / n)),
      H = top + rows.length * rh + 14;
    let s = '';
    g.cols.forEach((f, k) => {
      const nm = famName(g.cv.fam[f]);
      s += `<text transform="translate(${(ml + k * cw + cw / 2 + 3.5).toFixed(1)},${top - 6}) rotate(-90)" font-size="10" fill="${c.ink}">${esc(nm.length > 34 ? nm.slice(0, 33) + '…' : nm)}</text>`;
    });
    s += `<text x="${ml - 24}" y="${top - 6}" text-anchor="end" font-size="10" fill="${c.muted}">all</text>`;
    rows.forEach((r, j) => {
      const y = top + j * rh;
      s += `<text x="${ml - 34}" y="${y + rh - 4}" text-anchor="end" font-size="10.5" fill="${c.ink}">${esc(siteName(r.acc, r.pos, r.res))}</text>`;
      s += `<text x="${ml - 24}" y="${y + rh - 4}" text-anchor="end" font-size="10.5" fill="${c.muted}">${int(r.vs.length)}</text>`;
      g.cols.forEach((f, k) => {
        const a = r.cells.get(f);
        const x = ml + k * cw;
        if (!a)
          return void (s += `<rect x="${x.toFixed(1)}" y="${y}" width="${(cw - 1).toFixed(1)}" height="${rh - 1}" fill="${c.mix(c.seq[0], c.seq[1], 4)}"/>`);
        const p = 14 + 54 * Math.sqrt((a.length - 1) / Math.max(1, g.max - 1));
        s += `<rect x="${x.toFixed(1)}" y="${y}" width="${(cw - 1).toFixed(1)}" height="${rh - 1}" fill="${c.mix(c.seq[0], c.seq[1], Math.round(p))}"/><text x="${(x + cw / 2 - 0.5).toFixed(1)}" y="${y + rh - 4}" text-anchor="middle" font-size="10" fill="${p > 50 ? '#ffffff' : c.ink}">${int(a.length)}</text>`;
      });
    });
    return { svg: s, H };
  }
  const cvNote = () =>
    `ClinVar pathogenic and likely pathogenic variants (clinsig_simple 1) at the ${W.marks} of the selection, by disease family; ${
      M.stars ? `${M.stars}+ review stars; ` : ''
    }a variant counts once in each of its families. The families are the release's rules applied to each condition name. ClinVar reflects clinical testing, so these counts are not tested.`;
  function clinvarFigure() {
    const g = clinvarModel(),
      f = clinvarSvg(g, LIGHT, 720);
    return K.figureFrame({
      title: 'Inherited disease: ClinVar pathogenic variants',
      sub: `${K.sel.describe() || 'every ' + W.mark}: ${int(g.nSites)} ${W.marks}, ${int(g.nVar)} variants`,
      body: `<g transform="translate(20,0)">${f.svg}</g>`,
      bodyH: f.H,
      W: 760,
      note: cvNote(),
    });
  }
  const clinvarTsv = () => {
    const g = clinvarModel();
    return (
      K.preamble(
        'Inherited disease: ClinVar pathogenic and likely pathogenic variants by disease family',
        `${K.sel.describe() || 'every ' + W.mark}; ${M.stars ? `${M.stars}+ review stars` : 'any review status'}; a variant is listed once for each family; conditions are ClinVar's, families the release's rules`
      ) +
      'site\taccession\tposition\tdisease_family\tvariation_id\tvariant\treview_stars\tconditions\n' +
      g.rows
        .flatMap((r) =>
          g.cols.flatMap((f) =>
            (r.cells.get(f) || []).map((v) =>
              [
                siteName(r.acc, r.pos, r.res),
                r.acc,
                r.pos,
                famName(g.cv.fam[f]),
                v[0],
                varName(r, v),
                v[1],
                v[3].map((c) => g.cv.cond[c][0]).join('; '),
              ].join('\t')
            )
          )
        )
        .join('\n') +
      '\n'
    );
  };
  K.clicks.push(
    [
      '[data-mu-stars]',
      (b) => ((M.stars = +b.dataset.muStars), (M.cell = ''), (M.rows = 50), K.writeHash?.(), K.render()),
    ],
    ['[data-mu-more]', () => ((M.rows += 50), K.render())],
    [
      '[data-mu-cell]',
      (b) => {
        M.cell = M.cell === b.dataset.muCell ? '' : b.dataset.muCell;
        K.render();
        if (M.cell) document.getElementById('mu-cvd')?.scrollIntoView({ block: 'nearest' });
      },
    ],
    [
      '[data-mucv]',
      (b) => K.exportFigure(b.dataset.mucv, clinvarFigure, `${D.site.id}_inherited_disease`, b, clinvarTsv),
    ]
  );

  const CHART_LINK = `<button type="button" class="mu-linkbtn" data-mu-view="waterfall">Show all sites as a chart</button>`;
  function view() {
    const page = (line, inner) =>
      `<div class="page-head results-head"><div><h2>Disease variants</h2>${line ? `<p class="cx">${line}</p>` : ''}</div></div>${inner}`;
    // while a file is read: the view buttons stay, and a block as tall as the page will be keeps the layout from jumping
    const viewBar = () =>
      `<div class="mu-bar">${seg(
        'data-mu-view',
        'View',
        [
          ['ranked', 'Ranked sites'],
          ['oncoprint', 'Cancer: tumors'],
          ...(PR.cv ? [['clinvar', 'Inherited disease']] : []),
        ],
        M.view
      )}</div>`;
    const head = (inner) => page('', viewBar() + `<div class="mu-skel" role="status">${inner}</div>`);
    if (!K.sel.data()) return head(K.loading(`Loading the ${W.marks}…`));
    const V = M.view === 'clinvar' && !PR.cv ? 'ranked' : M.view;
    const needWf = V !== 'clinvar',
      wf = needWf ? wfData() : null;
    if (needWf && (wf === undefined || (V === 'waterfall' && germ() && gnData() === undefined)))
      return head(K.loading('Loading the tumor, cell line and gnomAD counts…'));
    if (needWf && (wf === null || (V === 'waterfall' && germ() && gnData() === null)))
      return head('<p class="muted">The frequencies could not be read.</p>');
    const note = K.sel.active()
      ? ''
      : `<div class="filter-note">Nothing is selected, so this shows every ${esc(W.mark)}.</div>`;
    const tabs = seg(
      'data-mu-view',
      'View',
      [
        ['ranked', 'Ranked sites'],
        ['oncoprint', 'Cancer: tumors'],
        ...(PR.cv ? [['clinvar', 'Inherited disease']] : []),
      ],
      V
    );
    const bar = `<div class="mu-bar">${tabs}${controls(wf)}${V === 'waterfall' ? '' : CHART_LINK}</div>`;
    let line = '',
      body = '';
    if (V === 'ranked') {
      line = `Sites of the selection with more changes than expected in tumors or cell lines, or fewer inherited variants than expected.`;
      body = rankedBody();
      if (body === null)
        return page(line, note + bar + `<div class="mu-skel" role="status">${K.loading('Loading…')}</div>`);
    } else if (V === 'clinvar') {
      line = `Pathogenic and likely pathogenic ClinVar variants by disease family; click a cell to list them. ClinVar reflects clinical testing, so these counts are not tested.`;
      body = cvData() === undefined ? K.loading('Loading…') : clinvarBody();
      if (body === null)
        body = cvData() === null ? '<p class="muted">The variants could not be read.</p>' : K.loading('Loading…');
    } else if (V === 'waterfall') {
      const m = model();
      if (!m) return page('', note + bar + `<div class="mu-skel" role="status">${K.loading('Loading…')}</div>`);
      const w0 = wfWidth();
      const zoom = seg(
        'data-mu-zoom',
        'Show',
        [
          [0, 'All'],
          [1000, 'Top 1,000'],
          [100, 'Top 100'],
        ],
        M.zoom
      );
      const nUp = m.rows.filter((r) => r.y > 0).length,
        nDn = m.rows.filter((r) => r.y < 0).length,
        ringUp = m.rows.filter((r) => r.q != null && r.q < RING_Q).length,
        nZero = m.rows.filter((r) => r.y === 0).length,
        nNone = m.rows.filter((r) => r.y == null).length;
      line = `${int(m.n)} ${esc(W.marks)}: ${int(nUp)} above 0 (${int(ringUp)} with q &lt; 0.05), ${int(nDn)} below${m.germ ? ` (${int(m.nFewer)} with q &lt; 0.05)` : ''}, ${int(nZero)} at 0 (O/E 1), ${int(nNone)} drawn at 0 with no stored test.`;
      body =
        `<section class="mu-card"><h3>All sites as a chart</h3><div class="mu-top mu-end">${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'muwf', 'all sites as a chart', 'propensity')}</div>` +
        `<div class="mu-bar">${zoom}</div>` +
        `<svg id="mu-svg" class="mu-svg" viewBox="0 0 ${w0} ${wfHeight(w0)}" tabindex="0" role="img" aria-label="Chart of the signed score of each site, ranked from most to least enriched. Use the arrow keys to step through the sites.">${wfInner(m, w0)}</svg>` +
        `<p id="mu-read" class="small mu-read" aria-live="polite">Hover, tap or focus the chart to read a ${esc(W.mark)}.</p>` +
        labelForm() +
        geneForm(m) +
        `<p class="pr-key small muted"><span class="pr-k"><svg width="26" height="10" aria-hidden="true"><path d="M0 5H26" stroke="var(--muted)" stroke-width="1.4" stroke-opacity="0.8"/></svg>${esc(W.residues)} that are not ${esc(W.marks)}, ranks scaled to the number of ${esc(W.marks)}</span>` +
        `<span class="pr-k"><span class="mu-grad" aria-hidden="true"></span>point color: O/E, from 1/8 (blue) through 1 (gray) to 8 (red)</span>` +
        `<span class="pr-k"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink)" stroke-width="1.5"/><circle cx="9" cy="9" r="4" fill="var(--wf-hot)" stroke="var(--ink)" stroke-width="0.8"/></svg>ring: q &lt; 0.05, more than expected</span>` +
        (M.genes.length
          ? `<span class="pr-k"><svg width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="9.5" fill="none" stroke="var(--accent)" stroke-width="2.2"/><circle cx="11" cy="11" r="3.4" fill="var(--wf-mid)" stroke="var(--ink)" stroke-width="0.8"/></svg>outline: a site of a listed gene</span>`
          : '') +
        (m.germ
          ? `<span class="pr-k"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2.5 2"/><circle cx="9" cy="9" r="4" fill="var(--wf-cold)" stroke="var(--ink)" stroke-width="0.8"/></svg>dashed ring: q &lt; 0.05, fewer than expected</span>`
          : '') +
        `</p></section>`;
    } else {
      const o = onco();
      if (!o) return page('', note + bar + `<div class="mu-skel" role="status">${K.loading('Loading…')}</div>`);
      line = `${int(o.top.length)} of the ${int(o.nSites)} ${esc(W.marks)} with a changed tumor${M.group ? ` in ${esc(M.group)}` : ''}; hypermutated tumors are ${hyper() ? 'included' : 'left out'}.`;
      if (!o.top.length)
        body = `<p class="muted">No ${esc(W.mark)} of the selection has a tumor with a change${hyper() ? '' : ' (hypermutated tumors left out)'}.</p>`;
      else {
        const f = oncoprintSvg(o, { ...ONC_THEME }, 760, ['var(--onc-1)', 'var(--onc-2)'], true);
        body =
          `<section class="mu-card"><div class="mu-top"><h3>Top sites across TCGA tumors</h3>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'muon', 'top sites across TCGA tumors', 'propensity')}</div>` +
          `<svg id="mu-svg" class="mu-svg" viewBox="0 0 760 ${f.H}" role="img" aria-label="Top sites across TCGA tumors, with the tumors that carry them">${f.svg}` +
          `<rect id="mu-hover" class="mu-link" x="${f.ml}" y="0" width="${f.pw}" height="${f.H}" fill="transparent" data-prtip=""/></svg>` +
          `<p class="pr-key small muted"><span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--onc-1)"/></svg>missense change</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--onc-2)"/></svg>stop gained</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--muted)"/></svg>burden, below the threshold</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--onc-3)"/></svg>burden, hypermutated</span></p></section>`;
      }
    }
    const extra = V === 'waterfall' ? (model() ? zeroSection(model()) : '') + setSummary() : '';
    return page(line, `${note}${bar}${body}${extra}${V === 'clinvar' ? '' : chosenSection()}`);
  }
  const ONC_THEME = {
    ink: 'var(--ink)',
    muted: 'var(--muted)',
    line: 'var(--line-strong)',
    hyp: 'var(--onc-3)',
    track: 'var(--surface-2)',
  };
  const ONC_LIGHT = { ink: '#1f2937', muted: '#9ca3af', line: '#cbd5e1', hyp: '#1baf7a', track: '#f1f5f9' };

  // ---- hovering ------------------------------------------------------------------------------------------------------------------
  document.addEventListener('mousemove', (e) => {
    const r = e.target.id === 'mu-hover' ? e.target : null;
    if (!r) return;
    const box = r.getBoundingClientRect(),
      f = (e.clientX - box.left) / box.width;
    if (M.view === 'waterfall') {
      if (LAST.m) inspect(rowAt(f), r);
    } else if (M.view === 'oncoprint') {
      const o = onco();
      if (!o || !o.cols.length) return;
      const box2 = document.getElementById('mu-svg').getBoundingClientRect(),
        sc = 760 / box2.width,
        x = (e.clientX - box2.left) * sc;
      const g = oncoGeo(o, 760);
      const k = Math.floor((x - g.ml) / g.cw);
      if (k < 0 || k >= o.cols.length) return;
      const smp = o.oc.samples[o.cols[k]];
      const has = o.top.filter((_, jj) => o.has[jj].has(o.cols[k])).map((rr) => siteName(rr.acc, rr.pos, rr.res));
      r.setAttribute(
        'data-prtip',
        `TCGA-${smp[0]} · ${o.oc.projects[smp[1]]}\n${smp[3]} coding calls per Mb${smp[2] ? ' (hypermutated)' : ''}\nchanged: ${has.join(', ')}\nclick to open the card of the row`
      );
    }
  });
  // a click on an oncoprint row opens that site's card, as a row of the Sites table does
  document.addEventListener('click', (e) => {
    if (e.target.id === 'mu-hover' && M.view === 'waterfall' && LAST.m?.n) {
      const box = e.target.getBoundingClientRect(),
        i = rowAt((e.clientX - box.left) / box.width);
      inspect(i, e.target);
      const r = LAST.m.rows[i];
      if (!toggleLabel(r.acc + ':' + r.pos))
        document.getElementById('mu-read').textContent += ` (At most ${MAX_LABELS} labels.)`;
      return;
    }
    if (e.target.id !== 'mu-hover' || M.view !== 'oncoprint') return;
    const o = onco();
    if (!o) return;
    const box = document.getElementById('mu-svg').getBoundingClientRect(),
      y = ((e.clientY - box.top) * 760) / box.width,
      g = oncoGeo(o, 760),
      j = Math.floor((y - g.y0) / g.rowH);
    if (j >= 0 && j < o.top.length)
      location.hash = K.link('protein', `${o.top[j].acc}/${o.top[j].pos}`).replace(/^[^#]*#/, '');
  });
  // the arrow keys step through the ranks (shift: 10, page keys: 100); Enter opens the card, Space labels the site
  document.addEventListener('keydown', (e) => {
    if (e.target.id !== 'mu-svg' || M.view !== 'waterfall' || !LAST.m?.n) return;
    const n = LAST.f.shown,
      k = e.key;
    let i = LAST.cur ?? 0;
    const r = LAST.m.rows[i];
    if (k === 'ArrowRight' || k === 'ArrowDown') i += e.shiftKey ? 10 : 1;
    else if (k === 'ArrowLeft' || k === 'ArrowUp') i -= e.shiftKey ? 10 : 1;
    else if (k === 'PageDown') i += 100;
    else if (k === 'PageUp') i -= 100;
    else if (k === 'Home') i = 0;
    else if (k === 'End') i = n - 1;
    else if (k === 'Enter' && LAST.cur != null)
      return void (location.hash = K.link('protein', `${r.acc}/${r.pos}`).replace(/^[^#]*#/, ''));
    else if (k === ' ' && LAST.cur != null) return void (e.preventDefault(), toggleLabel(r.acc + ':' + r.pos));
    else return;
    e.preventDefault();
    inspect(Math.max(0, Math.min(n - 1, i)));
  });
  // controls
  K.clicks.push(
    ['[data-mu-view]', (b) => ((M.view = b.dataset.muView), (M.cell = ''), K.writeHash?.(), K.render())],
    ['[data-mu-src]', (b) => ((M.src = b.dataset.muSrc), (M.group = ''), K.render())],
    ['[data-mu-zoom]', (b) => ((M.zoom = +b.dataset.muZoom), K.render())]
  );
  document.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-mu-ct]')) {
      M.group = e.target.value;
      K.render();
    }
  });
  K.prop.onHyper(() => {
    if (S.view === 'mutations') K.render();
  });

  // ---- downloads -----------------------------------------------------------------------------------------------------------------
  function waterfallFigure() {
    const m = model(),
      f = waterfallSvg(m, LIGHT, 720);
    return K.figureFrame({
      title: 'Mutation propensity of the sites',
      sub: `${K.sel.describe() || 'every ' + W.mark}: ${int(m.n)} ${W.marks}, ${m.s.long || m.s.label}`,
      body: `<g transform="translate(20,0)">${f.body}${f.labels}</g>`,
      bodyH: f.H,
      W: 760,
      note: waterfallNote(m).replace(/<[^>]+>/g, ''),
    });
  }
  const waterfallTsv = () => {
    const m = model(),
      g = (v) => v ?? '';
    return (
      K.preamble(
        'Mutation propensity of the sites',
        `${m.s.long || m.s.label}${m.germ ? '' : `; ${hyper() ? 'with' : 'without'} hypermutated samples, all cancer types`}; signed_score = -log10 of the upper-tail p when O/E > 1, log10 of the lower-tail p when O/E < 1, 0 at O/E 1 (empty: no test); ` +
          (m.germ
            ? "p and q from the release; summed_allele_frequency = the sum of the variants' allele frequencies (ac / an)"
            : `p_more and q_more from the release; p_fewer ${m.lowerOk ? "computed by this explorer with the release's binomial (Binomial(n, expected / n), P(X <= k))" : 'not available'}`)
      ) +
      `rank\taccession\tsite\tk\texpected\toe\tp_more\tp_fewer\tq_more\t${m.germ ? 'q_fewer\tsummed_allele_frequency\t' : 'changed_samples\tsamples_profiled\t'}signed_score\n` +
      m.rows
        .map((r, i) =>
          [
            i + 1,
            r.acc,
            siteName(r.acc, r.pos, r.res),
            r.k,
            g(r.e),
            g(r.o),
            g(r.pu),
            g(r.pl),
            g(r.q),
            ...(m.germ ? [g(r.ql), r.af] : [r.m, m.den]),
            r.y == null ? '' : +r.y.toFixed(3),
          ].join('\t')
        )
        .join('\n') +
      '\n'
    );
  };
  function oncoFigure() {
    const o = onco(),
      f = oncoprintSvg(o, ONC_LIGHT, 720, ['#2a78d6', '#eb6834']);
    return K.figureFrame({
      title: 'Top sites across TCGA tumors',
      sub: `${K.sel.describe() || 'every ' + W.mark}: ${int(o.top.length)} ${W.marks}, ${int(o.cols.length)} tumors`,
      body: `<g transform="translate(20,0)">${f.svg}</g>`,
      bodyH: f.H,
      W: 760,
      note: oncoNote(o).replace(/<[^>]+>/g, ''),
    });
  }
  const oncoTsv = () => {
    const o = onco();
    return (
      K.preamble(
        'Top sites across TCGA tumors',
        `${hyper() ? 'with' : 'without'} hypermutated tumors; sample burden from sample_burden`
      ) +
      'site\taccession\tsample_id\tproject\tchange\tcoding_calls_per_mb\thypermutated\n' +
      o.top
        .flatMap((r) =>
          r.cells.map((v) => {
            const s = o.oc.samples[v >> 1];
            return [
              siteName(r.acc, r.pos, r.res),
              r.acc,
              'TCGA-' + s[0],
              o.oc.projects[s[1]],
              v & 1 ? 'stop' : 'missense',
              s[3],
              s[2] ? 'yes' : 'no',
            ].join('\t');
          })
        )
        .join('\n') +
      '\n'
    );
  };
  K.clicks.push(
    [
      '[data-muwf]',
      (b) => K.exportFigure(b.dataset.muwf, waterfallFigure, `${D.site.id}_sites_chart`, b, waterfallTsv),
    ],
    ['[data-muon]', (b) => K.exportFigure(b.dataset.muon, oncoFigure, `${D.site.id}_top_sites_tcga_tumors`, b, oncoTsv)]
  );

  K.views.mutations = { render: view, title: () => 'Disease variants', follows: true };
  K.tabs.push(() => ['mutations', 'Disease variants', K.sel?.active() ? 'selection' : null]);

  // ---- Method and Help ----------------------------------------------------------------------------------------------------------
  const sumC = (kind, source, cohort) => {
    const r = (PR.summary?.controls || []).filter((x) => x.kind === kind && x.source === source && x.cohort === cohort);
    const n = (res) => r.filter((x) => x.result === res).reduce((a, x) => a + x.n, 0);
    return { pass: n('pass'), fail: n('fail'), nt: n('not_tested'), all: r.reduce((a, x) => a + x.n, 0) };
  };
  (K.methodParts ||= []).push(() => {
    const ctl = ['oncohistone', 'recurrent hotspot']
      .map((kind) =>
        ['tcga_mc3', 'depmap_24q4']
          .map((src) => ['all', 'no_hypermutated'].map((co) => ({ kind, src, co, ...sumC(kind, src, co) })))
          .flat()
      )
      .flat()
      .filter((x) => x.all);
    const lab = { tcga_mc3: 'TCGA', depmap_24q4: 'DepMap' };
    const val = (PR.summary?.validation || []).filter((v) => v.cohort === 'all');
    return (
      `<section id="m-propensity"><h3>Mutation propensity</h3>` +
      `<p>For each candidate residue (every known ${esc(W.mark)}, and every other residue of the same type with a change), the release counts the tumor samples and cell lines with a missense or stop change there, and the ClinVar and gnomAD variants that cause one (k). It compares k with the count the residue's codon predicts. ` +
      `The expected count is n × w / Σw. Here n is the number of changes or variants at the protein's residues of the same type, w is the residue's expected rate of change (the rate of each base change that alters the residue, summed over its codon, each in its trinucleotide context), and Σw is the sum of w over those residues. ` +
      `k is tested against Binomial(n, w / Σw). O/E is k over the expected count. q is the Benjamini–Hochberg value over every residue tested for the source and residue type. ` +
      `The weights need a coding sequence that translates to the UniProt sequence (18,717 of 20,416 reviewed entries). For any other entry, O/E treats every residue of the type as equally likely and there is no q. ` +
      `The release's data dictionary defines every column (<a href="https://github.com/Shechterlab/PTM_Pipeline/blob/v1.7.0/releases/v1.7.0/README.md" target="_blank" rel="noopener">PTM_Pipeline v1.7.0, README</a>). The only calculation the site adds is the lower tail for TCGA and DepMap, below.</p>` +
      `<p>TCGA and DepMap use each source's own spectrum: the residue-changing single-base changes in the coding sequences, per trinucleotide class. ClinVar and gnomAD use gnomAD's germline rates (mutation_rate_methylation_bins, from <a href="https://doi.org/10.1038/s41586-020-2308-7" target="_blank" rel="noopener">Karczewski et al., Nature 581:434 (2020)</a>, gnomAD v2.1.1).</p>` +
      `<p>Hypermutated samples have more than ${PR.hypermutated.per_mb} coding calls per Mb (<a href="https://pubmed.ncbi.nlm.nih.gov/29056344/" target="_blank" rel="noopener">Campbell et al., Cell 171:1042 (2017)</a>). The cards and pages leave them out by default. The release repeats the test without them, using the spectrum of the remaining samples. A switch puts them back.</p>` +
      `<p>For a site you picked beforehand, read the raw p. q corrects across every residue of that type tested in that source, which such a site does not need. The Holm p corrects only for the sites you chose, over their tails and sources. Choose the sites before you look at the results.</p>` +
      `<p>ClinVar variants reflect clinical testing and submission more than how often residues change, so its O/E is descriptive: no ring, no q. gnomAD also has a lower tail (fewer variants than expected); a dashed ring marks q &lt; 0.05 there.</p>` +
      `<p>On the cancer and germline cards, stick height is the count in the card's table, circle size grows with O/E, and a ring marks q &lt; 0.05.</p>` +
      `<p>Expected counts are within a protein. Where the residues of a type that are themselves enriched (q &lt; 0.05) carry ${Math.round((PR.hotspot?.min_share ?? 0.3) * 100)}% or more of a protein's changes or variants (and the protein has at least ${PR.hotspot?.min_changes ?? 20}), such as TP53 R273, R248 and R175, the expected count at its other residues is inflated and they look depleted. The explorer flags such a protein per source and cohort, names up to three of those residues on the waterfall tooltip, the site card and the tested-sites table, and leaves its ${esc(W.marks)} out of the default waterfall labels. You can still label them. The flag changes no count, expected value, O/E, p or q.</p>` +
      `<p><b>Disease variants page.</b> It has three views of the sites of your selection, or of every ${esc(W.mark)} when nothing is selected, and a chart of all sites. Hypermutated tumors are left out unless you choose With hypermutated. Cancer types are pooled, so p and q do not change with them.</p>` +
      `<p><b>Ranked sites.</b> Each table lists the sites with q &lt; 0.05 in one source, ranked by p, with the top 20 shown and a Show all button. The first two (tumors, cell lines) hold sites with more changes than expected (q is the release's, for the upper tail). The third holds sites with fewer inherited gnomAD variants than expected (q for the lower tail, the dashed-ring sites of the chart). k is the count, expected the count the residue's codon predicts, and O/E their ratio. A protein flagged as dominated by a few enriched residues (see above) says so in its row. A row opens the site's card.</p>` +
      `<p><b>Cancer: tumors.</b> This is an oncoprint. The ${esc(W.marks)} with the most changed TCGA tumors are the rows, the tumors that carry them are the columns, and the bar above each tumor is its coding calls per Mb from the release's sample_burden (capped at 40; the dashed line is the hypermutated threshold). A tumor with two changes at one site counts once, so a table that counts changes can show a higher number.</p>` +
      `<p><b>Inherited disease.</b> Each row is a ${esc(W.mark)} with at least one ClinVar variant classified pathogenic or likely pathogenic (clinsig_simple 1 in the release's ClinVar change tables). Columns are disease families. Each condition name of a variant (split at | and ;; "not specified", "not provided" and "see cases" dropped) gets the family of the first rule it matches in the release's name rules for its DisGeNET disease families (PTM_Pipeline scripts/disease_families.py), applied here to ClinVar condition names and read as text when the explorer is built, so a few conditions can land in a broader family than a specialist would choose; the detail of a cell always lists ClinVar's own condition names; a name no rule matches goes to Other / unassigned, which is listed last. A variant counts once in each of its families, so a row's cells can add up to more than its All count. A cell is the number of variants, shaded from light (one) to full (the most in any cell); click it to list the variants, their conditions and review stars, with links to ClinVar. The review filter keeps variants with at least that many ClinVar review stars. A variant that names no condition is not shown. These counts come from clinical testing and submission, not from a test against expectation, so they carry no p or q.</p>` +
      `<p><b>All sites as a chart.</b> The chart ranks the sites from the most enriched to the most depleted. Height is the signed −log10 p: −log10 of the upper-tail p for a site with O/E above 1, log10 of the lower-tail p for a site with O/E below 1. A site with no change has O/E 0 and sits on the lower side; one with a small expected count has no stored test and is drawn at 0. The release gives the lower tail for gnomAD only. For TCGA and DepMap this explorer computes it at build time with the release's own model, P(X ≤ k) for Binomial(n, expected / n), after checking that this model gives back the release's p_upper for every row; it has no q. Circles are colored by O/E and a solid ring marks q &lt; 0.05; a dashed ring marks q &lt; 0.05 for fewer variants than expected (gnomAD). The gray curve is the same score for ${esc(W.residues)} that are not ${esc(W.marks)}, with ranks scaled to the number of ${esc(W.marks)}. The top and bottom sites are labeled, except those of a flagged protein; click a point to label it too (up to 20, kept in the address). Highlight genes outlines every site of the genes you paste and labels each one's most extreme site; it changes no statistic. Under the chart, a table lists the ${esc(W.marks)} with no change, most expected first, with the raw lower-tail p. Whole list against expectation is the release's own test for the site set.</p>` +
      `<p>The page counts the sites this explorer counts, so a count can be lower than the release table's, which also holds sites the explorer shows without counting (UniProt records by similarity, for example).</p>` +
      (ctl.length
        ? `<p>Positive controls (H3 oncohistone residues and recurrent cancer hotspots; <a href="https://doi.org/10.1038/nbt.3391" target="_blank" rel="noopener">Chang et al., Nat Biotechnol 34:155 (2016)</a>). A control passes when q &lt; 0.05. A failed control is reported here and does not block the release.</p>` +
          `<div class="tbl-card"><table class="tbl"><thead><tr><th>Controls</th><th>Source</th><th>Samples</th><th>Pass</th><th>Fail</th><th>Not tested</th></tr></thead><tbody>` +
          ctl
            .map(
              (x) =>
                `<tr><td>${esc(x.kind)}</td><td>${esc(lab[x.src])}</td><td>${x.co === 'all' ? 'all' : 'without hypermutated'}</td><td>${int(x.pass)}</td><td>${int(x.fail)}</td><td>${int(x.nt)}</td></tr>`
            )
            .join('') +
          `</tbody></table></div>`
        : '') +
      (val.length
        ? `<p>As a check, on up to 1,000 protein and residue-type units per source, the binomial p and a permutation p (each unit's changes redrawn over its residues by mutability, ${int(val[0].iterations || 10000)} draws) agree on whether p &lt; 0.05 for ${val
            .map(
              (v) =>
                `${(100 * v.agreement_p05).toFixed(1)}% of ${int(v.residues)} residues (${esc({ tcga_mc3: 'TCGA', depmap_24q4: 'DepMap', clinvar: 'ClinVar', gnomad_v4_1: 'gnomAD' }[v.source] || v.source)})`
            )
            .join(', ')}.</p>`
        : '') +
      `</section>`
    );
  });
  const st = document.createElement('style');
  st.id = 'kit-mutations-css';
  st.textContent = [
    ':root{--onc-1:#2a78d6;--onc-2:#eb6834;--onc-3:#1baf7a;--wf-hot:#e34948;--wf-cold:#2a78d6;--wf-mid:#f0efec}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--onc-1:#3987e5;--onc-2:#d95926;--onc-3:#199e70;--wf-hot:#e66767;--wf-cold:#3987e5;--wf-mid:#383835}}:root[data-theme="dark"]{--onc-1:#3987e5;--onc-2:#d95926;--onc-3:#199e70;--wf-hot:#e66767;--wf-cold:#3987e5;--wf-mid:#383835}',
    '.mu-skel{min-height:26rem}.mu-end{justify-content:flex-end}.mu-linkbtn{border:0;background:none;color:var(--accent);cursor:pointer;font:inherit;text-decoration:underline;padding:0}.mu-rank{margin:1.2rem 0;max-width:720px}.mu-rank h3{margin:.2rem 0}.mu-rank p{margin:.1rem 0}.mu-rt .num,.mu-cvt .num{text-align:right;font-variant-numeric:tabular-nums}.mu-rt td:first-child{min-width:8rem}.mu-go{cursor:pointer}.mu-go:hover td{background:var(--surface-2)}',
    '.mu-cv{max-width:100%}.mu-cvw{max-width:100%;overflow-x:auto}.mu-cvt{border-collapse:separate;border-spacing:0}.mu-cvt .mu-site{position:sticky;left:0;z-index:1;background:var(--surface);text-align:left;white-space:nowrap;padding-right:.6rem}.mu-fam{height:11rem;vertical-align:bottom;padding:.2rem .1rem;width:2rem;min-width:2rem}.mu-fam span{writing-mode:vertical-rl;transform:rotate(180deg);display:block;max-height:10.5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:.78rem}.mu-c{padding:1px;text-align:center}.mu-all{color:var(--muted);padding:0 .5rem}.mu-cell{display:block;width:100%;min-width:1.9rem;height:1.6rem;border:0;border-radius:3px;font:inherit;font-size:.8rem;color:var(--ink);cursor:pointer}.mu-cell:hover,.mu-cell:focus-visible{outline:2px solid var(--ink)}.mu-sw{display:inline-block;width:18px;height:12px;border:1px solid var(--line-strong);vertical-align:-1px;margin-right:4px}.mu-cvd{margin:.8rem 0}.mu-cvd h4{margin:.2rem 0}.mu-cvd ul{margin:.3rem 0;padding-left:1.1rem;font-size:.9rem}',
    '.mu-bar{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;align-items:center;margin:.8rem 0}.mu-ctl{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center}',
    '.mu-ct{display:inline-flex;align-items:center;gap:.4rem}.mu-ct select{font:inherit;padding:.25rem .4rem;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--ink);max-width:14rem}',
    '.mu-card{margin:.6rem 0;max-width:800px}.mu-top{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:flex-start;justify-content:space-between}.mu-top p{flex:1 1 24rem;margin:0}',
    '.mu-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0}.mu-chip{border:1px solid var(--line-strong);border-radius:999px;padding:.1rem .2rem .1rem .6rem;font-size:.85rem}.mu-chip button{border:0;background:none;color:var(--muted);cursor:pointer;font-size:1rem}.mu-add{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}.mu-add textarea{font:inherit;padding:.3rem .5rem;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--ink);width:min(28rem,100%);resize:vertical}.mu-add input{font:inherit;padding:.3rem .5rem;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--ink);width:10rem}.mu-chosen,.mu-zero{margin:1.2rem 0;max-width:900px}.mu-grad{display:inline-block;width:56px;height:10px;border:1px solid var(--line-strong);background:linear-gradient(90deg,var(--wf-cold),var(--wf-mid),var(--wf-hot))}.mu-setline{margin:.4rem 0}.mu-link{cursor:pointer}.mu-link text{fill:var(--ink)}.mu-link:hover text,.mu-link:focus text{text-decoration:underline}.mu-link:focus{outline:2px solid var(--accent);outline-offset:1px}.mu-svg{width:100%;height:auto;display:block;margin:.4rem 0}.mu-svg a{text-decoration:none}.mu-hover{cursor:pointer}.mu-read{min-height:3.6em;margin:.3rem 0}.mu-set{margin:1rem 0}.mu-set summary{cursor:pointer}',
  ].join('');
  document.head.appendChild(st);
});
