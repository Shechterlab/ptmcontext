/* The Proteins and Sites pages' shared parts, as the Methylarginine Site Explorer's: the Proteins table with its Columns
   menu (website.proteins.columns: a site map per protein, counts of its marks by an attribute's values, the share of its
   marks in some classes, its protein attributes), the "Your selection" card (a selection made of one protein set or one
   source), the Enriched features card (what is more or less common in the selection's marks than in the others: the
   selection module's contrast, pooled), helpful empty states, the citation box of the selection's marks, and the
   downloads in the columns the site file names (website.proteins.download, website.sites.download). It knows no mark,
   source or organism: every column, label and link is the site file's, and a part whose data a site lacks is absent.
   A module of the site kit: K.tables (the Sites page, kit-sites.js, uses it). */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, cap } = K;
  if (!D.proteins || !D.proteins.length) return;
  const SPECS = D.attribute_specs || {}, PCFG = D.proteins_view || {}, PA = D.protein_attributes || {};
  const PSP = PA.specs || {};
  const P = D.proteins.map(([acc, gene, name, len, marks, cand, entry], i) => ({ i, acc, gene, name, len, marks, cand, entry: entry || '' }));
  const SD = () => K.sel?.data();
  const AN = () => SD().analyses, AT = () => SD().attribute_names || Object.keys(SD().attributes);
  const colourAttr = Object.keys(SPECS).find(n => SPECS[n].colour && SPECS[n].kind === 'category') || null;
  const MINUS = '−';

  // ---- small helpers -------------------------------------------------------------------------------------------------
  const vals = (m, name) => { const ti = AT().indexOf(name); return ti < 0 ? [] : m[3][ti].map(c => SD().attributes[name][c]); };
  const attrStr = (m, name) => vals(m, name).filter(v => v !== '').join(SPECS[name]?.separator || '; ');
  const classes = (m, aid) => { const k = AN().indexOf(aid); return k < 0 ? [] : m[2][k].map(c => SD().classes[aid][c]); };
  const pLabel = p => p.gene || p.acc;
  const fmtNum = (v, f) => {
    if (v == null || v === '' || !isFinite(+v)) return '';
    const x = +v;
    if (f === 'l2') return (x > 0 ? '+' : x < 0 ? MINUS : '') + Math.abs(x).toFixed(2);
    if (f === 'p') return x === 0 ? '< 1e-300' : x < 1e-3 ? x.toExponential(1) : x.toFixed(3);
    if (f === 'pct') return (100 * x).toFixed(0) + '%';
    return Number.isInteger(x) ? int(x) : x.toFixed(2);
  };
  const today = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  // a table's file: <marks>_<table>[_selection]_<date>.tsv, as the explorer names them
  const fileName = what => `${slug(W.marks)}_${what}${K.sel?.active() ? '_selection' : ''}_${today()}`;
  const selKey = () => JSON.stringify([S.q, S.f]);
  // the marks of each protein (indices into the selection data), once
  let BYP = null;
  const byProt = () => { if (!BYP && SD()) { BYP = P.map(() => []); SD().marks.forEach((m, i) => BYP[m[0]].push(i)); } return BYP || P.map(() => []); };
  const selSet = () => { const c = K.sel?.compute(); return c?.active && c.marks ? new Set(c.marks) : null; };

  // ---- a protein's marks as ticks on a line, those of the selection tall and coloured, the others short and grey -----
  function siteMap(pi, sel, w = 150) {
    const p = P[pi], len = Math.max(p.len || 1, 1), H = 20, x = pos => (1 + (pos / len) * (w - 2)).toFixed(1);
    const idx = byProt()[pi], off = [], on = [];
    idx.forEach(i => { const m = SD().marks[i]; (!sel || sel.has(i) ? on : off).push(m); });
    const col = m => (colourAttr ? K.map?.attrColour(colourAttr, vals(m, colourAttr)[0] ?? '') : 'var(--accent)');
    return `<svg class="minimap" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(`${cap(W.mark)} positions along ${pLabel(p)}`)}">` +
      `<line x1="1" x2="${w - 1}" y1="10" y2="10" stroke="var(--line-strong)" stroke-width="2" stroke-linecap="round"/>` +
      off.map(m => `<line x1="${x(m[1])}" x2="${x(m[1])}" y1="7" y2="13" stroke="var(--line-strong)" stroke-width="1"/>`).join('') +
      on.map(m => `<line x1="${x(m[1])}" x2="${x(m[1])}" y1="2" y2="18" stroke="${col(m)}" stroke-width="1.6"/>`).join('') + '</svg>';
  }

  // ---- the Proteins table's columns (website.proteins.columns) ---------------------------------------------------------
  // each: {id, label, menu?, default?, hide? (xs, sm: dropped on narrow screens), help?} and one of
  //   show: map | length | share | candidates      a site map, the length, the marks' share of candidate residues
  //   counts: {attribute, values: {value: label}, dashed?: [values]}   the protein's marks of each value (of the selection)
  //   classes: {analysis, classes: [..]}           the share of the protein's marks in these classes
  //   attribute: <protein attribute>, format?: count | l2 | p | int    a protein attribute (proteins.attributes)
  //   template: "{a} in {b} aa", where?: {attribute, max?, min?}, sort?: <attribute>   protein attributes in words
  const pv = (name, pi) => { const v = PA.values?.[name]; return v ? v[pi] : null; };
  const hasP = name => !!PA.values?.[name];
  const DEFAULT_PCOLS = [{ id: 'map', label: `${cap(W.mark)} map`, show: 'map', default: true, hide: 'xs' }, { id: 'len', label: 'Length', show: 'length', default: true },
    { id: 'share', label: `Share of its ${W.residues}`, show: 'share', default: true }];
  const tmplAttrs = t => [...String(t || '').matchAll(/\{(\w+)\}/g)].map(x => x[1]);
  function pcols() {
    return (PCFG.columns || DEFAULT_PCOLS).filter(c => {
      if (c.attribute) return hasP(c.attribute);
      if (c.counts) return !!SPECS[c.counts.attribute];
      if (c.classes) return !!A[c.classes.analysis];
      if (c.template) return tmplAttrs(c.template).every(hasP);
      return ['map', 'length', 'share', 'candidates'].includes(c.show);
    });
  }
  const countsOf = (c, pi, sel) => {
    const out = {}, name = c.counts.attribute;
    byProt()[pi].forEach(i => { if (sel && !sel.has(i)) return; vals(SD().marks[i], name).forEach(v => { out[v] = (out[v] || 0) + 1; }); });
    return out;
  };
  const classShare = (c, pi) => {
    const idx = byProt()[pi]; if (!idx.length) return null;
    const want = new Set(c.classes.classes || []);
    return idx.filter(i => classes(SD().marks[i], c.classes.analysis).some(x => want.has(x))).length / idx.length;
  };
  const tmplOk = (c, pi) => { const w = c.where; if (!w) return true; const v = pv(w.attribute, pi); return v != null && v !== '' && (w.max == null || +v <= w.max) && (w.min == null || +v >= w.min); };
  const tmplText = (c, pi) => (tmplOk(c, pi) && tmplAttrs(c.template).every(n => pv(n, pi) != null && pv(n, pi) !== '') ? c.template.replace(/\{(\w+)\}/g, (m0, n) => fmtNum(pv(n, pi)) || pv(n, pi)) : '');
  const listOf = (name, v) => (v == null || v === '' ? [] : String(v).split(PSP[name]?.separator || '; ').filter(Boolean));
  const dash = '<span class="muted">—</span>';
  function pcell(c, p, sel) {
    if (c.show === 'map') return siteMap(p.i, sel);
    if (c.show === 'length') return int(p.len);
    if (c.show === 'candidates') return int(p.cand);
    if (c.show === 'share') return p.cand ? (100 * p.marks / p.cand).toFixed(1) + '%' : '–';
    if (c.counts) {
      const n = countsOf(c, p.i, sel), dashed = new Set(c.counts.dashed || []);
      const chips = Object.entries(c.counts.values || {}).filter(([v]) => n[v]).map(([v, lab]) => `<span class="ixs${dashed.has(v) ? ' dashed' : ''}" style="--c:${K.map?.attrColour(c.counts.attribute, v) || 'var(--muted)'}" title="${esc(`${int(n[v])} ${n[v] === 1 ? W.mark : W.marks}: ${K.sel.valueLabel(c.counts.attribute, v)}`)}"><i></i>${int(n[v])} ${esc(lab)}</span>`);
      return chips.join(' ') || dash;
    }
    if (c.classes) { const s = classShare(c, p.i); return s == null ? dash : fmtNum(s, 'pct'); }
    if (c.template) return tmplText(c, p.i) ? esc(tmplText(c, p.i)) : dash;
    if (c.attribute) {
      const sp = PSP[c.attribute] || {}, v = pv(c.attribute, p.i);
      if (c.format === 'count') { const k = listOf(c.attribute, v).length; return int(k); }
      if (sp.kind === 'number') return v == null || v === '' ? dash : fmtNum(v, c.format);
      if (sp.kind === 'list') { const xs = listOf(c.attribute, v).map(x => (sp.values || {})[x] || x); return xs.length ? esc(xs.join(', ')) : dash; }
      return v == null || v === '' ? dash : esc((sp.values || {})[v] || v);
    }
    return '';
  }
  // what a column sorts by (null: missing, last either way); text ascending first, numbers descending
  function pkey(c, p, sel) {
    if (c.show === 'map') return null;
    if (c.show === 'length') return p.len;
    if (c.show === 'candidates') return p.cand;
    if (c.show === 'share') return p.cand ? p.marks / p.cand : null;
    if (c.counts) { const n = countsOf(c, p.i, sel), ks = Object.keys(c.counts.values || {}); return ks.reduce((s, v, k) => s + (n[v] || 0) * Math.pow(1000, ks.length - 1 - k), 0); }
    if (c.classes) return classShare(c, p.i);
    if (c.template) { if (!tmplText(c, p.i)) return null; const v = pv(c.sort || tmplAttrs(c.template)[0], p.i); return v == null || v === '' ? null : +v; }
    if (c.attribute) {
      const sp = PSP[c.attribute] || {}, v = pv(c.attribute, p.i);
      if (c.format === 'count') return listOf(c.attribute, v).length;
      if (sp.kind === 'number') return v == null || v === '' ? null : +v;
      return v == null || v === '' ? null : String(v).toLowerCase();
    }
    return null;
  }
  const sortable = c => c.show !== 'map';
  const textCol = c => !!(c.attribute && PSP[c.attribute]?.kind !== 'number' && c.format !== 'count');
  const hideCls = c => (c.hide === 'xs' ? ' hide-xs' : c.hide === 'sm' ? ' hide-sm' : '');

  // ---- the Proteins page ---------------------------------------------------------------------------------------------
  const PS = { sort: 'marks', desc: true, n: 50, key: null };
  function proteinRows() {
    const sel = K.sel?.active(), cnt = sel ? K.sel.selectedCountByProtein() : null, ss = selSet();
    const rows = P.filter(p => !sel || (cnt[p.i] || 0) > 0).map(p => ({ p, n: sel ? cnt[p.i] || 0 : p.marks }));
    const col = pcols().find(c => c.id === PS.sort);
    const key = PS.sort === 'marks' ? (r => r.n) : PS.sort === 'protein' ? (r => pLabel(r.p).toLowerCase()) : col ? (r => pkey(col, r.p, ss)) : (r => r.n);
    rows.forEach(r => { r.k = key(r); });
    rows.sort((x, y) => {
      const a = x.k, b = y.k;
      if (a == null || b == null) { if (a != null) return -1; if (b != null) return 1; return y.p.marks - x.p.marks; }
      const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return (PS.desc ? -c : c) || y.p.marks - x.p.marks;           // ties: most marks in all first
    });
    return rows;
  }
  const th = (id, label, cls, help, on, sortOn) => `<th class="${cls || ''}"${sortOn ? ` data-tsort="${esc(id)}" tabindex="0"` : ''}${help ? ` title="${esc(help)}"` : ''}${on ? ` aria-sort="${on}"` : ''}>${esc(label)}</th>`;
  function proteinsView() {
    if (PS.key !== selKey()) { PS.key = selKey(); PS.n = 50; }
    if (K.sel?.active() && !SD()) return `<div class="page-head"><h2>Proteins</h2></div><p class="muted">Loading the selection…</p>`;
    const rows = proteinRows(), shown = rows.slice(0, PS.n), sel = K.sel?.active(), ss = selSet();
    const cols = pcols(), defaults = cols.filter(c => c.default).map(c => c.id), table = 'proteins';
    const on = new Set(K.columns.on(table, cols, defaults)), showC = cols.filter(c => on.has(c.id));
    const nMarks = sel ? K.sel.nMarks() : D.counts.marks;
    const sorted = id => (PS.sort === id ? (PS.desc ? 'descending' : 'ascending') : '');
    const head = `<div class="page-head results-head"><div><h2>Proteins</h2><p class="cx">${int(rows.length)} of ${int(P.length)} proteins · ${int(nMarks)} ${esc(nMarks === 1 ? W.mark : W.marks)}</p></div>` +
      `<div class="actions">${rows.length ? `<button class="btn small" type="button" data-copy-genes title="Every protein of the table, one per line: its gene, else its accession">Copy gene list</button>` : ''}${figuresBtn()}${K.expBar(['tsv'], 'ptsv', 'the protein table', 'data')}</div></div>`;
    if (!rows.length) return head + selectionCard() + emptyState();
    const tableHtml = `<div class="tbl-card t-card" id="proteins-table"><div class="tbl-tools"><span class="muted small">Click a protein to open it.</span>${K.columns.menu(table, cols, defaults)}</div>` +
      `<div class="tbl-wrap"><table class="tbl stackable ptbl2"><thead><tr>${th('protein', 'Protein', '', '', sorted('protein'), true)}${th('marks', 'Sites', 'num', sel ? `${cap(W.marks)} in the selection, of the protein’s ${W.marks}` : '', sorted('marks'), true)}` +
      showC.map(c => th(c.id, c.label, (pkeyNum(c) ? 'num' : '') + hideCls(c), c.help || '', sorted(c.id), sortable(c))).join('') + '</tr></thead><tbody>' +
      shown.map(({ p, n }) => `<tr class="row" tabindex="0" data-acc="${esc(p.acc)}"><td data-label="Protein"><div class="cv"><a class="gene" href="${esc(K.link('protein', p.acc))}">${esc(pLabel(p))}</a> <span class="acc-in mono">${esc(p.acc)}</span><div class="pname" title="${esc(p.name)}">${esc(p.name || '—')}</div></div></td>` +
        `<td class="num" data-label="Sites">${int(n)}${n !== p.marks ? `<span class="muted"> / ${int(p.marks)}</span>` : ''}</td>` +
        showC.map(c => `<td class="${(pkeyNum(c) ? 'num' : '') + hideCls(c)}${c.show === 'map' ? ' mapcell' : ''}" data-label="${esc(c.label)}">${pcell(c, p, ss)}</td>`).join('') + '</tr>').join('') +
      `</tbody></table></div><div class="tbl-foot"><span>Showing ${int(shown.length)} of ${int(rows.length)}</span>${rows.length > shown.length ? `<button class="btn small" type="button" data-tmore="p">Show 50 more</button>` : ''}</div></div>`;
    const marksOf = rows.flatMap(r => byProt()[r.p.i].filter(i => !ss || ss.has(i)).map(i => SD().marks[i]));
    return head + selectionCard() + enrichedCard() + tableHtml +
      citeBox(marksOf, sel ? `the ${int(marksOf.length)} ${marksOf.length === 1 ? W.mark : W.marks} on these proteins` : `the ${W.marks} of this site`);
  }
  const pkeyNum = c => ['length', 'share', 'candidates'].includes(c.show) || c.classes || (c.attribute && (PSP[c.attribute]?.kind === 'number' || c.format === 'count'));
  // a figures page, when a module draws one
  const figuresBtn = () => (K.views.figures ? `<a class="btn small" href="${esc(K.link('figures'))}" title="Figure panels of this selection">Make figures</a>` : '');

  function proteinsTsv() {
    const rows = proteinRows(), cols = PCFG.download || [{ name: 'accession', value: 'accession' }, { name: 'gene', value: 'gene' }, { name: 'protein_name', value: 'protein' },
      { name: 'length', value: 'length' }, { name: `${slug(W.marks)}_shown`, value: 'marks_shown' }, { name: `${slug(W.marks)}_total`, value: 'marks' }, { name: 'candidates', value: 'candidates' }];
    const ss = selSet();
    const one = (c, r) => {
      const p = r.p;
      if (c.value) return { accession: p.acc, gene: p.gene, entry: p.entry, protein: p.name, aliases: (D.protein_aliases?.[p.acc] || '').replace(/;\s*/g, ';'), length: p.len, candidates: p.cand, marks: p.marks, marks_shown: r.n }[c.value] ?? '';
      if (c.attribute) { const v = pv(c.attribute, p.i); return v == null ? '' : PSP[c.attribute]?.kind === 'list' ? listOf(c.attribute, v).join(';') : v; }
      if (c.classes) return byProt()[p.i].filter(i => classes(SD().marks[i], c.classes.analysis).some(x => (c.classes.classes || []).includes(x))).length;
      if (c.counts) return countsOf(c, p.i, ss)[c.counts.value] || 0;
      return '';
    };
    return K.preamble(`proteins${K.sel?.active() ? ' (selection)' : ''}`, `every protein with at least one ${W.mark}${K.sel?.active() ? ' of the selection' : ''} (${int(rows.length)}), in the table’s order, with the columns the site names; lists are separated by ";".`) +
      cols.map(c => c.name).join('\t') + '\n' + rows.map(r => cols.map(c => String(one(c, r)).replace(/[\t\n]/g, ' ')).join('\t')).join('\n') + '\n';
  }

  // ---- "Your selection": one protein set, or one source, as a card with its numbers and its link ---------------------
  const SCARD = D.selection_cards || {};
  function oneTerm() {
    const c = K.sel?.compute(); if (!c?.active || !SD()) return null;
    const q = c.q; if (q.genes.length || q.sites.length || q.words.length || c.cons.length !== 1) return null;
    const [key, v] = c.cons[0]; if (v.length !== 1) return null;
    return { kind: key.split(':')[0], id: key.split(':')[1], value: v[0] };
  }
  function selectionCard() {
    const t = oneTerm(); if (!t) return '';
    const cfg = SCARD[t.kind === 'p' ? t.id : '@' + t.id] || {};
    const fill = s => String(s || '').replace(/\{set\}/g, encodeURIComponent(t.value)).replace(/\{value\}/g, encodeURIComponent(t.value));
    const link = cfg.url ? `<a class="btn small" href="${esc(fill(cfg.url))}" target="_blank" rel="noopener">${esc((cfg.link || '{value}').replace(/\{set\}|\{value\}/g, t.value))} ↗</a>` : '';
    const card = (eyebrow, title, body, links) => `<div class="ctx-card" id="sel-card"><div><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3><p>${body}</p></div>${links ? `<div class="actions">${links}</div>` : ''}</div>`;
    if (t.kind === 'p' && t.value !== '*') {
      const a = A[t.id]; if (!a) return '';
      const r = D.rows.find(x => x.analysis === t.id && x.category === t.value && x.method === 'enricher');
      const name = (a.labels || {})[t.value] || t.value, unit = a.unit || 'proteins';
      const body = r ? `${int(r.a)} of the ${int(r.a + r.c)} ${esc(unit)} in this set (${K.pct(r.a, r.a + r.c)}) are ${esc(W.marked)}${a.background ? `; against ${esc(a.background)}` : ''}: ${K.fx(r.eff)}, q ${K.fq(r.q)}.` +
        (cfg.note ? ` ${esc(cfg.note)}` : '') : `Not tested on its own: ${esc(cfg.note || 'the set is outside the question’s tested sizes')}.`;
      return card(cfg.eyebrow || a.title, name, body + ` <a href="${esc(K.link('overview', t.id))}">The question ›</a>`, link);
    }
    if (t.kind === 't' && SPECS[t.id]?.kind === 'list') {
      const sp = SPECS[t.id], ct = D.protein_view?.card?.cite, lk = ct?.attribute === t.id ? (D.lookups?.[ct.lookup] || {})[t.value] : null;
      if (!lk && !cfg.eyebrow) return '';
      const n = K.sel.nMarks(), only = (K.sel.compute().marks || []).filter(i => vals(SD().marks[i], t.id).length === 1).length;
      const doi = lk?.doi || (SD().attribute_links?.[t.id] || {})[t.value] || '';
      const body = `${lk?.citation ? esc(lk.citation) + '. ' : ''}${int(n)} ${esc(n === 1 ? W.mark : W.marks)} reported, ${int(only)} by it alone.${lk?.licence ? ` Licence: ${esc(lk.licence)}.` : ''}`;
      return card(cfg.eyebrow || sp.label, K.sel.valueLabel(t.id, t.value), body, (doi && sp.link ? `<a class="btn small" href="${esc(sp.link.url.replace('{}', doi))}" target="_blank" rel="noopener">doi:${esc(doi)} ↗</a>` : '') + link);
    }
    return '';
  }

  // ---- Enriched features: the selection's marks against the others, every question and attribute, pooled -----------
  const EN = { open: false };
  const share1 = r => (r.a + r.b ? r.a / (r.a + r.b) : 0), share2 = r => (r.c + r.d ? r.c / (r.c + r.d) : 0);
  const ratio = r => (share2(r) ? share1(r) / share2(r) : null);
  const strength = r => (r.dir === 'more' ? Math.log(r.lo ?? r.eff) : r.dir === 'less' ? -Math.log(r.hi ?? r.eff) : 0);
  const EXCL = /^(no |not |unknown|unassigned|none\b)/i;
  function features() {
    const c = K.sel?.compute(); if (!c?.active || !SD()) return null;
    const G = K.sel.contrastGroups(); if (!G || G.g1.length < K.sel.MIN_SIDE || G.g2.length < K.sel.MIN_SIDE) return null;
    const qs = [...D.analyses.filter(a => a.kind !== 'protein_sets').map(a => a.id), ...Object.keys(A).filter(id => id[0] === '@')];
    const all = qs.flatMap(id => (K.sel.contrast(id, 'fisher') || []).filter(r => !r.descriptive && r.q != null && r.a + r.c >= 10 && !EXCL.test(r.label) && r.category !== ''));
    const sig = all.filter(r => r.q <= K.PADJ && (r.dir === 'more' || r.dir === 'less'));
    // how the marks were found (provenance attributes) after what they are, as the Overview's caveat
    const prov = r => !!A[r.analysis]?.provenance, by = (x, y) => prov(x) - prov(y) || strength(y) - strength(x);
    const up = sig.filter(r => r.dir === 'more').sort(by), dn = sig.filter(r => r.dir === 'less').sort(by);
    return { G, tested: all.length, up, dn, n: sig.length };
  }
  const fxR = v => (v == null ? '–' : K.fxn(v) + '×');
  const pcS = v => (v < 0.1 ? (100 * v).toFixed(1) : (100 * v).toFixed(0)) + '%';
  // the filter a feature sets: a residue question's class, an attribute's value, a number's threshold
  const featureKey = r => (r.analysis[0] === '@' ? ((SPECS[r.analysis.slice(1)]?.kind === 'number' ? 'n:' : 't:') + r.analysis.slice(1)) : 'a:' + r.analysis);
  function enrichedCard() {
    const F = features(); if (!F) return '';
    const named = r => (r.label.length < 14 ? `${A[r.analysis]?.title || ''}: ${r.label}` : r.label);
    const top = F.up.filter(r => !A[r.analysis]?.provenance).slice(0, 3).map(r => `${esc(named(r))} <b>${fxR(ratio(r))}</b>`).join(', ');
    const row = (r, i, less) => `<tr${less ? ' class="dim" title="Less common here than in the other ' + esc(W.marks) + '"' : ` data-feat="${i}" tabindex="0" title="Narrow the selection to ${esc(W.marks)} with this feature"`}><td data-label="Feature">${esc(r.label)} <span class="muted small">${esc(A[r.analysis]?.title || '')}</span></td>` +
      `<td class="num" data-label="Here">${int(r.a)} (${pcS(share1(r))})</td><td class="num hide-xs" data-label="Other ${esc(W.marks)}">${pcS(share2(r))}</td><td class="num" data-label="Ratio"><b>${fxR(ratio(r))}</b></td><td class="num" data-label="q">${K.fq(r.q)}</td></tr>`;
    EN.rows = F.up.slice(0, 8);
    const body = F.n ? `<div class="tbl-card"><table class="tbl compact stackable prof-tbl"><thead><tr><th>Feature</th><th class="num">Here</th><th class="num hide-xs">Other ${esc(W.marks)}</th><th class="num">Ratio</th><th class="num">q</th></tr></thead><tbody>` +
      EN.rows.map((r, i) => row(r, i, false)).join('') + F.dn.slice(0, 4).map(r => row(r, -1, true)).join('') + '</tbody></table></div>'
      : `<p class="muted">No feature differs (q ≤ ${K.PADJ}) between this selection and the other ${esc(W.marks)}.</p>`;
    return `<details class="pfold en-fold" id="sel-enriched"${EN.open ? ' open' : ''}><summary><span class="pfm" aria-hidden="true"></span><h3>Enriched features</h3><span class="fsum">${top ? top + ' · ' : ''}${int(F.n)} of ${int(F.tested)} features differ (q ≤ ${K.PADJ})</span></summary><div class="pfold-body">` +
      `<div class="card-head"><p class="sub">Features more or less common in these ${int(F.G.g1.length)} ${esc(W.marks)} than in the other ${int(F.G.g2.length)}. Click one to narrow the selection.</p><span class="tools"><a class="btn small" href="${esc(K.link('overview', '', { vs: 'marks' }))}" title="Every question, with its tiles, compared with the other ${esc(W.marks)}">Compare question by question ›</a>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'enexp', 'the enriched features', 'q-tables')}</span></div>` + body +
      `<p class="note small">Fisher’s exact test per feature, Benjamini–Hochberg within each question, over ${int(F.tested)} features. ${cap(W.marks)} of one protein are not independent, so treat this as a pointer.</p></div></details>`;
  }
  function enrichedTsv() {
    const F = features(); if (!F) return '';
    return K.preamble('enriched features of the selection', `the features (classes of each question and values of each attribute) more or less common in the selection’s ${W.marks} than in the other ${W.marks}: Fisher’s exact test, Benjamini–Hochberg within each question; those at q ≤ ${K.PADJ}.`) +
      ['question', 'feature', 'code', 'direction', 'here', 'here_total', 'others', 'others_total', 'share_here', 'share_others', 'ratio', 'odds_ratio', 'ci_low', 'ci_high', 'p', 'q'].join('\t') + '\n' +
      [...F.up, ...F.dn].map(r => [A[r.analysis]?.title || r.analysis, r.label, r.category, r.dir, r.a, r.a + r.b, r.c, r.c + r.d, share1(r).toFixed(4), share2(r).toFixed(4), ratio(r)?.toFixed(3) ?? '', r.or?.toPrecision(4) ?? '', r.lo?.toPrecision(4) ?? '', r.hi?.toPrecision(4) ?? '', r.p.toExponential(3), r.q.toExponential(3)].join('\t')).join('\n') + '\n';
  }
  function enrichedFigure() {
    const F = features(), rows = [...F.up.slice(0, 8), ...F.dn.slice(0, 4)], Wd = 760, rh = 22, lab = 300, bw = 300;
    const max = Math.max(0.01, ...rows.flatMap(r => [share1(r), share2(r)]));
    const body = rows.map((r, k) => { const y = k * rh + 12, x1 = lab + (share1(r) / max) * bw, x2 = lab + (share2(r) / max) * bw;
      return `<text x="20" y="${y + 4}" font-size="11" fill="${K.PAL.ink}">${esc(K.wrap(r.label + ' · ' + (A[r.analysis]?.title || ''), lab - 30, 11)[0])}</text><line x1="${lab}" x2="${lab + bw}" y1="${y}" y2="${y}" stroke="${K.PAL.line}"/>` +
        `<circle cx="${x2.toFixed(1)}" cy="${y}" r="4.5" fill="none" stroke="${K.PAL.muted}" stroke-width="1.4"/><circle cx="${x1.toFixed(1)}" cy="${y}" r="4.5" fill="${r.dir === 'more' ? K.PAL.more : K.PAL.less}"/>` +
        `<text x="${lab + bw + 16}" y="${y + 4}" font-size="11" fill="${K.PAL.ink}">${esc(fxR(ratio(r)))} · q ${esc(K.fq(r.q))}</text>`; }).join('');
    return K.figureFrame({ title: 'Enriched features of the selection', sub: `${F.G.g1.length} ${W.marks} of the selection against the other ${F.G.g2.length}; Fisher’s exact test, Benjamini–Hochberg within each question (q ≤ ${K.PADJ}).`,
      legend: [[K.PAL.more, '', 'share in the selection'], ['none', K.PAL.muted, `share in the other ${W.marks}`]], body, bodyH: rows.length * rh + 10, W: Wd,
      note: `${cap(W.marks)} of one protein are not independent: read this as a pointer.` });
  }

  // ---- empty states: what brings marks back, and a protein without marks --------------------------------------------
  const lightIdx = { rows: null, asked: false };
  function emptyState() {
    const c = K.sel?.compute(); if (!c?.active) return `<div class="card empty-card"><b>No ${esc(W.marks)} match</b><p>Broaden the search.</p></div>`;
    const q = c.q, words = String(S.q || '').trim().split(/\s+/).filter(Boolean);
    // one name that only a protein without marks has: say so, and what the site holds on it
    if (words.length === 1 && !Object.keys(S.f || {}).length && !q.genes.length && !q.sites.length && !/:/.test(words[0])) {
      if (!lightIdx.asked && K.card?.lightIndex) { lightIdx.asked = true; K.card.lightIndex().then(ix => { lightIdx.rows = ix || []; K.render(); }); }
      const u = words[0].toUpperCase(), hit = (lightIdx.rows || []).find(r => r[0] === u.replace(/-\d+$/, '') || String(r[1] || '').toUpperCase() === u || String(r[2] || '').toUpperCase() === u);
      if (hit) {
        const gene = hit[1] || hit[0];
        if (!lightIdx.rec || lightIdx.rec.acc !== hit[0]) { lightIdx.rec = { acc: hit[0], x: null }; K.card.light(hit[0]).then(x => { if (lightIdx.rec?.acc === hit[0]) { lightIdx.rec.x = x; K.render(); } }); }
        const x = lightIdx.rec.x, ptab = D.protein_view?.card?.writer?.partners?.table, partners = x && ptab ? K.card.partnersOf(x, ptab) : [];
        const rtab = D.protein_view?.card?.records?.table, recs = x?.tables?.[rtab]?.length || 0;
        const names = partners.map(r => P.find(p => p.acc === r.acc)).filter(Boolean).map(pLabel);
        return `<div class="card empty-card unl-empty"><b>No ${esc(W.mark)} on ${esc(gene)} (${esc(hit[0])})</b><p>None of the sources compiled here reports one. Absent here means not reported, not shown to be un${esc(W.marked)}.</p>` +
          `<p><a class="btn small" href="${esc(K.link('protein', hit[0]))}">Open ${esc(gene)}’s page</a></p>` +
          (names.length || recs ? `<p>It appears here as a partner:</p><div class="empty-tries">${recs ? `<a class="chip" href="${esc(K.link('protein', hit[0]))}">${int(recs)} record${recs === 1 ? '' : 's'} at other proteins’ ${esc(W.marks)}</a>` : ''}${names.length ? `<button class="chip" type="button" data-try="${esc(names.join(' '))}">The ${int(names.length)} ${esc(W.marked)} protein${names.length === 1 ? '' : 's'} associated with ${esc(gene)}</button>` : ''}</div>` : '') + '</div>';
      }
    }
    // which one constraint, removed, brings marks back
    const tries = [];
    const nOf = (qq, ff) => { const r = K.sel.select(qq, ff); return r.active ? (r.marks || []).length : D.counts.marks; };
    if (words.length > 1 || Object.keys(S.f || {}).length) {
      words.forEach((w, k) => { const n = nOf(words.filter((_, j) => j !== k).join(' '), S.f); if (n) tries.push([`q:${k}`, `Search: ${w}`, n]); });
      Object.keys(S.f || {}).forEach(key => { const f = { ...S.f }; delete f[key]; const n = nOf(S.q, f); if (n) tries.push([`f:${key}`, `${keyLabel(key)}: ${S.f[key].map(v => valLabel(key, v)).join(' or ')}`, n]); });
    }
    const nCons = words.length + Object.keys(S.f || {}).length;
    tries.sort((x, y) => y[2] - x[2]);
    return `<div class="card empty-card"><b>${nCons > 1 ? `No ${esc(W.marks)} match all ${int(nCons)} constraints` : `No ${esc(W.marks)} match`}</b>` +
      (tries.length ? `<p>Removing one of these brings ${esc(W.marks)} back:</p><div class="empty-tries">${tries.slice(0, 5).map(t => `<button class="chip" type="button" data-drop="${esc(t[0])}">Remove “${esc(t[1])}” · ${int(t[2])} ${esc(t[2] === 1 ? W.mark : W.marks)}</button>`).join('')}</div>` : `<p>Remove a filter or broaden the search.</p>`) +
      `<p><button class="btn small" type="button" data-sel-clear-all>Clear all</button></p></div>`;
  }
  const keyLabel = key => { const [kind, id] = key.split(':'); return kind === 't' || kind === 'n' ? SPECS[id]?.label || id : kind === 'r' ? PSP[id]?.label || id : A[id]?.title || id; };
  const valLabel = (key, v) => { const [kind, id] = key.split(':'); return kind === 't' ? K.sel.valueLabel(id, v) : kind === 'a' ? K.sel.classLabel(id, v) : kind === 'n' ? `at least ${v}` : (A[id]?.labels || {})[v] || v; };

  // ---- how to cite the marks shown (the protein page's box) ----------------------------------------------------------
  function citeBox(ms, what) {
    if (!K.card?.citeBox || !ms.length) return '';
    const box = K.card.citeBox(what, ms, (m, n) => attrStr(m, n), false);
    return box ? `<div id="t-cite">${box}</div>` : '';
  }

  // ---- the sections rail --------------------------------------------------------------------------------------------
  K.sections.proteins = () => {
    const cnt = K.sel?.active() ? K.sel.selectedCountByProtein() : null;
    const top = P.map(p => [p, cnt ? (cnt[p.i] || 0) : p.marks]).filter(([, k]) => k > 0).sort((x, y) => y[1] - x[1]).slice(0, 12);
    return [['view', 'Proteins', 1], ...(oneTerm() ? [['sel-card', 'Your selection', 1]] : []), ...(K.sel?.active() ? [['sel-enriched', 'Enriched features', 1]] : []),
      ['proteins-table', 'Protein table', 1], ['t-cite', 'How to cite', 1], ['g-top', cnt ? `Most ${W.marks} in the selection` : `Most ${W.marks}`, 0],
      ...top.map(([p, k]) => [`p-${p.acc}`, `${pLabel(p)} (${int(k)})`, 1, K.link('protein', p.acc)])];
  };
  K.views.proteins = { render: proteinsView, title: () => 'Proteins' };
  // the Method page's section on these pages
  K.methods.push({ id: 'tables', title: 'Proteins and Sites pages', html: () => `<section id="m-q-tables" class="qm"><h3>Proteins and Sites pages</h3>` +
    `<p>The Proteins page lists every protein with a ${esc(W.mark)} in the selection, the Sites page every ${esc(W.mark)}. The site file names the columns, including those the Columns menu adds, and the browser keeps your choice. Downloads hold every row in the table’s order, under # lines.</p>` +
    `<p>Enriched features compares the selection’s ${esc(W.marks)} with the site’s other ${esc(W.marks)} for each class of each residue question and each value of each attribute. Test: Fisher’s exact test on the 2×2 table (with the feature or not, in the selection or not), Benjamini–Hochberg within each question. Shown are features with q ≤ ${K.PADJ}, at least 1.1× either way and 10 ${esc(W.marks)}, with those saying how the ${esc(W.marks)} were found last. A question the selection was made with is not tested. ${cap(W.marks)} of one protein are not independent, so treat this as a pointer. The Overview compares the same groups question by question, also within proteins and within studies.</p>` +
    `<p>For a selection of one set of a protein-set question, Your selection shows the site’s own test of that set, and for one source, its reference.</p></section>` });

  // ---- events -------------------------------------------------------------------------------------------------------
  const copy = (text, el) => { const done = t => { const o = el.textContent; el.textContent = t; setTimeout(() => { el.textContent = o; }, 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Copy failed')); else done('Copy failed'); };
  const sortBy = (state, id, text) => { state.desc = state.sort === id ? !state.desc : !text; state.sort = id; };
  K.clicks.unshift(
    ['[data-feat]', el => { const r = EN.rows?.[+el.dataset.feat]; if (!r) return; const k = featureKey(r), cur = new Set(S.f[k] || []); cur.add(r.category); S.f[k] = [...cur]; K.writeHash(true); K.render(); }],
    ['[data-drop]', el => { const [kind, rest] = [el.dataset.drop.slice(0, 1), el.dataset.drop.slice(2)];
      if (kind === 'q') S.q = String(S.q).trim().split(/\s+/).filter((_, j) => j !== +rest).join(' '); else delete S.f[rest];
      K.writeHash(true); K.render(); }],
    ['[data-copy-genes]', el => copy(proteinRows().map(r => r.p.gene || r.p.acc).join('\n'), el)],
    ['[data-tsort]', el => { const id = el.dataset.tsort, c = pcols().find(x => x.id === id); sortBy(PS, id, id === 'protein' || (c && textCol(c))); K.render(); }],
    ['[data-tmore="p"]', () => { PS.n += 50; K.render(); }],
    ['[data-ptsv]', el => K.exportFigure('tsv', null, fileName('proteins'), el, proteinsTsv)],
    ['[data-enexp]', el => K.exportFigure(el.dataset.enexp, enrichedFigure, `${D.site.id}_enriched_features${K.sel?.active() ? '_selection' : ''}`, el, enrichedTsv)],
  );
  document.addEventListener('keydown', e => {
    const t = e.target; if (e.key !== 'Enter' && e.key !== ' ') return;
    if (t.matches?.('th[data-tsort], tr[data-feat]')) { e.preventDefault(); t.click(); }
    else if (t.matches?.('.ptbl2 tr[data-acc]')) { e.preventDefault(); K.go('protein', { arg: t.dataset.acc }); }
  });
  document.addEventListener('toggle', e => { if (e.target.id === 'sel-enriched') EN.open = e.target.open; }, true);
  K.tables = { siteMap, selectionCard, enrichedCard, emptyState, citeBox, figuresBtn, fileName, vals, attrStr, classes, byProt, selSet, selKey, fmtNum, sortBy, slug, today, P, pLabel, copy };
});
