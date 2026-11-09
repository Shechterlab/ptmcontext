/* The walk both export audits share: every route of a built site, without and with a selection, every export bar's SVG button
   clicked, the SVG that comes back handed to a callback with the page still showing the card (so a check can read the card).
   The site is known only through its own page data (PTMC.D.analyses, its pages and proteins) unless --routes names them. */
const { chromium } = require('playwright');

const BTN = '#view .exp button, #view .exp-btn';
const opts = (args) => {
  const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
  return {
    url: args.find(a => !a.startsWith('--') && /^https?:/.test(a)),
    opt, args,
    // selections to try besides none, separated by |: a search or a filter in the address's own words
    selections: opt('selection', 'q=disease:als|f=p:panther_group~RNA processing and translation').split('|'),
  };
};

async function walk(o, onExport) {
  const { url, opt, selections, args } = o;
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true }), pg = await ctx.newPage();
  pg.on('pageerror', e => console.error('page error:', e.message));
  // the page's own server only; the PDF's libraries and fonts (jsPDF, svg2pdf, Arimo) come from --cdn <dir> (files by name) or, with --online, the net
  const cdn = opt('cdn'), online = args.includes('--online');
  await pg.route('**/*', r => {
    const u = r.request().url(), f = cdn && require('path').join(cdn, u.split('/').pop().split('?')[0]);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u) || online) return r.continue();
    if (f && require('fs').existsSync(f)) return r.fulfill({ path: f, headers: { 'access-control-allow-origin': '*' } });
    return r.abort();
  });
  await pg.addInitScript(() => {          // every SVG a download offers is kept
    window.__svg = []; const o = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { if (b && b.type === 'image/svg+xml') b.text().then(t => window.__svg.push(t)); return o(b); };
  });
  await pg.goto(url); await pg.waitForSelector('#view *', { timeout: 60000 }); await pg.waitForTimeout(2500);
  const info = await pg.evaluate(() => ({ analyses: Object.keys(PTMC.A).filter(id => !id.startsWith('@')), cell: PTMC.D.cell?.id || '', tabs: [...document.querySelectorAll('#tabs a.tab')].map(a => a.getAttribute('href')).filter(h => h && /^#/.test(h) && !/^#protein/.test(h)), proteins: PTMC.D.proteins.slice(0, 2).map(p => p[0]) }));
  const routes = opt('routes') ? opt('routes').split(',') : [...new Set([...info.tabs, ...info.analyses.map(id => '#overview/' + id), ...(info.cell ? ['#overview/' + info.cell] : []), ...(opt('proteins') ? opt('proteins').split(',') : info.proteins).map(a => '#protein/' + a), '#figures'])];
  for (const sel of [null, ...selections]) for (const route of routes) {
    const h = route + (sel ? (route.includes('?') ? '&' : '?') + sel.replace(/^([a-z]+)=(.*)$/, (m, k, v) => k + '=' + encodeURIComponent(v)) : '');
    await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(2500);
    await pg.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await pg.waitForTimeout(800);
    const btns = await pg.evaluate(s => [...document.querySelectorAll(s)].map((b, i) => ({ i, text: (b.textContent || '').trim(), label: b.closest('.exp')?.getAttribute('aria-label') || '' })).filter(b => /svg/i.test(b.text)), BTN);
    for (const b of btns) {
      await pg.evaluate(() => { window.__svg = []; });
      await pg.evaluate(([s, i]) => { [...document.querySelectorAll(s)][i].click(); }, [BTN, b.i]);
      await pg.waitForFunction(() => window.__svg.length > 0, null, { timeout: 8000 }).catch(() => {});
      const svg = await pg.evaluate(() => window.__svg[0] || null); if (!svg) continue;
      await onExport(pg, { sel, route, btn: b, svg, key: `${sel ? '[' + sel.slice(0, 24) + '] ' : ''}${route} · ${b.label || b.text} · ${b.text}` });
    }
  }
  await browser.close();
}
module.exports = { walk, opts, BTN };
