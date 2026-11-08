/* Highlighting candidates in figures. Any chart that plots individual items (an IDR, a site, a protein) draws all of them in
   light gray as context and the highlighted ones on top in color, each with a ring; when few are highlighted (12 or fewer)
   each gets a direct label, placed so labels do not cover one another. The highlighted set comes from sources: the selection
   (a search or filters) and, where a module adds one, a pasted list. A legend line says what is highlighted and clears it,
   and a small table lists the highlighted items (gene, place, plotted value), on the page, in the figure's export and as TSV.
     K.hl.state()                     {on, prots: Set of protein indexes, marks: Set of mark indexes or null, text}
     K.hl.sources                     functions returning {prots, marks, text, clear} (or null): a module adds its own
     K.hl.line(n, noun)               the legend line (HTML) with its clear (×) button; '' when nothing is highlighted
     K.hl.place(items, box)           label positions: items [{x, y, r, t}] -> [{x, y, anchor, t}], greedy, without overlap
     K.hl.labels(P, placed)           the labels as SVG text with a halo of the background
     K.hl.limit                       the most items labeled directly (12)
   Nothing here changes a statistic: it only changes how a chart's dots are drawn. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { esc, int, S } = K;
  const LIMIT = 12;
  const sources = [];
  sources.push(() => {
    if (!K.sel?.active() || !K.sel.data()) return null;
    const c = K.sel.compute();
    return { prots: c.proteins || new Set(), marks: new Set(c.marks || []), text: K.sel.describe(), clear: () => { S.q = ''; S.f = {}; } };
  });
  // a pasted list (hl= in the link): genes, accessions or sites ("FUS R216"), one per comma, semicolon or line. It marks them in
  // the figures and narrows nothing: the page, its counts and its tests do not use it.
  const toks = () => String(S.hl || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  sources.push(() => {
    const t = toks(); if (!t.length) return null;
    const chips = t.map((label, i) => ({ label, drop: () => { const a = toks(); a.splice(i, 1); S.hl = a.join(', '); } })), clear = () => { S.hl = ''; };
    if (!K.sel?.data()) return { prots: new Set(), marks: new Set(), sites: [], notFound: [], text: t.join(', '), chips, clear, pasted: true };
    // each entry on its own: a gene marks its proteins, a site ("GENE R218") only that residue, and one that matches nothing
    // is reported (the others are kept)
    const prots = new Set(), marks = new Set(), sites = [], notFound = [], bad = new Set();
    t.forEach(tok => {
      const r = K.sel.select(tok, {}), q = r.q || {};
      (r.marks || []).forEach(m => marks.add(m));
      if (q.sites?.length && !q.genes?.length) q.sites.forEach(([p, pos]) => {
        if ((r.marks || []).length) { sites.push({ p, pos, label: tok }); return; }
        // a site the data does not hold: say which, and keep the rest of the list
        const L = ((/([A-Z])\s*\d+$/i.exec(tok) || [])[1] || '').toUpperCase(), pr = K.D?.proteins?.[p] || [];
        notFound.push(`${L}${pos} of ${pr[1] || pr[0] || tok} is ${pr[3] && pos > pr[3] ? 'not in its sequence' : `not a known ${K.D?.words?.mark || 'site'}`}`); bad.add(tok);
      });
      else if (r.proteins?.size) r.proteins.forEach(p => prots.add(p));
      else { notFound.push(tok); bad.add(tok); }
    });
    return { prots, marks, sites, notFound, bad, text: t.join(', '), chips, clear, pasted: true };
  });
  K.paramsOut.push(p => { if (S.hl) p.set('hl', S.hl); });
  K.paramsIn.push(p => { S.hl = p.get('hl') || ''; });
  function state() {
    const out = { on: false, prots: new Set(), marks: new Set(), sites: [], notFound: [], text: '', parts: [] };
    sources.forEach(f => { const r = f(); if (!r) return; out.on = true; (r.sites || []).forEach(x => out.sites.push(x)); (r.notFound || []).forEach(x => out.notFound.push(x)); r.prots.forEach(p => out.prots.add(p)); (r.marks || []).forEach(m => out.marks.add(m)); if (r.text) out.text += (out.text ? '; ' : '') + r.text; out.parts.push(r); });
    return out;
  }
  const clear = () => { state().parts.forEach(r => r.clear && r.clear()); K.writeHash(true); K.render(); };
  // "Highlighted only": exports draw just the highlighted items, without the gray context (kept for the session, per viewer)
  const KEY = 'ptmc-hl-only';
  const store = { get: () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }, set: v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* private window: kept for the page only */ } } };
  let only = store.get();
  // the not-found entries: names as a list ("not found: A, B"), sites as the sentence that says what is wrong with them
  const nfText = list => { const w = list.filter(x => !/ is (not|in) /.test(x)), sn = list.filter(x => w.indexOf(x) < 0); return [w.length ? `not found: ${w.join(', ')}` : '', ...sn].filter(Boolean).join('; '); };
  const chip = (label, i, bad) => `<span class="hl-chip${bad ? ' hl-chip-nf' : ''}"${bad ? ' title="Not found in the data"' : ''}>${esc(label)} <button type="button" class="hl-x" data-hl-drop="${i}" aria-label="Remove ${esc(label)} from the highlight" title="Remove it">×</button></span>`;
  // the legend line: what is highlighted, how many items, and the control that clears it
  const line = (n, noun, extra = '', over = null) => {
    const st = over || state(); if (!st.on) return '';
    const what = st.parts.map(r => (r.chips ? (document.getElementById?.('hl-bar') ? '' : r.chips.map((c, i) => chip(c.label, i)).join(' ')) : `<b>${esc(r.text)}</b> <button type="button" class="hl-x" data-hl-clear aria-label="Clear the highlight" title="Clear the highlight">×</button>`)).join(' ');
    const what0 = st.parts.some(r => r.pasted) ? 'Highlighted:' : (S.q ? 'Search:' : 'Selection:');
    return `<p class="hl-line"><span class="flabel">${what0}</span> ${what.trim() || '<span class="muted">your list, in the box above</span>'} <span class="muted">· ${int(n)} ${esc(noun)}</span>${st.notFound.length ? ` <span class="hl-nf">· ${esc(nfText(st.notFound))}</span>` : ''}${extra ? ` <span class="muted">· ${extra}</span>` : ''} <label class="hl-only small" title="The PNG, SVG and PDF show only the highlighted items, without the gray context"><input type="checkbox" data-hl-only${only ? ' checked' : ''}> Exports: highlighted only</label></p>`;
  };
  // named lists of genes or sites, kept in this browser (like the saved selections); the link carries only the active list (hl=)
  const SK = `ptmc-hl-sets-${K.D?.site?.id || "site"}`;
  const sets = () => { try { const v = JSON.parse(localStorage.getItem(SK) || '[]'); return Array.isArray(v) ? v.filter(x => x && x.name && typeof x.list === 'string') : []; } catch (e) { return []; } };
  const keep = list => { try { localStorage.setItem(SK, JSON.stringify(list.slice(0, 60))); } catch (e) { /* storage blocked: the list lives for this page only */ } };
  const norm = s => String(s || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).join(', ');
  const activeSet = () => sets().find(x => norm(x.list) === norm(S.hl) && norm(S.hl));
  // the "Lists" menu: the saved lists, Save as, Rename, Delete and "Highlighted first in tables"; shown when there is a list or a saved one
  const menuHtml = () => {
    const all = sets(), have = !!norm(S.hl), ci = have ? all.findIndex(x => norm(x.list) === norm(S.hl)) : -1, cur = ci >= 0 ? all[ci] : null;
    if (!all.length && !have) return '';
    return `<span class="hl-menu"><button type="button" class="btn small" data-hl-menu aria-haspopup="true" aria-expanded="false" aria-controls="hl-pop">Lists ▾</button>` +
      `<div id="hl-pop" class="hl-pop" role="group" aria-label="Highlight lists" hidden><div class="hl-sets"><label class="flabel" for="hl-set">Saved lists</label> <select id="hl-set" data-hl-switch aria-label="Switch to a saved highlight list"><option value=""${cur ? '' : ' selected'}>${have && !cur ? '(unsaved list)' : '(none)'}</option>${all.map((x, i) => `<option value="${i}"${i === ci ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` +
      `<div class="hl-sets"><button type="button" class="btn small" data-hl-save${have ? '' : ' disabled'} title="Save the highlighted list under a name, in this browser">Save as…</button>` +
      `<button type="button" class="btn small" data-hl-rename${cur ? '' : ' disabled'}>Rename</button><button type="button" class="btn small" data-hl-delete${cur ? '' : ' disabled'}>Delete</button></div>` +
      `<label class="small"><input type="checkbox" data-hl-first${first ? ' checked' : ''}> Highlighted first in tables</label></div></span>`;
  };
  const setsAct = {
    save: () => { const cur = activeSet(), name = (window.prompt('Name this list of highlighted genes or sites', cur ? cur.name : '') || '').trim(); if (!name || !norm(S.hl)) return; keep([{ name, list: norm(S.hl) }, ...sets().filter(x => x.name !== name)]); K.render(); },
    rename: () => { const cur = activeSet(); if (!cur) return; const name = (window.prompt('Rename this list', cur.name) || '').trim(); if (!name || name === cur.name) return; keep(sets().map(x => (x === cur || (x.name === cur.name && x.list === cur.list) ? { ...x, name } : x)).filter((x, i, a) => a.findIndex(y => y.name === x.name) === i)); K.render(); },
    delete: () => { const cur = activeSet(); if (!cur) return; if (window.confirm && !window.confirm(`Delete the list "${cur.name}"? The highlight on the page stays.`)) return; keep(sets().filter(x => !(x.name === cur.name && x.list === cur.list))); K.render(); },
  };
  // the box to paste genes or sites into: added to the highlight, nothing is filtered
  const control = (after = '') => `<form class="hl-form" data-hl-form><label class="flabel hl-lab" for="hl-in">Highlight genes or sites</label><input id="hl-in" name="hl" type="search" autocomplete="off" spellcheck="false" placeholder="Highlight genes or sites…" title="Genes or sites to mark in the figures and tables, e.g. FUS, TDP-43, HNRNPA1 R218" aria-label="Genes or sites to highlight"> <button class="btn small" type="submit">Highlight</button></form>${after}${menuHtml()}`;
  // labels placed greedily: the candidates around a dot in order, the first that fits the box and clears the others
  // avoid: boxes [x0, y0, x1, y1] that labels must also clear (a chart's own text, such as region names)
  function place(items, box = [0, 760, 0, 400], size = 10, avoid = []) {
    const taken = [...items.map(i => [i.x - i.r - 1, i.y - i.r - 1, i.x + i.r + 1, i.y + i.r + 1])], out = [], fixed = avoid.length;
    taken.push(...avoid);
    const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    items.forEach(it => {
      const w = K.tw(it.t, size) + 2, h = size + 2, g = it.r + 3;
      const cand = [[g, h / 3, 'start'], [-g, h / 3, 'end'], [0, -g - 1, 'middle'], [0, g + h - 2, 'middle'], [g, -g + 2, 'start'], [-g, -g + 2, 'end'], [g, g + h - 4, 'start'], [-g, g + h - 4, 'end'],
        [g + 14, h / 3, 'start'], [-g - 14, h / 3, 'end'], [0, -g - 14, 'middle'], [0, g + h + 10, 'middle']];
      for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7]) cand.push([g + 12, h / 3 + d * h, 'start'], [-g - 12, h / 3 + d * h, 'end']);   // a crowd: stacked beside the dots
      const boxOf = ([dx, dy, a]) => { const x = it.x + dx, x0 = a === 'start' ? x : a === 'end' ? x - w : x - w / 2; return [x0, it.y + dy - h + 2, x0 + w, it.y + dy + 2]; };
      const ok = c => { const b = boxOf(c); return b[0] >= box[0] && b[2] <= box[1] && b[1] >= box[2] && b[3] <= box[3] && !taken.some((t, k) => hit(b, t) && k !== items.indexOf(it)) && !out.some(o => hit(b, o.box)); };
      const pick = cand.find(ok) || cand[0], b = boxOf(pick);
      out.push({ x: it.x + pick[0], y: it.y + pick[1], anchor: pick[2], t: it.t, box: b }); taken.push(b);
    });
    return out;
  }
  const labels = (P, placed, size = 10) => placed.map(o => {
    const a = `x="${o.x.toFixed(1)}" y="${o.y.toFixed(1)}" font-size="${size}" font-weight="700" text-anchor="${o.anchor}"`;
    return `<text ${a} stroke="${P.bg}" stroke-width="3.5" stroke-linejoin="round" fill="${P.bg}">${esc(o.t)}</text><text ${a} fill="${P.ink}">${esc(o.t)}</text>`;
  }).join('');
  // the pasted list alone (not the selection): what the tables, protein pages and tiles mark. prots: protein indexes, marks:
  // mark indexes, sites: [{p, pos}]
  let pc = { key: null, v: null };
  const pasted = () => {
    const key = `${S.hl || ''}|${K.sel?.peek() ? 1 : 0}`;
    if (pc.key !== key) pc = { key, v: sources[1]() || { prots: new Set(), marks: new Set(), sites: [], notFound: [], bad: new Set(), text: '' } };
    return pc.v;
  };
  // a row's mark: highlighted by the pasted list (a protein by its index; a site by its protein and position or mark index)
  const isProt = pi => { const p = pasted(); return p.prots.has(pi) || p.sites.some(x => x.p === pi); };
  // onlySite: just a site named in the list ("FUS R216"), not every site of a highlighted protein
  const isSite = (pi, pos, onlySite) => { const p = pasted(); return (!onlySite && p.prots.has(pi)) || p.sites.some(x => x.p === pi && x.pos === pos); };
  // "Highlighted first": the rows the list marks go first, the rest keep their order (only when the reader chose it)
  const firstSort = (rows, test) => (first && any() ? [...rows.filter(test), ...rows.filter(r => !test(r))] : rows);
  // the page's own rows and links, marked after it is drawn: a table row whose protein (or site) is highlighted is tinted and
  // gets a marker; a protein's link elsewhere (a tile's gene chip, a list) gets the highlight style. Nothing is filtered.
  const protLink = a => {      // #protein/GENE/ACC or #protein/ACC, then /POS for a site: [protein index, position or null]
    const m = /#protein\/([^?#]+)/.exec(a.getAttribute('href') || ''); if (!m) return null;
    const seg = m[1].split('/').map(decodeURIComponent), k = seg.findIndex(x => K.sel?.byAcc?.[x]);
    return k < 0 ? null : [K.sel.byAcc[seg[k]].i, /^[A-Z]?\d+$/i.test(seg[k + 1] || '') ? +seg[k + 1].replace(/\D/g, '') : null];
  };
  function decorate() {
    if (!any() || !K.sel?.peek()) return;
    const root = document.getElementById('view'); if (!root) return;
    const tint = (tr, td) => { if (tr.classList.contains('hl-row')) return; tr.classList.add('hl-row'); const c0 = td || tr.cells[0], c = c0 && (c0.querySelector(':scope > .cv') || c0); if (c && !c0.querySelector('.hl-dot')) c.insertAdjacentHTML('afterbegin', '<span class="hl-dot" title="Highlighted" aria-label="highlighted">●</span> '); };
    root.querySelectorAll('tbody tr[data-acc]').forEach(tr => { const p = K.sel.byAcc[tr.dataset.acc]; if (p && isProt(p.i)) tint(tr); });
    root.querySelectorAll('tbody tr[data-goto]').forEach(tr => { const [a, pos] = tr.dataset.goto.split('/'), p = K.sel.byAcc[a]; if (p && isSite(p.i, +pos)) tint(tr); });
    const loose = new Set();      // other tables (the interaction pages'): their highlighted rows go first when the reader chose that
    root.querySelectorAll('a[href*="#protein/"]').forEach(a => {
      if (a.closest('.crumb, nav, .tabs, h1, h2, h3, #hl-bar, .fr-nav, .hl-row')) return;
      const r = protLink(a); if (!r) return;
      const on = r[1] == null ? isProt(r[0]) : isSite(r[0], r[1]), tr = a.closest('tbody tr');
      if (!on) return;
      if (tr && !tr.dataset.acc && !tr.dataset.goto) { tint(tr, a.closest('td')); loose.add(tr.parentElement); }
      else if (!tr) a.classList.add('hl-gene');
    });
    if (first) loose.forEach(tb => { if (!tb.dataset.hlFirst) { tb.dataset.hlFirst = '1'; [...tb.rows].filter(r => r.classList.contains('hl-row')).reverse().forEach(r => tb.prepend(r)); } });
  }
  (K.afterRender ||= []).push(decorate);
  const any = () => toks().length > 0;
  K.hl = { nfText, isProt, isSite, any, firstSort, decorate, mark: (v, on) => (on ? `<span class="hl-dot" title="Highlighted" aria-label="highlighted">●</span> ${v}` : v), get first() { return first; }, pasted, state, sources, line, place, labels, clear, control, sets, activeSet, limit: LIMIT, get only() { return only; } };
  document.addEventListener('change', e => { if (e.target.matches?.('[data-hl-only]')) { only = e.target.checked; store.set(only); document.querySelectorAll('[data-hl-only]').forEach(x => { x.checked = only; }); } });
  K.clicks.push(['[data-hl-save]', setsAct.save], ['[data-hl-rename]', setsAct.rename], ['[data-hl-delete]', setsAct.delete]);
  document.addEventListener('change', e => { const s = e.target.matches?.('[data-hl-switch]') && e.target; if (!s) return; const x = s.value === '' ? null : sets()[+s.value]; S.hl = x ? x.list : ''; K.writeHash(true); K.render(); });
  K.clicks.push(['[data-hl-drop]', el => { const a = toks(); a.splice(+el.dataset.hlDrop, 1); S.hl = a.join(', '); K.writeHash(true); K.render(); }]);
  // the one Highlight box, in the toolbar under the selection bar, on every page: the list's chips, what was not found, and
  // "Highlighted first" for the tables (a choice kept in this browser)
  const FK = 'ptmc-hl-first';
  let first = (() => { try { return localStorage.getItem(FK) === '1'; } catch (e) { return false; } })();
  document.addEventListener('change', e => { if (e.target.matches?.('[data-hl-first]')) { first = e.target.checked; try { localStorage.setItem(FK, first ? '1' : '0'); } catch (x) { /* kept for the page only */ } K.render(); } });
  let barKey = null;
  function bar() {
    const host = document.getElementById('hl-bar'); if (!host) return;
    const t = toks(), pa = t.length ? pasted() : null;
    const chips = t.map((l, i) => chip(l, i, pa.bad?.has(l))).join(' '), nf = t.length && pa.notFound.length ? `<span class="hl-nf">${esc(nfText(pa.notFound))}</span>` : '';
    const more = collapsed => (!t.length ? '' : collapsed
      ? `<span class="hl-menu"><button type="button" class="btn small" data-hl-menu aria-haspopup="true" aria-expanded="false" aria-controls="hl-cpop">${t.length} highlighted${pa.notFound.length ? ` · ${pa.notFound.length} not found` : ''} ▾</button><div id="hl-cpop" class="hl-pop hl-cpop" role="group" aria-label="Highlighted items" hidden><span class="hl-chips">${chips}</span>${nf}</div></span>`
      : `<span class="hl-chips">${chips}${nf ? ' ' + nf : ''}</span>`);
    const build = collapsed => `<div class="hl-bar-in${t.length ? ' on' : ''}">${control(more(collapsed))}</div>`;
    const key = build(false) + '|' + (K.sel?.peek() ? 1 : 0) + '|' + (typeof innerWidth === 'number' ? innerWidth : 0);
    if (key === barKey) return; barKey = key;
    // the row stays one line: when the chips would wrap, they collapse into "N highlighted ▾"
    host.innerHTML = build(false);
    const inner = host.firstElementChild, one = host.querySelector('.hl-form')?.offsetHeight || 0;
    if (t.length && inner.offsetHeight > one * 1.6 + 4) host.innerHTML = build(true);
  }
  if (typeof addEventListener === 'function') addEventListener('resize', () => { barKey = null; bar(); });
  (K.afterRender ||= []).push(bar);
  const shut = (focus) => { const b = document.querySelector('[data-hl-menu][aria-expanded="true"]'); if (!b) return; b.setAttribute('aria-expanded', 'false'); const pop = document.getElementById(b.getAttribute('aria-controls')); if (pop) pop.hidden = true; if (focus) b.focus(); };
  K.clicks.push(['[data-hl-menu]', el => { const open = el.getAttribute('aria-expanded') !== 'true'; shut(false); if (open) { el.setAttribute('aria-expanded', 'true'); document.getElementById(el.getAttribute('aria-controls')).hidden = false; } }]);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') shut(true); });
  document.addEventListener('click', e => { if (!e.target.closest?.('.hl-menu')) shut(false); });
  document.addEventListener('submit', e => {
    const f = e.target.closest?.('[data-hl-form]'); if (!f) return;
    e.preventDefault(); const v = String(new FormData(f).get('hl') || '').trim(); if (!v) return;
    S.hl = [...toks(), ...v.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean)].join(', '); K.writeHash(true); K.render();
  });
  K.clicks.push(['[data-hl-clear]', () => clear()]);
  const css = document.createElement('style');
  css.textContent = `.hl-line { margin: 0.35rem 0; font-size: 0.85rem; display: flex; gap: 0.4rem; align-items: baseline; flex-wrap: wrap; }
.hl-x { border: 1px solid var(--line-strong); border-radius: 50%; width: 1.35rem; height: 1.35rem; line-height: 1; padding: 0; cursor: pointer; color: var(--muted); }
.hl-x:hover { color: var(--ink); border-color: var(--ink); }
.hl-form { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; margin: 0.4rem 0; }
.hl-form input { flex: 1 1 18rem; min-width: 10rem; }
.hl-chip { border: 1px solid var(--line-strong); border-radius: 1rem; padding: 0 0.15rem 0 0.55rem; display: inline-flex; align-items: center; gap: 0.25rem; }
.hl-sets { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; margin: 0.3rem 0; }
.hl-bar-in { display: flex; flex-wrap: wrap; align-items: center; gap: 0.1rem 0.6rem; font-size: 0.82rem; }
.hl-bar-in .hl-form { margin: 0.1rem 0; flex: 0 1 auto; flex-wrap: nowrap; }
.hl-form input { padding: 0.35rem 0.6rem; border: 1px solid var(--line-strong); border-radius: 0.4rem; background: var(--surface); color: var(--ink); }
.hl-form input:focus { outline: none; border-color: var(--brand-ink); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-ink) 22%, transparent); }
.hl-bar-in .hl-form input { flex: 0 1 auto; width: min(24rem, 62vw); min-height: 1.7rem; }
.hl-pop .btn:disabled { opacity: 0.45; cursor: not-allowed; }
.hl-chip-nf { color: var(--muted); text-decoration: line-through; border-style: dashed; }
.hl-chip-nf .hl-x { text-decoration: none; }
.hl-cpop:not([hidden]) { max-width: min(30rem, calc(100vw - 2rem)); }
.hl-lab { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.hl-menu { position: relative; }
.hl-pop:not([hidden]) { display: flex; flex-direction: column; gap: 0.4rem; position: absolute; z-index: 40; left: 0; max-width: calc(100vw - 2rem); top: 100%; margin-top: 0.2rem; min-width: 15rem; padding: 0.6rem; border: 1px solid var(--line-strong); border-radius: 0.5rem; background: var(--surface); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15); }
.hl-pop .hl-sets { margin: 0; }
.hl-bar:empty { display: none; }
.hl-chips { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
tr.hl-row > td { box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--accent) 11%, transparent); }
tr.hl-row > td:first-child { box-shadow: inset 3px 0 0 var(--accent), inset 0 0 0 999px color-mix(in srgb, var(--accent) 11%, transparent); }
.hl-gene { box-shadow: 0 0 0 1.5px var(--accent), inset 0 0 0 999px color-mix(in srgb, var(--accent) 16%, transparent); border-radius: 0.3rem; }
.hl-dot { color: var(--accent); font-weight: 700; }
.hl-nf { color: var(--accent); font-weight: 600; }
.hl-tbl { margin-top: 0.4rem; }
.hl-tbl td, .hl-tbl th { padding: 0.15rem 0.5rem; }`;
  document.head.appendChild(css);
});
