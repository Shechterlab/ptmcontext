/* A page as an A4 PDF, without the print dialog (the explorer's "Download PDF"): the page in its print layout (light
   colors, no controls), drawn by html2canvas-pro and cut into pages by jsPDF at the ends of cards, table rows and
   paragraphs, with a running head (the site, the page) and page numbers. The pages are images; Print keeps text
   selectable. A module of the site kit: K.pagePdf(root, title, filename, btn). */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D } = K;
  const LIBS = [
    'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  ];
  const loadScript = (src) =>
    new Promise((ok, fail) => {
      if ([...document.scripts].some((s) => s.src === src)) return ok();
      document.head.appendChild(
        Object.assign(document.createElement('script'), {
          src,
          onload: ok,
          onerror: () => fail(new Error('could not load ' + src)),
        })
      );
    });
  const PAGE = { w: 210, h: 297, side: 12, top: 16, bottom: 22 },
    WIDTH = 1000;
  // jsPDF's built-in fonts cover Latin-1 only
  const latin = (t) =>
    String(t)
      .replace(/[–—]/g, '-')
      .replace(/≥/g, '>=')
      .replace(/≤/g, '<=')
      .replace(/[^\x20-\xff]/g, '');
  async function pagePdf(root, title, filename, btn) {
    const label = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Writing PDF…';
    }
    try {
      await Promise.all(LIBS.map(loadScript));
      const opened = [...root.querySelectorAll('details:not([open])')];
      opened.forEach((d) => {
        d.open = true;
      }); // every fold, as Print shows them
      const mm = (PAGE.w - 2 * PAGE.side) / WIDTH,
        pageH = (PAGE.h - PAGE.top - PAGE.bottom) / mm;
      const scale = Math.max(1, Math.min(2, 30000 / Math.max(root.scrollHeight, 1)));
      let cuts = [],
        avoid = [];
      const id = root.id || (root.id = 'pdf-root');
      const canvas = await window.html2canvas(root, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: WIDTH,
        onclone: (doc) => {
          doc.documentElement.dataset.theme = 'light';
          doc.documentElement.classList.add('pdf-export');
          const el = doc.getElementById(id),
            top = el.getBoundingClientRect().top;
          const rect = (x) => {
            const r = x.getBoundingClientRect();
            return [r.top - top, r.bottom - top];
          };
          cuts = [...el.querySelectorAll('section, .pfold, .tbl-card, tr, p, li, .fact, .hl-card, svg, h3, h4')]
            .map((x) => rect(x)[1])
            .filter((y) => y > 0)
            .sort((a, b) => a - b);
          avoid = [...el.querySelectorAll('tr, .fact, .hl-card, svg, img, .card-head')]
            .map(rect)
            .filter(([a, b]) => b - a > 0 && b - a < pageH * 0.9);
        },
      });
      opened.forEach((d) => {
        d.open = false;
      });
      const H = canvas.height / scale,
        Wc = canvas.width / scale,
        free = (y) => !avoid.some(([a, b]) => a < y - 0.5 && y + 0.5 < b);
      const pages = [];
      for (let y = 0; y < H - 2; ) {
        const limit = y + pageH;
        let cut = limit >= H ? H : 0;
        if (!cut) for (const c of cuts) if (c > y + pageH * 0.3 && c <= limit && free(c)) cut = c;
        if (!cut) cut = limit;
        pages.push([y, cut]);
        y = cut;
      }
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      // the visible foot has the full address, the sources, the version and the license; the commit is in the document's
      // properties
      const cite = K.CIT?.preferred?.text ? `Cite: ${K.CIT.preferred.text}` : '';
      pdf.setProperties({
        title,
        subject: `${D.site.name}: ${title}. ${cite}`.trim(),
        author: D.site.lab || D.site.name,
        keywords: [
          D.mark,
          `version ${K.CIT?.version || '-'}`,
          `ptmcontext ${D.kit.version}`,
          `commit ${D.kit.commit || 'not recorded'}`,
          location.href,
        ]
          .filter(Boolean)
          .join('; '),
        creator: `ptmcontext ${D.kit.version} (${D.kit.commit || 'commit not recorded'})`,
      });
      const head = latin(`${D.site.name} · ${title}`),
        credit = (K.creditLines?.() || []).map(latin),
        pick = (re) => credit.find((l) => re.test(l)) || '',
        // the foot: the page's full address (with its section), the data sources (cut at two lines), then the site's
        // version, the data release, the selection and the license
        foot = [
          pick(/^Page:/) || latin(location.href),
          pick(/^Data:/),
          [
            pick(new RegExp('^' + D.site.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ', version')),
            D.dataset?.version ? `data ${D.dataset.version}` : '',
            K.selText ? `Selection: ${latin(K.selText())}` : '',
            pick(/^Exported/),
          ]
            .filter(Boolean)
            .join(' · '),
        ].filter(Boolean),
        W = PAGE.w - 2 * PAGE.side;
      pages.forEach(([a, b], n) => {
        if (n) pdf.addPage();
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = Math.max(1, Math.round((b - a) * scale));
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(canvas, 0, Math.round(a * scale), c.width, c.height, 0, 0, c.width, c.height);
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', PAGE.side, PAGE.top, Wc * mm, (b - a) * mm);
        pdf.setFontSize(7.5);
        pdf.setTextColor(110);
        pdf.text(head, PAGE.side, 9);
        pdf.text(`${n + 1} / ${pages.length}`, PAGE.w - PAGE.side, 9, { align: 'right' });
        const lines = foot.flatMap((t) => {
          const w = pdf.splitTextToSize(t, W);
          if (t.startsWith('Data:') && w.length > 2) {
            let cut = w[1];
            const tail = ' ... (all: Methods, Cite)';
            while (cut.includes(' ') && pdf.getTextWidth(cut + tail) > W) cut = cut.replace(/\s*\S*$/, '');
            return [w[0], cut + tail];
          }
          return w;
        });
        pdf.text(lines.slice(0, 6), PAGE.side, PAGE.h - 3.2 * Math.min(lines.length, 6) - 3.5);
      });
      K.download(filename, pdf.output('blob'));
    } catch (e) {
      alert(`The PDF could not be written (${e.message}). Print can save one instead.`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }
  // an element (a site card) as a PNG, at twice the screen's resolution
  async function elementPng(el, filename, btn) {
    const label = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '…';
    }
    try {
      await loadScript(LIBS[0]);
      const id = el.id || (el.id = 'png-root');
      const canvas = await window.html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (doc) => {
          doc.documentElement.dataset.theme = 'light';
          doc.getElementById(id)?.classList.add('pdf-export');
        },
      });
      await new Promise((ok) =>
        canvas.toBlob((b) => {
          K.download(filename, b);
          ok();
        }, 'image/png')
      );
    } catch (e) {
      alert(`The PNG could not be written (${e.message}).`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }
  K.pagePdf = pagePdf;
  K.elementPng = elementPng;
});
