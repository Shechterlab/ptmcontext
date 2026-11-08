/* IDRs: every IDR of the site's proteins read with its charge, how its charges are patterned and the marks inside it,
   on one page: the Das–Pappu diagram of states (FCR against NCPR) with each IDR a dot, the regions of the diagram
   compared, κ for IDRs with and without marks, and every IDR in a sortable, searchable table. The page shows when the
   run wrote IDR parameters: a track whose values (Track.values; units_<kind>.tsv, data/units.json) include fcr and
   ncpr. It describes and counts; the statistics are the Overview's residue tests (the question whose classes the
   track carries). It follows the selection: IDRs with selected marks are drawn full and the counts are the
   selection's, its marks against the other candidate residues of its proteins' IDRs (marks not selected are left out
   of both sides, as the selection's tests do). A module of the site kit.

   Das RK, Pappu RV. PNAS 110:13392 (2013), doi:10.1073/pnas.1304749110 (the diagram of states, κ); Holehouse AS et al.
   Biophys J 112:16 (2017), doi:10.1016/j.bpj.2016.11.3200 (CIDER and localCIDER, which define the parameters as the
   run computes them). */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, esc, int, cap } = K;
  if (!D.proteins || !D.proteins.length) return;
  const TR = (D.tracks || []).find(t => { const c = (t.values?.columns || []).map(x => x.name); return c.includes('fcr') && c.includes('ncpr'); });
  if (!TR || !TR.values.n) return;
  const QA = A[TR.analysis] || null;                       // the residue question whose classes the IDRs carry
  const REFS = [
    ['Das RK, Pappu RV (2013) Conformations of intrinsically disordered proteins are influenced by linear sequence distributions of oppositely charged residues. Proc Natl Acad Sci USA 110:13392–13397', '10.1073/pnas.1304749110', 'the diagram of states and κ'],
    ['Holehouse AS, Das RK, Ahad JN, Richardson MOG, Pappu RV (2017) CIDER: resources to analyze sequence-ensemble relationships of intrinsically disordered proteins. Biophys J 112:16–21', '10.1016/j.bpj.2016.11.3200', 'the parameters as CIDER and localCIDER compute them'],
  ];
  const REF_SHORT = 'Das & Pappu 2013 (doi:10.1073/pnas.1304749110); Holehouse et al. 2017 (doi:10.1016/j.bpj.2016.11.3200)';
  // the diagram of states (Das & Pappu 2013): each region, its name, the shapes it predicts, its rule, a short name
  const DP = {
    1: ['Weak polyampholytes and polyelectrolytes', 'globules and tadpoles', 'FCR < 0.25', 'weakly charged'],
    2: ['Janus sequences', 'collapsed or expanded, depending on context', 'FCR 0.25 to 0.35', 'Janus (in between)'],
    3: ['Strong polyampholytes', 'coils, hairpins and chimeras, depending on how their charges are mixed (κ)', 'FCR > 0.35, |NCPR| < 0.35', 'strongly charged, balanced'],
    4: ['Strong negative polyelectrolytes', 'swollen coils', 'FCR > 0.35, NCPR ≤ −0.35', 'mostly negative'],
    5: ['Strong positive polyelectrolytes', 'swollen coils', 'FCR > 0.35, NCPR ≥ 0.35', 'mostly positive'],
  };
  // each region in the FCR–NCPR plane, as [NCPR, FCR] corners (the plane's possible part: |NCPR| ≤ FCR ≤ 1)
  const POLY = { 1: [[0, 0], [-0.25, 0.25], [0.25, 0.25]], 2: [[-0.25, 0.25], [0.25, 0.25], [0.35, 0.35], [-0.35, 0.35]],
    3: [[-0.35, 0.35], [0.35, 0.35], [0.35, 1], [-0.35, 1]], 4: [[-0.35, 0.35], [-0.35, 1], [-1, 1]], 5: [[0.35, 0.35], [0.35, 1], [1, 1]] };
  const FALLBACK = ['#9DB8C7', '#E2B44C', '#8E7CC3', '#D64545', '#2F6FD6', '#6b7280'];
  const regionNo = cls => +(/(\d+)$/.exec(String(cls))?.[1] || 0);
  const colour = cls => (TR.colours || {})[cls] || FALLBACK[(regionNo(cls) || 6) - 1] || FALLBACK[5];
  const clsLabel = cls => (QA?.labels || {})[cls] || DP[regionNo(cls)]?.[0] || String(cls);
  const STK = D.stickers || null;                          // the profile's sticker residues (Martin et al. 2020: aromatic patterning)
  // one descriptive line per IDR: how many sticker residues, how far apart, the longest stretch without one (no test)
  const patterning = x => (STK && x.st != null
    ? `${esc(STK.heading)}: ${int(x.st)} ${esc(x.st === 1 ? STK.noun : STK.nouns)} (${esc(STK.residues.join(', '))})` +
      (x.st > 1 ? `, median spacing ${int(x.gap)} aa` : '') + (x.st ? `, longest stretch without one ${int(x.free)} aa` : ', none in this IDR')
    : '');
  const pr = x => D.proteins[x.p];
  const gene = x => pr(x)[1] || pr(x)[0];
  const f2 = v => (v == null ? '–' : Number(v).toFixed(2));
  const s2 = v => { if (v == null) return '–'; const t = Math.abs(v).toFixed(2); return t === '0.00' ? t : (v > 0 ? '+' : '−') + t; };
  const pc = (k, n) => (n ? (100 * k / n).toFixed(k && k / n < 0.001 ? 2 : 1) + '%' : '–');
  const WORD = s => String(s).replace(/\W+/g, '_');
  // a link inside the site, carrying the current selection: the kit's K.link, or this page's own query (on this page
  // the hash's query is the selection's alone: q, f, m, vs, cmp)
  const href = (v, a) => (K.link ? K.link(v, a) : '#' + v + (a ? '/' + a : '') + (location.hash.includes('?') ? '?' + location.hash.split('?')[1] : ''));
  const resHead = () => (W.residues.length <= 14 ? cap(W.residues) : 'Candidates');

  // ---- the data: data/units.json (or inlined in the one-file copy), read when the page is first shown ----------------
  let V = null, VERR = '', loading = null;
  function load() {
    if (loading) return loading;
    let inline = null;
    const el = document.getElementById('unit-values');
    if (el) { try { inline = JSON.parse(el.textContent); } catch (e) { inline = null; } }
    loading = (inline ? Promise.resolve(inline) : fetch('data/units.json').then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))))
      .then(d => { if (!d?.[TR.kind]) throw new Error('no ' + TR.kind); V = prepare(d[TR.kind]); K.render(); },
        () => { VERR = location.protocol === 'file:' ? 'This copy of the site cannot read its data files from disk. Open the hosted site, or index.html through a local web server.' : 'The IDRs could not be read (data/units.json).'; K.render(); });
    return loading;
  }
  function prepare(d) {
    const nc = d.columns.length, at = name => d.columns.indexOf(name), get = (r, name) => (at(name) < 0 ? null : r[4 + at(name)]);
    const idrs = d.rows.map((r, i) => {
      const cls = d.classes[r[3]] ?? '';
      return { i, p: r[0], s: r[1], e: r[2], len: r[2] - r[1] + 1, cls, reg: get(r, 'region') ?? regionNo(cls), fp: get(r, 'f_plus'), fm: get(r, 'f_minus'),
        fcr: get(r, 'fcr'), ncpr: get(r, 'ncpr'), kappa: get(r, 'kappa'), st: get(r, 'stickers'), gap: get(r, 'sticker_spacing'), free: get(r, 'sticker_free'), vals: r.slice(4, 4 + nc), marks: r[4 + nc], others: r[5 + nc] };
    });
    const byP = {};
    idrs.forEach(x => { (byP[x.p] ||= []).push(x); });
    return { columns: d.columns, classes: d.classes, idrs, byP };
  }

  // ---- the selection: each IDR's selected marks, and the proteins in scope (kit-select.js) -------------------------
  let SC = { key: null };
  function sel() {
    const on = !!(K.sel?.active() && K.sel.data());
    const c = on ? K.sel.compute() : null, key = on ? c.key : 'all';
    if (SC.key === key && SC.v === V) return SC;
    SC = { key, v: V, on, n: null, prots: null, set: null };
    if (on && V) {
      const SD = K.sel.data(), n = new Int32Array(V.idrs.length);
      (c.marks || []).forEach(mi => { const m = SD.marks[mi], l = V.byP[m[0]]; if (l) for (const x of l) if (m[1] >= x.s && m[1] <= x.e) { n[x.i]++; break; } });
      Object.assign(SC, { n, prots: c.proteins || new Set(), set: new Set(c.marks || []) });
    }
    return SC;
  }
  // highlighted IDRs (kit-hilite.js): those of the highlighted proteins; the rest are drawn gray as context
  let HLS = { on: false, prots: new Set() };
  const hlRead = () => { HLS = K.hl ? K.hl.state() : { on: false, prots: new Set() }; return HLS; };
  const isHl = x => HLS.on && HLS.prots.has(x.p);
  const hlName = x => `${gene(x)} ${x.s}–${x.e}`;
  const GRAY = '#c3ccd1';
  const marksOf = x => (SC.on ? SC.n[x.i] : x.marks);       // the marks counted: the selection's, or all of them
  const candOf = x => marksOf(x) + x.others;                // candidate residues: those marks and the other residues
  const inScope = x => !SC.on || SC.prots.has(x.p);
  const scoped = () => V.idrs.filter(inScope);
  // the marks inside an IDR (from the selection data), for its hover: [label, selected?]
  let MI = null;
  function marksIn(x) {
    const SD = K.sel?.data(); if (!SD) return null;
    if (!MI) { MI = {}; SD.marks.forEach((m, k) => { (MI[m[0]] ||= []).push(k); }); }
    return (MI[x.p] || []).filter(k => SD.marks[k][1] >= x.s && SD.marks[k][1] <= x.e).sort((a, b) => SD.marks[a][1] - SD.marks[b][1])
      .map(k => [`${(SD.marks[k][4] || '')[7] || ''}${SD.marks[k][1]}`, !SC.on || SC.set.has(k)]);
  }

  // ---- colours: the page's own (CSS variables, so the dark theme works), or a figure's (white) ---------------------
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const pal = ex => (ex ? { ink: K.PAL.ink, muted: K.PAL.muted, line: K.PAL.line, strong: '#c7d4d9', bg: K.PAL.bg, soft: '#eef3f5', accent: css('--accent-l') || '#c2410c' }
    : { ink: css('--ink'), muted: css('--muted'), line: css('--line'), strong: css('--line-strong'), bg: css('--surface'), soft: css('--surface-2'), accent: css('--accent') });
  const txt = (P, x, y, t, o = {}) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 11}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.rot ? ` transform="rotate(-90 ${x.toFixed(1)} ${y.toFixed(1)})"` : ''} fill="${o.fill || P.ink}">${esc(t)}</text>`;
  // a label over dots: the same text first as a thick outline of the background (for SVG, PNG and PDF alike)
  const halo = (P, x, y, t, o = {}) => txt(P, x, y, t, o).replace('<text ', `<text stroke="${P.bg}" stroke-width="3.5" stroke-linejoin="round" `) + txt(P, x, y, t, o);

  // ---- the diagram of states: FCR up, NCPR across (Das & Pappu's f+ and f− axes turned 45°) --------------------------
  const DW = 760, ML = 58, MR = 20, MT = 64, SCALE = (DW - ML - MR) / 2, PH = SCALE;    // one scale on both axes
  const DX = v => ML + (v + 1) * SCALE, DY = v => MT + (1 - v) * SCALE;
  const rad = m => (m ? Math.min(9, 2.3 + 1.5 * Math.sqrt(m)) : 1.7);
  const shownDot = x => !T.cand || candOf(x) > 0;     // the switch: only IDRs that hold a candidate residue
  function diagram(ex) {
    const P = pal(ex), parts = [], pt = ([a, b]) => `${DX(a).toFixed(1)},${DY(b).toFixed(1)}`;
    sel();
    // the legend: the regions with their IDRs (in scope) and the dot sizes
    const n = {}; scoped().filter(shownDot).forEach(x => { n[x.cls] = (n[x.cls] || 0) + 1; });
    let lx = ML, ly = 14;
    V.classes.forEach(c => {
      const t = `R${regionNo(c)} ${DP[regionNo(c)]?.[3] || clsLabel(c)} (${int(n[c] || 0)})`, w = 20 + K.tw(t, 10.5);
      if (lx + w > DW - MR) { lx = ML; ly += 17; }
      parts.push(`<circle cx="${lx + 5}" cy="${ly - 3.5}" r="5" fill="${colour(c)}"/>`, txt(P, lx + 14, ly, t, { size: 10.5, fill: P.muted }));
      lx += w + 10;
    });
    ly += 19; lx = ML;
    const sizeWord = SC.on ? `selected ${W.marks}` : W.marks;
    parts.push(txt(P, lx, ly, `Dot size: ${sizeWord} inside`, { size: 10.5, fill: P.muted })); lx += K.tw(`Dot size: ${sizeWord} inside`, 10.5) + 12;
    [1, 3, 10].forEach(m => { parts.push(`<circle cx="${lx + rad(m)}" cy="${ly - 3.5}" r="${rad(m)}" fill="none" stroke="${P.muted}"/>`, txt(P, lx + 2 * rad(m) + 4, ly, String(m), { size: 10.5, fill: P.muted })); lx += 2 * rad(m) + 20; });
    parts.push(`<circle cx="${lx + 2}" cy="${ly - 3.5}" r="1.7" fill="${P.muted}" opacity="0.5"/>`, txt(P, lx + 8, ly, `none (faint)`, { size: 10.5, fill: P.muted }));
    // the plane's impossible corners (|NCPR| > FCR), the regions and their boundaries
    parts.push(`<polygon points="${[[-1, 0], [0, 0], [-1, 1]].map(pt).join(' ')}" fill="${P.soft}"/><polygon points="${[[1, 0], [0, 0], [1, 1]].map(pt).join(' ')}" fill="${P.soft}"/>`);
    Object.entries(POLY).forEach(([r, poly]) => { const c = V.classes.find(k => regionNo(k) === +r); parts.push(`<polygon points="${poly.map(pt).join(' ')}" fill="${c ? colour(c) : P.soft}" fill-opacity="0.09"/>`); });
    const line = (a, b, o = '') => `<line x1="${DX(a[0]).toFixed(1)}" y1="${DY(a[1]).toFixed(1)}" x2="${DX(b[0]).toFixed(1)}" y2="${DY(b[1]).toFixed(1)}" ${o}/>`;
    [0.25, 0.5, 0.75].forEach(v => parts.push(line([-1, v], [1, v], `stroke="${P.line}" stroke-width="0.6"`)));
    [-0.5, 0.5].forEach(v => parts.push(line([v, 0], [v, 1], `stroke="${P.line}" stroke-width="0.6"`)));
    parts.push(txt(P, DX(-0.97), DY(0.06), 'not possible: net charge above charged share', { size: 9.5, fill: P.muted }), txt(P, DX(0.97), DY(0.06), 'not possible: net charge above charged share', { size: 9.5, fill: P.muted, anchor: 'end' }));
    const dash = `stroke="${P.ink}" stroke-width="1" stroke-dasharray="4 3" opacity="0.65"`;
    parts.push(line([-0.25, 0.25], [0.25, 0.25], dash), line([-0.35, 0.35], [0.35, 0.35], dash), line([-0.35, 0.35], [-0.35, 1], dash), line([0.35, 0.35], [0.35, 1], dash));
    parts.push(`<polyline points="${[[-1, 1], [0, 0], [1, 1], [-1, 1]].map(pt).join(' ')}" fill="none" stroke="${P.strong}" stroke-width="1"/>`);
    // the dots: IDRs without (selected) marks faint and first, then the others, larger first; with a highlight, every IDR is a
    // gray dot for context and the highlighted ones are drawn last in color, each with a ring (and a label when there are few)
    hlRead();
    const plotted = V.idrs.filter(x => x.fcr != null && x.ncpr != null && shownDot(x)), hot = plotted.filter(isHl);
    const order = plotted.filter(x => !HLS.on || !isHl(x)).map(x => [x, inScope(x) ? marksOf(x) : 0]).sort((a, b) => (a[1] > 0) - (b[1] > 0) || b[1] - a[1]);
    order.forEach(([x, m]) => {
      const cx = DX(x.ncpr).toFixed(1), cy = DY(x.fcr).toFixed(1), id = ex ? '' : ` data-di="${x.i}" class="idr-dot"`;
      if (HLS.on) parts.push(`<circle cx="${cx}" cy="${cy}" r="${m ? Math.min(rad(m), 4).toFixed(1) : 1.7}" fill="${GRAY}" fill-opacity="${m ? 0.6 : 0.45}"${id}/>`);
      else parts.push(m ? `<circle cx="${cx}" cy="${cy}" r="${rad(m).toFixed(1)}" fill="${colour(x.cls)}" fill-opacity="0.85" stroke="${SC.on ? P.ink : P.bg}" stroke-width="${SC.on ? 0.9 : 0.6}"${id}/>`
        : `<circle cx="${cx}" cy="${cy}" r="1.7" fill="${colour(x.cls)}" fill-opacity="${SC.on ? 0.16 : 0.3}"${id}/>`);
    });
    const ring = [];
    hot.sort((a, b) => marksOf(a) - marksOf(b)).forEach(x => {
      const cx = DX(x.ncpr), cy = DY(x.fcr), r = Math.max(3.6, rad(marksOf(x))), id = ex ? '' : ` data-di="${x.i}" class="idr-dot"`;
      parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${colour(x.cls)}" fill-opacity="0.9" stroke="${P.ink}" stroke-width="1.6"${id}/>`);
      ring.push({ x: cx, y: cy, r: r + 1, t: hlName(x) });
    });
    if (ring.length && ring.length <= K.hl.limit) parts.push(K.hl.labels(P, K.hl.place(ring, [ML, DW - MR, MT, MT + PH])));
    // the regions' names, over the dots
    [[1, 0, 0.14], [2, -0.22, 0.288], [3, 0, 0.9], [4, -0.66, 0.9], [5, 0.66, 0.9]].forEach(([r, a, b]) => {
      const c = V.classes.find(k => regionNo(k) === r);
      parts.push(halo(P, DX(a), DY(b), `R${r}`, { size: 12, weight: 'bold', anchor: 'middle', fill: c ? colour(c) : P.muted }));
      if (r >= 3) parts.push(halo(P, DX(a), DY(b) + 13, DP[r][3], { size: 10, anchor: 'middle', fill: P.muted }));
    });
    // axes
    [-1, -0.5, -0.35, 0, 0.35, 0.5, 1].forEach(v => parts.push(txt(P, DX(v), DY(0) + 16, v === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v), { size: 10, anchor: 'middle', fill: P.muted })));
    [0, 0.25, 0.35, 0.5, 0.75, 1].forEach(v => parts.push(txt(P, ML - 7, DY(v) + 3.5, String(v), { size: 10, anchor: 'end', fill: P.muted })));
    parts.push(txt(P, DX(0), DY(0) + 34, 'Net charge per residue (NCPR): mostly negative ← → mostly positive', { size: 11, anchor: 'middle', fill: P.ink }));
    parts.push(txt(P, 16, DY(0.5), 'Share of residues charged (FCR)', { size: 11, anchor: 'middle', fill: P.ink, rot: true }));
    return { body: parts.join(''), H: MT + PH + 44 };
  }
  function diagramFigure() {
    const d0 = diagram(true), xs = scoped(), d = withHl('diagram', d0, DW);
    return K.figureFrame({ title: `IDRs in the diagram of states${SC.on ? ', your selection' : ''}`,
      sub: `${int(xs.length)} IDRs on ${int(new Set(xs.map(x => x.p)).size)} proteins, share of residues charged against net charge; each dot an IDR, colored by its region and sized by the ${SC.on ? 'selected ' : ''}${W.marks} inside it; IDRs without ${W.marks} faint.${HLS.on ? ' Gray: not highlighted.' : ''}${d.sub}`,
      body: d.body, bodyH: d.H, W: DW, extra: { figure_kind: 'idr_diagram', track: TR.kind, analysis: TR.analysis || '' },
      note: `Regions (Das & Pappu 2013): ${[1, 2, 3, 4, 5].map(r => `R${r} ${DP[r][0]} (${DP[r][2]}): ${DP[r][1]}`).join('; ')}. The axes are Das & Pappu's f+ and f− turned 45°. ${TR.help || ''}. A description, not a test: the residue tests of the site are its statistics. ${REF_SHORT}.` });
  }

  // ---- κ: its distribution in IDRs with and without marks ------------------------------------------------------------
  const T = { q: '', sort: 'marks', desc: true, page: 0, per: 50, only: false, reg: '', cand: true };
  const BINS = 20;
  const POLY3 = () => V?.classes.find(k => regionNo(k) === 3);       // the strong polyampholytes, where κ means something
  function kappaGroups() {
    sel();
    const xs = scoped().filter(x => x.cls === POLY3());
    const has = xs.filter(x => x.kappa != null), none = xs.length - has.length;
    return { yes: has.filter(x => marksOf(x) > 0).map(x => x.kappa).sort((a, b) => a - b), no: has.filter(x => !marksOf(x)).map(x => x.kappa).sort((a, b) => a - b), none };
  }
  const quant = (v, q) => { if (!v.length) return null; const k = (v.length - 1) * q, a = Math.floor(k), b = Math.ceil(k); return v[a] + (v[b] - v[a]) * (k - a); };
  const hist = v => { const h = new Array(BINS).fill(0); v.forEach(x => { h[Math.min(BINS - 1, Math.floor(x * BINS))]++; }); return h.map(k => (v.length ? k / v.length : 0)); };
  const KW = 760, KL = 58, KR = 20, KT = 50, KH = 200;
  function kappaPlot(ex) {
    const P = pal(ex), g = kappaGroups(), hy = hist(g.yes), hn = hist(g.no), parts = [];
    const ymax = Math.max(0.05, ...hy, ...hn), step = ymax > 0.3 ? 0.1 : 0.05, top = Math.ceil(ymax / step - 1e-9) * step;
    const X = v => KL + v * (KW - KL - KR), Y = v => KT + KH - v / top * KH, bw = (KW - KL - KR) / BINS;
    const series = [[g.yes, hy, P.accent, `with ${SC.on ? 'selected ' : ''}${W.marks}`], [g.no, hn, P.muted, `without`]];
    series.forEach(([v, , c, lab], k) => { const t = `IDRs ${lab}: ${int(v.length)}${v.length ? `, median κ ${f2(quant(v, 0.5))} (interquartile range ${f2(quant(v, 0.25))} to ${f2(quant(v, 0.75))})` : ''}`; parts.push(`<rect x="${KL}" y="${8 + 16 * k}" width="10" height="10" fill="${c}" fill-opacity="0.75"/>`, txt(P, KL + 15, 17 + 16 * k, t, { size: 10.5, fill: P.muted })); });
    for (let t = 0; t <= top + 1e-9; t += step) parts.push(`<line x1="${KL}" x2="${KW - KR}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="${P.line}" stroke-width="0.6"/>`, txt(P, KL - 6, Y(t) + 3.5, (100 * t).toFixed(0) + '%', { size: 10, anchor: 'end', fill: P.muted }));
    hn.forEach((h, k) => { if (h) parts.push(`<rect x="${(X(k / BINS) + 1).toFixed(1)}" y="${Y(h).toFixed(1)}" width="${(bw / 2 - 1).toFixed(1)}" height="${(Y(0) - Y(h)).toFixed(1)}" fill="${P.muted}" fill-opacity="0.55"/>`); });
    hy.forEach((h, k) => { if (h) parts.push(`<rect x="${(X(k / BINS) + bw / 2).toFixed(1)}" y="${Y(h).toFixed(1)}" width="${(bw / 2 - 1).toFixed(1)}" height="${(Y(0) - Y(h)).toFixed(1)}" fill="${P.accent}" fill-opacity="0.8"/>`); });
    series.forEach(([v, , c]) => { const m = quant(v, 0.5); if (m != null) parts.push(`<line x1="${X(m).toFixed(1)}" x2="${X(m).toFixed(1)}" y1="${KT - 4}" y2="${Y(0)}" stroke="${c}" stroke-width="1.6" stroke-dasharray="5 3"/>`); });
    parts.push(`<line x1="${KL}" x2="${KW - KR}" y1="${Y(0)}" y2="${Y(0)}" stroke="${P.strong}"/>`);
    [0, 0.25, 0.5, 0.75, 1].forEach(v => parts.push(txt(P, X(v), Y(0) + 15, String(v), { size: 10, anchor: 'middle', fill: P.muted })));
    parts.push(txt(P, X(0.5), Y(0) + 32, 'κ: 0 = + and − evenly mixed, 1 = fully separated (dashed: medians)', { size: 11, anchor: 'middle' }));
    parts.push(txt(P, 16, Y(top / 2), 'share of the IDRs', { size: 11, anchor: 'middle', rot: true }));
    let H = KT + KH + 42;
    hlRead();
    if (HLS.on) {          // a strip of every IDR (gray) with the highlighted ones on top: where they sit along κ
      const y0 = Y(0) + 52, all = V.idrs.filter(x => x.cls === POLY3() && x.kappa != null), hot = all.filter(isHl), ring = [];
      parts.push(txt(P, KL, y0, 'Each dot an IDR: gray, all of them; colored, the highlighted ones', { size: 10.5, fill: P.muted }));
      all.forEach((x, k) => { if (!isHl(x)) parts.push(`<circle cx="${X(x.kappa).toFixed(1)}" cy="${(y0 + 14 + (k * 7 % 5) * 3.2).toFixed(1)}" r="1.7" fill="${GRAY}" fill-opacity="0.55"/>`); });
      hot.forEach(x => { const cx = X(x.kappa), cy = y0 + 22; parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy}" r="4" fill="${colour(x.cls)}" stroke="${P.ink}" stroke-width="1.6"/>`); ring.push({ x: cx, y: cy, r: 5, t: hlName(x) }); });
      if (ring.length && ring.length <= K.hl.limit) parts.push(K.hl.labels(P, K.hl.place(ring, [KL, KW - KR, y0 + 2, y0 + 62])));
      H += 66;
    }
    return { body: parts.join(''), H, g };
  }
  function kappaFigure() {
    const k0 = kappaPlot(true), k = withHl('kappa', { body: k0.body, H: k0.H }, KW);
    return K.figureFrame({ title: `κ of IDRs with and without ${W.marks}${POLY3() ? `, ${clsLabel(POLY3())}` : ''}${SC.on ? ', your selection' : ''}`,
      sub: `The share of IDRs in each band of κ (${BINS} bands), for IDRs with ${SC.on ? 'selected ' : ''}${W.marks} and without; ${int(k0.g.none)} IDRs without charged residues have no κ.${k.sub}`,
      body: k.body, bodyH: k.H, W: KW, extra: { figure_kind: 'idr_kappa', track: TR.kind, region: POLY3() || 'all' },
      note: `κ (Das & Pappu 2013): how far an IDR's positive and negative residues are segregated from each other, 0 well mixed to 1 fully segregated; it shapes strong polyampholytes (R3) most. A description, not a test. ${REF_SHORT}.` });
  }
  function kappaTsv() {
    const g = kappaGroups(), hy = hist(g.yes), hn = hist(g.no);
    return K.preamble(`κ of IDRs with and without ${W.marks}`, `the share of IDRs${POLY3() ? ' in ' + clsLabel(POLY3()) : ''} in each band of κ, with ${SC.on ? 'selected ' : ''}${W.marks} (${g.yes.length}) and without (${g.no.length}); ${g.none} IDRs without charged residues have no κ. Descriptive. ${REF_SHORT}.`) +
      ['kappa_from', 'kappa_to', `share_with_${WORD(W.marks)}`, `idrs_with_${WORD(W.marks)}`, 'share_without', 'idrs_without'].join('\t') + '\n' +
      hy.map((h, k) => [k / BINS, (k + 1) / BINS, h.toFixed(6), Math.round(h * g.yes.length), hn[k].toFixed(6), Math.round(hn[k] * g.no.length)].join('\t')).join('\n') + '\n';
  }

  // ---- the regions compared: IDRs, residues, marks and marks per candidate residue -----------------------------------
  function regionRows() {
    sel();
    const rows = V.classes.map(c => ({ cls: c, idrs: 0, withM: 0, res: 0, marks: 0, cand: 0 })), by = Object.fromEntries(rows.map(r => [r.cls, r]));
    const all = { cls: '', idrs: 0, withM: 0, res: 0, marks: 0, cand: 0 };
    scoped().forEach(x => { const m = marksOf(x); [by[x.cls], all].forEach(r => { if (!r) return; r.idrs++; r.withM += m > 0 ? 1 : 0; r.res += x.len; r.marks += m; r.cand += m + x.others; }); });
    return { rows, all };
  }
  // the Overview's within-protein test of this question, by class: its rows (the selection's, when there is one)
  const testRows = () => { try { const rs = QA ? (K.rowsOf?.(QA, 'mantel_haenszel') || []) : []; return Object.fromEntries(rs.filter(r => r.eff != null).map(r => [r.category, r])); } catch (e) { return {}; } };
  const DIRW = { more: 'more often', less: 'less often', ns: 'no clear difference', same: 'no clear difference' };
  const testCell = r => (r ? `<b>${esc(K.fx(r.eff))}</b> <span class="muted small">(${esc(K.fx(r.lo))} to ${esc(K.fx(r.hi))}), q ${esc(K.fq(r.q))}</span><br><span class="idr-dir idr-${esc(r.dir)}">${esc(DIRW[r.dir] || r.dir)}</span>` : '<span class="muted">–</span>');
  function regionsHtml() {
    const { rows, all } = regionRows(), rate = r => (r.cand ? r.marks / r.cand : 0), base = rate(all), max = Math.max(...rows.map(rate), base, 1e-9), TT = testRows();
    const cells = (r, bar, t) => `<td>${bar ? `<span class="idr-bar" title="${esc(`${int(r.marks)} of ${int(r.cand)} candidate residues`)}"><i style="width:${(100 * rate(r) / max).toFixed(1)}%;--c:${colour(r.cls)}"></i></span> ` : ''}<b>${pc(r.marks, r.cand)}</b></td>` +
      `<td class="num">${int(r.marks)} of ${int(r.cand)}<br><span class="muted small">in ${int(r.idrs)} IDRs</span></td><td>${t}</td>`;
    return `<div class="tbl-card"><table class="tbl idr-reg"><thead><tr><th>Region</th><th title="The share of the ${esc(W.residues)} inside the region’s IDRs that are ${esc(W.marked)}">% ${esc(W.marked)}</th><th class="num">${esc(cap(W.marks))} of ${esc(W.residues)}</th>` +
      `<th title="The Overview’s test: each ${esc(W.mark)} against the other ${esc(W.residues)} of the same protein">Within-protein test (odds ratio, q)</th></tr></thead><tbody>` +
      rows.map(r => { const d = DP[regionNo(r.cls)];
        return `<tr data-idr-reg="${esc(r.cls)}" tabindex="0" title="List the IDRs of this region"><td class="idr-rname"><i class="idr-sw" style="--c:${colour(r.cls)}"></i><b>R${regionNo(r.cls)}</b> ${esc(clsLabel(r.cls))}${d ? `<br><span class="muted small">${esc(d[2])}</span>` : ''}</td>${cells(r, true, testCell(TT[r.cls]))}</tr>`; }).join('') +
      `<tr class="idr-total"><td><b>All IDRs</b></td>${cells(all, false, '<span class="muted small">the baseline of the bars</span>')}</tr></tbody></table></div>`;
  }
  function regionsTsv() {
    const { rows, all } = regionRows(), TT = testRows();
    return K.preamble('IDRs by region of the diagram of states', `for each Das–Pappu region, the IDRs${SC.on ? ' of the selection’s proteins' : ''}, those with ${SC.on ? 'selected ' : ''}${W.marks}, their residues, the ${W.marks} inside them and the candidate residues (${W.residues}, ${W.marks} included${SC.on ? '; marks not selected are left out' : ''}). Descriptive, pooled over IDRs: the residue tests are the statistics. ${REF_SHORT}.`) +
      ['region', 'region_name', 'idrs', `idrs_with_${WORD(W.marks)}`, 'residues', WORD(W.marks), 'candidate_residues', `${WORD(W.marks)}_per_candidate`, 'within_protein_odds_ratio', 'within_protein_q'].join('\t') + '\n' +
      [...rows, { ...all, cls: 'all' }].map(r => [r.cls, r.cls === 'all' ? 'all IDRs' : clsLabel(r.cls), r.idrs, r.withM, r.res, r.marks, r.cand, r.cand ? +(r.marks / r.cand).toPrecision(6) : '', TT[r.cls]?.eff ?? '', TT[r.cls]?.q ?? ''].join('\t')).join('\n') + '\n';
  }

  // the regions table drawn: the share of the candidate residues marked as bars, the counts, and the within-protein odds ratio
  // with its interval on a log axis, as a small forest panel (the same numbers as the table and its TSV)
  function regionsFigure() {
    const { rows, all } = regionRows(), TT = testRows(), rate = r => (r.cand ? r.marks / r.cand : 0), P = pal(true), base = rate(all), max = Math.max(...rows.map(rate), base, 1e-9);
    const RH = 36, X = { lab: 20, bar: 262, barW: 90, cnt: 478, fa: 506, fb: 636, val: 740 }, parts = [];
    const vals = rows.flatMap(r => { const t = TT[r.cls]; return t ? [t.eff, t.lo, t.hi].filter(v => v > 0) : []; });
    const lo2 = Math.min(-1, Math.floor(Math.log2(Math.min(...vals, 1)))), hi2 = Math.max(1, Math.ceil(Math.log2(Math.max(...vals, 1)))), k0 = Math.max(lo2, -6), k1 = Math.min(hi2, 6);
    const FX = v => X.fa + (Math.min(k1, Math.max(k0, Math.log2(v))) - k0) / (k1 - k0) * (X.fb - X.fa), step = Math.ceil((k1 - k0) / 4);
    const T = (x, y, t, o = {}) => parts.push(txt(P, x, y, t, o));
    T(X.lab, 14, 'Region', { weight: 'bold' }); T(X.bar, 14, `% ${W.marked}`, { weight: 'bold' }); T(X.cnt, 14, `Count`, { weight: 'bold', anchor: 'end' });
    T((X.fa + X.fb) / 2, 14, 'Odds ratio (95% CI)', { weight: 'bold', anchor: 'middle' }); T(X.val, 14, 'q', { weight: 'bold', anchor: 'end' });
    let y = 22;
    parts.push(`<line x1="20" x2="${X.val}" y1="${y}" y2="${y}" stroke="${P.strong}"/>`);
    const top = y;
    [...rows, { ...all, cls: '' }].forEach((r, i) => {
      const yc = y + RH / 2, t = TT[r.cls], d = DP[regionNo(r.cls)];
      if (!r.cls) parts.push(`<line x1="20" x2="${X.val}" y1="${y}" y2="${y}" stroke="${P.line}"/>`);
      if (r.cls) { parts.push(`<circle cx="${X.lab + 5}" cy="${yc - 1}" r="5" fill="${colour(r.cls)}"/>`); T(X.lab + 15, yc + (d ? -2 : 3), `R${regionNo(r.cls)} ${clsLabel(r.cls)}`, { weight: 'bold' }); if (d) T(X.lab + 15, yc + 11, d[2], { size: 9.5, fill: P.muted }); }
      else T(X.lab, yc + 3, 'All IDRs', { weight: 'bold' });
      if (r.cls) parts.push(`<rect x="${X.bar}" y="${yc - 5}" width="${(X.barW * rate(r) / max).toFixed(1)}" height="10" rx="1.5" fill="${colour(r.cls)}"/>`);
      T(X.bar + (r.cls ? X.barW * rate(r) / max : 0) + 5, yc + 3.5, pc(r.marks, r.cand), { weight: 'bold' });
      T(X.cnt, yc - 2, `${int(r.marks)} of ${int(r.cand)}`, { anchor: 'end' }); T(X.cnt, yc + 10, `in ${int(r.idrs)} IDRs`, { size: 9.5, anchor: 'end', fill: P.muted });
      if (r.cls && t && t.eff > 0) {
        const col = t.dir === 'more' ? K.PAL.more : t.dir === 'less' ? K.PAL.less : K.PAL.muted;
        if (t.lo > 0 && t.hi > 0) parts.push(`<line x1="${FX(t.lo).toFixed(1)}" x2="${FX(t.hi).toFixed(1)}" y1="${yc}" y2="${yc}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/>`);
        parts.push(`<circle cx="${FX(t.eff).toFixed(1)}" cy="${yc}" r="4.6" fill="${t.dir === 'ns' ? P.bg : col}" stroke="${t.dir === 'ns' ? P.muted : P.bg}" stroke-width="1.5"/>`);
        T(X.val, yc - 2, K.fx(t.eff), { anchor: 'end', weight: t.dir === 'ns' ? null : 'bold', fill: t.dir === 'ns' ? P.muted : col }); T(X.val, yc + 10, `q ${K.fq(t.q)}`, { size: 9.5, anchor: 'end', fill: P.muted });
      } else if (r.cls) T(X.val, yc + 3, '–', { anchor: 'end', fill: P.muted });
      else T((X.fa + X.fb) / 2, yc + 3, 'the baseline of the bars', { size: 9.5, anchor: 'middle', fill: P.muted });
      y += RH;
    });
    for (let k = k0; k <= k1; k++) { if (k % step) continue; parts.push(`<line x1="${FX(2 ** k).toFixed(1)}" x2="${FX(2 ** k).toFixed(1)}" y1="${top}" y2="${y}" stroke="${k === 0 ? P.ink : P.line}" stroke-width="${k === 0 ? 1.2 : 0.8}"${k === 0 ? '' : ' stroke-dasharray="2 3"'}/>`); T(FX(2 ** k), y + 14, (k < 0 ? '1/' + 2 ** -k : String(2 ** k)) + '×', { size: 10, anchor: 'middle', fill: P.muted }); }
    // the bars' baseline: the share over all IDRs
    parts.push(`<line x1="${(X.bar + X.barW * base / max).toFixed(1)}" x2="${(X.bar + X.barW * base / max).toFixed(1)}" y1="${top}" y2="${y - RH}" stroke="${P.ink}" stroke-width="1" stroke-dasharray="3 2" opacity="0.6"/>`);
    return K.figureFrame({ title: `${cap(W.marked)} ${W.residues}, by region of the diagram of states${SC.on ? ', your selection' : ''}`,
      sub: `${int(scoped().length)} IDRs on ${int(new Set(scoped().map(x => x.p)).size)} proteins; bars: the share of the ${W.residues} in each region's IDRs that are ${W.marked} (dashed: all IDRs); right: the Overview's within-protein odds ratio with its 95% interval`,
      body: parts.join(''), bodyH: y + 24, W: DW, extra: { figure_kind: 'idr_regions', track: TR.kind },
      note: `Regions (Das & Pappu 2013); the bars describe and count, pooled over IDRs; the odds ratio is the Overview's test (each ${W.mark} against the other ${W.residues} of the same protein), not a test of this table. ${REF_SHORT}.` });
  }

  // ---- the highlighted IDRs as a small table: on the page, in the figures and as TSV --------------------------------------
  const HLT = {
    diagram: { title: 'the diagram', head: ['Gene', 'IDR', 'Region', 'FCR', 'NCPR', () => cap(W.marks)], num: [0, 0, 0, 1, 1, 1], items: () => V.idrs.filter(x => x.fcr != null && x.ncpr != null && isHl(x)),
      row: x => [gene(x), `${x.s}–${x.e}`, `R${regionNo(x.cls)} ${DP[regionNo(x.cls)]?.[3] || clsLabel(x.cls)}`, f2(x.fcr), s2(x.ncpr), String(marksOf(x))] },
    kappa: { title: 'κ', head: ['Gene', 'IDR', 'κ'], num: [0, 0, 1], items: () => V.idrs.filter(x => x.cls === POLY3() && x.kappa != null && isHl(x)),
      row: x => [gene(x), `${x.s}–${x.e}`, f2(x.kappa)] },
  };
  const hlItems = k => { hlRead(); return HLT[k].items().sort((a, b) => gene(a).localeCompare(gene(b)) || a.s - b.s); };
  const hlHead = k => HLT[k].head.map(h => (typeof h === 'function' ? h() : h));
  function hlHtml(k, cap1 = 25) {
    const xs = hlItems(k); if (!HLS.on) return '';
    return K.hl.line(xs.length, 'IDRs plotted') + (xs.length ? `<div class="tbl-card hl-tbl"><table class="tbl"><thead><tr>${hlHead(k).map((h, i) => `<th${HLT[k].num[i] ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
      xs.slice(0, cap1).map(x => `<tr>${HLT[k].row(x).map((c, i) => `<td${HLT[k].num[i] ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('') + `</tbody></table></div><p class="note">${xs.length > cap1 ? `The first ${cap1} of ${int(xs.length)}. ` : ''}<button type="button" class="linkish" data-idr-hltsv="${k}">Download these as TSV</button></p>` : '<p class="muted small">None of the highlighted proteins has an IDR in this figure.</p>');
  }
  function hlTsv(k) {
    const xs = hlItems(k);
    return K.preamble(`Highlighted IDRs in ${HLT[k].title}`, `the IDRs of the highlighted proteins (${HLS.text}) as plotted. Descriptive.`) + hlHead(k).join('\t') + '\n' + xs.map(x => HLT[k].row(x).join('\t')).join('\n') + '\n';
  }
  // the figure's own list of them, under its drawing (the export carries it)
  function withHl(k, d, Wd) {
    const xs = hlItems(k); if (!HLS.on || !xs.length) return { body: d.body, H: d.H, sub: HLS.on ? ` Highlighted: ${HLS.text}; none has an IDR here.` : '' };
    const t = K.textTable(hlHead(k).map((h, i) => ({ t: h, num: !!HLT[k].num[i] })), xs.slice(0, 25).map(x => HLT[k].row(x).map((c, i) => ({ t: c, num: !!HLT[k].num[i] }))), Wd, 0);
    return { body: d.body + `<g transform="translate(0,${d.H + 10})"><text x="20" y="0" font-size="11" font-weight="700" fill="${K.PAL.ink}">Highlighted: ${esc(HLS.text)} (${int(xs.length)} IDRs${xs.length > 25 ? ', the first 25 listed' : ''})</text><g transform="translate(0,6)">${t.body}</g></g>`, H: d.H + 24 + t.H, sub: ` Highlighted: ${HLS.text}.` };
  }

  // ---- every IDR: sortable, searchable, paged ---------------------------------------------------------------------
  const COLS = [
    ['protein', 'Protein', x => gene(x).toLowerCase(), x => `<b>${esc(gene(x))}</b> <span class="muted mono">${esc(pr(x)[0])}</span>`, false],
    ['span', 'Span', x => x.s, x => `<span class="mono">${x.s}–${x.e}</span>`, true],
    ['len', 'Length', x => x.len, x => int(x.len), true],
    ['fcr', 'FCR', x => x.fcr ?? -9, x => f2(x.fcr), true],
    ['ncpr', 'NCPR', x => x.ncpr ?? -9, x => s2(x.ncpr), true],
    ['kappa', 'κ', x => x.kappa ?? -1, x => f2(x.kappa), true],
    ...(STK ? [['stickers', () => cap(STK.nouns), x => x.st ?? -1, x => `<span title="${esc(patterning(x))}">${x.st == null ? '–' : int(x.st)}</span>`, true]] : []),
    ['region', 'Region', x => x.reg, x => `<span title="${esc(clsLabel(x.cls))}"><i class="idr-sw" style="--c:${colour(x.cls)}"></i>R${regionNo(x.cls)} <span class="muted small">${esc(DP[regionNo(x.cls)]?.[3] || clsLabel(x.cls))}</span></span>`, false],
    ['marks', () => cap(W.marks), x => marksOf(x), x => (marksOf(x) ? `<b>${int(marksOf(x))}</b>` : '<span class="muted">0</span>') + (SC.on && x.marks > marksOf(x) ? ` <span class="muted">of ${int(x.marks)}</span>` : ''), true],
    ['cand', () => resHead(), x => candOf(x), x => int(candOf(x)), true],
  ];
  const colName = c => (typeof c[1] === 'function' ? c[1]() : c[1]);
  function listRows() {
    sel();
    const toks = T.q.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const hay = x => `${pr(x)[1] || ''} ${pr(x)[0]} ${pr(x)[2] || ''} r${regionNo(x.cls)} ${clsLabel(x.cls)}`.toLowerCase();
    const rows = scoped().filter(x => (!T.reg || x.cls === T.reg) && (!T.only || marksOf(x) > 0) && (!toks.length || toks.every(t => hay(x).includes(t))));
    const col = COLS.find(c => c[0] === T.sort) || COLS.find(c => c[0] === 'marks');
    rows.sort((x, y) => { const a = col[2](x), b = col[2](y); const r = (typeof a === 'number' ? a - b : String(a).localeCompare(String(b))) || x.p - y.p || x.s - y.s; return T.desc ? -r : r; });
    return rows;
  }
  function listHtml() {
    const rows = listRows(), pages = Math.max(1, Math.ceil(rows.length / T.per));
    T.page = Math.min(T.page, pages - 1);
    const shown = rows.slice(T.page * T.per, (T.page + 1) * T.per);
    const pager = `<div class="idr-pager"><span class="muted">${rows.length ? `${int(T.page * T.per + 1)}–${int(T.page * T.per + shown.length)} of ` : ''}${int(rows.length)} IDR${rows.length === 1 ? '' : 's'}</span>` +
      (pages > 1 ? `<button class="btn small" type="button" data-idr-page="-1"${T.page ? '' : ' disabled'}>‹ Previous</button><span class="muted">page ${int(T.page + 1)} of ${int(pages)}</span><button class="btn small" type="button" data-idr-page="1"${T.page < pages - 1 ? '' : ' disabled'}>Next ›</button>` : '') + '</div>';
    if (!rows.length) return pager + `<p class="empty">No IDR matches.</p>`;
    return pager + `<div class="tbl-card"><table class="tbl idr-tbl"><thead><tr>${COLS.map(c => `<th class="${c[4] ? 'num' : ''}" data-idr-sort="${c[0]}" tabindex="0"${T.sort === c[0] ? ` aria-sort="${T.desc ? 'descending' : 'ascending'}"` : ''}>${esc(colName(c))}${T.sort === c[0] ? (T.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>` +
      shown.map(x => `<tr data-idr-go="${x.i}" tabindex="0" class="${marksOf(x) ? '' : 'idr-none'}" title="Open ${esc(gene(x))} at ${x.s}–${x.e}">${COLS.map(c => `<td class="${c[4] ? 'num' : c[0] === 'region' ? 'idr-rcell' : ''}">${c[3](x)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>' + (pages > 1 ? pager : '');
  }
  function idrTsv(rows, title) {
    const cols = V.columns;
    return K.preamble(title, `every IDR${SC.on ? ' of the selection’s proteins' : ''}${T.q || T.reg || T.only ? ' shown' : ''} (${int(rows.length)}): ${TR.help || 'IDRs'}. Its protein and span, its parameters (${cols.join(', ')}; ${(TR.values.columns || []).map(c => `${c.name}: ${c.help}`).join('; ')}), and inside it the ${SC.on ? 'selected ' : ''}${W.marks} and the other candidate ${W.residues} (left-out ${W.marks}${SC.on ? ' and those not selected' : ''} counted on neither side). Descriptive: no test. ${REF_SHORT}.`) +
      ['accession', 'gene', 'start', 'end', 'length', 'class', 'region_name', ...cols, SC.on ? `selected_${WORD(W.marks)}` : WORD(W.marks), 'other_candidates', ...(SC.on ? [`all_${WORD(W.marks)}`] : [])].join('\t') + '\n' +
      rows.map(x => [pr(x)[0], pr(x)[1] || '', x.s, x.e, x.len, x.cls, clsLabel(x.cls), ...x.vals.map(v => (v == null ? '' : v)), marksOf(x), x.others, ...(SC.on ? [x.marks] : [])].join('\t')).join('\n') + '\n';
  }

  // ---- the page -----------------------------------------------------------------------------------------------------
  const tipHtml = x => {
    const ms = marksIn(x), m = marksOf(x), list = ms && ms.length ? ' (' + ms.slice(0, 12).map(([l, on]) => (SC.on && on ? `<b>${esc(l)}</b>` : esc(l))).join(', ') + (ms.length > 12 ? ` +${ms.length - 12}` : '') + ')' : '';
    return `<b>${esc(gene(x))}</b> <span class="muted mono">${esc(pr(x)[0])}</span> ${int(x.s)}–${int(x.e)} <span class="muted">(${int(x.len)} aa)</span>` +
      `<br><i class="idr-sw" style="--c:${colour(x.cls)}"></i>R${regionNo(x.cls)} ${esc(clsLabel(x.cls))}` +
      `<br>FCR ${f2(x.fcr)} · NCPR ${s2(x.ncpr)} · f+ ${f2(x.fp)} · f− ${f2(x.fm)} · κ ${x.kappa == null ? 'none (no charged residue)' : f2(x.kappa)}` +
      (patterning(x) ? `<br>${patterning(x)}` : '') +
      `<br>${SC.on ? `${int(m)} selected of its ${int(x.marks)} ${esc(x.marks === 1 ? W.mark : W.marks)}` : `${int(x.marks)} ${esc(x.marks === 1 ? W.mark : W.marks)}`}${list}; ${int(x.marks + x.others)} candidate ${esc(W.residues)} in all` +
      `<br><span class="muted">Click to open it on ${esc(gene(x))}’s map</span>`;
  };
  function view() {
    load();
    const head = `<div class="page-head"><h2>${esc(K.tabName('idrs', 'IDRs'))}</h2></div>`;
    if (VERR) return head + `<p class="empty">${esc(VERR)}</p>`;
    if (!V) return head + `<p class="muted">Loading the IDRs…</p>`;
    if (K.sel?.active() && !K.sel.data()) return head + `<p class="muted">Loading the selection…</p>`;
    sel();
    const xs = scoped(), np = new Set(xs.map(x => x.p)).size;
    const testLink = QA ? `<a href="${esc(href('overview', encodeURIComponent(QA.id)))}">${esc(QA.title)}</a>` : `<a href="${esc(href('overview'))}">the Overview</a>`;
    const sw = SC.on ? 'selected ' : '';
    return `<div class="page-head results-head"><div><h2>${esc(K.tabName('idrs', 'IDRs'))}</h2><p class="cx">${int(xs.length)} on ${int(np)} protein${np === 1 ? '' : 's'}${SC.on ? ' of your selection' : ''}</p></div></div>` +
      `<p class="page-sub">By charge class, R1 to R5 of the Das–Pappu diagram; test: ${testLink}. <button type="button" class="idr-goto" data-idr-goto="idr-refs">Method</button></p>` +
      `<section class="idr-card" id="idr-regions"><div class="card-head"><div><h3>${esc(cap(W.marked))} ${esc(W.residues)}, by region</h3></div>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'idr-rexp', 'the regions')}</div>${regionsHtml()}</section>` +
      `<section class="idr-card" id="idr-diagram"><div class="card-head"><div><h3>Charge diagram</h3><p class="sub">Each dot is an IDR, by how much of it is charged and its net charge; color is the class, size the number of ${sw}${esc(W.marks)}.</p></div>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'idr-dexp', 'the diagram')}</div>` +
      `<div class="idr-ctl"><label><input type="checkbox" id="idr-cand"${T.cand ? ' checked' : ''}> Only IDRs with a candidate residue (${esc(W.residues)})</label></div>` +
      `<div class="idr-plot idr-small" id="idr-diagram-body">${diagramBody()}</div><div id="idr-diagram-hl">${hlHtml('diagram')}</div></section>` +
      (POLY3() ? `<section class="idr-card" id="idr-kappa"><div class="card-head"><div><h3>Charge mixing (κ)</h3><p class="sub">κ is 0 when positive and negative charges alternate along the chain and 1 when they are split into two stretches.</p></div>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'idr-kexp', 'the κ distribution')}</div>` +
      `<div id="idr-kappa-body">${kappaBody()}</div><div id="idr-kappa-hl">${hlHtml('kappa')}</div></section>` : '') +
      `<details class="idr-card idr-fold" id="idr-list"><summary><h3>Every IDR</h3><span class="sub">${int(xs.length)} rows</span></summary>` +
      `<div class="card-head"><div></div>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'idr-lexp', 'the IDRs')}</div>` +
      `<div class="idr-ctl"><input id="idr-q" type="search" placeholder="Gene, accession, name or region" aria-label="Search the IDRs" value="${esc(T.q)}" autocomplete="off" spellcheck="false">` +
      `<label><input type="checkbox" id="idr-only"${T.only ? ' checked' : ''}> Only IDRs with ${sw}${esc(W.marks)}</label></div>` +
      `<div class="quick" id="idr-rchips"><span class="flabel">Region</span>${chips('reg')}</div><div id="idr-list-body">${listHtml()}</div></details>` +
      `<details class="idr-card idr-fold idr-refs" id="idr-refs"><summary><h3>Method</h3></summary>` +
      `<p class="sub">Every IDR of the ${esc(W.marked)} proteins${SC.on ? ' in your selection' : ''}, with charge (FCR, fraction of residues charged; NCPR, net charge per residue), how evenly the charges are mixed (κ) and the ${esc(W.marks)} inside it. These are the row “${esc(TR.title)}” of the protein maps: ${esc(TR.help || '')}. The diagram’s axes are Das & Pappu’s f+ and f− turned 45°, so that the boundaries are level (FCR 0.25 and 0.35) and upright (NCPR ±0.35).</p>` +
      `<p class="sub">The percentages and bars describe and count; the statistics are the Overview’s residue tests (${testLink}). IDRs are pooled in the counts, so a protein with many IDRs or many ${esc(W.marks)} counts for more; the test compares within each protein and does not have this weakness.${SC.on ? ` With a selection, its ${esc(W.marks)} are counted against the other candidate ${esc(W.residues)} of its proteins’ IDRs; ${esc(W.marks)} not selected are left out of both.` : ''}</p>` +
      `<p class="sub">Each IDR’s parameters are as the run wrote them (<span class="mono">${esc(TR.values.table || '')}</span>), defined as Das & Pappu define them and CIDER computes them. The kit computes them itself from the published definitions; it runs no code of CIDER’s.</p>` +
      `<dl class="idr-defs">${(TR.values.columns || []).filter(c => STK || !/^sticker/.test(c.name) && c.name !== 'stickers').map(c => `<dt>${esc(c.label)}</dt><dd>${esc(c.help)}</dd>`).join('')}</dl><ul>${REFS.map(([t, doi, what]) => `<li>${esc(t)}. <a href="https://doi.org/${esc(doi)}">doi:${esc(doi)}</a> <span class="muted">(${esc(what)})</span></li>`).join('')}</ul></details>`;
  }
  const diagramBody = () => (d => `<svg viewBox="0 0 ${DW} ${d.H}" class="idr-svg" role="img" aria-label="Diagram of states: IDRs by FCR and NCPR">${d.body}</svg>`)(diagram(false));
  const chips = key => `<button type="button" class="fchip" data-idr-chip="${key}" data-v="" aria-pressed="${!T[key]}">All</button>` +
    V.classes.map(c => `<button type="button" class="fchip" data-idr-chip="${key}" data-v="${esc(c)}" aria-pressed="${T[key] === c}"><i class="idr-sw" style="--c:${colour(c)}"></i>R${regionNo(c)} <span class="muted">${esc(DP[regionNo(c)]?.[3] || clsLabel(c))}</span></button>`).join('');
  const kappaBody = () => (k => `<div class="idr-plot"><svg viewBox="0 0 ${KW} ${k.H}" class="idr-svg" role="img" aria-label="κ of IDRs with and without ${esc(W.marks)}">${k.body}</svg></div>` +
    (k.g.none ? `<p class="muted small">${int(k.g.none)} IDR${k.g.none === 1 ? '' : 's'} without a charged residue ha${k.g.none === 1 ? 's' : 've'} no κ and ${k.g.none === 1 ? 'is' : 'are'} left out.</p>` : ''))(kappaPlot(false));
  // parts of the page redrawn alone (the search keeps its focus; the diagram is not redrawn)
  const refresh = id => { const el = document.getElementById(id); if (!el) return; el.innerHTML = id === 'idr-list-body' ? listHtml() : id === 'idr-diagram-body' ? diagramBody() : kappaBody(); };
  const pressChips = key => document.querySelectorAll(`[data-idr-chip="${key}"]`).forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v || '') === (T[key] || ''))));
  const name = what => `${D.site.id}_idrs_${what}${SC.on ? '_selection' : ''}`;
  const openFold = id => { const el = document.getElementById(id); if (!el) return; if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ block: 'start' }); };
  const openIdr = i => { const x = V?.idrs[+i]; if (!x) return; const tip = document.getElementById('tip'); if (tip) tip.hidden = true; K.go('protein', { arg: `${pr(x)[0]}/${x.s}-${x.e}` }); };

  K.views.idrs = { render: view, title: () => K.tabName('idrs', 'IDRs') };
  K.tabs.push(() => {
    if (K.sel?.active() && K.sel.data()) { if (!V) { load(); return ['idrs', 'IDRs', null]; } sel(); return ['idrs', 'IDRs', V.idrs.filter(x => SC.n[x.i] > 0).length]; }
    return ['idrs', 'IDRs', TR.values.n];
  });
  K.sections.idrs = () => [['view', K.tabName('idrs', 'IDRs'), 1], ['idr-regions', cap(W.marked) + ' ' + W.residues + ', by region', 1], ['idr-diagram', 'Charge diagram', 1], ...(POLY3() ? [['idr-kappa', 'Charge mixing (κ)', 1]] : []),
    ['idr-list', 'Every IDR', 1], ['idr-refs', 'Method', 1]];
  K.tips.push(['[data-di]', el => (V ? tipHtml(V.idrs[+el.dataset.di]) : '')]);
  K.clicks.push(
    ['[data-di]', el => openIdr(el.dataset.di)],
    ['tr[data-idr-go]', (el, e) => { if (!e.target.closest('a')) openIdr(el.dataset.idrGo); }],
    ['[data-idr-sort]', el => { const k = el.dataset.idrSort; T.desc = T.sort === k ? !T.desc : !['protein', 'span', 'region'].includes(k); T.sort = k; T.page = 0; refresh('idr-list-body'); document.querySelector(`[data-idr-sort="${k}"]`)?.focus(); }],
    ['[data-idr-page]', el => { T.page = Math.max(0, T.page + +el.dataset.idrPage); refresh('idr-list-body'); document.getElementById('idr-list')?.scrollIntoView({ block: 'start' }); }],
    ['[data-idr-chip]', el => { const key = el.dataset.idrChip; T[key] = el.dataset.v || ''; pressChips(key); T.page = 0; refresh('idr-list-body'); }],
    ['[data-idr-goto]', el => openFold(el.dataset.idrGoto)],
    ['tr[data-idr-reg]', el => { T.reg = el.dataset.idrReg; T.page = 0; pressChips('reg'); refresh('idr-list-body'); openFold('idr-list'); }],
    ['[data-idr-dexp]', el => K.exportFigure(el.dataset.idrDexp, diagramFigure, name('diagram'), el, () => idrTsv(scoped(), 'IDRs in the diagram of states'))],
    ['[data-idr-kexp]', el => K.exportFigure(el.dataset.idrKexp, kappaFigure, name('kappa_strong_polyampholytes'), el, kappaTsv)],
    ['[data-idr-hltsv]', el => { const k = el.dataset.idrHltsv; K.download(`${name('highlighted_' + k)}.tsv`, hlTsv(k), 'text/tab-separated-values'); }],
    ['[data-idr-rexp]', el => K.exportFigure(el.dataset.idrRexp, regionsFigure, name('regions'), el, regionsTsv)],
    ['[data-idr-lexp]', el => K.tableExport(el.dataset.idrLexp, el, document.getElementById('idr-list-body') || document.body, { title: `Every IDR${SC.on ? ' of your selection' : ''}`, sub: `${int(listRows().length)} IDRs, charge, κ and the ${W.marks} inside each`, total: listRows().length }, name('list'), () => idrTsv(listRows(), 'IDRs'))],
  );
  let timer;
  document.addEventListener('input', e => { if (e.target.id === 'idr-q') { clearTimeout(timer); timer = setTimeout(() => { T.q = e.target.value.trim(); T.page = 0; refresh('idr-list-body'); }, 150); } });
  document.addEventListener('change', e => { if (e.target.id === 'idr-cand') { T.cand = e.target.checked; refresh('idr-diagram-body'); } });
  document.addEventListener('change', e => { if (e.target.id === 'idr-only') { T.only = e.target.checked; T.page = 0; refresh('idr-list-body'); } });
  document.addEventListener('keydown', e => {
    const tr = e.target.closest?.('tr[data-idr-go], tr[data-idr-reg], th[data-idr-sort]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); }
  });
});
