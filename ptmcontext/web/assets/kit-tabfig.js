/* A table or card drawn as a figure: the same rows the page shows, as text in an SVG, through the kit's figure frame, so a
   table has PDF, SVG and PNG beside its TSV like every chart (title, source and citation strip included). The page's own
   table is read, not the data again, so the figure shows what is on screen: the same sort, filter and page. A long table is
   drawn to its first rows and says so; the TSV has them all.
     K.tableFigure(root, {title, sub, note, cap, total})  the figure (as K.figureFrame returns it) of the tables inside root
     K.tableExport(kind, btn, root, {title, ...}, name, tsv)  the export button's click: kind is pdf, svg, png or tsv
   A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { esc, int } = K;
  const SZ = 10.5, RH = 17, PAD = 20, MAXW = 1100, MINW = 560;
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  // a table of the page as {head, rows, rot}: only what is shown (rows and cells the page hides are left out)
  function readTable(t) {
    const shown = r => r.getClientRects().length > 0;
    const all = [...t.rows].filter(r => shown(r) && !r.classList.contains('ev-row'));
    const isHead = r => r.parentElement.tagName === 'THEAD' || [...r.cells].every(c => c.tagName === 'TH');
    const head = all.find(isHead), body = all.filter(r => !isHead(r));
    const cells = r => [...r.cells].filter(c => c.getClientRects().length).flatMap(c => { const n = Math.max(1, Math.min(8, c.colSpan || 1)); const t = c.querySelector('i.ix-on') ? '●' : c.querySelector('i.ix-off') ? '·' : clean(c.innerText); return [{ t, num: c.classList.contains('num') || /^[+−–-]?[\d.,]+(?:\s?[%×x])?$/.test(t), rot: c.classList.contains('ix-vh'), act: !!c.querySelector('.row-acts, button.btn') && !c.classList.contains('ix-vh') }, ...Array(n - 1).fill({ t: '', num: false })]; });
    const hd = head ? cells(head) : null, bd = body.map(cells);
    // a column of buttons only (3D, Evidence) is not data: left out
    const act = i => !!hd && bd.some(r => r[i]?.act) && bd.every(r => !r[i] || !r[i].t || r[i].act);
    const keep = (r) => r.filter((_, i) => !act(i));
    const rows = bd.map(keep); body.forEach((r, i) => { if (r.classList.contains('hl-row')) rows[i].hl = true; });   // a highlighted row (kit-hilite.js): tinted in the figure
    return { head: hd && keep(hd), rows };
  }
  // the text cut to a width, with an ellipsis
  function fit(t, w, size = SZ) {
    if (K.tw(t, size) <= w) return t;
    let a = 0, b = t.length;
    while (a < b) { const m = (a + b + 1) >> 1; if (K.tw(t.slice(0, m) + '…', size) <= w) a = m; else b = m - 1; }
    return t.slice(0, a).trimEnd() + '…';
  }
  function drawTable(tb, cap, avail, parts, y0, P) {
    const rows = tb.rows.slice(0, cap), n = Math.max(tb.head ? tb.head.length : 0, ...rows.map(r => r.length), 1), rot = i => !!tb.head?.[i]?.rot;
    const nat = Array.from({ length: n }, (_, i) => (rot(i) ? 34 : Math.min(260, Math.max(30, 14 + Math.max(tb.head?.[i] ? K.tw(tb.head[i].t, SZ, 700) : 0, ...rows.map(r => (r[i] ? K.tw(r[i].t, SZ) : 0)))))));
    const free = nat.reduce((a, w, i) => a + (rot(i) ? 0 : w), 0), fixed = nat.reduce((a, w, i) => a + (rot(i) ? w : 0), 0), k = free > avail - fixed ? Math.max(0.2, (avail - fixed) / free) : 1;
    const w = nat.map((x, i) => (rot(i) ? x : x * k)), x0 = w.map((_, i) => P + w.slice(0, i).reduce((a, b) => a + b, 0)), total = w.reduce((a, b) => a + b, 0);
    let y = y0;
    const T = (x, yy, t, o = {}) => parts.push(`<text x="${x.toFixed(1)}" y="${yy.toFixed(1)}" font-size="${o.size || SZ}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.rot ? ` transform="rotate(-60 ${x.toFixed(1)} ${yy.toFixed(1)})"` : ''} fill="${o.fill || K.PAL.ink}">${esc(t)}</text>`);
    if (tb.head) {
      const hh = tb.head.some((c, i) => rot(i)) ? Math.min(150, Math.max(...tb.head.map((c, i) => (rot(i) ? K.tw(c.t, SZ - 0.5) * 0.87 + 10 : 0)))) : 0;
      y += hh;
      tb.head.forEach((c, i) => {
        if (rot(i)) T(x0[i] + w[i] / 2 - 2, y + RH - 5, fit(c.t, 175, SZ - 0.5), { size: SZ - 0.5, weight: 700, rot: true });
        else T(c.num ? x0[i] + w[i] - 6 : x0[i] + 4, y + RH - 5, fit(c.t, w[i] - 10), { weight: 700, anchor: c.num ? 'end' : null });
      });
      y += RH; parts.push(`<line x1="${P}" x2="${P + total}" y1="${y}" y2="${y}" stroke="${K.PAL.one}" stroke-width="1"/>`);
    }
    rows.forEach((r, ri) => {
      if (r.hl) parts.push(`<rect x="${P}" y="${y}" width="${total.toFixed(1)}" height="${RH}" fill="#fbe3d3"/><rect x="${P}" y="${y}" width="3" height="${RH}" fill="#c2410c"/>`);
      else if (ri % 2) parts.push(`<rect x="${P}" y="${y}" width="${total.toFixed(1)}" height="${RH}" fill="#f3f6f7"/>`);
      r.forEach((c, i) => { if (!c.t || i >= n) return; if (rot(i) || (c.num && w[i] < 60)) T(x0[i] + w[i] / 2, y + RH - 5, fit(c.t, w[i] - 4), { anchor: 'middle' }); else T(c.num ? x0[i] + w[i] - 6 : x0[i] + 4, y + RH - 5, fit(c.t, w[i] - 10), { anchor: c.num ? 'end' : null }); });
      y += RH;
    });
    parts.push(`<line x1="${P}" x2="${P + total}" y1="${y}" y2="${y}" stroke="${K.PAL.line}" stroke-width="1"/>`);
    return { y, total };
  }
  function tableFigure(root, o = {}) {
    const cap = o.cap || 40, tables = [...root.querySelectorAll('table')].filter(t => t.getClientRects().length && !t.closest('.exp')).map(t => ({ t, ...readTable(t) })).filter(x => x.rows.length);
    const P = PAD, parts = [];
    // width: the widest table's natural width, between a small figure and a wide one
    const nat = Math.max(0, ...tables.map(x => { const n = Math.max(x.head?.length || 0, ...x.rows.slice(0, cap).map(r => r.length)); return Array.from({ length: n }, (_, i) => (x.head?.[i]?.rot ? 34 : Math.min(260, Math.max(30, 14 + Math.max(x.head?.[i] ? K.tw(x.head[i].t, SZ, 700) : 0, ...x.rows.slice(0, cap).map(r => (r[i] ? K.tw(r[i].t, SZ) : 0))))))).reduce((a, b) => a + b, 0); }));
    const Wd = Math.round(Math.min(MAXW, Math.max(MINW, nat + 2 * P + (tables.some(x => x.head?.some(c => c.rot)) ? 150 : 0))));
    let y = 0, shownRows = 0, allRows = 0;
    tables.forEach((x, i) => {
      const cap1 = tables.length > 1 ? Math.min(cap, 25) : cap;
      const det = x.t.closest('details'), label = tables.length > 1 && det ? clean(det.querySelector('summary')?.innerText) : '';
      if (label) { parts.push(`<text x="${P}" y="${y + 14}" font-size="12" font-weight="700" fill="${K.PAL.ink}">${esc(fit(label, Wd - 2 * P, 12))}</text>`); y += 22; }
      const d = drawTable(x, cap1, Wd - 2 * P, parts, y, P); y = d.y + 12;
      shownRows += Math.min(x.rows.length, cap1); allRows += x.rows.length;
      if (i < tables.length - 1) y += 6;
    });
    if (!tables.length) { parts.push(`<text x="${P}" y="16" font-size="${SZ}" fill="${K.PAL.muted}">No rows are shown.</text>`); y = 24; }
    const total = o.total != null ? o.total : allRows;
    const cut = total > shownRows ? `Drawn: the first ${int(shownRows)} of ${int(total)} rows, in the order of the page; the TSV has every row.` : '';
    return K.figureFrame({ title: o.title, sub: o.sub || '', body: parts.join(''), bodyH: y, W: Wd, note: [o.note, cut].filter(Boolean).join(' '), extra: { figure_kind: 'table', rows_drawn: shownRows } });
  }
  // the count line under a results page's heading ("1,204 of 3,000 proteins · 4,000 sites"), for a figure's subtitle
  const pageCx = () => clean(document.querySelector('.results-head .cx')?.innerText);
  // a small table of cells ([{t, num}]) as the body of a figure: its markup and height, for a figure that carries its own list
  function textTable(head, rows, Wd, y0 = 0) {
    const parts = [], d = drawTable({ head, rows }, rows.length, Wd - 2 * PAD, parts, y0, PAD);
    return { body: parts.join(''), H: d.y - y0 };
  }
  const tableExport = (kind, btn, root, o, name, tsv) => K.exportFigure(kind, () => tableFigure(root, o), name, btn, tsv);
  Object.assign(K, { tableFigure, tableExport, pageCx, textTable });
});
