/* Proteins: the Proteins tab (every protein with a mark, searchable and sortable) and a page per protein: its map
   (domains, disordered regions and the marks, with AlphaFold's confidence once it has loaded), how its marks compare
   with its own other residues, its marks one by one, and live cards from UniProt (function, and a check that the
   sequence has not changed), AlphaFold DB (the model in 3D), PDBe (experimental structures) and STRING (interaction
   partners, if the site file names the organism's taxon). The marks the site shows and counts nowhere (kit-shown.js)
   follow the marks in its sites table, tagged, with a card of their own; a protein with only these has a page with its
   map, those marks, its sequence and 3D. Live sources add to the page; they never change a number. A module of the site kit: it registers with the core (kit.js), which starts it. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, S, esc, int, pct, cap } = K;
  if (!D.proteins || !D.proteins.length) return;
  const P = D.proteins.map(([acc, gene, name, len, marks, cand], i) => ({ i, acc, gene, name, len, marks, cand }));
  const byAcc = Object.fromEntries(P.map((p) => [p.acc, p]));
  const COLS = D.mark_columns || [];
  const label0 = (aid, cat) => (A[aid]?.labels || {})[cat] || String(cat).replace(/_/g, ' ');
  const label = label0;
  const help = (aid, cat) => (A[aid]?.help || {})[cat] || '';

  // ---- the per-protein files: 64 shards, or inlined in the one-file copy ------------------------------------------
  const shardOf = (acc) => [...acc].reduce((n, c) => n + c.charCodeAt(0), 0) % (D.shards || 64);
  const inline = (() => {
    try {
      return JSON.parse(document.getElementById('protein-data')?.textContent || '{}');
    } catch (e) {
      return {};
    }
  })();
  const shardCache = {};
  function loadShard(k) {
    const key = String(k).padStart(2, '0');
    if (inline[key]) return Promise.resolve(inline[key]);
    return (shardCache[key] ||= fetch(`data/p/${key}.json`).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error('missing'))
    ));
  }
  // a region's name is shown in American spelling (the source's own stays in the data)
  const loadProtein = (acc) =>
    loadShard(shardOf(acc)).then((sh) => {
      const rec = sh[acc] || Promise.reject(new Error('not found'));
      if (rec.units && !rec.usDone) {
        rec.usDone = true;
        rec.units.forEach((u) => {
          u[3] = K.us(u[3]);
        });
      }
      return rec;
    });
  K.loadProtein = loadProtein; // for other modules' drawings of a protein (kit-selview.js)

  // ---- website.protein.order / open: the folds in the site's order, and which of them start open --------------------------
  // Without a list the folds keep the page's own order. A fold the list lacks follows the one before it; one the page lacks is skipped.
  const PRO = D.protein_view || {};
  const FOLD_ORDER = PRO.order || [];
  K.hasData = { ...(K.hasData || {}) }; // fold id -> whether this protein has what it shows (the folds that open only then)
  // `open` is the site's list; without one, each fold's own default
  K.foldOrder = FOLD_ORDER;
  K.foldTouched = (id) => id in PV.open; // the reader has opened or closed it
  K.foldStarts = (id) => !!PRO.open?.includes(id); // the site starts it open (when it has what it shows)
  const foldOpen = (id, dflt) =>
    PRO.open ? PRO.open.includes(id) && (K.hasData[id] ? !!K.hasData[id]() : true) : dflt;
  const GROUPS = PRO.groups || [];
  function arrangeFolds(html, flat) {
    if (!FOLD_ORDER.length && !(GROUPS.length && !flat)) return html;
    const parts = html.split(/(?=<details class="pfold" id=")/),
      lead = /^<details class="pfold" id=/.test(parts[0]) ? '' : parts.shift();
    let at = -1,
      gi = 0;
    const keyed = parts.map((h, k) => {
      const id = (/^<details class="pfold" id="([^"]+)"/.exec(h) || [])[1],
        i = FOLD_ORDER.indexOf(id),
        g = GROUPS.findIndex((x) => (x.folds || []).includes(id));
      if (i >= 0) at = i;
      if (g >= 0) gi = g;
      return [flat ? 0 : gi, at, k, h];
    });
    keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    if (flat || !GROUPS.length) return lead + keyed.map((x) => x[3]).join('');
    // each group is a fold holding its folds; open when the reader opened it or one of its folds is open
    const out = GROUPS.map((g, n) => {
      const hs = keyed.filter((x) => x[0] === n).map((x) => x[3]);
      if (!hs.length) return '';
      const kids = hs.map((h) => /^<details class="pfold" id="[^"]+" open/.test(h)),
        open = PV.open[g.id] ?? kids.some(Boolean),
        n0 = kids.filter(Boolean).length;
      return (
        `<details class="pgroup" id="${esc(g.id)}"${open ? ' open' : ''}><summary><span class="pfm" ` +
        `aria-hidden="true"></span><h2>${esc(g.title)}</h2><span class="fsum">${hs.length} section${hs.length === 1 ? '' : 's'}${n0 ? `, ${n0} open` : ''}</span></summary>` +
        `<div class="pgroup-body">${
          g.switch && K.pfoldsSwitch ? `<div class="pheading pgroup-switch">${K.pfoldsSwitch()}</div>` : ''
        }${hs.join('')}</div></details>`
      );
    }).join('');
    return (
      lead +
      (`<div class="pgroup-tools"><button type="button" class="btn small" data-folds="open">Open ` +
        `all</button> <button type="button" class="btn small" data-folds="close">Close all</button></div>`) +
      out
    );
  }

  // ---- a protein's page: as the Methylarginine Site Explorer's ------------------------------------------------------
  const PV = {
    acc: '',
    rec: null,
    err: '',
    af: null,
    uni: null,
    uniJson: null,
    pdb: null,
    pdbAll: false,
    ix: null,
    site: null,
    span: null,
    spanArg: '',
    more: false,
    fn: false,
    open: {},
    scrolled: null,
    tb: null,
    evOpen: new Set(),
    pf: '',
    focus: '',
    qDone: false,
    light: null,
    lightP: null,
    lightAll: false,
    cleanArg: false,
  };
  // the page draws a section left empty while closed when it is opened (several at once, as Open all does, in one draw)
  const LATER_CHARS = 20000;
  let laterT = 0;
  function drawOpened() {
    clearTimeout(laterT);
    if (!document.querySelector('#view details.pfold[open] > .pfold-body[data-later]')) return false;
    document.querySelectorAll('#view details.pgroup, #view details.pfold').forEach((d) => {
      if (d.id) PV.open[d.id] = d.open;
    });
    K.render();
    return true;
  }
  K.drawOpenFolds = drawOpened; // the page's PDF and print open every section first (kit-export.js)
  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (d.classList?.contains('pfold') || d.classList?.contains('pgroup')) PV.open[d.id] = d.open;
      if (d.open && d.querySelector?.(':scope > .pfold-body[data-later]')) {
        clearTimeout(laterT);
        laterT = setTimeout(drawOpened, 0);
      }
    },
    true
  );
  // a reader opening a section sets the address to it; closing it takes it off again
  document.addEventListener('click', (e) => {
    const sum = e.target.closest?.('details.pfold > summary');
    if (!sum || e.target.closest('a, button, select, input')) return;
    const d = sum.parentElement;
    setTimeout(() => K.markSection?.(d.id, d.open));
  });
  document.addEventListener('click', (e) => {
    if (PV.more && !e.target.closest('.more-links')) {
      PV.more = false;
      const m = document.getElementById('more-menu');
      if (m) m.hidden = true;
    }
  });
  const SPECS = D.attribute_specs || {},
    AT = D.mark_attributes || [];
  function load(acc) {
    if (PV.acc === acc) return;
    Object.assign(PV, {
      acc,
      rec: null,
      err: '',
      af: null,
      uni: null,
      uniJson: null,
      pdb: null,
      pdbAll: false,
      ix: null,
      span: null,
      spanArg: '',
      more: false,
      fn: false,
      open: {},
      scrolled: null,
      tb: null,
      evOpen: new Set(),
      pf: '',
      focus: '',
      qDone: false,
      light: null,
      lightP: null,
      lightAll: false,
    });
    K.map?.reset();
    // the protein's tables (website.tables): the card, the sites table and the Evidence rows fill in when they arrive
    K.card?.load(acc).then((tb) => {
      if (PV.acc === acc) {
        PV.tb = tb || {};
        K.render();
      }
    });
    loadProtein(acc).then(
      (r) => {
        if (PV.acc === acc) {
          PV.rec = r;
          K.render();
        }
      },
      () => {
        if (PV.acc === acc) {
          PV.err =
            location.protocol === 'file:'
              ? 'This copy of the website cannot read the protein files from disk. Open the hosted ' +
                'site, or index.html through a local web server.'
              : 'The protein’s file could not be read.';
          K.render();
        }
      }
    );
  }
  const AF_BINS = [
    [90, '#0053d6', 'very high (pLDDT > 90)'],
    [70, '#65cbf3', 'confident (70–90)'],
    [50, '#ffdb13', 'low (50–70)'],
    [0, '#ff7d45', 'very low (< 50)'],
  ];
  const afColour = (v) => AF_BINS.find(([t]) => v > t || t === 0)[1];
  const mapCtx = () => ({
    p: byAcc[PV.acc] || PV.lightP,
    rec: PV.rec,
    uni: PV.uniJson,
    uniFailed: PV.uniFailed,
    af: PV.af && !PV.af.failed && !PV.af.none ? PV.af : null,
    afFailed: PV.af?.failed,
    afNone: PV.af?.none,
    selected: K.sel?.active() ? K.sel.selectedPositions(PV.acc) : null,
    site: PV.site,
    span: PV.span,
  });
  // the headline tiles in as even rows as fit: the columns that leave no row with a single tile (--hl-cols; the CSS grid auto-fits within it)
  const balanceTiles = () =>
    document.querySelectorAll('.hl-cards').forEach((g) => {
      const n = g.children.length,
        em = parseFloat(getComputedStyle(g).fontSize) || 16,
        w = g.clientWidth;
      if (!n || !w) return;
      const gap = 0.7 * em,
        max = Math.max(1, Math.floor((w + gap) / (12 * em + gap))),
        rows = Math.ceil(n / max);
      g.style.setProperty('--hl-cols', String(Math.ceil(n / rows)));
    });
  (K.afterRender ||= []).push(balanceTiles, () => {
    if (S.view !== 'protein' || !PV.rec || PV.acc !== String(S.arg).split('/')[0]) return;
    const now = PV.acc + '/' + (PV.site ?? '');
    if (now !== followed) {
      followed = now;
      K.site.follow(PV.acc, PV.site);
    }
  });
  addEventListener('resize', balanceTiles);
  // the map's downloads, with the export size and resolution folded into the same bar
  K.protState = () => ({
    acc: PV.acc,
    p: byAcc[PV.acc] || PV.lightP,
    rec: PV.rec,
    tb: PV.tb,
    af: PV.af,
    siteName: (pos) => siteOf(byAcc[PV.acc] || PV.lightP || { acc: PV.acc }, pos),
  });
  const mapExp = (kinds) =>
    K.expBar(kinds, 'mexp', 'the map', 'sources').replace(/<\/div>$/, (K.map?.exportOpts?.() || '') + '</div>');
  function drawMap() {
    const el = document.getElementById('pmap');
    if (el && PV.rec) K.map.render(el, mapCtx());
  }
  const site = (pos) => siteOf(byAcc[PV.acc] || PV.lightP || { acc: PV.acc }, pos);
  function markClasses(m) {
    return COLS.map((aid, k) => [aid, m[2][k]]);
  }
  // the sites table's question columns: the site file's (website.sites.columns) and those with tags (motifs), unless
  // every question is asked for
  function classText(aid, v) {
    if (!v) return '–';
    const a = A[aid];
    if (!a) return v;
    return a.shape === 'flags'
      ? v
          .split(';')
          .map((c) => label(aid, c))
          .join(', ')
      : label(aid, v);
  }
  // a mark's attributes, as the site file describes them: with links for a list that has them (each study to its paper)
  const attrVal = (m, name) => K.cols.markAttr(m, name) ?? '';
  // the cell lines (or other entities) the site file names for each change of a list attribute at this site (a map row's
  // from.names), each linked where the row gives a link; '' while the map's items load or when no row names any
  function namedLines(m, name) {
    const N = K.map?.namedChanges?.(PV.acc, SPECS[name].column),
      hits = N && N.at.get(m[0]);
    if (!hits?.length) return '';
    const p = byAcc[PV.acc] || PV.lightP,
      one = ([id, nm, group]) =>
        N.link
          ? `<a href="${esc(N.link.replace('{id}', encodeURIComponent(id)))}" target="_blank" rel="noopener" title="${esc(
              [group, id].filter(Boolean).join(' · ')
            )}">${esc(nm || id)}</a>`
          : esc(nm || id);
    return hits
      .map(
        (h) =>
          `<div class="sc-names small"><span class="muted">${esc(N.title)}, </span><b>${esc(
            h.change.replace(/^([A-Za-z])(\d+)(?=[A-Za-z*])/, (m0, a, d) => (+d === m[0] ? a + shownPos(p, m[0]) : m0))
          )}</b>: ${h.list.map(one).join(', ')}${h.more ? ` and ${int(h.more)} more` : ''}</div>`
      )
      .join('');
  }
  (K.mapReady ||= []).push(() => {
    if (
      PV.rec &&
      PV.site &&
      Object.values(SPECS).some((s) => s.kind === 'list' && K.map?.namedChanges?.(PV.acc, s.column))
    )
      K.render();
  });
  // the card's "Other marks nearby", from the map's one count (K.map.nearMarks): the window is printed, and a kind with a score
  // cut-off says what that cut-off leaves ("Phosphosite with score ≥ 0.5: none"); the run's own column is the fallback until the map's items load
  const nearCard = (p, m) => {
    const nm = K.map?.nearMarks?.(p.acc, [m[0]]);
    if (!nm) return '';
    const sg = (d) => `${d > 0 ? '+' : '−'}${Math.abs(d)}`,
      at = (x) => K.prot.siteLabel(p.acc, x.pos),
      hits = nm.kinds
        .flatMap((k) => k.near.map((x) => ({ k, ...x })))
        .sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist) || a.dist - b.dist);
    const cuts = nm.kinds
      .filter((k) => k.high != null)
      .map((k) => {
        const hs = k.near.filter((x) => k.score.has(x.pos));
        return `${esc(k.label)} with ${esc(k.cut)}: ${hs.length ? hs.map((x) => esc(at(x))).join(', ') : 'none'}`;
      });
    return (
      `<span class="muted">within ±${nm.win} aa:</span> ` +
      (hits.length ? hits.map((x) => `${esc(x.k.label)} ${esc(at(x))} (${sg(x.dist)})`).join(', ') : 'none') +
      (cuts.length ? `<br><span class="muted">${cuts.join(' · ')}</span>` : '')
    );
  };
  function attrHtml(m, name, full) {
    const s = SPECS[name],
      v = attrVal(m, name);
    if (!s) return esc(v);
    if (s.kind === 'list') {
      const sep = s.separator || '; ',
        vals = v ? v.split(sep) : [],
        ids = s.link ? attrVal(m, name + '.link').split(sep) : [];
      if (K.density.compact() && !full && vals.length > 1 && !K.sel.isPapers(name)) {
        // compact rows: the first one and "+n" (all on hover)
        return (
          `<span class="src-tags">${K.sel.listHtml(
            name,
            vals.slice(0, 1),
            ids.slice(0, 1),
            PV.acc,
            full
          )}<span class="tag ` +
          `more" title="${esc(vals.map((x) => vLabel(name, x)).join('\n'))}">+${vals.length - 1}</span></span>`
        );
      }
      return K.sel.listHtml(name, vals, ids, PV.acc, full) + (full ? namedLines(m, name) : '');
    }
    return esc(K.sel?.valueLabel ? K.sel.valueLabel(name, v) : v);
  }
  // what a site card or tip lists: the attributes a site has a value for (a colored one always), and not a yes/no
  // attribute whose column another attribute shows in full (the changes rather than "changed")
  const detailOf = (n) =>
    Object.keys(SPECS).some((o) => o !== n && SPECS[o].column === SPECS[n].column && !SPECS[o].present);
  const shownAttrs = (m) =>
    Object.keys(SPECS).filter((n) => !(SPECS[n].present && detailOf(n)) && (attrVal(m, n) !== '' || SPECS[n].colour));
  const pillOf = (m, k) => {
    const rc = K.map.readable(K.map.attrColour(k, attrVal(m, k)));
    const txt = String(K.sel?.valueLabel ? K.sel.valueLabel(k, attrVal(m, k)) : attrVal(m, k)),
      // a trailing bracketed note is dropped in compact rows (the dot and the short name stay; the pill keeps it all)
      cut = /^(.*?\S)\s+(\([^()]*\))$/.exec(txt);
    return (
      `<span class="state-pill" ` +
      `style="--c:${rc.bg};--t:${rc.fg}" title="${esc(SPECS[k].label + ': ' + txt)}"><i class="sp-dot" aria-hidden="true"></i>${
        cut ? `${esc(cut[1])}<span class="sp-x"> ${esc(cut[2])}</span>` : esc(txt)
      }</span>`
    );
  };
  const statePill = (m) => {
    const k = Object.keys(SPECS).find((n) => SPECS[n].colour && SPECS[n].kind === 'category');
    return k ? pillOf(m, k) : '';
  };
  // what a single protein's counts cannot say, in one sentence that points to the dataset-wide tests (one protein's marks
  // are not independent, so the page makes no test of them)
  const shownOf = (r) => (K.valOf ? K.valOf(r) : r.eff);
  const untestedNote = () =>
    `<p class="muted small p-untested">Whether a class is unusual for ${esc(W.marks)} is tested across the whole dataset, ` +
    `not for one protein: <a href="${esc(K.link('overview'))}">see the questions on the Overview</a>.</p>`;
  const winHtml = (w) => {
    const c = Math.floor(w.length / 2);
    return `<span class="win">${esc(w.slice(0, c))}<b>${esc(w[c])}</b>${esc(w.slice(c + 1))}</span>`;
  };
  // the links every protein has
  // the links every protein has: the kit's list (config/protein_links.json), the site's own (website.protein.links), and
  // each input's own page for the protein (a manifest entry's record), without repeats
  const LINKS = (acc) => {
    const fill = (u) =>
      u
        .replace('{acc}', encodeURIComponent(acc))
        .replace(/[&?][a-z_]+=\{species\}/, (m) => (IXP ? m.replace('{species}', IXP.species) : ''));
    const own = Object.values(D.inputs || {})
      .filter((x) => x.record)
      .map((x) => ({
        label:
          (String(x.version || '').match(/^[^\d(]+/) || [''])[0].trim() ||
          (() => {
            try {
              return new URL(x.record).host;
            } catch (e) {
              return 'source';
            }
          })(),
        url: x.record,
      }));
    const all = [
      ...(D.protein_view?.default_links === false ? [] : D.protein_links || []),
      ...(D.protein_view?.links || []),
      ...own,
    ].map((l) => [l.label, fill(l.url)]);
    return all.filter(([, u], k) => all.findIndex(([, v]) => v === u) === k);
  };
  // ---- numbering: a protein the site file numbers as papers do (website.protein.numbering: histones without the
  // initiator methionine, say) shows position + offset everywhere, and a link's position is read the same way ----------
  const numOf = K.numbering; // one rule for every view (kit-select.js)
  const genesOf = (p) => D.protein_genes?.[p?.acc] || []; // the genes of a protein several genes encode
  const shownPos = (p, pos) => pos + (numOf(p)?.offset || 0);
  // the line a download adds when the protein is numbered as papers do: the shown numbers beside UniProt's
  const numNote = (p) =>
    numOf(p)
      ? ` ${numOf(p).note || 'Numbered as papers do'}: the site and shown_range columns use it, position, start and end are UniProt positions.`
      : '';
  // residues the page leaves out at the start (the initiator methionine, numbered 0 by the rule's -1 offset), and the
  // length of the protein as the page numbers it
  const dropped = (p) => Math.max(0, -(numOf(p)?.offset || 0));
  const shownLen = (p, rec) => Math.max(0, (rec.seq || '').length - dropped(p));
  const rangeOf = (p, a, b) => `${Math.max(1, shownPos(p, a))}–${Math.max(1, shownPos(p, b))}`;
  const uniPos = (p, n) => n - (numOf(p)?.offset || 0);
  const resAt = (p, pos) => (PV.acc === p?.acc && PV.rec?.seq?.[pos - 1]) || residueOf(p, pos);
  const siteOf = (p, pos) => `${resAt(p, pos) || ''}${shownPos(p, pos)}`;
  // for other modules (the map, the 3D viewer): a position as this site shows it, and a site's name
  K.prot = {
    // a protein's gene where the release lists it, else ''; and whether it has a page
    gene: (acc) => byAcc[acc]?.gene || '',
    isListed: (acc) => !!byAcc[acc],
    // the listed protein a gene symbol (current, previous or alternative) names, else ''; never a free-text alias
    byName: (name) => P_SYM[String(name || '').toUpperCase()] || '',
    summaryAt,
    loadUni,
    uniLoaded: (acc) => !!UNI[acc]?.done,
    shownPos: (acc, pos) => shownPos(byAcc[acc] || (PV.acc === acc ? PV.lightP : null), pos),
    siteLabel: (acc, pos) => siteOf(byAcc[acc] || (PV.acc === acc ? PV.lightP : null) || { acc }, pos),
    numbering: (acc) => numOf(byAcc[acc] || (PV.acc === acc ? PV.lightP : null)),
    // a stretch as the page numbers it: its first residue is 1 even where the initiator methionine (0) is inside it
    range: (acc, a, b) => rangeOf(byAcc[acc] || (PV.acc === acc ? PV.lightP : null), a, b),
    // the first residue the page shows (2 where the initiator methionine, numbered 0, is left out) and the protein's length as numbered
    first: (acc) => 1 + dropped(byAcc[acc] || (PV.acc === acc ? PV.lightP : null)),
    length: (acc, n) => n - dropped(byAcc[acc] || (PV.acc === acc ? PV.lightP : null)),
    tables: (acc) => (PV.acc === acc ? PV.tb || null : null),
    // the mean AlphaMissense score of a site's substitutions: undefined until AlphaFold DB's file for the open protein is in (or
    // when it has none), else {sum, n} (read live for the open protein only)
    // AlphaFold's confidence at a site, as the site card shows it (read live for the open protein; null until the file is in)
    plddt: (acc, pos) => (PV.acc === acc ? plddtAt(byAcc[acc] || PV.lightP || { len: -1 }, pos) : null),
    am: (acc, pos) => (PV.acc === acc ? PV.af?.am?.get?.(pos) : undefined),
    amReady: (acc) => PV.acc === acc && !!PV.af?.am,
    // a mark's state as its colored pill and as text (the site's first colored category attribute); '' without one
    statePill: (m) => statePill(m),
    stateLabel: () => {
      const k = Object.keys(SPECS).find((n) => SPECS[n].colour && SPECS[n].kind === 'category');
      return k ? SPECS[k].label : '';
    },
    stateText: (m) => {
      const k = Object.keys(SPECS).find((n) => SPECS[n].colour && SPECS[n].kind === 'category');
      return k ? String(K.sel?.valueLabel ? K.sel.valueLabel(k, attrVal(m, k)) : attrVal(m, k)) : '';
    },
  };

  // ---- the site card: one mark, everything the site knows about it, from its attributes and tables ----------------
  const CC = D.protein_view?.card || {},
    TC = D.protein_view?.table || null;
  const cardCtx = (p, rec, m, tb = PV.tb, attr = (n) => attrVal(m, n)) => ({
    p,
    rec,
    m,
    tb: tb || {},
    acc: p.acc,
    pos: m[0],
    gene: p.gene || p.acc,
    label: siteOf(p, m[0]),
    seq: rec.seq || '',
    window: m[1],
    shown: (q) => shownPos(p, q),
    attr,
    attrHtml: (n, v) => K.sel.listHtml(n, [v], [], p.acc, true),
    isListed: (a) => !!byAcc[a],
  });
  // the attributes a block of the card shows, so they are not listed again among the rest
  const USED = (() => {
    const ev = CC.evidence || {},
      u = new Set(
        [
          ev.status,
          ev.tags?.attribute,
          ...(CC.states || []).map((s) => s.attribute),
          ...(CC.changes || []).map((x) => x.attribute),
          ...Object.keys(CC.calls?.attributes || {}),
          CC.cite?.attribute,
          CC.records?.groups,
          ...(CC.hide || []),
        ].filter(Boolean)
      );
    if ((CC.states || []).length) {
      const k = Object.keys(SPECS).find((n) => SPECS[n].colour && SPECS[n].kind === 'category');
      if (k) u.add(k);
    }
    return u;
  })();
  const CL_WORDS = {
    states: 'State by source',
    calls: 'Perturbations',
    changes: 'Changes',
    germline: 'Germline variants',
    reported: 'Reported by',
    ...(CC.labels || {}),
  };
  const nearestOf = (rec, pos) => {
    const o = rec.marks.filter((x) => x[0] !== pos).map((x) => x[0]);
    return o.length ? o.reduce((b, x) => (Math.abs(x - pos) < Math.abs(b - pos) ? x : b)) : null;
  };
  const plddtAt = (p, pos) => (PV.af?.plddt && PV.af.plddt.length === p.len ? PV.af.plddt[pos - 1] : null);
  const plddtHtml = (p, pos) => {
    const v = plddtAt(p, pos);
    return v == null
      ? '<span class="muted">–</span>'
      : `<span class="pl-sq" ` + `style="--c:${afColour(v)}"></span>${Number(v).toFixed(0)}`;
  };
  // a flag listed twice (one per bound region) is one tag with its count
  const flagTags = (aid, v) => {
    if (!v) return '';
    const n = new Map();
    v.split(';').forEach((c) => n.set(c, (n.get(c) || 0) + 1));
    return `<div class="tags">${[...n]
      .map(
        ([c, k]) =>
          `<span class="tag" title="${esc(help(aid, c))}">${esc(label(aid, c))}${k > 1 ? ` ×${k}` : ''}</span>`
      )
      .join('')}</div>`;
  };
  // the card of a mark shown and counted nowhere (K.shown): its window, attributes and tag, said to be not counted
  function shownCard(p, rec, m) {
    const kv = (dt, dd, tip) =>
      dd ? `<div><dt${tip ? ` title="${esc(tip)}"` : ''}>${dt}</dt><dd>${dd}</dd></div>` : '';
    const skip = new Set([
      ...(K.shown.cfg.tests?.attributes || []),
      ...(K.shown.cfg.also || []),
      ...(K.shown.cfg.counted?.when || []).map((c) => c.attribute),
    ]); // the counted ones' attribute says nothing of these
    const rows =
      kv('Sequence (±7 residues)', `<span class="mono">${winHtml(m[1])}</span>`) +
      kv(esc(cap(K.shown.label())), esc(K.shown.tip(m, true))) +
      shownAttrs(m)
        .filter((n) => !skip.has(n) && attrVal(m, n) !== '')
        .map((n) => kv(esc(SPECS[n].label), attrHtml(m, n, true), SPECS[n].help))
        .join('');
    return (
      `<section class="site-card" id="site-card"><div class="card-head"><div><p class="eyebrow">Selected ${esc(W.residue.replace(/^an? /, ''))} · ${esc(K.shown.row())}</p><h3>${esc(p.gene || p.acc)} ${esc(siteOf(p, m[0]))} ${statePill(m)} ${K.shown.tag(m, true)}</h3></div>` +
      (`<span class="tools">${
        typeof K.show3d === 'function' ? '<button type="button" class="btn small" data-site-3d>Show in 3D</button>' : ''
      }<button type="button" ` +
        `class="btn small" data-site-close aria-label="Clear selection" title="Clear selection">×</button></span></div>`) +
      (`<p class="note small">Shown for reference only: not one of the ${int(D.counts.marks)} ${esc(W.marks)} counted here, ` +
        `and in no count, chart or test.</p><dl class="sc-kv">${rows}</dl></section>`)
    );
  }
  const shownAt = (rec, pos) => (rec.shown || []).find((x) => x[0] === pos);
  // opening an address with a site lands on the card's header (under the sticky bar); the page above it settles for several
  // seconds (UniProt's text, AlphaFold, Ensembl, RCSB), so the target is kept pinned until the reader acts
  let moved = false,
    scrolled = scrollY > 0; // the reader has scrolled the page itself since the last click, key or address change (or before
  // the kit loaded): a landing that starts later (the card is drawn only when its data arrives) must not take the page back
  let at = location.hash.split('?')[0];
  const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
  ['wheel', 'touchstart', 'keydown', 'mousedown', 'pointerdown', 'click'].forEach((ev) =>
    addEventListener(
      ev,
      (e) => {
        moved = true;
        scrolled = ev === 'wheel' || ev === 'touchstart' || (ev === 'keydown' && SCROLL_KEYS.includes(e.key));
        at = location.hash.split('?')[0];
      },
      { passive: true, capture: true }
    )
  );
  ['hashchange', 'popstate'].forEach((ev) =>
    addEventListener(ev, () => {
      // another page (a section or option changing the address on the same page does not count)
      if (location.hash.split('?')[0] !== at) scrolled = false;
    })
  );
  // a target (found by `find`, as the page is drawn again) scrolled to just below the sticky toolbar and kept there: on every
  // size change above it, and on any scroll that moves it, its measured top is put back (no browser anchoring needed). Held
  // until the reader scrolls, clicks or presses a key, `keep()` fails, 15 s pass, or the page's own fetches (K.inflight, from
  // kit-openlink.js) have all settled and the page has stopped growing for 4 s; the one landing every in-page address uses (K.landOn)
  let landing = 0; // the landing in progress; a new one replaces it
  function landOn(find, keep = () => true) {
    if (scrolled) return;
    moved = false;
    const id = ++landing,
      t0 = Date.now();
    let quiet = 0,
      lastH = 0,
      ro = null,
      poll = 0;
    const live = () => id === landing && !moved && keep() && Date.now() - t0 < 15000;
    // the browser's own scroll anchoring moves the page when a section above is redrawn, then the pin moves it back: off
    // while the pin holds, so the page does not jump in between
    const root = document.documentElement;
    root.style.overflowAnchor = 'none';
    let follow = false, // the reader has taken over: the pin is gone, but the page may still grow above the view
      ref = null,
      refTop = 0;
    const mine = () => id === landing;
    const pick = () => {
      const e = document.elementFromPoint(innerWidth / 2, innerHeight * 0.4);
      ref = e && e !== root && e !== document.body ? e : null;
      refTop = ref ? ref.getBoundingClientRect().top : 0;
    };
    // after the release the element the reader looks at is kept where it is when content above it changes height; a reader's
    // own scroll (which fires a scroll event before the size observer runs) takes a new reference
    const hold = () => {
      if (!mine()) return;
      if (ref?.isConnected) {
        const d = ref.getBoundingClientRect().top - refTop;
        if (Math.abs(d) > 1) scrollBy(0, d);
      }
      pick();
    };
    const end = () => {
      if (mine()) root.style.overflowAnchor = '';
      ro?.disconnect();
      clearInterval(poll);
      removeEventListener('scroll', go);
      removeEventListener('scroll', pick);
    };
    const stop = () => {
      // release the pin: no re-land, timer or observer of it survives; keep only the reference hold until the page settles
      ro?.disconnect();
      clearInterval(poll);
      removeEventListener('scroll', go);
      if (!mine() || follow) return;
      follow = true;
      pick();
      addEventListener('scroll', pick, { passive: true });
      if (window.ResizeObserver) {
        ro = new ResizeObserver(hold);
        ro.observe(root);
        ro.observe(document.getElementById('view') || document.body);
      }
      const t1 = Date.now();
      let q = 0,
        h0 = 0;
      poll = setInterval(() => {
        if (!mine()) return end();
        hold();
        const hgt = root.scrollHeight;
        q = (K.inflight?.() ?? 1) > 0 || hgt !== h0 ? 0 : q + 250;
        h0 = hgt;
        if ((q >= 2000 && Date.now() - t1 > 1000) || Date.now() - t1 > 20000) end();
      }, 250);
    };
    function go() {
      if (follow) return;
      if (!live()) return stop();
      const t = find();
      if (!t) return;
      // the sticky bars' real height (the toolbar and the strip above it; on a phone the strip alone)
      const st = getComputedStyle(root),
        h = parseFloat(st.getPropertyValue('--sticky-h')) || parseFloat(st.getPropertyValue('--toolbar-h')) || 0,
        want = Math.max(0, t.getBoundingClientRect().top + scrollY - h - 12);
      if (Math.abs(want - scrollY) > 1) scrollTo(0, want);
    }
    requestAnimationFrame(go);
    // the page above the target changes height as the map and the lazy sections arrive: land again on each change, before it
    // is painted, so the target stays put
    if (window.ResizeObserver) {
      ro = new ResizeObserver(go);
      ro.observe(root);
      ro.observe(document.getElementById('view') || document.body);
    }
    addEventListener('scroll', go, { passive: true });
    poll = setInterval(() => {
      if (follow) return;
      if (!live()) return stop();
      go();
      // settled: nothing in flight and the page's height unchanged for 4 s, and at least 8 s since the address opened
      const hgt = root.scrollHeight;
      quiet = (K.inflight?.() ?? 1) > 0 || hgt !== lastH ? 0 : quiet + 250;
      lastH = hgt;
      if (quiet >= 4000 && Date.now() - t0 > 8000) stop() || end();
    }, 250);
  }
  K.landOn = landOn;
  // the fold of a protein's page that holds a question's facts about that one protein (the site file's protein_view.context, and
  // the cell fold), or '' when the question is about the dataset
  K.proteinHome = (aid) => {
    const ctx = D.protein_view?.context || {},
      f = Object.keys(ctx).find((k) => (ctx[k] || []).includes(aid));
    return f && FOLDS.includes(f) ? f : K.cellHome?.(aid) || '';
  };
  const landOnCard = () =>
    landOn(
      () => {
        const card = document.getElementById('site-card');
        return K.openedIn?.(card) || card;
      },
      () => PV.site
    );
  // a module whose facts arrive after the card is drawn (conservation) draws the card again
  K.redrawSiteCard = (acc) => {
    const p = byAcc[acc],
      card = document.getElementById('site-card');
    if (card && p && PV.acc === acc && PV.site && PV.rec) card.outerHTML = siteCard(p, PV.rec);
    if (PV.acc === acc) K.siteTable?.refresh();
  };
  // the variant lists arrive after the card is drawn: draw its variants again with the conditions
  K.card.vc.onDetail((acc) => {
    const p = byAcc[acc],
      card = document.getElementById('site-card');
    if (card && p && PV.acc === acc && PV.site && PV.rec) card.outerHTML = siteCard(p, PV.rec);
  });
  const SC_OPEN = new Map(); // a group of the site card the reader opened or closed, kept as the card is redrawn
  document.addEventListener(
    'toggle',
    (e) => {
      const g = e.target?.dataset?.scGroup;
      if (g) SC_OPEN.set(g, e.target.open);
    },
    true
  );
  function siteCard(p, rec) {
    const sm = !rec.marks.some((x) => x[0] === PV.site) && K.shown?.on ? shownAt(rec, PV.site) : null;
    if (sm) return shownCard(p, rec, sm);
    const m = rec.marks.find((x) => x[0] === PV.site);
    if (!m) return '';
    const c = cardCtx(p, rec, m),
      num = numOf(p);
    const uniAt = (PV.uniJson?.features || []).filter(
      (f) =>
        f.location?.start?.value === m[0] &&
        f.location?.end?.value === m[0] &&
        ['Modified residue', 'Natural variant', 'Mutagenesis', 'Cross-link'].includes(f.type)
    );
    const pm = (f) => [...new Set((f.evidences || []).filter((e) => e.source === 'PubMed').map((e) => e.id))];
    const near = nearestOf(rec, m[0]),
      pl = plddtAt(p, m[0]);
    const featLine = (f) => {
      const alt = f.alternativeSequence
        ? `${f.alternativeSequence.originalSequence || ''}${shownPos(p, m[0])}${(
            f.alternativeSequence.alternativeSequences || []
          ).join('/')}`
        : '';
      const snp = [...new Set((f.featureCrossReferences || []).filter((x) => x.database === 'dbSNP').map((x) => x.id))];
      const desc = String(f.description || '')
        .replace(/;?\s*dbSNP:rs\d+/g, '')
        .trim();
      return `${esc(f.type)}${alt ? ' <b>' + esc(alt) + '</b>' : ''}${desc ? ': ' + esc(desc) : ''}${
        snp.length
          ? ' · ' +
            snp
              .map(
                (id) =>
                  `<a href="https://www.ncbi.nlm.nih.gov/snp/${esc(id)}" target="_blank" ` +
                  `rel="noopener">${esc(id)}</a>`
              )
              .join(', ')
          : ''
      }${
        f.featureId
          ? ` · <a href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}/entry#disease_variants" ` +
            `target="_blank" rel="noopener">${esc(f.featureId)}</a>`
          : ''
      }${pm(f).length ? ' (PubMed ' + K.papers.links(K.papers.ids(pm(f))) + ')' : ''}`;
    };
    const kv = (dt, dd, tip) =>
      dd ? `<div><dt${tip ? ` title="${esc(tip)}"` : ''}>${dt}</dt><dd>${dd}</dd></div>` : '';
    // both front ends put the variants first: UniProt's natural variants at this residue (disease named), then the site's changes in cancers
    const uniShow = uniAt.filter((f) => f.type !== 'Natural variant'),
      uniVar = uniAt.filter((f) => f.type === 'Natural variant');
    const ready = !!PV.tb,
      wait = '<span class="muted">loading…</span>';
    const tagged = new Set(K.shown?.on ? [...(K.shown.cfg.tests?.attributes || []), ...(K.shown.cfg.also || [])] : []);
    // the marks nearby are a line of the summary at the top of the card, not a row of the rest
    const NEAR = SPECS.ctx_near && shownAttrs(m).includes('ctx_near') ? 'ctx_near' : '';
    const rest = shownAttrs(m).filter((n) => !USED.has(n) && !tagged.has(n) && n !== NEAR);
    // the question rows: one row for the questions a merge names (the same question at several windows), none for those hidden
    // (they repeat a block above), the ones with nothing to say as one line, and the less used ones behind "All site features"
    const MG = CC.merge || [],
      HQ = new Set(CC.hide_questions || []),
      PQ = CC.primary_questions ? new Set(CC.primary_questions) : null;
    const used = new Set(MG.flatMap((g) => g.analyses || [])),
      qv = Object.fromEntries(markClasses(m));
    const merged = (g) => {
      const parts = (g.analyses || [])
        .map((aid, i) => ({ aid, part: (g.parts || [])[i] || '', v: qv[aid] }))
        .filter((x) => x.v && A[x.aid]);
      if (!parts.length) return '';
      const strip = g.strip ? new RegExp(g.strip) : null,
        by = new Map();
      parts.forEach((x) => {
        const t = classText(x.aid, x.v)
          .replace(strip || /$^/, '')
          .trim();
        if (!by.has(t)) by.set(t, []);
        by.get(t).push(x);
      });
      const lines = [...by].map(
        ([t, xs]) =>
          `<span title="${esc(
            xs.map((x) => (A[x.aid]?.title || x.aid) + ': ' + classText(x.aid, x.v)).join('\n')
          )}">${esc(t)}${by.size === 1 && xs.length === parts.length ? '' : ''} <span class="muted ` +
          `small">(${xs
            .map((x) => esc(x.part))
            .filter(Boolean)
            .join(', ')})</span></span>`
      );
      return kv(esc(g.label), lines.join('<br>'));
    };
    const qrows = [],
      qmore = [],
      nones = [];
    markClasses(m).forEach(([aid, v]) => {
      if (used.has(aid) || HQ.has(aid)) return;
      const isFlags = A[aid]?.shape === 'flags';
      if (isFlags && !v) {
        nones.push(A[aid]?.title || aid);
        return;
      }
      const row = kv(
        esc(A[aid]?.title || aid),
        isFlags ? flagTags(aid, v) : `<span title="${esc(help(aid, v))}">${esc(classText(aid, v))}</span>`
      );
      (!PQ || PQ.has(aid) ? qrows : qmore).push(row);
    });
    MG.forEach((g) => {
      const r = merged(g);
      if (r) (!PQ || PQ.has(g.analyses[0]) || g.primary ? qrows : qmore).push(r);
    });
    const amv = PV.af?.am?.get?.(m[0]),
      // AlphaMissense is less reliable in disordered regions: say so when the site lies in one (the map's disorder tracks)
      amKinds = new Set((D.tracks || []).filter((t) => t.style === 'disorder').map((t) => t.kind)),
      amDis = (PV.rec?.units || []).some((u) => amKinds.has(u[0]) && m[0] >= u[1] && m[0] <= u[2]),
      amCls = (v) => (v >= 0.564 ? 'likely pathogenic' : v >= 0.34 ? 'ambiguous' : 'likely benign');
    const afRow =
      pl != null || amv
        ? kv(
            'AlphaFold',
            `${
              pl != null ? `<span class="pl-sq" style="--c:${afColour(pl)}"></span>pLDDT ${Number(pl).toFixed(0)}` : ''
            }${
              amv?.n
                ? `${pl != null ? ' · ' : ''}<span title="Mean ` +
                  `AlphaMissense pathogenicity of the ${amv.n} substitutions of this residue">AlphaMissense ${(amv.sum / amv.n).toFixed(2)} <span class="muted">(${amCls(amv.sum / amv.n)})</span>${amDis ? ' <span class="muted">· disordered region: less reliable</span>' : ''}</span>`
                : ''
            }`,
            'AlphaFold DB: the model’s confidence at this residue and the mean AlphaMissense score of its substitutions (AlphaMissense is less reliable in disordered regions)'
          )
        : '';
    // the card's rows in groups, each a fold: the site itself, the questions it answers, and the rest (the less used closed)
    const group = (id, title, rows, open) =>
      rows
        ? `<details class="sc-group" data-sc-group="${id}"${id === 'records' ? ' id="sc-uniprot"' : ''}${
            (SC_OPEN.has(id) ? SC_OPEN.get(id) : open) ? ' open' : ''
          }><summary>${esc(title)}</summary><dl class="sc-kv">${rows}</dl></details>`
        : '';
    // position: the sequence, the model's confidence, the neighbor and the question rows; the sources' states and calls are the experiments
    const siteRows =
        kv('Sequence (±7 residues)', `<span class="mono">${winHtml(m[1])}</span>`) +
        afRow +
        (near != null
          ? kv(`Nearest other ${esc(W.mark)}`, `${esc(siteOf(p, near))}, ${int(Math.abs(near - m[0]))} aa away`)
          : '') +
        qrows.join(''),
      expRows =
        ((CC.states || []).length ? kv(esc(CL_WORDS.states), ready ? K.card.states(c) : wait) : '') +
        (CC.calls ? kv(esc(CL_WORDS.calls), ready ? K.card.calls(c) : wait) : '');
    const uniRow = kv(
      `UniProt at ${esc(siteOf(p, m[0]))}`,
      PV.uniJson
        ? (uniShow.length
            ? uniShow.map(featLine).join('<br>')
            : '<span class="muted">no feature at this residue</span>') +
            (` <span class="muted">` +
              `· <a href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}/entry#ptm_processing">UniProt ${esc(p.acc)}</a></span>`)
        : '<span class="muted">Loading from UniProt…</span>'
    );
    const citeRow =
      CC.cite?.attribute && SPECS[CC.cite.attribute] ? kv(esc(CL_WORDS.reported), K.card.reportedBy(c)) : '';
    const restRows =
      rest.map((n) => kv(esc(SPECS[n].label), attrHtml(m, n, true), SPECS[n].help)).join('') +
      (K.shown?.on && K.shown.counted(m) ? kv(esc(cap(K.shown.label())), esc(K.shown.tip(m, false))) : '');
    // the Overview's order: mutations, interactions, position, experiments, then the sources and the UniProt lines, and the
    // other attributes as one closed list
    const siteHtml =
      group('site', 'Position in the protein', siteRows, true) + group('experiments', 'Experiments', expRows, true);
    const srcHtml = group('records', 'UniProt and sources', uniRow + citeRow, true);
    const nMore = qmore.length + rest.length + (K.shown?.on && K.shown.counted(m) ? 1 : 0),
      moreHtml = group('questions', `Other attributes (${nMore})`, qmore.join('') + restRows, false);
    const ev = ready ? K.card.evidenceBlock(c) : '',
      recs = ready ? K.card.recordsBlock(c) : '',
      wr = ready ? K.card.writerBlock(c) : '';
    const hasEvRow =
      ready &&
      (K.card.has(CC.sources?.table) ||
        (CC.tables || []).some((x) => K.card.has(x.table)) ||
        (CC.calls?.tables || []).some(K.card.has));
    const varBlock =
      `<details class="sc-vars" id="sc-variants" data-sc-group="variants"${SC_OPEN.get('variants') === true ? ' open' : ''} aria-label="Variants at ${esc(siteOf(p, m[0]))}"><summary><h4>Variants at ${esc(siteOf(p, m[0]))}</h4></summary><dl ` +
      `class="sc-kv">` +
      kv(
        'UniProt variants',
        PV.uniJson
          ? uniVar.length
            ? uniVar.map(featLine).join('<br>')
            : '<span class="muted">none reported at this residue</span>'
          : '<span class="muted">Loading from UniProt…</span>'
      ) +
      ((CC.changes || []).length || (CC.change_counts || []).length
        ? kv(esc(CL_WORDS.changes), ready ? K.card.changes(c) : wait)
        : '') +
      ((CC.variant_counts || []).length ? kv(esc(CL_WORDS.germline), ready ? K.card.variants(c) : wait) : '') +
      // one line: this site's O/E (changes seen over changes expected from its codon) and q in each source
      (K.prop
        ? kv(
            'Changes vs expected',
            K.prop.siteLine({ acc: p.acc, pos: m[0] }) + (K.mut ? ' ' + K.mut.addButton(p.acc, m[0]) : ''),
            'observed/expected: observed changes at this residue over those expected from its codon, with the q of the test; count only for ClinVar'
          )
        : '') +
      '</dl></details>';
    const sumHtml = ready
      ? K.card.cardSummary(c, {
          uni: uniAt.filter((f) => f.type === 'Modified residue'),
          near: NEAR ? nearCard(p, m) || attrHtml(m, NEAR, true) : '',
        })
      : '';
    return (
      `<section class="site-card" id="site-card"><div class="card-head"><div><p class="eyebrow">Selected ${esc(W.mark)}</p><h3>${esc(p.gene || p.acc)} ${esc(siteOf(p, m[0]))} ${statePill(m)}${
        K.shown?.on ? ' ' + K.shown.tag(m, false) : ''
      }</h3>` +
      (num
        ? `<p class="muted small">${esc(
            num.note || num.label || 'Numbered as papers do'
          )} · UniProt ${esc(resAt(p, m[0]))}${m[0]}</p>`
        : '') +
      '</div>' +
      `<span class="tools">${
        typeof K.show3d === 'function' ? '<button type="button" class="btn small" data-site-3d>Show in 3D</button>' : ''
      }${hasEvRow ? '<button type="button" class="btn small" data-site-ev>Source evidence</button>' : ''}` +
      (`<a class="btn small" href="${esc(K.link('protein', p.acc + '/' + m[0]))}" target="_blank" rel="noopener" ` +
        `title="This ${esc(W.mark)}'s card on its own page">Open in a new tab</a><button type="button" ` +
        `class="btn small" data-site-copy title="Copy a link that opens this page with ${esc(siteOf(p, m[0]))} selected">` +
        `Copy link</button>${K.expBar(
          ['pdf', 'png', 'tsv'],
          'cexp',
          'the site card',
          'sources'
        )}<button type="button" ` +
        `class="btn small" data-site-close aria-label="Clear selection" title="Clear selection">×</button></span></div>`) +
      sumHtml +
      varBlock +
      // interactions: the records of proteins that write, read or bind the site, then the evidence (RNA and DNA contacts with it)
      `<div class="sc-grid one">${wr}${recs}${ev}</div>` +
      (siteHtml ? `<section class="sc-site">${siteHtml}</section>` : '') +
      (srcHtml ? `<section class="sc-src">${srcHtml}</section>` : '') +
      `<section class="sc-more">${moreHtml}</section>` +
      (!ready && Object.keys(D.tables || {}).length ? K.loading('Loading tables…') : '') +
      '</section>'
    );
  }
  function siteCardTsv() {
    const p = byAcc[PV.acc],
      rec = PV.rec,
      m = rec.marks.find((x) => x[0] === PV.site);
    if (!m) return '';
    const card = document.getElementById('site-card'),
      rows = [];
    card
      ?.querySelectorAll('.sc-kv > div')
      .forEach((d) =>
        rows.push([
          d.querySelector('dt')?.textContent.trim(),
          d.querySelector('dd')?.textContent.replace(/\s+/g, ' ').trim(),
        ])
      );
    return (
      K.preamble(
        `${p.gene || p.acc} ${siteOf(p, m[0])}`,
        `what the site card shows of the ${W.mark} ${siteOf(p, m[0])} of ${p.gene || p.acc} (${p.acc}), UniProt ` +
          `position ${m[0]}`
      ) +
      'field\tvalue\n' +
      rows.map((r) => r.map((x) => String(x || '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n') +
      '\n' +
      (K.card.has(CC.records?.table) ? '\n' + K.card.recordsTsv(cardCtx(p, rec, m)) : '')
    );
  }

  // ---- the address: #protein/EWSR1/Q01844, a site #protein/EWSR1/Q01844/R575 (as the page numbers it), a region
  // .../120-180, an old section key .../p-na. Older links (#protein/Q01844, the explorer's #Q01844/R575, #FUS/R216,
  // #TDP-43) still open it: a gene, an alias the site's tables give, an entry name, or any of these without punctuation
  const geneTag = (p) =>
    String(p?.gene || '')
      .split(/[\s;,]+/)[0]
      .replace(/[/?#%]/g, '-');
  let resIdx = null;
  const residueOf = (p, pos) => {
    if (!p) return '';
    const sd = K.sel?.peek(),
      mid = K.markRes;
    if (sd && !resIdx) {
      resIdx = {};
      sd.marks.forEach((m) => {
        resIdx[m[0] + ':' + m[1]] = mid(m);
      });
    }
    // before the whole selection is in, the protein's own marks (the file that holds them), never the whole for a link
    const own = !sd && p.i != null && K.seld ? (K.seld.marksOf([p.i]) || []).find((m) => m[1] === pos) : null;
    return (
      (resIdx && p.i != null && resIdx[p.i + ':' + pos]) ||
      (own && mid(own)) ||
      (PV.acc === p.acc && PV.rec?.seq?.[pos - 1]) ||
      (D.residues?.length === 1 ? D.residues[0] : '')
    );
  };
  const norm = (x) =>
    String(x || '')
      .toUpperCase()
      .replace(/[-\s._/]/g, '');
  const P_BY_NAME = {},
    P_BY_NORM = {};
  const addName = (g, acc) => {
    if (!g) return;
    P_BY_NAME[g.toUpperCase()] ||= acc;
    if (norm(g).length >= 3) P_BY_NORM[norm(g)] ||= acc;
  };
  (D.proteins || []).forEach(([acc, gene, , , , , entry]) => {
    String(gene || '')
      .split(/[\s;,]+/)
      .filter(Boolean)
      .forEach((g) => addName(g, acc));
    if (entry) addName(entry, acc);
  });
  Object.entries(D.protein_genes || {}).forEach(([acc, gs]) => gs.forEach((g) => addName(g, acc))); // every gene of a protein
  Object.entries(D.protein_aliases || {}).forEach(([acc, al]) =>
    String(al)
      .split(/;\s*/)
      .filter(Boolean)
      .forEach((g) => {
        if (!P_BY_NAME[g.toUpperCase()]) addName(g, acc);
      })
  );
  // gene symbols only: genes, and the previous and alternative symbols a site lists (D.protein_symbols); not the free-text
  // aliases of a table, which name complexes and families ("AMPK") that no one protein stands for
  const P_SYM = {};
  (D.proteins || []).forEach(([acc, gene]) =>
    String(gene || '')
      .split(/[\s;,]+/)
      .filter(Boolean)
      .forEach((g) => (P_SYM[g.toUpperCase()] ||= acc))
  );
  Object.entries(D.protein_genes || {}).forEach(([acc, gs]) => gs.forEach((g) => (P_SYM[g.toUpperCase()] ||= acc)));
  Object.entries(D.protein_symbols || {}).forEach(([acc, gs]) => gs.forEach((g) => (P_SYM[g.toUpperCase()] ||= acc)));
  const accOf = (x) => {
    const a = String(x || '')
      .toUpperCase()
      .replace(/-\d+$/, '');
    return byAcc[a] ? a : null;
  };
  const nameOf = (x) =>
    P_BY_NAME[String(x || '').toUpperCase()] || (norm(x).length >= 3 ? P_BY_NORM[norm(x)] : null) || null;
  const ACC_RE = /^([A-NR-Z][0-9][A-Z0-9]{3}[0-9]|[OPQ][0-9][A-Z0-9]{3}[0-9])(-\d+)?$/i;
  // a section key in a link (#ACC/p-na) and the fold that holds it: this page's own folds, and the renamed ones a site
  // lists (website.legacy_routes: old key -> fold)
  const FOLDS = [
    'p-map',
    'p-sites',
    'p-seq',
    'p-ix',
    'p-na',
    'p-cond',
    'p-dis',
    'p-depmap',
    'p-pert',
    'p-exp',
    'p-cluster',
    'p-ptm',
    'p-kinds',
    'p-regions',
    'p-struct',
    'p-cons',
  ];
  // the plain names a section has in an address (#protein/GENE/structure); any fold without one is named by its id
  const SECTION_NAMES = {
    'p-struct': 'structure',
    'p-cons': 'conservation',
    'p-ix': 'interactions',
    'p-seq': 'sequence',
    'p-regions': 'regions',
    'p-cond': 'conditions',
    'p-dis': 'disease',
    'p-pert': 'perturbations',
    'p-exp': 'experiments',
  };
  const NAME_TO_FOLD = Object.fromEntries(Object.entries(SECTION_NAMES).map(([f, n]) => [n, f]));
  const SECTION = {
    ...Object.fromEntries(FOLDS.map((f) => [f, f])),
    ...NAME_TO_FOLD,
    'site-glance': 'p-sitetab', // the first site table sat under this name
    'p-score': 'p-sitetab', // the list of counts is gone; the sentence that replaced it sits under the site table
    ...(D.legacy_routes || {}),
  };
  const sectionKey = (at) => {
    const k = String(at || '').toLowerCase();
    return SECTION[k] ? k : '';
  };
  // the address of a section the reader opened or jumped to: the protein's own, with the section's plain name
  const markSection = (id, on = true) => {
    const acc = PV.acc;
    if (S.view !== 'protein' || !acc || !FOLDS.includes(id) || !byAcc[acc]) return;
    const now = String(S.arg || '').split('/');
    if (now[0] !== acc) return;
    const mine = now[1] && SECTION[now[1].toLowerCase()] === id;
    if (on) S.arg = `${acc}/${SECTION_NAMES[id] || id}`;
    else if (mine) S.arg = acc;
    else return;
    PV.site = null;
    K.writeHash(false);
  };
  K.markSection = markSection;
  // a site's part of the address, read as the page numbers it: R2 or 2 on a protein numbered without its first residue
  const readAt = (acc, at) => {
    if (!at) return '';
    if (sectionKey(at)) return '/' + (SECTION_NAMES[SECTION[at.toLowerCase()]] || at.toLowerCase());
    if (/^p-[a-z0-9]+$/i.test(at)) return '/' + at.toLowerCase();
    if (/^\d+-\d+$/.test(at)) return '/' + at;
    const s = /^([A-Za-z]?)(\d+)$/.exec(at);
    if (!s) return '';
    const p = byAcc[acc];
    if (!p) return '/' + +s[2];
    // read as the page numbers it, unless only the UniProt reading names a site of the letter's residue (a link made
    // before this protein was renumbered keeps opening the site it named)
    const u = uniPos(p, +s[2]);
    if (
      s[1] &&
      numOf(p) &&
      resAt(p, u).toUpperCase() !== s[1].toUpperCase() &&
      resAt(p, +s[2]).toUpperCase() === s[1].toUpperCase()
    )
      return '/' + +s[2];
    return '/' + u;
  };
  K.routes.protein = {
    path: (arg) => {
      const [acc, at] = String(arg).split('/'),
        p = byAcc[acc] || (PV.lightP?.acc === acc ? PV.lightP : null);
      if (!p) return String(arg);
      const s = at && /^\d+$/.test(at) ? siteOf(p, +at) : at;
      // a section's address is short: the gene and the section (#protein/GENE/structure), when the gene names the protein
      if (at && sectionKey(at) && geneTag(p) && nameOf(geneTag(p)) === acc) return `${geneTag(p)}/${s}`;
      return [geneTag(p), acc, s].filter(Boolean).join('/');
    },
    arg: (path) => {
      const parts = String(path).split('/').filter(Boolean);
      const i = parts.findIndex(accOf);
      if (i >= 0) return accOf(parts[i]) + readAt(accOf(parts[i]), parts[i + 1]);
      const g = nameOf(parts[0]);
      if (g) return g + readAt(g, parts[1]);
      const sp = K.shown?.protein(parts[0]);
      if (sp) return sp.acc + readAt(sp.acc, parts[1]); // only marks shown, not counted
      // a protein without marks: its accession (or a name the light pages' index resolves), its light page
      return parts.length ? (ACC_RE.test(parts[0]) ? parts[0].toUpperCase() : parts[0]) : String(path);
    },
    // an old link that names a protein (#FUS, #FUS/R216, #TDP-43, #P10636): the explorer's form, with no view in it
    claims: (path) => {
      const [t, at] = String(path || '').split('/');
      return (
        !!t &&
        (!!accOf(t) || !!nameOf(t) || ACC_RE.test(t)) &&
        (!at || /^[A-Za-z]?\d+$|^p-[a-z0-9]+$|^\d+-\d+$/i.test(at) || !!sectionKey(at))
      );
    },
  };

  // ---- the headline cards: each a fact of the protein, a hover with its numbers, a click opening its section ---------
  const GLYPH = {
    pins:
      '<svg viewBox="0 0 64 22" aria-hidden="true"><line x1="2" y1="19" x2="62" y2="19"/><g class="g-a">' +
      '<line x1="12" y1="19" x2="12" y2="9"/><circle cx="12" cy="7" r="3.4"/>' +
      '<line x1="25" y1="19" x2="25" y2="12"/><circle cx="25" cy="10" r="3.4"/>' +
      '<line x1="34" y1="19" x2="34" y2="7"/><circle cx="34" cy="5" r="3.4"/>' +
      '<line x1="50" y1="19" x2="50" y2="11"/><circle cx="50" cy="9" r="3.4"/></g></svg>',
    wave: '<svg viewBox="0 0 64 22" aria-hidden="true"><rect x="2" y="7" width="18" height="8" rx="3"/><path d="M20 11 q4 -6 8 0 t8 0 t8 0 t8 0"/><circle class="g-f" cx="58" cy="7" r="3.2"/></svg>',
    squiggle:
      '<svg viewBox="0 0 64 22" aria-hidden="true"><path d="M3 14 q5 -10 10 0 t10 0 t10 0 t10 0"/><circle class="g-f" cx="50" cy="5" r="3.2"/></svg>',
    drops:
      '<svg viewBox="0 0 64 22" aria-hidden="true"><circle cx="10" cy="11" r="7"/><circle cx="27" cy="9" r="5"/><circle cx="39" cy="13" r="3.5"/><circle class="g-f" cx="9" cy="10" r="2"/></svg>',
    cross:
      '<svg viewBox="0 0 64 22" aria-hidden="true"><rect x="4" y="3" width="16" height="16" rx="3"/><path d="M12 7 v8 M8 11 h8"/></svg>',
    bars: '<svg viewBox="0 0 64 22" aria-hidden="true"><path d="M6 19 v-6 M14 19 v-12 M22 19 v-9 M30 19 v-15"/></svg>',
  };
  const glyphOf = (g, word) =>
    g === 'letters'
      ? `<span class="hl-letters">${[
          ...String(word || '')
            .replace(/[^A-Z]/g, '')
            .slice(0, 3),
        ]
          .map((ch, k) => `<b class="${k === 0 && ch === (D.residues || [])[0] ? 'on' : ''}">${esc(ch)}</b>`)
          .join('')}</span>`
      : GLYPH[g] || '';
  // the class at its marks that the site's own tests favor most (the within-protein rows, else the pooled ones)
  const bestRow = (aid, classes) => {
    const want = new Set(classes),
      rows = D.rows.filter((r) => r.analysis === aid && want.has(r.category) && r.dir === 'more');
    const pick = (m) => rows.filter((r) => r.method === m).sort((a, b) => shownOf(b) - shownOf(a))[0];
    return A[aid]?.kind === 'protein_sets' ? pick('enricher') : pick('mantel_haenszel') || pick('fisher');
  };
  // a fact of the protein: a protein attribute (proteins.attributes), or a column of a protein_values table
  const protValue = (p, f) => {
    if (f.attribute) {
      const v = K.proteinAttr?.(p.acc, f.attribute);
      return v ?? '';
    }
    const r = f.table ? K.card?.rows(PV.tb, f.table)?.[0] : null;
    return r ? r[f.column] : '';
  };
  // ---- the summary items of one site (the site card's own, through K.card.summaryItems), read by the site table (kit-sitetable.js) ----
  const UNI = {}; // accession -> UniProt's answer, for the proteins of a small selection's cards (the open protein's is PV.uniJson)
  const uniOf = (acc) => (acc === PV.acc && PV.uniJson) || UNI[acc]?.j || null;
  function loadUni(acc) {
    return ((UNI[acc] ||= {}).p ||= getJson(`https://rest.uniprot.org/uniprotkb/${acc}.json`).then(
      (j) => ((UNI[acc].done = true), (UNI[acc].j = j)),
      () => ((UNI[acc].done = true), null)
    ));
  }
  // the UniProt "Modified residue" features by position, built once per UniProt answer
  const uniIdx = new WeakMap();
  const uniAtPos = (j) => {
    if (!j) return new Map();
    if (!uniIdx.has(j)) {
      const by = new Map();
      for (const f of j.features || []) {
        const a = f.location?.start?.value;
        if (f.type === 'Modified residue' && a != null && a === f.location?.end?.value) {
          if (!by.has(a)) by.set(a, []);
          by.get(a).push(f);
        }
      }
      uniIdx.set(j, by);
    }
    return uniIdx.get(j);
  };
  // the summary items (writer, variants, conservation) of one site of the open protein, or null until its tables are in
  // For a protein that is not open (a small selection's cards), the caller gives the mark's row and the protein's tables;
  // its UniProt entry is read once (loadUni) and the items are the same.
  function summaryAt(acc, pos, other) {
    const p = byAcc[acc];
    if (other) {
      if (!p || !other.tb || !other.m) return null;
      if (!uniOf(acc)) loadUni(acc);
      return K.card.summaryItems(cardCtx(p, {}, other.m, other.tb, other.attr), {
        uni: uniAtPos(uniOf(acc)).get(pos) || [],
      });
    }
    const m = PV.acc === acc && PV.rec?.marks.find((x) => x[0] === pos);
    if (!p || !m || !PV.tb) return null;
    return K.card.summaryItems(cardCtx(p, PV.rec, m), { uni: uniAtPos(PV.uniJson).get(pos) || [] });
  }
  (K.afterUni ||= []).push(() => K.siteTable?.refresh());

  function headline(p, rec) {
    const facts = D.protein_view?.facts;
    if (!facts?.length) return '';
    const n = rec.marks.length,
      fill = (t, extra = {}) =>
        String(t || '')
          .replace(/\{residues\}/g, W.residues)
          .replace(/\{marks\}/g, W.marks)
          .replace(/\{class\}/g, extra.cls || '');
    const cards = facts
      .map((f) => {
        let big = '',
          lab = '',
          tip = typeof f.tip === 'string' ? f.tip : '',
          word = '';
        if (f.count) {
          big = f.of === 'candidates' ? `${int(n)} of ${int(p.cand)}` : int(n);
          lab = fill(f.label || cap(W.marks));
          tip = `<b>${esc(p.gene || p.acc)}</b>: ${int(n)} ${esc(n === 1 ? W.mark : W.marks)}${
            f.of ? ` of ${int(p.cand)} ${esc(W.residues)}` : ''
          }`;
          if (f.tip?.values)
            tip += f.tip.values
              .map((v) => {
                const x = protValue(p, { ...v, table: f.tip.table });
                return x === '' || x == null ? '' : `<br>${esc(v.label)} ${esc(K.card ? K.card.num(x, v.format) : x)}`;
              })
              .join('');
        } else if (f.attribute) {
          const want = new Set(f.values || []),
            k = rec.marks.filter((m) =>
              attrVal(m, f.attribute)
                .split(SPECS[f.attribute]?.separator || '; ')
                .some((v) => want.has(v))
            ).length;
          big = `${int(k)} of ${int(n)}`;
          lab = fill(f.label);
        } else if (A[f.analysis]?.kind === 'protein_sets') {
          const sd = K.sel?.pdata(p.i),
            ps = sd?.protein_sets?.[f.analysis];
          if (!ps) return '';
          const want = f.branches ? K.branchClasses(f.analysis) : null,
            names = ps.sets
              .map(([s]) => s)
              .filter((s) => (!want || want.includes(s)) && K.sel.setHas(f.analysis, s, p.i));
          if (!names.length) return '';
          const best = f.best ? bestRow(f.analysis, names) : null,
            setLab = (s) => (A[f.analysis].labels || {})[s] || s;
          big = int(names.length);
          lab = fill(best ? f.label : String(f.label || A[f.analysis].title).replace(/,? ?with \{class\}/, ''), {
            cls: best ? setLab(best.category) : '',
          });
          tip =
            `<b>${esc(p.gene || p.acc)}</b> is in ${int(names.length)}: ${esc(
              names.slice(0, 12).map(setLab).join('; ')
            )}${names.length > 12 ? ' …' : ''}` +
            (best
              ? `<br>${esc(setLab(best.category))}: across this explorer, ${esc(W.marked)} proteins are ${esc(K.fxn(best.eff))}× over-represented ` +
                `in it (q ${K.fq(best.q)})`
              : '');
        } else {
          const k = K.cols.cls(f.analysis);
          if (k < 0) return '';
          const at = rec.marks.map((m) =>
            String(m[2][k] || '')
              .split(';')
              .filter(Boolean)
          );
          if (f.best) {
            const present = [...new Set(at.flat())],
              best = bestRow(f.analysis, present);
            if (!best) return '';
            const kk = at.filter((cs) => cs.includes(best.category)).length,
              others = present
                .map((cl) => bestRow(f.analysis, [cl]))
                .filter((r) => r && r !== best)
                .sort((a, b) => shownOf(b) - shownOf(a));
            big = `${int(kk)} of ${int(n)}`;
            word = label(f.analysis, best.category);
            lab = `${fill(f.label, { cls: word })} (dataset-wide ${K.fxn(shownOf(best))}×)`;
            tip =
              `<b>${esc(word)}</b>${
                help(f.analysis, best.category) ? ' (' + esc(help(f.analysis, best.category)) + ')' : ''
              }: the class ` +
              `most enriched at these ${esc(W.marks)}: ${esc(K.fxn(shownOf(best)))}× (fold; OR ${esc(K.fxn(best.eff))}) against ` +
              `the other ${esc(W.residues)} of the same proteins (${best.method === 'fisher' ? 'pooled' : 'within proteins'}; ` +
              `q ${K.fq(best.q)})` +
              (others.length
                ? `<br>Others here: ${others
                    .map(
                      (r) =>
                        `${esc(label(f.analysis, r.category))} ${
                          at.filter((cs) => cs.includes(r.category)).length
                        } (${esc(K.fxn(shownOf(r)))}×)`
                    )
                    .join(', ')}`
                : '');
          } else {
            const want = new Set(f.classes || []);
            big = `${int(at.filter((cs) => cs.some((x) => want.has(x))).length)} of ${int(n)}`;
            lab = fill(f.label || `in: ${(f.classes || []).map((x) => label(f.analysis, x)).join(', ')}`);
            tip ||= (f.classes || [])
              .map((x) => help(f.analysis, x))
              .filter(Boolean)
              .join('; ');
          }
        }
        const tag = f.opens ? 'button' : 'div';
        return (
          `<${tag} class="hl-card"${
            f.opens ? ` type="button" data-hl-open="${esc(f.opens)}"` : ''
          } data-hl-tip="${esc(tip)}"><span class="hl-glyph">${glyphOf(f.glyph, word)}</span><b ` +
          `class="hl-big">${big}</b><span class="hl-lab">${esc(lab)}</span>${
            f.kind ? `<span class="hl-kind">${esc(f.kind)}</span>` : ''
          }</${tag}>`
        );
      })
      .filter(Boolean);
    return cards.length ? `<div class="hl-cards">${cards.join('')}</div>` : '';
  }

  // ---- the sites table: fixed columns (site, state, window and motifs), the site file's optional ones (the Columns
  // menu), the 3D and Evidence actions, an Evidence row per site, and a filter by an attribute -------------------------
  const colourAttr = Object.keys(SPECS).find((n) => SPECS[n].colour && SPECS[n].kind === 'category');
  const FLAGS = COLS.filter((aid) => A[aid]?.shape === 'flags');
  function tableCols() {
    if (TC?.columns) return TC.columns;
    // a site without its own columns: the attributes it colors or links, and every question, the site file's shown first
    return [
      ...Object.keys(SPECS)
        .filter((n) => n !== colourAttr && (SPECS[n].colour || (SPECS[n].kind === 'list' && SPECS[n].link)))
        .map((n) => ({ id: 'a:' + n, label: SPECS[n].label, attribute: n, default: true })),
      ...COLS.filter((aid) => !FLAGS.includes(aid)).map((aid) => ({
        id: 'q:' + aid,
        label: A[aid]?.title || aid,
        analyses: [aid],
        default: (D.sites_view?.columns || []).includes(aid),
      })),
    ];
  }
  const sumLine = (c) => {
    const t = K.card.summary(c.acc, c.pos, 'records', { tb: c.tb, label: c.label, isListed: c.isListed });
    return t ? `<div class="sc-sum">${t}</div>` : '';
  };
  const SHOW = {
    status: (c) => K.card.badge(c),
    // the evidence kinds, then (where the site has records) the one line of who they name, from the site card's own function
    tags: (c) => (K.density.compact() ? K.card.tags(c, -1) : K.card.tags(c, 4)) + sumLine(c),
    sequences: (c) => {
      if (!K.density.compact()) return K.card.sequences(c, true);
      const ws = K.card.windowsOf(c) || [];
      return ws.length
        ? `<span class="tag ` +
            `t-a more" title="${esc(
              ws
                .map((w) => w.names[0] || '')
                .filter(Boolean)
                .join('\n')
            )}">${ws.length} bound</span>`
        : '';
    },
    around: (c) => K.card.around(c, K.density.compact() ? 'brief' : true),
    calls: (c) => K.card.calls(c, K.density.compact()),
    plddt: (c) => plddtHtml(c.p, c.pos),
    nearest: (c) => {
      const x = nearestOf(c.rec, c.pos);
      return x == null ? '' : `${int(Math.abs(x - c.pos))} aa`;
    },
    states: (c) => K.card.states(c, true),
    changes: (c) => K.card.changes(c),
    nearest_domain: (c) => {
      const nd = TC?.nearest_domain;
      if (!nd || !K.card.has(nd.table)) return '';
      const r = K.card.at(c.tb, nd.table, c.pos)[0];
      if (!r || !r[nd.name]) return '';
      const u = nd.url && r[nd.ref] ? nd.url.replace('{ref}', encodeURIComponent(r[nd.ref])) : '';
      return (
        `${
          u
            ? `<a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(r[nd.ref])}">${esc(r[nd.name])}</a>`
            : esc(r[nd.name])
        }<br><span ` +
        `class="muted">${
          r[nd.distance] === '0'
            ? esc((nd.sides || {}).inside || 'inside')
            : `${esc(r[nd.distance])} aa ${esc((nd.sides || {})[r[nd.side]] || r[nd.side] || '')}`
        }</span>`
      );
    },
  };
  const cellOf = (col, c, m) => {
    let h = '';
    if (col.attribute)
      h =
        SPECS[col.attribute]?.colour && SPECS[col.attribute].kind === 'category'
          ? pillOf(m, col.attribute)
          : attrHtml(m, col.attribute, false);
    else if (col.analyses)
      h = col.analyses
        .map((aid) => {
          const k = K.cols.cls(aid),
            v = m[2][k];
          return `<span title="${esc(help(aid, v))}">${esc(classText(aid, v))}</span>`;
        })
        .join('<br>');
    else if (col.show)
      h = PV.tb ? col.show.map((k) => (SHOW[k] ? SHOW[k](c) : '')).join('') : '<span class="muted">…</span>';
    return h || '<span class="muted">–</span>';
  };
  const evRowOn = () =>
    K.card.has(CC.sources?.table) ||
    (CC.tables || []).some((x) => K.card.has(x.table)) ||
    (CC.calls?.tables || []).some(K.card.has);
  // the marks shown and counted nowhere (K.shown), after the marks, hatched, each with its tag; a row opens its card
  function shownRows(p, rec, shown, flt, fv) {
    return (rec.shown || [])
      .filter((m) => !(fv && attrVal(m, flt) !== fv))
      .map(
        (m) =>
          `<tr data-site="${m[0]}" tabindex="0" ` +
          `class="lc-row${PV.site === m[0] ? ' on' : ''}"><td class="mono" data-label="Site"><b>${esc(siteOf(p, m[0]))}</b>${
            numOf(p) ? `<br><span ` + `class="muted small">UniProt ${m[0]}</span>` : ''
          }<div class="tags">${K.shown.tag(m, true)}</div></td>` +
          (colourAttr ? `<td data-label="${esc(SPECS[colourAttr].label)}">${pillOf(m, colourAttr)}</td>` : '') +
          `<td class="cwin" data-label="Sequence (±7 residues)"><span class="mono">${winHtml(m[1])}</span></td>` +
          shown
            .map(
              (col) =>
                `<td class="cw" data-label="${esc(col.label)}">${
                  col.attribute ? cellOf(col, null, m) : '<span class="muted">–</span>'
                }</td>`
            )
            .join('') +
          `<td class="nw" data-label=""><span class="row-acts">${
            typeof K.show3d === 'function'
              ? `<button type="button" ` +
                `class="btn small" data-site-3d="${m[0]}" title="Show ${esc(siteOf(p, m[0]))} in the 3D structure">` +
                `3D</button>`
              : ''
          }</span></td></tr>`
      )
      .join('');
  }
  function sitesTable(p, rec, sel) {
    const cols = tableCols(),
      defaults = cols.filter((c) => c.default).map((c) => c.id),
      table = 'protein-sites';
    const on = new Set(K.columns.on(table, cols, defaults)),
      shown = cols.filter((c) => on.has(c.id));
    const flt = TC?.filter && SPECS[TC.filter] ? TC.filter : null,
      fv = flt ? PV.pf : '';
    const posList = TC?.positions && K.card.has(TC.positions.table) ? TC.positions : null;
    const head =
      `<tr><th aria-sort="ascending" title="In order along the chain">Site</th>${
        colourAttr ? `<th>${esc(SPECS[colourAttr].label)}</th>` : ''
      }<th${
        FLAGS.length
          ? ` title="Window ` +
            `±7 and its ${esc(
              FLAGS.map((a) => A[a]?.title || a)
                .join(', ')
                .toLowerCase()
            )}"`
          : ''
      }>Sequence (±7 residues)${FLAGS.length ? ' · labels' : ''}</th>${shown
        .map((c) => `<th>${esc(c.label)}</th>`)
        .join('')}<th><span ` + `class="vh">Actions</span></th></tr>`;
    const n = 3 + (colourAttr ? 1 : 0) + shown.length;
    const body =
      [...rec.marks]
        .sort((x, y) => x[0] - y[0])
        .map((m) => {
          // along the chain, as the original explorer lists them
          if (fv && attrVal(m, flt) !== fv) return '';
          const c = cardCtx(p, rec, m),
            off = sel && !sel.has(m[0]),
            open = PV.evOpen.has(m[0]);
          const src = posList
            ? [
                ...new Set(
                  String((K.card.at(c.tb, posList.table, m[0])[0] || {})[posList.column] || '')
                    .split(/;\s*/)
                    .filter(Boolean)
                ),
              ]
            : [];
          const srcNote =
            src.length && !(src.length === 1 && +src[0] === m[0])
              ? `<br><span class="muted small" ` +
                `title="Positions the sources gave before mapping to the current sequence">source position${src.length > 1 ? 's' : ''} ${esc(src.join(', '))}</span>`
              : '';
          return (
            `<tr data-site="${m[0]}" tabindex="0" class="${off ? 'faded' : ''}${PV.site === m[0] ? ' on' : ''}"><td class="mono" ` +
            `data-label="Site"><b>${esc(siteOf(p, m[0]))}</b>${
              numOf(p) ? `<br><span class="muted small">UniProt ${m[0]}</span>` : ''
            }${srcNote}${
              K.shown?.on && K.shown.counted(m) ? `<div class="tags">${K.shown.tag(m, false)}</div>` : ''
            }</td>` +
            (colourAttr ? `<td data-label="${esc(SPECS[colourAttr].label)}">${pillOf(m, colourAttr)}</td>` : '') +
            `<td class="cwin" data-label="Sequence (±7 residues)"><span class="mono">${winHtml(m[1])}</span>${FLAGS.map(
              (aid) => flagTags(aid, K.cols.markClass(m, aid))
            ).join('')}</td>` +
            shown.map((col) => `<td class="cw" data-label="${esc(col.label)}">${cellOf(col, c, m)}</td>`).join('') +
            `<td class="nw" data-label=""><span class="row-acts">${
              typeof K.show3d === 'function'
                ? `<button type="button" ` +
                  `class="btn small" data-site-3d="${m[0]}" title="Show ${esc(siteOf(p, m[0]))} in the 3D structure">` +
                  `3D</button>`
                : ''
            }` +
            `${
              evRowOn() || !PV.tb
                ? `<button type="button" class="btn small" data-ev-toggle="${m[0]}" aria-expanded="${open}" title="Every ` +
                  `source record and measurement of the site">${open ? 'Hide' : 'Evidence'}</button>`
                : ''
            }</span></td></tr>` +
            (open
              ? `<tr class="ev-row" data-for="${m[0]}"><td colspan="${n}">${
                  PV.tb ? K.card.evidenceRow(c) : K.loading('Loading…')
                }</td></tr>`
              : '')
          );
        })
        .join('') + shownRows(p, rec, shown, flt, fv);
    const counts = flt
      ? Object.entries(
          rec.marks.reduce((o, m) => {
            const v = attrVal(m, flt);
            o[v] = (o[v] || 0) + 1;
            return o;
          }, {})
        )
      : [];
    const order = flt ? Object.keys(SPECS[flt].values || {}) : [];
    const seg = flt
      ? `<div class="ix-seg"><span class="flabel">${esc(SPECS[flt].label)} at these ${esc(W.marks)}</span> <span ` +
        `class="seg" role="group">${(order.length ? order : counts.map(([v]) => v))
          .map((v) => {
            const k = (counts.find(([x]) => x === v) || [, 0])[1];
            return (
              `<button type="button" data-pfilter="${esc(v)}" aria-pressed="${fv === v}"${k ? '' : ' disabled'}><i class="ixd" ` +
              `style="--c:${K.map.attrColour(flt, v)}"></i>${esc(vLabel(flt, v))} <b>${int(k)}</b></button>`
            );
          })
          .join('')}</span></div>`
      : '';
    return (
      `<div class="card-head"><span class="tools">${K.columns.menu(table, cols, defaults)}${K.expBar(
        ['pdf', 'svg', 'png', 'tsv'],
        'sexp',
        'the sites'
      )}</span></div>` +
      seg +
      (`<div class="tbl-card lk-box"><table class="tbl stbl stackable"><thead>${head}</thead><tbody>${body}</tbody></table>` +
        `</div>`) +
      (/class="trend /.test(body) && K.card.callsKey ? K.card.callsKey() : '') +
      (fv
        ? `<p class="note">Showing the ${esc(W.marks)} with ${esc(vLabel(flt, fv).toLowerCase())} ${esc(SPECS[flt].label.toLowerCase())}. <button ` +
          `class="linkish" type="button" data-pfilter="">Show all</button></p>`
        : '') +
      (CC.cite
        ? K.card.citeBox(
            `the ${int(rec.marks.length)} ${rec.marks.length === 1 ? W.mark : W.marks} on ${p.gene || p.acc}`,
            rec.marks,
            (m, n) => attrVal(m, n),
            false
          )
        : '')
    );
  }
  const vLabel = (n, v) => (K.sel?.valueLabel ? K.sel.valueLabel(n, v) : v);

  // ---- a protein's page -----------------------------------------------------------------------------------------------
  function proteinView(arg) {
    const [key, sitePos] = String(arg).split('/');
    let p = byAcc[key];
    if (!p && K.shown?.protein(key)) return shownOnlyView(K.shown.protein(key), sitePos);
    if (!p) return lightView(key);
    const acc = p.acc;
    // #protein/ACC/216 opens a mark's card; #protein/ACC/120-180 opens the map zoomed to a region (an IDR, from its page);
    // #protein/ACC/p-na opens a section
    const span = /^(\d+)-(\d+)$/.exec(sitePos || ''),
      sec = /^(p-[a-z0-9]+|[a-z][a-z-]*)$/i.exec(sitePos || '');
    load(acc);
    const secId = sec ? SECTION[sec[0].toLowerCase()] || '' : '';
    PV.site = sitePos && !span && !sec ? +sitePos : null;
    K.site.state.focus = PV.site;
    K.site.state.acc = acc;
    if (sec) {
      PV.focus = secId;
      if (PV.focus) {
        PV.open[PV.focus] = true;
        const g = GROUPS.find((x) => (x.folds || []).includes(PV.focus));
        if (g) PV.open[g.id] = true;
      }
    }
    if (!span) {
      PV.span = null;
      PV.spanArg = '';
    } else if (PV.spanArg !== sitePos) {
      // the region is read as the page numbers it (R2-30 on a protein numbered without its first residue is 3 to 31 in
      // UniProt's); a span that ends past the shown length can only be a link made in UniProt's frame, read as such
      const off = numOf(p)?.offset || 0,
        asShown = off && +span[2] <= p.len + off,
        a = Math.max(1, +span[1] - (asShown ? off : 0)),
        b = Math.min(p.len, +span[2] - (asShown ? off : 0)),
        pad = Math.max(5, Math.round((b - a + 1) * 0.15));
      PV.span = [a, b];
      PV.spanArg = sitePos;
      PV.scrolled = null;
      K.map.state.zoom = [Math.max(1, a - pad), Math.min(p.len, b + pad)];
    }
    if (PV.rec && PV.site && !PV.rec.marks.some((m) => m[0] === PV.site) && !shownAt(PV.rec, PV.site)) {
      PV.site = null;
      PV.cleanArg = true;
    }
    const selTxt = K.sel?.active()
      ? `${int(K.sel.nMarks())} ${esc(K.sel.nMarks() === 1 ? W.mark : W.marks)} · selection`
      : `all ${esc(W.marks)}`;
    const head =
      `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <a href="${esc(K.link('proteins'))}">Proteins</a>` +
      ` <span class="muted">(${selTxt})</span> › <b>${esc(p.gene || p.acc)}</b>${
        PV.site
          ? ` › ${esc(PV.rec ? siteOf(p, PV.site) : PV.site)}`
          : PV.span
            ? ` › ${rangeOf(p, PV.span[0], PV.span[1])}`
            : ''
      }</p>` +
      protHead(p);
    if (!PV.rec) return head + (PV.err ? `<p class="empty">${esc(PV.err)}</p>` : K.loading('Loading the protein…'));
    const rec = PV.rec,
      sel = K.sel?.active() ? K.sel.selectedPositions(acc) : null;
    const isOpen = (id, open) => PV.open[id] ?? foldOpen(id, open);
    // a closed section with a long body is drawn when it is first opened (a large protein's sites, sequence and regions)
    // `pin`: the section stays where it is drawn (right after the tiles), opening as its caller says (arrangeFolds does not move it)
    const fold = (id, title, sum, body, open, pin) => {
      const o = pin ? (PV.open[id] ?? open) : isOpen(id, open),
        later = !o && body.length > LATER_CHARS;
      return (
        `<details class="pfold${pin ? ' pfold-pin' : ''}" id="${id}"${o ? ' open' : ''}><summary>` +
        `<span class="pfm" aria-hidden="true"></span><h3>${title}</h3><span class="fsum">${sum}</span></summary>` +
        `<div class="pfold-body"${later ? ' data-later' : ''}>${later ? '' : body}</div></details>`
      );
    };
    const nSrc = Object.keys(SPECS).find((n) => SPECS[n].kind === 'list' && SPECS[n].link);
    const page = (laid) => arrangeFolds(laid);
    return (
      head +
      (sel && sel.size < rec.marks.length
        ? `<p class="note">${int(sel.size)} of ${int(rec.marks.length)} ${esc(W.marks)} selected ` +
          `(others faded). <button class="linkish" type="button" data-sel-clear-all>Clear ` +
          `filters</button></p>`
        : '') +
      page(
        fold(
          'p-map',
          'Protein map',
          `${int(rec.marks.length)} ${esc(rec.marks.length === 1 ? W.mark : W.marks)} on ${int(K.prot.length(p.acc, p.len))} aa${
            numOf(p) ? ` · ${esc(numOf(p).label || 'numbered as papers do')}` : ''
          }`,
          `<div class="card-head">${mapExp(['pdf', 'svg', 'png', 'tsv'])}</div><div ` +
            `id="pmap" class="pmap"></div>${siteCard(p, rec)}`,
          true
        ) +
          (headline(p, rec) || legacyFacts(p, rec, nSrc)) +
          (K.siteTable?.fold(p, rec, fold) || '') +
          fold(
            'p-sites',
            'All site tables',
            `${int(rec.marks.length)}${
              nSrc
                ? ` · ${int(
                    new Set(
                      rec.marks.flatMap((m) =>
                        (attrVal(m, nSrc) || '').split(SPECS[nSrc].separator || '; ').filter(Boolean)
                      )
                    ).size
                  )} ${esc(SPECS[nSrc].label.toLowerCase())}`
                : ''
            }${rec.shown?.length ? ` · ${int(rec.shown.length)} more ${esc(K.shown.row())}` : ''}`,
            sitesTable(p, rec, sel),
            true
          ) +
          untestedNote() +
          (D.analyses.some((a) => a.kind === 'protein_sets')
            ? fold('p-kinds', 'Protein classes and pathways', '', kindsHtml(p), false)
            : '') +
          (K.proteinFolds || []).map((f) => f(p, rec, fold)).join('') +
          fold(
            'p-regions',
            'Domains and regions',
            `${int(rec.units.length)} region${rec.units.length === 1 ? '' : 's'}`,
            regionsHtml(p, rec),
            false
          ) +
          fold('p-seq', 'Sequence', `${int(shownLen(p, rec))} aa, and as FASTA`, sequenceHtml(p, rec, sel), false) +
          (K.s3d ? fold('p-struct', '3D structure', K.s3d.summary(), K.s3d.html(p, rec), false) : '') + // kit-3d.js
          ''
      )
    );
  }
  // the facts as tiles, for a site without headline cards
  function legacyFacts(p, rec, nSrc) {
    const facts = [
      [int(rec.marks.length), cap(rec.marks.length === 1 ? W.mark : W.marks)],
      [int(p.cand), `${cap(W.residues)} (${pct(p.marks, p.cand)} ${W.marked})`],
      ...(nSrc
        ? [
            [
              int(
                new Set(
                  rec.marks.flatMap((m) =>
                    (attrVal(m, nSrc) || '').split(SPECS[nSrc].separator || '; ').filter(Boolean)
                  )
                ).size
              ),
              `${SPECS[nSrc].label} reporting ${rec.marks.length === 1 ? 'it' : 'them'}`,
            ],
          ]
        : []),
    ];
    return `<div class="facts">${facts
      .map(([b, t]) => `<div class="fact"><b>${b}</b><span>${esc(t)}</span></div>`)
      .join('')}</div>`;
  }
  // other names, without the genes the page already lists
  const aliasLine = (p) => {
    const have = new Set(genesOf(p).map((g) => g.toUpperCase())),
      al = String(D.protein_aliases?.[p.acc] || '')
        .split(/;\s*/)
        .filter((a) => a && !have.has(a.toUpperCase()));
    return al.length ? `Also reported as ${esc(al.join(', '))}` : '';
  };
  // the head of a protein's page: its names, function (UniProt, live), links, and its Download menu (PDF of the page, Print)
  const protHead = (p, light) =>
    `<div class="prot-head"><h2>${esc(p.gene || p.acc)} <small>${genesOf(p).length > 1 ? '· ' : ''}${esc(p.name)}</small></h2>` +
    (genesOf(p).length > 1
      ? `<p class="aliases genes" id="genes">Encoded by ${int(genesOf(p).length)} genes: ${genesOf(p).map(esc).join(', ')}</p>`
      : '') +
    (`<p class="aliases" id="aliases">${aliasLine(p)}</p><div ` +
      `class="fn" id="fn"><p class="muted">Asking UniProt for its function…</p></div>`) +
    (`<div class="prot-chips"><span class="chip mono">${esc(p.acc)}</span>${
      PV.rec?.entry || p.entry ? `<span class="chip ` + `mono">${esc(PV.rec?.entry || p.entry)}</span>` : ''
    }<a class="btn small" ` +
      `href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}" target="_blank" rel="noopener">UniProt ↗</a>`) +
    (K.protActions || []).map((f) => f(p, light)).join('') +
    (`<span class="more-links"><button type="button" class="btn small" data-more-links aria-expanded="${PV.more}">More links ` +
      `▾</button><span class="menu" id="more-menu"${PV.more ? '' : ' hidden'}>${LINKS(p.acc)
        .map(([t, u]) => `<a href="${esc(u)}" target="_blank" ` + `rel="noopener">${esc(t)} ↗</a>`)
        .join('')}</span></span>`) +
    `${
      light ? '<button type="button" class="btn small" data-xm-page-act="print">Print</button>' : K.exp.pageMenu()
    }</div></div><div id="drift" class="drift" hidden></div>`;

  // ---- a protein with only marks shown and counted nowhere (K.shown): its map, those marks with their tag, its
  // sequence and 3D; nothing of it is counted, so it has no counts, questions or kinds -------------------------------
  function shownOnlyView(sp, sitePos) {
    load(sp.acc);
    PV.lightP = sp;
    PV.site = sitePos && /^\d+$/.test(sitePos) ? +sitePos : null;
    K.site.state.focus = PV.site;
    K.site.state.acc = p.acc;
    if (PV.rec && PV.site && !shownAt(PV.rec, PV.site)) {
      PV.site = null;
      PV.cleanArg = true;
    }
    const p = sp,
      n = PV.rec?.shown?.length || 0;
    const head =
      `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <a href="${esc(K.link('proteins'))}">Proteins</a>` +
      ` › <b>${esc(p.gene || p.acc)}</b> <span class="muted">${esc(K.shown.row())}</span>${
        PV.site ? ` › ${esc(siteOf(p, PV.site))}` : ''
      }</p>` +
      protHead(p, true);
    if (!PV.rec) return head + (PV.err ? `<p class="empty">${esc(PV.err)}</p>` : K.loading('Loading the protein…'));
    const rec = PV.rec;
    const fold = (id, title, sum, body, open) =>
      `<details class="pfold" id="${id}"${(PV.open[id] ?? open) ? ' open' : ''}><summary>` +
      `<span class="pfm" aria-hidden="true"></span><h3>${title}</h3><span class="fsum">${sum}</span></summary>` +
      `<div class="pfold-body">${body}</div></details>`;
    const cols = tableCols().filter((c) => c.attribute),
      on = new Set(
        K.columns.on(
          'protein-sites',
          cols,
          cols.filter((c) => c.default).map((c) => c.id)
        )
      ),
      shown = cols.filter((c) => on.has(c.id));
    const table =
      `<div class="tbl-card"><table class="tbl stbl stackable"><thead><tr><th>Site</th>${
        colourAttr ? `<th>${esc(SPECS[colourAttr].label)}</th>` : ''
      }<th>Sequence (±7 residues)</th>${shown.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th><span ` +
      `class="vh">Actions</span></th></tr></thead><tbody>${shownRows(p, rec, shown, null, '')}</tbody></table>` +
      `</div>`;
    const page =
      head +
      (`<p class="note">No counted ${esc(W.mark)} on ${esc(p.gene || p.acc)}. It has ${int(n)} ${esc(n === 1 ? W.mark : W.marks)} shown here (${esc(K.shown.label())}) but not ` +
        `among the ${int(D.counts.marks)} ${esc(W.marks)} on ${int(D.counts.proteins)} proteins, and in no count,` +
        ` chart or test.</p>`) +
      `<div class="facts"><div class="fact"><b>${int(p.len)}</b><span>Residues</span></div><div class="fact"><b>${int(n)}</b><span>${esc(cap(K.shown.row()))}</span></div></div>` +
      fold(
        'p-map',
        'Protein map',
        `${int(n)} ${esc(K.shown.row())} on ${int(K.prot.length(p.acc, p.len))} aa`,
        `<div class="card-head">${mapExp(['pdf', 'svg', 'png'])}</div><div ` +
          `id="pmap" class="pmap"></div>${siteCard(p, rec)}`,
        true
      ) +
      fold('p-sites', esc(cap(W.marks)), `${int(n)} ${esc(K.shown.row())}`, `${table}`, true) +
      fold('p-seq', 'Sequence', `${int(shownLen(p, rec))} aa, and as FASTA`, sequenceHtml(p, rec, null), false) +
      (K.s3d ? fold('p-struct', '3D structure', K.s3d.summary(), K.s3d.html(p, rec), false) : '');
    return page;
  }

  // ---- a protein without marks: a light page with its map, the records that name it as a partner, and the proteins
  // with marks that the site's partner table associates with it ------------------------------------------------------
  function lightView(key) {
    let L = PV.light;
    if (!(L && (L.key === key || (L.state === 'ok' && PV.lightP?.acc === String(key).toUpperCase())))) {
      PV.light = L = { key, state: 'look' };
      Object.assign(PV, { acc: '', rec: null, lightP: null, tb: null, site: null });
    }
    if (L.state === 'look') return `<p class="empty">Looking up ${esc(key)}…</p>`;
    if (L.state === 'none')
      return (
        `<div class="empty"><p><b>No protein ${esc(key)} here.</b> Proteins are matched to ` +
        `${esc(D.run.snapshot?.release || 'the reference')} sequences; ${esc(key)} is not among them, or is a name ` +
        `that could not be matched.</p>` +
        (`${
          ACC_RE.test(key)
            ? `<p><a class="btn small" href="https://www.uniprot.org/uniprotkb/${esc(key)}/entry" target="_blank" ` +
              `rel="noopener">${esc(key)} in UniProt ↗</a></p>`
            : ''
        }<p><a href="${esc(K.link('proteins'))}">All proteins</a>` +
          `</p></div>`)
      );
    const p = PV.lightP,
      x = L.x,
      rec = PV.rec;
    const ptab = CC.writer?.partners?.table,
      partners = ptab ? K.card.partnersOf(x, ptab) : [];
    const res = new Set(D.residues || []),
      nRes = [...(x.seq || '')].filter((ch) => res.has(ch)).length;
    const chip = (r) => {
      const q = byAcc[r.acc];
      return q
        ? `<a class="gene-chip" href="${esc(K.link('protein', q.acc))}" title="${esc(
            `${q.gene || q.acc}: ${q.marks} ${q.marks === 1 ? W.mark : W.marks}; score ${r.score}`
          )}">${esc(q.gene || q.acc)} <span class="muted">${int(q.marks)}</span></a>`
        : '';
    };
    const shownP = PV.lightAll ? partners : partners.slice(0, 40);
    const fold = (id, title, sum, body, open) =>
      `<details class="pfold" id="${id}"${(PV.open[id] ?? open) ? ' open' : ''}><summary>` +
      `<span class="pfm" aria-hidden="true"></span><h3>${title}</h3><span class="fsum">${sum}</span></summary>` +
      `<div class="pfold-body">${body}</div></details>`;
    const asP = K.card.asPartner(
      x,
      p.gene || p.acc,
      (a, pos) => `${byAcc[a]?.gene || a} ${siteOf(byAcc[a] || { acc: a }, pos)}`
    );
    const page =
      `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <a href="${esc(K.link('proteins'))}">Proteins</a>` +
      ` › <b>${esc(p.gene || p.acc)}</b> <span class="muted">no ${esc(W.mark)}</span></p>` +
      protHead(p, true) +
      (`<p class="note">No ${esc(W.mark)} is reported on ${esc(p.gene || p.acc)}, though it may still carry one. Its page shows the map, the ${esc(W.marks)} of ` +
        `proteins it binds, and its partners with ${esc(W.marks)}.</p>`) +
      `<div class="facts"><div class="fact"><b>${int(p.len)}</b><span>Residues</span></div><div class="fact"><b>${int(nRes)}</b><span>${esc(cap(W.residues))}</span></div>` +
      (ptab ? `<div class="fact"><b>${int(partners.length)}</b><span>Partners with ${esc(W.marks)}</span></div>` : '') +
      '</div>' +
      fold(
        'p-map',
        'Protein map',
        `${int(K.prot.length(p.acc, p.len))} aa, no ${esc(W.mark)}`,
        `<div class="card-head">${mapExp(['pdf', 'svg', 'png'])}</div><div ` + `id="pmap" class="pmap"></div>`,
        true
      ) +
      (asP ? `<div class="pfold-like">${asP}</div>` : '') +
      (ptab
        ? fold(
            'p-partners',
            `Proteins with ${esc(W.marks)} associated with ${esc(p.gene || p.acc)}`,
            `${int(partners.length)}`,
            partners.length
              ? `<p class="sub">${esc(CC.writer?.partners?.note || 'Partners')}, most confident ` +
                  `first; the number is each protein’s ${esc(W.marks)}.</p><div class="gene-chips">${shownP.map(chip).join('')}</div>` +
                  (`<p>${
                    partners.length > 40
                      ? `<button class="linkish" type="button" data-light-all>${
                          PV.lightAll ? 'Fewer' : `All ${int(partners.length)}`
                        }</button> · `
                      : ''
                  }<button class="linkish" ` +
                    `type="button" data-try="${esc(
                      partners.map((r) => byAcc[r.acc]?.gene || r.acc).join(' ')
                    )}">Select these ${int(partners.length)}</button></p>`)
              : `<p class="muted">` + `None in the partner table.</p>`,
            true
          )
        : '') +
      fold('p-seq', 'Sequence', `${int(shownLen(p, rec))} aa, and as FASTA`, sequenceHtml(p, rec, null), false) +
      (K.s3d ? fold('p-struct', '3D structure', K.s3d.summary(), K.s3d.html(p, rec), false) : '') + // kit-3d.js
      (K.lightFolds || []).map((f) => f(p, null, fold)).join('');
    return page;
  }
  // a search for one name that only a protein without marks has (MAPT): Enter opens its light page; the search goes
  const lightFind = (idx, key) => {
    const u = String(key).toUpperCase();
    return (
      idx.find((r) => r[0] === u.replace(/-\d+$/, '')) ||
      idx.find((r) => String(r[1]).toUpperCase() === u) ||
      idx.find((r) => String(r[2]).toUpperCase() === u) ||
      (norm(key).length >= 3 ? idx.find((r) => norm(r[1]) === norm(key)) : null)
    );
  };
  let lightIdx = null;
  K.openLight = (q) => {
    const t = String(q || '').trim();
    if (!t || /[\s:]/.test(t) || nameOf(t) || accOf(t)) return false;
    const sp = K.shown?.protein(t);
    if (sp) {
      S.q = '';
      K.go('protein', { arg: sp.acc });
      return true;
    }
    if (!K.card) return false;
    if (!lightIdx) {
      K.card.lightIndex().then((ix) => {
        lightIdx = ix;
        if (S.q === t && lightFind(ix, t)) K.openLight(t);
      });
      return false;
    }
    const hit = lightFind(lightIdx, t);
    if (!hit) return false;
    S.q = '';
    K.go('protein', { arg: hit[0] });
    return true;
  };
  // find a protein without marks (its accession, gene or entry name), then its record
  function lightLoad(key) {
    const L = PV.light;
    if (!L || L.key !== key || L.started) return;
    L.started = true;
    K.card.lightIndex().then((idx) => {
      const hit = lightFind(idx, key);
      if (!hit) {
        if (PV.light === L) {
          L.state = 'none';
          K.render();
        }
        return;
      }
      return K.card.light(hit[0]).then((x) => {
        if (PV.light !== L) return;
        if (!x) {
          L.state = 'none';
          K.render();
          return;
        }
        const p = {
          acc: hit[0],
          gene: x.gene,
          name: x.name,
          entry: x.entry,
          len: (x.seq || '').length,
          marks: 0,
          cand: 0,
          i: null,
        };
        Object.assign(PV, {
          acc: p.acc,
          lightP: p,
          rec: { entry: x.entry, md5: x.md5, seq: x.seq, marks: [], units: [], counts: {}, totals: {} },
          tb: {},
          af: null,
          uni: null,
          uniJson: null,
          pdb: null,
          ix: null,
          site: null,
          span: null,
          more: false,
          fn: false,
        });
        L.state = 'ok';
        L.x = x;
        // the address names it as the site's other proteins: its gene before its accession
        if (S.view === 'protein' && S.arg === key) {
          S.arg = p.acc;
          K.writeHash(false);
        }
        K.render();
      });
    });
  }
  // The page's sections for the sidebar. Modules register their folds in K.proteinFoldSections as [id, title (or a function that
  // returns it), level]; the core keeps the ones the page shows, and sorts them once, by the site's website.protein.order
  // (the folds the order lacks follow, in registration order). Without an order they go before the regions.
  K.proteinFoldSections ||= [];
  K.sections.protein = () => {
    const p = byAcc[PV.acc] || PV.lightP,
      name = p ? `${p.gene || p.acc}: ${p.name || ''}` : 'This protein';
    if (!byAcc[PV.acc]) return [['view', name, 1]];
    const here = (id) => document.getElementById(id),
      shown = (id) => here(id) && !here(id).hidden;
    const base = [
      ['view', name, 1],
      ...(PV.site ? [['site-card', `The ${W.mark} ${site(PV.site)}`, 1]] : []),
      ['g-marks', `${cap(W.marks)} on this protein`, 0],
      ['p-map', 'Protein map', 1],
      ['p-sites', cap(W.marks), 1],
      ['g-protein', 'The protein', 0],
      ...(D.analyses.some((a) => a.kind === 'protein_sets') ? [['p-kinds', 'Protein classes and pathways', 1]] : []),
      ['p-regions', 'Domains and regions', 1],
      ['p-seq', 'Sequence', 1],
      ...(K.s3d
        ? [
            ['g-live', 'Loaded when the page opens', 0],
            ['p-struct', '3D structure', 1],
          ]
        : []),
    ];
    const seen = new Set(base.map((x) => x[0])),
      extra = [];
    K.proteinFoldSections.forEach(([id, title, lev]) => {
      if (!seen.has(id) && shown(id)) {
        seen.add(id);
        extra.push([id, typeof title === 'function' ? title() : title, lev]);
      }
    });
    if (!K.foldOrder.length && !(PRO.groups || []).length) {
      const at = base.findIndex((x) => x[0] === 'p-regions');
      base.splice(at < 0 ? base.length : at, 0, ...extra);
      return base.filter((x) => !/^p-/.test(x[0]) || shown(x[0]) || !here(x[0]));
    }
    // the page has already arranged its folds by the site's order and groups (arrangeFolds), so the sidebar lists them as the page has them
    const head = base.filter((x) => !/^(p-|g-)/.test(x[0])),
      by = new Map([...base, ...extra].map((x) => [x[0], x]));
    const dom = [...document.querySelectorAll('#view details.pgroup, #view details.pfold')],
      seenIds = new Set();
    const folds = dom
      .map((d) => {
        if (d.classList.contains('pgroup')) {
          const h = d.querySelector(':scope > summary h2');
          return h ? [d.id, h.textContent, 0] : null;
        }
        seenIds.add(d.id);
        return by.has(d.id) && !d.hidden ? by.get(d.id) : null;
      })
      .filter(Boolean);
    const rest = [...base, ...extra].filter((x) => /^p-/.test(x[0]) && !seenIds.has(x[0]) && !here(x[0]));
    return [...head, ...folds, ...rest];
  };

  // ---- kinds of protein: the sets of each protein-set question this protein is in, with the site's result for each,
  // and its abundance as the test placed it (data/selection.json) --------------------------------------------------
  const SETROW = {};
  let setRowsIn = false;
  const setRow = (aid, s, m) => {
    if (!setRowsIn) {
      setRowsIn = true; // once: a protein in hundreds of sets asks hundreds of times
      D.rows.forEach((r) => {
        if (K.SETS(r.analysis)) SETROW[r.analysis + '\u0000' + r.category + '\u0000' + r.method] = r;
      });
    }
    return SETROW[aid + '\u0000' + s + '\u0000' + m];
  };
  const RANK = { more: 0, less: 1, same: 2, ns: 3 };
  function kindsHtml(p) {
    const sd = K.sel?.pdata(p.i);
    if (!sd) return `${K.loading('Loading the sets…')}`;
    let cov = null;
    const none = [];
    const blocks = D.analyses
      .filter((a) => a.kind === 'protein_sets' && sd.protein_sets?.[a.id] && !K.inSetCards?.(a.id))
      .map((a) => {
        const ps = sd.protein_sets[a.id];
        if (ps.covariate && !cov && ps.covariate.proteins[p.i])
          cov = { ...ps.covariate, me: ps.covariate.proteins[p.i], from: a };
        const mine = ps.sets
          .filter(([s]) => K.sel.setHas(a.id, s, p.i))
          .map(([s]) => ({ s, r: setRow(a.id, s, 'enricher') }))
          .filter((x) => x.r)
          .sort((x, y) => RANK[x.r.dir] - RANK[y.r.dir] || x.r.q - y.r.q);
        if (!mine.length) {
          none.push(esc(a.title));
          return '';
        }
        const shown = PV.open['kinds:' + a.id] ? mine : mine.slice(0, 12);
        return (
          `<div class="kind-set"><a href="${esc(K.link('overview', a.id))}"><b>${esc(a.title)}</b></a> ` +
          `<span class="muted">${int(mine.length)}</span> ` +
          shown.map((x) => `<a class="chip" href="${esc(K.link('overview', a.id))}">${esc(x.r.label)}</a>`).join(' ') +
          (mine.length > 12
            ? ` <button class="linkish" type="button" data-kinds-all="${esc(a.id)}">${
                PV.open['kinds:' + a.id] ? 'Fewer' : `All ${int(mine.length)}`
              }</button>`
            : '') +
          '</div>'
        );
      })
      .join('');
    const covLine = cov
      ? `<p class="kind-cov"><b>Abundance</b>: ${
          cov.me[0] == null ? 'no value' : `${esc(cov.value)} ${K.fxn(cov.me[0])}`
        } <span class="muted">(${[
          cov.me[1] !== 'none' ? `decile ${esc(cov.me[1])} of ${int(cov.strata)}` : '',
          esc(
            String(
              (Object.values(D.inputs).find((x) => (x.roles || [x.role]).includes(cov.input)) || {}).version ||
                cov.input
            ).replace(/\s*\(([^)]*?)(?:[- ]integrated)?\)/, (m, x) => ', ' + x.replace(/-/g, ' '))
          ),
        ]
          .filter(Boolean)
          .join('; ')})</span></p>`
      : '';
    // names only: a set's test is for every mark in it, not for this protein, so its numbers stay on the question's page
    const across = `<p class="muted small kinds-note">Sets containing ${esc(p.gene || p.acc)}</p>`;
    const noneLine = none.length ? `<p class="muted small kinds-none">Not in: ${none.join('; ')}.</p>` : '';
    return covLine + across + `<div class="kinds kinds-chips">${blocks}</div>` + noneLine;
  }

  // ---- domains and regions: every region the questions of this explorer read, as a table, with the marks inside each --------
  function regionsHtml(p, rec) {
    const tracks = D.tracks || [],
      title = (k) => (tracks.find((t) => t.kind === k) || {}).title || k;
    const labs = (k) => {
      const t = tracks.find((x) => x.kind === k);
      return (A[t?.analysis] || {}).labels || {};
    };
    const refUrl = (ref) => {
      const r = (D.ref_links || []).find((x) => ref && new RegExp(x.pattern).test(ref));
      return r ? r.url.replace('{ref}', encodeURIComponent(ref)) : null;
    };
    const rows = rec.units
      .slice()
      .sort(
        (x, y) => tracks.findIndex((t) => t.kind === x[0]) - tracks.findIndex((t) => t.kind === y[0]) || x[1] - y[1]
      );
    if (!rows.length) return `<p class="muted">No region is listed for this protein.</p>`;
    return (
      `<div class="card-head">${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'regexp', 'the regions', 'data')}</div>` +
      (`<div class="tbl-card"><table class="tbl"><thead><tr><th>Kind</th><th class="num">From–to</th><th>Name or ` +
        `class</th><th>Accession</th><th>${esc(cap(W.marks))} inside</th><th>Source</th></tr></thead><tbody>`) +
      rows
        .map(([k, s, e, lab, src, cls, ref]) => {
          const inside = rec.marks.filter((m) => m[0] >= s && m[0] <= e).map((m) => m[0]);
          const u = refUrl(ref);
          return (
            `<tr><td>${esc(title(k))}</td><td class="num mono">${rangeOf(p, s, e)}</td><td class="wrapok">${esc(lab || labs(k)[cls] || cls || '')}</td><td ` +
            `class="mono">${
              ref ? (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(ref)}</a>` : esc(ref)) : ''
            }</td>` +
            (`<td class="wrapok">${
              inside.length
                ? inside
                    .map(
                      (x) =>
                        `<button class="linkish mono" type="button" ` + `data-site-open="${x}">${esc(site(x))}</button>`
                    )
                    .join(' ')
                : '<span class="muted">–</span>'
            }</td><td ` +
              `class="wrapok muted">${esc((D.unit_sources || [])[src] || '')}</td></tr>`)
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }
  function regionsTsv() {
    const p = byAcc[PV.acc],
      rec = PV.rec,
      tracks = D.tracks || [];
    return (
      K.preamble(
        `${p.gene || p.acc}: domains and regions`,
        `regions of ${p.acc} with the ${W.marks} inside them` + numNote(p)
      ) +
      ['kind', 'start', 'end', 'shown_range', 'label', 'class', 'ref', `${W.marks}_inside`, 'source'].join('\t') +
      '\n' +
      rec.units
        .map(([k, s, e, lab, src, cls, ref]) =>
          [
            (tracks.find((t) => t.kind === k) || {}).title || k,
            s,
            e,
            rangeOf(p, s, e),
            lab || '',
            cls || '',
            ref || '',
            rec.marks
              .filter((m) => m[0] >= s && m[0] <= e)
              .map((m) => site(m[0]))
              .join(' '),
            (D.unit_sources || [])[src] || '',
          ].join('\t')
        )
        .join('\n') +
      '\n'
    );
  }

  // ---- the sequence, with the marks in it, and as FASTA ---------------------------------------------------------
  function fasta(p, rec) {
    const seq = (rec.seq || '').slice(dropped(p));
    return (
      `>${p.acc}${rec.entry ? '|' + rec.entry : ''} ${p.name || ''}${p.gene ? ' GN=' + p.gene : ''} [${(D.run.snapshot || {}).release || ''}; ${D.site.name}${dropped(p) ? '; initiator methionine not shown' : ''}]\n` +
      (seq.match(/.{1,60}/g) || []).join('\n') +
      '\n'
    );
  }
  function sequenceHtml(p, rec, sel) {
    const seq = rec.seq || '',
      d = dropped(p); // the initiator methionine is left out where the page numbers without it
    if (!seq) return `<p class="muted">No sequence is stored for this protein.</p>`;
    const at = new Map(rec.marks.map((m) => [m[0], m]));
    const res = (i) => {
      const m = at.get(i),
        aa = esc(seq[i - 1]);
      if (!m) return `<i data-r="${i}"${K.site.state.residue === i ? ' class="lk-res"' : ''}>${aa}</i>`;
      const c = K.map.siteColour(m),
        off = sel && !sel.has(i);
      return (
        `<b class="sq-m${off ? ' faded' : ''}${PV.site === i ? ' on' : ''}" style="--c:${c.c}" data-msite="${i}" tabindex="0" ` +
        `role="button" aria-label="${esc(site(i))}${c.label ? ', ' + esc(c.label) : ''}" title="${esc(site(i))}${c.label ? ' · ' + esc(c.label) : ''}">${aa}</b>`
      );
    };
    const lines = [];
    for (let s = d + 1; s <= seq.length; s += 60) {
      const blocks = [];
      for (let b = s; b < Math.min(s + 60, seq.length + 1); b += 10) {
        let t = '';
        for (let i = b; i < Math.min(b + 10, seq.length + 1); i++) t += res(i);
        blocks.push(t);
      }
      lines.push(`<span class="sq-n">${shownPos(p, s)}</span>${blocks.join(' ')}`);
    }
    return (
      `<div class="card-head"><p class="sub">${int(seq.length - d)} residues (${esc(
        (D.run.snapshot || {}).release || ''
      )}), the ${esc(W.marks)} in color ` +
      `as on the map. Hover for name, click for card.${d ? ' Initiator Met not counted.' : ''}</p>` +
      (`<span class="exp"><button class="btn small" type="button" data-fasta="copy">Copy FASTA</button><button ` +
        `class="btn small" type="button" data-fasta="dl">Download FASTA</button></span></div><pre class="seq">${lines.join('\n')}</pre>`)
    );
  }

  // ---- live sources: asked once per protein, shown when they answer, never needed for a number ---------------------
  const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  function fill(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  function proteinAfter(arg) {
    const acc = String(arg).split('/')[0];
    if (!byAcc[acc] && PV.light && !PV.light.started) lightLoad(PV.light.key);
    if (!PV.rec || PV.acc !== acc) return;
    // a link that cleaned a position off (not a mark here), or a search naming one mark of this protein (?q=FUS R216)
    if (PV.cleanArg) {
      PV.cleanArg = false;
      S.arg = acc;
      K.writeHash(false);
      document.title = K.views.protein.title(S.arg) + ' · ' + D.site.name;
    }
    if (!PV.qDone && byAcc[acc]) {
      PV.qDone = true;
      const q = S.q && K.sel?.parse ? K.sel.parse(S.q) : null,
        here = q ? q.sites.filter(([pi]) => pi === byAcc[acc].i) : [];
      if (!PV.site && here.length === 1 && PV.rec.marks.some((m) => m[0] === here[0][1])) {
        PV.site = here[0][1];
        S.arg = `${acc}/${PV.site}`;
        K.writeHash(false);
        K.render();
        return;
      }
    }
    if (PV.focus) {
      const f = PV.focus;
      PV.focus = '';
      requestAnimationFrame(() => document.getElementById(f)?.scrollIntoView({ block: 'start' }));
    }
    if (PV.site && PV.scrolled !== PV.site) {
      PV.scrolled = PV.site;
      landOnCard();
    } else if (PV.span && PV.scrolled !== String(PV.span)) {
      // the map, just below the sticky toolbar
      PV.scrolled = String(PV.span);
      requestAnimationFrame(() => {
        const t = document.getElementById('p-map');
        if (t)
          scrollTo(
            0,
            t.getBoundingClientRect().top + scrollY - (document.querySelector('.toolbar')?.offsetHeight || 0) - 8
          );
      });
    }
    // the function's More/Less only when there is more
    requestAnimationFrame(() => {
      const t = document.querySelector('.fn-text'),
        b = document.querySelector('[data-fn-more]');
      if (t && b && !PV.fn) b.hidden = t.scrollHeight <= t.clientHeight + 2;
    });
    drawMap();
    const p = byAcc[acc] || PV.lightP,
      rec = PV.rec;
    // UniProt, live: other names, the function, the features the map draws, and whether the sequence is still the one
    // these results were computed on
    (PV.uni ||= getJson(`https://rest.uniprot.org/uniprotkb/${acc}.json`).then(
      (j) => ({ ok: true, j }),
      (e) => ({ ok: false, e })
    )).then(({ ok, j }) => {
      if (PV.acc !== acc) return;
      if (!ok) {
        PV.uniFailed = true;
        fill('fn', '<p class="muted">UniProt did not answer. Nothing on this page depends on it.</p>');
        drawMap();
        return;
      }
      const first = !PV.uniJson;
      PV.uniJson = j;
      K.afterUni?.forEach((f) => f(acc));
      const names = [
        ...new Set(
          (j.genes || [])
            .flatMap((g) => [
              g.geneName?.value,
              ...(g.synonyms || []).map((x) => x.value),
              ...(g.orfNames || []).map((x) => x.value),
            ])
            .filter((x) => x && x !== p.gene && !genesOf(p).some((g) => g.toUpperCase() === x.toUpperCase()))
        ),
      ];
      fill('aliases', names.length ? `Also reported as ${names.map(esc).join(', ')}` : '');
      const texts = (j.comments || [])
        .filter((c) => c.commentType === 'FUNCTION')
        .flatMap((c) => (c.texts || []).map((t) => t.value));
      const linkPm = (t) =>
        esc(t).replace(
          /PubMed:(\d+)/g,
          (m0, id) => `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/">PubMed:${id}</a>`
        );
      fill(
        'fn',
        texts.length
          ? `<p class="fn-text${PV.fn ? ' open' : ''}">${texts.map(linkPm).join(' ')}</p><p class="src">` +
              `Function from <a href="https://www.uniprot.org/uniprotkb/${esc(acc)}/entry#function">UniProt ${esc(acc)}</a> · ` +
              `<button type="button" class="linkish" data-fn-more>${PV.fn ? K.ACT.showLess : K.ACT.showMore}</button></p>`
          : '<p class="muted">UniProt gives no function text for this entry.</p>'
      );
      if (first) {
        drawMap();
        const card = document.getElementById('site-card');
        if (card) card.outerHTML = siteCard(p, rec);
      }
      const live = String(j.sequence?.md5 || '').toUpperCase(),
        el = document.getElementById('drift');
      if (el && live && rec.md5 && live !== rec.md5.toUpperCase()) {
        el.hidden = false;
        el.innerHTML =
          `<b>UniProt has changed this sequence</b> since ${esc(
            D.run.snapshot?.release || 'the release these results use'
          )}. Positions ` +
          `on this page are on that release’s sequence; the cards below, retrieved from UniProt, may not line up with them.`;
      }
    });
    // AlphaFold DB: the model's confidence along the map (only if its sequence is the same); the model in 3D is kit-3d.js's
    (PV.afReq ||= {})[acc] ||= getJson(`https://alphafold.ebi.ac.uk/api/prediction/${acc}`).then(
      async (list) => {
        const m = Array.isArray(list) ? list[0] : null;
        if (!m) return { none: true };
        const same = m.sequence === rec.seq;
        let plddt = null;
        if (same && m.plddtDocUrl) {
          try {
            const d = await getJson(m.plddtDocUrl);
            plddt = d.confidenceScore || null;
          } catch (e) {
            plddt = null;
          }
        }
        return {
          version: m.latestVersion,
          mean: m.globalMetricValue,
          pdbUrl: m.pdbUrl,
          same,
          plddt,
          amUrl: same ? m.amAnnotationsUrl || '' : '',
        };
      },
      (e) => (String(e?.message) === '404' ? { none: true } : { failed: true }) // 404: AlphaFold DB has no model
    );
    PV.afReq[acc].then((af) => {
      if (PV.acc !== acc) return;
      if (af.failed || af.none) {
        const first = !PV.af;
        PV.af = af;
        if (first) drawMap();
      }
      if (af.failed || af.none) return;
      const first = !PV.af;
      PV.af = af;
      if (first) drawMap();
      K.pfolds?.refresh();
      K.s3d?.paintSide?.(); // the viewer's AlphaFold panel reads the site's confidence from the same array
      // AlphaMissense: each mark's substitutions (the file lists every residue's), their mean, read once for the site card
      if (af.amUrl && !af.am && !af.amAsked) {
        af.amAsked = true;
        fetch(af.amUrl)
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
          .then(
            (text) => {
              const want = new Map(rec.marks.map((x) => [x[0], rec.seq[x[0] - 1]])),
                out = new Map();
              for (const line of text.split('\n')) {
                const [v, sc] = line.split(','),
                  mm = /^([A-Z])(\d+)[A-Z]$/.exec(v || '');
                if (!mm || want.get(+mm[2]) !== mm[1] || !isFinite(+sc)) continue;
                const o = out.get(+mm[2]) || { sum: 0, n: 0 };
                o.sum += +sc;
                o.n++;
                out.set(+mm[2], o);
              }
              af.am = out;
              if (PV.acc === acc) K.siteTable?.refresh();
              if (PV.acc === acc && PV.site) {
                const card = document.getElementById('site-card');
                if (card) card.outerHTML = siteCard(p, rec);
              }
            },
            () => {}
          );
      }
    });
    K.s3d?.after(p, rec); // the 3D structure (kit-3d.js)
  }
  // ---- interaction partners: the site file turns the card on and names the taxon STRING files the organism under (website.partners); the card is kit-pnet.js's
  const IXP = D.partners || null;
  // website.protein.open_partners: the partners fold opens when the site's own partner table has partners for the protein
  const hasPartners = () => {
    const t = CC.writer?.partners?.table;
    return !!(t && PV.tb && K.card.rows(PV.tb, t).length);
  };
  K.hasData['p-ix'] = hasPartners;

  // ---- downloads: the map as a figure, the sites and the proteins as tables ------------------------------------------
  const mapFigure = () => K.map.figure(mapCtx());
  // a site's card, opened without leaving the page's place (the card is scrolled into view)
  // a site's card, opened without leaving the page's place, and without a step in the history (opening a protein is one)
  // every way in goes through the channel (kit-link.js), so the map, the sequence, the tables and the 3D follow
  const openSite = (pos, from) => K.site.focus(PV.acc, pos, { from: from || 'table' });
  function showSite(pos) {
    const y = scrollY;
    S.arg = `${PV.acc}/${pos}`;
    K.writeHash(true);
    K.render();
    scrollTo(0, y);
    document.title = K.views.protein.title(S.arg) + ' · ' + D.site.name;
    rowIntoView(pos);
  }
  // the row scrolls inside its own box; the page stays where it is
  function rowIntoView(pos) {
    requestAnimationFrame(() => {
      const tr = document.querySelector(`tr[data-site="${pos}"]`),
        box = tr?.closest('.lk-box');
      if (!tr || !box) return;
      const a = tr.getBoundingClientRect(),
        b = box.getBoundingClientRect(),
        head = box.querySelector('thead')?.offsetHeight || 0;
      if (a.top < b.top + head || a.bottom > b.bottom)
        box.scrollTop += a.top - b.top - head - (b.height - head - a.height) / 2;
    });
  }
  // each focus is one step of the history (Back returns to the earlier site, or to the protein); a change of the address itself (Back,
  // a link) is followed by the other views once the page is drawn, without writing it again
  let followed = '';
  K.site.on((e) => {
    if (e.kind !== 'focus') return;
    followed = e.acc + '/' + (e.pos ?? '');
    if (e.from === 'history' || e.acc !== PV.acc || !PV.rec) return;
    if (e.pos == null) {
      if (PV.site != null) {
        const y = scrollY;
        S.arg = PV.acc;
        PV.site = null;
        K.writeHash(true);
        K.render();
        scrollTo(0, y);
        document.title = K.views.protein.title(S.arg) + ' · ' + D.site.name;
      }
      return;
    }
    if (e.pos !== PV.site) showSite(e.pos);
    else rowIntoView(e.pos);
  });
  K.site.on((e) => {
    // a position that is not a site: the map's crosshair, the sequence
    if (e.kind !== 'residue' || e.acc !== PV.acc) return;
    const x = document.getElementById('map-cross');
    if (x) K.map.cross?.(e.pos);
  });
  document.addEventListener('keydown', (e) => {
    const tr = e.target.closest?.('tr[data-site]');
    if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openSite(+tr.dataset.site);
    }
  });
  function sitesTsv() {
    const p = byAcc[PV.acc],
      rec = PV.rec;
    return (
      K.preamble(
        `${W.marks} of ${p.gene || p.acc} (${p.acc})`,
        `each ${W.mark} of ${p.gene || p.acc} (${p.name}) with the ` +
          `15 residues around it and its class in every question; the sequence is ${D.run.snapshot?.release} (MD5 ${rec.md5}).` +
          numNote(p)
      ) +
      ['site', 'position', 'window_15', ...COLS, ...AT, ...(rec.shown?.length ? ['counted'] : [])].join('\t') +
      '\n' +
      rec.marks
        .map((m) =>
          [
            site(m[0]),
            m[0],
            m[1],
            ...markClasses(m).map(([aid, v]) => classText(aid, v)),
            ...(m[3] || []),
            ...(rec.shown?.length ? ['yes'] : []),
          ].join('\t')
        )
        .join('\n') +
      '\n' +
      (rec.shown || [])
        .map((m) => [site(m[0]), m[0], m[1], ...COLS.map(() => ''), ...(m[3] || []), 'no'].join('\t'))
        .join('\n') +
      (rec.shown?.length ? '\n' : '')
    );
  }

  // ---- register with the core -------------------------------------------------------------------------------------
  // the page's title: the protein, then the site (FUS R216)
  K.views.protein = {
    render: proteinView,
    after: proteinAfter,
    tab: 'proteins',
    pdfName: () => {
      const p = byAcc[PV.acc];
      return p && { title: `${p.gene || p.acc} (${p.acc})`, file: `${D.site.id}_${p.gene || p.acc}_${p.acc}.pdf` };
    },
    title: (arg) => {
      const [a, at] = String(arg).split('/'),
        p = byAcc[a] || (PV.lightP?.acc === a ? PV.lightP : null);
      return p ? (p.gene || p.acc) + (at && /^\d+$/.test(at) ? ' ' + siteOf(p, +at) : '') : a;
    },
  };
  K.tabs.push(() => ['proteins', 'Proteins', K.sel?.active() ? (K.sel.loading() ? '…' : K.sel.nProteins()) : P.length]);
  K.clicks.push(
    [
      '[data-sexp]',
      (el) => {
        const p = byAcc[PV.acc];
        K.tableExport(
          el.dataset.sexp,
          el,
          el.closest('#p-sites') || document.body,
          {
            title: `${cap(W.marks)} of ${p.gene || p.acc}`,
            sub:
              `${p.name || ''} (${p.acc}); ${int(PV.rec.marks.length)} ${W.marks}, each with ` +
              `the evidence the table shows`,
            total: PV.rec.marks.length,
          },
          `${D.site.id}_${PV.acc}_sites`,
          sitesTsv
        );
      },
    ],
    [
      '[data-mexp]',
      (el) =>
        K.exportFigure(
          el.dataset.mexp,
          mapFigure,
          K.map.fileName ? K.map.fileName(el.dataset.mexp) : `${D.site.id}_${PV.acc}_map`,
          el,
          sitesTsv
        ),
    ],
    ['[data-msite]', (el) => openSite(+el.dataset.msite, el.closest('.seq') ? 'sequence' : 'map')],
    ['[data-site-open]', (el) => openSite(+el.dataset.siteOpen)],
    [
      '[data-folds]',
      (el) => {
        const on = el.dataset.folds === 'open';
        document.querySelectorAll('details.pgroup, details.pfold').forEach((d) => {
          d.open = on;
          PV.open[d.id] = on;
        });
      },
    ],
    [
      '[data-all-cols]',
      () => {
        PV.allCols = !PV.allCols;
        PV.open['p-sites'] = true;
        K.render();
      },
    ],
    [
      '[data-kinds-all]',
      (el) => {
        const k = 'kinds:' + el.dataset.kindsAll;
        PV.open[k] = !PV.open[k];
        PV.open['p-kinds'] = true;
        K.render();
      },
    ],
    [
      '[data-regexp]',
      (el) => {
        const p = byAcc[PV.acc];
        K.tableExport(
          el.dataset.regexp,
          el,
          el.closest('#p-regions') || document.body,
          {
            title: `Domains and ` + `regions of ${p.gene || p.acc}`,
            sub:
              `${p.name || ''} (${p.acc}); every region the questions of this explorer read, ` +
              `with the ${W.marks} inside each`,
            total: PV.rec.units.length,
          },
          `${D.site.id}_${PV.acc}_regions`,
          regionsTsv
        );
      },
    ],
    [
      '[data-fasta]',
      (el) => {
        const p = byAcc[PV.acc],
          text = fasta(p, PV.rec);
        if (el.dataset.fasta === 'dl') {
          K.download(`${p.acc}${p.gene ? '_' + p.gene : ''}.fasta`, text, 'text/plain');
          return;
        }
        const done = (t) => {
          const o = el.textContent;
          el.textContent = t;
          setTimeout(() => {
            el.textContent = o;
          }, 1500);
        };
        if (navigator.clipboard?.writeText)
          navigator.clipboard.writeText(text).then(
            () => done('Copied'),
            () => done('Copy failed')
          );
        else done('Copy failed');
      },
    ],
    [
      'tr[data-site]',
      (el, e) => {
        if (!e.target.closest('a, button, summary, input')) openSite(+el.dataset.site);
      },
    ],
    ['[data-site-close]', () => K.site.focus(PV.acc, null, { from: 'card' })],
    // the readable link to the site, without the reader's selection
    [
      '[data-site-copy]',
      (el) => {
        const url =
          location.origin +
          location.pathname +
          '#protein/' +
          K.routes.protein.path(`${PV.acc}/${PV.site}`).split('/').map(encodeURIComponent).join('/');
        navigator.clipboard?.writeText(url).then(() => {
          el.textContent = 'Link copied';
          setTimeout(() => {
            el.textContent = 'Copy link';
          }, 1500);
        });
      },
    ],
    [
      '[data-site-ev]',
      () => {
        PV.evOpen.add(PV.site);
        PV.open['p-sites'] = true;
        K.render();
        requestAnimationFrame(() =>
          document.querySelector(`tr[data-site="${PV.site}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        );
      },
    ],
    [
      '[data-pfilter]',
      (el) => {
        PV.pf = PV.pf === el.dataset.pfilter ? '' : el.dataset.pfilter;
        const y = scrollY;
        K.render();
        scrollTo(0, y);
      },
    ],
    [
      '[data-hl-open]',
      (el) => {
        const d = document.getElementById(el.dataset.hlOpen);
        if (d) {
          d.open = true;
          PV.open[d.id] = true;
          const g = d.closest('details.pgroup');
          if (g) {
            g.open = true;
            PV.open[g.id] = true;
          }
          d.scrollIntoView({ block: 'start', behavior: 'smooth' });
          markSection(d.id);
        }
      },
    ],
    [
      '#site-card [data-cexp]',
      (el) => {
        const card = document.getElementById('site-card'),
          p = byAcc[PV.acc],
          name = `${D.site.id}_${p.gene || p.acc}_${site(PV.site)}`;
        if (el.dataset.cexp === 'tsv') K.exportFigure('tsv', null, name, el, siteCardTsv);
        else if (el.dataset.cexp === 'pdf') K.pagePdf?.(card, `${p.gene || p.acc} ${site(PV.site)}`, name + '.pdf', el);
        else K.elementPng?.(card, name + '.png', el);
      },
    ],
    [
      '[data-light-all]',
      () => {
        PV.lightAll = !PV.lightAll;
        K.render();
      },
    ],
    [
      '[data-rec-tsv]',
      (el) => {
        const p = byAcc[PV.acc],
          m = PV.rec.marks.find((x) => x[0] === +el.dataset.recTsv);
        if (m)
          K.exportFigure('tsv', null, `${D.site.id}_${p.gene || p.acc}_${site(m[0])}_records`, el, () =>
            K.card.recordsTsv(cardCtx(p, PV.rec, m))
          );
      },
    ],
    [
      '[data-more-links]',
      (el) => {
        PV.more = !PV.more;
        document.getElementById('more-menu').hidden = !PV.more;
        el.setAttribute('aria-expanded', String(PV.more));
      },
    ],
    [
      '[data-fn-more]',
      () => {
        PV.fn = !PV.fn;
        document.querySelector('.fn-text')?.classList.toggle('open', PV.fn);
        const b = document.querySelector('[data-fn-more]');
        if (b) b.textContent = PV.fn ? K.ACT.showLess : K.ACT.showMore;
      },
    ],
    [
      'tr[data-acc]',
      (el, e) => {
        if (!e.target.closest('a')) K.go('protein', { arg: el.dataset.acc });
      },
    ]
  );
  // the row's own buttons come before the row's click (which opens the site's card)
  K.clicks.unshift(
    [
      '[data-site-3d]',
      (el) => {
        const pos = +(el.dataset.site3d || PV.site);
        if (typeof K.show3d === 'function') K.show3d(PV.acc, pos);
      },
    ],
    [
      '[data-ev-toggle]',
      (el) => {
        const pos = +el.dataset.evToggle;
        if (PV.evOpen.has(pos)) PV.evOpen.delete(pos);
        else PV.evOpen.add(pos);
        const y = scrollY;
        K.render();
        scrollTo(0, y);
      },
    ]
  );
  K.tips.push(['[data-hl-tip]', (el) => el.dataset.hlTip || '']);
  // the attributes the shown marks' tag lists in its hover (website.shown_marks), not listed again
  const tagAttrs = new Set(K.shown?.on ? [...(K.shown.cfg.tests?.attributes || []), ...(K.shown.cfg.also || [])] : []);
  // a site's hover (website.protein.map.hover.site: the fields in order): concise, a name, a line of evidence chips and
  // the marks nearby; the question classes, the window and every attribute are on the site card
  const HV = (D.protein_view?.map || {}).hover || {};
  const HOVER_SITE = HV.site || ['name', 'chips', 'nearby', 'click'];
  const coarse = () => !!window.matchMedia?.('(pointer: coarse)').matches;
  const chipOf = (m, spec) => {
    const n = typeof spec === 'string' ? spec : spec.attribute,
      s = SPECS[n];
    const v = s ? attrVal(m, n) : '';
    if (!s || v === '' || v == null) return '';
    if (s.kind === 'list') {
      const vals = String(v)
        .split(s.separator || '; ')
        .filter(Boolean);
      if (spec.count) return `${vals.length} ${vals.length === 1 ? spec.count.replace(/s$/, '') : spec.count}`;
      const lab = (x) => (K.sel?.valueLabel ? K.sel.valueLabel(n, x) : x);
      return vals.length > 2 ? `${lab(vals[0])}, ${lab(vals[1])} +${vals.length - 2}` : vals.map(lab).join(', ');
    }
    if (spec.count) return `${v} ${spec.count}`;
    if (s.kind === 'number') return `${s.label} ${Number.isFinite(+v) ? +(+v).toPrecision(3) : v}`;
    return K.sel?.valueLabel ? K.sel.valueLabel(n, v) : String(v);
  };
  const chipSpecs = () =>
    HV.chips ||
    Object.keys(SPECS)
      .filter((n) => SPECS[n].provenance && !SPECS[n].present)
      .slice(0, 3);
  const nearbyHtml = (pos) => {
    const win = K.nearWindow?.() || HV.window || 10,
      max = HV.nearby_max || 3,
      hits = K.map?.nearby ? K.map.nearby(PV.acc, pos, win) : [];
    if (!hits.length) return '';
    const word = (h) =>
      `${esc(h.res)} ${esc(h.mark)} ${h.dist > 0 ? '+' : '−'}${Math.abs(h.dist)}${h.score != null ? ` (${esc(h.score)})` : ''}`;
    return (
      `<span class="muted">nearby:</span> ${hits.slice(0, max).map(word).join(' · ')}` +
      (hits.length > max ? ` · +${hits.length - max} more` : '')
    );
  };
  function siteTip(pos) {
    const m = PV.rec?.marks.find((x) => x[0] === pos);
    if (!m) return '';
    const c = K.map.siteColour(m),
      out = [];
    HOVER_SITE.forEach((f) => {
      if (f === 'name') out.push(`<b>${esc(site(pos))}</b>${c.label ? ' · ' + esc(c.label) : ''}`);
      else if (f === 'chips') {
        const chips = chipSpecs()
          .map((sp) => chipOf(m, sp))
          .filter(Boolean);
        if (chips.length) out.push(chips.map(esc).join(' · '));
      } else if (f === 'nearby') {
        const h = nearbyHtml(pos);
        if (h) out.push(h);
      } else if (f === 'window') out.push(`<span class="win">${winHtml(m[1])}</span>`);
      else if (f === 'classes')
        markClasses(m).forEach(([aid, v]) => out.push(`${esc(A[aid]?.title || aid)}: ${esc(classText(aid, v))}`));
      else if (f === 'attributes')
        shownAttrs(m)
          .filter((n) => !tagAttrs.has(n))
          .forEach((n) => out.push(`<span class="muted">${esc(SPECS[n].label)}:</span> ${attrHtml(m, n, false)}`));
      else if (f === 'shown') {
        if (K.shown?.on && K.shown.counted(m))
          out.push(`<b>${esc(cap(K.shown.label()))}</b>: ${esc(K.shown.tip(m, false))}`);
      } else if (f === 'click')
        out.push(`<span class="muted">${coarse() ? 'Tap again for details' : 'Click for details'}</span>`);
    });
    return out.join('<br>');
  }
  K.prot.siteTip = siteTip;
  K.tips.push(['[data-msite]', (el) => siteTip(+el.dataset.msite)]);
});
