/* A protein-set question drawn with its proteins' numbers (website.set_views): a set's share of the marked proteins
   against the whole background on the tile (share meters), and on the question's page, after the sets: each group's
   numbers as box plots, the comparison with the other proteins (the set's share by Fisher's test, the numbers by the
   Mann–Whitney test), the proteins with the most extreme numbers, and a residue question shown with it. The numbers
   are the question's values (a column per number, protein_sets.json -> selection.json: each marked protein's, and the
   other background proteins' sorted); a selection is drawn and compared the same way, in the browser. Words come
   from the site file. A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, esc, int, cap } = K;
  const VIEWS = (D.set_views || []).filter((v) => A[v.analysis] && A[v.analysis].kind === 'protein_sets');
  if (!VIEWS.length) return;
  const ST = window.PTMC_STATS,
    PADJ = K.PADJ;
  const pcT = (k, n) => (n ? ((100 * k) / n).toFixed(k / n < 0.1 ? 1 : 0) : '–');
  const num = (v) =>
    (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/^-/, '−');
  const fp = (p) => (p == null ? '–' : p === 0 ? '< 1e-300' : p < 1e-3 ? p.toExponential(1) : p.toFixed(3));
  const gene = (p) => D.proteins[p][1] || D.proteins[p][0];
  const scopedNow = () => K.selOn() && !K.vsOn() && !!K.sel.data() && K.sel.testable();
  const who = (scoped) => (scoped ? 'proteins of your selection' : `${W.marked} proteins`);

  // ---- the groups: the selection's (or the marked) proteins in the background, the other marked ones, the others -------
  function groups(v) {
    const SD = K.sel.data(),
      ps = SD?.protein_sets?.[v.analysis];
    if (!ps || !ps.values) return null;
    const scoped = scopedNow(),
      bg = ps.in_background,
      on = scoped ? K.sel.compute().proteins : null;
    const sel = scoped ? bg.filter((p) => on.has(p)) : bg.slice(),
      rest = scoped ? bg.filter((p) => !on.has(p)) : [];
    const members = Object.fromEntries(ps.sets.map(([s, M, m]) => [s, { M, m: new Set(m) }]));
    const col = (name) => ps.values.columns.findIndex((c) => c.name === name);
    const val = (p, name) => {
      const r = ps.values.marked[p],
        i = col(name);
      return r && i >= 0 ? r[i] : null;
    };
    return { ps, scoped, sel, rest, members, col, val, N: ps.N };
  }
  // the share of a set, for a group of marked proteins, the other marked ones and all of the background
  function shares(v, G) {
    const set = G.members[v.meter];
    if (!set) return null;
    const k = G.sel.filter((p) => set.m.has(p)).length,
      kr = G.rest.filter((p) => set.m.has(p)).length;
    return { k, n: G.sel.length, kr, nr: G.rest.length, M: set.M, N: G.N };
  }
  // the site's own share of the set, from its rows (before the selection data load)
  function siteShares(v) {
    const r = D.rows.find((x) => x.analysis === v.analysis && x.method === 'enricher' && x.category === v.meter);
    return r ? { k: r.a, n: r.a + r.b, M: r.a + r.c, N: r.a + r.b + r.c + r.d } : null;
  }
  const meterRow = (label, k, n, max, cls, tip) =>
    `<div class="vm-row" data-vm-tip="${esc(tip)}"><span class="lab">${esc(label)}</span><span ` +
    `class="vm-bar"><i class="${cls}" style="width:${((100 * (n ? k / n : 0)) / max).toFixed(1)}%"></i></span>` +
    `<span class="val">${pcT(k, n)}%</span></div>`;
  function tile(v, card) {
    if (K.vsOn()) return null; // against other marks: the kit's own comparison of shares
    const a = A[v.analysis],
      G = K.selOn() ? groups(v) : null,
      scoped = !!G && G.scoped,
      s = scoped ? shares(v, G) : siteShares(v);
    if (!s) return null;
    const pop = v.population || 'proteins of the background',
      setName = (a.labels || {})[v.meter] || v.meter;
    const rows = [
      [scoped ? 'Your selection' : cap(who(false)), s.k, s.n, scoped ? 'sel' : 'meth'],
      ...(scoped ? [[`All ${W.marked} proteins`, s.k + s.kr, s.n + s.nr, 'meth']] : []),
      [`All ${pop}`, s.M, s.N, 'all'],
    ];
    const max = Math.max(0.01, ...rows.map(([, k, n]) => (n ? k / n : 0)));
    const tipOf = ([label, k, n]) =>
      `<b>${esc(label)}</b><br>${pcT(k, n)}% of ${int(n)} ${esc(pop)} ${esc(v.meter_words || 'in ' + setName)} (${int(k)})`;
    const loading =
      K.selOn() && !K.sel.data()
        ? '<p class="muted small">Loading the selection…</p>'
        : K.selOn() && !scoped
          ? '<p class="twhole"><span>Whole dataset</span> the selection is too small to test</p>'
          : '';
    return (
      `<article class="tile" id="tile-${esc(a.id)}" data-tile="${esc(a.id)}" tabindex="0"><header><h3>${esc(card.title || a.title)}</h3>${K.detailsLink(a.id)}</header>` +
      `<div class="vm">${rows.map((r) => meterRow(r[0], r[1], r[2], max, r[3], tipOf(r))).join('')}</div>` +
      `<p class="tfoot"><b>${pcT(s.k, s.n)}%</b> of ${scoped ? 'your' : esc(W.marked)} proteins ${esc(v.meter_words || 'in ' + setName)} vs ${pcT(s.M, s.N)}% of all ${esc(pop)}</p>${loading}</article>`
    );
  }

  // ---- numbers: quantiles, the Mann–Whitney test, a 2x2 table's odds ratio and interval --------------------------------
  const quant = (vals) => {
    if (!vals.length) return null;
    const x = vals.slice().sort((a, b) => a - b),
      q = (f) => {
        const h = (x.length - 1) * f,
          lo = Math.floor(h);
        return x[lo] + (x[Math.min(lo + 1, x.length - 1)] - x[lo]) * (h - lo);
      };
    return [q(0.05), q(0.25), q(0.5), q(0.75), q(0.95), x.length];
  };
  function erfc(x) {
    // as kit-stats.js, for the normal approximation
    const z = Math.abs(x),
      t = 1 / (1 + 0.5 * z);
    const r =
      t *
      Math.exp(
        -z * z -
          1.26551223 +
          t *
            (1.00002368 +
              t *
                (0.37409196 +
                  t *
                    (0.09678418 +
                      t *
                        (-0.18628806 +
                          t *
                            (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
      );
    return x >= 0 ? r : 2 - r;
  }
  // two-sided Mann–Whitney test, normal approximation with the tie correction: [p, median of x, median of y]
  function mwu(x, y) {
    const n1 = x.length,
      n2 = y.length;
    if (!n1 || !n2) return [null, null, null];
    const all = x
      .map((v) => [v, 0])
      .concat(y.map((v) => [v, 1]))
      .sort((a, b) => a[0] - b[0]);
    let r1 = 0,
      ties = 0;
    for (let i = 0; i < all.length; ) {
      let j = i;
      while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++;
      const rank = (i + j) / 2 + 1,
        t = j - i + 1;
      for (let k = i; k <= j; k++) if (all[k][1] === 0) r1 += rank;
      ties += t * t * t - t;
      i = j + 1;
    }
    const n = n1 + n2,
      u = r1 - (n1 * (n1 + 1)) / 2,
      mu = (n1 * n2) / 2,
      sd = Math.sqrt(((n1 * n2) / 12) * (n + 1 - ties / (n * (n - 1))));
    const z = sd ? (Math.abs(u - mu) - 0.5) / sd : 0;
    const med = (w) => {
      const s = w.slice().sort((a, b) => a - b),
        m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    return [Math.min(1, erfc(Math.max(0, z) / Math.SQRT2)), med(x), med(y)];
  }
  const woolf = (a, b, c, d) => {
    if (!(a && b && c && d)) return { or: null, lo: null, hi: null };
    const or = (a * d) / (b * c),
      se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
    return { or, lo: Math.exp(Math.log(or) - 1.96 * se), hi: Math.exp(Math.log(or) + 1.96 * se) };
  };

  // ---- box plots of one number, group by group --------------------------------------------------------------------------
  function boxData(v, G) {
    const col = v.box.value,
      others = G.ps.values.others[col] || [];
    const vals = (ps) => ps.map((p) => G.val(p, col)).filter((x) => x != null);
    const sel = vals(G.sel),
      rest = vals(G.rest),
      all = [...sel, ...rest, ...others];
    return [
      [G.scoped ? 'Your selection' : cap(who(false)), quant(sel), G.scoped ? 'sel' : 'meth'],
      ...(G.scoped ? [[`All ${W.marked} proteins`, quant([...sel, ...rest]), 'meth']] : []),
      [`All ${v.population || 'proteins of the background'}`, quant(all), 'all'],
    ].filter((r) => r[1]);
  }
  function boxSvg(v, G) {
    const rows = boxData(v, G),
      LW = 210,
      PW = 470,
      RH = 34,
      top = 8,
      Wd = LW + PW + 70;
    const lo = Math.min(...rows.map((r) => r[1][0])),
      hi = Math.max(...rows.map((r) => r[1][4])),
      pad = (hi - lo) * 0.06 || 0.1,
      a = lo - pad,
      b = hi + pad;
    const X = (x) => LW + ((x - a) / (b - a)) * PW;
    const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].find((s) => (b - a) / s <= 8) || 10;
    let g = '';
    for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step)
      g +=
        `<line class="vb-grid${Math.abs(t) < 1e-9 ? ' zero' : ''}" x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${top}" y2="${top + rows.length * RH}"/><text ` +
        `class="vb-ax" x="${X(t).toFixed(1)}" y="${top + rows.length * RH + 14}" text-anchor="middle">${num(t)}</text>`;
    rows.forEach(([label, q, cls], i) => {
      const y = top + i * RH + RH / 2,
        [q05, q25, q50, q75, q95, n] = q;
      g +=
        `<g data-vm-tip="${esc(
          `<b>${esc(label)}</b> (${int(n)} proteins)<br>median ${num(q50)}; middle half ${num(q25)} to ${num(q75)}; 5th to ` +
            `95th percentile ${num(q05)} to ${num(q95)}`
        )}">` +
        (`<rect class="cg-hit" x="0" y="${y - RH / 2}" width="${Wd}" height="${RH}"/><text class="vb-lab" x="${LW - 10}" y="${y + 1}" text-anchor="end">${esc(label)}</text><text ` +
          `class="vb-n" x="${LW - 10}" y="${y + 15.5}" text-anchor="end">${int(n)}</text>`) +
        (`<line class="vb-wh" x1="${X(q05).toFixed(1)}" x2="${X(q95).toFixed(1)}" y1="${y}" y2="${y}"/><line ` +
          `class="vb-wh" x1="${X(q05).toFixed(1)}" x2="${X(q05).toFixed(1)}" y1="${y - 5}" y2="${y + 5}"/><line ` +
          `class="vb-wh" x1="${X(q95).toFixed(1)}" x2="${X(q95).toFixed(1)}" y1="${y - 5}" y2="${y + 5}"/>`) +
        (`<rect class="vb-box ${cls}" x="${X(q25).toFixed(1)}" y="${y - 9}" width="${Math.max(1, X(q75) - X(q25)).toFixed(1)}" height="18" ` +
          `rx="2"/><line class="vb-med" x1="${X(q50).toFixed(1)}" x2="${X(q50).toFixed(1)}" y1="${y - 9}" y2="${y + 9}"/>`) +
        `<text class="vb-val" x="${LW + PW + 8}" y="${y + 4}">${num(q50)}</text></g>`;
    });
    g += `<text class="vb-ax" x="${LW + PW / 2}" y="${top + rows.length * RH + 30}" text-anchor="middle">${esc(v.box.axis || v.box.value)}</text>`;
    return { g, W: Wd, H: top + rows.length * RH + 38 };
  }
  const svgOf = (f) =>
    `<svg class="vb-svg" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="Box plots of each ` +
    `group’s numbers">${f.g}</svg>`;
  // an export takes the light palette and inline styles (PDF and PNG renderers read no stylesheet)
  function inlined(f) {
    const holder = document.createElement('div');
    holder.style.cssText =
      `position:fixed;left:-100000px;top:0;width:${f.W}px;--ink:#111827;--ink-2:#374151;` +
      `--muted:#5f6f78;--line:#e0e8eb;--line-strong:#c7d4d9;--surface:#ffffff;--more:#b42318;--less:#334155;` +
      `--accent:${K.accent()}`;
    holder.innerHTML = svgOf(f);
    document.body.appendChild(holder);
    try {
      holder.querySelectorAll('svg *').forEach((n) => {
        const cs = getComputedStyle(n);
        ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight'].forEach(
          (p) => {
            const x = cs.getPropertyValue(p);
            if (x && !(p === 'stroke-dasharray' && x === 'none')) n.setAttribute(p, x);
          }
        );
        ['class', 'data-vm-tip'].forEach((x) => n.removeAttribute(x));
      });
      return holder.firstElementChild.innerHTML;
    } finally {
      holder.remove();
    }
  }
  function boxTsv(v, G) {
    return (
      K.preamble(
        v.box.title || v.box.value,
        `${v.box.sub || v.box.value}; each group's 5th, 25th, 50th, 75th ` + `and 95th percentiles`
      ) +
      'group\tproteins\tq05\tq25\tmedian\tq75\tq95\n' +
      boxData(v, G)
        .map(([label, q]) => [label, q[5], ...q.slice(0, 5).map((x) => +x.toFixed(4))].join('\t'))
        .join('\n') +
      '\n'
    );
  }

  // ---- the comparison table, the lists of proteins, the residue question ------------------------------------------------
  function compare(v, G, against) {
    const set = G.members[v.meter],
      col = v.box?.value;
    const inSet = (ps) => (set ? ps.filter((p) => set.m.has(p)).length : 0);
    const a = inSet(G.sel),
      n1 = G.sel.length;
    let c, n2, y;
    const vals = (ps) => ps.map((p) => G.val(p, col)).filter((x) => x != null);
    if (against === 'marked') {
      c = inSet(G.rest);
      n2 = G.rest.length;
      y = vals(G.rest);
    } else {
      c = (set ? set.M : 0) - a;
      n2 = G.N - n1;
      y = [...vals(G.rest), ...(G.ps.values.others[col] || [])];
    }
    const f = ST.fisher(a, n1 - a, c, n2 - c),
      ci = woolf(a, n1 - a, c, n2 - c),
      [mp, ma, mb] = col ? mwu(vals(G.sel), y) : [null, null, null];
    return { a, n1, c, n2, p: f.p, ci, mp, ma, mb };
  }
  const cmpRow = (label, x) =>
    `<tr><th scope="row">${esc(label)}</th><td class="num">${pcT(x.a, x.n1)}% <span class="muted">` +
    `against</span> ${pcT(x.c, x.n2)}%</td>` +
    (`<td class="num">${
      x.ci.or != null ? K.fx(x.ci.or) + ` <span class="muted">[${K.fx(x.ci.lo)}–${K.fx(x.ci.hi)}]</span>` : '–'
    }</td><td ` +
      `class="num">${fp(x.p)}</td>`) +
    `<td class="num">${num(x.ma)} <span class="muted">against</span> ${num(x.mb)}</td><td class="num">${fp(x.mp)}</td></tr>`;
  function chips(v, ch, G) {
    const named = (ch.sets || []).map((s) => G.members[s]).filter(Boolean);
    const ok = (p) => !named.length || named.some((s) => s.m.has(p));
    const score = (p) =>
      ch.share
        ? (() => {
            const x = G.val(p, ch.share[0]),
              y = G.val(p, ch.share[1]);
            return x != null && y ? x / y : null;
          })()
        : G.val(p, ch.value);
    const list = G.sel
      .filter(ok)
      .map((p) => [p, score(p)])
      .filter(([, s]) => s != null)
      .sort((x, y) => (ch.order === 'descending' ? y[1] - x[1] : x[1] - y[1]))
      .slice(0, ch.max || 12);
    if (!list.length) return '';
    const col = (c) => (G.ps.values.columns.find((x) => x.name === c) || {}).label || c;
    const tip = (p) =>
      `${gene(p)}: ${G.ps.values.columns.map((c) => `${c.label || c.name} ${num(G.val(p, c.name))}`).join(', ')}`;
    return (
      `<p class="flabel">${esc(ch.title)}${G.scoped ? ' in your selection' : ''}${
        ch.note ? ` <span class="muted">(${esc(ch.note)})</span>` : ''
      }</p><div ` +
      `class="vm-chips">` +
      list
        .map(
          ([p, s]) =>
            `<a class="gene-chip" href="${esc(K.link('protein', D.proteins[p][0]))}" title="${esc(tip(p))}">${esc(gene(p))}<span>${ch.share ? pcT(s, 1) + '%' : num(s)}</span></a>`
        )
        .join('') +
      '</div>' +
      `<span class="vh">${esc(ch.share ? `${col(ch.share[0])} over ${col(ch.share[1])}` : col(ch.value))}</span>`
    );
  }
  function residueLine(v) {
    const r = A[v.residue];
    if (!r) return '';
    const rows = K.rowsFor(r, 'mantel_haenszel');
    if (!rows.length) return '';
    const how = (x) =>
      x.q != null && x.q <= PADJ && x.hi != null && x.hi < 1
        ? 'less often than'
        : x.q != null && x.q <= PADJ && x.lo != null && x.lo > 1
          ? 'more often than'
          : 'about as often as';
    return (
      `<div class="vm-res"><p class="flabel">${esc(r.title)} <span class="muted">(whole dataset)</span></p><p ` +
      `class="small">` +
      rows
        .map(
          (x) =>
            `<b>${esc(x.label)}</b>: ${esc(W.marks)} ${how(x)} the other ${esc(W.residues)} of their ` +
            `proteins (Mantel–Haenszel OR ${K.fxn(x.eff)}${
              x.lo != null ? `, 95% CI ${K.fxn(x.lo)}–${K.fxn(x.hi)}` : ''
            }, q ${K.fq(x.q)}${x.strata != null ? `, ${int(x.strata)} proteins` : ''})`
        )
        .join('; ') +
      `. ${esc(r.sub || '')}. <a href="${esc(K.link('overview', r.id))}">Open the question ›</a></p></div>`
    );
  }
  const FIG = {};
  function page(v, card, body) {
    const G = groups(v),
      a = A[v.analysis];
    if (!G) return body() + '<p class="muted">Loading the proteins’ numbers…</p>';
    const scoped = G.scoped,
      total = scoped ? K.sel.nProteins() : D.counts.proteins;
    const intro = (v.intro || '')
      .replace('{n}', int(G.sel.length))
      .replace('{total}', int(total))
      .replace('{who}', who(scoped))
      .replace('{the}', 'the');
    let h = body();
    h += `<div class="vm-page">${intro ? `<p class="small">${esc(intro)}</p>` : ''}`;
    if (v.box) {
      FIG[a.id] = { make: () => boxSvg(v, G), tsv: () => boxTsv(v, G) };
      const f = boxSvg(v, G);
      h +=
        `<div class="vm-block"><div class="fig-head"><span class="flabel">${esc(v.box.title || v.box.value)}</span>${K.expBar(
          ['pdf', 'svg', 'png', 'tsv'],
          'vm-exp',
          v.box.title || v.box.value,
          a.id
        ).replace(/data-vm-exp="(\w+)"/g, `data-vm-exp="$1" ` + `data-vm-aid="${esc(a.id)}"`)}</div>` +
        `<div class="vm-scroll">${svgOf(f)}</div>${
          v.box.sub ? `<p class="note small muted">${esc(v.box.sub)}.</p>` : ''
        }</div>`;
    }
    if (G.members[v.meter]) {
      const setName = (a.labels || {})[v.meter] || v.meter,
        c1 = scoped ? compare(v, G, 'marked') : null,
        c2 = compare(v, G, 'all');
      h +=
        `<div class="tbl-wrap vm-tbl"><table class="tbl compact"><thead><tr><th>Compared with</th><th>${esc(setName)}</th><th ` +
        `title="Odds ratio with its 95% interval (Woolf)">Odds ratio</th><th title="Fisher’s exact test, ` +
        `two-sided">p</th>` +
        (`<th>${esc(
          cap((G.ps.values.columns.find((c) => c.name === v.box?.value) || {}).label || 'median')
        )}, median</th>` +
          `<th title="Mann–Whitney test, two-sided">p</th></tr></thead><tbody>`) +
        (c1 ? cmpRow(`The other ${W.marked} proteins (${int(c1.n2)})`, c1) : '') +
        cmpRow(`The other ${v.population || 'proteins'} (${int(c2.n2)})`, c2) +
        '</tbody></table></div>' +
        (`<p class="small muted">${esc(v.caveat || '')} The table gives unadjusted p: two-sided Fisher test for the ` +
          `share in ${esc(setName.toLowerCase())}, with the sample odds ratio and its Woolf 95% interval, and ` +
          `two-sided Mann–Whitney for the numbers. The chart above gives the test of the same classes.</p>`);
    }
    h +=
      (v.chips || []).map((ch) => chips(v, ch, G)).join('') +
      residueLine(v) +
      (v.credit ? `<p class="note small ` + `muted">${esc(v.credit)}</p>` : '') +
      '</div>';
    return h;
  }
  VIEWS.forEach((v) => {
    K.questions[v.analysis] = {
      tile: (card) => tile(v, card),
      page: (card, body) => (K.vsOn() ? null : page(v, card, body)),
    };
  });
  K.clicks.push([
    '[data-vm-exp]',
    (el) => {
      const v = VIEWS.find((x) => x.analysis === el.dataset.vmAid),
        F = FIG[el.dataset.vmAid];
      if (!v || !F) return;
      K.exportFigure(
        el.dataset.vmExp,
        () => {
          const f = F.make();
          return K.figureFrame({
            title: v.box.title || v.box.value,
            sub: v.box.sub || '',
            W: f.W + 40,
            body: `<g transform="translate(20,` + `0)">${inlined(f)}</g>`,
            bodyH: f.H,
            extra: { question: v.analysis },
          });
        },
        `${D.site.id}_${v.analysis}_${v.box.value}`,
        el,
        F.tsv
      );
    },
  ]);
  K.tips.push(['[data-vm-tip]', (el) => el.dataset.vmTip || '']);
  const st = document.createElement('style');
  st.id = 'kit-values-css';
  st.textContent = [
    '.vm{display:grid;gap:.35rem;margin:.2rem ' +
      '0}.vm-row{display:grid;grid-template-columns:minmax(0,1fr) 6rem ' +
      '3rem;gap:.5rem;align-items:center;font-size:.86rem}',
    '.vm-bar{height:.7rem;background:var(--surface-2);border-radius:999px;overflow:hidden}.vm-bar i{display:block;height:100%;border-radius:999px;background:var(--muted)}',
    '.vm-bar i.meth,.vm-bar i.sel{background:var(--more)}.vm-bar ' +
      'i.all{background:var(--line-strong)}.vm-row ' +
      '.val{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}',
    '.vm-page{margin-top:1rem}.vm-block{margin:.8rem 0;max-width:820px}.vm-block ' +
      '.fig-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem}',
    '.vm-page .flabel{font-weight:700;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:.9rem 0 .3rem}',
    '.vm-scroll{overflow-x:auto}.vb-svg{width:100%;min-width:520px;height:auto;display:block}',
    '.vb-grid{stroke:var(--line)}.vb-grid.zero{stroke:var(--ink-2)}.vb-ax{font-size:10.5px;fill:var(--muted)}.vb-lab{font-size:12px;fill:var(--ink);font-weight:600}.vb-n{font-size:10px;fill:var(--muted)}',
    '.vb-wh{stroke:var(--ink-2);stroke-width:1.2}.vb-box{stroke:var(--ink-2);stroke-width:1}.vb-box.meth,.vb-box.sel{fill:var(--more);fill-opacity:.35}.vb-box.all{fill:var(--line-strong);fill-opacity:.6}',
    '.vb-med{stroke:var(--ink);stroke-width:2.2}.vb-val{font-size:11.5px;font-weight:700;fill:var(--ink)}.vm-page .cg-hit{fill:transparent}',
    '.vm-tbl{overflow-x:auto;max-width:100%}.vm-chips{display:flex;flex-wrap:wrap;gap:.35rem}',
    '.gene-chip{display:inline-flex;gap:.35rem;align-items:baseline;padding:.15rem ' +
      '.55rem;border:1px solid ' +
      'var(--line-strong);border-radius:999px;font-size:.84rem;text-decoration:none;color:var(--ink);background:var(--surface)}',
    '.gene-chip span{color:var(--muted);font-variant-numeric:tabular-nums;font-size:.78rem}.gene-chip:hover{border-color:var(--accent);color:var(--accent)}',
  ].join('');
  document.head.appendChild(st);
});
