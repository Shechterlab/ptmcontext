/* The protein page's 3D structure, as the Methylarginine Site Explorer showed it: the experimental chain that resolves
   most of the protein (or any PDB entry and chain from the menu) or the AlphaFold model, colored like the protein map,
   with the marks as side chains in the map's colors. Styles, colorings, surface, lighting and background; contacts
   around a focused residue, site labels, the entry's other chains, bound RNA and DNA and ligands; a side panel with
   the entry, its chains and partners, the marks it resolves and what they touch; lists of the experimental entries,
   homologous structures and predicted complexes; and the view as a figure (PDF, SVG, PNG, TSV), as ChimeraX and PyMOL
   scripts and as coordinates (mmCIF, PDB) with the marks listed.

   Live, by UniProt accession, as the explorer read them: AlphaFold DB (models, AlphaMissense), PDBe (SIFTS mappings,
   observed residues, modified residues), RCSB (search, entry descriptions, coordinates) and ProtVar (predicted pairs).
   From the site's own tables (website.protein.structure, CONTRACTS.md "Structure evidence"): the entries in which a
   mark touches a partner, the RNA or DNA bound at it, predicted partners at it and colorings along the chain. A site
   without them still gets every live part. 3Dmol.js (the explorer's pin) loads only when the viewer opens.

   K.show3d(acc, {pos, entry, chain}) opens the viewer at a mark, in an entry and chain if given, from anywhere.
   A module of the site kit: kit-proteins.js puts K.s3d.html() in its Structure fold and calls K.s3d.after(). */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, esc, int, cap } = K;
  if (!D.proteins || !D.proteins.length || D.site.features?.structure_3d === false) return; // website.features.structure_3d: false leaves the viewer out (no K.s3d, no K.show3d)
  const SD = D.structure || {};
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.5.3/3Dmol-min.js';
  const LIB_CITE = '3Dmol.js 2.5.3 (Rego & Koes, Bioinformatics 31:1322 (2015), doi:10.1093/bioinformatics/btu829)';
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t === 'dark' || (t !== 'light' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  };
  const store = {
    get: (k, d) => {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set: (k, v) => {
      try {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        /* private window */
      }
    },
  };
  const today = () => K.hdate(new Date().toISOString());
  const withTimeout = (pr, ms) =>
    Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  const getJson = (u, opt, ms = 25000) =>
    withTimeout(
      fetch(u, opt).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      ms
    );
  const getText = (u, ms = 60000) =>
    withTimeout(
      fetch(u).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))),
      ms
    );
  const P = D.proteins.map(([acc, gene, name, len, marks, cand], i) => ({ i, acc, gene, name, len, marks, cand }));
  const byAcc = Object.fromEntries(P.map((p) => [p.acc, p]));
  const NOUN = W.mark,
    NOUNS = W.marks;
  const UP = (s) => String(s || '').toUpperCase();

  // ---- colours: one meaning each, in both themes (exports always light) ----------------------------------------------
  const TOK = {
    light: {
      rna: '#7B4FBF',
      dna: '#B7791F',
      protein: '#0E7490',
      self: '#7FA9B6',
      other: '#8A99A3',
      ev: '#0F3B47',
      rna_pale: '#CDB8EE',
      dna_pale: '#EBD3A6',
      domain: '#6FB8CF',
      dis: '#8796A0',
      chain: '#DCE3E7',
      ctx: '#CFC8BC',
      ctxSelf: '#B3C6CD',
      mark: '#B4485F',
      none: '#C9D2D8',
      rest: '#E6EAED',
    },
    dark: {
      rna: '#A98BE0',
      dna: '#D9A548',
      protein: '#3FB5CF',
      self: '#6E98A5',
      other: '#7E8E95',
      ev: '#D7EEF3',
      rna_pale: '#5B4A80',
      dna_pale: '#6B5530',
      domain: '#4E9DB3',
      dis: '#8FA6B0',
      chain: '#D0D9DD',
      ctx: '#6B665D',
      ctxSelf: '#55707A',
      mark: '#E0708A',
      none: '#C9D2D8',
      rest: '#E6EAED',
    },
  };
  const tok = (light) => TOK[light || !isDark() ? 'light' : 'dark'];
  const named = (c, t) => t[c] || c;
  const PLDDT = [
    [90, '#0053D6', 'Very high (> 90)'],
    [70, '#65CBF3', 'Confident (70–90)'],
    [50, '#FFDB13', 'Low (50–70)'],
    [-Infinity, '#FF7D45', 'Very low (< 50)'],
  ];
  const plBand = (v) => PLDDT.findIndex((b) => v > b[0]);
  const SS = { h: '#D9466F', s: '#E8B730', c: '#B7C2CA' };
  const CHARGE = { basic: '#2F6FD6', his: '#8DA9E8', acidic: '#D64545', other: '#CDD5DB' };
  const RAINBOW = ['#3B4CC0', '#2C9FD9', '#3DBE7A', '#F2C230', '#E8543B'];
  const HYDRO = ['#2F6FA7', '#F1F3F5', '#C8742B'];
  const CHAINS = [
    '#0E7490',
    '#E07A2E',
    '#6C5CE7',
    '#2E9E5B',
    '#C2417A',
    '#8C6D1F',
    '#3D7DD8',
    '#B33939',
    '#5B8C85',
    '#9B59B6',
  ];
  const SEG_PAL = ['#9DB8C7', '#E2B44C', '#8E7CC3', '#1BAF7A', '#B45309', '#BE185D', '#7C8A93', '#0E7490']; // the map's segment colors
  const ELEM_GREY = {
    prop: 'elem',
    map: { C: '#A3AEB8', N: '#3B5BDB', O: '#E03131', S: '#E6B800', P: '#F08C00', SE: '#F08C00' },
  };
  const ELEM_FOCUS = { prop: 'elem', map: { C: '#F59E0B', N: '#3B5BDB', O: '#E03131', S: '#E6B800' } };
  const mixHex = (a, b, t) => {
    const pa = parseInt(a.slice(1), 16),
      pb = parseInt(b.slice(1), 16),
      ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  };
  const ramp = (stops, t) => {
    const n = stops.length - 1,
      u = Math.max(0, Math.min(1, t)) * n,
      k = Math.min(n - 1, Math.floor(u));
    return mixHex(stops[k], stops[k + 1], u - k);
  };

  // ---- chemistry: general, for any mark ------------------------------------------------------------------------------
  const THREE = {
    A: 'ALA',
    R: 'ARG',
    N: 'ASN',
    D: 'ASP',
    C: 'CYS',
    Q: 'GLN',
    E: 'GLU',
    G: 'GLY',
    H: 'HIS',
    I: 'ILE',
    L: 'LEU',
    K: 'LYS',
    M: 'MET',
    F: 'PHE',
    P: 'PRO',
    S: 'SER',
    T: 'THR',
    W: 'TRP',
    Y: 'TYR',
    V: 'VAL',
  };
  const KD = {
    ILE: 4.5,
    VAL: 4.2,
    LEU: 3.8,
    PHE: 2.8,
    CYS: 2.5,
    MET: 1.9,
    ALA: 1.8,
    GLY: -0.4,
    THR: -0.7,
    SER: -0.8,
    TRP: -0.9,
    TYR: -1.3,
    PRO: -1.6,
    HIS: -3.2,
    GLU: -3.5,
    GLN: -3.5,
    ASP: -3.5,
    ASN: -3.5,
    LYS: -3.9,
    ARG: -4.5,
  };
  // the atom a residue's sphere sits on (the end of its side chain), and the side-chain atoms that touch a partner
  const TIP = {
    ARG: 'CZ',
    LYS: 'NZ',
    SER: 'OG',
    THR: 'OG1',
    TYR: 'OH',
    HIS: 'NE2',
    ASP: 'CG',
    GLU: 'CD',
    ASN: 'CG',
    GLN: 'CD',
    CYS: 'SG',
    MET: 'SD',
    TRP: 'NE1',
    PHE: 'CZ',
    PRO: 'CG',
    GLY: 'CA',
    ALA: 'CB',
    VAL: 'CB',
    LEU: 'CG',
    ILE: 'CD1',
  };
  const REACH = { ARG: ['CD', 'NE', 'CZ', 'NH1', 'NH2'], LYS: ['CE', 'NZ'] };
  const BACKBONE = new Set(['N', 'C', 'O', 'CA', 'OXT']);
  const COMPONENTS = (SD.components || []).map((c) => c.code);
  const MARK_RES = new Set((D.residues || []).map((r) => THREE[r]).filter(Boolean));
  const isMarkRes = (a) => MARK_RES.has(a.resn) || COMPONENTS.includes(a.resn);
  const baseResn = (r) => (COMPONENTS.includes(r) && MARK_RES.size === 1 ? [...MARK_RES][0] : r);
  const WATER = ['HOH', 'WAT', 'DOD'];
  const NUC_RNA = [
    'A',
    'C',
    'G',
    'U',
    'I',
    'PSU',
    '5MC',
    '7MG',
    'OMG',
    'OMC',
    'OMU',
    '2MG',
    'M2G',
    'H2U',
    '1MA',
    '5MU',
    '4SU',
  ];
  const NUC_DNA = ['DA', 'DC', 'DG', 'DT', 'DI', 'DU', '5CM'];
  const NUC_ALL = new Set([...NUC_RNA, ...NUC_DNA]);
  const isNuc = (a) => NUC_ALL.has(a.resn);
  const nucKind = (a) => (NUC_DNA.includes(a.resn) ? 'dna' : 'rna');
  const isPolymer = (a) => !a.hetflag || COMPONENTS.includes(a.resn);
  const methodShort = (m) =>
    ({
      'X-ray diffraction': 'X-ray',
      'X-RAY DIFFRACTION': 'X-ray',
      'Electron Microscopy': 'Cryo-EM',
      'ELECTRON MICROSCOPY': 'Cryo-EM',
      'Solution NMR': 'NMR',
      'SOLUTION NMR': 'NMR',
      'Solid-state NMR': 'ssNMR',
      'Electron crystallography': 'Electron crystallography',
    })[m] ||
    m ||
    '–';
  const pdbDesc = (s) => {
    const x = String(s || '').replace(/^PROTEIN \((.*)\)$/i, '$1');
    return x && x === x.toUpperCase()
      ? (x.charAt(0) + x.slice(1).toLowerCase()).replace(/\b(rna|dna)\b/gi, (w) => w.toUpperCase())
      : x;
  };
  const shorten = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  const KIND_WORD = { rna: 'RNA', dna: 'DNA', protein: 'Protein', self: 'Self', hybrid: 'RNA–DNA', other: 'Other' };

  // ---- the view's settings, remembered in this browser ----------------------------------------------------------------
  const STYLES = [
    ['cartoon', 'Cartoon'],
    ['trace', 'Trace'],
    ['sticks', 'Sticks'],
    ['spheres', 'Spheres'],
  ];
  const SURFACES = [
    ['off', 'Off'],
    ['glass', 'Transparent'],
    ['solid', 'Opaque'],
  ];
  const BGS = [
    ['page', 'Page'],
    ['white', 'White'],
    ['black', 'Black'],
  ];
  const LIGHTS = [
    ['ao', 'Ambient occlusion'],
    ['aoline', 'Occlusion + outline'],
    ['outline', 'Outline'],
    ['plain', 'Standard'],
  ];
  const BRIGHT = [
    ['soft', 'Soft'],
    ['normal', 'Normal'],
    ['bright', 'Bright'],
    ['vivid', 'Very bright'],
  ];
  const BRIGHT_I = { soft: 0.85, normal: 1, bright: 1.2, vivid: 1.4 };
  const LDIR = [
    ['front', 'Front'],
    ['upleft', 'Upper left'],
    ['upright', 'Upper right'],
    ['top', 'Above'],
    ['left', 'Left'],
    ['right', 'Right'],
  ];
  const LDIR_V = {
    front: [0.2, 0.2, 1],
    upleft: [-0.7, 0.7, 1],
    upright: [0.7, 0.7, 1],
    top: [0, 1, 0.35],
    left: [-1, 0.25, 0.35],
    right: [1, 0.25, 0.35],
  };
  const TOGGLES = [
    ['contacts', 'Contacts (5 Å)', 'Side chains within 5 Å of the focused residue'],
    ['labels', 'Site labels', `Label every ` + `resolved ${NOUN}`],
    ['others', 'Other chains', 'The entry’s other chains', 'pdb'],
    ['ligands', 'Ligands', 'Ligands and other hetero groups (waters are always hidden)', 'pdb'],
  ];
  const DEFAULT = {
    src: 'pdb',
    style: 'cartoon',
    color: 'features',
    surface: 'off',
    light: 'ao',
    bright: 'bright',
    ldir: 'upleft',
    bg: 'page',
    contacts: true,
    labels: false,
    others: true,
    ligands: true,
  };
  const V = Object.assign({}, DEFAULT, store.get('ptmc-3d-view', {}));
  const save = () => store.set('ptmc-3d-view', V);

  // ---- per protein ------------------------------------------------------------------------------------------------------
  // T: the open protein (its record from kit-proteins), the live viewer (mol), the mark to focus, open sub-folds
  const T = {
    acc: '',
    p: null,
    rec: null,
    mol: null,
    highlight: null,
    want: null,
    open: {},
    pdbAll: false,
    homAll: false,
    homOpen: new Set(),
    predAll: false,
    pick: {},
    started: false,
    msg: '',
  };
  const tracks = () => D.tracks || [];
  const allMarks = () => (T.rec ? T.rec.marks : []);
  // the view shows the sites of the current selection and filters (the map fades the rest), and of the
  // states left on in the view's own state toggle; its exports follow the same list
  const stateKey = (m) => colourOf(m).label || '';
  const stateName = (k) => k || 'No assigned state';
  const selOnly = () => !!(K.sel?.active?.() && T.selOff !== true);
  const selSet = () => (selOnly() ? K.sel.selectedPositions(T.acc) : null);
  const marks = () => {
    const all = allMarks();
    const sp = selSet(),
      hide = T.hide;
    return all.filter((m) => (!sp || sp.has(m[0])) && !(hide && hide.has(stateKey(m))));
  };
  const markAt = (pos) => marks().find((m) => m[0] === pos);
  const seqAt = (pos) => (T.rec?.seq || '')[pos - 1] || (D.residues || [''])[0];
  const rl = (pos) => `${seqAt(pos)}${pos}`;
  const ev = () => T.rec?.s3d || {};
  const colourOf = (m) => (K.map?.siteColour ? K.map.siteColour(m) : { c: tok().mark, label: '' });
  // the map's color mode: the reader's, or the one it opens with (the cards front end names that one in the legend; classic reads the reader's only)
  const mapColour = () => K.map?.state?.colour ?? null;
  const colourMode = () => {
    const k = mapColour(),
      s = (D.attribute_specs || {})[k];
    return s ? s.label : 'Single color';
  };
  const markColour = (m) => {
    const c = colourOf(m).c;
    return c === '#A3AEB3' ? tok().mark : c;
  }; // no value: the mark color, not the map's gray
  // the marks' colors, in the order of the attribute's values (as the map's legend)
  function markLegend() {
    const seen = new Map(),
      spec = (D.attribute_specs || {})[mapColour()] || {},
      order = Object.keys(spec.values || {});
    marks().forEach((m) => {
      const c = colourOf(m);
      const key = c.label || cap(NOUNS);
      if (!seen.has(key)) seen.set(key, [markColour(m), order.indexOf(c.key)]);
    });
    return [...seen.entries()]
      .sort((x, y) => (x[1][1] < 0 ? 99 : x[1][1]) - (y[1][1] < 0 ? 99 : y[1][1]))
      .map(([l, [c]]) => [l, c]);
  }
  const fill = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
    return el;
  };
  const pageOpen = (acc) =>
    K.S.view === 'protein' && String(K.S.arg).split('/')[0] === acc && !!document.getElementById('s3d');
  const inputsOf = (part) =>
    (SD.inputs?.[part] || []).map((n) => ({ name: n, ...(D.inputs?.[n] || {}), md5: D.run?.inputs?.[n]?.md5 || '' }));
  const dateWords = (v) => String(v || '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => K.hdate(m)); // the same date form as the header and footer
  const tableWords = (part) =>
    inputsOf(part)
      .map((x) => dateWords(x.version) || x.name)
      .join('; ');

  // ---- live sources ------------------------------------------------------------------------------------------------------
  const cache = { af: {}, am: {}, pdb: {}, det: {}, meta: {}, best: {}, hom: {}, cx: {}, files: {} };
  function loadAF(acc) {
    return (cache.af[acc] ||= getJson(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(acc)}`).then(
      (list) => {
        const e =
          (Array.isArray(list) ? list : []).find((x) => x.uniprotAccession === acc && x.isComplex !== true) || null;
        return e ? { entry: e, same: !T.rec?.seq || (e.uniprotSequence || e.sequence) === T.rec.seq } : { none: true };
      },
      (err) => (String(err.message) === '404' ? { none: true } : (delete cache.af[acc], { failed: true }))
    ));
  }
  // AlphaMissense: each mark's substitutions, their mean pathogenicity (0.564 and above: likely pathogenic)
  function loadAM(acc, url) {
    return (cache.am[acc] ||= getText(url).then(
      (text) => {
        const want = new Map(allMarks().map((m) => [m[0], seqAt(m[0])])),
          out = new Map();
        for (const line of text.split('\n')) {
          const [v, sc] = line.split(',');
          const mm = /^([A-Z])(\d+)[A-Z]$/.exec(v || '');
          if (!mm) continue;
          const pos = +mm[2];
          if (want.get(pos) !== mm[1]) continue;
          const a = out.get(pos) || { sum: 0, n: 0 };
          a.sum += +sc;
          a.n++;
          out.set(pos, a);
        }
        return out;
      },
      () => null
    ));
  }
  // the PDB entries PDBe maps to the protein (SIFTS best structures), those that model one of the mark's components
  // (RCSB search), and those holding RNA or DNA (RCSB search)
  function loadPdb(acc) {
    if (cache.pdb[acc]) return cache.pdb[acc];
    const base = acc.split('-')[0];
    const rcsb = (q, ms = 20000) =>
      withTimeout(
        fetch('https://search.rcsb.org/rcsbsearch/v2/query?json=' + encodeURIComponent(JSON.stringify(q))).then((r) =>
          r.status === 200
            ? r.json()
            : r.status === 204
              ? { result_set: [] }
              : Promise.reject(new Error(String(r.status)))
        ),
        ms
      );
    const byAccQ = {
      type: 'terminal',
      service: 'text',
      parameters: {
        attribute: 'rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession',
        operator: 'exact_match',
        value: base,
      },
    };
    const modified = COMPONENTS.length
      ? rcsb({
          query: {
            type: 'group',
            logical_operator: 'and',
            nodes: [
              byAccQ,
              {
                type: 'terminal',
                service: 'text',
                parameters: {
                  attribute: 'rcsb_polymer_entity_container_identifiers.chem_comp_monomers',
                  operator: 'in',
                  value: COMPONENTS,
                },
              },
            ],
          },
          return_type: 'polymer_entity',
          request_options: { paginate: { start: 0, rows: 100 } },
        }).then(
          (d) => new Set((d.result_set || []).map((x) => x.identifier.split('_')[0].toLowerCase())),
          () => new Set()
        )
      : Promise.resolve(new Set());
    const best = withTimeout(
      getJson(`https://www.ebi.ac.uk/pdbe/api/mappings/best_structures/${encodeURIComponent(base)}`),
      25000
    ).then(
      (d) => d[base] || [],
      (e) => (String(e.message) === '404' ? [] : null)
    );
    const na = (attr) =>
      rcsb({
        query: {
          type: 'group',
          logical_operator: 'and',
          nodes: [
            byAccQ,
            {
              type: 'terminal',
              service: 'text',
              parameters: { attribute: attr, operator: 'greater_or_equal', value: 1 },
            },
          ],
        },
        return_type: 'entry',
        request_options: { return_all_hits: true },
      }).then((d) => new Set((d.result_set || []).map((x) => x.identifier.toLowerCase())));
    const nas = Promise.all([
      na('rcsb_entry_info.polymer_entity_count_RNA'),
      na('rcsb_entry_info.polymer_entity_count_DNA'),
    ]).catch(() => null);
    const pr = Promise.all([best, modified, nas]).then(([list, mod, naSets]) => {
      const byId = new Map();
      for (const m of list || []) {
        let e = byId.get(m.pdb_id);
        if (!e)
          byId.set(
            m.pdb_id,
            (e = { id: m.pdb_id, method: m.experimental_method, resolution: m.resolution, chains: [], maps: [] })
          );
        if (!e.chains.includes(m.chain_id)) e.chains.push(m.chain_id);
        if (!e.maps.some((x) => x.chain === m.chain_id && x.unpStart === m.unp_start && x.start === m.start))
          e.maps.push({ chain: m.chain_id, unpStart: m.unp_start, unpEnd: m.unp_end, start: m.start, end: m.end });
      }
      for (const id of mod) if (!byId.has(id)) byId.set(id, { id, method: '', resolution: null, chains: [], maps: [] });
      // entries the site's tables name for a mark, which PDBe's list may leave out (another accession's chain, say)
      for (const c of ev().c || [])
        for (const id of c[2])
          if (!byId.has(id)) byId.set(id, { id, method: '', resolution: null, chains: [], maps: [], fromTable: true });
      const naMap = new Map();
      if (naSets) {
        naSets[0].forEach((id) => naMap.set(id, { rna: true, dna: false }));
        naSets[1].forEach((id) => {
          const v = naMap.get(id) || { rna: false, dna: false };
          v.dna = true;
          naMap.set(id, v);
        });
      }
      return { entries: [...byId.values()], modified: mod, failed: list === null, na: naMap, naFailed: !naSets };
    });
    cache.pdb[acc] = pr;
    pr.then((r) => {
      if (r.failed) delete cache.pdb[acc];
    });
    return pr;
  }
  // the residues a chain models (PDBe polymer coverage), with author numbers, and the mark's components modeled
  function loadDetail(id, chain, withMods) {
    const key = id + ':' + chain;
    if (cache.det[key]) return cache.det[key];
    const cov = chain
      ? getJson(
          `https://www.ebi.ac.uk/pdbe/api/pdb/entry/polymer_coverage/${id}/chain/${encodeURIComponent(chain)}`
        ).then(
          (d) => {
            const out = [];
            for (const m of (d[id] || {}).molecules || [])
              for (const c of m.chains || [])
                for (const o of c.observed || [])
                  out.push([o.start.residue_number, o.end.residue_number, o.start.author_residue_number]);
            return out;
          },
          () => null
        )
      : Promise.resolve(null);
    const mod =
      !withMods || !COMPONENTS.length
        ? Promise.resolve([])
        : getJson(`https://www.ebi.ac.uk/pdbe/api/pdb/entry/modified_AA_or_NA/${id}`).then(
            (d) => (d[id] || []).filter((r) => COMPONENTS.includes(r.chem_comp_id)),
            () => []
          );
    const pr = Promise.all([cov, mod]).then(([coverage, modres]) => ({ chain, coverage, modres }));
    cache.det[key] = pr;
    pr.then((d) => {
      if (d.chain && !d.coverage) delete cache.det[key];
    });
    return pr;
  }
  // what each entry is (RCSB Data API): its title, and each polymer with its chains, type and the accessions it maps to
  function loadMeta(ids) {
    const want = [...new Set(ids.map(UP))].filter((id) => !(id in cache.meta));
    for (let k = 0; k < want.length; k += 80) {
      const chunk = want.slice(k, k + 80);
      const pr = getJson(
        'https://data.rcsb.org/graphql',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query:
              `{ entries(entry_ids: ${JSON.stringify(chunk)}) { rcsb_id struct { title } rcsb_entry_info { ` +
              `resolution_combined experimental_method } polymer_entities { rcsb_polymer_entity { pdbx_description } ` +
              ('rcsb_polymer_entity_container_identifiers { uniprot_ids auth_asym_ids } ' +
                'entity_poly { rcsb_entity_polymer_type } rcsb_entity_source_organism { ' +
                'ncbi_scientific_name } } } }'),
          }),
        },
        20000
      ).then((d) => new Map(((d.data || {}).entries || []).map((en) => [en.rcsb_id, en])));
      for (const id of chunk)
        cache.meta[id] = pr.then(
          (m) => m.get(id) || null,
          () => {
            delete cache.meta[id];
            return null;
          }
        );
    }
    return Promise.all(ids.map((id) => cache.meta[UP(id)]));
  }
  const META = {}; // answered entry descriptions, by upper-case id (null: not answered)
  const meta = (ids) =>
    loadMeta(ids).then((list) => {
      ids.forEach((id, k) => {
        META[UP(id)] = list[k];
      });
      return list;
    });
  // an entry's polymers: [{chains, kind (rna|dna|protein), name, mine (maps to this accession), accessions}]
  function polymers(en, base) {
    return ((en && en.polymer_entities) || []).map((x) => {
      const type = (x.entity_poly || {}).rcsb_entity_polymer_type || '',
        ids = x.rcsb_polymer_entity_container_identifiers || {};
      return {
        chains: ids.auth_asym_ids || [],
        kind:
          /RNA/i.test(type) && /DNA/i.test(type)
            ? 'hybrid'
            : /RNA/i.test(type)
              ? 'rna'
              : /DNA/i.test(type)
                ? 'dna'
                : 'protein',
        name: pdbDesc((x.rcsb_polymer_entity || {}).pdbx_description || type),
        accs: ids.uniprot_ids || [],
        mine: (ids.uniprot_ids || []).includes(base),
        org: ((x.rcsb_entity_source_organism || [])[0] || {}).ncbi_scientific_name || '',
      };
    });
  }
  const partnersText = (en, base) => [
    ...new Set(
      polymers(en, base)
        .filter((x) => !x.mine)
        .sort((a, b) => 'rna dna hybrid protein'.indexOf(a.kind) - 'rna dna hybrid protein'.indexOf(b.kind))
        .map((x) => (x.kind === 'protein' ? x.name : `${KIND_WORD[x.kind]}: ${x.name}`))
    ),
  ];

  // the marks of the protein in a chain of an entry: [position, author residue | null, observed]
  function pdbSites(e, det) {
    const maps = e.maps.filter((m) => m.chain === det.chain),
      out = [];
    for (const m0 of marks()) {
      const pos = m0[0],
        m = maps.find((x) => pos >= x.unpStart && pos <= x.unpEnd);
      if (!m) continue;
      const rn = m.start + (pos - m.unpStart),
        seg = det.coverage ? det.coverage.find(([a, b]) => rn >= a && rn <= b) : null;
      out.push([pos, seg && seg[2] != null ? seg[2] + (rn - seg[0]) : null, !!seg]);
    }
    return out;
  }
  // the chain that models most of the protein: of the chains whose mapping spans most of it (8), the one PDBe says
  // observes most residues; ties to more marks resolved, then resolution. { failed } when PDBe answered for none.
  function bestPdb(acc) {
    if (cache.best[acc]) return cache.best[acc];
    const pr = loadPdb(acc).then((res) => {
      const span = (e, ch) => e.maps.filter((m) => m.chain === ch).reduce((n, m) => n + m.unpEnd - m.unpStart + 1, 0);
      const cand = res.entries
        .filter((e) => e.maps.length)
        .map((e) => ({ e, ch: e.maps[0].chain }))
        .sort((a, b) => span(b.e, b.ch) - span(a.e, a.ch))
        .slice(0, 8);
      return Promise.all(
        cand.map(({ e, ch }) =>
          loadDetail(e.id, ch, res.modified.has(e.id)).then(
            (det) => ({ e, det }),
            () => null
          )
        )
      ).then((list) => {
        const scored = list
          .filter((x) => x && x.det.coverage)
          .map(({ e, det }) => {
            let obs = 0;
            for (const m of e.maps.filter((x) => x.chain === det.chain))
              for (const [a, b] of det.coverage) obs += Math.max(0, Math.min(b, m.end) - Math.max(a, m.start) + 1);
            return { e, det, obs, nSites: pdbSites(e, det).filter((x) => x[2]).length };
          })
          .filter((x) => x.obs > 0);
        if ((cand.length && !list.some((x) => x && x.det.coverage)) || (res.failed && !scored.length))
          return { failed: true };
        scored.sort((a, b) => b.obs - a.obs || b.nSites - a.nSites || (a.e.resolution || 99) - (b.e.resolution || 99));
        return scored[0] || null;
      });
    });
    cache.best[acc] = pr;
    pr.then(
      (b) => {
        if (b && b.failed) delete cache.best[acc];
      },
      () => delete cache.best[acc]
    );
    return pr;
  }

  // ---- the viewer ---------------------------------------------------------------------------------------------------------
  // 3Dmol.js lights a scene with one directional light and no ambient term: faces turned away go black. Its lighting
  // shaders get a fixed share of fill light as WebGL compiles them: FILL + (1 - FILL) * max(n·l, 0).
  const FILL = 0.3;
  function fillLight() {
    if (fillLight.done) return;
    fillLight.done = true;
    const f = FILL.toFixed(2),
      g = (1 - FILL).toFixed(2);
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C?.prototype?.shaderSource) continue;
      const orig = C.prototype.shaderSource;
      C.prototype.shaderSource = function (shader, src) {
        if (typeof src === 'string' && /directionalLight|vLight/.test(src))
          src = src.replace(
            /max\( (-?)dotProduct, 0\.0 \)/g,
            (m0, neg) => `(${f} + ${g} * max( ${neg}dotProduct, 0.0 ))`
          );
        return orig.call(this, shader, src);
      };
    }
  }
  let libP = null;
  function load3Dmol() {
    if (window.$3Dmol) {
      fillLight();
      return Promise.resolve(window.$3Dmol);
    }
    return (libP ||= new Promise((ok, no) => {
      const s = Object.assign(document.createElement('script'), { src: LIB, async: true, crossOrigin: 'anonymous' });
      s.onload = () => (window.$3Dmol ? (fillLight(), ok(window.$3Dmol)) : no(new Error('3Dmol.js did not start')));
      s.onerror = () => {
        libP = null;
        no(new Error('3Dmol.js did not load'));
      };
      document.head.appendChild(s);
    }));
  }
  const viewBg = () =>
    V.bg === 'white' ? '#FFFFFF' : V.bg === 'black' ? '#000000' : cssVar('--surface-2') || '#eef5f7';
  function holder() {
    return T.mol && T.mol.acc === T.acc ? T.mol.el : document.getElementById('s3d-viewer');
  }
  function dispose() {
    if (!T.mol) return;
    try {
      const c = T.mol.el.querySelector('canvas'),
        gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (e) {
      /* gone */
    }
    T.mol = null;
  }
  // the viewer of this protein, made once; a model replaces the one before it
  function viewer(lib) {
    if (T.mol && T.mol.acc === T.acc) return T.mol;
    dispose();
    const el = document.getElementById('s3d-viewer');
    if (!el) return null;
    el.innerHTML = '';
    T.mol = {
      acc: T.acc,
      el,
      viewer: lib.createViewer(el, { backgroundColor: viewBg(), antialias: true }),
      mode: 'af',
      spin: false,
      label: null,
      focus: null,
    };
    bindMove(el);
    return T.mol;
  }
  function setModel(text, fmt, props) {
    const mol = T.mol,
      v = mol.viewer;
    v.removeAllLabels();
    v.clear();
    v.removeAllSurfaces();
    v.addModel(text, fmt);
    Object.assign(
      mol,
      {
        label: null,
        chains: null,
        focus: null,
        siteLabels: [],
        naKinds: null,
        contacts: null,
        dist: null,
        tips: null,
        text,
        fmt,
        pdb: null,
        af: null,
      },
      props
    );
  }
  function home(v) {
    const pdb = T.mol?.pdb;
    if (pdb && pdb.chain && !pdb.pred && v.selectedAtoms({ chain: pdb.chain }).length) v.zoomTo({ chain: pdb.chain });
    else v.zoomTo();
  }
  const placeholder = (text) => {
    const el = holder();
    if (el && !(T.mol && T.mol.acc === T.acc)) el.innerHTML = `<div class="s3d-ph">${text}</div>`;
  };
  const message = (text) => {
    T.msg = text || '';
    fill('s3d-msg', esc(T.msg));
  };

  // the AlphaFold model
  function showAf() {
    const acc = T.acc;
    placeholder('Asking AlphaFold DB for the model…');
    return loadAF(acc)
      .then((af) => {
        if (T.acc !== acc) return;
        if (af.failed) {
          placeholder(
            `AlphaFold DB did not answer. <a href="https://alphafold.ebi.ac.uk/entry/${esc(acc)}">Open the ` +
              `model in AlphaFold DB</a>.`
          );
          message('AlphaFold DB did not answer. Nothing else on this page depends on it.');
          paint();
          return;
        }
        if (af.none) {
          placeholder(
            `AlphaFold DB has no model of ${esc(acc)}. It does not cover every isoform, and ` +
              `for proteins longer than 2,700 residues it offers fragments only.${
                T.mol ? '' : ' Experimental structures, if any, are listed below.'
              }`
          );
          message(`AlphaFold ` + `DB has no model of ${acc}.`);
          paint();
          return;
        }
        placeholder('Loading the 3D viewer…');
        return Promise.all([load3Dmol(), (cache.files[af.entry.pdbUrl] ||= getText(af.entry.pdbUrl))]).then(
          ([lib, text]) => {
            if (T.acc !== acc || !viewer(lib)) return;
            setModel(text, 'pdb', {
              mode: 'af',
              af,
              src: {
                kind: 'af',
                what: `AlphaFold DB model ${af.entry.entryId} v${af.entry.latestVersion}`,
                url: `https://alphafold.ebi.ac.uk/entry/${encodeURIComponent(acc)}`,
                files: { cif: af.entry.cifUrl, pdb: af.entry.pdbUrl },
                tag: af.entry.entryId,
                read: today(),
              },
            });
            restyle(true);
            home(T.mol.viewer);
            T.mol.viewer.render();
            message(
              af.same
                ? ''
                : `The model’s sequence differs from the one these ${NOUNS} are on; a ${NOUN} is drawn ` +
                    `only where the model has its residue.`
            );
            paint();
            if (T.highlight != null) focusPos(T.highlight);
          }
        );
      })
      .catch((err) => {
        placeholder(
          `The 3D viewer could not load (${esc(err.message)}). <a href="https://alphafold.ebi.ac.uk/entry/${esc(acc)}">Open the ` +
            `model in AlphaFold DB</a>.`
        );
        paint();
      });
  }
  // a PDB entry: its coordinates from RCSB, its chain of this protein placed on UniProt by SIFTS and PDBe's observed residues
  function showPdb(e, chain, focus) {
    const acc = T.acc,
      id = e.id,
      ch = chain || T.pick[id] || (e.maps[0] || {}).chain || null;
    T.pick[id] = ch;
    T.entry = id;
    message(`Loading PDB ${UP(id)}…`);
    if (!(T.mol && T.mol.acc === acc)) placeholder(`Loading PDB ${UP(id)}…`);
    const nmr = /NMR/i.test(e.method || '');
    const file = (cache.files[id] ||= nmr
      ? getText(`https://files.rcsb.org/download/${UP(id)}.pdb`)
          .then((t) => [t, 'pdb'])
          .catch(() => getText(`https://files.rcsb.org/download/${UP(id)}.cif`).then((t) => [t, 'cif']))
      : getText(`https://files.rcsb.org/download/${UP(id)}.cif`).then((t) => [t, 'cif']));
    file.catch(() => delete cache.files[id]);
    return Promise.all([
      load3Dmol(),
      file,
      loadPdb(acc).then((res) => loadDetail(id, ch, res.modified.has(id))),
      meta([id]),
    ])
      .then(([lib, [text, fmt], det]) => {
        if (T.acc !== acc || !viewer(lib)) return;
        const sites = det.coverage ? pdbSites(e, det).filter((x) => x[1] != null && x[2]) : [];
        setModel(text, fmt, {
          mode: 'pdb',
          pdb: {
            e,
            det,
            chain: det.chain || ch,
            toAuth: new Map(sites.map((x) => [x[0], x[1]])),
            toUnp: new Map(sites.map((x) => [x[1], x[0]])),
          },
          src: {
            kind: 'pdb',
            id: UP(id),
            what: `PDB ${UP(id)}${det.chain ? ' chain ' + det.chain : ''}`,
            url: `https://www.rcsb.org/structure/${UP(id)}`,
            files: {
              cif: `https://files.rcsb.org/download/${UP(id)}.cif`,
              pdb: `https://files.rcsb.org/download/${UP(id)}.pdb`,
            },
            tag: UP(id),
            read: today(),
          },
        });
        if (!det.chain || !T.mol.viewer.selectedAtoms({ chain: det.chain }).length) {
          // no SIFTS chain (an entry the site's tables name under another accession): the chain whose residues carry the marks
          const best = bestChainByMarks();
          if (best) {
            T.mol.pdb.chain = best;
            T.mol.pdb.det = { ...det, chain: best };
            T.mol.pdb.guessed = true;
            marksByNumber(best);
          }
        }
        restyle(true);
        home(T.mol.viewer);
        T.mol.viewer.render();
        message(
          det.chain && !det.coverage
            ? `PDBe did not say which residues ${UP(id)} chain ${det.chain} models, so its ${NOUNS} cannot be ` +
                `placed; try again later.`
            : ''
        );
        paint();
        const f = focus ?? T.highlight;
        if (f != null) focusPos(f);
      })
      .catch((err) => {
        message(
          `PDB ${UP(id)} could not be loaded (${
            err.message === 'timeout' ? 'RCSB or PDBe did not answer in time' : esc(err.message)
          }).`
        );
        if (!(T.mol && T.mol.acc === acc))
          placeholder(
            `PDB ${esc(UP(id))} could not ` +
              `be loaded. <a href="https://www.rcsb.org/structure/${esc(UP(id))}">Open it at RCSB</a>.`
          );
        paint();
      });
  }
  // without a mapping, a chain is read in UniProt numbering where its residues at the marks are the mark's residue
  function bestChainByMarks() {
    const v = T.mol.viewer,
      score = new Map();
    for (const a of v.selectedAtoms({ atom: 'CA' }))
      if (isMarkRes(a) && markAt(a.resi)) score.set(a.chain, (score.get(a.chain) || 0) + 1);
    return [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  function marksByNumber(chain) {
    const v = T.mol.viewer,
      have = new Set(
        v
          .selectedAtoms({ chain, atom: 'CA' })
          .filter(isMarkRes)
          .map((a) => a.resi)
      );
    const ps = marks()
      .map((m) => m[0])
      .filter((p) => have.has(p));
    T.mol.pdb.toAuth = new Map(ps.map((p) => [p, p]));
    T.mol.pdb.toUnp = new Map(ps.map((p) => [p, p]));
  }
  function startPdbOrAf() {
    if (V.src === 'af') return showAf();
    placeholder(`Finding the experimental chain that models most of ${esc(T.p.gene || T.acc)}…`);
    const acc = T.acc;
    return bestPdb(acc).then(
      (b) => {
        if (T.acc !== acc || (T.mol && T.mol.acc === acc)) return;
        if (!b || b.failed) return showAf();
        return showPdb(b.e, b.det.chain).then(() => {
          if (!T.mol || T.mol.mode !== 'pdb') return showAf();
        });
      },
      () => showAf()
    );
  }
  function start() {
    if (T.started || !document.getElementById('s3d-viewer')) return;
    T.started = true;
    placeholder('Loading the 3D viewer…');
    const w = T.want;
    T.want = null;
    if (w?.pos != null) T.highlight = w.pos;
    if (w?.entry)
      return loadPdb(T.acc).then((res) => {
        const e = res.entries.find((x) => x.id === w.entry) || {
          id: w.entry,
          method: '',
          resolution: null,
          chains: [],
          maps: [],
        };
        V.src = 'pdb';
        return showPdb(e, w.chain, w.pos);
      });
    return startPdbOrAf();
  }

  // ---- numbering --------------------------------------------------------------------------------------------------------
  function unpToAuth(pos) {
    const pdb = T.mol.pdb;
    if (pdb.pred || pdb.homolog || pdb.guessed) return pdb.toAuth.get(pos) ?? (pdb.pred || pdb.guessed ? pos : null);
    const { e, det } = pdb,
      m = e.maps.find((x) => x.chain === det.chain && pos >= x.unpStart && pos <= x.unpEnd);
    if (!m) return null;
    const rn = m.start + (pos - m.unpStart),
      seg = (det.coverage || []).find(([a, b]) => rn >= a && rn <= b);
    return seg && seg[2] != null ? seg[2] + (rn - seg[0]) : null;
  }
  function authToUnp(auth) {
    const pdb = T.mol.pdb;
    if (pdb.pred || pdb.guessed) return auth;
    if (pdb.homolog) return pdb.homolog.authToQuery.get(auth) ?? null;
    const { e, det } = pdb,
      seg = (det.coverage || []).find(([a, b, au]) => au != null && auth >= au && auth <= au + (b - a));
    if (!seg) return null;
    const rn = seg[0] + (auth - seg[2]),
      m = e.maps.find((x) => x.chain === det.chain && rn >= x.start && rn <= x.end);
    return m ? m.unpStart + (rn - m.start) : null;
  }
  const unpOfAtom = () => {
    const pdbMode = T.mol.mode === 'pdb',
      memo = new Map();
    return (a) => {
      if (!pdbMode) return a.resi;
      if (a.chain !== T.mol.pdb.chain) return null;
      if (!memo.has(a.resi)) memo.set(a.resi, authToUnp(a.resi));
      return memo.get(a.resi);
    };
  };

  // ---- colorings -------------------------------------------------------------------------------------------------------
  // the site's own: its domains and disordered regions as the map draws them, each segments track by its classes, its
  // residue evidence (website.protein.structure.residues); then the usual ones
  const units = (kinds) => (T.rec?.units || []).filter((u) => kinds.has(u[0]));
  const styleKinds = (style) =>
    new Set(
      tracks()
        .filter((t) => t.style === style)
        .map((t) => t.kind)
    );
  const segTracks = () =>
    tracks().filter((t) => t.style === 'segments' && (T.rec?.units || []).some((u) => u[0] === t.kind));
  const segLabels = (t) => (t.analysis ? (K.A[t.analysis] || {}).labels || {} : {});
  const segColour = (t, cls) =>
    (t.colours || {})[cls] ||
    ((k) => (k >= 0 ? SEG_PAL[k % SEG_PAL.length] : '#cbd5e1'))(Object.keys(segLabels(t)).indexOf(cls));
  const colourings = () => (SD.colourings || []).filter((c) => (ev().r || {})[c.id]);
  function colourOptions() {
    const pdbMode = T.mol?.mode === 'pdb',
      pred = pdbMode && T.mol.pdb.pred;
    return [
      ['features', 'Protein features (as on the map)'],
      ...(!pdbMode || pred ? [['plddt', 'Confidence (pLDDT)']] : []),
      ...(pdbMode ? [['chain', 'By chain']] : []),
      ...segTracks().map((t) => ['seg:' + t.kind, t.title]),
      ...colourings().map((c) => ['ev:' + c.id, c.label]),
      ['rainbow', 'Rainbow (N→C)'],
      ['ss', 'Secondary structure'],
      ['charge', 'Charge'],
      ['hydro', 'Hydrophobicity'],
      ['uniform', 'Uniform gray'],
    ];
  }
  const colourKey = () => (colourOptions().some((o) => o[0] === V.color) ? V.color : 'features');
  function chainsOf() {
    if (T.mol.chains) return T.mol.chains;
    const ranges = new Map();
    for (const a of T.mol.viewer.selectedAtoms({})) {
      if (!isPolymer(a)) continue;
      const r = ranges.get(a.chain);
      if (!r) ranges.set(a.chain, [a.resi, a.resi]);
      else {
        r[0] = Math.min(r[0], a.resi);
        r[1] = Math.max(r[1], a.resi);
      }
    }
    return (T.mol.chains = { ranges, order: new Map([...ranges.keys()].map((c, k) => [c, k])) });
  }
  // residue classes of a coloring: position -> class index (the first it is in; a class of all: others where all hold)
  function evClasses(id) {
    const c = (SD.colourings || []).find((x) => x.id === id),
      runs = (ev().r || {})[id] || [],
      sets = c.classes.map(() => new Set());
    runs.forEach(([k, a, b]) => {
      for (let x = a; x <= b; x++) sets[k].add(x);
    });
    c.classes.forEach((cl, k) => {
      if (cl.all) {
        const idx = cl.all.map((n) => c.classes.findIndex((y) => y.id === n));
        const first = sets[idx[0]] || new Set();
        first.forEach((x) => {
          if (idx.every((i) => sets[i]?.has(x))) sets[k].add(x);
        });
      }
    });
    const at = new Map();
    sets.forEach((s, k) =>
      s.forEach((x) => {
        if (!at.has(x)) at.set(x, k);
      })
    );
    const order = new Map();
    c.classes.forEach((cl, k) => order.set(k, k));
    // the first listed class wins
    const best = new Map();
    sets.forEach((s, k) =>
      s.forEach((x) => {
        if (!best.has(x) || k < best.get(x)) best.set(x, k);
      })
    );
    return { c, at: best };
  }
  function colourFn(key, t = tok()) {
    const gray = '#9AA6B2',
      mol = T.mol,
      pdbMode = mol.mode === 'pdb',
      pdb = mol.pdb,
      unp = unpOfAtom();
    const copies = pdbMode && !pdb.pred && !pdb.homolog ? new Set(pdb.e.maps.map((m) => m.chain)) : new Set();
    const other = (a) => (pdb.pred ? t.protein : copies.has(a.chain) ? t.ctxSelf : t.ctx);
    const inR = (pos, list) => list.some(([, a, b]) => pos >= a && pos <= b);
    if (key === 'plddt') return (a) => PLDDT[plBand(a.b)][1];
    if (key === 'features') {
      const doms = units(styleKinds('domains')),
        dis = units(styleKinds('disorder'));
      return (a) => {
        if (pdbMode && a.chain !== pdb.chain) return other(a);
        const pos = unp(a);
        return pos == null ? t.chain : inR(pos, doms) ? t.domain : inR(pos, dis) ? t.dis : t.chain;
      };
    }
    if (key.startsWith('seg:')) {
      const tr = tracks().find((x) => x.kind === key.slice(4)),
        list = (T.rec?.units || []).filter((u) => u[0] === tr.kind);
      return (a) => {
        if (pdbMode && a.chain !== pdb.chain) return t.rest;
        const pos = unp(a);
        if (pos == null) return t.rest;
        const u = list.find(([, s, e]) => pos >= s && pos <= e);
        return u ? segColour(tr, u[5]) : t.none;
      };
    }
    if (key.startsWith('ev:')) {
      const { c, at } = evClasses(key.slice(3));
      return (a) => {
        if (pdbMode && a.chain !== pdb.chain) return t.rest;
        const pos = unp(a);
        if (pos == null) return t.rest;
        const k = at.get(pos);
        return k == null ? t.none : named(c.classes[k].colour, t);
      };
    }
    if (key === 'chain') {
      const { order } = chainsOf();
      return (a) => CHAINS[(order.get(a.chain) || 0) % CHAINS.length];
    }
    if (key === 'rainbow') {
      const { ranges } = chainsOf();
      return (a) => {
        const r = ranges.get(a.chain);
        return r ? ramp(RAINBOW, (a.resi - r[0]) / Math.max(1, r[1] - r[0])) : gray;
      };
    }
    if (key === 'ss') return (a) => SS[a.ss] || SS.c;
    if (key === 'charge')
      return (a) => {
        const r = baseResn(a.resn);
        return r === 'ARG' || r === 'LYS'
          ? CHARGE.basic
          : r === 'HIS'
            ? CHARGE.his
            : r === 'ASP' || r === 'GLU'
              ? CHARGE.acidic
              : CHARGE.other;
      };
    if (key === 'hydro')
      return (a) => {
        const v = KD[baseResn(a.resn)];
        return v == null ? CHARGE.other : ramp(HYDRO, (v + 4.5) / 9);
      };
    return () => gray;
  }
  function keyHtml(key) {
    const t = tok(),
      sw = (c, l) => `<span><i class="sq" style="background:${c}"></i>${esc(l)}</span>`;
    const grad = (stops, a, b) =>
      `<span>${esc(a)}<i class="grad" style="background:linear-gradient(90deg,${stops.join(',')})"></i>${esc(b)}</span>`;
    const pdb = T.mol?.mode === 'pdb' ? T.mol.pdb : null,
      opt = colourOptions().find((o) => o[0] === key) || ['', ''];
    let body = '';
    if (key === 'plddt') body = PLDDT.map((b) => sw(b[1], b[2])).join('');
    else if (key === 'features') {
      const dt = tracks().find((x) => x.style === 'domains'),
        ds = tracks().find((x) => x.style === 'disorder');
      body =
        (dt ? sw(t.domain, dt.title) : '') +
        (ds ? sw(t.dis, ds.title) : '') +
        sw(t.chain, 'Rest of the chain') +
        (pdb
          ? pdb.pred
            ? sw(t.protein, 'Partner')
            : sw(t.ctx, 'Another protein') + (pdb.homolog ? '' : sw(t.ctxSelf, 'Another copy of this protein'))
          : '');
    } else if (key.startsWith('seg:')) {
      const tr = tracks().find((x) => x.kind === key.slice(4)),
        have = new Set((T.rec?.units || []).filter((u) => u[0] === tr.kind).map((u) => u[5]));
      body =
        [...have].map((c) => sw(segColour(tr, c), segLabels(tr)[c] || c || tr.title)).join('') +
        sw(t.none, `Not in a ${tr.title.toLowerCase()} region`);
    } else if (key.startsWith('ev:')) {
      const { c, at } = evClasses(key.slice(3)),
        used = new Set(at.values());
      body =
        c.classes.map((cl, k) => (used.has(k) ? sw(named(cl.colour, t), cl.label) : '')).join('') +
        sw(t.none, c.none || 'None') +
        (pdb ? sw(t.rest, 'Other chains') : '');
    } else if (key === 'chain' && T.mol) {
      const { order } = chainsOf(),
        names = chainNames();
      body =
        [...order.keys()]
          .slice(0, 8)
          .map((c, k) =>
            sw(
              CHAINS[k % CHAINS.length],
              `Chain ${c}${
                pdb && c === pdb.chain ? ' (this protein)' : names[c] ? ' (' + shorten(names[c], 24) + ')' : ''
              }`
            )
          )
          .join('') + (order.size > 8 ? `<span class="muted">+${order.size - 8} more</span>` : '');
    } else if (key === 'rainbow') body = grad(RAINBOW, 'N-terminus', 'C-terminus');
    else if (key === 'ss') body = sw(SS.h, 'Helix') + sw(SS.s, 'Strand') + sw(SS.c, 'Coil');
    else if (key === 'charge')
      body =
        sw(CHARGE.basic, 'Basic (R, K)') +
        sw(CHARGE.his, 'His') +
        sw(CHARGE.acidic, 'Acidic (D, E)') +
        sw(CHARGE.other, 'Other');
    else if (key === 'hydro')
      body = grad(HYDRO, 'Hydrophilic', 'Hydrophobic') + '<span class="muted">Kyte–Doolittle</span>';
    const mk = markLegend()
      .map(([l, c]) => `<span><i class="dot" style="background:${c}"></i>${esc(l)}</span>`)
      .join('');
    const na = T.mol?.naKinds ? [...T.mol.naKinds].map((k) => sw(t[k] || t.rna, KIND_WORD[k])).join('') : '';
    return (
      `<span class="lt">${esc(opt[1])}</span>${body}<span class="lt">${esc(cap(NOUNS))}, ${esc(colourMode().toLowerCase())}</span>${mk}${na}` +
      (pdb && pdb.det.modres?.length ? sw(t.mark, `${cap(NOUN)} modeled in the entry`) : '') +
      (V.contacts && T.mol?.focus ? sw(ELEM_GREY.map.C, 'Contacts within 5 Å') : '')
    );
  }
  function chainNames() {
    const pdb = T.mol?.pdb;
    if (!pdb) return {};
    if (pdb.pred) return pdb.pred.names || {};
    const en = META[UP(pdb.e.id)],
      out = {};
    polymers(en, T.acc.split('-')[0]).forEach((x) =>
      x.chains.forEach((c) => {
        out[c] = x.mine ? `${T.p.gene || T.acc} (another copy)` : x.name;
      })
    );
    return out;
  }

  // ---- drawing --------------------------------------------------------------------------------------------------------------
  // the marks in model numbering with their colors; the mark's components modeled in the entry, in the mark color
  function siteColours(light) {
    const mol = T.mol,
      pdbMode = mol.mode === 'pdb',
      out = new Map();
    for (const m of marks()) {
      const r = pdbMode ? mol.pdb.toAuth.get(m[0]) : m[0];
      if (r != null) out.set(r, light ? exportColour(m) : markColour(m));
    }
    if (pdbMode)
      for (const r of mol.pdb.det.modres || [])
        if (r.chain_id === mol.pdb.chain && !out.has(+r.author_residue_number))
          out.set(+r.author_residue_number, tok(light).mark);
    if (!pdbMode)
      for (const [r] of out) {
        const ca = mol.viewer.selectedAtoms({ resi: r, atom: 'CA' })[0];
        if (ca && !isMarkRes(ca)) out.delete(r);
      }
    return out;
  }
  const exportColour = (m) => {
    const c = colourOf(m).c;
    return c === '#A3AEB3' ? TOK.light.mark : c;
  };
  // the atom a residue's sphere sits on: its side chain's end (TIP), or for a residue it does not know (a modified
  // component, say) the heavy atom farthest from its CA; remembered per model
  function tipName(a) {
    const memo = (T.mol.tips ||= new Map()),
      key = a.chain + ':' + a.resi;
    if (memo.has(key)) return memo.get(key);
    const atoms = T.mol.viewer.selectedAtoms({ chain: a.chain, resi: a.resi }).filter((x) => x.elem !== 'H');
    let name = TIP[baseResn(a.resn)];
    if (!name || !atoms.some((x) => x.atom === name)) {
      const ca = atoms.find((x) => x.atom === 'CA') || atoms[0];
      name = ca
        ? atoms.reduce(
            (best, x) =>
              Math.hypot(x.x - ca.x, x.y - ca.y, x.z - ca.z) > best[1]
                ? [x.atom, Math.hypot(x.x - ca.x, x.y - ca.y, x.z - ca.z)]
                : best,
            ['CA', 0]
          )[0]
        : 'CA';
    }
    memo.set(key, name);
    return name;
  }
  function restyle(reSurface) {
    const mol = T.mol;
    if (!mol || mol.acc !== T.acc) return;
    T.sig = marks()
      .map((m) => m[0])
      .join();
    const v = mol.viewer,
      pdbMode = mol.mode === 'pdb',
      pdb = mol.pdb;
    v.setBackgroundColor(viewBg());
    const light = { ao: 'ambientOcclusion', aoline: 'ambientOcclusion outline', outline: 'outline' }[V.light] || '';
    try {
      v.setViewStyle({
        style: light,
        strength: V.style === 'spheres' || V.surface === 'solid' ? 0.8 : 1,
        color: V.bg === 'black' ? '#FFFFFF' : '#000000',
        width: 0.08,
      });
    } catch (e) {
      /* WebGL1 */
    }
    const lamp = ((v.scene && v.scene.children) || []).find((c) => c && c.intensity != null && c.position && c.target);
    if (lamp) {
      const d = LDIR_V[V.ldir] || LDIR_V.front;
      lamp.intensity = BRIGHT_I[V.bright] || 1;
      lamp.position.set(d[0], d[1], d[2]).normalize();
    }
    const sc = siteColours(false),
      chainSel = pdbMode ? { chain: pdb.chain } : {};
    const siteAt = (a) =>
      (!pdbMode || a.chain === pdb.chain) && sc.has(a.resi) && isMarkRes(a) ? sc.get(a.resi) : null;
    const key = colourKey(),
      base = colourFn(key),
      tinted = (a) => siteAt(a) || base(a);
    const rep =
      {
        cartoon: () => ({ cartoon: { colorfunc: base } }),
        trace: () => ({ cartoon: { style: 'trace', thickness: 0.35, colorfunc: base } }),
        sticks: () => ({ stick: { radius: 0.16, colorfunc: base } }),
        spheres: () => ({ sphere: { colorfunc: tinted } }),
      }[V.style] || (() => ({ cartoon: { colorfunc: base } }));
    v.setStyle({}, rep());
    if (pdbMode && !pdb.pred && key === 'features' && (V.style === 'cartoon' || V.style === 'trace'))
      v.setStyle(
        { predicate: (a) => a.chain !== pdb.chain && !isNuc(a) },
        {
          cartoon: Object.assign(V.style === 'trace' ? { style: 'trace', thickness: 0.25 } : {}, {
            colorfunc: base,
            opacity: 0.55,
          }),
        }
      );
    if (pdbMode) {
      v.setStyle(
        { predicate: (a) => a.hetflag && !isPolymer(a) && !isNuc(a) },
        V.ligands ? { stick: { radius: 0.18, colorscheme: 'greenCarbon' } } : {}
      );
      if (!V.others) v.setStyle({ predicate: (a) => a.chain !== pdb.chain }, {});
      if (mol.naKinds == null) mol.naKinds = new Set(v.selectedAtoms({ predicate: isNuc }).map(nucKind));
      for (const kind of mol.naKinds)
        v.setStyle(
          { predicate: (a) => isNuc(a) && nucKind(a) === kind && (V.others || a.chain === pdb.chain) },
          { cartoon: { color: tok()[kind] }, stick: { radius: 0.13, color: tok()[kind] } }
        );
    }
    v.setStyle({ resn: WATER }, {});
    // the marks' side chains, in their colors, a sphere at the side chain's end
    const byColour = new Map();
    sc.forEach((c, r) => {
      if (!byColour.has(c)) byColour.set(c, []);
      byColour.get(c).push(r);
    });
    byColour.forEach((list, c) => {
      const set = new Set(list),
        on = (a) => set.has(a.resi) && (!pdbMode || a.chain === pdb.chain) && isMarkRes(a);
      v.addStyle(
        { predicate: (a) => on(a) && !BACKBONE.has(a.atom) && a.elem !== 'H' },
        { stick: { radius: 0.28, color: c } }
      );
      v.addStyle({ predicate: (a) => on(a) && a.atom === tipName(a) }, { sphere: { radius: 1.15, color: c } });
    });
    if (pdbMode)
      for (const r of pdb.det.modres || [])
        v.addStyle(
          { chain: r.chain_id, resi: +r.author_residue_number },
          { stick: { radius: 0.3, color: tok().mark } }
        );
    // the RNA or DNA the focused mark touches in this entry (the site's tables): those nucleotides drawn thicker
    if (pdbMode && mol.focus && mol.focusPos != null) {
      for (const b of boundAt(mol.focusPos, pdb.e.id))
        v.addStyle(
          { chain: b[2], resi: b[7].filter((x) => x != null) },
          { stick: { radius: 0.3, color: tok()[b[3]] || tok().rna } }
        );
    }
    if (V.contacts && mol.focus) {
      const f = mol.focus,
        near = v.selectedAtoms({ within: { distance: 5, sel: { chain: f.chain, resi: f.resi } } });
      const keys = new Set(
        near
          .filter(
            (a) =>
              !WATER.includes(a.resn) &&
              (V.others || !pdbMode || a.chain === pdb.chain) &&
              (V.ligands || isPolymer(a) || isNuc(a))
          )
          .map((a) => a.chain + ':' + a.resi)
      );
      keys.delete(f.chain + ':' + f.resi);
      if (keys.size)
        v.addStyle(
          { predicate: (a) => keys.has(a.chain + ':' + a.resi) && (a.hetflag || !['N', 'C', 'O'].includes(a.atom)) },
          { stick: { radius: 0.15, colorscheme: ELEM_GREY } }
        );
      if (!sc.has(f.resi) || (pdbMode && f.chain !== pdb.chain))
        v.addStyle({ chain: f.chain, resi: f.resi }, { stick: { radius: 0.24, colorscheme: ELEM_FOCUS } });
    }
    (mol.siteLabels || []).forEach((l) => v.removeLabel(l));
    mol.siteLabels = [];
    if (V.labels)
      for (const m of marks()) {
        const r = pdbMode ? pdb.toAuth.get(m[0]) : m[0];
        if (r == null || !sc.has(r)) continue;
        const at = v.selectedAtoms(Object.assign({ resi: r }, chainSel)).find((a) => a.atom === tipName(a));
        if (at)
          mol.siteLabels.push(
            v.addLabel(rl(m[0]), {
              position: { x: at.x, y: at.y, z: at.z },
              backgroundColor: sc.get(r),
              backgroundOpacity: 0.85,
              fontColor: '#FFFFFF',
              fontSize: 11,
              inFront: true,
            })
          );
      }
    v.setClickable({}, true, (a) => focusAtom(a));
    const hoverSel = {
      predicate: (a) => (!pdbMode || a.chain === pdb.chain) && sc.has(a.resi) && a.atom === tipName(a),
    };
    const toUnp = (a) => (pdbMode ? (pdb.toUnp.get(a.resi) ?? null) : a.resi);
    v.setHoverable(
      hoverSel,
      true,
      (a, vv) => {
        const hp = toUnp(a);
        if (hp != null) K.site.hover(T.acc, hp, { from: '3d' });
        if (a.hoverLabel || V.labels) return;
        const pos = toUnp(a),
          pl = mol.mode === 'af' || pdb?.pred ? a.b : null;
        a.hoverLabel = vv.addLabel(
          pos != null
            ? `${rl(pos)}${pdbMode && !pdb.pred ? ` (${a.chain}${a.resi})` : ''}${
                pl != null ? ' · pLDDT ' + Math.round(pl) : ''
              }`
            : `${a.resn} ${a.chain}${a.resi}`,
          {
            position: { x: a.x, y: a.y, z: a.z },
            backgroundColor: '#12202C',
            backgroundOpacity: 0.85,
            fontColor: '#FFFFFF',
            fontSize: 12,
            inFront: true,
          }
        );
      },
      (a, vv) => {
        K.site.hover(T.acc, null, { from: '3d' });
        if (a.hoverLabel) {
          vv.removeLabel(a.hoverLabel);
          delete a.hoverLabel;
        }
      }
    );
    v.setClickable(hoverSel, true, (a) => {
      const pos = toUnp(a);
      if (pos == null) focusAtom(a);
      else {
        focusPos(pos);
        tell(pos);
      }
    });
    if (reSurface !== false) surface(tinted);
    v.render();
    fill('s3d-key', keyHtml(key));
  }
  function surface(colorfunc) {
    const mol = T.mol,
      v = mol.viewer,
      gen = (mol.surfGen = (mol.surfGen || 0) + 1);
    v.removeAllSurfaces();
    if (V.surface === 'off') return;
    const ch = mol.mode === 'pdb' ? mol.pdb.chain : null,
      sel = { predicate: (a) => isPolymer(a) && !isNuc(a) && (!ch || a.chain === ch) };
    try {
      v.addSurface('MS', { opacity: V.surface === 'glass' ? 0.55 : 1, colorfunc }, sel, sel, undefined, (id) => {
        if (T.mol !== mol || mol.surfGen !== gen) {
          try {
            v.removeSurface(id);
          } catch (e) {
            /* gone */
          }
        }
        v.render();
      });
    } catch (e) {
      message('The surface could not be drawn here.');
    }
  }
  // the linked views (kit-link.js): a click here says so; a site hovered or focused elsewhere is lit or zoomed to here
  const tell = (pos) => K.site.focus(T.acc, pos, { from: '3d' });
  function hoverShape(pos) {
    const mol = T.mol;
    if (!mol || mol.acc !== T.acc) return;
    if (mol.hoverShape) {
      try {
        mol.viewer.removeShape(mol.hoverShape);
      } catch (e) {
        /* gone */
      }
      mol.hoverShape = null;
    }
    if (pos != null) {
      const pdbMode = mol.mode === 'pdb',
        auth = pdbMode ? (mol.pdb.toAuth.has(pos) ? mol.pdb.toAuth.get(pos) : unpToAuth(pos)) : pos;
      const atoms =
          auth == null
            ? []
            : mol.viewer.selectedAtoms(Object.assign({ resi: auth }, pdbMode ? { chain: mol.pdb.chain } : {})),
        at = atoms.find((a) => a.atom === tipName(a)) || atoms.find((a) => a.atom === 'CA');
      if (at)
        mol.hoverShape = mol.viewer.addSphere({
          center: { x: at.x, y: at.y, z: at.z },
          radius: 1.9,
          color: '#F59E0B',
          alpha: 0.4,
        });
    }
    mol.viewer.render();
  }
  K.site.on((e) => {
    if (e.acc !== T.acc || !T.mol || e.from === '3d') return;
    if (e.kind === 'hover') hoverShape(e.pos);
    else if (e.kind === 'focus') {
      hoverShape(null);
      if (e.pos != null && markAt(e.pos)) focusPos(e.pos);
      else if (e.pos == null && T.mol.focusPos != null) {
        const mol = T.mol;
        if (mol.label) {
          mol.viewer.removeLabel(mol.label);
          mol.label = null;
        }
        mol.focus = null;
        mol.focusPos = null;
        T.highlight = null;
        restyle(false);
        paintSide();
      }
    }
  });
  // focus a residue clicked in the view: zoom to it, label it in UniProt numbering where known, show its contacts
  function focusAtom(a) {
    const mol = T.mol,
      v = mol.viewer,
      pdbMode = mol.mode === 'pdb',
      pred = pdbMode && mol.pdb.pred;
    const unp = pdbMode ? (a.chain === mol.pdb.chain ? authToUnp(a.resi) : null) : a.resi;
    if (unp != null && markAt(unp) && (!pdbMode || a.chain === mol.pdb.chain)) {
      focusPos(unp);
      tell(unp);
      return;
    }
    if (unp != null) K.site.residue(T.acc, unp, { from: '3d' });
    mol.focus = { chain: a.chain, resi: a.resi };
    mol.focusPos = null;
    restyle(false);
    if (mol.label) v.removeLabel(mol.label);
    const ca = v.selectedAtoms({ chain: a.chain, resi: a.resi, atom: 'CA' })[0] || a,
      hom = pdbMode && mol.pdb.homolog;
    const names = chainNames();
    mol.label = v.addLabel(
      pred
        ? `${a.resn} ${a.resi} · ${names[a.chain] || 'chain ' + a.chain} · pLDDT ${Math.round(a.b)}`
        : `${a.resn} ${pdbMode ? a.chain : ''}${a.resi}${
            pdbMode && unp != null
              ? hom
                ? ` (≙ ${T.p.gene || T.acc} ${unp})`
                : ` (UniProt ${unp})`
              : pdbMode && names[a.chain]
                ? ' · ' + shorten(names[a.chain], 30)
                : ''
          }`,
      {
        position: { x: ca.x, y: ca.y, z: ca.z },
        backgroundColor: '#12202C',
        backgroundOpacity: 0.9,
        fontColor: '#FFFFFF',
        fontSize: 12,
        inFront: true,
      }
    );
    const around = [];
    for (let r = a.resi - 6; r <= a.resi + 6; r++) around.push(r);
    v.zoomTo({ chain: a.chain, resi: around }, 600);
    v.render();
    message('');
    paintSide();
  }
  // focus a mark: zoom to its side chain, label it, show what it touches
  function focusPos(pos) {
    const mol = T.mol;
    T.highlight = pos;
    if (!mol || mol.acc !== T.acc) {
      paintSide();
      return;
    }
    const v = mol.viewer,
      pdbMode = mol.mode === 'pdb';
    if (mol.label) {
      v.removeLabel(mol.label);
      mol.label = null;
    }
    const auth = pdbMode ? (mol.pdb.toAuth.has(pos) ? mol.pdb.toAuth.get(pos) : unpToAuth(pos)) : pos;
    const chainSel = pdbMode ? { chain: mol.pdb.chain } : {};
    const atoms = auth == null ? [] : v.selectedAtoms(Object.assign({ resi: auth }, chainSel));
    const at = atoms.find((a) => a.atom === tipName(a)) || atoms.find((a) => a.atom === 'CA');
    if (!at) {
      message(
        `${rl(pos)} is not ${
          pdbMode && mol.pdb.pred
            ? 'in the ' + mol.pdb.pred.label + ' model'
            : 'resolved in ' + (pdbMode ? `${UP(mol.pdb.e.id)} chain ${mol.pdb.chain}` : 'the AlphaFold model')
        }.` + (pdbMode && entriesAt(pos).length ? ' The entries listed for it are under “At this site”.' : '')
      );
      mol.focus = null;
      mol.focusPos = pos;
      restyle(false);
      paintSide();
      return;
    }
    mol.focus = { chain: at.chain, resi: at.resi };
    mol.focusPos = pos;
    restyle(false);
    mol.label = v.addLabel(`${rl(pos)}${pdbMode && !mol.pdb.pred ? ` (${mol.pdb.chain}${auth})` : ''}`, {
      position: { x: at.x, y: at.y, z: at.z },
      backgroundColor: K.accent(),
      backgroundOpacity: 0.95,
      fontColor: '#FFFFFF',
      fontSize: 13,
      inFront: true,
    });
    const around = [];
    for (let r = auth - 6; r <= auth + 6; r++) around.push(r);
    v.zoomTo(Object.assign({ resi: around }, chainSel), 600);
    v.render();
    message('');
    paintSide();
  }

  // ---- what the marks touch: computed in the loaded model, and the site's tables -----------------------------------------
  function liveContacts() {
    const mol = T.mol;
    if (mol.contacts) return mol.contacts;
    const v = mol.viewer,
      pdb = mol.pdb,
      out = [];
    for (const [pos, auth] of pdb.toAuth) {
      const own = v.selectedAtoms({ chain: pdb.chain, resi: auth }),
        reach = REACH[baseResn((own[0] || {}).resn)];
      const side = own.filter((a) => (reach ? reach.includes(a.atom) : !BACKBONE.has(a.atom) && a.atom !== 'CB'));
      if (!side.length) continue;
      const names = new Set(side.map((a) => a.atom));
      const near = v.selectedAtoms({
        within: { distance: 4, sel: { chain: pdb.chain, resi: auth, predicate: (a) => names.has(a.atom) } },
        predicate: (a) => a.chain !== pdb.chain || isNuc(a),
      });
      const hits = new Map();
      for (const a of near) {
        if (WATER.includes(a.resn)) continue;
        const kind = isNuc(a) ? nucKind(a) : a.hetflag && !isPolymer(a) ? null : 'protein';
        if (!kind) continue;
        const k = kind + ':' + a.chain + ':' + a.resi;
        if (!hits.has(k)) hits.set(k, { kind, chain: a.chain, resi: a.resi, resn: a.resn });
      }
      if (hits.size) out.push({ pos, auth, hits: [...hits.values()], b: side[0].b });
    }
    return (mol.contacts = out);
  }
  function predDistances() {
    const mol = T.mol;
    if (mol.dist) return mol.dist;
    const v = mol.viewer,
      pdb = mol.pdb,
      out = [];
    for (const [pos] of pdb.toAuth) {
      const own = v.selectedAtoms({ chain: pdb.chain, resi: pos });
      if (!own.length) continue;
      const near = v.selectedAtoms({
        within: { distance: 8, sel: { chain: pdb.chain, resi: pos } },
        predicate: (a) => a.chain !== pdb.chain,
      });
      let best = null;
      for (const a of near)
        for (const o of own) {
          const d = Math.hypot(a.x - o.x, a.y - o.y, a.z - o.z);
          if (!best || d < best.d) best = { d, a };
        }
      out.push({
        pos,
        d: best ? best.d : null,
        partner: best ? best.a : null,
        b: (own.find((o) => o.atom === 'CA') || own[0]).b,
      });
    }
    return (mol.dist = out.sort((x, y) => (x.d ?? 99) - (y.d ?? 99)));
  }
  const entriesAt = (pos) => (ev().c || []).filter((c) => c[0] === pos);
  const boundAt = (pos, entry) =>
    (ev().b || []).filter((b) => b[0] === pos && (!entry || b[1] === String(entry).toLowerCase()));
  const tableEntries = () => {
    const m = new Map();
    (ev().c || []).forEach((c) =>
      c[2].forEach((id) => {
        if (!m.has(id)) m.set(id, []);
        m.get(id).push(c);
      })
    );
    return m;
  };
  const kindTag = (k, text) => `<span class="s3d-tag k-${esc(k)}">${esc(text || KIND_WORD[k] || k)}</span>`;

  // ---- the panels -------------------------------------------------------------------------------------------------------
  function paint() {
    paintSrc();
    paintControls();
    paintSide();
    paintLists();
    paintSummary();
    setButtons();
    // asked for from elsewhere (K.show3d): the viewer is brought into view once its structure is there
    if (T.scrollTo && T.mol && T.mol.acc === T.acc) {
      T.scrollTo = false;
      requestAnimationFrame(() => requestAnimationFrame(scrollToViewer));
    }
  }
  function setButtons() {
    const on = !!(T.mol && T.mol.acc === T.acc && T.mol.text);
    $$('[data-s3d-need]').forEach((b) => {
      b.disabled = !on;
    });
  }
  function pdbMenu(res) {
    const inRange = (e) =>
        e.maps.length ? marks().filter((m) => e.maps.some((x) => m[0] >= x.unpStart && m[0] <= x.unpEnd)).length : 0,
      te = tableEntries();
    return res.entries
      .filter((e) => e.maps.length || res.modified.has(e.id) || te.has(e.id))
      .map((e) => ({ e, n: inRange(e), mod: res.modified.has(e.id), r: RESOLVED[e.id], at: te.get(e.id) || [] }))
      .sort(
        (a, b) =>
          b.mod - a.mod ||
          (b.r || 0) - (a.r || 0) ||
          b.at.length - a.at.length ||
          b.n - a.n ||
          (a.e.resolution || 99) - (b.e.resolution || 99)
      );
  }
  const RESOLVED = {},
    TRIED = new Set();
  function optLabel({ e, n, r, mod }) {
    const title = META[UP(e.id)]?.struct?.title;
    const sites = mod
      ? `models a ${NOUN}`
      : r != null
        ? r
          ? `${r} site${r === 1 ? '' : 's'} resolved`
          : 'no site resolved'
        : n
          ? `${n} site${n === 1 ? '' : 's'} in construct`
          : 'no site in construct';
    return `${UP(e.id)} · ${methodShort(e.method)}${
      e.resolution ? ' ' + Number(e.resolution).toFixed(1) + ' Å' : ''
    } · ${sites}${title ? ' · ' + shorten(title, 52) : ''}`;
  }
  function paintSrc() {
    const box = document.getElementById('s3d-src');
    if (!box) return;
    const acc = T.acc,
      mol = T.mol && T.mol.acc === acc ? T.mol : null;
    const own = mol && mol.mode === 'pdb' && !mol.pdb.pred && !mol.pdb.homolog ? mol.pdb : null,
      mode = !mol ? null : mol.mode === 'af' ? 'af' : own ? 'pdb' : null;
    const res = T.res,
      best = T.best;
    const target = own ? own.e : best && !best.failed ? best.e : null;
    const list = res ? pdbMenu(res) : [];
    const chains = own ? own.e.maps.map((m) => m.chain).filter((c, k, a) => a.indexOf(c) === k) : [];
    const lab = target
      ? `Experimental · PDB ${UP(target.id)}`
      : best?.failed || res?.failed
        ? 'Experimental (PDBe did not answer; retry)'
        : !res
          ? 'Experimental (looking…)'
          : list.length
            ? 'Experimental'
            : 'Experimental (none)';
    box.innerHTML =
      `<div class="seg" role="group" aria-label="Structure shown"><span class="seg-l">Show</span>` +
      `<button type="button" data-s3d-src="pdb" aria-pressed="${mode === 'pdb'}"${
        !res && !best ? ' disabled' : res && !list.length && !res.failed ? ' disabled' : ''
      }>${esc(lab)}</button>` +
      `<button type="button" data-s3d-src="af" aria-pressed="${mode === 'af'}">AlphaFold model</button></div>` +
      (list.length > 1 || (list.length && !own)
        ? `<label class="s3d-ctl s3d-entry">Entry <select ` +
          `data-s3d-sel="entry" aria-label="Experimental entry to show"><option value="">${own ? '' : 'Choose an entry…'}</option>${list
            .map(
              (x) =>
                `<option value="${esc(x.e.id)}"${
                  own && x.e.id === own.e.id ? ' selected' : ''
                }>${esc(optLabel(x))}</option>`
            )
            .join('')}</select>` +
          `</label><span class="muted small s3d-optkey"> Each entry: PDB code · method and resolution in Å (lower ` +
          `is sharper) · what it resolves</span>`
        : '') +
      (chains.length > 1
        ? `<label class="s3d-ctl">Chain <select data-s3d-sel="chain" aria-label="Chain of this ` +
          `protein">${chains
            .map(
              (c) =>
                `<option value="${esc(c)}"${c === own.chain ? ' selected' : ''}>${esc(c)} · ${esc(
                  own.e.maps
                    .filter((m) => m.chain === c)
                    .map((m) => m.unpStart + '–' + m.unpEnd)
                    .join(', ')
                )}</option>`
            )
            .join('')}</select></label>`
        : '') +
      (own && best && !best.failed && best.e.id === own.e.id && best.det.chain === own.chain
        ? `<span class="muted ` +
          `small">${int(best.obs)} residues observed${
            best.nSites ? `, ${int(best.nSites)} ${best.nSites === 1 ? NOUN : NOUNS}` : ''
          }</span>`
        : own
          ? `<span class="muted ` +
            `small">${int(own.toAuth.size)} ${own.toAuth.size === 1 ? NOUN : NOUNS} resolved in chain ${esc(own.chain)}</span>`
          : '');
  }
  const sel = (key, label, list, cur) =>
    `<label class="s3d-ctl">${label} <select data-s3d-sel="${key}">${list
      .map((o) => `<option value="${esc(o[0])}"${o[0] === cur ? ' selected' : ''}>${esc(o[1])}</option>`)
      .join('')}</select></label>`;
  // the state toggle (both front ends): one chip per state the protein's sites have, each turns its sites on or off in the view
  // what the view shows of the protein's sites, in words, for the exports (both front ends)
  const shownWords = () => {
    if (marks().length === allMarks().length) return '';
    const off = T.hide?.size ? `; states hidden: ${[...T.hide].map(stateName).join(', ')}` : '';
    return `Shows ${marks().length} of ${allMarks().length} ${NOUNS}${
      selOnly() ? ' (those of the current selection and filters: ' + K.sel.describe() + ')' : ''
    }${off}.`;
  };
  function stateRow() {
    const all = allMarks(),
      sp = selSet(),
      pool = sp ? all.filter((m) => sp.has(m[0])) : all,
      counts = new Map();
    pool.forEach((m) => counts.set(stateKey(m), (counts.get(stateKey(m)) || 0) + 1));
    const nSel = sp ? pool.length : 0,
      shown = marks().length;
    const chips =
      counts.size > 1
        ? [...counts.entries()]
            .map(
              ([k, n]) =>
                `<button type="button" class="s3d-chip" ` +
                `data-s3d-state="${esc(k)}" aria-pressed="${!(T.hide && T.hide.has(k))}" title="Show or hide the ${esc(NOUNS)} in this state">${esc(stateName(k))} <span class="muted">${int(n)}</span></button>`
            )
            .join('')
        : '';
    const selChip = K.sel?.active?.()
      ? `<button type="button" class="s3d-chip" data-s3d-selonly aria-pressed="${T.selOff !== true}" title="Show ` +
        `only the ${esc(NOUNS)} of your selection and filters, as the map does">Your selection ${int(nSel || pool.length)} of ${int(all.length)}</button>`
      : '';
    return (
      `<div class="s3d-row s3d-states" role="group" aria-label="Which ${esc(NOUNS)} the view shows">${selChip}${chips}<span class="muted ` +
      `small">${int(shown)} of ${int(all.length)} ${esc(NOUNS)} shown</span></div>`
    );
  }
  function paintControls() {
    const box = document.getElementById('s3d-controls');
    if (!box) return;
    const pdbMode = T.mol?.mode === 'pdb';
    const rows =
      `<div class="s3d-row">${sel('style', 'Style', STYLES, V.style)}${sel(
        'color',
        'Colour',
        colourOptions(),
        colourKey()
      )}${sel('surface', 'Surface', SURFACES, V.surface)}${sel('light', 'Lighting', LIGHTS, V.light)}` +
      `${sel(
        'bright',
        'Brightness',
        BRIGHT,
        V.bright
      )}${sel('ldir', 'Light from', LDIR, V.ldir)}${sel('bg', 'Background', BGS, V.bg)}</div>` +
      `<div class="s3d-row s3d-toggles">${TOGGLES.filter((t) => !t[3] || pdbMode)
        .map(
          (t) =>
            `<button type="button" ` +
            `class="s3d-chip" data-s3d-toggle="${t[0]}" aria-pressed="${!!V[t[0]]}" title="${esc(t[2])}">${esc(t[1])}</button>`
        )
        .join('')}` +
      (`<button type="button" class="linkish" data-s3d-default title="Style, color, surface and lighting back to ` +
        `their defaults">Default settings</button></div>`);
    // the cards front end draws the structure first and folds the options below it; the key stays in sight
    box.innerHTML =
      `<details class="pn-optd" data-s3d-optd${T.optOpen ? ' open' : ''}><summary>3D options <span ` +
      `class="muted">· style, color, surface, lighting, toggles</span></summary>${rows}</details>` +
      `${stateRow()}<div class="s3d-key" id="s3d-key">${
        T.mol && T.mol.acc === T.acc ? keyHtml(colourKey()) : ''
      }</div>`;
  }
  const chip = (pos) => {
    const m = markAt(pos);
    return (
      `<button type="button" class="s3d-site${T.mol?.focusPos === pos ? ' on' : ''}" data-s3d-pos="${pos}"><i class="dot" ` +
      `style="background:${m ? markColour(m) : tok().mark}"></i>${esc(rl(pos))}`
    );
  };
  // the focused mark: what the site's tables say it touches, entry by entry, and the RNA or DNA in this entry
  function focusHtml() {
    const pos = T.highlight;
    if (pos == null || !markAt(pos)) return '';
    const mol = T.mol,
      entry = mol?.mode === 'pdb' && !mol.pdb.pred && !mol.pdb.homolog ? mol.pdb.e.id : null;
    const rows = entriesAt(pos),
      bound = boundAt(pos);
    const cLabel = SD.contacts?.label || 'Interfaces at this site',
      bLabel = SD.bound?.label || 'RNA and DNA bound here';
    const entryBtn = (id) =>
      `<button type="button" class="s3d-entry-btn${id === entry ? ' on' : ''}" data-s3d-entry="${esc(id)}" data-s3d-at="${pos}" title="Show PDB ${esc(UP(id))} at ${esc(rl(pos))}">${esc(UP(id))}</button>`;
    const contacts = rows.length
      ? `<p class="flabel" title="${esc(SD.contacts?.help || '')}">${esc(cLabel)}</p><ul class="s3d-list">` +
        rows
          .map(
            (c) =>
              `<li>${kindTag(c[1])}${c[3] ? ` <b>${esc(c[3])}</b>` : ''}${
                c[4] && byAcc[c[4]]
                  ? ` <a href="${esc(K.link('protein', c[4]))}">${esc(c[4])}</a>`
                  : c[4]
                    ? ` <span class="muted ` + `mono">${esc(c[4])}</span>`
                    : ''
              } <span class="muted">in</span> ${c[2].slice(0, 12).map(entryBtn).join(' ')}${
                c[2].length > 12 ? ` <span class="muted">+${c[2].length - 12}</span>` : ''
              }</li>`
          )
          .join('') +
        '</ul>'
      : '';
    const here = entry ? bound.filter((b) => b[1] === entry) : [];
    const other = bound.filter((b) => b[1] !== entry);
    const bline = (b) =>
      `${kindTag(b[3])} chain ${esc(b[2])}${b[5] ? ` · ${esc(shorten(b[5], 46))}` : ''}${
        b[4] ? ` <span class="muted">(${esc(b[4].replace(/_/g, ' '))})</span>` : ''
      }<br><span ` +
      `class="muted">touches</span> ${b[6]
        .map(
          (n, k) =>
            `${esc(n)}${
              b[7][k] != null
                ? ` <span class="muted">(${esc(b[2])}${b[7][k]}, ${
                    b[8][k] != null ? b[8][k].toFixed(1) + ' Å' : '?'
                  })</span>`
                : ''
            }`
        )
        .join(', ')}${b[9] ? `<br><span ` + `class="mono s3d-win">${esc(b[9])}</span>` : ''}`;
    const boundHtml = here.length
      ? `<p class="flabel" title="${esc(SD.bound?.help || '')}">${esc(bLabel)}, in ${esc(UP(entry))}</p><ul class="s3d-list">${here
          .map((b) => `<li>${bline(b)}</li>`)
          .join('')}</ul>`
      : other.length
        ? `<p class="flabel" title="${esc(SD.bound?.help || '')}">${esc(bLabel)}</p><ul class="s3d-list">${other
            .slice(0, 4)
            .map((b) => `<li>${entryBtn(b[1])} ${bline(b)}</li>`)
            .join('')}${
            other.length > 4 ? `<li class="muted">` + `and ${other.length - 4} more entries</li>` : ''
          }</ul>`
        : '';
    return (
      `<div class="s3d-focus"><p class="flabel">At this site: <b>${esc(rl(pos))}</b> <a href="${esc(
        K.link('protein', T.acc + '/' + pos)
      )}">its card</a></p>${contacts}${boundHtml}` +
      (!rows.length && !bound.length && (SD.contacts || SD.bound)
        ? `<p class="muted small">The site’s tables list ` + `no contact for ${esc(rl(pos))} in the PDB.</p>`
        : '') +
      (rows.length || bound.length ? `<p class="src">${esc(tableWords('contacts') || tableWords('bound'))}</p>` : '') +
      '</div>'
    );
  }
  function paintSide() {
    const side = document.getElementById('s3d-side');
    if (!side) return;
    const mol = T.mol && T.mol.acc === T.acc ? T.mol : null,
      F = focusHtml(); // the focused mark first
    const chips = (list, extra) =>
      `<div class="s3d-chips">${list.map((pos) => chip(pos) + (extra ? extra(pos) : '') + '</button>').join('')}</div>`;
    if (!mol) {
      side.innerHTML = F || '';
      return;
    }
    if (mol.mode === 'af') {
      const af = mol.af,
        e = af.entry,
        inModel = [...siteColours(false).keys()];
      const counts = [0, 0, 0, 0];
      let n = 0;
      inModel.forEach((pos) => {
        const a = mol.viewer.selectedAtoms({ resi: pos, atom: 'CA' })[0];
        if (a) {
          counts[plBand(a.b)]++;
          n++;
        }
      });
      side.innerHTML =
        F +
        (`<dl class="kv"><dt>Model</dt><dd><a href="https://alphafold.ebi.ac.uk/entry/${esc(T.acc)}">${esc(e.entryId)} v${esc(e.latestVersion || '')}</a></dd>` +
          `<dt>Mean pLDDT</dt><dd>${e.globalMetricValue != null ? Number(e.globalMetricValue).toFixed(1) : '–'}</dd>`) +
        (e.paeImageUrl ? `<dt>PAE</dt><dd><a href="${esc(e.paeImageUrl)}">Predicted aligned error</a></dd>` : '') +
        '</dl>' +
        (n
          ? `<p class="flabel">${esc(cap(NOUNS))} by model confidence</p><div class="s3d-stack">${counts
              .map((c, k) =>
                c ? `<i style="flex:${c};background:${PLDDT[k][1]}" title="${esc(PLDDT[k][2])}: ${c}"></i>` : ''
              )
              .join('')}</div>` +
            `<ul class="s3d-legend">${PLDDT.map(
              (b, k) => `<li><i style="background:${b[1]}"></i>${esc(b[2])}<b>${counts[k]}</b></li>`
            ).join('')}</ul>`
          : '') +
        `<p class="note small" id="s3d-am">${e.amAnnotationsUrl ? 'Asking AlphaFold DB for AlphaMissense…' : ''}</p>` +
        (inModel.length
          ? `<div class="s3d-focusbar"><p class="flabel">Focus a site</p>${chips(inModel.sort((a, b) => a - b))}</div>`
          : '');
      if (e.amAnnotationsUrl)
        loadAM(T.acc, e.amAnnotationsUrl).then((am) => {
          const el = document.getElementById('s3d-am');
          if (!el || T.mol !== mol || mol.mode !== 'af') return;
          if (!am) {
            el.textContent = 'AlphaMissense did not answer. Nothing else on this page depends on it.';
            return;
          }
          const vals = marks()
            .map((m) => am.get(m[0]))
            .filter((a) => a && a.n)
            .map((a) => a.sum / a.n);
          el.innerHTML = vals.length
            ? `AlphaMissense: the mean pathogenicity of the substitutions at each ${esc(NOUN)}, averaged over ${int(vals.length)} ${esc(vals.length === 1 ? NOUN : NOUNS)}, is ${(
                vals.reduce((s, x) => s + x, 0) / vals.length
              ).toFixed(2)}; ${vals.filter((x) => x >= 0.564).length} of ${vals.length} are at or ` +
              `above 0.564, AlphaMissense’s cut-off for a likely pathogenic variant.`
            : '';
        });
      return;
    }
    const pdb = mol.pdb,
      e = pdb.e,
      det = pdb.det,
      base = T.acc.split('-')[0];
    const resolved = marks()
      .map((m) => m[0])
      .filter((pos) => pdb.toAuth.has(pos));
    const modres = (det.modres || []).length
      ? `<p class="flabel">${esc(cap(NOUNS))} modeled in the entry</p><div ` +
        `class="s3d-tags">${det.modres
          .map(
            (r) =>
              `<span class="s3d-tag k-mark" title="${esc(r.chem_comp_name || '')}">${esc(r.chem_comp_id)} ${esc(r.chain_id)}${esc(r.author_residue_number)}</span>`
          )
          .join(' ')}</div>`
      : '';
    if (pdb.pred) {
      const p = pdb.pred,
        dist = predDistances(),
        table = new Set(p.tableSites || []);
      side.innerHTML =
        F +
        (`<p class="flabel">Showing a predicted complex</p><dl class="kv"><dt>Model</dt><dd><a ` +
          `href="${esc(p.link)}">${esc(p.label)}</a></dd><dt>Source</dt><dd>${esc(p.method)}</dd>${
            p.scores ? `<dt>Scores</dt><dd>${esc(p.scores)}</dd>` : ''
          }`) +
        `<dt>Chains</dt><dd>${Object.keys(p.names)
          .sort()
          .map((c) => `${esc(c)}: ${esc(p.names[c])}${c === pdb.chain ? ' (this protein)' : ''}`)
          .join(' · ')}</dd></dl>` +
        (resolved.length
          ? `<div class="s3d-focusbar"><p class="flabel">Focus a site</p>${chips(resolved)}</div>`
          : `<p class="muted ` + `small">None of these ${esc(NOUNS)} is in the modeled range.</p>`) +
        (dist.length
          ? `<p class="flabel">Distance to the partner in this model</p><ul class="s3d-list">${dist
              .map(
                (x) =>
                  `<li><button ` +
                  `type="button" class="linkish" data-s3d-pos="${x.pos}">${esc(rl(x.pos))}</button> ` +
                  (x.d == null
                    ? `<span class="muted">more than 8 Å from ${esc(p.partnerLabel)}</span>`
                    : `<b>${x.d.toFixed(1)} Å</b> to ${esc(
                        (p.names[x.partner.chain] || 'chain ' + x.partner.chain) + ' ' + x.partner.resn + x.partner.resi
                      )}${
                        x.d < 2.2
                          ? ' <span class="s3d-tag k-clash" title="Heavy atoms closer than 2.2 Å: a clash in ' +
                            'the model, not a contact">clash</span>'
                          : x.d <= 4
                            ? ' ' + kindTag('protein', 'contact')
                            : ''
                      }`) +
                  ` <span class="muted">· pLDDT ${Math.round(x.b)}</span>${
                    table.has(x.pos) && (x.d == null || x.d > 5)
                      ? `<br><span ` +
                        `class="muted small">The site’s table puts ${esc(rl(x.pos))} at the interface; this model does ` +
                        `not.</span>`
                      : ''
                  }</li>`
              )
              .join('')}</ul>`
          : '') +
        (`<p class="note small">A predicted model, not an experimental structure: weigh each contact by the pLDDT ` +
          `of both residues and by the predicted aligned error${
            p.pae ? ` (<a href="${esc(p.pae)}">PAE plot</a>)` : ''
          }. Color by ` +
          `pLDDT under Color.</p>`) +
        backHtml();
      return;
    }
    const en = META[UP(e.id)],
      polys = polymers(en, base);
    if (en === undefined)
      meta([e.id]).then(() => {
        if (T.mol === mol) {
          paintSide();
          paintControls();
        }
      });
    const chainsHtml = polys.length
      ? `<dt>Chains</dt><dd><ul class="s3d-chains">${polys
          .map(
            (x) =>
              `<li>${kindTag(
                x.mine ? 'self' : x.kind,
                x.mine ? (x.chains.includes(pdb.chain) ? 'this protein' : 'a copy') : KIND_WORD[x.kind]
              )} <span class="mono">${esc(x.chains.join(', '))}</span> ${esc(shorten(x.name, 60))}${
                !x.mine && x.accs[0]
                  ? byAcc[x.accs[0]]
                    ? ` <a href="${esc(K.link('protein', x.accs[0]))}">${esc(x.accs[0])}</a>`
                    : ` <span class="muted ` + `mono">${esc(x.accs[0])}</span>`
                  : ''
              }${x.org && x.kind === 'protein' && !x.mine ? ` <i class="muted">${esc(x.org)}</i>` : ''}</li>`
          )
          .join('')}</ul></dd>`
      : '';
    const contacts = liveContacts();
    const contactsHtml = !contacts.length
      ? `<p class="flabel">Contacts</p><p class="muted small">No resolved ${esc(NOUN)} side chain ` +
        `is within 4 Å of ${mol.naKinds?.size ? 'RNA, DNA or ' : ''}another chain.</p>`
      : `<p class="flabel">${esc(cap(NOUNS))} in contact (≤ 4 Å, in this model)</p><ul class="s3d-list">${contacts
          .map(
            (c) =>
              `<li><button ` +
              `type="button" class="linkish" data-s3d-pos="${c.pos}">${esc(rl(c.pos))}</button> <span class="muted">(${esc(pdb.chain)}${c.auth})</span><br>` +
              ['rna', 'dna', 'protein']
                .map((k) => {
                  const h = c.hits.filter((x) => x.kind === k);
                  if (!h.length) return '';
                  const names = chainNames();
                  return (
                    kindTag(k) +
                    ' <span class="muted">' +
                    esc(
                      h
                        .slice(0, 4)
                        .map((x) => `${x.resn} ${x.chain}${x.resi}`)
                        .join(', ') + (h.length > 4 ? ' +' + (h.length - 4) : '')
                    ) +
                    (k === 'protein' && names[h[0].chain] ? ' · ' + esc(shorten(names[h[0].chain], 28)) : '') +
                    '</span>'
                  );
                })
                .filter(Boolean)
                .join('<br>') +
              '</li>'
          )
          .join('')}</ul>`;
    const tableHere = (ev().c || []).filter((c) => c[2].includes(e.id));
    const tableHtml = tableHere.length
      ? `<p class="flabel" title="${esc(SD.contacts?.help || '')}">${esc(
          SD.contacts?.label || 'Interfaces at the sites'
        )}, in this ` +
        `entry</p><div class="s3d-tags">${tableHere
          .map(
            (c) =>
              `<button type="button" class="s3d-site" data-s3d-pos="${c[0]}">${esc(rl(c[0]))} ${kindTag(c[1], c[3] || KIND_WORD[c[1]])}</button>`
          )
          .join(' ')}</div>`
      : '';
    if (pdb.homolog) {
      const h = pdb.homolog;
      side.innerHTML =
        F +
        (`<p class="flabel">Showing a homologous structure</p><dl class="kv"><dt>Entry</dt><dd>` +
          `<a href="https://www.rcsb.org/structure/${esc(UP(e.id))}">${esc(UP(e.id))}</a></dd><dt>Method</dt><dd>${esc(methodShort(e.method))}${
            e.resolution ? ', ' + Number(e.resolution).toFixed(1) + ' Å' : ''
          }</dd>`) +
        `<dt>Homolog</dt><dd>${esc(h.desc)}${h.org ? ` <i>(${esc(h.org)})</i>` : ''}${
          h.uniprot.length
            ? ' · ' +
              h.uniprot
                .map((a) => `<a href="https://www.uniprot.org/uniprotkb/${esc(a)}/entry">${esc(a)}</a>`)
                .join(', ')
            : ''
        }</dd>` +
        (`<dt>Alignment</dt><dd>${Math.round(100 * h.identity)}% identity over ${esc(T.p.gene || T.acc)} ${h.qBeg}–${h.qEnd}</dd><dt>` +
          `Chain</dt><dd>${esc(det.chain)}</dd>${
            h.partners.length ? `<dt>With</dt><dd>${h.partners.map(esc).join('; ')}</dd>` : ''
          }</dl>`) +
        (resolved.length
          ? `<div class="s3d-focusbar"><p class="flabel">Focus a site <span class="muted">(aligned ` +
            `to this chain)</span></p>${chips(
              resolved,
              (pos) => ` <span class="muted">≙ ${esc(det.chain)}${pdb.toAuth.get(pos)}</span>`
            )}</div>`
          : `<p class="muted ` +
            `small">No ${esc(NOUN)} of ${esc(T.p.gene || T.acc)} aligns to a resolved residue of its kind in this ` +
            `chain.</p>`) +
        modres +
        contactsHtml +
        `` +
        backHtml();
      return;
    }
    side.innerHTML =
      F +
      (`<p class="flabel">Showing PDB entry</p><dl class="kv"><dt>Entry</dt><dd><a ` +
        `href="https://www.rcsb.org/structure/${esc(UP(e.id))}">${esc(UP(e.id))}</a> · <a ` +
        `href="https://www.ebi.ac.uk/pdbe/entry/pdb/${esc(e.id)}">PDBe</a></dd>`) +
      (en
        ? `<dt>Structure</dt><dd>${esc(en.struct?.title || '')}</dd>`
        : en === undefined
          ? '<dt>Structure</dt><dd class="muted">asking RCSB…</dd>'
          : '') +
      `<dt>Method</dt><dd>${esc(methodShort(e.method || en?.rcsb_entry_info?.experimental_method))}${
        e.resolution ? ', ' + Number(e.resolution).toFixed(1) + ' Å' : ''
      }${/NMR/i.test(e.method || '') ? ' (first model of the ensemble)' : ''}</dd>` +
      `<dt>Chain</dt><dd>${esc(pdb.chain || '–')}${
        pdb.guessed
          ? ' (by its residues: PDBe maps no chain of this entry to the protein)'
          : ' (colored by its features; other chains by what they are)'
      }</dd>${chainsHtml}</dl>` +
      modres +
      (`<div class="s3d-focusbar"><p class="flabel">Focus a site <span class="muted">(resolved in this chain)</span>` +
        `</p>${
          resolved.length
            ? chips(resolved, (pos) => ` <span class="muted">· ${esc(pdb.chain)}${pdb.toAuth.get(pos)}</span>`)
            : `<p class="muted ` +
              `small">${
                det.chain && !det.coverage
                  ? `PDBe did not return the residues observed in this chain, so its ${esc(NOUNS)} cannot be ` +
                    `placed; try again later.`
                  : `None of this protein’s ${esc(NOUNS)} is resolved in this chain.`
              }</p>`
        }</div>`) +
      contactsHtml +
      tableHtml +
      backHtml();
  }
  const backHtml = () =>
    T.mol?.mode === 'pdb'
      ? '<p><button type="button" class="btn small" data-s3d-src="af">Back to the AlphaFold model</button></p>'
      : '';

  // ---- the lists: experimental entries, homologous structures, predicted complexes ------------------------------------------
  function paintLists() {
    paintPdbList();
    paintHomologs();
    paintPredicted();
    K.tableBars?.();
  }
  function subSum(id, text) {
    const el = document.querySelector(`#${id} > summary .s3d-ssum`);
    if (el) el.textContent = text ? '· ' + text : '';
  }
  function paintPdbList() {
    const box = document.getElementById('s3d-pdb-list');
    if (!box) return;
    const res = T.res;
    if (!res) {
      box.innerHTML = '<p class="muted">Asking PDBe…</p>';
      subSum('s3d-pdb', 'looking up…');
      return;
    }
    const list = pdbMenu(res),
      nNa = list.filter((x) => res.na.get(x.e.id)).length,
      te = tableEntries();
    subSum(
      's3d-pdb',
      list.length
        ? `${int(list.length)} entr${list.length === 1 ? 'y' : 'ies'}${nNa ? `, ${nNa} with RNA or DNA` : ''}${
            res.modified.size ? `, ${res.modified.size} model a ${NOUN}` : ''
          }`
        : res.failed
          ? 'PDBe did not answer'
          : 'none'
    );
    if (!list.length) {
      box.innerHTML = `<p class="muted">${
        res.failed
          ? 'PDBe did not answer. Nothing else on this page depends on it.'
          : `No experimental ` + `structure in the PDB maps to ${esc(T.acc)}.`
      }</p>`;
      return;
    }
    // which residues each entry models, for up to 40 entries whose construct holds a mark (PDBe), to rank them
    const toRead = list
      .filter((x) => (x.n || x.mod) && x.e.maps.length && !TRIED.has(x.e.id))
      .sort((a, b) => b.n - a.n)
      .slice(0, 40);
    if (toRead.length && T.started) {
      toRead.forEach((x) => TRIED.add(x.e.id));
      const acc = T.acc;
      withTimeout(
        Promise.all(
          toRead.map((x) =>
            loadDetail(x.e.id, x.e.maps[0].chain, x.mod).then((det) => {
              if (det.coverage) RESOLVED[x.e.id] = pdbSites(x.e, det).filter((s) => s[2]).length;
            })
          )
        ),
        8000
      )
        .catch(() => {})
        .then(() => {
          if (T.acc === acc) {
            paintPdbList();
            paintSrc();
          }
        });
    }
    const shown = T.pdbAll ? list : list.slice(0, 10);
    const ids = shown.map((x) => x.e.id).filter((id) => !(UP(id) in META));
    if (ids.length)
      meta(ids).then(() => {
        if (document.getElementById('s3d-pdb-list')) {
          paintPdbList();
          paintSrc();
        }
      });
    const base = T.acc.split('-')[0],
      own = T.mol?.mode === 'pdb' && !T.mol.pdb.pred && !T.mol.pdb.homolog ? T.mol.pdb.e.id : null;
    box.innerHTML =
      `<p class="sub">${int(list.length)} PDB entr${list.length === 1 ? 'y maps' : 'ies map'} to ${esc(base)}${
        res.modified.size ? `; <b>${res.modified.size}</b> model a ${esc(NOUN)}` : ''
      }${te.size ? `; ${int(te.size)} have a contact ` + `at a ${esc(NOUN)}` : ''}.${
        res.failed ? ' The PDBe list did not answer, so only the entries named elsewhere are shown.' : ''
      }</p>` +
      (`<div class="tbl-card"><table class="tbl s3d-tbl"><thead><tr><th>Entry</th><th>Method</th><th class="num">` +
        `Resolution</th><th>Chain · residues</th><th>${esc(cap(NOUNS))}</th><th><span class="sr-only">View</span>` +
        `</th></tr></thead><tbody>`) +
      shown
        .map(({ e, n, mod, at }) => {
          const en = META[UP(e.id)],
            parts = en ? partnersText(en, base) : [],
            na = res.na.get(e.id);
          const r = RESOLVED[e.id];
          return (
            `<tr class="${e.id === own ? 'on' : ''}"><td class="wrapok"><a href="https://www.rcsb.org/structure/${esc(UP(e.id))}"><b>${esc(UP(e.id))}</b></a>${
              mod
                ? ` <span class="s3d-tag ` +
                  `k-mark" title="A ${esc(NOUN)} is modeled in this protein’s chain">${esc(NOUN)} in model</span>`
                : ''
            }${na?.rna ? ' ' + kindTag('rna') : ''}${na?.dna ? ' ' + kindTag('dna') : ''}` +
            (en
              ? `<div class="s3d-what"><span>${esc(shorten(en.struct?.title || '', 110))}</span><span ` +
                `class="muted">${
                  parts.length
                    ? 'With ' +
                      esc(parts.slice(0, 4).join('; ')) +
                      (parts.length > 4 ? ` and ${parts.length - 4} more` : '')
                    : 'No other protein or nucleic acid'
                }</span></div>`
              : '') +
            '</td>' +
            `<td>${esc(methodShort(e.method || en?.rcsb_entry_info?.experimental_method))}</td><td class="num">${
              e.resolution ? Number(e.resolution).toFixed(1) + ' Å' : '–'
            }</td>` +
            `<td>${
              e.maps.length
                ? esc(e.maps[0].chain) +
                  (e.chains.length > 1 ? ` (+${e.chains.length - 1})` : '') +
                  ' · ' +
                  esc(
                    e.maps
                      .filter((m) => m.chain === e.maps[0].chain)
                      .map((m) => m.unpStart + '–' + m.unpEnd)
                      .join(', ')
                  )
                : '<span class="muted">not mapped by PDBe</span>'
            }</td>` +
            `<td class="wrapok">${
              r != null
                ? r
                  ? `<b>${r}</b> resolved`
                  : `<span class="muted">${n} in construct, ` + `none resolved</span>`
                : n
                  ? `${n} in construct`
                  : '<span class="muted">none in construct</span>'
            }` +
            (at.length
              ? `<div class="s3d-tags">${at
                  .map(
                    (c) =>
                      `<button type="button" class="s3d-site" ` +
                      `data-s3d-entry="${esc(e.id)}" data-s3d-at="${c[0]}" title="Show ${esc(UP(e.id))} at ${esc(rl(c[0]))}">${esc(rl(c[0]))} ${kindTag(c[1], c[3] || KIND_WORD[c[1]])}</button>`
                  )
                  .join(' ')}</div>`
              : '') +
            '</td>' +
            `<td><button type="button" class="btn small" data-s3d-entry="${esc(e.id)}">${e.id === own ? 'Shown' : 'View'}</button></td></tr>`
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (list.length > 10
        ? `<p><button type="button" class="linkish" data-s3d-more="pdb">${
            T.pdbAll ? 'Show the first 10' : `Show all ${int(list.length)} entries`
          }</button></p>`
        : '') +
      (`<p class="src">PDBe SIFTS best structures and observed residues, RCSB search and entry descriptions, read ` +
        `live${
          te.size ? `; contacts from ${esc(tableWords('contacts'))}` : ''
        }. <a href="https://www.ebi.ac.uk/pdbe/pdbe-kb/proteins/${esc(base)}">PDBe-KB ${esc(base)}</a></p>`);
  }

  // homologous experimental structures: PDB entities related by sequence (RCSB MMseqs2, ≥ 30% identity) that model
  // the residue aligned to a mark; each mark carried through the alignment
  function loadHomologs() {
    const acc = T.acc,
      seq = T.rec?.seq;
    if (!seq) return Promise.resolve(null);
    if (cache.hom[acc]) return cache.hom[acc];
    const base = acc.split('-')[0],
      sitePos = marks().map((m) => m[0]);
    const q = {
      query: {
        type: 'terminal',
        service: 'sequence',
        parameters: { evalue_cutoff: 1e-3, identity_cutoff: 0.3, sequence_type: 'protein', value: seq },
      },
      return_type: 'polymer_entity',
      request_options: {
        paginate: { start: 0, rows: 500 },
        results_content_type: ['experimental'],
        scoring_strategy: 'sequence',
        results_verbosity: 'verbose',
      },
    };
    const gql = (query) =>
      getJson(
        'https://data.rcsb.org/graphql',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) },
        30000
      );
    const pr = withTimeout(
      fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(q),
      }).then((r) =>
        r.status === 204 ? { result_set: [] } : r.ok ? r.json() : Promise.reject(new Error(String(r.status)))
      ),
      60000
    ).then((d) => {
      const hits = [];
      for (const r of d.result_set || []) {
        const ctx = ((((r.services || [])[0] || {}).nodes || [])[0] || {}).match_context?.[0];
        if (!ctx || !ctx.query_aligned_seq) continue;
        const qa = ctx.query_aligned_seq,
          sa = ctx.subject_aligned_seq,
          align = new Map();
        let qi = ctx.query_beg - 1,
          si = ctx.subject_beg - 1;
        for (let k = 0; k < qa.length; k++) {
          if (qa[k] !== '-') qi++;
          if (sa[k] !== '-') si++;
          if (qa[k] !== '-' && sa[k] !== '-') align.set(qi, [si, sa[k]]);
        }
        const sites = sitePos
          .filter((pos) => align.has(pos))
          .map((pos) => ({ pos, sub: align.get(pos)[0], aa: align.get(pos)[1] }));
        if (sites.length)
          hits.push({
            id: r.identifier,
            entry: r.identifier.split('_')[0],
            identity: ctx.sequence_identity,
            qBeg: ctx.query_beg,
            qEnd: ctx.query_end,
            align,
            sites,
          });
      }
      const entries = [...new Set(hits.map((h) => h.entry))],
        chunks = [];
      for (let k = 0; k < entries.length; k += 80) chunks.push(entries.slice(k, k + 80));
      return Promise.all(
        chunks.map((ids) =>
          gql(
            `{ entries(entry_ids: ${JSON.stringify(ids)}) { rcsb_id struct { ` +
              `title } rcsb_entry_info { resolution_combined experimental_method } polymer_entities { rcsb_id ` +
              `rcsb_polymer_entity { pdbx_description } ` +
              ('rcsb_polymer_entity_container_identifiers { asym_ids auth_asym_ids uniprot_ids ' +
                '} entity_poly { rcsb_entity_polymer_type } rcsb_entity_source_organism { ' +
                'ncbi_scientific_name } } } }')
          )
        )
      ).then((parts) => {
        const metaH = new Map();
        parts.forEach((pt) => ((pt.data || {}).entries || []).forEach((en) => metaH.set(en.rcsb_id, en)));
        const out = [];
        for (const h of hits) {
          const en = metaH.get(h.entry),
            ent = en && (en.polymer_entities || []).find((x) => x.rcsb_id === h.id);
          if (!ent) continue;
          const ids = ent.rcsb_polymer_entity_container_identifiers || {};
          if ((ids.uniprot_ids || []).includes(base)) continue;
          const partners = (en.polymer_entities || [])
            .filter((x) => x.rcsb_id !== h.id)
            .map((x) => {
              const ty = (x.entity_poly || {}).rcsb_entity_polymer_type || '',
                ds = pdbDesc((x.rcsb_polymer_entity || {}).pdbx_description || ty);
              return /RNA/.test(ty) ? 'RNA: ' + ds : /DNA/.test(ty) ? 'DNA: ' + ds : ds;
            });
          const info = en.rcsb_entry_info || {};
          out.push(
            Object.assign(h, {
              desc: pdbDesc((ent.rcsb_polymer_entity || {}).pdbx_description || ''),
              org: ((ent.rcsb_entity_source_organism || [])[0] || {}).ncbi_scientific_name || '',
              uniprot: ids.uniprot_ids || [],
              chain: (ids.auth_asym_ids || [])[0] || null,
              asym: (ids.asym_ids || [])[0] || null,
              partners: [...new Set(partners)],
              title: (en.struct || {}).title || '',
              method: info.experimental_method || '',
              resolution: (info.resolution_combined || [])[0] || null,
            })
          );
        }
        const keep = out.filter((h) => h.chain && h.asym),
          inst = keep.map((h) => h.entry + '.' + h.asym),
          ch2 = [];
        for (let k = 0; k < inst.length; k += 100) ch2.push(inst.slice(k, k + 100));
        return Promise.all(
          ch2.map((ids) =>
            gql(
              `{ polymer_entity_instances(instance_ids: ${JSON.stringify(ids)}) { rcsb_id ` +
                `rcsb_polymer_entity_instance_container_identifiers { auth_asym_id } rcsb_polymer_instance_feature { ` +
                `type feature_positions { beg_seq_id end_seq_id } } } }`
            )
          )
        ).then((pts) => {
          const gaps = new Map();
          pts.forEach((pt) =>
            ((pt.data || {}).polymer_entity_instances || []).forEach((x) => {
              const ranges = [];
              (x.rcsb_polymer_instance_feature || []).forEach((f) => {
                if (f.type === 'UNOBSERVED_RESIDUE_XYZ')
                  (f.feature_positions || []).forEach((q2) =>
                    ranges.push([q2.beg_seq_id, q2.end_seq_id ?? q2.beg_seq_id])
                  );
              });
              gaps.set(x.rcsb_id, {
                ranges,
                auth: (x.rcsb_polymer_entity_instance_container_identifiers || {}).auth_asym_id,
              });
            })
          );
          for (const h of keep) {
            const g = gaps.get(h.entry + '.' + h.asym);
            if (g?.auth) h.chain = g.auth;
            for (const x of h.sites) {
              x.obs = !g || !g.ranges.some(([a, b]) => x.sub >= a && x.sub <= b);
              x.same = x.aa === seqAt(x.pos);
            }
            h.nSame = h.sites.filter((x) => x.same && x.obs).length;
            h.nObs = h.sites.filter((x) => x.obs).length;
          }
          return keep
            .filter((h) => h.nObs)
            .sort(
              (a, b) =>
                (b.nSame > 0) - (a.nSame > 0) ||
                (b.partners.length > 0) - (a.partners.length > 0) ||
                b.nSame - a.nSame ||
                b.identity - a.identity
            );
        });
      });
    });
    cache.hom[acc] = pr.catch(() => {
      delete cache.hom[acc];
      return null;
    });
    return cache.hom[acc];
  }
  function paintHomologs() {
    const box = document.getElementById('s3d-hom-list');
    if (!box) return;
    if (!T.homList) {
      box.innerHTML = T.started
        ? '<p class="muted">Searching the PDB for related proteins (RCSB, live)…</p>'
        : '<p class="muted">The search starts when the structure opens.</p>';
      subSum('s3d-hom', T.started ? 'searching…' : '');
      return;
    }
    if (T.homList === 'failed') {
      box.innerHTML =
        '<p class="muted">The RCSB sequence search did not answer. Nothing else on this page depends on it.</p>';
      subSum('s3d-hom', 'search did not answer');
      return;
    }
    const bySite = new Map();
    for (const h of T.homList)
      for (const x of h.sites) {
        if (!x.same || !x.obs) continue;
        if (!bySite.has(x.pos)) bySite.set(x.pos, []);
        bySite.get(x.pos).push(h);
      }
    const sites = [...bySite.keys()].sort((a, b) => a - b);
    if (!sites.length) {
      box.innerHTML =
        `<p class="muted">No experimental structure of a related protein (≥ 30% ` +
        `identity) models the same residue at these ${esc(NOUNS)}.</p>`;
      subSum('s3d-hom', 'none at these sites');
      return;
    }
    const nEntries = new Set(sites.flatMap((pos) => bySite.get(pos).map((h) => h.entry))).size;
    subSum(
      's3d-hom',
      `${int(sites.length)} of ${int(marks().length)} sites align to the same residue in ${int(nEntries)} entr${nEntries === 1 ? 'y' : 'ies'}`
    );
    const rank = (a, b) =>
      (b.partners.length > 0) - (a.partners.length > 0) ||
      b.identity - a.identity ||
      (a.resolution || 99) - (b.resolution || 99);
    const line = (h, pos) =>
      `<li><button type="button" class="btn small" data-s3d-hom="${esc(h.id)}" data-s3d-at="${pos}">View</button>` +
      ` <a href="https://www.rcsb.org/structure/${esc(h.entry)}"><b>${esc(h.entry)}</b></a> <span class="muted">${esc(methodShort(h.method))}${
        h.resolution ? ' ' + Number(h.resolution).toFixed(1) + ' Å' : ''
      }</span> · ${esc(h.desc)}${
        h.org ? ` <i class="muted">${esc(h.org)}</i>` : ''
      } · ${Math.round(100 * h.identity)}% identity` +
      (h.partners.length
        ? ' · with ' +
          h.partners
            .slice(0, 2)
            .map((y) =>
              kindTag(
                /^RNA:/.test(y) ? 'rna' : /^DNA:/.test(y) ? 'dna' : 'protein',
                shorten(y.replace(/^(RNA|DNA): /, ''), 34)
              )
            )
            .join(' ') +
          (h.partners.length > 2 ? ` +${h.partners.length - 2}` : '')
        : '') +
      '</li>';
    const shown = T.homAll ? sites : sites.slice(0, 12);
    box.innerHTML =
      `<p class="sub">${int(sites.length)} of ${int(marks().length)} ${esc(NOUNS)} align to the same ` +
      `residue, modeled, in ${int(nEntries)} PDB entr${nEntries === 1 ? 'y' : 'ies'} of related proteins (≥ 30% ` +
      `identity).</p>` +
      (`<div class="tbl-card"><table class="tbl s3d-tbl"><thead><tr><th>Site</th><th>Homologous entries with a ` +
        `modeled residue here</th></tr></thead><tbody>`) +
      shown
        .map((pos) => {
          const hs = bySite.get(pos).slice().sort(rank),
            open = T.homOpen.has(pos);
          return (
            `<tr><td><b>${esc(rl(pos))}</b><br><span ` +
            `class="muted">${int(hs.length)} entr${hs.length === 1 ? 'y' : 'ies'}</span></td><td class="wrapok"><ul ` +
            `class="s3d-hl">${hs
              .slice(0, open ? hs.length : 3)
              .map((h) => line(h, pos))
              .join('')}</ul>${
              hs.length > 3
                ? `<button type="button" ` +
                  `class="linkish" data-s3d-homopen="${pos}">${
                    open ? 'Show the top 3' : `Show all ${int(hs.length)}`
                  }</button>`
                : ''
            }</td></tr>`
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (sites.length > 12
        ? `<p><button type="button" class="linkish" ` +
          `data-s3d-more="hom">${
            T.homAll ? 'Show the first 12 sites' : `Show all ${int(sites.length)} sites`
          }</button></p>`
        : '') +
      ('<p class="src">RCSB sequence search (MMseqs2) and entry descriptions, read ' +
        'live. Entries with another protein, RNA or DNA come first, then higher ' +
        'identity; only residues modeled in the deposited chain are listed.</p>');
  }
  function showHomolog(h, focus) {
    const acc = T.acc,
      id = h.entry.toLowerCase(),
      nmr = /NMR/i.test(h.method || '');
    message(`Loading PDB ${h.entry}…`);
    const file = (cache.files[id] ||= nmr
      ? getText(`https://files.rcsb.org/download/${h.entry}.pdb`)
          .then((t) => [t, 'pdb'])
          .catch(() => getText(`https://files.rcsb.org/download/${h.entry}.cif`).then((t) => [t, 'cif']))
      : getText(`https://files.rcsb.org/download/${h.entry}.cif`).then((t) => [t, 'cif']));
    return Promise.all([load3Dmol(), file, loadDetail(id, h.chain, true)])
      .then(([lib, [text, fmt], det]) => {
        if (T.acc !== acc || !viewer(lib)) return;
        const segs = det.coverage || [],
          toAuthNum = (sub) => {
            const s = segs.find(([a, b]) => sub >= a && sub <= b);
            return s && s[2] != null ? s[2] + (sub - s[0]) : null;
          };
        const authToQuery = new Map();
        h.align.forEach(([sub], q) => {
          const a = toAuthNum(sub);
          if (a != null) authToQuery.set(a, q);
        });
        const pairs = h.sites
          .filter((x) => x.same)
          .map((x) => [x.pos, toAuthNum(x.sub)])
          .filter((x) => x[1] != null);
        setModel(text, fmt, {
          mode: 'pdb',
          pdb: {
            e: { id, method: h.method, resolution: h.resolution ? +h.resolution : null, maps: [], chains: [h.chain] },
            det: { chain: h.chain, coverage: segs, modres: det.modres },
            chain: h.chain,
            toAuth: new Map(pairs),
            toUnp: new Map(pairs.map(([a, b]) => [b, a])),
            homolog: Object.assign({}, h, { authToQuery }),
          },
          src: {
            kind: 'pdb',
            id: h.entry,
            what: `PDB ${h.entry} chain ${h.chain}, a homologous structure (${Math.round(100 * h.identity)}% identity)`,
            url: `https://www.rcsb.org/structure/${h.entry}`,
            files: {
              cif: `https://files.rcsb.org/download/${h.entry}.cif`,
              pdb: `https://files.rcsb.org/download/${h.entry}.pdb`,
            },
            tag: h.entry,
            read: today(),
          },
        });
        restyle(true);
        home(T.mol.viewer);
        T.mol.viewer.render();
        message('');
        paint();
        const f = focus ?? pairs[0]?.[0];
        if (f != null) focusPos(f);
      })
      .catch((err) => {
        message(`PDB ${h.entry} could not be loaded (${esc(err.message)}).`);
      });
  }

  // predicted complexes: the partners the site's tables name at a mark (each model loaded live from ProtVar or
  // AlphaFold DB), and AlphaFold DB's complexes of the protein (live)
  const PROTVAR = (a, b) =>
    `https://www.ebi.ac.uk/ProtVar/api/prediction/interaction/${encodeURIComponent(a)}/${encodeURIComponent(b)}/model`;
  function predPartners() {
    const out = new Map();
    for (const r of ev().p || []) {
      const [pos, partner, pacc, src, model, score, dist] = r,
        source = src || (/^AF-/.test(model || '') ? 'AlphaFold DB' : /_/.test(model || '') ? 'ProtVar' : ''),
        key = pacc + '|' + (source || '');
      if (!out.has(key))
        out.set(key, { partner, acc: pacc, source, model: '', score: null, sites: new Set(), dist: new Map() });
      const x = out.get(key);
      x.sites.add(pos);
      if (model) x.model ||= model;
      if (score != null) x.score = Math.max(x.score ?? -1, score);
      if (dist != null) x.dist.set(pos, dist);
    }
    return [...out.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.sites.size - a.sites.size);
  }
  function paintPredicted() {
    const box = document.getElementById('s3d-pred-list');
    if (!box) return;
    const base = T.acc.split('-')[0],
      pv = predPartners(),
      acc = T.acc;
    const tableHtml = !SD.predicted
      ? ''
      : pv.length
        ? `<p class="flabel" title="${esc(SD.predicted.help || '')}">${esc(
            SD.predicted.label || 'Predicted partners at a site'
          )}</p><div ` +
          `class="tbl-card"><table class="tbl s3d-tbl"><thead><tr><th>Partner</th><th>Source</th><th class="num">` +
          `Score</th><th>${esc(cap(NOUNS))} at the interface</th><th><span class="sr-only">View</span></th></tr>` +
          `</thead><tbody>` +
          pv
            .slice(0, T.predAll ? pv.length : 12)
            .map(
              (x, k) =>
                `<tr><td>${
                  byAcc[x.acc]
                    ? `<a href="${esc(K.link('protein', x.acc))}"><b>${esc(x.partner || x.acc)}</b></a>`
                    : `<b>${esc(x.partner || x.acc)}</b>`
                } <span class="muted ` +
                `mono">${esc(x.acc)}</span></td><td>${esc(x.source || '')}</td><td class="num">${
                  x.score != null ? x.score.toFixed(2) : '–'
                }</td>` +
                `<td class="wrapok">${[...x.sites]
                  .sort((a, b) => a - b)
                  .slice(0, 10)
                  .map(
                    (p) =>
                      esc(rl(p)) + (x.dist.has(p) ? ` <span class="muted">${x.dist.get(p).toFixed(1)} Å</span>` : '')
                  )
                  .join(', ')}${x.sites.size > 10 ? ` +${x.sites.size - 10}` : ''}</td>` +
                `<td><button type="button" class="btn small" data-s3d-pred="${k}">View</button></td></tr>`
            )
            .join('') +
          '</tbody></table></div>' +
          (pv.length > 12
            ? `<p><button type="button" class="linkish" data-s3d-more="pred">${
                T.predAll ? 'Show the top 12' : `Show all ${int(pv.length)} partners`
              }</button></p>`
            : '') +
          (`<p class="src">${esc(tableWords('predicted'))}; models ` + `read live.</p>`)
        : `<p class="muted">The site’s tables name no predicted complex with a ${esc(NOUN)} at the interface.</p>`;
    box.innerHTML =
      tableHtml + '<div id="s3d-afcx"><p class="muted">Asking AlphaFold DB for predicted complexes…</p></div>';
    T.predList = pv;
    (cache.cx[base] ||= getJson(`https://alphafold.ebi.ac.uk/api/complex/${encodeURIComponent(base)}`).then(
      (d) =>
        (Array.isArray(d) ? d : [])
          .filter((x) => x.isComplex !== false && (x.uniprotAccession || []).includes(base))
          .sort((a, b) => (b.complexPredictionAccuracy_ipTM || 0) - (a.complexPredictionAccuracy_ipTM || 0)),
      (e) => (String(e.message) === '404' ? [] : (delete cache.cx[base], null))
    )).then((list) => {
      const hold = document.getElementById('s3d-afcx');
      if (!hold || T.acc !== acc) return;
      subSum(
        's3d-pred',
        [
          SD.predicted ? `${int(pv.length)} partner${pv.length === 1 ? '' : 's'} at a site` : '',
          list?.length
            ? `${int(list.length)} AlphaFold ` + `DB complex${list.length === 1 ? '' : 'es'}`
            : list
              ? '' // a 404: AlphaFold DB has none for this protein, which is not worth a line
              : 'AlphaFold DB did not answer',
        ]
          .filter(Boolean)
          .join(' · ')
      );
      if (list === null) {
        hold.innerHTML = '<p class="muted">AlphaFold DB did not answer. Nothing else on this page depends on it.</p>';
        return;
      }
      if (!list.length) {
        hold.innerHTML = ''; // none predicted (the API's 404): hidden quietly
        return;
      }
      T.afcx = list;
      const num = (v) => (v == null ? '–' : Number(v).toFixed(2));
      const partners = (x) => {
        const orgs = x.organismScientificName || [],
          mine = orgs[(x.uniprotAccession || []).indexOf(base)] || orgs[0];
        const o = (x.uniprotAccession || []).map((a, k) => [a, k]).filter(([a]) => a !== base);
        return o.length
          ? o
              .map(
                ([a, k]) =>
                  `${
                    byAcc[a]
                      ? `<a href="${esc(K.link('protein', a))}"><b>${esc((x.gene || [])[k] || a)}</b></a>`
                      : `<b>${esc((x.gene || [])[k] || a)}</b>`
                  } <span class="muted ` +
                  `mono">${esc(a)}</span>${orgs[k] && orgs[k] !== mine ? ` <i class="muted">${esc(orgs[k])}</i>` : ''}`
              )
              .join(', ')
          : `<b>${esc(T.p.gene || base)}</b> ${kindTag('self', 'homodimer')}`;
      };
      hold.innerHTML =
        '<p class="flabel">AlphaFold DB complexes</p><div class="tbl-card"><table ' +
        'class="tbl s3d-tbl"><thead><tr><th>Partner</th><th class="num">ipTM</th><th ' +
        'class="num">pDockQ</th><th class="num">Mean pLDDT</th><th><span ' +
        'class="sr-only">View</span></th></tr></thead><tbody>' +
        list
          .map(
            (x, k) =>
              `<tr><td>${partners(x)}</td><td class="num">${num(x.complexPredictionAccuracy_ipTM)}</td><td ` +
              `class="num">${num(x.complexPredictionAccuracy_pDockQ)}</td><td class="num">${
                x.globalMetricValue != null ? Number(x.globalMetricValue).toFixed(1) : '–'
              }</td><td>` +
              `<button type="button" class="btn small" data-s3d-afcx="${k}">View</button></td></tr>`
          )
          .join('') +
        ('</tbody></table></div><p class="src">AlphaFold DB predicted complexes (CC BY ' +
          '4.0), read live. EMBL-EBI’s guidance: ipTM above 0.8 is a confident prediction, ' +
          'below 0.6 likely a failed one; low pLDDT in disordered regions can lower ipTM ' +
          'even when the complex is right.</p>');
    });
  }
  // a predicted model: spec() resolves to {url, chain, names, label, method, scores, link, pae}; numbering is UniProt's
  function showModel(spec, focus) {
    const acc = T.acc;
    message('Loading the predicted model…');
    return Promise.all([load3Dmol(), spec()])
      .then(([lib, m]) => getText(m.url).then((text) => [lib, m, text]))
      .then(([lib, m, text]) => {
        if (T.acc !== acc || !viewer(lib)) return;
        if (!/^ATOM/m.test(text)) throw new Error('the model is empty');
        setModel(text, 'pdb', { mode: 'pdb' });
        const v = T.mol.viewer;
        // a served model's chains can be the other way round: this protein's chain is the one with the marks' residues
        if (m.names && (m.chain === 'A' || m.chain === 'B')) {
          const other = m.chain === 'A' ? 'B' : 'A',
            at = (ch) => {
              const rn = new Map(v.selectedAtoms({ chain: ch, atom: 'CA' }).map((a) => [a.resi, a]));
              return marks().filter((x) => rn.get(x[0]) && isMarkRes(rn.get(x[0]))).length;
            };
          if (at(other) > at(m.chain))
            m = Object.assign({}, m, { chain: other, names: { A: m.names.B, B: m.names.A } });
        }
        const present = new Set(v.selectedAtoms({ chain: m.chain, atom: 'CA' }).map((a) => a.resi)),
          sites = marks()
            .map((x) => x[0])
            .filter((pos) => present.has(pos));
        Object.assign(T.mol, {
          pdb: {
            e: { id: m.id, method: m.method, resolution: null, maps: [], chains: [m.chain] },
            det: { chain: m.chain, coverage: null, modres: [] },
            chain: m.chain,
            toAuth: new Map(sites.map((x) => [x, x])),
            toUnp: new Map(sites.map((x) => [x, x])),
            pred: m,
          },
          src: {
            kind: 'pred',
            what: `${m.label} (predicted complex, ${m.method})`,
            url: m.link,
            files: { pdb: m.url },
            tag: String(m.id).replace(/[^A-Za-z0-9]+/g, '_'),
            read: today(),
            format: 'pdb',
          },
        });
        if (V.color === 'features') V.color = 'plddt';
        restyle(true);
        v.zoomTo();
        v.render();
        message('');
        paint();
        if (focus != null && present.has(focus)) focusPos(focus);
      })
      .catch((err) => message(`The predicted model could not be loaded (${esc(err.message)}).`));
  }
  function viewPred(x) {
    const base = T.acc.split('-')[0],
      me = T.p.gene || base,
      other = x.partner || x.acc,
      first = [...x.sites].sort((a, b) => a - b)[0];
    if (/^AF-/.test(x.model))
      return viewAfdb(
        x.model,
        `${x.source || 'AlphaFold DB'}${x.score != null ? ' · score ' + x.score.toFixed(2) : ''}`,
        first
      );
    const pair = /^([A-Z0-9-]+)_([A-Z0-9-]+)$/i.exec(x.model || '');
    const orders = pair
      ? [[pair[1], pair[2]]]
      : [
          [base, x.acc],
          [x.acc, base],
        ];
    return showModel(
      () =>
        (function tryOrder(k) {
          const [a, b] = orders[k],
            url = PROTVAR(a, b);
          return getText(url)
            .then((t) => {
              if (!/^ATOM/m.test(t)) throw new Error('empty');
              cache.files[url] = Promise.resolve(t);
              return url;
            })
            .then(
              (u) => ({
                id: `protvar_${a}_${b}`,
                url: u,
                chain: a === base ? 'A' : 'B',
                label: `ProtVar ${me}–${other}`,
                method: 'AlphaFold-Multimer via ProtVar (EMBL-EBI)',
                scores: x.score != null ? `score ${x.score.toFixed(2)}` : '',
                link: u,
                pae: null,
                names: a === base ? { A: me, B: other } : { A: other, B: me },
                partnerLabel: other,
                tableSites: [...x.sites],
              }),
              (err) =>
                k + 1 < orders.length
                  ? tryOrder(k + 1)
                  : Promise.reject(new Error('ProtVar serves no model for this pair'))
            );
        })(0),
      first
    );
  }
  function viewAfdb(id, scores, focus) {
    const base = T.acc.split('-')[0];
    return showModel(
      () =>
        getJson(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(id)}`).then((chains) => {
          const mine = chains.find((c) => c.uniprotAccession === base) || chains[0],
            names = {};
          chains.forEach((c) => {
            names[c.chainId] = c.gene || c.uniprotAccession;
          });
          return {
            id,
            url: mine.pdbUrl,
            chain: mine.chainId,
            label: id,
            names,
            partnerLabel:
              chains
                .filter((c) => c.chainId !== mine.chainId)
                .map((c) => c.gene || c.uniprotAccession)
                .join(', ') ||
              T.p.gene ||
              base,
            scores,
            method: (mine.toolUsed || 'AlphaFold-Multimer') + ' via AlphaFold DB',
            link: `https://alphafold.ebi.ac.uk/entry/${encodeURIComponent(id)}`,
            pae: mine.paeImageUrl || null,
          };
        }),
      focus
    );
  }

  // ---- the fold's summary --------------------------------------------------------------------------------------------------
  function summaryText() {
    const mol = T.mol && T.mol.acc === T.acc ? T.mol : null,
      res = T.res,
      parts = [];
    if (mol)
      parts.push(
        mol.mode === 'af'
          ? `AlphaFold model, mean pLDDT ${Number(mol.af.entry.globalMetricValue).toFixed(1)}`
          : mol.pdb.pred
            ? mol.pdb.pred.label
            : `PDB ${UP(mol.pdb.e.id)} chain ${mol.pdb.chain}${mol.pdb.homolog ? ' (homolog)' : ''}`
      );
    if (res) {
      const n = pdbMenu(res).length;
      parts.push(
        n ? `${int(n)} PDB entr${n === 1 ? 'y' : 'ies'}` : res.failed ? 'PDBe did not answer' : 'no PDB entry'
      );
    }
    const c = ev().c || [];
    if (c.length) {
      const s = new Set(c.map((x) => x[0]));
      parts.push(`${int(s.size)} ${s.size === 1 ? NOUN : NOUNS} at a PDB interface`);
    }
    return parts.join(' · ') || 'AlphaFold DB, PDBe and RCSB, live';
  }
  function paintSummary() {
    const el = document.querySelector('#p-struct > summary .fsum');
    if (el) el.textContent = summaryText();
  }

  // ---- the view outside the page: a figure, scripts that rebuild it, coordinates ----------------------------------------------
  // the canvas at three times its size (a sharper image for print), then back
  function snapshot(scale = 3) {
    const v = T.mol.viewer,
      d = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    let uri;
    try {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => scale });
      v.resize();
      v.render();
      uri = v.pngURI();
    } finally {
      if (d) Object.defineProperty(window, 'devicePixelRatio', d);
      else delete window.devicePixelRatio;
      v.resize();
      v.render();
    }
    return uri;
  }
  function provenance() {
    const mol = T.mol,
      src = mol.src,
      used = ['contacts', 'bound', 'predicted', 'residues'].filter(
        (k) =>
          SD.inputs?.[k]?.length &&
          (k === 'residues'
            ? colourKey().startsWith('ev:')
            : k === 'predicted'
              ? !!mol.pdb?.pred && (ev().p || []).length
              : (ev()[k[0]] || []).length)
      );
    return {
      structure: {
        shown: src.what,
        from: src.url,
        read_live: `${src.read}, ${
          src.kind === 'af' ? 'AlphaFold DB' : src.kind === 'pred' ? 'the model’s server' : 'RCSB PDB'
        }`,
        placed_by:
          src.kind === 'pdb'
            ? mol.pdb.homolog
              ? 'RCSB sequence alignment (MMseqs2) and PDBe observed residues, read live'
              : mol.pdb.guessed
                ? 'author numbering (no PDBe mapping for this entry)'
                : 'PDBe SIFTS mapping and observed residues, read live'
            : 'UniProt numbering of the model',
        viewer: LIB_CITE,
      },
      site_tables: Object.fromEntries(
        used.map((k) => [
          k,
          inputsOf(k).map((x) => ({ input: x.name, version: x.version || '', licence: x.licence || '', md5: x.md5 })),
        ])
      ),
      colouring: (colourOptions().find((o) => o[0] === colourKey()) || [])[1],
      marks_coloured_by: colourMode(),
    };
  }
  function sourceLine() {
    const pr = provenance(),
      tables = Object.entries(pr.site_tables);
    return (
      `Structure: ${pr.structure.shown}, read live from ${pr.structure.read_live
        .split(', ')
        .slice(1)
        .join(', ')} on ${pr.structure.read_live.split(', ')[0]}; residues ` +
      `placed by ${pr.structure.placed_by}. ` +
      (tables.length
        ? `From the site’s tables: ${tables
            .map(
              ([k, xs]) =>
                `${k} (${xs.map((x) => `${dateWords(x.version) || x.input}, MD5 ${x.md5.slice(0, 8)}…`).join('; ')})`
            )
            .join('; ')}. `
        : 'Nothing in this view comes from the site’s own tables except the marks. ') +
      `Drawn with ${LIB_CITE}.`
    );
  }
  function figure() {
    const mol = T.mol,
      uri = snapshot(3),
      el = mol.el,
      w = 720,
      h = Math.round((w * (el.clientHeight || 480)) / (el.clientWidth || 720));
    const legend = markLegend().map(([l, c]) => [c, c, l]);
    const key = colourKey(),
      opt = colourOptions().find((o) => o[0] === key);
    const sw = keyItems(key),
      parts = [
        `<image x="20" y="0" width="${w}" height="${h}" href="${uri}" preserveAspectRatio="xMidYMid ` + `meet"/>`,
      ];
    let x = 20,
      y = h + 18;
    parts.push(`<text x="20" y="${y}" font-size="10.5" font-weight="bold" fill="#5f6f78">${esc(opt[1])}</text>`);
    y += 14;
    sw.forEach(([c, l]) => {
      const wd = 18 + K.tw(l, 10.5);
      if (x + wd > 740) {
        x = 20;
        y += 15;
      }
      parts.push(
        `<rect x="${x}" y="${y - 9}" width="10" ` +
          `height="10" rx="2" fill="${c}"/><text x="${x + 14}" y="${y}" font-size="10.5" fill="#5f6f78">${esc(l)}</text>`
      );
      x += wd + 10;
    });
    const f = K.figureFrame({
      title: `${T.p.gene || T.acc} (${T.acc}): ${mol.src.what}`,
      sub:
        `${shownWords() ? shownWords() + ' ' : ''}${cap(NOUNS)} as side ` +
        `chains with a sphere, colored by ${colourMode().toLowerCase()}; the chain colored by ${opt[1].toLowerCase()}.${
          mol.focusPos != null ? ' Focused: ' + rl(mol.focusPos) + '.' : ''
        }`,
      legend,
      body: parts.join(''),
      bodyH: y + 6,
      W: 760,
      note: sourceLine(),
      extra: { protein: T.acc, ...provenance() },
    });
    return f;
  }
  function keyItems(key) {
    const t = TOK.light;
    if (key === 'plddt') return PLDDT.map((b) => [b[1], b[2]]);
    if (key === 'features') {
      const dt = tracks().find((x) => x.style === 'domains'),
        ds = tracks().find((x) => x.style === 'disorder');
      return [
        ...(dt ? [[t.domain, dt.title]] : []),
        ...(ds ? [[t.dis, ds.title]] : []),
        [t.chain, 'Rest of the chain'],
        ...(T.mol.mode === 'pdb' ? [[t.ctx, 'Other chains']] : []),
      ];
    }
    if (key.startsWith('seg:')) {
      const tr = tracks().find((x) => x.kind === key.slice(4));
      return [...new Set((T.rec.units || []).filter((u) => u[0] === tr.kind).map((u) => u[5]))].map((c) => [
        segColour(tr, c),
        segLabels(tr)[c] || c,
      ]);
    }
    if (key.startsWith('ev:')) {
      const { c, at } = evClasses(key.slice(3)),
        used = new Set(at.values());
      return [
        ...c.classes.map((cl, k) => (used.has(k) ? [named(cl.colour, t), cl.label] : null)).filter(Boolean),
        [t.none, c.none || 'None'],
      ];
    }
    if (key === 'ss')
      return [
        [SS.h, 'Helix'],
        [SS.s, 'Strand'],
        [SS.c, 'Coil'],
      ];
    if (key === 'charge')
      return [
        [CHARGE.basic, 'Basic (R, K)'],
        [CHARGE.his, 'His'],
        [CHARGE.acidic, 'Acidic (D, E)'],
        [CHARGE.other, 'Other'],
      ];
    if (key === 'rainbow')
      return [
        [RAINBOW[0], 'N-terminus'],
        [RAINBOW[4], 'C-terminus'],
      ];
    if (key === 'hydro')
      return [
        [HYDRO[0], 'Hydrophilic'],
        [HYDRO[2], 'Hydrophobic (Kyte–Doolittle)'],
      ];
    if (key === 'chain') {
      const { order } = chainsOf();
      return [...order.keys()].slice(0, 10).map((c, k) => [CHAINS[k % CHAINS.length], `Chain ${c}`]);
    }
    return [];
  }
  function tsv() {
    const mol = T.mol,
      pdbMode = mol.mode === 'pdb',
      pdb = mol.pdb,
      contacts = pdbMode && !pdb.pred ? new Map(liveContacts().map((c) => [c.pos, c])) : new Map();
    const head = K.preamble(
      `${T.p.gene || T.acc} (${T.acc}) in 3D: ${mol.src.what}`,
      `each ${NOUN} of ${T.p.gene || T.acc} and where ` +
        `it is in this model: its chain and residue number, whether the model has it, its color category, its ` +
        `confidence where the model has one, what it touches in the model (side chain within 4 Å) and what the ` +
        `site’s tables list for it. ${sourceLine()}`
    );
    const cols = [
      'site',
      'position',
      'model',
      'chain',
      'model_residue',
      'in_model',
      colourMode().toLowerCase().replace(/\W+/g, '_'),
      'plddt',
      'touches_in_model',
      'pdb_interfaces_in_tables',
      'bound_in_this_entry',
    ];
    const rows = marks().map((m) => {
      const pos = m[0],
        auth = pdbMode ? pdb.toAuth.get(pos) : pos,
        atoms =
          auth == null
            ? []
            : mol.viewer.selectedAtoms(Object.assign({ resi: auth, atom: 'CA' }, pdbMode ? { chain: pdb.chain } : {}));
      const c = contacts.get(pos),
        pl = (mol.mode === 'af' || pdb?.pred) && atoms[0] ? Math.round(atoms[0].b * 10) / 10 : '';
      return [
        rl(pos),
        pos,
        mol.src.tag,
        pdbMode ? pdb.chain : 'A',
        auth ?? '',
        atoms.length ? 'yes' : 'no',
        colourOf(m).label || '',
        pl,
        c ? c.hits.map((x) => `${x.kind}:${x.chain}${x.resi}`).join('; ') : '',
        entriesAt(pos)
          .map((x) => `${x[1]}${x[3] ? '(' + x[3] + ')' : ''}: ${x[2].join(' ')}`)
          .join(' | '),
        pdbMode && !pdb.pred
          ? boundAt(pos, pdb.e.id)
              .map((b) => `${b[3]} ${b[2]}: ${b[6].join(' ')}`)
              .join(' | ')
          : '',
      ].join('\t');
    });
    return head + cols.join('\t') + '\n' + rows.join('\n') + '\n';
  }
  function sceneData() {
    const mol = T.mol,
      v = mol.viewer,
      t = TOK.light,
      pdbMode = mol.mode === 'pdb',
      pdb = mol.pdb,
      key = colourKey(),
      fn = colourFn(key, t);
    const polymer = new Map(),
      ligands = new Set();
    for (const a of v.selectedAtoms({})) {
      if (WATER.includes(a.resn) || (pdbMode && !V.others && a.chain !== pdb.chain)) continue;
      const nuc = isNuc(a);
      if (!nuc && !isPolymer(a)) {
        ligands.add(a.chain);
        continue;
      }
      if (nuc ? a.atom !== 'P' && a.atom !== "C4'" : a.atom !== 'CA') continue;
      if (!polymer.has(a.chain)) polymer.set(a.chain, new Map());
      const mm = polymer.get(a.chain);
      if (!mm.has(a.resi)) mm.set(a.resi, nuc ? t[nucKind(a)] : fn(a));
    }
    const chains = [...polymer].map(([chain, mm]) => {
      const ranges = [];
      for (const r of [...mm.keys()].sort((x, y) => x - y)) {
        const last = ranges[ranges.length - 1];
        if (last && r === last[1] + 1 && mm.get(r) === last[2]) last[1] = r;
        else ranges.push([r, r, mm.get(r)]);
      }
      return { chain, ranges };
    });
    const chain = pdbMode ? pdb.chain : (chains[0] || { chain: 'A' }).chain,
      sc = siteColours(true),
      unpOf = (r) => (pdbMode ? pdb.toUnp.get(r) : r);
    const sites = [...sc]
      .map(([resi, color]) => ({ resi, color, unp: unpOf(resi) }))
      .filter((x) => polymer.get(chain)?.has(x.resi))
      .sort((a, b) => a.resi - b.resi);
    const label = (x) => (x.unp != null ? rl(x.unp) : 'residue ' + x.resi);
    const labels = V.labels
      ? sites.map((x) => [x.resi, label(x)])
      : mol.focus && mol.focus.chain === chain
        ? sites.filter((x) => x.resi === mol.focus.resi).map((x) => [x.resi, label(x)])
        : [];
    const opt = colourOptions().find((o) => o[0] === key);
    return {
      src: mol.src,
      chains,
      chain,
      sites,
      labels,
      focus: mol.focus,
      style: V.style,
      surface: V.surface,
      contacts: V.contacts && !!mol.focus,
      outline: V.light === 'outline' || V.light === 'aoline',
      light: V.light,
      ligands: pdbMode && V.ligands && ligands.size > 0,
      others: !pdbMode || V.others,
      bg: V.bg === 'black' ? 'black' : 'white',
      text: mol.text,
      fmt: mol.fmt,
      file: `${T.p.gene || T.acc}_${mol.src.tag}_${NOUNS.replace(/\W+/g, '_')}`,
      header: [
        `${T.p.gene || T.acc} (${T.acc}), ${mol.src.what}`,
        `Cartoon coloring: ${opt[1]}`,
        ...(shownWords() ? [shownWords()] : []),
        `${cap(NOUN)} side chains, ${colourMode()}: ${markLegend()
          .map(([l]) => l)
          .join(', ')}`,
        sourceLine(),
        `From ${D.site.name} (${location.href.split('#')[0]}). ${
          K.CIT?.preferred
            ? 'Please cite ' +
              K.CIT.preferred.text.replace(/\.\s*$/, '') +
              (K.CIT.preferred.doi ? ', doi:' + K.CIT.preferred.doi : '') +
              ', '
            : 'Please cite '
        }the structure ` + `source and the original data sources.`,
      ],
    };
  }
  const cxRes = (ranges) =>
    ranges
      .map(([a, b]) =>
        a === b ? '' + a : a >= 0 ? a + '-' + b : Array.from({ length: b - a + 1 }, (_, k) => a + k).join(',')
      )
      .join(',');
  const pmRes = (ranges) =>
    ranges
      .map(([a, b]) => {
        const e = (n) => (n < 0 ? '\\' + n : '' + n);
        return a === b ? e(a) : e(a) + '-' + e(b);
      })
      .join('+');
  const byCol = (ranges) => {
    const m = new Map();
    for (const [a, b, c] of ranges) {
      if (!m.has(c)) m.set(c, []);
      m.get(c).push([a, b]);
    }
    return m;
  };
  const siteTip = (d) => {
    const a = T.mol.viewer.selectedAtoms(
      Object.assign({ resi: d.sites[0]?.resi }, T.mol.mode === 'pdb' ? { chain: d.chain } : {})
    )[0];
    return a ? tipName(a) : 'CA';
  };
  // the side chain's atoms by name where the residue is a standard one, else the program's own side-chain selection
  const sideAtoms = (d) => {
    const r = T.mol.viewer.selectedAtoms(
      Object.assign({ resi: d.sites[0]?.resi }, T.mol.mode === 'pdb' ? { chain: d.chain } : {})
    );
    const res = (r[0] || {}).resn;
    return res && THREE[Object.keys(THREE).find((k) => THREE[k] === res)]
      ? [...new Set(r.map((x) => x.atom).filter((x) => !BACKBONE.has(x) && !/^H/.test(x)))]
      : null;
  };
  function chimerax(d) {
    const L = d.header.map((x) => '# ' + x),
      tip = siteTip(d),
      side = sideAtoms(d);
    L.push(
      d.src.id
        ? 'open ' + d.src.id
        : 'open ' +
            (d.src.files?.cif || d.src.files?.pdb || d.src.url) +
            (d.src.format ? ' format ' + d.src.format : '')
    );
    L.push(
      'set bgColor ' + d.bg,
      'lighting ' + (d.light === 'plain' || d.light === 'outline' ? 'simple' : 'soft'),
      'graphics silhouettes ' + d.outline,
      'hide #1 atoms',
      'cartoon #1'
    );
    if (!d.others) L.push('cartoon hide #1 & ~/' + d.chain);
    for (const c of d.chains)
      byCol(c.ranges).forEach((rs, col) => L.push(`color #1/${c.chain}:${cxRes(rs)} ${col} target ac`));
    if (d.style === 'sticks' || d.style === 'spheres')
      L.push('show #1 atoms', 'style #1 ' + (d.style === 'sticks' ? 'stick' : 'sphere'), 'cartoon hide #1');
    if (d.ligands) L.push('show #1 & ligand atoms');
    L.push('hide #1 & solvent atoms');
    byCol(d.sites.map((x) => [x.resi, x.resi, x.color])).forEach((rs, col) => {
      const spec = `#1/${d.chain}:${cxRes(rs)}`,
        atoms = side ? spec + '@' + side.join(',').toLowerCase() : spec + ' & sidechain';
      L.push(
        `show ${atoms} atoms`,
        `style ${atoms} stick`,
        `color ${atoms} ${col} target a`,
        `style ${spec}@${tip.toLowerCase()} sphere`
      );
    });
    for (const [r, x] of d.labels) L.push(`label #1/${d.chain}:${r} text "${x}" height 1.6`);
    if (d.surface !== 'off') L.push('surface #1/' + d.chain);
    if (d.surface === 'glass') L.push(`transparency #1/${d.chain} 70 target s`);
    if (d.contacts) L.push(`show #1/${d.focus.chain}:${d.focus.resi} :<5 atoms`, 'hide #1 & solvent atoms');
    L.push(d.focus ? `view #1/${d.focus.chain}:${d.focus.resi}` : 'view');
    return L.join('\n') + '\n';
  }
  function pymol(d) {
    const obj = d.src.tag.replace(/[^A-Za-z0-9_]/g, '_'),
      ch = (c) => (c ? 'chain ' + c : 'chain ""'),
      L = d.header.map((x) => '# ' + x);
    const tip = siteTip(d),
      side = sideAtoms(d);
    L.push(
      d.src.id
        ? `fetch ${d.src.id}, ${obj}, async=0`
        : `load ${d.src.files?.pdb || d.src.files?.cif || d.src.url}, ${obj}${
            d.src.format ? ', format=' + d.src.format : ''
          }`
    );
    L.push(
      'hide everything, ' + obj,
      'bg_color ' + d.bg,
      'set ray_trace_mode, ' + (d.outline ? 1 : 0),
      'set cartoon_transparency, 0',
      'remove solvent'
    );
    L.push(
      d.style === 'sticks'
        ? `show sticks, ${obj} and polymer`
        : d.style === 'spheres'
          ? `show spheres, ${obj} and polymer`
          : 'show cartoon, ' + obj
    );
    if (d.style === 'trace') L.push('cartoon tube, ' + obj);
    if (!d.others) L.push(`hide everything, ${obj} and not ${ch(d.chain)}`);
    let k = 0;
    const names = new Map();
    const nm = (hex) => {
      if (!names.has(hex)) {
        const n = 'pc_c' + k++;
        names.set(hex, n);
        L.push(
          `set_color ${n}, [${[1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(', ')}]`
        );
      }
      return names.get(hex);
    };
    for (const c of d.chains)
      byCol(c.ranges).forEach((rs, col) => L.push(`color ${nm(col)}, ${obj} and ${ch(c.chain)} and resi ${pmRes(rs)}`));
    if (d.ligands) L.push(`show sticks, ${obj} and organic`, `color green, ${obj} and organic and elem C`);
    byCol(d.sites.map((x) => [x.resi, x.resi, x.color])).forEach((rs, col) => {
      const n = nm(col),
        spec = `${obj} and ${ch(d.chain)} and resi ${pmRes(rs)} and ${side ? 'name ' + side.join('+') : 'sidechain'}`,
        tipSel = `${obj} and ${ch(d.chain)} and resi ${pmRes(rs)} and name ${tip}`;
      L.push(
        'show sticks, ' + spec,
        `color ${n}, ${spec}`,
        'set stick_radius, 0.3, ' + spec,
        'show spheres, ' + tipSel,
        'set sphere_scale, 0.68, ' + tipSel
      );
    });
    for (const [r, x] of d.labels)
      L.push(`label ${obj} and ${ch(d.chain)} and resi ${pmRes([[r, r]])} and name ${tip}, "${x}"`);
    if (d.labels.length) L.push('set label_size, 18', 'set label_color, ' + (d.bg === 'black' ? 'white' : 'black'));
    if (d.surface !== 'off') L.push(`show surface, ${obj} and ${ch(d.chain)}`);
    if (d.surface === 'glass') L.push('set transparency, 0.6');
    const focus = d.focus ? `${obj} and ${ch(d.focus.chain)} and resi ${pmRes([[d.focus.resi, d.focus.resi]])}` : '';
    if (d.contacts) L.push(`show sticks, byres (${obj} within 5 of (${focus})) and not name N+C+O`);
    L.push(focus ? 'orient ' + focus : 'orient ' + obj, focus ? `zoom ${focus}, 10` : 'zoom ' + obj);
    return L.join('\n') + '\n';
  }
  // the coordinates, unchanged, with the marks listed: PDB REMARK 999 lines, or for mmCIF a comment block and a
  // _ptmcontext_mark table (programs skip categories they do not know)
  function annotated(d) {
    const rows = d.sites.map((x) => {
      const m = x.unp != null ? markAt(x.unp) : null;
      return {
        chain: d.chain,
        resi: x.resi,
        site: x.unp != null ? rl(x.unp) : `modeled ${NOUN}`,
        cat: m ? colourOf(m).label || '' : '',
      };
    });
    const head = d.header
      .concat([
        `${cap(NOUNS)} in chain ${d.chain} of this model (model numbering, UniProt site, ${colourMode().toLowerCase()}):`,
      ])
      .concat(rows.map((r) => `  ${r.chain} ${r.resi}  ${r.site}  ${r.cat}`));
    if (d.fmt === 'cif') {
      const cv = (x) => {
        x = String(x);
        return x !== '' && !/[\s'"]/.test(x) ? x : x.includes("'") ? '"' + x + '"' : "'" + x + "'";
      };
      const table =
        '#\nloop_\n' +
        ['auth_asym_id', 'auth_seq_id', 'uniprot_accession', 'site', 'category']
          .map((k) => '_ptmcontext_mark.' + k)
          .join('\n') +
        '\n' +
        rows.map((r) => [r.chain, r.resi, T.acc.split('-')[0], r.site, r.cat || '?'].map(cv).join(' ')).join('\n') +
        '\n#\n';
      return head.map((x) => '# ' + x).join('\n') + '\n' + d.text.replace(/\s*$/, '\n') + (rows.length ? table : '');
    }
    const rem = head.flatMap((x) =>
      (x.match(/.{1,68}(\s|$)/g) || [x]).map((line) => ('REMARK 999 ' + line.trim()).padEnd(80))
    );
    const lines = d.text.split('\n'),
      at = lines.findIndex((l) => !/^(HEADER|TITLE |COMPND|SOURCE|KEYWDS|EXPDTA|AUTHOR|REVDAT|SPRSDE|JRNL  )/.test(l));
    return lines
      .slice(0, Math.max(0, at))
      .concat(rem, lines.slice(Math.max(0, at)))
      .join('\n');
  }
  function pdbToCif(text, name) {
    const q = (x) => (x === '' ? '.' : /[\s'"]/.test(x) ? (x.includes("'") ? '"' + x + '"' : "'" + x + "'") : x);
    const cols = [
      'group_PDB',
      'id',
      'type_symbol',
      'label_atom_id',
      'label_alt_id',
      'label_comp_id',
      'label_asym_id',
      'label_seq_id',
      'pdbx_PDB_ins_code',
      'Cartn_x',
      'Cartn_y',
      'Cartn_z',
      'occupancy',
      'B_iso_or_equiv',
      'auth_seq_id',
      'auth_comp_id',
      'auth_asym_id',
      'auth_atom_id',
      'pdbx_PDB_model_num',
    ];
    const rows = [];
    let model = 1;
    for (const l of text.split('\n')) {
      if (l.startsWith('MODEL ')) model = parseInt(l.slice(10, 14), 10) || model;
      if (!/^(ATOM  |HETATM)/.test(l)) continue;
      const f = (a, b) => l.slice(a, b).trim(),
        atom = f(12, 16),
        chain = f(21, 22) || 'A',
        comp = f(17, 20),
        seq = f(22, 26),
        el = f(76, 78) || atom.replace(/[^A-Za-z]/g, '').slice(0, 1);
      rows.push(
        [
          f(0, 6),
          rows.length + 1,
          el,
          q(atom),
          f(16, 17) || '.',
          comp,
          chain,
          l.startsWith('HETATM') ? '.' : seq,
          f(26, 27) || '?',
          f(30, 38),
          f(38, 46),
          f(46, 54),
          f(54, 60) || '1.00',
          f(60, 66) || '0.00',
          seq,
          comp,
          chain,
          q(atom),
          model,
        ].join(' ')
      );
    }
    return `data_${String(name).replace(/[^A-Za-z0-9_]/g, '_')}\n#\nloop_\n${cols
      .map((c) => '_atom_site.' + c)
      .join('\n')}\n${rows.join('\n')}\n#\n`;
  }
  function coords(fmt, btn) {
    const d = sceneData(),
      url = d.src.files && d.src.files[fmt];
    const text =
      d.fmt === fmt
        ? Promise.resolve(d.text)
        : url
          ? getText(url)
          : fmt === 'cif'
            ? Promise.resolve(pdbToCif(d.text, d.src.tag))
            : Promise.reject(new Error('none'));
    if (btn) btn.disabled = true;
    text
      .then(
        (x) =>
          K.download(
            `${d.file}.${fmt}`,
            annotated(Object.assign({}, d, { text: x, fmt })),
            'chemical/x-' + (fmt === 'cif' ? 'mmcif' : 'pdb')
          ),
        () =>
          message(
            fmt === 'pdb'
              ? `No PDB-format file for ${d.src.what} (RCSB serves very large entries as mmCIF ` + `only); use mmCIF.`
              : 'The mmCIF file could not be fetched.'
          )
      )
      .finally(() => {
        if (btn) btn.disabled = false;
      });
  }

  // ---- moving the view ------------------------------------------------------------------------------------------------------
  // Move: a drag slides the structure instead of turning it (3Dmol slides with Ctrl held, so each drag reaches it with
  // Ctrl set); a right-button drag slides it too, and the arrow keys once the viewer has focus
  function bindMove(el) {
    if (el.dataset.move) return;
    el.dataset.move = '1';
    let rightPan = false;
    el.addEventListener(
      'mousedown',
      (ev0) => {
        if (ev0.isTrusted && document.activeElement !== el) el.focus({ preventScroll: true });
        if (!ev0.isTrusted || ev0.button !== 2) return;
        rightPan = true;
        ev0.stopImmediatePropagation();
        ev0.preventDefault();
        ev0.target.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: ev0.clientX,
            clientY: ev0.clientY,
            screenX: ev0.screenX,
            screenY: ev0.screenY,
            button: 0,
            buttons: 1,
            ctrlKey: true,
          })
        );
        window.addEventListener(
          'mouseup',
          () => {
            rightPan = false;
          },
          { once: true, capture: true }
        );
      },
      true
    );
    el.addEventListener(
      'contextmenu',
      (e2) => {
        e2.preventDefault();
        e2.stopImmediatePropagation();
      },
      true
    );
    el.tabIndex = 0;
    el.addEventListener('keydown', (e2) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e2.key];
      if (!d || !T.mol) return;
      e2.preventDefault();
      pan(d[0], d[1], e2.shiftKey ? 3 : 1);
    });
    const fwd = (e2) => {
      if (!(T.move || rightPan) || !e2.isTrusted || e2.ctrlKey) return;
      let copy;
      try {
        copy = e2.type.startsWith('touch')
          ? new TouchEvent(e2.type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              touches: [...e2.touches],
              targetTouches: [...e2.targetTouches],
              changedTouches: [...e2.changedTouches],
              ctrlKey: true,
            })
          : new MouseEvent(e2.type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              clientX: e2.clientX,
              clientY: e2.clientY,
              screenX: e2.screenX,
              screenY: e2.screenY,
              button: e2.button,
              buttons: e2.buttons,
              ctrlKey: true,
              shiftKey: e2.shiftKey,
              altKey: e2.altKey,
              metaKey: e2.metaKey,
            });
      } catch (err) {
        return;
      }
      e2.stopImmediatePropagation();
      e2.preventDefault();
      e2.target.dispatchEvent(copy);
    };
    el.addEventListener('mousemove', fwd, true);
    el.addEventListener('touchmove', fwd, { capture: true, passive: false });
  }
  function pan(dx, dy, steps = 1) {
    const mol = T.mol;
    if (!mol) return;
    const w = mol.el.clientWidth || 600;
    mol.viewer.translate(dx * w * 0.05 * steps, dy * w * 0.05 * steps);
    mol.viewer.render();
  }
  // Expand: the card's controls, viewer and side panel move into a dialog the size of the window (Esc returns them)
  function expand(on) {
    const card = document.getElementById('s3d');
    let dlg = document.getElementById('s3d-dialog');
    if (on) {
      if (!card || !T.mol) return;
      if (!dlg) {
        dlg = Object.assign(document.createElement('dialog'), { id: 's3d-dialog', className: 's3d-dialog' });
        dlg.setAttribute('aria-label', '3D structure');
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => expand(false));
      }
      const parts = ['.s3d-head', '#s3d-src', '#s3d-controls', '.s3d-wrap'].map((q) => $(q, card)).filter(Boolean);
      if (!parts.length || dlg.open) return;
      const mark = Object.assign(document.createElement('div'), { id: 's3d-dialog-mark', hidden: true });
      parts[0].before(mark);
      dlg.append(...parts);
      dlg.showModal();
    } else {
      const mark = document.getElementById('s3d-dialog-mark');
      if (dlg) {
        if (mark) mark.after(...dlg.children);
        else dlg.replaceChildren();
        if (dlg.open) dlg.close();
      }
      mark?.remove();
    }
    const b = $('[data-s3d-act="expand"]');
    if (b) {
      b.setAttribute('aria-pressed', String(!!on));
      b.textContent = on ? 'Close' : 'Expand';
    }
    if (T.mol?.el.offsetWidth)
      requestAnimationFrame(() => {
        T.mol.viewer.resize();
        T.mol.viewer.render();
      });
  }

  // ---- the viewer on a page of its own: ?solo3d=<entry>.<chain> (or af) beside the protein's address, same entry, chain and mark ----
  function soloHref(acc) {
    const m = T.mol && T.mol.acc === acc ? T.mol : null,
      pdb = m && m.pdb;
    const tag = pdb ? pdb.e.id + (pdb.chain ? '.' + pdb.chain : '') : m ? 'af' : '';
    const pos = T.highlight != null ? T.highlight : K.site.state.focus;
    return (
      location.pathname +
      (tag ? '?solo3d=' + encodeURIComponent(tag) : '?solo3d') +
      K.link('protein', acc + (pos != null ? '/' + pos : ''))
    );
  }
  const refreshSolo = (e) => {
    const a = e.target.closest?.('#s3d-newtab');
    if (a && T.acc) a.href = soloHref(T.acc);
  }; // the address follows the viewer as it changes
  ['pointerdown', 'focusin', 'mouseover', 'contextmenu'].forEach((ev) =>
    document.addEventListener(ev, refreshSolo, true)
  );
  const SOLO = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('solo3d') : null;
  if (SOLO != null) {
    document.body.classList.add('solo3d');
    let done = false;
    (K.afterRender ||= []).push(() => {
      const card = document.getElementById('s3d'),
        acc = String(K.S.arg || '').split('/')[0];
      if (done || !card || K.S.view !== 'protein' || !byAcc[acc]) return;
      done = true;
      const [entry, chain] = SOLO.split('.'),
        pos = K.site.state.focus;
      if (SOLO === 'af') V.src = 'af';
      K.show3d(acc, { pos, entry: SOLO && SOLO !== 'af' ? entry : null, chain: chain || null });
    });
  }

  // ---- the section, and its life on the page -----------------------------------------------------------------------------------
  const sub = (id, title, body) =>
    `<details class="s3d-sub" id="${id}"${T.open[id] ? ' open' : ''}><summary><span ` +
    `class="pfm" aria-hidden="true"></span><h4>${esc(title)}</h4><span class="s3d-ssum"></span></summary><div ` +
    `class="s3d-sub-body">${body}</div></details>`;
  function html(p, rec) {
    if (T.acc !== p.acc) reset(p, rec);
    else {
      T.rec = rec;
      T.p = p;
    }
    const exp = ['pdf', 'svg', 'png', 'tsv']
      .map(
        (k) =>
          `<button type="button" class="exp-btn" data-s3d-exp="${k}" data-s3d-need ` +
          `disabled title="${
            k === 'tsv'
              ? `TSV: each ${esc(NOUN)} in this model, what it touches, and where the ` + `view comes from`
              : `${k.toUpperCase()}: the view as shown, with its key, citation and sources`
          }">${k.toUpperCase()}</button>`
      )
      .join('');
    const tools = [
      ['reset', 'Reset view', 'Turn and zoom back to where it started'],
      ['spin', 'Spin', ''],
      ['move', 'Move', 'Drag to slide the structure instead of turning it (Ctrl-drag does the same at any time)'],
      ['expand', 'Expand', 'The structure at the size of the window (Esc returns)'],
    ]
      .map(
        ([k, l, t]) =>
          `<button type="button" class="exp-btn" data-s3d-act="${k}" data-s3d-need disabled${
            k === 'spin' || k === 'move' || k === 'expand' ? ` aria-pressed="${k === 'move' ? !!T.move : 'false'}"` : ''
          }${t ? ` title="${esc(t)}"` : ''}>${l}</button>`
      )
      .join('');
    const files = [
      ['cxc', 'ChimeraX', 'A ChimeraX script that rebuilds this view'],
      ['pml', 'PyMOL', 'A PyMOL script that rebuilds this view'],
      ['cif', 'mmCIF', `The coordinates ` + `shown, as mmCIF, with the ${NOUNS} listed`],
      ['pdb', 'PDB', `The coordinates shown, as PDB, with the ${NOUNS} in REMARK 999`],
    ]
      .map(
        ([k, l, t]) =>
          `<button type="button" class="exp-btn" data-s3d-file="${k}" data-s3d-need disabled ` +
          `title="${esc(t)}">${l}</button>`
      )
      .join('');
    const hasTables = Object.keys(SD.inputs || {}).length > 0;
    return (
      `<div class="s3d" id="s3d"><div class="s3d-head card-head">` +
      (`<div class="exp s3d-tools" role="group" aria-label="Structure controls and downloads">${tools}<span class="s3d-sep">` +
        `</span>${exp}<span class="s3d-sep"></span>${files}<a class="exp-btn" href="${esc(K.link('method', 'structure'))}" title="Where ` +
        `the structures, the placing of the ${esc(NOUNS)} and the colors come from">Method</a><a class="exp-btn" ` +
        `id="s3d-newtab" href="${esc(soloHref(p.acc))}" target="_blank" rel="noopener" title="The viewer on a ` +
        `page of its own, with this entry, chain and ${esc(NOUN)}">Open in a new tab</a></div></div>`) +
      `<div class="s3d-src" id="s3d-src"></div>` +
      `<div class="s3d-wrap"><div class="s3d-stage"><div class="s3d-viewer" id="s3d-viewer"></div>` +
      `<div class="s3d-pan" role="group" aria-label="Slide the structure">${[
        ['up', 0, -1, '↑'],
        ['left', -1, 0, '←'],
        ['right', 1, 0, '→'],
        ['down', 0, 1, '↓'],
      ]
        .map(
          ([k, x, y, t]) =>
            `<button type="button" ` + `class="pan-${k}" data-s3d-pan="${x},${y}" aria-label="Slide ${k}">${t}</button>`
        )
        .join('')}</div>` +
      (`<p class="s3d-msg" id="s3d-msg" aria-live="polite">${esc(T.msg)}</p></div><div class="s3d-side" ` +
        `id="s3d-side"></div></div>`) +
      '<div class="s3d-controls" id="s3d-controls"></div>' +
      sub('s3d-pdb', 'Experimental structures (PDB)', '<div id="s3d-pdb-list"></div>') +
      sub('s3d-hom', 'Homologous experimental structures', '<div id="s3d-hom-list"></div>') +
      sub('s3d-pred', 'Predicted complexes', `<div id="s3d-pred-list"></div>`) +
      `<p class="src">Live, by accession: AlphaFold DB, PDBe, RCSB${SD.predicted ? ', ProtVar' : ''}; drawn with ${esc(LIB_CITE)}.${
        hasTables
          ? ` What the ${esc(NOUNS)} touch: the ` +
            `site’s tables (${esc([...new Set(Object.keys(SD.inputs).map(tableWords))].join('; '))}).`
          : ''
      }</p></div>`
    );
  }
  function reset(p, rec) {
    expand(false);
    dispose();
    Object.assign(T, {
      acc: p.acc,
      p,
      rec,
      highlight: null,
      open: {},
      pdbAll: false,
      homAll: false,
      homOpen: new Set(),
      predAll: false,
      pick: {},
      started: false,
      msg: '',
      res: null,
      best: null,
      homList: null,
      entry: null,
      afcx: null,
      predList: null,
    });
  }
  const foldOpen = () => !!document.getElementById('p-struct')?.open;
  // the marks the view shows changed: draw them again, and the key, summary and buttons that name them
  function refreshMarks() {
    T.sig = marks()
      .map((m) => m[0])
      .join();
    if (T.mol && T.mol.acc === T.acc) {
      restyle(false);
      T.mol.viewer.render();
    }
    paint();
  }
  // after each render of the protein page: keep the live viewer, fill the panels, start when the section is open
  function after(p, rec) {
    if (T.acc !== p.acc) reset(p, rec);
    else {
      T.rec = rec;
      T.p = p;
    }
    if (T.want && T.want.acc !== p.acc) T.want = null;
    const acc = p.acc,
      el = document.getElementById('s3d-viewer');
    if (T.mol && T.mol.acc === acc && el && el !== T.mol.el) {
      el.replaceWith(T.mol.el);
      T.mol.el.id = 's3d-viewer';
      if (T.mol.el.offsetWidth) T.mol.viewer.resize();
      if (T.mol.spin) $('[data-s3d-act="spin"]')?.setAttribute('aria-pressed', 'true');
    }
    if (!T.res)
      loadPdb(acc).then((res) => {
        if (T.acc !== acc) return;
        T.res = res;
        paintSrc();
        paintPdbList();
        paintSummary();
      });
    if (T.want) {
      const d = document.getElementById('p-struct');
      if (d && !d.open) d.open = true;
    }
    if (
      T.mol &&
      T.mol.acc === acc &&
      T.sig != null &&
      T.sig !==
        marks()
          .map((m) => m[0])
          .join()
    ) {
      T.sig = marks()
        .map((m) => m[0])
        .join();
      restyle(false);
      T.mol.viewer.render();
    }
    paint();
    if (foldOpen()) begin();
    if (T.want) {
      const w = T.want;
      setTimeout(() => {
        scrollToViewer();
        if (T.started) apply(w);
      }, 80);
    }
  }
  // the section opened: the lookups and the viewer start
  function begin() {
    const acc = T.acc;
    if (!T.best)
      bestPdb(acc).then((b) => {
        if (T.acc !== acc) return;
        T.best = b;
        paintSrc();
      });
    if (!T.started) start();
    paintPdbList();
    if (!T.homList && T.rec?.seq)
      loadHomologs().then((l) => {
        if (T.acc === acc) {
          T.homList = l === null ? 'failed' : l;
          paintHomologs();
          paintSummary();
        }
      });
    if (T.mol && T.mol.acc === acc)
      requestAnimationFrame(() => {
        if (T.mol?.el.offsetWidth) {
          T.mol.viewer.resize();
          T.mol.viewer.render();
        }
      });
  }
  // the viewer at the top of the window, kept there for a few seconds while the page above it is still filling in
  // (the map's live rows), unless the reader scrolls first
  function scrollToViewer() {
    const place = () => {
      const t = document.getElementById('s3d');
      if (!t) return null;
      const bar = document.querySelector('.toolbar')?.offsetHeight || 0;
      return t.getBoundingClientRect().top - bar - 8;
    };
    const d = place();
    if (d == null) return;
    scrollTo({ top: scrollY + d });
    const until = Date.now() + 4000,
      stop = () => {
        T.keep = 0;
      };
    T.keep = until;
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((ev0) =>
      addEventListener(ev0, stop, { once: true, passive: true })
    );
    const hold = () => {
      if (T.keep !== until || Date.now() > until) return;
      const x = place();
      if (x != null && Math.abs(x) > 4) scrollTo({ top: scrollY + x });
      requestAnimationFrame(hold);
    };
    requestAnimationFrame(hold);
  }
  function apply(w) {
    T.want = null;
    if (w.pos != null) T.highlight = w.pos;
    if (w.entry) {
      const cur = T.mol?.mode === 'pdb' && !T.mol.pdb.pred && !T.mol.pdb.homolog ? T.mol.pdb : null;
      if (cur && cur.e.id === w.entry && (!w.chain || cur.chain === w.chain)) {
        if (w.pos != null) focusPos(w.pos);
        return;
      }
      return loadPdb(T.acc).then((res) => {
        const e = res.entries.find((x) => x.id === w.entry) || {
          id: w.entry,
          method: '',
          resolution: null,
          chains: [],
          maps: [],
        };
        V.src = 'pdb';
        return showPdb(e, w.chain, w.pos);
      });
    }
    if (w.pos != null) {
      if (T.mol && T.mol.acc === T.acc) focusPos(w.pos);
      else paintSide();
    }
  }
  // open the viewer at a mark, in an entry and chain if given; from another page, the protein's page first
  // K.show3d(acc, {pos, entry, chain}), or K.show3d(acc, pos, {entry, chain}) as the site card calls it
  function show3d(acc, a, b) {
    const o = a != null && typeof a === 'object' ? a : { ...(b || {}), pos: a };
    if (!byAcc[acc]) return false;
    const w = {
      acc,
      pos: o.pos != null ? +o.pos : null,
      entry: o.entry ? String(o.entry).toLowerCase() : null,
      chain: o.chain || null,
    };
    T.scrollTo = true;
    if (pageOpen(acc) && T.acc === acc) {
      const d = document.getElementById('p-struct');
      if (d && !d.open) {
        T.want = w;
        d.open = true;
        return true;
      } // the toggle starts it
      scrollToViewer();
      if (!T.started) {
        T.want = w;
        begin();
      } else apply(w);
      return true;
    }
    T.want = w;
    K.go('protein', { arg: acc + (w.pos != null ? '/' + w.pos : '') });
    return true;
  }
  // warm-up: the library and the best-entry lookup start when the reader reaches for the section (pointer or keyboard on
  // its title, or on the group that holds it, or the group opening), so the one click that opens it finds them under way
  const warm = () => {
    if (!T.acc || T.started || !document.getElementById('s3d-viewer')) return;
    load3Dmol().catch(() => {});
    if (!T.best) {
      const acc = T.acc;
      bestPdb(acc).then(
        (b) => {
          if (T.acc === acc) T.best = b;
        },
        () => {}
      );
    }
  };
  const nearStruct = (t) => {
    const s = t.closest?.('details > summary');
    const d = s && s.parentElement;
    return d && (d.id === 'p-struct' || (d.classList.contains('pgroup') && d.querySelector('#p-struct')));
  };
  ['pointerover', 'focusin'].forEach((ev0) =>
    document.addEventListener(
      ev0,
      (e) => {
        if (nearStruct(e.target)) warm();
      },
      true
    )
  );
  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (d.open && d.classList?.contains('pgroup') && d.querySelector('#p-struct')) warm();
      if (d.id === 'p-struct' && d.open && T.acc) {
        begin();
        if (T.want && T.started) {
          const w = T.want;
          apply(w);
        }
      }
      if (d.hasAttribute?.('data-s3d-optd')) T.optOpen = d.open;
      if (d.classList?.contains('s3d-sub')) {
        T.open[d.id] = d.open;
        if (d.open) paintLists();
      }
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('s3d-dialog')?.open) expand(false);
  });
  document.addEventListener('change', (e) => {
    const key = e.target.dataset?.s3dSel;
    if (!key) return;
    const val = e.target.value;
    if (key === 'entry') {
      if (!val || !T.res) return;
      const x = T.res.entries.find((y) => y.id === val);
      if (x) {
        V.src = 'pdb';
        save();
        showPdb(x, null);
      }
      return;
    }
    if (key === 'chain') {
      const cur = T.mol?.pdb;
      if (cur) {
        T.pick[cur.e.id] = val;
        showPdb(cur.e, val, T.highlight);
      }
      return;
    }
    V[key] = val;
    save();
    if (T.mol && T.mol.acc === T.acc) {
      restyle(key === 'color' || key === 'surface');
    }
    paintControls();
  });
  K.clicks.push(
    [
      '[data-s3d-src]',
      (el) => {
        const s = el.dataset.s3dSrc;
        V.src = s;
        save();
        if (s === 'af') showAf();
        else {
          const b = T.best;
          if (b && !b.failed) showPdb(b.e, b.det.chain);
          else {
            delete cache.best[T.acc];
            bestPdb(T.acc).then((nb) => {
              T.best = nb;
              if (nb && !nb.failed) showPdb(nb.e, nb.det.chain);
              else paintSrc();
            });
          }
        }
      },
    ],
    [
      '[data-s3d-toggle]',
      (el) => {
        const k = el.dataset.s3dToggle;
        V[k] = !V[k];
        save();
        if (T.mol) {
          T.mol.contacts = null;
          restyle(false);
        }
        paintControls();
      },
    ],
    [
      '[data-s3d-state]',
      (el) => {
        const k = el.dataset.s3dState;
        T.hide ||= new Set();
        T.hide.has(k) ? T.hide.delete(k) : T.hide.add(k);
        refreshMarks();
      },
    ],
    [
      '[data-s3d-selonly]',
      () => {
        T.selOff = !(T.selOff === true);
        refreshMarks();
      },
    ],
    [
      '[data-s3d-default]',
      () => {
        const src = V.src;
        Object.assign(V, DEFAULT, { src });
        save();
        if (T.mol) restyle(true);
        paintControls();
      },
    ],
    ['[data-s3d-pos]', (el) => focusPos(+el.dataset.s3dPos)],
    [
      '[data-s3d-entry]',
      (el) => {
        const id = el.dataset.s3dEntry,
          at = el.dataset.s3dAt != null ? +el.dataset.s3dAt : null;
        apply({ entry: id, pos: at ?? T.highlight, chain: null });
        scrollToViewer();
      },
    ],
    [
      '[data-s3d-more]',
      (el) => {
        const k = el.dataset.s3dMore;
        T[k + 'All'] = !T[k + 'All'];
        paintLists();
      },
    ],
    [
      '[data-s3d-homopen]',
      (el) => {
        const k = +el.dataset.s3dHomopen;
        if (T.homOpen.has(k)) T.homOpen.delete(k);
        else T.homOpen.add(k);
        paintHomologs();
      },
    ],
    [
      '[data-s3d-hom]',
      (el) => {
        const h = (T.homList || []).find((x) => x.id === el.dataset.s3dHom);
        if (h) {
          showHomolog(h, +el.dataset.s3dAt);
          scrollToViewer();
        }
      },
    ],
    [
      '[data-s3d-pred]',
      (el) => {
        const x = (T.predList || [])[+el.dataset.s3dPred];
        if (x) {
          viewPred(x);
          scrollToViewer();
        }
      },
    ],
    [
      '[data-s3d-afcx]',
      (el) => {
        const x = (T.afcx || [])[+el.dataset.s3dAfcx];
        if (x) {
          const n = (v) => (v == null ? '–' : Number(v).toFixed(2));
          viewAfdb(
            x.modelEntityId,
            `ipTM ${n(x.complexPredictionAccuracy_ipTM)} · pDockQ ${n(x.complexPredictionAccuracy_pDockQ)} · mean pLDDT ${
              x.globalMetricValue != null ? Number(x.globalMetricValue).toFixed(1) : '–'
            }`,
            null
          );
          scrollToViewer();
        }
      },
    ],
    [
      '[data-s3d-pan]',
      (el, e) => {
        const [x, y] = el.dataset.s3dPan.split(',').map(Number);
        pan(x, y, e.shiftKey ? 3 : 1);
      },
    ],
    [
      '[data-s3d-act]',
      (el) => {
        const a = el.dataset.s3dAct,
          mol = T.mol;
        if (!mol) return;
        if (a === 'reset') {
          if (mol.label) {
            mol.viewer.removeLabel(mol.label);
            mol.label = null;
          }
          mol.focus = null;
          mol.focusPos = null;
          T.highlight = null;
          restyle(false);
          home(mol.viewer);
          mol.viewer.render();
          message('');
          paintSide();
        }
        if (a === 'spin') {
          mol.spin = !mol.spin;
          mol.viewer.spin(mol.spin ? 'y' : false);
          el.setAttribute('aria-pressed', String(mol.spin));
        }
        if (a === 'move') {
          T.move = !T.move;
          el.setAttribute('aria-pressed', String(T.move));
        }
        if (a === 'expand') expand(!document.getElementById('s3d-dialog')?.open);
      },
    ],
    [
      '[data-s3d-exp]',
      (el) => {
        if (!T.mol) return;
        const k = el.dataset.s3dExp,
          name = `${D.site.id}_${T.acc}_${T.mol.src.tag}_3d`;
        K.exportFigure(k, figure, name, el, tsv);
      },
    ],
    [
      '[data-s3d-file]',
      (el) => {
        if (!T.mol) return;
        const k = el.dataset.s3dFile;
        if (k === 'cxc' || k === 'pml') {
          const d = sceneData();
          K.download(`${d.file}.${k}`, k === 'cxc' ? chimerax(d) : pymol(d), 'text/plain');
        } else coords(k, el);
      },
    ]
  );
  // the theme changed: the view's colors follow
  new MutationObserver(() => {
    if (T.mol && T.mol.acc === T.acc && document.body.contains(T.mol.el)) {
      restyle(false);
      paintControls();
      paintSide();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (T.mol) {
      restyle(false);
      paintControls();
    }
  });

  // ---- the Method page's section ---------------------------------------------------------------------------------------------
  const methodSection = () =>
    `<section id="m-structure"><h3>3D structures</h3><p>A protein page shows the ` +
    `experimental chain that models most of the protein, any PDB entry and chain from its menu, or the AlphaFold ` +
    `DB model. It is read live by UniProt accession when the section opens and drawn with ${esc(LIB_CITE)}. ` +
    (`The experimental chain comes from PDBe’s SIFTS best structures: among chains whose mapping spans most of the ` +
      `protein, the one PDBe says observes most residues. Each ${esc(NOUN)} is placed through its SIFTS segment ` +
      `and PDBe’s observed residues, so only ${esc(NOUNS)} in the deposited model are drawn. A homologous ` +
      `structure (RCSB sequence search, MMseqs2, at least 30% identity) places them through the alignment, and ` +
      `AlphaFold or predicted complex models use UniProt numbering. `) +
    (`Entries that model one of the ${esc(NOUN)}’s chemical components (${esc(
      (SD.components || []).map((c) => c.code + ' ' + c.label).join(', ') || 'none named in the profile'
    )}) are found ` +
      `with RCSB’s search.</p>`) +
    (`<p>The chain is colored by the site’s regions as on the protein map, by the residue evidence the site file ` +
      `names, or by model confidence, chain, position, secondary structure, charge or Kyte–Doolittle hydropathy. ` +
      `The ${esc(NOUNS)} take the map’s color. Contacts are side-chain heavy atoms within 4 Å of another chain, ` +
      `RNA or DNA, computed in the browser on the coordinates shown.</p>`) +
    (Object.keys(SD.inputs || {}).length
      ? `<p>What the ${esc(NOUNS)} touch, entry by entry, comes from the site’s ` +
        `tables: ${Object.entries(SD.inputs)
          .map(
            ([k, ns]) =>
              `${esc(k)}: ${esc(
                ns
                  .map(
                    (n) =>
                      (dateWords(D.inputs?.[n]?.version) || n) +
                      (D.run?.inputs?.[n]?.md5 ? ` (MD5 ${D.run.inputs[n].md5})` : '')
                  )
                  .join('; ')
              )}`
          )
          .join('; ')}. Each export ` +
        `says which parts came live and which from these tables.</p>`
      : '') +
    ('<p>Downloads: the view as a figure (PDF, SVG, or PNG at three times screen ' +
      'resolution) with its key, citation and sources; a TSV of the marks in the ' +
      'model; ChimeraX and PyMOL scripts that rebuild the view; and the coordinates ' +
      '(mmCIF, PDB) with the marks listed.</p></section>');
  (K.methodParts ||= []).push(methodSection);

  // ---- the module's styles -------------------------------------------------------------------------------------------------------
  const css = document.createElement('style');
  css.id = 'kit-3d-css';
  css.textContent =
    `
.s3d .s3d-head { display: grid; gap: .4rem; }
.s3d .s3d-head .sub { margin: 0; color: var(--muted); font-size: .88rem; }
.s3d-tools { border-top: 0; padding-top: 0; }
.s3d-sep { width: .6rem; }
.s3d-tools .exp-btn[aria-pressed="true"] { background: var(--brand-ink); color: var(--surface); border-color: ` +
    `var(--brand-ink); }
.s3d-src, .s3d-row { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem .9rem; margin: .55rem 0; }
.s3d-src .seg-l { padding: .25rem .6rem; font-size: .82rem; color: var(--muted); border-right: 1px solid ` +
    `var(--line-strong); }
.s3d-src .seg button:disabled { opacity: .55; cursor: default; }
.s3d-ctl { display: inline-flex; align-items: center; gap: .35rem; font-size: .82rem; color: var(--muted); }
.s3d-ctl select { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid ` +
    `var(--line-strong); border-radius: .35rem; padding: .18rem .35rem; max-width: 100%; }
.s3d-entry { max-width: 100%; min-width: 0; }
.s3d-entry select { max-width: min(34rem, 100%); min-width: 0; flex: 1 1 auto; }
.s3d-chip { border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2); border-radius: ` +
    `999px; padding: .18rem .7rem; font-size: .8rem; cursor: pointer; }
.s3d-chip[aria-pressed="true"] { background: var(--brand-ink); border-color: var(--brand-ink); color: ` +
    `var(--surface); }
.s3d-key { display: flex; flex-wrap: wrap; gap: .3rem .9rem; font-size: .78rem; color: var(--ink-2); align-items: ` +
    `center; margin: .3rem 0 .6rem; }
.s3d-key .lt { font-weight: 600; color: var(--muted); }
.s3d-key i.sq, .s3d-key i.dot { display: inline-block; width: .7rem; height: .7rem; border-radius: 2px; ` +
    `margin-right: .3rem; vertical-align: -1px; }
.s3d-key i.dot, .s3d-site i.dot { border-radius: 50%; }
.s3d-key i.grad { display: inline-block; width: 4rem; height: .6rem; margin: 0 .35rem; border-radius: 2px; ` +
    `vertical-align: 0; }
.s3d-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 19rem; gap: 1rem; align-items: start; }
.s3d-stage { position: relative; }
.s3d-viewer { position: relative; width: 100%; height: 30rem; border: 1px solid var(--line); border-radius: .7rem; ` +
    `overflow: hidden; background: var(--surface-2); outline: none; }
.s3d-viewer:focus-visible { box-shadow: 0 0 0 3px var(--focus-ring); }
.s3d-ph { display: grid; place-items: center; height: 100%; padding: 1rem; text-align: center; color: var(--muted);` +
    ` font-size: .9rem; }
.s3d-pan { position: absolute; top: .6rem; right: .6rem; display: grid; grid-template-columns: repeat(3, 1.8rem); ` +
    `grid-template-rows: repeat(3, 1.8rem); gap: .15rem; }
.s3d-pan button { border: 1px solid var(--line-strong); background: color-mix(in srgb, var(--surface) 88%, ` +
    `transparent); color: var(--ink-2); border-radius: .35rem; cursor: pointer; font-size: .85rem; padding: 0; }
.s3d-pan .pan-up { grid-column: 2; grid-row: 1; } .s3d-pan .pan-left { grid-column: 1; grid-row: 2; } .s3d-pan ` +
    `.pan-right { grid-column: 3; grid-row: 2; } .s3d-pan .pan-down { grid-column: 2; grid-row: 3; }
.s3d-msg { min-height: 1.1rem; margin: .35rem 0 0; font-size: .82rem; color: var(--muted); }
.s3d-side { font-size: .85rem; color: var(--ink-2); max-height: 34rem; overflow: auto; }
.s3d-side .flabel { font-size: .78rem; font-weight: 600; color: var(--muted); margin: .7rem 0 .25rem; }
.s3d-side dl.kv { display: grid; grid-template-columns: auto 1fr; gap: .2rem .7rem; margin: .2rem 0; }
.s3d-side dl.kv dt { color: var(--muted); }
.s3d-side dl.kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.s3d-chains { list-style: none; margin: 0; padding: 0; display: grid; gap: .2rem; }
.s3d-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; }
.s3d-chips, .s3d-tags { display: flex; flex-wrap: wrap; gap: .3rem; }
.s3d-site, .s3d-entry-btn { border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); ` +
    `border-radius: 999px; padding: .1rem .55rem; font-size: .78rem; cursor: pointer; display: inline-flex; ` +
    `align-items: center; gap: .25rem; }
.s3d-entry-btn { border-radius: .35rem; font-family: var(--font-mono); padding: .05rem .4rem; }
.s3d-site.on, .s3d-entry-btn.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.s3d-site i.dot { width: .6rem; height: .6rem; display: inline-block; }
.s3d-tag { display: inline-block; border-radius: .3rem; padding: 0 .35rem; font-size: .72rem; font-weight: 600; ` +
    `background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--line); white-space: nowrap; }
.s3d-tag.k-rna { background: color-mix(in srgb, #7B4FBF 16%, var(--surface)); color: color-mix(in srgb, #7B4FBF ` +
    `70%, var(--ink)); border-color: color-mix(in srgb, #7B4FBF 35%, var(--surface)); }
.s3d-tag.k-dna, .s3d-tag.k-hybrid { background: color-mix(in srgb, #B7791F 18%, var(--surface)); color: ` +
    `color-mix(in srgb, #B7791F 70%, var(--ink)); border-color: color-mix(in srgb, #B7791F 35%, var(--surface)); }
.s3d-tag.k-protein { background: color-mix(in srgb, #0E7490 14%, var(--surface)); color: color-mix(in srgb, ` +
    `#0E7490 70%, var(--ink)); border-color: color-mix(in srgb, #0E7490 35%, var(--surface)); }
.s3d-tag.k-self { background: color-mix(in srgb, #7FA9B6 22%, var(--surface)); color: var(--ink-2); }
.s3d-tag.k-mark { background: color-mix(in srgb, #B4485F 16%, var(--surface)); color: color-mix(in srgb, #B4485F ` +
    `75%, var(--ink)); border-color: color-mix(in srgb, #B4485F 35%, var(--surface)); }
.s3d-tag.k-clash { background: color-mix(in srgb, #D64545 16%, var(--surface)); color: color-mix(in srgb, #D64545 ` +
    `75%, var(--ink)); }
.s3d-stack { display: flex; height: .7rem; border-radius: .25rem; overflow: hidden; margin: .2rem 0; }
.s3d-legend { list-style: none; margin: .25rem 0; padding: 0; display: grid; gap: .1rem; font-size: .78rem; }
.s3d-legend i { display: inline-block; width: .7rem; height: .7rem; margin-right: .35rem; border-radius: 2px; ` +
    `vertical-align: -1px; }
.s3d-legend b { float: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.s3d-focus { margin: 0 0 .5rem; padding: 0 0 .5rem; border-bottom: 1px dashed var(--line); }
.s3d-focus > .flabel:first-child { margin-top: 0; }
.s3d-win { font-size: .75rem; color: var(--muted); overflow-wrap: anywhere; }
.s3d .note.small, .s3d-side .note { font-size: .8rem; }
.s3d .small { font-size: .8rem; }
.s3d .src { font-size: .75rem; color: var(--muted); }
.s3d-sub { border: 1px solid var(--line); border-radius: .7rem; margin: .8rem 0 0; background: var(--surface); }
.s3d-sub > summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: .6rem; padding: ` +
    `.6rem .9rem; }
.s3d-sub > summary::-webkit-details-marker { display: none; }
.s3d-sub > summary h4 { margin: 0; font-size: .95rem; }
.s3d-sub > summary .pfm::before { content: '+'; display: inline-grid; place-items: center; width: 1.15rem; height: ` +
    `1.15rem; border: 1.5px solid var(--line-strong); border-radius: 50%; color: var(--muted); font-size: .8rem; }
.s3d-sub[open] > summary .pfm::before { content: '−'; border-color: var(--accent); color: var(--accent); }
.s3d-ssum { color: var(--muted); font-size: .82rem; }
.s3d-sub-body { padding: 0 .9rem .8rem; }
.s3d-tbl td { vertical-align: top; }
.s3d-tbl tr.on td { background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
.s3d-what { display: block; font-size: .78rem; color: var(--ink-2); max-width: 30rem; white-space: normal; overflow-wrap: anywhere; }
.s3d-what > span { display: block; }
.s3d-hl { list-style: none; margin: 0; padding: 0; display: grid; gap: .3rem; }
.solo3d #view *:not(:has(#s3d)):not(#s3d):not(#s3d *), .solo3d .hero, .solo3d .toolbar, .solo3d .rail, .solo3d ` +
    `footer.site, .solo3d .skip, .solo3d #s3d-newtab { display: none !important; }
.solo3d #s3d { position: fixed; inset: 0; z-index: 200; overflow: auto; padding: 1rem; background: var(--bg); }
.s3d-dialog { width: 96vw; max-width: 96vw; height: 94vh; max-height: 94vh; border: 1px solid var(--line); ` +
    `border-radius: .8rem; background: var(--surface); color: var(--ink); padding: 1rem; }
.s3d-dialog .s3d-viewer { height: calc(94vh - 13rem); }
.s3d-dialog .s3d-side { max-height: calc(94vh - 13rem); }
.s3d-dialog::backdrop { background: rgba(0, 0, 0, .45); }
@media (max-width: 860px) { .s3d-wrap { grid-template-columns: minmax(0, 1fr); } .s3d-viewer { height: 22rem; } ` +
    `.s3d-side { max-height: none; } .s3d-entry { width: 100%; } }
@media print { .s3d-pan, .s3d-tools, .s3d-controls, .s3d-src { display: none; } }
`;
  document.head.appendChild(css);

  K.s3d = { html, after, summary: () => 'AlphaFold DB, PDBe and RCSB, live', show: show3d };
  K.show3d = show3d;
});
