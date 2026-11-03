/* Selections: the sidebar (Sections and Filters), the selection bar, and the tests run again on a selection.

   A selection is the marks that pass every constraint: the search (genes, accessions, sites such as "FUS R216", or
   terms such as motif:RGG) and the filters. Filters within one control match any of their values; separate controls
   must all hold. Every page then shows the selection, and the Overview's tests run again on it in the browser:
     residue questions   the selected marks against the other candidate residues of their own proteins (marks not
                         selected are left out of both sides): within each protein (Mantel–Haenszel) and pooled
                         (Fisher), as the site's own rows (kit-stats.js)
     protein-set questions  the selected proteins in each set, against the set's share of the background
                         (one-sided hypergeometric), over the sets the site tested
   A question the selection was made with is shown, not tested (its answer would be circular). Too small a selection
   (fewer than 10 proteins or 30 marks) is shown but not tested. The filters a site offers come from its file
   (website.filters), or else one group per section of questions and one per attribute of its marks. A module of the
   site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  const ST = window.PTMC_STATS;
  const SEL_MIN = { proteins: 10, marks: 30 };
  const SPECS = D.attribute_specs || {};
  const P = (D.proteins || []).map(([acc, gene, name, len, marks, cand, entry], i) => ({ i, acc, gene, name, len, marks, cand, entry }));
  const byAcc = Object.fromEntries(P.map(p => [p.acc, p]));
  const byEntry = Object.fromEntries(P.filter(p => p.entry).map(p => [p.entry.toUpperCase(), p]));
  // a token that names a protein: its gene, accession (an isoform's names its canonical entry) or entry name
  const protOf = t => { const u = t.toUpperCase(), a = u.replace(/-\d+$/, ''); return byGene[u] || (byAcc[a] ? [byAcc[a]] : byEntry[u] ? [byEntry[u]] : null); };
  const byGene = {}; P.forEach(p => String(p.gene || '').split(/[\s;]+/).filter(Boolean).forEach(g => { (byGene[g.toUpperCase()] ||= []).push(p); }));
  // other names: the aliases of the site's protein_values table (synonyms, the symbols the sources used), the names
  // papers use (website.search.shorthand: H4), and any of these, or a gene, without hyphens, spaces and dots
  // (TDP-43, hnRNP A1)
  const SRCH = D.search || {};
  const norm = x => String(x || '').toUpperCase().replace(/[-\s._/]/g, '');
  const byAlias = {}, byNorm = {}, aliasesOf = {};
  const addTo = (map, k, p) => { if (!k) return; const l = (map[k] ||= []); if (!l.includes(p)) l.push(p); };
  P.forEach(p => String(p.gene || '').split(/[\s;]+/).filter(Boolean).forEach(g => { if (norm(g).length >= 3) addTo(byNorm, norm(g), p); }));
  Object.entries(D.protein_aliases || {}).forEach(([acc, al]) => { const p = byAcc[acc]; if (!p) return;
    aliasesOf[p.i] = String(al).split(/;\s*/).filter(Boolean);
    aliasesOf[p.i].forEach(a => { if (!byGene[a.toUpperCase()]) addTo(byAlias, a.toUpperCase(), p); if (norm(a).length >= 3) addTo(byNorm, norm(a), p); }); });
  Object.entries(SRCH.shorthand || {}).forEach(([n, acc]) => { const p = byAcc[acc]; if (p && !byGene[n.toUpperCase()]) { byAlias[n.toUpperCase()] = [p]; (aliasesOf[p.i] ||= []).push(n); } });
  // a name: the protein(s) it names, and whether by another name than the gene, accession or entry name
  const lookup = t => { const ex = protOf(t); if (ex) return { ps: ex, via: false }; const u = String(t).toUpperCase(), al = byAlias[u] || (norm(u).length >= 3 ? byNorm[norm(u)] : null); return al ? { ps: al, via: true } : null; };
  const nameOf = p => p.gene ? String(p.gene).split(/[\s;]+/)[0] : p.acc;
  // numbering as papers do (website.protein.numbering: histones without the initiator methionine): a position typed
  // in a search is read in it, as on the protein's page
  const NUMR = (D.protein_view?.numbering || []).map(n => ({ ...n, g: n.genes ? new RegExp(n.genes) : null, nm: n.names ? new RegExp(n.names, 'i') : null }));
  const numOf = p => { if (!NUMR.length) return null; if (p._num === undefined) { const g = String(p.gene || '').split(/[\s;,]+/)[0]; p._num = NUMR.find(n => (g ? n.g?.test(g) : n.nm?.test(p.name || ''))) || null; } return p._num; };
  const uniPos = (p, typed) => typed - (numOf(p)?.offset || 0);
  // symbols one edit away from a word (a letter added, dropped, changed, or two swapped), most marks first: "did you mean"
  function nearSymbols(word, max = 3) {
    const w = String(word).toUpperCase(); if (w.length < 3 || /\d{3,}/.test(w)) return [];
    const one = (a, b) => {
      if (a === b || Math.abs(a.length - b.length) > 1) return false;
      let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
      if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
      return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
    };
    return P.filter(p => p.gene && one(w, nameOf(p).toUpperCase())).sort((a, b) => b.marks - a.marks).slice(0, max);
  }
  // a plain word names proteins by the start of a gene, accession or other name, or by part of a protein name
  const wordHits = (p, w) => (p.gene || '').toLowerCase().startsWith(w) || p.acc.toLowerCase().startsWith(w) || (p.name || '').toLowerCase().includes(w) || (aliasesOf[p.i] || []).some(a => a.toLowerCase().startsWith(w));
  S.f = {};                                   // filter key -> [values]; keys a:<analysis>, p:<analysis>, s:<analysis>, t:<attribute>, n:<attribute>

  // ---- the data: every mark with its classes and attributes (data/selection.json, or inlined) ----------------------
  let SD = null;
  // each protein's marked positions, for reading "GENE 12" as a site only when 12 is one
  let markPos = null;
  const isMark = (pi, pos) => { if (!SD) return false; if (!markPos) { markPos = {}; SD.marks.forEach(m => { (markPos[m[0]] ||= new Set()).add(m[1]); }); } return !!markPos[pi]?.has(pos); };
  const ready = (() => {
    const el = document.getElementById('selection-data');
    if (el) { try { SD = JSON.parse(el.textContent); return Promise.resolve(SD); } catch (e) { /* fall back to the file */ } }
    return fetch('data/selection.json').then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { SD = d; prepare(); return d; }, () => null).then(d => { if (d) K.render(); return d; });
  })();
  const AN = () => SD.analyses, AT = () => SD.attribute_names || Object.keys(SD.attributes);
  let setMembers = {}, anyMembers = {};        // analysis -> set name -> Set(protein index); analysis -> in any of its source's sets
  // a question whose sets hold other identifiers (genes; ps.of: protein index -> its identifiers' indices) counts
  // those: a group of proteins is the set of their identifiers
  const unitsOf = (ps, prots) => (ps.of ? new Set([...prots].flatMap(p => ps.of[p] || [])) : new Set(prots));
  function prepare() {
    setMembers = {};
    for (const [aid, ps] of Object.entries(SD.protein_sets || {})) {
      const holders = {};                      // identifier index -> the marked proteins that map to it
      if (ps.of) Object.entries(ps.of).forEach(([p, us]) => us.forEach(u => (holders[u] ||= []).push(+p)));
      setMembers[aid] = Object.fromEntries(ps.sets.map(([s, , m]) => [s, new Set(ps.of ? m.flatMap(u => holders[u] || []) : m)]));
      (ps.more || []).forEach(([s, m]) => { setMembers[aid][s] = new Set(m); });    // offered by the filter, not tested
      anyMembers[aid] = new Set(ps.of ? ps.in_background.flatMap(u => holders[u] || []) : ps.any || ps.in_background);
    }
    // each mark's longer window, for the motif finder (website.search.patterns), and its index
    SD.marks.forEach((m, i) => { m.ix = i; if (SD.wide) m.w = SD.wide.w[i]; });
    SD.numbers = {};
    AT().forEach(k => { if (SPECS[k]?.kind === 'number') SD.numbers[k] = SD.attributes[k].map(Number); });
  }
  if (SD) prepare();

  // ---- labels ------------------------------------------------------------------------------------------------------
  const classLabel = (aid, c) => (A[aid]?.labels || {})[c] || String(c).replace(/_/g, ' ');
  const valueLabel = (attr, v) => (SPECS[attr]?.values || {})[v] ?? (v === '' ? 'none' : v);
  // a list attribute's values as links: a database to its own record of the protein (records, {acc}), else each value
  // to its paper (link); the first three, and the rest named in the "+n" tooltip unless full
  function listHtml(attr, vals, ids, acc, full) {
    const s = SPECS[attr] || {}, item = (v, i) => {
      const lab = valueLabel(attr, v), rec = s.records?.[v], id = ids?.[i];
      if (rec && acc) return `<a href="${esc(rec.replace('{acc}', encodeURIComponent(acc)))}" title="${esc(`${lab}: its record of ${acc}${id ? `; its paper: ${id}` : ''}`)}">${esc(lab)}</a>`;
      if (s.link && id) return `<a href="${esc(s.link.url.replace('{}', id))}" title="${esc(`${lab}: ${id}`)}">${esc(lab)}</a>`;
      return esc(lab);
    };
    const all = vals.filter(Boolean), shown = full ? all : all.slice(0, 3), rest = all.slice(shown.length).map(v => valueLabel(attr, v));
    return (shown.map(item).join(', ') + (rest.length ? ` <span class="muted" title="${esc(rest.join(', '))}">+${rest.length}</span>` : '')) || '<span class="muted">–</span>';
  }
  // a protein-level filter (r:<name>): a protein attribute (proteins.attributes) or the protein's count of marks (marks)
  const PSPEC = D.protein_attributes?.specs || {};
  const RSPEC = id => (id === 'marks' ? { label: `Minimum ${W.marks} per protein`, kind: 'number', levels: [2, 3, 5, 10, 20], direction: 'min' } : PSPEC[id]);
  const protVal = (id, pi) => (id === 'marks' ? D.proteins[pi]?.[4] : D.protein_attributes?.values?.[id]?.[pi]);
  const rHolds = (id, pi, v) => { const sp = RSPEC(id) || {}, x = protVal(id, pi); if (x == null || x === '') return false;
    if (sp.kind !== 'number') return String(x).split(sp.separator || '; ').includes(v);
    const ok = sp.direction === 'max' ? x <= +v : x >= +v; if (!ok) return false;
    const also = sp.also; if (!also) return true; const y = protVal(also.attribute, pi); return y != null && (also.min == null || y >= also.min) && (also.max == null || y <= also.max); };
  const keyName = key => { if (key.startsWith('r:')) return RSPEC(key.slice(2))?.label || key.slice(2); const [kind, id] = key.split(':');
    if (K.filterKinds?.[kind]?.label) return K.filterKinds[kind].label(id);
    if (kind === 'm') return id === 'near' ? `Motif within ±${SD?.wide?.span ?? SRCH.patterns?.span ?? 15}` : `Motif at the ${W.mark}`;
    if (kind === 'x') return (SRCH.terms || {})[id]?.label || cap(id); return kind === 't' || kind === 'n' ? (SPECS[id]?.label || id) : kind === 's' ? (A[id]?.scores?.label || id) : (A[id]?.title || id); };
  // a protein-set filter: its set (or * for any of its source's sets) and, with a score filter on it (s:<analysis>, a
  // threshold), the memberships scored at least that instead
  const scoreOf = (aid, s, p) => { const sc = SD.protein_sets?.[aid]?.scores; return sc ? (s === '*' ? sc.any : sc.sets[s] || {})[p] : undefined; };
  const inSet = (aid, s, p, t) => (t == null ? !!(s === '*' ? anyMembers[aid] : setMembers[aid]?.[s])?.has(p) : (s !== '*' || !!anyMembers[aid]?.has(p)) && scoreOf(aid, s, p) >= t);
  const scoreText = (id, v) => { const sc = A[id]?.scores || {}; return `${+v === sc.max ? '' : '≥ '}${v}${sc.max != null ? ` of ${sc.max}` : ''}`; };
  function valueName(key, v) {
    const [kind, id] = key.split(':');
    if (K.filterKinds?.[kind]?.value) return K.filterKinds[kind].value(id, v);
    if (kind === 'm' || kind === 'x') return v;
    if (kind === 'r') { const sp = RSPEC(id) || {}; return sp.kind === 'number' ? `${sp.direction === 'max' ? '≤' : 'at least'} ${v}` : (sp.values || {})[v] || v; }
    if (kind === 's') return scoreText(id, v);
    if (kind === 'p' && v === '*') return A[id]?.filter?.any || 'in any set';
    if (kind === 'a') return classLabel(id, v);
    if (kind === 't') return valueLabel(id, v);
    if (kind === 'n') return `at least ${v}`;
    return (A[id]?.labels || {})[v] || v;
  }

  // a module may add a kind of filter (K.filterKinds[kind]: valid(id), test(id, values) -> mark -> bool), as kit-counts.js does
  const validKey = key => { const [kind, id] = String(key).split(':'); if (kind === 'r') return !!RSPEC(id); if (kind === 'm') return !!SRCH.patterns?.[id]; if (kind === 'x') return !!(SRCH.terms || {})[id]; return (kind === 'a' && A[id] && A[id].kind !== 'protein_sets' && !A[id].page) || !!K.filterKinds?.[kind]?.valid(id) || (kind === 'p' && A[id]?.kind === 'protein_sets') || (kind === 's' && !!A[id]?.scores) || ((kind === 't' || kind === 'n') && !!SPECS[id]); };

  // ---- the search: proteins, sites and terms ---------------------------------------------------------------------
  // a gene, accession, entry name or other name names all its marks; "GENE R216 R218", "GENE 216", "GENE:R216",
  // "GENE_216", "GENE-R216" or one word "H4R3" name those marks (in the protein's own numbering, as its page shows it);
  // a name written as two words ("hnRNP A1") is one; key:value terms filter (values joined by commas or |). A list of
  // proteins is their union: a name in it with no marked protein is reported (absent), not applied. Without any
  // protein named, other words narrow by name; a word that matches nothing is reported, not silently applied. What
  // the search read is kept for the line under it: names matched by another name (via), sites with no mark
  // (missing), positions read in a protein's own numbering (numbered), and symbols one edit from a word (typos).
  const RESIDUES = new Set((D.residues || []).map(r => String(r).toUpperCase()));
  const POS_RE = /^[A-Z]?\d+[,;]?$/i;
  const isTermKey = k => { const key = String(k).toLowerCase(); return !!(A[key] || SPECS[key] || PSPEC[key] || ALIAS[key] || (SRCH.terms || {})[key] || (SRCH.patterns && (SRCH.patterns.at === key || SRCH.patterns.near === key)) || K.searchTerms?.[key]); };
  function parse(q) {
    const out = { genes: [], words: [], sites: [], terms: [], unmatched: [], absent: [], ignored: [], ambiguous: [], via: [], missing: [], numbered: [], typos: {}, nWords: 0, nNamed: 0 };
    const raw = String(q || '').trim();
    const toks = raw.match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || [];
    // a site of the protein(s) a name gave: each reads the position in its own numbering
    const addSite = (ps, typed, letter) => {
      let any = false;
      ps.forEach(p => { const u = uniPos(p, typed); out.sites.push([p.i, u]); if (isMark(p.i, u)) any = true; if (numOf(p) && !out.numbered.some(x => x[0] === nameOf(p))) out.numbered.push([nameOf(p), `${letter}${typed}`, `${letter}${u}`, numOf(p)]); });
      if (SD && !any) out.missing.push(`${nameOf(ps[0])} ${letter || (RESIDUES.size === 1 ? [...RESIDUES][0] : '')}${typed}`);
    };
    const named = (tok, l) => { if (l.via) out.via.push([tok, l.ps.map(nameOf)]); out.nNamed++; };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].replace(/[,;]+$/, ''), m = /^([a-z_][\w]*):(.+)$/i.exec(t);
      if (!t) continue;
      if (m && !isTermKey(m[1])) {                       // GENE:R216 is a site, not a term
        const l = lookup(m[1]), s = /^([A-Z]?)(\d+)$/i.exec(m[2]);
        if (l && s) { out.nWords++; named(m[1], l); addSite(l.ps, +s[2], s[1].toUpperCase()); continue; }
      }
      if (m) { out.terms.push([m[1].toLowerCase(), m[2].replace(/^"|"$/g, '')]); continue; }
      out.nWords++;
      let l = lookup(t);
      if (!l && i + 1 < toks.length && !toks[i + 1].includes(':')) {   // a name in two words (hnRNP A1)
        const l2 = lookup(t + toks[i + 1].replace(/[,;]+$/, ''));
        if (l2) { named(t + ' ' + toks[i + 1], { ...l2, via: true }); l2.ps.forEach(p => out.genes.push(p.i)); i++; continue; }
      }
      if (l) {
        named(t, l);
        let j = i + 1, any = false;
        while (j < toks.length && POS_RE.test(toks[j])) {
          // a token that is also a protein's name (F12) is that protein, unless it is a mark of the one before it
          const tok = toks[j].replace(/[,;]+$/, ''), pos = +tok.replace(/\D/g, ''), other = protOf(tok);
          if (other) { if (!l.ps.some(p => isMark(p.i, uniPos(p, pos)))) break; out.ambiguous.push([tok, nameOf(l.ps[0])]); }
          addSite(l.ps, pos, /^[A-Z]/i.test(tok) ? tok[0].toUpperCase() : ''); any = true; j++; out.nWords++;
        }
        if (!any) l.ps.forEach(p => out.genes.push(p.i));
        i = j - 1; continue;
      }
      const sep = /^(.+?)[_/-]([A-Z]?)(\d+)$/i.exec(t), ls = sep && lookup(sep[1]);       // GENE_216, GENE-R216, GENE/216
      if (ls) { named(sep[1], ls); addSite(ls.ps, +sep[3], sep[2].toUpperCase()); continue; }
      const one = /^(.+?)([A-Z])(\d+)$/i.exec(t), lo = one && RESIDUES.has(one[2].toUpperCase()) && lookup(one[1]);   // H4R3
      if (lo) { named(one[1], lo); addSite(lo.ps, +one[3], one[2].toUpperCase()); continue; }
      const w = t.toLowerCase();
      if (P.some(p => wordHits(p, w))) out.words.push(w);
      else out.unmatched.push(t);
    }
    // a list that names proteins: its other plain words are names with no marked protein, not filters on the names
    if (out.genes.length || out.sites.length) {
      const orig = w => toks.find(t => t.toLowerCase() === w) || w;
      out.ignored = out.words.map(orig); out.absent = out.unmatched; out.words = []; out.unmatched = [];
    }
    [...out.unmatched, ...out.absent].forEach(w => { const n = nearSymbols(w); if (n.length) out.typos[w] = n.map(p => [p.i, nameOf(p)]); });
    return out;
  }
  // a term key:value: an analysis (its class or set), or an attribute of the marks or of the proteins; a word of the
  // site's own (website.search.terms: go:rna), read first; a pattern of residues (website.search.patterns: motif:GXRG
  // covering the mark, window:PRPR anywhere near it); or a module's (K.searchTerms). [filter key, values], or
  // {error} saying why it cannot be read
  // an older site's search keys, read as this site's (website.search_aliases: disease -> disease_family)
  const ALIAS = Object.fromEntries(Object.entries(D.search_aliases || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const PAT = SRCH.patterns || null;
  // a pattern: residues, X . * or ? for any residue, [ST] for a choice; 2 to 10 positions
  const AA = 'ACDEFGHIKLMNPQRSTVWY', patCache = {};
  function parsePattern(raw) {
    const s0 = String(raw || '').toUpperCase().replace(/\s+/g, '');
    if (patCache[s0]) return patCache[s0];
    const toks = []; let error = null;
    for (let k = 0; k < s0.length && !error; k++) {
      const c = s0[k];
      if (c === '[') { const e = s0.indexOf(']', k), set = e < 0 ? '' : s0.slice(k + 1, e);
        if (e < 0) error = 'Close the [ … ] group.'; else if (!set || [...set].some(x => !AA.includes(x))) error = 'Inside [ ] list residue letters only, e.g. [ST].'; else { toks.push(set); k = e; } }
      else if ('X.*?'.includes(c)) toks.push(null);
      else if (AA.includes(c)) toks.push(c);
      else error = `“${c}” is not a residue letter or a wildcard.`;
    }
    if (!error && (toks.length < 2 || toks.length > 10)) error = 'Use 2 to 10 residues (each [ ] group counts as one).';
    return (patCache[s0] = error ? { error } : { toks, text: s0 });
  }
  // does a window (the mark at its centre) hold the pattern: covering the mark (at) or anywhere in it (near)
  function patternHit(win, pat, where) {
    if (!win) return false;
    const c = (win.length - 1) / 2, ok = st => st >= 0 && pat.toks.every((tk, i) => { const ch = win[st + i]; return ch && ch !== '-' && ch !== '_' && (tk === null || tk.includes(ch)); });
    if (where === 'near') { for (let st = 0; st + pat.toks.length <= win.length; st++) if (ok(st)) return true; return false; }
    return pat.toks.some((tk, i) => (tk === null || tk.includes(win[c])) && ok(c - i));
  }
  const patterns = (key, vals) => { const bad = vals.map(parsePattern).find(x => x.error); return bad ? { error: `${key}:${vals.join(',')}: ${bad.error}` } : [key === PAT.near ? 'm:near' : 'm:at', vals.map(v => parsePattern(v).text)]; };
  const TERMS = SRCH.terms || {};
  function termFilter([key0, val]) {
    const key = ALIAS[key0] || key0;
    const vals = val.split(/[|,]/).map(v => v.trim()).filter(Boolean), low = v => String(v).toLowerCase();
    const T = TERMS[key0];
    if (T && vals.some(v => T.values[low(v)])) {
      const bad = vals.filter(v => !T.values[low(v)]);
      return bad.length ? { error: `${key0}: no value ${bad.join(', ')} (${Object.keys(T.values).join(', ')})` } : ['x:' + key0, vals.map(low)];
    }
    if (PAT && key0 === PAT.near) return patterns(key0, vals);
    if (K.searchTerms?.[key0]) return K.searchTerms[key0](vals);
    if (A[key] && SD && A[key].kind !== 'protein_sets' && !A[key].page) {
      const codes = SD.classes[key] || [];
      // an exact code or label first; a prefix only when nothing matches exactly
      const each = vals.map(v => { const ex = codes.filter(c => low(c) === low(v) || low(classLabel(key, c)) === low(v)); return ex.length ? ex : codes.filter(c => low(c).startsWith(low(v)) || low(classLabel(key, c)).startsWith(low(v))); });
      // motif:GXRG: a value that is no class is a pattern, when the site's motif finder reads this key
      if (PAT && key0 === PAT.at && each.some(x => !x.length)) return patterns(key0, vals);
      return ['a:' + key, each.flat()];
    }
    if (PAT && key0 === PAT.at) return patterns(key0, vals);
    if (A[key] && SD && A[key].kind === 'protein_sets') {
      const names = Object.keys(setMembers[key] || {});
      // a set by its name or label: exactly, else every set where a word begins with it ("ALS" for "ALS / motor neuron / FTD")
      const lab = s => low((A[key].labels || {})[s] || ''), at = v => new RegExp('(^|[^a-z0-9])' + low(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return ['p:' + key, vals.flatMap(v => { const ex = names.filter(s => low(s) === low(v) || lab(s) === low(v)); return ex.length ? ex : names.filter(s => at(v).test(low(s)) || at(v).test(lab(s))); })];
    }
    if (SPECS[key] && SD) {
      if (SPECS[key].kind === 'number') return ['n:' + key, [vals[0]]];
      return ['t:' + key, vals.flatMap(v => SD.attributes[key].filter(x => low(x) === low(v) || low(valueLabel(key, x)).includes(low(v))))];
    }
    if (PSPEC[key]) {                                    // an attribute of the proteins
      if (PSPEC[key].kind === 'number') return ['r:' + key, [vals[0]]];
      const all = [...new Set((D.protein_attributes?.values?.[key] || []).flatMap(x => String(x || '').split(PSPEC[key].separator || '; ')).filter(Boolean))];
      return ['r:' + key, vals.flatMap(v => all.filter(x => low(x) === low(v) || low((PSPEC[key].values || {})[x] || '').includes(low(v))))];
    }
    return null;
  }
  // every constraint of a search and filters: [key, values, from the search?]; terms that match nothing are kept
  // aside, to be reported (unresolved), with what was wrong when it can say (errors)
  function constraintsOf(qText, f) {
    const out = Object.entries(f || {}).filter(([k, v]) => v && v.length && validKey(k)).map(([k, v]) => [k, v, false]), unresolved = [], errors = [];
    if (SD) parse(qText).terms.forEach(t => { const r = termFilter(t); if (r && !r.error && r[1].length) out.push([r[0], r[1], true, t.join(':')]); else { unresolved.push(t.join(':')); if (r?.error) errors.push(r.error); } });
    return { cons: out, unresolved, errors };
  }

  // ---- which marks pass ------------------------------------------------------------------------------------------
  // select(q, f): the marks a search and filters select, without touching the page's own state (a saved selection
  // can be evaluated beside the current one); compute() is the current selection, cached
  // one constraint as a test of a mark (cons: every constraint, for a threshold that applies to another)
  function testOf(key, vals, cons) {
    const [kind, id] = key.split(':');
    if (kind === 'a') { const ai = AN().indexOf(id), codes = new Set(vals.map(v => SD.classes[id].indexOf(v))); return m => m[2][ai].some(c => codes.has(c)); }
    const min = cons.find(([k]) => k === 's:' + id)?.[1][0], t = min == null ? null : +min;
    if (kind === 'p') return m => vals.some(v => inSet(id, v, m[0], t));
    if (kind === 's') return cons.some(([k]) => k === 'p:' + id) ? () => true : m => scoreOf(id, '*', m[0]) >= t;   // with a set: applied there
    if (kind === 't') { const ti = AT().indexOf(id), codes = new Set(vals.map(v => SD.attributes[id].indexOf(v))); return m => m[3][ti].some(c => codes.has(c)); }
    if (kind === 'n') { const ti = AT().indexOf(id), min = +vals[0], num = SD.numbers[id]; return m => m[3][ti].some(c => num[c] >= min); }
    if (kind === 'r') return m => vals.some(v => rHolds(id, m[0], v));
    if (kind === 'm') { const pats = vals.map(parsePattern).filter(x => !x.error); return m => pats.some(pt => patternHit(m.w || m[4], pt, id)); }
    if (kind === 'x') {                                  // a word of the site's own: each its filters, all holding
      const T = TERMS[id], each = vals.map(v => Object.entries(T?.values?.[v] || {}).filter(([k]) => validKey(k)).map(([k, vs]) => testOf(k, vs, cons)));
      return m => each.some(ts => ts.length && ts.every(f => f(m)));
    }
    if (K.filterKinds?.[kind]) return K.filterKinds[kind].test(id, vals, cons);
    return () => true;
  }
  // a search and filters as tests: base(m), what the search names (words, genes, sites), and one test per constraint
  function matcher(qText, f) {
    const q = parse(qText), { cons, unresolved, errors } = constraintsOf(qText, f);
    // proteins named by the search (a gene or accession names all its marks; "GENE R216" names one mark)
    const genes = new Set(q.genes), sites = new Set(q.sites.map(([p, pos]) => p + ':' + pos)), named = genes.size || sites.size;
    const protOk = P.map(p => !q.words.length || q.words.every(w => wordHits(p, w)));
    const base = m => protOk[m[0]] && (!named || genes.has(m[0]) || sites.has(m[0] + ':' + m[1]));
    const tests = cons.map(([key, vals]) => testOf(key, vals, cons));
    return { q, cons, unresolved, errors, base, tests };
  }
  function select(qText, f) {
    const M = SD ? matcher(qText, f) : null, q = M ? M.q : parse(qText), { cons, unresolved, errors } = M || constraintsOf(qText, f);
    const active = !!(q.genes.length || q.words.length || q.sites.length || cons.length || q.unmatched.length || unresolved.length);
    let marks = null, proteins = null;
    if (SD && active) {
      marks = [];
      SD.marks.forEach((m, i) => { if (M.base(m) && M.tests.every(t => t(m))) marks.push(i); });
      proteins = new Set(marks.map(i => SD.marks[i][0]));
    }
    // every part of a search must hold: a word or a term that matches nothing leaves no marks, as nothing can match all
    // of it (the bar says which); in a list of proteins, a name with no marked protein is reported and the rest kept
    if (SD && active && (q.unmatched.length || unresolved.length || (!q.genes.length && !q.words.length && !q.sites.length && !cons.length))) { marks = []; proteins = new Set(); }
    return { active, marks, proteins, cons, q, unresolved, errors };
  }
  let cache = { key: null };
  // gen: data a module read later (a filter's own file) changes what a selection holds
  let gen = 0;
  const refresh = () => { gen++; K.render(); };
  const stateKey = () => JSON.stringify([S.q, S.f, !!SD, gen]);
  function compute() {
    if (cache.key === stateKey()) return cache;
    cache = { key: stateKey(), ...select(S.q, S.f), retests: {} };
    return cache;
  }
  const active = () => compute().active;
  const testable = () => { const c = compute(); return !c.active || (c.proteins && c.proteins.size >= SEL_MIN.proteins && c.marks.length >= SEL_MIN.marks); };
  const rolesOf = aid => new Set([aid, ...(A[aid]?.roles || []).map(r => 'role:' + r)]);
  const madeWith = aid => { const mine = rolesOf(aid); return compute().cons.some(([k]) => { const id = k.split(':')[1]; return [...rolesOf(id)].some(x => mine.has(x)); }); };
  const nMarks = () => (active() ? (compute().marks || []).length : D.counts.marks);
  const nProteins = () => (active() ? (compute().proteins || new Set()).size : D.counts.proteins);
  const protSelected = acc => !active() || (compute().proteins && compute().proteins.has(byAcc[acc]?.i));
  // per protein, the positions of its selected marks
  function selectedPositions(acc) {
    if (!active() || !SD) return null;
    const pi = byAcc[acc]?.i, out = new Set();
    (compute().marks || []).forEach(i => { if (SD.marks[i][0] === pi) out.add(SD.marks[i][1]); });
    return out;
  }
  function selectedCountByProtein() {
    const out = {}; (compute().marks || []).forEach(i => { const p = SD.marks[i][0]; out[p] = (out[p] || 0) + 1; }); return out;
  }

  // ---- the tests again, on the selection -------------------------------------------------------------------------
  function residueRows(aid, method) {
    const ai = AN().indexOf(aid); if (ai < 0) return [];
    const codes = SD.classes[aid], others = SD.others[aid] || {}, cnt = SD.counted?.[aid], skip = new Set(cnt?.skip || []);
    const byProt = {};
    compute().marks.forEach(i => { const m = SD.marks[i]; if (!skip.has(m[0]) && (SD.others_total[m[0]] > 0 || cnt?.alone)) (byProt[m[0]] ||= []).push(m[2][ai]); });
    const rows = codes.map((cat, ci) => {
      const tables = []; let a = 0, b = 0, c = 0, d = 0;
      for (const [p, ms] of Object.entries(byProt)) {
        const ot = SD.others_total[p], oin = (others[p] || {})[ci] || 0, ain = ms.filter(x => x.includes(ci)).length;
        tables.push([ain, ms.length - ain, oin, ot - oin]); a += ain; b += ms.length - ain; c += oin; d += ot - oin;
      }
      // a class absent from the selection's proteins is no test; the pooled test still counts it in BH (p = 1), as the
      // original explorer does
      if (!a && !c) return method === 'fisher' ? { absent: true, p: 1 } : null;
      const r = method === 'fisher' ? (() => { const f = ST.fisher(a, b, c, d); return { or: f.or, p: f.p, lo: null, hi: null, strata: null }; })() : ST.mh(tables);
      return { analysis: aid, category: cat, a, b, c, d, or: r.or, lo: r.lo, hi: r.hi, p: r.p, strata: r.strata, method, selection: true };
    }).filter(Boolean);
    // shown, not tested: a selection made with a question reading the same inputs, or one class holding every selected mark
    const n = Object.values(byProt).reduce((x, ms) => x + ms.length, 0);
    const circ = madeWith(aid) || rows.some(r => !r.absent && r.a === n);
    const q = ST.bh(rows.map(r => r.p)); rows.forEach((r, k) => { r.q = circ ? null : q[k]; r.descriptive = circ; });
    return rows.filter(r => !r.absent);
  }
  function setRows(aid) {
    const ps = SD.protein_sets?.[aid]; if (!ps) return [];
    const inBg = new Set(ps.in_background), sel = [...unitsOf(ps, compute().proteins)].filter(p => inBg.has(p)), n = sel.length, N = ps.N;
    const selSet = new Set(sel);
    const rows = ps.sets.map(([s, M, members]) => {
      const k = members.reduce((x, p) => x + (selSet.has(p) ? 1 : 0), 0);
      if (!k) return null;
      return { analysis: aid, category: s, a: k, b: n - k, c: M - k, d: N - M - n + k, fold: (k / n) / (M / N), p: ST.hyperSF(k, N, M, n), method: 'enricher', selection: true };
    }).filter(Boolean);
    // a selection that names its proteins (a gene list) is shown against the sets, not tested: its enrichment would
    // test the choice of genes, not the mark
    const named = compute().q.genes.length || compute().q.sites.length;
    const q = ST.bh(rows.map(r => r.p)); rows.forEach((r, k) => { const circ = madeWith(aid) || r.a === n || !!named; r.q = circ ? null : q[k]; r.descriptive = circ; });
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
  const STUDY = (() => { const c = D.compare?.stratify; if (c && SPECS[c]) return c; return Object.keys(SPECS).find(n => SPECS[n].provenance && SPECS[n].kind === 'list' && SPECS[n].link) || null; })();
  // a question's classes, each with its test on a mark: a residue question's, or an attribute's values (a number
  // attribute at 2, 3 and 5 or more)
  function featuresOf(qid) {
    if (qid[0] === '@') {
      const name = qid.slice(1), ti = AT().indexOf(name), sp = SPECS[name] || {}; if (ti < 0) return [];
      if (sp.kind === 'number') { const nums = SD.numbers[name], max = Math.max(...nums.filter(Number.isFinite)); return [2, 3, 5].filter(t => t <= max).map(t => ({ code: String(t), has: m => m[3][ti].some(c => nums[c] >= t) })); }
      return SD.attributes[name].map((v, ci) => ({ code: v, has: m => m[3][ti].includes(ci) })).filter(f => f.code !== '');
    }
    const ai = AN().indexOf(qid); if (ai < 0) return [];
    return SD.classes[qid].map((c, ci) => ({ code: c, has: m => m[2][ai].includes(ci) }));
  }
  let studyOf = null;                          // mark index -> the set of sources that report it, as one key
  const studyKey = i => { if (!studyOf) { const ti = AT().indexOf(STUDY); studyOf = SD.marks.map(m => (ti < 0 ? '' : [...m[3][ti]].sort((x, y) => x - y).join(','))); } return studyOf[i]; };
  // the two groups: [group 1 (the selection), group 2, marks both hold, the constraints of both]
  function contrastPair() {
    const c = compute(); if (!c.active || !SD || !c.marks) return null;
    if (S.vs === 'cmp') {
      const st = stateOfHash('?' + (S.cmp || '')), o = select(st.q, st.f), oth = o.active ? o.marks : SD.marks.map((_, i) => i);
      const in2 = new Set(oth), in1 = new Set(c.marks);
      return mixedOf({ g1: c.marks.filter(i => !in2.has(i)), g2: oth.filter(i => !in1.has(i)), shared: c.marks.filter(i => in2.has(i)).length, cons: [...c.cons, ...o.cons], other: o, otherState: st });
    }
    const in1 = new Set(c.marks);
    return mixedOf({ g1: c.marks, g2: SD.marks.map((_, i) => i).filter(i => !in1.has(i)), shared: 0, cons: c.cons });
  }
  // how many proteins have marks on both sides: a selection of whole proteins (a set, a gene list) has none, and then
  // no within-protein comparison can be made
  function mixedOf(G) { const p1 = new Set(G.g1.map(i => SD.marks[i][0])); G.mixed = new Set(G.g2.map(i => SD.marks[i][0]).filter(p => p1.has(p))).size; return G; }
  const woolf = (a, b, c, d) => { const or = ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)), se = Math.sqrt(1 / (a + 0.5) + 1 / (b + 0.5) + 1 / (c + 0.5) + 1 / (d + 0.5)); return [Math.exp(Math.log(or) - 1.959963984540054 * se), Math.exp(Math.log(or) + 1.959963984540054 * se)]; };
  // circular: a question either selection was made with, or one reading the same inputs
  function circularFor(qid, cons) {
    const mine = qid[0] === '@' ? new Set(['t:' + qid.slice(1), 'n:' + qid.slice(1)]) : rolesOf(qid);
    return cons.some(([k]) => { const id = k.split(':')[1]; return qid[0] === '@' ? mine.has(k) : [...rolesOf(id)].some(x => mine.has(x)); });
  }
  function contrastResidue(qid, method, G) {
    const skip = new Set(SD.counted?.[qid]?.skip || []), kept = i => !skip.has(SD.marks[i][0]);   // marks the question counts
    G = { ...G, g1: G.g1.filter(kept), g2: G.g2.filter(kept) };
    const m1 = G.g1.map(i => SD.marks[i]), m2 = G.g2.map(i => SD.marks[i]), n1 = m1.length, n2 = m2.length;
    let strata = null;
    if (method !== 'fisher') {
      const by = new Map(), keyOf = method === 'study' ? (i => studyKey(i)) : (i => SD.marks[i][0]);
      G.g1.forEach((i, k) => { const s = keyOf(i); (by.get(s) || by.set(s, [[], []]).get(s))[0].push(m1[k]); });
      G.g2.forEach((i, k) => { const s = keyOf(i); (by.get(s) || by.set(s, [[], []]).get(s))[1].push(m2[k]); });
      strata = [...by.values()].filter(([x, y]) => x.length && y.length);
    }
    const rows = featuresOf(qid).map(f => {
      let a = 0, c = 0; for (const m of m1) if (f.has(m)) a++; for (const m of m2) if (f.has(m)) c++;
      if (!a && !c) return null;
      const b = n1 - a, d = n2 - c;
      if (method === 'fisher') { const fi = ST.fisher(a, b, c, d), [lo, hi] = woolf(a, b, c, d); return { analysis: qid, category: f.code, a, b, c, d, or: fi.or, lo, hi, p: fi.p, strata: null, method, selection: true, vs: S.vs }; }
      const r = ST.mh(strata.map(([x, y]) => { const ax = x.filter(f.has).length, cy = y.filter(f.has).length; return [ax, x.length - ax, cy, y.length - cy]; }));
      return { analysis: qid, category: f.code, a, b, c, d, or: r.or, lo: r.lo, hi: r.hi, p: r.p, strata: r.strata, method, selection: true, vs: S.vs };
    }).filter(Boolean);
    const circ = circularFor(qid, G.cons);
    const q = ST.bh(rows.map(r => r.p)); rows.forEach((r, k) => { r.q = circ ? null : q[k]; r.descriptive = circ; });
    return rows;
  }
  function contrastSets(aid, G) {
    const ps = SD.protein_sets?.[aid]; if (!ps) return [];
    const inBg = new Set(ps.in_background), prot = idx => new Set([...unitsOf(ps, idx.map(i => SD.marks[i][0]))].filter(p => inBg.has(p)));
    let p1 = prot(G.g1), p2;
    if (S.vs === 'cmp') { p2 = prot(G.g2); const both = [...p1].filter(p => p2.has(p)); both.forEach(p => { p1.delete(p); p2.delete(p); }); }
    else p2 = new Set(ps.in_background.filter(p => !p1.has(p)));
    const n1 = p1.size, n2 = p2.size;
    const rows = ps.sets.map(([s, , members]) => {
      let a = 0, c = 0; for (const p of members) { if (p1.has(p)) a++; else if (p2.has(p)) c++; }
      if (!a) return null;
      const b = n1 - a, d = n2 - c, [lo, hi] = woolf(a, b, c, d);
      // against the other marked proteins: one-sided hypergeometric over the marked background, as the site's own test
      const p = S.vs === 'cmp' ? ST.fisher(a, b, c, d).p : ST.hyperSF(a, n1 + n2, a + c, n1);
      return { analysis: aid, category: s, a, b, c, d, fold: (a / n1) / ((a + c) / (n1 + n2)), or: ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)), lo, hi, p, method: 'enricher', selection: true, vs: S.vs };
    }).filter(Boolean);
    const named = compute().q.genes.length || compute().q.sites.length;
    const circ = circularFor(aid, G.cons) || !!named;
    const q = ST.bh(rows.map(r => r.p)); rows.forEach((r, k) => { r.q = circ ? null : q[k]; r.descriptive = circ; });
    return rows;
  }
  // a question's rows against the other marks (or the other selection), shaped as the site's own; null when the
  // groups are too small (fewer than 10 marks either side)
  function contrast(qid, method) {
    const c = compute(); if (!SD || !c.active) return null;
    const key = `vs|${S.vs}|${S.cmp || ''}|${qid}|${method}`;
    if (c.retests[key] !== undefined) return c.retests[key];
    const G = c.retests['groups|' + S.vs + '|' + (S.cmp || '')] ||= contrastPair();
    if (!G || G.g1.length < MIN_SIDE || G.g2.length < MIN_SIDE) return (c.retests[key] = null);
    const out = A[qid]?.kind === 'protein_sets' ? contrastSets(qid, G) : contrastResidue(qid, method === 'enricher' ? 'fisher' : method, G);
    return (c.retests[key] = K.decorate(out));
  }
  const contrastGroups = () => { const c = compute(); if (!SD || !c.active) return null; return c.retests['groups|' + S.vs + '|' + (S.cmp || '')] ||= contrastPair(); };

  // the rows of a question for the selection, shaped as the site's own (kit.js decorates them)
  function rows(aid, method) {
    const c = compute(); if (!c.active || !SD || !testable()) return null;
    const key = aid + '|' + method;
    if (!c.retests[key]) c.retests[key] = K.decorate(A[aid]?.kind === 'protein_sets' ? setRows(aid) : residueRows(aid, method));
    return c.retests[key];
  }

  // ---- the URL: filters as f=key~v1|v2;key~v1 ---------------------------------------------------------------------
  const enc = v => encodeURIComponent(v).replace(/~/g, '%7E');
  const dec = v => { try { return decodeURIComponent(v); } catch (e) { return null; } };
  const encode = () => Object.entries(S.f).filter(([, v]) => v && v.length).map(([k, v]) => k + '~' + v.map(enc).join('|')).join(';');
  // a hand-edited or stale link: malformed parts and keys this site does not have are dropped
  // the filters a link's f= holds; unknown keys are dropped
  function decodeF(s) {
    const f = {};
    String(s || '').split(';').filter(Boolean).forEach(part => {
      const [k, v] = part.split('~'); if (!k || !v || !validKey(k)) return;
      const vals = v.split('|').map(dec).filter(x => x != null); if (vals.length) f[k] = vals;
    });
    return f;
  }
  function decode(s) { S.f = decodeF(s); }
  // a saved selection's (or any link's) search and filters, from its hash
  function stateOfHash(h) {
    const qs = String(h || '').split('?')[1] || '', p = new URLSearchParams(qs);
    return { q: p.get('q') || '', f: decodeF(p.get('f')) };
  }
  function setFilter(key, vals) { if (vals && vals.length) S.f[key] = vals; else delete S.f[key]; K.writeHash(true); K.render(); }
  // the values a key has from the search box's terms
  const termValues = key => (compute().cons.filter(([k, , fromSearch]) => fromSearch && k === key).flatMap(([, v]) => v));
  // remove one value of a key from the search box's terms (the term goes when it has no value left)
  function dropTermValue(key, v) {
    const toks = String(S.q).match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || [];
    S.q = toks.map(t => {
      const m = /^([a-z_][\w]*):(.+)$/i.exec(t); if (!m || !isTermKey(m[1])) return t;
      const k0 = m[1].toLowerCase(), val = m[2].replace(/^"|"$/g, ''), r = termFilter([k0, val]); if (!r || r.error || r[0] !== key) return t;
      const left = val.split(/[|,]/).filter(x => { const f = termFilter([k0, x]); return !(f && !f.error && f[1].includes(v)); });
      return left.length ? `${m[1]}:${left.join(',')}` : '';
    }).filter(Boolean).join(' ');
  }
  function toggle(key, v) {
    if (termValues(key).includes(v)) { dropTermValue(key, v); K.writeHash(true); K.render(); return; }
    const cur = new Set(S.f[key] || []); if (cur.has(v)) cur.delete(v); else cur.add(v); setFilter(key, [...cur]);
  }
  function clearAll() { S.f = {}; S.q = ''; K.writeHash(true); K.render(); }

  // ---- the selection bar -----------------------------------------------------------------------------------------
  // the search's plain words are one chip; each of its terms a chip of its own, readable, removed alone
  const plainOf = q => (String(q || '').match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || []).filter(t => !/^[a-z_][\w]*:.+$/i.test(t) || !isTermKey(t.split(':')[0])).join(' ');
  function dropTerm(raw) {
    const [k, ...v] = String(raw).split(':'), val = v.join(':'), esc_ = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    S.q = S.q.replace(new RegExp(`(^|\\s)${esc_(k)}:"?${esc_(val)}"?(?=\\s|$)`, 'i'), ' ').replace(/\s+/g, ' ').trim();
  }
  function chipsHtml() {
    const c = compute(), out = [], bad = new Set((c.unresolved || []).map(x => x.toLowerCase())), plain = plainOf(S.q).split(' ').filter(t => !bad.has(t.toLowerCase())).join(' ');
    if (plain) out.push(`<span class="sel-chip">Search: <b>${esc(plain)}</b><button type="button" data-sel-clear-q aria-label="Remove the search">×</button></span>`);
    c.cons.filter(([, , fromSearch]) => fromSearch).forEach(([k, v, , raw]) => out.push(`<span class="sel-chip" title="${esc(raw)}">${esc(keyName(k))}: <b>${esc(v.map(x => valueName(k, x)).join(' or '))}</b><button type="button" data-sel-drop-term="${esc(raw)}" aria-label="Remove ${esc(raw)}">×</button></span>`));
    (c.unresolved || []).forEach(raw => { if (/:/.test(raw)) out.push(`<span class="sel-chip bad" title="Matches nothing: no ${esc(W.mark)} is selected while it stays">${esc(raw)}<button type="button" data-sel-drop-term="${esc(raw)}" aria-label="Remove ${esc(raw)}">×</button></span>`); });
    c.cons.filter(([, , fromSearch]) => !fromSearch).forEach(([k, v]) => out.push(`<span class="sel-chip">${esc(keyName(k))}: <b>${esc(v.map(x => valueName(k, x)).join(' or '))}</b><button type="button" data-sel-clear="${esc(k)}" aria-label="Remove">×</button></span>`));
    return out.join('<span class="sel-and">and</span>');
  }
  function bar() {
    if (!active()) return null;
    const c = compute();
    if (!SD) return `<span class="sel-flag">Selection</span><span>Loading the ${esc(W.marks)}…</span>`;
    const n = c.marks.length, np = c.proteins.size, nCons = c.cons.length + (plainOf(S.q) ? 1 : 0) + c.unresolved.length;
    // with the line under the search (kit-search.js), what the search could not read is said there
    const note = !!K.searchNote, miss = note ? [] : [...c.unresolved, ...c.q.unmatched], absent = note ? [] : c.q.absent || [], ignored = note ? [] : c.q.ignored || [], amb = note ? [] : c.q.ambiguous || [];
    return `<span class="sel-flag">Selection</span><span><b>${int(n)}</b> of ${int(D.counts.marks)} ${esc(W.marks)} on <b>${int(np)}</b> protein${np === 1 ? '' : 's'}${nCons > 1 ? ', matching all of' : ''}</span>${chipsHtml()}` +
      (miss.length ? `<span class="sel-miss" title="Terms are key:value, where the key is a question (${esc(D.analyses.map(a => a.id).join(', '))}) or an attribute (${esc(Object.keys(SPECS).join(', ') || 'none')})">Nothing matches ${miss.map(x => `<b>${esc(x)}</b>`).join(', ')}</span>` : '') +
      (absent.length ? `<span class="sel-miss" title="Not a gene, accession or entry name of a protein with a ${esc(W.mark)} on this site">No ${esc(W.marked)} protein: ${absent.map(x => `<b>${esc(x)}</b>`).join(', ')}</span>` : '') +
      (ignored.length ? `<span class="sel-miss" title="In a list of proteins, words are not searched in protein names: search them on their own to do that">Not a protein, left out of the list: ${ignored.map(x => `<b>${esc(x)}</b>`).join(', ')}</span>` : '') +
      (amb.length ? `<span class="sel-miss" title="Write the protein first, or alone, to list it">${amb.map(([t, g]) => `<b>${esc(t)}</b> read as ${esc(g)}’s site, not the protein ${esc(t)}`).join('; ')}</span>` : '') +
      `<span class="sel-tools">${(K.selTools || []).map(f => f()).join('')}<button class="btn small" type="button" data-sel-save title="Keep this selection in this browser; saved ones are listed under Filters">Save</button>` +
      `<button class="btn small" type="button" data-sel-copy>Copy link</button><button class="btn small accent" type="button" data-sel-clear-all>Clear all</button></span>`;
  }
  // saved selections, in this browser
  const savedList = () => { try { return JSON.parse(localStorage.getItem(`ptmc-saved-${D.site.id}`) || '[]'); } catch (e) { return []; } };
  function savedHtml() {
    const list = savedList(); if (!list.length) return '';
    return `<div class="saved"><p class="flabel">Saved selections</p>${list.map((x, i) => `<div class="saved-row"><a href="${esc(x.hash)}">${esc(x.name)}</a> <span class="muted">${int(x.n)}</span>${K.views.compare ? `<button type="button" class="linkish small" data-saved-cmp="${i}" title="Compare ${esc(x.name)} with the current selection">Compare</button>` : ''}<button type="button" class="linkish small" data-saved-del="${i}" aria-label="Delete ${esc(x.name)}">×</button></div>`).join('')}</div>`;
  }
  const describe = () => [S.q, ...compute().cons.filter(x => !x[2]).map(([k, v]) => `${keyName(k)}: ${v.map(x => valueName(k, x)).join(' or ')}`)].filter(Boolean).join('; ');
  function save() {
    const name = prompt('A name for this selection', describe().slice(0, 80));
    if (!name) return;
    const list = savedList().filter(x => x.name !== name); list.unshift({ name, hash: location.hash, n: nMarks() });
    try { localStorage.setItem(`ptmc-saved-${D.site.id}`, JSON.stringify(list.slice(0, 40))); } catch (e) { /* storage blocked */ }
    K.render();
  }

  // ---- the sidebar: Sections and Filters --------------------------------------------------------------------------
  const R = { tab: (() => { try { return localStorage.getItem('ptmc-rail-tab') || 'sections'; } catch (e) { return 'sections'; } })(),
    // pinning is automatic (pinned whenever the window is wide enough, following its resizes) unless unpinned by hand
    // 'auto' pins from 1,280 px; 'on' (pinned by hand) from 1,100 px; 'off' keeps it in a drawer
    pin: (() => { try { const v = localStorage.getItem('ptmc-rail'); return ['on', 'off'].includes(v) ? v : 'auto'; } catch (e) { return 'auto'; } })(), open: false,
    width: (() => { try { return +localStorage.getItem('ptmc-rail-w') || 0; } catch (e) { return 0; } })() };
  const PIN_MIN = 1100, PIN_AUTO = 1280;
  const setRailWidth = () => { document.documentElement.style.setProperty('--rail-w', R.width ? `${Math.min(Math.max(R.width, 224), Math.min(520, innerWidth * 0.4))}px` : ''); };
  setRailWidth();
  // the groups: from the site file, or one per section of residue questions, protein-set questions and attributes
  function groups() {
    if (D.filters && D.filters.length) return D.filters.map(g => ({ ...g, analyses: (g.analyses || []).filter(a => A[a]), attributes: (g.attributes || []).filter(k => SPECS[k]), proteins: (g.proteins || []).filter(k => RSPEC(k)), keys: (g.keys || []).filter(k => validKey(k)) }));
    const out = [], seen = {};
    D.analyses.forEach(a => { const g = seen[a.section] || (seen[a.section] = out[out.push({ name: a.section || 'Questions', analyses: [] }) - 1]); g.analyses.push(a.id); });
    const attrs = Object.entries(SPECS).filter(([, s]) => s.filter).map(([k]) => k);
    if (attrs.length) out.push({ name: 'Marks', attributes: attrs });
    return out;
  }
  // a control's counts over a list of marks: per class or value (marks), per set (proteins)
  function tally(key, idx) {
    const [kind, id] = key.split(':'), out = {};
    if (kind === 'a' || kind === 't') {
      const col = kind === 'a' ? 2 : 3, at = kind === 'a' ? AN().indexOf(id) : AT().indexOf(id), names = kind === 'a' ? SD.classes[id] : SD.attributes[id];
      const n = new Array(names.length).fill(0);
      (idx || SD.marks.map((_, i) => i)).forEach(i => SD.marks[i][col][at].forEach(c => { n[c]++; }));
      names.forEach((v, c) => { out[v] = n[c]; });
    } else if (kind === 'p') {
      const prots = idx ? new Set(idx.map(i => SD.marks[i][0])) : null;
      const n = mem => { let k = 0; if (!prots) k = mem.size; else mem.forEach(p => { if (prots.has(p)) k++; }); return k; };
      Object.entries(setMembers[id] || {}).forEach(([s, mem]) => { out[s] = n(mem); });
      if (anyMembers[id]) out['*'] = n(anyMembers[id]);            // in any of the source's sets
    }
    return out;
  }
  const totals = {};
  const cnt = (key, v) => (totals[key] ||= SD ? tally(key, null) : {})[v] ?? null;
  // the counts a control shows under the current selection: the marks that pass every other constraint, so a
  // control's own values stay comparable while it is in use (faceted search); cached with the selection
  function facet(key) {
    const c = compute(); if (!SD || !c.active) return null;
    if (!c.facets) {
      const M = matcher(S.q, S.f), keys = M.cons.map(([k]) => k), all = [], except = {};
      SD.marks.forEach((m, i) => {
        if (!M.base(m)) return;
        let bad = null;
        for (let j = 0; j < M.tests.length; j++) if (!M.tests[j](m)) { if (bad == null) bad = keys[j]; else if (bad !== keys[j]) return; }
        if (bad == null) all.push(i); else (except[bad] ||= []).push(i);
      });
      c.facets = { all, except, keys: new Set(keys), memo: {} };
    }
    const F = c.facets;
    return (F.memo[key] ||= tally(key, F.keys.has(key) ? [...F.all, ...(F.except[key] || [])] : F.all));
  }
  const NONE_RE = /^(no |not |none|unknown|unassigned)/i;
  function control(key) {
    const [kind, id] = key.split(':'), on = new Set([...(S.f[key] || []), ...termValues(key)]);
    // the values shown are fixed by the whole site (nothing moves as the selection changes); the counts follow it
    const fc = kind === 'n' || kind === 's' || kind === 'r' ? null : facet(key), shownN = v => (fc ? fc[v] ?? 0 : cnt(key, v));
    const chip = (v, lab) => { const n = shownN(v), t = cnt(key, v);
      return `<button type="button" class="fchip${fc && !n && !on.has(v) ? ' zero' : ''}" data-f="${esc(key)}" data-v="${esc(v)}" aria-pressed="${on.has(v)}"${fc ? ` title="${int(n)} in the selection, ${int(t)} in all"` : ''}>${esc(lab)}${n != null ? ` <span class="muted">${int(n)}</span>` : ''}</button>`; };
    if (kind === 'a') {
      const codes = (SD?.classes[id] || Object.keys(A[id]?.labels || {})).filter(c => !NONE_RE.test(classLabel(id, c)) && cnt(key, c) !== 0);
      return `<div class="fctl"><p class="flabel">${esc(A[id].title)}</p><div class="fchips">${codes.map(c => chip(c, classLabel(id, c))).join('')}</div></div>`;
    }
    if (kind === 'p') {
      const lab = x => (A[id].labels || {})[x] || x;
      const names = Object.keys(setMembers[id] || {}).filter(x => cnt(key, x)).sort((x, y) => NONE_RE.test(lab(x)) - NONE_RE.test(lab(y)) || (cnt(key, y) || 0) - (cnt(key, x) || 0));
      const any = A[id].filter?.any ? `<option value="*"${on.has('*') ? ' selected' : ''}>${esc(A[id].filter.any)} (${int(shownN('*'))})</option>` : '';
      return `<div class="fctl"><p class="flabel">${A[id].filter?.label ? esc(A[id].filter.label) : `${esc(A[id].title)} <span class="muted">(${fc ? 'proteins of the selection' : `${esc(W.marked)} proteins`})</span>`}</p><select data-fsel="${esc(key)}"><option value="">Any</option>${any}` +
        names.map(s => `<option value="${esc(s)}"${on.has(s) ? ' selected' : ''}${fc && !shownN(s) && !on.has(s) ? ' class="zero"' : ''}>${esc(lab(s))} (${int(shownN(s))})</option>`).join('') + '</select></div>';
    }
    if (kind === 's') {
      const sc = A[id].scores, cur = S.f[key]?.[0] || '';
      return `<div class="fctl"><p class="flabel" title="${esc(sc.help || '')}">${esc(sc.label || 'Score')}</p><select data-fsel="${esc(key)}"><option value="">Any</option>` +
        (sc.levels || []).map(v => `<option value="${v}"${String(v) === cur ? ' selected' : ''}>${esc(scoreText(id, v))}</option>`).join('') + '</select></div>';
    }
    const spec = SPECS[id] || {};
    if (K.filterKinds?.[kind]?.control) return K.filterKinds[kind].control(id, { on, shownN, cnt: v => cnt(key, v), facet: fc });
    if (kind === 'r' && RSPEC(id)?.control === 'chips' && RSPEC(id).kind !== 'number') {   // a protein attribute's values as chips (match any)
      const sp = RSPEC(id), vals = [...new Set((D.protein_attributes?.values?.[id] || []).flatMap(x => String(x || '').split(sp.separator || '; ')).filter(Boolean))];
      const order = Object.keys(sp.values || {}), sorted = vals.filter(v => !NONE_RE.test((sp.values || {})[v] || v)).sort((x, y) => (order.includes(x) ? order.indexOf(x) : 99) - (order.includes(y) ? order.indexOf(y) : 99));
      return `<div class="fctl"><p class="flabel" title="${esc(sp.help || '')}">${esc(sp.label || id)} <span class="muted">(proteins; match any)</span></p><div class="fchips">` +
        sorted.map(v => `<button type="button" class="fchip" data-f="${esc(key)}" data-v="${esc(v)}" aria-pressed="${on.has(v)}">${esc((sp.values || {})[v] || v)}</button>`).join('') + '</div></div>';
    }
    if (kind === 'r') {                  // a protein-level filter: a threshold, or a protein attribute's values
      const sp = RSPEC(id) || {}, cur = S.f[key]?.[0] || '';
      const opts = sp.kind === 'number' ? (sp.levels || []).map(v => [String(v), `${sp.direction === 'max' ? '≤' : 'at least'} ${v}`])
        : [...new Set((D.protein_attributes?.values?.[id] || []).flatMap(x => String(x || '').split(sp.separator || '; ')).filter(Boolean))].sort().map(v => [v, (sp.values || {})[v] || v]);
      return `<div class="fctl"><p class="flabel" title="${esc(sp.help || '')}">${esc(sp.label || id)} <span class="muted">(proteins)</span></p><select data-fsel="${esc(key)}"><option value="">Any</option>` +
        opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('') + '</select></div>';
    }
    if (spec.kind === 'number') {
      const top = SD ? Math.max(...SD.numbers[id]) : 5, cur = S.f['n:' + id]?.[0] || '';
      return `<div class="fctl"><p class="flabel">${esc(spec.label)}</p><select data-fsel="n:${esc(id)}"><option value="">Any</option>` +
        [2, 3, 4, 5, 10].filter(v => v <= top).map(v => `<option value="${v}"${String(v) === cur ? ' selected' : ''}>${v} or more</option>`).join('') + '</select></div>';
    }
    const vals = (SD ? SD.attributes[id] : Object.keys(spec.values || {})).filter(v => cnt('t:' + id, v) !== 0);
    const order = spec.values ? Object.keys(spec.values) : [];
    const sorted = [...vals].sort((x, y) => (order.includes(x) ? order.indexOf(x) : 999) - (order.includes(y) ? order.indexOf(y) : 999) || (cnt('t:' + id, y) || 0) - (cnt('t:' + id, x) || 0));
    if (spec.control === 'select')       // many values: a drop-down list, one value at a time
      return `<div class="fctl"><p class="flabel" title="${esc(spec.help || '')}">${esc(spec.label)}</p><select data-fsel="t:${esc(id)}"><option value="">Any</option>` +
        sorted.map(v => `<option value="${esc(v)}"${on.has(v) ? ' selected' : ''}${fc && !shownN(v) && !on.has(v) ? ' class="zero"' : ''}>${esc(valueLabel(id, v))} (${int(shownN(v))})</option>`).join('') + '</select></div>';
    return `<div class="fctl"><p class="flabel" title="${esc(spec.help || '')}">${esc(spec.label)}${spec.kind === 'list' ? ' <span class="muted">(match any)</span>' : ''}</p><div class="fchips">` +
      sorted.map(v => chip(v, valueLabel(id, v))).join('') + '</div></div>';
  }
  function keysOf(g) {
    return [...(g.analyses || []).flatMap(aid => (A[aid]?.kind === 'protein_sets' ? ['p:' + aid, ...(A[aid].scores ? ['s:' + aid] : [])] : ['a:' + aid])), ...(g.attributes || []).map(k => (SPECS[k]?.kind === 'number' ? 'n:' : 't:') + k),
      ...(g.proteins || []).filter(k => RSPEC(k)).map(k => 'r:' + k), ...(g.keys || []).filter(k => validKey(k))];
  }
  function filtersTab() {
    const gs = groups();
    return `<div class="rail-sel">${bar() || `<span>All <b>${int(D.counts.marks)}</b> ${esc(W.marks)} on <b>${int(D.counts.proteins)}</b> proteins</span>`}</div>${savedHtml()}` +
      `<p class="rail-note">A ${esc(W.mark)} must match every filter. Every page then shows the selection and tests it again.</p>` +
      gs.map((g, gi) => {
        const keys = keysOf(g), n = keys.filter(k => S.f[k]?.length || termValues(k).length).length;
        return `<details class="fgroup${n ? ' active' : ''}" data-g="${gi}"${R.openGroups?.has(gi) ? ' open' : ''}><summary><span>${esc(g.name)}</span>${n ? `<span class="badge">${n}</span><button type="button" class="linkish small" data-fgroup-clear="${gi}">Clear</button>` : ''}</summary>` +
          keys.map(control).join('') + '</details>';
      }).join('') +
      `<div class="rail-foot"><span><b>${int(nMarks())}</b> ${esc(nMarks() === 1 ? W.mark : W.marks)} on <b>${int(nProteins())}</b> protein${nProteins() === 1 ? '' : 's'}${active() ? '' : ' (all)'}</span>${active() ? '<button class="linkish" type="button" data-sel-clear-all>Clear all</button>' : ''}</div>`;
  }
  // every page, and the current page's own sections under it: [id, label, level, href?]; a section with an href is a
  // link (another view), one without is a jump to the element with that id; group headings have level 0
  function sectionsTab() {
    const pages = [['overview', 'Overview'], ...K.tabs.map(f => f()).filter(Boolean).map(([v, n]) => [v, n]), ['statistics', 'Statistics'], ['method', 'Method']];
    const cur = v => S.view === v || K.views[S.view]?.tab === v;
    const here = K.sections?.[S.view]?.() || [];
    const item = ([id, lab, lvl, href]) => (lvl === 0 ? `<p class="toc-group">${esc(lab)}</p>`
      : href ? `<a href="${esc(href)}" class="sub l${lvl || 1}${K.link(S.view, S.arg).split('?')[0] === href.split('?')[0] ? ' on' : ''}">${esc(lab)}</a>`
      : `<a href="${esc(location.hash)}" data-jump="${esc(id)}"${id === 'view' ? '' : ` data-spy="${esc(id)}"`} class="sub l${lvl || 1}">${esc(lab)}</a>`);
    // the open protein is a page of its own, under Proteins; a page with no tab (Compare) is listed while open
    const extra = K.views[S.view] && !pages.some(([v]) => v === S.view) && S.view !== 'protein' ? [[S.view, K.views[S.view].title?.() || S.view]] : [];
    const list = [...pages, ...extra];
    const prot = S.view === 'protein' && S.arg ? (() => { const acc = S.arg.split('/')[0], pr = byAcc[acc]; return `<a href="${esc(K.link('protein', acc))}" class="page sub-page on">${esc(pr?.gene || K.views.protein?.title?.(acc) || acc)}</a>` + here.map(item).join(''); })() : '';
    return '<nav class="toc">' + list.map(([v, n]) => `<a href="${esc(K.link(v))}" class="page${cur(v) && S.view !== 'protein' ? ' on' : ''}">${esc(n)}</a>` +
      (v === 'proteins' && prot ? prot : cur(v) && S.view !== 'protein' ? here.map(item).join('') : '')).join('') + '</nav>';
  }
  const pinned = () => (R.pin === 'on' && innerWidth >= PIN_MIN) || (R.pin === 'auto' && innerWidth >= PIN_AUTO);
  // scroll-spy: the section in view is marked in the list
  let spyTick = false;
  function watchSections() {
    const links = [...document.querySelectorAll('#rail [data-spy]')]; if (!links.length) return;
    const bar = (document.querySelector('.toolbar')?.getBoundingClientRect().bottom || 0) + 24;
    let cur = null;
    links.forEach(a => { const t = document.getElementById(a.dataset.spy); if (t && t.getBoundingClientRect().top <= bar) cur = a; });
    links.forEach(a => a.classList.toggle('on', a === (cur || links[0])));
  }
  addEventListener('scroll', () => { if (spyTick) return; spyTick = true; requestAnimationFrame(() => { spyTick = false; watchSections(); }); }, { passive: true });
  function rail() {
    const el = document.getElementById('rail'); if (!el) return;
    const ae = document.activeElement, keep = ae && el.contains(ae) ? (ae.dataset.f ? `[data-f="${CSS.escape(ae.dataset.f)}"][data-v="${CSS.escape(ae.dataset.v)}"]` : ae.dataset.fsel ? `[data-fsel="${CSS.escape(ae.dataset.fsel)}"]` : ae.dataset.railTab ? `[data-rail-tab="${ae.dataset.railTab}"]` : null) : null;
    // the control in use stays where it was on the screen while the sidebar is drawn again
    const top0 = keep ? el.querySelector(keep)?.getBoundingClientRect().top : null;
    const wasOpen = document.body.classList.contains('rail-open'), open = !pinned() && R.open;
    document.body.classList.toggle('rail-pinned', pinned());
    // the floating button on narrow screens: the sidebar's way in once the toolbar has scrolled away
    let fab = document.querySelector('.rail-fab');
    if (!fab) { document.body.insertAdjacentHTML('beforeend', '<button class="rail-fab" type="button" data-rail-open="filters"></button>'); fab = document.querySelector('.rail-fab'); }
    const nf = Object.keys(S.f).length + (S.q ? 1 : 0);
    fab.innerHTML = `☰ Filters${nf ? ` <span class="badge">${nf}</span>` : ''}`; fab.setAttribute('aria-label', `Sections and filters${nf ? `, ${nf} in use` : ''}`);
    document.body.classList.toggle('rail-open', open);
    if (open) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); } else { el.removeAttribute('role'); el.removeAttribute('aria-modal'); }
    ['#view', '.toolbar', '.hero', 'footer.site'].forEach(sel => { const x = document.querySelector(sel); if (x) x.inert = open; });
    el.innerHTML = `<div class="rail-head"><span class="seg" role="group"><button type="button" data-rail-tab="sections" aria-pressed="${R.tab === 'sections'}">☰ Sections</button>` +
      `<button type="button" data-rail-tab="filters" aria-pressed="${R.tab === 'filters'}">⏚ Filters${Object.keys(S.f).length ? ` <span class="badge">${Object.keys(S.f).length}</span>` : ''}</button></span>` +
      (innerWidth >= PIN_MIN ? `<button type="button" class="btn small" data-rail-pin title="${pinned() ? 'Show the sidebar only when asked (☰)' : 'Keep the sidebar beside the page'}">${pinned() ? 'Unpin' : 'Pin'}</button>` : '') + `${pinned() ? '' : '<button type="button" class="btn small" data-rail-close aria-label="Close">×</button>'}</div>` +
      `<div class="rail-body">${R.tab === 'sections' ? sectionsTab() : filtersTab()}</div>` +
      (pinned() ? `<div class="rail-grip" role="separator" aria-orientation="vertical" aria-label="Sidebar width: drag, or use the arrow keys; double-click resets it" aria-valuenow="${Math.round(R.width || el.getBoundingClientRect().width)}" aria-valuemin="0" aria-valuemax="${innerWidth}" tabindex="0" data-rail-grip></div>` : '');
    if (R.tab === 'sections') requestAnimationFrame(watchSections);
    const kept = keep && el.querySelector(keep);
    if (kept) {
      kept.focus({ preventScroll: true });
      if (top0 != null) { const dy = kept.getBoundingClientRect().top - top0, sc = [el, el.querySelector('.rail-body')].find(x => x && x.scrollHeight > x.clientHeight && /auto|scroll/.test(getComputedStyle(x).overflowY)); if (sc) sc.scrollTop += dy; else scrollBy(0, dy); }
    }
    else if (open && !wasOpen) el.querySelector('[data-rail-tab][aria-pressed="true"]')?.focus();
    else if (!open && wasOpen) R.opener?.focus();
  }
  addEventListener('resize', () => { setRailWidth(); if (document.body.classList.contains('rail-pinned') !== pinned()) rail(); });
  // the width grip: drag (or arrow keys) to resize the pinned sidebar; double-click for the automatic width
  const saveWidth = () => { try { if (R.width) localStorage.setItem('ptmc-rail-w', String(Math.round(R.width))); else localStorage.removeItem('ptmc-rail-w'); } catch (e) { /* storage may be blocked */ } };
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest?.('[data-rail-grip]'); if (!g) return;
    e.preventDefault(); const rail0 = document.getElementById('rail').getBoundingClientRect(); g.setPointerCapture(e.pointerId);
    const move = ev => { R.width = ev.clientX - rail0.left; setRailWidth(); };
    const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); saveWidth(); };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
  });
  document.addEventListener('dblclick', e => { if (e.target.closest?.('[data-rail-grip]')) { R.width = 0; setRailWidth(); saveWidth(); } });
  document.addEventListener('keydown', e => { if (!e.target.closest?.('[data-rail-grip]') || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); R.width = (R.width || document.getElementById('rail').getBoundingClientRect().width) + (e.key === 'ArrowRight' ? 16 : -16); setRailWidth(); saveWidth(); });

  // ---- events ------------------------------------------------------------------------------------------------------
  K.clicks.push(
    // a class picked on a question's page selects it and returns to the Overview, where every question is tested again
    ['[data-f]', el => { const back = el.closest('.drow') && S.view === 'overview' && S.arg; if (back) S.arg = ''; toggle(el.dataset.f, el.dataset.v); if (back) scrollTo(0, 0); }],
    ['[data-sel-clear]', el => setFilter(el.dataset.selClear, [])],
    ['[data-sel-clear-q]', () => { S.q = (String(S.q).match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || []).filter(t => /^[a-z_][\w]*:.+$/i.test(t) && isTermKey(t.split(':')[0])).join(' '); K.writeHash(true); K.render(); }],
    ['[data-sel-drop-term]', el => { dropTerm(el.dataset.selDropTerm); K.writeHash(true); K.render(); }],
    ['[data-sel-clear-all]', () => clearAll()],
    ['[data-sel-copy]', el => { navigator.clipboard?.writeText(location.href).then(() => { el.textContent = 'Link copied'; setTimeout(() => { el.textContent = 'Copy link'; }, 1600); }); }],
    ['[data-sel-save]', () => save()],
    ['[data-fgroup-clear]', (el, e) => { e.preventDefault(); keysOf(groups()[+el.dataset.fgroupClear]).forEach(k => delete S.f[k]); K.writeHash(true); K.render(); }],
    ['[data-rail-tab]', el => { R.tab = el.dataset.railTab; try { localStorage.setItem('ptmc-rail-tab', R.tab); } catch (e) { /* */ } rail(); }],
    ['[data-saved-del]', el => { const list = savedList(); list.splice(+el.dataset.savedDel, 1); try { localStorage.setItem(`ptmc-saved-${D.site.id}`, JSON.stringify(list)); } catch (e) { /* */ } rail(); }],
    ['[data-rail-pin]', () => { R.pin = pinned() ? 'off' : innerWidth >= PIN_AUTO ? 'auto' : 'on'; R.open = false; try { localStorage.setItem('ptmc-rail', R.pin); } catch (e) { /* */ } rail(); if (!pinned()) { R.open = true; rail(); } }],
    ['[data-rail-close]', () => { R.open = false; rail(); }],
    ['[data-rail-open]', el => { R.opener = el; if (pinned()) { R.tab = el.dataset.railOpen || R.tab; rail(); document.querySelector('#rail [data-rail-tab]')?.focus(); return; } R.open = true; R.tab = el.dataset.railOpen || R.tab; rail(); }],
    ['[data-jump]', (el, e) => { e.preventDefault(); const t = document.getElementById(el.dataset.jump); if (t) { if (t.tagName === 'DETAILS') t.open = true; t.scrollIntoView({ behavior: K.smooth?.() || 'smooth', block: 'start' }); } }],
  );
  document.addEventListener('change', e => { const k = e.target.dataset?.fsel; if (k != null) setFilter(k, e.target.value ? [e.target.value] : []); });
  document.addEventListener('toggle', e => { const d = e.target; if (d.classList?.contains('fgroup')) { (R.openGroups ||= new Set())[d.open ? 'add' : 'delete'](+d.dataset.g); } }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && R.open) { R.open = false; rail(); } });

  Object.assign(K, { watchSections, sel: { ready, active, testable, rows, madeWith, describe, validKey, parse, nMarks, nProteins, protSelected, selectedPositions, selectedCountByProtein, bar, encode, decode, compute, data: () => SD, setHas: (aid, s, p) => !!setMembers[aid]?.[s]?.has(p), MIN: SEL_MIN, valueLabel, classLabel, listHtml, select, stateOfHash, savedList, termFilter, contrast, contrastGroups, featuresOf, STUDY, MIN_SIDE, refresh, lookup, nearSymbols, parsePattern, dropTerm, isTermKey, aliasesOf: i => aliasesOf[i] || [], nameOf, namesProteins: () => { const q = compute().q; return !!(q.genes.length || q.sites.length); } }, rail });
});
