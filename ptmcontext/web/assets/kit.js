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
  const dir = r => r.or == null || r.q == null || r.q > PADJ ? 'ns' : r.or >= MIN_EFFECT ? 'more' : r.or <= 1 / MIN_EFFECT ? 'less' : 'same';
  const DIR_WORDS = { more: 'more often', less: 'less often', same: 'about the same (within 1.1×)', ns: 'no difference (q > 0.05)' };
  const METHOD = { mantel_haenszel: 'within each protein', fisher: 'pooled' };
  const METHOD_PHRASE = { mantel_haenszel: 'compared within each protein (Mantel–Haenszel)', fisher: 'pooled (Fisher’s exact test)' };
  const A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
  const label = r => (A[r.analysis]?.labels || {})[r.category] || r.category.replace(/_/g, ' ');
  D.rows.forEach((r, i) => { r.i = i; r.label = label(r); r.help = (A[r.analysis]?.help || {})[r.category] || ''; r.dir = dir(r); r.title = A[r.analysis]?.title || r.analysis; });

  // ---- state in the hash ---------------------------------------------------------------------------------------------
  const S = { view: 'overview', q: '', m: 'mantel_haenszel', a: '', sort: 'or', desc: true, open: new Set(), all: new Set(), how: false };
  function readHash() {
    const [view, qs] = location.hash.replace(/^#/, '').split('?');
    const p = new URLSearchParams(qs || '');
    S.view = ['overview', 'statistics', 'method'].includes(view) ? view : 'overview';
    S.q = p.get('q') || ''; S.m = p.get('m') || 'mantel_haenszel'; S.a = p.get('a') || '';
    S.sort = p.get('sort') || 'or'; S.desc = p.get('dir') !== 'asc';
    S.open = new Set((p.get('open') || '').split(',').filter(k => A[k]));
  }
  function writeHash(push) {
    const p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    if (S.m !== 'mantel_haenszel') p.set('m', S.m);
    if (S.view === 'statistics') { if (S.a) p.set('a', S.a); if (S.sort !== 'or') p.set('sort', S.sort); if (!S.desc) p.set('dir', 'asc'); }
    if (S.view === 'overview' && S.open.size) p.set('open', [...S.open].join(','));
    const h = '#' + S.view + (p.toString() ? '?' + p : '');
    if (h !== location.hash) (push ? history.pushState : history.replaceState).call(history, null, '', h);
  }
  const go = (view, extra = {}) => { Object.assign(S, { view }, extra); writeHash(true); render(); scrollTo(0, 0); };

  // ---- search --------------------------------------------------------------------------------------------------------
  const tokens = () => S.q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const hay = r => `${r.analysis} ${r.title} ${r.category} ${r.label}`.toLowerCase();
  const titleHit = a => tokens().length && tokens().every(t => `${a.id} ${a.title} ${a.question}`.toLowerCase().includes(t));
  const rowHit = r => !tokens().length || tokens().every(t => hay(r).includes(t));

  // ---- header and toolbar --------------------------------------------------------------------------------------------
  function hero() {
    const tiles = [
      [int(D.counts.marks), W.marks, 'statistics'],
      [int(D.counts.proteins), 'proteins', 'statistics'],
      [int(D.analyses.length), D.analyses.length === 1 ? 'question' : 'questions', 'overview'],
      [int(D.rows.length), 'tests', 'statistics'],
    ];
    $('#hero-stats').innerHTML = tiles.map(([b, s, v]) => `<button class="stat" type="button" data-go="${v}"><b>${b}</b><span>${esc(s)}</span></button>`).join('');
  }
  function scope() {
    const ex = (D.site.examples || []).map(e => `<button class="try-chip" type="button" data-try="${esc(e)}">${esc(e)}</button>`).join('');
    const eg = (D.site.examples || []).slice(0, 3);
    $('#q').placeholder = 'A question, a class or a motif' + (eg.length ? ', such as ' + (eg.length > 1 ? eg.slice(0, -1).join(', ') + ' or ' + eg[eg.length - 1] : eg[0]) : '');
    $('#scope').innerHTML = `<span>All <b>${int(D.counts.marks)}</b> ${esc(W.marks)} on <b>${int(D.counts.proteins)}</b> proteins</span>` +
      (ex ? `<span class="scope-hint">Try</span>${ex}` : '');
  }
  function tabs() {
    const t = [['overview', 'Overview', D.analyses.length], ['statistics', 'Statistics', D.rows.length], ['method', 'Method', null]];
    $('#tabs').innerHTML = t.map(([v, name, n]) => `<a class="tab" role="tab" href="#${v}" aria-selected="${S.view === v}">${name}` +
      (n != null ? ` <span class="count">${int(n)}</span>` : '') + '</a>').join('');
  }

  // ---- Overview: a scorecard. Each row is a question, its figure at a glance and its answer; a row opens its full
  // figure: every class with its 95% CI, the summary and the downloads. --------------------------------------------------
  const LO = Math.log(0.1), HI = Math.log(30);
  const xp = v => (Math.min(Math.max((Math.log(v) - LO) / (HI - LO), 0), 1) * 100).toFixed(2) + '%';
  // the strip at a glance: every class a dot, on a log scale from 1/16 to 16 (centre line: no difference)
  const SLO = Math.log(1 / 16), SHI = Math.log(16);
  const sp = v => (Math.min(Math.max((Math.log(v) - SLO) / (SHI - SLO), 0), 1) * 100).toFixed(2) + '%';
  const am = d => `<span class="am ${d}" aria-hidden="true">${d === 'more' ? '▲' : d === 'less' ? '▼' : '○'}</span>`;
  const SHOWN = 8;
  function dotRow(r) {
    const whisker = r.lo != null && r.hi != null ? `<line class="whisker ${r.dir}" x1="${xp(r.lo)}" x2="${xp(r.hi)}" y1="9" y2="9"/>` : '';
    const dot = r.or != null ? `<circle class="dot ${r.dir}" cx="${xp(r.or)}" cy="9" r="4.6"/>` : '';
    return `<div class="drow" data-i="${r.i}"><span class="lab">${esc(r.label)}</span>` +
      `<svg aria-hidden="true"><line class="track" x1="0" x2="100%" y1="9" y2="9"/><line class="one" x1="${xp(1)}" x2="${xp(1)}" y1="2" y2="16"/>${whisker}${dot}</svg>` +
      `<span class="val ${r.dir}">${fx(r.or)}</span></div>`;
  }
  const axisNote = () => `<div class="axis-note"><span></span><svg aria-hidden="true">` +
    [0.25, 1, 4, 16].map(v => `<text x="${xp(v)}" y="11" text-anchor="middle">${v}×</text>`).join('') + '</svg><span></span></div>';
  function strip(rows) {
    return `<svg class="strip" aria-hidden="true"><line class="track" x1="0" x2="100%" y1="9" y2="9"/>` +
      [0.25, 0.5, 2, 4].map(v => `<line class="faint" x1="${sp(v)}" x2="${sp(v)}" y1="4" y2="14"/>`).join('') +
      `<line class="one" x1="${sp(1)}" x2="${sp(1)}" y1="1" y2="17"/>` +
      [...rows].sort((x, y) => (x.dir === 'ns') - (y.dir === 'ns')).reverse().map(r => `<circle class="dot ${r.dir}" cx="${sp(r.or)}" cy="9" r="4.2"/>`).join('') + '</svg>';
  }
  function answer(rows) {
    const up = rows.filter(r => r.dir === 'more').sort((x, y) => y.or - x.or), down = rows.filter(r => r.dir === 'less').sort((x, y) => x.or - y.or);
    const list = (rs, k) => rs.slice(0, k).map(r => `${esc(r.label)} <span class="an">OR ${fxn(r.or)}</span>`).join(', ') + (rs.length > k ? ` <span class="muted">+${rs.length - k}</span>` : '');
    if (up.length) return am('more') + list(up, 2) + (down.length ? '; ' + am('less') + list(down, 1) : '');
    if (down.length) return am('less') + list(down, 2);
    return am('ns') + (rows.some(r => r.q != null && r.q <= PADJ) ? 'none differs by 1.1× or more' : 'none differs at q ≤ 0.05');
  }
  function summaryLine(rows) {
    const top = rows.find(r => r.dir === 'more'), low = [...rows].reverse().find(r => r.dir === 'less');
    if (top) return `Most enriched: <b>${esc(top.label)}</b> (${fx(top.or)})` + (low ? `; least: <b>${esc(low.label)}</b> (${fx(low.or)})` : '');
    if (low) return `Least often: <b>${esc(low.label)}</b> (${fx(low.or)})`;
    return 'No class differs (q ≤ 0.05 and at least 1.1×)';
  }
  function cardBody(a, rows) {
    const all = S.all.has(a.id), shown = all ? rows : rows.slice(0, SHOWN);
    const toggle = rows.length > SHOWN ? `<button class="linkish" type="button" data-all="${esc(a.id)}">${all ? 'Show the top ' + SHOWN : 'Show all ' + rows.length + ' classes'}</button>` : '';
    return `<div class="card-body"><div class="card-head"><div><h3>${esc(a.title)}</h3>` +
      `<p class="sub">${esc(a.sub)}, ${METHOD_PHRASE[S.m]}. <a href="#method">How it was tested</a> · <a href="#statistics?a=${encodeURIComponent(a.id)}">all tests</a></p></div>` +
      `<div class="exp" role="group" aria-label="Download ${esc(a.title)}">${['pdf', 'svg', 'png', 'tsv'].map(k => `<button type="button" class="exp-btn" data-exp="${k}" data-aid="${esc(a.id)}" title="${EXP_HELP[k]}">${k.toUpperCase()}</button>`).join('')}</div></div>` +
      `<div class="drows">${shown.map(dotRow).join('')}${axisNote()}</div>${toggle}<p class="summary">${summaryLine(rows)}</p></div>`;
  }
  function scoreRow(a) {
    let rows = D.rows.filter(r => r.analysis === a.id && r.method === S.m && r.or != null);
    const byClass = !titleHit(a) && tokens().length;
    if (byClass) rows = rows.filter(rowHit);
    if (!rows.length) return '';
    rows.sort((x, y) => y.or - x.or);
    const open = S.open.has(a.id) || byClass;
    return `<details class="score" data-key="${esc(a.id)}"${open ? ' open' : ''}><summary>` +
      `<span class="pm" aria-hidden="true"></span><span class="tq"><span class="t">${esc(a.title)}</span><span class="qq">${esc(a.question)}</span></span>` +
      `<span class="glance">${strip(rows)}</span><span class="ans">${answer(rows)}</span><span class="go" aria-hidden="true"></span></summary>` +
      cardBody(a, rows) + '</details>';
  }
  function overview() {
    const rows = D.analyses.map(scoreRow).filter(Boolean);
    return `<div class="page-head"><h2>Which parts of proteins are ${esc(W.marked_long)}?</h2>` +
      `<span class="tools"><span class="seg" role="group" aria-label="Test">${['mantel_haenszel', 'fisher'].map(m => `<button type="button" data-m="${m}" aria-pressed="${S.m === m}">${cap(METHOD[m])}</button>`).join('')}</span>` +
      `<button class="chip-btn" type="button" id="how" aria-expanded="${S.how}">How to read</button></span></div>` +
      `<p class="page-sub">Each row asks one question about the ${int(D.counts.marks)} ${esc(W.marks)}, always against the other ${esc(W.residues)} of the same proteins. Open a row for its figure, every class and the downloads.</p>` +
      `<p class="hub-legend">${am('more')}more ${am('less')}less than expected ${am('ns')}no difference (q ≤ ${PADJ})` +
      (S.how ? `<span class="how-text">Each class is a dot at its odds ratio, on a log scale; the centre line is no difference. Red: significantly more often (q ≤ 0.05 and at least 1.1×); slate: less often; grey: about the same; hollow: no significant difference. ` +
        `<b>Within each protein</b>, every protein is a stratum and its ${esc(W.marks)} are compared only with its own ${esc(W.residues)} (Mantel–Haenszel), which separates where ${esc(W.marks)} sit from which proteins were found ${esc(W.marked)}. ` +
        `<b>Pooled</b> puts all the ${esc(W.residues)} of the ${esc(W.marked)} proteins together (Fisher’s exact test). Hover a class for its counts.</span>` : '') + '</p>' +
      `<div class="hub-head" aria-hidden="true"><span>Question</span><span>At a glance</span><span>Answer · all ${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins</span><span></span></div>` +
      (rows.length ? `<div class="hub">${rows.join('')}</div>` : `<p class="empty">No question or class matches “${esc(S.q)}”.</p>`);
  }

  // ---- Statistics: every test ----------------------------------------------------------------------------------------
  const COLS = [
    ['analysis', 'Question', r => r.title, false], ['label', 'Class', r => r.label, false], ['method', 'Test', r => METHOD[r.method] || r.method, false],
    ['a', `${cap(W.marks)} in the class`, r => r.a, true], ['c', `Other ${W.residues} in it`, r => r.c, true],
    ['or', 'Odds ratio (95% CI)', r => r.or ?? -1, true], ['q', 'q', r => r.q ?? 2, true], ['dir', 'Reading', r => r.dir, false], ['strata', 'Proteins', r => r.strata ?? -1, true],
  ];
  function shownStatistics() {
    const rows = D.rows.filter(r => (!S.a || r.analysis === S.a) && (S.m === 'both' || r.method === S.m) && rowHit(r));
    const col = COLS.find(c => c[0] === S.sort) || COLS[5];
    rows.sort((x, y) => { const a = col[2](x), b = col[2](y); const c = typeof a === 'number' ? a - b : String(a).localeCompare(String(b)); return S.desc ? -c : c; });
    return rows;
  }
  function statistics() {
    const rows = shownStatistics();
    const opts = [['', 'All questions'], ...D.analyses.map(a => [a.id, a.title])];
    return `<div class="page-head"><h2>All tests</h2><button class="btn" type="button" id="dl">Download TSV</button></div>` +
      `<p class="page-sub">One row per class and test. Each compares the ${esc(W.marks)} in a class with the other ${esc(W.residues)} of the same proteins. q is Benjamini–Hochberg within each question and test; a class counts as more or less often at q ≤ 0.05 and at least 1.1×. The download keeps the columns of the release’s statistics table.</p>` +
      `<div class="filters"><label>Question <select id="f-a">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === S.a ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` +
      `<label>Test <select id="f-m">${[['mantel_haenszel', 'Within each protein'], ['fisher', 'Pooled'], ['both', 'Both']].map(([v, t]) => `<option value="${v}"${v === S.m ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` +
      `<span class="muted">${int(rows.length)} ${rows.length === 1 ? 'test' : 'tests'}</span></div>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr>${COLS.map(([k, t, , n]) => `<th class="${n ? 'num' : ''}" data-sort="${k}"${S.sort === k ? ` aria-sort="${S.desc ? 'descending' : 'ascending'}"` : ''}>${esc(t)}${S.sort === k ? (S.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>` +
      rows.map(r => `<tr data-i="${r.i}"><td>${esc(r.title)}</td><td class="wrapok" title="${esc(r.help)}">${esc(r.label)}</td><td>${METHOD[r.method] || esc(r.method)}</td>` +
        `<td class="num">${int(r.a)} / ${int(r.a + r.b)}</td><td class="num">${int(r.c)} / ${int(r.c + r.d)}</td>` +
        `<td class="num">${fx(r.or)}${r.lo != null ? ` <span class="muted">(${fx(r.lo)}–${fx(r.hi)})</span>` : ''}</td><td class="num">${fq(r.q)}</td>` +
        `<td><span class="dir ${r.dir}">${DIR_WORDS[r.dir]}</span></td><td class="num">${r.strata != null ? int(r.strata) : ''}</td></tr>`).join('') +
      `</tbody></table></div>`;
  }

  // ---- Method: how the tests work, the data, the parity check, how to cite --------------------------------------------
  function method() {
    const R = D.run, m = R.marks || {}, sn = R.snapshot || {};
    const IN = D.inputs || {};
    const inputs = Object.entries(R.inputs || {}).sort(([a], [b]) => (IN[a]?.use === 'checking the rebuild') - (IN[b]?.use === 'checking the rebuild'))
      .map(([k, v]) => `<tr><td class="wrapok">${esc(IN[k]?.version || k)}</td><td>${esc(IN[k]?.use || '')}</td><td class="wrapok">${esc(hlicence(IN[k]?.licence))}</td><td class="mono">${esc(String(v.file).split('/').pop())}</td><td class="mono">${esc(v.md5)}</td></tr>`).join('');
    const dropped = [m.not_on_snapshot ? `${int(m.not_on_snapshot)} on other sequences (isoforms, unreviewed entries)` : '', m.residue_mismatch ? `${int(m.residue_mismatch)} not on a candidate residue` : ''].filter(Boolean);
    const nPar = R.parity ? R.parity.checked.reduce((n, c) => n + c.rows, 0) : 0;
    const refName = (IN[R.parity?.reference]?.version || R.parity?.reference || '').replace(/\s*\(.*\)$/, '');
    const par = R.parity ? `<section><h3>Checked against the published release</h3><p>The rebuild recomputes the published tests and compares them, row by row and character by character, with the statistics table of the ${esc(refName)}: ` +
      `<span class="${R.parity.equal ? 'ok' : ''}">${R.parity.equal ? `all ${nPar} rows are identical` : 'some rows differ'}</span>.</p>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Question</th><th>Test</th><th class="num">Rows</th><th>Identical</th></tr></thead><tbody>` +
      R.parity.checked.map(c => `<tr><td>${esc(A[c.analysis]?.title || c.analysis)}</td><td>${METHOD[c.method] || esc(c.method)}</td><td class="num">${c.rows}</td><td>${c.equal ? '<span class="ok">✓</span>' : '✗'}</td></tr>`).join('') +
      '</tbody></table></div></section>' : '';
    return `<div class="page-head"><h2>Method</h2></div><div class="doc">` +
      `<section><h3>How the tests work</h3><p>Every question compares the ${esc(W.marks)} with the other ${esc(W.residues)} of the same proteins, class by class: is a ${esc(W.mark)} more or less likely than another ${esc(W.residue)} to sit in a disordered region, a domain, a motif? Each class is tested two ways.</p><ul>` +
      `<li><b>Within each protein</b>, every protein is a stratum, and its ${esc(W.marks)} are compared only with its own ${esc(W.residues)}: a Mantel–Haenszel odds ratio, with its 95% confidence interval (Robins–Breslow–Greenland) and the continuity-corrected Cochran–Mantel–Haenszel test. This separates where ${esc(W.marks)} sit from which proteins were found ${esc(W.marked)}: abundant proteins are detected more often, and they differ in their structure.</li>` +
      `<li><b>Pooled</b>, all the ${esc(W.residues)} of the ${esc(W.marked)} proteins are taken together: Fisher’s exact test, with the Haldane–Anscombe odds ratio.</li></ul>` +
      `<p>Both count the same ${esc(W.marks)}: those on a protein with at least one other ${esc(W.residue)}. q is Benjamini–Hochberg across the classes of a question, for each test. A class counts as more or less often at q ≤ 0.05 and at least 1.1×.</p></section>` +
      `<section><h3>Data</h3><p>Sequences: ${esc(sn.release)}, ${int(sn.entries)} entries (FASTA MD5 <span class="mono">${esc(sn.fasta_md5)}</span>). ` +
      `${cap(W.marks)}: ${int(m.counted)} on ${int(m.proteins)} proteins, from ${int(m.selected)} records${dropped.length ? ' (' + dropped.join('; ') + ', left out)' : ''}. Every file below was checked against its MD5 before it was read.</p>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Source</th><th>Used for</th><th>Licence</th><th>File</th><th>MD5</th></tr></thead><tbody>${inputs}</tbody></table></div></section>` + par +
      citeSection() +
      `<section><h3>How this site is made</h3><p>This site is one file, <span class="mono">${esc(D.site.config)}</span>: which mark, which sequences and regions, which questions, its colours and pictures. ptmcontext ${esc(D.kit.version)} (commit <span class="mono">${esc(shortCommit(D.kit.commit))}</span>) ran it on ${esc(hdate(R.written))}. Its citation, version and date are in <span class="mono">${esc(CIT.file || '')}</span>.</p>` +
      `<p>Every download carries the same block: what it shows and how it was tested, how to cite it and its data sources, the site’s and ptmcontext’s versions, the sequences and inputs it came from, and when and where it was exported. It is printed under each figure and kept in the file itself: the SVG’s metadata, the PNG’s text fields, the PDF’s properties and the TSV’s # lines.</p></section></div>`;
  }

  // ---- citing, and provenance: every export carries the same block -----------------------------------------------------
  const CIT = D.citation || {};
  const EXP_HELP = { pdf: 'PDF: vector, fonts embedded, with its citation and provenance', svg: 'SVG: vector, editable, with its citation and provenance in the file',
    png: 'PNG at 300 dpi, with its citation and provenance in the image and its text fields', tsv: 'TSV: the rows, under # lines saying what they are, how to cite them and where they come from' };
  const shortCommit = c => c ? c.replace(/-dirty$/, '').slice(0, 7) + (c.endsWith('-dirty') ? '+changes' : '') : 'not recorded';
  const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const pageUrl = () => location.href.split('#')[0];
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
  function provenance(extra = {}) {
    const R = D.run;
    return { site: D.site.name, site_config: D.site.config, version: CIT.version || '', date: CIT.date || '', doi: CIT.doi || '', licence: CIT.licence || '',
      cite: CIT.preferred ? CIT.preferred.text + doiTxt(CIT.preferred.doi) : '', data_sources: (CIT.references || []).map(r => r.text + doiTxt(r.doi)),
      software: `ptmcontext ${D.kit.version}`, commit: D.kit.commit || '', run: R.written, sequences: R.snapshot,
      marks: R.marks, inputs: R.inputs, roles: R.roles, parity: R.parity ? { reference: R.parity.reference, equal: R.parity.equal } : null,
      exported: stamp(), from: pageUrl(), ...extra };
  }
  function creditLines() {
    const R = D.run, sn = R.snapshot || {};
    const lines = [];
    if (CIT.preferred) lines.push(`Cite: ${CIT.preferred.text}${doiTxt(CIT.preferred.doi)}`);
    if ((CIT.references || []).length) lines.push('Data: ' + CIT.references.map(r => r.short + doiTxt(r.doi)).join('; '));
    lines.push(`${D.site.name}, version ${CIT.version || '–'}${CIT.date ? ' (' + hdate(CIT.date) + ')' : ''} · ptmcontext ${D.kit.version} (${shortCommit(D.kit.commit)}) · ${sn.release || ''}, FASTA MD5 ${String(sn.fasta_md5 || '').slice(0, 12)}… · run on ${hdate(R.written)}`);
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
      `# Exported: ${stamp()} from ${pageUrl()}`].filter(Boolean).join('\n') + '\n';
  }
  const g6 = v => v == null ? '' : String(+Number(v).toPrecision(6));
  function cardTsv(aid, m) {
    const a = A[aid], rows = D.rows.filter(r => r.analysis === aid && r.method === m).sort((x, y) => (y.or ?? -1) - (x.or ?? -1));
    const head = ['class', 'class_code', 'definition', 'test', 'odds_ratio', 'ci_low', 'ci_high', 'p', 'q', `${W.marks.replace(/\W+/g, '_')}_in_class`, `${W.marks.replace(/\W+/g, '_')}_total`, `other_${W.residues.replace(/\W+/g, '_')}_in_class`, `other_${W.residues.replace(/\W+/g, '_')}_total`, 'proteins', 'reading'];
    return preamble(`${a.title}, ${METHOD[m]}`, `${a.question} One row per class: ${a.sub}, ${METHOD_PHRASE[m]}. ${testWords(m)}`) +
      head.join('\t') + '\n' + rows.map(r => [r.label, r.category, r.help, METHOD[r.method] || r.method, g6(r.or), g6(r.lo), g6(r.hi), g6(r.p), g6(r.q), r.a, r.a + r.b, r.c, r.c + r.d, r.strata ?? '', DIR_WORDS[r.dir]].join('\t')).join('\n') + '\n';
  }
  function statisticsTsv(rows) {
    const lines = D.statistics_tsv.replace(/\n$/, '').split('\n');
    return preamble(S.a ? `all tests, ${A[S.a]?.title || S.a}` : 'all tests',
      `the ${rows.length} tests shown${S.q ? ' for the search "' + S.q + '"' : ''}${S.m !== 'both' ? ' (' + METHOD[S.m] + ')' : ''}, in the columns of the release’s statistics table. a and b count the ${W.marks} in and outside the class; c and d the other ${W.residues} of the same proteins in and outside it. ${testWords('mantel_haenszel')} ${testWords('fisher').split(' Only ')[0]}`) +
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
    const a = A[aid], rows = D.rows.filter(r => r.analysis === aid && r.method === m && r.or != null).sort((x, y) => y.or - x.or);
    const Wd = 760, P = 20, L0 = P, LW = 250, X0 = 290, X1 = 650, VX = Wd - P;
    const X = v => X0 + (Math.min(Math.max((Math.log(v) - LO) / (HI - LO), 0), 1)) * (X1 - X0);
    const title = a.title, sub = `${a.sub}, ${METHOD_PHRASE[m]}`;
    const parts = [];
    const T = (x, y, t, o = {}) => parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 11.5}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.fam ? ` font-family="${o.fam}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || PAL.ink}">${esc(t)}</text>`);
    T(P, 30, title, { size: 17, weight: 'bold', fam: FFH });
    const subLines = wrap(sub, Wd - 2 * P, 11.5).slice(0, 2);
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
      parts.push(`<circle cx="${X(r.or).toFixed(1)}" cy="${yc}" r="4.8" fill="${PAL[r.dir]}" stroke="${r.dir === 'ns' ? PAL.muted : '#ffffff'}" stroke-width="1.4"/>`);
      T(VX, yc + 4, fx(r.or), { anchor: 'end', weight: r.dir === 'more' || r.dir === 'less' ? 'bold' : null, fill: r.dir === 'more' || r.dir === 'less' ? PAL[r.dir] : PAL.muted });
      y += h;
    });
    parts.push(`<line x1="${X(1)}" x2="${X(1)}" y1="${top - 2}" y2="${y + 2}" stroke="${PAL.one}" stroke-width="1.2"/>`);
    [0.25, 1, 4, 16].forEach(v => T(X(v), y + 16, v + '×', { size: 10.5, anchor: 'middle', fill: PAL.muted }));
    T((X0 + X1) / 2, y + 31, `odds ratio (log scale); 1× is as often as the other ${W.residues} of the same proteins`, { size: 10.5, anchor: 'middle', fill: PAL.muted });
    y += 50;
    wrap(testWords(m), Wd - 2 * P, 10.5).forEach(t => { T(P, y, t, { size: 10.5 }); y += 14; });
    y += 6;
    creditLines().forEach(line => wrap(line, Wd - 2 * P, 9.5).forEach(t => { T(P, y, t, { size: 9.5, fill: PAL.muted }); y += 12.5; }));
    const H = Math.ceil(y + P - 6);
    const desc = `${title}: ${a.question} ${sub}. ${testWords(m)} ${creditLines().join(' ')}`;
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
    const name = `${D.site.id}_${aid}_${S.m === 'fisher' ? 'pooled' : 'within_protein'}`;
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
  function citeSection() {
    if (!CIT.version) return '';
    return `<section id="cite"><h3>How to cite</h3>` +
      (CIT.preferred ? `<p>Please cite <b>${esc(CIT.preferred.text)}</b>${CIT.preferred.doi ? ` <a href="https://doi.org/${esc(CIT.preferred.doi)}">doi:${esc(CIT.preferred.doi)}</a>` : ''}</p>` : '') +
      ((CIT.references || []).length ? `<p>and the original data sources:</p><ul>${CIT.references.map(r => `<li>${esc(r.text)}${r.doi ? ` <a href="https://doi.org/${esc(r.doi)}">doi:${esc(r.doi)}</a>` : ''}</li>`).join('')}</ul>` : '') +
      `<p class="muted">This site: ${esc(CIT.title)}, version ${esc(CIT.version)}${CIT.date ? ' (' + esc(hdate(CIT.date)) + ')' : ''}${CIT.doi ? `, <a href="https://doi.org/${esc(CIT.doi)}">doi:${esc(CIT.doi)}</a>` : ''}${CIT.licence ? '; licence ' + esc(hlicence(CIT.licence)) : ''}.</p>` +
      `<p><button class="btn" type="button" id="copy-cite">Copy citations</button> <button class="btn" type="button" id="dl-cff">Download CITATION.cff</button></p></section>`;
  }

  // ---- render, events ------------------------------------------------------------------------------------------------
  function render() {
    tabs();
    $('#q').value = S.q; $('#q-clear').hidden = !S.q;
    $('#view').innerHTML = S.view === 'statistics' ? statistics() : S.view === 'method' ? method() : overview();
    document.title = `${D.site.name}${S.view === 'overview' ? '' : ' · ' + S.view[0].toUpperCase() + S.view.slice(1)}`;
  }
  const tip = $('#tip');
  function showTip(e, r) {
    tip.innerHTML = `<b>${esc(r.label)}</b>${r.help ? `<br><span class="muted">${esc(r.help)}</span>` : ''}` +
      `<br>${int(r.a)} of ${int(r.a + r.b)} ${esc(W.marks)} (${pct(r.a, r.a + r.b)}) vs ${int(r.c)} of ${int(r.c + r.d)} other ${esc(W.residues)} (${pct(r.c, r.c + r.d)})` +
      `<br>OR ${fxn(r.or)}${r.lo != null ? ` (95% CI ${fxn(r.lo)}–${fxn(r.hi)})` : ''}, q ${fq(r.q)} · ${METHOD[r.method] || esc(r.method)}${r.strata != null && r.method === 'mantel_haenszel' ? `, ${int(r.strata)} proteins` : ''}`;
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + 'px';
  }
  document.addEventListener('mousemove', e => {
    const el = e.target.closest('.drow');
    if (el) showTip(e, D.rows[+el.dataset.i]); else tip.hidden = true;
  });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-try],[data-m],th[data-sort],#dl,#dl-cff,#copy-cite,#how,[data-all],[data-exp],[data-theme-choice]');
    if (!t) return;
    if (t.dataset.go) go(t.dataset.go);
    else if (t.dataset.try) { S.q = t.dataset.try; writeHash(true); render(); }
    else if (t.dataset.m) { S.m = t.dataset.m; writeHash(false); render(); }
    else if (t.dataset.sort) { S.desc = S.sort === t.dataset.sort ? !S.desc : true; S.sort = t.dataset.sort; writeHash(false); render(); }
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
  document.addEventListener('change', e => {
    if (e.target.id === 'f-a') { S.a = e.target.value; writeHash(false); render(); }
    if (e.target.id === 'f-m') { S.m = e.target.value; writeHash(false); render(); }
  });
  let timer;
  $('#q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { S.q = e.target.value.trim(); writeHash(false); render(); $('#q').focus(); }, 150); });
  $('#q-clear').addEventListener('click', () => { S.q = ''; writeHash(true); render(); $('#q').focus(); });
  addEventListener('hashchange', () => { readHash(); render(); });
  addEventListener('popstate', () => { readHash(); render(); });
  function setTheme(choice) {
    if (choice === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = choice;
    try { if (choice === 'auto') localStorage.removeItem('ptmc-theme'); else localStorage.setItem('ptmc-theme', choice); } catch (err) { /* storage may be blocked */ }
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)));
  }
  $('#credit').innerHTML = `${esc(D.site.name)} · built with ptmcontext ${esc(D.kit.version)} from <span class="mono">sites/${esc(D.site.id)}.yaml</span>`;
  setTheme(document.documentElement.dataset.theme || 'auto');
  readHash(); hero(); scope(); render();
})();
