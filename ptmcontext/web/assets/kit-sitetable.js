/* The protein page's table of its sites and their variants (fold p-sitetab; website.protein.site_table): one row for each
   site of the protein, with its state, the changes seen at it in each source of website.propensity (k, O/E, q), the ClinVar
   pathogenic and likely pathogenic variants with their conditions, the cell lines a map row names for its changes
   (website.protein.map.rows[].from.names), a hotspot flag and whether the site lies in a disordered region. It reads what the
   page already loads (the propensity shard data/m/NNN.json, the map's items), plus data/cv.json (the Disease variants page's
   ClinVar file, 40 to 110 KB), once, when a protein page opens. The fold is closed; its one-line
   summary counts the sites with q < 0.05 in the first somatic source and the sites with ClinVar variants. Sortable by any
   column (default: the first somatic source's q, then its p); Data (TSV) with the standard citation header. A module of the
   site kit; without website.propensity it does nothing. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, esc, int } = K;
  const PR = D.propensity;
  if (!PR || !K.prop || !K.prot) return;
  const CFG = D.protein_view?.site_table || {},
    TITLE = CFG.title || 'Sites and their variants',
    RING = K.prop.ring;
  const SRC = PR.sources.filter((s) => !K.prop.desc(s.id)); // sources with a test: k, O/E and q
  const CV_SRC = PR.sources.find((s) => K.prop.desc(s.id)); // the descriptive one (ClinVar): variants and conditions instead
  const TOP = SRC.find((s) => s.kind === 'somatic') || SRC[0]; // the source the default sort and the summary read
  if (!SRC.length) return;
  const ST = { key: `${TOP.id}:q`, dir: 1 };
  const numOf = (v) => (v == null || Number.isNaN(+v) ? null : +v);

  // ---- the files: data/cv.json (once) and the protein's propensity shard (K.prop.load) ------------------------------------------
  let CV; // undefined: not asked; null: could not be read; else the file
  const cvLoad = () => {
    if (!PR.cv || CV !== undefined) return;
    CV = 'pending';
    fetch(PR.cv.file)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (j) => (CV = j),
        () => (CV = null)
      )
      .then(() => refresh());
  };
  let CV_AT = null; // accession -> Map(position -> variants)
  const cvAt = (acc) => {
    if (!CV || CV === 'pending') return null;
    if (!CV_AT) CV_AT = new Map(Object.entries(CV.sites).map(([a, list]) => [a, new Map(list)]));
    return CV_AT.get(acc) || new Map();
  };

  // ---- the rows ------------------------------------------------------------------------------------------------------------------
  const disorderKinds = new Set((D.tracks || []).filter((t) => t.style === 'disorder').map((t) => t.kind));
  const inDisorder = (rec, pos) => (rec.units || []).some((u) => disorderKinds.has(u[0]) && pos >= u[1] && pos <= u[2]);
  const sourceCells = (acc, pos, s) => {
    const v = K.prop.at(acc, s.id, pos);
    if (!v) return { k: null, o: null, q: null, p: null, fewer: false, text: '' };
    // a source with a lower tail (germline): the test that matters is for fewer than expected, where it is significant
    const fewer = !!s.lower_tail && v.ql != null && v.ql < RING;
    return {
      k: numOf(v.k),
      o: numOf(v.o),
      e: numOf(v.e),
      q: numOf(fewer ? v.ql : v.q),
      p: numOf(fewer ? v.pl : v.p),
      more: v.q != null && v.q < RING,
      fewer,
      tip: K.prop.tip(acc, s.id, pos, '', v.kAll),
      hot: v.hot && v.hot.self ? K.prop.hotNote(acc, v.hot, s.id) : '',
    };
  };
  const short = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
  function model(p, rec) {
    const acc = p.acc,
      loaded = K.prop.peek(acc),
      cv = cvAt(acc),
      named = K.map?.namedRows?.() || [],
      NM = named.map((n) => ({ ...n, data: K.map.namedChanges(acc, n.column) }));
    const rows = [...rec.marks]
      .sort((x, y) => x[0] - y[0])
      .map((m) => {
        const pos = m[0],
          src = {};
        if (loaded) SRC.forEach((s) => (src[s.id] = sourceCells(acc, pos, s)));
        const vs = cv ? cv.get(pos) || [] : null;
        const conds = new Map();
        (vs || []).forEach((v) => v[3].forEach((c) => conds.set(c, (conds.get(c) || 0) + 1)));
        const names = NM.map((n) =>
          n.data
            ? (n.data.at.get(pos) || []).flatMap((h) =>
                h.list.map((e) => ({ ...h, id: e[0], name: e[1], group: e[2] }))
              )
            : null
        );
        return {
          pos,
          label: K.prot.siteLabel(acc, pos),
          m,
          state: K.prot.stateText(m),
          src,
          clin: vs ? vs.length : null,
          conds: vs
            ? [...conds.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => K.us(CV.cond[c][0]))
            : null,
          names,
          hot: loaded ? SRC.filter((s) => src[s.id]?.hot).map((s) => ({ s, tip: src[s.id].hot })) : null,
          dis: inDisorder(rec, pos),
        };
      });
    return { p, rec, rows, loaded, NM, cvOk: !PR.cv || (CV && CV !== 'pending') };
  }

  // ---- the columns: each with its words, its cell and its value to sort and download -------------------------------------------
  const fq = (q) => K.prop.fq(q);
  const ringed = (c, txt) =>
    c.fewer || c.more
      ? `<span class="st-ring${c.fewer ? ' dash' : ''}" title="${
          c.fewer ? 'fewer than expected' : 'more than expected'
        }, q below ${RING}">${txt}</span>`
      : txt;
  function columns(M) {
    const cols = [
      {
        id: 'site',
        label: 'Site',
        help: 'The residue and its position as the page numbers it; opens its card',
        cell: (r) => `<a href="${esc(K.link('protein', `${M.p.acc}/${r.pos}`))}">${esc(r.label)}</a>`,
        val: (r) => r.pos,
        tsv: (r) => r.label,
        cls: 'mono',
      },
    ];
    if (M.rows.some((r) => r.state))
      cols.push({
        id: 'state',
        label: K.prot.stateLabel?.() || 'State',
        help: 'The state of the mark at the site',
        cell: (r) => esc(r.state || '–'),
        val: (r) => r.state,
        tsv: (r) => r.state,
      });
    for (const s of SRC) {
      const unit = (s.unit || ['sample', 'samples'])[1],
        src = (r) => r.src[s.id];
      cols.push(
        {
          id: `${s.id}:k`,
          label: `${s.label} k`,
          num: 1,
          help: `${s.long || s.label}: ${unit} with a change at the site`,
          cell: (r) => (src(r) ? int(src(r).k ?? 0) : '–'),
          val: (r) => src(r)?.k,
          tsv: (r) => src(r)?.k ?? '',
        },
        {
          id: `${s.id}:o`,
          label: `${s.label} O/E`,
          num: 1,
          help: `${s.long || s.label}: changes seen over the changes the residue's codon predicts`,
          cell: (r) => (src(r)?.o != null ? `<span title="${esc(src(r).tip)}">${K.prop.fo(src(r).o)}</span>` : '–'),
          val: (r) => src(r)?.o,
          tsv: (r) => src(r)?.o ?? '',
        },
        {
          id: `${s.id}:q`,
          label: `${s.label} q`,
          num: 1,
          help:
            `${s.long || s.label}: q of the binomial test, Benjamini–Hochberg corrected. A ring means q below ${RING}, more than expected` +
            (s.lower_tail ? '; a dashed ring means fewer than expected (the q shown is for fewer)' : ''),
          cell: (r) => (src(r)?.q != null ? ringed(src(r), fq(src(r).q)) : '–'),
          val: (r) => src(r)?.q,
          tie: (r) => src(r)?.p,
          tsv: (r) => src(r)?.q ?? '',
        }
      );
    }
    if (CV_SRC && PR.cv)
      cols.push(
        {
          id: 'clin:n',
          label: `${CV_SRC.label} pathogenic`,
          num: 1,
          help: `${CV_SRC.long || CV_SRC.label}: pathogenic and likely pathogenic variants at the site`,
          cell: (r) => (r.clin == null ? '…' : r.clin ? int(r.clin) : '0'),
          val: (r) => r.clin,
          tsv: (r) => r.clin ?? '',
        },
        {
          id: 'clin:c',
          label: `${CV_SRC.label} conditions`,
          help: 'The conditions named by those variants, most variants first; all of them on hover',
          cell: (r) =>
            r.conds == null
              ? '…'
              : r.conds.length
                ? `<span class="st-cond" title="${esc(r.conds.join('\n'))}">${esc(
                    r.conds
                      .slice(0, 2)
                      .map((c) => short(c, 34))
                      .join('; ')
                  )}${r.conds.length > 2 ? ` <span class="muted">+${r.conds.length - 2}</span>` : ''}</span>`
                : '<span class="muted">–</span>',
          val: (r) => (r.conds?.length ? r.conds[0] : null),
          tsv: (r) => (r.conds || []).join('; '),
        }
      );
    M.NM.forEach((n, i) =>
      cols.push({
        id: `names:${i}`,
        label: n.row,
        help: `${n.title} with a change at the site, from ${n.row} (at most the few the release lists; the count is in the map)`,
        cell: (r) => {
          const l = r.names[i];
          if (!l) return '…';
          if (!l.length) return '<span class="muted">–</span>';
          const nm = [...new Map(l.map((x) => [x.id, x])).values()];
          const lab = (x) => esc(x.name || x.id);
          return `<span class="st-cond" title="${esc(nm.map((x) => `${x.name || x.id}${x.group ? ' (' + x.group + ')' : ''}`).join('\n'))}">${nm
            .slice(0, 2)
            .map((x) =>
              n.link
                ? `<a href="${esc(n.link.replace('{id}', encodeURIComponent(x.id)))}" target="_blank" rel="noopener">${lab(x)}</a>`
                : lab(x)
            )
            .join(', ')}${nm.length > 2 ? ` <span class="muted">+${nm.length - 2}</span>` : ''}</span>`;
        },
        val: (r) => (r.names[i]?.length ? r.names[i][0].name || r.names[i][0].id : null),
        tsv: (r) => [...new Set((r.names[i] || []).map((x) => x.name || x.id))].join('; '),
      })
    );
    cols.push(
      {
        id: 'hot',
        label: 'Hotspot',
        help: 'The site is one of the enriched residues that carry much of its protein’s changes (the tooltip names the source)',
        cell: (r) =>
          r.hot == null
            ? '…'
            : r.hot.length
              ? `<span title="${esc(r.hot.map((h) => `${h.s.label}: ${h.tip}`).join('\n'))}">yes</span>`
              : '<span class="muted">–</span>',
        val: (r) => (r.hot == null ? null : r.hot.length ? 1 : 0),
        tsv: (r) => (r.hot ? r.hot.map((h) => h.s.label).join('; ') : ''),
      },
      {
        id: 'dis',
        label: 'Disordered region',
        help: 'Whether the site lies in a disordered region of the protein (the map’s disorder tracks)',
        cell: (r) => (r.dis ? 'yes' : '<span class="muted">no</span>'),
        val: (r) => (r.dis ? 1 : 0),
        tsv: (r) => (r.dis ? 'yes' : 'no'),
      }
    );
    return cols;
  }
  // rows in the chosen order: a missing value last in either direction, ties by the column's second value, then the position
  function sorted(M, cols) {
    const c = cols.find((x) => x.id === ST.key) || cols.find((x) => x.id === `${TOP.id}:q`) || cols[0];
    const cmp = (a, b) => (typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b);
    return [...M.rows].sort((x, y) => {
      const a = c.val(x),
        b = c.val(y);
      if ((a == null) !== (b == null)) return a == null ? 1 : -1;
      if (a != null && a !== b) return cmp(a, b) * ST.dir;
      const ta = c.tie?.(x),
        tb = c.tie?.(y);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      return x.pos - y.pos;
    });
  }

  // ---- the fold --------------------------------------------------------------------------------------------------------------------
  function summary(M) {
    const n = M.rows.length,
      parts = [`${int(n)} ${n === 1 ? W.mark : W.marks}`];
    if (M.loaded)
      parts.push(`${int(M.rows.filter((r) => r.src[TOP.id]?.more).length)} with q < ${RING} in ${TOP.label}`);
    if (CV_SRC && PR.cv && M.cvOk)
      parts.push(`${int(M.rows.filter((r) => r.clin).length)} with ${CV_SRC.label} pathogenic variants`);
    return esc(parts.join('; '));
  }
  function table(M) {
    const cols = columns(M),
      rows = sorted(M, cols);
    const th = (c) =>
      `<th class="${c.num ? 'num' : ''}" data-stsort="${esc(c.id)}" tabindex="0" title="${esc(c.help)}"${
        c.id === ST.key ? ` aria-sort="${ST.dir > 0 ? 'ascending' : 'descending'}"` : ''
      }>${esc(c.label)}</th>`;
    return (
      `<div class="tbl-card st-card" tabindex="0" role="region" aria-label="${esc(TITLE)}"><table class="tbl compact st-tbl"><thead><tr>${cols.map(th).join('')}</tr></thead><tbody>` +
      rows
        .map(
          (r) =>
            `<tr>${cols.map((c) => `<td class="${(c.num ? 'num ' : '') + (c.cls || '')}">${c.cell(r)}</td>`).join('')}</tr>`
        )
        .join('') +
      `</tbody></table></div>`
    );
  }
  function body(M) {
    const wait = M.loaded === undefined ? K.loading('Loading the changes seen at each site…') : '';
    const note =
      M.loaded === null
        ? `<p class="muted small">The changes seen at each site could not be read.</p>`
        : `<p class="muted small st-note">k: ${esc(SRC.map((s) => `${s.label} ${(s.unit || ['sample', 'samples'])[1]}`).join(', '))} with a change at the site. O/E: changes seen over changes expected from the residue’s codon. ` +
          `q: corrected for the number of sites tested; a ring means q below ${RING}, more than expected${
            SRC.some((s) => s.lower_tail) ? ', a dashed ring fewer than expected' : ''
          }. Click a column to sort.</p>`;
    return (
      `<div class="st-bar">${K.prop.hyperSwitch('Samples')}${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'stexp', 'the table of sites', null)}</div>` +
      note +
      wait +
      table(M)
    );
  }
  const cur = () => {
    const ps = K.protState?.();
    return ps?.rec && ps.p && document.getElementById('p-sitetab') ? ps : null;
  };
  // fills the fold again where the page shows it: after a file arrives, a sort, or the hypermutated switch
  function refresh(bodyToo = true) {
    const ps = cur();
    if (!ps) return;
    const M = model(ps.p, ps.rec),
      f = document.getElementById('p-sitetab');
    f.querySelector('.fsum').innerHTML = summary(M);
    const host = f.querySelector('.pfold-body');
    if (bodyToo) host.innerHTML = body(M);
    else host.querySelector('.st-card').outerHTML = table(M);
  }
  function load(acc) {
    cvLoad();
    if (K.prop.peek(acc) === undefined) K.prop.load(acc).then(() => refresh());
  }
  (K.proteinFolds ||= []).push((p, rec, fold) => {
    if (!rec.marks?.length) return '';
    load(p.acc);
    const M = model(p, rec);
    return fold('p-sitetab', esc(TITLE), summary(M), body(M), false);
  });
  (K.proteinFoldSections ||= []).push(['p-sitetab', TITLE, 1]);
  K.prop.onHyper(() => refresh());
  (K.mapReady ||= []).push(() => refresh());

  // ---- sort and download ----------------------------------------------------------------------------------------------------------
  K.clicks.push(
    [
      '[data-stsort]',
      (th) => {
        const id = th.dataset.stsort;
        ST.dir = ST.key === id ? -ST.dir : id === 'site' || id.startsWith('clin:c') || id === 'state' ? 1 : -1;
        if (ST.key !== id && /:q$/.test(id)) ST.dir = 1; // q: the smallest first
        ST.key = id;
        refresh(false);
        document.querySelector(`[data-stsort="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      },
    ],
    [
      '[data-stexp]',
      (b) => {
        const ps = K.protState();
        if (!ps?.rec) return;
        const M = model(ps.p, ps.rec),
          cols = columns(M),
          rows = sorted(M, cols),
          gene = ps.p.gene || ps.p.acc;
        const tsv =
          K.preamble(
            `${TITLE}, ${gene}`,
            `one row for each ${W.mark} of ${gene} (${ps.p.acc}): its state, the changes seen at it in each source (k: samples or variants with a change; O/E: changes seen over expected; q: corrected binomial p, for fewer than expected where a source's column says so), the ${CV_SRC ? CV_SRC.label + ' ' : ''}pathogenic and likely pathogenic variants with their conditions, the cell lines named for its changes, the hotspot flag and the disordered-region flag. ${
              K.prop.state.hyper ? 'With' : 'Without'
            } hypermutated samples; sorted as shown on the page`
          ) +
          ['uniprot_position', ...cols.map((c) => c.id.replace(/[:\s]+/g, '_'))].join('\t') +
          '\n' +
          rows
            .map((r) => [r.pos, ...cols.map((c) => String(c.tsv(r) ?? '').replace(/[\t\n]/g, ' '))].join('\t'))
            .join('\n') +
          '\n';
        const name = `${D.site.id}_${String(gene).replace(/\W+/g, '_')}_sites`;
        // the table drawn as a figure (PDF, SVG, PNG), or its rows with the citation header
        return b.dataset.stexp === 'tsv' || b.dataset.stexp === 'csv'
          ? K.exportFigure(b.dataset.stexp, null, name, b, () => tsv)
          : K.tableExport(b.dataset.stexp, b, b.closest('.pfold-body'), { title: TITLE }, name, () => tsv);
      },
    ]
  );
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('th[data-stsort]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  const st = document.createElement('style');
  st.id = 'kit-sitetable-css';
  st.textContent = [
    '.st-bar{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;justify-content:space-between;margin:.2rem 0 .4rem}',
    '.st-card{max-height:30rem;overflow:auto;max-width:100%}',
    '.st-tbl th,.st-tbl td{padding:.25rem .5rem;white-space:nowrap}.st-tbl th{top:0;z-index:2}',
    '.st-tbl th[aria-sort]::after{content:" \\25B2";font-size:.7em}.st-tbl th[aria-sort="descending"]::after{content:" \\25BC"}',
    '.st-tbl td:first-child,.st-tbl th:first-child{position:sticky;left:0;background:var(--surface)}.st-tbl th:first-child{background:var(--surface-2);z-index:3}',
    '.st-tbl td.mono{font-family:var(--mono,monospace)}',
    '.st-ring{display:inline-block;padding:0 .35rem;border:1.5px solid var(--ink);border-radius:999px}.st-ring.dash{border-style:dashed}',
    '.st-cond{cursor:help}',
    '.sc-names{margin-top:.15rem}',
    '@media (max-width:640px){.st-card{max-height:24rem}}',
  ].join('');
  document.head.appendChild(st);
});
