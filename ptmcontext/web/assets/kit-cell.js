/* Where in the cell: several maps of the cell as one question (website.cell). Each map is a protein-set question of
   the site whose sets are compartments (and, optionally, another whose sets are the same map's regions); the site file
   says which compartment of which map is which row of the grids and which part of the kit's drawings it colors.
   The tile: each region's odds ratio, the median of the maps, within abundance deciles where the maps were tested so,
   and the parts where "most of all". The page: the regions against the maps, the cell and the nucleus drawn and
   colored by the median of the maps that have each part, the compartments against the maps, and one map at a time;
   a part, a label or a grid row opens its numbers, the marked proteins placed there, "Select these proteins" and a
   TSV. A selection is tested again in the browser, map by map, as the site's rows were (Mantel–Haenszel over the
   strata of each map's background, from selection.json). Words, maps, rows and parts come from the site file; the
   drawings' geometry is the kit's (config/cell_drawings.json lists their parts). A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  const C = D.cell;
  if (!C || !(C.maps || []).some((m) => A[m.analysis])) return;
  const ST = window.PTMC_STATS,
    PADJ = K.PADJ,
    MINL2 = Math.log2(K.MIN_EFFECT);
  const ID = C.id;
  const MAPS = C.maps.filter((m) => A[m.analysis]);
  const REGMAPS = MAPS.filter((m) => m.regions && A[m.regions]);
  const MAP = {}; // analysis -> its map (a regions question takes its map's words)
  MAPS.forEach((m) => {
    MAP[m.analysis] = m;
    if (m.regions && A[m.regions]) MAP[m.regions] = m;
  });
  const PARTS = D.cell_drawings || {};
  const DRAWINGS = (C.drawings || []).filter((d) => PARTS[d.drawing]);
  // ---- the percent view: the share of a part's proteins that carry at least one mark, counted when the site was built
  // (D.cell_pct: for each map the proteins it places and, for each set a row names, its proteins and the marked ones). The
  // site's default is website.cell.default_view; the switch on every map of the cell changes it for the page.
  const PCTD = D.cell_pct || {};
  const HAS_PCT = MAPS.some((m) => PCTD[m.analysis]);
  // three views: percent (the share), diff (the share's difference from the share among all the proteins the maps place,
  // in points, on a diverging ramp) and fold; the first two draw from the counts
  let VIEW = !HAS_PCT
    ? 'fold'
    : C.default_view === 'percent'
      ? 'percent'
      : C.default_view === 'difference'
        ? 'diff'
        : 'fold';
  const pctOn = () => VIEW !== 'fold';
  const pv = () => (VIEW === 'diff' ? 'diff' : 'percent');
  const isPv = (p) => p.view === 'percent' || p.view === 'diff';
  // a difference in points: +4 points, −7 points
  const ptsText = (d) => {
    const a = Math.abs(100 * d),
      s = a < 0.05 ? '0' : a < 10 ? String(+a.toFixed(1)) : String(Math.round(a));
    return (d > 0 && s !== '0' ? '+' : d < 0 && s !== '0' ? '−' : '') + s + (s === '1' ? ' point' : ' points');
  };
  // its step on the diverging ramp (the fold's reds and slates): quarters of the largest difference; none under half a point
  const diffStep = (d, mx) => {
    const a = Math.abs(d);
    if (!(mx > 0) || a < Math.min(0.005, mx / 20)) return 'ns';
    return (d > 0 ? 'm' : 'f') + Math.min(3, Math.floor((4 * a) / mx));
  };
  // its ramp is the figure style's sequential one (--fig-seq-1 to 5), and the text on each step
  const SEQ = {
    light: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
    dark: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'],
    on: {
      light: ['#111827', '#111827', '#ffffff', '#ffffff', '#ffffff'],
      dark: ['#f1f5f7', '#f1f5f7', '#111827', '#111827', '#111827'],
    },
  };
  const seqVars = (m) =>
    SEQ[m].map((v, i) => `--fig-seq-${i + 1}:${v};--fig-seq-on-${i + 1}:${SEQ.on[m][i]};`).join('');
  const medOf = (xs) => {
    const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y),
      h = v.length / 2;
    return v.length ? (v.length % 2 ? v[Math.floor(h)] : (v[h - 1] + v[h]) / 2) : null;
  };
  // a share as a percent: whole numbers, one decimal under 10%, never 100% unless every protein has one
  const pctText = (s) =>
    s == null
      ? '–'
      : s === 0
        ? '0%'
        : s < 0.001
          ? '<0.1%'
          : s < 0.1
            ? +(100 * s).toFixed(1) + '%'
            : Math.round(100 * s) >= 100 && s < 1
              ? '>99%'
              : Math.round(100 * s) + '%';
  // a share's step of the ramp: fifths of the scale {lo, hi}
  const pctBin = (s, sc) =>
    s == null || !(sc.hi > sc.lo) ? 0 : Math.max(0, Math.min(4, Math.floor((5 * (s - sc.lo)) / (sc.hi - sc.lo))));
  // the tones of a comparison, light and dark (the explorer's): more likely (up-0 to up-3), less likely, no difference
  const TONES = {
    light: [
      ['up-0', '#F6D0CD'],
      ['up-1', '#EF9A94'],
      ['up-2', '#E34948'],
      ['up-3', '#A8302F'],
      ['down-0', '#E6ECEF'],
      ['down-1', '#BAC8CF'],
      ['down-2', '#91A5B1'],
      ['down-3', '#6A808D'],
      ['mid', '#F0EFEC'],
    ],
    dark: [
      ['up-0', '#5A2523'],
      ['up-1', '#8E3330'],
      ['up-2', '#D2524F'],
      ['up-3', '#F09A95'],
      ['down-0', '#26343B'],
      ['down-1', '#3D5260'],
      ['down-2', '#6C8592'],
      ['down-3', '#A9BDC7'],
      ['mid', '#1A2D35'],
    ],
  };
  const CSS = [
    '.cell-page .cell-lead{font-size:1.02rem;margin:0 0 .4rem}',
    '.cell-block{margin-top:1rem;max-width:1040px}.cell-block ' +
      '.fig-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem;margin:0 0 .3rem}',
    '.cell-block .flabel{font-weight:700;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}',
    '.cell-scroll{overflow-x:auto}.cell-svg{width:100%;height:auto;display:block}.cell-cell svg,.cell-svg.cell-cell,.cell-svg.cell-nucleus{min-width:640px}',
    '.cell-svg.cell-regions{max-width:520px}.cell-svg.cell-grid{max-width:840px}.cell-svg.cell-bars{max-width:760px;min-width:560px}',
    '.cell-one .seg{flex-wrap:wrap}',
    '.cg-c.u0{fill:var(--t-up-0)}.cg-c.u1{fill:var(--t-up-1)}.cg-c.u2{fill:var(--t-up-2)}.cg-c.u3{fill:var(--t-up-3)}',
    '.cg-c.d0{fill:var(--t-down-0)}.cg-c.d1{fill:var(--t-down-1)}.cg-c.d2{fill:var(--t-down-2)}.cg-c.d3{fill:var(--t-down-3)}',
    '.cg-c.ns{fill:var(--t-mid)}.cg-c.na{fill:none;stroke:var(--line-strong);stroke-dasharray:2 3}',
    '.cg-c.sel{fill:var(--surface);stroke:var(--ink);stroke-opacity:1;stroke-width:4;stroke-linejoin:round}.cg-line.sel{stroke:var(--ink)}',
    '.cg-k.sel{background:var(--surface);border:3px solid var(--ink)}.cp-row .sel-pill{margin-left:auto}.kd.sel{background:var(--surface);border:2.4px solid var(--ink);box-sizing:border-box}',
    '.cg-line.u0{stroke:var(--t-up-0)}.cg-line.u1{stroke:var(--t-up-1)}.cg-line.u2{stroke:var(--t-up-2)}.cg-line.u3{stroke:var(--t-up-3)}',
    '.cg-line.d0{stroke:var(--t-down-0)}.cg-line.d1{stroke:var(--t-down-1)}.cg-line.d2{stroke:var(--t-down-2)}.cg-line.d3{stroke:var(--t-down-3)}.cg-line.ns,.cg-line.na{stroke:var(--line-strong)}',
    '.cg-t{font-size:11px;fill:var(--ink)}.cg-t.t2,.cg-t.t3{fill:#fff}:root[data-theme="dark"] .cg-t.t3{fill:#111827}',
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .cg-t.t3{fill:#111827}}',
    '.cg-m{font-size:10.5px;fill:var(--muted)}.cg-h{font-size:11px;font-weight:700;fill:var(--ink)}.cg-g{font-size:11px;font-weight:700;fill:var(--muted);letter-spacing:.04em}.cg-r{font-size:12px;fill:var(--ink)}',
    '.cd-o{stroke:var(--ink);stroke-opacity:.3;stroke-width:.9}.cd-in{fill:none;stroke:var(--ink);stroke-opacity:.38;stroke-width:1.1}.cd-gap{fill:none;stroke:var(--surface)}',
    '.cd-shade{fill:var(--ink);fill-opacity:.1}.cd-ink{fill:var(--ink);fill-opacity:.55}.cd-lead{fill:none;stroke:var(--ink);stroke-opacity:.55;stroke-width:1}',
    '.cd-dot{fill:var(--ink);stroke:var(--surface);stroke-width:1.5}.cd-name{font-size:14px;font-weight:700;fill:var(--ink)}.cd-val{font-size:13px;fill:var(--ink)}.cd-val tspan.m{fill:var(--muted)}',
    '.cd-hit,.cg-hit{fill:transparent}svg [data-cell-part],svg [data-cell-zpart],svg ' +
      '[data-cell-row],svg [data-cell-bar]{cursor:pointer}',
    'svg [data-cell-part]:focus-visible,svg [data-cell-row]:focus-visible,svg ' +
      '[data-cell-bar]:focus-visible{outline:2px solid ' +
      'var(--accent);outline-offset:2px}',
    'svg [data-cell-tip]:hover .cd-lead,svg [data-cell-part].on ' +
      '.cd-lead{stroke-opacity:1;stroke-width:1.8}svg [data-cell-part].on ' +
      '.cd-name{text-decoration:underline}',
    'svg .cg-row:hover .cg-hit,svg .cg-row.on .cg-hit,svg .cb-row:hover .cg-hit{fill:var(--accent);fill-opacity:.08}',
    '.cb-grid{stroke:var(--line-strong);stroke-dasharray:2 ' +
      '3}.cb-one{stroke:var(--ink-2)}.cb-bar.more{fill:var(--more)}.cb-bar.less{fill:var(--less)}.cb-bar.ns{fill:var(--muted)}',
    '.cb-bar.hollow{fill:var(--surface);stroke:var(--muted);stroke-width:1}.cb-val{font-size:11.5px;font-weight:700;fill:var(--ink)}.cb-val.more{fill:var(--more)}.cb-val.less{fill:var(--less)}.cb-val.ns{fill:var(--muted)}',
    '.cell-keys{display:flex;flex-wrap:wrap;gap:.3rem ' +
      '1rem;font-size:.82rem;color:var(--muted)}.cell-key{display:inline-flex;align-items:center;gap:.25rem}',
    '.cell-key i.cg-k{width:14px;height:10px;border-radius:2px;display:inline-block}.cg-k.na{background:none;border:1px dashed var(--line-strong)}',
    '.cg-k.u3{background:var(--t-up-3)}.cg-k.u1{background:var(--t-up-1)}.cg-k.ns{background:var(--t-mid);border:1px solid var(--line)}.cg-k.d1{background:var(--t-down-1)}.cg-k.d3{background:var(--t-down-3)}',
    '.cell-detail{border:1px solid var(--line);border-left:4px solid ' +
      'var(--accent);border-radius:8px;padding:.75rem 1rem;margin:.75rem ' +
      '0;background:var(--surface);max-width:1040px}',
    '.cell-detail-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}.cell-detail-head h4{margin:0;font-size:1.05rem}',
    '.cell-detail-tbl th{font-weight:600}.cell-detail ' +
      '.tbl-wrap{overflow-x:auto}.cell-members ' +
      '.fig-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.5rem;margin-top:.6rem}',
    '.cell-chips{display:flex;flex-wrap:wrap;gap:.3rem;margin:.4rem ' +
      '0}.cell-chip{display:inline-block;padding:.1rem .45rem;border:1px solid ' +
      'var(--line);border-radius:999px;font-size:.82rem;text-decoration:none;color:var(--ink)}',
    '.cell-chip:hover{border-color:var(--accent);color:var(--accent)}.cell-chip ' +
      'sup{color:var(--muted);margin-left:1px}',
    '.cell-onep .cd-name{font-size:18px}.cell-onep ' +
      '.cd-val{font-size:15.5px}.cell-zoom-btn{margin:.2rem 0}.cell-draw ' +
      'svg{overflow:visible}.cell-draw svg,.cell-block .cell-scroll ' +
      'svg{cursor:zoom-in}.cell-draw svg [data-cell-part],.cell-block svg ' +
      '[data-cell-part]{cursor:pointer}',
    'dialog.cz{width:min(97vw,1500px);height:94vh;max-width:none;max-height:none;padding:.6rem .8rem;border:1px solid var(--line-strong);border-radius:10px;background:var(--surface);color:var(--ink);overflow:hidden}',
    'dialog.cz[open]{display:flex;flex-direction:column}dialog.cz::backdrop{background:rgba(15,23,32,.55)}',
    '.cz-bar{display:flex;justify-content:space-between;align-items:center;gap:.6rem;flex:0 0 auto}.cz-btns{display:flex;gap:.3rem}',
    '.cz-body{display:flex;gap:.8rem;flex:1 1 auto;min-height:0;margin:.4rem ' +
      '0}.cz-stage{flex:1 1 auto;min-width:0;overflow:hidden;border:1px solid ' +
      'var(--line);border-radius:8px;cursor:grab}',
    '.cz-stage .cell-svg{cursor:grab}.cz-list{flex:0 0 ' +
      '17rem;overflow:auto;border:1px solid ' +
      'var(--line);border-radius:8px;padding:.5rem ' +
      '.7rem}.cz-list[hidden]{display:none}.cz-list h4{margin:.1rem 0}',
    '.cz-ul{list-style:none;margin:.3rem 0;padding:0}.cz-ul li{padding:.15rem ' +
      '0;border-top:1px solid var(--line)}.cz-ul li.hl ' +
      'a{font-weight:700}.cz-hint{margin:0}',
    '@media (max-width:700px){.cz-body{flex-direction:column;overflow:auto}.cz-stage{flex:0 0 auto;width:100%;height:auto;aspect-ratio:var(--cz-ar,2/1)}.cz-list{flex:1 1 auto;min-height:6rem}',
    '.cz-legend{flex:0 0 auto;list-style:none;margin:.4rem 0 0;padding:0}.cz-legend ' +
      'li{margin:0}.cz-row{display:grid;grid-template-columns:2rem ' +
      'minmax(0,1fr);gap:.2rem ' +
      '.6rem;align-items:center;width:100%;min-height:44px;padding:.2rem ' +
      '.4rem;border:0;border-top:1px solid ' +
      'var(--line);background:none;color:var(--ink);font:inherit;font-size:.92rem;text-align:left;cursor:pointer}.cz-row.on{background:color-mix(in srgb,var(--accent) 12%,var(--surface))}',
    '.cz-n{display:inline-flex;align-items:center;justify-content:center;width:1.7rem;height:1.7rem;border-radius:50%;background:var(--ink);color:var(--surface);font-size:.8rem;font-weight:700}.cz-rv{grid-column:2;margin-top:-.2rem;color:var(--muted);font-size:.84rem}',
    '.cz-mk{cursor:pointer}.cz-mk ' +
      'circle{r:var(--cz-mr,10px);fill:var(--ink);stroke:var(--surface);stroke-width:var(--cz-ms,1.5px)}.cz-mk text{font:700 var(--cz-mf,12px) sans-serif;fill:var(--surface);text-anchor:middle;dominant-baseline:central;pointer-events:none}',
    'dialog.cz .cz-btns .btn{min-width:44px;min-height:44px}dialog.cz svg ' +
      '.cd-name{font-size:var(--cz-fn,14px)}dialog.cz svg ' +
      '.cd-val{font-size:var(--cz-fv,13px)}}',
    '.cell-page .small,.vm-page .small{font-size:.86rem}.cell-page ' +
      '.btn.small{padding:.15rem .55rem;font-size:.78rem}.cell-page ' +
      '.btn.quiet{border-color:var(--line-strong);color:var(--ink-2)}',
    '.cell-thead{font-size:.75rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-top:.3rem}',
    '.cg-c.p0{fill:var(--fig-seq-1)}.cg-c.p1{fill:var(--fig-seq-2)}.cg-c.p2{fill:var(--fig-seq-3)}.cg-c.p3{fill:var(--fig-seq-4)}.cg-c.p4{fill:var(--fig-seq-5)}',
    '.cg-line.p0{stroke:var(--fig-seq-1)}.cg-line.p1{stroke:var(--fig-seq-2)}.cg-line.p2{stroke:var(--fig-seq-3)}.cg-line.p3{stroke:var(--fig-seq-4)}.cg-line.p4{stroke:var(--fig-seq-5)}',
    '.cg-t.q0{fill:var(--fig-seq-on-1)}.cg-t.q1{fill:var(--fig-seq-on-2)}.cg-t.q2{fill:var(--fig-seq-on-3)}.cg-t.q3{fill:var(--fig-seq-on-4)}.cg-t.q4{fill:var(--fig-seq-on-5)}',
    '.cg-c.m0{fill:var(--t-up-0)}.cg-c.m1{fill:var(--t-up-1)}.cg-c.m2{fill:var(--t-up-2)}.cg-c.m3{fill:var(--t-up-3)}',
    '.cg-c.f0{fill:var(--t-down-0)}.cg-c.f1{fill:var(--t-down-1)}.cg-c.f2{fill:var(--t-down-2)}.cg-c.f3{fill:var(--t-down-3)}',
    '.cg-line.m0{stroke:var(--t-up-0)}.cg-line.m1{stroke:var(--t-up-1)}.cg-line.m2{stroke:var(--t-up-2)}.cg-line.m3{stroke:var(--t-up-3)}',
    '.cg-line.f0{stroke:var(--t-down-0)}.cg-line.f1{stroke:var(--t-down-1)}.cg-line.f2{stroke:var(--t-down-2)}.cg-line.f3{stroke:var(--t-down-3)}',
    '.kd.m0{background:var(--t-up-0)}.kd.m1{background:var(--t-up-1)}.kd.m2{background:var(--t-up-2)}.kd.m3{background:var(--t-up-3)}',
    '.kd.f0{background:var(--t-down-0)}.kd.f1{background:var(--t-down-1)}.kd.f2{background:var(--t-down-2)}.kd.f3{background:var(--t-down-3)}.kd.ns{background:var(--t-mid)}',
    '.pk-bar .m0{background:var(--t-up-0)}.pk-bar .m1{background:var(--t-up-1)}.pk-bar .m2{background:var(--t-up-2)}.pk-bar .m3{background:var(--t-up-3)}',
    '.pk-bar .f0{background:var(--t-down-0)}.pk-bar .f1{background:var(--t-down-1)}.pk-bar .f2{background:var(--t-down-2)}.pk-bar .f3{background:var(--t-down-3)}.pk-bar .ns{background:var(--t-mid)}',
    '.kd.p0{background:var(--fig-seq-1)}.kd.p1{background:var(--fig-seq-2)}.kd.p2{background:var(--fig-seq-3)}.kd.p3{background:var(--fig-seq-4)}.kd.p4{background:var(--fig-seq-5)}',
    '.cell-viewbar{margin:.3rem 0 .5rem}.cell-view button{white-space:normal}.cz-bar .cell-view{margin:0 .5rem}',
    '.pct-key{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .6rem;font-size:.82rem;color:var(--muted)}',
    '.pk-bar{position:relative;display:inline-flex;width:160px;height:12px;border:1px solid var(--line-strong);border-radius:2px}.pk-bar i{flex:1 1 0;height:100%;margin:0;padding:0;border:0}.pct-key .pk-bar{gap:0}',
    '.pk-bar .p0{background:var(--fig-seq-1)}.pk-bar .p1{background:var(--fig-seq-2)}.pk-bar .p2{background:var(--fig-seq-3)}.pk-bar .p3{background:var(--fig-seq-4)}.pk-bar .p4{background:var(--fig-seq-5)}',
    '.pk-brk{width:9px;height:14px;margin:0 -.35rem 0 -.3rem;fill:none;stroke:var(--ink-2);stroke-width:1.4}',
    '.pk-ref{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--ink)}',
    '.pk-tick{display:inline-block;width:2px;height:12px;background:var(--ink);margin-right:.3rem}',
    '@media (max-width:700px){.cell-view button{padding:.3rem .55rem}}',
  ].join('');

  // ---- the site's rows of each map: the enricher row (counts, fold, q) and its repeat within the strata ----------------
  const L2 = (v) => (v == null ? null : v >= 1e300 ? Infinity : v <= 0 ? -Infinity : Math.log2(v));
  const T = {};
  D.rows.forEach((r) => {
    if (!MAP[r.analysis]) return;
    const t = ((T[r.analysis] ||= {})[r.category] ||= { cat: r.category });
    if (r.method === 'enricher')
      Object.assign(t, { k: r.a, n: r.a + r.b, M: r.a + r.c, N: r.a + r.b + r.c + r.d, fold: r.fold, fq: r.q });
    else if (r.method === 'mantel_haenszel')
      Object.assign(t, { or: r.or, lo: r.lo, hi: r.hi, q: r.q, strata: r.strata });
  });
  const stratified = (aid) => !!A[aid]?.stratified;
  const allStrat = MAPS.every((m) => stratified(m.analysis));
  // website.reading: a part is colored and ranked only when at least min_maps maps agree on it, each comparing groups of
  // at least min_group proteins (the part's marked proteins, and its other proteins)
  const READ = K.READ || { min_maps: 2, min_group: 20 };
  const smallOf = (k, M) => k < READ.min_group || M - k < READ.min_group;
  // the comparison a map's row makes: the fold (the share of the marked proteins placed here over the share of all the
  // proteins the map places), read by the map's test: within the strata (Mantel–Haenszel; its odds ratio beside) or of
  // the whole map (hypergeometric)
  const adj = (aid, t) =>
    stratified(aid) && t.or !== undefined
      ? {
          l2: L2(t.fold),
          lo: null,
          hi: null,
          q: t.q,
          test: { l2: L2(t.or), lo: t.lo ? Math.log2(t.lo) : null, hi: t.hi ? Math.log2(t.hi) : null },
          small: smallOf(t.k, t.M),
        }
      : { l2: L2(t.fold), lo: null, hi: null, q: t.fq, small: smallOf(t.k, t.M) };
  // each map, as the grids and the footnote name it: its words, and how many proteins it places and how many are marked
  const DS = (aid) => {
    const m = MAP[aid] || {},
      any = Object.values(T[aid] || {}).find((t) => t.N != null);
    return {
      ...m,
      name: m.name || A[aid]?.title || aid,
      short: m.short || m.name || aid,
      universe: any ? any.N : null,
      marked: any ? any.n : null,
    };
  };
  const label = (aid, cat) => (A[aid]?.labels || {})[cat] || String(cat).replace(/_/g, ' ');

  // ---- words --------------------------------------------------------------------------------------------------------
  const who = (scoped) => (scoped ? 'proteins of your selection' : `${W.marked} proteins`);
  const inWord = (scoped) => (scoped ? 'are in your selection' : `are ${W.marked}`);
  const alike = allStrat ? 'other proteins of similar abundance' : 'the other proteins each map places';
  const others = `proteins without a ${W.mark}`;
  const here = 'proteins the map places here';
  const fxv = (v) => (v == null ? '–' : K.fxn(v));
  const orText = (a) => (a.l2 == null ? '–' : a.l2 === Infinity ? '∞' : a.l2 === -Infinity ? '0×' : K.fx(2 ** a.l2));
  const orWords = (a) =>
    a.l2 == null
      ? ''
      : a.l2 === Infinity
        ? 'found only here'
        : a.l2 === -Infinity
          ? 'never found here'
          : 'fold ' + fxv(2 ** a.l2);
  const fq = K.fq;
  const toneOf = (k) => (TONES.light.find((x) => x[0] === k) || [])[1];
  const and = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '');
  const rowName = (row) => row.name || row.label;
  // a name inside a sentence: the site's in_text, else lower case unless it starts with an abbreviation (ER, P-bodies)
  const inText = (row) =>
    row.in_text ||
    (/^[A-Z][A-Z-]/.test(rowName(row)) ? rowName(row) : rowName(row).charAt(0).toLowerCase() + rowName(row).slice(1));
  const pc = (k, n) => (n ? ((100 * k) / n).toFixed(k / n < 0.1 ? 1 : 0) : '–');

  // ---- color of a comparison: u0-u3 / d0-d3 by size where q <= 0.05 and at least 1.1x, else ns; na where none ---------
  function tone(a) {
    if (!a || a.l2 == null) return 'na';
    if (a.q == null || a.q > PADJ || (Number.isFinite(a.l2) && Math.abs(a.l2) < MINL2)) return 'ns';
    // too few proteins on a side, or a test that points the other way from the fold: not colored
    if (a.small || (a.test && a.test.l2 != null && Math.sign(a.test.l2) !== Math.sign(a.l2))) return 'ns';
    const m = Math.abs(a.l2),
      s = m >= 2 ? 3 : m >= 1.2 ? 2 : m >= 0.5 ? 1 : 0;
    return (a.l2 > 0 ? 'u' : 'd') + s;
  }
  const dirOf = (tn) => (tn[0] === 'u' ? 'more' : tn[0] === 'd' ? 'less' : 'ns');

  // ---- a selection, tested again map by map: its proteins the map places against the map's other proteins, each
  // stratum of the covariate a table (Mantel–Haenszel, BH over the map's sets), from the counts of selection.json; a
  // map without strata, by the hypergeometric test. Not compared: a selection made with the map (or one reading the
  // same data), one that names its proteins, or a set holding every selected protein.
  // w:<cell id> (a part of the drawings chosen as a filter, by its key): the marks of proteins that a map places in the part,
  // any map counting. A selection made with a part is not compared against the maps that place it.
  const partRows = (part) => {
    for (const L of [LAYERS.part, LAYERS.region])
      for (const [, rows] of L.groups) {
        const row = rows.find((r) => r.part === part);
        if (row) return { L, row };
      }
    return null;
  };
  const partPairs = (part) => {
    const x = partRows(part);
    return x ? x.L.cols.filter((aid) => x.row.map[aid]).map((aid) => [aid, x.row.map[aid]]) : [];
  };
  const partName = (part) => {
    const x = partRows(part);
    return x ? D.front?.row_labels?.[ID]?.[part] || rowName(x.row) : part;
  };
  const scopedNow = () => K.selOn() && !K.vsOn() && !!K.sel.data() && K.sel.testable();
  let memo = { c: null, maps: {} };
  function selTests(aid) {
    const SD = K.sel.data(),
      ps = SD?.protein_sets?.[aid];
    if (!ps) return null;
    const c = K.sel.compute();
    if (memo.c !== c) memo = { c, maps: {} };
    if (memo.maps[aid]) return memo.maps[aid];
    const inBg = new Set(ps.in_background),
      sel = [...(c.proteins || [])].filter((p) => inBg.has(p)),
      n = sel.length,
      on = new Set(sel);
    const held = K.sel.ownSets(aid),
      blocked = held.all || K.sel.namesProteins();
    const cv = ps.covariate,
      counts = cv?.counts,
      res = new Map(),
      tested = [];
    const at = counts ? Object.fromEntries(counts.codes.map((x, i) => [x, i])) : null;
    const nS = counts ? counts.codes.map(() => 0) : null;
    if (counts)
      sel.forEach((p) => {
        const x = cv.proteins[p];
        if (x) nS[at[x[1]]]++;
      });
    for (const [s, M, members] of ps.sets) {
      let k = 0;
      const kS = counts ? counts.codes.map(() => 0) : null;
      members.forEach((p) => {
        if (on.has(p)) {
          k++;
          if (counts) kS[at[cv.proteins[p][1]]]++;
        }
      });
      const selected = held.sets.has(s),
        circular = !!n && (blocked || k === n || selected);
      const x = { k, M, n, N: ps.N, circular, selected, a: { l2: null, lo: null, hi: null, q: null } };
      if (n && !circular) {
        if (counts && counts.sets[s]) {
          const Ms = counts.sets[s],
            m = ST.mh(kS.map((ki, i) => [ki, nS[i] - ki, Ms[i] - ki, counts.N[i] - nS[i] - Ms[i] + ki]));
          x.a = {
            mh: true,
            l2: L2(m.or === Infinity ? 1e300 : m.or),
            lo: m.lo ? Math.log2(m.lo) : null,
            hi: m.hi ? Math.log2(m.hi) : null,
            p: m.p,
            q: null,
          };
        } else if (k)
          x.a = { l2: Math.log2(k / n / (M / ps.N)), lo: null, hi: null, p: ST.hyperSF(k, ps.N, M, n), q: null };
        if (x.a.p != null && Number.isFinite(x.a.p)) tested.push(x.a);
      }
      res.set(s, x);
    }
    const q = ST.bh(tested.map((a) => a.p));
    tested.forEach((a, i) => {
      a.q = q[i];
    });
    return (memo.maps[aid] = { n, N: ps.N, res, blocked });
  }
  const selText = (x) =>
    x.selected
      ? 'this is the set your selection was made with, so it is not compared with itself'
      : x.circular
        ? `${int(x.k)} of the ${int(x.M)} ${here} ${inWord(true)}; ${
            x.k === x.n
              ? 'every one of them is here, so there is nothing to compare'
              : 'the selection names its proteins or was made with this map, so it is not compared with it'
          }`
        : `${int(x.k)} of the ${int(x.M)} ${here} ${inWord(true)} (${int(x.n)} of the ${int(x.N)} proteins the map ` +
          `places); ${abundText(x.a)}`;
  function abundText(a) {
    if (!a || a.l2 == null) return 'not compared';
    const t = a.test,
      ci = t && t.lo != null && t.hi != null ? ` (95% CI ${fxv(2 ** t.lo)}–${fxv(2 ** t.hi)})` : '',
      within = t && t.l2 != null ? `; within abundance deciles, odds ratio ${fxv(2 ** t.l2)}${ci}` : '';
    return (
      `${orWords(a)}${within}, q ${fq(a.q)}` +
      (a.small
        ? ` (fewer than ${READ.min_group} proteins on a side: not colored)`
        : tone(a) === 'ns'
          ? ' (no difference)'
          : '')
    );
  }

  // ---- the two layers: regions (each map's regions question) and compartments (each map's own sets) ----------------
  const LAYERS = {
    region: {
      key: 'region',
      cols: REGMAPS.map((m) => m.regions),
      groups:
        (C.regions || []).length && REGMAPS.length
          ? [
              [
                C.regions_title || 'Regions of the cell',
                C.regions.map((r) => ({
                  ...r,
                  map: Object.fromEntries(REGMAPS.map((m) => [m.regions, r.set || r.label])),
                })),
              ],
            ]
          : [],
    },
    part: {
      key: 'part',
      cols: MAPS.map((m) => m.analysis),
      groups: C.compartments.map((g) => [
        g.group,
        g.rows.map((r) => ({ ...r, map: Object.fromEntries(Object.entries(r.sets || {}).filter(([k]) => MAP[k])) })),
      ]),
    },
  };
  const rowId = (L, gi, ri) => (L.key === 'region' ? 'r' : 'p') + gi + '.' + ri;
  const rowOf = (id) => {
    const L = LAYERS[id[0] === 'r' ? 'region' : 'part'],
      [gi, ri] = id.slice(1).split('.').map(Number);
    return L.groups[gi]?.[1][ri] ? [L, L.groups[gi][1][ri]] : [null, null];
  };
  function gridCell(aid, cat, scoped) {
    const t = cat && T[aid]?.[cat];
    if (!t) return null;
    if (scoped) {
      const x = selTests(aid)?.res.get(cat);
      if (!x) return null;
      const a = x.circular
        ? { l2: null, q: null }
        : {
            l2: x.n && x.M ? L2(x.k / x.n / (x.M / x.N)) : null,
            lo: null,
            hi: null,
            q: x.a.q,
            p: x.a.p,
            test: x.a.mh ? x.a : null,
            small: smallOf(x.k, x.M),
          };
      return {
        a,
        k: x.k,
        M: x.M,
        circular: x.circular,
        selected: x.selected,
        tone: x.selected ? 'sel' : x.circular ? 'na' : tone(a),
        x,
        t,
      };
    }
    const a = adj(aid, t);
    return { a, k: t.k, M: t.M, tone: tone(a), t };
  }
  function cellTip(aid, cat, c, scoped) {
    const ds = DS(aid),
      head = `<b>${esc(ds.name)}</b>${
        ds.method ? ` (${esc(ds.method)}${ds.cells ? ', ' + esc(ds.cells) : ''})` : ''
      }: ${esc(label(aid, cat))}<br>`;
    if (scoped)
      return (
        head +
        `<b>Your selection</b>: ${esc(selText(c.x))}<br><span class="muted">${esc(cap(who(false)))}: ${esc(abundText(adj(aid, c.t)))}</span>`
      );
    const t = c.t;
    return (
      head +
      `Here: ${int(t.k)} of the ${int(t.n)} ${esc(who(false))} (${pc(t.k, t.n)}%), ${int(t.M - t.k)} of the ${int(t.N - t.n)} ${esc(others)} (${pc(t.M - t.k, t.N - t.n)}%)` +
      `<br><b>Against ${esc(stratified(aid) ? alike : 'the other proteins the map places')}</b>: ${esc(abundText(c.a))}`
    );
  }
  // where the fold has too few proteins on a side, what can be said: how many of the part's proteins carry a mark (the
  // percent view's number), and which side is short
  function fewWords(cells, scoped) {
    const ts = cells.map(([, c]) => c.t).filter((t) => t && t.M),
      share = scoped ? null : medOf(ts.map((t) => t.k / t.M));
    if (share == null) return 'too few proteins';
    const without = ts.every((t) => t.M - t.k < READ.min_group),
      withMark = ts.every((t) => t.k < READ.min_group);
    return `too few ${without ? 'without one ' : withMark ? 'with one ' : 'proteins '}to compare (${pctText(share)} carry one)`;
  }
  function rowSummary(L, row, scoped) {
    const all = L.cols.map((aid) => [aid, gridCell(aid, row.map[aid], scoped)]).filter(([, c]) => c),
      cells = all.filter(([, c]) => !c.circular),
      // the maps that can speak for the part: each compares at least min_group proteins on either side
      ok = cells.filter(([, c]) => !c.a.small && c.a.l2 != null);
    const median = (xs) => {
      const v = xs
          .map(([, c]) => c.a.l2)
          .filter((x) => x != null && Number.isFinite(x))
          .sort((x, y) => x - y),
        h = v.length / 2;
      return v.length ? (v.length % 2 ? v[Math.floor(h)] : (v[h - 1] + v[h]) / 2) : null;
    };
    const med = median(ok) ?? median(cells);
    const nUp = ok.filter(([, c]) => c.tone[0] === 'u').length,
      nDn = ok.filter(([, c]) => c.tone[0] === 'd').length;
    // colored only when at least min_maps of those maps find the difference the same way, and none the other way
    const agree = med != null && (med > 0 ? nUp >= READ.min_maps && !nDn : nDn >= READ.min_maps && !nUp);
    const up = nUp > 0,
      down = nDn > 0;
    const mine = !!all.length && all.every(([, c]) => c.selected),
      tn = mine ? 'sel' : med == null ? 'na' : tone({ l2: med, q: agree ? 0 : 1 });
    return {
      row,
      L,
      cells: all,
      a: { l2: med },
      tone: tn,
      selected: mine,
      value:
        tn === 'sel'
          ? 'your selection'
          : tn === 'na'
            ? all.length
              ? 'not compared'
              : 'not in these maps'
            : tn === 'ns'
              ? (up && down) || ((up || down) && ok.length)
                ? 'maps disagree'
                : !ok.length
                  ? fewWords(cells, scoped)
                  : 'no difference'
              : orText({ l2: med }),
      maps: cells.length ? cells.length + (cells.length === 1 ? ' map' : ' maps') : '',
    };
  }
  // every part a row colors, with its summary; a part a row colors only when it has no row of its own (also:)
  // the percent view of a part: the median over the maps that have it of the share of the set's proteins that carry a mark
  // (with a selection: that are in it, the whole site's share beside)
  function pctCell(aid, cat, scoped) {
    const e = cat && PCTD[aid]?.sets?.[cat];
    if (!e || !e[0]) return null;
    const c = { M: e[0], k: e[1], share: e[1] / e[0], whole: e[1] / e[0], wk: e[1], ref: PCTD[aid].n / PCTD[aid].N };
    if (!scoped) return c;
    const t = selTests(aid),
      x = t?.res.get(cat);
    if (!x) return null;
    return { ...c, k: x.k, share: x.k / e[0], selected: x.selected, nSel: t.n, ref: t.N ? t.n / t.N : null };
  }
  function pctRow(L, row, scoped, view = pv()) {
    const all = L.cols.map((aid) => [aid, pctCell(aid, row.map[aid], scoped)]).filter(([, c]) => c),
      mine = !!all.length && all.every(([, c]) => c.selected),
      share = medOf(all.map(([, c]) => c.share)),
      n = all.length ? Math.round(medOf(all.map(([, c]) => c.M))) : null;
    return {
      row,
      L,
      cells: all,
      a: { l2: null },
      view,
      share,
      n,
      whole: medOf(all.map(([, c]) => c.whole)),
      selected: mine,
      tone: 'na',
      value: mine
        ? 'your selection'
        : share == null
          ? 'not in these maps'
          : view === 'diff'
            ? ptsText(share - pctRef(scoped))
            : scoped
              ? `${pctText(share)} in selection`
              : `${pctText(share)} · ${int(n)} proteins`,
      maps: all.length ? all.length + (all.length === 1 ? ' map' : ' maps') : '',
    };
  }
  // the share of all the proteins the maps place that carry a mark (that are in the selection): the key's reference tick
  const pctRef = (scoped) =>
    medOf(
      MAPS.map((m) => {
        const d = PCTD[m.analysis];
        if (!d) return null;
        if (!scoped) return d.n / d.N;
        const t = selTests(m.analysis);
        return t && t.N ? t.n / t.N : null;
      })
    );
  // the ramp's range. website.cell.range: `full` is 0 to 100%; `data` starts at the lowest share among the parts (parts of at
  // least min_group proteins), rounded down to 5%, so that a mark on nearly every protein still shows the parts apart. Without
  // the option, `data` where the share among all the proteins the maps place is 80% or more, else `full`. With a selection the
  // steps are fifths of the largest share among the parts that are not the selection's own.
  function pctLo() {
    const ref = pctRef(false),
      mode = C.range || (ref != null && ref >= 0.8 ? 'data' : 'full');
    if (mode !== 'data') return 0;
    // the parts as drawn: each row's median over its maps, among rows of at least min_group proteins
    const v = [];
    for (const L of [LAYERS.part, LAYERS.region])
      L.groups.forEach(([, rows]) =>
        rows.forEach((row) => {
          const cs = L.cols.map((aid) => pctCell(aid, row.map[aid], false)).filter(Boolean);
          if (cs.length && medOf(cs.map((c) => c.M)) >= READ.min_group) v.push(medOf(cs.map((c) => c.share)));
        })
      );
    return v.length ? Math.min(0.95, Math.floor(Math.min(...v) * 20 + 1e-9) / 20) : 0;
  }
  const pctRange = (scoped, shares) => (scoped ? { lo: 0, hi: Math.max(0, ...shares) } : { lo: pctLo(), hi: 1 });
  function pctScale(P, within, scoped, view) {
    if (view === 'diff') {
      const ref = pctRef(scoped),
        list = Object.values(P).filter((p) => !p.selected && p.share != null),
        mx = Math.max(0, ...list.map((p) => Math.abs(p.share - ref)));
      Object.values(P).forEach((p) => {
        p.tone = p.selected ? 'sel' : p.share == null ? 'na' : diffStep(p.share - ref, mx);
      });
      return { P, within, view, range: { max: mx }, ref };
    }
    const list = Object.values(P),
      range = pctRange(
        scoped,
        list.filter((p) => !p.selected && p.share != null).map((p) => p.share)
      );
    list.forEach((p) => {
      p.tone = p.selected ? 'sel' : p.share == null ? 'na' : 'p' + pctBin(p.share, range);
    });
    return { P, within, view, range, ref: pctRef(scoped) };
  }
  // the share of the reviewed proteins that carry a mark (the snapshot's entries, from the run), where the run says
  const pctProteome = () => (D.cell_proteome ? D.cell_proteome.n / D.cell_proteome.N : null);
  const pctRefWords = (scoped, ref) =>
    scoped
      ? `${pctText(ref)} of mapped proteins are in the selection`
      : pctProteome() != null
        ? `${pctText(pctProteome())} of all reviewed proteins · ${pctText(ref)} of mapped proteins`
        : `${pctText(ref)} of mapped proteins`;
  const pctBy = (scoped) =>
    VIEW === 'diff'
      ? `the difference of each part’s share ${scoped ? 'in the selection' : `with a ${W.mark}`} from the share among all the proteins the maps place`
      : scoped
        ? 'the share of each part’s proteins that are in the selection'
        : `the share of each part’s proteins with a ${W.mark}`;
  // a part's hover in the percent view: the share and its count, each map's own, and the whole site's share beside a selection
  function pctTip(p, name) {
    const nm = `<b>${esc(name || rowName(p.row))}</b>`,
      scoped = p.cells.some(([, c]) => c.nSel != null);
    if (p.selected) return `${nm}: your selection`;
    const ref = pctRef(scoped),
      lead =
        p.view === 'diff' && p.share != null
          ? `${esc(ptsText(p.share - ref))} from all mapped proteins (${esc(pctText(ref))}): `
          : '';
    const per = p.cells
      .map(
        ([aid, c]) =>
          esc(DS(aid).name) +
          ': ' +
          (scoped
            ? `${pctText(c.share)} (${int(c.k)} of ${int(c.M)} proteins are in your selection; whole site ${pctText(c.whole)})`
            : `${pctText(c.share)} (${int(c.k)} of ${int(c.M)} proteins)`)
      )
      .join('<br>');
    return (
      (scoped
        ? `${nm}: ${lead}${esc(pctText(p.share))} of ${int(p.n)} proteins are in your selection${p.cells.length > 1 ? ', median of ' + esc(p.maps) : ''}` +
          `<br>Whole site: ${esc(pctText(p.whole))} have at least one ${esc(W.mark)}`
        : `${nm}: ${lead}${esc(pctText(p.share))} of ${int(p.n)} proteins have at least one ${esc(W.mark)}${
            p.cells.length > 1 ? ', median of ' + esc(p.maps) : ''
          }`) + `<br>${per}<br><span class="muted">Click for its numbers and proteins</span>`
    );
  }
  function parts(scoped, view = VIEW) {
    if (ONE) return oneParts();
    const pct = view !== 'fold',
      P = {},
      within = {};
    for (const L of [LAYERS.part, LAYERS.region]) {
      L.groups.forEach(([, rows], gi) =>
        rows.forEach((row, ri) => {
          if (row.part)
            P[row.part] = {
              ...(pct ? pctRow(L, row, scoped, view) : rowSummary(L, row, scoped)),
              id: rowId(L, gi, ri),
            };
          (row.also || []).forEach((k) => {
            within[k] ||= row.part;
          });
        })
      );
    }
    return pct ? pctScale(P, within, scoped, view) : { P, within };
  }

  // ---- one protein (the protein page's card): the same drawings, each part colored when a map places the protein there ----
  // ONE is the protein's row of the site's proteins while its drawings are made; a part no map places it in stays outlined
  let ONE = null;
  const withOne = (p, f) => {
    ONE = p;
    try {
      return f();
    } finally {
      ONE = null;
    }
  };
  function oneParts() {
    const P = {},
      within = {};
    for (const L of [LAYERS.part, LAYERS.region]) {
      L.groups.forEach(([, rows], gi) =>
        rows.forEach((row, ri) => {
          const hit = L.cols.filter((aid) => row.map[aid] && K.sel.setHas(aid, row.map[aid], ONE.i)),
            tested = L.cols.some((aid) => row.map[aid]);
          // every compartment is named: found (colored, with the number of studies), not found (gray) or not tested (no map has it)
          if (row.part && !(P[row.part] && P[row.part].found))
            P[row.part] = {
              row,
              L,
              id: rowId(L, gi, ri),
              cells: hit.map((aid) => [aid, null]),
              found: hit.length > 0,
              tone: hit.length ? 'u2' : tested ? 'ns' : 'na',
              value: hit.length ? 'Found here' : tested ? 'Not found here' : 'Not tested',
              maps: hit.length ? hit.length + (hit.length === 1 ? ' study' : ' studies') : '',
            };
          (row.also || []).forEach((k) => {
            within[k] ||= row.part;
          });
        })
      );
    }
    return { P, within };
  }
  // each map's word on the protein: its compartments, or that it places it in none, or does not place it
  function oneMaps(p) {
    const sd = K.sel.data();
    if (!sd) return null;
    return MAPS.map((m) => {
      const aid = m.analysis,
        ps = sd.protein_sets?.[aid],
        d = DS(aid);
      const sets = ps ? ps.sets.map((x) => x[0]).filter((s) => K.sel.setHas(aid, s, p.i)) : [];
      const placed = !!ps && (sets.length > 0 || (ps.in_background || []).includes(p.i));
      return {
        aid,
        name: d.name,
        method: d.method,
        cells: d.cells,
        placed,
        graded: !!m.graded,
        sets: sets.map((s) => label(aid, s)),
      };
    });
  }
  const oneTsv = (p) => () =>
    K.preamble(
      `${C.title || 'Where in the cell'}: ${p.gene || p.acc}`,
      'every compartment: found here (with the studies), not found here, or not tested'
    ) +
    'compartment\tstatus\tstudies\n' +
    Object.values(withOne(p, () => oneParts().P))
      .map((q) => [rowName(q.row), q.value.toLowerCase(), q.cells.map(([aid]) => DS(aid).name).join('; ')].join('\t'))
      .join('\n') +
    '\n';
  function oneDrawings(p) {
    if (!K.sel.data() || !DRAWINGS.length) return '';
    TIPS = [];
    if (DRAWINGS.length > 1) {
      FIGS['p-both'] = bothOf('p-');
      FIGS['p-both'].title = () => `${p.gene || p.acc}: ${and(DRAWINGS.map((d) => 'the ' + d.drawing))}`;
    }
    const html = DRAWINGS.map((d) => {
      const k = 'p-' + d.drawing;
      FIGS[k] = {
        title: () => `${p.gene || p.acc}: the ${d.drawing}`,
        sub: () =>
          `Every compartment is named: colored where a study found ${p.gene || p.acc}, gray where none did, ` +
          `outlined where no study tested it.`,
        make: () => withOne(p, () => DRAW[d.drawing](false)),
        tsv: oneTsv(p),
        zoom: d.drawing,
        one: { i: p.i },
        note: () =>
          'Colored: found here, with the number of studies. Gray: not found here. Dashed outline: not tested.',
        legend: () => [
          [toneOf('up-2'), toneOf('up-3'), 'found here'],
          [toneOf('mid'), '#8a96a0', 'not found here'],
          ['#ffffff', '#8a96a0', 'not tested'],
        ],
      };
      return block(k, `The ${d.drawing}`, 'cell-fig cell-onep');
    }).join('');
    return html;
  }
  // a phone's drawings of one protein: the fit-width drawings without their side labels (the page lists the parts instead)
  const oneNarrowHtml = (p) =>
    DRAWINGS.map(
      (d) =>
        `<figure class="cell-fig cell-onen"><figcaption class="vh">${esc(cap(d.drawing))}</figcaption>` +
        `<div class="cell-draw" data-cell-one="${esc(d.drawing)}" data-i="${p.i}" role="img" aria-label="${esc(
          `${p.gene || p.acc}: the ${d.drawing}, the parts ` + `colored by a map`
        )}"></div></figure>`
    ).join('');
  function fillOne() {
    document.querySelectorAll('[data-cell-one]:not([data-done])').forEach((el, k) => {
      el.dataset.done = '1';
      drawInto(el, el.dataset.cellOne, { crop: true, labels: false, keep: k > 0, one: { i: +el.dataset.i } });
    });
  }
  K.cell = { maps: oneMaps, drawings: oneDrawings, name: (m) => DS(m).name, drawingsNarrow: oneNarrowHtml, fillOne };

  // ---- the page's drawing helpers: a registry of hover texts, the color classes, labels with leader lines -------------
  let TIPS = [];
  const tipAttr = (html) => ` data-cell-tip="${TIPS.push(html) - 1}"`;
  function draw(scoped, view) {
    const { P, within } = parts(scoped, view);
    const own = (k) => (P[k] ? k : within[k] && P[within[k]] ? within[k] : null);
    const tn = (k) => (own(k) ? P[own(k)].tone : 'na');
    const fill = (k) => 'cg-c ' + tn(k),
      line = (k) => 'cg-line ' + tn(k);
    const sig = (p) => p.tone[0] === 'u' || p.tone[0] === 'd';
    const by = () => ((view ? view !== 'fold' : pctOn()) ? pctBy(scoped) : `the fold of ${who(scoped)}`);
    // dup: the drawing's label repeats the part's shape; it keeps the click but is hidden from keyboard and screen reader
    const tip = (k0, name, dup) => {
      const k = own(k0);
      if (!k) return '';
      const p = P[k];
      if (ONE)
        return (
          tipAttr(
            `<b>${esc(name || rowName(p.row))}</b>: ${
              p.found ? 'found here by ' + and(p.cells.map(([aid]) => esc(DS(aid).name))) : esc(p.value.toLowerCase())
            }`
          ) + ` data-cell-zpart="${esc(k)}"`
        );
      if (isPv(p))
        return (
          ` data-cell-part="${esc(k)}"` +
          (dup
            ? ' aria-hidden="true"'
            : ` role="button" tabindex="0" aria-label="${esc(`${name || rowName(p.row)}, ${p.value}`)}"`) +
          tipAttr(pctTip(p, name))
        );
      const only =
        p.cells.length === 1 && p.cells[0][1] && p.cells[0][1].M != null ? ', ' + p.cells[0][1].M + ' proteins' : '';
      const nm = `${name || rowName(p.row)}, ${sig(p) ? 'fold ' : ''}${p.value}${sig(p) && p.maps ? ', ' + p.maps : ''}${only}`;
      return (
        ` data-cell-part="${esc(k)}"` +
        (dup ? ' aria-hidden="true"' : ` role="button" tabindex="0" ` + `aria-label="${esc(nm)}"`) +
        tipAttr(
          `<b>${esc(name || rowName(p.row))}</b>: ${sig(p) ? 'fold ' : ''}${esc(p.value)}${
            sig(p) ? (p.maps === '1 map' ? ' (1 map)' : ', median of ' + esc(p.maps)) : ''
          }<br>` +
            p.cells
              .map(
                ([aid, c]) =>
                  esc(DS(aid).name) +
                  ': ' +
                  (c.circular
                    ? c.selected
                      ? 'your selection'
                      : 'not compared'
                    : esc(orText(c.a)) +
                      (c.a.q != null ? ', q ' + fq(c.a.q) : '') +
                      (c.tone === 'ns' ? ' (no difference)' : ''))
              )
              .join('<br>') +
            '<br><span class="muted">Click for its numbers and proteins</span>'
        )
      );
    };
    // labels: [{ k, side, x, y (the anchor), name }] in columns of width col, each side in the order of its anchors
    const labels = (items, Wd, H, col) => {
      let g = '';
      for (const side of ['l', 'r']) {
        // a name is set in the room between the drawing's edge and the label column, measured in the export's face and then
        // allowed a fifth more (a reader's fallback face is wider); one that does not fit goes on a second line
        const room = (side === 'l' ? col - 22 : Wd - (Wd - col + 22)) - 4,
          list = items.filter((it) => it.side === side && own(it.k) === it.k).sort((a, b) => a.y - b.y),
          lines = new Map(
            list.map((it) => {
              const ls = K.wrap(
                (it.name || rowName(P[it.k].row)) + (P[it.k].selected ? ' · your selection' : ''),
                room / 1.2,
                14,
                700
              );
              return [it, ls.length > 2 ? [ls[0], K.fit(ls.slice(1).join(' '), room, 14, 700, 1.2)] : ls];
            })
          ),
          // the value goes on one line, or on two where it is longer than the room (a percent with its count, a coverage)
          vals = new Map(
            list.map((it) => {
              const p = P[it.k],
                v = p.selected ? '' : p.value,
                m = p.maps && !p.selected ? '\u00A0·\u00A0' + p.maps : '';
              const wt = isPv(p) ? 700 : 400;
              if (!v || K.tw(v + m, 13, wt) * 1.2 <= room) return [it, null];
              const ls = K.wrap(v, room / 1.2, 13, wt);
              return [it, ls.length > 3 ? [ls[0], ls[1], K.fit(ls.slice(2).join(' '), room, 13, wt, 1.2)] : ls];
            })
          ),
          wide = list.some((it) => vals.get(it)),
          // labels of two-line values still fit between the top and the bottom of the drawing
          gap = wide
            ? Math.min(
                (list.some((it) => lines.get(it).length > 1) ? 66 : 52) +
                  14 * (Math.max(...list.map((it) => vals.get(it)?.length || 1)) - 1),
                (H - 56) / Math.max(1, list.length - 1)
              )
            : list.some((it) => lines.get(it).length > 1)
              ? 66
              : 52,
          top = 30,
          bot = H - 26,
          ys = list.map((it) => it.y);
        for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + gap : top);
        for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i < ys.length - 1 ? ys[i + 1] - gap : bot);
        list.forEach((it, i) => {
          const p = P[it.k],
            y = ys[i],
            left = side === 'l',
            edge = left ? col : Wd - col,
            tx = left ? edge - 22 : edge + 22,
            anc = left ? 'end' : 'start',
            bx = left ? edge - 7 : edge + 1,
            ls = lines.get(it),
            up = (ls.length - 1) * 15; // a second line of the name stands above the first
          const elbow = left ? edge + 12 : edge - 12;
          g +=
            `<g class="cd-label"${tip(it.k, it.name, true)}><polyline class="cd-lead" points="${edge},${y - 5} ${elbow},${y - 5} ${it.x},${it.y}"/><circle ` +
            `class="cd-dot" cx="${it.x}" cy="${it.y}" r="3"/>` +
            `<rect class="cd-hit" x="${left ? 0 : edge}" y="${y - 18 - up}" width="${col}" height="${40 + up}"/>` +
            `<rect class="${fill(it.k)} cd-o" x="${bx}" y="${y - 17 - up}" width="6" height="${34 + up}" rx="2"/>` +
            `<text class="cd-name" x="${tx}" y="${y - up}" text-anchor="${anc}">${ls
              .map(
                (t, i) => `<tspan x="${tx}"${i ? ' dy="15"' : ''}>${esc(t + (i < ls.length - 1 ? ' ' : ''))}</tspan>`
              )
              .join('')}</text>` +
            `<text class="cd-val" x="${tx}" y="${y + 18}" text-anchor="${anc}">${
              vals.get(it)
                ? vals
                    .get(it)
                    .map(
                      (t, i, a) =>
                        `<tspan${isPv(p) ? ' font-weight="700"' : ' class="m"'} x="${tx}"${i ? ' dy="14"' : ''}>${esc(t + (i < a.length - 1 ? ' ' : ''))}</tspan>`
                    )
                    .join('')
                : p.selected
                  ? ''
                  : sig(p) || isPv(p)
                    ? `<tspan font-weight="700">${esc(p.value)}</tspan>`
                    : `<tspan class="m">${esc(p.value)}</tspan>`
            }` +
            (p.maps && !p.selected && !vals.get(it) ? `<tspan class="m">\u00A0·\u00A0${esc(p.maps)}</tspan>` : '') +
            '</text></g>';
        });
      }
      return g;
    };
    return { P, own, fill, line, tip, labels, by, has: (k) => !!own(k) };
  }

  // ---- geometry: smooth closed outlines, arcs, a mitochondrion, chromosome territories and their fibers --------------
  function smooth(pts) {
    const n = pts.length,
      P = (i) => pts[(i + n) % n],
      f = (v) => v.toFixed(1);
    let d = 'M' + f(P(0)[0]) + ',' + f(P(0)[1]);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = P(i - 1),
        [x1, y1] = P(i),
        [x2, y2] = P(i + 1),
        [x3, y3] = P(i + 2);
      d +=
        'C' + [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2].map(f).join(',');
    }
    return d + 'Z';
  }
  const blob = (cx, cy, rx, ry, f, rot = 0) =>
    f.map((s, i) => {
      const t = (2 * Math.PI * i) / f.length + rot;
      return [cx + rx * s * Math.cos(t), cy + ry * s * Math.sin(t)];
    });
  const arc = (cx, cy, rx, ry, a0, a1, step = 4) => {
    const pts = [];
    for (let t = a0; t <= a1 + 1e-9; t += step) {
      const r = (t * Math.PI) / 180;
      pts.push([cx + rx * Math.cos(r), cy + ry * Math.sin(r)]);
    }
    return pts;
  };
  const poly = (pts) => 'M' + pts.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join('L');
  function rayOut(x, y, t, cx, cy, rx, ry) {
    const r = (t * Math.PI) / 180,
      dx = Math.cos(r),
      dy = Math.sin(r),
      px = (x - cx) / rx,
      py = (y - cy) / ry,
      ux = dx / rx,
      uy = dy / ry;
    const a = ux * ux + uy * uy,
      b = 2 * (px * ux + py * uy),
      c = px * px + py * py - 1,
      s = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    return [x + s * dx, y + s * dy];
  }
  const mito = (cx, cy, len, wid, rot, cls) => {
    let z = '',
      up = true;
    for (let x = -len / 2 + 9; x <= len / 2 - 9; x += 7) {
      z += (z ? 'L' : 'M') + x.toFixed(1) + ',' + (up ? -wid / 2 + 3.5 : wid / 2 - 3.5);
      up = !up;
    }
    return (
      `<g transform="translate(${cx} ${cy}) rotate(${rot})"><rect class="${cls} cd-o" x="${-len / 2}" y="${-wid / 2}" width="${len}" height="${wid}" rx="${wid / 2}"/>` +
      (`<rect class="cd-in" x="${-len / 2 + 3}" y="${-wid / 2 + 3}" width="${len - 6}" height="${wid - 6}" rx="${wid / 2 - 3}"/><path ` +
        `class="cd-in" d="${z}"/></g>`)
    );
  };
  // chromosome territories: an ellipse divided among seeds (Voronoi cells), each inset by half of gap, corners rounded
  function territoryPolys(seeds, cx, cy, rx, ry, gap) {
    const ring = [];
    for (let i = 0; i < 40; i++) {
      const t = (2 * Math.PI * i) / 40;
      ring.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    const clip = (pg, nx, ny, c) => {
      const out = [];
      pg.forEach((p, i) => {
        const q = pg[(i + 1) % pg.length],
          dp = nx * p[0] + ny * p[1] - c,
          dq = nx * q[0] + ny * q[1] - c;
        if (dp <= 0) out.push(p);
        if (dp < 0 !== dq < 0) {
          const u = dp / (dp - dq);
          out.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]);
        }
      });
      return out;
    };
    return seeds.map((s, i) => {
      let pg = ring;
      seeds.forEach((o, j) => {
        if (i === j) return;
        const nx = o[0] - s[0],
          ny = o[1] - s[1],
          len = Math.hypot(nx, ny);
        pg = clip(pg, nx / len, ny / len, (nx * (s[0] + o[0]) + ny * (s[1] + o[1])) / (2 * len) - gap / 2);
      });
      for (let k = 0; k < 2; k++)
        pg = pg.flatMap((p, m) => {
          const q = pg[(m + 1) % pg.length];
          return [
            [0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]],
            [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]],
          ];
        });
      return pg;
    });
  }
  const territories = (seeds, cx, cy, rx, ry, gap) =>
    territoryPolys(seeds, cx, cy, rx, ry, gap).map((pg) => poly(pg) + 'Z');
  // chromatin fiber in a territory: a seeded looping walk that turns back at the edge, as a smooth curve
  function fibre(pg, start, seed, steps, inset) {
    let st = (seed * 2654435761) >>> 0;
    const rnd = () => {
      st = (st + 0x6d2b79f5) >>> 0;
      let t = Math.imul(st ^ (st >>> 15), 1 | st);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
        const [xi, yi] = pg[i],
          [xj, yj] = pg[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        const ex = xj - xi,
          ey = yj - yi,
          l2 = ex * ex + ey * ey || 1,
          u = Math.max(0, Math.min(1, ((x - xi) * ex + (y - yi) * ey) / l2));
        if (Math.hypot(x - xi - u * ex, y - yi - u * ey) < inset) return false;
      }
      return c;
    };
    let [x, y] = start,
      h = rnd() * 2 * Math.PI,
      curl = 0.5;
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      if (i % 9 === 0) curl = (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.45);
      let tries = 0,
        nx,
        ny;
      do {
        h += curl + (rnd() - 0.5) * 0.9 + (tries ? Math.PI * (0.6 + rnd() * 0.8) : 0);
        nx = x + 6.5 * Math.cos(h);
        ny = y + 6.5 * Math.sin(h);
      } while (!inside(nx, ny) && ++tries < 12);
      if (tries >= 12) continue;
      x = nx;
      y = ny;
      pts.push([x, y]);
    }
    let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (let i = 1; i < pts.length - 1; i++)
      d +=
        'Q' +
        pts[i][0].toFixed(1) +
        ',' +
        pts[i][1].toFixed(1) +
        ' ' +
        ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1) +
        ',' +
        ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1);
    return d;
  }
  const CT = [
    [330, 150],
    [300, 265],
    [360, 360],
    [450, 95],
    [465, 225],
    [480, 350],
    [600, 95],
    [615, 335],
    [705, 170],
    [715, 285],
  ];

  // ---- the drawings: a cell, its nucleus drawn whole; the nucleus in its parts. Each part takes the color of the
  // median of the maps' comparisons, gray where they disagree or show no difference, outlined where no map
  // measures it; a measured part is named beside the drawing and opens its numbers --------------------------------------
  const DRAW = {
    cell(scoped, view) {
      const Dr = draw(scoped, view),
        Wd = 1000,
        H = 500,
        cx = 500,
        cy = 250,
        rx = 285,
        ry = 206;
      const shape = [1, 0.97, 1.02, 0.99, 1.03, 0.98, 1.01, 0.97, 1.02, 1, 0.98, 1.02],
        body = smooth(blob(cx, cy, rx, ry, shape));
      const nx = 452,
        ny = 262,
        nrx = 110,
        nry = 94,
        nuc = smooth(blob(nx, ny, nrx, nry, [1, 1.02, 0.98, 1.01, 0.99, 1.02, 1, 0.98]));
      let g = `<g${Dr.tip('cytosol')}><path class="${Dr.fill('cytosol')}" fill-opacity=".34" d="${body}"/></g>`;
      const [ox, oy] = [598, 352],
        mt = [-58, -30, -8, 14, 36, 62, 92, 122, 150, 172];
      const mtCurve = (t) => {
        const [ex, ey] = rayOut(ox, oy, t, cx, cy, rx * 0.91, ry * 0.9);
        return [ex, ey, (ox + ex) / 2 + (ey - oy) * 0.08, (oy + ey) / 2 - (ex - ox) * 0.08];
      };
      g +=
        `<g${Dr.tip('microtubules')}>` +
        mt
          .map((t) => {
            const [ex, ey, mx, my] = mtCurve(t);
            return (
              `<path class="${Dr.line('microtubules')}" fill="none" ` +
              `stroke-width="1.8" stroke-linecap="round" d="M${ox},${oy}Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}"/>`
            );
          })
          .join('') +
        '</g>';
      const [mex, mey, mmx, mmy] = mtCurve(36),
        u = 0.55,
        mtAt = [
          (1 - u) ** 2 * ox + 2 * u * (1 - u) * mmx + u * u * mex,
          (1 - u) ** 2 * oy + 2 * u * (1 - u) * mmy + u * u * mey,
        ];
      g +=
        `<g${Dr.tip('actin')}><path class="${Dr.line('actin')}" fill="none" stroke-width="4" ` +
        `stroke-dasharray="7 3" d="${smooth(blob(cx, cy, rx * 0.955, ry * 0.94, shape))}"/></g>`;
      g +=
        `<g${Dr.tip('pm')}><path class="${Dr.line('pm')}" fill="none" stroke-width="8" d="${body}"/><path ` +
        `class="cd-gap" stroke-width="1.6" d="${body}"/></g>`;
      let er = '',
        rib = '';
      [20, 34, 48].forEach((dr, i) => {
        const pts = arc(nx, ny, nrx + dr, nry + dr * 0.92, -140 + i * 6, 22 - i * 4, 3);
        er +=
          `<path class="${Dr.line('er')}" fill="none" stroke-width="7" stroke-linecap="round" d="${poly(pts)}"/><path ` +
          `class="cd-gap" stroke-width="1.8" stroke-linecap="round" d="${poly(pts)}"/>`;
        arc(nx, ny, nrx + dr + 5.5, nry + (dr + 5.5) * 0.92, -136 + i * 6, 18 - i * 4, 7).forEach(([x, y]) => {
          rib += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.9"/>`;
        });
      });
      g += `<g${Dr.tip('er')}>${er}</g>`;
      for (const [x0, y0, t0] of [
        [622, 112, 0],
        [395, 392, 30],
        [580, 404, -20],
        [252, 212, 80],
      ]) {
        for (let i = 0; i < 7; i++) {
          const t = ((t0 + i * 26) * Math.PI) / 180;
          rib += `<circle cx="${(x0 + 13 * Math.cos(t) + i * 2.4).toFixed(
            1
          )}" cy="${(y0 + 9 * Math.sin(t)).toFixed(1)}" r="2.2"/>`;
        }
      }
      g += `<g class="${Dr.fill('ribosomes')}"${Dr.tip('ribosomes')}>${rib}</g>`;
      let pores = '';
      for (let t = 0; t < 360; t += 26) {
        const r = (t * Math.PI) / 180,
          x = nx + nrx * Math.cos(r),
          y = ny + nry * Math.sin(r),
          qx = Math.cos(r) * 4,
          qy = Math.sin(r) * 4;
        pores +=
          `<line class="cd-gap" ` +
          `stroke-width="3.2" x1="${(x - qx).toFixed(1)}" y1="${(y - qy).toFixed(1)}" x2="${(x + qx).toFixed(1)}" y2="${(y + qy).toFixed(1)}"/>`;
      }
      const sc = (p) => [nx + (p[0] - 500) * (nrx / 262), ny + (p[1] - 235) * (nry / 190)];
      g +=
        `<g${Dr.tip('nucleus')}><path class="${Dr.fill('nucleus')}" fill-opacity=".85" d="${nuc}"/>` +
        territories(CT.map(sc), nx, ny, nrx - 5, nry - 5, 5)
          .map((d) => `<path class="cd-shade" d="${d}"/>`)
          .join('') +
        `<path class="cd-shade" style="fill-opacity:.22" d="${smooth(
          blob(...sc([592, 214]), 25, 24, [1, 1.05, 0.95, 1.02, 0.97, 1.04, 1, 0.96])
        )}"/>` +
        `<path fill="none" class="cd-o" stroke-width="3.5" d="${nuc}"/><path class="cd-gap" stroke-width="1" d="${nuc}"/>${pores}</g>`;
      let golgi = '';
      for (let i = 0; i < 5; i++) {
        const x = 648 + i * 9,
          h = 40 - i * 4.5,
          d = `M${x},${206 - h}Q${x + 16},206 ${x},${206 + h}`;
        golgi +=
          `<path class="${Dr.line('golgi')}" fill="none" stroke-width="6.5" stroke-linecap="round" d="${d}"/><path ` +
          `class="cd-gap" stroke-width="1.6" stroke-linecap="round" d="${d}"/>`;
      }
      golgi += [
        [640, 158, 4],
        [652, 252, 3.5],
        [700, 172, 4],
        [704, 240, 3.5],
        [714, 206, 3],
      ]
        .map(([x, y, r]) => `<circle class="${Dr.fill('golgi')} cd-o" cx="${x}" cy="${y}" r="${r}"/>`)
        .join('');
      g += `<g${Dr.tip('golgi')}>${golgi}</g>`;
      g +=
        `<g${Dr.tip('mito')}>` +
        [
          [312, 188, 66, 26, 66],
          [384, 112, 70, 26, -8],
          [350, 378, 64, 24, 40],
          [482, 386, 60, 22, 6],
          [748, 222, 56, 22, 82],
        ]
          .map(([x, y, l, w, r]) => mito(x, y, l, w, r, Dr.fill('mito')))
          .join('') +
        '</g>';
      g +=
        `<g${Dr.tip('endolyso')}>` +
        [
          [720, 298, 13],
          [702, 334, 10],
          [258, 268, 9],
        ]
          .map(
            ([x, y, r]) =>
              `<circle class="${Dr.fill('endolyso')} cd-o" cx="${x}" cy="${y}" r="${r}"/>` +
              [
                [-0.35, -0.3],
                [0.3, -0.2],
                [0, 0.35],
              ]
                .map(
                  ([a, b]) =>
                    `<circle class="cd-in" cx="${(x + a * r).toFixed(1)}" cy="${(y + b * r).toFixed(1)}" r="${(r * 0.24).toFixed(1)}"/>`
                )
                .join('')
          )
          .join('') +
        '</g>';
      g +=
        `<g${Dr.tip('perox')}>` +
        [
          [298, 232, 8],
          [684, 130, 7],
          [470, 432, 7],
        ]
          .map(
            ([x, y, r]) =>
              `<circle class="${Dr.fill('perox')} cd-o" cx="${x}" cy="${y}" r="${r}"/><rect ` +
              `class="cd-ink" x="${x - 2.5}" y="${y - 2.5}" width="5" height="5" transform="rotate(45 ${x} ${y})"/>`
          )
          .join('') +
        '</g>';
      const drop = (k, x, y, r, s) => {
        const d = smooth(blob(x, y, r, r * 0.9, [1, 0.93, 1.05, 0.95, 1.03, 0.92, 1.04, 0.96, 1.02, 0.94], s));
        return `<path class="${Dr.line(k)}" fill="none" stroke-width="5" stroke-opacity=".35" d="${d}"/><path class="${Dr.fill(k)}" d="${d}"/>`;
      };
      g +=
        `<g${Dr.tip('granules')}>` +
        [
          [302, 322, 14, 0],
          [548, 414, 12, 1],
          [560, 90, 11, 0.5],
        ]
          .map(([x, y, r, s]) => drop('granules', x, y, r, s))
          .join('') +
        '</g>';
      g +=
        `<g${Dr.tip('pbodies')}>` +
        [
          [425, 420, 6],
          [730, 170, 6],
          [520, 112, 5],
          [274, 298, 5],
        ]
          .map(([x, y, r]) => drop('pbodies', x, y, r, 0))
          .join('') +
        '</g>';
      g +=
        `<g${Dr.tip('centrosome')}><circle class="${Dr.fill('centrosome')}" fill-opacity=".45" cx="${ox}" cy="${oy}" r="17"/>` +
        `<rect class="${Dr.fill('centrosome')} cd-o" x="${ox - 9}" y="${oy - 3}" width="13" height="6" rx="1.5"/>` +
        (`<rect class="${Dr.fill('centrosome')} cd-o" x="${ox + 1}" y="${oy - 3}" width="6" height="13" rx="1.5"/>` +
          `</g>`);
      const nucK = Dr.own('nucleus') || 'nucleus';
      g += Dr.labels(
        [
          { k: 'cytosol', side: 'l', x: 470, y: 80 },
          { k: 'mito', side: 'l', x: 306, y: 175 },
          { k: 'perox', side: 'l', x: 298, y: 232 },
          { k: 'actin', side: 'l', x: 225, y: 250 },
          { k: nucK, side: 'l', x: 372, y: 300 },
          { k: 'granules', side: 'l', x: 302, y: 322 },
          { k: 'pm', side: 'l', x: 353, y: 434 },
          { k: 'ribosomes', side: 'r', x: 635, y: 112 },
          { k: 'pbodies', side: 'r', x: 730, y: 170 },
          { k: 'golgi', side: 'r', x: 666, y: 206 },
          { k: 'er', side: 'r', x: 609, y: 274 },
          { k: 'endolyso', side: 'r', x: 724, y: 296 },
          { k: 'centrosome', side: 'r', x: ox + 6, y: oy + 8 },
          { k: 'microtubules', side: 'r', x: +mtAt[0].toFixed(1), y: +mtAt[1].toFixed(1) },
        ],
        Wd,
        H,
        200
      );
      return { g, W: Wd, H, aria: `The cell, each compartment colored by ${Dr.by()}` };
    },
    nucleus(scoped, view) {
      const Dr = draw(scoped, view),
        Wd = 1000,
        H = 470,
        cx = 500,
        cy = 235,
        rx = 262,
        ry = 190;
      const shape = [1, 1.02, 0.98, 1.01, 0.99, 1.02, 1, 0.98, 1.01, 0.99],
        body = smooth(blob(cx, cy, rx, ry, shape));
      let g = `<g${Dr.tip('nucleoplasm')}><path class="${Dr.fill('nucleoplasm')}" fill-opacity=".55" d="${body}"/></g>`;
      const ct = territoryPolys(CT, cx, cy, rx - 12, ry - 12, 13);
      g +=
        `<g${Dr.tip('chromatin')}>` +
        ct.map((pg) => `<path class="${Dr.fill('chromatin')} cd-o" d="${poly(pg)}Z"/>`).join('') +
        ('<g class="cd-fiber" fill="none" stroke="#1c1917" stroke-opacity=".14" ' +
          'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">') +
        ct.map((pg, i) => `<path d="${fibre(pg, CT[i], i + 1, 150, 5)}"/>`).join('') +
        '</g></g>';
      g += `<g${Dr.tip('periphery')}><path class="${Dr.line('periphery')}" fill="none" stroke-width="9" d="${smooth(
        blob(cx, cy, rx * 0.965, ry * 0.955, shape)
      )}"/></g>`;
      const nucleolus = smooth(blob(592, 214, 56, 50, [1, 1.06, 0.95, 1.04, 0.97, 1.05, 0.98, 1.03, 0.96, 1.02]));
      g += `<g${Dr.tip('perinucleolar')}><path class="${Dr.line('perinucleolar')}" fill="none" stroke-width="7" d="${nucleolus}"/></g>`;
      g +=
        `<g${Dr.tip('nucleolus')}><path class="${Dr.fill('nucleolus')} cd-o" d="${nucleolus}"/>` +
        [
          [572, 198],
          [610, 204],
          [584, 234],
          [618, 236],
        ]
          .map(
            ([x, y]) =>
              `<circle class="cd-shade" cx="${x}" cy="${y}" r="10"/>` +
              `<circle class="cd-gap" stroke-width="5" cx="${x}" cy="${y}" r="3.2"/>`
          )
          .join('') +
        '</g>';
      const cluster = (x, y, r) =>
        [
          [0, 0, 0.62],
          [0.55, -0.3, 0.5],
          [-0.5, -0.35, 0.48],
          [0.45, 0.45, 0.5],
          [-0.5, 0.4, 0.46],
          [0, -0.62, 0.42],
          [0.05, 0.62, 0.4],
        ]
          .map(
            ([a, b, s]) =>
              `<circle cx="${(x + a * r).toFixed(1)}" cy="${(y + b * r).toFixed(1)}" r="${(s * r).toFixed(1)}"/>`
          )
          .join('');
      g +=
        `<g class="${Dr.fill('speckles')} cd-o"${Dr.tip('speckles')}>` +
        [
          [377, 224, 19],
          [415, 294, 16],
          [522, 150, 15],
          [665, 310, 17],
          [420, 355, 13],
        ]
          .map(([x, y, r]) => cluster(x, y, r))
          .join('') +
        '</g>';
      g +=
        `<g${Dr.tip('paraspeckles')}>` +
        [
          [349, 216, 74],
          [356, 212, 74],
          [653, 287, 27],
          [646, 283, 27],
        ]
          .map(
            ([x, y, r]) =>
              `<ellipse class="${Dr.fill('paraspeckles')} cd-o" cx="${x}" cy="${y}" rx="3.4" ry="8" transform="rotate(${r} ${x} ${y})"/>`
          )
          .join('') +
        '</g>';
      g +=
        `<g${Dr.tip('pml')}>` +
        [
          [390, 122],
          [548, 342],
          [710, 228],
        ]
          .map(
            ([x, y]) =>
              `<circle class="${Dr.line('pml')}" fill="none" ` + `stroke-width="3.6" cx="${x}" cy="${y}" r="7"/>`
          )
          .join('') +
        '</g>';
      g +=
        `<g${Dr.tip('cajal')}>` +
        [
          [410, 166],
          [525, 95],
        ]
          .map(([x, y]) => `<circle class="${Dr.fill('cajal')} cd-o" cx="${x}" cy="${y}" r="7.5"/>`)
          .join('') +
        '</g>';
      let gaps = '',
        pores = '';
      for (let t = 8; t < 368; t += 20) {
        const r = (t * Math.PI) / 180,
          x = cx + rx * Math.cos(r),
          y = cy + ry * Math.sin(r),
          qx = Math.cos(r) * 7,
          qy = Math.sin(r) * 7,
          px = -Math.sin(r) * 3.5,
          py = Math.cos(r) * 3.5;
        gaps += `<line class="cd-gap" stroke-width="5" x1="${(x - qx).toFixed(1)}" y1="${(y - qy).toFixed(1)}" x2="${(x + qx).toFixed(1)}" y2="${(y + qy).toFixed(1)}"/>`;
        pores += [1, -1]
          .map(
            (s) =>
              `<line class="${Dr.line('pores')}" stroke-width="2.6" stroke-linecap="round" x1="${(x - qx + s * px).toFixed(1)}" y1="${(y - qy + s * py).toFixed(1)}" x2="${(x + qx + s * px).toFixed(1)}" y2="${(y + qy + s * py).toFixed(1)}"/>`
          )
          .join('');
      }
      g +=
        `<g${Dr.tip('envelope')}><path class="${Dr.line('envelope')}" fill="none" stroke-width="11" d="${body}"/><path ` +
        `class="cd-gap" stroke-width="3" d="${body}"/>${gaps}</g>`;
      g += `<g${Dr.tip('pores')}>${pores}</g>`;
      g += Dr.labels(
        [
          { k: 'pml', side: 'l', x: 390, y: 122 },
          { k: 'bodies', side: 'l', x: 410, y: 166 },
          { k: 'cajal', side: 'l', x: 525, y: 95 },
          { k: 'chromatin', side: 'l', x: 322, y: 160 },
          { k: 'speckles', side: 'l', x: 379, y: 234 },
          { k: 'nucleoplasm', side: 'l', x: 330, y: 312 },
          { k: 'nucleolus', side: 'r', x: 620, y: 190 },
          { k: 'envelope', side: 'r', x: 762, y: 240 },
          { k: 'perinucleolar', side: 'r', x: 606, y: 262 },
          { k: 'paraspeckles', side: 'r', x: 653, y: 287 },
          { k: 'periphery', side: 'r', x: 729, y: 312 },
          { k: 'pores', side: 'r', x: 675, y: 376 },
        ],
        Wd,
        H,
        200
      );
      return { g, W: Wd, H, aria: `The nucleus, each part colored by ${Dr.by()}` };
    },
  };

  // ---- the grids: rows of a layer against its maps ---------------------------------------------------------------------
  // a grid cell in the percent view: the share, its step of the ramp, and its counts on hover
  function pctGridCell(aid, cat, scoped, sc) {
    const c = pctCell(aid, cat, scoped);
    if (!c) return null;
    const ds = DS(aid),
      head = `<b>${esc(ds.name)}</b>${ds.method ? ` (${esc(ds.method)}${ds.cells ? ', ' + esc(ds.cells) : ''})` : ''}: ${esc(label(aid, cat))}<br>`,
      diff = VIEW === 'diff',
      bin = diff ? diffStep(c.share - c.ref, sc.max) : 'p' + pctBin(c.share, sc),
      lead = diff ? `${esc(ptsText(c.share - c.ref))} from all mapped proteins (${esc(pctText(c.ref))}); ` : '';
    return {
      circular: false,
      selected: c.selected,
      tone: c.selected ? 'sel' : bin,
      tcls: diff ? 't' + bin.slice(1) : 'q' + bin.slice(1),
      text: c.selected ? '·' : diff ? ptsText(c.share - c.ref) : pctText(c.share),
      tip: c.selected
        ? head + 'Your selection was made with this set'
        : scoped
          ? `${head}${lead}${esc(pctText(c.share))}: ${int(c.k)} of the ${int(c.M)} proteins here are in your selection<br><span class="muted">Whole site: ${esc(pctText(c.whole))} (${int(c.wk)} of ${int(c.M)}) have at least one ${esc(W.mark)}</span>`
          : `${head}${lead}${esc(pctText(c.share))}: ${int(c.k)} of the ${int(c.M)} proteins here have at least one ${esc(W.mark)}`,
    };
  }
  function gridSvg(L, scoped) {
    const cols = L.cols,
      LW = L.key === 'region' ? 190 : 300,
      CW = 100,
      RH = 24,
      HH = 46,
      Wd = LW + cols.length * CW + 8;
    // the percent view's steps: fifths of its range (with a selection, of the largest share in the grid)
    const gcells = (sc) =>
      L.groups.flatMap(([, rows]) =>
        rows.flatMap((row) => cols.map((aid) => pctCell(aid, row.map[aid], sc)).filter((c) => c && !c.selected))
      );
    const gsc = !pctOn()
      ? null
      : VIEW === 'diff'
        ? { max: Math.max(0, ...gcells(scoped).map((c) => Math.abs(c.share - c.ref))) }
        : pctRange(
            scoped,
            gcells(true).map((c) => c.share)
          );
    let y = HH + 4,
      g = '';
    cols.forEach((aid, i) => {
      const ds = DS(aid),
        x = LW + i * CW + CW / 2;
      g +=
        `<text class="cg-h" x="${x}" y="14" text-anchor="middle">${esc(ds.short)}</text><text class="cg-m" x="${x}" y="28" ` +
        `text-anchor="middle">${esc(ds.method || '')}</text>` +
        (ds.cells ? `<text class="cg-m" x="${x}" y="41" text-anchor="middle">${esc(ds.cells)}</text>` : '');
    });
    L.groups.forEach(([group, rows], gi) => {
      if (L.key !== 'region') {
        g += `<text class="cg-g" x="0" y="${y + 14}">${esc(group.toUpperCase())}</text>`;
        y += RH;
      }
      rows.forEach((row, ri) => {
        g +=
          `<g class="cg-row" data-cell-row="${rowId(L, gi, ri)}" role="button" tabindex="0" aria-label="${esc(
            row.label + ': open its numbers and members'
          )}"><rect class="cg-hit" ` +
          `x="0" y="${y}" width="${Wd}" height="${RH}"/><text class="cg-r" x="10" y="${y + 16}">${esc(row.label)}</text>`;
        cols.forEach((aid, i) => {
          const c = pctOn() ? pctGridCell(aid, row.map[aid], scoped, gsc) : gridCell(aid, row.map[aid], scoped),
            x = LW + i * CW + 4;
          if (!c) {
            g += `<rect class="cg-c na" x="${x}" y="${y + 2}" width="${CW - 8}" height="${RH - 4}" rx="3"/>`;
            return;
          }
          g +=
            `<g${tipAttr(
              c.tip || cellTip(aid, row.map[aid], c, scoped)
            )}><rect class="cg-c ${c.tone}" x="${x}" y="${y + 2}" width="${CW - 8}" height="${RH - 4}" rx="3"/>` +
            `<text class="cg-t ${c.tcls || 't' + c.tone.slice(1)}" x="${x + (CW - 8) / 2}" y="${y + 16}" text-anchor="middle">${esc(c.text ?? (c.circular ? '·' : orText(c.a)))}</text></g>`;
        });
        g += '</g>';
        y += RH;
      });
      y += 6;
    });
    return {
      g,
      W: Wd,
      H: y,
      aria: `${L.key === 'region' ? 'Regions' : 'Compartments'} against maps: ${
        pctOn() ? pctBy(scoped) : 'the fold of ' + who(scoped)
      } in each`,
    };
  }
  const v6 = (u) => (u == null ? '' : Number.isFinite(u) ? String(+u.toFixed(4)) : u > 0 ? 'Inf' : '-Inf');
  // the percent view's table: a row for each compartment and map, as the grid shows it
  function pctTsv(L, scoped) {
    const diff = VIEW === 'diff',
      head =
        (scoped
          ? 'compartment\tmap\tn_proteins\tn_in_selection\tpercent\tn_with_sites\tpercent_with_sites'
          : 'compartment\tmap\tn_proteins\tn_with_sites\tpercent') + (diff ? '\tpoints_from_all_mapped\n' : '\n');
    const pc2 = (s) => (s == null ? '' : String(+(100 * s).toFixed(2)));
    const body = L.groups.flatMap(([, rows]) =>
      rows.flatMap((row) =>
        L.cols
          .map((aid) => [aid, pctCell(aid, row.map[aid], scoped)])
          .filter(([, c]) => c)
          .map(([aid, c]) =>
            [
              ...(scoped
                ? [row.label, DS(aid).name, c.M, c.k, pc2(c.share), c.wk, pc2(c.whole)]
                : [row.label, DS(aid).name, c.M, c.k, pc2(c.share)]),
              ...(diff ? [pc2(c.share - c.ref)] : []),
            ].join('\t')
          )
      )
    );
    return (
      K.preamble(
        `${C.title || 'Where in the cell'}: ${L.key === 'region' ? 'regions' : 'compartments'}, percent of proteins`,
        `${pctSub()} n_proteins: the reviewed proteins the map places in the compartment; ${
          scoped
            ? 'n_in_selection: of them in your selection; n_with_sites: of them with'
            : 'n_with_sites: of them with'
        } at least one ${W.mark}`
      ) +
      head +
      body.join('\n') +
      '\n'
    );
  }
  function gridTsv(L, scoped) {
    if (pctOn()) return pctTsv(L, scoped);
    const head = scoped
      ? 'group\tcompartment\tmap\tmap_category\tmembers\tselected\tselected_placed\tplaced\tlog2_odds_ratio\tlog2_ci_low\tlog2_ci_high\tp\tq\tnot_compared\n'
      : 'group\tcompartment\tmap\tmap_category\tmembers\tmarked\tlog2_fold_enrichment\tq\tlog2_odds_ratio_within_strata\tlog2_ci_low\tlog2_ci_high\tq_within_strata\n';
    const body = L.groups.flatMap(([group, rows]) =>
      rows.flatMap((row) =>
        L.cols
          .filter((aid) => row.map[aid] && T[aid]?.[row.map[aid]])
          .map((aid) => {
            const t = T[aid][row.map[aid]],
              name = DS(aid).name;
            if (!scoped) {
              const at = stratified(aid) ? adj(aid, t) : null,
                a = at && at.test ? { ...at.test, q: at.q } : { l2: null, lo: null, hi: null, q: null };
              return [
                group,
                row.label,
                name,
                row.map[aid],
                t.M,
                t.k,
                v6(L2(t.fold)),
                t.fq ?? '',
                v6(a.l2),
                v6(a.lo),
                v6(a.hi),
                a.q ?? '',
              ].join('\t');
            }
            const x = selTests(aid)?.res.get(row.map[aid]);
            if (!x)
              return [
                group,
                row.label,
                name,
                row.map[aid],
                t.M,
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'no selection data',
              ].join('\t');
            return [
              group,
              row.label,
              name,
              row.map[aid],
              x.M,
              x.k,
              x.n,
              x.N,
              v6(x.a.l2),
              v6(x.a.lo),
              v6(x.a.hi),
              x.a.p ?? '',
              x.a.q ?? '',
              x.circular
                ? x.selected
                  ? 'your selection'
                  : x.k === x.n
                    ? 'every selected protein is here'
                    : 'selection named its proteins or was made with this map'
                : '',
            ].join('\t');
          })
      )
    );
    return (
      K.preamble(
        `${C.title || 'Where in the cell'}: ${L.key === 'region' ? 'regions' : 'compartments'} against maps`,
        `${who(scoped)} in each map, against ${alike}${
          allStrat ? ' (Mantel–Haenszel odds ratio over the abundance strata, BH within each map)' : ''
        }; members: ${here}`
      ) +
      head +
      body.join('\n') +
      '\n'
    );
  }

  // ---- one map at a time: its compartments as bars of the fold enrichment, marked by the comparison within the strata --
  const UI = { map: MAPS[0].analysis, row: null, at: null, all: false };
  const MARK = {
    more: ['✓', 'more than expected'],
    same: ['≈', 'about the same (within 1.1×)'],
    ns: ['○', 'no difference'],
    less: ['▼', 'fewer than expected'],
  };
  const markOf = (a) => {
    if (!a || a.l2 == null || a.q == null) return null;
    if (a.q > PADJ) return 'ns';
    if (Number.isFinite(a.l2) && Math.abs(a.l2) < MINL2) return 'same';
    return a.l2 > 0 ? 'more' : 'less';
  };
  function barRows(aid, scoped) {
    const m = MAP[aid],
      min = m.min_members || 1,
      sel = scoped ? Object.fromEntries((K.sel.rows(aid, 'enricher') || []).map((r) => [r.category, r])) : null;
    return Object.values(T[aid] || {})
      .filter((t) => t.M >= min && t.fold != null)
      .map((t) => {
        const s = sel?.[t.cat],
          x = scoped ? selTests(aid)?.res.get(t.cat) : null;
        const fold = scoped ? (s ? s.fold : null) : t.fold,
          q = scoped ? (s ? s.q : null) : t.fq;
        return {
          cat: t.cat,
          label: label(aid, t.cat),
          t,
          k: scoped ? (s ? s.a : 0) : t.k,
          M: t.M,
          l2: fold ? Math.log2(fold) : null,
          q,
          sig: q != null && q <= PADJ,
          mark: markOf(scoped ? (x && !x.circular ? x.a : null) : adj(aid, t)),
          descriptive: !!s?.descriptive,
          x,
        };
      })
      .sort((a, b) => (b.l2 ?? -99) - (a.l2 ?? -99));
  }
  function barsSvg(aid, scoped) {
    const rows = barRows(aid, scoped),
      LW = 300,
      CW = 80,
      BW = 300,
      RH = 20,
      Wd = LW + CW + BW + 70,
      top = 18;
    const ext = Math.max(
      1,
      Math.ceil(Math.max(...rows.map((r) => (r.l2 == null || !Number.isFinite(r.l2) ? 0 : Math.abs(r.l2))), 0))
    );
    const X = (v) => LW + CW + BW / 2 + (Math.max(-1, Math.min(1, v / ext)) * BW) / 2;
    let g = `<text class="cg-m" x="${LW + CW - 6}" y="12" text-anchor="end">${
      scoped ? 'selected/in map' : W.marked + '/in map'
    }</text>`;
    for (let k = -ext; k <= ext; k++)
      g +=
        `<line class="${k ? 'cb-grid' : 'cb-one'}" x1="${X(k)}" x2="${X(k)}" y1="${top - 4}" y2="${top + rows.length * RH}"/>` +
        (k % (ext > 3 ? 2 : 1) === 0
          ? `<text class="cg-m" ` +
            `x="${X(k)}" y="${top + rows.length * RH + 13}" text-anchor="middle">${2 ** k >= 1 ? 2 ** k : '1/' + 2 ** -k}×</text>`
          : '');
    rows.forEach((r, i) => {
      const y = top + i * RH,
        v = r.l2 == null ? null : Math.max(-ext, Math.min(ext, r.l2)),
        dir = r.l2 == null ? 'ns' : r.sig ? (r.l2 > 0 ? 'more' : 'less') : 'ns';
      const tip =
        `<b>${esc(r.label)}</b> · ${esc(DS(aid).name)}<br>${
          scoped
            ? `${int(r.k)} of the ${int(r.M)} ${esc(here)} ${esc(inWord(true))}`
            : `${int(r.t.k)} of the ${int(r.t.M)} ${esc(here)} ${esc(inWord(false))} (${pc(r.t.k, r.t.M)}%), against ${pc(r.t.n, r.t.N)}% of all ${int(r.t.N)}`
        }` +
        (r.l2 != null
          ? `; ${K.fxn(2 ** r.l2)} times the share, q ${fq(r.q)}${r.descriptive ? ' (shown, not tested)' : ''}`
          : '') +
        (r.mark
          ? `<br>Against ${esc(stratified(aid) ? alike : 'the other proteins the map places')}: ${esc(MARK[r.mark][1])}`
          : '') +
        (`<br><span ` + `class="muted">Click to select the ${esc(W.marks)} on its proteins</span>`);
      g +=
        `<g class="cb-row" data-cell-bar="${esc(r.cat)}" role="button" tabindex="0"${tipAttr(tip)}><rect class="cg-hit" ` +
        `x="0" y="${y}" width="${Wd}" height="${RH}"/><text class="cg-r" x="${LW - 8}" y="${y + 14}" text-anchor="end">${esc(r.label)}</text>` +
        `<text class="cg-m" x="${LW + CW - 6}" y="${y + 14}" text-anchor="end">${int(r.k)}/${int(r.M)}</text>` +
        (v == null
          ? ''
          : `<rect class="cb-bar ${dir}${r.sig ? '' : ' hollow'}" x="${Math.min(X(0), X(v))}" y="${y + 4}" width="${Math.max(1, Math.abs(X(v) - X(0)))}" height="${RH - 8}" rx="2"/>`) +
        `<text class="cb-val ${dir}" x="${X(ext) + 6}" y="${y + 14}">${r.l2 == null ? '–' : K.fx(2 ** r.l2)}${r.mark ? ' ' + MARK[r.mark][0] : ''}</text></g>`;
    });
    return {
      g,
      W: Wd,
      H: top + rows.length * RH + 20,
      aria: `${DS(aid).name}: the fold enrichment of ${who(scoped)} in each ` + `compartment`,
    };
  }
  function barsTsv(aid, scoped) {
    const rows = barRows(aid, scoped);
    return (
      K.preamble(
        `${C.title || 'Where in the cell'}: ${DS(aid).name}`,
        `each compartment holding at least ${MAP[aid].min_members || 1} proteins: ${who(scoped)} assigned there,` +
          ` the fold enrichment against all the proteins the map covers (one-sided hypergeometric, BH)${
            stratified(aid) ? ', and the comparison within the abundance strata (Mantel–Haenszel)' : ''
          }`
      ) +
      'compartment\tname\tmembers\t' +
      (scoped ? 'selected' : 'marked') +
      '\tlog2_fold_enrichment\tq\twithin_strata\n' +
      rows
        .map((r) => [r.cat, r.label, r.M, r.k, v6(r.l2), r.q ?? '', r.mark ? MARK[r.mark][1] : ''].join('\t'))
        .join('\n') +
      '\n'
    );
  }

  // ---- the figures, on the page and exported ---------------------------------------------------------------------------
  const svgOf = (f, cls, role = 'group') =>
    `<svg class="${cls}" viewBox="0 0 ${f.W} ${f.H}" style="max-width:${f.W}px" role="${role}" aria-label="${esc(f.aria)}">${f.g}</svg>`;
  // an export takes the light palette and inline styles (PDF and PNG renderers read no stylesheet)
  const exportVars = () =>
    '--ink:#111827;--ink-2:#374151;--muted:#5f6f78;--line:#e0e8eb;--line-strong:#c7d4d9;--surface:#ffffff;--accent:' +
    K.accent() +
    ';--more:#b42318;--less:#334155;' +
    TONES.light.map(([k, v]) => `--t-${k}:${v};`).join('') +
    seqVars('light');
  function inlined(f) {
    const holder = document.createElement('div');
    holder.className = 'cell-x';
    holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${f.W}px;${exportVars()}`;
    holder.innerHTML = svgOf(f, 'cell-x-svg', 'img');
    document.body.appendChild(holder);
    const PROPS = [
      'fill',
      'fill-opacity',
      'stroke',
      'stroke-width',
      'stroke-opacity',
      'stroke-dasharray',
      'stroke-linecap',
      'stroke-linejoin',
      'opacity',
      'font-size',
      'font-weight',
    ];
    try {
      holder.querySelectorAll('svg *').forEach((n) => {
        if (n.tagName === 'title') return;
        const cs = getComputedStyle(n);
        PROPS.forEach((p) => {
          const v = cs.getPropertyValue(p);
          if (v && !(p === 'stroke-dasharray' && v === 'none') && !(p === 'opacity' && v === '1')) n.setAttribute(p, v);
        });
        [
          'class',
          'data-cell-tip',
          'data-cell-part',
          'data-cell-row',
          'data-cell-bar',
          'role',
          'tabindex',
          'aria-label',
          'style',
        ].forEach((a) => n.removeAttribute(a));
      });
      return holder.firstElementChild.innerHTML;
    } finally {
      holder.remove();
    }
  }
  // the figure of a FIGS entry for the exports: its drawing (or, for a `both` entry, its drawings side by side under one title,
  // summary sentence, color key and credit), through K.figureFrame, which draws the title, key and credit the same for every figure
  function exported(F) {
    const note = F.note?.() || `${keyWords()} ${testWords()}`,
      list = F.both ? F.both() : [{ make: F.make }],
      made = list.map((x) => x.make()),
      G = 24,
      s = F.both ? Math.min(1, 800 / Math.max(...made.map((f) => f.W))) : Math.min(1, 1000 / made[0].W),
      cw = Math.round(Math.max(...made.map((f) => f.W)) * s),
      head = F.both ? 22 : 0;
    const body = made
      .map(
        (f, i) =>
          (F.both
            ? `<text x="${20 + i * (cw + G)}" y="14" font-size="13" font-weight="700" fill="${K.PAL.ink}">${esc(list[i].caption)}</text>`
            : '') + `<g transform="translate(${20 + i * (cw + G)},${head}) scale(${s})">${inlined(f)}</g>`
      )
      .join('');
    return K.figureFrame({
      title: F.title(),
      sub: F.sub(),
      lead: F.lead?.(),
      legend: F.legend?.(),
      W: 40 + made.length * cw + (made.length - 1) * G,
      body,
      bodyH: head + Math.max(...made.map((f) => f.H)) * s,
      note,
      extra: { question: ID },
    });
  }
  const pctSub = () =>
    VIEW === 'diff'
      ? `Difference, in points, between each part's share of proteins ${scopedNow() ? 'in your selection' : `with at least one ${W.mark}`} and the share among all the proteins the maps place; the median of the maps that have the part.`
      : scopedNow()
        ? `Percent of each part's proteins that are in your selection, among the reviewed proteins each map places there; the median of the maps that have the part.`
        : `Percent of each part's proteins with at least one ${W.mark}, among the reviewed proteins each map places there; the median of the maps that have the part.`;
  const keyWords = () =>
    VIEW === 'diff'
      ? `Red: the part's share of proteins ${scopedNow() ? 'in your selection' : `with at least one ${W.mark}`} is above the share among all the proteins the maps place (${pctText(
          pctRef(scopedNow())
        )}). Slate: below it, deeper for larger differences (the steps are quarters of the largest, ${ptsText(
          parts(scopedNow(), 'diff').range.max
        ).replace(/^\+/, '')}). Gray: within half a point. Dashed outline: no map measures it.`
      : pctOn()
        ? `Blue: the share of a part's proteins ${scopedNow() ? 'that are in your selection' : `with at least one ${W.mark}`}, darker for a larger share${
            scopedNow() ? ' (the steps are fifths of the largest share)' : ''
          }.${(() => {
            const r = parts(scopedNow(), pv()).range;
            return r.lo > 0 ? ` The scale starts at ${pctText(r.lo)}, not 0.` : '';
          })()} Tick: the share among all the proteins the maps place. Dashed outline: no map measures it.`
        : `Red: ${who(scopedNow())} are more likely to be found there than ${alike}. Slate: less ` +
          `likely, deeper for larger folds. Gray: no difference, the maps disagree, fewer than ${READ.min_maps} maps ` +
          `agree, or too few proteins. Dashed outline: no map measures it.`;
  const testWords = (view = pctOn() ? 'percent' : 'fold') =>
    view === 'percent'
      ? `A protein counts as having a ${W.mark} when it has at least one. Each map's proteins are the reviewed proteins it places; a part takes the median of the maps that have it. This view makes no test.`
      : (allStrat
          ? `In each map, the fold: the share of ${who(scopedNow())} placed in the part over the share of all the ` +
            `proteins the map places; tested against ${alike} (Mantel–Haenszel across the abundance strata, ` +
            `continuity-corrected Cochran–Mantel–Haenszel test, Benjamini–Hochberg within the map), colored at q ≤ ${PADJ} ` +
            `and a fold of 1.1× or more.`
          : `In each map, the fold against the other proteins the map places (one-sided hypergeometric test, ` +
            `Benjamini–Hochberg within the map), colored at q ≤ ${PADJ} and 1.1× or more.`) +
        ` A map with fewer than ${READ.min_group} ${W.marked} or other proteins in a part is not colored there. A part takes ` +
        `the median fold of the maps that have it, colored only when at least ${READ.min_maps} of them find a difference ` +
        `the same way and none the other way.`;
  const FIGS = {
    regions: {
      title: () => `${C.title || 'Where in the cell'}: regions against maps`,
      sub: () =>
        pctOn() ? pctSub() : `The fold of ${who(scopedNow())} against ${alike}, for each ` + `region in each map.`,
      make: () => gridSvg(LAYERS.region, scopedNow()),
      tsv: () => gridTsv(LAYERS.region, scopedNow()),
    },
    grid: {
      title: () => `${C.title || 'Where in the cell'}: compartments against maps`,
      sub: () =>
        pctOn() ? pctSub() : `The fold of ${who(scopedNow())} against ${alike}, for each ` + `compartment in each map.`,
      make: () => gridSvg(LAYERS.part, scopedNow()),
      tsv: () => gridTsv(LAYERS.part, scopedNow()),
    },
    one: {
      title: () => `${C.title || 'Where in the cell'}: ${DS(UI.map).name}`,
      sub: () => {
        const d = DS(UI.map),
          at = [d.ref, d.cells].filter(Boolean).join(', ');
        return `${d.name}${at ? ' (' + at + ')' : ''}${d.how ? ': ' + d.how : ''}`;
      },
      make: () => barsSvg(UI.map, scopedNow()),
      tsv: () => barsTsv(UI.map, scopedNow()),
      note: () =>
        `Bars: share of ${who(scopedNow())} among the ${here} over their share of all the proteins the ` +
        `map places (log2), filled at q ≤ ${PADJ}. Marks: the same against ${alike} (✓ more likely, ≈ about the ` +
        `same, ○ no difference, ▼ less likely).`,
    },
  };
  DRAWINGS.forEach((d) => {
    FIGS[d.drawing] = {
      title: () => `${C.title || 'Where in the cell'}${d.title ? ': ' + d.title.replace(/^The /, 'the ') : ''}`,
      sub: () =>
        pctOn()
          ? pctSub()
          : `Fold of ${who(scopedNow())} against ${alike}, as the ` + `median of the maps that have each part.`,
      make: (view) => DRAW[d.drawing](scopedNow(), view),
      tsv: () => gridTsv(LAYERS.part, scopedNow()),
      zoom: d.drawing,
      lead: () => {
        const sc = scopedNow(),
          { regs, up } = summaries(sc),
          box = document.createElement('div');
        box.innerHTML = cellAnswer(regs, up, sc);
        return box.textContent;
      },
      legend: () => colourLegend(),
    };
  });
  // both drawings in one figure: the cell and the nucleus side by side, the card's default download. It takes the title (made
  // of the drawings' names), summary sentence, color key, note and table of the first drawing's entry, which are the same for all
  const bothOf = (pre) => {
    const first = () => FIGS[pre + DRAWINGS[0].drawing];
    return {
      title: () =>
        `${C.title || 'Where in the cell'}: ${and(
          DRAWINGS.map((d) => (d.title ? d.title.replace(/^The /, 'the ') : 'the ' + d.drawing))
        )}`,
      sub: () => first().sub(),
      lead: () => first().lead?.(),
      legend: () => first().legend?.(),
      note: () => first().note?.(),
      tsv: () => first().tsv(),
      both: () =>
        DRAWINGS.map((d) => ({ caption: d.title || cap(d.drawing), make: () => FIGS[pre + d.drawing].make() })),
    };
  };
  if (DRAWINGS.length > 1) FIGS.both = bothOf('');
  // the buttons of the Both choice (every format), first in a card's bar
  const bothButtons = (fig, kinds = ['pdf', 'svg', 'png']) =>
    kinds
      .map(
        (k) =>
          `<button type="button" class="exp-btn" data-cell-exp="${k}" data-cell-fig="${fig}" title="${esc(
            K.EXP_HELP[k]
          )} Both drawings, side by side.">Both ${k.toUpperCase()}</button>`
      )
      .join('');
  // ---- for another page's card: the drawings and the parts' values, without the cell page ----------------------------------
  // K.cell.list() the drawings [{ drawing, title, parts, crop }]; K.cell.parts(scoped?) every part a row colors, with its value
  // [{ part, drawings, row, id, tone, direction, value, l2, or, maps, cells }] ('more', 'less', 'ns' or 'na'; the median of the maps
  // that have it, and each map's own); K.cell.draw(el, drawing, { scoped, crop, labels, onPart }) draws a drawing into el as the page does
  // (crop: true for the kit's phone crop of it, or [x, y, w, h]; labels: false leaves out the leader-line labels; onPart(part, info)
  // takes a click or Enter on a part in place of opening the cell page) and returns { drawing, W, H, parts }. Hover texts are kept
  // for the last drawing made, so a page draws the cell once at a time.
  const crops = D.cell_crops || {};
  const toneDir = (tn) => (tn[0] === 'u' ? 'more' : tn[0] === 'd' ? 'less' : tn);
  function pctValues(scoped = scopedNow()) {
    const { P } = parts(scoped, pv());
    return Object.entries(P).map(([part, p]) => ({
      part,
      drawings: DRAWINGS.filter((d) => PARTS[d.drawing].includes(part)).map((d) => d.drawing),
      row: rowName(p.row),
      id: p.id,
      tone: p.tone,
      share: p.share,
      n: p.n,
      whole: p.whole,
      value: p.value,
      selected: !!p.selected,
      maps: p.cells.length,
    }));
  }
  function partValues(scoped = scopedNow()) {
    const { P } = parts(scoped, 'fold');
    return Object.entries(P).map(([part, p]) => ({
      part,
      drawings: DRAWINGS.filter((d) => PARTS[d.drawing].includes(part)).map((d) => d.drawing),
      row: rowName(p.row),
      id: p.id,
      tone: p.tone,
      direction: toneDir(p.tone),
      value: p.value,
      selected: !!p.selected,
      l2: p.a?.l2 ?? null,
      or: p.a?.l2 == null ? null : 2 ** p.a.l2,
      maps: p.cells.filter(([, c]) => !c.circular).length,
      cells: p.cells
        .filter(([, c]) => !c.circular)
        .map(([aid, c]) => ({ map: aid, name: DS(aid).name, l2: c.a.l2 ?? null, q: c.a.q ?? null, tone: c.tone })),
    }));
  }
  function drawInto(el, drawing, o = {}) {
    if (o.one) return withOne(o.one, () => drawInto(el, drawing, { ...o, one: null, scoped: false, noInfo: true }));
    const d = DRAWINGS.find((x) => x.drawing === (drawing || DRAWINGS[0]?.drawing));
    if (!el || !d || !DRAW[d.drawing]) return null;
    const scoped = o.scoped ?? scopedNow();
    if (!o.keep) TIPS = [];
    const f = DRAW[d.drawing](scoped, o.view);
    el.innerHTML = svgOf(f, 'cell-svg cell-' + d.drawing);
    const sv = el.firstElementChild,
      crop = o.crop === true ? crops[d.drawing] : Array.isArray(o.crop) ? o.crop : null;
    if (crop) {
      sv.setAttribute('viewBox', crop.join(' '));
      sv.style.maxWidth = crop[2] + 'px';
    }
    if (o.labels === false) sv.querySelectorAll('.cd-label').forEach((n) => n.remove());
    const info = o.noInfo ? {} : Object.fromEntries(partValues(scoped).map((x) => [x.part, x]));
    if (el._cellOnPart) el.removeEventListener('click', el._cellOnPart, true);
    el._cellOnPart = o.onPart
      ? (e) => {
          const g = e.target.closest?.('[data-cell-part]');
          if (!g) return;
          e.stopPropagation();
          o.onPart(g.dataset.cellPart, info[g.dataset.cellPart] || null);
        }
      : null;
    if (el._cellOnPart) el.addEventListener('click', el._cellOnPart, true);
    tabOrder(sv);
    requestAnimationFrame(grow);
    return {
      drawing: d.drawing,
      W: f.W,
      H: f.H,
      parts: Object.values(info).filter((x) => x.drawings.includes(d.drawing)),
    };
  }
  // the keyboard order of a drawing's parts: one stop for each part (a part drawn in several shapes keeps its first), and Tab
  // goes down the drawing by the place of each part's label (its shape when it has none), not in the order the shapes were drawn
  function tabOrder(sv) {
    if (!sv || sv._tabOrder) return;
    sv._tabOrder = true;
    const seen = new Set(),
      stops = [];
    sv.querySelectorAll('[data-cell-part][tabindex="0"]').forEach((g) => {
      const k = g.dataset.cellPart;
      if (seen.has(k)) {
        g.setAttribute('tabindex', '-1');
        g.setAttribute('aria-hidden', 'true');
      } else {
        seen.add(k);
        stops.push(g);
      }
    });
    const labs = [...sv.querySelectorAll('.cd-label[data-cell-part]')],
      place = (g) => {
        const l = labs.find((x) => x.dataset.cellPart === g.dataset.cellPart) || g,
          r0 = (l.querySelector('.cd-name') || l).getBoundingClientRect(),
          r = r0.width || r0.height ? r0 : g.getBoundingClientRect();
        return [Math.round(r.top), r.left];
      };
    const sorted = () =>
      stops
        .map((g) => [g, place(g)])
        .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1])
        .map((x) => x[0]);
    if (stops.length < 2) return;
    stops.forEach((g) => g.setAttribute('tabindex', '-1'));
    const first = () => {
      const l = sorted();
      stops.forEach((g) => g.setAttribute('tabindex', g === l[0] ? '0' : '-1'));
      return l;
    };
    requestAnimationFrame(first);
    sv.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
      const l = sorted(),
        i = l.indexOf(e.target.closest('[data-cell-part]')),
        j = i + (e.shiftKey ? -1 : 1);
      if (i < 0 || j < 0 || j >= l.length) return;
      e.preventDefault();
      l[j].focus();
    });
  }
  K.filterKinds = {
    ...(K.filterKinds || {}),
    w: {
      valid: (id) => id === ID,
      label: () => (D.front?.cards || []).find((c) => c.cell)?.chip || C.title || 'Where in the cell',
      value: (id, v) => partName(v),
      owned: (id, vals) => vals.flatMap(partPairs),
      tip: (id, vals) => `The proteins that at least one of ${MAPS.length} maps places in ${and(vals.map(partName))}`,
      test: (id, vals) => {
        const pairs = vals.flatMap(partPairs);
        return (m) => pairs.some(([a, s]) => K.sel.setHas(a, s, m[0]));
      },
    },
  };
  Object.assign(K.cell, {
    partName,
    list: () =>
      DRAWINGS.map((d) => ({
        drawing: d.drawing,
        title: d.title || d.drawing,
        parts: PARTS[d.drawing],
        crop: crops[d.drawing] || null,
      })),
    parts: partValues,
    // the one-line answer as the tile shows it (html)
    // the share of each part's proteins with a mark (in the selection): [{ part, row, tone, share, n, whole, value, maps }]
    percent: pctValues,
    // the percent view's ramp: { lo, hi } as shares
    percentRange: (scoped = scopedNow()) => parts(scoped, 'percent').range,
    differenceRange: (scoped = scopedNow()) => parts(scoped, 'diff').range,
    answer: (scoped = scopedNow(), view = 'fold') => {
      const { regs, up } = summaries(scoped, 'fold');
      return cellAnswer(regs, up, scoped, view);
    },
    draw: drawInto,
  });

  const figName = (k) => `${D.site.id}_${ID}_${k === 'one' ? UI.map : k}`;
  // a drawing's export bar: with two drawings, the Both choice first and the others named by their drawing
  const dualBar = (bar, k) => {
    const both = k.startsWith('p-') ? 'p-both' : 'both',
      dual = DRAWINGS.length > 1 && FIGS[k].zoom && FIGS[both];
    bar = bar.replace(/data-cell-exp="(\w+)"/g, `data-cell-exp="$1" data-cell-fig="${k}"`);
    return dual
      ? bar
          .replace(/(data-cell-exp="(?:pdf|svg|png)"[^>]*>)([A-Z]+)</g, (m0, a, t) => `${a}${cap(FIGS[k].zoom)} ${t}<`)
          .replace(/(<div class="exp"[^>]*>)/, '$1' + bothButtons(both))
      : bar;
  };
  const block = (k, head, cls) =>
    `<div class="cell-block ${cls}" id="cell-${k}"><div class="fig-head"><span ` +
    `class="flabel">${esc(head)}</span>${
      FIGS[k].zoom
        ? `<button type="button" class="btn small cell-zoom-btn" ` +
          `data-cell-zoom="${esc(FIGS[k].zoom)}"${
            FIGS[k].one ? ` data-i="${FIGS[k].one.i}"` : ''
          } title="Open the ${esc(FIGS[k].zoom)} large, to ` +
          `read its labels, zoom and move">Enlarge</button>`
        : ''
    }${dualBar(K.expBar(['pdf', 'svg', 'png', 'tsv'], 'cell-exp', head, ID), k)}</div>` +
    `<div class="cell-scroll">${svgOf(FIGS[k].make(), 'cell-svg cell-' + k)}</div></div>`;

  // ---- the tile and the page --------------------------------------------------------------------------------------------
  function summaries(scoped, view) {
    const regs = LAYERS.region.groups.length
      ? LAYERS.region.groups[0][1].map((row) => rowSummary(LAYERS.region, row, scoped))
      : [];
    const { P } = parts(scoped, view === 'fold' ? 'fold' : undefined);
    const up = Object.values(P)
      .filter((p) => p.L === LAYERS.part && p.tone[0] === 'u')
      .sort((a, b) => b.a.l2 - a.a.l2);
    return { regs, up };
  }
  // The one-line answer for a selection made with a part of the drawings: that part is left out, and the rest says where else the
  // selection's proteins are found (significant parts only, the largest first). Null when no part is the selection's.
  function selLead(scoped, short) {
    if (!scoped) return null;
    const { P } = parts(true),
      mine = Object.values(P).filter((p) => p.selected);
    if (!mine.length) return null;
    const name = and(mine.map((p) => esc(inText(p.row)))),
      it = (x) => `<b>${esc(inText(x.row))}</b>${short ? '' : ` (${esc(orText(x.a))})`}`,
      rest = Object.values(P).filter((p) => p.L === LAYERS.part && !p.selected),
      more = rest.filter((p) => p.tone[0] === 'u').sort((a, b) => b.a.l2 - a.a.l2),
      less = rest.filter((p) => p.tone[0] === 'd').sort((a, b) => a.a.l2 - b.a.l2);
    const top = (xs) => and(xs.slice(0, 3).map(it));
    if (!more.length && !less.length)
      return `Apart from ${name}, no part differs from ${esc(alike)} in at least ${READ.min_maps} maps.`;
    return (
      `Proteins at ${name} are also ` +
      [more.length ? 'more often in ' + top(more) : '', less.length ? 'less often in ' + top(less) : '']
        .filter(Boolean)
        .join('; ') +
      '.'
    );
  }
  // no region differs: tested and none found in enough maps, or nothing compared at all (a selection that names its
  // proteins, or one made with these maps), which says nothing about where they are
  const noneWords = (regs, scoped) =>
    regs.every((x) => x.tone === 'na' || x.tone === 'sel')
      ? scoped
        ? 'Not compared: your selection names its proteins or was made with these maps.'
        : 'Not compared.'
      : `No region differs from ${esc(alike)} in at least ${READ.min_maps} maps.`;
  function lead(regs, up, scoped, short) {
    if (pctOn() && !short) return pctAnswer(scoped);
    const sl = selLead(scoped, short);
    if (sl) return sl;
    const num = (x) => (short ? '' : ` (${esc(orText(x.a))})`),
      onePart = (x) => `<b>${esc(inText(x.row))}</b>${num(x)}`,
      one = (x) => `<b>${esc(inText(x.row))}</b> overall${num(x)}`;
    const more = regs.filter((x) => x.tone[0] === 'u').sort((a, b) => b.a.l2 - a.a.l2),
      less = regs.filter((x) => x.tone[0] === 'd').sort((a, b) => a.a.l2 - b.a.l2);
    const none = `${cap(who(scoped))} are not enriched in any part of the cell.`;
    if (short) {
      if (more.length || less.length)
        return (
          cap(
            (more.length ? 'more often in ' + and(more.map(one)) : '') +
              (more.length && less.length ? '. Less in ' : less.length ? 'less often in ' : '') +
              and(less.map(one))
          ) + '.'
        );
      return regs.length
        ? noneWords(regs, scoped)
        : up.length
          ? `Most of all in ${and(up.slice(0, 3).map(onePart))}.`
          : none;
    }
    let t =
      more.length || less.length
        ? `${cap(who(scoped))} are found ${more.length ? 'more often in ' + and(more.map(one)) : ''}${
            more.length && less.length ? ', and ' : ''
          }${less.length ? 'less often in ' + and(less.map(one)) : ''} than ${esc(alike)}${
            regs.some((x) => x.cells.length > 1) ? ' (the median of the maps)' : ''
          }`
        : regs.length
          ? noneWords(regs, scoped).replace(/\.$/, '')
          : '';
    const most = up.slice(0, 3).map(onePart);
    if (most.length)
      t += t ? `. Most of all in ${and(most)}` : `${cap(who(scoped))} are most ` + `enriched in ${and(most)}`;
    return t ? t + '.' : none;
  }
  // a forest of rows on one log2 axis, in the kit's tile look; each row's hover gives its maps
  function forest(items) {
    if (!items.length) return '';
    const vals = items
      .filter((x) => !x.head)
      .map((x) => x.a.l2)
      .filter((v) => v != null && Number.isFinite(v));
    const lo = Math.min(-1, Math.max(-4, Math.floor(Math.min(...vals)))),
      hi = Math.max(1, Math.min(6, Math.ceil(Math.max(...vals))));
    const X = (v) => (((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100).toFixed(2) + '%';
    const grid = [];
    for (let k = lo; k <= hi; k++)
      grid.push(`<line class="${k === 0 ? 'one' : 'grid'}" x1="${X(k)}" x2="${X(k)}" y1="0" ` + `y2="100%"/>`);
    return (
      items
        .map((x) => {
          if (x.head) return `<div class="cell-thead">${esc(x.head)}</div>`;
          const d = dirOf(x.tone),
            l2 = x.a.l2 == null ? null : Number.isFinite(x.a.l2) ? x.a.l2 : x.a.l2 > 0 ? hi : lo;
          return (
            `<div class="trow"${tipAttr(x.tip)}><span class="lab">${esc(x.name)}</span><svg aria-hidden="true">${grid.join('')}` +
            (l2 == null ? '' : `<circle class="dot ${d}" cx="${X(l2)}" cy="50%" r="4.6"/>`) +
            `</svg><span class="val ${d}">${esc(x.a.l2 == null ? '–' : orText(x.a))}</span></div>`
          );
        })
        .join('') +
      (`<div class="taxis"><span></span><span class="one-lab" style="--x:${X(0)}">1×</span><span></span>` + `</div>`) +
      (K.LESS_MORE || '')
    );
  }
  const sumTip = (x, scoped) =>
    `<b>${esc(rowName(x.row))}</b><br>${esc(cap(who(scoped)))} against ${esc(alike)}${
      x.cells.length > 1 ? ', the median of ' + esc(x.maps) : ''
    }:<br>` +
    x.cells
      .map(
        ([aid, c]) =>
          esc(DS(aid).name) +
          ' ' +
          (c.circular
            ? c.selected
              ? 'your selection'
              : 'not compared'
            : esc(orText(c.a)) + (c.a.q != null ? ', q ' + fq(c.a.q) : ''))
      )
      .join('<br>');
  // ---- the Overview's first tile (a card with drawing: true): the cell and the nucleus side by side, drawn when the page is,
  // their parts clickable to select their proteins, the one-line answer, and the parts that differ most as two short lists.
  // A phone gets the drawings without their side labels, cropped to fit, and one list for each ---------------------------------
  const narrow = () => matchMedia('(max-width: 700px)').matches;
  const pname = (x) => (x.part ? partName(x.part) : rowName(x.row));
  // the percent view's sentence, made from the parts' shares: how many parts have a mark on more than half their proteins,
  // and the parts at both ends (parts of at least min_group proteins; with a selection, the share of each part in it)
  function pctAnswer(scoped) {
    const rows = Object.values(parts(scoped, pv()).P)
      .filter((p) => p.L === LAYERS.part && !p.selected && p.share != null && p.n >= READ.min_group)
      .sort((a, b) => b.share - a.share);
    const it = (p) => `${inText(p.row)} (${pctText(p.share)})`;
    if (!rows.length) return `No part of the cell holds ${READ.min_group} or more proteins in these maps.`;
    if (VIEW === 'diff') {
      const ref = pctRef(scoped),
        d = (p) => p.share - ref,
        it2 = (p) => `${inText(p.row)} (${ptsText(d(p))})`,
        up = rows.filter((p) => d(p) > 0.0005).slice(0, 2),
        down = rows
          .filter((p) => d(p) < -0.0005)
          .slice(-2)
          .reverse();
      return (
        (scoped
          ? `${pctText(ref)} of mapped proteins are in the selection; `
          : `${pctText(ref)} of mapped proteins carry ${/^[aeiou]/i.test(W.mark) ? 'an' : 'a'} ${W.mark}; `) +
        (up.length || down.length
          ? [
              up.length ? `${and(up.map(it2))} the furthest above that` : '',
              down.length ? `${and(down.map(it2))} the furthest below` : '',
            ]
              .filter(Boolean)
              .join(', ') + '.'
          : 'no part differs from that by half a point or more.')
      );
    }
    if (scoped) {
      const top = rows.slice(0, 2),
        last = rows.length > 2 ? rows[rows.length - 1] : null;
      return (
        `Of the proteins in each part of the cell, the largest share is in your selection for ${and(top.map(it))}` +
        (last ? `, the smallest for ${it(last)}.` : '.')
      );
    }
    if (rows.length === 1)
      return `${cap(inText(rows[0].row))}: ${pctText(rows[0].share)} of its proteins have a ${W.mark}.`;

    // a mark on 80% or more of the mapped proteins: the overall share, and the parts that fall furthest below it
    const ref = pctRef(false);
    if (ref != null && ref >= 0.8)
      return (
        `${ref >= 0.95 ? 'Nearly every mapped protein carries' : 'Most mapped proteins carry'} ${/^[aeiou]/i.test(W.mark) ? 'an' : 'a'} ` +
        `${W.mark} (${pctText(ref)}); ${and(rows.slice(-2).reverse().map(it))} the fewest.`
      );
    const n = rows.length,
      above = rows.filter((p) => p.share > 0.5).length,
      lead =
        above === n
          ? 'Every compartment has'
          : above * 2 > n
            ? 'Most compartments have'
            : above === 0
              ? 'No compartment has'
              : above * 2 === n
                ? 'Half of the compartments have'
                : 'Fewer than half of the compartments have',
      top = rows.slice(0, 2);
    return (
      `${lead} ${W.marks} on more than half ${above === n || above === 0 ? 'its' : 'their'} proteins; ` +
      `${and(top.map(it))} the most, ${it(rows[n - 1])} the least.`
    );
  }
  function cellAnswer(regs, up, scoped, view = pctOn() ? pv() : 'fold') {
    if (view !== 'fold') return pctAnswer(scoped);
    const sl = selLead(scoped, false);
    if (sl) return sl;
    const one = (x) => `<b>${esc(inText(x.row))}</b> overall (${esc(orText(x.a))})`,
      onePart = (x) => `<b>${esc(inText(x.row))}</b> (${esc(orText(x.a))})`;
    const more = regs.filter((x) => x.tone[0] === 'u').sort((a, b) => b.a.l2 - a.a.l2),
      less = regs.filter((x) => x.tone[0] === 'd').sort((a, b) => a.a.l2 - b.a.l2),
      most = up.slice(0, 3);
    const t = [
      more.length || most.length
        ? `${more.length ? 'More often in ' + and(more.map(one)) : ''}${
            more.length && most.length ? '; most of all in ' : most.length ? 'Most of all in ' : ''
          }${and(most.map(onePart))}`
        : '',
      less.length ? `${more.length || most.length ? 'Less in ' : 'Less often in '}${and(less.map(one))}` : '',
    ]
      .filter(Boolean)
      .join('. ');
    return t
      ? t + '.'
      : regs.length
        ? noneWords(regs, scoped)
        : `${cap(who(scoped))} are not ` + `enriched in any part of the cell.`;
  }
  // the percent view's list: the parts with the largest shares, each selecting its proteins
  function partListPct(d, ps) {
    const ref = pctRef(scopedNow()),
      on = new Set(S.f['w:' + ID] || []),
      mine = ps.filter((p) => p.drawings.includes(d.drawing) && p.selected),
      top = ps
        .filter((p) => p.drawings.includes(d.drawing) && !p.selected && p.share != null)
        .sort((x, y) => (VIEW === 'diff' ? Math.abs(y.share - ref) - Math.abs(x.share - ref) : y.share - x.share))
        .slice(0, 6);
    return (
      `<section class="cp-col"><h4>${esc(d.title || cap(d.drawing))}</h4><ul class="cp-list">` +
      mine
        .map(
          (p) =>
            `<li><button type="button" class="cp-row on" data-cell-sel="${esc(p.part)}" aria-pressed="true" title="Your selection: ` +
            `the ${esc(W.marks)} of ${esc(pname(p))}. Click to remove it">` +
            `<i class="kd sel"></i><span class="cp-n">${esc(pname(p))}</span><span class="sel-pill">Your selection</span></button></li>`
        )
        .join('') +
      top
        .map(
          (p) =>
            `<li><button type="button" class="cp-row${on.has(p.part) ? ' on' : ''}" data-cell-sel="${esc(p.part)}" aria-pressed="${on.has(p.part)}" title="Select ` +
            `the ${esc(W.marks)} of ${esc(pname(p))}: ${esc(p.value)}">` +
            `<i class="kd ${p.tone}"></i><span class="cp-n">${esc(pname(p))}</span><b>${esc(VIEW === 'diff' ? ptsText(p.share - ref) : pctText(p.share))}</b></button></li>`
        )
        .join('') +
      '</ul></section>'
    );
  }
  function partList(d, ps) {
    if (pctOn()) return partListPct(d, ps);
    const on = new Set(S.f['w:' + ID] || []);
    const mine = ps.filter((p) => p.drawings.includes(d.drawing) && p.selected);
    const rows = ps.filter((p) => p.drawings.includes(d.drawing) && p.or != null && p.direction !== 'na');
    const top = (rows.filter((p) => p.maps >= 2).length >= 4 ? rows.filter((p) => p.maps >= 2) : rows)
      .sort(
        (x, y) => (y.direction === 'ns' ? 0 : 1) - (x.direction === 'ns' ? 0 : 1) || Math.abs(y.l2) - Math.abs(x.l2)
      )
      .slice(0, 6);
    return (
      `<section class="cp-col"><h4>${esc(d.title || cap(d.drawing))}</h4><ul ` +
      `class="cp-list">` +
      mine
        .map(
          (p) =>
            `<li><button type="button" class="cp-row on" data-cell-sel="${esc(p.part)}" aria-pressed="true" title="Your selection: ` +
            `the ${esc(W.marks)} of ${esc(pname(p))}. Click to remove it; it is not compared with itself">` +
            `<i class="kd sel"></i><span class="cp-n">${esc(pname(p))}</span><span class="sel-pill">Your selection</span></button></li>`
        )
        .join('') +
      top
        .map(
          (p) =>
            `<li><button type="button" class="cp-row${on.has(p.part) ? ' on' : ''}" data-cell-sel="${esc(p.part)}" aria-pressed="${on.has(p.part)}" title="Select ` +
            `the ${esc(W.marks)} of ${esc(pname(p))}: fold ${esc(fxv(p.or))}, the median of ${p.maps} map${p.maps === 1 ? '' : 's'}">` +
            (`<i class="kd ${p.direction === 'more' ? 'more' : p.direction === 'less' ? 'less' : 'ns'}"></i><span ` +
              `class="cp-n">${esc(pname(p))}</span>${
                p.direction === 'ns'
                  ? '<b class="muted" title="not significant (q above 0.05 or under 1.1×)">n.s.</b>'
                  : `<b>${esc(fxv(p.or))}×</b>`
              }</button></li>`)
        )
        .join('') +
      '</ul></section>'
    );
  }
  // the maps behind each odds ratio of the tile: a region or part takes the median of the maps that have it
  function mapsUsed(scoped) {
    const ns = Object.values(parts(scoped).P)
      .map((p) => p.maps)
      .filter((n) => n > 0);
    if (!ns.length) return 'median of the maps';
    const lo = Math.min(...ns),
      hi = Math.max(...ns);
    return lo === hi ? `median of ${lo} map${lo === 1 ? '' : 's'}` : `median of ${lo} to ${hi} maps`;
  }
  function bigTile(card) {
    TIPS = [];
    const scoped = scopedNow(),
      { regs, up } = summaries(scoped),
      ps = pctOn() ? pctValues(scoped) : partValues(scoped);
    const title = card.title || C.title || 'Where in the cell';
    const note =
      K.selOn() && !scoped
        ? `<p class="twhole"><span>Whole dataset</span> ${
            K.vsOn()
              ? 'the maps compare proteins, not marks: shown for all ' + esc(W.marked) + ' proteins'
              : 'the selection is too small to test'
          }</p>`
        : '';
    const figs = DRAWINGS.map(
      (d) =>
        `<figure class="cell-fig"><figcaption class="vh">${esc(d.title || cap(d.drawing))}</figcaption>` +
        `<div class="cell-draw" data-cell-draw="${esc(d.drawing)}" role="group" aria-label="${esc(d.title || d.drawing)}"></div><button ` +
        `type="button" class="btn quiet small cell-zoom-btn" data-cell-zoom="${esc(d.drawing)}" title="Open the ${esc(d.drawing)} large, to ` +
        `read its labels, zoom and move">Enlarge the ${esc(d.drawing)}</button></figure>`
    ).join('');
    const kinds = ['pdf', 'svg', 'png'],
      bar = K.tilekit
        .dlMenu(title, [], 'cell-exp', ID)
        .replace(
          /(<div class="exp fr-exp"[^>]*>)/,
          '$1' +
            (DRAWINGS.length > 1 ? bothButtons('both') : '') +
            DRAWINGS.map((d) =>
              kinds
                .map(
                  (k) =>
                    `<button type="button" ` +
                    `class="exp-btn" data-cell-exp="${k}" data-cell-fig="${esc(d.drawing)}" title="${esc(K.EXP_HELP[k])}">${esc(cap(d.drawing))} ${k.toUpperCase()}</button>`
                )
                .join('')
            ).join('') +
            `<button type="button" class="exp-btn" data-cell-exp="tsv" data-cell-fig="${esc(DRAWINGS[0].drawing)}" title="${esc(K.EXP_HELP.tsv)}">TSV</button>`
        );
    return (
      `<article class="tile wide cell-tile" id="tile-${esc(ID)}" data-tile="${esc(ID)}" tabindex="0"><header>` +
      `<h3>${esc(title)}</h3>${K.detailsLink(ID)}</header>` +
      (HAS_PCT ? `<div class="cell-viewbar">${viewSwitch()}</div>` : '') +
      `<p class="tans cell-ans">${cellAnswer(regs, up, scoped)}</p><div class="cell-pair">${figs}</div>` +
      `<div class="cp-cols">${DRAWINGS.map((d) => partList(d, ps)).join('')}</div>` +
      (pctOn()
        ? pctKey(scoped).replace('class="key', 'class="tkey key')
        : `<p class="tkey">Fold against ${esc(alike)}, ${mapsUsed(scoped)}; colored where at least ${READ.min_maps} agree.</p>`) +
      `${note}<div class="tact">${bar}</div></article>`
    );
  }
  // the switch on every map of the cell: the share of proteins with a mark, or the fold against the other proteins
  const viewSwitch = () =>
    HAS_PCT
      ? `<span class="seg cell-view" role="group" aria-label="What the colors show">${[
          ['percent', 'Percent with sites'],
          ['diff', 'Difference from all mapped proteins'],
          ['fold', 'Fold vs other proteins'],
        ]
          .map(([k, w]) => `<button type="button" data-cellview="${k}" aria-pressed="${VIEW === k}">${w}</button>`)
          .join('')}</span>`
      : '';
  const toggle = (part) => {
    const t = document.getElementById('tip');
    if (t) t.hidden = true;
    K.sel.toggle('w:' + ID, part);
  };

  // ---- the large view: the drawing in a dialog at full size, zoom and pan, and the proteins of a part when it is clicked -----
  const rowOfPart = (part) => {
    for (const L of [LAYERS.part, LAYERS.region])
      for (const [, rows] of L.groups) {
        const row = rows.find((r) => r.part === part);
        if (row) return [L, row];
      }
    return null;
  };
  let ZD = null,
    ZS = null,
    ZV = null;
  const PER = 50;
  function zoomList(part, page = 0) {
    const box = ZD.querySelector('.cz-list'),
      hit = part && rowOfPart(part);
    if (!box) return;
    if (!hit) {
      box.hidden = true;
      return;
    }
    const [L, row] = hit,
      scoped = scopedNow(),
      mem = members(L, row, scoped);
    box.hidden = false;
    ZS.part = part;
    ZS.page = page;
    if (!mem) {
      box.innerHTML = '<p class="muted">Loading the proteins…</p>';
      Promise.resolve(K.sel.ready).then(() => {
        if (ZS && ZS.part === part && K.sel.peek()) zoomList(part, page);
      });
      return;
    }
    const hl = K.hl?.state(),
      hot = hl && hl.on ? mem.filter((m) => hl.prots.has(m.p)) : [],
      list = [...hot, ...mem.filter((m) => !hot.includes(m))],
      pages = Math.max(1, Math.ceil(list.length / PER));
    page = Math.min(page, pages - 1);
    ZS.page = page;
    const shown = list.slice(page * PER, (page + 1) * PER);
    box.innerHTML =
      `<h4>${esc(rowName(row))}</h4><p class="muted small">${
        scoped ? 'Proteins of your selection' : `All ${esc(W.marked)} proteins`
      } the maps ` +
      `find here: <b>${int(mem.length)}</b>${
        hot.length ? `; ${int(hot.length)} highlighted, listed first` : ''
      }. ${scoped ? '' : 'The most maps first.'}</p>` +
      (shown.length
        ? `<ul class="cz-ul">${shown
            .map(
              (m) =>
                `<li${hot.includes(m) ? ' class="hl"' : ''}><a href="${esc(K.link('protein', m.acc))}" title="${esc(
                  m.gene + ' (' + m.acc + '): ' + m.maps.map((a) => DS(a).name).join(', ')
                )}">${esc(m.gene)}</a> <span ` +
                `class="muted small">${int(m.maps.length)} ${m.maps.length === 1 ? 'study' : 'studies'}</span>${
                  hot.includes(m) ? ' <span class="small" aria-label="highlighted">★</span>' : ''
                }</li>`
            )
            .join('')}</ul>`
        : '<p class="muted">None.</p>') +
      (pages > 1
        ? `<p class="cz-pager"><button type="button" class="btn small" data-cz-page="-1"${page ? '' : ' disabled'}>‹ Previous</button>` +
          ` <span class="muted small">page ${int(page + 1)} of ${int(pages)}</span> <button type="button" ` +
          `class="btn small" data-cz-page="1"${page < pages - 1 ? '' : ' disabled'}>Next ›</button></p>`
        : '');
  }
  // a phone: the drawing without its side callouts, so it fills the width; each part a numbered dot, and the labels a list below it
  function phoneLabels(stage, drawing) {
    const sv = stage.firstElementChild,
      ZB = ZD.querySelector('.cz-body');
    if (!sv || !ZB) return;
    const crop = crops[drawing];
    const items = [...sv.querySelectorAll('.cd-label')]
      .map((l) => {
        const dot = l.querySelector('.cd-dot'),
          k = l.dataset.cellPart || l.dataset.cellZpart;
        return k && dot
          ? {
              k,
              x: +dot.getAttribute('cx'),
              y: +dot.getAttribute('cy'),
              name: l.querySelector('.cd-name')?.textContent || '',
              val: l.querySelector('.cd-val')?.textContent || '',
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    sv.querySelectorAll('.cd-label').forEach((l) => l.remove());
    if (crop) sv.setAttribute('viewBox', crop.join(' '));
    const NS = 'http://www.w3.org/2000/svg';
    items.forEach((it, i) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'cz-mk');
      g.dataset.czMk = String(i);
      g.setAttribute('aria-hidden', 'true');
      g.innerHTML = `<circle cx="${it.x}" cy="${it.y}"/><text x="${it.x}" y="${it.y}">${i + 1}</text>`;
      sv.appendChild(g);
    });
    const ul = document.createElement('ul');
    ul.className = 'cz-legend';
    ul.setAttribute('aria-label', 'Parts of the drawing');
    ul.innerHTML = items
      .map(
        (it, i) =>
          `<li><button type="button" class="cz-row" data-cz-row="${i}" data-cz-part="${esc(it.k)}"><span class="cz-n" ` +
          `aria-hidden="true">${i + 1}</span><b>${esc(it.name)}</b><span class="cz-rv">${esc(it.val)}</span></button>` +
          `</li>`
      )
      .join('');
    stage.after(ul);
    sv.addEventListener(
      'click',
      (e) => {
        const mk = e.target.closest('[data-cz-mk]');
        if (!mk) return;
        e.stopPropagation();
        e.preventDefault();
        const row = ul.querySelector(`[data-cz-row="${mk.dataset.czMk}"]`);
        ul.querySelectorAll('.cz-row.on').forEach((x) => x.classList.remove('on'));
        row.classList.add('on');
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
      true
    );
    ul.addEventListener('click', (e) => {
      const r = e.target.closest('[data-cz-row]');
      if (!r) return;
      ul.querySelectorAll('.cz-row.on').forEach((x) => x.classList.remove('on'));
      r.classList.add('on');
      zoomList(r.dataset.czPart);
      ZD.querySelector('.cz-list')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
  function zoomView(drawing, one) {
    const d = DRAWINGS.find((x) => x.drawing === drawing);
    if (!d || typeof HTMLDialogElement === 'undefined') return;
    if (!ZD) {
      ZD = document.createElement('dialog');
      ZD.id = 'cell-zoom';
      ZD.className = 'cz';
      ZD.setAttribute('aria-label', 'The drawing, large');
      document.body.appendChild(ZD);
      ZD.addEventListener('click', (e) => {
        if (e.target === ZD || e.target.closest('[data-cz="close"]') || e.target.closest('.cz-list a')) {
          ZD.close();
          return;
        }
        const b = e.target.closest('[data-cz]');
        if (b && ZS) ZS[b.dataset.cz]?.();
        const pg = e.target.closest('[data-cz-page]');
        if (pg && ZS) zoomList(ZS.part, ZS.page + +pg.dataset.czPage);
      });
      ZD.addEventListener('close', () => {
        ZD.innerHTML = '';
        ZS = null;
      });
    }
    const title = one
      ? `${D.proteins[one.i][1] || D.proteins[one.i][0]}: the ${drawing}`
      : `${d.title || cap(drawing)}${K.sel?.active() ? ', your selection' : ''}`;
    ZV = { drawing, one };
    ZD.innerHTML =
      `<div class="cz-bar"><strong>${esc(title)}</strong>${one ? '' : viewSwitch()}<span class="cz-btns"><button type="button" ` +
      `class="btn small" data-cz="more" aria-label="Zoom in" title="Zoom in">+</button><button type="button" ` +
      `class="btn small" data-cz="less" aria-label="Zoom out" title="Zoom out">−</button><button type="button" ` +
      `class="btn small" data-cz="reset" title="Back to the whole drawing">Reset</button><button type="button" ` +
      `class="btn small" data-cz="close" aria-label="Close" title="Close (Esc)">×</button></span></div>` +
      (`<div class="cz-body"><div class="cz-stage" tabindex="0" role="group" aria-label="${esc(title)}: scroll or ` +
        `pinch to zoom, drag to move; with the keyboard, plus and minus zoom, 0 resets and the arrow keys move">` +
        `</div><aside class="cz-list" hidden aria-live="polite"></aside></div>`) +
      (`<p class="cz-hint muted small">Scroll or pinch to zoom, drag to move. Click a part of the drawing to list ` +
        `the proteins the maps place there.</p>`);
    const stage = ZD.querySelector('.cz-stage');
    ZS = { part: null, page: 0 };
    let moved = false;
    stage.addEventListener(
      'click',
      (e) => {
        if (moved) {
          e.stopImmediatePropagation();
          e.preventDefault();
          moved = false;
        }
      },
      true
    );
    drawInto(stage, drawing, { one: one || null, keep: true, crop: false, labels: true });
    const phone = matchMedia('(max-width: 700px)').matches;
    if (phone) phoneLabels(stage, drawing);
    stage.addEventListener('click', (e) => {
      const g = e.target.closest('[data-cell-part], [data-cell-zpart]');
      if (!g) return;
      e.stopPropagation();
      zoomList(g.dataset.cellPart || g.dataset.cellZpart);
    });
    const sv = stage.firstElementChild;
    if (!sv) return;
    sv.style.cssText = 'width:100%;height:100%;max-width:none;min-width:0;touch-action:none;display:block';
    const vb = sv.viewBox.baseVal,
      B = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
    let z = 1,
      cx = B.x + B.w / 2,
      cy = B.y + B.h / 2;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const narrow = matchMedia('(max-width: 700px)'),
      fs0 = [sv.querySelector('.cd-name'), sv.querySelector('.cd-val')].map(
        (n) => (n && parseFloat(getComputedStyle(n).fontSize)) || 13
      );
    stage.style.setProperty('--cz-ar', `${B.w} / ${B.h}`);
    const apply = () => {
      const w = B.w / z,
        h = B.h / z;
      cx = clamp(cx, B.x + w / 2, B.x + B.w - w / 2);
      cy = clamp(cy, B.y + h / 2, B.y + B.h - h / 2);
      sv.setAttribute('viewBox', `${cx - w / 2} ${cy - h / 2} ${w} ${h}`);
      // a phone: the labels keep a readable size on the screen (9.5 to 14 px for the names) whatever the zoom and the width
      const m = narrow.matches && sv.getScreenCTM();
      if (m && m.a > 0) {
        sv.style.setProperty('--cz-mr', 11 / m.a + 'px');
        sv.style.setProperty('--cz-mf', 12 / m.a + 'px');
        sv.style.setProperty('--cz-ms', 1.5 / m.a + 'px');
        sv.style.setProperty('--cz-fn', clamp(fs0[0] * m.a, 9.5, 14) / m.a + 'px');
        sv.style.setProperty('--cz-fv', clamp(fs0[1] * m.a, 8.5, 12.5) / m.a + 'px');
      }
    };
    const at = (x, y) => {
      const m = sv.getScreenCTM();
      if (!m) return { x: cx, y: cy };
      const p = sv.createSVGPoint();
      p.x = x;
      p.y = y;
      return p.matrixTransform(m.inverse());
    };
    const zoomTo = (nz, px, py) => {
      nz = clamp(nz, 1, 10);
      const q = px == null ? { x: cx, y: cy } : at(px, py);
      cx = q.x - ((q.x - cx) * z) / nz;
      cy = q.y - ((q.y - cy) * z) / nz;
      z = nz;
      apply();
    };
    ZS.more = () => zoomTo(z * 1.4);
    ZS.less = () => zoomTo(z / 1.4);
    ZS.reset = () => {
      z = 1;
      cx = B.x + B.w / 2;
      cy = B.y + B.h / 2;
      apply();
    };
    // the keyboard: + and − zoom, 0 resets, the arrows move (with the stage itself focused, not one of its parts)
    stage.addEventListener('keydown', (e) => {
      if (e.target !== stage || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key,
        step = 0.15;
      if (k === '+' || k === '=') ZS.more();
      else if (k === '-' || k === '−' || k === '_') ZS.less();
      else if (k === '0') ZS.reset();
      else if (k.startsWith('Arrow')) {
        cx += (((k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0) * B.w) / z) * step;
        cy += (((k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0) * B.h) / z) * step;
        apply();
      } else return;
      e.preventDefault();
    });
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        zoomTo(z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
      },
      { passive: false }
    );
    const ptr = new Map();
    let d0 = 0,
      z0 = 1,
      path = 0;
    stage.addEventListener('pointerdown', (e) => {
      ptr.set(e.pointerId, [e.clientX, e.clientY]);
      path = 0;
      if (ptr.size === 2) {
        const [a, b] = [...ptr.values()];
        d0 = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        z0 = z;
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!ptr.has(e.pointerId)) return;
      const prev = ptr.get(e.pointerId);
      ptr.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptr.size === 2) {
        const [a, b] = [...ptr.values()];
        zoomTo((z0 * Math.hypot(a[0] - b[0], a[1] - b[1])) / d0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        moved = true;
        return;
      }
      path += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
      if (path > 5 && z > 1) {
        const m = sv.getScreenCTM();
        if (m) {
          cx -= (e.clientX - prev[0]) / m.a;
          cy -= (e.clientY - prev[1]) / m.d;
          apply();
          moved = true;
        }
      }
    });
    const up = (e) => {
      ptr.delete(e.pointerId);
      if (!ptr.size)
        setTimeout(() => {
          moved = false;
        }, 0);
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    if (!ZD.open) ZD.showModal();
    try {
      new ResizeObserver(apply).observe(stage);
    } catch (e) {
      apply();
    }
  }
  K.clicks.unshift([
    '[data-cell-zoom]',
    (el) => zoomView(el.dataset.cellZoom, el.dataset.i != null ? { i: +el.dataset.i } : null),
  ]);
  K.cell.zoom = zoomView;
  function drawBig() {
    const els = [...document.querySelectorAll('#view [data-cell-draw]')];
    if (!els.length) return;
    const nar = narrow();
    els.forEach((el, i) => {
      drawInto(el, el.dataset.cellDraw, { crop: nar, labels: !nar, keep: i > 0, onPart: toggle });
      el.dataset.narrow = nar ? '1' : '';
    });
  }
  (K.afterRender ||= []).push(drawBig);
  let bigT;
  addEventListener('resize', () => {
    clearTimeout(bigT);
    bigT = setTimeout(() => {
      const el = document.querySelector('#view [data-cell-draw]');
      if (el && (el.dataset.narrow === '1') !== narrow()) drawBig();
    }, 200);
  });
  K.clicks.push(['[data-cell-sel]', (el) => toggle(el.dataset.cellSel)]);

  function tile(card) {
    if (card.drawing === true && DRAWINGS.length) return bigTile(card);
    TIPS = [];
    const scoped = scopedNow(),
      { regs, up } = summaries(scoped, 'fold');
    const items = [
      ...regs.map((x) => ({ ...x, name: rowName(x.row), tip: sumTip(x, scoped) })),
      ...(up.length
        ? [
            { head: 'Most of all' },
            ...up.slice(0, 3).map((x) => ({ ...x, name: rowName(x.row), tip: sumTip(x, scoped) })),
          ]
        : []),
    ];
    const note =
      K.selOn() && !scoped
        ? `<p class="twhole"><span>Whole dataset</span> ${
            K.vsOn()
              ? 'the maps compare proteins, not marks: shown for all ' + esc(W.marked) + ' proteins'
              : 'the selection is too small to test'
          }</p>`
        : '';
    // card.drawing: the drawing of the cell itself on the tile (true: the first of website.cell.drawings, or one by id);
    // its parts keep their hover and lose their click, which here opens the question (selecting is on its page)
    const dw = card.drawing ? DRAWINGS.find((d) => d.drawing === card.drawing) || DRAWINGS[0] : null;
    const fig = dw
      ? `<div class="cell-scroll cell-tile-fig">${svgOf(
          FIGS[dw.drawing].make('fold'),
          'cell-svg cell-' + dw.drawing,
          'img'
        ).replace(/<g [^>]*>/g, (g) =>
          g.replace(/ (data-cell-(?:row|part|bar)|tabindex|role="button"|aria-label|aria-hidden)(="[^"]*")?/g, '')
        )}</div>`
      : '';
    return (
      `<article class="tile${dw ? ' wide' : ''}" id="tile-${esc(ID)}" data-tile="${esc(ID)}" tabindex="0">` +
      `<header><h3>${esc(card.title || C.title || 'Where in the cell')}</h3>${K.detailsLink(ID)}</header>` +
      fig +
      `<div class="trows">${forest(items)}</div><p class="tfoot">${lead(regs, up, scoped, true)}</p>${note}</article>`
    );
  }
  // the color key as the export draws it (the circles of K.figureFrame's legend), in the page's words
  const hasSel = () => scopedNow() && Object.values(parts(true).P || {}).some((p) => p.selected);
  // the percent view's key: the five steps of the ramp with their range, the reference tick, and what is not measured
  const pctLegend = () => {
    const scoped = scopedNow();
    if (VIEW === 'diff') {
      const t = Object.fromEntries(TONES.light),
        { ref } = parts(scoped, 'diff');
      return [
        [t['up-2'], t['up-3'], `above the share among all mapped proteins (${pctText(ref)})`],
        [t['mid'], '#8a96a0', 'within half a point of it'],
        [t['down-2'], t['down-3'], 'below it'],
        ...(ref != null ? [['', '#111827', pctRefWords(scoped, ref), 'tick']] : []),
        ['#ffffff', '#8a96a0', 'not measured'],
        ...(hasSel() ? [['#ffffff', '#111827', 'outlined: your selection']] : []),
      ];
    }
    const { range, ref } = parts(scoped, 'percent'),
      at = (i) => pctText(range.lo + (i * (range.hi - range.lo)) / 5);
    return [
      ...SEQ.light.map((c, i) => [c, c, `${at(i)}–${at(i + 1)}`]),
      ...(ref != null ? [['', '#111827', pctRefWords(scoped, ref), 'tick']] : []),
      ['#ffffff', '#8a96a0', 'not measured'],
      ...(hasSel() ? [['#ffffff', '#111827', 'outlined: your selection']] : []),
    ];
  };
  const colourLegend = () => {
    if (pctOn()) return pctLegend();
    const t = Object.fromEntries(TONES.light),
      plain = (s) => {
        const b = document.createElement('div');
        b.innerHTML = s;
        return b.textContent;
      };
    return [
      [t['up-2'], t['up-3'], `more likely than ${plain(esc(alike))}`],
      [t['mid'], '#8a96a0', 'no difference, or the maps disagree'],
      [t['down-2'], t['down-3'], 'less likely'],
      ['#ffffff', '#8a96a0', 'not measured'],
      ...(hasSel() ? [['#ffffff', '#111827', 'outlined: your selection']] : []),
    ];
  };
  // the same on the page: a ramp bar with the ends of its scale and a tick at the share among all the proteins the maps place
  function pctKey(scoped) {
    if (VIEW === 'diff') {
      const { range, ref } = parts(scoped, 'diff'),
        steps = ['f3', 'f2', 'f1', 'f0', 'ns', 'm0', 'm1', 'm2', 'm3'];
      return (
        `<div class="key cell-keys pct-key" role="group" aria-label="Color key"><span>Difference from the share among all mapped proteins${
          ref != null ? ` (${esc(pctText(ref))})` : ''
        }</span><span class="pk-lo">${esc(ptsText(-range.max))}</span><span class="pk-bar" role="img" aria-label="from ${esc(
          ptsText(-range.max)
        )} to ${esc(ptsText(range.max))}; red above, slate below">${steps.map((s) => `<i class="${s}"></i>`).join('')}<b class="pk-ref" style="left:50%"></b></span><span class="pk-hi">${esc(
          ptsText(range.max)
        )}</span>` +
        (ref != null ? `<span class="cell-key"><i class="pk-tick"></i>${esc(pctRefWords(scoped, ref))}</span>` : '') +
        `<span class="cell-key"><i class="cg-k na"></i> not measured</span>${
          hasSel() ? '<span class="cell-key"><i class="cg-k sel"></i> outlined: your selection</span>' : ''
        }</div>`
      );
    }
    const { range, ref } = parts(scoped, 'percent'),
      cut = range.lo > 0,
      at =
        ref != null && range.hi > range.lo
          ? Math.min(100, Math.max(0, (100 * (ref - range.lo)) / (range.hi - range.lo)))
          : null;
    return (
      `<div class="key cell-keys pct-key" role="group" aria-label="Color key"><span>${
        scoped ? 'Share of a part’s proteins in your selection' : `Share of a part’s proteins with a ${esc(W.mark)}`
      }</span><span class="pk-lo">${pctText(range.lo)}</span>${
        cut ? '<svg class="pk-brk" viewBox="0 0 10 14" aria-hidden="true"><path d="M2,0 L8,5 L2,9 L8,14"/></svg>' : ''
      }<span class="pk-bar" role="img" aria-label="${
        scoped
          ? 'darker is a larger share'
          : `from ${pctText(range.lo)} to ${pctText(range.hi)}, darker is a larger share${cut ? '; the scale does not start at 0' : ''}`
      }">${[0, 1, 2, 3, 4].map((i) => `<i class="p${i}"></i>`).join('')}${
        at != null ? `<b class="pk-ref" style="left:${at.toFixed(1)}%"></b>` : ''
      }</span><span class="pk-hi">${pctText(range.hi)}</span>` +
      (ref != null ? `<span class="cell-key"><i class="pk-tick"></i>${esc(pctRefWords(scoped, ref))}</span>` : '') +
      `<span class="cell-key"><i class="cg-k na"></i> not measured</span>${
        hasSel() ? '<span class="cell-key"><i class="cg-k sel"></i> outlined: your selection</span>' : ''
      }</div>`
    );
  }
  const colourKey = () =>
    pctOn()
      ? pctKey(scopedNow())
      : `<p class="key cell-keys"><span class="cell-key"><i class="cg-k u3"></i><i class="cg-k ` +
        `u1"></i> more likely than ${esc(alike)}</span><span class="cell-key"><i class="cg-k ns"></i> no ` +
        `difference</span>` +
        (`<span class="cell-key"><i class="cg-k d1"></i><i class="cg-k d3"></i> less likely</span><span ` +
          `class="cell-key"><i class="cg-k na"></i> not measured</span>${
            hasSel() ? '<span class="cell-key"><i class="cg-k sel"></i> outlined: your selection</span>' : ''
          }<span>numbers: odds ratios (in the drawings, ` +
          `the median of the maps)</span></p>`);
  // the members of a row: the marked proteins (or the selection's) each map places in the row's compartment
  function members(L, row, scoped) {
    const SD = K.sel.data();
    if (!SD) return null;
    const on = scoped ? K.sel.compute().proteins : null,
      out = new Map();
    for (const aid of L.cols) {
      const s = row.map[aid],
        set = s && (SD.protein_sets?.[aid]?.sets || []).find((x) => x[0] === s);
      if (!set) continue;
      for (const p of set[2]) {
        if (on && !on.has(p)) continue;
        if (!out.has(p)) out.set(p, { p, acc: D.proteins[p][0], gene: D.proteins[p][1] || D.proteins[p][0], maps: [] });
        out.get(p).maps.push(aid);
      }
    }
    return [...out.values()].sort((x, y) => y.maps.length - x.maps.length || x.gene.localeCompare(y.gene));
  }
  function detail(scoped) {
    const [L, row] = UI.row ? rowOf(UI.row) : [null, null];
    if (!row) return '';
    const pct = pctOn(),
      s = pct ? pctRow(L, row, scoped) : rowSummary(L, row, scoped),
      wh = who(scoped),
      sig = s.tone[0] === 'u' || s.tone[0] === 'd';
    const verdict = pct
      ? s.selected
        ? 'This is the part your selection was made with.'
        : s.share == null
          ? 'No map places proteins here.'
          : scoped
            ? `${pctText(s.share)} of the ${int(s.n)} proteins here are in your selection (whole site: ${pctText(s.whole)} have at least one ${W.mark}).`
            : `${pctText(s.share)} of the ${int(s.n)} proteins here have at least one ${W.mark}${
                s.cells.length > 1 ? ' (the median of ' + s.maps + ')' : ''
              }; ${pctText(pctRef(false))} of all the proteins the maps place do.`
      : s.selected
        ? `This is the part your selection was made with, so it is not compared with itself. The drawings compare the other parts.`
        : sig
          ? `${cap(wh)} are <b>${s.tone[0] === 'u' ? 'more' : 'less'} likely</b> to be found here ` +
            `than ${esc(alike)} (${esc(orWords(s.a))}${s.cells.length > 1 ? ', the median of ' + s.maps : ''}).`
          : s.tone === 'ns'
            ? s.value === 'maps disagree'
              ? `The maps disagree. In some, ${esc(wh)} are more likely ` +
                `to be found here than ${esc(alike)}, in others less likely.`
              : `${cap(wh)} are found here about as ` + `often as ${esc(alike)}.`
            : `No map compares ${esc(wh)} here.`;
    const cols = L.cols.filter((aid) => row.map[aid]);
    const two = (k1, n1, w1, k2, n2, w2) =>
      `${int(k1)} of ${int(n1)} ${esc(w1)} (${pc(k1, n1)}%)<br>${int(k2)} of ${int(n2)} ${esc(w2)} (${pc(k2, n2)}%)`;
    const cmp = (a) =>
      !a || a.l2 == null
        ? '–'
        : `<b>${esc(orText(a))}</b>${
            a.lo != null && a.hi != null ? ` <span class="muted">(${K.fx(2 ** a.lo)}–${K.fx(2 ** a.hi)})</span>` : ''
          }, q ${fq(a.q)} · ${esc(MARK[markOf(a)]?.[1] || '')}`;
    const trs = pct
      ? cols
          .map((aid) => {
            const ds = DS(aid),
              c = pctCell(aid, row.map[aid], scoped);
            return `<tr><th scope="row">${esc(ds.name)}<br><span class="muted small">${esc(
              [ds.method, ds.cells].filter(Boolean).join(', ')
            )}</span></th><td>${esc(label(aid, row.map[aid]))}</td><td>${
              c ? `${int(c.k)} of ${int(c.M)}` : '–'
            }</td><td>${c ? `<b>${esc(pctText(c.share))}</b>${scoped ? ` <span class="muted">(whole site ${esc(pctText(c.whole))})</span>` : ''}` : '–'}</td></tr>`;
          })
          .join('')
      : cols
          .map((aid) => {
            const ds = DS(aid),
              t = T[aid]?.[row.map[aid]],
              c = gridCell(aid, row.map[aid], scoped);
            const counts = !t
              ? '–'
              : scoped
                ? c?.x
                  ? two(c.x.k, c.x.n, 'of your selection', c.x.M - c.x.k, c.x.N - c.x.n, 'others')
                  : '–'
                : two(t.k, t.n, W.marked, t.M - t.k, t.N - t.n, `without a ${W.mark}`);
            return (
              `<tr><th scope="row">${
                ds.url ? `<a href="${esc(ds.url)}" target="_blank" rel="noopener">${esc(ds.name)}</a>` : esc(ds.name)
              }<br><span ` +
              `class="muted small">${esc([ds.method, ds.cells].filter(Boolean).join(', '))}</span></th>` +
              `<td>${esc(label(aid, row.map[aid]))}</td><td>${counts}</td><td>${
                !c ? '–' : c.selected ? 'your selection' : c.circular ? 'not compared' : cmp(c.a)
              }</td></tr>`
            );
          })
          .join('');
    const mem = members(L, row, scoped),
      shown = mem ? (UI.all ? mem : mem.slice(0, 150)) : [],
      multi = cols.length > 1;
    return (
      `<div class="cell-detail" id="cell-detail"><div class="cell-detail-head"><h4>${esc(rowName(row))}</h4><button ` +
      `class="btn quiet small" type="button" data-cell-close aria-label="Close">Close</button></div>` +
      (`<p>${verdict}</p><div class="tbl-wrap"><table class="tbl compact cell-detail-tbl"><thead><tr><th>Map</th>` +
        `<th>Its compartment</th>${
          pct
            ? `<th>${scoped ? 'In your selection' : 'With a ' + esc(W.mark)}</th><th>Share of its proteins</th>`
            : `<th>${esc(cap(here))}</th><th>Against ${esc(alike)}</th>`
        }</tr></thead><tbody>${trs}</tbody></table>` +
        `</div>`) +
      `<div class="cell-members"><div class="fig-head"><span class="flabel">${
        scoped ? 'Proteins of your selection found here' : `${esc(cap(W.marked))} proteins ` + `found here`
      }${mem ? ` (${int(mem.length)})` : ''}</span>` +
      (mem && mem.length
        ? `<span><button class="btn small" type="button" data-cell-select>Select these ${int(mem.length)} proteins</button>` +
          ` <button class="btn quiet small" type="button" data-cell-tsv>Download TSV</button></span>`
        : '') +
      '</div>' +
      (!mem
        ? '<p class="muted">Loading the proteins…</p>'
        : mem.length
          ? `<p class="cell-chips">${shown
              .map(
                (m) =>
                  `<a class="cell-chip" ` +
                  `href="${esc(K.link('protein', m.acc))}" title="${esc(
                    `${m.gene} (${m.acc}): assigned here by ${m.maps.map((k) => DS(k).name).join(', ')}`
                  )}">${esc(m.gene)}${multi && m.maps.length > 1 ? `<sup>${m.maps.length}</sup>` : ''}</a>`
              )
              .join('')}</p>` +
            (mem.length > shown.length
              ? `<button class="btn quiet small" type="button" data-cell-all>Show all ${int(mem.length)}</button>`
              : '') +
            (multi ? '' : '')
          : '<p class="muted">None.</p>') +
      '</div></div>'
    );
  }
  function page() {
    TIPS = [];
    const scoped = scopedNow(),
      { regs, up } = summaries(scoped);
    const at = UI.row ? UI.at : null,
      dt = () => detail(scoped);
    const regionsBlock = LAYERS.region.groups.length
      ? block('regions', C.regions_title || 'Regions of the cell', 'cell-regions') + (at === 'regions' ? dt() : '')
      : '';
    const drawings = DRAWINGS.map(
      (d) => block(d.drawing, d.title || d.drawing, 'cell-fig') + (at === d.drawing ? dt() : '')
    ).join('');
    const selNote =
      scoped && pctOn()
        ? ` The percent view counts the proteins each map places in a part that are in your selection; the fold view tests them.`
        : scoped
          ? ` Your selection is tested map by map: ${int(selTests(MAPS[0].analysis)?.n || 0)} of its proteins ` +
            `are in ${esc(DS(MAPS[0].analysis).name)}; each map counts its own proteins.`
          : K.selOn()
            ? ` <b>Your selection</b> ${
                K.vsOn()
                  ? 'is compared with other modifications; the maps compare proteins, so this page shows'
                  : 'is too small to test; this page shows'
              } all ${esc(W.marked)} proteins.`
            : '';
    const maps = MAPS.map((m) => {
      const ds = DS(m.analysis);
      const bits = [
        ds.doi
          ? `<a href="https://doi.org/${esc(ds.doi)}" target="_blank" ` + `rel="noopener">${esc(ds.ref || ds.doi)}</a>`
          : esc(ds.ref || ''),
        esc(ds.cells || ''),
        esc(ds.licence || ''),
        ds.universe ? `${int(ds.universe)} proteins in the map, ${pc(ds.marked, ds.universe)}% ${esc(W.marked)}` : '',
        `<a href="${esc(K.link('overview', m.analysis))}">its question</a>`,
      ].filter(Boolean);
      return `${esc(ds.name)} (${bits.join('; ')})`;
    }).join('; ');
    return (
      `<div class="card-body cell-page"><p class="cell-lead">${lead(regs, up, scoped, false)}</p>` +
      (HAS_PCT ? `<div class="cell-viewbar">${viewSwitch()}</div>` : '') +
      (pctOn()
        ? `<p class="small">${esc(C.intro || '')} ${esc(keyWords())}${selNote}</p>`
        : `<p class="small">${esc(C.intro || '')} Red: ${esc(who(scoped))} are more likely to be found there than ${esc(alike)}. Slate: ` +
          `less likely. Gray: no difference.${selNote}</p>`) +
      colourKey() +
      regionsBlock +
      drawings +
      block('grid', 'Compartments against maps', 'cell-grid') +
      (at === 'grid' ? dt() : '') +
      (`<div class="cell-block cell-one" id="cell-one"><div class="fig-head"><span class="flabel">One map at a ` +
        `time</span><span class="seg cell-maps" role="group" aria-label="Map">`) +
      MAPS.map(
        (m) =>
          `<button type="button" data-cellmap="${esc(m.analysis)}" aria-pressed="${m.analysis === UI.map}">${esc(m.short || m.name)}</button>`
      ).join('') +
      '</span>' +
      K.expBar(['pdf', 'svg', 'png', 'tsv'], 'cell-exp', 'one map', ID).replace(
        /data-cell-exp="(\w+)"/g,
        'data-cell-exp="$1" data-cell-fig="one"'
      ) +
      '</div>' +
      `<div class="cell-scroll">${svgOf(FIGS.one.make(), 'cell-svg cell-bars')}</div></div>` +
      `<p class="note small muted">${pctOn() ? esc(testWords('percent')) + ' ' : ''}${esc(testWords('fold'))} Maps: ${maps}.${C.note ? ' ' + esc(C.note) : ''}</p></div>`
    );
  }

  // ---- the question, its Method section, clicks and hovers --------------------------------------------------------------
  A[ID] = {
    id: ID,
    kind: 'module',
    anySize: true,
    title: C.title || 'Where in the cell',
    question: C.question || '',
    sub: '',
    describe: '',
    section: '',
    labels: {},
    help: {},
    roles: [...new Set(MAPS.flatMap((m) => [...(A[m.analysis].roles || []), ...(A[m.regions]?.roles || [])]))],
  };
  K.questions[ID] = { tile, page: () => page() };
  K.methods.push({
    id: ID,
    title: C.title || 'Where in the cell',
    html: () =>
      `<section id="m-q-${esc(ID)}" class="qm"><h3>${esc(C.title || 'Where in the cell')}</h3>` +
      (C.question ? `<p class="qm-q">${esc(C.question)}</p>` : '') +
      `<p>One question drawn from ${MAPS.length} maps of the cell, each a protein-set question: ${MAPS.map(
        (m) => `<a href="${esc(K.link('method', 'q-' + m.analysis))}">${esc(DS(m.analysis).name)}</a>`
      ).join(', ')}${
        REGMAPS.length
          ? `, and the ` +
            `regions of the cell in ${REGMAPS.map(
              (m) => `<a href="${esc(K.link('method', 'q-' + m.regions))}">${esc(DS(m.regions).name)}</a>`
            ).join(', ')}`
          : ''
      }. ${esc(testWords('fold'))}</p>` +
      (HAS_PCT
        ? `<p>The percent view colors each part by the share of its proteins that carry a ${esc(W.mark)}. ${esc(testWords('percent'))}</p>`
        : '') +
      (`<p>Each grid row is mapped to a compartment of each map and to the part of the ` +
        `drawings it colors. A selection is tested again in the browser, map by map, the same way${
          allStrat ? ', over the abundance strata of each map’s proteins' : ''
        }. It is not ` +
        `tested against a map it was made with, nor when it names its proteins.</p>`) +
      `<p class="qm-links"><a href="${esc(K.link('overview', ID))}">Its figure</a></p></section>`,
  });
  const open = (id, at) => {
    if (UI.row !== id) UI.all = false;
    UI.row = id;
    UI.at = at;
    K.render();
    requestAnimationFrame(() =>
      document.getElementById('cell-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    );
  };
  const atOf = (el) => (el.closest('.cell-block')?.id || '').replace(/^cell-/, '');
  const pick = (el) => {
    if (el.dataset.cellRow) return open(el.dataset.cellRow, atOf(el));
    const { P } = parts(scopedNow()),
      p = P[el.dataset.cellPart];
    if (p) open(p.id, atOf(el));
  };
  const selectFilter = (aid, set) => {
    S.q = '';
    S.f = { ['p:' + aid]: [set] };
    UI.row = null;
    K.writeHash(true);
    K.render();
  };
  K.clicks.push(
    ['[data-cell-row], [data-cell-part]', (el) => pick(el)],
    [
      '[data-cellview]',
      (el) => {
        VIEW = ['percent', 'diff'].includes(el.dataset.cellview) && HAS_PCT ? el.dataset.cellview : 'fold';
        TIPS = [];
        K.render();
        if (ZD?.open && ZV) zoomView(ZV.drawing, ZV.one);
      },
    ],
    [
      '[data-cellmap]',
      (el) => {
        UI.map = el.dataset.cellmap;
        K.render();
      },
    ],
    ['[data-cell-bar]', (el) => selectFilter(UI.map, el.dataset.cellBar)],
    [
      '[data-cell-close]',
      () => {
        UI.row = null;
        K.render();
      },
    ],
    [
      '[data-cell-all]',
      () => {
        UI.all = true;
        K.render();
      },
    ],
    [
      '[data-cell-select]',
      () => {
        const [L, row] = rowOf(UI.row),
          mem = members(L, row, scopedNow()) || [];
        if (!mem.length) return;
        const cols = L.cols.filter((aid) => row.map[aid]);
        if (cols.length === 1) return selectFilter(cols[0], row.map[cols[0]]); // one map: its own filter
        S.f = {};
        S.q = mem.map((m) => (D.proteins.filter((x) => x[1] === m.gene).length === 1 ? m.gene : m.acc)).join(' ');
        UI.row = null;
        K.writeHash(true);
        K.render();
      },
    ],
    [
      '[data-cell-tsv]',
      (el) => {
        const [L, row] = rowOf(UI.row),
          mem = members(L, row, scopedNow()) || [],
          cols = L.cols.filter((aid) => row.map[aid]);
        K.exportFigure(
          'tsv',
          null,
          `${D.site.id}_${ID}_${String(row.part || row.label)
            .replace(/\W+/g, '_')
            .toLowerCase()}`,
          el,
          () =>
            K.preamble(
              `${C.title || 'Where in the cell'}: ${rowName(row)}`,
              `${who(scopedNow())} found here,` + ` and the maps that place each`
            ) +
            'gene\taccession\t' +
            cols.map((k) => DS(k).name).join('\t') +
            '\n' +
            mem
              .map((m) => [m.gene, m.acc, ...cols.map((k) => (m.maps.includes(k) ? 'yes' : ''))].join('\t'))
              .join('\n') +
            '\n'
        );
      },
    ],
    [
      '[data-cell-exp]',
      (el) => {
        const f = FIGS[el.dataset.cellFig];
        if (f) K.exportFigure(el.dataset.cellExp, () => exported(f), figName(el.dataset.cellFig), el, f.tsv);
      },
    ]
  );
  // a click on a drawing (not on one of its parts) opens it large, as its Enlarge button does: the n-th drawing of the
  // nearest box that has Enlarge buttons goes with the n-th button. Registered after the parts' own handler, so a
  // click on a part still reaches it (K.clicks takes the first selector that matches)
  K.clicks.push([
    '.cell-draw svg, .cell-block svg, [data-cell-one] svg',
    (el, e) => {
      if (e?.target?.closest?.('[data-cell-part], [data-cell-zpart], a, button') || el.closest('dialog')) return;
      for (let box = el.parentElement; box && box.id !== 'view'; box = box.parentElement) {
        const btns = [...box.querySelectorAll('[data-cell-zoom]')];
        if (!btns.length) continue;
        const svgs = [...box.querySelectorAll('.cell-draw svg, .cell-block svg, [data-cell-one] svg')];
        (btns[svgs.indexOf(el)] || btns[0]).click();
        return;
      }
    },
  ]);
  // a part smaller than a finger gets an invisible circle around it (24 px; 44 px on a touch screen)
  const grow = () => {
    const min = matchMedia('(pointer: coarse)').matches ? 44 : 24;
    document.querySelectorAll('svg.cell-svg').forEach((svg) => {
      svg.querySelectorAll('.cd-extra').forEach((n) => n.remove());
      const w = svg.getBoundingClientRect().width,
        vb = svg.viewBox.baseVal;
      if (!w || !vb || !vb.width) return;
      const sc = w / vb.width;
      svg.querySelectorAll('g[data-cell-part]:not([aria-hidden])').forEach((g) => {
        let b;
        try {
          b = g.getBBox();
        } catch (e) {
          return;
        }
        if (!b.width || (b.width * sc >= min && b.height * sc >= min)) return;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('class', 'cd-hit cd-extra');
        c.setAttribute('cx', b.x + b.width / 2);
        c.setAttribute('cy', b.y + b.height / 2);
        c.setAttribute('r', min / 2 / sc);
        g.appendChild(c);
      });
    });
  };
  (K.afterRender ||= []).push(grow);
  let growT;
  addEventListener('resize', () => {
    clearTimeout(growT);
    growT = setTimeout(grow, 200);
  });
  // the drawings on the tiles select the proteins of a part when clicked (the large view and the page list or open them)
  K.tips.push([
    '[data-cell-tip]',
    (el) => {
      const h = TIPS[+el.dataset.cellTip] || '';
      return el.closest('[data-cell-draw]') && !el.closest('dialog')
        ? h.replace('Click for its numbers and proteins', `Click to ` + `select these ${esc(W.marked)} proteins`)
        : h;
    },
  ]);
  document.addEventListener('keydown', (e) => {
    const el = e.target.closest?.('[data-cell-row], [data-cell-part], [data-cell-bar]');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });

  // ---- the look: the tones of the comparisons, the drawings' strokes, the grids and the detail panel -------------------
  const st = document.createElement('style');
  st.id = 'kit-cell-css';
  st.textContent =
    `:root{${TONES.light.map(([k, v]) => `--t-${k}:${v};`).join('')}${seqVars('light')}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${TONES.dark
      .map(([k, v]) => `--t-${k}:${v};`)
      .join('')}${seqVars('dark')}}}` +
    `:root[data-theme="dark"]{${TONES.dark.map(([k, v]) => `--t-${k}:${v};`).join('')}${seqVars('dark')}}` +
    CSS;
  document.head.appendChild(st);
  // a click on the drawing itself (not on a part) opens it large
  K.clicks.push([
    '.cell-draw > svg, .cell-onep svg.cell-cell, .cell-onep svg.cell-nucleus, ' +
      '.cell-block.cell-fig svg.cell-cell, .cell-block.cell-fig svg.cell-nucleus',
    (el, e) => {
      if (e.target.closest('[data-cell-part], [data-cell-row], a, button')) return;
      const box = el.closest('[data-cell-draw], .cell-block'),
        btn = box?.parentElement?.querySelector('[data-cell-zoom]') || box?.querySelector('[data-cell-zoom]');
      if (btn) btn.click();
    },
  ]);
});
