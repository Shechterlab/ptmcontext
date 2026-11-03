/* Columns: a table's optional columns, chosen in a "Columns" menu and remembered per table in the browser (as the
   Methylarginine Site Explorer's colMenu). Any table can use it: a column is {id, label, menu?, fixed?}; fixed columns
   always show and are not in the menu; the others show when chosen, the table's defaults at first. A default column
   added after a reader saved a choice shows once, then is remembered like the rest. A module of the site kit:
   K.columns.menu(table, cols, defaults) is the menu's HTML, K.columns.on(table, cols, defaults) the ids shown,
   K.columns.reset(table) forgets the choice; K.columns.redraw[table] (optional) redraws after a change (else the page). */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { esc } = K;
  const KEY = t => 'ptmc-cols-' + t, KNOWN = t => 'ptmc-cols-known-' + t;
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be blocked */ } };
  const state = {}, defs = {}, open = new Set();
  // Density of the tables: compact (one line a row; the default) or comfortable (wrapped chips); remembered in the browser.
  const DK = 'ptmc-density';
  let dens = 'compact';
  try { if (localStorage.getItem(DK) === 'comfortable') dens = 'comfortable'; } catch (e) { /* storage may be blocked */ }
  document.documentElement.dataset.density = dens;
  const compact = () => dens === 'compact';
  const densityBtn = () => `<button type="button" class="btn small density-btn" data-density aria-pressed="${compact()}" title="Table rows: compact (one line each) or comfortable (everything wrapped)">${compact() ? 'Compact' : 'Comfortable'} rows</button>`;
  document.addEventListener('click', e => {
    if (!e.target.closest?.('[data-density]')) return;
    dens = compact() ? 'comfortable' : 'compact'; document.documentElement.dataset.density = dens;
    try { localStorage.setItem(DK, dens); } catch (err) { /* storage may be blocked */ }
    K.render();
  });
  function on(table, cols, defaults) {
    defs[table] = defaults || [];
    if (!state[table]) {
      const saved = read(KEY(table)), known = read(KNOWN(table));
      const set = new Set(Array.isArray(saved) ? saved : defs[table]);
      if (Array.isArray(saved)) defs[table].filter(k => !(Array.isArray(known) && known.includes(k))).forEach(k => set.add(k));
      state[table] = set;
    }
    return (cols || []).filter(c => c.fixed || state[table].has(c.id)).map(c => c.id);
  }
  function save(table) { write(KEY(table), [...state[table]]); write(KNOWN(table), defs[table] || []); }
  function reset(table) { state[table] = new Set(defs[table] || []); write(KEY(table), null); }
  function menu(table, cols, defaults) {
    on(table, cols, defaults);
    const opt = (cols || []).filter(c => !c.fixed);
    if (!opt.length) return `<span class="tbl-opts">${densityBtn()}</span>`;
    return `<span class="tbl-opts">${densityBtn()}` + `<details class="col-menu"${open.has(table) ? ' open' : ''} data-col-menu="${esc(table)}"><summary class="btn small">Columns</summary><div class="col-pop" role="group" aria-label="Optional columns">` +
      opt.map(c => `<label class="check"><input type="checkbox" data-col-table="${esc(table)}" data-col="${esc(c.id)}"${state[table].has(c.id) ? ' checked' : ''}> ${esc(c.menu || c.label)}</label>`).join('') +
      `<button class="linkish" type="button" data-col-reset="${esc(table)}">Default columns</button></div></details></span>`;
  }
  const redraw = {};
  const after = table => { open.add(table); (redraw[table] || K.render)(); };
  document.addEventListener('change', e => {
    const cb = e.target.closest?.('[data-col-table]'); if (!cb) return;
    const t = cb.dataset.colTable; if (!state[t]) return;
    if (cb.checked) state[t].add(cb.dataset.col); else state[t].delete(cb.dataset.col);
    save(t); after(t);
  });
  document.addEventListener('toggle', e => { const d = e.target; if (d.dataset?.colMenu) { if (d.open) open.add(d.dataset.colMenu); else open.delete(d.dataset.colMenu); } }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-col-reset]');
    if (b) { reset(b.dataset.colReset); after(b.dataset.colReset); return; }
    if (open.size && !e.target.closest?.('.col-menu')) document.querySelectorAll('details.col-menu[open]').forEach(d => { d.open = false; });
  });
  K.columns = { menu, on, reset, redraw };
  K.density = { compact, btn: densityBtn };
});
