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
  function state() {
    const out = { on: false, prots: new Set(), marks: new Set(), text: '', parts: [] };
    sources.forEach(f => { const r = f(); if (!r) return; out.on = true; r.prots.forEach(p => out.prots.add(p)); (r.marks || []).forEach(m => out.marks.add(m)); if (r.text) out.text += (out.text ? '; ' : '') + r.text; out.parts.push(r); });
    return out;
  }
  const clear = () => { state().parts.forEach(r => r.clear && r.clear()); K.writeHash(true); K.render(); };
  // the legend line: what is highlighted, how many items, and the control that clears it
  const line = (n, noun) => { const st = state(); return st.on ? `<p class="hl-line"><span class="flabel">Highlighted:</span> <b>${esc(st.text)}</b> <span class="muted">· ${int(n)} ${esc(noun)}</span> <button type="button" class="hl-x" data-hl-clear aria-label="Clear the highlight" title="Clear the highlight">×</button></p>` : ''; };
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
  K.hl = { state, sources, line, place, labels, clear, limit: LIMIT };
  K.clicks.push(['[data-hl-clear]', () => clear()]);
  const css = document.createElement('style');
  css.textContent = `.hl-line { margin: 0.35rem 0; font-size: 0.85rem; display: flex; gap: 0.4rem; align-items: baseline; flex-wrap: wrap; }
.hl-x { border: 1px solid var(--line-strong); border-radius: 50%; width: 1.35rem; height: 1.35rem; line-height: 1; padding: 0; cursor: pointer; color: var(--muted); }
.hl-x:hover { color: var(--ink); border-color: var(--ink); }
.hl-tbl { margin-top: 0.4rem; }
.hl-tbl td, .hl-tbl th { padding: 0.15rem 0.5rem; }`;
  document.head.appendChild(css);
});
