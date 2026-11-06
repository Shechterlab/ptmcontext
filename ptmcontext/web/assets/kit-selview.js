/* A selection's Overview, beyond its tiles:
     what sets it apart, in brief   for a selection that can be tested: a closed fold under its lead with the classes
                                    and values its marks hold more and less often than the site's other marks (the
                                    comparison the "other marks" view makes, kit-select.js contrast, pooled), their
                                    count, and a forest of the strongest; it opens the full comparison
     its proteins, drawn            for a selection too small to test: each of its proteins (up to 12, most selected
                                    marks first) as a line with its domains and disordered regions (the site's own
                                    tracks) and its marks, those selected inked
   Both are figures with PDF, SVG, PNG and TSV and a Method section. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  if (!K.sel) return;
  const PADJ = () => K.PADJ ?? 0.05;
  const EXCL = /^(no |not |unknown|unassigned|other\b|none\b)/i;
  const fx = v => (v == null ? '–' : v < 0.1 ? '< 0.1' : v >= 1e299 ? '> 1,000' : v >= 100 ? int(Math.round(v)) : v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '×';
  const pc = v => (v < 0.1 ? (100 * v).toFixed(1) : (100 * v).toFixed(0)) + '%';

  // ---- what sets it apart: every residue question and attribute of the marks, the selection against the other marks
  let memo = { key: null };
  const selKey = () => JSON.stringify([S.q, S.f]);
  function apart() {
    if (memo.key === selKey() && memo.rows) return memo;
    const saved = S.vs; S.vs = 'marks';
    let rows = [], G = null;
    try {
      G = K.sel.contrastGroups();
      if (K.sel.contrastOK(G)) {
        const qs = Object.values(A).filter(a => a.kind === 'residue' || (a.kind === 'attribute' && !a.provenance));
        rows = qs.flatMap(a => (K.sel.contrast(a.id, 'fisher') || []).filter(r => !r.descriptive && !EXCL.test(r.label || '') && r.a + r.c >= 10));
      }
    } finally { S.vs = saved; }
    const diff = rows.filter(r => r.q != null && r.q <= PADJ() && (r.dir === 'more' || r.dir === 'less'));
    const strength = r => (r.dir === 'more' ? Math.log(r.lo ?? r.or) : -Math.log(r.hi ?? r.or));
    const up = diff.filter(r => r.dir === 'more').sort((x, y) => strength(y) - strength(x)), dn = diff.filter(r => r.dir === 'less').sort((x, y) => strength(y) - strength(x));
    // repeats count once and a class that restates the list is flagged (kit-select.js featureFamilies); the forest and the line show these
    const fu = K.sel.featureFamilies(up), fd = K.sel.featureFamilies(dn);
    memo = { key: selKey(), rows, diff, up, dn, fu, G, shown: [...fu.slice(0, 8), ...fd.slice(0, 4)] };
    return memo;
  }
  const qTitle = r => A[r.analysis]?.title || r.analysis;
  const summaryText = m => (m.fu.some(r => !r.circular) ? m.fu.filter(r => !r.circular).slice(0, 3).map(r => `${r.label} ${fx(r.or)}`).join(', ') + ' · ' : '') + `${int(m.diff.length)} of ${int(m.rows.length)} features differ (q ≤ ${PADJ()})`;
  // the forest, as the page draws it and the figure exports it: each row's odds ratio and 95% CI on a log2 axis
  function forestSvg(rows, w, light) {
    const L = Math.min(300, w * 0.42), R = 96, X0 = L + 8, X1 = w - R, lo = -4, hi = 4, rowH = 22;
    const X = v => X0 + (Math.min(Math.max(Math.log2(Math.max(v, 1e-6)), lo), hi) - lo) / (hi - lo) * (X1 - X0);
    const ink = light ? '#1f2937' : 'currentColor', more = '#B42318', less = '#334155', grid = light ? '#d1d5db' : 'var(--line)';
    const parts = [];
    for (let k = lo; k <= hi; k++) parts.push(`<line x1="${X(2 ** k).toFixed(1)}" x2="${X(2 ** k).toFixed(1)}" y1="0" y2="${rows.length * rowH}" stroke="${k === 0 ? ink : grid}" stroke-width="${k === 0 ? 1.2 : 0.6}"${k === 0 ? '' : ' stroke-dasharray="2 3"'}/>`);
    rows.forEach((r, i) => {
      const y = i * rowH + rowH / 2, c = r.dir === 'more' ? more : less;
      parts.push(`<text x="0" y="${y + 4}" font-size="12" fill="${ink}">${esc((r.label.length > 40 ? r.label.slice(0, 39) + '…' : r.label) + (r.related ? ` +${r.related}` : '') + (r.circular ? ' (restates the list)' : ''))}<tspan fill="${light ? '#6b7280' : 'var(--muted)'}" font-size="12"> · ${esc(qTitle(r).length > 26 ? qTitle(r).slice(0, 25) + '…' : qTitle(r))}</tspan></text>`);
      if (r.lo != null && r.hi != null) parts.push(`<line x1="${X(r.lo).toFixed(1)}" x2="${X(r.hi).toFixed(1)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2"/>`);
      parts.push(`<circle cx="${X(r.or).toFixed(1)}" cy="${y}" r="4.5" fill="${c}"/><text x="${w}" y="${y + 4}" font-size="12" text-anchor="end" fill="${ink}">${esc(fx(r.or))} · ${esc(pc(r.a / (r.a + r.b)))}/${esc(pc(r.c / (r.c + r.d)))}</text>`);
    });
    const yA = rows.length * rowH + 14;
    [[0.25, '¼×'], [1, '1×'], [4, '4×'], [16, '16×']].forEach(([v, t]) => parts.push(`<text x="${X(v).toFixed(1)}" y="${yA}" font-size="12" text-anchor="middle" fill="${light ? '#6b7280' : 'var(--muted)'}">${t}</text>`));
    return { svg: parts.join(''), H: yA + 6 };
  }
  const apartTsv = m => K.preamble(`What sets the selection apart`, `the selection's ${W.marks} against the other ${W.marks}: each class of each question and each attribute of the ${W.marks}, Fisher's exact test (pooled), Haldane odds ratio with Woolf's 95% CI, Benjamini-Hochberg q within each question`) +
    'question\tclass\tlabel\tselected_in\tselected_total\tothers_in\tothers_total\todds_ratio\tci_low\tci_high\tp\tq\treading\n' +
    m.rows.map(r => [qTitle(r), r.category, r.label, r.a, r.a + r.b, r.c, r.c + r.d, r.or, r.lo, r.hi, r.p, r.q, r.dir].map(x => (x == null ? '' : typeof x === 'number' ? String(+x.toPrecision(6)) : String(x).replace(/[\t\n]/g, ' '))).join('\t')).join('\n') + '\n';
  const apartFigure = () => { const m = apart(), f = forestSvg(m.shown, 720, true);
    return K.figureFrame({ title: `What sets your selection apart from the other ${W.marks}`, sub: `${K.sel.describe()}: ${int(m.G?.g1.length || 0)} ${W.marks} against the other ${int(m.G?.g2.length || 0)}. ${summaryText(m)}`,
      body: `<g transform="translate(20,0)">${f.svg}</g>`, bodyH: f.H, W: 760, note: `Pooled odds ratio and 95% CI (Woolf), Fisher's exact test, Benjamini-Hochberg q within each question. Shares are of your selection and of the other ${W.marks}. Exploratory: not adjusted for other selections tried.` }); };
  (K.selLead ||= []).push(() => {
    if (!K.sel.data() || !K.sel.testable()) return '';
    // the row is merged into the selection bar: its summary line sits there, and the bar's button opens this
    return `<details class="apart" id="sel-apart"${memo.open ? ' open' : ' hidden'}><summary><span class="apart-h">What sets it apart from the other ${esc(W.marks)}?</span> <span class="apart-sum muted" id="apart-sum">Comparing…</span></summary><div id="apart-body"></div></details>`;
  });
  const barSum = t => document.querySelectorAll('.sel-apart-sum').forEach(x => { x.textContent = t; x.title = t; });
  K.apartLine = () => (memo.key === selKey() && memo.rows ? (memo.rows.length ? summaryText(memo) : '') : '');
  function fillApart() {
    const el = document.getElementById('sel-apart'); if (!el) return;
    const sum = document.getElementById('apart-sum'), body = document.getElementById('apart-body');
    const draw = () => {
      const m = apart();
      if (!m.rows.length) { sum.textContent = `too few ${W.marks} on one side to compare`; body.innerHTML = ''; barSum(sum.textContent); return; }
      sum.textContent = summaryText(m); barSum(sum.textContent);
      const f = forestSvg(m.shown, 680, false);
      body.innerHTML = `<div class="apart-card"><div class="apart-top"><p class="muted small">Your ${int(m.G.g1.length)} ${esc(W.marks)} against the other ${int(m.G.g2.length)}, pooled. The classes that differ most (q ≤ ${PADJ()}) with their odds ratio and both shares.</p>` +
        K.expBar(['pdf', 'svg', 'png', 'tsv'], 'apexp', 'what sets it apart', 'apart') + '</div>' +
        (m.shown.length ? `<svg class="apart-forest" viewBox="0 0 680 ${f.H}" role="img" aria-label="The classes that differ most">${f.svg}</svg>` : `<p class="muted">No class differs at q ≤ ${PADJ()} with at least 10 ${esc(W.marks)}.</p>`) +
        K.l2Table('apart', m.diff) +
        `<p><button class="btn small" type="button" data-vs="marks">Every question against the other ${esc(W.marks)} ›</button></p></div>`;
    };
    if (memo.key === selKey() && memo.rows) draw(); else setTimeout(draw, 30);       // after the page is on screen
  }
  document.addEventListener('toggle', e => { if (e.target.id === 'sel-apart') { memo.open = e.target.open; if (!memo.open) e.target.hidden = true; } }, true);
  K.clicks.push(['[data-apart-here]', () => { const d = document.getElementById('sel-apart'); if (!d) return K.go('overview', { vs: 'marks' }); d.hidden = false; d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); }]);
  K.clicks.push(['[data-apexp]', btn => K.exportFigure(btn.dataset.apexp, apartFigure, `${D.site.id}_what_sets_it_apart_selection`, btn, () => apartTsv(apart()))]);

  // ---- a selection too small to test: its proteins, drawn ------------------------------------------------------------
  const MAX_DRAWN = 12;
  const TR = Object.fromEntries((D.tracks || []).map(t => [t.kind, t]));
  const drawnOf = () => Object.entries(K.sel.selectedCountByProtein()).sort((a, b) => b[1] - a[1]).slice(0, MAX_DRAWN).map(([pi, n]) => ({ pi: +pi, n, p: D.proteins[pi] }));
  (K.selSmall ||= []).push(() => {
    if (!K.sel.data() || !K.views.protein) return '';
    const ps = drawnOf(); if (!ps.length) return '';
    const np = K.sel.nProteins();
    return `<h3 class="sec-label" id="sec-drawn">Protein maps of your selection${np > ps.length ? ` <span class="muted">(the ${ps.length} with the most selected ${esc(W.marks)})</span>` : ''}</h3>` +
      `<section class="drawn-card"><div class="drawn-top"><p class="muted small">Each protein from end to end: ${(D.tracks || []).filter(t => t.style !== 'segments').map(t => esc(t.title.toLowerCase())).join(', ')}; your ${esc(W.marks)} inked, its other ${esc(W.marks)} gray.</p>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'drexp', 'your proteins', 'drawn')}</div>` +
      ps.map(({ pi, n, p }) => `<div class="drawn-row"><a href="${esc(K.link('protein', p[0]))}"><b>${esc(p[1] || p[0])}</b> <span class="muted">${esc(p[2] || '')}</span></a><span class="muted small">${int(n)} of ${int(p[4])} ${esc(W.marks)} selected · ${int(p[3])} aa</span><svg class="drawn-map" data-drawn="${pi}" viewBox="0 0 700 44" preserveAspectRatio="none" aria-label="${esc(p[1] || p[0])}, drawn"></svg></div>`).join('') + '</section>';
  });
  const recs = {};
  function mapSvg(pi, rec, w, light, all) {
    const p = D.proteins[pi], len = p[3] || 1, X = x => 6 + (x - 0.5) / len * (w - 12), y0 = 30;
    const sel = all ? new Set((rec?.marks || []).map(m => m[0])) : K.sel.selectedPositions(p[0]) || new Set(), ink = light ? '#1f2937' : 'currentColor', gray = '#A3AEB3', mark = '#B42318', parts = [];
    parts.push(`<line x1="${X(0.5)}" x2="${X(len + 0.5)}" y1="${y0}" y2="${y0}" stroke="#CBD5E1" stroke-width="2"/>`);
    (rec?.units || []).forEach(([k, s, e, lab]) => {
      const t = TR[k]; if (!t || t.style === 'segments') return;
      if (t.style === 'disorder') parts.push(`<rect x="${X(s - 0.5).toFixed(1)}" y="${y0 - 3}" width="${Math.max(1, X(e + 0.5) - X(s - 0.5)).toFixed(1)}" height="6" fill="#6F9DB5"><title>${esc(t.title)} ${s}–${e}</title></rect>`);
      else parts.push(`<rect x="${X(s - 0.5).toFixed(1)}" y="${y0 - 8}" width="${Math.max(2, X(e + 0.5) - X(s - 0.5)).toFixed(1)}" height="16" rx="3" fill="#E2B44C" stroke="#B45309" stroke-width="0.6"><title>${esc(lab || t.title)} ${s}–${e}</title></rect>`);
    });
    const marks = (rec?.marks || []).map(m => m[0]);
    const shown = K.prot?.shownPos ? (pos => K.prot.shownPos(p[0], pos)) : (pos => pos);
    marks.filter(pos => !sel.has(pos)).forEach(pos => parts.push(`<line x1="${X(pos).toFixed(1)}" x2="${X(pos).toFixed(1)}" y1="${y0 - 10}" y2="${y0 - 20}" stroke="${gray}" stroke-width="1.2"/><circle cx="${X(pos).toFixed(1)}" cy="${y0 - 21}" r="2.4" fill="${gray}"><title>${shown(pos)}</title></circle>`));
    [...sel].forEach(pos => parts.push(`<line x1="${X(pos).toFixed(1)}" x2="${X(pos).toFixed(1)}" y1="${y0 - 10}" y2="${y0 - 24}" stroke="${mark}" stroke-width="1.6"/><circle cx="${X(pos).toFixed(1)}" cy="${y0 - 25}" r="3.4" fill="${mark}"><title>${shown(pos)} (selected)</title></circle>`));
    return parts.join('').replace(/currentColor/g, ink);
  }
  K.rowMap = mapSvg;      // a protein end to end as one row: (index in D.proteins, its record, width, light, all marks inked); kit-random.js
  function fillDrawn() {
    const svgs = [...document.querySelectorAll('svg[data-drawn]')]; if (!svgs.length || !K.loadProtein) return;
    svgs.forEach(el => {
      const pi = +el.dataset.drawn, acc = D.proteins[pi][0];
      const put = rec => { el.innerHTML = mapSvg(pi, rec, 700, false); };
      if (recs[acc]) put(recs[acc]); else { put(null); K.loadProtein(acc).then(rec => { recs[acc] = rec; if (el.isConnected) put(rec); }, () => {}); }
    });
  }
  const drawnFigure = () => {
    const ps = drawnOf(), rowH = 58, body = ps.map(({ pi, n, p }, i) => `<g transform="translate(20,${i * rowH})"><text x="0" y="12" font-size="12" font-weight="bold" fill="#1f2937">${esc(p[1] || p[0])}</text><text x="${(p[1] || p[0]).length * 7.5 + 10}" y="12" font-size="10.5" fill="#6b7280">${esc(p[0])} · ${int(n)} of ${int(p[4])} ${esc(W.marks)} selected · ${int(p[3])} aa</text><g transform="translate(0,12)">${mapSvg(pi, recs[p[0]], 720, true)}</g></g>`).join('');
    return K.figureFrame({ title: 'Protein maps of your selection', sub: `${K.sel.describe()}: ${int(K.sel.nMarks())} ${W.marks} on ${int(K.sel.nProteins())} proteins`, body, bodyH: ps.length * rowH, W: 760,
      note: `Each protein from end to end: ${(D.tracks || []).filter(t => t.style !== 'segments').map(t => t.title.toLowerCase()).join(', ')}; the selected ${W.marks} red, the protein's other ${W.marks} gray.` });
  };
  const drawnTsv = () => K.preamble('Protein maps of your selection', `the selection's proteins, each ${W.mark} with whether it is selected`) + 'accession\tgene\tposition\tselected\n' +
    drawnOf().flatMap(({ p }) => { const sel = K.sel.selectedPositions(p[0]) || new Set(); return (recs[p[0]]?.marks || []).map(m => [p[0], p[1], K.prot?.shownPos ? K.prot.shownPos(p[0], m[0]) : m[0], sel.has(m[0]) ? 'yes' : 'no'].join('\t')); }).join('\n') + '\n';
  K.clicks.push(['[data-drexp]', btn => Promise.all(drawnOf().map(({ p }) => recs[p[0]] || K.loadProtein(p[0]).then(r => { recs[p[0]] = r; }, () => {}))).then(() => K.exportFigure(btn.dataset.drexp, drawnFigure, `${D.site.id}_your_proteins_selection`, btn, drawnTsv))]);

  (K.afterRender ||= []).push(() => { if (S.view === 'overview') { fillApart(); fillDrawn(); } });

  // ---- their Method sections ---------------------------------------------------------------------------------------
  (K.methodParts ||= []).push(() => `<section id="m-apart"><h3>What sets a selection apart</h3><p>A selection’s ${esc(W.marks)} are compared with the other ${esc(W.marks)}, class by class, for every question about where ${esc(W.marks)} sit and every attribute of the ${esc(W.marks)} except how they were found. Test: Fisher’s exact test on the pooled 2×2 table, Haldane odds ratio with Woolf’s 95% CI, Benjamini–Hochberg q within each question. A class differs at q ≤ ${PADJ()} and 1.1× or more, with at least 10 ${esc(W.marks)} in it across both sides. The summary names the three that differ most (by the CI bound nearest 1). The full comparison (Compared with: other ${esc(W.marks)}) adds tests within proteins and within studies. It is exploratory, since the selection was chosen by looking.</p></section>` +
    `<section id="m-drawn"><h3>Protein maps of a small selection</h3><p>A selection too small to test (under ${int(K.sel.MIN.proteins)} proteins or ${int(K.sel.MIN.marks)} ${esc(W.marks)}) shows up to ${MAX_DRAWN} proteins instead, those with the most selected ${esc(W.marks)} first. Each is drawn end to end with the regions of the questions (${(D.tracks || []).filter(t => t.style !== 'segments').map(t => esc(t.title.toLowerCase())).join(', ')}), selected ${esc(W.marks)} red and the others gray. The counts that hold for any selection follow.</p></section>`);
  void cap;
});
