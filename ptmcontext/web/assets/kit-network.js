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
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#b87a3d', '#9085e9', '#e66767'],
  };
  const OTHER = { light: '#9aa3a8', dark: '#7d8c97' };
  const EX = { light: { edge: '#52606a', bundle: 0.16, wash: 0.085, intra: 0.32, ink: '#111827', muted: '#5f6f78' } };
  // the figure style guide's sequential ramp (one hue, five steps): a share is drawn in the step it falls in, 0 to 20% and so on
  const RAMP = {
    light: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
    dark: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'],
  };
  const seqStep = (v) => Math.max(0, Math.min(4, Math.floor(v * 5)));
  const seqHex = (v, mode) => RAMP[mode][seqStep(v)];
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
    pins: [], // the accessions pinned (the address's p=, up to five)
    nbWhy: '',
    refocus: '', // a selector to give focus back to after the page is drawn again
    preset: 'screen',
    claim: '',
    zc: -1,
    more: false,
    nb: false, // the view is the protein and its partners (it is too far down the list of proteins to draw them all)
    nbSet: null,
    fz: false, // the drawing is zoomed to it
    fapply: false,
    topWas: null, // the number of proteins before it had to be raised to hold the focus
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
          top: UI.topWas ?? UI.top,
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
    !UI.nb &&
    !UI.nb &&
    UI.src.length === DEF.src.length;
  const phoneNow = () => matchMedia('(max-width: 760px)').matches;
  // ---- the files, read when the view first needs them ---------------------------------------------------------------------
  const FILE = { view: null, full: null };
  const wait = {};
  // the focus, noted so that it can be given back when the page is drawn again for a reason of its own (a file arrived)
  const keepFocus = () => {
    const a = document.activeElement,
      n = a?.closest?.('.nw-n'),
      c = a?.closest?.('.nw-cl');
    if (n) UI.refocus = `.nw-n[data-nn="${n.dataset.nn}"]`;
    else if (c) UI.refocus = `.nw-cl[data-nwc="${c.dataset.nwc}"]`;
  };
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
        if (S.view === 'network') {
          keepFocus();
          K.render();
        }
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
      UI.nb ? UI.pins.join() : '',
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
      const pick =
        UI.nb && UI.nbSet
          ? UI.nbSet
          : sel
            ? new Set(f.acc.map((a, i) => (K.sel.protSelected(a) ? i : -1)).filter((i) => i >= 0))
            : null;
      // a selection of one to three proteins is drawn with their partners: alone, they have few links among themselves
      let seeds = 0,
        seedSet = null;
      if (!UI.nb && sel && pick && pick.size && pick.size <= 3) {
        seedSet = new Set(pick);
        seeds = pick.size;
        [...pick].forEach((g) => K.netcore.partnersOf(f, g, UI.score, UI.src).forEach((x) => pick.add(x)));
      }
      const v = K.netcore.makeView(f, UI.nb || seeds ? { ...optNow(), top: 1e9 } : optNow(), pick, UI.src);
      M = {
        nodes: v.nodes.map((g, i) => ({ acc: f.acc[g], gene: f.gene[g], sites: f.sites[g], c: v.comm[i], g })),
        edges: v.edges,
        labels: v.labels,
        full: f,
        picked: pick ? pick.size : null,
        seeds,
        seedIdx: seedSet ? new Set(v.nodes.map((g, i) => (seedSet.has(g) ? i : -1)).filter((i) => i >= 0)) : null,
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
        // a cluster no term names (or none holds for a fair share of it) is named by its busiest proteins
        name: l.term || (l.genes || []).join(', ') || `Cluster ${c + 1}`,
        label: sn || (l.genes || []).join(', ') || `Cluster ${c + 1}`,
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
      return `var(--fig-seq-${seqStep(v) + 1})`;
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
  let FOC = -1; // the node of the protein the address names, when it is drawn
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
        if (S.view === 'network' && cache.lay === hold) {
          keepFocus();
          K.render();
        }
      });
      return null;
    }
    return (hold[key] = K.netlayout.layout(view, variant, UI.minc, maxShown()));
  }
  // ---- the figure ---------------------------------------------------------------------------------------------------------------
  // the genes to find, with the main search's other names (aliases, entry names) read as the proteins they name
  const findIn = (text, nodes) => K.netcore.findGenes(text, nodes, K.sel?.lookup);
  // the find box is kept in the address (nf=), so a highlight can be shared and Back restores it
  const setFind = (v) => {
    UI.find = v;
    S.nf = String(v).trim().split(/\s+/).filter(Boolean).join(' ');
  };
  const hit = (M) => (UI.find.trim() ? findIn(UI.find, M.nodes).hits : new Set());
  const gbit = SRC.map((s, i) => (s.kind === 'groups' ? 1 << i : 0)).reduce((a, b) => a | b, 0);
  // the neighbours of a protein, and what a cluster is joined to: the nodes and the clusters to light
  const lightNode = (M, i) => {
    const nodes = new Set([i, ...M.adj[i].map(([j]) => j)]);
    return { nodes, clusters: new Set([...nodes].map((j) => M.nodes[j].c)) };
  };
  // the nodes of the pinned proteins that this view holds, and what they light together
  let PIN = new Set(); // node indexes of the pins in the model being drawn
  const lightPins = (M, set) => {
    const nodes = new Set(),
      clusters = new Set();
    set.forEach((i) => {
      const l = lightNode(M, i);
      l.nodes.forEach((x) => nodes.add(x));
      l.clusters.forEach((x) => clusters.add(x));
    });
    return { nodes, clusters };
  };
  const lightCluster = (M, c) => {
    const nodes = new Set();
    M.nodes.forEach((nd, i) => nd.c === c && nodes.add(i));
    const mine = [...nodes];
    mine.forEach((i) => M.adj[i].forEach(([j]) => nodes.add(j)));
    return { nodes, clusters: new Set([c]) };
  };
  // what a pin adds to the drawing: its links to other clusters in ink (dashed when only a group source holds them) and a
  // ring round it; the same in the page, in an export and (with hover) when the pointer leaves
  let OVL = { x: '', top: '' };
  function pinOverlay(M, L, pinSet, ex, mini, ink) {
    if (mini || !pinSet.size) return { x: '', top: '' };
    const f1 = (v) => v.toFixed(1),
      k = L.k,
      x = [],
      top = [];
    M.edges.forEach(([a, b, fl]) => {
      if (!(pinSet.has(a) || pinSet.has(b))) return;
      if (M.nodes[a].c === M.nodes[b].c) return;
      x.push(
        `<line x1="${f1(L.pos[a][0])}" y1="${f1(L.pos[a][1])}" x2="${f1(L.pos[b][0])}" y2="${f1(L.pos[b][1])}" stroke="${ink}" stroke-opacity="0.55" stroke-width="${k < 1 ? 0.7 : 1}"${fl && !(fl & ~gbit) ? ' stroke-dasharray="3 2"' : ''}/>`
      );
    });
    pinSet.forEach((i) => {
      const rr = Math.min(9, 2.6 + 0.95 * Math.sqrt(M.nodes[i].sites)) * k;
      top.push(
        `<circle cx="${f1(L.pos[i][0])}" cy="${f1(L.pos[i][1])}" r="${f1(rr + 2.5)}" fill="none" stroke="${ink}" stroke-width="1.5"/>`
      );
    });
    return { x: x.join(''), top: top.join('') };
  }
  // the drawing as an SVG string: classes and data attributes carry what hovering needs; ex: literal colours and no links
  // mini: the small drawing on a protein's page ({ focus: node index }): no links, no hover state, no search or highlight
  // pins: the nodes that are pinned (the page's, or an export's own)
  // crop: { x, y, w, h } of an export that shows only part of the drawing: names that do not fit in it are left out
  function svgOf(M, CL, L, ex, mini = null, pins = null, crop = null) {
    const phone = L.variant === 'phone',
      k = L.k,
      pinSet = mini ? new Set(mini.focus >= 0 ? [mini.focus] : []) : pins || PIN,
      found = mini ? new Set() : hit(M),
      lit = mini ? null : pinSet.size ? lightPins(M, pinSet) : UI.hi >= 0 ? lightCluster(M, UI.hi) : null,
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
        `<path class="${mini ? 'nw-mhl' : 'nw-hl'}"${mini ? '' : ` data-nwc="${c}"`} d="${d}" fill="${clusterFill(x, ex)}" stroke="none" ` +
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
    const ovl = pinOverlay(M, L, pinSet, ex, mini, ink, bg);
    if (!ex && !mini) OVL = ovl;
    out.push(`</g><g class="nw-x">${ovl.x}</g><g class="nw-nodes">`);
    P.forEach((p, i) => {
      const nd = M.nodes[i],
        ring =
          found.has(i) || pinSet.has(i)
            ? ` stroke="${ink}" stroke-width="2.4"`
            : ` stroke="${bg}" stroke-width="${phone ? 1 : 1.4}"`,
        dot = `<circle class="nw-dot" cx="${f1(p[0])}" cy="${f1(p[1])}" r="${r(i).toFixed(1)}" fill="${fillOf(M, CL, i, ex)}"${ring}/>`;
      if (ex || mini) out.push(`<g${dim(i) ? ' opacity="0.18"' : ''}>${dot}</g>`);
      else
        out.push(
          `<a href="${esc(K.link('protein', nd.acc))}" class="nw-n" data-nn="${i}" tabindex="-1" aria-label="${esc(nd.gene)}, ${int(nd.sites)} ${esc(W.marks)}"${dim(i) ? ' style="opacity:0.18"' : ''}>` +
            `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${Math.max(r(i) + 3, phone ? 12 : 7).toFixed(1)}" fill="transparent"/>${dot}</a>`
        );
    });
    out.push('</g><g class="nw-labels">');
    // names: text in ink with a halo, a dot in the cluster's colour beside it (the text itself is never coloured)
    const halo = (w) => `paint-order="stroke" stroke="${bg}" stroke-width="${w}" stroke-linejoin="round"`;
    // a halo behind text: the page uses paint-order; an export (which a PDF converter reads) draws the halo as a text of its own
    const text = (x, y, size, wt, fill, s, extra = '', w = 3.5) =>
      ex
        ? `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" font-weight="${wt}" fill="${bg}" stroke="${bg}" stroke-width="${w}" stroke-linejoin="round" ${extra}>${esc(s)}</text>` +
          `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" font-weight="${wt}" fill="${fill}" ${extra}>${esc(s)}</text>`
        : `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" font-weight="${wt}" fill="${fill}" ${halo(w)} ${extra}>${esc(s)}</text>`;
    const inCrop = (b) =>
      !crop || (b[0] >= crop.x && b[1] >= crop.y && b[2] <= crop.x + crop.w && b[3] <= crop.y + crop.h);
    L.clabels.forEach((l) => {
      if (!inCrop(l.box)) return;
      const x = CL.list[l.c],
        [x0, y0, x1, y1] = l.box,
        [ax, ay, bx, by] = l.leader,
        fs = L.fs,
        attrs = `class="${mini ? 'nw-mcl' : 'nw-cl'}"${mini ? '' : ` data-nwc="${l.c}"`}${ex || mini ? '' : ' tabindex="-1" role="button" aria-label="' + esc(x.name) + ', ' + int(x.n) + ' proteins"'}`;
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
      if (!inCrop(g.box)) return;
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
    // a gene that was searched for or pinned is always named, in a place that touches no other label or node
    // (the layout measures a name a little short of how a font draws it: leave room beside each)
    const taken = [
      ...L.clabels.map((l) => l.box),
      ...L.glabels.map((g) => [
        g.box[0] - (g.box[2] - g.box[0]) * 0.15,
        g.box[1],
        g.box[2] + (g.box[2] - g.box[0]) * 0.15,
        g.box[3],
      ]),
    ];
    [...new Set([...found, ...pinSet])]
      .filter((i) => !named.has(i))
      .forEach((i) => {
        const gfs = L.gfs + 1,
          w = M.nodes[i].gene.length * gfs * 0.7 + 3,
          h = gfs * 1.15,
          cx = P[i][0],
          cy = P[i][1],
          rr = r(i) + 3,
          dirs = [
            [1, 0],
            [-1, 0],
            [0, -1],
            [0, 1],
            [0.7, -0.7],
            [-0.7, -0.7],
            [0.7, 0.7],
            [-0.7, 0.7],
          ],
          // right, left, above, below and the diagonals; then again further out, with a line to the node
          cands = [1, 2.2, 3.6, 5.5].flatMap((sc) =>
            dirs.map(([dx, dy]) => {
              const ax = cx + dx * rr * sc,
                ay = cy + dy * rr * sc;
              return [
                dx > 0.3 ? ax : dx < -0.3 ? ax - w : ax - w / 2,
                dy > 0.3 ? ay : dy < -0.3 ? ay - h : ay - h / 2,
                dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle',
                sc,
              ];
            })
          );
        const free = (bx, by) => {
          const b = [bx, by, bx + w, by + h];
          if (taken.some((q) => !(b[2] + 1 < q[0] || q[2] + 1 < b[0] || b[3] + 1 < q[1] || q[3] + 1 < b[1])))
            return false;
          return !P.some((p, j) => {
            if (j === i) return false;
            const nx = Math.min(Math.max(p[0], b[0]), b[2]),
              ny = Math.min(Math.max(p[1], b[1]), b[3]);
            return (p[0] - nx) ** 2 + (p[1] - ny) ** 2 < (r(j) - 1) ** 2;
          });
        };
        // the first free place, else the nearest (above the node)
        const ok = cands.find(([bx, by]) => free(bx, by)) || cands[2];
        taken.push([ok[0], ok[1], ok[0] + w, ok[1] + h]);
        if (ok[3] > 1) {
          const nx = Math.min(Math.max(cx, ok[0]), ok[0] + w),
            ny = Math.min(Math.max(cy, ok[1]), ok[1] + h),
            d = Math.hypot(nx - cx, ny - cy) || 1;
          out.push(
            `<line x1="${f1(cx + ((nx - cx) / d) * (rr - 2))}" y1="${f1(cy + ((ny - cy) / d) * (rr - 2))}" x2="${f1(nx)}" y2="${f1(ny)}" stroke="${muted}" stroke-width="0.8"/>`
          );
        }
        const ax = ok[2] === 'end' ? ok[0] + w : ok[2] === 'start' ? ok[0] : ok[0] + w / 2;
        out.push(text(ax, ok[1] + h - gfs * 0.25, gfs, 650, ink, M.nodes[i].gene, `text-anchor="${ok[2]}"`, 3));
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
    out.push(`</g><g class="nw-top">${ovl.top}</g>`);
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
  // the number of proteins drawn, beside the line that says how many are: the cause and its remedy together
  const topSelect = () =>
    `<label class="nw-inl"><span>Proteins: top</span><select data-nw="top" aria-label="Number of proteins drawn, those with most ${esc(W.marks)} first">${[
      ...new Set([100, 150, 200, 300, 500, OPT.top, UI.top]),
    ]
      .sort((a, b) => a - b)
      .map((v) => `<option value="${v}"${v === UI.top ? ' selected' : ''}>${int(v)}</option>`)
      .join('')}</select></label>`;
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
        `<span class="nw-kg"><span class="nw-sub">${esc(sp.name)}</span><span class="nw-sub">0%</span><span class="nw-seq" aria-hidden="true">${[1, 2, 3, 4, 5].map((n) => `<i style="background:var(--fig-seq-${n})"></i>`).join('')}</span><span class="nw-sub">100%</span><span class="nw-kg">${sw('var(--nw-other)')}No value</span></span>`
      );
    else if (sp) {
      const cats = (NC.color_by.find((c) => c.id === sp.id) || sp).cats || sp.cats || [];
      bits.push(
        `<span class="nw-kg"><span class="nw-sub">${esc(sp.name)}</span>${cats.map((c, n) => `<span class="nw-kg">${sw(c === 'Other' ? 'var(--nw-other)' : catVar(n))}${esc(c)}</span>`).join('')}<span class="nw-kg">${sw('var(--nw-other)')}No value</span></span>`
      );
    }
    return `<div class="nw-key" aria-label="Key"><span class="nw-sum" role="status">${sum}</span>${topSelect()}${bits.join('')}</div>`;
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
          `<tr><th scope="row">${x.other ? 'Smaller cluster: ' : ''}${esc(x.name)}${x.l.q != null ? ` <span class="muted">· ${int(x.l.k)} of ${int(x.n)}</span>` : x.other ? '' : ' <span class="muted">· no term holds for enough of it</span>'}</th><td class="num">${int(x.n)}</td><td class="num">${
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
      lab = L.label || 'the annotation';
    const bits = [
      `Nodes: the ${int(OPT.top)} proteins with the most ${W.marks} (or the selected proteins), sized by their number of ${W.marks}; proteins with no link among them are left out.`,
      p
        ? `Links: two proteins are joined when ${p.label} scores them ${OPT.min_score / 1000} or more${g.length ? ` or ${g.map((x) => x.label).join(' and ')} puts them in one group (groups over ${int(g[0].max_size)} proteins are left out)` : ''}.`
        : `Links: two proteins are joined when they share a group in ${sourceNames()}.`,
      `Clusters: Louvain communities (Blondel et al. 2008) of the links; the Clusters menu asks for a number, and communities under ${UI.minc} proteins are grey.`,
      `Names: the ${lab} term with the smallest q (hypergeometric test against the network, Benjamini–Hochberg) among terms of ${OPT.min_term} proteins or more and at most ${Math.round(OPT.max_fraction * 100)}% of the network${L.min_depth ? `, at least ${L.min_depth} levels below the top` : ''}${L.max_size ? `, with at most ${int(L.max_size)} proteins in the whole proteome` : ''}${L.non_iea ? ', from curated annotations only' : ''}; the figure shows a short form and the hover and table the full name.`,
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
  const CONTROL_ORDER = ['clusters', 'colour', 'find', 'label', 'score', 'minc', 'sources', 'preset', 'claim'];
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
      minc: () =>
        sel(
          'minc',
          'Smallest cluster',
          [...new Set([3, 5, 8, 10, 15, OPT.min_cluster])].sort((a, b) => a - b).map((v) => [v, v]),
          UI.minc
        ),
      find: () =>
        `<div class="nw-f nw-find" data-nw-find><span>Find genes</span><textarea name="g" rows="1" spellcheck="false" placeholder="${esc(EG ? 'e.g. ' + EG + ', or a list' : 'Gene symbols or accessions')}" aria-label="Genes to highlight: symbols or accessions, separated by commas, spaces or line breaks">${esc(UI.find)}</textarea></div>`,
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
      (UI.mode === 'network'
        ? `<button type="button" class="btn small" data-nw-zoom="-1" aria-label="Zoom out"${UI.zoom <= 1 ? ' disabled' : ''}>−</button><button type="button" class="btn small" data-nw-zoom="1" aria-label="Zoom in"${UI.zoom >= 3 ? ' disabled' : ''}>+</button>`
        : '') +
      `<button type="button" class="btn small" data-nw-reset>Reset</button>` +
      `${K.expBar(['svg', 'png', 'pdf', 'tsv'], 'nwexp', 'the network')}</div></div>` +
      `<details class="nw-more"${UI.more ? ' open' : ''}><summary>More options</summary><div class="nw-bar" role="group" aria-label="More network options">${html(rest)}</div></details>`
    );
  };
  let curL = null;
  function figureBox(M, CL) {
    const variant = phoneNow() ? 'phone' : 'desktop',
      L = layoutFor(M, variant);
    if (!L) curL = null;
    if (!L)
      return lastFig
        ? `<div class="nw-fig nw-stale" aria-busy="true">${lastFig}</div><p class="muted" role="status">Laying out the network…</p>`
        : '<p class="muted" role="status">Laying out the network…</p>';
    curL = L;
    const s = svgOf(M, CL, L, false);
    const finding = `Network of ${int(M.nodes.length)} ${plural(M.nodes.length, 'protein', 'proteins')} in ${int(CL.nShown)} ${plural(CL.nShown, 'cluster', 'clusters')}: ${CL.shown
      .map((c) => `${CL.list[c].label} (${int(CL.list[c].n)})`)
      .join(', ')}. The table view lists them.`;
    lastFig = `<svg class="nw-svg" viewBox="0 0 ${L.w} ${L.h}" role="group" aria-label="${esc(finding)}">${s.svg}</svg>`;
    return (
      `<div class="nw-fig${UI.zoom > 1 ? ' nw-z' : ''}" tabindex="0" role="group" aria-label="Network figure: arrow keys move between proteins and clusters, Enter pins a protein or lights a cluster, Escape clears">` +
      `<svg class="nw-svg" data-w="${L.w}" data-h="${L.h}" viewBox="0 0 ${L.w} ${L.h}" style="width:${UI.zoom * 100}%" role="group" aria-label="${esc(finding)}">${s.svg}</svg></div>`
    );
  }
  const leadOf = () => NC.lead || String(NC.about || '').split(/(?<=[.!?])\s/)[0];
  // ---- pins: the proteins a reader (or a link from a protein's page) has fixed on --------------------------------------------
  const sameAcc = (a, b) => a === b || String(a).split('-')[0] === String(b).split('-')[0];
  const TOPS = [100, 150, 200, 300, 500, 600];
  const MAXPINS = 5;
  const plural = (n, one, many) => (n === 1 ? one : many);
  const SITE_GENE = new Map((D.proteins || []).map((p) => [p[0], p[1]]));
  const geneOf = (acc, f) =>
    (f && f.nodes ? f.nodes.find((n) => sameAcc(n[0], acc))?.[1] : '') ||
    SITE_GENE.get(acc) ||
    SITE_GENE.get(String(acc).split('-')[0]) ||
    acc;
  const pinNodes = (M) =>
    new Set(UI.pins.map((a) => M.nodes.findIndex((n) => sameAcc(n.acc, a))).filter((i) => i >= 0));
  const linkNames = () => SRC.map((s) => s.label).join(' or ');
  // where the first pin is in this network, or what has to change so that it is: a note, a wait, or `raised` (the view
  // was changed and has to be made again)
  function focusInfo(M) {
    if (!UI.pins.length) return null;
    const missing = UI.pins.filter((a) => !M.nodes.some((n) => sameAcc(n.acc, a)));
    if (!missing.length) return null;
    if (UI.pins.length > 1 || K.sel?.active() || M.seeds)
      return {
        note: `${missing.map((a) => `<b>${esc(geneOf(a, M.full || FILE.full))}</b>`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in the network shown (no link in these sources, or outside the ${int(UI.top)} proteins drawn).`,
      };
    const acc = missing[0],
      f = load('full');
    if (!f) return { wait: true };
    if (f.error) return { note: 'The network data did not load.' };
    const plan = K.netcore.focusPlan(f, optNow(), acc, UI.src),
      gene = esc(geneOf(acc, f)),
      links = linkNames();
    if (plan.status === 'unknown')
      return {
        note: `<b>${gene}</b> is not in the network shown: it has no ${esc(links)} link at the lowest score the network keeps (${OPT.steps[0] / 1000}).`,
      };
    if (plan.status === 'none')
      return {
        note: `<b>${gene}</b> is not in the network shown: it has no ${esc(links)} link in the chosen sources.`,
      };
    if (plan.status === 'score')
      return {
        note: `<b>${gene}</b> is not in the network shown: it has no ${esc(links)} link at a score of ${UI.score / 1000} or more. <button type="button" class="btn small" data-nw-score="${plan.lowerTo}">Lower the score to ${plan.lowerTo / 1000}</button>`,
      };
    // it has partners: say why it was not drawn (by the numbers), then draw more, or only it and its partners
    UI.nbWhy =
      plan.rank < UI.top
        ? `none of its ${int(plan.partners.length)} ${plural(plan.partners.length, 'partner', 'partners')} is among the ${int(UI.top)} proteins with most ${W.marks}`
        : `it ranks ${int(plan.rank + 1)} by ${W.marks}, outside the ${int(UI.top)} drawn`;
    const top = TOPS.find((v) => v >= plan.need);
    if (!top) {
      UI.nb = true;
      UI.nbSet = new Set([plan.gi, ...plan.partners]);
      return { raised: true };
    }
    UI.topWas ??= UI.top;
    UI.top = Math.max(top, UI.top);
    return { raised: true };
  }
  // facts a card adds from the site's colour-by data (the domain class most sites are in, the share in disordered regions)
  function factsOf(M, i) {
    const f = M.full || FILE.full;
    if (!f || f.error || !f.color) return [];
    const nd = M.nodes[i],
      gi = nd.g >= 0 ? nd.g : f.byAcc?.get(nd.acc);
    if (gi == null) return [];
    const out = [];
    f.color.forEach((sp) => {
      const v = sp.v[gi],
        meta = NC.color_by.find((x) => x.id === sp.id) || sp;
      if (v == null || (sp.kind !== 'sequential' && v < 0)) return;
      out.push(
        `${meta.name}: ${sp.kind === 'sequential' ? Math.round(v * 100) + '%' : (meta.cats || sp.cats || [])[v] || ''}`
      );
    });
    return out;
  }
  // the lines of a protein's card, as plain text parts: { b: bold, t: text, m: muted }; the page and the export draw the same
  function cardLines(M, CL, i) {
    const nd = M.nodes[i],
      c = CL.list[nd.c],
      inC = M.adj[i].filter(([j]) => M.nodes[j].c === nd.c).length,
      out = M.deg[i] - inC,
      lines = [];
    lines.push({
      b: nd.gene,
      t: ` · ${c.other ? 'a smaller cluster' : c.label + ' (cluster ' + (c.rank + 1) + ')'}`,
      m: nd.acc,
    });
    lines.push({ b: int(nd.sites), t: ` ${plural(nd.sites, W.mark, W.marks)}` });
    lines.push({
      t: `${int(M.deg[i])} ${plural(M.deg[i], 'partner', 'partners')} (${int(inC)} in cluster, ${int(out)} outside)`,
    });
    if (c.l.q != null) {
      lines.push({ t: `Cluster term: ${c.name}` });
      lines.push({
        t: `${NC.labels[c.l.source]?.label || 'Term'}: ${int(c.l.k)} of ${int(c.n)} cluster proteins, ${int(c.l.M)} of ${int(c.l.N)} in the network · q ${K.fq(c.l.q)}`,
      });
    }
    factsOf(M, i).forEach((t) => lines.push({ t }));
    return lines;
  }
  const linesHtml = (lines) =>
    lines
      .map(
        (l) =>
          `<div>${l.b != null ? `<b>${esc(l.b)}</b>` : ''}${esc(l.t || '')}${l.m ? ` <span class="muted">${esc(l.m)}</span>` : ''}</div>`
      )
      .join('');
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  // the card on hover: the lines, then what a click does
  function tipOf(M, CL, i) {
    const pinned = UI.pins.some((a) => sameAcc(a, M.nodes[i].acc));
    return (
      linesHtml(cardLines(M, CL, i)) +
      `<div class="muted">${pinned ? (coarse() ? 'Tap again to open the protein page.' : 'Click again to open the protein page.') : coarse() ? 'Tap to pin it; tap again to open its page.' : 'Click to pin it; click again to open its page. Shift-click pins several.'}</div>`
    );
  }
  // the pinned proteins' panel under the figure: a card each, the link to the page, Unpin
  function pinHtml(M, CL) {
    const set = [...pinNodes(M)];
    if (!set.length) return '';
    const one = set.length === 1;
    const cards = set
      .map((i) => {
        const nd = M.nodes[i],
          lines = cardLines(M, CL, i),
          shown = one ? lines : lines.filter((l, k) => k < 3 || /^Cluster term/.test(l.t || '') === false).slice(0, 5);
        return (
          `<div class="nw-pc">${linesHtml(shown)}<div class="nw-pbtn"><a class="btn small" href="${esc(K.link('protein', nd.acc))}">Open protein page</a>` +
          `<button type="button" class="btn small" data-nw-unpin="${esc(nd.acc)}">Unpin${one ? '' : ' ' + esc(nd.gene)}</button></div></div>`
        );
      })
      .join('');
    const hint = coarse()
      ? 'Tap a pinned protein again to open its page.'
      : 'Click a pinned protein again to open its page.';
    return (
      `<aside class="nw-pinpanel" aria-label="Pinned ${plural(set.length, 'protein', 'proteins')}"><div class="nw-pcs">${cards}</div>` +
      `<div class="nw-phint muted">${hint} ${coarse() ? '' : ` Shift-click adds a protein (up to ${MAXPINS}); Escape unpins.`}${one ? '' : ' <button type="button" class="btn small" data-nw-unpinall>Unpin all</button>'}</div></aside>`
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
  // what a pasted list found: how many distinct proteins, the ones the network does not hold, and a way to make them the selection
  function findNote(M) {
    if (!UI.find.trim()) return '';
    const g = findIn(UI.find, M.nodes);
    if (g.tokens.length < 2 && !g.missing.length) return '';
    const f = M.full || FILE.full || (g.missing.length ? load('full') : null),
      fullNodes = f && !f.error ? f.acc.map((a, i) => ({ acc: a, gene: f.gene[i] })) : null,
      out = fullNodes ? g.missing.filter((t) => findIn(t, fullNodes).hits.size) : [],
      none = g.missing.filter((t) => !out.includes(t)),
      names = (l) => l.slice(0, 30).map(esc).join(', ') + (l.length > 30 ? ` and ${l.length - 30} more` : '');
    const why = [
      out.length
        ? `in the network but not among the ${int(M.nodes.length)} drawn (raise the number of proteins): ${names(out)}`
        : '',
      none.length ? `not in this network: ${names(none)}` : '',
    ].filter(Boolean);
    return `<b>${int(g.n)} of ${int(g.m)}</b> ${plural(g.m, 'protein', 'proteins')} found${why.length ? '; ' + why.join('; ') : ''}. <button type="button" class="btn small" data-nw-mksel>Make these the selection</button> <button type="button" class="btn small" data-nw-findclear>Clear</button>`;
  }
  // the one line that says what is drawn: proteins, links, the clusters that are named and the small grey ones, and a number
  // of clusters that could not be reached
  function summaryText(M, CL, sel0) {
    const p = SRC.find((s) => s.kind === 'pairs'),
      g = SRC.filter((s, i) => s.kind === 'groups' && UI.src.includes(i)),
      how = `${p ? `${p.label} score ≥ ${UI.score / 1000}` : sourceNames()}${p && g.length ? ' or ' : ''}${g.length ? 'in ' + g.map((s) => s.label).join(' and ') : ''}`,
      n = M.nodes.length,
      total = D.counts?.proteins;
    let head;
    if (M.seeds)
      head = `${int(n)} ${plural(n, 'protein', 'proteins')}: ${M.seeds === 1 ? 'the selected protein' : 'the ' + int(M.seeds) + ' selected'} and ${plural(M.seeds, 'its', 'their')} partners`;
    else if (UI.nb) head = `${int(n)} ${plural(n, 'protein', 'proteins')}: the pinned protein and its partners`;
    else if (sel0) {
      const m = K.sel?.nProteins?.();
      head = `${int(n)} of the ${m != null ? int(m) + ' ' : ''}selected ${plural(m, 'protein', 'proteins')} ${plural(n, 'is', 'are')} linked at ${how}`;
    } else
      head = `${int(n)} of the ${int(UI.top)} ${plural(UI.top, 'protein', 'proteins')} with the most ${W.marks}${total ? ` (of ${int(total)})` : ''} ${plural(n, 'is', 'are')} linked at ${how}`;
    const named = CL.nShown
      ? `${int(CL.nShown)} named ${plural(CL.nShown, 'cluster', 'clusters')}${UI.clusters && UI.clusters !== CL.nShown ? ` (${int(UI.clusters)} asked for; closest is ${int(CL.nShown)})` : ''}`
      : `no cluster of ${int(UI.minc)} or more proteins`;
    return `${head} · ${int(M.edges.length)} ${plural(M.edges.length, 'link', 'links')} · ${named}${CL.nOther ? `, ${int(CL.nOther)} small (grey)` : ''}`;
  }
  function view() {
    K.noNw = true; // the links this page draws are not given the network's own address parameters
    try {
      return viewInner();
    } finally {
      K.noNw = false;
    }
  }
  function viewInner() {
    if ((S.nf || '') !== UI.find.trim().split(/\s+/).filter(Boolean).join(' ')) UI.find = S.nf || ''; // an address names the genes
    const head = `<div class="page-head results-head"><div><h2>${esc(TITLE)}</h2><p class="cx">${esc(leadOf())}</p></div></div>`;
    let M = model();
    if (M.error) return `${head}<p class="muted">The network could not be read (${esc(M.error)}).</p>`;
    if (M.wait) return `${head}<p class="muted" role="status">Loading the network…</p>`;
    let fi = focusInfo(M);
    if (fi?.raised) {
      cache = { key: '', M: null };
      M = model();
      if (M.error) return `${head}<p class="muted">The network could not be read (${esc(M.error)}).</p>`;
      if (M.wait) return `${head}<p class="muted" role="status">Loading the network…</p>`;
      fi = focusInfo(M);
    }
    if (UI.pins.length && !M.full && !FILE.full) load('full'); // the cards' facts come from it
    const pins = pinNodes(M);
    FOC = UI.pins.length === 1 && pins.size === 1 ? [...pins][0] : -1;
    PIN = new Set([...pins, ...(M.seedIdx || [])]);
    if (FOC >= 0 && UI.fapply) {
      UI.hi = -1;
      UI.fz = M.nodes.length > 60;
      UI.ffocus = true;
      UI.fapply = false;
    }
    const CL = clusters(M);
    const sel0 = K.sel?.active();
    const slot = [];
    if (fi?.wait) slot.push('Looking for the protein in the network…');
    else if (fi?.note) slot.push(`${fi.note} <button type="button" class="btn small" data-nw-fclear>Dismiss</button>`);
    if (FOC >= 0 && !fi && (UI.fz || UI.nb || UI.topWas)) {
      const c = CL.list[M.nodes[FOC].c];
      slot.push(
        `Showing <b>${esc(M.nodes[FOC].gene)}</b> (${c.other ? 'a smaller cluster' : 'cluster ' + (c.rank + 1) + ': ' + esc(c.label)}).` +
          (UI.nb
            ? ` ${UI.nbWhy ? UI.nbWhy[0].toUpperCase() + UI.nbWhy.slice(1) + ', so' : 'So'} the network drawn is it and its ${int(M.nodes.length - 1)} ${plural(M.nodes.length - 1, 'partner', 'partners')}.`
            : UI.topWas
              ? ` ${UI.nbWhy ? UI.nbWhy[0].toUpperCase() + UI.nbWhy.slice(1) + ', so' : 'So'} the ${int(UI.top)} proteins with most ${esc(W.marks)} are drawn.`
              : '') +
          ` <button type="button" class="btn small" data-nw-fclear>Show the whole network</button>`
      );
    }
    if (sel0 && M.seeds) {
      const np = M.nodes.length - M.seedIdx.size;
      slot.push(
        `Your selection has ${int(M.seeds)} ${plural(M.seeds, 'protein', 'proteins')}: ${M.seeds === 1 ? 'it is' : 'they are'} drawn with ${M.seeds === 1 ? 'its' : 'their'} ${int(np)} ${plural(np, 'partner', 'partners')}.`
      );
    } else if (sel0 && M.picked != null && M.nodes.length)
      slot.push(
        `Your selection: ${int(M.picked)} of its proteins have a link in these sources; ${int(M.nodes.length)} are drawn.`
      );
    const fn = findNote(M);
    if (fn) slot.push(fn);
    // one slot above the figure for every note, so that the figure moves only when a note first appears
    const note = slot.length
      ? `<div class="filter-note nw-fnote nw-slot on" role="status">${slot.join('<br>')}</div>`
      : '<div class="nw-slot" role="status"></div>';
    const sum = summaryText(M, CL, sel0);
    const body = !M.nodes.length
      ? `<p class="muted">${sel0 ? 'No protein of the selection has a link in the chosen sources, so there is nothing to draw. Choose more sources or a lower score, or widen the selection.' : 'No protein has a link in the chosen sources.'}</p>`
      : UI.mode === 'table'
        ? `<p class="nw-count" role="status">${sum} ${topSelect()}</p>${tableHtml(M, CL)}`
        : `<div class="nw-main">${keyHtml(M, CL, { variant: phoneNow() ? 'phone' : 'desktop' }, sum)}<div class="nw-row2">${figureBox(M, CL)}${pinHtml(M, CL)}</div>${phoneNow() ? listHtml(CL) : ''}</div>`;
    const names = `<datalist id="nw-genes">${M.nodes.map((n) => `<option value="${esc(n.gene)}"></option>`).join('')}</datalist>`;
    return head + controls(CL) + note + body + names + K.fold('nw-how', 'Method', '', methodHtml(), false);
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
  // the credit strip, in a group that can be cropped: how to cite, the data, the site and its version, when exported
  function creditSvg(y0, Z, P, Wd, drawW) {
    let y = y0;
    const CIT = K.CIT || {},
      credit = [];
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
      K.wrap(ln, drawW / 1.18, Z.credit).forEach((t) => {
        y += Z.credit * 1.3;
        cg.push(`<text x="${P}" y="${y.toFixed(1)}" font-size="${Z.credit}" fill="${FX.muted}">${esc(t)}</text>`);
      })
    );
    return { svg: `<g id="credit">${cg.join('')}</g>`, y };
  }
  // the document that the shared Download menu and the page's buttons wrap: svg, size, title, description and metadata
  function finishDoc(parts, Wd, H, title, desc, paper) {
    const meta = JSON.stringify(
      K.provenance({
        figure: title,
        view: 'network',
        preset: UI.preset,
        min_score: UI.score / 1000,
        top: UI.top,
        clusters: UI.clusters || 'auto',
        pinned: UI.pins.join(','),
        selection: K.sel?.active() ? K.sel.describe() : '',
      })
    );
    const size = paper ? ` width="180mm" height="${((H * 180) / Wd).toFixed(1)}mm"` : ` width="${Wd}" height="${H}"`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 ${Wd} ${H}" font-family="${K.FF}">` +
      `<title>${esc(title)}</title><desc>${esc(desc)}</desc><metadata id="ptmcontext-provenance">${esc(meta)}</metadata>` +
      `<rect width="${Wd}" height="${H}" fill="#ffffff"/>${parts.join('')}</svg>`;
    return paper
      ? { svg, W: Wd, H, title, desc, meta, mm: 180, dpi: 300 }
      : { svg, W: Wd, H, title, desc, meta, dpi: 192 };
  }
  function wholeFrame() {
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
    if (sp && sp.kind === 'sequential')
      keyItem(
        5 * 11,
        RAMP.light.map((c, n) => `<rect x="${n * 11}" y="-5" width="10" height="10" fill="${c}"/>`).join(''),
        `${sp.name}: 0% to 100%`
      );
    else if (sp) keyItem(0, '', `${sp.name}: ${(NC.color_by.find((c) => c.id === sp.id)?.cats || []).join(' · ')}`);
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
    const cs = creditSvg(y + 8, Z, P, Wd, drawW);
    y = cs.y;
    parts.push(cs.svg);
    return finishDoc(parts, Wd, Math.ceil(y + P), title, `${title}. ${sub} ${cap}`.replace(/\s+/g, ' '), paper);
  }
  // the figure of what is pinned: the pinned proteins with their partners, cropped from the network, the cards as a panel
  // beside it (slide) or under it (paper), the clusters involved as a key, the caption and the credit
  function pinFrame(M, pinIdx) {
    const CL = clusters(M),
      Z = SIZES[UI.preset] || SIZES.screen,
      paper = UI.preset === 'paper',
      Wd = Z.W,
      P = Z.P,
      WSL = 1.18,
      view = viewOf(M),
      set = new Set(pinIdx),
      lit = lightPins(M, set),
      panelW = paper ? 0 : 270,
      gap = paper ? 0 : 14,
      Fw = Wd - 2 * P - panelW - gap,
      maxH = paper ? 360 : 560;
    const pos = K.netlayout.positions(view, 'desktop', UI.minc, maxShown());
    const radius = (i) => Math.min(9, 2.6 + 0.95 * Math.sqrt(M.nodes[i].sites));
    // the crop: the lit proteins with room for their names
    const cropOf = (L) => {
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      lit.nodes.forEach((i) => {
        const r = radius(i);
        x0 = Math.min(x0, L.pos[i][0] - r);
        x1 = Math.max(x1, L.pos[i][0] + r);
        y0 = Math.min(y0, L.pos[i][1] - r);
        y1 = Math.max(y1, L.pos[i][1] + r);
      });
      const pad = 30;
      return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
    };
    let L = K.netlayout.finish(view, pos, 'desktop'),
      crop = cropOf(L),
      s = 1;
    for (let n = 0; n < 4; n++) {
      s = Math.min(Fw / crop.w, maxH / crop.h, 2.6);
      L = K.netlayout.finish(view, pos, 'desktop', Math.max(Z.direct / s, Z.gene / s + 1.5), Z.gene / s);
      crop = cropOf(L);
    }
    s = Math.min(Fw / crop.w, maxH / crop.h, 2.6);
    const figW = Math.min(Fw, crop.w * s),
      figH = crop.h * s,
      fig = svgOf(M, CL, L, true, null, set, crop),
      parts = [],
      wrapW = (w, t, size, weight) => K.wrap(t, w / WSL, size, weight, K.FF),
      T = (x, y, t, size, o = {}) =>
        parts.push(
          `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}"${o.weight ? ` font-weight="${o.weight}"` : ''} fill="${o.fill || FX.ink}">${esc(t)}</text>`
        );
    const genes = pinIdx.map((i) => M.nodes[i].gene),
      partners = new Set();
    pinIdx.forEach((i) => M.adj[i].forEach(([j]) => partners.add(j)));
    pinIdx.forEach((i) => partners.delete(i));
    const title =
      (UI.claim || '').trim() ||
      (pinIdx.length === 1
        ? `${genes[0]} and its ${int(partners.size)} ${plural(partners.size, 'partner', 'partners')} in the ${W.mark} network`
        : `${genes.join(', ')}: partners in the ${W.mark} network`);
    let y = P;
    wrapW(Wd - 2 * P, title, Z.title, 'bold')
      .slice(0, 2)
      .forEach((l) => {
        y += Z.title * 1.15;
        T(P, y, l, Z.title, { weight: 'bold' });
      });
    const p = SRC.find((x) => x.kind === 'pairs'),
      g = SRC.filter((x) => x.kind === 'groups'),
      sub = `The pinned ${plural(pinIdx.length, 'protein', 'proteins')}, the proteins joined to ${pinIdx.length === 1 ? 'it' : 'them'} by ${p ? `${p.label} (score ${UI.score / 1000} or more)` : sourceNames()}${g.length ? ` or ${g.map((x) => x.label).join(' or ')}` : ''}, and the clusters they belong to; the area of a node follows its number of ${W.marks}.`;
    y += 4;
    wrapW(Wd - 2 * P, sub, Z.sub, 400).forEach((l) => {
      y += Z.sub * 1.3;
      T(P, y, l, Z.sub, { fill: FX.muted });
    });
    // the key: the clusters involved, in their colours, with how many of their proteins hold the term
    y += Z.key * 1.5;
    let kx = P;
    const kw = (l) => K.tw(l, Z.key) * WSL,
      clus = [...lit.clusters].filter((c) => CL.list[c]).sort((a, b) => CL.list[b].n - CL.list[a].n);
    const keyItem = (w, draw, label) => {
      if (kx > P && kx + w + 6 + kw(label) > Wd - P) {
        kx = P;
        y += Z.key * 1.6;
      }
      parts.push(`<g transform="translate(${kx.toFixed(1)},${(y - Z.key * 0.35).toFixed(1)})">${draw}</g>`);
      T(kx + w + 5, y, label, Z.key, { fill: FX.muted });
      kx += w + 5 + kw(label) + 16;
    };
    clus.forEach((c) => {
      const x = CL.list[c];
      keyItem(
        10,
        `<circle cx="5" cy="0" r="4.5" fill="${clusterFill(x, true)}"/>`,
        `${x.other ? 'Smaller cluster' : x.label} · ${x.l.q != null ? `${int(x.l.k)} of ${int(x.n)}` : int(x.n)} proteins`
      );
    });
    keyItem(
      22,
      `<line x1="3" x2="19" y1="0" y2="0" stroke="${EX.light.ink}" stroke-opacity="0.55" stroke-width="1"/>`,
      'Link of a pinned protein to another cluster'
    );
    y += 10;
    const bodyY = y,
      figX = P + (Fw - figW) / 2;
    parts.push(
      `<defs><clipPath id="nwclip"><rect x="${figX.toFixed(1)}" y="${bodyY.toFixed(1)}" width="${figW.toFixed(1)}" height="${figH.toFixed(1)}"/></clipPath></defs>` +
        `<g clip-path="url(#nwclip)"><g transform="translate(${(figX - crop.x * s).toFixed(2)},${(bodyY - crop.y * s).toFixed(2)}) scale(${s.toFixed(5)})">${fig.svg}</g></g>` +
        `<rect x="${figX.toFixed(1)}" y="${bodyY.toFixed(1)}" width="${figW.toFixed(1)}" height="${figH.toFixed(1)}" fill="none" stroke="${FX.line}"/>`
    );
    // the cards, as the page's panel says them (plain text, no hints)
    const cardsX = paper ? P : P + Fw + gap,
      cardW = paper ? Wd - 2 * P : panelW,
      compact = pinIdx.length > 2;
    let cy = paper ? bodyY + figH + 14 : bodyY;
    pinIdx.forEach((i) => {
      const lines = cardLines(M, CL, i),
        shown = compact
          ? lines.filter((l, k) => k < 3 || / of \d+ cluster proteins/.test(l.t || '')).slice(0, 4)
          : lines,
        slot = clusterFill(CL.list[M.nodes[i].c], true),
        top = cy;
      shown.forEach((l, k) => {
        const text = (l.b != null ? l.b : '') + (l.t || '') + (l.m ? '  ' + l.m : ''),
          size = k === 0 ? Z.cap + 1 : Z.cap;
        wrapW(cardW - 12, text, size, k === 0 ? 'bold' : 400).forEach((ln) => {
          cy += size * 1.32;
          T(cardsX + 10, cy, ln, size, { weight: k === 0 ? 700 : 0, fill: k === 0 ? FX.ink : FX.ink2 });
        });
      });
      parts.push(
        `<rect x="${cardsX.toFixed(1)}" y="${(top + 2).toFixed(1)}" width="3" height="${(cy - top).toFixed(1)}" fill="${slot}"/>`
      );
      cy += paper ? 8 : 12;
    });
    y = Math.max(bodyY + figH, cy) + 12;
    // the caption, the method in a sentence
    const lab = NC.labels[UI.label] || NC.labels[0] || {},
      cap = `${sourceNames()}${p ? `; scores of ${UI.score / 1000} or more` : ''}. Clusters are Louvain communities; each is named by the ${lab.label || 'annotation'} term of smallest q (hypergeometric test, Benjamini–Hochberg q ≤ ${OPT.max_q}), shortened on the figure.${lab.cite ? ' ' + lab.cite + '.' : ''}`;
    wrapW(Wd - 2 * P, cap, Z.cap, 400)
      .slice(0, 5)
      .forEach((l) => {
        y += Z.cap * 1.3;
        T(P, y, l, Z.cap, { fill: FX.ink2 });
      });
    const cs = creditSvg(y + 8, Z, P, Wd, Wd - 2 * P);
    parts.push(cs.svg);
    return finishDoc(parts, Wd, Math.ceil(cs.y + P), title, `${title}. ${sub} ${cap}`.replace(/\s+/g, ' '), paper);
  }
  // one function for every Download menu: the figure of the pinned proteins (opts.pinned: accessions, default the page's
  // pins), or of the whole network when nothing is pinned; opts.preset: 'screen' or 'paper'
  function exportFrame(opts = {}) {
    const M = model();
    if (M.wait || M.error) throw new Error('The network is not ready.');
    if (opts.preset) UI.preset = opts.preset;
    const accs = opts.pinned || UI.pins,
      idx = [...new Set(accs.map((a) => M.nodes.findIndex((n) => sameAcc(n.acc, a))).filter((i) => i >= 0))];
    return idx.length ? pinFrame(M, idx) : wholeFrame();
  }
  K.netcore.exportFrame = exportFrame;
  K.network = { exportFrame };
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
  // what the page shows at rest: the pins' neighbourhood (or a cluster) lit, a searched gene ringed
  const staticLit = (M) => (PIN.size ? lightPins(M, PIN) : UI.hi >= 0 ? lightCluster(M, UI.hi) : null);
  const staticDim = (M) => {
    const found = hit(M),
      lit = staticLit(M);
    return (i) => (lit && !lit.nodes.has(i)) || (found.size && !found.has(i));
  };
  function clearLight() {
    const svg = svgEl(),
      M = cache.M;
    if (!svg || !M || M.wait) return;
    const sd = staticDim(M),
      lit = staticLit(M);
    svg.querySelectorAll('.nw-n').forEach((a) => (a.style.opacity = sd(+a.dataset.nn) ? '0.18' : ''));
    svg
      .querySelectorAll('.nw-ie')
      .forEach((l) => (l.style.opacity = sd(+l.dataset.a) || sd(+l.dataset.b) ? '0.1' : ''));
    svg
      .querySelectorAll('.nw-hl')
      .forEach((p) => (p.style.opacity = lit && !lit.clusters.has(+p.dataset.nwc) ? '0.35' : ''));
    svg.querySelectorAll('.nw-bd').forEach((p) => (p.style.opacity = lit ? '0.15' : ''));
    svg
      .querySelectorAll('.nw-gl')
      .forEach((t) => (t.style.opacity = lit && !lit.nodes.has(+t.dataset.gi) ? '0.2' : ''));
    svg
      .querySelectorAll('.nw-cl')
      .forEach((g) => (g.style.opacity = lit && !lit.clusters.has(+g.dataset.nwc) ? '0.35' : ''));
    svg.querySelector('.nw-x').innerHTML = OVL.x;
    svg.querySelector('.nw-top').innerHTML = OVL.top;
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
    svg.querySelector('.nw-x').innerHTML =
      OVL.x +
      xs
        .map(
          ([a, b, fl]) =>
            `<line x1="${f1(L.pos[a][0])}" y1="${f1(L.pos[a][1])}" x2="${f1(L.pos[b][0])}" y2="${f1(L.pos[b][1])}" stroke="var(--ink)" stroke-opacity="${op}" stroke-width="${w}"${kind === 'n' && fl && !(fl & ~gbit) ? ' stroke-dasharray="3 2"' : ''}/>`
        )
        .join('');
    if (kind === 'n') {
      const rr = Math.min(9, 2.6 + 0.95 * Math.sqrt(M.nodes[id].sites)) * k,
        named = L.glabels.some((g) => g.i === id) || PIN.has(id);
      svg.querySelector('.nw-top').innerHTML =
        OVL.top +
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
  // one Tab stop for the figure; arrows move between proteins (left, right) and clusters (up, down); Enter acts (a protein is
  // pinned, a cluster lit), Escape clears and the focus stays where it was
  document.addEventListener('keydown', (e) => {
    if (S.view !== 'network') return;
    if (e.key === 'Escape' && !e.target.closest?.('input,textarea,select')) {
      clearLight();
      if (UI.pins.length || UI.hi >= 0 || UI.zc >= 0 || UI.fz) return unpinAll();
      return;
    }
    const fig = e.target.closest?.('.nw-fig');
    if (!fig) return;
    const nodes = [...fig.querySelectorAll('.nw-n')],
      cls = [...fig.querySelectorAll('.nw-cl')],
      curN = e.target.closest('.nw-n'),
      curC = e.target.closest('.nw-cl');
    if ((e.key === 'Enter' || e.key === ' ') && curC && !e.defaultPrevented) {
      e.preventDefault();
      UI.hi = UI.hi === +curC.dataset.nwc ? -1 : +curC.dataset.nwc;
      UI.refocus = `.nw-cl[data-nwc="${curC.dataset.nwc}"]`;
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
    K.writeHash(false);
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
      K.writeHash(false);
      return K.render();
    } else UI[k === 'score' ? 'score' : 'top'] = +t.value;
    if (k === 'top') UI.topWas = null;
    UI.hi = -1;
    UI.zc = -1;
    UI.fz = false;
    if (UI.colour !== 'cluster' || UI.label !== DEF.label || UI.clusters !== DEF.clusters) load('full');
    again();
  });
  document.addEventListener('input', (e) => {
    if (e.target.dataset?.nwClaim != null) UI.claim = e.target.value;
  });
  // genes to find: applied when the box loses focus, on Enter (a line break with Shift) and after a paste
  const applyFind = (el) => {
    if (el.value === UI.find) return;
    setFind(el.value);
    K.writeHash(true);
    K.render();
  };
  // a note about the genes will want its line: keep it ready from the moment the box takes focus, so the figure does not move
  document.addEventListener('focusin', (e) => {
    if (e.target.closest?.('[data-nw-find] textarea')) document.querySelector('.nw-slot:empty')?.classList.add('res');
  });
  document.addEventListener('focusout', (e) => e.target.closest?.('[data-nw-find] textarea') && applyFind(e.target));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.closest?.('[data-nw-find] textarea')) {
      e.preventDefault();
      applyFind(e.target);
    }
  });
  document.addEventListener('paste', (e) => {
    const el = e.target.closest?.('[data-nw-find] textarea');
    if (el) setTimeout(() => applyFind(el), 0);
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
  // the address keeps every setting of the figure, so that a link reproduces it: p= the pinned proteins (comma-separated),
  // nk= the number of clusters, nc= the colour, ns= the score, nt= the number of proteins, nx= the sources, nl= the name
  // source, nm= the smallest cluster, nv=table (and nf=, the genes to find, which the page keeps for the main search). Only
  // what differs from the site's defaults is written, and not while this page draws its own links.
  const PARAMS = ['nk', 'nc', 'ns', 'nt', 'nx', 'nl', 'nm', 'nv'];
  const accOk = (a) => /^[A-Z0-9][A-Z0-9-]{3,19}$/.test(a);
  K.paramsIn.push((p) => {
    if (S.view !== 'network') return;
    const pins = (p.get('p') || '').split(',').filter(accOk).slice(0, MAXPINS);
    if (pins.join() !== UI.pins.join()) {
      if (UI.topWas) UI.top = UI.topWas;
      Object.assign(UI, { nb: false, nbSet: null, topWas: null, nbWhy: '', fz: false, hi: -1 });
      cache = { key: '', M: null };
      UI.pins = pins;
      UI.fapply = pins.length === 1;
    }
    if (PARAMS.some((k) => p.has(k))) {
      const g = (k) => p.get(k),
        n = (k, d) => (p.has(k) && Number.isFinite(+g(k)) ? +g(k) : d),
        next = {
          clusters: p.has('nk') && +g('nk') >= CR[0] && +g('nk') <= CR[1] ? +g('nk') : DEF.clusters,
          colour: p.has('nc') && CB.some((c) => c.id === g('nc')) ? g('nc') : 'cluster',
          score: OPT.steps.includes(n('ns', -1)) ? n('ns', DEF.score) : DEF.score,
          top: n('nt', DEF.top) >= 20 && n('nt', DEF.top) <= 1000 ? n('nt', DEF.top) : DEF.top,
          src: p.has('nx')
            ? g('nx')
                .split(',')
                .map(Number)
                .filter((i) => i >= 0 && i < SRC.length)
            : DEF.src.slice(),
          label: n('nl', DEF.label) >= 0 && n('nl', DEF.label) < NC.labels.length ? n('nl', DEF.label) : DEF.label,
          minc: n('nm', DEF.minc) >= 2 ? n('nm', DEF.minc) : DEF.minc,
          mode: g('nv') === 'table' ? 'table' : 'network',
        };
      if (!next.src.length) next.src = DEF.src.slice();
      if (Object.keys(next).some((k) => JSON.stringify(next[k]) !== JSON.stringify(UI[k]))) {
        Object.assign(UI, next);
        cache = { key: '', M: null };
        if (UI.colour !== 'cluster' || UI.label !== DEF.label || UI.clusters !== DEF.clusters || UI.top !== DEF.top)
          load('full');
      }
    }
  });
  K.paramsOut.push((p) => {
    if (S.view !== 'network' || !K.nwWriting) return;
    if (UI.pins.length) p.set('p', UI.pins.join());
    if (UI.clusters !== DEF.clusters && UI.clusters) p.set('nk', UI.clusters);
    if (UI.colour !== 'cluster') p.set('nc', UI.colour);
    if (UI.score !== DEF.score) p.set('ns', UI.score);
    const top = UI.topWas ?? UI.top;
    if (top !== DEF.top) p.set('nt', top);
    if (UI.src.join() !== DEF.src.join()) p.set('nx', UI.src.join());
    if (UI.label !== DEF.label) p.set('nl', UI.label);
    if (UI.minc !== DEF.minc) p.set('nm', UI.minc);
    if (UI.mode === 'table') p.set('nv', 'table');
  });
  const writeHashOf = K.writeHash;
  K.writeHash = (push) => {
    K.nwWriting = true;
    try {
      return writeHashOf(push);
    } finally {
      K.nwWriting = false;
    }
  };
  // pin a protein (a click), or add it to the pins (Shift-click, up to five), or take it off; the address follows
  function setPins(next, push = true) {
    if (UI.topWas) UI.top = UI.topWas;
    Object.assign(UI, {
      pins: next.slice(0, MAXPINS),
      nb: false,
      nbSet: null,
      topWas: null,
      nbWhy: '',
      fz: false,
      hi: -1,
    });
    cache = { key: '', M: null };
    K.writeHash(push);
    K.render();
  }
  function unpinAll() {
    if (UI.topWas) UI.top = UI.topWas;
    Object.assign(UI, {
      pins: [],
      fz: false,
      fapply: false,
      hi: -1,
      zc: -1,
      topWas: null,
      nb: false,
      nbSet: null,
      nbWhy: '',
    });
    FOC = -1;
    PIN = new Set();
    cache = { key: '', M: null };
    K.writeHash(false);
    K.render();
  }
  // the drawing zoomed to the focused protein: a window of the figure centred on it, then the node takes focus
  function focusBox() {
    const svg = svgEl(),
      L = curL;
    if (!svg || !L || FOC < 0 || !L.pos[FOC]) return;
    const w = Math.max(L.w / 2.4, 220),
      h = (w * L.h) / L.w,
      c = L.pos[FOC],
      x = Math.max(0, Math.min(L.w - w, c[0] - w / 2)),
      y = Math.max(0, Math.min(L.h - h, c[1] - h / 2));
    svg.setAttribute('viewBox', [x, y, w, h].map((v) => +v.toFixed(1)).join(' '));
    if (UI.ffocus) {
      UI.ffocus = false;
      const a = svg.querySelector(`.nw-n[data-nn="${FOC}"]`);
      a?.focus({ preventScroll: true });
      if (a) {
        const b = a.getBoundingClientRect();
        scrollBy({ top: b.top + b.height / 2 - innerHeight / 2, behavior: K.smooth() });
      }
    }
  }
  (K.afterRender ||= []).push(() => {
    if (S.view !== 'network') return;
    if (UI.zc >= 0) applyZoom(false);
    else if (UI.fz && FOC >= 0) focusBox();
    if (UI.refocus) {
      document.querySelector(UI.refocus)?.focus({ preventScroll: true });
      UI.refocus = '';
    }
    K.writeHash(false); // the address says what the figure is, whichever way the page was reached
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
  // a protein's page: the link, and a small drawing of the protein in its cluster, made when it scrolls into view from the
  // default view's file (data/network.json, read once)
  // the proteins that have a link at the default score (one bit each, in the order of the protein list)
  const LINKED = (() => {
    try {
      const b = atob(NC.linked || '');
      return Uint8Array.from(b, (c) => c.charCodeAt(0));
    } catch (e) {
      return null;
    }
  })();
  const hasLinks = (p) => !LINKED || !LINKED.length || p.i == null || !!(LINKED[p.i >> 3] & (1 << (p.i & 7)));
  (K.protActions ||= []).push((p) => {
    if (NC.protein_link === false || !hasLinks(p)) return '';
    const href = esc(K.link('network', '', { p: p.acc }));
    return (
      `<a class="btn small" href="${href}" title="Open the network with ${esc(p.gene || p.acc)} shown, its cluster lit">See in network</a>` +
      (NC.protein_preview === false
        ? ''
        : `<span class="nw-prev" data-nw-prev="${esc(p.acc)}" data-href="${href}"></span>`)
    );
  });
  let viewP = null;
  const loadViewFile = () =>
    (viewP ||= fetch(NC.files.view)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => (FILE.view ||= j)));
  // the drawing: the protein, its partners in its cluster (15 at most, most sites first), the links among them, the cluster's
  // name beside it in its colour; the same drawing code as the figure, at a small size
  function previewHtml(j, acc, href) {
    const i = j.nodes.findIndex((n) => sameAcc(n, acc));
    if (i < 0)
      return `<span class="muted nw-prev-no">Not among the proteins drawn by default; the link opens the network with it and its partners.</span>`;
    const view = { gene: j.gene, sites: j.sites, comm: j.comm, edges: j.edges, labels: j.labels },
      c = j.comm[i],
      sl = K.netcore.previewSlice(view, i);
    const sub = {
      gene: sl.nodes.map((g) => j.gene[g]),
      sites: sl.nodes.map((g) => j.sites[g]),
      comm: sl.nodes.map(() => 0),
      edges: sl.edges,
      labels: [j.labels[c]],
    };
    const pos = K.netlayout.positions(sub, 'desktop', 1, 1);
    let L = K.netlayout.finish(sub, pos, 'desktop'),
      s = 1;
    for (let n = 0; n < 2; n++) {
      s = Math.min(2.4, 300 / L.w, 190 / L.h);
      L = K.netlayout.finish(sub, pos, 'desktop', 12.5 / s, 10.5 / s);
    }
    s = Math.min(2.4, 300 / L.w, 190 / L.h);
    L.clabels.forEach((l) => (l.count = `${sl.nodes.length} of ${j.labels[c].n} proteins`));
    const shown = j.labels
        .map((l, k) => k)
        .filter((k) => j.labels[k].n >= OPT.min_cluster)
        .slice(0, OPT.max_shown || NCOL),
      rank = shown.indexOf(c),
      term = j.labels[c].term,
      sn = K.netlayout.shortName(term);
    const MM = {
        nodes: sl.nodes.map((g) => ({ acc: j.nodes[g], gene: j.gene[g], sites: j.sites[g], c: 0, g: -1 })),
        edges: sl.edges,
        labels: [j.labels[c]],
      },
      CLm = {
        list: [
          {
            c: 0,
            n: j.labels[c].n,
            other: rank < 0,
            rank,
            slot: rank < 0 ? -1 : rank % NCOL,
            term,
            short: sn,
            l: j.labels[c],
            name: term || `Cluster ${c + 1}`,
            label: sn || `Cluster ${c + 1}`,
          },
        ],
        shown: [0],
      };
    const svg = svgOf(MM, CLm, L, false, { focus: 0 }).svg;
    return (
      `<a class="nw-prev-a" href="${href}" aria-label="${esc(j.gene[i])} among ${int(j.labels[c].n)} proteins of its cluster${term ? ', ' + esc(term) : ''}; open the network">` +
      `<svg class="nw-prev-svg" width="${Math.round(L.w * s)}" height="${Math.round(L.h * s)}" viewBox="0 0 ${L.w} ${L.h}" role="img" aria-hidden="true">${svg}</svg></a>` +
      `<span class="nw-prev-cap muted">${esc(j.gene[i])} with ${int(sl.nodes.length - 1)} of its ${int(sl.partners)} partners in its cluster</span>`
    );
  }
  (K.afterRender ||= []).push(() => {
    const els = [...document.querySelectorAll('.nw-prev:not([data-done])')];
    if (!els.length) return;
    const fill = (el) => {
      if (el.dataset.done) return;
      el.dataset.done = '1';
      loadViewFile().then(
        (j) => {
          if (el.isConnected) el.innerHTML = previewHtml(j, el.dataset.nwPrev, el.dataset.href);
        },
        () => {}
      );
    };
    if (!('IntersectionObserver' in window)) return els.forEach(fill);
    const io = new IntersectionObserver(
      (ents) =>
        ents.forEach((en) => {
          if (en.isIntersecting) {
            io.unobserve(en.target);
            fill(en.target);
          }
        }),
      { rootMargin: '200px' }
    );
    els.forEach((el) => io.observe(el));
  });
  K.clicks.push(
    [
      '[data-nw-mksel]',
      () => {
        const g = findIn(UI.find, cache.M?.nodes || []);
        setFind('');
        S.q = g.tokens.join(' ');
        K.writeHash(true);
        K.render();
      },
    ],
    [
      '[data-nw-findclear]',
      () => {
        setFind('');
        K.writeHash(true);
        K.render();
      },
    ],
    ['[data-nw-fclear],[data-nw-topback],[data-nw-unpinall]', () => unpinAll()],
    [
      '[data-nw-unpin]',
      (el) =>
        setPins(
          UI.pins.filter((a) => !sameAcc(a, el.dataset.nwUnpin)),
          false
        ),
    ],
    [
      '[data-nw-score]',
      (el) => {
        UI.score = +el.dataset.nwScore;
        UI.fz = false;
        again();
      },
    ],
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
        if (el.closest('.nw-cl')) UI.refocus = `.nw-cl[data-nwc="${c}"]`;
        K.render();
      },
    ],
    [
      '[data-nw-view]',
      (el) => {
        UI.mode = el.dataset.nwView;
        K.writeHash(false);
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
        Object.assign(UI, {
          ...DEF,
          src: DEF.src.slice(),
          hi: -1,
          zoom: 1,
          pins: [],
          fz: false,
          zc: -1,
          topWas: null,
          nb: false,
          nbSet: null,
          mode: 'network',
        });
        setFind('');
        K.writeHash(false);
        again();
      },
    ],
    [
      '.nw-n',
      (el, e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.button) return; // the browser's own: a new tab
        const M = cache.M;
        if (!M || M.wait) return;
        const i = +el.dataset.nn,
          acc = M.nodes[i].acc,
          at = UI.pins.findIndex((a) => sameAcc(a, acc));
        if (e.shiftKey) {
          e.preventDefault();
          UI.refocus = `.nw-n[data-nn="${i}"]`;
          return setPins(at >= 0 ? UI.pins.filter((a) => !sameAcc(a, acc)) : [...UI.pins, acc]);
        }
        if (at >= 0) return; // a second click on a pinned protein opens its page
        e.preventDefault();
        UI.refocus = `.nw-n[data-nn="${i}"]`;
        setPins([acc]);
      },
    ],
    [
      '[data-nwexp]',
      (btn) =>
        K.exportFigure(
          btn.dataset.nwexp,
          exportFrame,
          `${D.site.id}_network${UI.pins.length ? '_pinned' : K.sel?.active() ? '_selection' : ''}${UI.preset === 'paper' ? '_paper' : ''}`,
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
    ['nw-how', 'Method', 1],
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
