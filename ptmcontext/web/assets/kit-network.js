/* The network view (website.network): one network of the site's proteins (the selection's, when there is one), grouped
   into clusters and each cluster named by its most enriched term.
     nodes     proteins with sites; the area of a node follows the number of sites. By default the top N by site count;
               isolated ones are dropped.
     edges     the sources the site file lists (a scored table such as STRING physical links, curated complexes), each with
               a switch. Links inside a cluster are drawn in its colour; links between two clusters are one bundle per
               pair of clusters (width: the number of links); the single links of a protein show when it is hovered.
     clusters  Louvain communities (kit-netcore.js), by default at the resolution of the site file, or the number the
               reader asks for. A cluster smaller than the minimum goes on a shelf of small grey ones.
     labels    the term of the smallest q in the cluster (ties to the deeper term), against the network's proteins; one
               source at a time (Name clusters by). Placed outside the cluster's outline, in a short form; the hover and the
               table have the whole name.
     layout    each cluster laid out on its own links, the clusters packed apart (kit-netlayout.js, the twin of
               web/netlayout.py: the default view is laid out when the site is built, any other in the browser, in a Web
               Worker when it is large). A phone gets its own, narrower layout with numbered badges and a list.
     colour    by cluster (default) or by any "colour by" the site file lists (a share of the protein's sites, or the commonest
               value among them); the cluster outlines and names stay.
   The default network is precomputed (data/network.json); a selection or another option makes it again in the browser from
   data/network_full.json, both read when the view is opened. Hover a protein or a cluster to light what it is joined to;
   a click opens the protein page. The table view (cluster, term, q, proteins) is the same network without the figure. SVG,
   PNG (a slide or a 180 mm paper width) and TSV exports. A module of the site kit; without website.network (or in the
   one-file copy) it does nothing. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, esc, int, S } = K;
  const NC = D.network;
  if (!NC || !K.netcore || !K.netlayout) return;
  const OPT = NC.options,
    SRC = NC.sources,
    CB = NC.color_by || [];
  const TITLE = NC.title || 'Network';
  const EG = String(D.site?.placeholders?.highlight || '').split(/[,\s]+/)[0];
  const NCOL = 8;
  const CR = OPT.cluster_range || [4, 16, 1];
  // categorical slots (the data-viz palette, validated for colour-vision deficiency in both modes; clusters are also named on
  // the figure and in the table, which is the non-visual equivalent) and the grey of the small clusters
  const CAT = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#b5651d', '#6250d6', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#c9894d', '#9085e9', '#e66767'],
  };
  const OTHER = { light: '#9aa3a8', dark: '#7d8c97' };
  const EX = { light: { edge: '#52606a', bundle: 0.16, wash: 0.085, intra: 0.32, ink: '#111827', muted: '#5f6f78' } };
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
    label: 0,
    clusters: OPT.clusters || null,
  };
  const KEY = 'ptmc-network:' + (D.site?.id || '');
  const UI = {
    ...DEF,
    zoom: 1,
    mode: 'network',
    hi: -1,
    find: '',
    pin: null,
    preset: 'screen',
    claim: '',
    zc: -1,
    more: false,
  };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    ['score', 'top', 'minc', 'src', 'colour', 'label', 'clusters'].forEach((k) => s[k] !== undefined && (UI[k] = s[k]));
    if (!OPT.steps.includes(UI.score)) UI.score = DEF.score;
    if (!(UI.label >= 0 && UI.label < NC.labels.length)) UI.label = DEF.label;
    if (UI.clusters != null && !(UI.clusters >= CR[0] && UI.clusters <= CR[1])) UI.clusters = DEF.clusters;
    if (UI.colour !== 'cluster' && !CB.some((c) => c.id === UI.colour)) UI.colour = 'cluster';
  } catch (e) {
    /* no storage: the defaults */
  }
  const save = () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          score: UI.score,
          top: UI.top,
          minc: UI.minc,
          src: UI.src,
          colour: UI.colour,
          label: UI.label,
          clusters: UI.clusters,
        })
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
    UI.label === DEF.label &&
    UI.clusters === DEF.clusters &&
    UI.src.length === DEF.src.length;
  const phoneNow = () => matchMedia('(max-width: 760px)').matches;
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
  const maxShown = () => Math.max(OPT.max_shown || NCOL, UI.clusters || 0);
  const optNow = () => ({
    ...OPT,
    top: UI.top,
    min_score: UI.score,
    label: UI.label,
    clusters: UI.clusters,
    min_cluster: UI.minc,
  });
  let cache = { key: '', M: null };
  function model() {
    const sel = K.sel?.active();
    if (sel && !K.sel.data()) return { wait: 'marks' };
    const key = JSON.stringify([
      UI.score,
      UI.top,
      UI.src,
      UI.label,
      UI.clusters,
      UI.clusters ? UI.minc : 0,
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
        layout: v.layout,
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
    M.adj = M.nodes.map(() => []);
    M.edges.forEach(([a, b, fl]) => {
      M.deg[a]++;
      M.deg[b]++;
      M.adj[a].push([b, fl]);
      M.adj[b].push([a, fl]);
    });
    cache = { key, M, lay: {}, pend: {} };
    return M;
  }
  // clusters as drawn: the colour slot of the shown ones (the communities with the minimum number of proteins or more, in
  // order, as many as the layout takes), or grey on the shelf of small ones
  function clusters(M) {
    const shown = M.labels
        .map((l, c) => c)
        .filter((c) => M.labels[c].n >= UI.minc)
        .slice(0, maxShown()),
      rank = new Map(shown.map((c, i) => [c, i]));
    const out = M.labels.map((l, c) => {
      const r = rank.has(c) ? rank.get(c) : -1,
        sn = K.netlayout.shortName(l.term);
      return {
        c,
        n: l.n,
        other: r < 0,
        rank: r,
        slot: r < 0 ? -1 : r % NCOL,
        term: l.term,
        short: sn,
        l,
        name: l.term || `Cluster ${c + 1} (no enriched term)`,
        label: sn || `Cluster ${c + 1}`,
      };
    });
    return {
      list: out,
      shown,
      nShown: shown.length,
      nOther: out.filter((x) => x.other).length,
      protsOther: out.filter((x) => x.other).reduce((s, x) => s + x.n, 0),
      n: out.length,
    };
  }
  // ---- colours ---------------------------------------------------------------------------------------------------------------
  const colourSpec = (M) =>
    UI.colour === 'cluster' ? null : (M.full?.color || []).find((c) => c.id === UI.colour) || null;
  // the fill of a node: a CSS value on the page, a literal hex in an export
  function fillOf(M, CL, i, ex) {
    const nd = M.nodes[i],
      sp = colourSpec(M);
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
    return v < 0 || v >= NCOL ? other : ex ? CAT.light[v] : catVar(v);
  }
  const clusterFill = (x, ex) =>
    x.slot < 0 ? (ex ? OTHER.light : 'var(--nw-other)') : ex ? CAT.light[x.slot] : catVar(x.slot);
  // ---- the layout of the model: precomputed for the default view, else made here (in a worker when large) ---------------
  const viewOf = (M) => ({
    gene: M.nodes.map((n) => n.gene),
    sites: M.nodes.map((n) => n.sites),
    comm: M.nodes.map((n) => n.c),
    edges: M.edges,
    labels: M.labels,
  });
  let lastFig = '';
  function layoutFor(M, variant) {
    if (M.layout && UI.minc === OPT.min_cluster) return M.layout[variant];
    const key = variant + '|' + UI.minc,
      hold = cache.lay,
      pend = cache.pend;
    if (hold[key]) return hold[key];
    if (pend[key]) return null;
    const view = viewOf(M);
    if (M.nodes.length > 150 && K.netlayout.inWorker) {
      pend[key] = 1;
      K.netlayout.inWorker(view, variant, UI.minc, maxShown()).then((L) => {
        hold[key] = L;
        delete pend[key];
        if (S.view === 'network' && cache.lay === hold) K.render();
      });
      return null;
    }
    return (hold[key] = K.netlayout.layout(view, variant, UI.minc, maxShown()));
  }
  // ---- the figure ---------------------------------------------------------------------------------------------------------------
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
  const gbit = SRC.map((s, i) => (s.kind === 'groups' ? 1 << i : 0)).reduce((a, b) => a | b, 0);
  // the neighbours of a protein, and what a cluster is joined to: the nodes and the clusters to light
  const lightNode = (M, i) => {
    const nodes = new Set([i, ...M.adj[i].map(([j]) => j)]);
    return { nodes, clusters: new Set([...nodes].map((j) => M.nodes[j].c)) };
  };
  const lightCluster = (M, c) => {
    const nodes = new Set();
    M.nodes.forEach((nd, i) => nd.c === c && nodes.add(i));
    const mine = [...nodes];
    mine.forEach((i) => M.adj[i].forEach(([j]) => nodes.add(j)));
    return { nodes, clusters: new Set([c]) };
  };
  // the drawing as an SVG string: classes and data attributes carry what hovering needs; ex: literal colours and no links
  function svgOf(M, CL, L, ex) {
    const phone = L.variant === 'phone',
      k = L.k,
      found = hit(M),
      lit = UI.hi >= 0 ? lightCluster(M, UI.hi) : null,
      dim = (i) => (lit && !lit.nodes.has(i)) || (found.size && !found.has(i) && !ex);
    const ink = ex ? EX.light.ink : 'var(--ink)',
      muted = ex ? EX.light.muted : 'var(--muted)',
      bg = ex ? '#ffffff' : 'var(--surface)',
      edgeX = ex ? EX.light.edge : 'var(--nw-edge-x)';
    const r = (i) => Math.min(9, 2.6 + 0.95 * Math.sqrt(M.nodes[i].sites)) * k;
    const P = L.pos,
      f1 = (v) => v.toFixed(1);
    const out = [];
    // bundles: one curve per pair of clusters with many links
    out.push('<g class="nw-bundles">');
    L.bundles.forEach((b) => {
      const [pa, q, pb] = b.p,
        w = Math.min(9, 1.2 + 0.95 * Math.sqrt(b.n)) * (phone ? 0.6 : 1);
      out.push(
        `<path class="nw-bd" data-ba="${b.a}" data-bb="${b.b}" d="M${f1(pa[0])} ${f1(pa[1])}Q${f1(q[0])} ${f1(q[1])} ${f1(pb[0])} ${f1(pb[1])}" fill="none" stroke="${edgeX}" ` +
          `stroke-width="${w.toFixed(1)}" stroke-linecap="round" ` +
          (ex ? `stroke-opacity="${EX.light.bundle}"` : 'style="stroke-opacity:var(--nw-bundle)"') +
          `${lit ? ' opacity="0.15"' : ''}/>`
      );
    });
    out.push('</g><g class="nw-hulls">');
    // outlines: a flat wash in the cluster's colour, no stroke
    L.shown.forEach((c, ci) => {
      const x = CL.list[c],
        d = 'M' + L.hulls[ci].map((p) => f1(p[0]) + ' ' + f1(p[1])).join('L') + 'Z';
      out.push(
        `<path class="nw-hl" data-nwc="${c}" d="${d}" fill="${clusterFill(x, ex)}" stroke="none" ` +
          (ex ? `fill-opacity="${EX.light.wash}"` : 'style="fill-opacity:var(--nw-wash)"') +
          `${lit && !lit.clusters.has(c) ? ' opacity="0.35"' : ''}/>`
      );
    });
    out.push('</g><g class="nw-intra">');
    // links inside a cluster, in its colour (the small clusters' in grey)
    M.edges.forEach(([a, b], e) => {
      const ca = M.nodes[a].c;
      if (ca !== M.nodes[b].c) return;
      const x = CL.list[ca],
        o = dim(a) || dim(b);
      out.push(
        `<line class="nw-ie" data-a="${a}" data-b="${b}" x1="${f1(P[a][0])}" y1="${f1(P[a][1])}" x2="${f1(P[b][0])}" y2="${f1(P[b][1])}" ` +
          `stroke="${clusterFill(x, ex)}" stroke-width="${phone ? 0.5 : 0.8}" ` +
          (ex
            ? `stroke-opacity="${EX.light.intra}"`
            : `style="stroke-opacity:var(--nw-intra)${o ? ';opacity:0.1' : ''}"`) +
          (ex && o ? ' opacity="0.1"' : '') +
          '/>'
      );
    });
    out.push('</g><g class="nw-x"></g><g class="nw-nodes">');
    P.forEach((p, i) => {
      const nd = M.nodes[i],
        ring = found.has(i)
          ? ` stroke="${ink}" stroke-width="2.4"`
          : ` stroke="${bg}" stroke-width="${phone ? 1 : 1.4}"`,
        dot = `<circle class="nw-dot" cx="${f1(p[0])}" cy="${f1(p[1])}" r="${r(i).toFixed(1)}" fill="${fillOf(M, CL, i, ex)}"${ring}/>`;
      if (ex) out.push(`<g${dim(i) ? ' opacity="0.18"' : ''}>${dot}</g>`);
      else
        out.push(
          `<a href="${esc(K.link('protein', nd.acc))}" class="nw-n" data-nn="${i}" tabindex="-1" aria-label="${esc(nd.gene)}, ${int(nd.sites)} ${esc(W.marks)}"${dim(i) ? ' style="opacity:0.18"' : ''}>` +
            `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${Math.max(r(i) + 3, phone ? 5 : 7).toFixed(1)}" fill="transparent"/>${dot}</a>`
        );
    });
    out.push('</g><g class="nw-labels">');
    // names: text in ink with a halo, a dot in the cluster's colour beside it (the text itself is never coloured)
    const halo = (w) => `paint-order="stroke" stroke="${bg}" stroke-width="${w}" stroke-linejoin="round"`;
    const text = (x, y, size, wt, fill, s, extra = '', w = 3.5) =>
      `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" font-weight="${wt}" fill="${fill}" ${halo(w)} ${extra}>${esc(s)}</text>`;
    L.clabels.forEach((l) => {
      const x = CL.list[l.c],
        [x0, y0, x1, y1] = l.box,
        [ax, ay, bx, by] = l.leader,
        fs = L.fs,
        attrs = `class="nw-cl" data-nwc="${l.c}"${ex ? '' : ' tabindex="-1" role="button" aria-label="' + esc(x.name) + ', ' + int(x.n) + ' proteins"'}`;
      if (phone) {
        const cx = (x0 + x1) / 2,
          cy = (y0 + y1) / 2,
          on = ex ? '#ffffff' : 'var(--nw-on-' + (x.slot + 1) + ')';
        out.push(
          `<g ${attrs}><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1((x1 - x0) / 2)}" fill="${clusterFill(x, ex)}" stroke="${bg}" stroke-width="1.2"/>` +
            `<text x="${f1(cx)}" y="${f1(cy + fs * 0.36)}" font-size="${fs}" font-weight="700" fill="${on}" text-anchor="middle">${esc(l.lines[0])}</text></g>`
        );
        return;
      }
      out.push(
        `<g ${attrs}${lit && lit.clusters.has(l.c) === false ? ' opacity="0.35"' : ''}>` +
          (Math.hypot(bx - ax, by - ay) > 14
            ? `<line x1="${f1(ax)}" y1="${f1(ay)}" x2="${f1(bx)}" y2="${f1(by)}" stroke="${muted}" stroke-width="0.8"/>`
            : '') +
          `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}" fill="transparent"/>` +
          `<circle cx="${f1(x0 + 4)}" cy="${f1(y0 + fs * 0.62)}" r="4" fill="${clusterFill(x, ex)}"/>` +
          l.lines.map((s, n) => text(x0 + 12, y0 + fs * (1 + 1.22 * n) - 2, fs, 650, ink, s)).join('') +
          text(x0 + 12, y0 + fs * (1 + 1.22 * l.lines.length) + 0.5, fs - 1.5, 450, muted, l.count, '', 3) +
          '</g>'
      );
    });
    const named = new Set(L.glabels.map((g) => g.i));
    L.glabels.forEach((g) => {
      const [x0, , x1, y1] = g.box;
      out.push(
        text(
          g.align === 'end' ? x1 : g.align === 'start' ? x0 : (x0 + x1) / 2,
          y1 - L.gfs * 0.25,
          L.gfs,
          550,
          ex ? '#3b4a53' : 'var(--ink-2)',
          g.t,
          `class="nw-gl" data-gi="${g.i}" text-anchor="${g.align}"${dim(g.i) ? ' opacity="0.2"' : ''}`,
          3
        )
      );
    });
    // a gene that was searched for is always named
    found.forEach((i) => {
      if (named.has(i)) return;
      out.push(text(P[i][0], P[i][1] - r(i) - 5, L.gfs + 1, 650, ink, M.nodes[i].gene, 'text-anchor="middle"', 3));
    });
    if (L.shelf)
      out.push(
        text(
          L.shelf[0],
          L.shelf[1] + 2,
          phone ? L.fs : L.fs - 1.5,
          600,
          muted,
          phone
            ? `Smaller clusters (${int(CL.protsOther)} proteins)`
            : `Smaller clusters (${int(CL.nOther)}, ${int(CL.protsOther)} proteins, grey)`,
          '',
          3
        )
      );
    out.push('</g><g class="nw-top"></g>');
    return { svg: out.join(''), w: L.w, h: L.h };
  }
  // ---- the key and, on a phone, the list of clusters ------------------------------------------------------------------------
  const sizeKey = (k) =>
    `<svg width="76" height="22" aria-hidden="true">${[5, 20, 40]
      .map(
        (s, n) =>
          `<circle cx="${9 + n * 26}" cy="11" r="${(Math.min(9, 2.6 + 0.95 * Math.sqrt(s)) * k).toFixed(1)}" fill="none" stroke="var(--muted)"/>`
      )
      .join('')}</svg>`;
  function keyHtml(M, CL, L, sum) {
    const sp = colourSpec(M),
      sw = (col) => `<i class="nw-sw" style="background:${col}"></i>`,
      phone = L && L.variant === 'phone';
    const bits = [
      `<span class="nw-kg">${sizeKey(phone ? 0.6 : 1)}<span>${esc(W.marks)}: 5 · 20 · 40+</span></span>`,
      `<span class="nw-kg"><svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="var(--nw-1)" stroke-opacity="0.6"/></svg><span>Link in a cluster</span></span>`,
      `<span class="nw-kg"><svg width="26" height="12" aria-hidden="true"><line x1="3" y1="6" x2="23" y2="6" stroke="var(--nw-edge-x)" stroke-opacity="0.35" stroke-width="6" stroke-linecap="round"/></svg><span>Links between clusters</span></span>`,
    ];
    if (sp && sp.kind === 'sequential')
      bits.push(
        `<span class="nw-kg"><span class="nw-sub">${esc(sp.name)}</span><span class="nw-ramp nw-ramp-s" aria-hidden="true"></span><span class="nw-sub">0% to 100%; grey: no value</span></span>`
      );
    else if (sp) {
      const cats = (NC.color_by.find((c) => c.id === sp.id) || sp).cats || sp.cats || [];
      bits.push(
        `<span class="nw-kg"><span class="nw-sub">${esc(sp.name)}</span>${cats.map((c, n) => `<span class="nw-kg">${sw(c === 'Other' ? 'var(--nw-other)' : catVar(n))}${esc(c)}</span>`).join('')}<span class="nw-kg">${sw('var(--nw-other)')}No value</span></span>`
      );
    }
    return `<div class="nw-key" aria-label="Key"><span class="nw-sum" role="status">${sum}</span>${bits.join('')}</div>`;
  }
  // a phone names the clusters in a list under the figure: badge, short name, proteins; a tap lights the cluster, a second zooms
  function listHtml(CL) {
    return (
      `<ol class="nw-plist">` +
      CL.shown
        .map((c) => {
          const x = CL.list[c];
          return (
            `<li><button type="button" data-nw-row="${c}" class="${UI.hi === c ? 'on' : ''}" aria-pressed="${UI.hi === c}"><span class="nw-bdg" style="background:${catVar(x.slot)};color:var(--nw-on-${x.slot + 1})">${x.rank + 1}</span>` +
            `<span class="nw-nm">${esc(x.label)}</span><span class="nw-ct">${int(x.n)}</span></button></li>`
          );
        })
        .join('') +
      '</ol>'
    );
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
          `<tr><th scope="row">${x.other ? 'Smaller cluster' + (x.term ? ': ' + esc(x.name) : '') : esc(x.name)}</th><td class="num">${int(x.n)}</td><td class="num">${
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
  // ---- text, in the reader's words -----------------------------------------------------------------------------------------------
  const sourceNames = () => SRC.map((s) => s.label).join(' and ');
  function methodText() {
    const p = SRC.find((s) => s.kind === 'pairs'),
      g = SRC.filter((s) => s.kind === 'groups'),
      L = NC.labels[UI.label] || NC.labels[0] || {},
      lab = L.label || '';
    const bits = [
      ...(NC.about ? [NC.about] : []),
      `Nodes are the proteins with ${W.marks}; the area of a node follows its number of ${W.marks}. By default the ${int(OPT.top)} proteins with the most ${W.marks} are taken (the number can be changed), and proteins left with no link among them are dropped. With a selection, the network is the selected proteins' (the same limit applies).`,
      p
        ? `Two proteins are joined when ${p.label} links them with a score of ${OPT.min_score / 1000} or more${g.length ? `, or when ${g.map((x) => x.label).join(' and ')} puts them in one ${g.length === 1 ? 'group' : 'of its groups'}` : ''}${g.length ? ` (groups of more than ${int(g[0].max_size)} proteins are left out)` : ''}. Each source can be switched off.`
        : `Two proteins are joined when they share a group in ${sourceNames()}.`,
      `Clusters are communities found by Louvain modularity optimisation (Blondel et al. 2008) on the links, weighted by score. By default the method's resolution is the one the site uses; the Clusters menu asks for a number of clusters instead, and the resolution closest to it is taken. A cluster with fewer than ${UI.minc} proteins is shown among the smaller grey clusters at the bottom. Each cluster is a region of its own; links inside it are drawn in its colour, and links between two clusters are drawn as one band per pair (its width is the number of links; pairs with fewer than 6 links are left out). Hover a protein to see its own links and partners.`,
      `Each cluster is named by the term from ${lab || 'the annotation'} with the smallest q: a one-sided hypergeometric p for the cluster's proteins against all the proteins of the network, adjusted by Benjamini–Hochberg over the terms tested in that cluster (terms that annotate more than ${Math.round(OPT.max_fraction * 100)}% of the network or fewer than ${OPT.min_term} of its proteins are left out, and at least ${OPT.min_overlap} proteins of the cluster must have it${L.min_depth ? `; terms less than ${L.min_depth} steps below the top of the ontology are not used` : ''}${L.max_size ? `; terms that annotate more than ${int(L.max_size)} proteins of the whole proteome are not used` : ''}${L.non_iea ? '; only annotations with evidence other than electronic annotation (IEA) are counted' : ''}). Of terms with the same q the deeper, more specific one is taken. A cluster whose best q is above ${OPT.max_q} has no name. On the figure a name is shortened to its first phrase; the hover and the table give the whole name. The network you first see is computed when the site is built; a selection or another setting is clustered and laid out again in your browser by the same method.`,
    ];
    const cites = [
      ...SRC.map((s) => s.cite).filter(Boolean),
      ...[NC.labels[UI.label] || NC.labels[0]].map((l) => l?.cite).filter(Boolean),
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
  const claimOf = (n) => String(NC.claim || `The proteins with ${W.marks} form {n} clusters`).replace('{n}', n);
  // every control by id; the site file's `controls` lists the ones in the main row, the rest are under "More options"
  const CONTROL_ORDER = ['clusters', 'colour', 'find', 'label', 'score', 'top', 'minc', 'sources', 'preset', 'claim'];
  const controls = (CL) => {
    const counts = [];
    for (let v = CR[0]; v <= CR[1]; v += Math.max(1, CR[2])) counts.push([v, v]);
    const built = {
      label: () =>
        NC.labels.length > 1
          ? sel(
              'label',
              'Name clusters by',
              NC.labels.map((l, i) => [i, l.label]),
              UI.label
            )
          : '',
      clusters: () => sel('clusters', 'Clusters', [['auto', 'Auto'], ...counts], UI.clusters || 'auto'),
      colour: () => sel('colour', 'Colour by', [['cluster', 'Cluster'], ...CB.map((c) => [c.id, c.name])], UI.colour),
      score: () =>
        SRC.some((s) => s.kind === 'pairs')
          ? sel(
              'score',
              `${SRC.find((s) => s.kind === 'pairs').label}, score`,
              OPT.steps.map((v) => [v, `${v / 1000} or more`]),
              UI.score
            )
          : '',
      top: () =>
        sel(
          'top',
          'Proteins (most sites)',
          [...new Set([100, 150, 200, 300, 500, OPT.top])].sort((a, b) => a - b).map((v) => [v, int(v)]),
          UI.top
        ),
      minc: () =>
        sel(
          'minc',
          'Smallest cluster',
          [...new Set([3, 5, 8, 10, 15, OPT.min_cluster])].sort((a, b) => a - b).map((v) => [v, v]),
          UI.minc
        ),
      find: () =>
        `<form class="nw-f nw-find" data-nw-find><span>Find a gene</span><input type="search" name="g" value="${esc(UI.find)}" placeholder="${esc(EG ? 'e.g. ' + EG : 'Gene')}" list="nw-genes" autocomplete="off" aria-label="Gene to highlight"></form>`,
      sources: () =>
        `<fieldset class="nw-f nw-srcs"><legend>Links from</legend>${SRC.map(
          (s, i) =>
            `<label class="nw-kg nw-src"><input type="checkbox" data-nw-src="${i}"${UI.src.includes(i) ? ' checked' : ''} aria-label="Use ${esc(s.label)}"><span>${esc(s.label)}${s.kind === 'pairs' ? ` (score ${UI.score / 1000} or more)` : ''}</span></label>`
        ).join('')}</fieldset>`,
      preset: () =>
        sel(
          'preset',
          'Export size',
          [
            ['screen', 'Slide (960 wide)'],
            ['paper', 'Paper (180 mm, 300 dpi)'],
          ],
          UI.preset
        ),
      claim: () =>
        `<label class="nw-f nw-claim"><span>Export title</span><input type="text" data-nw-claim value="${esc(UI.claim)}" placeholder="${esc(claimOf(CL ? CL.nShown : 'N'))}" aria-label="Title of the exported figure"></label>`,
    };
    const want = new Set(NC.controls || ['clusters', 'colour', 'find']),
      phone = phoneNow(),
      main = phone ? [] : CONTROL_ORDER.filter((id) => want.has(id)),
      rest = CONTROL_ORDER.filter((id) => !main.includes(id));
    const html = (ids) => ids.map((id) => built[id]()).join('');
    return (
      `<div class="nw-bar nw-row" role="group" aria-label="Network options">${html(main)}` +
      `<div class="nw-btns"><button type="button" class="btn small" data-nw-view="${UI.mode === 'network' ? 'table' : 'network'}">${UI.mode === 'network' ? 'Table view' : 'Network view'}</button>` +
      (UI.mode === 'network' && !phone
        ? `<button type="button" class="btn small" data-nw-zoom="-1" aria-label="Zoom out"${UI.zoom <= 1 ? ' disabled' : ''}>−</button><button type="button" class="btn small" data-nw-zoom="1" aria-label="Zoom in"${UI.zoom >= 3 ? ' disabled' : ''}>+</button>`
        : '') +
      `<button type="button" class="btn small" data-nw-reset>Reset</button>` +
      `${K.expBar(['svg', 'png', 'tsv'], 'nwexp', 'the network')}</div></div>` +
      `<details class="nw-more"${UI.more ? ' open' : ''}><summary>More options</summary><div class="nw-bar" role="group" aria-label="More network options">${html(rest)}</div></details>`
    );
  };
  let curL = null;
  function figureBox(M, CL) {
    const variant = phoneNow() ? 'phone' : 'desktop',
      L = layoutFor(M, variant);
    if (!L)
      return lastFig
        ? `<div class="nw-fig nw-stale" aria-busy="true">${lastFig}</div><p class="muted" role="status">Laying out the network…</p>`
        : '<p class="muted" role="status">Laying out the network…</p>';
    curL = L;
    const s = svgOf(M, CL, L, false);
    const finding = `Network of ${int(M.nodes.length)} proteins in ${int(CL.nShown)} clusters: ${CL.shown
      .map((c) => `${CL.list[c].label} (${int(CL.list[c].n)})`)
      .join(', ')}. The table view lists them.`;
    lastFig = `<svg class="nw-svg" viewBox="0 0 ${L.w} ${L.h}" role="img" aria-label="${esc(finding)}">${s.svg}</svg>`;
    return (
      `<div class="nw-fig" tabindex="0" role="group" aria-label="Network figure: arrow keys move between proteins and clusters, Enter opens a protein or lights a cluster, Escape clears">` +
      `<svg class="nw-svg" data-w="${L.w}" data-h="${L.h}" viewBox="0 0 ${L.w} ${L.h}" style="width:${phoneNow() ? 100 : UI.zoom * 100}%" role="img" aria-label="${esc(finding)}">${s.svg}</svg></div>`
    );
  }
  const leadOf = () => NC.lead || String(NC.about || '').split(/(?<=[.!?])\s/)[0];
  function view() {
    const head = `<div class="page-head results-head"><div><h2>${esc(TITLE)}</h2><p class="cx">${esc(leadOf())}</p></div></div>`;
    const M = model();
    if (M.error) return `${head}<p class="muted">The network could not be read (${esc(M.error)}).</p>`;
    if (M.wait) return `${head}<p class="muted" role="status">Loading the network…</p>`;
    const CL = clusters(M);
    const sel0 = K.sel?.active();
    let note = '';
    if (sel0)
      note =
        M.picked != null && M.nodes.length
          ? `<div class="filter-note">Your selection: ${int(M.picked)} of its proteins have a link in these sources; ${int(M.nodes.length)} are drawn.</div>`
          : '';
    const sum = `${int(M.nodes.length)} proteins · ${int(M.edges.length)} links · ${int(CL.nShown)} clusters${CL.nOther ? ` (${int(CL.nOther)} smaller, grey)` : ''}${sel0 ? ' · your selection' : ''}`;
    const body = !M.nodes.length
      ? `<p class="muted">${sel0 ? 'No protein of the selection has a link in the chosen sources, so there is nothing to draw. Choose more sources or a lower score, or widen the selection.' : 'No protein has a link in the chosen sources.'}</p>`
      : UI.mode === 'table'
        ? `<p class="nw-count" role="status">${sum}</p>${tableHtml(M, CL)}`
        : `<div class="nw-main">${keyHtml(M, CL, { variant: phoneNow() ? 'phone' : 'desktop' }, sum)}${figureBox(M, CL)}${phoneNow() ? listHtml(CL) : ''}</div><div class="nw-pin" role="status">${pinHtml(M, CL)}</div>`;
    const names = `<datalist id="nw-genes">${M.nodes.map((n) => `<option value="${esc(n.gene)}"></option>`).join('')}</datalist>`;
    return (
      head + controls(CL) + note + body + names + K.fold('nw-how', 'How this network is made', '', methodHtml(), false)
    );
  }
  // a touch screen: the first tap on a node shows its card, with the link
  const pinHtml = (M, CL) => {
    const i = UI.pin;
    if (i == null || !M.nodes[i]) return '';
    return `<p>${tipOf(M, CL, i)} <a href="${esc(K.link('protein', M.nodes[i].acc))}">Open ${esc(M.nodes[i].gene)}</a></p>`;
  };
  // the card of a protein, in the guide's order: who, the value, the counts, the test, a hint
  function tipOf(M, CL, i) {
    const nd = M.nodes[i],
      c = CL.list[nd.c],
      sp = colourSpec(M),
      inC = M.adj[i].filter(([j]) => M.nodes[j].c === nd.c).length,
      out = M.deg[i] - inC;
    let extra = '';
    if (sp) {
      const v = sp.v[nd.g];
      const cats = NC.color_by.find((x) => x.id === sp.id)?.cats || [];
      extra = `<br>${esc(sp.name)}: ${sp.kind === 'sequential' ? (v == null ? 'no value' : Math.round(v * 100) + '%') : v < 0 ? 'no value' : esc(cats[v] || '')}`;
    }
    return (
      `<b>${esc(nd.gene)}</b> · ${c.other ? 'a smaller cluster' : esc(c.label) + ' (cluster ' + (c.rank + 1) + ')'} <span class="muted">${esc(nd.acc)}</span><br>` +
      `<b>${int(nd.sites)}</b> ${esc(W.marks)}<br>${int(M.deg[i])} ${M.deg[i] === 1 ? 'partner' : 'partners'} (${int(inC)} in cluster, ${int(out)} outside)` +
      (c.l.q != null
        ? `<br>Cluster term: ${esc(c.name)}<br>${esc(NC.labels[c.l.source]?.label || 'Term')}: ${int(c.l.k)} of ${int(c.n)} cluster proteins, ${int(c.l.M)} of ${int(c.l.N)} in the network · q ${esc(K.fq(c.l.q))}`
        : '') +
      extra +
      `<br><span class="muted">Click to open the protein page.</span>`
    );
  }
  function tipOfCluster(M, CL, c) {
    const x = CL.list[c];
    let within = 0,
      between = 0;
    M.edges.forEach(([a, b]) => {
      const ca = M.nodes[a].c,
        cb = M.nodes[b].c;
      if (ca === c && cb === c) within++;
      else if (ca === c || cb === c) between++;
    });
    return (
      `<b>${esc(x.name)}</b> · cluster ${x.other ? 'among the smaller ones' : x.rank + 1}<br>` +
      `<b>${int(x.n)}</b> proteins<br>${int(within)} links inside, ${int(between)} to other clusters` +
      (x.l.q != null
        ? `<br>${esc(NC.labels[x.l.source]?.label || 'Term')}: ${int(x.l.k)} of ${int(x.n)} cluster proteins, ${int(x.l.M)} of ${int(x.l.N)} in the network · q ${esc(K.fq(x.l.q))}`
        : '') +
      `<br><span class="muted">Click to keep its links lit.</span>`
    );
  }
  // ---- exports ----------------------------------------------------------------------------------------------------------------
  // the figure in the style guide's frame: a title that is a claim, one sentence, a key, the drawing, a caption and the credit.
  // 'screen' is 960 units wide (slides), 'paper' 680 units drawn at 180 mm, where 1 unit is 0.75 pt; the drawing is laid out
  // again at that width, with type at the guide's sizes, never scaled down. No hash, file name or address in the frame.
  const FX = { ink: '#111827', ink2: '#374151', muted: '#5f6f78', line: '#e0e8eb' };
  const SIZES = {
    screen: { W: 960, P: 24, title: 20, sub: 13, direct: 13, gene: 11, key: 12, cap: 11.5, credit: 10 },
    paper: { W: 680, P: 16, title: 13.33, sub: 10.67, direct: 9.33, gene: 8, key: 8.67, cap: 8.67, credit: 8 },
  };
  function figure() {
    const M = model(),
      CL = clusters(M),
      Z = SIZES[UI.preset] || SIZES.screen,
      paper = UI.preset === 'paper',
      Wd = Z.W,
      P = Z.P,
      drawW = Wd - 2 * P,
      sp = colourSpec(M),
      WSL = 1.18,
      FF = K.FF,
      view = viewOf(M);
    const pos = K.netlayout.positions(view, 'desktop', UI.minc, maxShown());
    let L = K.netlayout.finish(view, pos, 'desktop');
    for (let n = 0; n < 3; n++) {
      const s = drawW / L.w;
      L = K.netlayout.finish(view, pos, 'desktop', Math.max(Z.direct / s, Z.gene / s + 1.5), Z.gene / s);
    }
    const s = drawW / L.w,
      fig = svgOf(M, CL, L, true),
      parts = [],
      T = (x, y, t, size, o = {}) =>
        parts.push(
          `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || FX.ink}">${esc(t)}</text>`
        );
    const wrapT = (t, size, weight) => K.wrap(t, drawW / WSL, size, weight, FF);
    const title = (UI.claim || '').trim() || claimOf(CL.nShown);
    let y = P;
    wrapT(title, Z.title, 'bold')
      .slice(0, 2)
      .forEach((t) => {
        y += Z.title * 1.15;
        T(P, y, t, Z.title, { weight: 'bold' });
      });
    const top = K.sel?.active() ? 'The selected proteins' : `The ${int(UI.top)} proteins with the most ${W.marks}`,
      p = SRC.find((x) => x.kind === 'pairs'),
      g = SRC.filter((x) => x.kind === 'groups'),
      sub = `${top}, joined by ${p ? `${p.label} (score ${UI.score / 1000} or more)` : sourceNames()}${g.length ? ` and ${g.map((x) => x.label).join(' and ')}` : ''}; the area of a node follows its number of ${W.marks}.`;
    y += 4;
    wrapT(sub, Z.sub, 400).forEach((t) => {
      y += Z.sub * 1.3;
      T(P, y, t, Z.sub, { fill: FX.muted });
    });
    if (K.sel?.active() && K.sel.summary)
      wrapT(`Selection: ${K.sel.summary()}.`, Z.sub, 400)
        .slice(0, 2)
        .forEach((t) => {
          y += Z.sub * 1.3;
          T(P, y, t, Z.sub, { fill: FX.muted });
        });
    // the key: one row that wraps, with the marks themselves
    y += Z.key * 1.4;
    let kx = P;
    const kw = (t) => K.tw(t, Z.key) * WSL;
    const keyItem = (w, draw, label) => {
      if (kx > P && kx + w + 6 + kw(label) > Wd - P) {
        kx = P;
        y += Z.key * 1.6;
      }
      parts.push(`<g transform="translate(${kx.toFixed(1)},${(y - Z.key * 0.35).toFixed(1)})">${draw}</g>`);
      T(kx + w + 5, y, label, Z.key, { fill: FX.muted });
      kx += w + 5 + kw(label) + 16;
    };
    const rs = [5, 20, 40].map((v) => Math.min(9, 2.6 + 0.95 * Math.sqrt(v)) * s);
    keyItem(
      rs.reduce((a, r) => a + 2 * r + 4, 0),
      rs
        .map((r, i) => {
          const cx = rs.slice(0, i).reduce((a, q) => a + 2 * q + 4, 0) + r;
          return `<circle cx="${cx.toFixed(1)}" cy="0" r="${r.toFixed(1)}" fill="none" stroke="${FX.muted}" stroke-width="0.75"/>`;
        })
        .join(''),
      `${W.marks}: 5 · 20 · 40+`
    );
    keyItem(
      22,
      `<line x1="0" x2="22" y1="0" y2="0" stroke="${CAT.light[0]}" stroke-opacity="0.6" stroke-width="1"/>`,
      'Link in a cluster'
    );
    keyItem(
      22,
      `<line x1="3" x2="19" y1="0" y2="0" stroke="#52606a" stroke-opacity="0.35" stroke-width="5" stroke-linecap="round"/>`,
      'Links between clusters (width: how many)'
    );
    if (sp)
      keyItem(
        0,
        '',
        sp.kind === 'sequential'
          ? `${sp.name}: ${[0, 0.5, 1].map((v) => Math.round(v * 100) + '%').join(' · ')} (light to dark blue)`
          : `${sp.name}: ${(NC.color_by.find((c) => c.id === sp.id)?.cats || []).join(' · ')}`
      );
    y += 10;
    const bodyY = y;
    parts.push(`<g transform="translate(${P},${bodyY}) scale(${s.toFixed(5)})">${fig.svg}</g>`);
    y = bodyY + L.h * s + 12;
    // the caption: the method in a sentence, in the reader's words
    const lab = NC.labels[UI.label] || NC.labels[0] || {},
      cap = `${sourceNames()}${p ? `; scores of ${UI.score / 1000} or more` : ''}. Clusters are Louvain communities${UI.clusters ? `, with the resolution chosen to give about ${UI.clusters}` : ''}; each is named by the ${lab.label || 'annotation'} term of smallest q (hypergeometric test, Benjamini–Hochberg q ≤ ${OPT.max_q}), shortened on the figure. ${CL.nOther ? `${int(CL.nOther)} smaller clusters (${int(CL.protsOther)} proteins) are grey at the bottom. ` : ''}${lab.cite ? lab.cite + '. ' : ''}`;
    wrapT(cap, Z.cap, 400)
      .slice(0, 5)
      .forEach((t) => {
        y += Z.cap * 1.3;
        T(P, y, t, Z.cap, { fill: FX.ink2 });
      });
    // the credit strip, in a group that can be cropped
    y += 8;
    const credit = [];
    const CIT = K.CIT || {};
    if (CIT.preferred)
      credit.push(`Cite: ${CIT.preferred.text}${CIT.preferred.doi ? ' doi:' + CIT.preferred.doi : ''}`);
    if ((CIT.references || []).length)
      credit.push('Data: ' + CIT.references.map((r) => r.short + (r.doi ? ' doi:' + r.doi : '')).join('; '));
    credit.push(
      `${D.site.name}, version ${CIT.version || '–'}${CIT.date ? ' (' + K.hdate(CIT.date) + ')' : ''} · ptmcontext ${D.kit.version}${D.run?.snapshot?.release ? ' · ' + D.run.snapshot.release : ''}`
    );
    credit.push(
      `Exported ${K.hdate(new Date().toISOString())}${CIT.licence ? ' · license ' + K.hlicence(CIT.licence) : ''}`
    );
    const cg = [`<line x1="${P}" x2="${Wd - P}" y1="${y}" y2="${y}" stroke="${FX.line}" stroke-width="0.75"/>`];
    y += 4;
    credit.forEach((ln) =>
      K.wrap(ln, drawW / WSL, Z.credit).forEach((t) => {
        y += Z.credit * 1.3;
        cg.push(`<text x="${P}" y="${y.toFixed(1)}" font-size="${Z.credit}" fill="${FX.muted}">${esc(t)}</text>`);
      })
    );
    parts.push(`<g id="credit">${cg.join('')}</g>`);
    const H = Math.ceil(y + P),
      desc = `${title}. ${sub} ${cap}`.replace(/\s+/g, ' '),
      meta = JSON.stringify(
        K.provenance({
          figure: title,
          view: 'network',
          preset: UI.preset,
          min_score: UI.score / 1000,
          top: UI.top,
          clusters: UI.clusters || 'auto',
          selection: K.sel?.active() ? K.sel.describe() : '',
        })
      );
    const size = paper ? ` width="180mm" height="${((H * 180) / Wd).toFixed(1)}mm"` : ` width="${Wd}" height="${H}"`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 ${Wd} ${H}" font-family="${FF}">` +
      `<title>${esc(title)}</title><desc>${esc(desc)}</desc><metadata id="ptmcontext-provenance">${esc(meta)}</metadata>` +
      `<rect width="${Wd}" height="${H}" fill="#ffffff"/>${parts.join('')}</svg>`;
    return paper
      ? { svg, W: Wd, H, title, desc, meta, mm: 180, dpi: 300 }
      : { svg, W: Wd, H, title, desc, meta, dpi: 192 };
  }
  function tsv() {
    const M = model(),
      CL = clusters(M),
      sp = colourSpec(M);
    const rows = M.nodes.map((nd, i) => {
      const inC = M.adj[i].filter(([j]) => M.nodes[j].c === nd.c).length;
      return [
        nd.c + 1,
        CL.list[nd.c].other ? 'smaller cluster' : CL.list[nd.c].name,
        CL.list[nd.c].l.id || '',
        CL.list[nd.c].l.q != null ? CL.list[nd.c].l.q.toPrecision(3) : '',
        nd.gene,
        nd.acc,
        nd.sites,
        M.deg[i],
        inC,
        M.deg[i] - inC,
        sp
          ? sp.v[nd.g] == null || sp.v[nd.g] < 0
            ? ''
            : sp.kind === 'sequential'
              ? sp.v[nd.g]
              : (NC.color_by.find((c) => c.id === sp.id)?.cats || [])[sp.v[nd.g]]
          : '',
      ];
    });
    return (
      K.preamble(
        `${TITLE}`,
        `${int(M.nodes.length)} proteins, ${int(M.edges.length)} links. ${methodText().cites.join('; ')}.`
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
        'partners_in_cluster',
        'partners_outside',
        sp ? sp.name.replace(/\W+/g, '_') : 'colour',
      ].join('\t') +
      '\n' +
      rows.map((r) => r.join('\t')).join('\n') +
      '\n'
    );
  }
  // ---- hover and focus: light a protein's or a cluster's neighbourhood without drawing again --------------------------------
  const svgEl = () => document.querySelector('.nw-svg');
  const staticDim = (M) => {
    const found = hit(M),
      lit = UI.hi >= 0 ? lightCluster(M, UI.hi) : null;
    return (i) => (lit && !lit.nodes.has(i)) || (found.size && !found.has(i));
  };
  function clearLight() {
    const svg = svgEl(),
      M = cache.M;
    if (!svg || !M || M.wait) return;
    const sd = staticDim(M);
    svg.querySelectorAll('.nw-n').forEach((a) => (a.style.opacity = sd(+a.dataset.nn) ? '0.18' : ''));
    svg
      .querySelectorAll('.nw-ie')
      .forEach((l) => (l.style.opacity = sd(+l.dataset.a) || sd(+l.dataset.b) ? '0.1' : ''));
    svg.querySelectorAll('.nw-hl').forEach((p) => (p.style.opacity = ''));
    svg.querySelectorAll('.nw-bd').forEach((p) => (p.style.opacity = UI.hi >= 0 ? '0.15' : ''));
    svg.querySelectorAll('.nw-gl').forEach((t) => (t.style.opacity = ''));
    svg.querySelectorAll('.nw-cl').forEach((g) => (g.style.opacity = ''));
    svg.querySelector('.nw-x').innerHTML = '';
    svg.querySelector('.nw-top').innerHTML = '';
  }
  function light(kind, id) {
    const svg = svgEl(),
      M = cache.M,
      L = curL;
    if (!svg || !M || M.wait || !L) return;
    const lit = kind === 'n' ? lightNode(M, id) : lightCluster(M, id),
      f1 = (v) => v.toFixed(1),
      k = L.k;
    svg.querySelectorAll('.nw-n').forEach((a) => (a.style.opacity = lit.nodes.has(+a.dataset.nn) ? '' : '0.16'));
    svg
      .querySelectorAll('.nw-ie')
      .forEach((l) => (l.style.opacity = lit.nodes.has(+l.dataset.a) && lit.nodes.has(+l.dataset.b) ? '' : '0.1'));
    svg.querySelectorAll('.nw-hl').forEach((p) => (p.style.opacity = lit.clusters.has(+p.dataset.nwc) ? '' : '0.35'));
    svg.querySelectorAll('.nw-cl').forEach((g) => (g.style.opacity = lit.clusters.has(+g.dataset.nwc) ? '' : '0.35'));
    svg
      .querySelectorAll('.nw-bd')
      .forEach(
        (p) => (p.style.opacity = kind === 'n' ? '0.15' : +p.dataset.ba === id || +p.dataset.bb === id ? '0' : '0.1')
      );
    svg.querySelectorAll('.nw-gl').forEach((t) => (t.style.opacity = lit.nodes.has(+t.dataset.gi) ? '' : '0.2'));
    // the links that cross between clusters: a protein's own, or all of a cluster's, in ink
    const xs = [];
    M.edges.forEach(([a, b, fl]) => {
      const ca = M.nodes[a].c,
        cb = M.nodes[b].c;
      if (ca === cb) return;
      if (kind === 'n' ? a === id || b === id : ca === id || cb === id) xs.push([a, b, fl]);
    });
    const op = kind === 'n' ? 0.55 : 0.2,
      w = (kind === 'n' ? 1 : 0.7) * (k < 1 ? 0.7 : 1);
    svg.querySelector('.nw-x').innerHTML = xs
      .map(
        ([a, b, fl]) =>
          `<line x1="${f1(L.pos[a][0])}" y1="${f1(L.pos[a][1])}" x2="${f1(L.pos[b][0])}" y2="${f1(L.pos[b][1])}" stroke="var(--ink)" stroke-opacity="${op}" stroke-width="${w}"${kind === 'n' && fl && !(fl & ~gbit) ? ' stroke-dasharray="3 2"' : ''}/>`
      )
      .join('');
    if (kind === 'n') {
      const rr = Math.min(9, 2.6 + 0.95 * Math.sqrt(M.nodes[id].sites)) * k,
        named = L.glabels.some((g) => g.i === id);
      svg.querySelector('.nw-top').innerHTML =
        `<circle cx="${f1(L.pos[id][0])}" cy="${f1(L.pos[id][1])}" r="${f1(rr + 2.5)}" fill="none" stroke="var(--ink)" stroke-width="1.5"/>` +
        (named
          ? ''
          : `<text x="${f1(L.pos[id][0])}" y="${f1(L.pos[id][1] - rr - 5)}" font-size="${L.gfs + 1}" font-weight="650" fill="var(--ink)" text-anchor="middle" paint-order="stroke" stroke="var(--surface)" stroke-width="3" stroke-linejoin="round">${esc(M.nodes[id].gene)}</text>`);
    }
  }
  const lightFrom = (t) => {
    const n = t.closest?.('.nw-n'),
      c = t.closest?.('[data-nwc]');
    if (n) return light('n', +n.dataset.nn);
    if (c) return light('c', +c.dataset.nwc);
  };
  document.addEventListener('mouseover', (e) => S.view === 'network' && lightFrom(e.target));
  document.addEventListener('mouseout', (e) => {
    if (S.view !== 'network') return;
    if (e.target.closest?.('.nw-n,[data-nwc]') && !e.relatedTarget?.closest?.('.nw-n,[data-nwc]')) clearLight();
    else if (e.target.closest?.('.nw-n,[data-nwc]')) lightFrom(e.relatedTarget);
  });
  document.addEventListener('focusin', (e) => S.view === 'network' && lightFrom(e.target));
  document.addEventListener('focusout', (e) => S.view === 'network' && e.target.closest?.('.nw-fig') && clearLight());
  // one Tab stop for the figure; arrows move between proteins (left, right) and clusters (up, down); Enter acts, Escape clears
  document.addEventListener('keydown', (e) => {
    if (S.view !== 'network') return;
    const fig = e.target.closest?.('.nw-fig');
    if (!fig) return;
    if (e.key === 'Escape') {
      clearLight();
      if (UI.hi >= 0 || UI.zc >= 0) {
        UI.hi = -1;
        UI.zc = -1;
        K.render();
      }
      return;
    }
    const nodes = [...fig.querySelectorAll('.nw-n')],
      cls = [...fig.querySelectorAll('.nw-cl')],
      curN = e.target.closest('.nw-n'),
      curC = e.target.closest('.nw-cl');
    if ((e.key === 'Enter' || e.key === ' ') && curC) {
      e.preventDefault();
      UI.hi = UI.hi === +curC.dataset.nwc ? -1 : +curC.dataset.nwc;
      return K.render();
    }
    const step = (list, cur, d) => {
      const i = cur ? list.indexOf(cur) : d > 0 ? -1 : 0;
      return list[(i + d + list.length) % list.length];
    };
    let to = null;
    if (e.key === 'ArrowRight') to = step(nodes, curN, 1);
    else if (e.key === 'ArrowLeft') to = step(nodes, curN, -1);
    else if (e.key === 'ArrowDown') to = step(cls, curC, 1);
    else if (e.key === 'ArrowUp') to = step(cls, curC, -1);
    if (to) {
      e.preventDefault();
      to.focus({ preventScroll: false });
    }
  });
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
    else if (k === 'label') UI.label = +t.value;
    else if (k === 'clusters') UI.clusters = t.value === 'auto' ? null : +t.value;
    else if (k === 'preset') {
      UI.preset = t.value;
      return K.render();
    } else if (k === 'minc') {
      UI.minc = +t.value;
      UI.zc = -1;
      save();
      if (UI.clusters) cache = { key: '', M: null };
      return K.render();
    } else UI[k === 'score' ? 'score' : 'top'] = +t.value;
    UI.hi = -1;
    UI.zc = -1;
    if (UI.colour !== 'cluster' || UI.label !== DEF.label || UI.clusters !== DEF.clusters) load('full');
    again();
  });
  document.addEventListener('input', (e) => {
    if (e.target.dataset?.nwClaim != null) UI.claim = e.target.value;
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest?.('[data-nw-find]');
    if (!f) return;
    e.preventDefault();
    UI.find = f.g.value;
    K.render();
  });
  // a phone's drawing zooms to one cluster: the viewBox runs to its outline over 250 ms (at once under reduced motion)
  function zoomBox(c) {
    const L = curL,
      ci = L.shown.indexOf(c);
    if (ci < 0) return [0, 0, L.w, L.h];
    const h = L.hulls[ci],
      x0 = Math.min(...h.map((p) => p[0])) - 8,
      y0 = Math.min(...h.map((p) => p[1])) - 8,
      x1 = Math.max(...h.map((p) => p[0])) + 8,
      y1 = Math.max(...h.map((p) => p[1])) + 8,
      aspect = L.w / L.h;
    let w = x1 - x0,
      hh = y1 - y0;
    if (w / hh < aspect) w = hh * aspect;
    else hh = w / aspect;
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    return [Math.max(0, cx - w / 2), Math.max(0, cy - hh / 2), w, hh];
  }
  function applyZoom(animate) {
    const svg = svgEl();
    if (!svg || !curL) return;
    const target = UI.zc >= 0 ? zoomBox(UI.zc) : [0, 0, curL.w, curL.h];
    svg.querySelectorAll('.nw-zl').forEach((n) => n.remove());
    if (UI.zc >= 0 && cache.M) {
      // at this scale the names of the cluster's biggest proteins are drawn
      const M = cache.M,
        ids = M.nodes
          .map((n, i) => i)
          .filter((i) => M.nodes[i].c === UI.zc)
          .sort((a, b) => M.nodes[b].sites - M.nodes[a].sites)
          .slice(0, 8);
      svg.querySelector('.nw-top').innerHTML = ids
        .map((i) => {
          const rr = Math.min(9, 2.6 + 0.95 * Math.sqrt(M.nodes[i].sites)) * curL.k;
          return `<text class="nw-zl" x="${(curL.pos[i][0] + rr + 1).toFixed(1)}" y="${(curL.pos[i][1] + 2).toFixed(1)}" font-size="${(curL.gfs * 0.62).toFixed(1)}" font-weight="600" fill="var(--ink)" paint-order="stroke" stroke="var(--surface)" stroke-width="1.6" stroke-linejoin="round">${esc(M.nodes[i].gene)}</text>`;
        })
        .join('');
    }
    const from = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const set = (v) => svg.setAttribute('viewBox', v.map((x) => +x.toFixed(2)).join(' '));
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches || from.length !== 4) return set(target);
    const t0 = performance.now();
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / 250),
        e = u * u * (3 - 2 * u);
      set(from.map((x, i) => x + (target[i] - x) * e));
      if (u < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  (K.afterRender ||= []).push(() => {
    if (S.view === 'network' && UI.zc >= 0) applyZoom(false);
  });
  document.addEventListener(
    'toggle',
    (e) => {
      if (e.target.classList?.contains('nw-more')) UI.more = e.target.open;
    },
    true
  );
  const mq = matchMedia('(max-width: 760px)');
  mq.addEventListener?.('change', () => S.view === 'network' && K.render());
  K.clicks.push(
    [
      '[data-nw-row]',
      (el) => {
        const c = +el.dataset.nwRow;
        if (UI.hi === c && UI.zc !== c) UI.zc = c;
        else if (UI.zc === c) {
          UI.hi = -1;
          UI.zc = -1;
        } else {
          UI.hi = c;
          UI.zc = -1;
        }
        K.render();
      },
    ],
    [
      '.nw-cl,.nw-hl',
      (el) => {
        const c = +el.closest('[data-nwc]').dataset.nwc;
        UI.hi = UI.hi === c ? -1 : c;
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
        Object.assign(UI, { ...DEF, src: DEF.src.slice(), hi: -1, find: '', zoom: 1, pin: null, zc: -1 });
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
          `${D.site.id}_network${K.sel?.active() ? '_selection' : ''}${UI.preset === 'paper' ? '_paper' : ''}`,
          btn,
          tsv
        ),
    ]
  );
  K.tips.push(
    [
      '.nw-n',
      (el) => {
        const M = cache.M;
        return M && !M.wait ? tipOf(M, clusters(M), +el.dataset.nn) : '';
      },
    ],
    [
      '[data-nwc]',
      (el) => {
        const M = cache.M;
        return M && !M.wait ? tipOfCluster(M, clusters(M), +el.dataset.nwc) : '';
      },
    ]
  );
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
