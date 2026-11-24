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
  let idx = null,
    pending = null;
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // the index still coming after 300 ms: a small spinner and short text in the status line (still under reduced motion)
  let wait = 0;
  const spin = () => {
    wait = 0;
    if (!idx && say) say.innerHTML = '<span class="ld-spin" aria-hidden="true"></span> Loading proteins…';
  };
  const load = () => {
    if (!pending) wait = setTimeout(spin, 300);
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
    idx.rows ||= idx.p.map(([acc, gene, name, ids, genes, aliases]) => ({
      acc,
      gene,
      name,
      genes: genes || [],
      aliases: aliases || [],
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
    return `#protein/${path}${site ? '?' + new URLSearchParams({ q }) : ''}`;
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
      // a gene and a residue with its position (TP53 S15, H4 R3, AKT1 T308): the hits open that site; only a protein that has
      // the typed name gets the site, not a near match
      const p = names.length === 2 && N.pos(names[1]),
        hits = p && known(names[0]);
      if (hits) return { rows: hits, site: `${p.letter}${p.pos}` };
      // a gene list, when some of its names are proteins here
      return names.some(known) ? { rows: [], list: names } : { rows: [], site: '' };
    }
    return { rows, site: '' };
  };
  // the sites' own addresses: a protein's page (at its site when one is typed), or the gene-list test
  const listAddress = (s, names) => `${encodeURIComponent(s.id)}/#list?${new URLSearchParams({ q: names.join(' ') })}`;
  // the explorers to offer for a hit: with a residue typed, the ones whose marks sit on that residue (their own residues,
  // from the site file) open the site; the others open the protein only
  const links = (row, site, q) => {
    const letter = site.replace(/\d/g, ''),
      all = row.ids.map((k) => idx.sites[k]).filter(Boolean),
      fits = (s) => !letter || !s.residues?.length || s.residues.includes(letter),
      one = (s, at) =>
        `<a href="${esc(encodeURIComponent(s.id))}/${esc(address(row, at, q))}">${esc(s.label)}${at || !site ? '' : ' (protein only)'}</a>`;
    return [...all.filter(fits).map((s) => one(s, site)), ...all.filter((s) => !fits(s)).map((s) => one(s, ''))];
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
    out.innerHTML = list
      ? `<li><span class="hit-name"><b>${esc(list.join(', '))}</b></span><span class="hit-sites">Open this list in: ${idx.sites
          .map((s) => `<a href="${listAddress(s, list)}">${esc(s.label)}</a>`)
          .join(' ')}</span></li>`
      : rows
          .map((h) => {
            const { acc, ids } = h.row;
            return (
              `<li><span class="hit-name" style="cursor:pointer" title="Open in ${esc(idx.sites[ids[0]]?.label || '')}"><b>${esc(h.label)}</b>${h.desc ? ` · ${esc(h.desc)}` : ''} ` +
              `<span class="muted">${esc(acc)}${site ? ` · ${esc(site)}` : ''}${h.via ? ` · also ${esc(h.via)}` : ''}</span></span>` +
              `<span class="hit-sites">Open in ${links(h.row, site, q).join(' ')}</span></li>`
            );
          })
          .join('');
    if (say)
      say.textContent = list
        ? `${list.length} names: test them as a gene list.`
        : rows.length
          ? `${rows.length} protein${rows.length === 1 ? '' : 's'}; open it in an explorer.`
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
      if (idx) open();
      else load().then(() => (draw(), open()));
    } else if (e.key === 'Escape' && box.value) {
      box.value = '';
      draw();
    }
  });
})();
