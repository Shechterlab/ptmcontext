/* The figure panels page ("Make figures" on the Proteins and Sites pages): the figures of the current selection that no single
   page draws, each a fold that draws when it is opened, with the export buttons of every other figure. Today one panel: the
   selected sites aligned at the mark with their sequence logo (kit-conserve.js draws and exports it, K.logoPanel). With no search
   or filter set, the panels use the whole dataset, and the page says so. The page exists only where a panel can be drawn, so
   the button (kit-tables.js figuresBtn) shows only then. A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  if (!K.logoPanel) return; // no panel to draw (the site has no sequence windows or no logo): no page, no button
  const { W, esc, int } = K;
  const open = (id) => (id in K.folds ? K.folds[id] : true);
  function view() {
    const lp = K.sel.data() ? K.logoPanel?.() : null; // the panel reads the marks: not before they are loaded
    const head =
      `<div class="page-head results-head"><div><h2>Figure panels</h2><p class="cx">The figures of the ` +
      `current selection that no single page draws: ${int(lp ? lp.n : 0)} ${esc(W.marks)} with a sequence ` +
      `window. Every chart and table elsewhere has its own export buttons.</p></div></div>`;
    if (!K.sel.data()) return `${head}<p class="muted">Loading the ${esc(W.marks)}…</p>`;
    const note = K.sel.active()
      ? ''
      : `<div class="filter-note">No search or filter is set, so these figures use ` +
        `the whole dataset. Search for proteins or set filters to focus them.</div>`;
    if (!lp || !lp.n) return `${head}${note}<p class="muted">No selected ${esc(W.mark)} has a sequence window.</p>`;
    return (
      head +
      note +
      (`<details class="pfold" id="fg-align"${open('fg-align') ? ' open' : ''}><summary><span ` +
        `class="pfm" aria-hidden="true"></span><h3>Site alignment and sequence logo</h3>`) +
      `<span class="fsum">${int(lp.n)} ${esc(W.marks)}</span></summary><div class="pfold-body">${lp.html()}</div></details>`
    );
  }
  // a fold of this page remembers whether it is open
  document.addEventListener(
    'toggle',
    (e) => {
      if (e.target.id === 'fg-align') K.folds['fg-align'] = e.target.open;
    },
    true
  );
  K.views.figures = { render: view, title: () => 'Figure panels' };
});
