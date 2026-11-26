/* The site card's blocks, the sites table's cells, a site's Evidence row and a protein's citation box, each read from
   the tables of website.tables in the formats of CONTRACTS.md ("Tables the protein pages show"), with the words, codes
   and labels of website.protein.card. It knows no mark and no source by name: a block whose table or attribute a site
   lacks is absent. The protein page (kit-proteins.js) lays them out. A module of the site kit: K.card. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, esc, int, cap } = K;
  const C = D.protein_view?.card || {},
    TH = D.tables || {},
    LK = D.lookups || {},
    SPECS = D.attribute_specs || {};
  const has = (name) => !!(name && TH[name]);

  // ---- the data: each protein's rows (data/e, the shards of data/p), a light page's record (data/u) ----------------
  const inline = (() => {
    try {
      return JSON.parse(document.getElementById('table-data')?.textContent || '{}');
    } catch (e) {
      return {};
    }
  })();
  // the files of the tables (D.e_shards) and of the light pages (D.u_shards) are fewer than the protein files (D.shards)
  const shardOf = (acc, n) => [...acc].reduce((s, c) => s + c.charCodeAt(0), 0) % (n || D.shards || 64);
  const cache = {};
  const getShard = (dir, k) => {
    const key = String(k).padStart(dir === 'g' ? 3 : 2, '0');
    if ((dir === 'e' || dir === 'g') && inline[(dir === 'g' ? 'g' : '') + key])
      return Promise.resolve(inline[(dir === 'g' ? 'g' : '') + key]);
    return (cache[dir + key] ||= fetch(`data/${dir}/${key}.json`).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(String(r.status)))
    ));
  };
  // the variant lists of the sources with `lazy` (data/g, a few proteins to a file) are read when a card is opened; the
  // file's hash of an accession is variants.py's hash_shard
  const hashOf = (acc, n) => {
    let h = 0;
    for (const c of acc) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
    return h % n;
  };
  // a protein's variant lists as row objects by source id ({} when it has none, null when they cannot be read)
  const loadDetail = (acc) => {
    const VD = D.variant_detail;
    if (!VD) return Promise.resolve({});
    return getShard('g', hashOf(acc, VD.shards)).then(
      (sh) => {
        const s = sh._s || [],
          rec = sh[acc] || {},
          out = {};
        for (const [id, block] of Object.entries(rec)) {
          const { columns, kinds } = VD.entries[id],
            n = (block[0] || []).length,
            list = new Array(n);
          let pos = 0;
          for (let i = 0; i < n; i++) {
            const o = {};
            for (let j = 0; j < columns.length; j++) {
              const v = block[j][i];
              if (kinds[j] === 'pos') o[columns[j]] = pos += v;
              else o[columns[j]] = kinds[j] === 'str' ? str(s, v) : v;
            }
            list[i] = o;
          }
          out[id] = list;
        }
        return out;
      },
      () => null
    );
  };
  // a protein's tables ({} when it has no rows, null when they cannot be read)
  // a shard writes its repeated strings once ('_s'); a number in a row (but a position) is an index there
  const LOADED = {}; // accession -> the tables as last loaded (peek), for a count drawn without waiting
  const peek = (acc) => LOADED[acc];
  const load = (acc) =>
    (Object.keys(TH).length
      ? getShard('e', shardOf(acc, D.e_shards)).then(
          (sh) => ({ ...(sh[acc] || {}), _s: sh._s || [] }),
          () => null
        )
      : Promise.resolve({})
    ).then((tb) => (LOADED[acc] = tb));
  // the Sites page's default columns read one small file (data/sites_default.json) for every protein, not a shard each;
  // the one-file copy, which holds the shards, reads those
  const SDF = Object.keys(inline).length ? null : D.sites_default || null;
  let defLoad = null,
    defData = null;
  const defTb = {};
  const loadDefault = () =>
    (defLoad ||= fetch('data/sites_default.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({}))
      .then((f) => (defData = f)));
  const defaultTb = (acc) => (defData ? (defTb[acc] ||= { ...(defData[acc] || {}), _s: defData._s || [] }) : undefined);
  const light = (acc) =>
    getShard('u', shardOf(acc, D.u_shards)).then(
      (sh) => (sh[acc] ? { ...sh[acc], _s: sh._s || [] } : null),
      () => null
    );
  const str = (s, v) => (typeof v === 'number' ? (s[v] ?? '') : v);
  const NUMS = new Set(['position', 'start', 'end']); // the columns whose numbers are numbers
  // (but a free table's values (protein_records) are all text, a start or end included: the shard may hold one as an index)
  let lightIdx = null;
  const lightIndex = () =>
    (lightIdx ||= fetch('data/u/index.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []));
  // rows as objects, by the table's columns (a site-keyed row has its position first)
  const OBJ = new WeakMap();
  function rows(tb, name) {
    if (!tb || !tb[name] || !TH[name]) return [];
    let m = OBJ.get(tb);
    if (!m) OBJ.set(tb, (m = {}));
    const s = tb._s || [];
    return (m[name] ||= tb[name].map((r) =>
      Object.fromEntries(
        TH[name].columns.map((c, i) => [c, NUMS.has(c) && TH[name].format !== 'protein_records' ? r[i] : str(s, r[i])])
      )
    ));
  }
  const at = (tb, name, pos) => rows(tb, name).filter((r) => r.position === pos);
  const list = (v) =>
    String(v ?? '')
      .split(/;\s*/)
      .filter(Boolean);
  const ctxWords = (t, c) =>
    String(t || '')
      .replace(/\{site\}/g, c?.label || '')
      .replace(/\{gene\}/g, c?.gene || '')
      .replace(/\{acc\}/g, c?.acc || '')
      .replace(/\{residues\}/g, W.residues)
      .replace(/\{marks\}/g, W.marks);
  const attrVals = (c, name) => {
    const s = SPECS[name];
    const v = c.attr(name);
    return !s ? [] : s.kind === 'list' ? (v ? v.split(s.separator || '; ') : []) : v === '' ? [] : [v];
  };
  const vLabel = (name, v) => (K.sel?.valueLabel ? K.sel.valueLabel(name, v) : ((SPECS[name]?.values || {})[v] ?? v));
  const lookupRow = (key) => {
    const t = C.cite?.lookup;
    return t && LK[t] ? LK[t][key] : null;
  };
  const doiA = (doi, text) =>
    doi ? `<a href="https://doi.org/${esc(doi)}" target="_blank" rel="noopener">${text}</a>` : text;
  const sourceLink = (key) => {
    const r = lookupRow(key);
    return r ? doiA(r.doi, esc(r.label || key)) : esc(vLabel(C.cite?.attribute, key));
  };
  const num = (v, f) => {
    if (v === '' || v == null) return '–';
    const x = +v;
    if (!isFinite(x)) return esc(v);
    if (f === 'p') return x === 0 ? '< 1e−300' : x < 1e-3 ? x.toExponential(1).replace('e-', 'e−') : x.toFixed(3);
    if (f === 'l2') return (x > 0 ? '+' : '') + x.toFixed(2);
    return Number.isInteger(x) ? int(x) : x.toFixed(2);
  };
  // a residue i + d named as the page numbers it, with its offset from the site
  const rel = (d) => (d === 0 ? 'i' : `i${d > 0 ? '+' : '−'}${Math.abs(d)}`);
  const relWords = (d) => `${Math.abs(d)} ${d > 0 ? 'after' : 'before'} it`; // "via the residue 4 after it" for i+4

  // ---- interaction evidence ----------------------------------------------------------------------------------------
  const EV = C.evidence || {};
  // a partner's name in an evidence row: its gene, else its accession (a protein with no gene), never the kind's code
  const partnerName = (r) =>
    r.partner || (r.partner_accession && K.prot?.gene?.(r.partner_accession)) || r.partner_accession || '';
  function evidenceParts(c) {
    const tg = EV.tags || {},
      vals = tg.attribute ? attrVals(c, tg.attribute) : [],
      pred = new Set(tg.predicted || []);
    const hasPred = vals.some((v) => pred.has(v)),
      hasExp = vals.some((v) => !pred.has(v));
    return { vals, hasPred, hasExp, pred };
  }
  function badge(c) {
    if (!EV.status || !SPECS[EV.status]) return '';
    const v = c.attr(EV.status),
      { hasPred, hasExp } = evidenceParts(c),
      col = K.map?.attrColour ? K.map.attrColour(EV.status, v) : '#999';
    const plus = hasPred && hasExp && !(EV.tags?.predicted || []).includes(v) ? ' + pred.' : '';
    return `<span class="ixs" style="--c:${col}" title="${esc(
      SPECS[EV.status].help || SPECS[EV.status].label
    )}"><i></i>${esc(vLabel(EV.status, v))}${plus}</span>`;
  }
  function sentence(c) {
    const v = c.attr(EV.status),
      { hasPred, hasExp } = evidenceParts(c),
      s = EV.sentences || {};
    return esc((hasPred && hasExp && s[v + '_pred']) || s[v] || '');
  }
  // The evidence kinds at a site as tags: each names its kind and how many partners show it. Who the partners are is
  // the records block's to say (summary, recordsBlock), so no tag names one.
  function tags(c, max) {
    const tg = EV.tags;
    if (!tg?.attribute || !SPECS[tg.attribute]) return '';
    const { vals, pred } = evidenceParts(c),
      ptab = tg.partners,
      out = [],
      seen = new Set(),
      labs = [];
    const countOf = (kinds) => {
      const rs = has(ptab) ? at(c.tb, ptab, c.pos).filter((r) => kinds.includes(r.kind)) : [];
      return new Set(rs.map(partnerName).filter(Boolean)).size;
    };
    const predVals = vals.filter((v) => pred.has(v));
    for (const v of vals) {
      if (pred.has(v)) continue;
      const short = (tg.short || {})[v] ?? vLabel(tg.attribute, v),
        key = short + '|' + ((tg.tone || {})[v] || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const kinds = vals.filter(
        (x) =>
          !pred.has(x) && ((tg.short || {})[x] ?? vLabel(tg.attribute, x)) + '|' + ((tg.tone || {})[x] || '') === key
      ); // the kinds this tag stands for (data-ev-kind: a page may open them)
      const n = countOf(kinds),
        label = short + (n ? ' ' + int(n) : '');
      labs.push(label);
      out.push(
        `<span class="tag t-${esc((tg.tone || {})[v] || 'x')}" data-ev-kind="${esc(kinds.join(','))}" title="${esc(
          vLabel(tg.attribute, v) + (n ? `: ${int(n)} partner${n === 1 ? '' : 's'}` : '')
        )}">${esc(label)}</span>`
      );
    }
    if (predVals.length) {
      const n = countOf(predVals),
        word = (tg.short || {})[predVals[0]] || 'pred.';
      labs.push(word + (n ? ' ' + int(n) : ''));
      out.push(
        `<span class="tag t-pred" data-ev-kind="${esc(predVals.join(','))}" title="${esc(
          predVals.map((v) => vLabel(tg.attribute, v)).join(', ') +
            (n ? `: ${int(n)} partner${n === 1 ? '' : 's'}` : '')
        )}">${esc(word)}${n ? ' ' + int(n) : ''}</span>`
      );
    }
    if (max < 0)
      return out.length ? `<span class="tag more" title="${esc(labs.join(', '))}">+${out.length}</span>` : ''; // compact rows: the count, the kinds on hover
    return out.length
      ? `<div class="tags ev-tags">${(max ? out.slice(0, max) : out).join(' ')}${
          max && out.length > max ? ` <span class="tag">+${out.length - max}</span>` : ''
        }</div>`
      : '';
  }
  const entryBtn = (id, c, text) =>
    `<a class="entry3d mono" href="${esc(
      (EV.entries?.url || '').replace('{id}', encodeURIComponent(id))
    )}" target="_blank" ` +
    `rel="noopener" data-entry3d="${esc(id)}" data-acc="${esc(c.acc)}" data-pos="${c.pos}" title="${esc(id.toUpperCase())}${
      K.show3d ? ': show it in 3D at ' + esc(c.label) : ''
    }">${esc(text ?? id.toUpperCase())}</a>`;
  function entries(c, max = 6) {
    const e = EV.entries;
    if (!e || !has(e.table)) return '';
    const kinds = e.kinds || {},
      groups = new Map();
    for (const r of at(c.tb, e.table, c.pos)) {
      if (!(r.kind in kinds)) continue;
      const name = kinds[r.kind] || partnerName(r) || vLabel(EV.tags?.attribute, r.kind),
        key = r.kind + '|' + name;
      if (!groups.has(key)) groups.set(key, { name, tone: (EV.tags?.tone || {})[r.kind] || 'x', ids: [] });
      list(r.ids).forEach((id) => {
        const g = groups.get(key);
        if (!g.ids.includes(id)) g.ids.push(id);
      });
    }
    const gs = [...groups.values()].filter((g) => g.ids.length);
    if (!gs.length) return '';
    // a partner and its first structures; the rest of its structures, and the partners past `max`, open in place
    const one = (g) =>
      `<span><b class="t-${esc(g.tone)}">${esc(g.name)}</b> ${g.ids
        .slice(0, 3)
        .map((id) => entryBtn(id, c))
        .join(', ')}${
        g.ids.length > 3
          ? ` <details class="sp-more"><summary>+${g.ids.length - 3}</summary>${g.ids
              .slice(3)
              .map((id) => entryBtn(id, c))
              .join(', ')}</details>`
          : ''
      }</span>`;
    return (
      `<div class="contacts">${gs.slice(0, max).map(one).join('')}` +
      (gs.length > max
        ? `<details class="sp-more"><summary>+${gs.length - max} more</summary><div class="contacts">${gs.slice(max).map(one).join('')}</div></details>`
        : '') +
      '</div>'
    );
  }
  // bound windows: the chain around the contacted unit, contacted units in brackets; '-' past the chain's end
  const SQ = EV.sequences || {};
  function windowsOf(c) {
    const out = new Map();
    for (const name of SQ.tables || []) {
      if (!has(name)) continue;
      for (const r of at(c.tb, name, c.pos)) {
        const off = +(r.offset || 0),
          key = [r.window, r.type, r.kind, off].join('|');
        if (!out.has(key))
          out.set(key, {
            win: r.window,
            kind: r.kind,
            type: r.type,
            off,
            names: [],
            entries: new Set(),
            n: 0,
            dist: null,
            designed: true,
          });
        const w = out.get(key);
        if (r.name && !w.names.includes(r.name)) w.names.push(r.name);
        if (r.entry) w.entries.add(r.entry);
        w.n += r.entries ? +r.entries : 0;
        if (r.distance !== '' && r.distance != null)
          w.dist = w.dist == null ? +r.distance : Math.min(w.dist, +r.distance);
        if (!SQ.designed || r.preparation !== SQ.designed.preparation) w.designed = false;
      }
    }
    return [...out.values()]
      .map((w) => ({ ...w, count: Math.max(w.n, w.entries.size) }))
      .sort((a, b) => (a.off !== 0) - (b.off !== 0) || b.count - a.count || (a.dist ?? 99) - (b.dist ?? 99));
  }
  const winHtml = (w) => {
    const [e5, e3] = SQ.ends || ['', ''];
    const body = w.win.replace(/\[([^\]])\]|(-)|([^[\]-])/g, (m0, hit, gap, ch) =>
      gap
        ? '<span class="gap">·</span>'
        : hit
          ? `<b class="nt hit">${esc(hit)}</b>`
          : `<span class="nt">${esc(ch)}</span>`
    );
    return `<span class="na-win">${e5 ? `<span class="end">${esc(e5)}</span>` : ''}${body}${
      e3 ? `<span class="end">${esc(e3)}</span>` : ''
    }</span>`;
  };
  const winMeta = (w, c) =>
    `${
      w.type
        ? `<span class="tag na-type" title="${esc((SQ.kinds || {})[w.kind] || w.kind)}">${esc((SQ.types || {})[w.type] || w.type)}</span>`
        : ''
    }` +
    `${w.designed && SQ.designed ? `<span class="tag na-type">${esc(SQ.designed.label)}</span>` : ''}${
      w.off
        ? `<span class="tag" ` +
          `title="Contacted by residue ${esc(c.shown(c.pos + w.off))} (${rel(w.off)}), not by ${esc(c.label)} itself">via the residue ${relWords(w.off)}</span>`
        : ''
    }`;
  // a site's closest RNA or DNA contact (a side-chain atom within 4 Å in a PDB entry): the one place that finds and words
  // it, for the card's line and the Interactions page's list. rows: {kind, type, name, entry, distance, offset?}; a row
  // that is another residue's contact (offset) or has no distance does not count
  const KINDS = { rna: 'RNA', dna: 'DNA', hybrid: 'RNA-DNA hybrid' };
  const contactBest = (rows) => {
    let best = null;
    for (const r of rows) {
      if (+(r.offset || 0) !== 0 || r.distance === '' || r.distance == null || !Number.isFinite(+r.distance)) continue;
      const id = list(r.entry)[0];
      if (!id) continue;
      if (!best || +r.distance < best.dist)
        best = { kind: r.kind, type: r.type, name: r.name, entry: id, dist: +r.distance };
    }
    return best;
  };
  const contactWord = (b, kinds = KINDS) =>
    (kinds && kinds[b.kind]) || KINDS[b.kind] || String(b.kind || '').toUpperCase();
  // heavy atoms closer than any hydrogen bond or salt bridge: shown as it is, flagged (display only; the rows and tests are not changed)
  const CLASH_A = 2.0,
    CLASH_WORD = 'possible model clash',
    CLASH_TIP =
      'The side chain is closer to the nucleic acid than a hydrogen bond or salt bridge allows (under 2.0 Å between heavy atoms): the model may be misplaced here, as in low-resolution structures';
  const contactClash = (b) => !!b && b.dist < CLASH_A;
  const contactPhrase = (b, kinds) =>
    `In contact with ${contactWord(b, kinds)} in PDB ${b.entry.toUpperCase()} (${b.dist.toFixed(1)} Å${contactClash(b) ? ', ' + CLASH_WORD : ''})`;
  function contactLine(c) {
    const b = contactBest((SQ.tables || []).filter(has).flatMap((name) => at(c.tb, name, c.pos)));
    if (!b) return '';
    return (
      `<p class="sc-contact"><span class="flabel">${esc(contactWord(b, SQ.kinds))} contact:</span> ` +
      `${entryBtn(b.entry, c, 'PDB ' + b.entry.toUpperCase())}, ${b.dist.toFixed(1)} Å${
        contactClash(b) ? ` <span class="tag t-flag" title="${esc(CLASH_TIP)}">${CLASH_WORD}</span>` : ''
      }</p>`
    );
  }
  function sequences(c, compact) {
    if (!(SQ.tables || []).some(has)) return '';
    const ws = windowsOf(c);
    if (!ws.length) return '';
    const entriesWord = (n) => `${int(n)} entr${n === 1 ? 'y' : 'ies'}`;
    if (compact) {
      const w = ws[0];
      return `<div class="na-cell">${winHtml(w)}<div class="na-meta">${winMeta(w, c)}<span class="muted">${entriesWord(w.count)}${
        ws.length > 1 ? ` · +${ws.length - 1} more` : ''
      }</span></div></div>`;
    }
    const max = SQ.max || 5;
    return (
      `<p class="flabel">${esc(ctxWords(SQ.title || 'Bound sequences', c))}</p><ul class="sc-na">` +
      ws
        .slice(0, max)
        .map(
          (w) =>
            `<li>${winHtml(w)} ${winMeta(w, c)} <span class="muted small" title="${esc(
              w.names.join('\n') + '\n' + [...w.entries].map((x) => x.toUpperCase()).join(' ')
            )}">${esc(w.names[0] || '')}${w.names[0] ? ' · ' : ''}${entriesWord(w.count)}${
              w.dist != null ? ` · ${w.dist.toFixed(1)} Å` : ''
            }</span></li>`
        )
        .join('') +
      '</ul>' +
      (ws.length > max
        ? `<p class="muted small">${int(ws.length - max)} more bound sequence${ws.length - max === 1 ? '' : 's'}.</p>`
        : '')
    );
  }
  // residue evidence at or near the site: residues within span (each with its offset), and stretches holding the site
  const AR = EV.around || {};
  function aroundRows(c) {
    if (!has(AR.table)) return [];
    const span = AR.span ?? 3,
      lab = AR.labels || {};
    return rows(c.tb, AR.table).filter(
      (r) =>
        r.kind in lab && (r.start === r.end ? Math.abs(r.start - c.pos) <= span : c.pos >= r.start && c.pos <= r.end)
    );
  }
  function around(c, compact) {
    const rs = aroundRows(c);
    if (!rs.length) return '';
    const lab = AR.labels || {},
      short = { ...(EV.tags?.short || {}), ...(AR.short || {}) },
      by = new Map();
    rs.forEach((r) => {
      if (!by.has(r.kind)) by.set(r.kind, []);
      by.get(r.kind).push(r);
    });
    const seq = c.seq || '';
    if (compact === 'brief') {
      // one tag and "+n" (the kinds on hover), for a one-line row
      const ks = [...by.keys()],
        first = ks[0];
      return `<div class="na-meta"><span class="tag t-${esc((EV.tags?.tone || {})[first] || 'x')}" title="${esc(lab[first] || first)}">${esc(short[first] || first)}</span>${
        ks.length > 1
          ? `<span class="tag ` + `more" title="${esc(ks.map((k) => lab[k] || k).join('\n'))}">+${ks.length - 1}</span>`
          : ''
      }</div>`;
    }
    if (compact)
      return `<div class="na-meta">${[...by.entries()]
        .map(([k, xs]) => {
          const pts = xs
            .filter((r) => r.start === r.end)
            .map((r) => r.start - c.pos)
            .sort((a, b) => Math.abs(a) - Math.abs(b));
          return `<span class="tag t-${esc((EV.tags?.tone || {})[k] || 'x')}" title="${esc(lab[k] || k)}">${esc(short[k] || k)}${
            pts.length ? ' ' + (pts[0] === 0 ? 'at i' : rel(pts[0])) : ''
          }</span>`;
        })
        .join('')}</div>`;
    const drawn = new Set(peptidesAt(c).map((k) => k.kind));
    const line = [...by.entries()]
      .map(([k, xs]) => {
        const pts = xs
          .filter((r) => r.start === r.end)
          .map((r) => r.start)
          .sort((a, b) => Math.abs(a - c.pos) - Math.abs(b - c.pos));
        const spans = xs.filter((r) => r.start !== r.end && !drawn.has(k)); // a stretch shown with its sequence above is not repeated
        if (!pts.length && !spans.length) return '';
        return (
          `${esc(lab[k] || k)}${
            pts.length
              ? ': ' +
                pts
                  .slice(0, 4)
                  .map((q) =>
                    q === c.pos ? 'the site (i)' : `${esc((seq[q - 1] || '') + c.shown(q))} (${rel(q - c.pos)})`
                  )
                  .join(', ') +
                (pts.length > 4 ? ` +${pts.length - 4}` : '')
              : ''
          }` +
          `${
            spans.length ? ' ' + [...new Set(spans.map((r) => `${c.shown(r.start)}–${c.shown(r.end)}`))].join(', ') : ''
          }`
        );
      })
      .filter(Boolean)
      .join('; ');
    return line ? `<p class="small sc-around">${cap(line)}.</p>` : '';
  }
  // ---- RNA- and DNA-bound peptides at a site: their sequence, extent, study and dataset ------------------------------
  // Read from the site_evidence table's `detail` (the release prints each peptide as "start-end SEQUENCE", a crosslinked
  // peptide as "SEQ[X]UENCE at position"), checked by the release against the UniProt sequence. One home: the site card,
  // the sites page and the Interactions page's table all draw a peptide through peptideHtml.
  const PP = EV.peptides || {},
    PSRC = D.protein_view?.map?.sources || {}, // each source's paper (and dataset): the map's own list
    PK = PP.kinds || {};
  const pepOn = () => !!PP.table && has(PP.table) && Object.keys(PK).length > 0;
  // a row's `detail` as peptides: [{kind, start, end, seq (capitals), mark: Set of 0-based positions}]
  function peptideList(kind, detail) {
    const f = (PK[kind] || {}).format,
      by = new Map(),
      d = String(detail || '');
    const add = (start, seq, marks) => {
      const plain = seq.toUpperCase(),
        key = start + ':' + plain;
      if (!by.has(key)) by.set(key, { kind, start, end: start + plain.length - 1, seq: plain, mark: new Set() });
      marks.forEach((i) => by.get(key).mark.add(i));
    };
    if (f === 'range')
      for (const m of d.matchAll(/(\d+)-(\d+) ([A-Za-z]+)/g))
        add(
          +m[1],
          m[3],
          [...m[3]].flatMap((ch, i) => (ch !== ch.toUpperCase() ? [i] : []))
        );
    else if (f === 'crosslink')
      for (const m of d.matchAll(/([A-Z]*\[[A-Z]\][A-Z[\]]*) at (\d+)/g)) {
        const i = m[1].indexOf('[');
        add(+m[2] - i, m[1].replace(/[[\]]/g, ''), [i]);
      }
    return [...by.values()];
  }
  const PFULL = 60; // a longer peptide shows the stretch around the site, and all of it behind a fold
  // one peptide: the sequence with the site residue in bold and possible crosslink residues underlined, then start–end
  function peptideHtml(e, pos, shown, label) {
    const sh = shown || ((q) => q),
      hit = pos >= e.start && pos <= e.end ? pos - e.start : -1,
      body = (a, b) =>
        [...e.seq.slice(a, b)]
          .map((ch, k) => {
            const i = a + k;
            return i === hit
              ? `<b class="pep-site" title="the site, ${esc(ch + sh(pos))}">${esc(ch)}</b>`
              : e.mark.has(i)
                ? `<u class="pep-xl" title="${esc((PK[e.kind] || {}).mark || 'crosslinked residue')} ${esc(ch + sh(e.start + i))}">${esc(ch)}</u>`
                : esc(ch);
          })
          .join('');
    const long = e.seq.length > PFULL,
      a = long ? Math.max(0, (hit < 0 ? 0 : hit) - 25) : 0,
      b = long ? Math.min(e.seq.length, a + 50) : e.seq.length;
    return (
      `<span class="pep"><span class="pep-seq mono">${a ? '…' : ''}${body(a, b)}${b < e.seq.length ? '…' : ''}</span> ` +
      `<span class="muted pep-range">${esc(sh(e.start))}–${esc(sh(e.end))}</span>` +
      (long
        ? `<details class="pep-more"><summary>all ${int(e.seq.length)} residues</summary><span class="pep-seq pep-all mono">${body(0, e.seq.length)}</span></details>`
        : '') +
      (hit < 0 ? ` <span class="muted pep-near">${esc(missNote(e, pos, label || String(sh(pos))))}</span>` : '') +
      '</span>'
    );
  }
  // a peptide beside the site, not over it: how far off, computed from its ends
  function missNote(e, pos, label) {
    const d = pos < e.start ? e.start - pos : pos - e.end,
      n = `${d} residue${d === 1 ? '' : 's'}`;
    return `does not cover ${label}; ${pos < e.start ? `starts ${n} after it` : `ends ${n} before it`}`;
  }
  // a study: its paper (the DOI link) and its dataset, where the source names one. source: the row's own, else the kind's
  function studyOf(kind, source) {
    const names = String(source || '')
        .split(/;\s*/)
        .filter(Boolean),
      use = names.length ? names : (PK[kind] || {}).sources || [];
    return use.map((n) => {
      const s = PSRC[n] || {};
      return {
        name: n,
        text: s.cite || s.label || n,
        href: s.doi ? `https://doi.org/${s.doi}` : s.url || '',
        doi: s.doi || '',
        data: s.data || null,
      };
    });
  }
  const studyHtml = (st, sep = '<br>') =>
    st
      .map((x) => (x.href ? `<a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : esc(x.text)))
      .join(sep);
  const dataHtml = (st, sep = '<br>') =>
    st
      .filter((x) => x.data)
      .map((x) => `<a href="${esc(x.data.url)}" target="_blank" rel="noopener">${esc(x.data.label)}</a>`)
      .join(sep);
  // the peptides at one site, by kind: [{kind, label, st (studies), list (peptides)}]
  function peptidesAt(c) {
    if (!pepOn()) return [];
    const out = new Map();
    for (const r of at(c.tb, PP.table, c.pos)) {
      if (!PK[r.kind]) continue;
      if (!out.has(r.kind))
        out.set(r.kind, { kind: r.kind, label: PK[r.kind].label || r.kind, src: new Set(), list: [] });
      const o = out.get(r.kind);
      String(r.source || '')
        .split(/;\s*/)
        .filter(Boolean)
        .forEach((x) => o.src.add(x));
      for (const e of peptideList(r.kind, r.detail))
        if (!o.list.some((x) => x.start === e.start && x.seq === e.seq)) o.list.push(e);
    }
    return Object.keys(PK)
      .filter((k) => out.has(k))
      .map((k) => ({ ...out.get(k), st: studyOf(k, [...out.get(k).src].join('; ')) }));
  }
  const PMAX = 3;
  function peptides(c) {
    const ks = peptidesAt(c);
    if (!ks.length) return '';
    const one = (e) => `<li>${peptideHtml(e, c.pos, c.shown, c.label)}</li>`;
    return (
      `<p class="flabel">${esc(ctxWords(PP.title || 'RNA- and DNA-bound peptides at {site}', c))}</p><ul class="sc-pep">` +
      ks
        .map((k) => {
          const d = dataHtml(k.st, ' · ');
          return (
            `<li><span class="tag t-${esc((EV.tags?.tone || {})[k.kind] || 'x')}">${esc(k.label)}</span> ` +
            `<span class="small">${studyHtml(k.st, '; ')}${d ? ' · ' + d : ''}</span>` +
            (k.list.length
              ? `<ul class="pep-list">${k.list.slice(0, PMAX).map(one).join('')}</ul>` +
                (k.list.length > PMAX
                  ? `<details class="pep-more"><summary>+${k.list.length - PMAX} more</summary><ul class="pep-list">${k.list
                      .slice(PMAX)
                      .map(one)
                      .join('')}</ul></details>`
                  : '')
              : '') +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }
  // the whole protein, labeled so it is not read as site evidence
  function wholeProtein(c) {
    const pr = EV.protein;
    if (!pr || (pr.table && !has(pr.table))) return '';
    const r = pr.table ? rows(c.tb, pr.table)[0] || {} : {};
    // a value: a protein attribute (proteins.attributes, K.proteinAttr) or a column of a protein_values table
    const parts = (pr.values || [])
      .map((v) => {
        const x = v.attribute ? K.proteinAttr?.(c.acc, v.attribute) : r[v.column];
        if (x === '' || x == null || x === 0 || x === '0' || x === 'false') return '';
        if (v.flag) return esc(v.label);
        return v.before ? `${esc(v.label)} ${esc(String(x).replace(/;\s*/g, ', '))}` : `${esc(num(x))} ${esc(v.label)}`;
      })
      .filter(Boolean);
    if (!parts.length) return '';
    return (
      `<p class="sc-prot"><span class="flabel">${esc(
        ctxWords(pr.title || 'Whole protein', c)
      )}</span> ${parts.join(' · ')}` +
      (pr.opens && document.getElementById(pr.opens)
        ? ` <button class="linkish" type="button" data-open-fold="${esc(pr.opens)}">${esc(
            ctxWords(pr.opens_label || K.ACT.showMore, c)
          )}</button>`
        : '') +
      '</p>'
    );
  }
  // the site's structures: closed, behind a count of their entries (the records block lists who they are)
  function spanning(c) {
    const st = entries(c);
    if (!st) return '';
    const n = new Set([...st.matchAll(/data-entry3d="([^"]*)"/g)].map((m) => m[1].toLowerCase())).size;
    return `<details class="sp-more"><summary>Structures ${int(n)}</summary>${st}</details>`;
  }
  function evidenceBlock(c) {
    if (!EV.status && !EV.tags && !EV.entries && !(SQ.tables || []).length) return '';
    const body =
      (EV.status ? `<p class="sc-status">${badge(c)} ${sentence(c)}</p>` : '') +
      tags(c) +
      contactLine(c) +
      sequences(c) +
      peptides(c) +
      around(c) +
      spanning(c) +
      wholeProtein(c);
    return `<section class="sc-ix"><h4>${esc(EV.title || 'Interaction evidence')}${K.methodLink ? '' : ''}</h4>${body}</section>`;
  }

  // ---- the methylation state as each source gives it; changes with their counts; perturbation calls --------------
  function states(c, compact) {
    const ss = C.states || [];
    if (!ss.length) return '';
    const lines = ss
      .map((s) => {
        let vals;
        if (s.attribute) vals = attrVals(c, s.attribute).map((v) => vLabel(s.attribute, v));
        else if (has(s.table)) vals = list((at(c.tb, s.table, c.pos)[0] || {})[s.column]);
        else return '';
        if (!vals.length) return '';
        const lab = s.url
          ? `<a href="${esc(s.url.replace('{acc}', encodeURIComponent(c.acc)))}" target="_blank" ` +
            `rel="noopener">${esc(s.label)}</a>`
          : s.source && lookupRow(s.source)?.doi
            ? doiA(lookupRow(s.source).doi, esc(s.label))
            : esc(s.label);
        return compact
          ? `<span class="tag" title="${esc(s.label)}">${esc(vals.join('/'))} <span class="muted">${esc(s.label.replace(/^\(/, '').split(/[ ,(]/)[0])}</span></span>`
          : `${esc(vals.join(', '))} <span class="muted">${lab}</span>`;
      })
      .filter(Boolean);
    return lines.length
      ? compact
        ? `<div class="tags">${lines.join(' ')}</div>`
        : lines.join('<br>')
      : compact
        ? '<span class="muted">–</span>'
        : '<span class="muted">no source gives a state</span>';
  }
  const renumber = (c, v) =>
    String(v).replace(/^([A-Za-z])(\d+)(?=[A-Za-z*])/, (m0, a, d) => (+d === c.pos ? a + c.shown(c.pos) : m0));
  // ---- changes at residues counted from per-change tables (card.change_counts): a count at each residue, beside the
  // protein's average per residue of the same kind (the background table). The tables list one change per tumor or line;
  // the table format residue_changes (tables.py) counts them per site and new residue.
  const CCN = (C.change_counts || []).filter((x) => (x.tables || []).some(has));
  const CC_IDX = new WeakMap();
  function changeIdx(tb, x) {
    // position -> [{alt, n}], most first, over the entry's tables
    let m = CC_IDX.get(tb);
    if (!m) CC_IDX.set(tb, (m = {}));
    return (m[x.id] ||= (() => {
      const idx = new Map();
      for (const t of x.tables || [])
        for (const r of rows(tb, t)) {
          if (!idx.has(r.position)) idx.set(r.position, []);
          // one entry a new residue; a table that names the gene keeps the count of each gene in `by`
          const v = idx.get(r.position);
          let e = v.find((a) => a.alt === r.alt);
          if (!e) v.push((e = { alt: r.alt, n: 0, by: {} }));
          e.n += +r.n || 0;
          if (x.gene && r[x.gene]) e.by[r[x.gene]] = (e.by[r[x.gene]] || 0) + (+r.n || 0);
        }
      idx.forEach((v) => v.sort((a, b) => b.n - a.n || (a.alt < b.alt ? -1 : 1)));
      return idx;
    })());
  }
  const changesAt = (tb, x, pos) => changeIdx(tb, x).get(pos) || [];
  const changeTotal = (v) => v.reduce((a, r) => a + r.n, 0);
  // the protein's average per residue of one kind (letter): changes at its residues of that kind over how many it has
  function changeAvg(tb, x, letter) {
    const r = has(x.background) ? rows(tb, x.background).find((q) => q.residue === letter) : null;
    const n = r ? +r.residues : 0;
    return r && n ? { per: (+r[x.count] || 0) / n, residues: n, changes: +r[x.count] || 0 } : null;
  }
  const avgText = (v) =>
    v == null ? '–' : v === 0 ? '0' : v < 0.1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : int(Math.round(v));
  const residueName = (l) => D.residue_names?.[l] || ((D.residues || []).length === 1 ? W.residue : l);
  const residueNames = (l) =>
    D.residue_names?.[l] ? D.residue_names[l] + 's' : (D.residues || []).length === 1 ? W.residues : l + ' residues';
  // a residue's samples with a change, as the site table counts them: distinct samples in all, and without hypermutated ones
  // (K.prop, the one home of both). null until the protein's shard is in; the card then falls back to the rows' sum
  function sampleCounts(x, acc, pos) {
    const s = K.prop?.sources.find((y) => y.card === x.id);
    if (!s || !K.prop.peek(acc)) return null;
    const all = K.prop.at(acc, s.id, pos, true),
      nh = K.prop.at(acc, s.id, pos, false);
    return all ? { all: all.kAll, nh: nh?.nh && nh.k !== all.kAll ? nh.k : null } : null;
  }
  function changeCountsInner(c) {
    const letter = (c.seq || '')[c.pos - 1] || '',
      nm = residueName(letter);
    return CCN.map((x) => {
      const v = changesAt(c.tb, x, c.pos),
        unit = x.unit || ['', ''],
        b = changeAvg(c.tb, x, letter);
      const sc = v.length ? sampleCounts(x, c.acc, c.pos) : null,
        t = sc ? sc.all : changeTotal(v);
      const head = t
        ? `${v
            .map((r) => `<b>${esc(letter + c.shown(c.pos) + r.alt)}</b>${r.n > 1 ? ' ×' + int(r.n) : ''}`)
            .join(', ')} <span class="muted">in ${int(t)} ${esc(t === 1 ? unit[0] : unit[1])} (${esc(x.label)})</span>`
        : `<span class="muted">no change in ${esc(unit[1])} (${esc(x.label)})</span>`;
      return (
        `<div>${head}<br><span class="muted small">${t ? `at this ${esc(nm)}: ${int(t)} · ` : ''}` +
        `${sc?.nh != null ? `without hypermutated: ${int(sc.nh)} · ` : ''}` +
        `protein average per ${esc(nm)}: ${avgText(b?.per)}</span></div>`
      );
    }).join('');
  }
  // the counts are redrawn in place once the protein's samples are in
  function changeCounts(c) {
    const id = `${c.acc}:${c.pos}`;
    if (CCN.length && K.prop && K.prop.peek(c.acc) === undefined)
      K.prop.load(c.acc).then(() => {
        const el = document.querySelector(`[data-cc-host="${CSS.escape(id)}"]`);
        if (el) el.innerHTML = changeCountsInner(c);
      });
    return `<div data-cc-host="${esc(id)}">${changeCountsInner(c)}</div>`;
  }
  // ---- variants at residues from per-variant tables (card.variant_counts): the count at a residue beside the protein's
  // average per residue of the same kind, as the change counts above. A table lists one row per variant (site_table).
  const VCN = (C.variant_counts || []).filter((x) => (x.tables || []).some(has));
  const VC_IDX = new WeakMap();
  function variantIdx(tb, x) {
    // position -> [row], over the entry's tables
    let m = VC_IDX.get(tb);
    if (!m) VC_IDX.set(tb, (m = {}));
    if (x.lazy && !tb._vd?.[x.id]) return new Map(); // its list is not read yet
    return (m[x.id] ||= (() => {
      const idx = new Map();
      for (const r of x.lazy ? tb._vd[x.id] : (x.tables || []).flatMap((t) => rows(tb, t))) {
        if (!idx.has(r.position)) idx.set(r.position, []);
        idx.get(r.position).push(r);
      }
      return idx;
    })());
  }
  const variantsAt = (tb, x, pos) => variantIdx(tb, x).get(pos) || [];
  // the genes a protein's rows of one source name, and whether the page shows them: only for a protein that several genes
  // encode, or whose rows name more than one gene (a lone gene is the page's title already)
  function genesOfRows(tb, x) {
    if (!x.gene) return [];
    const rs = x.lazy ? tb._vd?.[x.id] || [] : (x.tables || []).flatMap((t) => rows(tb, t));
    return [...new Set(rs.map((r) => r[x.gene]).filter(Boolean))];
  }
  const showGene = (acc, tb, x) =>
    !!x.gene && ((D.protein_genes?.[acc] || []).length > 1 || genesOfRows(tb, x).length > 1);
  // the count and the highlighted count at a residue: a lazy source keeps them in the protein's table shard (_vc), the
  // rest are counted from the rows
  const VS_IDX = new WeakMap();
  function variantSums(tb, x) {
    let m = VS_IDX.get(tb);
    if (!m) VS_IDX.set(tb, (m = {}));
    return (m[x.id] ||= (() => {
      const out = new Map();
      if (x.lazy) {
        const f = tb._vc?.[x.id] || [];
        let pos = 0;
        for (let i = 0; i < f.length; i += 3) out.set((pos += f[i]), { n: f[i + 1], hot: f[i + 2] });
      } else variantIdx(tb, x).forEach((v, q) => out.set(q, { n: v.length, hot: v.filter((r) => isHot(x, r)).length }));
      return out;
    })());
  }
  const variantSum = (tb, x, pos) => variantSums(tb, x).get(pos) || { n: 0, hot: 0 };
  // a variant is highlighted when the entry's highlight column equals the value, or matches the pattern (pathogenic, say)
  const HOT_RX = new WeakMap();
  const isHot = (x, r) => {
    const h = x.highlight;
    if (!h) return false;
    const v = String(r[h.column] ?? '');
    if (h.matches) {
      if (!HOT_RX.has(h)) HOT_RX.set(h, new RegExp('^(?:' + h.matches + ')$'));
      return HOT_RX.get(h).test(v);
    }
    return v === String(h.equals);
  };
  const hotCount = (x, vs) => vs.filter((r) => isHot(x, r)).length;
  // ---- a site's variants: the one home of their counts. Every page that states one calls these. "variants" is every variant
  // the table lists at the site's residue, whatever its classification; the highlighted subset (ClinVar: classified Pathogenic or
  // Likely pathogenic, label P/LP; conflicting classifications are not in it) is counted from the same table.
  const siteVariants = (tb, pos) => VCN.map((x) => ({ x, ...variantSum(tb, x, pos) }));
  const variantWords = (x, n, hot) => {
    const unit = x.unit || ['variant', 'variants'];
    return `${n ? int(n) : 'no'} ${n === 1 ? unit[0] : unit[1]}${n && x.highlight?.label ? `, ${int(hot)} ${x.highlight.label}` : ''}`;
  };
  // how many of the sites (positions) have a variant, and how many a highlighted one
  const variantSites = (tb, x, positions) => {
    let any = 0,
      hot = 0;
    for (const q of positions) {
      const v = variantSum(tb, x, q);
      if (v.n) any++;
      if (v.hot) hot++;
    }
    return { any, hot, of: positions.length };
  };
  const variantText = (tb, pos) =>
    siteVariants(tb, pos)
      .map(({ x, n, hot }) => `${x.label}: ${variantWords(x, n, hot)}`)
      .join('; ');
  // the one line other pages show for a site: its counts as a link that opens the site card at its variants
  // with `changes`, the site's tumors and cell lines follow (the card's summary: those counts are as the site table gives them)
  const changeWords = (x, tb, acc, pos) => {
    const sc = sampleCounts(x, acc, pos),
      n = sc ? sc.all : changeTotal(changesAt(tb, x, pos)),
      unit = x.unit || ['', ''];
    return `${n ? int(n) : 'no'} ${n === 1 ? unit[0] : unit[1]}`;
  };
  const variantParts = (tb, acc, pos, changes) =>
    siteVariants(tb, pos)
      .map(({ x, n, hot }) => `<b>${esc(x.label)}</b> ${esc(variantWords(x, n, hot))}`)
      .concat(
        changes
          ? CCN.filter((x) => changesAt(tb, x, pos).length).map(
              (x) => `<b>${esc(x.label)}</b> ${esc(changeWords(x, tb, acc, pos))}`
            )
          : []
      )
      .join(' · ');
  function variantLine(tb, acc, pos, changes) {
    const id = `${acc}:${pos}`;
    if (changes && CCN.length && K.prop && K.prop.peek(acc) === undefined)
      K.prop.load(acc).then(() => {
        document.querySelectorAll(`[data-vl="${CSS.escape(id)}"]`).forEach((el) => {
          el.innerHTML = variantParts(tb, acc, pos, true);
        });
      });
    return `<a class="sc-vline" data-vl="${esc(id)}" href="${esc(K.link('protein', `${acc}/${pos}`, { open: 'sc-variants' }))}" title="Open the site card at its variants">${variantParts(tb, acc, pos, changes)}</a>`;
  }
  // the condition names the table carries for a site's highlighted (P/LP) variants, each once, in table order. The rows are the
  // protein's variant lists (a file of their own for a lazy source), read on the first ask: null until they arrive, then
  // onDetail's functions run. [] where the source has no highlight or no field with a separator.
  const DET = {}; // accession -> variant lists (undefined: not asked, null: on its way)
  const detailSubs = [];
  const detailFor = (tb, acc) => {
    if (tb._vd) return tb._vd;
    if (DET[acc]) return (tb._vd = DET[acc]);
    if (DET[acc] === undefined) {
      DET[acc] = null;
      loadDetail(acc).then((d) => {
        DET[acc] = d || {};
        detailSubs.slice().forEach((fn) => fn(acc));
      });
    }
    return null;
  };
  const variantConditions = (tb, acc, x, pos) => {
    const f = (x.fields || []).find((y) => y.separator);
    if (!x.highlight || !f) return [];
    if (x.lazy && !detailFor(tb, acc)) return null;
    const names = [];
    variantsAt(tb, x, pos)
      .filter((r) => isHot(x, r))
      .forEach((r) =>
        String(r[f.column] ?? '')
          .split(f.separator)
          .map((t) => t.trim())
          .filter((t) => t && !names.includes(t))
          .forEach((t) => names.push(t))
      );
    return names;
  };
  // the same for download: every highlighted source's names, '; ' between them
  const conditionsText = (tb, acc, pos) => {
    const xs = VCN.filter((x) => x.highlight);
    return xs
      .map((x) => {
        const n = variantConditions(tb, acc, x, pos) || [];
        return n.length && xs.length > 1 ? `${x.label}: ${n.join('; ')}` : n.join('; ');
      })
      .filter(Boolean)
      .join(' | ');
  };
  // a promise for the moment the variant lists of a protein are in (at once for a page without a lazy source)
  const detailReady = (tb, acc) =>
    !VCN.some((x) => x.lazy) || detailFor(tb, acc)
      ? Promise.resolve()
      : new Promise((res) => {
          const fn = (a) => {
            if (a !== acc) return;
            detailSubs.splice(detailSubs.indexOf(fn), 1);
            res();
          };
          detailSubs.push(fn);
        });
  function variantCounts(c) {
    const letter = (c.seq || '')[c.pos - 1] || '',
      nm = residueName(letter);
    return siteVariants(c.tb, c.pos)
      .map(({ x, n, hot }) => {
        const b = changeAvg(c.tb, x, letter),
          cond = hot ? variantConditions(c.tb, c.acc, x, c.pos) : [];
        return (
          `<div><b>${esc(x.label)}</b>: ${esc(variantWords(x, n, hot))} <span class="muted small">· protein average per ${esc(nm)}: ${avgText(b?.per)}</span>` +
          (cond === null
            ? '<br><span class="muted small">Loading conditions…</span>'
            : cond.length
              ? `<br><span class="small">${esc(cap((x.highlight.title || x.highlight.label).replace(/\s*\([^)]*\)\s*$/, '')))} conditions: ${cond.map(esc).join('; ')}</span>`
              : '') +
          '</div>'
        );
      })
      .join('');
  }
  function changes(c) {
    const cs = C.changes || [];
    if (!cs.length) return changeCounts(c);
    const parts = cs
      .map((x) => {
        const vals = attrVals(c, x.attribute);
        if (!vals.length) return '';
        const n = has(x.table) && x.counts ? list((at(c.tb, x.table, c.pos)[0] || {})[x.counts]) : [];
        const tot = n.reduce((a, b) => a + (+b || 0), 0),
          unit = x.unit || ['', ''];
        return `${vals.map((v, i) => `<b>${esc(renumber(c, v))}</b>${+n[i] > 1 ? ' ×' + int(n[i]) : ''}`).join(', ')}${
          tot ? ` <span class="muted">` + `in ${int(tot)} ${esc(tot === 1 ? unit[0] : unit[1])}</span>` : ''
        } <span class="muted">(${esc(x.label)})</span>`;
      })
      .filter(Boolean);
    return parts.length
      ? parts.join('<br>')
      : `<span class="muted">no change in ${esc(cs.map((x) => x.label).join(' or '))}</span>`;
  }
  const CL = C.calls || {};
  function callRows(c) {
    const out = [],
      skip = new Set(CL.skip || []);
    for (const name of CL.tables || [])
      if (has(name))
        at(c.tb, name, c.pos).forEach((r) => {
          if (!skip.has(r.call)) out.push({ label: (CL.conditions || {})[r.condition] || r.condition, ...r });
        });
    for (const [a, lab] of Object.entries(CL.attributes || {}))
      attrVals(c, a).forEach((v) => {
        if (!skip.has(v)) out.push({ label: lab, call: v, attribute: a });
      });
    return out;
  }
  // the key to the marks of a calls column: each mark with its word, the quiet word, and the dash
  const callsKey = () =>
    `<p class="key calls-key">${Object.entries(CL.marks || {})
      .map(
        ([k, m]) =>
          `<span><span ` + `class="trend c-${esc(k)}"><b>${esc(m)}</b></span> ${esc((CL.words || {})[k] || k)}</span>`
      )
      .join('')}<span><span ` +
    `class="muted">${esc(CL.quiet || 'n.s.')}</span> measured, no significant change</span><span><span ` +
    `class="muted">–</span> not measured</span><span class="muted">a number beside a site: how many experiments ` +
    `· tap or hover for the numbers</span></p>`;
  function calls(c, compact) {
    if (!(CL.tables || []).some(has) && !Object.keys(CL.attributes || {}).some((a) => SPECS[a])) return '';
    const rs = callRows(c);
    if (!rs.length) return '<span class="muted">–</span>';
    const marked = rs.filter((r) => (CL.marks || {})[r.call]);
    const tip = (r) =>
      [
        `${r.label}: ${(CL.words || {})[r.call] || r.call}`,
        r.n
          ? `${r.n} peptide${+r.n === 1 ? '' : 's'}${
              r.n_down || r.n_up ? ` (${r.n_down || 0} down, ${r.n_up || 0} up)` : ''
            }`
          : '',
        r.value !== undefined && r.value !== '' ? `log2 ${num(r.value, 'l2')}` : '',
        r.q ? `q ${num(r.q, 'p')}` : '',
        r.rule ? `rule: ${String(r.rule).replace(/_/g, ' ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    if (!marked.length)
      return `<span class="muted" title="${esc(
        'Measured: ' + rs.map((r) => r.label).join(', ') + '; no significant change'
      )}">${esc(CL.quiet || 'n.s.')}</span>`;
    // the row's hover stays short (a sentence, not each measurement: the site card's table has those): the call, then up to
    // three conditions with their log2, and how many more
    const brief = (k, xs) =>
      `${(CL.words || {})[k] || k}: ` +
      xs
        .slice(0, 3)
        .map((r) => r.label + (r.value !== undefined && r.value !== '' ? ` (log2 ${num(r.value, 'l2')})` : ''))
        .join(', ') +
      (xs.length > 3 ? ` and ${xs.length - 3} more` : '');
    if (compact) {
      // one symbol and a count per kind of call; the legend (each measurement) on hover
      const by = new Map();
      marked.forEach((r) => {
        if (!by.has(r.call)) by.set(r.call, []);
        by.get(r.call).push(r);
      });
      return [...by.entries()]
        .map(
          ([k, xs]) =>
            `<span class="trend c-${esc(k)}" title="${esc(brief(k, xs))}"><b>${esc(CL.marks[k])}</b>${xs.length > 1 ? xs.length : ''}</span>`
        )
        .join(' ');
    }
    return marked
      .map(
        (r) =>
          `<span class="trend c-${esc(r.call)}" title="${esc(tip(r))}"><b>${esc(CL.marks[r.call])}</b>${esc(r.label)}</span>`
      )
      .join(' ');
  }
  function callsTable(c) {
    const rs = callRows(c).filter((r) => !r.attribute);
    if (!rs.length) return '';
    return (
      `<p><b>${esc(cap(C.calls?.title || 'Perturbations'))}</b> <span class="muted small">(every measurement ` +
      `at the site; a call is a peptide-level change)</span></p><div class="tbl-card"><table class="tbl compact">` +
      `<thead><tr><th>Condition</th><th>Call</th><th class="num">Peptides (down / up)</th><th class="num">log2</th><th ` +
      `class="num">q</th><th>Rule</th></tr></thead><tbody>` +
      rs
        .map(
          (r) =>
            `<tr><td>${esc(r.label)}</td><td>${
              (CL.marks || {})[r.call] ? `<b class="trend c-${esc(r.call)}">${esc(CL.marks[r.call])}</b> ` : ''
            }${esc((CL.words || {})[r.call] || r.call)}</td><td ` +
            `class="num">${esc(r.n || '–')}${
              r.n_down !== undefined ? ` <span class="muted">(${esc(r.n_down || 0)}/${esc(r.n_up || 0)})</span>` : ''
            }</td><td ` +
            `class="num">${num(r.value, 'l2')}</td><td class="num">${num(r.q, 'p')}</td><td class="small">${esc(
              String(r.rule || '').replace(/_/g, ' ')
            )}</td></tr>`
        )
        .join('') +
      '</tbody></table></div>'
    );
  }

  // ---- who binds it, and how it was found (site_records) ------------------------------------------------------------
  const RC = C.records || {};
  const RL = C.role_labels || {}; // the site file's names for the enzyme roles (phospho: Kinase, Phosphatase)
  const grpLabel = (g) => {
    const attr = RC.groups && SPECS[RC.groups] ? RC.groups : '';
    if (attr && (SPECS[attr].values || {})[g] != null) return vLabel(attr, g); // the attribute's label wins
    return (RC.labels || {})[g] || (attr ? vLabel(attr, g) : g.replace(/_/g, ' ')); // the site file's label, else the code
  };
  const grpOrder = (g) => {
    const v = Object.keys(SPECS[RC.groups]?.values || {});
    const k = v.indexOf(g);
    return k < 0 ? 999 : k;
  };
  // card.records.rollup: [{label, groups: [codes]}] puts the groups of a heading under one line, as "binds it modified"
  // against "binds the residue (unmodified or another state)"; a group no roll names stands alone
  const rollOf = (g) => (RC.rollup || []).find((x) => (x.groups || []).includes(g));
  const paperKey = (r) => r.pubmed || r.doi || r.citation || '';
  const paperA = (r) => {
    const pml = K.papers.ids(r.pubmed);
    if (pml.length > 1 && !r.citation) return K.papers.links(pml, { label: (id) => 'PMID ' + id });
    const url = pml.length
      ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pml[0])}/`
      : r.doi
        ? `https://doi.org/${r.doi}`
        : '';
    const label = esc(r.citation || (r.pubmed ? 'PMID ' + r.pubmed : r.doi ? 'doi:' + r.doi : ''));
    return url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(r.title || '')}">${label}</a>`
      : label;
  };
  function recordGroups(c, rs) {
    const by = new Map();
    for (const r of rs) {
      if (!by.has(r.group)) by.set(r.group, new Map());
      const g = by.get(r.group),
        key = [r.partner_kind, r.partner_accession || r.partner || r.partner_name, r.state, r.source, r.species].join(
          '|'
        );
      if (!g.has(key)) g.set(key, { ...r, ids: [], methods: [], papers: new Map(), n: 0 });
      const x = g.get(key);
      x.n++;
      if (r.id && !x.ids.includes(r.id)) x.ids.push(r.id);
      if (r.method && !x.methods.includes(r.method)) x.methods.push(r.method);
      if (paperKey(r)) x.papers.set(paperKey(r), r);
    }
    return [...by.entries()].sort((a, b) => grpOrder(a[0]) - grpOrder(b[0]));
  }
  // ---- the partners a site's records name: one list, drawn here and by nothing else -----------------------------------
  const isProteinRec = (r) => r.partner_kind === 'protein' || (!r.partner_kind && !!r.partner_accession);
  // a partner's name: its gene, else the page's gene for its accession, else the record's protein name, else the accession
  const partnerLabel = (r) =>
    r.partner ||
    (r.partner_accession && K.prot?.gene?.(r.partner_accession)) ||
    r.partner_name ||
    r.partner_accession ||
    '';
  // the organism of a record's partner when it is not the site's own (RC.species), else ''
  const otherSpecies = (r) => {
    const sp = String(r.species || '');
    return RC.species && sp && !sp.split(/[;,]\s*/).includes(RC.species) ? sp : '';
  };
  const speciesShort = (sp) => sp.split(/[;,]/)[0].replace(/^([A-Z])[a-z]+ /, '$1. ');
  const speciesTag = (sp) =>
    sp ? ` <span class="sp-species" title="${esc(sp)}">(${esc(speciesShort(sp))})</span>` : '';
  // the protein partners of a site's records by group: group -> name+species -> {name, acc, species}
  function partnerGroups(rs, { self = false } = {}) {
    const by = new Map();
    for (const r of rs) {
      const isSelf = r.partner_kind === 'self';
      if (!isProteinRec(r) && !(self && isSelf)) continue;
      const name = isSelf ? 'another copy' : partnerLabel(r);
      if (!name) continue;
      if (!by.has(r.group)) by.set(r.group, new Map());
      const sp = isSelf ? '' : otherSpecies(r),
        k = name + '|' + sp,
        g = by.get(r.group);
      if (!g.has(k)) g.set(k, { name, acc: isSelf ? '' : r.partner_accession || '', species: sp, self: isSelf });
      // the first structure entry that holds the partner (the one a line can name beside it: "KDM4A (5FWE)")
      const x = g.get(k);
      if (!x.pdb && r.id && r.source && r.source === Object.keys(RC.urls || {})[0]) x.pdb = r.id;
    }
    return by;
  }
  // a protein in a partner list: its name linked to its page here when the release has it, else to UniProt; the accession
  // is shown (`show`) or in the tooltip; the organism follows when it is not the site's own. The one drawing of a partner.
  // `byName`: the name is a bare gene symbol or alias (no accession): the explorer's own index resolves it (gene, previous
  // names, aliases), and a name it does not know links to a UniProt search of human reviewed entries (never a guessed accession).
  // Complex and family names (website.protein.complex_names) never resolve to one protein, even when a
  // gene lists the name as an alias; they link to the UniProt search like any unresolved name.
  const normName = (n) =>
    String(n || '')
      .toUpperCase()
      .replace(/[\s-]+/g, '');
  const COMPLEX = new Set((D.protein_view?.complex_names || []).map(normName));
  const isComplexName = (n) => COMPLEX.has(normName(n));
  const accByName = (n) => (isComplexName(n) ? '' : K.prot?.byName?.(n) || '');
  function protRef(acc, name, { listed = false, species = '', show = false, title = '', byName = false } = {}) {
    if (byName && !acc && name && !species) {
      acc = accByName(name);
      listed = !!acc && !!K.prot?.isListed?.(acc);
      if (!acc) {
        const q = encodeURIComponent(`gene:${name} AND organism_id:9606 AND reviewed:true`).replace(/%20/g, '+');
        return (
          `<a href="https://www.uniprot.org/uniprotkb?query=${q}" target="_blank" rel="noopener" ` +
          `title="${esc('Search UniProt (human, reviewed)')}"><b>${esc(name)}</b></a>`
        );
      }
    }
    const label = name || acc || '',
      tip = [title, acc].filter(Boolean).join(' · ');
    let out;
    if (acc && listed && !species)
      out = `<a href="${esc(K.link('protein', acc))}" title="${esc(tip)}"><b>${esc(label)}</b></a>`;
    else if (acc)
      out =
        `<a href="https://www.uniprot.org/uniprotkb/${encodeURIComponent(acc)}/entry" target="_blank" rel="noopener" ` +
        `title="${esc(tip + ' · UniProt')}"><b>${esc(label)}</b></a>`;
    else out = `<b title="${esc(tip)}">${esc(label)}</b>`;
    if (show && acc && acc !== label) out += ` <span class="muted small mono">${esc(acc)}</span>`;
    return out + speciesTag(species);
  }
  // names as a line: the first `max`, each linked (here or to UniProt), then how many more
  function namesHtml(xs, max, isListed, moreHref = '') {
    const one = (x) =>
      (x.self
        ? `<b>${esc(x.name)}</b>`
        : protRef(x.acc, x.name, { listed: !!(x.acc && isListed?.(x.acc)), species: x.species, byName: !x.acc })) +
      (x.showPdb && x.pdb ? ` <span class="muted small">(${esc(String(x.pdb).toUpperCase())})</span>` : '');
    return (
      xs.slice(0, max).map(one).join(', ') +
      (xs.length > max
        ? moreHref
          ? ` <a href="${esc(moreHref)}" title="Open the records table">+${int(xs.length - max)} more</a>`
          : ` <span class="muted">+${int(xs.length - max)} more</span>`
        : '')
    );
  }
  // names with the site's own species first: the human records (the first `max`), then the others folded into a muted
  // "+N in other species" that expands inline with each name's species label; a list with no human record says so
  // ("No human writer · 2 in other species ▸", noun: writer, eraser, binder) and folds the labeled names.
  // Returns { n: the human count shown first, html }.
  function namesBySpecies(xs, max, isListed, moreHref = '', noun = 'record') {
    const own = xs.filter((x) => !x.species),
      other = xs.filter((x) => x.species);
    if (!own.length && other.length)
      return {
        n: 0,
        html:
          `<span class="muted">No human ${esc(noun)}</span> · <details class="sp-more muted"><summary>${int(other.length)} in other species ▸</summary>` +
          `${namesHtml(other, other.length, isListed)}</details>`,
      };
    if (!own.length || !other.length) return { n: xs.length, html: namesHtml(xs, max, isListed, moreHref) };
    return {
      n: own.length,
      html:
        namesHtml(own, max, isListed, moreHref) +
        ` <details class="sp-more muted"><summary>+${int(other.length)} in other species</summary>` +
        `${namesHtml(other, other.length, isListed)}</details>`,
    };
  }
  function partnerHtml(r, c) {
    const kinds = RC.kinds || {},
      other = otherSpecies(r);
    let name;
    if (r.partner_kind === 'self' || (r.partner_accession && r.partner_accession === c.acc))
      name = `<b>${esc(c.gene)}</b> <span ` + `class="muted">${esc(kinds.self || 'another copy')}</span>`;
    else if (isProteinRec(r))
      return protRef(r.partner_accession, partnerLabel(r), {
        listed: !!(r.partner_accession && c.isListed?.(r.partner_accession)),
        species: other,
        show: true,
        title: r.partner_name || '',
      });
    else
      name = `<b>${esc(kinds[r.partner_kind] || r.partner_kind || '')}</b>${
        r.partner_name ? ` <span class="muted">${esc(String(r.partner_name).slice(0, 60))}</span>` : ''
      }`;
    return name + speciesTag(other);
  }
  function sourceCell(x, c) {
    const url = (RC.urls || {})[x.source],
      ids = x.ids;
    const link = (id) =>
      x.source && url && /\{id\}/.test(url)
        ? EV.entries && x.source === Object.keys(RC.urls || {})[0]
          ? entryBtn(id, c)
          : `<a href="${esc(url.replace('{id}', encodeURIComponent(id)))}" target="_blank" ` +
            `rel="noopener">${esc(id.toUpperCase?.() === id ? id : id)}</a>`
        : esc(id);
    return `${esc(x.source || '')} ${ids.slice(0, 4).map(link).join(', ')}${
      ids.length > 4
        ? ` <details ` +
          `class="sp-more"><summary>+${ids.length - 4}</summary>${ids.slice(4).map(link).join(', ')}</details>`
        : ''
    }`;
  }
  function methodCell(x) {
    const fam = new Map();
    x.methods.forEach((m) => {
      const [f, res] = String(m).split(/,\s*(?=[\d.]+\s*Å)/);
      if (!fam.has(f)) fam.set(f, []);
      if (res) fam.get(f).push(parseFloat(res));
    });
    return [...fam.entries()]
      .map(
        ([f, rs]) =>
          esc(f) +
          (rs.length
            ? ` <span class="muted">${
                rs.length > 1 ? Math.min(...rs).toFixed(1) + '–' + Math.max(...rs).toFixed(1) : rs[0].toFixed(1)
              } Å</span>`
            : '')
      )
      .join('; ');
  }
  const stateCell = (x) =>
    `<span class="sp-state" title="${esc(x.state_detail || '')}">${esc(
      (RC.states || {})[x.state] ?? x.state ?? ''
    )}</span>${
      x.other_marks
        ? ` <span class="sp-marks" ` +
          `title="Other modifications of the protein in the experiment">+ ${esc(x.other_marks)}</span>`
        : ''
    }`;
  const papersCell = (x) => {
    const ps = [...x.papers.values()];
    return ps.length
      ? ps.slice(0, 2).map(paperA).join('<br>') +
          (ps.length > 2
            ? `<details ` +
              `class="sp-more"><summary>+${ps.length - 2} more</summary>${ps.slice(2).map(paperA).join('<br>')}</details>`
            : '')
      : '<span class="muted">–</span>';
  };
  // a record's partner, once whatever the number of records, IDs or papers behind it: the one count of "partners"
  const partnerKey = (r) =>
    r.partner_kind === 'self'
      ? 'self'
      : [r.partner_kind || '', r.partner_accession || r.partner || r.partner_name || '', r.species || ''].join('|');
  const nPartners = (rs) => new Set(rs.map(partnerKey)).size;
  const nPartnersTxt = (k) => `${int(k)} partner${k === 1 ? '' : 's'}`;
  function recordsSummary(c, rs) {
    const n = new Map(),
      papers = new Set(),
      quiet = new Set(RC.not_papers || []);
    rs.forEach((r) => {
      const roll = rollOf(r.group),
        k = roll ? roll.label : r.group;
      if (!n.has(k))
        n.set(k, {
          label: roll ? roll.label : grpLabel(r.group),
          at: grpOrder(roll ? roll.groups[0] : r.group),
          who: new Set(),
        });
      n.get(k).who.add(partnerKey(r));
      if (!quiet.has(r.group) && paperKey(r)) papers.add(paperKey(r));
    });
    const all = nPartners(rs);
    return (
      `${int(all)} partner${all === 1 ? '' : 's'}, ${int(papers.size)} paper${papers.size === 1 ? '' : 's'}: ` +
      [...n.values()]
        .sort((a, b) => a.at - b.at)
        .map((x) => `${x.label.replace(/^[A-Z](?=[a-z])/, (ch) => ch.toLowerCase())} ${int(x.who.size)}`)
        .join(' · ')
    );
  }
  // the fold id of a group's table in the card's records block (an `open=` in an address opens it)
  const recFold = (g) => 'sc-rec-' + g;
  // the partners of some groups, once each, in group order: the one place a line of names is gathered from the records
  const groupPartners = (by, groups) => {
    const xs = new Map();
    for (const g of groups || []) for (const [k, x] of by.get(g) || []) xs.set(k, x);
    return xs;
  };
  // the groups a role names in the records summary (role: writer, eraser or reader in website.protein.card.records.summary)
  const roleGroups = (role) => (RC.summary || []).filter((s) => s.role === role).flatMap((s) => s.groups || []);
  const SUMMARY_MAX = 6; // names a group shows in the one-line summary and the Writer block before "+N more"
  // One line of what the records at a site say, with who: "Writes: ENZ1, ENZ2 · erases: JMJD4 · binds methylated:
  // KDM4A · +12 more", and a link to the site card with its records open. The groups it names come from
  // card.records.summary: [{label, groups: [codes]}]; every other protein partner is counted in "+N more".
  // K.card.summary(acc, pos, 'records', { tb, label, isListed }); '' where the site has no such records.
  function summary(acc, pos, kind, o = {}) {
    if (kind !== 'records' || !has(RC.table)) return '';
    const tb = o.tb || K.prot?.tables?.(acc);
    if (!tb) return '';
    const label = o.label || K.prot?.siteLabel?.(acc, pos) || '',
      by = partnerGroups(at(tb, RC.table, pos)),
      isListed = o.isListed || K.prot?.isListed,
      shown = new Set(),
      parts = [];
    for (const s of RC.summary || []) {
      const xs = groupPartners(by, s.groups);
      xs.forEach((_x, k) => shown.add(k));
      if (xs.size)
        parts.push(
          `${esc(parts.length ? s.label : cap(s.label))}: ${namesHtml([...xs.values()], SUMMARY_MAX, isListed)}`
        );
    }
    const rest = new Map();
    for (const g of by.values()) for (const [k, x] of g) if (!shown.has(k)) rest.set(k, x);
    const href = K.link('protein', `${acc}/${label}`, { open: [...by.keys()].map(recFold).join(',') });
    const lnk = (t) => `<a href="${esc(href)}" title="Open the site card of ${esc(label)} at its records">${t}</a>`;
    // a site none of the named groups has a partner at: the other partners are named instead, so the line is never bare
    const bare = !parts.length && rest.size > 0;
    if (bare) parts.push(`Binding proteins: ${namesHtml([...rest.values()], SUMMARY_MAX, isListed)}`);
    const more =
      !bare && rest.size
        ? lnk(`+${int(rest.size)} more protein${rest.size === 1 ? '' : 's'}`)
        : parts.length
          ? lnk('records')
          : '';
    return [...parts, more].filter(Boolean).join(' · ');
  }
  function recordsBlock(c) {
    if (!has(RC.table)) return '';
    const rs = at(c.tb, RC.table, c.pos);
    const body = !rs.length
      ? `<p class="muted small">No interaction record at ${esc(c.label)}.</p>`
      : `<p class="sp-sum">${esc(recordsSummary(c, rs))} <button ` +
        `class="linkish small" type="button" data-rec-tsv="${c.pos}">${esc(K.exp.label('tsv'))}</button></p>` +
        recordGroups(c, rs)
          .map(([g, m], _k, all) => {
            const roll = rollOf(g),
              first = roll && all.find(([x]) => roll.groups.includes(x))[0] === g,
              rollWho = roll ? nPartners(rs.filter((r) => roll.groups.includes(r.group))) : 0;
            const xs = [...m.values()],
              who = new Set(xs.map(partnerKey)),
              span = RC.span?.group === g;
            const row = (x) =>
              `<tr><td data-label="Partner">${partnerHtml(x, c)}</td><td data-label="Evidence">${sourceCell(x, c)}</td><td ` +
              `data-label="Method">${methodCell(x)}</td><td data-label="Site in it">${stateCell(x)}</td><td ` +
              `data-label="Paper">${papersCell(x)}</td></tr>`;
            return (
              (first
                ? `<h5 class="sp-roll">${esc(cap(roll.label))} <span class="muted small">${nPartnersTxt(rollWho)}</span></h5>`
                : '') +
              `<details class="sp-group" id="${esc(recFold(g))}"${
                !span && ((RC.open || []).includes(g) || all.length === 1) ? ' open' : ''
              }><summary><b>${esc(cap(span ? (RC.span.label || '').replace('{site}', c.label) : grpLabel(g)))}</b> <span ` +
              `class="muted small">${nPartnersTxt(who.size)}${
                (RC.help || {})[g] ? ' — ' + esc(RC.help[g]) : ''
              }</span></summary>` +
              (`<div class="tbl-card"><table class="tbl compact sp-tbl stackable"><thead><tr><th>Partner</th><th>` +
                `Evidence</th><th>Method</th><th>Site in it</th><th>Paper</th></tr></thead><tbody>${xs.slice(0, 8).map(row).join('')}</tbody>`) +
              (xs.length > 8 ? `<tbody class="sp-rest" hidden>${xs.slice(8).map(row).join('')}</tbody>` : '') +
              '</table></div>' +
              (xs.length > 8
                ? `<button class="linkish small" type="button" data-sp-all>Show all ${int(xs.length)} rows</button>`
                : '') +
              '</details>'
            );
          })
          .join('');
    return `<section class="sc-sp"><h4>${esc(RC.title || 'Records at the site')}</h4>${body}</section>`;
  }
  function recordsTsv(c) {
    const rs = at(c.tb, RC.table, c.pos),
      cols = TH[RC.table].columns.filter((x) => x !== 'position');
    return (
      K.preamble(`interaction records at ${c.gene} ${c.label}`, `every record at the site, one row each`) +
      ['site', ...cols].join('\t') +
      '\n' +
      rs
        .map((r) => [`${c.gene} ${c.label}`, ...cols.map((k) => String(r[k] ?? '').replace(/[\t\n]/g, ' '))].join('\t'))
        .join('\n') +
      '\n'
    );
  }

  // a protein's records at all its marks, site first: what the records at each site say and with whom (the protein page's Interactions view)
  function proteinRecords(p, tb, siteLabel, isListed) {
    if (!has(RC.table)) return null;
    const rs = rows(tb, RC.table).filter((r) => isProteinRec(r) || r.partner_kind === 'self');
    const bySite = new Map(),
      papers = new Map();
    for (const r of rs) {
      if (!bySite.has(r.position)) bySite.set(r.position, []);
      bySite.get(r.position).push(r);
      if (paperKey(r)) {
        if (!papers.has(r.position)) papers.set(r.position, new Map());
        const g = papers.get(r.position);
        if (!g.has(r.group)) g.set(r.group, new Set());
        g.get(r.group).add(paperKey(r));
      }
    }
    const sites = [...bySite.keys()].sort((a, b) => a - b);
    const row = (pos) => {
      const g = partnerGroups(bySite.get(pos), { self: true }),
        pp = new Set([...(papers.get(pos) || new Map()).values()].flatMap((x) => [...x]));
      return (
        `<tr><td data-label="Site"><button type="button" class="linkish mono" data-site-open="${pos}">${esc(siteLabel(pos))}</button>` +
        `</td><td data-label="What the records show">` +
        [...g.entries()]
          .sort((a, b) => grpOrder(a[0]) - grpOrder(b[0]))
          .map(
            ([k, xs]) =>
              `<span class="pw-g"><span class="muted">${esc(cap(grpLabel(k)))}</span> ${namesHtml([...xs.values()], SUMMARY_MAX, isListed)}</span>`
          )
          .join('') +
        `</td><td data-label="Papers" class="num">${pp.size ? int(pp.size) : '<span class="muted">–</span>'}</td></tr>`
      );
    };
    return { n: sites.length, rows: sites.map(row) };
  }

  // ---- writer and reader --------------------------------------------------------------------------------------------
  const WR = C.writer || {};
  function writerBlock(c) {
    if (!WR.who && !WR.suggest && !WR.partners) return '';
    const dl = (dt, dd) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`;
    const lines = [];
    if (has(RC.table)) {
      const by = partnerGroups(at(c.tb, RC.table, c.pos));
      const inCard = new Set([...roleGroups('writer'), ...roleGroups('eraser'), ...roleGroups('reader')]);
      for (const w of WR.who || []) {
        // the writers and binders are the card's summary lines; this block keeps the rest
        if ((w.groups || []).length && w.groups.every((g) => inCard.has(g))) continue;
        const xs = groupPartners(by, w.groups);
        if (xs.size || w.none)
          lines.push(
            dl(
              esc(w.label),
              xs.size
                ? namesHtml([...xs.values()], SUMMARY_MAX, c.isListed)
                : `<span class="muted">${esc(w.none)}</span>`
            )
          );
      }
    }
    if (WR.suggest) {
      const sg = WR.suggest,
        hits = (sg.rules || []).filter(
          (r) => SPECS[r.attribute] && attrVals(c, r.attribute).some((v) => (r.has || []).includes(v))
        );
      const drop = new Set(hits.map((r) => r.replaces).filter(Boolean)),
        who = [...new Set(hits.map((r) => r.suggests))].filter((x) => !drop.has(x));
      const refs = (sg.sources || []).map(sourceLink).join('; ');
      if (who.length)
        lines.push(
          dl(
            esc(sg.label || 'Suggested'),
            `<b>${esc(who.join(' and '))}</b> <span ` +
              `class="muted">(indirect; ${esc(hits.map((r) => r.because).join('; '))}${refs ? `, ${refs}` : ''})</span>`
          )
        );
    }
    if (WR.partners && has(WR.partners.table)) {
      const ps = rows(c.tb, WR.partners.table);
      for (const [cls, lab] of Object.entries(WR.partners.classes || {})) {
        const hit = ps.filter((r) => list(r.classes).includes(cls)).sort((a, b) => b.score - a.score);
        lines.push(
          dl(
            esc(ctxWords(lab, c)),
            (hit.length
              ? hit
                  .slice(0, 8)
                  .map((r) => {
                    return protRef(r.partner_accession, r.partner || r.partner_accession, {
                      listed: !!c.isListed?.(r.partner_accession),
                      title: `score ${r.score}`,
                    });
                  })
                  .join(', ') + (hit.length > 8 ? ` +${hit.length - 8}` : '')
              : `<span class="muted">${esc(WR.partners.none || 'none')}</span>`) +
              (WR.partners.note ? ` <span class="muted ` + `small">${esc(WR.partners.note)}</span>` : '')
          )
        );
      }
    }
    if (!lines.length) return '';
    return `<section class="sc-wr"><h4>${esc(WR.title || 'Writer and reader')}</h4>${
      lines.length ? `<dl class="sc-kv">${lines.join('')}</dl>` : ''
    }${
      WR.note
        ? `<details ` + `class="sc-note"><summary>Key</summary><p class="muted small">${esc(WR.note)}</p></details>`
        : ''
    }</section>`;
  }

  // ---- the card's summary: one line per item, directly under the site header ---------------------------------------------
  // Writers: the enzymes UniProt names in a modified residue's text ("Phosphothreonine; by IKKE, PDPK1 and TBK1"): the part
  // after "by" in its own ";" segment, split at commas, "and", "or" and "/". Not enzymes: "autocatalysis", "host".
  function uniWriters(desc) {
    const out = [];
    for (const seg of String(desc || '').split(/;\s*/)) {
      const m = /^by\s+(.+)$/i.exec(seg.trim());
      if (!m) continue;
      for (const n of m[1].split(/\s*,\s*|\s+(?:and|or)\s+|\s*\/\s*/)) {
        const t = n.replace(/\s*\(.*?\)\s*$/, '').trim();
        if (t && !/^(autocatalysis|host|similarity)$/i.test(t) && !out.includes(t)) out.push(t);
      }
    }
    return out;
  }
  // c: the card's context; o: { uni: UniProt features at the site, near: the marks-nearby html (the attribute's own) }
  // Each line has content or is left out; each label links to the section that holds the facts.
  // The summary's items by key (writer, readers, variants, conservation, near), each [label html, value html]; the
  // card draws them as lines and the protein page's site table takes its cells from the same items.
  function summaryItems(c, o = {}) {
    const href = (open) => K.link('protein', `${c.acc}/${c.label}`, open ? { open } : {}),
      lab = (t, open, tip) =>
        `<a href="${esc(href(open))}" title="${esc(tip || 'Open the section behind this line')}">${esc(t)}</a>`,
      lines = [];
    const by = has(RC.table) ? partnerGroups(at(c.tb, RC.table, c.pos)) : new Map();
    const open = (groups) => groups.filter((g) => by.has(g)).map(recFold);
    // 1. writers: the records' writer groups, then UniProt's "by X, Y and Z"
    const wg = roleGroups('writer'),
      wx = groupPartners(by, wg),
      seen = new Set([...wx.values()].map((x) => String(x.acc || x.name).toUpperCase()));
    const uni = [];
    for (const f of o.uni || [])
      for (const n of uniWriters(f.description)) {
        const acc = accByName(n),
          key = String(acc || n).toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        uni.push(protRef(acc, n, { listed: !!(acc && c.isListed?.(acc)), byName: true }));
      }
    if (wx.size || uni.length) {
      const wxs = [...wx.values()],
        folded = !!uni.length && !!wxs.length && wxs.every((x) => x.species), // UniProt names human writers: the other species only fold
        recs = !wxs.length
          ? ''
          : folded
            ? `<details class="sp-more muted"><summary>+${int(wxs.length)} in other species ▸</summary>${namesHtml(wxs, wxs.length, c.isListed)}</details>`
            : namesBySpecies(wxs, SUMMARY_MAX, c.isListed, href(open(wg).join(',')), 'writer').html,
        uniHtml = uni.length ? `${uni.join(', ')} <span class="muted">(UniProt)</span>` : '';
      lines.writer = [
        lab(RL.writer || 'Writer', wx.size ? open(wg).join(',') : 'sc-uniprot', 'Open the records, or UniProt'),
        folded ? `${uniHtml}\u00a0· ${recs}` : recs + (recs && uni.length ? '\u00a0· ' : '') + uniHtml,
      ];
      lines.push(lines.writer);
    }
    // 2. erasers: the records' eraser groups (demethylases)
    const eg = roleGroups('eraser'),
      ex = groupPartners(by, eg);
    if (ex.size)
      lines.push([
        lab(RL.eraser || 'Eraser', open(eg).join(','), 'Open the records table'),
        namesBySpecies([...ex.values()], SUMMARY_MAX, c.isListed, href(open(eg).join(',')), 'eraser').html,
      ]);
    // 3. readers and binders: a count and the first three names, "+N more" opens the table
    // residue-specific binding leads: the roll's own words ("Binds it methylated"), the first structure beside each name
    const rg = roleGroups('reader'),
      rx = groupPartners(by, rg);
    if (rx.size) {
      const r = namesBySpecies(
          [...rx.values()].map((x) => ({ ...x, showPdb: true })),
          3,
          c.isListed,
          href(open(rg).join(',')),
          'binder'
        ),
        roll = rollOf(rg[0]);
      lines.push([
        lab(roll ? cap(roll.label) : 'Binding proteins', open(rg).join(','), 'Open the records table'),
        r.n ? `${int(r.n)}: ${r.html}` : r.html,
      ]);
    }
    // (the structure-contact line, "RNA contact: PDB 5FWE, 3.1 Å", goes here: after the binding proteins, before variants)
    // 4. variants: the variant counter's own line
    const vc = K.card.vc;
    if ((vc.entries.length && vc.siteVariants(c.tb, c.pos).some((x) => x.n)) || vc.hasChanges(c.tb, c.pos))
      lines.push(
        (lines.variants = [
          'Variants',
          vc.line(c.tb, c.acc, c.pos, true).replace(/^<a /, '<a title="Open the variants" '),
        ])
      );
    // 5. conservation: from the module's own lookup, once it has arrived
    const cv = K.conserve?.siteLine?.(c.acc, c.pos);
    if (cv)
      lines.push((lines.conservation = [lab('Conservation', 'p-cons', 'Open the conservation section'), esc(cv)]));
    // 6. marks nearby: the attribute's own text
    if (o.near) lines.push(['Other modifications nearby', o.near]);
    return lines;
  }
  function cardSummary(c, o = {}) {
    const lines = summaryItems(c, o);
    if (!lines.length) return '';
    return (
      `<section class="sc-sum" aria-label="Summary"><dl class="sc-kv">` +
      lines.map(([t, d]) => `<div><dt>${/^<a /.test(t) ? t : esc(t)}</dt><dd>${d}</dd></div>`).join('') +
      '</dl></section>'
    );
  }

  // ---- source records (the Evidence row) -----------------------------------------------------------------------------
  const SR = C.sources || {};
  function pepHtml(pep, c) {
    if (!pep) return '<span class="muted">–</span>';
    const res = [];
    for (let k = 0; k < pep.length; k++) {
      const ch = pep[k];
      if (ch === '(' || ch === '[') {
        const close = ch === '(' ? ')' : ']',
          e = pep.indexOf(close, k);
        if (res.length) res[res.length - 1].mod = pep.slice(k + 1, e < 0 ? pep.length : e);
        k = e < 0 ? pep.length : e;
      } else if (/[A-Za-z]/.test(ch)) res.push({ aa: ch.toUpperCase(), mod: '' });
    }
    // the site's residue, where the peptide lines up with the site's window without a mismatch
    let site = -1;
    const win = c.window || '',
      mid = Math.floor(win.length / 2),
      aa = win[mid];
    if (win) {
      const fits = [];
      res.forEach((r, k) => {
        if (r.aa !== aa) return;
        let n = 0,
          bad = false;
        res.forEach((q, i) => {
          const w = win[mid - k + i];
          if (w && w !== '_') {
            if (w === q.aa) n++;
            else bad = true;
          }
        });
        if (!bad && n >= Math.min(res.length, 6)) fits.push(k);
      });
      const marked = fits.filter((k) => res[k].mod);
      site = fits.length === 1 ? fits[0] : marked.length === 1 ? marked[0] : -1;
    }
    return `<span class="pep-seq">${res
      .map((r, k) => {
        const t = r.mod
          ? `<b class="pep-me" title="${esc(
              r.aa + '(' + r.mod + ') in the source'
            )}">${esc(r.aa)}<sup>${esc(r.mod)}</sup></b>`
          : esc(r.aa);
        return k === site ? `<span class="c" ` + `title="This site">${t}</span>` : t;
      })
      .join('')}</span>`;
  }
  function sourcesBlock(c) {
    if (!has(SR.table)) return '';
    const rs = at(c.tb, SR.table, c.pos);
    if (!rs.length) return '';
    const showState = rs.some((r) => r.state),
      checks = SR.checks || {},
      warn = new Set(SR.warn || []);
    const body = rs
      .map((r) => {
        const st = SR.attribute ? vLabel(SR.attribute, r.source) : r.source,
          lk = lookupRow(r.source);
        const name = r.doi || lk?.doi ? doiA(r.doi || lk.doi, esc(st)) : esc(st);
        const via = [
          (SR.tables || {})[r.source_table] || '',
          r.pubmed ? 'PubMed ' + K.papers.links(K.papers.ids(r.pubmed)) : '',
        ].filter(Boolean);
        const acc0 = r.reported_accession || '',
          pos0 = r.reported_position === '' || r.reported_position == null ? null : +r.reported_position;
        const moved = (acc0 && acc0 !== c.acc) || (pos0 != null && pos0 !== c.pos);
        const ok = !warn.has(r.check),
          chk = checks[r.check] || String(r.check || '').replace(/_/g, ' ');
        return (
          `<tr><td data-label="Source"><b>${name}</b>${
            via.length
              ? `<span class="src-via">${via.map((v) => (v.startsWith('PubMed') ? v : esc(v))).join(' · ')}</span>`
              : ''
          }${r.reference && !lk ? `<span class="src-via">${esc(r.reference)}</span>` : ''}</td>` +
          `<td data-label="Peptide" class="pep">${pepHtml(r.peptide, c)}${
            r.enzyme ? `<span class="src-via">Enzyme: ${esc(r.enzyme)}</span>` : ''
          }${
            r.sample || r.detail
              ? `<span class="src-via">${esc([r.sample, r.detail].filter(Boolean).join(' · '))}</span>`
              : ''
          }</td>` +
          (showState
            ? `<td data-label="State">${r.state ? esc(r.state) : '<span class="muted">not given</span>'}</td>`
            : '') +
          `<td data-label="Reported as"><span class="mono">${esc(acc0)}${
            pos0 != null ? ' ' + esc((c.seq || '')[c.pos - 1] || '') + pos0 : ''
          }</span>${moved ? ` → <b>${esc(c.label)}</b>` : ''}${
            chk ? `<span class="src-map ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '⚠'} ${esc(chk)}</span>` : ''
          }</td></tr>`
        );
      })
      .join('');
    const notices = [...new Set(rs.map((r) => (C.cite?.notices || {})[r.source]).filter(Boolean))];
    return (
      `<p><b>Source records</b> (${int(rs.length)}) </p>` +
      (`<div class="tbl-card"><table class="src-tbl tbl compact stackable"><thead><tr><th>Source</th><th>` +
        `Peptide</th>${showState ? '<th>State</th>' : ''}<th>Reported as</th></tr></thead><tbody>${body}</tbody></table>` +
        `</div>`) +
      notices.map((n) => `<p class="note">${esc(n)}</p>`).join('')
    );
  }
  function siteTables(c) {
    return (C.tables || [])
      .filter((x) => has(x.table))
      .map((x) => {
        const rs = at(c.tb, x.table, c.pos);
        if (!rs.length) return '';
        const cell = (col, r) => {
          const v = r[col.column];
          if (col.words === 'calls')
            return `${(CL.marks || {})[v] ? `<b class="trend c-${esc(v)}">${esc(CL.marks[v])}</b> ` : ''}${esc(
              (CL.words || {})[v] || String(v || '–').replace(/_/g, ' ')
            )}`;
          return (
            (col.format ? num(v, col.format) : esc(v)) +
            (col.with ? ` <span class="muted">(${col.with.map((w) => esc(r[w] || 0)).join('/')})</span>` : '')
          );
        };
        return (
          `<p><b>${esc(x.title || x.table)}</b>${x.source ? ` (${sourceLink(x.source)})` : ''}${
            x.note ? ` <span class="muted ` + `small">${esc(x.note)}</span>` : ''
          }</p><div class="tbl-card"><table class="tbl compact"><thead><tr>${(x.columns || [])
            .map((col) => `<th${col.format ? ' class="num"' : ''}>${esc(col.label || col.column)}</th>`)
            .join('')}</tr></thead>` +
          `<tbody>` +
          rs
            .map(
              (r) =>
                `<tr>${(x.columns || [])
                  .map((col) => `<td${col.format ? ' class="num"' : ''}>${cell(col, r)}</td>`)
                  .join('')}</tr>`
            )
            .join('') +
          '</tbody></table></div>'
        );
      })
      .join('');
  }
  // the Evidence row: the measurements, the site's tables, the window ±15 and every source record
  function evidenceRow(c) {
    const out =
      siteTables(c) +
      callsTable(c) +
      (c.window31 ? `<p><b>Window ±15:</b> <span class="mono win">${esc(c.window31)}</span></p>` : '') +
      sourcesBlock(c);
    return out || '<p class="muted">No further evidence.</p>';
  }

  // ---- how to cite a protein's sites -------------------------------------------------------------------------------
  const CT = C.cite || {};
  function citeRefs(marks, attrOf) {
    const n = new Map();
    marks.forEach((m) =>
      list(
        String(attrOf(m, CT.attribute)).replace(
          new RegExp((SPECS[CT.attribute]?.separator || '; ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          ';'
        )
      ).forEach((v) => n.set(v, (n.get(v) || 0) + 1))
    );
    const linkOf = SPECS[CT.attribute]?.link
      ? D.attribute_links?.[CT.attribute] || K.sel?.meta()?.attribute_links?.[CT.attribute] || {}
      : {};
    return [...n.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, k]) => {
        const r = lookupRow(v) || {};
        return {
          key: v,
          n: k,
          text: r.citation || vLabel(CT.attribute, v),
          doi: r.doi || linkOf[v] || '',
          licence: r.licence || '',
        };
      });
  }
  const refText = (r) => r.text + (r.doi ? ' doi:' + r.doi : '');
  function citeBox(what, marks, attrOf, open) {
    if (!CT.attribute || !SPECS[CT.attribute] || !marks.length) return '';
    const refs = citeRefs(marks, attrOf),
      pref = K.CIT?.preferred;
    const text = [
      pref ? `Compilation: ${pref.text}${pref.doi ? ' doi:' + pref.doi : ''}` : '',
      '',
      `${SPECS[CT.attribute].label} that reported ${what}:`,
      ...refs.map((r) => `- ${refText(r)} [${r.n} ${r.n === 1 ? W.mark : W.marks}]`),
    ]
      .join('\n')
      .trim();
    const notices = [...new Set(refs.map((r) => (CT.notices || {})[r.key]).filter(Boolean))];
    const ris = [...(pref ? [[pref.text, pref.doi || '']] : []), ...refs.map((r) => [r.text, r.doi])];
    return (
      `<details class="cite-box"${open ? ' open' : ''}><summary>How to cite ${esc(what)}</summary>` +
      (`<p class="small">Please cite the original ${esc(
        SPECS[CT.attribute].label.toLowerCase()
      )} that reported the ${esc(W.marks)} you use${
        pref
          ? `, and ${esc(pref.short || pref.text)} (${doiA(pref.doi, 'doi:' + esc(pref.doi))}) for the ` +
            `compilation and this site`
          : ''
      }. Full list: <a href="${esc(K.link('method', 'cite'))}">How to cite</a>` +
        `</p>`) +
      `<h4>Reported by</h4><ol class="cite-list">${refs
        .map(
          (r) =>
            `<li>${esc(r.text)}${r.doi ? ' ' + doiA(r.doi, 'doi:' + esc(r.doi)) : ''} <span class="muted">` +
            `· ${int(r.n)} ${esc(r.n === 1 ? W.mark : W.marks)}</span></li>`
        )
        .join('')}</ol>` +
      notices.map((x) => `<p class="note">${esc(x)}</p>`).join('') +
      (`<p class="screen-only"><button class="btn small" type="button" data-copy-text="${esc(text)}">Copy references</button>` +
        ` <button class="btn small" type="button" data-ris="${esc(JSON.stringify(ris))}" data-ris-name="${esc(
          D.site.id +
            '_references_' +
            what
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_|_$/g, '')
              .slice(0, 40)
        )}">Download ` +
        `citations (RIS)</button></p></details>`)
    );
  }
  // a site's sources, with an RIS button and a sentence on what to cite
  function reportedBy(c) {
    if (!CT.attribute || !SPECS[CT.attribute]) return '';
    const vals = attrVals(c, CT.attribute);
    if (!vals.length) return '';
    const refs = vals.map((v) => {
      const r = lookupRow(v) || {};
      return [r.citation || vLabel(CT.attribute, v), r.doi || ''];
    });
    const pref = K.CIT?.preferred;
    return (
      `<button type="button" class="btn small" data-ris="${esc(JSON.stringify(refs))}" data-ris-name="${esc(`${c.gene}_${c.label}_references`)}" title="These ` +
      `references as an RIS file, for EndNote, Zotero, Mendeley or Papers">RIS</button>` +
      `<ul class="sc-refs">${vals
        .map((v) => {
          const r = lookupRow(v);
          return `<li>${r?.doi ? doiA(r.doi, esc(vLabel(CT.attribute, v))) : c.attrHtml(CT.attribute, v)}</li>`;
        })
        .join('')}</ul>` +
      (pref ? `<p class="muted small">Cite: sources above; compilation: ${esc(pref.short || pref.text)}</p>` : '')
    );
  }
  // references as an RIS file: each DOI's record from doi.org, else one from the text shown
  async function downloadRis(refs, name, btn) {
    const seen = new Set(),
      todo = refs.filter(([t, d]) => {
        const k = String(d || t).toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    const one = async ([text, doi]) => {
      for (let k = 0; doi && k < 2; k++) {
        try {
          const r = await fetch('https://doi.org/' + encodeURI(doi), {
            headers: { Accept: 'application/x-research-info-systems' },
          });
          if (r.ok) {
            const t = (await r.text()).replace(/\r\n/g, '\n').trim();
            if (/^TY {2}-/.test(t)) return t;
          }
        } catch (e) {
          /* tried again */
        }
        await new Promise((ok) => setTimeout(ok, 600));
      }
      return [
        'TY  - ' + (doi ? 'JOUR' : 'GEN'),
        'TI  - ' + text,
        doi ? 'DO  - ' + doi : '',
        doi ? 'UR  - https://doi.org/' + doi : '',
        'ER  - ',
      ]
        .filter(Boolean)
        .join('\n');
    };
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = `Fetching ${todo.length}…`;
    try {
      const out = new Array(todo.length);
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, todo.length) }, async () => {
          while (next < todo.length) {
            const k = next++;
            out[k] = await one(todo[k]);
          }
        })
      );
      K.download(name + '.ris', out.join('\n\n') + '\n', 'application/x-research-info-systems');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // ---- what a light page (a protein without marks) shows of the rows naming it ---------------------------------------
  function asPartner(x, gene, siteName) {
    const out = [];
    if (has(RC.table) && x.tables?.[RC.table]) {
      const cols = TH[RC.table].columns,
        rs = x.tables[RC.table]
          .map(([acc, ...r]) => ({
            acc: str(x._s, acc),
            ...Object.fromEntries(cols.map((c, i) => [c, NUMS.has(c) ? r[i] : str(x._s, r[i])])),
          }))
          .filter((r) => r.partner_kind !== 'self');
      if (rs.length) {
        const by = new Map();
        rs.forEach((r) => {
          const k = r.acc + ':' + r.position + '|' + r.group;
          if (!by.has(k)) by.set(k, { ...r, ids: new Set(), papers: new Map() });
          const g = by.get(k);
          if (r.id) g.ids.add(r.id);
          if (paperKey(r)) g.papers.set(paperKey(r), r);
        });
        const xs = [...by.values()].sort((a, b) => grpOrder(a.group) - grpOrder(b.group));
        out.push(
          `<section class="pfold-like"><h3>At other proteins’ ${esc(W.marks)}</h3><div class="tbl-card">` +
            `<table class="tbl compact stackable"><thead><tr><th>${esc(cap(W.mark))}</th><th>What the record ` +
            `shows</th><th>Evidence</th><th>Paper</th></tr></thead><tbody>` +
            xs
              .slice(0, 60)
              .map(
                (r) =>
                  `<tr><td data-label="${esc(cap(W.mark))}"><a href="${esc(
                    K.link('protein', r.acc + '/' + r.position)
                  )}"><b>${esc(siteName(r.acc, r.position))}</b></a></td>` +
                  `<td data-label="Shows">${esc(cap(grpLabel(r.group)))}${
                    r.state ? ` <span class="sp-state">${esc((RC.states || {})[r.state] ?? r.state)}</span>` : ''
                  }</td>` +
                  `<td data-label="Evidence">${esc(r.source || '')} ${[...r.ids]
                    .slice(0, 3)
                    .map((id) => {
                      const u = (RC.urls || {})[r.source];
                      return u
                        ? `<a href="${esc(u.replace('{id}', encodeURIComponent(id)))}" target="_blank" ` +
                            `rel="noopener">${esc(id)}</a>`
                        : esc(id);
                    })
                    .join(', ')}${r.ids.size > 3 ? ` +${r.ids.size - 3}` : ''}</td>` +
                  `<td data-label="Paper">${
                    [...r.papers.values()].slice(0, 2).map(paperA).join('<br>') || '<span class="muted">–</span>'
                  }</td></tr>`
              )
              .join('') +
            '</tbody></table></div>' +
            (xs.length > 60 ? `<p class="muted small">The first 60 of ${int(xs.length)}.</p>` : '') +
            '</section>'
        );
      }
    }
    return out.join('');
  }
  function partnersOf(x, tname) {
    if (!has(tname) || !x.tables?.[tname]) return [];
    const cols = TH[tname].columns;
    return x.tables[tname]
      .map(([acc, ...r]) => ({
        acc: str(x._s, acc),
        ...Object.fromEntries(cols.map((c, i) => [c, NUMS.has(c) ? r[i] : str(x._s, r[i])])),
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ---- events -------------------------------------------------------------------------------------------------------
  K.clicks.push(
    [
      '[data-ris]',
      (el) => {
        try {
          downloadRis(JSON.parse(el.dataset.ris), el.dataset.risName || 'references', el);
        } catch (e) {
          /* malformed */
        }
      },
    ],
    [
      '[data-copy-text]',
      (el) => {
        const done = (t) => {
          const o = el.textContent;
          el.textContent = t;
          setTimeout(() => {
            el.textContent = o;
          }, 1500);
        };
        if (navigator.clipboard?.writeText)
          navigator.clipboard.writeText(el.dataset.copyText).then(
            () => done('Copied'),
            () => done('Copy failed')
          );
        else done('Copy failed');
      },
    ],
    [
      '[data-sp-all]',
      (el) => {
        const rest = el.closest('details')?.querySelector('.sp-rest');
        if (rest) {
          rest.hidden = !rest.hidden;
          el.textContent = rest.hidden
            ? el.textContent.replace(/^Show the first 8 rows$/, 'Show all rows')
            : 'Show the first 8 rows';
        }
      },
    ],
    [
      '[data-entry3d]',
      (el, e) => {
        if (typeof K.show3d === 'function') {
          e.preventDefault();
          K.show3d(el.dataset.acc, +el.dataset.pos, { entry: el.dataset.entry3d });
        } else window.open(el.href, '_blank', 'noopener');
      },
    ],
    [
      '[data-open-fold]',
      (el) => {
        const d = document.getElementById(el.dataset.openFold);
        if (d) {
          d.open = true;
          d.scrollIntoView({ block: 'start' });
        }
      },
    ]
  );
  K.card = {
    proteinRecords,
    protRef,
    summary,
    load,
    peek,
    loadDetail,
    loadDefault,
    defaultTb,
    compact: SDF,
    light,
    lightIndex,
    rows,
    at,
    has,
    badge,
    tags,
    entries,
    sequences,
    peptides,
    peptidesAt,
    peptideList,
    peptideHtml,
    peptideKinds: () => PK,
    peptideColumns: PP.columns || {},
    studyOf,
    studyHtml,
    dataHtml,
    contact: {
      best: contactBest,
      phrase: contactPhrase,
      word: contactWord,
      line: contactLine,
      clash: contactClash,
      clashWord: CLASH_WORD,
      clashTip: CLASH_TIP,
    },
    around,
    states,
    changes,
    vc: {
      entries: VCN,
      at: variantsAt,
      sum: variantSum,
      sums: variantSums,
      hot: isHot,
      showGene,
      hotCount,
      siteVariants,
      sites: variantSites,
      words: variantWords,
      text: variantText,
      line: variantLine,
      hasChanges: (tb, pos) => CCN.some((x) => changesAt(tb, x, pos).length),
      conditions: variantConditions,
      conditionsText,
      ready: detailReady,
      onDetail: (fn) => detailSubs.push(fn),
      avg: changeAvg,
      avgText,
      residueName,
      residueNames,
    },
    variants: variantCounts,
    cc: {
      entries: CCN,
      at: changesAt,
      showGene,
      total: changeTotal,
      avg: changeAvg,
      avgText,
      residueName,
      residueNames,
    },
    calls,
    callsKey,
    evidenceBlock,
    recordsBlock,
    recordsTsv,
    writerBlock,
    cardSummary,
    summaryItems,
    hasWriterRecords: () => has(RC.table) && roleGroups('writer').length > 0,
    uniWriters,
    evidenceRow,
    reportedBy,
    citeBox,
    asPartner,
    partnersOf,
    wholeProtein,
    aroundRows,
    windowsOf,
    callRows,
    num,
  };
});
