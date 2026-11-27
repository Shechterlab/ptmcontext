/* The landing page's search: a gene name (any of a protein's genes, or an old or alternative symbol) or a UniProt accession, then the explorer to open it in. The index is
   proteins.json beside the landing page ({sites: [{id, label, residues}], p: [[accession, gene, name, [index of each site that has it], genes, aliases]]}), read
   when the box is first used. Each hit lists the sites that have the protein, each a link to its protein page. Plain
   script (it is inlined into the landing page; the sites' pages do not load it). */
(() => {
  'use strict';
  const box = document.getElementById('land-q'),
    out = document.getElementById('land-hits'),
    say = document.getElementById('land-say');
  if (!box || !out) return;
  // the full placeholder does not fit a phone's width: a shorter one there
  const full = box.placeholder,
    narrow = window.matchMedia?.('(max-width: 640px)'),
    ph = () => (box.placeholder = narrow.matches ? 'Gene, site or topic' : full);
  if (narrow) {
    ph();
    narrow.addEventListener('change', ph);
  }
  let idx = null,
    pending = null,
    sidx = null, // proteins-sites.json: per listed explorer, accession -> its marked sites ('R3 R15 K120'), read when a site is typed
    cmp = null; // compare/compare.json, read once beside the proteins (none: a site without a Compare page)
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // the index still coming after 300 ms: a small spinner and short text in the status line (still under reduced motion)
  let wait = 0;
  const spin = () => {
    wait = 0;
    if (!idx && say) say.innerHTML = '<span class="ld-spin" aria-hidden="true"></span> Loading proteins…';
  };
  const loadSites = () => {
    if (sidx === null) {
      sidx = false;
      sidx = fetch('proteins-sites.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          sidx = j || false;
          draw();
          return sidx;
        })
        .catch(() => (sidx = false));
    }
    return Promise.resolve(sidx);
  };
  const load = () => {
    if (!pending) {
      wait = setTimeout(spin, 300);
      fetch('compare/compare.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          cmp = j;
          if (j && idx) draw();
        })
        .catch(() => {});
    }
    return (pending ||= fetch('proteins.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing'))))
      .then((j) => (idx = j))
      .catch(() => {
        pending = null;
        return null;
      })
      .finally(() => {
        clearTimeout(wait);
        wait = 0;
      }));
  };
  // the same ranking and names as a site's search (kit-names.js, inlined before this script)
  const find = (q) => {
    if (!q.trim() || !idx) return [];
    const short = {}; // the explorers' shorthand (website.search.shorthand: H4 is the histone): accession -> names
    Object.entries(idx.shorthand || {}).forEach(([n, acc]) => (short[acc] ||= []).push(n));
    idx.rows ||= idx.p.map(([acc, gene, name, ids, genes, aliases]) => ({
      acc,
      gene,
      name,
      genes: genes || [],
      short: short[acc] || [],
      aliases: [...(aliases || []), ...(short[acc] || [])],
      w: ids.length,
      ids,
    }));
    return window.PTMNames.rank(idx.rows, q, 12);
  };
  // the explorer's own address for a protein, or for its site when one is typed: #protein/GENE/ACC/R3?q=H4+R3 (the position is
  // read in the protein's own numbering by the explorer, so H4 R3 is UniProt R4 there)
  const address = ({ acc, gene }, site, q) => {
    const tag = String(gene || '').split(/[\s;]+/)[0],
      path = [tag, acc, site].filter(Boolean).map(encodeURIComponent).join('/');
    const open = site && window.PTMNames.asksVariants(q.split(/[\s,;]+/)) ? { open: 'sc-variants' } : {};
    return `#protein/${path}${site ? '?' + new URLSearchParams({ q, ...open }) : ''}`;
  };
  // what the box holds, read as a site's own search reads it (notations in kit-names.js): { rows: the proteins, site: 'R3' or '',
  // list: the names of a gene list or null }
  const read = (q) => {
    const N = window.PTMNames,
      known = (name) => {
        const e = N.exact(idx.rows, name);
        return e.length ? e : null;
      };
    let rows = find(q);
    const names = q.split(/[\s,;]+/).filter(Boolean);
    // H4R3, TP53-R213, P04637/213: the name and its site in one word (a name that is itself the whole text wins)
    const so = names.length === 1 && !known(q) && N.siteOf(q, known);
    if (so) return { rows: so.hit, site: `${so.letter}${so.pos}` };
    if (!rows.length && names.length > 1) {
      // a name and a site (TP53 S15, H4 R3, TP53 R213 mutation methylation): that site, the other words ignored; two or more
      // names and no site: a gene list; one name: that protein (kit-names.js read)
      const r = N.read(names, known) || {};
      if (r.site) return { rows: r.site.hit, site: `${r.site.letter}${r.site.pos}` };
      if (r.list) return { rows: [], list: r.list };
      return { rows: r.one ? r.one.hit : [], site: '' };
    }
    return { rows, site: '' };
  };
  // the sites' own addresses: a protein's page (at its site when one is typed), or the gene-list test
  const listAddress = (s, names) => `${encodeURIComponent(s.id)}/#list?${new URLSearchParams({ q: names.join(' ') })}`;
  // does explorer k hold this site (the exact residue and position) on the protein? Before the index of sites is read, or
  // for a site with none, the explorer's residues stand in (its marks sit on that residue)
  const holds = (row, k, site) => {
    const s = idx.sites[k],
      letter = site.replace(/\d/g, ''),
      by = Array.isArray(sidx) && sidx[k];
    if (by) {
      const have = (by[row.acc] || '').split(' ');
      return letter ? have.includes(site) : have.some((x) => x.slice(1) === site);
    }
    return !letter || !s.residues?.length || s.residues.includes(letter);
  };
  // the explorers to offer for a hit: with a site typed, the ones that hold that exact site open it; the others that have
  // the protein open the protein only
  const links = (row, site, q) => {
    const all = row.ids.filter((k) => idx.sites[k]),
      one = (k, at) =>
        `<a href="${esc(encodeURIComponent(idx.sites[k].id))}/${esc(address(row, at, q))}">${esc(idx.sites[k].label)}${at || !site ? '' : ' (protein only)'}</a>`,
      fit = (k) => !site || holds(row, k, site);
    return [...all.filter(fit).map((k) => one(k, site)), ...all.filter((k) => !fit(k)).map((k) => one(k, ''))];
  };
  // the exact current symbols and the explorers' shorthand first; a protein found only by an old or alternative symbol is
  // folded under one muted line (when nothing else is found they are shown as they are)
  const main = (rows) => {
    const m = rows.filter((h) => !h.via || h.row.short.includes(h.via) || h.tier > 0);
    return m.length ? m : rows;
  };
  const hitsHtml = (rows, site, q) => {
    const one = (h) => {
      const { acc, ids } = h.row,
        via = h.row.short.includes(h.via) ? '' : h.via;
      return (
        `<li><span class="hit-name" style="cursor:pointer" title="Open in ${esc(idx.sites[ids[0]]?.label || '')}"><b>${esc(h.label)}</b>${h.desc ? ` · ${esc(h.desc)}` : ''} ` +
        `<span class="muted">${esc(acc)}${site ? ` · ${esc(site)}` : ''}${via ? ` · also ${esc(via)}` : ''}</span></span>` +
        `<span class="hit-sites">Open in ${links(h.row, site, q).join(' ')}</span></li>`
      );
    };
    const first = main(rows),
      rest = rows.filter((h) => !first.includes(h));
    return (
      first.map(one).join('') +
      (rest.length
        ? `<li class="hit-alias muted"><details><summary>${rest.length} other${rest.length === 1 ? '' : 's'} also ${rest.length === 1 ? 'uses' : 'use'} the name ${esc(rest[0].via)} ›</summary><ul>${rest.map(one).join('')}</ul></details></li>`
        : '')
    );
  };
  const draw = () => {
    const q = box.value.trim();
    if (!q) {
      out.innerHTML = '';
      if (say) say.textContent = '';
      return;
    }
    if (!idx) {
      if (say && !say.querySelector('.ld-spin')) say.textContent = 'Searching…';
      return;
    }
    const { rows, site, list } = read(q);
    if (site && sidx === null) loadSites();
    // a category: the Compare page's classes or questions that the same words match (land-match.js, as that page filters)
    const cat = !list && !site && cmp ? window.PTMMatch.count(cmp, q) : { classes: 0 },
      catLine = cat.classes
        ? `<li class="hit-cmp"><a href="compare/#${esc(new URLSearchParams({ q }))}">Compare ‘${esc(q)}’ across explorers: ${cat.classes} ${cat.classes === 1 ? 'class' : 'classes'} ›</a></li>`
        : '';
    // Enter's target: a protein whose current symbol (or the explorers' shorthand) is exactly the text first; else a category that the words match (ALS is the
    // Compare class, not ALS2, which only starts with it); else the first protein
    const go = {
      cat: !!catLine && !site && !rows.some((h) => h.tier === 0 && (!h.via || h.row.short.includes(h.via))),
    };
    out.innerHTML = list
      ? `<li><span class="hit-name"><b>${esc(list.join(', '))}</b></span><span class="hit-sites">Open this list in: ${idx.sites
          .map((s) => `<a href="${listAddress(s, list)}">${esc(s.label)}</a>`)
          .join(' ')}</span></li>`
      : go.cat
        ? catLine + hitsHtml(rows, site, q)
        : hitsHtml(rows, site, q) + catLine;
    if (say)
      say.textContent = list
        ? `${list.length} names: test them as a gene list.`
        : rows.length
          ? site && !links(main(rows)[0].row, site, q).some((l) => !l.includes('(protein only)'))
            ? `No explorer lists ${site} on ${main(rows)[0].label}; Enter opens the protein.`
            : `${main(rows).length} protein${main(rows).length === 1 ? '' : 's'}; open ${main(rows).length === 1 ? 'it' : 'one'} in an explorer.`
          : cat.classes
            ? 'No protein with that name; it matches a category in Compare.'
            : 'No protein with that name or accession in these sites.';
  };
  // a click on a hit's name (not on one of its site links) opens the protein in the first site that has it
  out.addEventListener('click', (e) => {
    if (e.target.closest('a') || !e.target.closest('.hit-name')) return;
    const a = e.target.closest('li')?.querySelector('.hit-sites a');
    if (a) location.href = a.href;
  });
  box.addEventListener('focus', load, { once: true });
  box.addEventListener('input', () => {
    load().then(draw);
    draw();
  });
  // Enter opens the first offered link (the index may still be coming: wait for it)
  const open = () => {
    const a = out.querySelector('a');
    if (a) location.href = a.href;
  };
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const go = () => (read(box.value.trim()).site ? loadSites() : Promise.resolve()).then(open);
      if (idx) go();
      else load().then(() => (draw(), go()));
    } else if (e.key === 'Escape' && box.value) {
      box.value = '';
      draw();
    }
  });
})();
