/* The cards front end's home (website.front.mode: cards): a search with example chips, the selection as chips with its
   count, a Filter button, and a handful of cards (the site's own questions, from website.front or derived from its
   sections), each a few rows of fold (protein sets) or odds ratio (residue questions) with a thin 95% interval, a q dot
   (filled at q ≤ 0.05) and a muted n, on one shared log scale. The rows are the site's own (D.rows, read through the
   kit), or the selection's, tested again in the browser by K.sel; a selection under the site's minimum, or made with
   a card's own question, leaves that card on the whole dataset. Nothing is computed here. A module of the site kit:
   K.front = { home(), cards, ... }; it registers no page of its own (the Overview draws it) and does nothing
   when the site's mode is classic. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int } = K;
  const F = D.front;
  if (!F || F.mode !== 'cards') return;
  const narrow = () => matchMedia('(max-width: 700px)').matches;
  const MIN = () => K.sel.MIN;
  const unit = n => (n === 1 ? W.mark : W.marks);
  const plural = (n, w) => `${int(n)} ${w}${n === 1 ? '' : 's'}`;
  const CARDS = F.cards || [];
  const short = i => F.short?.[i] || A[i]?.title || i;
  // one name for a question everywhere: its short name (website.front.short) is the title the rest of the page reads
  Object.entries(F.short || {}).forEach(([i, t]) => { if (A[i] && t) A[i].title = t; });
  const cardOfQ = q => CARDS.find(c => c.questions.includes(q));
  const VERSION = D.dataset?.version || '';
  // ---- the address: the abundance check and the data version a link was made with --------------------------------------
  K.paramsIn.push(p => { S.ab = p.get('ab') === '1'; S.dvLink = p.get('dv') || ''; });
  K.paramsOut.push(p => { if (S.ab) p.set('ab', '1'); const v = S.dvLink || VERSION; if (v && (S.q || K.sel.encode() || S.ab || S.vs !== 'residues' || S.dvLink || S.view !== 'overview' || S.arg)) p.set('dv', v); });      // every link that names a page, a protein or a selection carries the version
  // ---- the selection's state -----------------------------------------------------------------------------------------
  const selOn = () => K.selOn();
  const ready = () => !!K.sel.data();
  const live = () => selOn() && ready() && K.sel.testable() && K.sel.nMarks() > 0;
  // ---- rows ---------------------------------------------------------------------------------------------------------------
  const method = () => (S.m === 'fisher' ? 'fisher' : 'mantel_haenszel');
  const measureOf = (card, aid) => (card.facets.find(f => f.analysis === aid) || {}).measure || (A[aid]?.kind === 'protein_sets' ? 'fold' : 'odds');
  const valueOf = (r, measure) => (measure === 'fold' ? r.fold ?? r.eff : r.or ?? r.eff);
  const labelOf = (aid, r) => F.row_labels?.[aid]?.[r.category] || r.label;
  // the classes a card's home shows: those it names, or else the strongest rows of the whole dataset at q ≤ q_max
  function keysOf(card, aid, whole) {
    const h = card.home, skip = new Set(F.summary_only?.[aid] || []);
    if (h.classes) return h.classes.filter(c => whole.some(r => r.category === c));
    // the strongest rows at q ≤ q_max first; a card with fewer than its rows is filled with the next strongest (drawn hollow, q above the cut)
    const ok = whole.filter(r => !skip.has(r.category) && r.eff != null && r.eff > 0 && r.eff < 1e100 && !/^(no |not |unknown|unassigned)/i.test(r.label));
    const strong = r => (r.q != null && r.q <= (h.q_max ?? 0.05) && (r.dir === 'more' || r.dir === 'less') ? 0 : 1), by = (x, y) => strong(x) - strong(y) || (x.q ?? 1) - (y.q ?? 1) || Math.abs(Math.log(y.eff)) - Math.abs(Math.log(x.eff));
    const big = ok.filter(r => r.a == null || r.a >= MIN().proteins);       // the home shows robust rows: at least the site's minimum (the question's page lists all)
    return (big.length ? big : ok).sort(by).slice(0, card.rows || F.rows).map(r => r.category);
  }
  // `over`: {aid, n} reads another question of the card (a topic tile on the Sections page) and sets the number of rows
  function homeRows(card, over = {}) {
    const m = method(), hasRows = i => A[i] && K.rowsFor(A[i], m).length;
    // the card's home question, or the next of its facets that this site ran (a derived card may name one with no rows)
    const aid = [over.aid, card.home?.analysis, ...card.facets.map(f => f.analysis)].find(i => i && hasRows(i)), a = A[aid]; if (!a) return { rows: [] };
    const measure = measureOf(card, aid), whole = K.rowsFor(a, m), own = selOn() && K.sel.madeWith(aid) && !K.vsOn();
    const useLive = live() && !own, byCat = {};
    (useLive ? K.rowsOf(a, m) : whole).forEach(r => { byCat[r.category] = r; });
    const wholeBy = Object.fromEntries(whole.map(r => [r.category, r]));
    const hm = over.aid && over.aid !== card.home?.analysis ? { ...card, home: { q_max: card.home?.q_max } } : card;
    const rows = keysOf({ ...hm, rows: over.n || card.rows }, aid, whole).map(cat => {
      const r = byCat[cat], w = wholeBy[cat];
      return { aid, cat, key: K.fkeyOf(a), measure, label: labelOf(aid, w || r || { category: cat, label: cat }), r, w, live: useLive };
    }).map(x => {
      const r = x.r, v = r ? valueOf(r, x.measure) : null, thin = !!(x.live && r && r.a < MIN().proteins);
      const wv = x.live && x.w ? valueOf(x.w, x.measure) : null;
      return { ...x, v, wv: wv != null && Number.isFinite(wv) && wv < 1e100 ? wv : null, lo: r && r.lo != null && r.hi != null && x.measure === 'odds' ? [r.lo, r.hi] : null, q: r ? r.q : null, dir: r ? r.dir : 'ns', n: r ? r.a : null, desc: !!(r && (r.descriptive || (r.q == null && x.live))), thin, absent: !r || v == null };
    });
    rows.sort((x, y) => (y.v ?? -1) - (x.v ?? -1));
    return { rows, own, aid };
  }
  // ---- one axis for each card: its own values (with their intervals and the whole dataset's), always with 1× --------------
  const fmtT = t => (t < 1 ? (Number.isInteger(+(1 / t).toFixed(3)) ? '1/' + Math.round(1 / t) : String(+t.toFixed(2))) : String(+t.toFixed(2)));
  const NICE = [1 / 64, 1 / 32, 1 / 16, 1 / 10, 1 / 8, 1 / 5, 1 / 4, 1 / 3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 32, 64];
  function axisOf(vals, min = 1.0) {
    const v = vals.filter(x => x > 0 && x < 1e100); v.push(1);
    let a = Math.log2(Math.max(1 / 64, Math.min(...v))) - 0.1, b = Math.log2(Math.min(64, Math.max(...v))) + 0.1;
    if (b - a < min) { const mid = (a + b) / 2; a = mid - min / 2; b = mid + min / 2; }
    const lo = 2 ** a, hi = 2 ** b, L = x => (Math.log2(Math.min(hi, Math.max(lo, x))) - a) / (b - a);
    const gap = narrow() ? 0.32 : 0.2, ticks = [1];                  // about 36 px between labels
    NICE.filter(t => t >= lo && t <= hi && t !== 1).sort((p, q) => Math.abs(Math.log2(p)) - Math.abs(Math.log2(q))).forEach(t => { if (ticks.every(u => Math.abs(L(t) - L(u)) >= gap)) ticks.push(t); });
    if (ticks.length < 2) { const far = NICE.filter(t => t >= lo && t <= hi && t !== 1).sort((p, q) => Math.abs(L(q) - L(1)) - Math.abs(L(p) - L(1)))[0]; if (far) ticks.push(far); }     // always 1× and one more
    return { L, ticks: ticks.sort((p, q) => p - q), lo, hi };
  }
  const PX = f => (3 + 94 * f).toFixed(1);                   // the track keeps 3% at each end, so a dot at the end is whole
  const axisHtml = ax => `<div class="fr-ax" aria-hidden="true"><span class="tk">${ax.ticks.map(t => `<i${t === 1 ? ' class="one"' : ''} style="left:${PX(ax.L(t))}%">${fmtT(t)}×</i>`).join('')}</span></div>`;
  // ---- one row: label, track (a thin line, the 95% interval as a bar, the dot, the whole dataset as a ring), value with q dot, n --------
  const MARK = { holds: ['✓', 'holds within abundance deciles'], weaker: ['≈', 'weaker within abundance deciles'], lost: ['▼', 'not significant within abundance deciles'] };
  const fin = v => (v != null && Number.isFinite(v) ? Math.min(v, 1e3) : null);
  function rowHtml(x, ax, attrs, on) {
    const v = fin(x.v), x1 = PX(ax.L(1)), x2 = v != null ? PX(ax.L(v)) : null;
    const dir = x.absent ? 'ns' : x.dir || 'ns', depl = x.measure === 'fold' && v != null && v < 1;
    const grid = ax.ticks.filter(t => t !== 1).map(t => `<line class="gl" x1="${PX(ax.L(t))}%" x2="${PX(ax.L(t))}%" y1="0" y2="100%"/>`).join('');
    const ci = x.lo ? `<line class="ci ${dir}" x1="${PX(ax.L(Math.max(x.lo[0], 1 / 64)))}%" x2="${PX(ax.L(Math.min(x.lo[1], 64)))}%" y1="50%" y2="50%"/>` +
      [x.lo[0], x.lo[1]].map(b => `<line class="cap ${dir}" x1="${PX(ax.L(Math.min(64, Math.max(b, 1 / 64))))}%" x2="${PX(ax.L(Math.min(64, Math.max(b, 1 / 64))))}%" y1="32%" y2="68%"/>`).join('') : '';
    const ghost = x.wv != null ? `<circle class="whole" cx="${PX(ax.L(x.wv))}%" cy="50%" r="4"/>` : '';
    const track = `<svg class="fr-track" aria-hidden="true">${grid}<line class="one" x1="${x1}%" x2="${x1}%" y1="0" y2="100%"/>` +
      (x2 == null ? '' : `<line class="stem ${dir}" x1="${x1}%" x2="${x2}%" y1="50%" y2="50%"/>`) + ci + ghost +
      (x2 == null ? '' : `<circle class="dot ${dir}${x.desc ? ' desc' : ''}" cx="${x2}%" cy="50%" r="4.5"/>`) + '</svg>';
    const mk = S.ab && x.measure === 'fold' && !x.live && x.r && x.q != null && x.q <= K.PADJ && v > 1 ? MARK[K.holdStatus(x.r)] : null;
    const val = x.absent ? '–' : K.fxn(v) + '×';
    const tip = x.absent ? `${x.label}: none in this selection` :
      `${x.label}: ${x.measure === 'fold' ? 'fold enrichment' : 'odds ratio'} ${K.fxn(v)}×${x.lo ? ` (95% CI ${K.fxn(x.lo[0])}–${K.fxn(x.lo[1])})` : ''}${x.q != null ? `, q ${K.fq(x.q)}` : ''}${x.n != null ? `, n ${int(x.n)}` : ''}` +
      (x.wv != null ? `. Whole dataset: ${K.fxn(x.wv)}× (the ring)` : '') +
      (x.desc ? '. Shown, not tested (the selection was made with this question)' : '') +
      (depl ? '. Not tested for depletion: the test asks only whether the set is over-represented' : '') +
      (x.measure === 'fold' && !x.lo ? '. No interval: a one-sided set test' : '') +
      (x.thin ? `. Fewer than ${MIN().proteins} in this selection: read with care` : '') + (mk ? `. ${mk[1]}` : '');
    const cls = `fr-row dir-${dir}${on ? ' on' : ''}${x.thin || x.absent ? ' thin' : ''}`;
    const inner = `<span class="fr-lab"><span>${esc(x.label)}</span></span>${track}<span class="fr-val">${esc(val)}<i class="fr-q ${dir}${x.desc ? ' desc' : ''}" aria-hidden="true"></i>${mk ? `<i class="fr-mk" aria-hidden="true">${mk[0]}</i>` : ''}</span><span class="fr-n">${x.n != null ? int(x.n) : ''}</span>`;
    return attrs.href ? `<a class="${cls}" href="${esc(attrs.href)}" title="${esc(tip)}" aria-label="${esc(tip)}">${inner}</a>`
      : `<button type="button" class="${cls}" data-f="${esc(x.key)}" data-v="${esc(x.cat)}" aria-pressed="${!!on}" title="${esc(tip)}" aria-label="${esc(tip)}">${inner}</button>`;
  }
  // the numbers a card's axis must hold: values, interval ends and the whole dataset's
  const valsOf = rows => rows.flatMap(r => [r.v, r.wv, ...(r.lo || [])]).filter(v => v != null);
  // ---- the one-line answer, from the card's own rows --------------------------------------------------------------------------
  function answerOf(rows, fold, noq) {
    const ok = rows.filter(r => !r.absent && r.v != null && !r.desc), sig = r => (noq || (r.q != null && r.q <= K.PADJ)) && (r.dir === 'more' || r.dir === 'less');
    const more = ok.filter(r => sig(r) && r.dir === 'more').sort((a, b) => b.v - a.v).slice(0, 2), less = fold ? [] : ok.filter(r => sig(r) && r.dir === 'less').sort((a, b) => a.v - b.v).slice(0, 1);
    const nm = r => `${r.label} (${K.fxn(r.v)}×)`;
    if (!ok.length) return rows.length && rows.every(r => r.absent) ? 'None of these is in this selection.' : '';
    if (!more.length && !less.length) return 'No row here differs from the other proteins.'.replace('proteins', fold ? 'proteins' : W.residues);
    return [more.length ? `More often: ${more.map(nm).join(', ')}.` : '', less.length ? `Less often: ${less.map(nm).join(', ')}.` : ''].filter(Boolean).join(' ');
  }
  // ---- the cell card: the kit's own drawing, and the parts that differ most as rows ---------------------------------------
  function cellRows() {
    if (!K.cell?.parts) return [];
    return K.cell.parts().filter(p => p.or != null && p.direction !== 'na' && p.maps >= 2).sort((x, y) => Math.abs(y.l2) - Math.abs(x.l2)).slice(0, 5)
      .map(p => ({ label: F.row_labels?.[D.cell?.id]?.[p.part] || p.row, v: p.or, q: null, dir: p.direction, n: p.maps, nl: `${p.maps} maps`, measure: 'odds', part: p.part, cellRow: true }));
  }
  // ---- a card's rows as a table: each row says which test made it, n, p, q, the interval, the data version and the selection --------
  const LAST = { cards: [] };
  const TEST_OF = { fold: 'one-sided hypergeometric test (fold enrichment); q Benjamini-Hochberg', mantel_haenszel: 'Mantel-Haenszel odds ratio within each protein, continuity-corrected CMH test; q Benjamini-Hochberg', fisher: 'two-sided Fisher exact test on counts across all proteins (Haldane-Anscombe odds ratio); q Benjamini-Hochberg' };
  function cardTsv(key) {
    const x = LAST.cards.find(y => y.c.key === key); if (!x) return '';
    const c = x.c, g6 = K.g6, wholeNote = x.own ? 'whole dataset (your selection was made with this question)' : '';
    const sel = K.selText ? K.selText() : '';
    const rows = [...x.rows.map(r => {
      const test = r.measure === 'fold' ? TEST_OF.fold : TEST_OF[method()];
      const what = r.live ? 'selection tested again in the browser' : (selOn() ? 'whole dataset' + (wholeNote ? ' (' + wholeNote + ')' : '') : 'whole dataset');
      return [c.title, short(r.aid), r.label, r.cat, test, r.measure === 'fold' ? 'fold enrichment' : 'odds ratio', r.v == null ? '' : g6(r.v), r.lo ? g6(r.lo[0]) : '', r.lo ? g6(r.lo[1]) : '', r.n ?? '', r.r ? g6(r.r.p) : '', g6(r.q), r.absent ? 'none in this selection' : r.desc ? 'shown, not tested' : r.dir === 'more' ? 'more often' : r.dir === 'less' ? 'less often' : 'no significant difference', what, VERSION, sel];
    }), ...(x.cellRows || []).map(r => [c.title, 'cell maps', r.label, r.part || '', 'summary of the cell maps: abundance-adjusted median odds ratio over maps, not a test', 'odds ratio', g6(r.v), '', '', r.n ?? '', '', '', r.dir || '', 'whole dataset', VERSION, sel])];
    return K.preamble(`${c.title}: the card's rows`, `the rows the home card shows (${rows.length}); fold or odds ratio with a 95% interval where the row has one, n the marks in the class (the proteins in the set for a protein-set question). Not adjusted for other selections tried.`) +
      ['card', 'question', 'row', 'code', 'test', 'measure', 'value', 'ci_low', 'ci_high', 'n', 'p', 'q', 'reading', 'tested_on', 'data_version', 'selection'].join('\t') + '\n' + rows.map(r => r.map(v => String(v ?? '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n') + '\n';
  }
  // ---- chips ---------------------------------------------------------------------------------------------------------------
  function chipLabel(k, vals) {
    const id = k.split(':')[1], card = cardOfQ(id), name = (card && card.chip) || K.sel.keyName(k);
    if (vals.length === 1 && vals[0] === '*') return `Any ${/^[A-Z][^A-Z]*$/.test(name) ? name.toLowerCase() : name}`;      // "Any condensate", not "Condensate: *"
    return `${name}: ${vals.map(v => (v === '*' ? 'any' : K.sel.valueName(k, v))).join(' or ')}`;
  }
  function chipsHtml() {
    const c = K.sel.compute(), out = [], rm = (attr, label) => `<button type="button" ${attr} aria-label="Remove ${esc(label)}">×</button>`;
    const bad = new Set((c.unresolved || []).map(x => x.toLowerCase()));
    const plain = (String(S.q).match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || []).filter(t => !(/^[a-z_][\w]*:.+$/i.test(t) && K.sel.isTermKey(t.split(':')[0])) && !bad.has(t.toLowerCase()));
    if (plain.length) { const l = `Search: ${plain.length > 3 ? plain.slice(0, 3).join(' ') + ` +${plain.length - 3}` : plain.join(' ')}`; out.push(`<span class="sel-chip" title="${esc(plain.join(' '))}">${esc(l)}${rm('data-sel-clear-q', l)}</span>`); }
    c.cons.forEach(([k, v, fromSearch, raw]) => { const l = chipLabel(k, v); out.push(`<span class="sel-chip">${esc(l)}${rm(fromSearch ? `data-sel-drop-term="${esc(raw)}"` : `data-sel-clear="${esc(k)}"`, l)}</span>`); });
    (c.unresolved || []).forEach(raw => { if (/:/.test(raw)) out.push(`<span class="sel-chip bad" title="Matches nothing">${esc(raw)}${rm(`data-sel-drop-term="${esc(raw)}"`, raw)}</span>`); });
    return out.join('');
  }
  // ---- the header of the page: the headline numbers, small; the selection as one line; the proteins it holds ------------------
  const NUMS = { marks: () => [int(D.counts.marks), W.marks], proteins: () => [int(D.counts.proteins), 'proteins'] };
  const headline = () => (D.stats || ['marks', 'proteins']).map(t => (typeof t === 'string' ? NUMS[t]?.() : [int((D.attribute_counts || {})[t.attribute] ?? 0), t.label])).filter(Boolean);
  const headHtml = () => { const h = headline(); return `<span class="fr-hl">${h.map(([n, w], i) => `<span${i > 1 ? ' class="fr-hl-more"' : ''}>${i ? ' · ' : ''}<b>${esc(n)}</b> ${esc(w)}</span>`).join('')}</span>`; };
  const sitesOn = () => `${int(K.sel.nMarks())} ${unit(K.sel.nMarks())} on ${plural(K.sel.nProteins(), 'protein')}`;
  const tools = () => `${ready() ? K.front.listLink?.() || '' : ''}${ready() ? K.logoBtn?.() || '' : ''}<button type="button" class="btn small" data-sel-save>Save</button>${K.views.compare && K.sel.savedList().length ? '<button type="button" class="btn small" data-go-compare>Compare</button>' : ''}` +
    `<button type="button" class="btn small" data-vs="${S.vs === 'marks' ? 'residues' : 'marks'}" aria-pressed="${S.vs === 'marks'}" title="Compare the selection with the site’s other ${esc(W.marks)}, not with the other ${esc(W.residues)} of its proteins">What sets it apart</button>` +
    `<button type="button" class="btn small" data-sel-copy>Copy link</button><button type="button" class="linkish fr-all" data-sel-clear-all>Whole dataset</button>`;
  // the selection on one line: the count, its chips (one sideways strip on a phone) and, behind the ⋯ on a phone, the buttons
  function barHtml() {
    const act = selOn(), loading = act && !ready();
    if (!act) return `<div class="fr-bar idle"><span class="fr-count muted">${esc(headline().slice(0, 2).map(([n, w]) => `${n} ${w}`).join(' on '))}</span><span class="fr-tools"><button type="button" class="btn small" data-sel-copy>Copy link</button></span></div>`;
    return `<div class="fr-bar sel"><b class="fr-count" role="status">${loading ? 'Loading the selection…' : esc(sitesOn())}</b><span class="fr-chips">${ready() ? chipsHtml() : ''}</span>` +
      `<button type="button" class="btn small fr-morebtn" data-fr-more aria-expanded="false" aria-haspopup="true" aria-label="More: save, compare, copy link, whole dataset">⋯</button><span class="fr-tools" role="group" aria-label="Selection actions">${tools()}</span></div>`;
  }
  // the proteins of the selection, those with most sites first, each a link to its page
  function protsHtml() {
    const SD = K.sel.peek(), c = K.sel.compute(); if (!SD || !c.active || !c.marks) return '';
    const cnt = new Map(); c.marks.forEach(i => { const p = SD.marks[i][0]; cnt.set(p, (cnt.get(p) || 0) + 1); });
    const all = [...cnt].sort((a, b) => b[1] - a[1] || a[0] - b[0]), N = narrow() ? 12 : 24, shown = all.slice(0, N);
    if (!shown.length) return '';
    return `<div class="fr-prots" role="group" aria-label="Proteins of the selection, with their number of ${esc(W.marks)}">${shown.map(([p, n]) => { const g = D.proteins[p]; return `<a class="fr-pc" href="${esc(K.link('protein', g[0]))}" title="${esc(g[2] || g[1] || g[0])}: ${int(n)} ${esc(n === 1 ? W.mark : W.marks)} in the selection">${esc(g[1] || g[0])}<b>${int(n)}</b></a>`; }).join('')}` +
      (all.length > N ? `<a class="fr-pc more" href="${esc(K.link('proteins'))}">+${int(all.length - N)} more</a>` : '') + '</div>';
  }
  // one trail for every page but the home: Home / a / b (the last, not a link; a part is [label, href])
  const trail = parts => `<nav class="fr-nav" aria-label="Trail"><a href="${esc(K.link('overview'))}">Home</a>${parts.map(([t, h], i) => `<span aria-hidden="true">/</span>${h && i < parts.length - 1 ? `<a href="${esc(h)}">${esc(t)}</a>` : `<span class="fr-here"${i === parts.length - 1 ? ' aria-current="page"' : ''}>${esc(t)}</span>`}`).join('')}</nav>`;
  // the description and the citation, from the header band's own words
  function ledeHtml() {
    const q = x => (document.querySelector ? document.querySelector(x) : null), w = q('.hero .lede-what'), ci = q('.hero .lede-cite');
    return (w ? esc(w.textContent.trim()) : '') + (ci ? ` <span class="fr-cite">${ci.innerHTML}</span>` : '');
  }
  // ---- a card as a figure: the title, rows and credit, for the PDF, SVG and PNG --------------------------------------------------------
  function figureOf(x) {
    const P = K.PAL, ax = x.ax, rows = x.cellRows?.length ? x.cellRows : x.rows, c = x.c, TX0 = 270, TX1 = 590, RH = 26, top = 24, X = v => TX0 + ax.L(v) * (TX1 - TX0);
    const t = (px, y, s, o = {}) => `<text x="${px.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 12.5}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || P.ink}">${esc(s)}</text>`;
    const col = d => (d === 'more' ? P.more : d === 'less' ? P.less : P.same), parts = [];
    ax.ticks.forEach(tk => parts.push(`<line x1="${X(tk).toFixed(1)}" x2="${X(tk).toFixed(1)}" y1="${top - 6}" y2="${top + rows.length * RH}" stroke="${tk === 1 ? P.muted : P.line}" stroke-width="${tk === 1 ? 1.4 : 0.7}"/>`, t(X(tk), top - 10, fmtT(tk) + '×', { size: 10.5, anchor: 'middle', fill: P.muted })));
    rows.forEach((r, k) => {
      const y = top + k * RH + RH / 2, v = fin(r.v), d = r.absent ? 'ns' : r.dir || 'ns', fill = (d === 'more' || d === 'less') && !r.desc ? col(d) : P.bg;
      parts.push(t(24, y + 4, r.label.length > 34 ? r.label.slice(0, 33) + '…' : r.label));
      if (v == null) { parts.push(t(TX1 + 14, y + 4, '–', { weight: 'bold' })); return; }
      if (r.lo) parts.push(`<line x1="${X(Math.max(r.lo[0], 1 / 64)).toFixed(1)}" x2="${X(Math.min(r.lo[1], 64)).toFixed(1)}" y1="${y}" y2="${y}" stroke="${col(d)}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`);
      if (r.wv != null) parts.push(`<circle cx="${X(r.wv).toFixed(1)}" cy="${y}" r="4.2" fill="none" stroke="${P.muted}" stroke-width="1.2" stroke-dasharray="2 2"/>`);
      parts.push(`<circle cx="${X(v).toFixed(1)}" cy="${y}" r="4.8" fill="${fill}" stroke="${col(d)}" stroke-width="1.6"/>`, t(TX1 + 14, y + 4, K.fxn(v) + '×', { weight: 'bold' }));
      if (r.n != null) parts.push(t(TX1 + 100, y + 4, int(r.n), { size: 11, anchor: 'end', fill: P.muted }));
    });
    const fold = x.rows[0]?.measure === 'fold', sel = selOn() ? `Selection: ${K.selText ? K.selText() : 'your selection'}.` : 'Whole dataset.';
    return K.figureFrame({ title: c.title, sub: `${x.answer ? x.answer + ' ' : ''}${sel}`.trim(), W: 720, legend: [[P.more, P.more, 'more often (q ≤ 0.05)'], [P.less, P.less, 'less often (q ≤ 0.05)'], [P.bg, P.same, 'no difference or not tested']],
      body: parts.join(''), bodyH: top + rows.length * RH + 8, extra: { card: c.key, selection: selOn() },
      note: `${fold ? 'Fold enrichment, a one-sided test of over-representation (a value below 1× is not tested). ' : 'Odds ratio against the other ' + W.residues + ' of the same proteins. '}Thin bar: 95% interval. Gray number: n.${x.cellRows?.length ? ' The cell rows summarize the cell maps (median, adjusted for abundance); they are not a test.' : ''} Each card has its own axis.` });
  }
  K.clicks.push(['[data-frexp]', el => { const key = el.closest('[data-card]')?.dataset.card, x = LAST.cards.find(y => y.c.key === key); if (!x) return;
    K.exportFigure(el.dataset.frexp, () => figureOf(x), `${D.site.id}_${key}_card${selOn() ? '_selection' : ''}_${(VERSION || 'v').replace(/[^\w.]+/g, '')}`, el, () => cardTsv(key)); }]);
  // ---- the share tiles: the share of the marked in a class against the share of the others -------------------------------------
  function shareTile(t) {
    const m = method(), rows = t.rows.map(r => { const a = A[r.analysis]; if (!a) return null; const x = (live() ? K.rowsOf(a, m) : K.rowsFor(a, m)).find(y => y.category === r.class); if (!x || !(x.a + x.b) || !(x.c + x.d)) return null;
      return { label: r.label || labelOf(r.analysis, x), s1: x.a / (x.a + x.b), s2: x.c / (x.c + x.d), n: x.a, N: x.a + x.b, o: x.c, O: x.c + x.d }; }).filter(Boolean);
    if (!rows.length) return '';
    const mx = Math.max(...rows.flatMap(r => [r.s1, r.s2])), pc = v => (v >= 0.1 ? Math.round(100 * v) : +(100 * v).toFixed(1)) + '%';
    return `<article class="tile fr-stile"><header><h3>${esc(t.title)}</h3></header><div class="fr-sbars">${rows.map(r => `<div class="fr-sbar" title="${esc(`${r.label}: ${int(r.n)} of ${int(r.N)} (${pc(r.s1)}); the others ${int(r.o)} of ${int(r.O)} (${pc(r.s2)})`)}"><span class="fr-sl">${esc(r.label)}</span>` +
      `<span class="fr-sb"><i class="a" style="width:${(100 * r.s1 / mx).toFixed(1)}%"></i><i class="b" style="width:${(100 * r.s2 / mx).toFixed(1)}%"></i></span><span class="fr-sv"><b>${pc(r.s1)}</b> · ${pc(r.s2)}</span></div>`).join('')}</div>` +
      (t.note ? `<p class="tfoot">${esc(t.note)}</p>` : '') + '</article>';
  }
  const COUNT_TILES = ['provenance', 'perturbations'];
  const tilesHtml = () => {
    const ct = COUNT_TILES.filter(i => A[i]?.tile).map(i => { try { return A[i].tile({}); } catch (e) { return ''; } }), st = (F.tiles || []).map(shareTile);
    const all = [ct[0], ct[1], ...st].filter(Boolean).join('');
    return all ? `<section class="fr-tiles" aria-label="Sources, perturbations and shares"><div class="tiles">${all}</div></section>` : '';
  };
  // ---- the home ----------------------------------------------------------------------------------------------------------
  let infoOpen = false, lastLive = '';
  function cellLegend() {
    if (!K.cell?.parts) return '';
    const ps = K.cell.parts().filter(p => p.or != null && p.direction !== 'na').sort((a, b) => b.or - a.or);
    return ps.length ? `<ul class="fr-clegend" aria-label="Parts of the cell drawing">${ps.map(p => `<li><button type="button" class="fr-cl" data-fr-part="${esc(p.part)}" title="Select the ${esc(W.marks)} of this part"><i class="kd ${p.direction === 'more' ? 'more' : p.direction === 'less' ? 'less' : 'ns'}"></i>${esc(F.row_labels?.[D.cell?.id]?.[p.part] || p.row)} <b>${K.fxn(p.or)}×</b></button></li>`).join('')}</ul>` : '';
  }
  K.clicks.push(['[data-fr-part]', el => K.sel.toggle('w:' + D.cell.id, el.dataset.frPart)]);
  function home() {
    const act = selOn(), loading = act && !ready(), under = act && ready() && !live() && !K.vsOn();
    const cards = LAST.cards = CARDS.map(c => ({ c, ...(c.cell ? { rows: [], aid: D.cell?.id } : homeRows(c)) }));
    cards.forEach(x => { if (x.c.cell) { x.cellRows = cellRows(); } x.ax = axisOf(valsOf([...x.rows, ...(x.cellRows || [])])); const rr = x.cellRows?.length ? x.cellRows : x.rows; x.answer = answerOf(rr, rr[0]?.measure === 'fold', !!x.cellRows?.length); });
    const ex = (F.examples || []).map(e => `<button type="button" class="try-chip" data-try="${esc(e.query)}">${esc(e.label)}</button>`).join('');
    const c0 = act && ready() ? K.sel.compute() : null;
    const banner = under ? `<p class="fr-banner" role="status"><b>Showing the whole dataset.</b> Your selection (${esc(sitesOn())}) is under the minimum for a test (${MIN().proteins} proteins and ${MIN().marks} ${esc(W.marks)}).` +
        `${c0 && c0.proteins.size === 1 && K.views.protein ? ` <a href="${esc(K.link('protein', D.proteins[[...c0.proteins][0]][0]))}">Open the protein</a>.` : ''}</p>` : '';
    const notes = (live() ? `<p class="fr-note">Tested again in your browser on this selection: exploratory, not adjusted for other selections tried. Muted rows hold fewer than ${MIN().proteins} in the selection; the ring is the whole dataset. A card whose question made the selection stays on the whole dataset.</p>` : '') +
      (S.dvLink && VERSION && S.dvLink !== VERSION ? `<p class="fr-note" role="status">This link was made with data version ${esc(S.dvLink)}; this page holds ${esc(VERSION)}, so values may differ.</p>` : '');
    const html = cards.filter(x => x.c.cell || x.rows.length).map(x => {
      const c = x.c, all = c.questions.filter(q => A[q]), fold = x.rows[0]?.measure === 'fold', qid = x.aid || c.home?.analysis || D.cell?.id || '', href = K.link('overview', qid);
      const rows = x.rows.map(r => rowHtml(r, x.ax, {}, K.sel.state.f[r.key]?.includes(r.cat))).join('');
      const cell = c.cell ? `<div class="fr-cell" id="fr-cell-draw" aria-label="The cell, colored by odds ratio"></div>` + cellLegend() +
        (x.cellRows || []).map(r => rowHtml(r, x.ax, { href: K.link('overview', D.cell.id) }, false)).join('') : '';
      const tag = c.cell || !fold ? 'OR' : 'fold';
      return `<section class="fr-card${c.cell ? ' fr-cellcard' : ''}" data-card="${esc(c.key)}" aria-labelledby="fc-${esc(c.key)}"><header><h2 id="fc-${esc(c.key)}"><a href="${esc(href)}">${esc(c.title)}</a></h2>` +
        `${x.own ? '<span class="tag">Whole dataset</span>' : ''}<abbr class="tag" title="${tag === 'fold' ? 'Fold enrichment: how many times more often the set is among the marked proteins than among the others' : 'Odds ratio: the odds that a mark is in the class against the odds for the other residues of the same proteins'}" tabindex="0">${tag}</abbr>` +
        `<a class="fr-open" href="${esc(href)}" aria-label="Open the question: ${esc(c.title)}" title="Open the question">›</a>` +
        (K.expBar ? `<details class="fr-dl"><summary aria-label="Download ${esc(c.title)}" title="Download this card">Download</summary>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'frexp', c.title, qid).replace('class="exp"', 'class="exp fr-exp"')}</details>` : '') + '</header>' +
        (x.answer ? `<p class="fr-answer">${esc(x.answer)}</p>` : '') +
        `${cell}<div class="fr-rows" role="group" aria-label="${esc(c.title)}">${rows}</div>${axisHtml(x.ax)}` +
        (x.own ? '<p class="fr-cnote">Whole dataset: your selection was made with this question.</p>' : '') +
        ((c.cell ? 'The cell rows summarize the cell maps (median, adjusted for abundance); they are not a test. ' : '') + (c.note || '') ? `<details class="fr-cnote-d"><summary>Note</summary>${esc((c.cell ? 'The cell rows summarize the cell maps (median, adjusted for abundance); they are not a test. ' : '') + (c.note || ''))}</details>` : '') +
        (all.length > 1 ? `<details class="fr-qs"><summary>All ${all.length} questions</summary><ul>${all.map(q => `<li><a href="${esc(K.link('overview', q))}">${esc(short(q))}</a></li>`).join('')}</ul></details>` : '') + '</section>';
    }).join('');
    const more = F.more.questions.filter(q => A[q]);
    const moreCard = more.length ? `<section class="fr-card fr-more" aria-labelledby="fc-more"><header><h2 id="fc-more">${esc(F.more.title)}</h2></header><ul>${more.map(q => `<li><a href="${esc(K.link('overview', q))}">${esc(short(q))}</a></li>`).join('')}</ul></section>` : '';
    const resid = CARDS.some(c => c.home?.analysis && measureOf(c, c.home.analysis) === 'odds' && !c.cell);
    const key = `<p class="fr-key"><span><i class="kd more"></i><i class="kd less"></i> q ≤ 0.05 (filled)</span><span><i class="kd ns"></i> q &gt; 0.05</span><span><i class="kd ns dash"></i> not tested</span><span>× fold or odds ratio, bar: 95% interval, each card on its own axis</span><span class="muted">gray number: n</span>${live() ? '<span>ring: whole dataset</span>' : ''}` +
      `<label class="fr-ab" title="Mark protein-set rows with the result within abundance deciles"><input type="checkbox" data-fr-ab${S.ab ? ' checked' : ''}> Abundance check</label>` +
      (resid ? `<span class="seg" role="group" aria-label="Test"><button type="button" data-m="mantel_haenszel" aria-pressed="${method() === 'mantel_haenszel'}">Within each protein</button><button type="button" data-m="fisher" aria-pressed="${method() === 'fisher'}">Pooled</button></span>` : '') + '</p>';
    K.front.say = act ? (loading ? 'Loading the selection' : under ? `Whole dataset: the selection of ${sitesOn()} is under the test minimum` : `Cards tested again on ${sitesOn()}`) : 'Whole dataset';
    const top = act ? barHtml() : `<div class="fr-examples" role="group" aria-label="Examples">${headHtml()}${ex}</div>`;
    return `<div class="fr-home${loading ? ' fr-busy' : ''}"${loading ? ' aria-busy="true"' : ''}><h1 class="vh">${esc(D.site.name)}</h1><p class="fr-lede">${ledeHtml()}</p>` +
      `<div class="fr-top">${top}<button type="button" class="fr-info-btn" data-fr-info aria-expanded="${infoOpen}" aria-controls="fr-info" aria-label="About this page: description, citation and how to read the rows" title="About this page">i</button></div>` +
      `<div class="fr-info" id="fr-info"${infoOpen ? '' : ' hidden'}><p class="fr-lede-in">${ledeHtml()}</p>${notes}${key}</div>` +
      `${banner}${act && ready() ? protsHtml() : ''}${act && ready() ? K.logoSection?.() || '' : ''}<div class="fr-grid">${html}${moreCard}</div>${tilesHtml()}${act ? '' : (K.overviewBlocks || []).map(f => f()).join('')}</div>`;
  }
  // Print and the PDF hide the toolbar, where the selection is named: a block that only Print shows keeps it, with the citation and the version
  function printCite() {
    let el = document.getElementById('print-cite');
    if (!el) { el = document.createElement('div'); el.id = 'print-cite'; el.className = 'print-only'; const v = document.getElementById('view'); if (v) v.before(el); else return; }
    el.innerHTML = `<p><b>${esc(D.site.name)}</b> · data version ${esc(VERSION || '–')}</p><p>Selection: ${esc(K.selText ? K.selText() : 'whole dataset')}</p>` + (K.creditLines ? K.creditLines().filter(l => !/^Selection:/.test(l)).map(l => `<p>${esc(l)}</p>`).join('') : '');
  }
  K.afterRender.push(printCite);
  // the Filter button lives in the search box on every page (it opens the panel; the badge counts the filters in use)
  function filterButton() {
    const sf = document.querySelector('.search-field'); if (!sf) return;
    let b = sf.querySelector('.fr-filter-in');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'fr-filter-in'; b.setAttribute('data-rail-open', 'filters'); b.setAttribute('aria-haspopup', 'dialog'); sf.appendChild(b); }
    const nf = K.sel.nFilters(), h = `Filter${nf ? ` <span class="badge">${nf}</span>` : ''}`;
    if (b.dataset.h !== h) { b.dataset.h = h; b.innerHTML = h; b.setAttribute('aria-label', nf ? `Filter, ${nf} in use` : 'Filter'); }
  }
  function after() {
    document.body.classList.toggle('fr-on-home', S.view === 'overview' && !S.arg);
    filterButton();
    if (S.view !== 'overview' || S.arg) return;
    const el = document.getElementById('fr-cell-draw');
    // the drawing scales to the card; on a phone the kit's crop of it without leader lines, and the parts named under it in a list
    if (el && K.cell?.draw) { K.cell.draw(el, 'cell', { crop: narrow(), labels: !narrow(), onPart: part => K.sel.toggle('w:' + D.cell.id, part) }); el.dataset.narrow = narrow() ? '1' : ''; }
    const live_ = document.getElementById('fr-live');
    if (live_ && K.front.say !== lastLive) { lastLive = K.front.say; live_.textContent = K.front.say; }
  }
  const lv = document.createElement('div'); lv.id = 'fr-live'; lv.className = 'vh'; lv.setAttribute('role', 'status'); lv.setAttribute('aria-live', 'polite'); document.body.appendChild(lv);
  (K.afterRender ||= []).push(after);
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const el = document.getElementById('fr-cell-draw'); if (el && (el.dataset.narrow === '1') !== narrow()) after(); }, 200); });
  document.addEventListener('change', e => { if (e.target.matches?.('[data-fr-ab]')) { S.ab = e.target.checked; K.writeHash(false); K.render(); } });
  K.clicks.push(['[data-fr-info]', el => { infoOpen = !infoOpen; el.setAttribute('aria-expanded', String(infoOpen)); document.getElementById('fr-info')?.toggleAttribute('hidden', !infoOpen); }]);
  K.clicks.push(['[data-fr-more]', el => { const bar = el.closest('.fr-bar'), on = !bar.classList.contains('open'); bar.classList.toggle('open', on); el.setAttribute('aria-expanded', String(on)); if (on) bar.querySelector('.fr-tools button, .fr-tools a')?.focus(); }]);
  document.addEventListener('click', e => { if (!e.target.closest?.('.fr-bar')) document.querySelectorAll('.fr-bar.open').forEach(b => { b.classList.remove('open'); b.querySelector('[data-fr-more]')?.setAttribute('aria-expanded', 'false'); }); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const b = document.querySelector('.fr-bar.open'); if (b) { b.classList.remove('open'); const m = b.querySelector('[data-fr-more]'); m?.setAttribute('aria-expanded', 'false'); m?.focus(); } } });
  K.front = { home, bar: barHtml, trail, cardTsv, chipLabel, cards: CARDS, say: '', homeRows, cellRows, axisOf, axisHtml, rowHtml, valsOf, answerOf, short, fin, PX, fmtT, shareTile, tiles: tilesHtml };
});
