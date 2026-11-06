/* The Interactions view (classic and cards front ends) of a protein, site first: who binds each of its marks (the records of
   website.tables, grouped by what they show), then its partners and the complexes that hold it (the partner table, with the
   share of partners that carry the mark against the dataset's share of all proteins), then the writers and readers among its
   partners and the marks of its other partners that they bind. The network and the interface lists follow (kit-pnet.js).
   Reads website.protein.card.writer.partners (the partner table and its classes) and website.protein.card.records; knows no
   mark, class or organism by name. A module of the site kit: K.pix. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int, cap } = K;
  const CARD = D.protein_view?.card || {}, PT = CARD.writer?.partners || null;
  if (!PT || !K.card) return;
  const UI = { tab: 'partners', all: false, rows: matchMedia('(max-width: 700px)').matches ? 3 : 6 };
  const num = v => (v === '' || v == null || !isFinite(+v) ? null : +v);
  const pc = (k, n) => (n ? `${Math.round(100 * k / n)}%` : '–');
  const listed = a => !!(a && K.protState?.() && D.proteins.some(p => p[0] === a));
  const IDX = new Map((D.proteins || []).map(p => [p[0], p]));
  const isListed = a => IDX.has(a);
  const link = (acc, name) => (isListed(acc) ? `<a href="${esc(K.link('protein', acc))}"><b>${esc(name || acc)}</b></a>` : `<b title="${esc(acc || '')}">${esc(name || acc)}</b>`);
  const classWord = c => String((PT.classes || {})[c] || c).replace(/^an? /, '').replace(/\s+associated with \{gene\}$/, '').replace(/\{gene\}/g, '');

  // ---- the complexes the protein is in: the page table of the Interactions page, read once, when the tab is on --------------
  let CX = null, cxAsk = false;
  const cxLoad = () => {
    if (CX || cxAsk) return CX; cxAsk = true;
    let inl = null; try { inl = JSON.parse(document.getElementById('page-table-data')?.textContent || '{}').complexes; } catch (e) { inl = null; }
    (inl ? Promise.resolve(inl) : fetch('data/pages/complexes.json').then(r => (r.ok ? r.json() : null))).then(d => { CX = d || { rows: [] }; K.render(); }, () => { CX = { rows: [] }; K.render(); });
    return CX;
  };
  const complexesOf = acc => (cxLoad()?.rows || []).filter(r => (r[5] || []).includes(acc)).sort((a, b) => (a[2] === 'curated' ? 0 : 1) - (b[2] === 'curated' ? 0 : 1) || (num(a[7]) ?? 1) - (num(b[7]) ?? 1) || b[4] - a[4]);

  // ---- the reader and writer paths: a partner of a class, and the partners of this protein that it also binds ------------------
  const PATHS = {};                                  // acc -> [{ acc, name, cls, also: [names] }] or undefined while asked
  function askPaths(acc, parts) {
    if (acc in PATHS) return;
    PATHS[acc] = undefined;
    const cls = parts.filter(r => r.classes && (PT.classes || {})[r.classes]).slice(0, 8), mine = new Map(parts.map(r => [r.partner_accession, r.partner]));
    Promise.all(cls.map(r => K.card.load(r.partner_accession).then(tb => ({ r, tb })))).then(xs => {
      PATHS[acc] = xs.map(({ r, tb }) => ({ acc: r.partner_accession, name: r.partner, cls: r.classes, also: tb ? K.card.rows(tb, PT.table).filter(q => mine.has(q.partner_accession) && q.partner_accession !== acc && !(PT.classes || {})[q.classes]).map(q => [q.partner_accession, q.partner]) : [] }));
      fillPaths(acc);
    });
  }
  function fillPaths(acc) {
    const el = document.querySelector('[data-pix-paths]'); if (!el || el.dataset.pixPaths !== acc || !PATHS[acc]) return;
    const xs = PATHS[acc];
    el.innerHTML = xs.length ? `<ul class="pix-paths">${xs.map(x => `<li>${link(x.acc, x.name)} <span class="tag">${esc(classWord(x.cls))}</span> ${x.also.length ? `<span class="muted">also binds</span> ${x.also.slice(0, 8).map(([a, n]) => link(a, n)).join(', ')}${x.also.length > 8 ? ` <span class="muted">+${x.also.length - 8}</span>` : ''}` : '<span class="muted">binds none of the other partners that carry the mark</span>'}</li>`).join('')}</ul>` : '<p class="muted small">None of its partners is in a writer or reader class.</p>';
  }

  // ---- the view ---------------------------------------------------------------------------------------------------------
  function html(p, rec, tb) {
    if (!tb) return '<p class="muted small">Loading the interaction tables…</p>';
    const gene = p.gene || p.acc, parts = K.card.has(PT.table) ? K.card.rows(tb, PT.table).sort((a, b) => (num(b.score) || 0) - (num(a.score) || 0)) : [];
    const who = K.card.proteinRecords?.(p, tb, pos => K.prot.siteLabel(p.acc, pos), isListed);
    let out = '';
    // 1. who binds each mark
    if (who) out += `<section class="pix-sec"><h4>Who binds its ${esc(W.marks)}</h4>` + (who.n
      ? `<p class="sub">What the records at each ${esc(W.mark)} say, and with whom. ${int(who.n)} of ${int(rec.marks.length)} ${esc(W.marks)} have a protein partner on record.</p><div class="tbl-card"><table class="tbl compact stackable pix-who"><thead><tr><th>Site</th><th>What the records show</th><th class="num">Papers</th></tr></thead><tbody>${who.rows.slice(0, UI.all ? 999 : UI.rows).join('')}</tbody></table></div>` +
        (who.rows.length > UI.rows ? `<p><button type="button" class="linkish small" data-pix-all>${UI.all ? 'Fewer sites' : `All ${int(who.rows.length)} sites`}</button></p>` : '')
      : `<p class="muted small">No record names a protein partner at a ${esc(W.mark)} of ${esc(gene)}.</p>`) + '</section>';
    // 2. partners and complexes
    if (parts.length) {
      const marked = parts.filter(r => r.partner_marked === 'true').length, base = D.counts?.proteins && D.run?.snapshot?.entries ? D.counts.proteins / D.run.snapshot.entries : null;
      const cx = UI.tab === 'complexes' ? complexesOf(p.acc) : null, nCx = K.proteinAttr?.(p.acc, 'complexes');
      const tab = (id, label, n) => `<button type="button" role="tab" data-pix-tab="${id}" aria-pressed="${UI.tab === id}">${esc(label)} <span class="muted">${n == null ? '' : int(n)}</span></button>`;
      out += `<section class="pix-sec"><h4>Partners and complexes</h4><div class="seg" role="group" aria-label="Partners or complexes">${tab('partners', 'Partners', parts.length)}${tab('complexes', 'Complexes', nCx === '' || nCx == null ? null : +nCx)}</div>`;
      if (UI.tab === 'partners') {
        out += `<p class="pix-head"><b>${int(marked)} of ${int(parts.length)} partners (${pc(marked, parts.length)})</b> carry ${esc(W.marks)} themselves${base != null ? `, against ${pc(D.counts.proteins, D.run.snapshot.entries)} of the reviewed proteome` : ''}. <span class="muted small">STRING physical associations of the whole protein, score ${esc(String(D.partners?.min_score ?? 0.7))} or more.</span></p>` +
          `<div class="tbl-card"><table class="tbl compact pix-parts"><thead><tr><th>Partner</th><th class="num">STRING score</th><th>${esc(cap(W.marks))}</th><th>Class</th></tr></thead><tbody>` +
          parts.slice(0, UI.all ? 999 : UI.rows).map(r => `<tr><td>${link(r.partner_accession, r.partner)}</td><td class="num">${esc(num(r.score) != null ? num(r.score).toFixed(3) : '')}</td><td>${r.partner_marked === 'true' ? `<span class="yes" title="This partner has ${esc(W.marks)} in this dataset">${esc(W.marks)}</span>` : '<span class="muted">–</span>'}</td><td>${r.classes ? esc(classWord(r.classes)) : '<span class="muted">–</span>'}</td></tr>`).join('') +
          `</tbody></table></div>` + (parts.length > UI.rows ? `<p><button type="button" class="linkish small" data-pix-all>${UI.all ? 'Fewer partners' : `All ${int(parts.length)} partners`}</button></p>` : '');
      } else if (!cx) out += '<p class="muted small">Loading the complexes…</p>';
      else out += cx.length ? `<p class="pix-head"><b>${int(cx.length)} complex${cx.length === 1 ? '' : 'es'}</b> hold ${esc(gene)} and at least one other protein with ${esc(W.marks)}. <span class="muted small">Curated first, then predicted; q is the dataset’s test of the complex.</span></p><div class="tbl-card"><table class="tbl compact pix-cx"><thead><tr><th>Complex</th><th>Source</th><th class="num">Members</th><th>With ${esc(W.marks)}</th></tr></thead><tbody>` +
        cx.slice(0, UI.all ? 999 : 8).map(r => `<tr><td>${esc(r[1] || r[0])}</td><td>${esc((D.page_tables?.complexes?.columns?.[2]?.values || {})[r[2]] || r[2])}</td><td class="num">${int(r[3])}</td><td>${int(r[4])}<span class="muted small"> · ${(r[5] || []).filter(a => a !== p.acc).slice(0, 4).map(a => link(a, IDX.get(a)?.[1])).join(', ')}${(r[5] || []).length > 5 ? ' …' : ''}</span></td></tr>`).join('') + `</tbody></table></div>` + (cx.length > 8 ? `<p><button type="button" class="linkish small" data-pix-all>${UI.all ? 'Fewer' : `All ${int(cx.length)}`}</button></p>` : '')
        : `<p class="muted small">No complex of the sets used here holds ${esc(gene)} with another protein that carries ${esc(W.marks)}.</p>`;
      out += '</section>';
      // 3. writers and readers
      if (Object.keys(PT.classes || {}).length) { askPaths(p.acc, parts); out += `<section class="pix-sec"><h4>Writer and reader paths</h4><p class="sub">Partners of the protein that write or read the mark, and the other partners with ${esc(W.marks)} that each also binds.</p><div data-pix-paths="${esc(p.acc)}"><p class="muted small">Looking up their partners…</p></div></section>`; }
    }
    return out;
  }
  K.pix = { html, fillPaths: () => { const el = document.querySelector('[data-pix-paths]'); if (el) fillPaths(el.dataset.pixPaths); } };
  (K.afterRender ||= []).push(() => K.pix.fillPaths());
  K.clicks.push(['[data-pix-tab]', b => { UI.tab = b.dataset.pixTab; UI.all = false; K.render(); }]);
  K.clicks.push(['[data-pix-all]', () => { UI.all = !UI.all; const y = scrollY; K.render(); scrollTo(0, y); }]);
});
