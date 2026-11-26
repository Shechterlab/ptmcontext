/* Protein sets and ontology terms by name or id, for the search box (web/termindex.py writes the index).

   The index (data/search/terms.json: sources and terms [source, id, name, proteins with a mark, synonyms]) is read the first
   time the search box is used, never with the page. K.terms.suggest(words) ranks it: an exact name or id first, then a name
   that begins with the words, then a name with a word that begins with each of them; at most 8 terms, grouped by source,
   most proteins first within a rank. Choosing a term is a filter, as the sets' filter is today: a protein set of a question
   is p:<question> with the set; a term of an ontology source (GO biological process) is g:<source> with the term's id, its
   proteins read from the Overlap page's files when the filter is first applied. The filter is in the link (f=) and shows
   as a chip with the term's name. A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D } = K;
  const TI = D.term_index || null;
  const MAX = 8, // terms offered
    PER_GROUP = 4;

  // ---- reading the words ------------------------------------------------------------------------------------------
  const fold = (x) =>
    String(x || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9:.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const words = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);
  // an id written with or without its leading zeros: DOID:0000332 and DOID:332
  const idKey = (x) => {
    const m = /^([a-z][a-z-]*):0*(\d+)$/i.exec(String(x).trim());
    return m ? m[1].toLowerCase() + ':' + m[2] : String(x).trim().toLowerCase();
  };
  // one term of the index, prepared for matching
  const prep = (src, t) => {
    const [si, id, name, n, syn] = t,
      shown = name || id;
    return {
      si,
      id,
      name: shown,
      n,
      src: src[si],
      nm: fold(shown),
      nw: words(fold(shown)),
      idl: idKey(id),
      syn: (syn || []).map((s) => [fold(s), words(fold(s))]),
    };
  };
  // how well a term answers the words typed (0: not at all)
  function score(t, q, toks, idq, raw) {
    let best = 0;
    if (idq && (t.idl === idq || t.id.toLowerCase() === raw)) best = 100;
    else if (idq && raw.length >= 4 && t.id.toLowerCase().startsWith(raw)) best = 70;
    const one = (cand, cw, bonus) => {
      // a name differing from the words only by a closing parenthesis ("Stress granule (CD-CODE)") reads as exact; size breaks the tie
      if (cand === q || cand.replace(/ \(.*\)$/, '') === q) return 100 - bonus;
      if (cand.startsWith(q)) return 80 - bonus;
      if (toks.every((w) => cw.some((c) => c.startsWith(w)))) return 60 - bonus + (cw[0]?.startsWith(toks[0]) ? 3 : 0);
      return 0;
    };
    best = Math.max(best, one(t.nm, t.nw, 0));
    for (const [s, sw] of t.syn) best = Math.max(best, one(s, sw, 5));
    return best;
  }
  // the best `max` terms of a prepared index for some words, at most `each` of one group; { term, score } by group
  function rank(ix, query, max = MAX, each = PER_GROUP) {
    const q = fold(query),
      toks = q.split(' ').filter(Boolean);
    if (!ix || !toks.length || q.length < 2) return [];
    const raw = String(query).trim().toLowerCase(),
      idq = /\d|:/.test(raw) ? idKey(raw) : null;
    // fewer than three letters match only whole words or ids
    if (q.length < 3 && !idq) return [];
    const hits = [];
    for (const t of ix.terms) {
      const s = score(t, q, toks, idq, raw);
      if (s >= (q.length < 3 ? 95 : 1)) hits.push({ t, s });
    }
    hits.sort(
      (a, b) => b.s - a.s || b.t.n - a.t.n || a.t.name.length - b.t.name.length || (a.t.name < b.t.name ? -1 : 1)
    );
    const take = [],
      count = {},
      named = new Set(); // one row for a name a group holds twice (a set tested in two questions)
    for (const h of hits) {
      const nk = h.t.src.group + '\n' + h.t.nm;
      if (named.has(nk)) continue;
      named.add(nk);
      const g = h.t.src.group;
      if ((count[g] || 0) >= each) continue;
      count[g] = (count[g] || 0) + 1;
      take.push(h);
      if (take.length >= max) break;
    }
    // grouped: groups in the order of their best term, terms in rank order within each
    const order = [];
    take.forEach((h) => {
      if (!order.includes(h.t.src.group)) order.push(h.t.src.group);
    });
    return order.flatMap((g) => take.filter((h) => h.t.src.group === g));
  }
  // two sets of one group never share a display name: a plain name whose group also holds "name (source)" takes that
  // source and its own id ("Stress granule (CD-CODE 40C311B2)")
  function distinct(raw) {
    const paren = new Map();
    raw.terms.forEach((t) => {
      const m = t[2] && /^(.*\S) \(([^()]+)\)$/.exec(t[2]);
      if (m) paren.set(raw.sources[t[0]].group + '\n' + m[1], m[2]);
    });
    return raw.terms.map((t) => {
      const g = t[2] && paren.get(raw.sources[t[0]].group + '\n' + t[2]);
      return g ? [t[0], t[1], `${t[2]} (${g} ${t[1]})`, ...t.slice(3)] : t;
    });
  }
  const prepare = (raw0) => {
    const raw = { ...raw0, terms: distinct(raw0) };
    return {
      sources: raw.sources,
      terms: raw.terms.map((t) => prep(raw.sources, t)),
      byKey: new Map(raw.terms.map((t) => [raw.sources[t[0]].key + '\n' + t[1], t])),
    };
  };

  // ---- the index, read on first use -------------------------------------------------------------------------------
  let ix = null,
    loading = null,
    failed = false,
    since = 0;
  const fire = [];
  function load() {
    if (!TI || ix) return Promise.resolve(ix);
    return (loading ||=
      (since = Date.now()) &&
      fetch(TI.file)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(
          (raw) => {
            ix = prepare(raw);
            fire.splice(0).forEach((f) => f());
            K.sel?.refresh?.();
            return ix;
          },
          () => {
            failed = true;
            fire.splice(0).forEach((f) => f());
            return null;
          }
        ));
  }
  const state = () => (!TI || failed ? 'none' : ix ? 'ready' : loading ? 'loading' : 'idle');

  // ---- the rows the search box offers -----------------------------------------------------------------------------
  const int = K.int || String;
  const noun = () => `${K.W?.marked || ''} proteins`.trim();
  function suggest(phrase) {
    if (!ix) return [];
    return rank(ix, phrase).map(({ t }) => ({
      kind: 'termsel',
      group: t.src.group,
      label: t.name,
      sub: [t.src.title, t.name !== t.id && /\d/.test(t.id) && t.id.length <= 24 ? t.id : '']
        .filter(Boolean)
        .join(' · '),
      n: `${int(t.n)} ${noun()}`,
      filter: [t.src.key, [t.id]],
    }));
  }
  // a term's own name, for the chip of its filter (the id until the index is in)
  const nameOf = (key, id) => {
    const t = ix?.byKey.get(key + '\n' + id);
    if (!t && TI) load();
    return t ? t[2] || t[1] : id;
  };

  // ---- the terms of an ontology source as a filter (g:<source>) -----------------------------------------------------
  const members = {}; // source|term -> Set of protein indices, or null while it is being read
  let universe = null,
    uniP = null;
  const shardName = (id, n) => String([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % n).padStart(2, '0') + '.json';
  const getJSON = (f) => fetch(f).then((r) => (r.ok ? r.json() : Promise.reject(new Error(f))));
  function need(sid, tid) {
    const k = sid + '|' + tid;
    if (members[k] !== undefined) return;
    members[k] = null;
    const src = TI.sources.find((s) => s.id === sid),
      base = TI.overlap_dir;
    (uniP ||= getJSON(base + 'universe.json').then((u) => (universe = u.acc)))
      .then(() => getJSON(`${base}sources/${sid}/${shardName(tid, src.shards || 16)}`))
      .then(
        (file) => {
          const by = K.sel.byAcc;
          members[k] = new Set((file[tid] || []).map((i) => by[universe[i]]?.i).filter((i) => i != null));
          K.sel.refresh();
        },
        () => {
          members[k] = new Set();
          K.sel.refresh();
        }
      );
  }
  const termSources = (TI?.sources || []).filter((s) => s.kind === 'term');
  if (termSources.length) {
    K.filterKinds = {
      ...(K.filterKinds || {}),
      g: {
        valid: (id) => termSources.some((s) => s.id === id),
        label: (id) => termSources.find((s) => s.id === id)?.title || id,
        value: (id, v) => nameOf('g:' + id, v),
        test: (id, vals) => {
          vals.forEach((v) => need(id, v));
          const sets = vals.map((v) => members[id + '|' + v]);
          return (m) => sets.some((s) => s && s.has(m[0]));
        },
      },
    };
  }

  K.terms = { rank, prepare, suggest, load, state, since: () => since, onLoad: (f) => fire.push(f), fold, nameOf };
});
