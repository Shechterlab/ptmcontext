/* Values by name. A mark's record in a protein file is [position, window, classes, attributes]: its classes follow
   D.mark_columns (one per question) and its attributes D.mark_attributes (one per marks.attributes entry), whatever
   a site has, so a page never counts to a fixed place. D.column_index gives each name's place (the page's data is
   built with it); data without it falls back to the list's own order. A module of the site kit:
   K.cols.cls(name), K.cols.attr(name), K.cols.protein(name): the place, or -1 for a name the site does not have;
   K.cols.markClass(m, name), K.cols.markAttr(m, name): a mark's value, or undefined for a name the site does not have;
   K.cols.field(p, name): a field of a row of D.proteins (accession, gene, name, length, marks, candidates, entry). */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const D = K.D, CI = D.column_index || {};
  const index = (kind, list) => {
    const m = CI[kind] || Object.fromEntries((list || []).map((n, i) => [n, i]));
    return name => (Object.prototype.hasOwnProperty.call(m, name) ? m[name] : -1);
  };
  const cls = index('mark_columns', D.mark_columns), attr = index('mark_attributes', D.mark_attributes), protein = index('proteins', ['accession', 'gene', 'name', 'length', 'marks', 'candidates', 'entry']);
  K.cols = {
    cls, attr, protein,
    markClass: (m, name) => { const i = cls(name); return i < 0 ? undefined : m[2]?.[i]; },
    markAttr: (m, name) => { const i = attr(name); return i < 0 ? undefined : m[3]?.[i]; },
    field: (p, name) => { const i = protein(name); return i < 0 ? undefined : p[i]; },
  };
});
