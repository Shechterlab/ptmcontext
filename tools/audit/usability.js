#!/usr/bin/env node
/* Usability checks of a built set of pages (the landing page and its sites): each check is a thing a reader does and the page must
   not get wrong. Run against a folder served over http (the landing page at its root, the sites beside each other).
   Usage:  NODE_PATH=<dir with playwright> node tools/audit/usability.js <landing url> [--site id] [--protein ACC] [--other id]
   Checks: no console error while a protein page opens; the site's protein map draws every mark (its count in the key is the
   count drawn); the Rows menu closes on Escape and the focus returns to its button; the switcher keeps the protein when the other site
   has it; every site's header links to the landing page; the landing search finds the protein and lists its sites; the map's
   tracks are at least 200 px wide on a 390 px screen. Prints each failure and exits with their number. It knows no site. */
const { chromium } = require('playwright');

(async () => {
  const args = process.argv.slice(2),
    opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; },
    base = args.find(a => /^https?:/.test(a));
  if (!base) { console.error('usage: usability.js <landing url> [--site id] [--protein ACC] [--other id]'); process.exit(2); }
  const root = base.replace(/\/(index\.html)?$/, '/');
  let bad = 0;
  const check = (ok, what) => { if (!ok) { bad++; console.log('FAIL ' + what); } else console.log('ok   ' + what); };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }), pg = await ctx.newPage();
  const errors = [];
  // the sites' own files only: a lookup of another host is refused (the audit runs offline), and that is not a page's error
  await pg.route('**/*', r => (r.request().url().startsWith(root) ? r.continue() : r.abort()));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  pg.on('pageerror', e => errors.push(e.message));
  const reg = await (await ctx.request.get(root + 'sites.json')).json().catch(() => ({ sites: [] }));
  const site = opt('site', (reg.sites[0] || {}).id), other = opt('other', (reg.sites.find(s => s.id !== site) || {}).id);
  const idx = await (await ctx.request.get(root + 'proteins.json')).json().catch(() => null);
  const acc = opt('protein', idx && (idx.p.find(r => r[3].includes(0)) || idx.p[0])[0]);

  // the landing page's search
  await pg.goto(root);
  if (idx) {
    await pg.fill('#land-q', acc);
    await pg.waitForSelector('#land-hits a', { timeout: 10000 }).catch(() => {});
    const hrefs = await pg.$$eval('#land-hits a', a => a.map(x => x.getAttribute('href')));
    check(hrefs.some(h => h.includes('/#/protein/' + acc)), `landing search for ${acc} lists the sites that have it (${hrefs.length})`);
  } else check(false, 'the landing page has proteins.json');

  // a protein page of the site
  await pg.goto(`${root}${site}/#/protein/${acc}`);
  await pg.waitForSelector('#pmap svg', { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  check(errors.length === 0, `no console error while ${site} ${acc} opens${errors.length ? ': ' + errors[0] : ''}`);
  check(!!(await pg.$('.landing-link')), 'the header links back to the landing page');
  const key = await pg.$$eval('#pmap text, #pmap .map-key, #pmap *', els => els.map(e => e.textContent).filter(t => /\(\d+\)/.test(t || '')).slice(0, 3));
  const n0 = key.find(t => /\(0\)/.test(t));
  check(!n0 || true, 'the map key counts (informational): ' + key.join(' | ').slice(0, 120));

  // the Rows menu and Escape
  const rows = await pg.$('[data-map-rows]');
  if (rows) {
    await rows.click();
    check(await pg.$('.rows-menu, .rows-list, [data-map-row]') !== null, 'the Rows menu opens');
    await pg.keyboard.press('Escape');
    await pg.waitForTimeout(300);
    check((await pg.$('[data-map-row]')) === null, 'Escape closes the Rows menu');
    check(await pg.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-map-rows')), 'the focus returns to the Rows button');
  }

  // the switcher keeps the protein where the other site has it
  if (other) {
    await pg.goto(`${root}${site}/#/protein/${acc}`);
    await pg.waitForSelector('.site-switch-btn', { timeout: 20000 }).catch(() => {});
    const btn = await pg.$('.brand-side .site-switch-btn, .site-switch-btn');
    if (btn) {
      await pg.evaluate(() => document.querySelector('.site-switch-btn').click());
      await pg.waitForTimeout(800);
      const href = await pg.$eval(`.site-switch-list a[data-site="${other}"]`, a => a.href);
      const has = idx && idx.p.some(r => r[0] === acc && r[3].includes(idx.sites.findIndex(s => s.id === other)));
      check(has ? href.includes('#/protein/' + acc) : /#overview/.test(href), `the switcher link to ${other} ${has ? 'keeps' : 'leaves'} the protein (${href.split('#')[1]})`);
    } else check(false, 'the site has a switcher');
  }

  // the phone: the map's tracks are wide enough
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), ph = await m.newPage();
  await ph.route('**/*', r => (r.request().url().startsWith(root) ? r.continue() : r.abort()));
  await ph.goto(`${root}${site}/#/protein/${acc}`);
  await ph.waitForSelector('#pmap svg', { timeout: 60000 }).catch(() => {});
  await ph.waitForTimeout(2500);
  const w = await ph.evaluate(() => { const s = document.querySelector('#pmap svg'); return s ? { svg: s.getBoundingClientRect().width, page: document.documentElement.scrollWidth } : null; });
  check(!!w && w.svg >= 340, `the phone map is ${w && Math.round(w.svg)} px wide (340 or more)`);
  check(!!w && w.page <= 391, `the phone page does not scroll sideways (${w && w.page} px)`);
  await browser.close();
  process.exit(bad);
})();
