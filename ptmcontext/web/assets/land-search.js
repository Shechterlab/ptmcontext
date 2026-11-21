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
    const rows = find(q);
    out.innerHTML = rows
      .map((h) => {
        const { acc, ids } = h.row,
          links = ids
            .map((k) => idx.sites[k])
            .filter(Boolean)
            .map(
              (s) =>
                `<a href="${esc(encodeURIComponent(s.id))}/#/protein/${esc(encodeURIComponent(acc))}">${esc(s.label)}</a>`
            )
            .join(' ');
        return (
          `<li><span class="hit-name"><b>${esc(h.label)}</b>${h.desc ? ` · ${esc(h.desc)}` : ''} ` +
          `<span class="muted">${esc(acc)}${h.via ? ` · also ${esc(h.via)}` : ''}</span></span>` +
          `<span class="hit-sites">Open in ${links}</span></li>`
        );
      })
      .join('');
    if (say)
      say.textContent = rows.length
        ? `${rows.length} protein${rows.length === 1 ? '' : 's'}; choose a site to open it in.`
        : 'No protein with that name or accession in these sites.';
  };
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
