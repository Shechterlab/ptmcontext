/* Selections: the model. A selection is the marks that pass every constraint: the search (genes, accessions, sites such as
   "FUS R216", or terms such as motif:RGG) and the filters. Filters within one control match any of their values; separate
   controls must all hold. Every page then shows the selection, and the Overview's tests run again on it in the browser:
     residue questions   the selected marks against the other candidate residues of their own proteins (marks not
                         selected are left out of both sides): within each protein (Mantel–Haenszel) and pooled
                         (Fisher), as the site's own rows (kit-stats.js)
     protein-set questions  the selected proteins in each set, against the set's share of the background
                         (one-sided hypergeometric), over the sets the site tested
   A question the selection was made with is shown, not tested (its answer would be circular). Too small a selection
   (fewer than 10 proteins or 30 marks) is shown but not tested. The filters a site offers come from its file
   (website.filters), or else one group per section of questions and one per attribute of its marks.
   No page is drawn here (the sidebar and the selection line are kit-rail.js); the module needs no document. A module of
   the site kit: K.sel = { state (the live search and filters), rows(aid, method) / retest (a question tested again on the
   selection), data() / peek() (the marks, read on first need), compute(), select(q, f), subscribe(fn), ... }. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  const ST = window.PTMC_STATS;
  const SEL_MIN = { proteins: D.compare?.min_proteins ?? 10, marks: D.compare?.min_marks ?? 30 }; // website.compare.min_proteins / min_marks; the defaults are the original explorer's
  const SPECS = D.attribute_specs || {};
  const P = (D.proteins || []).map(([acc, gene, name, len, marks, cand, entry], i) => ({
    i,
    acc,
    gene,
    name,
    len,
    marks,
    cand,
    entry,
  }));
  const byAcc = Object.fromEntries(P.map((p) => [p.acc, p]));
  const byEntry = Object.fromEntries(P.filter((p) => p.entry).map((p) => [p.entry.toUpperCase(), p]));
  // a token that names a protein: its gene, accession (an isoform's names its canonical entry) or entry name
  const protOf = (t) => {
    const u = t.toUpperCase(),
      a = u.replace(/-\d+$/, '');
    return byGene[u] || (byAcc[a] ? [byAcc[a]] : byEntry[u] ? [byEntry[u]] : null);
  };
  const byGene = {};
  P.forEach((p) =>
    String(p.gene || '')
      .split(/[\s;]+/)
      .filter(Boolean)
      .forEach((g) => {
        (byGene[g.toUpperCase()] ||= []).push(p);
      })
  );
  // other names: the aliases of the site's protein_values table (synonyms, the symbols the sources used), the names
  // papers use (website.search.shorthand: H4), and any of these, or a gene, without hyphens, spaces and dots
  // (TDP-43, hnRNP A1)
  const SRCH = D.search || {};
  const norm = (x) =>
    String(x || '')
      .toUpperCase()
      .replace(/[-\s._/]/g, '');
  const byAlias = {},
    byNorm = {},
    aliasesOf = {};
  const addTo = (map, k, p) => {
    if (!k) return;
    const l = (map[k] ||= []);
    if (!l.includes(p)) l.push(p);
  };
  P.forEach((p) =>
    String(p.gene || '')
      .split(/[\s;]+/)
      .filter(Boolean)
      .forEach((g) => {
        if (norm(g).length >= 3) addTo(byNorm, norm(g), p);
      })
  );
  Object.entries(D.protein_aliases || {}).forEach(([acc, al]) => {
    const p = byAcc[acc];
    if (!p) return;
    aliasesOf[p.i] = String(al).split(/;\s*/).filter(Boolean);
    aliasesOf[p.i].forEach((a) => {
      if (!byGene[a.toUpperCase()]) addTo(byAlias, a.toUpperCase(), p);
      if (norm(a).length >= 3) addTo(byNorm, norm(a), p);
    });
  });
  Object.entries(SRCH.shorthand || {}).forEach(([n, acc]) => {
    const p = byAcc[acc];
    if (p && !byGene[n.toUpperCase()]) {
      byAlias[n.toUpperCase()] = [p];
      (aliasesOf[p.i] ||= []).push(n);
    }
  });
  // a name: the protein(s) it names, and whether by another name than the gene, accession or entry name
  const lookup = (t) => {
    const ex = protOf(t);
    if (ex) return { ps: ex, via: false };
    const u = String(t).toUpperCase(),
      al = byAlias[u] || (norm(u).length >= 3 ? byNorm[norm(u)] : null);
    return al ? { ps: al, via: true } : null;
  };
  const nameOf = (p) => (p.gene ? String(p.gene).split(/[\s;]+/)[0] : p.acc);
  // numbering as papers do (website.protein.numbering: histones without the initiator methionine): a position typed
  // in a search is read in it, as on the protein's page
  const NUMR = (D.protein_view?.numbering || []).map((n) => ({
    ...n,
    g: n.genes ? new RegExp(n.genes) : null,
    nm: n.names ? new RegExp(n.names, 'i') : null,
  }));
  const numOf = (p) => {
    if (!NUMR.length) return null;
    if (p._num === undefined) {
      const g = String(p.gene || '').split(/[\s;,]+/)[0];
      p._num = NUMR.find((n) => (g ? n.g?.test(g) : n.nm?.test(p.name || ''))) || null;
    }
    return p._num;
  };
  const uniPos = (p, typed) => typed - (numOf(p)?.offset || 0);
  // symbols one edit away from a word (a letter added, dropped, changed, or two swapped), most marks first: "did you mean"
  function nearSymbols(word, max = 3) {
    const w = String(word).toUpperCase();
    if (w.length < 3 || /\d{3,}/.test(w)) return [];
    const one = (a, b) => {
      if (a === b || Math.abs(a.length - b.length) > 1) return false;
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      if (a.length === b.length)
        return (
          a.slice(i + 1) === b.slice(i + 1) ||
          (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
        );
      return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
    };
    return P.filter((p) => p.gene && one(w, nameOf(p).toUpperCase()))
      .sort((a, b) => b.marks - a.marks)
      .slice(0, max);
  }
  // a plain word names proteins by the start of a gene, accession or other name, or by part of a protein name
  const wordHits = (p, w) =>
    (p.gene || '').toLowerCase().startsWith(w) ||
    p.acc.toLowerCase().startsWith(w) ||
    (p.name || '').toLowerCase().includes(w) ||
    (aliasesOf[p.i] || []).some((a) => a.toLowerCase().startsWith(w));
  S.f = {}; // filter key -> [values]; keys a:<analysis>, p:<analysis>, s:<analysis>, t:<attribute>, n:<attribute>

  // ---- the data: every mark with its classes and attributes (data/selection.json, or inlined) ----------------------
  let SD = null;
  // each protein's marked positions, for reading "GENE 12" as a site only when 12 is one
  let markPos = null;
  const isMark = (pi, pos) => {
    if (!SD) return false;
    if (!markPos) {
      markPos = {};
      SD.marks.forEach((m) => {
        (markPos[m[0]] ||= new Set()).add(m[1]);
      });
    }
    return !!markPos[pi]?.has(pos);
  };
  // the one-file copy has it inline; the site's folder reads data/selection.json (10 MB) only when a search, a filter or
  // a page first asks for it (K.sel.data(), a selection in the address, the Filters tab), never to show the first screen
  const inlineSel = typeof document === 'undefined' ? null : document.getElementById('selection-data');
  if (inlineSel) {
    try {
      SD = JSON.parse(inlineSel.textContent);
    } catch (e) {
      /* fall back to the file */
    }
  }
  let loading = null;
  const ready = () =>
    (loading ||= SD
      ? Promise.resolve(SD)
      : fetch('data/selection.json')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then(
            (d) => {
              SD = d;
              prepare();
              return d;
            },
            () => null
          )
          .then((d) => {
            if (d) K.render();
            return d;
          }));
  const need = () => {
    if (!SD && !loading) ready();
  };
  const AN = () => SD.analyses,
    AT = () => SD.attribute_names || Object.keys(SD.attributes);
  let setMembers = {},
    anyMembers = {}; // analysis -> set name -> Set(protein index); analysis -> in any of its source's sets
  // a question whose sets hold other identifiers (genes; ps.of: protein index -> its identifiers' indices) counts
  // those: a group of proteins is the set of their identifiers
  const unitsOf = (ps, prots) => (ps.of ? new Set([...prots].flatMap((p) => ps.of[p] || [])) : new Set(prots));
  function prepare() {
    setMembers = {};
    for (const [aid, ps] of Object.entries(SD.protein_sets || {})) {
      const holders = {}; // identifier index -> the marked proteins that map to it
      if (ps.of) Object.entries(ps.of).forEach(([p, us]) => us.forEach((u) => (holders[u] ||= []).push(+p)));
      setMembers[aid] = Object.fromEntries(
        ps.sets.map(([s, , m]) => [s, new Set(ps.of ? m.flatMap((u) => holders[u] || []) : m)])
      );
      (ps.more || []).forEach(([s, m]) => {
        setMembers[aid][s] = new Set(m);
      }); // offered by the filter, not tested
      anyMembers[aid] = new Set(ps.of ? ps.in_background.flatMap((u) => holders[u] || []) : ps.any || ps.in_background);
    }
    // each mark's longer window, for the motif finder (website.search.patterns), and its index
    SD.marks.forEach((m, i) => {
      m.ix = i;
      if (SD.wide) m.w = SD.wide.w[i];
    });
    SD.numbers = {};
    AT().forEach((k) => {
      if (SPECS[k]?.kind === 'number') SD.numbers[k] = SD.attributes[k].map(Number);
    });
  }
  if (SD) prepare();

  // ---- labels ------------------------------------------------------------------------------------------------------
  const classLabel = (aid, c) => (A[aid]?.labels || {})[c] || String(c).replace(/_/g, ' ');
  const valueLabel = (attr, v) => (SPECS[attr]?.values || {})[v] ?? (v === '' ? 'none' : v);
  // a list attribute's values as links: a database to its own record of the protein (records, {acc}), else each value
  // to its paper (link); the first three, and the rest named in the "+n" tooltip unless full
  const isPapers = (attr) => /pubmed/i.test(SPECS[attr]?.link?.url || '');
  function listHtml(attr, vals, ids, acc, full) {
    const s = SPECS[attr] || {},
      item = (v, i) => {
        const lab = valueLabel(attr, v),
          rec = s.records?.[v],
          id = ids?.[i];
        if (rec && acc)
          return `<a href="${esc(rec.replace('{acc}', encodeURIComponent(acc)))}" title="${esc(
            `${lab}: its record of ${acc}${id ? `; its paper: ${id}` : ''}`
          )}">${esc(lab)}</a>`;
        if (s.link && id) {
          const pl = K.papers.ids(id); // one paper, or several ("123;456", "123, 456"): a link each, a long list collapsed
          if (pl.length > 1) return `${esc(lab)} (${K.papers.links(pl, { url: s.link.url })})`;
          return `<a href="${esc(s.link.url.replace('{}', encodeURIComponent(pl[0] || id)))}" title="${esc(`${lab}: ${id}`)}">${esc(lab)}</a>`;
        }
        return esc(lab);
      };
    const all = vals.filter(Boolean);
    // a list of papers (the attribute links to PubMed): one link each, and "N papers" opens the list when it is long
    if (isPapers(attr) && all.length > 3)
      return K.papers.links(K.papers.ids(all.map((v, i) => (ids?.[i] ? ids[i] : v))), { url: s.link.url });
    const shown = full ? all : all.slice(0, 3),
      rest = all.slice(shown.length).map((v) => valueLabel(attr, v));
    return (
      shown.map(item).join(', ') +
        (rest.length ? ` <span class="muted" title="${esc(rest.join(', '))}">+${rest.length}</span>` : '') ||
      '<span class="muted">–</span>'
    );
  }
  // a protein-level filter (r:<name>): a protein attribute (proteins.attributes) or the protein's count of marks (marks)
  const PSPEC = D.protein_attributes?.specs || {};
  const RSPEC = (id) =>
    id === 'marks'
      ? { label: `Minimum ${W.marks} per protein`, kind: 'number', levels: [2, 3, 5, 10, 20], direction: 'min' }
      : PSPEC[id];
  // a yes/no attribute (its spec has `flag`, the value that means yes: proteins.attributes or marks.attributes) reads as a plain
  // term: its label is the chip and its query word (spec.query, else its name) the search text, with no value. key:true, as
  // older links and the search wrote it, is still read, never shown. FLAGQ: query word (lower case) -> its attribute.
  const FLAGQ = {};
  [
    ['t', SPECS],
    ['r', PSPEC],
  ].forEach(([kind, specs]) =>
    Object.entries(specs).forEach(([id, sp]) => {
      if (sp?.flag)
        FLAGQ[String(sp.query || id).toLowerCase()] ||= {
          id,
          key: `${kind}:${id}`,
          yes: String(sp.flag),
          query: String(sp.query || id),
        };
    })
  );
  // a search as typed or linked, with each old-form flag term (als_ftd_gene:true) as its query word (als_ftd)
  const canonQ = (q) =>
    Object.keys(FLAGQ).length
      ? String(q || '')
          .split(/(\s+)/)
          .map((t) => {
            const m = /^([a-z_][\w]*):"?([^"]*)"?$/i.exec(t),
              id = m && (FLAGQ[m[1].toLowerCase()] || Object.values(FLAGQ).find((f) => f.id === m[1].toLowerCase()));
            return id && m[2].toLowerCase() === id.yes.toLowerCase() ? id.query : t;
          })
          .join('')
      : String(q || '');
  const flagOf = (key) => {
    const [kind, id] = String(key).split(':'),
      sp = kind === 'r' ? PSPEC[id] : kind === 't' ? SPECS[id] : null;
    return sp?.flag ? { label: sp.label || id, yes: String(sp.flag), query: sp.query || id } : null;
  };
  // a filter on a yes/no attribute in words: its label ("Not ..." for the no value); null for any other filter
  const flagPhrase = (key, vals) => {
    const f = flagOf(key);
    return f && vals.length === 1 ? (vals[0] === f.yes ? f.label : `Not ${f.label}`) : null;
  };
  const protVal = (id, pi) => (id === 'marks' ? D.proteins[pi]?.[4] : D.protein_attributes?.values?.[id]?.[pi]);
  const rHolds = (id, pi, v) => {
    const sp = RSPEC(id) || {},
      x = protVal(id, pi);
    if (x == null || x === '') return false;
    if (sp.kind !== 'number')
      return String(x)
        .split(sp.separator || '; ')
        .includes(v);
    const ok = sp.direction === 'max' ? x <= +v : x >= +v;
    if (!ok) return false;
    const also = sp.also;
    if (!also) return true;
    const y = protVal(also.attribute, pi);
    return y != null && (also.min == null || y >= also.min) && (also.max == null || y <= also.max);
  };
  const keyName = (key) => {
    if (key.startsWith('r:')) return RSPEC(key.slice(2))?.label || key.slice(2);
    const [kind, id] = key.split(':');
    if (K.filterKinds?.[kind]?.label) return K.filterKinds[kind].label(id);
    if (kind === 'm')
      return id === 'near' ? `Motif within ±${SD?.wide?.span ?? SRCH.patterns?.span ?? 15}` : `Motif at the ${W.mark}`;
    if (kind === 'x') return (SRCH.terms || {})[id]?.label || cap(id);
    return kind === 't' || kind === 'n'
      ? SPECS[id]?.label || id
      : kind === 's'
        ? A[id]?.scores?.label || id
        : A[id]?.title || id;
  };
  // a protein-set filter: its set (or * for any of its source's sets) and, with a score filter on it (s:<analysis>, a
  // threshold), the memberships scored at least that instead
  const scoreOf = (aid, s, p) => {
    const sc = SD.protein_sets?.[aid]?.scores;
    return sc ? (s === '*' ? sc.any : sc.sets[s] || {})[p] : undefined;
  };
  const inSet = (aid, s, p, t) =>
    t == null
      ? !!(s === '*' ? anyMembers[aid] : setMembers[aid]?.[s])?.has(p)
      : (s !== '*' || !!anyMembers[aid]?.has(p)) && scoreOf(aid, s, p) >= t;
  const scoreText = (id, v) => {
    const sc = A[id]?.scores || {};
    return `${+v === sc.max ? '' : '≥ '}${v}${sc.max != null ? ` of ${sc.max}` : ''}`;
  };
  function valueName(key, v) {
    const [kind, id] = key.split(':');
    if (K.filterKinds?.[kind]?.value) return K.filterKinds[kind].value(id, v);
    if (kind === 'm' || kind === 'x') return v;
    if (kind === 'r') {
      const sp = RSPEC(id) || {};
      return sp.kind === 'number' ? `${sp.direction === 'max' ? '≤' : 'at least'} ${v}` : (sp.values || {})[v] || v;
    }
    if (kind === 's') return scoreText(id, v);
    if (kind === 'p' && v === '*') return A[id]?.filter?.any || 'in any set';
    if (kind === 'a') return classLabel(id, v);
    if (kind === 't') return valueLabel(id, v);
    if (kind === 'n') return `at least ${v}`;
    return (A[id]?.labels || {})[v] || v;
  }

  // a module may add a kind of filter (K.filterKinds[kind]: valid(id), test(id, values) -> mark -> bool), as kit-counts.js does
  const validKey = (key) => {
    const [kind, id] = String(key).split(':');
    if (kind === 'r') return !!RSPEC(id);
    if (kind === 'm') return !!SRCH.patterns?.[id];
    if (kind === 'x') return !!(SRCH.terms || {})[id];
    return (
      (kind === 'a' && A[id] && A[id].kind !== 'protein_sets' && !A[id].page) ||
      !!K.filterKinds?.[kind]?.valid(id) ||
      (kind === 'p' && A[id]?.kind === 'protein_sets') ||
      (kind === 's' && !!A[id]?.scores) ||
      ((kind === 't' || kind === 'n') && !!SPECS[id])
    );
  };

  // ---- the search: proteins, sites and terms ---------------------------------------------------------------------
  // a gene, accession, entry name or other name names all its marks; "GENE <site> <site>", "GENE 216", "GENE:R216",
  // "GENE_216", "GENE-R216" or one word "H4R3" name those marks (in the protein's own numbering, as its page shows it);
  // a name written as two words ("hnRNP A1") is one; key:value terms filter (values joined by commas or |). A list of
  // proteins is their union: a name in it with no marked protein is reported (absent), not applied. Without any
  // protein named, other words narrow by name; a word that matches nothing is reported, not silently applied. What
  // the search read is kept for the line under it: names matched by another name (via), sites with no mark
  // (missing), positions read in a protein's own numbering (numbered), and symbols one edit from a word (typos).
  const RESIDUES = new Set((D.residues || []).map((r) => String(r).toUpperCase()));
  const POS_RE = /^[A-Z]?\d+[,;]?$/i,
    VAR_RE = /^([A-Z])(\d+)([A-Z*])[,;]?$/i; // a position (R216) or a variant (R216C, R216*)
  const isTermKey = (k) => {
    const key = String(k).toLowerCase();
    return !!(
      A[key] ||
      SPECS[key] ||
      PSPEC[key] ||
      ALIAS[key] ||
      FLAGQ[key] ||
      (SRCH.terms || {})[key] ||
      (SRCH.patterns && (SRCH.patterns.at === key || SRCH.patterns.near === key)) ||
      K.searchTerms?.[key]
    );
  };
  function parse(q) {
    const out = {
      genes: [],
      words: [],
      sites: [],
      terms: [],
      unmatched: [],
      absent: [],
      ignored: [],
      ambiguous: [],
      via: [],
      missing: [],
      numbered: [],
      typos: {},
      variants: [],
      positions: [],
      nWords: 0,
      nNamed: 0,
    };
    const raw = String(q || '').trim();
    const toks = raw.match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || [];
    // a site of the protein(s) a name gave: each reads the position in its own numbering
    const addSite = (ps, typed, letter) => {
      let any = false;
      ps.forEach((p) => {
        const u = uniPos(p, typed);
        out.sites.push([p.i, u]);
        if (isMark(p.i, u)) any = true;
        if (numOf(p) && !out.numbered.some((x) => x[0] === nameOf(p)))
          out.numbered.push([nameOf(p), `${letter}${typed}`, `${letter}${u}`, numOf(p)]);
      });
      if (SD && !any)
        out.missing.push(`${nameOf(ps[0])} ${letter || (RESIDUES.size === 1 ? [...RESIDUES][0] : '')}${typed}`);
    };
    const named = (tok, l) => {
      if (l.via) out.via.push([tok, l.ps.map(nameOf)]);
      out.nNamed++;
    };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].replace(/[,;]+$/, ''),
        m = /^([a-z_][\w]*):(.+)$/i.exec(t);
      if (!t) continue;
      if (m && !isTermKey(m[1])) {
        // GENE:R216 is a site, not a term
        const l = lookup(m[1]),
          s = /^([A-Z]?)(\d+)$/i.exec(m[2]);
        if (l && s) {
          out.nWords++;
          named(m[1], l);
          addSite(l.ps, +s[2], s[1].toUpperCase());
          continue;
        }
      }
      if (m) {
        out.terms.push([m[1].toLowerCase(), m[2].replace(/^"|"$/g, '')]);
        continue;
      }
      const fq = FLAGQ[t.toLowerCase()]; // a yes/no attribute's query word alone (als), unless it names a protein
      if (fq && !lookup(t)) {
        out.terms.push([t.toLowerCase(), fq.yes, true]);
        continue;
      }
      out.nWords++;
      let l = lookup(t);
      if (!l && i + 1 < toks.length && !toks[i + 1].includes(':')) {
        // a name in two words (hnRNP A1)
        const l2 = lookup(t + toks[i + 1].replace(/[,;]+$/, ''));
        if (l2) {
          named(t + ' ' + toks[i + 1], { ...l2, via: true });
          l2.ps.forEach((p) => out.genes.push(p.i));
          i++;
          continue;
        }
      }
      if (l) {
        named(t, l);
        let j = i + 1,
          any = false;
        while (
          j < toks.length &&
          (POS_RE.test(toks[j]) || (VAR_RE.test(toks[j]) && RESIDUES.has(toks[j][0].toUpperCase())))
        ) {
          // a token that is also a protein's name (F12) is that protein, unless it is a mark of the one before it
          const tok = toks[j].replace(/[,;]+$/, ''),
            pos = +tok.replace(/\D/g, ''),
            other = protOf(tok),
            vm = VAR_RE.exec(tok);
          if (vm) out.variants.push([nameOf(l.ps[0]), vm[1].toUpperCase(), pos, vm[3].toUpperCase()]);
          if (other) {
            if (!l.ps.some((p) => isMark(p.i, uniPos(p, pos)))) break;
            out.ambiguous.push([tok, nameOf(l.ps[0])]);
          }
          addSite(l.ps, pos, /^[A-Z]/i.test(tok) ? tok[0].toUpperCase() : '');
          any = true;
          j++;
          out.nWords++;
        }
        if (!any) l.ps.forEach((p) => out.genes.push(p.i));
        i = j - 1;
        continue;
      }
      const sep = /^(.+?)[_/-]([A-Z]?)(\d+)$/i.exec(t),
        ls = sep && lookup(sep[1]); // GENE_216, GENE-R216, GENE/216
      if (ls) {
        named(sep[1], ls);
        addSite(ls.ps, +sep[3], sep[2].toUpperCase());
        continue;
      }
      const one = /^(.+?)([A-Z])(\d+)$/i.exec(t),
        lo = one && RESIDUES.has(one[2].toUpperCase()) && lookup(one[1]); // H4R3
      if (lo) {
        named(one[1], lo);
        addSite(lo.ps, +one[3], one[2].toUpperCase());
        continue;
      }
      const vb = VAR_RE.exec(t); // R216C with no protein: that position in any protein; the change is not searched
      if (vb && RESIDUES.has(vb[1].toUpperCase())) {
        out.positions.push([vb[1].toUpperCase(), +vb[2], vb[3].toUpperCase()]);
        continue;
      }
      const w = t.toLowerCase();
      if (P.some((p) => wordHits(p, w))) out.words.push(w);
      else out.unmatched.push(t);
    }
    // a list that names proteins: its other plain words are names with no marked protein, not filters on the names
    if (out.genes.length || out.sites.length) {
      const orig = (w) => toks.find((t) => t.toLowerCase() === w) || w;
      out.ignored = out.words.map(orig);
      out.absent = out.unmatched;
      out.words = [];
      out.unmatched = [];
    }
    [...out.unmatched, ...out.absent].forEach((w) => {
      const n = nearSymbols(w);
      if (n.length) out.typos[w] = n.map((p) => [p.i, nameOf(p)]);
    });
    return out;
  }
  // a term key:value: an analysis (its class or set), or an attribute of the marks or of the proteins; a word of the
  // site's own (website.search.terms: go:rna), read first; a pattern of residues (website.search.patterns: motif:<pattern>
  // covering the mark, window:PRPR anywhere near it); or a module's (K.searchTerms). [filter key, values], or
  // {error} saying why it cannot be read
  // an older site's search keys, read as this site's (website.search_aliases: disease -> disease_family)
  const ALIAS = Object.fromEntries(Object.entries(D.search_aliases || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const PAT = SRCH.patterns || null;
  // a pattern: residues, X . * or ? for any residue, [ST] for a choice; 2 to 10 positions
  const AA = 'ACDEFGHIKLMNPQRSTVWY',
    patCache = {};
  function parsePattern(raw) {
    const s0 = String(raw || '')
      .toUpperCase()
      .replace(/\s+/g, '');
    if (patCache[s0]) return patCache[s0];
    const toks = [];
    let error = null;
    for (let k = 0; k < s0.length && !error; k++) {
      const c = s0[k];
      if (c === '[') {
        const e = s0.indexOf(']', k),
          set = e < 0 ? '' : s0.slice(k + 1, e);
        if (e < 0) error = 'Close the [ … ] group.';
        else if (!set || [...set].some((x) => !AA.includes(x)))
          error = 'Inside [ ] list residue letters only, e.g. [ST].';
        else {
          toks.push(set);
          k = e;
        }
      } else if ('X.*?'.includes(c)) toks.push(null);
      else if (AA.includes(c)) toks.push(c);
      else error = `“${c}” is not a residue letter or a wildcard.`;
    }
    if (!error && (toks.length < 2 || toks.length > 10)) error = 'Use 2 to 10 residues (each [ ] group counts as one).';
    return (patCache[s0] = error ? { error } : { toks, text: s0 });
  }
  // does a window (the mark at its center) hold the pattern: covering the mark (at) or anywhere in it (near)
  function patternHit(win, pat, where) {
    if (!win) return false;
    const c = (win.length - 1) / 2,
      ok = (st) =>
        st >= 0 &&
        pat.toks.every((tk, i) => {
          const ch = win[st + i];
          return ch && ch !== '-' && ch !== '_' && (tk === null || tk.includes(ch));
        });
    if (where === 'near') {
      for (let st = 0; st + pat.toks.length <= win.length; st++) if (ok(st)) return true;
      return false;
    }
    return pat.toks.some((tk, i) => (tk === null || tk.includes(win[c])) && ok(c - i));
  }
  const patterns = (key, vals) => {
    const bad = vals.map(parsePattern).find((x) => x.error);
    return bad
      ? { error: `${key}:${vals.join(',')}: ${bad.error}` }
      : [key === PAT.near ? 'm:near' : 'm:at', vals.map((v) => parsePattern(v).text)];
  };
  const TERMS = SRCH.terms || {};
  function termFilter([key0, val]) {
    const key = FLAGQ[key0]?.id || ALIAS[key0] || key0;
    const vals = val
        .split(/[|,]/)
        .map((v) => v.trim())
        .filter(Boolean),
      low = (v) => String(v).toLowerCase();
    const T = TERMS[key0];
    if (T && vals.some((v) => T.values[low(v)])) {
      const bad = vals.filter((v) => !T.values[low(v)]);
      return bad.length
        ? { error: `${key0}: no value ${bad.join(', ')} (${Object.keys(T.values).join(', ')})` }
        : ['x:' + key0, vals.map(low)];
    }
    if (PAT && key0 === PAT.near) return patterns(key0, vals);
    if (K.searchTerms?.[key0]) return K.searchTerms[key0](vals);
    if (A[key] && SD && A[key].kind !== 'protein_sets' && !A[key].page) {
      const codes = SD.classes[key] || [];
      // an exact code or label first; a prefix only when nothing matches exactly
      const each = vals.map((v) => {
        const ex = codes.filter((c) => low(c) === low(v) || low(classLabel(key, c)) === low(v));
        return ex.length
          ? ex
          : codes.filter((c) => low(c).startsWith(low(v)) || low(classLabel(key, c)).startsWith(low(v)));
      });
      // motif:<pattern>: a value that is no class is a pattern, when the site's motif finder reads this key
      if (PAT && key0 === PAT.at && each.some((x) => !x.length)) return patterns(key0, vals);
      return ['a:' + key, each.flat()];
    }
    if (PAT && key0 === PAT.at) return patterns(key0, vals);
    if (A[key] && SD && A[key].kind === 'protein_sets') {
      const names = Object.keys(setMembers[key] || {});
      // a set by its name or label: exactly, else every set where a word begins with it ("ALS" for "ALS / motor neuron / FTD")
      const lab = (s) => low((A[key].labels || {})[s] || ''),
        at = (v) => new RegExp('(^|[^a-z0-9])' + low(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return [
        'p:' + key,
        vals.flatMap((v) => {
          const ex = names.filter((s) => low(s) === low(v) || lab(s) === low(v));
          return ex.length ? ex : names.filter((s) => at(v).test(low(s)) || at(v).test(lab(s)));
        }),
      ];
    }
    if (SPECS[key] && SD) {
      if (SPECS[key].kind === 'number') return ['n:' + key, [vals[0]]];
      return [
        't:' + key,
        vals.flatMap((v) =>
          SD.attributes[key].filter((x) => low(x) === low(v) || low(valueLabel(key, x)).includes(low(v)))
        ),
      ];
    }
    if (PSPEC[key]) {
      // an attribute of the proteins
      if (PSPEC[key].kind === 'number') return ['r:' + key, [vals[0]]];
      const all = [
        ...new Set(
          (D.protein_attributes?.values?.[key] || [])
            .flatMap((x) => String(x || '').split(PSPEC[key].separator || '; '))
            .filter(Boolean)
        ),
      ];
      return [
        'r:' + key,
        vals.flatMap((v) =>
          all.filter((x) => low(x) === low(v) || low((PSPEC[key].values || {})[x] || '').includes(low(v)))
        ),
      ];
    }
    return null;
  }
  // a term as typed: key:value, or the query word alone for a yes/no attribute
  const rawOf = (t) => (t[2] ? t[0] : `${t[0]}:${t[1]}`);
  // every constraint of a search and filters: [key, values, from the search?]; terms that match nothing are kept
  // aside, to be reported (unresolved), with what was wrong when it can say (errors)
  function constraintsOf(qText, f) {
    const out = Object.entries(f || {})
        .filter(([k, v]) => v && v.length && validKey(k))
        .map(([k, v]) => [k, v, false]),
      unresolved = [],
      errors = [];
    if (SD)
      parse(qText).terms.forEach((t) => {
        const r = termFilter(t);
        if (r && !r.error && r[1].length) out.push([r[0], r[1], true, rawOf(t)]);
        else {
          unresolved.push(rawOf(t));
          if (r?.error) errors.push(r.error);
        }
      });
    return { cons: out, unresolved, errors };
  }

  // ---- which marks pass ------------------------------------------------------------------------------------------
  // select(q, f): the marks a search and filters select, without touching the page's own state (a saved selection
  // can be evaluated beside the current one); compute() is the current selection, cached
  // one constraint as a test of a mark (cons: every constraint, for a threshold that applies to another)
  function testOf(key, vals, cons) {
    const [kind, id] = key.split(':');
    if (kind === 'a') {
      const ai = AN().indexOf(id),
        codes = new Set(vals.map((v) => SD.classes[id].indexOf(v)));
      return (m) => m[2][ai].some((c) => codes.has(c));
    }
    const min = cons.find(([k]) => k === 's:' + id)?.[1][0],
      t = min == null ? null : +min;
    if (kind === 'p') return (m) => vals.some((v) => inSet(id, v, m[0], t));
    if (kind === 's') return cons.some(([k]) => k === 'p:' + id) ? () => true : (m) => scoreOf(id, '*', m[0]) >= t; // with a set: applied there
    if (kind === 't') {
      const ti = AT().indexOf(id),
        codes = new Set(vals.map((v) => SD.attributes[id].indexOf(v)));
      return (m) => m[3][ti].some((c) => codes.has(c));
    }
    if (kind === 'n') {
      const ti = AT().indexOf(id),
        min = +vals[0],
        num = SD.numbers[id];
      return (m) => m[3][ti].some((c) => num[c] >= min);
    }
    if (kind === 'r') return (m) => vals.some((v) => rHolds(id, m[0], v));
    if (kind === 'm') {
      const pats = vals.map(parsePattern).filter((x) => !x.error);
      return (m) => pats.some((pt) => patternHit(m.w || m[4], pt, id));
    }
    if (kind === 'x') {
      // a word of the site's own: each its filters, all holding
      const T = TERMS[id],
        each = vals.map((v) =>
          Object.entries(T?.values?.[v] || {})
            .filter(([k]) => validKey(k))
            .map(([k, vs]) => testOf(k, vs, cons))
        );
      return (m) => each.some((ts) => ts.length && ts.every((f) => f(m)));
    }
    if (K.filterKinds?.[kind]) return K.filterKinds[kind].test(id, vals, cons);
    return () => true;
  }
  // a search and filters as tests: base(m), what the search names (words, genes, sites), and one test per constraint
  function matcher(qText, f) {
    const q = parse(qText),
      { cons, unresolved, errors } = constraintsOf(qText, f);
    // proteins named by the search (a gene or accession names all its marks; "GENE <site>" names one mark)
    const genes = new Set(q.genes),
      sites = new Set(q.sites.map(([p, pos]) => p + ':' + pos)),
      named = genes.size || sites.size || q.positions.length,
      posSet = new Set(q.positions.map((x) => x[1]));
    const protOk = P.map((p) => !q.words.length || q.words.every((w) => wordHits(p, w)));
    const base = (m) => protOk[m[0]] && (!named || genes.has(m[0]) || sites.has(m[0] + ':' + m[1]) || posSet.has(m[1]));
    const tests = cons.map(([key, vals]) => testOf(key, vals, cons));
    return { q, cons, unresolved, errors, base, tests };
  }
  function select(qText, f) {
    const M = SD ? matcher(qText, f) : null,
      q = M ? M.q : parse(qText),
      { cons, unresolved, errors } = M || constraintsOf(qText, f);
    const active = !!(
      q.genes.length ||
      q.words.length ||
      q.sites.length ||
      q.positions.length ||
      cons.length ||
      q.unmatched.length ||
      unresolved.length
    );
    let marks = null,
      proteins = null;
    if (SD && active) {
      marks = [];
      SD.marks.forEach((m, i) => {
        if (M.base(m) && M.tests.every((t) => t(m))) marks.push(i);
      });
      proteins = new Set(marks.map((i) => SD.marks[i][0]));
    }
    // every part of a search must hold: a word or a term that matches nothing leaves no marks, as nothing can match all
    // of it (the bar says which); in a list of proteins, a name with no marked protein is reported and the rest kept
    if (
      SD &&
      active &&
      (q.unmatched.length ||
        unresolved.length ||
        (!q.genes.length && !q.words.length && !q.sites.length && !q.positions.length && !cons.length))
    ) {
      marks = [];
      proteins = new Set();
    }
    return { active, marks, proteins, cons, q, unresolved, errors };
  }
  let cache = { key: null };
  // gen: data a module read later (a filter's own file) changes what a selection holds
  let gen = 0;
  const refresh = () => {
    gen++;
    K.render();
  };
  const stateKey = () => JSON.stringify([S.q, S.f, !!SD, gen]);
  function compute() {
    if (!SD && (S.q || Object.keys(S.f).length)) need(); // a selection needs the marks
    if (cache.key === stateKey()) return cache;
    cache = { key: stateKey(), ...select(S.q, S.f), retests: {} };
    return cache;
  }
  const active = () => compute().active;
  const testable = () => {
    const c = compute();
    return !c.active || (c.proteins && c.proteins.size >= SEL_MIN.proteins && c.marks.length >= SEL_MIN.marks);
  };
  const rolesOf = (aid) => new Set([aid, ...(A[aid]?.roles || []).map((r) => 'role:' + r)]);
  const madeWith = (aid) => {
    const mine = rolesOf(aid);
    return compute().cons.some(([k]) => {
      const id = k.split(':')[1];
      return [...rolesOf(id)].some((x) => mine.has(x));
    });
  };
  // How a question (aid) is held by the selection's own filters: all (a filter on another question reading the same data, or
  // any set of it): the whole question is shown, not tested; sets: the classes or sets the selection itself filters on
  // (its own filter on this question, or a module's filter kind that names them with owned(id, values) -> [[question, set]]).
  // Only those are left out of the retest; every other class is tested on the selection as for any other selection.
  const ownSets = (aid) => {
    const mine = rolesOf(aid),
      sets = new Set();
    let all = false;
    for (const [k, vals] of compute().cons) {
      const [kind, id] = k.split(':'),
        owned = K.filterKinds?.[kind]?.owned;
      if (owned) {
        owned(id, vals).forEach(([a, s]) => a === aid && sets.add(s));
      } else if ((kind === 'p' || kind === 'a') && id === aid) {
        vals.forEach((v) => (v === '*' ? (all = true) : sets.add(v)));
      } else if ([...rolesOf(id)].some((x) => mine.has(x))) all = true;
    }
    return { all, sets };
  };
  const nMarks = () => (active() ? (compute().marks || []).length : D.counts.marks);
  const nProteins = () => (active() ? (compute().proteins || new Set()).size : D.counts.proteins);
  const protSelected = (acc) => !active() || (compute().proteins && compute().proteins.has(byAcc[acc]?.i));
  // per protein, the positions of its selected marks
  function selectedPositions(acc) {
    if (!active() || !SD) return null;
    const pi = byAcc[acc]?.i,
      out = new Set();
    (compute().marks || []).forEach((i) => {
      if (SD.marks[i][0] === pi) out.add(SD.marks[i][1]);
    });
    return out;
  }
  function selectedCountByProtein() {
    const out = {};
    (compute().marks || []).forEach((i) => {
      const p = SD.marks[i][0];
      out[p] = (out[p] || 0) + 1;
    });
    return out;
  }

  // what of the residue itself the selection was chosen by (a residue question's class, a motif, other marks or sites
  // nearby): the other residues it is tested against were not chosen that way, so a question reading the same or a
  // related feature partly restates the choice. Their names, for the page's caveat
  function residueFeatures() {
    if (!active()) return [];
    const names = compute()
      .cons.filter(([k]) => {
        const [kind, id] = k.split(':');
        return (kind === 'a' && A[id] && A[id].kind !== 'protein_sets') || ['m', 'o', 'd'].includes(kind);
      })
      .map(([k]) => keyName(k));
    return [...new Set(names)];
  }
  // ---- the tests again, on the selection -------------------------------------------------------------------------
  const exclusiveOf = {};
  const exclusive = (aid) => {
    if (!(aid in exclusiveOf)) {
      const ai = AN().indexOf(aid);
      exclusiveOf[aid] = ai >= 0 && SD.marks.every((m) => m[2][ai].length <= 1);
    }
    return exclusiveOf[aid];
  };
  function residueRows(aid, method) {
    const ai = AN().indexOf(aid);
    if (ai < 0) return [];
    const codes = SD.classes[aid],
      others = SD.others[aid] || {},
      cnt = SD.counted?.[aid],
      skip = new Set(cnt?.skip || []);
    // a question of several tests: each class counts its own candidates (SD.by_test[aid][class][protein]: its other
    // candidates, and the positions of the marks it does not count); every_candidate counts proteins without others too
    const own = SD.by_test?.[aid],
      every = (D.analyses.find((x) => x.id === aid) || {}).counting === 'every_candidate';
    // a flag tested among some residues only (a motif family's among: SD.among[aid][class] its letters): only the marks
    // of those residues count, against the protein's other candidates among them (SD.among_others[aid][letters][protein])
    const amongOf = SD.among?.[aid] || {},
      amongN = SD.among_others?.[aid] || {};
    const byProt = {},
      posOf = {},
      idxOf = {},
      resOf = {},
      listed = own?.outside === 'listed' ? new Set(cnt?.out || []) : null;
    compute().marks.forEach((i) => {
      const m = SD.marks[i];
      if (!skip.has(m[0]) && (own || SD.others_total[m[0]] > 0 || cnt?.alone)) {
        (byProt[m[0]] ||= []).push(m[2][ai]);
        (posOf[m[0]] ||= []).push(m[1]);
        (idxOf[m[0]] ||= []).push(i);
        if (SD.residues) (resOf[m[0]] ||= []).push(SD.residues[i]);
      }
    });
    const rows = codes
      .map((cat, ci) => {
        const tables = [];
        let a = 0,
          b = 0,
          c = 0,
          d = 0;
        const letters = amongOf[ci];
        for (const [p, all] of Object.entries(byProt)) {
          // a question counting some marks only (only_in, marks_where) gives one table for every class (own.all), and
          // the marks it does not count are those with no class in it
          const t = own ? (own[ci] || own.all || {})[p] : null;
          if (own && !t) continue;
          const ms = !t
            ? letters
              ? all.filter((x, k) => letters.includes(resOf[p][k]))
              : all
            : own.outside === 'unclassed'
              ? all.filter((x) => x.length)
              : listed // a flags question: the marks it leaves out are listed (counted.out), as no flag is not outside
                ? all.filter((x, k) => !listed.has(idxOf[p][k]))
                : all.filter((x, k) => !t[1].includes(posOf[p][k]));
          const ot = t ? t[0] : letters ? (amongN[letters] || {})[p] || 0 : SD.others_total[p],
            oin = (others[p] || {})[ci] || 0,
            ain = ms.filter((x) => x.includes(ci)).length;
          // a protein this class's test leaves without marks or without other candidates: no stratum; the pooled test
          // still counts its other candidates (c, d), the within-protein test only the proteins with both, as the run does
          if (t && !every && (!ot || !ms.length)) {
            if (ot && method === 'fisher') {
              c += oin;
              d += ot - oin;
            }
            continue;
          }
          tables.push([ain, ms.length - ain, oin, ot - oin]);
          a += ain;
          b += ms.length - ain;
          c += oin;
          d += ot - oin;
        }
        // a class absent from the selection's proteins is no test; the pooled test still counts it in BH (p = 1), as the
        // original explorer does
        if (!a && !c) return method === 'fisher' ? { absent: true, p: 1 } : null;
        const r =
          method === 'fisher'
            ? (() => {
                const f = ST.fisher(a, b, c, d);
                return { or: f.or, p: f.p, lo: null, hi: null, strata: null };
              })()
            : ST.mh(tables);
        return {
          analysis: aid,
          category: cat,
          a,
          b,
          c,
          d,
          or: r.or,
          lo: r.lo,
          hi: r.hi,
          p: r.p,
          strata: r.strata,
          method,
          selection: true,
        };
      })
      .filter(Boolean);
    // shown, not tested: a selection made with a question reading the same inputs, or one class holding every selected mark
    const n = Object.values(byProt).reduce((x, ms) => x + ms.length, 0);
    // a question whose classes exclude each other (no mark in two): a selection holding some of its classes fixes the
    // others too (none of its marks can be in them), so none is tested
    const held = ownSets(aid),
      isOwn = (r) => held.sets.has(r.category),
      circ =
        held.all || (held.sets.size > 0 && exclusive(aid)) || rows.some((r) => !r.absent && r.a === n && !isOwn(r));
    const tested = rows.filter((r) => !isOwn(r)),
      q = ST.bh(tested.map((r) => r.p));
    rows.forEach((r) => {
      const k = tested.indexOf(r);
      r.q = circ || k < 0 ? null : q[k];
      r.descriptive = circ || k < 0;
    });
    return rows.filter((r) => !r.absent);
  }
  function setRows(aid) {
    const ps = SD.protein_sets?.[aid];
    if (!ps) return [];
    const inBg = new Set(ps.in_background),
      sel = [...unitsOf(ps, compute().proteins)].filter((p) => inBg.has(p)),
      n = sel.length,
      N = ps.N;
    const selSet = new Set(sel);
    const rows = ps.sets
      .map(([s, M, members]) => {
        const k = members.reduce((x, p) => x + (selSet.has(p) ? 1 : 0), 0);
        if (!k) return null;
        return {
          analysis: aid,
          category: s,
          a: k,
          b: n - k,
          c: M - k,
          d: N - M - n + k,
          fold: k / n / (M / N),
          p: ST.hyperSF(k, N, M, n),
          method: 'enricher',
          selection: true,
        };
      })
      .filter(Boolean);
    // a selection that names its proteins (a gene list) is shown against the sets, not tested: its enrichment would
    // test the choice of genes, not the mark
    const named = compute().q.genes.length || compute().q.sites.length;
    const held = ownSets(aid),
      isOwn = (r) => held.sets.has(r.category),
      tested = rows.filter((r) => !isOwn(r)),
      q = ST.bh(tested.map((r) => r.p));
    rows.forEach((r) => {
      const k = tested.indexOf(r),
        circ = held.all || r.a === n || !!named || k < 0;
      r.q = circ ? null : q[k];
      r.descriptive = circ;
    });
    return rows;
  }
  // ---- the selection against other marks, not other residues -------------------------------------------------------
  // S.vs 'marks': the selection's marks against the site's other marks; S.vs 'cmp': against the marks of another
  // selection (S.cmp: its search and filters), the marks both hold left out of both. Each class of a question (an
  // attribute of the marks is a question too, id '@<name>') is compared between the two groups:
  //   fisher           pooled: Fisher's exact test, the Haldane odds ratio and Woolf's 95% CI
  //   mantel_haenszel  within each protein with marks in both groups (Mantel–Haenszel, RBG CI, CMH test)
  //   study            within studies: Mantel–Haenszel over the marks reported by exactly the same sources (the
  //                    attribute website.compare.stratify names), so a difference is not which studies report them
  // Protein sets: the selection's proteins against the other marked proteins of the background (hypergeometric), or
  // against the other selection's (Fisher). BH within each question and test.
  const MIN_SIDE = 10;
  const STUDY = (() => {
    const c = D.compare?.stratify;
    if (c && SPECS[c]) return c;
    return Object.keys(SPECS).find((n) => SPECS[n].provenance && SPECS[n].kind === 'list' && SPECS[n].link) || null;
  })();
  // a question's classes, each with its test on a mark: a residue question's, or an attribute's values (a number
  // attribute at 2, 3 and 5 or more)
  function featuresOf(qid) {
    if (qid[0] === '@') {
      const name = qid.slice(1),
        ti = AT().indexOf(name),
        sp = SPECS[name] || {};
      if (ti < 0) return [];
      if (sp.kind === 'number') {
        const nums = SD.numbers[name],
          max = Math.max(...nums.filter(Number.isFinite));
        return [2, 3, 5]
          .filter((t) => t <= max)
          .map((t) => ({ code: String(t), has: (m) => m[3][ti].some((c) => nums[c] >= t) }));
      }
      return SD.attributes[name]
        .map((v, ci) => ({ code: v, has: (m) => m[3][ti].includes(ci) }))
        .filter((f) => f.code !== '');
    }
    const ai = AN().indexOf(qid);
    if (ai < 0) return [];
    return SD.classes[qid].map((c, ci) => ({ code: c, has: (m) => m[2][ai].includes(ci) }));
  }
  // how many of the marks `ms` each of featuresOf(qid) holds, in one pass over them (not one pass for each feature); a
  // mark counts once for a class it lists twice, as `has` did
  function featureCounts(qid, ms) {
    const f = featuresOf(qid),
      n = new Array(f.length).fill(0);
    if (!f.length) return n; // a question with no features here (as featuresOf's empty list): nothing to count
    if (qid[0] === '@') {
      const name = qid.slice(1),
        ti = AT().indexOf(name),
        sp = SPECS[name] || {};
      if (ti < 0) return n;
      if (sp.kind === 'number') {
        const nums = SD.numbers[name],
          ts = f.map((x) => +x.code);
        for (const m of ms) {
          const cs = m[3][ti];
          ts.forEach((t, k) => {
            if (cs.some((c) => nums[c] >= t)) n[k]++;
          });
        }
        return n;
      }
      const at = new Map(f.map((x, k) => [SD.attributes[name].indexOf(x.code), k]));
      for (const m of ms) {
        const cs = m[3][ti];
        for (let j = 0; j < cs.length; j++) {
          const k = at.get(cs[j]);
          if (k !== undefined && cs.indexOf(cs[j]) === j) n[k]++;
        }
      }
      return n;
    }
    const ai = AN().indexOf(qid);
    if (ai < 0) return n;
    const at = new Map(f.map((x, k) => [SD.classes[qid].indexOf(x.code), k]));
    for (const m of ms) {
      const cs = m[2][ai];
      for (let j = 0; j < cs.length; j++) {
        const k = at.get(cs[j]);
        if (k !== undefined && cs.indexOf(cs[j]) === j) n[k]++;
      }
    }
    return n;
  }
  let studyOf = null; // mark index -> the set of sources that report it, as one key
  const studyKey = (i) => {
    if (!studyOf) {
      const ti = AT().indexOf(STUDY);
      studyOf = SD.marks.map((m) => (ti < 0 ? '' : [...m[3][ti]].sort((x, y) => x - y).join(',')));
    }
    return studyOf[i];
  };
  // the two groups: [group 1 (the selection), group 2, marks both hold, the constraints of both]
  function contrastPair() {
    const c = compute();
    if (!c.active || !SD || !c.marks) return null;
    if (S.vs === 'cmp') {
      const st = stateOfHash('?' + (S.cmp || '')),
        o = select(st.q, st.f),
        oth = o.active ? o.marks : SD.marks.map((_, i) => i);
      const in2 = new Set(oth),
        in1 = new Set(c.marks);
      return mixedOf({
        g1: c.marks.filter((i) => !in2.has(i)),
        g2: oth.filter((i) => !in1.has(i)),
        shared: c.marks.filter((i) => in2.has(i)).length,
        cons: [...c.cons, ...o.cons],
        other: o,
        otherState: st,
      });
    }
    const in1 = new Set(c.marks);
    return mixedOf({ g1: c.marks, g2: SD.marks.map((_, i) => i).filter((i) => !in1.has(i)), shared: 0, cons: c.cons });
  }
  // how many proteins have marks on both sides: a selection of whole proteins (a set, a gene list) has none, and then
  // no within-protein comparison can be made
  function mixedOf(G) {
    const p1 = new Set(G.g1.map((i) => SD.marks[i][0]));
    G.mixed = new Set(G.g2.map((i) => SD.marks[i][0]).filter((p) => p1.has(p))).size;
    return G;
  }
  const woolf = (a, b, c, d) => {
    const or = ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)),
      se = Math.sqrt(1 / (a + 0.5) + 1 / (b + 0.5) + 1 / (c + 0.5) + 1 / (d + 0.5));
    return [Math.exp(Math.log(or) - 1.959963984540054 * se), Math.exp(Math.log(or) + 1.959963984540054 * se)];
  };
  // circular: a question either selection was made with, or one reading the same inputs
  function circularFor(qid, cons) {
    const mine = qid[0] === '@' ? new Set(['t:' + qid.slice(1), 'n:' + qid.slice(1)]) : rolesOf(qid);
    return cons.some(([k]) => {
      const id = k.split(':')[1];
      return qid[0] === '@' ? mine.has(k) : [...rolesOf(id)].some((x) => mine.has(x));
    });
  }
  function contrastResidue(qid, method, G) {
    // marks the question counts: not on a protein it leaves out, and, for a question that counts only the residues inside
    // some regions (only_in) or a part of the marks (subset), only the marks inside them (those with a class)
    // (a flags question lists the marks it leaves out: counted.out, by index, as no flag is not outside)
    const skip = new Set(SD.counted?.[qid]?.skip || []),
      out = SD.counted?.[qid]?.out ? new Set(SD.counted[qid].out) : null,
      ri = !out && (A[qid]?.only_in || A[qid]?.subset) ? AN().indexOf(qid) : -1;
    const kept = (i) => !skip.has(SD.marks[i][0]) && (out ? !out.has(i) : ri < 0 || SD.marks[i][2][ri].length > 0);
    G = { ...G, g1: G.g1.filter(kept), g2: G.g2.filter(kept) };
    const m1 = G.g1.map((i) => SD.marks[i]),
      m2 = G.g2.map((i) => SD.marks[i]),
      n1 = m1.length,
      n2 = m2.length;
    let strata = null;
    if (method !== 'fisher') {
      const by = new Map(),
        keyOf = method === 'study' ? (i) => studyKey(i) : (i) => SD.marks[i][0];
      G.g1.forEach((i, k) => {
        const s = keyOf(i);
        (by.get(s) || by.set(s, [[], []]).get(s))[0].push(m1[k]);
      });
      G.g2.forEach((i, k) => {
        const s = keyOf(i);
        (by.get(s) || by.set(s, [[], []]).get(s))[1].push(m2[k]);
      });
      strata = [...by.values()].filter(([x, y]) => x.length && y.length);
    }
    const feats = featuresOf(qid),
      A1 = featureCounts(qid, m1),
      C1 = featureCounts(qid, m2);
    const SX = strata && strata.map(([x, y]) => [featureCounts(qid, x), x.length, featureCounts(qid, y), y.length]);
    const rows = feats
      .map((f, k) => {
        const a = A1[k],
          c = C1[k];
        if (!a && !c) return null;
        const b = n1 - a,
          d = n2 - c;
        if (method === 'fisher') {
          const fi = ST.fisher(a, b, c, d),
            [lo, hi] = woolf(a, b, c, d);
          return {
            analysis: qid,
            category: f.code,
            a,
            b,
            c,
            d,
            or: fi.or,
            lo,
            hi,
            p: fi.p,
            strata: null,
            method,
            selection: true,
            vs: S.vs,
          };
        }
        const r = ST.mh(SX.map(([ax, nx, cy, ny]) => [ax[k], nx - ax[k], cy[k], ny - cy[k]]));
        return {
          analysis: qid,
          category: f.code,
          a,
          b,
          c,
          d,
          or: r.or,
          lo: r.lo,
          hi: r.hi,
          p: r.p,
          strata: r.strata,
          method,
          selection: true,
          vs: S.vs,
        };
      })
      .filter(Boolean);
    const circ = circularFor(qid, G.cons);
    const q = ST.bh(rows.map((r) => r.p));
    rows.forEach((r, k) => {
      r.q = circ ? null : q[k];
      r.descriptive = circ;
    });
    return rows;
  }
  function contrastSets(aid, G) {
    const ps = SD.protein_sets?.[aid];
    if (!ps) return [];
    const inBg = new Set(ps.in_background),
      prot = (idx) =>
        new Set(
          [
            ...unitsOf(
              ps,
              idx.map((i) => SD.marks[i][0])
            ),
          ].filter((p) => inBg.has(p))
        );
    let p1 = prot(G.g1),
      p2;
    if (S.vs === 'cmp') {
      p2 = prot(G.g2);
      const both = [...p1].filter((p) => p2.has(p));
      both.forEach((p) => {
        p1.delete(p);
        p2.delete(p);
      });
    } else p2 = new Set(ps.in_background.filter((p) => !p1.has(p)));
    const n1 = p1.size,
      n2 = p2.size;
    const rows = ps.sets
      .map(([s, , members]) => {
        let a = 0,
          c = 0;
        for (const p of members) {
          if (p1.has(p)) a++;
          else if (p2.has(p)) c++;
        }
        if (!a) return null;
        const b = n1 - a,
          d = n2 - c,
          [lo, hi] = woolf(a, b, c, d);
        // against the other marked proteins: one-sided hypergeometric over the marked background, as the site's own test
        const p = S.vs === 'cmp' ? ST.fisher(a, b, c, d).p : ST.hyperSF(a, n1 + n2, a + c, n1);
        return {
          analysis: aid,
          category: s,
          a,
          b,
          c,
          d,
          fold: a / n1 / ((a + c) / (n1 + n2)),
          or: ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)),
          lo,
          hi,
          p,
          method: 'enricher',
          selection: true,
          vs: S.vs,
        };
      })
      .filter(Boolean);
    const named = compute().q.genes.length || compute().q.sites.length;
    const circ = circularFor(aid, G.cons) || !!named;
    const q = ST.bh(rows.map((r) => r.p));
    rows.forEach((r, k) => {
      r.q = circ ? null : q[k];
      r.descriptive = circ;
    });
    return rows;
  }
  // every question compared at once, for one test: the questions of the site and the marks' attributes. q is
  // Benjamini–Hochberg across all of them (the family the page shows), not question by question
  const contrastIds = () => [
    ...AN().filter((id) => A[id]),
    ...Object.keys(SD.protein_sets || {}).filter((id) => A[id]?.kind === 'protein_sets'),
    ...Object.entries(SPECS)
      .filter(([n, sp]) => ['category', 'list', 'number'].includes(sp.kind) && AT().includes(n))
      .map(([n]) => '@' + n),
  ];
  function contrastFamily(method, G) {
    const c = compute(),
      key = `fam|${S.vs}|${S.cmp || ''}|${method}`;
    if (c.retests[key]) return c.retests[key];
    // a selection of whole proteins (a gene list, a set) has no protein with marks on both sides: a pooled or
    // within-study comparison then sets proteins against proteins, counting each mark of a protein as if it were
    // independent, so it is shown (the shares) and not tested
    const between = (G.mixed ?? 0) < SEL_MIN.proteins;
    const fam = {};
    for (const id of [...new Set(contrastIds())]) {
      const out =
        A[id]?.kind === 'protein_sets'
          ? contrastSets(id, G)
          : contrastResidue(id, method === 'enricher' ? 'fisher' : method, G);
      out.forEach((r) => {
        // a selection under the minimum (SEL_MIN) is described, not tested: counts and shares stay, no p, q, interval or direction
        if (!testable() || (between && method !== 'mantel_haenszel' && r.method !== 'enricher')) {
          r.p = null;
          r.q = null;
          r.lo = null;
          r.hi = null;
          r.descriptive = true;
          if (testable()) r.between = true;
        }
      });
      fam[id] = out;
    }
    const tested = Object.values(fam).flatMap((rs) => rs.filter((r) => !r.descriptive && r.p != null)),
      q = ST.bh(tested.map((r) => r.p));
    tested.forEach((r, k) => {
      r.q = q[k];
    });
    Object.values(fam).forEach((rs) => K.decorate(rs));
    return (c.retests[key] = fam);
  }
  // a question's rows against the other marks (or the other selection), shaped as the site's own; null when the
  // groups are too small (fewer than 10 marks either side)
  function contrast(qid, method) {
    const c = compute();
    if (!SD || !c.active) return null;
    const G = (c.retests['groups|' + S.vs + '|' + (S.cmp || '')] ||= contrastPair());
    if (!G || G.g1.length < MIN_SIDE || G.g2.length < MIN_SIDE) return null;
    // a protein-set question is one test whatever the page's method: it joins the family of the method shown
    const m = method === 'enricher' ? (K.vsMethod ? K.vsMethod(S.m) : S.m) : method;
    const fam = contrastFamily(m, G);
    if (fam[qid]) return fam[qid];
    const key = `vs|${S.vs}|${S.cmp || ''}|${qid}|${method}`; // a question outside the family: on its own
    if (c.retests[key] !== undefined) return c.retests[key];
    const out =
      A[qid]?.kind === 'protein_sets'
        ? contrastSets(qid, G)
        : contrastResidue(qid, method === 'enricher' ? 'fisher' : method, G);
    if (!testable())
      out.forEach((r) => {
        r.p = null;
        r.q = null;
        r.lo = null;
        r.hi = null;
        r.descriptive = true;
      });
    return (c.retests[key] = K.decorate(out));
  }
  // the comparison is a test only when the selection reaches the minimum and each side has MIN_SIDE marks
  const contrastOK = (G) => !!G && testable() && G.g1.length >= MIN_SIDE && G.g2.length >= MIN_SIDE;
  const contrastGroups = () => {
    const c = compute();
    if (!SD || !c.active) return null;
    return (c.retests['groups|' + S.vs + '|' + (S.cmp || '')] ||= contrastPair());
  };

  // the rows of a question for the selection, shaped as the site's own (kit.js decorates them)
  function rows(aid, method) {
    const c = compute();
    if (!c.active || !SD || !testable()) return null;
    const key = aid + '|' + method;
    if (!c.retests[key])
      c.retests[key] = K.decorate(A[aid]?.kind === 'protein_sets' ? setRows(aid) : residueRows(aid, method));
    return c.retests[key];
  }

  // ---- the URL: filters as f=key~v1|v2;key~v1 ---------------------------------------------------------------------
  const enc = (v) => encodeURIComponent(v).replace(/~/g, '%7E');
  const dec = (v) => {
    try {
      return decodeURIComponent(v);
    } catch (e) {
      return null;
    }
  };
  // the f= of a query string (or of a whole address), read as written: its separators (~ ; |) are the link's own and its
  // values are escaped once. Links written by earlier versions escaped the whole value a second time (every % as %25, the
  // separators as %7E, %3B and %7C): a value with no ~ that carries an escaped one is unwrapped until it is stable.
  function fRaw(qs) {
    const part = String(qs || '')
      .replace(/^[^?]*\?/, '')
      .replace(/^[#?]/, '')
      .split('&')
      .find((x) => x.startsWith('f='));
    if (part == null) return null;
    let raw = part.slice(2).replace(/\+/g, ' ');
    for (let i = 0; i < 8 && !raw.includes('~') && /%(?:25)*7E/i.test(raw); i++) {
      const d = dec(raw);
      if (d == null || d === raw) break;
      raw = d;
    }
    return raw;
  }
  const encode = () =>
    Object.entries(S.f)
      .filter(([, v]) => v && v.length)
      .map(([k, v]) => k + '~' + v.map(enc).join('|'))
      .join(';');
  // a hand-edited or stale link: malformed parts and keys this site does not have are dropped
  // the filters a link's f= holds; unknown keys are dropped
  function decodeF(s) {
    const f = {};
    String(s || '')
      .split(';')
      .filter(Boolean)
      .forEach((part) => {
        const [k0, v] = part.split('~'),
          k = k0 && dec(k0);
        if (!k || !v || !validKey(k)) return;
        const vals = v
          .split('|')
          .map(dec)
          .filter((x) => x != null);
        if (vals.length) f[k] = vals;
      });
    return f;
  }
  function decode(s) {
    S.f = decodeF(s);
  }
  // a saved selection's (or any link's) search and filters, from its hash
  function stateOfHash(h) {
    const qs = String(h || '').split('?')[1] || '',
      p = new URLSearchParams(qs);
    return { q: canonQ(p.get('q') || ''), f: decodeF(fRaw(qs)) };
  }
  function setFilter(key, vals) {
    if (vals && vals.length) S.f[key] = vals;
    else delete S.f[key];
    K.writeHash(true);
    K.render();
  }
  // the values a key has from the search box's terms
  const termValues = (key) =>
    compute()
      .cons.filter(([k, , fromSearch]) => fromSearch && k === key)
      .flatMap(([, v]) => v);
  // remove one value of a key from the search box's terms (the term goes when it has no value left)
  function dropTermValue(key, v) {
    const toks = String(S.q).match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || [];
    S.q = toks
      .map((t) => {
        const m =
          /^([a-z_][\w]*):(.+)$/i.exec(t) || (FLAGQ[t.toLowerCase()] ? [t, t, FLAGQ[t.toLowerCase()].yes] : null);
        if (!m || !isTermKey(m[1])) return t;
        const k0 = m[1].toLowerCase(),
          val = m[2].replace(/^"|"$/g, ''),
          r = termFilter([k0, val]);
        if (!r || r.error || r[0] !== key) return t;
        const left = val.split(/[|,]/).filter((x) => {
          const f = termFilter([k0, x]);
          return !(f && !f.error && f[1].includes(v));
        });
        return left.length ? (m[0] === m[1] ? t : `${m[1]}:${left.join(',')}`) : '';
      })
      .filter(Boolean)
      .join(' ');
  }
  function toggle(key, v) {
    if (termValues(key).includes(v)) {
      dropTermValue(key, v);
      K.writeHash(true);
      K.render();
      return;
    }
    const cur = new Set(S.f[key] || []);
    if (cur.has(v)) cur.delete(v);
    else cur.add(v);
    setFilter(key, [...cur]);
  }
  function clearAll() {
    S.f = {};
    S.q = '';
    Object.assign(S, { view: 'overview', arg: '' });
    K.writeHash(true);
    K.render();
    scrollTo(0, 0);
  }

  // Features that repeat count once, everywhere enriched features appear (the selection bar, Enriched features, What sets it
  // apart). Near-duplicates: the same words (bracketed parts, case and punctuation aside), the same 2x2 table, or counts
  // within 5% on both sides (one class given by several questions, windows or cut-offs); the first of each (callers sort
  // the strongest first) is kept, with how many more it stands for. A feature is circular when the selection names proteins
  // and the feature is a class named after one of them (a PRMT, in a list holding PRMT1).
  const featStem = (r) =>
    String(r.label)
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const featNear = (x, y) =>
    featStem(x) === featStem(y) ||
    (x.a === y.a && x.b === y.b && x.c === y.c && x.d === y.d) ||
    (Math.abs(x.a - y.a) <= 0.05 * Math.max(x.a, y.a) &&
      Math.abs(x.c - y.c) <= 0.05 * Math.max(x.c, y.c) &&
      x.a + x.b === y.a + y.b &&
      x.c + x.d === y.c + y.d &&
      x.dir === y.dir);
  function featureFamilies(list) {
    const o = [];
    list.forEach((r) => {
      const f = o.find((k) => featNear(k, r));
      if (f) f.related++;
      else o.push({ ...r, related: 0 });
    });
    const named = (compute().q.genes || [])
      .map((i) =>
        String(D.proteins[i]?.[1] || '')
          .toUpperCase()
          .replace(/[^A-Z]+/g, '')
      )
      .filter((x) => x.length >= 3);
    o.forEach((r) => {
      r.circular =
        !!named.length &&
        (
          String(r.label)
            .toUpperCase()
            .match(/[A-Z]{3,}/g) || []
        ).some((w) => named.some((g) => g.startsWith(w) || w.startsWith(g)));
    });
    return o;
  }
  // a chip naming one set of a protein-set question ("disease:als"): what the set is, how many genes it holds, how it was made
  // (the question's set_note: by hand, by rule); '' for any other term
  function termTip(raw) {
    const m = /^([^:\s]+):(.+)$/.exec(String(raw || '').trim());
    if (!m || !SD) return '';
    const r = termFilter([m[1].toLowerCase(), m[2].replace(/^"|"$/g, '')]);
    if (!r || r.error || !/^p:/.test(r[0]) || !r[1].length) return '';
    const aid = r[0].slice(2),
      a = A[aid],
      ps = SD.protein_sets?.[aid];
    if (!a) return '';
    return (
      r[1]
        .slice(0, 3)
        .map((sn) => {
          const row = ps?.sets.find((x) => x[0] === sn),
            size = row ? row[1] : null,
            here = setMembers[aid]?.[sn]?.size;
          return (
            `${classLabel(aid, sn)}: a set of the question "${a.title}"${
              (a.help || {})[sn] ? '. ' + a.help[sn] : ''
            }.` +
            (size != null
              ? ` ${int(size)} gene${size === 1 ? '' : 's'} in the background${
                  here != null ? `, ${int(here)} of them ` + `on proteins with ${W.marks} here` : ''
                }.`
              : '') +
            (a.set_note ? ' ' + a.set_note : '')
          );
        })
        .join(' ') + (r[1].length > 3 ? ` (and ${r[1].length - 3} more)` : '')
    );
  }
  function dropTerm(raw) {
    const [k, ...v] = String(raw).split(':'),
      val = v.join(':'),
      esc_ = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    S.q = S.q
      .replace(new RegExp(`(^|\\s)${esc_(k)}${v.length ? `:"?${esc_(val)}"?` : ''}(?=\\s|$)`, 'i'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // a selection a page made and named (S.qn = {q, name}, while the search is still that q) is described by its name
  const describe = () =>
    S.qn && S.qn.q === S.q && !Object.keys(S.f).length
      ? S.qn.name
      : [
          S.q,
          ...compute()
            .cons.filter((x) => !x[2])
            .map(([k, v]) => flagPhrase(k, v) || `${keyName(k)}: ${v.map((x) => valueName(k, x)).join(' or ')}`),
        ]
          .filter(Boolean)
          .join('; ');
  // ---- who is told when the selection changes ---------------------------------------------------------------------
  // K.sel.subscribe(fn) calls fn(K.sel.state) after a page draw in which the search, the filters or the data in hand changed
  // (every change draws the page again); it returns the function that stops it. K.sel.state is the live {q, f, ...} (K.S).
  const subs = new Set();
  let told = null;
  const notify = () => {
    const k = stateKey();
    if (k === told) return;
    told = k;
    subs.forEach((f) => {
      try {
        f(S);
      } catch (e) {
        console.error(e);
      }
    });
  };
  const subscribe = (fn) => {
    subs.add(fn);
    return () => subs.delete(fn);
  };
  (K.afterRender ||= []).push(notify);
  Object.assign(K, {
    sel: {
      nFilters: () => Object.keys(S.f).length + (S.q ? 1 : 0),
      get ready() {
        return ready();
      },
      active,
      testable,
      contrastOK,
      rows,
      madeWith,
      ownSets,
      describe,
      validKey,
      parse,
      nMarks,
      nProteins,
      protSelected,
      selectedPositions,
      selectedCountByProtein,
      encode,
      decode,
      fRaw,
      compute,
      data: () => {
        need();
        return SD;
      },
      peek: () => SD,
      setHas: (aid, s, p) => !!setMembers[aid]?.[s]?.has(p),
      MIN: SEL_MIN,
      valueLabel,
      classLabel,
      listHtml,
      isPapers,
      select,
      stateOfHash,
      termFilter,
      contrast,
      contrastGroups,
      featuresOf,
      featureCounts,
      featureFamilies,
      termTip,
      STUDY,
      MIN_SIDE,
      refresh,
      lookup,
      nearSymbols,
      parsePattern,
      dropTerm,
      isTermKey,
      aliasesOf: (i) => aliasesOf[i] || [],
      nameOf,
      namesProteins: () => {
        const q = compute().q;
        return !!(q.genes.length || q.sites.length);
      },
      state: S,
      residueFeatures,
      subscribe,
      retest: rows,
      members: () => setMembers,
      need,
      AN,
      RSPEC,
      byAcc,
      clearAll,
      keyName,
      valueName,
      flagOf,
      canonQ,
      flagPhrase,
      FLAGQ,
      matcher,
      scoreText,
      setFilter,
      termValues,
      toggle,
      AT,
      anyMembers: () => anyMembers,
    },
  });
});
