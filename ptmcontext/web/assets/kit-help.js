/* Help for every reader, on any site: a start panel on the Overview for a first visit, the Help page ("How to use this
   site"), keyboard shortcuts with their "?" overlay, result counts read out to screen readers, focus kept or moved
   where a reader expects it when a page is drawn again, and the hover help reachable by keyboard focus and by a long
   press on a touch screen. Words come from the site's data (its name, tagline, examples, words for its marks) and,
   where a site wants its own, from website.start in the site file:
     start: {title, text, examples: [{label, query, help}]}     (query: what the search box takes; at most three shown)
   Without website.start the three starts are chosen from website.examples: a list of genes, a term (key:value), one
   site or one protein. A module of the site kit: it changes no result and reads no data of its own. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, S, esc, int, cap } = K;
  const $ = s => document.querySelector(s);
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } },
  };
  const START_KEY = `ptmc-start-hidden-${D.site.id}`;
  const SETQ = D.analyses.some(a => a.kind === 'protein_sets');
  const has = v => ['overview', 'statistics', 'method', 'help'].includes(v) || !!K.views[v];

  // ---- the three starts ---------------------------------------------------------------------------------------------
  const EX = D.site.examples || [];
  const isTerm = e => e.includes(':');
  const isSite = e => !isTerm(e) && /^\S+\s+[A-Za-z]?\d+$/.test(e.trim());
  const isList = e => !isTerm(e) && !isSite(e) && /\s/.test(e.trim());
  const KIND = {
    list: ['A list of genes', `Paste gene names or accessions, separated by spaces or commas: every question is tested again on their ${W.marks}.`],
    term: ['A class or a term', `Select the ${W.marks} of one class (key:value): see where they sit${SETQ ? ' and what kinds of protein carry them' : ''}.`],
    site: [`One ${W.mark}`, `Open its protein at that ${W.mark}: the map of its regions, its evidence and its structures.`],
    one: ['One protein', `Open its page: its ${W.marks} on a map of its regions, the evidence for each, and its structures.`],
  };
  const kindOf = e => (isTerm(e) ? 'term' : isSite(e) ? 'site' : isList(e) ? 'list' : 'one');
  function starts() {
    const own = (D.start?.examples || []).filter(x => x && x.query);
    if (own.length) return own.slice(0, 3).map(x => ({ label: x.label || KIND[kindOf(x.query)][0], query: x.query, help: x.help ?? KIND[kindOf(x.query)][1] }));
    const out = [], add = e => { if (e && !out.some(x => x.query === e)) out.push({ label: KIND[kindOf(e)][0], query: e, help: KIND[kindOf(e)][1] }); };
    add(EX.find(isList)); add(EX.find(isTerm)); add(EX.find(isSite) || EX.find(e => kindOf(e) === 'one'));
    EX.forEach(e => { if (out.length < 3) add(e); });
    return out.slice(0, 3);
  }
  const startButtons = cls => `<ol class="${cls}">${starts().map(x => `<li><button type="button" class="sp-start" data-try="${esc(x.query)}">` +
    `<span class="sp-label">${esc(x.label)}</span><span class="sp-q mono">${esc(x.query)}</span>${x.help ? `<span class="sp-help">${esc(x.help)}</span>` : ''}</button></li>`).join('')}</ol>`;
  const whatText = (where = 'below') => D.start?.text || `${D.site.tagline ? D.site.tagline + ' ' : ''}This site asks where ${W.marks} fall in their proteins${SETQ ? ' and which kinds of protein carry them' : ''}: ` +
    `each tile ${where} is one question, tested within each protein and pooled. Search for a protein, a list of genes or a class to test a selection of your own; every figure and table downloads with how to cite it.`;

  // ---- the start panel: on the Overview, until the reader hides it (remembered in this browser) ---------------------
  (K.overviewTop ||= []).push(() => {
    if (store.get(START_KEY) || K.sel?.active() || S.arg || S.vs !== 'residues' || !starts().length) return '';
    const gl = K.glance?.html() || '';
    return `<section class="start-panel${gl ? ' glance' : ''}" aria-labelledby="sp-title"><div class="sp-head"><h2 id="sp-title">${esc(D.start?.title || (gl ? `Where the ${W.marks} fall` : 'New here? Start from a question of your own'))}</h2>` +
      `<button type="button" class="sp-close" data-start-hide aria-label="Hide this introduction">×</button></div>` +
      (gl || `<p class="sp-what">${esc(whatText())} <span class="muted">${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins.</span></p>` + startButtons('sp-starts')) +
      `<p class="sp-foot"><a href="${esc(K.link('help'))}">How to use this site</a><span aria-hidden="true"> · </span>` +
      (gl ? '' : `<span class="sp-keys">Press <kbd>/</kbd> to search, <kbd>?</kbd> for every shortcut</span><span aria-hidden="true"> · </span>`) +
      `<button type="button" class="linkish" data-start-hide>Hide this introduction</button></p></section>`;
  });
  K.clicks.push(['[data-start-hide]', () => { store.set(START_KEY, '1'); K.render(); announce('Introduction hidden. It is on the Help page.'); }],
    ['[data-start-show]', () => { store.set(START_KEY, null); K.go('overview'); }],
    ['[data-keys-open]', () => openKeys()]);

  // ---- the Help page -------------------------------------------------------------------------------------------------
  const SHORTCUTS = () => [
    ['/', 'Search: put the cursor in the search box'],
    ['Esc', 'Close a dialog, the sidebar or a hover; leave the search box'],
    ...[['o', 'overview', 'Overview'], ['p', 'proteins', 'Proteins'], ['s', 'sites', cap(W.marks)], ['i', 'idrs', 'IDRs'], ['t', 'statistics', 'Statistics (all tests)'], ['m', 'method', 'Method'], ['h', 'help', 'Help']]
      .filter(([, v]) => has(v)).map(([k, , name]) => [`g ${k}`, `Go to ${name}`]),
    ['?', 'Show these shortcuts'],
    ['Tab, Shift+Tab', 'Move between links, buttons and rows; a row with a hover shows it on focus'],
    ['Enter or Space', 'Open a tile, select a class, sort a column'],
  ];
  const GO = { o: 'overview', p: 'proteins', s: 'sites', i: 'idrs', t: 'statistics', m: 'method', h: 'help' };
  const keysTable = () => `<table class="tbl keys-tbl"><thead><tr><th scope="col">Key</th><th scope="col">What it does</th></tr></thead><tbody>` +
    SHORTCUTS().map(([k, t]) => `<tr><td>${k.split(', ').map(x => x.split(/(?<=^g) /).map(y => `<kbd>${esc(y)}</kbd>`).join(' then ')).join(', ')}</td><td>${esc(t)}</td></tr>`).join('') + '</tbody></table>';
  const terms = EX.filter(isTerm);
  const SECTIONS = [
    ['h-what', 'What this site is'], ['h-start', 'Where to start'], ['h-search', 'Searching'], ['h-filters', 'Filters'],
    ['h-selection', 'Your selection'], ['h-compare', 'Comparing'], ['h-read', 'Reading a figure'], ['h-export', 'Downloads'],
    ['h-cite', 'Citing'], ['h-share', 'Sharing a link, and going back'], ['h-keys', 'Keyboard shortcuts'], ['h-access', 'Accessibility'],
  ];
  function helpPage() {
    const sec = (id, body) => `<section id="${id}"><h3>${esc(SECTIONS.find(s => s[0] === id)[1])}</h3>${body}</section>`;
    const mlink = (arg, text) => `<a href="${esc(K.link('method', arg))}">${text}</a>`;
    const min = K.sel?.MIN;
    return `<div class="page-head"><h2>How to use this site</h2></div><div class="doc help-doc">` +
      sec('h-what', `<p>${esc(whatText('on the Overview'))}</p><p>It holds ${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins and ${int(D.analyses.length)} questions. ${mlink('', 'Method')} says how each question was made and tested, and from which data.</p>`) +
      sec('h-start', `<p>Three ways in; each fills the search box, and you can change it from there.</p>${startButtons('sp-starts help-starts')}` +
        `<p class="muted">${store.get(START_KEY) ? '<button type="button" class="linkish" data-start-show>Show the introduction on the Overview again</button>' : 'The Overview shows these until you hide them.'}</p>`) +
      sec('h-search', `<p>The search box at the top of every page takes:</p><ul>` +
        `<li><b>a protein</b>: a gene name, a UniProt accession or an entry name; a search that names one protein opens its page;</li>` +
        `<li><b>a list of proteins</b>, separated by spaces or commas (pasted from a spreadsheet is fine): their ${esc(W.marks)} together;</li>` +
        `<li><b>one ${esc(W.mark)}</b>, as a gene and a position${EX.find(isSite) ? ` (<span class="mono">${esc(EX.find(isSite))}</span>)` : ''};</li>` +
        `<li><b>a term</b>, <span class="mono">key:value</span>, where the key is a question or a fact about the ${esc(W.marks)}${terms.length ? ` (${terms.map(t => `<button type="button" class="linkish mono" data-try="${esc(t)}">${esc(t)}</button>`).join(', ')})` : ''}. Several values, separated by <span class="mono">|</span> or commas, match any; several terms must all hold.</li></ul>` +
        `<p>The line under the box says how many ${esc(W.marks)} and proteins match, and names any word that matched nothing. Every key and its values are listed in ${mlink('search', 'Method › Search terms')}.</p>`) +
      sec('h-filters', `<p>The sidebar (<b>☰</b> or <b>Filters</b>; pinned beside the page on a wide screen) has two parts: <b>Sections</b>, the parts of the page you are on, and <b>Filters</b>, groups of buttons, one per class or value, each with how many ${esc(W.marks)} it has. Filters add to the search: a ${esc(W.mark)} is kept when it matches the search and every filter group.</p>`) +
      sec('h-selection', `<p>A search or a filter makes a <b>selection</b>. The bar under the search box shows it: how many ${esc(W.marks)} and proteins, each term with × to remove it, and <b>Save</b> (kept in this browser, listed under Filters), <b>Copy link</b> and <b>Clear all</b>. Every page then shows the selection, and the Overview tests every question again on it, in your browser${min ? `, once it has at least ${int(min.proteins)} proteins and ${int(min.marks)} ${esc(W.marks)}` : ''}. These tests are exploratory: they are not adjusted for the other selections you try.</p>`) +
      sec('h-compare', `<p>Under <b>Compared with</b>, the Overview compares your selection with the other ${esc(W.residues)} of the same proteins (the site's own tests), with the site's other ${esc(W.marks)} ("what sets it apart"), or with another selection you saved. Each class then shows two shares: your selection's (filled) and the comparison's (hollow).</p>`) +
      sec('h-read', `<p>On the Overview each tile is a question and each row a class of it. The dot is the effect on a log scale, with its 95% confidence interval; the line marked 1× is no difference.</p>` +
        `<ul class="key-list"><li><i class="kd more"></i> <b>more often</b>: q ≤ 0.05 and at least 1.1×</li><li><i class="kd less"></i> <b>less often</b></li><li><i class="kd same"></i> <b>about the same</b>: significant, but within 1.1×</li><li><i class="kd ns"></i> <b>no difference</b>: q > 0.05</li></ul>` +
        `<p><b>Within each protein</b> compares each protein's ${esc(W.marks)} with its own other ${esc(W.residues)}; <b>pooled</b> puts all the ${esc(W.residues)} together. The first separates where ${esc(W.marks)} sit from which proteins were found ${esc(W.marked)}. ${SETQ ? `A question about kinds of protein shows the fold enrichment of ${esc(W.marked)} proteins in each set. ` : ''}Hover a row, or move to it with Tab, for its counts; a long press does the same on a touch screen. Select a tile to see every class; select a class to select its ${esc(W.marks)}.</p>`) +
      sec('h-export', `<p>Each figure has <b>PDF</b>, <b>SVG</b>, <b>PNG</b> (300 dpi) and <b>TSV</b> buttons, and each table <b>Download TSV</b>. Every file carries what it shows, the test, how to cite it, the data sources and versions, and when it was exported: under the figure, in the file's own metadata and in a TSV's <span class="mono">#</span> lines. <b>Method</b> beside the buttons opens how that figure was made.</p>`) +
      sec('h-cite', `<p>${mlink('cite', 'How to cite')} gives the citation, with a button to copy it and the site's CITATION.cff; cite also the sources that report the ${esc(W.marks)} you use. A protein page says how to cite its own ${esc(W.marks)}.</p>`) +
      sec('h-share', `<p>The address holds the page, the search, the filters and the comparison, so a link opens exactly what you see: copy it from the address bar or with <b>Copy link</b>. Back and Forward return to earlier pages and selections, where you left them.</p>`) +
      sec('h-keys', `<p>Single keys work when the cursor is not in a text box.</p>${keysTable()}`) +
      sec('h-access', `<p>Every control can be reached and used with the keyboard; a skip link leads past the header; result counts are read out by screen readers when they change; the light and dark themes (at the foot of every page) follow your system's choice unless you pick one, and motion follows your system's reduced-motion setting. The pages work at 200% zoom and on a phone. If something does not work for you, tell the site's authors (the links in the header).</p>` +
        `<p>${mlink('privacy', 'Privacy')}: no cookies, no tracking; what you search stays in your browser.</p>`) +
      '</div>';
  }
  K.views.help = { render: helpPage, title: () => 'Help', after: arg => { if (arg) document.getElementById(arg)?.scrollIntoView({ block: 'start' }); } };
  K.sections.help = () => [['view', 'How to use this site', 1], ...SECTIONS.map(([id, t]) => [id, t, 1])];
  (K.tabsEnd ||= []).push(() => ['help', 'Help', null]);

  // ---- keyboard shortcuts and their overlay --------------------------------------------------------------------------
  let dlg = null;
  function openKeys() {
    if (!dlg) {
      document.body.insertAdjacentHTML('beforeend', `<dialog class="keys-dlg" aria-labelledby="keys-title"><div class="keys-head"><h2 id="keys-title">Keyboard shortcuts</h2>` +
        `<button type="button" class="sp-close" data-keys-close aria-label="Close">×</button></div><div class="keys-body"></div>` +
        `<p class="muted small">More in <a href="#help" data-keys-close>How to use this site</a>.</p></dialog>`);
      dlg = document.querySelector('.keys-dlg');
      dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-keys-close]')) dlg.close(); });
    }
    dlg.querySelector('.keys-body').innerHTML = keysTable();
    if (!dlg.open) dlg.showModal();
  }
  addEventListener('hashchange', () => { if (dlg?.open) dlg.close(); hideTip(); });   // a new page closes the overlay
  const typingIn = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  let gAt = 0;
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const ae = document.activeElement;
    if (e.key === 'Escape') {
      if (!tipEl.hidden) { hideTip(); return; }
      if (ae && ae.id === 'q') ae.blur();
      return;
    }
    if (typingIn(ae) || dlg?.open) return;
    if (e.key === '/') { e.preventDefault(); const q = $('#q'); q.focus(); q.select(); q.scrollIntoView({ block: 'nearest' }); return; }
    if (e.key === '?') { e.preventDefault(); openKeys(); return; }
    if (e.key === 'g') { gAt = Date.now(); return; }
    if (gAt && Date.now() - gAt < 1500) {
      gAt = 0; const v = GO[e.key.toLowerCase()];
      if (v && has(v)) { e.preventDefault(); userAt = Date.now(); location.hash = K.link(v); }
    }
  });
  // a control drawn as a row or a picture part (role="button") works from the keyboard as a button does; a module that
  // handles its own keys first (preventDefault) is left alone. Sortable column heads of the statistics table too.
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || (e.key !== 'Enter' && e.key !== ' ')) return;
    const el = e.target;
    if (!(el instanceof Element) || /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) return;
    if (el.matches('[role="button"], th[data-sort]')) { e.preventDefault(); el.click(); }
  });

  // ---- read-outs for screen readers: the selection's count when it changes, short notes ------------------------------
  document.body.insertAdjacentHTML('beforeend', '<div id="ptmc-live" class="vh" role="status" aria-live="polite" aria-atomic="true"></div>');
  const live = document.getElementById('ptmc-live');
  let said = '', sayT;
  function announce(text) { clearTimeout(sayT); sayT = setTimeout(() => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); said = text; }, 50); }
  K.announce = announce;
  let countT;
  const countText = () => {
    const sc = $('#scope'); if (!sc) return '';
    const main = sc.querySelector('.sel-flag + span') || sc.querySelector('span');
    const miss = [...sc.querySelectorAll('.sel-miss')].map(x => x.textContent.trim());
    return [(sc.classList.contains('selected') ? 'Selection: ' : '') + (main?.textContent || '').trim(), ...miss].filter(Boolean).join('. ');
  };
  let lastCount = null;
  new MutationObserver(() => { clearTimeout(countT); countT = setTimeout(() => { const t = countText(); if (lastCount != null && t && t !== lastCount && t !== said) announce(t); lastCount = t; }, 700); })
    .observe($('#scope'), { childList: true, subtree: true, characterData: true });

  // ---- focus when a page is drawn again ------------------------------------------------------------------------------
  // The kit draws a page anew on every change. A control the reader was using is found again in the new page and
  // focused (a test switch, a sort, a class picked); when the reader has gone to another page, focus moves to its
  // heading, so a screen reader says where they are and Tab continues from there.
  let userAt = 0, lastFocus = null, pageKey = null;
  ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => { userAt = Date.now(); }, true));
  addEventListener('popstate', () => { userAt = Date.now(); });
  const KEEP = ['data-m', 'data-vs', 'data-f', 'data-v', 'data-all', 'data-sort', 'data-psort', 'data-ssort', 'data-exp', 'data-texp', 'data-aid', 'data-tile', 'data-try', 'data-site', 'data-goto', 'data-cf', 'data-cv', 'data-sel-clear', 'data-theme-choice', 'id'];
  const sig = el => {
    const parts = KEEP.filter(a => el.hasAttribute(a)).map(a => `[${a}="${CSS.escape(el.getAttribute(a))}"]`);
    if (!parts.length && el.tagName === 'A' && el.getAttribute('href')) parts.push(`[href="${CSS.escape(el.getAttribute('href'))}"]`);
    return parts.length ? el.tagName.toLowerCase() + parts.join('') : null;
  };
  // what had focus in the page: a control's signature, or the heading ('@h') when focus was moved there
  document.addEventListener('focusin', e => { const v = $('#view'); if (v && v.contains(e.target) && e.target !== v) lastFocus = e.target.matches('h2,h3') ? '@h' : sig(e.target); });
  const toHeading = () => { const h = heading(); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } };
  const heading = () => $('#view h2') || $('#view h3');
  function afterDraw() {
    const key = S.view + '/' + (S.view === 'protein' ? String(S.arg).split('/')[0] : S.arg);
    const moved = pageKey != null && key !== pageKey, recent = Date.now() - userAt < 3000;   // a selection's data may take a moment
    pageKey = key;
    a11yPass();
    const ae = document.activeElement, lost = !ae || ae === document.body;
    if (moved && recent && (lost || $('#tabs')?.contains(ae) || $('#rail')?.contains(ae) || $('#view')?.contains(ae)) && !(ae && ae.id === 'q' && S.view === 'overview')) {
      toHeading(); return;
    }
    // the control in use was drawn again: focus it; it is gone (a start that made a selection): the page's heading
    if (lost && recent) {
      const el = lastFocus && lastFocus !== '@h' && document.querySelector('#view ' + lastFocus);
      if (el) el.focus({ preventScroll: true }); else if (lastFocus) toHeading();
    }
  }
  let drawT;
  new MutationObserver(() => { cancelAnimationFrame(drawT); drawT = requestAnimationFrame(afterDraw); }).observe($('#view'), { childList: true });

  // what the kit's markup leaves to the reader's tools: a table wider than its card scrolls from the keyboard, and is
  // named; a sortable column head of the statistics table takes focus
  function a11yPass() {
    document.querySelectorAll('#view .tbl-card').forEach(c => {
      const wide = c.scrollWidth > c.clientWidth + 1;
      if (wide && !c.hasAttribute('tabindex')) {
        const h = c.closest('section')?.querySelector('h2,h3') || heading();
        c.setAttribute('tabindex', '0'); c.setAttribute('role', 'region'); c.setAttribute('aria-label', (h?.textContent.trim() || 'Table') + ' (scrolls sideways)');
      }
    });
    document.querySelectorAll('#view th[data-sort]:not([tabindex])').forEach(th => th.setAttribute('tabindex', '0'));
  }
  addEventListener('resize', () => requestAnimationFrame(a11yPass));

  // ---- hover help on keyboard focus and on touch ---------------------------------------------------------------------
  // The kit shows a row's numbers (and every module's hovers, K.tips) when the pointer moves over it. Focus does the
  // same: the hover is asked for at the element's place, and named as the element's description. On a touch screen a
  // long press shows it (and does not also press the control); a tap elsewhere or Esc hides it. An element with only
  // a title shows its title the same way.
  const tipEl = $('#tip');
  const TIPPED = () => ['.drow', '.trow', 'tr[data-i]', ...K.tips.map(t => t[0])].join(',');
  let tipFor = null;
  function hideTip() { tipEl.hidden = true; if (tipFor) { tipFor.removeAttribute('aria-describedby'); tipFor = null; } }
  function showTipAt(el, x, y) {
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
    if (tipEl.hidden && el.getAttribute('title')) {
      tipEl.innerHTML = esc(el.getAttribute('title')); tipEl.hidden = false;
      tipEl.style.left = Math.max(8, Math.min(x + 14, innerWidth - tipEl.offsetWidth - 8)) + 'px';
      tipEl.style.top = Math.min(y + 14, innerHeight - tipEl.offsetHeight - 8) + 'px';
    }
    if (!tipEl.hidden) { tipFor = el; if (!el.hasAttribute('aria-describedby') && !el.getAttribute('title')) el.setAttribute('aria-describedby', 'tip'); }
  }
  const tipTarget = t => t.closest?.(TIPPED()) || (t.closest?.('[title]:is(button,a,[tabindex],.sel-miss,h4,abbr,i,span)') || null);
  document.addEventListener('focusin', e => {
    if (!e.target.matches?.(':focus-visible')) return;
    const el = e.target.matches(TIPPED()) || e.target.getAttribute?.('title') ? e.target : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    showTipAt(el, r.left + Math.min(r.width / 2, 60), r.bottom - 6);
  });
  document.addEventListener('focusout', e => { if (tipFor && tipFor === e.target) hideTip(); });
  let press = null, swallow = false;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    if (!tipEl.hidden && !e.target.closest('#tip')) hideTip();
    const el = tipTarget(e.target); if (!el) return;
    const x = e.clientX, y = e.clientY;
    press = { x, y, t: setTimeout(() => { showTipAt(el, x, y); swallow = !tipEl.hidden; press = null; }, 450) };
  }, true);
  const cancelPress = e => { if (press && (e.type !== 'pointermove' || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10)) { clearTimeout(press.t); press = null; } };
  ['pointerup', 'pointercancel', 'pointermove'].forEach(t => document.addEventListener(t, cancelPress, true));
  document.addEventListener('click', e => { if (swallow) { swallow = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('contextmenu', e => { if (swallow) e.preventDefault(); }, true);

  // the footer: Help and the shortcuts, on every page
  document.getElementById('credit')?.insertAdjacentHTML('beforebegin', `<span class="foot-help"><a href="#help">Help</a> · <button type="button" class="linkish" data-keys-open>Keyboard shortcuts <kbd>?</kbd></button></span>`);
});
