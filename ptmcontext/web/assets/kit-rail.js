/* The selection's sidebar and bar: Sections and Filters in a drawer or pinned beside the page, the selection line with its
   chips and saved selections, and the events that drive them. The selection itself (the search and filters, which marks
   pass, the tests run again on them) is kit-select.js and K.sel; this module only draws and changes it. A module of the
   site kit: K.rail(), K.watchSections(), and K.sel.bar() / K.sel.savedList() for the selection line. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, S, esc, int } = K;
  const M = K.sel;
  const SPECS = D.attribute_specs || {};
  // the selection model's pieces this module draws and changes; its data and sets are read through functions, as they load later
  const {
    describe,
    dropTerm,
    RSPEC,
    active,
    classLabel,
    clearAll,
    compute,
    isTermKey,
    keyName,
    matcher,
    nMarks,
    nProteins,
    scoreText,
    setFilter,
    termValues,
    toggle,
    validKey,
    valueLabel,
    valueName,
    termTip,
  } = M;
  const sd = () => M.peek(),
    members = () => M.members();
  const AN = () => M.AN();
  // ---- the selection bar -----------------------------------------------------------------------------------------
  // the search's plain words are one chip; each of its terms a chip of its own, readable, removed alone
  const plainOf = (q) =>
    (String(q || '').match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || [])
      .filter((t) => !/^[a-z_][\w]*:.+$/i.test(t) || !isTermKey(t.split(':')[0]))
      .join(' ');
  // A filter is shown as its category (a muted word: the site's chip word for the card that holds the question) and its value, not as a
  // sentence; the source and the rule are in the chip's hover. The search's gene list is one chip too.
  const catOf = (k) => {
    const id = k.split(':')[1],
      card = (D.front?.cards || []).find((c) => (c.questions || []).includes(id));
    return card?.chip || keyName(k);
  };
  const valsOf = (k, v) => v.map((x) => valueName(k, x)).join(' or ');
  function tipOf(k, v) {
    const [kind, id] = k.split(':'),
      hook = K.filterKinds?.[kind]?.tip?.(id, v),
      src = A[id]?.title && A[id].title !== keyName(k) ? A[id].title : '';
    return [
      `${keyName(k)}: ${valsOf(k, v)}`,
      hook || (A[id]?.sub ? K.shortSub?.(A[id].sub) : ''),
      src && `Source: ${src}`,
    ]
      .filter(Boolean)
      .join('. ');
  }
  const chip = (cat, val, tip, btn, cls = '') =>
    `<span class="sel-chip${cls}" title="${esc(tip)}"><span class="sel-cat">${esc(cat)}</span> · <span ` +
    `class="sel-val">${esc(val)}</span>${btn}</span>`;
  // the search's plain words: a gene list is "Genes", other words "Search"; the first three, the rest on hover
  function plainChip() {
    const c = compute(),
      bad = new Set((c.unresolved || []).map((x) => x.toLowerCase())),
      words = plainOf(S.q)
        .split(' ')
        .filter((t) => t && !bad.has(t.toLowerCase()));
    if (!words.length) return null;
    const list = c.q.genes.length > 0 && !c.q.sites.length,
      shown = words.length > 4 ? words.slice(0, 3).join(', ') + ` +${words.length - 3}` : words.join(list ? ', ' : ' ');
    return {
      cat: list ? 'Genes' : 'Search',
      val: shown,
      tip: words.join(list ? ', ' : ' '),
      btn: `<button type="button" data-sel-clear-q aria-label="Remove the search">×</button>`,
    };
  }
  function chipsHtml() {
    const c = compute(),
      out = [],
      pc = plainChip();
    if (pc) out.push(chip(pc.cat, pc.val, pc.tip, pc.btn));
    c.cons
      .filter(([, , fromSearch]) => fromSearch)
      .forEach(([k, v, , raw]) =>
        out.push(
          chip(
            catOf(k),
            valsOf(k, v),
            tipOf(k, v),
            `<button type="button" data-sel-drop-term="${esc(raw)}" aria-label="Remove ${esc(raw)}">×</button>`
          )
        )
      );
    (c.unresolved || []).forEach((raw) => {
      if (/:/.test(raw))
        out.push(
          `<span class="sel-chip bad" title="Matches ` +
            `nothing: no ${esc(W.mark)} is selected while it stays">${esc(raw)}<button type="button" ` +
            `data-sel-drop-term="${esc(raw)}" aria-label="Remove ${esc(raw)}">×</button></span>`
        );
    });
    c.cons
      .filter(([, , fromSearch]) => !fromSearch)
      .forEach(([k, v]) =>
        out.push(
          chip(
            catOf(k),
            valsOf(k, v),
            tipOf(k, v),
            `<button type="button" data-sel-clear="${esc(k)}" aria-label="Remove ${esc(catOf(k))}">×</button>`
          )
        )
      );
    return out.join('');
  }
  // the selection in words for a figure's subtitle and for Copy link: "category · value; counts; what it is tested against"
  function summary() {
    if (!active() || !sd()) return '';
    const c = compute(),
      np = c.proteins.size,
      pc = plainChip(),
      parts = [...(pc ? [`${pc.cat} · ${pc.tip}`] : []), ...c.cons.map(([k, v]) => `${catOf(k)} · ${valsOf(k, v)}`)];
    return (
      `${parts.join('; ')}; ${int(c.marks.length)} of ${int(D.counts.marks)} ${W.marks} on ${int(np)} protein${np === 1 ? '' : 's'}` +
      (K.selEffect ? `; ${K.selEffect().replace(/^All tabs show only these · /, '')}` : '')
    );
  }
  function bar() {
    if (!active()) return null;
    const c = compute();
    if (!sd()) return `<span class="sel-flag">Selection</span><span>Loading the ${esc(W.marks)}…</span>`;
    const n = c.marks.length,
      np = c.proteins.size;
    // with the line under the search (kit-search.js), what the search could not read is said there
    const note = !!K.searchNote,
      miss = note ? [] : [...c.unresolved, ...c.q.unmatched],
      absent = note ? [] : c.q.absent || [],
      ignored = note ? [] : c.q.ignored || [],
      amb = note ? [] : c.q.ambiguous || [];
    return (
      `<span class="sel-flag">Selection</span><span><b>${int(n)}</b> of ${int(D.counts.marks)} ${esc(W.marks)} on <b>${int(np)}</b> protein${np === 1 ? '' : 's'}</span>${chipsHtml()}` +
      (miss.length
        ? `<span class="sel-miss" title="Terms are key:value, where the key is a question (${esc(
            D.analyses.map((a) => a.id).join(', ')
          )}) or an attribute (${esc(Object.keys(SPECS).join(', ') || 'none')})">Nothing matches ${miss
            .map((x) => `<b>${esc(x)}</b>`)
            .join(', ')}</span>`
        : '') +
      (absent.length
        ? `<span class="sel-miss" title="Not a gene, accession or entry name of a protein with a ${esc(W.mark)} on this site">No ${esc(W.marked)} protein: ${absent
            .map((x) => `<b>${esc(x)}</b>`)
            .join(', ')}</span>`
        : '') +
      (ignored.length
        ? `<span class="sel-miss" title="In a list of proteins, words are not searched in protein ` +
          `names: search them on their own to do that">Not a protein, left out of the list: ${ignored
            .map((x) => `<b>${esc(x)}</b>`)
            .join(', ')}</span>`
        : '') +
      (amb.length
        ? `<span class="sel-miss" title="Write the protein first, or alone, to list it">${amb
            .map(([t, g]) => `<b>${esc(t)}</b> read as ${esc(g)}’s site, ` + `not the protein ${esc(t)}`)
            .join('; ')}</span>`
        : '') +
      toolsHtml()
    );
  }
  // the bar's actions sit in a "⋯" menu at its right end; Clear all stays beside it as its own small button
  function toolsHtml() {
    const item = (html) => html.replace(/<(button|a)\b/g, '<$1 role="menuitem" tabindex="-1"');
    const items =
      (K.selTools || []).map((f) => item(f())).join('') +
      item(
        `<button class="btn small" type="button" data-sel-save title="Keep this selection in this browser; saved ones ` +
          `are listed under Saved here and under Filters">Save</button>` +
          `<button class="btn small" type="button" data-sel-copy>Copy link</button>`
      );
    return (
      (K.selEffect ? `<span class="sel-effect" title="${esc(K.selEffect())}">${esc(K.selEffect())}</span>` : '') +
      `<span class="sel-tools">${savedMenu()}<button class="btn small accent" type="button" data-sel-clear-all>Clear all` +
      `</button><span class="sel-menu"><button class="btn small" type="button" id="sel-menu-btn" data-sel-menu ` +
      `aria-haspopup="menu" aria-expanded="false" aria-controls="sel-menu-pop" aria-label="More actions for this ` +
      `selection" title="More actions">⋯</button><div class="sel-menu-pop" id="sel-menu-pop" role="menu" ` +
      `aria-labelledby="sel-menu-btn" hidden>${items}</div></span></span>`
    );
  }
  function menuEls() {
    const btn = document.querySelector('#scope [data-sel-menu]');
    return { btn, pop: btn && btn.parentElement.querySelector('.sel-menu-pop') };
  }
  function menuSet(open, focus) {
    const { btn, pop } = menuEls();
    if (!btn) return;
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && focus) pop.querySelector('[role="menuitem"]')?.focus();
    if (!open && focus) btn.focus();
  }
  document.addEventListener('click', (e) => {
    const { btn, pop } = menuEls();
    if (!btn || pop.hidden) return;
    if (e.target.closest('[data-sel-menu]')) return;
    // Copy link stays open so that its confirmation can be read; it closes with the text's reset
    if (pop.contains(e.target) && e.target.closest('[data-sel-copy]')) return;
    menuSet(false, false);
  });
  document.addEventListener('keydown', (e) => {
    const { btn, pop } = menuEls();
    if (!btn) return;
    const open = !pop.hidden,
      items = [...pop.querySelectorAll('[role="menuitem"]')];
    if (e.target === btn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      menuSet(true, true);
      if (e.key === 'ArrowUp') items[items.length - 1]?.focus();
    } else if (open && e.key === 'Escape') {
      e.preventDefault();
      menuSet(false, true);
    } else if (open && pop.contains(e.target)) {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const j =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[j]?.focus();
      } else if (e.key === 'Tab') menuSet(false, false);
    }
  });
  // saved selections, in this browser
  const savedList = () => {
    try {
      return JSON.parse(localStorage.getItem(`ptmc-saved-${D.site.id}`) || '[]');
    } catch (e) {
      return [];
    }
  };
  // "Saved (n) ▾" beside the selection line: the saved selections of this browser, each to open or to compare the current one with
  function savedMenu() {
    const list = savedList();
    if (!list.length) return '';
    return (
      `<details class="saved-dd"><summary class="btn small" title="Selections you saved in this browser">` +
      `Saved (${list.length}) ▾</summary><div class="saved-pop">${list
        .map(
          (x, i) =>
            `<div class="saved-row"><a ` +
            `href="${esc(x.hash)}" data-saved-open="${i}" title="Open ${esc(x.name)}">${esc(x.name)}</a> <span ` +
            `class="muted">${int(x.n)}</span>` +
            (`${
              K.views.compare
                ? `<button type="button" class="linkish small" data-saved-cmp="${i}" title="Compare the ${esc(W.marks)} of the current ` +
                  `selection with those of ${esc(x.name)}">Compare with this</button>`
                : ''
            }<button type="button" ` +
              `class="linkish small" data-saved-del="${i}" aria-label="Delete ${esc(x.name)}">×</button></div>`)
        )
        .join('')}</div></details>`
    );
  }
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.saved-dd[open]').forEach((d) => {
      if (!d.contains(e.target) || e.target.closest('[data-saved-cmp]')) d.open = false;
    });
  });
  function savedHtml() {
    const list = savedList();
    if (!list.length) return '';
    return `<div class="saved"><p class="flabel">Saved selections</p>${list
      .map(
        (x, i) =>
          `<div class="saved-row">` +
          `<a href="${esc(x.hash)}" data-saved-open="${i}">${esc(x.name)}</a> <span class="muted">${int(x.n)}</span>${
            K.views.compare
              ? `<button type="button" ` +
                `class="linkish small" data-saved-cmp="${i}" title="Compare ${esc(x.name)} with the current selection">` +
                `Compare</button>`
              : ''
          }<button type="button" class="linkish small" data-saved-del="${i}" aria-label="Delete ${esc(x.name)}">×</button></div>`
      )
      .join('')}</div>`;
  }
  function save() {
    const name = prompt('A name for this selection', describe().slice(0, 80));
    if (!name) return;
    const list = savedList().filter((x) => x.name !== name);
    list.unshift({
      name,
      hash: location.hash,
      n: nMarks(),
      ...(Object.keys(K.foldsForSave()).length ? { folds: K.foldsForSave() } : {}),
    });
    try {
      localStorage.setItem(`ptmc-saved-${D.site.id}`, JSON.stringify(list.slice(0, 40)));
    } catch (e) {
      /* storage blocked */
    }
    K.render();
  }

  // ---- the sidebar: Sections and Filters --------------------------------------------------------------------------
  const R = {
    tab: (() => {
      try {
        return localStorage.getItem('ptmc-rail-tab') || 'sections';
      } catch (e) {
        return 'sections';
      }
    })(),
    // pinning is automatic (pinned whenever the window is wide enough, following its resizes) unless unpinned by hand
    // 'auto' pins from 1,280 px; 'on' (pinned by hand) from 1,100 px; 'off' keeps it in a drawer
    pin: (() => {
      try {
        const v = localStorage.getItem('ptmc-rail');
        return ['on', 'off', 'auto'].includes(v) ? v : 'auto';
      } catch (e) {
        return 'auto';
      }
    })(),
    open: false,
    width: (() => {
      try {
        return +localStorage.getItem('ptmc-rail-w') || 0;
      } catch (e) {
        return 0;
      }
    })(),
  };
  const PIN_MIN = 1100,
    PIN_AUTO = 1280;
  const setRailWidth = () => {
    document.documentElement.style.setProperty(
      '--rail-w',
      R.width ? `${Math.min(Math.max(R.width, 224), Math.min(520, innerWidth * 0.4))}px` : ''
    );
  };
  setRailWidth();
  // the groups: from the site file, or one per section of residue questions, protein-set questions and attributes
  function groups() {
    if (D.filters && D.filters.length)
      return D.filters.map((g) => ({
        ...g,
        analyses: (g.analyses || []).filter((a) => A[a]),
        attributes: (g.attributes || []).filter((k) => SPECS[k]),
        proteins: (g.proteins || []).filter((k) => RSPEC(k)),
        keys: (g.keys || []).filter((k) => validKey(k)),
      }));
    const out = [],
      seen = {};
    D.analyses.forEach((a) => {
      const g =
        seen[a.section] || (seen[a.section] = out[out.push({ name: a.section || 'Questions', analyses: [] }) - 1]);
      g.analyses.push(a.id);
    });
    const attrs = Object.entries(SPECS)
      .filter(([, s]) => s.filter)
      .map(([k]) => k);
    if (attrs.length) out.push({ name: 'Marks', attributes: attrs });
    return out;
  }
  // a control's counts over a list of marks: per class or value (marks), per set (proteins)
  function tally(key, idx) {
    const [kind, id] = key.split(':'),
      out = {};
    if (kind === 'a' || kind === 't') {
      const col = kind === 'a' ? 2 : 3,
        at = kind === 'a' ? AN().indexOf(id) : M.AT().indexOf(id),
        names = kind === 'a' ? sd().classes[id] : sd().attributes[id];
      if (!names || at < 0) return out; // a question whose classes the marks do not carry (not selectable)
      const n = new Array(names.length).fill(0);
      (idx || sd().marks.map((_, i) => i)).forEach((i) =>
        sd().marks[i][col][at].forEach((c) => {
          n[c]++;
        })
      );
      names.forEach((v, c) => {
        out[v] = n[c];
      });
    } else if (kind === 'p') {
      const prots = idx ? new Set(idx.map((i) => sd().marks[i][0])) : null;
      const n = (mem) => {
        let k = 0;
        if (!prots) k = mem.size;
        else
          mem.forEach((p) => {
            if (prots.has(p)) k++;
          });
        return k;
      };
      Object.entries(members()[id] || {}).forEach(([s, mem]) => {
        out[s] = n(mem);
      });
      if (M.anyMembers()[id]) out['*'] = n(M.anyMembers()[id]); // in any of the source's sets
    }
    return out;
  }
  const totals = {};
  const cnt = (key, v) => (totals[key] ||= sd() ? tally(key, null) : {})[v] ?? null;
  // the counts a control shows under the current selection: the marks that pass every other constraint, so a
  // control's own values stay comparable while it is in use (faceted search); cached with the selection
  function facet(key) {
    const c = compute();
    if (!sd() || !c.active) return null;
    if (!c.facets) {
      const M = matcher(S.q, S.f),
        keys = M.cons.map(([k]) => k),
        all = [],
        except = {};
      sd().marks.forEach((m, i) => {
        if (!M.base(m)) return;
        let bad = null;
        for (let j = 0; j < M.tests.length; j++)
          if (!M.tests[j](m)) {
            if (bad == null) bad = keys[j];
            else if (bad !== keys[j]) return;
          }
        if (bad == null) all.push(i);
        else (except[bad] ||= []).push(i);
      });
      c.facets = { all, except, keys: new Set(keys), memo: {} };
    }
    const F = c.facets;
    return (F.memo[key] ||= tally(key, F.keys.has(key) ? [...F.all, ...(F.except[key] || [])] : F.all));
  }
  const NONE_RE = /^(no |not |none|unknown|unassigned)/i;
  function control(key) {
    const [kind, id] = key.split(':'),
      on = new Set([...(S.f[key] || []), ...termValues(key)]);
    // the values shown are fixed by the whole site (nothing moves as the selection changes); the counts follow it
    const fc = kind === 'n' || kind === 's' || kind === 'r' ? null : facet(key),
      shownN = (v) => (fc ? (fc[v] ?? 0) : cnt(key, v));
    const chip = (v, lab) => {
      const n = shownN(v),
        t = cnt(key, v);
      return `<button type="button" class="fchip${fc && !n && !on.has(v) ? ' zero' : ''}" data-f="${esc(key)}" data-v="${esc(v)}" aria-pressed="${on.has(v)}"${
        fc ? ` title="${int(n)} in the selection, ${int(t)} in all"` : ''
      }>${esc(lab)}${n != null ? ` <span class="muted">${int(n)}</span>` : ''}</button>`;
    };
    if (kind === 'a') {
      const codes = (sd()?.classes[id] || Object.keys(A[id]?.labels || {})).filter(
        (c) => !NONE_RE.test(classLabel(id, c)) && cnt(key, c) !== 0
      );
      return `<div class="fctl"><p class="flabel">${esc(A[id].title)}</p><div class="fchips">${codes
        .map((c) => chip(c, classLabel(id, c)))
        .join('')}</div></div>`;
    }
    if (kind === 'p') {
      const lab = (x) => (A[id].labels || {})[x] || x;
      const names = Object.keys(members()[id] || {})
        .filter((x) => cnt(key, x))
        .sort((x, y) => NONE_RE.test(lab(x)) - NONE_RE.test(lab(y)) || (cnt(key, y) || 0) - (cnt(key, x) || 0));
      const any = A[id].filter?.any
        ? `<option value="*"${on.has('*') ? ' selected' : ''}>${esc(A[id].filter.any)} (${int(shownN('*'))})</option>`
        : '';
      return (
        `<div class="fctl"><p class="flabel">${
          A[id].filter?.label
            ? esc(A[id].filter.label)
            : `${esc(A[id].title)} <span class="muted">(${
                fc ? 'proteins of the selection' : `${esc(W.marked)} proteins`
              })</span>`
        }</p><select ` +
        `data-fsel="${esc(key)}"><option value="">Any</option>${any}` +
        names
          .map(
            (s) =>
              `<option value="${esc(s)}"${on.has(s) ? ' selected' : ''}${
                fc && !shownN(s) && !on.has(s) ? ' class="zero"' : ''
              }>${esc(lab(s))} (${int(shownN(s))})</option>`
          )
          .join('') +
        '</select></div>'
      );
    }
    if (kind === 's') {
      const sc = A[id].scores,
        cur = S.f[key]?.[0] || '';
      return (
        `<div class="fctl"><p class="flabel" title="${esc(sc.help || '')}">${esc(sc.label || 'Score')}</p><select ` +
        `data-fsel="${esc(key)}"><option value="">Any</option>` +
        (sc.levels || [])
          .map((v) => `<option value="${v}"${String(v) === cur ? ' selected' : ''}>${esc(scoreText(id, v))}</option>`)
          .join('') +
        '</select></div>'
      );
    }
    const spec = SPECS[id] || {};
    if (K.filterKinds?.[kind]?.control)
      return K.filterKinds[kind].control(id, { on, shownN, cnt: (v) => cnt(key, v), facet: fc });
    if (kind === 'r' && RSPEC(id)?.control === 'chips' && RSPEC(id).kind !== 'number') {
      // a protein attribute's values as chips (match any)
      const sp = RSPEC(id),
        vals = [
          ...new Set(
            (D.protein_attributes?.values?.[id] || [])
              .flatMap((x) => String(x || '').split(sp.separator || '; '))
              .filter(Boolean)
          ),
        ];
      const order = Object.keys(sp.values || {}),
        sorted = vals
          .filter((v) => !NONE_RE.test((sp.values || {})[v] || v))
          .sort((x, y) => (order.includes(x) ? order.indexOf(x) : 99) - (order.includes(y) ? order.indexOf(y) : 99));
      return (
        `<div class="fctl"><p class="flabel" title="${esc(sp.help || '')}">${esc(sp.label || id)} <span class="muted">` +
        `(proteins; match any)</span></p><div class="fchips">` +
        sorted
          .map(
            (v) =>
              `<button type="button" class="fchip" data-f="${esc(key)}" data-v="${esc(v)}" aria-pressed="${on.has(v)}">${esc((sp.values || {})[v] || v)}</button>`
          )
          .join('') +
        '</div></div>'
      );
    }
    if (kind === 'r') {
      // a protein-level filter: a threshold, or a protein attribute's values
      const sp = RSPEC(id) || {},
        cur = S.f[key]?.[0] || '';
      const opts =
        sp.kind === 'number'
          ? (sp.levels || []).map((v) => [String(v), `${sp.direction === 'max' ? '≤' : 'at least'} ${v}`])
          : [
              ...new Set(
                (D.protein_attributes?.values?.[id] || [])
                  .flatMap((x) => String(x || '').split(sp.separator || '; '))
                  .filter(Boolean)
              ),
            ]
              .sort()
              .map((v) => [v, (sp.values || {})[v] || v]);
      return (
        `<div class="fctl"><p class="flabel" title="${esc(sp.help || '')}">${esc(sp.label || id)} <span class="muted">` +
        `(proteins)</span></p><select data-fsel="${esc(key)}"><option value="">Any</option>` +
        opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('') +
        '</select></div>'
      );
    }
    if (spec.kind === 'number') {
      const top = sd() ? Math.max(...sd().numbers[id]) : 5,
        cur = S.f['n:' + id]?.[0] || '';
      return (
        `<div class="fctl"><p class="flabel">${esc(spec.label)}</p><select data-fsel="n:${esc(id)}"><option ` +
        `value="">Any</option>` +
        [2, 3, 4, 5, 10]
          .filter((v) => v <= top)
          .map((v) => `<option value="${v}"${String(v) === cur ? ' selected' : ''}>${v} or more</option>`)
          .join('') +
        '</select></div>'
      );
    }
    const vals = (sd() ? sd().attributes[id] : Object.keys(spec.values || {})).filter((v) => cnt('t:' + id, v) !== 0);
    const order = spec.values ? Object.keys(spec.values) : [];
    const sorted = [...vals].sort(
      (x, y) =>
        (order.includes(x) ? order.indexOf(x) : 999) - (order.includes(y) ? order.indexOf(y) : 999) ||
        (cnt('t:' + id, y) || 0) - (cnt('t:' + id, x) || 0)
    );
    if (spec.control === 'select')
      // many values: a drop-down list, one value at a time
      return (
        `<div class="fctl"><p class="flabel" title="${esc(spec.help || '')}">${esc(spec.label)}</p><select ` +
        `data-fsel="t:${esc(id)}"><option value="">Any</option>` +
        sorted
          .map(
            (v) =>
              `<option value="${esc(v)}"${on.has(v) ? ' selected' : ''}${
                fc && !shownN(v) && !on.has(v) ? ' class="zero"' : ''
              }>${esc(valueLabel(id, v))} (${int(shownN(v))})</option>`
          )
          .join('') +
        '</select></div>'
      );
    return (
      `<div class="fctl"><p class="flabel" title="${esc(spec.help || '')}">${esc(spec.label)}${
        spec.kind === 'list' ? ' <span class="muted">(match any)</span>' : ''
      }</p><div ` +
      `class="fchips">` +
      sorted.map((v) => chip(v, valueLabel(id, v))).join('') +
      '</div></div>'
    );
  }
  function keysOf(g) {
    return [
      ...(g.analyses || []).flatMap((aid) =>
        A[aid]?.kind === 'protein_sets' ? ['p:' + aid, ...(A[aid].scores ? ['s:' + aid] : [])] : ['a:' + aid]
      ),
      ...(g.attributes || []).map((k) => (SPECS[k]?.kind === 'number' ? 'n:' : 't:') + k),
      ...(g.proteins || []).filter((k) => RSPEC(k)).map((k) => 'r:' + k),
      ...(g.keys || []).filter((k) => validKey(k)),
    ].filter((k) => !k.startsWith('a:') || !sd() || sd().classes[k.slice(2)]); // not a question whose classes the marks do not carry
  }
  function filtersTab() {
    M.need();
    const gs = groups();
    return (
      `<div class="rail-sel">${
        bar() ||
        `<span>All <b>${int(D.counts.marks)}</b> ${esc(W.marks)} on <b>${int(D.counts.proteins)}</b> proteins</span>`
      }</div>${savedHtml()}` +
      gs
        .map((g, gi) => {
          const keys = keysOf(g),
            n = keys.filter((k) => S.f[k]?.length || termValues(k).length).length;
          return (
            `<details class="fgroup${n ? ' active' : ''}" data-g="${gi}"${R.openGroups?.has(gi) ? ' open' : ''}><summary><span>${esc(g.name)}</span><span ` +
            `class="gcount muted" title="${keys.length} filter${keys.length === 1 ? '' : 's'} in this group${n ? `, ${n} in use` : ''}">${n ? `${n} of ` : ''}${keys.length}</span>${
              n
                ? `<span class="badge">${n}</span><button ` +
                  `type="button" class="linkish small" data-fgroup-clear="${gi}">Clear</button>`
                : ''
            }</summary>` +
            keys.map(control).join('') +
            '</details>'
          );
        })
        .join('') +
      (K.hl?.section?.() || '') +
      `<div class="rail-foot"><span><b>${int(nMarks())}</b> ${esc(nMarks() === 1 ? W.mark : W.marks)} on <b>${int(nProteins())}</b> protein${nProteins() === 1 ? '' : 's'}${active() ? '' : ' (all)'}</span>${
        active() ? '<button class="linkish" type="button" data-sel-clear-all>Clear all</button>' : ''
      }</div>`
    );
  }
  // every page, as the tab bar lists them, with the current page's own sections under it, in their groups (as the
  // original explorer's sidebar): [id, label, level, href?] from K.sections; level 0 is a group heading; a section with
  // an href is a link (another view), one without is a jump to the element with that id
  // which group and family disclosures the reader opened or closed (session state, not the address)
  const TOC_KEY = 'ptmc-toc-open';
  let tocOpen = {};
  try {
    tocOpen = JSON.parse(sessionStorage.getItem(TOC_KEY) || '{}') || {};
  } catch (e) {
    tocOpen = {};
  }
  function sectionsTab() {
    const raw = (K.sections?.[S.view]?.() || []).filter((x) => x[0] !== 'view');
    // a link to another view, or to the same view with a different question (?a=), is current only when both match
    const aOf = (h) => (h.match(/[?&]a=([^&]*)/) || [])[1] || '',
      cur = K.link(S.view, S.arg),
      here = (h) => cur.split('?')[0] === h.split('?')[0] && (S.view !== 'statistics' || (S.a || '') === aOf(h));
    // a section with nothing listed under it (not drawn yet, or one question of its own name) is a heading-styled jump
    const lone = ([id, lab]) =>
      `<a href="${esc(location.hash)}" data-jump="${esc(id)}" data-spy="${esc(id)}" class="toc-group toc-lone"><span class="car" aria-hidden="true"></span>${esc(lab)}</a>`;
    const leaf = ([id, lab, lev, href]) =>
      lev === 0 && !href
        ? lone([id, lab])
        : href
          ? `<a href="${esc(href)}" class="sub l1${here(href) ? ' on' : ''}"${here(href) ? ' aria-current="page"' : ''}>${esc(lab)}</a>`
          : `<a href="${esc(location.hash)}" data-jump="${esc(id)}" data-spy="${esc(id)}" class="sub l1">${esc(lab)}</a>`;
    // a group heading (a level-0 entry with entries under it) is a disclosure; entries sharing a family (an analysis'
    // `family` in the site file) are one entry with a disclosure of its own. Open: the reader's choice this session,
    // else only when it holds the current page
    let nTgl = 0;
    const disclosure = (key, label, kids, cls, has) => {
      const id = `toc-k${nTgl++}`,
        open = key in tocOpen ? tocOpen[key] : has;
      return (
        `<button type="button" class="${cls} tgl" data-toc-tgl="${esc(key)}" aria-expanded="${open}" aria-controls="${id}">` +
        `<span class="car" aria-hidden="true"></span>${esc(label)}</button>` +
        `<div class="toc-kids" id="${id}"${open ? '' : ' hidden'}>${kids}</div>`
      );
    };
    const isCur = (x) => !!x[3] && here(x[3]);
    const entries = [];
    raw.forEach((x, i) => {
      const head = x[2] === 0 && !x[3] && raw[i + 1] && raw[i + 1][2] !== 0;
      if (head) entries.push({ head: x, kids: [] });
      else if (x[2] !== 0 && entries.length && entries[entries.length - 1].head)
        entries[entries.length - 1].kids.push(x);
      else entries.push({ leaf: x });
    });
    const famCount = (kids, f) => kids.filter((k) => k[4] === f).length;
    const group = (g) => {
      if (g.kids.length === 1 && g.kids[0][1] === g.head[1] && !g.kids[0][3]) return lone(g.kids[0]);
      const done = new Set();
      const kids = g.kids
        .map((k) => {
          const f = k[4];
          if (!f || famCount(g.kids, f) < 2) return leaf(k);
          if (done.has(f)) return '';
          done.add(f);
          const vs = g.kids.filter((y) => y[4] === f);
          return disclosure(`${S.view}|f|${g.head[1]}|${f}`, f, vs.map(leaf).join(''), 'sub l1 fam', vs.some(isCur));
        })
        .join('');
      return `<div class="toc-grp">${disclosure(`${S.view}|g|${g.head[1]}`, g.head[1], kids, 'toc-group', g.kids.some(isCur))}</div>`;
    };
    const item = (e) => (e.head ? group(e) : leaf(e.leaf));
    const pages = [...document.querySelectorAll('#tabs a.tab')].map((a) => ({
      href: a.getAttribute('href'),
      name: a.cloneNode(true),
      cur: a.getAttribute('aria-current') === 'page',
    }));
    pages.forEach((pg) => pg.name.querySelectorAll('.count, .selmark, svg').forEach((x) => x.remove()));
    if (!pages.length) return '<nav class="toc flat">' + entries.map(item).join('') + '</nav>';
    return (
      '<nav class="toc flat">' +
      pages
        .map(
          (pg) =>
            `<a class="toc-p${pg.cur ? ' on' : ''}" href="${esc(pg.href)}"${pg.cur ? ' aria-current="page"' : ''}>${esc(pg.name.textContent.trim())}</a>` +
            (pg.cur && raw.length ? `<div class="toc-secs">${entries.map(item).join('')}</div>` : '')
        )
        .join('') +
      '</nav>'
    );
  }
  const pinned = () => (R.pin === 'on' && innerWidth >= PIN_MIN) || (R.pin === 'auto' && innerWidth >= PIN_AUTO);
  // scroll-spy: the section in view is marked in the list
  let spyTick = false,
    jumpId = null;
  function watchSections() {
    const links = [...document.querySelectorAll('#rail [data-spy]')];
    if (!links.length) return;
    const bar =
      Math.max(
        document.querySelector('.toolbar')?.getBoundingClientRect().bottom || 0,
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-h')) || 0
      ) + 24; // the same offset the jump targets keep (scroll-margin-top)
    let cur = null,
      best = -Infinity;
    // the sections whose top is above the line; of those the lowest one, and the first of several side by side
    links.forEach((a) => {
      const t = document.getElementById(a.dataset.spy),
        y = t ? t.getBoundingClientRect().top : Infinity;
      if (y <= bar && y > best) {
        cur = a;
        best = y;
      }
    });
    // a section jumped to stays marked while it is the one at the top of the screen (the end of the page cannot scroll it higher)
    if (jumpId) {
      const t = document.getElementById(jumpId),
        y = t ? t.getBoundingClientRect().top : -1;
      if (y >= bar - 24 - 8 && y < innerHeight) cur = links.find((a) => a.dataset.spy === jumpId) || cur;
    }
    document.querySelectorAll('#rail .tgl.has-on').forEach((b) => b.classList.remove('has-on'));
    links.forEach((a) => {
      const on = a === (cur || links[0]);
      if (on)
        for (let k = a.closest('.toc-kids'); k; k = k.parentElement?.closest('.toc-kids'))
          k.previousElementSibling?.classList.add('has-on');
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  }
  for (const ev of ['wheel', 'touchmove', 'keydown'])
    addEventListener(
      ev,
      () => {
        jumpId = null;
      },
      { passive: true }
    );
  addEventListener(
    'scroll',
    () => {
      if (spyTick) return;
      spyTick = true;
      requestAnimationFrame(() => {
        spyTick = false;
        watchSections();
      });
    },
    { passive: true }
  );
  function rail() {
    const el = document.getElementById('rail');
    if (!el) return;
    const ae = document.activeElement,
      keep =
        ae && el.contains(ae)
          ? ae.dataset.f
            ? `[data-f="${CSS.escape(ae.dataset.f)}"][data-v="${CSS.escape(ae.dataset.v)}"]`
            : ae.dataset.fsel
              ? `[data-fsel="${CSS.escape(ae.dataset.fsel)}"]`
              : ae.dataset.railTab
                ? `[data-rail-tab="${ae.dataset.railTab}"]`
                : null
          : null;
    // the control in use stays where it was on the screen while the sidebar is drawn again
    const top0 = keep ? el.querySelector(keep)?.getBoundingClientRect().top : null;
    const wasOpen = document.body.classList.contains('rail-open'),
      open = !pinned() && R.open;
    document.body.classList.toggle('rail-pinned', pinned());
    // the floating button on narrow screens: the sidebar's way in once the toolbar has scrolled away
    let fab = document.querySelector('.rail-fab');
    if (!fab) {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<button class="rail-fab" type="button" data-rail-open="filters"></button>'
      );
      fab = document.querySelector('.rail-fab');
    }
    // it steps aside while the page is read (scrolled down), so it never rests on a figure or a number, and comes back when the page is scrolled up or is at its top
    // the Filters button is the toolbar's own while the toolbar is in view (at the top), and shows only on the way up; it goes
    // when the page rests, so it never covers a tile's values
    if (!fab.dataset.sc) {
      fab.dataset.sc = '1';
      let y0 = scrollY,
        idle;
      const away = () => document.body.classList.add('fab-away');
      away();
      addEventListener(
        'scroll',
        () => {
          const y = scrollY;
          clearTimeout(idle);
          if (y < 160) away();
          else if (y < y0 - 8) {
            document.body.classList.remove('fab-away');
            idle = setTimeout(away, 1800);
          } else if (y > y0 + 8) away();
          y0 = y;
        },
        { passive: true }
      );
    }
    const nf = K.sel.nFilters();
    fab.innerHTML = `⏚ Filters${nf ? ` <span class="badge">${nf}</span>` : ''}`;
    fab.setAttribute('aria-label', `Filters${nf ? `, ${nf} in use` : ''}`);
    document.body.classList.toggle('rail-open', open);
    if (open) {
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
    } else {
      el.removeAttribute('role');
      el.removeAttribute('aria-modal');
    }
    ['#view', '.toolbar', '.hero', 'footer.site'].forEach((sel) => {
      const x = document.querySelector(sel);
      if (x) x.inert = open;
    });
    el.innerHTML =
      `<div class="rail-head"><span class="seg" role="group"><button type="button" ` +
      `data-rail-tab="sections" aria-pressed="${R.tab === 'sections'}">☰ Sections</button>` +
      `<button type="button" data-rail-tab="filters" aria-pressed="${R.tab === 'filters'}">⏚ Filters${
        Object.keys(S.f).length ? ` <span class="badge">${Object.keys(S.f).length}</span>` : ''
      }</button></span>` +
      (innerWidth >= PIN_MIN
        ? `<button type="button" class="btn small" data-rail-pin title="${
            pinned() ? 'Show the sidebar only when asked (☰)' : 'Keep the sidebar beside the page'
          }">${pinned() ? 'Unpin' : 'Pin'}</button>`
        : '') +
      `${
        pinned() ? '' : '<button type="button" class="btn small" data-rail-close aria-label="Close">×</button>'
      }</div>` +
      `<div class="rail-body">${R.tab === 'sections' ? sectionsTab() : filtersTab()}</div>` +
      (pinned()
        ? `<div class="rail-grip" role="separator" aria-orientation="vertical" aria-label="Sidebar width: ` +
          `drag, or use the arrow keys; double-click resets it" aria-valuenow="${Math.round(
            R.width || el.getBoundingClientRect().width
          )}" aria-valuemin="0" ` +
          `aria-valuemax="${innerWidth}" tabindex="0" data-rail-grip></div>`
        : '');
    if (R.tab === 'sections') requestAnimationFrame(watchSections);
    const kept = (open || pinned()) && keep && el.querySelector(keep); // a sidebar being closed gives its focus back to the control that opened it, below
    if (kept) {
      kept.focus({ preventScroll: true });
      if (top0 != null) {
        const dy = kept.getBoundingClientRect().top - top0,
          sc = [el, el.querySelector('.rail-body')].find(
            (x) => x && x.scrollHeight > x.clientHeight && /auto|scroll/.test(getComputedStyle(x).overflowY)
          );
        if (sc) sc.scrollTop += dy;
        else scrollBy(0, dy);
      }
    } else if (open && !wasOpen)
      (el.querySelector('[data-rail-tab][aria-pressed="true"]') || el.querySelector('#rail-title'))?.focus();
    else if (!open && wasOpen)
      (R.opener && document.contains(R.opener)
        ? R.opener
        : document.querySelector('.fr-filter') || document.querySelector('[data-rail-open="filters"]')
      )?.focus({ preventScroll: true });
  }
  addEventListener('resize', () => {
    setRailWidth();
    if (document.body.classList.contains('rail-pinned') !== pinned()) rail();
  });
  // the width grip: drag (or arrow keys) to resize the pinned sidebar; double-click for the automatic width
  const saveWidth = () => {
    try {
      if (R.width) localStorage.setItem('ptmc-rail-w', String(Math.round(R.width)));
      else localStorage.removeItem('ptmc-rail-w');
    } catch (e) {
      /* storage may be blocked */
    }
  };
  document.addEventListener('pointerdown', (e) => {
    const g = e.target.closest?.('[data-rail-grip]');
    if (!g) return;
    e.preventDefault();
    const rail0 = document.getElementById('rail').getBoundingClientRect();
    g.setPointerCapture(e.pointerId);
    const move = (ev) => {
      R.width = ev.clientX - rail0.left;
      setRailWidth();
    };
    const up = () => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      saveWidth();
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
  });
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest?.('[data-rail-grip]')) {
      R.width = 0;
      setRailWidth();
      saveWidth();
    }
  });
  // Tab from the sidebar's last stop continues in the part of the page on the screen, not at the top of it (the browser would scroll up to the first control)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey || !e.target.closest?.('[data-rail-grip]')) return;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-h')) || 0;
    const seen = [
      ...document.querySelectorAll(
        '#view a[href], #view button:not([disabled]), #view ' +
          'input:not([type=hidden]):not([disabled]), #view select, #view summary, #view ' +
          '[tabindex]:not([tabindex="-1"])'
      ),
    ].filter((x) => {
      const r = x.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= top && r.bottom <= innerHeight && !x.closest('[hidden], [inert]');
    });
    for (const x of seen) {
      x.focus({ preventScroll: true });
      if (document.activeElement === x) {
        e.preventDefault();
        return;
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!e.target.closest?.('[data-rail-grip]') || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    R.width =
      (R.width || document.getElementById('rail').getBoundingClientRect().width) + (e.key === 'ArrowRight' ? 16 : -16);
    setRailWidth();
    saveWidth();
  });

  // ---- events ------------------------------------------------------------------------------------------------------
  K.clicks.push(
    // a class picked on a question's page selects it and returns to the Overview, where every question is tested again
    // a row of a tile or of a question's chart selects its class: the page goes to its top, where the selection is said, and Back
    // brings the page and its scroll position as they were (the position is kept before the address changes)
    [
      '[data-f]',
      (el) => {
        const row = el.closest('.fr-row, .drow'),
          back = el.closest('.drow') && S.view === 'overview' && S.arg;
        if (row) K.rememberScroll?.();
        if (back) S.arg = '';
        toggle(el.dataset.f, el.dataset.v);
        if (row || back) scrollTo(0, 0); // at once, never animated: the page is redrawn under it, which would stop a smooth scroll short (and reduced motion asks for none)
      },
    ],
    ['[data-sel-clear]', (el) => setFilter(el.dataset.selClear, [])],
    [
      '[data-sel-clear-q]',
      () => {
        S.q = (String(S.q).match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || [])
          .filter((t) => /^[a-z_][\w]*:.+$/i.test(t) && isTermKey(t.split(':')[0]))
          .join(' ');
        K.writeHash(true);
        K.render();
      },
    ],
    [
      '[data-sel-drop-term]',
      (el) => {
        dropTerm(el.dataset.selDropTerm);
        K.writeHash(true);
        K.render();
      },
    ],
    ['[data-sel-clear-all]', () => clearAll()],
    [
      '[data-sel-copy]',
      (el) => {
        navigator.clipboard?.writeText(`${location.href}\n${summary()}`).then(() => {
          el.textContent = 'Link and description copied';
          setTimeout(() => {
            el.textContent = 'Copy link';
            menuSet(false, false);
          }, 1600);
        });
      },
    ],
    ['[data-sel-menu]', () => menuSet(menuEls().pop.hidden, false)],
    ['[data-sel-save]', () => save()],
    [
      '[data-fgroup-clear]',
      (el, e) => {
        e.preventDefault();
        keysOf(groups()[+el.dataset.fgroupClear]).forEach((k) => delete S.f[k]);
        K.writeHash(true);
        K.render();
      },
    ],
    [
      '[data-rail-tab]',
      (el) => {
        R.tab = el.dataset.railTab;
        try {
          localStorage.setItem('ptmc-rail-tab', R.tab);
        } catch (e) {
          /* */
        }
        rail();
      },
    ],
    [
      '[data-saved-open]',
      (el) => {
        const x = savedList()[+el.dataset.savedOpen];
        K.restoreFolds(x?.folds);
        if (x && x.hash === location.hash) K.render();
      },
    ],
    [
      '[data-saved-del]',
      (el) => {
        const list = savedList();
        list.splice(+el.dataset.savedDel, 1);
        try {
          localStorage.setItem(`ptmc-saved-${D.site.id}`, JSON.stringify(list));
        } catch (e) {
          /* */
        }
        rail();
      },
    ],
    [
      '[data-rail-pin]',
      () => {
        if (pinned()) R.opener = document.querySelector('.rail-btn');
        R.pin = pinned() ? 'off' : innerWidth >= PIN_AUTO ? 'auto' : 'on';
        R.open = false;
        try {
          localStorage.setItem('ptmc-rail', R.pin);
        } catch (e) {
          /* */
        }
        rail();
        if (!pinned()) {
          R.open = true;
          rail();
        }
      },
    ],
    [
      '[data-rail-close]',
      () => {
        R.open = false;
        rail();
      },
    ],
    [
      '[data-hl-goto]',
      (el) => {
        R.opener = el;
        R.tab = 'filters';
        if (!pinned()) R.open = true;
        rail();
        // the page redraws once more after this click: the box is focused when it has settled
        setTimeout(() => {
          const sec = document.getElementById('hl-sec');
          sec?.scrollIntoView({ block: 'nearest' });
          sec?.querySelector('input')?.focus();
        }, 60);
      },
    ],
    [
      '[data-rail-open]',
      (el) => {
        R.opener = el;
        if (pinned()) {
          R.tab = el.dataset.railOpen || R.tab;
          rail();
          document.querySelector('#rail [data-rail-tab]')?.focus();
          return;
        }
        R.open = true;
        R.tab = el.dataset.railOpen || R.tab;
        rail();
      },
    ],
    [
      '[data-toc-tgl]',
      (el) => {
        const open = el.getAttribute('aria-expanded') !== 'true';
        el.setAttribute('aria-expanded', String(open));
        const kids = document.getElementById(el.getAttribute('aria-controls'));
        if (kids) kids.hidden = !open;
        tocOpen[el.dataset.tocTgl] = open;
        try {
          sessionStorage.setItem(TOC_KEY, JSON.stringify(tocOpen));
        } catch (err) {
          /* no session storage: the choice lasts until the page is reloaded */
        }
      },
    ],
    [
      '[data-jump]',
      (el, e) => {
        e.preventDefault();
        const t = document.getElementById(el.dataset.jump);
        if (t) {
          if (R.open && !pinned()) {
            R.open = false;
            rail();
          }
          for (let d = t; d; d = d.parentElement?.closest('details')) if (d.tagName === 'DETAILS') d.open = true;
          jumpId = el.dataset.jump;
          t.scrollIntoView({ behavior: K.smooth?.() || 'smooth', block: 'start' });
          setTimeout(watchSections, 700);
        }
      },
    ]
  );
  document.addEventListener('change', (e) => {
    const k = e.target.dataset?.fsel;
    if (k != null) setFilter(k, e.target.value ? [e.target.value] : []);
  });
  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (d.classList?.contains('fgroup')) {
        (R.openGroups ||= new Set())[d.open ? 'add' : 'delete'](+d.dataset.g);
      }
    },
    true
  );
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && R.open) {
      R.open = false;
      rail();
    }
  });
  ['pointerover', 'focusin'].forEach((ev0) =>
    document.addEventListener(
      ev0,
      (e) => {
        const c = e.target.closest?.('[data-try], .sel-chip');
        if (!c || !sd() || c.dataset.tipDone) return;
        const t = termTip(c.dataset.try || c.getAttribute('title') || '');
        c.dataset.tipDone = '1';
        if (t) c.title = t;
      },
      true
    )
  );
  Object.assign(M, { bar, savedList, summary });
  Object.assign(K, { watchSections, rail });
});
