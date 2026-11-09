/* One question seen several ways, as the site file sets it on an Overview card (website.overview ... cards):
     views     a switch between protein-set questions that answer the same question (two vocabularies, say)
     more      more sets of the same kind, tested apart, shown under the question's own behind a button
     members   the sets a family question gathers (its sets.families), each with its own test: a table with a picker
     ontology  for a question whose sets form an ontology (its hierarchy): the most specific enriched sets and the
               largest classes that are not, the whole ontology as a tree, and a table of every tested set
   and, on protein pages (website.protein.sets), cards of the protein's own sets, each linked to its page.
   Every word comes from the site file or the data (titles, labels, nouns, glosses, links); a site without these
   options never reaches this module's views. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, A, S, W, esc, int, fxn, fq } = K;
  const PADJ = 0.05;
  // what is open, per question (in memory, as the explorer kept it)
  const UI = {
    more: new Set(),
    members: new Set(),
    tree: new Set(),
    level: new Set(),
    table: new Set(),
    every: new Set(),
    all: new Set(),
    pick: {},
  };
  // the rows behind each figure as last drawn, for its downloads
  const LAST = {};

  // ---- the data: a set's own page, a family question's sets, an ontology's children -------------------------------
  const setUrl = (aid, s) =>
    A[aid]?.link ? A[aid].link.replace('{}', encodeURIComponent(s).replace(/%3A/gi, ':')) : '';
  const idLink = (aid, s) => {
    const u = setUrl(aid, s);
    return u
      ? `<a class="qv-id mono" href="${esc(u)}" target="_blank" ` +
          `rel="noopener" title="Its own page">${esc(s)} ↗</a>`
      : `<span class="qv-id mono">${esc(s)}</span>`;
  };
  K.setIdLink = idLink;
  const famCache = {},
    kidCache = {};
  // set -> family, for a question that gathers sets into families (from its gathers: family -> its sets)
  const famOf = (aid) =>
    (famCache[aid] ||= Object.fromEntries(
      Object.entries(A[aid]?.gathers || {}).flatMap(([f, ss]) => ss.map((s) => [s, f]))
    ));
  // set -> its children, for a question with a hierarchy (from its parents)
  const kidsOf = (aid) =>
    (kidCache[aid] ||= (() => {
      const out = {};
      Object.entries(A[aid]?.parents || {}).forEach(([s, ps]) => ps.forEach((p) => (out[p] ||= []).push(s)));
      return out;
    })());
  const below = (aid, s) => {
    const kids = kidsOf(aid),
      seen = new Set(),
      todo = [...(kids[s] || [])];
    while (todo.length) {
      const x = todo.pop();
      if (!seen.has(x)) {
        seen.add(x);
        todo.push(...(kids[x] || []));
      }
    }
    return seen;
  };
  const labelOf = (aid, s) => (A[aid]?.labels || {})[s] || s;
  const enriched = (r) => !!r && r.q != null && r.q <= PADJ && (r.eff ?? 0) > 1;
  // the cards' options, by the question they belong to
  const optionsOf = (card, aid) => {
    const views = card.views || [];
    return views.find((v) => v.analysis === aid) || (card.analysis === aid ? card : null);
  };
  // the words the site file gives a question as an ontology view or as member sets, wherever a card names it
  const viewsAll = () => K.allCards().flatMap((c) => [c, ...(c.views || [])]);
  const ontologyOf = (aid) => viewsAll().find((v) => v.analysis === aid && v.ontology)?.ontology || null;
  const asMembers = (aid) =>
    viewsAll()
      .map((v) => v.members)
      .find((m) => m && m.analysis === aid) || null;
  const unitOf = (aid) => A[aid]?.unit || 'members';
  // the member question of a family question (members.of), for the protein cards
  const membersOf = (aid) => {
    for (const c of K.allCards())
      for (const v of [c, ...(c.views || [])])
        if (v.members && v.members.of.some((o) => o.analysis === aid)) return v.members;
    return null;
  };
  const expButtons = (attr, aid) =>
    `<div class="exp" role="group" aria-label="Download">${['pdf', 'svg', 'png', 'tsv']
      .map(
        (k) =>
          `<button type="button" ` +
          `class="exp-btn" data-${attr}="${k}" data-qaid="${esc(aid)}" title="${esc(K.EXP_HELP[k])}">${k.toUpperCase()}</button>`
      )
      .join('')}${K.methodLink(aid)}</div>`;
  // a chart in the kit's own drawing, of these items in this order: {head} a heading, {r, depth, gloss} a row (a row
  // under another indented; a class's plain gloss beside its name)
  const chart = (a, items) => {
    const rows = items.filter((x) => x.r).map((x) => (x.gloss ? { ...x.r, help: x.gloss[0] } : x.r));
    const M = K.chartModel(a, rows, 'enricher');
    let k = 0;
    M.items = items.map((x) => (x.r ? { r: rows[k++] } : { head: x.head }));
    const depths = items.filter((x) => x.r).map((x) => x.depth || 0);
    let i = 0;
    return K.chartHtml(M, K.fkeyOf(a), null).replace(/class="drow qrow/g, (m) => {
      const d = depths[i++];
      return d ? `${m} qv-d${d}` : m;
    });
  };

  // ---- a question's card, its way: the views' switch, its body, more sets, member sets -----------------------------
  K.questionBody = (a, rows, card) => {
    const v = optionsOf(card, a.id),
      views = (card.views || []).filter((x) => A[x.analysis]);
    if (!v || !(views.length > 1 || v.more || v.members || v.ontology)) return null;
    const sw =
      views.length > 1
        ? `<div class="qv-views"><span class="seg" role="group" aria-label="${esc(card.title || a.title)}: views">${views
            .map(
              (x) =>
                `<a href="${esc(K.link('overview', x.analysis))}" role="button" aria-pressed="${x.analysis === a.id}" title="${esc(A[x.analysis].title)}">${esc(x.label)}</a>`
            )
            .join('')}</span></div>`
        : '';
    // against other marks, or a selection made with this question (shown, not tested): the kit's own card
    const shownOnly = rows.length > 0 && rows.every((r) => r.descriptive);
    const body =
      v.ontology && A[a.id].parents && !rows.some((r) => r.vs) && !shownOnly
        ? ontologyBody(a, rows, v.ontology)
        : K.cardBody(a, rows);
    return (
      sw +
      body +
      (v.more && A[v.more.analysis] ? moreHtml(a, v.more) : '') +
      (v.members && A[v.members.analysis] ? membersHtml(a, v.members) : '')
    );
  };

  // ---- more sets, tested apart, under the question's own -------------------------------------------------------------
  function moreHtml(a, more) {
    const b = A[more.analysis],
      key = a.id + '>' + b.id,
      on = UI.more.has(key),
      n = K.rowsFor(b, 'enricher').length;
    const btn = `<button class="linkish" type="button" data-qmore="${esc(key)}" aria-expanded="${on}">${
      on ? `Show ${esc(a.title)} only` : esc((more.label || 'Show {n} more sets').replace('{n}', int(n)))
    }</button>`;
    if (!on) return `<div class="qv-links">${btn}</div>`;
    const rows = K.chartRows(b, 'enricher', K.cardOf(b.id));
    return (
      `<div class="qv-links">${btn}</div><section class="qv-more" aria-label="${esc(more.head || b.title)}"><div class="card-head">` +
      `<div><h4 class="qv-head">${esc(more.head || b.title)}</h4><p class="sub">${esc(b.sub)}.</p></div>${expButtons(
        'exp',
        b.id
      ).replace(/data-exp="(\w+)" data-qaid/g, 'data-exp="$1" data-aid')}</div>` +
      `${chart(
        b,
        rows.map((r) => ({ r }))
      )}</section>`
    );
  }

  // ---- an ontology: the short list, the tree, the table of every tested set ------------------------------------------
  function ontologyBody(a, rows, o) {
    const site = new Map(K.rowsFor(a, 'enricher').map((r) => [r.category, r])),
      R = new Map(rows.map((r) => [r.category, r]));
    const root = A[a.id].root,
      kids = kidsOf(a.id),
      size = (s) => {
        const r = site.get(s);
        return r ? r.a + r.c : 0;
      };
    const fe = (s) => R.get(s)?.eff ?? -1,
      byFe = (x, y) => fe(y) - fe(x),
      nouns = o.nouns || 'sets';
    const enr = (s) => s !== root && enriched(R.get(s));
    const tree = UI.tree.has(a.id),
      level = UI.level.has(a.id),
      items = [];
    // a set the selection does not reach: drawn without a dot, so the tree keeps its shape
    const rowOf = (s) =>
      R.get(s) || {
        ...site.get(s),
        a: 0,
        eff: null,
        fold: null,
        p: null,
        q: null,
        dir: 'ns',
        selection: true,
        descriptive: true,
      };
    if (tree) {
      const big = (s) => size(s) >= (o.tree || 100);
      (kids[root] || [])
        .filter((s) => site.has(s))
        .sort(byFe)
        .forEach((c) => {
          items.push(['row', c, 0]);
          (kids[c] || [])
            .filter(big)
            .sort(byFe)
            .forEach((cc) => {
              items.push(['row', cc, 1]);
              if (level)
                (kids[cc] || [])
                  .filter(big)
                  .sort(byFe)
                  .forEach((g) => items.push(['row', g, 2]));
            });
        });
    } else {
      const listed = [...site.keys()].filter((s) => enr(s) && size(s) >= (o.short || 50)),
        set = new Set(listed);
      const specific = listed.filter((s) => ![...below(a.id, s)].some((x) => set.has(x))).sort(byFe);
      if (specific.length)
        items.push(
          ['head', `Enriched (q ≤ ${PADJ}): the most specific ${nouns}`],
          ...specific.map((s) => ['row', s, 0])
        );
      else items.push(['head', `No ${o.noun || 'set'} of ${int(o.short || 50)} or more is enriched (q ≤ ${PADJ})`]);
      const cmp = [...new Set((kids[root] || []).flatMap((c) => kids[c] || []))]
        .filter((s) => site.has(s) && !enr(s))
        .sort((x, y) => size(y) - size(x))
        .slice(0, o.compare ?? 4);
      if (cmp.length)
        items.push(['head', 'For comparison: the largest classes, not enriched'], ...cmp.map((s) => ['row', s, 0]));
    }
    LAST[a.id] = { items: items.map(([k, s, d]) => (k === 'row' ? ['row', rowOf(s), d] : [k, s])), o };
    const nSig = [...site.keys()].filter(enr).length;
    const drawn = chart(
      a,
      items.map(([k, s, d]) => (k === 'head' ? { head: s } : { r: rowOf(s), depth: d, gloss: (o.glosses || {})[s] }))
    );
    const u = unitOf(a.id);
    const note = tree
      ? `Indented rows are ${nouns} under the row above, of at least ${int(o.tree || 100)} ${u}. Their ${u} are among its ${u}, and ${nouns} overlap,` +
        ` so they do not add up.`
      : `A ${o.noun || 'set'} holds the ${u} of every ${o.noun || 'set'} under it, so broad ${nouns} repeat the ` +
        `narrower ones. The list keeps the narrowest enriched ${o.noun || 'set'} of each branch, of at least ${int(o.short || 50)} ${u}.`;
    const tbl = UI.table.has(a.id);
    return (
      `<div class="card-body"><div class="card-head"><div><h3>${esc(a.title)}</h3><p class="sub">${esc(K.shortSub(a.sub))}. <a href="#method">` +
      `How it was tested</a> · <a href="${esc(
        K.link('statistics', '', { a: a.id })
      )}">all tests</a></p></div>${expButtons('qoexp', a.id)}</div>` +
      `${drawn}<p class="note">${note}</p>` +
      `<div class="qv-links"><button class="linkish" type="button" data-qtree="${esc(a.id)}">${
        tree ? 'Show the short list' : `Show the whole ${o.whole || 'ontology'}`
      }</button>` +
      (tree
        ? `<button class="linkish" type="button" data-qlevel="${esc(a.id)}">${
            level ? `Hide the ${nouns} under them` : `Show the ${nouns} under them`
          }</button>`
        : '') +
      `<button class="linkish" type="button" data-qtable="${esc(a.id)}" aria-expanded="${tbl}">${
        tbl
          ? 'Hide the table'
          : `Show the ${int(nSig)} enriched ${nouns}${K.selOn() ? ' of your selection' : ''}, and every tested ${o.noun || 'set'}`
      }</button></div>` +
      (tbl ? ontologyTable(a, rows, o) : '') +
      '</div>'
    );
  }
  function ontologyTable(a, rows, o) {
    const all = UI.every.has(a.id),
      nouns = o.nouns || 'sets',
      P = A[a.id].parents || {},
      root = A[a.id].root;
    const tested = rows.filter((r) => r.category !== root),
      enr = tested.filter(enriched);
    const shown = (all ? tested : enr).slice().sort((x, y) => (x.q ?? 2) - (y.q ?? 2) || (y.eff ?? 0) - (x.eff ?? 0));
    LAST[a.id + ':table'] = shown;
    return (
      `<div class="qv-members"><div class="card-head"><p class="note">${int(K.rowsFor(a, 'enricher').length - 1)} ${esc(nouns)} were tested; <b>${int(enr.length)}</b> are ` +
      `enriched (q ≤ ${PADJ})${K.selOn() ? ' for your selection, tested again in your browser' : ''}.</p>${K.expBar(
        ['pdf', 'svg', 'png', 'tsv'],
        'qotexp',
        'the table',
        a.id
      ).replace(/data-qotexp="(\w+)"/g, `data-qotexp="$1" ` + `data-qaid="${esc(a.id)}"`)}</div>` +
      (`<label class="small qv-pick">Show <select data-qevery="${esc(a.id)}"><option value="0">the enriched ${esc(nouns)} (${int(enr.length)})</option>` +
        `<option value="1"${all ? ' selected' : ''}>every tested ${esc(o.noun || 'set')} (${int(tested.length)})</option>` +
        `</select></label>`) +
      (shown.length
        ? ''
        : `<p class="muted small">No enriched ${esc(o.noun || 'set')}: choose every tested ${esc(o.noun || 'set')} above.</p>`) +
      (`<div class="qv-tbl"${shown.length ? '' : ' hidden'}><table class="tbl"><thead><tr><th>${esc(cap(o.noun || 'set'))} (under)</th>${countHead(a.id)}<th class="num">` +
        `Fold</th><th class="num">q</th></tr></thead><tbody>`) +
      shown
        .map(
          (r) =>
            `<tr><td><button class="linkish" type="button" data-qf="p:${esc(a.id)}" data-qv="${esc(r.category)}" title="Select ` +
            `the ${esc(W.marks)} on its proteins">${esc(r.label)}</button> ${idLink(a.id, r.category)}` +
            ((P[r.category] || []).length
              ? `<span class="qv-sub">under ${esc(P[r.category].map((x) => labelOf(a.id, x)).join(', '))}</span>`
              : '') +
            `</td>` +
            (`<td class="num">${int(r.a)}/${int(r.a + r.c)}</td><td class="num">${r.eff == null ? '–' : r.eff.toFixed(2)}</td><td ` +
              `class="num">${fq(r.q)}</td></tr>`)
        )
        .join('') +
      '</tbody></table></div></div>'
    );
  }
  const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
  K.setUnitOf = K.setUnitOf || (() => `${W.marked}/all`);
  const countHead = (aid) =>
    `<th class="num" title="${esc(cap(unitOf(aid)))} of ${esc(W.marked)} proteins in the ` +
    `set, of all its ${esc(unitOf(aid))} in the background">${esc(cap(W.marked))}/<wbr>all</th>`;

  // ---- the member sets of the families: each with its own test, by family -----------------------------------------
  const PER_FAMILY = 5,
    SHOWN = 25;
  function membersHtml(a, mem) {
    const key = a.id,
      on = UI.members.has(key),
      nouns = mem.nouns || 'member sets';
    const btn = `<button class="linkish" type="button" data-qmembers="${esc(key)}" aria-expanded="${on}">${
      on ? `Hide the ${esc(nouns)}` : esc(mem.label || `Show the ${nouns}`)
    }</button>`;
    if (!on) return `<div class="qv-links">${btn}</div>`;
    const m = A[mem.analysis],
      rows = K.rowsOf(m, 'enricher'),
      nTested = K.rowsFor(m, 'enricher').length;
    const groups = mem.of
      .filter((x) => A[x.analysis])
      .map((x, k) => {
        const fams = K.rowsFor(A[x.analysis], 'enricher')
          .slice()
          .sort((p, q) => (q.eff ?? 0) - (p.eff ?? 0))
          .map((r) => r.category);
        Object.keys(A[x.analysis].gathers || {}).forEach((f) => {
          if (!fams.includes(f)) fams.push(f);
        });
        return { k, aid: x.analysis, label: x.label || A[x.analysis].title, fam: famOf(x.analysis), fams };
      });
    const where = (s) => {
      for (const g of groups) if (g.fam[s]) return [g.k, g.fam[s]];
      return null;
    };
    // a selection made with these data (or naming its proteins) is shown, not tested: its sets by how many it holds
    const shownOnly = rows.length > 0 && rows.every((r) => r.descriptive);
    const pool = shownOnly
      ? rows.filter((r) => r.a > 0).sort((x, y) => y.a - x.a || (y.eff ?? 0) - (x.eff ?? 0))
      : rows.filter(enriched).sort((x, y) => (x.q ?? 2) - (y.q ?? 2) || (y.eff ?? 0) - (x.eff ?? 0));
    const count = (p) => pool.filter((r) => inPick(r, p)).length;
    const inPick = (r, p) => {
      const f = where(r.category);
      if (p === 'all') return true;
      if (p === 'none') return !f;
      if (p[0] === 'g') return !!f && f[0] === +p.slice(1);
      const g = /^f(\d+):(.*)$/s.exec(p);
      return !!g && !!f && f[0] === +g[1] && f[1] === g[2];
    };
    const pick =
      UI.pick[key] && (UI.pick[key] === 'all' || UI.pick[key] === 'none' || /^[gf]\d/.test(UI.pick[key]))
        ? UI.pick[key]
        : 'g0';
    const opt = (v, lab) => `<option value="${esc(v)}"${pick === v ? ' selected' : ''}>${esc(lab)}</option>`;
    const picker =
      `<label class="small qv-pick">Show <select data-qpick="${esc(key)}">` +
      groups
        .map(
          (g) =>
            opt('g' + g.k, `${g.label} (${int(count('g' + g.k))})`) +
            g.fams.map((f) => opt(`f${g.k}:${f}`, ` · ${labelOf(g.aid, f)} (${int(count(`f${g.k}:${f}`))})`)).join('')
        )
        .join('') +
      (mem.none ? opt('none', `${mem.none} (${int(count('none'))})`) : '') +
      opt('all', `all ${int(pool.length)} ${shownOnly ? '' : 'enriched '}${nouns}`) +
      '</select></label>';
    const head =
      `<th>${esc(cap(mem.noun || 'set'))}</th>${countHead(m.id)}<th class="num">Fold</th><th ` + `class="num">q</th>`;
    const row = (r) => {
      const f = where(r.category);
      return (
        `<tr><td><button class="linkish" type="button" data-qf="p:${esc(m.id)}" data-qv="${esc(r.category)}" title="Select ` +
        `the ${esc(W.marks)} on its proteins">${esc(r.label)}</button>` +
        `<span class="qv-sub">${
          f && pick[0] !== 'f' && pick[0] !== 'g' ? esc(labelOf(groups[f[0]].aid, f[1])) + ' · ' : ''
        }${mem.id_label ? esc(mem.id_label) + ' ' : ''}${idLink(m.id, r.category)}</span></td>` +
        (`<td class="num">${int(r.a)}/${int(r.a + r.c)}</td><td class="num">${r.eff == null ? '–' : r.eff.toFixed(2)}</td><td ` +
          `class="num">${fq(r.q)}</td></tr>`)
      );
    };
    let body = '',
      shown = [];
    if (pick[0] === 'f') {
      // one family: its sets, a page at a time
      const list = pool.filter((r) => inPick(r, pick)),
        all = UI.all.has(key);
      shown = all ? list : list.slice(0, SHOWN);
      body =
        shown.map(row).join('') +
        (list.length > SHOWN
          ? `<tr><td colspan="4"><button class="linkish" ` +
            `type="button" data-qallm="${esc(key)}">${
              all ? `Show the first ${SHOWN}` : `Show all ${int(list.length)}`
            }</button></td></tr>`
          : '');
    } else {
      // several families: each one's most significant, under its name
      const order = [
        ...groups
          .filter((g) => pick === 'all' || pick === 'g' + g.k)
          .flatMap((g) => g.fams.map((f) => ['f' + g.k + ':' + f, labelOf(g.aid, f)])),
        ...(mem.none && (pick === 'all' || pick === 'none') ? [['none', cap(mem.none)]] : []),
      ];
      for (const [p, name] of order) {
        const list = pool.filter((r) => inPick(r, p));
        if (!list.length) continue;
        const cut = p === 'none' ? list : list.slice(0, PER_FAMILY);
        shown.push(...cut);
        body +=
          `<tr class="qv-group"><th colspan="4">${esc(name)} <span class="muted">· ${int(list.length)} ${esc(
            list.length === 1 ? mem.noun || 'set' : nouns
          )}</span>` +
          (list.length > cut.length
            ? ` <button class="linkish" type="button" data-qpickto="${esc(key)}" data-v="${esc(p)}">all ${int(list.length)}</button>`
            : '') +
          '</th></tr>' +
          cut.map(row).join('');
      }
    }
    LAST[key + ':members'] = {
      rows: shown,
      where: (s) => {
        const f = where(s);
        return f ? labelOf(groups[f[0]].aid, f[1]) : '';
      },
      m,
    };
    const sel = K.selOn();
    const note =
      (shownOnly
        ? `Your selection was made with these data (or names its proteins), so its ${esc(nouns)} are shown,` +
          ` not tested. These ${int(pool.length)} hold its ${esc(unitOf(m.id))}, most first. `
        : `${int(pool.length)} of the ${int(nTested)} ${esc(nouns)} tested are enriched (q ≤ ${PADJ})${
            sel ? ' for your selection, tested again in your browser' : ''
          }. `) +
      groups.map((g) => `${int(count('g' + g.k))} belong to the ${esc(g.label)}`).join('; ') +
      (mem.none ? `; ${int(count('none'))} to none` : '') +
      `. ${esc(m.sub)}.`;
    return (
      `<div class="qv-links">${btn}</div><section class="qv-members"><div class="card-head"><p class="note">${note}</p>${K.expBar(
        ['pdf', 'svg', 'png', 'tsv'],
        'qmexp',
        'the table',
        m.id
      ).replace(/data-qmexp="(\w+)"/g, `data-qmexp="$1" ` + `data-qaid="${esc(key)}"`)}</div>${picker}` +
      (shown.length
        ? `<div class="qv-tbl"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
          `</div>`
        : `<p class="muted small">No ${shownOnly ? '' : 'enriched '}${esc(mem.noun || 'set')} here.</p>`) +
      '</section>'
    );
  }

  // ---- downloads: the ontology's figure and TSV, the tables' TSV -------------------------------------------------------
  const tsvRows = (aid, rows, extra = () => []) =>
    rows
      .map((r) =>
        [
          r.label,
          r.category,
          ...extra(r),
          r.a,
          r.a + r.c,
          K.g6(r.eff),
          K.g6(r.p),
          K.g6(r.q),
          K.SET_TEST,
          ...K.tsvTail(),
        ].join('\t')
      )
      .join('\n');
  const fileName = (aid, what) => `${D.site.id}_${aid}${what ? '_' + what : ''}${K.selOn() ? '_selection' : ''}`;
  function ontologyTsv(a) {
    const L = LAST[a.id];
    if (!L) return '';
    const P = A[a.id].parents || {};
    const rows = L.items.filter((x) => x[0] === 'row');
    return (
      K.preamble(
        `${a.title}${UI.tree.has(a.id) ? ', the tree' : ', the short list'}`,
        `${a.question} ${a.sub}${K.selWords()}. ${K.setWords(a)}`
      ) +
      [
        'set',
        'set_id',
        'depth',
        'under',
        `${W.marked}_in_set`,
        'set_size',
        'fold_enrichment',
        'p',
        'q',
        'test',
        ...K.TAIL_HEAD,
      ].join('\t') +
      '\n' +
      rows
        .map(([, r, d]) =>
          [
            r.label,
            r.category,
            d,
            (P[r.category] || []).map((x) => labelOf(a.id, x)).join('; '),
            r.a,
            r.a + r.c,
            K.g6(r.eff),
            K.g6(r.p),
            K.g6(r.q),
            K.SET_TEST,
            ...K.tsvTail(),
          ].join('\t')
        )
        .join('\n') +
      '\n'
    );
  }
  function ontologyFigure(a) {
    const L = LAST[a.id],
      { PAL, tw, wrap, FF } = K,
      items = L ? L.items : [];
    const Wd = 760,
      P = 20,
      LW = 330,
      X0 = 400,
      X1 = 650,
      VX = Wd - P,
      parts = [];
    const vals = items
      .filter((x) => x[0] === 'row')
      .map((x) => x[1].eff)
      .filter((v) => v != null && v > 0);
    const l2 = (v) => Math.log2(Math.max(v, 1e-3));
    const lo = Math.min(-1, Math.floor(Math.min(0, ...vals.map(l2)))),
      hi = Math.max(1, Math.ceil(Math.max(0, ...vals.map(l2))));
    const X = (v) => X0 + ((Math.min(Math.max(l2(v), lo), hi) - lo) / (hi - lo)) * (X1 - X0);
    const T = (x, y, t, o = {}) =>
      parts.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 11}"${
          o.weight ? ` font-weight="${o.weight}"` : ''
        }${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || PAL.ink}">${esc(t)}</text>`
      );
    let y = 6;
    const top = y;
    items.forEach(([k, x, d]) => {
      if (k === 'head') {
        y += 8;
        T(P, y + 10, x.toUpperCase(), { size: 9.5, weight: 'bold', fill: PAL.muted });
        y += 18;
        return;
      }
      const r = x,
        g = (L.o.glosses || {})[r.category],
        name = r.label + (g ? ` · ${g[0]}` : '');
      const lab = wrap(name, LW - 14 * d, 11).slice(0, 2),
        h = Math.max(20, lab.length * 13 + 7),
        yc = y + h / 2;
      lab.forEach((t, j) => T(P + 14 * d, yc + 4 - (lab.length - 1) * 6.5 + j * 13, t));
      T(X0 - 12, yc + 4, `${int(r.a)}/${int(r.a + r.c)}`, { anchor: 'end', size: 10, fill: PAL.muted });
      parts.push(`<line x1="${X0}" x2="${X1}" y1="${yc}" y2="${yc}" stroke="${PAL.line}" stroke-width="1"/>`);
      if (r.eff != null)
        parts.push(
          `<circle cx="${X(r.eff).toFixed(1)}" cy="${yc}" r="4.6" fill="${PAL[r.dir]}" stroke="${r.dir === 'ns' ? PAL.muted : '#ffffff'}" stroke-width="1.4"/>`
        );
      T(VX, yc + 4, r.eff == null ? '–' : fxn(r.eff) + '×', {
        anchor: 'end',
        weight: r.dir === 'more' ? 'bold' : null,
        fill: r.dir === 'more' || r.dir === 'less' ? PAL[r.dir] : PAL.muted,
      });
      y += h;
    });
    for (let k = lo; k <= hi; k++)
      parts.push(
        `<line x1="${X(2 ** k).toFixed(1)}" x2="${X(2 ** k).toFixed(1)}" y1="${top}" y2="${y}" stroke="${k === 0 ? PAL.one : PAL.line}" stroke-width="${k === 0 ? 1.2 : 0.8}"${k === 0 ? '' : ' stroke-dasharray="2 3"'}/>`
      );
    for (let k = lo; k <= hi; k++)
      T(X(2 ** k), y + 14, (2 ** k >= 1 ? 2 ** k : '1/' + 2 ** -k) + '×', {
        size: 10,
        anchor: 'middle',
        fill: PAL.muted,
      });
    T((X0 + X1) / 2, y + 28, 'fold enrichment (log scale)', { size: 10, anchor: 'middle', fill: PAL.muted });
    void tw;
    void FF;
    return K.figureFrame({
      title: a.title,
      sub: a.sub + K.selWords(),
      legend: K.dirLegend(['more', 'same', 'ns']),
      body: parts.join(''),
      bodyH: y + 34,
      note: `${
        UI.tree.has(a.id)
          ? 'The classes under the root and their ' + (L?.o.nouns || 'sets') + ' of at least ' + int(L?.o.tree || 100)
          : 'The most specific enriched ' +
            (L?.o.nouns || 'sets') +
            ' of at least ' +
            int(L?.o.short || 50) +
            ', then the largest classes that are not enriched'
      }; counts are ${K.setUnitOf(a.id)}. ${K.setWords(a)}`,
      extra: { analysis: a.id, view: UI.tree.has(a.id) ? 'tree' : 'short list' },
    });
  }
  function tableTsv(aid, rows, where, title) {
    const a = A[aid];
    return (
      K.preamble(title, `${a.question} ${a.sub}${K.selWords()}. ${K.setWords(a)}`) +
      [
        'set',
        'set_id',
        'group',
        `${W.marked}_in_set`,
        'set_size',
        'fold_enrichment',
        'p',
        'q',
        'test',
        ...K.TAIL_HEAD,
      ].join('\t') +
      '\n' +
      tsvRows(aid, rows, (r) => [
        where ? where(r.category) : (A[aid].parents?.[r.category] || []).map((x) => labelOf(aid, x)).join('; '),
      ]) +
      '\n'
    );
  }

  // ---- a protein's own sets (website.protein.sets): a card per entry ----------------------------------------------
  const PCARDS = (D.protein_view?.sets || [])
    .map((c) => ({ ...c, analyses: c.analyses.filter((x) => A[x]) }))
    .filter((c) => c.analyses.length);
  K.inSetCards = (aid) => PCARDS.some((c) => c.analyses.includes(aid));
  const siteRows = {};
  const siteRow = (aid, s) =>
    (siteRows[aid] ||= new Map(K.rowsFor(A[aid], 'enricher').map((r) => [r.category, r]))).get(s);
  const pick = (aid, s, name) =>
    `<button class="linkish" type="button" data-f="p:${esc(aid)}" data-v="${esc(s)}" title="Select ` +
    `the ${esc(W.marks)} on proteins in it">${esc(name || labelOf(aid, s))}</button>`;
  const resText = (r) =>
    r ? `<span class="val ${r.dir}">${fxn(r.eff)}×</span> <span class="muted">q ${fq(r.q)}</span>` : '';
  // the protein's enriched terms grouped by the family that gathers them (website.protein.sets[].term_groups): the first family
  // of the list that holds a term names it, a term in none is "Other / unassigned"
  function termGroupsHtml(c, aid, mine, title, gene) {
    const enr = mine.filter((s) => enriched(siteRow(aid, s))).sort((x, y) => siteRow(aid, x).q - siteRow(aid, y).q);
    const famOf = new Map(),
      famAid = {};
    for (const f of (c.term_groups.families || []).filter((x) => A[x]?.gathers))
      Object.entries(A[f].gathers).forEach(([fam, ts]) => {
        famAid[fam] ||= f;
        ts.forEach((t) => {
          if (!famOf.has(t)) famOf.set(t, fam);
        });
      });
    const groups = new Map();
    enr.forEach((s) => {
      const g = famOf.get(s) || '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    });
    const order = [...groups.keys()].sort(
      (x, y) => (x === '') - (y === '') || groups.get(y).length - groups.get(x).length || x.localeCompare(y)
    );
    const ns = esc(asMembers(aid)?.nouns || 'sets');
    return (
      `<div class="kind">${title}<p class="note">${esc(gene)} is in ${int(mine.length)} of the tested ${ns}; ${int(enr.length)} of them ` +
      `are enriched across all ${esc(W.marked)} proteins${enr.length ? ', grouped by family:' : '.'}</p>` +
      order
        .map(
          (g) =>
            `<details class="dis-group"><summary>${
              g
                ? `<button class="linkish strong" type="button" ` +
                  `data-f="p:${esc(famAid[g])}" data-v="${esc(g)}" title="Select the ${esc(W.marks)} on the proteins of ` +
                  `this family">${esc(g)}</button>`
                : '<span class="strong">Other / unassigned</span>'
            } ` +
            (`<span class="muted">${int(groups.get(g).length)} ${
              groups.get(g).length === 1 ? 'term' : 'terms'
            }</span></summary>` +
              `<ul class="kind-list">${groups
                .get(g)
                .map((s) => `<li>${pick(aid, s)} ${idLink(aid, s)} ${resText(siteRow(aid, s))}</li>`)
                .join('')}</ul></details>`)
        )
        .join('') +
      '</div>'
    );
  }
  function proteinSetsHtml(c, p) {
    const sd = K.sel?.data();
    if (!sd) return '<p class="muted">Loading the sets…</p>';
    const gene = p.gene || p.acc;
    const blocks = c.analyses
      .filter((aid) => sd.protein_sets?.[aid])
      .map((aid) => {
        const a = A[aid],
          mine = sd.protein_sets[aid].sets.map(([s]) => s).filter((s) => K.sel.setHas(aid, s, p.i));
        const title = `<h4>${esc(a.title)} <span class="muted">${int(mine.length)}</span></h4>`;
        if (!mine.length)
          return (
            `<div class="kind">${title}<p class="muted">${esc(gene)} is in none of its tested ` + `sets.</p></div>`
          );
        if (a.parents) {
          // an ontology: the most specific sets first, then the enriched ones above
          const has = new Set(mine),
            kids = kidsOf(aid);
          const specific = mine
            .filter((s) => !(kids[s] || []).some((x) => has.has(x)))
            .sort((x, y) => labelOf(aid, x).localeCompare(labelOf(aid, y)));
          const up = mine
            .filter((s) => !specific.includes(s) && s !== a.root && enriched(siteRow(aid, s)))
            .sort((x, y) => siteRow(aid, x).q - siteRow(aid, y).q);
          const ns = ontologyOf(aid)?.nouns || 'sets';
          return (
            `<div class="kind">${title}<p class="muted small">Most specific ${esc(ns)}:</p><ul ` +
            `class="kind-list">${specific
              .map(
                (s) =>
                  `<li>${pick(aid, s)} ${idLink(aid, s)}${
                    enriched(siteRow(aid, s)) ? ' <span class="qv-tag">enriched</span>' : ''
                  }</li>`
              )
              .join('')}</ul>` +
            (up.length
              ? `<p class="note">Enriched broader ${esc(ns)} that include ${esc(gene)}: ${up
                  .slice(0, 10)
                  .map((s) => pick(aid, s))
                  .join(', ')}${up.length > 10 ? ` and ${int(up.length - 10)} more` : ''}.</p>`
              : '') +
            '</div>'
          );
        }
        if (a.gathers) {
          // families: each with how many of its tested member sets name the protein
          const mem = membersOf(aid),
            m = mem && A[mem.analysis];
          return `<div class="kind">${title}<ul class="kind-list">${mine
            .map((f) => {
              const r = siteRow(aid, f),
                own = a.gathers[f] || [];
              const named = m ? own.filter((s) => K.sel.setHas(m.id, s, p.i)) : [],
                nEnr = named.filter((s) => enriched(siteRow(m.id, s))).length;
              const ns = esc(mem?.nouns || 'sets');
              return `<li>${pick(aid, f)} ${resText(r)}${
                m
                  ? ` <span class="muted">· ${
                      named.length
                        ? `in ${int(named.length)} of its ${int(own.length)} tested ${ns}, ${
                            nEnr ? int(nEnr) + ' enriched' : 'none enriched'
                          }`
                        : `in none of its ${int(own.length)} tested ${ns} (only in ${ns} too small ` +
                          `or too large to test)`
                    }</span>`
                  : ''
              }</li>`;
            })
            .join('')}</ul></div>`;
        }
        if (c.term_groups?.terms === aid) return termGroupsHtml(c, aid, mine, title, gene);
        const enr = mine.filter((s) => enriched(siteRow(aid, s))).sort((x, y) => siteRow(aid, x).q - siteRow(aid, y).q),
          key = 'psets:' + aid,
          all = UI.all.has(key);
        const ns = esc(asMembers(aid)?.nouns || 'sets');
        return (
          `<div class="kind">${title}<p class="note">${esc(gene)} is in ${int(mine.length)} of the tested ${ns}; ${int(enr.length)} of them ` +
          `are enriched across all ${esc(W.marked)} proteins${enr.length ? ':' : '.'}</p>` +
          (enr.length
            ? `<ul class="kind-list">${(all ? enr : enr.slice(0, 10))
                .map((s) => `<li>${pick(aid, s)} ${idLink(aid, s)} ${resText(siteRow(aid, s))}</li>`)
                .join('')}</ul>` +
              (enr.length > 10
                ? `<button class="linkish" type="button" data-qallm="${esc(key)}">${all ? 'Fewer' : `All ${int(enr.length)}`}</button>`
                : '')
            : '') +
          '</div>'
        );
      })
      .join('');
    return (
      `<div class="kinds qv-psets">${blocks}</div><p class="note">Each result is for all ${esc(W.marked)} proteins ` +
      `against the background, not for this protein. A name selects the ${esc(W.marks)} on its proteins, and ↗ ` +
      `opens the set’s page.</p>`
    );
  }
  // a card may take an id of its own (the explorer's p-dis), and its module's live parts before its sets (K.setsLive: kit-pcards.js)
  const cardId = (c, k) => c.id || `p-sets-${k}`;
  K.proteinFolds = [
    ...(K.proteinFolds || []),
    ...PCARDS.map(
      (c, k) => (p, rec, fold) =>
        fold(
          cardId(c, k),
          esc(c.title),
          K.setsLive?.sum(c, p) ?? esc(c.summary || ''),
          (K.setsLive?.html(c, p) || '') + proteinSetsHtml(c, p),
          false
        )
    ),
  ];
  K.proteinFoldSections = [...(K.proteinFoldSections || []), ...PCARDS.map((c, k) => [cardId(c, k), c.title, 1])];

  // ---- events --------------------------------------------------------------------------------------------------------
  const flip = (set, k) => {
    if (set.has(k)) set.delete(k);
    else set.add(k);
    K.render();
  };
  K.clicks.push(
    ['[data-qmore]', (el) => flip(UI.more, el.dataset.qmore)],
    ['[data-qmembers]', (el) => flip(UI.members, el.dataset.qmembers)],
    ['[data-qtree]', (el) => flip(UI.tree, el.dataset.qtree)],
    ['[data-qlevel]', (el) => flip(UI.level, el.dataset.qlevel)],
    ['[data-qtable]', (el) => flip(UI.table, el.dataset.qtable)],
    ['[data-qallm]', (el) => flip(UI.all, el.dataset.qallm)],
    [
      '[data-qpickto]',
      (el) => {
        UI.pick[el.dataset.qpickto] = el.dataset.v;
        UI.all.delete(el.dataset.qpickto);
        K.render();
      },
    ],
    // a set picked in a table selects it and returns to the Overview, where every question is tested again
    [
      '[data-qf]',
      (el) => {
        S.f = { ...S.f, [el.dataset.qf]: [el.dataset.qv] };
        S.arg = '';
        K.writeHash(true);
        K.render();
        scrollTo(0, 0);
      },
    ],
    [
      '[data-qoexp]',
      (el) => {
        const a = A[el.dataset.qaid];
        K.exportFigure(
          el.dataset.qoexp,
          () => ontologyFigure(a),
          fileName(a.id, UI.tree.has(a.id) ? 'tree' : 'short_list'),
          el,
          () => ontologyTsv(a)
        );
      },
    ],
    [
      '[data-qotexp]',
      (el) => {
        const aid = el.dataset.qaid,
          title = `${A[aid].title}, the table`;
        K.tableExport(
          el.dataset.qotexp,
          el,
          el.closest('.qv-members') || document.body,
          { title, sub: A[aid].question || '' },
          fileName(aid, 'table'),
          () => tableTsv(aid, LAST[aid + ':table'] || [], null, title)
        );
      },
    ],
    [
      '[data-qmexp]',
      (el) => {
        const L = LAST[el.dataset.qaid + ':members'];
        if (L)
          K.tableExport(
            el.dataset.qmexp,
            el,
            el.closest('.qv-members') || document.body,
            { title: `${L.m.title}, by family`, sub: A[L.m.id]?.question || '' },
            fileName(L.m.id, 'table'),
            () => tableTsv(L.m.id, L.rows, L.where, `${L.m.title}, by family`)
          );
      },
    ]
  );
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset?.qpick != null) {
      UI.pick[t.dataset.qpick] = t.value;
      UI.all.delete(t.dataset.qpick);
      K.render();
    }
    if (t.dataset?.qevery != null) {
      if (t.value === '1') UI.every.add(t.dataset.qevery);
      else UI.every.delete(t.dataset.qevery);
      K.render();
    }
  });
});
