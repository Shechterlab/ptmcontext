#!/usr/bin/env node
/* Broken-link tracking for a built site: links and controls inside the page's cards and boxes that lead nowhere or do nothing.
   node tools/audit/links.js <base-url> [--yeast <url>] [--external] [--max N] [--workers N] [--no-selection] [--only "#overview,#help"] [--verbose] [--out report.json]
   Visits the Overview and every question page, Proteins, Sites, Disordered regions, Interactions and its question pages, All tests, Methods
   & data, Help, and three protein pages (FUS, HNRNPA1 and, with --yeast, one yeast protein), each without and with a selection (the
   first example search the page offers). On each page:
     internal links   every a[href^="#"] in the page: it must resolve to a view (the address keeps its view, the page is drawn and its
                      title says which question or section it is) or to an element id, with no page error. Checked once per mode.
     controls         buttons, summaries and clickable [data-*] boxes (cursor: pointer) inside #view: each is clicked after a reload, and
                      must change the page (the DOM or the address), fire a download or a popup, open a dialog, print or copy. Up to
                      --max per page (default 8; with a selection half of that); a control that does nothing is dead.
     external links   with --external, each a[href^=http] is fetched once (HEAD, then GET): 4xx and 5xx are broken (429 and a bot check such as Cloudflare's
                      are unverified); a network failure or timeout is unverified, listed apart and never fails the run.
   Exit 1 when an internal link is broken, a control is dead, a page throws, or (with --external) an external link answers 4xx/5xx.
   JSON report on stdout (or --out); a one-line summary and the list of breaks on stderr. */
'use strict';
const { chromium, request } = require('playwright');
const fs = require('fs');
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--') && /^https?:/.test(a));
if (!base) {
  console.error(
    'usage: links.js <base-url> [--yeast <url>] [--external] [--max N] [--workers N] [--no-selection] [--out file]'
  );
  process.exit(2);
}
const opt = (k) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : null;
};
const flag = (k) => args.includes('--' + k);
const MAX = +(opt('max') || 8);
const WORKERS = +(opt('workers') || 3);
const yeast = opt('yeast');
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const norm = (u) => u.replace(/\/?(index\.html)?(#.*)?$/, '/index.html');

const report = {
  sites: [],
  broken: [],
  dead: [],
  errors: [],
  external: { ok: 0, broken: [], unverified: [] },
  checked: { pages: 0, links: 0, controls: 0 },
};
const externals = new Map(); // url -> first page it was seen on

// what makes a control "do something": the page's markup or address changed, or a download, popup, dialog, print or copy happened
const SNAP = () => {
  const b = document.body.innerHTML;
  let h = 0;
  for (let i = 0; i < b.length; i += 7) h = (h * 31 + b.charCodeAt(i)) | 0;
  return `${location.href}|${b.length}|${h}|${window.__lk || 0}|${document.querySelectorAll('dialog[open],[role=dialog]').length}`;
};
const INIT = () => {
  window.print = () => (window.__lk = (window.__lk || 0) + 1);
  try {
    navigator.clipboard.writeText = () => ((window.__lk = (window.__lk || 0) + 1), Promise.resolve());
  } catch (e) {
    /* no clipboard */
  }
  window.open = () => ((window.__lk = (window.__lk || 0) + 1), null);
};
const settle = (pg, ms = 1200) => pg.waitForTimeout(ms);

async function open(pg, url) {
  await pg.goto('about:blank'); // a new document each time: a hash-only change would keep the state of the last click
  await pg.goto(url, { waitUntil: 'load' });
  await pg
    .waitForFunction(() => (document.getElementById('view')?.innerText || '').length > 30, null, { timeout: 20000 })
    .catch(() => {});
  await settle(pg);
}

// the controls of the page worth a click: outermost, visible, enabled
const CONTROLS = () => {
  const root = document.getElementById('view');
  if (!root) return [];
  const out = [];
  const seen = new Set();
  root.querySelectorAll('*').forEach((el) => {
    if (el.closest('a[href]') || el.closest('select, input, textarea, label')) return;
    const tag = el.tagName.toLowerCase();
    const ds = Object.keys(el.dataset || {}).length > 0;
    const isBtn =
      tag === 'button' ||
      tag === 'summary' ||
      el.getAttribute('role') === 'button' ||
      el.getAttribute('role') === 'tab';
    if (!isBtn && !(ds && getComputedStyle(el).cursor === 'pointer')) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || getComputedStyle(el).visibility === 'hidden') return;
    if (out.some((o) => o.contains(el))) return; // outermost only
    if (seen.has(el)) return;
    seen.add(el);
    out.push(el);
  });
  // the selection bar's "⋯" menu: opened, so that its items are controls of the page too (each is clicked like the rest)
  const mb = document.querySelector('#scope [data-sel-menu]');
  if (mb && mb.getAttribute('aria-expanded') === 'false') mb.click();
  const menu = new Set(document.querySelectorAll('#scope .sel-menu-pop [role="menuitem"]'));
  menu.forEach((el) => out.push(el));
  out.forEach((el, i) => el.setAttribute('data-lk', String(i)));
  return out.map((el, i) => ({
    menu: menu.has(el),
    i,
    text: (el.getAttribute('aria-label') || el.textContent || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 50),
    tag: el.tagName.toLowerCase(),
    data: Object.keys(el.dataset || {})
      .slice(0, 2)
      .join(','),
  }));
};

// every internal and external anchor of the page's cards and boxes
const ANCHORS = () => {
  const root = document.getElementById('view') || document.body;
  return [...root.querySelectorAll('a[href]')].map((a) => ({
    href: a.getAttribute('href'),
    text: (a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50),
    blank: a.target === '_blank',
  }));
};

async function checkHash(pg, url, href, state) {
  const key = href.split('?')[0];
  const mode = /[?&]q=/.test(url) ? 'selection ' : '';
  if (state.hashes.has(mode + key)) return state.hashes.get(mode + key);
  const res = { href, ok: true, why: '' };
  state.hashes.set(mode + key, res);
  if (href === '#' || href === '') return Object.assign(res, { ok: false, why: 'an empty link (#)' });
  if (/[{}]|%7B/i.test(href)) return res; // a template, not a link
  const seg = key.replace(/^#/, '').split('/')[0];
  const errs = [];
  const onerr = (e) => errs.push(String(e.message).slice(0, 120));
  pg.on('pageerror', onerr);
  await pg.evaluate((h) => (location.hash = h), href);
  await pg.waitForTimeout(600);
  const got = await pg.evaluate(
    ([key, seg]) => ({
      hash: location.hash.split('?')[0],
      title: document.title,
      len: (document.getElementById('view')?.innerText || '').length,
      head: (document.getElementById('view')?.innerText || '').slice(0, 300),
      id: !!(
        document.getElementById(decodeURIComponent(key.replace(/^#/, '').split('/').pop())) ||
        document.getElementById(decodeURIComponent(seg))
      ),
      bare: !key.includes('/'),
    }),
    [key, seg]
  );
  pg.off('pageerror', onerr);
  const sameView = got.hash.replace(/^#/, '').split('/')[0] === seg;
  if (errs.length) Object.assign(res, { ok: false, why: 'page error: ' + errs[0] });
  else if (!sameView && !got.id)
    Object.assign(res, { ok: false, why: `goes to ${got.hash || '#'}, not a view or an element` });
  else if (sameView && got.len < 30 && !got.id) Object.assign(res, { ok: false, why: 'draws an empty page' });
  else if (
    sameView &&
    key.includes('/') &&
    !got.id &&
    (seg === 'overview' || seg === 'interactions') &&
    state.roots.get(seg)?.has(got.head)
  )
    Object.assign(res, { ok: false, why: 'draws the start of the view: no such section or question' });
  void url;
  return res;
}

async function visit(ctx, site, label, url, sel, state, out) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  let downloads = 0;
  pg.on('download', () => downloads++);
  let popups = 0;
  pg.on('popup', (p) => (popups++, p.close().catch(() => {})));
  pg.on('dialog', (d) => (state.dialogs++, d.dismiss().catch(() => {})));
  await pg.addInitScript(INIT);
  const full = url + (sel ? (url.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(sel) : '');
  const where = `${site} ${label}${sel ? ' [selection]' : ''}`;
  await open(pg, full);
  out.checked.pages++;
  if (errs.length) out.errors.push({ where, why: errs[0] });
  // anchors
  const anchors = await pg.evaluate(ANCHORS);
  for (const a of anchors) {
    out.checked.links++;
    if (/^#/.test(a.href)) {
      const r = await checkHash(pg, full, a.href, state);
      if (!r.ok && !state.reported.has(a.href + '|' + r.why)) {
        state.reported.add(a.href + '|' + r.why);
        out.broken.push({ where, href: a.href, text: a.text, why: r.why });
      }
      await pg.evaluate((h) => (location.hash = h), new URL(full).hash);
      await pg.waitForTimeout(300);
    } else if (/^https?:/i.test(a.href)) {
      if (!externals.has(a.href)) externals.set(a.href, { where, text: a.text });
    } else if (/^(mailto:|tel:)/i.test(a.href)) {
      /* not checked */
    } else if (/^javascript:/i.test(a.href))
      out.broken.push({ where, href: a.href, text: a.text, why: 'a javascript: link' });
  }
  // controls
  const controls = await pg.evaluate(CONTROLS);
  const max = sel ? Math.ceil(MAX / 2) : MAX;
  const body = controls.filter((c) => !c.menu),
    items = state.menuDone ? [] : controls.filter((c) => c.menu); // the menu's items: all of them, once per site
  if (items.length) state.menuDone = true;
  const pick = [
    ...(body.length <= max ? body : body.filter((_, k) => k % Math.ceil(body.length / max) === 0).slice(0, max)),
    ...items,
  ];
  for (const c of pick) {
    out.checked.controls++;
    await open(pg, full);
    await pg.evaluate(CONTROLS);
    const loc = pg.locator(`[data-lk="${c.i}"]`).first();
    const e0 = errs.length;
    const d0 = downloads + popups + state.dialogs;
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      await loc.hover({ timeout: 3000 }).catch(() => {});
      await pg.waitForTimeout(150);
      const before = await pg.evaluate(SNAP);
      await loc.click({ timeout: 3000 });
      await pg.waitForTimeout(900);
      const after = await pg.evaluate(SNAP).catch(() => 'navigated');
      const did = after !== before || downloads + popups + state.dialogs > d0;
      if (errs.length > e0) out.errors.push({ where, control: `${c.tag} “${c.text}”`, why: errs[errs.length - 1] });
      else if (!did)
        out.dead.push({
          where,
          control: `${c.tag} “${c.text}”${c.data ? ' [' + c.data + ']' : ''}`,
          why: 'nothing changed after a click',
        });
    } catch (e) {
      // not clickable here (covered, moved away): not a break of the page's own
      void e;
    }
  }
  await pg.close();
}

async function discover(ctx, root) {
  const pg = await ctx.newPage();
  await open(pg, root + '#overview');
  const seeds = [];
  const add = async () => {
    const h = await pg.evaluate(() =>
      [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').split('?')[0])
    );
    h.forEach((x) => seeds.push(x));
  };
  await add();
  const eg = await pg.evaluate(() => document.querySelector('[data-try]')?.dataset.try || '');
  const ix = await (async () => {
    await open(pg, root + '#interactions');
    await add();
    return null;
  })();
  void ix;
  const gene =
    (await pg.evaluate(() =>
      [...document.querySelectorAll('a[href*="#protein/"]')].map((a) => a.getAttribute('href').split('?')[0])
    )) || [];
  await open(pg, root + '#proteins');
  const prot = await pg.evaluate(() =>
    [...document.querySelectorAll('a[href*="#protein/"]')].map((a) => a.getAttribute('href').split('?')[0])
  );
  // the three protein pages: FUS and HNRNPA1 by name when the site has them, else the first proteins its table lists
  const have = (g) => [...gene, ...prot, ...seeds].find((h) => new RegExp('^#protein/' + g + '(/|$)', 'i').test(h));
  await pg.close();
  const views = ['#overview', '#proteins', '#sites', '#idrs', '#interactions', '#statistics', '#method', '#help'];
  const pages = [...new Set([...views, ...seeds.filter((h) => /^#(overview|interactions|method)\//.test(h))])];
  const proteins = [have('FUS') || '#protein/FUS', have('HNRNPA1') || '#protein/HNRNPA1'];
  return { pages, proteins, prot: prot[0], eg };
}

async function runSite(browser, name, root, isYeast) {
  const ctx0 = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
  });
  const d = await discover(ctx0, root);
  await ctx0.close();
  const jobs = [];
  const only = opt('only') ? opt('only').split(',') : null;
  const pages = only ? d.pages.filter((h) => only.includes(h)) : d.pages;
  const proteins = isYeast ? [d.prot].filter(Boolean) : d.proteins;
  [...pages, ...proteins].forEach((h) => {
    jobs.push([h, '']);
    if (d.eg && !flag('no-selection')) jobs.push([h, d.eg]);
  });
  report.sites.push({ site: name, url: root, pages: pages.length, proteins, selection: d.eg });
  const state = { hashes: new Map(), roots: new Map(), reported: new Set(), dialogs: 0 };
  // what the views draw at their start, with and without the selection: a section address that draws it names nothing
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const pg = await ctx.newPage();
    for (const v of ['overview', 'interactions'])
      for (const q of d.eg ? ['', '?q=' + encodeURIComponent(d.eg)] : ['']) {
        await open(pg, root + '#' + v + q);
        const t = await pg.evaluate(() => (document.getElementById('view')?.innerText || '').slice(0, 300));
        (state.roots.get(v) || state.roots.set(v, new Set()).get(v)).add(t);
      }
    await ctx.close();
  }
  let next = 0;
  const worker = async () => {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ['clipboard-read', 'clipboard-write'],
      acceptDownloads: true,
    });
    for (;;) {
      const k = next++;
      if (k >= jobs.length) break;
      const [h, sel] = jobs[k];
      if (flag('verbose')) console.error(`[${k + 1}/${jobs.length}] ${name} ${h}${sel ? ' [selection]' : ''}`);
      try {
        await visit(ctx, name, h, root + h, sel, state, report);
      } catch (e) {
        report.errors.push({ where: `${name} ${h}`, why: 'the visit failed: ' + String(e.message).slice(0, 120) });
      }
    }
    await ctx.close();
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
}

async function checkExternal() {
  const rc = await request.newContext(proxy ? { proxy: { server: proxy } } : {});
  const list = [...externals.entries()];
  let next = 0;
  const one = async () => {
    for (;;) {
      const k = next++;
      if (k >= list.length) break;
      const [url, src] = list[k];
      if (/[{}]|%7B/i.test(url)) continue;
      let status = null;
      let err = '';
      let challenge = false; // a bot check (Cloudflare), not an answer about the page
      for (const method of ['head', 'get']) {
        try {
          const r = await rc[method](url, {
            timeout: 20000,
            maxRedirects: 5,
            headers: { 'user-agent': 'Mozilla/5.0 (link audit)' },
          });
          status = r.status();
          challenge = !!r.headers()['cf-mitigated'];
          if (status < 400 || method === 'get') break;
        } catch (e) {
          err = String(e.message).split('\n')[0].slice(0, 100);
          status = null;
        }
      }
      if (status != null && status < 400) report.external.ok++;
      else if (status != null && status !== 429 && !challenge) report.external.broken.push({ url, status, ...src });
      else
        report.external.unverified.push({
          url,
          why: challenge
            ? `HTTP ${status} (bot check)`
            : status === 429
              ? 'HTTP 429 (rate-limited)'
              : err || 'no answer',
          ...src,
        });
    }
  };
  await Promise.all(Array.from({ length: 6 }, one));
  await rc.dispose();
}

(async () => {
  const browser = await chromium.launch();
  await runSite(browser, 'main', norm(base), false);
  if (yeast) await runSite(browser, 'yeast', norm(yeast), true);
  await browser.close();
  if (flag('external')) await checkExternal();
  const fail =
    report.broken.length +
    report.dead.length +
    report.errors.length +
    (flag('external') ? report.external.broken.length : 0);
  const out = JSON.stringify(report, null, 1);
  if (opt('out')) fs.writeFileSync(opt('out'), out);
  else console.log(out);
  const L = [];
  report.broken.forEach((b) => L.push(`BROKEN LINK  ${b.where}: ${b.href} (“${b.text}”) ${b.why}`));
  report.dead.forEach((b) => L.push(`DEAD CONTROL ${b.where}: ${b.control} ${b.why}`));
  report.errors.forEach((b) => L.push(`PAGE ERROR   ${b.where}${b.control ? ' ' + b.control : ''}: ${b.why}`));
  report.external.broken.forEach((b) => L.push(`HTTP ${b.status}     ${b.url} (on ${b.where})`));
  report.external.unverified.forEach((b) => L.push(`unverified   ${b.url}: ${b.why} (on ${b.where})`));
  console.error(
    `${report.checked.pages} pages, ${report.checked.links} links, ${report.checked.controls} controls; ` +
      `${report.broken.length} broken, ${report.dead.length} dead, ${report.errors.length} errors` +
      (flag('external')
        ? `; external ${report.external.ok} ok, ${report.external.broken.length} broken, ${report.external.unverified.length} unverified`
        : '')
  );
  if (L.length) console.error(L.join('\n'));
  process.exit(fail ? 1 : 0);
})();
