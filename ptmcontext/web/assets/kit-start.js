/* Starting points on the Overview: proteins ranked by their count of marks or by a fact of their own (the site file's
   proteins.attributes), and ready-made selections, as the explorer's. Configured in website.overview.starting_points:
     lists: [{title, by: marks | <number attribute>, order: desc | asc, where: {attribute, max, min}, show, n, help}]
     quick: [{label, query: "q=...&f=...", view}]
   A list whose attribute the site lacks is left out; with nothing to show, the block is absent. A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, esc, int } = K;
  const SP = D.overview?.starting_points;
  if (!SP || !D.proteins?.length) return;
  const P = D.proteins.map(([acc, gene, name, len, marks], i) => ({ i, acc, gene, name, marks }));
  const has = (name) => name === 'marks' || D.protein_attributes?.values?.[name] != null;
  const value = (p, name) => (name === 'marks' ? p.marks : K.proteinAttr(p.acc, name));
  const fmt = (v) =>
    v == null
      ? '–'
      : Number.isInteger(v)
        ? int(v)
        : Math.abs(v) >= 100
          ? int(Math.round(v))
          : (+v)
              .toPrecision(2)
              .replace(/\.?0+$/, '')
              .replace(/e\+?/, 'e');
  // the figure beside a protein: a template with {marks} and {<attribute>}, else the ranking value
  const shown = (p, l) => (l.show ? l.show.replace(/\{(\w+)\}/g, (m0, n) => fmt(value(p, n))) : fmt(value(p, l.by)));
  function ranked(l) {
    if (!has(l.by) || (l.where && !has(l.where.attribute))) return [];
    const ok = (p) => {
      const v = value(p, l.by);
      if (v == null || Number.isNaN(v)) return false;
      if (!l.where) return true;
      const w = value(p, l.where.attribute);
      return w != null && (l.where.max == null || w <= l.where.max) && (l.where.min == null || w >= l.where.min);
    };
    const dir = l.order === 'asc' ? 1 : -1;
    return P.filter(ok)
      .sort((a, b) => dir * (value(a, l.by) - value(b, l.by)) || b.marks - a.marks)
      .slice(0, l.n || 6);
  }
  // each quick selection's size, counted in the browser from the selection data once something else has loaded it (the
  // first screen does not ask for the 10 MB file for this)
  const quickN = (q) => {
    const sd = K.sel?.peek();
    if (!sd) return null;
    const st = K.sel.stateOfHash('?' + q.query);
    const r = K.sel.select(st.q, st.f);
    return (q.view === 'proteins' ? r.proteins?.size : r.marks?.length) ?? null;
  };
  (K.overviewBlocks ||= []).push(() => {
    const lists = (SP.lists || []).map((l) => [l, ranked(l)]).filter(([, ps]) => ps.length);
    const quick = SP.quick || [];
    if (!lists.length && !quick.length) return '';
    const col = (h, help, body) =>
      `<div class="start-col"><h4 title="${esc(help || '')}">${esc(h)}</h4><div ` +
      `class="start-pills">${body}</div></div>`;
    const body =
      `<div class="start-card">` +
      (quick.length
        ? col(
            'Quick selections',
            'Ready-made selections',
            quick
              .map((q) => {
                const n = quickN(q);
                return `<a class="start-pill" href="#${esc(q.view || 'overview')}?${esc(q.query)}">${esc(q.label)}${n != null ? `<b>${int(n)}</b>` : ''}</a>`;
              })
              .join('')
          )
        : '') +
      lists
        .map(([l, ps]) =>
          col(
            l.title,
            l.help,
            ps
              .map(
                (p) =>
                  `<a class="start-pill" href="${esc(K.link('protein', p.acc))}" title="Open ${esc(p.gene || p.acc)}: ${esc(p.name || '')}">${esc(p.gene || p.acc)}<b>${esc(shown(p, l))}</b></a>`
              )
              .join('')
          )
        )
        .join('') +
      '</div>';
    return K.fold('sec-starting-points', 'Starting points', '', body, SP.open === true);
  });
  (K.overviewSections ||= []).push(() => [['sec-starting-points', 'Starting points', 1]]);
});
