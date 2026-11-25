/* Sites: every mark of the selection in one table, as the Methylarginine Site Explorer's Sites page. Fixed columns (the
   protein, the site as papers number it with its tags, the colored attribute, the 15 residues around it with its
   motifs) and the site file's optional ones in a Columns menu (website.sites.table, else the protein page's
   website.protein.table.columns): attributes, questions' classes, and the site card's blocks read from the tables of
   website.tables (interaction evidence with its chips, whose click opens what the tables say; RNA and DNA contacts with
   a hover; perturbation calls; the nearest mark). Above it "Your selection", Enriched features and quick filters; below
   it how to cite the marks shown. The marks the site shows and counts nowhere (kit-shown.js) are rows of their own,
   tagged, behind a toggle that is on; they never change the number of marks or the selection. A row opens the mark's card on its protein's page; a header sorts (numbers and
   statuses first descending, missing values last). The download has the columns website.sites.download names. A
   module of the site kit; the shared parts are K.tables (kit-tables.js). */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  if (!D.proteins || !D.proteins.length) return;
  const SPECS = D.attribute_specs || {},
    SV = D.sites_view || {},
    CC = D.protein_view?.card || {};
  const T = { sort: SV.sort?.by || 'protein', desc: !!SV.sort?.desc, n: 100, key: null, shown: true }; // website.sites.sort: the site's first order
  const SD = () => K.sel.data();
  const META = () => K.sel.meta(); // without the marks: the core until they are all in
  const AN = () => META().analyses;
  const pr = (i) => K.tables.P[i];
  const vals = (m, n) => K.tables.vals(m, n);
  K.density.defaults.sites = 'comfortable'; // wrapped rows, as the explorer's table; a reader's choice wins
  const quickAttrs = () =>
    Object.keys(SPECS).filter(
      (n) =>
        SPECS[n].colour &&
        (SV.quick ? SV.quick.includes(n) && ['category', 'list'].includes(SPECS[n].kind) : SPECS[n].kind === 'category')
    ); // website.sites.quick (a colored attribute of one value or of several per site), else every colored one-value attribute
  // the attribute the State column shows and the map colors by: website.sites.state, else the first colored one-value attribute
  const colourAttr =
    (SV.state && SPECS[SV.state] ? SV.state : null) ||
    Object.keys(SPECS).find((n) => SPECS[n].colour && SPECS[n].kind === 'category') ||
    null;
  // the State cell: a dot and the short label of each value the site has (a site can carry several states)
  const stateCell = (vs) =>
    (vs.length ? vs : [''])
      .map(
        (v) =>
          `<span class="sdot" title="${esc(K.sel.valueLabel(colourAttr, v))}"><i style="--c:${K.map.attrColour(colourAttr, v)}"></i>${esc(short(colourAttr, v))}</span>`
      )
      .join(' ');
  const short = (n, v) => (SV.short?.[n] || {})[v] ?? K.sel.valueLabel(n, v);
  const tagAids = () => AN().filter((a) => A[a]?.shape === 'flags' && (!SV.tags || SV.tags[a])); // the site file's, else every flags question
  const siteName = (p, pos, m) => (K.prot?.siteLabel ? K.prot.siteLabel(p.acc, pos) : `${m ? K.markRes(m) : ''}${pos}`);
  const dash = '<span class="muted">—</span>';

  // ---- each protein's tables (website.tables), loaded as rows need them -------------------------------------------
  const TB = {},
    WAIT = new Set();
  let redraw = 0,
    defAsked = false;
  const again = () => {
    if (!redraw)
      redraw = requestAnimationFrame(() => {
        redraw = 0;
        if (S.view === 'sites') {
          const y = scrollY;
          K.render();
          scrollTo(0, y);
        }
      });
  };
  function need(acc) {
    if (TB[acc] !== undefined || WAIT.has(acc) || !K.card) return;
    WAIT.add(acc);
    K.card.load(acc).then((tb) => {
      TB[acc] = tb || {};
      WAIT.delete(acc);
      again();
    });
  }
  // the default columns' blocks read one small file for all the proteins (K.card.compact), once
  const covered = (c) => {
    const cp = K.card?.compact;
    return !!cp && (c.show || []).every((k) => k === 'nearest' || cp.blocks.includes(k));
  };
  const defTb = (acc) => {
    if (!defAsked) {
      defAsked = true;
      K.card.loadDefault().then(again);
    }
    return K.card.defaultTb(acc);
  };
  const ctxOf = (m, tb0) => {
    const p = pr(m[0]),
      tb = tb0 || TB[p.acc] || {};
    return {
      p,
      m,
      tb,
      acc: p.acc,
      pos: m[1],
      gene: K.tables.pLabel(p),
      label: siteName(p, m[1]),
      seq: '',
      window: m[4],
      rec: { marks: [] },
      shown: (q) => (K.prot?.shownPos ? K.prot.shownPos(p.acc, q) : q),
      attr: (n) => K.tables.attrStr(m, n),
      attrHtml: (n, v) => K.sel.listHtml(n, [v], [], p.acc, true),
      isListed: () => true,
    };
  };
  // the nearest other mark of the protein
  const nearest = (m) => {
    let b = null;
    const mine = K.sel.peek() ? K.tables.byProt()[m[0]].map((i) => SD().marks[i]) : K.seld.marksOf([m[0]]) || [];
    mine.forEach((x) => {
      const q = x[1];
      if (q !== m[1] && (b == null || Math.abs(q - m[1]) < b)) b = Math.abs(q - m[1]);
    });
    return b;
  };

  // ---- the window: the site boxed, the mark's residues bold, residues the site file colors, '·' past the ends ------
  const RES = new Set(D.residues || []),
    WCOL = SV.window?.colours || {};
  function winHtml(m) {
    const w = m[4] || '',
      c = Math.floor(w.length / 2);
    return `<span class="win swin">${[...w]
      .map((ch, j) => {
        if (j === c) return `<b class="wc">${esc(ch)}</b>`;
        if (ch === '_' || ch === '-' || ch === ' ') return '<span class="gap">·</span>';
        const off = j - c,
          attrs = ` data-wr="${m[0]}/${m[1] + off}"`;
        if (RES.has(ch)) return `<b class="wr"${attrs}>${esc(ch)}</b>`;
        return WCOL[ch] ? `<span style="color:${esc(WCOL[ch])}"${attrs}>${esc(ch)}</span>` : esc(ch);
      })
      .join('')}</span>`;
  }
  const flagTags = (aid, m) => {
    const cfg = SV.tags?.[aid] || {},
      hide = new Set(cfg.hide || []),
      order = cfg.order || [];
    const cs = K.tables
      .classes(m, aid)
      .filter((x) => !hide.has(x))
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    return cs
      .map(
        (x) => `<span class="tag" title="${esc((A[aid]?.help || {})[x] || '')}">${esc(K.sel.classLabel(aid, x))}</span>`
      )
      .join('');
  };

  // ---- the columns ------------------------------------------------------------------------------------------------
  const SITE_TAGS = SV.site_tags || null;
  const fixed = () => [
    {
      id: 'protein',
      label: 'Protein',
      text: true,
      key: (m) => K.tables.pLabel(pr(m[0])).toLowerCase(),
      cell: (m) => {
        const p = pr(m[0]);
        return (
          `<a class="gene" href="${esc(K.link('protein', p.acc))}">${esc(K.tables.pLabel(p))}</a><span ` +
          `class="acc mono">${esc(p.acc)}</span>`
        );
      },
    },
    {
      id: 'site',
      label: 'Site',
      text: true,
      key: (m) => m[1],
      cell: (m) => {
        const p = pr(m[0]),
          num = K.prot?.numbering?.(p.acc),
          tg = SITE_TAGS ? vals(m, SITE_TAGS.attribute).filter((v) => (SITE_TAGS.values || {})[v]) : [];
        return (
          `<a class="mono" href="${esc(
            K.link('protein', p.acc + '/' + m[1])
          )}"><b>${esc(siteName(p, m[1], m))}</b></a>${
            num ? `<span class="acc">` + `UniProt ${esc(K.markRes(m))}${m[1]}</span>` : ''
          }` +
          (LC && K.shown.counted(raw(m)) ? `<div class="tags">${K.shown.tag(raw(m), false)}</div>` : '') +
          (tg.length
            ? `<div class="tags">${tg
                .map(
                  (v) =>
                    `<span class="tag t-flag" title="${esc(
                      K.sel.valueLabel(SITE_TAGS.attribute, v)
                    )}">${esc(SITE_TAGS.values[v])}</span>`
                )
                .join('')}</div>`
            : '')
        );
      },
    },
    ...(colourAttr
      ? [
          {
            id: 'state',
            label: SV.state_label || 'State',
            key: (m) => {
              const o = Object.keys(SPECS[colourAttr].values || {}),
                v = vals(m, colourAttr)[0] ?? '';
              const k = o.indexOf(v);
              return v === '' ? null : k < 0 ? 0 : o.length - k;
            },
            cell: (m) => stateCell(vals(m, colourAttr)),
          },
        ]
      : []),
    {
      id: 'window',
      label: `Sequence (±7 residues)${
        tagAids().length
          ? ' · ' +
            (SV.window?.label ||
              // the tags' titles, each once, two at most (the rest are in the column's title)
              ((t) => t.slice(0, 2).join(', ') + (t.length > 2 ? ` +${t.length - 2}` : ''))([
                ...new Set(tagAids().map((a) => (A[a]?.title || a).toLowerCase())),
              ]))
          : ''
      }`,
      text: true,
      key: (m) => m[4] || null,
      cls: 'cwin',
      cell: (m) =>
        `<span class="mono">${winHtml(m)}</span>${tagAids()
          .map((a) => {
            const t = flagTags(a, m);
            return t ? `<div class="tags ` + `win-mot">${t}</div>` : '';
          })
          .join('')}`,
    },
  ];
  // optional columns: the site file's (website.sites.table), else the protein page's sites table's, else the attributes
  // it colors or links and its first question with classes
  const PROT_ONLY = new Set(['plddt']);
  const BLOCKS = new Set([
    'status',
    'tags',
    'sequences',
    'around',
    'calls',
    'states',
    'changes',
    'nearest_domain',
    'nearest',
    'writer',
  ]);
  const isWriter = (c) => (c.show || []).length === 1 && c.show[0] === 'writer';
  function optCols() {
    let cs = SV.table || D.protein_view?.table?.columns || null;
    if (!cs) {
      const named = (SV.attributes || []).filter((n) => SPECS[n]),
        attrs = named.length
          ? named
          : Object.keys(SPECS).filter(
              (n) => n !== colourAttr && (SPECS[n].colour || (SPECS[n].kind === 'list' && SPECS[n].link))
            );
      const ctx = (SV.columns || []).filter((a) => A[a]);
      const ctxs = ctx.length
        ? ctx
        : D.analyses
            .filter((a) => a.shape === 'class')
            .slice(0, 1)
            .map((a) => a.id);
      cs = [
        ...attrs.map((n) => ({ id: 'a:' + n, label: SPECS[n].label, attribute: n, default: true })),
        ...ctxs.map((a) => ({ id: 'q:' + a, label: A[a]?.title || a, analyses: [a], default: true })),
      ];
    }
    // the writers, on every site: the records' writers (where the site file names writer groups), then those UniProt
    // names in the residue's text (read for the rows shown). A site file's own entry (show: [writer]) sets its place and default.
    if (!cs.some(isWriter))
      cs = [
        ...cs,
        {
          id: 'writer',
          label: 'Writer (UniProt)',
          menu: 'Writers: the records’ writers, then those UniProt names for the residue',
          show: ['writer'],
          hide: 'sm',
        },
      ];
    // the 3D column, on every site: opens the structure at the site (the viewer of the protein page)
    cs = [...cs.filter((c) => c.id !== 'view3d'), { id: 'view3d', label: '3D', view3d: true, default: true }];
    return cs.filter((c) =>
      c.view3d
        ? typeof K.show3d === 'function'
        : c.attribute
          ? SPECS[c.attribute] && c.attribute !== colourAttr
          : c.analyses
            ? c.analyses.every((a) => A[a])
            : (c.show || []).some((k) => BLOCKS.has(k) && !PROT_ONLY.has(k))
    );
  }
  // ---- the writer column: UniProt's "Modified residue" features, one small request per protein, for the rows shown only ------
  const WU = {},
    WUQ = [];
  let wuBusy = 0;
  function wuNext() {
    while (wuBusy < 6 && WUQ.length) {
      const acc = WUQ.shift();
      wuBusy++;
      fetch(`https://rest.uniprot.org/uniprotkb/${encodeURIComponent(acc)}?fields=ft_mod_res&format=json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(
          (j) => {
            const by = new Map();
            for (const f of j.features || []) {
              const a = f.location?.start?.value;
              if (f.type === 'Modified residue' && a != null && a === f.location?.end?.value) {
                if (!by.has(a)) by.set(a, []);
                by.get(a).push(f);
              }
            }
            WU[acc] = by;
          },
          () => (WU[acc] = new Map())
        )
        .then(() => {
          wuBusy--;
          wuNext();
          again();
        });
    }
  }
  function writerHtml(m, quiet) {
    const p = pr(m[0]),
      acc = p.acc;
    if (WU[acc] === undefined) {
      if (quiet) return null;
      if (!WUQ.includes(acc)) {
        WUQ.push(acc);
        wuNext();
      }
      return null;
    }
    let tb = {};
    if (K.card.hasWriterRecords?.()) {
      if (TB[acc] === undefined) {
        if (!quiet) need(acc);
        return null;
      }
      tb = TB[acc];
    }
    return K.card.summaryItems(ctxOf(m, tb), { uni: WU[acc].get(m[1]) || [] }).writer?.[1] || '';
  }
  const WAITS = new Set(['sequences', 'around', 'calls', 'states', 'changes', 'nearest_domain']); // blocks drawn once the tables are in
  // a block's sort: the site file's attributes (sort), else those the blocks read: a status's order, then how many values
  const EV = CC.evidence || {},
    CL = CC.calls || {};
  const sortAttrs = (c) =>
    c.sort
      ? [].concat(c.sort)
      : [
          ...new Set(
            (c.show || [])
              .flatMap((k) =>
                k === 'status'
                  ? [EV.status]
                  : k === 'tags'
                    ? [EV.tags?.attribute]
                    : k === 'calls'
                      ? Object.keys(CL.attributes || {})
                      : []
              )
              .filter((n) => SPECS[n])
          ),
        ];
  const skip = new Set([...(CL.skip || []), '', 'none']);
  function rank(m, names) {
    let r = 0,
      any = false;
    names.forEach((n, k) => {
      const s = SPECS[n] || {},
        vs = vals(m, n),
        w = Math.pow(100, names.length - 1 - k);
      if (s.kind === 'category' && Object.keys(s.values || {}).length) {
        const o = Object.keys(s.values),
          i = o.indexOf(vs[0] ?? '');
        if (vs[0] !== '' && vs[0] != null) any = true;
        r += (i < 0 ? 0 : o.length - i) * w;
        return;
      }
      const xs = vs.filter((v) => !skip.has(v) && !skip.has(String(v).split(':').pop()));
      if (xs.length) any = true;
      r += xs.reduce((t, v) => t + ((CL.marks || {})[String(v).split(':').pop()] ? 2 : 1), 0) * w;
    });
    return any ? r : null;
  }
  function optCell(c, m) {
    if (c.view3d)
      return m.lc
        ? dash
        : `<button type="button" class="btn small" data-sites-3d="${esc(pr(m[0]).acc)}/${m[1]}" ` +
            `title="Show ${esc(siteName(pr(m[0]), m[1], m))} in the 3D structure">3D</button>`;
    if (c.attribute) {
      const s = SPECS[c.attribute],
        v = vals(m, c.attribute);
      if (s.kind === 'category' && s.colour)
        return `<span class="sdot"><i style="--c:${K.map.attrColour(
          c.attribute,
          v[0] ?? ''
        )}"></i>${esc(short(c.attribute, v[0] ?? ''))}</span>`;
      if (s.kind === 'list') {
        // the original's chips: two at most, one per line, then "+n" (all on hover)
        const xs = v.filter(Boolean),
          links = META().attribute_links?.[c.attribute] || {},
          shown = xs.slice(0, 2);
        return xs.length
          ? `<div class="tags src-tags">${shown
              .map((x) => {
                const h = K.sel.listHtml(c.attribute, [x], [links[x]], pr(m[0]).acc, false);
                return h.startsWith('<a ') ? h : `<span>${h}</span>`;
              })
              .join('')}${
              xs.length > 2
                ? `<span class="tag ` +
                  `more" title="${esc(
                    xs
                      .slice(2)
                      .map((x) => short(c.attribute, x))
                      .join('\n')
                  )}">+${xs.length - 2}</span>`
                : ''
            }</div>`
          : dash;
      }
      return v.filter((x) => x !== '').length ? esc(v.map((x) => short(c.attribute, x)).join(', ')) : dash;
    }
    if (c.analyses)
      return c.analyses
        .map(
          (a, k) =>
            `<span class="${k ? 'muted' : ''}" title="${esc(
              K.tables
                .classes(m, a)
                .map((x) => (A[a]?.help || {})[x] || '')
                .filter(Boolean)
                .join('; ')
            )}">${esc(
              K.tables
                .classes(m, a)
                .map((x) => K.sel.classLabel(a, x))
                .join(', ')
            )}</span>`
        )
        .join('<br>');
    if ((c.show || []).length === 1 && c.show[0] === 'nearest') {
      const n = nearest(m);
      return n == null ? dash : `${int(n)} aa`;
    }
    if (isWriter(c)) {
      const h = writerHtml(m);
      return h == null ? '<span class="muted">…</span>' : h || dash;
    }
    const p = pr(m[0]);
    let dtb;
    if (covered(c)) {
      dtb = defTb(p.acc);
      if (!dtb && c.show.some((k) => WAITS.has(k) || k === 'tags')) return '<span class="muted">…</span>';
    } else if (TB[p.acc] === undefined) {
      need(p.acc);
      if (c.show.some((k) => WAITS.has(k))) return '<span class="muted">…</span>';
    }
    const ctx = ctxOf(m, dtb),
      h = c.show
        .map((k) => {
          if (k === 'nearest') {
            const n = nearest(m);
            return n == null ? '' : `${int(n)} aa`;
          }
          if (k === 'nearest_domain') return nearestDomain(ctx);
          if (k === 'status') {
            const v = vals(m, EV.status)[0] ?? '',
              b = K.card.badge(ctx),
              l = K.sel.valueLabel(EV.status, v),
              t = short(EV.status, v);
            return t === l ? b : b.replace(esc(l), esc(t));
          } // the short label of website.sites.short
          if (!K.card[k]) return '';
          if (K.density.compact()) {
            if (k === 'tags') return K.card.tags(ctx, -1);
            if (k === 'calls') return K.card.calls(ctx, true);
            if (k === 'sequences') {
              const ws = K.card.windowsOf(ctx) || [];
              return ws.length
                ? `<span class="tag t-a ` +
                    `more" title="${esc(
                      ws
                        .map((w) => w.names[0] || '')
                        .filter(Boolean)
                        .join('\n')
                    )}">${ws.length} bound</span>`
                : '';
            }
            if (k === 'around') return K.card.around(ctx, 'brief');
          }
          return k === 'tags'
            ? K.card.tags(ctx, 4)
            : k === 'sequences' || k === 'around' || k === 'states'
              ? K.card[k](ctx, true)
              : K.card[k](ctx);
        })
        .join('');
    const tip = c.show.some((k) => k === 'sequences' || k === 'around') ? ` data-na-tip="${m[0]}/${m[1]}"` : '';
    return h ? `<div class="cv"${tip}>${h}</div>` : dash;
  }
  function nearestDomain(c) {
    const nd = D.protein_view?.table?.nearest_domain;
    if (!nd || !K.card.has(nd.table)) return '';
    const r = K.card.at(c.tb, nd.table, c.pos)[0];
    if (!r || !r[nd.name]) return '';
    return `${esc(r[nd.name])}<br><span class="muted">${
      r[nd.distance] === '0'
        ? esc((nd.sides || {}).inside || 'inside')
        : `${esc(r[nd.distance])} aa ${esc((nd.sides || {})[r[nd.side]] || r[nd.side] || '')}`
    }</span>`;
  }
  function optKey(c, m) {
    if (c.view3d) return null;
    if (c.attribute) {
      const s = SPECS[c.attribute],
        v = vals(m, c.attribute).filter((x) => x !== '');
      if (!v.length) return null;
      if (s.kind === 'list') return v.length;
      if (s.kind === 'number') return Math.max(...v.map(Number));
      return rank(m, [c.attribute]);
    }
    if (c.analyses)
      return (
        K.tables
          .classes(m, c.analyses[0])
          .map((x) => K.sel.classLabel(c.analyses[0], x))
          .join(' ') || null
      );
    if ((c.show || []).includes('nearest')) return nearest(m);
    if (isWriter(c)) return writerHtml(m, true)?.replace(/<[^>]*>/g, '') || null;
    const names = sortAttrs(c);
    return names.length ? rank(m, names) : null;
  }
  const optText = (c) => !!c.analyses || isWriter(c);

  // ---- the marks shown and counted nowhere (K.shown, website.shown_marks): rows of their own, after a toggle that is
  // on where there are any; never in the selection, its counts or the sites' number -------------------------------------
  const LC = !!K.shown?.on,
    PI = Object.fromEntries(K.tables.P.map((p) => [p.acc, p]));
  const lcOn = () => LC && T.shown && !K.sel.active();
  // a row [accession, position, window, values] as a row of this table: [protein index, position, [], [], window]
  // with its own protein (one with only these has none in the list) and its mark as a protein record lays it out
  const LCROWS = LC
    ? K.shown.rows().map((r) => {
        const m = [PI[r[0]] ? PI[r[0]].i : 1e9, r[1], [], [], r[2]];
        m.lc = { p: PI[r[0]] || K.shown.protein(r[0]) || { acc: r[0], gene: '', name: '' }, mk: K.shown.asMark(r) };
        return m;
      })
    : [];
  const lcVals = (m, n) => {
    const v = String(K.cols.markAttr(m.lc.mk, n) ?? '');
    return v === '' ? [] : SPECS[n]?.kind === 'list' ? v.split(SPECS[n].separator || '; ') : [v];
  };
  function lcCell(c, m) {
    const p = m.lc.p;
    if (c.id === 'protein')
      return (
        `<a class="gene" href="${esc(K.link('protein', p.acc))}">${esc(K.tables.pLabel(p))}</a><span ` +
        `class="acc mono">${esc(p.acc)}</span>`
      );
    if (c.id === 'site')
      return (
        `<a class="mono" href="${esc(K.link('protein', p.acc + '/' + m[1]))}"><b>${esc(
          K.prot?.siteLabel ? K.prot.siteLabel(p.acc, m[1]) : `${K.markRes(m)}${m[1]}`
        )}</b></a><div ` +
        `class="tags">${K.shown.tag(m.lc.mk, true)}</div><span class="acc">${esc(K.shown.row())}</span>`
      );
    if (c.id === 'state') {
      return stateCell(lcVals(m, colourAttr));
    }
    if (c.id === 'window') {
      const w = m[4] || '',
        k = Math.floor(w.length / 2);
      return (
        `<span class="mono"><span ` +
        `class="win swin">${esc(w.slice(0, k)).replace(/[_-]/g, '·')}<b class="wc">${esc(w[k] || '')}</b>${esc(
          w.slice(k + 1)
        ).replace(/[_-]/g, '·')}</span></span>`
      );
    }
    if (c.attribute) {
      const sp = SPECS[c.attribute],
        v = lcVals(m, c.attribute);
      if (!v.length) return dash;
      if (sp.kind === 'category' && sp.colour)
        return `<span class="sdot"><i style="--c:${K.map.attrColour(c.attribute, v[0])}"></i>${esc(short(c.attribute, v[0]))}</span>`;
      return esc(v.map((x) => short(c.attribute, x)).join(', '));
    }
    return dash;
  }
  function lcKey(c, m) {
    if (c.id === 'protein') return K.tables.pLabel(m.lc.p).toLowerCase();
    if (c.id === 'site') return m[1];
    if (c.id === 'window') return m[4] || null;
    if (c.id === 'state') {
      const o = Object.keys(SPECS[colourAttr]?.values || {}),
        v = lcVals(m, colourAttr)[0] ?? '';
      const k = o.indexOf(v);
      return v === '' ? null : k < 0 ? 0 : o.length - k;
    }
    if (c.attribute) {
      const v = lcVals(m, c.attribute);
      return v.length ? v.join(' ') : null;
    }
    return null;
  }
  const cellOf = (c, m) => (m.lc ? lcCell(c, m) : c.cell(m));
  // a counted mark of the selection as a protein record lays it out (its attribute values as text), for its tag
  const raw = (m) => [m[1], m[4], [], (D.mark_attributes || []).map((n) => K.tables.attrStr(m, n))];
  // the line under the sites' number: how many more are shown, and the toggle
  const lcLine = () =>
    LC
      ? `<p class="cx lc-line"><label class="vswitch" title="${esc(K.shown.cfg.help || '')}"><input ` +
        `type="checkbox" data-sites-shown${T.shown ? ' checked' : ''}${K.sel.active() ? ' disabled' : ''}> Show ${int(K.shown.n())} more: ${esc(K.shown.row())}${
          K.sel.active() ? ' (not with a selection)' : ''
        }</label></p>`
      : '';

  // ---- the rows ---------------------------------------------------------------------------------------------------
  function allCols() {
    const opt = optCols(),
      defaults = opt.filter((c) => c.default).map((c) => c.id),
      on = new Set(K.columns.on('sites', opt, defaults));
    return {
      opt,
      defaults,
      shown: [
        ...fixed(),
        ...opt
          .filter((c) => on.has(c.id))
          .map((c) => ({
            ...c,
            opt: true,
            text: optText(c),
            key: (m) => optKey(c, m),
            cell: (m) => optCell(c, m),
            cls: c.show?.includes('nearest') && c.show.length === 1 ? 'num' : '',
          })),
      ],
    };
  }
  function rows(cols) {
    const c = K.sel.compute(),
      idx = c.active ? c.marks : SD().marks.map((_, i) => i);
    const col = cols.find((x) => x.id === T.sort) || cols[0],
      out = [...idx.map((i) => SD().marks[i]), ...(lcOn() ? LCROWS : [])],
      key = new Map(out.map((m) => [m, m.lc ? lcKey(col, m) : col.key(m)]));
    out.sort((x, y) => {
      const a = key.get(x),
        b = key.get(y);
      if (a == null || b == null) {
        if (a != null) return -1;
        if (b != null) return 1;
      } else {
        const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
        if (r) return T.desc ? -r : r;
      }
      return String(pr(x[0])?.gene || '').localeCompare(String(pr(y[0])?.gene || '')) || x[0] - y[0] || x[1] - y[1]; // then by gene
    });
    return K.hl ? K.hl.firstSort(out, (m) => !m.lc && K.hl.isSite(m[0], m[1])) : out;
  }

  // ---- quick filters: the attributes the site colors by, with their counts in the selection ----------------------
  function quick(lazy) {
    // before the marks are all in (the first page), the counts over every mark come with the core
    const c = lazy ? null : K.sel.compute(),
      idx = lazy ? null : c.active ? c.marks : SD().marks.map((_, i) => i),
      nAll = lazy ? K.seld.core().parts.n_marks : idx.length,
      AT = META().attribute_names || Object.keys(META().attributes);
    return quickAttrs()
      .map((n) => {
        const ti = AT.indexOf(n),
          counts = {};
        if (lazy) (K.seld.attrCounts(n) || []).forEach((k, v) => (counts[v] = k));
        else
          idx.forEach((i) =>
            SD().marks[i][3][ti].forEach((k) => {
              counts[k] = (counts[k] || 0) + 1;
            })
          );
        const on = new Set(S.f['t:' + n] || []),
          order = Object.keys(SPECS[n].values || {});
        const vs = META()
          .attributes[n].map((v, k) => [v, counts[k] || 0])
          .sort((x, y) => (order.indexOf(x[0]) + 1 || 99) - (order.indexOf(y[0]) + 1 || 99));
        return (
          `<div class="quick"><span class="flabel">${esc(SPECS[n].label)}</span><button type="button" ` +
          `class="fchip" data-f-all="t:${esc(n)}" aria-pressed="${!on.size}">All <span class="muted">${int(nAll)}</span></button>` +
          vs
            .map(
              ([v, k]) =>
                `<button type="button" class="fchip" data-f="t:${esc(n)}" data-v="${esc(v)}" aria-pressed="${on.has(v)}"${k || on.has(v) ? '' : ' disabled'}${
                  SPECS[n].help ? ` title="${esc(SPECS[n].help)}"` : ''
                }><i class="ixd" ` +
                `style="--c:${K.map.attrColour(n, v)}"></i>${esc(K.sel.valueLabel(n, v))} <span class="muted">${int(k)}</span></button>`
            )
            .join('') +
          '</div>'
        );
      })
      .join('');
  }

  // ---- the page ---------------------------------------------------------------------------------------------------
  // ---- the first page, before the marks are all in ----------------------------------------------------------------------
  // With no selection and the table in its first order (by protein), the first page is the marks of its first proteins,
  // from the files that hold them (kit-seldata.js); the whole selection is read when the table is sorted another way,
  // filtered, downloaded or cited.
  const lazyAsked = () =>
    !K.sel.peek() && !K.seld.inline && !K.sel.active() && T.sort === 'protein' && !T.desc && !lcOn() && !K.hl?.any();
  let LZ = null;
  const lazyOrder = () =>
    (LZ ||= K.tables.P.map((p, i) => i)
      .filter((i) => K.seld.shardOf(i) >= 0)
      .sort((a, b) => {
        const x = K.tables.pLabel(pr(a)).toLowerCase(),
          y = K.tables.pLabel(pr(b)).toLowerCase();
        return x.localeCompare(y) || String(pr(a).gene || '').localeCompare(String(pr(b).gene || '')) || a - b;
      }));
  function lazyRows() {
    const ord = lazyOrder();
    let n = 0,
      k = 0;
    while (k < ord.length && n < T.n) n += pr(ord[k++]).marks || 1;
    for (;;) {
      const got = K.seld.marksOf(ord.slice(0, k));
      if (!got) return null;
      if (got.length >= T.n || k >= ord.length) {
        const by = new Map(ord.slice(0, k).map((p, j) => [p, j]));
        return got.sort((a, b) => by.get(a[0]) - by.get(b[0]) || a[1] - b[1]).slice(0, T.n);
      }
      k = Math.min(ord.length, k + 10);
    }
  }
  const loadingView = () => `<div class="page-head"><h2>Sites</h2></div>${K.loading(`Loading the ${W.marks}…`)}`;
  function view() {
    if (T.key !== K.tables.selKey()) {
      T.key = K.tables.selKey();
      T.n = 100;
    }
    const lz = lazyAsked();
    let rs, shown, counted, total, np;
    if (lz) {
      const core = K.seld.core();
      if (!core) return loadingView();
      shown = rs = lazyRows();
      if (!rs) return loadingView();
      total = core.parts.n_marks;
      np = core.parts.n_proteins;
    } else {
      if (!SD()) return loadingView();
    }
    const { opt, defaults, shown: cols } = allCols();
    if (!lz) {
      rs = rows(cols);
      shown = rs.slice(0, T.n);
      counted = rs.filter((m) => !m.lc);
      total = rs.length;
      np = new Set(counted.map((m) => m[0])).size;
    }
    const head =
      `<div class="page-head results-head"><div><h2>Sites</h2><p class="cx">${int(lz ? total : counted.length)} of ${int(lz ? total : SD().marks.length)} ${esc(W.marks)} on ${int(np)} protein${np === 1 ? '' : 's'}</p>${lcLine()}</div>` +
      `<div class="actions">${K.tables.figuresBtn()}${K.expBar(
        ['pdf', 'svg', 'png', 'tsv'],
        'sites-exp',
        'the sites',
        'data',
        { names: { tsv: 'Site table (TSV)' } }
      )}</div></div>`;
    const sorted = (id) => (T.sort === id ? ` aria-sort="${T.desc ? 'descending' : 'ascending'}"` : '');
    const q = quick(lz);
    if (!total)
      return head + K.tables.selectionCard() + (q ? `<div id="sites-quick">${q}</div>` : '') + K.tables.emptyState();
    return (
      head +
      (K.siteFew?.('sites') || '') +
      (LC && K.shown.note ? K.shown.note() : '') +
      K.tables.selectionCard() +
      K.tables.enrichedCard() +
      (q ? `<div id="sites-quick">${q}</div>` : '') +
      (`<div class="tbl-card t-card" id="sites-table"><div class="tbl-tools">${K.columns.menu('sites', opt, defaults)}</div><div ` +
        `class="tbl-wrap">`) +
      (`<table class="tbl stackable sites-tbl"><thead><tr>${cols
        .map(
          (c) =>
            `<th scope="col" class="${esc(c.cls || '')}${c.hide ? ' hide-' + esc(c.hide) : ''}" data-ssort="${esc(c.id)}" tabindex="0"${sorted(c.id)}${
              c.help || (c.attribute && SPECS[c.attribute]?.help)
                ? ` title="${esc(c.help || SPECS[c.attribute].help)}"`
                : ''
            }>${esc(c.label)}</th>`
        )
        .join('')}</tr></thead>` +
        `<tbody>`) +
      shown
        .map(
          (m) =>
            `<tr data-goto="${esc(m.lc ? m.lc.p.acc : pr(m[0]).acc)}/${m[1]}" tabindex="0"${m.lc ? ' class="lc-row"' : ''}>${cols
              .map(
                (c) =>
                  `<td class="${esc(c.cls || '')}${c.hide ? ' hide-' + esc(c.hide) : ''}" data-label="${esc(c.label.split(' · ')[0])}">${cellOf(c, m)}</td>`
              )
              .join('')}</tr>`
        )
        .join('') +
      '</tbody></table></div>' +
      `<div class="tbl-foot"><span>Showing ${int(shown.length)} of ${int(total)}</span>${
        total > T.n ? `<button class="btn ` + `small" type="button" data-smore>Show 100 more</button>` : ''
      }</div></div>` +
      (lz
        ? `<div id="t-cite"><p class="muted small"><button class="btn small" type="button" data-sites-all>Load every ${esc(W.mark)} to cite them</button></p></div>`
        : K.tables.citeBox(
            counted,
            K.sel.active() ? `these ${int(total)} ${total === 1 ? W.mark : W.marks}` : `the ${W.marks} of this site`
          ))
    );
  }

  // ---- the evidence popover: what the site's tables say of one kind of evidence at the site --------------------------
  function evidencePop(acc, pos, kinds) {
    const p = K.tables.P.find((x) => x.acc === acc),
      tb = TB[acc] || {},
      tg = EV.tags || {},
      AR = EV.around || {},
      ks = new Set(kinds);
    const site = siteName(p, pos),
      shown = (q) => (K.prot?.shownPos ? K.prot.shownPos(acc, q) : q);
    const ev =
      tg.partners && K.card.has(tg.partners) ? K.card.at(tb, tg.partners, pos).filter((r) => ks.has(r.kind)) : [];
    const span = AR.span ?? 3;
    const res =
      AR.table && K.card.has(AR.table)
        ? K.card
            .rows(tb, AR.table)
            .filter(
              (r) =>
                ks.has(r.kind) && (r.start === r.end ? Math.abs(r.start - pos) <= span : pos >= r.start && pos <= r.end)
            )
        : [];
    const url = (EV.entries || {}).url || '';
    const idLink = (id) =>
      url
        ? `<a class="mono" href="${esc(url.replace('{id}', encodeURIComponent(id)))}" target="_blank" ` +
          `rel="noopener">${esc(String(id).toUpperCase())}</a>`
        : esc(id);
    const lab = (k) => K.sel.valueLabel(tg.attribute, k);
    const body = [...ks]
      .map((k) => {
        const e = ev.filter((r) => r.kind === k),
          x = res.filter((r) => r.kind === k);
        if (!e.length && !x.length) return `<li><b>${esc(lab(k))}</b></li>`;
        return (
          `<li><b>${esc(lab(k))}</b>${
            x.length
              ? `<br>${x
                  .map(
                    (r) =>
                      `${
                        r.start === r.end
                          ? `residue ${esc(shown(r.start))}${
                              r.start === pos
                                ? ' (the site)'
                                : ` (i${r.start > pos ? '+' : '−'}${Math.abs(r.start - pos)})`
                            }`
                          : `residues ${esc(shown(r.start))}–${esc(shown(r.end))}`
                      }${r.source ? ` <span class="muted">${esc(String(r.source).replace(/;\s*/g, ', '))}</span>` : ''}`
                  )
                  .join('<br>')}`
              : ''
          }` +
          (e.length
            ? `<br>${e
                .slice(0, 12)
                .map((r) =>
                  [
                    r.partner ? `<b>${esc(r.partner)}</b>` : '',
                    String(r.ids || '')
                      .split(/;\s*/)
                      .filter(Boolean)
                      .slice(0, 4)
                      .map(idLink)
                      .join(', '),
                    r.score !== '' && r.score != null ? `score ${esc(Number(r.score).toFixed(2))}` : '',
                    r.detail
                      ? `<span class="muted">${esc(
                          String(r.detail).replace(/[ACDEFGHIKLMNPQRSTVWY]{8,}/g, '…')
                        )}</span>`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                )
                .join('<br>')}${
                e.length > 12 ? `<br><span ` + `class="muted">+${int(e.length - 12)} more on the site card</span>` : ''
              }`
            : '') +
          '</li>'
        );
      })
      .join('');
    return (
      `<div class="evp-head"><b>${esc(K.tables.pLabel(p))} ${esc(site)}</b><button type="button" ` +
      `class="linkish" data-evp-close aria-label="Close">×</button></div><ul class="evp-list">${body}</ul>` +
      `<p><a href="${esc(K.link('protein', acc + '/' + pos))}">Open the site card for ${esc(site)} ›</a></p>`
    );
  }
  function openPop(el) {
    const tr = el.closest('tr[data-goto]');
    if (!tr) return;
    const [acc, pos] = tr.dataset.goto.split('/'),
      kinds = el.dataset.evKind.split(',');
    let pop = document.getElementById('evpop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'evpop';
      pop.className = 'evpop';
      pop.setAttribute('role', 'dialog');
      document.body.appendChild(pop);
    }
    pop.innerHTML = evidencePop(acc, +pos, kinds);
    pop.hidden = false;
    const r = el.getBoundingClientRect(),
      w = Math.min(380, innerWidth - 16);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - w - 8)) + 'px';
    pop.style.top = r.bottom + scrollY + 6 + 'px';
  }
  const closePop = () => {
    const p = document.getElementById('evpop');
    if (p) p.hidden = true;
  };

  // ---- the download: the columns website.sites.download names (every protein's tables loaded first) ------------------
  const DL = SV.download || [
    { name: 'accession', value: 'accession' },
    { name: 'gene', value: 'gene' },
    { name: 'site', value: 'site' },
    { name: 'position', value: 'position' },
    { name: 'window_15', value: 'window' },
    ...D.analyses.filter((a) => a.kind !== 'protein_sets').map((a) => ({ name: a.id, analysis: a.id })),
    ...Object.keys(SPECS).map((n) => ({ name: n, attribute: n })),
  ];
  const dlTables = () => DL.some((c) => c.table);
  function dlValue(c, m) {
    if (m.lc) {
      const p = m.lc.p;
      if (c.value)
        return (
          {
            accession: p.acc,
            gene: p.gene,
            entry: p.entry,
            protein: p.name,
            site: K.prot?.siteLabel ? K.prot.siteLabel(p.acc, m[1]) : m[1],
            position: m[1],
            window: m[4],
            residue: K.markRes(m),
          }[c.value] ?? ''
        );
      if (c.attribute)
        return lcVals(m, c.attribute)
          .map((v) => (c.labels ? short(c.attribute, v) : v))
          .join(';');
      return '';
    }
    const p = pr(m[0]);
    if (c.value) {
      if (c.value === 'nearest') return nearest(m) ?? '';
      if (c.value === 'numbering') {
        const n = K.prot?.numbering?.(p.acc);
        return n ? (n.note || n.label || 'numbered as papers do') + '; position is UniProt' : '';
      }
      return (
        {
          accession: p.acc,
          gene: p.gene,
          entry: p.entry,
          protein: p.name,
          site: siteName(p, m[1], m),
          position: m[1],
          window: m[4],
          residue: K.markRes(m),
        }[c.value] ?? ''
      );
    }
    if (c.attribute) {
      const vs = vals(m, c.attribute).filter((v) => v !== '');
      if (c.links) {
        const l = META().attribute_links?.[c.attribute] || {};
        return vs.map((v) => l[v] || '').join(';');
      }
      if (c.lookup) {
        const ct = CC.cite,
          lk = D.lookups?.[c.table_lookup || ct?.lookup] || {};
        return vs.map((v) => (lk[v] || {})[c.lookup] || '').join(';');
      }
      return vs.map((v) => (c.labels ? short(c.attribute, v) : v)).join(';');
    }
    if (c.analysis)
      return K.tables
        .classes(m, c.analysis)
        .map((x) => (c.labels ? K.sel.classLabel(c.analysis, x) : x))
        .join(';');
    if (c.protein) {
      const v = K.proteinAttr?.(p.acc, c.protein);
      return v == null ? '' : String(v).replace(/;\s*/g, ';');
    }
    if (c.table) {
      if (!K.card?.has(c.table)) return '';
      let rs = K.card.at(TB[p.acc] || {}, c.table, m[1]);
      if (c.where) rs = rs.filter((r) => Object.entries(c.where).every(([k, v]) => [].concat(v).includes(r[k])));
      if (c.kinds) rs = rs.filter((r) => c.kinds.includes(r.kind));
      if (c.column)
        return rs
          .map((r) => r[c.column] ?? '')
          .filter((v) => v !== '')
          .join(';');
      const out = [];
      rs.forEach((r) =>
        String(r[c.field] ?? '')
          .split(/;\s*/)
          .filter(Boolean)
          .forEach((v) => {
            if (!out.includes(v)) out.push(v);
          })
      );
      if (c.with) {
        const pairs = [];
        rs.forEach((r) => {
          const k = `${r[c.field]}:${r[c.with] === '' || r[c.with] == null ? '' : Number(r[c.with]).toFixed(2)}`;
          if (r[c.field] && !pairs.includes(k)) pairs.push(k);
        });
        return pairs.join(';');
      }
      return c.count ? out.length : out.join(';');
    }
    return '';
  }
  function tsv(rs) {
    const lcAny = rs.some((m) => m.lc),
      hl = !!K.hl?.any();
    return (
      K.preamble(
        `${W.marks}${K.sel.active() ? ' (selection)' : ''}`,
        `every ${W.mark}${K.sel.active() ? ' of the selection' : ''} (${int(rs.length)}), in the ` +
          `table’s order, with the columns the site names; lists are separated by ";".`
      ) +
      [...DL.map((c) => c.name), ...(lcAny ? ['counted'] : []), ...(hl ? ['highlighted'] : [])].join('\t') +
      '\n' +
      rs
        .map((m) =>
          [
            ...DL.map((c) => String(dlValue(c, m)).replace(/[\t\n]/g, ' ')),
            ...(lcAny ? [m.lc ? 'no' : 'yes'] : []),
            ...(hl ? [!m.lc && K.hl.isSite(m[0], m[1]) ? 'yes' : ''] : []),
          ].join('\t')
        )
        .join('\n') +
      '\n'
    );
  }
  async function download(el) {
    if (!K.sel.peek()) {
      K.busy('Loading the data', K.sel.ready);
      await K.sel.ready;
    }
    const rs = rows(allCols().shown),
      name = K.tables.fileName('sites');
    if (el?.dataset?.sitesExp && el.dataset.sitesExp !== 'tsv')
      return K.tableExport(
        el.dataset.sitesExp,
        el,
        document.getElementById('sites-table') || document.body,
        { title: 'Sites', sub: K.pageCx(), total: rs.length },
        name
      );
    if (dlTables() && K.card) {
      const accs = [...new Set(rs.filter((m) => !m.lc).map((m) => pr(m[0]).acc))].filter((a) => TB[a] === undefined),
        old = el.textContent;
      el.disabled = true;
      let done = 0;
      await Promise.all(
        accs.map((a) =>
          K.card.load(a).then((tb) => {
            TB[a] = tb || {};
            if (++done % 200 === 0) el.textContent = `${Math.round((100 * done) / accs.length)}%`;
          })
        )
      );
      el.disabled = false;
      el.textContent = old;
    }
    K.exportFigure('tsv', null, name, el, () => tsv(rs));
  }

  // ---- register ---------------------------------------------------------------------------------------------------
  K.views.sites = { render: view, title: () => 'Sites' };
  K.tabs.push(() => ['sites', 'Sites', K.sel?.active() ? (K.sel.loading() ? '…' : K.sel.nMarks()) : D.counts.marks]);
  K.sections.sites = () => [
    ['view', 'Sites', 1],
    ...(K.sel?.active() && document.getElementById('sel-card') ? [['sel-card', 'Your selection', 1]] : []),
    ...(document.getElementById('sel-enriched') ? [['sel-enriched', 'Enriched features', 1]] : []),
    ...(quickAttrs().length ? [['sites-quick', 'Quick filters', 1]] : []),
    ['sites-table', 'Site table', 1],
    ['t-cite', 'How to cite', 1],
  ];
  K.columns.redraw.sites = () => {
    const y = scrollY;
    K.render();
    scrollTo(0, y);
  };
  K.clicks.unshift(['#sites-table [data-ev-kind]', (el) => openPop(el)], ['[data-evp-close]', () => closePop()]);
  K.clicks.push(
    [
      '[data-ssort]',
      (el) => {
        const id = el.dataset.ssort,
          c = allCols().shown.find((x) => x.id === id);
        K.tables.sortBy(T, id, !!c?.text);
        K.render();
      },
    ],
    [
      '[data-smore]',
      () => {
        T.n += 100;
        K.render();
      },
    ],
    [
      '[data-sites-shown]',
      (el) => {
        T.shown = el.checked;
        const y = scrollY;
        K.render();
        scrollTo(0, y);
      },
    ],
    [
      '[data-f-all]',
      (el) => {
        delete S.f[el.dataset.fAll];
        K.writeHash(true);
        K.render();
      },
    ],
    ['[data-sites-exp]', (el) => download(el)],
    ['[data-sites-all]', () => K.sel.data()],
    [
      '[data-sites-3d]',
      (el) => {
        const [acc, pos] = el.dataset['sites-3d'].split('/');
        if (typeof K.show3d === 'function') K.show3d(acc, +pos);
      },
    ],
    [
      'tr[data-goto]',
      (el, e) => {
        if (!e.target.closest('a, button, summary, input, [data-ev-kind]')) K.go('protein', { arg: el.dataset.goto });
      },
    ]
  );
  document.addEventListener('click', (e) => {
    const p = document.getElementById('evpop');
    if (p && !p.hidden && !e.target.closest('#evpop, [data-ev-kind]')) p.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePop();
    const tr = e.target.closest?.('tr[data-goto]');
    if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      K.go('protein', { arg: tr.dataset.goto });
    }
    const th = e.target.closest?.('th[data-ssort]');
    if (th && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      th.click();
    }
  });
  // hovers: a window residue (what it is, and the mark there if any); the RNA and DNA contacts in full
  K.tips.push([
    '[data-wr]',
    (el) => {
      const [pi, pos] = el.dataset.wr.split('/').map(Number),
        tr = el.closest('tr[data-goto]'),
        at = tr ? +tr.dataset.goto.split('/')[1] : null,
        p = pr(pi);
      const i = K.tables.byProt()[pi].find((k) => SD().marks[k][1] === pos),
        m = i == null ? null : SD().marks[i];
      const off = at == null ? '' : ` · ${pos > at ? '+' : '−'}${Math.abs(pos - at)} from ${esc(siteName(p, at))}`;
      return (
        `<b>${esc(el.textContent)}${esc(K.prot?.shownPos ? K.prot.shownPos(p.acc, pos) : pos)}</b>${off}` +
        (m
          ? `<br>${esc(cap(W.mark))}${Object.keys(SPECS)
              .filter((n) => SPECS[n].colour && SPECS[n].kind === 'category')
              .map((n) => ` · ${esc(K.sel.valueLabel(n, vals(m, n)[0] ?? ''))}`)
              .join('')}`
          : `<br><span ` + `class="muted">not a ${esc(W.mark)} in this site</span>`)
      );
    },
  ]);
  K.tips.push([
    '[data-na-tip]',
    (el) => {
      const [pi, pos] = el.dataset.naTip.split('/').map(Number),
        m = SD().marks.find((x) => x[0] === pi && x[1] === pos);
      if (!m || TB[pr(pi).acc] === undefined) return '';
      const c = ctxOf(m),
        h = K.card.sequences(c, false) + K.card.peptides(c) + K.card.around(c, false);
      return h ? `<div class="na-tip"><b>${esc(c.gene)} ${esc(c.label)}</b>${h}</div>` : '';
    },
  ]);
});
