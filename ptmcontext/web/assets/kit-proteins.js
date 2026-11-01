/* Proteins: the Proteins tab (every protein with a mark, searchable and sortable) and a page per protein: its map
   (domains, disordered regions and the marks, with AlphaFold's confidence once it has loaded), how its marks compare
   with its own other residues, its marks one by one, and live cards from UniProt (function, and a check that the
   sequence has not changed), AlphaFold DB (the model in 3D), PDBe (experimental structures) and STRING (interaction
   partners, if the site file names the organism's taxon). Live sources add to the page; they never change a number. A module of the site kit: it registers with the core (kit.js), which starts it. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, S, esc, int, fxn, pct, cap } = K;
  if (!D.proteins || !D.proteins.length) return;
  const P = D.proteins.map(([acc, gene, name, len, marks, cand]) => ({ acc, gene, name, len, marks, cand }));
  const byAcc = Object.fromEntries(P.map(p => [p.acc, p]));
  const COLS = D.mark_columns || [];
  const RES = (D.residues || []).join('/');
  const label = (aid, cat) => (A[aid]?.labels || {})[cat] || String(cat).replace(/_/g, ' ');
  const help = (aid, cat) => (A[aid]?.help || {})[cat] || '';

  // ---- the per-protein files: 64 shards, or inlined in the one-file copy ------------------------------------------
  const shardOf = acc => [...acc].reduce((n, c) => n + c.charCodeAt(0), 0) % (D.shards || 64);
  const inline = (() => { try { return JSON.parse(document.getElementById('protein-data')?.textContent || '{}'); } catch (e) { return {}; } })();
  const shardCache = {};
  function loadShard(k) {
    const key = String(k).padStart(2, '0');
    if (inline[key]) return Promise.resolve(inline[key]);
    return (shardCache[key] ||= fetch(`data/p/${key}.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error('missing')))));
  }
  const loadProtein = acc => loadShard(shardOf(acc)).then(sh => sh[acc] || Promise.reject(new Error('not found')));

  // ---- search: a gene, an accession, a name, or a list of genes ------------------------------------------------------
  const toks = () => S.q.toLowerCase().split(/[\s,;]+/).filter(Boolean);
  function pHit(p) {
    const t = toks(); if (!t.length) return true;
    const g = (p.gene || '').toLowerCase(), a = p.acc.toLowerCase(), n = (p.name || '').toLowerCase();
    return t.some(x => x === g || x === a) || t.every(x => g.startsWith(x) || a.startsWith(x) || n.includes(x));
  }
  K.scopeHints.push(() => {
    if (!S.q || S.view === 'proteins' || S.view === 'protein') return '';
    const hits = P.filter(pHit); if (!hits.length) return '';
    return `<span class="scope-hint">${hits.length === 1 ? 'Protein' : int(hits.length) + ' proteins'} matching “${esc(S.q)}”:</span>` +
      hits.slice(0, 6).map(p => `<a class="try-chip" href="#protein/${esc(p.acc)}">${esc(p.gene || p.acc)}</a>`).join('') +
      (hits.length > 6 ? `<a class="scope-all" href="#proteins?q=${encodeURIComponent(S.q)}">all ${int(hits.length)} ›</a>` : '');
  });

  // ---- the Proteins tab -------------------------------------------------------------------------------------------
  const PS = { sort: 'marks', desc: true, n: 100 };
  const KEYS = { gene: p => (p.gene || p.acc).toLowerCase(), name: p => (p.name || '').toLowerCase(), acc: p => p.acc, marks: p => p.marks, len: p => p.len, share: p => p.marks / (p.cand || 1) };
  function shownProteins() {
    const rows = P.filter(pHit), key = KEYS[PS.sort];
    rows.sort((x, y) => { const a = key(x), b = key(y); const c = typeof a === 'number' ? a - b : String(a).localeCompare(String(b)); return PS.desc ? -c : c; });
    return rows;
  }
  const PCOLS = [['gene', 'Gene', false], ['name', 'Protein', false], ['acc', 'Accession', false], ['marks', cap(W.marks), true], ['len', 'Length', true], ['share', `Share of its ${W.residues}`, true]];
  function proteinsView() {
    const rows = shownProteins(), shown = rows.slice(0, PS.n);
    return `<div class="page-head"><h2>Proteins</h2>${K.expBar(['tsv'], 'pexp', 'the protein list')}</div>` +
      `<p class="page-sub">Every protein with at least one ${esc(W.mark)}. Search by gene, accession or name; a list of genes works too. A row opens the protein.</p>` +
      `<div class="filters"><span class="muted">${int(rows.length)} of ${int(P.length)} proteins${S.q ? ` match “${esc(S.q)}”` : ''}</span></div>` +
      `<div class="tbl-card"><table class="tbl ptbl"><thead><tr>${PCOLS.map(([k, t, n]) => `<th class="${n ? 'num' : ''}" data-psort="${k}"${PS.sort === k ? ` aria-sort="${PS.desc ? 'descending' : 'ascending'}"` : ''}>${esc(t)}${PS.sort === k ? (PS.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>` +
      shown.map(p => `<tr data-acc="${esc(p.acc)}"><td><a href="#protein/${esc(p.acc)}"><b>${esc(p.gene || '–')}</b></a></td><td class="wrapok">${esc(p.name)}</td><td class="mono">${esc(p.acc)}</td>` +
        `<td class="num">${int(p.marks)}</td><td class="num">${int(p.len)}</td><td class="num">${pct(p.marks, p.cand)}</td></tr>`).join('') +
      `</tbody></table></div>` + (rows.length > PS.n ? `<p><button class="linkish" type="button" data-pmore>Show ${int(Math.min(200, rows.length - PS.n))} more</button></p>` : '');
  }
  const proteinsTsv = () => K.preamble('proteins', `every protein with at least one ${W.mark} (${int(shownProteins().length)} shown${S.q ? ' for the search "' + S.q + '"' : ''}): its gene, name, length, its ${W.marks} and its candidate residues (${RES}).`) +
    ['accession', 'gene', 'protein', 'length', W.marks.replace(/\W+/g, '_'), `candidate_residues_${RES.replace(/\W+/g, '')}`].join('\t') + '\n' +
    shownProteins().map(p => [p.acc, p.gene, p.name, p.len, p.marks, p.cand].join('\t')).join('\n') + '\n';

  // ---- a protein's page -------------------------------------------------------------------------------------------
  const PV = { acc: '', rec: null, err: '', af: null, uni: null, pdb: null, pdbAll: false, ix: null };
  function load(acc) {
    if (PV.acc === acc) return;
    Object.assign(PV, { acc, rec: null, err: '', af: null, uni: null, pdb: null, pdbAll: false, ix: null });
    IXS.all = false;
    loadProtein(acc).then(r => { if (PV.acc === acc) { PV.rec = r; K.render(); } },
      () => { if (PV.acc === acc) { PV.err = location.protocol === 'file:' ? 'This copy of the site cannot read the protein files from disk. Open the hosted site, or index.html through a local web server.' : 'The protein’s file could not be read.'; K.render(); } });
  }
  const AF_BINS = [[90, '#0053d6', 'very high (pLDDT > 90)'], [70, '#65cbf3', 'confident (70–90)'], [50, '#ffdb13', 'low (50–70)'], [0, '#ff7d45', 'very low (< 50)']];
  const afColour = v => AF_BINS.find(([t]) => v > t || t === 0)[1];
  // the map: one line per protein, domains as blocks, disordered regions as a wavy line, the marks as lollipops; for an
  // export the colours are written in (ex), on screen they follow the theme
  function mapBody(p, rec, Wd, ex) {
    const L = p.len, x0 = 12, x1 = Wd - 12, X = pos => x0 + (pos - 0.5) / L * (x1 - x0), yB = 58, parts = [];
    const C = ex ? { line: '#8a979e', dom: '#d6ecf0', domS: '#0e7490', domT: '#0f3b47', head: '#c2410c', tick: '#5f6f78', wave: '#5f6f78' } : null;
    const cls = (k, inlineAttrs) => (ex ? inlineAttrs : `class="${k}"`);
    parts.push(`<line ${cls('m-line', `stroke="${C?.line}"`)} x1="${x0}" x2="${x1}" y1="${yB}" y2="${yB}" stroke-width="1.6"/>`);
    rec.units.filter(u => u[0] === 'disordered').forEach(([, s, e]) => {
      const a = X(s - 0.5), b = X(e + 0.5); if (b - a < 2) return;
      let d = `M${a.toFixed(1)},${yB}`, x = a, up = true;
      while (x < b) { const nx = Math.min(b, x + 5); d += ` Q${((x + nx) / 2).toFixed(1)},${up ? yB - 5 : yB + 5} ${nx.toFixed(1)},${yB}`; x = nx; up = !up; }
      parts.push(`<path ${cls('m-wave', `stroke="${C?.wave}"`)} d="${d}" fill="none" stroke-width="1.4"/>`);
    });
    rec.units.filter(u => u[0] === 'domain').forEach(([, s, e, lab, src]) => {
      const a = X(s - 0.5), b = X(e + 0.5), w = Math.max(2, b - a);
      const from = (D.unit_sources || [])[src];
      // the block shows the name's first part (an ECOD label's family); its tooltip, the whole name and the source
      const short = String(lab || '').split(' · ')[0];
      parts.push(`<rect ${cls('m-dom', `fill="${C?.dom}" stroke="${C?.domS}"`)} x="${a.toFixed(1)}" y="${yB - 9}" width="${w.toFixed(1)}" height="18" rx="4" stroke-width="1"><title>${esc(lab)}, ${s}–${e}${from ? ` (${esc(from)})` : ''}</title></rect>`);
      if (short && K.tw(short, 10) + 8 < w) parts.push(`<text ${cls('m-domt', `fill="${C?.domT}"`)} x="${((a + b) / 2).toFixed(1)}" y="${yB + 3.5}" font-size="10" text-anchor="middle">${esc(short)}</text>`);
    });
    rec.marks.forEach(([pos]) => {
      const x = X(pos).toFixed(1);
      parts.push(`<line ${cls('m-stick', `stroke="${C?.line}"`)} x1="${x}" x2="${x}" y1="${yB - 10}" y2="${yB - 30}" stroke-width="1"/>`);
      parts.push(`<circle ${cls('m-head', `fill="${C?.head}"`)} cx="${x}" cy="${yB - 33}" r="3.6" ${ex ? '' : `data-mpos="${pos}"`}/>`);
    });
    const step = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(s => L / s <= 10) || 10000;
    for (let t = 0; t <= L; t += step) {
      const x = X(Math.max(t, 1)).toFixed(1);
      parts.push(`<line ${cls('m-tick', `stroke="${C?.tick}"`)} x1="${x}" x2="${x}" y1="${yB + 14}" y2="${yB + 18}" stroke-width="1"/><text ${cls('m-tickt', `fill="${C?.tick}"`)} x="${x}" y="${yB + 29}" font-size="10" text-anchor="middle">${Math.max(t, 1)}</text>`);
    }
    let H = yB + 34;
    const pl = PV.af?.plddt;
    if (pl && pl.length === L) {
      const w = (x1 - x0) / L;
      let runStart = 0;
      for (let i = 1; i <= L; i++) {
        if (i < L && afColour(pl[i]) === afColour(pl[runStart])) continue;
        parts.push(`<rect x="${(x0 + runStart * w).toFixed(2)}" y="${H + 4}" width="${((i - runStart) * w + 0.3).toFixed(2)}" height="7" fill="${afColour(pl[runStart])}"/>`);
        runStart = i;
      }
      parts.push(`<text ${cls('m-tickt', `fill="${C?.tick}"`)} x="${x0}" y="${H + 24}" font-size="10">AlphaFold confidence (pLDDT), model v${esc(PV.af.version)}</text>`);
      H += 30;
    }
    return { svg: parts.join(''), H };
  }
  function drawMap() {
    const el = document.getElementById('pmap'); if (!el || !PV.rec) return;
    const p = byAcc[PV.acc], m = mapBody(p, PV.rec, 1000, false);
    el.innerHTML = `<svg viewBox="0 0 1000 ${m.H}" role="img" aria-label="Map of ${esc(p.gene || p.acc)}: domains, disordered regions and ${esc(W.marks)}">${m.svg}</svg>`;
  }
  const site = pos => `${(PV.rec.seq || '')[pos - 1] || D.residues?.[0] || ''}${pos}`;
  function markClasses(m) { return COLS.map((aid, k) => [aid, m[2][k]]); }
  function classText(aid, v) {
    if (!v) return '–';
    const a = A[aid]; if (!a) return v;
    return a.layer === 'motif' ? v.split(';').map(c => label(aid, c)).join(', ') : label(aid, v);
  }
  function scoreRows(p, rec) {
    return D.analyses.filter(a => rec.counts[a.id]).map(a => {
      const rows = rec.counts[a.id].filter(r => r[1] > 0).sort((x, y) => y[1] - x[1]), [mt, ot] = rec.totals[a.id] || [0, 0];
      const ans = rows.slice(0, 2).map(([c, mi, oi]) => `${esc(label(a.id, c))}: <span class="an">${int(mi)} of ${int(mt)} (${pct(mi, mt)}) vs ${int(oi)} of ${int(ot)} other ${esc(W.residues)} (${pct(oi, ot)})</span>`).join('; ') || '<span class="muted">none</span>';
      const all = rec.counts[a.id].slice().sort((x, y) => y[1] - x[1] || y[2] - x[2]);
      return `<details class="score small"><summary><span class="pm" aria-hidden="true"></span><span class="tq"><span class="t">${esc(a.title)}</span></span><span class="ans">${ans}</span><span class="go" aria-hidden="true"></span></summary>` +
        `<div class="card-body"><div class="tbl-card"><table class="tbl"><thead><tr><th>Class</th><th class="num">${esc(cap(W.marks))} here</th><th class="num">Other ${esc(W.residues)} here</th></tr></thead><tbody>` +
        all.map(([c, mi, oi]) => `<tr><td title="${esc(help(a.id, c))}">${esc(label(a.id, c))}</td><td class="num">${int(mi)} of ${int(mt)} (${pct(mi, mt)})</td><td class="num">${int(oi)} of ${int(ot)} (${pct(oi, ot)})</td></tr>`).join('') +
        `</tbody></table></div></div></details>`;
    }).join('');
  }
  const winHtml = w => { const c = Math.floor(w.length / 2); return `<span class="win">${esc(w.slice(0, c))}<b>${esc(w[c])}</b>${esc(w.slice(c + 1))}</span>`; };
  function proteinView(acc) {
    const p = byAcc[acc];
    if (!p) return `<p class="empty">No ${esc(W.marks)} on ${esc(acc)} in this site. <a href="#proteins">All proteins</a></p>`;
    load(acc);
    const head = `<p class="crumb"><a href="#proteins">‹ All proteins</a></p><div class="prot-head"><div><h2>${esc(p.gene || p.acc)} <small>${esc(p.name)}</small></h2>` +
      `<p class="muted">${esc(p.acc)} · ${int(p.len)} residues · ${int(p.marks)} ${esc(p.marks === 1 ? W.mark : W.marks)} of its ${int(p.cand)} ${esc(W.residues)} (${pct(p.marks, p.cand)}) · ` +
      `<a href="https://www.uniprot.org/uniprotkb/${esc(p.acc)}">UniProt</a> · <a href="https://alphafold.ebi.ac.uk/entry/${esc(p.acc)}">AlphaFold</a> · <a href="https://www.ebi.ac.uk/pdbe/pdbe-kb/proteins/${esc(p.acc)}">PDBe-KB</a></p></div></div>` +
      `<div id="drift" class="drift" hidden></div>`;
    if (!PV.rec) return head + `<p class="empty">${PV.err ? esc(PV.err) : 'Loading…'}</p>`;
    const rec = PV.rec;
    return head +
      `<section class="pcard"><div class="card-head"><div><h3>Map</h3><p class="sub">Domains (blocks), disordered regions (wavy line) and the ${esc(W.marks)} (lollipops) as the site’s tests placed them. Hover a ${esc(W.mark)} for its classes.</p></div>${K.expBar(['pdf', 'svg', 'png'], 'mexp', 'the map')}</div><div id="pmap" class="pmap"></div></section>` +
      `<section class="pcard"><div class="card-head"><div><h3>Its ${esc(W.marks)}, against its other ${esc(W.residues)}</h3><p class="sub">Counted in this protein: the classes its ${esc(W.marks)} fall in, and how often its other ${esc(W.residues)} do. A row opens every class.</p></div></div><div class="hub">${scoreRows(p, rec)}</div></section>` +
      `<section class="pcard"><div class="card-head"><div><h3>${esc(cap(W.marks))}</h3><p class="sub">Each ${esc(W.mark)} with the 15 residues around it and its class in every question.</p></div>${K.expBar(['tsv'], 'sexp', 'the sites')}</div>` +
      `<div class="tbl-card"><table class="tbl"><thead><tr><th>Site</th><th>Window (±7)</th>${COLS.map(aid => `<th>${esc(A[aid]?.title || aid)}</th>`).join('')}</tr></thead><tbody>` +
      rec.marks.map(m => `<tr><td class="mono"><b>${esc(site(m[0]))}</b></td><td class="mono">${winHtml(m[1])}</td>${markClasses(m).map(([aid, v]) => `<td class="wrapok" title="${esc(help(aid, v))}">${esc(classText(aid, v))}</td>`).join('')}</tr>`).join('') +
      `</tbody></table></div></section>` +
      `<div class="live-grid"><section class="pcard"><h3>Function <small class="muted">UniProt, live</small></h3><div id="live-uniprot" class="live"><p class="muted">Asking UniProt…</p></div></section>` +
      `<section class="pcard"><h3>Predicted structure <small class="muted">AlphaFold DB, live</small></h3><div id="live-af" class="live"><p class="muted">Asking AlphaFold DB…</p></div><div id="af3d" class="af3d" hidden></div></section></div>` +
      `<section class="pcard"><h3>Experimental structures <small class="muted">PDBe, live</small></h3><div id="live-pdb" class="live"><p class="muted">Asking PDBe…</p></div></section>` +
      (IXP ? `<section class="pcard"><div class="card-head"><div><h3>Interaction partners <small class="muted">STRING, live</small></h3><p class="sub">The proteins STRING associates with ${esc(p.gene || p.acc)}, best first, and which of them have ${esc(W.marks)} in this site.</p></div>${K.expBar(['tsv'], 'ixexp', 'the partners')}</div><div id="live-ix" class="live"><p class="muted">Asking STRING…</p></div></section>` : '');
  }

  // ---- live sources: asked once per protein, shown when they answer, never needed for a number ---------------------
  const today = () => K.hdate(new Date().toISOString());
  const getJson = url => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  function fill(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function proteinAfter(acc) {
    if (!PV.rec || PV.acc !== acc) return;
    drawMap();
    const p = byAcc[acc], rec = PV.rec;
    // UniProt: the function, and whether the sequence is still the one these results were computed on
    (PV.uni ||= getJson(`https://rest.uniprot.org/uniprotkb/${acc}.json?fields=sequence,cc_function`).then(j => ({ ok: true, j }), e => ({ ok: false, e })))
      .then(({ ok, j }) => {
        if (PV.acc !== acc) return;
        if (!ok) { fill('live-uniprot', '<p class="muted">UniProt did not answer. Nothing on this page depends on it.</p>'); return; }
        const texts = (j.comments || []).filter(c => c.commentType === 'FUNCTION').flatMap(c => (c.texts || []).map(t => t.value));
        fill('live-uniprot', (texts.length ? texts.slice(0, 2).map(t => `<p>${esc(t)}</p>`).join('') : '<p class="muted">UniProt gives no function text for this entry.</p>') + `<p class="src">UniProt ${esc(acc)}, retrieved ${esc(today())}.</p>`);
        const live = String(j.sequence?.md5 || '').toUpperCase(), el = document.getElementById('drift');
        if (el && live && rec.md5 && live !== rec.md5.toUpperCase()) {
          el.hidden = false;
          el.innerHTML = `<b>UniProt has changed this sequence</b> since ${esc(D.run.snapshot?.release || 'the release these results use')}. Positions on this page are on that release’s sequence; the live cards below may not line up with them.`;
        }
      });
    // AlphaFold DB: the model, its confidence along the map (only if its sequence is the same), and 3D on request
    (PV.afReq ||= {})[acc] ||= getJson(`https://alphafold.ebi.ac.uk/api/prediction/${acc}`).then(async list => {
      const m = Array.isArray(list) ? list[0] : null; if (!m) return { none: true };
      const same = m.sequence === rec.seq;
      let plddt = null;
      if (same && m.plddtDocUrl) { try { const d = await getJson(m.plddtDocUrl); plddt = d.confidenceScore || null; } catch (e) { plddt = null; } }
      return { version: m.latestVersion, mean: m.globalMetricValue, pdbUrl: m.pdbUrl, same, plddt };
    }, () => ({ failed: true }));
    PV.afReq[acc].then(af => {
      if (PV.acc !== acc) return;
      if (af.failed) { fill('live-af', '<p class="muted">AlphaFold DB did not answer. Nothing on this page depends on it.</p>'); return; }
      if (af.none) { fill('live-af', '<p class="muted">AlphaFold DB has no model of this protein.</p>'); return; }
      PV.af = af; drawMap();
      fill('live-af', `<p>Model v${esc(af.version)}, mean confidence (pLDDT) ${esc(Number(af.mean).toFixed(1))}.${af.same ? ' Its confidence is drawn under the map.' : ' <b>Its sequence differs from the one these results use</b>, so its confidence is not drawn on the map.'}</p>` +
        `<p><button class="btn" type="button" id="af-3d-btn">Show the model in 3D</button> <a href="https://alphafold.ebi.ac.uk/entry/${esc(acc)}">Open in AlphaFold DB</a></p>` +
        `<p class="src">AlphaFold DB (Varadi et al., Nucleic Acids Res 52:D368 (2024), doi:10.1093/nar/gkad1011), retrieved ${esc(today())}. The ${esc(W.marks)} are drawn as spheres.</p>`);
    });
    // PDBe: the experimental structures, best first, and which of the marks each covers
    (PV.pdbReq ||= {})[acc] ||= getJson(`https://www.ebi.ac.uk/pdbe/api/mappings/best_structures/${acc}`).then(j => j[acc] || [], e => (String(e.message) === '404' ? [] : null));
    PV.pdbReq[acc].then(list => {
      if (PV.acc !== acc) return;
      if (list === null) { fill('live-pdb', '<p class="muted">PDBe did not answer. Nothing on this page depends on it.</p>'); return; }
      if (!list.length) { fill('live-pdb', '<p class="muted">No experimental structure of this protein in the PDB.</p>'); return; }
      PV.pdb = list; drawPdb();
    });
    drawIx();
  }
  function drawPdb() {
    const rec = PV.rec; if (!PV.pdb || !rec) return;
    // one row per entry, best mapping first (PDBe's order), with every chain of the protein in it
    const byEntry = new Map();
    PV.pdb.forEach(e => { const k = String(e.pdb_id); if (!byEntry.has(k)) byEntry.set(k, { ...e, chains: [] }); const x = byEntry.get(k); if (!x.chains.includes(e.chain_id)) x.chains.push(e.chain_id); });
    const list = [...byEntry.values()].map(e => ({ ...e, chain_id: e.chains.join(', ') }));
    const shown = PV.pdbAll ? list : list.slice(0, 10);
    const covered = e => rec.marks.filter(([pos]) => pos >= e.unp_start && pos <= e.unp_end).length;
    fill('live-pdb', `<div class="tbl-card"><table class="tbl"><thead><tr><th>Entry</th><th>Method</th><th class="num">Resolution</th><th>Chains</th><th class="num">Residues</th><th class="num">${esc(cap(W.marks))} covered</th></tr></thead><tbody>` +
      shown.map(e => `<tr><td class="mono"><a href="https://www.rcsb.org/structure/${esc(e.pdb_id)}">${esc(String(e.pdb_id).toUpperCase())}</a></td><td>${esc(e.experimental_method || '')}</td>` +
        `<td class="num">${e.resolution != null ? esc(Number(e.resolution).toFixed(1)) + ' Å' : '–'}</td><td>${esc(e.chain_id || '')}</td><td class="num">${int(e.unp_start)}–${int(e.unp_end)}</td><td class="num">${int(covered(e))} of ${int(rec.marks.length)}</td></tr>`).join('') +
      `</tbody></table></div>` + (list.length > 10 ? `<p><button class="linkish" type="button" data-pdb-all>${PV.pdbAll ? 'Show the best 10' : 'Show all ' + int(list.length) + ' entries'}</button></p>` : '') +
      `<p class="src">PDBe best structures (SIFTS), retrieved ${esc(today())}; residues are UniProt positions.</p>`);
  }
  // ---- interaction partners: live from STRING, matched to this site's proteins by gene name ------------------------
  // The site file turns the card on and names the taxon STRING files the organism under (website.partners).
  const IXP = D.partners || null;
  const IXS = { net: IXP?.network || 'physical', min: Math.round((IXP?.min_score ?? 0.7) * 1000), only: false, all: false };
  const STRING_API = 'https://string-db.org/api/json/', STRING_CALLER = 'ptmcontext';
  const STRING_CITE = 'Szklarczyk et al., Nucleic Acids Res 53:D730 (2025), doi:10.1093/nar/gkae1113';
  const IX_SCORES = [[400, '≥ 0.4'], [700, '≥ 0.7'], [900, '≥ 0.9']];
  // STRING's evidence channels: API field, name. The physical network scores the first three only.
  const IX_CHANNELS = [['escore', 'experiments'], ['dscore', 'databases'], ['tscore', 'text mining'], ['ascore', 'co-expression'], ['nscore', 'neighbourhood'], ['fscore', 'gene fusion'], ['pscore', 'co-occurrence']];
  let geneIndex = null, stringVersion = null;
  const byGene = g => {
    if (!geneIndex) { geneIndex = new Map(); P.forEach(p => String(p.gene || '').split(/[\s;]+/).filter(Boolean).forEach(x => { if (!geneIndex.has(x.toUpperCase())) geneIndex.set(x.toUpperCase(), p); })); }
    return geneIndex.get(String(g || '').toUpperCase());
  };
  function ixAsk(acc) {
    const key = `${acc}:${IXS.net}:${IXS.min}`;
    stringVersion ||= getJson(STRING_API + 'version').then(j => (j && j[0] && j[0].string_version) || '', () => '');
    (PV.ixReq ||= {})[key] ||= fetch(STRING_API + 'interaction_partners', {
      method: 'POST',
      body: new URLSearchParams({ identifiers: acc, species: String(IXP.species), network_type: IXS.net, required_score: String(IXS.min), limit: '2000', caller_identity: STRING_CALLER }),
    }).then(r => (r.ok ? r.json() : r.status === 404 ? { unknown: true } : Promise.reject(new Error(String(r.status))))).catch(() => null);
    return Promise.all([PV.ixReq[key], stringVersion]);
  }
  const ixDesc = () => `STRING${PV.ix?.ver ? ' v' + PV.ix.ver : ''} ${IXS.net} network, score ${(IXS.min / 1000).toFixed(1)} or more`;
  const evidence = e => IX_CHANNELS.filter(([f]) => +e[f] > 0).sort(([a], [b]) => e[b] - e[a]).map(([f, n]) => `${n} ${Number(e[f]).toFixed(2)}`).join(', ');
  function drawIx() {
    const acc = PV.acc; if (!IXP || !PV.rec || !document.getElementById('live-ix')) return;
    const seg = (key, opts) => `<span class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-ix-${key}="${v}" aria-pressed="${String(IXS[key]) === String(v)}">${esc(l)}</button>`).join('')}</span>`;
    const controls = `<div class="ix-opts">${seg('net', [['physical', 'Physical'], ['functional', 'Functional']])} ${seg('min', IX_SCORES)} ${seg('only', [['false', 'All partners'], ['true', `With ${W.marks} here`]])}</div>`;
    fill('live-ix', controls + '<p class="muted">Asking STRING…</p>');
    ixAsk(acc).then(([rows, ver]) => {
      if (PV.acc !== acc || !document.getElementById('live-ix')) return;
      if (rows === null) { fill('live-ix', controls + '<p class="muted">STRING did not answer. Nothing on this page depends on it.</p>'); return; }
      if (rows.unknown) { fill('live-ix', `<p class="muted">STRING does not know ${esc(acc)} in taxon ${esc(IXP.species)}.</p>`); return; }
      const best = new Map();                                     // one row per partner, its best score
      rows.forEach(e => { if (e.stringId_B !== e.stringId_A && (!best.has(e.stringId_B) || best.get(e.stringId_B).score < e.score)) best.set(e.stringId_B, e); });
      const list = [...best.values()].map(e => ({ ...e, here: byGene(e.preferredName_B) }))
        .sort((x, y) => y.score - x.score || String(x.preferredName_B).localeCompare(String(y.preferredName_B)));
      PV.ix = { list, ver, self: rows[0]?.stringId_A || '' };
      const withMarks = list.filter(x => x.here), shownAll = IXS.only ? withMarks : list, shown = IXS.all ? shownAll : shownAll.slice(0, 15);
      const head = list.length
        ? `<p>${int(list.length)} ${esc(IXS.net)} partner${list.length === 1 ? '' : 's'} at score ${(IXS.min / 1000).toFixed(1)} or more; <b>${int(withMarks.length)}</b> of them ${withMarks.length === 1 ? 'has' : 'have'} ${esc(W.marks)} in this site.</p>`
        : `<p class="muted">STRING lists no ${esc(IXS.net)} partner at score ${(IXS.min / 1000).toFixed(1)} or more.</p>`;
      const table = shown.length ? `<div class="tbl-card"><table class="tbl"><thead><tr><th>Partner</th><th class="num">Score</th><th>Evidence</th><th class="num">${esc(cap(W.marks))} here</th></tr></thead><tbody>` +
        shown.map(x => `<tr><td>${x.here ? `<a href="#protein/${esc(x.here.acc)}"><b>${esc(x.preferredName_B)}</b></a>` : `<span title="${esc(x.stringId_B)}">${esc(x.preferredName_B)}</span>`}</td>` +
          `<td class="num">${Number(x.score).toFixed(3)}</td><td class="wrapok">${esc(evidence(x))}</td><td class="num">${x.here ? int(x.here.marks) : '–'}</td></tr>`).join('') + '</tbody></table></div>' : '';
      const more = shownAll.length > 15 ? `<p><button class="linkish" type="button" data-ix-all>${IXS.all ? 'Show the best 15' : 'Show all ' + int(shownAll.length)}</button></p>` : '';
      fill('live-ix', controls + head + table + more +
        `<p><button class="linkish" type="button" data-ix-string>Open this network in STRING</button></p>` +
        `<p class="src">${esc(ixDesc())} (${esc(STRING_CITE)}), retrieved ${esc(today())}. Partners are matched to this site’s proteins by gene name. A STRING association is to the whole protein: it does not show that a partner binds or modifies a ${esc(W.mark)}.</p>`);
    });
  }
  function ixTsv() {
    const p = byAcc[PV.acc], list = PV.ix?.list || [];
    return K.preamble(`interaction partners of ${p.gene || p.acc} (${p.acc})`, `the proteins STRING associates with ${p.gene || p.acc}: ${ixDesc()}, retrieved live on ${today()} (${STRING_CITE}; licence CC BY 4.0). Partners are matched to this site’s proteins by gene name; ${W.marks}_here counts their ${W.marks} in this site. A STRING association is to the whole protein: it does not show that a partner binds or modifies a ${W.mark}.`) +
      ['partner', 'partner_string_id', 'partner_accession_here', 'score', ...IX_CHANNELS.map(([, n]) => n.replace(/\W+/g, '_')), `${W.marks.replace(/\W+/g, '_')}_here`].join('\t') + '\n' +
      list.map(x => [x.preferredName_B, x.stringId_B, x.here?.acc || '', x.score, ...IX_CHANNELS.map(([f]) => x[f] ?? ''), x.here ? x.here.marks : 0].join('\t')).join('\n') + '\n';
  }
  function openString() {
    const w = window.open('', '_blank');
    const qs = new URLSearchParams({ identifiers: PV.acc, species: String(IXP.species), network_type: IXS.net, required_score: String(IXS.min), network_flavor: 'evidence', caller_identity: STRING_CALLER });
    getJson(STRING_API + 'get_link?' + qs).then(d => { const url = d && (typeof d[0] === 'string' ? d[0] : d[0]?.url); if (url && w) { w.opener = null; w.location.href = url; } else if (w) w.close(); })
      .catch(() => { if (w) w.close(); });
  }

  const THREE_D = 'https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.5.3/3Dmol-min.js';
  async function show3d() {
    const box = document.getElementById('af3d'), af = PV.af; if (!box || !af?.pdbUrl) return;
    box.hidden = false; box.innerHTML = '<p class="muted">Loading the model…</p>';
    try {
      if (!window.$3Dmol) await new Promise((ok, fail) => document.head.appendChild(Object.assign(document.createElement('script'), { src: THREE_D, onload: ok, onerror: () => fail(new Error('3Dmol did not load')) })));
      const pdb = await fetch(af.pdbUrl).then(r => (r.ok ? r.text() : Promise.reject(new Error('model'))));
      box.innerHTML = '';
      const v = window.$3Dmol.createViewer(box, { backgroundColor: 'white' });
      v.addModel(pdb, 'pdb');
      v.setStyle({}, { cartoon: { colorfunc: a => afColour(a.b) } });
      if (af.same) v.addStyle({ resi: PV.rec.marks.map(([pos]) => pos), atom: 'CA' }, { sphere: { color: '#c2410c', radius: 1.6 } });
      v.zoomTo(); v.render();
    } catch (e) { box.innerHTML = `<p class="muted">The 3D model could not be shown (${esc(e.message)}).</p>`; }
  }

  // ---- downloads: the map as a figure, the sites and the proteins as tables ------------------------------------------
  function mapFigure() {
    const p = byAcc[PV.acc], m = mapBody(p, PV.rec, 720, true);
    const legend = [['#d6ecf0', '#0e7490', 'domain'], ['#ffffff', '#5f6f78', 'disordered region (wavy line)'], ['#c2410c', '#c2410c', W.mark]];
    const af = PV.af?.plddt && PV.af.plddt.length === p.len ? ` AlphaFold confidence (pLDDT) from model v${PV.af.version}, retrieved ${today()}: ${AF_BINS.map(b => b[2]).join(', ')}.` : '';
    return K.figureFrame({ title: `${p.gene || p.acc}: ${p.name}`, sub: `${p.acc}, ${int(p.len)} residues; ${int(p.marks)} ${p.marks === 1 ? W.mark : W.marks} of its ${int(p.cand)} ${W.residues}`,
      legend, body: m.svg, bodyH: m.H, W: 720, note: `Domains and disordered regions as the site’s tests placed them (${Object.values(D.inputs || {}).filter(x => x.role === 'domains' || x.role === 'disorder').map(x => x.version).join('; ')}).${af}`, extra: { protein: p.acc } });
  }
  function sitesTsv() {
    const p = byAcc[PV.acc], rec = PV.rec;
    return K.preamble(`${W.marks} of ${p.gene || p.acc} (${p.acc})`, `each ${W.mark} of ${p.gene || p.acc} (${p.name}) with the 15 residues around it and its class in every question; the sequence is ${D.run.snapshot?.release} (MD5 ${rec.md5}).`) +
      ['site', 'position', 'window_15', ...COLS].join('\t') + '\n' +
      rec.marks.map(m => [site(m[0]), m[0], m[1], ...markClasses(m).map(([aid, v]) => classText(aid, v))].join('\t')).join('\n') + '\n';
  }

  // ---- register with the core -------------------------------------------------------------------------------------
  K.views.proteins = { render: proteinsView, title: () => 'Proteins' };
  K.views.protein = { render: proteinView, title: acc => (byAcc[acc]?.gene || acc), after: proteinAfter, tab: 'proteins' };
  K.tabs.push(() => ['proteins', 'Proteins', P.length]);
  K.clicks.push(
    ['[data-psort]', el => { const k = el.dataset.psort; PS.desc = PS.sort === k ? !PS.desc : k === 'marks' || k === 'len' || k === 'share'; PS.sort = k; K.render(); }],
    ['[data-pmore]', () => { PS.n += 200; K.render(); }],
    ['[data-pexp]', el => K.exportFigure('tsv', null, `${D.site.id}_proteins`, el, proteinsTsv)],
    ['[data-sexp]', el => K.exportFigure('tsv', null, `${D.site.id}_${PV.acc}_sites`, el, sitesTsv)],
    ['[data-mexp]', el => K.exportFigure(el.dataset.mexp, mapFigure, `${D.site.id}_${PV.acc}_map`, el)],
    ['#af-3d-btn', () => show3d()],
    ['[data-pdb-all]', () => { PV.pdbAll = !PV.pdbAll; drawPdb(); }],
    ['[data-ix-net]', el => { IXS.net = el.dataset.ixNet; IXS.all = false; drawIx(); }],
    ['[data-ix-min]', el => { IXS.min = +el.dataset.ixMin; IXS.all = false; drawIx(); }],
    ['[data-ix-only]', el => { IXS.only = el.dataset.ixOnly === 'true'; IXS.all = false; drawIx(); }],
    ['[data-ix-all]', () => { IXS.all = !IXS.all; drawIx(); }],
    ['[data-ix-string]', () => openString()],
    ['[data-ixexp]', el => { if (PV.ix) K.exportFigure('tsv', null, `${D.site.id}_${PV.acc}_${IXS.net}_partners`, el, ixTsv); }],
    ['tr[data-acc]', (el, e) => { if (!e.target.closest('a')) K.go('protein', { arg: el.dataset.acc }); }],
  );
  K.tips.push(['[data-mpos]', el => {
    const pos = +el.dataset.mpos, m = PV.rec?.marks.find(x => x[0] === pos); if (!m) return '';
    return `<b>${esc(site(pos))}</b> <span class="win">${winHtml(m[1])}</span><br>` + markClasses(m).map(([aid, v]) => `${esc(A[aid]?.title || aid)}: ${esc(classText(aid, v))}`).join('<br>');
  }]);
});
