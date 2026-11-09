#!/usr/bin/env node
/* Audit of the SVG that every export (PDF, SVG and PNG draw the same one) of a built site's pages makes.

   Usage:  NODE_PATH=<dir with playwright> node tools/audit/export_overlap.js <page url> [--routes a,b] [--out report.json]
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
const { chromium } = require('playwright');
const fs = require('fs');

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--') && /^https?:/.test(a));
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
if (!url) { console.error('usage: export_overlap.js <page url> [--routes a,b] [--selection q] [--proteins P1,P2] [--out file]'); process.exit(2); }
// selections to try besides none, separated by |: a search or a filter in the address's own words
const SELECTIONS = opt('selection', 'q=disease:als|f=p:panther_group~RNA processing and translation').split('|');

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
      if (a.t.length === 1 && b.t.length === 1) continue;           // the letters of a logo or an alignment are stacked by design
      if (w > 0 && h > 0 && w * h > 1) hits.push({ kind: 'overlap', a: a.t, b: b.t, area: +(w * h).toFixed(1) });
    }
    // text outside the viewBox
    texts.forEach(a => { if (a.x0 < root.left - 0.5 || a.x1 > root.right + 0.5 || a.y0 < root.top - 0.5 || a.y1 > root.bottom + 0.5) hits.push({ kind: 'outside', a: a.t }); });
    // text across a stroke of the figure
    const strokes = [...svg.querySelectorAll('path,polyline,line,ellipse,rect,polygon,circle')].filter(e => {
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
      const grow = (a.x1 - a.x0) * 0.06;
      for (const m of marks) {
        const r = m.getBoundingClientRect(), w = Math.min(a.x1 + grow, r.right) - Math.max(a.x0 - grow, r.left), h = Math.min(a.y1, r.bottom) - Math.max(a.y0, r.top);
        if (w > 0 && h > 0 && w * h > 2 && !m.contains(a.el)) hits.push({ kind: 'mark', a: a.t, area: +(w * h).toFixed(1) });
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
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true }), pg = await ctx.newPage();
  pg.on('pageerror', e => console.error('page error:', e.message));
  await pg.route('**/*', r => (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(r.request().url()) ? r.continue() : r.abort()));
  await pg.addInitScript(() => {          // every SVG a download offers is kept
    window.__svg = []; const o = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { if (b && b.type === 'image/svg+xml') b.text().then(t => window.__svg.push(t)); return o(b); };
  });
  await pg.goto(url); await pg.waitForSelector('#view *', { timeout: 60000 }); await pg.waitForTimeout(2500);
  const info = await pg.evaluate(() => ({ analyses: Object.keys(PTMC.A).filter(id => !id.startsWith('@')), cell: PTMC.D.cell?.id || '', tabs: [...document.querySelectorAll('#tabs a.tab')].map(a => a.getAttribute('href')).filter(h => h && /^#/.test(h) && !/^#protein/.test(h)), proteins: PTMC.D.proteins.slice(0, 2).map(p => p[0]) }));
  const routes = opt('routes') ? opt('routes').split(',') : [...new Set([...info.tabs, ...info.analyses.map(id => '#overview/' + id), ...(info.cell ? ['#overview/' + info.cell] : []), ...(opt('proteins') ? opt('proteins').split(',') : info.proteins).map(a => '#protein/' + a), '#figures'])];
  const report = {}; let total = 0;
  for (const sel of [null, ...SELECTIONS]) for (const route of routes) {
    const h = route + (sel ? (route.includes('?') ? '&' : '?') + sel.replace(/^([a-z]+)=(.*)$/, (m, k, v) => k + '=' + encodeURIComponent(v)) : '');
    await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(2500);
    await pg.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await pg.waitForTimeout(800);
    const btns = await pg.evaluate(() => [...document.querySelectorAll('#view .exp button, #view .exp-btn')].map((b, i) => ({ i, text: (b.textContent || '').trim(), label: b.closest('.exp')?.getAttribute('aria-label') || '' })).filter(b => /svg/i.test(b.text)));
    for (const b of btns) {
      await pg.evaluate(() => { window.__svg = []; });
      await pg.evaluate(i => { const x = [...document.querySelectorAll('#view .exp button, #view .exp-btn')][i]; x.click(); }, b.i);
      await pg.waitForFunction(() => window.__svg.length > 0, null, { timeout: 8000 }).catch(() => {});
      const svg = await pg.evaluate(() => window.__svg[0] || null); if (!svg) continue;
      const res = await pg.evaluate(analyse, svg), key = `${sel ? '[' + sel.slice(0, 24) + '] ' : ''}${route} · ${b.label || b.text} · ${b.text}`;
      report[key] = { texts: res.n, hits: res.hits }; total += res.hits.length;
      if (res.hits.length) console.log(`${res.hits.length}\t${key}\n` + res.hits.slice(0, 6).map(x => '\t' + JSON.stringify(x)).join('\n'));
    }
  }
  const out = opt('out'); if (out) fs.writeFileSync(out, JSON.stringify({ total, report }, null, 1));
  console.log(`exports checked: ${Object.keys(report).length}; hits: ${total}`);
  await browser.close(); process.exit(total ? 1 : 0);
})();
