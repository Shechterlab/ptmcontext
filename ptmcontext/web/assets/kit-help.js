/* Help for every reader, on any site: a start panel on the Overview for a first visit, the Help page ("How to use this
   site"), keyboard shortcuts with their "?" overlay, result counts read out to screen readers, focus kept or moved
   where a reader expects it when a page is drawn again, and the hover help reachable by keyboard focus and by a long
   press on a touch screen. Words come from the site's data (its name, tagline, examples, words for its marks) and,
   where a site wants its own, from website.start in the site file:
     start: {title, text, examples: [{label, query, help}]}     (query: what the search box takes; at most three shown)
   Without website.start the three starts are chosen from website.examples: a list of genes, a term (key:value), one
   site or one protein. A module of the site kit: it changes no result and reads no data of its own. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, S, esc, int, cap } = K;
  const $ = (s) => document.querySelector(s);
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set: (k, v) => {
      try {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch (e) {
        /* storage may be blocked */
      }
    },
  };
  const START_KEY = `ptmc-start-hidden-${D.site.id}`;
  const SETQ = D.analyses.some((a) => a.kind === 'protein_sets');
  const has = (v) => ['overview', 'method', 'help'].includes(v) || !!K.views[v];

  // ---- the three starts ---------------------------------------------------------------------------------------------
  const EX = D.site.examples || [];
  const isTerm = (e) => e.includes(':');
  const isSite = (e) => !isTerm(e) && /^\S+\s+[A-Za-z]?\d+$/.test(e.trim());
  const isList = (e) => !isTerm(e) && !isSite(e) && /\s/.test(e.trim());
  const KIND = {
    list: ['A list of genes', `Paste gene names or accessions. Every question is tested again on their ${W.marks}.`],
    term: [
      'A class or a term',
      `Select the ${W.marks} of one class (key:value) to see where they lie${
        SETQ ? ' and which proteins have them' : ''
      }.`,
    ],
    site: [`One ${W.mark}`, `Open its protein at that ${W.mark}, with its regions, evidence and structures.`],
    one: ['One protein', `Open its page: its ${W.marks} on a map, the evidence for each, and its structures.`],
  };
  const kindOf = (e) => (isTerm(e) ? 'term' : isSite(e) ? 'site' : isList(e) ? 'list' : 'one');
  function starts() {
    const own = (D.start?.examples || []).filter((x) => x && x.query);
    if (own.length)
      return own.slice(0, 3).map((x) => ({
        label: x.label || KIND[kindOf(x.query)][0],
        query: x.query,
        help: x.help ?? KIND[kindOf(x.query)][1],
      }));
    const out = [],
      add = (e) => {
        if (e && !out.some((x) => x.query === e))
          out.push({ label: KIND[kindOf(e)][0], query: e, help: KIND[kindOf(e)][1] });
      };
    add(EX.find(isList));
    add(EX.find(isTerm));
    add(EX.find(isSite) || EX.find((e) => kindOf(e) === 'one'));
    EX.forEach((e) => {
      if (out.length < 3) add(e);
    });
    return out.slice(0, 3);
  }
  const startButtons = (cls) =>
    `<ol class="${cls}">${starts()
      .map(
        (x) =>
          `<li><button type="button" class="sp-start" ` +
          `data-try="${esc(x.query)}">` +
          `<span class="sp-label">${esc(x.label)}</span><span class="sp-q mono">${esc(x.query)}</span>${
            x.help ? `<span class="sp-help">${esc(x.help)}</span>` : ''
          }</button></li>`
      )
      .join('')}</ol>`;
  const whatText = (where = 'below') =>
    D.start?.text ||
    `${D.site.tagline ? D.site.tagline + ' ' : ''}Each tile ${where} is one question ` +
      `about where ${W.marks} lie${
        SETQ ? ' and which proteins have them' : ''
      }, each compared with the other ${W.residues} of the same ` +
      `proteins. Search a protein, a gene list or a class to test your own selection.`;

  // ---- the start panel: on the Overview, until the reader hides it (remembered in this browser) ---------------------
  // a site that opens with the cell and the nucleus drawn (a card with drawing: true) has no panel above them
  const cellFirst = () =>
    (D.overview?.sections || []).some((x) =>
      (x.cards || []).some((c) => c && c.drawing === true && c.analysis === D.cell?.id)
    );
  (K.overviewTop ||= []).push(() => {
    if (K.sel?.active() || S.arg || S.vs !== 'residues' || !starts().length || cellFirst()) return '';
    if (store.get(START_KEY))
      return (
        `<p class="sp-show"><button type="button" class="linkish" data-start-show>` + `Show introduction</button></p>`
      ); // hidden: a small way back, in its place
    return (
      `<section class="start-panel" aria-labelledby="sp-title"><div class="sp-head"><h2 id="sp-title">${esc(
        D.start?.title || 'New here? Start from a question of your own'
      )}</h2>` +
      `<button type="button" class="sp-close" data-start-hide aria-label="Hide this introduction">×</button></div>` +
      (`<p class="sp-what">${esc(whatText())} <span class="muted">${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins.</span>` +
        `</p>`) +
      startButtons('sp-starts') +
      (`<p class="sp-foot"><a href="${esc(K.link('help'))}">Help</a><span aria-hidden="true"> · ` +
        `</span><span class="sp-keys">Press <kbd>/</kbd> to search, <kbd>?</kbd> for every shortcut</span></p>` +
        `</section>`)
    );
  });
  (K.afterRender ||= []).push(() => document.body.classList.toggle('intro-hidden', !!store.get(START_KEY)));
  K.clicks.push(
    [
      '[data-start-hide]',
      () => {
        store.set(START_KEY, '1');
        K.render();
        announce('Introduction hidden. "Show introduction" brings it back.');
      },
    ],
    [
      '[data-start-show]',
      () => {
        store.set(START_KEY, null);
        K.go('overview');
      },
    ],
    ['[data-keys-open]', () => openKeys()]
  );

  // ---- the Help page -------------------------------------------------------------------------------------------------
  const SHORTCUTS = () => [
    ['/', 'Search: put the cursor in the search box'],
    ['Esc', 'Close a dialog, the sidebar or a hover; leave the search box'],
    ...[
      ['o', 'overview', 'Overview'],
      ['p', 'proteins', 'Proteins'],
      ['s', 'sites', cap(W.marks)],
      ['i', 'interactions', K.tabName('interactions', 'Interactions')],
      ['c', 'overlap', K.tabName('overlap', 'Compare sets')],
      ['n', 'network', K.tabName('network', 'Network')],
      ['m', 'method', K.tabName('method', 'Methods')],
      ['h', 'help', 'Help'],
    ]
      .filter(([, v]) => has(v))
      .map(([k, , name]) => [`g ${k}`, `Go to ${name}`]),
    ['?', 'Show these shortcuts'],
    ['Tab, Shift+Tab', 'Move between links, buttons and rows; a row with a hover shows it on focus'],
    ['Enter or Space', 'Open a tile, select a class, sort a column'],
  ];
  const GO = {
    o: 'overview',
    p: 'proteins',
    s: 'sites',
    i: 'interactions',
    c: 'overlap',
    n: 'network',
    m: 'method',
    h: 'help',
  };
  const keysTable = () =>
    `<table class="tbl keys-tbl"><thead><tr><th scope="col">Key</th><th scope="col">What it ` +
    `does</th></tr></thead><tbody>` +
    SHORTCUTS()
      .map(
        ([k, t]) =>
          `<tr><td>${k
            .split(', ')
            .map((x) =>
              x
                .split(/(?<=^g) /)
                .map((y) => `<kbd>${esc(y)}</kbd>`)
                .join(' then ')
            )
            .join(', ')}</td><td>${esc(t)}</td></tr>`
      )
      .join('') +
    '</tbody></table>';
  const terms = EX.filter(isTerm);
  // Help is one short page: searching, filters, reading a figure, and what the badges and terms mean. The rest (selections,
  // downloads, citing, sharing, keys, accessibility) is under Methods.
  const SECTIONS = [
    ['h-search', 'Searching'],
    ['h-filters', 'Filters'],
    ['h-read', 'Reading a figure'],
    ['h-terms', 'Badges and terms'],
  ];
  // The kit's shared glossary: a term the site's own words use gets its entry here, in every site that uses it. The site's
  // own glossary (website.front.glossary) adds terms and takes the place of a shared one of the same name.
  const SHARED_TERMS = [
    ['IDR', /\bIDRs?\b/, 'an intrinsically disordered region, a stretch of protein with no fixed fold.'],
    ['aa', /\baa\b/, 'amino acids (residues), as in "within 20 aa".'],
    [
      'Janus',
      /\bJanus\b/,
      'an IDR with a quarter to a third of its residues charged (FCR 0.25 to 0.35), positive and negative mixed so that it is neither clearly acidic nor basic (a Janus sequence in the Das–Pappu diagram of states).',
    ],
    [
      'polyampholyte',
      /polyampholyte/i,
      'a region carrying both positive and negative charges. Strong polyampholytes have more than a third of their residues charged, with the charges balanced (FCR > 0.35, |NCPR| < 0.35).',
    ],
    ['FCR', /\bFCR\b/, 'fraction of charged residues: positive plus negative.'],
    ['NCPR', /\bNCPR\b/, 'net charge per residue: positive minus negative.'],
    [
      'ChEP',
      /\bChEP\b/,
      'chromatin enrichment for proteomics: how strongly a protein is found with chromatin in interphase cells.',
    ],
  ];
  function glossaryTerms() {
    const own = D.front?.glossary || {},
      have = new Set(Object.keys(own).map((t) => t.toLowerCase())),
      text = JSON.stringify([D.analyses, { ...D.front, glossary: null }, D.start, D.overview, D.attribute_specs]);
    return [
      ...SHARED_TERMS.filter(([t, re]) => !have.has(t.toLowerCase()) && re.test(text)).map(([t, , d]) => [t, d]),
      ...Object.entries(own),
    ];
  }
  K.glossaryTerms = glossaryTerms;
  function helpPage() {
    const sec = (id, body) =>
      `<section id="${id}"><h3>${esc(SECTIONS.find((s) => s[0] === id)[1])}</h3>${body}</section>`;
    const mlink = (arg, text) => `<a href="${esc(K.link('method', arg))}">${text}</a>`;
    const term = (t, d) => `<dt>${t}</dt><dd>${d}</dd>`;
    return (
      `<div class="page-head"><h2>Help</h2></div><div class="doc help-doc">` +
      sec(
        'h-search',
        `<p>The search box takes a protein (gene name, UniProt accession or entry name), a list of proteins separated by ` +
          `spaces or commas, one ${esc(W.mark)} as a gene and a position${
            EX.find(isSite) ? ` (<span class="mono">${esc(EX.find(isSite))}</span>)` : ''
          }, or a term written <span class="mono">key:value</span>${
            terms.length
              ? ` (${terms
                  .map((t) => `<button type="button" ` + `class="linkish mono" data-try="${esc(t)}">${esc(t)}</button>`)
                  .join(', ')})`
              : ''
          }. Separate values with <span class="mono">|</span> to match any; several terms must all hold. Naming one ` +
          `protein opens its page. The line under the box counts what matches. ${mlink('search', 'Methods › Sources')} lists every key.</p>`
      ) +
      sec(
        'h-filters',
        `<p>The sidebar (☰ or Filters) holds one button per class or value, with its count of ${esc(W.marks)}. A ` +
          `${esc(W.mark)} stays when it matches the search and every filter group. Every page then shows what matches, and the ` +
          `Overview tests its questions again on it. Clicking a row in a tile does the same as ticking its button. ` +
          `Clear all removes the selection.</p>`
      ) +
      sec(
        'h-read',
        `<p>Each tile is a question and each row a class. The dot and the number are the fold on a log scale: the share ` +
          `of ${esc(W.marks)} in the class over the share of the comparison (1× is no difference). The line under it is ` +
          `the test: odds ratio, 95% interval and q. Hover a row, or tap it, for the counts.</p>` +
          (`<ul class="key-list"><li><i class="kd more"></i> more often: q ≤ 0.05 and a fold of at least 1.1×</li><li><i ` +
            `class="kd less"></i> less often</li><li><i class="kd same"></i> about the same: significant, but ` +
            `within 1.1×</li><li><i class="kd ns"></i> no difference (q > 0.05), or too few to test</li></ul>`) +
          `<p>The Test switch changes how the tiles marked ⇄ compare ${esc(W.marks)}; the tiles about protein classes keep ` +
          `their own test. ${mlink('tests', 'Methods › Tests')} describes each test.</p>`
      ) +
      sec(
        'h-terms',
        `<dl class="gloss-list">` +
          term('Fold', 'The share in the class divided by the share in the comparison group. 1× means no difference.') +
          term(
            'OR (odds ratio)',
            'How many times higher the odds are inside the class than outside it. 2× means twice the odds.'
          ) +
          term(
            'q',
            'The p value adjusted for the many tests run (Benjamini–Hochberg false discovery rate). A difference counts at q ≤ 0.05 and a fold of at least 1.1×.'
          ) +
          term(
            'h',
            'The size of a difference between two shares, used on the cell maps: 0.2 is small, 0.5 medium and 0.8 large (Cohen’s h). Unlike a fold, it does not grow just because a share is small.'
          ) +
          term(
            'Within each protein',
            `Each ${esc(W.mark)} is compared only with the other ${esc(W.residues)} of its own protein.`
          ) +
          term('Across all proteins', `All the ${esc(W.residues)} of all the proteins are compared as one group.`) +
          (SETQ
            ? term(
                'Abundance deciles',
                'Proteins sorted by measured abundance into ten equal groups. The test compares proteins only within a group, so abundant proteins do not drive the result.'
              )
            : '') +
          term(
            "Doesn't hold (badge)",
            'The result disappears or reverses when the question is asked again with one change, such as only high-confidence sites. The badge names the control.'
          ) +
          term(
            'Controls',
            `The same question repeated with one change each. ${mlink('controls', 'Methods › Controls')} lists them.`
          ) +
          glossaryTerms()
            .map(([t, d]) => term(esc(t), esc(cap(d))))
            .join('') +
          `</dl><p>More: ${mlink('', 'Methods')} · ${mlink('download', 'Download')} · ${mlink('cite', 'Cite')} · ` +
          `<button type="button" class="linkish" data-keys-open>Keyboard shortcuts</button></p>`
      ) +
      '</div>'
    );
  }
  // the rest of the old Help page, under Methods: what the explorer is, selections, sharing a link, keys and access
  (K.methodParts ||= []).push(() => {
    const min = K.sel?.MIN;
    return (
      `<section id="m-about"><h3>About</h3><p>${esc(whatText('on the Overview'))} It holds ${int(D.counts.marks)} ${esc(W.marks)} on ` +
      `${int(D.counts.proteins)} proteins and ${int(D.analyses.length)} questions.</p></section>` +
      `<section id="m-selection"><h3>Selections and Compared with</h3><p>A search or filter makes a selection, shown in the bar under ` +
      `the search box, with × on each term, Save (kept in this browser), Copy link and Clear all. Every page then shows the selection, ` +
      `and the Overview tests every question again on it in the browser${
        min ? `, from ${int(min.proteins)} proteins and ${int(min.marks)} ${esc(W.marks)}` : ''
      }. These tests are exploratory and not adjusted for the other selections tried.</p>` +
      `<p>Under Compared with, the Overview compares the selection with the other ${esc(W.residues)} of the same proteins, with the other ` +
      `${esc(W.marks)}, or with a saved selection. Each class shows the selection’s share (filled) and the comparison’s (hollow).</p></section>` +
      `<section id="m-share"><h3>Sharing a link</h3><p>The address holds the page, search, filters and comparison, so a copied link ` +
      `opens what is on screen. Back and Forward return to earlier pages and selections. Figures download as PDF, SVG, PNG or TSV, each with ` +
      `its test, citation and sources.</p><h4>Keyboard shortcuts</h4><p>Single keys work when the cursor is not in a text box.</p>${keysTable()}</section>` +
      `<section id="m-access"><h3>Accessibility</h3><p>Every control works from the keyboard, and a skip link passes the header. Screen readers ` +
      `announce result counts. The light and dark themes (at the foot of every page) follow the system unless one is picked, and motion follows its ` +
      `reduced-motion setting. Pages work at 200% zoom and on a phone. If something does not work, tell the authors (links in the header).</p></section>`
    );
  });
  K.views.help = {
    render: helpPage,
    title: () => 'Help',
    after: (arg) => {
      if (arg) document.getElementById(arg)?.scrollIntoView({ block: 'start' });
    },
  };
  K.sections.help = () => [['view', 'Help', 1], ...SECTIONS.map(([id, t]) => [id, t, 1])];
  (K.tabsEnd ||= []).push(() => ['help', 'Help', null]);

  // ---- keyboard shortcuts and their overlay --------------------------------------------------------------------------
  let dlg = null;
  function openKeys() {
    if (!dlg) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<dialog class="keys-dlg" aria-labelledby="keys-title"><div ` +
          `class="keys-head"><h2 id="keys-title">Keyboard shortcuts</h2>` +
          (`<button type="button" class="sp-close" data-keys-close aria-label="Close">×</button></div><div ` +
            `class="keys-body"></div>`) +
          `<p class="muted small">More in <a href="#help" data-keys-close>Help</a>.</p></dialog>`
      );
      dlg = document.querySelector('.keys-dlg');
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg || e.target.closest('[data-keys-close]')) dlg.close();
      });
    }
    dlg.querySelector('.keys-body').innerHTML = keysTable();
    if (!dlg.open) dlg.showModal();
  }
  addEventListener('hashchange', () => {
    if (dlg?.open) dlg.close();
    hideTip();
  }); // a new page closes the overlay
  const typingIn = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  let gAt = 0;
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const ae = document.activeElement;
    if (e.key === 'Escape') {
      if (!tipEl.hidden) {
        hideTip();
        return;
      }
      if (ae && ae.id === 'q') ae.blur();
      return;
    }
    if (typingIn(ae) || dlg?.open) return;
    if (e.key === '/') {
      e.preventDefault();
      const q = $('#q');
      q.focus();
      q.select();
      q.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      openKeys();
      return;
    }
    if (e.key === 'g') {
      gAt = Date.now();
      return;
    }
    if (gAt && Date.now() - gAt < 1500) {
      gAt = 0;
      const v = GO[e.key.toLowerCase()];
      if (v && has(v)) {
        e.preventDefault();
        userAt = Date.now();
        location.hash = K.link(v);
      }
    }
  });
  // a control drawn as a row or a picture part (role="button") works from the keyboard as a button does; a module that
  // handles its own keys first (preventDefault) is left alone. Sortable column heads of the statistics table too.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || (e.key !== 'Enter' && e.key !== ' ')) return;
    const el = e.target;
    if (!(el instanceof Element) || /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) return;
    if (el.matches('[role="button"], th[data-sort]')) {
      e.preventDefault();
      // a part of a drawing (an SVG group) has no click(): send the event a pointer would
      if (typeof el.click === 'function') el.click();
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });

  // ---- read-outs for screen readers: the selection's count when it changes, short notes ------------------------------
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="ptmc-live" class="vh" role="status" aria-live="polite" aria-atomic="true"></div>'
  );
  const live = document.getElementById('ptmc-live');
  let said = '',
    sayT;
  function announce(text) {
    clearTimeout(sayT);
    sayT = setTimeout(() => {
      live.textContent = '';
      requestAnimationFrame(() => {
        live.textContent = text;
      });
      said = text;
    }, 50);
  }
  K.announce = announce;
  let countT;
  const countText = () => {
    const sc = $('#scope');
    if (!sc) return '';
    const main = sc.querySelector('.sel-flag + span') || sc.querySelector('span');
    const miss = [...sc.querySelectorAll('.sel-miss')].map((x) => x.textContent.trim());
    return [(sc.classList.contains('selected') ? 'Selection: ' : '') + (main?.textContent || '').trim(), ...miss]
      .filter(Boolean)
      .join('. ');
  };
  let lastCount = null;
  new MutationObserver(() => {
    clearTimeout(countT);
    countT = setTimeout(() => {
      const t = countText();
      if (lastCount != null && t && t !== lastCount && t !== said) announce(t);
      lastCount = t;
    }, 700);
  }).observe($('#scope'), { childList: true, subtree: true, characterData: true });

  // ---- focus when a page is drawn again ------------------------------------------------------------------------------
  // The kit draws a page anew on every change. A control the reader was using is found again in the new page and
  // focused (a test switch, a sort, a class picked); when the reader has gone to another page, focus moves to its
  // heading, so a screen reader says where they are and Tab continues from there.
  let userAt = 0,
    lastFocus = null,
    pageKey = null;
  ['pointerdown', 'keydown'].forEach((t) =>
    document.addEventListener(
      t,
      () => {
        userAt = Date.now();
      },
      true
    )
  );
  addEventListener('popstate', () => {
    userAt = Date.now();
  });
  const KEEP = [
    'data-m',
    'data-vs',
    'data-f',
    'data-v',
    'data-all',
    'data-sort',
    'data-ssort',
    'data-exp',
    'data-texp',
    'data-aid',
    'data-tile',
    'data-try',
    'data-site',
    'data-goto',
    'data-cf',
    'data-cv',
    'data-sel-clear',
    'data-theme-choice',
    'id',
  ];
  const sig = (el) => {
    const parts = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`);
    if (!parts.length && el.tagName === 'A' && el.getAttribute('href'))
      parts.push(`[href="${CSS.escape(el.getAttribute('href'))}"]`);
    return parts.length ? el.tagName.toLowerCase() + parts.join('') : null;
  };
  // what had focus in the page: a control's signature, or the heading ('@h') when focus was moved there
  document.addEventListener('focusin', (e) => {
    const v = $('#view');
    if (v && v.contains(e.target) && e.target !== v) lastFocus = e.target.matches('h2,h3') ? '@h' : sig(e.target);
  });
  const toHeading = () => {
    const h = heading();
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  };
  const heading = () => $('#view h2') || $('#view h3');
  function afterDraw() {
    const key = S.view + '/' + (S.view === 'protein' ? String(S.arg).split('/')[0] : S.arg);
    const moved = pageKey != null && key !== pageKey,
      recent = Date.now() - userAt < 3000; // a selection's data may take a moment
    pageKey = key;
    a11yPass();
    const ae = document.activeElement,
      lost = !ae || ae === document.body;
    if (
      moved &&
      recent &&
      (lost || $('#tabs')?.contains(ae) || $('#rail')?.contains(ae) || $('#view')?.contains(ae)) &&
      !(ae && ae.id === 'q' && S.view === 'overview')
    ) {
      toHeading();
      return;
    }
    // the control in use was drawn again: focus it; it is gone (a start that made a selection): the page's heading
    if (lost && recent) {
      const el = lastFocus && lastFocus !== '@h' && document.querySelector('#view ' + lastFocus);
      if (el) el.focus({ preventScroll: true });
      else if (lastFocus) toHeading();
    }
  }
  let drawT;
  new MutationObserver(() => {
    cancelAnimationFrame(drawT);
    drawT = requestAnimationFrame(afterDraw);
  }).observe($('#view'), { childList: true });

  // what the kit's markup leaves to the reader's tools: a table wider than its card scrolls from the keyboard, and is
  // named; a sortable column head of the statistics table takes focus
  function a11yPass() {
    document.querySelectorAll('#view .tbl-card').forEach((c) => {
      const wide = c.scrollWidth > c.clientWidth + 1;
      if (wide && !c.hasAttribute('tabindex')) {
        const h = c.closest('section')?.querySelector('h2,h3') || heading();
        c.setAttribute('tabindex', '0');
        c.setAttribute('role', 'region');
        c.setAttribute('aria-label', (h?.textContent.trim() || 'Table') + ' (scrolls sideways)');
      }
    });
    document.querySelectorAll('#view th[data-sort]:not([tabindex])').forEach((th) => th.setAttribute('tabindex', '0'));
  }
  addEventListener('resize', () => requestAnimationFrame(a11yPass));

  // ---- hover help on keyboard focus and on touch ---------------------------------------------------------------------
  // The kit shows a row's numbers (and every module's hovers, K.tips) when the pointer moves over it. Focus does the
  // same: the hover is asked for at the element's place, and named as the element's description. On a touch screen a
  // long press shows it (and does not also press the control); a tap elsewhere or Esc hides it. An element with only
  // a title shows its title the same way.
  const tipEl = $('#tip');
  const TIPPED = () => ['.drow', '.trow', 'tr[data-i]', ...K.tips.map((t) => t[0])].join(',');
  let tipFor = null;
  function hideTip() {
    tipEl.hidden = true;
    if (tipFor) {
      tipFor.removeAttribute('aria-describedby');
      tipFor = null;
    }
  }
  function showTipAt(el, x, y) {
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
    if (tipEl.hidden && el.getAttribute('title')) {
      tipEl.innerHTML = esc(el.getAttribute('title'));
      tipEl.hidden = false;
      tipEl.style.left = Math.max(8, Math.min(x + 14, innerWidth - tipEl.offsetWidth - 8)) + 'px';
      tipEl.style.top = Math.min(y + 14, innerHeight - tipEl.offsetHeight - 8) + 'px';
    }
    if (!tipEl.hidden) {
      tipFor = el;
      if (!el.hasAttribute('aria-describedby') && !el.getAttribute('title')) el.setAttribute('aria-describedby', 'tip');
    }
  }
  const tipTarget = (t) =>
    t.closest?.(TIPPED()) || t.closest?.('[title]:is(button,a,[tabindex],.sel-miss,h4,abbr,i,span)') || null;
  document.addEventListener('focusin', (e) => {
    if (!e.target.matches?.(':focus-visible')) return;
    const el = e.target.matches(TIPPED()) || e.target.getAttribute?.('title') ? e.target : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    showTipAt(el, r.left + Math.min(r.width / 2, 60), r.bottom - 6);
  });
  document.addEventListener('focusout', (e) => {
    if (tipFor && tipFor === e.target) hideTip();
  });
  let press = null,
    swallow = false;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return;
      if (!tipEl.hidden && !e.target.closest('#tip')) hideTip();
      const el = tipTarget(e.target);
      if (!el) return;
      const x = e.clientX,
        y = e.clientY;
      press = {
        x,
        y,
        t: setTimeout(() => {
          showTipAt(el, x, y);
          swallow = !tipEl.hidden;
          press = null;
        }, 450),
      };
    },
    true
  );
  const cancelPress = (e) => {
    if (press && (e.type !== 'pointermove' || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10)) {
      clearTimeout(press.t);
      press = null;
    }
  };
  ['pointerup', 'pointercancel', 'pointermove'].forEach((t) => document.addEventListener(t, cancelPress, true));
  document.addEventListener(
    'click',
    (e) => {
      if (swallow) {
        swallow = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (swallow) e.preventDefault();
    },
    true
  );

  // the footer's "Keyboard shortcuts" is a button (kit.js writes it); [data-keys-open] opens the dialog
});
