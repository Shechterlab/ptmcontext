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
  K.paramsOut.push(p => { if (S.ab) p.set('ab', '1'); const v = S.dvLink || VERSION; if (v && (S.q || K.sel.encode() || S.ab || S.vs !== 'residues' || S.dvLink)) p.set('dv', v); });
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
    const strong = r => (r.q != null && r.q <= (h.q_max ?? 0.05) && (r.dir === 'more' || r.dir === 'less') ? 0 : 1), by = (x, y) => strong(x) - strong(y) || Math.abs(Math.log(y.eff)) - Math.abs(Math.log(x.eff));
    return ok.sort(by).slice(0, card.rows || F.rows).map(r => r.category);
  }
  function homeRows(card) {
    const m = method(), hasRows = i => A[i] && K.rowsFor(A[i], m).length;
    // the card's home question, or the next of its facets that this site ran (a derived card may name one with no rows)
    const aid = [card.home?.analysis, ...card.facets.map(f => f.analysis)].find(hasRows), a = A[aid]; if (!a) return { rows: [] };
    const measure = measureOf(card, aid), whole = K.rowsFor(a, m), own = selOn() && K.sel.madeWith(aid) && !K.vsOn();
    const useLive = live() && !own, byCat = {};
    (useLive ? K.rowsOf(a, m) : whole).forEach(r => { byCat[r.category] = r; });
    const wholeBy = Object.fromEntries(whole.map(r => [r.category, r]));
    const rows = keysOf(card, aid, whole).map(cat => {
      const r = byCat[cat], w = wholeBy[cat];
      return { aid, cat, key: K.fkeyOf(a), measure, label: labelOf(aid, w || r || { category: cat, label: cat }), r, w, live: useLive };
    }).map(x => {
      const r = x.r, v = r ? valueOf(r, x.measure) : null, thin = !!(x.live && r && r.a < MIN().proteins);
      return { ...x, v, lo: r && r.lo != null && r.hi != null && x.measure === 'odds' ? [r.lo, r.hi] : null, q: r ? r.q : null, dir: r ? r.dir : 'ns', n: r ? r.a : null, desc: !!(r && (r.descriptive || (r.q == null && x.live))), thin, absent: !r || v == null };
    });
    rows.sort((x, y) => (y.v ?? -1) - (x.v ?? -1));
    return { rows, own, aid };
  }
  // ---- the shared log scale -------------------------------------------------------------------------------------------
  function axisOf(vals) {
    const v = vals.filter(x => x > 0 && x < 1e100);
    const lo = Math.max(1 / 64, Math.min(0.25, ...v) / 1.2), hi = Math.min(64, Math.max(4, ...v) * 1.15);
    const L = x => (Math.log2(Math.min(hi, Math.max(lo, x))) - Math.log2(lo)) / (Math.log2(hi) - Math.log2(lo));
    const gap = narrow() ? 0.26 : 0.16, ticks = [1];
    const all = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32].filter(t => t >= lo && t <= hi);
    [...all.filter(t => t > 1), ...all.filter(t => t < 1).reverse()].forEach(t => { if (ticks.every(u => Math.abs(L(t) - L(u)) >= gap)) ticks.push(t); });
    return { L, ticks: ticks.sort((a, b) => a - b) };
  }
  const axisHtml = ax => `<div class="fr-ax" aria-hidden="true"><span class="tk">${ax.ticks.map(t => `<i style="left:${(ax.L(t) * 100).toFixed(1)}%">${t < 1 ? '1/' + 1 / t : t}×</i>`).join('')}</span></div>`;
  // ---- one row ----------------------------------------------------------------------------------------------------------
  const MARK = { holds: ['✓', 'holds within abundance deciles'], weaker: ['≈', 'weaker within abundance deciles'], lost: ['▼', 'not significant within abundance deciles'] };
  function rowHtml(x, ax, attrs, on) {
    const v = x.v, fin = v != null && Number.isFinite(v) ? Math.min(v, 1e3) : null, x1 = ax.L(1) * 100, x2 = fin != null ? ax.L(fin) * 100 : null;
    const dir = x.absent ? 'ns' : x.dir || 'ns', depl = x.measure === 'fold' && v != null && v < 1;
    const ci = x.lo ? `<line class="ci" x1="${(ax.L(Math.max(x.lo[0], 1 / 64)) * 100).toFixed(1)}%" x2="${(ax.L(Math.min(x.lo[1], 64)) * 100).toFixed(1)}%" y1="50%" y2="50%"/>` : '';
    const track = `<svg class="fr-track" aria-hidden="true"><line class="one" x1="${x1.toFixed(1)}%" x2="${x1.toFixed(1)}%" y1="0" y2="100%"/>${ci}` +
      (x2 == null ? '' : `<line class="stem ${dir}" x1="${x1.toFixed(1)}%" x2="${x2.toFixed(1)}%" y1="50%" y2="50%"/><circle class="dot ${dir}${x.desc ? ' desc' : ''}" cx="${x2.toFixed(1)}%" cy="50%" r="5"/>`) + '</svg>';
    const mk = S.ab && x.measure === 'fold' && !x.live && x.r && x.q != null && x.q <= K.PADJ && v > 1 ? MARK[K.holdStatus(x.r)] : null;
    const val = x.absent ? '–' : x.measure === 'fold' ? K.fxn(v) + '×' : K.fxn(v) + '×';
    const tip = x.absent ? `${x.label}: none in this selection` :
      `${x.label}: ${x.measure === 'fold' ? 'fold enrichment' : 'odds ratio'} ${K.fxn(v)}×${x.lo ? ` (95% CI ${K.fxn(x.lo[0])}–${K.fxn(x.lo[1])})` : ''}${x.q != null ? `, q ${K.fq(x.q)}` : ''}${x.n != null ? `, n ${int(x.n)}` : ''}` +
      (x.desc ? '. Shown, not tested (the selection was made with this question)' : '') +
      (depl ? '. Not tested for depletion: the test asks only whether the set is over-represented' : '') +
      (x.measure === 'fold' && !x.lo ? '. No interval: a one-sided set test' : '') +
      (x.thin ? `. Fewer than ${MIN().proteins} in this selection: read with care` : '') + (mk ? `. ${mk[1]}` : '');
    const cls = `fr-row dir-${dir}${on ? ' on' : ''}${x.thin || x.absent ? ' thin' : ''}`;
    const inner = `<span class="fr-lab">${esc(x.label)}</span>${track}<span class="fr-val">${esc(val)}<i class="fr-q ${dir}${x.desc ? ' desc' : ''}" aria-hidden="true"></i>${mk ? `<i class="fr-mk" aria-hidden="true">${mk[0]}</i>` : ''}</span><span class="fr-n">${x.n != null ? int(x.n) : ''}</span>`;
    const label = tip + (depl && dir === 'ns' ? '' : '');
    return attrs.href ? `<a class="${cls}" href="${esc(attrs.href)}" title="${esc(tip)}" aria-label="${esc(label)}">${inner}</a>`
      : `<button type="button" class="${cls}" data-f="${esc(x.key)}" data-v="${esc(x.cat)}" aria-pressed="${!!on}" title="${esc(tip)}" aria-label="${esc(label)}">${inner}</button>`;
  }
  // ---- the cell card: the kit's own drawing, and the parts that differ most as rows ---------------------------------------
  function cellRows() {
    if (!K.cell?.parts) return [];
    return K.cell.parts().filter(p => p.or != null && p.direction !== 'na' && p.maps >= 2).sort((x, y) => Math.abs(y.l2) - Math.abs(x.l2)).slice(0, 5)
      .map(p => ({ label: F.row_labels?.[D.cell?.id]?.[p.part] || p.row, v: p.or, q: null, dir: p.direction, n: p.maps, nl: `${p.maps} maps`, measure: 'odds', part: p.part, cellRow: true }));
  }
  // ---- chips ---------------------------------------------------------------------------------------------------------------
  function chipLabel(k, vals) {
    const id = k.split(':')[1], card = cardOfQ(id), name = (card && card.chip) || K.sel.keyName(k);
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
  // ---- the home ----------------------------------------------------------------------------------------------------------
  const sitesOn = () => `${int(K.sel.nMarks())} ${unit(K.sel.nMarks())} on ${plural(K.sel.nProteins(), 'protein')}`;
  let lastLive = '';
  function home() {
    const act = selOn(), loading = act && !ready(), under = act && ready() && !live() && !K.vsOn();
    const cards = CARDS.map(c => ({ c, ...(c.cell ? { rows: [], aid: D.cell?.id } : homeRows(c)) }));
    cards.forEach(x => { if (x.c.cell) { x.cellRows = cellRows(); } });
    const vals = cards.flatMap(x => [...x.rows, ...(x.cellRows || [])].map(r => r.v)).filter(v => v != null);
    const ax = axisOf(vals);
    const nf = K.sel.nFilters(), bar = `<div class="fr-bar"><button type="button" class="btn fr-filter" data-rail-open="filters" aria-haspopup="dialog">Filter${nf ? ` <span class="badge">${nf}</span>` : ''}</button>` +
      (act ? `<b class="fr-count" role="status">${loading ? 'Loading the selection…' : esc(sitesOn())}</b>${ready() ? chipsHtml() : ''}<button type="button" class="linkish fr-all" data-sel-clear-all>Whole dataset</button>`
        : `<span class="fr-count muted">${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins</span>`) +
      `<span class="fr-tools">${act ? `<button type="button" class="btn small" data-sel-save>Save</button>${K.views.compare && K.sel.savedList().length ? '<button type="button" class="btn small" data-go-compare>Compare</button>' : ''}` +
        `<button type="button" class="btn small" data-vs="${S.vs === 'marks' ? 'residues' : 'marks'}" aria-pressed="${S.vs === 'marks'}" title="Compare the selection with the site’s other ${esc(W.marks)}, not with the other ${esc(W.residues)} of its proteins">What sets it apart</button>` : ''}` +
        `<button type="button" class="btn small" data-sel-copy>Copy link</button></span></div>`;
    const ex = (F.examples || []).length ? `<div class="fr-examples" role="group" aria-label="Examples">${F.examples.map(e => `<button type="button" class="try-chip" data-try="${esc(e.query)}">${esc(e.label)}</button>`).join('')}</div>` : '';
    const c0 = act && ready() ? K.sel.compute() : null;
    const banner = under ? `<p class="fr-banner" role="status"><b>Showing the whole dataset.</b> Your selection (${esc(sitesOn())}) is under the minimum for a test (${MIN().proteins} proteins and ${MIN().marks} ${esc(W.marks)}), so every card shows the whole dataset.` +
        `${c0 && c0.proteins.size === 1 && K.views.protein ? ` <a href="${esc(K.link('protein', D.proteins[[...c0.proteins][0]][0]))}">Open the protein</a>.` : ''}</p>`
      : live() ? `<p class="fr-note">Tested again in your browser on this selection: exploratory, not adjusted for other selections tried. Muted rows hold fewer than ${MIN().proteins} in the selection. A card whose question made the selection stays on the whole dataset.</p>` : '';
    const dv = S.dvLink && VERSION && S.dvLink !== VERSION ? `<p class="fr-note" role="status">This link was made with data version ${esc(S.dvLink)}; this page holds ${esc(VERSION)}, so values may differ.</p>` : '';
    const html = cards.filter(x => x.c.cell || x.rows.length).map(x => {
      const c = x.c, all = c.questions.filter(q => A[q]), fold = x.rows[0]?.measure === 'fold';
      const rows = x.rows.map(r => rowHtml(r, ax, {}, K.sel.state.f[r.key]?.includes(r.cat))).join('');
      const cell = c.cell ? `<div class="fr-cell" id="fr-cell-draw" aria-label="The cell, coloured by odds ratio"></div>` +
        (x.cellRows || []).map(r => rowHtml({ ...r, label: r.label }, ax, { href: K.link('overview', D.cell.id) }, false)).join('') + '<p class="fr-cnote">A summary of the cell maps (median, adjusted for abundance), not a test.</p>' : '';
      const tag = c.cell ? 'OR' : fold ? 'fold' : 'OR';
      return `<section class="fr-card${c.cell ? ' fr-cellcard' : ''}" data-card="${esc(c.key)}" aria-labelledby="fc-${esc(c.key)}"><header><h2 id="fc-${esc(c.key)}"><a href="${esc(K.link('overview', x.aid || c.home?.analysis || D.cell?.id || ''))}">${esc(c.title)}</a></h2>` +
        `${x.own ? '<span class="tag">Whole dataset</span>' : ''}<abbr class="tag" title="${tag === 'fold' ? 'Fold enrichment: how many times more often the set is among the marked proteins than among the others' : 'Odds ratio: the odds that a mark is in the class against the odds for the other residues of the same proteins'}" tabindex="0">${tag === 'fold' ? 'fold' : 'OR'}</abbr></header>` +
        `${cell}<div class="fr-rows" role="group" aria-label="${esc(c.title)}">${rows}</div>${axisHtml(ax)}` +
        (x.own ? '<p class="fr-cnote">Whole dataset: your selection was made with this question.</p>' : '') +
        (fold ? `<p class="fr-cnote">Fold is a one-sided test: a value below 1× is not tested for depletion.</p>` : '') +
        (all.length > 1 ? `<details class="fr-qs"><summary>All ${all.length} questions</summary><ul>${all.map(q => `<li><a href="${esc(K.link('overview', q))}">${esc(short(q))}</a></li>`).join('')}</ul></details>` : '') + '</section>';
    }).join('');
    const more = F.more.questions.filter(q => A[q]);
    const moreCard = more.length ? `<section class="fr-card fr-more" aria-labelledby="fc-more"><header><h2 id="fc-more">${esc(F.more.title)}</h2></header><ul>${more.map(q => `<li><a href="${esc(K.link('overview', q))}">${esc(short(q))}</a></li>`).join('')}</ul></section>` : '';
    const resid = CARDS.some(c => c.home?.analysis && measureOf(c, c.home.analysis) === 'odds' && !c.cell);
    const key = `<p class="fr-key"><span><i class="kd more"></i><i class="kd less"></i> q ≤ 0.05 (filled)</span><span><i class="kd ns"></i> q &gt; 0.05</span><span><i class="kd ns dash"></i> not tested</span><span>× fold or odds ratio, 95% interval as a thin bar</span><span class="muted">grey number: n</span>` +
      `<label class="fr-ab" title="Mark protein-set rows with the result within abundance deciles"><input type="checkbox" data-fr-ab${S.ab ? ' checked' : ''}> Abundance check</label>` +
      (resid ? `<span class="seg" role="group" aria-label="Test"><button type="button" data-m="mantel_haenszel" aria-pressed="${method() === 'mantel_haenszel'}">Within each protein</button><button type="button" data-m="fisher" aria-pressed="${method() === 'fisher'}">Pooled</button></span>` : '') + '</p>';
    K.front.say = act ? (loading ? 'Loading the selection' : under ? `Whole dataset: the selection of ${sitesOn()} is under the test minimum` : `Cards tested again on ${sitesOn()}`) : 'Whole dataset';
    return `<div class="fr-home${loading ? ' fr-busy' : ''}"${loading ? ' aria-busy="true"' : ''}><h1 class="vh">${esc(D.site.name)}</h1>${ex}${bar}${banner}${dv}<div class="fr-grid">${html}${moreCard}</div>${key}</div>`;
  }
  function after() {
    document.body.classList.toggle('fr-on-home', S.view === 'overview' && !S.arg);
    if (S.view !== 'overview' || S.arg) return;
    const el = document.getElementById('fr-cell-draw');
    // the drawing scales to the card; on a phone the kit's crop of it, without labels (the rows under it name the parts); a part chosen is a filter chip
    if (el && K.cell?.draw) { K.cell.draw(el, 'cell', { crop: narrow(), labels: !narrow(), onPart: part => K.sel.toggle('w:' + D.cell.id, part) }); el.dataset.narrow = narrow() ? '1' : ''; }
    const live_ = document.getElementById('fr-live');
    if (live_ && K.front.say !== lastLive) { lastLive = K.front.say; live_.textContent = K.front.say; }
  }
  const lv = document.createElement('div'); lv.id = 'fr-live'; lv.className = 'vh'; lv.setAttribute('role', 'status'); lv.setAttribute('aria-live', 'polite'); document.body.appendChild(lv);
  (K.afterRender ||= []).push(after);
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const el = document.getElementById('fr-cell-draw'); if (el && (el.dataset.narrow === '1') !== narrow()) after(); }, 200); });
  document.addEventListener('change', e => { if (e.target.matches?.('[data-fr-ab]')) { S.ab = e.target.checked; K.writeHash(false); K.render(); } });
  K.front = { home, cards: CARDS, say: '', homeRows, axisOf, short };
});
