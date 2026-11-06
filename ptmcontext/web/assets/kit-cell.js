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
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  const C = D.cell;
  if (!C || !(C.maps || []).some(m => A[m.analysis])) return;
  const ST = window.PTMC_STATS, PADJ = K.PADJ, MINL2 = Math.log2(K.MIN_EFFECT);
  const ID = C.id;
  const MAPS = C.maps.filter(m => A[m.analysis]);
  const REGMAPS = MAPS.filter(m => m.regions && A[m.regions]);
  const MAP = {};                           // analysis -> its map (a regions question takes its map's words)
  MAPS.forEach(m => { MAP[m.analysis] = m; if (m.regions && A[m.regions]) MAP[m.regions] = m; });
  const PARTS = D.cell_drawings || {};
  const DRAWINGS = (C.drawings || []).filter(d => PARTS[d.drawing]);
  // the tones of a comparison, light and dark (the explorer's): more likely (up-0 to up-3), less likely, no difference
  const TONES = {
    light: [['up-0', '#F6D0CD'], ['up-1', '#EF9A94'], ['up-2', '#E34948'], ['up-3', '#A8302F'], ['down-0', '#DCE3E7'], ['down-1', '#A9B7BF'], ['down-2', '#6C818C'], ['down-3', '#3B4F5A'], ['mid', '#F0EFEC']],
    dark: [['up-0', '#5A2523'], ['up-1', '#8E3330'], ['up-2', '#D2524F'], ['up-3', '#F09A95'], ['down-0', '#26343B'], ['down-1', '#3D5260'], ['down-2', '#6C8592'], ['down-3', '#A9BDC7'], ['mid', '#1A2D35']],
  };
  const CSS = [
    '.cell-page .cell-lead{font-size:1.02rem;margin:0 0 .4rem}',
    '.cell-block{margin-top:1rem;max-width:1040px}.cell-block .fig-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem;margin:0 0 .3rem}',
    '.cell-block .flabel{font-weight:700;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}',
    '.cell-scroll{overflow-x:auto}.cell-svg{width:100%;height:auto;display:block}.cell-cell svg,.cell-svg.cell-cell,.cell-svg.cell-nucleus{min-width:640px}',
    '.cell-svg.cell-regions{max-width:520px}.cell-svg.cell-grid{max-width:840px}.cell-svg.cell-bars{max-width:760px;min-width:560px}',
    '.cell-one .seg{flex-wrap:wrap}',
    '.cg-c.u0{fill:var(--t-up-0)}.cg-c.u1{fill:var(--t-up-1)}.cg-c.u2{fill:var(--t-up-2)}.cg-c.u3{fill:var(--t-up-3)}',
    '.cg-c.d0{fill:var(--t-down-0)}.cg-c.d1{fill:var(--t-down-1)}.cg-c.d2{fill:var(--t-down-2)}.cg-c.d3{fill:var(--t-down-3)}',
    '.cg-c.ns{fill:var(--t-mid)}.cg-c.na{fill:none;stroke:var(--line-strong);stroke-dasharray:2 3}',
    '.cg-line.u0{stroke:var(--t-up-0)}.cg-line.u1{stroke:var(--t-up-1)}.cg-line.u2{stroke:var(--t-up-2)}.cg-line.u3{stroke:var(--t-up-3)}',
    '.cg-line.d0{stroke:var(--t-down-0)}.cg-line.d1{stroke:var(--t-down-1)}.cg-line.d2{stroke:var(--t-down-2)}.cg-line.d3{stroke:var(--t-down-3)}.cg-line.ns,.cg-line.na{stroke:var(--line-strong)}',
    '.cg-t{font-size:11px;fill:var(--ink)}.cg-t.t2,.cg-t.t3{fill:#fff}:root[data-theme="dark"] .cg-t.t3{fill:#111827}',
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .cg-t.t3{fill:#111827}}',
    '.cg-m{font-size:10.5px;fill:var(--muted)}.cg-h{font-size:11px;font-weight:700;fill:var(--ink)}.cg-g{font-size:11px;font-weight:700;fill:var(--muted);letter-spacing:.04em}.cg-r{font-size:12px;fill:var(--ink)}',
    '.cd-o{stroke:var(--ink);stroke-opacity:.3;stroke-width:.9}.cd-in{fill:none;stroke:var(--ink);stroke-opacity:.38;stroke-width:1.1}.cd-gap{fill:none;stroke:var(--surface)}',
    '.cd-shade{fill:var(--ink);fill-opacity:.1}.cd-ink{fill:var(--ink);fill-opacity:.55}.cd-lead{fill:none;stroke:var(--ink);stroke-opacity:.55;stroke-width:1}',
    '.cd-dot{fill:var(--ink);stroke:var(--surface);stroke-width:1.5}.cd-name{font-size:13.5px;font-weight:700;fill:var(--ink)}.cd-val{font-size:12.5px;fill:var(--ink)}.cd-val tspan.m{fill:var(--muted)}',
    '.cd-hit,.cg-hit{fill:transparent}svg [data-cell-part],svg [data-cell-row],svg [data-cell-bar]{cursor:pointer}',
    'svg [data-cell-part]:focus-visible,svg [data-cell-row]:focus-visible,svg [data-cell-bar]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    'svg [data-cell-tip]:hover .cd-lead,svg [data-cell-part].on .cd-lead{stroke-opacity:1;stroke-width:1.8}svg [data-cell-part].on .cd-name{text-decoration:underline}',
    'svg .cg-row:hover .cg-hit,svg .cg-row.on .cg-hit,svg .cb-row:hover .cg-hit{fill:var(--accent);fill-opacity:.08}',
    '.cb-grid{stroke:var(--line-strong);stroke-dasharray:2 3}.cb-one{stroke:var(--ink-2)}.cb-bar.more{fill:var(--more)}.cb-bar.less{fill:var(--less)}.cb-bar.ns{fill:var(--muted)}',
    '.cb-bar.hollow{fill:var(--surface);stroke:var(--muted);stroke-width:1}.cb-val{font-size:11.5px;font-weight:700;fill:var(--ink)}.cb-val.more{fill:var(--more)}.cb-val.less{fill:var(--less)}.cb-val.ns{fill:var(--muted)}',
    '.cell-keys{display:flex;flex-wrap:wrap;gap:.3rem 1rem;font-size:.82rem;color:var(--muted)}.cell-key{display:inline-flex;align-items:center;gap:.25rem}',
    '.cell-key i.cg-k{width:14px;height:10px;border-radius:2px;display:inline-block}.cg-k.na{background:none;border:1px dashed var(--line-strong)}',
    '.cg-k.u3{background:var(--t-up-3)}.cg-k.u1{background:var(--t-up-1)}.cg-k.ns{background:var(--t-mid);border:1px solid var(--line)}.cg-k.d1{background:var(--t-down-1)}.cg-k.d3{background:var(--t-down-3)}',
    '.cell-detail{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:.75rem 1rem;margin:.75rem 0;background:var(--surface);max-width:1040px}',
    '.cell-detail-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}.cell-detail-head h4{margin:0;font-size:1.05rem}',
    '.cell-detail-tbl th{font-weight:600}.cell-detail .tbl-wrap{overflow-x:auto}.cell-members .fig-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.5rem;margin-top:.6rem}',
    '.cell-chips{display:flex;flex-wrap:wrap;gap:.3rem;margin:.4rem 0}.cell-chip{display:inline-block;padding:.1rem .45rem;border:1px solid var(--line);border-radius:999px;font-size:.82rem;text-decoration:none;color:var(--ink)}',
    '.cell-chip:hover{border-color:var(--accent);color:var(--accent)}.cell-chip sup{color:var(--muted);margin-left:1px}',
    '.cell-page .small,.vm-page .small{font-size:.86rem}.cell-page .btn.small{padding:.15rem .55rem;font-size:.78rem}.cell-page .btn.quiet{border-color:var(--line-strong);color:var(--ink-2)}',
    '.cell-thead{font-size:.75rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-top:.3rem}',
  ].join('');

  // ---- the site's rows of each map: the enricher row (counts, fold, q) and its repeat within the strata ----------------
  const L2 = v => (v == null ? null : v >= 1e300 ? Infinity : v <= 0 ? -Infinity : Math.log2(v));
  const T = {};
  D.rows.forEach(r => {
    if (!MAP[r.analysis]) return;
    const t = ((T[r.analysis] ||= {})[r.category] ||= { cat: r.category });
    if (r.method === 'enricher') Object.assign(t, { k: r.a, n: r.a + r.b, M: r.a + r.c, N: r.a + r.b + r.c + r.d, fold: r.fold, fq: r.q });
    else if (r.method === 'mantel_haenszel') Object.assign(t, { or: r.or, lo: r.lo, hi: r.hi, q: r.q, strata: r.strata });
  });
  const stratified = aid => !!A[aid]?.stratified;
  const allStrat = MAPS.every(m => stratified(m.analysis));
  // the comparison a map's row makes: within the strata (Mantel–Haenszel), or of the whole map (fold enrichment)
  const adj = (aid, t) => (stratified(aid) && t.or !== undefined ? { l2: L2(t.or), lo: t.lo ? Math.log2(t.lo) : null, hi: t.hi ? Math.log2(t.hi) : null, q: t.q }
    : { l2: L2(t.fold), lo: null, hi: null, q: t.fq });
  // each map, as the grids and the footnote name it: its words, and how many proteins it places and how many are marked
  const DS = aid => {
    const m = MAP[aid] || {}, any = Object.values(T[aid] || {}).find(t => t.N != null);
    return { ...m, name: m.name || A[aid]?.title || aid, short: m.short || m.name || aid, universe: any ? any.N : null, marked: any ? any.n : null };
  };
  const label = (aid, cat) => (A[aid]?.labels || {})[cat] || String(cat).replace(/_/g, ' ');

  // ---- words --------------------------------------------------------------------------------------------------------
  const who = scoped => (scoped ? 'proteins of your selection' : `${W.marked} proteins`);
  const inWord = scoped => (scoped ? 'are in your selection' : `are ${W.marked}`);
  const alike = allStrat ? 'other proteins of similar abundance' : 'the other proteins each map places';
  const alikeShort = allStrat ? 'of similar abundance' : 'the map places';
  const others = `proteins without a ${W.mark}`;
  const here = 'proteins the map places here';
  const fxv = v => (v == null ? '–' : K.fxn(v));
  const orText = a => (a.l2 == null ? '–' : a.l2 === Infinity ? '∞' : a.l2 === -Infinity ? '0×' : K.fx(2 ** a.l2));
  const orWords = a => (a.l2 == null ? '' : a.l2 === Infinity ? 'found only here' : a.l2 === -Infinity ? 'never found here' : 'odds ratio ' + fxv(2 ** a.l2));
  const fq = K.fq;
  const and = xs => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '');
  const rowName = row => row.name || row.label;
  // a name inside a sentence: the site's in_text, else lower case unless it starts with an abbreviation (ER, P-bodies)
  const inText = row => row.in_text || (/^[A-Z][A-Z-]/.test(rowName(row)) ? rowName(row) : rowName(row).charAt(0).toLowerCase() + rowName(row).slice(1));
  const pc = (k, n) => (n ? (100 * k / n).toFixed(k / n < 0.1 ? 1 : 0) : '–');

  // ---- color of a comparison: u0-u3 / d0-d3 by size where q <= 0.05 and at least 1.1x, else ns; na where none ---------
  function tone(a) {
    if (!a || a.l2 == null) return 'na';
    if (a.q == null || a.q > PADJ || (Number.isFinite(a.l2) && Math.abs(a.l2) < MINL2)) return 'ns';
    const m = Math.abs(a.l2), s = m >= 2 ? 3 : m >= 1.2 ? 2 : m >= 0.5 ? 1 : 0;
    return (a.l2 > 0 ? 'u' : 'd') + s;
  }
  const dirOf = tn => (tn[0] === 'u' ? 'more' : tn[0] === 'd' ? 'less' : 'ns');

  // ---- a selection, tested again map by map: its proteins the map places against the map's other proteins, each
  // stratum of the covariate a table (Mantel–Haenszel, BH over the map's sets), from the counts of selection.json; a
  // map without strata, by the hypergeometric test. Not compared: a selection made with the map (or one reading the
  // same data), one that names its proteins, or a set holding every selected protein.
  // w:<cell id> (a part of the drawings chosen as a filter, by its key): the marks of proteins that a map places in the part,
  // any map counting. A selection made with a part is not compared against the maps that place it.
  const partRows = part => { for (const L of [LAYERS.part, LAYERS.region]) for (const [, rows] of L.groups) { const row = rows.find(r => r.part === part); if (row) return { L, row }; } return null; };
  const partPairs = part => { const x = partRows(part); return x ? x.L.cols.filter(aid => x.row.map[aid]).map(aid => [aid, x.row.map[aid]]) : []; };
  const partName = part => { const x = partRows(part); return x ? (D.front?.row_labels?.[ID]?.[part] || rowName(x.row)) : part; };
  const partUses = aid => (S.f['w:' + ID] || []).some(part => partPairs(part).some(([a]) => a === aid));
  const scopedNow = () => K.selOn() && !K.vsOn() && !!K.sel.data() && K.sel.testable();
  let memo = { c: null, maps: {} };
  function selTests(aid) {
    const SD = K.sel.data(), ps = SD?.protein_sets?.[aid];
    if (!ps) return null;
    const c = K.sel.compute();
    if (memo.c !== c) memo = { c, maps: {} };
    if (memo.maps[aid]) return memo.maps[aid];
    const inBg = new Set(ps.in_background), sel = [...(c.proteins || [])].filter(p => inBg.has(p)), n = sel.length, on = new Set(sel);
    const blocked = K.sel.madeWith(aid) || K.sel.namesProteins() || partUses(aid);
    const cv = ps.covariate, counts = cv?.counts, res = new Map(), tested = [];
    const at = counts ? Object.fromEntries(counts.codes.map((x, i) => [x, i])) : null;
    const nS = counts ? counts.codes.map(() => 0) : null;
    if (counts) sel.forEach(p => { const x = cv.proteins[p]; if (x) nS[at[x[1]]]++; });
    for (const [s, M, members] of ps.sets) {
      let k = 0; const kS = counts ? counts.codes.map(() => 0) : null;
      members.forEach(p => { if (on.has(p)) { k++; if (counts) kS[at[cv.proteins[p][1]]]++; } });
      const circular = !!n && (blocked || k === n);
      const x = { k, M, n, N: ps.N, circular, a: { l2: null, lo: null, hi: null, q: null } };
      if (n && !circular) {
        if (counts && counts.sets[s]) {
          const Ms = counts.sets[s], m = ST.mh(kS.map((ki, i) => [ki, nS[i] - ki, Ms[i] - ki, counts.N[i] - nS[i] - Ms[i] + ki]));
          x.a = { l2: L2(m.or === Infinity ? 1e300 : m.or), lo: m.lo ? Math.log2(m.lo) : null, hi: m.hi ? Math.log2(m.hi) : null, p: m.p, q: null };
        } else if (k) x.a = { l2: Math.log2((k / n) / (M / ps.N)), lo: null, hi: null, p: ST.hyperSF(k, ps.N, M, n), q: null };
        if (x.a.p != null && Number.isFinite(x.a.p)) tested.push(x.a);
      }
      res.set(s, x);
    }
    const q = ST.bh(tested.map(a => a.p)); tested.forEach((a, i) => { a.q = q[i]; });
    return (memo.maps[aid] = { n, N: ps.N, res, blocked });
  }
  const selText = x => (x.circular ? `${int(x.k)} of the ${int(x.M)} ${here} ${inWord(true)}; ${x.k === x.n ? 'every one of them is here, so there is nothing to compare' : 'the selection names its proteins or was made with this map, so it is not compared with it'}`
    : `${int(x.k)} of the ${int(x.M)} ${here} ${inWord(true)} (${int(x.n)} of the ${int(x.N)} proteins the map places); ${abundText(x.a)}`);
  function abundText(a) {
    if (!a || a.l2 == null) return 'not compared';
    const ci = a.lo != null && a.hi != null ? ` (95% CI ${fxv(2 ** a.lo)}–${fxv(2 ** a.hi)})` : '';
    return `${orWords(a)}${ci}, q ${fq(a.q)}${tone(a) === 'ns' ? ' (no clear difference)' : ''}`;
  }

  // ---- the two layers: regions (each map's regions question) and compartments (each map's own sets) ----------------
  const LAYERS = {
    region: { key: 'region', cols: REGMAPS.map(m => m.regions),
      groups: (C.regions || []).length && REGMAPS.length ? [[C.regions_title || 'Regions of the cell', C.regions.map(r => ({ ...r, map: Object.fromEntries(REGMAPS.map(m => [m.regions, r.set || r.label])) }))]] : [] },
    part: { key: 'part', cols: MAPS.map(m => m.analysis), groups: C.compartments.map(g => [g.group, g.rows.map(r => ({ ...r, map: Object.fromEntries(Object.entries(r.sets || {}).filter(([k]) => MAP[k])) }))]) },
  };
  const rowId = (L, gi, ri) => (L.key === 'region' ? 'r' : 'p') + gi + '.' + ri;
  const rowOf = id => { const L = LAYERS[id[0] === 'r' ? 'region' : 'part'], [gi, ri] = id.slice(1).split('.').map(Number); return L.groups[gi]?.[1][ri] ? [L, L.groups[gi][1][ri]] : [null, null]; };
  function gridCell(aid, cat, scoped) {
    const t = cat && T[aid]?.[cat];
    if (!t) return null;
    if (scoped) {
      const x = selTests(aid)?.res.get(cat);
      if (!x) return null;
      const a = x.circular ? { l2: null, q: null } : x.a;
      return { a, k: x.k, M: x.M, circular: x.circular, tone: x.circular ? 'na' : tone(a), x, t };
    }
    const a = adj(aid, t);
    return { a, k: t.k, M: t.M, tone: tone(a), t };
  }
  function cellTip(aid, cat, c, scoped) {
    const ds = DS(aid), head = `<b>${esc(ds.name)}</b>${ds.method ? ` (${esc(ds.method)}${ds.cells ? ', ' + esc(ds.cells) : ''})` : ''}: ${esc(label(aid, cat))}<br>`;
    if (scoped) return head + `<b>Your selection</b>: ${esc(selText(c.x))}<br><span class="muted">${esc(cap(who(false)))}: ${esc(abundText(adj(aid, c.t)))}</span>`;
    const t = c.t;
    return head + `Here: ${int(t.k)} of the ${int(t.n)} ${esc(who(false))} (${pc(t.k, t.n)}%), ${int(t.M - t.k)} of the ${int(t.N - t.n)} ${esc(others)} (${pc(t.M - t.k, t.N - t.n)}%)` +
      `<br><b>Against ${esc(stratified(aid) ? alike : 'the other proteins the map places')}</b>: ${esc(abundText(c.a))}`;
  }
  function rowSummary(L, row, scoped) {
    const all = L.cols.map(aid => [aid, gridCell(aid, row.map[aid], scoped)]).filter(([, c]) => c), cells = all.filter(([, c]) => !c.circular);
    const vals = cells.map(([, c]) => c.a.l2).filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y), h = vals.length / 2;
    const med = vals.length ? (vals.length % 2 ? vals[Math.floor(h)] : (vals[h - 1] + vals[h]) / 2) : null;
    const agree = cells.length && cells.filter(([, c]) => c.tone[0] === (med > 0 ? 'u' : 'd')).length * 2 >= cells.length;
    const up = cells.some(([, c]) => c.tone[0] === 'u'), down = cells.some(([, c]) => c.tone[0] === 'd');
    const tn = med == null ? 'na' : tone({ l2: med, q: agree ? 0 : 1 });
    return { row, L, cells: all, a: { l2: med }, tone: tn,
      value: tn === 'na' ? (all.length ? 'not compared' : 'not in these maps') : tn === 'ns' ? (up && down ? 'maps disagree' : 'no difference') : orText({ l2: med }),
      maps: cells.length ? cells.length + (cells.length === 1 ? ' map' : ' maps') : '' };
  }
  // every part a row colors, with its summary; a part a row colors only when it has no row of its own (also:)
  function parts(scoped) {
    if (ONE) return oneParts();
    const P = {}, within = {};
    for (const L of [LAYERS.part, LAYERS.region]) {
      L.groups.forEach(([, rows], gi) => rows.forEach((row, ri) => {
        if (row.part) P[row.part] = { ...rowSummary(L, row, scoped), id: rowId(L, gi, ri) };
        (row.also || []).forEach(k => { within[k] ||= row.part; });
      }));
    }
    return { P, within };
  }

  // ---- one protein (the protein page's card): the same drawings, each part colored when a map places the protein there ----
  // ONE is the protein's row of the site's proteins while its drawings are made; a part no map places it in stays outlined
  let ONE = null;
  const withOne = (p, f) => { ONE = p; try { return f(); } finally { ONE = null; } };
  function oneParts() {
    const P = {}, within = {};
    for (const L of [LAYERS.part, LAYERS.region]) {
      L.groups.forEach(([, rows], gi) => rows.forEach((row, ri) => {
        const hit = L.cols.filter(aid => row.map[aid] && K.sel.setHas(aid, row.map[aid], ONE.i));
        if (row.part && hit.length) P[row.part] = { row, L, id: rowId(L, gi, ri), cells: hit.map(aid => [aid, null]), tone: 'u2', value: 'placed here', maps: hit.length + (hit.length === 1 ? ' map' : ' maps') };
        (row.also || []).forEach(k => { within[k] ||= row.part; });
      }));
    }
    return { P, within };
  }
  // each map's word on the protein: its compartments, or that it places it in none, or does not place it
  function oneMaps(p) {
    const sd = K.sel.data(); if (!sd) return null;
    return MAPS.map(m => {
      const aid = m.analysis, ps = sd.protein_sets?.[aid], d = DS(aid);
      const sets = ps ? ps.sets.map(x => x[0]).filter(s => K.sel.setHas(aid, s, p.i)) : [];
      const placed = !!ps && (sets.length > 0 || (ps.in_background || []).includes(p.i));
      return { aid, name: d.name, method: d.method, cells: d.cells, placed, sets: sets.map(s => label(aid, s)) };
    });
  }
  const oneTsv = p => () => K.preamble(`${C.title || 'Where in the cell'}: ${p.gene || p.acc}`, 'the compartments each map places the protein in') +
    'map\tcompartment\n' + (oneMaps(p) || []).flatMap(r => (r.sets.length ? r.sets : [r.placed ? '(none of its compartments)' : '(not placed)']).map(x => [r.name, x].join('\t'))).join('\n') + '\n';
  function oneDrawings(p) {
    if (!K.sel.data() || !DRAWINGS.length) return '';
    TIPS = [];
    return DRAWINGS.map(d => {
      const k = 'p-' + d.drawing;
      FIGS[k] = { title: () => `${p.gene || p.acc}: the ${d.drawing}`, sub: () => `A part is colored when a map places ${p.gene || p.acc} there.`,
        make: () => withOne(p, () => DRAW[d.drawing](false)), tsv: oneTsv(p), note: () => 'Coloured: a map places the protein in that part. Dashed outline: no map does.' };
      return block(k, `The ${d.drawing}`, 'cell-fig cell-onep');
    }).join('');
  }
  K.cell = { maps: oneMaps, drawings: oneDrawings, name: m => DS(m).name };

  // ---- the page's drawing helpers: a registry of hover texts, the color classes, labels with leader lines -------------
  let TIPS = [];
  const tipAttr = html => ` data-cell-tip="${TIPS.push(html) - 1}"`;
  function draw(scoped) {
    const { P, within } = parts(scoped);
    const own = k => (P[k] ? k : within[k] && P[within[k]] ? within[k] : null);
    const tn = k => (own(k) ? P[own(k)].tone : 'na');
    const fill = k => 'cg-c ' + tn(k), line = k => 'cg-line ' + tn(k);
    const sig = p => p.tone[0] === 'u' || p.tone[0] === 'd';
    // dup: the drawing's label repeats the part's shape; it keeps the click but is hidden from keyboard and screen reader
    const tip = (k0, name, dup) => {
      const k = own(k0);
      if (!k) return '';
      const p = P[k];
      if (ONE) return tipAttr(`<b>${esc(name || rowName(p.row))}</b>: this protein is placed here by ${and(p.cells.map(([aid]) => esc(DS(aid).name)))}`);
      const only = p.cells.length === 1 && p.cells[0][1] && p.cells[0][1].M != null ? ', ' + p.cells[0][1].M + ' proteins' : '';
      const nm = `${name || rowName(p.row)}, ${sig(p) ? 'odds ratio ' : ''}${p.value}${sig(p) && p.maps ? ', ' + p.maps : ''}${only}`;
      return ` data-cell-part="${esc(k)}"` + (dup ? ' aria-hidden="true"' : ` role="button" tabindex="0" aria-label="${esc(nm)}"`) + tipAttr(`<b>${esc(name || rowName(p.row))}</b>: ${sig(p) ? 'odds ratio ' : ''}${esc(p.value)}${sig(p) ? (p.maps === '1 map' ? ' (1 map)' : ', median of ' + esc(p.maps)) : ''}<br>` +
        p.cells.map(([aid, c]) => esc(DS(aid).name) + ': ' + (c.circular ? 'not compared' : esc(orText(c.a)) + (c.a.q != null ? ', q ' + fq(c.a.q) : '') + (c.tone === 'ns' ? ' (no difference)' : ''))).join('<br>') +
        '<br><span class="muted">Click for its numbers and proteins</span>');
    };
    // labels: [{ k, side, x, y (the anchor), name }] in columns of width col, each side in the order of its anchors
    const labels = (items, Wd, H, col) => {
      let g = '';
      for (const side of ['l', 'r']) {
        const list = items.filter(it => it.side === side && own(it.k) === it.k).sort((a, b) => a.y - b.y), gap = 50, top = 30, bot = H - 26, ys = list.map(it => it.y);
        for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + gap : top);
        for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i < ys.length - 1 ? ys[i + 1] - gap : bot);
        list.forEach((it, i) => {
          const p = P[it.k], y = ys[i], left = side === 'l', edge = left ? col : Wd - col, tx = left ? edge - 14 : edge + 14, anc = left ? 'end' : 'start', bx = left ? edge - 7 : edge + 1;
          const elbow = left ? edge + 12 : edge - 12;
          g += `<g class="cd-label"${tip(it.k, it.name, true)}><polyline class="cd-lead" points="${edge},${y - 5} ${elbow},${y - 5} ${it.x},${it.y}"/><circle class="cd-dot" cx="${it.x}" cy="${it.y}" r="3"/>` +
            `<rect class="cd-hit" x="${left ? 0 : edge}" y="${y - 18}" width="${col}" height="38"/>` +
            `<rect class="${fill(it.k)} cd-o" x="${bx}" y="${y - 17}" width="6" height="32" rx="2"/>` +
            `<text class="cd-name" x="${tx}" y="${y}" text-anchor="${anc}">${esc(it.name || rowName(p.row))}</text>` +
            `<text class="cd-val" x="${tx}" y="${y + 16}" text-anchor="${anc}">${sig(p) ? `<tspan font-weight="700">${esc(p.value)}</tspan>` : `<tspan class="m">${esc(p.value)}</tspan>`}` +
            (p.maps ? `<tspan class="m"> · ${esc(p.maps)}</tspan>` : '') + '</text></g>';
        });
      }
      return g;
    };
    return { P, own, fill, line, tip, labels, has: k => !!own(k) };
  }

  // ---- geometry: smooth closed outlines, arcs, a mitochondrion, chromosome territories and their fibers --------------
  function smooth(pts) {
    const n = pts.length, P = i => pts[(i + n) % n], f = v => v.toFixed(1);
    let d = 'M' + f(P(0)[0]) + ',' + f(P(0)[1]);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = P(i - 1), [x1, y1] = P(i), [x2, y2] = P(i + 1), [x3, y3] = P(i + 2);
      d += 'C' + [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2].map(f).join(',');
    }
    return d + 'Z';
  }
  const blob = (cx, cy, rx, ry, f, rot = 0) => f.map((s, i) => { const t = (2 * Math.PI * i) / f.length + rot; return [cx + rx * s * Math.cos(t), cy + ry * s * Math.sin(t)]; });
  const arc = (cx, cy, rx, ry, a0, a1, step = 4) => { const pts = []; for (let t = a0; t <= a1 + 1e-9; t += step) { const r = t * Math.PI / 180; pts.push([cx + rx * Math.cos(r), cy + ry * Math.sin(r)]); } return pts; };
  const poly = pts => 'M' + pts.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join('L');
  function rayOut(x, y, t, cx, cy, rx, ry) {
    const r = t * Math.PI / 180, dx = Math.cos(r), dy = Math.sin(r), px = (x - cx) / rx, py = (y - cy) / ry, ux = dx / rx, uy = dy / ry;
    const a = ux * ux + uy * uy, b = 2 * (px * ux + py * uy), c = px * px + py * py - 1, s = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    return [x + s * dx, y + s * dy];
  }
  const mito = (cx, cy, len, wid, rot, cls) => {
    let z = '', up = true;
    for (let x = -len / 2 + 9; x <= len / 2 - 9; x += 7) { z += (z ? 'L' : 'M') + x.toFixed(1) + ',' + (up ? -wid / 2 + 3.5 : wid / 2 - 3.5); up = !up; }
    return `<g transform="translate(${cx} ${cy}) rotate(${rot})"><rect class="${cls} cd-o" x="${-len / 2}" y="${-wid / 2}" width="${len}" height="${wid}" rx="${wid / 2}"/>` +
      `<rect class="cd-in" x="${-len / 2 + 3}" y="${-wid / 2 + 3}" width="${len - 6}" height="${wid - 6}" rx="${wid / 2 - 3}"/><path class="cd-in" d="${z}"/></g>`;
  };
  // chromosome territories: an ellipse divided among seeds (Voronoi cells), each inset by half of gap, corners rounded
  function territoryPolys(seeds, cx, cy, rx, ry, gap) {
    const ring = [];
    for (let i = 0; i < 40; i++) { const t = (2 * Math.PI * i) / 40; ring.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
    const clip = (pg, nx, ny, c) => {
      const out = [];
      pg.forEach((p, i) => {
        const q = pg[(i + 1) % pg.length], dp = nx * p[0] + ny * p[1] - c, dq = nx * q[0] + ny * q[1] - c;
        if (dp <= 0) out.push(p);
        if ((dp < 0) !== (dq < 0)) { const u = dp / (dp - dq); out.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]); }
      });
      return out;
    };
    return seeds.map((s, i) => {
      let pg = ring;
      seeds.forEach((o, j) => {
        if (i === j) return;
        const nx = o[0] - s[0], ny = o[1] - s[1], len = Math.hypot(nx, ny);
        pg = clip(pg, nx / len, ny / len, (nx * (s[0] + o[0]) + ny * (s[1] + o[1])) / (2 * len) - gap / 2);
      });
      for (let k = 0; k < 2; k++) pg = pg.flatMap((p, m) => { const q = pg[(m + 1) % pg.length]; return [[0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]]; });
      return pg;
    });
  }
  const territories = (seeds, cx, cy, rx, ry, gap) => territoryPolys(seeds, cx, cy, rx, ry, gap).map(pg => poly(pg) + 'Z');
  // chromatin fiber in a territory: a seeded looping walk that turns back at the edge, as a smooth curve
  function fibre(pg, start, seed, steps, inset) {
    let st = seed * 2654435761 >>> 0;
    const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
        const [xi, yi] = pg[i], [xj, yj] = pg[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        const ex = xj - xi, ey = yj - yi, l2 = ex * ex + ey * ey || 1, u = Math.max(0, Math.min(1, ((x - xi) * ex + (y - yi) * ey) / l2));
        if (Math.hypot(x - xi - u * ex, y - yi - u * ey) < inset) return false;
      }
      return c;
    };
    let [x, y] = start, h = rnd() * 2 * Math.PI, curl = 0.5;
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      if (i % 9 === 0) curl = (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.45);
      let tries = 0, nx, ny;
      do { h += curl + (rnd() - 0.5) * 0.9 + (tries ? Math.PI * (0.6 + rnd() * 0.8) : 0); nx = x + 6.5 * Math.cos(h); ny = y + 6.5 * Math.sin(h); } while (!inside(nx, ny) && ++tries < 12);
      if (tries >= 12) continue;
      x = nx; y = ny; pts.push([x, y]);
    }
    let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (let i = 1; i < pts.length - 1; i++) d += 'Q' + pts[i][0].toFixed(1) + ',' + pts[i][1].toFixed(1) + ' ' + ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1) + ',' + ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1);
    return d;
  }
  const CT = [[330, 150], [300, 265], [360, 360], [450, 95], [465, 225], [480, 350], [600, 95], [615, 335], [705, 170], [715, 285]];

  // ---- the drawings: a cell, its nucleus drawn whole; the nucleus in its parts. Each part takes the color of the
  // median of the maps' comparisons, gray where they disagree or show no clear difference, outlined where no map
  // measures it; a measured part is named beside the drawing and opens its numbers --------------------------------------
  const DRAW = {
    cell(scoped) {
      const Dr = draw(scoped), Wd = 1000, H = 500, cx = 500, cy = 250, rx = 285, ry = 206;
      const shape = [1, 0.97, 1.02, 0.99, 1.03, 0.98, 1.01, 0.97, 1.02, 1, 0.98, 1.02], body = smooth(blob(cx, cy, rx, ry, shape));
      const nx = 452, ny = 262, nrx = 110, nry = 94, nuc = smooth(blob(nx, ny, nrx, nry, [1, 1.02, 0.98, 1.01, 0.99, 1.02, 1, 0.98]));
      let g = `<g${Dr.tip('cytosol')}><path class="${Dr.fill('cytosol')}" fill-opacity=".34" d="${body}"/></g>`;
      const [ox, oy] = [598, 352], mt = [-58, -30, -8, 14, 36, 62, 92, 122, 150, 172];
      const mtCurve = t => { const [ex, ey] = rayOut(ox, oy, t, cx, cy, rx * 0.91, ry * 0.9); return [ex, ey, (ox + ex) / 2 + (ey - oy) * 0.08, (oy + ey) / 2 - (ex - ox) * 0.08]; };
      g += `<g${Dr.tip('microtubules')}>` + mt.map(t => { const [ex, ey, mx, my] = mtCurve(t); return `<path class="${Dr.line('microtubules')}" fill="none" stroke-width="1.8" stroke-linecap="round" d="M${ox},${oy}Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}"/>`; }).join('') + '</g>';
      const [mex, mey, mmx, mmy] = mtCurve(36), u = 0.55, mtAt = [(1 - u) ** 2 * ox + 2 * u * (1 - u) * mmx + u * u * mex, (1 - u) ** 2 * oy + 2 * u * (1 - u) * mmy + u * u * mey];
      g += `<g${Dr.tip('actin')}><path class="${Dr.line('actin')}" fill="none" stroke-width="4" stroke-dasharray="7 3" d="${smooth(blob(cx, cy, rx * 0.955, ry * 0.94, shape))}"/></g>`;
      g += `<g${Dr.tip('pm')}><path class="${Dr.line('pm')}" fill="none" stroke-width="8" d="${body}"/><path class="cd-gap" stroke-width="1.6" d="${body}"/></g>`;
      let er = '', rib = '';
      [20, 34, 48].forEach((dr, i) => {
        const pts = arc(nx, ny, nrx + dr, nry + dr * 0.92, -140 + i * 6, 22 - i * 4, 3);
        er += `<path class="${Dr.line('er')}" fill="none" stroke-width="7" stroke-linecap="round" d="${poly(pts)}"/><path class="cd-gap" stroke-width="1.8" stroke-linecap="round" d="${poly(pts)}"/>`;
        arc(nx, ny, nrx + dr + 5.5, nry + (dr + 5.5) * 0.92, -136 + i * 6, 18 - i * 4, 7).forEach(([x, y]) => { rib += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.9"/>`; });
      });
      g += `<g${Dr.tip('er')}>${er}</g>`;
      for (const [x0, y0, t0] of [[622, 112, 0], [395, 392, 30], [580, 404, -20], [252, 212, 80]]) {
        for (let i = 0; i < 7; i++) { const t = (t0 + i * 26) * Math.PI / 180; rib += `<circle cx="${(x0 + 13 * Math.cos(t) + i * 2.4).toFixed(1)}" cy="${(y0 + 9 * Math.sin(t)).toFixed(1)}" r="2.2"/>`; }
      }
      g += `<g class="${Dr.fill('ribosomes')}"${Dr.tip('ribosomes')}>${rib}</g>`;
      let pores = '';
      for (let t = 0; t < 360; t += 26) { const r = t * Math.PI / 180, x = nx + nrx * Math.cos(r), y = ny + nry * Math.sin(r), qx = Math.cos(r) * 4, qy = Math.sin(r) * 4; pores += `<line class="cd-gap" stroke-width="3.2" x1="${(x - qx).toFixed(1)}" y1="${(y - qy).toFixed(1)}" x2="${(x + qx).toFixed(1)}" y2="${(y + qy).toFixed(1)}"/>`; }
      const sc = p => [nx + (p[0] - 500) * (nrx / 262), ny + (p[1] - 235) * (nry / 190)];
      g += `<g${Dr.tip('nucleus')}><path class="${Dr.fill('nucleus')}" fill-opacity=".85" d="${nuc}"/>` +
        territories(CT.map(sc), nx, ny, nrx - 5, nry - 5, 5).map(d => `<path class="cd-shade" d="${d}"/>`).join('') +
        `<path class="cd-shade" style="fill-opacity:.22" d="${smooth(blob(...sc([592, 214]), 25, 24, [1, 1.05, 0.95, 1.02, 0.97, 1.04, 1, 0.96]))}"/>` +
        `<path fill="none" class="cd-o" stroke-width="3.5" d="${nuc}"/><path class="cd-gap" stroke-width="1" d="${nuc}"/>${pores}</g>`;
      let golgi = '';
      for (let i = 0; i < 5; i++) {
        const x = 648 + i * 9, h = 40 - i * 4.5, d = `M${x},${206 - h}Q${x + 16},206 ${x},${206 + h}`;
        golgi += `<path class="${Dr.line('golgi')}" fill="none" stroke-width="6.5" stroke-linecap="round" d="${d}"/><path class="cd-gap" stroke-width="1.6" stroke-linecap="round" d="${d}"/>`;
      }
      golgi += [[640, 158, 4], [652, 252, 3.5], [700, 172, 4], [704, 240, 3.5], [714, 206, 3]].map(([x, y, r]) => `<circle class="${Dr.fill('golgi')} cd-o" cx="${x}" cy="${y}" r="${r}"/>`).join('');
      g += `<g${Dr.tip('golgi')}>${golgi}</g>`;
      g += `<g${Dr.tip('mito')}>` + [[312, 188, 66, 26, 66], [384, 112, 70, 26, -8], [350, 378, 64, 24, 40], [482, 386, 60, 22, 6], [748, 222, 56, 22, 82]].map(([x, y, l, w, r]) => mito(x, y, l, w, r, Dr.fill('mito'))).join('') + '</g>';
      g += `<g${Dr.tip('endolyso')}>` + [[720, 298, 13], [702, 334, 10], [258, 268, 9]].map(([x, y, r]) => `<circle class="${Dr.fill('endolyso')} cd-o" cx="${x}" cy="${y}" r="${r}"/>` +
        [[-0.35, -0.3], [0.3, -0.2], [0, 0.35]].map(([a, b]) => `<circle class="cd-in" cx="${(x + a * r).toFixed(1)}" cy="${(y + b * r).toFixed(1)}" r="${(r * 0.24).toFixed(1)}"/>`).join('')).join('') + '</g>';
      g += `<g${Dr.tip('perox')}>` + [[298, 232, 8], [684, 130, 7], [470, 432, 7]].map(([x, y, r]) => `<circle class="${Dr.fill('perox')} cd-o" cx="${x}" cy="${y}" r="${r}"/><rect class="cd-ink" x="${x - 2.5}" y="${y - 2.5}" width="5" height="5" transform="rotate(45 ${x} ${y})"/>`).join('') + '</g>';
      const drop = (k, x, y, r, s) => { const d = smooth(blob(x, y, r, r * 0.9, [1, 0.93, 1.05, 0.95, 1.03, 0.92, 1.04, 0.96, 1.02, 0.94], s));
        return `<path class="${Dr.line(k)}" fill="none" stroke-width="5" stroke-opacity=".35" d="${d}"/><path class="${Dr.fill(k)}" d="${d}"/>`; };
      g += `<g${Dr.tip('granules')}>` + [[302, 322, 14, 0], [548, 414, 12, 1], [560, 90, 11, 0.5]].map(([x, y, r, s]) => drop('granules', x, y, r, s)).join('') + '</g>';
      g += `<g${Dr.tip('pbodies')}>` + [[425, 420, 6], [730, 170, 6], [520, 112, 5], [274, 298, 5]].map(([x, y, r]) => drop('pbodies', x, y, r, 0)).join('') + '</g>';
      g += `<g${Dr.tip('centrosome')}><circle class="${Dr.fill('centrosome')}" fill-opacity=".45" cx="${ox}" cy="${oy}" r="17"/><rect class="${Dr.fill('centrosome')} cd-o" x="${ox - 9}" y="${oy - 3}" width="13" height="6" rx="1.5"/>` +
        `<rect class="${Dr.fill('centrosome')} cd-o" x="${ox + 1}" y="${oy - 3}" width="6" height="13" rx="1.5"/></g>`;
      const nucK = Dr.own('nucleus') || 'nucleus';
      g += Dr.labels([
        { k: 'cytosol', side: 'l', x: 470, y: 80 }, { k: 'mito', side: 'l', x: 306, y: 175 }, { k: 'perox', side: 'l', x: 298, y: 232 }, { k: 'actin', side: 'l', x: 225, y: 250 },
        { k: nucK, side: 'l', x: 372, y: 300 }, { k: 'granules', side: 'l', x: 302, y: 322 }, { k: 'pm', side: 'l', x: 353, y: 434 },
        { k: 'ribosomes', side: 'r', x: 635, y: 112 }, { k: 'pbodies', side: 'r', x: 730, y: 170 }, { k: 'golgi', side: 'r', x: 666, y: 206 }, { k: 'er', side: 'r', x: 609, y: 274 },
        { k: 'endolyso', side: 'r', x: 724, y: 296 }, { k: 'centrosome', side: 'r', x: ox + 6, y: oy + 8 }, { k: 'microtubules', side: 'r', x: +mtAt[0].toFixed(1), y: +mtAt[1].toFixed(1) },
      ], Wd, H, 200);
      return { g, W: Wd, H, aria: `The cell, each compartment colored by the odds ratio of ${who(scoped)}` };
    },
    nucleus(scoped) {
      const Dr = draw(scoped), Wd = 1000, H = 470, cx = 500, cy = 235, rx = 262, ry = 190;
      const shape = [1, 1.02, 0.98, 1.01, 0.99, 1.02, 1, 0.98, 1.01, 0.99], body = smooth(blob(cx, cy, rx, ry, shape));
      let g = `<g${Dr.tip('nucleoplasm')}><path class="${Dr.fill('nucleoplasm')}" fill-opacity=".55" d="${body}"/></g>`;
      const ct = territoryPolys(CT, cx, cy, rx - 12, ry - 12, 13);
      g += `<g${Dr.tip('chromatin')}>` + ct.map(pg => `<path class="${Dr.fill('chromatin')} cd-o" d="${poly(pg)}Z"/>`).join('') +
        '<g class="cd-fiber" fill="none" stroke="#1c1917" stroke-opacity=".14" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
        ct.map((pg, i) => `<path d="${fibre(pg, CT[i], i + 1, 150, 5)}"/>`).join('') + '</g></g>';
      g += `<g${Dr.tip('periphery')}><path class="${Dr.line('periphery')}" fill="none" stroke-width="9" d="${smooth(blob(cx, cy, rx * 0.965, ry * 0.955, shape))}"/></g>`;
      const nucleolus = smooth(blob(592, 214, 56, 50, [1, 1.06, 0.95, 1.04, 0.97, 1.05, 0.98, 1.03, 0.96, 1.02]));
      g += `<g${Dr.tip('perinucleolar')}><path class="${Dr.line('perinucleolar')}" fill="none" stroke-width="7" d="${nucleolus}"/></g>`;
      g += `<g${Dr.tip('nucleolus')}><path class="${Dr.fill('nucleolus')} cd-o" d="${nucleolus}"/>` +
        [[572, 198], [610, 204], [584, 234], [618, 236]].map(([x, y]) => `<circle class="cd-shade" cx="${x}" cy="${y}" r="10"/><circle class="cd-gap" stroke-width="5" cx="${x}" cy="${y}" r="3.2"/>`).join('') + '</g>';
      const cluster = (x, y, r) => [[0, 0, 0.62], [0.55, -0.3, 0.5], [-0.5, -0.35, 0.48], [0.45, 0.45, 0.5], [-0.5, 0.4, 0.46], [0, -0.62, 0.42], [0.05, 0.62, 0.4]]
        .map(([a, b, s]) => `<circle cx="${(x + a * r).toFixed(1)}" cy="${(y + b * r).toFixed(1)}" r="${(s * r).toFixed(1)}"/>`).join('');
      g += `<g class="${Dr.fill('speckles')} cd-o"${Dr.tip('speckles')}>` + [[377, 224, 19], [415, 294, 16], [522, 150, 15], [665, 310, 17], [420, 355, 13]].map(([x, y, r]) => cluster(x, y, r)).join('') + '</g>';
      g += `<g${Dr.tip('paraspeckles')}>` + [[349, 216, 74], [356, 212, 74], [653, 287, 27], [646, 283, 27]].map(([x, y, r]) =>
        `<ellipse class="${Dr.fill('paraspeckles')} cd-o" cx="${x}" cy="${y}" rx="3.4" ry="8" transform="rotate(${r} ${x} ${y})"/>`).join('') + '</g>';
      g += `<g${Dr.tip('pml')}>` + [[390, 122], [548, 342], [710, 228]].map(([x, y]) => `<circle class="${Dr.line('pml')}" fill="none" stroke-width="3.6" cx="${x}" cy="${y}" r="7"/>`).join('') + '</g>';
      g += `<g${Dr.tip('cajal')}>` + [[410, 166], [525, 95]].map(([x, y]) => `<circle class="${Dr.fill('cajal')} cd-o" cx="${x}" cy="${y}" r="7.5"/>`).join('') + '</g>';
      let gaps = '', pores = '';
      for (let t = 8; t < 368; t += 20) {
        const r = t * Math.PI / 180, x = cx + rx * Math.cos(r), y = cy + ry * Math.sin(r), qx = Math.cos(r) * 7, qy = Math.sin(r) * 7, px = -Math.sin(r) * 3.5, py = Math.cos(r) * 3.5;
        gaps += `<line class="cd-gap" stroke-width="5" x1="${(x - qx).toFixed(1)}" y1="${(y - qy).toFixed(1)}" x2="${(x + qx).toFixed(1)}" y2="${(y + qy).toFixed(1)}"/>`;
        pores += [1, -1].map(s => `<line class="${Dr.line('pores')}" stroke-width="2.6" stroke-linecap="round" x1="${(x - qx + s * px).toFixed(1)}" y1="${(y - qy + s * py).toFixed(1)}" x2="${(x + qx + s * px).toFixed(1)}" y2="${(y + qy + s * py).toFixed(1)}"/>`).join('');
      }
      g += `<g${Dr.tip('envelope')}><path class="${Dr.line('envelope')}" fill="none" stroke-width="11" d="${body}"/><path class="cd-gap" stroke-width="3" d="${body}"/>${gaps}</g>`;
      g += `<g${Dr.tip('pores')}>${pores}</g>`;
      g += Dr.labels([
        { k: 'pml', side: 'l', x: 390, y: 122 }, { k: 'bodies', side: 'l', x: 410, y: 166 }, { k: 'cajal', side: 'l', x: 525, y: 95 }, { k: 'chromatin', side: 'l', x: 322, y: 160 }, { k: 'speckles', side: 'l', x: 379, y: 234 }, { k: 'nucleoplasm', side: 'l', x: 330, y: 312 },
        { k: 'nucleolus', side: 'r', x: 620, y: 190 }, { k: 'envelope', side: 'r', x: 762, y: 240 }, { k: 'perinucleolar', side: 'r', x: 606, y: 262 }, { k: 'paraspeckles', side: 'r', x: 653, y: 287 }, { k: 'periphery', side: 'r', x: 729, y: 312 }, { k: 'pores', side: 'r', x: 675, y: 376 },
      ], Wd, H, 200);
      return { g, W: Wd, H, aria: `The nucleus, each part colored by the odds ratio of ${who(scoped)}` };
    },
  };

  // ---- the grids: rows of a layer against its maps ---------------------------------------------------------------------
  function gridSvg(L, scoped) {
    const cols = L.cols, LW = L.key === 'region' ? 190 : 300, CW = 100, RH = 24, HH = 46, Wd = LW + cols.length * CW + 8;
    let y = HH + 4, g = '';
    cols.forEach((aid, i) => {
      const ds = DS(aid), x = LW + i * CW + CW / 2;
      g += `<text class="cg-h" x="${x}" y="14" text-anchor="middle">${esc(ds.short)}</text><text class="cg-m" x="${x}" y="28" text-anchor="middle">${esc(ds.method || '')}</text>` +
        (ds.cells ? `<text class="cg-m" x="${x}" y="41" text-anchor="middle">${esc(ds.cells)}</text>` : '');
    });
    L.groups.forEach(([group, rows], gi) => {
      if (L.key !== 'region') { g += `<text class="cg-g" x="0" y="${y + 14}">${esc(group.toUpperCase())}</text>`; y += RH; }
      rows.forEach((row, ri) => {
        g += `<g class="cg-row" data-cell-row="${rowId(L, gi, ri)}" role="button" tabindex="0" aria-label="${esc(row.label + ': open its numbers and members')}"><rect class="cg-hit" x="0" y="${y}" width="${Wd}" height="${RH}"/><text class="cg-r" x="10" y="${y + 16}">${esc(row.label)}</text>`;
        cols.forEach((aid, i) => {
          const c = gridCell(aid, row.map[aid], scoped), x = LW + i * CW + 4;
          if (!c) { g += `<rect class="cg-c na" x="${x}" y="${y + 2}" width="${CW - 8}" height="${RH - 4}" rx="3"/>`; return; }
          g += `<g${tipAttr(cellTip(aid, row.map[aid], c, scoped))}><rect class="cg-c ${c.tone}" x="${x}" y="${y + 2}" width="${CW - 8}" height="${RH - 4}" rx="3"/>` +
            `<text class="cg-t t${c.tone.slice(1)}" x="${x + (CW - 8) / 2}" y="${y + 16}" text-anchor="middle">${esc(c.circular ? '·' : orText(c.a))}</text></g>`;
        });
        g += '</g>';
        y += RH;
      });
      y += 6;
    });
    return { g, W: Wd, H: y, aria: `${L.key === 'region' ? 'Regions' : 'Compartments'} against maps: the odds ratio of ${who(scoped)} in each` };
  }
  const v6 = u => (u == null ? '' : Number.isFinite(u) ? String(+u.toFixed(4)) : u > 0 ? 'Inf' : '-Inf');
  function gridTsv(L, scoped) {
    const head = scoped ? 'group\tcompartment\tmap\tmap_category\tmembers\tselected\tselected_placed\tplaced\tlog2_odds_ratio\tlog2_ci_low\tlog2_ci_high\tp\tq\tnot_compared\n'
      : 'group\tcompartment\tmap\tmap_category\tmembers\tmarked\tlog2_fold_enrichment\tq\tlog2_odds_ratio_within_strata\tlog2_ci_low\tlog2_ci_high\tq_within_strata\n';
    const body = L.groups.flatMap(([group, rows]) => rows.flatMap(row => L.cols.filter(aid => row.map[aid] && T[aid]?.[row.map[aid]]).map(aid => {
      const t = T[aid][row.map[aid]], name = DS(aid).name;
      if (!scoped) { const a = stratified(aid) ? adj(aid, t) : { l2: null, lo: null, hi: null, q: null }; return [group, row.label, name, row.map[aid], t.M, t.k, v6(L2(t.fold)), t.fq ?? '', v6(a.l2), v6(a.lo), v6(a.hi), a.q ?? ''].join('\t'); }
      const x = selTests(aid)?.res.get(row.map[aid]);
      if (!x) return [group, row.label, name, row.map[aid], t.M, '', '', '', '', '', '', '', '', 'no selection data'].join('\t');
      return [group, row.label, name, row.map[aid], x.M, x.k, x.n, x.N, v6(x.a.l2), v6(x.a.lo), v6(x.a.hi), x.a.p ?? '', x.a.q ?? '',
        x.circular ? (x.k === x.n ? 'every selected protein is here' : 'selection named its proteins or was made with this map') : ''].join('\t');
    })));
    return K.preamble(`${C.title || 'Where in the cell'}: ${L.key === 'region' ? 'regions' : 'compartments'} against maps`,
      `${who(scoped)} in each map, against ${alike}${allStrat ? ' (Mantel–Haenszel odds ratio over the abundance strata, BH within each map)' : ''}; members: ${here}`) + head + body.join('\n') + '\n';
  }

  // ---- one map at a time: its compartments as bars of the fold enrichment, marked by the comparison within the strata --
  const UI = { map: MAPS[0].analysis, row: null, at: null, all: false };
  const MARK = { more: ['✓', 'more than expected'], same: ['≈', 'about the same (within 1.1×)'], ns: ['○', 'no difference'], less: ['▼', 'fewer than expected'] };
  const markOf = a => { if (!a || a.l2 == null || a.q == null) return null; if (a.q > PADJ) return 'ns'; if (Number.isFinite(a.l2) && Math.abs(a.l2) < MINL2) return 'same'; return a.l2 > 0 ? 'more' : 'less'; };
  function barRows(aid, scoped) {
    const m = MAP[aid], min = m.min_members || 1, sel = scoped ? Object.fromEntries((K.sel.rows(aid, 'enricher') || []).map(r => [r.category, r])) : null;
    return Object.values(T[aid] || {}).filter(t => t.M >= min && t.fold != null).map(t => {
      const s = sel?.[t.cat], x = scoped ? selTests(aid)?.res.get(t.cat) : null;
      const fold = scoped ? (s ? s.fold : null) : t.fold, q = scoped ? (s ? s.q : null) : t.fq;
      return { cat: t.cat, label: label(aid, t.cat), t, k: scoped ? (s ? s.a : 0) : t.k, M: t.M, l2: fold ? Math.log2(fold) : null, q, sig: q != null && q <= PADJ,
        mark: markOf(scoped ? (x && !x.circular ? x.a : null) : adj(aid, t)), descriptive: !!s?.descriptive, x };
    }).sort((a, b) => (b.l2 ?? -99) - (a.l2 ?? -99));
  }
  function barsSvg(aid, scoped) {
    const rows = barRows(aid, scoped), LW = 300, CW = 80, BW = 300, RH = 20, Wd = LW + CW + BW + 70, top = 18;
    const ext = Math.max(1, Math.ceil(Math.max(...rows.map(r => (r.l2 == null || !Number.isFinite(r.l2) ? 0 : Math.abs(r.l2))), 0)));
    const X = v => LW + CW + BW / 2 + Math.max(-1, Math.min(1, v / ext)) * BW / 2;
    let g = `<text class="cg-m" x="${LW + CW - 6}" y="12" text-anchor="end">${scoped ? 'selected/placed' : W.marked + '/placed'}</text>`;
    for (let k = -ext; k <= ext; k++) g += `<line class="${k ? 'cb-grid' : 'cb-one'}" x1="${X(k)}" x2="${X(k)}" y1="${top - 4}" y2="${top + rows.length * RH}"/>` + (k % (ext > 3 ? 2 : 1) === 0 ? `<text class="cg-m" x="${X(k)}" y="${top + rows.length * RH + 13}" text-anchor="middle">${2 ** k >= 1 ? 2 ** k : '1/' + 2 ** -k}×</text>` : '');
    rows.forEach((r, i) => {
      const y = top + i * RH, v = r.l2 == null ? null : Math.max(-ext, Math.min(ext, r.l2)), dir = r.l2 == null ? 'ns' : r.sig ? (r.l2 > 0 ? 'more' : 'less') : 'ns';
      const tip = `<b>${esc(r.label)}</b> · ${esc(DS(aid).name)}<br>${scoped ? `${int(r.k)} of the ${int(r.M)} ${esc(here)} ${esc(inWord(true))}` : `${int(r.t.k)} of the ${int(r.t.M)} ${esc(here)} ${esc(inWord(false))} (${pc(r.t.k, r.t.M)}%), against ${pc(r.t.n, r.t.N)}% of all ${int(r.t.N)}`}` +
        (r.l2 != null ? `; ${K.fxn(2 ** r.l2)} times the share, q ${fq(r.q)}${r.descriptive ? ' (shown, not tested)' : ''}` : '') +
        (r.mark ? `<br>Against ${esc(stratified(aid) ? alike : 'the other proteins the map places')}: ${esc(MARK[r.mark][1])}` : '') + `<br><span class="muted">Click to select the ${esc(W.marks)} on its proteins</span>`;
      g += `<g class="cb-row" data-cell-bar="${esc(r.cat)}" role="button" tabindex="0"${tipAttr(tip)}><rect class="cg-hit" x="0" y="${y}" width="${Wd}" height="${RH}"/><text class="cg-r" x="${LW - 8}" y="${y + 14}" text-anchor="end">${esc(r.label)}</text>` +
        `<text class="cg-m" x="${LW + CW - 6}" y="${y + 14}" text-anchor="end">${int(r.k)}/${int(r.M)}</text>` +
        (v == null ? '' : `<rect class="cb-bar ${dir}${r.sig ? '' : ' hollow'}" x="${Math.min(X(0), X(v))}" y="${y + 4}" width="${Math.max(1, Math.abs(X(v) - X(0)))}" height="${RH - 8}" rx="2"/>`) +
        `<text class="cb-val ${dir}" x="${X(ext) + 6}" y="${y + 14}">${r.l2 == null ? '–' : K.fx(2 ** r.l2)}${r.mark ? ' ' + MARK[r.mark][0] : ''}</text></g>`;
    });
    return { g, W: Wd, H: top + rows.length * RH + 20, aria: `${DS(aid).name}: the fold enrichment of ${who(scoped)} in each compartment` };
  }
  function barsTsv(aid, scoped) {
    const rows = barRows(aid, scoped);
    return K.preamble(`${C.title || 'Where in the cell'}: ${DS(aid).name}`, `each compartment holding at least ${MAP[aid].min_members || 1} proteins: ${who(scoped)} placed there, the fold enrichment against all the proteins the map places (one-sided hypergeometric, BH)${stratified(aid) ? ', and the comparison within the abundance strata (Mantel–Haenszel)' : ''}`) +
      'compartment\tname\tmembers\t' + (scoped ? 'selected' : 'marked') + '\tlog2_fold_enrichment\tq\twithin_strata\n' +
      rows.map(r => [r.cat, r.label, r.M, r.k, v6(r.l2), r.q ?? '', r.mark ? MARK[r.mark][1] : ''].join('\t')).join('\n') + '\n';
  }

  // ---- the figures, on the page and exported ---------------------------------------------------------------------------
  const svgOf = (f, cls, role = 'group') => `<svg class="${cls}" viewBox="0 0 ${f.W} ${f.H}" style="max-width:${f.W}px" role="${role}" aria-label="${esc(f.aria)}">${f.g}</svg>`;
  // an export takes the light palette and inline styles (PDF and PNG renderers read no stylesheet)
  const EXPORT_VARS = '--ink:#111827;--ink-2:#374151;--muted:#5f6f78;--line:#e0e8eb;--line-strong:#c7d4d9;--surface:#ffffff;--accent:#c2410c;--more:#b42318;--less:#334155;' +
    TONES.light.map(([k, v]) => `--t-${k}:${v};`).join('');
  function inlined(f) {
    const holder = document.createElement('div');
    holder.className = 'cell-x';
    holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${f.W}px;${EXPORT_VARS}`;
    holder.innerHTML = svgOf(f, 'cell-x-svg', 'img');
    document.body.appendChild(holder);
    const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-weight'];
    try {
      holder.querySelectorAll('svg *').forEach(n => {
        if (n.tagName === 'title') return;
        const cs = getComputedStyle(n);
        PROPS.forEach(p => { const v = cs.getPropertyValue(p); if (v && !(p === 'stroke-dasharray' && v === 'none') && !(p === 'opacity' && v === '1')) n.setAttribute(p, v); });
        ['class', 'data-cell-tip', 'data-cell-part', 'data-cell-row', 'data-cell-bar', 'role', 'tabindex', 'aria-label', 'style'].forEach(a => n.removeAttribute(a));
      });
      return holder.firstElementChild.innerHTML;
    } finally { holder.remove(); }
  }
  function exported(make, title, sub, note) {
    const f = make(), s = Math.min(1, 1000 / f.W);
    return K.figureFrame({ title, sub, W: Math.round(f.W * s) + 40, body: `<g transform="translate(20,0) scale(${s})">${inlined(f)}</g>`, bodyH: f.H * s,
      note: note || `${keyWords()} ${testWords()}`, extra: { question: ID } });
  }
  const keyWords = () => `Red: ${who(scopedNow())} are more likely to be found there than ${alike}. Slate: less likely, deeper for larger odds ratios. Grey: no clear difference, or the maps disagree. Dashed outline: no map measures it.`;
  const testWords = () => (allStrat ? `In each map, ${who(scopedNow())} against ${alike}: Mantel–Haenszel odds ratio across the abundance strata, continuity-corrected Cochran–Mantel–Haenszel test, Benjamini–Hochberg within the map, colored at q ≤ ${PADJ} and 1.1× or more. A part of a drawing takes the median odds ratio of the maps that place proteins there, colored when at least half of them find a difference that way.`
    : `In each map, ${who(scopedNow())} against the other proteins the map places (fold enrichment, one-sided hypergeometric test, Benjamini–Hochberg within the map). A part takes the median of the maps that have it.`);
  const FIGS = {
    regions: { title: () => `${C.title || 'Where in the cell'}: regions against maps`, sub: () => `The odds ratio of ${who(scopedNow())} against ${alike}, for each region in each map.`, make: () => gridSvg(LAYERS.region, scopedNow()), tsv: () => gridTsv(LAYERS.region, scopedNow()) },
    grid: { title: () => `${C.title || 'Where in the cell'}: compartments against maps`, sub: () => `The odds ratio of ${who(scopedNow())} against ${alike}, for each compartment in each map.`, make: () => gridSvg(LAYERS.part, scopedNow()), tsv: () => gridTsv(LAYERS.part, scopedNow()) },
    one: { title: () => `${C.title || 'Where in the cell'}: ${DS(UI.map).name}`, sub: () => { const d = DS(UI.map), at = [d.ref, d.cells].filter(Boolean).join(', '); return `${d.name}${at ? ' (' + at + ')' : ''}${d.how ? ': ' + d.how : ''}`; }, make: () => barsSvg(UI.map, scopedNow()), tsv: () => barsTsv(UI.map, scopedNow()),
      note: () => `Bars: share of ${who(scopedNow())} among the ${here} over their share of all the proteins the map places (log2), filled at q ≤ ${PADJ}. Marks: the same against ${alike} (✓ more likely, ≈ about the same, ○ no clear difference, ▼ less likely).` },
  };
  DRAWINGS.forEach(d => { FIGS[d.drawing] = { title: () => d.title || C.title || 'Where in the cell', sub: () => `Odds ratio of ${who(scopedNow())} against ${alike}, as the median of the maps that have each part.`, make: () => DRAW[d.drawing](scopedNow()), tsv: () => gridTsv(LAYERS.part, scopedNow()) }; });
  // ---- for another page's card: the drawings and the parts' values, without the cell page ----------------------------------
  // K.cell.list() the drawings [{ drawing, title, parts, crop }]; K.cell.parts(scoped?) every part a row colors, with its value
  // [{ part, drawings, row, id, tone, direction, value, l2, or, maps, cells }] ('more', 'less', 'ns' or 'na'; the median of the maps
  // that have it, and each map's own); K.cell.draw(el, drawing, { scoped, crop, labels, onPart }) draws a drawing into el as the page does
  // (crop: true for the kit's phone crop of it, or [x, y, w, h]; labels: false leaves out the leader-line labels; onPart(part, info)
  // takes a click or Enter on a part in place of opening the cell page) and returns { drawing, W, H, parts }. Hover texts are kept
  // for the last drawing made, so a page draws the cell once at a time.
  const crops = D.cell_crops || {};
  const toneDir = tn => (tn[0] === 'u' ? 'more' : tn[0] === 'd' ? 'less' : tn);
  function partValues(scoped = scopedNow()) {
    const { P } = parts(scoped);
    return Object.entries(P).map(([part, p]) => ({
      part, drawings: DRAWINGS.filter(d => PARTS[d.drawing].includes(part)).map(d => d.drawing), row: rowName(p.row), id: p.id, tone: p.tone, direction: toneDir(p.tone),
      value: p.value, l2: p.a?.l2 ?? null, or: p.a?.l2 == null ? null : 2 ** p.a.l2, maps: p.cells.filter(([, c]) => !c.circular).length,
      cells: p.cells.filter(([, c]) => !c.circular).map(([aid, c]) => ({ map: aid, name: DS(aid).name, l2: c.a.l2 ?? null, q: c.a.q ?? null, tone: c.tone })),
    }));
  }
  function drawInto(el, drawing, o = {}) {
    const d = DRAWINGS.find(x => x.drawing === (drawing || DRAWINGS[0]?.drawing));
    if (!el || !d || !DRAW[d.drawing]) return null;
    const scoped = o.scoped ?? scopedNow();
    TIPS = [];
    const f = DRAW[d.drawing](scoped);
    el.innerHTML = svgOf(f, 'cell-svg cell-' + d.drawing);
    const sv = el.firstElementChild, crop = o.crop === true ? crops[d.drawing] : Array.isArray(o.crop) ? o.crop : null;
    if (crop) { sv.setAttribute('viewBox', crop.join(' ')); sv.style.maxWidth = crop[2] + 'px'; }
    if (o.labels === false) sv.querySelectorAll('.cd-label').forEach(n => n.remove());
    const info = Object.fromEntries(partValues(scoped).map(x => [x.part, x]));
    if (el._cellOnPart) el.removeEventListener('click', el._cellOnPart, true);
    el._cellOnPart = o.onPart ? (e => {
      const g = e.target.closest?.('[data-cell-part]'); if (!g) return;
      e.stopPropagation(); o.onPart(g.dataset.cellPart, info[g.dataset.cellPart] || null);
    }) : null;
    if (el._cellOnPart) el.addEventListener('click', el._cellOnPart, true);
    requestAnimationFrame(grow);
    return { drawing: d.drawing, W: f.W, H: f.H, parts: Object.values(info).filter(x => x.drawings.includes(d.drawing)) };
  }
  K.filterKinds = { ...(K.filterKinds || {}), w: {
    valid: id => id === ID,
    label: () => (D.front?.cards || []).find(c => c.cell)?.chip || C.title || 'Where in the cell',
    value: (id, v) => partName(v),
    test: (id, vals) => { const pairs = vals.flatMap(partPairs); return m => pairs.some(([a, s]) => K.sel.setHas(a, s, m[0])); },
  } };
  Object.assign(K.cell, { partName, list: () => DRAWINGS.map(d => ({ drawing: d.drawing, title: d.title || d.drawing, parts: PARTS[d.drawing], crop: crops[d.drawing] || null })), parts: partValues, draw: drawInto });

  const figName = k => `${D.site.id}_${ID}_${k === 'one' ? UI.map : k}`;
  const block = (k, head, cls) => `<div class="cell-block ${cls}" id="cell-${k}"><div class="fig-head"><span class="flabel">${esc(head)}</span>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'cell-exp', head, ID).replace(/data-cell-exp="(\w+)"/g, `data-cell-exp="$1" data-cell-fig="${k}"`)}</div>` +
    `<div class="cell-scroll">${svgOf(FIGS[k].make(), 'cell-svg cell-' + k)}</div></div>`;

  // ---- the tile and the page --------------------------------------------------------------------------------------------
  function summaries(scoped) {
    const regs = LAYERS.region.groups.length ? LAYERS.region.groups[0][1].map(row => rowSummary(LAYERS.region, row, scoped)) : [];
    const { P } = parts(scoped);
    const up = Object.values(P).filter(p => p.L === LAYERS.part && p.tone[0] === 'u').sort((a, b) => b.a.l2 - a.a.l2);
    return { regs, up };
  }
  function lead(regs, up, scoped, short) {
    const num = x => (short ? '' : ` (${esc(orText(x.a))})`), one = x => `<b>${esc(inText(x.row))}</b>${num(x)}`;
    const more = regs.filter(x => x.tone[0] === 'u').sort((a, b) => b.a.l2 - a.a.l2), less = regs.filter(x => x.tone[0] === 'd').sort((a, b) => a.a.l2 - b.a.l2);
    const none = `${cap(who(scoped))} are not enriched in any part of the cell.`;
    if (short) {
      if (more.length || less.length) return cap((more.length ? 'more often in ' + and(more.map(one)) : '') + (more.length && less.length ? '. Less in ' : less.length ? 'less often in ' : '') + and(less.map(one))) + '.';
      return regs.length ? `About as often in each region as ${esc(alike)}.` : up.length ? `Most of all in ${and(up.slice(0, 3).map(one))}.` : none;
    }
    let t = more.length || less.length ? `${cap(who(scoped))} are found ${more.length ? 'more often in ' + and(more.map(one)) : ''}${more.length && less.length ? ', and ' : ''}${less.length ? 'less often in ' + and(less.map(one)) : ''} than ${esc(alike)}${regs.some(x => x.cells.length > 1) ? ' (the median of the maps)' : ''}`
      : regs.length ? `${cap(who(scoped))} are found in each region about as often as ${esc(alike)}` : '';
    const most = up.slice(0, 3).map(one);
    if (most.length) t += t ? `. Within them, most of all in ${and(most)}` : `${cap(who(scoped))} are most enriched in ${and(most)}`;
    return t ? t + '.' : none;
  }
  // a forest of rows on one log2 axis, in the kit's tile look; each row's hover gives its maps
  function forest(items) {
    if (!items.length) return '';
    const vals = items.filter(x => !x.head).map(x => x.a.l2).filter(v => v != null && Number.isFinite(v));
    const lo = Math.min(-1, Math.max(-4, Math.floor(Math.min(...vals)))), hi = Math.max(1, Math.min(6, Math.ceil(Math.max(...vals))));
    const X = v => ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo) * 100).toFixed(2) + '%';
    const grid = []; for (let k = lo; k <= hi; k++) grid.push(`<line class="${k === 0 ? 'one' : 'grid'}" x1="${X(k)}" x2="${X(k)}" y1="0" y2="100%"/>`);
    return items.map(x => {
      if (x.head) return `<div class="cell-thead">${esc(x.head)}</div>`;
      const d = dirOf(x.tone), l2 = x.a.l2 == null ? null : Number.isFinite(x.a.l2) ? x.a.l2 : x.a.l2 > 0 ? hi : lo;
      return `<div class="trow"${tipAttr(x.tip)}><span class="lab">${esc(x.name)}</span><svg aria-hidden="true">${grid.join('')}` +
        (l2 == null ? '' : `<circle class="dot ${d}" cx="${X(l2)}" cy="50%" r="4.6"/>`) + `</svg><span class="val ${d}">${esc(x.a.l2 == null ? '–' : orText(x.a))}</span></div>`;
    }).join('') + `<div class="taxis"><span></span><span class="one-lab" style="--x:${X(0)}">1×</span><span></span></div>` + (K.LESS_MORE || '');
  }
  const sumTip = (x, scoped) => `<b>${esc(rowName(x.row))}</b><br>${esc(cap(who(scoped)))} against ${esc(alike)}${x.cells.length > 1 ? ', the median of ' + esc(x.maps) : ''}:<br>` +
    x.cells.map(([aid, c]) => esc(DS(aid).name) + ' ' + (c.circular ? 'not compared' : esc(orText(c.a)) + (c.a.q != null ? ', q ' + fq(c.a.q) : ''))).join('<br>');
  function tile(card) {
    TIPS = [];
    const scoped = scopedNow(), { regs, up } = summaries(scoped);
    const items = [...regs.map(x => ({ ...x, name: rowName(x.row), tip: sumTip(x, scoped) })),
      ...(up.length ? [{ head: 'Most of all' }, ...up.slice(0, 3).map(x => ({ ...x, name: rowName(x.row), tip: sumTip(x, scoped) }))] : [])];
    const note = K.selOn() && !scoped ? `<p class="twhole"><span>Whole dataset</span> ${K.vsOn() ? 'the maps compare proteins, not marks: shown for all ' + esc(W.marked) + ' proteins' : 'the selection is too small to test'}</p>` : '';
    // card.drawing: the drawing of the cell itself on the tile (true: the first of website.cell.drawings, or one by id);
    // its parts keep their hover and lose their click, which here opens the question (selecting is on its page)
    const dw = card.drawing ? DRAWINGS.find(d => d.drawing === card.drawing) || DRAWINGS[0] : null;
    const fig = dw ? `<div class="cell-scroll cell-tile-fig">${svgOf(FIGS[dw.drawing].make(), 'cell-svg cell-' + dw.drawing, 'img').replace(/<g [^>]*>/g, g => g.replace(/ (data-cell-(?:row|part|bar)|tabindex|role="button"|aria-label|aria-hidden)(="[^"]*")?/g, ''))}</div>` : '';
    return `<article class="tile${dw ? ' wide' : ''}" id="tile-${esc(ID)}" data-tile="${esc(ID)}" tabindex="0"><header><h3>${esc(card.title || C.title || 'Where in the cell')}</h3>${K.detailsLink(ID)}</header>` + fig +
      `<div class="trows">${forest(items)}</div><p class="tfoot">${lead(regs, up, scoped, true)}</p>${note}</article>`;
  }
  const colourKey = () => `<p class="key cell-keys"><span class="cell-key"><i class="cg-k u3"></i><i class="cg-k u1"></i> more likely than ${esc(alike)}</span><span class="cell-key"><i class="cg-k ns"></i> no clear difference</span>` +
    `<span class="cell-key"><i class="cg-k d1"></i><i class="cg-k d3"></i> less likely</span><span class="cell-key"><i class="cg-k na"></i> not measured</span><span>numbers: odds ratios (in the drawings, the median of the maps)</span></p>`;
  // the members of a row: the marked proteins (or the selection's) each map places in the row's compartment
  function members(L, row, scoped) {
    const SD = K.sel.data();
    if (!SD) return null;
    const on = scoped ? K.sel.compute().proteins : null, out = new Map();
    for (const aid of L.cols) {
      const s = row.map[aid], set = s && (SD.protein_sets?.[aid]?.sets || []).find(x => x[0] === s);
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
    const s = rowSummary(L, row, scoped), wh = who(scoped), sig = s.tone[0] === 'u' || s.tone[0] === 'd';
    const verdict = sig ? `${cap(wh)} are <b>${s.tone[0] === 'u' ? 'more' : 'less'} likely</b> to be found here than ${esc(alike)} (${esc(orWords(s.a))}${s.cells.length > 1 ? ', the median of ' + s.maps : ''}).`
      : s.tone === 'ns' ? (s.value === 'maps disagree' ? `The maps disagree. In some, ${esc(wh)} are more likely to be found here than ${esc(alike)}, in others less likely.` : `${cap(wh)} are found here about as often as ${esc(alike)}.`) : `No map compares ${esc(wh)} here.`;
    const cols = L.cols.filter(aid => row.map[aid]);
    const two = (k1, n1, w1, k2, n2, w2) => `${int(k1)} of ${int(n1)} ${esc(w1)} (${pc(k1, n1)}%)<br>${int(k2)} of ${int(n2)} ${esc(w2)} (${pc(k2, n2)}%)`;
    const cmp = a => (!a || a.l2 == null ? '–' : `<b>${esc(orText(a))}</b>${a.lo != null && a.hi != null ? ` <span class="muted">(${K.fx(2 ** a.lo)}–${K.fx(2 ** a.hi)})</span>` : ''}, q ${fq(a.q)} · ${esc(MARK[markOf(a)]?.[1] || '')}`);
    const trs = cols.map(aid => {
      const ds = DS(aid), t = T[aid]?.[row.map[aid]], c = gridCell(aid, row.map[aid], scoped);
      const counts = !t ? '–' : scoped ? (c?.x ? two(c.x.k, c.x.n, 'of your selection', c.x.M - c.x.k, c.x.N - c.x.n, 'others') : '–') : two(t.k, t.n, W.marked, t.M - t.k, t.N - t.n, `without a ${W.mark}`);
      return `<tr><th scope="row">${ds.url ? `<a href="${esc(ds.url)}" target="_blank" rel="noopener">${esc(ds.name)}</a>` : esc(ds.name)}<br><span class="muted small">${esc([ds.method, ds.cells].filter(Boolean).join(', '))}</span></th>` +
        `<td>${esc(label(aid, row.map[aid]))}</td><td>${counts}</td><td>${!c ? '–' : c.circular ? 'not compared' : cmp(c.a)}</td></tr>`;
    }).join('');
    const mem = members(L, row, scoped), shown = mem ? (UI.all ? mem : mem.slice(0, 150)) : [], multi = cols.length > 1;
    return `<div class="cell-detail" id="cell-detail"><div class="cell-detail-head"><h4>${esc(rowName(row))}</h4><button class="btn quiet small" type="button" data-cell-close aria-label="Close">Close</button></div>` +
      `<p>${verdict}</p><div class="tbl-wrap"><table class="tbl compact cell-detail-tbl"><thead><tr><th>Map</th><th>Its compartment</th><th>${esc(cap(here))}</th><th>Against ${esc(alike)}</th></tr></thead><tbody>${trs}</tbody></table></div>` +
      `<div class="cell-members"><div class="fig-head"><span class="flabel">${scoped ? 'Proteins of your selection placed here' : `${esc(cap(W.marked))} proteins placed here`}${mem ? ` (${int(mem.length)})` : ''}</span>` +
      (mem && mem.length ? `<span><button class="btn small" type="button" data-cell-select>Select these ${int(mem.length)} proteins</button> <button class="btn quiet small" type="button" data-cell-tsv>Download TSV</button></span>` : '') + '</div>' +
      (!mem ? '<p class="muted">Loading the proteins…</p>' : mem.length ? `<p class="cell-chips">${shown.map(m => `<a class="cell-chip" href="${esc(K.link('protein', m.acc))}" title="${esc(`${m.gene} (${m.acc}): placed here by ${m.maps.map(k => DS(k).name).join(', ')}`)}">${esc(m.gene)}${multi && m.maps.length > 1 ? `<sup>${m.maps.length}</sup>` : ''}</a>`).join('')}</p>` +
        (mem.length > shown.length ? `<button class="btn quiet small" type="button" data-cell-all>Show all ${int(mem.length)}</button>` : '') + (multi ? '<p class="note small muted">A number after a name: how many maps place it here.</p>' : '') : '<p class="muted">None.</p>') + '</div></div>';
  }
  function page() {
    TIPS = [];
    const scoped = scopedNow(), { regs, up } = summaries(scoped);
    const at = UI.row ? UI.at : null, dt = () => detail(scoped);
    const regionsBlock = LAYERS.region.groups.length ? block('regions', C.regions_title || 'Regions of the cell', 'cell-regions') + (at === 'regions' ? dt() : '') : '';
    const drawings = DRAWINGS.map(d => block(d.drawing, d.title || d.drawing, 'cell-fig') + (at === d.drawing ? dt() : '')).join('');
    const selNote = scoped ? ` Your selection is tested map by map: ${int(selTests(MAPS[0].analysis)?.n || 0)} of its proteins are placed by ${esc(DS(MAPS[0].analysis).name)}; each map counts its own proteins.`
      : K.selOn() ? ` <b>Your selection</b> ${K.vsOn() ? 'is compared with other marks; the maps compare proteins, so this page shows' : 'is too small to test; this page shows'} all ${esc(W.marked)} proteins.` : '';
    const maps = MAPS.map(m => { const ds = DS(m.analysis); const bits = [ds.doi ? `<a href="https://doi.org/${esc(ds.doi)}" target="_blank" rel="noopener">${esc(ds.ref || ds.doi)}</a>` : esc(ds.ref || ''), esc(ds.cells || ''), esc(ds.licence || ''),
        ds.universe ? `${int(ds.universe)} proteins placed, ${pc(ds.marked, ds.universe)}% ${esc(W.marked)}` : '', `<a href="${esc(K.link('overview', m.analysis))}">its question</a>`].filter(Boolean);
      return `${esc(ds.name)} (${bits.join('; ')})`; }).join('; ');
    return `<div class="card-body cell-page"><p class="cell-lead">${lead(regs, up, scoped, false)}</p>` +
      `<p class="small">${esc(C.intro || '')} Red: ${esc(who(scoped))} are more likely to be found there than ${esc(alike)}. Slate: less likely. Grey: no clear difference. Each map compares only the proteins it places.${selNote} Click a region, part, label or grid row for its numbers and proteins.</p>` +
      colourKey() + regionsBlock + drawings + block('grid', 'Compartments against maps', 'cell-grid') + (at === 'grid' ? dt() : '') +
      `<div class="cell-block cell-one" id="cell-one"><div class="fig-head"><span class="flabel">One map at a time</span><span class="seg cell-maps" role="group" aria-label="Map">` +
      MAPS.map(m => `<button type="button" data-cellmap="${esc(m.analysis)}" aria-pressed="${m.analysis === UI.map}">${esc(m.short || m.name)}</button>`).join('') + '</span>' +
      K.expBar(['pdf', 'svg', 'png', 'tsv'], 'cell-exp', 'one map', ID).replace(/data-cell-exp="(\w+)"/g, 'data-cell-exp="$1" data-cell-fig="one"') + '</div>' +
      `<div class="cell-scroll">${svgOf(FIGS.one.make(), 'cell-svg cell-bars')}</div><p class="note small muted">${esc(FIGS.one.sub().replace(/\.?$/, '.'))} ${esc(FIGS.one.note())} A bar selects the ${esc(W.marks)} on its proteins.</p></div>` +
      `<p class="note small muted">${esc(testWords())} Maps: ${maps}.${C.note ? ' ' + esc(C.note) : ''}</p></div>`;
  }

  // ---- the question, its Method section, clicks and hovers --------------------------------------------------------------
  A[ID] = { id: ID, kind: 'module', anySize: true, title: C.title || 'Where in the cell', question: C.question || '', sub: '', describe: '', section: '', labels: {}, help: {},
    roles: [...new Set(MAPS.flatMap(m => [...(A[m.analysis].roles || []), ...(A[m.regions]?.roles || [])]))] };
  K.questions[ID] = { tile, page: () => page() };
  K.methods.push({ id: ID, title: C.title || 'Where in the cell', html: () => `<section id="m-q-${esc(ID)}" class="qm"><h3>${esc(C.title || 'Where in the cell')}</h3>` +
    (C.question ? `<p class="qm-q">${esc(C.question)}</p>` : '') +
    `<p>One question drawn from ${MAPS.length} maps of the cell, each a protein-set question: ${MAPS.map(m => `<a href="${esc(K.link('method', 'q-' + m.analysis))}">${esc(DS(m.analysis).name)}</a>`).join(', ')}${REGMAPS.length ? `, and the regions of the cell in ${REGMAPS.map(m => `<a href="${esc(K.link('method', 'q-' + m.regions))}">${esc(DS(m.regions).name)}</a>`).join(', ')}` : ''}. ${esc(testWords())}</p>` +
    `<p>The site file (website.cell) maps each grid row to a compartment of each map and to the part of the drawings it colors. A selection is tested again in the browser, map by map, the same way${allStrat ? ', over the abundance strata of each map’s proteins' : ''}. It is not tested against a map it was made with, nor when it names its proteins.</p>` +
    `<p class="qm-links"><a href="${esc(K.link('overview', ID))}">Its figure</a></p></section>` });
  const open = (id, at) => { if (UI.row !== id) UI.all = false; UI.row = id; UI.at = at; K.render(); requestAnimationFrame(() => document.getElementById('cell-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };
  const atOf = el => (el.closest('.cell-block')?.id || '').replace(/^cell-/, '');
  const pick = el => {
    if (el.dataset.cellRow) return open(el.dataset.cellRow, atOf(el));
    const { P } = parts(scopedNow()), p = P[el.dataset.cellPart];
    if (p) open(p.id, atOf(el));
  };
  const selectFilter = (aid, set) => { S.q = ''; S.f = { ['p:' + aid]: [set] }; UI.row = null; K.writeHash(true); K.render(); };
  K.clicks.push(
    ['[data-cell-row], [data-cell-part]', el => pick(el)],
    ['[data-cellmap]', el => { UI.map = el.dataset.cellmap; K.render(); }],
    ['[data-cell-bar]', el => selectFilter(UI.map, el.dataset.cellBar)],
    ['[data-cell-close]', () => { UI.row = null; K.render(); }],
    ['[data-cell-all]', () => { UI.all = true; K.render(); }],
    ['[data-cell-select]', () => {
      const [L, row] = rowOf(UI.row), mem = members(L, row, scopedNow()) || [];
      if (!mem.length) return;
      if (K.front && row.part) { UI.row = null; return K.sel.toggle('w:' + ID, row.part); }     // the cards front end: the part is a chip beside the other filters
      const cols = L.cols.filter(aid => row.map[aid]);
      if (cols.length === 1) return selectFilter(cols[0], row.map[cols[0]]);   // one map: its own filter
      S.f = {}; S.q = mem.map(m => (D.proteins.filter(x => x[1] === m.gene).length === 1 ? m.gene : m.acc)).join(' '); UI.row = null; K.writeHash(true); K.render();
    }],
    ['[data-cell-tsv]', el => {
      const [L, row] = rowOf(UI.row), mem = members(L, row, scopedNow()) || [], cols = L.cols.filter(aid => row.map[aid]);
      K.exportFigure('tsv', null, `${D.site.id}_${ID}_${String(row.part || row.label).replace(/\W+/g, '_').toLowerCase()}`, el, () => K.preamble(`${C.title || 'Where in the cell'}: ${rowName(row)}`, `${who(scopedNow())} placed here, and the maps that place each`) +
        'gene\taccession\t' + cols.map(k => DS(k).name).join('\t') + '\n' + mem.map(m => [m.gene, m.acc, ...cols.map(k => (m.maps.includes(k) ? 'yes' : ''))].join('\t')).join('\n') + '\n');
    }],
    ['[data-cell-exp]', el => { const f = FIGS[el.dataset.cellFig]; if (f) K.exportFigure(el.dataset.cellExp, () => exported(f.make, f.title(), f.sub(), f.note?.()), figName(el.dataset.cellFig), el, f.tsv); }],
  );
  // a part smaller than a finger gets an invisible circle around it (24 px; 44 px on a touch screen)
  const grow = () => {
    const min = matchMedia('(pointer: coarse)').matches ? 44 : 24;
    document.querySelectorAll('svg.cell-svg').forEach(svg => {
      svg.querySelectorAll('.cd-extra').forEach(n => n.remove());
      const w = svg.getBoundingClientRect().width, vb = svg.viewBox.baseVal;
      if (!w || !vb || !vb.width) return;
      const sc = w / vb.width;
      svg.querySelectorAll('g[data-cell-part]:not([aria-hidden])').forEach(g => {
        let b; try { b = g.getBBox(); } catch (e) { return; }
        if (!b.width || (b.width * sc >= min && b.height * sc >= min)) return;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('class', 'cd-hit cd-extra');
        c.setAttribute('cx', b.x + b.width / 2); c.setAttribute('cy', b.y + b.height / 2); c.setAttribute('r', min / 2 / sc);
        g.appendChild(c);
      });
    });
  };
  (K.afterRender ||= []).push(grow);
  let growT; addEventListener('resize', () => { clearTimeout(growT); growT = setTimeout(grow, 200); });
  K.tips.push(['[data-cell-tip]', el => TIPS[+el.dataset.cellTip] || '']);
  document.addEventListener('keydown', e => {
    const el = e.target.closest?.('[data-cell-row], [data-cell-part], [data-cell-bar]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });

  // ---- the look: the tones of the comparisons, the drawings' strokes, the grids and the detail panel -------------------
  const st = document.createElement('style');
  st.id = 'kit-cell-css';
  st.textContent = `:root{${TONES.light.map(([k, v]) => `--t-${k}:${v};`).join('')}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${TONES.dark.map(([k, v]) => `--t-${k}:${v};`).join('')}}}` +
    `:root[data-theme="dark"]{${TONES.dark.map(([k, v]) => `--t-${k}:${v};`).join('')}}` + CSS;
  document.head.appendChild(st);
});
