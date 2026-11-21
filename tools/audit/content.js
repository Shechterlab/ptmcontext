#!/usr/bin/env node
/* Do the in-site links lead to a page with content? Optional, local or manual (not a CI job); it goes beyond links.js, which only checks that a link
   resolves to a view.
   node tools/audit/content.js <site-url> [--workers N] [--max-links N] [--selection "als_ftd"] [--no-selection] [--only "#overview,#sites"] [--verbose] [--out report.json]
   Visits the Overview, each question page, Proteins, Sites, Interactions, Network, All tests, Methods & data and Help, and two protein pages, each
   without and with a selection (the first example search the page offers). On each page every in-site link it draws (tiles, "See in network",
   "Compare with", protein and site links, Methods links) is followed, as is each button of the kind that opens another view (See in network, Compare
   with, Open ...). The page each lands on is read and flagged when it shows an empty-state message ("nothing to draw", "No proteins", an
   error) or hardly any content. A landing is "empty for a non-empty selection" when the selection bar of the page it came from holds marks: that
   one is a bug unless the data really has none. The others are listed as empty for review (some are legitimately empty).
   --landing (on the URL of a pages build's landing page, with --names FUS,TP53) checks the explorer cards and the search results instead.
   Exit 1 when a link lands empty for a non-empty selection. JSON report on stdout (or --out); a summary on stderr. */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--') && /^https?:/.test(a));
if (!base) {
  console.error(
    'usage: content.js <site-url> [--workers N] [--max-links N] [--selection q] [--selection-only] [--no-selection] [--only "#a,#b"] [--out file]'
  );
  process.exit(2);
}
const opt = (k) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : null;
};
const flag = (k) => args.includes('--' + k);
const WORKERS = +(opt('workers') || 4);
const MAXL = +(opt('max-links') || 60);
const root = base.replace(/#.*$/, '');
const report = { checked: 0, empty_for_selection: [], empty: [], errors: [], visited: [] };
const log = (...a) => flag('verbose') && console.error(...a);

// the words of an empty page
const EMPTY =
  /nothing to (draw|show|plot)|\bno (protein|site|mark|methyl|phospho|result|match|data|link|partner|interaction|region|term)[a-z]*\b|could not be read|failed to|an error|no such|is empty|nothing here|nothing selected|there are none/i;
// phrases that are the right answer for a part of a page (a protein outside the selection, a class with no member, a residue with no record)
const EXPECTED =
  /match your selection; the others are faded|\bno [a-z ]+ (recorded|within|record at)|no term of \d+ or more|^–\s+0 of 0|in 0 (IDRs|[a-z]+)$|is not in this network|nothing selected|^no [a-z]+ in this explorer$|folded, as no |\bno [a-z]+ (resolved|in construct)/i;
// a page is settled when its text and the selection bar have stopped changing (a view can draw once before its data arrives and again after)
const settle = async (pg) => {
  let last = null,
    same = 0;
  for (let i = 0; i < 40 && same < 3; i++) {
    const t = await pg
      .evaluate(
        () =>
          (document.getElementById('view')?.innerText || '') + '|' + (document.getElementById('scope')?.innerText || '')
      )
      .catch(() => '');
    const loading = /Loading the|Loading…|Looking for/.test(t.slice(0, 600));
    same = !loading && t.length > 30 && t === last ? same + 1 : 0;
    last = t;
    await pg.waitForTimeout(500);
  }
};
const READ = () => {
  const v = document.getElementById('view');
  const text = v ? v.innerText : '';
  const sc = document.getElementById('scope');
  const m = (sc?.innerText || '').match(/([\d,]+) of ([\d,]+) [^\n]*? on ([\d,]+) proteins?/);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    hash: location.hash,
    len: text.length,
    marks: m ? +m[1].replace(/,/g, '') : null,
    graphics: v ? v.querySelectorAll('svg, canvas, table, img').length : 0,
    head: lines.slice(0, 2).join(' | ').slice(0, 120),
    lines,
  };
};
const ANCHORS = () =>
  [...document.querySelectorAll('#view a[href^="#"]')].map((a) => ({
    href: a.getAttribute('href'),
    text: (a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50),
  }));
const BUTTONS = () => {
  const out = [];
  document.querySelectorAll('#view button, #view [role=button]').forEach((b, i) => {
    const t = (b.textContent || '').trim().replace(/\s+/g, ' ');
    if (/^(see in network|compare with|open|show in the network|view in network)/i.test(t) && b.offsetParent) {
      b.setAttribute('data-ca', String(out.length));
      out.push({ i: out.length, text: t.slice(0, 50) });
    }
    void i;
  });
  return out;
};

function judge(r, from) {
  const hits = r.lines.filter((l) => EMPTY.test(l) && !EXPECTED.test(l) && l.length < 260);
  // the Compare page holds one set until a second is added: its start is short by design
  const thin = !/^#overlap/.test(r.hash) && (r.len < 250 || (r.graphics === 0 && r.len < 600));
  if (!hits.length && !thin) return null;
  return {
    from: from.where,
    link: from.link,
    text: from.text,
    lands: r.hash,
    selection_marks: from.marks,
    why: hits.length ? hits.slice(0, 2).map((h) => h.slice(0, 140)) : ['hardly any content (' + r.len + ' characters)'],
  };
}

async function visitPage(ctx, h, sel, seen) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  const full = root + h + (sel ? (h.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(sel) : '');
  const where = h + (sel ? ' [selection]' : '');
  const go = async (url) => {
    await pg.goto('about:blank');
    await pg.goto(url, { waitUntil: 'load' });
    await settle(pg);
  };
  await go(full);
  report.visited.push(where);
  const here = await pg.evaluate(READ);
  const from = { where, marks: here.marks };
  if (errs.length) report.errors.push({ where, why: errs[0] });
  // the page itself, as an address opens it (a link may carry settings such as colour= or clusters=)
  const own = judge(here, { ...from, link: '(the address itself)', text: '' });
  if (own) (own.selection_marks > 0 ? report.empty_for_selection : report.empty).push(own);
  const anchors = (await pg.evaluate(ANCHORS)).filter((a) => a.href.length > 1 && !/[{}]|%7B/.test(a.href));
  const uniq = [...new Map(anchors.map((a) => [a.href, a])).values()].slice(0, MAXL);
  for (const a of uniq) {
    const key = (sel ? 'S' : '-') + a.href + '|' + here.marks;
    if (seen.has(key)) continue;
    seen.add(key);
    // a link keeps the selection only when the page writes it into the link; a hash change keeps the page's own state
    await pg.evaluate((x) => (location.hash = x), a.href);
    await settle(pg);
    const r = await pg.evaluate(READ);
    report.checked++;
    const bad = judge(r, { ...from, link: a.href, text: a.text });
    if (bad) (bad.selection_marks > 0 ? report.empty_for_selection : report.empty).push(bad);
    log(bad ? 'EMPTY' : 'ok   ', where, a.href);
  }
  // buttons that open another view: clicked after a reload; the landing is judged like a link's
  const btns = (await pg.evaluate(BUTTONS)).slice(0, 12);
  for (const b of btns) {
    const key = (sel ? 'S' : '-') + 'btn:' + b.text + '|' + h;
    if (seen.has(key)) continue;
    seen.add(key);
    await go(full);
    await pg.evaluate(BUTTONS);
    const loc = pg.locator(`[data-ca="${b.i}"]`).first();
    try {
      await loc.click({ timeout: 3000 });
    } catch (e) {
      void e;
      continue;
    }
    await settle(pg);
    const r = await pg.evaluate(READ);
    report.checked++;
    const bad = judge(r, { ...from, link: 'button: ' + b.text, text: b.text });
    if (bad) (bad.selection_marks > 0 ? report.empty_for_selection : report.empty).push(bad);
    log(bad ? 'EMPTY' : 'ok   ', where, 'button', b.text);
  }
  await pg.close();
}

// the landing page of a pages build: each explorer card, then the search results of a few names, each followed to the page it opens
async function landing(browser, url, names) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pg = await ctx.newPage();
  const open = async (u) => {
    await pg.goto('about:blank');
    await pg.goto(u, { waitUntil: 'load' });
    await settle(pg);
  };
  const judgeHere = async (link, text, where) => {
    const r = await pg.evaluate(READ);
    report.checked++;
    const bad = judge(r, { where, link, text, marks: null });
    if (bad) report.empty.push(bad);
    log(bad ? 'EMPTY' : 'ok   ', where, link);
  };
  await pg.goto(url);
  await pg.waitForTimeout(2500);
  const cards = await pg.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map((a) => [a.getAttribute('href'), a.textContent.trim().slice(0, 40)])
      .filter(([h]) => h && !/^(https?:|#|mailto:)/.test(h))
  );
  for (const [h, t] of cards) {
    await open(new URL(h, url).href);
    await judgeHere(h, t, 'landing card');
  }
  for (const n of names) {
    await open(url);
    await pg.fill('#land-q', n).catch(() => {});
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(2500);
    const hits = await pg.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((a) => [a.getAttribute('href'), a.textContent.trim().slice(0, 40)])
        .filter(([h]) => /#\/?protein\//.test(h || ''))
    );
    if (!hits.length)
      report.empty.push({ from: 'landing search', link: n, text: '', lands: '', why: ['no result for ' + n] });
    for (const [h, t] of hits.slice(0, 6)) {
      await open(new URL(h, url).href);
      await judgeHere(h, t, 'landing search ' + n);
    }
  }
  await ctx.close();
}

async function finish(browser) {
  await browser.close();
  const out = JSON.stringify(report, null, 1);
  if (opt('out')) fs.writeFileSync(opt('out'), out);
  else console.log(out);
  console.error(
    `${report.visited.length} pages, ${report.checked} landings; ${report.empty_for_selection.length} empty for a non-empty selection, ` +
      `${report.empty.length} empty (review), ${report.errors.length} errors`
  );
  report.empty_for_selection.forEach((b) =>
    console.error(`EMPTY FOR SELECTION  ${b.from} -> ${b.link} (${b.lands}): ${b.why.join(' / ')}`)
  );
  process.exit(report.empty_for_selection.length ? 1 : 0);
}

(async () => {
  const browser = await chromium.launch();
  if (flag('landing')) {
    await landing(browser, base, (opt('names') || 'FUS,TP53,A1CF').split(','));
    return finish(browser);
  }
  const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pg = await ctx0.newPage();
  await pg.goto(root + '#overview');
  await settle(pg);
  const eg = opt('selection') || (await pg.evaluate(() => document.querySelector('[data-try]')?.dataset.try || ''));
  const seeds = await pg.evaluate(() =>
    [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').split('?')[0])
  );
  const prot = [];
  for (const v of ['#proteins', '#interactions']) {
    await pg.goto('about:blank');
    await pg.goto(root + v);
    await settle(pg);
    prot.push(
      ...(await pg.evaluate(() =>
        [...document.querySelectorAll('a[href*="#protein/"]')].map((a) => a.getAttribute('href').split('?')[0])
      ))
    );
  }
  await ctx0.close();
  const views = [
    '#overview',
    '#proteins',
    '#sites',
    '#idrs',
    '#interactions',
    '#network',
    '#statistics',
    '#method',
    '#help',
  ];
  let pages = [...new Set([...views, ...seeds.filter((h) => /^#(overview|interactions|method)\//.test(h))])];
  if (opt('only')) pages = opt('only').split(',');
  const jobs = [...pages, ...[...new Set(prot)].slice(0, 2)].flatMap((h) =>
    eg && !flag('no-selection')
      ? flag('selection-only')
        ? [[h, eg]]
        : [
            [h, ''],
            [h, eg],
          ]
      : [[h, '']]
  );
  report.selection = eg;
  const seen = new Set();
  let next = 0;
  const worker = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    for (;;) {
      const k = next++;
      if (k >= jobs.length) break;
      try {
        await visitPage(ctx, jobs[k][0], jobs[k][1], seen);
      } catch (e) {
        report.errors.push({ where: jobs[k].join(' '), why: String(e.message).slice(0, 140) });
      }
    }
    await ctx.close();
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  await finish(browser);
})();
