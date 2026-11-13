/* The landing page's search: a gene name or a UniProt accession, then the site to open it in. The index is
   proteins.json beside the landing page ({sites: [{id, label}], p: [[accession, gene, name, [index of each site that has it]]]}), read
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
  const load = () =>
    (pending ||= fetch('proteins.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing'))))
      .then((j) => (idx = j))
      .catch(() => {
        pending = null;
        return null;
      }));
  const find = (q) => {
    const t = q.trim().toUpperCase();
    if (!t || !idx) return [];
    const hits = [];
    for (const row of idx.p) {
      const acc = row[0].toUpperCase(),
        gene = String(row[1] || '').toUpperCase(),
        genes = gene.split(/[\s;,]+/).filter(Boolean);
      // an exact accession or gene first, then a name that starts with the text, then one that contains it
      const rank =
        acc === t || genes.includes(t)
          ? 0
          : acc.startsWith(t) || genes.some((g) => g.startsWith(t))
            ? 1
            : t.length >= 3 && (gene.includes(t) || String(row[2] || '').toUpperCase().includes(t))
              ? 2
              : 9;
      if (rank < 9) hits.push([rank, row]);
    }
    return hits
      .sort((a, b) => a[0] - b[0] || String(a[1][1]).length - String(b[1][1]).length)
      .slice(0, 12)
      .map((h) => h[1]);
  };
  const draw = () => {
    const q = box.value.trim();
    if (!q) {
      out.innerHTML = '';
      if (say) say.textContent = '';
      return;
    }
    if (!idx) {
      if (say) say.textContent = 'Searching…';
      return;
    }
    const rows = find(q);
    out.innerHTML = rows
      .map(([acc, gene, name, ids]) => {
        const links = ids
          .map((k) => idx.sites[k])
          .filter(Boolean)
          .map(
            (s) =>
              `<a href="${esc(encodeURIComponent(s.id))}/#/protein/${esc(encodeURIComponent(acc))}">${esc(s.label)}</a>`
          )
          .join(' ');
        return (
          `<li><span class="hit-name"><b>${esc(String(gene || acc).split(/[\s;,]+/)[0])}</b> ` +
          `<span class="muted">${esc(acc)}</span>${name ? ` ${esc(name)}` : ''}</span>` +
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
