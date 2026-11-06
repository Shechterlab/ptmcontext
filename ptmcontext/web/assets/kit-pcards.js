/* The protein page's context cards (website.protein.cards, CONTRACTS.md "Protein page cards"): Location and condensates,
   Cancer cell lines and tumours, enzyme inhibitors and the like, Experiments, Clustering, Other PTMs; and the live parts of
   a protein-set card (website.protein.sets[].live: UniProt's diseases and Open Targets' scores, asked by accession).
   Each card is on when the site file names it and reads tables of website.tables in the formats of CONTRACTS.md; it knows
   no mark, source or organism by name, and a protein without rows in a card's tables says so. The folds are made through
   the page's fold hooks (K.proteinFolds) and filled when the protein's tables arrive. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, esc, int, cap } = K;
  const PC = D.protein_view?.cards || {}, LIVE = (D.protein_view?.sets || []).filter(c => c.live);
  if (!Object.keys(PC).length && !LIVE.length) return;
  const TH = D.tables || {}, LK = D.lookups || {}, SPECS = D.attribute_specs || {}, PADJ = K.PADJ;
  const has = name => !!(name && TH[name]);
  const rows = (tb, name) => (has(name) ? K.card.rows(tb, name) : []);
  const list = v => String(v ?? '').split(/;\s*/).filter(Boolean);
  const num = v => (v === '' || v == null || !isFinite(+v) ? null : +v);
  const fmt3 = v => (v == null ? '–' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2));
  const sumList = (xs, n) => xs.slice(0, n).join(', ') + (xs.length > n ? ` +${xs.length - n}` : '');
  const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + 's'}`;
  const qf = q => (q >= 0.01 ? q.toFixed(2) : K.fq(q));
  const ext = (href, text, title) => `<a class="ext" href="${esc(href)}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
  const CUR = { p: null, rec: null };
  const meters1 = (label, v, text) => (K.pfolds ? K.pfolds.meters([{ label, v, text }]) : '');
  const word = (obj, k) => (obj || {})[k] ?? String(k).replace(/_/g, ' ');

  // ---- the protein's tables, asked once; every card is painted again when they arrive ---------------------------------
  const TB = {}, asked = new Set();
  function tables(acc) {
    if (acc in TB) return TB[acc];
    if (!asked.has(acc)) { asked.add(acc); K.card.load(acc).then(tb => { TB[acc] = tb || {}; paintAll(); }); }
    return undefined;
  }
  const sets = aid => { const sd = K.sel.data(), ps = sd?.protein_sets?.[aid]; return ps ? new Set(ps.sets.map(x => x[0])) : null; };
  const attrVal = (m, name) => K.cols.markAttr(m, name) ?? '';
  const letter = (rec, pos) => (rec.seq || '')[pos - 1] || '';
  const siteName = (rec, pos) => letter(rec, pos) + pos;
  const siteLink = (p, rec, pos) => `<a href="${esc(K.link('protein', `${p.acc}/${pos}`))}">${esc(siteName(rec, pos))}</a>`;
  const gene = p => p.gene || p.acc;

  // ---- live sources, asked by accession ------------------------------------------------------------------------------
  const UNI = {}, OT = {}, PM = {};
  const getJson = (url, opt) => fetch(url, opt).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  function uniprot(acc) {
    if (!(acc in UNI)) {
      UNI[acc] = undefined;
      getJson(`https://rest.uniprot.org/uniprotkb/${acc}.json`).then(j => {
        const cm = (j.comments || []).filter(c => c.commentType === 'DISEASE').map(c => ({ name: c.disease?.diseaseId || '', acronym: c.disease?.acronym || '', id: c.disease?.diseaseAccession || '',
          mim: (c.disease?.diseaseCrossReference?.database === 'MIM' ? c.disease.diseaseCrossReference.id : '') || '', note: (c.note?.texts || []).map(t => t.value).join(' ') })).filter(x => x.name);
        const xref = D.protein_view?.conservation?.ensembl?.xref || 'Ensembl';
        const ensg = [...new Set((j.uniProtKBCrossReferences || []).filter(x => x.database === xref).map(x => ((x.properties || []).find(q => q.key === 'GeneId') || {}).value || '').filter(Boolean).map(g => g.split('.')[0]))];
        UNI[acc] = { diseases: cm, ensg };
      }, () => { UNI[acc] = null; }).then(() => paintAll());
    }
    return UNI[acc];
  }
  function openTargets(id, cfg) {
    if (!(id in OT)) {
      OT[id] = undefined;
      getJson(cfg.graphql, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query($id:String!){target(ensemblId:$id){approvedSymbol associatedDiseases(page:{index:0,size:' + (cfg.size || 12) + '}){count rows{score disease{id name} datatypeScores{id score}}}}}', variables: { id } }) })
        .then(d => { OT[id] = d.data?.target ? d.data.target.associatedDiseases : { count: 0, rows: [] }; }, () => { OT[id] = null; }).then(() => paintAll());
    }
    return OT[id];
  }
  // short names of papers ("Markmiller 2018"), from PubMed's summary service where the site names its address
  function papers(ids, url) {
    const need = ids.filter(i => !(i in PM));
    if (!url || !need.length) return;
    need.forEach(i => { PM[i] = ''; });
    getJson(`${url}?db=pubmed&retmode=json&id=${need.join(',')}`).then(j => {
      need.forEach(i => { const r = j.result?.[i]; if (r) PM[i] = `${String(r.authors?.[0]?.name || '').split(' ')[0]} ${String(r.pubdate || '').slice(0, 4)}`.trim(); });
      document.querySelectorAll('[data-pm]').forEach(a => { if (PM[a.dataset.pm]) a.textContent = PM[a.dataset.pm]; });
    }, () => {});
  }

  // ---- Location and condensates --------------------------------------------------------------------------------------
  const stars = (n, top) => `<span class="stars" role="img" aria-label="${n} of ${top}">${Array.from({ length: top }, (_, k) => `<i class="${k < n ? 'on' : ''}">★</i>`).join('')}</span>`;
  function hpaHtml(cfg, p, tb) {
    const h = cfg.hpa, rs = rows(tb, h.table), have = h.analysis ? sets(h.analysis) : null;
    const tag = r => ({ name: r.location, main: r.main === '1' || /^true$/i.test(r.main), unsure: !!h.unsure && r.reliability === h.unsure, rel: r.reliability });
    const ls = rs.map(tag).sort((a, b) => b.main - a.main || a.unsure - b.unsure || a.name.localeCompare(b.name));
    const head = `<h4 class="sub-h">${esc(h.title || 'Locations')} <span class="muted small">${esc(h.source || '')}</span>${h.url ? ' ' + ext(h.url.replace('{acc}', encodeURIComponent(p.acc.split('-')[0])).replace('{gene}', encodeURIComponent(gene(p))), 'source ↗') : ''}</h4>`;
    if (!ls.length) return { sum: [], html: head + '<p class="muted small">Not profiled by this source.</p>' };
    const t = l => {
      const cls = `tag loc${l.main ? ' main' : ''}${l.unsure ? ' unsure' : ''}`, title = `${l.name}: ${l.main ? 'main' : 'additional'} location${l.rel ? `, reliability ${l.rel.toLowerCase()}` : ''}`;
      return have?.has(l.name) && !l.unsure ? `<button type="button" class="${cls}" data-f="p:${esc(h.analysis)}" data-v="${esc(l.name)}" title="${esc(title + `. Select the ${W.marks} on the proteins at this location.`)}">${esc(l.name)}</button>`
        : `<span class="${cls}" title="${esc(title)}">${esc(l.name)}${l.unsure ? ' ?' : ''}</span>`;
    };
    return { sum: ls.filter(l => l.main).map(l => l.name), html: head + `<div class="tags loc-tags">${ls.map(t).join(' ')}</div>` +
      `<p class="muted small">Main locations first, in bold${h.unsure ? `; “?” marks reliability ${esc(h.unsure)}, left out of the tests` : ''}.</p>` };
  }
  function mapsHtml(p) {
    if (!K.cell || !K.sel.data()) return '';
    const ms = K.cell.maps(p); if (!ms) return '';
    return `<h4 class="sub-h">Cell maps</h4><p class="sub">A part of the drawing is coloured when a map places ${esc(gene(p))} there.</p>` +
      `<div class="tbl-wrap"><table class="pc-maps"><tbody>${ms.map(m => `<tr><th scope="row">${esc(m.name)}<br><span class="muted small">${esc([m.method, m.cells].filter(Boolean).join(', '))}</span></th>` +
        `<td>${m.sets.length ? esc(m.sets.join(' · ')) : m.placed ? '<span class="muted">placed, in none of its compartments</span>' : '<span class="muted">not placed by this map</span>'}</td></tr>`).join('')}</tbody></table></div>` + K.cell.drawings(p);
  }
  // where the RNAs the protein binds gather: for each map of the bound RNAs (protein-set questions), the compartments of the protein's own sets, each with the dataset's test of it
  function rnaMapsHtml(cfg, p) {
    const sd = K.sel.data(), out = [];
    for (const aid of cfg.rna_maps) {
      const a = (D.analyses || []).find(x => x.id === aid), ps = sd.protein_sets?.[aid]; if (!a || !ps) continue;
      const names = ps.sets.map(s => s[0]).filter(s => K.sel.setHas(aid, s, p.i));
      const lab = s => (a.labels || {})[s] || s.replace(/_/g, ' ');
      const fold = s => { const rs = D.rows.filter(r => r.analysis === aid && r.category === s && r.dir === 'more'), r = rs.find(x => x.method === 'enricher') || rs[0]; return r ? ` <span class="muted small">(${K.fxn(r.eff)}× across the dataset)</span>` : ''; };
      out.push(`<tr><th scope="row">${esc(a.title)}</th><td>${names.length ? names.map(s => esc(lab(s)) + fold(s)).join(' · ') : '<span class="muted">none of its map’s compartments</span>'}</td></tr>`);
    }
    return out.length ? `<h4 class="sub-h">Where the RNAs ${esc(gene(p))} binds gather</h4><p class="sub">Its eCLIP targets, placed by each map of RNA location; a compartment is listed when the targets gather in it.</p><div class="tbl-wrap"><table class="pc-maps"><tbody>${out.join('')}</tbody></table></div>` : '';
  }
  function condensatesHtml(cfg, p, rec, tb) {
    const c = cfg.condensates, top = c.max_score || 5, names = LK[c.names] || {}, have = c.analysis ? sets(c.analysis) : null;
    const rs = rows(tb, c.members).map(r => { const id = r.condensate, nm = names[id] || {}; return { id, name: nm.name || id, type: nm.condensate_type || '', score: num(r.score) ?? -1, roles: list(r.roles), ev: list(r.evidence).sort((x, y) => Object.keys(c.evidence || {}).indexOf(x) - Object.keys(c.evidence || {}).indexOf(y)), pm: list(String(r.pmids || '').replace(/[,\s]+/g, '; ')) }; })
      .sort((a, b) => b.score - a.score || b.pm.length - a.pm.length || a.name.localeCompare(b.name));
    const ids = rs.flatMap(r => r.pm.slice(0, 3));
    const li = r => {
      const roles = r.roles.map(x => word(c.roles, x)).join(', ') || 'role not given', ev = r.ev.map(x => word(c.evidence, x)), pm = r.pm;
      const refs = pm.slice(0, 3).map(i => `<a data-pm="${esc(i)}" href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(i)}/" target="_blank" rel="noopener">${esc(PM[i] || 'PMID ' + i)}</a>`).join(', ');
      return `<li><div class="cond-name"><b>${have?.has(r.id) ? `<button type="button" class="linkish" data-f="p:${esc(c.analysis)}" data-v="${esc(r.id)}" title="Select the ${esc(W.marks)} on the proteins of this condensate">${esc(r.name)}</button>` : esc(r.name)}</b>` +
        (r.type && r.type !== c.default_type ? ` <span class="tag">${esc(r.type)}</span>` : '') + (c.url ? ' ' + ext(c.url.replace('{id}', encodeURIComponent(r.id)), `${esc((c.source || '').split(' ')[0] || 'Source')} ↗`, `Open in ${c.source || 'the source'}`) : '') + '</div>' +
        `<div class="cond-conf">${stars(Math.max(r.score, 0), top)}<span class="muted small">${esc(roles)}</span></div>` +
        `<div class="cond-ev small">${ev.length ? esc(ev.join(' · ')) : '<span class="muted">no evidence type recorded</span>'} · ${pm.length ? plural(pm.length, 'publication') : '<span class="muted">no publication recorded</span>'}` +
        (pm.length ? ` <span class="muted">${refs}${pm.length > 3 ? ` +${pm.length - 3} more` : ''} · ${ext('https://pubmed.ncbi.nlm.nih.gov/?term=' + pm.map(encodeURIComponent).join('%2C'), `all ${pm.length} in PubMed ↗`)}</span>` : '') + '</div></li>';
    };
    papers(ids, c.pubmed);
    const best = rs[0];
    return { n: rs.length, best, html: `<h4 class="sub-h">${esc(c.title || 'Condensates')} <span class="muted small">${esc(c.source || '')}</span></h4>` +
      (rs.length ? `<p class="sub">Condensates with ${esc(gene(p))} as a member${c.source ? ` (${esc(c.source)})` : ''}. Stars: confidence, 0–${top}. Every membership is listed.</p><ul class="cond-list mine">${rs.map(li).join('')}</ul>` : '<p class="muted">No condensate membership recorded.</p>') };
  }
  function locationBuild(p, rec, tb) {
    const cfg = PC.location, bits = [];
    let html = '', sum = [];
    if (cfg.hpa) { const h = hpaHtml(cfg, p, tb); html += h.html; sum.push(h.sum.length ? sumList(h.sum, 2) : ''); }
    if (cfg.maps) html += mapsHtml(p);
    if (cfg.rna_maps?.length && K.sel.data()) html += rnaMapsHtml(cfg, p);
    if (cfg.condensates) {
      const c = condensatesHtml(cfg, p, rec, tb); html += c.html;
      const noun = (cfg.condensates.source || '').split(' ')[0];
      sum.push(c.n ? `${plural(c.n, `${noun} condensate`.trim())}${c.best && c.best.score > 0 ? `, most confident ${c.best.name} (${c.best.score} of ${cfg.condensates.max_score || 5} stars)` : ''}` : `no ${noun} condensate`.replace('  ', ' '));
    }
    bits.push(...sum.filter(Boolean));
    const nLoc = cfg.hpa ? (rows(tb, cfg.hpa.table).filter(r => r.reliability !== cfg.hpa.unsure)).length : 0, nCond = cfg.condensates ? rows(tb, cfg.condensates.members).length : 0;
    return { html, sum: bits.join(' · '), wait: !!(cfg.maps && !K.sel.data()), pic: K.pfolds && (nLoc || nCond) ? K.pfolds.bigN([[int(nCond), nCond === 1 ? 'condensate' : 'condensates'], [int(nLoc), nLoc === 1 ? 'location' : 'locations']]) : '' };
  }

  // ---- Cancer cell lines and tumours ----------------------------------------------------------------------------------
  function histSvg(h, g, cfg) {
    const bins = g.map(Number), n = bins.length, W0 = 460, H0 = 150, ml = 8, mr = 8, mt = 8, mb = 38, mx = Math.max(1, ...bins), lo = h.from, hi = h.to, bw = (W0 - ml - mr) / n;
    const x = v => ml + (v - lo) / (hi - lo) * (W0 - ml - mr), step = (hi - lo) / n;
    let s = bins.map((v, k) => `<rect class="hb" x="${(ml + k * bw + 0.5).toFixed(1)}" y="${(mt + (H0 - mt - mb) * (1 - v / mx)).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${((H0 - mt - mb) * v / mx).toFixed(1)}"><title>${(lo + k * step).toFixed(1)} to ${(lo + (k + 1) * step).toFixed(1)}: ${int(v)} lines</title></rect>`).join('');
    s += `<line class="ha" x1="${ml}" x2="${W0 - mr}" y1="${H0 - mb}" y2="${H0 - mb}"/>`;
    for (let v = Math.ceil(lo); v <= hi + 1e-9; v += 1) s += `<line class="ha" x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${H0 - mb}" y2="${H0 - mb + 4}"/><text class="ht" x="${x(v).toFixed(1)}" y="${H0 - mb + 15}" text-anchor="middle">${v < 0 ? '−' : ''}${Math.abs(v)}</text>`;
    (h.marks || []).forEach(m => { s += `<line class="hm" x1="${x(m.at).toFixed(1)}" x2="${x(m.at).toFixed(1)}" y1="${mt}" y2="${H0 - mb}"/><text class="ht" x="${x(m.at).toFixed(1)}" y="${mt + 9}" ${m.at > (lo + hi) / 2 ? 'text-anchor="end" dx="-3"' : 'dx="3"'}>${esc(m.label)}</text>`; });
    s += `<text class="ht" x="${ml}" y="${H0 - 4}">${esc(h.axis || '')}</text>`;
    return `<svg class="pc-hist" viewBox="0 0 ${W0} ${H0}" role="img" aria-label="${esc(h.axis || 'histogram')}">${s}</svg>`;
  }
  function dependencyBuild(p, rec, tb) {
    const cfg = PC.dependency, r = rows(tb, cfg.table)[0], unit = cfg.unit || 'lines', g = gene(p);
    let dep = '';
    if (!r) dep = `<p class="muted">No dependency screen covers ${esc(g)}, or it is named by another gene.</p>`;
    else {
      const ce = /^true$/i.test(r.common_essential || ''), lines = num(r.lines), dn = num(r.dependent), bins = String(r.histogram || '').split(';').filter(x => x !== '');
      dep = `<p class="dm-call">${ce ? '<span class="tag dm-ce" title="Called commonly essential by the screen: among the strongest dependencies of most lines">commonly essential</span> ' : ''}<b>${int(dn)} of ${int(lines)}</b> ${esc(unit)} depend on ${esc(g)}; median gene effect <b>${fmt3(num(r.median))}</b>.</p>` +
        (cfg.histogram && bins.length ? histSvg(cfg.histogram, bins, cfg) : '') +
        (r.lineages ? `<p class="small"><span class="flabel">Most dependent lineages</span> ${list(r.lineages).map(x => { const [n, k, m] = x.split('|'); return `${esc(n)} ${fmt3(num(m))} <span class="muted">(${plural(+k, 'line')})</span>`; }).join(' · ')} <span class="muted">(mean gene effect)</span></p>` : '');
    }
    // the changes at the marks: the site card's changes (website.protein.card.changes), one column each
    const ch = (D.protein_view?.card?.changes || []).filter(x => SPECS[x.attribute]);
    let chg = '', nSites = [];
    if (ch.length) {
      const per = rec.marks.map(m => ({ pos: m[0], cells: ch.map(x => {
        const sep = SPECS[x.attribute].separator || '; ', vals = String(attrVal(m, x.attribute)).split(sep).filter(Boolean);
        const n = has(x.table) && x.counts ? list((K.card.at(tb, x.table, m[0])[0] || {})[x.counts]) : [];
        return { vals, n };
      }) })).filter(r => r.cells.some(c => c.vals.length));
      nSites = ch.map((x, k) => per.filter(r => r.cells[k].vals.length).length);
      const total = rec.marks.length;
      chg = `<p class="small">${ch.map((x, k) => `${int(nSites[k])} of its ${plural(total, W.mark, W.marks)} ${nSites[k] === 1 ? 'carries' : 'carry'} a change in at least one ${esc((x.unit || ['record'])[0])} (${esc(x.label)})`).join('; ')}.</p>` +
        (per.length ? `<div class="tbl-wrap"><table class="pc-tbl"><thead><tr><th>Site</th>${ch.map(x => `<th>${esc(x.label)}</th>`).join('')}</tr></thead><tbody>` +
          per.sort((a, b) => b.cells.reduce((s, c) => s + c.n.reduce((q, v) => q + (+v || 0), 0), 0) - a.cells.reduce((s, c) => s + c.n.reduce((q, v) => q + (+v || 0), 0), 0) || a.pos - b.pos).slice(0, 12).map(r =>
            `<tr><td>${siteLink(p, rec, r.pos)}</td>${r.cells.map((c, k) => `<td>${c.vals.length ? esc(c.vals.join(', ')) + (c.n.length ? ` <span class="muted small">(${c.n.map(v => '×' + v).join(', ')})</span>` : '') : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('') +
          `</tbody></table></div>` + (per.length > 12 ? `<p class="muted small">${int(per.length - 12)} more sites changed; the protein map draws them all.</p>` : '') : '');
    }
    const html = `<p class="sub">${esc(cfg.sub || '')}</p>${cfg.url ? `<p class="actions">${ext(cfg.url.replace('{gene}', encodeURIComponent(g)), 'Source ↗')}</p>` : ''}` +
      `<div class="pc-grid"><section class="pc-sec"><h4>Dependency in CRISPR knockout screens</h4>${dep}</section>` +
      (ch.length ? `<section class="pc-sec"><h4>Changes at ${esc(W.residues)}</h4>${chg}${cfg.changes_note ? `<p class="note small">${esc(cfg.changes_note)}</p>` : ''}</section>` : '') + '</div>' +
      (cfg.note ? `<p class="note small">${esc(cfg.note)}</p>` : '');
    const first = ch[0], sum = [r ? (/^true$/i.test(r.common_essential || '') ? 'commonly essential' : `${int(num(r.dependent))} of ${int(num(r.lines))} lines depend on it`) : 'not screened',
      ch.length ? `${nSites[0] ? plural(nSites[0], 'site') : 'no site'} changed in ${(first.unit || ['', 'records'])[1]}` : ''].filter(Boolean).join(' · ');
    const depPic = r && !/^true$/i.test(r.common_essential || '') && num(r.lines) ? meters1('Dependent', num(r.dependent) / num(r.lines), `${int(num(r.dependent))} of ${int(num(r.lines))} lines`) : '';
    return { html, sum, pic: depPic };
  }

  // ---- inhibitors, knockouts and knockdowns of the mark's enzymes: a site against each experiment, a mark per call -----------------------
  function perturbationsBuild(p, rec, tb) {
    const cfg = PC.perturbations, CL = D.protein_view?.card?.calls || {}, marks = CL.marks || {}, words = CL.words || {}, skip = new Set(CL.skip || []);
    const cols = [...Object.entries(CL.attributes || {}).filter(([a]) => SPECS[a]).map(([a, lab]) => ({ key: 'a:' + a, label: lab, attr: a })),
      ...Object.entries(CL.conditions || {}).map(([c, lab]) => ({ key: 'c:' + c, label: lab, cond: c }))];
    const cell = new Map();                                                    // 'pos|key' -> {call, tip}
    for (const m of rec.marks) {
      for (const c of cols) if (c.attr) { const v = String(attrVal(m, c.attr)); if (v && !skip.has(v)) cell.set(`${m[0]}|${c.key}`, { call: v, tip: `${c.label}: ${word(words, v)}` }); }
      for (const t of CL.tables || []) for (const r of K.card.at(tb, t, m[0])) {
        if (skip.has(r.call)) continue;
        const k = `${m[0]}|c:${r.condition}`;
        cell.set(k, { call: r.call, tip: [`${(CL.conditions || {})[r.condition] || r.condition}: ${word(words, r.call)}`, r.n ? plural(+r.n, 'peptide') + (r.n_down || r.n_up ? ` (${r.n_down || 0} down, ${r.n_up || 0} up)` : '') : '', r.value !== undefined && r.value !== '' ? `log2 ${num(r.value) > 0 ? '+' : ''}${fmt3(num(r.value))}` : '',
          r.q ? `q ${K.fq(+r.q)}` : ''].filter(Boolean).join(' · ') });
      }
    }
    const used = cols.filter(c => [...cell.keys()].some(k => k.endsWith('|' + c.key))), sites = rec.marks.map(m => m[0]).filter(pos => used.some(c => cell.has(`${pos}|${c.key}`))).sort((a, b) => a - b);
    const head = `<p class="sub">${esc(cfg.sub || '')}</p>`;
    if (!sites.length) return { html: head + `<p class="muted">None of its ${esc(W.marks)} was quantified in these experiments (${esc(cols.map(c => c.label).join('; '))}).</p>`, sum: 'not measured' };
    const mk = c => (marks[c] || (c === 'no_significant_change' ? '○' : '?'));
    const down = sites.filter(pos => used.some(c => cell.get(`${pos}|${c.key}`)?.call === 'decreased')).length;
    const html = head + `<div class="tbl-wrap"><table class="pc-tbl pert"><thead><tr><th scope="col">Site</th>${used.map(c => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>` +
      sites.map(pos => `<tr><th scope="row">${siteLink(p, rec, pos)}</th>${used.map(c => { const x = cell.get(`${pos}|${c.key}`); return x ? `<td title="${esc(x.tip)}"><span class="trend c-${esc(x.call)}"><b>${esc(mk(x.call))}</b></span></td>` : '<td class="muted" title="Not quantified">&nbsp;</td>'; }).join('')}</tr>`).join('') +
      `</tbody></table></div><p class="pc-key">${Object.entries(marks).map(([c, m]) => `<span><span class="trend c-${esc(c)}"><b>${esc(m)}</b></span> ${esc(word(words, c))}</span>`).join('')}<span>○ no significant change</span><span>blank: not quantified · hover a mark for its numbers</span></p>` +
      (cfg.note ? `<p class="note small">${esc(cfg.note)}</p>` : '');
    return { html, sum: `${int(down)} of ${int(sites.length)} quantified sites decreased in at least one`, pic: meters1('Decreased', down / sites.length, `${int(down)} of ${int(sites.length)} sites`) };
  }

  // ---- Experiments on its methylation ----------------------------------------------------------------------------------
  function experimentsBuild(p, rec, tb) {
    const cfg = PC.experiments, rs = rows(tb, cfg.table);
    if (!rs.length) return { hide: true, html: '', sum: '' };
    const dir = d => (d === 'decreased' ? '<b class="trend c-decreased">▼</b> fell' : d === 'increased' ? '<b class="trend c-increased">▲</b> rose' : d === 'no_change' ? 'no change' : '—');
    const html = `<p class="sub">${esc(cfg.sub || '')}</p><div class="tbl-wrap"><table class="pc-tbl exp"><thead><tr><th>Site</th><th>Experiment</th><th>Readout</th><th>Change</th><th>Finding</th><th>Paper</th></tr></thead><tbody>` +
      rs.map(r => `<tr><td>${r.position ? siteLink(p, rec, +r.position) + (r.in_release === 'false' ? ` <span class="muted small">not a ${esc(W.mark)} of this release</span>` : '') : esc(r.region)}</td>` +
        `<td>${esc(r.perturbation)}<br><span class="muted small">${esc([r.system, r.species].filter(Boolean).join(', '))}</span></td><td>${esc(r.readout)}</td><td>${dir(r.direction)}</td>` +
        `<td>${esc(r.finding)}${r.figure ? ` <span class="muted small">(${esc(r.figure)})</span>` : ''}${r.read_from === 'abstract' ? ' <span class="muted small">from the abstract</span>' : ''}</td>` +
        `<td>${r.doi ? ext('https://doi.org/' + r.doi, esc(r.reference)) : esc(r.reference)}</td></tr>`).join('') + '</tbody></table></div>' + (cfg.note ? `<p class="note small">${esc(cfg.note)}</p>` : '');
    return { hide: false, html, sum: plural(rs.length, 'experiment') };
  }

  // ---- Clustering ------------------------------------------------------------------------------------------------------
  function clusteringBuild(p, rec, tb) {
    const cfg = PC.clustering, r = rows(tb, cfg.table)[0], sub = `<p class="sub">${esc(cfg.sub || '')}</p>`;
    if (!r) return { html: sub + `<p class="muted">No clustering is recorded for ${esc(gene(p))}.</p>`, sum: '' };
    const sp = num(r.spacing_median), n = rec.marks.length, win = num(r.window_size), sites = num(r.window_sites), q = num(r.window_q), l2 = num(r.window_log2);
    const wins = (cfg.windows || []).map(w => [w, num(r['max_' + w])]).filter(([, v]) => v != null);
    const clusters = list(r.clusters).map(c => c.split(',').map(Number)).filter(c => c.length);
    const range = `${letter(rec, +r.window_start)}${r.window_start}–${r.window_end}`;
    const html = sub + '<dl class="pc-dl">' +
      (sp == null ? `<dt>Spacing</dt><dd>${n === 1 ? `a single ${esc(W.mark)}` : 'not recorded'}</dd>` : `<dt>Closest / median spacing</dt><dd>${int(num(r.spacing_min))} aa / ${int(sp)} aa</dd>`) +
      (wins.length ? `<dt>Most ${esc(W.marks)} within</dt><dd>${wins.map(([w, v]) => `${w} aa: ${int(v)}`).join(' · ')}</dd>` : '') +
      (win != null && sites != null ? `<dt>Top cluster window <span class="muted small">(lowest q against a null drawn from its other ${esc(W.residues)}, not necessarily the densest)</span></dt><dd>${int(sites)} sites in ${int(win)} aa (${esc(range)}), log2 obs/null ${l2 > 0 ? '+' : ''}${l2 == null ? '–' : l2.toFixed(2)}, q ${q == null ? '–' : qf(q)}</dd>` : '') +
      (r.architecture ? `<dt>Architecture</dt><dd>${esc(r.architecture)}${clusters.length ? `<br><span class="muted small">clusters ${clusters.map(c => `${c[0]}–${c[c.length - 1]} (${c.length})`).join(', ')}</span>` : ''}</dd>` : '') + '</dl>' +
      (cfg.note ? `<p class="note small">${esc(cfg.note)}</p>` : '');
    const len0 = p.len || (rec.seq || '').length || 1, bw = win != null && r.window_start ? [{ a: +r.window_start, b: +r.window_end, cls: 'fp-u fp-u1', tip: 'top window' }] : [];
    const pic = K.pfolds ? K.pfolds.track(len0, [{ label: 'Clusters', items: [...clusters.map(c => ({ a: c[0], b: c[c.length - 1], cls: 'fp-u fp-u0' })), ...bw] }, { label: 'Sites', items: rec.marks.map(m => ({ a: m[0], dot: true, cls: 'fp-site' })) }]) : '';
    return { pic, html, sum: [sp != null ? `median spacing ${int(sp)} aa` : '', win != null && sites != null ? `top window ${int(sites)} sites in ${int(win)} aa${q != null ? `, q ${qf(q)}${q > PADJ ? ' (not significant)' : ''}` : ''}` : ''].filter(Boolean).join(' · ') };
  }

  // ---- Other PTMs ------------------------------------------------------------------------------------------------------
  function ptmsBuild(p, rec, tb) {
    const cfg = PC.other_ptms, rs = rows(tb, cfg.table), kinds = cfg.kinds || {}, near = cfg.near || 0, marks = rec.marks.map(m => m[0]);
    if (!rs.length) return { html: `<p class="sub">${esc(cfg.sub || '')}</p><p class="muted">No other modification is recorded on ${esc(gene(p))}.</p>`, sum: 'none recorded' };
    const kinds0 = [...Object.keys(kinds), ...[...new Set(rs.map(r => r.kind))].filter(k => !(k in kinds))];
    const by = k => rs.filter(r => r.kind === k), closest = r => Math.min(...marks.map(m => Math.abs(m - r.start)));
    const body = kinds0.filter(k => by(k).length).map(k => {
      const all = by(k), nr = near ? all.filter(r => marks.length && closest(r) <= near).sort((a, b) => a.start - b.start) : [];
      return { k, label: word(kinds, k), n: all.length, near: nr, html: `<div class="pc-kind"><b>${esc(word(kinds, k))}</b> <span class="num">${int(all.length)}</span>` +
        (near ? `<p class="small">${nr.length ? `${plural(nr.length, 'site')} within ${near} aa of a ${esc(W.mark)}` : `none within ${near} aa of a ${esc(W.mark)}`}${nr.length ? `: ` + nr.slice(0, 12).map(r => { const m = marks.reduce((a, b) => (Math.abs(b - r.start) < Math.abs(a - r.start) ? b : a)); return `<span class="tag" title="${esc(r.source || '')}">${esc(siteName(rec, r.start))} · ${esc(siteName(rec, m))}</span>`; }).join(' ') + (nr.length > 12 ? ` +${nr.length - 12}` : '') : ''}</p>` : '') + '</div>' };
    });
    const nNear = body.reduce((s, b) => s + b.near.length, 0);
    const len1 = p.len || (rec.seq || '').length || 1;
    return { pic: K.pfolds ? K.pfolds.track(len1, [...body.slice(0, 2).map(b => ({ label: b.label.slice(0, 9), items: rs.filter(r => r.kind === b.k).map(r => ({ a: r.start, dot: true, cls: 'fp-ptm' })) })), { label: 'Sites', items: rec.marks.map(m => ({ a: m[0], dot: true, cls: 'fp-site' })) }]) : '', html: `<p class="sub">${esc(cfg.sub || '')}</p>` + body.map(b => b.html).join('') + (cfg.note ? `<p class="note small">${esc(cfg.note)}</p>` : ''),
      sum: body.map(b => `${b.label} ${int(b.n)}`).join(' · ') + (near && nNear ? ` · ${int(nNear)} within ${near} aa of a ${W.mark}` : '') };
  }

  // ---- the live parts of the Disease card: UniProt's diseases, Open Targets' scores -----------------------------------
  const famNames = (c, p) => {
    const aid = c.term_groups?.families?.[0], sd = K.sel.data(), ps = sd?.protein_sets?.[aid];
    return ps ? ps.sets.map(x => x[0]).filter(s => K.sel.setHas(aid, s, p.i)) : [];
  };
  function liveBuild(p, rec, tb, el) {
    const c = LIVE[+el.dataset.pcLive], u = c.live.uniprot ? uniprot(p.acc) : null, ot = c.live.open_targets;
    let html = '';
    if (c.live.uniprot) {
      html += '<p class="flabel">Curated in UniProt</p>';
      html += u === undefined ? '<p class="note">Asking UniProt…</p>' : u === null ? '<p class="muted">UniProt did not answer. Nothing on this page depends on it.</p>' :
        u.diseases.length ? `<ul class="term-list uni-dis">${u.diseases.map(d => `<li><b>${esc(d.name)}</b>${d.acronym ? ` (${esc(d.acronym)})` : ''}` +
          (d.id ? ' ' + ext('https://www.uniprot.org/diseases/' + encodeURIComponent(d.id), esc(d.id) + ' ↗', 'The UniProt disease entry') : '') + (d.mim ? ' ' + ext('https://omim.org/entry/' + encodeURIComponent(d.mim), 'MIM ' + esc(d.mim) + ' ↗') : '') +
          (d.note ? `<br><span class="muted small">${esc(d.note.length > 220 ? d.note.slice(0, 218) + '…' : d.note)}</span>` : '') + '</li>').join('')}</ul>` : '<p class="muted">No disease involvement curated in UniProt.</p>';
    }
    if (ot) {
      html += '<p class="flabel">Open Targets association scores</p>';
      const id = u && u.ensg && u.ensg[0], d = id ? openTargets(id, ot) : null;
      if (u === undefined) html += '<p class="muted">Waiting for UniProt…</p>';
      else if (!id) html += '<p class="muted">No Ensembl gene for this entry.</p>';
      else if (d === undefined) html += '<p class="note">Asking Open Targets…</p>';
      else if (d === null) html += '<p class="muted">Open Targets did not answer.</p>';
      else if (!d.rows.length) html += '<p class="muted">No Open Targets disease associations.</p>';
      else {
        const OT_TYPES = { genetic_association: 'genetics', somatic_mutation: 'somatic', known_drug: 'drugs', affected_pathway: 'pathways', rna_expression: 'expression', literature: 'literature', animal_model: 'animal models' };
        html += `<ul class="ot-list">${d.rows.map(r => { const types = (r.datatypeScores || []).filter(t => t.score > 0).sort((x, y) => y.score - x.score).slice(0, 3).map(t => OT_TYPES[t.id] || t.id.replace(/_/g, ' '));
          return `<li><span class="ot-name">${ext(`https://platform.opentargets.org/evidence/${encodeURIComponent(id)}/${encodeURIComponent(r.disease.id)}`, esc(r.disease.name))}${types.length ? ` <span class="muted small">${esc(types.join(', '))}</span>` : ''}</span>` +
            `<span class="pc-bar" title="Overall association score ${r.score.toFixed(2)}"><i style="width:${(100 * r.score).toFixed(0)}%"></i></span><span class="num">${r.score.toFixed(2)}</span></li>`; }).join('')}</ul>` +
          `<p class="note">Top ${d.rows.length} of ${int(d.count)} diseases by overall association score (0–1) for this gene. ${ot.page ? ext(ot.page.replace('{id}', encodeURIComponent(id)).replace('{gene}', encodeURIComponent(gene(p))), 'All in Open Targets ↗') + ' · ' : ''}CC0</p>`;
      }
    }
    const fam = famNames(c, p), sumEl = document.querySelector(`[data-pc-sum="live${el.dataset.pcLive}"]`);
    if (sumEl && u !== undefined) sumEl.textContent = [u ? (u.diseases.length ? 'UniProt: ' + sumList(u.diseases.map(d => d.acronym || d.name), 2) : 'none curated in UniProt') : '', K.sel.data() ? (fam.length ? 'families: ' + sumList(fam, 2) : 'in no disease family') : ''].filter(Boolean).join(' · ') || c.summary || '';
    const fold0 = el.closest('details'); if (fold0?.id && K.sel.data()) K.pfolds?.set(fold0.id, fam.length ? K.pfolds.bigN([[int(fam.length), fam.length === 1 ? 'disease family' : 'disease families']]) : '');
    return { html, wait: u === undefined || (ot && u && u.ensg[0] && OT[u.ensg[0]] === undefined) };
  }
  const liveAt = c => LIVE.findIndex(x => x.title === c.title);        // the page's card is a copy of the site's entry
  K.setsLive = {
    html: (c, p) => (c.live ? `<div class="pc pc-live" data-pc="live" data-pc-live="${liveAt(c)}"></div>` : ''),
    sum: (c, p) => (c.live ? `<span data-pc-sum="live${liveAt(c)}">${esc(c.summary || '')}</span>` : undefined),
  };

  // ---- the folds -----------------------------------------------------------------------------------------------------
  const CARDS = [
    ['location', 'p-cond', 'Location and condensates', locationBuild], ['dependency', 'p-depmap', 'Cancer cell lines and tumours', dependencyBuild],
    ['perturbations', 'p-pert', `${W.writer ? cap(W.writer) : 'Enzyme'} inhibitors, knockouts and knockdowns`, perturbationsBuild], ['experiments', 'p-exp', 'Experiments', experimentsBuild],
    ['clustering', 'p-cluster', 'Clustering', clusteringBuild], ['other_ptms', 'p-ptm', 'Other PTMs', ptmsBuild],
  ].filter(([k]) => PC[k]);
  const BUILD = { live: liveBuild };
  K.pcards = BUILD;                                                  // the cards' builders: (protein, record, tables) -> { html, sum }
  (K.proteinFolds ||= []);
  for (const [key, id, title, build] of CARDS) {
    BUILD[key] = build;
    K.proteinFolds.push((p, rec, fold) => {
      CUR.p = p; CUR.rec = rec;
      if (key === 'location' && !(PC.location.hpa || PC.location.maps || PC.location.condensates)) return '';
      const html = fold(id, esc(PC[key].title || title), `<span data-pc-sum="${key}">${esc(PC[key].summary || '')}</span>`, `<div class="pc" data-pc="${key}"></div>`, false);
      return key === 'experiments' ? html.replace('<details ', '<details hidden ') : html;
    });
  }
  K.proteinFolds.push((p, rec) => { CUR.p = p; CUR.rec = rec; return ''; });      // the live parts need the protein before the page is drawn
  // the sections of the page's nav: with the site's fold order, the folds in that order; else the cards before the regions
  const baseSections = K.sections.protein;
  if (baseSections) K.sections.protein = () => {
    const s = baseSections(), order = K.foldOrder || [], here = id => document.getElementById(id), shown = id => here(id) && !here(id).hidden;
    const mine = CARDS.filter(([, id]) => !s.some(x => x[0] === id) && shown(id)).map(([, id, title]) => [id, PC[CARDS.find(c => c[1] === id)[0]].title || title, 1]);
    if (!order.length) { const at = s.findIndex(x => x[0] === 'p-regions'); s.splice(at < 0 ? s.length : at, 0, ...mine); return s.filter(x => !/^p-/.test(x[0]) || shown(x[0]) || !here(x[0])); }
    const head = s.filter(x => !/^(p-|g-)/.test(x[0])), folds = [...s, ...mine].filter(x => /^p-/.test(x[0]) && (!here(x[0]) || shown(x[0])));
    const at = x => { const i = order.indexOf(x[0]); return i < 0 ? 1e3 : i; };
    return [...head, ...folds.map((x, k) => [x, k]).sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]).map(x => x[0])];
  };

  // ---- painting: each card's box is filled when its tables are here, and again when a live answer arrives -------------
  function paintAll() {
    const p = CUR.p; if (!p) return;
    document.querySelectorAll('[data-pc]').forEach(el => {
      if (el.dataset.pcOk === '1') return;
      const kind = el.dataset.pc, tb = tables(p.acc);
      if (tb === undefined) { el.innerHTML = '<p class="muted small">Loading…</p>'; return; }
      if (kind !== 'live' && !K.sel.data() && kind === 'location' && PC.location.maps) { el.innerHTML = '<p class="muted small">Loading…</p>'; return; }
      const r = BUILD[kind](p, CUR.rec, tb, el);
      el.innerHTML = r.html;
      if (!r.wait) el.dataset.pcOk = '1';
      const fold = el.closest('details');
      if (r.hide != null && fold) fold.hidden = !!r.hide;
      const s = document.querySelector(`[data-pc-sum="${kind}"]`); if (s && r.sum != null && kind !== 'live') s.textContent = r.sum;
      if (fold?.id && r.pic != null) K.pfolds?.set(fold.id, r.pic);
    });
  }
  (K.afterRender ||= []).push(paintAll);

  // ---- the look -------------------------------------------------------------------------------------------------------
  const st = document.createElement('style');
  st.id = 'kit-pcards-css';
  st.textContent = [
    '.pc .sub-h{font-size:.95rem;margin:.9rem 0 .35rem}.pc .sub-h:first-child{margin-top:.2rem}.pc .flabel{margin:.8rem 0 .25rem}',
    '.pc .tag.loc.main{font-weight:700}.pc .tag.loc.unsure{opacity:.65;border-style:dashed}.pc button.tag{cursor:pointer;font:inherit;font-size:.82rem}',
    '.pc .stars{display:inline-flex;letter-spacing:1px;margin-right:.5rem}.pc .stars i{font-style:normal;color:var(--line-strong)}.pc .stars i.on{color:var(--accent)}',
    '.pc .cond-list{list-style:none;margin:.3rem 0;padding:0}.pc .cond-list li{padding:.45rem 0;border-bottom:1px solid var(--line)}.pc .cond-name{display:flex;flex-wrap:wrap;gap:.4rem;align-items:baseline}',
    '.pc .cond-conf{margin:.15rem 0}.pc .cond-ev{color:var(--ink-2)}',
    '.pc-maps{border-collapse:collapse;font-size:.88rem;width:auto}.pc-maps th,.pc-maps td{text-align:left;vertical-align:top;padding:.3rem .8rem .3rem 0;border-bottom:1px solid var(--line)}.pc-maps th{font-weight:600;white-space:nowrap}',
    '.cell-onep{margin:.5rem 0;max-width:760px}.cell-onep .cell-svg{max-width:100%}',
    '.pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:1rem 2rem}.pc-sec h4{margin:.2rem 0 .4rem;font-size:.95rem}',
    '.pc-hist{width:100%;max-width:460px;height:auto;display:block}.pc-hist .hb{fill:var(--accent);opacity:.75}.pc-hist .ha{stroke:var(--line-strong)}.pc-hist .hm{stroke:var(--muted);stroke-dasharray:3 3}.pc-hist .ht{font-size:10px;fill:var(--muted)}',
    '.pc-tbl{border-collapse:collapse;font-size:.86rem}.pc-tbl th,.pc-tbl td{text-align:left;padding:.3rem .7rem .3rem 0;border-bottom:1px solid var(--line);vertical-align:top}.pc-tbl.pert td,.pc-tbl.pert th{padding-right:.6rem}.pc-tbl th{font-weight:600}',
    '.pc-tbl.exp td{min-width:7rem}.pc-key{display:flex;flex-wrap:wrap;gap:.2rem 1rem;font-size:.82rem;color:var(--muted)}',
    '.pc-dl{display:grid;grid-template-columns:minmax(10rem,18rem) 1fr;gap:.4rem 1.2rem;margin:.4rem 0}.pc-dl dt{font-weight:600}.pc-dl dd{margin:0}',
    '.pc-kind{margin:.4rem 0}.pc-kind .num{margin-left:.4rem;font-variant-numeric:tabular-nums}',
    '.pc-live .ot-list{list-style:none;margin:.2rem 0;padding:0}.pc-live .ot-list li{display:grid;grid-template-columns:1fr 6rem 2.6rem;gap:.6rem;align-items:center;padding:.15rem 0}',
    '.pc-bar{display:block;height:.55rem;background:var(--surface-2);border-radius:3px;overflow:hidden}.pc-bar i{display:block;height:100%;background:var(--accent)}.pc-live .num{text-align:right;font-variant-numeric:tabular-nums}',
    '.pc-live .term-list{list-style:none;margin:.2rem 0;padding:0}.pc-live .term-list li{padding:.25rem 0}.dis-group{margin:.2rem 0}.dis-group summary{cursor:pointer}',
    '@media (max-width:640px){.pc-dl{grid-template-columns:1fr}.pc-live .ot-list li{grid-template-columns:1fr 4rem 2.4rem}}',
  ].join('');
  document.head.appendChild(st);
});
