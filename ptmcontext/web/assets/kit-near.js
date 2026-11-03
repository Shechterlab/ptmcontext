/* Filters that read more than a mark's own classes, each a kind of filter key the Filters panel places where the site
   file's groups say (website.filters[].keys), so another page may offer them too:
     d:marks       another mark of the site within N residues (from the marks' positions)
     o:<table>     a residue of a residue_evidence table (another modification, a crosslinked residue) of some kind
                   within N residues: values <kind>@<N>, * for any kind (website.search.nearby; ptmc web writes each
                   mark's distance to the nearest of each kind)
     b:class       the protein has a partner of a class, a marked partner, or another (website.search.partners)
     b:gene        the protein has a named partner (a gene or accession)
     b:score       the partners counted: those scored at least this (the other two read it)
     m:at, m:near  the motif finder's box (kit-select.js reads its patterns: motif:GXRG, window:PRPR)
   The partners come from data/partners.json, read the first time a partner filter is used. Search keys stand for
   them (website.search: nearby.<table>.key, partners.key). A filter whose data the site lacks is absent. A module of
   the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, S, esc, int } = K;
  const SRCH = D.search || {}, NEAR = SRCH.nearby || {}, PT = SRCH.partners || null, PAT = SRCH.patterns || null;
  const SP = { within: [2, 3, 5, 10, 20], ...(SRCH.spacing || {}) };
  const sd = () => K.sel?.data();
  const setF = (key, vals) => { if (vals && vals.length) S.f[key] = vals; else delete S.f[key]; K.writeHash(true); K.render(); };
  const fctl = (label, help, body, extra = '') => `<div class="fctl"><p class="flabel" title="${esc(help || '')}">${esc(label)}${extra}</p>${body}</div>`;

  // ---- d:marks: the distance from each mark to the nearest other mark of its protein --------------------------------
  let gap = null;
  const gapOf = m => {
    if (!gap) {
      const by = {}, s = sd(); gap = new Array(s.marks.length).fill(Infinity);
      s.marks.forEach((x, i) => (by[x[0]] ||= []).push([x[1], i]));
      Object.values(by).forEach(l => { l.sort((a, b) => a[0] - b[0]); l.forEach(([p, i], k) => { gap[i] = Math.min(k ? p - l[k - 1][0] : Infinity, k + 1 < l.length ? l[k + 1][0] - p : Infinity); }); });
    }
    return gap[m.ix];
  };
  const spacingLabel = SP.label || `Another ${W.mark} within`;
  const kinds = {
    d: {
      valid: id => id === 'marks',
      test: (id, vals) => { const n = Math.max(...vals.map(Number)); return m => gapOf(m) <= n; },
      label: () => spacingLabel, value: (id, v) => `${v} residues`,
      control: () => fctl(spacingLabel, SP.help || `Keeps the ${W.marks} with another ${W.mark} of the site (any study) within so many residues`,
        `<select data-fsel="d:marks"><option value="">Any spacing</option>${SP.within.map(v => `<option value="${v}"${S.f['d:marks']?.[0] === String(v) ? ' selected' : ''}>${v} residues</option>`).join('')}</select>`),
    },
  };

  // ---- o:<table>: a residue of a kind within N residues -------------------------------------------------------------
  // each kind's distances, by mark (the data list only the marks with one near: [mark, distance, ...])
  const dense = {};
  const nearOf = id => { const nb = sd()?.nearby?.[id]; if (!nb) return null;
    return (dense[id] ||= { kinds: nb.kinds, d: nb.d.map(l => { const a = new Int16Array(sd().marks.length).fill(-1); for (let k = 0; k < l.length; k += 2) a[l[k]] = l[k + 1]; return a; }) }); };
  const nearKind = (id, k) => (NEAR[id]?.kinds || {})[k] || k;
  const nearText = (id, v) => { const [k, n] = String(v).split('@'); return `${k === '*' ? 'any' : nearKind(id, k)}${+n ? ` within ${n}` : ' at the site'}`; };
  kinds.o = {
    valid: id => !!NEAR[id],
    test: (id, vals) => {
      const nb = nearOf(id); if (!nb) return () => false;
      const tests = vals.map(v => { const [k, n] = String(v).split('@'), ks = k === '*' ? nb.kinds.map((_, j) => j) : [nb.kinds.indexOf(k)].filter(j => j >= 0), lim = +n || 0;
        return m => ks.some(j => { const d = nb.d[j][m.ix]; return d >= 0 && d <= lim; }); });
      return m => tests.some(t => t(m));
    },
    label: id => NEAR[id]?.label || id, value: (id, v) => nearText(id, v),
    control: id => {
      const nb = nearOf(id), cfg = NEAR[id], cur = S.f['o:' + id]?.[0] || '', [ck, cn] = cur ? cur.split('@') : ['*', ''];
      const ks = nb ? nb.kinds : Object.keys(cfg.kinds || {}), within = cfg.within || [2, 5, 10, 20];
      return fctl(cfg.label, cfg.help, `<div class="fpair"><select data-near="${esc(id)}" data-part="kind" aria-label="${esc(cfg.label)}: which"><option value="*">Any kind</option>${ks.map(k => `<option value="${esc(k)}"${k === ck ? ' selected' : ''}>${esc(nearKind(id, k))}</option>`).join('')}</select>` +
        `<select data-near="${esc(id)}" data-part="n" aria-label="${esc(cfg.label)}: within"><option value="">Off</option>${within.map(n => `<option value="${n}"${String(n) === cn ? ' selected' : ''}>${+n ? `within ±${n}` : `at the ${esc(W.mark)}`}</option>`).join('')}</select></div>`);
    },
  };
  document.addEventListener('change', e => {
    const id = e.target.dataset?.near; if (id == null) return;
    const box = e.target.closest('.fpair'), k = box.querySelector('[data-part="kind"]').value, n = box.querySelector('[data-part="n"]').value;
    setF('o:' + id, n === '' ? [] : [`${k}@${n}`]);
  });

  // ---- b: the proteins' partners (data/partners.json, read when first needed) ----------------------------------------
  let PD = null, loading = null;
  const inlined = (() => { try { const el = document.getElementById('partners-data'); return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; } })();
  const loadPartners = () => (loading ||= (inlined ? Promise.resolve(inlined) : fetch('data/partners.json')).then(r => (r?.genes ? r : r?.ok ? r.json() : null)).then(d => { PD = d; if (d) { prepPartners(); K.sel.refresh(); } return d; }, () => null));
  let geneIdx = null, boundBy = null;
  function prepPartners() {
    geneIdx = {}; PD.genes.forEach((g, k) => { if (g) (geneIdx[g.toUpperCase()] ||= []).push(k); }); PD.accessions.forEach((a, k) => { (geneIdx[a.toUpperCase()] ||= []).push(k); });
  }
  const minScore = cons => { const v = cons?.find(([k]) => k === 'b:score')?.[1]?.[0]; return v == null ? 0 : Math.round(+v * 1000); };
  // the marked proteins each partner binds (at a score), for the hints and the suggestions
  const boundCount = t => { if (!PD) return null; if (boundBy?.t === t) return boundBy.n; const n = new Array(PD.genes.length).fill(0);
    Object.values(PD.rows).forEach(r => { for (let k = 0; k < r.length; k += 2) if (r[k + 1] >= t) n[r[k]]++; }); boundBy = { t, n }; return n; };
  const classOk = (k, c) => (c === 'marked' ? !!PD.marked[k] : c === 'other' ? !PD.marked[k] && !PD.bits[k] : PD.classes.includes(c) && !!(PD.bits[k] & (1 << PD.classes.indexOf(c))));
  const partnerTest = (pred, t) => m => { const r = PD.rows[m[0]]; if (!r) return false; for (let k = 0; k < r.length; k += 2) if (r[k + 1] >= t && pred(r[k])) return true; return false; };
  const classLabel = c => (c === 'marked' ? PT?.marked || `another ${W.marked} protein` : c === 'other' ? PT?.other || 'any other protein' : (PT?.classes || {})[c] || c);
  // a class the site file describes: its role, what it reads and its paper, as the chip's hover
  const classTip = c => { const i = (PT?.class_info || {})[c]; if (!i) return ''; const t = [i.role, i.reads && `reads ${i.reads}`, i.help, i.pmid && `PMID ${i.pmid}`].filter(Boolean).join('. '); return ` title="${esc(t)}"`; };
  if (PT) kinds.b = {
    valid: id => ['class', 'gene', 'score'].includes(id),
    test: (id, vals, cons) => {
      if (!PD) { loadPartners(); return () => false; }
      const t = minScore(cons);
      if (id === 'class') return partnerTest(k => vals.some(c => classOk(k, c)), t);
      if (id === 'gene') { const want = new Set(vals.flatMap(v => geneIdx[String(v).toUpperCase()] || [])); return partnerTest(k => want.has(k), t); }
      return (cons || []).some(([k]) => k === 'b:class' || k === 'b:gene') ? () => true : partnerTest(() => true, t);   // with another: applied there
    },
    label: id => (id === 'class' ? PT.label || 'Has a partner that is' : id === 'gene' ? PT.gene_label || 'Binds' : PT.score_label || 'Partner score'),
    value: (id, v) => (id === 'class' ? classLabel(v) : id === 'score' ? `≥ ${v}` : v),
    control: (id, ctx) => {
      const on = ctx.on;
      if (id === 'class') {
        const codes = [...Object.keys(PT.classes || {}), 'marked', 'other'];
        return fctl(PT.label || 'Has a partner that is', PT.help, `<div class="fchips">${codes.map(c => `<button type="button" class="fchip" data-f="b:class" data-v="${esc(c)}" aria-pressed="${on.has(c)}"${classTip(c)}>${esc(classLabel(c))}</button>`).join('')}</div>`, ' <span class="muted">(proteins; match any)</span>');
      }
      if (id === 'score') {
        const cur = S.f['b:score']?.[0] || '';
        return fctl(PT.score_label || 'Partner score', PT.help, `<select data-fsel="b:score"><option value="">Any</option>${(PT.scores || []).map(v => `<option value="${v}"${String(v) === cur ? ' selected' : ''}>≥ ${v}</option>`).join('')}</select>`);
      }
      const cur = [...on].join(', '), t = minScore(Object.entries(S.f).map(([k, v]) => [k, v])), n = boundCount(t);
      const hint = PD && on.size ? [...on].map(g => { const ks = geneIdx[String(g).toUpperCase()] || []; return ks.length ? `${esc(PD.genes[ks[0]] || g)} binds ${int(Math.max(...ks.map(k => n[k])))} ${esc(W.marked)} proteins${t ? ` at a score of ${t / 1000} or more` : ''}.` : `${esc(g)}: no partner of that name.`; }).join(' ') : '';
      return fctl(PT.gene_label || 'Binds a specific protein', PT.help, `<div class="fpair"><input type="text" list="b-genes" data-bgene value="${esc(cur)}" placeholder="${esc(PD && n ? `a gene, e.g. ${PD.genes.map((g, k) => [g, n[k]]).filter(x => x[0]).sort((a, b) => b[1] - a[1])[0]?.[0] || ''}` : 'a gene')}" aria-label="${esc(PT.gene_label || 'Binds a specific protein')}">` +
        `<button type="button" class="btn small" data-bgene-go>Apply</button></div>${PD && n ? `<datalist id="b-genes">${PD.genes.map((g, k) => [g, n[k]]).filter(x => x[0] && x[1]).sort((a, b) => b[1] - a[1]).slice(0, 400).map(([g, k]) => `<option value="${esc(g)}">${int(k)} ${esc(W.marked)} partners</option>`).join('')}</datalist>` : ''}${hint ? `<p class="fhint">${hint}</p>` : ''}`);
    },
  };
  const geneGo = el => { const box = el.closest('.fpair') || el.parentElement, v = box.querySelector('[data-bgene]').value; setF('b:gene', v.split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean)); };
  if (PT) {
    K.clicks.push(['[data-bgene-go]', el => geneGo(el)]);
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-bgene]')) { e.preventDefault(); geneGo(e.target); } });
    document.addEventListener('focusin', e => { if (e.target.matches?.('[data-bgene]') && !PD) loadPartners(); });
  }

  // ---- m:at, m:near: the motif finder's box, which writes a term in the search -----------------------------------------
  if (PAT) kinds.m = {
    control: id => {
      if (id !== 'at' && PAT.at) return '';             // one box serves both: the first key placed draws it
      const termKey = { at: PAT.at, near: PAT.near }, cur = (S.q.match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || []).find(t => { const k = t.split(':')[0].toLowerCase(); const r = (k === PAT.at || k === PAT.near) && K.sel.termFilter([k, t.slice(k.length + 1)]); return r && r[0]?.startsWith?.('m:'); });
      const where = cur && cur.split(':')[0].toLowerCase() === PAT.near ? 'near' : 'at', val = cur ? cur.slice(cur.indexOf(':') + 1) : '';
      const span = sd()?.wide?.span ?? PAT.span ?? 15;
      return fctl('Find a motif (2–10 residues)', PAT.help || '', `<div class="fpair"><input type="text" data-motif value="${esc(val)}" placeholder="e.g. GXRG, [RK]XR, PRPR" aria-label="A motif" spellcheck="false" autocomplete="off">` +
        `<select data-motif-where aria-label="Where">${Object.entries(termKey).filter(([, k]) => k).map(([w, k]) => `<option value="${esc(k)}"${w === where ? ' selected' : ''}>${w === 'at' ? `Covering the ${esc(W.mark)}` : `Anywhere within ±${span}`}</option>`).join('')}</select>` +
        `<button type="button" class="btn small" data-motif-go>Search</button></div><p class="fhint" data-motif-msg>X, . or * any residue; [ST] S or T; RGG,GAR either. Adds <span class="mono">${esc(PAT.at || PAT.near)}:</span> or <span class="mono">${esc(PAT.near || PAT.at)}:</span> to the search.</p>`);
    },
  };
  function motifGo(el) {
    const box = el.closest('.fctl'), raw = box.querySelector('[data-motif]').value.toUpperCase().replace(/\s+/g, ''), key = box.querySelector('[data-motif-where]').value;
    const bad = raw.split(',').filter(Boolean).map(K.sel.parsePattern).find(x => x.error), msg = box.querySelector('[data-motif-msg]');
    if (bad) { msg.innerHTML = `<span class="warn-text">${esc(bad.error)}</span>`; box.querySelector('[data-motif]').setAttribute('aria-invalid', 'true'); return; }
    // the box writes one pattern term, replacing the one it shows
    const toks = (S.q.match(/[a-z_][\w]*:"[^"]*"|\S+/gi) || []).filter(t => { const k = t.split(':')[0].toLowerCase(); if (k !== PAT.at && k !== PAT.near) return true; const r = K.sel.termFilter([k, t.slice(k.length + 1)]); return !(r && (r.error || r[0]?.startsWith?.('m:'))); });
    S.q = [...toks, ...(raw ? [`${key}:${raw}`] : [])].join(' '); K.writeHash(true); K.render();
  }
  if (PAT) {
    K.clicks.push(['[data-motif-go]', el => motifGo(el)]);
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-motif]')) { e.preventDefault(); motifGo(e.target); } });
  }
  K.filterKinds = { ...(K.filterKinds || {}), ...kinds };

  // ---- search keys that stand for these filters -----------------------------------------------------------------------
  K.searchTerms ||= {}; K.searchTermHelp ||= {}; K.searchTermValues ||= {};
  Object.entries(NEAR).forEach(([id, cfg]) => {
    const key = cfg.key || id, top = Math.max(...(cfg.within || [20]));
    // ptm:phospho (within the widest distance offered), ptm:phospho@5, ptm:5 (any kind)
    K.searchTerms[key] = vals => {
      const ks = Object.keys(cfg.kinds || {}), out = [];
      for (const v of vals) {
        const [a, b] = String(v).toLowerCase().split('@'), k = /^\d+$/.test(a) ? '*' : a, n = /^\d+$/.test(a) ? a : b ?? String(top);
        if (k !== '*' && !ks.includes(k)) return { error: `${key}:${v}: no kind ${k} (${ks.join(', ')}, or a distance such as ${key}:5)` };
        if (!/^\d+$/.test(n)) return { error: `${key}:${v}: a distance is a number of residues (${key}:${ks[0] || 'kind'}@5)` };
        out.push(`${k}@${n}`);
      }
      return ['o:' + id, out];
    };
    K.searchTermHelp[key] = { label: cfg.label, help: `${cfg.help || cfg.label}: ${key}:<kind> within ${top} residues, ${key}:<kind>@N within N, ${key}:N any kind` };
    K.searchTermValues[key] = () => Object.entries(cfg.kinds || {}).map(([k, l]) => [k, l]);
  });
  if (PT) {
    const key = PT.key || 'binds', codes = [...Object.keys(PT.classes || {}), 'marked', 'other'];
    K.searchTerms[key] = vals => {
      const low = vals.map(v => String(v).toLowerCase());
      if (low.every(v => codes.includes(v))) return ['b:class', low];
      if (low.some(v => codes.includes(v))) return { error: `${key}: name partner kinds (${codes.join(', ')}) or genes, not both in one term` };
      return ['b:gene', vals.map(v => String(v).toUpperCase())];
    };
    K.searchTermHelp[key] = { label: PT.label, help: `${PT.help || ''}: ${key}:${codes.join(', ')}, or a gene` };
    K.searchTermValues[key] = () => { const t = minScore(Object.entries(S.f)), n = boundCount(t); if (!PD) loadPartners();
      return [...codes.map(c => [c, classLabel(c)]), ...(PD && n ? PD.genes.map((g, k) => [g, n[k]]).filter(x => x[0] && x[1]).sort((a, b) => b[1] - a[1]).slice(0, 300).map(([g, k]) => [g, `${int(k)} ${W.marked} partners`]) : [])]; };
  }
});
