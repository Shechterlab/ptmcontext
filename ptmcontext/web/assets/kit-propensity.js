/* Mutation propensity (website.propensity): for every candidate residue, the changes seen in a source (TCGA tumors, DepMap
   cell lines, ClinVar, gnomAD) against the changes its codon predicts. Reads data/m (a few proteins to a file, like data/g;
   ptmcontext/web/propensity.py writes it) and gives the rest of the kit:
     K.prop.load(acc)            a protein's rows, by source, once the file is in (a promise; null when it cannot be read)
     K.prop.at(acc, src, pos)    {k, e, o, q, u, ...} at a residue in the chosen cohort, from what load() has read
     K.prop.lollipop(opts)       a protein's residues as lollipops: stick = count, circle size = seen/expected, ring = q < 0.05
     K.prop.siteLine(c)          the site card's one line: seen/expected and q of the site in each source
     K.prop.hyperSwitch()        the switch between "without hypermutated" (the default) and "with" samples
   The numbers are the release's own (the data dictionary defines them): expected = n x the residue's share of the protein's
   mutability over its residues of the same type; q = Benjamini-Hochberg over every residue tested of the source and residue
   type, from a binomial test of k against that share. ClinVar's seen/expected is descriptive: no ring, no q. A residue of a protein with
   no coding sequence that matches UniProt's has no weights: its seen/expected is against every residue of the type equally likely,
   and it has no q. A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, esc, int } = K;
  const PR = D.propensity;
  if (!PR) return;
  const SRC = Object.fromEntries(PR.sources.map((s) => [s.id, s]));
  const RING = 0.05;

  // ---- the cohort: hypermutated samples (more than 10 coding calls per Mb) are left out unless the reader asks ----------------
  const state = { hyper: false };
  const subs = [];
  K.paramsIn.push((p) => {
    state.hyper = p.get('hyper') === '1';
  });
  K.paramsOut.push((p) => {
    if (state.hyper) p.set('hyper', '1');
  });
  const setHyper = (on) => {
    state.hyper = !!on;
    subs.forEach((f) => f(state.hyper));
  };
  const hyperSwitch = (label) =>
    `<div class="seg" role="group" aria-label="Hypermutated samples"><span class="seg-l">${esc(label || 'Samples')}</span>` +
    [
      [0, 'Without hypermutated'],
      [1, 'With hypermutated'],
    ]
      .map(
        ([v, t]) =>
          `<button type="button" data-pr-hyper="${v}" aria-pressed="${state.hyper === !!v}"` +
          ` title="Hypermutated: more than ${PR.hypermutated.per_mb} coding calls per Mb (Campbell et al., Cell 171:1042 (2017)). Switching shows a second test, run without them.">${t}</button>`
      )
      .join('') +
    `</div>`;
  K.clicks.push([
    '[data-pr-hyper]',
    (b) => {
      setHyper(b.dataset.prHyper === '1');
    },
  ]);

  // ---- the files: data/m/NNN.json, the shard of a protein by variants.py hash_shard ------------------------------------------
  const hashOf = (acc, n) => {
    let h = 0;
    for (const c of acc) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
    return h % n;
  };
  const files = {};
  const shard = (k) =>
    (files[k] ||= fetch(`data/m/${String(k).padStart(3, '0')}.json`).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(String(r.status)))
    ));
  // a block as rows: the twin of propensity.py decode
  function rowsOf(b) {
    const u = new Set(b.u || []),
      u2 = new Set(b.u2 || b.u || []),
      low = new Map();
    for (let i = 0; i < (b.l || []).length; i += 2) low.set(b.l[i], b.l[i + 1]);
    let pos = 0;
    return b.p.map((d, i) => {
      pos += d;
      const r = { pos, k: b.k[i], e: b.e[i], o: b.o[i], q: b.q[i], pu: b.pu[i], u: u.has(i) };
      if (b.k2) Object.assign(r, { k2: b.k2[i], e2: b.e2[i], o2: b.o2[i], q2: b.q2[i], pu2: b.pu2[i], u2: u2.has(i) });
      if (b.pl) r.pl = b.pl[i];
      if (low.has(i)) r.ql = low.get(i);
      return r;
    });
  }
  const DATA = {},
    PEND = {};
  function load(acc) {
    if (acc in DATA) return Promise.resolve(DATA[acc]);
    return (PEND[acc] ||= shard(hashOf(acc, PR.shards)).then(
      (sh) => {
        const out = {};
        for (const [id, b] of Object.entries(sh[acc] || {})) {
          const rows = rowsOf(b);
          if (b.r) rows.forEach((r, i) => (r.res = b.r[i])); // the residue letter, where the protein has more than one type
          out[id] = { rows, by: new Map(rows.map((r) => [r.pos, r])), h: b.h, h2: b.h2 };
        }
        return (DATA[acc] = out);
      },
      () => (DATA[acc] = null)
    ));
  }
  const peek = (acc) => DATA[acc];

  // ---- one residue's numbers in the chosen cohort ---------------------------------------------------------------------------
  const somatic = (id) => SRC[id]?.kind === 'somatic';
  // ---- a protein dominated by its enriched residues (propensity.py hotspots): its other residues look depleted -------------
  // `list` is [[residue, share in percent, [positions of its enriched residues]], ...] for the proteins that are; the entry of the
  // site's residue type (`res`, or the only entry when the protein has one type) is {res, pct, pos: [...], self: the site is one}
  function hotPick(list, res, pos) {
    const e = (list || []).find((x) => !res || x[0] === res);
    return e ? { res: e[0], pct: e[1], pos: e[2], self: e[2].includes(pos) } : null;
  }
  // 'TP53 R273, R248, R175' (up to three, the most changes first; 'and 2 more' after them)
  const hotName = (acc, h) => {
    const p = (D.proteins || []).find((x) => x[0] === acc),
      sh = (n) => `${h.res}${K.prot?.shownPos ? K.prot.shownPos(acc, n) : n}`;
    return `${p ? p[1] : acc} ${h.pos.slice(0, 3).map(sh).join(', ')}${h.pos.length > 3 ? ` and ${h.pos.length - 3} more` : ''}`;
  };
  const hotNoun = (id) => (SRC[id]?.kind === 'germline' ? 'variants' : 'changes');
  // 'R273, R248, R175' ('R252 and R108' for two; 'and 2 more' after three)
  const hotSites = (acc, h) => {
    const sh = (n) => `${h.res}${K.prot?.shownPos ? K.prot.shownPos(acc, n) : n}`,
      xs = h.pos.slice(0, 3).map(sh);
    return h.pos.length > 3
      ? `${xs.join(', ')} and ${h.pos.length - 3} more`
      : xs.length > 1
        ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
        : xs.join('');
  };
  // a short note for the site card and the chosen-sites table ('' when the protein has no dominant residues)
  const hotNote = (acc, h, id) =>
    h
      ? h.self
        ? h.pos.length === 1
          ? `${h.pct}% of this protein's ${hotNoun(id)} are at this site`
          : `this site is one of the enriched residues with ${h.pct}% of this protein's ${hotNoun(id)}`
        : `${h.pct}% of this protein's ${hotNoun(id)} are at ${hotSites(acc, h)}`
      : '';
  // the waterfall's tooltip line for a site of such a protein; `fewer`: the site is drawn below zero
  const hotTip = (acc, h, noun, fewer) =>
    h.self
      ? h.pos.length === 1
        ? `${h.pct}% of this protein's ${noun} are at this residue.`
        : `This residue is one of the enriched residues (${hotName(acc, h)}) with ${h.pct}% of this protein's ${noun}.`
      : `${h.pct}% of this protein's ${noun} are at ${hotName(acc, h)}. The expected count at its other residues is inflated` +
        (fewer ? ", so 'fewer' here mostly reflects that hotspot." : '.');
  // the default labels of the waterfall: the top and bottom of the ranking (rows sorted by signed score y; t each end), skipping
  // the sites of a protein dominated by its enriched residues (r.hot, unless the site is one of them); the reader's own labels are separate
  function defaultLabels(m, shown, phone) {
    const t = phone ? 3 : 5,
      skip = (r) => r.hot && !r.hot.self,
      out = [];
    for (let i = 0; i < Math.min(shown, m.n) && out.length < t; i++) {
      if ((m.rows[i].y ?? 0) <= 0) break;
      if (!skip(m.rows[i])) out.push(i);
    }
    if (shown === m.n) {
      let c = 0;
      for (let i = m.n - 1; i >= 0 && c < t; i--) {
        if ((m.rows[i].y ?? 0) >= 0) break;
        if (!skip(m.rows[i]) && !out.includes(i)) (out.push(i), c++);
      }
    }
    return out;
  }
  // ---- the waterfall's gene list (wg in the address): the words of a pasted list, and what its proteins' sites do on a waterfall ----
  const MAX_GENES = 60;
  const geneWords = (text) => {
    const seen = new Set(),
      out = [];
    for (const w of String(text || '').split(/[\s,;]+/)) {
      if (w && !seen.has(w.toLowerCase()) && out.length < MAX_GENES) (seen.add(w.toLowerCase()), out.push(w));
    }
    return out;
  };
  // rows: the waterfall's sites in rank order ({acc, y}); accs: the accessions of the listed proteins; shown: the ranks drawn.
  // by: row numbers per protein; marked: every row of the list's proteins; labels: one row per protein, its largest |y| among the
  // ranks drawn (the first on a tie); genes, sites, up, down: the counts over all rows
  function geneHits(rows, accs, shown) {
    const by = new Map();
    let up = 0,
      down = 0,
      sites = 0;
    rows.forEach((r, i) => {
      if (!accs.has(r.acc)) return;
      sites++;
      if ((r.y ?? 0) > 0) up++;
      else if ((r.y ?? 0) < 0) down++;
      if (!by.has(r.acc)) by.set(r.acc, []);
      by.get(r.acc).push(i);
    });
    const labels = [];
    by.forEach((list) => {
      let best = -1,
        bv = -1;
      for (const i of list) {
        if (i >= shown) break;
        const v = Math.abs(rows[i].y ?? 0);
        if (v > bv) ((bv = v), (best = i));
      }
      if (best >= 0) labels.push(best);
    });
    labels.sort((a, b) => a - b);
    return { by, marked: new Set([...by.values()].flat()), labels, genes: by.size, sites, up, down };
  }
  function at(acc, id, pos, hyper = state.hyper) {
    const r = DATA[acc]?.[id]?.by.get(pos);
    if (!r) return null;
    const nh = somatic(id) && !hyper && r.k2 !== undefined;
    const b = DATA[acc][id];
    const hot = hotPick(nh ? b.h2 : b.h, r.res, pos);
    return nh
      ? { k: r.k2, e: r.e2, o: r.o2, q: r.q2, p: r.pu2, u: r.u2, kAll: r.k, nh: true, hot }
      : { k: r.k, e: r.e, o: r.o, q: r.q, p: r.pu, pl: r.pl, u: r.u, ql: r.ql, kAll: r.k, nh: false, hot };
  }
  const desc = (id) => !!SRC[id]?.descriptive;
  const fo = (o) =>
    o == null ? '–' : o >= 100 ? int(Math.round(o)) : o >= 10 ? o.toFixed(0) : o >= 1 ? o.toFixed(1) : o.toFixed(2);
  const fe = (e) =>
    e == null ? '–' : e >= 10 ? e.toFixed(0) : e >= 1 ? e.toFixed(1) : e >= 0.01 ? e.toFixed(2) : '< 0.01';
  const fq = (q) =>
    q == null
      ? '–'
      : q === 0
        ? '< 1e−300'
        : q < 0.001
          ? q.toExponential(1).replace('e-', 'e−')
          : q < 0.1
            ? q < RING && q.toFixed(3) === '0.050'
              ? '< 0.05'
              : q.toFixed(3)
            : q.toFixed(2);
  const sig = (v) => v != null && !desc(v.id) && v.q != null && v.q < RING;
  // the words for one source at one residue, for a tooltip (lines) or the site card (one line)
  function words(id, v, unit) {
    const s = SRC[id];
    if (!v || v.o == null)
      return { head: 'no seen/expected', note: `${s.label}: this protein has no change at its residues of this type` };
    const parts = [`seen/expected ${fo(v.o)}`, `expected ${fe(v.e)}`];
    let status = '',
      note = '';
    if (desc(id))
      status =
        'descriptive: ClinVar reflects clinical testing more than how often residues change, so there is no test';
    else if (v.q == null)
      status =
        'no test: no coding sequence matches UniProt, so seen/expected treats every residue of the type as equally likely';
    else {
      if (v.p != null) parts.push(`p ${fq(v.p)}`);
      parts.push(`q ${fq(v.q)}`);
      note = 'p: binomial, not corrected; q: corrected (Benjamini–Hochberg)';
    }
    return { head: parts.join(' · '), note: status || note, unit };
  }
  function tip(acc, id, pos, site, n) {
    const s = SRC[id],
      v = at(acc, id, pos),
      u = s.unit || ['sample', 'samples'];
    const lines = [`${site} · ${s.label}`];
    const all = n ?? v?.kAll ?? 0,
      one = (x) => `${int(x)} ${x === 1 ? u[0] : u[1]}`;
    // a count without hypermutated samples says so, with the count in all samples beside it
    lines.push(v?.nh && v.k !== all ? `${one(v.k)} without hypermutated samples; ${int(all)} in all` : one(all));
    const w = words(id, v);
    lines.push(w.head);
    if (w.note) lines.push(w.note);
    if (v?.pl != null && v.o != null && v.o < 1)
      lines.push(`fewer than expected: p ${fq(v.pl)}${v.ql != null ? `, q ${fq(v.ql)}` : ''}`);
    else if (v?.ql != null) lines.push(`fewer than expected: q ${fq(v.ql)}`);
    if (v && somatic(id)) lines.push(v.nh ? 'without hypermutated samples' : 'with hypermutated samples');
    if (v?.hot) lines.push(hotNote(acc, v.hot, id));
    return lines.join('\n');
  }

  // ---- the tooltip: one floating box for every lollipop circle and waterfall mark ------------------------------------------------
  let box = null;
  const tipBox = () => {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'pr-tip';
    box.setAttribute('role', 'tooltip');
    box.hidden = true;
    document.body.appendChild(box);
    return box;
  };
  const showTip = (el, ev) => {
    const text = el.getAttribute('data-prtip');
    if (!text) return;
    const b = tipBox();
    b.textContent = text;
    b.hidden = false;
    const r = el.getBoundingClientRect(),
      x = ev && ev.clientX != null && ev.type !== 'focusin' ? ev.clientX : r.left + r.width / 2,
      y = ev && ev.clientY != null && ev.type !== 'focusin' ? ev.clientY : r.top;
    const w = b.offsetWidth,
      h = b.offsetHeight;
    b.style.left = Math.max(6, Math.min(innerWidth - w - 6, x + 12)) + 'px';
    b.style.top = Math.max(6, y - h - 12 < 6 ? y + 18 : y - h - 12) + 'px';
  };
  const hideTip = () => {
    if (box) box.hidden = true;
  };
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest?.('[data-prtip]');
    if (el) showTip(el, e);
    else hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-prtip]');
    if (el) showTip(el, e);
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('scroll', hideTip, true);

  // ---- the lollipop ---------------------------------------------------------------------------------------------------------
  const headR = (o) => (o == null ? 3 : Math.min(11, 2.8 + 2.4 * Math.log2(1 + Math.max(0, o))));
  const niceStep = (len) => [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => len / s <= 11) || 1000;
  // opts: {acc, id (source), seq, counts: Map position -> count, known: Set of positions, shown: (pos) -> shown number,
  //        site: (pos) -> a residue's name, unit: [one, many]}
  function lollipop(o) {
    const L = (o.seq || '').length;
    if (!L) return '';
    const s = SRC[o.id];
    const Wd = 720,
      pl = 30,
      pr = 14,
      y0 = 100,
      stick = 62,
      H = 124;
    const X = (p) => pl + ((p - 0.5) / L) * (Wd - pl - pr);
    const items = [...o.counts.entries()]
      .filter(([, n]) => n > 0)
      .map(([pos, n]) => ({ pos, n, v: at(o.acc, o.id, pos) }));
    if (!items.length) return '';
    const top = Math.max(...items.map((i) => i.n));
    const hy = (n) => Math.max(5, (n / top) * stick);
    const off = (o.shown?.(1) ?? 1) - 1,
      step = niceStep(L);
    let axis = `<line class="pr-axis" x1="${pl}" x2="${Wd - pr}" y1="${y0}" y2="${y0}"/>`;
    for (let t = Math.ceil((1 + off) / step) * step; t - off <= L; t += step) {
      const x = X(t - off);
      axis += `<line class="pr-axis" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${y0 + 4}"/><text class="pr-t" x="${x.toFixed(1)}" y="${y0 + 16}" text-anchor="middle">${t}</text>`;
    }
    axis += `<text class="pr-t" x="${pl - 6}" y="${y0 + 3}" text-anchor="end">0</text><text class="pr-t" x="${pl - 6}" y="${(y0 - hy(top) + 3).toFixed(1)}" text-anchor="end">${int(top)}</text>`;
    const pts = items
      .map((i) => ({ ...i, r: headR(i.v?.o) }))
      .sort((a, b) => b.r - a.r || a.pos - b.pos)
      .map((i) => {
        const x = X(i.pos),
          y = y0 - hy(i.n),
          site = o.site(i.pos),
          ring = sig({ id: o.id, q: i.v?.q }),
          fewer = i.v?.ql != null && i.v.ql < RING;
        const text = tip(o.acc, o.id, i.pos, site, i.n);
        const known = o.known?.has(i.pos);
        return (
          `<g class="pr-pt" tabindex="0" role="img" aria-label="${esc(text.replace(/\n/g, '; '))}" data-prtip="${esc(text)}">` +
          `<line class="pr-stick" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${y.toFixed(1)}"/>` +
          (ring
            ? `<circle class="pr-ring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(i.r + 3.4).toFixed(1)}"/>`
            : '') +
          (fewer
            ? `<circle class="pr-ring dash" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(i.r + 3.4).toFixed(1)}"/>`
            : '') +
          `<circle class="pr-head ${known ? 'known' : 'other'}${i.v?.o == null ? ' none' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i.r.toFixed(1)}"/></g>`
        );
      })
      .join('');
    const u = o.unit || s.unit || ['sample', 'samples'];
    const key = (r, label) =>
      `<span class="pr-k"><svg width="${2 * r + 4}" height="${2 * r + 4}" aria-hidden="true"><circle class="pr-head known" cx="${r + 2}" cy="${r + 2}" r="${r}"/></svg>${label}</span>`;
    const legend =
      `<p class="pr-key small muted"><span class="pr-k"><svg width="10" height="22" aria-hidden="true"><line class="pr-stick" x1="5" x2="5" y1="20" y2="2"/></svg>stick height: ${esc(u[1])} with the change</span>` +
      key(headR(1), 'circle size: seen/expected 1') +
      key(headR(10), 'seen/expected 10') +
      (desc(o.id)
        ? `<span class="pr-k">ClinVar is descriptive: no ring, no q</span>`
        : `<span class="pr-k"><svg width="30" height="30" aria-hidden="true"><circle class="pr-ring" cx="15" cy="15" r="12"/><circle class="pr-head known" cx="15" cy="15" r="7"/></svg>ring: q &lt; ${RING}, more than expected</span>`) +
      (s.lower_tail && !desc(o.id)
        ? `<span class="pr-k"><svg width="30" height="30" aria-hidden="true"><circle class="pr-ring dash" cx="15" cy="15" r="12"/><circle class="pr-head known" cx="15" cy="15" r="7"/></svg>dashed ring: q &lt; ${RING}, fewer than expected</span>`
        : '') +
      `<span class="pr-k"><svg width="14" height="14" aria-hidden="true"><circle class="pr-head known" cx="7" cy="7" r="5"/></svg>known ${esc(K.W.mark)}</span>` +
      `<span class="pr-k"><svg width="14" height="14" aria-hidden="true"><circle class="pr-head other" cx="7" cy="7" r="5"/></svg>other residue</span></p>`;
    return (
      `<figure class="pr-lol"><svg viewBox="0 0 ${Wd} ${H}" role="group" aria-label="${esc(s.label)}: stick height is the count, ` +
      `circle size is seen/expected${desc(o.id) ? ', count only' : ', a ring means q below ' + RING}">${axis}${pts}</svg>${legend}</figure>`
    );
  }

  // k and O/E in words, for a row of sites: "3 changes (k) · O/E 22". One change says little (O/E is the count over a small
  // expectation), so a single change reads "1 change" with its O/E muted; none reads "none seen". Plain HTML, escaped.
  const KTIP =
    'k: the count of changes seen at this residue (samples with a change, or variants). seen/expected: that count over the count its codon predicts';
  function kOE(id, v) {
    if (!v || v.k == null) return '–';
    if (v.k === 0) return `<span title="${esc(KTIP)}">none seen</span>`;
    const o =
      v.o == null
        ? ''
        : ` · <span${v.k <= 1 ? ' class="muted"' : ''} title="${esc(v.k <= 1 ? 'One change only, so seen/expected tells little' : KTIP)}">seen/expected ${fo(v.o)}</span>`;
    const noun = SRC[id]?.kind === 'germline' ? 'variant' : 'change';
    return `<span title="${esc(KTIP)}">${int(v.k)} ${noun}${v.k === 1 ? '' : 's'} (k)</span>${o}`;
  }

  // ---- the site card's line ---------------------------------------------------------------------------------------------------
  function lineHtml(acc, pos) {
    return PR.sources
      .map((s) => {
        const v = at(acc, s.id, pos);
        if (!v || v.o == null)
          return `<span class="pr-s"><b>${esc(s.label)}</b> <span class="muted" title="No data for this source">–</span></span>`;
        const q = desc(s.id)
          ? 'descriptive'
          : v.q == null
            ? 'not tested'
            : `${v.p != null ? `p ${fq(v.p)}, ` : ''}q ${fq(v.q)}`;
        // gnomAD, fewer than expected: the lower tail too
        const low =
          v.pl != null && v.o < 1 ? `; fewer than expected: p ${fq(v.pl)}${v.ql != null ? `, q ${fq(v.ql)}` : ''}` : '';
        const text = tip(acc, s.id, pos, '', v.k).replace(/^ · /, '');
        return (
          `<span class="pr-s" title="${esc(text)}"><b>${esc(s.label)}</b> ${kOE(s.id, v)}` +
          `<span class="muted"> (${esc(q)}${low}${v.u && !desc(s.id) ? ', no matching coding sequence' : ''})</span>` +
          (v.hot ? `<span class="muted pr-hot"> · ${esc(hotNote(acc, v.hot, s.id))}</span>` : '') +
          `</span>`
        );
      })
      .join(' · ');
  }
  function siteLine(c) {
    const acc = c.acc,
      pos = c.pos,
      id = `${acc}:${pos}`;
    if (peek(acc) !== undefined)
      return peek(acc) === null
        ? '<span class="muted">not available</span>'
        : `<span data-pr-site="${esc(id)}">${lineHtml(acc, pos)}</span>`;
    load(acc).then(() => {
      document.querySelectorAll(`[data-pr-site="${CSS.escape(id)}"]`).forEach((el) => {
        el.innerHTML = peek(acc) ? lineHtml(acc, pos) : '<span class="muted">not available</span>';
      });
    });
    return `<span data-pr-site="${esc(id)}" class="muted">Loading…</span>`;
  }
  subs.push(() => {
    document.querySelectorAll('[data-pr-site]').forEach((el) => {
      const [acc, pos] = el.dataset.prSite.split(':');
      if (peek(acc)) el.innerHTML = lineHtml(acc, +pos);
    });
  });

  // Holm's step-down adjustment of a list of p values (any order): the smallest p times the number of tests, the next times one
  // fewer, ..., each at least the one before, none above 1
  const holm = (ps) => {
    const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]),
      out = new Array(ps.length);
    let run = 0;
    order.forEach(([p, i], j) => {
      run = Math.max(run, Math.min(1, (ps.length - j) * p));
      out[i] = run;
    });
    return out;
  };

  // The waterfall's height of a site (propensity.py signed_score is the twin): -log10 of the upper-tail p for more than expected
  // (O/E above 1), log10 of the lower-tail p (negative) for fewer (O/E below 1), 0 at O/E 1; null when the side's p is missing.
  const SCORE_CAP = 300;
  const signed = (o, pu, pl) => {
    if (o == null) return null;
    if (o === 1) return 0;
    const p = o > 1 ? pu : pl;
    if (p == null) return null;
    const s = p > 0 ? Math.log10(p) : -SCORE_CAP;
    return o > 1 ? Math.min(SCORE_CAP, -s) : Math.max(-SCORE_CAP, s);
  };

  // Labels that never overlap. items: [{key, x, y, w, h}] in priority order (the anchor point x, y; the text box w by h);
  // box: {x0, y0, x1, y1} the room; fixed: boxes already taken ({x, y, w, h}); lines: segments [x1, y1, x2, y2] no label may cross. Each label goes to the nearest free place around
  // its point (24 directions, growing distance) that overlaps no placed label or fixed box, covers no other label's point
  // and gives a leader line that crosses no other label (and, if it can, no other leader); a label farther than 10 px from its point has a leader.
  // Returns {placed: [{key, x, y, w, h, leader: [x1, y1, x2, y2] | null}], dropped: [keys]}. Deterministic: same input, same layout.
  function layoutLabels(items, box, fixed = [], lines = []) {
    const PAD = 2,
      ANG = [
        -30, 0, 30, -15, 15, -45, 45, -60, 60, -75, 75, -90, 90, -105, 105, -120, 120, -135, 135, -150, 150, -165, 165,
        180,
      ],
      RAD = [5, 12, 20, 30, 42, 56, 72, 90, 110, 132, 156, 182];
    const hit = (a, b) =>
      a.x < b.x + b.w + PAD && b.x < a.x + a.w + PAD && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;
    const cross = (p, q, r, s) => {
      const d = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
      return d(p, r, s) * d(q, r, s) < 0 && d(p, q, r) * d(p, q, s) < 0;
    };
    const segBox = (a, b, r) => {
      const [x1, y1, x2, y2] = [r.x, r.y, r.x + r.w, r.y + r.h];
      const inside = (p) => p[0] > x1 && p[0] < x2 && p[1] > y1 && p[1] < y2;
      return (
        inside(a) ||
        inside(b) ||
        cross(a, b, [x1, y1], [x2, y1]) ||
        cross(a, b, [x2, y1], [x2, y2]) ||
        cross(a, b, [x2, y2], [x1, y2]) ||
        cross(a, b, [x1, y2], [x1, y1])
      );
    };
    const placed = [],
      dropped = [],
      taken = fixed.slice();
    for (const it of items) {
      // places to try: round the point (nearest first), a column of stacked labels beside it, then farther out
      const spots = [];
      const ring = (r) =>
        ANG.forEach((deg) => {
          const a = (deg * Math.PI) / 180,
            c = Math.cos(a),
            sn = Math.sin(a);
          spots.push([
            it.x + r * c + (c > 0.3 ? 0 : c < -0.3 ? -it.w : -it.w / 2),
            it.y + r * sn - it.h / 2 + (Math.abs(c) <= 0.3 ? (sn < 0 ? -it.h / 2 : it.h / 2) : 0),
          ]);
        });
      const column = (col, dx) => {
        for (let k = 0; k < 40; k++)
          for (const side of [1, -1]) {
            const dy = Math.ceil(k / 2) * (it.h + PAD + 1) * (k % 2 ? 1 : -1);
            spots.push([
              side > 0 ? it.x + dx + col * (it.w + 8) : it.x - dx - col * (it.w + 8) - it.w,
              it.y - it.h / 2 + dy,
            ]);
          }
      };
      RAD.slice(0, 3).forEach(ring);
      column(0, 8);
      RAD.slice(3).forEach(ring);
      for (let col = 1; col < 4; col++) column(col, 24);
      let got = null;
      // first try with no crossing at all; then let a leader cross another leader (never a label)
      for (const tier of [0, 1]) {
        for (const [x, y] of spots) {
          const b = { x, y, w: it.w, h: it.h };
          if (b.x < box.x0 || b.y < box.y0 || b.x + b.w > box.x1 || b.y + b.h > box.y1) continue;
          if (taken.some((t) => hit(b, t))) continue;
          if (
            items.some((o) => o !== it && o.x > b.x - 3 && o.x < b.x + b.w + 3 && o.y > b.y - 3 && o.y < b.y + b.h + 3)
          )
            continue;
          if (it.x > b.x - 3 && it.x < b.x + b.w + 3 && it.y > b.y - 3 && it.y < b.y + b.h + 3) continue;
          // lines are tested against the box with a margin, since the drawn text can run a little past its estimate
          const bm = { x: b.x - PAD, y: b.y - PAD, w: b.w + 2 * PAD, h: b.h + 2 * PAD };
          if (lines.some((l) => segBox([l[0], l[1]], [l[2], l[3]], bm))) continue;
          const ex = Math.max(b.x, Math.min(it.x, b.x + b.w)),
            ey = Math.max(b.y, Math.min(it.y, b.y + b.h));
          let leader = null;
          if (Math.hypot(ex - it.x, ey - it.y) > 10) {
            leader = [it.x, it.y, ex, ey];
            const A = [it.x, it.y],
              B = [ex, ey];
            if (taken.some((t) => segBox(A, B, t))) continue;
            if (
              !tier &&
              placed.some((p) => p.leader && cross(A, B, [p.leader[0], p.leader[1]], [p.leader[2], p.leader[3]]))
            )
              continue;
          }
          // a placed leader must not run through this box
          if (placed.some((p) => p.leader && segBox([p.leader[0], p.leader[1]], [p.leader[2], p.leader[3]], bm)))
            continue;
          got = { key: it.key, ...b, leader };
          break;
        }
        if (got) break;
      }
      if (got) {
        placed.push(got);
        taken.push(got);
      } else dropped.push(it.key);
    }
    return { placed, dropped };
  }

  K.prop = {
    signed,
    layoutLabels,
    holm,
    cfg: PR,
    sources: PR.sources,
    state,
    load,
    peek,
    at,
    rowsOf,
    hashOf,
    lollipop,
    siteLine,
    hyperSwitch,
    setHyper,
    onHyper: (f) => subs.push(f),
    fo,
    fe,
    fq,
    words,
    kOE,
    tip,
    desc,
    hotPick,
    hotName,
    hotNote,
    hotNoun,
    hotTip,
    defaultLabels,
    geneWords,
    geneHits,
    ring: RING,
  };

  const st = document.createElement('style');
  st.id = 'kit-propensity-css';
  st.textContent = [
    '.pr-lol{margin:.6rem 0;max-width:760px}.pr-lol>svg{width:100%;height:auto;display:block}.pr-key svg{flex:none;width:auto;height:auto}',
    '.pr-axis{stroke:var(--line-strong);stroke-width:1}.pr-t{fill:var(--muted);font-size:11px}',
    '.pr-stick{stroke:var(--muted);stroke-width:1.1}',
    '.pr-head{stroke-width:1.2;fill-opacity:.9}.pr-head.known{fill:var(--accent);stroke:var(--surface)}',
    '.pr-head.other{fill:var(--surface);stroke:var(--muted)}.pr-head.none{stroke-dasharray:2 2}',
    '.pr-ring{fill:none;stroke:var(--ink);stroke-width:1.5}.pr-ring.dash{stroke-dasharray:3 2}',
    '.pr-pt{cursor:default;outline:none}.pr-pt:hover .pr-stick,.pr-pt:focus .pr-stick{stroke:var(--ink)}',
    '.pr-pt:focus .pr-head{stroke:var(--ink);stroke-width:2}',
    '.pr-key{display:flex;flex-wrap:wrap;gap:.3rem 1rem;align-items:center;margin:.2rem 0}.pr-k{display:inline-flex;align-items:center;gap:.3rem}',
    '.pr-tip{position:fixed;z-index:60;max-width:22rem;padding:.4rem .6rem;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--ink);font-size:.82rem;line-height:1.35;white-space:pre-line;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.18)}',
    '.pr-s{white-space:nowrap}.pr-hot{white-space:normal}.pr-sw{margin:.4rem 0}',
    '@media (max-width:40rem){.pr-s{white-space:normal}.seg[aria-label="Hypermutated samples"]{display:flex;flex-wrap:wrap;max-width:100%;border-radius:.9rem}}',
  ].join('');
  document.head.appendChild(st);
});
