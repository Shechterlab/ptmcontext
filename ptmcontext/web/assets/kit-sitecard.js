/* The site card's blocks, the sites table's cells, a site's Evidence row and a protein's citation box, each read from
   the tables of website.tables in the formats of CONTRACTS.md ("Tables the protein pages show"), with the words, codes
   and labels of website.protein.card. It knows no mark and no source by name: a block whose table or attribute a site
   lacks is absent. The protein page (kit-proteins.js) lays them out. A module of the site kit: K.card. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int, cap } = K;
  const C = D.protein_view?.card || {}, TH = D.tables || {}, LK = D.lookups || {}, SPECS = D.attribute_specs || {};
  const has = name => !!(name && TH[name]);

  // ---- the data: each protein's rows (data/e, the shards of data/p), a light page's record (data/u) ----------------
  const inline = (() => { try { return JSON.parse(document.getElementById('table-data')?.textContent || '{}'); } catch (e) { return {}; } })();
  const shardOf = acc => [...acc].reduce((n, c) => n + c.charCodeAt(0), 0) % (D.shards || 64);
  const cache = {};
  const getShard = (dir, k) => {
    const key = String(k).padStart(2, '0');
    if (dir === 'e' && inline[key]) return Promise.resolve(inline[key]);
    return (cache[dir + key] ||= fetch(`data/${dir}/${key}.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))));
  };
  // a protein's tables ({} when it has no rows, null when they cannot be read)
  // a shard writes its repeated strings once ('_s'); a number in a row (but a position) is an index there
  const load = acc => (Object.keys(TH).length ? getShard('e', shardOf(acc)).then(sh => ({ ...(sh[acc] || {}), _s: sh._s || [] }), () => null) : Promise.resolve({}));
  // the Sites page's default columns read one small file (data/sites_default.json) for every protein, not a shard each;
  // the one-file copy, which holds the shards, reads those
  const SDF = Object.keys(inline).length ? null : D.sites_default || null;
  let defLoad = null, defData = null; const defTb = {};
  const loadDefault = () => (defLoad ||= fetch('data/sites_default.json').then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).catch(() => ({})).then(f => (defData = f)));
  const defaultTb = acc => (defData ? (defTb[acc] ||= { ...(defData[acc] || {}), _s: defData._s || [] }) : undefined);
  const light = acc => getShard('u', shardOf(acc)).then(sh => (sh[acc] ? { ...sh[acc], _s: sh._s || [] } : null), () => null);
  const str = (s, v) => (typeof v === 'number' ? (s[v] ?? '') : v);
  const NUMS = new Set(['position', 'start', 'end']);                  // the columns whose numbers are numbers
  let lightIdx = null;
  const lightIndex = () => (lightIdx ||= fetch('data/u/index.json').then(r => (r.ok ? r.json() : [])).catch(() => []));
  // rows as objects, by the table's columns (a site-keyed row has its position first)
  const OBJ = new WeakMap();
  function rows(tb, name) {
    if (!tb || !tb[name] || !TH[name]) return [];
    let m = OBJ.get(tb); if (!m) OBJ.set(tb, m = {});
    const s = tb._s || [];
    return (m[name] ||= tb[name].map(r => Object.fromEntries(TH[name].columns.map((c, i) => [c, NUMS.has(c) ? r[i] : str(s, r[i])]))));
  }
  const at = (tb, name, pos) => rows(tb, name).filter(r => r.position === pos);
  const list = v => String(v ?? '').split(/;\s*/).filter(Boolean);
  const ctxWords = (t, c) => String(t || '').replace(/\{site\}/g, c?.label || '').replace(/\{gene\}/g, c?.gene || '').replace(/\{acc\}/g, c?.acc || '')
    .replace(/\{residues\}/g, W.residues).replace(/\{marks\}/g, W.marks);
  const attrVals = (c, name) => { const s = SPECS[name]; const v = c.attr(name); return !s ? [] : s.kind === 'list' ? (v ? v.split(s.separator || '; ') : []) : (v === '' ? [] : [v]); };
  const vLabel = (name, v) => (K.sel?.valueLabel ? K.sel.valueLabel(name, v) : (SPECS[name]?.values || {})[v] ?? v);
  const lookupRow = (key) => { const t = C.cite?.lookup; return t && LK[t] ? LK[t][key] : null; };
  const doiA = (doi, text) => (doi ? `<a href="https://doi.org/${esc(doi)}" target="_blank" rel="noopener">${text}</a>` : text);
  const sourceLink = key => { const r = lookupRow(key); return r ? doiA(r.doi, esc(r.label || key)) : esc(vLabel(C.cite?.attribute, key)); };
  const num = (v, f) => {
    if (v === '' || v == null) return '–';
    const x = +v; if (!isFinite(x)) return esc(v);
    if (f === 'p') return x === 0 ? '< 1e-300' : x < 1e-3 ? x.toExponential(1) : x.toFixed(3);
    if (f === 'l2') return (x > 0 ? '+' : '') + x.toFixed(2);
    return Number.isInteger(x) ? int(x) : x.toFixed(2);
  };
  // a residue i + d named as the page numbers it, with its offset from the site
  const rel = d => (d === 0 ? 'i' : `i${d > 0 ? '+' : '−'}${Math.abs(d)}`);

  // ---- interaction evidence ----------------------------------------------------------------------------------------
  const EV = C.evidence || {};
  function evidenceParts(c) {
    const tg = EV.tags || {}, vals = tg.attribute ? attrVals(c, tg.attribute) : [], pred = new Set(tg.predicted || []);
    const hasPred = vals.some(v => pred.has(v)), hasExp = vals.some(v => !pred.has(v));
    return { vals, hasPred, hasExp, pred };
  }
  function badge(c) {
    if (!EV.status || !SPECS[EV.status]) return '';
    const v = c.attr(EV.status), { hasPred, hasExp } = evidenceParts(c), col = K.map?.attrColour ? K.map.attrColour(EV.status, v) : '#999';
    const plus = hasPred && hasExp && !(EV.tags?.predicted || []).includes(v) ? ' + pred.' : '';
    return `<span class="ixs" style="--c:${col}" title="${
esc(SPECS[EV.status].help || SPECS[EV.status].label)}"><i></i>${esc(vLabel(EV.status, v))}${plus}</span>`;
  }
  function sentence(c) {
    const v = c.attr(EV.status), { hasPred, hasExp } = evidenceParts(c), s = EV.sentences || {};
    return esc((hasPred && hasExp && s[v + '_pred']) || s[v] || '');
  }
  function tags(c, max) {
    const tg = EV.tags; if (!tg?.attribute || !SPECS[tg.attribute]) return '';
    const { vals, pred } = evidenceParts(c), ptab = tg.partners, named = new Set(tg.named || []), out = [], seen = new Set(), labs = [];
    const partnersOf = kinds => { const rs = has(ptab) ? at(c.tb, ptab, c.pos).filter(r => kinds.includes(r.kind)) : []; return rs.sort((a, b) => (+b.score || 0) - (+a.score || 0)); };
    const predVals = vals.filter(v => pred.has(v));
    for (const v of vals) {
      if (pred.has(v)) continue;
      const short = (tg.short || {})[v] ?? vLabel(tg.attribute, v), key = short + '|' + ((tg.tone || {})[v] || '');
      if (seen.has(key)) continue; seen.add(key);
      const ps = partnersOf([v]), names = [...new Set(ps.map(r => r.partner).filter(Boolean))];
      const ids = [...new Set(ps.flatMap(r => list(r.ids)))].map(x => x.toUpperCase());      // a named kind also gives the entries that show it: "TNPO1 4FDD, 4FQ3 +4"
      const label = named.has(v) && names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') + (ids.length ? ' ' + ids.slice(0, 3).join(', ') + (ids.length > 3 ? ` +${ids.length - 3}` : '') : '') : short;
      const kinds = vals.filter(x => !pred.has(x) && ((tg.short || {})[x] ?? vLabel(tg.attribute, x)) + '|' + ((tg.tone || {})[x] || '') === key);   // the kinds this tag stands for (data-ev-kind: a page may open them)
      labs.push(label);
      out.push(`<span class="tag t-${esc((tg.tone || {})[v] || 'x')}" data-ev-kind="${esc(kinds.join(','))}" title="${
esc(vLabel(tg.attribute, v) + (names.length ? ': ' + names.join(', ') : ''))}">${esc(label)}</span>`);
    }
    if (predVals.length) {
      const ps = partnersOf(predVals), names = [...new Set(ps.map(r => r.partner).filter(Boolean))];
      const tip = predVals.map(v => vLabel(tg.attribute, v)).join(', ') + (ps.length ? ': ' + [...new Map(ps.map(r => [r.partner, r])).values()].slice(0, 20).map(r => `${r.partner}${
r.score ? ' ' + Number(r.score).toFixed(2) : ''}`).join(', ') : '');
      labs.push((tg.short || {})[predVals[0]] || 'pred.');
      out.push(`<span class="tag t-pred" data-ev-kind="${esc(predVals.join(','))}" title="${esc(tip)}">${
esc((tg.short || {})[predVals[0]] || 'pred.')}${
names.length ? ' ' + esc(names[0]) + (names.length > 1 ? ` +${names.length - 1}` : '') : ''}</span>`);
    }
    if (max < 0) return out.length ? `<span class="tag more" title="${esc(labs.join(', '))}">+${out.length}</span>` : '';   // compact rows: the count, the kinds on hover
    return out.length ? `<div class="tags ev-tags">${
(max ? out.slice(0, max) : out).join(' ')}${
max && out.length > max ? ` <span class="tag">+${out.length - max}</span>` : ''}</div>` : '';
  }
  const entryBtn = (id, c) => (`<a class="entry3d mono" href="${
esc((EV.entries?.url || '').replace('{id}', encodeURIComponent(id)))}" target="_blank" ` +
      `rel="noopener" data-entry3d="${esc(id)}" data-acc="${esc(c.acc)}" data-pos="${c.pos}" title="${esc(id.toUpperCase())}${
K.show3d ? ': show it in 3D at ' + esc(c.label) : ''}">${esc(id.toUpperCase())}</a>`);
  function entries(c, max = 6) {
    const e = EV.entries; if (!e || !has(e.table)) return '';
    const kinds = e.kinds || {}, groups = new Map();
    for (const r of at(c.tb, e.table, c.pos)) {
      if (!(r.kind in kinds)) continue;
      const name = kinds[r.kind] || r.partner || r.kind, key = r.kind + '|' + name;
      if (!groups.has(key)) groups.set(key, { name, tone: (EV.tags?.tone || {})[r.kind] || 'x', ids: [] });
      list(r.ids).forEach(id => { const g = groups.get(key); if (!g.ids.includes(id)) g.ids.push(id); });
    }
    const gs = [...groups.values()].filter(g => g.ids.length);
    if (!gs.length) return '';
    return `<div class="contacts">${
gs.slice(0, max).map(g => `<span><b class="t-${esc(g.tone)}">${esc(g.name)}</b> ${
g.ids.slice(0, 3).map(id => entryBtn(id, c)).join(', ')}${
g.ids.length > 3 ? (` <span class="muted" ` +
        `title="${
esc(g.ids.slice(3).map(x => x.toUpperCase()).join(', '))}">+${g.ids.length - 3}</span>`) : ''}</span>`).join('')}` +
      (gs.length > max ? `<span class="muted">+${gs.length - max} more</span>` : '') + '</div>';
  }
  // bound windows: the chain around the contacted unit, contacted units in brackets; '-' past the chain's end
  const SQ = EV.sequences || {};
  function windowsOf(c) {
    const out = new Map();
    for (const name of SQ.tables || []) {
      if (!has(name)) continue;
      for (const r of at(c.tb, name, c.pos)) {
        const off = +(r.offset || 0), key = [r.window, r.type, r.kind, off].join('|');
        if (!out.has(key)) out.set(key, { win: r.window, kind: r.kind, type: r.type, off, names: [], entries: new Set(), n: 0, dist: null, designed: true });
        const w = out.get(key);
        if (r.name && !w.names.includes(r.name)) w.names.push(r.name);
        if (r.entry) w.entries.add(r.entry);
        w.n += r.entries ? +r.entries : 0;
        if (r.distance !== '' && r.distance != null) w.dist = w.dist == null ? +r.distance : Math.min(w.dist, +r.distance);
        if (!SQ.designed || r.preparation !== SQ.designed.preparation) w.designed = false;
      }
    }
    return [...out.values()].map(w => ({ ...w, count: Math.max(w.n, w.entries.size) }))
      .sort((a, b) => (a.off !== 0) - (b.off !== 0) || b.count - a.count || (a.dist ?? 99) - (b.dist ?? 99));
  }
  const winHtml = w => {
    const [e5, e3] = SQ.ends || ['', ''];
    const body = w.win.replace(/\[([^\]])\]|(-)|([^[\]-])/g, (m0, hit, gap, ch) => (gap ? '<span class="gap">·</span>' : hit ? `<b class="nt hit">${esc(hit)}</b>` : `<span class="nt">${esc(ch)}</span>`));
    return `<span class="na-win">${
e5 ? `<span class="end">${esc(e5)}</span>` : ''}${body}${
e3 ? `<span class="end">${esc(e3)}</span>` : ''}</span>`;
  };
  const winMeta = (w, c) => `${
w.type ? `<span class="tag na-type" title="${esc((SQ.kinds || {})[w.kind] || w.kind)}">${esc((SQ.types || {})[w.type] || w.type)}</span>` : ''}` +
    `${
w.designed && SQ.designed ? `<span class="tag na-type">${esc(SQ.designed.label)}</span>` : ''}${
w.off ? (`<span class="tag" ` +
        `title="Contacted by residue ${esc(c.shown(c.pos + w.off))} (${rel(w.off)}), not by ${esc(c.label)} itself">via ${rel(w.off)}</span>`) : ''}`;
  function sequences(c, compact) {
    if (!(SQ.tables || []).some(has)) return '';
    const ws = windowsOf(c); if (!ws.length) return '';
    const entriesWord = n => `${int(n)} entr${n === 1 ? 'y' : 'ies'}`;
    if (compact) { const w = ws[0]; return `<div class="na-cell">${winHtml(w)}<div class="na-meta">${winMeta(w, c)}<span class="muted">${entriesWord(w.count)}${
ws.length > 1 ? ` · +${ws.length - 1} more` : ''}</span></div></div>`; }
    const max = SQ.max || 5;
    return `<p class="flabel">${esc(ctxWords(SQ.title || 'Bound sequences', c))}</p><ul class="sc-na">` +
      ws.slice(0, max).map(w => `<li>${winHtml(w)} ${winMeta(w, c)} <span class="muted small" title="${
esc(w.names.join('\n') + '\n' + [...w.entries].map(x => x.toUpperCase()).join(' '))}">${esc(w.names[0] || '')}${w.names[0] ? ' · ' : ''}${entriesWord(w.count)}${
w.dist != null ? ` · ${w.dist.toFixed(1)} Å` : ''}</span></li>`).join('') + '</ul>' +
      (ws.length > max ? `<p class="muted small">${int(ws.length - max)} more bound sequence${ws.length - max === 1 ? '' : 's'}.</p>` : '');
  }
  // residue evidence at or near the site: residues within span (each with its offset), and stretches holding the site
  const AR = EV.around || {};
  function aroundRows(c) {
    if (!has(AR.table)) return [];
    const span = AR.span ?? 3, lab = AR.labels || {};
    return rows(c.tb, AR.table).filter(r => r.kind in lab && (r.start === r.end ? Math.abs(r.start - c.pos) <= span : c.pos >= r.start && c.pos <= r.end));
  }
  function around(c, compact) {
    const rs = aroundRows(c); if (!rs.length) return '';
    const lab = AR.labels || {}, short = { ...(EV.tags?.short || {}), ...(AR.short || {}) }, by = new Map();
    rs.forEach(r => { if (!by.has(r.kind)) by.set(r.kind, []); by.get(r.kind).push(r); });
    const seq = c.seq || '';
    if (compact === 'brief') {   // one tag and "+n" (the kinds on hover), for a one-line row
      const ks = [...by.keys()], first = ks[0];
      return `<div class="na-meta"><span class="tag t-${esc((EV.tags?.tone || {})[first] || 'x')}" title="${esc(lab[first] || first)}">${esc(short[first] || first)}</span>${
ks.length > 1 ? (`<span class="tag ` +
          `more" title="${esc(ks.map(k => lab[k] || k).join('\n'))}">+${ks.length - 1}</span>`) : ''}</div>`;
    }
    if (compact) return `<div class="na-meta">${[...by.entries()].map(([k, xs]) => { const pts = xs.filter(r => r.start === r.end).map(r => r.start - c.pos).sort((a, b) => Math.abs(a) - Math.abs(b));
      return `<span class="tag t-${esc((EV.tags?.tone || {})[k] || 'x')}" title="${esc(lab[k] || k)}">${esc(short[k] || k)}${
pts.length ? ' ' + (pts[0] === 0 ? 'at i' : rel(pts[0])) : ''}</span>`; }).join('')}</div>`;
    return `<p class="small sc-around">${cap([...by.entries()].map(([k, xs]) => {
      const pts = xs.filter(r => r.start === r.end).map(r => r.start).sort((a, b) => Math.abs(a - c.pos) - Math.abs(b - c.pos));
      const spans = xs.filter(r => r.start !== r.end);
      return `${esc(lab[k] || k)}${
pts.length ? ': ' + pts.slice(0, 4).map(q => (q === c.pos ? 'the site (i)' : `${esc((seq[q - 1] || '') + c.shown(q))} (${rel(q - c.pos)})`)).join(', ') + (pts.length > 4 ? ` +${pts.length - 4}` : '') : ''}` +
        `${
spans.length ? ' ' + [...new Set(spans.map(r => `${c.shown(r.start)}–${c.shown(r.end)}`))].join(', ') : ''}`;
    }).join('; '))}.</p>`;
  }
  // the whole protein, labeled so it is not read as site evidence
  function wholeProtein(c) {
    const pr = EV.protein; if (!pr || (pr.table && !has(pr.table))) return '';
    const r = pr.table ? rows(c.tb, pr.table)[0] || {} : {};
    // a value: a protein attribute (proteins.attributes, K.proteinAttr) or a column of a protein_values table
    const parts = (pr.values || []).map(v => {
      const x = v.attribute ? K.proteinAttr?.(c.acc, v.attribute) : r[v.column]; if (x === '' || x == null || x === 0 || x === '0' || x === 'false') return '';
      if (v.flag) return esc(v.label);
      return v.before ? `${esc(v.label)} ${esc(String(x).replace(/;\s*/g, ', '))}` : `${esc(num(x))} ${esc(v.label)}`;
    }).filter(Boolean);
    if (!parts.length) return '';
    return `<p class="sc-prot"><span class="flabel">${
esc(ctxWords(pr.title || 'Whole protein', c))}</span> ${parts.join(' · ')}` +
      (pr.opens && document.getElementById(pr.opens) ? ` <button class="linkish" type="button" data-open-fold="${esc(pr.opens)}">${
esc(ctxWords(pr.opens_label || 'More', c))}</button>` : '') + '</p>';
  }
  function evidenceBlock(c) {
    if (!EV.status && !EV.tags && !EV.entries && !(SQ.tables || []).length) return '';
    const body = (EV.status ? `<p class="sc-status">${badge(c)} ${sentence(c)}</p>` : '') + tags(c) + entries(c) + sequences(c) + around(c) + wholeProtein(c);
    return `<section class="sc-ix"><h4>${esc(EV.title || 'Interaction evidence')}${K.methodLink ? '' : ''}</h4>${body}</section>`;
  }

  // ---- the methylation state as each source gives it; changes with their counts; perturbation calls --------------
  function states(c, compact) {
    const ss = C.states || []; if (!ss.length) return '';
    const lines = ss.map(s => {
      let vals;
      if (s.attribute) vals = attrVals(c, s.attribute).map(v => vLabel(s.attribute, v));
      else if (has(s.table)) vals = list((at(c.tb, s.table, c.pos)[0] || {})[s.column]);
      else return '';
      if (!vals.length) return '';
      const lab = s.url ? (`<a href="${
esc(s.url.replace('{acc}', encodeURIComponent(c.acc)))}" target="_blank" ` +
          `rel="noopener">${esc(s.label)}</a>`) : s.source && lookupRow(s.source)?.doi ? doiA(lookupRow(s.source).doi, esc(s.label)) : esc(s.label);
      return compact ? `<span class="tag" title="${esc(s.label)}">${esc(vals.join('/'))} <span class="muted">${esc(s.label.split(/[ ,(]/)[0])}</span></span>` : `${esc(vals.join(', '))} <span class="muted">${lab}</span>`;
    }).filter(Boolean);
    return lines.length ? (compact ? `<div class="tags">${lines.join(' ')}</div>` : lines.join('<br>')) : (compact ? '<span class="muted">–</span>' : '<span class="muted">no source gives a state</span>');
  }
  const renumber = (c, v) => String(v).replace(/^([A-Za-z])(\d+)(?=[A-Za-z*])/, (m0, a, d) => (+d === c.pos ? a + c.shown(c.pos) : m0));
  function changes(c) {
    const cs = C.changes || []; if (!cs.length) return '';
    const parts = cs.map(x => {
      const vals = attrVals(c, x.attribute); if (!vals.length) return '';
      const n = has(x.table) && x.counts ? list((at(c.tb, x.table, c.pos)[0] || {})[x.counts]) : [];
      const tot = n.reduce((a, b) => a + (+b || 0), 0), unit = x.unit || ['', ''];
      return `${
vals.map((v, i) => `<b>${esc(renumber(c, v))}</b>${+n[i] > 1 ? ' ×' + int(n[i]) : ''}`).join(', ')}${
tot ? (` <span class="muted">` +
          `in ${int(tot)} ${esc(tot === 1 ? unit[0] : unit[1])}</span>`) : ''} <span class="muted">(${esc(x.label)})</span>`;
    }).filter(Boolean);
    return parts.length ? parts.join('<br>') : `<span class="muted">no change in ${esc(cs.map(x => x.label).join(' or '))}</span>`;
  }
  const CL = C.calls || {};
  function callRows(c) {
    const out = [], skip = new Set(CL.skip || []);
    for (const name of CL.tables || []) if (has(name)) at(c.tb, name, c.pos).forEach(r => { if (!skip.has(r.call)) out.push({ label: (CL.conditions || {})[r.condition] || r.condition, ...r }); });
    for (const [a, lab] of Object.entries(CL.attributes || {})) attrVals(c, a).forEach(v => { if (!skip.has(v)) out.push({ label: lab, call: v, attribute: a }); });
    return out;
  }
  // the key to the marks of a calls column: each mark with its word, the quiet word, and the dash
  const callsKey = () => (`<p class="key calls-key">${
Object.entries(CL.marks || {}).map(([k, m]) => (`<span><span ` +
      `class="trend c-${esc(k)}"><b>${esc(m)}</b></span> ${esc((CL.words || {})[k] || k)}</span>`)).join('')}<span><span ` +
      `class="muted">${esc(CL.quiet || 'n.s.')}</span> measured, no significant change</span><span><span ` +
      `class="muted">–</span> not measured</span><span class="muted">a number beside a mark: how many experiments ` +
      `· hover for the numbers</span></p>`);
  function calls(c, compact) {
    if (!(CL.tables || []).some(has) && !Object.keys(CL.attributes || {}).some(a => SPECS[a])) return '';
    const rs = callRows(c); if (!rs.length) return '<span class="muted">–</span>';
    const marked = rs.filter(r => (CL.marks || {})[r.call]);
    const tip = r => [`${r.label}: ${(CL.words || {})[r.call] || r.call}`, r.n ? `${r.n} peptide${+r.n === 1 ? '' : 's'}${
r.n_down || r.n_up ? ` (${r.n_down || 0} down, ${r.n_up || 0} up)` : ''}` : '', r.value !== undefined && r.value !== '' ? `log2 ${num(r.value, 'l2')}` : '', r.q ? `q ${num(r.q, 'p')}` : '', r.rule ? `rule: ${String(r.rule).replace(/_/g, ' ')}` : ''].filter(Boolean).join(' · ');
    if (!marked.length) return `<span class="muted" title="${
esc('Measured: ' + rs.map(r => r.label).join(', ') + '; no significant change')}">${esc(CL.quiet || 'n.s.')}</span>`;
    // the row's hover stays short (a sentence, not each measurement: the site card's table has those): the call, then up to
    // three conditions with their log2, and how many more
    const brief = (k, xs) => `${(CL.words || {})[k] || k}: ` + xs.slice(0, 3).map(r => r.label + (r.value !== undefined && r.value !== '' ? ` (log2 ${num(r.value, 'l2')})` : '')).join(', ') + (xs.length > 3 ? ` and ${xs.length - 3} more` : '');
    if (compact) {   // one symbol and a count per kind of call; the legend (each measurement) on hover
      const by = new Map(); marked.forEach(r => { if (!by.has(r.call)) by.set(r.call, []); by.get(r.call).push(r); });
      return [...by.entries()].map(([k, xs]) => `<span class="trend c-${esc(k)}" title="${esc(brief(k, xs))}"><b>${esc(CL.marks[k])}</b>${xs.length > 1 ? xs.length : ''}</span>`).join(' ');
    }
    return marked.map(r => `<span class="trend c-${esc(r.call)}" title="${esc(tip(r))}"><b>${esc(CL.marks[r.call])}</b>${esc(r.label)}</span>`).join(' ');
  }
  function callsTable(c) {
    const rs = callRows(c).filter(r => !r.attribute); if (!rs.length) return '';
    return (`<p><b>${
esc(cap(C.calls?.title || 'Perturbations'))}</b> <span class="muted small">(every measurement ` +
        `at the site; a call is a peptide-level change)</span></p><div class="tbl-card"><table class="tbl compact">` +
        `<thead><tr><th>Condition</th><th>Call</th><th class="num">Peptides (▼/▲)</th><th class="num">log2</th><th ` +
        `class="num">q</th><th>Rule</th></tr></thead><tbody>`) +
      rs.map(r => (`<tr><td>${esc(r.label)}</td><td>${
(CL.marks || {})[r.call] ? `<b class="trend c-${esc(r.call)}">${esc(CL.marks[r.call])}</b> ` : ''}${esc((CL.words || {})[r.call] || r.call)}</td><td ` +
          `class="num">${esc(r.n || '–')}${
r.n_down !== undefined ? ` <span class="muted">(${esc(r.n_down || 0)}/${esc(r.n_up || 0)})</span>` : ''}</td><td ` +
          `class="num">${num(r.value, 'l2')}</td><td class="num">${num(r.q, 'p')}</td><td class="small">${
esc(String(r.rule || '').replace(/_/g, ' '))}</td></tr>`)).join('') + '</tbody></table></div>';
  }

  // ---- who binds it, and how it was found (site_records) ------------------------------------------------------------
  const RC = C.records || {};
  const grpLabel = g => (RC.groups && SPECS[RC.groups] ? vLabel(RC.groups, g) : g.replace(/_/g, ' '));
  const grpOrder = g => { const v = Object.keys(SPECS[RC.groups]?.values || {}); const k = v.indexOf(g); return k < 0 ? 999 : k; };
  const paperKey = r => r.pubmed || r.doi || r.citation || '';
  const paperA = r => { const url = r.pubmed ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(r.pubmed)}/` : r.doi ? `https://doi.org/${r.doi}` : '';
    const label = esc(r.citation || (r.pubmed ? 'PMID ' + r.pubmed : r.doi ? 'doi:' + r.doi : ''));
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(r.title || '')}">${label}</a>` : label; };
  function recordGroups(c, rs) {
    const by = new Map();
    for (const r of rs) {
      if (!by.has(r.group)) by.set(r.group, new Map());
      const g = by.get(r.group), key = [r.partner_kind, r.partner_accession || r.partner || r.partner_name, r.state, r.source, r.species].join('|');
      if (!g.has(key)) g.set(key, { ...r, ids: [], methods: [], papers: new Map(), n: 0 });
      const x = g.get(key); x.n++;
      if (r.id && !x.ids.includes(r.id)) x.ids.push(r.id);
      if (r.method && !x.methods.includes(r.method)) x.methods.push(r.method);
      if (paperKey(r)) x.papers.set(paperKey(r), r);
    }
    return [...by.entries()].sort((a, b) => grpOrder(a[0]) - grpOrder(b[0]));
  }
  function partnerHtml(r, c) {
    const kinds = RC.kinds || {}, other = RC.species && r.species && !String(r.species).split(/[;,]\s*/).includes(RC.species);
    let name;
    if (r.partner_kind === 'self' || (r.partner_accession && r.partner_accession === c.acc)) name = (`<b>${esc(c.gene)}</b> <span ` +
        `class="muted">${esc(kinds.self || 'another copy')}</span>`);
    else if (r.partner_kind === 'protein' || (!r.partner_kind && r.partner_accession)) {
      const here = r.partner_accession && c.isListed?.(r.partner_accession) && !other;
      const label = esc(r.partner || r.partner_name || r.partner_accession || '');
      name = here ? `<a href="${
esc(K.link('protein', r.partner_accession))}" title="${esc(r.partner_name || '')}"><b>${label}</b></a>` : `<b title="${
esc((r.partner_name || '') + (r.partner_accession ? ' (' + r.partner_accession + ')' : ''))}">${label}</b>`;
    } else name = `<b>${
esc(kinds[r.partner_kind] || r.partner_kind || '')}</b>${
r.partner_name ? ` <span class="muted">${esc(String(r.partner_name).slice(0, 60))}</span>` : ''}`;
    return name + (other ? ` <span class="sp-species" title="${esc(r.species)}">${
esc(String(r.species).split(/[;,]/)[0].replace(/^([A-Z])[a-z]+ /, '$1. '))}</span>` : '');
  }
  function sourceCell(x, c) {
    const url = (RC.urls || {})[x.source], ids = x.ids;
    const link = id => (x.source && url && /\{id\}/.test(url) ? (EV.entries && x.source === Object.keys(RC.urls || {})[0] ? entryBtn(id, c) : (`<a href="${
esc(url.replace('{id}', encodeURIComponent(id)))}" target="_blank" ` +
        `rel="noopener">${esc(id.toUpperCase?.() === id ? id : id)}</a>`)) : esc(id));
    return `${esc(x.source || '')} ${ids.slice(0, 4).map(link).join(', ')}${
ids.length > 4 ? (` <details ` +
        `class="sp-more"><summary>+${ids.length - 4}</summary>${ids.slice(4).map(link).join(', ')}</details>`) : ''}`;
  }
  function methodCell(x) {
    const fam = new Map();
    x.methods.forEach(m => { const [f, res] = String(m).split(/,\s*(?=[\d.]+\s*Å)/); if (!fam.has(f)) fam.set(f, []); if (res) fam.get(f).push(parseFloat(res)); });
    return [...fam.entries()].map(([f, rs]) => esc(f) + (rs.length ? ` <span class="muted">${
rs.length > 1 ? Math.min(...rs).toFixed(1) + '–' + Math.max(...rs).toFixed(1) : rs[0].toFixed(1)} Å</span>` : '')).join('; ');
  }
  const stateCell = x => `<span class="sp-state" title="${esc(x.state_detail || '')}">${
esc((RC.states || {})[x.state] ?? x.state ?? '')}</span>${
x.other_marks ? (` <span class="sp-marks" ` +
      `title="Other marks of the protein in the experiment">+ ${esc(x.other_marks)}</span>`) : ''}`;
  const papersCell = x => { const ps = [...x.papers.values()]; return ps.length ? ps.slice(0, 2).map(paperA).join('<br>') + (ps.length > 2 ? (`<details ` +
      `class="sp-more"><summary>+${ps.length - 2} more</summary>${ps.slice(2).map(paperA).join('<br>')}</details>`) : '') : '<span class="muted">–</span>'; };
  function recordsSummary(c, rs) {
    const n = new Map(), papers = new Set(), quiet = new Set(RC.not_papers || []);
    rs.forEach(r => { n.set(r.group, (n.get(r.group) || 0) + 1); if (!quiet.has(r.group) && paperKey(r)) papers.add(paperKey(r)); });
    return `${int(rs.length)} interaction record${rs.length === 1 ? '' : 's'} from ${int(papers.size)} paper${papers.size === 1 ? '' : 's'} and datasets: ` +
      [...n.entries()].sort((a, b) => grpOrder(a[0]) - grpOrder(b[0])).map(([g, k]) => `${
grpLabel(g).replace(/^[A-Z](?=[a-z])/, ch => ch.toLowerCase())} ${int(k)}`).join(' · ');
  }
  function recordsBlock(c) {
    if (!has(RC.table)) return '';
    const rs = at(c.tb, RC.table, c.pos);
    const body = !rs.length ? `<p class="muted small">No interaction record at ${esc(c.label)}.</p>` : (`<p class="sp-sum">${esc(recordsSummary(c, rs))} <button ` +
        `class="linkish small" type="button" data-rec-tsv="${c.pos}">TSV</button></p>`) +
      recordGroups(c, rs).map(([g, m], _k, all) => {
        const xs = [...m.values()], n = xs.reduce((t, x) => t + x.n, 0), who = new Set(xs.map(x => x.partner || x.partner_name || x.partner_kind));
        const row = x => (`<tr><td data-label="Partner">${partnerHtml(x, c)}</td><td data-label="Evidence">${sourceCell(x, c)}</td><td ` +
            `data-label="Method">${methodCell(x)}</td><td data-label="Site in it">${stateCell(x)}</td><td ` +
            `data-label="Paper">${papersCell(x)}</td></tr>`);
        return (`<details class="sp-group"${
(RC.open || []).includes(g) || all.length === 1 ? ' open' : ''}><summary><b>${esc(cap(grpLabel(g)))}</b> <span ` +
            `class="muted small">${int(who.size)} partner${who.size === 1 ? '' : 's'} · ${int(n)} record${n === 1 ? '' : 's'}${
(RC.help || {})[g] ? ' — ' + esc(RC.help[g]) : ''}</span></summary>`) +
          (`<div class="tbl-card"><table class="tbl compact sp-tbl stackable"><thead><tr><th>Partner</th><th>` +
              `Evidence</th><th>Method</th><th>Site in it</th><th>Paper</th></tr></thead><tbody>${xs.slice(0, 8).map(row).join('')}</tbody>`) +
          (xs.length > 8 ? `<tbody class="sp-rest" hidden>${xs.slice(8).map(row).join('')}</tbody>` : '') + '</table></div>' +
          (xs.length > 8 ? `<button class="linkish small" type="button" data-sp-all>Show all ${int(xs.length)} rows</button>` : '') + '</details>';
      }).join('');
    return `<section class="sc-sp"><h4>${esc(RC.title || 'Records at the site')}</h4>${body}</section>`;
  }
  function recordsTsv(c) {
    const rs = at(c.tb, RC.table, c.pos), cols = TH[RC.table].columns.filter(x => x !== 'position');
    return K.preamble(`interaction records at ${c.gene} ${c.label}`, `every record at the site (${D.tables[RC.table] ? RC.table : ''}), one row each`) +
      ['site', ...cols].join('\t') + '\n' + rs.map(r => [`${c.gene} ${c.label}`, ...cols.map(k => String(r[k] ?? '').replace(/[\t\n]/g, ' '))].join('\t')).join('\n') + '\n';
  }

  // a protein's records at all its marks, site first: what the records at each site say and with whom (the protein page's Interactions view)
  function proteinRecords(p, tb, siteLabel, isListed) {
    if (!has(RC.table)) return null;
    const rs = rows(tb, RC.table).filter(r => r.partner_kind === 'protein' || r.partner_kind === 'self' || (!r.partner_kind && r.partner_accession));
    const by = new Map();
    for (const r of rs) {
      if (!by.has(r.position)) by.set(r.position, new Map());
      const g = by.get(r.position); if (!g.has(r.group)) g.set(r.group, { names: new Map(), papers: new Set() });
      const x = g.get(r.group), nm = r.partner_kind === 'self' ? 'another copy' : (r.partner || r.partner_name || r.partner_accession);
      if (nm) x.names.set(nm, r.partner_kind === 'self' || !r.partner_accession || !isListed?.(r.partner_accession) ? null : r.partner_accession);
      if (paperKey(r)) x.papers.add(paperKey(r));
    }
    const sites = [...by.keys()].sort((a, b) => a - b);
    const nameHtml = ([nm, acc]) => (acc ? `<a href="${esc(K.link('protein', acc))}"><b>${esc(nm)}</b></a>` : `<b>${esc(nm)}</b>`);
    const row = pos => { const g = by.get(pos), papers = new Set([...g.values()].flatMap(x => [...x.papers]));
      return (`<tr><td data-label="Site"><button type="button" class="linkish mono" data-site-open="${pos}">${esc(siteLabel(pos))}</button>` +
          `</td><td data-label="What the records show">`) +
        [...g.entries()].sort((a, b) => grpOrder(a[0]) - grpOrder(b[0])).map(([k, x]) => (`<span class="pw-g"><span ` +
            `class="muted">${esc(cap(grpLabel(k)))}</span> ${
[...x.names].slice(0, 5).map(nameHtml).join(', ')}${
x.names.size > 5 ? ` <span class="muted">+${x.names.size - 5}</span>` : ''}</span>`)).join('') +
        `</td><td data-label="Papers" class="num">${
papers.size ? int(papers.size) : '<span class="muted">–</span>'}</td></tr>`; };
    return { n: sites.length, rows: sites.map(row) };
  }

  // ---- writer and reader --------------------------------------------------------------------------------------------
  const WR = C.writer || {};
  function writerBlock(c) {
    if (!WR.who && !WR.suggest && !WR.partners) return '';
    const dl = (dt, dd) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`;
    const lines = [];
    if (has(RC.table)) for (const w of WR.who || []) {
      const names = [...new Set(at(c.tb, RC.table, c.pos).filter(r => (w.groups || []).includes(r.group)).map(r => r.partner || r.partner_name).filter(Boolean))];
      if (names.length || w.none) lines.push(dl(esc(w.label), names.length ? esc(names.join(', ')) : `<span class="muted">${esc(w.none)}</span>`));
    }
    if (WR.suggest) {
      const sg = WR.suggest, hits = (sg.rules || []).filter(r => SPECS[r.attribute] && attrVals(c, r.attribute).some(v => (r.has || []).includes(v)));
      const drop = new Set(hits.map(r => r.replaces).filter(Boolean)), who = [...new Set(hits.map(r => r.suggests))].filter(x => !drop.has(x));
      const refs = (sg.sources || []).map(sourceLink).join('; ');
      lines.push(dl(esc(sg.label || 'Suggested'), who.length ? (`<b>${esc(who.join(' and '))}</b> <span ` +
          `class="muted">(indirect) · ${esc(hits.map(r => r.because).join('; '))}${refs ? ` (${refs})` : ''}</span>`) : `<span class="muted">${esc(sg.none || '')}</span>`));
    }
    if (WR.partners && has(WR.partners.table)) {
      const ps = rows(c.tb, WR.partners.table);
      for (const [cls, lab] of Object.entries(WR.partners.classes || {})) {
        const hit = ps.filter(r => list(r.classes).includes(cls)).sort((a, b) => b.score - a.score);
        lines.push(dl(esc(ctxWords(lab, c)), (hit.length ? hit.slice(0, 8).map(r => { const a = c.isListed?.(r.partner_accession);
          return a ? `<a href="${
esc(K.link('protein', r.partner_accession))}" title="score ${esc(r.score)}">${esc(r.partner || r.partner_accession)}</a>` : `<span title="score ${esc(r.score)}">${esc(r.partner || r.partner_accession)}</span>`; }).join(', ') + (hit.length > 8 ? ` +${hit.length - 8}` : '')
          : `<span class="muted">${esc(WR.partners.none || 'none')}</span>`) + (WR.partners.note ? (` <span class="muted ` +
              `small">${esc(WR.partners.note)}</span>`) : '')));
      }
    }
    if (!lines.length) return '';
    return `<section class="sc-wr"><h4>${esc(WR.title || 'Writer and reader')}</h4><dl class="sc-kv">${lines.join('')}</dl>${
WR.note ? (`<details ` +
        `class="sc-note"><summary>How to read this</summary><p class="muted small">${esc(WR.note)}</p></details>`) : ''}</section>`;
  }

  // ---- source records (the Evidence row) -----------------------------------------------------------------------------
  const SR = C.sources || {};
  function pepHtml(pep, c) {
    if (!pep) return '<span class="muted">–</span>';
    const res = [];
    for (let k = 0; k < pep.length; k++) {
      const ch = pep[k];
      if (ch === '(' || ch === '[') { const close = ch === '(' ? ')' : ']', e = pep.indexOf(close, k); if (res.length) res[res.length - 1].mod = pep.slice(k + 1, e < 0 ? pep.length : e); k = e < 0 ? pep.length : e; }
      else if (/[A-Za-z]/.test(ch)) res.push({ aa: ch.toUpperCase(), mod: '' });
    }
    // the site's residue, where the peptide lines up with the site's window without a mismatch
    let site = -1; const win = c.window || '', mid = Math.floor(win.length / 2), aa = win[mid];
    if (win) {
      const fits = [];
      res.forEach((r, k) => { if (r.aa !== aa) return; let n = 0, bad = false;
        res.forEach((q, i) => { const w = win[mid - k + i]; if (w && w !== '_') { if (w === q.aa) n++; else bad = true; } });
        if (!bad && n >= Math.min(res.length, 6)) fits.push(k); });
      const marked = fits.filter(k => res[k].mod); site = fits.length === 1 ? fits[0] : marked.length === 1 ? marked[0] : -1;
    }
    return `<span class="pep-seq">${
res.map((r, k) => { const t = r.mod ? `<b class="pep-me" title="${
esc(r.aa + '(' + r.mod + ') in the source')}">${esc(r.aa)}<sup>${esc(r.mod)}</sup></b>` : esc(r.aa); return k === site ? (`<span class="c" ` +
        `title="This site">${t}</span>`) : t; }).join('')}</span>`;
  }
  function sourcesBlock(c) {
    if (!has(SR.table)) return '';
    const rs = at(c.tb, SR.table, c.pos); if (!rs.length) return '';
    const showState = rs.some(r => r.state), checks = SR.checks || {}, warn = new Set(SR.warn || []);
    const body = rs.map(r => {
      const st = SR.attribute ? vLabel(SR.attribute, r.source) : r.source, lk = lookupRow(r.source);
      const name = r.doi || lk?.doi ? doiA(r.doi || lk.doi, esc(st)) : esc(st);
      const via = [(SR.tables || {})[r.source_table] || '', r.pubmed ? 'PubMed ' + list(r.pubmed.replace(/[,\s]+/g, ';')).map(id => (`<a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(id)}/" target="_blank" ` +
          `rel="noopener">${esc(id)}</a>`)).join(', ') : ''].filter(Boolean);
      const acc0 = r.reported_accession || '', pos0 = r.reported_position === '' || r.reported_position == null ? null : +r.reported_position;
      const moved = (acc0 && acc0 !== c.acc) || (pos0 != null && pos0 !== c.pos);
      const ok = !warn.has(r.check), chk = checks[r.check] || String(r.check || '').replace(/_/g, ' ');
      return `<tr><td data-label="Source"><b>${name}</b>${
via.length ? `<span class="src-via">${
via.map(v => (v.startsWith('PubMed') ? v : esc(v))).join(' · ')}</span>` : ''}${
r.reference && !lk ? `<span class="src-via">${esc(r.reference)}</span>` : ''}</td>` +
        `<td data-label="Peptide" class="pep">${pepHtml(r.peptide, c)}${
r.enzyme ? `<span class="src-via">Enzyme: ${esc(r.enzyme)}</span>` : ''}${
r.sample || r.detail ? `<span class="src-via">${
esc([r.sample, r.detail].filter(Boolean).join(' · '))}</span>` : ''}</td>` +
        (showState ? `<td data-label="State">${
r.state ? esc(r.state) : '<span class="muted">not given</span>'}</td>` : '') +
        `<td data-label="Reported as"><span class="mono">${esc(acc0)}${
pos0 != null ? ' ' + esc((c.seq || '')[c.pos - 1] || '') + pos0 : ''}</span>${moved ? ` → <b>${esc(c.label)}</b>` : ''}${
chk ? `<span class="src-map ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '⚠'} ${esc(chk)}</span>` : ''}</td></tr>`;
    }).join('');
    const notices = [...new Set(rs.map(r => (C.cite?.notices || {})[r.source]).filter(Boolean))];
    return `<p><b>Source records</b> (${int(rs.length)}) </p>` +
      (`<div class="tbl-card"><table class="src-tbl tbl compact stackable"><thead><tr><th>Source</th><th>` +
          `Peptide</th>${showState ? '<th>State</th>' : ''}<th>Reported as</th></tr></thead><tbody>${body}</tbody></table>` +
          `</div>`) +
      notices.map(n => `<p class="note">${esc(n)}</p>`).join('');
  }
  function siteTables(c) {
    return (C.tables || []).filter(x => has(x.table)).map(x => {
      const rs = at(c.tb, x.table, c.pos); if (!rs.length) return '';
      const cell = (col, r) => {
        const v = r[col.column];
        if (col.words === 'calls') return `${
(CL.marks || {})[v] ? `<b class="trend c-${esc(v)}">${esc(CL.marks[v])}</b> ` : ''}${
esc((CL.words || {})[v] || String(v || '–').replace(/_/g, ' '))}`;
        return (col.format ? num(v, col.format) : esc(v)) + (col.with ? ` <span class="muted">(${
col.with.map(w => esc(r[w] || 0)).join('/')})</span>` : '');
      };
      return (`<p><b>${esc(x.title || x.table)}</b>${
x.source ? ` (${sourceLink(x.source)})` : ''}${
x.note ? (` <span class="muted ` +
          `small">${esc(x.note)}</span>`) : ''}</p><div class="tbl-card"><table class="tbl compact"><thead><tr>${
(x.columns || []).map(col => `<th${col.format ? ' class="num"' : ''}>${esc(col.label || col.column)}</th>`).join('')}</tr></thead>` +
          `<tbody>`) +
        rs.map(r => `<tr>${
(x.columns || []).map(col => `<td${col.format ? ' class="num"' : ''}>${cell(col, r)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
    }).join('');
  }
  // the Evidence row: the measurements, the site's tables, the window ±15 and every source record
  function evidenceRow(c) {
    const out = siteTables(c) + callsTable(c) + (c.window31 ? `<p><b>Window ±15:</b> <span class="mono win">${esc(c.window31)}</span></p>` : '') + sourcesBlock(c);
    return out || '<p class="muted">No further evidence.</p>';
  }

  // ---- how to cite a protein's sites -------------------------------------------------------------------------------
  const CT = C.cite || {};
  function citeRefs(marks, attrOf) {
    const n = new Map();
    marks.forEach(m => list(String(attrOf(m, CT.attribute)).replace(new RegExp((SPECS[CT.attribute]?.separator || '; ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ';')).forEach(v => n.set(v, (n.get(v) || 0) + 1)));
    const linkOf = SPECS[CT.attribute]?.link ? (D.attribute_links?.[CT.attribute] || K.sel?.data()?.attribute_links?.[CT.attribute] || {}) : {};
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([v, k]) => { const r = lookupRow(v) || {}; return { key: v, n: k, text: r.citation || vLabel(CT.attribute, v), doi: r.doi || linkOf[v] || '', licence: r.licence || '' }; });
  }
  const refText = r => r.text + (r.doi ? ' doi:' + r.doi : '');
  function citeBox(what, marks, attrOf, open) {
    if (!CT.attribute || !SPECS[CT.attribute] || !marks.length) return '';
    const refs = citeRefs(marks, attrOf), pref = K.CIT?.preferred;
    const text = [pref ? `Compilation: ${pref.text}${pref.doi ? ' doi:' + pref.doi : ''}` : '', '', `${SPECS[CT.attribute].label} that reported ${what}:`, ...refs.map(r => `- ${refText(r)} [${r.n} ${r.n === 1 ? W.mark : W.marks}]`)].join('\n').trim();
    const notices = [...new Set(refs.map(r => (CT.notices || {})[r.key]).filter(Boolean))];
    const ris = [...(pref ? [[pref.text, pref.doi || '']] : []), ...refs.map(r => [r.text, r.doi])];
    return `<details class="cite-box"${open ? ' open' : ''}><summary>How to cite ${esc(what)}</summary>` +
      (`<p class="small">Please cite the original ${
esc(SPECS[CT.attribute].label.toLowerCase())} that reported the ${esc(W.marks)} you use${
pref ? (`, and ${esc(pref.short || pref.text)} (${doiA(pref.doi, 'doi:' + esc(pref.doi))}) for the ` +
          `compilation and this site`) : ''}. Full list: <a href="${esc(K.link('method', 'cite'))}">How to cite</a>` +
          `</p>`) +
      `<h4>Reported by</h4><ol class="cite-list">${
refs.map(r => (`<li>${esc(r.text)}${
r.doi ? ' ' + doiA(r.doi, 'doi:' + esc(r.doi)) : ''} <span class="muted">` +
          `· ${int(r.n)} ${esc(r.n === 1 ? W.mark : W.marks)}</span></li>`)).join('')}</ol>` +
      notices.map(x => `<p class="note">${esc(x)}</p>`).join('') +
      (`<p class="screen-only"><button class="btn small" type="button" data-copy-text="${esc(text)}">Copy references</button>` +
          ` <button class="btn small" type="button" data-ris="${esc(JSON.stringify(ris))}" data-ris-name="${
esc(D.site.id + '_references_' + what.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40))}">Download ` +
          `citations (RIS)</button></p></details>`);
  }
  // a site's sources, with an RIS button and a sentence on what to cite
  function reportedBy(c) {
    if (!CT.attribute || !SPECS[CT.attribute]) return '';
    const vals = attrVals(c, CT.attribute); if (!vals.length) return '';
    const refs = vals.map(v => { const r = lookupRow(v) || {}; return [r.citation || vLabel(CT.attribute, v), r.doi || '']; });
    const pref = K.CIT?.preferred;
    return (`<button type="button" class="btn small" data-ris="${esc(JSON.stringify(refs))}" data-ris-name="${esc(`${c.gene}_${c.label}_references`)}" title="These ` +
        `references as an RIS file, for EndNote, Zotero, Mendeley or Papers">RIS</button>`) +
      `<ul class="sc-refs">${
vals.map(v => { const r = lookupRow(v); return `<li>${
r?.doi ? doiA(r.doi, esc(vLabel(CT.attribute, v))) : c.attrHtml(CT.attribute, v)}</li>`; }).join('')}</ul>` +
      (pref ? (`<p class="muted small">Cite these for ${esc(c.label)}, with ${esc(pref.short || pref.text)} for the ` +
          `compilation.</p>`) : '');
  }
  // references as an RIS file: each DOI's record from doi.org, else one from the text shown
  async function downloadRis(refs, name, btn) {
    const seen = new Set(), todo = refs.filter(([t, d]) => { const k = String(d || t).toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
    const one = async ([text, doi]) => {
      for (let k = 0; doi && k < 2; k++) {
        try { const r = await fetch('https://doi.org/' + encodeURI(doi), { headers: { Accept: 'application/x-research-info-systems' } }); if (r.ok) { const t = (await r.text()).replace(/\r\n/g, '\n').trim(); if (/^TY {2}-/.test(t)) return t; } } catch (e) { /* tried again */ }
        await new Promise(ok => setTimeout(ok, 600));
      }
      return ['TY  - ' + (doi ? 'JOUR' : 'GEN'), 'TI  - ' + text, doi ? 'DO  - ' + doi : '', doi ? 'UR  - https://doi.org/' + doi : '', 'ER  - '].filter(Boolean).join('\n');
    };
    const label = btn.textContent; btn.disabled = true; btn.textContent = `Fetching ${todo.length}…`;
    try {
      const out = new Array(todo.length); let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, todo.length) }, async () => { while (next < todo.length) { const k = next++; out[k] = await one(todo[k]); } }));
      K.download(name + '.ris', out.join('\n\n') + '\n', 'application/x-research-info-systems');
    } finally { btn.disabled = false; btn.textContent = label; }
  }

  // ---- what a light page (a protein without marks) shows of the rows naming it ---------------------------------------
  function asPartner(x, gene, siteName) {
    const out = [];
    if (has(RC.table) && x.tables?.[RC.table]) {
      const cols = TH[RC.table].columns, rs = x.tables[RC.table].map(([acc, ...r]) => ({ acc: str(x._s, acc), ...Object.fromEntries(cols.map((c, i) => [c, NUMS.has(c) ? r[i] : str(x._s, r[i])])) }))
        .filter(r => r.partner_kind !== 'self');
      if (rs.length) {
        const by = new Map();
        rs.forEach(r => { const k = r.acc + ':' + r.position + '|' + r.group; if (!by.has(k)) by.set(k, { ...r, ids: new Set(), papers: new Map() }); const g = by.get(k); if (r.id) g.ids.add(r.id); if (paperKey(r)) g.papers.set(paperKey(r), r); });
        const xs = [...by.values()].sort((a, b) => grpOrder(a.group) - grpOrder(b.group));
        out.push((`<section class="pfold-like"><h3>At other proteins’ ${esc(W.marks)}</h3><div class="tbl-card">` +
            `<table class="tbl compact stackable"><thead><tr><th>${esc(cap(W.mark))}</th><th>What the record ` +
            `shows</th><th>Evidence</th><th>Paper</th></tr></thead><tbody>`) +
          xs.slice(0, 60).map(r => (`<tr><td data-label="${esc(cap(W.mark))}"><a href="${
esc(K.link('protein', r.acc + '/' + r.position))}"><b>${esc(siteName(r.acc, r.position))}</b></a></td>` +
              `<td data-label="Shows">${esc(cap(grpLabel(r.group)))}${
r.state ? ` <span class="sp-state">${
esc((RC.states || {})[r.state] ?? r.state)}</span>` : ''}</td>`) +
            `<td data-label="Evidence">${esc(r.source || '')} ${
[...r.ids].slice(0, 3).map(id => { const u = (RC.urls || {})[r.source]; return u ? (`<a href="${
esc(u.replace('{id}', encodeURIComponent(id)))}" target="_blank" ` +
                `rel="noopener">${esc(id)}</a>`) : esc(id); }).join(', ')}${
r.ids.size > 3 ? ` +${r.ids.size - 3}` : ''}</td>` +
            `<td data-label="Paper">${
[...r.papers.values()].slice(0, 2).map(paperA).join('<br>') || '<span class="muted">–</span>'}</td></tr>`).join('') + '</tbody></table></div>' +
          (xs.length > 60 ? `<p class="muted small">The first 60 of ${int(xs.length)}.</p>` : '') + '</section>');
      }
    }
    return out.join('');
  }
  function partnersOf(x, tname) {
    if (!has(tname) || !x.tables?.[tname]) return [];
    const cols = TH[tname].columns;
    return x.tables[tname].map(([acc, ...r]) => ({ acc: str(x._s, acc), ...Object.fromEntries(cols.map((c, i) => [c, NUMS.has(c) ? r[i] : str(x._s, r[i])])) })).sort((a, b) => b.score - a.score);
  }

  // ---- events -------------------------------------------------------------------------------------------------------
  K.clicks.push(
    ['[data-ris]', el => { try { downloadRis(JSON.parse(el.dataset.ris), el.dataset.risName || 'references', el); } catch (e) { /* malformed */ } }],
    ['[data-copy-text]', el => { const done = t => { const o = el.textContent; el.textContent = t; setTimeout(() => { el.textContent = o; }, 1500); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(el.dataset.copyText).then(() => done('Copied'), () => done('Copy failed')); else done('Copy failed'); }],
    ['[data-sp-all]', el => { const rest = el.closest('details')?.querySelector('.sp-rest'); if (rest) { rest.hidden = !rest.hidden; el.textContent = rest.hidden ? el.textContent.replace(/^Show the first 8 rows$/, 'Show all rows') : 'Show the first 8 rows'; } }],
    ['[data-entry3d]', (el, e) => { if (typeof K.show3d === 'function') { e.preventDefault(); K.show3d(el.dataset.acc, +el.dataset.pos, { entry: el.dataset.entry3d }); } else window.open(el.href, '_blank', 'noopener'); }],
    ['[data-open-fold]', el => { const d = document.getElementById(el.dataset.openFold); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }],
  );
  K.card = { proteinRecords, load, loadDefault, defaultTb, compact: SDF, light, lightIndex, rows, at, has, badge, tags, entries, sequences, around, states, changes, calls, callsKey, evidenceBlock, recordsBlock, recordsTsv,
    writerBlock, evidenceRow, reportedBy, citeBox, asPartner, partnersOf, wholeProtein, aroundRows, windowsOf, callRows, num };
});
