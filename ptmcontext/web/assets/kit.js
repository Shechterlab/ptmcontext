/* The site kit's behaviour: the same for every site. A site differs only in its data (data written by ptmc web from the
   site's run) and its look (variables set from the site file). Views: Overview (one card per analysis), Statistics
   (every test, sortable, downloadable), Method (what the tests do, the inputs and their checksums, parity). The view,
   the search and the choices live in the URL hash, so Back and links work. */
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('site-data').textContent);
  const W = D.words;
  const $ = s => document.querySelector(s);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const int = n => n == null ? '–' : Number(n).toLocaleString('en-US');
  const fx = v => v == null ? '–' : v >= 10 ? v.toFixed(0) + '×' : v >= 2 ? v.toFixed(1) + '×' : v.toFixed(2) + '×';
  const fq = q => q == null ? '–' : q === 0 ? '< 1e-300' : q < 1e-3 ? q.toExponential(1) : q.toFixed(3);
  const PADJ = 0.05, MIN_EFFECT = 1.1;
  const dir = r => r.or == null || r.q == null || r.q > PADJ ? 'ns' : r.or >= MIN_EFFECT ? 'more' : r.or <= 1 / MIN_EFFECT ? 'less' : 'same';
  const DIR_WORDS = { more: 'more often', less: 'less often', same: 'about the same (within 1.1×)', ns: 'no difference (q > 0.05)' };
  const METHOD = { mantel_haenszel: 'within protein', fisher: 'pooled' };
  const METHOD_LONG = { mantel_haenszel: 'Within protein (Mantel–Haenszel, each protein a stratum)', fisher: 'Pooled (Fisher, Haldane–Anscombe odds ratio)' };
  const A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
  const label = r => (A[r.analysis]?.labels || {})[r.category] || r.category.replace(/_/g, ' ');
  D.rows.forEach((r, i) => { r.i = i; r.label = label(r); r.dir = dir(r); r.title = A[r.analysis]?.title || r.analysis; });

  // ---- state in the hash ---------------------------------------------------------------------------------------------
  const S = { view: 'overview', q: '', m: 'mantel_haenszel', a: '', sort: 'or', desc: true };
  function readHash() {
    const [view, qs] = location.hash.replace(/^#/, '').split('?');
    const p = new URLSearchParams(qs || '');
    S.view = ['overview', 'statistics', 'method'].includes(view) ? view : 'overview';
    S.q = p.get('q') || ''; S.m = p.get('m') || 'mantel_haenszel'; S.a = p.get('a') || '';
    S.sort = p.get('sort') || 'or'; S.desc = p.get('dir') !== 'asc';
  }
  function writeHash(push) {
    const p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    if (S.m !== 'mantel_haenszel') p.set('m', S.m);
    if (S.view === 'statistics') { if (S.a) p.set('a', S.a); if (S.sort !== 'or') p.set('sort', S.sort); if (!S.desc) p.set('dir', 'asc'); }
    const h = '#' + S.view + (p.toString() ? '?' + p : '');
    if (h !== location.hash) (push ? history.pushState : history.replaceState).call(history, null, '', h);
  }
  const go = (view, extra = {}) => { Object.assign(S, { view }, extra); writeHash(true); render(); scrollTo(0, 0); };

  // ---- search --------------------------------------------------------------------------------------------------------
  const tokens = () => S.q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const hay = r => `${r.analysis} ${r.title} ${r.category} ${r.label}`.toLowerCase();
  const titleHit = a => tokens().length && tokens().every(t => `${a.id} ${a.title}`.toLowerCase().includes(t));
  const rowHit = r => !tokens().length || tokens().every(t => hay(r).includes(t));

  // ---- header and toolbar --------------------------------------------------------------------------------------------
  function hero() {
    const tiles = [
      [int(D.counts.marks), W.marks + ' counted', 'statistics'],
      [int(D.counts.proteins), 'proteins', 'statistics'],
      [int(D.analyses.length), 'analyses', 'overview'],
      [int(D.rows.length), 'tests', 'statistics'],
    ];
    $('#hero-stats').innerHTML = tiles.map(([b, s, v]) => `<button class="stat" type="button" data-go="${v}"><b>${b}</b><span>${esc(s)}</span></button>`).join('');
  }
  function scope() {
    const ex = (D.site.examples || []).map(e => `<button class="try-chip" type="button" data-try="${esc(e)}">${esc(e)}</button>`).join('');
    $('#scope').innerHTML = `<span>All <b>${int(D.counts.marks)}</b> ${esc(W.marks)} on <b>${int(D.counts.proteins)}</b> proteins</span>` +
      (ex ? `<span class="scope-hint">Try</span>${ex}` : '');
  }
  function tabs() {
    const t = [['overview', 'Overview', D.analyses.length], ['statistics', 'Statistics', D.rows.length], ['method', 'Method', null]];
    $('#tabs').innerHTML = t.map(([v, name, n]) => `<a class="tab" role="tab" href="#${v}" aria-selected="${S.view === v}">${name}` +
      (n != null ? ` <span class="count">${int(n)}</span>` : '') + '</a>').join('');
  }

  // ---- Overview: a card per analysis, a dot row per class ------------------------------------------------------------
  const LO = Math.log(0.1), HI = Math.log(30);
  const xp = v => (Math.min(Math.max((Math.log(v) - LO) / (HI - LO), 0), 1) * 100).toFixed(2) + '%';
  function dotRow(r) {
    const whisker = r.lo != null && r.hi != null ? `<line class="whisker ${r.dir}" x1="${xp(r.lo)}" x2="${xp(r.hi)}" y1="9" y2="9"/>` : '';
    const dot = r.or != null ? `<circle class="dot ${r.dir}" cx="${xp(r.or)}" cy="9" r="4.6"/>` : '';
    return `<div class="drow" data-i="${r.i}"><span class="lab">${esc(r.label)}</span>` +
      `<svg aria-hidden="true"><line class="track" x1="0" x2="100%" y1="9" y2="9"/><line class="one" x1="${xp(1)}" x2="${xp(1)}" y1="2" y2="16"/>${whisker}${dot}</svg>` +
      `<span class="val ${r.dir}">${fx(r.or)}</span></div>`;
  }
  const axisNote = () => `<div class="axis-note"><span></span><svg aria-hidden="true">` +
    [0.25, 1, 4, 16].map(v => `<text x="${xp(v)}" y="11" text-anchor="middle">${v}×</text>`).join('') + '</svg><span></span></div>';
  function card(a) {
    let rows = D.rows.filter(r => r.analysis === a.id && r.method === S.m && r.or != null);
    if (!titleHit(a)) rows = rows.filter(rowHit);
    if (!rows.length) return '';
    rows.sort((x, y) => y.or - x.or);
    const shown = rows.slice(0, 8), more = rows.length - shown.length;
    const top = rows.find(r => r.dir === 'more'), low = [...rows].reverse().find(r => r.dir === 'less');
    const summary = top ? `Most enriched: <b>${esc(top.label)}</b> (${fx(top.or)})` + (low ? `; least: <b>${esc(low.label)}</b> (${fx(low.or)})` : '')
      : low ? `Least often: <b>${esc(low.label)}</b> (${fx(low.or)})` : 'No class differs (q ≤ 0.05 and at least 1.1×)';
    return `<article class="card"><div class="card-head"><h3>${esc(a.title)}</h3><a href="#statistics?a=${encodeURIComponent(a.id)}${S.m !== 'mantel_haenszel' ? '&m=' + S.m : ''}" title="Every test of ${esc(a.title)}" aria-label="Every test of ${esc(a.title)}">›</a></div>` +
      (a.question ? `<p class="q">${esc(a.question)}</p>` : '') + shown.map(dotRow).join('') + axisNote() +
      (more ? `<a class="more-link" href="#statistics?a=${encodeURIComponent(a.id)}">+${more} more ›</a>` : '') +
      `<p class="summary">${summary}</p>` +
      `<div class="exp" role="group" aria-label="Download ${esc(a.title)}">${['pdf', 'svg', 'png', 'tsv'].map(k => `<button type="button" class="exp-btn" data-exp="${k}" data-aid="${esc(a.id)}" title="${EXP_HELP[k]}">${k.toUpperCase()}</button>`).join('')}` +
      `<a class="exp-doc" href="#method">How it was tested</a></div></article>`;
  }
  function overview() {
    const cards = D.analyses.map(card).filter(Boolean);
    return `<div class="page-head"><h2>Where do ${esc(W.marks)} fall in their proteins?</h2>` +
      `<span class="seg" role="group" aria-label="Test">${['mantel_haenszel', 'fisher'].map(m => `<button type="button" data-m="${m}" aria-pressed="${S.m === m}">${METHOD[m][0].toUpperCase() + METHOD[m].slice(1)}</button>`).join('')}</span></div>` +
      `<p class="page-sub">Each class against the other ${esc(W.residues)} of the ${esc(W.marked)} proteins: ${S.m === 'mantel_haenszel' ? 'within protein, each protein a stratum (Mantel–Haenszel), so it separates where a protein’s ' + esc(W.marks) + ' fall from which proteins are ' + esc(W.marked) : 'pooled across proteins (Fisher)'}. Odds ratios on a log scale; hover a row for its counts.</p>` +
      `<div class="legend">${['more', 'less', 'same', 'ns'].map(d => `<span class="${d}"><i style="background:var(--${d === 'ns' ? 'surface' : d})"></i>${DIR_WORDS[d]}</span>`).join('')}</div>` +
      (cards.length ? `<div class="cards">${cards.join('')}</div>` : `<p class="empty">Nothing matches “${esc(S.q)}”.</p>`);
  }

  // ---- Statistics: every test ----------------------------------------------------------------------------------------
  const COLS = [
    ['analysis', 'Analysis', r => r.title, false], ['label', 'Class', r => r.label, false], ['method', 'Test', r => METHOD[r.method] || r.method, false],
    ['a', `${W.marks[0].toUpperCase() + W.marks.slice(1)} in class`, r => r.a, true], ['c', `Other ${W.residues} in class`, r => r.c, true],
    ['or', 'Odds ratio (95% CI)', r => r.or ?? -1, true], ['q', 'q', r => r.q ?? 2, true], ['dir', 'Reading', r => r.dir, false], ['strata', 'Proteins (strata)', r => r.strata ?? -1, true],
  ];
  function shownStatistics() {
    const rows = D.rows.filter(r => (!S.a || r.analysis === S.a) && (S.m === 'both' || r.method === S.m) && rowHit(r));
    const col = COLS.find(c => c[0] === S.sort) || COLS[5];
    rows.sort((x, y) => { const a = col[2](x), b = col[2](y); const c = typeof a === 'number' ? a - b : String(a).localeCompare(String(b)); return S.desc ? -c : c; });
    return rows;
  }
  function statistics() {
    const rows = shownStatistics();
    const opts = [['', 'All analyses'], ...D.analyses.map(a => [a.id, a.title])];
    return `<div class="page-head"><h2>Every test</h2><button class="btn" type="button" id="dl">Download TSV</button></div>` +
      `<p class="page-sub">One row per class and test, in the release’s statistics table. q is Benjamini–Hochberg within each analysis and test; a class reads as more or less often at q ≤ 0.05 and at least 1.1×.</p>` +
      `<div class="filters"><label>Analysis <select id="f-a">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === S.a ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` +
      `<label>Test <select id="f-m">${[['mantel_haenszel', 'Within protein'], ['fisher', 'Pooled'], ['both', 'Both']].map(([v, t]) => `<option value="${v}"${v === S.m ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` +
      `<span class="muted">${int(rows.length)} rows</span></div>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr>${COLS.map(([k, t, , n]) => `<th class="${n ? 'num' : ''}" data-sort="${k}"${S.sort === k ? ` aria-sort="${S.desc ? 'descending' : 'ascending'}"` : ''}>${esc(t)}${S.sort === k ? (S.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>` +
      rows.map(r => `<tr data-i="${r.i}"><td>${esc(r.title)}</td><td class="wrapok">${esc(r.label)}</td><td>${METHOD[r.method] || esc(r.method)}</td>` +
        `<td class="num">${int(r.a)} / ${int(r.a + r.b)}</td><td class="num">${int(r.c)} / ${int(r.c + r.d)}</td>` +
        `<td class="num">${fx(r.or)}${r.lo != null ? ` <span class="muted">(${fx(r.lo)}–${fx(r.hi)})</span>` : ''}</td><td class="num">${fq(r.q)}</td>` +
        `<td><span class="dir ${r.dir}">${DIR_WORDS[r.dir]}</span></td><td class="num">${r.strata != null ? int(r.strata) : ''}</td></tr>`).join('') +
      `</tbody></table></div>`;
  }

  // ---- Method: what the tests do, the inputs, parity -----------------------------------------------------------------
  function method() {
    const R = D.run, m = R.marks || {};
    const inputs = Object.entries(R.inputs || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(Object.entries(R.roles || {}).filter(([, n]) => n === k).map(([r]) => r).join(', '))}</td><td class="mono">${esc(String(v.file).split('/').pop())}</td><td class="mono">${esc(v.md5)}</td></tr>`).join('');
    const par = R.parity ? `<section><h3>Parity with the published release</h3><p>The rebuild recomputes the published rows (<span class="mono">${esc(R.parity.reference)}</span>) and compares them as text, row by row: ` +
      `<span class="${R.parity.equal ? 'ok' : ''}">${R.parity.equal ? 'every row identical' : 'some rows differ'}</span>.</p>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Analysis</th><th>Test</th><th class="num">Rows</th><th>Identical</th></tr></thead><tbody>` +
      R.parity.checked.map(c => `<tr><td>${esc(A[c.analysis]?.title || c.analysis)}</td><td>${METHOD[c.method] || esc(c.method)}</td><td class="num">${c.rows}</td><td>${c.equal ? '<span class="ok">✓</span>' : '✗'}</td></tr>`).join('') +
      '</tbody></table></div></section>' : '';
    return `<div class="page-head"><h2>Method</h2></div><div class="doc">` +
      `<section><h3>What each test asks</h3><p>For every class of an analysis (a disordered region, a motif, a domain context …), the ${esc(W.marks)} are compared with the other ${esc(W.residues)} of the same ${esc(W.marked)} proteins, in two ways:</p><ul>` +
      `<li><b>Within protein</b>: a Mantel–Haenszel odds ratio with each protein a stratum, its Robins–Breslow–Greenland 95% confidence interval, and the continuity-corrected Cochran–Mantel–Haenszel test. It asks whether, inside a protein, the ${esc(W.marks)} sit in the class more often than that protein’s other ${esc(W.residues)}, which separates where ${esc(W.marks)} fall from which proteins were found ${esc(W.marked)}.</li>` +
      `<li><b>Pooled</b>: Fisher’s exact test on all ${esc(W.residues)} together, with the Haldane–Anscombe odds ratio.</li></ul>` +
      `<p>Both count the same ${esc(W.marks)}: those on a protein with at least one other candidate residue. q is Benjamini–Hochberg within each analysis and test. A class reads as more or less often at q ≤ 0.05 and at least 1.1×.</p></section>` +
      `<section><h3>Data</h3><p>Sequences: ${esc(R.snapshot?.release)}, ${int(R.snapshot?.entries)} entries (FASTA MD5 <span class="mono">${esc(R.snapshot?.fasta_md5)}</span>). ` +
      `${esc(W.marks[0].toUpperCase() + W.marks.slice(1))}: ${int(m.counted)} counted on ${int(m.proteins)} proteins, of ${int(m.rows)} rows read (${int(m.selected)} selected; ${int(m.not_on_snapshot)} not on the reference sequences; ${int(m.residue_mismatch)} not on a candidate residue).</p>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Input</th><th>Fills</th><th>File</th><th>MD5</th></tr></thead><tbody>${inputs}</tbody></table></div></section>` + par +
      citeSection() +
      `<section><h3>How this site is made</h3><p>Built by ptmcontext ${esc(D.kit.version)} (commit <span class="mono">${esc(shortCommit(D.kit.commit))}</span>) from <span class="mono">${esc(D.site.config)}</span>, run ${esc(R.written)}. Changing the site is changing that file: its mark, sequences, regions, analyses, colours and pictures. Its citation, version and date are in <span class="mono">${esc(CIT.file || '')}</span>.</p>` +
      `<p>Every download (PDF, SVG, PNG, TSV) carries what it shows, the test and correction, how to cite it and its data sources, the site’s and the kit’s versions, the sequences and inputs it was computed from, and when and where it was exported: in the figure, and in the file’s own metadata (SVG metadata, PNG text fields, PDF properties, the TSV’s # lines).</p></section></div>`;
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
    return (m === 'fisher' ? `Pooled: the ${W.marks} in each class against the other ${W.residues} of the ${W.marked} proteins, Fisher’s exact test (two-sided) with the Haldane–Anscombe odds ratio`
      : `Within protein: the ${W.marks} in each class against the other ${W.residues} of the same protein, each protein a stratum: Mantel–Haenszel odds ratio with its Robins–Breslow–Greenland 95% CI and the continuity-corrected Cochran–Mantel–Haenszel test`) +
      `. Both count the ${W.marks} on proteins with at least one other candidate residue. q: Benjamini–Hochberg within the analysis and test. Reading: more or less often at q ≤ 0.05 and at least 1.1×.`;
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
    lines.push(`${D.site.name}, version ${CIT.version || '–'}${CIT.date ? ' (' + CIT.date + ')' : ''} · ptmcontext ${D.kit.version} (${shortCommit(D.kit.commit)}) · ${sn.release || ''}, FASTA MD5 ${String(sn.fasta_md5 || '').slice(0, 12)}… · run ${String(R.written || '').slice(0, 10)}`);
    lines.push(`Exported ${stamp()} from ${pageUrl()}${CIT.licence ? ' · licence ' + CIT.licence : ''}`);
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
    const head = ['class', 'class_code', 'test', 'odds_ratio', 'ci_low', 'ci_high', 'p', 'q', `${W.marks.replace(/\W+/g, '_')}_in_class`, `${W.marks.replace(/\W+/g, '_')}_total`, 'others_in_class', 'others_total', 'proteins_strata', 'reading'];
    return preamble(`${a.title}, ${METHOD[m]}`, `one row per class of ${a.title} (${a.describe || a.layer}). ${testWords(m)}`) +
      head.join('\t') + '\n' + rows.map(r => [r.label, r.category, r.method, g6(r.or), g6(r.lo), g6(r.hi), g6(r.p), g6(r.q), r.a, r.a + r.b, r.c, r.c + r.d, r.strata ?? '', DIR_WORDS[r.dir]].join('\t')).join('\n') + '\n';
  }
  function statisticsTsv(rows) {
    const lines = D.statistics_tsv.replace(/\n$/, '').split('\n');
    return preamble(S.a ? `statistics, ${A[S.a]?.title || S.a}` : 'statistics',
      `every test shown (${rows.length} rows${S.q ? ', search "' + S.q + '"' : ''}${S.m !== 'both' ? ', ' + METHOD[S.m] + ' tests' : ''}), in the columns of the release statistics table: a, b = ${W.marks} in and not in the class; c, d = the other ${W.residues} in and not in it. ${testWords('mantel_haenszel')} Pooled rows: ${testWords('fisher').split('. ')[0]}.`) +
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
    const title = `${a.title}: where ${W.marks} fall`, sub = `${D.site.name} · ${METHOD_LONG[m]}`;
    const parts = [];
    const T = (x, y, t, o = {}) => parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 11.5}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.fam ? ` font-family="${o.fam}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || PAL.ink}">${esc(t)}</text>`);
    T(P, 30, title, { size: 17, weight: 'bold', fam: FFH });
    T(P, 49, sub, { size: 11.5, fill: PAL.muted });
    let lx = P;
    ['more', 'less', 'same', 'ns'].forEach(d => {
      parts.push(`<circle cx="${lx + 5}" cy="66" r="4.5" fill="${PAL[d]}" stroke="${d === 'ns' ? PAL.muted : PAL[d]}" stroke-width="1.4"/>`);
      T(lx + 14, 70, DIR_WORDS[d], { size: 10.5, fill: PAL.muted }); lx += 22 + tw(DIR_WORDS[d], 10.5);
    });
    let y = 86; const top = y;
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
    T((X0 + X1) / 2, y + 31, `odds ratio, log scale (1× = as often as the other ${W.residues} of the same proteins)`, { size: 10.5, anchor: 'middle', fill: PAL.muted });
    y += 50;
    wrap(testWords(m), Wd - 2 * P, 10.5).forEach(t => { T(P, y, t, { size: 10.5 }); y += 14; });
    y += 6;
    creditLines().forEach(line => wrap(line, Wd - 2 * P, 9.5).forEach(t => { T(P, y, t, { size: 9.5, fill: PAL.muted }); y += 12.5; }));
    const H = Math.ceil(y + P - 6);
    const desc = `${title}. ${testWords(m)} ${creditLines().join(' ')}`;
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
      `<p class="muted">This site: ${esc(CIT.title)}, version ${esc(CIT.version)}${CIT.date ? ' (' + esc(CIT.date) + ')' : ''}${CIT.doi ? `, <a href="https://doi.org/${esc(CIT.doi)}">doi:${esc(CIT.doi)}</a>` : ''}${CIT.licence ? '; licence ' + esc(CIT.licence) : ''}.</p>` +
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
    tip.innerHTML = `<b>${esc(r.label)}</b><br>${esc(r.title)} · ${METHOD[r.method] || esc(r.method)}<br>odds ratio <b>${fx(r.or)}</b>${r.lo != null ? ` (95% CI ${fx(r.lo)}–${fx(r.hi)})` : ''}` +
      `<br>${int(r.a)} of ${int(r.a + r.b)} ${esc(W.marks)} in this class<br>${int(r.c)} of ${int(r.c + r.d)} other ${esc(W.residues)}<br>q ${fq(r.q)}${r.strata != null ? ` · ${int(r.strata)} proteins` : ''}`;
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + 'px';
  }
  document.addEventListener('mousemove', e => {
    const el = e.target.closest('.drow');
    if (el) showTip(e, D.rows[+el.dataset.i]); else tip.hidden = true;
  });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-try],[data-m],th[data-sort],#dl,#dl-cff,#copy-cite,[data-exp],[data-theme-choice]');
    if (!t) return;
    if (t.dataset.go) go(t.dataset.go);
    else if (t.dataset.try) { S.q = t.dataset.try; writeHash(true); render(); }
    else if (t.dataset.m) { S.m = t.dataset.m; writeHash(false); render(); }
    else if (t.dataset.sort) { S.desc = S.sort === t.dataset.sort ? !S.desc : true; S.sort = t.dataset.sort; writeHash(false); render(); }
    else if (t.id === 'dl') download(`${D.site.id}_statistics${S.a ? '_' + S.a : ''}.tsv`, statisticsTsv(shownStatistics()), 'text/tab-separated-values');
    else if (t.dataset.exp) exportCard(t.dataset.exp, t.dataset.aid, t);
    else if (t.id === 'dl-cff') download('CITATION.cff', CIT.cff || '', 'text/yaml');
    else if (t.id === 'copy-cite') copyText(citeText(), t);
    else if (t.dataset.themeChoice) setTheme(t.dataset.themeChoice);
  });
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
