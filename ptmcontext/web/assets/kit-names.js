/* How a protein is named and found in a search box: one function for a site's search and the landing page's, so both
   give the same hits in the same order. A row is { acc, gene (the short name shown), genes (every gene), aliases (previous
   and alternative symbols), name, entry, w (weight: marks, or sites, most first) }. Plain script (the landing page inlines
   it); it puts window.PTMNames = { rank, text } and reads nothing else. */
(() => {
  'use strict';
  const low = (x) => String(x ?? '').toLowerCase();
  const norm = (x) =>
    String(x ?? '')
      .toUpperCase()
      .replace(/[-\s._/]/g, '');
  const names = (r) => {
    const gs = r.genes?.length ? r.genes : String(r.gene || '').split(/[\s;,]+/);
    return [...new Set([r.gene, ...gs].filter(Boolean))];
  };
  // the best hits for the text: an exact gene (any of the protein's genes), accession, entry name, or other symbol first; then a
  // gene that starts with it, another symbol that does, an accession that does, and a name that contains it (3+ letters)
  const rank = (rows, query, max = 8) => {
    const t = low(query).trim(),
      tn = norm(query);
    if (!t) return [];
    const tiers = [[], [], [], [], []];
    for (const r of rows) {
      const gs = names(r).map(low),
        al = r.aliases || [];
      const ex = al.find((x) => low(x) === t || (tn.length >= 3 && norm(x) === tn));
      if (gs.includes(t) || low(r.acc) === t || low(r.entry) === t) tiers[0].push({ row: r, via: '' });
      else if (ex) tiers[0].push({ row: r, via: ex });
      else if (gs.some((g) => g.startsWith(t))) tiers[1].push({ row: r, via: '' });
      else {
        const a = al.find((x) => low(x).startsWith(t) || (tn.length >= 3 && norm(x).startsWith(tn)));
        if (a) tiers[2].push({ row: r, via: a });
        else if (low(r.acc).startsWith(t)) tiers[3].push({ row: r, via: '' });
        else if (t.length >= 3 && low(r.name).includes(t)) tiers[4].push({ row: r, via: '' });
      }
    }
    const by = (a, b) => (b.row.w || 0) - (a.row.w || 0);
    return tiers
      .flatMap((l) => l.sort(by))
      .slice(0, max)
      .map((h) => ({ ...h, ...text(h.row, h.via) }));
  };
  // the readable name: the short name, then the protein's name and, for a protein several genes encode, how many
  const text = (r, via) => {
    const n = r.genes?.length > 1 ? `${r.genes.length} genes` : '';
    return {
      label: r.gene || r.acc,
      desc: [r.name, n].filter(Boolean).join(', '),
      sub: [via, [r.name, n].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    };
  };
  window.PTMNames = { rank, text };
})();
