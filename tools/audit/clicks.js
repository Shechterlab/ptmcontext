#!/usr/bin/env node
/* Click audit of a built set of pages: every interactive control of the landing page and of each site's routes is activated once, on a
   fresh load, and a defect is recorded when nothing happens (no navigation, DOM change, download, dialog or new tab), when a script
   error is thrown, when a link target answers 404, or when the page is left empty. Controls that look the same (same tag, label and
   class) are tried once per page, to keep the run short. The audit knows no site: sites come from sites.json at the landing root.
   Usage:  NODE_PATH=<dir with playwright> node tools/audit/clicks.js <landing url> [--site id] [--phone] [--protein ACC] [--max N] [--out file.json]
   Prints each defect and exits with their number. Optional; not part of CI. */
const { chromium } = require('playwright');

const args = process.argv.slice(2),
  opt = (n, d) => {
    const i = args.indexOf('--' + n);
    return i >= 0 ? args[i + 1] : d;
  },
  base = args.find((a) => /^https?:/.test(a));
if (!base) {
  console.error('usage: clicks.js <landing url> [--site id] [--phone] [--protein ACC] [--max N] [--out file.json]');
  process.exit(2);
}
const root = base.replace(/\/(index\.html)?$/, '/'),
  size = args.includes('--phone') ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  MAX = +opt('max', 160),
  defects = [];

// Tag each visible control with data-clk=<n> and describe it. Returns the list of descriptions.
const ENUM = () => {
  const out = [],
    seen = new Set();
  const sel =
    'a[href],button,[role=button],[role=menuitem],[role=tab],[role=switch],[role=radio],summary,select,input[type=checkbox],input[type=radio],[tabindex="0"],[data-go],[data-act],[data-route],[data-href]';
  const cand = new Set(document.querySelectorAll(sel));
  document.querySelectorAll('body *').forEach((e) => {
    if (e.children.length > 12) return;
    if (getComputedStyle(e).cursor === 'pointer') cand.add(e);
  });
  let n = 0;
  cand.forEach((e) => {
    const r = e.getBoundingClientRect(),
      cs = getComputedStyle(e);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || e.disabled) return;
    if (e.closest('[inert],[hidden],[aria-hidden=true]') || e.closest('[aria-disabled=true]')) return; // a control shown as unavailable is not tried
    const dt = e.closest('details:not([open])');
    if (dt && !(e.tagName === 'SUMMARY' && e.parentElement === dt)) return; // inside a closed fold
    // a child of a control already listed is not a second control
    let p = e.parentElement;
    while (p && !cand.has(p)) p = p.parentElement;
    if (p && p !== document.body && cs.cursor === 'pointer' && !e.matches(sel)) return;
    const label = (e.getAttribute('aria-label') || e.innerText || e.value || e.title || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 60),
      key =
        e.tagName +
        '|' +
        label +
        '|' +
        (e.getAttribute('href') || '') +
        '|' +
        (e.className && e.className.baseVal === undefined ? e.className : '');
    if (seen.has(key)) return;
    seen.add(key);
    e.setAttribute('data-clk', n);
    out.push({
      n: n++,
      tag: e.tagName.toLowerCase(),
      label,
      href: e.getAttribute('href') || '',
      target: e.getAttribute('target') || '',
      type: e.getAttribute('type') || '',
      cls: String(e.className && e.className.baseVal === undefined ? e.className : '').slice(0, 50),
      id: e.id || '',
    });
  });
  return out;
};

// A cheap fingerprint of what the reader can see and change on the page.
const STATE = () => {
  const b = document.body;
  let ex = '';
  document.querySelectorAll('[aria-expanded],[aria-pressed],[aria-checked],[aria-selected],details').forEach((e) => {
    ex +=
      (e.getAttribute('aria-expanded') || '') +
      (e.getAttribute('aria-pressed') || '') +
      (e.getAttribute('aria-checked') || '') +
      (e.getAttribute('aria-selected') || '') +
      (e.open ? 'o' : '') +
      ';';
  });
  return [
    location.href,
    b.innerText.length,
    b.innerText.slice(0, 400),
    document.querySelectorAll('*').length,
    ex,
    document.querySelectorAll('dialog[open],[role=dialog],[role=menu],[role=listbox]').length,
    document.documentElement.className,
    document.documentElement.getAttribute('data-theme') || '',
    scrollY,
  ].join('|');
};

(async () => {
  const browser = await chromium.launch(),
    ctx = await browser.newContext({ viewport: size, acceptDownloads: true, reducedMotion: 'reduce' }),
    linkStatus = new Map();
  const head = async (url) => {
    if (linkStatus.has(url)) return linkStatus.get(url);
    let s = 0;
    try {
      const r = await ctx.request.get(url, { timeout: 15000, maxRedirects: 5 });
      s = r.status();
    } catch (e) {
      s = -1;
    }
    linkStatus.set(url, s);
    return s;
  };
  const defect = (page, ctl, expected, actual) => {
    defects.push({ page, control: ctl, expected, actual });
    console.log('DEFECT ' + page + ' | ' + ctl + ' | ' + expected + ' | ' + actual);
  };

  async function audit(url) {
    const pg = await ctx.newPage(),
      errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    pg.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|rest\.ensembl\.org|CORS/.test(m.text()))
        errs.push(m.text());
    });
    const open = async () => {
      errs.length = 0;
      await pg.goto('about:blank'); // a hash-only change would keep the page and its state
      await pg.goto(url, { waitUntil: 'load' });
      await pg.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await pg.waitForTimeout(first ? 1500 : 700);
      // a slow page is let finish drawing: its element count must hold for 0.9 s
      let n0 = -1;
      for (let k = 0; k < 40; k++) {
        const n = await pg.evaluate(() => document.querySelectorAll('*').length);
        if (n === n0) break;
        n0 = n;
        await pg.waitForTimeout(900);
      }
      first = false;
    };
    let first = true;
    await open();
    if (errs.length) defect(url, '(page load)', 'no script error', errs.join(' / ').slice(0, 200));
    const empty = await pg.evaluate(() => document.body.innerText.trim().length < 40);
    if (empty) defect(url, '(page)', 'visible content', 'page is empty');
    const ctls = await pg.evaluate(ENUM);
    const list = ctls.slice(0, MAX);
    console.log(`-- ${url} (${size.width}px): ${ctls.length} controls${ctls.length > MAX ? ', first ' + MAX : ''}`);
    let tagged = true;
    for (const c of list) {
      const name = `${c.tag}${c.id ? '#' + c.id : ''}[${c.label || c.href || c.cls}]`;
      if (/^Skip to/.test(c.label)) continue; // shown on focus only
      if (!tagged) {
        await open();
        await pg.evaluate(ENUM);
        tagged = true;
      }
      const loc = pg.locator(`[data-clk="${c.n}"]`).first();
      if (!(await loc.count())) continue;
      const ext = c.href && /^https?:/.test(c.href) && !c.href.startsWith(root);
      // a link: check its target answers
      if (c.tag === 'a' && c.href && !c.href.startsWith('#') && !/^(mailto|tel|javascript):/.test(c.href)) {
        const abs = await loc.evaluate((e) => e.href);
        const s = ext ? 200 : await head(abs.split('#')[0]);
        if (s === 404 || s === -1) defect(url, name, 'target answers', `${abs} -> ${s}`);
        if (ext || c.target === '_blank') continue; // opening other sites or tabs is not tested further
      }
      if (c.tag === 'a' && c.href === '#') {
        // a bare # link must still do something visible
      }
      if (c.tag === 'select') {
        const opts = await loc.evaluate((e) => [...e.options].map((o) => o.value));
        if (opts.length < 2) {
          defect(url, name, 'a choice of values', `${opts.length} option`);
          continue;
        }
        const before = await pg.evaluate(STATE);
        await loc.selectOption(opts[opts.length - 1]).catch(() => {});
        await pg.waitForTimeout(400);
        if ((await pg.evaluate(STATE)) === before) defect(url, name, 'page changes with the choice', 'nothing changed');
        tagged = false;
        continue;
      }
      errs.length = 0;
      const pre = await loc
          .evaluate(
            (e) =>
              !!(
                e.getAttribute('aria-current') ||
                e.getAttribute('aria-pressed') === 'true' ||
                e.getAttribute('aria-checked') === 'true' ||
                e.checked ||
                e.getAttribute('aria-selected') === 'true'
              )
          )
          .catch(() => false),
        before = await pg.evaluate(STATE),
        pages0 = ctx.pages().length;
      let dl = null,
        dlg = null;
      const onDl = (d) => (dl = d.suggestedFilename()),
        onDlg = (d) => {
          dlg = d.message();
          d.dismiss().catch(() => {});
        };
      pg.on('download', onDl);
      pg.on('dialog', onDlg);
      // a real click at the control's centre once scrolled into view; a control something else covers is a defect
      // tried where it is, then centred, then with the page at its top or its foot (a header that hides on the way down is back there)
      const hit = await loc
        .evaluate(async (e) => {
          const probe = () => {
            const r = e.getBoundingClientRect(),
              x = Math.round(r.left + r.width / 2),
              y = Math.round(r.top + r.height / 2);
            if (r.width < 1 || r.height < 1 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight)
              return { x, y, ok: false, by: 'outside the window' };
            const t = document.elementFromPoint(x, y);
            return {
              x,
              y,
              ok: !!t && (e === t || e.contains(t) || t.contains(e)),
              by: t ? t.tagName + '.' + String(t.className.baseVal ?? t.className).slice(0, 30) : 'nothing',
            };
          };
          const wait = () => new Promise((r) => setTimeout(r, 300));
          let h = probe();
          for (const f of [
            () => e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }),
            () => scrollTo({ top: 0, behavior: 'instant' }),
            () => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
          ]) {
            if (h.ok) break;
            f();
            await wait();
            h = probe();
          }
          return h;
        })
        .catch(() => null);
      if (!hit || !(await loc.isVisible().catch(() => false))) {
        pg.off('download', onDl);
        pg.off('dialog', onDlg);
        tagged = false;
        defect(url, name, 'a visible control', 'not visible when tried');
        continue;
      }
      if (!hit.ok) {
        pg.off('download', onDl);
        pg.off('dialog', onDlg);
        defect(url, name, 'clickable', 'covered by ' + hit.by);
        tagged = false;
        continue;
      }
      await pg.mouse.click(hit.x, hit.y);
      await pg.waitForTimeout(450);
      pg.off('download', onDl);
      pg.off('dialog', onDlg);
      const after = await pg.evaluate(STATE).catch(() => 'gone');
      const newTab = ctx.pages().length > pages0;
      if (newTab) {
        for (const p of ctx.pages().slice(pages0)) await p.close().catch(() => {});
      }
      const same = c.tag === 'a' && c.href.startsWith('#') && c.href.slice(1) === before.split('|')[0].split('#')[1]; // the link to the page already open
      const fine = same || dl || dlg || newTab || after !== before;
      if (errs.length) defect(url, name, 'no script error', errs.join(' / ').slice(0, 200));
      if (!fine) {
        // a toggle that is the same state after (e.g. already-selected radio) is not a defect
        const already = pre;
        if (!already) defect(url, name, 'navigation, DOM change, download or dialog', 'nothing happened');
      } else if (after !== 'gone' && !dl && !dlg) {
        const emptyNow = await pg.evaluate(() => document.body.innerText.trim().length < 40).catch(() => false);
        if (emptyNow) defect(url, name, 'content after the click', 'page is empty');
      }
      tagged = false;
    }
    await pg.close();
  }

  const reg = await (await ctx.request.get(root + 'sites.json')).json().catch(() => ({ sites: [] }));
  const only = opt('site', ''),
    sites = args.includes('--landing') ? [] : reg.sites.map((s) => s.id).filter((i) => !only || i === only);
  if (!only) await audit(root);
  for (const id of sites) {
    const s = root + id + '/';
    // routes: the fixed ones, then the Methods sub-pages and one protein page found on the site itself
    const routes = ['#overview', '#proteins', '#sites', '#interactions', '#overlap', '#network', '#method', '#help'];
    const probe = await ctx.newPage();
    await probe.goto(s + '#method', { waitUntil: 'load' });
    await probe.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await probe.waitForTimeout(1500);
    // one address for each part of Methods (the per-question pages repeat one shape: the first of each kind is tried)
    const subs = await probe.evaluate(() => {
      const seen = new Set();
      return [...document.querySelectorAll('a[href^="#method/"]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => {
          const k = h.replace(/^#method\/(q-|every).*/, '#method/$1');
          return !seen.has(k) && seen.add(k);
        });
    });
    let acc = opt('protein', '');
    if (!acc) {
      await probe.goto(s + '#proteins', { waitUntil: 'load' });
      await probe.waitForTimeout(2500);
      acc = await probe.evaluate(() => {
        const a = [...document.querySelectorAll('a[href^="#protein/"]')][0];
        return a ? a.getAttribute('href').replace('#protein/', '') : '';
      });
    }
    await probe.close();
    if (acc) routes.push('#protein/' + acc);
    for (const m of subs) if (!routes.includes(m)) routes.push(m);
    for (const r of routes) await audit(s + r);
  }
  await browser.close();
  const out = opt('out', '');
  if (out) require('fs').writeFileSync(out, JSON.stringify(defects, null, 1));
  console.log(`${defects.length} defects`);
  process.exit(defects.length ? 1 : 0);
})();
