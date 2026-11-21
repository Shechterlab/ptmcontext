/* The Mutation frequency page (#mutations): two views of the sites of the current selection (the whole site list when nothing
   is selected, a site set or any search or filter otherwise), from the release's frequency tables (data/wf.json, data/onco.json;
   ptmcontext/web/propensity.py writes them, read when the page opens):
     waterfall   every site ranked from the most enriched to the most depleted (x) by the signed -log10 p of the release's test (y: up
                 for more than expected, the upper-tail p; down for fewer, the lower-tail p); a gray curve shows the other residues of the
                 same type on the same score, their ranks scaled to the number of sites. p and q are pooled over the cancer types.
                 Labels: the top and bottom sites and the ones the reader adds (wl in the address), placed without overlap.
     oncoprint   the sites with the most changed samples (rows) against the TCGA tumors that carry them (columns), joined to the
                 sample's burden: coding calls per Mb, with the hypermutated threshold marked.
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
  const M = { src: SRC[0].id, group: '', view: 'waterfall', zoom: 0, chosen: [], labels: [] };
  const MAX_CHOSEN = 20,
    MAX_LABELS = 20;
  K.paramsIn.push((p) => {
    M.src = SRC.some((s) => s.id === p.get('ms')) ? p.get('ms') : SRC[0].id;
    M.group = p.get('mg') || '';
    M.view = p.get('mv') === 'oncoprint' ? 'oncoprint' : 'waterfall';
    M.zoom = [100, 1000].includes(+p.get('mz')) ? +p.get('mz') : 0;
    const list = (v, n) =>
      (v || '')
        .split(',')
        .filter((x) => /^[A-Z0-9-]+:\d+$/i.test(x))
        .slice(0, n);
    M.chosen = list(p.get('mt'), MAX_CHOSEN);
    M.labels = list(p.get('wl'), MAX_LABELS);
  });
  K.paramsOut.push((p) => {
    if (M.chosen.length) p.set('mt', M.chosen.join(','));
    if (S.view !== 'mutations') return;
    if (M.src !== SRC[0].id) p.set('ms', M.src);
    if (M.group) p.set('mg', M.group);
    if (M.view !== 'waterfall') p.set('mv', M.view);
    if (M.zoom) p.set('mz', String(M.zoom));
    if (M.labels.length) p.set('wl', M.labels.join(','));
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
  function model() {
    const s = sourceOf(),
      sites = selSites();
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
  // the labeled sites: the top and bottom of the ranking (3 each end on a phone, 5 otherwise) and the sites the reader added
  const defaultLabels = (m, shown, phone) => {
    const t = phone ? 3 : 5,
      out = [];
    for (let i = 0; i < Math.min(t, shown, m.n); i++) if ((m.rows[i].y ?? 0) > 0) out.push(i);
    if (shown === m.n)
      for (let i = m.n - 1; i >= Math.max(m.n - t, 0); i--) if ((m.rows[i].y ?? 0) < 0 && !out.includes(i)) out.push(i);
    return out;
  };
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
      tw = (s) => Math.round(s.length * fs * 0.58 + 4);
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
    const want = [...user, ...defaultLabels(m, shown, phone).filter((i) => !user.includes(i))];
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
        lab = marked.has(i);
      if (!lab && !(ring ? far(lastRing, x, y, 6) && far(lastAny, x, y, 2) : far(lastAny, x, y, 3))) return;
      lastAny = [x, y];
      if (ring) lastRing = [x, y];
      const xs = x.toFixed(1),
        ysx = y.toFixed(1);
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
      body: `<path d="${b}" fill="none" stroke="${c.bg}" stroke-width="2.2" stroke-dasharray="5 3"/>` + ax + pts,
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
    `The dashed gray curve is the same score for ${esc(W.residues)} that are not ${esc(W.marks)}, ranks scaled to the number of ${esc(W.marks)}. ` +
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
  document.addEventListener('submit', (e) => {
    if (!e.target.matches?.('[data-mu-lform]')) return;
    e.preventDefault();
    const msg = e.target.querySelector('[data-mu-lmsg]'),
      hit = (K.sel.parse(e.target.querySelector('[data-mu-lsite]').value).sites || [])[0];
    if (!hit) {
      msg.textContent = 'Not found. Type a gene and a residue, as in H4 R3.';
      return;
    }
    const key = `${D.proteins[hit[0]][0]}:${hit[1]}`,
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
    const s = sourceOf(),
      groups = wf.groups[s.id] || [],
      wfView = M.view === 'waterfall';
    return (
      `<div class="mu-ctl">` +
      (SRC.length > 1 && wfView
        ? seg(
            'data-mu-src',
            'Source',
            SRC.map((x) => [x.id, x.label]),
            M.src
          )
        : '') +
      (wfView
        ? ''
        : `<label class="mu-ct"><span class="seg-l">Cancer type</span><select data-mu-ct aria-label="Cancer type"><option value="">All cancer types</option>` +
          groups
            .map((g) => `<option value="${esc(g)}"${g === M.group ? ' selected' : ''}>${esc(gname(g))}</option>`)
            .join('') +
          `</select></label>`) +
      (wfView && germ() ? '' : K.prop.hyperSwitch('Samples')) +
      `</div>`
    );
  }
  // one line for the whole list when it is the site set of the release (site_set_propensity): the set's own test
  function setLine(m) {
    const rows = PR.summary?.sets || [];
    if (K.sel.active() || !rows.length || !m.s.set_source) return '';
    const cohort = m.germ || hyper() ? 'all' : 'no_hypermutated';
    const num = (v) => (v == null ? '–' : v >= 100 ? int(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
    const fp = (v) => (v == null ? '–' : v < 0.001 ? v.toExponential(1) : v.toPrecision(2));
    const lines = rows
      .filter((r) => r.source === m.s.set_source && r.cohort === cohort)
      .map((r) => {
        let t = `observed ${int(r.observed)}, expected ${num(r.expected)}, O/E ${num(r.oe)}`;
        if (r.oe_status === 'descriptive') t += ' (descriptive)';
        else if (r.oe < 1)
          t += `; fewer than expected, p = ${fp(r.p_lower)} (permutation, ${int(PR.summary.iterations || 0)} draws)`;
        else if (r.oe > 1)
          t += `; more than expected, p = ${fp(r.p_upper)} (permutation, ${int(PR.summary.iterations || 0)} draws)`;
        return `${PR.residues.length > 1 ? esc(r.residue) + ': ' : ''}${esc(t)}`;
      });
    return lines.length ? `<p class="small mu-setline"><b>This set:</b> ${lines.join('<br>')}</p>` : '';
  }
  function setSummary() {
    const rows = PR.summary?.sets || [];
    if (!rows.length || K.sel.active()) return '';
    const pick = rows.filter((r) => ['tcga_mc3', 'depmap_24q4', 'clinvar', 'gnomad_v4_1'].includes(r.source));
    const lab = { tcga_mc3: 'TCGA', depmap_24q4: 'DepMap', clinvar: 'ClinVar', gnomad_v4_1: 'gnomAD' };
    const fo = (v) => (v == null ? '–' : v >= 10 ? v.toFixed(0) : v.toFixed(2));
    const fp = (v) => (v == null ? '–' : v < 0.001 ? v.toExponential(1) : v.toFixed(3));
    return (
      `<details class="mu-set"><summary>Whole list against expectation (the release's site set test)</summary>` +
      `<p class="small muted">${esc(PR.summary.set_label || '')}: the observed changes at the ${esc(W.marks)} against the expected changes, summed over their proteins (each protein's changes at its residues of the type, times the ${esc(W.marks)}' share of its mutability). p comes from ${int(PR.summary.iterations || 10000)} permutation draws; the smallest possible p is about 1e−4. This table does not change with your selection.</p>` +
      `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Source</th><th>Residue</th><th>Samples</th><th>${esc(cap1(W.marks))}</th><th>Observed</th><th>Expected</th><th>O/E</th><th>p (more)</th><th>p (fewer)</th></tr></thead><tbody>` +
      pick
        .map(
          (r) =>
            `<tr><td>${esc(lab[r.source] || r.source)}${r.oe_status === 'descriptive' ? ' <span class="muted">(descriptive)</span>' : ''}</td><td>${esc(r.residue)}</td><td>${r.cohort === 'no_hypermutated' ? 'without hypermutated' : 'all'}</td><td>${int(r.sites)}</td><td>${int(r.observed)}</td><td>${fo(r.expected)}</td><td>${fo(r.oe)}</td><td>${fp(r.p_upper)}</td><td>${fp(r.p_lower)}</td></tr>`
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
      here = D.site.id,
      list = (sibs() || []).filter((s) => s.id !== here && letter && (s.residues || []).includes(letter));
    return (
      `not in this explorer (it covers ${esc(coversWords())}).` +
      (list.length
        ? ` Test it in the ${list
            .map(
              (s) =>
                `<a href="../${encodeURIComponent(s.id)}/#mutations?mt=${encodeURIComponent(key)}">${esc(s.id)}</a>`
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
    const { rows, n } = chosenRows();
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
              : `<tr><td>${esc(chosenName(r.key))}</td><td>${esc(r.s.label)}</td><td>${int(r.v.k ?? 0)}</td><td>${K.prop.fe(r.v.e)}</td><td>${K.prop.fo(r.v.o)}</td>` +
                (r.s.descriptive
                  ? `<td colspan="4" class="muted">descriptive: no test</td>`
                  : `<td>${fpv(r.v.p)}</td><td>${r.s.lower_tail ? fpv(r.v.pl) : '–'}</td><td>${fpv(r.more)}</td><td>${r.s.lower_tail ? fpv(r.fewer) : '–'}</td>`) +
                `</tr>`
      )
      .join('');
    return (
      `<section class="mu-chosen" id="mu-chosen"><h3>Test the sites you chose</h3>` +
      `<p class="small muted">Choose sites before looking at the results. The adjusted p corrects only for the sites you chose (Holm, over ${int(n)} p values here). ` +
      `Up to ${MAX_CHOSEN} sites; they are kept in the address. Samples follow the hypermutated switch above.</p>` +
      `<form class="mu-add" data-mu-form>` +
      `<input id="mu-site" type="text" autocomplete="off" placeholder="H4 R3" data-mu-site aria-label="Add a site, as a gene and a position"> ` +
      `<button type="submit" class="btn small"${M.chosen.length >= MAX_CHOSEN ? ' disabled' : ''}>Add</button> <span class="small muted" data-mu-msg role="status"></span></form>` +
      (M.chosen.length
        ? `<p class="mu-chips">${M.chosen
            .map(
              (k) =>
                `<span class="mu-chip">${esc(chosenName(k))} <button type="button" data-mu-del="${esc(k)}" aria-label="Remove ${esc(chosenName(k))}">×</button></span>`
            )
            .join(' ')}</p>` +
          `<div class="mu-top"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Site</th><th>Source</th><th>k</th><th>Expected</th><th>O/E</th><th>p (more)</th><th>p (fewer)</th><th>Adjusted p (more)</th><th>Adjusted p (fewer)</th></tr></thead><tbody>${body}</tbody></table></div>` +
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
  document.addEventListener('submit', (e) => {
    if (!e.target.matches?.('[data-mu-form]')) return;
    e.preventDefault();
    const input = e.target.querySelector('[data-mu-site]'),
      msg = e.target.querySelector('[data-mu-msg]');
    const q = K.sel.parse(input.value);
    const hit = (q.sites || [])[0];
    if (!hit) {
      msg.textContent = 'Not found. Type a gene and a residue, as in H4 R3.';
      return;
    }
    const key = `${D.proteins[hit[0]][0]}:${hit[1]}`;
    if (!addSite(key)) msg.textContent = M.chosen.includes(key) ? 'Already added.' : `At most ${MAX_CHOSEN} sites.`;
    else K.render();
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
          ? 'Added to tested sites'
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
      `<button type="button" class="btn small" data-mu-add="${esc(acc)}:${pos}"${M.chosen.includes(`${acc}:${pos}`) ? ' disabled' : ''}>${M.chosen.includes(`${acc}:${pos}`) ? 'Already in tested sites' : 'Add to tested sites'}</button>`,
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
      `<p class="small muted">${esc(m.s.long || m.s.label)}: the ${esc(W.marks)} of the selection with none, most expected first. The top rows are the most surprising, since they should have shown ${m.germ ? 'variants' : 'changes'}. ` +
      `${hasP ? `p is the raw p of the lower tail (none or fewer)${m.germ ? ', from the release' : ", computed by this explorer with the release's binomial"}. ` : 'The release gives no p for this tail in a somatic source. '}` +
      `The table lists the ${int(PR.zero_rows || 1000)} sites with the most expected per source${hasP ? ', and every site with a raw p below 0.05' : ''}.</p>` +
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

  function view() {
    const head =
      `<div class="page-head results-head"><div><h2>Mutation frequency</h2><p class="cx">How often each ${esc(W.mark)} of the selection is changed ` +
      `in tumors or cell lines, or carries a gnomAD variant, and which tumors carry the most changes. Hypermutated tumors are left out unless you include them.</p></div></div>`;
    if (!K.sel.data()) return head + K.loading(`Loading the ${W.marks}…`);
    const wf = wfData();
    if (wf === undefined || (germ() && M.view === 'waterfall' && gnData() === undefined))
      return head + K.loading('Loading the frequencies…');
    if (wf === null || (germ() && M.view === 'waterfall' && gnData() === null))
      return head + '<p class="muted">The frequencies could not be read.</p>';
    const note = K.sel.active()
      ? ''
      : `<div class="filter-note">Nothing is selected, so this shows every ${esc(W.mark)}.</div>`;
    const tabs = seg(
      'data-mu-view',
      'View',
      [
        ['waterfall', 'Waterfall'],
        ['oncoprint', 'Oncoprint'],
      ],
      M.view
    );
    let body = '';
    if (M.view === 'waterfall') {
      const m = model();
      if (!m) return head + K.loading('Loading…');
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
        nNone = m.rows.filter((r) => r.y == null).length;
      body =
        `<section class="mu-card"><div class="mu-top"><p class="small muted">${waterfallNote(m)}</p>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'muwf', 'mutation frequency', 'propensity')}</div>` +
        setLine(m) +
        `<p class="small">${int(m.n)} ${esc(W.marks)}: ${int(nUp)} above 0 (${int(ringUp)} with q &lt; 0.05), ${int(nDn)} below${m.germ ? ` (${int(m.nFewer)} with q &lt; 0.05)` : ''}, ${int(nNone)} drawn at 0 with no stored test.</p><div class="mu-bar">${zoom}</div>` +
        `<svg id="mu-svg" class="mu-svg" viewBox="0 0 ${w0} ${wfHeight(w0)}" tabindex="0" role="img" aria-label="Waterfall of the signed score of each site, ranked from most to least enriched. Use the arrow keys to step through the sites.">${wfInner(m, w0)}</svg>` +
        `<p id="mu-read" class="small mu-read" aria-live="polite">Hover, tap or use the arrow keys to read a ${esc(W.mark)}. Click a point to label it; click a label to open its card.</p>` +
        labelForm() +
        `<p class="pr-key small muted"><span class="pr-k"><svg width="26" height="10" aria-hidden="true"><path d="M0 5H26" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 3"/></svg>${esc(W.residues)} that are not ${esc(W.marks)}, ranks scaled to the number of ${esc(W.marks)}</span>` +
        `<span class="pr-k"><span class="mu-grad" aria-hidden="true"></span>point color: O/E, from 1/8 (blue) through 1 (gray) to 8 (red)</span>` +
        `<span class="pr-k"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink)" stroke-width="1.5"/><circle cx="9" cy="9" r="4" fill="var(--wf-hot)" stroke="var(--ink)" stroke-width="0.8"/></svg>solid ring: q &lt; 0.05, more than expected</span>` +
        (m.germ
          ? `<span class="pr-k"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2.5 2"/><circle cx="9" cy="9" r="4" fill="var(--wf-cold)" stroke="var(--ink)" stroke-width="0.8"/></svg>dashed ring: q &lt; 0.05, fewer than expected</span>`
          : '') +
        `</p></section>`;
    } else {
      const o = onco();
      if (!o) return head + K.loading('Loading…');
      if (!o.top.length)
        body = `<p class="muted">No ${esc(W.mark)} of the selection has a tumor with a change${hyper() ? '' : ' (hypermutated tumors left out)'}.</p>`;
      else {
        const f = oncoprintSvg(o, { ...ONC_THEME }, 760, ['var(--onc-1)', 'var(--onc-2)'], true);
        body =
          `<section class="mu-card"><div class="mu-top"><p class="small muted">${oncoNote(o)}</p>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'muon', 'oncoprint', 'propensity')}</div>` +
          `<svg id="mu-svg" class="mu-svg" viewBox="0 0 760 ${f.H}" role="img" aria-label="Oncoprint of the top sites across TCGA tumors">${f.svg}` +
          `<rect id="mu-hover" class="mu-link" x="${f.ml}" y="0" width="${f.pw}" height="${f.H}" fill="transparent" data-prtip=""/></svg>` +
          `<p class="small muted">Click a ${esc(W.mark)} name or a row to open its card.</p>` +
          `<p class="pr-key small muted"><span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--onc-1)"/></svg>missense change</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--onc-2)"/></svg>stop gained</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--muted)"/></svg>burden, below the threshold</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--onc-3)"/></svg>burden, hypermutated</span></p></section>`;
      }
    }
    return `${head}${note}<div class="mu-bar">${tabs}${controls(wf)}</div>${body}${M.view === 'waterfall' ? (model() ? zeroSection(model()) : '') + setSummary() : ''}${chosenSection()}`;
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
    } else {
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
    ['[data-mu-view]', (b) => ((M.view = b.dataset.muView), K.render())],
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
      title: 'Oncoprint of the top sites in TCGA',
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
        'Oncoprint of the top sites in TCGA',
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
      (b) =>
        K.exportFigure(b.dataset.muwf, waterfallFigure, `${D.site.id}_mutation_frequency_waterfall`, b, waterfallTsv),
    ],
    ['[data-muon]', (b) => K.exportFigure(b.dataset.muon, oncoFigure, `${D.site.id}_oncoprint`, b, oncoTsv)]
  );

  K.views.mutations = { render: view, title: () => 'Mutation frequency', follows: true };
  K.tabs.push(() => ['mutations', 'Mutation frequency', K.sel?.active() ? 'selection' : null]);

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
      `<p>For each candidate residue (every known ${esc(W.mark)}, and every other residue of the same type with a change), the release counts the tumor samples, cell lines, ClinVar variations or gnomAD variants with a missense or stop change there (k). It compares k with the count the residue's codon predicts. ` +
      `The expected count is n × w / Σw. Here n is the number of changes at the protein's residues of the same type, w is the residue's mutability (the rate of each base change that alters the residue, summed over its codon, each in its trinucleotide context), and Σw is the sum of w over those residues. ` +
      `k is tested against Binomial(n, w / Σw). O/E is k over the expected count. q is the Benjamini–Hochberg value over every residue tested for the source and residue type. ` +
      `The weights need a coding sequence that translates to the UniProt sequence (18,717 of 20,416 reviewed entries). For any other entry, O/E treats every residue of the type as equally likely and there is no q. ` +
      `The release's data dictionary defines every column (<a href="https://github.com/Shechterlab/PTM_Pipeline/blob/v1.7.0/releases/v1.7.0/README.md" target="_blank" rel="noopener">PTM_Pipeline v1.7.0, README</a>). The only calculation the site adds is the lower tail for TCGA and DepMap, below.</p>` +
      `<p>TCGA and DepMap use each source's own spectrum: the residue-changing single-base changes in the coding sequences, per trinucleotide class. ClinVar and gnomAD use gnomAD's germline rates (mutation_rate_methylation_bins, from <a href="https://doi.org/10.1038/s41586-020-2308-7" target="_blank" rel="noopener">Karczewski et al., Nature 581:434 (2020)</a>, gnomAD v2.1.1).</p>` +
      `<p>Hypermutated samples have more than ${PR.hypermutated.per_mb} coding calls per Mb (<a href="https://pubmed.ncbi.nlm.nih.gov/29056344/" target="_blank" rel="noopener">Campbell et al., Cell 171:1042 (2017)</a>). The cards and pages leave them out by default. The release repeats the test without them, using the spectrum of the remaining samples. A switch puts them back.</p>` +
      `<p>For a site you picked beforehand, read the raw p. The q value corrects across about 650,000 residues, which such a site does not need. The Holm p corrects only for the sites you chose, over their tails and sources. Choose the sites before you look at the results.</p>` +
      `<p>ClinVar variants reflect clinical testing and submission more than mutation, so its O/E is descriptive: no ring, no q. gnomAD also has a lower tail (fewer variants than expected); a dashed ring marks q &lt; 0.05 there.</p>` +
      `<p>On the cancer and germline cards, stick height is the count in the card's table, circle size grows with O/E, and a ring marks q &lt; 0.05.</p>` +
      `<p>On the Mutation frequency page, the waterfall ranks the sites of the selection from the most enriched to the most depleted. Height is the signed −log10 p: −log10 of the upper-tail p for a site with O/E above 1, log10 of the lower-tail p for a site with O/E below 1. A site with no change has O/E 0 and sits on the lower side. The release gives the lower tail for gnomAD only. For TCGA and DepMap this explorer computes it at build time with the release's own model, P(X ≤ k) for Binomial(n, expected / n), after checking that this model gives back the release's p_upper for every row; it has no q. Circles are colored by O/E and a solid ring marks q &lt; 0.05; a dashed ring marks q &lt; 0.05 for fewer variants than expected (gnomAD). The gray curve is the same score for ${esc(W.residues)} that are not ${esc(W.marks)}, with ranks scaled to the number of ${esc(W.marks)}. The page counts the sites this explorer counts, so a count can be lower than the release table's, which also holds sites the explorer shows without counting (UniProt records by similarity, for example). The oncoprint joins the sites with the most changed TCGA tumors to those tumors' sample_burden by sample id.</p>` +
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
    '.mu-bar{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;align-items:center;margin:.8rem 0}.mu-ctl{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center}',
    '.mu-ct{display:inline-flex;align-items:center;gap:.4rem}.mu-ct select{font:inherit;padding:.25rem .4rem;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--ink);max-width:14rem}',
    '.mu-card{margin:.6rem 0;max-width:800px}.mu-top{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:flex-start;justify-content:space-between}.mu-top p{flex:1 1 24rem;margin:0}',
    '.mu-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0}.mu-chip{border:1px solid var(--line-strong);border-radius:999px;padding:.1rem .2rem .1rem .6rem;font-size:.85rem}.mu-chip button{border:0;background:none;color:var(--muted);cursor:pointer;font-size:1rem}.mu-add{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}.mu-add input{font:inherit;padding:.3rem .5rem;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--ink);width:10rem}.mu-chosen,.mu-zero{margin:1.2rem 0;max-width:900px}.mu-grad{display:inline-block;width:56px;height:10px;border:1px solid var(--line-strong);background:linear-gradient(90deg,var(--wf-cold),var(--wf-mid),var(--wf-hot))}.mu-setline{margin:.4rem 0}.mu-link{cursor:pointer}.mu-link text{fill:var(--ink)}.mu-link:hover text,.mu-link:focus text{text-decoration:underline}.mu-link:focus{outline:2px solid var(--accent);outline-offset:1px}.mu-svg{width:100%;height:auto;display:block;margin:.4rem 0}.mu-svg a{text-decoration:none}.mu-hover{cursor:pointer}.mu-read{min-height:3.6em;margin:.3rem 0}.mu-set{margin:1rem 0}.mu-set summary{cursor:pointer}',
  ].join('');
  document.head.appendChild(st);
});
