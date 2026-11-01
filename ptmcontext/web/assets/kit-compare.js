/* Comparisons of marks with marks: what sets a selection apart from the other marks (#apart), and two selections side
   by side (#compare/<the first one's search and filters>, the second being the current selection).

   Every feature the site knows is compared: each class of each residue question, each value of the marks' attributes
   (a number attribute at 2, 3 and 5 or more), and each tested set of each protein-set question (a mark on a protein in
   the set). For each, the share of the first group's marks that have it against the share of the second's:
     pooled          Fisher's exact test on the two groups of marks, with the Haldane–Anscombe odds ratio
     within protein  the same 2×2 within each protein that has marks in both groups (Mantel–Haenszel odds ratio, its
                     95% CI and the continuity-corrected CMH test): a difference that holds there is not a difference
                     between the proteins the two groups come from (a protein's sets are the same on both sides, so
                     protein-set features have no within-protein test)
   q is Benjamini–Hochberg within each question or attribute, for each test. The questions a selection was made with are
   left out (their answer would be circular). Two selections that share marks are compared without the shared ones.
   Marks of one protein are not independent, so these comparisons are pointers, not confirmations; the page says so.
   A module of the site kit; it reads the selection data (kit-select.js) and the tests (kit-stats.js). */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, cap, fxn, fq } = K;
  const ST = window.PTMC_STATS;
  const SD = () => K.sel.data();
  const MIN = 10, PADJ = 0.05, FOLD = 1.1;
  const pc = (k, n) => (n ? `${(100 * k / n).toFixed(k / n < 0.1 ? 1 : 0)}%` : '–');
  const dirOf = (or, q) => (q == null || or == null ? 'ns' : q > PADJ ? 'ns' : or >= FOLD ? 'more' : or <= 1 / FOLD ? 'less' : 'same');

  // ---- the features ------------------------------------------------------------------------------------------------
  let FEATS = null;
  function features() {
    if (FEATS) return FEATS;
    const sd = SD(), out = [];
    sd.analyses.forEach((aid, ai) => {
      const a = A[aid]; if (!a) return;
      sd.classes[aid].forEach((cls, ci) => out.push({ key: 'a:' + aid, value: cls, group: a.title, label: K.sel.classLabel(aid, cls), help: (a.help || {})[cls] || '', has: m => m[2][ai].includes(ci) }));
    });
    (sd.attribute_names || []).forEach((name, ti) => {
      const s = (D.attribute_specs || {})[name] || {};
      if (s.kind === 'number') {
        const nums = (sd.numbers || {})[name] || sd.attributes[name].map(Number), max = Math.max(...nums.filter(Number.isFinite));
        [2, 3, 5].filter(t => t <= max).forEach(t => out.push({ key: 'n:' + name, value: String(t), group: s.label || name, label: `${t} or more`, help: s.help || '', has: m => m[3][ti].some(c => nums[c] >= t) }));
        return;
      }
      sd.attributes[name].forEach((v, ci) => { if (v !== '') out.push({ key: 't:' + name, value: v, group: s.label || name, label: K.sel.valueLabel(name, v), help: s.help || '', has: m => m[3][ti].includes(ci) }); });
    });
    Object.entries(sd.protein_sets || {}).forEach(([aid, ps]) => {
      const a = A[aid]; if (!a) return;
      ps.sets.forEach(([s, , members]) => out.push({ key: 'p:' + aid, value: s, group: a.title, label: (a.labels || {})[s] || s, help: '', members }));
    });
    return (FEATS = out);
  }

  // ---- the comparison ----------------------------------------------------------------------------------------------
  // marks (indices into the selection data) of group 1 against group 2, which must not share any
  function compare(idx1, idx2, skipKeys) {
    const sd = SD(), m1 = idx1.map(i => sd.marks[i]), m2 = idx2.map(i => sd.marks[i]), n1 = m1.length, n2 = m2.length;
    const per = new Map(), c1 = {}, c2 = {};
    m1.forEach(m => { (per.get(m[0]) || per.set(m[0], [[], []]).get(m[0]))[0].push(m); c1[m[0]] = (c1[m[0]] || 0) + 1; });
    m2.forEach(m => { (per.get(m[0]) || per.set(m[0], [[], []]).get(m[0]))[1].push(m); c2[m[0]] = (c2[m[0]] || 0) + 1; });
    const shared = [...per.values()].filter(([x, y]) => x.length && y.length);
    const rows = features().filter(f => !skipKeys.has(f.key)).map(f => {
      let a = 0, c = 0, mh = null;
      if (f.members) { for (const p of f.members) { a += c1[p] || 0; c += c2[p] || 0; } }
      else { for (const m of m1) if (f.has(m)) a++; for (const m of m2) if (f.has(m)) c++; }
      if (a + c < 5 || (a === n1 && c === n2)) return null;
      const fi = ST.fisher(a, n1 - a, c, n2 - c);
      if (!f.members) mh = ST.mh(shared.map(([x, y]) => { const ax = x.filter(f.has).length, cy = y.filter(f.has).length; return [ax, x.length - ax, cy, y.length - cy]; }));
      return { f, a, c, n1, n2, or: fi.or, p: fi.p, mh };
    }).filter(Boolean);
    // BH within each question or attribute, for each test
    const groups = {}; rows.forEach(r => (groups[r.f.key] ||= []).push(r));
    Object.values(groups).forEach(g => {
      ST.bh(g.map(r => r.p)).forEach((q, k) => { g[k].q = q; g[k].dir = dirOf(g[k].or, q); });
      const w = g.filter(r => r.mh && r.mh.p != null);
      ST.bh(w.map(r => r.mh.p)).forEach((q, k) => { w[k].mh.q = q; w[k].mh.dir = dirOf(w[k].mh.or, q); });
    });
    rows.sort((x, y) => (x.q - y.q) || Math.abs(Math.log(y.or)) - Math.abs(Math.log(x.or)));
    return { rows, n1, n2, shared: shared.length, proteins1: Object.keys(c1).length, proteins2: Object.keys(c2).length, c1, c2 };
  }
  // the filter keys a selection was made with, and those reading the same data, are left out of its comparison
  function circularKeys(...states) {
    const keys = new Set(), roles = new Set();
    states.forEach(st => st.cons.forEach(([k]) => { keys.add(k); (A[k.split(':')[1]]?.roles || []).forEach(r => roles.add(r)); }));
    D.analyses.forEach(a => { if ((a.roles || []).some(r => roles.has(r))) { keys.add('a:' + a.id); keys.add('p:' + a.id); } });
    return keys;
  }

  // ---- the page ----------------------------------------------------------------------------------------------------
  const V = { all: false, cache: { key: null } };
  const DIRW = { more: 'more often', less: 'less often', same: 'about the same', ns: 'no difference' };
  const cell = (k, n) => `${int(k)} <span class="muted">of ${int(n)} (${pc(k, n)})</span>`;
  const orCell = (or, lo, hi, q, dir) => (or == null ? '<span class="muted">–</span>' : `<span class="val ${dir}">${or >= 1000 ? '> 1,000' : fxn(or)}</span>${lo != null ? ` <span class="muted">(${fxn(lo)} to ${fxn(hi)})</span>` : ''}<br><span class="muted">q ${fq(q)}</span>`);
  function table(res, names, clickable) {
    const sig = res.rows.filter(r => r.dir !== 'ns' || (r.mh && r.mh.dir && r.mh.dir !== 'ns'));
    const shown = (V.all ? res.rows : sig).slice(0, V.all ? 400 : 60);
    const head = `<thead><tr><th>Feature</th><th class="num">${esc(names[0])}</th><th class="num">${esc(names[1])}</th><th class="num">Pooled: OR, q</th><th class="num">Within proteins: OR (95% CI), q</th><th class="num">Proteins</th></tr></thead>`;
    const body = shown.map(r => `<tr${clickable && r.dir === 'more' ? ` class="pick" data-f="${esc(r.f.key)}" data-v="${esc(r.f.value)}" tabindex="0" title="Narrow the selection to the ${esc(W.marks)} with this feature"` : ''}${r.dir === 'ns' && !(r.mh && r.mh.dir !== 'ns') ? ' class="faded"' : ''}>` +
      `<td class="wrapok"><span class="muted small">${esc(r.f.group)}</span><br><span title="${esc(r.f.help)}">${esc(r.f.label)}</span></td>` +
      `<td class="num">${cell(r.a, r.n1)}</td><td class="num">${cell(r.c, r.n2)}</td><td class="num">${orCell(r.or, null, null, r.q, r.dir)}</td>` +
      `<td class="num">${r.mh ? orCell(r.mh.or, r.mh.lo, r.mh.hi, r.mh.q, r.mh.dir || 'ns') : '<span class="muted" title="A protein’s sets are the same on both sides">–</span>'}</td><td class="num">${r.mh && r.mh.strata ? int(r.mh.strata) : ''}</td></tr>`).join('');
    return `<div class="tbl-card"><table class="tbl cmp-tbl">${head}<tbody>${body || `<tr><td colspan="6" class="muted">No feature differs (q ≤ ${PADJ} in either test).</td></tr>`}</tbody></table></div>` +
      `<p><button class="linkish" type="button" data-cmp-all>${V.all ? `Only the features that differ (${int(sig.length)})` : `Every feature tested (${int(res.rows.length)})`}</button></p>`;
  }
  const inWords = (res, names) => {
    const up = res.rows.filter(r => r.dir === 'more').slice(0, 3), dn = res.rows.filter(r => r.dir === 'less').slice(0, 3);
    const one = r => `<b>${esc(r.f.label)}</b> <span class="muted">(${esc(r.f.group.toLowerCase())}: ${pc(r.a, r.n1)} against ${pc(r.c, r.n2)}${r.mh && r.mh.dir === r.dir ? ', and within proteins' : r.mh && r.mh.or != null ? ', not within proteins' : ''})</span>`;
    return `<p>${up.length ? `More often in ${esc(names[0])}: ${up.map(one).join('; ')}.` : ''} ${dn.length ? `Less often: ${dn.map(one).join('; ')}.` : ''}${!up.length && !dn.length ? `No feature differs between ${esc(names[0])} and ${esc(names[1])} at q ≤ ${PADJ}.` : ''}</p>`;
  };
  const method = (left, overlap) => `<p class="note">Each feature is compared between the two groups of ${esc(W.marks)}: pooled (Fisher’s exact test, Haldane–Anscombe odds ratio) and within each protein that has ${esc(W.marks)} in both (Mantel–Haenszel odds ratio, its 95% CI, the continuity-corrected CMH test), so that a difference that holds within proteins is not a difference between the proteins the groups come from. q is Benjamini–Hochberg within each question or attribute, for each test; a feature differs at q ≤ ${PADJ} and at least ${FOLD}×. ${left.length ? `Left out, as circular: ${esc(left.join(', '))}. ` : ''}${overlap ? `The ${int(overlap)} ${esc(W.marks)} in both selections are left out of both sides. ` : ''}${cap(W.marks)} of one protein are not independent: read these as pointers, and test a result that matters on its own data.</p>`;
  const topProteins = (res, names) => [[res.c1, res.c2, names[0]], [res.c2, res.c1, names[1]]].map(([mine, other, name]) => `<div><div class="tbl-card"><table class="tbl"><thead><tr><th>Proteins: ${esc(name)}</th><th class="num">${esc(cap(W.marks))}</th><th class="num">In the other</th></tr></thead><tbody>` +
    Object.entries(mine).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([pi, k]) => { const p = D.proteins[pi]; return `<tr data-acc="${esc(p[0])}"><td><a href="#protein/${esc(p[0])}"><b>${esc(p[1] || p[0])}</b></a></td><td class="num">${int(k)}</td><td class="num">${other[pi] ? int(other[pi]) : '<span class="muted">–</span>'}</td></tr>`; }).join('') + '</tbody></table></div></div>').join('');
  const leftNames = keys => [...keys].map(k => { const [kind, id] = k.split(':'); return kind === 't' || kind === 'n' ? (D.attribute_specs?.[id]?.label || id) : (A[id]?.title || id); }).filter((x, i, a) => a.indexOf(x) === i);

  // what sets the current selection apart from the other marks
  function apart() {
    const sd = SD();
    if (!sd) return `<div class="page-head"><h2>What sets it apart?</h2></div><p class="muted">Loading the ${esc(W.marks)}…</p>`;
    const cur = K.sel.compute();
    if (!cur.active) return `<div class="page-head"><h2>What sets it apart?</h2></div><p class="note">Make a selection first (the search, or Filters): this page then shows what is more or less common in its ${esc(W.marks)} than in the other ${esc(W.marks)}.</p>`;
    const inSel = new Set(cur.marks), rest = sd.marks.map((_, i) => i).filter(i => !inSel.has(i));
    if (cur.marks.length < MIN || rest.length < MIN) return `<div class="page-head"><h2>What sets it apart?</h2></div><p class="note">A comparison needs at least ${MIN} ${esc(W.marks)} on each side; this selection has ${int(cur.marks.length)}.</p>`;
    const skip = circularKeys(cur), key = JSON.stringify(['apart', S.q, S.f]);
    const res = V.cache.key === key ? V.cache.res : (V.cache = { key, res: compare(cur.marks, rest, skip) }).res;
    V.last = { res, names: ['Your selection', `Other ${W.marks}`], title: 'what sets the selection apart' };
    return `<div class="page-head"><h2>What sets it apart?</h2>${K.expBar(['tsv'], 'cmp-exp', 'the comparison')}</div>` +
      `<p class="page-sub">The features more or less common in the ${int(res.n1)} ${esc(W.marks)} of your selection (${esc(K.sel.describe())}, on ${int(res.proteins1)} proteins) than in the other ${int(res.n2)} ${esc(W.marks)} of the site. A row more common here narrows the selection to it. <a href="#compare">Compare with a saved selection</a></p>` +
      inWords(res, V.last.names) + table(res, V.last.names, true) + method(leftNames(skip), 0) +
      `<h3>Proteins with the most ${esc(W.marks)}</h3><div class="cmp-grid">${topProteins(res, V.last.names)}</div>`;
  }

  // two selections: the one in the link (or a saved one) and the current one
  function comparePage() {
    const sd = SD(), saved = K.sel.savedList();
    const chooser = () => `<div class="page-head"><h2>Compare two selections</h2></div><p class="page-sub">What is more or less common in one selection’s ${esc(W.marks)} than in another’s.</p>` +
      `<ol class="steps"><li>Make the first selection (the search, or Filters) and <b>Save</b> it.</li><li>Make the second selection.</li><li>Choose the first below: it is compared with the current one.</li></ol>` +
      (saved.length ? `<div class="tbl-card"><table class="tbl"><thead><tr><th>Saved selection</th><th class="num">${esc(cap(W.marks))}</th><th></th></tr></thead><tbody>${saved.map((x, i) => `<tr><td>${esc(x.name)}</td><td class="num">${int(x.n)}</td><td><button class="btn small" type="button" data-saved-cmp="${i}">Compare with the current selection</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="note">No selection is saved in this browser yet.</p>`) +
      (K.sel.active() ? `<p>Or <a href="#apart">compare the current selection with the other ${esc(W.marks)}</a>.</p>` : '');
    if (!S.arg) return chooser();
    if (!sd) return `<div class="page-head"><h2>Compare two selections</h2></div><p class="muted">Loading the ${esc(W.marks)}…</p>`;
    const st1 = K.sel.stateOfHash('?' + S.arg), one = K.sel.select(st1.q, st1.f), two = K.sel.compute();
    const name1 = (saved.find(x => (x.hash.split('?')[1] || '') === S.arg) || {}).name || [st1.q, ...Object.entries(st1.f).map(([k, v]) => `${k.split(':')[1]}: ${v.join(', ')}`)].filter(Boolean).join(' · ') || 'everything';
    const name2 = two.active ? K.sel.describe() : `all ${W.marks}`;
    const all = sd.marks.map((_, i) => i), i1 = one.active ? one.marks : all, i2 = two.active ? two.marks : all;
    const s2 = new Set(i2), s1 = new Set(i1), both = i1.filter(i => s2.has(i)).length;
    const only1 = i1.filter(i => !s2.has(i)), only2 = i2.filter(i => !s1.has(i));
    const sides = `<div class="cmp-sides"><div class="cmp-side"><span class="cmp-tag cmp-a">A</span> ${esc(name1)}<br><b>${int(i1.length)}</b> ${esc(W.marks)}</div><div class="cmp-side"><span class="cmp-tag cmp-b">B</span> ${esc(name2)} <span class="muted">(the current selection)</span><br><b>${int(i2.length)}</b> ${esc(W.marks)}</div></div>` +
      `<p class="muted">In both: ${int(both)} ${esc(W.marks)}.${both ? ` They are left out of the test, so it compares A’s other ${int(only1.length)} with B’s other ${int(only2.length)}.` : ''} <button class="linkish" type="button" data-copy-link>Copy the link to this comparison</button></p>`;
    if (only1.length < MIN || only2.length < MIN) return `<div class="page-head"><h2>Compare two selections</h2></div>${sides}<p class="note">A comparison needs at least ${MIN} ${esc(W.marks)} on each side, outside the ones they share.</p>` + chooser().replace(/^<div class="page-head">.*?<\/div>/, '');
    const skip = circularKeys(one, two), key = JSON.stringify(['cmp', S.arg, S.q, S.f]);
    const res = V.cache.key === key ? V.cache.res : (V.cache = { key, res: compare(only1, only2, skip) }).res;
    V.last = { res, names: ['A', 'B'], title: `A (${name1}) against B (${name2})` };
    return `<div class="page-head"><h2>Compare two selections</h2>${K.expBar(['tsv'], 'cmp-exp', 'the comparison')}</div>${sides}` +
      inWords(res, ['A', 'B']) + table(res, ['A', 'B'], false) + method(leftNames(skip), both) +
      `<h3>Proteins with the most ${esc(W.marks)}</h3><div class="cmp-grid">${topProteins(res, ['A', 'B'])}</div>` +
      `<p><a href="#compare">Choose another saved selection</a></p>`;
  }

  function tsv() {
    const { res, title } = V.last;
    const head = ['group', 'feature', 'filter_key', 'value', 'n_1', 'of_1', 'n_2', 'of_2', 'odds_ratio_pooled', 'p_pooled', 'q_pooled', 'odds_ratio_within_protein', 'ci_low', 'ci_high', 'p_within_protein', 'q_within_protein', 'proteins_informative'];
    const g = v => (v == null ? '' : String(+Number(v).toPrecision(6)));
    return K.preamble(`comparison: ${title}`, `every feature (classes of the questions, attribute values, protein sets) compared between two groups of ${W.marks}: pooled Fisher and within-protein Mantel–Haenszel; q is Benjamini–Hochberg within each question or attribute, for each test. Group 1 is the first named.`) +
      head.join('\t') + '\n' + res.rows.map(r => [r.f.group, r.f.label, r.f.key, r.f.value, r.a, r.n1, r.c, r.n2, g(r.or), g(r.p), g(r.q), g(r.mh?.or), g(r.mh?.lo), g(r.mh?.hi), g(r.mh?.p), g(r.mh?.q), r.mh?.strata ?? ''].join('\t')).join('\n') + '\n';
  }

  K.views.apart = { render: apart, title: () => 'What sets it apart?' };
  K.views.compare = { render: comparePage, title: () => 'Compare two selections' };
  K.sections.apart = () => []; K.sections.compare = () => [];
  // in the selection bar: the way to both pages
  (K.selTools ||= []).push(() => (K.sel.active() && K.sel.nMarks() >= MIN ? `<button class="btn small" type="button" data-go-apart title="What is more or less common in these ${esc(W.marks)} than in the other ${esc(W.marks)}">What sets it apart? ›</button>` : '') +
    (K.sel.savedList().length ? `<button class="btn small" type="button" data-go-compare title="Compare this selection with a saved one">Compare</button>` : ''));
  K.clicks.push(
    ['[data-go-apart]', () => K.go('apart')],
    ['[data-go-compare]', () => K.go('compare')],
    ['[data-saved-cmp]', el => { const x = K.sel.savedList()[+el.dataset.savedCmp]; if (x) K.go('compare', { arg: x.hash.split('?')[1] || '' }); }],
    ['[data-cmp-all]', () => { V.all = !V.all; K.render(); }],
    ['[data-cmp-exp]', el => K.exportFigure('tsv', null, `${D.site.id}_${S.view === 'apart' ? 'apart' : 'comparison'}`, el, tsv)],
    ['[data-copy-link]', el => { const done = t => { el.textContent = t; setTimeout(() => { el.textContent = 'Copy the link to this comparison'; }, 1500); }; navigator.clipboard?.writeText(location.href).then(() => done('Copied'), () => done('Copy failed')); }],
  );
});
