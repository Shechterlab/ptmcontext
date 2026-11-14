/* The one accessor for the selection data (data/sel/, CONTRACTS.md "Selection data in parts"). Nothing else reads those
   files. What each view needs, and what it costs:
     K.seld.core()          the small core (questions, classes, attribute values, shard map); a first search, filter or
                            page that names a mark reads it, never the first screen
     K.seld.sets(pi)        which protein sets a protein is in, from the one small file of its proteins (protein pages)
     K.seld.marksOf(pis)    the marks of these proteins, from the files that hold them (the Sites page's first page)
     K.seld.full()          every part, put back together as the whole selection (a selection, a filter, a retest, a sort
                            by another column); fetched and parsed in a worker, put together a file at a time so the page
                            keeps answering. The one-file copy has the whole inline and reads nothing.
   A reader that gets null asks again after K.render(): the call has started the file and renders when it is in. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const BASE = 'data/sel/';
  const inlineEl = typeof document === 'undefined' ? null : document.getElementById('selection-data');
  let core = null,
    coreP = null,
    fullP = null,
    worker = null;
  const files = new Map(); // file name -> parsed data, or the promise of it
  let again = 0;
  const redraw = () => {
    if (again) return;
    again = setTimeout(() => {
      again = 0;
      K.render();
    }, 0);
  };
  const absBase = () => new URL(BASE, typeof location === 'undefined' ? 'http://localhost/' : location.href).href;
  const getJSON = (f) =>
    fetch(BASE + f).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${BASE + f}`))));
  // a file once: from the cache, else from the worker or the network
  const file = (f) => {
    const have = files.get(f);
    if (have !== undefined) return have instanceof Promise ? have : Promise.resolve(have);
    const p = getJSON(f).then(
      (d) => {
        files.set(f, d);
        return d;
      },
      (e) => {
        files.delete(f); // asked for again on the next need
        throw e;
      }
    );
    files.set(f, p);
    return p;
  };
  const peekFile = (f) => {
    const have = files.get(f);
    return have === undefined || have instanceof Promise ? null : have;
  };

  // silent: the caller asks for a file of its own next and draws when that is in, so the core's arrival draws nothing
  function loadCore(silent) {
    return (coreP ||= getJSON('core.json').then((c) => {
      core = c;
      if (!silent) redraw();
      return c;
    }));
  }
  const coreNow = () => {
    if (!core && !inlineEl) loadCore();
    return core;
  };

  // the files that hold a protein's marks and its sets (the same proteins in both)
  const shardOf = (pi) => core?.parts.shard_of[pi] ?? -1;
  function sets(pi) {
    const c = core;
    if (!c) {
      if (!inlineEl)
        loadCore(true).then(
          () => sets(pi),
          () => 0
        );
      return undefined;
    }
    const k = shardOf(pi);
    if (k < 0 || !c.parts.sets) return null;
    const f = c.parts.sets[k],
      d = peekFile(f);
    if (!d) {
      file(f).then(redraw, () => files.set(f, {}));
      return undefined;
    }
    return d[pi] || null; // {question: {n: set names, b: in the background, c: covariate, sc: scores, a, v}}
  }
  // the names of the sets a protein is in for one question (the file holds their places in the question's list)
  let lastSets = { pi: -1, aid: '', names: new Set() };
  function setsOf(pi, aid) {
    const r = sets(pi)?.[aid]?.n,
      m = core?.protein_sets_meta?.[aid];
    if (!r || !m) return new Set();
    if (lastSets.pi !== pi || lastSets.aid !== aid)
      // a protein in hundreds of sets is asked hundreds of times
      lastSets = {
        pi,
        aid,
        names: new Set(r.map((i) => (i < m.sets.length ? m.sets[i][0] : m.more[i - m.sets.length]))),
      };
    return lastSets.names;
  }
  // the values of an attribute: in the core, or in a file of their own (null until it is in: ask again after the next render)
  function vocab(name) {
    const c = coreNow();
    if (!c) return null;
    const f = c.parts.vocab?.[name];
    if (!f) return c.attributes[name] || null;
    const d = peekFile(f);
    if (!d) file(f).then(redraw, () => 0);
    return d;
  }
  // the core and one protein's sets file, asked for together and waited for at most 3 s: a protein page opened from the
  // address is then drawn once, with them
  function warm(pi) {
    if (inlineEl || pi == null) return Promise.resolve();
    const get = loadCore(true).then((c) => {
      const k = c.parts.shard_of[pi];
      return k >= 0 && c.parts.sets ? file(c.parts.sets[k]) : null;
    });
    return Promise.race([get, new Promise((r) => setTimeout(r, 3000))]).catch(() => 0);
  }
  // the marks of these proteins, each protein's rows in order: an array, or null while its file comes
  function marksOf(pis) {
    const c = coreNow();
    if (!c) return null;
    const ks = [...new Set(pis.map(shardOf).filter((k) => k >= 0))],
      miss = ks.filter((k) => !peekFile(c.parts.marks[k]));
    if (miss.length) {
      Promise.all(miss.map((k) => file(c.parts.marks[k]))).then(redraw, () => 0);
      return null;
    }
    return pis.flatMap((p) => byProtein(shardOf(p))?.get(p) || []);
  }
  // a file's rows by protein, made once (with each row's index in the whole list)
  const byShard = new Map();
  function byProtein(k) {
    if (k < 0) return null;
    const f = core.parts.marks[k];
    let m = byShard.get(f);
    if (!m) {
      const s = peekFile(f);
      m = new Map();
      s.rows.forEach((r, j) => {
        r.ix = s.ix[j];
        if (!m.has(r[0])) m.set(r[0], []);
        m.get(r[0]).push(r);
      });
      byShard.set(f, m);
    }
    return m;
  }

  // ---- the whole selection ------------------------------------------------------------------------------------------
  // fetch and parse in a worker; each file arrives as its own message, so the page is never held for long
  function fromWorker(names, onFile) {
    return new Promise((resolve, reject) => {
      const todo = names.filter((f) => {
        const have = peekFile(f);
        if (have) onFile(f, have);
        return !have;
      });
      if (!todo.length) return resolve();
      let left = todo.length,
        w = null;
      const ok = () => {
        if (!--left) resolve();
      };
      const fallback = async () => {
        for (const f of todo.filter((x) => !peekFile(x))) {
          const d = await file(f);
          onFile(f, d);
          ok();
          await new Promise((r) => setTimeout(r, 0));
        }
      };
      try {
        w = worker ||= new Worker('assets/kit-seldata-worker.js');
      } catch (e) {
        return fallback().then(resolve, reject);
      }
      const got = new Set();
      w.onmessage = (e) => {
        const m = e.data;
        if (m.error) return reject(new Error(m.error));
        if (m.done || got.has(m.f)) return;
        got.add(m.f);
        files.set(m.f, m.data);
        onFile(m.f, m.data);
        ok();
      };
      w.onerror = (e) => {
        worker = null;
        reject(new Error(e.message || 'worker'));
      };
      w.postMessage({ base: absBase(), files: todo });
    });
  }

  function full() {
    if (inlineEl) return Promise.resolve(null);
    const busy = (text, p) => (K.busy ? K.busy(text, p) : p);
    return (fullP ||= busy(
      'Loading the data',
      loadCore().then(async (c) => {
        const parts = c.parts,
          SD = { ...c };
        delete SD.parts;
        delete SD.protein_sets_meta;
        const rest = Object.entries(parts.extra);
        await fromWorker(
          rest.map(([, f]) => f),
          (f, d) => {
            SD[rest.find(([, g]) => g === f)[0]] = d;
          }
        );
        await fromWorker(Object.values(parts.vocab || {}), (f, d) => {
          const name = Object.keys(parts.vocab).find((n) => parts.vocab[n] === f);
          SD.attributes = { ...SD.attributes, [name]: d };
        });
        SD.marks = new Array(parts.n_marks);
        const w = SD.wide?.w;
        await fromWorker(parts.marks, (f, s) => {
          for (let j = 0; j < s.ix.length; j++) {
            const r = s.rows[j],
              i = s.ix[j];
            r.ix = i;
            if (w) r.w = w[i];
            SD.marks[i] = r;
          }
        });
        SD.ixDone = true; // each mark has its index (ix) and its longer window (w): kit-select.js need not
        worker?.terminate();
        worker = null;
        // the files' own copies are not kept: the whole selection is the one copy
        files.clear();
        byShard.clear();
        return SD;
      })
    ));
  }

  K.seld = {
    inline: !!inlineEl,
    core: coreNow,
    coreReady: () => (inlineEl ? Promise.resolve(null) : loadCore()),
    shardOf,
    sets,
    setsOf,
    warm,
    vocab,
    marksOf,
    full,
    // counts of the marks per value of each attribute, over every mark (the Sites page's quick filters before the marks are in)
    attrCounts: (name) => {
      const c = core;
      const ti = c ? (c.attribute_names || Object.keys(c.attributes)).indexOf(name) : -1;
      return ti < 0 ? null : c.parts.attr_counts[ti]; // null for an attribute with very many values
    },
  };
});
