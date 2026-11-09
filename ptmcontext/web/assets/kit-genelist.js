/* The gene-list test (#list?q=<names>; a "Test this list" button in the selection bar of either layout): a list of genes or proteins the reader pastes, against every
   set of the site's protein-set questions (those the cards show). For each set, a one-sided hypergeometric test of the
   list's marked proteins within the marked proteins the set's source annotates (each source its own background, as the
   site's own tests), fold (k/n)/(M/N), and Benjamini–Hochberg q over every set tested, small sets included: kit-stats.js
   listTest, the twin of ptmstats.gene_list_test. A new test, computed in the browser; the release statistics do not hold
   it. The names are read by the search's own parser (K.sel.parse), so the box, this page and its links agree; a name read
   by another name, or not found, is said, never dropped silently. A module of the site kit; without website.front, or
   without protein-set questions, it does nothing. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int } = K;
  const fx = v => K.fx(v), fq = v => K.fq(v);
  if (!D.front || !window.PTMC_STATS?.listTest) return;
  const ST = window.PTMC_STATS, F = D.front;
  const short = aid => F.short?.[aid] || A[aid]?.title || aid;
  const trail = parts => `<p class="crumb"><a href="${esc(K.link('overview'))}">Overview</a> › <b>${esc(parts[parts.length - 1][0])}</b></p>`;
  const SHOWN = 20;
  // the questions tested: the protein-set questions the cards show (their facets), in their order; a card's further
  // questions (every disease term, every pathway) are left out, as the home leaves them out
  const QS = [...new Set(F.cards.flatMap(c => (c.facets || []).map(f => f.analysis)))].filter(aid => A[aid]?.kind === 'protein_sets');
  if (!QS.length) return;
  K.paramsIn.push(p => { S.lall = p.get('all') === '1'; });
  K.paramsOut.push(p => { if (S.view === 'list' && S.lall) p.set('all', '1'); });

  // ---- the list, as the search reads it ---------------------------------------------------------------------------------
  function readList(text) {
    const q = K.sel.parse(text), seen = new Set(), prots = [];
    [...q.genes, ...q.sites.map(x => x[0])].forEach(i => { if (!seen.has(i)) { seen.add(i); prots.push(i); } });
    const notFound = [...new Set([...(q.absent || []), ...(q.unmatched || []), ...(q.ignored || [])])];
    return { q, prots, via: q.via || [], notFound, terms: q.terms || [] };
  }
  const labelsOf = aid => { const m = {}; (K.rowsFor(A[aid], 'enricher') || []).forEach(r => { m[r.category] = r.label; }); return m; };
  const LABELS = {};
  const setLabel = (aid, c) => F.row_labels?.[aid]?.[c] || (LABELS[aid] ||= labelsOf(aid))[c] || K.sel.classLabel(aid, c);
  const kindOf = (aid, ps) => short(aid) + (ps.of ? ' (genes)' : '');
  // the test: kit-stats.js listTest over the questions this site has data for
  function test(prots) {
    const SD = K.sel.data(), qs = QS.filter(aid => SD.protein_sets?.[aid]).map(aid => {
      const ps = SD.protein_sets[aid];
      return { question: aid, listed: ps.of ? prots.flatMap(i => ps.of[i] || []) : prots, background: ps.in_background, sets: ps.sets.map(([s, , m]) => [s, m]) };
    });
    return ST.listTest(qs).map(r => { const ps = SD.protein_sets[r.question]; return { ...r, label: setLabel(r.question, r.set), kind: kindOf(r.question, ps) }; });
  }
  const order = (x, y) => x.p - y.p || y.k - x.k || x.label.localeCompare(y.label);
  const TEST = 'one-sided hypergeometric test of the listed proteins within the marked proteins each source annotates (its background, per row), fold (k/n)/(M/N), Benjamini–Hochberg q over every set tested';

  // ---- the page -----------------------------------------------------------------------------------------------------------
  let last = null;
  function view() {
    if (!K.sel.peek()) { K.sel.data(); K.sel.ready.then(() => { if (S.view === 'list') K.render(); }); return trail([['Your gene list']]) + '<div class="page-head"><h2>Your gene list</h2></div><p class="muted" role="status">Reading your list…</p>'; }
    const L = readList(S.q), n = L.prots.length;
    const head = trail([['Your gene list']]) + `<div class="page-head"><h2>Your gene list</h2></div>`;
    if (!S.q.trim()) { last = null; return head + `<p>Paste gene names or accessions in the search box (two or more, separated by spaces or commas) to test them against the ${int(QS.length)} protein-set questions.</p>`; }
    const rows = n ? test(L.prots) : [], hit = rows.filter(r => r.k >= 1).sort(order), shown = S.lall ? hit : hit.slice(0, SHOWN);
    last = { L, rows };
    const chips = L.prots.map(i => { const p = D.proteins[i]; return `<a class="chip gl-chip" href="${esc(K.link('protein', p[0]))}"><b>${esc(K.sel.nameOf(K.sel.byAcc[p[0]]) || p[0])}</b></a>`; }).join(' ');
    const typo = w => { const t = L.q.typos?.[w]; return t?.length ? ` (did you mean ${t.map(([, g]) => esc(g)).join(', ')}?)` : ''; };
    const notes = [
      L.via.length ? `<p class="gl-note"><b>Matched by another name:</b> ${L.via.map(([t, g]) => `${esc(t)} → ${esc(g.join('/'))}`).join(', ')}.</p>` : '',
      L.notFound.length ? `<p class="gl-note"><b>Not found</b> (no ${esc(W.mark)} in this dataset, or a name it does not know), left out of the test: ${L.notFound.map(w => esc(w) + typo(w)).join(', ')}.</p>` : '',
      L.terms.length ? `<p class="gl-note">Filters in the search (${L.terms.map(([k, v]) => esc(k + ':' + v)).join(', ')}) are not part of the list test.</p>` : '',
    ].join('');
    const nT = rows.length;
    const table = `<div class="tbl-card"><table class="tbl gl-tbl"><caption class="vh">Sets shared by your list: one-sided hypergeometric test within each source’s ${esc(W.marked)} proteins</caption><thead><tr>` +
      `<th scope="col">Set</th><th scope="col">Kind</th><th scope="col" class="num">In list</th><th scope="col" class="num">In set / background (${esc(W.marked)})</th><th scope="col" class="num">Fold</th>` +
      `<th scope="col" class="num">p (one-sided hypergeometric)</th><th scope="col" class="num">q (Benjamini–Hochberg, ${int(nT)} sets)</th></tr></thead><tbody>` +
      (shown.map(r => `<tr><td class="wrapok"><a href="${esc(K.link('overview', r.question))}">${esc(r.label)}</a></td><td class="wrapok">${esc(r.kind)}</td><td class="num">${int(r.k)} of ${int(r.n)}</td>` +
        `<td class="num">${int(r.M)} / ${int(r.N)}</td><td class="num">${fx(r.fold)}</td><td class="num">${fq(r.p)}</td><td class="num">${fq(r.q)}</td></tr>`).join('') ||
        `<tr><td colspan="7">No set holds any of them.</td></tr>`) + '</tbody></table></div>';
    const more = hit.length > SHOWN ? `<p><button type="button" class="btn small" data-gl-all>${S.lall ? `Show the first ${SHOWN}` : `Show all ${int(hit.length)} sets holding one or more`}</button></p>` : '';
    return head + `<p class="page-sub">${int(n)} ${esc(W.marked)} protein${n === 1 ? '' : 's'} from ${int(L.q.nWords)} name${L.q.nWords === 1 ? '' : 's'}.</p>` +
      (chips ? `<p class="gl-chips">${chips}</p>` : '') + notes +
      `<h3>What they share</h3>` +
      `<p class="gl-new" role="note"><b>A new test, not in the release statistics.</b> For each of the ${int(nT)} sets of the ${int(QS.length)} protein-set questions: a one-sided hypergeometric test of your proteins within the ${esc(W.marked)} proteins that the set’s source annotates (its background, shown per row; genes for a gene-based source), fold = (k/n)/(M/N), and q is Benjamini–Hochberg over all ${int(nT)} sets, small sets included. Computed in your browser. ` +
      `Your list was chosen, not drawn at random: p and q say how unusual this overlap would be for the same number of ${esc(W.marked)} proteins taken at random; they say nothing about ${esc(W.marks)} themselves.</p>` +
      (n ? table + more + `<p class="actions"><button type="button" class="btn small" data-gl-tsv>TSV</button></p>` : `<p>None of the names is a ${esc(W.marked)} protein here, so there is nothing to test.</p>`);
  }
  function tsv() {
    const { L, rows } = last, names = L.prots.map(i => K.sel.nameOf(K.sel.byAcc[D.proteins[i][0]]) || D.proteins[i][0]);
    const head = ['set', 'set_id', 'question', 'kind', 'in_list', 'list_in_background', 'in_set', 'background', 'fold', 'p', 'q'];
    return K.preamble('gene-list test', `a new test, not in the release statistics: ${TEST} (${rows.length} sets of ${QS.length} questions); computed in the browser. A chosen list is not a random draw`) +
      `# Input: ${S.q}\n# Genes tested (${names.length}): ${names.join(' ')}\n# Matched by another name: ${L.via.map(([t, g]) => `${t} -> ${g.join('/')}`).join(', ') || 'none'}\n# Not found: ${L.notFound.join(', ') || 'none'}\n` +
      head.join('\t') + '\n' + rows.slice().sort(order).map(r => [r.label, r.set, r.question, r.kind, r.k, r.n, r.M, r.N, K.g6(r.fold), K.g6(r.p), K.g6(r.q)].join('\t')).join('\n') + '\n';
  }
  document.addEventListener('click', e => {
    if (S.view !== 'list') return;
    if (e.target.closest?.('[data-gl-all]')) { S.lall = !S.lall; K.writeHash(false); K.render(); }
    if (e.target.closest?.('[data-gl-tsv]') && last) K.download(`${D.site.id || 'site'}_gene_list_test.tsv`, tsv(), 'text/tab-separated-values');
  });
  K.views.list = { render: view, title: () => 'Your gene list' };
  K.geneList = { questions: QS, read: readList, test, tsv: () => (last ? tsv() : '') };
  // the search box: Enter on a list of two or more names (and nothing else) opens this page
  K.openList = () => {
    if (S.view === 'list') return false;
    const L = readList(S.q);
    if (L.prots.length + L.notFound.length < 2 || !L.prots.length || L.terms.length || L.q.sites.length || L.q.words.length) return false;
    K.go('list'); return true;
  };
  K.listLink = () => (K.sel.namesProteins() && new Set(K.sel.compute().q.genes).size >= 2 ? `<a class="btn small" href="${esc(K.link('list'))}">Test this list</a>` : '');
  (K.selTools ||= []).push(K.listLink);            // the classic selection bar: a button when the search names two or more genes
  (K.methodParts ||= []).push(() => `<section id="m-list"><h3>Your gene list</h3><p>A list of genes or proteins pasted in the search can be tested against the sets of the ${int(QS.length)} protein-set questions the Overview shows (${QS.map(a => esc(short(a))).join(', ')}). ` +
    `For each set, the list’s ${esc(W.marked)} proteins are compared with the ${esc(W.marked)} proteins that the set’s source annotates: that source’s own background, as in the site’s other tests (genes, not proteins, for a gene-based source). ` +
    `With n of the list in the background, N in the background, M of those in the set and k of the list in the set, p is the chance of k or more by a one-sided hypergeometric test, fold is (k/n)/(M/N), and q is Benjamini–Hochberg over every set tested, small sets included. ` +
    `Names are read as the search reads them; a name matched by another name, or not found, is listed above the table. This is a new test, computed in your browser and not part of the release statistics. A list is chosen, not drawn at random, so p and q describe the overlap, not ${esc(W.marks)}.</p></section>`);
});
