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
    if (!K.sel?.data()) return { prots: new Set(), marks: new Set(), text: t.join(', '), chips, clear };
    const r = K.sel.select(t.join(', '), {});
    return { prots: r.proteins || new Set(), marks: new Set(r.marks || []), text: t.join(', '), chips, clear, unresolved: r.unresolved || [] };
  });
  K.paramsOut.push(p => { if (S.hl) p.set('hl', S.hl); });
  K.paramsIn.push(p => { S.hl = p.get('hl') || ''; });
  function state() {
    const out = { on: false, prots: new Set(), marks: new Set(), text: '', parts: [] };
    sources.forEach(f => { const r = f(); if (!r) return; out.on = true; r.prots.forEach(p => out.prots.add(p)); (r.marks || []).forEach(m => out.marks.add(m)); if (r.text) out.text += (out.text ? '; ' : '') + r.text; out.parts.push(r); });
    return out;
  }
  const clear = () => { state().parts.forEach(r => r.clear && r.clear()); K.writeHash(true); K.render(); };
  // "Highlighted only": exports draw just the highlighted items, without the gray context (kept for the session, per viewer)
  const KEY = 'ptmc-hl-only';
  const store = { get: () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }, set: v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* private window: kept for the page only */ } } };
  let only = store.get();
  let drops = [];
  const chip = (label, i) => `<span class="hl-chip">${esc(label)} <button type="button" class="hl-x" data-hl-drop="${i}" aria-label="Remove ${esc(label)} from the highlight" title="Remove it">×</button></span>`;
  // the legend line: what is highlighted, how many items, and the control that clears it
  const line = (n, noun) => {
    const st = state(); if (!st.on) return '';
    drops = [];
    const what = st.parts.map(r => (r.chips ? r.chips.map(c => { drops.push(c.drop); return chip(c.label, drops.length - 1); }).join(' ') : `<b>${esc(r.text)}</b> <button type="button" class="hl-x" data-hl-clear aria-label="Clear the highlight" title="Clear the highlight">×</button>`)).join(' ');
    return `<p class="hl-line"><span class="flabel">Highlighted:</span> ${what} <span class="muted">· ${int(n)} ${esc(noun)}</span> <label class="hl-only small" title="The PNG, SVG and PDF show only the highlighted items, without the gray context"><input type="checkbox" data-hl-only${only ? ' checked' : ''}> Exports: highlighted only</label></p>`;
  };
  // named lists of genes or sites, kept in this browser (like the saved selections); the link carries only the active list (hl=)
  const SK = `ptmc-hl-sets-${K.D?.site?.id || "site"}`;
  const sets = () => { try { const v = JSON.parse(localStorage.getItem(SK) || '[]'); return Array.isArray(v) ? v.filter(x => x && x.name && typeof x.list === 'string') : []; } catch (e) { return []; } };
  const keep = list => { try { localStorage.setItem(SK, JSON.stringify(list.slice(0, 60))); } catch (e) { /* storage blocked: the list lives for this page only */ } };
  const norm = s => String(s || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).join(', ');
  const activeSet = () => sets().find(x => norm(x.list) === norm(S.hl) && norm(S.hl));
  const setsHtml = () => {
    const all = sets(), cur = activeSet(), have = !!norm(S.hl);
    if (!all.length && !have) return '';
    return `<div class="hl-sets"><label class="flabel" for="hl-set">Saved lists</label> <select id="hl-set" data-hl-switch aria-label="Switch to a saved highlight list"><option value=""${cur ? '' : ' selected'}>${have && !cur ? '(unsaved list)' : '(none)'}</option>${all.map((x, i) => `<option value="${i}"${cur === x ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select> ` +
      `<button type="button" class="btn small" data-hl-save${have ? '' : ' disabled'} title="Save the highlighted list under a name, in this browser">Save as…</button>` +
      `<button type="button" class="btn small" data-hl-rename${cur ? '' : ' disabled'}>Rename</button><button type="button" class="btn small" data-hl-delete${cur ? '' : ' disabled'}>Delete</button></div>`;
  };
  const setsAct = {
    save: () => { const cur = activeSet(), name = (window.prompt('Name this list of highlighted genes or sites', cur ? cur.name : '') || '').trim(); if (!name || !norm(S.hl)) return; keep([{ name, list: norm(S.hl) }, ...sets().filter(x => x.name !== name)]); K.render(); },
    rename: () => { const cur = activeSet(); if (!cur) return; const name = (window.prompt('Rename this list', cur.name) || '').trim(); if (!name || name === cur.name) return; keep(sets().map(x => (x === cur || (x.name === cur.name && x.list === cur.list) ? { ...x, name } : x)).filter((x, i, a) => a.findIndex(y => y.name === x.name) === i)); K.render(); },
    delete: () => { const cur = activeSet(); if (!cur) return; if (window.confirm && !window.confirm(`Delete the list "${cur.name}"? The highlight on the page stays.`)) return; keep(sets().filter(x => !(x.name === cur.name && x.list === cur.list))); K.render(); },
  };
  // the box to paste genes or sites into: added to the highlight, nothing is filtered
  const control = () => `<form class="hl-form" data-hl-form><label class="flabel" for="hl-in">Highlight</label> <input id="hl-in" name="hl" type="search" autocomplete="off" spellcheck="false" placeholder="genes or sites to mark in the figures, e.g. FUS, TDP-43, HNRNPA1 R218" aria-label="Genes or sites to highlight in the figures"> <button class="btn small" type="submit">Highlight</button></form>${setsHtml()}`;
  // labels placed greedily: the candidates around a dot in order, the first that fits the box and clears the others
  function place(items, box = [0, 760, 0, 400], size = 10) {
    const taken = items.map(i => [i.x - i.r - 1, i.y - i.r - 1, i.x + i.r + 1, i.y + i.r + 1]), out = [];
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
  K.hl = { state, sources, line, place, labels, clear, control, sets, activeSet, limit: LIMIT, get only() { return only; } };
  document.addEventListener('change', e => { if (e.target.matches?.('[data-hl-only]')) { only = e.target.checked; store.set(only); document.querySelectorAll('[data-hl-only]').forEach(x => { x.checked = only; }); } });
  K.clicks.push(['[data-hl-save]', setsAct.save], ['[data-hl-rename]', setsAct.rename], ['[data-hl-delete]', setsAct.delete]);
  document.addEventListener('change', e => { const s = e.target.matches?.('[data-hl-switch]') && e.target; if (!s) return; const x = s.value === '' ? null : sets()[+s.value]; S.hl = x ? x.list : ''; K.writeHash(true); K.render(); });
  K.clicks.push(['[data-hl-drop]', el => { drops[+el.dataset.hlDrop]?.(); K.writeHash(true); K.render(); }]);
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
.hl-tbl { margin-top: 0.4rem; }
.hl-tbl td, .hl-tbl th { padding: 0.15rem 0.5rem; }`;
  document.head.appendChild(css);
});
