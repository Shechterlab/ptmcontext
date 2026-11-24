/* The landing page's search: a gene name (any of a protein's genes, or an old or alternative symbol) or a UniProt accession, then the site to open it in. The index is
   proteins.json beside the landing page ({sites: [{id, label}], p: [[accession, gene, name, [index of each site that has it], genes, aliases]]}), read
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
    // several names (TP53 S15, EGFR,TP53): the first one is searched, and the line says so
    let rows = find(q),
      first = '',
      site = '';
    if (!rows.length) {
      const names = q.split(/[\s,;]+/).filter(Boolean);
      if (names.length > 1) {
        first = names[0];
        rows = find(first);
        // a gene and a residue with its position (TP53 S15, H4 R3): the hits open that site, as a site's own search does
        if (names.length === 2 && /^[A-Za-z]\d+$/.test(names[1]) && rows.length) {
          site = names[1].toUpperCase();
          first = '';
          // only a protein that has the typed name (as a gene, another symbol or its accession) gets the site, not a near match
          const w = names[0].toUpperCase(),
            is = (x) => String(x || '').toUpperCase() === w;
          rows = rows.filter(
            (h) => is(h.row.acc) || is(h.row.gene) || h.row.genes.some(is) || h.row.aliases.some(is) || is(h.via)
          );
        }
      }
    }
    out.innerHTML = rows
      .map((h) => {
        const { acc, ids } = h.row,
          links = ids
            .map((k) => idx.sites[k])
            .filter(Boolean)
            .map(
              (s) => `<a href="${esc(encodeURIComponent(s.id))}/${esc(address(h.row, site, q))}">${esc(s.label)}</a>`
            )
            .join(' ');
        return (
          `<li><span class="hit-name" style="cursor:pointer" title="Open in ${esc(idx.sites[ids[0]]?.label || '')}"><b>${esc(h.label)}</b>${h.desc ? ` · ${esc(h.desc)}` : ''} ` +
          `<span class="muted">${esc(acc)}${h.via ? ` · also ${esc(h.via)}` : ''}</span></span>` +
          `<span class="hit-sites">Open in ${links}</span></li>`
        );
      })
      .join('');
    if (say) {
      const lead = first ? `Searched the first name only, ${first}; search each name on its own. ` : '';
      say.textContent = rows.length
        ? `${lead}${rows.length} protein${rows.length === 1 ? '' : 's'}; choose a site to open it in.`
        : `${lead}No protein with that name or accession in these sites.`;
    }
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
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // one hit in one site: open it
      const links = out.querySelectorAll('a');
      if (links.length === 1) location.href = links[0].href;
      else links[0]?.focus();
    } else if (e.key === 'Escape' && box.value) {
      box.value = '';
      draw();
    }
  });
})();
