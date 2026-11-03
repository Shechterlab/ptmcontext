#!/usr/bin/env node
/* Scripted site audit: hovers, layout shifts and wording, page by page, as JSON on stdout (no screenshots).
   node tools/audit/audit.js <base-url> [--checks hovers,shifts,words] [--pages "#overview,#sites"] [--width 1440]
   Pages default to the Overview, the first questions, Proteins, Sites, Method, Help, a selection, and three protein
   pages drawn from the site's own data. Works on any ptmcontext site, and on the original explorer for 'words'. */
'use strict';
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const base = args[0];
if (!base) { console.error('usage: audit.js <base-url> [--checks ..] [--pages ..] [--width N]'); process.exit(2); }
const opt = k => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : null; };
const checks = (opt('checks') || 'hovers,shifts,words').split(',');
const width = +(opt('width') || 1440);
const BAD = /\bundefined\b|\bNaN\b|(^|[\s:=(])null([\s,.)]|$)(?!model)|\[object |\$\{/;

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
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
        try { await el.scrollIntoViewIfNeeded({ timeout: 1000 }); const bx = await el.boundingBox(); if (!bx) continue;
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
  console.log(JSON.stringify(out, null, 1));
  await b.close();
  function top(list) {
    const by = {};
    list.forEach(x => (x.src.length ? x.src : ['?']).forEach(s => { by[s] = (by[s] || 0) + x.v; }));
    return Object.entries(by).sort((a, c) => c[1] - a[1]).slice(0, 4).map(([s, v]) => `${s} ${v.toFixed(3)}`);
  }
})();
