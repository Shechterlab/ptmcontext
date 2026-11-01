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
  // a row of a test, ready to draw: its effect, labels and reading (the site's own rows, and a selection's)
  const decorate = rows => { rows.forEach(r => { r.eff = r.or ?? r.fold; r.label = label(r); r.help = (A[r.analysis]?.help || {})[r.category] || ''; r.dir = dir(r); r.title = A[r.analysis]?.title || r.analysis; }); return rows; };
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
  const HOLD_MARK = { weaker: ['◌', 'the same direction within abundance deciles, but not significant there'], lost: ['○', 'lost within abundance deciles (under 1.1× or the other way)'] };
  const holdsMark = r => { const h = holdStatus(r); if (!HOLD_MARK[h]) return ''; const st = STRAT[r.analysis + '\u0000' + r.category];
    return `<span class="nh ${h}" title="${HOLD_MARK[h][1]}: OR ${fxn(st.eff)}${st.lo != null ? ` (95% CI ${fxn(st.lo)} to ${fxn(st.hi)})` : ''}, q ${fq(st.q)}">${HOLD_MARK[h][0]}<span class="vh"> ${HOLD_MARK[h][1]}</span></span>`; };
  const testName = (aid, m) => SETS(aid) ? (m === 'enricher' ? 'proteins, hypergeometric' : 'within abundance deciles') : (METHOD[m] || m);
  const methodName = r => testName(r.analysis, r.method);
  const effText = r => r.eff == null ? '–' : r.method === 'enricher' ? fxn(r.eff) + '-fold' : 'OR ' + fxn(r.eff);
  const rowsFor = (a, m) => D.rows.filter(r => r.analysis === a.id && (a.kind === 'protein_sets' ? r.method === 'enricher' : r.method === m) && r.eff != null);

  // ---- state in the hash ---------------------------------------------------------------------------------------------
  const S = { view: 'overview', arg: '', q: '', sq: '', m: 'mantel_haenszel', a: '', vs: 'residues', cmp: '', sort: 'q', desc: false, nStat: 200, open: new Set(), all: new Set(), how: false };
  // modules (kit-*.js) register views, tabs, click handlers, tooltips and search hints here; the core starts them last
  const K = window.PTMC = { D, W, A, S, esc, int, fx, fxn, fq, pct, cap, decorate, views: {}, tabs: [], clicks: [], tips: [], scopeHints: [], sections: {} };
  const BUILT_IN_VIEWS = ['overview', 'statistics', 'method'];
  function readHash() {
    const [path, qs] = location.hash.replace(/^#/, '').split('?');
    const p = new URLSearchParams(qs || '');
    const [view, ...rest] = (path || '').split('/');
    S.view = BUILT_IN_VIEWS.includes(view) || K.views[view] ? view : 'overview';
    try { S.arg = S.view === view ? decodeURIComponent(rest.join('/')) : ''; } catch (e) { S.arg = ''; }
    // the original explorer's links: #ACC and #ACC/R216 open the protein; ?q= before the hash is the search
    const legacy = /^([A-NR-Z][0-9][A-Z0-9]{3}[0-9]|[OPQ][0-9][A-Z0-9]{3}[0-9])(?:-\d+)?(?:\/[A-Z]?(\d+))?$/i.exec(path || '');
    if (S.view === 'overview' && legacy && K.views.protein) { S.view = 'protein'; S.arg = legacy[1].toUpperCase() + (legacy[2] ? '/' + legacy[2] : ''); }
    // its pages: #about and #docs are Method here; #overview/ov-<question> is the question
    else if (S.view === 'overview' && /^(about|docs)$/.test(view)) { S.view = 'method'; S.arg = ''; }
    const ov = S.view === 'overview' && /^ov-/.test(S.arg);
    if (ov) S.arg = S.arg.slice(3);
    S.legacy = ov || (S.view !== view && !!view);     // written back as this site's own link (replaceState)
    if (S.view === 'overview' && S.arg && !A[S.arg]) S.arg = '';
    S.q = p.get('q') || new URLSearchParams(location.search).get('q') || ''; S.m = p.get('m') || 'mantel_haenszel'; S.a = p.get('a') || ''; S.sq = p.get('sq') || '';
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
  function writeHash(push) {
    const p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    const f = K.sel?.encode(); if (f) p.set('f', f);
    if (S.m !== 'mantel_haenszel') p.set('m', S.m);
    if (S.vs !== 'residues') { p.set('vs', S.vs); if (S.vs === 'cmp') p.set('cmp', S.cmp); }
    if (S.view === 'statistics') { if (S.a) p.set('a', S.a); if (S.sq) p.set('sq', S.sq); if (S.sort !== 'q') p.set('sort', S.sort); if (S.desc !== (S.sort !== 'q')) p.set('dir', S.desc ? 'desc' : 'asc'); }

    const h = '#' + S.view + (S.arg ? '/' + encodeURIComponent(S.arg).replace(/%2F/g, '/') : '') + (p.toString() ? '?' + p : '');
    if (h !== location.hash) (push ? history.pushState : history.replaceState).call(history, null, '', h);
  }
  const go = (view, extra = {}) => { Object.assign(S, { view, arg: '' }, extra); writeHash(true); render(); scrollTo(0, 0); };
  Object.assign(K, { go, writeHash, render: () => render(), holds, holdStatus, effText, SETS });

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
    const tiles = (D.stats || ['marks', 'proteins', 'questions', 'tests']).map(t => typeof t === 'string' ? ALL[t] : [int((D.attribute_counts || {})[t.attribute] ?? 0), t.label, 'method/sources']).filter(Boolean);
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
    const t = [['overview', 'Overview', sel ? 'selection' : null], ...K.tabs.map(f => f()).filter(Boolean), ['statistics', 'Statistics', D.rows.length], ['method', 'Method', null]];
    const on = v => S.view === v || (K.views[S.view]?.tab === v);
    $('#tabs').innerHTML = `<button class="tab rail-btn" type="button" data-rail-open="filters" title="Sections and filters">☰</button>` + t.map(([v, name, n]) => `<a class="tab" role="tab" href="#${v}" aria-selected="${on(v)}">${name}` +
      (n != null ? ` <span class="count${n === 'selection' ? ' sel' : ''}"${n === 'selection' ? ' title="Every question here is tested again on your selection"' : ''}>${typeof n === 'number' ? int(n) : esc(n)}</span>` : '') + '</a>').join('');
  }

  // ---- Overview: tiles. Each tile is a question with its most telling classes, and opens the question's figure ------
  const LO = Math.log(0.1), HI = Math.log(30);
  const xp = v => (Math.min(Math.max((Math.log(v) - LO) / (HI - LO), 0), 1) * 100).toFixed(2) + '%';
  const am = d => `<span class="am ${d}" aria-hidden="true">${d === 'more' ? '▲' : d === 'less' ? '▼' : '○'}</span>`;
  const SHOWN = 8;
  // the rows behind every dot on the page, for their hover (the site's own rows and a selection's alike)
  let REG = [];
  const reg = r => REG.push(r) - 1;
  function dotRow(r, fkey) {
    const whisker = r.lo != null && r.hi != null ? `<line class="whisker ${r.dir}" x1="${xp(r.lo)}" x2="${xp(r.hi)}" y1="9" y2="9"/>` : '';
    const dot = r.eff != null ? `<circle class="dot ${r.dir}" cx="${xp(Math.max(r.eff, 1e-3))}" cy="9" r="4.6"/>` : '';
    return `<div class="drow${fkey ? ' pick' : ''}" data-r="${reg(r)}"${fkey ? ` data-f="${esc(fkey)}" data-v="${esc(r.category)}" role="button" tabindex="0" title="Select the ${esc(W.marks)} ${SETS(r.analysis) ? 'on proteins in' : 'in'} ${esc(r.label)}"` : ''}><span class="lab">${esc(r.label)}</span>` +
      `<svg aria-hidden="true"><line class="track" x1="0" x2="100%" y1="9" y2="9"/><line class="one" x1="${xp(1)}" x2="${xp(1)}" y1="2" y2="16"/>${whisker}${dot}</svg>` +
      `<span class="val ${r.dir}">${fx(r.eff)}${holdsMark(r)}</span></div>`;
  }
  const axisNote = () => `<div class="axis-note"><span></span><svg aria-hidden="true">` +
    [0.25, 1, 4, 16].map(v => `<text x="${xp(v)}" y="11" text-anchor="middle">${v}×</text>`).join('') + '</svg><span></span></div>';
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
  function summaryLine(rows, tmpl) {
    rows = rows.filter(r => !EXCL.test(r.label));
    if (rows.some(r => r.vs)) {
      const ok = rows.filter(enough), up = ok.filter(r => r.dir === 'more').sort((x, y) => strength(y) - strength(x))[0], dn = ok.filter(r => r.dir === 'less').sort((x, y) => strength(y) - strength(x))[0];
      const one = r => `<b>${esc(r.label)}</b> (${pcS(share1(r))} against ${pcS(share2(r))})`;
      return up || dn ? [up ? 'More often: ' + one(up) : '', dn ? (up ? 'less often: ' : 'Less often: ') + one(dn) : ''].filter(Boolean).join('; ') : `None differs from ${esc(vsName())} (q ≤ 0.05 and at least 1.1×)`;
    }
    const top = rows.filter(r => r.dir === 'more').sort((x, y) => y.eff - x.eff)[0], low = rows.filter(r => r.dir === 'less').sort((x, y) => x.eff - y.eff)[0];
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
  const rowsOf = (a, m) => (vsOn() ? K.sel.contrast(a.id, a.kind === 'protein_sets' ? 'enricher' : m) || []
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

  function pick(rows, max) {
    const vs = rows.some(r => r.vs);
    // against other marks: the classes with most evidence first (the CI bound nearer 1), with at least 10 marks
    const c = rows.filter(r => r.eff != null && !EXCL.test(r.label) && (!vs || enough(r)));
    const up = c.filter(r => r.dir === 'more').sort(vs ? (x, y) => strength(y) - strength(x) : (x, y) => y.eff - x.eff), dn = c.filter(r => r.dir === 'less').sort(vs ? (x, y) => strength(y) - strength(x) : (x, y) => x.eff - y.eff);
    const same = c.filter(r => r.dir === 'same').sort((x, y) => Math.abs(Math.log(y.eff)) - Math.abs(Math.log(x.eff)));
    const nUp = Math.min(up.length, dn.length ? max - 2 : max), nDn = Math.min(dn.length, max - nUp, up.length ? 2 : max);
    const shown = [...up.slice(0, nUp), ...dn.slice(0, nDn)];
    shown.push(...same.slice(0, Math.max(0, max - shown.length)));
    return { shown, more: up.length + dn.length + same.length - shown.length };
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
  // a tile's rows on one log2 axis: dashed lines at each doubling, a solid line at 1×
  function tileRows(rows) {
    if (!rows.length) return '';
    if (rows.some(r => r.vs)) return shareRows(rows);
    const l2 = v => Math.log2(Math.max(v, 1e-3));
    const vals = rows.flatMap(r => [r.eff, r.lo, r.hi].filter(v => v != null && v > 0));
    const lo = Math.min(-1, Math.max(-4, Math.floor(Math.min(...vals.map(l2))))), hi = Math.max(1, Math.min(6, Math.ceil(Math.max(...vals.map(l2)))));
    const X = v => ((Math.min(Math.max(l2(v), lo), hi) - lo) / (hi - lo) * 100).toFixed(2) + '%';
    const grid = []; for (let k = lo; k <= hi; k++) grid.push(`<line class="${k === 0 ? 'one' : 'grid'}" x1="${X(2 ** k)}" x2="${X(2 ** k)}" y1="0" y2="100%"/>`);
    return rows.map(r => `<div class="trow" data-r="${reg(r)}"><span class="lab">${esc(r.label)}</span><svg aria-hidden="true">${grid.join('')}` +
      (r.lo != null && r.hi != null ? `<line class="whisker ${r.dir}" x1="${X(r.lo)}" x2="${X(r.hi)}" y1="50%" y2="50%"/>` : '') +
      `<circle class="dot ${r.dir}" cx="${X(r.eff)}" cy="50%" r="4.6"/></svg><span class="val ${r.dir}">${fx(r.eff)}</span></div>`).join('') +
      `<div class="taxis"><span></span><span class="one-lab" style="--x:${X(1)}">1×</span><span></span></div>`;
  }
  function tile(card) {
    const a = A[card.analysis], max = card.rows || OV.rows || 7;
    const rows = rowsOf(a, S.m), { shown, more } = pick(rows, max);
    const whole = selOn() && !vsOn() ? rowsFor(a, S.m) : null;
    const made = selOn() && rows.some(r => r.descriptive);
    const foot = made ? whyShown(a) : shown.length || !vsOn() ? summaryLine(rows, card.summary) : '';
    return `<article class="tile" id="tile-${esc(a.id)}" data-tile="${esc(a.id)}" tabindex="0"><header><h3>${esc(card.title || a.title)}${a.new && D.run.parity ? ' <span class="newtag" title="Not in the published release: a question this rebuild adds">new</span>' : ''}</h3><span class="chev" aria-hidden="true">›</span></header>` +
      (shown.length ? `<div class="trows">${tileRows(shown)}</div>` : made ? '' : `<p class="muted tnone">${rows.some(r => r.q != null && r.q <= PADJ) ? 'None differs by 1.1× or more' : 'None differs (q ≤ 0.05)'}</p>`) +
      (more ? `<a class="tmore" href="#overview/${encodeURIComponent(a.id)}" title="Open the question at the ${more} not shown here">+${more} more ›</a>` : '') +
      (foot ? `<p class="tfoot">${foot}</p>` : '') + (whole ? `<p class="twhole"><span>Whole dataset</span> ${answer(whole)}</p>` : '') + '</article>';
  }
  function lead() {
    const q = OV.question || `Which parts of proteins are ${W.marked_long}?`;
    const key = `<p class="key"><span><i class="kd more"></i>more often</span><span><i class="kd less"></i>less often</span><span><i class="kd same"></i>about the same (within 1.1×)</span><span><i class="kd ns"></i>no difference (q > ${PADJ})</span>${vsOn() ? `<span><i class="kd more"></i> your selection’s share, <i class="kd ns"></i> that of ${esc(vsName())}</span>` : ''}${!vsOn() && D.analyses.some(a => a.stratified) ? '<span><b class="nh">◌</b> a protein set’s result in the same direction within abundance deciles, but not significant there</span><span><b class="nh">○</b> lost within abundance deciles</span>' : ''}` +
      `<button class="chip-btn" type="button" id="how" aria-expanded="${S.how}">How to read</button></p>` +
      (S.how ? `<p class="how-text">Each tile is a question; each row a class, with its effect on a log scale (the solid line is no difference). For a question about where ${esc(W.marks)} sit, × is an odds ratio: the odds that a ${esc(W.mark)} is in the class, over the odds for another ${esc(W.residue)} (not the ratio of the two shares, which is closer to 1; the hover gives both shares)${D.analyses.some(a => a.kind === 'protein_sets') ? '; for a question about kinds of protein it is the fold enrichment, the share of ' + esc(W.marked) + ' proteins in the set over the share of all proteins' : ''}. <b>Within each protein</b>, every protein is a stratum and its ${esc(W.marks)} are compared only with its own ${esc(W.residues)} (Mantel–Haenszel odds ratio), which separates where ${esc(W.marks)} sit from which proteins were found ${esc(W.marked)}; <b>pooled</b> puts all the ${esc(W.residues)} of the ${esc(W.marked)} proteins together (Fisher’s exact test). ${D.analyses.some(a => a.kind === 'protein_sets') ? `Questions about kinds of protein count proteins: the fold enrichment of ${esc(W.marked)} proteins in a set (one-sided hypergeometric test). ` : ''}Red: more often (q ≤ 0.05 and at least 1.1×); slate: less often; grey: significant but within 1.1×; hollow: no significant difference. A tile shows the classes that differ most; it opens to every class. Hover a row for its counts.</p>` : '');
    const methods = vsOn() && K.sel.STUDY ? ['mantel_haenszel', 'fisher', 'study'] : ['mantel_haenszel', 'fisher'];
    const tools = `<span class="tools"><span class="seg" role="group" aria-label="Test">${methods.map(m => `<button type="button" data-m="${m}" aria-pressed="${S.m === m}">${cap(METHOD[m])}</button>`).join('')}</span></span>`;
    if (!selOn()) return `<div class="page-head"><h2>${esc(q)}</h2>${tools}</div>` + key;
    const c = K.sel.compute(), n = (c.marks || []).length, np = c.proteins ? c.proteins.size : 0;
    if (K.sel.data() && n === 0) return `<div class="page-head"><h2>Your selection</h2></div><p class="note">No ${esc(W.mark)} matches this selection. Change the search or the filters, or <button class="linkish" type="button" data-sel-clear-all>clear the selection</button>.</p>`;
    const byP = K.sel.selectedCountByProtein ? K.sel.selectedCountByProtein() : {};
    const pills = Object.entries(byP).sort((x, y) => y[1] - x[1]).slice(0, 30).map(([pi, k]) => { const p = D.proteins[pi]; return `<a class="ppill" href="#protein/${esc(p[0])}" title="${esc(p[2])}: ${int(k)} of its ${int(p[4])} ${esc(W.marks)} selected">${esc(p[1] || p[0])} <span>${int(k)}</span></a>`; }).join('');
    const against = `<p class="against"><span class="flabel">Compared with</span><span class="seg" role="group" aria-label="Compared with">` +
      `<button type="button" data-vs="residues" aria-pressed="${S.vs === 'residues'}" title="The site’s own tests: the selected ${esc(W.marks)} against the other ${esc(W.residues)} of their proteins">other ${esc(W.residues)}</button>` +
      `<button type="button" data-vs="marks" aria-pressed="${S.vs === 'marks'}" title="What sets the selection apart: its ${esc(W.marks)} against the site’s other ${esc(W.marks)}">other ${esc(W.marks)}</button>` +
      (S.vs === 'cmp' ? `<button type="button" data-vs="cmp" aria-pressed="true">${esc(cmpName())}</button>` : '') +
      (K.views.compare ? `<button type="button" class="linkish" data-go-compare title="Compare with a saved selection">a saved selection…</button>` : '') + `</span></p>`;
    const head = `<div class="page-head"><h2>Your selection</h2>${K.sel.testable() || vsOn() ? tools : ''}</div><p class="sel-lead">${esc(K.sel.describe())} · <b>${int(n)}</b> ${esc(n === 1 ? W.mark : W.marks)} on <b>${int(np)}</b> protein${np === 1 ? '' : 's'}</p>` +
      `<div class="ppills">${pills}${np > 30 ? `<a href="#proteins" class="muted">+${int(np - 30)} more on the Proteins page</a>` : ''}</div>` + against;
    if (vsOn()) return head + vsLead() + key;
    return head + (K.sel.testable() ? key : `<p class="note">Too few to compare with the other ${esc(W.residues)}: a selection needs at least ${K.sel.MIN.proteins} proteins and ${K.sel.MIN.marks} ${esc(W.marks)} for its tests. Compare it with the other ${esc(W.marks)} instead, or see its ${esc(W.marks)} on the Proteins${K.views.sites ? ' and Sites pages' : ' page'}.</p>`);
  }
  // against other marks: who is compared with whom, the strongest differences in a sentence (each with whether it holds
  // under the other two tests), and how the marks were found, as a caveat rather than a finding
  function vsLead() {
    const G = K.sel.contrastGroups(), MIN = K.sel.MIN_SIDE;
    if (!G || G.g1.length < MIN || G.g2.length < MIN) return `<p class="note">A comparison needs at least ${MIN} ${esc(W.marks)} on each side${G ? `: ${int(G.g1.length)} against ${int(G.g2.length)}` : ''}${G?.shared ? ` (the ${int(G.shared)} both selections hold are left out of both)` : ''}.</p>`;
    const who = `<p class="vs-who">Your <b>${int(G.g1.length)}</b> ${esc(W.marks)} against ${S.vs === 'cmp' ? `the <b>${int(G.g2.length)}</b> of ${esc(cmpName())}${G.shared ? `, leaving out the ${int(G.shared)} in both` : ''}` : `the other <b>${int(G.g2.length)}</b>`}, ${esc(METHOD_PHRASE[S.m] || '')}.</p>`;
    const meths = ['mantel_haenszel', 'fisher', ...(K.sel.STUDY ? ['study'] : [])].filter(m => m !== S.m);
    const holdsIn = r => meths.filter(m => (K.sel.contrast(r.analysis, m) || []).find(x => x.category === r.category)?.dir === r.dir).map(m => METHOD[m]);
    const qs = [...D.analyses.filter(a => a.kind !== 'protein_sets'), ...ATTRQ.filter(a => !a.provenance)];
    const all = qs.flatMap(a => (rowsOf(a, S.m) || []).filter(r => !r.descriptive && enough(r) && !EXCL.test(r.label)));
    const top = (rs, d, k) => rs.filter(r => r.dir === d).sort((x, y) => strength(y) - strength(x)).slice(0, k);
    const one = r => { const h = holdsIn(r); return `<b>${esc(r.label)}</b> <span class="muted">(${esc((A[r.analysis]?.title || '').toLowerCase())}: ${pcS(share1(r))} against ${pcS(share2(r))}${h.length ? `; also ${h.join(' and ')}` : meths.length ? `; not ${meths.map(m => METHOD[m]).join(' or ')}` : ''})</span>`; };
    const up = top(all, 'more', 3), dn = top(all, 'less', 2);
    const sets = D.analyses.filter(a => a.kind === 'protein_sets').flatMap(a => (rowsOf(a, 'enricher') || []).filter(r => !r.descriptive && enough(r)));
    const sUp = top(sets, 'more', 2);
    const say = (up.length ? `More often than in ${esc(vsName())}: ${up.map(one).join('; ')}.` : '') + (dn.length ? ` Less often: ${dn.map(one).join('; ')}.` : '') + (up.length || dn.length ? '' : `No class differs from ${esc(vsName())} at q ≤ ${PADJ} and 1.1×, with at least 10 ${esc(W.marks)}.`) +
      (sUp.length ? ` Their proteins are more often in ${sUp.map(r => `<b>${esc(r.label)}</b> <span class="muted">(${esc(A[r.analysis].title.toLowerCase())}: ${pcS(share1(r))} of the proteins against ${pcS(share2(r))})</span>`).join('; ')}.` : '');
    // how they were found: the provenance attributes whose shares differ most, as a caveat
    const prov = ATTRQ.filter(a => a.provenance).flatMap(a => (K.sel.contrast(a.id, 'fisher') || []).filter(r => enough(r) && r.q != null && r.q <= PADJ));
    const pv = prov.sort((x, y) => Math.abs(share1(y) - share2(y)) - Math.abs(share1(x) - share2(x))).slice(0, 3);
    const caveat = pv.length ? `<p class="vs-caveat"><b>How they were found.</b> ${pv.map(r => `<b>${esc(r.label)}</b> <span class="muted">(${esc(A[r.analysis].title.toLowerCase())})</span>: ${pcS(share1(r))} of these, against ${pcS(share2(r))} of the others`).join('; ')}. Differences above may reflect which sources report these ${esc(W.marks)}${K.sel.STUDY && S.m !== 'study' ? `: <button type="button" class="linkish" data-m="study">compare within studies</button>, where each ${esc(W.mark)} is compared only with ${esc(W.marks)} reported by the same sources.` : S.m === 'study' ? '; the comparison above is within studies, so they do not explain it.' : '.'}</p>` : '';
    return who + `<p class="vs-say">${say}</p>` + caveat + `<p class="muted small">Exploratory: ${esc(W.marks)} of one protein are not independent, and the comparison is not adjusted for the other selections tried. Each ${esc(W.mark)} row shows the selection’s share (filled) and ${esc(vsName())}’ (hollow).</p>`;
  }
  function overview() {
    REG = [];
    if (selOn() && !K.sel.data()) return lead() + '<p class="muted">Loading the selection…</p>';
    if (selOn() && !vsOn() && !selTestable()) return lead();
    if (S.arg && A[S.arg] && (A[S.arg].kind !== 'attribute' || vsOn())) return focus(S.arg);
    if (vsOn() && !(K.sel.contrastGroups()?.g1.length >= K.sel.MIN_SIDE && K.sel.contrastGroups()?.g2.length >= K.sel.MIN_SIDE)) return lead();
    return lead() + secList().map(x => `<h3 class="sec-label${x.caveat ? ' caveat' : ''}" id="sec-${esc(x.name.replace(/\W+/g, '-').toLowerCase())}">${esc(x.name)}</h3><div class="tiles">${x.cards.map(tile).join('')}</div>`).join('');
  }
  // one question, opened from its tile: every class, the summary and the downloads, with Previous and Next
  function focus(aid) {
    const cards = allCards(), i = cards.findIndex(c => c.analysis === aid), a = A[aid];
    const prev = cards[i - 1], next = cards[i + 1], card = cards[i] || { section: a.section };
    const ORDER = { more: 0, same: 1, ns: 2, less: 3 };
    const rows = rowsOf(a, S.m).slice().sort(a.kind === 'protein_sets' ? (x, y) => ORDER[x.dir] - ORDER[y.dir] || y.eff - x.eff : (x, y) => y.eff - x.eff);
    return `<div class="focus-bar"><a href="#overview">‹ All sections</a><span class="crumb">Overview › ${esc(card.section || '')} › <b>${esc(card.title || a.title)}</b></span>` +
      (i >= 0 ? `<span class="muted">${i + 1} of ${cards.length}</span>` : '') +
      `<span class="pn">${prev ? `<a href="#overview/${encodeURIComponent(prev.analysis)}">‹ Previous · ${esc(prev.title || A[prev.analysis].title)}</a>` : ''}${next ? `<a href="#overview/${encodeURIComponent(next.analysis)}">${esc(next.title || A[next.analysis].title)} · Next ›</a>` : ''}</span></div>` +
      `<div class="page-head"><h2>${esc(card.title || a.title)}</h2><span class="tools">${a.kind === 'protein_sets' ? '' : `<span class="seg" role="group">${(vsOn() && K.sel.STUDY ? ['mantel_haenszel', 'fisher', 'study'] : ['mantel_haenszel', 'fisher']).map(m => `<button type="button" data-m="${m}" aria-pressed="${S.m === m}">${cap(METHOD[m])}</button>`).join('')}</span>`}</span></div>` +
      `<p class="page-sub">${vsOn() ? `${esc(a.title)}: <b>your selection</b> against ${esc(vsName())}, tested in your browser (exploratory).` : esc(a.question || a.describe || '')}${selOn() && !vsOn() ? ` <b>Your selection</b>${rows.some(r => r.descriptive) ? ': ' + whyShown(a).replace(/^Your selection /, '') : vsOn() ? '' : ', tested again in your browser (exploratory: not adjusted for the other selections tried).'}` : ''} <span class="muted">Click a ${a.kind === 'protein_sets' ? 'set' : 'class'} to select its ${esc(W.marks)}.</span></p>` +
      `<section class="pcard">${cardBody(a, rows)}${selOn() && !vsOn() ? `<p class="twhole"><span>Whole dataset</span> ${answer(rowsFor(a, S.m))}</p>` : ''}</section>`;
  }
  K.sections.method = () => [['m-tests', 'How the tests work', 1], ['m-data', 'Data', 1], ['m-questions', 'Questions', 1], ['m-sources', 'Sources', 1], ['m-parity', 'Checked against the release', 1], ['m-made', 'How this site is made', 1], ['m-cite', 'How to cite', 1]].filter(([id]) => id !== 'm-parity' || D.run.parity);
  K.sections.overview = () => (S.arg ? [] : secList().flatMap(x => [[`sec-${x.name.replace(/\W+/g, '-').toLowerCase()}`, x.name, 1], ...x.cards.map(c => [`tile-${c.analysis}`, c.title || A[c.analysis].title, 2])]));
  const SLO = Math.log(1 / 16), SHI = Math.log(16);
  const sp = v => (Math.min(Math.max((Math.log(v) - SLO) / (SHI - SLO), 0), 1) * 100).toFixed(2) + '%';
  function strip(rows) {
    return `<svg class="strip" aria-hidden="true"><line class="track" x1="0" x2="100%" y1="9" y2="9"/>` +
      [0.25, 0.5, 2, 4].map(v => `<line class="faint" x1="${sp(v)}" x2="${sp(v)}" y1="4" y2="14"/>`).join('') +
      `<line class="one" x1="${sp(1)}" x2="${sp(1)}" y1="1" y2="17"/>` +
      [...rows].sort((x, y) => (x.dir === 'ns') - (y.dir === 'ns')).reverse().map(r => `<circle class="dot ${r.dir}" cx="${sp(r.eff)}" cy="9" r="4.2"/>`).join('') + '</svg>';
  }
  function cardBody(a, rows) {
    const max = a.kind === 'protein_sets' ? SHOWN : 1e9;             // a residue question shows every class
    const all = S.all.has(a.id), shown = all ? rows : rows.slice(0, max);
    const noun = a.kind === 'protein_sets' ? 'sets' : 'classes';
    const toggle = rows.length > max ? `<button class="linkish" type="button" data-all="${esc(a.id)}">${all ? 'Show the top ' + SHOWN : 'Show all ' + int(rows.length) + ' ' + noun}</button>` : '';
    const nW = rows.filter(r => holdStatus(r) === 'weaker').length, nL = rows.filter(r => holdStatus(r) === 'lost').length, nDir = rows.filter(r => holdStatus(r) != null).length;
    const strat = a.kind === 'protein_sets' && rows.some(r => !r.selection && STRAT[a.id + '\u0000' + r.category]) ? ` Hover a set for the same test within protein abundance deciles${nW + nL ? `: of the ${int(nDir)} sets that differ, ${int(nDir - nW - nL)} hold there, ${int(nW)} keep their direction without reaching q ≤ ${PADJ} (◌) and ${int(nL)} lose it (○)` : ''}.` : '';
    return `<div class="card-body"><div class="card-head"><div><h3>${esc(a.title)}</h3>` +
      `<p class="sub">${vsOn() ? `Each ${a.kind === 'protein_sets' ? 'set: the share of your selection’s proteins in it (filled) and of the other proteins (hollow)' : `class: the share of your selection’s ${esc(W.marks)} in it (filled) and of ${esc(vsName())} (hollow)`}${a.kind === 'protein_sets' ? '' : ', ' + METHOD_PHRASE[S.m]}` : `${esc(a.sub)}${a.kind === 'protein_sets' ? '' : ', ' + METHOD_PHRASE[S.m]}`}.${strat} <a href="#method">How it was tested</a> · <a href="#statistics?a=${encodeURIComponent(a.id)}">all tests</a></p></div>` +
      `<div class="exp" role="group" aria-label="Download ${esc(a.title)}">${['pdf', 'svg', 'png', 'tsv'].map(k => `<button type="button" class="exp-btn" data-exp="${k}" data-aid="${esc(a.id)}" title="${EXP_HELP[k]}">${k.toUpperCase()}</button>`).join('')}</div></div>` +
      `<div class="drows">${rows.some(r => r.vs) ? shareRows(shown, 'drow') : shown.map(r => dotRow(r, fkeyOf(a))).join('') + axisNote()}</div>${toggle}${rows.some(r => r.descriptive) ? '' : `<p class="summary">${summaryLine(rows)}</p>`}</div>`;
  }
  // ---- Statistics: every test ----------------------------------------------------------------------------------------
  const COLS = [
    ['analysis', 'Question', r => r.title, false], ['label', 'Class or set', r => r.label, false], ['method', 'Test', r => methodName(r), false],
    ['a', `${cap(W.marked)}: in class / all`, r => r.a, true], ['c', 'Others: in class / all', r => r.c, true],
    ['or', 'Effect (95% CI)', r => r.eff ?? -1, true], ['q', 'q', r => r.q ?? 2, true], ['dir', 'Reading', r => r.dir, false], ['strata', 'Strata', r => r.strata ?? -1, true],
  ];
  function shownStatistics() {
    const rows = D.rows.filter(r => (!S.a || r.analysis === S.a) && (S.m === 'both' || r.method === S.m || (r.method === 'enricher' && S.m === 'fisher')) && rowHit(r));
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
      R.parity.checked.map(c => `<tr><td>${esc(A[c.analysis]?.title || c.analysis)}</td><td>${esc(testName(c.analysis, c.method))}</td><td class="num">${int(c.rows)}</td><td>${c.equal ? '<span class="ok">✓</span>' : '✗'}</td></tr>`).join('') +
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
      `</tbody></table></div></section>` + par +
      citeSection() +
      sourcesSection() +
      `<section id="m-made"><h3>How this site is made</h3><p>This site is one file, <span class="mono">${esc(D.site.config)}</span>: which mark, which sequences and regions, which questions, its colours and pictures. ptmcontext ${esc(D.kit.version)} (commit <span class="mono">${esc(shortCommit(D.kit.commit))}</span>) ran it on ${esc(hdate(R.written))}. Its citation, version and date are in <span class="mono">${esc(CIT.file || '')}</span>.</p>` +
      `<p>Every download carries the same block: what it shows and how it was tested, how to cite it and its data sources, the site’s and ptmcontext’s versions, the sequences and inputs it came from, and when and where it was exported. It is printed under each figure and kept in the file itself: the SVG’s metadata, the PNG’s text fields, the PDF’s properties and the TSV’s # lines.</p></section></div>`;
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
    return `One-sided hypergeometric test, as clusterProfiler’s enricher: the ${W.marked} proteins in each set against the ${a.describe || 'other proteins of the universe'}; fold enrichment is the share of ${W.marked} proteins in the set over the share of all proteins in it. q: Benjamini–Hochberg across the sets tested. Within abundance deciles (where shown): the same counts, a Mantel–Haenszel odds ratio across protein-abundance deciles, which asks whether an enrichment holds among proteins of similar abundance.`;
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
  const FF = "Inter, Arial, Helvetica, sans-serif", FFH = "'IBM Plex Serif', Georgia, serif";
  const PAL = { ink: '#111827', muted: '#5f6f78', line: '#e3e8ea', one: '#8a979e', more: '#b42318', less: '#334155', same: '#8a96a0', ns: '#ffffff', bg: '#ffffff' };
  const mctx = document.createElement('canvas').getContext('2d');
  const tw = (t, size, weight = 400, fam = FF) => { mctx.font = `${weight} ${size}px ${fam}`; return mctx.measureText(t).width; };
  function wrap(text, width, size, weight, fam) {
    const out = []; let cur = '';
    for (const word of String(text).split(/\s+/)) { const t = cur ? cur + ' ' + word : word; if (!cur || tw(t, size, weight, fam) <= width) cur = t; else { out.push(cur); cur = word; } }
    if (cur) out.push(cur); return out;
  }
  function figure(aid, m) {
    const a = A[aid], sets = a.kind === 'protein_sets';
    const allRows = rowsOf(a, m).slice().sort((x, y) => y.eff - x.eff), rows = sets && !S.all.has(aid) ? allRows.slice(0, SHOWN) : allRows;
    const Wd = 760, P = 20, L0 = P, LW = 250, X0 = 290, X1 = 650, VX = Wd - P;
    const X = v => X0 + (Math.min(Math.max((Math.log(Math.max(v, 1e-3)) - LO) / (HI - LO), 0), 1)) * (X1 - X0);
    const title = a.title, sub = (sets ? a.sub : `${a.sub}, ${METHOD_PHRASE[m]}`) + selWords();
    const parts = [];
    const T = (x, y, t, o = {}) => parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 11.5}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.fam ? ` font-family="${o.fam}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || PAL.ink}">${esc(t)}</text>`);
    T(P, 30, title, { size: 17, weight: 'bold', fam: FFH });
    const subLines = wrap(sub, Wd - 2 * P, 11.5).slice(0, 5);
    subLines.forEach((t, k) => T(P, 49 + k * 15, t, { size: 11.5, fill: PAL.muted }));
    const dy = (subLines.length - 1) * 15;
    let lx = P;
    ['more', 'less', 'same', 'ns'].forEach(d => {
      parts.push(`<circle cx="${lx + 5}" cy="${66 + dy}" r="4.5" fill="${PAL[d]}" stroke="${d === 'ns' ? PAL.muted : PAL[d]}" stroke-width="1.4"/>`);
      T(lx + 14, 70 + dy, DIR_WORDS[d], { size: 10.5, fill: PAL.muted }); lx += 22 + tw(DIR_WORDS[d], 10.5);
    });
    let y = 86 + dy; const top = y;
    rows.forEach(r => {
      const lab = wrap(r.label, LW, 11.5).slice(0, 2), h = Math.max(22, lab.length * 14 + 8), yc = y + h / 2;
      lab.forEach((t, k) => T(L0, yc + 4 - (lab.length - 1) * 7 + k * 14, t));
      parts.push(`<line x1="${X0}" x2="${X1}" y1="${yc}" y2="${yc}" stroke="${PAL.line}" stroke-width="1"/>`);
      const col = PAL[r.dir] === PAL.ns ? PAL.muted : PAL[r.dir];
      if (r.lo != null && r.hi != null) parts.push(`<line x1="${X(r.lo).toFixed(1)}" x2="${X(r.hi).toFixed(1)}" y1="${yc}" y2="${yc}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/>`);
      parts.push(`<circle cx="${X(r.eff).toFixed(1)}" cy="${yc}" r="4.8" fill="${PAL[r.dir]}" stroke="${r.dir === 'ns' ? PAL.muted : '#ffffff'}" stroke-width="1.4"/>`);
      T(VX, yc + 4, fx(r.eff), { anchor: 'end', weight: r.dir === 'more' || r.dir === 'less' ? 'bold' : null, fill: r.dir === 'more' || r.dir === 'less' ? PAL[r.dir] : PAL.muted });
      y += h;
    });
    parts.push(`<line x1="${X(1)}" x2="${X(1)}" y1="${top - 2}" y2="${y + 2}" stroke="${PAL.one}" stroke-width="1.2"/>`);
    [0.25, 1, 4, 16].forEach(v => T(X(v), y + 16, v + '×', { size: 10.5, anchor: 'middle', fill: PAL.muted }));
    T((X0 + X1) / 2, y + 31, sets ? 'fold enrichment (log scale); 1× is as often as the other proteins' : `odds ratio (log scale); 1× is as often as the other ${W.residues} of the same proteins`, { size: 10.5, anchor: 'middle', fill: PAL.muted });
    y += 50;
    const note = sets ? setWords(a) + (rows.length < allRows.length ? ` Shown: the ${rows.length} sets with the largest fold enrichment of the ${int(allRows.length)} tested; the TSV has every set.` : '') : testWords(m);
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

  // ---- PNG at 300 dpi, fonts embedded, with text fields; PDF with fonts and properties --------------------------------
  const FONT_FILES = {
    'Inter|400': 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.4.1/400Regular/Inter_400Regular.ttf',
    'Inter|600': 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.4.1/600SemiBold/Inter_600SemiBold.ttf',
    'IBM Plex Serif|600': 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/ibm-plex-serif@0.4.1/600SemiBold/IBMPlexSerif_600SemiBold.ttf',
  };
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const SVG2PDF = 'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.4/dist/svg2pdf.umd.min.js';
  const fontCache = {};
  const b64 = buf => { const u = new Uint8Array(buf); let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
  const fontB64 = key => (fontCache[key] ||= fetch(FONT_FILES[key]).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('font ' + key))).then(b64));
  async function embedFonts(svg) {
    try {
      const faces = await Promise.all(Object.keys(FONT_FILES).map(async k => { const [fam, w] = k.split('|'); return `@font-face{font-family:'${fam}';font-weight:${w === '600' ? 'bold' : w};src:url(data:font/ttf;base64,${await fontB64(k)}) format('truetype');}`; }));
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
    const dpi = 300, scale = dpi / 96, svg = await embedFonts(f.svg);
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
  async function pdfExport(f, name) {
    await loadScript(JSPDF); await loadScript(SVG2PDF);
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: [f.W * 0.75, f.H * 0.75], orientation: f.W >= f.H ? 'l' : 'p', compress: true });
    for (const [k, file] of [['Inter|400', 'Inter-Regular.ttf'], ['Inter|600', 'Inter-SemiBold.ttf'], ['IBM Plex Serif|600', 'IBMPlexSerif-SemiBold.ttf']]) {
      try {
        const [fam, w] = k.split('|');
        pdf.addFileToVFS(file, await fontB64(k));
        pdf.addFont(file, fam, w === '600' ? 'bold' : 'normal');
        if (fam === 'IBM Plex Serif') pdf.addFont(file, fam, 'normal');
      } catch (err) { /* offline: the standard Helvetica */ }
    }
    pdf.setProperties({ title: f.title, subject: f.desc, author: D.site.lab || D.site.name, keywords: `${D.mark}, ${f.title}, ${CIT.version || ''}`,
      creator: `ptmcontext ${D.kit.version} (${D.kit.commit || 'commit not recorded'})` });
    const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-100000px;top:0';
    holder.innerHTML = f.svg.replace(/<metadata[\s\S]*?<\/metadata>/, ''); document.body.appendChild(holder);
    try { await pdf.svg(holder.firstElementChild, { x: 0, y: 0, width: f.W * 0.75, height: f.H * 0.75 }); } finally { holder.remove(); }
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
  const expBar = (kinds, attrs, label) => `<div class="exp" role="group" aria-label="Download ${esc(label)}">${kinds.map(k => `<button type="button" class="exp-btn" data-${attrs}="${k}" title="${EXP_HELP[k]}">${k.toUpperCase()}</button>`).join('')}</div>`;
  Object.assign(K, { CIT, PAL, FF, FFH, tw, wrap, figureFrame, exportFigure, expBar, preamble, creditLines, provenance, download, hdate, htime, hlicence, shortCommit, testWords, PADJ, MIN_EFFECT, dir });

  // ---- render, events ------------------------------------------------------------------------------------------------
  function render() {
    tabs();
    $('#q').value = S.q; $('#q-clear').hidden = !S.q;
    scope();
    const mod = K.views[S.view];
    $('#view').innerHTML = mod ? mod.render(S.arg) : S.view === 'statistics' ? statistics() : S.view === 'method' ? method() : overview();
    document.title = `${D.site.name}${S.view === 'overview' ? '' : ' · ' + (mod?.title ? mod.title(S.arg) : cap(S.view))}`;
    if (mod?.after) mod.after(S.arg);
    if (S.view === 'method' && S.arg) document.getElementById('m-' + S.arg)?.scrollIntoView({ block: 'start' });
    K.rail?.();
  }
  const tip = $('#tip');
  function showTip(e, r) {
    const selNote = r.selection ? `<br><span class="muted">Your selection, tested again in the browser${r.descriptive ? ': shown, not tested' : ' (exploratory)'}</span>` : '';
    if (r.vs) {
      const set = SETS(r.analysis), unit = set ? 'proteins' : W.marks;
      tip.innerHTML = `<b>${esc(r.label)}</b>${r.help ? `<br><span class="muted">${esc(r.help)}</span>` : ''}<br>${int(r.a)} of ${int(r.a + r.b)} ${esc(unit)} of your selection (${pct(r.a, r.a + r.b)}) against ${int(r.c)} of ${int(r.c + r.d)} ${set ? (S.vs === 'cmp' ? 'proteins of ' + esc(cmpName()) : 'other ' + esc(W.marked) + ' proteins') : esc(vsName())} (${pct(r.c, r.c + r.d)})` +
        `<br>${set && S.vs !== 'cmp' ? `${fxn(r.fold)}-fold (one-sided hypergeometric over the ${esc(W.marked)} proteins)` : `OR ${fxn(r.or)}${r.lo != null ? ` (95% CI ${fxn(r.lo)} to ${fxn(r.hi)})` : ''} · ${set ? 'pooled' : METHOD[r.method] || esc(r.method)}${r.strata ? `, ${int(r.strata)} informative ${r.method === 'study' ? 'groups of sources' : 'proteins'}` : ''}`}, q ${fq(r.q)}` + selNote;
    } else if (SETS(r.analysis)) {
      const st = STRAT[r.analysis + '\u0000' + r.category];
      tip.innerHTML = `<b>${esc(r.label)}</b><br>${int(r.a)} of ${int(r.a + r.b)} ${r.selection ? 'proteins of your selection' : esc(W.marked) + ' proteins'} (${pct(r.a, r.a + r.b)}) vs ${int(r.c)} of ${int(r.c + r.d)} other proteins (${pct(r.c, r.c + r.d)})` +
        `<br>${fxn(r.eff)}-fold, q ${fq(r.q)} (one-sided hypergeometric)` +
        (st && !r.selection ? `<br>Within abundance deciles: OR ${fxn(st.eff)}${st.lo != null ? ` (95% CI ${fxn(st.lo)}–${fxn(st.hi)})` : ''}, q ${fq(st.q)}` : '') + selNote;
    } else tip.innerHTML = `<b>${esc(r.label)}</b>${r.help ? `<br><span class="muted">${esc(r.help)}</span>` : ''}` +
      `<br>${int(r.a)} of ${int(r.a + r.b)} ${esc(W.marks)} (${pct(r.a, r.a + r.b)}) vs ${int(r.c)} of ${int(r.c + r.d)} other ${esc(W.residues)} (${pct(r.c, r.c + r.d)})` +
      `<br>OR ${fxn(r.or)}${r.lo != null ? ` (95% CI ${fxn(r.lo)}–${fxn(r.hi)})` : ''}, q ${fq(r.q)} · ${METHOD[r.method] || esc(r.method)}${r.strata != null && r.method === 'mantel_haenszel' ? `, ${int(r.strata)} informative proteins` : ''}` +
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
  document.addEventListener('keydown', e => { const tl = e.target.closest?.('.tile[data-tile]'); if (tl && e.key === 'Enter') go('overview', { arg: tl.dataset.tile }); });
  // a sortable header sorts from the keyboard too
  document.addEventListener('keydown', e => { const th = e.target.closest?.('th[data-psort], th[data-ssort]'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); th.click(); } });
  document.addEventListener('input', e => { if (e.target.id === 'f-sq') { clearTimeout(timer); timer = setTimeout(() => { S.sq = e.target.value.trim(); S.nStat = 200; writeHash(false); render(); const f = $('#f-sq'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 200); } });
  document.addEventListener('change', e => {
    if (e.target.id === 'f-a') { S.a = e.target.value; S.nStat = 200; writeHash(false); render(); }
    if (e.target.id === 'f-m') { S.m = e.target.value; S.nStat = 200; writeHash(false); render(); }
  });
  let timer;
  let typing = false;
  $('#q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { S.q = e.target.value.trim(); writeHash(!typing); typing = true; render(); $('#q').focus(); }, 150); });
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
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(timer); S.q = e.target.value.trim(); typing = false; if (!openIfOne()) { writeHash(true); render(); } } });
  $('#q-clear').addEventListener('click', () => { S.q = ''; writeHash(true); render(); $('#q').focus(); });
  let shown = null;
  const onNav = () => { if (location.hash === shown) return; readHash(); if (S.legacy) writeHash(false); shown = location.hash; render(); };
  addEventListener('hashchange', onNav);
  addEventListener('popstate', onNav);
  function setTheme(choice) {
    if (choice === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = choice;
    try { if (choice === 'auto') localStorage.removeItem('ptmc-theme'); else localStorage.setItem('ptmc-theme', choice); } catch (err) { /* storage may be blocked */ }
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)));
    if (themed) render();
  }
  let themed = false;
  // the figures take their colours when drawn: draw again when the system theme changes under "auto"
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) render(); }); } catch (err) { /* old browsers */ }
  $('#credit').innerHTML = `${esc(D.site.name)} · built with ptmcontext ${esc(D.kit.version)} from <span class="mono">sites/${esc(D.site.id)}.yaml</span>`;
  setTheme(document.documentElement.dataset.theme || 'auto'); themed = true;
  (window.PTMC_MODULES || []).forEach(f => f(K));
  readHash(); if (S.legacy) writeHash(false); hero(); render();
})();
