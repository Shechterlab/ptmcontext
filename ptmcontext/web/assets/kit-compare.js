/* Comparing marks with marks: the way in. The comparison itself is the Overview's baseline (kit.js, S.vs): a
   selection's marks against the site's other marks ("what sets it apart"), or against another selection's (vs=cmp,
   cmp=<its search and filters>), each question tested pooled, within proteins and within studies by the selection
   module (kit-select.js, contrast). This module adds the selection bar's buttons and the page that picks the other
   selection from those saved in this browser (#compare). A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { W, S, esc, int, cap } = K;
  function chooser() {
    const saved = K.sel.savedList();
    return `<div class="page-head"><h2>Compare two selections</h2></div><p class="page-sub">What is more or less common in one selection’s ${esc(W.marks)} than in another’s: every question of the Overview, tested pooled, within proteins and within studies.</p>` +
      `<ol class="steps"><li>Make the first selection (the search, or Filters) and <b>Save</b> it.</li><li>Make the second selection.</li><li>Choose the first below: the Overview then compares the current selection with it.</li></ol>` +
      (saved.length ? `<div class="tbl-card"><table class="tbl"><thead><tr><th>Saved selection</th><th class="num">${esc(cap(W.marks))}</th><th></th></tr></thead><tbody>${saved.map((x, i) => `<tr><td>${esc(x.name)}</td><td class="num">${int(x.n)}</td><td><button class="btn small" type="button" data-saved-cmp="${i}">Compare the current selection with it</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="note">No selection is saved in this browser yet.</p>`) +
      (K.sel.active() ? `<p>Or <button class="linkish" type="button" data-go-apart>compare the current selection with the other ${esc(W.marks)}</button>.</p>` : '');
  }
  K.views.compare = { render: chooser, title: () => 'Compare two selections' };
  K.sections.compare = () => [];
  // in the selection bar: the selection against the other marks, and the way to compare it with a saved one
  (K.selTools ||= []).push(() => (K.sel.active() && S.vs === 'residues' ? `<button class="btn small" type="button" data-go-apart title="Its ${esc(W.marks)} against the site’s other ${esc(W.marks)}, question by question">What sets it apart? ›</button>` : '') +
    (K.sel.savedList().length ? `<button class="btn small" type="button" data-go-compare title="Compare this selection with a saved one">Compare</button>` : ''));
  K.clicks.push(
    ['[data-go-apart]', () => K.go('overview', { vs: 'marks' })],
    ['[data-go-compare]', () => K.go('compare')],
    ['[data-saved-cmp]', el => { const x = K.sel.savedList()[+el.dataset.savedCmp]; if (x) K.go('overview', { vs: 'cmp', cmp: x.hash.split('?')[1] || '' }); }],
  );
});
