/* Protein interactions, and Interaction evidence at a glance, on a protein's page.
     Protein interactions   the protein's STRING partners, asked live, as a network the reader can drag (mouse, touch, or the
                            arrow keys on a focused node) with Network options (confidence, number of partners, colour by
                            methylated or class, layout, physical or functional, all or marked only); the list of the same
                            partners is its table view. SVG, PNG and TSV.
     Interaction evidence    each mark against the interaction evidence at the same residue (the site's structure tables:
     at a glance             PDBe-KB interfaces, RNA and DNA bound, predicted complexes, crosslinks), solid when observed,
                            hollow when predicted. SVG and PNG.
   Partners are matched to the site's proteins by UniProt accession (STRING's ids mapped through UniProt, isoforms by their
   base accession), never by gene name. The STRING taxon is website.partners.species; the classes are
   website.search.partners.classes, read from data/partners.json. A STRING association is to the whole protein. No number
   of the site depends on any of it. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int } = K;
  const IXP = D.partners || null;
  const SD = D.structure || {}, PT = D.search?.partners || null;
  const STRING_API = 'https://string-db.org/api/json/', CALLER = 'ptmcontext';
  const CITE = 'Szklarczyk et al., Nucleic Acids Res 53:D730 (2025), doi:10.1093/nar/gkae1113';
  const CHANNELS = [['escore', 'experiments'], ['dscore', 'databases'], ['tscore', 'text mining'], ['ascore', 'co-expression'], ['nscore', 'neighbourhood'], ['fscore', 'gene fusion'], ['pscore', 'co-occurrence']];
  const CH_LETTER = 'edtanfp';                 // the channels in order; the physical network scores the first three only
  const VW = 800, VH = 520, CX = VW / 2, CY = VH / 2;
  const getJson = (url, opt) => fetch(url, opt).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  const today = () => K.hdate(new Date().toISOString());
  const r1 = v => Math.round(v * 10) / 10;
  const base = acc => String(acc || '').split('-')[0].toUpperCase();

  // ---- the site's proteins by base accession (isoforms share their canonical entry's) --------------------------------
  const BYBASE = new Map();
  D.proteins.forEach(([acc, gene, name, len, marks, cand]) => {
    const b = base(acc), p = { acc, gene, name, len, marks, cand };
    const old = BYBASE.get(b);
    if (!old || (acc === b && old.acc !== b) || (old.acc !== b && marks > old.marks)) BYBASE.set(b, p);
  });
  const siteProtein = acc => BYBASE.get(base(acc)) || null;

  // ---- the options, remembered in this browser -----------------------------------------------------------------------
  const KEY = 'ptmc-pnet:' + (D.site?.id || '');
  const OPT = { conf: Math.round((IXP?.min_score ?? 0.7) * 1000), n: 20, color: 'methyl', layout: 'force', net: IXP?.network || 'physical', only: 'all', view: 'network', ch: 'edtanfp', labels: 'all', size: 'marks', ring: false, pins: '' };
  const OPT0 = { ...OPT };
  try { Object.assign(OPT, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private window */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(OPT)); } catch (e) { /* no storage */ } };
  const CONFS = [[400, '0.4 (medium)'], [700, '0.7 (high)'], [900, '0.9 (highest)']];
  if (!CONFS.some(c => c[0] === OPT.conf)) OPT.conf = 700;

  // ---- partner classes: data/partners.json (read when the card first opens) -----------------------------------------
  let PD = null, pdLoad = null, pdIdx = null;
  const inlined = (() => { try { const el = document.getElementById('partners-data'); return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; } })();
  const loadClasses = () => (pdLoad ||= !PT ? Promise.resolve(null) : (inlined ? Promise.resolve(inlined) : fetch('data/partners.json').then(r => (r.ok ? r.json() : null)))
    .then(d => { if (d?.accessions) { PD = d; pdIdx = new Map(d.accessions.map((a, k) => [a.toUpperCase(), k])); } return PD; }, () => null));
  const CLASS_IDS = () => (PD ? PD.classes.filter(c => PT?.classes?.[c]) : []);
  const classOf = acc => { const k = pdIdx?.get(base(acc)); if (k == null) return null; const bits = PD.bits[k] || 0; return PD.classes.find((c, i) => bits & (1 << i)) || null; };
  const className = c => (PT?.classes || {})[c] || c;

  // ---- STRING, then UniProt to turn its ids into accessions ---------------------------------------------------------
  const NET = {};                               // acc:net -> { phase, rows, ver, self, acc: Map(stringId -> accession) }
  let stringVersion = null;
  const timed = (pr, ms) => Promise.race([pr, new Promise((ok, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  function mapAccessions(ids) {
    const out = new Map(), taxon = String(IXP.species), chunks = [];
    for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
    return Promise.all(chunks.map(ch => timed(getJson('https://rest.uniprot.org/uniprotkb/search?fields=accession,xref_string&size=100&format=json&query=' +
      encodeURIComponent(ch.map(id => 'xref:string-' + id).join(' OR '))), 20000).then(j => {
      (j.results || []).forEach(r => (r.uniProtKBCrossReferences || []).forEach(x => { if (x.database === 'STRING') out.set(x.id, r.primaryAccession); }));
    }))).then(() => ({ map: out, ok: true }), () => ({ map: out, ok: false })).then(r => { void taxon; return r; });
  }
  function ask(acc) {
    const key = acc + ':' + OPT.net;
    if (NET[key]) return NET[key].promise;
    const st = NET[key] = { phase: 'load', rows: [], ver: '', self: '', acc: new Map(), mapped: true };
    stringVersion ||= getJson(STRING_API + 'version').then(j => (j && j[0] && j[0].string_version) || '', () => '');
    st.promise = timed(fetch(STRING_API + 'interaction_partners', { method: 'POST',
      body: new URLSearchParams({ identifiers: acc, species: String(IXP.species), network_type: OPT.net, required_score: '400', limit: '200', caller_identity: CALLER }) })
      .then(r => (r.ok ? r.json() : r.status === 404 ? { unknown: true } : Promise.reject(new Error(String(r.status))))), 25000)
      .then(async rows => {
        if (rows.unknown) { st.phase = 'unknown'; return st; }
        const best = new Map();
        rows.forEach(e => { if (e.stringId_B !== e.stringId_A && (!best.has(e.stringId_B) || best.get(e.stringId_B).score < e.score)) best.set(e.stringId_B, e); });
        st.self = rows[0]?.stringId_A || ''; st.rows = [...best.values()].sort((x, y) => y.score - x.score || String(x.preferredName_B).localeCompare(String(y.preferredName_B)));
        st.ver = await stringVersion;
        const m = await mapAccessions(st.rows.map(e => e.stringId_B));
        st.acc = m.map; st.mapped = m.ok; st.phase = 'ok';
        return st;
      }, () => { st.phase = 'fail'; delete NET[key]; return st; });
    return st.promise;
  }
  const EDG = {};                               // the links among the shown partners
  function askEdges(key, ids) {
    const k = key + ':' + ids.join(',');
    return (EDG[k] ||= timed(fetch(STRING_API + 'network', { method: 'POST',
      body: new URLSearchParams({ identifiers: ids.join('\r'), species: String(IXP.species), network_type: OPT.net, required_score: String(OPT.conf), caller_identity: CALLER }) })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))), 20000).catch(() => null));
  }

  // STRING's combined score from the channels left on: the prior (0.041) is taken off each channel score, the rest combined, and the prior added back once (STRING FAQ)
  const chOn = () => { const on = OPT.ch.split('').filter(c => CH_LETTER.includes(c)); return OPT.net === 'physical' ? on.filter(c => 'edt'.includes(c)) : on; };
  const allCh = () => chOn().length === (OPT.net === 'physical' ? 3 : 7);
  function rescore(row) {
    if (allCh()) return +row.score;
    const prior = 0.041, on = chOn(); let rest = 1;
    CHANNELS.forEach(([f], k) => { if (on.includes(CH_LETTER[k])) rest *= 1 - Math.max(0, ((+row[f] || 0) - prior) / (1 - prior)); });
    const tot = 1 - rest; return tot + prior * (1 - tot);
  }
  const pinList = () => OPT.pins.split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean);

  // ---- the nodes and links the options select -----------------------------------------------------------------------
  const LAY = {};                               // acc:options -> { nodes, edges } (positions survive a redraw of the page)
  const rowOf = (e, sc) => { const acc = ACCS(e.stringId_B), p = acc ? siteProtein(acc) : null; return { e, sc, acc, p, marks: p ? p.marks : 0, cls: acc ? classOf(acc) : null }; };
  let ACCS = () => '';
  const shownRows = st => { ACCS = id => st.acc.get(id) || ''; return st.rows.map(e => rowOf(e, rescore(e))).filter(x => x.sc * 1000 >= OPT.conf).sort((a, b) => b.sc - a.sc || String(a.e.preferredName_B).localeCompare(String(b.e.preferredName_B))); };
  function nodesFor(acc, self, st) {
    let rows = shownRows(st);
    if (OPT.only === 'marked') rows = rows.filter(x => x.marks > 0);
    const all = rows.length;
    const top = rows.slice(0, OPT.n), have = new Set(top.map(x => x.e.stringId_B)), pins = pinList();
    const pinned = pins.length ? st.rows.map(e => rowOf(e, rescore(e))).filter(x => !have.has(x.e.stringId_B) && pins.includes(String(x.e.preferredName_B).toUpperCase())) : [];
    rows = top.concat(pinned);
    const rad = x => (OPT.size === 'equal' ? 8 : 6 + 2.2 * Math.sqrt(Math.min(x.marks, 30)));
    const nodes = [{ id: st.self, name: self.gene || self.acc, acc: self.acc, p: self, marks: self.marks || 0, cls: null, score: 1, self: true, r: 17 }]
      .concat(rows.map(x => ({ id: x.e.stringId_B, name: x.e.preferredName_B, acc: x.acc, p: x.p, marks: x.marks, cls: x.cls, score: x.sc, ev: x.e, self: false, pinned: pinned.includes(x), r: rad(x) })));
    return { nodes, total: all, shown: rows.length, missing: pins.filter(g => !st.rows.some(e => String(e.preferredName_B).toUpperCase() === g)) };
  }
  function layoutKey(acc, st) { return [acc, OPT.net, OPT.conf, OPT.n, OPT.only, OPT.layout, st.rows.length, chOn().join(''), OPT.size, OPT.pins, OPT.ring].join('|'); }
  function build(acc, self, st) {
    const key = layoutKey(acc, st);
    if (LAY[key]) return LAY[key];
    const { nodes, total, shown, missing } = nodesFor(acc, self, st);
    const L = LAY[key] = { key, nodes, total, shown, missing, edges: [], pending: null, edgesOk: null, ringP: null, zv: null };
    nodes.forEach((nd, i) => { nd.i = i; });
    L.edges = nodes.slice(1).map(nd => ({ a: 0, b: nd.i, s: nd.score }));
    place(L);
    return L;
  }
  function place(L) {                           // starting positions by layout; the force layout then relaxes
    const ps = L.nodes.slice(1), n = ps.length;
    L.nodes[0].x = CX; L.nodes[0].y = CY;
    ps.forEach((nd, k) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, n);
      let rad = 190;
      if (OPT.layout === 'rings') rad = 80 + (1 - nd.score) * 560; else if (OPT.layout === 'circle') rad = 205;
      rad = Math.min(rad, 215);
      nd.x = CX + Math.cos(ang) * rad * 1.25; nd.y = CY + Math.sin(ang) * rad * 1.0; nd.vx = nd.vy = 0; nd.fixed = false;
    });
    L.nodes[0].vx = L.nodes[0].vy = 0;
    if (OPT.layout === 'force') relax(L, 260, 1);
  }
  function relax(L, iters, alpha0) {
    const N = L.nodes, E = L.edges;
    for (let it = 0; it < iters; it++) {
      const a = alpha0 * (1 - it / iters);
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
        let dx = N[j].x - N[i].x, dy = N[j].y - N[i].y, d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (i % 3) - 1 + 0.5; dy = (j % 3) - 1 + 0.5; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2), f = Math.min(40, (9000 + 160 * (N[i].r + N[j].r)) / d2) * a, fx = dx / d * f, fy = dy / d * f;
        N[i].vx -= fx; N[i].vy -= fy; N[j].vx += fx; N[j].vy += fy;
      }
      E.forEach(e => {
        const A = N[e.a], B = N[e.b], dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = e.a === 0 ? 270 - 110 * e.s : 170 - 40 * e.s, f = (d - rest) * (e.a === 0 ? 0.03 : 0.004) * a, fx = dx / d * f, fy = dy / d * f;
        A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
      });
      N.forEach(nd => {
        nd.vx += (CX - nd.x) * 0.003 * a; nd.vy += (CY - nd.y) * 0.005 * a;
        if (nd.fixed || nd.i === 0 && !nd.moved) { nd.vx = nd.vy = 0; return; }
        nd.vx *= 0.62; nd.vy *= 0.62;
        nd.x = Math.max(nd.r + 10, Math.min(VW - nd.r - 10, nd.x + nd.vx)); nd.y = Math.max(nd.r + 14, Math.min(VH - nd.r - 18, nd.y + nd.vy));
      });
    }
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------
  const EXPORT = { me: '#c2410c', no: '#eef5f7', self: '#111827', edge: '#8a979e', ink: '#111827', muted: '#5f6f78', stroke: '#374151', surface: '#ffffff', halo: '#ffffff',
    cls: ['#0072B2', '#56B4E9', '#D55E00', '#E69F00', '#009E73', '#CC79A7', '#7B5EA7', '#6b7780'] };
  function cssAccent() { try { return getComputedStyle(document.documentElement).getPropertyValue('--accent-l').trim() || EXPORT.me; } catch (e) { return EXPORT.me; } }
  const classSlot = c => { const ids = CLASS_IDS(); const k = ids.indexOf(c); return k < 0 ? 7 : Math.min(k, 6); };
  function nodeLook(nd, ex) {                   // class for the page, attributes for a figure on white
    const mode = OPT.color === 'class' && CLASS_IDS().length ? 'class' : OPT.color === 'none' ? 'none' : 'methyl';
    let role;
    if (nd.self) role = 'self'; else if (mode === 'class') role = nd.cls ? 'c' + classSlot(nd.cls) : 'no'; else if (mode === 'methyl') role = nd.marks > 0 ? 'me' : 'no'; else role = 'no';
    if (!ex) return `class="pn-fill pn-${role}"`;
    const fill = role === 'self' ? EXPORT.self : role === 'me' ? cssAccent() : role === 'no' ? EXPORT.no : EXPORT.cls[+role.slice(1)];
    return `fill="${fill}" stroke="${EXPORT.stroke}" stroke-width="${role === 'no' ? 1.2 : 1}"`;
  }
  const tipOf = (nd, st) => {
    if (nd.self) return `<b>${esc(nd.name)}</b> ${esc(nd.acc)}<br>The protein this page is about`;
    if (nd.ring) return `<b>${esc(nd.name)}</b> ${esc(nd.acc || 'no accession')}<br>Second ring: STRING ${esc(OPT.net)} score ${nd.score.toFixed(3)} to ${esc(nd.via)}<br>${nd.p ? `${int(nd.marks)} ${esc(nd.marks === 1 ? W.mark : W.marks)} in this site` : ''}${nd.cls ? (nd.p ? '<br>' : '') + esc(className(nd.cls)) : ''}`;
    const ev = CHANNELS.filter(([f]) => +nd.ev[f] > 0).sort(([a], [b]) => nd.ev[b] - nd.ev[a]).map(([f, n]) => `${n} ${(+nd.ev[f]).toFixed(2)}`).join(', ');
    return `<b>${esc(nd.name)}</b> ${esc(nd.acc || 'no accession')}<br>STRING ${esc(OPT.net)} score ${nd.score.toFixed(3)}${ev ? ` (${esc(ev)})` : ''}<br>` +
      (nd.p ? `${int(nd.marks)} ${esc(nd.marks === 1 ? W.mark : W.marks)} in this site${nd.p.gene && nd.cls ? '' : ''}` : `No ${esc(W.mark)} in this site`) + (nd.cls ? `<br>${esc(className(nd.cls))}` : '') +
      (nd.p ? '<br>Click to open its page; drag to move it' : '<br>Drag to move it');
  };
  function svgOf(L, ex) {
    const N = L.nodes;
    const lines = L.edges.map((e, k) => `<line data-e="${k}" ${ex ? `stroke="${EXPORT.edge}" stroke-opacity="${r1(0.25 + 0.6 * e.s)}"` : `class="pn-edge${e.a === 0 ? '' : ' pn-edge2'}" style="stroke-opacity:${r1(e.a === 0 ? 0.3 + 0.6 * e.s : 0.1 + 0.3 * e.s)}"`} stroke-width="${r1(0.6 + 2.6 * e.s)}" x1="${r1(N[e.a].x)}" y1="${r1(N[e.a].y)}" x2="${r1(N[e.b].x)}" y2="${r1(N[e.b].y)}"/>`).join('');
    const nodes = N.map(nd => {
      const showLab = OPT.labels === 'all' || nd.self || nd.pinned || (OPT.labels === 'methyl' && (nd.marks > 0 || nd.ring));
      const lab = !showLab ? '' : `<text data-nl="${nd.i}" ${ex ? `font-size="11" fill="${EXPORT.ink}" stroke="${EXPORT.halo}" stroke-width="3" paint-order="stroke"` : 'class="pn-lbl"'} x="${r1(nd.x)}" y="${r1(nd.y + nd.r + 12)}" text-anchor="middle">${esc(nd.name)}</text>`;
      const circle = `<circle data-nc="${nd.i}"${ex ? '' : ` data-pn-tip="${esc(tipOf(nd))}"`} r="${r1(nd.r)}" cx="${r1(nd.x)}" cy="${r1(nd.y)}" ${nodeLook(nd, ex)}/>`;
      if (ex) return circle + lab;
      const attrs = `class="pn-n${nd.p && !nd.self ? ' pn-link' : ''}" data-ni="${nd.i}" aria-label="${esc(nd.name)}: ${nd.self ? 'this protein' : `STRING score ${nd.score.toFixed(2)}, ${nd.marks} ${W.marks} here`}. Arrow keys move it."`;
      return nd.p && !nd.self ? `<a href="${esc(K.link('protein', nd.p.acc))}" ${attrs} draggable="false">${circle}${lab}</a>` : `<g ${attrs} tabindex="0" role="img">${circle}${lab}</g>`;
    }).join('');
    return { lines, nodes };
  }
  function legendItems(L, ex) {
    const mode = OPT.color === 'class' && CLASS_IDS().length ? 'class' : OPT.color === 'none' ? 'none' : 'methyl', out = [];
    const sw = (look, text) => ({ look, text });
    if (mode === 'methyl') out.push(sw(['me'], `has ${W.marks} in this site (larger: more)`), sw(['no'], `no ${W.mark} in this site`));
    else if (mode === 'class') { const present = new Set(L.nodes.map(n => n.cls).filter(Boolean)); CLASS_IDS().filter(c => present.has(c)).forEach(c => out.push(sw(['c' + classSlot(c)], className(c)))); out.push(sw(['no'], 'in no class')); }
    out.push(sw(['self'], 'this protein'));
    return out;
  }
  const legendHtml = L => legendItems(L).map(i => `<span class="pn-key"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" class="pn-fill pn-${i.look[0]}"/></svg>${esc(i.text)}</span>`).join('') +
    '<span class="pn-key pn-key-line">line width: STRING score</span>';

  // ---- one protein's card -------------------------------------------------------------------------------------------
  let CUR = null;                               // { acc, self, st, L } of the card on the page
  const box = () => document.getElementById('pn-box');
  const msg = t => { const b = box(); if (b) b.innerHTML = `<p class="muted pn-msg">${t}</p>`; const lg = document.getElementById('pn-legend'); if (lg) lg.innerHTML = ''; };
  const optionsHtml = () => {
    const sel = (id, label, opts, v) => `<label class="pn-opt" for="pn-${id}"><span>${esc(label)}</span><select id="pn-${id}">${opts.map(([val, t]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const colors = [['methyl', `Has ${W.marks} here or not`], ...(PT ? [['class', 'Partner class']] : []), ['none', 'No colour']];
    return `<div class="pn-opts" role="group" aria-label="Network options"><span class="pn-opts-h">Network options</span>` +
      sel('conf', 'STRING confidence', CONFS, OPT.conf) + sel('n', 'Partners', [[10, '10'], [20, '20'], [30, '30'], [50, '50']], OPT.n) +
      sel('only', 'Show', [['all', 'All partners'], ['marked', `Only with ${W.marks} here`]], OPT.only) + sel('color', 'Colour by', colors, OPT.color) +
      sel('layout', 'Layout', [['force', 'Force-directed'], ['circle', 'Circle'], ['rings', 'Rings by score']], OPT.layout) + sel('net', 'Network', [['physical', 'Physical'], ['functional', 'Functional']], OPT.net) +
      `<span class="seg" role="group" aria-label="View"><button type="button" data-pn-view="network" aria-pressed="${OPT.view === 'network'}">Network</button><button type="button" data-pn-view="table" aria-pressed="${OPT.view === 'table'}">Table</button></span>` +
      `<button type="button" class="linkish" data-pn-reset title="Put the nodes back where the layout puts them">Reset layout</button></div>` + moreOptionsHtml();
  };
  const moreOptionsHtml = () => {
    const sel = (id, label, opts, v) => `<label class="pn-opt" for="pn-${id}"><span>${esc(label)}</span><select id="pn-${id}">${opts.map(([val, t]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const phys = OPT.net === 'physical';
    const chs = CHANNELS.map(([, n], k) => { const c = CH_LETTER[k], off = phys && !'edt'.includes(c); return `<label class="pn-chk${off ? ' muted' : ''}"${off ? ' title="The physical network uses experiments, databases and text mining only"' : ''}><input type="checkbox" data-pn-ch="${c}"${OPT.ch.includes(c) ? ' checked' : ''}${off ? ' disabled' : ''}> ${esc(n)}</label>`; }).join('');
    return `<div class="pn-opts pn-opts2" role="group" aria-label="More network options"><span class="pn-opts-h" title="Unticking a channel rescores every link from the rest, as STRING combines them">Evidence channels</span>${chs}</div>` +
      `<div class="pn-opts pn-opts2" role="group" aria-label="Labels, size and extra nodes">` +
      sel('labels', 'Labels', [['all', 'Every node'], ['methyl', `Nodes with ${W.marks} and the second ring`], ['none', 'This protein only']], OPT.labels) +
      sel('size', 'Node size', [['marks', `By ${W.mark} count`], ['equal', 'All the same']], OPT.size) +
      `<label class="pn-chk" title="Add the proteins that STRING links to these partners and that have ${esc(W.marks)} here${PT ? ' or are in a partner class' : ''}, to trace paths through the partners"><input type="checkbox" id="pn-ring"${OPT.ring ? ' checked' : ''}> Second ring of partners’ partners</label>` +
      `<label class="pn-opt" for="pn-pins"><span>Always include</span><input type="text" id="pn-pins" size="22" placeholder="Gene symbols, e.g. PRMT5, SMN1" value="${esc(OPT.pins)}"></label>` +
      `<button type="button" class="linkish" data-pn-optreset>Reset network options</button>` +
      `<button type="button" class="btn quiet small" id="pn-string" data-pn-string title="Open this network on string-db.org with the same settings">Open in STRING ↗</button>` +
      `<span class="pn-zoom" role="group" aria-label="Zoom the network"><button type="button" class="btn quiet small" data-pn-zoom="in" aria-label="Zoom in">+</button><button type="button" class="btn quiet small" data-pn-zoom="out" aria-label="Zoom out">−</button><button type="button" class="btn quiet small" data-pn-zoom="fit" title="Show the whole network (double-click the background)">Reset zoom</button></span></div>` +
      `<p class="muted small pn-zhelp">Zoom with the buttons or Ctrl and the wheel; drag the background to pan.</p>`;
  };
  function ixFold(p, rec, fold) {
    if (!IXP) return '';
    const g = p.gene || p.acc;
    return fold('p-ix', 'Protein interactions', 'STRING, live; drag the nodes', `<div class="card-head"><p class="sub">The proteins STRING associates with ${esc(g)}, drawn as a network you can drag, coloured by whether they have ${esc(W.marks)} in this dataset. Matched by accession. The Table view lists the same partners and is the keyboard route.</p>` +
      `${K.expBar(['svg', 'png', 'tsv'], 'pnexp', 'the network')}</div>${optionsHtml()}<div class="pn-box" id="pn-box" data-acc="${esc(p.acc)}"><p class="muted pn-msg">Asking STRING…</p></div>` +
      `<div class="pn-legend" id="pn-legend"></div><p class="src pn-src" id="pn-src"></p>` + ifaceHtml(p, rec), true);
  }
  // ---- who binds the marks: the site's structure tables (contacts and predicted, per mark) ---------------------------------
  const rcsb = id => `<a href="https://www.rcsb.org/structure/${encodeURIComponent(String(id).toUpperCase())}" target="_blank" rel="noopener">${esc(String(id).toUpperCase())}</a>`;
  const partnerName = (g, a) => { const sp = a ? siteProtein(a) : null; return sp ? `<a href="${esc(K.link('protein', sp.acc))}"><b>${esc(g || sp.gene)}</b></a>` : `<b>${esc(g || a || 'a partner')}</b>`; };
  const siteBtn = (acc, pos) => `<button type="button" class="linkish mono" data-cc-pos="${pos}" data-cc-acc="${esc(acc)}">${esc(K.prot ? K.prot.siteLabel(acc, pos) : pos)}</button>`;
  function ifaceHtml(p, rec) {
    const s3 = rec?.s3d; if (!s3 || !(SD.contacts || SD.predicted)) return '';
    const obs = (s3.c || []).filter(r => r[1] === 'protein' || r[1] === 'self'), pred = s3.p || [], M = W.marks, m1 = W.mark;
    if (!obs.length && !pred.length) return `<div class="pn-iface"><h4>Proteins at ${esc(m1)} interfaces</h4><p class="muted">No protein at an interface with a ${esc(m1)} of ${esc(p.gene || p.acc)} in the structure tables.</p></div>`;
    const by = new Map();      // partner -> { name, acc, sites: Map(pos -> { obs: ids, pred: score }) }
    const put = (g, a, pos, f) => { const k = a || g; if (!k) return; const o = by.get(k) || { g, a, sites: new Map() }; const s = o.sites.get(pos) || {}; f(s); o.sites.set(pos, s); by.set(k, o); };
    obs.forEach(([pos, kind, ids, g, a]) => put(kind === 'self' ? '' : g, kind === 'self' ? p.acc : a, pos, s => { s.obs = ids || []; if (kind === 'self') s.self = true; }));
    pred.forEach(([pos, g, a, , , sc]) => put(g, a, pos, s => { s.pred = sc; }));
    const parts = [...by.values()].sort((x, y) => y.sites.size - x.sites.size);
    const who = parts.map(o => `<li>${o.self ? '<b>another copy of this protein</b>' : partnerName(o.g, o.a)} <span class="muted small">at</span> ${[...o.sites.entries()].sort((x, y) => x[0] - y[0]).map(([pos, s]) => siteBtn(p.acc, pos) + (s.obs ? '' : ' <span class="muted small">(predicted)</span>')).join(' ')}</li>`).join('');
    const obsLines = [...new Map(obs.map(r => [r[0], r])).keys()].sort((a, b) => a - b).map(pos => `<li>${siteBtn(p.acc, pos)} contacts ` + obs.filter(r => r[0] === pos).map(r => `${r[1] === 'self' ? '<b>another copy</b>' : partnerName(r[3], r[4])} <span class="muted small">(${(r[2] || []).slice(0, 4).map(rcsb).join(', ')}${(r[2] || []).length > 4 ? ` +${r[2].length - 4}` : ''})</span>`).join('; ') + '</li>').join('');
    const predLines = [...new Set(pred.map(r => r[0]))].sort((a, b) => a - b).map(pos => `<li>${siteBtn(p.acc, pos)} ` + pred.filter(r => r[0] === pos).slice(0, 6).map(r => `${partnerName(r[1], r[2])}${r[5] != null ? ` <span class="muted small">pDockQ ${(+r[5]).toFixed(2)}</span>` : ''}`).join(', ') + (pred.filter(r => r[0] === pos).length > 6 ? ' +' + (pred.filter(r => r[0] === pos).length - 6) : '') + '</li>').join('');
    return `<div class="pn-iface"><h4>Proteins at ${esc(m1)} interfaces</h4><ul class="pn-ilist">${who}</ul>` +
      `<p class="note">Proteins in contact with a ${esc(m1)} in a PDB structure, or at the interface of a predicted complex. Associations of the whole protein are in the network above.</p>` +
      `<div class="pn-igrid"><section><h4>${esc(cap0(M))} at protein interfaces</h4>${obsLines ? `<ul class="pn-ilist">${obsLines}</ul>` : `<p class="muted">None is at a protein interface in a PDB structure.</p>`}</section>` +
      `<section><h4>Predicted protein interfaces</h4>${predLines ? `<ul class="pn-ilist">${predLines}</ul>` : `<p class="muted">None is at a predicted interface.</p>`}</section></div></div>`;
  }
  function mount() {
    const b = box(); if (!b) { CUR = null; return; }
    const acc = b.dataset.acc, self = siteProtein(acc) || { acc, gene: acc, marks: 0 };
    if (CUR && CUR.acc === acc && CUR.st?.phase === 'ok') { paint(); return; }
    CUR = { acc, self: { ...self, acc }, st: null, L: null };
    Promise.all([ask(acc), loadClasses()]).then(([st]) => {
      if (!box() || box().dataset.acc !== acc || CUR.acc !== acc) return;
      CUR.st = st;
      if (st.phase === 'ok') paint(); else if (st.phase === 'unknown') msg(`STRING has no entry for ${esc(acc)} (taxon ${esc(IXP.species)}).`); else msg('STRING did not answer. Nothing on this page depends on it.');
    });
  }
  const vb = L => { const z = L.zv || [0, 0, VW, VH]; return z.map(r1).join(' '); };
  function paint() {
    const c = CUR; if (!c || !c.st || c.st.phase !== 'ok' || !box()) return;
    const st = c.st;
    c.L = build(c.acc, c.self, st);
    const L = c.L, src = document.getElementById('pn-src'), g = c.self.gene || c.acc;
    if (src) src.textContent = `STRING${st.ver ? ' v' + st.ver : ''} ${OPT.net} network, score ${(OPT.conf / 1000).toFixed(1)} or more (${CITE}), retrieved ${today()}. Partners are matched to this dataset’s proteins by UniProt accession` +
      `${st.mapped ? '' : ' (UniProt did not answer, so none could be matched)'}, isoforms by their canonical accession. An association is to the whole protein and does not show that a partner binds or modifies a ${W.mark}.` +
      `${allCh() ? '' : ` Scored on ${CHANNELS.filter((_, k) => chOn().includes(CH_LETTER[k])).map(c => c[1]).join(', ')} only.`}${L.missing?.length ? ` Not among STRING’s partners of ${g}: ${L.missing.join(', ')}.` : ''}`;
    if (L.nodes.length < 2) { msg(st.rows.length ? `No ${OPT.only === 'marked' ? `partner with ${esc(W.marks)} here` : 'partner'} at STRING score ${(OPT.conf / 1000).toFixed(1)} or more.` : `STRING lists no ${esc(OPT.net)} partner for ${esc(g)}.`); return; }
    if (OPT.view === 'table') { box().classList.add('pn-tablebox'); box().innerHTML = tableHtml(L); document.getElementById('pn-legend').innerHTML = ''; return; }
    box().classList.remove('pn-tablebox');
    const s = svgOf(L);
    box().innerHTML = `<svg class="pn-svg" viewBox="${vb(L)}" role="group" aria-label="STRING partners of ${esc(g)}: ${L.shown} shown. Nodes can be dragged or moved with the arrow keys; the Table view lists them."><g class="pn-edges">${s.lines}</g><g class="pn-nodes">${s.nodes}</g></svg>` +
      `<p class="pn-count">${int(L.shown)} of ${int(L.total)} partner${L.total === 1 ? '' : 's'}</p>`;
    document.getElementById('pn-legend').innerHTML = legendHtml(L);
    if (OPT.ring && !L.ringP) L.ringP = askRing(L, c).then(added => { if (added && CUR?.L === L && box() && OPT.view === 'network') paint(); });
    if (L.edgesOk == null && !L.pending) {
      const ids = L.nodes.map(n => n.id);
      L.pending = askEdges(c.acc + ':' + OPT.net + ':' + OPT.conf, ids).then(rows => {
        L.edgesOk = !!rows;
        if (rows) {
          const at = new Map(L.nodes.map(n => [n.id, n.i])), seen = new Set(L.edges.map(e => e.a + '-' + e.b));
          rows.forEach(e => { const a = at.get(e.stringId_A), b = at.get(e.stringId_B); if (a > 0 && b > 0 && a !== b && rescore(e) * 1000 >= OPT.conf) { const k = Math.min(a, b) + '-' + Math.max(a, b); if (!seen.has(k)) { seen.add(k); L.edges.push({ a: Math.min(a, b), b: Math.max(a, b), s: rescore(e) }); } } });
          if (OPT.layout === 'force') relax(L, 120, 0.5);
        }
        if (CUR?.L === L && box() && OPT.view === 'network') paint();
      });
    }
  }
  // the second ring: partners of the shown partners that have marks here or are in a partner class (live, at the confidence asked)
  function askRing(L, c) {
    const first = L.nodes.filter(n => !n.self).slice(0, 25), at = new Map(first.map(n => [n.id, n]));
    if (!first.length) return Promise.resolve(false);
    return timed(fetch(STRING_API + 'interaction_partners', { method: 'POST', body: new URLSearchParams({ identifiers: first.map(n => n.id).join('\r'), species: String(IXP.species), network_type: OPT.net, required_score: String(OPT.conf), limit: '40', caller_identity: CALLER }) })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))), 25000).then(async rows => {
      const have = new Set(L.nodes.map(n => n.id)), best = new Map();
      rows.forEach(e => { const sc = rescore(e); if (!have.has(e.stringId_B) && at.has(e.stringId_A) && sc * 1000 >= OPT.conf && (!best.has(e.stringId_B) || best.get(e.stringId_B).sc < sc)) best.set(e.stringId_B, { e, sc }); });
      const cand = [...best.values()].sort((a, b) => b.sc - a.sc).slice(0, 120), m = await mapAccessions(cand.map(x => x.e.stringId_B));
      const keep = cand.map(x => { const acc = m.map.get(x.e.stringId_B) || '', p = acc ? siteProtein(acc) : null; return { ...x, acc, p, marks: p ? p.marks : 0, cls: acc ? classOf(acc) : null }; })
        .filter(x => x.marks > 0 || x.cls).slice(0, 15);
      if (L.key !== c.L?.key || !keep.length) return false;
      keep.forEach(x => {
        const via = at.get(x.e.stringId_A), nd = { id: x.e.stringId_B, name: x.e.preferredName_B, acc: x.acc, p: x.p, marks: x.marks, cls: x.cls, score: x.sc, ev: x.e, self: false, ring: true, via: via.name,
          r: OPT.size === 'equal' ? 8 : 6 + 2.2 * Math.sqrt(Math.min(x.marks, 30)), i: L.nodes.length, x: via.x + 30, y: via.y + 30, vx: 0, vy: 0 };
        L.nodes.push(nd); L.edges.push({ a: via.i, b: nd.i, s: x.sc });
      });
      if (OPT.layout === 'force') relax(L, 160, 0.6);
      return true;
    }).catch(() => false);
  }
  const evText = e => CHANNELS.filter(([f]) => +e[f] > 0).sort(([a], [b]) => e[b] - e[a]).map(([f, n]) => `${n} ${(+e[f]).toFixed(2)}`).join(', ');
  function tableRows(st) { let rows = shownRows(st); if (OPT.only === 'marked') rows = rows.filter(x => x.marks > 0); return rows; }
  function tableHtml() {
    const rows = tableRows(CUR.st), gene = CUR.self.gene || CUR.acc;
    return `<div class="tbl-card"><table class="tbl"><caption class="pn-sr">STRING partners of ${esc(gene)}</caption><thead><tr><th>Partner</th><th>UniProt</th><th class="num">Score</th><th>Evidence</th>${PD ? '<th>Class</th>' : ''}<th class="num">${esc(cap0(W.marks))} here</th></tr></thead><tbody>` +
      rows.map(x => `<tr><td>${x.p ? `<a href="${esc(K.link('protein', x.p.acc))}"><b>${esc(x.e.preferredName_B)}</b></a>` : `<span title="${esc(x.e.stringId_B)}">${esc(x.e.preferredName_B)}</span>`}</td><td class="mono">${esc(x.acc || '–')}</td>` +
        `<td class="num">${x.sc.toFixed(3)}</td><td class="wrapok">${esc(evText(x.e))}</td>${PD ? `<td>${x.cls ? esc(className(x.cls)) : '–'}</td>` : ''}<td class="num">${x.p ? int(x.marks) : '–'}</td></tr>`).join('') +
      `</tbody></table></div>${rows.length ? '' : '<p class="muted">No partner at this confidence.</p>'}`;
  }
  function tsv() {
    const c = CUR, gene = c.self.gene || c.acc;
    return K.preamble(`STRING partners of ${gene} (${c.acc})`, `the proteins STRING associates with ${gene}: ${OPT.net} network, score ${(OPT.conf / 1000).toFixed(1)} or more${c.st.ver ? ', v' + c.st.ver : ''}, retrieved live on ${today()} (${CITE}; licence CC BY 4.0). ` +
      `Partners are matched to this dataset’s proteins by UniProt accession (isoforms by canonical accession); ${W.marks}_here counts their ${W.marks} in this site. A STRING association is to the whole protein.`) +
      ['partner', 'partner_string_id', 'partner_accession', 'accession_here', 'score', ...CHANNELS.map(([, n]) => n.replace(/\W+/g, '_')), 'class', `${W.marks.replace(/\W+/g, '_')}_here`].join('\t') + '\n' +
      tableRows(c.st).map(x => [x.e.preferredName_B, x.e.stringId_B, x.acc, x.p?.acc || '', x.sc.toFixed(3), ...CHANNELS.map(([f]) => x.e[f] ?? ''), x.cls ? className(x.cls) : '', x.marks].join('\t')).join('\n') + '\n';
  }
  function figure() {
    const L = CUR.L, g = CUR.self.gene || CUR.acc, s = svgOf(L, true), items = legendItems(L, true);
    const legend = items.map(i => { const fill = i.look[0] === 'self' ? EXPORT.self : i.look[0] === 'me' ? cssAccent() : i.look[0] === 'no' ? EXPORT.no : EXPORT.cls[+i.look[0].slice(1)]; return [fill, EXPORT.stroke, i.text]; });
    const body = `<rect width="${VW}" height="${VH}" fill="#ffffff" stroke="#e3e8ea"/>${s.lines}${s.nodes}`;
    return K.figureFrame({ title: `${g}: STRING ${OPT.net} partners`, sub: `${CUR.acc} · score ${(OPT.conf / 1000).toFixed(1)} or more · ${L.shown} of ${L.total} partners`, legend, body, bodyH: VH, W: VW,
      note: `Line width: STRING score. Larger nodes have more ${W.marks} in this site. STRING${CUR.st.ver ? ' v' + CUR.st.ver : ''} (${CITE}), retrieved ${today()}. An association is to the whole protein.`,
      extra: { string_taxon: IXP.species, network: OPT.net, min_score: OPT.conf / 1000 } });
  }

  // ---- dragging: mouse, touch and pen through pointer events; the arrow keys move a focused node -------------------
  let drag = null, raf = 0, skipClick = false;
  const svgPoint = (svg, e) => { const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; };
  const moveEls = (L) => {
    const svg = document.querySelector('.pn-svg'); if (!svg) return;
    L.nodes.forEach(nd => {
      const c = svg.querySelector(`[data-nc="${nd.i}"]`), t = svg.querySelector(`[data-nl="${nd.i}"]`);
      if (c) { c.setAttribute('cx', r1(nd.x)); c.setAttribute('cy', r1(nd.y)); }
      if (t) { t.setAttribute('x', r1(nd.x)); t.setAttribute('y', r1(nd.y + nd.r + 12)); }
    });
    L.edges.forEach((e, k) => { const l = svg.querySelector(`[data-e="${k}"]`); if (l) { l.setAttribute('x1', r1(L.nodes[e.a].x)); l.setAttribute('y1', r1(L.nodes[e.a].y)); l.setAttribute('x2', r1(L.nodes[e.b].x)); l.setAttribute('y2', r1(L.nodes[e.b].y)); } });
  };
  function settle() {
    if (raf) return;
    let n = 0;
    const step = () => { raf = 0; const L = CUR?.L; if (!L || !document.querySelector('.pn-svg')) return; if (OPT.layout === 'force') relax(L, 1, 0.5); moveEls(L); if (++n < 40 && (drag || OPT.layout === 'force')) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  const clampNode = nd => { nd.x = Math.max(nd.r + 6, Math.min(VW - nd.r - 6, nd.x)); nd.y = Math.max(nd.r + 6, Math.min(VH - nd.r - 14, nd.y)); };
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest?.('.pn-n'); if (!g || !CUR?.L || e.button > 0) return;
    const svg = g.closest('svg'), i = +g.dataset.ni, nd = CUR.L.nodes[i], pt = svgPoint(svg, e);
    drag = { nd, svg, dx: nd.x - pt.x, dy: nd.y - pt.y, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
    try { g.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.moved = true; e.preventDefault();
    const pt = svgPoint(drag.svg, e), nd = drag.nd;
    nd.x = pt.x + drag.dx; nd.y = pt.y + drag.dy; clampNode(nd); nd.fixed = true; nd.moved = true; nd.vx = nd.vy = 0;
    moveEls(CUR.L); settle();
  });
  const endDrag = e => { if (!drag || e.pointerId !== drag.id) return; if (drag.moved) skipClick = true; drag = null; setTimeout(() => { skipClick = false; }, 60); };
  document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);
  document.addEventListener('click', e => { if (skipClick && e.target.closest?.('.pn-n')) { e.preventDefault(); e.stopPropagation(); skipClick = false; } }, true);
  document.addEventListener('dragstart', e => { if (e.target.closest?.('.pn-n')) e.preventDefault(); });
  document.addEventListener('keydown', e => {
    const g = e.target.closest?.('.pn-n'); if (!g || !CUR?.L) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
    e.preventDefault();
    const nd = CUR.L.nodes[+g.dataset.ni], step = e.shiftKey ? 40 : 10;
    nd.x += d[0] * step; nd.y += d[1] * step; clampNode(nd); nd.fixed = true; nd.moved = true; moveEls(CUR.L); settle();
  });

  // ---- the options -----------------------------------------------------------------------------------------------------
  document.addEventListener('change', e => {
    const id = e.target.id || ''; if (!id.startsWith('pn-') || !box()) return;
    const k = id.slice(3); if (!(k in OPT) || k === 'view' || k === 'ch') return;
    OPT[k] = ['conf', 'n'].includes(k) ? +e.target.value : k === 'ring' ? e.target.checked : k === 'pins' ? e.target.value.replace(/[^\w\s,;.-]/g, '').trim() : e.target.value; save();
    if (k === 'net') { document.querySelectorAll('.pn-opts2,.pn-zhelp').forEach(n => n.remove()); document.querySelector('.pn-opts')?.insertAdjacentHTML('afterend', moreOptionsHtml()); CUR = null; document.getElementById('pn-box') && msg('Asking STRING…'); mount(); } else paint();
  });
  // zoom and pan are the svg's viewBox, kept per layout; nodes keep their places
  function zoomBy(how, cx, cy, k) {
    const L = CUR?.L, svg = document.querySelector('.pn-svg'); if (!L || !svg) return;
    if (how === 'fit') L.zv = null;
    else {
      const [x, y, w, h] = L.zv || [0, 0, VW, VH], f = how === 'in' ? 1 / (k || 1.4) : (k || 1.4), nw = Math.min(VW, Math.max(VW / 8, w * f)), nh = nw * VH / VW;
      const px = cx == null ? x + w / 2 : cx, py = cy == null ? y + h / 2 : cy;
      const nx = Math.max(0, Math.min(VW - nw, px - (px - x) * nw / w)), ny = Math.max(0, Math.min(VH - nh, py - (py - y) * nh / h));
      L.zv = nw >= VW ? null : [nx, ny, nw, nh];
    }
    svg.setAttribute('viewBox', vb(L));
  }
  document.addEventListener('wheel', e => {
    const svg = e.target.closest?.('.pn-svg'); if (!svg || !(e.ctrlKey || e.metaKey) || !CUR?.L) return;
    e.preventDefault(); const pt = svgPoint(svg, e); zoomBy(e.deltaY < 0 ? 'in' : 'out', pt.x, pt.y, 1.15);
  }, { passive: false });
  let pan = null;
  document.addEventListener('pointerdown', e => {
    const svg = e.target.closest?.('.pn-svg'); if (!svg || e.target.closest('.pn-n') || e.button > 0 || !CUR?.L?.zv) return;
    pan = { svg, id: e.pointerId, sx: e.clientX, sy: e.clientY, zv: CUR.L.zv.slice(), L: CUR.L };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  });
  document.addEventListener('pointermove', e => {
    if (!pan || e.pointerId !== pan.id) return;
    const r = pan.svg.getBoundingClientRect(), [x, y, w, h] = pan.zv, nx = x - (e.clientX - pan.sx) / r.width * w, ny = y - (e.clientY - pan.sy) / r.height * h;
    pan.L.zv = [Math.max(0, Math.min(VW - w, nx)), Math.max(0, Math.min(VH - h, ny)), w, h]; pan.svg.setAttribute('viewBox', vb(pan.L));
  });
  const endPan = e => { if (pan && e.pointerId === pan.id) pan = null; };
  document.addEventListener('pointerup', endPan); document.addEventListener('pointercancel', endPan);
  document.addEventListener('dblclick', e => { if (e.target.closest?.('.pn-svg') && !e.target.closest('.pn-n')) zoomBy('fit'); });
  document.addEventListener('change', e => {
    const c = e.target.closest?.('[data-pn-ch]'); if (!c || !box()) return;
    const on = [...document.querySelectorAll('[data-pn-ch]')].filter(x => x.checked).map(x => x.dataset.pnCh);
    if (!on.some(x => OPT.net !== 'physical' || 'edt'.includes(x))) { c.checked = true; return; }      // at least one channel the network scores
    OPT.ch = CH_LETTER.split('').filter(x => on.includes(x)).join(''); save(); paint();
  });
  const redrawAll = () => { if (CUR?.L) paint(); };
  K.clicks.push(
    ['[data-pn-view]', el => { OPT.view = el.dataset.pnView; save(); document.querySelectorAll('[data-pn-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pnView === OPT.view))); redrawAll(); }],
    ['[data-pn-optreset]', () => { Object.assign(OPT, { ...OPT0, view: OPT.view, conf: OPT.conf, n: OPT.n, color: OPT.color, layout: OPT.layout, net: OPT.net, only: OPT.only }); save(); document.querySelectorAll('.pn-opts2,.pn-zhelp').forEach(n => n.remove()); document.querySelector('.pn-opts')?.insertAdjacentHTML('afterend', moreOptionsHtml()); paint(); }],
    ['[data-pn-string]', btn => {
      if (!CUR?.L) return;
      const ids = CUR.L.nodes.filter(n => !n.ring).map(n => n.id), w = window.open('', '_blank'); btn.disabled = true;
      getJson(STRING_API + 'get_link?' + new URLSearchParams({ identifiers: ids.join('\r'), species: String(IXP.species), network_type: OPT.net, required_score: String(OPT.conf), network_flavor: 'evidence', caller_identity: CALLER }))
        .then(d => { const url = d && (typeof d[0] === 'string' ? d[0] : d[0] && d[0].url); if (url && w) { w.opener = null; w.location.href = url; } else if (w) w.close(); })
        .catch(() => { if (w) w.close(); }).then(() => { btn.disabled = false; });
    }],
    ['[data-pn-zoom]', btn => zoomBy(btn.dataset.pnZoom)],
    ['[data-pn-reset]', () => { if (!CUR?.L) return; delete LAY[CUR.L.key]; paint(); }],
    ['[data-pnexp]', btn => {
      if (!CUR?.L || CUR.st?.phase !== 'ok') return;
      K.exportFigure(btn.dataset.pnexp, figure, `${D.site.id}_${CUR.acc}_${OPT.net}_network`, btn, tsv);
    }],
    ['[data-ccexp]', btn => { if (CC.cur) K.exportFigure(btn.dataset.ccexp, () => ccFigure(CC.cur), `${D.site.id}_${CC.cur.acc}_interaction_evidence`, btn, () => ''); }],
    ['[data-cc-pos]', el => { const a = el.dataset.ccAcc || CC.cur?.acc; if (a) K.site?.focus(a, +el.dataset.ccPos, { from: 'glance' }); }],
  );
  K.tips.push(['[data-pn-tip]', el => el.dataset.pnTip || '']);

  // ---- Interaction evidence at a glance -------------------------------------------------------------------------------
  const CC = { cur: null };
  const KIND_WORDS = { rna: 'RNA interface', dna: 'DNA interface', protein: 'Protein interface', self: 'Interface with another copy' };
  const KINDS = ['rna', 'dna', 'protein', 'self'];
  function lanes() {                            // from the site file's structure evidence (website.protein.structure); the page's rows are rec.s3d
    const out = [];
    if (SD.contacts) KINDS.forEach(k => out.push({ id: 'c-' + k, label: KIND_WORDS[k], pred: false, at: s3 => (s3.c || []).filter(r => r[1] === k).map(r => r[0]) }));
    if (SD.bound) out.push({ id: 'bound', label: (SD.bound.label || 'RNA and DNA bound').replace(/ at the .*$/, ''), pred: false, at: s3 => (s3.b || []).map(r => r[0]) });
    (SD.colourings || []).forEach(cg => {
      if (SD.contacts && (cg.classes || []).every(c => KINDS.includes(c.id))) return;      // the same interfaces as above
      (cg.classes || []).forEach((c, k) => { if (!c.all) out.push({ id: cg.id + '-' + c.id, label: c.label, pred: false, at: (s3, sites) => sites.filter(s => ((s3.r || {})[cg.id] || []).some(([ki, a, z]) => ki === k && s >= a && s <= z)) }); });
    });
    if (SD.predicted) out.push({ id: 'pred', label: (SD.predicted.label || 'Predicted complexes').replace(/ with the .*$/, ''), pred: true, at: s3 => (s3.p || []).map(r => r[0]) });
    return out;
  };
  const LN = lanes();
  const ccH = () => 54 + LN.length * 22 + 30;
  function ccModel(acc, rec) {
    const sites = (rec.marks || []).map(m => m[0]), s3 = rec.s3d || {}, cells = LN.map(l => {
      const m = new Map(); l.at(s3, sites).forEach(pos => { if (sites.includes(pos)) m.set(pos, (m.get(pos) || 0) + 1); }); return m;
    });
    return { acc, len: (rec.seq || '').length || siteProtein(acc)?.len || Math.max(...sites, 1), sites, cells };
  }
  function ccSvg(M, ex) {
    const W0 = 900, x0 = 210, x1 = W0 - 24, H = ccH(), X = pos => x0 + (pos - 0.5) / M.len * (x1 - x0), ink = ex ? EXPORT.ink : null;
    let g = `<text x="12" y="30" ${ex ? `font-size="11" fill="${EXPORT.muted}"` : 'class="pn-cc-t"'}>${esc(cap0(W.marks))}</text>`;
    g += `<line x1="${x0}" x2="${x1}" y1="34" y2="34" ${ex ? `stroke="${EXPORT.edge}"` : 'class="pn-cc-axis"'}/>`;
    M.sites.forEach(s => { g += `<circle cx="${r1(X(s))}" cy="34" r="4" data-msite="${s}" ${ex ? `fill="${cssAccent()}"` : 'class="pn-cc-mark"'}/>`; });
    LN.forEach((l, k) => {
      const y = 54 + k * 22;
      g += `<text x="12" y="${y + 20}" ${ex ? `font-size="11" fill="${ink}"` : 'class="pn-cc-t"'}>${esc(short(l.label))}</text><line x1="${x0}" x2="${x1}" y1="${y + 16}" y2="${y + 16}" ${ex ? `stroke="${EXPORT.edge}" stroke-opacity=".35"` : 'class="pn-cc-lane"'}/>`;
      M.sites.forEach(s => {
        const n = M.cells[k].get(s); if (!n) return;
        const tip = `<b>${esc(K.prot ? K.prot.siteLabel(M.acc, s) : s)}</b><br>${esc(l.label)}: ${int(n)} record${n === 1 ? '' : 's'}${l.pred ? ' (predicted only)' : ''}`;
        g += `<circle cx="${r1(X(s))}" cy="${y + 16}" r="5" data-msite="${s}" ${ex ? (l.pred ? `fill="#ffffff" stroke="${cssAccent()}" stroke-width="1.8"` : `fill="${cssAccent()}" stroke="${EXPORT.stroke}"`) : `class="${l.pred ? 'pn-cc-pred' : 'pn-cc-obs'}" data-cc-pos="${s}" data-pn-tip="${esc(tip)}"`}/>`;
      });
    });
    const ay = ccH() - 14;
    g += `<text x="${x0}" y="${ay}" ${ex ? `font-size="10" fill="${EXPORT.muted}"` : 'class="pn-cc-t pn-cc-s"'}>1</text><text x="${x1}" y="${ay}" text-anchor="end" ${ex ? `font-size="10" fill="${EXPORT.muted}"` : 'class="pn-cc-t pn-cc-s"'}>${int(M.len)}</text>`;
    return { svg: g, W: W0, H };
  }
  const short = t => { const s = String(t).replace(/ \([^)]*\)$/, ''); return s.length > 31 ? s.slice(0, 30) + '…' : s; };
  const cap0 = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
  function ccFigure(M) {
    const s = ccSvg(M, true);
    return K.figureFrame({ title: `${CC.gene || M.acc}: interaction evidence`, sub: `${M.acc} · each ${W.mark} above the evidence at the same residue`, legend: [[cssAccent(), EXPORT.stroke, 'observed'], ['#ffffff', cssAccent(), 'predicted only']],
      body: s.svg, bodyH: s.H, W: s.W, note: 'Solid: observed (experiment). Hollow: predicted only. Data: structure tables of this dataset.', extra: { acc: M.acc } });
  }
  function ccFold(p, rec, fold) {
    if (!LN.length || !rec) return '';
    return fold('p-cc', 'Interaction evidence', `${LN.length} kinds of evidence, site by site`, `<div class="card-head"><p class="sub">Each ${esc(W.mark)} above the interaction evidence at the same residue. Solid: observed; hollow: predicted only. A dot opens its site.</p>` +
      `${K.expBar(['svg', 'png'], 'ccexp', 'the evidence summary')}</div><div class="pn-cc" id="pn-cc" data-acc="${esc(p.acc)}" style="aspect-ratio:900/${ccH()}"><p class="muted pn-msg">Loading…</p></div>`, true);
  }
  function ccMount() {
    const el = document.getElementById('pn-cc'); if (!el) { return; }
    const acc = el.dataset.acc;
    if (CC.cur?.acc === acc) { el.innerHTML = `<svg class="pn-cc-svg" viewBox="0 0 900 ${ccH()}" role="img" aria-label="Interaction evidence at the sites of ${esc(CC.gene || acc)}">${ccSvg(CC.cur).svg}</svg>`; return; }
    K.loadProtein(acc).then(rec => {
      const now = document.getElementById('pn-cc'); if (!now || now.dataset.acc !== acc || !rec) return;
      CC.gene = siteProtein(acc)?.gene; CC.cur = ccModel(acc, rec); ccMount();
    }, () => { const now = document.getElementById('pn-cc'); if (now) now.innerHTML = '<p class="muted pn-msg">The evidence tables did not load.</p>'; });
  }

  // ---- hooks into the protein page ------------------------------------------------------------------------------------
  (K.proteinFolds ||= []).push((p, rec, fold) => ccFold(p, rec, fold) + ixFold(p, rec, fold));
  (K.lightFolds ||= []).push((p, rec, fold) => ixFold(p, rec, fold));
  K.proteinFoldSections = [...(K.proteinFoldSections || []), ...(LN.length ? [['p-cc', 'Interaction evidence', 1]] : []), ...(IXP ? [['p-ix', 'Protein interactions', 1]] : [])];
  (K.afterRender ||= []).push(() => { mount(); ccMount(); });
});
