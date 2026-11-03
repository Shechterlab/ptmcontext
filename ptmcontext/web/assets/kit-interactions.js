/* Pages of sections: a tab whose sections each hold blocks reading the site's statistics rows, the marks' attributes or
   page tables (CONTRACTS.md, Website pages and Page table), as the site file lays them out (website.pages). The
   Methylarginine Site Explorer's Interactions page is one: its question, an example protein, the answer sentence and
   highlight cards, then tiles in groups, each opening its section alone (#<page>/<section>), with Previous and Next.
   Every block follows the selection: the residue questions' rows are tested again in the browser (kit-select.js), the
   attributes counted over the selected marks, a table keeps the rows of the selected marks or proteins. A block whose
   data the site does not have is left out, and a page with nothing left is not shown. The page can also put a tile on
   the Overview (website.pages[].overview). It knows no source, question or mark by name. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, fxn, fq, cap } = K;
  const SPECS = D.attribute_specs || {}, TB = D.page_tables || {};
  const ST = window.PTMC_STATS;
  const METHOD = { mantel_haenszel: 'Within each protein', fisher: 'Pooled' };

  // ---- what a site has: a block whose data are missing is left out ---------------------------------------------------
  const rowOf = (aid, cat, m) => D.rows.find(r => r.analysis === aid && r.category === cat && r.method === m);
  const hasRow = r => !!A[r.analysis] && D.rows.some(x => x.analysis === r.analysis && x.category === r.category);
  const hasAttr = (n, kind) => !!SPECS[n] && (!kind || SPECS[n].kind === kind) && (D.mark_attributes || []).includes(n);
  function usable(b) {
    switch (b.kind) {
      case 'forest': b.rows = (b.rows || []).filter(hasRow); return b.rows.length > 0;
      case 'lines': return !!A[b.analysis] && (b.series || []).some(c => Object.keys(b.x || {}).some(k => D.rows.some(r => r.analysis === b.analysis && r.category === `${c}_${k}`)));
      case 'sets': return A[b.analysis]?.kind === 'protein_sets' && D.rows.some(r => r.analysis === b.analysis);
      case 'shares': return hasAttr(b.attribute, 'category');
      case 'combinations': case 'matrix': return hasAttr(b.attribute, 'list');
      case 'checker': b.attributes = (b.attributes || []).filter(n => hasAttr(n)); b.tables = (b.tables || []).filter(t => TB[t]); return !!(D.proteins || []).length;
      case 'example': return (D.proteins || []).length > 0 && !!K.map && lanes(b).length > 0;
      case 'table': case 'bars': case 'pairs': case 'histogram': return !!TB[b.table] && TB[b.table].n > 0;
      case 'text': return !!b.text;
      default: return false;
    }
  }
  // the rows of the protein map an example shows: the run's tracks, or the site's own map rows (website.protein.map.rows)
  const lanes = b => [...(D.tracks || []).map(t => [t.kind, t.title, t.help]), ...(((D.protein_view || {}).map || {}).rows || []).filter(r => r && r.id && (D.map_rows || []).includes(r.id)).map(r => [r.id, r.title || r.id, r.help || ''])]
    .filter(([k]) => (b.tracks || []).includes(k));
  const PAGES = (D.pages || []).map(pg => {
    const groups = pg.groups.map(g => ({ ...g, sections: g.sections.map(s => ({ ...s, blocks: s.blocks.map(b => ({ ...b })).filter(usable) })).filter(s => s.blocks.length) })).filter(g => g.sections.length);
    if (!groups.length) return null;
    const sections = groups.flatMap(g => g.sections.map(s => ({ ...s, group: g.name })));
    return { ...pg, groups, sections, answer: pg.answer && { ...pg.answer, rows: (pg.answer.rows || []).filter(hasRow) },
      highlights: (pg.highlights || []).map(h => ({ ...h, rows: (h.rows || []).filter(hasRow) })).filter(h => (h.rows.length || h.counts || (h.share && TB[h.share.table])) && (!h.section || sections.some(s => s.id === h.section))),
      overview: pg.overview && { ...pg.overview, rows: (pg.overview.rows || []).filter(hasRow) } };
  }).filter(Boolean);
  if (!PAGES.length) return;

  // ---- the selection -----------------------------------------------------------------------------------------------
  const selOn = () => !!K.sel?.active();
  const SD = () => K.sel?.data();
  const ready = () => !!SD();                         // the selection data: every mark's classes and attributes
  const testable = () => !selOn() || (SD() && K.sel.testable());
  // the marks counted: the selection's, or every mark (indices into the selection data's marks)
  const markIdx = () => { const sd = SD(); if (!sd) return null; return selOn() ? K.sel.compute().marks || [] : sd.marks.map((_, i) => i); };
  const protSet = () => (selOn() ? K.sel.compute().proteins || new Set() : null);
  const AT = () => SD()?.attribute_names || D.mark_attributes || [];
  const attrCodes = (m, name) => { const ti = AT().indexOf(name); return ti < 0 ? [] : m[3][ti] || []; };
  const valOf = (name, code) => SD().attributes[name][code];
  const vlabel = (name, v) => (K.sel?.valueLabel ? K.sel.valueLabel(name, v) : (SPECS[name]?.values || {})[v] ?? v);
  const marksWord = n => (n === 1 ? W.mark : W.marks);
  const theMarks = () => (selOn() ? `the ${W.marks} of your selection` : W.marks);
  const prot = i => D.proteins[i] || [];
  const gene = i => prot(i)[1] || prot(i)[0] || '';
  const byAcc = {}; (D.proteins || []).forEach((p, i) => { byAcc[p[0]] = i; });
  // a mark's index in the selection data, by protein and position
  let MK = null;
  const markAt = (p, pos) => { const sd = SD(); if (!sd) return null; if (!MK) { MK = new Map(); sd.marks.forEach((m, i) => MK.set(m[0] + ':' + m[1], i)); } return MK.get(p + ':' + pos) ?? null; };
  const isSelMark = (() => { let key = null, set = null; return i => { const k = selOn() ? K.sel.compute().key : 'all'; if (k !== key) { key = k; set = selOn() ? new Set(K.sel.compute().marks || []) : null; } return !set || set.has(i); }; })();

  // ---- page tables: data/tables/<name>.json (or inlined in the one-file copy), read when first needed ----------------
  const TD = {}, TERR = {};
  let INL = null;
  function table(name) {
    if (TD[name] || TERR[name]) return TD[name] || null;
    if (INL == null) { try { INL = JSON.parse(document.getElementById('page-table-data')?.textContent || '{}'); } catch (e) { INL = {}; } }
    if (INL[name]) { TD[name] = INL[name]; return TD[name]; }
    if (!TD['_' + name]) {
      TD['_' + name] = fetch(`data/pages/${name}.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(d => { TD[name] = d; K.render(); }, () => { TERR[name] = location.protocol === 'file:' ? 'This copy of the site cannot read its data files from disk: open the hosted site.' : `The table ${name} could not be read.`; K.render(); });
    }
    return null;
  }
  const colIdx = (t, name) => { const k = t.key === 'residue' ? 2 : t.key === 'protein' ? 1 : 0, j = t.columns.findIndex(c => c.name === name); return name === 'accession' ? (t.key === 'none' ? -1 : 0) : name === 'position' ? (t.key === 'residue' ? 1 : -1) : j < 0 ? -1 : j + k; };
  const colMeta = (t, name) => t.columns.find(c => c.name === name) || (name === 'accession' ? { name, type: 'protein', label: 'Protein' } : name === 'position' ? { name, type: 'site', label: 'Site' } : { name, type: 'text', label: name });
  // the rows a selection keeps: a residue table's rows at selected marks (others: also the other residues of their
  // proteins), a protein table's rows of proteins with a selected mark
  function tableRows(t, others = false) {
    if (!selOn() || t.key === 'none') return t.rows;
    const ps = protSet();
    if (t.key === 'protein') return t.rows.filter(r => ps.has(r[0]));
    return t.rows.filter(r => { if (!ps.has(r[0])) return false; const i = markAt(r[0], r[1]); return i == null ? others : isSelMark(i); });
  }
  const cellText = (t, r, name) => { const j = colIdx(t, name); if (j < 0) return ''; const v = r[j], c = colMeta(t, name);
    if (name === 'accession') return prot(v)[0] || ''; if (name === 'position') return String(v);
    const show = x => (c.values || {})[x] ?? x;
    return Array.isArray(v) ? v.map(show).join('; ') : v == null ? '' : c.type === 'flag' ? (v ? 'yes' : 'no') : String(show(v)); };

  // ---- links and cells ---------------------------------------------------------------------------------------------
  const residueLetter = () => (D.residues || [''])[0];
  const siteLink = (p, pos) => `<a href="${esc(K.link('protein', `${prot(p)[0]}/${residueLetter()}${pos}`))}"><b>${esc(gene(p))}</b> ${esc(residueLetter())}${int(pos)}</a>`;
  const protLink = p => `<a href="${esc(K.link('protein', prot(p)[0]))}"><b>${esc(gene(p))}</b></a>`;
  const accLink = (acc, label) => { const a = String(acc).split('-')[0]; return byAcc[a] != null ? `<a href="${esc(K.link('protein', a))}" title="${esc(prot(byAcc[a])[2] || a)}">${esc(label || gene(byAcc[a]))}</a>` : `<a href="https://www.uniprot.org/uniprotkb/${encodeURIComponent(a)}/entry" title="UniProt ${esc(a)}">${esc(label || a)}</a>`; };
  const seqHtml = s => esc(s).replace(/\[([^\]]+)\]/g, '<b class="ix-c">$1</b>');
  function cellHtml(t, r, name, labelOf) {
    const j = colIdx(t, name), c = colMeta(t, name);
    if (name === 'accession') return t.key === 'residue' ? siteLink(r[0], r[1]) : protLink(r[0]);
    if (name === 'position') return t.key === 'residue' ? siteLink(r[0], r[1]) : '';
    const v = j < 0 ? null : r[j], show = x => (c.values || {})[x] ?? x;
    if (v == null || (Array.isArray(v) && !v.length)) return '<span class="muted">–</span>';
    const many = (xs, f, k = 4) => xs.slice(0, k).map(f).join(', ') + (xs.length > k ? ` <span class="muted" title="${esc(xs.slice(k).map(show).join(', '))}">+${xs.length - k}</span>` : '');
    switch (c.type) {
      case 'number': return int(v) === String(v) || Number.isInteger(v) ? int(v) : fxn(v) === '–' ? String(v) : String(+Number(v).toPrecision(3));
      case 'flag': return v ? '✓' : '<span class="muted">–</span>';
      case 'accession': return accLink(v, labelOf ? labelOf(r) : '');
      case 'accessions': return many(v, x => accLink(x));
      case 'pdb': return many(v, x => `<a class="mono" href="https://www.ebi.ac.uk/pdbe/entry/pdb/${encodeURIComponent(String(x).toLowerCase())}" title="PDBe entry ${esc(x)}">${esc(x)}</a>`, 3);
      case 'doi': return `<a href="https://doi.org/${esc(v)}">doi</a>`;
      case 'pubmed': return many(String(v).split(/[;,\s]+/).filter(Boolean), x => `<a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(x)}/">PMID ${esc(x)}</a>`, 2);
      case 'url': return `<a href="${esc(v)}">link</a>`;
      case 'sequence': return `<span class="mono ix-seq">${seqHtml(v)}</span>`;
      case 'list': return many(v, x => esc(show(x)), 6);
      default: return esc(show(v));
    }
  }

  // ---- numbers and colours -----------------------------------------------------------------------------------------
  const pcS = (k, n) => (n ? (100 * k / n < 10 && k ? (100 * k / n).toFixed(1) : (100 * k / n).toFixed(0)) + '%' : '–');
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const pal = ex => (ex ? { ink: K.PAL.ink, muted: K.PAL.muted, line: K.PAL.line, more: K.PAL.more, less: K.PAL.less, same: K.PAL.same, bg: K.PAL.bg, soft: '#eef3f5', accent: '#c2410c' }
    : { ink: css('--ink'), muted: css('--muted'), line: css('--line'), more: css('--more'), less: css('--less'), same: css('--same'), bg: css('--surface'), soft: css('--surface-2'), accent: css('--accent') });
  const dirColour = (P, d) => (d === 'more' ? P.more : d === 'less' ? P.less : d === 'same' ? P.same : P.muted);
  const SER = ['#2A78D6', '#EB6834', '#1BAF7A', '#A23B12', '#7C3AED', '#0891B2', '#B45309', '#BE185D'];
  const attrColour = (name, v, k) => (SPECS[name]?.colours || {})[v] || (K.map?.attrColour ? K.map.attrColour(name, v) : SER[k % SER.length]);
  const txt = (P, x, y, t, o = {}) => `<text x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" font-size="${o.size || 11}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || P.ink}">${esc(t)}</text>`;
  const fx2 = v => (v == null ? '–' : fxn(v) + '×');
  const dirOf = r => (r ? K.dir({ eff: r.eff ?? r.or ?? r.fold, q: r.q }) : 'ns');

  // ---- rows of the statistics: the site's, and the selection's tested again ------------------------------------------
  function rowsFor(refs, m) {
    const sel = selOn() && testable() && SD();
    return refs.map(ref => {
      const meth = A[ref.analysis]?.kind === 'protein_sets' ? 'enricher' : m;
      const site = rowOf(ref.analysis, ref.category, meth) || (meth !== 'fisher' ? null : null);
      const mine = sel ? (K.sel.rows(ref.analysis, meth) || []).find(r => r.category === ref.category) || null : null;
      return { ref, label: ref.label || site?.label || ref.category, group: ref.group || '', site, mine };
    });
  }
  const shown = x => (selOn() ? x.mine : x.site);

  // ---- state of the page's controls ----------------------------------------------------------------------------------
  const ST8 = {};
  const st = (key, init) => (ST8[key] ||= { ...init });
  const bkey = (pg, sec, k) => `${pg.id}.${sec.id}.${k}`;

  // ---- forest: odds ratios with 95% CIs ---------------------------------------------------------------------------
  function scale(vals) {
    const l2 = v => Math.log2(Math.max(v, 1e-3)), ok = vals.filter(v => v != null && v > 0 && Number.isFinite(v));
    const lo = Math.min(-1, Math.max(-5, Math.floor(Math.min(0, ...ok.map(l2))))), hi = Math.max(1, Math.min(6, Math.ceil(Math.max(0, ...ok.map(l2)))));
    return { lo, hi, X: (v, w) => ((Math.min(Math.max(l2(v), lo), hi) - lo) / (hi - lo)) * w };
  }
  const effOf = r => (r ? r.or ?? r.eff ?? r.fold : null);
  function forestBody(b, m, ex, Wd = 760) {
    const P = pal(ex), rows = rowsFor(b.rows, m), sc = scale(rows.flatMap(x => [x.site, x.mine].filter(Boolean).flatMap(r => [effOf(r), r.lo, r.hi])));
    const LW = 250, FX = LW + 10, FW = Wd - FX - 220, RH = 22, parts = [];
    let y = 16, grp = null;
    parts.push(txt(P, 0, y, 'Arginine is…'.replace('Arginine', cap(W.residue)), { size: 10, fill: P.muted, weight: 600 }), txt(P, FX, y, `Odds ratio, ${METHOD[m].toLowerCase()} (log scale)`, { size: 10, fill: P.muted, weight: 600 }), txt(P, Wd - 4, y, 'OR [95% CI] · q', { size: 10, fill: P.muted, weight: 600, anchor: 'end' }));
    y += 10;
    const top = y;
    rows.forEach(x => {
      if (x.group && x.group !== grp) { grp = x.group; y += 8; parts.push(txt(P, 0, y + 12, x.group.toUpperCase(), { size: 9.5, fill: P.muted, weight: 700 })); y += RH - 4; }
      const r = shown(x), d = dirOf(r), cy = y + RH / 2;
      parts.push(txt(P, 0, cy + 4, x.label, { size: 11 }));
      if (selOn() && x.site && effOf(x.site)) parts.push(`<line x1="${(FX + sc.X(effOf(x.site), FW)).toFixed(1)}" x2="${(FX + sc.X(effOf(x.site), FW)).toFixed(1)}" y1="${cy - 6}" y2="${cy + 6}" stroke="${P.muted}" stroke-width="2" opacity="0.6"/>`);
      if (r && r.lo != null && r.hi != null) parts.push(`<line x1="${(FX + sc.X(r.lo, FW)).toFixed(1)}" x2="${(FX + sc.X(r.hi, FW)).toFixed(1)}" y1="${cy}" y2="${cy}" stroke="${dirColour(P, d)}" stroke-width="1.6"/>`);
      if (r && effOf(r)) parts.push(`<circle cx="${(FX + sc.X(effOf(r), FW)).toFixed(1)}" cy="${cy}" r="4.6" fill="${d === 'ns' ? P.bg : dirColour(P, d)}" stroke="${dirColour(P, d)}" stroke-width="1.5"/>`);
      parts.push(txt(P, Wd - 4, cy + 4, r ? `${fxn(effOf(r))}${r.lo != null ? ` [${fxn(r.lo)}–${fxn(r.hi)}]` : ''} · q ${fq(r.q)}` : 'not tested', { size: 10.5, anchor: 'end', fill: dirColour(P, d) === P.muted ? P.muted : P.ink }));
      y += RH;
    });
    for (let k = sc.lo; k <= sc.hi; k++) {
      const x = FX + sc.X(2 ** k, FW);
      parts.unshift(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top}" y2="${y}" stroke="${k === 0 ? P.ink : P.line}" stroke-width="${k === 0 ? 1 : 0.8}"${k === 0 ? '' : ' stroke-dasharray="2 3"'}/>`);
      parts.push(txt(P, x, y + 13, `${2 ** k >= 1 ? 2 ** k : '1/' + 2 ** -k}×`, { size: 9.5, anchor: 'middle', fill: P.muted }));
    }
    return { body: parts.join(''), H: y + 20 };
  }
  function forestHtml(pg, sec, b, bi) {
    const s = st(bkey(pg, sec, bi), { m: b.method || 'mantel_haenszel' }), rows = rowsFor(b.rows, s.m);
    const sc = scale(rows.flatMap(x => [x.site, x.mine].filter(Boolean).flatMap(r => [effOf(r), r.lo, r.hi])));
    const X = v => (sc.X(v, 100)).toFixed(2) + '%';
    let grp = null;
    const body = rows.map(x => {
      const r = shown(x), d = dirOf(r), head = x.group && x.group !== grp ? ((grp = x.group), `<div class="ixf-group">${esc(x.group)}</div>`) : '';
      const tick = selOn() && x.site && effOf(x.site) ? `<line class="ixf-whole" x1="${X(effOf(x.site))}" x2="${X(effOf(x.site))}" y1="20%" y2="80%"/>` : '';
      const ci = r && r.lo != null && r.hi != null ? `<line class="whisker ${d}" x1="${X(r.lo)}" x2="${X(r.hi)}" y1="50%" y2="50%"/>` : '';
      const dot = r && effOf(r) ? `<circle class="dot ${d}" cx="${X(effOf(r))}" cy="50%" r="4.6"/>` : '';
      const n = r ? `${int(r.a)} of ${int(r.a + r.b)} <span class="muted">(${pcS(r.a, r.a + r.b)})</span>` : '–', o = r ? `${int(r.c)} of ${int(r.c + r.d)} <span class="muted">(${pcS(r.c, r.c + r.d)})</span>` : '–';
      return head + `<div class="ixf-row" data-f="a:${esc(x.ref.analysis)}" data-v="${esc(x.ref.category)}" role="button" tabindex="0" title="Select the ${esc(W.marks)} ${esc(x.label)}" data-ixr="${esc(JSON.stringify([x.ref.analysis, x.ref.category, s.m]))}">` +
        `<span class="lab">${esc(x.label)}</span><svg aria-hidden="true">${gridLines(sc, X)}${tick}${ci}${dot}</svg>` +
        `<span class="ixf-or ${d}">${r && effOf(r) ? `${fxn(effOf(r))}${r.lo != null ? ` <span class="muted">[${fxn(r.lo)}–${fxn(r.hi)}]</span>` : ''}` : '–'}</span>` +
        `<span class="ixf-n">${n}</span><span class="ixf-n">${o}</span><span class="ixf-q">${r ? fq(r.q) : '–'}</span><span class="ixf-n">${r?.strata != null ? `${int(r.strata)}` : '–'}</span></div>`;
    }).join('');
    const axis = `<div class="ixf-row ixf-axis" aria-hidden="true"><span></span><svg>${Array.from({ length: sc.hi - sc.lo + 1 }, (_, k) => sc.lo + k).map(k => `<text x="${X(2 ** k)}" y="11" text-anchor="middle">${2 ** k >= 1 ? 2 ** k : '1/' + 2 ** -k}×</text>`).join('')}</svg><span></span><span></span><span></span><span></span><span></span></div>`;
    const head = `<div class="ixf-row ixf-head"><span>${esc(cap(W.residue))} is…</span><span>Odds ratio [95% CI]</span><span></span><span>${esc(cap(W.marks))}</span><span>Other ${esc(W.residues)}</span><span>q</span><span title="Proteins with ${esc(W.marks)} and other ${esc(W.residues)} on both sides of the class (within each protein)">Informative proteins</span></div>`;
    return seg(bkey(pg, sec, bi), s.m) + `<div class="ixf">${head}${body}${axis}</div>` + forestNote(rows, s.m);
  }
  const gridLines = (sc, X) => Array.from({ length: sc.hi - sc.lo + 1 }, (_, k) => sc.lo + k).map(k => `<line class="${k === 0 ? 'one' : 'grid'}" x1="${X(2 ** k)}" x2="${X(2 ** k)}" y1="0" y2="100%"/>`).join('');
  const seg = (key, m) => `<div class="ix-tools"><span class="seg" role="group" aria-label="Test">${['mantel_haenszel', 'fisher'].map(x => `<button type="button" data-ix-m="${esc(key)}" data-v="${x}" aria-pressed="${m === x}">${METHOD[x]}</button>`).join('')}</span></div>`;
  function forestNote(rows, m) {
    if (!selOn()) return `<p class="muted small">${m === 'mantel_haenszel' ? 'Within each protein: a Mantel–Haenszel odds ratio with its 95% CI (Robins–Breslow–Greenland), each protein a stratum' : 'Pooled: Fisher’s exact test, the Haldane–Anscombe odds ratio'}; each ${esc(W.mark)} against the other ${esc(W.residues)} the evidence could reach (the release’s background for each test). q: Benjamini–Hochberg within the question. Click a row to select its ${esc(W.marks)}.</p>`;
    if (!testable()) return `<p class="note">Too few to test: a selection needs at least ${K.sel.MIN.proteins} proteins and ${K.sel.MIN.marks} ${esc(W.marks)}. The rows are the whole dataset’s.</p>`;
    return `<p class="muted small">Your selection, tested again in the browser (exploratory; not adjusted for the other selections tried); the grey tick is the whole dataset’s odds ratio. ${rows.some(x => x.mine?.descriptive) ? 'A question the selection was made with is shown, not tested.' : ''}</p>`;
  }
  function forestTsv(b, m) {
    const rows = rowsFor(b.rows, m);
    const one = (r, who) => (r ? [who, r.method || m, r.a, r.b, r.c, r.d, g6(effOf(r)), g6(r.lo), g6(r.hi), g6(r.p), g6(r.q), r.strata ?? ''] : [who, m, '', '', '', '', '', '', '', '', '', '']);
    return ['group', 'analysis', 'category', 'label', 'rows', 'method', 'a', 'b', 'c', 'd', 'odds_ratio', 'ci_low', 'ci_high', 'p', 'q', 'n_strata'].join('\t') + '\n' +
      rows.flatMap(x => [[x.group, x.ref.analysis, x.ref.category, x.label, ...one(x.site, 'whole dataset')], ...(selOn() ? [[x.group, x.ref.analysis, x.ref.category, x.label, ...one(x.mine, 'selection')]] : [])].map(r => r.join('\t'))).join('\n') + '\n';
  }
  const g6 = v => (v == null || !Number.isFinite(+v) ? '' : String(+Number(v).toPrecision(6)));

  // ---- lines: a question's strata as x (distance along the chain, say) ------------------------------------------------
  function linesData(b, m) {
    const xs = Object.entries(b.x || {}).sort((p, q) => p[1] - q[1]);
    const sel = selOn() && testable() && SD() ? K.sel.rows(b.analysis, m) || [] : null;
    return (b.series || []).map((c, k) => ({ c, k, label: (A[b.analysis]?.labels || {})[c] || ((A[b.analysis]?.labels || {})[`${c}_${xs[0]?.[0]}`] || c).replace(/,.*$/, ''),
      pts: xs.map(([code, x]) => { const cat = `${c}_${code}`, r = sel ? sel.find(y => y.category === cat) : rowOf(b.analysis, cat, m); return r && effOf(r) ? { x, r, cat } : null; }).filter(Boolean) })).filter(s => s.pts.length);
  }
  function linesBody(b, m, ex, Wd = 760, H0 = 300) {
    const P = pal(ex), ser = linesData(b, m), xs = Object.values(b.x || {}), parts = [];
    const vals = ser.flatMap(s => s.pts.flatMap(p => [effOf(p.r), p.r.lo, p.r.hi]));
    const sc = scale(vals), ML = 46, MR = 170, MT = 10, MB = 34, PW = Wd - ML - MR, PH = H0 - MT - MB;
    const xmin = Math.min(...xs), xmax = Math.max(...xs), X = x => ML + ((x - xmin) / (xmax - xmin || 1)) * PW, Y = v => MT + PH - sc.X(v, PH);
    for (let k = sc.lo; k <= sc.hi; k++) parts.push(`<line x1="${ML}" x2="${ML + PW}" y1="${Y(2 ** k).toFixed(1)}" y2="${Y(2 ** k).toFixed(1)}" stroke="${k === 0 ? P.ink : P.line}" stroke-width="${k === 0 ? 1 : 0.8}"${k ? ' stroke-dasharray="2 3"' : ''}/>`, txt(P, ML - 6, Y(2 ** k) + 3.5, `${2 ** k >= 1 ? 2 ** k : '1/' + 2 ** -k}×`, { size: 9.5, anchor: 'end', fill: P.muted }));
    xs.forEach(x => parts.push(txt(P, X(x), MT + PH + 14, String(x), { size: 9.5, anchor: 'middle', fill: P.muted })));
    parts.push(txt(P, ML + PW / 2, MT + PH + 29, b.x_label || 'x', { size: 10, anchor: 'middle', fill: P.muted }));
    ser.forEach(s => {
      const c = SER[s.k % SER.length], band = s.pts.filter(p => p.r.lo != null && p.r.hi != null);
      if (band.length > 1) parts.push(`<polygon points="${[...band.map(p => `${X(p.x).toFixed(1)},${Y(p.r.hi).toFixed(1)}`), ...band.slice().reverse().map(p => `${X(p.x).toFixed(1)},${Y(p.r.lo).toFixed(1)}`)].join(' ')}" fill="${c}" opacity="0.10"/>`);
      parts.push(`<polyline points="${s.pts.map(p => `${X(p.x).toFixed(1)},${Y(effOf(p.r)).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="1.8"/>`);
      s.pts.forEach(p => parts.push(`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(effOf(p.r)).toFixed(1)}" r="3.4" fill="${dirOf(p.r) === 'ns' ? P.bg : c}" stroke="${c}" stroke-width="1.4" data-ixr="${esc(JSON.stringify([b.analysis, p.cat, m]))}"/>`));
    });
    let ly = MT + 8;
    ser.forEach(s => { const c = SER[s.k % SER.length]; parts.push(`<line x1="${ML + PW + 14}" x2="${ML + PW + 30}" y1="${ly - 3.5}" y2="${ly - 3.5}" stroke="${c}" stroke-width="2"/>`, txt(P, ML + PW + 36, ly, s.label, { size: 10.5 })); ly += 16; });
    return { body: parts.join(''), H: H0 };
  }
  function linesHtml(pg, sec, b, bi) {
    const s = st(bkey(pg, sec, bi), { m: b.method || 'mantel_haenszel' }), L = linesBody(b, s.m, false);
    const ser = linesData(b, s.m), lastX = Math.max(...Object.values(b.x || {}));
    const say = ser.map(x => { const at0 = x.pts[0], far = x.pts.find(p => p.x === lastX) || x.pts[x.pts.length - 1]; return `${esc(x.label)}: ${fx2(effOf(at0.r))} at ${int(at0.x)}, ${fx2(effOf(far.r))} at ${int(far.x)}`; }).join('; ');
    return seg(bkey(pg, sec, bi), s.m) + `<div class="ix-plot"><svg viewBox="0 0 760 ${L.H}" role="img" aria-label="${esc(sec.title)}">${L.body}</svg></div><p class="muted small">${say}. Filled: q ≤ 0.05; the band is the 95% CI (within each protein). Hover a point for its test.</p>`;
  }
  function linesTsv(b, m) {
    return ['series', 'x', 'category', 'a', 'b', 'c', 'd', 'odds_ratio', 'ci_low', 'ci_high', 'p', 'q'].join('\t') + '\n' +
      linesData(b, m).flatMap(s => s.pts.map(p => [s.label, p.x, p.cat, p.r.a, p.r.b, p.r.c, p.r.d, g6(effOf(p.r)), g6(p.r.lo), g6(p.r.hi), g6(p.r.p), g6(p.r.q)].join('\t'))).join('\n') + '\n';
  }

  // ---- sets: a protein-set question as a table of meters ----------------------------------------------------------
  function setRows(b) {
    const site = D.rows.filter(r => r.analysis === b.analysis && r.method === 'enricher');
    const sel = selOn() && testable() && SD() ? K.sel.rows(b.analysis, 'enricher') || [] : null;
    return site.map(r => ({ site: r, mine: sel ? sel.find(x => x.category === r.category) || null : null, strat: D.rows.find(x => x.analysis === r.analysis && x.category === r.category && x.method === 'mantel_haenszel') }));
  }
  function setsHtml(pg, sec, b) {
    const rows = setRows(b);
    const meter = (k, n, K2, N) => `<span class="ix-meter" title="${int(k)} of ${int(n)} (${pcS(k, n)}) against ${int(K2)} of ${int(N)} (${pcS(K2, N)})"><i style="width:${(100 * k / (n || 1)).toFixed(1)}%"></i><b style="left:${(100 * K2 / (N || 1)).toFixed(1)}%"></b></span>`;
    const hold = x => { const h = K.holdStatus(x.site); const s2 = x.strat; return s2 ? `<span class="ix-hold ${h || ''}" title="Within abundance deciles: OR ${fxn(s2.or ?? s2.eff)}${s2.lo != null ? ` [${fxn(s2.lo)}–${fxn(s2.hi)}]` : ''}, q ${fq(s2.q)}">${h === 'holds' ? '✓' : h === 'weaker' ? '◌' : h === 'lost' ? '○' : dirOf(s2) === 'less' ? '▼' : '·'} ${fxn(s2.or ?? s2.eff)}</span>` : '–'; };
    return `<div class="tbl-card"><table class="tbl ix-sets"><thead><tr><th>Set</th><th>${esc(cap(W.marked))} proteins</th><th class="num">In the set</th><th class="num">All proteins</th><th class="num">Fold</th><th class="num">q</th><th class="num" title="The same test within protein abundance deciles: ✓ holds, ◌ same direction but not significant, ○ lost">Within deciles</th></tr></thead><tbody>` +
      rows.map(x => { const r = selOn() && x.mine ? x.mine : x.site, d = dirOf(r);
        return `<tr data-f="p:${esc(b.analysis)}" data-v="${esc(x.site.category)}" title="Select the ${esc(W.marks)} on proteins in it"><td class="wrapok">${esc(x.site.label)}</td><td>${meter(r.a, r.a + r.b, r.a + r.c, r.a + r.b + r.c + r.d)}</td><td class="num">${int(r.a)} <span class="muted">of ${int(r.a + r.b)} (${pcS(r.a, r.a + r.b)})</span></td><td class="num">${int(r.a + r.c)} <span class="muted">of ${int(r.a + r.b + r.c + r.d)} (${pcS(r.a + r.c, r.a + r.b + r.c + r.d)})</span></td><td class="num ixf-or ${d}">${fxn(r.fold ?? r.eff)}×</td><td class="num">${fq(r.q)}</td><td class="num">${selOn() ? '<span class="muted">–</span>' : hold(x)}</td></tr>`; }).join('') +
      `</tbody></table></div><p class="muted small">${selOn() ? 'Your selection’s proteins, tested again in the browser (one-sided hypergeometric over the same sets). ' : ''}The meter: the share of ${esc(W.marked)} proteins in the set (bar) against that of all proteins of the background (tick). ${esc(A[b.analysis]?.sub || '')}</p>`;
  }
  function setsTsv(b) {
    return ['set', 'label', 'rows', 'a', 'b', 'c', 'd', 'fold_enrichment', 'p', 'q', 'within_deciles_or', 'within_deciles_q'].join('\t') + '\n' +
      setRows(b).flatMap(x => [[x.site.category, x.site.label, 'whole dataset', x.site.a, x.site.b, x.site.c, x.site.d, g6(x.site.fold), g6(x.site.p), g6(x.site.q), g6(x.strat?.or), g6(x.strat?.q)],
        ...(selOn() && x.mine ? [[x.site.category, x.site.label, 'selection', x.mine.a, x.mine.b, x.mine.c, x.mine.d, g6(x.mine.fold), g6(x.mine.p), g6(x.mine.q), '', '']] : [])].map(r => r.join('\t'))).join('\n') + '\n';
  }

  // ---- shares: a category attribute's values among the marks ------------------------------------------------------
  function shareCounts(name) {
    const sd = SD(); if (!sd) return null;
    const vals = sd.attributes[name], n = vals.map(() => 0), idx = markIdx();
    idx.forEach(i => { const cs = attrCodes(sd.marks[i], name); (cs.length ? cs : []).forEach(c => { n[c]++; }); });
    const order = Object.keys(SPECS[name]?.values || {});
    const list = vals.map((v, c) => ({ v, c, n: n[c] })).filter(x => x.n || order.includes(x.v)).sort((x, y) => (order.indexOf(x.v) + 1 || 99) - (order.indexOf(y.v) + 1 || 99) || y.n - x.n);
    return { list, total: idx.length };
  }
  function sharesHtml(b, compact) {
    const sc = shareCounts(b.attribute); if (!sc) return loading();
    const bar = `<div class="ix-stack" role="img" aria-label="${esc(SPECS[b.attribute].label)}">${sc.list.map((x, k) => x.n ? `<span data-f="t:${esc(b.attribute)}" data-v="${esc(x.v)}" style="width:${(100 * x.n / (sc.total || 1)).toFixed(2)}%;background:${attrColour(b.attribute, x.v, k)}" title="${esc(vlabel(b.attribute, x.v))}: ${int(x.n)} (${pcS(x.n, sc.total)}); click to select them"></span>` : '').join('')}</div>`;
    const key = `<div class="ix-key">${sc.list.map((x, k) => `<button type="button" class="ix-keyi" data-f="t:${esc(b.attribute)}" data-v="${esc(x.v)}"><i style="background:${attrColour(b.attribute, x.v, k)}"></i>${esc(vlabel(b.attribute, x.v))} <b>${int(x.n)}</b> <span class="muted">${pcS(x.n, sc.total)}</span></button>`).join('')}</div>`;
    return bar + key + (compact ? '' : `<p class="muted small">${esc(SPECS[b.attribute].help || '').replace(/([^.])$/, '$1.')} Of ${int(sc.total)} ${esc(selOn() ? 'selected ' + W.marks : W.marks)}. Click a part to select its ${esc(W.marks)}.</p>`);
  }
  const sharesTsv = b => { const sc = shareCounts(b.attribute); return ['value', 'label', W.marks.replace(/\W+/g, '_'), 'share'].join('\t') + '\n' + sc.list.map(x => [x.v, vlabel(b.attribute, x.v), x.n, g6(x.n / (sc.total || 1))].join('\t')).join('\n') + '\n'; };
  function sharesBody(b, ex, Wd = 760) {
    const P = pal(ex), sc = shareCounts(b.attribute), parts = []; let x = 0;
    sc.list.forEach((v, k) => { const w = (Wd * v.n) / (sc.total || 1); if (w > 0) parts.push(`<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="22" fill="${attrColour(b.attribute, v.v, k)}"/>`); x += w; });
    let lx = 0, ly = 42;
    sc.list.forEach((v, k) => { const t = `${vlabel(b.attribute, v.v)} ${int(v.n)} (${pcS(v.n, sc.total)})`, w = K.tw(t, 11) + 26; if (lx + w > Wd) { lx = 0; ly += 18; } parts.push(`<rect x="${lx}" y="${ly - 9}" width="10" height="10" fill="${attrColour(b.attribute, v.v, k)}"/>`, txt(P, lx + 15, ly, t, { size: 11 })); lx += w; });
    return { body: parts.join(''), H: ly + 10 };
  }

  // ---- combinations: an UpSet-style table of a list attribute ------------------------------------------------------
  function combos(b) {
    const sd = SD(); if (!sd) return null;
    const vals = (b.values && b.values.length ? b.values : Object.keys(SPECS[b.attribute].values || {})).filter(v => sd.attributes[b.attribute].includes(v));
    const code = Object.fromEntries(vals.map(v => [sd.attributes[b.attribute].indexOf(v), v]));
    const tot = Object.fromEntries(vals.map(v => [v, 0])), by = new Map(); let none = 0;
    const idx = markIdx();
    idx.forEach(i => { const have = attrCodes(sd.marks[i], b.attribute).map(c => code[c]).filter(Boolean); have.forEach(v => { tot[v]++; }); if (!have.length) { none++; return; } const k = vals.filter(v => have.includes(v)).join('|'); by.set(k, (by.get(k) || 0) + 1); });
    const list = [...by.entries()].map(([k, n]) => ({ vs: k.split('|'), n })).sort((x, y) => y.n - x.n);
    return { vals, tot, list, none, total: idx.length };
  }
  function combinationsHtml(pg, sec, b, bi) {
    const c = combos(b); if (!c) return loading();
    const s = st(bkey(pg, sec, bi), { all: false }), shownL = s.all ? c.list : c.list.slice(0, b.top || 15);
    const max = Math.max(1, ...c.list.map(x => x.n));
    const head = `<tr><th>${esc(cap(W.marks))}</th>${c.vals.map(v => `<th class="ix-vh" title="${esc(vlabel(b.attribute, v))}"><span>${esc(vlabel(b.attribute, v))}</span></th>`).join('')}</tr>`;
    const totals = `<tr class="ix-tot"><td class="muted small">with each</td>${c.vals.map(v => `<td><button type="button" class="ix-cnt" data-f="t:${esc(b.attribute)}" data-v="${esc(v)}" title="Select the ${int(c.tot[v])} ${esc(marksWord(c.tot[v]))} with: ${esc(vlabel(b.attribute, v))}">${int(c.tot[v])}</button></td>`).join('')}</tr>`;
    const rows = shownL.map(x => `<tr><td class="ix-barc"><button type="button" class="ix-cnt" data-ix-q="${esc(x.vs.map(v => `${b.attribute}:${v}`).join(' '))}" title="Select the ${esc(W.marks)} with all of these"><span class="ix-hbar" style="width:${(100 * x.n / max).toFixed(1)}%"></span>${int(x.n)}</button></td>${c.vals.map(v => `<td class="ix-dotc">${x.vs.includes(v) ? '<i class="ix-on"></i>' : '<i class="ix-off"></i>'}</td>`).join('')}</tr>`).join('');
    return `<div class="tbl-card ix-upset"><table class="tbl"><thead>${head}</thead><tbody>${totals}${rows}</tbody></table></div>` +
      `<p class="small">${int(c.none)} ${esc(marksWord(c.none))} (${pcS(c.none, c.total)}) carry none of these; most sit in proteins never crystallised, modelled with a partner or crosslinked, so no evidence is not evidence of no contact.` +
      (c.list.length > (b.top || 15) ? ` <button type="button" class="linkish" data-ix-all="${esc(bkey(pg, sec, bi))}">${s.all ? 'Show the commonest' : `Show all ${int(c.list.length)} combinations`}</button>` : '') + '</p>';
  }
  const combinationsTsv = b => { const c = combos(b); return [...c.vals, W.marks.replace(/\W+/g, '_')].join('\t') + '\n' + c.list.map(x => [...c.vals.map(v => (x.vs.includes(v) ? 1 : 0)), x.n].join('\t')).join('\n') + '\n' + [...c.vals.map(() => 0), c.none].join('\t') + '\n'; };

  // ---- matrix: features of the marks against the values of a list attribute ---------------------------------------
  function feature(r) {
    const sd = SD(), [kind, id] = r.filter.split(':');
    if (kind === 'a') { const ai = sd.analyses.indexOf(id), ci = sd.classes[id].indexOf(r.value); return ai < 0 || ci < 0 ? null : m => m[2][ai].includes(ci); }
    if (kind === 't') { const ti = AT().indexOf(id), ci = sd.attributes[id]?.indexOf(r.value); return ti < 0 || ci == null || ci < 0 ? null : m => (m[3][ti] || []).includes(ci); }
    return null;
  }
  function matrixData(b, m) {
    const sd = SD(); if (!sd) return null;
    const cols = (b.values && b.values.length ? b.values : Object.keys(SPECS[b.attribute].values || {})).filter(v => sd.attributes[b.attribute].includes(v));
    const ccode = cols.map(v => sd.attributes[b.attribute].indexOf(v)), ti = AT().indexOf(b.attribute);
    const idx = markIdx(), feats = (b.rows || []).map(r => ({ r, f: feature(r) })).filter(x => x.f);
    const cells = [];
    feats.forEach((x, ri) => cols.forEach((v, cj) => {
      let a = 0, bb = 0, c = 0, d = 0; const byP = {};
      idx.forEach(i => { const mk = sd.marks[i], ev = (mk[3][ti] || []).includes(ccode[cj]), fe = x.f(mk); const t = (byP[mk[0]] ||= [0, 0, 0, 0]); if (ev && fe) { a++; t[0]++; } else if (ev) { bb++; t[1]++; } else if (fe) { c++; t[2]++; } else { d++; t[3]++; } });
      // among marks with the evidence (a, b) against those without (c, d): the odds of the feature
      const tab = m === 'fisher' ? (() => { const f = ST.fisher(a, c, bb, d); return { or: ((a + 0.5) * (d + 0.5)) / ((c + 0.5) * (bb + 0.5)), p: f.p }; })() : ST.mh(Object.values(byP).map(t => [t[0], t[2], t[1], t[3]]));
      cells.push({ ri, cj, a, b: bb, c, d, or: tab.or, lo: tab.lo, hi: tab.hi, p: tab.p, strata: tab.strata });
    }));
    const q = ST.bh(cells.map(x => (x.a + x.b && x.c + x.d ? x.p : null)));
    cells.forEach((x, k) => { x.q = q[k]; x.dir = K.dir({ eff: x.or, q: x.q }); });
    return { cols, feats, cells };
  }
  function matrixHtml(pg, sec, b, bi) {
    const s = st(bkey(pg, sec, bi), { m: b.method || 'mantel_haenszel' }), md = matrixData(b, s.m); if (!md) return loading();
    const P = pal(false), cell = x => {
      const l2 = x.a && x.or && x.or > 0 && Number.isFinite(x.or) ? Math.log2(x.or) : 0, a = Math.min(1, Math.abs(l2) / 3) * (x.dir === 'more' || x.dir === 'less' ? 0.5 : 0.15);
      const bg = x.dir === 'more' || (x.dir !== 'less' && l2 > 0) ? P.more : P.less;
      return `<td class="ix-mc" style="--ixc:${bg};--a:${a.toFixed(2)}" title="${esc(md.feats[x.ri].r.label)} among ${esc(W.marks)} with ${esc(vlabel(b.attribute, md.cols[x.cj]))}: ${int(x.a)} of ${int(x.a + x.b)} (${pcS(x.a, x.a + x.b)}) against ${int(x.c)} of ${int(x.c + x.d)} without (${pcS(x.c, x.c + x.d)}); OR ${fxn(x.or)}${x.lo != null ? ` [${fxn(x.lo)}–${fxn(x.hi)}]` : ''}, q ${fq(x.q)}">${x.a ? `<b class="${x.dir}">${fxn(x.or)}</b><small>${int(x.a)}</small>` : `<span class="muted" title="No ${esc(W.mark)} has both">–</span>`}</td>`;
    };
    let grp = null;
    return seg(bkey(pg, sec, bi), s.m) + `<div class="tbl-card"><table class="tbl ix-matrix"><thead><tr><th></th>${md.cols.map(v => `<th class="ix-vh"><span>${esc(vlabel(b.attribute, v))}</span></th>`).join('')}</tr></thead><tbody>` +
      md.feats.map((f, ri) => (f.r.group && f.r.group !== grp ? ((grp = f.r.group), `<tr class="ix-mg"><td colspan="${md.cols.length + 1}">${esc(f.r.group)}</td></tr>`) : '') +
        `<tr><th class="ix-mrow" data-f="${esc(f.r.filter)}" data-v="${esc(f.r.value)}" title="Select the ${esc(W.marks)}: ${esc(f.r.label)}">${esc(f.r.label)}</th>${md.cells.filter(x => x.ri === ri).map(cell).join('')}</tr>`).join('') +
      `</tbody></table></div><p class="muted small">Each cell: how much more often ${esc(theMarks())} with that evidence have the feature than those without (${s.m === 'fisher' ? 'pooled, Haldane–Anscombe odds ratio, Fisher’s exact test' : 'within each protein, Mantel–Haenszel'}), and below it how many have both. Red: more often, slate: less often (q ≤ 0.05 over the matrix and at least 1.1×); pale: not significant. Descriptive: evidence and features come from the same sources for some ${esc(W.marks)}.</p>`;
  }
  const matrixTsv = (b, m) => { const md = matrixData(b, m); return ['feature', 'evidence', 'a', 'b', 'c', 'd', 'odds_ratio', 'ci_low', 'ci_high', 'p', 'q'].join('\t') + '\n' + md.cells.map(x => [md.feats[x.ri].r.label, vlabel(b.attribute, md.cols[x.cj]), x.a, x.b, x.c, x.d, g6(x.or), g6(x.lo), g6(x.hi), g6(x.p), g6(x.q)].join('\t')).join('\n') + '\n'; };
  function matrixBody(b, m, ex, Wd = 760) {
    const P = pal(ex), md = matrixData(b, m), LW = 170, CW = (Wd - LW) / Math.max(1, md.cols.length), RH = 22, parts = [], top = 110;
    md.cols.forEach((v, j) => parts.push(`<text transform="translate(${(LW + j * CW + CW / 2).toFixed(1)},${top - 6}) rotate(-50)" font-size="9.5" fill="${P.ink}">${esc(vlabel(b.attribute, v).slice(0, 26))}</text>`));
    md.feats.forEach((f, i) => { const y = top + i * RH; parts.push(txt(P, 0, y + 15, f.r.label, { size: 10.5 }));
      md.cells.filter(x => x.ri === i).forEach(x => { const l2 = x.or > 0 && Number.isFinite(x.or) ? Math.log2(x.or) : 0, a = Math.min(1, Math.abs(l2) / 3) * (x.dir === 'more' || x.dir === 'less' ? 0.85 : 0.18);
        parts.push(`<rect x="${(LW + x.cj * CW + 1).toFixed(1)}" y="${y + 1}" width="${(CW - 2).toFixed(1)}" height="${RH - 2}" fill="${l2 > 0 ? P.more : P.less}" opacity="${a.toFixed(2)}"/>`, x.a + x.b ? txt(P, LW + x.cj * CW + CW / 2, y + 15, fxn(x.or), { size: 9, anchor: 'middle' }) : ''); }); });
    return { body: parts.join(''), H: top + md.feats.length * RH + 8 };
  }

  // ---- checker: is a mark in an interaction? -----------------------------------------------------------------------
  function checkerHtml(pg, sec, b, bi) {
    const s = st(bkey(pg, sec, bi), { q: '' }), sd = SD();
    const box = `<form class="ix-check" data-ix-check="${esc(bkey(pg, sec, bi))}"><input type="search" name="q" value="${esc(s.q)}" placeholder="e.g. ${esc((D.site.examples || []).find(e => /\s[A-Z]?\d+$/.test(e)) || 'GENE 123')}, or a gene" aria-label="A ${esc(W.mark)} or a gene" autocomplete="off" spellcheck="false"><button class="btn small" type="submit">Check</button></form>`;
    if (!s.q || !sd) return box;
    const q = K.sel.parse(s.q), sites = q.sites.map(([p, pos]) => [p, pos, markAt(p, pos)]), genes = q.genes;
    if (!sites.length && !genes.length) return box + `<p class="muted small">No ${esc(W.mark)} or protein of this site matches “${esc(s.q)}”.</p>`;
    const one = ([p, pos, i]) => {
      if (i == null) return `<div class="ix-card"><b>${esc(gene(p))} ${esc(residueLetter())}${int(pos)}</b> <span class="muted">is not a ${esc(W.mark)} of this site.</span></div>`;
      const m = sd.marks[i], attrs = b.attributes.map(n => { const vs = attrCodes(m, n).map(c => valOf(n, c)).filter(v => v !== ''); return `<dt>${esc(SPECS[n].label)}</dt><dd>${vs.length ? vs.map(v => `<span class="ix-tag">${esc(vlabel(n, v))}</span>`).join(' ') : '<span class="muted">none recorded</span>'}</dd>`; }).join('');
      const recs = b.tables.map(tn => { const t = table(tn); if (!t) return ''; const rs = t.key === 'residue' ? t.rows.filter(r => r[0] === p && r[1] === pos) : t.key === 'protein' ? [] : []; if (!rs.length) return '';
        const cols = t.columns.slice(0, 6).map(c => c.name); return `<details class="ix-recs"><summary>${esc(rs.length)} record${rs.length === 1 ? '' : 's'}: ${esc(TB[tn].columns[0]?.label || tn)}</summary><div class="tbl-card"><table class="tbl"><thead><tr>${cols.map(c => `<th>${esc(colMeta(t, c).label)}</th>`).join('')}</tr></thead><tbody>${rs.slice(0, 40).map(r => `<tr>${cols.map(c => `<td class="wrapok">${cellHtml(t, r, c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`; }).join('');
      return `<div class="ix-card"><p><b>${siteLink(p, pos)}</b> <span class="muted">${esc(prot(p)[2] || '')}</span></p><dl class="ix-dl">${attrs}</dl>${recs}</div>`;
    };
    const geneList = genes.slice(0, 3).map(p => { const ms = sd.marks.map((m, i) => [m, i]).filter(([m]) => m[0] === p); const ti = AT().indexOf(b.attributes[0]);
      return `<div class="ix-card"><p>${protLink(p)}: ${int(ms.length)} ${esc(marksWord(ms.length))}${b.attributes[0] ? `, ${int(ms.filter(([m]) => (m[3][ti] || []).some(c => !/^(none|)$/.test(valOf(b.attributes[0], c)))).length)} with ${esc(SPECS[b.attributes[0]].label.toLowerCase())}` : ''}.</p><p class="small">${ms.slice(0, 60).map(([m]) => `<a href="${esc(K.link('protein', `${prot(p)[0]}/${residueLetter()}${m[1]}`))}">${esc(residueLetter())}${m[1]}</a>`).join(' ')}</p></div>`; }).join('');
    return box + sites.slice(0, 5).map(one).join('') + geneList;
  }

  // ---- example: one protein's map with the site's interaction tracks ----------------------------------------------
  const EX = { acc: null, rec: null, err: '', loading: null };
  const shardOf = acc => [...acc].reduce((n, c) => n + c.charCodeAt(0), 0) % (D.shards || 64);
  function loadRec(acc) {
    if (EX.acc === acc && (EX.rec || EX.loading)) return;
    Object.assign(EX, { acc, rec: null, err: '' });
    let inline = null; try { inline = JSON.parse(document.getElementById('protein-data')?.textContent || '{}')[String(shardOf(acc)).padStart(2, '0')]; } catch (e) { inline = null; }
    EX.loading = (inline ? Promise.resolve(inline) : fetch(`data/p/${String(shardOf(acc)).padStart(2, '0')}.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error('missing')))))
      .then(sh => { if (EX.acc === acc) { EX.rec = sh[acc] || null; EX.err = EX.rec ? '' : 'not found'; EX.loading = null; K.map.reset(); K.render(); } }, () => { EX.err = 'The protein’s file could not be read.'; EX.loading = null; K.render(); });
  }
  // the protein shown: the reader's choice, else the selection's protein with most marks carrying evidence, else the default
  function exampleAcc(b, s) {
    if (s.acc) return s.acc;
    if (selOn() && SD()) { const cnt = K.sel.selectedCountByProtein(); const top = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]; if (top) return prot(+top[0])[0]; }
    const d = String(b.protein || '').toUpperCase(); const p = (D.proteins || []).findIndex(x => x[0] === d || String(x[1] || '').toUpperCase() === d);
    return prot(p >= 0 ? p : 0)[0];
  }
  function exampleHtml(pg, sec, b, bi) {
    const s = st(bkey(pg, sec, bi), { acc: '' }), acc = exampleAcc(b, s), p = byAcc[acc];
    loadRec(acc);
    const box = `<form class="ix-check" data-ix-ex="${esc(bkey(pg, sec, bi))}"><input type="search" name="q" value="${esc(gene(p))}" aria-label="A protein" autocomplete="off" spellcheck="false"><button class="btn small" type="submit">Show</button><a class="btn small" href="${esc(K.link('protein', acc))}">Open ${esc(gene(p))} →</a></form>`;
    const rows = lanes(b).map(([, title, help]) => `<span class="ix-tag" title="${esc(help)}">${esc(title)}</span>`).join(' ');
    return box + (EX.err ? `<p class="muted">${esc(EX.err)}</p>` : EX.rec ? `<div id="ix-map" class="pmap"></div>` : loading()) + `<p class="muted small">The rows: ${rows}. Choose and order the rows in the map’s Rows menu; drag across the map to zoom. Every protein page has this view.</p>`;
  }
  function drawExample() {
    const el = document.getElementById('ix-map'); if (!el || !EX.rec) return;
    const p = byAcc[EX.acc]; if (p == null) return;
    const P = D.proteins[p];
    K.map.render(el, { p: { i: p, acc: P[0], gene: P[1], name: P[2], len: P[3], marks: P[4], cand: P[5] }, rec: EX.rec, uni: null, af: null, selected: selOn() ? K.sel.selectedPositions(P[0]) : null, site: null, span: null });
  }

  // ---- table: a page table's rows --------------------------------------------------------------------------------
  function tableView(pg, sec, b, bi) {
    const t = table(b.table); if (!t) return TERR[b.table] ? `<p class="muted">${esc(TERR[b.table])}</p>` : loading();
    const s = st(bkey(pg, sec, bi), { q: '', chip: '', sort: b.sort || '', desc: b.descending ?? true, n: b.limit || 25 });
    let rows = blockRows(t, b);
    const cols = b.columns && b.columns.length ? b.columns : ['accession', ...t.columns.map(c => c.name)];
    const chipCol = b.chips, ci = chipCol ? colIdx(t, chipCol) : -1;
    const chipCounts = {};
    if (ci >= 0) rows.forEach(r => { const v = r[ci]; (Array.isArray(v) ? v : [v]).forEach(x => { if (x != null && x !== '') chipCounts[x] = (chipCounts[x] || 0) + 1; }); });
    if (s.chip && ci >= 0) rows = rows.filter(r => { const v = r[ci]; return Array.isArray(v) ? v.includes(s.chip) : v === s.chip; });
    if (s.q) { const toks = s.q.toLowerCase().split(/\s+/).filter(Boolean); rows = rows.filter(r => { const h = (t.key !== 'none' ? `${gene(r[0])} ${prot(r[0])[0]} ${t.key === 'residue' ? residueLetter() + r[1] : ''} ` : '') + cols.map(c => cellText(t, r, c)).join(' '); const hl = h.toLowerCase(); return toks.every(x => hl.includes(x)); }); }
    if (s.sort) { const j = colIdx(t, s.sort), num = colMeta(t, s.sort).type === 'number'; rows = rows.slice().sort((x, y) => { const a = j < 0 ? 0 : x[j], c = j < 0 ? 0 : y[j]; if (num && (a == null) !== (c == null)) return a == null ? 1 : -1; const r = num ? (a ?? 0) - (c ?? 0) : String(cellText(t, x, s.sort)).localeCompare(String(cellText(t, y, s.sort))); return s.desc ? -r : r; }); }
    const vlab = v => (colMeta(t, chipCol).values || {})[v] ?? v;
    const chips = ci >= 0 ? `<div class="quick"><span class="flabel">${esc(colMeta(t, chipCol).label)}</span><button type="button" class="fchip" data-ix-chip="${esc(bkey(pg, sec, bi))}" data-v="" aria-pressed="${!s.chip}">All <span class="muted">${int(blockRows(t, b).length)}</span></button>${Object.entries(chipCounts).sort((x, y) => y[1] - x[1]).map(([v, n]) => `<button type="button" class="fchip" data-ix-chip="${esc(bkey(pg, sec, bi))}" data-v="${esc(v)}" aria-pressed="${s.chip === v}">${esc(vlab(v))} <span class="muted">${int(n)}</span></button>`).join('')}</div>` : '';
    const search = b.search !== false ? `<div class="ix-tctl"><input type="search" data-ix-tq="${esc(bkey(pg, sec, bi))}" value="${esc(s.q)}" placeholder="Search these rows" aria-label="Search the rows" autocomplete="off"><span class="muted small">${int(rows.length)} row${rows.length === 1 ? '' : 's'}${selOn() ? ' for your selection' : ''}</span></div>` : '';
    const groupsOf = b.group_by ? (() => { const j = colIdx(t, b.group_by), g = {}; rows.forEach(r => { const v = r[j]; (Array.isArray(v) ? v : [v]).forEach(x => { (g[x ?? ''] ||= []).push(r); }); }); const order = Object.keys(colMeta(t, b.group_by).values || {}); return Object.entries(g).sort((x, y) => (order.indexOf(x[0]) + 1 || 99) - (order.indexOf(y[0]) + 1 || 99) || y[1].length - x[1].length); })() : null;
    const tbl = rs => `<div class="tbl-card"><table class="tbl ix-tbl"><thead><tr>${cols.map(c => `<th data-ix-sort="${esc(bkey(pg, sec, bi))}" data-v="${esc(c)}" tabindex="0"${colMeta(t, c).help ? ` title="${esc(colMeta(t, c).help)}"` : ''}${s.sort === c ? ` aria-sort="${s.desc ? 'descending' : 'ascending'}"` : ''} class="${colMeta(t, c).type === 'number' ? 'num' : ''}">${esc(colMeta(t, c).label)}${s.sort === c ? (s.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>` +
      rs.slice(0, s.n).map(r => `<tr>${cols.map(c => `<td class="${colMeta(t, c).type === 'number' ? 'num' : ['list', 'text', 'sequence'].includes(colMeta(t, c).type) ? 'wrapok' : ''}">${cellHtml(t, r, c, b.label && c === b.partner ? (rr => cellText(t, rr, b.label)) : null)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>' +
      (rs.length > s.n ? `<p><button type="button" class="linkish" data-ix-more="${esc(bkey(pg, sec, bi))}">Show ${int(Math.min(100, rs.length - s.n))} more of ${int(rs.length)}</button></p>` : '');
    if (groupsOf) return chips + search + groupsOf.map(([g, rs]) => `<details class="ix-fold"${groupsOf.length <= 4 ? ' open' : ''}><summary><b>${esc((colMeta(t, b.group_by).values || {})[g] ?? (g || 'none'))}</b> <span class="muted">${int(rs.length)} row${rs.length === 1 ? '' : 's'}${t.key === 'residue' ? `, ${int(new Set(rs.map(r => r[0] + ':' + r[1])).size)} ${esc(W.marks)}` : ''}</span></summary>${tbl(rs)}</details>`).join('') || `<p class="muted">No rows${selOn() ? ' for your selection' : ''}.</p>`;
    return chips + search + (rows.length ? tbl(rows) : `<p class="muted">No rows${selOn() ? ' for your selection' : ''}.</p>`);
  }
  // a block's own rows of its table: those its where conditions keep (a column's value in a list), and with a
  // selection, for a table with a members column (a list of proteins), the rows with a selected member
  function blockRows(t, b) {
    let rows = tableRows(t);
    (b.where || []).forEach(w => { const j = colIdx(t, w.column), ok = new Set(w.in || []); rows = rows.filter(r => { const v = r[j]; return Array.isArray(v) ? v.some(x => ok.has(x)) : ok.has(v); }); });
    if (b.members && selOn()) { const j = colIdx(t, b.members), ps = protSet(); rows = rows.filter(r => (r[j] || []).some(a => ps.has(byAcc[a]))); }
    return rows;
  }
  function tableTsv(b) {
    const t = table(b.table); if (!t) return '';
    const cols = b.columns && b.columns.length ? b.columns : t.columns.map(c => c.name);
    const keys = t.key === 'residue' ? ['accession', 'gene', 'position'] : t.key === 'protein' ? ['accession', 'gene'] : [];
    return [...keys, ...cols.filter(c => !['accession', 'position'].includes(c))].join('\t') + '\n' +
      blockRows(t, b).map(r => [...(t.key === 'none' ? [] : [prot(r[0])[0], gene(r[0])]), ...(t.key === 'residue' ? [r[1]] : []), ...cols.filter(c => !['accession', 'position'].includes(c)).map(c => cellText(t, r, c).replace(/\t/g, ' '))].join('\t')).join('\n') + '\n';
  }

  // ---- bars: labels counted by distinct proteins, in groups -------------------------------------------------------
  function barsData(b) {
    const t = table(b.table); if (!t) return null;
    const gj = b.groups ? colIdx(t, b.groups.column) : -1, lj = colIdx(t, b.label), pj = b.partner ? colIdx(t, b.partner) : -1;
    const groups = b.groups ? Object.entries(b.groups.values) : [['', b.title || '']];
    const rows = tableRows(t);
    return groups.map(([code, title]) => {
      const cnt = new Map(), acc = new Map();
      rows.forEach(r => { const g = gj < 0 ? [''] : (Array.isArray(r[gj]) ? r[gj] : [r[gj]]); if (!g.includes(code)) return; const l = r[lj]; if (l == null || l === '') return; (cnt.get(l) || cnt.set(l, new Set()).get(l)).add(r[0]); if (pj >= 0) acc.set(l, r[pj]); });
      const list = [...cnt.entries()].map(([l, s]) => ({ l, n: s.size, ps: [...s], acc: acc.get(l) })).sort((x, y) => y.n - x.n || String(x.l).localeCompare(String(y.l)));
      return { code, title, list };
    }).filter(g => g.list.length);
  }
  function barsHtml(pg, sec, b) {
    const gs = barsData(b); if (!gs) return TERR[b.table] ? `<p class="muted">${esc(TERR[b.table])}</p>` : loading();
    if (!gs.length) return `<p class="muted">None${selOn() ? ' for your selection' : ''}.</p>`;
    const top = b.top || 12;
    return `<div class="ix-bars">${gs.map(g => { const max = Math.max(1, ...g.list.map(x => x.n));
      return `<div class="ix-barg"><h4>${esc(g.title)} <span class="muted small">${g.list.length > top ? `top ${top} of ${int(g.list.length)}` : int(g.list.length)}</span></h4>${g.list.slice(0, top).map(x => `<button type="button" class="ix-barrow" data-ix-q="${esc(x.ps.map(gene).filter(Boolean).join(' '))}" title="Select the ${int(x.n)} ${esc(W.marked)} protein${x.n === 1 ? '' : 's'} that ${esc(x.l)} pairs with">` +
        `<span class="lab">${esc(x.l)}${x.acc && byAcc[String(x.acc).split('-')[0]] != null ? ' <span class="ix-tag" title="It carries ' + esc(W.marks) + ' itself">itself ' + esc(W.marked) + '</span>' : ''}</span><span class="ix-bar"><i style="width:${(100 * x.n / max).toFixed(1)}%"></i></span><b>${int(x.n)}</b></button>`).join('')}</div>`; }).join('')}</div>` +
      `<p class="muted small">Each bar: the ${esc(W.marked)} proteins${selOn() ? ' of your selection' : ''} paired with that protein. Click a bar to select them.</p>`;
  }
  const barsTsv = b => ['group', 'label', `${W.marked}_proteins`.replace(/\W+/g, '_'), 'genes'].join('\t') + '\n' + barsData(b).flatMap(g => g.list.map(x => [g.title, x.l, x.n, x.ps.map(gene).join(';')].join('\t'))).join('\n') + '\n';
  function barsBody(b, ex, Wd = 760) {
    const P = pal(ex), gs = barsData(b), top = b.top || 12, colW = Wd / Math.min(2, gs.length || 1), parts = []; let maxY = 0;
    gs.forEach((g, k) => { const x0 = (k % 2) * colW, y0 = Math.floor(k / 2) * (top * 17 + 34), max = Math.max(1, ...g.list.map(x => x.n));
      parts.push(txt(P, x0, y0 + 12, g.title, { size: 11.5, weight: 700 }));
      g.list.slice(0, top).forEach((x, i) => { const y = y0 + 22 + i * 17; parts.push(txt(P, x0, y + 11, String(x.l).slice(0, 18), { size: 10 }), `<rect x="${x0 + 110}" y="${y + 2}" width="${((colW - 160) * x.n / max).toFixed(1)}" height="11" fill="${P.less}" opacity="0.8"/>`, txt(P, x0 + 115 + (colW - 160) * x.n / max, y + 11, int(x.n), { size: 9.5 })); maxY = Math.max(maxY, y + 17); }); });
    return { body: parts.join(''), H: maxY + 6 };
  }

  // ---- pairs: proteins that a row label and a column label both pair with -----------------------------------------
  function pairsData(b) {
    const t = table(b.table); if (!t) return null;
    const lj = colIdx(t, b.label), side = sp => { const j = colIdx(t, sp.column), by = new Map(); tableRows(t).forEach(r => { const v = r[j]; if (!(Array.isArray(v) ? v.includes(sp.value) : v === sp.value)) return; (by.get(r[lj]) || by.set(r[lj], new Set()).get(r[lj])).add(r[0]); }); return by; };
    const R = side(b.rows || {}), C = side(b.cols || {}), N = new Set(tableRows(t).map(r => r[0])).size || 1;
    const top = b.top || 12, rs = [...R.entries()].sort((x, y) => y[1].size - x[1].size).slice(0, top), cs = [...C.entries()].sort((x, y) => y[1].size - x[1].size).slice(0, top);
    const cells = rs.map(([rl, rset]) => cs.map(([cl, cset]) => { let n = 0; rset.forEach(p => { if (cset.has(p)) n++; }); const e = (rset.size * cset.size) / N; return { rl, cl, n, e, ps: [...rset].filter(p => cset.has(p)) }; }));
    return { rs, cs, cells, N };
  }
  function pairsHtml(pg, sec, b) {
    const d = pairsData(b); if (!d) return TERR[b.table] ? `<p class="muted">${esc(TERR[b.table])}</p>` : loading();
    if (!d.rs.length || !d.cs.length) return `<p class="muted">None${selOn() ? ' for your selection' : ''}.</p>`;
    const max = Math.max(1, ...d.cells.flat().map(x => x.n));
    return `<div class="tbl-card"><table class="tbl ix-matrix ix-pairs"><thead><tr><th></th>${d.cs.map(([cl, s]) => `<th class="ix-vh"><span>${esc(cl)} <small class="muted">${int(s.size)}</small></span></th>`).join('')}</tr></thead><tbody>` +
      d.cells.map((row, i) => `<tr><th>${esc(d.rs[i][0])} <small class="muted">${int(d.rs[i][1].size)}</small></th>${row.map(x => `<td class="ix-mc${x.n > 1.5 * x.e && x.n >= 3 ? ' ix-hi' : ''}" style="--ixc:var(--less);--a:${(0.75 * x.n / max).toFixed(2)}" title="${int(x.n)} ${esc(W.marked)} proteins pair with both ${esc(x.rl)} and ${esc(x.cl)} (${fxn(x.e)} expected if independent)"${x.n ? ` data-ix-q="${esc(x.ps.map(gene).join(' '))}"` : ''}>${x.n ? `<b>${int(x.n)}</b>` : '<span class="muted">·</span>'}</td>`).join('')}</tr>`).join('') +
      `</tbody></table></div><p class="muted small">Each cell: the ${esc(W.marked)} proteins${selOn() ? ' of your selection' : ''} that pair with both; outlined where that is at least 1.5 times as many as expected if the two partners were independent (at least 3). Click a cell to select them.</p>`;
  }
  const pairsTsv = b => { const d = pairsData(b); return ['row', 'column', 'proteins', 'expected', 'genes'].join('\t') + '\n' + d.cells.flat().map(x => [x.rl, x.cl, x.n, g6(x.e), x.ps.map(gene).join(';')].join('\t')).join('\n') + '\n'; };

  // ---- histogram: a residue table's values, marks against the other residues ----------------------------------------
  function histData(b) {
    const t = table(b.table); if (!t) return null;
    const j = colIdx(t, b.value), aj = b.among ? colIdx(t, b.among) : -1, step = b.step || 1, max = b.max || 10, nb = Math.ceil(max / step), mk = new Array(nb).fill(0), ot = new Array(nb).fill(0);
    let nm = 0, no = 0;
    tableRows(t, true).forEach(r => { const v = r[j]; if (aj >= 0 ? !r[aj] : v == null) return; const i = markAt(r[0], r[1]); const isM = i != null && isSelMark(i); if (isM) nm++; else no++; if (v == null || v > max) return; const k = Math.min(nb - 1, Math.floor(v / step)); (isM ? mk : ot)[k]++; });
    return { step, max, nb, mk, ot, nm, no };
  }
  function histBody(b, ex, Wd = 760, H0 = 220) {
    const P = pal(ex), h = histData(b), ML = 40, MB = 32, MT = 10, PW = Wd - ML - 10, PH = H0 - MT - MB, parts = [];
    const sm = h.mk.map(x => x / (h.nm || 1)), so = h.ot.map(x => x / (h.no || 1)), top = Math.max(0.01, ...sm, ...so), bw = PW / h.nb;
    for (let k = 0; k < h.nb; k++) { const x = ML + k * bw; parts.push(`<rect x="${(x + 1).toFixed(1)}" y="${(MT + PH - PH * so[k] / top).toFixed(1)}" width="${(bw / 2 - 1.5).toFixed(1)}" height="${(PH * so[k] / top).toFixed(1)}" fill="${P.same}"/>`, `<rect x="${(x + bw / 2).toFixed(1)}" y="${(MT + PH - PH * sm[k] / top).toFixed(1)}" width="${(bw / 2 - 1.5).toFixed(1)}" height="${(PH * sm[k] / top).toFixed(1)}" fill="${P.more}"/>`); if (k % Math.max(1, Math.round(1 / h.step)) === 0) parts.push(txt(P, x, MT + PH + 13, String(+(k * h.step).toFixed(2)), { size: 9.5, anchor: 'middle', fill: P.muted })); }
    parts.push(`<line x1="${ML}" x2="${ML + PW}" y1="${MT + PH}" y2="${MT + PH}" stroke="${P.ink}"/>`, txt(P, ML + PW / 2, MT + PH + 28, b.x_label || colMeta(table(b.table), b.value).label, { size: 10, anchor: 'middle', fill: P.muted }), txt(P, ML - 6, MT + 8, pcS(top, 1), { size: 9.5, anchor: 'end', fill: P.muted }));
    return { body: parts.join(''), H: H0 };
  }
  function histHtml(pg, sec, b) {
    const h = histData(b); if (!h) return TERR[b.table] ? `<p class="muted">${esc(TERR[b.table])}</p>` : loading();
    const L = histBody(b, false), within = (arr, n, lim) => arr.slice(0, Math.round(lim / h.step)).reduce((s, x) => s + x, 0);
    return `<div class="ix-key"><span class="ix-keyi"><i style="background:var(--more)"></i>${esc(cap(W.marks))}${selOn() ? ' (selected)' : ''} <b>${int(h.nm)}</b></span><span class="ix-keyi"><i style="background:var(--same)"></i>Other ${esc(W.residues)} <b>${int(h.no)}</b></span></div><div class="ix-plot"><svg viewBox="0 0 760 ${L.H}" role="img" aria-label="${esc(sec.title)}">${L.body}</svg></div>` +
      `<p class="muted small">Each bar: the share of each group in a ${fxn(h.step)} Å bin, up to ${int(h.max)} Å, of the ${esc(W.residues)} ${b.among ? esc(colMeta(t0(b), b.among).label.toLowerCase()) : 'with a value'} (those further are counted in the totals only). Within 4 Å: ${pcS(within(h.mk, h.nm, 4), h.nm)} of ${esc(W.marks)} against ${pcS(within(h.ot, h.no, 4), h.no)} of the other ${esc(W.residues)}.</p>`;
  }
  const t0 = b => table(b.table);
  const histTsv = b => { const h = histData(b); return ['bin_from', 'bin_to', W.marks.replace(/\W+/g, '_'), `other_${W.residues}`.replace(/\W+/g, '_')].join('\t') + '\n' + h.mk.map((x, k) => [g6(k * h.step), g6((k + 1) * h.step), x, h.ot[k]].join('\t')).join('\n') + `\n# totals: ${h.nm} marks, ${h.no} other residues\n`; };

  // ---- a block, its exports, and a section ---------------------------------------------------------------------------
  const loading = () => `<p class="muted">Loading…</p>`;
  const FIG = { forest: 1, lines: 1, shares: 1, matrix: 1, bars: 1, histogram: 1, example: 1 };
  function blockHtml(pg, sec, b, bi) {
    if (!ready() && !['text', 'example'].includes(b.kind)) return loading();
    switch (b.kind) {
      case 'forest': return forestHtml(pg, sec, b, bi);
      case 'lines': return linesHtml(pg, sec, b, bi);
      case 'sets': return setsHtml(pg, sec, b);
      case 'shares': return sharesHtml(b);
      case 'combinations': return combinationsHtml(pg, sec, b, bi);
      case 'matrix': return matrixHtml(pg, sec, b, bi);
      case 'checker': return checkerHtml(pg, sec, b, bi);
      case 'example': return exampleHtml(pg, sec, b, bi);
      case 'table': return tableView(pg, sec, b, bi);
      case 'bars': return barsHtml(pg, sec, b);
      case 'pairs': return pairsHtml(pg, sec, b);
      case 'histogram': return histHtml(pg, sec, b);
      case 'text': return `<p>${esc(b.text)}</p>`;
      default: return '';
    }
  }
  const methodOf = b => (b.kind === 'forest' && new Set(b.rows.map(r => r.analysis)).size === 1 ? b.rows[0].analysis : ['lines', 'sets'].includes(b.kind) ? b.analysis : null);
  function exportsOf(pg, sec, b, bi) {
    if (b.kind === 'text' || b.kind === 'checker') return '';
    const kinds = FIG[b.kind] ? ['pdf', 'svg', 'png', 'tsv'] : ['tsv'];
    const m = methodOf(b);
    return K.expBar(b.kind === 'example' ? ['pdf', 'svg', 'png'] : kinds, `ixexp="${esc(bkey(pg, sec, bi))}" data-k`, b.title || sec.title, m || `q-page-${pg.id}`);
  }
  function blockCard(pg, sec, b, bi) {
    return `<div class="ix-block" id="ix-${esc(sec.id)}-${bi}">${b.title || b.sub ? `<div class="card-head"><div>${b.title ? `<h4>${esc(b.title)}</h4>` : ''}${b.sub ? `<p class="sub">${esc(b.sub)}</p>` : ''}</div></div>` : ''}${blockHtml(pg, sec, b, bi)}${b.note ? `<p class="muted small">${esc(b.note)}</p>` : ''}${exportsOf(pg, sec, b, bi)}</div>`;
  }
  const sectionCard = (pg, sec) => `<section class="pcard ix-sec" id="ix-${esc(sec.id)}"><div class="card-head"><div><h3>${esc(sec.title)}</h3>${sec.question || sec.sub ? `<p class="sub">${esc(sec.question || '')}${sec.sub ? ' ' + esc(sec.sub) : ''}</p>` : ''}</div></div>${sec.blocks.map((b, bi) => blockCard(pg, sec, b, bi)).join('')}</section>`;

  // ---- tiles: a section at a glance --------------------------------------------------------------------------------
  function miniForest(refs, m, all = refs) {           // all: the rows whose effects set the scale (several groups share one)
    const rows = rowsFor(refs, m), sc = scale(rowsFor(all, m).map(x => shown(x)).filter(Boolean).flatMap(r => [effOf(r), r.lo, r.hi])), X = v => sc.X(v, 100).toFixed(2) + '%';
    return `<div class="trows">${rows.map(x => { const r = shown(x), d = dirOf(r); return `<div class="trow" data-ixr="${esc(JSON.stringify([x.ref.analysis, x.ref.category, m]))}"><span class="lab">${esc(x.label)}</span><svg aria-hidden="true">${gridLines(sc, X)}${selOn() && x.site && effOf(x.site) ? `<line class="ixf-whole" x1="${X(effOf(x.site))}" x2="${X(effOf(x.site))}" y1="20%" y2="80%"/>` : ''}${r && r.lo != null ? `<line class="whisker ${d}" x1="${X(r.lo)}" x2="${X(r.hi)}" y1="50%" y2="50%"/>` : ''}${r && effOf(r) ? `<circle class="dot ${d}" cx="${X(effOf(r))}" cy="50%" r="4.6"/>` : ''}</svg><span class="val ${d}">${r && effOf(r) ? fx2(effOf(r)) : '–'}</span></div>`; }).join('')}<div class="taxis"><span></span><span class="one-lab" style="--x:${X(1)}">1×</span><span></span></div></div>`;
  }
  const range = rs => { const v = rs.map(effOf).filter(x => x != null).sort((a, b) => a - b); if (!v.length) return '–'; const a = fxn(v[0]), z = fxn(v[v.length - 1]); return a === z ? a + '×' : `${a}–${z}×`; };
  function tileBody(pg, sec) {
    const b = sec.blocks[Math.min(sec.tile ?? 0, sec.blocks.length - 1)];
    if (!ready() && !['text', 'example'].includes(b.kind)) return loading();
    switch (b.kind) {
      case 'forest': { const pickR = b.rows.slice(0, 6), rs = rowsFor(pickR, b.method || 'mantel_haenszel').map(shown).filter(Boolean), more = rs.filter(r => dirOf(r) === 'more'), less = rs.filter(r => dirOf(r) === 'less');
        return miniForest(pickR, b.method || 'mantel_haenszel') + `<p class="tfoot">${more.length ? `<b>${range(more)}</b> more often` : less.length ? `<b>${range(less)}</b>: less often` : 'No difference (q > 0.05)'}${b.rows.length > 6 ? ` <span class="muted">· ${int(b.rows.length)} tests</span>` : ''}</p>`; }
      case 'lines': { const ser = linesData(b, b.method || 'mantel_haenszel'); const L = linesBody(b, b.method || 'mantel_haenszel', false, 760, 300); return `<div class="ix-plot ix-mini"><svg viewBox="0 0 760 ${L.H}" aria-hidden="true">${L.body}</svg></div><p class="tfoot">${ser.slice(0, 2).map(s => `${esc(s.label)} <b>${fx2(effOf(s.pts[0].r))}</b> at ${int(s.pts[0].x)}`).join(' · ')}</p>`; }
      case 'sets': { const rs = setRows(b).slice(0, 2); return rs.map(x => { const r = selOn() && x.mine ? x.mine : x.site; return `<div class="ix-mrow2"><span>${esc(x.site.label)}</span><span class="ix-meter"><i style="width:${(100 * r.a / (r.a + r.b || 1)).toFixed(1)}%"></i><b style="left:${(100 * (r.a + r.c) / (r.a + r.b + r.c + r.d || 1)).toFixed(1)}%"></b></span><span class="muted small">${pcS(r.a, r.a + r.b)} vs ${pcS(r.a + r.c, r.a + r.b + r.c + r.d)}</span></div>`; }).join('') + `<p class="tfoot">${esc(cap(W.marked))} proteins against all proteins</p>`; }
      case 'shares': { const sc = shareCounts(b.attribute); const lead = sc.list[0]; return sharesHtml(b, true) + (lead ? `<p class="tfoot"><b>${int(lead.n)}</b> ${esc(marksWord(lead.n))} (${pcS(lead.n, sc.total)}) ${esc(vlabel(b.attribute, lead.v).toLowerCase())}</p>` : ''); }
      case 'combinations': { const c = combos(b); const any = c.total - c.none; return `<p class="ix-big"><b>${int(any)}</b> <span>${esc(marksWord(any))} with some evidence (${pcS(any, c.total)})</span></p><p class="tfoot">${int(c.list.length)} combinations of ${int(c.vals.length)} kinds</p>`; }
      case 'matrix': { const md = matrixData(b, b.method || 'mantel_haenszel'); const top = md.cells.filter(x => x.dir === 'more').sort((x, y) => y.or - x.or)[0]; return `<p class="small">${esc(sec.question || sec.sub || '')}</p>${top ? `<p class="tfoot">Strongest: <b>${esc(md.feats[top.ri].r.label)}</b> with ${esc(vlabel(b.attribute, md.cols[top.cj]))} (${fx2(top.or)})</p>` : ''}`; }
      case 'table': { const t = table(b.table); if (!t) return loading(); let rs = blockRows(t, b);
        if (b.sort) { const j = colIdx(t, b.sort), desc = b.descending ?? true; rs = rs.slice().sort((x, y) => (x[j] == null) - (y[j] == null) || ((x[j] ?? 0) - (y[j] ?? 0)) * (desc ? -1 : 1)); }
        const n = t.key === 'residue' ? new Set(rs.map(r => r[0] + ':' + r[1])).size : t.key === 'protein' ? new Set(rs.map(r => r[0])).size : rs.length;
        const lab = (b.columns || []).filter(c => c !== 'accession')[1] || (b.columns || []).find(c => c !== 'accession');
        const groups = b.group_by ? (() => { const j = colIdx(t, b.group_by), g = {}; rs.forEach(r => { const k = r[j]; g[k] = g[k] || new Set(); g[k].add(r[0] + ':' + r[1]); }); return Object.entries(g).map(([k, v]) => `${esc((colMeta(t, b.group_by).values || {})[k] ?? k)} <b>${int(v.size)}</b>`).join(' · '); })() : '';
        return `<p class="ix-big"><b>${int(n)}</b> <span>${esc(sec.sub || (t.key === 'residue' ? W.marks : t.key === 'protein' ? 'proteins' : 'rows'))}</span></p>${groups ? `<p class="small">${groups}</p>` : rs.length && lab ? `<p class="tfoot">Top: ${esc(cellText(t, rs[0], lab))}</p>` : ''}`; }
      case 'bars': { const gs = barsData(b); if (!gs) return loading(); return gs.slice(0, 2).map(g => `<p class="small"><b>${esc(g.title)}</b>: ${g.list.slice(0, 4).map(x => `${esc(x.l)} ${int(x.n)}`).join(' · ')}</p>`).join('') || '<p class="muted">None</p>'; }
      case 'pairs': { const d = pairsData(b); if (!d) return loading(); const best = d.cells.flat().sort((x, y) => y.n - x.n)[0]; return `<p class="small">${esc(sec.question || '')}</p>${best ? `<p class="tfoot">Most shared: <b>${esc(best.rl)}</b> and <b>${esc(best.cl)}</b> (${int(best.n)})</p>` : ''}`; }
      case 'histogram': { const h = histData(b); if (!h) return loading(); const L = histBody(b, false, 760, 200); return `<div class="ix-plot ix-mini"><svg viewBox="0 0 760 ${L.H}" aria-hidden="true">${L.body}</svg></div>`; }
      case 'example': return `<p class="small">${esc(sec.question || '')}</p>`;
      case 'checker': return `<p class="small">${esc(sec.question || 'Check one')}</p>`;
      default: return `<p class="small">${esc(b.text || sec.question || '')}</p>`;
    }
  }
  const sectionTile = (pg, sec) => `<article class="tile ix-tile" data-ix-tile="${esc(K.link(pg.id, sec.id))}" tabindex="0"><header><h3>${esc(sec.title)}</h3><span class="chev" aria-hidden="true">›</span></header>${tileBody(pg, sec)}</article>`;

  // ---- the page's head: its question, the answer, highlights ---------------------------------------------------------
  function answerHtml(pg) {
    if (!pg.answer || !pg.answer.rows.length) return '';
    if (selOn() && !testable()) return `<p class="ix-answer">Too few to compare with the other ${esc(W.residues)}: the tests need at least ${K.sel.MIN.proteins} proteins and ${K.sel.MIN.marks} ${esc(W.marks)}, and this selection has ${int(K.sel.nProteins())} protein${K.sel.nProteins() === 1 ? '' : 's'} and ${int(K.sel.nMarks())} ${esc(marksWord(K.sel.nMarks()))}. The counts below hold for any selection.</p>`;
    const rs = rowsFor(pg.answer.rows, 'mantel_haenszel').filter(x => dirOf(shown(x)) === 'more');
    const phrases = [...new Set(rs.map(x => x.ref.phrase || x.label))];
    const list = phrases.length <= 1 ? phrases.join('') : phrases.slice(0, -1).join(', ') + ' and ' + phrases[phrases.length - 1];
    const fill = t => esc(t).replace('{list}', esc(list)).replace('{marks}', esc(theMarks())).replace('{residues}', esc(W.residues));
    return `<p class="ix-answer">${phrases.length ? fill(pg.answer.more) : fill(pg.answer.none || `{marks} are not enriched at these contacts.`).replace(/^./, c => c.toUpperCase())}</p>`;
  }
  function highlightValue(h) {
    if (h.rows && h.rows.length) { const rs = rowsFor(h.rows, 'mantel_haenszel').map(shown).filter(Boolean), d = rs.filter(r => dirOf(r) === 'more' || dirOf(r) === 'less'); return [d.length ? range(d) : 'n.s.', d.length && d.every(r => dirOf(r) === 'more') ? 'more' : d.length ? 'less' : 'ns']; }
    if (h.counts) { const sd = SD(); if (!sd) return ['…', '']; const idx = markIdx(); return [h.counts.map(c => { const codes = new Set(c.values.map(v => sd.attributes[c.attribute].indexOf(v)).filter(x => x >= 0)); return int(idx.filter(i => attrCodes(sd.marks[i], c.attribute).some(x => codes.has(x))).length); }).join(' · '), 'count']; }
    if (h.share) { const t = table(h.share.table); if (!t) return ['…', '']; const oj = colIdx(t, h.share.of), fj = colIdx(t, h.share.flag), seen = new Map(); tableRows(t).forEach(r => seen.set(r[oj], r[fj])); const n = seen.size, k = [...seen.values()].filter(Boolean).length; return [pcS(k, n), 'count']; }
    return ['', ''];
  }
  const GLYPH = { rna: '<path d="M2 12 q4 -8 8 0 t8 0 t8 0" fill="none" stroke="currentColor" stroke-width="2"/>', dna: '<path d="M2 4 C10 4 18 16 26 16 M2 16 C10 16 18 4 26 4" fill="none" stroke="currentColor" stroke-width="2"/>', protein: '<ellipse cx="10" cy="10" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="19" cy="10" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2"/>', structure: '<path d="M2 14 l6 -8 l6 8 l6 -8 l6 8" fill="none" stroke="currentColor" stroke-width="2"/>' };
  function highlightsHtml(pg) {
    if (!pg.highlights.length) return '';
    return `<div class="ix-hls">${pg.highlights.map(h => { const [v, d] = highlightValue(h); return `<a class="ix-hl ${d}" href="${esc(h.section ? K.link(pg.id, h.section) : K.link(pg.id))}"${h.rows?.length ? ` title="${esc(rowsFor(h.rows, 'mantel_haenszel').map(x => { const r = shown(x); return `${x.label}: ${r ? `OR ${fxn(effOf(r))}${r.lo != null ? ` [${fxn(r.lo)}–${fxn(r.hi)}]` : ''}, q ${fq(r.q)}` : 'not tested'}`; }).join('\n'))}"` : ''}>` +
      (h.glyph ? `<svg class="ix-glyph" viewBox="0 0 28 20" aria-hidden="true">${GLYPH[h.glyph] || ''}</svg>` : '') + `<b>${esc(v)}</b><span>${esc(h.label)}</span>${h.tag ? `<small>${esc(h.tag)}</small>` : ''}</a>`; }).join('')}</div>`;
  }
  function selLine() {
    if (!selOn() || !SD()) return '';
    const byP = K.sel.selectedCountByProtein(), pills = Object.entries(byP).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([pi, k]) => `<a class="ppill" href="${esc(K.link('protein', prot(+pi)[0]))}">${esc(gene(+pi))} <span>${int(k)}</span></a>`).join('');
    return `<p class="sel-lead">Your selection: ${esc(K.sel.describe())} · <b>${int(K.sel.nMarks())}</b> ${esc(marksWord(K.sel.nMarks()))} on <b>${int(K.sel.nProteins())}</b> protein${K.sel.nProteins() === 1 ? '' : 's'}</p><div class="ppills">${pills}</div>`;
  }
  const keyLine = () => `<p class="key"><span><i class="kd more"></i>more often</span><span><i class="kd less"></i>less often</span><span><i class="kd same"></i>about the same (within 1.1×)</span><span><i class="kd ns"></i>no difference (q > ${K.PADJ})</span></p>`;

  // ---- the page, a section alone, and the Overview's question --------------------------------------------------------
  function hub(pg) {
    const top = pg.sections.filter(s => s.place === 'top'), links = pg.sections.filter(s => s.place === 'link');
    return `<div class="page-head"><h2>${esc(pg.title)}</h2><span class="tools"><button type="button" class="btn small" data-ix-print title="Print this page, or save it as a PDF">Download PDF</button></span></div>` +
      (pg.sub ? `<p class="page-sub">${esc(pg.sub)}</p>` : '') + selLine() + top.map(s => sectionCard(pg, s)).join('') + answerHtml(pg) + highlightsHtml(pg) +
      (links.length ? `<p class="ix-links">${links.map(s => `<a href="${esc(K.link(pg.id, s.id))}">${esc(s.title)} ›</a>`).join(' · ')}</p>` : '') + keyLine() +
      pg.groups.map(g => { const ts = g.sections.filter(s => !s.place || s.place === 'tile'); return ts.length ? `<h3 class="sec-label" id="ixg-${esc(g.name.replace(/\W+/g, '-').toLowerCase())}">${esc(g.name)}</h3><div class="tiles">${ts.map(s => sectionTile(pg, s)).join('')}</div>` : ''; }).join('');
  }
  function focus(pg, sid) {
    const i = pg.sections.findIndex(s => s.id === sid), sec = pg.sections[i], prev = pg.sections[i - 1], next = pg.sections[i + 1];
    return `<div class="focus-bar"><a href="${esc(K.link(pg.id))}">‹ All sections</a><span class="crumb">${esc(pg.tab)} › ${esc(sec.group)} › <b>${esc(sec.title)}</b></span><span class="muted">${i + 1} of ${pg.sections.length}</span>` +
      `<span class="pn">${prev ? `<a href="${esc(K.link(pg.id, prev.id))}">‹ Previous · ${esc(prev.title)}</a>` : ''}${next ? `<a href="${esc(K.link(pg.id, next.id))}">${esc(next.title)} · Next ›</a>` : ''}</span></div>` + selLine() + sectionCard(pg, sec);
  }
  // the Overview's question: the evidence at a glance, the tests with their CIs, findings, a checker, and the way in
  function ovQuestion(pg) {
    const ov = pg.overview, rows = rowsFor(ov.rows, 'mantel_haenszel');
    const finding = x => { const r = shown(x), d = dirOf(r); if (d !== 'more' && d !== 'less') return ''; return `<li>${esc(cap(theMarks()))} are ${d === 'more' ? 'more' : 'less'} often ${esc(x.ref.phrase || x.label.toLowerCase())} (${pcS(r.a, r.a + r.b)} against ${pcS(r.c, r.c + r.d)} of the other ${esc(W.residues)}; OR ${fxn(effOf(r))}${r.lo != null ? ` [${fxn(r.lo)}–${fxn(r.hi)}]` : ''}, q ${fq(r.q)}).</li>`; };
    const fs = rows.map(finding).filter(Boolean);
    const sec = { id: 'overview', title: ov.title || pg.tab, blocks: [] };
    const chk = ov.checker ? { kind: 'checker', attributes: ov.checker.filter(n => hasAttr(n)), tables: [] } : null;
    return `<div class="focus-bar"><a href="${esc(K.link('overview'))}">‹ Overview</a><span class="crumb">Overview › ${esc(ov.section)} › <b>${esc(ov.title || pg.tab)}</b></span><span class="pn"><a href="${esc(K.link(pg.id))}">Explore ${esc(pg.tab.toLowerCase())} →</a></span></div>` +
      `<div class="page-head"><h2>${esc(ov.title || pg.tab)}</h2></div><p class="page-sub">${esc(ov.question || pg.title)} <a href="${esc(K.link(pg.id))}">Explore ${esc(pg.tab.toLowerCase())} →</a></p>` + selLine() +
      (ov.bar ? `<section class="pcard"><h3>${esc(SPECS[ov.bar].label)}</h3>${ready() ? sharesHtml({ attribute: ov.bar }) : loading()}</section>` : '') +
      `<section class="pcard"><h3>The tests</h3>${keyLine()}${ready() ? forestHtml(pg, sec, { kind: 'forest', rows: ov.rows }, 'ov') : loading()}${K.expBar(['pdf', 'svg', 'png', 'tsv'], `ixexp="${esc(pg.id)}.overview.ov" data-k`, ov.title || pg.tab, `q-page-${pg.id}`)}</section>` +
      (fs.length ? `<section class="pcard"><h3>Findings</h3><ul class="ix-findings">${fs.join('')}</ul></section>` : '') +
      (chk ? `<section class="pcard"><h3>Is a ${esc(W.mark)} in an interaction? Check one</h3>${ready() ? checkerHtml(pg, sec, chk, 'ovchk') : loading()}</section>` : '');
  }
  function view(pg, arg) {
    if (arg === 'overview' && pg.overview) return ovQuestion(pg);
    const sec = arg && pg.sections.find(s => s.id === arg);
    return sec ? focus(pg, arg) : hub(pg);
  }

  // ---- the Overview's tile -------------------------------------------------------------------------------------------
  function ovTile(pg) {
    const ov = pg.overview; if (!ov) return '';
    const bar = ov.bar && hasAttr(ov.bar, 'category') && ready() && SD() ? (() => { const sc = shareCounts(ov.bar), lead = sc.list.find(x => x.v === (ov.lead || sc.list[0]?.v)); return sharesHtml({ attribute: ov.bar }, true) + (lead ? `<p class="ix-head"><b>${int(lead.n)}</b> ${esc(marksWord(lead.n))} (${pcS(lead.n, sc.total)}) ${esc(vlabel(ov.bar, lead.v).toLowerCase())}</p>` : ''); })() : '';
    let grp = null;
    const forest = ov.rows.length ? (() => { const rows = rowsFor(ov.rows, 'mantel_haenszel'), groups = []; rows.forEach(x => { if (x.group !== grp) { grp = x.group; groups.push([x.group, []]); } groups[groups.length - 1][1].push(x.ref); }); return groups.map(([g, refs]) => (g ? `<p class="ix-tg">${esc(g)}</p>` : '') + miniForest(refs, 'mantel_haenszel', ov.rows)).join(''); })() : '';
    return `<article class="tile ix-tile" data-ix-tile="${esc(K.link(pg.id, 'overview'))}" tabindex="0"><header><h3>${esc(ov.title || pg.tab)}</h3><span class="chev" aria-hidden="true">›</span></header>${bar}${forest}<p class="tfoot"><a href="${esc(K.link(pg.id))}">Explore ${esc(pg.tab.toLowerCase())} →</a></p></article>`;
  }
  (K.ovTiles ||= []).push(...PAGES.filter(pg => pg.overview).map(pg => ({ section: pg.overview.section, html: () => ovTile(pg) })));

  // ---- figures and tables for the downloads -------------------------------------------------------------------------
  function findBlock(key) {
    const [pid, sid, bi] = key.split('.'), pg = PAGES.find(p => p.id === pid);
    if (!pg) return null;
    if (sid === 'overview') return { pg, sec: { id: 'overview', title: pg.overview.title || pg.tab }, b: { kind: 'forest', rows: pg.overview.rows }, bi };
    const sec = pg.sections.find(s => s.id === sid); return sec ? { pg, sec, b: sec.blocks[+bi], bi } : null;
  }
  function figureOf(x) {
    const { pg, sec, b, bi } = x, m = st(bkey(pg, sec, bi), { m: b.method || 'mantel_haenszel' }).m;
    const body = b.kind === 'forest' ? forestBody(b, m, true) : b.kind === 'lines' ? linesBody(b, m, true) : b.kind === 'shares' ? sharesBody(b, true) : b.kind === 'matrix' ? matrixBody(b, m, true) : b.kind === 'bars' ? barsBody(b, true) : b.kind === 'histogram' ? histBody(b, true) : null;
    if (b.kind === 'example') return K.map.figure({ p: (P => ({ i: byAcc[EX.acc], acc: P[0], gene: P[1], name: P[2], len: P[3], marks: P[4], cand: P[5] }))(D.proteins[byAcc[EX.acc]]), rec: EX.rec, selected: selOn() ? K.sel.selectedPositions(EX.acc) : null });
    const what = `${sec.question || ''} ${selOn() ? `Your selection: ${K.sel.describe()} (${K.sel.nMarks()} ${W.marks}), tested again in the browser.` : ''}`.trim();
    return K.figureFrame({ title: b.title || sec.title, sub: what, body: `<g transform="translate(20,0)">${body.body}</g>`, bodyH: body.H, W: 800, extra: { page: pg.id, section: sec.id } });
  }
  function tsvOf(x) {
    const { pg, sec, b, bi } = x, m = st(bkey(pg, sec, bi), { m: b.method || 'mantel_haenszel' }).m;
    const body = b.kind === 'forest' ? forestTsv(b, m) : b.kind === 'lines' ? linesTsv(b, m) : b.kind === 'sets' ? setsTsv(b) : b.kind === 'shares' ? sharesTsv(b) : b.kind === 'combinations' ? combinationsTsv(b) : b.kind === 'matrix' ? matrixTsv(b, m) : b.kind === 'table' ? tableTsv(b) : b.kind === 'bars' ? barsTsv(b) : b.kind === 'pairs' ? pairsTsv(b) : b.kind === 'histogram' ? histTsv(b) : '';
    const src = b.table ? ` From ${D.inputs?.[(D.run.inputs && Object.keys(D.run.inputs).find(k => k === b.table)) || ''] ? '' : 'the site’s table ' + b.table}.` : '';
    return K.preamble(`${pg.tab}: ${b.title || sec.title}`, `${sec.question || sec.title}${src}${b.kind === 'forest' || b.kind === 'lines' ? ` ${METHOD[m]}.` : ''}`) + body;
  }
  const fileName = x => `${D.site.id}_${x.pg.id}_${x.sec.id}${x.bi && x.bi !== '0' ? '_' + x.bi : ''}${selOn() ? '_selection' : ''}`;

  // ---- the Method page: the page's own section ---------------------------------------------------------------------
  PAGES.forEach(pg => (K.methods ||= []).push({ id: `page-${pg.id}`, title: pg.tab, html: () => `<section id="m-q-page-${esc(pg.id)}" class="qm"><h3>${esc(pg.tab)}</h3><p class="qm-q">${esc(pg.title)}</p>${pg.method ? pg.method.split(/\n\s*\n/).map(p => `<p>${esc(p)}</p>`).join('') : ''}` +
    `<p><b>Its sections:</b> ${pg.sections.map(s => `<a href="${esc(K.link(pg.id, s.id))}">${esc(s.title)}</a>`).join(', ')}.</p>` +
    (Object.keys(TB).length ? `<p><b>Its tables</b> (the site file’s website.tables, in the formats of CONTRACTS.md):</p><ul class="qm-reads">${Object.entries(TB).map(([n, t]) => `<li><span class="mono">${esc(n)}</span>: ${int(t.n)} rows, keyed by ${esc(t.key)}; ${esc(t.columns.map(c => c.label).join(', '))}</li>`).join('')}</ul>` : '') + '</section>' }));

  // ---- registration ------------------------------------------------------------------------------------------------
  PAGES.forEach(pg => {
    K.views[pg.id] = { render: arg => view(pg, arg), title: arg => (arg && pg.sections.find(s => s.id === arg)?.title) || pg.tab, after: () => drawExample() };
    K.tabs.push(() => [pg.id, pg.tab, selOn() ? 'selection' : null]);
    K.sections[pg.id] = () => [['view', pg.tab, 1, K.link(pg.id)], ...(pg.overview ? [['ixov', pg.overview.title || 'At a glance', 1, K.link(pg.id, 'overview')]] : []),
      ...pg.groups.flatMap(g => [[`ixg-${g.name}`, g.name, 0], ...g.sections.map(s => [`ix-${s.id}`, s.title, 1, K.link(pg.id, s.id)])])];
  });
  K.tips.push(['[data-ixr]', el => {
    let x; try { x = JSON.parse(el.dataset.ixr); } catch (e) { return ''; }
    const [aid, cat, m] = x, site = rowOf(aid, cat, m), mine = selOn() && testable() && SD() ? (K.sel.rows(aid, m) || []).find(r => r.category === cat) : null;
    const one = (r, who) => (r ? `<br><b>${who}</b>: ${int(r.a)} of ${int(r.a + r.b)} ${esc(W.marks)} (${pcS(r.a, r.a + r.b)}) vs ${int(r.c)} of ${int(r.c + r.d)} other ${esc(W.residues)} (${pcS(r.c, r.c + r.d)}); OR ${fxn(effOf(r))}${r.lo != null ? ` (95% CI ${fxn(r.lo)}–${fxn(r.hi)})` : ''}, q ${fq(r.q)}${r.strata != null ? `, ${int(r.strata)} informative proteins` : ''}` : '');
    return `<b>${esc((site || mine)?.label || cat)}</b> <span class="muted">${esc(A[aid]?.title || aid)} · ${esc(METHOD[m] || m)}</span>${(A[aid]?.help || {})[cat] ? `<br><span class="muted">${esc(A[aid].help[cat])}</span>` : ''}${selOn() ? one(mine, 'Your selection') : ''}${one(site, selOn() ? 'Whole dataset' : '')}${site?.background ? `<br><span class="muted">Against: ${esc(site.background)}</span>` : ''}`;
  }]);
  const keyOfEl = el => el.closest('[data-ixexp]')?.dataset.ixexp;
  K.clicks.push(
    ['[data-ix-tile]', (el, e) => { if (e.target.closest('a,button,[data-f]')) return; location.hash = el.dataset.ixTile; }],
    ['[data-ix-m]', el => { st(el.dataset.ixM, {}).m = el.dataset.v; K.render(); }],
    ['[data-ix-all]', el => { const s = st(el.dataset.ixAll, {}); s.all = !s.all; K.render(); }],
    ['[data-ix-chip]', el => { const s = st(el.dataset.ixChip, {}); s.chip = el.dataset.v || ''; s.n = 25; K.render(); }],
    ['[data-ix-more]', el => { const s = st(el.dataset.ixMore, {}); s.n = (s.n || 25) + 100; K.render(); }],
    ['[data-ix-sort]', el => { const s = st(el.dataset.ixSort, {}); s.desc = s.sort === el.dataset.v ? !s.desc : true; s.sort = el.dataset.v; K.render(); }],
    ['[data-ix-q]', el => { S.q = el.dataset.ixQ; K.writeHash(true); K.render(); scrollTo(0, 0); }],
    ['[data-ix-print]', () => print()],
    ['[data-ixexp]', el => { const x = findBlock(keyOfEl(el)); if (!x) return; const k = el.dataset.k; K.exportFigure(k, () => figureOf(x), fileName(x), el, () => tsvOf(x)); }],
  );
  document.addEventListener('submit', e => {
    const f = e.target.closest?.('[data-ix-check],[data-ix-ex]'); if (!f) return; e.preventDefault();
    const v = new FormData(f).get('q') || '';
    if (f.dataset.ixCheck) { st(f.dataset.ixCheck, {}).q = String(v).trim(); K.render(); return; }
    const q = K.sel?.parse(String(v)), pi = q && (q.genes[0] ?? q.sites[0]?.[0]);
    if (pi != null) { st(f.dataset.ixEx, {}).acc = prot(pi)[0]; K.render(); }
  });
  let tq;
  document.addEventListener('input', e => { const k = e.target.dataset?.ixTq; if (k == null) return; clearTimeout(tq); tq = setTimeout(() => { const s = st(k, {}); s.q = e.target.value.trim(); s.n = 25; K.render(); const el = document.querySelector(`[data-ix-tq="${CSS.escape(k)}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 200); });
  document.addEventListener('keydown', e => { const t = e.target.closest?.('[data-ix-tile], [data-ix-sort], .ixf-row[data-f]'); if (t && (e.key === 'Enter' || (e.key === ' ' && !t.matches('[data-ix-tile]')))) { e.preventDefault(); t.click(); } });

  // ---- its look ----------------------------------------------------------------------------------------------------
  const style = document.createElement('style');
  style.id = 'kit-interactions-css';
  style.textContent = `
.ix-sec .ix-block { display: grid; gap: 0.5rem; min-width: 0; padding-top: 0.4rem; }
.ix-sec .ix-block + .ix-block { border-top: 1px solid var(--line); margin-top: 0.6rem; padding-top: 0.9rem; }
.ix-block h4 { font-size: 0.95rem; }
.ix-tools { display: flex; justify-content: flex-end; }
.ixf { display: grid; font-size: 0.86rem; overflow-x: auto; }
.ixf-row { display: grid; grid-template-columns: minmax(10rem, 1.2fr) minmax(8rem, 1.4fr) 8rem 9.5rem 9.5rem 4rem 5rem; gap: 0.6rem; align-items: center; min-height: 1.7rem; padding: 0 0.2rem; }
.ixf-row .whisker { stroke-width: 1.6; stroke-linecap: round; } .ixf-row .dot { stroke-width: 1.5; }
.ixf-row .more { fill: var(--more); stroke: var(--more); } .ixf-row .less { fill: var(--less); stroke: var(--less); }
.ixf-row .same { fill: var(--same); stroke: var(--same); } .ixf-row .ns { fill: var(--surface); stroke: var(--muted); }
.ixf-head > span { white-space: normal; line-height: 1.2; }
.ix-sets th { white-space: normal; } .ix-sets td.wrapok { min-width: 10rem; }
.ixf-row[data-f] { cursor: pointer; } .ixf-row[data-f]:hover { background: var(--wash); border-radius: 4px; }
.ixf-row svg { width: 100%; height: 1.5rem; overflow: visible; }
.ixf-row line.grid { stroke: var(--line-strong); stroke-dasharray: 2 3; } .ixf-row line.one { stroke: var(--ink-2); }
.ixf-row line.ixf-whole, .trow line.ixf-whole { stroke: var(--muted); stroke-width: 2.4; opacity: 0.55; }
.ixf-head { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; border-bottom: 1px solid var(--line); }
.ixf-axis svg { height: 1rem; } .ixf-axis text { font-size: 10px; fill: var(--muted); }
.ixf-group { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 0.6rem 0 0.1rem; }
.ixf-or { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; } .ixf-or.more { color: var(--more); } .ixf-or.less { color: var(--less); } .ixf-or.ns, .ixf-or.same { color: var(--muted); }
.ixf-n, .ixf-q { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.ix-plot svg { width: 100%; height: auto; display: block; } .ix-plot text { font-family: var(--font-body); }
.ix-mini { max-height: 9rem; overflow: hidden; }
.ix-stack { display: flex; height: 1.1rem; border-radius: 4px; overflow: hidden; background: var(--surface-2); }
.ix-stack span { display: block; height: 100%; cursor: pointer; } .ix-stack span:hover { filter: brightness(1.1); }
.ix-key { display: flex; flex-wrap: wrap; gap: 0.2rem 0.8rem; font-size: 0.82rem; }
.ix-keyi { border: 0; background: none; padding: 0; cursor: pointer; color: var(--ink-2); display: inline-flex; align-items: center; gap: 0.3rem; }
.ix-keyi i { width: 0.7rem; height: 0.7rem; border-radius: 2px; display: inline-block; }
.ix-head, .ix-big { margin: 0.3rem 0 0; } .ix-big b { font-size: 1.9rem; font-family: var(--font-heading); color: var(--brand-ink); } .ix-big span { color: var(--muted); font-size: 0.86rem; }
.ix-tg { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 0.5rem 0 0; }
.ix-meter { position: relative; display: inline-block; width: 5.5rem; height: 0.6rem; background: var(--surface-2); border-radius: 3px; vertical-align: middle; }
.ix-meter i { position: absolute; inset: 0 auto 0 0; background: var(--band-1); border-radius: 3px; } .ix-meter b { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink); }
.ix-mrow2 { display: grid; grid-template-columns: minmax(0, 1fr) 7rem auto; gap: 0.5rem; align-items: center; font-size: 0.84rem; }
.ix-hold { white-space: nowrap; } .ix-hold.holds { color: var(--more); } .ix-hold.lost { color: var(--muted); }
.ix-upset th.ix-vh, .ix-matrix th.ix-vh { height: 9rem; vertical-align: bottom; white-space: nowrap; padding: 0.3rem 0.2rem; }
.ix-vh span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 0.74rem; max-height: 8.5rem; overflow: hidden; text-overflow: ellipsis; }
.ix-upset td { text-align: center; padding: 0.2rem 0.3rem; } .ix-dotc i { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; }
.ix-on { background: var(--ink); } .ix-off { background: var(--line); }
.ix-cnt { border: 0; background: none; cursor: pointer; font: inherit; font-variant-numeric: tabular-nums; color: var(--accent); padding: 0; position: relative; }
.ix-barc { min-width: 7rem; text-align: left !important; } .ix-barc .ix-cnt { display: block; width: 100%; text-align: left; color: var(--ink); }
.ix-hbar { position: absolute; left: 3rem; top: 0.25rem; bottom: 0.25rem; max-width: calc(100% - 3rem); background: color-mix(in srgb, var(--band-1) 55%, transparent); border-radius: 2px; }
.ix-matrix td.ix-mc { text-align: center; padding: 0.2rem 0.3rem; position: relative; }
.ix-matrix td.ix-mc::before { content: ''; position: absolute; inset: 1px; background: var(--ixc); opacity: var(--a); border-radius: 2px; z-index: 0; }
.ix-matrix td.ix-mc > * { position: relative; z-index: 1; }
.ix-matrix td.ix-mc b { display: block; font-size: 0.78rem; } .ix-matrix td.ix-mc small { font-size: 0.68rem; color: var(--muted); }
.ix-matrix td.ix-mc b.more, .ix-matrix td.ix-mc b.less { color: var(--ink); }
.ix-matrix td.ix-hi { outline: 2px solid var(--accent); outline-offset: -2px; }
.ix-matrix th.ix-mrow { cursor: pointer; font-weight: 500; } .ix-mg td { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); background: var(--surface-2); }
.ix-pairs td[data-ix-q] { cursor: pointer; }
.ix-check { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; } .ix-check input { flex: 1 1 14rem; max-width: 22rem; padding: 0.35rem 0.6rem; border: 1px solid var(--line-strong); border-radius: 0.5rem; background: var(--surface); }
.ix-card { border: 1px solid var(--line); border-radius: 0.6rem; padding: 0.5rem 0.8rem; margin-top: 0.5rem; }
.ix-dl { display: grid; grid-template-columns: minmax(8rem, max-content) 1fr; gap: 0.2rem 0.8rem; margin: 0.3rem 0; font-size: 0.86rem; } .ix-dl dt { color: var(--muted); } .ix-dl dd { margin: 0; }
.ix-tag { display: inline-block; border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 0.45rem; font-size: 0.74rem; color: var(--ink-2); margin: 0.05rem 0; }
.ix-tctl { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; } .ix-tctl input { padding: 0.3rem 0.6rem; border: 1px solid var(--line-strong); border-radius: 0.5rem; background: var(--surface); min-width: 14rem; }
.ix-tbl td { vertical-align: top; } .ix-seq { white-space: nowrap; } .ix-seq .ix-c, b.ix-c { color: var(--accent); }
.ix-fold { border: 1px solid var(--line); border-radius: 0.6rem; padding: 0.4rem 0.7rem; margin: 0.3rem 0; min-width: 0; }
.ix-sec, .ix-block > *, .ix-fold > * { min-width: 0; max-width: 100%; } .ix-tbl td.wrapok { min-width: 8rem; max-width: 26rem; white-space: normal; overflow-wrap: anywhere; } .ix-fold > summary { cursor: pointer; }
.ix-bars { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(19rem, 100%), 1fr)); gap: 0.8rem 1.4rem; }
.ix-barg h4 { font-size: 0.86rem; margin-bottom: 0.3rem; }
.ix-barrow { display: grid; grid-template-columns: minmax(6rem, 10rem) 1fr 2.5rem; gap: 0.4rem; align-items: center; width: 100%; border: 0; background: none; padding: 0.1rem 0; font-size: 0.82rem; cursor: pointer; text-align: left; color: var(--ink); }
.ix-barrow:hover { background: var(--wash); } .ix-barrow b { text-align: right; font-variant-numeric: tabular-nums; }
.ix-bar { height: 0.7rem; background: var(--surface-2); border-radius: 2px; } .ix-bar i { display: block; height: 100%; background: var(--less); border-radius: 2px; }
.ix-answer { font-size: 1.05rem; max-width: 62rem; margin: 0.9rem 0 0.6rem; }
.ix-hls { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(11rem, 100%), 1fr)); gap: 0.8rem; margin: 0.4rem 0 0.8rem; }
.ix-hl { display: flex; flex-direction: column; gap: 0.2rem; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-card); box-shadow: var(--shadow); padding: 0.8rem 0.9rem; text-decoration: none; color: var(--ink); }
.ix-hl:hover { box-shadow: var(--shadow-hover); color: var(--ink); } .ix-hl b { font-size: 1.8rem; font-family: var(--font-heading); line-height: 1.1; color: var(--brand-ink); }
.ix-hl.more b { color: var(--more); } .ix-hl.less b { color: var(--less); } .ix-hl span { font-weight: 600; font-size: 0.9rem; } .ix-hl small { color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.68rem; margin-top: auto; padding-top: 0.4rem; }
.ix-glyph { width: 1.8rem; height: 1.3rem; color: var(--brand-ink); }
.ix-links { margin: 0.2rem 0; }
.ix-findings li { margin: 0.25rem 0; }
.ix-tile .tfoot a { font-weight: 600; }
@media (max-width: 760px) { .ixf-row { grid-template-columns: minmax(8rem, 1fr) minmax(6rem, 1fr) 6.5rem; } .ixf-row > :nth-child(n+4) { display: none; } }
@media print { .ix-tools, .exp, .ix-check, .ix-tctl { display: none !important; } }
`;
  document.head.appendChild(style);
});
