#!/usr/bin/env node
/* Scripted site audit: hovers, layout shifts and wording, page by page, as JSON on stdout (no screenshots).
   node tools/audit/audit.js <base-url> [--checks hovers,shifts,words,prose,motion,clicks,links,net] [--pages "#overview,#sites"] [--width 1440]
   prose: words of body text and of hover text (tip functions and title attributes, called in the page, no mouse), hover median/p95/max
   words and the count over 40, semicolons and colons per 100 words, mean sentence length, Flesch-Kincaid grade.
   motion: boxes of tiles, bars and headings sampled every 200 ms for 4 s after load, after hovers and after a selection change.
   links: per page, elements that look clickable (cursor:pointer, outermost, not inside a[href], not summary or form controls) but are not links; tiles and rows with a data-href (Ctrl/Cmd or middle click opens it) are counted apart, by tag, and external a[href^=http] without target=_blank.
   clicks: every fold, tab and button is clicked; those that throw or change nothing are listed. net: failed requests.
   Pages default to the Overview, the first questions, Proteins, Sites, Method, Help, a selection, and three protein
   pages drawn from the site's own data. Works on any ptmcontext site, and on the original explorer for 'words'. */
'use strict';
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const base = args[0];
if (!base) { console.error('usage: audit.js <base-url> [--checks ..] [--pages ..] [--width N]'); process.exit(2); }
const opt = k => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : null; };
const checks = (opt('checks') || 'hovers,shifts,words,motion,clicks,net').split(',');
const width = +(opt('width') || 1440);
const BAD = /\bundefined\b|\bNaN\b|(^|[\s:=(])null([\s,.)]|$)(?!model)|\[object |\$\{/;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });   // a print dialog would hold the page; the call counts as a change
  const netfail = [];
  page.on('requestfailed', r => netfail.push(`${r.failure() ? r.failure().errorText : 'failed'} ${r.url().slice(0, 140)}`));
  page.on('response', r => { if (r.status() >= 400) netfail.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
  const MOTION_SEL = '.tile, .vm-bar, .idr-bar, .focus-bar, svg .bar, svg rect[class*=bar], .bar, h1, h2, h3, summary';
  // Samples boxes (document coordinates) every `every` ms, `n` times; resolves with the list.
  const sampler = (n, every) => page.evaluate(([sel, n, every]) => new Promise(res => {
    const out = [], t0 = performance.now();
    const snap = () => {
      const seen = {}, boxes = {};
      [...document.querySelectorAll(sel)].slice(0, 400).forEach(el => {
        const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) return;
        const base = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + '|' + (el.textContent || '').trim().slice(0, 24);
        const k = base + '#' + (seen[base] = (seen[base] || 0) + 1);
        boxes[k] = [r.left + scrollX, r.top + scrollY, r.width, r.height].map(v => Math.round(v * 10) / 10);
      });
      out.push({ t: Math.round(performance.now() - t0), boxes });
      if (out.length >= n) res(out); else setTimeout(snap, every);
    };
    snap();
  }), [MOTION_SEL, n, every]);
  const motion = list => {
    const first = list[0].boxes, ch = {}; let settled = 0, added = 0, removed = 0;
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1].boxes, c = list[i].boxes;
      for (const k in c) {
        if (!(k in a)) { added++; settled = list[i].t; continue; }
        const d = c[k].map((v, j) => +(v - a[k][j]).toFixed(1));
        if (d.some(v => Math.abs(v) > 1)) {
          settled = list[i].t;
          const o = ch[k] = ch[k] || { first_ms: list[i].t, dx: 0, dy: 0, dw: 0, dh: 0 };
          o.dx += d[0]; o.dy += d[1]; o.dw += d[2]; o.dh += d[3];
        }
      }
      for (const k in a) if (!(k in c)) { removed++; settled = list[i].t; }
    }
    const mag = o => Math.abs(o.dy) + Math.abs(o.dx) + Math.abs(o.dh) + Math.abs(o.dw);
    const ent = Object.entries(ch).sort((x, y) => mag(y[1]) - mag(x[1]));
    return { tracked: Object.keys(first).length, moved_or_resized: ent.length, appeared: added, vanished: removed, settled_ms: settled,
      top: ent.slice(0, 6).map(([k, o]) => ({ el: k.slice(0, 50), first_ms: o.first_ms, dx: +o.dx.toFixed(1), dy: +o.dy.toFixed(1), dw: +o.dw.toFixed(1), dh: +o.dh.toFixed(1) })) };
  };
  await page.addInitScript(() => {
    window.__shifts = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!(e.sources || []).every(s => s.node && s.node.id === 'tip')) window.__shifts.push({ v: e.value, t: e.startTime,
      src: (e.sources || []).filter(s => !(s.node && s.node.id === 'tip')).map(s => { const n = s.node; if (!n || !n.tagName) return '?'; return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : ''); }) }); })
      .observe({ type: 'layout-shift', buffered: true }); } catch (e) { /* not supported */ }
  });
  await page.goto(base + '#overview', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const kit = await page.evaluate(() => !!window.PTMC);
  let pages = opt('pages') ? opt('pages').split(',') : null;
  if (!pages) {
    pages = ['#overview', '#proteins', '#sites', '#method', '#help'];
    if (kit) {
      const extra = await page.evaluate(() => {
        const K = window.PTMC, qs = Object.keys(K.A || {}).slice(0, 3).map(id => '#overview/' + id);
        const ps = (K.D.proteins || []).filter(p => p[4] >= 3);
        const pick = [ps[0], ps[Math.floor(ps.length / 2)], ps[ps.length - 1]].filter(Boolean).map(p => '#protein/' + (p[1] || p[0]) + '/' + p[0]);
        const g = (K.D.proteins || []).slice(0, 3).map(p => p[1] || p[0]).join(' ');
        return [...qs, ...pick, '?q=' + encodeURIComponent(g) + '#overview'];
      });
      pages.push(...extra);
    }
  }
  const clickPages = ['#overview', pages.find(h => h.startsWith('#protein/')) || '#proteins', '?q='];
  const qpage = pages.find(h => h.startsWith('#overview/')); if (qpage) clickPages.push(qpage);
  const CLICK_SEL = 'summary, button, [role=tab], .tab, .tabs a, [role=button]';
  const sigOf = () => page.evaluate(() => { const m = document.body;
    return [location.hash, location.search, m.innerHTML.length, document.querySelectorAll('*').length, document.querySelectorAll('[open]').length,
      [...document.querySelectorAll('[aria-selected],[aria-pressed],[aria-expanded]')].map(e => e.getAttribute('aria-selected') + e.getAttribute('aria-pressed') + e.getAttribute('aria-expanded')).join(''),
      document.querySelectorAll('.on,.active,.sel,.selected').length, document.body.className, (document.getElementById('tip') || {}).hidden === false, window.__printed || 0].join('|'); });
  // the visible controls, each named; the same function runs in the page for the list and for the lookup
  const named = (sel, want) => page.evaluateHandle(([sel, want]) => {
    const f = [...document.querySelectorAll(sel)].filter(el => { const r = el.getBoundingClientRect(); return !(r.width < 2 || r.height < 2 || el.disabled || el.classList.contains('skip') || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden'); });
    const nm = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' "' + (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 30).replace(/\n/g, ' ') + '"' + (() => { const a = [...el.attributes].find(x => x.name.startsWith('data-')); return a ? ' [' + a.name + (a.value.length < 14 ? '=' + a.value : '') + ']' : ''; })();
    return want === null ? f.map(nm) : f.find(el => nm(el) === want) || null;
  }, [sel, want]);
  async function clickAll(url) {
    const res = { tried: 0, silent: [], errors: [] }, t0 = Date.now(), budget = +(opt('budget') || 120) * 1000;
    await page.goto('about:blank'); await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(2000);
    const names = [...new Set(await (await named(CLICK_SEL, null)).jsonValue())];
    for (let i = 0; i < names.length && i < 45; i++) {
      if (Date.now() - t0 > budget) { res.not_reached = names.length - i; break; }
      if (opt('verbose')) console.error(i + '/' + names.length, names[i], Math.round((Date.now() - t0) / 1000) + 's');
      const el = (await named(CLICK_SEL, names[i])).asElement(); if (!el) continue;
      const before = await sigOf(); const e0 = errors.length; const tc = Date.now(); let dl = false; const onDl = () => { dl = true; }; page.once('download', onDl);
      try { await el.scrollIntoViewIfNeeded({ timeout: 800 });
        const host = await el.evaluateHandle(e => e.closest('.tile, article, .card, details') || e.parentElement), hb = await host.asElement().boundingBox();
        if (hb) await page.mouse.move(hb.x + Math.min(hb.width / 2, 60), hb.y + Math.min(hb.height / 2, 30)); // controls shown on hover
        await el.click({ timeout: 6000 }); } catch (e) { res.silent.push(names[i] + ' (not clickable: ' + String(e.message).split('\n').find(l => /intercept|visible|stable|outside|detached|Timeout/.test(l) && !/waiting for|attempt/.test(l) ) + ')'); continue; }
      const took = Date.now() - tc; if (took > 1500) (res.slow = res.slow || []).push(names[i] + ' ' + took + 'ms');
      await page.waitForTimeout(250); res.tried++;
      const after = await sigOf(); page.off('download', onDl); if (opt('verbose')) console.error('  sig');
      if (errors.length > e0) res.errors.push(names[i] + ' -> ' + errors.slice(e0).join(' / ').slice(0, 140));
      else if (before === after && !dl) res.silent.push(names[i]);
      if (after !== before || dl) { await page.goto('about:blank'); await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1200); }
    }
    return res;
  }
  const out = { base, width, kit, pages: [] };
  for (const hash of pages) {
    const url = hash.startsWith('?') ? base + hash : base + hash;
    errors.length = 0;
    await page.goto('about:blank');
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const rec = { page: hash };
    if (checks.includes('shifts')) {
      const load = await page.evaluate(() => window.__shifts.splice(0));
      rec.shift_load = +load.reduce((s, x) => s + x.v, 0).toFixed(3);
      rec.shift_load_top = top(load);
    }
    if (checks.includes('hovers') && kit) {
      const targets = await page.evaluate(() => {
        const K = window.PTMC, sels = ['.drow', '.trow', 'tr[data-i]', ...K.tips.map(t => t[0])], seen = new Set(), list = [];
        for (const sel of sels) {
          let els; try { els = [...document.querySelectorAll(sel)]; } catch (e) { continue; }
          els.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 12).forEach(el => {
            if (seen.has(el)) return; seen.add(el);
            el.setAttribute('data-audit', list.length); list.push(sel);
          });
        }
        return list;
      });
      const res = { tried: 0, none: {}, bad: {}, ok: 0 };
      for (let i = 0; i < targets.length && i < 150; i++) {
        const el = await page.$(`[data-audit="${i}"]`); if (!el) continue;
        try { await el.evaluate(e => e.scrollIntoView({ block: 'center' })); const bx = await el.boundingBox(); if (!bx) continue;
          await page.mouse.move(bx.x + Math.min(bx.width / 2, 40), bx.y + bx.height / 2); await page.waitForTimeout(60); } catch (e) { continue; }
        res.tried++;
        const t = await page.evaluate(() => { const tp = document.getElementById('tip'); return tp && !tp.hidden ? tp.innerText.trim() : ''; });
        if (!t) res.none[targets[i]] = (res.none[targets[i]] || 0) + 1;
        else if (BAD.test(t)) { res.bad[targets[i]] = (res.bad[targets[i]] || []).concat(t.slice(0, 120)).slice(0, 3); }
        else res.ok++;
      }
      const titles = await page.evaluate(re => [...document.querySelectorAll('[title]')].map(e => e.getAttribute('title')).filter(t => !t.trim() || new RegExp(re).test(t)).slice(0, 5), BAD.source);
      rec.hovers = { ...res, bad_titles: titles };
      if (checks.includes('shifts')) {
        const hv = await page.evaluate(() => window.__shifts.splice(0));
        rec.shift_hover = +hv.reduce((s, x) => s + x.v, 0).toFixed(3); rec.shift_hover_top = top(hv);
      }
    }
    if (checks.includes('motion')) {
      // sample from the load event itself, then again while hovering visible targets
      await page.goto('about:blank'); await page.goto(url, { waitUntil: 'load' });
      rec.motion_load = motion(await sampler(21, 200));
      const hp = sampler(21, 200);
      const vis = await page.evaluate(() => { const K = window.PTMC, sels = ['.drow', '.trow', 'tr[data-i]', ...(K ? K.tips.map(t => t[0]) : [])], pts = [];
        for (const sel of sels) { let els; try { els = [...document.querySelectorAll(sel)]; } catch (e) { continue; }
          for (const el of els) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom < innerHeight && pts.length < 10) pts.push([r.left + Math.min(r.width / 2, 40), r.top + r.height / 2]); } }
        return pts; });
      for (const [x, y] of vis) { await page.mouse.move(x, y); await page.waitForTimeout(250); }
      await page.mouse.move(2, 2);
      rec.motion_hover = motion(await hp);
    }
    if (checks.includes('links')) {
      rec.links = await page.evaluate(() => {
        const skip = /^(A|SUMMARY|INPUT|SELECT|TEXTAREA|LABEL|OPTION|HTML|BODY)$/, by = {}; let n = 0, handled = 0;
        for (const el of document.querySelectorAll('body *')) {
          if (skip.test(el.tagName) || el.closest('a[href]') || el.closest('[hidden]')) continue;
          if (el.hasAttribute('data-href')) handled++;
          if (el.closest('[data-href]')) continue;   // opens in a new tab on Ctrl/Cmd or middle click
          const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
          if (getComputedStyle(el).cursor !== 'pointer') continue;
          if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer' && !skip.test(el.parentElement.tagName)) continue;
          n++; const k = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''); by[k] = (by[k] || 0) + 1;
        }
        const ext = [...document.querySelectorAll('a[href^="http"]')], same = ext.filter(a => a.target !== '_blank' || !/noopener/.test(a.rel));
        return { clickable_not_link: n, row_or_tile_handlers: handled, by_kind: Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6)), external: ext.length, external_same_tab: same.length };
      });
    }
    if (checks.includes('net')) rec.net_failed = [...new Set(netfail)].slice(0, 8);
    netfail.length = 0;
    if (checks.includes('clicks') && clickPages.some(c => hash.startsWith(c))) rec.clicks = await clickAll(url);
    if (checks.includes('words')) {
      rec.words = await page.evaluate(() => {
        const main = document.querySelector('main') || document.body, txt = main.innerText;
        const words = (txt.match(/\b[\w'’-]+\b/g) || []).length;
        const sents = txt.split(/(?<=[.!?])\s+/).filter(s => s.split(/\s+/).length > 3);
        const titles = [...main.querySelectorAll('[title]')].map(e => e.getAttribute('title')).join(' ');
        const tw = (titles.match(/\b[\w'’-]+\b/g) || []).length;
        const n = re => (txt.match(re) || []).length + (titles.match(re) || []).length;
        return { words, title_words: tw, sentences: sents.length, mean_sentence: sents.length ? +(sents.reduce((s, x) => s + x.split(/\s+/).length, 0) / sents.length).toFixed(1) : 0,
          em_dash: n(/—/g), semicolon: n(/;/g), colon_clause: n(/: [a-z]/g), parens: n(/\([^)]{25,}\)/g) };
      });
    }
    if (checks.includes('prose')) {
      rec.prose = await page.evaluate(() => {
        const W = t => (t.match(/[A-Za-z0-9][\w'’-]*/g) || []);
        const main = document.querySelector('main') || document.body, txt = main.innerText, body = W(txt).length;
        const hov = new Set(), K = window.PTMC;
        if (K && K.tips) for (const [sel, fn] of K.tips) {
          let els = []; try { els = [...document.querySelectorAll(sel)]; } catch (e) { /* bad selector */ }
          const seen = new Set();
          for (const el of els.slice(0, 400)) { let h = ''; try { h = fn(el) || ''; } catch (e) { continue; }
            if (!h || seen.has(h)) continue; seen.add(h); const d = document.createElement('div'); d.innerHTML = h; hov.add(d.textContent.trim()); }
        }
        document.querySelectorAll('[title]').forEach(e => { const t = e.getAttribute('title').trim(); if (t) hov.add(t); });
        const hw = [...hov].map(t => W(t).length).filter(n => n > 0).sort((a, b) => a - b);
        const q = f => hw.length ? hw[Math.min(hw.length - 1, Math.floor(f * hw.length))] : 0;
        const sents = txt.split(/(?<=[.!?])\s+|\n+/).filter(x => W(x).length > 5);
        const syl = w => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (w.length <= 3) return 1; const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g); return m ? m.length : 1; };
        const sw = sents.join(' '), nw = W(sw).length || 1, ns = sents.length || 1;
        const per100 = re => body ? +((txt.match(re) || []).length * 100 / body).toFixed(2) : 0;
        return { body_words: body, hover_unique: hw.length, hover_words_total: hw.reduce((a, b) => a + b, 0), hover_median: q(0.5), hover_p95: q(0.95), hover_max: hw.length ? hw[hw.length - 1] : 0,
          hover_over_40: hw.filter(n => n > 40).length, semicolons_per_100: per100(/;/g), colons_per_100: per100(/:/g),
          mean_sentence: +(nw / ns).toFixed(1), fk_grade: +(0.39 * nw / ns + 11.8 * W(sw).reduce((a, w) => a + syl(w), 0) / nw - 15.59).toFixed(1) };
      });
    }
    if (errors.length) rec.page_errors = [...new Set(errors)].slice(0, 4);
    out.pages.push(rec);
  }
  // a selection change on the Overview: does the page jump while it redraws?
  if (checks.includes('shifts') && kit) {
    await page.goto(base + '#overview', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    await page.evaluate(() => window.__shifts.splice(0));
    const box = await page.$('input[type=search], #q');
    if (box) { await box.fill('motif:RGG'); await box.press('Enter'); await page.waitForTimeout(2500); }
    const sh = await page.evaluate(() => window.__shifts.splice(0));
    out.selection_change = { shift: +sh.reduce((s, x) => s + x.v, 0).toFixed(3), top: top(sh) };
  }
  if (checks.includes('motion') && kit) {
    await page.goto('about:blank'); await page.goto(base + '#overview', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const sp = sampler(21, 200);
    const box = await page.$('input[type=search], #q');
    if (box) { await page.waitForTimeout(200); await box.fill('motif:RGG'); await box.press('Enter'); }
    out.selection_motion = motion(await sp);
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
  function top(list) {
    const by = {};
    list.forEach(x => (x.src.length ? x.src : ['?']).forEach(s => { by[s] = (by[s] || 0) + x.v; }));
    return Object.entries(by).sort((a, c) => c[1] - a[1]).slice(0, 4).map(([s, v]) => `${s} ${v.toFixed(3)}`);
  }
})();
