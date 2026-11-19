/* The search box's help: suggestions while typing, and the line under the search that says what it read.

   Suggestions (up to 10, arrow keys, Enter, Escape, or a click): proteins by gene, accession, entry name or another
   name (each with its other name, its protein name and its count of marks), the proteins of the snapshot that have
   no mark (their light page), the search's keys while their first letters are typed, a key's values once its colon
   is (classes, sets, values, the words of website.search.terms, a module's own), and for words that name no protein,
   the filters whose names hold them ("stress granule" -> a condensate). A protein or a value applies at once; a key
   waits for its value.

   The line under the search: "3 proteins from 3 of 4 search words. Not in this dataset: XYZ123."; the names matched by
   another name (TDP-43 -> TARDBP); a site with no mark ("No <mark> reported at EWSR1 R216"); positions read in a
   protein's own numbering (website.protein.numbering); "did you mean" for a word one letter from a gene, or for words
   that name a filter; and what a term could not read, in red. Everything comes from the selection module's reading of
   the search (kit-select.js: parse, constraints) and the site file; no word of a mark or a site is the kit's own.
   A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, S, esc, int } = K;
  const input = document.getElementById('q'),
    field = input?.closest('.search-field');
  if (!input || !field || !K.sel) return;
  const SPECS = D.attribute_specs || {},
    PSPEC = D.protein_attributes?.specs || {},
    SRCH = D.search || {},
    SITE_PH = D.site.placeholders || {},
    PHM = (SITE_PH.motif || '').split(/\s*,\s*/).filter(Boolean),
    NEAR_EX = SRCH.patterns?.near_examples || [], // suggestions for the near pattern, from the site file
    EXGENE = ((D.site.examples || []).find((e) => /\s[A-Z]?\d+$/.test(e)) || 'GENE 123').split(/\s+/)[0];
  K.searchNote = true; // the selection bar leaves what the search could not read to the line

  // ---- the elements: a list under the box, and a line under the toolbar's search -----------------------------------
  field.insertAdjacentHTML(
    'beforeend',
    '<div class="q-list" id="q-list" role="listbox" aria-label="Suggestions" hidden></div>'
  );
  field.insertAdjacentHTML('afterend', '<p class="q-note" id="q-note" aria-live="polite" hidden></p>');
  const list = document.getElementById('q-list'),
    note = document.getElementById('q-note');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'q-list');
  input.setAttribute('aria-expanded', 'false');

  // ---- what can be suggested --------------------------------------------------------------------------------------
  const P = (D.proteins || []).map(([acc, gene, name, len, marks, cand, entry], i) => ({
    i,
    acc,
    gene: String(gene || '').split(/[\s;]+/)[0],
    name: name || '',
    marks,
    entry: entry || '',
  }));
  const norm = (x) =>
    String(x || '')
      .toUpperCase()
      .replace(/[-\s._/]/g, '');
  const low = (x) => String(x || '').toLowerCase();
  // the search keys: questions, attributes of the marks and proteins, the site's own words, older keys, the modules'
  function keys() {
    const out = [];
    // flag: a yes/no attribute, written as its query word alone (als), never as key:true
    const add = (key, label, help, flag) => {
      if (key && !out.some((x) => x.key === key)) out.push({ key, label, help, flag });
    };
    // a flag carries its filter, so the row can show its label and apply it without the key
    const attr = (k, s, help, kind) =>
      s.flag ? add(s.query || k, s.label || k, help, [kind + k, [String(s.flag)]]) : add(k, s.label || k, help);
    Object.entries(SRCH.terms || {}).forEach(([k, t]) => add(k, t.label || k, t.help || ''));
    if (SRCH.patterns?.at)
      add(
        SRCH.patterns.at,
        `motif at the ${W.mark}`,
        `a motif family, or a pattern covering ` +
          `the ${W.mark}${PHM.length ? ` such as ${PHM.slice(0, 2).join(' or ')}` : ''}`
      );
    if (SRCH.patterns?.near)
      add(
        SRCH.patterns.near,
        `motif within ±${SRCH.patterns.span || 15}`,
        `a pattern ` +
          `anywhere within ${SRCH.patterns.span || 15} residues of the ${W.mark}${
            NEAR_EX.length ? `, such as ${NEAR_EX[0].pattern}` : ''
          }`
      );
    Object.entries(K.searchTermHelp || {}).forEach(([k, h]) => add(k, h.label || k, h.help || ''));
    Object.entries(D.search_aliases || {}).forEach(([k, to]) =>
      add(k, A[to]?.title || SPECS[to]?.label || to, `the same as ${to}:`)
    );
    D.analyses.forEach((a) => add(a.id, a.title, a.question || ''));
    Object.entries(SPECS)
      .filter(([, s]) => s.filter)
      .forEach(([k, s]) => attr(k, s, s.help || '', 't:'));
    Object.entries(PSPEC).forEach(([k, s]) => attr(k, s, `${s.help || ''} (proteins)`.trim(), 'r:'));
    return out;
  }
  // a key's values: [value as typed in a term, its label, a count when known]
  function valuesOf(key0) {
    const sd = K.sel.data(),
      key = (D.search_aliases || {})[key0] || key0,
      out = [];
    const T = (SRCH.terms || {})[key0];
    if (T) Object.keys(T.values).forEach((v) => out.push([v, T.help ? '' : v]));
    if (SRCH.patterns?.near === key0) NEAR_EX.forEach((x) => out.push([x.pattern, x.label || '']));
    if (K.searchTermValues?.[key0]) out.push(...K.searchTermValues[key0]());
    if (A[key]?.kind === 'residue' && sd)
      (sd.classes[key] || []).forEach((c) =>
        out.push([c, `${A[key].labels?.[c] || c}${A[key].help?.[c] ? ' · ' + A[key].help[c] : ''}`])
      );
    if (SRCH.patterns?.at === key0)
      PHM.slice(0, 2)
        .map((m) => [m, 'a pattern of residues'])
        .forEach((x) => out.push(x));
    if (A[key]?.kind === 'protein_sets' && sd?.protein_sets?.[key]) {
      const names = [
        ...sd.protein_sets[key].sets.map(([s, , m]) => [s, m.length]),
        ...(sd.protein_sets[key].more || []).map(([s, m]) => [s, m.length]),
      ];
      names
        .sort((a, b) => b[1] - a[1])
        .forEach(([s, n]) => out.push([String(A[key].labels?.[s] || s), `${int(n)} ${W.marked} proteins`]));
    }
    if (SPECS[key] && sd)
      (sd.attributes[key] || []).filter(Boolean).forEach((v) => out.push([v, (SPECS[key].values || {})[v] || '']));
    if (PSPEC[key] && PSPEC[key].kind !== 'number')
      [
        ...new Set(
          (D.protein_attributes?.values?.[key] || [])
            .flatMap((x) => String(x || '').split(PSPEC[key].separator || '; '))
            .filter(Boolean)
        ),
      ].forEach((v) => out.push([v, (PSPEC[key].values || {})[v] || '']));
    return out;
  }
  // a value with spaces is quoted, as the search reads key:"two words"
  const quote = (v) => (/[\s,|]/.test(v) ? `"${v}"` : v);
  // the proteins without a mark, for their light pages (read once, when the box is first used)
  let light = null;
  const loadLight = () => {
    if (light || !K.card?.lightIndex) return;
    light = [];
    K.card.lightIndex().then(
      (ix) => {
        light = ix || [];
      },
      () => {
        light = [];
      }
    );
  };
  function proteinRows(tok) {
    const t = low(tok),
      tn = norm(tok),
      exact = [],
      prefix = [],
      alias = [],
      accs = [],
      named = [];
    if (!t) return [];
    for (const p of P) {
      const al = K.sel.aliasesOf(p.i),
        g = low(p.gene);
      const ex = al.find((x) => low(x) === t || (tn.length >= 3 && norm(x) === tn));
      if (g === t || low(p.acc) === t || low(p.entry) === t) exact.push([p, '']);
      else if (ex) exact.push([p, ex]);
      else if (g.startsWith(t)) prefix.push([p, '']);
      else {
        const a = al.find((x) => low(x).startsWith(t) || (tn.length >= 3 && norm(x).startsWith(tn)));
        if (a) alias.push([p, a]);
        else if (low(p.acc).startsWith(t)) accs.push([p, '']);
        else if (t.length >= 3 && low(p.name).includes(t)) named.push([p, '']);
      }
    }
    const by = (a, b) => b[0].marks - a[0].marks;
    const rows = [...exact, ...prefix.sort(by), ...alias.sort(by), ...accs.sort(by), ...named.sort(by)]
      .slice(0, 8)
      .map(([p, a]) => ({
        kind: 'protein',
        text: p.gene || p.acc,
        label: p.gene || p.acc,
        sub: [a, p.name].filter(Boolean).join(' · '),
        n: `${int(p.marks)} ${p.marks === 1 ? W.mark : W.marks}`,
      }));
    // a protein of the sequences without a mark: its light page
    if (light?.length && tok.length >= 2 && rows.length < 8) {
      const u = tok.toUpperCase();
      light
        .filter((x) => x[0] === u || String(x[1]).toUpperCase() === u || String(x[2]).toUpperCase() === u)
        .slice(0, 2)
        .forEach((x) =>
          rows.push({
            kind: 'light',
            text: x[1] || x[0],
            label: x[1] || x[0],
            sub: `${x[0]} · no ${W.mark} in this explorer`,
            n: 'page',
            acc: x[0],
          })
        );
    }
    return rows;
  }
  // words that name a filter rather than a protein: a class, value or yes/no attribute whose name holds them (the protein
  // sets are found by K.terms when its index is in). Each row is the filter itself, shown by its readable name.
  function conceptRows(phrase, drop) {
    const t = low(phrase).trim(),
      sd = K.sel.data();
    if (t.length < 3 || !sd) return [];
    const out = [],
      has = (s) => low(s).includes(t) || low(s).replace(/[-_]/g, ' ').includes(t),
      row = (label, sub, filter) => out.push({ kind: 'termsel', label, sub, filter, drop });
    D.analyses.forEach((a) => {
      const sets = a.kind === 'protein_sets';
      if (sets && K.terms?.state() === 'ready') return;
      const names = sets
        ? [
            ...(sd.protein_sets?.[a.id]?.sets || []).map((x) => x[0]),
            ...(sd.protein_sets?.[a.id]?.more || []).map((x) => x[0]),
          ]
        : sd.classes[a.id] || [];
      names
        .map((s) => [s, String(a.labels?.[s] || s)])
        .filter(([, lab]) => has(lab))
        .sort((x, y) => x[1].length - y[1].length)
        .slice(0, 2)
        .forEach(([s, lab]) => row(lab, a.title, [(sets ? 'p:' : 'a:') + a.id, [s]]));
    });
    Object.entries(SPECS)
      .filter(([, s]) => s.filter)
      .forEach(([k, s]) =>
        Object.entries(s.flag ? {} : s.values || {})
          .filter(([v, l]) => has(l) || has(v))
          .slice(0, 2)
          .forEach(([v, l]) => row(l || v, s.label, ['t:' + k, [v]]))
      );
    // a yes/no attribute whose label holds the words
    [...Object.entries(SPECS).map(([k, s]) => ['t:', k, s]), ...Object.entries(PSPEC).map(([k, s]) => ['r:', k, s])]
      .filter(([, k, s]) => s.flag && (has(s.label || k) || has(s.query || k)))
      .slice(0, 2)
      .forEach(([kind, k, s]) => row(s.label || k, 'Yes or no', [kind + k, [String(s.flag)]]));
    const seen = new Set();
    return out.filter((x) => !seen.has(x.filter[0] + x.filter[1]) && seen.add(x.filter[0] + x.filter[1])).slice(0, 6);
  }
  // a page by its tab's name, or by the word it had before: "Statistics" offers All tests, "IDRs" the Disordered regions
  const OLD = {
    statistics: ['Statistics', 'Results'],
    overlap: ['Overlap', 'Compare sets'],
    idrs: ['IDRs', 'IDR'],
    method: ['Method', 'Methods', 'Documentation', 'All tests'],
    interactions: ['Interactions'],
  };
  function pageRows(phrase) {
    const t = low(phrase.trim());
    if (t.length < 3) return [];
    const pages = [
      ['overview', 'Overview'],
      ...K.tabs.map((f) => f()).filter(Boolean),
      ['method', 'Methods'],
      ...(K.tabsEnd || []).map((f) => f()).filter(Boolean),
    ];
    const seen = new Set();
    return pages
      .filter(([v]) => (['overview', 'method'].includes(v) || K.views[v]) && !seen.has(v) && seen.add(v))
      .map(([v, n]) => [v, K.tabName(v, n)])
      .filter(([v, name]) =>
        [name, v, ...(OLD[v] || [])].some(
          (w) =>
            low(w).startsWith(t) ||
            low(w)
              .split(/[^a-z0-9]+/)
              .some((x) => x.length >= 3 && x.startsWith(t))
        )
      )
      .slice(0, 2)
      .map(([v, name]) => ({ kind: 'page', view: v, text: name, label: name, sub: 'Open this page' }));
  }
  function suggestions(text) {
    const toks = text.match(/[a-z_][\w]*:"[^"]*"?|\S+/gi) || [],
      tok = /\s$/.test(text) ? '' : toks[toks.length - 1] || '';
    if (!tok) return [];
    const m = /^([a-z_][\w]*):"?([^"]*)$/i.exec(tok);
    // an id typed with its prefix (GO:0008380, DOID:332) names a term, though its prefix may be a key too
    const byId = m && /\d/.test(m[2]) ? K.terms?.suggest(tok) : [];
    if (byId?.length) {
      byId.forEach((r) => (r.drop = 1) && (r.last = true));
      return byId;
    }
    if (m && K.sel.isTermKey(m[1])) {
      // a key's values
      const key = m[1].toLowerCase(),
        head = m[2].includes(',') ? m[2].slice(0, m[2].lastIndexOf(',') + 1) : '',
        part = low(m[2].split(',').pop());
      return valuesOf(key)
        .filter(([v, l]) => !part || low(v).startsWith(part) || low(l).includes(part))
        .slice(0, 10)
        .map(([v, l, n]) => ({ kind: 'value', text: `${key}:${head}${quote(v)}`, label: `${key}:${v}`, sub: l, n }));
    }
    const out = [],
      flags = []; // yes/no attributes whose query word begins with the typed word: shown by their label
    if (tok.length >= 2 && !m)
      keys()
        .filter((k) => k.key.startsWith(low(tok)))
        .slice(0, 4)
        .forEach((k) =>
          (k.flag ? flags : out).push(
            k.flag
              ? { kind: 'termsel', label: k.label, sub: k.help, filter: k.flag, drop: 1 }
              : {
                  kind: 'key',
                  text: k.key + ':',
                  label: k.key + ':',
                  sub: [k.label, k.help].filter(Boolean).join(' · '),
                }
          )
        );
    // proteins named exactly come first, then the terms (protein sets and ontologies by name or id), then the other proteins
    const prot = proteinRows(tok),
      plainToks = toks.filter((t) => !/^[a-z_][\w]*:/i.test(t));
    let terms = [];
    if (!m && K.terms && plainToks.length) {
      terms = K.terms.suggest(plainToks.join(' '));
      terms.forEach((r) => (r.drop = plainToks.length));
      if (!terms.length && plainToks.length > 1) {
        terms = K.terms.suggest(tok);
        terms.forEach((r) => (r.drop = 1));
      }
    }
    const isExact = (r) => r.kind === 'protein' && low(r.label) === low(tok);
    out.push(
      ...prot.filter(isExact),
      ...terms,
      ...flags,
      ...prot.filter((r) => !isExact(r)).slice(0, terms.length ? 3 : 8)
    );
    if (!m && !/^[a-z_][\w]*:/i.test(tok)) out.push(...pageRows(tok));
    // plain words naming no protein: the filters they may mean
    const plain = plainToks.join(' ');
    if (out.length < 3 && plain === toks.join(' ')) out.push(...conceptRows(plain, plainToks.length));
    const seen = new Set(),
      same = (x) => x.kind + x.text + (x.filter || '');
    return out.filter((x) => !seen.has(same(x)) && seen.add(same(x))).slice(0, terms.length ? 16 : 10);
  }

  // ---- the list -----------------------------------------------------------------------------------------------------
  let items = [],
    active = -1,
    slow = false; // the term index is still being read
  const isFilterRow = (x) => ['key', 'value', 'term'].includes(x.kind);
  function draw() {
    if (!items.length && !slow) {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      return;
    }
    let grp = null;
    list.innerHTML =
      items
        .map((x, k) => {
          const head =
            x.group && x.group !== grp
              ? `<div class="q-grp" role="presentation" aria-hidden="true">${esc(x.group)}</div>`
              : '';
          grp = x.group || grp;
          return (
            head +
            `<div class="q-opt${k === active ? ' on' : ''}${x.kind === 'termsel' ? ' q-term' : ''}" role="option" id="q-opt-${k}" aria-selected="${k === active}" data-q-opt="${k}">` +
            `<span class="q-l${
              x.kind === 'protein' || x.kind === 'light' || x.kind === 'page' || x.kind === 'termsel' ? '' : ' mono'
            }">${esc(x.label)}</span>${x.sub ? `<span class="q-s">${esc(x.sub)}</span>` : ''}` +
            `${x.n ? `<span class="q-n">${esc(x.n)}</span>` : ''}${
              isFilterRow(x)
                ? '<span class="q-k">filter</span>'
                : x.kind === 'page'
                  ? '<span class="q-k">page</span>'
                  : ''
            }</div>`
          );
        })
        .join('') +
      (slow ? '<div class="q-grp q-load" role="status">Loading protein sets and ontology terms…</div>' : '');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', 'q-opt-' + active);
    else input.removeAttribute('aria-activedescendant');
  }
  const close = () => {
    items = [];
    active = -1;
    draw();
  };
  // a pasted list (two or more words) is not being typed: no suggestions for its last word
  let pasted = false;
  input.addEventListener('paste', () => {
    pasted = true;
  });
  input.addEventListener('keydown', () => {
    pasted = false;
  });
  let nWords = 0;
  function update() {
    const n = (input.value.match(/\S+/g) || []).length,
      jump = n - nWords >= 2; // two or more words arriving at once are a paste (or a fill)
    nWords = n;
    if ((pasted || jump) && n >= 2) {
      pasted = false;
      close();
      return;
    }
    pasted = false;
    loadLight();
    const on = document.activeElement === input;
    if (on) K.terms?.load();
    items = on ? suggestions(input.value) : [];
    // a first read that is slow says so, once a word is typed
    slow = on && K.terms?.state() === 'loading' && /\S{3}/.test(input.value) && Date.now() - K.terms.since() > 250;
    if (on && K.terms?.state() === 'loading' && !slow) setTimeout(update, 300);
    active = -1;
    draw();
  }
  K.terms?.onLoad(() => {
    if (document.activeElement === input) update();
  });
  // the search as typed, applied as the box's own input does: a protein named alone opens it
  function apply(text, open) {
    input.value = text;
    S.q = text.trim();
    K.commitQ?.();
    close();
    if (open && K.openIfOne?.()) return;
    K.writeHash(true);
    K.render();
    input.focus();
  }
  function choose(k) {
    const x = items[k];
    if (!x) return;
    const toks = input.value.match(/[a-z_][\w]*:"[^"]*"?|\S+/gi) || [],
      keepEnd = /\s$/.test(input.value);
    if (x.kind === 'page') {
      const rest = toks.slice(0, -1).join(' ');
      input.value = rest;
      S.q = rest.trim();
      close();
      K.go(x.view);
      return;
    }
    if (x.kind === 'light') {
      input.value = x.text;
      S.q = x.text;
      close();
      if (!K.openLight?.(x.text)) K.go('protein', { arg: x.acc });
      return;
    }
    if (x.filter) {
      // a term of a set or ontology: its filter, shown as a chip; the words that named it leave the box
      let left = x.drop ?? toks.length;
      const kept = [];
      for (let i = toks.length - 1; i >= 0; i--) {
        const isKey = /^[a-z_][\w]*:/i.test(toks[i]) || K.sel.FLAGQ?.[toks[i].toLowerCase()];
        if (left > 0 && (x.last ? i === toks.length - 1 : !isKey)) left--;
        else kept.unshift(toks[i]);
      }
      const [fk, fv] = x.filter;
      S.f[fk] = [...new Set([...(S.f[fk] || []), ...fv])];
      apply(kept.join(' '), false);
      return;
    }
    const before = keepEnd ? toks : toks.slice(0, -1);
    const text = [...before, x.text].join(' ');
    if (x.kind === 'key') {
      input.value = text;
      input.focus();
      update();
      return;
    }
    apply(x.kind === 'value' || x.kind === 'term' ? text + ' ' : text, x.kind === 'protein' && before.length === 0);
  }
  input.addEventListener('input', () => update());
  input.addEventListener('focus', () => update());
  input.addEventListener('blur', () =>
    setTimeout(() => {
      if (document.activeElement !== input) close();
    }, 150)
  );
  // before the box's own keys (kit.js): the list's arrows, Enter on a suggestion, Escape closes the list then clears
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.target !== input) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) {
          update();
          if (!items.length) return;
        }
        e.preventDefault();
        active =
          e.key === 'ArrowDown'
            ? active + 1 >= items.length
              ? -1
              : active + 1
            : active < 0
              ? items.length - 1
              : active - 1;
        draw();
      } else if (e.key === 'Enter' && active >= 0 && items.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(active);
      } else if (e.key === 'Escape') {
        // closes the list; the box's own handler (kit.js) puts back the search as last committed. Never clears it.
        if (items.length) {
          e.preventDefault();
          close();
        }
      } else if (e.key === 'Enter') close();
    },
    true
  );
  list.addEventListener('mousedown', (e) => {
    const o = e.target.closest('[data-q-opt]');
    if (o) {
      e.preventDefault();
      choose(+o.dataset.qOpt);
    }
  });
  document.addEventListener('click', (e) => {
    if (!field.contains(e.target)) close();
  });

  // ---- the line under the search ------------------------------------------------------------------------------------
  const list_ = (xs, max = 25) =>
    xs
      .slice(0, max)
      .map((x) => `<b>${esc(x)}</b>`)
      .join(', ') + (xs.length > max ? ` and ${int(xs.length - max)} more` : '');
  const typo = (q, w) => {
    const n = q.typos?.[w];
    return n?.length
      ? ` Did you mean ${n
          .map(
            ([, g]) =>
              `<button class="linkish" ` +
              `type="button" data-q-typo="${esc(w)}" data-q-to="${esc(g)}">${esc(g)}</button>`
          )
          .join(', ')}?`
      : '';
  };
  function noteHtml() {
    if (!S.q || !K.sel.data()) return '';
    const c = K.sel.compute(),
      q = c.q,
      out = [];
    const prots = new Set([...q.genes, ...q.sites.map((x) => x[0])]);
    // a variant is searched as its site: say so, and what it matched
    (q.variants || []).forEach(([g, aa, pos, to]) =>
      out.push(
        `<b>${esc(g)} ${aa}${pos}${to}</b> is searched as ` +
          `the site <b>${esc(g)} ${aa}${pos}</b>; the change to ${esc(to === '*' ? 'a stop' : to)} is not matched, ` +
          `and the card of the site lists its variants first.`
      )
    );
    (q.positions || []).forEach(([aa, pos, to]) =>
      out.push(
        `<b>${aa}${pos}${to}</b> with no protein is searched ` +
          `as ${aa}${pos} in every protein: <b>${int(c.marks?.length || 0)}</b> ${esc(
            c.marks?.length === 1 ? W.mark : W.marks
          )} on <b>${int(c.proteins?.size || 0)}</b> protein${c.proteins?.size === 1 ? '' : 's'}. The change to ${esc(to === '*' ? 'a stop' : to)} is not matched;` +
          ` name the protein (${EXGENE} ${aa}${pos}${to}) to open its site.`
      )
    );
    if (prots.size || q.sites.length) {
      const missing = [...(q.absent || [])];
      if (q.nWords > 1 && (prots.size > 1 || missing.length))
        out.push(
          `<b>${int(prots.size)}</b> protein${prots.size === 1 ? '' : 's'} from ${int(q.nWords - missing.length)} of ${int(q.nWords)} search words.`
        );
      if (q.via.length)
        out.push(
          `Matched by another name: ${q.via
            .slice(0, 10)
            .map(([t, g]) => `${esc(t)} → ${esc(g.join('/'))}`)
            .join(', ')}.`
        );
      if (missing.length)
        out.push(`Not in this dataset: ${list_(missing)}.${missing.length === 1 ? typo(q, missing[0]) : ''}`);
      if (q.missing.length) out.push(`No ${esc(W.mark)} reported at ${list_(q.missing, 10)}.`);
      q.numbered.forEach(([g, typed, u, rule]) =>
        out.push(`${esc(rule.note || rule.label || 'Numbered as papers do')}: ${esc(g)} ${typed} is UniProt ${u}.`)
      );
      if (q.ignored?.length)
        out.push(
          `<span title="In a list of proteins, words are not searched in protein ` +
            `names: search them on their own to do that">Not a protein, left out of the list: ${list_(q.ignored)}.</span>`
        );
      if (q.ambiguous?.length)
        out.push(
          q.ambiguous
            .map(
              ([t, g]) =>
                `<b>${esc(t)}</b> read as ${esc(g)}’s site, ` +
                `not the protein ${esc(t)} (write it first, or alone, to list it).`
            )
            .join(' ')
        );
    } else if (q.words.length && !q.unmatched.length && !(c.proteins || new Set()).size && !c.cons.length) {
      const phrase = q.words.join(' '),
        cs = conceptRows(phrase);
      out.push(
        `No protein on this site matches all of “${esc(phrase)}”.` +
          (cs.length
            ? ` Did you mean ${cs
                .slice(0, 4)
                .map(
                  (x) =>
                    `<button class="linkish ` +
                    `mono" type="button" data-q-set="${esc(x.text)}" title="${esc(x.sub)}">${esc(x.label)}</button>`
                )
                .join(', ')}?`
            : '')
      );
    } else if (q.words.length && !q.unmatched.length) {
      const n = (c.proteins || new Set()).size,
        phrase = q.words.join(' ');
      out.push(
        `<b>${int(n)}</b> protein${n === 1 ? '' : 's'} match “${esc(phrase)}” by the start of a gene, ` +
          `accession or other name, or by part of a protein name.`
      );
    }
    if (q.unmatched.length) {
      const phrase = q.unmatched.join(' '),
        cs = conceptRows([...q.words, ...q.unmatched].join(' '));
      out.push(
        `No protein on this site matches “${esc(phrase)}”.` +
          (q.unmatched.length === 1 ? typo(q, q.unmatched[0]) : '') +
          (cs.length
            ? ` Did you mean ${cs
                .slice(0, 4)
                .map(
                  (x) =>
                    `<button class="linkish mono" type="button" ` +
                    `data-q-set="${esc(x.text)}" title="${esc(x.sub)}">${esc(x.label)}</button>`
                )
                .join(', ')}?`
            : ' Try a gene, an accession or part of a protein name.')
      );
    }
    const errs = c.errors || [];
    const unknown = (c.unresolved || []).filter((t) => !K.sel.isTermKey(t.split(':')[0]));
    const empty = (c.unresolved || []).filter(
      (t) => K.sel.isTermKey(t.split(':')[0]) && !errs.some((e) => e.startsWith(t.split(':')[0] + ':'))
    );
    if (errs.length) out.push(`<span class="warn-text">${errs.map(esc).join(' ')}</span>`);
    if (empty.length)
      out.push(
        `<span class="warn-text">Nothing matches ${list_(empty)}: no ${esc(W.mark)} is selected ` +
          `while it stays.</span>`
      );
    if (unknown.length)
      out.push(
        `<span class="warn-text">${list_(unknown)}: not a search key here (<a href="${esc(K.link('method', 'search'))}">the search ` +
          `terms</a>).</span>`
      );
    return out.join(' ');
  }
  (K.afterRender ||= []).push(() => {
    const h = noteHtml();
    note.innerHTML = h;
    note.hidden = !h;
    // a short placeholder on a narrow screen
    if (matchMedia('(max-width: 560px)').matches)
      input.placeholder = `Gene, site, gene list${
        (D.site.examples || []).find((e) => e.includes(':'))
          ? ' or ' + (D.site.examples || []).find((e) => e.includes(':'))
          : ''
      }`;
  });
  K.clicks.push(
    [
      '[data-q-typo]',
      (el) => {
        const w = el.dataset.qTypo,
          re = new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
        apply(S.q.replace(re, `$1${el.dataset.qTo}`), true);
      },
    ],
    [
      '[data-q-set]',
      (el) => {
        const kept = (S.q.match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || []).filter((t) => /^[a-z_][\w]*:/i.test(t));
        apply([...kept, el.dataset.qSet].join(' '), false);
      },
    ]
  );

  // ---- the Method page: the search's words beyond genes and keys ----------------------------------------------------
  (K.methodParts ||= []).push(() => {
    const parts = [];
    if (Object.keys(SRCH.shorthand || {}).length)
      parts.push(
        `Other names papers use: ${Object.entries(SRCH.shorthand)
          .map(([n, acc]) => `<span class="mono">${esc(n)}</span> (${esc(acc)})`)
          .join(', ')}; a site ` +
          `may follow the name directly (<span class="mono">${esc(Object.keys(SRCH.shorthand)[0])}${esc((D.residues || [''])[0])}3</span>).`
      );
    if (Object.keys(D.protein_aliases || {}).length)
      parts.push(
        `A protein is found by gene, accession, entry name ` +
          `or any other name in the tables of this explorer (synonyms, source symbols), with or without hyphens, spaces and ` +
          `dots. A name in two words is read as one.`
      );
    if ((D.protein_view?.numbering || []).length)
      parts.push(
        `Positions are read as each protein's page numbers ` +
          `them: ${D.protein_view.numbering.map((n) => esc(n.note || n.label || '')).join('; ')}.`
      );
    if (SRCH.patterns)
      parts.push(
        `The motif finder: <span class="mono">${esc(SRCH.patterns.at || '')}:</span> ` +
          `takes a pattern covering the ${esc(W.mark)}, with one position on it. <span class="mono">${esc(SRCH.patterns.near || '')}:</span> ` +
          `takes one anywhere within ${int(SRCH.patterns.span || 15)} residues. X . * or ? is any residue, [ST] a ` +
          `choice, 2 to 10 positions${SITE_PH.motif_either ? `, and ${esc(SITE_PH.motif_either)} either` : ''}.`
      );
    Object.entries(SRCH.terms || {}).forEach(([k, t]) =>
      parts.push(
        `<span class="mono">${esc(k)}:</span> ${esc(t.help || '')} (${Object.keys(t.values)
          .map((v) => `<span class="mono">${esc(k)}:${esc(v)}</span>`)
          .join(', ')}).`
      )
    );
    Object.entries(K.searchTermHelp || {}).forEach(([k, h]) =>
      parts.push(`<span class="mono">${esc(k)}:</span> ${esc(h.help || h.label || '')}.`)
    );
    return parts.length
      ? `<section id="m-search-words"><h3>More search words</h3><ul>${parts.map((x) => `<li>${x}</li>`).join('')}</ul></section>`
      : '';
  });
});
