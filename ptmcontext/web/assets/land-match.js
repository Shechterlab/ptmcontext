/* How a typed search matches the Compare marks page's classes and questions, in one place: the Compare page filters its rows with
   it and the landing page counts what it would show. Every typed word must start a word of the class name or of its question's
   name, in any case ("stress gran" finds "Stress granule"; "als" finds "ALS / motor neuron / FTD"; "idr" finds "(IDR)"); a
   plural is read as its singular ("granules"). A question whose name matches keeps all its classes. Plain script (inlined
   into both pages before their own scripts). Reads the shape of compare.json: {groups: [{questions: [{title, rows: [{label}]}]}]}. */
(() => {
  'use strict';
  const words = (t) =>
    String(t ?? '')
      .toLowerCase()
      .match(/[a-z0-9]+/g) || [];
  const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  // (label, title) => does this class of this question match the query
  const matcher = (query) => {
    const need = words(query).map(stem);
    return (label, title) => {
      const have = words(`${label} ${title}`);
      return need.every((w) => have.some((h) => h.startsWith(w)));
    };
  };
  // the classes (rows) and questions the query matches in compare.json's data
  const count = (data, query) => {
    const hit = matcher(query),
      out = { classes: 0, questions: 0 };
    if (!words(query).length) return out;
    for (const g of data?.groups || [])
      for (const q of g.questions || []) {
        const n = (q.rows || []).filter((r) => hit(r.label, q.title)).length;
        out.classes += n;
        if (n) out.questions++;
      }
    return out;
  };
  window.PTMMatch = { words, matcher, count };
})();
