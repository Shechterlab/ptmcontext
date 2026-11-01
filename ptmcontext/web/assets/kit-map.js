/* The protein map, as the Methylarginine Site Explorer draws it: the marks as stacked lollipops over a backbone (a bar
   for ordered stretches, a wave for disordered ones, the site's domains as boxes), and rows under it, each from a named
   source:
     the site's own data   domains and disordered regions (the site's inputs), IDRs with their charge, candidate
                           residues, the charge along the chain (computed from the sequence)
     UniProt, live         its domains and repeats, regions and motifs, compositional bias, natural variants and
                           mutagenesis, modified residues and cross-links
     AlphaFold DB, live    the model's confidence (pLDDT)
   Every item has a hover that says what it is and where it comes from, and a click that pins it under the map with
   its links (UniProt entry, PubMed, dbSNP). A crosshair reads out the residue under the pointer. Sites are coloured by
   any attribute the site file offers; their labels are placed Auto (merged where they collide), All or None. The rows
   are chosen and ordered in the Rows menu (remembered in this browser); a drag across the map zooms in. The same
   drawing, in light colours, is the map's PDF, SVG and PNG. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int } = K;
  const SPECS = D.attribute_specs || {};
  const AT = D.mark_attributes || [];                       // the order of a mark's attribute values
  const attrIdx = name => AT.indexOf(name);
  const PALETTE = ['#2A78D6', '#EB6834', '#1BAF7A', '#A23B12', '#7C3AED', '#0891B2', '#B45309', '#BE185D'];
  const NONE_C = '#A3AEB3', SINGLE_C = '#B42318';
  // Kyte & Doolittle (1982), and the EMBOSS charge scale
  const KD = { A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5, Q: -3.5, E: -3.5, G: -0.4, H: -3.2, I: 4.5, L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6, S: -0.8, T: -0.7, W: -0.9, Y: -1.3, V: 4.2 };
  const CHARGE = { K: 1, R: 1, H: 0.5, D: -1, E: -1 };
  // a centred sliding mean (shorter at the ends)
  const slide = (v, w) => { const h = Math.floor(w / 2), c = [0]; v.forEach(x => c.push(c[c.length - 1] + x)); return v.map((_, i) => { const a = Math.max(0, i - h), b = Math.min(v.length, i + h + 1); return (c[b] - c[a]) / (b - a); }); };
  const AF_BINS = [[90, '#0053d6', 'very high (> 90)'], [70, '#65cbf3', 'confident (70–90)'], [50, '#ffdb13', 'low (50–70)'], [0, '#ff7d45', 'very low (< 50)']];
  const afColour = v => AF_BINS.find(([t]) => v > t || t === 0)[1];
  const IDR_C = { r1: '#9DB8C7', r2: '#E2B44C', r3: '#8E7CC3', r4: '#D64545', r5: '#2F6FD6' };
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } } };
  // the inputs that fill a role, by version (for the hovers' provenance)
  const roleVersion = role => Object.values(D.inputs || {}).filter(x => x.role === role).map(x => x.version).join('; ');

  // ---- the rows -------------------------------------------------------------------------------------------------
  const ROWS = [
    ['dom_backbone', 'Domains', 'on the backbone', `The site’s domains (${roleVersion('domains') || 'the domains input'}), drawn as boxes on the backbone`],
    ['dis_backbone', 'Disorder', 'on the backbone', `The site’s disordered regions (${roleVersion('disorder') || 'the disorder input'}): the backbone waves where a region is disordered`],
    ['uni_dom', 'UniProt domains', 'live', 'Domains, repeats and zinc fingers of the UniProt entry, read live'],
    ['regions', 'Regions', 'live', 'Regions and motifs of the UniProt entry (its “Disordered” regions are left out), read live'],
    ['composition', 'Composition', 'live', 'Compositional bias of the UniProt entry, read live'],
    ['idr', 'IDR charge', 'site', 'IDRs (disordered regions merged, 20 residues or more) coloured by their region of the Das–Pappu diagram of states (FCR and NCPR; CIDER)'],
    ['charge', 'Charge', 'sequence', 'Net charge along the chain: a 5-residue sliding mean on the EMBOSS charge scale (K, R +1; H +0.5; D, E −1), positive up (blue), negative down (red)'],
    ['hydropathy', 'Hydropathy', 'sequence', 'Hydropathy along the chain: a 9-residue sliding mean of the Kyte–Doolittle scale (J Mol Biol 157:105, 1982), hydrophobic up (amber), hydrophilic down (teal); the axis runs from −3 to +3'],
    ['aromatic', 'Aromatic', 'sequence', 'Aromatic residues (F, Y, W): the “stickers” of many disordered regions'],
    ['residues', `All ${W.residues}`, 'sequence', `Every ${W.residue.replace(/^an? /, '')} of the sequence: the ${W.marks} coloured, the others grey`],
    ['variants', 'Variants', 'live', 'Natural variants (ticks) and mutagenesis (diamonds) of the UniProt entry, read live; inked and labelled where they change a mark'],
    ['ptm', 'Other PTMs', 'live', 'Modified residues, cross-links, glycosylation and lipidation of the UniProt entry, read live, one row per kind'],
    ['plddt', 'AlphaFold', 'live', 'The AlphaFold DB model’s confidence (pLDDT) per residue, read live; drawn only where the model’s sequence is this one'],
  ];
  const DEFAULT_ON = ['dom_backbone', 'dis_backbone', 'regions', 'idr', 'charge', 'hydropathy', 'variants', 'ptm', 'plddt'];
  const M = {
    on: new Set(store.get('ptmc-map-rows', DEFAULT_ON)), order: store.get('ptmc-map-order', ROWS.map(r => r[0])),
    colour: store.get('ptmc-map-colour', Object.keys(SPECS).find(k => SPECS[k].colour) || 'single'), labels: store.get('ptmc-map-labels', 'auto'),
    zoom: null, items: [], rowsMenu: false, ctx: null,
  };
  const rowOrder = () => [...M.order.filter(id => ROWS.some(r => r[0] === id)), ...ROWS.map(r => r[0]).filter(id => !M.order.includes(id))];

  // ---- colours for the sites ------------------------------------------------------------------------------------
  function colourModes() {
    return [...Object.entries(SPECS).filter(([, s]) => s.colour).map(([k, s]) => [k, s.label]), ['single', 'Single colour']];
  }
  // the colour of an attribute's value: the site file's colours, or the palette in the order of its values
  function attrColour(name, v) {
    const s = SPECS[name] || {}, order = Object.keys(s.values || {}), first = String(v ?? '').split(s.separator || '; ')[0], k = order.indexOf(first);
    return (s.colours || {})[first] || (first === '' || /^(none|no)/i.test(first) ? NONE_C : PALETTE[(k >= 0 ? k : order.length) % PALETTE.length]);
  }
  function siteColour(mark) {
    const mode = M.colour; if (mode === 'single' || !SPECS[mode]) return { c: SINGLE_C, label: '' };
    const s = SPECS[mode], v = mark[3][attrIdx(mode)] ?? '';
    if (s.kind === 'number') { const n = +v; const ramp = [[5, '#1f2937', '5 or more'], [3, '#4b5563', '3–4'], [2, '#9ca3af', '2'], [0, '#d1d5db', '1']]; const b = ramp.find(([t]) => n >= t); return { c: b[1], label: b[2], key: b[2] }; }
    const first = String(v).split((s.separator || '; '))[0];
    return { c: attrColour(mode, first), label: K.sel?.valueLabel ? K.sel.valueLabel(mode, first) : first, key: first };
  }
  function legendFor(ctx) {
    const mode = M.colour;
    if (mode === 'single' || !SPECS[mode]) return [[SINGLE_C, `${W.marks[0].toUpperCase()}${W.marks.slice(1)}`]];
    const seen = new Map(); ctx.rec.marks.forEach(m => { const c = siteColour(m); if (!seen.has(c.label)) seen.set(c.label, c.c); });
    return [...seen.entries()].map(([l, c]) => [c, l]);
  }

  // ---- UniProt features, by kind ----------------------------------------------------------------------------------
  const fpos = f => [f.location?.start?.value, f.location?.end?.value];
  const evid = f => (f.evidences || []);
  const pubmed = f => [...new Set(evid(f).filter(e => e.source === 'PubMed').map(e => e.id))];
  const ecos = f => [...new Set(evid(f).map(e => e.evidenceCode))];
  const ECO = { 'ECO:0000269': 'experimental', 'ECO:0007744': 'large-scale experiment', 'ECO:0000250': 'by similarity', 'ECO:0000255': 'sequence analysis', 'ECO:0000305': 'curator inference', 'ECO:0000303': 'from a paper' };
  function featureProv(acc, f, full) {
    const pm = pubmed(f), ev = ecos(f).map(e => ECO[e] || e).join(', ');
    return `<br><span class="muted">UniProt ${esc(acc)} · ${esc(f.type)}${ev ? ' · ' + esc(ev) : ''}${pm.length ? ' · PubMed ' + (full ? pm.slice(0, 12).map(id => `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(id)}/">${esc(id)}</a>`).join(', ') : esc(pm.slice(0, 4).join(', ')) + (pm.length > 4 ? ` +${pm.length - 4}` : '')) : ''}</span>`;
  }
  function ptmKind(f) {
    const d = (f.description || '').toLowerCase();
    if (f.type === 'Cross-link') return /sumo/.test(d) ? 'SUMO' : /ubiquitin/.test(d) ? 'Ubiquitin' : 'Cross-link';
    if (f.type === 'Glycosylation') return 'Glycosylation';
    if (f.type === 'Lipidation') return 'Lipidation';
    if (/phospho/.test(d)) return 'Phospho';
    if (/acetyl|succinyl|crotonyl|malonyl|butyryl|lactoyl|glutaryl/.test(d)) return 'Lys acyl';
    if (/methyl/.test(d)) return 'Methyl';
    return 'Other PTM';
  }

  // ---- drawing --------------------------------------------------------------------------------------------------
  const Wd = 1000, LB = 104, X0 = 112, X1 = 988;
  function draw(ctx, ex) {
    const { p, rec, uni, af } = ctx, L = p.len, seq = rec.seq || '';
    const [za, zb] = M.zoom || [1, L], span = zb - za + 1;
    const X = pos => X0 + (pos - za + 0.5) / span * (X1 - X0), inView = (a, b) => b >= za && a <= zb;
    const css = v => (ex ? null : getComputedStyle(document.documentElement).getPropertyValue(v).trim());
    const INK = css('--ink') || '#111827', MUTED = css('--muted') || '#5f6f78', LINE = css('--line-strong') || '#c7d4d9', SURF = css('--surface') || '#ffffff';
    const items = []; const it = o => items.push(o) - 1;
    const parts = [], below = [];
    const sel = ctx.selected;                                   // positions of the selected marks, or null
    // the marks: stacked heads (a head moves up a level within 11 px of the one before it at that level)
    const marks = rec.marks.filter(m => inView(m[0], m[0])).sort((a, b) => a[0] - b[0]);
    const lastX = []; const level = new Map();
    marks.forEach(m => { const x = X(m[0]); let l = 0; while (l < 9 && lastX[l] != null && x - lastX[l] < 11) l++; lastX[l] = x; level.set(m[0], l); });
    const nLev = Math.max(1, ...[...level.values()].map(v => v + 1));
    // labels: Auto (3 lines, merged where they collide; none above 120 marks), All (12 lines), None
    const labels = [];
    const mode = M.labels, maxLines = mode === 'all' ? 12 : mode === 'auto' ? 3 : 0;
    if (maxLines && !(mode === 'auto' && marks.length > 120)) {
      const lineEnd = [];
      marks.forEach(m => {
        const txt = `${seq[m[0] - 1] || ''}${m[0]}`, w = K.tw(txt, 10.5) + 6, x = X(m[0]);
        let line = 0; while (line < maxLines && lineEnd[line] != null && x - w / 2 < lineEnd[line]) line++;
        if (line < maxLines) { lineEnd[line] = x + w / 2; labels.push({ x, line, base: txt, txt, pos: [m[0]], n: 1 }); }
        else {
          // no line free: the nearest label to the left takes it ("R213 +3"), and its line ends further right
          const prev = labels[labels.length - 1]; if (!prev) return;
          prev.pos.push(m[0]); prev.n++;
          prev.txt = prev.n === 2 ? `${prev.base}/${prev.pos[1]}` : `${prev.base} +${prev.n - 1}`;
          // a merged label grows to the right only: it starts where its first label started
          prev.left ??= prev.x - (K.tw(prev.base, 10.5) + 6) / 2;
          lineEnd[prev.line] = Math.max(lineEnd[prev.line], prev.left + K.tw(prev.txt, 10.5) + 6);
        }
      });
    }
    const nLines = labels.length ? Math.max(...labels.map(l => l.line)) + 1 : 0;
    const top = 8 + nLines * 13, headY = l => top + 8 + (nLev - 1 - l) * 11, yB = top + 8 + nLev * 11 + 14;
    // labels and their leaders
    labels.forEach(l => {
      const y = top - (l.line) * 13 - 2, hy = headY(level.get(l.pos[0])) - 5;
      parts.push(`<line x1="${l.x.toFixed(1)}" x2="${l.x.toFixed(1)}" y1="${(y + 2).toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${LINE}" stroke-width="0.7"/>`);
      parts.push(l.left != null ? `<text x="${(l.left + 3).toFixed(1)}" y="${y.toFixed(1)}" font-size="10.5" fill="${INK}">${esc(l.txt)}</text>`
        : `<text x="${l.x.toFixed(1)}" y="${y.toFixed(1)}" font-size="10.5" text-anchor="middle" fill="${INK}">${esc(l.txt)}</text>`);
    });
    // backbone: a bar where ordered, a wave where disordered (the site's disorder), the site's domains as boxes
    const dis = rec.units.filter(u => u[0] === 'disordered' && inView(u[1], u[2]));
    const idrs = rec.units.filter(u => u[0] === 'idr');
    parts.push(`<line x1="${X0}" x2="${X1}" y1="${yB}" y2="${yB}" stroke="${MUTED}" stroke-width="2"/>`);
    if (M.on.has('dis_backbone')) dis.forEach(([, s, e]) => {
      const a = X(Math.max(s, za) - 0.5), b = X(Math.min(e, zb) + 0.5); if (b - a < 2) return;
      parts.push(`<rect x="${a.toFixed(1)}" y="${yB - 2}" width="${(b - a).toFixed(1)}" height="4" fill="${SURF}"/>`);
      let d = `M${a.toFixed(1)},${yB}`, x = a, up = true;
      while (x < b) { const nx = Math.min(b, x + 5); d += ` Q${((x + nx) / 2).toFixed(1)},${up ? yB - 5 : yB + 5} ${nx.toFixed(1)},${yB}`; x = nx; up = !up; }
      const idr = idrs.find(([, is, ie]) => is <= e && ie >= s);
      const k = it({ tip: `<b>Disordered ${s}–${e}</b>${idr ? `<br>In the IDR ${idr[1]}–${idr[2]}${idr[3] ? ': ' + esc(idr[3]) : ''}` : '<br>Shorter than 20 aa, so in no IDR'}<br><span class="muted">${esc(roleVersion('disorder'))}</span>`, a: s, b: e });
      parts.push(`<path d="${d}" fill="none" stroke="${MUTED}" stroke-width="1.6" data-mi="${k}" pointer-events="stroke"/>`);
    });
    if (M.on.has('dom_backbone')) rec.units.filter(u => u[0] === 'domain' && inView(u[1], u[2])).forEach(([, s, e, lab, src]) => {
      const a = X(Math.max(s, za) - 0.5), b = X(Math.min(e, zb) + 0.5), w = Math.max(2, b - a);
      const from = (D.unit_sources || [])[src] || roleVersion('domains'), short = String(lab || '').split(' · ')[0];
      const k = it({ tip: `<b>${esc(lab || 'Domain')}</b><br>${s}–${e}<br><span class="muted">${esc(from)}</span>`, a: s, b: e });
      parts.push(`<rect x="${a.toFixed(1)}" y="${yB - 8}" width="${w.toFixed(1)}" height="16" rx="4" fill="#D6ECF0" stroke="#0E7490" stroke-width="1" data-mi="${k}"/>`);
      if (short && K.tw(short, 10) + 8 < w) parts.push(`<text x="${((a + b) / 2).toFixed(1)}" y="${yB + 3.5}" font-size="10" text-anchor="middle" fill="#0F3B47" pointer-events="none">${esc(short)}</text>`);
    });
    // sticks and heads
    marks.forEach(m => {
      const x = X(m[0]).toFixed(1), y = headY(level.get(m[0])), c = siteColour(m), faded = sel && !sel.has(m[0]), on = ctx.site === m[0];
      parts.push(`<line x1="${x}" x2="${x}" y1="${yB - 3}" y2="${(y + 5).toFixed(1)}" stroke="${LINE}" stroke-width="1"${faded ? ' opacity="0.28"' : ''}/>`);
      parts.push(`<circle cx="${x}" cy="${y.toFixed(1)}" r="${on ? 6.5 : 5}" fill="${c.c}" stroke="${on ? INK : SURF}" stroke-width="${on ? 2 : 1}"${faded ? ' opacity="0.28"' : ''}${ex ? '' : ` data-msite="${m[0]}"`}/>`);
    });
    // the position axis
    const step = [5, 10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(s => span / s <= 10) || 10000;
    for (let t = Math.ceil(za / step) * step; t <= zb; t += step) {
      const x = X(Math.max(t, 1)).toFixed(1);
      parts.push(`<line x1="${x}" x2="${x}" y1="${yB + 12}" y2="${yB + 16}" stroke="${MUTED}"/><text x="${x}" y="${yB + 27}" font-size="10" text-anchor="middle" fill="${MUTED}">${Math.max(t, 1)}</text>`);
    }
    if (za === 1) parts.push(`<text x="${X(1).toFixed(1)}" y="${yB + 27}" font-size="10" text-anchor="middle" fill="${MUTED}">1</text>`);
    // the rows
    let y = yB + 40;
    const rowLabel = (lab, h, help) => parts.push(`<text x="${LB}" y="${(y + h / 2 + 3.5).toFixed(1)}" font-size="10.5" text-anchor="end" fill="${MUTED}"${ex ? '' : ` data-rowhelp="${esc(help)}"`}>${esc(lab)}</text>`);
    const lanes = (feats, maxLanes = 3) => { const ends = []; return feats.map(f => { const [a] = fpos(f); let l = 0; while (l < maxLanes - 1 && ends[l] != null && a <= ends[l] + 1) l++; ends[l] = Math.max(ends[l] || 0, fpos(f)[1]); return l; }); };
    const boxes = (feats, fill, stroke, labelOf, tipOf) => {
      const ls = lanes(feats), nl = Math.max(1, ...ls.map(l => l + 1)), h = nl * 15;
      feats.forEach((f, i) => {
        const [s, e] = fpos(f); if (!inView(s, e)) return;
        const a = X(Math.max(s, za) - 0.5), b = X(Math.min(e, zb) + 0.5), w = Math.max(2, b - a), yy = y + ls[i] * 15;
        const k = it({ tip: tipOf(f, false), card: tipOf(f, true), a: s, b: e });
        parts.push(`<rect x="${a.toFixed(1)}" y="${yy}" width="${w.toFixed(1)}" height="12" rx="3" fill="${fill(f)}" stroke="${stroke(f)}" stroke-width="0.8" data-mi="${k}"/>`);
        const t = labelOf(f); if (t && K.tw(t, 9.5) + 6 < w) parts.push(`<text x="${((a + b) / 2).toFixed(1)}" y="${yy + 9}" font-size="9.5" text-anchor="middle" fill="#1f2937" pointer-events="none">${esc(t)}</text>`);
      });
      return h;
    };
    const live = (row, ok) => { if (!uni) { rowLabel(row[1], 14, row[3]); parts.push(`<text x="${X0}" y="${y + 10}" font-size="10" fill="${MUTED}">${ctx.uniFailed ? 'UniProt did not answer' : 'asking UniProt…'}</text>`); y += 22; return false; } return ok; };
    const feats = types => (uni?.features || []).filter(f => types.includes(f.type));
    const atMark = new Set(rec.marks.map(m => m[0]));
    for (const id of rowOrder()) {
      if (!M.on.has(id) || id.endsWith('_backbone')) continue;
      const row = ROWS.find(r => r[0] === id);
      if (id === 'uni_dom') { if (!live(row, true)) continue; const fs = feats(['Domain', 'Repeat', 'Zinc finger']); if (!fs.length) continue; const h = boxes(fs, f => (f.type === 'Repeat' ? '#DCEEF3' : '#B9DDE6'), () => '#5B97A6', f => f.description, (f, full) => `<b>${esc(f.type)}</b> ${esc(f.description || '')}<br>${fpos(f).join('–')}` + featureProv(p.acc, f, full)); rowLabel(row[1], h, row[3]); y += h + 8; }
      else if (id === 'regions') { if (!live(row, true)) continue; const fs = feats(['Region', 'Motif']).filter(f => !/^disordered$/i.test(f.description || '')); if (!fs.length) continue; const h = boxes(fs, f => (f.type === 'Motif' ? '#FFFFFF' : '#E3ECF6'), f => (f.type === 'Motif' ? '#334155' : '#8FA5BF'), f => f.description, (f, full) => `<b>${esc(f.type)}</b> ${esc(f.description || '')}<br>${fpos(f).join('–')}` + featureProv(p.acc, f, full)); rowLabel(row[1], h, row[3]); y += h + 8; }
      else if (id === 'composition') { if (!live(row, true)) continue; const fs = feats(['Compositional bias']); if (!fs.length) continue; const h = boxes(fs, () => '#FDE3D4', () => '#D9A486', f => f.description, (f, full) => `<b>Compositional bias</b> ${esc(f.description || '')}<br>${fpos(f).join('–')}` + featureProv(p.acc, f, full)); rowLabel(row[1], h, row[3]); y += h + 8; }
      else if (id === 'idr') {
        if (!idrs.length) continue;
        idrs.filter(u => inView(u[1], u[2])).forEach(([, s, e, lab]) => {
          const cls = /^Weakly/.test(lab) ? 'r1' : /^Janus/.test(lab) ? 'r2' : /^Strong poly/.test(lab) ? 'r3' : /^Negatively/.test(lab) ? 'r4' : /^Positively/.test(lab) ? 'r5' : '';
          const a = X(Math.max(s, za) - 0.5), b = X(Math.min(e, zb) + 0.5);
          const k = it({ tip: `<b>IDR ${s}–${e}</b>${lab ? '<br>' + esc(lab) : ''}<br><span class="muted">${esc(roleVersion('disorder'))}, regions merged, 20 aa or more; charge as CIDER defines it (Das &amp; Pappu 2013)</span>`, a: s, b: e });
          parts.push(`<rect x="${a.toFixed(1)}" y="${y}" width="${Math.max(2, b - a).toFixed(1)}" height="12" rx="3" fill="${IDR_C[cls] || '#cbd5e1'}" data-mi="${k}"/>`);
        });
        rowLabel(row[1], 12, row[3]); y += 20;
      } else if ((id === 'charge' || id === 'hydropathy') && seq) {
        const h = 34, mid = y + h / 2, isC = id === 'charge', scale = isC ? 1 : 3;
        const sm = isC ? (ctx.charge ||= slide([...seq].map(c => CHARGE[c] || 0), 5)) : (ctx.hydro ||= slide([...seq].map(c => KD[c] ?? 0), 9));
        let up = `M${X(za).toFixed(1)},${mid}`, dn = up;
        for (let i = za; i <= zb; i++) { const c = Math.max(-scale, Math.min(scale, sm[i - 1])) / scale, xx = X(i).toFixed(1); up += ` L${xx},${(mid - Math.max(0, c) * h / 2).toFixed(1)}`; dn += ` L${xx},${(mid - Math.min(0, c) * h / 2).toFixed(1)}`; }
        up += ` L${X(zb).toFixed(1)},${mid} Z`; dn += ` L${X(zb).toFixed(1)},${mid} Z`;
        parts.push(`<line x1="${X0}" x2="${X1}" y1="${mid}" y2="${mid}" stroke="${LINE}" stroke-width="0.6"/><path d="${up}" fill="${isC ? '#2F6FD6' : '#B7791F'}" opacity="0.75"/><path d="${dn}" fill="${isC ? '#D64545' : '#3B82A0'}" opacity="0.75"/>`);
        parts.push(`<text x="${X1 + 2}" y="${y + 5}" font-size="8.5" fill="${MUTED}">+${scale}</text><text x="${X1 + 2}" y="${y + h}" font-size="8.5" fill="${MUTED}">−${scale}</text>`);
        rowLabel(row[1], h, row[3]); y += h + 8;
      } else if (id === 'aromatic' && seq) {
        for (let i = za; i <= zb; i++) if ('FYW'.includes(seq[i - 1])) { const xx = X(i).toFixed(1); parts.push(`<line x1="${xx}" x2="${xx}" y1="${y + (seq[i - 1] === 'W' ? 0 : 2)}" y2="${y + 12}" stroke="${seq[i - 1] === 'Y' ? '#7C3AED' : seq[i - 1] === 'F' ? '#0E7490' : '#B45309'}" stroke-width="1"/>`); }
        rowLabel(row[1], 12, `${row[3]}. F teal, Y violet, W amber`); y += 20;
      } else if (id === 'residues' && seq) {
        const res = new Set(D.residues || []);
        for (let i = za; i <= zb; i++) if (res.has(seq[i - 1])) { const xx = X(i).toFixed(1), m = atMark.has(i); parts.push(`<line x1="${xx}" x2="${xx}" y1="${y + (m ? 0 : 3)}" y2="${y + 12}" stroke="${m ? siteColour(rec.marks.find(q => q[0] === i)).c : '#B8C2C8'}" stroke-width="${m ? 1.6 : 0.8}"/>`); }
        rowLabel(row[1], 12, row[3]); y += 20;
      } else if (id === 'variants') {
        if (!live(row, true)) continue;
        const fs = feats(['Natural variant', 'Mutagenesis']).filter(f => inView(...fpos(f))); if (!fs.length) continue;
        let labEnd = -1e9;
        fs.sort((a, b) => fpos(a)[0] - fpos(b)[0]).forEach(f => {
          const [s, e] = fpos(f), xx = X(s).toFixed(1), at = s === e && atMark.has(s);
          const alt = f.alternativeSequence ? `${f.alternativeSequence.originalSequence || ''}${s}${(f.alternativeSequence.alternativeSequences || []).join('/')}` : `${s}`;
          const snp = (f.featureCrossReferences || []).filter(x => x.database === 'dbSNP').map(x => x.id);
          const tip = full => `<b>${esc(f.type)} ${esc(alt)}</b>${at ? ` · at a ${esc(W.mark)}` : ''}<br>${esc(f.description || '')}${snp.length ? '<br>dbSNP ' + (full ? snp.map(id => `<a href="https://www.ncbi.nlm.nih.gov/snp/${esc(id)}">${esc(id)}</a>`).join(', ') : esc(snp.join(', '))) : ''}` + featureProv(p.acc, f, full);
          const k = it({ tip: tip(false), card: tip(true), a: s, b: e });
          const col = at ? INK : '#94A3B8';
          if (f.type === 'Mutagenesis') parts.push(`<path d="M${xx},${y} l4,6 l-4,6 l-4,-6 Z" fill="${col}" data-mi="${k}"/>`);
          else parts.push(`<line x1="${xx}" x2="${xx}" y1="${y}" y2="${y + 12}" stroke="${col}" stroke-width="${at ? 2 : 1.2}" data-mi="${k}"/>`);
          const lw = K.tw(alt, 9) + 4;
          if (at && +xx - lw / 2 > labEnd) { parts.push(`<text x="${xx}" y="${y + 23}" font-size="9" text-anchor="middle" fill="${INK}">${esc(alt)}</text>`); labEnd = +xx + lw / 2; }
        });
        rowLabel(row[1], 12, row[3]); y += fs.some(f => fpos(f)[0] === fpos(f)[1] && atMark.has(fpos(f)[0])) ? 30 : 20;
      } else if (id === 'ptm') {
        if (!live(row, true)) continue;
        const fs = feats(['Modified residue', 'Cross-link', 'Glycosylation', 'Lipidation']).filter(f => inView(...fpos(f))); if (!fs.length) continue;
        const kinds = [...new Set(fs.map(ptmKind))];
        kinds.forEach(kind => {
          fs.filter(f => ptmKind(f) === kind).forEach(f => {
            const [s] = fpos(f), xx = X(s).toFixed(1), at = atMark.has(s);
            const tip = full => `<b>${esc(f.description || f.type)}</b> ${esc((seq[s - 1] || '') + s)}${at ? ` · at a ${esc(W.mark)}` : ''}` + featureProv(p.acc, f, full);
            const k = it({ tip: tip(false), card: tip(true), a: s, b: s });
            parts.push(`<rect x="${(+xx - 1.2).toFixed(1)}" y="${y}" width="2.4" height="11" fill="${at ? INK : '#7C8A93'}" data-mi="${k}"/>`);
          });
          rowLabel(kind, 11, `${row[3]}. This row: ${kind}`); y += 17;
        });
        y += 4;
      } else if (id === 'plddt') {
        if (!af) { rowLabel(row[1], 10, row[3]); parts.push(`<text x="${X0}" y="${y + 9}" font-size="10" fill="${MUTED}">${ctx.afFailed ? 'AlphaFold DB did not answer' : ctx.afNone ? 'No model' : 'asking AlphaFold DB…'}</text>`); y += 20; continue; }
        const pl = af.plddt;
        if (!pl || pl.length !== L) { rowLabel(row[1], 10, row[3]); parts.push(`<text x="${X0}" y="${y + 9}" font-size="10" fill="${MUTED}">The model’s sequence differs from this one: not drawn</text>`); y += 20; continue; }
        let run = za;
        for (let i = za + 1; i <= zb + 1; i++) {
          if (i <= zb && afColour(pl[i - 1]) === afColour(pl[run - 1])) continue;
          parts.push(`<rect x="${X(run - 0.5).toFixed(2)}" y="${y}" width="${(X(i - 0.5) - X(run - 0.5) + 0.3).toFixed(2)}" height="10" fill="${afColour(pl[run - 1])}"/>`);
          run = i;
        }
        rowLabel(`${row[1]} v${af.version}`, 10, `${row[3]}. Bands: ${AF_BINS.map(b => b[2]).join(', ')}`); y += 18;
      }
    }
    if (!ex) parts.push(`<line id="map-cross" x1="0" x2="0" y1="0" y2="${y}" stroke="${INK}" stroke-width="0.6" stroke-dasharray="2 2" visibility="hidden" pointer-events="none"/><rect id="map-drag" x="0" y="0" width="0" height="${y}" fill="${INK}" opacity="0.08" visibility="hidden" pointer-events="none"/>`);
    M.items = items;
    return { svg: parts.join(''), H: y + 4, X, za, zb };
  }

  // ---- on the page --------------------------------------------------------------------------------------------------
  function controls(ctx) {
    const modes = colourModes();
    return `<div class="map-ctl"><label>Colour ${esc(W.marks)} by <select data-map-colour>${modes.map(([k, l]) => `<option value="${esc(k)}"${M.colour === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` +
      `<span class="lbl">Labels <span class="seg">${[['auto', 'Auto'], ['all', 'All'], ['none', 'None']].map(([k, l]) => `<button type="button" data-map-labels="${k}" aria-pressed="${M.labels === k}">${l}</button>`).join('')}</span></span>` +
      `<span class="rows-wrap"><button type="button" class="btn small" data-map-rows aria-expanded="${M.rowsMenu}">Rows ▾</button>${M.rowsMenu ? rowsMenu() : ''}</span>` +
      (M.zoom ? `<button type="button" class="btn small" data-map-unzoom>Reset zoom (${int(M.zoom[0])}–${int(M.zoom[1])})</button>` : `<span class="muted small">Drag across the map to zoom</span>`) + '</div>' +
      `<div class="map-legend">${legendFor(ctx).map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`;
  }
  function rowsMenu() {
    return `<div class="rows-menu" role="menu"><p class="flabel">On the backbone</p>` + ROWS.filter(r => r[0].endsWith('_backbone')).map(r => `<label><input type="checkbox" data-map-row="${r[0]}"${M.on.has(r[0]) ? ' checked' : ''}> ${esc(r[1])}</label>`).join('') +
      `<p class="flabel">Rows, top to bottom</p>` + rowOrder().filter(id => !id.endsWith('_backbone')).map(id => { const r = ROWS.find(x => x[0] === id); return `<div class="rm-row"><label title="${esc(r[3])}"><input type="checkbox" data-map-row="${id}"${M.on.has(id) ? ' checked' : ''}> ${esc(r[1])} <span class="muted">${esc(r[2])}</span></label><span><button type="button" data-map-move="${id}" data-d="-1" aria-label="Up">↑</button><button type="button" data-map-move="${id}" data-d="1" aria-label="Down">↓</button></span></div>`; }).join('') +
      `<p><button type="button" class="linkish" data-map-defaults>Default rows</button></p></div>`;
  }
  function render(el, ctx) {
    M.ctx = ctx; if (!el) return;
    const m = draw(ctx, false);
    el.innerHTML = controls(ctx) + `<div class="map-svg"><svg viewBox="0 0 ${Wd} ${m.H}" role="img" aria-label="Map of ${esc(ctx.p.gene || ctx.p.acc)}">${m.svg}</svg></div>` +
      `<p class="map-read muted" id="map-read">Hover the map for the residue under the pointer; click an item to pin it here with its links.</p><div id="map-pin" class="map-pin" hidden></div>`;
    M.geom = m;
    const svg = el.querySelector('svg'), cross = el.querySelector('#map-cross'), drag = el.querySelector('#map-drag');
    const toPos = ev => { const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * Wd; if (x < X0 || x > X1) return null; return Math.max(1, Math.min(ctx.p.len, Math.round(m.za - 0.5 + (x - X0) / (X1 - X0) * (m.zb - m.za + 1)))); };
    let d0 = null;
    svg.addEventListener('mousemove', ev => {
      const pos = toPos(ev); if (pos == null) { cross.setAttribute('visibility', 'hidden'); return; }
      const x = m.X(pos).toFixed(1); cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      document.getElementById('map-read').innerHTML = readout(ctx, pos);
      if (d0 != null) { const a = Math.min(m.X(d0), m.X(pos)), b = Math.max(m.X(d0), m.X(pos)); drag.setAttribute('x', a.toFixed(1)); drag.setAttribute('width', (b - a).toFixed(1)); drag.setAttribute('visibility', 'visible'); }
    });
    svg.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); });
    svg.addEventListener('mousedown', ev => { if (ev.target.closest('[data-mi],[data-msite]')) return; d0 = toPos(ev); ev.preventDefault(); });
    addEventListener('mouseup', function up(ev) {
      removeEventListener('mouseup', up);
      if (d0 == null) return; const p1 = toPos(ev) ?? d0, a = Math.min(d0, p1), b = Math.max(d0, p1); d0 = null;
      if (b - a + 1 >= 8) { M.zoom = [a, b]; render(el, ctx); } else drag.setAttribute('visibility', 'hidden');
    });
  }
  // the residue under the pointer: what the map knows about it
  function readout(ctx, pos) {
    const { rec, uni, af } = ctx, aa = (rec.seq || '')[pos - 1] || '';
    const out = [`<b>${esc(aa)}${pos}</b>`];
    const mk = rec.marks.find(m => m[0] === pos);
    if (mk) { const c = siteColour(mk); out.push(`${esc(W.mark)}${c.label ? ' (' + esc(c.label) + ')' : ''}`); }
    rec.units.filter(u => u[0] === 'domain' && u[1] <= pos && u[2] >= pos).forEach(u => out.push(esc(String(u[3]).split(' · ')[0] || 'domain')));
    const idr = rec.units.find(u => u[0] === 'idr' && u[1] <= pos && u[2] >= pos);
    if (idr) out.push(`IDR ${idr[1]}–${idr[2]}${idr[3] ? ' (' + esc(String(idr[3]).split(':')[0]) + ')' : ''}`);
    (uni?.features || []).filter(f => ['Region', 'Motif', 'Compositional bias'].includes(f.type) && fpos(f)[0] <= pos && fpos(f)[1] >= pos && !/^disordered$/i.test(f.description || '')).slice(0, 3).forEach(f => out.push(esc(f.description)));
    (uni?.features || []).filter(f => ['Modified residue', 'Cross-link'].includes(f.type) && fpos(f)[0] === pos).forEach(f => out.push(esc(f.description)));
    if (ctx.charge) out.push(`charge ${ctx.charge[pos - 1] >= 0 ? '+' : ''}${ctx.charge[pos - 1].toFixed(2)} (5-aa mean)`);
    if (ctx.hydro) out.push(`hydropathy ${ctx.hydro[pos - 1] >= 0 ? '+' : ''}${ctx.hydro[pos - 1].toFixed(2)} (9-aa mean)`);
    if (af?.plddt && af.plddt.length === ctx.p.len) out.push(`pLDDT ${Number(af.plddt[pos - 1]).toFixed(1)}`);
    return out.join(' · ');
  }
  // ---- the map as a figure (PDF, SVG, PNG), in light colours ----------------------------------------------------
  function figure(ctx) {
    const m = draw(ctx, true), p = ctx.p;
    const legend = legendFor(ctx).map(([c, l]) => [c, c, l]);
    return K.figureFrame({ title: `${p.gene || p.acc}: ${p.name}`, sub: `${p.acc} · ${int(p.len)} aa · ${int(ctx.rec.marks.length)} ${W.marks}${M.zoom ? ` · showing ${M.zoom[0]}–${M.zoom[1]}` : ''}; rows: ${rowOrder().filter(id => M.on.has(id)).map(id => ROWS.find(r => r[0] === id)[1]).join(', ')}`,
      legend, body: m.svg, bodyH: m.H, W: Wd, note: `Sources: the site’s inputs (${[roleVersion('domains'), roleVersion('disorder')].filter(Boolean).join('; ')}); UniProt ${p.acc}, read live${ctx.af ? `; AlphaFold DB model v${ctx.af.version}` : ''}.`, extra: { protein: p.acc } });
  }

  // ---- events ------------------------------------------------------------------------------------------------------
  const redraw = () => { const el = document.getElementById('pmap'); if (el && M.ctx) render(el, M.ctx); };
  const saveRows = () => { store.set('ptmc-map-rows', [...M.on]); store.set('ptmc-map-order', rowOrder()); };
  K.clicks.push(
    ['[data-map-labels]', el => { M.labels = el.dataset.mapLabels; store.set('ptmc-map-labels', M.labels); redraw(); }],
    ['[data-map-rows]', () => { M.rowsMenu = !M.rowsMenu; redraw(); }],
    ['[data-map-row]', el => { const id = el.dataset.mapRow; if (el.checked) M.on.add(id); else M.on.delete(id); saveRows(); redraw(); }],
    ['[data-map-move]', el => { const o = rowOrder(), i = o.indexOf(el.dataset.mapMove), j = i + +el.dataset.d; if (j >= 0 && j < o.length) { [o[i], o[j]] = [o[j], o[i]]; M.order = o; saveRows(); redraw(); } }],
    ['[data-map-defaults]', () => { M.on = new Set(DEFAULT_ON); M.order = ROWS.map(r => r[0]); saveRows(); redraw(); }],
    ['[data-map-unzoom]', () => { M.zoom = null; redraw(); }],
    ['[data-mi]', el => { const x = M.items[+el.dataset.mi]; const pin = document.getElementById('map-pin'); if (x && pin) { pin.hidden = false; pin.innerHTML = `<button type="button" class="pin-x" data-pin-close aria-label="Close">×</button>${x.card || x.tip}`; } }],
    ['[data-pin-close]', () => { const pin = document.getElementById('map-pin'); if (pin) pin.hidden = true; }],
  );
  document.addEventListener('change', e => { if (e.target.dataset?.mapColour != null) { M.colour = e.target.value; store.set('ptmc-map-colour', M.colour); redraw(); } });
  K.tips.push(['[data-mi]', el => M.items[+el.dataset.mi]?.tip || ''], ['[data-rowhelp]', el => esc(el.dataset.rowhelp)]);
  K.map = { render, figure, siteColour, attrColour, reset: () => { M.zoom = null; M.rowsMenu = false; }, state: M };
});
