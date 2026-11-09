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
  const SZ = 10.5, RH = 17, PAD = 20, MAXW = 1800, MINW = 560, COLMAX = 560;   // wide enough that a name is not cut
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  // a small drawing in a cell (the Proteins table's site map): its markup with the page's colors written out, drawn into the figure
  const miniSvg = c => {
    const v = c.querySelector('svg.minimap'); if (!v) return null;
    const w = +v.getAttribute('width') || 150, h = +v.getAttribute('height') || 20, cs = getComputedStyle(document.documentElement);
    const inner = v.innerHTML.replace(/var\((--[\w-]+)\)/g, (m, n) => cs.getPropertyValue(n).trim() || '#c7d4d9');
    return { w, h, inner };
  };
  const SVGK = 0.85;
  // a table of the page as {head, rows, rot}: only what is shown (rows and cells the page hides are left out)
  function readTable(t) {
    const shown = r => r.getClientRects().length > 0;
    const all = [...t.rows].filter(r => shown(r) && !r.classList.contains('ev-row'));
    const isHead = r => r.parentElement.tagName === 'THEAD' || [...r.cells].every(c => c.tagName === 'TH');
    const head = all.find(isHead), body = all.filter(r => !isHead(r));
    const cells = r => [...r.cells].filter(c => c.getClientRects().length).flatMap(c => { const n = Math.max(1, Math.min(8, c.colSpan || 1)); const t = c.querySelector('i.ix-on') ? '●' : c.querySelector('i.ix-off') ? '·' : clean(c.innerText); return [{ t, svg: miniSvg(c), num: c.classList.contains('num') || /^[+−–-]?[\d.,]+(?:\s?[%×x])?$/.test(t), rot: c.classList.contains('ix-vh'), act: !!c.querySelector('.row-acts, button.btn') && !c.classList.contains('ix-vh') }, ...Array(n - 1).fill({ t: '', num: false })]; });
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
    const nat = Array.from({ length: n }, (_, i) => (rot(i) ? 34 : rows.some(r => r[i]?.svg) ? Math.round(rows.find(r => r[i]?.svg)[i].svg.w * SVGK) + 10 : Math.min(COLMAX, Math.max(30, 14 + Math.max(tb.head?.[i] ? K.tw(tb.head[i].t, SZ, 700) : 0, ...rows.map(r => (r[i] ? K.tw(r[i].t, SZ) : 0)))))));
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
      r.forEach((c, i) => { if (c.svg && i < n) { parts.push(`<g transform="translate(${(x0[i] + 4).toFixed(1)},${(y + (RH - c.svg.h * SVGK) / 2).toFixed(1)}) scale(${SVGK})">${c.svg.inner}</g>`); return; } if (!c.t || i >= n) return; if (rot(i) || (c.num && w[i] < 60)) T(x0[i] + w[i] / 2, y + RH - 5, fit(c.t, w[i] - 4), { anchor: 'middle' }); else T(c.num ? x0[i] + w[i] - 6 : x0[i] + 4, y + RH - 5, fit(c.t, w[i] - 10), { anchor: c.num ? 'end' : null }); });
      y += RH;
    });
    parts.push(`<line x1="${P}" x2="${P + total}" y1="${y}" y2="${y}" stroke="${K.PAL.line}" stroke-width="1"/>`);
    return { y, total };
  }
  function tableFigure(root, o = {}) {
    const cap = o.cap || 40, tables = [...root.querySelectorAll('table')].filter(t => t.getClientRects().length && !t.parentElement.closest('.exp')).map(t => ({ t, ...readTable(t) })).filter(x => x.rows.length);
    const P = PAD, parts = [];
    // width: the widest table's natural width, between a small figure and a wide one
    const nat = Math.max(0, ...tables.map(x => { const n = Math.max(x.head?.length || 0, ...x.rows.slice(0, cap).map(r => r.length)); return Array.from({ length: n }, (_, i) => (x.head?.[i]?.rot ? 34 : x.rows.slice(0, cap).some(r => r[i]?.svg) ? Math.round(x.rows.find(r => r[i]?.svg)[i].svg.w * SVGK) + 10 : Math.min(COLMAX, Math.max(30, 14 + Math.max(x.head?.[i] ? K.tw(x.head[i].t, SZ, 700) : 0, ...x.rows.slice(0, cap).map(r => (r[i] ? K.tw(r[i].t, SZ) : 0))))))).reduce((a, b) => a + b, 0); }));
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
  // ---- a table with no export of its own (the Method page's, a protein page's fold tables): an export bar before it, TSV of every
  // row and the same drawn figure; found after each render and when a fold draws late ------------------------------------------
  const slug = t => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'table';
  const CONTAINER = 'section, article, .card, .pcard, details, .idr-card';
  // a table's title: the heading of its section; a fold's summary gives its name (its bold or heading part), and the counts beside
  // it ("6 rows, 3 methylarginines") go to the subtitle, so a figure's title and file name carry no counts
  const headOf = t => { const c = t.closest(CONTAINER) || document.getElementById('view') || document.body, h = c.querySelector('h2, h3, h4, summary'); return h?.tagName === 'SUMMARY' ? (h.querySelector('h2, h3, h4, b, strong') || h) : h; };
  const titleOf = t => { const c = t.closest(CONTAINER) || document.getElementById('view') || document.body; return clean(headOf(t)?.textContent || c.id || document.title).slice(0, 80); };
  const subOf = t => { const h = headOf(t), s = h?.tagName === 'SUMMARY' ? h : h?.closest('summary'); return clean([...(s ? s.querySelectorAll('.muted, .fsum') : [])].map(x => x.textContent).join(' · ')); };
  const domTsv = (t, title) => {
    const row = r => [...r.cells].map(c => clean(c.textContent).replace(/\t/g, ' ')).join('\t');
    const head = [...t.tHead?.rows || []].map(row), body = [...t.tBodies].flatMap(b => [...b.rows]).filter(r => !r.classList.contains('ev-row')).map(row);
    return K.preamble(title, `the table "${title}" as shown on the page (${int(body.length)} rows).`) + [...head, ...body].join('\n') + '\n';
  };
  // <site>_<page>_<table>: the page's tab name leads, unless the table's name already starts with it (a protein's page is named by its gene)
  const fileOf = title => { const pg = K.S.view && K.S.view !== 'protein' ? slug(K.tabName ? K.tabName(K.S.view, K.S.view) : K.S.view) : '', t = slug(title); return `${K.D.site.id}_${!pg || t.startsWith(pg) ? '' : pg + '_'}${t}`; };
  let tblId = 0;
  const FIGURES = K.D.site.features?.table_figures !== false;      // website.features.table_figures: false leaves the buttons out
  function bars() {
    const root = document.getElementById('view'); if (!FIGURES || !root) return;
    const todo = [...root.querySelectorAll('table')].filter(t => (t.rows.length > 2 || (t.rows.length > 1 && t.closest('.ix-fold'))) && !t.parentElement.closest('.exp, .fr-dl, .hl-tbl') && !t.dataset.tx && !(t.closest(CONTAINER) || root).querySelector('div.exp:not([data-for-tx])'));   // a table whose section (or page) has a bar is left alone
    todo.forEach(t => {
      const box = t.closest('.tbl-card, .tbl-wrap, .cv-wrap') || t;
      t.dataset.tx = String(++tblId);
      box.insertAdjacentHTML('beforebegin', K.expBar(['pdf', 'svg', 'png', 'tsv'], 'tblx', titleOf(t)).replace('class="exp"', `class="exp" data-for-tx="${t.dataset.tx}"`));
    });
  }
  K.tableBars = bars;      // a module that paints a table late (the structure lists) calls it, so the bar is there at once
  if (FIGURES) {
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { clearTimeout(mo.t); mo.t = setTimeout(bars, 60); });
    (K.afterRender ||= []).push(() => { bars(); const v = document.getElementById('view'); if (mo && v && !mo.on) { mo.on = true; mo.observe(v, { childList: true, subtree: true }); } });
  }
  K.clicks.push(['[data-tblx]', el => {
    const t = document.querySelector(`table[data-tx="${el.closest('.exp').dataset.forTx}"]`); if (!t) return;
    const title = titleOf(t), box = t.closest('.tbl-card, .tbl-wrap, .cv-wrap') || t;
    K.tableExport(el.dataset.tblx, el, box, { title, sub: subOf(t), total: [...t.tBodies].reduce((n, b) => n + b.rows.length, 0) }, fileOf(title), () => domTsv(t, title));
  }]);
  // ---- one scheme for the names of downloaded files: <site>_<page or protein>_<figure>[_selection]_<date>.<ext> ----------------
  // applied to every name that starts with the site's id (or its marks' plural, the older tables' form) by K.download
  const today = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  function stem(file) {
    const m = /^(.*?)(\.[A-Za-z0-9]{2,4})?$/.exec(file), ext = m[2] || '', site = K.D.site.id, mk = slug(K.W.marks);
    let b = m[1];
    if (mk !== site && b.startsWith(mk + '_')) b = site + b.slice(mk.length);
    else if (!b.startsWith(site + '_')) return file;
    let rest = b.slice(site.length + 1).replace(/(^|_)(p|s|m)-(?=[a-z])/g, '$1');      // a figure's internal id (p-cell) is not a name
    const date = (/_(\d{4}-\d{2}-\d{2})$/.exec(rest) || [])[1];
    if (date) rest = rest.slice(0, -date.length - 1);
    const toks = rest.split('_').filter((t, i, a) => t && t.toLowerCase() !== (a[i - 1] || '').toLowerCase());
    // a protein's page: its gene in the name, in place of its accession
    if (K.S.view === 'protein' && K.S.arg) {
      const acc = String(K.S.arg).split('/')[0], p = K.sel?.byAcc?.[acc], g = p && (p.gene || p.acc);
      if (g) { const k = toks.findIndex(t => t.toLowerCase() === acc.toLowerCase()); if (k >= 0) toks.splice(k, 1); if (!toks.some(t => t.toLowerCase() === slug(g))) toks.unshift(g); }
    }
    if (K.sel?.active() && K.followsSelection?.(K.S.view) && !toks.includes('selection')) toks.push('selection');
    return `${site}_${toks.join('_')}_${date || today()}${ext}`;
  }
  Object.assign(K, { tableFigure, tableExport, pageCx, textTable, stem });
});
