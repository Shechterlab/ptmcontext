/* The cards front end's navigation (website.front.mode: cards): the Sections menu, every question of the site grouped under
   the home's cards (then "More": the pages and the questions no card holds), each with its short name and, for the current
   selection, how many proteins it covers; the same list as a page (#sections) and, on a question's page at a desktop
   width, as a left column that can be hidden (remembered); and the one row on a question's page, "Home / <question>"
   with its previous and next question in this order. A module of the site kit; it does nothing when the mode is classic. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, A, S, esc, int } = K;
  const F = D.front;
  if (!F || F.mode !== 'cards' || !K.front) return;
  const short = i => F.short?.[i] || A[i]?.title || i;
  const CARDS = F.cards || [];
  const wide = () => matchMedia('(min-width: 1100px)').matches;
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } } };

  // ---- the questions in the order of the menu: each card's, then those no card holds ---------------------------------------
  const cardQs = c => c.questions.filter(q => A[q]);
  const moreQs = () => (F.more?.questions || []).filter(q => A[q]);
  const order = () => [...CARDS.flatMap(cardQs), ...moreQs()];
  // the site's pages after the questions (Proteins, Sites, ...): those the kit has, named as the site names its tabs
  function pages() {
    const base = [...K.tabs.map(f => f()).filter(Boolean).map(([v, n]) => [v, n]), ['statistics', 'All tests'], ['method', 'Methods and data'], ...(K.tabsEnd || []).map(f => f()).filter(Boolean).map(([v, n]) => [v, n])];
    return base.filter(([v]) => v !== 'overview' && (K.views[v] || ['statistics', 'method'].includes(v))).map(([v, n]) => [v, K.tabName(v, n)]);
  }

  // ---- how many proteins of the selection (or the dataset) a question covers ---------------------------------------------------
  let cov = { key: null, n: {} };
  function coverage(id) {
    const SD = K.sel.peek();
    if (!SD) return null;
    const c = K.sel.compute(), prots = c.active ? c.proteins : null;
    if (cov.key !== c.key) cov = { key: c.key, n: {} };
    if (id in cov.n) return cov.n[id];
    let s = null;
    if (id === D.cell?.id) { s = new Set(); (D.cell.maps || []).forEach(m => (SD.protein_sets?.[m.analysis]?.sets || []).forEach(x => x[2].forEach(p => s.add(p)))); }
    else if (SD.protein_sets?.[id]) {
      const ps = SD.protein_sets[id]; s = new Set();
      if (ps.of) { const has = new Set(ps.sets.flatMap(x => x[2])); Object.entries(ps.of).forEach(([p, us]) => { if (us.some(u => has.has(u))) s.add(+p); }); }
      else ps.sets.forEach(x => x[2].forEach(p => s.add(p)));
    } else if (SD.analyses.includes(id)) {
      // a residue question: the proteins with a mark that has a class (not "no annotation")
      const ai = SD.analyses.indexOf(id), none = new Set(['no_disorder_annotation', 'no_domain_annotation', 'none', ''].map(v => SD.classes[id].indexOf(v)));
      s = new Set(); (c.active ? c.marks : SD.marks.map((_, i) => i)).forEach(i => { const m = SD.marks[i]; if (m[2][ai].some(x => !none.has(x))) s.add(m[0]); });
    }
    if (!s) return (cov.n[id] = null);
    let n = 0; s.forEach(p => { if (!prots || prots.has(p)) n++; });
    return (cov.n[id] = n);
  }
  const covTag = id => { const n = coverage(id); return n == null ? '' : ` <small class="fr-cov" title="${int(n)} proteins of ${K.sel.active() ? 'your selection' : 'the dataset'}">${int(n)}</small>`; };

  // ---- the list ----------------------------------------------------------------------------------------------------------------
  function listHtml(cur) {
    const item = q => `<li><a href="${esc(K.link('overview', q))}"${cur === q ? ' aria-current="page"' : ''}>${esc(short(q))}${covTag(q)}</a></li>`;
    const page = ([v, n]) => `<li><a href="${esc(K.link(v))}"${S.view === v ? ' aria-current="page"' : ''}>${esc(n)}</a></li>`;
    const pg = pages(), mq = moreQs();
    return CARDS.filter(c => cardQs(c).length).map(c => `<section class="fr-sec"><h3>${esc(c.title)}</h3><ul>${cardQs(c).map(item).join('')}</ul></section>`).join('') +
      (mq.length || pg.length ? `<section class="fr-sec"><h3>${esc(F.more?.title || 'More')}</h3><ul>${mq.map(item).join('')}${pg.map(page).join('')}</ul></section>` : '');
  }
  const lead = () => K.sel.active() ? `Proteins of your selection that each question covers.` : `Proteins of the dataset that each question covers.`;

  // ---- the menu: a dialog over the page, from the header's button ----------------------------------------------------------
  const BEHIND = '.skip, .hero, .toolbar, .layout, footer.site, .rail-scrim';
  let menu = null, opener = null;
  const setInert = on => document.querySelectorAll(BEHIND).forEach(x => { x.inert = on; });
  function paint() { if (menu) menu.querySelector('.fr-menu-body').innerHTML = `<p class="muted fr-lead">${esc(lead())}</p><div class="fr-secs">${listHtml(S.view === 'overview' ? S.arg : '')}</div>`; }
  function openMenu(from) {
    if (menu) return;
    opener = from || document.activeElement;
    menu = document.createElement('div'); menu.className = 'fr-menu'; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-modal', 'true'); menu.setAttribute('aria-labelledby', 'fr-menu-h');
    menu.innerHTML = `<div class="fr-menu-box"><div class="fr-menu-head"><h2 id="fr-menu-h">Sections</h2><a class="btn small" href="${esc(K.link('sections'))}">As a page</a><button type="button" class="btn small" data-fr-menu-close>Close</button></div><div class="fr-menu-body"></div></div>`;
    document.body.appendChild(menu); paint(); setInert(true);
    document.querySelectorAll('[data-sections-open]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    menu.querySelector('[data-fr-menu-close]').focus();
    K.sel.data();                                           // the counts need the marks: read them now, draw them on arrival
    K.sel.ready.then(() => { if (menu) paint(); });
  }
  function closeMenu(back) {
    if (!menu) return;
    menu.remove(); menu = null; setInert(false);
    document.querySelectorAll('[data-sections-open]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (back && opener && opener.isConnected) opener.focus();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-sections-open]');
    if (b) { e.preventDefault(); if (menu) closeMenu(true); else openMenu(b); return; }
    if (!menu) return;
    if (e.target.closest('[data-fr-menu-close]')) closeMenu(true);
    else if (e.target === menu || e.target.closest('a')) closeMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (!menu) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); return; }
    if (e.key !== 'Tab') return;
    const f = [...menu.querySelectorAll('a[href], button:not([disabled])')].filter(x => x.offsetParent !== null); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!menu.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, true);
  addEventListener('hashchange', () => closeMenu(false));

  // ---- the same list as a page -------------------------------------------------------------------------------------------------
  K.views.sections = {
    follows: true, title: () => 'Sections',
    render: () => { K.sel.data(); return `<nav class="fr-nav" aria-label="Trail"><a href="${esc(K.link('overview'))}">Home</a><span aria-hidden="true">/</span><span aria-current="page">Sections</span></nav>` +
      `<div class="page-head"><h2>Sections</h2></div><p class="muted fr-lead">${esc(lead())}</p><div class="fr-secs fr-secs-page">${listHtml('')}</div>`; },
  };

  // ---- a question's row: Home / its name, with the previous and next question in this order ----------------------------------------
  const cardNote = aid => (D.front?.cards || []).find(c => (c.questions || []).includes(aid))?.note || '';
  function navRow(aid) {
    const o = order(), i = o.indexOf(aid), prev = o[i - 1], next = o[i + 1];
    const pn = i < 0 ? '' : `<span class="fr-pn">${prev ? `<a href="${esc(K.link('overview', prev))}" rel="prev" title="${esc(short(prev))}">← previous</a>` : '<span class="off">← previous</span>'}` +
      `<span aria-hidden="true">·</span>${next ? `<a href="${esc(K.link('overview', next))}" rel="next" title="${esc(short(next))}">next →</a>` : '<span class="off">next →</span>'}</span>`;
    return `<nav class="fr-nav" aria-label="Trail"><a href="${esc(K.link('overview'))}">Home</a><span aria-hidden="true">/</span><span class="fr-here" aria-current="page">${esc(short(aid))}</span>${pn}</nav>` + (cardNote(aid) ? `<p class="fr-qnote">${esc(cardNote(aid))}</p>` : '');
  }

  // ---- the left column on a question's page, at a desktop width ---------------------------------------------------------------------
  const colOpen = () => store.get('ptmc-qnav') !== 'closed';
  function column() {
    const el = document.getElementById('qnav'); if (!el) return;
    const on = S.view === 'overview' && !!S.arg && !!A[S.arg] && wide();
    document.body.classList.toggle('has-qnav', on);
    document.body.classList.toggle('qnav-closed', on && !colOpen());
    if (!on) { el.innerHTML = ''; return; }
    if (!K.sel.peek()) setTimeout(() => K.sel.data(), 800);          // the counts need the marks: read them once the page is up
    el.innerHTML = colOpen()
      ? `<div class="qnav-head"><b>Sections</b><button type="button" class="linkish" data-qnav aria-expanded="true">Hide</button></div><div class="fr-secs">${listHtml(S.arg)}</div>`
      : `<button type="button" class="btn small qnav-show" data-qnav aria-expanded="false" aria-label="Show the sections list">☰</button>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-qnav]'); if (!b) return;
    store.set('ptmc-qnav', colOpen() ? 'closed' : 'open'); column();
    document.querySelector('#qnav [data-qnav]')?.focus();
  });
  (K.afterRender ||= []).push(() => { column(); if (menu) paint(); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(column, 150); });

  Object.assign(K.front, { navRow, order, pages, coverage, openMenu: () => openMenu(), closeMenu, listHtml });
});
