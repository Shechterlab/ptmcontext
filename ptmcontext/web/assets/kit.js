/* The site kit's behaviour: the same for every site. A site differs only in its data (written by ptmc web from the
   site's run) and its look (variables set from the site file). Views: Overview (a scorecard: each row a question, its
   figure at a glance and its answer; a row opens its full figure, every class and the downloads), Statistics (every
   test, sortable, downloadable), Method (how the tests work, the data and their checksums, the parity check, how to
   cite). The view, the search, the open rows and the choices live in the URL hash, so Back and links work. */
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('site-data').textContent);
  const W = D.words;
  const $ = s => document.querySelector(s);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const int = n => n == null ? '–' : Number(n).toLocaleString('en-US');
  // effect sizes as the Methylarginine Site Explorer prints them: 19, 2.1, 1.19, 0.48
  const fxn = v => v == null ? '–' : v >= 1000 ? '> 1,000' : v >= 10 ? v.toFixed(0) : v >= 1.2 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : '< 0.01';
  const fx = v => v == null ? '–' : fxn(v) + '×';
  const pct = (k, n) => n ? (100 * k / n).toFixed(1) + '%' : '–';
  const cap = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const hdate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : String(iso || ''); };
  const htime = iso => { const m = /T(\d{2}):(\d{2})/.exec(String(iso || '')); return hdate(iso) + (m ? ` at ${m[1]}:${m[2]} UTC` : ''); };
  // SPDX to the usual form: CC-BY-NC-SA-4.0 -> CC BY-NC-SA 4.0
  const hlicence = l => /^CC-/.test(l || '') ? String(l).replace(/^CC-/, 'CC ').replace(/-(\d[\d.]*)$/, ' $1') : (l || '');
  const fq = q => q == null ? '–' : q === 0 ? '< 1e-300' : q < 1e-3 ? q.toExponential(1) : q.toFixed(3);
  const PADJ = 0.05, MIN_EFFECT = 1.1;
  const dir = r => r.eff == null || r.q == null || r.q > PADJ ? 'ns' : r.eff >= MIN_EFFECT ? 'more' : r.eff <= 1 / MIN_EFFECT ? 'less' : 'same';
  const DIR_WORDS = { more: 'more often', less: 'less often', same: 'about the same (within 1.1×)', ns: 'no difference (q > 0.05)' };
  const METHOD = { mantel_haenszel: 'within each protein', fisher: 'pooled', study: 'within studies' };
  const METHOD_PHRASE = { mantel_haenszel: 'compared within each protein (Mantel–Haenszel)', fisher: 'pooled (Fisher’s exact test)',
    study: 'compared within the marks reported by the same sources (Mantel–Haenszel)' };
  const A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
  // the marks' attributes as questions, for comparing marks with marks (id '@<name>'); never tested against other
  // residues, so not among the site's analyses. Those the site file marks provenance say how the marks were found.
  const ATTRQ = Object.entries(D.attribute_specs || {}).filter(([, s]) => ['category', 'list', 'number'].includes(s.kind)).map(([n, s]) => ({
    id: '@' + n, kind: 'attribute', attribute: n, provenance: !!s.provenance, title: s.label || n, roles: [], describe: s.help || '',
    labels: s.kind === 'number' ? { 2: '2 or more', 3: '3 or more', 5: '5 or more' } : { ...(s.values || {}) }, help: {},
    sub: s.help || '', question: '', section: s.provenance ? 'How they were found' : 'About the sites' }));
  ATTRQ.forEach(a => { A[a.id] = a; });
  const label = r => (A[r.analysis]?.labels || {})[r.category] || r.category.replace(/_/g, ' ');
  const SETS = a => A[a]?.kind === 'protein_sets';
  // what a protein-set question counts: proteins, or another identifier of theirs (genes), as the site file says
  const setUnit = a => A[a]?.unit || 'proteins';
  const markedUnits = a => (A[a]?.unit ? `${A[a].unit} of ${W.marked} proteins` : `${W.marked} proteins`);
  // a row of a test, ready to draw: its effect, labels and reading (the site's own rows, and a selection's)
  const decorate = rows => { rows.forEach(r => { r.eff = r.or ?? r.fold; r.label = label(r); r.help = (A[r.analysis]?.help || {})[r.category] || ''; r.dir = dir(r); r.title = A[r.analysis]?.title || r.analysis; }); return rows; };
  // the rows, read from the statistics table the page carries once (its text serves the downloads): numbers as the
  // run wrote them, an infinite odds ratio (every set member marked) as 1e300, which prints as '> 1,000'
  if (!D.rows) {
    const [head, ...lines] = D.statistics_tsv.replace(/\n$/, '').split('\n'), col = Object.fromEntries(head.split('\t').map((c, k) => [c, k]));
    const num = v => (v === '' || v === 'nan' ? null : v === 'inf' ? 1e300 : v === '-inf' ? 0 : Number(v));
    D.rows = lines.map(l => { const x = l.split('\t'), g = c => x[col[c]];
      return { analysis: g('analysis'), category: g('category'), method: g('method'), a: +g('a'), b: +g('b'), c: +g('c'), d: +g('d'), or: num(g('odds_ratio')), fold: num(g('fold_enrichment')),
        lo: num(g('odds_ratio_ci_low')), hi: num(g('odds_ratio_ci_high')), p: num(g('p')), q: num(g('q')), strata: g('n_strata') ? +g('n_strata') : null }; });
  }
  D.rows.forEach((r, i) => { r.i = i; });
  decorate(D.rows);
  // a protein-set test's repeat within abundance deciles, beside its own row
  const STRAT = {};
  D.rows.forEach(r => { if (SETS(r.analysis) && r.method === 'mantel_haenszel') STRAT[r.analysis + '\u0000' + r.category] = r; });
  // does a protein set's enrichment (or depletion) hold within abundance deciles? 'holds' (the same reading there),
  // 'weaker' (the same direction by 1.1× or more, but not at q ≤ 0.05: underpowered, not contradicted), 'lost' (under
  // 1.1× or the other way), or null when there is nothing to say
  const holdStatus = r => {
    if (!SETS(r.analysis) || r.selection || (r.dir !== 'more' && r.dir !== 'less')) return null;
    const st = STRAT[r.analysis + '\u0000' + r.category]; if (!st) return null;
    if (st.dir === r.dir) return 'holds';
    const same = st.eff != null && (r.dir === 'more' ? st.eff >= MIN_EFFECT : st.eff <= 1 / MIN_EFFECT);
    return same ? 'weaker' : 'lost';
  };
  const holds = r => { const h = holdStatus(r); return h == null ? null : h === 'holds'; };
  const testName = (aid, m) => SETS(aid) ? (m === 'enricher' ? 'proteins, hypergeometric' : 'within abundance deciles') : (METHOD[m] || m);
  const methodName = r => testName(r.analysis, r.method);
  const effText = r => r.eff == null ? '–' : r.method === 'enricher' ? fxn(r.eff) + '-fold' : 'OR ' + fxn(r.eff);
  const rowsFor = (a, m) => D.rows.filter(r => r.analysis === a.id && (a.kind === 'protein_sets' ? r.method === 'enricher' : r.method === m) && r.eff != null);

  // ---- state in the hash ---------------------------------------------------------------------------------------------
  const S = { view: 'overview', arg: '', q: '', sq: '', m: 'mantel_haenszel', a: '', vs: 'residues', cmp: '', sort: 'q', desc: false, nStat: 200, open: new Set(), all: new Set(), how: false };
  // modules (kit-*.js) register views, tabs, click handlers, tooltips and search hints here; the core starts them last
  const K = window.PTMC = { D, W, A, S, esc, int, fx, fxn, fq, pct, cap, decorate, views: {}, tabs: [], clicks: [], tips: [], scopeHints: [], sections: {}, routes: {},
    // a module's own question (kit-cell.js) or its own drawing of one (kit-values.js): id -> { tile(card), page(card,
    // body) }, either returning null for the kit's own; and Method sections of its own ({ id, title, html })
    questions: {}, methods: [] };
  const BUILT_IN_VIEWS = ['overview', 'statistics', 'method'];
  // a question's title in running text, as the site file writes it (lower-casing would break PRMT, DNA, Reactome)
  const inText = t => String(t || '');
  function readHash() {
    const [path, qs] = location.hash.replace(/^#/, '').split('?');
    const p = new URLSearchParams(qs || '');
    const [view, ...rest] = (path || '').split('/');
    S.view = BUILT_IN_VIEWS.includes(view) || K.views[view] ? view : 'overview';
    try { S.arg = S.view === view ? decodeURIComponent(rest.join('/')) : ''; } catch (e) { S.arg = ''; }
    // a view with a readable path (a protein's gene before its accession) reads it, and an older form is rewritten
    let routed = false;
    if (K.routes[S.view] && S.arg) { const a = K.routes[S.view].arg(S.arg); routed = siteless(K.routes[S.view].path(a)) !== siteless(S.arg); S.arg = a; }
    // the original explorer's links: #ACC and #ACC/R216 open the protein; ?q= before the hash is the search
    // (and #FUS, #FUS/R216, #TDP-43, #P35637/p-na: any old hash that names a protein, read by the protein page's route,
    // with its site as the page numbers it; an upper-case name no protein with marks has, a protein without marks)
    const named = S.view === 'overview' && view && !BUILT_IN_VIEWS.includes(view) && !K.views[view] && K.views.protein && K.routes.protein &&
      (K.routes.protein.claims?.(path) || /^[A-Z][A-Z0-9.-]{1,19}$/.test(view));
    if (named) { S.view = 'protein'; S.arg = K.routes.protein.arg(path); }
    // its pages: #about and #docs are Method here; #overview/ov-<question> is the question
    else if (S.view === 'overview' && /^(about|docs)$/.test(view)) { S.view = 'method'; S.arg = ''; }
    // an older site's anchors (website.legacy_links): a question, or the Overview with parameters (?vs=marks)
    const old = S.view === 'overview' && (D.legacy_links || {})[S.arg];
    if (old && old[0] === '?') { S.arg = ''; new URLSearchParams(old.slice(1)).forEach((v, k) => p.set(k, v)); } else if (old) S.arg = old;
    const ov = !!old || (S.view === 'overview' && /^ov-/.test(S.arg));
    if (ov && !old) S.arg = S.arg.slice(3);
    S.legacy = ov || routed || (S.view !== view && !!view);     // written back as this site's own link (replaceState)
    if (S.view === 'overview' && S.arg && !A[S.arg]) S.arg = '';
    S.q = p.get('q') || ''; S.m = p.get('m') || 'mantel_haenszel'; S.a = p.get('a') || ''; S.sq = p.get('sq') || '';
    // what a selection is compared with: other residues (the site's own tests), other marks, or another selection
    S.vs = ['marks', 'cmp'].includes(p.get('vs')) ? p.get('vs') : 'residues'; S.cmp = p.get('cmp') || '';
    if (view === 'apart') { S.view = 'overview'; S.arg = ''; S.vs = 'marks'; S.legacy = true; }
    if (view === 'compare' && rest.length && rest[0]) { S.view = 'overview'; S.arg = ''; S.vs = 'cmp'; S.cmp = decodeURIComponent(rest.join('/')); S.legacy = true; }
    if (S.vs === 'cmp' && !S.cmp) S.vs = 'marks';
    if (S.m === 'study' && S.vs === 'residues') S.m = 'mantel_haenszel';
    K.sel?.decode(p.get('f'));
    S.sort = p.get('sort') || 'q'; S.desc = p.get('dir') ? p.get('dir') === 'desc' : S.sort !== 'q';
    S.open = new Set((p.get('open') || '').split(',').filter(k => A[k]));
  }
  // a view's argument as it appears in the address: the module's readable path (K.routes), each part encoded
  const pathOf = (view, arg) => (K.routes[view] ? K.routes[view].path(arg) : arg).split('/').map(encodeURIComponent).join('/');
  // a path without the residue letter of a site (R216 and 216 are the same site)
  const siteless = x => String(x).split('/').map(t => t.replace(/^[A-Za-z](\d+)$/, '$1')).join('/');
  // the selection's part of a link: search, filters, the test shown and the baseline
  function selParams() {
    const p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    const f = K.sel?.encode(); if (f) p.set('f', f);
    if (S.m !== 'mantel_haenszel') p.set('m', S.m);
    if (S.vs !== 'residues') { p.set('vs', S.vs); if (S.vs === 'cmp') p.set('cmp', S.cmp); }
    return p;
  }
  // every link inside the site carries the selection, so it follows the reader from page to page; a link that names
  // a selection of its own (a saved one) keeps it, and a link's own parameters win
  function carry(href) {
    const [path, qs] = String(href).replace(/^#/, '').split('?'), own = new URLSearchParams(qs || '');
    if (own.has('q') || own.has('f')) return '#' + path + (qs ? '?' + qs : '');
    const p = selParams(); own.forEach((v, k) => p.set(k, v));
    return '#' + path + (p.toString() ? '?' + p : '');
  }
  const link = (view, arg, extra) => carry('#' + view + (arg ? '/' + pathOf(view, arg) : '') + (extra ? '?' + new URLSearchParams(extra) : ''));
  let shown = null;                   // the address the page is drawn for (onNav skips a change to it)
  function writeHash(push) {
    const p = selParams();
    if (S.view === 'statistics') { if (S.a) p.set('a', S.a); if (S.sq) p.set('sq', S.sq); if (S.sort !== 'q') p.set('sort', S.sort); if (S.desc !== (S.sort !== 'q')) p.set('dir', S.desc ? 'desc' : 'asc'); }

    const h = '#' + S.view + (S.arg ? '/' + pathOf(S.view, S.arg) : '') + (p.toString() ? '?' + p : '');
    if (h !== location.hash) (push ? history.pushState : history.replaceState).call(history, null, '', h);
    shown = location.hash;            // the page shows this address: Back to an earlier one draws that one again
  }
  const go = (view, extra = {}) => { Object.assign(S, { view, arg: '' }, extra); writeHash(true); render(); scrollTo(0, 0); };
  // a protein's own facts (the site file's proteins.attributes): by accession, a number for a number attribute
  const PI = Object.fromEntries((D.proteins || []).map((p, i) => [p[0], i]));
  const proteinAttr = (acc, name) => { const v = D.protein_attributes?.values?.[name]; return v && PI[acc] != null ? v[PI[acc]] : null; };
  // smooth scrolling only for readers whose system does not ask for reduced motion
  K.smooth = () => (matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  Object.assign(K, { proteinAttr, go, writeHash, link, carry, render: () => render(), holds, holdStatus, effText, SETS, rowsFor, strat: (aid, cat) => STRAT[aid + '\u0000' + cat] });
  // a link written without the selection (the header's, the footer's, a module's) gets it when followed or copied
  const carryLink = e => { const a = e.target.closest?.('a[href^="#"]'); if (!a || 'jump' in a.dataset) return; const base = a.dataset.base ?? a.getAttribute('href'); a.dataset.base = base; a.setAttribute('href', carry(base)); };
  ['click', 'auxclick', 'pointerdown', 'contextmenu'].forEach(t => document.addEventListener(t, carryLink, true));

  // ---- the statistics page's own filter (the search box above every page makes the selection) -----------------------
  const tokens = () => S.sq.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const hay = r => `${r.analysis} ${r.title} ${r.category} ${r.label}`.toLowerCase();
  const rowHit = r => !tokens().length || tokens().every(t => hay(r).includes(t));

  // ---- header and toolbar --------------------------------------------------------------------------------------------
  function hero() {
    const ALL = {
      marks: [int(D.counts.marks), W.marks, K.views.sites ? 'sites' : 'statistics'],
      proteins: [int(D.counts.proteins), 'proteins', K.views.proteins ? 'proteins' : 'statistics'],
      questions: [int(D.analyses.length), D.analyses.length === 1 ? 'question' : 'questions', 'overview'],
      tests: [int(D.rows.length), 'tests', 'statistics'],
    };
    const tiles = (D.stats || ['marks', 'proteins', 'questions', 'tests']).map(t => typeof t === 'string' ? ALL[t] : [int((D.attribute_counts || {})[t.attribute] ?? 0), t.label, t.opens && A[t.opens] ? 'overview/' + t.opens : 'method/sources']).filter(Boolean);
    $('#hero-stats').innerHTML = tiles.map(([b, s, v]) => `<button class="stat" type="button" data-go="${v}"><b>${b}</b><span>${esc(s)}</span></button>`).join('');
  }
  function scope() {
    const ex = (D.site.examples || []).map(e => `<button class="try-chip" type="button" data-try="${esc(e)}">${esc(e)}</button>`).join('');
    const site = (D.site.examples || []).find(e => /\s[A-Z]?\d+$/.test(e)), term = (D.site.examples || []).find(e => e.includes(':'));
    $('#q').placeholder = `Gene, accession, ${site ? `site (${site}), ` : ''}gene list${term ? `, or a filter such as ${term}` : ''}`;
    const bar = K.sel?.bar();
    $('#scope').classList.toggle('selected', !!bar);
    document.body.classList.toggle('has-selection', !!bar);
    $('#scope').innerHTML = bar || (`<span>All <b>${int(D.counts.marks)}</b> ${esc(W.marks)} on <b>${int(D.counts.proteins)}</b> proteins</span>` + (ex ? `<span class="scope-hint">Try</span>${ex}` : ''));
  }
  function tabs() {
    const sel = K.sel?.active();
    // K.tabsEnd: a module's page after Method (kit-help.js: Help)
    const t = [['overview', 'Overview', sel ? 'selection' : null], ...K.tabs.map(f => f()).filter(Boolean), ['statistics', 'Statistics', D.rows.length], ['method', 'Method', null], ...(K.tabsEnd || []).map(f => f()).filter(Boolean)];
    const on = v => S.view === v || (K.views[S.view]?.tab === v);
    $('#tabs').innerHTML = `<button class="tab rail-btn" type="button" data-rail-open="filters" title="Sections and filters">☰</button>` + t.map(([v, name, n]) => `<a class="tab" href="${esc(link(v))}"${on(v) ? ' aria-current="page"' : ''}>${name}` +
      (n != null ? ` <span class="count${n === 'selection' ? ' sel' : ''}"${n === 'selection' ? ' title="Every question here is tested again on your selection"' : ''}>${typeof n === 'number' ? int(n) : esc(n)}</span>` : '') + '</a>').join('') + variantSwitch();
  }
  // the site's variants (the same questions on other marks, such as with lower-confidence sites): a switch to each,
  // and in a variant the switch back; the page, its selection and its place are kept
  function variantSwitch() {
    const sw = (on, href, label, help) => `<label class="vswitch" title="${esc(help || '')}"><input type="checkbox" data-variant-href="${esc(href)}"${on ? ' checked' : ''}> ${esc(label)}</label>`;
    return D.variant ? sw(true, D.variant.base, D.variant.label, D.variant.description) : (D.variants || []).map(v => sw(false, v.href, v.label, v.description)).join('');
  }

  // ---- Overview: tiles. Each tile is a question with its most telling classes, and opens the question's figure ------
  const am = d => `<span class="am ${d}" aria-hidden="true">${d === 'more' ? '▲' : d === 'less' ? '▼' : '○'}</span>`;
  const SHOWN = 8;
  // the rows behind every dot on the page, for their hover (the site's own rows and a selection's alike)
  let REG = [];
  const reg = r => REG.push(r) - 1;

  // ---- a question's chart: one model, drawn on the page (rows of HTML, each with its SVG bar) and, the same, in its
  // exports (one SVG for PDF, SVG and PNG): every class in its order, under its group's heading; the counts behind
  // it; a bar from 1× on an axis fitted to the values, its 95% CI, and with a selection the whole dataset's value
  // as a tick; the value, and for a protein set the same test within abundance deciles; a legend and the axis's title
  // counts as the explorer prints them in a column: 3,069; 11.6K; 195K
  const kfmt = n => (n == null ? '–' : n < 1e4 ? int(n) : n < 1e6 ? +(n / 1e3).toFixed(n < 1e5 ? 1 : 0) + 'K' : +(n / 1e6).toFixed(1) + 'M');
  // ticks of a log axis: ratios and their reciprocals (2× and 0.5× as far from 1×), from the finest ladder that gives at
  // most `max` ticks; the axis runs from the tick at or below the smallest value to the one at or above the largest
  const LADDERS = [[1, [1, 1.25, 1.5]], [1, [1, 1.5]], [1, [1]], [2, [1]], [3, [1]], [4, [1]], [5, [1]]];
  const tickLab = v => (v >= 1 ? +v.toPrecision(3) : v >= 0.095 ? +v.toFixed(2) : +v.toPrecision(1)) + '×';
  function logAxis(vals, max = 7) {
    const l2 = vals.filter(v => v != null && v > 0 && Number.isFinite(v)).map(v => Math.min(10, Math.max(-10, Math.log2(v))));
    const lo = Math.min(0, ...l2), hi = Math.max(0, ...l2);
    let best = null;
    for (const [s, ms] of LADDERS) {
      const up = []; for (let k = 0; k * s <= 11; k++) ms.forEach(m => up.push(k * s + Math.log2(m)));
      const all = [...new Set([...up, ...up.map(p => -p)].map(p => +p.toFixed(6)))].sort((x, y) => x - y);
      const a = Math.max(...all.filter(p => p <= lo + 1e-9)), b = Math.min(...all.filter(p => p >= hi - 1e-9));
      best = { a, b, t: all.filter(p => p >= a - 1e-9 && p <= b + 1e-9) };
      if (best.t.length <= max) break;
    }
    if (best.b - best.a < 1e-9) best = { a: -1, b: 1, t: [-1, 0, 1] };
    const { a, b } = best, z = best.t.indexOf(0);
    const X = v => (Math.min(Math.max(Math.log2(Math.max(v, 1e-300)), a), b) - a) / (b - a);
    return { X, log: true, ticks: best.t.map((p, i) => ({ x: (p - a) / (b - a), lab: tickLab(2 ** p), minor: best.t.length > 5 && (i - z) % 2 !== 0 })) };
  }
  // a share axis, from 0 to the round share above the largest
  function shareAxis(rows) {
    const top = Math.max(0.05, ...rows.flatMap(r => [share1(r), share2(r)]));
    const s = [0.1, 0.25, 0.5, 1].find(v => v >= top) || 1;
    return { X: v => Math.min(v / s, 1), log: false, ticks: [0, 0.25, 0.5, 0.75, 1].map((f, i) => ({ x: f, lab: pcS(f * s), minor: i % 2 === 1 })) };
  }
  // a protein set's test again within abundance deciles: shown after its value where either test differs (as the
  // explorer marks it), never on a selection's rows (the deciles are the whole dataset's)
  const DECILE = { more: ['✓', 'more than expected'], same: ['≈', 'about the same (within 1.1×)'], ns: ['○', 'no difference'], less: ['▼', 'fewer than expected'] };
  const decile = r => {
    if (!SETS(r.analysis) || r.selection || r.vs) return null;
    const st = STRAT[r.analysis + '\u0000' + r.category];
    return st && ((r.q != null && r.q <= PADJ && r.eff > 1) || st.dir !== 'ns') ? st : null;
  };
  // with a selection tested again, each row keeps the whole dataset's row of its class: a tick, and a line in the hover
  function withRef(a, rows, m) {
    if (!selOn() || vsOn() || !rows) return rows;
    const whole = {}; D.rows.forEach(r => { if (r.analysis === a.id && r.method === (a.kind === 'protein_sets' ? 'enricher' : m) && r.eff != null) whole[r.category] = r; });
    rows.forEach(r => { r.ref = whole[r.category] || null; });
    return rows;
  }
  // a question's rows as its chart draws them: a question with ordered classes keeps their order (a layer's labels, or
  // the site file's), in its groups; any other puts the sets that differ first and sorts by effect, or by evidence
  // (order: q); catch-all classes ("No …") and classes without a test go last
  const TAIL = /^(no |not |unknown|unassigned)/i;
  function chartRows(a, m, card = cardOf(a.id)) {
    const rows = withRef(a, (vsOn() || selOn() ? rowsOf(a, m) || [] : D.rows.filter(r => r.analysis === a.id && r.method === (a.kind === 'protein_sets' ? 'enricher' : m))).slice(), m);
    const ORDER = { more: 0, same: 1, ns: 2, less: 3 }, sets = a.kind === 'protein_sets', groups = a.groups || [];
    const tail = r => (r.eff == null || TAIL.test(r.label) ? 1 : 0);
    const eff = (x, y) => (card.order === 'q' ? (x.q ?? 1) - (y.q ?? 1) : 0) || (y.eff ?? 0) - (x.eff ?? 0) || x.label.localeCompare(y.label);
    const own = Object.keys(a.labels || {}), at = r => { const i = own.indexOf(r.category); return i < 0 ? own.length : i; };
    const gi = r => { const i = groups.findIndex(g => g.classes.includes(r.category)); return i < 0 ? groups.length : i; };
    return rows.sort((x, y) => gi(x) - gi(y) || (a.ordered ? at(x) - at(y) || eff(x, y) : tail(x) - tail(y) || (sets && !x.vs ? ORDER[x.dir] - ORDER[y.dir] : 0) || eff(x, y)));
  }
  // the rows a question shows: every class, and of a protein-set question of more than 12 sets the first 8 until
  // "Show all"
  const shownOf = (a, rows) => (a.kind === 'protein_sets' && rows.length > 12 && !S.all.has(a.id) ? rows.slice(0, SHOWN) : rows);
  function chartModel(a, rows, m) {
    const sets = a.kind === 'protein_sets', vs = rows.some(r => r.vs), sel = rows.some(r => r.selection), groups = a.groups || [];
    // a group's heading before its first row; a row in no group after a grouped one gets a rule
    const headOf = r => (groups.find(g => g.classes.includes(r.category)) || {}).name || '';
    const items = []; let prev = null;
    rows.forEach(r => { const h = groups.length ? headOf(r) : null; if (h != null && h !== prev && (h || prev != null)) items.push({ head: h }); prev = h; items.push({ r }); });
    // the axis covers every value, whole-dataset value and CI, a CI at most 4× beyond the values
    let axis;
    if (vs) axis = shareAxis(rows);
    else {
      const e = rows.map(r => r.eff).filter(v => v != null && v > 0), eLo = Math.min(1, ...e) / 4, eHi = Math.max(1, ...e) * 4;
      axis = logAxis([...e, ...rows.map(r => r.ref?.eff), ...rows.flatMap(r => [r.lo, r.hi]).filter(v => v != null && v > 0).map(v => Math.min(Math.max(v, eLo), eHi))]);
    }
    const unit = sets ? setUnit(a.id) : W.residues, cls = sets ? 'set' : 'class';
    const cols = vs ? ['your selection', S.vs === 'cmp' ? 'the other selection' : `other ${sets ? markedUnits(a.id) : W.marks}`]
      : [sel ? `your selection’s ${sets ? setUnit(a.id) : W.marks}` : sets ? markedUnits(a.id) : W.marks, `other ${unit}`];
    const descr = rows.some(r => r.descriptive), has = d => rows.some(r => r.eff != null && r.dir === d);
    const legend = vs ? [['sel', `your selection (red: more often, slate: less often, q ≤ ${PADJ} and at least 1.1×)`], ['other', vsName()]]
      : [...(descr ? [] : [['more', `more often (q ≤ ${PADJ}, at least 1.1×)`], ...(!sets || has('less') ? [['less', `less often (q ≤ ${PADJ}, at least 1.1×)`]] : []), ...(has('same') ? [['same', `about the same: q ≤ ${PADJ} but within 1.1×`]] : [])]),
        ['ns', descr ? 'shown, not tested' : `no difference (q > ${PADJ})`],
        ...(rows.some(r => r.lo != null && r.hi != null) ? [['ci', '95% confidence interval']] : []),
        ...(rows.some(r => r.ref) ? [['ref', 'the whole dataset (bars: your selection)']] : []),
        ...(rows.some(decile) ? [['dec', 'within protein abundance deciles: ✓ more than expected · ≈ about the same · ○ no difference · ▼ fewer']] : []),
        ...(rows.some(r => r.eff == null) ? [['none', `— no test within proteins: no protein has ${W.residues} both in the class and outside it`]] : [])];
    const axisTitle = vs ? `share of ${sets ? 'the proteins' : `the ${W.marks}`} in each ${cls}` : sets ? `fold enrichment (log scale): the share of ${sel ? 'your selection’s' : markedUnits(a.id)} ${sel ? setUnit(a.id) : ''} in the set over the share of all ${setUnit(a.id)}`.replace(/\s+/g, ' ')
      : `odds ratio ${m === 'fisher' ? 'pooled over the proteins (Fisher)' : 'within each protein (Mantel–Haenszel)'}, log scale; 1× is as often as the other ${W.residues}`;
    return { a, m, sets, vs, items, rows, axis, cols, cls, legend, axisTitle, valHead: vs ? 'shares' : sets ? 'fold' : 'OR' };
  }
  // a class's meaning beside its name only when it is short ("RGG · Gly at +1 and +2"); a longer one is its hover
  const shortHelp = r => !!r.help && r.help.length <= 34;
  const valText = r => (r.vs ? `${pcS(share1(r))} · ${pcS(share2(r))}` : r.eff == null ? '—' : fx(r.eff));
  // on the page: a row of the chart (it keeps .drow: its hover read-out, and a click selects its marks)
  function chartRow(r, M, fkey, mark) {
    const X = M.axis.X, pc = v => (100 * X(v)).toFixed(2) + '%', d = decile(r);
    let marks = M.axis.ticks.map(t => `<line class="${t.lab === '1×' ? 'one' : 'grid'}" x1="${(100 * t.x).toFixed(2)}%" x2="${(100 * t.x).toFixed(2)}%" y1="0" y2="100%"/>`).join('');
    if (r.vs) {
      marks += `<line class="whisker ${r.dir}" x1="${pc(share2(r))}" x2="${pc(share1(r))}" y1="50%" y2="50%"/><circle class="dot other" cx="${pc(share2(r))}" cy="50%" r="4"/><circle class="dot sel ${r.dir}" cx="${pc(share1(r))}" cy="50%" r="4.6"/>`;
    } else if (r.eff != null) {
      const x1 = X(1), x2 = X(r.eff);
      marks += `<rect class="bar ${r.dir}" x="${(100 * Math.min(x1, x2)).toFixed(2)}%" width="${Math.max(0.4, 100 * Math.abs(x2 - x1)).toFixed(2)}%" y="5" height="10" rx="1.5"/>`;
      if (r.lo != null && r.hi != null) marks += `<line class="ci" x1="${pc(r.lo)}" x2="${pc(r.hi)}" y1="10" y2="10"/>` + [r.lo, r.hi].map(v => `<line class="ci" x1="${pc(v)}" x2="${pc(v)}" y1="7" y2="13"/>`).join('');
    }
    if (r.ref) marks += `<line class="ref" x1="${pc(r.ref.eff)}" x2="${pc(r.ref.eff)}" y1="1" y2="19"/>`;
    return `<div class="drow qrow${fkey ? ' pick' : ''}${mark ? ' more-mark' : ''}" data-r="${reg(r)}" data-cat="${esc(r.category)}"${fkey ? ` data-f="${esc(fkey)}" data-v="${esc(r.category)}" role="button" tabindex="0" title="Select the ${esc(W.marks)} ${SETS(r.analysis) ? 'on proteins in' : 'in'} ${esc(r.label)}"` : ''}>` +
      `<span class="lab"${r.help ? ` title="${esc(r.help)}"` : ''}><span class="ln">${esc(r.label)}</span>${shortHelp(r) ? `<span class="lh"><span class="sep">&nbsp;·&nbsp;</span>${esc(r.help)}</span>` : ''}</span>` +
      `<span class="cnt">${kfmt(r.a)} / ${kfmt(r.a + r.b)}</span><span class="cnt o">${kfmt(r.c)} / ${kfmt(r.c + r.d)}</span>` +
      `<svg aria-hidden="true">${marks}</svg><span class="val ${r.dir}">${r.vs ? `${pcS(share1(r))} <span class="muted">· ${pcS(share2(r))}</span>` : valText(r)}${d ? `<i class="dm ${d.dir}" title="Within protein abundance deciles: ${DECILE[d.dir][1]} (OR ${fxn(d.eff)}, q ${fq(d.q)})">${DECILE[d.dir][0]}</i>` : r.vs || !M.legend.some(x => x[0] === 'dec') ? '' : '<i class="dm"></i>'}</span>` +
      `<span class="vh">${r.vs ? `${pcS(share1(r))} of your selection, against ${pcS(share2(r))} of ${esc(vsName())}` : `${esc(effText(r))}, q ${fq(r.q)}`}${d ? `; within abundance deciles: ${DECILE[d.dir][1]}` : ''}${r.ref ? `; whole dataset ${esc(effText(r.ref))}` : ''}</span></div>`;
  }
  const SWATCH = { more: '<i class="sw bar more"></i>', less: '<i class="sw bar less"></i>', same: '<i class="sw bar same"></i>', ns: '<i class="sw bar ns"></i>', ci: '<i class="sw ci"></i>',
    ref: '<i class="sw ref"></i>', sel: '<i class="kd more"></i>', other: '<i class="kd ns"></i>', dec: '', none: '' };
  function chartHtml(M, fkey, mark) {
    const head = `<div class="qhead" aria-hidden="true"><span></span>${M.cols.map((c, k) => `<span class="cnt${k ? ' o' : ''}">${esc(c)}<small>in ${M.cls} / all</small></span>`).join('')}<span></span><span class="val">${M.valHead}</span></div>`;
    const body = M.items.map(it => (it.r ? chartRow(it.r, M, fkey, mark && mark.has(it.r.category)) : `<div class="qgroup"${it.head ? '' : ' aria-hidden="true"'}>${esc(it.head)}</div>`)).join('');
    const axis = `<div class="qaxis" aria-hidden="true"><span></span><span class="cnt"></span><span class="cnt o"></span><span class="ticks">${M.axis.ticks.map(t => `<span class="${t.minor ? 'minor' : ''}" style="left:${(100 * t.x).toFixed(2)}%">${t.lab}</span>`).join('')}</span><span></span>` +
      `<span class="qaxis-title">${esc(M.axisTitle)}</span></div>`;
    return `<div class="qchart">${head}${body}${axis}<p class="qkey">${M.legend.map(([k, t]) => `<span>${SWATCH[k]}${esc(t)}</span>`).join('')}</p></div>`;
  }
  function answer(rows) {
    const up = rows.filter(r => r.dir === 'more').sort((x, y) => y.eff - x.eff), down = rows.filter(r => r.dir === 'less').sort((x, y) => x.eff - y.eff);
    const list = (rs, k) => rs.slice(0, k).map(r => `${esc(r.label)} <span class="an">${effText(r)}</span>`).join(', ') + (rs.length > k ? ` <span class="muted">+${rs.length - k}</span>` : '');
    if (up.length) return am('more') + list(up, 2) + (down.length ? '; ' + am('less') + list(down, 1) : '');
    if (down.length) return am('less') + list(down, 2);
    return am('ns') + (rows.some(r => r.q != null && r.q <= PADJ) ? 'none differs by 1.1× or more' : 'none differs at q ≤ 0.05');
  }
  // why a selection's rows are shown and not tested
  const whyShown = a => (a.kind === 'protein_sets' && K.sel?.namesProteins() && !K.sel.madeWith(a.id)
    ? 'Your selection names its proteins, so it is shown against the sets, not tested: the test would be of the choice of genes.'
    : 'Your selection was made with this question (or one reading the same data), so it is shown, not tested.');
  function summaryLine(rows, tmpl, card = {}) {
    rows = rows.filter(r => !EXCL.test(r.label));
    if (rows.some(r => r.vs)) {
      const ok = rows.filter(enough), up = ok.filter(r => r.dir === 'more').sort((x, y) => strength(y) - strength(x))[0], dn = ok.filter(r => r.dir === 'less').sort((x, y) => strength(y) - strength(x))[0];
      const one = r => `<b>${esc(r.label)}</b> (${pcS(share1(r))} against ${pcS(share2(r))})`;
      return up || dn ? [up ? 'More often: ' + one(up) : '', dn ? (up ? 'less often: ' : 'Less often: ') + one(dn) : ''].filter(Boolean).join('; ') : `None differs from ${esc(vsName())} (q ≤ 0.05 and at least 1.1×)`;
    }
    const top = rows.filter(r => r.dir === 'more').sort(byOrder(card))[0], low = rows.filter(r => r.dir === 'less').sort(card.order === 'q' ? byOrder(card) : (x, y) => x.eff - y.eff)[0];
    if (tmpl && top) return esc(tmpl).replace('{top}', `<b>${esc(top.label)}</b>`).replace('{fold}', fx(top.eff));
    if (top) return `More often: <b>${esc(top.label)}</b> (${fx(top.eff)})` + (low ? `; less often: <b>${esc(low.label)}</b> (${fx(low.eff)})` : '');
    if (low) return `Least often: <b>${esc(low.label)}</b> (${fx(low.eff)})`;
    return 'None differs (q ≤ 0.05 and at least 1.1×)';
  }
  const EXCL = /^(no |not |unknown|unassigned|other\b)/i;
  const OV = D.overview || {};
  function ovSections() {
    if (OV.sections) return OV.sections.map(x => ({ name: x.name, cards: x.cards.map(c => (typeof c === 'string' ? { analysis: c } : c)).filter(c => A[c.analysis]) }));
    const out = [];
    D.analyses.forEach(a => { const name = a.section || 'Other questions'; let x = out.find(y => y.name === name); if (!x) out.push(x = { name, cards: [] }); x.cards.push({ analysis: a.id }); });
    return out;
  }
  // against other marks the attributes are questions too: about the sites, and (last, as a caveat) how they were found
  const secList = () => (vsOn() ? [...ovSections(), ...['About the sites', 'How they were found'].map(name => ({ name, caveat: name === 'How they were found', cards: ATTRQ.filter(a => a.section === name).map(a => ({ analysis: a.id })) })).filter(x => x.cards.length)] : ovSections());
  const allCards = () => secList().flatMap(x => x.cards.map(c => ({ ...c, section: x.name })));
  const selOn = () => !!K.sel?.active();
  // the rows of a question: the selection's, tested again, or the site's own
  const vsOn = () => selOn() && S.vs !== 'residues';
  // within each protein needs proteins with marks on both sides; with too few (a selection of whole proteins has none),
  // the comparison is pooled, and the page says so
  const noWithin = () => vsOn() && (K.sel.contrastGroups()?.mixed ?? 0) < K.sel.MIN.proteins;
  const vsMethod = m => (m === 'mantel_haenszel' && noWithin() ? 'fisher' : m);
  const rowsOf = (a, m) => (vsOn() ? K.sel.contrast(a.id, a.kind === 'protein_sets' ? 'enricher' : vsMethod(m)) || []
    : selOn() ? K.sel.rows(a.id, a.kind === 'protein_sets' ? 'enricher' : m) || [] : rowsFor(a, m));
  const fkeyOf = a => (a.kind === 'protein_sets' ? 'p:' + a.id : a.kind === 'attribute' ? ((D.attribute_specs[a.attribute] || {}).kind === 'number' ? 'n:' : 't:') + a.attribute : 'a:' + a.id);
  // against other marks: each row's two shares, and how strongly it differs (the CI bound nearer 1, on a log scale)
  const share1 = r => (r.a + r.b ? r.a / (r.a + r.b) : 0), share2 = r => (r.c + r.d ? r.c / (r.c + r.d) : 0);
  const pcS = v => (v < 0.1 ? (100 * v).toFixed(1) : (100 * v).toFixed(0)) + '%';
  const strength = r => (r.dir === 'more' ? Math.log(r.lo ?? r.eff) : r.dir === 'less' ? -Math.log(r.hi ?? r.eff) : 0);
  const enough = r => r.a + r.c >= 10;
  const vsName = () => (S.vs === 'cmp' ? `the marks of ${cmpName()}` : `the other ${W.marks}`);
  const cmpName = () => { const x = (K.sel.savedList() || []).find(y => (y.hash.split('?')[1] || '') === S.cmp); if (x) return `“${x.name}”`; const st = K.sel.stateOfHash('?' + S.cmp); return `“${[st.q, ...Object.entries(st.f).map(([k, v]) => k.split(':')[1] + ': ' + v.join(', '))].filter(Boolean).join(' · ') || 'everything'}”`; };
  const selTestable = () => !selOn() || (K.sel.data() && K.sel.testable() && K.sel.nMarks() > 0);
  // which rows a tile shows: up to 7, the classes that differ most first (a few of those less often, if any), then
  // significant ones within 1.1×; none, unknown and other classes are left to the full figure

  // a card's order: by effect (the default) or by evidence (order: q), for sets where a small set reaches the largest
  // fold when every member is marked
  const cardOf = aid => allCards().find(c => c.analysis === aid) || {};
  const byOrder = card => (card.order === 'q' ? (x, y) => (x.q ?? 1) - (y.q ?? 1) || y.eff - x.eff : (x, y) => y.eff - x.eff);
  function pick(rows, max, card = {}) {
    const vs = rows.some(r => r.vs);
    // against other marks: the classes with most evidence first (the CI bound nearer 1), with at least 10 marks
    const c = rows.filter(r => r.eff != null && !EXCL.test(r.label) && (!vs || enough(r)));
    const up = c.filter(r => r.dir === 'more').sort(vs ? (x, y) => strength(y) - strength(x) : byOrder(card)), dn = c.filter(r => r.dir === 'less').sort(vs ? (x, y) => strength(y) - strength(x) : card.order === 'q' ? byOrder(card) : (x, y) => x.eff - y.eff);
    const same = c.filter(r => r.dir === 'same').sort((x, y) => Math.abs(Math.log(y.eff)) - Math.abs(Math.log(x.eff)));
    const nUp = Math.min(up.length, dn.length ? max - 2 : max), nDn = Math.min(dn.length, max - nUp, up.length ? 2 : max);
    const shown = [...up.slice(0, nUp), ...dn.slice(0, nDn)];
    shown.push(...same.slice(0, Math.max(0, max - shown.length)));
    // the classes that differ but are not shown: "+N more", which the question outlines when opened from it
    const left = [...up, ...dn, ...same].filter(r => !shown.includes(r)).map(r => r.category);
    return { shown, more: left.length, left };
  }
  // against other marks: each class as two shares on one axis, the selection's (filled) and the others' (hollow)
  function shareRows(rows, cls = 'trow') {
    const top = Math.max(0.05, ...rows.flatMap(r => [share1(r), share2(r)]));
    const scale = [0.1, 0.25, 0.5, 1].find(v => v >= top) || 1, X = v => (Math.min(v / scale, 1) * 100).toFixed(2) + '%';
    return rows.map(r => `<div class="${cls} share" data-r="${reg(r)}"${cls === 'drow' ? ` data-f="${esc(fkeyOf(A[r.analysis]))}" data-v="${esc(r.category)}" role="button" tabindex="0" title="Select the ${esc(W.marks)} ${SETS(r.analysis) ? 'on proteins in' : 'in'} ${esc(r.label)}"` : ''}><span class="lab">${esc(r.label)}</span>` +
      `<svg aria-hidden="true"><line class="track" x1="0" x2="100%" y1="50%" y2="50%"/><line class="whisker ${r.dir}" x1="${X(share2(r))}" x2="${X(share1(r))}" y1="50%" y2="50%"/>` +
      `<circle class="dot other" cx="${X(share2(r))}" cy="50%" r="4"/><circle class="dot sel ${r.dir}" cx="${X(share1(r))}" cy="50%" r="4.6"/></svg>` +
      `<span class="val ${r.dir}">${pcS(share1(r))} <span class="muted">· ${pcS(share2(r))}</span><span class="vh"> of your selection, against ${pcS(share2(r))} of ${esc(vsName())}</span></span></div>`).join('') +
      `<div class="taxis share-axis"><span></span><span class="one-lab" style="--x:100%">${pcS(scale)}</span><span></span></div>`;
  }
  // a tile's rows on one log2 axis: dashed lines at each doubling, a solid line at 1×; with a selection, a tick at the
  // whole dataset's value (the tile's SVG export draws the same, tileSvg)
  function tileScale(rows) {
    const l2 = v => Math.log2(Math.max(v, 1e-3));
    const vals = rows.flatMap(r => [r.eff, r.lo, r.hi, r.ref?.eff].filter(v => v != null && v > 0));
    const lo = Math.min(-1, Math.max(-4, Math.floor(Math.min(...vals.map(l2))))), hi = Math.max(1, Math.min(6, Math.ceil(Math.max(...vals.map(l2)))));
    const grid = []; for (let k = lo; k <= hi; k++) grid.push(k);
    return { X: v => (Math.min(Math.max(l2(v), lo), hi) - lo) / (hi - lo), grid };
  }
  function tileRows(rows) {
    if (!rows.length) return '';
    if (rows.some(r => r.vs)) return shareRows(rows);
    const sc = tileScale(rows), X = v => (100 * sc.X(v)).toFixed(2) + '%';
    const grid = sc.grid.map(k => `<line class="${k === 0 ? 'one' : 'grid'}" x1="${X(2 ** k)}" x2="${X(2 ** k)}" y1="0" y2="100%"/>`);
    return rows.map(r => `<div class="trow" data-r="${reg(r)}"><span class="lab">${esc(r.label)}</span><svg aria-hidden="true">${grid.join('')}` +
      (r.lo != null && r.hi != null ? `<line class="whisker ${r.dir}" x1="${X(r.lo)}" x2="${X(r.hi)}" y1="50%" y2="50%"/>` : '') +
      `<circle class="dot ${r.dir}" cx="${X(r.eff)}" cy="50%" r="4.6"/>${r.ref ? `<line class="ref" x1="${X(r.ref.eff)}" x2="${X(r.ref.eff)}" y1="15%" y2="85%"/>` : ''}</svg><span class="val ${r.dir}">${fx(r.eff)}</span></div>`).join('') +
      `<div class="taxis"><span></span><span class="one-lab" style="--x:${X(1)}">1×</span><span></span></div>`;
  }
  // what a tile shows, for the tile and its exports
  function tileState(card) {
    const a = A[card.analysis], max = card.rows || OV.rows || 7;
    const rows = withRef(a, rowsOf(a, S.m), S.m), { shown, more, left } = pick(rows, max, card);
    const whole = selOn() && !vsOn() ? rowsFor(a, S.m) : null;
    const made = selOn() && rows.some(r => r.descriptive);
    const foot = made ? whyShown(a) : shown.length || !vsOn() ? summaryLine(rows, card.summary, card) : '';
    return { a, rows, shown, more, left, whole, made, foot };
  }
  function tile(card) {
    if (A[card.analysis].tile) return A[card.analysis].tile(card);    // a question a module draws (kit-counts.js)
    const own = K.questions[card.analysis]?.tile?.(card);            // or draws the tile of (kit-cell.js, kit-values.js)
    if (own != null) return own;
    const { a, rows, shown, more, left, whole, made, foot } = tileState(card);
    // its downloads on hover (none on a touch screen): the tile as a figure, the question's rows as a TSV, its Method
    const exp = `<div class="exp texp" role="group" aria-label="Download ${esc(card.title || a.title)}">${['pdf', 'svg', 'png', 'tsv'].map(k => `<button type="button" class="exp-btn" data-texp="${k}" data-aid="${esc(a.id)}" title="${k === 'tsv' ? 'TSV: every row of the question, ' + EXP_HELP.tsv.replace(/^TSV: the rows, /, '') : EXP_HELP[k].replace(/^(\w+)/, '$1 of this tile')}">${k.toUpperCase()}</button>`).join('')}${methodLink(a.id)}</div>`;
    return `<article class="tile" id="tile-${esc(a.id)}" data-tile="${esc(a.id)}" tabindex="0"><header><h3>${esc(card.title || a.title)}${a.new && D.run.parity ? ' <span class="newtag" title="Not in the published release: a question this rebuild adds">new</span>' : ''}</h3>${exp}<span class="chev" aria-hidden="true">›</span></header>` +
      (OV.statistic_label ? `<p class="tstat">${esc(A[card.analysis].kind === 'protein_sets' ? 'pooled over proteins' : METHOD[vsMethod(S.m)])}</p>` : '') +
      (shown.length ? `<div class="trows">${tileRows(shown)}</div>` : made ? '' : `<p class="muted tnone">${rows.some(r => r.q != null && r.q <= PADJ) ? 'None differs by 1.1× or more' : 'None differs (q ≤ 0.05)'}</p>`) +
      (more ? `<a class="tmore" href="${esc(link('overview', a.id))}" data-more="${esc(JSON.stringify(left))}" title="Open the question at the ${more} not shown here">+${more} more ›</a>` : '') +
      (foot ? `<p class="tfoot">${foot}</p>` : '') + (whole ? `<p class="twhole"><span>Whole dataset</span> ${answer(whole)}</p>` : '') + '</article>';
  }
  // "+N more ›": the question opens with the classes the tile left out outlined for a few seconds, the first in view
  let MORE = null;
  K.clicks.push(['a.tmore[data-more]', el => { try { MORE = { aid: el.closest('[data-tile]').dataset.tile, cats: new Set(JSON.parse(el.dataset.more)), until: Date.now() + 6000, scroll: true }; } catch (err) { MORE = null; } }]);
  function moreMarks(a, rows) {
    if (!MORE || MORE.aid !== a.id || Date.now() > MORE.until) return null;
    if (shownOf(a, rows).filter(r => MORE.cats.has(r.category)).length < rows.filter(r => MORE.cats.has(r.category)).length) S.all.add(a.id);
    if (MORE.scroll) {
      MORE.scroll = false;
      setTimeout(() => {
        const el = document.querySelector('.qrow.more-mark'), bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-h')) || 0;
        if (el) scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - bar - 90), behavior: K.smooth() });
        setTimeout(() => document.querySelectorAll('.more-mark').forEach(x => x.classList.remove('more-mark')), Math.max(0, MORE.until - Date.now()));
      }, 0);
    }
    return MORE.cats;
  }
  // a tile's downloads: the tile drawn as a figure (PDF, SVG, PNG), and its question's rows (TSV)
  K.clicks.push(['[data-texp]', btn => {
    const aid = btn.dataset.aid, card = allCards().find(c => c.analysis === aid) || { analysis: aid }, name = `${D.site.id}_${aid}_tile${SETS(aid) ? '' : '_' + (S.m === 'fisher' ? 'pooled' : 'within_protein')}${selOn() ? '_selection' : ''}`;
    exportFigure(btn.dataset.texp, () => tileFigure(card), name, btn, () => cardTsv(aid, S.m));
  }]);
  function lead() {
    const q = OV.question || `Which parts of proteins are ${W.marked_long}?`;
    const key = `<p class="key"><span><i class="kd more"></i>more often</span><span><i class="kd less"></i>less often</span><span><i class="kd same"></i>about the same (within 1.1×)</span><span><i class="kd ns"></i>no difference (q > ${PADJ})</span>${vsOn() ? `<span><i class="kd more"></i> your selection’s share, <i class="kd ns"></i> that of ${esc(vsName())}</span>` : ''}` +
      `<button class="chip-btn" type="button" id="how" aria-expanded="${S.how}">How to read</button></p>` +
      (S.how ? `<p class="how-text">Each tile is a question; each row a class, with its effect on a log scale (the solid line is no difference). For a question about where ${esc(W.marks)} sit, × is an odds ratio: the odds that a ${esc(W.mark)} is in the class, over the odds for another ${esc(W.residue)} (not the ratio of the two shares, which is closer to 1; the hover gives both shares)${D.analyses.some(a => a.kind === 'protein_sets') ? '; for a question about kinds of protein it is the fold enrichment, the share of ' + esc(W.marked) + ' proteins in the set over the share of all proteins' : ''}. <b>Within each protein</b>, every protein is a stratum and its ${esc(W.marks)} are compared only with its own ${esc(W.residues)} (Mantel–Haenszel odds ratio), which separates where ${esc(W.marks)} sit from which proteins were found ${esc(W.marked)}; <b>pooled</b> puts all the ${esc(W.residues)} of the ${esc(W.marked)} proteins together (Fisher’s exact test). ${D.analyses.some(a => a.kind === 'protein_sets') ? `Questions about kinds of protein count proteins: the fold enrichment of ${esc(W.marked)} proteins in a set (one-sided hypergeometric test). ` : ''}Red: more often (q ≤ 0.05 and at least 1.1×); slate: less often; grey: significant but within 1.1×; hollow: no significant difference. A tile shows the classes that differ most; it opens to every class. Hover a row for its counts.</p>` : '');
    const methods = vsOn() && K.sel.STUDY ? ['mantel_haenszel', 'fisher', 'study'] : ['mantel_haenszel', 'fisher'];
    const tools = `<span class="tools"><span class="seg" role="group" aria-label="Test">${methods.map(m => `<button type="button" data-m="${m}" aria-pressed="${vsMethod(S.m) === m}"${m === 'mantel_haenszel' && noWithin() ? ' disabled title="No protein has marks on both sides: your selection takes whole proteins"' : ''}>${cap(METHOD[m])}</button>`).join('')}</span></span>`;
    // the marks the site shows and counts nowhere (kit-shown.js): the note says how many, beside how many are counted
    if (!selOn()) return `<div class="page-head"><h2>${esc(q)}</h2>${tools}</div>` + (K.shown?.note ? K.shown.note() : '') + key;
    const c = K.sel.compute(), n = (c.marks || []).length, np = c.proteins ? c.proteins.size : 0;
    if (K.sel.data() && n === 0) return `<div class="page-head"><h2>Your selection</h2></div><p class="note">No ${esc(W.mark)} matches this selection. Change the search or the filters, or <button class="linkish" type="button" data-sel-clear-all>clear the selection</button>.</p>` +
      // an empty result says what the search takes, with the site's examples to try, and where the help is
      `<p class="note empty-help">The search takes a gene, an accession, a list of genes${(D.site.examples || []).some(e => e.includes(':')) ? ' or a term such as key:value' : ''}.${(D.site.examples || []).length ? ` Try ${D.site.examples.slice(0, 4).map(e => `<button class="linkish mono" type="button" data-try="${esc(e)}">${esc(e)}</button>`).join(', ')}.` : ''}${K.views.help ? ` <a href="#help/h-search">How searching works</a>.` : ''}</p>`;
    const byP = K.sel.selectedCountByProtein ? K.sel.selectedCountByProtein() : {};
    const pills = Object.entries(byP).sort((x, y) => y[1] - x[1]).slice(0, 30).map(([pi, k]) => { const p = D.proteins[pi]; return `<a class="ppill" href="${esc(link('protein', p[0]))}" title="${esc(p[2])}: ${int(k)} of its ${int(p[4])} ${esc(W.marks)} selected">${esc(p[1] || p[0])} <span>${int(k)}</span></a>`; }).join('');
    const against = `<p class="against"><span class="flabel">Compared with</span><span class="seg" role="group" aria-label="Compared with">` +
      `<button type="button" data-vs="residues" aria-pressed="${S.vs === 'residues'}" title="The site’s own tests: the selected ${esc(W.marks)} against the other ${esc(W.residues)} of their proteins">other ${esc(W.residues)}</button>` +
      `<button type="button" data-vs="marks" aria-pressed="${S.vs === 'marks'}" title="What sets the selection apart: its ${esc(W.marks)} against the site’s other ${esc(W.marks)}">other ${esc(W.marks)}</button>` +
      (S.vs === 'cmp' ? `<button type="button" data-vs="cmp" aria-pressed="true">${esc(cmpName())}</button>` : '') +
      (K.views.compare ? `<button type="button" class="linkish" data-go-compare title="Compare with a saved selection">a saved selection…</button>` : '') + `</span></p>`;
    const head = `<div class="page-head"><h2>Your selection</h2>${K.sel.testable() || vsOn() ? tools : ''}</div><p class="sel-lead">${esc(K.sel.describe())} · <b>${int(n)}</b> ${esc(n === 1 ? W.mark : W.marks)} on <b>${int(np)}</b> protein${np === 1 ? '' : 's'}</p>` +
      `<div class="ppills">${pills}${np > 30 ? `<a href="${esc(link('proteins'))}" class="muted">+${int(np - 30)} more on the Proteins page</a>` : ''}</div>` + against;
    if (vsOn()) return head + vsLead() + key;
    return head + (K.sel.testable() ? key : `<p class="note">Too few to compare with the other ${esc(W.residues)}: a selection needs at least ${K.sel.MIN.proteins} proteins and ${K.sel.MIN.marks} ${esc(W.marks)} for its tests. Compare it with the other ${esc(W.marks)} instead, or see its ${esc(W.marks)} on the Proteins${K.views.sites ? ' and Sites pages' : ' page'}.</p>`);
  }
  // against other marks: who is compared with whom, the strongest differences in a sentence (each with whether it holds
  // under the other two tests), and how the marks were found, as a caveat rather than a finding
  function vsLead() {
    const G = K.sel.contrastGroups(), MIN = K.sel.MIN_SIDE;
    if (!G || G.g1.length < MIN || G.g2.length < MIN) return `<p class="note">A comparison needs at least ${MIN} ${esc(W.marks)} on each side${G ? `: ${int(G.g1.length)} against ${int(G.g2.length)}` : ''}${G?.shared ? ` (the ${int(G.shared)} both selections hold are left out of both)` : ''}.</p>`;
    const who = `<p class="vs-who">Your <b>${int(G.g1.length)}</b> ${esc(W.marks)} against ${S.vs === 'cmp' ? `the <b>${int(G.g2.length)}</b> of ${esc(cmpName())}${G.shared ? `, leaving out the ${int(G.shared)} in both` : ''}` : `the other <b>${int(G.g2.length)}</b>`}, ${esc(METHOD_PHRASE[vsMethod(S.m)] || '')}.` +
      (S.m === 'mantel_haenszel' && noWithin() ? ` <span class="muted">Not within each protein: ${G.mixed ? `only ${int(G.mixed)} protein${G.mixed === 1 ? ' has' : 's have'}` : 'no protein has'} ${esc(W.marks)} on both sides (your selection takes whole proteins), so ${G.mixed ? 'that test says little' : 'that test cannot be made'}.</span>` : '') + `</p>`;
    const meths = [...(noWithin() ? [] : ['mantel_haenszel']), 'fisher', ...(K.sel.STUDY ? ['study'] : [])].filter(m => m !== vsMethod(S.m));
    const holdsIn = r => meths.filter(m => (K.sel.contrast(r.analysis, m) || []).find(x => x.category === r.category)?.dir === r.dir).map(m => METHOD[m]);
    const qs = [...D.analyses.filter(a => a.kind !== 'protein_sets'), ...ATTRQ.filter(a => !a.provenance)];
    const all = qs.flatMap(a => (rowsOf(a, S.m) || []).filter(r => !r.descriptive && enough(r) && !EXCL.test(r.label)));
    const top = (rs, d, k) => rs.filter(r => r.dir === d).sort((x, y) => strength(y) - strength(x)).slice(0, k);
    const one = r => { const h = holdsIn(r); return `<b>${esc(r.label)}</b> <span class="muted">(${esc(inText(A[r.analysis]?.title))}: ${pcS(share1(r))} against ${pcS(share2(r))}${h.length ? `; also ${h.join(' and ')}` : meths.length ? `; not ${meths.map(m => METHOD[m]).join(' or ')}` : ''})</span>`; };
    const up = top(all, 'more', 3), dn = top(all, 'less', 2);
    const sets = D.analyses.filter(a => a.kind === 'protein_sets').flatMap(a => (rowsOf(a, 'enricher') || []).filter(r => !r.descriptive && enough(r)));
    const sUp = top(sets, 'more', 2);
    const say = (up.length ? `More often than in ${esc(vsName())}: ${up.map(one).join('; ')}.` : '') + (dn.length ? ` Less often: ${dn.map(one).join('; ')}.` : '') + (up.length || dn.length ? '' : `No class differs from ${esc(vsName())} at q ≤ ${PADJ} and 1.1×, with at least 10 ${esc(W.marks)}.`) +
      (sUp.length ? ` Their proteins are more often in ${sUp.map(r => `<b>${esc(r.label)}</b> <span class="muted">(${esc(inText(A[r.analysis].title))}: ${pcS(share1(r))} of the proteins against ${pcS(share2(r))})</span>`).join('; ')}.` : '');
    // how they were found: the provenance attributes whose shares differ most, as a caveat
    const prov = ATTRQ.filter(a => a.provenance).flatMap(a => (K.sel.contrast(a.id, 'fisher') || []).filter(r => enough(r) && r.q != null && r.q <= PADJ));
    const pv = prov.sort((x, y) => Math.abs(share1(y) - share2(y)) - Math.abs(share1(x) - share2(x))).slice(0, 3);
    const caveat = pv.length ? `<p class="vs-caveat"><b>How they were found.</b> ${pv.map(r => `<b>${esc(r.label)}</b> <span class="muted">(${esc(inText(A[r.analysis].title))})</span>: ${pcS(share1(r))} of these, against ${pcS(share2(r))} of the others`).join('; ')}. Differences above may reflect which sources report these ${esc(W.marks)}${K.sel.STUDY && S.m !== 'study' ? `: <button type="button" class="linkish" data-m="study">compare within studies</button>, where each ${esc(W.mark)} is compared only with ${esc(W.marks)} reported by the same sources.` : S.m === 'study' ? '; the comparison above is within studies, so they do not explain it.' : '.'}</p>` : '';
    return who + `<p class="vs-say">${say}</p>` + caveat + `<p class="muted small">Exploratory: ${esc(W.marks)} of one protein are not independent, and the comparison is not adjusted for the other selections tried. Each ${esc(W.mark)} row shows the selection’s share (filled) and ${esc(vsName())}’ (hollow).</p>`;
  }
  function overview() {
    REG = [];
    if (S.arg && A[S.arg]?.page) return focus(S.arg);
    if (selOn() && !K.sel.data()) return lead() + '<p class="muted">Loading the selection…</p>';
    // a selection too small to test: its proteins drawn and the counts that hold for any selection; one that can be
    // tested: what sets it apart, in brief (the modules' blocks: kit-selview.js)
    const selBlocks = list => (list || []).map(f => f()).join('');
    if (selOn() && !vsOn() && !selTestable()) return lead() + selBlocks(K.selSmall) + (K.sel.data() && !K.sel.nMarks() ? '' : anySize());   // nothing selected: no empty tiles
    if (S.arg && A[S.arg] && (A[S.arg].kind !== 'attribute' || vsOn())) return focus(S.arg);
    if (vsOn() && !(K.sel.contrastGroups()?.g1.length >= K.sel.MIN_SIDE && K.sel.contrastGroups()?.g2.length >= K.sel.MIN_SIDE)) return lead();
    // with a selection, a section of protein-set questions is about its proteins: "Kinds of protein in your selection"
    const head = x => (selOn() && x.cards.length && x.cards.every(c => A[c.analysis]?.kind === 'protein_sets') ? `${x.name} in your selection` : x.name);
    // K.overviewTop: a module's block above the Overview's questions (kit-help.js: the start panel for a first visit)
    return (S.arg ? '' : (K.overviewTop || []).map(f => f()).join('')) + lead() + (selOn() && !vsOn() ? selBlocks(K.selLead) : '') + secList().map(x => `<h3 class="sec-label${x.caveat ? ' caveat' : ''}" id="sec-${esc(x.name.replace(/\W+/g, '-').toLowerCase())}">${esc(head(x))}</h3><div class="tiles">${x.cards.map(tile).join('')}</div>`).join('') +
      (selOn() ? '' : (K.overviewBlocks || []).map(f => f()).join(''));    // the modules' own blocks (Starting points)
  }
  // the tiles of questions that hold for any selection (a module's counts), for a selection too small to test
  const anySize = () => secList().map(x => [x, x.cards.filter(c => A[c.analysis]?.anySize)]).filter(([, cs]) => cs.length)
    .map(([x, cs]) => `<h3 class="sec-label" id="sec-${esc(x.name.replace(/\W+/g, '-').toLowerCase())}">${esc(x.name)}</h3><div class="tiles">${cs.map(tile).join('')}</div>`).join('');
  // one question, opened from its tile: every class, the summary and the downloads, with Previous and Next
  function focus(aid) {
    // a question that is one of a card's views (website.overview cards: views) opens that card
    const cards = allCards(), own = cards.findIndex(c => c.analysis === aid), i = own >= 0 ? own : cards.findIndex(c => (c.views || []).some(v => v.analysis === aid)), a = A[aid];
    const prev = cards[i - 1], next = cards[i + 1], card = cards[i] || { section: a.section };
    const Q = K.questions[aid], mod = a.kind === 'module';
    const bar = `<div class="focus-bar"><a href="${esc(link('overview'))}">‹ All sections</a><span class="crumb">Overview › ${esc(card.section || '')} › <b>${esc(card.title || a.title)}</b></span>` +
      (i >= 0 ? `<span class="muted">${i + 1} of ${cards.length}</span>` : '') +
      `<span class="pn">${prev ? `<a href="${esc(link('overview', prev.analysis))}">‹ Previous · ${esc(prev.title || A[prev.analysis].title)}</a>` : ''}${next ? `<a href="${esc(link('overview', next.analysis))}">${esc(next.title || A[next.analysis].title)} · Next ›</a>` : ''}</span></div>`;
    if (a.page) return bar + a.page(card);                               // a question a module draws (kit-counts.js)
    const rows = mod ? [] : chartRows(a, S.m, card);
    return bar + `<div class="page-head"><h2>${esc(card.title || a.title)}</h2><span class="tools">${a.kind === 'protein_sets' || mod ? '' : `<span class="seg" role="group">${(vsOn() && K.sel.STUDY ? ['mantel_haenszel', 'fisher', 'study'] : ['mantel_haenszel', 'fisher']).map(m => `<button type="button" data-m="${m}" aria-pressed="${vsMethod(S.m) === m}"${m === 'mantel_haenszel' && noWithin() ? ' disabled title="No protein has marks on both sides: your selection takes whole proteins"' : ''}>${cap(METHOD[m])}</button>`).join('')}</span>`}</span></div>` +
      `<p class="page-sub">${vsOn() ? `${esc(a.title)}: <b>your selection</b> against ${esc(vsName())}, tested in your browser (exploratory).` : esc(a.question || a.describe || '')}${selOn() && !vsOn() ? ` <b>Your selection</b>${rows.some(r => r.descriptive) ? ': ' + whyShown(a).replace(/^Your selection /, '') : vsOn() ? '' : ', tested again in your browser (exploratory: not adjusted for the other selections tried).'}` : ''} <span class="muted">Click a ${a.kind === 'protein_sets' ? 'set' : 'class'} to select its ${esc(W.marks)}.</span></p>` +
      `<section class="pcard">${(Q?.page && Q.page(card, () => cardBody(a, rows))) ?? (K.questionBody && K.questionBody(a, rows, card)) ?? cardBody(a, rows)}${selOn() && !vsOn() && !mod ? `<p class="twhole"><span>Whole dataset</span> ${answer(rowsFor(a, S.m))}</p>` : ''}</section>`;
  }
  // what the site keeps, what it asks other services for, and under which licences everything is
  // the data a reader can download (website.downloads), under its terms, and the site's own tables
  function downloadSection() {
    const dl = D.downloads || [], ds = D.dataset;
    if (!dl.length) return '';
    return `<section id="m-download"><h3>Download the data</h3>` +
      (ds ? `<p>${esc(cap(ds.label || 'dataset'))} ${ds.url ? `<a href="${esc(ds.url)}">${esc(ds.version)}</a>` : esc(ds.version)}${ds.date ? ` (${esc(hdate(ds.date))})` : ''}${ds.doi ? `, archived as <a href="https://doi.org/${esc(ds.doi)}">doi:${esc(ds.doi)}</a>` : ''}.</p>` : '') +
      (D.download_terms ? `<p>${esc(D.download_terms)}</p>` : '') +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>File</th><th>Format</th><th>What it holds</th></tr></thead><tbody>` +
      dl.map(x => `<tr><td><a href="${esc(x.url)}">${esc(x.label)}</a></td><td>${esc(x.format || '')}</td><td class="wrapok">${esc(x.note || '')}</td></tr>`).join('') +
      `</tbody></table></div><p class="note">Every table on this site downloads as TSV from its own page (Download TSV on the ${K.views.proteins ? '<a href="#proteins">Proteins</a> and ' : ''}${K.views.sites ? `<a href="#sites">${esc(cap(W.marks))}</a> pages` : 'pages'}), for your selection, with how it was made and how to cite it in its first lines.</p></section>`;
  }
  // the search's terms: each question and attribute a search can name (key:value), its values, and the older keys read
  function searchSection() {
    const al = Object.entries(D.search_aliases || {}), aliasOf = id => al.filter(([, v]) => v === id).map(([k]) => k);
    const q = D.analyses.map(a => [a.id, a.title, Object.entries(a.labels || {}).filter(([c]) => c).slice(0, 4).map(([c, l]) => l || c), aliasOf(a.id)]);
    const t = Object.entries(D.attribute_specs || {}).filter(([, x]) => x.filter).map(([k, x]) => [k, x.label, Object.values(x.values || {}).slice(0, 4), aliasOf(k)]);
    const ex = (D.site.examples || []).filter(e => e.includes(':'));
    return `<section id="m-search"><h3>Search terms</h3><p>The search takes genes, accessions and entry names (a list of them is a union), a site as "GENE R216", and terms <span class="mono">key:value</span>, each of which must hold. A term's value is a class, set or value by its code or name, or the start of a word in its name; several values, separated by <span class="mono">|</span> or commas, match any.${ex.length ? ` Examples: ${ex.map(e => `<button class="linkish mono" type="button" data-try="${esc(e)}">${esc(e)}</button>`).join(', ')}.` : ''}</p>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Key</th><th>What it names</th><th>Values, for example</th></tr></thead><tbody>` +
      [...q, ...t].map(([k, lab, vals, aka]) => `<tr><td class="mono">${esc(k)}${aka.length ? `<br><span class="muted">or ${aka.map(esc).join(', ')}</span>` : ''}</td><td>${esc(lab)}</td><td class="wrapok">${vals.map(esc).join('; ')}</td></tr>`).join('') +
      `</tbody></table></div></section>`;
  }
  function privacySection() {
    const live = ['UniProt (rest.uniprot.org)', 'AlphaFold DB (alphafold.ebi.ac.uk)', 'PDBe (www.ebi.ac.uk/pdbe)', ...(D.partners ? ['STRING (string-db.org)'] : [])];
    return `<section id="m-privacy"><h3>Licences and privacy</h3>` +
      `<p><b>Licences.</b> The code (ptmcontext) is under the ${esc(hlicence(D.kit.licence || 'MIT'))} licence${D.kit.url ? ` (<a href="${esc(D.kit.url)}">source</a>)` : ''}. This site’s data and figures are under ${esc(hlicence(CIT.licence || 'their sources’ terms'))}; each source keeps its own terms (the Data table above lists them).</p>` +
      `<p><b>Privacy.</b> The site sets no cookies and uses no tracking or analytics. Your searches, filters and selections stay in this page and its address; every test on them runs in your browser, and nothing is sent to a server. This browser keeps only your preferences (theme, the sidebar’s pin and width, the protein map’s rows) and the selections you save, in its local storage; clear them with your browser’s site data. A protein page asks these services for that protein’s public data, by its accession only: ${esc(live.join(', '))}. Downloads are made in the browser.</p></section>`;
  }
  K.sections.method = () => [['m-g1', 'The tests', 0], ['m-tests', 'How the tests work', 1], ['m-questions', 'Questions, and what made each', 1], ['m-parity', 'Checked against the release', 1],
    ['m-gq', 'Each question', 0], ...D.analyses.map(a => [`m-q-${a.id}`, a.title, 1]), ...K.methods.map(x => [`m-q-${x.id}`, x.title, 1]),
    ['m-g2', 'The data', 0], ['m-data', 'Data', 1], ['m-sources', 'Sources', 1], ['m-g3', 'The site', 0], ['m-made', 'How this site is made', 1], ['m-cite', 'How to cite', 1], ['m-download', 'Download the data', 1], ['m-search', 'Search terms', 1], ['m-privacy', 'Licences and privacy', 1]]
    .filter(([id]) => (id !== 'm-parity' || D.run.parity) && (id !== 'm-download' || (D.downloads || []).length) && (id !== 'm-sources' || Object.values(D.attribute_specs || {}).some(x => x.kind === 'list' && x.link)));
  // the Overview's sections and their questions: jumps on the tiles, links from an opened question (keeping the
  // selection and the baseline)
  K.sections.overview = () => [
    ...(selOn() ? [['view', vsOn() ? 'Your selection, against ' + vsName() : 'Your selection', 1]] : []),
    ...secList().flatMap(x => [[`sec-${x.name.replace(/\W+/g, '-').toLowerCase()}`, x.name, 0],
      ...x.cards.map(c => (S.arg ? [`tile-${c.analysis}`, c.title || A[c.analysis].title, 1, link('overview', c.analysis)] : [`tile-${c.analysis}`, c.title || A[c.analysis].title, 1]))]),
    ...(selOn() || S.arg ? [] : (K.overviewSections || []).flatMap(f => f()))];
  // All tests: every question, each opening its own tests
  K.sections.statistics = () => [['view', 'All tests', 1, link('statistics')], ...secList().filter(x => !x.caveat && x.name !== 'About the sites').flatMap(x => [[`stat-${x.name}`, x.name, 0],
    ...x.cards.filter(c => D.analyses.some(a => a.id === c.analysis)).map(c => [`stat-${c.analysis}`, c.title || A[c.analysis].title, 1, link('statistics', '', { a: c.analysis })])])];
  const SLO = Math.log(1 / 16), SHI = Math.log(16);
  const sp = v => (Math.min(Math.max((Math.log(v) - SLO) / (SHI - SLO), 0), 1) * 100).toFixed(2) + '%';
  function strip(rows) {
    return `<svg class="strip" aria-hidden="true"><line class="track" x1="0" x2="100%" y1="9" y2="9"/>` +
      [0.25, 0.5, 2, 4].map(v => `<line class="faint" x1="${sp(v)}" x2="${sp(v)}" y1="4" y2="14"/>`).join('') +
      `<line class="one" x1="${sp(1)}" x2="${sp(1)}" y1="1" y2="17"/>` +
      [...rows].sort((x, y) => (x.dir === 'ns') - (y.dir === 'ns')).reverse().map(r => `<circle class="dot ${r.dir}" cx="${sp(r.eff)}" cy="9" r="4.2"/>`).join('') + '</svg>';
  }
  function cardBody(a, rows) {
    // a residue question shows every class, and so does a set question with 12 sets or fewer (a partition)
    const mark = moreMarks(a, rows), all = S.all.has(a.id), shown = shownOf(a, rows);
    const noun = a.kind === 'protein_sets' ? 'sets' : 'classes';
    const toggle = a.kind === 'protein_sets' && rows.length > 12 ? `<button class="linkish" type="button" data-all="${esc(a.id)}">${all ? 'Show the top ' + SHOWN : 'Show all ' + int(rows.length) + ' ' + noun}</button>` : '';
    const nW = rows.filter(r => holdStatus(r) === 'weaker').length, nL = rows.filter(r => holdStatus(r) === 'lost').length, nDir = rows.filter(r => holdStatus(r) != null).length;
    const strat = a.kind === 'protein_sets' && rows.some(r => !r.selection && STRAT[a.id + '\u0000' + r.category]) ? ` After each value, the same test within protein abundance deciles${nDir ? `: of the ${int(nDir)} sets that differ, ${int(nDir - nW - nL)} hold there, ${int(nW)} keep their direction without reaching q ≤ ${PADJ} and ${int(nL)} lose it` : ''}; hover a set for its numbers.` : '';
    return `<div class="card-body"><div class="card-head"><div><h3>${esc(a.title)}</h3>` +
      `<p class="sub">${vsOn() ? `Each ${a.kind === 'protein_sets' ? 'set: the share of your selection’s proteins in it (filled) and of the other proteins (hollow)' : `class: the share of your selection’s ${esc(W.marks)} in it (filled) and of ${esc(vsName())} (hollow)`}${a.kind === 'protein_sets' ? '' : ', ' + METHOD_PHRASE[S.m]}` : `${esc(a.sub)}${a.kind === 'protein_sets' ? '' : ', ' + METHOD_PHRASE[S.m]}`}.${strat} <a href="#method">How it was tested</a> · <a href="#statistics?a=${encodeURIComponent(a.id)}">all tests</a></p></div>` +
      `<div class="exp" role="group" aria-label="Download ${esc(a.title)}">${['pdf', 'svg', 'png', 'tsv'].map(k => `<button type="button" class="exp-btn" data-exp="${k}" data-aid="${esc(a.id)}" title="${EXP_HELP[k]}">${k.toUpperCase()}</button>`).join('')}${methodLink(a.id)}</div></div>` +
      chartHtml(chartModel(a, shown, S.m), fkeyOf(a), mark) + `${toggle}${rows.some(r => r.descriptive) ? '' : `<p class="summary">${summaryLine(rows)}</p>`}</div>`;
  }

  // ---- Statistics: every test ----------------------------------------------------------------------------------------
  const COLS = [
    ['analysis', 'Question', r => r.title, false], ['label', 'Class or set', r => r.label, false], ['method', 'Test', r => methodName(r), false],
    ['a', `${cap(W.marked)}: in class / all`, r => r.a, true], ['c', 'Others: in class / all', r => r.c, true],
    ['or', 'Effect (95% CI)', r => r.eff ?? -1, true], ['q', 'q', r => r.q ?? 2, true], ['dir', 'Reading', r => r.dir, false], ['strata', 'Strata', r => r.strata ?? -1, true],
  ];
  function shownStatistics() {
    // a protein-set question with no abundance repeat has its hypergeometric rows under either test
    const rows = D.rows.filter(r => (!S.a || r.analysis === S.a) && (S.m === 'both' || r.method === S.m || (r.method === 'enricher' && (S.m === 'fisher' || !A[r.analysis]?.stratified))) && rowHit(r));
    const col = COLS.find(c => c[0] === S.sort) || COLS[6];
    rows.sort((x, y) => { const a = col[2](x), b = col[2](y); const c = typeof a === 'number' ? a - b : String(a).localeCompare(String(b)); return S.desc ? -c : c; });
    return rows;
  }
  function statistics() {
    const rows = shownStatistics();
    const opts = [['', 'All questions'], ...D.analyses.map(a => [a.id, a.title])];
    return `<div class="page-head"><h2>All tests</h2><button class="btn" type="button" id="dl">Download TSV</button></div>` +
      `<p class="page-sub">One row per class and test. A question about where ${esc(W.marks)} sit compares the ${esc(W.marks)} in a class with the other ${esc(W.residues)} of the same proteins${D.analyses.some(a => a.kind === 'protein_sets') ? `; a question about kinds of protein compares the ${esc(W.marked)} proteins in a set with the other proteins` : ''}. Strata are the proteins of a within-protein test${D.analyses.some(a => a.stratified) ? ', or the abundance deciles of a protein-set test' : ''}. q is Benjamini–Hochberg within each question and test; a class counts as more or less often at q ≤ 0.05 and at least 1.1×. The download keeps the columns of the release’s statistics table.</p>` +
      `<div class="filters"><label>Question <select id="f-a">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === S.a ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` +
      `<label>Test <select id="f-m">${[['mantel_haenszel', 'Within each protein (or abundance decile)'], ['fisher', 'Pooled'], ['both', 'Both']].map(([v, t]) => `<option value="${v}"${v === S.m ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` +
      `<label>Class <input id="f-sq" type="search" value="${esc(S.sq)}" placeholder="a class or set"></label>` +
      `<span class="muted">${int(rows.length)} ${rows.length === 1 ? 'test' : 'tests'}${selOn() ? ' (the whole dataset: the Overview tests your selection)' : ''}</span></div>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr>${COLS.map(([k, t, , n]) => `<th class="${n ? 'num' : ''}" data-sort="${k}"${S.sort === k ? ` aria-sort="${S.desc ? 'descending' : 'ascending'}"` : ''}>${esc(t)}${S.sort === k ? (S.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>` +
      rows.slice(0, S.nStat ||= 200).map(r => `<tr data-i="${r.i}"><td>${esc(r.title)}</td><td class="wrapok" title="${esc(r.help)}">${esc(r.label)}</td><td>${esc(methodName(r))}</td>` +
        `<td class="num">${int(r.a)} / ${int(r.a + r.b)}</td><td class="num">${int(r.c)} / ${int(r.c + r.d)}</td>` +
        `<td class="num">${esc(effText(r))}${r.lo != null ? ` <span class="muted">(${fxn(r.lo)} to ${fxn(r.hi)})</span>` : ''}</td><td class="num">${fq(r.q)}</td>` +
        `<td><span class="dir ${r.dir}">${DIR_WORDS[r.dir]}</span></td><td class="num">${r.strata != null ? int(r.strata) : ''}</td></tr>`).join('') +
      `</tbody></table></div>` +
      (rows.length > S.nStat ? `<p><button class="linkish" type="button" data-stat-more>Show ${int(Math.min(200, rows.length - S.nStat))} more of ${int(rows.length)}</button> <span class="muted">(the download has every row)</span></p>` : '');
  }

  // ---- Method: how the tests work, the data, the parity check, how to cite --------------------------------------------
  function method() {
    const R = D.run, m = R.marks || {}, sn = R.snapshot || {};
    const IN = D.inputs || {};
    // in the site file's order (a role's sources in the order it combines them), the reference last
    const inputs = [...Object.keys(IN).filter(k => (R.inputs || {})[k]).map(k => [k, R.inputs[k]]), ...Object.entries(R.inputs || {}).filter(([k]) => !IN[k])]
      .sort(([a], [b]) => (IN[a]?.use === 'the parity check') - (IN[b]?.use === 'the parity check'))
      .map(([k, v]) => `<tr><td class="wrapok">${esc(IN[k]?.version || k)}</td><td>${esc(IN[k]?.use || '')}</td><td class="wrapok">${esc(hlicence(IN[k]?.licence))}</td><td class="mono">${esc(String(v.file).split('/').pop())}</td><td class="mono">${esc(v.md5)}</td></tr>`).join('');
    const dropped = [m.not_on_snapshot ? `${int(m.not_on_snapshot)} on other sequences (isoforms, unreviewed entries)` : '', m.residue_mismatch ? `${int(m.residue_mismatch)} not on a candidate residue` : ''].filter(Boolean);
    const nPar = R.parity ? R.parity.checked.reduce((n, c) => n + c.rows, 0) : 0;
    const refName = (IN[R.parity?.reference]?.version || R.parity?.reference || '').replace(/\s*\(.*\)$/, '');
    const par = R.parity ? `<section id="m-parity"><h3>Checked against the published release</h3><p>The rebuild recomputes the published tests and compares them, row by row and character by character, with the statistics table of the ${esc(refName)}: ` +
      `<span class="${R.parity.equal ? 'ok' : ''}">${R.parity.equal ? `all ${int(nPar)} rows are identical` : 'some rows differ'}</span>.</p>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Question</th><th>Test</th><th class="num">Rows</th><th>Identical</th></tr></thead><tbody>` +
      R.parity.checked.map(c => `<tr><td>${esc(A[c.analysis]?.title || c.analysis)}${c.reference ? ` <span class="muted">(against ${esc(IN[c.reference]?.version || c.reference)})</span>` : ''}</td><td>${esc(testName(c.analysis, c.method))}</td><td class="num">${int(c.rows)}</td><td>${c.equal ? '<span class="ok">✓</span>' : '✗'}</td></tr>`).join('') +
      '</tbody></table></div>' +
      ((R.parity.new || []).length ? `<p>Not in the release, and so not checked against it: ${R.parity.new.map(id => esc(A[id]?.title || id)).join(', ')}. ${R.parity.new.length === 1 ? 'This question is' : 'These questions are'} new in the rebuild.</p>` : '') +
      '</section>' : '';
    return `<div class="page-head"><h2>Method</h2></div><div class="doc">` +
      `<section id="m-tests"><h3>How the tests work</h3><p>Every question compares the ${esc(W.marks)} with the other ${esc(W.residues)} of the same proteins, class by class: is a ${esc(W.mark)} more or less likely than another ${esc(W.residue)} to sit in a disordered region, a domain, a motif? Each class is tested two ways.</p><ul>` +
      `<li><b>Within each protein</b>, every protein is a stratum, and its ${esc(W.marks)} are compared only with its own ${esc(W.residues)}: a Mantel–Haenszel odds ratio, with its 95% confidence interval (Robins–Breslow–Greenland) and the continuity-corrected Cochran–Mantel–Haenszel test. This separates where ${esc(W.marks)} sit from which proteins were found ${esc(W.marked)}: abundant proteins are detected more often, and they differ in their structure.</li>` +
      `<li><b>Pooled</b>, all the ${esc(W.residues)} of the ${esc(W.marked)} proteins are taken together: Fisher’s exact test, with the Haldane–Anscombe odds ratio.</li></ul>` +
      `<p>Both count the same ${esc(W.marks)}: those on a protein with at least one other ${esc(W.residue)}. q is Benjamini–Hochberg across the classes of a question, for each test. A class counts as more or less often at q ≤ 0.05 and at least 1.1×.</p>` +
      (D.analyses.some(a => a.kind === 'protein_sets') ? `<p><b>Questions about kinds of protein</b> (${esc(D.analyses.filter(a => a.kind === 'protein_sets').map(a => a.title).join(', '))}) count proteins, not residues: the ${esc(W.marked)} proteins in each set against the other proteins of the question’s universe, in a one-sided hypergeometric test as clusterProfiler’s enricher runs it, with the fold enrichment and Benjamini–Hochberg across the sets.${D.analyses.some(a => a.stratified) ? ` ${D.analyses.every(a => a.kind !== 'protein_sets' || a.stratified) ? 'Each is' : 'Those with an abundance input are'} repeated within protein-abundance deciles (a Mantel–Haenszel odds ratio across them), because mass spectrometry finds abundant proteins most often: an enrichment that holds there is not explained by abundance.` : ''}</p>` : '') + `</section>` +
      `<section id="m-data"><h3>Data</h3><p>Sequences: ${esc(sn.release)}, ${int(sn.entries)} entries (FASTA MD5 <span class="mono">${esc(sn.fasta_md5)}</span>). ` +
      `${cap(W.marks)}: ${int(m.counted)} on ${int(m.proteins)} proteins, from ${int(m.selected)} records${dropped.length ? ' (' + dropped.join('; ') + ', left out)' : ''}. Every file below was checked against its MD5 before it was read.</p>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Source</th><th>Used for</th><th>Licence</th><th>File</th><th>MD5</th></tr></thead><tbody>${inputs}</tbody></table></div></section>` +
      `<section id="m-questions"><h3>Questions, and what made each</h3><p>Each question is a layer (built in, made from the site file’s parameters, or a plugin the site trusts, with its package and version) or a protein-set test; the inputs it reads are the roles it names.</p>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Question</th><th>Made by</th><th>Reads</th><th>What it compares</th></tr></thead><tbody>` +
      D.analyses.map(a => `<tr><td>${esc(a.title)}${a.new && D.run.parity ? ' <span class="newtag">new</span>' : ''}</td><td class="wrapok">${esc(madeByText(a.id))}</td><td class="mono wrapok">${esc((a.roles || []).join(', '))}</td><td class="wrapok">${esc(a.describe || a.sub || '')}</td></tr>`).join('') +
      `</tbody></table></div></section>` + D.analyses.map(questionMethod).join('') + (K.methodParts || []).map(f => f()).join('') + K.methods.map(x => x.html()).join('') + par +
      citeSection() + downloadSection() + searchSection() + privacySection() +
      sourcesSection() +
      `<section id="m-made"><h3>How this site is made</h3><p>This site is one file, <span class="mono">${esc(D.site.config)}</span>: which mark, which sequences and regions, which questions, its colours and pictures. ptmcontext ${esc(D.kit.version)} (commit <span class="mono">${esc(shortCommit(D.kit.commit))}</span>) ran it on ${esc(hdate(R.written))}. Its citation, version and date are in <span class="mono">${esc(CIT.file || '')}</span>.</p>` +
      `<p>Every download carries the same block: what it shows and how it was tested, how to cite it and its data sources, the site’s and ptmcontext’s versions, the sequences and inputs it came from, and when and where it was exported. It is printed under each figure and kept in the file itself: the SVG’s metadata, the PNG’s text fields, the PDF’s properties and the TSV’s # lines.</p></section></div>`;
  }

  // a question's own Method section (#method/q-<id>): what it asks, what made it, what it reads, how it is tested,
  // its classes, and whether it equals the published release
  function questionMethod(a) {
    const IN = D.inputs || {}, R = D.run, set = a.kind === 'protein_sets';
    const reads = (a.roles || []).map(r => { const src = Object.values(IN).filter(x => x.role === r || (x.roles || []).includes(r)).map(x => `${x.version || ''}${x.licence ? ` (${hlicence(x.licence)})` : ''}`);
      return `<li><span class="mono">${esc(r)}</span>${src.length ? ': ' + esc(src.join('; ')) : ''}</li>`; }).join('');
    const checked = (R.parity?.checked || []).filter(c => c.analysis === a.id), nRows = checked.reduce((n, c) => n + c.rows, 0);
    const parity = !R.parity ? '' : a.new ? `<p><b>Release:</b> new in the rebuild; not in the published release, so not checked against it.</p>`
      : checked.length ? `<p><b>Release:</b> ${checked.every(c => c.equal) ? `all ${int(nRows)} rows identical to the published release` : 'some rows differ from the published release'} (${checked.map(c => `${esc(testName(a.id, c.method))}: ${int(c.rows)}${c.reference ? `, against ${esc(IN[c.reference]?.version || c.reference)}, not its statistics table` : ''}`).join('; ')}).</p>` : '';
    const labels = Object.entries(a.labels || {}).filter(([c]) => c);
    const classes = labels.length && labels.length <= 40 ? `<details><summary>Its ${set ? 'sets' : 'classes'} (${int(labels.length)})</summary><dl class="qm-classes">${labels.map(([c, l]) => `<dt>${esc(l || c)}</dt><dd>${esc((a.help || {})[c] || '')}</dd>`).join('')}</dl></details>` : '';
    const tests = set ? `the ${esc(W.marked)} proteins in each set against the background (${esc(a.describe || 'the other proteins')}): one-sided hypergeometric test, fold enrichment, q Benjamini–Hochberg over the question's sets${a.stratified ? '; again within protein abundance deciles (Mantel–Haenszel), a check that abundance does not explain it' : ''}`
      : `the ${esc(W.marks)} against the other ${esc(W.residues)} of the same proteins, class by class: within each protein (Mantel–Haenszel, Robins–Breslow–Greenland CI) and pooled (Fisher’s exact test, Haldane–Anscombe odds ratio); q Benjamini–Hochberg over the question's classes`;
    return `<section id="m-q-${esc(a.id)}" class="qm"><h3>${esc(a.title)}${a.new && R.parity ? ' <span class="newtag">new</span>' : ''}</h3>` +
      (a.question ? `<p class="qm-q">${esc(a.question)}</p>` : '') + (a.sub ? `<p>${esc(a.sub)}.</p>` : '') +
      `<p><b>Made by:</b> ${esc(madeByText(a.id))}. <b>Tested:</b> ${tests}.</p>` +
      (reads ? `<p><b>Reads:</b></p><ul class="qm-reads">${reads}</ul>` : '') + parity + classes +
      `<p class="qm-links"><a href="${esc(link('overview', a.id))}">Its figure</a> · <a href="${esc(link('statistics', '', { a: a.id }))}">Its tests</a></p></section>`;
  }

  // ---- citing, and provenance: every export carries the same block -----------------------------------------------------
  const CIT = D.citation || {};
  const EXP_HELP = { pdf: 'PDF: vector, fonts embedded, with its citation and provenance', svg: 'SVG: vector, editable, with its citation and provenance in the file',
    png: 'PNG at 300 dpi, with its citation and provenance in the image and its text fields', tsv: 'TSV: the rows, under # lines saying what they are, how to cite them and where they come from' };
  const shortCommit = c => c ? c.replace(/-dirty$/, '').slice(0, 7) + (c.endsWith('-dirty') ? '+changes' : '') : 'not recorded';
  const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const pageUrl = () => location.href;
  const doiTxt = d => d ? ` doi:${d}` : '';
  function citeText() {
    const parts = [];
    if (CIT.preferred) parts.push(CIT.preferred.text + doiTxt(CIT.preferred.doi));
    (CIT.references || []).forEach(r => parts.push(r.text + doiTxt(r.doi)));
    return parts.join('\n');
  }
  function testWords(m) {
    return (m === 'fisher' ? `Pooled: the ${W.marks} in each class against all the other ${W.residues} of the ${W.marked} proteins together (Fisher’s exact test, two-sided; Haldane–Anscombe odds ratio).`
      : `Compared within each protein: every protein is a stratum, and its ${W.marks} are compared only with its own ${W.residues} (Mantel–Haenszel odds ratio with its 95% confidence interval; continuity-corrected Cochran–Mantel–Haenszel test).`) +
      ` Only ${W.marks} on proteins with another ${W.residue} are counted. q: Benjamini–Hochberg across the classes of the question. Red: more often (q ≤ 0.05 and at least 1.1×); slate: less often; hollow: no significant difference.`;
  }
  function setWords(a) {
    return `One-sided hypergeometric test, as clusterProfiler’s enricher: the ${markedUnits(a.id)} in each set against the ${a.describe || 'other proteins of the universe'}; fold enrichment is the share of ${markedUnits(a.id)} in the set over the share of all ${setUnit(a.id)} in it. q: Benjamini–Hochberg across the sets tested. Within abundance deciles (where shown): the same counts, a Mantel–Haenszel odds ratio across protein-abundance deciles, which asks whether an enrichment holds among proteins of similar abundance.`;
  }
  function provenance(extra = {}) {
    const R = D.run;
    return { site: D.site.name, site_config: D.site.config, version: CIT.version || '', date: CIT.date || '', doi: CIT.doi || '', licence: CIT.licence || '',
      cite: CIT.preferred ? CIT.preferred.text + doiTxt(CIT.preferred.doi) : '', data_sources: (CIT.references || []).map(r => r.text + doiTxt(r.doi)),
      software: `ptmcontext ${D.kit.version}`, commit: D.kit.commit || '', run: R.written, sequences: R.snapshot,
      marks: R.marks, inputs: Object.fromEntries(Object.entries(R.inputs || {}).map(([k, v]) => [k, { file: String(v.file).split('/').pop(), md5: v.md5 }])), roles: R.roles,
      parity: R.parity ? { reference: R.parity.reference, equal: R.parity.equal } : null,
      questions: madeBy(), trusted_plugins: R.trusted_plugins || [],
      selection: selOn() && K.sel.data() ? { text: K.sel.describe(), marks: K.sel.nMarks(), proteins: K.sel.nProteins() } : null,
      exported: stamp(), from: pageUrl(), ...extra };
  }
  // which code made each question: a built-in layer, one made from the site file's parameters, a trusted plugin (with
  // its package and version), or a protein-set test
  function madeBy() {
    return Object.fromEntries(Object.entries(D.run.analyses || {}).map(([aid, x]) => [aid, x.test === 'protein_sets' ? { test: 'protein_sets', sets: x.sets }
      : { layer: x.layer, origin: x.origin, ...(x.with ? { with: x.with } : {}) }]));
  }
  const madeByText = aid => { const x = (D.run.analyses || {})[aid]; if (!x) return ''; return x.test === 'protein_sets' ? `protein-set test of the ${x.sets} input` : `layer ${x.layer} (${x.origin})${x.with ? ', made from the site file’s parameters' : ''}`; };
  function creditLines() {
    const R = D.run, sn = R.snapshot || {};
    const lines = [];
    if (CIT.preferred) lines.push(`Cite: ${CIT.preferred.text}${doiTxt(CIT.preferred.doi)}`);
    if ((CIT.references || []).length) lines.push('Data: ' + CIT.references.map(r => r.short + doiTxt(r.doi)).join('; '));
    lines.push(`${D.site.name}, version ${CIT.version || '–'}${CIT.date ? ' (' + hdate(CIT.date) + ')' : ''} · ptmcontext ${D.kit.version} (${shortCommit(D.kit.commit)}) · ${sn.release || ''}, FASTA MD5 ${String(sn.fasta_md5 || '').slice(0, 12)}… · run on ${hdate(R.written)}`);
    if (selOn() && K.sel.data()) lines.push(`Selection: ${K.sel.describe()} (${K.sel.nMarks()} ${W.marks})`);
    lines.push(`Exported ${htime(stamp())} from ${pageUrl()}${CIT.licence ? ' · licence ' + hlicence(CIT.licence) : ''}`);
    return lines;
  }
  function preamble(title, what) {
    const R = D.run, sn = R.snapshot || {};
    const inputs = Object.entries(R.inputs || {}).map(([k, v]) => `${k} (MD5 ${v.md5})`).join(', ');
    return [`# ${D.site.name}: ${title}`, `# What: ${what}`,
      CIT.preferred ? `# Cite: ${CIT.preferred.text}${doiTxt(CIT.preferred.doi)}` : null,
      (CIT.references || []).length ? '# Data sources: ' + CIT.references.map(r => r.text + doiTxt(r.doi)).join(' | ') : null,
      `# Version: ${CIT.version || '–'}${CIT.date ? ' (' + CIT.date + ')' : ''}${CIT.doi ? ', doi:' + CIT.doi : ''}${CIT.licence ? '; licence ' + CIT.licence : ''}`,
      `# Made with: ptmcontext ${D.kit.version} (commit ${D.kit.commit || 'not recorded'}) from ${D.site.config}; run ${R.written}`,
      `# Sequences: ${sn.release} (${int(sn.entries)} entries, FASTA MD5 ${sn.fasta_md5}); inputs: ${inputs}`,
      `# Questions made by: ${Object.keys(D.run.analyses || {}).map(aid => `${aid}: ${madeByText(aid)}`).join('; ')}${(R.trusted_plugins || []).length ? `; trusted plugins: ${R.trusted_plugins.join(', ')}` : ''}`,
      selOn() && K.sel.data() ? `# Selection: ${K.sel.describe()} (${K.sel.nMarks()} ${W.marks} on ${K.sel.nProteins()} proteins), tested again in the browser` : null,
      `# Exported: ${stamp()} from ${pageUrl()}`].filter(Boolean).join('\n') + '\n';
  }
  const g6 = v => v == null ? '' : String(+Number(v).toPrecision(6));
  // a selection, in words, for the figures and tables made from it
  const selWords = () => (selOn() && K.sel.data() ? `. Your selection: ${K.sel.describe()} (${K.sel.nMarks()} ${K.sel.nMarks() === 1 ? W.mark : W.marks} on ${K.sel.nProteins()} protein${K.sel.nProteins() === 1 ? '' : 's'}), ${vsOn() ? `against ${vsName()} (${METHOD[S.m] || 'pooled'})` : 'tested again'} in the browser; exploratory, not adjusted for the other selections tried` : '');
  function cardTsv(aid, m) {
    const a = A[aid];
    if (a.kind === 'protein_sets') {
      const rows = rowsOf(a, 'enricher').slice().sort((x, y) => x.p - y.p);
      const head = ['set', 'set_id', 'fold_enrichment', 'p', 'q', `${W.marked}_proteins_in_set`, `${W.marked}_proteins`, 'other_proteins_in_set', 'other_proteins', 'odds_ratio_within_abundance_deciles', 'ci_low', 'ci_high', 'q_within_abundance_deciles', 'reading'];
      return preamble(a.title, `${a.question} One row per set tested: ${a.sub}${selWords()}. ${setWords(a)}`) + head.join('\t') + '\n' +
        rows.map(r => { const st = (!r.selection && STRAT[aid + '\u0000' + r.category]) || {}; return [r.label, r.category, g6(r.eff), g6(r.p), g6(r.q), r.a, r.a + r.b, r.c, r.c + r.d, g6(st.eff), g6(st.lo), g6(st.hi), g6(st.q), DIR_WORDS[r.dir]].join('\t'); }).join('\n') + '\n';
    }
    const rows = rowsOf(a, m).slice().sort((x, y) => (y.or ?? -1) - (x.or ?? -1));
    const head = ['class', 'class_code', 'definition', 'test', 'odds_ratio', 'ci_low', 'ci_high', 'p', 'q', `${W.marks.replace(/\W+/g, '_')}_in_class`, `${W.marks.replace(/\W+/g, '_')}_total`, `other_${W.residues.replace(/\W+/g, '_')}_in_class`, `other_${W.residues.replace(/\W+/g, '_')}_total`, 'proteins', 'reading'];
    return preamble(`${a.title}, ${METHOD[m]}`, `${a.question} One row per class: ${a.sub}, ${METHOD_PHRASE[m]}${selWords()}. ${testWords(m)}`) +
      head.join('\t') + '\n' + rows.map(r => [r.label, r.category, r.help, METHOD[r.method] || r.method, g6(r.or), g6(r.lo), g6(r.hi), g6(r.p), g6(r.q), r.a, r.a + r.b, r.c, r.c + r.d, r.strata ?? '', DIR_WORDS[r.dir]].join('\t')).join('\n') + '\n';
  }
  function statisticsTsv(rows) {
    const lines = D.statistics_tsv.replace(/\n$/, '').split('\n');
    return preamble(S.a ? `all tests, ${A[S.a]?.title || S.a}` : 'all tests',
      `the ${rows.length} tests shown${S.sq ? ' for "' + S.sq + '"' : ''}${S.m !== 'both' ? ' (' + METHOD[S.m] + ')' : ''}, in the columns of the release’s statistics table. a and b count the ${W.marks} in and outside the class; c and d the other ${W.residues} of the same proteins in and outside it. ${testWords('mantel_haenszel')} ${testWords('fisher').split(' Only ')[0]}`) +
      lines[0] + '\n' + rows.map(r => lines[r.i + 1]).join('\n') + '\n';
  }

  // ---- a figure: one SVG for every format, with its credit -----------------------------------------------------------
  // every output (figure SVG, PNG and PDF, card and page exports, print) is set in an Arial-like face; the website keeps its own
  const FF = "Arial, 'Helvetica Neue', Helvetica, Arimo, 'Liberation Sans', sans-serif", FFH = FF;
  const PAL = { ink: '#111827', muted: '#5f6f78', line: '#e3e8ea', one: '#8a979e', more: '#b42318', less: '#334155', same: '#8a96a0', ns: '#ffffff', bg: '#ffffff' };
  const mctx = document.createElement('canvas').getContext('2d');
  const tw = (t, size, weight = 400, fam = FF) => { mctx.font = `${weight} ${size}px ${fam}`; return mctx.measureText(t).width; };
  function wrap(text, width, size, weight, fam) {
    const out = []; let cur = '';
    for (const word of String(text).split(/\s+/)) { const t = cur ? cur + ' ' + word : word; if (!cur || tw(t, size, weight, fam) <= width) cur = t; else { out.push(cur); cur = word; } }
    if (cur) out.push(cur); return out;
  }
  // a question's figure for its exports: the chart the page shows (chartModel), drawn as one SVG, with the test and the
  // credit under it
  function figure(aid, m) {
    const a = A[aid], sets = a.kind === 'protein_sets', all = chartRows(a, m), rows = shownOf(a, all), M = chartModel(a, rows, m);
    const Wd = 860, P = 20, LW = 236, C1 = 350, C2 = 442, X0 = 462, X1 = 728, VX = 814, DX = 832, ink2 = '#374151';
    const X = v => X0 + M.axis.X(v) * (X1 - X0), r1 = v => v.toFixed(1);
    const title = a.title, sub = (M.vs ? `${a.title}: your selection against ${vsName()}` : sets ? a.sub : `${a.sub}, ${METHOD_PHRASE[m]}`) + selWords();
    const parts = [], gp = [], rp = [];
    const T = (x, y, t, o = {}, to = parts) => to.push(`<text x="${r1(x)}" y="${r1(y)}" font-size="${o.size || 11.5}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.fam ? ` font-family="${o.fam}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''} fill="${o.fill || PAL.ink}">${o.raw || esc(t)}</text>`);
    // text cut to a width, with an ellipsis
    const fit = (t, w, size) => { if (tw(t, size) <= w) return t; let u = t; while (u.length > 1 && tw(u + '…', size) > w) u = u.slice(0, -1); return u.trimEnd() + '…'; };
    T(P, 30, title, { size: 17, weight: 'bold', fam: FFH });
    const subLines = wrap(sub, Wd - 2 * P, 11.5).slice(0, 5);
    subLines.forEach((t, k) => T(P, 49 + k * 15, t, { size: 11.5, fill: PAL.muted }));
    let y = 49 + subLines.length * 15 + 8;
    // the column heads, as on the page
    const heads = M.cols.map(c => [...wrap(c, 86, 9.5, 700).slice(0, 2), `in ${M.cls} / all`]), hh = Math.max(...heads.map(l => l.length)) * 11;
    heads.forEach((ls, k) => ls.forEach((t, j) => T(k ? C2 : C1, y + hh - (ls.length - 1 - j) * 11, t, { size: 9.5, weight: j === ls.length - 1 ? null : 'bold', anchor: 'end', fill: PAL.muted })));
    T(VX, y + hh, M.valHead, { size: 9.5, weight: 'bold', anchor: 'end', fill: PAL.muted });
    y += hh + 5; parts.push(`<line x1="${P}" x2="${Wd - P}" y1="${y}" y2="${y}" stroke="${PAL.line}"/>`); y += 3;
    const top = y;
    M.items.forEach(it => {
      if (!it.r) {
        y += 5; if (y - 5 > top) rp.push(`<line x1="${P}" x2="${Wd - P}" y1="${y}" y2="${y}" stroke="${PAL.line}"/>`);
        if (it.head) { T(P, y + 14, it.head.toUpperCase(), { size: 9.5, weight: 'bold', fill: PAL.muted, ls: 0.4 }, rp); y += 20; } else y += 3;
        return;
      }
      const r = it.r, d = decile(r);
      // its name (two lines at most), then its meaning where there is room
      let name = wrap(r.label, LW, 11.5);
      if (name.length > 2) name = [name[0], fit(name.slice(1).join(' '), LW, 11.5)];
      const h = Math.max(22, name.length * 14 + 8), yc = y + h / 2;
      name.forEach((t, k) => {
        const last = k === name.length - 1, room = LW - tw(t, 11.5) - tw(' · ', 10.5);
        const help = last && shortHelp(r) && room > 30 ? `<tspan fill="${PAL.muted}" font-size="10.5"> · ${esc(fit(r.help, room, 10.5))}</tspan>` : '';
        T(P, yc + 4 - (name.length - 1) * 7 + k * 14, '', { raw: esc(t) + help }, rp);
      });
      T(C1, yc + 4, `${kfmt(r.a)} / ${kfmt(r.a + r.b)}`, { size: 10.5, anchor: 'end', fill: PAL.muted }, rp);
      T(C2, yc + 4, `${kfmt(r.c)} / ${kfmt(r.c + r.d)}`, { size: 10.5, anchor: 'end', fill: PAL.muted }, rp);
      const col = r.dir === 'more' || r.dir === 'less' || r.dir === 'same' ? PAL[r.dir] : PAL.muted;
      if (r.vs) {
        rp.push(`<line x1="${r1(X(share2(r)))}" x2="${r1(X(share1(r)))}" y1="${yc}" y2="${yc}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/>` +
          `<circle cx="${r1(X(share2(r)))}" cy="${yc}" r="4" fill="${PAL.bg}" stroke="${PAL.muted}" stroke-width="1.5"/><circle cx="${r1(X(share1(r)))}" cy="${yc}" r="4.6" fill="${col}" stroke="${PAL.bg}" stroke-width="1.5"/>`);
      } else if (r.eff != null) {
        const a1 = X(1), a2 = X(r.eff), ns = r.dir === 'ns';
        rp.push(`<rect x="${r1(Math.min(a1, a2))}" y="${yc - 5}" width="${r1(Math.max(1, Math.abs(a2 - a1)))}" height="10" rx="1.5" fill="${ns ? PAL.bg : col}" stroke="${col}" stroke-width="${ns ? 1.2 : 0}"/>`);
        if (r.lo != null && r.hi != null) rp.push(`<line x1="${r1(X(r.lo))}" x2="${r1(X(r.hi))}" y1="${yc}" y2="${yc}" stroke="${ink2}" stroke-width="1.2"/>` + [r.lo, r.hi].map(v => `<line x1="${r1(X(v))}" x2="${r1(X(v))}" y1="${yc - 3}" y2="${yc + 3}" stroke="${ink2}" stroke-width="1.2"/>`).join(''));
      }
      if (r.ref) rp.push(`<line x1="${r1(X(r.ref.eff))}" x2="${r1(X(r.ref.eff))}" y1="${yc - 9}" y2="${yc + 9}" stroke="${PAL.ink}" stroke-width="2"/>`);
      const strong = !r.vs && (r.dir === 'more' || r.dir === 'less');
      T(VX, yc + 4, valText(r), { size: 11, anchor: 'end', weight: strong ? 'bold' : null, fill: strong ? PAL[r.dir] : PAL.muted }, rp);
      if (d) T(DX, yc + 4, DECILE[d.dir][0], { size: 11, anchor: 'middle', fill: d.dir === 'more' ? PAL.more : d.dir === 'less' ? PAL.less : PAL.muted }, rp);
      y += h;
    });
    M.axis.ticks.forEach(t => gp.push(`<line x1="${r1(X0 + t.x * (X1 - X0))}" x2="${r1(X0 + t.x * (X1 - X0))}" y1="${top}" y2="${y + 2}" stroke="${M.axis.log && t.lab === '1×' ? PAL.one : PAL.line}" stroke-width="${M.axis.log && t.lab === '1×' ? 1.2 : 1}"/>`));
    parts.push(...gp, ...rp);
    M.axis.ticks.forEach(t => T(X0 + t.x * (X1 - X0), y + 15, t.lab, { size: 10, anchor: 'middle', fill: PAL.muted }));
    y += 15;
    wrap(M.axisTitle, X1 - X0 + 150, 10.5).forEach(t => { y += 14; T((X0 + X1) / 2, y, t, { size: 10.5, anchor: 'middle', fill: PAL.muted }); });
    // the legend, as under the page's chart
    y += 20; let lx = P;
    const sw = { more: x => `<rect x="${x}" y="${y - 8}" width="16" height="8" rx="1.5" fill="${PAL.more}"/>`, less: x => `<rect x="${x}" y="${y - 8}" width="16" height="8" rx="1.5" fill="${PAL.less}"/>`,
      same: x => `<rect x="${x}" y="${y - 8}" width="16" height="8" rx="1.5" fill="${PAL.same}"/>`, ns: x => `<rect x="${x}" y="${y - 8}" width="16" height="8" rx="1.5" fill="${PAL.bg}" stroke="${PAL.muted}" stroke-width="1.2"/>`,
      ci: x => `<line x1="${x}" x2="${x + 16}" y1="${y - 4}" y2="${y - 4}" stroke="${ink2}" stroke-width="1.2"/><line x1="${x}" x2="${x}" y1="${y - 7}" y2="${y - 1}" stroke="${ink2}" stroke-width="1.2"/><line x1="${x + 16}" x2="${x + 16}" y1="${y - 7}" y2="${y - 1}" stroke="${ink2}" stroke-width="1.2"/>`,
      ref: x => `<line x1="${x + 8}" x2="${x + 8}" y1="${y - 11}" y2="${y + 2}" stroke="${PAL.ink}" stroke-width="2"/>`,
      sel: x => `<circle cx="${x + 8}" cy="${y - 4}" r="4.5" fill="${PAL.more}"/>`, other: x => `<circle cx="${x + 8}" cy="${y - 4}" r="4.5" fill="${PAL.bg}" stroke="${PAL.muted}" stroke-width="1.4"/>` };
    M.legend.forEach(([k, text]) => {
      const w = (sw[k] ? 22 : 0) + tw(text, 10) + 16;
      if (lx > P && lx + w > Wd - P) { lx = P; y += 16; }
      if (sw[k]) parts.push(sw[k](lx));
      T(lx + (sw[k] ? 22 : 0), y, text, { size: 10, fill: PAL.muted }); lx += w;
    });
    y += 24;
    const note = M.vs ? `Your selection against ${vsName()}: ${sets ? 'the share of its proteins in each set against that of the other proteins, one-sided hypergeometric test' : `the share of its ${W.marks} in each class against that of the others, ${METHOD_PHRASE[vsMethod(m)] || 'pooled'}`}; q Benjamini–Hochberg across the ${sets ? 'sets' : 'classes'}. Exploratory.`
      : sets ? setWords(a) + (rows.length < all.length ? ` Shown: the first ${rows.length} of the ${int(all.length)} sets tested, in the page’s order; the TSV has every set.` : '') : testWords(m);
    wrap(note, Wd - 2 * P, 10.5).forEach(t => { T(P, y, t, { size: 10.5 }); y += 14; });
    y += 6;
    creditLines().forEach(line => wrap(line, Wd - 2 * P, 9.5).forEach(t => { T(P, y, t, { size: 9.5, fill: PAL.muted }); y += 12.5; }));
    const H = Math.ceil(y + P - 6);
    const desc = `${title}: ${a.question} ${sub}. ${note} ${creditLines().join(' ')}`;
    const meta = JSON.stringify(provenance({ figure: title, analysis: aid, test: m }));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}" font-family="${FF}">` +
      `<title>${esc(title)}</title><desc>${esc(desc)}</desc><metadata id="ptmcontext-provenance">${esc(meta)}</metadata>` +
      `<rect width="${Wd}" height="${H}" fill="${PAL.bg}"/>${parts.join('')}</svg>`;
    return { svg, W: Wd, H, title, desc, meta };
  }
  // a tile's figure for its exports: the tile as it shows (its rows, the line under them, the whole dataset's)
  function tileFigure(card) {
    const { a, shown, foot, whole, made } = tileState(card), title = card.title || a.title;
    const Wd = 560, P = 20, LW = 230, X0 = 262, X1 = 470, VX = Wd - P, parts = [];
    const T = (x, y, t, o = {}) => parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 11}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || PAL.ink}">${esc(t)}</text>`);
    const vs = shown.some(r => r.vs), sc = vs ? shareAxis(shown) : tileScale(shown), X = v => X0 + sc.X(v) * (X1 - X0);
    let y = 0;
    shown.forEach(r => {
      const lab = wrap(r.label, LW, 11).slice(0, 2), h = Math.max(22, lab.length * 13 + 8), yc = y + h / 2;
      lab.forEach((t, k) => T(P, yc + 4 - (lab.length - 1) * 6.5 + k * 13, t));
      const col = r.dir === 'more' || r.dir === 'less' || r.dir === 'same' ? PAL[r.dir] : PAL.muted;
      if (vs) {
        parts.push(`<line x1="${X0}" x2="${X1}" y1="${yc}" y2="${yc}" stroke="${PAL.line}"/><line x1="${X(share2(r)).toFixed(1)}" x2="${X(share1(r)).toFixed(1)}" y1="${yc}" y2="${yc}" stroke="${col}" stroke-width="1.6"/>` +
          `<circle cx="${X(share2(r)).toFixed(1)}" cy="${yc}" r="4" fill="${PAL.bg}" stroke="${PAL.muted}" stroke-width="1.5"/><circle cx="${X(share1(r)).toFixed(1)}" cy="${yc}" r="4.6" fill="${col}" stroke="${PAL.bg}" stroke-width="1.5"/>`);
      } else {
        sc.grid.forEach(k => parts.push(`<line x1="${X(2 ** k).toFixed(1)}" x2="${X(2 ** k).toFixed(1)}" y1="${y}" y2="${y + h}" stroke="${k === 0 ? PAL.ink : PAL.one}" stroke-width="1"${k === 0 ? '' : ' stroke-dasharray="2 3"'}/>`));
        if (r.lo != null && r.hi != null) parts.push(`<line x1="${X(r.lo).toFixed(1)}" x2="${X(r.hi).toFixed(1)}" y1="${yc}" y2="${yc}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/>`);
        parts.push(`<circle cx="${X(r.eff).toFixed(1)}" cy="${yc}" r="4.6" fill="${r.dir === 'ns' ? PAL.bg : col}" stroke="${r.dir === 'ns' ? PAL.muted : PAL.bg}" stroke-width="1.5"/>`);
        if (r.ref) parts.push(`<line x1="${X(r.ref.eff).toFixed(1)}" x2="${X(r.ref.eff).toFixed(1)}" y1="${yc - 7}" y2="${yc + 7}" stroke="${PAL.ink}" stroke-width="2"/>`);
      }
      const strong = !vs && (r.dir === 'more' || r.dir === 'less');
      T(VX, yc + 4, vs ? `${pcS(share1(r))} · ${pcS(share2(r))}` : fx(r.eff), { anchor: 'end', weight: strong ? 'bold' : null, fill: strong ? PAL[r.dir] : PAL.muted });
      y += h;
    });
    if (shown.length) { parts.push(`<line x1="${X0}" x2="${X1}" y1="${y + 1}" y2="${y + 1}" stroke="${PAL.line}"/>`); T(vs ? X1 : X(1), y + 14, vs ? sc.ticks[sc.ticks.length - 1].lab : '1×', { size: 10, anchor: 'middle', fill: PAL.muted }); y += 18; }
    const plain = t => String(t || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
    const note = [made ? '' : plain(foot), whole ? 'Whole dataset: ' + plain(answer(whole)) : '', made ? plain(foot) : '',
      shown.some(r => r.ref) ? 'Tick: the whole dataset’s value.' : '', vs ? '' : SETS(a.id) ? setWords(a) : testWords(S.m)].filter(Boolean).join(' ');
    return figureFrame({ title, sub: (a.question || a.describe || '') + selWords(), W: Wd, body: parts.join(''), bodyH: y, note,
      legend: vs ? [[PAL.more, PAL.more, 'your selection'], [PAL.bg, PAL.muted, vsName()]] : ['more', 'less', 'same', 'ns'].map(k => [PAL[k], k === 'ns' ? PAL.muted : PAL[k], DIR_WORDS[k]]),
      extra: { analysis: a.id, test: S.m, tile: true } });
  }


  // ---- PNG at 300 dpi, fonts embedded, with text fields; PDF with fonts and properties --------------------------------
  // Arimo (Arial's metric twin) for a PNG drawn where Arial is missing, and embedded in every PDF; DejaVu Sans only for
  // the few characters Arimo lacks (✓ ▸ ◂), fetched only for a figure that has them
  const FONT_FILES = {
    'Arimo|400': 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/arimo@0.4.1/400Regular/Arimo_400Regular.ttf',
    'Arimo|700': 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/arimo@0.4.1/700Bold/Arimo_700Bold.ttf',
  };
  const DEJAVU = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf', NOT_IN_ARIMO = /([\u2713\u25B8\u25C2])/;
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const SVG2PDF = 'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.4/dist/svg2pdf.umd.min.js';
  const fontCache = {};
  const b64 = buf => { const u = new Uint8Array(buf); let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
  const fontB64 = key => (fontCache[key] ||= fetch(FONT_FILES[key] || key).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('font ' + key))).then(b64).catch(e => { delete fontCache[key]; throw e; }));
  async function embedFonts(svg) {
    try {
      const faces = await Promise.all(Object.keys(FONT_FILES).map(async k => { const [fam, w] = k.split('|'); return `@font-face{font-family:'${fam}';font-weight:${w === '700' ? 'bold' : w};src:url(data:font/ttf;base64,${await fontB64(k)}) format('truetype');}`; }));
      return svg.replace(/(<svg[^>]*>)/, `$1<defs><style>${faces.join('')}</style></defs>`);
    } catch (err) { return svg; }   // offline: the figure falls back to Arial
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const cat = arrs => { const n = arrs.reduce((s, a) => s + a.length, 0), o = new Uint8Array(n); let k = 0; arrs.forEach(a => { o.set(a, k); k += a.length; }); return o; };
  function pngChunk(type, data) {
    const td = cat([new TextEncoder().encode(type), data]), o = new Uint8Array(12 + data.length), dv = new DataView(o.buffer);
    dv.setUint32(0, data.length); o.set(td, 4); dv.setUint32(8 + data.length, crc32(td)); return o;
  }
  const itxt = (key, text) => pngChunk('iTXt', cat([new TextEncoder().encode(key), new Uint8Array([0, 0, 0, 0, 0]), new TextEncoder().encode(text)]));
  function phys(dpi) { const d = new Uint8Array(9), dv = new DataView(d.buffer), ppm = Math.round(dpi / 0.0254); dv.setUint32(0, ppm); dv.setUint32(4, ppm); d[8] = 1; return pngChunk('pHYs', d); }
  async function pngWithText(blob, dpi, fields) {
    const u = new Uint8Array(await blob.arrayBuffer()), ihdrEnd = 8 + 25;
    const extra = [phys(dpi), ...Object.entries(fields).map(([k, v]) => itxt(k, v))];
    return new Blob([u.slice(0, ihdrEnd), ...extra, u.slice(ihdrEnd)], { type: 'image/png' });
  }
  async function pngExport(f, name) {
    // a figure may set its print width (f.mm) and resolution (f.dpi): the PNG is then that many dots across that width
    const dpi = f.dpi || 300, scale = f.mm ? (f.mm / 25.4 * dpi) / f.W : dpi / 96, svg = await embedFonts(f.svg);
    const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error('The figure could not be drawn as a PNG; save it as SVG.')); img.src = url; });
    const c = document.createElement('canvas'); c.width = Math.round(f.W * scale); c.height = Math.round(f.H * scale);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
    const P = JSON.parse(f.meta);
    download(name + '.png', await pngWithText(blob, dpi, { Title: f.title, Description: f.desc, Author: D.site.lab || D.site.name,
      Copyright: CIT.licence || '', Source: P.from, Software: `${P.software} (${P.commit || 'commit not recorded'})`, 'Creation Time': P.exported,
      Comment: citeText(), provenance: f.meta }));
  }
  const loadScript = src => new Promise((ok, fail) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = Object.assign(document.createElement('script'), { src, onload: ok, onerror: () => fail(new Error('could not load ' + src)) });
    document.head.appendChild(s);
  });
  // a vector PDF of the figure's SVG, its text in Arimo (monospace in Courier, so residues still line up; weights as
  // regular or bold, the font's two cuts); where the vector drawing fails, the figure as a 3x PNG on a page of its size
  async function pdfExport(f, name) {
    await loadScript(JSPDF);
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: [f.W * 0.75, f.H * 0.75], orientation: f.W >= f.H ? 'l' : 'p', compress: true });
    pdf.setProperties({ title: f.title, subject: f.desc, author: D.site.lab || D.site.name, keywords: `${D.mark}, ${f.title}, ${CIT.version || ''}`,
      creator: `ptmcontext ${D.kit.version} (${D.kit.commit || 'commit not recorded'})` });
    const holder = document.createElement('div'); holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${f.W}px;height:${f.H}px;overflow:hidden`;
    holder.innerHTML = f.svg.replace(/<metadata[\s\S]*?<\/metadata>/, ''); document.body.appendChild(holder);
    try {
      await loadScript(SVG2PDF);
      const svgEl = holder.firstElementChild;
      try {
        const [regular, bold] = await Promise.all([fontB64('Arimo|400'), fontB64('Arimo|700')]);
        pdf.addFileToVFS('Arimo-Regular.ttf', regular); pdf.addFont('Arimo-Regular.ttf', 'Arimo', 'normal');
        pdf.addFileToVFS('Arimo-Bold.ttf', bold); pdf.addFont('Arimo-Bold.ttf', 'Arimo', 'bold');
        const mono = v => /mono|courier|consolas|menlo/i.test(v || '');
        [svgEl, ...svgEl.querySelectorAll('[font-family], [style], text, tspan')].forEach(n => {
          const fam = n.getAttribute('font-family') || n.style?.fontFamily, to = mono(fam) ? 'courier' : 'Arimo';
          if (mono(fam) || n === svgEl || n.hasAttribute('font-family')) n.setAttribute('font-family', to);
          if (n.style?.fontFamily) n.style.fontFamily = to;
        });
        svgEl.querySelectorAll('style').forEach(st => { st.textContent = st.textContent.replace(/font-family\s*:([^;}]+)/g, (m0, fam) => 'font-family: ' + (mono(fam) ? 'courier' : 'Arimo')); });
        const walk = document.createTreeWalker(svgEl, NodeFilter.SHOW_TEXT), lack = [];
        while (walk.nextNode()) if (NOT_IN_ARIMO.test(walk.currentNode.nodeValue) && !walk.currentNode.parentNode.closest('style')) lack.push(walk.currentNode);
        if (lack.length) {
          const dejavu = await fontB64(DEJAVU);
          pdf.addFileToVFS('DejaVuSans.ttf', dejavu); pdf.addFont('DejaVuSans.ttf', 'DejaVu Sans', 'normal'); pdf.addFont('DejaVuSans.ttf', 'DejaVu Sans', 'bold');
          lack.forEach(t => {
            const frag = document.createDocumentFragment();
            t.nodeValue.split(NOT_IN_ARIMO).forEach(part => {
              if (!part) return;
              if (!NOT_IN_ARIMO.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
              const sp = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); sp.setAttribute('font-family', 'DejaVu Sans'); sp.textContent = part; frag.appendChild(sp);
            });
            t.parentNode.replaceChild(frag, t);
          });
        }
        const wt = w => (/bold|[6-9]00/.test(String(w)) ? 'bold' : 'normal');
        svgEl.querySelectorAll('[font-weight], [style]').forEach(n => { if (n.hasAttribute('font-weight')) n.setAttribute('font-weight', wt(n.getAttribute('font-weight'))); if (n.style?.fontWeight) n.style.fontWeight = wt(n.style.fontWeight); });
      } catch (err) { /* offline: the standard Helvetica */ }
      await window.svg2pdf.svg2pdf(svgEl, pdf, { x: 0, y: 0, width: f.W * 0.75, height: f.H * 0.75 });
    } catch (err) {
      const svg = await embedFonts(f.svg), img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error('The figure could not be drawn; save it as SVG.')); img.src = url; });
      const c = document.createElement('canvas'); c.width = f.W * 3; c.height = f.H * 3; const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, f.W * 0.75, f.H * 0.75);
    } finally { holder.remove(); }
    download(name + '.pdf', pdf.output('blob'));
  }
  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob), a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function exportCard(kind, aid, btn) {
    const name = `${D.site.id}_${aid}${SETS(aid) ? '' : '_' + (S.m === 'fisher' ? 'pooled' : 'within_protein')}${selOn() ? '_selection' : ''}`;
    const old = btn.textContent; btn.disabled = true; btn.textContent = '…';
    try {
      if (kind === 'tsv') download(name + '.tsv', cardTsv(aid, S.m), 'text/tab-separated-values');
      else { const f = figure(aid, S.m); if (kind === 'svg') download(name + '.svg', f.svg, 'image/svg+xml'); else if (kind === 'png') await pngExport(f, name); else await pdfExport(f, name); }
    } catch (err) { alert((err && err.message) || 'The download failed.'); } finally { btn.disabled = false; btn.textContent = old; }
  }
  function copyText(text, btn) {
    const done = ok => { const old = btn.textContent; btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { btn.textContent = old; }, 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else done(false);
  }
  function sourcesSection() {
    const SP = D.attribute_specs || {}, SD = K.sel?.data();
    return Object.entries(SP).filter(([, s]) => s.kind === 'list' && s.link).map(([name, s]) => {
      if (!SD) return `<section id="m-sources"><h3>${esc(s.label)}</h3><p class="muted">Loading…</p></section>`;
      const ti = (SD.attribute_names || []).indexOf(name), vals = SD.attributes[name], n = vals.map(() => 0);
      SD.marks.forEach(m => m[3][ti].forEach(c => { n[c]++; }));
      const links = SD.attribute_links?.[name] || {};
      const rows = vals.map((v, k) => [v, n[k]]).filter(([v]) => v).sort((x, y) => y[1] - x[1]);
      return `<section id="m-sources"><h3>${esc(s.label)}</h3><p>The ${int(rows.length)} ${esc(s.label.toLowerCase())} that report the ${esc(W.marks)}, with how many ${esc(W.marks)} each reports. ${esc(s.help || '')} Please cite those whose ${esc(W.marks)} you use.</p>` +
        `<div class="tbl-card"><table class="tbl"><thead><tr><th>${esc(s.label)}</th><th class="num">${esc(cap(W.marks))}</th><th>Reference</th></tr></thead><tbody>` +
        rows.map(([v, k]) => `<tr><td>${esc((s.values || {})[v] || v)}</td><td class="num">${int(k)}</td><td>${links[v] ? `<a href="${esc(s.link.url.replace('{}', links[v]))}">${esc(links[v])}</a>` : ''}</td></tr>`).join('') + '</tbody></table></div></section>';
    }).join('');
  }
  function citeSection() {
    if (!CIT.version) return '';
    return `<section id="m-cite"><h3>How to cite</h3>` +
      (CIT.preferred ? `<p>Please cite <b>${esc(CIT.preferred.text)}</b>${CIT.preferred.doi ? ` <a href="https://doi.org/${esc(CIT.preferred.doi)}">doi:${esc(CIT.preferred.doi)}</a>` : ''}</p>` : '') +
      ((CIT.references || []).length ? `<p>${CIT.preferred ? 'and the' : 'Please cite the'} original data sources${Object.values(D.attribute_specs || {}).some(x => x.kind === 'list' && x.link) ? ` (and the ${esc(Object.values(D.attribute_specs).find(x => x.kind === 'list' && x.link).label.toLowerCase())} <a href="#method/sources">listed under Sources</a> whose ${esc(W.marks)} you use)` : ''}:</p><ul>${CIT.references.map(r => `<li>${esc(r.text)}${r.doi ? ` <a href="https://doi.org/${esc(r.doi)}">doi:${esc(r.doi)}</a>` : ''}</li>`).join('')}</ul>` : '') +
      `<p class="muted">This site: ${esc(CIT.title)}, version ${esc(CIT.version)}${CIT.date ? ' (' + esc(hdate(CIT.date)) + ')' : ''}${CIT.doi ? `, <a href="https://doi.org/${esc(CIT.doi)}">doi:${esc(CIT.doi)}</a>` : ''}${CIT.licence ? '; licence ' + esc(hlicence(CIT.licence)) : ''}.</p>` +
      `<p><button class="btn" type="button" id="copy-cite">Copy citations</button> <button class="btn" type="button" id="dl-cff">Download CITATION.cff</button></p></section>`;
  }

  // ---- a figure frame for modules: title, subtitle, legend, the module's drawing, a note and the credit, as figure() ---
  function figureFrame({ title, sub = '', legend = [], body = '', bodyH = 0, note = '', W: Wd = 760, extra = {} }) {
    const P = 20, parts = [];
    const T = (x, y, t, o = {}) => parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 11.5}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.fam ? ` font-family="${o.fam}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || PAL.ink}">${esc(t)}</text>`);
    T(P, 30, title, { size: 17, weight: 'bold', fam: FFH });
    let y = 49;
    wrap(sub, Wd - 2 * P, 11.5).slice(0, 2).forEach(t => { T(P, y, t, { size: 11.5, fill: PAL.muted }); y += 15; });
    if (legend.length) {
      let lx = P; y += 4;
      legend.forEach(([fill, stroke, text]) => { parts.push(`<circle cx="${lx + 5}" cy="${y - 4}" r="4.5" fill="${fill}" stroke="${stroke || fill}" stroke-width="1.4"/>`); T(lx + 14, y, text, { size: 10.5, fill: PAL.muted }); lx += 22 + tw(text, 10.5); });
      y += 10;
    }
    parts.push(`<g transform="translate(0,${y})">${body}</g>`); y += bodyH + 14;
    if (note) { wrap(note, Wd - 2 * P, 10.5).forEach(t => { T(P, y, t, { size: 10.5 }); y += 14; }); y += 6; }
    creditLines().forEach(line => wrap(line, Wd - 2 * P, 9.5).forEach(t => { T(P, y, t, { size: 9.5, fill: PAL.muted }); y += 12.5; }));
    const H = Math.ceil(y + P - 6), desc = `${title}. ${sub}. ${note} ${creditLines().join(' ')}`;
    const meta = JSON.stringify(provenance({ figure: title, ...extra }));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}" font-family="${FF}">` +
      `<title>${esc(title)}</title><desc>${esc(desc)}</desc><metadata id="ptmcontext-provenance">${esc(meta)}</metadata>` +
      `<rect width="${Wd}" height="${H}" fill="${PAL.bg}"/>${parts.join('')}</svg>`;
    return { svg, W: Wd, H, title, desc, meta };
  }
  async function exportFigure(kind, make, name, btn, tsv) {
    const old = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      if (kind === 'tsv') download(name + '.tsv', tsv(), 'text/tab-separated-values');
      else { const f = make(); if (kind === 'svg') download(name + '.svg', f.svg, 'image/svg+xml'); else if (kind === 'png') await pngExport(f, name); else await pdfExport(f, name); }
    } catch (err) { alert((err && err.message) || 'The download failed.'); } finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }
  // the export buttons of a card, and its Method link (the question's own section, or a section of the Method page)
  const methodLink = (aid, sec) => `<a class="exp-btn" href="${esc(link('method', aid ? 'q-' + aid : sec || ''))}" title="How ${aid ? 'this question was' : 'these were'} made and tested, and from what data">Method</a>`;
  const expBar = (kinds, attrs, label, method) => `<div class="exp" role="group" aria-label="Download ${esc(label)}">${kinds.map(k => `<button type="button" class="exp-btn" data-${attrs}="${k}" title="${EXP_HELP[k]}">${k.toUpperCase()}</button>`).join('')}${method ? methodLink(A[method] ? method : '', A[method] ? '' : method) : ''}</div>`;
  Object.assign(K, { CIT, PAL, FF, FFH, tw, wrap, figureFrame, exportFigure, expBar, preamble, creditLines, provenance, download, hdate, htime, hlicence, shortCommit, testWords, PADJ, MIN_EFFECT, dir, selOn, vsOn });
  // for modules that draw a question's card their own way (kit-questions.js)
  Object.assign(K, { cardBody, chartRows, chartModel, chartHtml, rowsOf, rowsFor, fkeyOf, allCards, cardOf, byOrder, methodLink, setWords, selWords, EXP_HELP, g6 });

  // ---- render, events ------------------------------------------------------------------------------------------------
  let qPending = false;                                 // the search box holds letters not yet read
  function render() {
    tabs();
    if (!qPending) $('#q').value = S.q;                // not over letters typed while the page was drawn (data arriving)
    $('#q-clear').hidden = !S.q;
    scope();
    const mod = K.views[S.view];
    $('#view').innerHTML = mod ? mod.render(S.arg) : S.view === 'statistics' ? statistics() : S.view === 'method' ? method() : overview();
    document.title = S.view === 'overview' ? D.site.name : `${mod?.title ? mod.title(S.arg) : cap(S.view)} · ${D.site.name}`;   // the page first: "FUS R216 · <site>"
    document.body.classList.toggle('slim', S.view !== 'overview');      // the header band in full on the Overview only
    if (mod?.after) mod.after(S.arg);
    if (S.view === 'method' && S.arg) document.getElementById('m-' + S.arg)?.scrollIntoView({ block: 'start' });
    K.rail?.();
    (K.afterRender || []).forEach(f => f());         // the modules' own touches after a page is drawn (kit-search.js)
  }
  const tip = $('#tip');
  function showTip(e, r) {
    const selNote = (r.selection ? `<br><span class="muted">Your selection, tested again in the browser${r.descriptive ? ': shown, not tested' : ' (exploratory)'}</span>` : '') +
      (r.ref && !r.vs ? `<br><span class="muted">Whole dataset: ${esc(effText(r.ref))}${r.ref.lo != null ? ` (95% CI ${fxn(r.ref.lo)}–${fxn(r.ref.hi)})` : ''}, q ${fq(r.ref.q)} (tick)</span>` : '');
    if (r.vs) {
      const set = SETS(r.analysis), unit = set ? setUnit(r.analysis) : W.marks;
      tip.innerHTML = `<b>${esc(r.label)}</b>${r.help ? `<br><span class="muted">${esc(r.help)}</span>` : ''}<br>${int(r.a)} of ${int(r.a + r.b)} ${esc(unit)} of your selection (${pct(r.a, r.a + r.b)}) against ${int(r.c)} of ${int(r.c + r.d)} ${set ? (S.vs === 'cmp' ? esc(setUnit(r.analysis)) + ' of ' + esc(cmpName()) : 'other ' + esc(markedUnits(r.analysis))) : esc(vsName())} (${pct(r.c, r.c + r.d)})` +
        `<br>${set && S.vs !== 'cmp' ? `${fxn(r.fold)}-fold (one-sided hypergeometric over the ${esc(W.marked)} proteins)` : `OR ${fxn(r.or)}${r.lo != null ? ` (95% CI ${fxn(r.lo)} to ${fxn(r.hi)})` : ''} · ${set ? 'pooled' : METHOD[r.method] || esc(r.method)}${r.strata ? `, ${int(r.strata)} informative ${r.method === 'study' ? 'groups of sources' : 'proteins'}` : ''}`}, q ${fq(r.q)}` + selNote;
    } else if (SETS(r.analysis)) {
      const st = STRAT[r.analysis + '\u0000' + r.category];
      tip.innerHTML = `<b>${esc(r.label)}</b><br>${int(r.a)} of ${int(r.a + r.b)} ${r.selection ? esc(setUnit(r.analysis)) + ' of your selection' : esc(markedUnits(r.analysis))} (${pct(r.a, r.a + r.b)}) vs ${int(r.c)} of ${int(r.c + r.d)} other ${esc(setUnit(r.analysis))} (${pct(r.c, r.c + r.d)})` +
        `<br>${fxn(r.eff)}-fold, q ${fq(r.q)} (one-sided hypergeometric)` +
        (st && !r.selection ? `<br>Within abundance deciles: OR ${fxn(st.eff)}${st.lo != null ? ` (95% CI ${fxn(st.lo)}–${fxn(st.hi)})` : ''}, q ${fq(st.q)}${decile(r) ? ` (${DECILE[st.dir][0]} ${DECILE[st.dir][1]})` : ''}` : '') + selNote;
    } else tip.innerHTML = `<b>${esc(r.label)}</b>${r.help ? `<br><span class="muted">${esc(r.help)}</span>` : ''}` +
      `<br>${int(r.a)} of ${int(r.a + r.b)} ${esc(W.marks)} (${pct(r.a, r.a + r.b)}) vs ${int(r.c)} of ${int(r.c + r.d)} other ${esc(W.residues)} (${pct(r.c, r.c + r.d)})` +
      (r.or == null ? `<br>No test ${METHOD[r.method] || esc(r.method)}: no protein has ${esc(W.residues)} both in this class and outside it` :
        `<br>OR ${fxn(r.or)}${r.lo != null ? ` (95% CI ${fxn(r.lo)}–${fxn(r.hi)})` : ''}, q ${fq(r.q)} · ${METHOD[r.method] || esc(r.method)}${r.strata != null && r.method === 'mantel_haenszel' ? `, ${int(r.strata)} informative proteins` : ''}`) +
      (r.dir === 'same' ? '<br>Significant, but within 1.1× either way: about the same' : '') + selNote;
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + 'px';
  }
  function placeTip(e) {
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + 'px';
  }
  document.addEventListener('mousemove', e => {
    const el = e.target.closest('.drow,.trow');
    if (el && REG[+el.dataset.r]) { showTip(e, REG[+el.dataset.r]); return; }
    const sr = e.target.closest('tr[data-i]');
    if (sr && S.view === 'statistics') { showTip(e, D.rows[+sr.dataset.i]); return; }
    for (const [sel, fn] of K.tips) { const t = e.target.closest(sel); if (t) { const h = fn(t); if (h) { tip.innerHTML = h; placeTip(e); return; } } }
    tip.hidden = true;
  });
  document.addEventListener('click', e => {
    for (const [sel, fn] of K.clicks) { const el = e.target.closest(sel); if (el) { fn(el, e); return; } }
    const tl = e.target.closest('.tile[data-tile]');
    if (tl && !e.target.closest('a,button')) { go('overview', { arg: tl.dataset.tile }); return; }
    const t = e.target.closest('[data-go],[data-try],[data-m],[data-vs],th[data-sort],#dl,#dl-cff,#copy-cite,#how,[data-all],[data-exp],[data-theme-choice],[data-stat-more],[data-skip]');
    if (!t) return;
    if (t.dataset.go) { const [v, ...rest] = t.dataset.go.split('/'); go(v, { arg: rest.join('/') }); }
    else if (t.dataset.try) { S.q = t.dataset.try; if (!openIfOne()) { writeHash(true); render(); } }
    else if (t.dataset.m) { S.m = t.dataset.m; writeHash(false); render(); }
    else if (t.dataset.vs) { S.vs = t.dataset.vs; if (S.vs === 'residues' && S.m === 'study') S.m = 'mantel_haenszel'; if (S.vs === 'residues' && A[S.arg]?.kind === 'attribute') S.arg = ''; writeHash(true); render(); }
    else if ('statMore' in t.dataset) { S.nStat += 200; render(); }
    else if ('skip' in t.dataset) { const v = $('#view'); v.setAttribute('tabindex', '-1'); v.focus(); v.scrollIntoView({ block: 'start' }); }
    else if (t.dataset.sort) { S.desc = S.sort === t.dataset.sort ? !S.desc : t.dataset.sort !== 'q'; S.sort = t.dataset.sort; S.nStat = 200; writeHash(false); render(); }
    else if (t.id === 'dl') download(`${D.site.id}_statistics${S.a ? '_' + S.a : ''}.tsv`, statisticsTsv(shownStatistics()), 'text/tab-separated-values');
    else if (t.dataset.exp) exportCard(t.dataset.exp, t.dataset.aid, t);
    else if (t.id === 'how') { S.how = !S.how; render(); }
    else if (t.dataset.all) { const k = t.dataset.all; if (S.all.has(k)) S.all.delete(k); else S.all.add(k); render(); }
    else if (t.id === 'dl-cff') download('CITATION.cff', CIT.cff || '', 'text/yaml');
    else if (t.id === 'copy-cite') copyText(citeText(), t);
    else if (t.dataset.themeChoice) setTheme(t.dataset.themeChoice);
  });
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('score')) return;
    if (d.open) S.open.add(d.dataset.key); else S.open.delete(d.dataset.key);
    writeHash(false);
  }, true);
  document.addEventListener('keydown', e => { const tl = e.target.closest?.('.tile[data-tile]'); if (tl && e.target === tl && e.key === 'Enter') go('overview', { arg: tl.dataset.tile }); });
  // a sortable header sorts from the keyboard too
  document.addEventListener('keydown', e => { const th = e.target.closest?.('th[data-psort], th[data-ssort]'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); th.click(); } });
  document.addEventListener('input', e => { if (e.target.id === 'f-sq') { clearTimeout(timer); timer = setTimeout(() => { S.sq = e.target.value.trim(); S.nStat = 200; writeHash(false); render(); const f = $('#f-sq'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 200); } });
  document.addEventListener('change', e => {
    if (e.target.dataset?.variantHref != null) { location.href = e.target.dataset.variantHref + location.hash; return; }
    if (e.target.id === 'f-a') { S.a = e.target.value; S.nStat = 200; writeHash(false); render(); }
    if (e.target.id === 'f-m') { S.m = e.target.value; S.nStat = 200; writeHash(false); render(); }
  });
  let timer;
  let typing = false;
  $('#q').addEventListener('input', e => { clearTimeout(timer); qPending = true; timer = setTimeout(() => { qPending = false; S.q = e.target.value.trim(); writeHash(!typing); typing = true; render(); $('#q').focus(); }, 150); });
  $('#q').addEventListener('blur', () => { typing = false; });
  // a search that names one protein (and nothing else) opens it; "GENE R216" opens the site's card
  function openIfOne() {
    const q = K.sel?.parse(S.q); if (!q || q.terms.length || q.words.length || q.unmatched.length || q.absent.length || q.ignored.length) return false;
    const prots = [...new Set([...q.genes, ...q.sites.map(x => x[0])])];
    if (prots.length !== 1 || !K.views.protein) return false;
    const acc = D.proteins[prots[0]][0], site = q.sites.length === 1 ? '/' + q.sites[0][1] : '';
    go('protein', { arg: acc + site }); return true;
  }
  K.openIfOne = openIfOne;
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(timer); qPending = false; S.q = e.target.value.trim(); typing = false; if (!openIfOne() && !K.openLight?.(S.q)) { writeHash(true); render(); } } });
  $('#q-clear').addEventListener('click', () => { S.q = ''; writeHash(true); render(); $('#q').focus(); });
  let byLink = false;
  // where each page was scrolled to, for Back and Forward; a link opens its page at the top
  const scrolled = {};
  const pageOf = () => S.view + '/' + S.arg;
  const onNav = () => {
    if (location.hash === shown) return;
    if (shown != null) scrolled[shown] = scrollY;
    const was = pageOf(), wasProt = S.view === 'protein' ? S.arg.split('/')[0] : null;
    readHash(); if (S.legacy) writeHash(false); shown = location.hash; render();
    const samePage = pageOf() === was || (wasProt && S.view === 'protein' && S.arg.split('/')[0] === wasProt);
    if (!byLink && scrolled[shown] != null) scrollTo(0, scrolled[shown]);
    else if (!samePage && !(S.view === 'method' && S.arg)) scrollTo(0, 0);
    byLink = false;
  };
  document.addEventListener('click', e => { if (e.target.closest?.('a[href^="#"]:not([data-jump])')) byLink = true; }, true);
  addEventListener('hashchange', onNav);
  addEventListener('popstate', onNav);
  function setTheme(choice) {
    if (choice === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = choice;
    try { if (choice === 'auto') localStorage.removeItem('ptmc-theme'); else localStorage.setItem('ptmc-theme', choice); } catch (err) { /* storage may be blocked */ }
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)));
    if (themed) render();
  }
  // the pinned sidebar sits just under the sticky toolbar, whatever the toolbar's height
  // when the toolbar grows or shrinks (the selection bar wraps), the pinned sidebar's content keeps its place
  let barH = null;
  const toolbarH = () => {
    const t = document.querySelector('.toolbar'), h = t && getComputedStyle(t).position === 'sticky' ? Math.ceil(t.getBoundingClientRect().height) : 0;
    const rail = document.getElementById('rail');
    if (barH != null && h !== barH && rail && document.body.classList.contains('rail-pinned') && rail.scrollTop > 0) rail.scrollTop += h - barH;
    barH = h; document.documentElement.style.setProperty('--toolbar-h', `${h}px`);
  };
  try { new ResizeObserver(toolbarH).observe(document.querySelector('.toolbar')); } catch (e) { addEventListener('resize', toolbarH); }
  let themed = false;
  // the figures take their colours when drawn: draw again when the system theme changes under "auto"
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) render(); }); } catch (err) { /* old browsers */ }
  // the footer: licences and privacy, on every page (the Method page has the full text)
  $('#credit').innerHTML = `${esc(D.site.name)} · built with <a href="${esc(D.kit.url || '#method/made')}">ptmcontext</a> ${esc(D.kit.version)}` +
    (D.dataset ? ` · ${esc(D.dataset.label || 'dataset')} ${esc(D.dataset.version)}${D.dataset.doi ? `, <a href="https://doi.org/${esc(D.dataset.doi)}">doi:${esc(D.dataset.doi)}</a>` : ''}` : '') +
    ` · code: ${esc(hlicence(D.kit.licence || 'MIT'))}${CIT.licence ? ` · data: ${esc(hlicence(CIT.licence))}` : ''}` +
    ` · <a href="#method/privacy">no cookies, no tracking; nothing you search leaves your browser</a>`;
  setTheme(document.documentElement.dataset.theme || 'auto'); themed = true;
  (window.PTMC_MODULES || []).forEach(f => f(K));
  // the explorer's links put the selection before the hash (?q=FUS%20R216#P35637): it moves into the hash once, and leaves
  // the address's query, so a search cleared later stays cleared on reload
  (() => {
    const sp = new URLSearchParams(location.search); if (!['q', 'f'].some(k => sp.has(k))) return;
    const [path, qs] = location.hash.replace(/^#/, '').split('?'), hp = new URLSearchParams(qs || '');
    ['q', 'f'].forEach(k => { if (sp.has(k) && !hp.has(k)) hp.set(k, sp.get(k)); sp.delete(k); });
    history.replaceState(null, '', location.pathname + (sp.toString() ? '?' + sp : '') + '#' + (path || '') + (hp.toString() ? '?' + hp : ''));
  })();
  // an older site's filter parameters before the hash (?states=2&motifs=1,3, website.legacy_params): read once as this
  // site's filters, written into the hash and taken off the address; a flag naming a variant opens it
  (() => {
    const LP = D.legacy_params || {}, sp = new URLSearchParams(location.search); if (!Object.keys(LP).some(k => sp.has(k))) return;
    const hp = new URLSearchParams(location.hash.split('?')[1] || ''), f = new URLSearchParams((hp.get('f') || '').replace(/;/g, '&').replace(/~/g, '='));
    let variant = null;
    for (const [name, lp] of Object.entries(LP)) {
      if (!sp.has(name)) continue; const raw = sp.get(name); sp.delete(name);
      if (lp.variant) { if (raw === '1' || raw === 'true') variant = (D.variants || []).find(v => v.name === lp.variant); continue; }
      if (!lp.key) continue;
      const vals = lp.value != null ? (raw === '1' || raw === 'true' ? [lp.value] : []) : raw.split(',').filter(Boolean).map(v => (lp.values ? lp.values[v] : v)).filter(v => v != null);
      if (vals.length) f.set(lp.key, [...new Set([...(f.get(lp.key) || '').split('|').filter(Boolean), ...vals])].join('|'));
    }
    const fs = [...f.entries()].map(([k, v]) => `${k}~${v.split('|').map(x => encodeURIComponent(x).replace(/~/g, '%7E')).join('|')}`).join(';');
    if (fs) hp.set('f', fs); else hp.delete('f');
    const hash = (location.hash.split('?')[0] || '#overview') + (hp.toString() ? '?' + hp : ''), search = sp.toString() ? '?' + sp : '';
    if (variant && !D.variant) { location.replace(variant.href + search + hash); return; }
    history.replaceState(null, '', location.pathname + search + hash);
  })();
  readHash(); if (S.legacy) writeHash(false); hero(); render();
})();
