#!/usr/bin/env node
/* Audit of the SVG that every export (PDF, SVG and PNG draw the same one) of a built site's pages makes.

   Usage:  NODE_PATH=<dir with playwright> node tools/audit/export_overlap.js <page url> [--routes a,b] [--font family] [--out report.json]
   <page url> is a built site's index.html served over http (the kit fetches its data files). Each route is visited without a
   selection and with a selection (--selection, default an ALS search and a PANTHER group filter); every export bar's SVG button is clicked and the SVG that
   comes back is laid out in the browser, where each text element's box is read (getBoundingClientRect, in screen pixels) and
   checked for:
     overlap   two texts whose boxes intersect by more than 1 px²
     outline   a text crossing a drawn line of the figure (a stroke of a path, polyline, line, ellipse or rect that is not the
               text's own leader: it starts away from the text's box)
     outside   a text running outside the SVG's viewBox
   It prints the hits per card and exits with the number of hits (0: clean). It knows no site: the routes come from the page's
   own data (PTMC.D.analyses, its pages and proteins) unless --routes names them. */
const fs = require('fs');
const { walk, opts } = require('./export_common');

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--') && /^https?:/.test(a));
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
if (!url) { console.error('usage: export_overlap.js <page url> [--routes a,b] [--selection q] [--proteins P1,P2] [--out file]'); process.exit(2); }

// runs in the page: lays the SVG out and returns its hits
function analyse(svgText) {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden';
  holder.innerHTML = svgText;
  document.body.appendChild(holder);
  const svg = holder.querySelector('svg'), hits = [];
  try {
    const vb = svg.viewBox.baseVal, root = svg.getBoundingClientRect(), sx = root.width / vb.width, sy = root.height / vb.height;
    const box = t => { const r = t.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, t: (t.textContent || '').trim().slice(0, 60) }; };
    const texts = [...svg.querySelectorAll('text')].filter(t => (t.textContent || '').trim()).map(t => ({ el: t, ...box(t) }));
    // text against text
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j], w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (a.t.length === 1 && b.t.length === 1) continue;
      if (a.t === b.t && w * h > 0.8 * Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0))) continue;      // the same text twice: a halo           // the letters of a logo or an alignment are stacked by design
      if (w > 0 && h > 0 && w * h > 1) hits.push({ kind: 'overlap', a: a.t, b: b.t, area: +(w * h).toFixed(1) });
    }
    // text outside the viewBox
    texts.forEach(a => { if (a.x0 < root.left - 0.5 || a.x1 > root.right + 0.5 || a.y0 < root.top - 0.5 || a.y1 > root.bottom + 0.5) hits.push({ kind: 'outside', a: a.t }); });
    // text across a stroke of the figure
    const strokes = [...svg.querySelectorAll('path,polyline,line,ellipse,rect,polygon')].filter(e => {
      if (e.closest('defs,clipPath,mask,pattern')) return false;
      const s = e.getAttribute('stroke'); if (!s || s === 'none' || s === 'transparent') return false;
      const w = parseFloat(e.getAttribute('stroke-width') || '1'); if (!(w >= 0.5)) return false;
      const r = e.getBoundingClientRect(); return r.width > 8 || r.height > 8;
    });
    const near = (e, a) => { // the leader of a label starts at the label: its first point is within 14 px of the text box
      if (e.tagName !== 'polyline' && e.tagName !== 'line') return false;
      const m = e.getScreenCTM(), p0 = e.tagName === 'line' ? [e.x1.baseVal.value, e.y1.baseVal.value] : [e.points[0].x, e.points[0].y];
      const q = new DOMPoint(p0[0], p0[1]).matrixTransform(m);
      return q.x > a.x0 - 14 && q.x < a.x1 + 14 && q.y > a.y0 - 14 && q.y < a.y1 + 14;
    };
    // text against a small filled mark (a swatch, a bar of a callout): the text box is taken 6% wider, as another font may be
    const marks = [...svg.querySelectorAll('rect')].filter(e => {
      if (e.closest('defs,clipPath,mask,pattern')) return false;
      const f = e.getAttribute('fill'), o = parseFloat(e.getAttribute('fill-opacity') || '1'); if (!f || f === 'none' || f === 'transparent' || !(o > 0.05)) return false;
      const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) <= 8 && Math.max(r.width, r.height) > 4;
    });
    texts.forEach(a => {
      const anchor = a.el.getAttribute('text-anchor') || 'start', g0 = (a.x1 - a.x0) * 0.06, growL = anchor === 'start' ? 0 : g0, growR = anchor === 'end' ? 0 : g0;
      for (const m of marks) {
        const r = m.getBoundingClientRect(), w = Math.min(a.x1 + growR, r.right) - Math.max(a.x0 - growL, r.left), h = Math.min(a.y1, r.bottom) - Math.max(a.y0, r.top);
        if (w > 0 && h > 0 && w * h > 2 && !m.contains(a.el)) hits.push({ kind: 'mark', a: a.t, area: +(w * h).toFixed(1), with: m.outerHTML.slice(0, 90) });
      }
    });
    texts.forEach(a => {
      const pts = [];
      for (let x = a.x0; x <= a.x1; x += 3) { pts.push([x, a.y0 + 1], [x, a.y1 - 1], [x, (a.y0 + a.y1) / 2]); }
      for (let y = a.y0; y <= a.y1; y += 3) { pts.push([a.x0 + 1, y], [a.x1 - 1, y]); }
      for (const e of strokes) {
        if (e.contains(a.el) || a.el.contains(e)) continue;
        const r = e.getBoundingClientRect(); if (r.right < a.x0 || r.left > a.x1 || r.bottom < a.y0 || r.top > a.y1) continue;
        const inv = e.getScreenCTM().inverse(), n = pts.filter(([x, y]) => { const q = new DOMPoint(x, y).matrixTransform(inv); try { return e.isPointInStroke(q); } catch (err) { return false; } }).length;
        if (n >= 2) hits.push({ kind: 'outline', a: a.t, with: e.tagName + (near(e, a) ? ' (its own leader)' : ''), points: n, own: near(e, a) });
      }
    });
    return { n: texts.length, W: vb.width, H: vb.height, sx, sy, hits: hits.filter(h => !(h.kind === 'outline' && h.own && h.points < 6)) };
  } finally { holder.remove(); }
}

(async () => {
  const o = opts(args), report = {}; let total = 0;
  await walk(o, async (pg, e) => {
    // --font <family> lays the SVG out in another face (every font-family replaced), to see how it holds where Arial is missing
    const font = opt('font'), res = await pg.evaluate(analyse, font ? e.svg.replace(/font-family="[^"]*"/g, `font-family="${font}"`) : e.svg);
    report[e.key] = { texts: res.n, hits: res.hits }; total += res.hits.length;
    if (res.hits.length) console.log(`${res.hits.length}\t${e.key}\n` + res.hits.slice(0, 6).map(x => '\t' + JSON.stringify(x)).join('\n'));
  });
  const out = opt('out'); if (out) fs.writeFileSync(out, JSON.stringify({ total, report }, null, 1));
  console.log(`exports checked: ${Object.keys(report).length}; hits: ${total}`);
  process.exit(total ? 1 : 0);
})();
