/* How a protein is named and found in a search box: one function for a site's search and the landing page's, so both
   give the same hits in the same order. A row is { acc, gene (the short name shown), genes (every gene), aliases (previous
   and alternative symbols), name, entry, w (weight: marks, or sites, most first) }. Plain script (the landing page inlines
   it); it puts window.PTMNames = { rank, text, exact, pos, siteOf, read } and reads nothing else. The notations of a site typed in a
   search are read here too (pos, siteOf), for the explorers' search (kit-select.js) and the landing page's. */
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
      .flatMap((l, tier) => l.sort(by).map((h) => ({ ...h, tier })))
      .slice(0, max)
      .map((h) => ({ ...h, ...text(h.row, h.via) }));
  };
  // the hits that are exactly the name (gene, accession, entry name or other symbol, hyphens and spaces aside)
  const exact = (rows, name) => rank(rows, name, 1e9).filter((h) => h.tier === 0);
  const AA = 'ACDEFGHIKLMNPQRSTVWY';
  // a position as typed: R216, or 216 alone -> { letter ('' when none), pos }, or null when it is not one
  const pos = (t) => {
    const m = /^([A-Z]?)(\d+)$/i.exec(String(t ?? ''));
    return m && (!m[1] || AA.includes(m[1].toUpperCase())) ? { letter: m[1].toUpperCase(), pos: +m[2] } : null;
  };
  // a name with its site in one word: GENE_R216, GENE-R216, GENE/216, GENE:R216 or H4R3. known(name) gives what the name
  // names (or nothing); -> { name, hit: what known gave, letter, pos } or null
  const siteOf = (t, known) => {
    for (const re of [/^(.+?)[:_/-]([A-Z]?\d+)$/i, /^(.+?)([A-Z]\d+)$/i]) {
      const m = re.exec(String(t ?? '')),
        p = m && pos(m[2]),
        hit = p && known(m[1]);
      if (hit) return { name: m[1], hit, ...p };
    }
    return null;
  };
  // what a phrase of several words asks for, by one rule for the landing page and the explorers: a name and a site token
  // (TP53 R213 mutation methylation) is that site, the other words ignored; with no site token, the words that name
  // proteins are a gene list when two or more do (an ordinary word that names nothing never makes one), else the one
  // protein. known(word) gives what a word names (or nothing). -> { site: { name, hit, letter, pos } } | { list: [words] }
  // | { one: { name, hit } } | null
  const read = (words, known) => {
    const hits = words.map((w) => known(w) || null),
      at = words.findIndex((w, i) => !hits[i] && pos(w)),
      first = hits.findIndex(Boolean);
    if (at >= 0 && first >= 0) return { site: { name: words[first], hit: hits[first], ...pos(words[at]) } };
    const named = words.filter((w, i) => hits[i]);
    if (at < 0 && named.length > 1) return { list: named };
    return at < 0 && first >= 0 ? { one: { name: words[first], hit: hits[first] } } : null;
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
  window.PTMNames = { rank, text, exact, pos, siteOf, read };
})();
