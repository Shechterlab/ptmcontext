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
    list: ['A list of genes', `Paste gene names or accessions. Every question is tested again on their ${W.marks}.`],
    term: ['A class or a term', `Select the ${W.marks} of one class (key:value) to see where they lie${
SETQ ? ' and which proteins have them' : ''}.`],
    site: [`One ${W.mark}`, `Open its protein at that ${W.mark}, with its regions, evidence and structures.`],
    one: ['One protein', `Open its page: its ${W.marks} on a map, the evidence for each, and its structures.`],
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
  const startButtons = cls => `<ol class="${cls}">${starts().map(x => (`<li><button type="button" class="sp-start" ` +
      `data-try="${esc(x.query)}">`) +
    `<span class="sp-label">${esc(x.label)}</span><span class="sp-q mono">${esc(x.query)}</span>${
x.help ? `<span class="sp-help">${esc(x.help)}</span>` : ''}</button></li>`).join('')}</ol>`;
  const whatText = (where = 'below') => D.start?.text || (`${
D.site.tagline ? D.site.tagline + ' ' : ''}Each tile ${where} is one question ` +
      `about where ${W.marks} lie${
SETQ ? ' and which proteins have them' : ''}, each compared with the other ${W.residues} of the same ` +
      `proteins. Search a protein, a gene list or a class to test your own selection.`);

  // ---- the start panel: on the Overview, until the reader hides it (remembered in this browser) ---------------------
  // a site that opens with the cell and the nucleus drawn (a card with drawing: true) has no panel above them
  const cellFirst = () => (D.overview?.sections || []).some(x => (x.cards || []).some(c => c && c.drawing === true && c.analysis === D.cell?.id));
  (K.overviewTop ||= []).push(() => {
    if (K.sel?.active() || S.arg || S.vs !== 'residues' || !starts().length || cellFirst()) return '';
    if (store.get(START_KEY)) return (`<p class="sp-show"><button type="button" class="linkish" data-start-show>` +
        `Show introduction</button></p>`);   // hidden: a small way back, in its place
    return `<section class="start-panel" aria-labelledby="sp-title"><div class="sp-head"><h2 id="sp-title">${
esc(D.start?.title || 'New here? Start from a question of your own')}</h2>` +
      `<button type="button" class="sp-close" data-start-hide aria-label="Hide this introduction">×</button></div>` +
      (`<p class="sp-what">${esc(whatText())} <span class="muted">${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins.</span>` +
          `</p>`) + startButtons('sp-starts') +
      (`<p class="sp-foot"><a href="${esc(K.link('help'))}">How to use this site</a><span aria-hidden="true"> · ` +
          `</span><span class="sp-keys">Press <kbd>/</kbd> to search, <kbd>?</kbd> for every shortcut</span></p>` +
          `</section>`);
  });
  (K.afterRender ||= []).push(() => document.body.classList.toggle('intro-hidden', !!store.get(START_KEY)));
  K.clicks.push(['[data-start-hide]', () => { store.set(START_KEY, '1'); K.render(); announce('Introduction hidden. "Show introduction" brings it back.'); }],
    ['[data-start-show]', () => { store.set(START_KEY, null); K.go('overview'); }],
    ['[data-keys-open]', () => openKeys()]);

  // ---- the Help page -------------------------------------------------------------------------------------------------
  const SHORTCUTS = () => [
    ['/', 'Search: put the cursor in the search box'],
    ['Esc', 'Close a dialog, the sidebar or a hover; leave the search box'],
    ...[['o', 'overview', 'Overview'], ['p', 'proteins', 'Proteins'], ['s', 'sites', cap(W.marks)], ['i', 'idrs', K.tabName('idrs', 'IDRs')], ['t', 'statistics', K.tabName('statistics', 'Statistics (all tests)')], ['m', 'method', K.tabName('method', 'Method')], ['h', 'help', 'Help']]
      .filter(([, v]) => has(v)).map(([k, , name]) => [`g ${k}`, `Go to ${name}`]),
    ['?', 'Show these shortcuts'],
    ['Tab, Shift+Tab', 'Move between links, buttons and rows; a row with a hover shows it on focus'],
    ['Enter or Space', 'Open a tile, select a class, sort a column'],
  ];
  const GO = { o: 'overview', p: 'proteins', s: 'sites', i: 'idrs', t: 'statistics', m: 'method', h: 'help' };
  const keysTable = () => (`<table class="tbl keys-tbl"><thead><tr><th scope="col">Key</th><th scope="col">What it ` +
      `does</th></tr></thead><tbody>`) +
    SHORTCUTS().map(([k, t]) => `<tr><td>${
k.split(', ').map(x => x.split(/(?<=^g) /).map(y => `<kbd>${esc(y)}</kbd>`).join(' then ')).join(', ')}</td><td>${esc(t)}</td></tr>`).join('') + '</tbody></table>';
  const terms = EX.filter(isTerm);
  const SECTIONS = [
    ['h-what', 'What this site is'], ['h-start', 'Where to start'], ['h-search', 'Searching'], ['h-filters', 'Filters'],
    ['h-pages', 'Tables, maps and charts'], ['h-selection', 'Your selection'], ['h-compare', 'Comparing'], ['h-read', 'Reading a figure'], ['h-export', 'Downloads'],
    ['h-cite', 'Citing'], ['h-share', 'Sharing a link, and going back'], ['h-keys', 'Keyboard shortcuts'], ['h-access', 'Accessibility'],
  ];
  function helpPage() {
    const sec = (id, body) => `<section id="${id}"><h3>${esc(SECTIONS.find(s => s[0] === id)[1])}</h3>${body}</section>`;
    const mlink = (arg, text) => `<a href="${esc(K.link('method', arg))}">${text}</a>`;
    const min = K.sel?.MIN;
    return `<div class="page-head"><h2>How to use this site</h2></div><div class="doc help-doc">` +
      sec('h-what', (`<p>${esc(whatText('on the Overview'))}</p><p>It holds ${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins and ${int(D.analyses.length)} questions. ${mlink('', 'Method')} gives the ` +
          `tests and data.</p>`)) +
      sec('h-start', `<p>Each of these fills the search box. Edit it from there.</p>${startButtons('sp-starts help-starts')}` +
        `<p class="muted">${
store.get(START_KEY) ? '<button type="button" class="linkish" data-start-show>Show the introduction on the Overview again</button>' : 'The Overview shows these until you hide them.'}</p>`) +
      sec('h-search', `<p>The search box takes:</p><ul>` +
        `<li>a protein, by gene name, UniProt accession or entry name. Naming one protein opens its page.</li>` +
        `<li>a list of proteins, separated by spaces or commas: their ${esc(W.marks)} together.</li>` +
        `<li>one ${esc(W.mark)}, as a gene and a position${
EX.find(isSite) ? ` (<span class="mono">${esc(EX.find(isSite))}</span>)` : ''}.</li>` +
        (`<li>a term, <span class="mono">key:value</span>, where the key is a question or a fact about the ${esc(W.marks)}${
terms.length ? ` (${
terms.map(t => (`<button type="button" ` +
            `class="linkish mono" data-try="${esc(t)}">${esc(t)}</button>`)).join(', ')})` : ''}. Separate values ` +
            `with <span class="mono">|</span> or commas to match any. Several terms must all hold.</li></ul>`) +
        (`<p>The line under the box counts the ${esc(W.marks)} and proteins that match and names any word that ` +
            `matched nothing. ${mlink('search', 'Method › Search terms')} lists every key.</p>`)) +
      sec('h-filters', (`<p>The sidebar (☰ or Filters) lists the page's Sections and the Filters, one button per ` +
          `class or value with its count of ${esc(W.marks)}. A ${esc(W.mark)} is kept when it matches the search ` +
          `and every filter group, and any one of the values chosen within a control. Every page then shows the ${esc(W.marks)} that match,` +
          ` and the tests run again on them. Each chip shows how many ${esc(W.marks)} it holds; clicking a row in ` +
          `a tile does the same as ticking its chip.</p>`)) +
      sec('h-pages', (`<p>Click a row of a table to open its protein or ${esc(W.mark)}. Click a class row of a ` +
          `chart to select its ${esc(W.marks)}, and a tile's title to open the question. On a map, hover an item ` +
          `for its description and click to pin it; drag across the map to zoom, and use the evidence map's box to ` +
          `redraw it for any protein.</p>`)) +
      sec('h-selection', (`<p>A search or filter makes a selection, shown in the bar under the search box with × on ` +
          `each term, Save (kept in this browser), Copy link and Clear all. Every page then shows the selection, ` +
          `and the Overview tests every question again on it in your browser${
min ? `, from ${int(min.proteins)} proteins and ${int(min.marks)} ${esc(W.marks)}` : ''}. These tests ` +
          `are exploratory and not adjusted for the other selections you try.</p>`)) +
      sec('h-compare', (`<p>Under Compared with, the Overview compares your selection with the other ${esc(W.residues)} of the same ` +
          `proteins, with the other ${esc(W.marks)}, or with a saved selection. Each class shows your selection's ` +
          `share (filled) and the comparison's (hollow).</p>`)) +
      sec('h-read', (`<p>Each tile is a question and each row a class. The dot is the effect on a log scale with ` +
          `its 95% confidence interval, and 1× is no difference.</p>`) +
        (`<ul class="key-list"><li><i class="kd more"></i> more often: q ≤ 0.05 and at least 1.1×</li><li><i ` +
            `class="kd less"></i> less often</li><li><i class="kd same"></i> about the same: significant, but ` +
            `within 1.1×</li><li><i class="kd ns"></i> no difference: q > 0.05</li></ul>`) +
        (`<p>Within each protein compares each protein's ${esc(W.marks)} with the other ${esc(W.residues)} of the same ` +
            `protein. Across all proteins puts all the ${esc(W.residues)} together. The first separates where ${esc(W.marks)} lie from ` +
            `which proteins were found ${esc(W.marked)}. ${
SETQ ? (`Questions about protein classes show the fold ` +
            `enrichment of ${esc(W.marked)} proteins in each set. `) : ''}Hover a row, or Tab to it, for its ` +
            `counts. Select a tile for every class, and a class to select its ${esc(W.marks)}.</p>`) +
        `<p class="gloss-line"><b>Terms.</b> ${
['fold', 'odds ratio', 'q', 'within each protein', 'pooled', 'strata'].map(t => `<i>${
esc(t === 'pooled' ? 'across all proteins' : t)}</i>: ${esc(K.GLOSS[t])}`).join(' ')}</p>`) +
      sec('h-export', (`<p>Figures download as PDF, SVG, PNG (300 dpi) or TSV, and tables as TSV. Each file carries ` +
          `its test, citation, sources, versions and export date, in the file's metadata or a TSV's <span ` +
          `class="mono">#</span> lines. The Method button beside a figure opens how it was made.</p>`)) +
      sec('h-cite', (`<p>${mlink('cite', 'How to cite')} has the citation, a copy button and CITATION.cff. Cite ` +
          `also the sources that report the ${esc(W.marks)} you use.</p>`)) +
      sec('h-share', (`<p>The address holds the page, search, filters and comparison, so a copied link opens what ` +
          `you see. Back and Forward return to earlier pages and selections.</p>`)) +
      sec('h-keys', `<p>Single keys work when the cursor is not in a text box.</p>${keysTable()}`) +
      sec('h-access', (`<p>Every control works from the keyboard, and a skip link passes the header. Screen readers ` +
          `announce result counts. The light and dark themes (at the foot of every page) follow your system unless ` +
          `you pick one, and motion follows its reduced-motion setting. Pages work at 200% zoom and on a phone. If ` +
          `something does not work for you, tell the authors (links in the header).</p>`) +
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
      document.body.insertAdjacentHTML('beforeend', (`<dialog class="keys-dlg" aria-labelledby="keys-title"><div ` +
          `class="keys-head"><h2 id="keys-title">Keyboard shortcuts</h2>`) +
        (`<button type="button" class="sp-close" data-keys-close aria-label="Close">×</button></div><div ` +
            `class="keys-body"></div>`) +
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
  const KEEP = ['data-m', 'data-vs', 'data-f', 'data-v', 'data-all', 'data-sort', 'data-ssort', 'data-exp', 'data-texp', 'data-aid', 'data-tile', 'data-try', 'data-site', 'data-goto', 'data-cf', 'data-cv', 'data-sel-clear', 'data-theme-choice', 'id'];
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
  document.getElementById('credit')?.insertAdjacentHTML('beforebegin', (`<span class="foot-help"><a href="#help">` +
      `Help</a> · <button type="button" class="linkish" data-keys-open>Keyboard shortcuts <kbd>?</kbd></button>` +
      `</span>`));
});
