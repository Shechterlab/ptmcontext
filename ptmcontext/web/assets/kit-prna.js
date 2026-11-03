/* RNA and DNA interactions: a card on the protein page (a fold, p-na) with what the site knows of the RNA and DNA a protein
   meets, one tab per kind. In structures: the marks in contact (4 Å, from the 3D viewer's `bound` rows), those in contact
   through a neighbouring residue (`near`), the PDB interfaces (the viewer's `contacts`), the bound sequences around the
   contacted units and the runs of residues bound (`regions`). In living cells: residues crosslinked (single residues, never a
   peptide or its extent) and, as per-mark flags only, the marks inside an RNA-bound peptide or fragment. In vitro and in
   cells: JASPAR profiles, RNA Bind-n-Seq and eCLIP experiments. Everything is read from website.protein.nucleic and the
   tables it names (CONTRACTS.md, "RNA and DNA interactions"); a site without the block lacks the card, and so does a protein
   without data. A module of the site kit: registered through K.proteinFolds. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int, cap } = K;
  const NC = D.protein_view?.nucleic;
  if (!NC || !NC.kinds || !K.card || !K.prot?.tables) return;
  const KINDS = Object.keys(NC.kinds), TITLE = NC.title || 'RNA and DNA interactions';
  const SPECS = D.attribute_specs || {}, AT = D.mark_attributes || [];
  const ENTRY_URL = D.protein_view?.card?.evidence?.entries?.url || '';
  const UI = { kind: null, more: {} };
  let LAST = null;

  const fld = (part, name) => NC[part]?.fields?.[name];
  const get = (r, part, name) => { const c = fld(part, name); return c && typeof c === 'string' ? (r[c] ?? '') : ''; };
  const list = v => String(v ?? '').split(/;\s*/).filter(Boolean);
  const kindOf = (part, code) => { const m = NC[part]?.kinds; return m ? m[code] : code; };
  const word = k => NC.kinds[k] || k;
  const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + 's'}`;
  const rowsOf = (tb, part) => (NC[part] && K.card.has(NC[part].table) ? K.card.rows(tb, NC[part].table) : []);
  const forKind = (part, k) => (!NC[part]?.kind || NC[part].kind === k);

  // ---- what a protein has, for each kind ------------------------------------------------------------------------------
  function model(p, rec, tb) {
    const s3 = rec.s3d || {}, marks = (rec.marks || []).map(m => m[0]), out = {};
    const nearRows = rowsOf(tb, 'near'), regions = rowsOf(tb, 'regions'), xls = rowsOf(tb, 'crosslinks');
    const span = NC.crosslinks?.span ?? 5;
    for (const k of KINDS) {
      const direct = new Map(), near = new Map(), iface = new Map();
      for (const b of s3.b || []) if (b[3] === k) (direct.get(b[0]) || direct.set(b[0], []).get(b[0])).push({ entry: b[1], chain: b[2], type: b[4], name: b[5], win: b[9] });
      for (const r of nearRows) if (kindOf('near', r.kind) === k && !direct.has(r.position)) (near.get(r.position) || near.set(r.position, []).get(r.position)).push({ win: r.window, type: r.type, off: +r.offset || 0, n: +r.entries || 1, name: r.name });
      for (const c of s3.c || []) if (c[1] === k && !direct.has(c[0])) iface.set(c[0], [...new Set([...(iface.get(c[0]) || []), ...c[2]])]);
      const reg = regions.filter(r => kindOf('regions', get(r, 'regions', 'kind')) === k).map(r => ({ a: +get(r, 'regions', 'start'), b: +get(r, 'regions', 'end'), n: +get(r, 'regions', 'entries') || 0, sites: list(get(r, 'regions', 'sites')).map(x => x.split(':').pop()) })).sort((x, y) => x.a - y.a);
      const xl = [...new Set(xls.filter(r => r.start === r.end && kindOf('crosslinks', r.kind) === k).map(r => r.start))].sort((x, y) => x - y);
      const xlSites = marks.filter(q => xl.some(x => Math.abs(x - q) <= span));
      const fl = NC.flags && forKind('flags', k) ? flags(rec) : [];
      const sel = part => (NC[part] && forKind(part, k) ? rowsOf(tb, part) : []);
      out[k] = { direct, near, iface, reg, xl, xlSites, flags: fl, motifs: sel('motifs'), rbns: sel('rbns'), eclip: sel('eclip') };
      const m = out[k];
      m.any = !!(direct.size || near.size || iface.size || reg.length || xl.length || fl.length || m.motifs.length || m.rbns.length || m.eclip.length);
    }
    return out;
  }
  // per-mark flags only: the marks with one of the attribute's flagged values (never a peptide, a fragment or its extent)
  function flags(rec) {
    const F = NC.flags, i = AT.indexOf(F.attribute), sep = SPECS[F.attribute]?.separator || '; ';
    if (i < 0) return [];
    return (rec.marks || []).map(m => [m[0], [...new Set(String(m[3]?.[i] ?? '').split(sep).map(v => F.values[v]).filter(Boolean))]]).filter(x => x[1].length);
  }

  // ---- words ----------------------------------------------------------------------------------------------------------
  function evidenceText(m) {
    const parts = [], contact = m.direct.size, via = m.near.size;
    if (contact || via) parts.push((contact ? `${plural(contact, 'site')} in structural contact (side chain within 4 Å)` : '') + (via ? `${contact ? ', ' + int(via) + ' more' : plural(via, 'site')} ${NC.near?.label || 'in contact through a neighbouring residue'}` : '') + ' in structures');
    if (m.xl.length) parts.push(`${plural(m.xl.length, 'residue')} crosslinked in cells${m.xlSites.length ? ` (${plural(m.xlSites.length, 'site')} within ${NC.crosslinks?.span ?? 5} residues of one)` : ''}`);
    if (m.reg.length) parts.push(`${plural(m.reg.length, 'bound region')} in structures`);
    if (m.motifs.length) parts.push(plural(m.motifs.length, 'DNA-binding profile'));
    if (m.rbns.length) parts.push('RNA Bind-n-Seq');
    if (m.eclip.length) parts.push('eCLIP');
    return parts.join('; ') || 'none recorded';
  }
  const summary = M => KINDS.map(k => `${word(k)}: ${evidenceText(M[k])}`).join(' · ');

  // ---- pieces ---------------------------------------------------------------------------------------------------------
  const shown = (acc, q) => (K.prot.shownPos ? K.prot.shownPos(acc, q) : q);
  const resName = (p, rec, q) => `${(rec.seq || '')[q - 1] || ''}${shown(p.acc, q)}`;
  const siteLink = (p, rec, q) => `<a class="mono" href="${esc(K.link('protein', p.acc + '/' + q))}" title="Open the site card of ${esc(resName(p, rec, q))}">${esc(resName(p, rec, q))}</a>`;
  const entryBtn = (p, q, id) => `<a class="entry3d mono" href="${esc(ENTRY_URL.replace('{id}', encodeURIComponent(id)))}" target="_blank" rel="noopener" data-entry3d="${esc(id)}" data-acc="${esc(p.acc)}" data-pos="${q}" title="${esc(id.toUpperCase())}: show it in 3D at ${esc(String(q))}">${esc(id.toUpperCase())}</a>`;
  const win = w => `<span class="na-win">${String(w || '').replace(/\[([^\]])\]|(-)|([^[\]-])/g, (m0, hit, gap, ch) => (gap ? '<span class="gap">·</span>' : hit ? `<b class="nt hit">${esc(hit)}</b>` : `<span class="nt">${esc(ch)}</span>`))}</span>`;
  const rel = d => `i${d > 0 ? '+' : '−'}${Math.abs(d)}`;
  const link = (url, text, title) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ''}>${text}</a>` : text);
  const more = (key, items, n, render) => {
    const open = UI.more[key];
    return items.slice(0, open ? items.length : n).map(render).join('') + (items.length > n ? `<li><button type="button" class="linkish" data-prna-more="${esc(key)}">${open ? 'Show fewer' : `Show ${int(items.length - n)} more`}</button></li>` : '');
  };

  function structuresHtml(p, rec, k, m) {
    const sites = [...m.direct.keys()].sort((a, b) => a - b), via = [...m.near.keys()].sort((a, b) => a - b), onlyIf = [...m.iface.keys()].sort((a, b) => a - b);
    if (!sites.length && !via.length && !onlyIf.length) return '';
    const dirLi = q => {
      const rs = m.direct.get(q), by = new Map();
      rs.forEach(r => { const v = by.get(r.win) || by.set(r.win, { win: r.win, type: r.type, ids: new Set(), name: r.name }).get(r.win); v.ids.add(r.entry); });
      const ws = [...by.values()].sort((a, b) => b.ids.size - a.ids.size), top = ws[0], ids = [...new Set(rs.map(r => r.entry))];
      return `<li>${siteLink(p, rec, q)} <span class="tag t-a">in contact</span> ${win(top.win)} <span class="muted small" title="${esc(top.name || '')}">${top.type ? esc(top.type) + ' · ' : ''}${plural(ids.length, 'entry', 'entries')}${ws.length > 1 ? ` · ${plural(ws.length - 1, 'other sequence')}` : ''}</span> ` +
        `<span class="small">${ids.slice(0, 3).map(id => entryBtn(p, q, id)).join(', ')}${ids.length > 3 ? ` <span class="muted">+${ids.length - 3}</span>` : ''}</span></li>`;
    };
    const viaLi = q => {
      const rs = m.near.get(q).sort((a, b) => b.n - a.n), top = rs[0];
      return `<li>${siteLink(p, rec, q)} <span class="tag" title="${esc(`Touched by residue ${resName(p, rec, q + top.off)}, not by ${resName(p, rec, q)} itself`)}">via ${rel(top.off)}</span> ${win(top.win)} <span class="muted small" title="${esc(top.name || '')}">${top.type ? esc(top.type) + ' · ' : ''}${plural(top.n, 'entry', 'entries')}</span></li>`;
    };
    return `<section class="na-sec"><h4>${esc(cap(W.marks))} in contact with ${esc(word(k))} in structures</h4>` +
      `<ul class="sc-na">${more(k + 'd', sites, 8, dirLi)}${more(k + 'v', via, 6, viaLi)}</ul>` +
      (onlyIf.length ? `<p class="small">At an interface with ${esc(word(k))} in a PDB entry, but not within 4 Å in the entries analysed: ${onlyIf.map(q => `${siteLink(p, rec, q)}`).join(', ')}.</p>` : '') +
      '<p class="note small">Bound sequences are the chain around the contacted unit, contacted units in brackets; side chains within 4 Å of the nucleic acid in PDB entries. Open an entry to see it in the 3D viewer.</p></section>';
  }
  function regionsHtml(p, rec, k, m) {
    if (!m.reg.length) return '';
    return `<section class="na-sec"><h4>${esc(word(k))}-binding regions in structures</h4><ul class="sc-na">${more(k + 'r', m.reg, 8, r =>
      `<li><span class="mono">${esc(shown(p.acc, r.a))}${r.b !== r.a ? '–' + esc(shown(p.acc, r.b)) : ''}</span> <span class="muted small">${plural(r.n, 'entry', 'entries')}</span>` +
      `${r.sites.length ? ` <span class="small">${esc(cap(W.marks))}: ${r.sites.map(s => esc(s)).join(', ')}</span>` : ''}</li>`)}</ul>` +
      '<p class="note small">Runs of residues within 4 Å of the nucleic acid in at least one PDB entry.</p></section>';
  }
  function cellsHtml(p, rec, k, m) {
    if (!m.xl.length && !m.flags.length) return '';
    const span = NC.crosslinks?.span ?? 5;
    const xl = m.xl.length ? `<p>${plural(m.xl.length, 'residue')} crosslinked to ${esc(word(k))} in living cells${m.xlSites.length ? `, ${plural(m.xlSites.length, 'site')} within ${span} residues of one` : ''}.</p>` +
      `<p class="small">${m.xl.slice(0, UI.more[k + 'x'] ? m.xl.length : 40).map(q => `<span class="mono${m.xlSites.some(s => Math.abs(s - q) <= span) ? ' strong' : ''}">${esc(resName(p, rec, q))}</span>`).join(' ')}` +
      `${m.xl.length > 40 ? ` <button type="button" class="linkish" data-prna-more="${k}x">${UI.more[k + 'x'] ? 'Show fewer' : `Show ${int(m.xl.length - 40)} more`}</button>` : ''}</p>` : '';
    const fl = m.flags.length ? `<p class="flabel" title="${esc(NC.flags.help || '')}">${esc(NC.flags.label || `${cap(W.marks)} inside RNA-bound peptides or fragments`)}</p><p class="small">${m.flags.map(([q, v]) => `${siteLink(p, rec, q)} <span class="muted">${esc(v.join(', '))}</span>`).join(' · ')}</p>` : '';
    return `<section class="na-sec"><h4>${esc(word(k))} crosslinked in cells</h4>${xl}${fl}</section>`;
  }
  function motifsHtml(m, k) {
    if (!m.motifs.length) return '';
    return `<section class="na-sec"><h4>Preferred ${esc(word(k))}: binding profiles</h4><ul class="sc-na">${m.motifs.map(r => `<li>${link(String(NC.motifs.url || '').replace('{id}', encodeURIComponent(get(r, 'motifs', 'id'))), esc(get(r, 'motifs', 'name') || get(r, 'motifs', 'id')), get(r, 'motifs', 'id'))} <span class="mono">${esc(get(r, 'motifs', 'consensus'))}</span> <span class="muted small">${esc([get(r, 'motifs', 'class'), get(r, 'motifs', 'family')].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul></section>`;
  }
  function kmers(ks, sc) {
    const s = list(sc);
    return list(ks).slice(0, 8).map((x, i) => `<span class="tag mono"${s[i] ? ` title="${esc('enrichment ' + s[i])}"` : ''}>${esc(x)}</span>`).join(' ');
  }
  function rbnsHtml(m, k) {
    if (!m.rbns.length) return '';
    return `<section class="na-sec"><h4>Preferred ${esc(word(k))} in vitro (RNA Bind-n-Seq)</h4><ul class="sc-na">${m.rbns.map(r => `<li>${link(String(NC.rbns.url || '').replace('{id}', encodeURIComponent(get(r, 'rbns', 'id'))), esc(get(r, 'rbns', 'id')))} <span class="muted small">${esc(get(r, 'rbns', 'conc'))}</span> ${kmers(get(r, 'rbns', 'kmers'), get(r, 'rbns', 'scores'))}</li>`).join('')}</ul>` +
      '<p class="note small">The five-mers most enriched in the bound RNA; a sequence preference in vitro, not a binding site.</p></section>';
  }
  function eclipHtml(m, k) {
    if (!m.eclip.length) return '';
    const reg = NC.eclip.fields?.regions || {};
    const one = r => {
      const peaks = +get(r, 'eclip', 'peaks') || 0, parts = Object.entries(reg).map(([label, col]) => [label, +r[col] || 0]), tot = parts.reduce((s, x) => s + x[1], 0) || 1;
      const src = get(r, 'eclip', 'source'), id = get(r, 'eclip', 'id'), u = NC.eclip.url, url = typeof u === 'string' ? u : (u || {})[src] || '';
      const genes = list(get(r, 'eclip', 'genes')), gp = list(get(r, 'eclip', 'gene_peaks'));
      const top = parts.slice().sort((a, b) => b[1] - a[1])[0];
      return `<li><b>${esc(get(r, 'eclip', 'cell'))}</b> <span class="tag">${esc(src)}</span> ${link(url.replace('{id}', encodeURIComponent(id)), esc(id))} <span class="muted small">${int(peaks)} peaks${top && top[1] ? `, most in ${esc(top[0])}` : ''}</span>` +
        (parts.length ? `<div class="ec-bar" role="img" aria-label="${esc(parts.map(([l, n]) => `${l} ${n}`).join(', '))}">${parts.filter(x => x[1]).map(([l, n]) => `<i style="flex:${n}" title="${esc(`${l}: ${int(n)} peaks (${Math.round(100 * n / tot)}%)`)}"></i>`).join('')}</div>` : '') +
        (genes.length ? `<div class="small">${genes.slice(0, 10).map((g, i) => `<span class="tag" title="${esc((gp[i] ? gp[i] + ' peaks' : '') + ' in transcripts of ' + g)}">${esc(g)}</span>`).join(' ')}</div>` : '') +
        (get(r, 'eclip', 'kmers') ? `<div class="small">${kmers(get(r, 'eclip', 'kmers'), get(r, 'eclip', 'ratios'))}</div>` : '') +
        (get(r, 'eclip', 'same') ? `<div class="muted small">Same data as ${esc(get(r, 'eclip', 'same'))}.</div>` : '') + '</li>';
    };
    return `<section class="na-sec"><h4>${esc(word(k))} crosslinked in cells (eCLIP)</h4><ul class="sc-na ec-list">${m.eclip.map(one).join('')}</ul>` +
      '<p class="note small">Reproducible peaks by transcript region and the genes with most peaks; counts reflect how much of a transcript the cells make as well as binding. The five-mers are the most enriched in the top peaks against those of other proteins.</p></section>';
  }

  function bodyHtml(p, rec, M) {
    const k = M[UI.kind]?.any || !KINDS.some(x => M[x].any) ? UI.kind : KINDS.find(x => M[x].any);
    UI.kind = k;
    const tabs = `<div class="seg ix-tabs" role="tablist">${KINDS.map(x => `<button type="button" role="tab" data-prna-tab="${esc(x)}" aria-pressed="${x === k}" aria-selected="${x === k}" title="${esc(word(x) + ': ' + evidenceText(M[x]))}">${esc(word(x))}</button>`).join('')}</div>`;
    const m = M[k];
    return `<div class="card-head"><p class="sub">${esc(NC.sub || `${cap(KINDS.map(x => word(x)).join(' and '))} contacts of ${p.gene || p.acc}: ${W.marks} in structures and crosslinked in cells, bound sequences, and in vitro preference.`)}</p></div>` +
      tabs + `<div class="na-body">${[structuresHtml(p, rec, k, m), regionsHtml(p, rec, k, m), cellsHtml(p, rec, k, m), motifsHtml(m, k), rbnsHtml(m, k), eclipHtml(m, k)].join('') || `<p class="muted">No ${esc(word(k))} evidence.</p>`}</div>`;
  }

  // ---- the fold --------------------------------------------------------------------------------------------------------
  (K.proteinFolds ||= []).push((p, rec, fold) => {
    const tb = K.prot.tables(p.acc);
    if (!tb) return '';
    const M = model(p, rec, tb);
    if (!KINDS.some(k => M[k].any)) { LAST = null; return ''; }
    LAST = { p, rec, M };
    UI.kind ||= KINDS.find(k => M[k].any);
    return fold('p-na', esc(TITLE), esc(summary(M)), bodyHtml(p, rec, M), false);
  });
  const baseProt = K.sections.protein;
  if (baseProt) K.sections.protein = () => {
    const s = baseProt(), at = s.findIndex(x => x[0] === 'p-regions');
    if (document.getElementById('p-na')) s.splice(at < 0 ? s.length : at, 0, ['p-na', TITLE, 1]);
    return s;
  };
  const repaint = () => {
    const el = document.querySelector('#p-na .pfold-body'); if (!el || !LAST) return;
    el.innerHTML = bodyHtml(LAST.p, LAST.rec, LAST.M);
  };
  K.clicks.push(
    ['[data-prna-tab]', el => { UI.kind = el.dataset.prnaTab; repaint(); }],
    ['[data-prna-more]', el => { const k = el.dataset.prnaMore; UI.more[k] = !UI.more[k]; repaint(); }],
  );
});
