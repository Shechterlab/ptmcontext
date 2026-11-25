/* Open sections in the address. A copied link reopens the sections the reader opened (or closed): `open=` in the hash holds
   the ids of the folds whose state differs from what the page draws by default, comma-separated, an id with a leading "-"
   for one closed that opens by default. It is kept for the page shown (a view, or a protein) and dropped on another, and an
   id the page does not have is ignored. A module of the site kit: it reads the address through K.paramsIn, writes it through
   K.hashOut, and re-applies the state after every render (folds are drawn again with the page). */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { S } = K;
  // the fetches the page has started and not yet settled: K.landOn holds a landed target in place while any is open
  let open = 0;
  const nativeFetch = window.fetch;
  if (nativeFetch && !nativeFetch.counted) {
    const counted = function (...a) {
      open++;
      const done = () => open--;
      const p = nativeFetch.apply(this, a);
      p.then(done, done);
      return p;
    };
    counted.counted = true;
    window.fetch = counted;
  }
  K.inflight = () => open;
  let key = null; // the page the state below belongs to
  let want = {}; // fold id -> the state the reader (or the link) gave it, where it differs from dflt
  let dflt = {}; // fold id -> the state it was first drawn in on this page
  let land = ''; // the first section a link opened: the page is scrolled to it once it is drawn
  let lastClick = 0;
  let timer = 0;
  const pageKey = () =>
    S.view === 'protein' ? 'protein/' + String(S.arg || '').split('/')[0] : S.view + '/' + (S.arg || '');
  const reset = () => {
    key = pageKey();
    want = {};
    dflt = {};
  };
  // fold ids that were renamed with their titles: old id -> current id, read wherever open sections come in (the address,
  // a saved selection's folds), so an old link opens the same section
  const ALIAS = {
    'ixg-partners-and-complexes': 'ixg-protein-partners-and-complexes',
    'ixg-partners': 'ixg-binding-proteins',
    'p-score': 'p-sitetab', // the list of counts was removed; its sentence sits under the Sites table
    'site-glance': 'p-sitetab', // the site table that briefly sat under the map is the Sites table
  };
  K.foldId = (id) => ALIAS[id] || id;
  const parse = (v) => {
    const o = {};
    String(v || '')
      .split(',')
      .filter(Boolean)
      .forEach((t) => {
        o[K.foldId(t.replace(/^-/, ''))] = t[0] !== '-';
      });
    return o;
  };
  K.paramsIn.push((p) => {
    if (p.has('open')) {
      if (key !== pageKey()) reset();
      want = parse(p.get('open'));
      land = Object.keys(want).find((id) => want[id]) || '';
    } else if (key !== pageKey()) reset();
  });
  K.hashOut.push((p) => {
    if (key !== pageKey()) return;
    const ids = Object.keys(want)
      .filter((id) => !(id in dflt) || want[id] !== dflt[id])
      .map((id) => (want[id] ? id : '-' + id));
    if (ids.length) p.set('open', ids.join(','));
  });
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => K.writeHash(false), 150);
  };
  (K.afterRender ||= []).push(() => {
    if (key !== pageKey()) reset();
    document.querySelectorAll('details[id]').forEach((d) => {
      if (!(d.id in dflt)) dflt[d.id] = d.open;
      if (d.id in want && d.open !== want[d.id]) {
        d.open = want[d.id];
        K.folds[d.id] = d.open;
      }
    });
    // a section opened by a link sits in groups that may be closed: open them too, so it is visible where the link lands
    Object.keys(want).forEach((id) => {
      if (!want[id]) return;
      for (
        let a = document.getElementById(id)?.parentElement?.closest('details');
        a;
        a = a.parentElement?.closest('details')
      )
        if (!a.open) {
          a.open = true;
          if (a.id) K.folds[a.id] = true;
        }
    });
    // arriving by a link that opens a section: the section is scrolled to, below the toolbar (as a section's own address is)
    if (land && document.getElementById(land)) {
      const id = land;
      land = '';
      K.landOn?.(() => document.getElementById(id));
    }
  });
  document.addEventListener(
    'click',
    () => {
      lastClick = Date.now();
    },
    true
  );
  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.id || key !== pageKey()) return;
      if (!(d.id in dflt)) {
        if (Date.now() - lastClick > 500) return; // drawn open, not opened by the reader
        dflt[d.id] = !d.open;
      }
      if (d.open === dflt[d.id]) delete want[d.id];
      else if (want[d.id] !== d.open) want[d.id] = d.open;
      else return;
      save();
    },
    true
  );
});
