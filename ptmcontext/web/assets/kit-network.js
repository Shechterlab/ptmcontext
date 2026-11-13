/* The network view (website.network): one network of the site's proteins (the selection's, when there is one), grouped
   into clusters and each cluster named by its most enriched term.
     nodes     proteins with sites; size is the number of sites. By default the top N by site count; isolated ones are dropped.
     edges     the sources the site file lists (a scored table such as STRING physical links, curated complexes): solid for
               the scored source, dashed for complexes, thicker where both hold; each source has a switch.
     clusters  Louvain communities (kit-netcore.js); a cluster smaller than the minimum, or past the eighth, is grey "Other".
     labels    the term of the smallest hypergeometric p in the cluster against the network's proteins (q on hover).
     colour    by cluster (default) or by any "colour by" the site file lists (a share of the protein's sites, or the commonest
               value among them); cluster names stay on the figure as labels and outlines.
   The default network is precomputed (data/network.json); a selection or another option makes it again in the browser from
   data/network_full.json, both read when the view is opened. Hover shows gene, sites, cluster and term; a click opens the
   protein page. The table view (cluster, term, q, proteins) is the same network without the figure. SVG, PNG and TSV exports
   carry the citations. A module of the site kit; without website.network (or in the one-file copy) it does nothing. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, esc, int, S } = K;
  const NC = D.network;
  if (!NC || !K.netcore) return;
  const OPT = NC.options,
    SRC = NC.sources,
    CB = NC.color_by || [];
  const TITLE = NC.title || 'Network';
  const NCOL = 8;
  // categorical slots (the data-viz palette, validated for colour-vision deficiency in both modes; every colour is also
  // named in the key and the table, which is the non-visual equivalent) and the grey of "Other"
  const CAT = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  };
  const OTHER = { light: '#9aa3a8', dark: '#7d8c97' };
  const RAMP = {
    light: ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'],
    dark: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'],
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const seqHex = (v, mode) => {
    const st = RAMP[mode],
      x = Math.max(0, Math.min(1, v)) * (st.length - 1),
      i = Math.min(st.length - 2, Math.floor(x)),
      a = hex(st[i]),
      b = hex(st[i + 1]),
      t = x - i;
    return (
      '#' +
      a
        .map((c, k) =>
          Math.round(c + (b[k] - c) * t)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    );
  };
  const catVar = (k) => `var(--nw-${k + 1})`;
  // ---- state: the reader's options, kept in this browser ----------------------------------------------------------------
  const DEF = {
    score: OPT.min_score,
    top: OPT.top,
    minc: OPT.min_cluster,
    src: SRC.map((_, i) => i),
    colour: 'cluster',
  };
  const KEY = 'ptmc-network:' + (D.site?.id || '');
  const UI = { ...DEF, zoom: 1, mode: 'network', hi: -1, find: '', pin: null, hide: [] };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    ['score', 'top', 'minc', 'src', 'colour'].forEach((k) => s[k] != null && (UI[k] = s[k]));
    if (!OPT.steps.includes(UI.score)) UI.score = DEF.score;
    if (UI.colour !== 'cluster' && !CB.some((c) => c.id === UI.colour)) UI.colour = 'cluster';
  } catch (e) {
    /* no storage: the defaults */
  }
  const save = () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ score: UI.score, top: UI.top, minc: UI.minc, src: UI.src, colour: UI.colour })
      );
    } catch (e) {
      /* no storage */
    }
  };
  const isDefault = () =>
    !K.sel?.active() &&
    UI.score === DEF.score &&
    UI.top === DEF.top &&
    UI.colour === 'cluster' &&
    UI.src.length === DEF.src.length;
  // ---- the files, read when the view first needs them ---------------------------------------------------------------------
  const FILE = { view: null, full: null };
  const wait = {};
  const load = (k) => {
    if (FILE[k] || wait[k]) return FILE[k];
    wait[k] = fetch(NC.files[k])
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (k === 'full') {
          const E = j.edges,
            e = [];
          for (let i = 0; i < E.length; i += 4) e.push([E[i], E[i + 1], E[i + 2], E[i + 3]]);
          j.nodes = j.acc.map((a, i) => [a, j.gene[i], j.sites[i]]);
          j.edges = e;
          j.byAcc = new Map(j.acc.map((a, i) => [a, i]));
        }
        FILE[k] = j;
        delete wait[k];
        if (S.view === 'network') K.render();
      })
      .catch((err) => {
        FILE[k] = { error: String(err.message || err) };
        if (S.view === 'network') K.render();
      });
    return null;
  };
  // ---- the model: nodes with their cluster, edges, labels ---------------------------------------------------------------
  const optNow = () => ({ ...OPT, top: UI.top, min_score: UI.score });
  let cache = { key: '', M: null };
  function model() {
    const sel = K.sel?.active();
    if (sel && !K.sel.data()) return { wait: 'marks' };
    const key = JSON.stringify([
      UI.score,
      UI.top,
      UI.src,
      UI.colour === 'cluster' ? 0 : 1,
      sel ? K.sel.describe() : '',
    ]);
    if (cache.key === key && cache.M) return cache.M;
    let M;
    if (isDefault()) {
      const v = load('view');
      if (!v) return { wait: 'network' };
      if (v.error) return { error: v.error };
      M = {
        nodes: v.nodes.map((a, i) => ({ acc: a, gene: v.gene[i], sites: v.sites[i], c: v.comm[i], g: -1 })),
        edges: v.edges,
        labels: v.labels,
      };
    } else {
      const f = load('full');
      if (!f) return { wait: 'network' };
      if (f.error) return { error: f.error };
      const pick = sel ? new Set(f.acc.map((a, i) => (K.sel.protSelected(a) ? i : -1)).filter((i) => i >= 0)) : null;
      const v = K.netcore.makeView(f, optNow(), pick, UI.src);
      M = {
        nodes: v.nodes.map((g, i) => ({ acc: f.acc[g], gene: f.gene[g], sites: f.sites[g], c: v.comm[i], g })),
        edges: v.edges,
        labels: v.labels,
        full: f,
        picked: pick ? pick.size : null,
      };
    }
    M.deg = M.nodes.map(() => 0);
    M.edges.forEach(([a, b]) => {
      M.deg[a]++;
      M.deg[b]++;
    });
    cache = { key, M };
    return M;
  }
  // clusters as drawn: the colour slot, or grey "Other" (smaller than the minimum, or past the palette)
  function clusters(M) {
    const n = M.labels.length;
    const out = M.labels.map((l, c) => {
      const size = l.n,
        other = size < UI.minc || c >= NCOL;
      return {
        c,
        n: size,
        other,
        slot: other ? -1 : c,
        term: l.term,
        l,
        name: l.term || `Cluster ${c + 1} (no enriched term)`,
      };
    });
    return {
      list: out,
      nOther: out.filter((x) => x.other).length,
      protsOther: out.filter((x) => x.other).reduce((s, x) => s + x.n, 0),
      n,
    };
  }
  // ---- the layout: deterministic, clusters seeded apart, then forces ------------------------------------------------------
  const GOLD = 2.399963;
  const rOf = (s) => Math.min(13, 2.4 + 1.1 * Math.sqrt(s));
  function layout(M, w, h) {
    const n = M.nodes.length,
      C = M.labels.length,
      cx = w / 2,
      cy = h / 2,
      R = Math.min(w, h) * 0.44;
    const seed = M.labels.map((_, c) => {
      const a = c * GOLD,
        d = R * Math.sqrt((c + 0.35) / Math.max(1, C));
      return [cx + d * Math.cos(a), cy + d * Math.sin(a) * (h / w) * 1.15];
    });
    const seen = new Array(C).fill(0),
      P = M.nodes.map((nd) => {
        const k = seen[nd.c]++,
          a = k * GOLD,
          d = 9 * Math.sqrt(k);
        return {
          x: seed[nd.c][0] + d * Math.cos(a),
          y: seed[nd.c][1] + d * Math.sin(a),
          vx: 0,
          vy: 0,
          r: rOf(nd.sites),
          c: nd.c,
        };
      });
    const k0 = Math.sqrt((w * h) / Math.max(n, 1)) * 0.9,
      T = 240;
    for (let t = 0; t < T; t++) {
      const temp = (1 - t / T) * k0 * 0.9 + 0.4;
      for (const p of P) {
        p.vx = 0;
        p.vy = 0;
      }
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          let dx = P[i].x - P[j].x,
            dy = P[i].y - P[j].y,
            d2 = dx * dx + dy * dy;
          if (d2 > 9 * k0 * k0) continue;
          if (d2 < 0.01) {
            dx = 0.1 * ((i % 7) - 3);
            dy = 0.1;
            d2 = dx * dx + dy * dy;
          }
          const d = Math.sqrt(d2),
            f = ((k0 * k0) / d / d) * (P[i].c === P[j].c ? 1 : 2.2);
          P[i].vx += dx * f;
          P[i].vy += dy * f;
          P[j].vx -= dx * f;
          P[j].vy -= dy * f;
        }
      for (const [a, b, fl] of M.edges) {
        const dx = P[a].x - P[b].x,
          dy = P[a].y - P[b].y,
          d = Math.sqrt(dx * dx + dy * dy) || 0.01,
          f = (d / k0) * (fl & (fl - 1) ? 1.4 : 1) * (P[a].c === P[b].c ? 1 : 0.3);
        P[a].vx -= dx * f;
        P[a].vy -= dy * f;
        P[b].vx += dx * f;
        P[b].vy += dy * f;
      }
      for (const p of P) {
        const s = seed[p.c];
        p.vx += (s[0] - p.x) * 0.02 + (cx - p.x) * 0.002;
        p.vy += (s[1] - p.y) * 0.02 + (cy - p.y) * 0.002;
        const m = Math.hypot(p.vx, p.vy) || 1,
          step = Math.min(m, temp);
        p.x += (p.vx / m) * step;
        p.y += (p.vy / m) * step;
      }
    }
    // fit the box, keeping the aspect
    const pad = 30,
      x0 = Math.min(...P.map((p) => p.x)),
      x1 = Math.max(...P.map((p) => p.x)),
      y0 = Math.min(...P.map((p) => p.y)),
      y1 = Math.max(...P.map((p) => p.y)),
      s = Math.min((w - 2 * pad) / Math.max(1, x1 - x0), (h - 2 * pad) / Math.max(1, y1 - y0));
    P.forEach((p) => {
      p.x = (w - (x1 - x0) * s) / 2 + (p.x - x0) * s;
      p.y = (h - (y1 - y0) * s) / 2 + (p.y - y0) * s;
    });
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const dx = P[i].x - P[j].x,
            dy = P[i].y - P[j].y,
            d = Math.hypot(dx, dy) || 0.01,
            min = P[i].r + P[j].r + 1.5;
          if (d < min) {
            const m = (min - d) / 2 / d;
            P[i].x += dx * m;
            P[i].y += dy * m;
            P[j].x -= dx * m;
            P[j].y -= dy * m;
            moved = true;
          }
        }
      if (!moved) break;
    }
    return P;
  }
  const hull = (pts) => {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]),
      lo = [],
      up = [];
    for (const q of p) {
      while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
      lo.push(q);
    }
    for (const q of p.slice().reverse()) {
      while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
      up.push(q);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  // ---- colours ---------------------------------------------------------------------------------------------------------------
  const colourSpec = (M) =>
    UI.colour === 'cluster' ? null : (M.full?.color || []).find((c) => c.id === UI.colour) || null;
  // the fill of a node: a CSS value on the page, a literal hex in an export
  function fillOf(M, CL, i, ex) {
    const nd = M.nodes[i],
      sp = colourSpec(M),
      mode = ex ? 'light' : null;
    const other = ex ? OTHER.light : 'var(--nw-other)';
    if (!sp) {
      const s = CL.list[nd.c].slot;
      return s < 0 ? other : ex ? CAT.light[s] : catVar(s);
    }
    const v = sp.v[nd.g];
    if (sp.kind === 'sequential') {
      if (v == null) return other;
      if (ex) return seqHex(v, 'light');
      return `color-mix(in srgb, var(--nw-hi) ${Math.round(v * 100)}%, var(--nw-lo))`;
    }
    return v < 0 || v >= NCOL ? other : mode ? CAT.light[v] : catVar(v);
  }
  // ---- the figure ---------------------------------------------------------------------------------------------------------------
  // a phone gets a narrower, taller drawing, so that its proteins are not drawn smaller than a finger; an export is always wide
  let VW = 940;
  const fit = (exporting) => {
    VW = !exporting && matchMedia('(max-width: 760px)').matches ? 600 : 940;
  };
  const vh = (M) =>
    Math.round(
      VW < 700
        ? Math.min(820, Math.max(520, 400 + Math.sqrt(M.nodes.length) * 24))
        : Math.min(720, Math.max(440, 330 + Math.sqrt(M.nodes.length) * 21))
    );
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  const hit = (M) => {
    const q = UI.find.trim().toUpperCase();
    if (!q) return new Set();
    const toks = q.split(/[\s,;]+/).filter(Boolean);
    return new Set(
      M.nodes
        .map((nd, i) => (toks.includes(nd.gene.toUpperCase()) || toks.includes(nd.acc) ? i : -1))
        .filter((i) => i >= 0)
    );
  };
  function svgOf(M, CL, P, ex) {
    const h = vh(M),
      found = hit(M),
      dim = (i) => (UI.hi >= 0 && M.nodes[i].c !== UI.hi) || (found.size && !found.has(i) && !ex);
    const ink = ex ? '#111827' : 'var(--ink)',
      bg = ex ? '#ffffff' : 'var(--surface)',
      line = ex ? '#8a979e' : 'var(--nw-edge)';
    const parts = [];
    // outlines of the clusters (a soft hull; dashed when the colour is another one, so the clusters stay visible)
    const byC = M.labels.map(() => []);
    P.forEach((p, i) => byC[M.nodes[i].c].push([p.x, p.y, i]));
    const other = UI.colour !== 'cluster';
    CL.list.forEach((x) => {
      if (x.other || byC[x.c].length < 3) return;
      const hl = hull(byC[x.c]),
        col = ex ? CAT.light[x.slot] : catVar(x.slot),
        d = 'M' + hl.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
      parts.push(
        `<path d="${d}" fill="${col}" fill-opacity="${other ? 0.04 : 0.1}" stroke="${col}" stroke-opacity="${other ? 0.8 : 0.28}" ` +
          `stroke-width="${other ? 1.6 : 14}" stroke-linejoin="round"${other ? ' stroke-dasharray="5 4"' : ''} ` +
          `${UI.hi >= 0 && UI.hi !== x.c ? 'opacity="0.25" ' : ''}/>`
      );
    });
    // edges: solid for the scored source, dashed for a group source, thicker where two sources agree
    const gbit = SRC.map((s, i) => (s.kind === 'groups' ? 1 << i : 0)).reduce((a, b) => a | b, 0);
    M.edges.forEach(([a, b, fl, sc], k) => {
      const two = fl & (fl - 1),
        solid = fl & ~gbit,
        d = !solid && fl ? ' stroke-dasharray="4 3"' : '',
        o = dim(a) || dim(b) ? 0.07 : 0.5;
      parts.push(
        `<line x1="${P[a].x.toFixed(1)}" y1="${P[a].y.toFixed(1)}" x2="${P[b].x.toFixed(1)}" y2="${P[b].y.toFixed(1)}" ` +
          `stroke="${line}" stroke-opacity="${o}" stroke-width="${two ? 2.2 : 1 + (solid && sc >= 900 ? 0.4 : 0)}"${d} data-e="${k}"/>`
      );
    });
    P.forEach((p, i) => {
      const nd = M.nodes[i],
        f = fillOf(M, CL, i, ex),
        ring = found.has(i)
          ? ' stroke-width="3" ' + (ex ? 'stroke="#111827"' : 'stroke="var(--ink)"')
          : ` stroke="${bg}" stroke-width="1.2"`;
      const c =
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" fill="${f}"${ring}` +
        `${dim(i) ? ' opacity="0.18"' : ''}/>`;
      parts.push(
        ex
          ? c
          : `<a href="${esc(K.link('protein', nd.acc))}" class="nw-n" data-nn="${i}" aria-label="${esc(nd.gene)}, ${int(nd.sites)} ${esc(W.marks)}">${c}</a>`
      );
    });
    // labels: clusters (their term) and the biggest proteins and the ones searched for
    const items = [];
    CL.list.forEach((x) => {
      if (x.other || !byC[x.c].length) return;
      const pts = byC[x.c],
        mx = pts.reduce((s, q) => s + q[0], 0) / pts.length,
        my = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      items.push({ x: mx, y: my, r: 0, t: clip(x.term || `Cluster ${x.c + 1}`, 34), cl: true });
    });
    const genes = [
      ...found,
      ...M.nodes
        .map((_, i) => i)
        .sort((a, b) => M.nodes[b].sites - M.nodes[a].sites)
        .slice(0, 8),
    ]
      .filter((i, k, a) => a.indexOf(i) === k && !dim(i))
      .slice(0, Math.max(found.size, 8))
      .map((i) => ({ x: P[i].x, y: P[i].y, r: P[i].r, t: M.nodes[i].gene }));
    const place = K.hl?.place;
    if (place) {
      const pc = place(
        items,
        [4, VW - 4, 12, h - 4],
        12,
        genes.map((g) => [g.x - g.r, g.y - g.r, g.x + g.r, g.y + g.r])
      );
      const pg = place(
        genes,
        [4, VW - 4, 12, h - 4],
        9.5,
        pc.map((o) => o.box)
      );
      const txt = (o, size, wt) => {
        const a = `x="${o.x.toFixed(1)}" y="${o.y.toFixed(1)}" font-size="${size}" font-weight="${wt}" text-anchor="${o.anchor}"`;
        return `<text ${a} stroke="${bg}" stroke-width="3.5" stroke-linejoin="round" fill="${bg}">${esc(o.t)}</text><text ${a} fill="${ink}">${esc(o.t)}</text>`;
      };
      pc.forEach((o) => parts.push(txt(o, 12, 700)));
      pg.forEach((o) => parts.push(txt(o, 9.5, 500)));
    }
    return { svg: parts.join(''), h };
  }
  // ---- legend ----------------------------------------------------------------------------------------------------------------
  function legendHtml(M, CL) {
    const sp = colourSpec(M),
      cl = CL.list.filter((x) => !x.other),
      sw = (col) => `<i class="nw-sw" style="background:${col}"></i>`;
    const clusterKey =
      `<h4>Clusters<span class="nw-sub"> (${UI.colour === 'cluster' ? 'colour' : 'outline'}; term of the smallest q)</span></h4><ul class="nw-ul">` +
      cl
        .map(
          (x) =>
            `<li><button type="button" class="nw-it${UI.hi === x.c ? ' on' : ''}" data-nw-hi="${x.c}" aria-pressed="${UI.hi === x.c}">` +
            `${sw(catVar(x.slot))}<span>${esc(x.name)}</span><b>${int(x.n)}</b></button></li>`
        )
        .join('') +
      (CL.nOther
        ? `<li><button type="button" class="nw-it" disabled>${sw('var(--nw-other)')}<span>Other (${int(CL.nOther)} small clusters)</span><b>${int(CL.protsOther)}</b></button></li>`
        : '') +
      '</ul>';
    let colour = '';
    if (sp && sp.kind === 'sequential')
      colour =
        `<h4>${esc(sp.name)}</h4><div class="nw-ramp" aria-hidden="true"></div><div class="nw-ramp-l"><span>0%</span><span>100%</span></div>` +
        `<p class="nw-sub">Grey: no value for the protein.</p>`;
    else if (sp) {
      const cats = (NC.color_by.find((c) => c.id === sp.id) || sp).cats || sp.cats || [];
      colour =
        `<h4>${esc(sp.name)}</h4><ul class="nw-ul">` +
        cats
          .map(
            (c, k) =>
              `<li><span class="nw-it">${sw(c === 'Other' ? 'var(--nw-other)' : catVar(k))}<span>${esc(c)}</span></span></li>`
          )
          .join('') +
        `<li><span class="nw-it">${sw('var(--nw-other)')}<span>No value</span></span></li></ul>`;
    }
    const edges =
      `<h4>Edges</h4><ul class="nw-ul">` +
      SRC.map((s, i) => {
        const on = UI.src.includes(i);
        const look =
          s.kind === 'pairs'
            ? '<svg width="34" height="10" aria-hidden="true"><line x1="0" x2="34" y1="5" y2="5" stroke="var(--nw-edge)" stroke-width="1.6"/></svg>'
            : '<svg width="34" height="10" aria-hidden="true"><line x1="0" x2="34" y1="5" y2="5" stroke="var(--nw-edge)" stroke-width="1.6" stroke-dasharray="4 3"/></svg>';
        return `<li><label class="nw-it">${look}<span>${esc(s.label)}${s.kind === 'pairs' ? ` (score ${UI.score / 1000} or more)` : ''}</span><input type="checkbox" data-nw-src="${i}"${on ? ' checked' : ''} aria-label="Show ${esc(s.label)}"></label></li>`;
      }).join('') +
      (SRC.length > 1
        ? `<li><span class="nw-it"><svg width="34" height="10" aria-hidden="true"><line x1="0" x2="34" y1="5" y2="5" stroke="var(--nw-edge)" stroke-width="3"/></svg><span>More than one source</span></span></li>`
        : '') +
      '</ul>';
    return `<aside class="nw-key" aria-label="Key">${clusterKey}${colour}${edges}<p class="nw-sub">Node size: number of ${esc(W.marks)}.</p></aside>`;
  }
  // ---- the table view: the figure without the figure ----------------------------------------------------------------------
  function tableHtml(M, CL) {
    const by = M.labels.map(() => []);
    M.nodes.forEach((nd, i) => by[nd.c].push(i));
    const rows = CL.list
      .map((x) => {
        const ps = by[x.c]
          .slice()
          .sort((a, b) => M.nodes[b].sites - M.nodes[a].sites || (M.nodes[a].gene < M.nodes[b].gene ? -1 : 1));
        return (
          `<tr><th scope="row">${x.other ? 'Other' : esc(x.name)}</th><td class="num">${int(x.n)}</td><td class="num">${
            x.l.q != null ? esc(K.fq(x.l.q)) : '–'
          }</td><td>${esc(x.l.source != null ? NC.labels[x.l.source]?.label || '' : '')}</td><td class="nw-ps">` +
          ps
            .map(
              (i) =>
                `<a href="${esc(K.link('protein', M.nodes[i].acc))}">${esc(M.nodes[i].gene)}</a> <span class="muted">${int(M.nodes[i].sites)}</span>`
            )
            .join(', ') +
          '</td></tr>'
        );
      })
      .join('');
    return (
      `<div class="table-wrap"><table class="nw-table"><caption class="sr-only">Clusters of the network, each with its term and its proteins (the number after a gene is its ${esc(W.marks)})</caption>` +
      `<thead><tr><th>Cluster (term)</th><th class="num">Proteins</th><th class="num">q</th><th>Terms from</th><th>Proteins (${esc(W.marks)})</th></tr></thead><tbody>${rows}</tbody></table></div>`
    );
  }
  // ---- text ---------------------------------------------------------------------------------------------------------------------
  const sourceNames = () => SRC.map((s) => s.label).join(' and ');
  function methodText() {
    const p = SRC.find((s) => s.kind === 'pairs'),
      g = SRC.filter((s) => s.kind === 'groups'),
      lab = NC.labels.map((l) => l.label).join(' and ');
    const bits = [
      `Nodes are the proteins with ${W.marks}; a node's size is its number of ${W.marks}. By default the ${int(OPT.top)} proteins with the most ${W.marks} are taken (the number can be changed), and proteins left with no edge among them are dropped. With a selection, the network is the selected proteins' (the same limit applies).`,
      p
        ? `An edge joins two proteins that ${p.label} links with a score of ${OPT.min_score / 1000} or more${g.length ? `, or that ${g.map((x) => x.label).join(' and ')} puts in one ${g.length === 1 ? 'group' : 'of its groups'}` : ''}${g.length ? ` (groups of more than ${int(g[0].max_size)} proteins are left out)` : ''}. Solid lines are ${esc(p.label)}, dashed lines are ${g.map((x) => esc(x.label)).join(' and ') || 'the other source'}, and a thicker line is a link in more than one source. Each source can be switched off.`
        : `An edge joins two proteins that share a group in ${sourceNames()}.`,
      `Clusters are communities found by Louvain modularity optimisation (Blondel et al. 2008) on the edges, weighted by score. A cluster with fewer than ${OPT.min_cluster} proteins, or past the ${NCOL} largest, is grey "Other".`,
      `Each cluster is named by the term from ${lab || 'the annotation'} with the smallest one-sided hypergeometric p among the cluster's proteins, tested against all the proteins of the network (terms that annotate more than ${Math.round(OPT.max_fraction * 100)}% of the network or fewer than ${OPT.min_term} of its proteins are left out, and at least ${OPT.min_overlap} proteins of the cluster must have it). q is the Benjamini–Hochberg value over the terms tested in that cluster; a cluster whose best q is above ${OPT.max_q} has no name. The default network is computed when the site is built, and a selection or another setting is clustered again in the browser by the same method.`,
    ];
    const cites = [
      ...SRC.map((s) => s.cite).filter(Boolean),
      ...NC.labels.map((l) => l.cite).filter(Boolean),
      'Blondel et al., J Stat Mech P10008 (2008), doi:10.1088/1742-5468/2008/10/P10008',
    ];
    return { bits, cites };
  }
  const methodHtml = () => {
    const m = methodText();
    return (
      m.bits.map((t) => `<p>${esc(t)}</p>`).join('') + `<p class="muted small">${m.cites.map(esc).join(' · ')}</p>`
    );
  };
  // ---- the page -----------------------------------------------------------------------------------------------------------------
  const sel = (id, label, opts, val) =>
    `<label class="nw-f"><span>${esc(label)}</span><select data-nw="${id}">${opts
      .map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`)
      .join('')}</select></label>`;
  const controls = () =>
    `<div class="nw-bar" role="group" aria-label="Network options">` +
    sel('colour', 'Colour by', [['cluster', 'Cluster (term)'], ...CB.map((c) => [c.id, c.name])], UI.colour) +
    (SRC.some((s) => s.kind === 'pairs')
      ? sel(
          'score',
          `${SRC.find((s) => s.kind === 'pairs').label}, score`,
          OPT.steps.map((v) => [v, `${v / 1000} or more`]),
          UI.score
        )
      : '') +
    sel(
      'top',
      'Proteins (most sites)',
      [...new Set([100, 150, 200, 300, 500, OPT.top])].sort((a, b) => a - b).map((v) => [v, int(v)]),
      UI.top
    ) +
    sel(
      'minc',
      'Smallest cluster',
      [...new Set([3, 5, 8, 10, 15, OPT.min_cluster])].sort((a, b) => a - b).map((v) => [v, v]),
      UI.minc
    ) +
    `<form class="nw-f nw-find" data-nw-find><span>Find a gene</span><input type="search" name="g" value="${esc(UI.find)}" placeholder="e.g. FUS" list="nw-genes" autocomplete="off" aria-label="Gene to highlight"></form>` +
    `<div class="nw-btns"><button type="button" class="btn small" data-nw-view="${UI.mode === 'network' ? 'table' : 'network'}">${UI.mode === 'network' ? 'Table view' : 'Network view'}</button>` +
    (UI.mode === 'network'
      ? `<button type="button" class="btn small" data-nw-zoom="-1" aria-label="Zoom out"${UI.zoom <= 1 ? ' disabled' : ''}>−</button><button type="button" class="btn small" data-nw-zoom="1" aria-label="Zoom in"${UI.zoom >= 3 ? ' disabled' : ''}>+</button>`
      : '') +
    `<button type="button" class="btn small" data-nw-reset>Reset</button></div></div>`;
  function figureBox(M, CL) {
    fit(false);
    const h = vh(M);
    const P =
      (cache.lay && cache.lay.key === cache.key + VW && cache.lay.v) ||
      (cache.lay = { key: cache.key + VW, v: layout(M, VW, h) }).v;
    const s = svgOf(M, CL, P, false);
    return (
      `<div class="nw-fig" tabindex="0" role="group" aria-label="Network of ${int(M.nodes.length)} proteins in ${int(CL.n)} clusters; the table view lists them"><svg class="nw-svg" viewBox="0 0 ${VW} ${h}" ` +
      `style="width:${UI.zoom * 100}%" role="img" aria-label="${esc(TITLE)}">${s.svg}</svg></div>`
    );
  }
  function view() {
    const head =
      `<div class="page-head results-head"><div><h2>${esc(TITLE)}</h2><p class="cx">${esc(NC.about || '')}</p></div>` +
      `<div class="nw-exp">${K.expBar(['svg', 'png', 'tsv'], 'nwexp', 'the network')}</div></div>`;
    const M = model();
    if (M.error) return `${head}<p class="muted">The network could not be read (${esc(M.error)}).</p>`;
    if (M.wait) return `${head}<p class="muted" role="status">Loading the network…</p>`;
    const CL = clusters(M);
    const sel0 = K.sel?.active();
    let note = '';
    if (sel0)
      note =
        M.picked != null && M.nodes.length
          ? `<div class="filter-note">Your selection: ${int(M.picked)} of its proteins have an edge in these sources; ${int(M.nodes.length)} are drawn.</div>`
          : '';
    else note = '';
    const count = M.nodes.length
      ? `<p class="nw-count" role="status">${int(M.nodes.length)} proteins, ${int(M.edges.length)} edges, ${int(CL.list.filter((x) => !x.other).length)} clusters${CL.nOther ? ` and ${int(CL.nOther)} small ones in grey` : ''}${sel0 ? ' (your selection)' : ''}. Hover a protein for its ${esc(W.marks)} and cluster; click it to open its page.</p>`
      : '';
    const body = !M.nodes.length
      ? `<p class="muted">${sel0 ? 'No protein of the selection has an edge in the chosen sources, so there is nothing to draw. Choose more sources or a lower score, or widen the selection.' : 'No protein has an edge in the chosen sources.'}</p>`
      : UI.mode === 'table'
        ? tableHtml(M, CL)
        : `<div class="nw-main">${figureBox(M, CL)}${legendHtml(M, CL)}</div><div class="nw-pin" role="status">${pinHtml(M, CL)}</div>`;
    const names = `<datalist id="nw-genes">${M.nodes.map((n) => `<option value="${esc(n.gene)}"></option>`).join('')}</datalist>`;
    return (
      head +
      controls() +
      note +
      count +
      body +
      names +
      K.fold('nw-how', 'How this network is made', '', methodHtml(), false)
    );
  }
  // a touch screen: the first tap on a node shows its card, with the link
  const pinHtml = (M, CL) => {
    const i = UI.pin;
    if (i == null || !M.nodes[i]) return '';
    return `<p>${tipOf(M, CL, i)} <a href="${esc(K.link('protein', M.nodes[i].acc))}">Open ${esc(M.nodes[i].gene)}</a></p>`;
  };
  function tipOf(M, CL, i) {
    const nd = M.nodes[i],
      c = CL.list[nd.c],
      sp = colourSpec(M);
    let extra = '';
    if (sp) {
      const v = sp.v[nd.g];
      const cats = NC.color_by.find((x) => x.id === sp.id)?.cats || [];
      extra = `<br>${esc(sp.name)}: ${sp.kind === 'sequential' ? (v == null ? 'no value' : Math.round(v * 100) + '%') : v < 0 ? 'no value' : esc(cats[v] || '')}`;
    }
    return (
      `<b>${esc(nd.gene)}</b> <span class="muted">${esc(nd.acc)}</span><br>${int(nd.sites)} ${esc(W.marks)} · ${int(M.deg[i])} ${M.deg[i] === 1 ? 'partner' : 'partners'} in this network<br>` +
      `Cluster ${nd.c + 1}${c.other ? ' (grey, Other)' : ''}: ${c.term ? esc(c.term) : 'no enriched term'}` +
      (c.l.q != null
        ? `<br>${esc(NC.labels[c.l.source]?.label || 'Term')}: ${int(c.l.k)} of ${int(c.n)} cluster proteins, ${int(c.l.M)} of ${int(c.l.N)} in the network; q ${esc(K.fq(c.l.q))}`
        : '') +
      extra
    );
  }
  // ---- exports ----------------------------------------------------------------------------------------------------------------
  function figure() {
    fit(true);
    const M = model();
    const CL = clusters(M),
      h = vh(M),
      P = layout(M, VW, h),
      s = svgOf(M, CL, P, true),
      sp = colourSpec(M);
    const legend = CL.list
      .filter((x) => !x.other)
      .map((x) => [UI.colour === 'cluster' ? CAT.light[x.slot] : '#ffffff', CAT.light[x.slot], `${x.name} (${x.n})`]);
    if (CL.nOther) legend.push([OTHER.light, OTHER.light, `Other (${CL.nOther} small clusters)`]);
    if (sp)
      legend.push(
        ...(sp.kind === 'sequential'
          ? [0, 0.5, 1].map((v) => [seqHex(v, 'light'), '#8a979e', `${sp.name}: ${Math.round(v * 100)}%`])
          : (NC.color_by.find((c) => c.id === sp.id)?.cats || []).map((c, k) => [
              c === 'Other' ? OTHER.light : CAT.light[k],
              '#8a979e',
              `${sp.name}: ${c}`,
            ]))
      );
    const sc = SRC.find((x) => x.kind === 'pairs');
    return K.figureFrame({
      title: `${TITLE}: ${int(M.nodes.length)} proteins in ${int(CL.list.filter((x) => !x.other).length)} clusters`,
      sub: `${D.site.name}. ${K.sel?.active() ? 'The selected proteins. ' : `The ${int(UI.top)} proteins with the most ${W.marks}. `}Edges: ${UI.src.map((i) => SRC[i].label).join(', ')}${sc && UI.src.includes(SRC.indexOf(sc)) ? ` (score ${UI.score / 1000} or more)` : ''}.`,
      legend,
      body: `<rect width="${VW}" height="${s.h}" fill="#ffffff" stroke="#e3e8ea"/>${s.svg}`,
      bodyH: s.h,
      W: VW,
      note: `Node size: number of ${W.marks}. Solid lines: ${sc ? sc.label : 'scored links'}; dashed: other sources; thicker: more than one source. Clusters: Louvain; each is named by its most enriched term (hypergeometric test, Benjamini–Hochberg q). ${methodText().cites.join('; ')}.`,
      extra: { view: 'network', min_score: UI.score / 1000, top: UI.top },
    });
  }
  function tsv() {
    const M = model(),
      CL = clusters(M),
      sp = colourSpec(M);
    const rows = M.nodes.map((nd, i) => [
      nd.c + 1,
      CL.list[nd.c].other ? 'Other' : CL.list[nd.c].name,
      CL.list[nd.c].l.id || '',
      CL.list[nd.c].l.q != null ? CL.list[nd.c].l.q.toPrecision(3) : '',
      nd.gene,
      nd.acc,
      nd.sites,
      M.deg[i],
      sp
        ? sp.v[nd.g] == null || sp.v[nd.g] < 0
          ? ''
          : sp.kind === 'sequential'
            ? sp.v[nd.g]
            : (NC.color_by.find((c) => c.id === sp.id)?.cats || [])[sp.v[nd.g]]
        : '',
    ]);
    return (
      K.preamble(
        `${TITLE}`,
        `${int(M.nodes.length)} proteins, ${int(M.edges.length)} edges. ${methodText().cites.join('; ')}.`
      ) +
      [
        'cluster',
        'cluster_term',
        'term_id',
        'q',
        'gene',
        'accession',
        'sites',
        'partners_in_network',
        sp ? sp.name.replace(/\W+/g, '_') : 'colour',
      ].join('\t') +
      '\n' +
      rows.map((r) => r.join('\t')).join('\n') +
      '\n'
    );
  }
  // ---- events -----------------------------------------------------------------------------------------------------------------
  const again = () => {
    cache = { key: '', M: null };
    save();
    K.render();
  };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (S.view !== 'network') return;
    if (t.dataset?.nwSrc != null) {
      const i = +t.dataset.nwSrc;
      UI.src = t.checked ? [...new Set([...UI.src, i])].sort() : UI.src.filter((x) => x !== i);
      if (!UI.src.length) UI.src = [i];
      return again();
    }
    const k = t.dataset?.nw;
    if (!k) return;
    if (k === 'colour') UI.colour = t.value;
    else if (k === 'minc') {
      UI.minc = +t.value;
      save();
      return K.render();
    } else UI[k === 'score' ? 'score' : 'top'] = +t.value;
    if (UI.colour !== 'cluster') load('full');
    again();
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest?.('[data-nw-find]');
    if (!f) return;
    e.preventDefault();
    UI.find = f.g.value;
    K.render();
  });
  K.clicks.push(
    [
      '[data-nw-hi]',
      (el) => {
        UI.hi = UI.hi === +el.dataset.nwHi ? -1 : +el.dataset.nwHi;
        K.render();
      },
    ],
    [
      '[data-nw-view]',
      (el) => {
        UI.mode = el.dataset.nwView;
        K.render();
      },
    ],
    [
      '[data-nw-zoom]',
      (el) => {
        UI.zoom = Math.max(1, Math.min(3, UI.zoom + 0.5 * +el.dataset.nwZoom));
        K.render();
      },
    ],
    [
      '[data-nw-reset]',
      () => {
        Object.assign(UI, { ...DEF, src: DEF.src.slice(), hi: -1, find: '', zoom: 1, pin: null });
        again();
      },
    ],
    [
      '.nw-n',
      (el, e) => {
        if (!matchMedia('(pointer: coarse)').matches) return;
        const i = +el.dataset.nn;
        if (UI.pin === i) return;
        e.preventDefault();
        UI.pin = i;
        K.render();
      },
    ],
    [
      '[data-nwexp]',
      (btn) =>
        K.exportFigure(
          btn.dataset.nwexp,
          figure,
          `${D.site.id}_network${K.sel?.active() ? '_selection' : ''}`,
          btn,
          tsv
        ),
    ]
  );
  K.tips.push([
    '.nw-n',
    (el) => {
      const M = cache.M;
      return M && !M.wait ? tipOf(M, clusters(M), +el.dataset.nn) : '';
    },
  ]);
  // ---- registration -------------------------------------------------------------------------------------------------------------
  K.views.network = { follows: true, render: view, title: () => K.tabName('network', TITLE) };
  K.tabs.push(() => ['network', TITLE, K.sel?.active() ? 'selection' : null]);
  (K.tabIcons ||= {}).network =
    '<svg class="tab-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="7" r="2"/><circle cx="12" cy="17" r="2"/><circle cx="19" cy="6" r="2"/>' +
    '<circle cx="19" cy="17" r="1.6"/><path d="M6.7 8.2l4 7M7 7l10-.7M13.8 16.5l3.8.3M18.6 8l.2 7.4"/></svg>';
  K.sections.network = () => [
    ['view', TITLE, 1, K.link('network')],
    ['nw-how', 'How this network is made', 1],
  ];
  (K.methods ||= []).push({
    id: 'network',
    title: TITLE,
    html: () => `<section id="m-q-network" class="qm"><h3>${esc(TITLE)}</h3>${methodHtml()}</section>`,
  });
  if (NC.tile?.section)
    (K.ovTiles ||= []).push({
      section: NC.tile.section,
      html: () => {
        const d = NC.default || {};
        return (
          `<article class="tile nw-tile" data-nw-tile tabindex="0"><header><h3>${esc(NC.tile.title || TITLE)}</h3><span class="chev" aria-hidden="true">›</span></header>` +
          `<p class="tsub">${esc(NC.tile.text || '')}</p>` +
          `<p class="nw-chips">${(d.top_labels || []).map((t) => `<span>${esc(t)}</span>`).join('')}</p>` +
          `<p class="tfoot"><span class="muted">${int(d.nodes || 0)} proteins, ${int(d.clusters || 0)} clusters</span> <a href="${esc(K.link('network'))}">Open the network →</a></p></article>`
        );
      },
    });
  K.clicks.push([
    '[data-nw-tile]',
    (el, e) => {
      if (e.target.closest('a')) return;
      K.go('network');
    },
  ]);
});
