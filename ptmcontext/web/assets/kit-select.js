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
  S.f = {};                                   // filter key -> [values]; keys a:<analysis>, p:<analysis>, t:<attribute>, n:<attribute>

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
  let setMembers = {};                         // analysis -> set name -> Set(protein index)
  function prepare() {
    setMembers = {};
    for (const [aid, ps] of Object.entries(SD.protein_sets || {})) setMembers[aid] = Object.fromEntries(ps.sets.map(([s, , m]) => [s, new Set(m)]));
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
  const keyName = key => { const [kind, id] = key.split(':'); return kind === 't' || kind === 'n' ? (SPECS[id]?.label || id) : (A[id]?.title || id); };
  function valueName(key, v) {
    const [kind, id] = key.split(':');
    if (kind === 'a') return classLabel(id, v);
    if (kind === 't') return valueLabel(id, v);
    if (kind === 'n') return `at least ${v}`;
    return (A[id]?.labels || {})[v] || v;
  }

  const validKey = key => { const [kind, id] = String(key).split(':'); return (kind === 'a' && A[id] && A[id].kind !== 'protein_sets') || (kind === 'p' && A[id]?.kind === 'protein_sets') || ((kind === 't' || kind === 'n') && !!SPECS[id]); };

  // ---- the search: proteins, sites and terms ---------------------------------------------------------------------
  // a gene, accession or entry name names all its marks; "GENE R216 R218" or "GENE 216" names those marks; key:value
  // terms filter (values joined by commas or |). A list of proteins is their union: a name in it with no marked protein
  // is reported (absent), not applied. Without any protein named, other words narrow by name; a word that matches
  // nothing is reported, not silently applied.
  function parse(q) {
    const out = { genes: [], words: [], sites: [], terms: [], unmatched: [], absent: [], ignored: [], ambiguous: [] };
    const raw = String(q || '').trim();
    const toks = raw.match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].replace(/[,;]+$/, ''), m = /^([a-z_][\w]*):(.+)$/i.exec(t);
      if (!t) continue;
      if (m) { out.terms.push([m[1].toLowerCase(), m[2].replace(/^"|"$/g, '')]); continue; }
      const prot = protOf(t);
      if (prot) {
        let j = i + 1, any = false;
        while (j < toks.length && /^[A-Z]?\d+[,;]?$/i.test(toks[j])) {
          // a token that is also a protein's name (F12) is that protein, unless it is a mark of the one before it
          const tok = toks[j].replace(/[,;]+$/, ''), pos = +tok.replace(/\D/g, ''), other = protOf(tok);
          if (other) { if (!prot.some(p => isMark(p.i, pos))) break; out.ambiguous.push([tok, prot[0].gene || prot[0].acc]); }
          prot.forEach(p => out.sites.push([p.i, pos])); any = true; j++;
        }
        if (!any) prot.forEach(p => out.genes.push(p.i));
        i = j - 1; continue;
      }
      const w = t.toLowerCase();
      if (P.some(p => (p.gene || '').toLowerCase().startsWith(w) || p.acc.toLowerCase().startsWith(w) || (p.name || '').toLowerCase().includes(w))) out.words.push(w);
      else out.unmatched.push(t);
    }
    // a list that names proteins: its other plain words are names with no marked protein, not filters on the names
    if (out.genes.length || out.sites.length) {
      const orig = w => toks.find(t => t.toLowerCase() === w) || w;
      out.ignored = out.words.map(orig); out.absent = out.unmatched; out.words = []; out.unmatched = [];
    }
    return out;
  }
  // a term key:value: an analysis (its class or set), or an attribute of the marks
  function termFilter([key, val]) {
    const vals = val.split(/[|,]/).map(v => v.trim()).filter(Boolean), low = v => String(v).toLowerCase();
    if (A[key] && SD && A[key].kind !== 'protein_sets') {
      const codes = SD.classes[key] || [];
      // an exact code or label first; a prefix only when nothing matches exactly
      return ['a:' + key, vals.flatMap(v => { const ex = codes.filter(c => low(c) === low(v) || low(classLabel(key, c)) === low(v)); return ex.length ? ex : codes.filter(c => low(c).startsWith(low(v)) || low(classLabel(key, c)).startsWith(low(v))); })];
    }
    if (A[key] && SD) {
      const names = Object.keys(setMembers[key] || {});
      return ['p:' + key, vals.flatMap(v => names.filter(s => low(s) === low(v) || low((A[key].labels || {})[s] || '').includes(low(v))))];
    }
    if (SPECS[key] && SD) {
      if (SPECS[key].kind === 'number') return ['n:' + key, [vals[0]]];
      return ['t:' + key, vals.flatMap(v => SD.attributes[key].filter(x => low(x) === low(v) || low(valueLabel(key, x)).includes(low(v))))];
    }
    return null;
  }
  // every constraint of a search and filters: [key, values, from the search?]; terms that match nothing are kept
  // aside, to be reported
  function constraintsOf(qText, f) {
    const out = Object.entries(f || {}).filter(([k, v]) => v && v.length && validKey(k)).map(([k, v]) => [k, v, false]), unresolved = [];
    if (SD) parse(qText).terms.forEach(t => { const r = termFilter(t); if (r && r[1].length) out.push([...r, true]); else unresolved.push(t.join(':')); });
    return { cons: out, unresolved };
  }

  // ---- which marks pass ------------------------------------------------------------------------------------------
  // select(q, f): the marks a search and filters select, without touching the page's own state (a saved selection
  // can be evaluated beside the current one); compute() is the current selection, cached
  function select(qText, f) {
    const q = parse(qText), { cons, unresolved } = constraintsOf(qText, f);
    const active = !!(q.genes.length || q.words.length || q.sites.length || cons.length || q.unmatched.length || unresolved.length);
    let marks = null, proteins = null;
    if (SD && active) {
      // proteins named by the search (a gene or accession names all its marks; "GENE R216" names one mark)
      const genes = new Set(q.genes), sites = new Set(q.sites.map(([p, pos]) => p + ':' + pos)), named = genes.size || sites.size;
      const wordHit = p => q.words.every(w => (p.gene || '').toLowerCase().startsWith(w) || p.acc.toLowerCase().startsWith(w) || (p.name || '').toLowerCase().includes(w));
      const protOk = P.map(p => !q.words.length || wordHit(p));
      const tests = cons.map(([key, vals]) => {
        const [kind, id] = key.split(':');
        if (kind === 'a') { const ai = AN().indexOf(id), codes = new Set(vals.map(v => SD.classes[id].indexOf(v))); return m => m[2][ai].some(c => codes.has(c)); }
        if (kind === 'p') { const sets = vals.map(v => setMembers[id]?.[v]).filter(Boolean); return m => sets.some(s => s.has(m[0])); }
        if (kind === 't') { const ti = AT().indexOf(id), codes = new Set(vals.map(v => SD.attributes[id].indexOf(v))); return m => m[3][ti].some(c => codes.has(c)); }
        if (kind === 'n') { const ti = AT().indexOf(id), min = +vals[0], num = SD.numbers[id]; return m => m[3][ti].some(c => num[c] >= min); }
        return () => true;
      });
      marks = [];
      SD.marks.forEach((m, i) => {
        if (!protOk[m[0]]) return;
        if (named && !genes.has(m[0]) && !sites.has(m[0] + ':' + m[1])) return;
        if (tests.every(t => t(m))) marks.push(i);
      });
      proteins = new Set(marks.map(i => SD.marks[i][0]));
    }
    // nothing at all named by the search: no marks (the bar says which words and terms matched nothing)
    if (SD && active && !q.genes.length && !q.words.length && !q.sites.length && !cons.length) { marks = []; proteins = new Set(); }
    return { active, marks, proteins, cons, q, unresolved };
  }
  let cache = { key: null };
  const stateKey = () => JSON.stringify([S.q, S.f, !!SD]);
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
    const codes = SD.classes[aid], others = SD.others[aid] || {};
    const byProt = {};
    compute().marks.forEach(i => { const m = SD.marks[i]; if (SD.others_total[m[0]] > 0) (byProt[m[0]] ||= []).push(m[2][ai]); });
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
    const inBg = new Set(ps.in_background), sel = [...compute().proteins].filter(p => inBg.has(p)), n = sel.length, N = ps.N;
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
      return { g1: c.marks.filter(i => !in2.has(i)), g2: oth.filter(i => !in1.has(i)), shared: c.marks.filter(i => in2.has(i)).length, cons: [...c.cons, ...o.cons], other: o, otherState: st };
    }
    const in1 = new Set(c.marks);
    return { g1: c.marks, g2: SD.marks.map((_, i) => i).filter(i => !in1.has(i)), shared: 0, cons: c.cons };
  }
  const woolf = (a, b, c, d) => { const or = ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)), se = Math.sqrt(1 / (a + 0.5) + 1 / (b + 0.5) + 1 / (c + 0.5) + 1 / (d + 0.5)); return [Math.exp(Math.log(or) - 1.959963984540054 * se), Math.exp(Math.log(or) + 1.959963984540054 * se)]; };
  // circular: a question either selection was made with, or one reading the same inputs
  function circularFor(qid, cons) {
    const mine = qid[0] === '@' ? new Set(['t:' + qid.slice(1), 'n:' + qid.slice(1)]) : rolesOf(qid);
    return cons.some(([k]) => { const id = k.split(':')[1]; return qid[0] === '@' ? mine.has(k) : [...rolesOf(id)].some(x => mine.has(x)); });
  }
  function contrastResidue(qid, method, G) {
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
    const inBg = new Set(ps.in_background), prot = idx => new Set(idx.map(i => SD.marks[i][0]).filter(p => inBg.has(p)));
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
    const id = key.split(':')[1];
    S.q = S.q.replace(new RegExp(`(^|\\s)${id}:(\\S+)`, 'gi'), (m0, pre, vals) => {
      const left = vals.split(/[|,]/).filter(x => { const f = termFilter([id, x]); return !(f && f[1].includes(v)); });
      return left.length ? `${pre}${id}:${left.join(',')}` : '';
    }).replace(/\s+/g, ' ').trim();
  }
  function toggle(key, v) {
    if (termValues(key).includes(v)) { dropTermValue(key, v); K.writeHash(true); K.render(); return; }
    const cur = new Set(S.f[key] || []); if (cur.has(v)) cur.delete(v); else cur.add(v); setFilter(key, [...cur]);
  }
  function clearAll() { S.f = {}; S.q = ''; K.writeHash(true); K.render(); }

  // ---- the selection bar -----------------------------------------------------------------------------------------
  function chipsHtml() {
    const c = compute(), out = [];
    if (S.q) out.push(`<span class="sel-chip">Search: <b>${esc(S.q)}</b><button type="button" data-sel-clear-q aria-label="Remove the search">×</button></span>`);
    c.cons.filter(([, , fromSearch]) => !fromSearch).forEach(([k, v]) => out.push(`<span class="sel-chip">${esc(keyName(k))}: <b>${esc(v.map(x => valueName(k, x)).join(' or '))}</b><button type="button" data-sel-clear="${esc(k)}" aria-label="Remove">×</button></span>`));
    return out.join('<span class="sel-and">and</span>');
  }
  function bar() {
    if (!active()) return null;
    const c = compute();
    if (!SD) return `<span class="sel-flag">Selection</span><span>Loading the ${esc(W.marks)}…</span>`;
    const n = c.marks.length, np = c.proteins.size, nCons = c.cons.filter(x => !x[2]).length + (S.q ? 1 : 0);
    const miss = [...c.unresolved, ...c.q.unmatched], absent = c.q.absent || [], ignored = c.q.ignored || [], amb = c.q.ambiguous || [];
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
  const R = { tab: (() => { try { return localStorage.getItem('ptmc-rail-tab') || 'filters'; } catch (e) { return 'filters'; } })(),
    pinned: (() => { try { const v = localStorage.getItem('ptmc-rail-pin'); return v == null ? innerWidth >= 1280 : v === '1'; } catch (e) { return innerWidth >= 1280; } })(), open: false };
  // the groups: from the site file, or one per section of residue questions, protein-set questions and attributes
  function groups() {
    if (D.filters && D.filters.length) return D.filters.map(g => ({ ...g, analyses: (g.analyses || []).filter(a => A[a]), attributes: (g.attributes || []).filter(k => SPECS[k]) }));
    const out = [], seen = {};
    D.analyses.forEach(a => { const g = seen[a.section] || (seen[a.section] = out[out.push({ name: a.section || 'Questions', analyses: [] }) - 1]); g.analyses.push(a.id); });
    const attrs = Object.entries(SPECS).filter(([, s]) => s.filter).map(([k]) => k);
    if (attrs.length) out.push({ name: 'Marks', attributes: attrs });
    return out;
  }
  function countFor(key, v) {
    if (!SD) return null;
    const [kind, id] = key.split(':');
    if (kind === 'a') { const ai = AN().indexOf(id), c = SD.classes[id].indexOf(v); return SD.marks.reduce((n, m) => n + (m[2][ai].includes(c) ? 1 : 0), 0); }
    if (kind === 't') { const ti = AT().indexOf(id), c = SD.attributes[id].indexOf(v); return SD.marks.reduce((n, m) => n + (m[3][ti].includes(c) ? 1 : 0), 0); }
    if (kind === 'p') return setMembers[id]?.[v]?.size ?? null;
    return null;
  }
  const counts = {};
  const cnt = (key, v) => (counts[key + '\u0000' + v] ??= countFor(key, v));
  function control(key) {
    const [kind, id] = key.split(':'), on = new Set([...(S.f[key] || []), ...termValues(key)]);
    const chip = (v, lab, n) => `<button type="button" class="fchip" data-f="${esc(key)}" data-v="${esc(v)}" aria-pressed="${on.has(v)}">${esc(lab)}${n != null ? ` <span class="muted">${int(n)}</span>` : ''}</button>`;
    if (kind === 'a') {
      const codes = (SD?.classes[id] || Object.keys(A[id]?.labels || {})).filter(c => !/^(no |not |unknown|unassigned)/i.test(classLabel(id, c)) && cnt(key, c) !== 0);
      return `<div class="fctl"><p class="flabel">${esc(A[id].title)}</p><div class="fchips">${codes.map(c => chip(c, classLabel(id, c), cnt(key, c))).join('')}</div></div>`;
    }
    if (kind === 'p') {
      const names = Object.keys(setMembers[id] || {}).filter(x => cnt(key, x)).sort((x, y) => (cnt(key, y) || 0) - (cnt(key, x) || 0));
      return `<div class="fctl"><p class="flabel">${esc(A[id].title)} <span class="muted">(${esc(W.marked)} proteins)</span></p><select data-fsel="${esc(key)}"><option value="">Any</option>` +
        names.map(s => `<option value="${esc(s)}"${on.has(s) ? ' selected' : ''}>${esc((A[id].labels || {})[s] || s)} (${int(cnt(key, s))})</option>`).join('') + '</select></div>';
    }
    const spec = SPECS[id] || {};
    if (spec.kind === 'number') {
      const top = SD ? Math.max(...SD.numbers[id]) : 5, cur = S.f['n:' + id]?.[0] || '';
      return `<div class="fctl"><p class="flabel">${esc(spec.label)}</p><select data-fsel="n:${esc(id)}"><option value="">Any</option>` +
        [2, 3, 4, 5, 10].filter(v => v <= top).map(v => `<option value="${v}"${String(v) === cur ? ' selected' : ''}>${v} or more</option>`).join('') + '</select></div>';
    }
    const vals = (SD ? SD.attributes[id] : Object.keys(spec.values || {})).filter(v => cnt('t:' + id, v) !== 0);
    const order = spec.values ? Object.keys(spec.values) : [];
    const sorted = [...vals].sort((x, y) => (order.includes(x) ? order.indexOf(x) : 999) - (order.includes(y) ? order.indexOf(y) : 999) || (cnt('t:' + id, y) || 0) - (cnt('t:' + id, x) || 0));
    return `<div class="fctl"><p class="flabel" title="${esc(spec.help || '')}">${esc(spec.label)}${spec.kind === 'list' ? ' <span class="muted">(match any)</span>' : ''}</p><div class="fchips">` +
      sorted.map(v => chip(v, valueLabel(id, v), cnt('t:' + id, v))).join('') + '</div></div>';
  }
  function keysOf(g) {
    return [...(g.analyses || []).map(aid => (A[aid]?.kind === 'protein_sets' ? 'p:' : 'a:') + aid), ...(g.attributes || []).map(k => (SPECS[k]?.kind === 'number' ? 'n:' : 't:') + k)];
  }
  function filtersTab() {
    const gs = groups();
    return `<div class="rail-sel">${bar() || `<span>All <b>${int(D.counts.marks)}</b> ${esc(W.marks)} on <b>${int(D.counts.proteins)}</b> proteins</span>`}</div>${savedHtml()}` +
      `<p class="rail-note">Each filter narrows the selection; a ${esc(W.mark)} must match all of them. Every page then shows the selection, and its tests run again on it.</p>` +
      gs.map((g, gi) => {
        const keys = keysOf(g), n = keys.filter(k => S.f[k]?.length || termValues(k).length).length;
        return `<details class="fgroup${n ? ' active' : ''}" data-g="${gi}"${R.openGroups?.has(gi) ? ' open' : ''}><summary><span>${esc(g.name)}</span>${n ? `<span class="badge">${n}</span><button type="button" class="linkish small" data-fgroup-clear="${gi}">Clear</button>` : ''}</summary>` +
          keys.map(control).join('') + '</details>';
      }).join('') +
      `<div class="rail-foot"><span><b>${int(nMarks())}</b> ${esc(nMarks() === 1 ? W.mark : W.marks)} on <b>${int(nProteins())}</b> protein${nProteins() === 1 ? '' : 's'}${active() ? '' : ' (all)'}</span>${active() ? '<button class="linkish" type="button" data-sel-clear-all>Clear all</button>' : ''}</div>`;
  }
  function sectionsTab() {
    const pages = [['overview', 'Overview'], ...K.tabs.map(f => f()).filter(Boolean).map(([v, n]) => [v, n]), ['statistics', 'Statistics'], ['method', 'Method']];
    const here = K.sections?.[S.view]?.() || [];
    return '<nav class="toc">' + pages.map(([v, n]) => `<a href="#${v}" class="${S.view === v || K.views[S.view]?.tab === v ? 'on' : ''}">${esc(n)}</a>` +
      (S.view === v || K.views[S.view]?.tab === v ? here.map(([id, lab, lvl]) => `<a href="${esc(location.hash)}" data-jump="${esc(id)}" class="sub l${lvl || 1}">${esc(lab)}</a>`).join('') : '')).join('') + '</nav>';
  }
  const pinned = () => R.pinned && innerWidth >= 1100;
  function rail() {
    const el = document.getElementById('rail'); if (!el) return;
    const ae = document.activeElement, keep = ae && el.contains(ae) ? (ae.dataset.f ? `[data-f="${CSS.escape(ae.dataset.f)}"][data-v="${CSS.escape(ae.dataset.v)}"]` : ae.dataset.fsel ? `[data-fsel="${CSS.escape(ae.dataset.fsel)}"]` : ae.dataset.railTab ? `[data-rail-tab="${ae.dataset.railTab}"]` : null) : null;
    const wasOpen = document.body.classList.contains('rail-open'), open = !pinned() && R.open;
    document.body.classList.toggle('rail-pinned', pinned());
    document.body.classList.toggle('rail-open', open);
    if (open) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); } else { el.removeAttribute('role'); el.removeAttribute('aria-modal'); }
    ['#view', '.toolbar', '.hero', 'footer.site'].forEach(sel => { const x = document.querySelector(sel); if (x) x.inert = open; });
    el.innerHTML = `<div class="rail-head"><span class="seg" role="group"><button type="button" data-rail-tab="sections" aria-pressed="${R.tab === 'sections'}">☰ Sections</button>` +
      `<button type="button" data-rail-tab="filters" aria-pressed="${R.tab === 'filters'}">⏚ Filters${Object.keys(S.f).length ? ` <span class="badge">${Object.keys(S.f).length}</span>` : ''}</button></span>` +
      `<button type="button" class="btn small" data-rail-pin>${R.pinned ? 'Unpin' : 'Pin'}</button>${R.pinned ? '' : '<button type="button" class="btn small" data-rail-close aria-label="Close">×</button>'}</div>` +
      `<div class="rail-body">${R.tab === 'sections' ? sectionsTab() : filtersTab()}</div>`;
    if (keep) el.querySelector(keep)?.focus();
    else if (open && !wasOpen) el.querySelector('[data-rail-tab][aria-pressed="true"]')?.focus();
    else if (!open && wasOpen) R.opener?.focus();
  }
  addEventListener('resize', () => { if (document.body.classList.contains('rail-pinned') !== pinned()) rail(); });

  // ---- events ------------------------------------------------------------------------------------------------------
  K.clicks.push(
    ['[data-f]', el => toggle(el.dataset.f, el.dataset.v)],
    ['[data-sel-clear]', el => setFilter(el.dataset.selClear, [])],
    ['[data-sel-clear-q]', () => { S.q = ''; K.writeHash(true); K.render(); }],
    ['[data-sel-clear-all]', () => clearAll()],
    ['[data-sel-copy]', el => { navigator.clipboard?.writeText(location.href).then(() => { el.textContent = 'Link copied'; setTimeout(() => { el.textContent = 'Copy link'; }, 1600); }); }],
    ['[data-sel-save]', () => save()],
    ['[data-fgroup-clear]', (el, e) => { e.preventDefault(); keysOf(groups()[+el.dataset.fgroupClear]).forEach(k => delete S.f[k]); K.writeHash(true); K.render(); }],
    ['[data-rail-tab]', el => { R.tab = el.dataset.railTab; try { localStorage.setItem('ptmc-rail-tab', R.tab); } catch (e) { /* */ } rail(); }],
    ['[data-saved-del]', el => { const list = savedList(); list.splice(+el.dataset.savedDel, 1); try { localStorage.setItem(`ptmc-saved-${D.site.id}`, JSON.stringify(list)); } catch (e) { /* */ } rail(); }],
    ['[data-rail-pin]', () => { R.pinned = !R.pinned; R.open = false; try { localStorage.setItem('ptmc-rail-pin', R.pinned ? '1' : '0'); } catch (e) { /* */ } rail(); }],
    ['[data-rail-close]', () => { R.open = false; rail(); }],
    ['[data-rail-open]', el => { R.opener = el; if (pinned()) { R.tab = el.dataset.railOpen || R.tab; rail(); document.querySelector('#rail [data-rail-tab]')?.focus(); return; } R.open = true; R.tab = el.dataset.railOpen || R.tab; rail(); }],
    ['[data-jump]', (el, e) => { e.preventDefault(); const t = document.getElementById(el.dataset.jump); if (t) { if (t.tagName === 'DETAILS') t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }],
  );
  document.addEventListener('change', e => { const k = e.target.dataset?.fsel; if (k != null) setFilter(k, e.target.value ? [e.target.value] : []); });
  document.addEventListener('toggle', e => { const d = e.target; if (d.classList?.contains('fgroup')) { (R.openGroups ||= new Set())[d.open ? 'add' : 'delete'](+d.dataset.g); } }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && R.open) { R.open = false; rail(); } });

  Object.assign(K, { sel: { ready, active, testable, rows, madeWith, describe, validKey, parse, nMarks, nProteins, protSelected, selectedPositions, selectedCountByProtein, bar, encode, decode, compute, data: () => SD, MIN: SEL_MIN, valueLabel, classLabel, listHtml, select, stateOfHash, savedList, termFilter, contrast, contrastGroups, featuresOf, STUDY, MIN_SIDE, namesProteins: () => { const q = compute().q; return !!(q.genes.length || q.sites.length); } }, rail });
});
