/* Proteins: the Proteins tab (every protein with a mark, searchable and sortable) and a page per protein: its map
   (domains, disordered regions and the marks, with AlphaFold's confidence once it has loaded), how its marks compare
   with its own other residues, its marks one by one, and live cards from UniProt (function, and a check that the
   sequence has not changed), AlphaFold DB (the model in 3D), PDBe (experimental structures) and STRING (interaction
   partners, if the site file names the organism's taxon). The marks the site shows and counts nowhere (kit-shown.js)
   follow the marks in its sites table, tagged, with a card of their own; a protein with only these has a page with its
   map, those marks, its sequence and 3D. Live sources add to the page; they never change a number. A module of the site kit: it registers with the core (kit.js), which starts it. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, fxn, pct, cap } = K;
  if (!D.proteins || !D.proteins.length) return;
  const P = D.proteins.map(([acc, gene, name, len, marks, cand], i) => ({ i, acc, gene, name, len, marks, cand }));
  const byAcc = Object.fromEntries(P.map(p => [p.acc, p]));
  const COLS = D.mark_columns || [];
  const RES = (D.residues || []).join('/');
  const label = (aid, cat) => (A[aid]?.labels || {})[cat] || String(cat).replace(/_/g, ' ');
  const help = (aid, cat) => (A[aid]?.help || {})[cat] || '';

  // ---- the per-protein files: 64 shards, or inlined in the one-file copy ------------------------------------------
  const shardOf = acc => [...acc].reduce((n, c) => n + c.charCodeAt(0), 0) % (D.shards || 64);
  const inline = (() => { try { return JSON.parse(document.getElementById('protein-data')?.textContent || '{}'); } catch (e) { return {}; } })();
  const shardCache = {};
  function loadShard(k) {
    const key = String(k).padStart(2, '0');
    if (inline[key]) return Promise.resolve(inline[key]);
    return (shardCache[key] ||= fetch(`data/p/${key}.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error('missing')))));
  }
  const loadProtein = acc => loadShard(shardOf(acc)).then(sh => sh[acc] || Promise.reject(new Error('not found')));
  K.loadProtein = loadProtein;                       // for other modules' drawings of a protein (kit-selview.js)

  // ---- the selection: the proteins with a selected mark (kit-select.js), or every protein ------------------------
  const pHit = p => !K.sel || K.sel.protSelected(p.acc);
  const selCount = p => (K.sel?.active() ? (K.sel.selectedCountByProtein()[p.i] || 0) : p.marks);

  // ---- the Proteins tab -------------------------------------------------------------------------------------------
  const PS = { sort: 'marks', desc: true, n: 100 };
  const KEYS = { gene: p => (p.gene || p.acc).toLowerCase(), name: p => (p.name || '').toLowerCase(), acc: p => p.acc, marks: p => p.marks, len: p => p.len, share: p => p.marks / (p.cand || 1) };
  function shownProteins() {
    const rows = P.filter(pHit), key = PS.sort === 'marks' && K.sel?.active() ? (cnt => p => cnt[p.i] || 0)(K.sel.selectedCountByProtein()) : KEYS[PS.sort];
    rows.sort((x, y) => { const a = key(x), b = key(y); const c = typeof a === 'number' ? a - b : String(a).localeCompare(String(b)); return PS.desc ? -c : c; });
    return rows;
  }
  const PCOLS = [['gene', 'Gene', false], ['name', 'Protein', false], ['acc', 'Accession', false], ['marks', cap(W.marks), true], ['len', 'Length', true], ['share', `Share of its ${W.residues}`, true]];
  function proteinsView() {
    const rows = shownProteins(), shown = rows.slice(0, PS.n);
    return `<div class="page-head"><h2>Proteins</h2>${K.expBar(['tsv'], 'pexp', 'the protein list', 'data')}</div>` +
      `<p class="page-sub">Every protein with at least one ${esc(W.mark)}${K.sel?.active() ? ' in your selection' : ''}. Search by gene, accession or name, or filter. Click a row to open the protein.</p>` +
      `<div class="filters"><span class="muted">${int(rows.length)} of ${int(P.length)} proteins${K.sel?.active() ? ' in your selection' : ''}</span></div>` +
      `<div class="tbl-card" id="proteins-table"><table class="tbl ptbl"><thead><tr>${PCOLS.map(([k, t, n]) => `<th class="${n ? 'num' : ''}" data-psort="${k}" tabindex="0"${PS.sort === k ? ` aria-sort="${PS.desc ? 'descending' : 'ascending'}"` : ''}>${esc(t)}${PS.sort === k ? (PS.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>` +
      shown.map(p => `<tr data-acc="${esc(p.acc)}"><td><a href="${esc(K.link('protein', p.acc))}"><b>${esc(p.gene || '–')}</b></a></td><td class="wrapok">${esc(p.name)}</td><td class="mono">${esc(p.acc)}</td>` +
        `<td class="num">${K.sel?.active() ? `<b>${int(selCount(p))}</b> <span class="muted">of ${int(p.marks)}</span>` : int(p.marks)}</td><td class="num">${int(p.len)}</td><td class="num">${pct(p.marks, p.cand)}</td></tr>`).join('') +
      `</tbody></table></div>` + (rows.length > PS.n ? `<p><button class="linkish" type="button" data-pmore>Show ${int(Math.min(200, rows.length - PS.n))} more</button></p>` : '');
  }
  const proteinsTsv = () => {
    const sel = K.sel?.active(), cnt = sel ? K.sel.selectedCountByProtein() : null, mk = W.marks.replace(/\W+/g, '_');
    return K.preamble('proteins', `every protein with at least one ${W.mark}${sel ? ' of the selection' : ''} (${int(shownProteins().length)}): its gene, name, length, ${sel ? `its selected ${W.marks}, ` : ''}its ${W.marks} and its candidate residues (${RES}).`) +
      ['accession', 'gene', 'protein', 'length', ...(sel ? [`selected_${mk}`] : []), mk, `candidate_residues_${RES.replace(/\W+/g, '')}`].join('\t') + '\n' +
      shownProteins().map(p => [p.acc, p.gene, p.name, p.len, ...(sel ? [cnt[p.i] || 0] : []), p.marks, p.cand].join('\t')).join('\n') + '\n';
  };

  // ---- website.protein.order / open: the folds in the site's order, and which of them start open --------------------------
  // Without a list the folds keep the page's own order. A fold the list lacks follows the one before it; one the page lacks is skipped.
  const PRO = D.protein_view || {};
  const FOLD_ORDER = PRO.order || [];
  K.hasData = { ...(K.hasData || {}) };            // fold id -> whether this protein has what it shows (the folds that open only then)
  // `open` is the site's list; without one, each fold's own default
  K.foldOrder = FOLD_ORDER;
  K.foldTouched = id => id in PV.open;             // the reader has opened or closed it
  K.foldStarts = id => !!PRO.open?.includes(id);    // the site starts it open (when it has what it shows)
  const foldOpen = (id, dflt) => (PRO.open ? PRO.open.includes(id) && (K.hasData[id] ? !!K.hasData[id]() : true) : dflt);
  const GROUPS = PRO.groups || [];
  function arrangeFolds(html, flat) {
    if (!FOLD_ORDER.length && !(GROUPS.length && !flat)) return html;
    const parts = html.split(/(?=<details class="pfold" id=")/), lead = /^<details class="pfold" id=/.test(parts[0]) ? '' : parts.shift();
    let at = -1, gi = 0;
    const keyed = parts.map((h, k) => {
      const id = (/^<details class="pfold" id="([^"]+)"/.exec(h) || [])[1], i = FOLD_ORDER.indexOf(id), g = GROUPS.findIndex(x => (x.folds || []).includes(id));
      if (i >= 0) at = i; if (g >= 0) gi = g;
      return [flat ? 0 : gi, at, k, h];
    });
    keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    if (flat || !GROUPS.length) return lead + keyed.map(x => x[3]).join('');
    // each group is a fold holding its folds; open when the reader opened it or one of its folds is open
    const out = GROUPS.map((g, n) => {
      const hs = keyed.filter(x => x[0] === n).map(x => x[3]); if (!hs.length) return '';
      const kids = hs.map(h => /^<details class="pfold" id="[^"]+" open/.test(h)), open = PV.open[g.id] ?? kids.some(Boolean), n0 = kids.filter(Boolean).length;
      return `<details class="pgroup" id="${esc(g.id)}"${open ? ' open' : ''}><summary><span class="pfm" aria-hidden="true"></span><h2>${esc(g.title)}</h2><span class="fsum">${hs.length} section${hs.length === 1 ? '' : 's'}${n0 ? `, ${n0} open` : ''}</span></summary><div class="pgroup-body">${hs.join('')}</div></details>`;
    }).join('');
    return lead + `<div class="pgroup-tools"><button type="button" class="btn small" data-folds="open">Open all</button> <button type="button" class="btn small" data-folds="close">Close all</button></div>` + out;
  }

  // ---- the cards front end's protein page: the map, then Network, 3D and Sites as one block, the other cards folded below ----
  const CARDS = D.front?.mode === 'cards';
  const narrow = () => matchMedia('(max-width: 700px)').matches;
  const TABS = [['p-ix', 'Network'], ['p-struct', '3D'], ['p-sites', 'Sites']];
  // the block shows one of its sections: the one the reader opened last (or an address named), else the network when the protein has
  // partners in the site's table, else the sites
  function tabState() {
    const ids = TABS.map(t => t[0]), asked = ids.filter(id => PV.open[id] === true), dflt = IXP && hasPartners() ? 'p-ix' : 'p-sites';
    const cur = asked.length ? asked[asked.length - 1] : dflt;
    return { cur, on: Object.fromEntries(ids.map(id => [id, id === cur])) };
  }
  function cardsLayout(html, p, rec, tabs) {
    const parts = html.split(/(?=<details class="pfold" id=")/), lead = /^<details class="pfold" id=/.test(parts[0]) ? '' : parts.shift();
    const idOf = h => (/^<details class="pfold" id="([^"]+)"/.exec(h) || [])[1];
    const take = id => { const k = parts.findIndex(h => idOf(h) === id); return k < 0 ? '' : parts.splice(k, 1)[0]; };
    const map = take('p-map'), panes = TABS.map(([id, t]) => [id, t, take(id)]).filter(x => x[2]);
    const bar = `<div class="ptabs" role="group" aria-label="${esc(p.gene || p.acc)}: network, 3D structure and sites">${panes.map(([id, t]) => `<button type="button" class="ptab" data-ptab="${id}" aria-pressed="${id === tabs.cur}">${esc(t)}</button>`).join('')}</div>`;
    const more = arrangeFolds(parts.join(''), true);
    return lead + map + (panes.length ? `<div class="pview">${bar}${panes.map(x => x[2]).join('')}</div>` : '') +
      (more ? `<h2 class="p-more">More about ${esc(p.gene || p.acc)}</h2>${more}` : '');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-ptab]'); if (!b) return;
    const id = b.dataset.ptab;
    TABS.forEach(([x]) => { const d = document.getElementById(x); if (d) d.open = x === id; });
    document.querySelectorAll('[data-ptab]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });

  // ---- a protein's page: as the Methylarginine Site Explorer's ------------------------------------------------------
  const PV = { acc: '', rec: null, err: '', af: null, uni: null, uniJson: null, pdb: null, pdbAll: false, ix: null, site: null, span: null, spanArg: '', more: false, fn: false, open: {}, scrolled: null,
    tb: null, evOpen: new Set(), pf: '', focus: '', qDone: false, light: null, lightP: null, lightAll: false, cleanArg: false };
  document.addEventListener('toggle', e => { const d = e.target; if (d.classList?.contains('pfold') || d.classList?.contains('pgroup')) PV.open[d.id] = d.open; }, true);
  document.addEventListener('click', e => { if (PV.more && !e.target.closest('.more-links')) { PV.more = false; const m = document.getElementById('more-menu'); if (m) m.hidden = true; } });
  const SPECS = D.attribute_specs || {}, AT = D.mark_attributes || [];
  function load(acc) {
    if (PV.acc === acc) return;
    Object.assign(PV, { acc, rec: null, err: '', af: null, uni: null, uniJson: null, pdb: null, pdbAll: false, ix: null, span: null, spanArg: '', more: false, fn: false, open: {}, scrolled: null,
      tb: null, evOpen: new Set(), pf: '', focus: '', qDone: false, light: null, lightP: null, lightAll: false });
    K.map?.reset();
    // the protein's tables (website.tables): the card, the sites table and the Evidence rows fill in when they arrive
    K.card?.load(acc).then(tb => { if (PV.acc === acc) { PV.tb = tb || {}; K.render(); } });
    loadProtein(acc).then(r => { if (PV.acc === acc) { PV.rec = r; K.render(); } },
      () => { if (PV.acc === acc) { PV.err = location.protocol === 'file:' ? 'This copy of the site cannot read the protein files from disk. Open the hosted site, or index.html through a local web server.' : 'The protein’s file could not be read.'; K.render(); } });
  }
  const AF_BINS = [[90, '#0053d6', 'very high (pLDDT > 90)'], [70, '#65cbf3', 'confident (70–90)'], [50, '#ffdb13', 'low (50–70)'], [0, '#ff7d45', 'very low (< 50)']];
  const afColour = v => AF_BINS.find(([t]) => v > t || t === 0)[1];
  const mapCtx = () => ({ p: byAcc[PV.acc] || PV.lightP, rec: PV.rec, uni: PV.uniJson, uniFailed: PV.uniFailed, af: PV.af && !PV.af.failed && !PV.af.none ? PV.af : null, afFailed: PV.af?.failed, afNone: PV.af?.none,
    selected: K.sel?.active() ? K.sel.selectedPositions(PV.acc) : null, site: PV.site, span: PV.span });
  // the headline tiles in as even rows as fit: the columns that leave no row with a single tile (--hl-cols; the CSS grid auto-fits within it)
  const balanceTiles = () => document.querySelectorAll('.hl-cards').forEach(g => {
    const n = g.children.length, em = parseFloat(getComputedStyle(g).fontSize) || 16, w = g.clientWidth;
    if (!n || !w) return;
    const gap = 0.7 * em, max = Math.max(1, Math.floor((w + gap) / (12 * em + gap))), rows = Math.ceil(n / max);
    g.style.setProperty('--hl-cols', String(Math.ceil(n / rows)));
  });
  (K.afterRender ||= []).push(balanceTiles, () => {
    if (S.view !== 'protein' || !PV.rec || PV.acc !== String(S.arg).split('/')[0]) return;
    const now = PV.acc + '/' + (PV.site ?? '');
    if (now !== followed) { followed = now; K.site.follow(PV.acc, PV.site); }
  });
  addEventListener('resize', balanceTiles);
  // the map's downloads, with the export size and resolution folded into the same bar
  const mapExp = kinds => K.expBar(kinds, 'mexp', 'the map', 'sources').replace(/<\/div>$/, (K.map?.exportOpts?.() || '') + '</div>');
  function drawMap() { const el = document.getElementById('pmap'); if (el && PV.rec) K.map.render(el, mapCtx()); }
  const site = pos => siteOf(byAcc[PV.acc] || PV.lightP || { acc: PV.acc }, pos);
  function markClasses(m) { return COLS.map((aid, k) => [aid, m[2][k]]); }
  // the sites table's question columns: the site file's (website.sites.columns) and those with tags (motifs), unless
  // every question is asked for
  const shownCols = () => (PV.allCols ? COLS : COLS.filter(aid => (D.sites_view?.columns || []).includes(aid) || A[aid]?.shape === 'flags'));
  function classText(aid, v) {
    if (!v) return '–';
    const a = A[aid]; if (!a) return v;
    return a.shape === 'flags' ? v.split(';').map(c => label(aid, c)).join(', ') : label(aid, v);
  }
  // a mark's attributes, as the site file describes them: with links for a list that has them (each study to its paper)
  const attrVal = (m, name) => K.cols.markAttr(m, name) ?? '';
  function attrHtml(m, name, full) {
    const s = SPECS[name], v = attrVal(m, name); if (!s) return esc(v);
    if (s.kind === 'list') {
      const sep = s.separator || '; ', vals = v ? v.split(sep) : [], ids = s.link ? attrVal(m, name + '.link').split(sep) : [];
      if (K.density.compact() && !full && vals.length > 1) {   // compact rows: the first one and "+n" (all on hover)
        return `<span class="src-tags">${K.sel.listHtml(name, vals.slice(0, 1), ids.slice(0, 1), PV.acc, full)}<span class="tag more" title="${esc(vals.map(x => vLabel(name, x)).join('\n'))}">+${vals.length - 1}</span></span>`;
      }
      return K.sel.listHtml(name, vals, ids, PV.acc, full);
    }
    return esc(K.sel?.valueLabel ? K.sel.valueLabel(name, v) : v);
  }
  // what a site card or tip lists: the attributes a site has a value for (a coloured one always), and not a yes/no
  // attribute whose column another attribute shows in full (the changes rather than "changed")
  const detailOf = n => Object.keys(SPECS).some(o => o !== n && SPECS[o].column === SPECS[n].column && !SPECS[o].present);
  const shownAttrs = m => Object.keys(SPECS).filter(n => !(SPECS[n].present && detailOf(n)) && (attrVal(m, n) !== '' || SPECS[n].colour));
  const pillOf = (m, k) => { const rc = K.map.readable(K.map.attrColour(k, attrVal(m, k))); return `<span class="state-pill" style="--c:${rc.bg};--t:${rc.fg}" title="${esc(SPECS[k].label)}">${esc(K.sel?.valueLabel ? K.sel.valueLabel(k, attrVal(m, k)) : attrVal(m, k))}</span>`; };
  const statePill = m => { const k = Object.keys(SPECS).find(n => SPECS[n].colour && SPECS[n].kind === 'category'); return k ? pillOf(m, k) : ''; };
  function scoreRows(p, rec) {
    return D.analyses.filter(a => rec.counts[a.id]).map(a => {
      const rows = rec.counts[a.id].filter(r => r[1] > 0).sort((x, y) => y[1] - x[1]), [mt, ot] = rec.totals[a.id] || [0, 0];
      // a class with its own totals (a question of several tests, each counting its own background) uses them
      const ans = rows.slice(0, 2).map(([c, mi, oi, m2 = mt, o2 = ot]) => `${esc(label(a.id, c))}: <span class="an">${int(mi)} of ${int(m2)} (${pct(mi, m2)}) vs ${int(oi)} of ${int(o2)} other ${esc(W.residues)} (${pct(oi, o2)})</span>`).join('; ') || '<span class="muted">none</span>';
      const all = rec.counts[a.id].slice().sort((x, y) => y[1] - x[1] || y[2] - x[2]);
      return `<details class="score small"><summary><span class="pm" aria-hidden="true"></span><span class="tq"><span class="t">${esc(a.title)}</span></span><span class="ans">${ans}</span><span class="go" aria-hidden="true"></span></summary>` +
        `<div class="card-body"><div class="tbl-card"><table class="tbl"><thead><tr><th>Class</th><th class="num">${esc(cap(W.marks))} here</th><th class="num">Other ${esc(W.residues)} here</th></tr></thead><tbody>` +
        all.map(([c, mi, oi, m2 = mt, o2 = ot]) => `<tr><td title="${esc(help(a.id, c))}">${esc(label(a.id, c))}</td><td class="num">${int(mi)} of ${int(m2)} (${pct(mi, m2)})</td><td class="num">${int(oi)} of ${int(o2)} (${pct(oi, o2)})</td></tr>`).join('') +
        `</tbody></table></div></div></details>`;
    }).join('');
  }
  // the one-line answer to "is that unusual?" for a single protein: what these counts can and cannot say, and where the dataset-wide answer is
  function scoreVerdict(p, rec) {
    const qs = D.analyses.filter(a => rec.counts[a.id] && a.kind !== 'protein_sets'), n = rec.marks.length, others = Math.max(0, (rec.totals[qs[0]?.id] || [0, 0])[1]);
    return `<p class="verdict"><b>Unusual?</b> One protein cannot say: its ${int(n)} ${esc(n === 1 ? W.mark : W.marks)} are not independent and only ${int(others)} other ${esc(W.residues)} are left to compare with, so no test is made here. ${baseText() ? `Dataset-wide, the largest difference is ${esc(baseText())}. ` : ''}` +
      `These counts describe ${esc(p.gene || p.acc)}. Whether a class is unusual for ${esc(W.marks)} is tested across the whole dataset, one question at a time: ${qs.slice(0, 8).map(a => `<a href="${esc(K.link('overview', a.id))}">${esc(a.title)}</a>`).join(', ')}${qs.length > 8 ? ', …' : ''}.</p>`;
  }
  // the dataset-wide base rate beside the verdict: the most over-represented class of the site's residue questions (pooled test,
  // q within the cut-off), the figure a single protein is read against
  function baseRate() {
    const ids = new Set(D.analyses.filter(a => a.kind !== 'protein_sets').map(a => a.id)), cut = K.PADJ ?? 0.05;
    let best = null;
    D.rows.forEach(r => { if (ids.has(r.analysis) && r.method === 'fisher' && r.dir === 'more' && r.q != null && r.q <= cut && r.eff > 1 && r.eff < 1e299 && r.category !== '' && !/^(no |not |unknown|unassigned|other\b|none\b)/i.test(label(r.analysis, r.category)) && (!best || r.eff > best.eff)) best = r; });
    return best;
  }
  const baseText = () => { const b = baseRate(); return b ? `${K.fxn(b.eff)}× in ${label(b.analysis, b.category)}` : ''; };
  const winHtml = w => { const c = Math.floor(w.length / 2); return `<span class="win">${esc(w.slice(0, c))}<b>${esc(w[c])}</b>${esc(w.slice(c + 1))}</span>`; };
  // the links every protein has
  // the links every protein has: the kit's list (config/protein_links.json), the site's own (website.protein.links), and
  // each input's own page for the protein (a manifest entry's record), without repeats
  const LINKS = acc => {
    const fill = u => u.replace('{acc}', encodeURIComponent(acc)).replace(/[&?][a-z_]+=\{species\}/, m => (IXP ? m.replace('{species}', IXP.species) : ''));
    const own = Object.values(D.inputs || {}).filter(x => x.record).map(x => ({ label: (String(x.version || '').match(/^[^\d(]+/) || [''])[0].trim() || (() => { try { return new URL(x.record).host; } catch (e) { return 'source'; } })(), url: x.record }));
    const all = [...(D.protein_view?.default_links === false ? [] : D.protein_links || []), ...(D.protein_view?.links || []), ...own].map(l => [l.label, fill(l.url)]);
    return all.filter(([, u], k) => all.findIndex(([, v]) => v === u) === k);
  };
  // ---- numbering: a protein the site file numbers as papers do (website.protein.numbering: histones without the
  // initiator methionine, say) shows position + offset everywhere, and a link's position is read the same way ----------
  const NUM = (D.protein_view?.numbering || []).map(n => ({ ...n, g: n.genes ? new RegExp(n.genes) : null, nm: n.names ? new RegExp(n.names, 'i') : null }));
  const numOf = p => {
    if (!p || !NUM.length) return null;
    if (p._num === undefined) { const g = String(p.gene || '').split(/[\s;,]+/)[0]; p._num = NUM.find(n => (g ? n.g?.test(g) : n.nm?.test(p.name || ''))) || null; }
    return p._num;
  };
  const shownPos = (p, pos) => pos + (numOf(p)?.offset || 0);
  const uniPos = (p, n) => n - (numOf(p)?.offset || 0);
  const resAt = (p, pos) => (PV.acc === p?.acc && PV.rec?.seq?.[pos - 1]) || residueOf(p, pos);
  const siteOf = (p, pos) => `${resAt(p, pos) || ''}${shownPos(p, pos)}`;
  // for other modules (the map, the 3D viewer): a position as this site shows it, and a site's name
  K.prot = { shownPos: (acc, pos) => shownPos(byAcc[acc] || (PV.acc === acc ? PV.lightP : null), pos), siteLabel: (acc, pos) => siteOf(byAcc[acc] || (PV.acc === acc ? PV.lightP : null) || { acc }, pos),
    numbering: acc => numOf(byAcc[acc] || (PV.acc === acc ? PV.lightP : null)), tables: acc => (PV.acc === acc ? PV.tb || null : null) };

  // ---- the site card: one mark, everything the site knows about it, from its attributes and tables ----------------
  const CC = D.protein_view?.card || {}, TC = D.protein_view?.table || null;
  const cardCtx = (p, rec, m) => ({ p, rec, m, tb: PV.tb || {}, acc: p.acc, pos: m[0], gene: p.gene || p.acc, label: siteOf(p, m[0]), seq: rec.seq || '', window: m[1],
    shown: q => shownPos(p, q), attr: n => attrVal(m, n), attrHtml: (n, v) => K.sel.listHtml(n, [v], [], p.acc, true), isListed: a => !!byAcc[a] });
  // the attributes a block of the card shows, so they are not listed again among the rest
  const USED = (() => {
    const ev = CC.evidence || {}, u = new Set([ev.status, ev.tags?.attribute, ...(CC.states || []).map(s => s.attribute), ...(CC.changes || []).map(x => x.attribute),
      ...Object.keys(CC.calls?.attributes || {}), CC.cite?.attribute, CC.records?.groups, ...(CC.hide || [])].filter(Boolean));
    if ((CC.states || []).length) { const k = Object.keys(SPECS).find(n => SPECS[n].colour && SPECS[n].kind === 'category'); if (k) u.add(k); }
    return u;
  })();
  const CL_WORDS = { states: 'State by source', calls: 'Perturbations', changes: 'Changes', reported: 'Reported by', ...(CC.labels || {}) };
  const nearestOf = (rec, pos) => { const o = rec.marks.filter(x => x[0] !== pos).map(x => x[0]); return o.length ? o.reduce((b, x) => (Math.abs(x - pos) < Math.abs(b - pos) ? x : b)) : null; };
  const plddtAt = (p, pos) => (PV.af?.plddt && PV.af.plddt.length === p.len ? PV.af.plddt[pos - 1] : null);
  const plddtHtml = (p, pos) => { const v = plddtAt(p, pos); return v == null ? '<span class="muted">–</span>' : `<span class="pl-sq" style="--c:${afColour(v)}"></span>${Number(v).toFixed(0)}`; };
  const flagTags = (aid, v) => (v ? `<div class="tags">${v.split(';').map(c => `<span class="tag" title="${esc(help(aid, c))}">${esc(label(aid, c))}</span>`).join('')}</div>` : '');
  // the card of a mark shown and counted nowhere (K.shown): its window, attributes and tag, said to be not counted
  function shownCard(p, rec, m) {
    const kv = (dt, dd, tip) => (dd ? `<div><dt${tip ? ` title="${esc(tip)}"` : ''}>${dt}</dt><dd>${dd}</dd></div>` : '');
    const skip = new Set([...(K.shown.cfg.tests?.attributes || []), ...(K.shown.cfg.also || []), ...(K.shown.cfg.counted?.when || []).map(c => c.attribute)]);   // the counted ones' attribute says nothing of these
    const rows = kv('Window ±7', `<span class="mono">${winHtml(m[1])}</span>`) + kv(esc(cap(K.shown.label())), esc(K.shown.tip(m, true))) +
      shownAttrs(m).filter(n => !skip.has(n) && attrVal(m, n) !== '').map(n => kv(esc(SPECS[n].label), attrHtml(m, n, true), SPECS[n].help)).join('');
    return `<section class="site-card" id="site-card"><div class="card-head"><div><p class="eyebrow">Selected ${esc(W.residue.replace(/^an? /, ''))} · ${esc(K.shown.row())}</p><h3>${esc(p.gene || p.acc)} ${esc(siteOf(p, m[0]))} ${statePill(m)} ${K.shown.tag(m, true)}</h3></div>` +
      `<span class="tools">${typeof K.show3d === 'function' ? '<button type="button" class="btn small" data-site-3d>Show in 3D</button>' : ''}<button type="button" class="btn small" data-site-close aria-label="Close">×</button></span></div>` +
      `<p class="note small">Shown only: not one of the ${int(D.counts.marks)} ${esc(W.marks)} this site counts, and in no count, chart or test.</p><dl class="sc-kv">${rows}</dl></section>`;
  }
  const shownAt = (rec, pos) => (rec.shown || []).find(x => x[0] === pos);
  function siteCard(p, rec) {
    const sm = !rec.marks.some(x => x[0] === PV.site) && K.shown?.on ? shownAt(rec, PV.site) : null; if (sm) return shownCard(p, rec, sm);
    const m = rec.marks.find(x => x[0] === PV.site); if (!m) return '';
    const c = cardCtx(p, rec, m), num = numOf(p);
    const uniAt = (PV.uniJson?.features || []).filter(f => (f.location?.start?.value === m[0] && f.location?.end?.value === m[0]) && ['Modified residue', 'Natural variant', 'Mutagenesis', 'Cross-link'].includes(f.type));
    const pm = f => [...new Set((f.evidences || []).filter(e => e.source === 'PubMed').map(e => e.id))];
    const near = nearestOf(rec, m[0]), pl = plddtAt(p, m[0]);
    const featLine = f => {
      const alt = f.alternativeSequence ? `${f.alternativeSequence.originalSequence || ''}${shownPos(p, m[0])}${(f.alternativeSequence.alternativeSequences || []).join('/')}` : '';
      const snp = [...new Set((f.featureCrossReferences || []).filter(x => x.database === 'dbSNP').map(x => x.id))];
      const desc = String(f.description || '').replace(/;?\s*dbSNP:rs\d+/g, '').trim();
      return `${esc(f.type)}${alt ? ' <b>' + esc(alt) + '</b>' : ''}${desc ? ': ' + esc(desc) : ''}${snp.length ? ' · ' + snp.map(id => `<a href="https://www.ncbi.nlm.nih.gov/snp/${esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`).join(', ') : ''}${f.featureId ? ` · <a href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}/entry#disease_variants" target="_blank" rel="noopener">${esc(f.featureId)}</a>` : ''}${pm(f).length ? ' (PubMed ' + pm(f).slice(0, 8).map(id => `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(id)}/" target="_blank" rel="noopener">${esc(id)}</a>`).join(', ') + ')' : ''}`;
    };
    const kv = (dt, dd, tip) => (dd ? `<div><dt${tip ? ` title="${esc(tip)}"` : ''}>${dt}</dt><dd>${dd}</dd></div>` : '');
    // the cards front end puts the variants first: UniProt's natural variants at this residue (disease named), then the site's changes in cancers
    const uniShow = CARDS ? uniAt.filter(f => f.type !== 'Natural variant') : uniAt, uniVar = uniAt.filter(f => f.type === 'Natural variant');
    const ready = !!PV.tb, wait = '<span class="muted">loading…</span>';
    const tagged = new Set(K.shown?.on ? [...(K.shown.cfg.tests?.attributes || []), ...(K.shown.cfg.also || [])] : []);
    const rest = shownAttrs(m).filter(n => !USED.has(n) && !tagged.has(n));
    const siteRows = kv('Window ±7', `<span class="mono">${winHtml(m[1])}</span>`) +
      markClasses(m).map(([aid, v]) => kv(esc(A[aid]?.title || aid), A[aid]?.shape === 'flags' ? (flagTags(aid, v) || '<span class="muted">none</span>') : `<span title="${esc(help(aid, v))}">${esc(classText(aid, v))}</span>`)).join('') +
      ((CC.states || []).length ? kv(esc(CL_WORDS.states), ready ? K.card.states(c) : wait) : '') +
      (near != null ? kv(`Nearest other ${esc(W.mark)}`, `${esc(siteOf(p, near))}, ${int(Math.abs(near - m[0]))} aa away`) : '') +
      (CC.calls ? kv(esc(CL_WORDS.calls), ready ? K.card.calls(c) : wait) : '') +
      ((CC.changes || []).length && !CARDS ? kv(esc(CL_WORDS.changes), ready ? K.card.changes(c) : wait) : '') +
      rest.map(n => kv(esc(SPECS[n].label), attrHtml(m, n, true), SPECS[n].help)).join('') +
      (K.shown?.on && K.shown.counted(m) ? kv(esc(cap(K.shown.label())), esc(K.shown.tip(m, false))) : '') +
      (pl != null ? kv('AlphaFold confidence', `pLDDT ${Number(pl).toFixed(1)} <span class="muted">(model v${esc(PV.af.version)})</span>`) : '') +
      kv(`UniProt at ${esc(siteOf(p, m[0]))}`, PV.uniJson ? (uniShow.length ? uniShow.map(featLine).join('<br>') : '<span class="muted">no feature at this residue</span>') + ` <span class="muted">· <a href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}/entry#ptm_processing">UniProt ${esc(p.acc)}</a>, read live</span>` : '<span class="muted">asking UniProt…</span>') +
      (CC.cite?.attribute && SPECS[CC.cite.attribute] ? kv(esc(CL_WORDS.reported), K.card.reportedBy(c)) : '');
    const ev = ready ? K.card.evidenceBlock(c) : '', recs = ready ? K.card.recordsBlock(c) : '', wr = ready ? K.card.writerBlock(c) : '';
    const hasEvRow = ready && (K.card.has(CC.sources?.table) || (CC.tables || []).some(x => K.card.has(x.table)) || (CC.calls?.tables || []).some(K.card.has));
    const varBlock = !CARDS ? '' : `<section class="sc-vars" aria-label="Variants at ${esc(siteOf(p, m[0]))}"><h4>Variants at ${esc(siteOf(p, m[0]))}</h4><dl class="sc-kv">` +
      kv('UniProt variants', PV.uniJson ? (uniVar.length ? uniVar.map(featLine).join('<br>') : '<span class="muted">none reported at this residue</span>') : '<span class="muted">asking UniProt…</span>') +
      ((CC.changes || []).length ? kv(esc(CL_WORDS.changes), ready ? K.card.changes(c) : wait) : '') + '</dl></section>';
    return `<section class="site-card" id="site-card"><div class="card-head"><div><p class="eyebrow">Selected ${esc(W.mark)}</p><h3>${esc(p.gene || p.acc)} ${esc(siteOf(p, m[0]))} ${statePill(m)}${K.shown?.on ? ' ' + K.shown.tag(m, false) : ''}</h3>` +
      (num ? `<p class="muted small">${esc(num.note || num.label || 'Numbered as papers do')} · UniProt ${esc(resAt(p, m[0]))}${m[0]}</p>` : '') + '</div>' +
      `<span class="tools">${typeof K.show3d === 'function' ? '<button type="button" class="btn small" data-site-3d>Show in 3D</button>' : ''}${hasEvRow ? '<button type="button" class="btn small" data-site-ev>Source evidence</button>' : ''}` +
      `<a class="btn small" href="${esc(K.link('protein', p.acc + '/' + m[0]))}" target="_blank" rel="noopener" title="This ${esc(W.mark)}'s card on its own page">Open in a new tab</a><button type="button" class="btn small" data-site-copy title="Copy a link that opens this page with ${esc(siteOf(p, m[0]))} selected">Copy link</button>${K.expBar(['pdf', 'png', 'tsv'], 'cexp', 'the site card', 'sources')}<button type="button" class="btn small" data-site-close aria-label="Close">×</button></span></div>` +
      varBlock + `<div class="sc-grid${ev ? '' : ' one'}">${ev}<section class="sc-site"><h4>Site</h4><dl class="sc-kv">${siteRows}</dl></section>${recs}${wr}</div>` +
      (!ready && Object.keys(D.tables || {}).length ? '<p class="muted small">Loading tables…</p>' : '') + '</section>';
  }
  function siteCardTsv() {
    const p = byAcc[PV.acc], rec = PV.rec, m = rec.marks.find(x => x[0] === PV.site); if (!m) return '';
    const card = document.getElementById('site-card'), rows = [];
    card?.querySelectorAll('.sc-kv > div').forEach(d => rows.push([d.querySelector('dt')?.textContent.trim(), d.querySelector('dd')?.textContent.replace(/\s+/g, ' ').trim()]));
    return K.preamble(`${p.gene || p.acc} ${siteOf(p, m[0])}`, `what the site card shows of the ${W.mark} ${siteOf(p, m[0])} of ${p.gene || p.acc} (${p.acc}), UniProt position ${m[0]}`) +
      'field\tvalue\n' + rows.map(r => r.map(x => String(x || '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n') + '\n' +
      (K.card.has(CC.records?.table) ? '\n' + K.card.recordsTsv(cardCtx(p, rec, m)) : '');
  }

  // ---- the address: #protein/EWSR1/Q01844, a site #protein/EWSR1/Q01844/R575 (as the page numbers it), a region
  // .../120-180, an old section key .../p-na. Older links (#protein/Q01844, the explorer's #Q01844/R575, #FUS/R216,
  // #TDP-43) still open it: a gene, an alias the site's tables give, an entry name, or any of these without punctuation
  const geneTag = p => String(p?.gene || '').split(/[\s;,]+/)[0].replace(/[/?#%]/g, '-');
  let resIdx = null;
  const residueOf = (p, pos) => {
    if (!p) return '';
    const sd = K.sel?.data();
    if (sd && !resIdx) { resIdx = {}; sd.marks.forEach(m => { resIdx[m[0] + ':' + m[1]] = (m[4] || '')[Math.floor((m[4] || '').length / 2)] || ''; }); }
    return (resIdx && p.i != null && resIdx[p.i + ':' + pos]) || (PV.acc === p.acc && PV.rec?.seq?.[pos - 1]) || (D.residues?.length === 1 ? D.residues[0] : '');
  };
  const norm = x => String(x || '').toUpperCase().replace(/[-\s._/]/g, '');
  const P_BY_NAME = {}, P_BY_NORM = {};
  const addName = (g, acc) => { if (!g) return; P_BY_NAME[g.toUpperCase()] ||= acc; if (norm(g).length >= 3) P_BY_NORM[norm(g)] ||= acc; };
  (D.proteins || []).forEach(([acc, gene, , , , , entry]) => { String(gene || '').split(/[\s;,]+/).filter(Boolean).forEach(g => addName(g, acc)); if (entry) addName(entry, acc); });
  Object.entries(D.protein_aliases || {}).forEach(([acc, al]) => String(al).split(/;\s*/).filter(Boolean).forEach(g => { if (!P_BY_NAME[g.toUpperCase()]) addName(g, acc); }));
  const accOf = x => { const a = String(x || '').toUpperCase().replace(/-\d+$/, ''); return byAcc[a] ? a : null; };
  const nameOf = x => P_BY_NAME[String(x || '').toUpperCase()] || (norm(x).length >= 3 ? P_BY_NORM[norm(x)] : null) || null;
  const ACC_RE = /^([A-NR-Z][0-9][A-Z0-9]{3}[0-9]|[OPQ][0-9][A-Z0-9]{3}[0-9])(-\d+)?$/i;
  // an old section key (the explorer's #ACC/p-na) and the fold that holds that section here
  const SECTION = { 'p-map': 'p-map', 'p-sites': 'p-sites', 'p-seq': 'p-seq', 'p-dom': 'p-regions', 'p-3d': 'p-struct', 'p-ix': 'p-ix', 'p-na': 'p-na',
    'p-cond': 'p-cond', 'p-dis': 'p-dis', 'p-depmap': 'p-depmap', 'p-pert': 'p-pert', 'p-exp': 'p-exp', 'p-cluster': 'p-cluster', 'p-ptm': 'p-ptm', 'p-func': 'p-kinds', 'p-path': 'p-kinds', 'p-score': 'p-score', 'p-kinds': 'p-kinds', 'p-regions': 'p-regions', 'p-struct': 'p-struct', 'p-cons': 'p-cons' };
  // a site's part of the address, read as the page numbers it: R2 or 2 on a protein numbered without its first residue
  const readAt = (acc, at) => {
    if (!at) return '';
    if (/^p-[a-z0-9]+$/i.test(at)) return '/' + at.toLowerCase();
    if (/^\d+-\d+$/.test(at)) return '/' + at;
    const s = /^[A-Za-z]?(\d+)$/.exec(at); if (!s) return '';
    const p = byAcc[acc]; return '/' + (p ? uniPos(p, +s[1]) : +s[1]);
  };
  K.routes.protein = {
    path: arg => {
      const [acc, at] = String(arg).split('/'), p = byAcc[acc] || (PV.lightP?.acc === acc ? PV.lightP : null); if (!p) return String(arg);
      const s = at && /^\d+$/.test(at) ? siteOf(p, +at) : at;
      return [geneTag(p), acc, s].filter(Boolean).join('/');
    },
    arg: path => {
      const parts = String(path).split('/').filter(Boolean);
      const i = parts.findIndex(accOf);
      if (i >= 0) return accOf(parts[i]) + readAt(accOf(parts[i]), parts[i + 1]);
      const g = nameOf(parts[0]); if (g) return g + readAt(g, parts[1]);
      const sp = K.shown?.protein(parts[0]); if (sp) return sp.acc + readAt(sp.acc, parts[1]);   // only marks shown, not counted
      // a protein without marks: its accession (or a name the light pages' index resolves), its light page
      return parts.length ? (ACC_RE.test(parts[0]) ? parts[0].toUpperCase() : parts[0]) : String(path);
    },
    // an old link that names a protein (#FUS, #FUS/R216, #TDP-43, #P10636): the explorer's form, with no view in it
    claims: path => { const [t, at] = String(path || '').split('/'); return !!t && (!!accOf(t) || !!nameOf(t) || ACC_RE.test(t)) && (!at || /^[A-Za-z]?\d+$|^p-[a-z0-9]+$|^\d+-\d+$/i.test(at)); },
  };

  // ---- the headline cards: each a fact of the protein, a hover with its numbers, a click opening its section ---------
  const GLYPH = {
    pins: '<svg viewBox="0 0 64 22" aria-hidden="true"><line x1="2" y1="19" x2="62" y2="19"/><g class="g-a"><line x1="12" y1="19" x2="12" y2="9"/><circle cx="12" cy="7" r="3.4"/><line x1="25" y1="19" x2="25" y2="12"/><circle cx="25" cy="10" r="3.4"/><line x1="34" y1="19" x2="34" y2="7"/><circle cx="34" cy="5" r="3.4"/><line x1="50" y1="19" x2="50" y2="11"/><circle cx="50" cy="9" r="3.4"/></g></svg>',
    wave: '<svg viewBox="0 0 64 22" aria-hidden="true"><rect x="2" y="7" width="18" height="8" rx="3"/><path d="M20 11 q4 -6 8 0 t8 0 t8 0 t8 0"/><circle class="g-f" cx="58" cy="7" r="3.2"/></svg>',
    squiggle: '<svg viewBox="0 0 64 22" aria-hidden="true"><path d="M3 14 q5 -10 10 0 t10 0 t10 0 t10 0"/><circle class="g-f" cx="50" cy="5" r="3.2"/></svg>',
    drops: '<svg viewBox="0 0 64 22" aria-hidden="true"><circle cx="10" cy="11" r="7"/><circle cx="27" cy="9" r="5"/><circle cx="39" cy="13" r="3.5"/><circle class="g-f" cx="9" cy="10" r="2"/></svg>',
    cross: '<svg viewBox="0 0 64 22" aria-hidden="true"><rect x="4" y="3" width="16" height="16" rx="3"/><path d="M12 7 v8 M8 11 h8"/></svg>',
    bars: '<svg viewBox="0 0 64 22" aria-hidden="true"><path d="M6 19 v-6 M14 19 v-12 M22 19 v-9 M30 19 v-15"/></svg>',
  };
  const glyphOf = (g, word) => (g === 'letters' ? `<span class="hl-letters">${[...String(word || '').replace(/[^A-Z]/g, '').slice(0, 3)].map((ch, k) => `<b class="${k === 0 && ch === (D.residues || [])[0] ? 'on' : ''}">${esc(ch)}</b>`).join('')}</span>` : GLYPH[g] || '');
  // the class at its marks that the site's own tests favour most (the within-protein rows, else the pooled ones)
  const bestRow = (aid, classes) => {
    const want = new Set(classes), rows = D.rows.filter(r => r.analysis === aid && want.has(r.category) && r.dir === 'more');
    const pick = m => rows.filter(r => r.method === m).sort((a, b) => b.eff - a.eff)[0];
    return A[aid]?.kind === 'protein_sets' ? pick('enricher') : pick('mantel_haenszel') || pick('fisher');
  };
  // a fact of the protein: a protein attribute (proteins.attributes), or a column of a protein_values table
  const protValue = (p, f) => { if (f.attribute) { const v = K.proteinAttr?.(p.acc, f.attribute); return v ?? ''; }
    const r = f.table ? K.card?.rows(PV.tb, f.table)?.[0] : null; return r ? r[f.column] : ''; };
  function headline(p, rec) {
    const facts = D.protein_view?.facts; if (!facts?.length) return '';
    const n = rec.marks.length, fill = (t, extra = {}) => String(t || '').replace(/\{residues\}/g, W.residues).replace(/\{marks\}/g, W.marks).replace(/\{class\}/g, extra.cls || '');
    const cards = facts.map(f => {
      let big = '', lab = '', tip = typeof f.tip === 'string' ? f.tip : '', word = '';
      if (f.count) {
        big = f.of === 'candidates' ? `${int(n)} of ${int(p.cand)}` : int(n); lab = fill(f.label || cap(W.marks));
        tip = `<b>${esc(p.gene || p.acc)}</b>: ${int(n)} ${esc(n === 1 ? W.mark : W.marks)}${f.of ? ` of ${int(p.cand)} ${esc(W.residues)}` : ''}`;
        if (f.tip?.values) tip += f.tip.values.map(v => { const x = protValue(p, { ...v, table: f.tip.table }); return x === '' || x == null ? '' : `<br>${esc(v.label)} ${esc(K.card ? K.card.num(x, v.format) : x)}`; }).join('');
      } else if (f.attribute) {
        const want = new Set(f.values || []), k = rec.marks.filter(m => attrVal(m, f.attribute).split(SPECS[f.attribute]?.separator || '; ').some(v => want.has(v))).length;
        big = `${int(k)} of ${int(n)}`; lab = fill(f.label);
      } else if (A[f.analysis]?.kind === 'protein_sets') {
        const sd = K.sel?.data(), ps = sd?.protein_sets?.[f.analysis]; if (!ps) return '';
        const names = ps.sets.map(([s]) => s).filter(s => K.sel.setHas(f.analysis, s, p.i)); if (!names.length) return '';
        const best = f.best ? bestRow(f.analysis, names) : null, setLab = s => (A[f.analysis].labels || {})[s] || s;
        big = int(names.length); lab = fill(best ? f.label : String(f.label || A[f.analysis].title).replace(/,? ?with \{class\}/, ''), { cls: best ? setLab(best.category) : '' });
        tip = `<b>${esc(p.gene || p.acc)}</b> is in ${int(names.length)}: ${esc(names.slice(0, 12).map(setLab).join('; '))}${names.length > 12 ? ' …' : ''}` +
          (best ? `<br>${esc(setLab(best.category))}: across the site, ${esc(W.marked)} proteins are ${esc(K.fxn(best.eff))}× over-represented in it (q ${K.fq(best.q)})` : '');
      } else {
        const k = K.cols.cls(f.analysis); if (k < 0) return '';
        const at = rec.marks.map(m => String(m[2][k] || '').split(';').filter(Boolean));
        if (f.best) {
          const present = [...new Set(at.flat())], best = bestRow(f.analysis, present);
          if (!best) return '';
          const kk = at.filter(cs => cs.includes(best.category)).length, others = present.map(cl => bestRow(f.analysis, [cl])).filter(r => r && r !== best).sort((a, b) => b.eff - a.eff);
          big = `${int(kk)} of ${int(n)}`; word = label(f.analysis, best.category);
          lab = `${fill(f.label, { cls: word })} (OR ${K.fxn(best.eff)}× across the site)`;
          tip = `<b>${esc(word)}</b>${help(f.analysis, best.category) ? ' (' + esc(help(f.analysis, best.category)) + ')' : ''}: the class most enriched at these ${esc(W.marks)}: OR ${esc(K.fxn(best.eff))}× against the other ${esc(W.residues)} of the same proteins (${best.method === 'fisher' ? 'pooled' : 'within proteins'}; q ${K.fq(best.q)})` +
            (others.length ? `<br>Others here: ${others.map(r => `${esc(label(f.analysis, r.category))} ${at.filter(cs => cs.includes(r.category)).length} (${esc(K.fxn(r.eff))}×)`).join(', ')}` : '');
        } else {
          const want = new Set(f.classes || []); big = `${int(at.filter(cs => cs.some(x => want.has(x))).length)} of ${int(n)}`;
          lab = fill(f.label || `in: ${(f.classes || []).map(x => label(f.analysis, x)).join(', ')}`);
          tip ||= (f.classes || []).map(x => help(f.analysis, x)).filter(Boolean).join('; ');
        }
      }
      const tag = f.opens ? 'button' : 'div';
      return `<${tag} class="hl-card"${f.opens ? ` type="button" data-hl-open="${esc(f.opens)}"` : ''} data-hl-tip="${esc(tip)}"><span class="hl-glyph">${glyphOf(f.glyph, word)}</span><b class="hl-big">${big}</b><span class="hl-lab">${esc(lab)}</span>${f.kind ? `<span class="hl-kind">${esc(f.kind)}</span>` : ''}</${tag}>`;
    }).filter(Boolean);
    return cards.length ? `<div class="hl-cards">${cards.join('')}</div>` : '';
  }

  // ---- the sites table: fixed columns (site, state, window and motifs), the site file's optional ones (the Columns
  // menu), the 3D and Evidence actions, an Evidence row per site, and a filter by an attribute -------------------------
  const colourAttr = Object.keys(SPECS).find(n => SPECS[n].colour && SPECS[n].kind === 'category');
  const FLAGS = COLS.filter(aid => A[aid]?.shape === 'flags');
  function tableCols() {
    if (TC?.columns) return TC.columns;
    // a site without its own columns: the attributes it colours or links, and every question, the site file's shown first
    return [...Object.keys(SPECS).filter(n => n !== colourAttr && (SPECS[n].colour || (SPECS[n].kind === 'list' && SPECS[n].link))).map(n => ({ id: 'a:' + n, label: SPECS[n].label, attribute: n, default: true })),
      ...COLS.filter(aid => !FLAGS.includes(aid)).map(aid => ({ id: 'q:' + aid, label: A[aid]?.title || aid, analyses: [aid], default: (D.sites_view?.columns || []).includes(aid) }))];
  }
  const SHOW = {
    status: c => K.card.badge(c), tags: c => (K.density.compact() ? K.card.tags(c, -1) : K.card.tags(c, 4)),
    sequences: c => { if (!K.density.compact()) return K.card.sequences(c, true); const ws = K.card.windowsOf(c) || []; return ws.length ? `<span class="tag t-a more" title="${esc(ws.map(w => w.names[0] || '').filter(Boolean).join('\n'))}">${ws.length} bound</span>` : ''; },
    around: c => K.card.around(c, K.density.compact() ? 'brief' : true), calls: c => K.card.calls(c, K.density.compact()),
    plddt: c => plddtHtml(c.p, c.pos), nearest: c => { const x = nearestOf(c.rec, c.pos); return x == null ? '' : `${int(Math.abs(x - c.pos))} aa`; },
    states: c => K.card.states(c, true), changes: c => K.card.changes(c),
    nearest_domain: c => { const nd = TC?.nearest_domain; if (!nd || !K.card.has(nd.table)) return ''; const r = K.card.at(c.tb, nd.table, c.pos)[0]; if (!r || !r[nd.name]) return '';
      const u = nd.url && r[nd.ref] ? nd.url.replace('{ref}', encodeURIComponent(r[nd.ref])) : '';
      return `${u ? `<a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(r[nd.ref])}">${esc(r[nd.name])}</a>` : esc(r[nd.name])}<br><span class="muted">${r[nd.distance] === '0' ? esc((nd.sides || {}).inside || 'inside') : `${esc(r[nd.distance])} aa ${esc((nd.sides || {})[r[nd.side]] || r[nd.side] || '')}`}</span>`; },
  };
  const cellOf = (col, c, m) => {
    let h = '';
    if (col.attribute) h = SPECS[col.attribute]?.colour && SPECS[col.attribute].kind === 'category' ? pillOf(m, col.attribute) : attrHtml(m, col.attribute, false);
    else if (col.analyses) h = col.analyses.map(aid => { const k = K.cols.cls(aid), v = m[2][k]; return `<span title="${esc(help(aid, v))}">${esc(classText(aid, v))}</span>`; }).join('<br>');
    else if (col.show) h = PV.tb ? col.show.map(k => (SHOW[k] ? SHOW[k](c) : '')).join('') : '<span class="muted">…</span>';
    return h || '<span class="muted">–</span>';
  };
  const evRowOn = () => K.card.has(CC.sources?.table) || (CC.tables || []).some(x => K.card.has(x.table)) || (CC.calls?.tables || []).some(K.card.has);
  // the marks shown and counted nowhere (K.shown), after the marks, hatched, each with its tag; a row opens its card
  function shownRows(p, rec, shown, flt, fv) {
    return (rec.shown || []).filter(m => !(fv && attrVal(m, flt) !== fv)).map(m => `<tr data-site="${m[0]}" tabindex="0" class="lc-row${PV.site === m[0] ? ' on' : ''}"><td class="mono" data-label="Site"><b>${esc(siteOf(p, m[0]))}</b>${numOf(p) ? `<br><span class="muted small">UniProt ${m[0]}</span>` : ''}<div class="tags">${K.shown.tag(m, true)}</div></td>` +
      (colourAttr ? `<td data-label="${esc(SPECS[colourAttr].label)}">${pillOf(m, colourAttr)}</td>` : '') +
      `<td class="cwin" data-label="Window ±7"><span class="mono">${winHtml(m[1])}</span></td>` +
      shown.map(col => `<td class="cw" data-label="${esc(col.label)}">${col.attribute ? cellOf(col, null, m) : '<span class="muted">–</span>'}</td>`).join('') +
      `<td class="nw" data-label=""><span class="row-acts">${typeof K.show3d === 'function' ? `<button type="button" class="btn small" data-site-3d="${m[0]}" title="Show ${esc(siteOf(p, m[0]))} in the 3D structure">3D</button>` : ''}</span></td></tr>`).join('');
  }
  function sitesTable(p, rec, sel) {
    const cols = tableCols(), defaults = cols.filter(c => c.default).map(c => c.id), table = 'protein-sites';
    const on = new Set(K.columns.on(table, cols, defaults)), shown = cols.filter(c => on.has(c.id));
    const flt = TC?.filter && SPECS[TC.filter] ? TC.filter : null, fv = flt ? PV.pf : '';
    const posList = TC?.positions && K.card.has(TC.positions.table) ? TC.positions : null;
    const head = `<tr><th aria-sort="ascending" title="In order along the chain">Site</th>${colourAttr ? `<th>${esc(SPECS[colourAttr].label)}</th>` : ''}<th${FLAGS.length ? ` title="Window ±7 and its ${esc(FLAGS.map(a => A[a]?.title || a).join(', ').toLowerCase())}"` : ''}>Window ±7${FLAGS.length ? ' · tags' : ''}</th>${shown.map(c => `<th>${esc(c.label)}</th>`).join('')}<th><span class="vh">Actions</span></th></tr>`;
    const n = 3 + (colourAttr ? 1 : 0) + shown.length;
    const body = [...rec.marks].sort((x, y) => x[0] - y[0]).map(m => {      // along the chain, as the original explorer lists them
      if (fv && attrVal(m, flt) !== fv) return '';
      const c = cardCtx(p, rec, m), off = sel && !sel.has(m[0]), open = PV.evOpen.has(m[0]);
      const src = posList ? [...new Set(String((K.card.at(c.tb, posList.table, m[0])[0] || {})[posList.column] || '').split(/;\s*/).filter(Boolean))] : [];
      const srcNote = src.length && !(src.length === 1 && +src[0] === m[0]) ? `<br><span class="muted small" title="Positions the sources gave before mapping to the current sequence">source position${src.length > 1 ? 's' : ''} ${esc(src.join(', '))}</span>` : '';
      return `<tr data-site="${m[0]}" tabindex="0" class="${off ? 'faded' : ''}${PV.site === m[0] ? ' on' : ''}"><td class="mono" data-label="Site"><b>${esc(siteOf(p, m[0]))}</b>${numOf(p) ? `<br><span class="muted small">UniProt ${m[0]}</span>` : ''}${srcNote}${K.shown?.on && K.shown.counted(m) ? `<div class="tags">${K.shown.tag(m, false)}</div>` : ''}</td>` +
        (colourAttr ? `<td data-label="${esc(SPECS[colourAttr].label)}">${pillOf(m, colourAttr)}</td>` : '') +
        `<td class="cwin" data-label="Window ±7"><span class="mono">${winHtml(m[1])}</span>${FLAGS.map(aid => flagTags(aid, K.cols.markClass(m, aid))).join('')}</td>` +
        shown.map(col => `<td class="cw" data-label="${esc(col.label)}">${cellOf(col, c, m)}</td>`).join('') +
        `<td class="nw" data-label=""><span class="row-acts">${typeof K.show3d === 'function' ? `<button type="button" class="btn small" data-site-3d="${m[0]}" title="Show ${esc(siteOf(p, m[0]))} in the 3D structure">3D</button>` : ''}` +
        `${evRowOn() || !PV.tb ? `<button type="button" class="btn small" data-ev-toggle="${m[0]}" aria-expanded="${open}" title="Every source record and measurement of the site">${open ? 'Hide' : 'Evidence'}</button>` : ''}</span></td></tr>` +
        (open ? `<tr class="ev-row" data-for="${m[0]}"><td colspan="${n}">${PV.tb ? K.card.evidenceRow(c) : '<p class="muted">Loading…</p>'}</td></tr>` : '');
    }).join('') + shownRows(p, rec, shown, flt, fv);
    const counts = flt ? Object.entries(rec.marks.reduce((o, m) => { const v = attrVal(m, flt); o[v] = (o[v] || 0) + 1; return o; }, {})) : [];
    const order = flt ? Object.keys(SPECS[flt].values || {}) : [];
    const seg = flt ? `<div class="ix-seg"><span class="flabel">${esc(SPECS[flt].label)} at these ${esc(W.marks)}</span> <span class="seg" role="group">${(order.length ? order : counts.map(([v]) => v)).map(v => { const k = (counts.find(([x]) => x === v) || [, 0])[1];
      return `<button type="button" data-pfilter="${esc(v)}" aria-pressed="${fv === v}"${k ? '' : ' disabled'}><i class="ixd" style="--c:${K.map.attrColour(flt, v)}"></i>${esc(vLabel(flt, v))} <b>${int(k)}</b></button>`; }).join('')}</span></div>` : '';
    return `<div class="card-head"><p class="sub">Each ${esc(W.mark)} with the 15 residues around it. Click a row to open its card${evRowOn() ? '; Evidence lists every source record and measurement' : ''}.</p><span class="tools">${K.columns.menu(table, cols, defaults)}${K.expBar(['tsv'], 'sexp', 'the sites')}</span></div>` + seg +
      `<div class="tbl-card lk-box"><table class="tbl stbl stackable"><thead>${head}</thead><tbody>${body}</tbody></table></div>` +
      (fv ? `<p class="note">Showing the ${esc(W.marks)} with ${esc(vLabel(flt, fv).toLowerCase())} ${esc(SPECS[flt].label.toLowerCase())}. <button class="linkish" type="button" data-pfilter="">Show all</button></p>` : '') +
      (CC.cite ? K.card.citeBox(`the ${int(rec.marks.length)} ${rec.marks.length === 1 ? W.mark : W.marks} on ${p.gene || p.acc}`, rec.marks, (m, n) => attrVal(m, n), false) : '');
  }
  const vLabel = (n, v) => (K.sel?.valueLabel ? K.sel.valueLabel(n, v) : v);

  // ---- a protein's page -----------------------------------------------------------------------------------------------
  function proteinView(arg) {
    const [key, sitePos] = String(arg).split('/');
    let p = byAcc[key];
    if (!p && K.shown?.protein(key)) return shownOnlyView(K.shown.protein(key), sitePos);
    if (!p) return lightView(key);
    const acc = p.acc;
    // #protein/ACC/216 opens a mark's card; #protein/ACC/120-180 opens the map zoomed to a region (an IDR, from its page);
    // #protein/ACC/p-na opens a section
    const span = /^(\d+)-(\d+)$/.exec(sitePos || ''), sec = /^p-[a-z0-9]+$/.exec(sitePos || '');
    load(acc); PV.site = sitePos && !span && !sec ? +sitePos : null; K.site.state.focus = PV.site; K.site.state.acc = acc;
    if (sec) { PV.focus = SECTION[sec[0]] || ''; if (PV.focus) { PV.open[PV.focus] = true; const g = GROUPS.find(x => (x.folds || []).includes(PV.focus)); if (g) PV.open[g.id] = true; } }
    if (!span) { PV.span = null; PV.spanArg = ''; }
    else if (PV.spanArg !== sitePos) {
      const a = Math.max(1, +span[1]), b = Math.min(p.len, +span[2]), pad = Math.max(5, Math.round((b - a + 1) * 0.15));
      PV.span = [a, b]; PV.spanArg = sitePos; PV.scrolled = null; K.map.state.zoom = [Math.max(1, a - pad), Math.min(p.len, b + pad)];
    }
    if (PV.rec && PV.site && !PV.rec.marks.some(m => m[0] === PV.site) && !shownAt(PV.rec, PV.site)) { PV.site = null; PV.cleanArg = true; }
    const selTxt = K.sel?.active() ? `${int(K.sel.nMarks())} ${esc(K.sel.nMarks() === 1 ? W.mark : W.marks)} · selection` : `all ${esc(W.marks)}`;
    const head = `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <a href="${esc(K.link('proteins'))}">Proteins</a> <span class="muted">(${selTxt})</span> › <b>${esc(p.gene || p.acc)}</b>${PV.site ? ` › ${esc(PV.rec ? siteOf(p, PV.site) : PV.site)}` : PV.span ? ` › ${int(PV.span[0])}–${int(PV.span[1])}` : ''}</p>` +
      protHead(p);
    if (!PV.rec) return head + `<p class="empty">${PV.err ? esc(PV.err) : 'Loading…'}</p>`;
    const rec = PV.rec, sel = K.sel?.active() ? K.sel.selectedPositions(acc) : null;
    const tabs = CARDS ? tabState() : null;
    const isOpen = (id, open) => (tabs && id in tabs.on ? tabs.on[id] : CARDS ? !!PV.open[id] || (id === 'p-map' && PV.open[id] !== false) : (PV.open[id] ?? foldOpen(id, open)));
    const fold = (id, title, sum, body, open) => `<details class="pfold" id="${id}"${isOpen(id, open) ? ' open' : ''}><summary><span class="pfm" aria-hidden="true"></span><h3>${title}</h3><span class="fsum">${sum}</span></summary><div class="pfold-body">${body}</div></details>`;
    const nSrc = Object.keys(SPECS).find(n => SPECS[n].kind === 'list' && SPECS[n].link);
    const page = laid => (CARDS ? cardsLayout(laid, p, rec, tabs) : arrangeFolds(laid));
    return head +
      (sel && sel.size < rec.marks.length ? `<p class="note">${int(sel.size)} of ${int(rec.marks.length)} ${esc(W.marks)} match your selection; the others are faded. <button class="linkish" type="button" data-sel-clear-all>Clear filters</button></p>` : '') +
      page(
      fold('p-map', 'Protein map', `${int(rec.marks.length)} ${esc(rec.marks.length === 1 ? W.mark : W.marks)} on ${int(p.len)} aa${numOf(p) ? ` · ${esc(numOf(p).label || 'numbered as papers do')}` : ''}`, `<div class="card-head"><p class="sub">Rows from this dataset and live sources. ${CARDS && narrow() ? 'Tap' : 'Hover for a description, click'} to pin.</p>${CARDS ? '' : mapExp(['pdf', 'svg', 'png', 'tsv'])}</div><div id="pmap" class="pmap"></div>${CARDS ? `<div class="map-exp-below">${mapExp(['pdf', 'svg', 'png', 'tsv'])}</div>` : ''}${siteCard(p, rec)}`, true) +
      (headline(p, rec) || legacyFacts(p, rec, nSrc)) +
      fold('p-sites', `${esc(cap(W.marks))}`, `${int(rec.marks.length)}${nSrc ? ` · ${int(new Set(rec.marks.flatMap(m => (attrVal(m, nSrc) || '').split(SPECS[nSrc].separator || '; ').filter(Boolean))).size)} ${esc(SPECS[nSrc].label.toLowerCase())}` : ''}${rec.shown?.length ? ` · ${int(rec.shown.length)} more ${esc(K.shown.row())}` : ''}`, sitesTable(p, rec, sel), true) +
      fold('p-score', `${esc(cap(W.marks))} vs other ${esc(W.residues)} in ${esc(p.gene || p.acc)}`, esc(`Can't be tested for one protein${baseText() ? '; dataset-wide: ' + baseText() : ''}`), `${scoreVerdict(p, rec)}<p class="sub">Share of ${esc(W.marks)} and of other ${esc(W.residues)} in each class. Click a row to see every class.</p><div class="hub">${scoreRows(p, rec)}</div>`, false) +
      (D.analyses.some(a => a.kind === 'protein_sets') ? fold('p-kinds', 'Protein classes and pathways', '', kindsHtml(p), false) : '') +
      (K.proteinFolds || []).map(f => f(p, rec, fold)).join('') +
      fold('p-regions', 'Domains and regions', `${int(rec.units.length)} region${rec.units.length === 1 ? '' : 's'}`, regionsHtml(p, rec), false) +
      fold('p-seq', 'Sequence', `${int((rec.seq || '').length)} aa, and as FASTA`, sequenceHtml(p, rec, sel), false) +
      fold('p-struct', '3D structure', K.s3d.summary(), K.s3d.html(p, rec), false) +           // kit-3d.js
      '');
  }
  // the facts as tiles, for a site without headline cards
  function legacyFacts(p, rec, nSrc) {
    const facts = [[int(rec.marks.length), cap(rec.marks.length === 1 ? W.mark : W.marks)], [int(p.cand), `${cap(W.residues)} (${pct(p.marks, p.cand)} ${W.marked})`],
      ...(nSrc ? [[int(new Set(rec.marks.flatMap(m => (attrVal(m, nSrc) || '').split(SPECS[nSrc].separator || '; ').filter(Boolean))).size), `${SPECS[nSrc].label} reporting ${rec.marks.length === 1 ? 'it' : 'them'}`]] : [])];
    return `<div class="facts">${facts.map(([b, t]) => `<div class="fact"><b>${b}</b><span>${esc(t)}</span></div>`).join('')}</div>`;
  }
  // the head of a protein's page: its names, function (UniProt, live), links, the PDF and Print buttons
  const protHead = (p, light) => `<div class="prot-head"><h2>${esc(p.gene || p.acc)} <small>${esc(p.name)}</small></h2>` +
    `<p class="aliases" id="aliases">${D.protein_aliases?.[p.acc] ? `Also reported as ${esc(D.protein_aliases[p.acc].replace(/;\s*/g, ', '))}` : ''}</p><div class="fn" id="fn"><p class="muted">Asking UniProt for its function…</p></div>` +
    `<div class="prot-chips"><span class="chip mono">${esc(p.acc)}</span>${(PV.rec?.entry || p.entry) ? `<span class="chip mono">${esc(PV.rec?.entry || p.entry)}</span>` : ''}<a class="btn small" href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}" target="_blank" rel="noopener">UniProt ↗</a>` +
    `<span class="more-links"><button type="button" class="btn small" data-more-links aria-expanded="${PV.more}">More links ▾</button><span class="menu" id="more-menu"${PV.more ? '' : ' hidden'}>${LINKS(p.acc).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join('')}</span></span>` +
    `${light ? '' : '<button type="button" class="btn small accent" data-page-pdf>Download PDF</button>'}<button type="button" class="btn small" data-print>Print</button></div></div><div id="drift" class="drift" hidden></div>`;

  // ---- a protein with only marks shown and counted nowhere (K.shown): its map, those marks with their tag, its
  // sequence and 3D; nothing of it is counted, so it has no counts, questions or kinds -------------------------------
  function shownOnlyView(sp, sitePos) {
    load(sp.acc); PV.lightP = sp;
    PV.site = sitePos && /^\d+$/.test(sitePos) ? +sitePos : null; K.site.state.focus = PV.site; K.site.state.acc = p.acc;
    if (PV.rec && PV.site && !shownAt(PV.rec, PV.site)) { PV.site = null; PV.cleanArg = true; }
    const p = sp, n = PV.rec?.shown?.length || 0;
    const head = `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <a href="${esc(K.link('proteins'))}">Proteins</a> › <b>${esc(p.gene || p.acc)}</b> <span class="muted">${esc(K.shown.row())}</span>${PV.site ? ` › ${esc(siteOf(p, PV.site))}` : ''}</p>` + protHead(p, true);
    if (!PV.rec) return head + `<p class="empty">${PV.err ? esc(PV.err) : 'Loading…'}</p>`;
    const rec = PV.rec;
    const fold = (id, title, sum, body, open) => `<details class="pfold" id="${id}"${(PV.open[id] ?? open) ? ' open' : ''}><summary><span class="pfm" aria-hidden="true"></span><h3>${title}</h3><span class="fsum">${sum}</span></summary><div class="pfold-body">${body}</div></details>`;
    const cols = tableCols().filter(c => c.attribute), on = new Set(K.columns.on('protein-sites', cols, cols.filter(c => c.default).map(c => c.id))), shown = cols.filter(c => on.has(c.id));
    const table = `<div class="tbl-card"><table class="tbl stbl stackable"><thead><tr><th>Site</th>${colourAttr ? `<th>${esc(SPECS[colourAttr].label)}</th>` : ''}<th>Window ±7</th>${shown.map(c => `<th>${esc(c.label)}</th>`).join('')}<th><span class="vh">Actions</span></th></tr></thead><tbody>${shownRows(p, rec, shown, null, '')}</tbody></table></div>`;
    return head +
      `<p class="note">No counted ${esc(W.mark)} on ${esc(p.gene || p.acc)}. It has ${int(n)} ${esc(n === 1 ? W.mark : W.marks)} shown here (${esc(K.shown.label())}) but not among the ${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins, and in no count, chart or test.</p>` +
      `<div class="facts"><div class="fact"><b>${int(p.len)}</b><span>Residues</span></div><div class="fact"><b>${int(n)}</b><span>${esc(cap(K.shown.row()))}</span></div></div>` +
      fold('p-map', 'Protein map', `${int(n)} ${esc(K.shown.row())} on ${int(p.len)} aa`, `<div class="card-head"><p class="sub">The protein, its ${esc(W.marks)} shown but not counted (hatched), and rows from live sources. Hover for what an item is, click to pin it.</p>${mapExp(['pdf', 'svg', 'png'])}</div><div id="pmap" class="pmap"></div>${siteCard(p, rec)}`, true) +
      fold('p-sites', esc(cap(W.marks)), `${int(n)} ${esc(K.shown.row())}`, `<p class="sub">Each with the 15 residues around it; a row opens its card. The tag’s hover gives the tests.</p>${table}`, true) +
      fold('p-seq', 'Sequence', `${int((rec.seq || '').length)} aa, and as FASTA`, sequenceHtml(p, rec, null), false) +
      fold('p-struct', '3D structure', K.s3d.summary(), K.s3d.html(p, rec), false);
  }

  // ---- a protein without marks: a light page with its map, the records that name it as a partner, and the proteins
  // with marks that the site's partner table associates with it ------------------------------------------------------
  function lightView(key) {
    let L = PV.light;
    if (!(L && (L.key === key || (L.state === 'ok' && PV.lightP?.acc === String(key).toUpperCase())))) {
      PV.light = L = { key, state: 'look' }; Object.assign(PV, { acc: '', rec: null, lightP: null, tb: null, site: null });
    }
    if (L.state === 'look') return `<p class="empty">Looking up ${esc(key)}…</p>`;
    if (L.state === 'none') return `<div class="empty"><p><b>No protein ${esc(key)} in this site.</b> Its proteins are the ${esc(D.run.snapshot?.release || 'reference')} sequences; ${esc(key)} is not one of them, or names a protein by another name.</p>` +
      `${ACC_RE.test(key) ? `<p><a class="btn small" href="https://www.uniprot.org/uniprotkb/${esc(key)}/entry" target="_blank" rel="noopener">${esc(key)} in UniProt ↗</a></p>` : ''}<p><a href="${esc(K.link('proteins'))}">All proteins</a></p></div>`;
    const p = PV.lightP, x = L.x, rec = PV.rec;
    const ptab = CC.writer?.partners?.table, partners = ptab ? K.card.partnersOf(x, ptab) : [];
    const res = new Set(D.residues || []), nRes = [...(x.seq || '')].filter(ch => res.has(ch)).length;
    const chip = r => { const q = byAcc[r.acc]; return q ? `<a class="gene-chip" href="${esc(K.link('protein', q.acc))}" title="${esc(`${q.gene || q.acc}: ${q.marks} ${q.marks === 1 ? W.mark : W.marks}; score ${r.score}`)}">${esc(q.gene || q.acc)} <span class="muted">${int(q.marks)}</span></a>` : ''; };
    const shownP = PV.lightAll ? partners : partners.slice(0, 40);
    const fold = (id, title, sum, body, open) => `<details class="pfold" id="${id}"${(PV.open[id] ?? open) ? ' open' : ''}><summary><span class="pfm" aria-hidden="true"></span><h3>${title}</h3><span class="fsum">${sum}</span></summary><div class="pfold-body">${body}</div></details>`;
    const asP = K.card.asPartner(x, p.gene || p.acc, (a, pos) => `${byAcc[a]?.gene || a} ${siteOf(byAcc[a] || { acc: a }, pos)}`);
    return `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <a href="${esc(K.link('proteins'))}">Proteins</a> › <b>${esc(p.gene || p.acc)}</b> <span class="muted">no ${esc(W.mark)}</span></p>` + protHead(p, true) +
      `<p class="note">No ${esc(W.mark)} on ${esc(p.gene || p.acc)}. None of its sources reports one, which means not reported, not shown to be un${esc(W.marked)}. This page shows its map, the ${esc(W.marks)} of other proteins it is recorded binding, and its partners with ${esc(W.marks)}.</p>` +
      `<div class="facts"><div class="fact"><b>${int(p.len)}</b><span>Residues</span></div><div class="fact"><b>${int(nRes)}</b><span>${esc(cap(W.residues))}</span></div>` +
      (ptab ? `<div class="fact"><b>${int(partners.length)}</b><span>Partners with ${esc(W.marks)}</span></div>` : '') + '</div>' +
      fold('p-map', 'Protein map', `${int(p.len)} aa, no ${esc(W.mark)}`, `<div class="card-head"><p class="sub">The protein and the rows from live sources; it has no ${esc(W.mark)} in this site.</p>${mapExp(['pdf', 'svg', 'png'])}</div><div id="pmap" class="pmap"></div>`, true) +
      (asP ? `<div class="pfold-like">${asP}</div>` : '') +
      (ptab ? fold('p-partners', `Proteins with ${esc(W.marks)} associated with ${esc(p.gene || p.acc)}`, `${int(partners.length)}`, partners.length ? `<p class="sub">${esc(CC.writer?.partners?.note || 'Partners')}, most confident first; the number is each protein’s ${esc(W.marks)}.</p><div class="gene-chips">${shownP.map(chip).join('')}</div>` +
        `<p>${partners.length > 40 ? `<button class="linkish" type="button" data-light-all>${PV.lightAll ? 'Fewer' : `All ${int(partners.length)}`}</button> · ` : ''}<button class="linkish" type="button" data-try="${esc(partners.map(r => byAcc[r.acc]?.gene || r.acc).join(' '))}">Select these ${int(partners.length)}</button></p>` : `<p class="muted">None in the partner table.</p>`, true) : '') +
      fold('p-seq', 'Sequence', `${int((rec.seq || '').length)} aa, and as FASTA`, sequenceHtml(p, rec, null), false) +
      fold('p-struct', '3D structure', K.s3d.summary(), K.s3d.html(p, rec), false) +           // kit-3d.js
      (K.lightFolds || []).map(f => f(p, null, fold)).join('');
  }
  // a search for one name that only a protein without marks has (MAPT): Enter opens its light page; the search goes
  const lightFind = (idx, key) => { const u = String(key).toUpperCase(); return idx.find(r => r[0] === u.replace(/-\d+$/, '')) || idx.find(r => String(r[1]).toUpperCase() === u) ||
    idx.find(r => String(r[2]).toUpperCase() === u) || (norm(key).length >= 3 ? idx.find(r => norm(r[1]) === norm(key)) : null); };
  let lightIdx = null;
  K.openLight = q => {
    const t = String(q || '').trim(); if (!t || /[\s:]/.test(t) || nameOf(t) || accOf(t)) return false;
    const sp = K.shown?.protein(t); if (sp) { S.q = ''; K.go('protein', { arg: sp.acc }); return true; }
    if (!K.card) return false;
    if (!lightIdx) { K.card.lightIndex().then(ix => { lightIdx = ix; if (S.q === t && lightFind(ix, t)) K.openLight(t); }); return false; }
    const hit = lightFind(lightIdx, t); if (!hit) return false;
    S.q = ''; K.go('protein', { arg: hit[0] }); return true;
  };
  // find a protein without marks (its accession, gene or entry name), then its record
  function lightLoad(key) {
    const L = PV.light; if (!L || L.key !== key || L.started) return;
    L.started = true;
    K.card.lightIndex().then(idx => {
      const hit = lightFind(idx, key);
      if (!hit) { if (PV.light === L) { L.state = 'none'; K.render(); } return; }
      return K.card.light(hit[0]).then(x => {
        if (PV.light !== L) return;
        if (!x) { L.state = 'none'; K.render(); return; }
        const p = { acc: hit[0], gene: x.gene, name: x.name, entry: x.entry, len: (x.seq || '').length, marks: 0, cand: 0, i: null };
        Object.assign(PV, { acc: p.acc, lightP: p, rec: { entry: x.entry, md5: x.md5, seq: x.seq, marks: [], units: [], counts: {}, totals: {} }, tb: {}, af: null, uni: null, uniJson: null, pdb: null, ix: null, site: null, span: null, more: false, fn: false });
        L.state = 'ok'; L.x = x;
        // the address names it as the site's other proteins: its gene before its accession
        if (S.view === 'protein' && S.arg === key) { S.arg = p.acc; K.writeHash(false); }
        K.render();
      });
    });
  }
  K.sections.protein = () => { const p = byAcc[PV.acc] || PV.lightP; if (!byAcc[PV.acc]) return [['view', p ? `${p.gene || p.acc}: ${p.name || ''}` : 'This protein', 1]]; return [['view', p ? `${p.gene || p.acc}: ${p.name || ''}` : 'This protein', 1], ...(PV.site ? [['site-card', `The ${W.mark} ${site(PV.site)}`, 1]] : []),
    ['g-marks', `${cap(W.marks)} on this protein`, 0], ['p-map', 'Protein map', 1], ['p-sites', cap(W.marks), 1], ['p-score', `${cap(W.marks)} vs other ${W.residues}`, 1],
    ['g-protein', 'The protein', 0], ...(D.analyses.some(a => a.kind === 'protein_sets') ? [['p-kinds', 'Protein classes and pathways', 1]] : []), ...(K.proteinFoldSections || []), ['p-regions', 'Domains and regions', 1], ['p-seq', 'Sequence', 1],
    ['g-live', 'Live sources', 0], ['p-struct', '3D structure', 1],]; };
  // the Proteins page: its table, and the proteins with most marks (of the selection, if any)
  K.sections.proteins = () => {
    const cnt = K.sel?.active() ? K.sel.selectedCountByProtein() : null;
    const top = P.slice().map(p => [p, cnt ? (cnt[p.i] || 0) : p.marks]).filter(([, k]) => k > 0).sort((x, y) => y[1] - x[1]).slice(0, 12);
    return [['view', 'Proteins', 1], ['proteins-table', 'The table: search, sort, download', 1], ['g-top', cnt ? `Most ${W.marks} in the selection` : `Most ${W.marks}`, 0],
      ...top.map(([p, k]) => [`p-${p.acc}`, `${p.gene || p.acc} (${int(k)})`, 1, K.link('protein', p.acc)])];
  };

  // ---- kinds of protein: the sets of each protein-set question this protein is in, with the site's result for each,
  // and its abundance as the test placed it (data/selection.json) --------------------------------------------------
  const SETROW = {};
  const setRow = (aid, s, m) => { if (!Object.keys(SETROW).length) D.rows.forEach(r => { if (K.SETS(r.analysis)) SETROW[r.analysis + '\u0000' + r.category + '\u0000' + r.method] = r; }); return SETROW[aid + '\u0000' + s + '\u0000' + m]; };
  const RANK = { more: 0, less: 1, same: 2, ns: 3 };
  function kindsHtml(p) {
    const sd = K.sel?.data();
    if (!sd) return `<p class="muted">Loading the sets…</p>`;
    let cov = null;
    const blocks = D.analyses.filter(a => a.kind === 'protein_sets' && sd.protein_sets?.[a.id] && !K.inSetCards?.(a.id)).map(a => {
      const ps = sd.protein_sets[a.id];
      if (ps.covariate && !cov && ps.covariate.proteins[p.i]) cov = { ...ps.covariate, me: ps.covariate.proteins[p.i], from: a };
      const mine = ps.sets.filter(([s]) => K.sel.setHas(a.id, s, p.i)).map(([s]) => ({ s, r: setRow(a.id, s, 'enricher') })).filter(x => x.r)
        .sort((x, y) => RANK[x.r.dir] - RANK[y.r.dir] || x.r.q - y.r.q);
      if (!mine.length) return `<div class="kind"><h4>${esc(a.title)}</h4><p class="muted">In none of its tested sets.</p></div>`;
      const shown = PV.open['kinds:' + a.id] ? mine : mine.slice(0, 10);
      return `<div class="kind"><h4>${esc(a.title)} <span class="muted">${int(mine.length)} set${mine.length === 1 ? '' : 's'}</span></h4><ul class="kind-list">` +
        shown.map(({ s, r }) => { const hs = K.holdStatus(r), nh = hs === 'lost' || hs === 'weaker'; return `<li><button class="linkish" type="button" data-f="p:${esc(a.id)}" data-v="${esc(s)}" title="Select the ${esc(W.marks)} on proteins in this set">${esc(r.label)}</button>${a.link && K.setIdLink ? ' ' + K.setIdLink(a.id, s) : ''} <span class="val ${r.dir}">${esc(K.effText(r))}</span> <span class="muted">q ${K.fq(r.q)}</span>${nh ? ` <span class="nh" title="${hs === 'lost' ? 'Lost within abundance deciles' : 'The same direction within abundance deciles, but not significant there'}">${hs === 'lost' ? '○' : '◌'}</span>` : ''}</li>`; }).join('') + '</ul>' +
        (mine.length > 10 ? `<button class="linkish" type="button" data-kinds-all="${esc(a.id)}">${PV.open['kinds:' + a.id] ? 'Fewer' : `All ${int(mine.length)}`}</button>` : '') + '</div>';
    }).join('');
    const covLine = cov ? `<p class="kind-cov"><b>Abundance</b>: ${cov.me[0] == null ? 'no value' : `${esc(cov.value)} ${K.fxn(cov.me[0])}`}${cov.me[1] !== 'none' ? `, decile ${esc(cov.me[1])} of ${int(cov.strata)}` : ''} <span class="muted">(${esc((Object.values(D.inputs).find(x => (x.roles || [x.role]).includes(cov.input)) || {}).version || cov.input)}; the decile the protein-set tests stratify by)</span></p>` : '';
    return covLine + `<div class="kinds">${blocks}</div><p class="note">Each result is for all ${esc(W.marked)} proteins against the background, not for this protein. A set’s name selects the ${esc(W.marks)} on its proteins.</p>`;
  }

  // ---- domains and regions: every region the site's questions read, as a table, with the marks inside each --------
  function regionsHtml(p, rec) {
    const tracks = D.tracks || [], title = k => (tracks.find(t => t.kind === k) || {}).title || k;
    const labs = k => { const t = tracks.find(x => x.kind === k); return (A[t?.analysis] || {}).labels || {}; };
    const refUrl = ref => { const r = (D.ref_links || []).find(x => ref && new RegExp(x.pattern).test(ref)); return r ? r.url.replace('{ref}', encodeURIComponent(ref)) : null; };
    const rows = rec.units.slice().sort((x, y) => tracks.findIndex(t => t.kind === x[0]) - tracks.findIndex(t => t.kind === y[0]) || x[1] - y[1]);
    if (!rows.length) return `<p class="muted">No region is placed on this protein.</p>`;
    return `<div class="card-head"><p class="sub">Regions with the ${esc(W.marks)} inside them. Click a ${esc(W.mark)} to open its card.</p>${K.expBar(['tsv'], 'regexp', 'the regions', 'data')}</div>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Kind</th><th class="num">From–to</th><th>Name or class</th><th>Accession</th><th>${esc(cap(W.marks))} inside</th><th>Source</th></tr></thead><tbody>` +
      rows.map(([k, s, e, lab, src, cls, ref]) => { const inside = rec.marks.filter(m => m[0] >= s && m[0] <= e).map(m => m[0]); const u = refUrl(ref);
        return `<tr><td>${esc(title(k))}</td><td class="num mono">${s}–${e}</td><td class="wrapok">${esc(lab || labs(k)[cls] || cls || '')}</td><td class="mono">${ref ? (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(ref)}</a>` : esc(ref)) : ''}</td>` +
          `<td class="wrapok">${inside.length ? inside.map(x => `<button class="linkish mono" type="button" data-site-open="${x}">${esc(site(x))}</button>`).join(' ') : '<span class="muted">–</span>'}</td><td class="wrapok muted">${esc((D.unit_sources || [])[src] || '')}</td></tr>`; }).join('') + '</tbody></table></div>';
  }
  function regionsTsv() {
    const p = byAcc[PV.acc], rec = PV.rec, tracks = D.tracks || [];
    return K.preamble(`${p.gene || p.acc}: domains and regions`, `regions of ${p.acc} with the ${W.marks} inside them`) +
      ['kind', 'start', 'end', 'label', 'class', 'ref', `${W.marks}_inside`, 'source'].join('\t') + '\n' +
      rec.units.map(([k, s, e, lab, src, cls, ref]) => [(tracks.find(t => t.kind === k) || {}).title || k, s, e, lab || '', cls || '', ref || '', rec.marks.filter(m => m[0] >= s && m[0] <= e).map(m => site(m[0])).join(' '), (D.unit_sources || [])[src] || ''].join('\t')).join('\n') + '\n';
  }

  // ---- the sequence, with the marks in it, and as FASTA ---------------------------------------------------------
  function fasta(p, rec) {
    const seq = rec.seq || '';
    return `>${p.acc}${rec.entry ? '|' + rec.entry : ''} ${p.name || ''}${p.gene ? ' GN=' + p.gene : ''} [${(D.run.snapshot || {}).release || ''}; ${D.site.name}]\n` + (seq.match(/.{1,60}/g) || []).join('\n') + '\n';
  }
  function sequenceHtml(p, rec, sel) {
    const seq = rec.seq || ''; if (!seq) return `<p class="muted">No sequence in this copy of the site.</p>`;
    const at = new Map(rec.marks.map(m => [m[0], m]));
    const res = i => { const m = at.get(i), aa = esc(seq[i - 1]); if (!m) return `<i data-r="${i}"${K.site.state.residue === i ? ' class="lk-res"' : ''}>${aa}</i>`; const c = K.map.siteColour(m), off = sel && !sel.has(i);
      return `<b class="sq-m${off ? ' faded' : ''}${PV.site === i ? ' on' : ''}" style="--c:${c.c}" data-msite="${i}" tabindex="0" role="button" aria-label="${esc(site(i))}${c.label ? ', ' + esc(c.label) : ''}" title="${esc(site(i))}${c.label ? ' · ' + esc(c.label) : ''}">${aa}</b>`; };
    const lines = [];
    for (let s = 1; s <= seq.length; s += 60) {
      const blocks = []; for (let b = s; b < Math.min(s + 60, seq.length + 1); b += 10) { let t = ''; for (let i = b; i < Math.min(b + 10, seq.length + 1); i++) t += res(i); blocks.push(t); }
      lines.push(`<span class="sq-n">${s}</span>${blocks.join(' ')}`);
    }
    return `<div class="card-head"><p class="sub">${int(seq.length)} residues (${esc((D.run.snapshot || {}).release || '')}), the ${esc(W.marks)} in colour as on the map; hover one for its name, click it for its card.</p>` +
      `<span class="exp"><button class="btn small" type="button" data-fasta="copy">Copy FASTA</button><button class="btn small" type="button" data-fasta="dl">Download FASTA</button></span></div><pre class="seq">${lines.join('\n')}</pre>`;
  }


  // ---- live sources: asked once per protein, shown when they answer, never needed for a number ---------------------
  const today = () => K.hdate(new Date().toISOString());
  const getJson = url => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  function fill(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function proteinAfter(arg) {
    const acc = String(arg).split('/')[0];
    if (!byAcc[acc] && PV.light && !PV.light.started) lightLoad(PV.light.key);
    if (!PV.rec || PV.acc !== acc) return;
    // a link that cleaned a position off (not a mark here), or a search naming one mark of this protein (?q=FUS R216)
    if (PV.cleanArg) { PV.cleanArg = false; S.arg = acc; K.writeHash(false); document.title = K.views.protein.title(S.arg) + ' · ' + D.site.name; }
    if (!PV.qDone && byAcc[acc]) {
      PV.qDone = true;
      const q = S.q && K.sel?.parse ? K.sel.parse(S.q) : null, here = q ? q.sites.filter(([pi]) => pi === byAcc[acc].i) : [];
      if (!PV.site && here.length === 1 && PV.rec.marks.some(m => m[0] === here[0][1])) { PV.site = here[0][1]; S.arg = `${acc}/${PV.site}`; K.writeHash(false); K.render(); return; }
    }
    if (PV.focus) { const f = PV.focus; PV.focus = ''; requestAnimationFrame(() => document.getElementById(f)?.scrollIntoView({ block: 'start' })); }
    if (PV.site && PV.scrolled !== PV.site) { PV.scrolled = PV.site; requestAnimationFrame(() => document.getElementById('site-card')?.scrollIntoView({ block: 'center' })); }
    else if (PV.span && PV.scrolled !== String(PV.span)) {          // the map, just below the sticky toolbar
      PV.scrolled = String(PV.span);
      requestAnimationFrame(() => { const t = document.getElementById('p-map'); if (t) scrollTo(0, t.getBoundingClientRect().top + scrollY - (document.querySelector('.toolbar')?.offsetHeight || 0) - 8); });
    }
    // the function's More/Less only when there is more
    requestAnimationFrame(() => { const t = document.querySelector('.fn-text'), b = document.querySelector('[data-fn-more]'); if (t && b && !PV.fn) b.hidden = t.scrollHeight <= t.clientHeight + 2; });
    drawMap();
    const p = byAcc[acc] || PV.lightP, rec = PV.rec;
    // UniProt, live: other names, the function, the features the map draws, and whether the sequence is still the one
    // these results were computed on
    (PV.uni ||= getJson(`https://rest.uniprot.org/uniprotkb/${acc}.json`).then(j => ({ ok: true, j }), e => ({ ok: false, e })))
      .then(({ ok, j }) => {
        if (PV.acc !== acc) return;
        if (!ok) { PV.uniFailed = true; fill('fn', '<p class="muted">UniProt did not answer. Nothing on this page depends on it.</p>'); drawMap(); return; }
        const first = !PV.uniJson; PV.uniJson = j;
        const names = [...new Set((j.genes || []).flatMap(g => [g.geneName?.value, ...(g.synonyms || []).map(x => x.value), ...(g.orfNames || []).map(x => x.value)]).filter(x => x && x !== p.gene))];
        fill('aliases', names.length ? `Also reported as ${names.map(esc).join(', ')}` : '');
        const texts = (j.comments || []).filter(c => c.commentType === 'FUNCTION').flatMap(c => (c.texts || []).map(t => t.value));
        const linkPm = t => esc(t).replace(/PubMed:(\d+)/g, (m0, id) => `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/">PubMed:${id}</a>`);
        fill('fn', texts.length ? `<p class="fn-text${PV.fn ? ' open' : ''}">${texts.map(linkPm).join(' ')}</p><p class="src">Function, from <a href="https://www.uniprot.org/uniprotkb/${esc(acc)}/entry#function">UniProt ${esc(acc)}</a>, read live · <button type="button" class="linkish" data-fn-more>${PV.fn ? 'Less' : 'More'}</button></p>` : '<p class="muted">UniProt gives no function text for this entry.</p>');
        if (first) { drawMap(); const card = document.getElementById('site-card'); if (card) card.outerHTML = siteCard(p, rec); }
        const live = String(j.sequence?.md5 || '').toUpperCase(), el = document.getElementById('drift');
        if (el && live && rec.md5 && live !== rec.md5.toUpperCase()) {
          el.hidden = false;
          el.innerHTML = `<b>UniProt has changed this sequence</b> since ${esc(D.run.snapshot?.release || 'the release these results use')}. Positions on this page are on that release’s sequence; the live cards below may not line up with them.`;
        }
      });
    // AlphaFold DB: the model's confidence along the map (only if its sequence is the same); the model in 3D is kit-3d.js's
    (PV.afReq ||= {})[acc] ||= getJson(`https://alphafold.ebi.ac.uk/api/prediction/${acc}`).then(async list => {
      const m = Array.isArray(list) ? list[0] : null; if (!m) return { none: true };
      const same = m.sequence === rec.seq;
      let plddt = null;
      if (same && m.plddtDocUrl) { try { const d = await getJson(m.plddtDocUrl); plddt = d.confidenceScore || null; } catch (e) { plddt = null; } }
      return { version: m.latestVersion, mean: m.globalMetricValue, pdbUrl: m.pdbUrl, same, plddt };
    }, () => ({ failed: true }));
    PV.afReq[acc].then(af => {
      if (PV.acc !== acc) return;
      if (af.failed || af.none) { const first = !PV.af; PV.af = af; if (first) drawMap(); }
      if (af.failed || af.none) return;
      const first = !PV.af; PV.af = af; if (first) drawMap();
    });
    K.s3d.after(p, rec);                // the 3D structure (kit-3d.js)
  }
  // ---- interaction partners: the site file turns the card on and names the taxon STRING files the organism under (website.partners); the card is kit-pnet.js's
  const IXP = D.partners || null;
  // website.protein.open_partners: the partners fold opens when the site's own partner table has partners for the protein
  const hasPartners = () => { const t = CC.writer?.partners?.table; return !!(t && PV.tb && K.card.rows(PV.tb, t).length); };
  K.hasData['p-ix'] = hasPartners;
  const partnersOpen = () => !!(D.protein_view?.open_partners && hasPartners());

  // ---- downloads: the map as a figure, the sites and the proteins as tables ------------------------------------------
  const mapFigure = () => K.map.figure(mapCtx());
  // a site's card, opened without leaving the page's place (the card is scrolled into view)
  // a site's card, opened without leaving the page's place, and without a step in the history (opening a protein is one)
  // every way in goes through the channel (kit-link.js), so the map, the sequence, the tables and the 3D follow
  const openSite = (pos, from) => K.site.focus(PV.acc, pos, { from: from || 'table' });
  function showSite(pos) { const y = scrollY; S.arg = `${PV.acc}/${pos}`; K.writeHash(true); K.render(); scrollTo(0, y); document.title = K.views.protein.title(S.arg) + ' · ' + D.site.name; rowIntoView(pos); }
  // the row scrolls inside its own box; the page stays where it is
  function rowIntoView(pos) {
    requestAnimationFrame(() => { const tr = document.querySelector(`tr[data-site="${pos}"]`), box = tr?.closest('.lk-box'); if (!tr || !box) return;
      const a = tr.getBoundingClientRect(), b = box.getBoundingClientRect(), head = box.querySelector('thead')?.offsetHeight || 0;
      if (a.top < b.top + head || a.bottom > b.bottom) box.scrollTop += a.top - b.top - head - (b.height - head - a.height) / 2; });
  }
  // each focus is one step of the history (Back returns to the earlier site, or to the protein); a change of the address itself (Back,
  // a link) is followed by the other views once the page is drawn, without writing it again
  let followed = '';
  K.site.on(e => {
    if (e.kind !== 'focus') return;
    followed = e.acc + '/' + (e.pos ?? '');
    if (e.from === 'history' || e.acc !== PV.acc || !PV.rec) return;
    if (e.pos == null) { if (PV.site != null) { const y = scrollY; S.arg = PV.acc; PV.site = null; K.writeHash(true); K.render(); scrollTo(0, y); document.title = K.views.protein.title(S.arg) + ' · ' + D.site.name; } return; }
    if (e.pos !== PV.site) showSite(e.pos); else rowIntoView(e.pos);
  });
  K.site.on(e => {                                                   // a position that is not a site: the map's crosshair, the sequence
    if (e.kind !== 'residue' || e.acc !== PV.acc) return;
    const x = document.getElementById('map-cross'); if (x) K.map.cross?.(e.pos);
  });
  document.addEventListener('keydown', e => { const tr = e.target.closest?.('tr[data-site]'); if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSite(+tr.dataset.site); } });
  function sitesTsv() {
    const p = byAcc[PV.acc], rec = PV.rec;
    return K.preamble(`${W.marks} of ${p.gene || p.acc} (${p.acc})`, `each ${W.mark} of ${p.gene || p.acc} (${p.name}) with the 15 residues around it and its class in every question; the sequence is ${D.run.snapshot?.release} (MD5 ${rec.md5}).`) +
      ['site', 'position', 'window_15', ...COLS, ...AT, ...(rec.shown?.length ? ['counted'] : [])].join('\t') + '\n' +
      rec.marks.map(m => [site(m[0]), m[0], m[1], ...markClasses(m).map(([aid, v]) => classText(aid, v)), ...(m[3] || []), ...(rec.shown?.length ? ['yes'] : [])].join('\t')).join('\n') + '\n' +
      (rec.shown || []).map(m => [site(m[0]), m[0], m[1], ...COLS.map(() => ''), ...(m[3] || []), 'no'].join('\t')).join('\n') + (rec.shown?.length ? '\n' : '');
  }

  // ---- register with the core -------------------------------------------------------------------------------------
  K.views.proteins = { render: proteinsView, title: () => 'Proteins' };
  // the page's title: the protein, then the site (FUS R216)
  K.views.protein = { render: proteinView, after: proteinAfter, tab: 'proteins',
    title: arg => { const [a, at] = String(arg).split('/'), p = byAcc[a] || (PV.lightP?.acc === a ? PV.lightP : null); return p ? (p.gene || p.acc) + (at && /^\d+$/.test(at) ? ' ' + siteOf(p, +at) : '') : a; } };
  K.tabs.push(() => ['proteins', 'Proteins', K.sel?.active() ? K.sel.nProteins() : P.length]);
  K.clicks.push(
    ['[data-psort]', el => { const k = el.dataset.psort; PS.desc = PS.sort === k ? !PS.desc : k === 'marks' || k === 'len' || k === 'share'; PS.sort = k; K.render(); }],
    ['[data-pmore]', () => { PS.n += 200; K.render(); }],
    ['[data-pexp]', el => K.exportFigure('tsv', null, `${D.site.id}_proteins`, el, proteinsTsv)],
    ['[data-sexp]', el => K.exportFigure('tsv', null, `${D.site.id}_${PV.acc}_sites`, el, sitesTsv)],
    ['[data-mexp]', el => K.exportFigure(el.dataset.mexp, mapFigure, K.map.fileName ? K.map.fileName(el.dataset.mexp) : `${D.site.id}_${PV.acc}_map`, el, sitesTsv)],
    ['[data-msite]', el => openSite(+el.dataset.msite, el.closest('.seq') ? 'sequence' : 'map')],
    ['[data-site-open]', el => openSite(+el.dataset.siteOpen)],
    ['[data-folds]', el => { const on = el.dataset.folds === 'open'; document.querySelectorAll('details.pgroup, details.pfold').forEach(d => { d.open = on; PV.open[d.id] = on; }); }],
    ['[data-all-cols]', () => { PV.allCols = !PV.allCols; PV.open['p-sites'] = true; K.render(); }],
    ['[data-kinds-all]', el => { const k = 'kinds:' + el.dataset.kindsAll; PV.open[k] = !PV.open[k]; PV.open['p-kinds'] = true; K.render(); }],
    ['[data-regexp]', el => K.exportFigure('tsv', null, `${D.site.id}_${PV.acc}_regions`, el, regionsTsv)],
    ['[data-fasta]', el => { const p = byAcc[PV.acc], text = fasta(p, PV.rec);
      if (el.dataset.fasta === 'dl') { K.download(`${p.acc}${p.gene ? '_' + p.gene : ''}.fasta`, text, 'text/plain'); return; }
      const done = t => { const o = el.textContent; el.textContent = t; setTimeout(() => { el.textContent = o; }, 1500); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Copy failed')); else done('Copy failed'); }],
    ['tr[data-site]', (el, e) => { if (!e.target.closest('a, button, summary, input')) openSite(+el.dataset.site); }],
    ['[data-site-close]', () => K.site.focus(PV.acc, null, { from: 'card' })],
    // the readable link to the site, without the reader's selection
    ['[data-site-copy]', el => { const url = location.origin + location.pathname + '#protein/' + K.routes.protein.path(`${PV.acc}/${PV.site}`).split('/').map(encodeURIComponent).join('/');
      navigator.clipboard?.writeText(url).then(() => { el.textContent = 'Link copied'; setTimeout(() => { el.textContent = 'Copy link'; }, 1500); }); }],
    ['[data-site-ev]', () => { PV.evOpen.add(PV.site); PV.open['p-sites'] = true; K.render(); requestAnimationFrame(() => document.querySelector(`tr[data-site="${PV.site}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }],
    ['[data-pfilter]', el => { PV.pf = PV.pf === el.dataset.pfilter ? '' : el.dataset.pfilter; const y = scrollY; K.render(); scrollTo(0, y); }],
    ['[data-hl-open]', el => { const d = document.getElementById(el.dataset.hlOpen); if (d) { d.open = true; PV.open[d.id] = true; const g = d.closest('details.pgroup'); if (g) { g.open = true; PV.open[g.id] = true; } d.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }],
    ['[data-page-pdf]', el => { const p = byAcc[PV.acc]; document.querySelectorAll('details.pgroup, details.pfold').forEach(d => { d.open = true; }); K.pagePdf?.(document.getElementById('view'), `${p.gene || p.acc} (${p.acc})`, `${D.site.id}_${p.gene || p.acc}_${p.acc}.pdf`, el); }],
    ['#site-card [data-cexp]', el => { const card = document.getElementById('site-card'), p = byAcc[PV.acc], name = `${D.site.id}_${p.gene || p.acc}_${site(PV.site)}`;
      if (el.dataset.cexp === 'tsv') K.exportFigure('tsv', null, name, el, siteCardTsv); else if (el.dataset.cexp === 'pdf') K.pagePdf?.(card, `${p.gene || p.acc} ${site(PV.site)}`, name + '.pdf', el); else K.elementPng?.(card, name + '.png', el); }],
    ['[data-light-all]', () => { PV.lightAll = !PV.lightAll; K.render(); }],
    ['[data-rec-tsv]', el => { const p = byAcc[PV.acc], m = PV.rec.marks.find(x => x[0] === +el.dataset.recTsv); if (m) K.exportFigure('tsv', null, `${D.site.id}_${p.gene || p.acc}_${site(m[0])}_records`, el, () => K.card.recordsTsv(cardCtx(p, PV.rec, m))); }],
    ['[data-more-links]', el => { PV.more = !PV.more; document.getElementById('more-menu').hidden = !PV.more; el.setAttribute('aria-expanded', String(PV.more)); }],
    ['[data-fn-more]', () => { PV.fn = !PV.fn; document.querySelector('.fn-text')?.classList.toggle('open', PV.fn); const b = document.querySelector('[data-fn-more]'); if (b) b.textContent = PV.fn ? 'Less' : 'More'; }],
    ['[data-print]', () => {
      // printed in light colours, every section open, with the page's address and how to cite it at the foot
      document.querySelectorAll('details.pgroup, details.pfold').forEach(d => { d.open = true; });
      const theme = document.documentElement.dataset.theme; document.documentElement.dataset.theme = 'light';
      document.body.dataset.printFoot = `${D.site.name} · ${location.href} · printed ${K.hdate(new Date().toISOString())}. ${K.creditLines()[0] || ''}`;
      setTimeout(() => { print(); if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme; }, 150);
    }],
    ['tr[data-acc]', (el, e) => { if (!e.target.closest('a')) K.go('protein', { arg: el.dataset.acc }); }],
  );
  // the row's own buttons come before the row's click (which opens the site's card)
  K.clicks.unshift(['[data-site-3d]', el => { const pos = +(el.dataset.site3d || PV.site); if (typeof K.show3d === 'function') K.show3d(PV.acc, pos); }],
  ['[data-ev-toggle]', el => { const pos = +el.dataset.evToggle; if (PV.evOpen.has(pos)) PV.evOpen.delete(pos); else PV.evOpen.add(pos); const y = scrollY; K.render(); scrollTo(0, y); }]);
  K.tips.push(['[data-hl-tip]', el => el.dataset.hlTip || '']);
  // the attributes the shown marks' tag lists in its hover (website.shown_marks), not listed again
  const tagAttrs = new Set(K.shown?.on ? [...(K.shown.cfg.tests?.attributes || []), ...(K.shown.cfg.also || [])] : []);
  K.tips.push(['[data-msite]', el => {
    const pos = +el.dataset.msite, m = PV.rec?.marks.find(x => x[0] === pos); if (!m) return '';
    const c = K.map.siteColour(m);
    return `<b>${esc(site(pos))}</b>${c.label ? ' · ' + esc(c.label) : ''}<br><span class="win">${winHtml(m[1])}</span><br>` +
      markClasses(m).map(([aid, v]) => `${esc(A[aid]?.title || aid)}: ${esc(classText(aid, v))}`).join('<br>') +
      shownAttrs(m).filter(n => !tagAttrs.has(n)).map(n => `<br><span class="muted">${esc(SPECS[n].label)}:</span> ${attrHtml(m, n, false)}`).join('') +
      (K.shown?.on && K.shown.counted(m) ? `<br><b>${esc(cap(K.shown.label()))}</b>: ${esc(K.shown.tip(m, false))}` : '') +
      '<br><span class="muted">Click for its card</span>';
  }]);
});
