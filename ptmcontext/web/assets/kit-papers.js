/* PubMed identifiers: a value that holds several ("123;456", "123; 456", "123,456") is one link per identifier, and a
   long list collapses to "N papers ▾" (a details element, opened in place). A module of the site kit:
     K.papers.ids(value)                 the identifiers, in order, once each
     K.papers.links(ids, opts)           the links' HTML; opts: {url, label, max}
   url is an address with {} for the identifier (PubMed's by default); label a function id -> text (the identifier by
   default); max the number shown before the list collapses (3). */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { esc } = K;
  const PM = (id) => `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(id)}/`;
  const ids = (v) => [
    ...new Set(
      (Array.isArray(v) ? v.join(';') : String(v ?? ''))
        .split(/[;,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  ];
  function links(list, o = {}) {
    const max = o.max || 3,
      url = o.url ? (id) => o.url.replace('{}', encodeURIComponent(id)) : PM,
      lab = o.label || ((id) => id),
      a = (id) => `<a href="${esc(url(id))}" target="_blank" rel="noopener">${esc(lab(id))}</a>`;
    if (!list.length) return '';
    if (list.length <= max) return list.map(a).join(', ');
    return (
      `<details class="pm-more"><summary>${list.length} papers</summary>` +
      `<span class="pm-list">${list.map(a).join(', ')}</span></details>`
    );
  }
  K.papers = { ids, links };
});
