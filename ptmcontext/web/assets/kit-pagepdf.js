/* A page as an A4 PDF, without the print dialog (the explorer's "Download PDF"): the page in its print layout (light
   colours, no controls), drawn by html2canvas-pro and cut into pages by jsPDF at the ends of cards, table rows and
   paragraphs, with a running head (the site, the page) and page numbers. The pages are images; Print keeps text
   selectable. A module of the site kit: K.pagePdf(root, title, filename, btn). */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D } = K;
  const LIBS = ['https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
  const loadScript = src => new Promise((ok, fail) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    document.head.appendChild(Object.assign(document.createElement('script'), { src, onload: ok, onerror: () => fail(new Error('could not load ' + src)) }));
  });
  const PAGE = { w: 210, h: 297, side: 12, top: 16, bottom: 14 }, WIDTH = 1000;
  // jsPDF's built-in fonts cover Latin-1 only
  const latin = t => String(t).replace(/[–—]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[^\x20-\xff]/g, '');
  async function pagePdf(root, title, filename, btn) {
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Writing PDF…'; }
    try {
      await Promise.all(LIBS.map(loadScript));
      const opened = [...root.querySelectorAll('details:not([open])')];
      opened.forEach(d => { d.open = true; });                         // every fold, as Print shows them
      const mm = (PAGE.w - 2 * PAGE.side) / WIDTH, pageH = (PAGE.h - PAGE.top - PAGE.bottom) / mm;
      const scale = Math.max(1, Math.min(2, 30000 / Math.max(root.scrollHeight, 1)));
      let cuts = [], avoid = [];
      const id = root.id || (root.id = 'pdf-root');
      const canvas = await window.html2canvas(root, {
        scale, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: WIDTH,
        onclone: doc => {
          doc.documentElement.dataset.theme = 'light';
          doc.documentElement.classList.add('pdf-export');
          const el = doc.getElementById(id), top = el.getBoundingClientRect().top;
          const rect = x => { const r = x.getBoundingClientRect(); return [r.top - top, r.bottom - top]; };
          cuts = [...el.querySelectorAll('section, .pfold, .tbl-card, tr, p, li, .fact, .hl-card, svg, h3, h4')].map(x => rect(x)[1]).filter(y => y > 0).sort((a, b) => a - b);
          avoid = [...el.querySelectorAll('tr, .fact, .hl-card, svg, img, .card-head')].map(rect).filter(([a, b]) => b - a > 0 && b - a < pageH * 0.9);
        },
      });
      opened.forEach(d => { d.open = false; });
      const H = canvas.height / scale, Wc = canvas.width / scale, free = y => !avoid.some(([a, b]) => a < y - 0.5 && y + 0.5 < b);
      const pages = [];
      for (let y = 0; y < H - 2;) {
        const limit = y + pageH; let cut = limit >= H ? H : 0;
        if (!cut) for (const c of cuts) if (c > y + pageH * 0.3 && c <= limit && free(c)) cut = c;
        if (!cut) cut = limit;
        pages.push([y, cut]); y = cut;
      }
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      pdf.setProperties({ title, subject: `${D.site.name}: ${title}`, creator: `ptmcontext ${D.kit.version}` });
      const head = latin(`${D.site.name} · ${title}`), foot = latin(K.creditLines?.()[0] || ''), url = latin(location.href.split('?')[0]);
      pages.forEach(([a, b], n) => {
        if (n) pdf.addPage();
        const c = document.createElement('canvas'); c.width = canvas.width; c.height = Math.max(1, Math.round((b - a) * scale));
        const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(canvas, 0, Math.round(a * scale), c.width, c.height, 0, 0, c.width, c.height);
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', PAGE.side, PAGE.top, Wc * mm, (b - a) * mm);
        pdf.setFontSize(7.5); pdf.setTextColor(110);
        pdf.text(head, PAGE.side, 9);
        pdf.text(`${n + 1} / ${pages.length}`, PAGE.w - PAGE.side, 9, { align: 'right' });
        pdf.text(pdf.splitTextToSize(`${url} · ${new Date().toISOString().slice(0, 10)} · ${foot}`, PAGE.w - 2 * PAGE.side).slice(0, 2), PAGE.side, PAGE.h - 8);
      });
      K.download(filename, pdf.output('blob'));
    } catch (e) { alert(`The PDF could not be written (${e.message}). Print can save one instead.`); } finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }
  // an element (a site card) as a PNG, at twice the screen's resolution
  async function elementPng(el, filename, btn) {
    const label = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      await loadScript(LIBS[0]);
      const id = el.id || (el.id = 'png-root');
      const canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, onclone: doc => { doc.documentElement.dataset.theme = 'light'; doc.getElementById(id)?.classList.add('pdf-export'); } });
      await new Promise(ok => canvas.toBlob(b => { K.download(filename, b); ok(); }, 'image/png'));
    } catch (e) { alert(`The PNG could not be written (${e.message}).`); } finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }
  K.pagePdf = pagePdf;
  K.elementPng = elementPng;
});
