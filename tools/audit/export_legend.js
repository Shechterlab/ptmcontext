#!/usr/bin/env node
/* Audit of the legends in exports: for each export bar of a built site's pages, the color key, legend, dot-size key or
   "more often / less often / about the same / no difference" key that the card shows on the page is compared with the text of the
   SVG the export makes (PDF and PNG are made from that same SVG; --pdf also downloads the card's PDF and reads its text with pdftotext,
   which needs the PDF libraries: --cdn <dir of jspdf.umd.min.js, svg2pdf.umd.min.js and the Arimo and DejaVu fonts> or --online).
   Usage:  NODE_PATH=<dir with playwright> node tools/audit/export_legend.js <page url> [--routes a,b] [--selection q] [--proteins P1,P2] [--out file] [--pdf [--cdn dir | --online]]
   Prints each card whose key is missing from its export (the missing items) and exits with the number of such cards.
   It knows no site: the key is found by class (key, legend, ...) and by wording on the card. */
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { walk, opts, BTN } = require('./export_common');

const KEY_SEL = '.key, .qkey, .legend, .cell-keys, .pn-legend, .pn-key, .fp-key, .pc-key, .pwlegend, .map-legend, .map-key, .fm-legend, .s3d-legend, .s3d-key, .ix-key, .tkey, .kind-key, .calls-key, .dot-key, .size-key, [data-key], [aria-label~="legend"], [aria-label~="key"]';
const CARD_SEL = '.cell-block, .vm-block, .tile, .pcard, .idr-card, .qv-members, .tbl-card, article, details, .card, section';
const WORDS = /\b(more often|less often|about the same|no difference|more likely|less likely|not measured)\b/i;

// runs in the page: the key items the card around the i-th export button shows. The card is the nearest block that holds the bar
// (a tile, a card, a figure block, a section); its key is each element that is a key by class, or that has a swatch beside
// the wording of a key, and its items are the texts of the leaves of those elements.
function pageKey([btnSel, i, keySel, wordsSrc, cardSel]) {
  const words = new RegExp(wordsSrc, 'i'), btn = [...document.querySelectorAll(btnSel)][i], bar = btn.closest('.exp');
  const norm = s => (s || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
  const visible = e => e.getClientRects().length > 0 && !e.closest('.exp, table, nav, #tabs, .tile-actions, [hidden], summary');
  const card = bar.closest(cardSel) || bar.parentElement;
  let els = [...card.querySelectorAll(keySel)].filter(visible);
  if (!els.length) {          // no class names it: a short line with a swatch and the wording of a key
    els = [...card.querySelectorAll('p, span, div, li')].filter(e => visible(e) && words.test(e.textContent) && norm(e.textContent).length < 200 && e.querySelector('i, svg, .kd, .sw, b.dot'));
  }
  els = els.filter(e => !els.some(o => o !== e && o.contains(e)));
  const items = [];
  els.forEach(e => {         // one item for each run of text (a swatch is an element with none), split where the page joins with a dot
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.parentElement.closest('summary, script, style')) continue;
      norm(n.nodeValue).split(' · ').forEach(t => { if (t.trim().length > 2) items.push(t.trim()); });
    }
  });
  return items;
}
const squash = s => s.toLowerCase().replace(/[^a-z0-9<>≤≥%×]+/g, ' ').trim();

(async () => {
  const o = opts(process.argv.slice(2));
  if (!o.url) { console.error('usage: export_legend.js <page url> [--routes a,b] [--selection q] [--proteins P1,P2] [--out file]'); process.exit(2); }
  const report = {}; let bad = 0, checked = 0;
  await walk(o, async (pg, e) => {
    const items = await pg.evaluate(pageKey, [BTN, e.btn.i, KEY_SEL, WORDS.source, CARD_SEL]);
    if (!items.length) return;
    const text = squash([...e.svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')).join(' '));
    // an item is drawn if its words (the first six) are all in the export's text, in order of the text
    const missing = [...new Set(items)].filter(t => { const w = squash(t).split(' ').slice(0, 6).join(' '); return w && !text.includes(w); });
    // the same card's PDF (--pdf): its text, read back with pdftotext, must carry the key too
    let pdfMissing = null;
    if (o.args.includes('--pdf')) {
      const idx = await pg.evaluate(([sel, i]) => { const b = [...document.querySelectorAll(sel)][i], bar = b.closest('.exp'), all = [...bar.querySelectorAll('button, .exp-btn')], me = all.indexOf(b), same = (all[me].textContent || '').replace(/svg/i, '').trim(); const t = [...document.querySelectorAll(sel)]; return t.findIndex(x => x.closest('.exp') === bar && /pdf/i.test(x.textContent) && (x.textContent || '').replace(/pdf/i, '').trim() === same); }, [BTN, e.btn.i]);
      if (idx >= 0) {
        const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }).catch(() => null), pg.evaluate(([sel, i]) => { [...document.querySelectorAll(sel)][i].click(); }, [BTN, idx])]);
        if (dl) {
          const f = path.join(os.tmpdir(), 'legend_' + process.pid + '.pdf'); await dl.saveAs(f);
          const t = squash(execFileSync('pdftotext', [f, '-'], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/\s+/g, ' '));
          pdfMissing = [...new Set(items)].filter(x => { const w = squash(x).split(' ').slice(0, 6).join(' '); return w && !t.includes(w); });
          fs.unlinkSync(f);
        }
      }
    }
    checked++; report[e.key] = { items, missing, pdfMissing };
    if (pdfMissing && pdfMissing.length) { bad++; console.log(`PDF ${pdfMissing.length}/${items.length}\t${e.key}\n` + pdfMissing.slice(0, 6).map(x => '\t' + x).join('\n')); }
    if (missing.length) { bad++; console.log(`${missing.length}/${items.length}\t${e.key}\n` + missing.slice(0, 6).map(x => '\t' + x).join('\n')); }
  });
  const out = o.opt('out'); if (out) fs.writeFileSync(out, JSON.stringify({ cards_without_key: bad, report }, null, 1));
  console.log(`exports with a key on the page: ${checked}; missing a key in the export: ${bad}`);
  process.exit(bad ? 1 : 0);
})();
