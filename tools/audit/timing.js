#!/usr/bin/env node
/* Times the steps a reader waits for, on any site, as JSON: per step the wall time until the page settles (no request
   in flight and no DOM change for 300 ms, that quiet time not counted), the data fetched (count, bytes) and the
   main-thread long tasks (count, total ms, longest).
   node tools/audit/timing.js <base-url> [--gene FUS] [--genes "A,B,C"] [--tabs "#overview,#proteins,#sites"] [--reps 1]
   --query "disease:als" adds a filter selection and the Proteins tab after it.
   Steps: first paint, search to protein page, each tab, a gene-list selection, the Sites page settling. */
'use strict';
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const base = args[0];
if (!base) { console.error('usage: timing.js <base-url> [--gene G] [--genes "A,B"] [--tabs "#a,#b"]'); process.exit(2); }
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : d; };
const GENE = opt('gene', 'FUS');
const GENES = opt('genes', 'FUS,EWSR1,TAF15,HNRNPA1,HNRNPA2B1,HNRNPK,HNRNPU,SRSF1,SRSF2,NPM1,NCL,FBL,DDX3X,DDX5,PABPC1,YBX1,KHDRBS1,SYNCRIP,ELAVL1,G3BP1').split(',');
const QUERY = opt('query', '');
const TABS = opt('tabs', '#overview,#proteins,#sites,#method').split(',');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());      // unreachable in a sandbox; would only add noise
  let net = { n: 0, bytes: 0 }, pending = 0, lastNet = Date.now();
  page.on('request', r => { if (r.url().startsWith(base.replace(/#.*/, '').replace(/\/[^/]*$/, '/'))) { pending++; lastNet = Date.now(); } });
  const done = async r => { if (!r.url().startsWith(base.replace(/#.*/, '').replace(/\/[^/]*$/, '/'))) return; pending--; lastNet = Date.now(); };
  page.on('requestfailed', done);
  page.on('requestfinished', async r => { try { const s = await r.sizes(); net.n++; net.bytes += s.responseBodySize || 0; } catch (e) { net.n++; } done(r); });
  await page.addInitScript(() => {
    window.__lt = []; window.__mut = performance.now();
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true }); } catch (e) { /* none */ }
    const go = () => new MutationObserver(() => { window.__mut = performance.now(); }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go);
  });
  const QUIET = 300, out = { base, steps: {} };
  const settle = async (name, action) => {
    net = { n: 0, bytes: 0 }; await page.evaluate(() => { if (window.__lt) window.__lt.length = 0; });
    const t0 = Date.now(); await action();
    for (;;) {
      await page.waitForTimeout(50);
      const mutAge = await page.evaluate(() => (window.__mut === undefined ? 0 : performance.now() - window.__mut)).catch(() => 0);
      if (pending <= 0 && Date.now() - lastNet >= QUIET && mutAge >= QUIET) break;
      if (Date.now() - t0 > 40000) break;
    }
    const ms = Date.now() - t0 - QUIET, lt = await page.evaluate(() => (window.__lt || []).slice());
    out.steps[name] = { ms, requests: net.n, kb: Math.round(net.bytes / 1024), long_tasks: lt.length, long_ms: Math.round(lt.reduce((s, x) => s + x, 0)), longest_ms: Math.round(Math.max(0, ...lt)) };
  };
  const box = () => page.$('input[type=search], #q, input[placeholder*=earch]');
  await settle('first paint to settled', () => page.goto(base.replace(/#.*/, '') + '#overview', { waitUntil: 'commit' }));
  out.first_contentful_paint_ms = await page.evaluate(() => Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0));
  await settle('search ' + GENE + ' to its page', async () => { const x = await box(); await x.fill(GENE); await x.press('Enter'); });
  for (const t of TABS) await settle('tab ' + t, () => page.evaluate(h => { location.hash = h; }, t));
  await page.evaluate(() => { location.hash = '#overview'; }); await page.waitForTimeout(1500);
  await settle('gene list (' + GENES.length + ') selection', async () => { const x = await box(); await x.fill(GENES.join(' ')); await x.press('Enter'); });
  await settle('Sites page after selection', () => page.evaluate(() => { location.hash = '#sites'; }));
  await settle('back to Overview', () => page.evaluate(() => { location.hash = '#overview'; }));
  if (QUERY) {
    await page.evaluate(() => { location.hash = '#overview'; }); await page.waitForTimeout(1500);
    await settle('query ' + QUERY, async () => { const x = await box(); await x.fill(QUERY); await x.press('Enter'); });
    await settle('Proteins tab after the query', () => page.evaluate(() => { location.hash = '#proteins'; }));
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
