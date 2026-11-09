/* Data that is read when it is first asked for. The page's data holds what the first screen draws; the rest of the
   protein attributes' values (D.late.protein_attributes: their names) is in data/site.json (D.late.file). A name in
   that list reads as missing until something asks for its values (a filter, the search, a Proteins page, a protein's
   facts): the first ask fetches the file, fills the values in and draws the page again. The one-file copy has all of
   it inline and no D.late. A module of the site kit: K.late.need() asks for the file, K.late.done() says it is in. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const D = K.D,
    L = D.late;
  let pending = null,
    done = !L;
  K.late = { need: () => pending, done: () => done };
  if (!L || !D.protein_attributes?.values) return;
  const vals = D.protein_attributes.values;
  const need = () =>
    (pending ||= fetch(L.file)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (j) => {
          for (const n of L.protein_attributes || [])
            Object.defineProperty(vals, n, {
              value: (j.protein_attributes || {})[n],
              writable: true,
              enumerable: true,
              configurable: true,
            });
          done = true;
          K.render();
        },
        () => {
          done = true;
        }
      )); // a file that will not come is not asked for again
  K.late.need = need;
  for (const n of L.protein_attributes || [])
    Object.defineProperty(vals, n, {
      get() {
        need();
        return undefined;
      },
      enumerable: false,
      configurable: true,
    });
});
