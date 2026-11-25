/* The protein page's table of its sites and their variants (fold p-sitetab; website.protein.site_table): one row for each
   site of the protein, with its state, the changes seen at it in each source of website.propensity (k, O/E, q), the ClinVar
   pathogenic and likely pathogenic variants with their conditions, the cell lines a map row names for its changes
   (website.protein.map.rows[].from.names), a hotspot flag and whether the site lies in a disordered region. It reads what the
   page already loads (the propensity shard data/m/NNN.json, the map's items, the protein's tables). A site's variants are one
   line from the site card's own counter (K.card.vc), linked to the card's variants. The fold is closed; its one-line
   summary counts the sites with q < 0.05 in the first somatic source and the sites with a highlighted (P/LP) ClinVar variant. Sortable by any
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
  const TOP = SRC.find((s) => s.kind === 'somatic') || SRC[0]; // the source the default sort and the summary read
  if (!SRC.length) return;
  const ST = { key: `${TOP.id}:q`, dir: 1 };
  const numOf = (v) => (v == null || Number.isNaN(+v) ? null : +v);

  // ---- the files: the protein's propensity shard (K.prop.load) and its tables (K.card.load, for the variant counts) ----------------
  // a selection's few-sites blocks (K.siteFew) read the same files; they ask the page to draw again when one arrives
  let asked = false,
    redraw = 0;
  const again = () => {
    if (!redraw)
      redraw = requestAnimationFrame(() => {
        redraw = 0;
        const y = scrollY;
        K.render();
        scrollTo(0, y);
      });
  };
  const cardTb = (acc) => {
    const tb = K.card?.peek(acc);
    if (tb === undefined) K.card?.load(acc).then(() => (cur() ? refresh() : asked && again()));
    return tb;
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
  function model(p, rec) {
    const acc = p.acc,
      loaded = K.prop.peek(acc),
      vtb = cardTb(acc),
      named = K.map?.namedRows?.() || [],
      NM = named.map((n) => ({ ...n, data: K.map.namedChanges(acc, n.column) }));
    const rows = [...rec.marks]
      .sort((x, y) => x[0] - y[0])
      .map((m) => {
        const pos = m[0],
          src = {};
        if (loaded) SRC.forEach((s) => (src[s.id] = sourceCells(acc, pos, s)));
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
          vars: vtb ? K.card.vc.siteVariants(vtb, pos) : null, // the site card's counts
          names,
          writer: K.prot.summaryAt ? (K.prot.summaryAt(acc, pos)?.writer?.[1] ?? (vtb ? '' : null)) : null,
          hot: loaded ? SRC.filter((s) => src[s.id]?.hot).map((s) => ({ s, tip: src[s.id].hot })) : null,
          dis: inDisorder(rec, pos),
          am: K.prot.am?.(acc, pos),
        };
      });
    return { p, rec, rows, loaded, NM, vtb };
  }

  // ---- the columns: each with its words, its cell and its value to sort and download -------------------------------------------
  const fq = (q) => K.prop.fq(q);
  // a source's cell: k and O/E on one line, q under them; a ring on the cell when q is below the cutoff
  function srcCell(s, r) {
    const c = r.src[s.id];
    if (!c) return '–';
    const ring = c.fewer || c.more,
      why = c.fewer ? 'fewer than expected' : 'more than expected';
    return (
      `<span class="st-src${ring ? ` st-ring${c.fewer ? ' dash' : ''}` : ''}" title="${esc(c.tip + (ring ? `\n${why}, q below ${RING}` : ''))}">` +
      `<span>${K.prop.kOE(s.id, { k: c.k, o: c.o })}${c.q != null && c.k > 0 ? ` · <span class="st-q">q ${fq(c.q)}</span>` : ''}</span></span>`
    );
  }
  function columns(M) {
    const cols = [
      {
        id: 'site',
        tsvName: 'site',
        label: 'Site',
        help: 'The residue and its position as the page numbers it; opens its card',
        cell: (r) =>
          `<a href="${esc(K.link('protein', `${M.p.acc}/${r.pos}`))}">${esc(r.label)}</a>` +
          (K.prot.shownPos && String(r.pos) !== String(K.prot.shownPos(M.p.acc, r.pos))
            ? ` <span class="muted small" title="The position in UniProt's numbering">(UniProt ${esc(`${r.label.replace(/\d+$/, '')}${r.pos}`)})</span>`
            : ''),
        val: (r) => r.pos,
        tsv: (r) => r.label,
        cls: 'mono',
      },
    ];
    if (M.rows.some((r) => r.state))
      cols.push({
        id: 'state',
        tsvName: 'state',
        label: K.prot.stateLabel?.() || 'State',
        help: 'The state of the mark at the site',
        cell: (r) => esc(r.state || '–'),
        val: (r) => r.state,
        tsv: (r) => r.state,
      });
    // the writers, from the site card's summary (K.card.summaryItems, through K.prot.summaryAt): the records' writers, then UniProt's
    if (K.prot.summaryAt)
      cols.push({
        id: 'writer',
        tsvName: 'writer_uniprot',
        label: 'Writer (UniProt)',
        help: 'Enzymes that write the mark at the site: the records’ writers, then those UniProt names for the residue',
        cell: (r) => (r.writer == null ? '…' : r.writer || '<span class="muted">–</span>'),
        val: (r) => (r.writer ? r.writer.replace(/<[^>]*>/g, '') : null),
        tsv: (r) => (r.writer ? r.writer.replace(/<[^>]*>/g, '') : ''),
      });
    for (const s of SRC) {
      const unit = (s.unit || ['sample', 'samples'])[1],
        src = (r) => r.src[s.id];
      cols.push(
        {
          id: `${s.id}:k`,
          tsvName: `${s.id}_${String(unit).replace(/\W+/g, '_')}_changed`,
          grp: s.id,
          label: `${s.label} k`,
          sub: 'k',
          num: 1,
          help: `${s.long || s.label}: ${unit} with a change at the site`,
          val: (r) => src(r)?.k,
          tsv: (r) => src(r)?.k ?? '',
        },
        {
          id: `${s.id}:o`,
          tsvName: `${s.id}_oe`,
          grp: s.id,
          label: `${s.label} O/E`,
          sub: 'O/E',
          num: 1,
          help: `${s.long || s.label}: changes seen over the changes the residue's codon predicts`,
          val: (r) => src(r)?.o,
          tsv: (r) => src(r)?.o ?? '',
        },
        {
          id: `${s.id}:q`,
          tsvName: `${s.id}_q`,
          grp: s.id,
          label: `${s.label} q`,
          sub: 'q',
          num: 1,
          help:
            `${s.long || s.label}: q of the binomial test, Benjamini–Hochberg corrected. A ring means q below ${RING}, more than expected` +
            (s.lower_tail ? '; a dashed ring means fewer than expected (the q shown is for fewer)' : ''),
          val: (r) => src(r)?.q,
          tie: (r) => src(r)?.p,
          tsv: (r) => src(r)?.q ?? '',
        }
      );
    }
    if (K.card?.vc.entries.length)
      cols.push({
        id: 'variants',
        tsvName: 'variants',
        label: 'Variants',
        help: `Variants at the site, from the site card: every variant at the residue, then those classified pathogenic or likely pathogenic (${K.card.vc.entries.map((x) => x.highlight?.label).filter(Boolean)[0] || 'highlighted'}). Click for the site card's variants`,
        cell: (r) => (r.vars ? K.card.vc.line(M.vtb, M.p.acc, r.pos) : '…'),
        val: (r) => (r.vars ? r.vars.reduce((a, v) => a + v.hot, 0) * 1e6 + r.vars.reduce((a, v) => a + v.n, 0) : null),
        tsv: (r) => (r.vars ? K.card.vc.text(M.vtb, r.pos) : ''),
      });
    if (K.card?.vc.entries.length)
      cols.push({
        id: 'variants_conditions',
        tsvName: 'variant_conditions',
        tsvOnly: true,
        label: 'Variant conditions',
        help: "The condition names the release tables carry for the site's P/LP variants",
        cell: () => '',
        val: () => null,
        tsv: (r) => (M.vtb ? K.card.vc.conditionsText(M.vtb, M.p.acc, r.pos) : ''),
      });
    M.NM.forEach((n, i) =>
      cols.push({
        id: `names:${i}`,
        tsvName: `${String(n.row).toLowerCase().replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'names_' + i}`,
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
        tsvName: 'hotspot_note',
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
        tsvName: 'disordered',
        label: 'Disordered region',
        help: 'Whether the site lies in a disordered region of the protein (the map’s disorder tracks)',
        cell: (r) => (r.dis ? 'yes' : '<span class="muted">no</span>'),
        val: (r) => (r.dis ? 1 : 0),
        tsv: (r) => (r.dis ? 'yes' : 'no'),
      }
    );
    // AlphaMissense: the mean score of the site's substitutions, once AlphaFold DB's file for this protein is in (it is read live,
    // for the open protein only); less reliable inside disordered regions, so the disordered column goes with it
    if (K.prot.amReady?.(M.p.acc))
      cols.push({
        id: 'am',
        tsvName: 'alphamissense_mean',
        label: 'AlphaMissense',
        num: 1,
        help: 'The mean AlphaMissense pathogenicity score of the substitutions at the site (0 to 1; 0.564 and above is likely pathogenic). Less reliable in disordered regions',
        cell: (r) =>
          r.am
            ? `<span${r.dis ? ' class="muted" title="In a disordered region: less reliable"' : ''}>${(r.am.sum / r.am.n).toFixed(2)}</span>`
            : '–',
        val: (r) => (r.am ? r.am.sum / r.am.n : null),
        tsv: (r) => (r.am ? (r.am.sum / r.am.n).toFixed(3) : ''),
      });
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
    if (M.vtb)
      K.card.vc.entries
        .filter((x) => x.highlight?.label)
        .forEach((x) => {
          const n = K.card.vc.sites(
            M.vtb,
            x,
            M.rows.map((r) => r.pos)
          ).hot;
          parts.push(`${int(n)} with ${x.label} ${x.highlight.label} variants`);
        });
    return esc(parts.join('; '));
  }
  // the columns as drawn: each source is one column (k · O/E, with q under it) with a small menu to sort by any of its three values
  function display(cols) {
    const out = [];
    cols.forEach((c) => {
      if (!c.grp) return out.push(c);
      let g = out.find((x) => x.id === c.grp);
      if (!g) {
        const s = SRC.find((x) => x.id === c.grp);
        out.push(
          (g = {
            id: s.id,
            parts: [],
            num: 1,
            label: s.label,
            help: `${s.long || s.label}: k (${(s.unit || ['sample', 'samples'])[1]} with a change at the site), O/E (changes seen over the changes the residue's codon predicts) and q below them`,
            cell: (r) => srcCell(s, r),
          })
        );
      }
      g.parts.push(c);
    });
    return out;
  }
  function table(M) {
    const cols = columns(M),
      rows = sorted(M, cols);
    const th = (c) => {
      if (!c.parts)
        return `<th class="${c.num ? 'num' : ''}" data-stsort="${esc(c.id)}" tabindex="0" title="${esc(c.help)}"${
          c.id === ST.key ? ` aria-sort="${ST.dir > 0 ? 'ascending' : 'descending'}"` : ''
        }>${esc(c.label)}</th>`;
      const on = c.parts.find((x) => x.id === ST.key);
      return (
        `<th class="num st-grp" title="${esc(c.help)}"${on ? ` aria-sort="${ST.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${esc(c.label)}` +
        `<span class="st-sm" role="group" aria-label="Sort ${esc(c.label)} by">${c.parts
          .map(
            (x) =>
              `<button type="button" data-stsort="${esc(x.id)}" aria-pressed="${x === on}" title="Sort by ${esc(x.sub)}: ${esc(x.help)}">${esc(x.sub)}${
                x === on ? (ST.dir > 0 ? ' ▲' : ' ▼') : ''
              }</button>`
          )
          .join('')}</span></th>`
      );
    };
    const shown = display(cols.filter((c) => !c.tsvOnly));
    return (
      `<div class="tbl-card st-card" tabindex="0" role="region" aria-label="${esc(TITLE)}"><table class="tbl compact st-tbl"><thead><tr>${shown.map(th).join('')}</tr></thead><tbody>` +
      rows
        .map(
          (r) =>
            `<tr>${shown.map((c) => `<td class="${(c.num ? 'num ' : '') + (c.cls || '')}">${c.cell(r)}</td>`).join('')}</tr>`
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
          `q: corrected for the sites tested; a ring is q below ${RING} with more than expected${
            SRC.some((s) => s.lower_tail) ? ', a dashed ring with fewer' : ''
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
    if (host.hasAttribute('data-later')) return; // drawn when the section is opened
    if (bodyToo) host.innerHTML = body(M);
    else host.querySelector('.st-card').outerHTML = table(M);
  }
  function load(acc) {
    if (K.prop.peek(acc) === undefined) K.prop.load(acc).then(() => refresh());
  }
  (K.afterUni ||= []).push(() => cur() && refresh());
  (K.proteinFolds ||= []).push((p, rec, fold) => {
    if (!rec.marks?.length) return '';
    load(p.acc);
    const M = model(p, rec);
    return fold('p-sitetab', esc(TITLE), summary(M), body(M), false);
  });
  (K.proteinFoldSections ||= []).push(['p-sitetab', TITLE, 1]);
  K.siteTable = { refresh: () => refresh() };
  K.prop.onHyper(() => refresh());
  (K.mapReady ||= []).push(() => refresh());

  // ---- a small selection: each selected site as one line --------------------------------------------------------------------
  // mode 'sites' leads with the changes seen at the site, 'variants' shows only the site's variants. A site's variants are one
  // line from the site card's counter (K.card.vc.line), linked to the card's variants; nothing here counts or lists them.
  // Called by the Sites and Disease variants pages; '' when the selection is not small or there is no selection.
  K.siteFew = (mode) => {
    if (!K.few?.picked) return '';
    const P = K.few.picked();
    if (!P || !K.few.active(P.all)) return '';
    asked = true;
    const sites = P.list.map((m) => {
      const pi = m[0],
        pos = m[1],
        acc = D.proteins[pi][0];
      if (K.prop.peek(acc) === undefined) K.prop.load(acc).then(again);
      const vtb = cardTb(acc),
        loaded = K.prop.peek(acc),
        src = loaded ? SRC.map((x) => ({ x, c: sourceCells(acc, pos, x) })) : null,
        hot = src ? src.filter((y) => y.c.hot) : [],
        facts = [];
      if (mode !== 'variants' && src)
        src.forEach(({ x, c }) =>
          facts.push({
            text:
              c.k == null
                ? `${esc(x.label)}: none seen`
                : `${esc(x.label)} ${K.prop.kOE(x.id, { k: c.k, o: c.o })}${c.q != null && c.k > 0 ? ` · ${c.more || c.fewer ? `<b>q ${fq(c.q)}</b>` : `q ${fq(c.q)}`}` : ''}`,
            to: 'changes',
          })
        );
      if (vtb && K.card.vc.entries.length) facts.push({ text: K.card.vc.line(vtb, acc, pos) });
      if (mode !== 'variants' && hot.length) facts.push({ text: 'hotspot', to: 'changes' });
      const changes =
        src &&
        `<div class="st-mini">${src
          .map(
            ({ x, c }) => `<div><span class="muted">${esc(x.label)}</span> ${srcCell(x, { src: { [x.id]: c } })}</div>`
          )
          .join('')}</div><p class="muted small">k: ${esc(
          SRC.map((x) => `${x.label} ${(x.unit || ['sample', 'samples'])[1]}`).join(', ')
        )} with a change at the site. O/E: changes seen over changes expected from the residue’s codon. A ring means q below ${RING}.</p>`;
      return {
        key: `${pi}-${pos}`,
        head: `${K.few.siteLink(pi, pos)} <span class="muted">${esc(D.proteins[pi][2] || '')}</span>`,
        facts,
        sections:
          mode === 'variants'
            ? []
            : [
                {
                  id: 'changes',
                  title: 'Changes seen at the site',
                  sum: src ? src.map(({ x, c }) => `${x.label} ${c.k ?? 0}`).join(', ') : '',
                  body: changes || K.loading('Loading…'),
                },
              ],
      };
    });
    return K.few.html({
      title: `Your selected ${P.all === 1 ? W.mark : W.marks}: ${mode === 'variants' ? 'variants' : 'changes and variants'}`,
      note: `Each ${W.mark}'s variants are counted by its site card; the link opens the card at its variants.`,
      sites,
      more: P.all - P.list.length,
    });
  };

  // ---- sort and download ----------------------------------------------------------------------------------------------------------
  K.clicks.push(
    [
      '[data-stsort]',
      (th) => {
        const id = th.dataset.stsort;
        ST.dir = ST.key === id ? -ST.dir : id === 'site' || id === 'state' ? 1 : -1;
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
        const M = model(ps.p, ps.rec);
        // the conditions column reads the protein's variant lists: wait for them
        return (M.vtb ? K.card.vc.ready(M.vtb, ps.p.acc) : Promise.resolve()).then(() => exportRows(b, ps, M));
      },
    ]
  );
  function exportRows(b, ps, M) {
    const cols = columns(M),
      rows = sorted(M, cols),
      gene = ps.p.gene || ps.p.acc;
    const tsv =
      K.preamble(
        `${TITLE}, ${gene}`,
        `one row for each ${W.mark} of ${gene} (${ps.p.acc}): its state, the changes seen at it in each source (k: samples or variants with a change; O/E: changes seen over expected; q: corrected binomial p, for fewer than expected where a source's column says so), its variants as the site card counts them (variants at the residue, and those classified pathogenic or likely pathogenic), the cell lines named for its changes, the hotspot flag, the disordered-region flag${K.prot.amReady?.(ps.p.acc) ? ' and the mean AlphaMissense score of its substitutions (less reliable in disordered regions)' : ''}. ${
          K.prop.state.hyper ? 'With' : 'Without'
        } hypermutated samples; sorted as shown on the page`
      ) +
      ['uniprot_position', ...cols.map((c) => c.tsvName || c.id.replace(/[:\s]+/g, '_'))].join('\t') +
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
  }
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
    '.st-tbl th,.st-tbl td{padding:.25rem .3rem;white-space:nowrap}.st-tbl th{top:0;z-index:2}',
    '.st-tbl th[aria-sort]::after{content:" \\25B2";font-size:.7em}.st-tbl th[aria-sort="descending"]::after{content:" \\25BC"}',
    '.st-tbl td:first-child,.st-tbl th:first-child{position:sticky;left:0;background:var(--surface)}.st-tbl th:first-child{background:var(--surface-2);z-index:3}',
    '.st-tbl td.mono{font-family:var(--mono,monospace)}',
    '.st-src{display:inline-flex;flex-direction:column;align-items:flex-end;line-height:1.2;padding:.05rem .4rem;border:1.5px solid transparent;border-radius:.5rem}.st-src small{font-size:.75em;color:var(--ink-2)}',
    '.st-ring{border-color:var(--ink)}.st-ring.dash{border-style:dashed}',
    '.st-sm{display:flex;gap:.15rem;justify-content:flex-end;margin-top:.1rem}.st-sm button{font:inherit;font-size:.72rem;font-weight:500;padding:0 .3rem;border:1px solid var(--line-strong);border-radius:.3rem;background:var(--surface);color:var(--ink-2);cursor:pointer}.st-sm button[aria-pressed="true"]{background:var(--wash);color:var(--ink);font-weight:700}',
    '.st-mini{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem}',
    '.st-cond{cursor:help;display:inline-block;max-width:10rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}.st-tbl th.st-grp::after{content:none!important}.st-tbl th{white-space:normal;vertical-align:bottom}',
    '.sc-names{margin-top:.15rem}',
    '@media (max-width:640px){.st-card{max-height:24rem}}',
  ].join('');
  document.head.appendChild(st);
});
