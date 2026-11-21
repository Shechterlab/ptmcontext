/* The Mutation frequency page (#mutations): two views of the sites of the current selection (the whole site list when nothing
   is selected, a site set or any search or filter otherwise), from the release's frequency tables (data/wf.json, data/onco.json;
   ptmcontext/web/propensity.py writes them, read when the page opens):
     waterfall   every site ranked by the share of samples with a change at it, highest first (x), the share (y); the sites with
                 no change are the flat tail on the right; a gray curve shows the other residues of the same type (the ones that
                 are not sites), their ranks scaled to the number of sites so that both curves span the same width. A source
                 (TCGA tumors, DepMap cell lines), a cancer type and "with / without hypermutated" choose the samples.
     oncoprint   the sites with the most changed samples (rows) against the TCGA tumors that carry them (columns), joined to the
                 sample's burden: coding calls per Mb, with the hypermutated threshold marked.
   Hypermutated samples (more than 10 coding calls per Mb, Campbell et al., Cell 171:1042 (2017)) are left out unless the reader
   puts them back. Frequencies are changed samples over samples profiled in the chosen group (group_denominators). A module of
   the site kit; without website.propensity and its frequency tables it does nothing. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, S, esc, int } = K;
  const PR = D.propensity;
  if (!PR || !PR.wf || !K.prop) return;
  const SRC = PR.sources.filter((s) => s.frequency_source);
  if (!SRC.length) return;
  const byAcc = Object.fromEntries((D.proteins || []).map((p) => [p[0], p]));

  // ---- the choices (kept in the address: ms source, mg cancer type, mv view, mz zoom; hyper is kit-propensity's) -------------
  const M = { src: SRC[0].id, group: '', view: 'waterfall', zoom: 0 };
  K.paramsIn.push((p) => {
    M.src = SRC.some((s) => s.id === p.get('ms')) ? p.get('ms') : SRC[0].id;
    M.group = p.get('mg') || '';
    M.view = p.get('mv') === 'oncoprint' ? 'oncoprint' : 'waterfall';
    M.zoom = [100, 1000].includes(+p.get('mz')) ? +p.get('mz') : 0;
  });
  K.paramsOut.push((p) => {
    if (S.view !== 'mutations') return;
    if (M.src !== SRC[0].id) p.set('ms', M.src);
    if (M.group) p.set('mg', M.group);
    if (M.view !== 'waterfall') p.set('mv', M.view);
    if (M.zoom) p.set('mz', String(M.zoom));
  });
  const sourceOf = () => SRC.find((s) => s.id === M.src) || SRC[0];

  // ---- the data, read when the page opens ---------------------------------------------------------------------------------
  const FILES = {};
  const get = (key, url) =>
    (FILES[key] ||= fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (j) => {
          FILES[key + ':v'] = j;
          if (S.view === 'mutations') K.render();
          return j;
        },
        () => (FILES[key + ':v'] = null)
      ));
  const wfData = () => (get('wf', PR.wf.file), FILES['wf:v']);
  const ocData = () => (PR.onco ? (get('onco', PR.onco.file), FILES['onco:v']) : null);
  let SITE_IDX = null;
  const siteIdx = (wf) => {
    if (SITE_IDX && SITE_IDX.wf === wf) return SITE_IDX.map;
    const map = new Map();
    for (const [acc, list] of Object.entries(wf.sites)) for (const e of list) map.set(acc + ':' + e[0], e);
    SITE_IDX = { wf, map };
    return map;
  };

  // ---- the sites of the selection: each once (a site counted for several types is one site), with its residue -----------------
  function selSites() {
    const SD = K.sel.data();
    if (!SD) return null;
    const idx = K.sel.active() ? K.sel.compute().marks || [] : null;
    const seen = new Set(),
      out = [];
    const add = (m) => {
      if (!m) return;
      const acc = D.proteins[m[0]][0],
        key = acc + ':' + m[1];
      if (seen.has(key)) return;
      seen.add(key);
      out.push([acc, m[1], (m[4] || '')[7] || '']);
    };
    if (idx) idx.forEach((i) => add(SD.marks[i]));
    else SD.marks.forEach(add);
    return out;
  }
  const siteName = (acc, pos, res) =>
    `${byAcc[acc]?.[1] || acc} ${res || ''}${K.prot?.shownPos ? K.prot.shownPos(acc, pos) : pos}`.replace(/\s+/g, ' ');
  const pct = (f) =>
    f == null
      ? '–'
      : f === 0
        ? '0%'
        : f < 0.001
          ? (100 * f).toFixed(2) + '%'
          : f < 0.1
            ? (100 * f).toFixed(1) + '%'
            : (100 * f).toFixed(0) + '%';
  const gname = (g) => g || '(no lineage)';

  // ---- the waterfall's numbers ------------------------------------------------------------------------------------------------
  const hyper = () => K.prop.state.hyper;
  // changed samples of a site in the chosen group and cohort: the entry is [position, residue, per source ([group, changed,
  // changed without hypermutated] triples)]
  function changed(entry, si, gi) {
    const a = entry?.[2 + si] || [];
    let m = 0;
    for (let i = 0; i < a.length; i += 3) if (gi === '' || a[i] === gi) m += a[i + (hyper() ? 1 : 2)];
    return m;
  }
  function model() {
    const wf = wfData(),
      sites = selSites();
    if (!wf || !sites) return null;
    const s = sourceOf(),
      si = SRC.indexOf(s),
      groups = wf.groups[s.id] || [],
      gi = M.group === '' ? '' : groups.indexOf(M.group);
    const g = gi === -1 ? '' : gi;
    const den = g === '' ? wf.all[s.id][hyper() ? 0 : 1] : wf.den[s.id][g][hyper() ? 0 : 1];
    const idx = siteIdx(wf);
    const rows = sites.map(([acc, pos, res]) => ({ acc, pos, res, m: changed(idx.get(acc + ':' + pos), si, g) }));
    rows.sort((a, b) => b.m - a.m || (a.acc < b.acc ? -1 : a.acc > b.acc ? 1 : a.pos - b.pos));
    const letters = [...new Set(rows.map((r) => r.res).filter((r) => PR.residues.includes(r)))];
    return { wf, s, si, g, den, rows, letters: letters.length ? letters : PR.residues, n: rows.length };
  }
  // the curve of the residues that are not sites: the residue types of the selection mixed, as the value at a fraction of the
  // way down the ranking (the twin of propensity.py rank_value for one curve; step between the segments of a mix)
  function backdrop(m) {
    const cohort = hyper() ? 'all' : 'no_hypermutated',
      key = m.g === '' ? '' : String(m.g);
    const segs = [];
    let total = 0;
    for (const res of m.letters) {
      const c = m.wf.bg[m.s.id]?.[cohort]?.[res]?.[key];
      if (!c) continue;
      const [mm, nn, ranks, vals] = c;
      total += nn;
      let prev = 0,
        pv = vals[0];
      ranks.forEach((r, i) => {
        segs.push([i ? (pv + vals[i]) / 2 : vals[0], r - prev]);
        prev = r;
        pv = vals[i];
      });
      if (nn > mm) segs.push([0, nn - mm]);
    }
    segs.sort((a, b) => b[0] - a[0]);
    const cum = [];
    let acc = 0;
    for (const [v, w] of segs) cum.push([(acc += w), v]);
    return (u) => {
      const r = u * total;
      let lo = 0,
        hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid][0] < r) lo = mid + 1;
        else hi = mid;
      }
      return cum.length ? cum[lo][1] : 0;
    };
  }
  const niceMax = (v) => {
    if (!(v > 0)) return 0.01;
    const e = 10 ** Math.floor(Math.log10(v)),
      f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  };

  // ---- the waterfall's drawing: `c` the colors (the page's tokens, or fixed colors for an export) ----------------------------
  const THEME = {
    ink: 'var(--ink)',
    muted: 'var(--muted)',
    line: 'var(--line-strong)',
    site: 'var(--accent)',
    bg: 'var(--muted)',
    cap: 'var(--surface)',
  };
  const LIGHT = { ink: '#1f2937', muted: '#6b7280', line: '#cbd5e1', site: '#0f766e', bg: '#9ca3af', cap: '#ffffff' };
  function waterfallSvg(m, c, w) {
    const ml = 54,
      mr = 16,
      mt = 14,
      mb = 46,
      H = 300,
      pw = w - ml - mr,
      ph = H - mt - mb;
    const shown = Math.max(1, Math.min(m.n, M.zoom || m.n));
    const fr = m.rows.map((r) => (m.den ? r.m / m.den : 0));
    const bg = backdrop(m);
    const bgAt = (rank) => bg(Math.min(1, rank / m.n));
    const top = Math.max(fr[0] || 0, bgAt(1));
    const ymax = niceMax(top * 1.05);
    const X = (rank) => ml + ((rank - 0.5) / shown) * pw,
      Y = (f) => mt + ph * (1 - f / ymax);
    const cols = Math.min(shown, Math.floor(pw)),
      per = shown / cols;
    let area = `M${ml},${Y(0).toFixed(1)}`,
      line = '';
    for (let i = 0; i < cols; i++) {
      const r = Math.floor(i * per),
        x0 = ml + (i / cols) * pw,
        x1 = ml + ((i + 1) / cols) * pw,
        y = Y(fr[r] || 0).toFixed(1);
      area += `L${x0.toFixed(1)},${y}L${x1.toFixed(1)},${y}`;
      line += `${i ? 'L' : 'M'}${x0.toFixed(1)},${y}L${x1.toFixed(1)},${y}`;
    }
    area += `L${ml + pw},${Y(0).toFixed(1)}Z`;
    let b = '';
    for (let i = 0; i < cols; i++) {
      const rank = (i + 0.5) * per + 1,
        x0 = ml + (i / cols) * pw,
        x1 = ml + ((i + 1) / cols) * pw,
        y = Y(bgAt(rank)).toFixed(1);
      b += `${i ? 'L' : 'M'}${x0.toFixed(1)},${y}L${x1.toFixed(1)},${y}`;
    }
    let ax = `<line x1="${ml}" x2="${ml + pw}" y1="${Y(0)}" y2="${Y(0)}" stroke="${c.line}"/><line x1="${ml}" x2="${ml}" y1="${mt}" y2="${Y(0)}" stroke="${c.line}"/>`;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (ymax * i) / ticks;
      ax += `<line x1="${ml - 4}" x2="${ml}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${c.line}"/><text x="${ml - 7}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="${c.muted}">${pct(v)}</text>`;
    }
    const xt = [1, ...[0.25, 0.5, 0.75, 1].map((f) => Math.round(f * shown))].filter((v, i, a) => a.indexOf(v) === i);
    xt.forEach((r) => {
      ax += `<line x1="${X(r).toFixed(1)}" x2="${X(r).toFixed(1)}" y1="${Y(0)}" y2="${Y(0) + 4}" stroke="${c.line}"/><text x="${X(r).toFixed(1)}" y="${Y(0) + 16}" text-anchor="${r === shown ? 'end' : r === 1 ? 'start' : 'middle'}" font-size="11" fill="${c.muted}">${int(r)}</text>`;
    });
    ax += `<text x="${ml + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="11.5" fill="${c.muted}">${esc(W.marks)} ranked by frequency, highest first${shown < m.n ? ` (top ${int(shown)} of ${int(m.n)})` : ''}</text>`;
    ax += `<text transform="translate(13,${mt + ph / 2}) rotate(-90)" text-anchor="middle" font-size="11.5" fill="${c.muted}">samples with a change</text>`;
    // the tail of sites with no change: a bracket under the flat part
    const nz = m.rows.filter((r) => r.m > 0).length;
    let tail = '';
    if (nz < shown) {
      const x0 = X(nz + 1),
        x1 = X(shown) + 0.5 * (pw / shown);
      tail = `<path d="M${x0.toFixed(1)},${Y(0) - 12}v-5h${(x1 - x0).toFixed(1)}v5" fill="none" stroke="${c.muted}"/><text x="${((x0 + x1) / 2).toFixed(1)}" y="${Y(0) - 22}" text-anchor="middle" font-size="11" fill="${c.ink}">${int(m.n - nz)} ${esc(W.marks)} with no change</text>`;
    }
    // names for the top few
    // names for the top few, each at least 13 px under the one before (the others are in the hover)
    let names = '',
      lastY = -99;
    m.rows.slice(0, 8).forEach((r, i) => {
      if (!r.m || i >= shown) return;
      const y = Y(fr[i]) + 4;
      if (y - lastY < 13) return;
      lastY = y;
      names += `<text x="${(X(i + 1) + 6).toFixed(1)}" y="${y.toFixed(1)}" font-size="11" fill="${c.ink}">${esc(siteName(r.acc, r.pos, r.res))}</text>`;
    });
    return {
      H,
      ml,
      pw,
      shown,
      ymax,
      body:
        `<path d="${b}" fill="none" stroke="${c.bg}" stroke-width="1.6" stroke-dasharray="4 3"/>` +
        `<path d="${area}" fill="${c.site}" fill-opacity="0.25"/><path d="${line}" fill="none" stroke="${c.site}" stroke-width="1.4"/>` +
        ax +
        tail +
        names,
      bgAt,
      fr,
    };
  }
  const waterfallNote = (m) =>
    `Each ${W.mark} of the selection is one position on the x axis, ranked by the share of ${esc(m.s.long || m.s.label)} samples with a change at it${
      M.group ? ` in ${esc(gname(M.group))}` : ''
    } (changed samples over samples profiled: ${int(m.den)}). The dashed gray curve is the other ${esc(W.residues)} of the same type that are not sites, with their ranks scaled to the number of sites. ${
      hyper()
        ? 'Hypermutated samples are included.'
        : 'Hypermutated samples (more than 10 coding calls per Mb) are left out.'
    }`;
  // ---- the oncoprint's numbers ---------------------------------------------------------------------------------------------
  const TOP = 30;
  function onco() {
    const oc = ocData(),
      sites = selSites();
    if (!oc || !sites) return null;
    const hy = hyper();
    const proj = M.group ? oc.projects.indexOf(M.group) : -1;
    const ok = (i) => (hy || !oc.samples[i][2]) && (proj < 0 || oc.samples[i][1] === proj);
    const idx = new Map();
    for (const [acc, list] of Object.entries(oc.sites))
      for (const [pos, cells] of list) idx.set(acc + ':' + pos, cells);
    const rows = [];
    for (const [acc, pos, res] of sites) {
      const cells = (idx.get(acc + ':' + pos) || []).filter((v) => ok(v >> 1));
      if (cells.length) rows.push({ acc, pos, res, cells });
    }
    rows.sort((a, b) => b.cells.length - a.cells.length || (a.acc < b.acc ? -1 : 1) || a.pos - b.pos);
    const top = rows.slice(0, TOP);
    const has = top.map((r) => new Map(r.cells.map((v) => [v >> 1, v & 1])));
    const cols = [...new Set(top.flatMap((r) => r.cells.map((v) => v >> 1)))];
    // the usual order: the samples with the first row first, then the second, ...
    cols.sort((a, b) => {
      for (const h of has) {
        const d = (h.has(b) ? 1 : 0) - (h.has(a) ? 1 : 0);
        if (d) return d;
      }
      return a - b;
    });
    return { oc, top, has, cols, nSites: rows.length, nSelected: sites.length };
  }
  // the oncoprint's frame: left margin, width, a column's width, where the rows start and their height
  const oncoGeo = (o, w) => {
    const ml = 128,
      mr = 70,
      mt = 12,
      burdenH = 34,
      gap = 8,
      rowH = 13,
      pw = w - ml - mr;
    return {
      ml,
      mr,
      mt,
      burdenH,
      gap,
      rowH,
      pw,
      cw: pw / (o.cols.length || 1),
      y0: mt + burdenH + gap,
      H: mt + burdenH + gap + o.top.length * rowH + 30,
    };
  };
  function oncoprintSvg(o, c, w, cellColors) {
    const geo = oncoGeo(o, w),
      { ml, mt, burdenH, rowH, pw, cw, H } = geo;
    let s = '';
    // the burden track: coding calls per Mb, capped, the hypermutated threshold marked
    const CAP = 40,
      th = PR.hypermutated.per_mb;
    const yb = (v) => mt + burdenH - (Math.min(v, CAP) / CAP) * burdenH;
    o.cols.forEach((i, k) => {
      const smp = o.oc.samples[i];
      s += `<rect x="${(ml + k * cw).toFixed(2)}" y="${yb(smp[3]).toFixed(1)}" width="${Math.max(0.6, cw - (cw > 3 ? 0.6 : 0)).toFixed(2)}" height="${(mt + burdenH - yb(smp[3])).toFixed(1)}" fill="${smp[2] ? c.stop : c.muted}"/>`;
    });
    s += `<line x1="${ml}" x2="${ml + pw}" y1="${yb(th).toFixed(1)}" y2="${yb(th).toFixed(1)}" stroke="${c.line}" stroke-dasharray="3 3"/><text x="${ml - 6}" y="${(yb(th) + 3.5).toFixed(1)}" text-anchor="end" font-size="10.5" fill="${c.muted}">${th} per Mb</text>`;
    s += `<text x="${ml - 6}" y="${mt + 8}" text-anchor="end" font-size="10.5" fill="${c.muted}">calls per Mb</text>`;
    const y0 = geo.y0;
    o.top.forEach((r, j) => {
      const y = y0 + j * rowH;
      s += `<rect x="${ml}" y="${y}" width="${pw}" height="${rowH - 2}" fill="${c.track}"/>`;
      o.cols.forEach((i, k) => {
        const st = o.has[j].get(i);
        if (st === undefined) return;
        s += `<rect x="${(ml + k * cw).toFixed(2)}" y="${y}" width="${Math.max(0.8, cw - (cw > 3 ? 0.6 : 0)).toFixed(2)}" height="${rowH - 2}" fill="${cellColors[st]}"/>`;
      });
      s += `<text x="${ml - 6}" y="${y + rowH - 4}" text-anchor="end" font-size="11" fill="${c.ink}">${esc(siteName(r.acc, r.pos, r.res))}</text>`;
      s += `<text x="${ml + pw + 6}" y="${y + rowH - 4}" font-size="11" fill="${c.muted}">${int(r.cells.length)}</text>`;
    });
    s += `<text x="${ml + pw / 2}" y="${H - 8}" text-anchor="middle" font-size="11.5" fill="${c.muted}">${int(o.cols.length)} TCGA tumors with a change at one of these ${esc(W.marks)}</text>`;
    return { svg: s, H, ml, pw, cw, y0, rowH };
  }
  const oncoNote = (o) =>
    `The ${int(o.top.length)} ${esc(W.marks)} with the most TCGA tumors changed, of ${int(o.nSites)} with at least one${
      M.group ? ` in ${esc(M.group)}` : ''
    }. Each column is a tumor sample, joined by its sample id to its coding calls per Mb (the bar above, capped at 40; the dashed line is the hypermutated threshold). ${
      hyper() ? 'Hypermutated tumors (red bars) are included.' : 'Hypermutated tumors are left out.'
    }`;

  // ---- the page ------------------------------------------------------------------------------------------------------------------
  const seg = (attr, label, items, cur) =>
    `<div class="seg" role="group" aria-label="${esc(label)}"><span class="seg-l">${esc(label)}</span>` +
    items
      .map(
        ([v, t]) =>
          `<button type="button" ${attr}="${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(t)}</button>`
      )
      .join('') +
    '</div>';
  function controls(wf) {
    const s = sourceOf(),
      groups = wf.groups[s.id] || [];
    return (
      `<div class="mu-ctl">` +
      (SRC.length > 1
        ? seg(
            'data-mu-src',
            'Source',
            SRC.map((x) => [x.id, x.label]),
            M.src
          )
        : '') +
      `<label class="mu-ct"><span class="seg-l">Cancer type</span><select data-mu-ct aria-label="Cancer type"><option value="">All cancer types</option>` +
      groups
        .map((g) => `<option value="${esc(g)}"${g === M.group ? ' selected' : ''}>${esc(gname(g))}</option>`)
        .join('') +
      `</select></label>${K.prop.hyperSwitch('Samples')}</div>`
    );
  }
  function setSummary() {
    const rows = PR.summary?.sets || [];
    if (!rows.length || K.sel.active()) return '';
    const pick = rows.filter((r) => ['tcga_mc3', 'depmap_24q4', 'clinvar', 'gnomad_v4_1'].includes(r.source));
    const lab = { tcga_mc3: 'TCGA', depmap_24q4: 'DepMap', clinvar: 'ClinVar', gnomad_v4_1: 'gnomAD' };
    const fo = (v) => (v == null ? '–' : v >= 10 ? v.toFixed(0) : v.toFixed(2));
    const fp = (v) => (v == null ? '–' : v < 0.001 ? v.toExponential(1) : v.toFixed(3));
    return (
      `<details class="mu-set"><summary>The whole list against what its codons predict (the release's site set test)</summary>` +
      `<p class="small muted">${esc(PR.summary.set_label || '')}: the changes at the ${esc(W.marks)} within their proteins against the sum, over the proteins, of the changes at their residues of the type times the ${esc(W.marks)}' share of the protein's mutability. p from ${int(PR.summary.iterations || 10000)} draws; the smallest p is about 1e−4. It does not change with your selection.</p>` +
      `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Source</th><th>Residue</th><th>Samples</th><th>${esc(cap1(W.marks))}</th><th>Observed</th><th>Expected</th><th>O/E</th><th>p (more)</th><th>p (fewer)</th></tr></thead><tbody>` +
      pick
        .map(
          (r) =>
            `<tr><td>${esc(lab[r.source] || r.source)}${r.oe_status === 'descriptive' ? ' <span class="muted">(descriptive)</span>' : ''}</td><td>${esc(r.residue)}</td><td>${r.cohort === 'no_hypermutated' ? 'without hypermutated' : 'all'}</td><td>${int(r.sites)}</td><td>${int(r.observed)}</td><td>${fo(r.expected)}</td><td>${fo(r.oe)}</td><td>${fp(r.p_upper)}</td><td>${fp(r.p_lower)}</td></tr>`
        )
        .join('') +
      `</tbody></table></div></details>`
    );
  }
  const cap1 = (t) =>
    String(t || '')
      .charAt(0)
      .toUpperCase() + String(t || '').slice(1);
  function view() {
    const head =
      `<div class="page-head results-head"><div><h2>Mutation frequency</h2><p class="cx">How often each ${esc(W.mark)} of the current ` +
      `selection is changed in tumors or cell lines, and which tumors carry the most changed ${esc(W.marks)}. Hypermutated tumors are left out unless you put them back.</p></div></div>`;
    if (!K.sel.data()) return head + K.loading(`Loading the ${W.marks}…`);
    const wf = wfData();
    if (wf === undefined) return head + K.loading('Loading the frequencies…');
    if (wf === null) return head + '<p class="muted">The frequencies could not be read.</p>';
    const note = K.sel.active()
      ? ''
      : `<div class="filter-note">No search or filter is set, so these figures use every ${esc(W.mark)} of the site. Search for proteins or set filters to focus them.</div>`;
    const tabs = seg(
      'data-mu-view',
      'View',
      [
        ['waterfall', 'Waterfall'],
        ['oncoprint', 'Oncoprint'],
      ],
      M.view
    );
    let body = '';
    if (M.view === 'waterfall') {
      const m = model();
      if (!m) return head + K.loading('Loading…');
      const f = waterfallSvg(m, THEME, 760);
      const zoom = seg(
        'data-mu-zoom',
        'Show',
        [
          [0, 'All'],
          [1000, 'Top 1,000'],
          [100, 'Top 100'],
        ],
        M.zoom
      );
      body =
        `<section class="mu-card"><div class="mu-top"><p class="small muted">${waterfallNote(m)}</p>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'muwf', 'mutation frequency', 'propensity')}</div>` +
        `<p class="small">${int(m.n)} ${esc(W.marks)}; ${int(m.rows.filter((r) => r.m > 0).length)} with a change in ${esc(m.s.long || m.s.label)}.</p>${zoom}` +
        `<svg id="mu-svg" class="mu-svg" viewBox="0 0 760 ${f.H}" role="img" aria-label="Waterfall of the frequency of each site, ranked">${f.body}` +
        `<rect id="mu-hover" x="${f.ml}" y="0" width="${f.pw}" height="${f.H - 40}" fill="transparent" data-prtip=""/></svg>` +
        `<p class="pr-key small muted"><span class="pr-k"><svg width="26" height="10" aria-hidden="true"><path d="M0 8H26" stroke="var(--accent)" stroke-width="2"/></svg>${esc(W.marks)} of the selection, ranked</span>` +
        `<span class="pr-k"><svg width="26" height="10" aria-hidden="true"><path d="M0 5H26" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 3"/></svg>other ${esc(W.residues)} of the same type, ranks scaled to the number of ${esc(W.marks)}</span></p></section>`;
    } else {
      const o = onco();
      if (!o) return head + K.loading('Loading…');
      if (!o.top.length)
        body = `<p class="muted">No ${esc(W.mark)} of the selection has a tumor with a change${hyper() ? '' : ' (hypermutated tumors left out)'}.</p>`;
      else {
        const f = oncoprintSvg(o, { ...ONC_THEME }, 760, ['var(--accent)', 'var(--onc-stop)']);
        body =
          `<section class="mu-card"><div class="mu-top"><p class="small muted">${oncoNote(o)}</p>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'muon', 'oncoprint', 'propensity')}</div>` +
          `<svg id="mu-svg" class="mu-svg" viewBox="0 0 760 ${f.H}" role="img" aria-label="Oncoprint of the top sites across TCGA tumors">${f.svg}` +
          `<rect id="mu-hover" x="${f.ml}" y="0" width="${f.pw}" height="${f.H}" fill="transparent" data-prtip=""/></svg>` +
          `<p class="pr-key small muted"><span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--accent)"/></svg>missense change</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--onc-stop)"/></svg>stop gained</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--muted)"/></svg>burden, below the threshold</span>` +
          `<span class="pr-k"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" fill="var(--onc-stop)"/></svg>burden, hypermutated</span></p></section>`;
      }
    }
    return `${head}${note}<div class="mu-bar">${tabs}${controls(wf)}</div>${body}${M.view === 'waterfall' ? setSummary() : ''}`;
  }
  const ONC_THEME = {
    ink: 'var(--ink)',
    muted: 'var(--muted)',
    line: 'var(--line-strong)',
    stop: 'var(--onc-stop)',
    track: 'var(--surface-2)',
  };
  const ONC_LIGHT = { ink: '#1f2937', muted: '#9ca3af', line: '#cbd5e1', stop: '#6d28d9', track: '#f1f5f9' };

  // ---- hovering ------------------------------------------------------------------------------------------------------------------
  document.addEventListener('mousemove', (e) => {
    const r = e.target.id === 'mu-hover' ? e.target : null;
    if (!r) return;
    const box = r.getBoundingClientRect(),
      f = (e.clientX - box.left) / box.width;
    if (M.view === 'waterfall') {
      const m = model();
      if (!m) return;
      const shown = Math.min(m.n, M.zoom || m.n),
        i = Math.min(shown - 1, Math.max(0, Math.floor(f * shown))),
        row = m.rows[i];
      const fr = m.den ? row.m / m.den : 0;
      const bg = backdrop(m)(Math.min(1, (i + 1) / m.n));
      let t = `${siteName(row.acc, row.pos, row.res)} · rank ${int(i + 1)} of ${int(m.n)}\n${int(row.m)} of ${int(m.den)} ${m.s.unit?.[1] || 'samples'} with a change (${pct(fr)})`;
      if (!K.prop.peek(row.acc)) K.prop.load(row.acc);
      const v = K.prop.at(row.acc, m.s.id, row.pos);
      if (v && v.o != null)
        t += `\nO/E ${K.prop.fo(v.o)}, expected ${K.prop.fe(v.e)}${v.q != null ? ', q ' + K.prop.fq(v.q) : ''}`;
      t += `\nother ${W.residues} at this place in their ranking: ${pct(bg)}`;
      r.setAttribute('data-prtip', t);
    } else {
      const o = onco();
      if (!o || !o.cols.length) return;
      const box2 = document.getElementById('mu-svg').getBoundingClientRect(),
        sc = 760 / box2.width,
        x = (e.clientX - box2.left) * sc;
      const g = oncoGeo(o, 760);
      const k = Math.floor((x - g.ml) / g.cw);
      if (k < 0 || k >= o.cols.length) return;
      const smp = o.oc.samples[o.cols[k]];
      const has = o.top.filter((_, jj) => o.has[jj].has(o.cols[k])).map((rr) => siteName(rr.acc, rr.pos, rr.res));
      r.setAttribute(
        'data-prtip',
        `TCGA-${smp[0]} · ${o.oc.projects[smp[1]]}\n${smp[3]} coding calls per Mb${smp[2] ? ' (hypermutated)' : ''}\nchanged: ${has.join(', ')}`
      );
    }
  });
  // controls
  K.clicks.push(
    ['[data-mu-view]', (b) => ((M.view = b.dataset.muView), K.render())],
    ['[data-mu-src]', (b) => ((M.src = b.dataset.muSrc), (M.group = ''), K.render())],
    ['[data-mu-zoom]', (b) => ((M.zoom = +b.dataset.muZoom), K.render())]
  );
  document.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-mu-ct]')) {
      M.group = e.target.value;
      K.render();
    }
  });
  K.prop.onHyper(() => {
    if (S.view === 'mutations') K.render();
  });

  // ---- downloads -----------------------------------------------------------------------------------------------------------------
  function waterfallFigure() {
    const m = model(),
      f = waterfallSvg(m, LIGHT, 720);
    return K.figureFrame({
      title: 'Mutation frequency of the sites',
      sub: `${K.sel.describe() || 'every ' + W.mark}: ${int(m.n)} ${W.marks}, ${m.s.long || m.s.label}${M.group ? ', ' + gname(M.group) : ''}`,
      body: `<g transform="translate(20,0)">${f.body}</g>`,
      bodyH: f.H,
      W: 760,
      note: waterfallNote(m).replace(/<[^>]+>/g, ''),
    });
  }
  const waterfallTsv = () => {
    const m = model();
    return (
      K.preamble(
        'Mutation frequency of the sites',
        `${m.s.long || m.s.label}${M.group ? ', ' + gname(M.group) : ', all cancer types'}; ${hyper() ? 'with' : 'without'} hypermutated samples; frequency = samples with a change / samples profiled (group_denominators)`
      ) +
      'rank\taccession\tsite\tchanged_samples\tsamples_profiled\tfrequency\n' +
      m.rows
        .map((r, i) =>
          [i + 1, r.acc, siteName(r.acc, r.pos, r.res), r.m, m.den, m.den ? +(r.m / m.den).toPrecision(4) : ''].join(
            '\t'
          )
        )
        .join('\n') +
      '\n'
    );
  };
  function oncoFigure() {
    const o = onco(),
      f = oncoprintSvg(o, ONC_LIGHT, 720, ['#0f766e', '#6d28d9']);
    return K.figureFrame({
      title: 'Oncoprint of the top sites in TCGA',
      sub: `${K.sel.describe() || 'every ' + W.mark}: ${int(o.top.length)} ${W.marks}, ${int(o.cols.length)} tumors`,
      body: `<g transform="translate(20,0)">${f.svg}</g>`,
      bodyH: f.H,
      W: 760,
      note: oncoNote(o).replace(/<[^>]+>/g, ''),
    });
  }
  const oncoTsv = () => {
    const o = onco();
    return (
      K.preamble(
        'Oncoprint of the top sites in TCGA',
        `${hyper() ? 'with' : 'without'} hypermutated tumors; sample burden from sample_burden`
      ) +
      'site\taccession\tsample_id\tproject\tchange\tcoding_calls_per_mb\thypermutated\n' +
      o.top
        .flatMap((r) =>
          r.cells.map((v) => {
            const s = o.oc.samples[v >> 1];
            return [
              siteName(r.acc, r.pos, r.res),
              r.acc,
              'TCGA-' + s[0],
              o.oc.projects[s[1]],
              v & 1 ? 'stop' : 'missense',
              s[3],
              s[2] ? 'yes' : 'no',
            ].join('\t');
          })
        )
        .join('\n') +
      '\n'
    );
  };
  K.clicks.push(
    [
      '[data-muwf]',
      (b) =>
        K.exportFigure(b.dataset.muwf, waterfallFigure, `${D.site.id}_mutation_frequency_waterfall`, b, waterfallTsv),
    ],
    ['[data-muon]', (b) => K.exportFigure(b.dataset.muon, oncoFigure, `${D.site.id}_oncoprint`, b, oncoTsv)]
  );

  K.views.mutations = { render: view, title: () => 'Mutation frequency', follows: true };
  K.tabs.push(() => ['mutations', 'Mutation frequency', K.sel?.active() ? 'selection' : null]);

  // ---- Method and Help ----------------------------------------------------------------------------------------------------------
  const sumC = (kind, source, cohort) => {
    const r = (PR.summary?.controls || []).filter((x) => x.kind === kind && x.source === source && x.cohort === cohort);
    const n = (res) => r.filter((x) => x.result === res).reduce((a, x) => a + x.n, 0);
    return { pass: n('pass'), fail: n('fail'), nt: n('not_tested'), all: r.reduce((a, x) => a + x.n, 0) };
  };
  (K.methodParts ||= []).push(() => {
    const ctl = ['oncohistone', 'recurrent hotspot']
      .map((kind) =>
        ['tcga_mc3', 'depmap_24q4']
          .map((src) => ['all', 'no_hypermutated'].map((co) => ({ kind, src, co, ...sumC(kind, src, co) })))
          .flat()
      )
      .flat()
      .filter((x) => x.all);
    const lab = { tcga_mc3: 'TCGA', depmap_24q4: 'DepMap' };
    const val = (PR.summary?.validation || []).filter((v) => v.cohort === 'all');
    return (
      `<section id="m-propensity"><h3>Mutation propensity</h3>` +
      `<p>For each candidate residue (every known ${esc(W.mark)} and every other residue of the same type with a change), the release counts the tumor samples, cell lines, ClinVar variations or gnomAD variants with a missense or stop change there (k) and compares k with what the residue's codon predicts. ` +
      `The expected count is n × w / Σw: n is the number of changes at the protein's residues of the same type, w is the residue's mutability (the rate of each base change that alters the residue, summed over its codon, each in its trinucleotide context), and Σw is the sum of w over those residues. ` +
      `k is tested against Binomial(n, w / Σw); O/E is k over the expected count; q is the Benjamini–Hochberg value over every residue tested for that source and residue type. ` +
      `The weights need a coding sequence that translates to the UniProt sequence (18,717 of 20,416 reviewed entries); a residue of any other entry is shown with an O/E that counts every residue of the type as equally likely, and it has no q. ` +
      `Every column is defined in the release's data dictionary (<a href="https://github.com/Shechterlab/PTM_Pipeline/blob/v1.7.0/releases/v1.7.0/README.md" target="_blank" rel="noopener">PTM_Pipeline v1.7.0, README</a>); the site does not add another method to it.</p>` +
      `<p><b>Rates.</b> TCGA and DepMap use each source's own spectrum: the residue-changing single-base changes in the coding sequences, per trinucleotide class. ClinVar and gnomAD use gnomAD's germline rates (mutation_rate_methylation_bins, from the gnomAD v2.1.1 flagship paper: <a href="https://doi.org/10.1038/s41586-020-2308-7" target="_blank" rel="noopener">Karczewski et al., Nature 581:434 (2020)</a>).</p>` +
      `<p><b>Hypermutated samples</b> have more than ${PR.hypermutated.per_mb} coding calls per Mb (<a href="https://pubmed.ncbi.nlm.nih.gov/29056344/" target="_blank" rel="noopener">Campbell et al., Cell 171:1042 (2017)</a>). The cards and pages leave them out by default; the release repeats the test without them, with the spectrum of the other samples, and the switch puts them back.</p>` +
      `<p><b>ClinVar</b> variants reflect clinical testing and submission more than mutation, so its O/E is descriptive: no ring and no q on the cards. gnomAD also has the lower tail (fewer variants than expected), shown in the tooltip when q &lt; 0.05.</p>` +
      `<p><b>Cards.</b> On a protein's cancer and germline cards each source is a lollipop plot along the protein: the stick is the count shown in the card's table, the head's area grows with O/E, and a ring marks q &lt; 0.05. The site card has one line with the site's O/E and q in each source.</p>` +
      `<p><b>Mutation frequency page.</b> The waterfall ranks the sites of the selection by the share of samples with a change (changed samples over the samples profiled in the chosen group: the release's group_denominators), including the sites with no change as the flat tail. The gray curve is the same for the other residues of the same type that are not sites, with their ranks scaled to the number of sites. The oncoprint shows the sites with the most changed TCGA tumors against those tumors, joined by sample id to the release's sample_burden.</p>` +
      (ctl.length
        ? `<p><b>Positive controls</b> (H3 oncohistone residues and recurrent cancer hotspots; <a href="https://doi.org/10.1038/nbt.3391" target="_blank" rel="noopener">Chang et al., Nat Biotechnol 34:155 (2016)</a>). A control passes when q &lt; 0.05. A failed control is reported here and does not block the release.</p>` +
          `<div class="tbl-card"><table class="tbl"><thead><tr><th>Controls</th><th>Source</th><th>Samples</th><th>Pass</th><th>Fail</th><th>Not tested</th></tr></thead><tbody>` +
          ctl
            .map(
              (x) =>
                `<tr><td>${esc(x.kind)}</td><td>${esc(lab[x.src])}</td><td>${x.co === 'all' ? 'all' : 'without hypermutated'}</td><td>${int(x.pass)}</td><td>${int(x.fail)}</td><td>${int(x.nt)}</td></tr>`
            )
            .join('') +
          `</tbody></table></div>`
        : '') +
      (val.length
        ? `<p><b>Check against permutation.</b> On up to 1,000 protein and residue-type units per source, the binomial p and a permutation p (each unit's changes redrawn over its residues by mutability, ${int(val[0].iterations || 10000)} draws) agree on whether p &lt; 0.05 for ${val
            .map(
              (v) =>
                `${(100 * v.agreement_p05).toFixed(1)}% of ${int(v.residues)} residues (${esc({ tcga_mc3: 'TCGA', depmap_24q4: 'DepMap', clinvar: 'ClinVar', gnomad_v4_1: 'gnomAD' }[v.source] || v.source)})`
            )
            .join(', ')}.</p>`
        : '') +
      `</section>`
    );
  });
  const st = document.createElement('style');
  st.id = 'kit-mutations-css';
  st.textContent = [
    ':root{--onc-stop:#6d28d9}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--onc-stop:#c4b5fd}}:root[data-theme="dark"]{--onc-stop:#c4b5fd}',
    '.mu-bar{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;align-items:center;margin:.8rem 0}.mu-ctl{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center}',
    '.mu-ct{display:inline-flex;align-items:center;gap:.4rem}.mu-ct select{font:inherit;padding:.25rem .4rem;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--ink);max-width:14rem}',
    '.mu-card{margin:.6rem 0;max-width:800px}.mu-top{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:flex-start;justify-content:space-between}.mu-top p{flex:1 1 24rem;margin:0}',
    '.mu-svg{width:100%;height:auto;display:block;margin:.4rem 0}.mu-set{margin:1rem 0}.mu-set summary{cursor:pointer}',
  ].join('');
  document.head.appendChild(st);
});
