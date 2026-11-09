/* Count questions (website.counts): questions answered by counting the marks, not by a test. Each is a tile on the
   Overview, where the site file places it, and a page of its own, with Previous and Next among the other questions.

     values     how many marks each value of an attribute has (a study, a database, an antibody, ...), the marks with
                that value alone, and how many values each mark has (1, 2, ..., 5 or more)
     responses  a table of experiments: each counts the marks it measured, those whose call went down and up (as
                meters, with their shares) and the median change; a row selects its marks that went down

   The page data hold the whole dataset's counts (ptmc web, ptmcontext/web/counts.py), so tiles draw at once; with a
   selection, the same counts are made again in the browser from data/selection.json. Every number here describes:
   nothing is tested. A click on a value or a row sets its filter and opens the Sites page (the selection follows).
   The words (titles, units, notes, the calls' codes) are the site file's; a site without counts has none of this.
   A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  const C = D.count_questions || {};
  const IDS = Object.keys(C);
  if (!IDS.length) return;
  const SPECS = D.attribute_specs || {};

  // ---- numbers, as the explorer prints them -------------------------------------------------------------------------
  const pc = (k, n) => (!n ? '0' : k > 0 && Math.round((100 * k) / n) === 0 ? '<1' : String(Math.round((100 * k) / n)));
  const l2 = (v) =>
    v == null ? '–' : (v > 0 ? '+' : v < 0 && +v.toFixed(2) !== 0 ? '−' : '') + Math.abs(v).toFixed(2);
  const median = (v) => {
    if (!v.length) return null;
    const a = v.slice().sort((x, y) => x - y),
      h = a.length >> 1;
    return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
  };
  const compact = (n) =>
    n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1000 ? +(n / 1000).toFixed(1) + 'K' : String(n);
  const niceStep = (x) => {
    const p = 10 ** Math.floor(Math.log10(x || 1)),
      f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  };
  const marksOf = (n) => (n === 1 ? W.mark : W.marks);
  const fill = (t, extra = {}) =>
    String(t || '').replace(/\{(\w+)\}/g, (m0, k) => (k in extra ? extra[k] : (W[k] ?? m0)));

  // ---- the selection's counts (the whole dataset's are in the page) ------------------------------------------------
  const selOn = () => !!K.sel?.active();
  const SD = () => K.sel?.data();
  const memo = (key, make) => {
    const c = K.sel.compute();
    return (c.retests[key] ??= make(c));
  };
  // a values count over a list of marks: each value's marks and marks with it alone; how many values each mark has
  function valuesOver(id, idx) {
    const c = C[id],
      sd = SD(),
      ti = sd.attribute_names.indexOf(c.attribute),
      codes = sd.attributes[c.attribute];
    const ni = c.number ? sd.attribute_names.indexOf(c.number) : -1,
      nums = ni >= 0 ? sd.numbers?.[c.number] : null;
    const n = new Array(codes.length).fill(0),
      only = new Array(codes.length).fill(0),
      dist = new Array(c.bins).fill(0);
    let none = 0,
      multi = 0;
    for (const i of idx) {
      const m = sd.marks[i],
        vs = (m[3][ti] || []).filter((k) => codes[k] !== '');
      new Set(vs).forEach((k) => {
        n[k]++;
      });
      if (new Set(vs).size === 1) only[vs[0]]++;
      const k = nums ? nums[(m[3][ni] || [])[0]] || 0 : new Set(vs).size;
      if (k >= 1) dist[Math.min(k, c.bins) - 1]++;
      else none++;
      if (k >= 2) multi++;
    }
    const byVal = Object.fromEntries(codes.map((v, k) => [v, k]));
    return {
      total: idx.length,
      n: (v) => n[byVal[v]] || 0,
      only: (v) => only[byVal[v]] || 0,
      dist,
      none,
      multi,
      distinct: n.filter(Boolean).length,
    };
  }
  const selValues = (id) => (selOn() && SD() ? memo('count|' + id, (c) => valuesOver(id, c.marks || [])) : null);
  // a responses count's rows over the selection: each row's selected marks, those down and up, the median change
  function responsesOver(id, idx) {
    const keep = new Set(idx),
      rows = SD().count_questions?.[id] || [];
    return C[id].rows.map((r, k) => {
      const e = (rows[k] || []).filter((x) => keep.has(x[0]));
      return {
        ...r,
        n: e.length,
        down: e.filter((x) => x[1] & 1).length,
        up: e.filter((x) => x[1] & 2).length,
        median: median(e.map((x) => x[2]).filter((v) => v != null)),
      };
    });
  }
  const selRows = (id) => (selOn() && SD() ? memo('count|' + id, (c) => responsesOver(id, c.marks || [])) : null);

  // ---- each count is a question the Overview can place, and its rows a filter ---------------------------------------
  for (const id of IDS) {
    const c = C[id];
    A[id] = {
      id,
      kind: 'count',
      title: c.title,
      question: c.question || '',
      sub: c.sub || '',
      describe: c.sub || '',
      roles: [],
      help: {},
      section: '',
      labels:
        c.kind === 'responses' ? Object.fromEntries(c.rows.map((r) => [r.id, `${r.short}: ${c.calls.down}`])) : {},
      anySize: true,
      tile: (card) => tile(id, card),
      page: (card) => page(id, card),
    };
  }
  // c:<count> keeps the marks that went down in any of the rows named (by id); rows of a paired attribute use its filter
  K.filterKinds = {
    ...(K.filterKinds || {}),
    c: {
      valid: (id) => C[id]?.kind === 'responses',
      test: (id, vals) => {
        const sd = SD(),
          keep = new Set();
        vals.forEach((v) => {
          const k = C[id].rows.findIndex((r) => r.id === v);
          (sd.count_questions?.[id]?.[k] || []).forEach((x) => {
            if (x[1] & 1) keep.add(sd.marks[x[0]]);
          });
        });
        return (m) => keep.has(m);
      },
    },
  };
  const rowFilter = (id, r) => (r.filter[0] ? r.filter : ['c:' + id, r.id]);

  // ---- tiles ------------------------------------------------------------------------------------------------------
  const meter = (label, v, text, tip, cls = '', f = null) =>
    `<div class="cm${f ? ' pick' : ''}"${tip ? ` data-ctip="${esc(tip)}"` : ''}${
      f
        ? ` data-f="${esc(f[0])}" data-v="${esc(f[1])}" role="button" ` +
          `tabindex="0" aria-label="${esc(label)}: click to select these ${esc(W.marks)}"`
        : ''
    }><span class="cm-l">${esc(label)}</span>` +
    (`<span class="cm-t"><i class="${cls}" style="width:${(100 * Math.max(0, Math.min(1, v || 0))).toFixed(
      1
    )}%"></i></span>` +
      `<span class="cm-v">${esc(text)}</span></div>`);
  // a tile: its downloads on hover (the question's figure and table, as on its page), its meters, its line
  const shell = (id, card, body, foot, whole) =>
    `<article class="tile cnt-tile${card.wide ? ' wide' : ''}" id="tile-${esc(id)}" data-tile="${esc(id)}" data-count="${esc(id)}" tabindex="0">` +
    `<header><h3>${esc(card.title || C[id].title)}</h3>${K.expBar(
      ['pdf', 'svg', 'png', 'tsv'],
      'cexp',
      C[id].title,
      id
    ).replace('class="exp"', 'class="exp texp"')}${K.detailsLink(id)}</header>${body}` +
    (foot ? `<p class="tfoot">${foot}</p>` : '') +
    (whole ? `<p class="twhole"><span>Whole dataset</span> ${whole}</p>` : '') +
    '</article>';
  const loading = () => `<p class="muted tnone">Counting your selection…</p>`;
  function valuesHead(id, v, shown, mine) {
    const c = C[id],
      nVals = mine ? v.distinct : c.values.length;
    return (
      `<b>${int(nVals)}</b> ${esc(c.noun)}${
        nVals > shown ? ` (the ${shown} with the most ${esc(W.marks)} shown)` : ''
      }` +
      (c.list ? `; <b>${pc(v.multi, v.total)}%</b> of ${mine ? 'your ' : ''}${esc(W.marks)} ${esc(c.two_or_more)}` : '')
    );
  }
  function tile(id, card) {
    const c = C[id],
      on = selOn();
    if (on && !SD()) return shell(id, card, loading(), '', '');
    if (c.kind === 'values') {
      const sv = on ? selValues(id) : null,
        n = (v) => (sv ? sv.n(v[0]) : v[2]);
      const top = c.values
          .filter((v) => n(v) > 0)
          .sort((x, y) => n(y) - n(x))
          .slice(0, c.top),
        mx = Math.max(1, ...top.map(n)),
        tot = sv ? sv.total : c.total;
      const body = top.length
        ? `<div class="cmeters">${top
            .map((v) =>
              meter(
                v[1],
                n(v) / mx,
                int(n(v)),
                `<b>${esc(v[1])}</b><br>${int(n(v))} of ${int(tot)} ${on ? 'selected ' : ''}${esc(W.marks)} (${pc(n(v), tot)}%)`,
                '',
                ['t:' + c.attribute, v[0]]
              )
            )
            .join('')}</div>`
        : `<p class="muted ` + `tnone">None of these ${esc(W.marks)} has a value</p>`;
      return shell(
        id,
        card,
        body,
        valuesHead(id, sv || c, top.length, !!sv),
        sv ? valuesHead(id, c, Math.min(c.top, c.values.length), false) : ''
      );
    }
    const rows = (on ? selRows(id) : c.rows).filter((r) => r.n).sort((x, y) => y.down - x.down || y.n - x.n),
      mx = Math.max(1, ...rows.map((r) => r.down));
    const tip = (r) =>
      `<b>${esc(r.name)}</b>${
        r.note ? ` <span class="muted">${esc(r.note)}</span>` : ''
      }${r.group ? ` · ${esc(r.group)}` : ''}<br>` +
      (r.listed
        ? `${int(r.down)} ${esc(marksOf(r.down))} listed as ${esc(c.calls.down)}; the experiment lists ` +
          `only those, so there is no share`
        : `${int(r.down)} of ${int(r.n)} measured ${esc(W.marks)} ${esc(c.calls.down)} (${pc(r.down, r.n)}%)${
            r.up ? `; ${int(r.up)} ${esc(c.calls.up)}` : ''
          }`);
    const body = rows.length
      ? `<div class="cmeters">${rows
          .map((r) => meter(r.short, r.down / mx, int(r.down), tip(r), 'down', rowFilter(id, r)))
          .join('')}</div>`
      : `<p class="muted ` + `tnone">None of these ${esc(W.marks)} was measured</p>`;
    const most = (rs) => {
      const t = rs
        .filter((r) => r.n)
        .sort((x, y) => y.down - x.down || y.n - x.n)
        .slice(0, 2);
      return t.length
        ? `most ${esc(c.calls.down)}: ${t
            .map((r) => `${esc(r.short)} <b>${int(r.down)}</b>${r.listed ? ' listed' : ` of ${int(r.n)}`}`)
            .join(', ')}`
        : '';
    };
    return shell(id, card, body, esc(c.head || ''), on ? most(c.rows) : '');
  }

  // ---- pages ------------------------------------------------------------------------------------------------------
  const head = (id, card) => {
    const c = C[id];
    return (
      `<div class="page-head"><h2>${esc(card.title || c.title)}</h2></div><p class="page-sub">${esc(c.question || '')} <span class="muted">` +
      `Counted, not tested.</span>` +
      (selOn() ? ` <b>Your selection</b> is counted beside the whole dataset${SD() ? '' : ' (loading…)'}.` : '') +
      '</p>'
    );
  };
  const selCell = (k, n) =>
    `<span class="cnt-sel" title="${int(k)} of your ${int(n)} selected ${esc(W.marks)}"><i></i>${int(k)}</span>`;
  // an axis from 0 to the first round number at or above max, in about four steps
  function axis(max) {
    const step = niceStep(max / 4),
      top = Math.max(step, Math.ceil(max / step) * step),
      ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
    return { top, ticks };
  }
  function valuesPage(id, card) {
    const c = C[id],
      sv = selValues(id),
      on = !!sv,
      x = axis(c.values[0]?.[2] || 1),
      dmax = Math.max(1, ...c.dist),
      attr = SPECS[c.attribute] || {};
    const bar = (key, v, label, n, extra, k, tip, top) =>
      `<button type="button" class="cb${on && !k ? ' off' : ''}${key ? '' : ' noclick'}"${
        key ? ` data-cf="${esc(key)}" data-cv="${esc(v)}"` : ' tabindex="-1"'
      } data-ctip="${esc(tip)}">` +
      (`<span class="cb-l">${esc(label)}</span>${
        extra != null ? `<span class="cb-x">${esc(extra)}</span>` : ''
      }<span class="cb-t">` +
        `<i style="width:${((100 * n) / top).toFixed(1)}%"></i></span>`) +
      `<span class="cb-v">${int(n)}</span>${on ? selCell(k, sv.total) : ''}</button>`;
    const vals = c.values
      .map((v) =>
        bar(
          't:' + c.attribute,
          v[0],
          v[1],
          v[2],
          c.list ? `${int(v[3])} only` : null,
          on ? sv.n(v[0]) : null,
          `<b>${esc(v[1])}</b>${
            v[4] && attr.link ? `<br><span class="muted">${esc(v[4])}</span>` : ''
          }<br>${int(v[2])} ${esc(W.marks)}${c.list ? `, ${int(v[3])} reported ` + `by no other` : ''}${
            on ? `<br>${int(sv.n(v[0]))} of your ${int(sv.total)}` : ''
          }`,
          x.top
        )
      )
      .join('');
    const ticks =
      `<div class="cb-axis${c.list ? ' x' : ''}${on ? ' s' : ''}"><span></span>${c.list ? '<span></span>' : ''}<span class="ticks">${x.ticks
        .map((t) => `<span style="left:${((100 * t) / x.top).toFixed(1)}%">${compact(t)}</span>`)
        .join('')}</span><span>` + `</span>${on ? '<span></span>' : ''}</div>`;
    const unit = (k) => (k === c.bins ? `${c.bins} or more` : `${k} ${k === 1 ? c.unit[0] : c.unit[1]}`);
    const dist = c.list
      ? `<div class="cnt-dist"><p class="flabel">${esc(
          fill(c.distribution || `${cap(c.unit[1])} per {mark}`)
        )}</p><div ` +
        `class="cbars d${on ? ' s' : ''}">` +
        c.dist
          .map((n, k) =>
            bar(
              c.number && k ? `n:${c.number}` : '',
              String(k + 1),
              unit(k + 1),
              n,
              null,
              on ? sv.dist[k] : null,
              `<b>${esc(unit(k + 1))}</b><br>${int(n)} ${esc(W.marks)} (${pc(n, c.total)}%)${
                on ? `<br>${int(sv.dist[k])} of your ${int(sv.total)}` : ''
              }${c.number && k ? `<br>Click: the ${esc(W.marks)} with at least ${k + 1}` : ''}`,
              dmax
            )
          )
          .join('') +
        '</div>' +
        `<p class="cnt-note">${int(c.multi)} ${esc(W.marks)} (${pc(c.multi, c.total)}%) ${esc(c.two_or_more)}${
          on ? `; ${int(sv.multi)} of the ${int(sv.total)} selected` : ''
        }.</p></div>`
      : '';
    return (
      `<section class="pcard cnt-card" data-count="${esc(id)}"><div class="card-head"><div><h3>${esc(c.title)}</h3><p class="sub">${esc(K.shortSub(c.sub))}. Counts, not tests${
        on ? '; bars: the whole dataset, <span class="cnt-sel"><i></i></span> your selection' : ''
      }.</p></div>` +
      K.expBar(['pdf', 'svg', 'png', 'tsv'], 'cexp', c.title, id) +
      '</div>' +
      `<div class="cnt-two${c.list ? '' : ' one'}"><div><div class="cbars${c.list ? ' x' : ''}${on ? ' s' : ''}">${vals}</div>${ticks}<p class="cnt-axis">${esc(W.marks)} reported</p></div>${dist}</div>` +
      (c.list ? '' : `<p class="cnt-note">${esc(c.note || '')}</p>`) +
      '</section>'
    );
  }
  function responsesPage(id, card) {
    const c = C[id],
      sr = selRows(id),
      on = !!sr;
    const mx = Math.max(0.01, ...c.rows.filter((r) => r.n && !r.listed).map((r) => Math.max(r.down, r.up) / r.n));
    const m = (k, n, cls) =>
      `<div class="cnt-mrow"><span class="cnt-meter ${cls}"><i style="width:${((100 * (n ? k / n : 0)) / mx).toFixed(1)}%"></i></span>` +
      `<span class="num">${int(k)} (${pc(k, n)}%)</span></div>`;
    const tr = (r, k) => {
      const s = sr?.[k],
        f = rowFilter(id, r);
      return (
        `<tr class="cnt-row${on && !s.down ? ' off' : ''}" tabindex="0" role="button" data-cf="${esc(f[0])}" data-cv="${esc(f[1])}" title="Select ` +
        `the ${int(on ? s.down : r.down)} ${esc(marksOf(on ? s.down : r.down))} ${esc(c.calls.down)} in this row${on ? ' (within your selection)' : ''}">` +
        `<td class="wrapok"><b>${esc(r.name)}</b> <span class="muted">${esc(r.note)}</span>${
          r.group || r.kind
            ? ` <span class="show-xs ${r.group ? 'tag' : 'muted'}">${esc(r.group || r.kind)}</span>`
            : ''
        }</td>` +
        `<td class="hide-xs">${
          r.group ? `<span class="tag">${esc(r.group)}</span>` : `<span class="muted">${esc(r.kind)}</span>`
        }</td>` +
        `<td class="num">${int(r.n)}</td>` +
        (r.listed
          ? `<td><div class="cnt-mrow"><span class="cnt-meter down"></span><span class="num" title="The ` +
            `experiment lists only these, so there is no share">${int(r.down)} listed</span></div></td><td ` +
            `class="hide-xs"><span class="muted">not listed</span></td>`
          : `<td>${m(r.down, r.n, 'down')}</td><td class="hide-xs">${m(r.up, r.n, 'up')}</td>`) +
        `<td class="num hide-sm">${r.changes ? l2(r.median) : '–'}</td>${
          on
            ? `<td class="num">${
                s.n ? `${int(s.down)} <span class="muted">` + `of ${int(s.n)}</span>` : '<span class="muted">–</span>'
              }</td>`
            : ''
        }</tr>`
      );
    };
    return (
      `<section class="pcard cnt-card" data-count="${esc(id)}"><div class="card-head"><div><h3>${esc(c.title)}</h3><p class="sub">${esc(K.shortSub(c.sub))}. Counts ` +
      `and shares, not tests.</p></div>` +
      K.expBar(['pdf', 'svg', 'png', 'tsv'], 'cexp', c.title, id) +
      '</div>' +
      (`<div class="tbl-card cnt-wrap"><table class="tbl cnt-tbl"><thead><tr><th>${esc(c.first)}</th><th ` +
        `class="hide-xs">${esc(c.group)}</th><th class="num" title="${esc(cap(W.marks))} measured"><span ` +
        `class="hide-xs">${esc(cap(W.marks))}</span><span class="show-xs">n</span></th><th>${esc(cap(c.calls.down))}</th><th ` +
        `class="hide-xs">${esc(cap(c.calls.up))}</th><th class="num hide-sm">Median change</th>`) +
      (on
        ? `<th class="num" title="Your selected ${esc(W.marks)} ${esc(c.calls.down)} in each row, of those it ` +
          `measured">Your selection, ${esc(c.calls.down)}</th>`
        : '') +
      (`</tr></thead><tbody>${c.rows.map(tr).join('')}</tbody></table>` + `</div>`) +
      '</section>'
    );
  }
  function page(id, card) {
    if (selOn() && !SD()) return head(id, card) + '<p class="muted">Loading the selection…</p>';
    return head(id, card) + (C[id].kind === 'values' ? valuesPage(id, card) : responsesPage(id, card));
  }

  // ---- a click: the value's (or the row's) filter, then its marks on the Sites page --------------------------------
  function pick(el) {
    const key = el.dataset.cf,
      v = el.dataset.cv;
    if (!key) return;
    S.f[key] = [v];
    K.go(K.views.sites ? 'sites' : 'overview');
  }
  K.clicks.push(
    ['[data-cf]', pick],
    ['[data-cexp]', (el) => exportCount(el.dataset.cexp, el.closest('[data-count]').dataset.count, el)]
  );
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest?.('tr[data-cf]');
    if (t && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      pick(t);
    }
  });
  K.tips.push(['[data-ctip]', (el) => el.dataset.ctip]);

  // ---- downloads: the figure (PDF, SVG, PNG) and the table (TSV), each with its provenance --------------------------
  const subNote = (c) => {
    const s = c.sub || '';
    if (K.wrap(s, 720, 11.5).length <= 2) return [s, ''];
    return [s.split(/[:;(]/)[0].trim(), s + '. '];
  };
  const selText = () =>
    selOn() && SD()
      ? ` Your selection: ${K.sel.describe()} (${int(K.sel.nMarks())} ${marksOf(K.sel.nMarks())}), counted ` +
        `beside the whole dataset.`
      : '';
  function valuesFigure(id) {
    const c = C[id],
      P = K.PAL,
      sv = selValues(id),
      on = !!sv,
      parts = [];
    const T = (x, y, t, o = {}) =>
      parts.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 11}"${
          o.weight ? ` font-weight="${o.weight}"` : ''
        }${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || P.ink}">${esc(t)}</text>`
      );
    const L = 20,
      OX = 300,
      X0 = 312,
      X1 = on ? 640 : 680,
      VX = on ? 690 : 740,
      SX = 740,
      H = 18;
    let y = 4;
    const max = axis(c.values[0]?.[2] || 1);
    if (on) {
      T(SX, y + 8, 'SELECTED', { anchor: 'end', size: 8.5, weight: 'bold', fill: '#c2410c' });
      T(VX, y + 8, 'ALL', { anchor: 'end', size: 8.5, weight: 'bold', fill: P.muted });
      y += 12;
    }
    const bars = (rows, top, fillc) =>
      rows.forEach(([lab, n, extra, s]) => {
        T(L, y + 12, lab);
        if (extra != null) T(OX, y + 12, extra, { anchor: 'end', size: 10, fill: P.muted });
        parts.push(
          `<rect x="${X0}" y="${y + 4}" width="${Math.max(0.5, ((X1 - X0) * n) / top).toFixed(1)}" height="10" ` +
            `rx="2" fill="${fillc}"/>`
        );
        T(VX, y + 12, int(n), { anchor: 'end', size: 10.5, fill: P.muted });
        if (on) T(SX, y + 12, int(s), { anchor: 'end', size: 10.5, weight: 'bold', fill: '#c2410c' });
        y += H;
      });
    bars(
      c.values.map((v) => [v[1], v[2], c.list ? `${int(v[3])} only` : null, on ? sv.n(v[0]) : 0]),
      max.top,
      '#566a73'
    );
    max.ticks.forEach((t) => {
      const tx = X0 + ((X1 - X0) * t) / max.top;
      parts.push(`<line x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="${y + 2}" y2="${y + 6}" stroke="${P.muted}"/>`);
      T(tx, y + 17, compact(t), { anchor: 'middle', size: 9.5, fill: P.muted });
    });
    T((X0 + X1) / 2, y + 31, `${W.marks} reported`, { anchor: 'middle', size: 10, fill: P.muted });
    y += 46;
    if (c.list) {
      T(L, y + 10, fill(c.distribution || `${cap(c.unit[1])} per {mark}`), { weight: 'bold', size: 11.5 });
      y += 18;
      const unit = (k) => (k === c.bins ? `${c.bins} or more` : `${k} ${k === 1 ? c.unit[0] : c.unit[1]}`);
      bars(
        c.dist.map((n, k) => [unit(k + 1), n, null, on ? sv.dist[k] : 0]),
        Math.max(1, ...c.dist),
        '#566a73'
      );
      y += 4;
    }
    const legend = on
      ? [
          ['#566a73', null, 'whole dataset'],
          ['#c2410c', null, 'your selection (orange numbers)'],
        ]
      : [];
    const note =
      (c.list ? `${int(c.multi)} ${W.marks} (${pc(c.multi, c.total)}%) ${c.two_or_more}. ` : '') +
      (c.note || '') +
      ' Counts, not tests.' +
      selText();
    const [sb, more] = subNote(c);
    return K.figureFrame({
      title: c.title,
      sub: sb,
      legend,
      body: parts.join(''),
      bodyH: y,
      note: more + note,
      extra: { count: id },
    });
  }
  function responsesFigure(id) {
    const c = C[id],
      P = K.PAL,
      sr = selRows(id),
      on = !!sr,
      parts = [],
      Wd = 760;
    const T = (x, y, t, o = {}) =>
      parts.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 10.5}"${
          o.weight ? ` font-weight="${o.weight}"` : ''
        }${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || P.ink}">${esc(t)}</text>`
      );
    const L = 20,
      GX = 232,
      NX = 372,
      DX = 384,
      UX = 520,
      MX = on ? 680 : 740,
      SX = 740,
      BW = 60;
    const mx = Math.max(0.01, ...c.rows.filter((r) => r.n && !r.listed).map((r) => Math.max(r.down, r.up) / r.n));
    let y = 2;
    [
      [L, c.first, 'start'],
      [GX, c.group, 'start'],
      [NX, cap(W.marks), 'end'],
      [DX, cap(c.calls.down), 'start'],
      [UX, cap(c.calls.up), 'start'],
      [MX, 'Median', 'end'],
      ...(on ? [[SX, 'Selected', 'end']] : []),
    ].forEach(([x, t, a]) => T(x, y + 10, t.toUpperCase(), { anchor: a, size: 8.5, weight: 'bold', fill: P.muted }));
    y += 16;
    parts.push(`<line x1="${L}" x2="${Wd - 20}" y1="${y}" y2="${y}" stroke="${P.line}"/>`);
    c.rows.forEach((r, k) => {
      const lab = K.wrap(`${r.name} · ${r.note}`, GX - L - 10, 10.5).slice(0, 3),
        h = Math.max(22, lab.length * 13 + 9),
        yc = y + h / 2;
      lab.forEach((t, j) => T(L, yc + 4 - (lab.length - 1) * 6.5 + j * 13, t));
      T(GX, yc + 4, r.group || r.kind, { fill: P.muted });
      T(NX, yc + 4, int(r.n), { anchor: 'end' });
      const mtr = (x, kk, cls) => {
        parts.push(
          `<rect x="${x}" y="${yc - 4}" width="${BW}" height="8" rx="2" fill="${P.line}"/><rect x="${x}" y="${yc - 4}" width="${Math.max(
            0,
            (BW * (r.n ? kk / r.n : 0)) / mx
          ).toFixed(1)}" height="8" ` + `rx="2" fill="${cls === 'down' ? P.less : P.more}"/>`
        );
        T(x + BW + 6, yc + 4, `${int(kk)} (${pc(kk, r.n)}%)`);
      };
      if (r.listed) {
        T(DX, yc + 4, `${int(r.down)} listed`);
        T(UX, yc + 4, 'not listed', { fill: P.muted });
      } else {
        mtr(DX, r.down, 'down');
        mtr(UX, r.up, 'up');
      }
      T(MX, yc + 4, r.changes ? l2(r.median) : '–', { anchor: 'end' });
      if (on)
        T(SX, yc + 4, sr[k].n ? `${int(sr[k].down)} of ${int(sr[k].n)}` : '–', {
          anchor: 'end',
          weight: 'bold',
          fill: '#c2410c',
        });
      y += h;
      parts.push(`<line x1="${L}" x2="${Wd - 20}" y1="${y}" y2="${y}" stroke="${P.line}"/>`);
    });
    const [sb, more] = subNote(c);
    return K.figureFrame({
      title: c.title,
      sub: sb,
      body: parts.join(''),
      bodyH: y,
      note: `${more}${c.note || ''} Counts and ` + `shares, not tests.${selText()}`,
      extra: { count: id },
    });
  }
  function countTsv(id) {
    const c = C[id],
      on = selOn() && SD();
    if (c.kind === 'values') {
      const sv = on ? selValues(id) : null;
      const headCols = [
        'part',
        'value',
        'label',
        W.marks.replace(/\W+/g, '_'),
        ...(c.list ? ['only_this_value'] : []),
        ...(sv ? ['selected'] : []),
      ];
      const lines = c.values.map((v) => [
        c.attribute,
        v[0],
        v[1],
        v[2],
        ...(c.list ? [v[3]] : []),
        ...(sv ? [sv.n(v[0])] : []),
      ]);
      if (c.list)
        c.dist.forEach((n, k) =>
          lines.push([
            `${c.unit[1]}_per_${W.mark}`.replace(/\W+/g, '_'),
            k + 1 === c.bins ? `${c.bins}+` : String(k + 1),
            k + 1 === c.bins ? `${c.bins} or more` : `${k + 1}`,
            n,
            '',
            ...(sv ? [sv.dist[k]] : []),
          ])
        );
      return (
        K.preamble(
          c.title,
          `${c.question || ''} ${c.sub || ''}: the ${W.marks} each value of ${SPECS[c.attribute]?.label || c.attribute} has${
            c.list ? ', those with that value alone, and how many values each has' : ''
          }. Counts,` + ` not tests.${selText()}`
        ) +
        headCols.join('\t') +
        '\n' +
        lines.map((l) => l.join('\t')).join('\n') +
        '\n'
      );
    }
    const sr = on ? selRows(id) : null;
    const headCols = [
      'id',
      'experiment',
      'note',
      'group',
      'kind',
      'measured',
      c.calls.down,
      `${c.calls.down}_share`,
      c.calls.up,
      `${c.calls.up}_share`,
      'median_change',
      'listed_only',
      ...(sr ? ['selected_measured', `selected_${c.calls.down}`, `selected_${c.calls.up}`] : []),
    ];
    const g6 = (v) => (v == null ? '' : String(+Number(v).toPrecision(6)));
    const lines = c.rows.map((r, k) => [
      r.id,
      r.name,
      r.note,
      r.group,
      r.kind,
      r.n,
      r.down,
      r.listed ? '' : g6(r.n ? r.down / r.n : null),
      r.listed ? '' : r.up,
      r.listed ? '' : g6(r.n ? r.up / r.n : null),
      r.changes ? g6(r.median) : '',
      r.listed ? 'yes' : 'no',
      ...(sr ? [sr[k].n, sr[k].down, r.listed ? '' : sr[k].up] : []),
    ]);
    return (
      K.preamble(
        c.title,
        `${c.question || ''} ${c.sub || ''}. One row per experiment: the ${W.marks} it measured,` +
          ` those ${c.calls.down} and ${c.calls.up}, and the median change over them. ${c.note || ''} Counts and ` +
          `shares, not tests.${selText()}`
      ) +
      headCols.join('\t') +
      '\n' +
      lines.map((l) => l.join('\t')).join('\n') +
      '\n'
    );
  }
  function exportCount(kind, id, btn) {
    const name = `${D.site.id}_${id}${selOn() ? '_selection' : ''}`;
    K.exportFigure(
      kind,
      () => (C[id].kind === 'values' ? valuesFigure(id) : responsesFigure(id)),
      name,
      btn,
      () => countTsv(id)
    );
  }

  // ---- Method: each count's own section, after the questions' --------------------------------------------------------
  (K.methodParts ||= []).push(() =>
    IDS.map((id) => {
      const c = C[id],
        IN = D.inputs || {},
        a = SPECS[c.attribute] || {};
      const reads =
        c.kind === 'values'
          ? [
              `<li>${esc(a.label || c.attribute)}${
                c.number ? `, and ${esc(SPECS[c.number]?.label || c.number)}` : ''
              } <span class="muted">(${esc(W.marks)}’ attributes,` + ` from the ${esc(W.marks)} table)</span></li>`,
            ]
          : [
              ...(c.attributes || []).map(
                (n) =>
                  `<li>${esc(SPECS[n]?.label || n)} <span class="muted">(an attribute of ` +
                  `the ${esc(W.marks)})</span></li>`
              ),
              ...(c.tables || []).map(
                ([t, inp]) =>
                  `<li><span class="mono">${esc(t)}</span>: ${esc(IN[inp]?.version || inp)}${
                    IN[inp]?.licence ? ` (${esc(K.hlicence(IN[inp].licence))})` : ''
                  }</li>`
              ),
            ];
      const how =
        c.kind === 'values'
          ? `each value’s ${esc(W.marks)}${
              c.list
                ? `, those with it alone, and the number of values per ${esc(W.mark)} (1 to ${c.bins} or more)`
                : ''
            }`
          : `per experiment, the ${esc(W.marks)} measured, those ${esc(c.calls.down)} and ${esc(c.calls.up)}, and the ` +
            `median change over them (each ${esc(W.mark)}’s own median first)`;
      return (
        `<section id="m-q-${esc(id)}" class="qm"><h3>${esc(c.title)}</h3>${
          c.question ? `<p class="qm-q">${esc(c.question)}</p>` : ''
        }${c.sub ? `<p>${esc(c.sub)}.</p>` : ''}` +
        `<p>Counted, not tested: ${how}. A selection is counted again in the browser.${c.method ? ' ' + esc(c.method) : ''}</p>` +
        (`<p>Reads:</p><ul class="qm-reads">${reads.join('')}</ul><p class="qm-links"><a href="${esc(K.link('overview', id))}">Its figure</a>` +
          `</p></section>`)
      );
    }).join('')
  );
  const baseMethod = K.sections.method;
  K.sections.method = () => {
    const s = baseMethod(),
      at = s.map((x) => /^m-q-/.test(x[0])).lastIndexOf(true);
    s.splice(at + 1, 0, ...IDS.map((id) => [`m-q-${id}`, C[id].title, 1]));
    return s;
  };
});
