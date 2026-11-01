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
  const P = (D.proteins || []).map(([acc, gene, name, len, marks, cand], i) => ({ i, acc, gene, name, len, marks, cand }));
  const byAcc = Object.fromEntries(P.map(p => [p.acc, p]));
  const byGene = {}; P.forEach(p => String(p.gene || '').split(/[\s;]+/).filter(Boolean).forEach(g => { (byGene[g.toUpperCase()] ||= []).push(p); }));
  S.f = {};                                   // filter key -> [values]; keys a:<analysis>, p:<analysis>, t:<attribute>, n:<attribute>

  // ---- the data: every mark with its classes and attributes (data/selection.json, or inlined) ----------------------
  let SD = null;
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
  // a gene or accession names all its marks; "GENE R216 R218" or "GENE 216" names those marks; key:value terms filter
  // (values joined by commas or |); words that name no protein narrow by name, and a word that matches nothing is
  // reported, not silently applied
  function parse(q) {
    const out = { genes: [], words: [], sites: [], terms: [], unmatched: [] };
    const raw = String(q || '').trim();
    const toks = raw.match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].replace(/[,;]+$/, ''), m = /^([a-z_][\w]*):(.+)$/i.exec(t);
      if (!t) continue;
      if (m) { out.terms.push([m[1].toLowerCase(), m[2].replace(/^"|"$/g, '')]); continue; }
      const prot = byGene[t.toUpperCase()] || (byAcc[t.toUpperCase()] ? [byAcc[t.toUpperCase()]] : null);
      if (prot) {
        let j = i + 1, any = false;
        while (j < toks.length && /^[A-Z]?\d+[,;]?$/i.test(toks[j])) { const pos = +toks[j].replace(/\D/g, ''); prot.forEach(p => out.sites.push([p.i, pos])); any = true; j++; }
        if (!any) prot.forEach(p => out.genes.push(p.i));
        i = j - 1; continue;
      }
      const w = t.toLowerCase();
      if (P.some(p => (p.gene || '').toLowerCase().startsWith(w) || p.acc.toLowerCase().startsWith(w) || (p.name || '').toLowerCase().includes(w))) out.words.push(w);
      else out.unmatched.push(t);
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
  // every constraint: [key, values, from the search?]; terms that match nothing are kept aside, to be reported
  let unresolved = [];
  function constraints() {
    const out = Object.entries(S.f).filter(([k, v]) => v && v.length && validKey(k)).map(([k, v]) => [k, v, false]);
    unresolved = [];
    if (SD) parse(S.q).terms.forEach(t => { const f = termFilter(t); if (f && f[1].length) out.push([...f, true]); else unresolved.push(t.join(':')); });
    return out;
  }

  // ---- which marks pass ------------------------------------------------------------------------------------------
  let cache = { key: null };
  const stateKey = () => JSON.stringify([S.q, S.f, !!SD]);
  function compute() {
    if (cache.key === stateKey()) return cache;
    const q = parse(S.q), cons = constraints();
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
    cache = { key: stateKey(), active, marks, proteins, cons, q, unresolved: [...unresolved], retests: {} };
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
    const q = ST.bh(rows.map(r => r.p)); rows.forEach((r, k) => { r.q = madeWith(aid) || r.a === n ? null : q[k]; r.descriptive = madeWith(aid) || r.a === n; });
    return rows;
  }
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
  function decode(s) {
    S.f = {};
    String(s || '').split(';').filter(Boolean).forEach(part => {
      const [k, v] = part.split('~'); if (!k || !v || !validKey(k)) return;
      const vals = v.split('|').map(dec).filter(x => x != null); if (vals.length) S.f[k] = vals;
    });
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
    const miss = [...c.unresolved, ...c.q.unmatched];
    return `<span class="sel-flag">Selection</span><span><b>${int(n)}</b> of ${int(D.counts.marks)} ${esc(W.marks)} on <b>${int(np)}</b> protein${np === 1 ? '' : 's'}${nCons > 1 ? ', matching all of' : ''}</span>${chipsHtml()}` +
      (miss.length ? `<span class="sel-miss" title="Terms are key:value, where the key is a question (${esc(D.analyses.map(a => a.id).join(', '))}) or an attribute (${esc(Object.keys(SPECS).join(', ') || 'none')})">Nothing matches ${miss.map(x => `<b>${esc(x)}</b>`).join(', ')}</span>` : '') +
      `<span class="sel-tools"><button class="btn small" type="button" data-sel-save title="Keep this selection in this browser; saved ones are listed under Filters">Save</button>` +
      `<button class="btn small" type="button" data-sel-copy>Copy link</button><button class="btn small accent" type="button" data-sel-clear-all>Clear all</button></span>`;
  }
  // saved selections, in this browser
  const savedList = () => { try { return JSON.parse(localStorage.getItem(`ptmc-saved-${D.site.id}`) || '[]'); } catch (e) { return []; } };
  function savedHtml() {
    const list = savedList(); if (!list.length) return '';
    return `<div class="saved"><p class="flabel">Saved selections</p>${list.map((x, i) => `<div class="saved-row"><a href="${esc(x.hash)}">${esc(x.name)}</a> <span class="muted">${int(x.n)}</span><button type="button" class="linkish small" data-saved-del="${i}" aria-label="Delete ${esc(x.name)}">×</button></div>`).join('')}</div>`;
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

  Object.assign(K, { sel: { ready, active, testable, rows, madeWith, describe, validKey, parse, nMarks, nProteins, protSelected, selectedPositions, selectedCountByProtein, bar, encode, decode, compute, data: () => SD, MIN: SEL_MIN, valueLabel, classLabel, listHtml }, rail });
});
