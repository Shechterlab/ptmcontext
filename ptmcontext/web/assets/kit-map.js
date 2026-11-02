/* The protein map, as the Methylarginine Site Explorer draws it: the marks as stacked lollipops over a backbone (a bar
   for ordered stretches, a wave for disordered ones, the site's domains as boxes), and rows under it, each from a named
   source:
     the site's own data   domains and disordered regions (the site's inputs), IDRs with their charge, candidate
                           residues, the charge along the chain (computed from the sequence), and the site file's own
                           rows (website.protein.map.rows): evidence along the protein read from its tables in the
                           map-row format (CONTRACTS.md, Map rows: a residue list, a region list, a per-site count), and
                           runs of a motif found in the sequence. The kit knows none of them by name: their words,
                           classes, marks and colours are the site file's, and a row a protein has no data for is absent
     UniProt, live         its domains and repeats, regions and motifs, compositional bias, natural variants,
                           mutagenesis, modified residues and cross-links
     PDBe-KB, live         residues at RNA, DNA, protein and self interfaces in PDB structures, with the entries
     AlphaFold DB, live    the model's confidence (pLDDT)
   Every item has a hover that says what it is and where it comes from, and a click that pins it under the map with
   its links (UniProt entry, PubMed, dbSNP, the papers of a row's sources, PDB entries and "3D" when a viewer is on
   the page: K.show3d). A crosshair reads out the residue under the pointer. Marks are coloured by any attribute the
   site file offers, or by a mode the site file makes from the attributes (website.protein.map.colour_by; a class may
   be hollow, and marks the site file names are hatched); the marks the site shows and counts nowhere (rec.shown,
   kit-shown.js) are hatched ticks on the backbone, each with its tag's hover; the marks' labels are placed Auto (merged where they collide), All
   or None. Rows are chosen and ordered in the Rows menu (remembered in this browser); a drag across the map zooms in, a
   double click zooms out. A narrow box gets the map laid out again at its width. The same drawing, in light colours,
   is the map's PDF, SVG and PNG, at screen size or a journal column (85, 114, 174 mm; PNG at 300, 600 or 1000 dpi).
   A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int, cap } = K;
  const SPECS = D.attribute_specs || {};
  const AT = D.mark_attributes || [];                       // the order of a mark's attribute values
  const attrIdx = name => AT.indexOf(name);
  const CFG = (D.protein_view || {}).map || {};             // the site file's website.protein.map
  const OWN_ROWS = (CFG.rows || []).filter(r => r && r.id);
  const ROW_INDEX = D.map_rows || [];                       // the rows' ids, as the items name them
  const SOURCES = CFG.sources || {};
  const PALETTE = ['#2A78D6', '#EB6834', '#1BAF7A', '#A23B12', '#7C3AED', '#0891B2', '#B45309', '#BE185D'];
  // Kyte & Doolittle (1982), and the EMBOSS charge scale
  const KD = { A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5, Q: -3.5, E: -3.5, G: -0.4, H: -3.2, I: 4.5, L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6, S: -0.8, T: -0.7, W: -0.9, Y: -1.3, V: 4.2 };
  const CHARGE = { K: 1, R: 1, H: 0.5, D: -1, E: -1 };
  // a centred sliding mean (shorter at the ends)
  const slide = (v, w) => { const h = Math.floor(w / 2), c = [0]; v.forEach(x => c.push(c[c.length - 1] + x)); return v.map((_, i) => { const a = Math.max(0, i - h), b = Math.min(v.length, i + h + 1); return (c[b] - c[a]) / (b - a); }); };
  const AF_BINS = [[90, '#0053d6', 'very high (> 90)'], [70, '#65cbf3', 'confident (70–90)'], [50, '#ffdb13', 'low (50–70)'], [0, '#ff7d45', 'very low (< 50)']];
  const afColour = v => AF_BINS.find(([t]) => v > t || t === 0)[1];
  // the theme's colours for what the kit draws itself; exports are always light
  const TOK = {
    light: { dom: '#D6ECF0', domEdge: '#0E7490', domInk: '#0F3B47', uniDom: '#B9DDE6', uniRep: '#DCEEF3', uniEdge: '#5B97A6', region: '#E3ECF6', regionEdge: '#8FA5BF',
      motif: '#FFFFFF', motifEdge: '#334155', bias: '#FDE3D4', biasEdge: '#D9A486', boxInk: '#1F2937', variant: '#8A99A3', ptm: '#7C8A93', own: '#E07B39', rtick: '#B8C2C8',
      rna: '#7B4FBF', dna: '#B7791F', protein: '#0E7490', self: '#7FA9B6', chargeP: '#2F6FD6', chargeN: '#D64545', hydroP: '#B7791F', hydroN: '#3B82A0',
      none: '#A3AEB3', single: '#B42318', aro: { F: '#0E7490', Y: '#7C3AED', W: '#B45309' } },
    dark: { dom: '#1F5566', domEdge: '#4E9DB3', domInk: '#E3F4F8', uniDom: '#1F5566', uniRep: '#183F4B', uniEdge: '#4E9DB3', region: '#213847', regionEdge: '#4F6F8A',
      motif: '#142229', motifEdge: '#93A8B0', bias: '#4A2A1C', biasEdge: '#8C5B42', boxInk: '#E8EFF2', variant: '#7E8E95', ptm: '#8FA3AB', own: '#F0A070', rtick: '#4A5F68',
      rna: '#A98BE0', dna: '#D9A548', protein: '#3FB5CF', self: '#6E98A5', chargeP: '#5B8FE0', chargeN: '#E06A6A', hydroP: '#D9A548', hydroN: '#5BA3C0',
      none: '#6D7D84', single: '#E0708A', aro: { F: '#3FB5CF', Y: '#A98BE0', W: '#D9A548' } },
  };
  const isDark = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches); };
  function pal(ex) {
    const css = v => (ex ? '' : getComputedStyle(document.documentElement).getPropertyValue(v).trim());
    const dark = !ex && isDark();
    return { ...TOK[dark ? 'dark' : 'light'], dark, ink: css('--ink') || '#111827', muted: css('--muted') || '#5f6f78', line: css('--line-strong') || '#c7d4d9',
      faint: css('--line') || '#e0e8eb', surf: css('--surface') || '#ffffff', accent: css('--accent') || '#c2410c' };
  }
  // a colour the site file gives (with its dark-theme twin); 'ink' is the text colour
  const cfgColour = (o, key, P, dflt) => { const v = (P.dark && o?.[key + '_dark']) || o?.[key] || dflt; return v === 'ink' ? P.ink : v; };
  // the regions the run's layers draw (tracks.json): each kind is a row, or the backbone's boxes or wave; the map knows
  // no layer by name. A row of segments is coloured by the classes of the analysis that drew it, if it has any.
  const TRACKS = D.tracks || [];
  // not the charge row's red and blue, nor AlphaFold's bands: a track that means them says so with its own colours
  const SEG_PAL = ['#9DB8C7', '#E2B44C', '#8E7CC3', '#1BAF7A', '#B45309', '#BE185D', '#7C8A93', '#0E7490'], SEG_PLAIN = '#9DB8C7';
  const trackRow = t => (t.style === 'segments' ? 'tr:' : 'bb:') + t.kind;
  const kindsOf = style => new Set(TRACKS.filter(t => t.style === style).map(t => t.kind));
  const trackOf = kind => TRACKS.find(t => t.kind === kind) || { kind, title: kind, roles: [] };
  // a track's classes: its question's labels, or the classes its own units carry (a file's class column)
  const segLabels = t => (t.analysis ? (K.A[t.analysis] || {}).labels || {} : Object.fromEntries((t.classes || []).map(c => [c, c])));
  const segColour = (t, cls) => (t.colours || {})[cls] || (!cls ? SEG_PLAIN : (k => (k >= 0 ? SEG_PAL[k % SEG_PAL.length] : '#cbd5e1'))(Object.keys(segLabels(t)).indexOf(cls)));
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } } };
  // the inputs that fill a role, by version (for the hovers' provenance)
  const rolesOf = x => x.roles || (x.role ? [x.role] : []);
  const roleVersion = role => Object.values(D.inputs || {}).filter(x => rolesOf(x).includes(role)).map(x => x.version).join('; ');
  // a source's short name for a link: its version's words before a date or number, else its record's host
  const sourceName = x => (String(x.version || '').match(/^[^\d(]+/) || [''])[0].trim() || (() => { try { return new URL(x.record).host; } catch (e) { return 'source'; } })();
  const tracksVersion = t => [...new Set((t.roles || []).map(roleVersion).filter(Boolean))].join('; ');
  // the source's own page for this protein (a manifest entry's record), for each input of a track's roles
  const recordLinks = (t, acc) => Object.values(D.inputs || {}).filter(x => (t.roles || []).some(r => rolesOf(x).includes(r)) && x.record)
    .map(x => `<a href="${esc(x.record.replace('{acc}', encodeURIComponent(acc)))}">${esc(sourceName(x))} ${esc(acc)}</a>`).join(' · ');
  // where a site row's items come from: the versions of the inputs it reads (the marks table is the site's own)
  const ownTables = r => (Array.isArray(r.from) ? r.from : r.from ? [r.from] : []);
  const ownVersion = r => [...new Set(ownTables(r).map(f => (f.role ? roleVersion(f.role) : (Object.values(D.inputs || {}).find(x => x.use && x.use === W.marks) || {}).version || '')).filter(Boolean))].join('; ');
  const fmtNum = v => (Number.isInteger(v) ? int(v) : Number(v).toPrecision(3).replace(/\.?0+$/, ''));

  // ---- the rows -------------------------------------------------------------------------------------------------
  const trackHelp = t => `${t.help || t.title}${tracksVersion(t) ? ` (${tracksVersion(t)})` : ''}`;
  const PDB_ON = CFG.pdb_contacts !== false;
  const BUILT = [
    ['uni_dom', 'UniProt domains', 'live', 'Domains, repeats and zinc fingers of the UniProt entry, read live'],
    ['regions', 'Regions', 'live', 'Regions and motifs (outlined) of the UniProt entry (its “Disordered” regions are left out), read live'],
    ['composition', 'Composition', 'live', 'Compositional bias of the UniProt entry, read live'],
    ...TRACKS.filter(t => t.style === 'segments').map(t => [trackRow(t), t.title, 'site', trackHelp(t)]),
    ['charge', 'Charge', 'sequence', 'Net charge along the chain: a 5-residue sliding mean on the EMBOSS charge scale (K, R +1; H +0.5; D, E −1), positive up (blue), negative down (red)'],
    ['hydropathy', 'Hydropathy', 'sequence', 'Hydropathy along the chain: a 9-residue sliding mean of the Kyte–Doolittle scale (J Mol Biol 157:105, 1982), hydrophobic up (amber), hydrophilic down (teal); the axis runs from −3 to +3'],
    ['aromatic', 'Aromatic', 'sequence', 'Aromatic residues (F, Y, W): the “stickers” of many disordered regions'],
    ['residues', `All ${W.residues}`, 'sequence', `Every ${W.residue.replace(/^an? /, '')} of the sequence: the ${W.marks} in their colour, the others grey`],
    ['uni_mark', `${cap(W.marks)} in UniProt`, 'live', `The ${W.marks} as UniProt reports them (Modified residue features named in the mark’s profile), inked where this site has the ${W.mark} too`],
    ['variants', 'Variants', 'live', `Natural variants of the UniProt entry, read live; inked and labelled where they change a ${W.mark}`],
    ['mutagen', 'Mutagenesis', 'live', `Mutagenesis features of the UniProt entry (diamonds), read live; inked and labelled where they change a ${W.mark}`],
    ['ptm', 'Other PTMs', 'live', 'Modified residues, cross-links, glycosylation and lipidation of the UniProt entry, read live, one row per kind'],
    ...(PDB_ON ? [['pdb', 'Contacts in PDB structures', 'live', 'Residues at an interface with RNA, DNA, another protein or another copy of the same protein in experimentally determined structures (PDBe-KB interface residues, read live); click for the PDB entries']] : []),
    ['plddt', 'AlphaFold', 'live', 'The AlphaFold DB model’s confidence (pLDDT) per residue, read live; drawn only where the model’s sequence is this one'],
  ];
  // the site file's own rows, each placed after the row it names (after:), else at the end
  const ownId = r => 'cf:' + r.id;
  const ownHelp = r => `${r.help || r.title}${ownVersion(r) ? ` (${ownVersion(r)})` : ''}`;
  const ROWS = (() => {
    const rows = BUILT.slice();
    OWN_ROWS.filter(r => r.place !== 'backbone').forEach(r => {
      const entry = [ownId(r), r.title, r.sequence ? 'sequence' : 'site', ownHelp(r)];
      const anchor = r.after ? [r.after, 'cf:' + r.after].map(a => rows.findIndex(x => x[0] === a)).find(k => k >= 0) : -1;
      if (anchor != null && anchor >= 0) rows.splice(anchor + 1, 0, entry);
      else { const k = rows.findIndex(x => x[0] === 'plddt'); rows.splice(k >= 0 ? k : rows.length, 0, entry); }
    });
    return [
      ...TRACKS.filter(t => t.style !== 'segments').map(t => [trackRow(t), t.title, 'on the backbone', trackHelp(t)]),
      ...OWN_ROWS.filter(r => r.place === 'backbone').map(r => [ownId(r), r.title, 'on the backbone', ownHelp(r)]),
      ...rows];
  })();
  const ROW_OF = Object.fromEntries(ROWS.map(r => [r[0], r]));
  const OWN = Object.fromEntries(OWN_ROWS.map(r => [ownId(r), r]));
  // every row is drawn unless turned off, so a site's new row shows without anyone turning it on; a row new since the
  // reader's choices were saved takes its default
  const DEFAULT_OFF = ['composition', 'aromatic', ...OWN_ROWS.filter(r => r.default === 'off').map(ownId)];
  const DEFAULT_ORDER = ROWS.map(r => r[0]);
  const known = new Set(store.get('ptmc-map-known', []));
  const M = {
    off: new Set([...store.get('ptmc-map-off', []).filter(id => ROW_OF[id]), ...DEFAULT_OFF.filter(id => !known.has(id) || !store.get('ptmc-map-known', null))]),
    order: store.get('ptmc-map-order', DEFAULT_ORDER),
    colour: store.get('ptmc-map-colour', null), labels: store.get('ptmc-map-labels', 'auto'),
    size: { mm: '', dpi: 600, ...store.get('ptmc-map-size', {}) }, keyOpen: store.get('ptmc-map-key', null),
    zoom: null, items: [], rowsMenu: false, ctx: null, d3: [],
  };
  const isOn = id => !M.off.has(id) && !!ROW_OF[id];
  const isBackbone = id => ROW_OF[id]?.[2] === 'on the backbone';
  // the reader's order, with rows they have not seen yet in their default place
  const rowOrder = () => {
    const out = M.order.filter(id => ROW_OF[id]);
    DEFAULT_ORDER.forEach((id, k) => { if (out.includes(id)) return; const prev = DEFAULT_ORDER.slice(0, k).reverse().find(x => out.includes(x)); out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id); });
    return out;
  };

  // ---- colours for the marks --------------------------------------------------------------------------------------
  // the ways to colour them: the site file's order (an attribute by name, or a mode made from the attributes), then
  // every other colour attribute, then one colour
  const MODES = (() => {
    const out = [], seen = new Set();
    (CFG.colour_by || []).forEach(m => {
      if (typeof m === 'string') { if (SPECS[m] && !seen.has(m)) { out.push({ id: m, label: SPECS[m].label, attr: m }); seen.add(m); } } else if (m?.id && !seen.has(m.id)) { out.push({ ...m, own: true }); seen.add(m.id); }
    });
    Object.entries(SPECS).filter(([k, s]) => s.colour && !seen.has(k)).forEach(([k, s]) => out.push({ id: k, label: s.label, attr: k }));
    out.push({ id: 'single', label: 'Single colour' });
    return out;
  })();
  const mode = () => MODES.find(x => x.id === M.colour) || MODES[0];
  // a mark's values of an attribute, as a list (a category is one value; none is an empty list)
  const valsOf = (m, name) => { const s = SPECS[name]; if (!s) return []; const v = String(m[3]?.[attrIdx(name)] ?? ''); return v === '' ? [] : s.kind === 'list' ? v.split(s.separator || '; ') : [v]; };
  const RX = {};
  const holds = (m, c) => {
    if (!SPECS[c.attribute]) return false;                  // an attribute these marks lack: the condition never holds
    const v = valsOf(m, c.attribute);
    if (c.has && !v.some(x => c.has.includes(x))) return false;
    if (c.lacks && v.some(x => c.lacks.includes(x))) return false;
    if (c.matches != null && !v.some(x => (RX[c.matches] ||= new RegExp(c.matches)).test(x))) return false;
    if (c.empty != null && (v.length === 0) !== c.empty) return false;
    return true;
  };
  const hatched = m => !!(CFG.hatch || []).length && CFG.hatch.every(c => holds(m, c));
  // the key's words for a hatched head: the site file's, else the value its first condition names
  const HATCH_LABEL = CFG.hatch_label || (c => (c && SPECS[c.attribute] ? ((SPECS[c.attribute].values || {})[(c.has || [])[0]] || SPECS[c.attribute].label) : 'Hatched'))((CFG.hatch || [])[0]);
  // the colour of an attribute's value: the site file's colours, or the palette in the order of its values
  function attrColour(name, v) {
    const s = SPECS[name] || {}, order = Object.keys(s.values || {}), first = String(v ?? '').split(s.separator || '; ')[0], k = order.indexOf(first);
    return (s.colours || {})[first] || (first === '' || /^(none|no)$/i.test(first) ? TOK.light.none : PALETTE[(k >= 0 ? k : order.length) % PALETTE.length]);
  }
  const RAMP = [[5, '#1f2937', '5 or more'], [3, '#4b5563', '3–4'], [2, '#9ca3af', '2'], [-Infinity, '#d1d5db', '1']];
  // a mark's colour, its words and whether it is drawn hollow or hatched, in the mode chosen
  function siteColour(mark, ex) {
    const P = pal(ex), md = mode(), hat = hatched(mark);
    if (md.own) {
      const k = (md.classes || []).findIndex(cl => (cl.when || []).every(c => holds(mark, c))), cl = k >= 0 ? md.classes[k] : md.otherwise || { label: '', colour: P.none };
      return { c: cfgColour(cl, 'colour', P, P.none), label: cl.label, key: k >= 0 ? String(k) : 'otherwise', hollow: !!cl.hollow, hatched: hat };
    }
    if (md.id === 'single' || !SPECS[md.attr]) return { c: P.single, label: '', key: '', hatched: hat };
    const s = SPECS[md.attr], v = mark[3][attrIdx(md.attr)] ?? '';
    if (s.kind === 'number') { const n = Number(v); if (v === '' || !Number.isFinite(n)) return { c: P.none, label: 'none', key: '', hatched: hat }; const b = RAMP.find(([t]) => n >= t); return { c: b[1], label: b[2], key: b[2], hatched: hat }; }
    const first = String(v).split(s.separator || '; ')[0];
    return { c: attrColour(md.attr, first), label: K.sel?.valueLabel ? K.sel.valueLabel(md.attr, first) : first, key: first, hatched: hat };
  }
  // the classes of the mode: a made mode lists every class (a colour always means the same); an attribute, the values
  // its marks here have
  function modeLegend(ctx, ex) {
    const md = mode(), P = pal(ex);
    if (md.own) return [...(md.classes || []), ...(md.otherwise ? [md.otherwise] : [])].map(cl => ({ c: cfgColour(cl, 'colour', P, P.none), label: cl.label, hollow: !!cl.hollow }));
    if (md.id === 'single' || !SPECS[md.attr]) return [{ c: P.single, label: cap(W.marks) }];
    const seen = new Map(); ctx.rec.marks.forEach(m => { const c = siteColour(m, ex); if (!seen.has(c.label)) seen.set(c.label, c); });
    const s = SPECS[md.attr], order = s.kind === 'number' ? RAMP.map(r => r[2]) : Object.keys(s.values || {}).map(v => (K.sel?.valueLabel ? K.sel.valueLabel(md.attr, v) : v));
    return [...seen.entries()].sort((x, y) => (order.indexOf(x[0]) + 1 || 99) - (order.indexOf(y[0]) + 1 || 99)).map(([l, c]) => ({ c: c.c, label: l }));
  }

  // ---- marks drawn the same way on the map, in its key and in the exports ------------------------------------------
  const r1 = v => Math.round(v * 10) / 10;
  const MK = {
    head: (P, x, y, r, c, hollow, attr = '', stroke) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${hollow ? P.surf : c}" stroke="${hollow ? c : stroke || P.surf}" stroke-width="${hollow ? 1.6 : stroke ? 2 : 1}"${hollow ? ' stroke-dasharray="2.2 1.4"' : ''}${attr}/>`,
    // a hatched head: a rim in its colour crossed by diagonal chords, so it reads apart from a solid head in grey too
    hatch: (P, x, y, r0, c, attr = '', stroke) => {
      const r = Math.max(2, r0 * 0.8); let d = '';
      for (const off of [-r * 0.5, 0, r * 0.5]) { const h = (Math.sqrt(r * r - off * off) - 0.4) / Math.SQRT2, cx = x + off / Math.SQRT2, cy = y + off / Math.SQRT2; d += `M${r1(cx - h)} ${r1(cy + h)}L${r1(cx + h)} ${r1(cy - h)}`; }
      return `<g${attr}><circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${P.surf}" stroke="${stroke || c}" stroke-width="${stroke ? 2 : 1.2}"/><path d="${d}" stroke="${c}" stroke-width="0.9" stroke-linecap="round"/></g>`;
    },
    // a hatched tick: an outlined bar in its colour crossed by diagonal strokes (a mark shown and counted nowhere)
    htick: (P, x, y, h, c, attr = '', stroke) => {
      const w = 5, x0 = x - w / 2, y0 = y - h / 2; let d = '';
      for (let t = -w; t < h; t += 3) { const a = Math.max(0, -t), b = Math.min(w, h - t); if (b > a) d += `M${r1(x0 + a)} ${r1(y0 + t + a)}L${r1(x0 + b)} ${r1(y0 + t + b)}`; }
      return `<g${attr}><rect x="${r1(x0)}" y="${r1(y0)}" width="${w}" height="${r1(h)}" rx="1" fill="${P.surf}" stroke="${stroke || c}" stroke-width="${stroke ? 1.8 : 1.1}"/><path d="${d}" stroke="${c}" stroke-width="0.9" stroke-linecap="round"/></g>`;
    },
    tick: (x, y, h, c, attr = '', w = 2, op = 1) => `<rect x="${r1(x - w / 2)}" y="${r1(y - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="0.6" fill="${c}"${op < 1 ? ` fill-opacity="${op}"` : ''}${attr}/>`,
    box: (x, y, w, h, c, op = 1, attr = '') => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(1.5, w))}" height="${r1(h)}" rx="1" fill="${c}"${op < 1 ? ` fill-opacity="${op}"` : ''}${attr}/>`,
    pred: (x, y, w, h, c, op, attr = '') => MK.box(x, y, w, h, c, op, (w >= 4 ? ` stroke="${c}" stroke-width="0.7" stroke-dasharray="2 1.2"` : '') + attr),
    dot: (x, y, c, op = 1, attr = '') => `<circle cx="${r1(x)}" cy="${r1(y)}" r="2.8" fill="${c}"${op < 1 ? ` fill-opacity="${op}"` : ''} stroke="${c}" stroke-width="0.8"${attr}/>`,
    diamond: (x, y, s, fill, stroke, attr = '') => `<rect x="${r1(x - s / 2)}" y="${r1(y - s / 2)}" width="${s}" height="${s}" transform="rotate(45 ${r1(x)} ${r1(y)})" fill="${fill}" stroke="${stroke}" stroke-width="1.1"${attr}/>`,
  };
  // a key entry: the mark, drawn in a 20 x 12 box whose left middle is (x, y)
  const SW = {
    head: (c, hollow) => (P, x, y) => MK.head(P, x + 10, y, 4.6, c, hollow),
    hatch: c => (P, x, y) => MK.hatch(P, x + 10, y, 5, c),
    htick: c => (P, x, y) => MK.htick(P, x + 10, y, 12, c),
    tick: (c, op) => (P, x, y) => MK.tick(x + 10, y, 12, c, '', 2.4, op),
    box: (c, op, stroke) => (P, x, y) => `<rect x="${x}" y="${y - 5}" width="20" height="10" rx="2" fill="${c}"${op < 1 ? ` fill-opacity="${op}"` : ''}${stroke ? ` stroke="${stroke}" stroke-width="0.8"` : ''}/>`,
    pred: (c, op) => (P, x, y) => MK.pred(x, y - 5, 20, 10, c, op),
    dot: (c, op) => (P, x, y) => MK.dot(x + 10, y, c, op),
    diamond: (fill, stroke) => (P, x, y) => MK.diamond(x + 10, y, 6, fill, stroke),
    wave: c => (P, x, y) => `<path d="M${x} ${y} Q${x + 2.5} ${y - 4} ${x + 5} ${y} T${x + 10} ${y} T${x + 15} ${y} T${x + 20} ${y}" fill="none" stroke="${c}" stroke-width="1.4"/>`,
    split: (up, dn) => (P, x, y) => `<rect x="${x}" y="${y - 6}" width="20" height="6" fill="${up}"/><rect x="${x}" y="${y}" width="20" height="6" fill="${dn}"/>`,
  };
  const swatchHtml = (draw, P) => `<svg class="sw" width="22" height="14" viewBox="0 -7 22 14" aria-hidden="true">${draw(P, 1, 0)}</svg>`;

  // ---- UniProt features, by kind ----------------------------------------------------------------------------------
  const fpos = f => [f.location?.start?.value, f.location?.end?.value];
  const evid = f => (f.evidences || []);
  const pubmed = f => [...new Set(evid(f).filter(e => e.source === 'PubMed').map(e => e.id))];
  const ecos = f => [...new Set(evid(f).map(e => e.evidenceCode))];
  const ECO = { 'ECO:0000269': 'experimental', 'ECO:0007744': 'large-scale experiment', 'ECO:0000250': 'by similarity', 'ECO:0000255': 'sequence analysis', 'ECO:0000305': 'curator inference', 'ECO:0000303': 'from a paper', 'ECO:0000256': 'automatic annotation', 'ECO:0007829': 'automatic annotation' };
  // where a UniProt feature comes from: the entry (live, today), its evidence and its papers
  function featureProv(acc, f, full) {
    const pm = pubmed(f), ev = [...new Set(ecos(f).map(e => ECO[e] || e))].join(', ');
    const entry = full ? `<a href="https://www.uniprot.org/uniprotkb/${esc(acc)}/entry">UniProt ${esc(acc)}</a>` : `UniProt ${esc(acc)}`;
    return `<br><span class="muted">${entry} (read live${ctxUni() ? ', entry version ' + esc(ctxUni()) : ''}) · ${esc(f.type)}${ev ? ' · ' + esc(ev) : ''}${pm.length ? ' · PubMed ' + (full ? pm.slice(0, 12).map(id => `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(id)}/">${esc(id)}</a>`).join(', ') : esc(pm.slice(0, 4).join(', ')) + (pm.length > 4 ? ` +${pm.length - 4}` : '')) : ''}</span>`;
  }
  const ctxUni = () => M.ctx?.uni?.entryAudit?.entryVersion;
  // the kinds of UniProt PTM features (config/uniprot_ptm_kinds.json); the profile's own mark has a row of its own
  const OWNPTM = new Set((D.profile_uniprot || []).map(x => x.toLowerCase()));
  const ownPtm = f => f.type === 'Modified residue' && OWNPTM.has(String(f.description || '').split(';')[0].trim().toLowerCase());
  function ptmKind(f) {
    const d = String(f.description || '');
    const rule = (D.ptm_kinds || []).find(r => r.types.includes(f.type) && (!r.match || new RegExp(r.match, 'i').test(d)));
    return rule ? rule.kind : 'Other PTM';
  }

  // the site's domains, those with the same name merged where they overlap (InterPro lists one domain per member hit)
  function mergedDomains(rec) {
    const out = [];
    const kinds = kindsOf('domains');
    rec.units.filter(u => kinds.has(u[0]) && isOn('bb:' + u[0])).sort((x, y) => x[1] - y[1]).forEach(u => {
      const prev = out.find(o => o[0] === u[0] && o[3] === u[3] && u[1] <= o[2] && u[2] >= o[1]);
      if (prev) { prev[1] = Math.min(prev[1], u[1]); prev[2] = Math.max(prev[2], u[2]); } else out.push([...u]);
    });
    return out;
  }
  // a region's accession, linked to the database that defines it (config/ref_links.json); others stay plain text
  const refLink = ref => { const r = (D.ref_links || []).find(x => ref && new RegExp(x.pattern).test(ref)); return r ? r.url.replace('{ref}', encodeURIComponent(ref)) : null; };

  // ---- the site file's rows: their items, loaded with the protein (data/map/NN.json, or inlined) ---------------------
  const mapInline = (() => { try { return JSON.parse(document.getElementById('map-data')?.textContent || '{}'); } catch (e) { return {}; } })();
  const mapFiles = {};
  const shardKey = acc => String([...acc].reduce((n, c) => n + c.charCodeAt(0), 0) % (D.map_shards || 64)).padStart(2, '0');
  // the items of a protein ([row index, start, end, class, label, value, ref, sources]), or null while they load
  function itemsOf(acc) {
    if (!D.map_shards) return [];
    const key = shardKey(acc);
    if (mapInline[key]) return mapInline[key][acc] || [];
    if (!(key in mapFiles)) {
      mapFiles[key] = null;
      fetch(`data/map/${key}.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(j => { mapFiles[key] = j; }, () => { mapFiles[key] = { __failed: true }; }).then(() => { if (M.ctx && shardKey(M.ctx.p.acc) === key) redraw(); });
      return null;
    }
    const f = mapFiles[key];
    return f == null ? null : f.__failed ? [] : f[acc] || [];
  }
  const ownItems = (acc, r) => { const all = itemsOf(acc); if (!all) return null; const k = ROW_INDEX.indexOf(r.id); return all.filter(x => x[0] === k); };
  // runs of a motif in the sequence (website.protein.map.rows[].sequence): at least min matches, each within gap
  // residues of the one before; strong ones counted apart and naming the run when there are enough
  function motifRuns(seq, sq) {
    const re = new RegExp(sq.motif, 'g'), strong = sq.strong ? new RegExp(sq.strong.motif) : null, gap = sq.gap ?? Infinity, out = [];
    let cur = null, m;
    const close = () => { if (cur && cur.n >= sq.min) out.push(cur); };
    while ((m = re.exec(seq))) {
      if (!m[0]) { re.lastIndex++; continue; }
      const pos = m.index + 1, end = m.index + m[0].length, s = strong && strong.test(m[0]) ? 1 : 0;
      if (cur && pos - cur.last <= gap) { cur.last = pos; cur.n++; cur.strong += s; cur.end = end; } else { close(); cur = { start: pos, last: pos, end, n: 1, strong: s }; }
    }
    close();
    return out.map(c => ({ ...c, label: sq.strong && c.strong >= sq.strong.min ? sq.strong.label : sq.label || '' }));
  }
  const sourcesHtml = (names, full) => names.filter(Boolean).map(n => {
    const s = SOURCES[n] || {}, lab = s.label || n;
    if (!full) return esc(lab);
    const href = s.doi ? `https://doi.org/${s.doi}` : s.url || '';
    return `${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(lab)}</a>` : esc(lab)}${s.cite ? ` <span class="muted">(${esc(s.cite)})</span>` : ''}`;
  }).join(full ? '<br>' : ', ');

  // ---- PDB interfaces, live from PDBe-KB ----------------------------------------------------------------------------
  const PDBK = {};
  const PDB_KEYS = [['rna', 'RNA contact (PDB)', 'At an interface with RNA'], ['dna', 'DNA contact (PDB)', 'At an interface with DNA'],
    ['protein', 'Protein contact (PDB)', 'At an interface with a different protein'], ['self', 'Self-contact (PDB)', 'At an interface with another copy of this same protein (a homodimer or larger homo-oligomer)']];
  function loadPdbk(acc) {
    if (PDBK[acc]) return;
    PDBK[acc] = { state: 'loading' };
    const sig = window.AbortSignal?.timeout ? { signal: AbortSignal.timeout(20000) } : {};
    fetch(`https://www.ebi.ac.uk/pdbe/graph-api/uniprot/interface_residues/${encodeURIComponent(acc)}`, sig)
      .then(r => (r.status === 404 ? {} : r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        const at = { rna: new Map(), dna: new Map(), protein: new Map(), self: new Map() };
        for (const part of (d[acc] || {}).data || []) {
          const key = part.accession === 'RNA' ? 'rna' : part.accession === 'DNA' ? 'dna' : part.accession === acc ? 'self' : 'protein', name = part.name || part.accession;
          for (const res of part.residues || []) {
            for (let k = res.startIndex; k <= res.endIndex; k++) {
              let e = at[key].get(k); if (!e) at[key].set(k, e = { names: new Set(), entries: new Map() });
              e.names.add(name);
              (res.interactingPDBEntries || []).forEach(pe => { let x = e.entries.get(pe.pdbId); if (!x) e.entries.set(pe.pdbId, x = { chains: new Set(), names: new Set() }); String(pe.chainIds || '').split(',').map(c => c.trim()).filter(Boolean).forEach(c => x.chains.add(c)); x.names.add(name); });
            }
          }
        }
        // consecutive residues at one kind of interface: one run, with every partner and entry along it
        const runs = {};
        for (const [key] of PDB_KEYS) {
          const pos = [...at[key].keys()].sort((a, b) => a - b), out = [];
          pos.forEach(q => {
            const e = at[key].get(q), last = out[out.length - 1];
            const run = last && last.b === q - 1 ? last : (out.push({ a: q, b: q, names: new Set(), entries: new Map() }), out[out.length - 1]);
            run.b = q; e.names.forEach(n => run.names.add(n));
            e.entries.forEach((x, id) => { const y = run.entries.get(id) || { chains: new Set(), names: new Set() }; x.chains.forEach(c => y.chains.add(c)); x.names.forEach(n => y.names.add(n)); run.entries.set(id, y); });
          });
          runs[key] = out;
        }
        PDBK[acc] = { state: PDB_KEYS.some(([k]) => runs[k].length) ? 'ok' : 'none', runs, at };
      })
      .catch(() => { PDBK[acc] = { state: 'failed' }; })
      .then(() => { if (M.ctx?.p.acc === acc) redraw(); });
  }

  // ---- drawing --------------------------------------------------------------------------------------------------
  // o.Wd lays the map out at another width (a narrow screen, a journal column); o.ex draws it for export, in light colours
  function draw(ctx, o = {}) {
    const ex = !!o.ex, Wd = o.Wd || 1000, narrow = Wd < 700;
    const ML = narrow ? Math.min(110, Math.round(Wd * 0.3)) : 150, MR = narrow ? 14 : 18, X0 = ML, X1 = Wd - MR;
    const P = pal(ex);
    const { p, rec, uni, af } = ctx, L = p.len, seq = rec.seq || '';
    const [za, zb] = M.zoom || [1, L], span = zb - za + 1;
    const X = pos => X0 + (pos - za + 0.5) / span * (X1 - X0), inView = (a, b) => b >= za && a <= zb;
    const XA = a => X(Math.max(a, za) - 0.5), XB = b => X(Math.min(b, zb) + 0.5);    // a stretch's edges, in view
    const items = []; const it = x => items.push(x) - 1;
    const parts = [], back = [], legend = [], drawnRows = [];
    const key = (draw, label) => { if (label && !legend.some(l => l.label === label)) legend.push({ draw, label }); };
    const sel = ctx.selected;                                   // positions of the selected marks, or null
    const atMark = new Set(rec.marks.map(m => m[0]));
    const markAt = new Map(rec.marks.map(m => [m[0], m]));
    // a residue as the page numbers it (K.prot: histones without the initiator methionine), else its UniProt position
    const shown = q => (K.prot?.shownPos ? K.prot.shownPos(p.acc, q) : q);
    const resName = q => (K.prot?.siteLabel ? K.prot.siteLabel(p.acc, q) : `${seq[q - 1] || ''}${q}`);
    const span2 = (a, b) => (a === b ? resName(a) : `${shown(a)}–${shown(b)}`);
    const inside = (a, b) => rec.marks.filter(m => m[0] >= a && m[0] <= b).map(m => m[0]);
    const insideHtml = (a, b, full) => { const ins = inside(a, b); if (!ins.length || a === b) return ''; return `<br>${int(ins.length)} ${esc(ins.length === 1 ? W.mark : W.marks)} inside: ${full ? ins.slice(0, 40).map(q => `<button type="button" class="linkish mono" data-site-open="${q}">${esc(resName(q))}</button>`).join(' ') : esc(ins.slice(0, 8).map(resName).join(', ')) + (ins.length > 8 ? ` +${ins.length - 8}` : '')}`; };
    // the marks: stacked heads (a head moves up a level within 11 px of the one before it at that level)
    const marks = rec.marks.filter(m => inView(m[0], m[0])).sort((a, b) => a[0] - b[0]);
    const lastX = []; const level = new Map();
    marks.forEach(m => { const x = X(m[0]); let l = 0; while (l < 9 && lastX[l] != null && x - lastX[l] < 11) l++; lastX[l] = x; level.set(m[0], l); });
    const nLev = Math.max(1, ...[...level.values()].map(v => v + 1));
    // labels: Auto (3 lines, merged where they collide; none above 120 marks), All (12 lines), None
    const labels = [];
    const lmode = M.labels, maxLines = lmode === 'all' ? 12 : lmode === 'auto' ? 3 : 0;
    if (maxLines && !(lmode === 'auto' && marks.length > 120)) {
      const lineEnd = [];
      marks.forEach(m => {
        const txt = resName(m[0]), w = K.tw(txt, 10.5) + 6, x = X(m[0]);
        let line = 0; while (line < maxLines && lineEnd[line] != null && x - w / 2 < lineEnd[line]) line++;
        if (line < maxLines) { lineEnd[line] = x + w / 2; labels.push({ x, line, base: txt, txt, pos: [m[0]], n: 1 }); }
        else {
          // no line free: the nearest label to the left takes it ("R213 +3"), and its line ends further right
          const prev = labels[labels.length - 1]; if (!prev) return;
          prev.pos.push(m[0]); prev.n++;
          prev.txt = prev.n === 2 ? `${prev.base}/${shown(prev.pos[1])}` : `${prev.base} +${prev.n - 1}`;
          prev.left ??= prev.x - (K.tw(prev.base, 10.5) + 6) / 2;
          lineEnd[prev.line] = Math.max(lineEnd[prev.line], prev.left + K.tw(prev.txt, 10.5) + 6);
        }
      });
    }
    // inside the frame: a label that would run past an edge is pushed back; one pushed into the label before it on
    // its line joins it ("R213 +3")
    const lw = l => K.tw(l.txt, 10.5) + 6;
    const place = l => { const w = lw(l); let left = l.left ?? l.x - w / 2; left = Math.max(X0 - 6, Math.min(left, X1 + 10 - w)); l.left = left === l.x - w / 2 && l.left == null ? null : left; return [left, left + w]; };
    for (let again = true; again;) {
      again = false;
      for (let k = 1; k < labels.length; k++) {
        const b = labels[k], a = labels.slice(0, k).reverse().find(q => q.line === b.line);
        if (!a || place(a)[1] <= place(b)[0]) continue;
        a.pos.push(...b.pos); a.n += b.n; a.left ??= a.x - (K.tw(a.base, 10.5) + 6) / 2;
        a.txt = a.n === 2 ? `${a.base}/${shown(a.pos[1])}` : `${a.base} +${a.n - 1}`;
        labels.splice(k, 1); again = true; break;
      }
    }
    const nLines = labels.length ? Math.max(...labels.map(l => l.line)) + 1 : 0;
    const top = 8 + nLines * 13, headY = l => top + 8 + (nLev - 1 - l) * 11, yB = top + 8 + nLev * 11 + 14;
    // a row's label: left, bold, as large as fits its column (and its hover: what it is and where it comes from)
    const rowLabel = (lab, yMid, help, aside) => {
      if (!aside) drawnRows.push(lab);
      let size = Math.min(10, 10 * (ML - 10) / Math.max(1, K.tw(lab, 10, 600))), t = lab;
      if (size < 7.5) { size = 7.5; while (t.length > 3 && K.tw(t + '…', 7.5, 600) > ML - 10) t = t.slice(0, -1); t += '…'; }
      parts.push(`<text x="2" y="${r1(yMid + size * 0.36)}" font-size="${r1(size)}" font-weight="600" fill="${P.muted}"${ex ? '' : ` data-rowhelp="${esc(lab + ': ' + help)}"`}>${esc(t)}</text>`);
    };
    labels.forEach(l => {
      // inside the frame: a label that would run past the right edge ends at it
      const w = lw(l);
      if (l.left != null) l.left = Math.min(l.left, X1 + 10 - w); else if (l.x + w / 2 > X1 + 10) l.left = X1 + 10 - w;
      if (l.left == null && l.x - w / 2 < X0 - 6) l.left = X0 - 6;
      const y = top - (l.line) * 13 - 2, hy = headY(level.get(l.pos[0])) - 5;
      parts.push(`<line x1="${r1(l.x)}" x2="${r1(l.x)}" y1="${r1(y + 2)}" y2="${r1(hy)}" stroke="${P.line}" stroke-width="0.7"/>`);
      parts.push(l.left != null ? `<text x="${r1(l.left + 3)}" y="${r1(y)}" font-size="10.5" fill="${P.ink}">${esc(l.txt)}</text>`
        : `<text x="${r1(l.x)}" y="${r1(y)}" font-size="10.5" text-anchor="middle" fill="${P.ink}">${esc(l.txt)}</text>`);
    });
    // the site file's rows drawn behind the marks (dense windows, say): bands from the heads to the backbone
    OWN_ROWS.filter(r => r.place === 'backbone' && isOn(ownId(r))).forEach(r => {
      const its = ownItems(p.acc, r) || [], c = cfgColour(r, 'colour', P, P.ink), op = r.opacity ?? 0.08;
      its.filter(x => inView(x[1], x[2])).forEach(x => {
        const tip = full => `<b>${esc(r.title)}</b> ${x[1]}–${x[2]}${x[4] ? '<br>' + esc(x[4]) : ''}${insideHtml(x[1], x[2], full)}<br><span class="muted">${esc(ownHelp(r))}</span>`;
        const k = it({ tip: tip(false), card: tip(true), a: x[1], b: x[2] });
        back.push(MK.box(XA(x[1]), top + 2, XB(x[2]) - XA(x[1]), yB + 8 - top - 2, c, op, ` rx="3" data-mi="${k}"`));
      });
      if (its.some(x => inView(x[1], x[2]))) key(SW.box(c, Math.min(1, op * 3)), r.title);
    });
    // backbone: a bar where ordered, a wave where disordered (the site's disorder), the site's domains as boxes
    const disK = kindsOf('disorder'), segK = kindsOf('segments');
    const dis = rec.units.filter(u => disK.has(u[0]) && isOn('bb:' + u[0]) && inView(u[1], u[2]));
    const segs = rec.units.filter(u => segK.has(u[0]));
    parts.push(`<line x1="${X0}" x2="${X1}" y1="${yB}" y2="${yB}" stroke="${P.muted}" stroke-width="2"/>`);
    dis.forEach(([kind, s, e]) => {
      const a = XA(s), b = XB(e); if (b - a < 2) return;
      parts.push(`<rect x="${r1(a)}" y="${yB - 2}" width="${r1(b - a)}" height="4" fill="${P.surf}"/>`);
      let d = `M${r1(a)},${yB}`, x = a, up = true;
      while (x < b) { const nx = Math.min(b, x + 5); d += ` Q${r1((x + nx) / 2)},${up ? yB - 5 : yB + 5} ${r1(nx)},${yB}`; x = nx; up = !up; }
      // the other regions here that come from the same input (an IDR made from this disorder), not every track's
      const t = trackOf(kind), over = segs.filter(([k2, is, ie]) => is <= e && ie >= s && (trackOf(k2).roles || []).some(r => (t.roles || []).includes(r))).slice(0, 6);
      const tip = full => `<b>${esc(t.title)} ${span2(s, e)}</b>${over.map(([k2, is, ie, lab]) => `<br>${esc(trackOf(k2).title)} ${is}–${ie}${lab ? ': ' + esc(lab) : ''}`).join('')}<br><span class="muted">${esc(tracksVersion(t))}</span>${full && recordLinks(t, p.acc) ? '<br>' + recordLinks(t, p.acc) : ''}`;
      const k = it({ tip: tip(false), card: tip(true), a: s, b: e });
      parts.push(`<path d="${d}" fill="none" stroke="${P.muted}" stroke-width="1.6" data-mi="${k}" pointer-events="stroke"/>`);
      key(SW.wave(P.muted), t.title);
    });
    // a short name for a domain: the UniProt domain over most of it, else the site's name before any " · "
    const uniDoms = (uni?.features || []).filter(f => ['Domain', 'Zinc finger'].includes(f.type));
    const shortName = (s, e, lab) => { const u = uniDoms.find(f => { const [a, b] = fpos(f); return Math.min(b, e) - Math.max(a, s) + 1 >= 0.5 * (e - s + 1); }); return (u?.description || String(lab || '').split(' · ')[0]).replace(/\s*;.*$/, ''); };
    const below = [];
    mergedDomains(rec).filter(u => inView(u[1], u[2])).forEach(([kind, s, e, lab, src, , ref]) => {
      const a = XA(s), b = XB(e), w = Math.max(2, b - a), t = trackOf(kind), ver = tracksVersion(t);
      const from = (D.unit_sources || [])[src] || ver, short = shortName(s, e, lab);
      const link = refLink(ref);
      const tip = full => `<b>${esc(lab || t.title)}</b>${ref ? ` (${full && link ? `<a href="${esc(link)}">${esc(ref)}</a>` : esc(ref)})` : ''}<br>${span2(s, e)}${insideHtml(s, e, full)}<br><span class="muted">${esc(t.title)}: ${esc(from)}${ver && !from.includes(ver) ? ' (' + esc(ver) + ')' : ''}</span>${full && recordLinks(t, p.acc) ? '<br>' + recordLinks(t, p.acc) : ''}`;
      const k = it({ tip: tip(false), card: tip(true), a: s, b: e });
      parts.push(`<rect x="${r1(a)}" y="${yB - 8}" width="${r1(w)}" height="16" rx="4" fill="${P.dom}" stroke="${P.domEdge}" stroke-width="1" data-mi="${k}"/>`);
      if (short && K.tw(short, 10, 600) + 8 < w) parts.push(`<text x="${r1((a + b) / 2)}" y="${yB + 3.5}" font-size="10" font-weight="600" text-anchor="middle" fill="${P.domInk}" pointer-events="none">${esc(short)}</text>`);
      else if (short) below.push([(a + b) / 2, short]);
      key(SW.box(P.dom, 1, P.domEdge), t.title);
    });
    // sticks and heads
    marks.forEach(m => {
      const x = X(m[0]), y = headY(level.get(m[0])), c = siteColour(m, ex), faded = sel && !sel.has(m[0]), on = ctx.site === m[0] && !ex;
      const op = faded && !on ? ' opacity="0.28"' : '', attr = `${op}${ex ? '' : ` data-msite="${m[0]}"`}`;
      parts.push(`<line x1="${r1(x)}" x2="${r1(x)}" y1="${yB - 3}" y2="${r1(y + 5)}" stroke="${P.line}" stroke-width="1"${faded ? ' opacity="0.28"' : ''}/>`);
      parts.push(c.hatched ? MK.hatch(P, x, y, on ? 6.5 : 5, c.c, attr, on ? P.ink : null) : MK.head(P, x, y, on ? 6.5 : 5, c.c, c.hollow, attr, on ? P.ink : null));
    });
    if (marks.length) rowLabel(cap(W.marks), top + 8 + (nLev - 1) * 5.5, `the ${W.marks} of this site, coloured as chosen above; click one for its card`, true);
    if (marks.some(m => hatched(m))) key(SW.hatch(P.muted), HATCH_LABEL);
    // the marks the site shows and counts nowhere (K.shown, website.shown_marks): hatched ticks on the backbone, in
    // their colour, each with its tag's hover; a click pins it with a link to its card
    const shownHere = (rec.shown || []).filter(m => inView(m[0], m[0]));
    shownHere.forEach(m => {
      const x = X(m[0]), c = siteColour(m, ex), on = ctx.site === m[0] && !ex;
      const words = K.shown?.tip ? K.shown.tip(m, true) : '';
      const tipOf = full => `<b>${esc(resName(m[0]))}</b> · ${esc(K.shown?.row ? K.shown.row() : '')}${c.label ? ' · ' + esc(c.label) : ''}<br><span class="win mono">${esc(m[1] || '')}</span><br><span class="muted">${esc(words)}</span>` +
        (full ? `<br><button type="button" class="linkish" data-site-open="${m[0]}">Open its card</button>` : '');
      const k = it({ tip: tipOf(false), card: tipOf(true), a: m[0], b: m[0] });
      parts.push(MK.htick(P, x, yB - 9, 13, c.c, ex ? '' : ` data-mi="${k}" data-shown="${m[0]}"`, on ? P.ink : null));
    });
    if (shownHere.length) {
      if (!marks.length) rowLabel(cap(W.marks), yB - 9, `the ${W.marks} of this site; hatched: shown, not counted`, true);
      key(SW.htick(P.muted), K.shown?.row ? K.shown.row() : 'Shown, not counted');
    }
    let y = yB + 22;
    if (below.length) {
      // names of domains too narrow to hold them, under the backbone where there is room
      let right = -1e9;
      below.sort((a, b) => a[0] - b[0]).forEach(([mx, t]) => { const w = K.tw(t, 9.5); if (mx - w / 2 > right + 6 && mx + w / 2 < Wd) { parts.push(`<text x="${r1(mx)}" y="${yB + 20}" font-size="9.5" text-anchor="middle" fill="${P.muted}">${esc(t)}</text>`); right = mx + w / 2; } });
      y += 8;
    }
    // ---- the rows ----
    const zoomed = !!M.zoom;
    const noneIn = (lab, help) => { rowLabel(lab, y + 6, help); parts.push(`<text x="${X0}" y="${y + 9}" font-size="10" fill="${P.muted}">none in ${za}–${zb}</text>`); y += 18; };
    const msg = (lab, help, text) => { rowLabel(lab, y + 6, help); parts.push(`<text x="${X0}" y="${y + 9}" font-size="10" fill="${P.muted}">${esc(text)}</text>`); y += 20; };
    const baseLine = (yy) => parts.push(`<line x1="${X0}" x2="${X1}" y1="${r1(yy)}" y2="${r1(yy)}" stroke="${P.faint}" stroke-width="0.8"/>`);
    // a label beside a tick, with a halo, flipped left at the right edge; skipped where it would hit the one before
    const labelAt = (xx, yy, text, right) => {
      const tw = K.tw(text, 9), flip = xx + 4 + tw > Wd - 2;
      if ((flip ? xx - 4 - tw : xx + 4) <= right.v + 5) return;
      parts.push(`<text x="${r1(flip ? xx - 4 : xx + 4)}" y="${r1(yy - 4)}" font-size="9" fill="${P.ink}" stroke="${P.surf}" stroke-width="2.5" paint-order="stroke"${flip ? ' text-anchor="end"' : ''}>${esc(text)}</text>`);
      right.v = flip ? xx : xx + 4 + tw;
    };
    // boxes in lanes, each named inside, after it, or cut (UniProt's regions, a site's families)
    const lanes = (list, maxL = 5, lab = () => '') => {
      const ends = [];
      return list.map(f => {
        const a = XA(f.a), w = Math.max(2, XB(f.b) - a), t = lab(f), tw = t ? K.tw(t, 9.5) : 0;
        const inside = t && w > tw + 6, after = t && !inside && a + w + 8 + tw < X1, reach = after ? a + w + 6 + tw : a + w;
        let l = ends.findIndex(e => e < a - 1); if (l < 0 && ends.length < maxL) { ends.push(-1e9); l = ends.length - 1; }
        let text = t, how = inside ? 'in' : after ? 'after' : t && w > 40 ? 'cut' : '';
        if (l < 0) { l = ends.indexOf(Math.min(...ends)); text = ''; how = ''; }
        if (how === 'cut') { while (text.length > 3 && K.tw(text + '…', 9.5) > w - 6) text = text.slice(0, -1); text += '…'; }
        ends[l] = Math.max(ends[l], how === 'after' ? reach : a + w);
        return { f, a, w, l, text, how };
      });
    };
    const namedBoxes = (list, fill, stroke, ink, labOf, tipOf) => {
      const placed = lanes(list.slice().sort((p1, p2) => p1.a - p2.a || (p2.b - p2.a) - (p1.b - p1.a)), 5, labOf), nl = Math.max(1, ...placed.map(x => x.l + 1));
      placed.forEach(({ f, a, w, l, text, how }) => {
        const yy = y + l * 15, k = it({ tip: tipOf(f, false), card: tipOf(f, true), a: f.a, b: f.b });
        parts.push(`<rect x="${r1(a)}" y="${yy}" width="${r1(w)}" height="12" rx="3" fill="${fill(f)}"${stroke(f) ? ` stroke="${stroke(f)}" stroke-width="0.8"` : ''} data-mi="${k}"/>`);
        if (how === 'in' || how === 'cut') parts.push(`<text x="${r1(how === 'in' ? a + w / 2 : a + 3)}" y="${yy + 9}" font-size="9.5"${how === 'in' ? ' text-anchor="middle"' : ''} fill="${ink}" pointer-events="none">${esc(text)}</text>`);
        else if (how === 'after') parts.push(`<text x="${r1(a + w + 4)}" y="${yy + 9}" font-size="9.5" fill="${ink}">${esc(text)}</text>`);
      });
      return nl * 15;
    };
    const uniRow = (row, types, fill, stroke, labOf, keyFill, filter = () => true) => {
      if (!uni) { msg(row[1], row[3], ctx.uniFailed ? 'UniProt did not answer' : 'asking UniProt…'); return; }
      let all = (uni.features || []).filter(f => types.includes(f.type) && filter(f)); if (!all.length) return;
      // five or more repeats of one kind (EWSR1's 31 tandem repeats) are one band, "31 × <kind>", not a stack of boxes
      const kindOf = f => String(f.description || '').replace(/\s*\d+\s*$/, '').trim(), groups = {};
      all.filter(f => f.type === 'Repeat').forEach(f => (groups[kindOf(f)] ||= []).push(f));
      Object.entries(groups).filter(([, g]) => g.length >= 5).forEach(([k, g]) => {
        const lo = Math.min(...g.map(f => fpos(f)[0])), hi = Math.max(...g.map(f => fpos(f)[1]));
        all = all.filter(f => !g.includes(f)).concat([{ ...g[0], description: `${g.length} × ${k || 'repeat'}`, location: { start: { value: lo }, end: { value: hi } } }]);
      });
      const fs = all.filter(f => inView(...fpos(f))).map(f => ({ a: fpos(f)[0], b: fpos(f)[1], u: f }));
      if (!fs.length) { if (zoomed) noneIn(row[1], row[3]); return; }
      const h = namedBoxes(fs, f => fill(f.u), f => stroke(f.u), P.boxInk, f => labOf(f.u), (f, full) => `<b>${esc(f.u.type)}</b> ${esc(f.u.description || '')}<br>${f.a}–${f.b}${insideHtml(f.a, f.b, full)}` + featureProv(p.acc, f.u, full));
      rowLabel(row[1], y + 6, row[3]); y += h + 6;
      keyFill.forEach(([c, l, st]) => key(SW.box(c, 1, st), l));
    };
    // a row of the site file's: its items, each drawn by its class's mark, with its words and sources
    const ownRow = (id, r) => {
      const row = ROW_OF[id];
      let its;
      if (r.sequence) {
        if (!seq) return;
        ctx.motif ||= {}; const runs = (ctx.motif[r.id] ||= motifRuns(seq, r.sequence));
        its = runs.map(c => [0, c.start, c.end, '', c.label, null, '', '', c]);
      } else {
        its = ownItems(p.acc, r);
        if (its == null) { msg(row[1], row[3], 'loading…'); return; }
      }
      if (!its.length) return;                                // no data here: the row is absent
      const CL = r.classes || {}, order = Object.keys(CL);
      let shown = its.filter(x => inView(x[1], x[2]));
      if (!shown.length) { if (zoomed) noneIn(row[1], row[3]); return; }
      if (r.merge) {                                          // pieces of one entry: one box
        const out = [];
        shown.slice().sort((x1, x2) => x1[1] - x2[1]).forEach(x => { const prev = out.find(q => q[3] === x[3] && q[4] === x[4] && q[6] === x[6] && x[1] <= q[2] + 1); if (prev) prev[2] = Math.max(prev[2], x[2]); else out.push([...x]); });
        shown = out;
      }
      const base = cfgColour(r, 'colour', P, P.variant), ink = cfgColour(r, 'ink', P, P.boxInk);
      const clsOf = x => CL[x[3]] || {};
      const colourOf = x => cfgColour(clsOf(x), 'colour', P, base);
      const markOf = x => clsOf(x).mark || r.mark || (x[1] === x[2] ? 'tick' : 'box');
      const vOp = r.value?.opacity, opOf = x => (vOp && x[5] != null ? r1(0.18 + 0.32 * Math.min(1, Math.max(0, (x[5] - vOp[0]) / Math.max(1e-9, vOp[1] - vOp[0])))) : clsOf(x).opacity ?? r.opacity ?? 1);
      const valText = v => (v == null || v === '' ? '' : (r.value ? (v === 1 ? r.value.one || r.value.many : r.value.many || r.value.one) || '{n}' : '{n}').replace('{n}', fmtNum(v)));
      const tipOf = (x, full) => {
        const cs = clsOf(x), head = !order.length && x[4] && x[1] === x[2] ? `<b>${esc(x[4])}</b>${x[5] != null ? ' ' + esc(valText(x[5])) : ''}` : `<b>${esc(cs.label || x[4] || r.title)}</b> ${span2(x[1], x[2])}${(cs.label && x[4]) ? '<br>' + esc(x[4]) : ''}${x[5] != null ? '<br>' + esc(valText(x[5])) : ''}`;
        const words = r.sequence?.words && x[8] ? '<br>' + esc(r.sequence.words.replace('{n}', x[8].n).replace('{strong}', x[8].strong)) : '';
        const srcs = [...String(x[7] || '').split('; '), ...(cs.sources || [])].filter(Boolean);
        const ref = x[6] ? `<br>${full && refLink(x[6]) ? `<a href="${esc(refLink(x[6]))}" target="_blank" rel="noopener">${esc(x[6])}</a>` : esc(x[6])}` : '';
        return head + (x[1] === x[2] && atMark.has(x[1]) ? ` · at a ${esc(W.mark)}` : '') + words + ref + insideHtml(x[1], x[2], full) +
          (srcs.length ? `<br>${full ? sourcesHtml([...new Set(srcs)], true) : esc([...new Set(srcs)].map(n => SOURCES[n]?.label || n).join(', '))}` : '') +
          (cs.help ? `<br><span class="muted">${esc(cs.help)}</span>` : '') + `<br><span class="muted">${esc(r.title)}${full ? ': ' + esc(ownHelp(r)) : r.sequence ? ', found in the sequence' : ownVersion(r) ? ' · ' + esc(ownVersion(r)) : ''}</span>`;
      };
      if (shown.every(x => markOf(x) === 'named')) {
        const h = namedBoxes(shown.map(x => ({ a: x[1], b: x[2], x })), f => colourOf(f.x), () => '', ink, f => f.x[4], (f, full) => tipOf(f.x, full));
        rowLabel(row[1], y + 6, row[3]); y += h + 6;
        [...new Set(shown.map(x => x[3]))].forEach(c => key(SW.box(cfgColour(CL[c], 'colour', P, base)), CL[c]?.label || r.title));
        return;
      }
      const h = r.value?.size ? 18 : 14, mid = y + h / 2;
      baseLine(mid);
      const rank = x => (order.length ? order.indexOf(x[3]) : 0);
      shown.slice().sort((x1, x2) => rank(x1) - rank(x2) || (x2[2] - x2[1]) - (x1[2] - x1[1])).forEach(x => {
        const mk = markOf(x), c = colourOf(x), op = opOf(x), k = it({ tip: tipOf(x, false), card: tipOf(x, true), a: x[1], b: x[2] }), attr = ` data-mi="${k}"`;
        const a = XA(x[1]), w = Math.max(1.6, XB(x[2]) - a), hit = x[1] === x[2] && atMark.has(x[1]);
        if (mk === 'tick') { const th = r.value?.size && x[5] != null ? Math.min(16, 6 + 3 * Math.log2(Math.max(1, x[5]))) : 12; parts.push(MK.tick(X(x[1]), mid, th, r.labels === 'marks' && hit && !CL[x[3]]?.colour ? P.ink : c, attr, Math.max(2, Math.min(3, XB(x[1]) - XA(x[1]))), op)); }
        else if (mk === 'dot') parts.push(MK.dot(X(x[1]), mid, c, op, attr));
        else if (mk === 'diamond') parts.push(MK.diamond((a + a + w) / 2, mid, 6, c, c, attr));
        else if (mk === 'pred') parts.push(MK.pred(a, mid - 4, w, 8, c, op, attr));
        else parts.push(MK.box(a, mid - 4, w, 8, c, op, attr));
      });
      if (r.labels === 'marks') {
        // at a mark, its items named: "R563C ×3, R563L"
        const right = { v: -1e9 }, at = new Map();
        shown.filter(x => x[1] === x[2] && atMark.has(x[1]) && x[4]).forEach(x => { if (!at.has(x[1])) at.set(x[1], []); at.get(x[1]).push(x); });
        [...at.entries()].sort((a1, a2) => a1[0] - a2[0]).forEach(([q, xs]) => labelAt(X(q), mid, xs.map(x => x[4] + (x[5] > 1 ? ` ×${x[5]}` : '')).join(', '), right));
      }
      rowLabel(row[1], mid, row[3]); y += h + 6;
      const inked = x => r.labels === 'marks' && x[1] === x[2] && atMark.has(x[1]) && !CL[x[3]]?.colour;
      const drawn = [...new Set(shown.filter(x => !inked(x)).map(x => x[3]))].sort((c1, c2) => (order.indexOf(c1) + 1 || 99) - (order.indexOf(c2) + 1 || 99));
      drawn.forEach(cl => {
        const x = shown.find(q => q[3] === cl && !inked(q)), mk = markOf(x), c = colourOf(x), op = vOp ? 0.4 : opOf(x), lab = CL[cl]?.label || r.title;
        key(mk === 'tick' ? SW.tick(c, op) : mk === 'dot' ? SW.dot(c, op) : mk === 'diamond' ? SW.diamond(c, c) : mk === 'pred' ? SW.pred(c, op) : SW.box(c, op), (!CL[cl] && r.key) || lab);
      });
      if (shown.some(inked)) key(SW.tick(P.ink), `${r.key || r.title}, at a ${W.mark}`);
    };
    // PDB interfaces (PDBe-KB, live): one row per kind of partner
    const pdbRows = row => {
      const st = PDBK[p.acc];
      if (!st || st.state === 'loading') { msg(row[1], row[3], 'asking PDBe-KB…'); return; }
      if (st.state === 'failed') { msg(row[1], row[3], 'PDBe-KB did not answer'); return; }
      if (st.state !== 'ok') return;
      for (const [k, title, what] of PDB_KEYS) {
        const runs = st.runs[k]; if (!runs.length) continue;
        const shown = runs.filter(r => inView(r.a, r.b));
        if (!shown.length) { if (zoomed) noneIn(title, row[3]); continue; }
        const c = P[k], mid = y + 7;
        baseLine(mid);
        shown.forEach(run => {
          const names = [...run.names], ids = [...run.entries.keys()];
          const tip = full => `<b>${esc(title)}</b> ${span2(run.a, run.b)}<br>${esc(what)} in ${int(ids.length)} PDB entr${ids.length === 1 ? 'y' : 'ies'}${k === 'protein' ? '<br>' + esc(names.slice(0, 6).join(', ')) + (names.length > 6 ? ` and ${names.length - 6} more` : '') : ''}${insideHtml(run.a, run.b, full)}` +
            (full ? `<br>${ids.slice(0, 30).map(id => { const e = run.entries.get(id), d3 = typeof K.show3d === 'function' ? M.d3.push({ acc: p.acc, pdb: id, chains: [...e.chains], start: run.a, end: run.b, kind: k, partners: [...e.names], residues: inside(run.a, run.b), source: 'map' }) - 1 : -1;
              return `<a href="https://www.rcsb.org/structure/${esc(id)}" target="_blank" rel="noopener" class="mono">${esc(id.toUpperCase())}</a>${e.chains.size ? ` <span class="muted">chain ${esc([...e.chains].join(', '))}</span>` : ''}${k === 'protein' ? ` <span class="muted">${esc([...e.names].slice(0, 2).join(', '))}</span>` : ''}${d3 >= 0 ? ` <button type="button" class="linkish" data-map3d="${d3}">Open in 3D</button>` : ''}`; }).join('<br>')}${ids.length > 30 ? `<br>and ${int(ids.length - 30)} more` : ''}` : '<br><i>click for the PDB entries</i>') +
            `<br><span class="muted">${full ? `<a href="https://www.ebi.ac.uk/pdbe/pdbe-kb/proteins/${esc(p.acc)}" target="_blank" rel="noopener">PDBe-KB ${esc(p.acc)}</a>` : 'PDBe-KB'} interface residues, read live</span>`;
          const kk = it({ tip: tip(false), card: () => tip(true), a: run.a, b: run.b });
          parts.push(MK.box(XA(run.a), mid - 5, XB(run.b) - XA(run.a), 10, c, 0.85, ` data-mi="${kk}"`));
        });
        rowLabel(title, mid, row[3]); y += 20;
        key(SW.box(c, 0.85), title);
      }
    };
    for (const id of rowOrder()) {
      if (!isOn(id) || isBackbone(id)) continue;
      const row = ROW_OF[id];
      if (OWN[id]) ownRow(id, OWN[id]);
      else if (id === 'pdb') pdbRows(row);
      else if (id === 'uni_dom') uniRow(row, ['Domain', 'Repeat', 'Zinc finger'], f => (f.type === 'Repeat' ? P.uniRep : P.uniDom), () => P.uniEdge, f => f.description, [[P.uniDom, 'Domain (UniProt)', P.uniEdge]]);
      else if (id === 'regions') uniRow(row, ['Region', 'Motif'], f => (f.type === 'Motif' ? P.motif : P.region), f => (f.type === 'Motif' ? P.motifEdge : P.regionEdge), f => f.description, [[P.region, 'Region (UniProt)', P.regionEdge]], f => !/^disordered$/i.test(f.description || ''));
      else if (id === 'composition') uniRow(row, ['Compositional bias'], () => P.bias, () => P.biasEdge, f => String(f.description || '').replace(/ residues$/, '-rich'), [[P.bias, 'Compositional bias (UniProt)', P.biasEdge]]);
      else if (id.startsWith('tr:')) {
        // a track's regions, coloured by class when they have one; a row is drawn only for a protein that has some
        const t = trackOf(id.slice(3)), mine = segs.filter(u => u[0] === t.kind);
        if (!mine.length) continue;
        const shown = mine.filter(u => inView(u[1], u[2]));
        if (!shown.length) { noneIn(row[1], row[3]); continue; }
        const what = (K.A[t.analysis] || {}).describe || '';
        shown.forEach(([, s, e, lab, , code, ref]) => {
          const a = XA(s), b = XB(e), link = refLink(ref);
          const tip = full => `<b>${esc(t.title)} ${span2(s, e)}</b>${lab ? '<br>' + esc(lab) : code ? '<br>' + esc(segLabels(t)[code] || code) : ''}${ref ? `<br>${full && link ? `<a href="${esc(link)}">${esc(ref)}</a>` : esc(ref)}` : ''}${insideHtml(s, e, full)}<br><span class="muted">${esc(t.help || '')}${tracksVersion(t) ? ' (' + esc(tracksVersion(t)) + ')' : ''}${what ? '; ' + esc(what) : ''}</span>${full && recordLinks(t, p.acc) ? '<br>' + recordLinks(t, p.acc) : ''}`;
          const k = it({ tip: tip(false), card: tip(true), a: s, b: e });
          parts.push(`<rect x="${r1(a)}" y="${y}" width="${r1(Math.max(2, b - a))}" height="12" rx="3" fill="${segColour(t, code)}" data-mi="${k}"/>`);
        });
        const here = new Set(shown.map(u => u[5]).filter(Boolean));
        if (t.analysis || t.colours || t.classes) Object.keys(segLabels(t)).filter(c => here.has(c)).forEach(c => key(SW.box(segColour(t, c)), segLabels(t)[c]));
        else key(SW.box(SEG_PLAIN), t.title);
        rowLabel(row[1], y + 6, row[3]); y += 20;
      } else if ((id === 'charge' || id === 'hydropathy') && seq) {
        const h = 34, mid = y + h / 2, isC = id === 'charge', scale = isC ? 1 : 3, cu = isC ? P.chargeP : P.hydroP, cd = isC ? P.chargeN : P.hydroN;
        const sm = isC ? (ctx.charge ||= slide([...seq].map(c => CHARGE[c] || 0), 5)) : (ctx.hydro ||= slide([...seq].map(c => KD[c] ?? 0), 9));
        let up = `M${r1(X(za))},${mid}`, dn = up;
        const step = Math.max(1, Math.floor(span / 1400));
        for (let i = za; i <= zb; i += step) { const c = Math.max(-scale, Math.min(scale, sm[i - 1])) / scale, xx = r1(X(i)); up += ` L${xx},${r1(mid - Math.max(0, c) * h / 2)}`; dn += ` L${xx},${r1(mid - Math.min(0, c) * h / 2)}`; }
        up += ` L${r1(X(zb))},${mid} Z`; dn += ` L${r1(X(zb))},${mid} Z`;
        parts.push(`<line x1="${X0}" x2="${X1}" y1="${mid}" y2="${mid}" stroke="${P.line}" stroke-width="0.6"/><path d="${up}" fill="${cu}" opacity="0.75"/><path d="${dn}" fill="${cd}" opacity="0.75"/>`);
        parts.push(`<text x="${X1 + 2}" y="${y + 5}" font-size="8.5" fill="${P.muted}">+${scale}</text><text x="${X1 + 2}" y="${y + h}" font-size="8.5" fill="${P.muted}">−${scale}</text>`);
        rowLabel(row[1], mid, row[3]); y += h + 8;
        key(SW.split(cu, cd), isC ? 'Charge, 5-aa mean (+ / −)' : 'Hydropathy, 9-aa mean (hydrophobic / hydrophilic)');
      } else if (id === 'aromatic' && seq) {
        for (let i = za; i <= zb; i++) if ('FYW'.includes(seq[i - 1])) { const xx = r1(X(i)); parts.push(`<line x1="${xx}" x2="${xx}" y1="${y + (seq[i - 1] === 'W' ? 0 : 2)}" y2="${y + 12}" stroke="${P.aro[seq[i - 1]]}" stroke-width="1"/>`); }
        rowLabel(row[1], y + 6, `${row[3]}. F teal, Y violet, W amber`); y += 20;
        Object.entries(P.aro).forEach(([aa, c]) => key(SW.tick(c), `Aromatic ${aa}`));
      } else if (id === 'residues' && seq) {
        const res = new Set(D.residues || []);
        for (let i = za; i <= zb; i++) if (res.has(seq[i - 1])) { const xx = r1(X(i)), m = markAt.get(i); parts.push(`<line x1="${xx}" x2="${xx}" y1="${y + (m ? 0 : 3)}" y2="${y + (m ? 14 : 11)}" stroke="${m ? siteColour(m, ex).c : P.rtick}" stroke-width="${m ? 2 : 0.9}"/>`); }
        rowLabel(row[1], y + 7, row[3]); y += 20;
        key(SW.tick(P.rtick), `Other ${W.residue.replace(/^an? /, '')} (not a ${W.mark})`);
      } else if (id === 'variants' || id === 'mutagen') {
        if (!uni) { msg(row[1], row[3], ctx.uniFailed ? 'UniProt did not answer' : 'asking UniProt…'); continue; }
        const isMut = id === 'mutagen', allV = (uni.features || []).filter(f => f.type === (isMut ? 'Mutagenesis' : 'Natural variant')), fs = allV.filter(f => inView(...fpos(f)));
        if (!fs.length) { if (allV.length && zoomed) noneIn(row[1], row[3]); continue; }
        const mid = y + 7, right = { v: -1e9 }, done = new Set();
        baseLine(mid);
        let hits = 0;
        fs.sort((a, b) => fpos(a)[0] - fpos(b)[0]).forEach(f => {
          const [s, e] = fpos(f), xx = X(s), at = s === e && atMark.has(s);
          const alt = f.alternativeSequence ? `${f.alternativeSequence.originalSequence || ''}${s}${(f.alternativeSequence.alternativeSequences || []).join('/')}` : `${s}`;
          const snp = [...new Set((f.featureCrossReferences || []).filter(x => x.database === 'dbSNP').map(x => x.id))];
          const desc = String(f.description || '').replace(/;?\s*dbSNP:rs\d+/g, '').trim();
          const tip = full => `<b>${esc(f.type)} ${esc(alt)}</b>${at ? ` · at a ${esc(W.mark)}` : ''}${desc ? '<br>' + esc(desc) : ''}${snp.length ? '<br>dbSNP ' + (full ? snp.map(x => `<a href="https://www.ncbi.nlm.nih.gov/snp/${esc(x)}">${esc(x)}</a>`).join(', ') : esc(snp.join(', '))) : ''}` + featureProv(p.acc, f, full);
          const k = it({ tip: tip(false), card: tip(true), a: s, b: e }), col = at ? P.ink : P.variant;
          if (isMut) parts.push(MK.diamond(s === e ? xx : (XA(s) + XB(e)) / 2, mid, 6, col, col, ` data-mi="${k}"`));
          else parts.push(MK.tick(xx, mid, at ? 14 : 9, col, ` data-mi="${k}"`, at ? 3 : 2));
          if (at && !done.has(s)) {
            // every change at a mark in one label, and the disease named first: "R514G/S ALS6", "R26A"
            done.add(s); hits++;
            const same = fs.filter(g => fpos(g)[0] === s && fpos(g)[1] === s), tos = [...new Set(same.flatMap(g => g.alternativeSequence?.alternativeSequences || []))];
            const dis = [...new Set(same.map(g => (/\bin ([A-Z][A-Za-z0-9-]+)/.exec(g.description || '') || [])[1]).filter(Boolean))];
            labelAt(xx, mid, `${f.alternativeSequence?.originalSequence || seq[s - 1] || ''}${s}${tos.join('/')}${dis.length ? ' ' + dis[0] : ''}`, right);
          }
        });
        rowLabel(row[1], mid, row[3]); y += 20;
        key(isMut ? SW.diamond(P.variant, P.variant) : SW.tick(P.variant), isMut ? 'Mutagenesis (UniProt)' : 'Natural variant (UniProt)');
        if (hits) key(isMut ? SW.diamond(P.ink, P.ink) : SW.tick(P.ink), `${isMut ? 'Mutagenesis' : 'Variant'} at a ${W.mark}`);
      } else if (id === 'uni_mark') {
        if (!uni) { msg(row[1], row[3], ctx.uniFailed ? 'UniProt did not answer' : 'asking UniProt…'); continue; }
        const all = (uni.features || []).filter(ownPtm), fs = all.filter(f => inView(...fpos(f)));
        if (!all.length) continue;
        if (!fs.length) { noneIn(row[1], row[3]); continue; }
        const mid = y + 7;
        fs.forEach(f => {
          const [s] = fpos(f), at = atMark.has(s);
          const tip = full => `<b>${esc(f.description || f.type)}</b> ${esc(resName(s))}${at ? ` · also a ${esc(W.mark)} of this site` : ` · <b>not</b> among this site’s ${esc(W.marks)}`}` + featureProv(p.acc, f, full);
          const k = it({ tip: tip(false), card: tip(true), a: s, b: s });
          parts.push(MK.tick(X(s), mid, 11, at ? P.ink : P.own, ` data-mi="${k}"`, 2.4));
        });
        rowLabel(row[1], mid, row[3]); y += 18;
        key(SW.tick(P.ink), `In UniProt and this site`); key(SW.tick(P.own), `In UniProt only`);
      } else if (id === 'ptm') {
        if (!uni) { msg(row[1], row[3], ctx.uniFailed ? 'UniProt did not answer' : 'asking UniProt…'); continue; }
        const all = (uni.features || []).filter(f => ['Modified residue', 'Cross-link', 'Glycosylation', 'Lipidation'].includes(f.type) && !ownPtm(f));
        const fs = all.filter(f => inView(...fpos(f)));
        if (!fs.length) { if (all.length && zoomed) noneIn(row[1], row[3]); continue; }
        const kinds = (D.ptm_kinds || []).map(r => r.kind).filter((k, i, a) => a.indexOf(k) === i && fs.some(f => ptmKind(f) === k));
        if (fs.some(f => ptmKind(f) === 'Other PTM') && !kinds.includes('Other PTM')) kinds.push('Other PTM');
        kinds.forEach(kind => {
          const mid = y + 6;
          fs.filter(f => ptmKind(f) === kind).forEach(f => {
            const [s] = fpos(f), at = atMark.has(s);
            const tip = full => `<b>${esc(f.description || f.type)}</b> ${esc(resName(s))}${at ? ` · at a ${esc(W.mark)}` : ''}` + featureProv(p.acc, f, full);
            const k = it({ tip: tip(false), card: tip(true), a: s, b: s });
            parts.push(MK.tick(X(s), mid, 11, at ? P.ink : P.ptm, ` data-mi="${k}"`, 2.4));
          });
          rowLabel(kind, mid, `${row[3]}. This row: ${kind}`); y += 17;
        });
        key(SW.tick(P.ptm), 'Other PTM (UniProt)');
        y += 4;
      } else if (id === 'plddt') {
        if (!af) { msg(row[1], row[3], ctx.afFailed ? 'AlphaFold DB did not answer' : ctx.afNone ? 'No model' : 'asking AlphaFold DB…'); continue; }
        const pl = af.plddt;
        if (!pl || pl.length !== L) { msg(row[1], row[3], 'The model’s sequence differs from this one: not drawn'); continue; }
        let run = za;
        for (let i = za + 1; i <= zb + 1; i++) {
          if (i <= zb && afColour(pl[i - 1]) === afColour(pl[run - 1])) continue;
          parts.push(`<rect x="${X(run - 0.5).toFixed(2)}" y="${y}" width="${(X(i - 0.5) - X(run - 0.5) + 0.3).toFixed(2)}" height="10" fill="${afColour(pl[run - 1])}"/>`);
          run = i;
        }
        rowLabel(`${row[1]} v${af.version}`, y + 5, `${row[3]}. Bands: ${AF_BINS.map(b => b[2]).join(', ')}`); y += 18;
        AF_BINS.forEach(([, c, l]) => key(SW.box(c), `pLDDT ${l}`));
      }
    }
    // the position axis, at the foot
    y += 4;
    parts.push(`<line x1="${X0}" x2="${X1}" y1="${y}" y2="${y}" stroke="${P.faint}"/>`);
    const raw = span / (narrow ? 4 : 8), mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw)))), step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10;
    const off = shown(1) - 1;
    for (let t = Math.ceil((za + off) / step) * step; t - off <= zb; t += step) { if (t - off < za) continue; parts.push(`<line x1="${r1(X(t - off))}" x2="${r1(X(t - off))}" y1="${y}" y2="${y + 4}" stroke="${P.muted}"/><text x="${r1(X(t - off))}" y="${y + 15}" font-size="10" text-anchor="middle" fill="${P.muted}">${int(t)}</text>`); }
    rowLabel(off ? 'aa (numbered)' : 'aa', y + 11, off ? 'Residue positions as papers number this protein (UniProt position ' + (off > 0 ? '+' : '−') + Math.abs(off) + ')' : 'Residue positions on the sequence of this site’s snapshot', true);
    y += 22;
    // a region the page was opened at (#protein/ACC/120-180): a faint band behind every row
    if (!ex && ctx.span && inView(ctx.span[0], ctx.span[1])) back.unshift(`<rect x="${r1(XA(ctx.span[0]))}" y="0" width="${r1(XB(ctx.span[1]) - XA(ctx.span[0]))}" height="${y}" fill="${P.accent}" opacity="0.08" pointer-events="none"/>`);
    if (!ex) parts.push(`<line id="map-cross" x1="0" x2="0" y1="0" y2="${y}" stroke="${P.ink}" stroke-width="0.6" stroke-dasharray="2 2" visibility="hidden" pointer-events="none"/><rect id="map-drag" x="0" y="0" width="0" height="${y}" fill="${P.ink}" opacity="0.08" visibility="hidden" pointer-events="none"/>`);
    if (!ex) { M.items = items; M.drawn = drawnRows; }
    const svg = back.join('') + parts.join('');
    return { svg: ex ? svg.replace(/ data-(mi|msite|rowhelp)="[^"]*"/g, '') : svg, H: y + 4, X, za, zb, Wd, X0, X1, legend, drawn: drawnRows, P };
  }

  // ---- on the page --------------------------------------------------------------------------------------------------
  const PANEL = [['', 'Screen layout'], ['85', 'Single column, 85 mm'], ['114', '1.5 columns, 114 mm'], ['174', 'Full width, 174 mm']], DPI = [300, 600, 1000];
  // a journal column: the canvas narrowed until its smallest labels (8.5 units) print at 6 pt, as the explorer's panels
  const panelUnits = mm => Math.round(mm / (6 * 25.4 / 72 / 8.5));
  function controls() {
    return `<div class="map-ctl"><label>Colour ${esc(W.marks)} by <select data-map-colour>${MODES.map(md => `<option value="${esc(md.id)}"${mode().id === md.id ? ' selected' : ''}${md.help ? ` title="${esc(md.help)}"` : ''}>${esc(md.label)}</option>`).join('')}</select></label>` +
      `<span class="lbl">Labels <span class="seg">${[['auto', 'Auto', 'Up to three lines of labels; neighbours too close share one (R213 +3), and none above 120 marks. Zoom in to separate them'], ['all', 'All', 'Every mark its own label, on as many lines as it needs'], ['none', 'None', 'No labels']].map(([k, l, t]) => `<button type="button" data-map-labels="${k}" aria-pressed="${M.labels === k}" title="${esc(t)}">${l}</button>`).join('')}</span></span>` +
      `<span class="rows-wrap"><button type="button" class="btn small" data-map-rows aria-expanded="${M.rowsMenu}">Rows ▾</button>${M.rowsMenu ? rowsMenu() : ''}</span>` +
      (M.zoom ? `<button type="button" class="btn small" data-map-unzoom>Reset zoom (${int(M.zoom[0])}–${int(M.zoom[1])})</button>` : `<span class="muted small">Drag across the map to zoom</span>`) +
      `<label class="map-size" title="The exports' size: the screen layout, or a journal column, laid out again at that width">Export size <select data-map-size>${PANEL.map(([v, l]) => `<option value="${v}"${String(M.size.mm) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` +
      `<label class="map-size">PNG <select data-map-dpi${M.size.mm ? '' : ' disabled title="Pick a column width first"'}>${DPI.map(v => `<option value="${v}"${+M.size.dpi === v ? ' selected' : ''}>${v} dpi</option>`).join('')}</select></label></div>`;
  }
  function rowsMenu() {
    return `<div class="rows-menu" role="menu"><p class="flabel">On the backbone</p>` + ROWS.filter(r => isBackbone(r[0])).map(r => `<label title="${esc(r[3])}"><input type="checkbox" data-map-row="${r[0]}"${isOn(r[0]) ? ' checked' : ''}> ${esc(r[1])}</label>`).join('') +
      `<p class="flabel">Rows, top to bottom</p>` + rowOrder().filter(id => !isBackbone(id)).map(id => { const r = ROW_OF[id]; return `<div class="rm-row"><label title="${esc(r[3])}"><input type="checkbox" data-map-row="${id}"${isOn(id) ? ' checked' : ''}> ${esc(r[1])} <span class="muted">${esc(r[2])}</span></label><span><button type="button" data-map-move="${id}" data-d="-1" aria-label="Up">↑</button><button type="button" data-map-move="${id}" data-d="1" aria-label="Down">↓</button></span></div>`; }).join('') +
      `<p><button type="button" class="linkish" data-map-defaults>Default rows</button></p></div>`;
  }
  // the key under the map, drawn with the map's own marks: the colour mode first, then what the rows drew
  function keyHtml(ctx, m) {
    const md = mode(), P = m.P;
    const open = M.keyOpen ?? m.Wd >= 700;
    return `<details class="map-key" data-map-key${open ? ' open' : ''}><summary>Key</summary><div class="map-legend"><b>${esc(md.label)}</b>` +
      modeLegend(ctx, false).map(e => `<span>${swatchHtml(SW.head(e.c, e.hollow), P)}${esc(e.label)}</span>`).join('') +
      (m.legend.length ? '<span class="lg-break"></span>' : '') + m.legend.map(e => `<span class="rl">${swatchHtml(e.draw, P)}${esc(e.label)}</span>`).join('') + '</div></details>';
  }
  const observed = new WeakSet();
  const widthOf = el => { const w = el.clientWidth; return w > 0 && w < 700 ? Math.max(300, Math.round(w)) : 1000; };
  function render(el, ctx) {
    M.ctx = ctx; if (!el) return;
    if (PDB_ON && isOn('pdb')) loadPdbk(ctx.p.acc);
    M.d3 = [];
    const m = draw(ctx, { Wd: widthOf(el) });
    el.innerHTML = controls() + `<div class="map-svg"><svg viewBox="0 0 ${m.Wd} ${m.H}" role="img" aria-label="Map of ${esc(ctx.p.gene || ctx.p.acc)}"${m.Wd < 1000 ? ` style="max-width:${m.Wd}px"` : ''}>${m.svg}</svg></div>` +
      `<p class="map-read muted" id="map-read">Hover the map for the residue under the pointer; click an item to pin it here with its links.</p><div id="map-pin" class="map-pin" hidden></div>` + keyHtml(ctx, m);
    M.geom = m;
    // laid out again when the box's width class changes (a narrow screen, a fold opened, the window resized)
    if (!observed.has(el) && window.ResizeObserver) { observed.add(el); new ResizeObserver(() => { if (M.geom && el.isConnected && widthOf(el) !== M.geom.Wd && M.ctx) render(el, M.ctx); }).observe(el); }
    const svg = el.querySelector('svg'), cross = el.querySelector('#map-cross'), drag = el.querySelector('#map-drag');
    const toPos = ev => { const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * m.Wd; if (x < m.X0 || x > m.X1) return null; return Math.max(1, Math.min(ctx.p.len, Math.round(m.za - 0.5 + (x - m.X0) / (m.X1 - m.X0) * (m.zb - m.za + 1)))); };
    let d0 = null;
    svg.addEventListener('mousemove', ev => {
      const pos = toPos(ev); if (pos == null) { cross.setAttribute('visibility', 'hidden'); return; }
      const x = m.X(pos).toFixed(1); cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      document.getElementById('map-read').innerHTML = readout(ctx, pos);
      if (d0 != null) { const a = Math.min(m.X(d0), m.X(pos)), b = Math.max(m.X(d0), m.X(pos)); drag.setAttribute('x', a.toFixed(1)); drag.setAttribute('width', (b - a).toFixed(1)); drag.setAttribute('visibility', 'visible'); }
    });
    svg.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); });
    svg.addEventListener('pointerdown', ev => { if (ev.button !== 0 || ev.target.closest('[data-mi],[data-msite]')) return; d0 = toPos(ev); if (d0 == null) return; svg.setPointerCapture(ev.pointerId); ev.preventDefault(); });
    const end = ev => {
      if (d0 == null) return; const p1 = toPos(ev) ?? d0, a = Math.min(d0, p1), b = Math.max(d0, p1); d0 = null;
      drag.setAttribute('visibility', 'hidden');
      if (ev.type === 'pointerup' && b - a + 1 >= 8) { M.zoom = [a, b]; render(el, ctx); }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointermove', ev => { if (d0 != null) svg.dispatchEvent(new MouseEvent('mousemove', ev)); });
    svg.addEventListener('dblclick', ev => { if (M.zoom && !ev.target.closest('[data-mi],[data-msite]')) { M.zoom = null; render(el, ctx); } });
  }
  // the residue under the pointer: what the map knows about it
  function readout(ctx, pos) {
    const { rec, uni, af } = ctx, aa = (rec.seq || '')[pos - 1] || '';
    const out = [`<b>${esc(aa)}${pos}</b>`];
    const mk = rec.marks.find(m => m[0] === pos);
    if (mk) { const c = siteColour(mk); out.push(`${esc(W.mark)}${c.label ? ': ' + esc(c.label) : ''}`); }
    const sm = (rec.shown || []).find(m => m[0] === pos);
    if (sm) { const c = siteColour(sm); out.push(`${esc(K.shown?.row ? K.shown.row() : '')}${c.label ? ': ' + esc(c.label) : ''}`); }
    // each track's regions at the residue: domains by name, other regions by their track and class
    const at = rec.units.filter(u => u[1] <= pos && u[2] >= pos), domK = kindsOf('domains');
    [...new Set(at.filter(u => domK.has(u[0])).map(u => String(u[3]).split(' · ')[0] || trackOf(u[0]).title))].forEach(t => out.push(esc(t)));
    at.filter(u => !domK.has(u[0])).forEach(u => { const t = trackOf(u[0]); out.push(`${esc(t.title)} ${u[1]}–${u[2]}${u[5] && segLabels(t)[u[5]] ? ' (' + esc(segLabels(t)[u[5]]) + ')' : ''}`); });
    (uni?.features || []).filter(f => ['Region', 'Motif', 'Compositional bias'].includes(f.type) && fpos(f)[0] <= pos && fpos(f)[1] >= pos && !/^disordered$/i.test(f.description || '')).slice(0, 3).forEach(f => out.push(`${f.type === 'Compositional bias' ? 'compositional bias: ' : ''}${esc(f.description)}`));
    (uni?.features || []).filter(f => ['Modified residue', 'Cross-link'].includes(f.type) && fpos(f)[0] === pos).forEach(f => out.push(esc(f.description)));
    const vars = (uni?.features || []).filter(f => f.type === 'Natural variant' && fpos(f)[0] === pos).flatMap(f => f.alternativeSequence?.alternativeSequences || []);
    if (vars.length) out.push(`variants: ${esc(aa)}→${esc([...new Set(vars)].join(', '))}`);
    // contacts and the site's own evidence here
    const ev = [];
    OWN_ROWS.filter(r => !r.sequence && isOn(ownId(r))).forEach(r => { const its = (ownItems(ctx.p.acc, r) || []).filter(x => x[1] <= pos && x[2] >= pos); const w = [...new Set(its.map(x => (r.classes || {})[x[3]]?.label || x[4] || r.title))]; if (w.length) ev.push(`${esc(r.title)}: ${esc(w.slice(0, 3).join('; '))}`); });
    const pk = PDBK[ctx.p.acc];
    if (pk?.state === 'ok') PDB_KEYS.forEach(([k, title]) => { const e = pk.at[k].get(pos); if (e) ev.push(`${esc(title)} (${int(e.entries.size)} entr${e.entries.size === 1 ? 'y' : 'ies'})`); });
    if (ev.length) out.push(`<b>here</b> ${ev.join(' · ')}`);
    const seq = rec.seq || '', signed = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
    ctx.charge ||= slide([...seq].map(c => CHARGE[c] || 0), 5); ctx.hydro ||= slide([...seq].map(c => KD[c] ?? 0), 9);
    if (seq) out.push(`charge ${signed(ctx.charge[pos - 1])} (5-aa mean)`, `hydropathy ${signed(ctx.hydro[pos - 1])} (9-aa mean)`);
    if (af?.plddt && af.plddt.length === ctx.p.len) out.push(`pLDDT ${Number(af.plddt[pos - 1]).toFixed(1)}`);
    return out.join(' · ');
  }

  // ---- the map as a figure (PDF, SVG, PNG), in light colours, at the screen layout or a journal column ------------------
  function wrapLegend(entries, x0, y0, width, P, title) {
    const fs = 10, lh = 16; let x = x0, y = y0, svg = '';
    if (title) { svg += `<text x="${x}" y="${r1(y + 3.5)}" font-size="${fs}" font-weight="700" fill="${P.muted}">${esc(title)}</text>`; x += K.tw(title, fs, 700) + 10; }
    entries.forEach(e => {
      const w = 25 + K.tw(e.label, fs);
      if (x > x0 && x + w > x0 + width) { x = x0; y += lh; }
      svg += e.draw(P, x, y) + `<text x="${r1(x + 25)}" y="${r1(y + 3.5)}" font-size="${fs}" fill="${P.ink}">${esc(e.label)}</text>`;
      x += w + 12;
    });
    return { svg, h: y - y0 + lh };
  }
  function figure(ctx) {
    const mm = +M.size.mm || 0, FW = mm ? panelUnits(mm) : 1000, Pd = FW < 500 ? 10 : 20, P = pal(true), p = ctx.p;
    const m = draw(ctx, { ex: true, Wd: FW - 2 * Pd }), parts = [];
    const name = p.name && p.name !== p.gene ? `${p.name}${p.gene ? ` (${p.gene})` : ''}` : (p.gene || p.acc);
    const title = `${name} protein map`;
    const ts = Math.max(11, Math.min(17, 17 * (FW - 2 * Pd) / Math.max(1, K.tw(title, 17, 700))));
    parts.push(`<text x="${Pd}" y="${Pd + 12}" font-size="${r1(ts)}" font-weight="bold" fill="${P.ink}">${esc(title)}</text>`);
    const sub = `${p.acc} · ${int(p.len)} aa · ${int(ctx.rec.marks.length)} ${ctx.rec.marks.length === 1 ? W.mark : W.marks}${M.zoom ? ` · showing ${M.zoom[0]}–${M.zoom[1]}` : ''}`;
    let y = Pd + 30;
    K.wrap(sub, FW - 2 * Pd, 11).forEach(t => { parts.push(`<text x="${Pd}" y="${y}" font-size="11" fill="${P.muted}">${esc(t)}</text>`); y += 14; });
    y += 4;
    parts.push(`<g transform="translate(${Pd},${y})">${m.svg}</g>`); y += m.H + 6;
    // the key wraps inside the width: the colour mode, then what the rows drew
    const l1 = wrapLegend(modeLegend(ctx, true).map(e => ({ draw: SW.head(e.c, e.hollow), label: e.label })), Pd, y + 6, FW - 2 * Pd, P, mode().label);
    parts.push(l1.svg); y += l1.h + 4;
    if (m.legend.length) { const l2 = wrapLegend(m.legend, Pd, y + 6, FW - 2 * Pd, P); parts.push(l2.svg); y += l2.h + 4; }
    // where each row comes from
    const src = [`${cap(W.marks)}: ${D.site.name}`, ...[...new Set([...TRACKS.map(tracksVersion), ...OWN_ROWS.filter(r => isOn(ownId(r)) && !r.sequence).map(ownVersion)].filter(Boolean))],
      `UniProt ${p.acc}, read live`, ...(PDB_ON && isOn('pdb') && PDBK[p.acc]?.state === 'ok' ? ['PDB interfaces: PDBe-KB, read live'] : []), ...(ctx.af ? [`AlphaFold DB model v${ctx.af.version}`] : [])];
    y += 6;
    K.wrap('Sources: ' + src.join('; ') + '.', FW - 2 * Pd, 9.5).forEach(t => { parts.push(`<text x="${Pd}" y="${y}" font-size="9.5" fill="${P.ink}">${esc(t)}</text>`); y += 12.5; });
    y += 4;
    K.creditLines().forEach(line => K.wrap(line, FW - 2 * Pd, 9).forEach(t => { parts.push(`<text x="${Pd}" y="${y}" font-size="9" fill="${P.muted}">${esc(t)}</text>`); y += 12; }));
    const H = Math.ceil(y + Pd - 8);
    const desc = `${title}. ${sub}. Rows: ${m.drawn.join(', ')}. Sources: ${src.join('; ')}. ${K.creditLines().join(' ')}`;
    const meta = JSON.stringify(K.provenance({ figure: title, protein: p.acc, zoom: M.zoom || null, colour_by: mode().id, rows: m.drawn, ...(mm ? { width_mm: mm, png_dpi: +M.size.dpi } : {}) }));
    const size = mm ? `width="${mm}mm" height="${(H * mm / FW).toFixed(1)}mm"` : `width="${FW}" height="${H}"`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${FW} ${H}" font-family="${K.FF.replace(/"/g, "'")}">` +
      `<title>${esc(title)}</title><desc>${esc(desc)}</desc><metadata id="ptmcontext-provenance">${esc(meta)}</metadata>` +
      `<rect width="${FW}" height="${H}" fill="#ffffff"/>${parts.join('')}</svg>`;
    return { svg, W: FW, H, title, desc, meta, ...(mm ? { mm, dpi: +M.size.dpi } : {}) };
  }
  // the export's file name: the site, the gene, the zoom, the column width and resolution, and the date
  function fileName(kind) {
    const p = M.ctx?.p || {}, gene = String(p.gene || p.acc || 'protein').split(/[\s;,]+/)[0].replace(/[^\w.-]+/g, '-'), mm = +M.size.mm || 0;
    return `${D.site.id}_${gene}_map${M.zoom ? `_${M.zoom[0]}-${M.zoom[1]}` : ''}${mm && kind !== 'tsv' ? `_${mm}mm` : ''}${mm && kind === 'png' ? `_${M.size.dpi}dpi` : ''}_${new Date().toISOString().slice(0, 10)}`;
  }

  // ---- events ------------------------------------------------------------------------------------------------------
  const redraw = () => { const el = document.getElementById('pmap'); if (el && M.ctx) render(el, M.ctx); };
  const saveRows = () => { store.set('ptmc-map-off', [...M.off]); store.set('ptmc-map-order', rowOrder()); store.set('ptmc-map-known', DEFAULT_ORDER); };
  if (!store.get('ptmc-map-known', null) || DEFAULT_ORDER.some(id => !known.has(id))) store.set('ptmc-map-known', DEFAULT_ORDER);
  K.clicks.push(
    ['[data-map-labels]', el => { M.labels = el.dataset.mapLabels; store.set('ptmc-map-labels', M.labels); redraw(); }],
    ['[data-map-rows]', () => { M.rowsMenu = !M.rowsMenu; redraw(); }],
    ['[data-map-row]', el => { const id = el.dataset.mapRow; if (el.checked) M.off.delete(id); else M.off.add(id); saveRows(); redraw(); }],
    ['[data-map-move]', el => {
      // moves among the rows the menu lists (the backbone overlays are not rows)
      const rows = rowOrder().filter(id => !isBackbone(id)), i = rows.indexOf(el.dataset.mapMove), j = i + +el.dataset.d;
      if (j >= 0 && j < rows.length) { [rows[i], rows[j]] = [rows[j], rows[i]]; M.order = [...ROWS.map(r => r[0]).filter(isBackbone), ...rows]; saveRows(); redraw(); }
    }],
    ['[data-map-defaults]', () => { M.off = new Set(DEFAULT_OFF); M.order = DEFAULT_ORDER.slice(); saveRows(); redraw(); }],
    ['[data-map-unzoom]', () => { M.zoom = null; redraw(); }],
    ['[data-map3d]', el => { const x = M.d3[+el.dataset.map3d]; if (x && typeof K.show3d === 'function') K.show3d(x); }],
    ['[data-mi]', el => { const x = M.items[+el.dataset.mi]; const pin = document.getElementById('map-pin'); if (x && pin) { pin.hidden = false; pin.innerHTML = `<button type="button" class="pin-x" data-pin-close aria-label="Close">×</button>${typeof x.card === 'function' ? x.card() : x.card || x.tip}`; } }],
    ['[data-pin-close]', () => { const pin = document.getElementById('map-pin'); if (pin) pin.hidden = true; }],
  );
  document.addEventListener('change', e => {
    const d = e.target.dataset || {};
    if (d.mapColour != null) { M.colour = e.target.value; store.set('ptmc-map-colour', M.colour); redraw(); }
    if (d.mapSize != null) { M.size.mm = e.target.value; store.set('ptmc-map-size', M.size); redraw(); }
    if (d.mapDpi != null) { M.size.dpi = +e.target.value; store.set('ptmc-map-size', M.size); }
  });
  document.addEventListener('toggle', e => { if (e.target.matches?.('[data-map-key]')) { M.keyOpen = e.target.open; } }, true);
  // a theme switch redraws the map in the theme's colours
  new MutationObserver(() => redraw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  K.tips.push(['[data-mi]', el => M.items[+el.dataset.mi]?.tip || ''], ['[data-rowhelp]', el => esc(el.dataset.rowhelp)]);
  // black or white text, whichever reads better on a colour (WCAG relative luminance)
  function textOn(hex) {
    const v = String(hex).replace('#', ''), c = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111827' : '#ffffff';
  }
  // what other modules may read: the mark's colour in the mode chosen (a 3D view follows it), the modes, the figure
  K.map = { render, figure, fileName, siteColour, attrColour, textOn, modes: () => MODES.map(md => ({ id: md.id, label: md.label })), mode: () => mode().id,
    reset: () => { M.zoom = null; M.rowsMenu = false; }, state: M };
});
