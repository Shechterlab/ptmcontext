/* One export menu for every figure and printable page: "Download ▾" with the formats the site allows (PDF, SVG, PNG, TSV,
   CSV) and a size (Screen, Paper at 180 mm, or what website.export.presets says). The formats, their labels, the sizes and
   the default size come from website.export (D.export) over the defaults below; the page-level menu ("PDF of this page",
   "Print this page") is drawn by K.exp.pageMenu(). A module of the site kit: K.exp.
     K.exp.menu(kinds, attrs, label, methodHtml, {inline})   the menu's HTML; a button per format carries data-<attrs>="<format>",
                                                             so each figure's own click handler (K.clicks) is unchanged
     K.exp.preset() / .mm() / .width(dflt) / .paper()        the size chosen now, for a figure that lays itself out at that width
     K.exp.apply(f)                                          a figure ({svg, W, H}) set to the chosen size: its SVG's width in mm,
                                                             f.mm and f.dpi (PNG and PDF read them)
     K.exp.csv(tsvText)                                      a TSV as CSV (the # lines stay, as comments)
     K.exp.onPreset(fn)                                      fn(preset) when the size changes
   The PDF itself (the figure's SVG drawn as vectors, text in Inter and IBM Plex Mono) is K.exportFigure's, in kit.js. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, esc } = K;
  const CFG = D.export || {};
  const FORMATS = ['pdf', 'svg', 'png', 'tsv', 'csv'];
  const LABELS = { pdf: 'PDF', svg: 'SVG', png: 'PNG', tsv: 'Data (TSV)', csv: 'Data (CSV)', ...(CFG.labels || {}) };
  // the sizes in the site's order, those at a print width (mm) after the one the page draws
  const PRESETS = (
    CFG.presets?.length
      ? CFG.presets
      : [
          { id: 'screen', label: 'Screen', width: 960 },
          { id: 'paper', label: 'Paper (180 mm)', mm: 180, width: 680, dpi: 300 },
        ]
  ).sort((p, q) => !!p.mm - !!q.mm);
  const ALLOWED = (CFG.formats?.length ? CFG.formats : ['pdf', 'svg', 'png', 'tsv']).filter((k) => FORMATS.includes(k));
  const PAGE_VIEWS = CFG.pages || ['overview', 'method'];
  const KEY = 'ptmc-export-size';
  const stored = () => {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  };
  let cur = [stored(), CFG.default_preset].find((id) => PRESETS.some((p) => p.id === id)) || PRESETS[0].id;
  const preset = () => PRESETS.find((p) => p.id === cur) || PRESETS[0];
  const listeners = [];
  function setPreset(id) {
    if (!PRESETS.some((p) => p.id === id)) return;
    cur = id;
    try {
      localStorage.setItem(KEY, id);
    } catch (e) {
      /* a private window: the choice lasts for this page */
    }
    document.querySelectorAll('[data-xm-preset]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.xmPreset === cur));
    });
    listeners.forEach((fn) => fn(preset()));
  }
  // the formats a figure offers, in the site's order: those it can make that the site allows (CSV follows TSV)
  const formats = (kinds) => {
    const has = new Set(kinds);
    if (has.has('tsv')) has.add('csv');
    return ALLOWED.filter((k) => has.has(k));
  };
  const isFig = (k) => k === 'pdf' || k === 'svg' || k === 'png';
  const help = (k) => esc(K.EXP_HELP[k] || '');
  // `names`: a menu's own word for a format ({tsv: 'Site table (TSV)'}), where "Data (TSV)" would not say what the file is
  const item = (k, attrs, names) =>
    `<button type="button" class="exp-btn xm-item" role="menuitem" data-${attrs}="${k}" title="${help(k)}">${esc(names?.[k] || LABELS[k] || k.toUpperCase())}</button>`;
  const sizes = () =>
    PRESETS.length > 1
      ? `<div class="xm-sz" role="group" aria-label="Figure size"><span class="xm-h">Size</span>${PRESETS.map(
          (p) =>
            `<button type="button" class="xm-p" data-xm-preset="${esc(p.id)}" aria-pressed="${p.id === cur}"${
              p.mm
                ? ` title="${esc(p.mm)} mm wide, PNG at ${esc(p.dpi || 300)} dpi"`
                : ' title="The size the page draws it"'
            }>${esc(p.label)}</button>`
        ).join('')}</div>`
      : '';
  function menu(kinds, attrs, label, methodHtml = '', o = {}) {
    const fs = formats(kinds),
      fig = fs.some(isFig);
    if (o.inline)
      // inside a menu of its own (an Overview tile's Download)
      return `<div class="exp fr-exp" data-xm role="group" aria-label="Download ${esc(label)}">${sizes()}<div class="xm-items" role="menu">${fs.map((k) => item(k, attrs, o.names)).join('')}</div>${methodHtml}</div>`;
    if (!fig || fs.length < 2)
      return `<div class="exp" data-xm role="group" aria-label="Download ${esc(label)}">${fs.map((k) => item(k, attrs, o.names).replace(' role="menuitem"', '')).join('')}${methodHtml}</div>`;
    return (
      `<div class="exp" data-xm role="group" aria-label="Download ${esc(label)}">` +
      `<span class="xm-wrap"><button type="button" class="exp-btn xm-toggle" data-xm-toggle aria-haspopup="menu" aria-expanded="false" title="Download ${esc(label)}">Download ▾</button>` +
      `<div class="xm-pop" hidden>${sizes()}<div class="xm-items" role="menu">${fs.map((k) => item(k, attrs, o.names)).join('')}</div></div></span>${methodHtml}</div>`
    );
  }
  // ---- the menu's behavior: open on a tap, one at a time, closed by a choice, a tap elsewhere or Escape -------------------
  function close(m, back) {
    const pop = m.querySelector('.xm-pop'),
      t = m.querySelector('[data-xm-toggle]');
    if (!pop) return;
    pop.hidden = true;
    m.classList.remove('xm-open');
    t?.setAttribute('aria-expanded', 'false');
    if (back) t?.focus();
  }
  function toggle(t) {
    const m = t.closest('[data-xm]'),
      pop = m.querySelector('.xm-pop'),
      open = pop.hidden;
    document.querySelectorAll('[data-xm].xm-open').forEach((o) => o !== m && close(o));
    pop.hidden = !open;
    m.classList.toggle('xm-open', open);
    t.setAttribute('aria-expanded', String(open));
    if (open) {
      pop.classList.remove('xm-end');
      pop.classList.toggle('xm-end', pop.getBoundingClientRect().right > innerWidth - 8); // never off the right edge of a phone
      pop.querySelector('.xm-p[aria-pressed="true"], .xm-item')?.focus({ preventScroll: true });
    }
  }
  K.clicks.push(['[data-xm-toggle]', (el) => toggle(el)], ['[data-xm-preset]', (el) => setPreset(el.dataset.xmPreset)]);
  document.addEventListener('click', (e) => {
    document.querySelectorAll('[data-xm].xm-open').forEach((m) => {
      if (!m.contains(e.target) || e.target.closest('.xm-item, .exp-btn:not([data-xm-toggle])')) close(m);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const m = document.querySelector('[data-xm].xm-open');
    if (m) close(m, true);
  });
  // ---- a figure at the chosen size ---------------------------------------------------------------------------------------
  // the SVG's own width and height are set in mm, so the file prints at that width (a viewBox of W units across mm millimetres);
  // the PNG is mm at f.dpi dots, the PDF's page that wide
  function apply(f) {
    const p = preset();
    if (f.mm || !p.mm) return f;
    f.mm = p.mm;
    f.dpi = p.dpi || 300;
    f.svg = f.svg.replace(
      /^(<svg[^>]*?) width="[\d.]+" height="[\d.]+"/,
      `$1 width="${p.mm}mm" height="${((f.H * p.mm) / f.W).toFixed(1)}mm"`
    );
    return f;
  }
  // the same SVG with pixel sizes, for the PDF's vector drawing
  const px = (f) => f.svg.replace(/^(<svg[^>]*?) width="[^"]*" height="[^"]*"/, `$1 width="${f.W}" height="${f.H}"`);
  // a TSV as CSV: the # lines (what it is, how to cite it) stay as comments; each other line is split at tabs and quoted
  const csv = (tsv) =>
    String(tsv)
      .split('\n')
      .map((ln) =>
        ln.startsWith('#') || !ln.includes('\t')
          ? ln
          : ln
              .split('\t')
              .map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
              .join(',')
      )
      .join('\n');
  // ---- a page: its PDF and Print ---------------------------------------------------------------------------------------------
  const slug = (s) =>
    String(s)
      .replace(/[?#].*$/, '')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  function pageInfo() {
    const v = K.views?.[K.S?.view],
      own = v?.pdfName?.(K.S.arg);
    return {
      title: own?.title || document.title.split(' · ')[0] || D.site.name,
      file: own?.file || `${D.site.id}_${slug(location.hash.slice(1) || 'overview')}.pdf`,
    };
  }
  function pageMenu(o = {}) {
    if (CFG.page_pdf === false) return '';
    return (
      `<div class="exp xm-page" data-xm data-xm-page role="group" aria-label="Download this page">` +
      `<span class="xm-wrap"><button type="button" class="exp-btn xm-toggle" data-xm-toggle aria-haspopup="menu" aria-expanded="false" title="Download or print this page">Download ▾</button>` +
      `<div class="xm-pop" hidden><div class="xm-items" role="menu">` +
      `<button type="button" class="exp-btn xm-item" role="menuitem" data-xm-page-act="pdf" title="An A4 PDF of this page, in print colors, with every section open">PDF of this page</button>` +
      `<button type="button" class="exp-btn xm-item" role="menuitem" data-xm-page-act="print" title="Opens the browser's print dialog. Save as PDF there for a smaller file with selectable text">Print this page</button>` +
      `${o.extra || ''}</div></div></span></div>`
    );
  }
  // printed in light colors, every section open, with the page's address and how to cite it at the foot
  function printPage() {
    document.querySelectorAll('details.pgroup, details.pfold, details.mfold').forEach((d) => {
      d.open = true;
    });
    K.drawOpenFolds?.();
    const theme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'light';
    document.body.dataset.printFoot = `${D.site.name} · ${location.href} · printed ${K.hdate(new Date().toISOString())}. ${K.creditLines()[0] || ''}`;
    setTimeout(() => {
      print();
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
    }, 150);
  }
  K.clicks.push([
    '[data-xm-page-act]',
    (el) => {
      if (el.dataset.xmPageAct === 'print') return printPage();
      document.querySelectorAll('details.pgroup, details.pfold, details.mfold').forEach((d) => {
        d.open = true;
      });
      K.drawOpenFolds?.();
      const { title, file } = pageInfo();
      K.pagePdf?.(document.getElementById('view'), title, file, el);
    },
  ]);
  // the Overview and Method pages (website.export.pages) get the page menu at the top right of the page
  (K.afterRender ||= []).push(() => {
    const v = document.getElementById('view');
    if (!v || v.querySelector('[data-xm-page]') || !PAGE_VIEWS.includes(K.S?.view) || CFG.page_pdf === false) return;
    v.insertAdjacentHTML('afterbegin', `<div class="xm-pagebar">${pageMenu()}</div>`);
  });
  K.exp = {
    menu,
    label: (k) => LABELS[k] || k.toUpperCase(), // the menus' word for a format, for a menu a module draws itself
    pageMenu,
    printPage,
    presets: () => PRESETS,
    preset,
    setPreset,
    mm: () => +preset().mm || 0,
    paper: () => !!preset().mm,
    width: (dflt) => preset().width || dflt,
    formats,
    apply,
    px,
    csv,
    onPreset: (fn) => listeners.push(fn),
  };
  Object.assign(K.EXP_HELP, {
    csv: 'CSV: the rows, with the # lines saying what they are and how to cite them',
  });
});
