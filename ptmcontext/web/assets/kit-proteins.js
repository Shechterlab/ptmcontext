/* Proteins: the Proteins tab (every protein with a mark, searchable and sortable) and a page per protein: its map
   (domains, disordered regions and the marks, with AlphaFold's confidence once it has loaded), how its marks compare
   with its own other residues, its marks one by one, and live cards from UniProt (function, and a check that the
   sequence has not changed), AlphaFold DB (the model in 3D), PDBe (experimental structures) and STRING (interaction
   partners, if the site file names the organism's taxon). Live sources add to the page; they never change a number. A module of the site kit: it registers with the core (kit.js), which starts it. */
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
    return `<div class="page-head"><h2>Proteins</h2>${K.expBar(['tsv'], 'pexp', 'the protein list')}</div>` +
      `<p class="page-sub">Every protein with at least one ${esc(W.mark)}${K.sel?.active() ? ' in your selection' : ''}. Search above by gene, accession or name (a list of genes works too), or filter. A row opens the protein.</p>` +
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

  // ---- a protein's page: as the Methylarginine Site Explorer's ------------------------------------------------------
  const PV = { acc: '', rec: null, err: '', af: null, uni: null, uniJson: null, pdb: null, pdbAll: false, ix: null, site: null, more: false, fn: false, open: {}, scrolled: null };
  document.addEventListener('toggle', e => { const d = e.target; if (d.classList?.contains('pfold')) PV.open[d.id] = d.open; }, true);
  document.addEventListener('click', e => { if (PV.more && !e.target.closest('.more-links')) { PV.more = false; const m = document.getElementById('more-menu'); if (m) m.hidden = true; } });
  const SPECS = D.attribute_specs || {}, AT = D.mark_attributes || [];
  function load(acc) {
    if (PV.acc === acc) return;
    Object.assign(PV, { acc, rec: null, err: '', af: null, uni: null, uniJson: null, pdb: null, pdbAll: false, ix: null, more: false, fn: false, open: {}, scrolled: null });
    IXS.all = false; K.map?.reset();
    loadProtein(acc).then(r => { if (PV.acc === acc) { PV.rec = r; K.render(); } },
      () => { if (PV.acc === acc) { PV.err = location.protocol === 'file:' ? 'This copy of the site cannot read the protein files from disk. Open the hosted site, or index.html through a local web server.' : 'The protein’s file could not be read.'; K.render(); } });
  }
  const AF_BINS = [[90, '#0053d6', 'very high (pLDDT > 90)'], [70, '#65cbf3', 'confident (70–90)'], [50, '#ffdb13', 'low (50–70)'], [0, '#ff7d45', 'very low (< 50)']];
  const afColour = v => AF_BINS.find(([t]) => v > t || t === 0)[1];
  const mapCtx = () => ({ p: byAcc[PV.acc], rec: PV.rec, uni: PV.uniJson, uniFailed: PV.uniFailed, af: PV.af && !PV.af.failed && !PV.af.none ? PV.af : null, afFailed: PV.af?.failed, afNone: PV.af?.none,
    selected: K.sel?.active() ? K.sel.selectedPositions(PV.acc) : null, site: PV.site });
  function drawMap() { const el = document.getElementById('pmap'); if (el && PV.rec) K.map.render(el, mapCtx()); }
  const site = pos => `${(PV.rec?.seq || '')[pos - 1] || D.residues?.[0] || ''}${pos}`;
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
  const attrVal = (m, name) => m[3]?.[AT.indexOf(name)] ?? '';
  function attrHtml(m, name, full) {
    const s = SPECS[name], v = attrVal(m, name); if (!s) return esc(v);
    if (s.kind === 'list') {
      const sep = s.separator || '; ', vals = v ? v.split(sep) : [], ids = s.link ? attrVal(m, name + '.link').split(sep) : [];
      return K.sel.listHtml(name, vals, ids, PV.acc, full);
    }
    return esc(K.sel?.valueLabel ? K.sel.valueLabel(name, v) : v);
  }
  // what a site card or tip lists: the attributes a site has a value for (a coloured one always), and not a yes/no
  // attribute whose column another attribute shows in full (the changes rather than "changed")
  const detailOf = n => Object.keys(SPECS).some(o => o !== n && SPECS[o].column === SPECS[n].column && !SPECS[o].present);
  const shownAttrs = m => Object.keys(SPECS).filter(n => !(SPECS[n].present && detailOf(n)) && (attrVal(m, n) !== '' || SPECS[n].colour));
  const pillOf = (m, k) => `<span class="state-pill" style="--c:${K.map.attrColour(k, attrVal(m, k))};--t:${K.map.textOn(K.map.attrColour(k, attrVal(m, k)))}" title="${esc(SPECS[k].label)}">${esc(K.sel?.valueLabel ? K.sel.valueLabel(k, attrVal(m, k)) : attrVal(m, k))}</span>`;
  const statePill = m => { const k = Object.keys(SPECS).find(n => SPECS[n].colour && SPECS[n].kind === 'category'); return k ? pillOf(m, k) : ''; };
  function scoreRows(p, rec) {
    return D.analyses.filter(a => rec.counts[a.id]).map(a => {
      const rows = rec.counts[a.id].filter(r => r[1] > 0).sort((x, y) => y[1] - x[1]), [mt, ot] = rec.totals[a.id] || [0, 0];
      const ans = rows.slice(0, 2).map(([c, mi, oi]) => `${esc(label(a.id, c))}: <span class="an">${int(mi)} of ${int(mt)} (${pct(mi, mt)}) vs ${int(oi)} of ${int(ot)} other ${esc(W.residues)} (${pct(oi, ot)})</span>`).join('; ') || '<span class="muted">none</span>';
      const all = rec.counts[a.id].slice().sort((x, y) => y[1] - x[1] || y[2] - x[2]);
      return `<details class="score small"><summary><span class="pm" aria-hidden="true"></span><span class="tq"><span class="t">${esc(a.title)}</span></span><span class="ans">${ans}</span><span class="go" aria-hidden="true"></span></summary>` +
        `<div class="card-body"><div class="tbl-card"><table class="tbl"><thead><tr><th>Class</th><th class="num">${esc(cap(W.marks))} here</th><th class="num">Other ${esc(W.residues)} here</th></tr></thead><tbody>` +
        all.map(([c, mi, oi]) => `<tr><td title="${esc(help(a.id, c))}">${esc(label(a.id, c))}</td><td class="num">${int(mi)} of ${int(mt)} (${pct(mi, mt)})</td><td class="num">${int(oi)} of ${int(ot)} (${pct(oi, ot)})</td></tr>`).join('') +
        `</tbody></table></div></div></details>`;
    }).join('');
  }
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
  // the site card: one mark, everything the site knows about it, each source linked
  function siteCard(p, rec) {
    const m = rec.marks.find(x => x[0] === PV.site); if (!m) return '';
    const attrs = shownAttrs(m).map(n => `<dt title="${esc(SPECS[n].help || '')}">${esc(SPECS[n].label)}</dt><dd>${attrHtml(m, n, true)}</dd>`).join('');
    const uniAt = (PV.uniJson?.features || []).filter(f => (f.location?.start?.value === m[0] && f.location?.end?.value === m[0]) && ['Modified residue', 'Natural variant', 'Mutagenesis', 'Cross-link'].includes(f.type));
    const pm = f => [...new Set((f.evidences || []).filter(e => e.source === 'PubMed').map(e => e.id))];
    const others = rec.marks.filter(x => x[0] !== m[0]).map(x => x[0]), near = others.length ? others.reduce((b, x) => (Math.abs(x - m[0]) < Math.abs(b - m[0]) ? x : b)) : null;
    const pl = PV.af?.plddt && PV.af.plddt.length === p.len ? PV.af.plddt[m[0] - 1] : null;
    const featLine = f => {
      const alt = f.alternativeSequence ? `${f.alternativeSequence.originalSequence || ''}${m[0]}${(f.alternativeSequence.alternativeSequences || []).join('/')}` : '';
      const snp = [...new Set((f.featureCrossReferences || []).filter(x => x.database === 'dbSNP').map(x => x.id))];
      const desc = String(f.description || '').replace(/;?\s*dbSNP:rs\d+/g, '').trim();
      return `${esc(f.type)}${alt ? ' <b>' + esc(alt) + '</b>' : ''}${desc ? ': ' + esc(desc) : ''}${snp.length ? ' · ' + snp.map(id => `<a href="https://www.ncbi.nlm.nih.gov/snp/${esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`).join(', ') : ''}${f.featureId ? ` · <a href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}/entry#disease_variants" target="_blank" rel="noopener">${esc(f.featureId)}</a>` : ''}${pm(f).length ? ' (PubMed ' + pm(f).slice(0, 8).map(id => `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(id)}/" target="_blank" rel="noopener">${esc(id)}</a>`).join(', ') + ')' : ''}`;
    };
    return `<section class="site-card" id="site-card"><div class="card-head"><div><p class="eyebrow">Selected ${esc(W.mark)}</p><h3>${esc(p.gene || p.acc)} ${esc(site(m[0]))} ${statePill(m)}</h3></div>` +
      `<span class="tools"><button type="button" class="btn small" data-site-copy>Copy link</button><button type="button" class="btn small" data-site-close aria-label="Close">×</button></span></div>` +
      `<dl class="deflist"><dt>Window ±7</dt><dd class="mono">${winHtml(m[1])}</dd>` +
      markClasses(m).map(([aid, v]) => `<dt>${esc(A[aid]?.title || aid)}</dt><dd title="${esc(help(aid, v))}">${esc(classText(aid, v))}</dd>`).join('') + attrs +
      (near != null ? `<dt>Nearest other ${esc(W.mark)}</dt><dd>${esc(site(near))}, ${int(Math.abs(near - m[0]))} aa away</dd>` : '') +
      (pl != null ? `<dt>AlphaFold confidence</dt><dd>pLDDT ${Number(pl).toFixed(1)} <span class="muted">(model v${esc(PV.af.version)})</span></dd>` : '') +
      `<dt>UniProt at ${esc(site(m[0]))}</dt><dd>${PV.uniJson ? (uniAt.length ? uniAt.map(featLine).join('<br>') : '<span class="muted">no feature at this residue</span>') + ` <span class="muted">· <a href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}/entry#ptm_processing">UniProt ${esc(p.acc)}</a>, read live</span>` : '<span class="muted">asking UniProt…</span>'}</dd></dl></section>`;
  }
  function proteinView(arg) {
    const [acc, sitePos] = String(arg).split('/');
    const p = byAcc[acc];
    if (!p) return `<p class="empty">No ${esc(W.marks)} on ${esc(acc)} in this site. <a href="${esc(K.link('proteins'))}">All proteins</a></p>`;
    load(acc); PV.site = sitePos ? +sitePos : null;
    if (PV.rec && PV.site && !PV.rec.marks.some(m => m[0] === PV.site)) PV.site = null;
    const selTxt = K.sel?.active() ? `${int(K.sel.nMarks())} ${esc(W.marks)} · selection` : `all ${esc(W.marks)}`;
    const head = `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <a href="${esc(K.link('proteins'))}">Proteins</a> <span class="muted">(${selTxt})</span> › <b>${esc(p.gene || p.acc)}</b>${PV.site ? ` › ${esc(PV.rec ? site(PV.site) : PV.site)}` : ''}</p>` +
      `<div class="prot-head"><h2>${esc(p.gene || p.acc)} <small>${esc(p.name)}</small></h2>` +
      `<p class="aliases" id="aliases"></p><div class="fn" id="fn"><p class="muted">Asking UniProt for its function…</p></div>` +
      `<div class="prot-chips"><span class="chip mono">${esc(p.acc)}</span>${PV.rec?.entry ? `<span class="chip mono">${esc(PV.rec.entry)}</span>` : ''}<a class="btn small" href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}" target="_blank" rel="noopener">UniProt ↗</a>` +
      `<span class="more-links"><button type="button" class="btn small" data-more-links aria-expanded="${PV.more}">More links ▾</button><span class="menu" id="more-menu"${PV.more ? '' : ' hidden'}>${LINKS(p.acc).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join('')}</span></span>` +
      `<button type="button" class="btn small" data-print>Print</button></div></div><div id="drift" class="drift" hidden></div>`;
    if (!PV.rec) return head + `<p class="empty">${PV.err ? esc(PV.err) : 'Loading…'}</p>`;
    const rec = PV.rec, sel = K.sel?.active() ? K.sel.selectedPositions(acc) : null;
    // the facts a site file asks for (website.protein.facts): how many of the protein's marks are in some classes of a
    // question, e.g. in disordered regions
    const factOf = f => {
      // a protein-set question: the sets this protein is in (its disease families, say)
      if (A[f.analysis]?.kind === 'protein_sets') {
        const sd = K.sel?.data(), ps = sd?.protein_sets?.[f.analysis]; if (!ps) return null;
        const names = ps.sets.map(([s]) => s).filter(s => K.sel.setHas(f.analysis, s, p.i)), lab = s => (A[f.analysis].labels || {})[s] || s;
        return [int(names.length), f.label || A[f.analysis].title, names.map(lab).join('; ')];
      }
      const k = COLS.indexOf(f.analysis); if (k < 0) return null; const want = new Set(f.classes || []);
      const n = rec.marks.filter(m => String(m[2][k] || '').split(';').some(c => want.has(c))).length;
      return [`${int(n)} of ${int(rec.marks.length)}`, f.label || `in: ${(f.classes || []).map(c => label(f.analysis, c)).join(', ')}`]; };
    const listAttr = Object.keys(SPECS).find(n => SPECS[n].kind === 'list' && SPECS[n].link);
    const nSrc = listAttr ? new Set(rec.marks.flatMap(m => (attrVal(m, listAttr) || '').split(SPECS[listAttr].separator || '; ').filter(Boolean))).size : null;
    const facts = [[int(rec.marks.length), cap(rec.marks.length === 1 ? W.mark : W.marks)], [int(p.cand), `${cap(W.residues)} (${pct(p.marks, p.cand)} ${W.marked})`],
      ...(D.protein_view?.facts || []).map(factOf).filter(Boolean),
      ...(nSrc != null ? [[int(nSrc), `${SPECS[listAttr].label} reporting ${rec.marks.length === 1 ? 'it' : 'them'}`]] : [])];
    const fold = (id, title, sum, body, open) => `<details class="pfold" id="${id}"${(PV.open[id] ?? open) ? ' open' : ''}><summary><span class="pfm" aria-hidden="true"></span><h3>${title}</h3><span class="fsum">${sum}</span></summary><div class="pfold-body">${body}</div></details>`;
    return head +
      `<div class="facts">${facts.map(([b, t, more]) => `<div class="fact"><b>${b}</b><span>${esc(t)}</span>${more ? `<small class="fact-more" title="${esc(more)}">${esc(more)}</small>` : ''}</div>`).join('')}</div>` +
      (sel && sel.size < rec.marks.length ? `<p class="note">${int(sel.size)} of ${int(rec.marks.length)} ${esc(W.marks)} match your selection; the others are faded. <button class="linkish" type="button" data-sel-clear-all>Clear filters</button></p>` : '') +
      fold('p-map', 'Protein map', `${int(rec.marks.length)} ${esc(rec.marks.length === 1 ? W.mark : W.marks)} on ${int(p.len)} aa`, `<div class="card-head"><p class="sub">The ${esc(W.marks)} over the protein, and rows from the site’s data and live sources. Hover anything for what it is and where it comes from; click it to pin it with its links.</p>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'mexp', 'the map')}</div><div id="pmap" class="pmap"></div>${siteCard(p, rec)}`, true) +
      fold('p-sites', `${esc(cap(W.marks))}`, `${int(rec.marks.length)}${Object.values(SPECS).some(x => x.kind === 'list' && x.link) ? `, each with the ${esc(Object.values(SPECS).find(x => x.kind === 'list' && x.link).label.toLowerCase())} that report it` : ''}`, `<div class="card-head"><p class="sub">Each ${esc(W.mark)} with the 15 residues around it, its attributes and its class in every question. A row opens its card.</p>${K.expBar(['tsv'], 'sexp', 'the sites')}</div>` +
        `<p class="cols-note muted">${PV.allCols ? 'Every question’s class.' : `The questions the site shows by default; ${int(COLS.length - shownCols().length)} more.`} <button type="button" class="linkish" data-all-cols>${PV.allCols ? 'Fewer columns' : 'Every question'}</button></p>` +
        `<div class="tbl-card"><table class="tbl stbl"><thead><tr><th>Site</th>${Object.keys(SPECS).filter(n => SPECS[n].colour || (SPECS[n].kind === 'list' && SPECS[n].link)).map(n => `<th>${esc(SPECS[n].label)}</th>`).join('')}<th>Window (±7)</th>${shownCols().map(aid => `<th>${esc(A[aid]?.title || aid)}</th>`).join('')}</tr></thead><tbody>` +
        rec.marks.map(m => `<tr data-site="${m[0]}" tabindex="0" class="${sel && !sel.has(m[0]) ? 'faded' : ''}${PV.site === m[0] ? ' on' : ''}"><td class="mono"><b>${esc(site(m[0]))}</b></td>${Object.keys(SPECS).filter(n => SPECS[n].colour || (SPECS[n].kind === 'list' && SPECS[n].link)).map(n => `<td class="wrapok">${SPECS[n].colour && SPECS[n].kind === 'category' ? pillOf(m, n) : attrHtml(m, n, false)}</td>`).join('')}<td class="mono">${winHtml(m[1])}</td>${markClasses(m).filter(([aid]) => shownCols().includes(aid)).map(([aid, v]) => `<td class="wrapok" title="${esc(help(aid, v))}">${esc(classText(aid, v))}</td>`).join('')}</tr>`).join('') +
        `</tbody></table></div>`, true) +
      fold('p-score', `Its ${esc(W.marks)}, against its other ${esc(W.residues)}`, 'counted in this protein', `<p class="sub">The classes its ${esc(W.marks)} fall in, and how often its other ${esc(W.residues)} do. A row opens every class.</p><div class="hub">${scoreRows(p, rec)}</div>`, false) +
      (D.analyses.some(a => a.kind === 'protein_sets') ? fold('p-kinds', 'Kinds of protein', 'its classes, pathways and locations, with the site’s result for each', kindsHtml(p), false) : '') +
      fold('p-regions', 'Domains and regions', `${int(rec.units.length)} region${rec.units.length === 1 ? '' : 's'} the site’s questions read`, regionsHtml(p, rec), false) +
      fold('p-seq', 'Sequence', `${int((rec.seq || '').length)} aa, and as FASTA`, sequenceHtml(p, rec, sel), false) +
      fold('p-struct', 'Structure', 'AlphaFold DB and PDBe, live', `<div class="live-grid"><section><h4>Predicted structure <small class="muted">AlphaFold DB, live</small></h4><div id="live-af" class="live"><p class="muted">Asking AlphaFold DB…</p></div><div id="af3d" class="af3d" hidden></div></section>` +
        `<section><h4>Experimental structures <small class="muted">PDBe, live</small></h4><div id="live-pdb" class="live"><p class="muted">Asking PDBe…</p></div></section></div>`, false) +
      (IXP ? fold('p-ix', 'Interaction partners', 'STRING, live', `<div class="card-head"><p class="sub">The proteins STRING associates with ${esc(p.gene || p.acc)}, best first, and which of them have ${esc(W.marks)} in this site.</p>${K.expBar(['tsv'], 'ixexp', 'the partners')}</div><div id="live-ix" class="live"><p class="muted">Asking STRING…</p></div>`, false) : '');
  }
  K.sections.protein = () => { const p = byAcc[PV.acc]; return [['view', p ? `${p.gene || p.acc}: ${p.name || ''}` : 'This protein', 1], ...(PV.site ? [['site-card', `The ${W.mark} ${site(PV.site)}`, 1]] : []),
    ['g-marks', `Its ${W.marks}`, 0], ['p-map', 'Protein map', 1], ['p-sites', cap(W.marks), 1], ['p-score', `Against its other ${W.residues}`, 1],
    ['g-protein', 'The protein', 0], ...(D.analyses.some(a => a.kind === 'protein_sets') ? [['p-kinds', 'Kinds of protein', 1]] : []), ['p-regions', 'Domains and regions', 1], ['p-seq', 'Sequence', 1],
    ['g-live', 'Live sources', 0], ['p-struct', 'Structure', 1], ...(IXP ? [['p-ix', 'Interaction partners', 1]] : [])]; };
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
    const blocks = D.analyses.filter(a => a.kind === 'protein_sets' && sd.protein_sets?.[a.id]).map(a => {
      const ps = sd.protein_sets[a.id];
      if (ps.covariate && !cov && ps.covariate.proteins[p.i]) cov = { ...ps.covariate, me: ps.covariate.proteins[p.i], from: a };
      const mine = ps.sets.filter(([s]) => K.sel.setHas(a.id, s, p.i)).map(([s]) => ({ s, r: setRow(a.id, s, 'enricher') })).filter(x => x.r)
        .sort((x, y) => RANK[x.r.dir] - RANK[y.r.dir] || x.r.q - y.r.q);
      if (!mine.length) return `<div class="kind"><h4>${esc(a.title)}</h4><p class="muted">In none of its tested sets.</p></div>`;
      const shown = PV.open['kinds:' + a.id] ? mine : mine.slice(0, 10);
      return `<div class="kind"><h4>${esc(a.title)} <span class="muted">${int(mine.length)} set${mine.length === 1 ? '' : 's'}</span></h4><ul class="kind-list">` +
        shown.map(({ s, r }) => { const hs = K.holdStatus(r), nh = hs === 'lost' || hs === 'weaker'; return `<li><button class="linkish" type="button" data-f="p:${esc(a.id)}" data-v="${esc(s)}" title="Select the ${esc(W.marks)} on proteins in this set">${esc(r.label)}</button> <span class="val ${r.dir}">${esc(K.effText(r))}</span> <span class="muted">q ${K.fq(r.q)}</span>${nh ? ` <span class="nh" title="${hs === 'lost' ? 'Lost within abundance deciles' : 'The same direction within abundance deciles, but not significant there'}">${hs === 'lost' ? '○' : '◌'}</span>` : ''}</li>`; }).join('') + '</ul>' +
        (mine.length > 10 ? `<button class="linkish" type="button" data-kinds-all="${esc(a.id)}">${PV.open['kinds:' + a.id] ? 'Fewer' : `All ${int(mine.length)}`}</button>` : '') + '</div>';
    }).join('');
    const covLine = cov ? `<p class="kind-cov"><b>Abundance</b>: ${cov.me[0] == null ? 'no value' : `${esc(cov.value)} ${K.fxn(cov.me[0])}`}${cov.me[1] !== 'none' ? `, decile ${esc(cov.me[1])} of ${int(cov.strata)}` : ''} <span class="muted">(${esc((Object.values(D.inputs).find(x => (x.roles || [x.role]).includes(cov.input)) || {}).version || cov.input)}; the decile the protein-set tests stratify by)</span></p>` : '';
    return covLine + `<div class="kinds">${blocks}</div><p class="note">Each set’s result is the site’s own (all ${esc(W.marked)} proteins against the background), not this protein’s. A set’s name selects the ${esc(W.marks)} on its proteins.</p>`;
  }

  // ---- domains and regions: every region the site's questions read, as a table, with the marks inside each --------
  function regionsHtml(p, rec) {
    const tracks = D.tracks || [], title = k => (tracks.find(t => t.kind === k) || {}).title || k;
    const labs = k => { const t = tracks.find(x => x.kind === k); return (A[t?.analysis] || {}).labels || {}; };
    const refUrl = ref => { const r = (D.ref_links || []).find(x => ref && new RegExp(x.pattern).test(ref)); return r ? r.url.replace('{ref}', encodeURIComponent(ref)) : null; };
    const rows = rec.units.slice().sort((x, y) => tracks.findIndex(t => t.kind === x[0]) - tracks.findIndex(t => t.kind === y[0]) || x[1] - y[1]);
    if (!rows.length) return `<p class="muted">The site’s questions place no region on this protein.</p>`;
    return `<div class="card-head"><p class="sub">Each region the site’s questions read, with the ${esc(W.marks)} inside it; a ${esc(W.mark)} opens its card.</p>${K.expBar(['tsv'], 'regexp', 'the regions')}</div>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Kind</th><th class="num">From–to</th><th>Name or class</th><th>Accession</th><th>${esc(cap(W.marks))} inside</th><th>Source</th></tr></thead><tbody>` +
      rows.map(([k, s, e, lab, src, cls, ref]) => { const inside = rec.marks.filter(m => m[0] >= s && m[0] <= e).map(m => m[0]); const u = refUrl(ref);
        return `<tr><td>${esc(title(k))}</td><td class="num mono">${s}–${e}</td><td class="wrapok">${esc(lab || labs(k)[cls] || cls || '')}</td><td class="mono">${ref ? (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(ref)}</a>` : esc(ref)) : ''}</td>` +
          `<td class="wrapok">${inside.length ? inside.map(x => `<button class="linkish mono" type="button" data-site-open="${x}">${esc(site(x))}</button>`).join(' ') : '<span class="muted">–</span>'}</td><td class="wrapok muted">${esc((D.unit_sources || [])[src] || '')}</td></tr>`; }).join('') + '</tbody></table></div>';
  }
  function regionsTsv() {
    const p = byAcc[PV.acc], rec = PV.rec, tracks = D.tracks || [];
    return K.preamble(`${p.gene || p.acc}: domains and regions`, `every region the site's questions read on ${p.acc}, with the ${W.marks} inside it`) +
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
    const res = i => { const m = at.get(i), aa = esc(seq[i - 1]); if (!m) return aa; const c = K.map.siteColour(m), off = sel && !sel.has(i);
      return `<b class="sq-m${off ? ' faded' : ''}" style="--c:${c.c}" data-msite="${i}" title="${esc(site(i))}${c.label ? ' · ' + esc(c.label) : ''}">${aa}</b>`; };
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
    if (!PV.rec || PV.acc !== acc) return;
    if (PV.site && PV.scrolled !== PV.site) { PV.scrolled = PV.site; requestAnimationFrame(() => document.getElementById('site-card')?.scrollIntoView({ block: 'center' })); }
    // the function's More/Less only when there is more
    requestAnimationFrame(() => { const t = document.querySelector('.fn-text'), b = document.querySelector('[data-fn-more]'); if (t && b && !PV.fn) b.hidden = t.scrollHeight <= t.clientHeight + 2; });
    drawMap();
    const p = byAcc[acc], rec = PV.rec;
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
    // AlphaFold DB: the model, its confidence along the map (only if its sequence is the same), and 3D on request
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
      if (af.failed) { fill('live-af', '<p class="muted">AlphaFold DB did not answer. Nothing on this page depends on it.</p>'); return; }
      if (af.none) { fill('live-af', '<p class="muted">AlphaFold DB has no model of this protein.</p>'); return; }
      const first = !PV.af; PV.af = af; if (first) drawMap();
      fill('live-af', `<p>Model v${esc(af.version)}, mean confidence (pLDDT) ${esc(Number(af.mean).toFixed(1))}.${af.same ? ' Its confidence is drawn under the map.' : ' <b>Its sequence differs from the one these results use</b>, so its confidence is not drawn on the map.'}</p>` +
        `<p><button class="btn" type="button" id="af-3d-btn">Show the model in 3D</button> <a href="https://alphafold.ebi.ac.uk/entry/${esc(acc)}">Open in AlphaFold DB</a></p>` +
        `<p class="src">AlphaFold DB (Varadi et al., Nucleic Acids Res 52:D368 (2024), doi:10.1093/nar/gkad1011), retrieved ${esc(today())}. The ${esc(W.marks)} are drawn as spheres.</p>`);
    });
    // PDBe: the experimental structures, best first, and which of the marks each covers
    (PV.pdbReq ||= {})[acc] ||= getJson(`https://www.ebi.ac.uk/pdbe/api/mappings/best_structures/${acc}`).then(j => j[acc] || [], e => (String(e.message) === '404' ? [] : null));
    PV.pdbReq[acc].then(list => {
      if (PV.acc !== acc) return;
      if (list === null) { fill('live-pdb', '<p class="muted">PDBe did not answer. Nothing on this page depends on it.</p>'); return; }
      if (!list.length) { fill('live-pdb', '<p class="muted">No experimental structure of this protein in the PDB.</p>'); return; }
      PV.pdb = list; drawPdb();
    });
    drawIx();
  }
  function drawPdb() {
    const rec = PV.rec; if (!PV.pdb || !rec) return;
    // one row per entry, best mapping first (PDBe's order), with every chain of the protein in it
    const byEntry = new Map();
    PV.pdb.forEach(e => { const k = String(e.pdb_id); if (!byEntry.has(k)) byEntry.set(k, { ...e, chains: [] }); const x = byEntry.get(k); if (!x.chains.includes(e.chain_id)) x.chains.push(e.chain_id); });
    const list = [...byEntry.values()].map(e => ({ ...e, chain_id: e.chains.join(', ') }));
    const shown = PV.pdbAll ? list : list.slice(0, 10);
    const covered = e => rec.marks.filter(([pos]) => pos >= e.unp_start && pos <= e.unp_end).length;
    fill('live-pdb', `<div class="tbl-card"><table class="tbl"><thead><tr><th>Entry</th><th>Method</th><th class="num">Resolution</th><th>Chains</th><th class="num">Residues</th><th class="num">${esc(cap(W.marks))} in the construct</th></tr></thead><tbody>` +
      shown.map(e => `<tr><td class="mono"><a href="https://www.rcsb.org/structure/${esc(e.pdb_id)}">${esc(String(e.pdb_id).toUpperCase())}</a></td><td>${esc(e.experimental_method || '')}</td>` +
        `<td class="num">${e.resolution != null ? esc(Number(e.resolution).toFixed(1)) + ' Å' : '–'}</td><td>${esc(e.chain_id || '')}</td><td class="num">${int(e.unp_start)}–${int(e.unp_end)}</td><td class="num">${int(covered(e))} of ${int(rec.marks.length)}</td></tr>`).join('') +
      `</tbody></table></div>` + (list.length > 10 ? `<p><button class="linkish" type="button" data-pdb-all>${PV.pdbAll ? 'Show the best 10' : 'Show all ' + int(list.length) + ' entries'}</button></p>` : '') +
      `<p class="src">PDBe best structures (SIFTS), retrieved ${esc(today())}; residues are UniProt positions.</p>`);
  }
  // ---- interaction partners: live from STRING, matched to this site's proteins by gene name ------------------------
  // The site file turns the card on and names the taxon STRING files the organism under (website.partners).
  const IXP = D.partners || null;
  const IXS = { net: IXP?.network || 'physical', min: Math.round((IXP?.min_score ?? 0.7) * 1000), only: false, all: false };
  const STRING_API = 'https://string-db.org/api/json/', STRING_CALLER = 'ptmcontext';
  const STRING_CITE = 'Szklarczyk et al., Nucleic Acids Res 53:D730 (2025), doi:10.1093/nar/gkae1113';
  const IX_SCORES = [[400, '≥ 0.4'], [700, '≥ 0.7'], [900, '≥ 0.9']];
  // STRING's evidence channels: API field, name. The physical network scores the first three only.
  const IX_CHANNELS = [['escore', 'experiments'], ['dscore', 'databases'], ['tscore', 'text mining'], ['ascore', 'co-expression'], ['nscore', 'neighbourhood'], ['fscore', 'gene fusion'], ['pscore', 'co-occurrence']];
  let geneIndex = null, stringVersion = null;
  const byGene = g => {
    if (!geneIndex) { geneIndex = new Map(); P.forEach(p => String(p.gene || '').split(/[\s;]+/).filter(Boolean).forEach(x => { if (!geneIndex.has(x.toUpperCase())) geneIndex.set(x.toUpperCase(), p); })); }
    return geneIndex.get(String(g || '').toUpperCase());
  };
  function ixAsk(acc) {
    const key = `${acc}:${IXS.net}:${IXS.min}`;
    stringVersion ||= getJson(STRING_API + 'version').then(j => (j && j[0] && j[0].string_version) || '', () => '');
    (PV.ixReq ||= {})[key] ||= fetch(STRING_API + 'interaction_partners', {
      method: 'POST',
      body: new URLSearchParams({ identifiers: acc, species: String(IXP.species), network_type: IXS.net, required_score: String(IXS.min), limit: '2000', caller_identity: STRING_CALLER }),
    }).then(r => (r.ok ? r.json() : r.status === 404 ? { unknown: true } : Promise.reject(new Error(String(r.status))))).catch(() => null);
    return Promise.all([PV.ixReq[key], stringVersion]);
  }
  const ixDesc = () => `STRING${PV.ix?.ver ? ' v' + PV.ix.ver : ''} ${IXS.net} network, score ${(IXS.min / 1000).toFixed(1)} or more`;
  const evidence = e => IX_CHANNELS.filter(([f]) => +e[f] > 0).sort(([a], [b]) => e[b] - e[a]).map(([f, n]) => `${n} ${Number(e[f]).toFixed(2)}`).join(', ');
  function drawIx() {
    const acc = PV.acc; if (!IXP || !PV.rec || !document.getElementById('live-ix')) return;
    const seg = (key, opts) => `<span class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-ix-${key}="${v}" aria-pressed="${String(IXS[key]) === String(v)}">${esc(l)}</button>`).join('')}</span>`;
    const controls = `<div class="ix-opts">${seg('net', [['physical', 'Physical'], ['functional', 'Functional']])} ${seg('min', IX_SCORES)} ${seg('only', [['false', 'All partners'], ['true', `With ${W.marks} here`]])}</div>`;
    fill('live-ix', controls + '<p class="muted">Asking STRING…</p>');
    ixAsk(acc).then(([rows, ver]) => {
      if (PV.acc !== acc || !document.getElementById('live-ix')) return;
      if (rows === null) { fill('live-ix', controls + '<p class="muted">STRING did not answer. Nothing on this page depends on it.</p>'); return; }
      if (rows.unknown) { fill('live-ix', `<p class="muted">STRING has no entry for ${esc(acc)} (taxon ${esc(IXP.species)}).</p>`); return; }
      const best = new Map();                                     // one row per partner, its best score
      rows.forEach(e => { if (e.stringId_B !== e.stringId_A && (!best.has(e.stringId_B) || best.get(e.stringId_B).score < e.score)) best.set(e.stringId_B, e); });
      const list = [...best.values()].map(e => ({ ...e, here: byGene(e.preferredName_B) }))
        .sort((x, y) => y.score - x.score || String(x.preferredName_B).localeCompare(String(y.preferredName_B)));
      PV.ix = { list, ver, self: rows[0]?.stringId_A || '' };
      const withMarks = list.filter(x => x.here), shownAll = IXS.only ? withMarks : list, shown = IXS.all ? shownAll : shownAll.slice(0, 15);
      const head = list.length
        ? `<p>${int(list.length)} ${esc(IXS.net)} partner${list.length === 1 ? '' : 's'} at score ${(IXS.min / 1000).toFixed(1)} or more; <b>${int(withMarks.length)}</b> of them ${withMarks.length === 1 ? 'has' : 'have'} ${esc(W.marks)} in this site.</p>`
        : `<p class="muted">STRING lists no ${esc(IXS.net)} partner at score ${(IXS.min / 1000).toFixed(1)} or more.</p>`;
      const table = shown.length ? `<div class="tbl-card"><table class="tbl"><thead><tr><th>Partner</th><th class="num">Score</th><th>Evidence</th><th class="num">${esc(cap(W.marks))} here</th></tr></thead><tbody>` +
        shown.map(x => `<tr><td>${x.here ? `<a href="${esc(K.link('protein', x.here.acc))}"><b>${esc(x.preferredName_B)}</b></a>` : `<span title="${esc(x.stringId_B)}">${esc(x.preferredName_B)}</span>`}</td>` +
          `<td class="num">${Number(x.score).toFixed(3)}</td><td class="wrapok">${esc(evidence(x))}</td><td class="num">${x.here ? int(x.here.marks) : '–'}</td></tr>`).join('') + '</tbody></table></div>' : '';
      const more = shownAll.length > 15 ? `<p><button class="linkish" type="button" data-ix-all>${IXS.all ? 'Show the best 15' : 'Show all ' + int(shownAll.length)}</button></p>` : '';
      fill('live-ix', controls + head + table + more +
        `<p><button class="linkish" type="button" data-ix-string>Open this network in STRING</button></p>` +
        `<p class="src">${esc(ixDesc())} (${esc(STRING_CITE)}), retrieved ${esc(today())}. Partners are matched to this site’s proteins by gene name. A STRING association is to the whole protein: it does not show that a partner binds or modifies a ${esc(W.mark)}.</p>`);
    });
  }
  function ixTsv() {
    const p = byAcc[PV.acc], list = PV.ix?.list || [];
    return K.preamble(`interaction partners of ${p.gene || p.acc} (${p.acc})`, `the proteins STRING associates with ${p.gene || p.acc}: ${ixDesc()}, retrieved live on ${today()} (${STRING_CITE}; licence CC BY 4.0). Partners are matched to this site’s proteins by gene name; ${W.marks}_here counts their ${W.marks} in this site. A STRING association is to the whole protein: it does not show that a partner binds or modifies a ${W.mark}.`) +
      ['partner', 'partner_string_id', 'partner_accession_here', 'score', ...IX_CHANNELS.map(([, n]) => n.replace(/\W+/g, '_')), `${W.marks.replace(/\W+/g, '_')}_here`].join('\t') + '\n' +
      list.map(x => [x.preferredName_B, x.stringId_B, x.here?.acc || '', x.score, ...IX_CHANNELS.map(([f]) => x[f] ?? ''), x.here ? x.here.marks : 0].join('\t')).join('\n') + '\n';
  }
  function openString() {
    const w = window.open('', '_blank');
    const qs = new URLSearchParams({ identifiers: PV.acc, species: String(IXP.species), network_type: IXS.net, required_score: String(IXS.min), network_flavor: 'evidence', caller_identity: STRING_CALLER });
    getJson(STRING_API + 'get_link?' + qs).then(d => { const url = d && (typeof d[0] === 'string' ? d[0] : d[0]?.url); if (url && w) { w.opener = null; w.location.href = url; } else if (w) w.close(); })
      .catch(() => { if (w) w.close(); });
  }

  const THREE_D = 'https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.5.3/3Dmol-min.js';
  async function show3d() {
    const box = document.getElementById('af3d'), af = PV.af; if (!box || !af?.pdbUrl) return;
    box.hidden = false; box.innerHTML = '<p class="muted">Loading the model…</p>';
    try {
      if (!window.$3Dmol) await new Promise((ok, fail) => document.head.appendChild(Object.assign(document.createElement('script'), { src: THREE_D, onload: ok, onerror: () => fail(new Error('3Dmol did not load')) })));
      const pdb = await fetch(af.pdbUrl).then(r => (r.ok ? r.text() : Promise.reject(new Error('model'))));
      box.innerHTML = '';
      const v = window.$3Dmol.createViewer(box, { backgroundColor: 'white' });
      v.addModel(pdb, 'pdb');
      v.setStyle({}, { cartoon: { colorfunc: a => afColour(a.b) } });
      if (af.same) v.addStyle({ resi: PV.rec.marks.map(([pos]) => pos), atom: 'CA' }, { sphere: { color: '#c2410c', radius: 1.6 } });
      v.zoomTo(); v.render();
    } catch (e) { box.innerHTML = `<p class="muted">The 3D model could not be shown (${esc(e.message)}).</p>`; }
  }

  // ---- downloads: the map as a figure, the sites and the proteins as tables ------------------------------------------
  const mapFigure = () => K.map.figure(mapCtx());
  // a site's card, opened without leaving the page's place (the card is scrolled into view)
  function openSite(pos) { const y = scrollY; S.arg = `${PV.acc}/${pos}`; K.writeHash(true); K.render(); scrollTo(0, y); }
  document.addEventListener('keydown', e => { const tr = e.target.closest?.('tr[data-site]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSite(+tr.dataset.site); } });
  function sitesTsv() {
    const p = byAcc[PV.acc], rec = PV.rec;
    return K.preamble(`${W.marks} of ${p.gene || p.acc} (${p.acc})`, `each ${W.mark} of ${p.gene || p.acc} (${p.name}) with the 15 residues around it and its class in every question; the sequence is ${D.run.snapshot?.release} (MD5 ${rec.md5}).`) +
      ['site', 'position', 'window_15', ...COLS, ...AT].join('\t') + '\n' +
      rec.marks.map(m => [site(m[0]), m[0], m[1], ...markClasses(m).map(([aid, v]) => classText(aid, v)), ...(m[3] || [])].join('\t')).join('\n') + '\n';
  }

  // ---- register with the core -------------------------------------------------------------------------------------
  K.views.proteins = { render: proteinsView, title: () => 'Proteins' };
  K.views.protein = { render: proteinView, title: arg => (byAcc[String(arg).split('/')[0]]?.gene || arg), after: proteinAfter, tab: 'proteins' };
  K.tabs.push(() => ['proteins', 'Proteins', K.sel?.active() ? K.sel.nProteins() : P.length]);
  K.clicks.push(
    ['[data-psort]', el => { const k = el.dataset.psort; PS.desc = PS.sort === k ? !PS.desc : k === 'marks' || k === 'len' || k === 'share'; PS.sort = k; K.render(); }],
    ['[data-pmore]', () => { PS.n += 200; K.render(); }],
    ['[data-pexp]', el => K.exportFigure('tsv', null, `${D.site.id}_proteins`, el, proteinsTsv)],
    ['[data-sexp]', el => K.exportFigure('tsv', null, `${D.site.id}_${PV.acc}_sites`, el, sitesTsv)],
    ['[data-mexp]', el => K.exportFigure(el.dataset.mexp, mapFigure, `${D.site.id}_${PV.acc}_map`, el, sitesTsv)],
    ['[data-msite]', el => openSite(+el.dataset.msite)],
    ['[data-site-open]', el => openSite(+el.dataset.siteOpen)],
    ['[data-all-cols]', () => { PV.allCols = !PV.allCols; PV.open['p-sites'] = true; K.render(); }],
    ['[data-kinds-all]', el => { const k = 'kinds:' + el.dataset.kindsAll; PV.open[k] = !PV.open[k]; PV.open['p-kinds'] = true; K.render(); }],
    ['[data-regexp]', el => K.exportFigure('tsv', null, `${D.site.id}_${PV.acc}_regions`, el, regionsTsv)],
    ['[data-fasta]', el => { const p = byAcc[PV.acc], text = fasta(p, PV.rec);
      if (el.dataset.fasta === 'dl') { K.download(`${p.acc}${p.gene ? '_' + p.gene : ''}.fasta`, text, 'text/plain'); return; }
      const done = t => { const o = el.textContent; el.textContent = t; setTimeout(() => { el.textContent = o; }, 1500); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Copy failed')); else done('Copy failed'); }],
    ['tr[data-site]', (el, e) => { if (!e.target.closest('a')) openSite(+el.dataset.site); }],
    ['[data-site-close]', () => { const y = scrollY; S.arg = PV.acc; PV.site = null; K.writeHash(true); K.render(); scrollTo(0, y); }],
    ['[data-site-copy]', el => navigator.clipboard?.writeText(location.href).then(() => { el.textContent = 'Link copied'; })],
    ['[data-more-links]', el => { PV.more = !PV.more; document.getElementById('more-menu').hidden = !PV.more; el.setAttribute('aria-expanded', String(PV.more)); }],
    ['[data-fn-more]', () => { PV.fn = !PV.fn; document.querySelector('.fn-text')?.classList.toggle('open', PV.fn); const b = document.querySelector('[data-fn-more]'); if (b) b.textContent = PV.fn ? 'Less' : 'More'; }],
    ['[data-print]', () => {
      // printed in light colours, every section open, with the page's address and how to cite it at the foot
      document.querySelectorAll('details.pfold').forEach(d => { d.open = true; });
      const theme = document.documentElement.dataset.theme; document.documentElement.dataset.theme = 'light';
      document.body.dataset.printFoot = `${D.site.name} · ${location.href} · printed ${K.hdate(new Date().toISOString())}. ${K.creditLines()[0] || ''}`;
      setTimeout(() => { print(); if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme; }, 150);
    }],
    ['#af-3d-btn', () => show3d()],
    ['[data-pdb-all]', () => { PV.pdbAll = !PV.pdbAll; drawPdb(); }],
    ['[data-ix-net]', el => { IXS.net = el.dataset.ixNet; IXS.all = false; drawIx(); }],
    ['[data-ix-min]', el => { IXS.min = +el.dataset.ixMin; IXS.all = false; drawIx(); }],
    ['[data-ix-only]', el => { IXS.only = el.dataset.ixOnly === 'true'; IXS.all = false; drawIx(); }],
    ['[data-ix-all]', () => { IXS.all = !IXS.all; drawIx(); }],
    ['[data-ix-string]', () => openString()],
    ['[data-ixexp]', el => { if (PV.ix) K.exportFigure('tsv', null, `${D.site.id}_${PV.acc}_${IXS.net}_partners`, el, ixTsv); }],
    ['tr[data-acc]', (el, e) => { if (!e.target.closest('a')) K.go('protein', { arg: el.dataset.acc }); }],
  );
  K.tips.push(['[data-msite]', el => {
    const pos = +el.dataset.msite, m = PV.rec?.marks.find(x => x[0] === pos); if (!m) return '';
    const c = K.map.siteColour(m);
    return `<b>${esc(site(pos))}</b>${c.label ? ' · ' + esc(c.label) : ''}<br><span class="win">${winHtml(m[1])}</span><br>` +
      markClasses(m).map(([aid, v]) => `${esc(A[aid]?.title || aid)}: ${esc(classText(aid, v))}`).join('<br>') +
      shownAttrs(m).map(n => `<br><span class="muted">${esc(SPECS[n].label)}:</span> ${attrHtml(m, n, false)}`).join('') +
      '<br><span class="muted">Click for its card</span>';
  }]);
});
