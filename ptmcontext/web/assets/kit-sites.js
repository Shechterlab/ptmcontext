/* Sites: every mark of the selection in one table, as the Methylarginine Site Explorer's Sites page. Each row is a
   mark: its protein, its position, its attributes (a state as a coloured pill; the studies that report it, each linked
   to its paper), the 15 residues around it with its motifs, and its class in each question. Quick filters for the
   attributes the site colours by sit above the table; a header sorts; a row opens the mark's card on its protein's
   page. The download is the whole selection, every column, under the kit's # lines. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  if (!D.proteins || !D.proteins.length) return;
  const SPECS = D.attribute_specs || {};
  const T = { sort: 'protein', desc: false, n: 100 };
  const SD = () => K.sel.data();
  const AN = () => SD().analyses, AT = () => Object.keys(SD().attributes);
  const pr = i => D.proteins[i];
  const classLabel = (aid, codes) => codes.map(c => K.sel.classLabel(aid, SD().classes[aid][c])).join(', ');
  const vals = (m, name) => { const ti = AT().indexOf(name); return ti < 0 ? [] : m[3][ti].map(c => SD().attributes[name][c]); };
  function attrCell(m, name, full) {
    const s = SPECS[name] || {}, v = vals(m, name);
    if (s.colour && s.kind === 'category') return `<span class="state-pill" style="--c:${K.map.attrColour(name, v[0] ?? '')};--t:${K.map.textOn(K.map.attrColour(name, v[0] ?? ''))}">${esc(K.sel.valueLabel(name, v[0] ?? ''))}</span>`;
    if (s.kind === 'list') {
      const links = SD().attribute_links?.[name] || {};
      return K.sel.listHtml(name, v, v.map(x => links[x]), pr(m[0])[0], full);
    }
    return esc(v.map(x => K.sel.valueLabel(name, x)).join(', '));
  }
  const winHtml = w => { const c = Math.floor(w.length / 2); return `<span class="win">${esc(w.slice(0, c))}<b>${esc(w[c])}</b>${esc(w.slice(c + 1))}</span>`; };
  // the questions shown as columns: those a site file names (website.sites.columns), else its first residue question
  // with classes; questions whose residues carry several flags (motifs) show as tags beside the window
  const tagAids = () => AN().filter(a => A[a]?.shape === 'flags');
  const ctxAids = () => { const named = (D.sites_view?.columns || []).filter(a => AN().includes(a)); return named.length ? named : AN().filter(a => A[a]?.shape === 'class').slice(0, 1); };
  // the columns: protein, site, then the attributes the site file colours by or links, the window, the context
  function columns() {
    const attrCols = Object.keys(SPECS).filter(n => SPECS[n].colour || (SPECS[n].kind === 'list' && SPECS[n].link));
    return [
      ['protein', 'Protein', m => pr(m[0])[1] || pr(m[0])[0], m => `<a href="#protein/${esc(pr(m[0])[0])}"><b>${esc(pr(m[0])[1] || '–')}</b></a> <span class="muted mono">${esc(pr(m[0])[0])}</span>`],
      ['site', 'Site', m => m[1], m => `<a class="mono" href="#protein/${esc(pr(m[0])[0])}/${m[1]}"><b>${esc((m[4] || '')[7] || '')}${m[1]}</b></a>`],
      ...attrCols.map(n => [`a:${n}`, SPECS[n].label, m => (SPECS[n].kind === 'list' ? vals(m, n).length : vals(m, n).join()), m => attrCell(m, n, false)]),
      ['window', `Window ±7${tagAids().length ? ' · ' + tagAids().map(a => (A[a]?.title || a).toLowerCase()).join(', ') : ''}`, m => m[4], m => `<span class="mono">${winHtml(m[4] || '')}</span>${tagAids().map(a => ` <span class="tags">${m[2][AN().indexOf(a)].map(c => `<span class="tag" title="${esc((A[a]?.help || {})[SD().classes[a][c]] || '')}">${esc(K.sel.classLabel(a, SD().classes[a][c]))}</span>`).join('')}</span>`).join('')}`],
      ...ctxAids().map(aid => [`ctx:${aid}`, A[aid]?.title || aid, m => classLabel(aid, m[2][AN().indexOf(aid)]), m => esc(classLabel(aid, m[2][AN().indexOf(aid)]))]),
    ];
  }
  function rows() {
    const c = K.sel.compute(), idx = c.active ? c.marks : SD().marks.map((_, i) => i);
    const col = columns().find(x => x[0] === T.sort) || columns()[0];
    const out = idx.map(i => SD().marks[i]);
    out.sort((x, y) => { const a = col[2](x), b = col[2](y); const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? '')) || x[1] - y[1]; return T.desc ? -r : r; });
    return out;
  }
  // quick filters: the attributes the site colours by, with their counts in the selection
  function quick() {
    const c = K.sel.compute(), idx = c.active ? c.marks : SD().marks.map((_, i) => i);
    return Object.keys(SPECS).filter(n => SPECS[n].colour && SPECS[n].kind === 'category').map(n => {
      const ti = AT().indexOf(n), counts = {}; idx.forEach(i => SD().marks[i][3][ti].forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
      const on = new Set(S.f['t:' + n] || []), order = Object.keys(SPECS[n].values || {});
      const vs = SD().attributes[n].map((v, k) => [v, counts[k] || 0]).sort((x, y) => (order.indexOf(x[0]) + 1 || 99) - (order.indexOf(y[0]) + 1 || 99));
      return `<div class="quick"><span class="flabel">${esc(SPECS[n].label)}</span><button type="button" class="fchip" data-f-all="t:${esc(n)}" aria-pressed="${!on.size}">All</button>` +
        vs.map(([v, k]) => `<button type="button" class="fchip" data-f="t:${esc(n)}" data-v="${esc(v)}" aria-pressed="${on.has(v)}">${esc(K.sel.valueLabel(n, v))} <span class="muted">${int(k)}</span></button>`).join('') + '</div>';
    }).join('');
  }
  function view() {
    if (!SD()) return `<div class="page-head"><h2>${esc(cap(W.marks))}</h2></div><p class="muted">Loading the ${esc(W.marks)}…</p>`;
    const rs = rows(), shown = rs.slice(0, T.n), cols = columns(), np = new Set(rs.map(m => m[0])).size;
    return `<div class="page-head"><h2>${esc(cap(W.marks))}: ${int(rs.length)} of ${int(SD().marks.length)} on ${int(np)} protein${np === 1 ? '' : 's'}</h2>${K.expBar(['tsv'], 'sites-exp', 'the sites')}</div>` +
      `<p class="page-sub">Every ${esc(W.mark)}${K.sel.active() ? ' of your selection' : ''}: its protein, its attributes and where each comes from, the 15 residues around it and its context. A row opens its card on the protein’s page; a header sorts.</p>` +
      quick() +
      `<div class="tbl-card"><table class="tbl sites-tbl"><thead><tr>${cols.map(([k, t]) => `<th data-ssort="${esc(k)}" tabindex="0"${T.sort === k ? ` aria-sort="${T.desc ? 'descending' : 'ascending'}"` : ''}>${esc(t)}${T.sort === k ? (T.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>` +
      shown.map(m => `<tr data-goto="${esc(pr(m[0])[0])}/${m[1]}" tabindex="0">${cols.map(c => `<td class="wrapok">${c[3](m)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>' +
      (rs.length > T.n ? `<p><button class="linkish" type="button" data-smore>Show ${int(Math.min(100, rs.length - T.n))} more</button></p>` : '');
  }
  function tsv() {
    const rs = rows(), an = AN(), at = AT();
    const head = ['accession', 'gene', 'position', 'window_15', ...an, ...at];
    return K.preamble(`${W.marks}${K.sel.active() ? ' (selection)' : ''}`, `every ${W.mark}${K.sel.active() ? ' of the selection (' + rs.length + ')' : ''}: its protein, position, the 15 residues around it, its class in each question and its attributes (marks.attributes of the site file).`) +
      head.join('\t') + '\n' + rs.map(m => [pr(m[0])[0], pr(m[0])[1], m[1], m[4], ...an.map((a, k) => m[2][k].map(c => SD().classes[a][c]).join(';')), ...at.map(n => vals(m, n).join('; '))].join('\t')).join('\n') + '\n';
  }
  K.views.sites = { render: view, title: () => cap(W.marks) };
  K.tabs.push(() => ['sites', 'Sites', K.sel?.active() ? K.sel.nMarks() : D.counts.marks]);
  K.sections.sites = () => [];
  K.clicks.push(
    ['[data-ssort]', el => { const k = el.dataset.ssort; T.desc = T.sort === k ? !T.desc : false; T.sort = k; K.render(); }],
    ['[data-smore]', () => { T.n += 100; K.render(); }],
    ['[data-f-all]', el => { delete S.f[el.dataset.fAll]; K.writeHash(true); K.render(); }],
    ['[data-sites-exp]', el => K.exportFigure('tsv', null, `${D.site.id}_sites${K.sel.active() ? '_selection' : ''}`, el, tsv)],
    ['tr[data-goto]', (el, e) => { if (!e.target.closest('a')) K.go('protein', { arg: el.dataset.goto }); }],
  );
  document.addEventListener('keydown', e => { const tr = e.target.closest?.('tr[data-goto]'); if (tr && !e.target.closest('a') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); K.go('protein', { arg: tr.dataset.goto }); } });
});
