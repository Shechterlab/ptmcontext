/* Values by name. A mark's record in a protein file is [position, window, classes, attributes]: its classes follow
   D.mark_columns (one per question) and its attributes D.mark_attributes (one per marks.attributes entry), whatever
   a site has, so a page never counts to a fixed place. D.column_index gives each name's place (the page's data is
   built with it); data without it falls back to the list's own order. A module of the site kit:
   K.cols.cls(name), K.cols.attr(name), K.cols.protein(name): the place, or -1 for a name the site does not have;
   K.cols.markClass(m, name), K.cols.markAttr(m, name): a mark's value, or undefined for a name the site does not have;
   K.cols.field(p, name): a field of a row of D.proteins (accession, gene, name, length, marks, candidates, entry). */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const D = K.D,
    CI = D.column_index || {};
  const index = (kind, list) => {
    const m = CI[kind] || Object.fromEntries((list || []).map((n, i) => [n, i]));
    return (name) => (Object.prototype.hasOwnProperty.call(m, name) ? m[name] : -1);
  };
  const cls = index('mark_columns', D.mark_columns),
    attr = index('mark_attributes', D.mark_attributes),
    protein = index('proteins', ['accession', 'gene', 'name', 'length', 'marks', 'candidates', 'entry']);
  K.cols = {
    cls,
    attr,
    protein,
    markClass: (m, name) => {
      const i = cls(name);
      return i < 0 ? undefined : m[2]?.[i];
    },
    markAttr: (m, name) => {
      const i = attr(name);
      return i < 0 ? undefined : m[3]?.[i];
    },
    field: (p, name) => {
      const i = protein(name);
      return i < 0 ? undefined : p[i];
    },
  };
  // ---- the one count of other modifications nearby (the map's legend, the Other modifications section, the hover and the
  // card all read it; kit-map.js lists the kinds). One window (website.context_window, as the run's "Other marks nearby"
  // column reads it), a residue itself left out, a residue counted once for each kind of modification on it; a score cut-off
  // (the entry's subset) is a count of its own, printed with its cut-off.
  K.nearWindow = () => +(D.context_window || D.protein_view?.map?.hover?.window || 10);
  // the same count over any list of kinds shaped as contextMarks' (a site without map rows lists them from its table)
  K.nearIn = (cm, from, win = K.nearWindow()) => {
    const all = new Set();
    const kinds = cm.map((c) => {
      const near = [];
      c.pos.forEach((q) => {
        let best = null;
        from.forEach((f) => {
          if (f !== q && Math.abs(q - f) <= win && (!best || Math.abs(q - f) < Math.abs(best - q))) best = f;
        });
        if (best != null) {
          near.push({ pos: q, dist: q - best, from: best });
          all.add(q);
        }
      });
      return {
        id: c.id,
        label: c.label,
        short: c.short,
        cut: c.cut,
        n: c.pos.length,
        high: c.high ? c.high.length : null,
        near,
        nearHigh: c.high ? near.filter((x) => c.high.includes(x.pos)).length : null,
        score: c.score,
      };
    });
    return { win, kinds, residues: all.size };
  };
});
