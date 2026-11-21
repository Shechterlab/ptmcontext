/* Mutation propensity (website.propensity): for every candidate residue, the changes seen in a source (TCGA tumors, DepMap
   cell lines, ClinVar, gnomAD) against the changes its codon predicts. Reads data/m (a few proteins to a file, like data/g;
   ptmcontext/web/propensity.py writes it) and gives the rest of the kit:
     K.prop.load(acc)            a protein's rows, by source, once the file is in (a promise; null when it cannot be read)
     K.prop.at(acc, src, pos)    {k, e, o, q, u, ...} at a residue in the chosen cohort, from what load() has read
     K.prop.lollipop(opts)       a protein's residues as lollipops: stick = count, circle size = O/E, ring = q < 0.05
     K.prop.siteLine(c)          the site card's one line: O/E and q of the site in each source
     K.prop.hyperSwitch()        the switch between "without hypermutated" (the default) and "with" samples
   The numbers are the release's own (the data dictionary defines them): expected = n x the residue's share of the protein's
   mutability over its residues of the same type; q = Benjamini-Hochberg over every residue tested of the source and residue
   type, from a binomial test of k against that share. ClinVar's O/E is descriptive: no ring, no q. A residue of a protein with
   no coding sequence that matches UniProt's has no weights: its O/E is against every residue of the type equally likely,
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
          ` title="Hypermutated: more than ${PR.hypermutated.per_mb} coding calls per Mb (Campbell et al., Cell 171:1042 (2017))">${t}</button>`
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
          out[id] = { rows, by: new Map(rows.map((r) => [r.pos, r])) };
        }
        return (DATA[acc] = out);
      },
      () => (DATA[acc] = null)
    ));
  }
  const peek = (acc) => DATA[acc];

  // ---- one residue's numbers in the chosen cohort ---------------------------------------------------------------------------
  const somatic = (id) => SRC[id]?.kind === 'somatic';
  function at(acc, id, pos, hyper = state.hyper) {
    const r = DATA[acc]?.[id]?.by.get(pos);
    if (!r) return null;
    const nh = somatic(id) && !hyper && r.k2 !== undefined;
    return nh
      ? { k: r.k2, e: r.e2, o: r.o2, q: r.q2, p: r.pu2, u: r.u2, kAll: r.k, nh: true }
      : { k: r.k, e: r.e, o: r.o, q: r.q, p: r.pu, pl: r.pl, u: r.u, ql: r.ql, kAll: r.k, nh: false };
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
        ? '< 1e-300'
        : q < 0.001
          ? q.toExponential(1).replace('e-', 'e−')
          : q < 0.1
            ? q.toFixed(3)
            : q.toFixed(2);
  const sig = (v) => v != null && !desc(v.id) && v.q != null && v.q < RING;
  // the words for one source at one residue, for a tooltip (lines) or the site card (one line)
  function words(id, v, unit) {
    const s = SRC[id];
    if (!v || v.o == null)
      return { head: 'no O/E', note: `${s.label}: this protein has no change at its residues of this type` };
    const parts = [`O/E ${fo(v.o)}`, `expected ${fe(v.e)}`];
    let status = '';
    if (desc(id)) status = 'descriptive: ClinVar reflects clinical testing more than mutation, so there is no test';
    else if (v.q == null)
      status = 'no test: no coding sequence matches UniProt, so O/E treats every residue of the type as equally likely';
    else {
      if (v.p != null) parts.push(`p ${fq(v.p)}`);
      parts.push(`q ${fq(v.q)}`);
    }
    return { head: parts.join(' · '), note: status, unit };
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
      key(headR(1), 'circle size: O/E 1') +
      key(headR(10), 'O/E 10') +
      (desc(o.id)
        ? `<span class="pr-k">ClinVar is descriptive: no ring, no q</span>`
        : `<span class="pr-k"><svg width="30" height="30" aria-hidden="true"><circle class="pr-ring" cx="15" cy="15" r="12"/><circle class="pr-head known" cx="15" cy="15" r="7"/></svg>ring: q &lt; ${RING}</span>`) +
      (s.lower_tail && !desc(o.id)
        ? `<span class="pr-k"><svg width="30" height="30" aria-hidden="true"><circle class="pr-ring dash" cx="15" cy="15" r="12"/><circle class="pr-head known" cx="15" cy="15" r="7"/></svg>dashed ring: q &lt; ${RING}, fewer than expected</span>`
        : '') +
      `<span class="pr-k"><svg width="14" height="14" aria-hidden="true"><circle class="pr-head known" cx="7" cy="7" r="5"/></svg>known ${esc(K.W.mark)}</span>` +
      `<span class="pr-k"><svg width="14" height="14" aria-hidden="true"><circle class="pr-head other" cx="7" cy="7" r="5"/></svg>other residue</span></p>`;
    return (
      `<figure class="pr-lol"><svg viewBox="0 0 ${Wd} ${H}" role="group" aria-label="${esc(s.label)}: stick height is the count, ` +
      `circle size is O/E${desc(o.id) ? ', descriptive' : ', a ring means q below ' + RING}">${axis}${pts}</svg>${legend}</figure>`
    );
  }

  // ---- the site card's line ---------------------------------------------------------------------------------------------------
  function lineHtml(acc, pos) {
    return PR.sources
      .map((s) => {
        const v = at(acc, s.id, pos);
        if (!v || v.o == null) return `<span class="pr-s"><b>${esc(s.label)}</b> <span class="muted">–</span></span>`;
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
          `<span class="pr-s" title="${esc(text)}"><b>${esc(s.label)}</b> O/E ${fo(v.o)}` +
          `<span class="muted"> (${esc(q)}${low}${v.u && !desc(s.id) ? ', no matching coding sequence' : ''})</span></span>`
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

  K.prop = {
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
    tip,
    desc,
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
    '.pr-s{white-space:nowrap}.pr-sw{margin:.4rem 0}',
  ].join('');
  document.head.appendChild(st);
});
