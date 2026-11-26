/* How a protein is named and found in a search box: one function for a site's search and the landing page's, so both
   give the same hits in the same order. A row is { acc, gene (the short name shown), genes (every gene), aliases (previous
   and alternative symbols), name, entry, w (weight: marks, or sites, most first) }. Plain script (the landing page inlines
   it); it puts window.PTMNames = { rank, text, exact, pos, siteOf, read, asksVariants } and reads nothing else. The notations of a site typed in a
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
        // another symbol that starts with it: a whole word of it for a short text (H4 is not H41 or H4F5rel)
        const a = al.find((x) =>
          t.length < 4
            ? low(x)
                .split(/[\s\-_./]+/)
                .includes(t)
            : low(x).startsWith(t) || (tn.length >= 3 && norm(x).startsWith(tn))
        );
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
  // a position as typed: R216, or 216 alone, with a mark code after it that is read and dropped (K4me3, R3me2s, S15ph)
  // -> { letter ('' when none), pos, mark ('' when none) }, or null when it is not one
  const MARK = 'me[1-3][as]?|me|ac|ph|ub|su|cr|sm|gl|ox|ar|ma|la|bu|pr|hib';
  const pos = (t) => {
    const m = new RegExp(`^([A-Z]?)(\\d+)(${MARK})?$`, 'i').exec(String(t ?? ''));
    return m && (!m[1] || AA.includes(m[1].toUpperCase()))
      ? { letter: m[1].toUpperCase(), pos: +m[2], mark: low(m[3]) }
      : null;
  };
  // a name with its site in one word: GENE_R216, GENE-R216, GENE/216, GENE:R216 or H4R3. known(name) gives what the name
  // names (or nothing); -> { name, hit: what known gave, letter, pos, mark } or null
  const siteOf = (t, known) => {
    const w = String(t ?? ''),
      sep = /^(.+?)[:_/-]([A-Z]?\d+[A-Z0-9]*)$/i.exec(w),
      tries = sep ? [[sep[1], sep[2]]] : [];
    for (let i = 1; i < w.length; i++) if (/^[A-Z]\d/i.test(w.slice(i))) tries.push([w.slice(0, i), w.slice(i)]);
    for (const [name, tail] of tries) {
      const p = pos(tail),
        hit = p && known(name);
      if (hit) return { name, hit, ...p };
    }
    return null;
  };
  // what a phrase of several words asks for, by one rule for the landing page and the explorers: a name and a site token
  // (TP53 R213 mutation methylation, H3 K4, H3 K4me3) is that site, the other words ignored; a word of the site's form
  // (K4 is also a gene symbol) that follows a protein is a site, never a gene name. With no site token, the words that name
  // proteins are a gene list when two or more do (an ordinary word that names nothing never makes one), else the one
  // protein. known(word) gives what a word names (or nothing). -> { site: { name, hit, letter, pos, mark } } | { list:
  // [words] } | { one: { name, hit } } | null
  const read = (words, known) => {
    const hits = words.map((w) => known(w) || null),
      first = hits.findIndex(Boolean),
      at = first < 0 ? -1 : words.findIndex((w, i) => i > first && pos(w));
    if (at > 0) return { site: { name: words[first], hit: hits[first], ...pos(words[at]) } };
    const named = words.filter((w, i) => hits[i]);
    if (named.length > 1) return { list: named };
    return first >= 0 ? { one: { name: words[first], hit: hits[first] } } : null;
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
  // a word that asks about the site's variants (TP53 R213 mutation): the site opens at its variants
  const VARIANT_WORD = /^(mutations?|variants?|cancer)$/i;
  const asksVariants = (words) => words.some((w) => VARIANT_WORD.test(w));
  window.PTMNames = { rank, text, exact, pos, siteOf, read, asksVariants };
})();
