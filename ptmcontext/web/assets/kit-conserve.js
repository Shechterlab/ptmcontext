/* Conservation across species, and the selection's sequence logo.
     Conservation   on a protein's page: each mark aligned in the orthologs of the site file's species (Ensembl
                    Compara, live, for the Ensembl gene that UniProt's cross-references name), whether the residue is
                    still the marked one, against the protein's other residues of the profile's letters; a chip with
                    the share that are kept; SVG, PNG and TSV.
     Logo           on a selection's Overview ("Logo and comparison"): the selected marks' sequence windows aligned at
                    the mark, a WebLogo-style logo (information content with the small-sample correction of
                    Schneider et al. 1986, WebLogo's chemistry colors), the same for the other marks, and the residue
                    each position gains and loses; SVG, PNG and TSV. The windows are the motif finder's
                    (website.search.patterns), built from the snapshot sequences.
   Both are read from website.protein.conservation (CONTRACTS.md); a site without it has neither. They describe; no
   number of the site depends on them. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, S, esc, int } = K;
  const CV = D.protein_view?.conservation;
  if (!CV || !(CV.species || []).length || !CV.ensembl) return;
  const RES = D.residues || [];
  const KEPT = RES.length === 1 ? RES[0] : 'the same residue';        // "still R"
  const REF = CV.reference || 'Reference';        // the source organism's name, from the site file (website.protein.conservation.reference)
  const CATALOGUE = CV.species, SIMILAR = new Set(CV.similar || []), ENS = CV.ensembl;
  // The reader's set of species: one of the site file's presets (each names species of the catalog), remembered in this
  // browser. A site without presets aligns every species it lists.
  const PRESETS = (CV.presets || []).map(p => ({ ...p, list: (p.species || []).map(id => CATALOGUE.find(s => s.id === id)).filter(Boolean) })).filter(p => p.list.length);
  const SET_KEY = `ptmc-cons-set-${D.site?.id}`;
  const UI = { pos: null, flank: 10, set: '' };
  try { UI.set = localStorage.getItem(SET_KEY) || ''; } catch (e) { /* storage blocked: the default set */ }
  const preset = () => PRESETS.find(p => p.id === UI.set) || PRESETS.find(p => p.id === CV.default) || PRESETS[0];
  const SPECIES = () => (PRESETS.length ? preset().list : CATALOGUE);
  const PCT = v => Math.round(100 * v);
  const timed = (pr, ms) => Promise.race([pr, new Promise((ok, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  const getJson = url => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  const memo = {};
  const live = (key, make) => (memo[key] ||= make().catch(e => { delete memo[key]; throw e; }));
  const tipAttr = html => ` data-cv-tip="${esc(html)}"`;

  // ---- residue chemistry: WebLogo's "chemistry" colors (Crooks et al. 2004) ------------------------------------------
  const CHEM = { G: 'polar', S: 'polar', T: 'polar', Y: 'polar', C: 'polar', Q: 'polar', N: 'polar', K: 'basic', R: 'basic', H: 'basic', D: 'acidic', E: 'acidic',
    A: 'hydrophobic', V: 'hydrophobic', L: 'hydrophobic', I: 'hydrophobic', P: 'hydrophobic', W: 'hydrophobic', F: 'hydrophobic', M: 'hydrophobic' };
  const COL = { polar: '#1A9850', basic: '#2166AC', acidic: '#C0392B', hydrophobic: '#1F2933' };
  const TINT = { polar: '#DDF0E3', basic: '#DCE8F6', acidic: '#F7DEDA', hydrophobic: '#ECEEF0' };
  const CHEM_LABEL = { basic: 'Basic (K R H)', acidic: 'Acidic (D E)', polar: 'Polar (G S T Y C Q N)', hydrophobic: 'Hydrophobic (A V L I P W F M)' };
  const MONO = 'Menlo, Consolas, &quot;DejaVu Sans Mono&quot;, &quot;Liberation Mono&quot;, monospace';
  const r1 = v => Math.round(v * 10) / 10;
  const cell = (a, x, y, cw, rh, edge) => (CHEM[a] ? `<rect x="${x}" y="${y}" width="${cw}" height="${rh}" fill="${TINT[CHEM[a]]}"/>` : '') +
    (a && a !== '_' ? `<text x="${r1(x + cw / 2)}" y="${y + rh - 4}" font-size="11" font-family="${MONO}" text-anchor="middle" fill="${CHEM[a] ? COL[CHEM[a]] : '#5F6F78'}">${esc(a)}</text>` : '') +
    (edge ? `<rect x="${x}" y="${y}" width="${cw}" height="${rh}" fill="none" stroke="${edge}" stroke-width="0.6"/>` : '');
  function legend(x, y, Wd) {
    const keys = Object.keys(CHEM_LABEL), widths = [110, 100, 160, 210], perRow = widths.reduce((a, b) => a + b, 0) <= Wd - 2 * x ? 4 : 2;
    let svg = '', cx = x, cy = y;
    keys.forEach((k, i) => {
      if (i && i % perRow === 0) { cx = x; cy += 16; }
      svg += `<rect x="${cx}" y="${cy - 9}" width="11" height="11" fill="${TINT[k]}" stroke="${COL[k]}"/><text x="${cx + 16}" y="${cy}" font-size="10" fill="#5F6F78">${esc(CHEM_LABEL[k])}</text>`;
      cx += perRow === 4 ? widths[i] : 230;
    });
    return { svg, h: cy - y + 16 };
  }
  const protOf = acc => (D.proteins || []).find(p => p[0] === acc);
  const gene = acc => protOf(acc)?.[1] || acc;
  const slug = s => String(s).replace(/[^\w.-]+/g, '_');

  // =================================================================================================================
  // Conservation across species (protein page)
  // =================================================================================================================
  const UNI = acc => `https://rest.uniprot.org/uniprotkb/${acc}.json`;       // the address the protein page's own card reads
  const orthoUrl = ensg => `${String(ENS.rest).replace(/\/$/, '')}/homology/id/${encodeURIComponent(ENS.source)}/${encodeURIComponent(ensg)}?type=orthologs;aligned=1;sequence=protein;cigar_line=0;${ENS.compara ? 'compara=' + encodeURIComponent(ENS.compara) + ';' : ''}` +
    SPECIES().map(s => 'target_species=' + s.id).join(';') + ';content-type=application/json';
  const ensgOf = j => [...new Set((j.uniProtKBCrossReferences || []).filter(x => x.database === ENS.xref)
    .map(x => ((x.properties || []).find(pp => pp.key === 'GeneId') || {}).value || '').filter(Boolean).map(g => g.split('.')[0]))][0] || '';
  // the ortholog of highest identity for each species, in the site file's order
  const orthologs = ensg => live('ortho:' + ensg + ':' + SPECIES().map(s => s.id).join(','), () => timed(getJson(orthoUrl(ensg)), 60000).then(d => {
    const best = new Map();
    for (const h of ((d.data || [])[0] || {}).homologies || []) {
      const sp = h.target?.species;
      if (sp && (!best.has(sp) || h.target.perc_id > best.get(sp).target.perc_id)) best.set(sp, h);
    }
    return SPECIES().filter(s => best.has(s.id)).map(s => ({ sp: s.id, name: s.label, h: best.get(s.id) }));
  }));

  // Carry each position of the snapshot sequence to the Ensembl protein of the source organism (identical, contained, or by a unique
  // 15-residue anchor), then read the ortholog's aligned residue there; null where it cannot be mapped.
  function modelOf(seq, sites, orthos) {
    const rows = orthos.map(o => {
      const src = o.h.source.align_seq, tgt = o.h.target.align_seq, ens = src.replace(/-/g, ''), colOf = [];
      for (let c = 0, e = 0; c < src.length; c++) if (src[c] !== '-') colOf[++e] = c;
      const off = ens === seq ? 0 : ens.includes(seq) ? ens.indexOf(seq) : seq.includes(ens) ? -seq.indexOf(ens) : null;
      const toEns = pos => {
        if (off != null) { const e = pos + off; return e >= 1 && e <= ens.length ? e : null; }
        const a = Math.max(0, pos - 8), w = seq.slice(a, pos + 7), i = ens.indexOf(w);
        return i >= 0 && ens.indexOf(w, i + 1) < 0 ? i + 1 + (pos - 1 - a) : null;
      };
      const at = pos => { const e = toEns(pos); return e == null ? null : tgt[colOf[e]]; };
      return { ...o, at, pid: o.h.target.perc_id, prot: o.h.target.protein_id };
    });
    return { rows, sites };
  }
  // Is each residue still the same in the orthologs? For each candidate residue (the profile's letters) with an
  // aligned residue in at least one species, the share of those species that keep it; the marks against the protein's
  // other candidates by their means and a two-sided Wilcoxon rank-sum test (normal approximation, ties corrected), each
  // residue counted once however many species align it.
  function keepOf(seq, model) {
    const sites = new Set(model.sites), me = [], other = [], res = new Set(RES);
    const species = model.rows.map(r => ({ r, n: 0, m: 0, on: 0, om: 0 }));
    for (let q = 1; q <= seq.length; q++) {
      if (!res.has(seq[q - 1])) continue;
      const isSite = sites.has(q);
      let n = 0, m = 0;
      species.forEach(x => {
        const a = x.r.at(q); if (a == null) return;
        m++; if (a === seq[q - 1]) n++;
        if (isSite) { x.m++; if (a === seq[q - 1]) x.n++; } else { x.om++; if (a === seq[q - 1]) x.on++; }
      });
      if (m) (isSite ? me : other).push(n / m);
    }
    const mean = v => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    let p = null;
    if (me.length >= 3 && other.length >= 3) {
      const all = me.map(v => [v, 1]).concat(other.map(v => [v, 0])).sort((a, b) => a[0] - b[0]), N = all.length, n1 = me.length, n2 = other.length;
      let r1s = 0, ties = 0;
      for (let i = 0; i < N;) {
        let j = i; while (j < N && all[j][0] === all[i][0]) j++;
        const t = j - i; ties += t ** 3 - t;
        for (let k = i; k < j; k++) if (all[k][1]) r1s += (i + j + 1) / 2;
        i = j;
      }
      const U = r1s - n1 * (n1 + 1) / 2, sd = Math.sqrt(n1 * n2 / 12 * (N + 1 - ties / (N * (N - 1)))), z = Math.max(0, Math.abs(U - n1 * n2 / 2) - 0.5) / (sd || 1);
      p = sd > 0 ? Math.min(1, window.PTMC_STATS.chi2sf1(z * z)) : 1;
    }
    return { me: mean(me), other: mean(other), n1: me.length, n2: other.length, p, species };
  }
  const say = ck => (ck.me == null ? '' : `still ${KEPT}: ${W.marks} ${PCT(ck.me)}%, other ${W.residues} ${ck.other == null ? '–' : PCT(ck.other) + '%'} of species` +
    (ck.other == null ? '' : ck.p == null ? ' (too few to test)' : ` (rank-sum p ${K.fq(ck.p)})`));

  // ---- the state of each protein's lookup ------------------------------------------------------------------------------
  const ST = {};
  const curAcc = () => (S.view === 'protein' ? String(S.arg || '').split('/')[0] : '');
  const fail = e => (String(e && e.message) === 'timeout' ? 'did not answer in time' : 'could not be reached');
  function start(acc, rec, force) {
    let st = ST[acc];
    if (st && !force && st.phase !== 'idle') return;
    st = ST[acc] = { phase: 'ens', seq: rec.seq || '', sites: (rec.marks || []).map(m => m[0]) };
    paint(acc);
    live('uni:' + acc, () => timed(getJson(UNI(acc)), 25000)).then(j => {
      st.ensg = ensgOf(j);
      if (!st.ensg) { st.phase = 'no_gene'; return paint(acc); }
      st.phase = 'ortho'; paint(acc);
      return orthologs(st.ensg).then(orthos => {
        if (!orthos.length) { st.phase = 'none'; return paint(acc); }
        st.model = modelOf(st.seq, st.sites, orthos); st.ck = keepOf(st.seq, st.model); st.phase = 'ok';
        if (!st.sites.includes(UI.pos) || UI.acc !== acc) { UI.pos = st.sites[0]; UI.acc = acc; }
        paint(acc);
        // website.protein.open: a fold the site starts open opens when its orthologs arrive, unless the reader has touched it
        const f = document.getElementById('p-cons');
        if (f && curAcc() === acc && D.front?.mode !== 'cards' && K.foldStarts?.('p-cons') && !K.foldTouched?.('p-cons')) f.open = true;
      });
    }).catch(e => { st.phase = 'fail'; st.err = fail(e); st.who = st.ensg ? 'Ensembl Compara' : 'UniProt'; paint(acc); });
  }
  const sumOf = st => {
    if (!st || st.phase === 'idle' || st.phase === 'ens' || st.phase === 'ortho') return 'looking up the orthologs, live';
    if (st.phase === 'no_gene') return `UniProt lists no ${esc(ENS.xref)} gene`;
    if (st.phase === 'none') return 'no ortholog in the species listed';
    if (st.phase === 'fail') return `${esc(st.who)} did not answer`;
    return st.ck.me == null ? `no ${esc(W.mark)} could be mapped` : esc(say(st.ck));
  };

  // ---- the card ---------------------------------------------------------------------------------------------------------
  const cls = (a, human) => (a == null ? 'cv-u' : a === '-' ? 'cv-g' : a === human ? 'cv-k' : SIMILAR.has(a) ? 'cv-s' : 'cv-o');
  const lab = (acc, pos) => K.prot?.siteLabel(acc, pos) || String(pos);
  // the species to compare with: the site file's presets as a select, with what the chosen one holds
  const setPicker = () => (PRESETS.length > 1 ? `<p class="cv-set"><label>Species <select id="cv-set">${PRESETS.map(p => `<option value="${esc(p.id)}"${p === preset() ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>` +
    (preset().note ? ` <span class="muted small">${esc(preset().note)}</span>` : '') + '</p>' : '');
  function bodyHtml(acc) {
    const st = ST[acc], g = esc(gene(acc));
    const head = `<div class="card-head"><div>${setPicker()}</div>` +
      (st?.phase === 'ok' ? K.expBar(['svg', 'png', 'tsv'], 'cvexp', 'the conservation of ' + gene(acc), 'conserve') : '') + '</div>';    // the downloads wait for the orthologs: a button with nothing behind it gave no file
    if (!st || ['idle', 'ens', 'ortho'].includes(st.phase)) return head + `<p class="note">Looking up ${g}’s orthologs${st?.phase === 'ortho' ? ` in Ensembl Compara (${esc(st.ensg)}); usually 5–30 s` : ' (UniProt, then Ensembl Compara)'}…</p>`;
    if (st.phase === 'no_gene') return head + `<p class="note">UniProt lists no ${esc(ENS.xref)} gene for ${esc(acc)}, so there are no orthologs to look up.</p>`;
    if (st.phase === 'none') return head + `<p class="note">Ensembl lists no ortholog of ${g} in these species.</p>`;
    if (st.phase === 'fail') return head + `<p class="note">${esc(st.who)} ${esc(st.err)}. Nothing else on this page depends on it. <button class="linkish" type="button" data-cv-retry="${esc(acc)}">Try again</button></p>`;
    const { model, ck, seq, sites } = st, per = model.rows.map(r => { const v = sites.map(q => r.at(q)); return { r, v, nK: v.filter((a, i) => a === seq[sites[i] - 1]).length, nMap: v.filter(a => a != null).length }; });
    const absent = SPECIES().filter(s => !model.rows.some(r => r.sp === s.id)).map(s => s.label);
    const test = ck.me != null && ck.other != null ? `<p class="cv-test"><b>${esc(W.marks)} against the other ${esc(W.residues)} of ${g}:</b> on average a ${esc(W.mark)} is still ${esc(KEPT)} in <b>${PCT(ck.me)}%</b> of the species that align it, ` +
      `the other ${esc(W.residues)} in <b>${PCT(ck.other)}%</b> (${int(ck.n1)} and ${int(ck.n2)} ${esc(W.residues)}; ${ck.p == null ? 'too few to test' : 'Wilcoxon rank-sum p = ' + K.fq(ck.p)}).</p>` : '';
    const row = (name, sub, vals) => `<tr><th>${esc(name)}${sub ? ` <span class="muted">${esc(sub)}</span>` : ''}</th>${vals}</tr>`;
    const tcell = (a, i, name, human) => `<td class="${cls(a, human)}"${tipAttr(`<b>${esc(name)}</b> · ${esc(lab(acc, sites[i]))}<br>${a == null ? 'not mapped: the Ensembl protein differs around here' : a === '-' ? 'gap: no aligned residue in this ortholog' : esc(a) + (a === human ? ' (kept)' : SIMILAR.has(a) ? ' (a conservative change)' : ' (changed)')}`)}>${esc(a == null ? '·' : a === '-' ? '–' : a)}</td>`;
    const table = `<div class="cv-wrap"><table class="cv-tbl"><thead><tr><th>Species</th>${sites.map(q => `<th><button type="button" class="linkish${q === UI.pos ? ' cur' : ''}" data-cv-pos="${q}">${esc(lab(acc, q))}</button></th>`).join('')}</tr></thead><tbody>` +
      row(REF, '', sites.map(q => `<td class="${cls(seq[q - 1], seq[q - 1])}">${esc(seq[q - 1] || '·')}</td>`).join('')) +
      per.map(x => row(x.r.name, Math.round(x.r.pid) + '%', x.v.map((a, i) => tcell(a, i, x.r.name, seq[sites[i] - 1])).join(''))).join('') + '</tbody></table></div>';
    return head + test + `<div class="cv-sum">${per.map(x => `<span class="tag"><b>${esc(x.r.name)}</b> ${esc(KEPT)} at ${x.nK}/${x.nMap}</span>`).join(' ')}` +
      (absent.length ? ` <span class="muted small">No ortholog in Ensembl: ${esc(absent.join(', '))}.</span>` : '') + '</div>' + table +
      `<p class="small muted">Dark: still ${esc(KEPT)}; pale: a conservative change; gray: another residue; – a gap; · not mapped (the Ensembl protein differs here). The percentage is the ortholog’s identity to ${g}. ` +
      `<a href="https://www.ensembl.org/${esc(String(ENS.source).replace(/^./, c => c.toUpperCase()))}/Gene/Compara_Ortholog?g=${encodeURIComponent(st.ensg)}" target="_blank" rel="noopener">Ensembl ${esc(st.ensg)} orthologs ↗</a></p>` +
      `<div class="cv-ctl"><label>Site <select id="cv-pos">${sites.map(q => `<option value="${q}"${q === UI.pos ? ' selected' : ''}>${esc(lab(acc, q))}</option>`).join('')}</select></label> ` +
      `<label>Flank <select id="cv-flank">${[5, 10, 15, 20].map(v => `<option value="${v}"${v === UI.flank ? ' selected' : ''}>±${v}</option>`).join('')}</select></label></div>` +
      `<div class="cv-fig" id="cv-fig">${figure(acc).svg}</div>`;
  }
  function figure(acc) {
    const st = ST[acc], { model, seq } = st, pos = UI.pos, flank = UI.flank, ncol = 2 * flank + 1, cw = 15, rh = 17, labelW = 120, x0 = 20 + labelW;
    const Wd = Math.max(560, x0 + ncol * cw + 90);
    let g = '', y = 0;
    for (let k = 0; k < ncol; k++) {
      const q = pos - flank + k;
      if (q === pos || q % 5 === 0) g += `<text x="${x0 + k * cw + cw / 2}" y="${y + 9}" font-size="9" text-anchor="middle" fill="${q === pos ? K.PAL.ink : K.PAL.muted}"${q === pos ? ' font-weight="700"' : ''}>${esc(q === pos ? lab(acc, q) : String(q))}</text>`;
      if (st.sites.includes(q) && q !== pos) g += `<circle cx="${x0 + k * cw + cw / 2}" cy="${y + 14}" r="2" fill="${K.PAL.more}"/>`;
    }
    y += 18;
    const top = y, line = (label, sub, get, human) => {
      g += `<text x="20" y="${y + rh - 5}" font-size="11" fill="${K.PAL.ink}">${esc(label)}</text>`;
      for (let k = 0; k < ncol; k++) { const q = pos - flank + k, a = q >= 1 && q <= seq.length ? get(q) : ''; g += cell(a || '', x0 + k * cw, y + 1, cw, rh - 2, a && human && a === human(q) ? K.PAL.ink : ''); }
      if (sub) g += `<text x="${x0 + ncol * cw + 8}" y="${y + rh - 5}" font-size="10" fill="${K.PAL.muted}">${esc(sub)}</text>`;
      y += rh;
    };
    line(REF, '', q => seq[q - 1]);
    model.rows.forEach(r => line(r.name, r.pid != null ? Math.round(r.pid) + '% id.' : '', q => r.at(q), q => seq[q - 1]));
    g += `<rect x="${x0 + flank * cw}" y="${top - 1}" width="${cw}" height="${y - top + 2}" fill="none" stroke="${K.PAL.ink}" stroke-width="1.2"/>`;
    y += 18;
    const lg = legend(20, y, Wd); g += lg.svg; y += lg.h;
    return K.figureFrame({ title: `${gene(acc)} ${lab(acc, pos)} across species`, sub: `${acc} · Ensembl Compara orthologs, columns anchored on the ${REF} sequence · residues ${Math.max(1, pos - flank)}–${pos + flank}`,
      body: g, bodyH: y, W: Wd, note: `Outlined: the same residue as in ${REF}. Dots: other ${W.marks} of the protein. % id.: identity of the ortholog to the human protein (Ensembl).`,
      extra: { ensembl_gene: st.ensg, orthologs: model.rows.map(r => `${r.name} ${r.prot}`) } });
  }
  const tsv = acc => {
    const st = ST[acc], { model, seq, sites } = st, rows = model.rows;
    return K.preamble(`Conservation across species: ${gene(acc)}`, `each ${W.mark} of ${gene(acc)} (${acc}) and the residue aligned to it in the orthologs of Ensembl Compara (${st.ensg}); empty: not mapped, -: gap`) +
      ['site\tposition\treference_residue\t' + rows.map(r => slug(r.name.toLowerCase()) + '_residue').join('\t')].concat(sites.map(q => [lab(acc, q), q, seq[q - 1], ...rows.map(r => r.at(q) ?? '')].join('\t'))).join('\n') +
      '\n# orthologs: ' + rows.map(r => `${r.name} ${r.prot} (${Math.round(r.pid)}% identity)`).join('; ') + `\n# ${W.marks} still ${KEPT}: ${say(st.ck)}\n`;
  };

  function paint(acc) {
    if (curAcc() !== acc) return;
    const el = document.getElementById('p-cons'); if (!el) return;
    const st = ST[acc];
    el.querySelector('.fsum').innerHTML = sumOf(st);
    if (K.pfolds) K.pfolds.set('p-cons', st?.phase === 'ok' && st.ck?.me != null ? K.pfolds.meters(st.ck.species.filter(x => x.m).slice(0, 6).map(x => ({ label: x.r.name, v: x.n / x.m, ref: x.om ? x.on / x.om : null, text: `${x.n}/${x.m}` }))) : '');
    el.querySelector('.pfold-body').innerHTML = bodyHtml(acc);
    chip(acc);
  }
  // the chip among the protein's chips: loading, then "82% still R in orthologs" (it opens the card)
  function chip(acc) {
    const host = document.querySelector('.prot-chips'); if (!host) return;
    const st = ST[acc], ck = st?.ck, old = document.getElementById('cv-chip');
    const text = !st || ['idle', 'ens', 'ortho'].includes(st.phase) ? 'orthologs…' : st.phase === 'ok' && ck.me != null ? (RES.length === 1 ? `${PCT(ck.me)}% still ${KEPT} in orthologs` : `${PCT(ck.me)}% conserved in orthologs`) : '';
    if (!text) { old?.remove(); return; }
    const tip = ck && ck.me != null ? `<b>Conservation across species</b><br>On average, the share of ${st.model.rows.length} species whose ortholog still has ${esc(KEPT)} at a ${esc(W.mark)} (${int(ck.n1)}) is ${PCT(ck.me)}%` +
      (ck.other != null ? `, and ${PCT(ck.other)}% at the other ${esc(W.residues)} of the protein (${int(ck.n2)})` : '') + (ck.p != null ? `; Wilcoxon rank-sum p ${esc(K.fq(ck.p))}` : '') + '.<br>Click to open the alignments.' : 'Asking UniProt and Ensembl Compara for the orthologs.';
    const tiles = document.querySelector('.hl-cards');
    if (tiles) {           // a tile among the headline tiles when the page has them, else a chip
      document.getElementById('cv-chip')?.remove(); let t = document.getElementById('cv-tile');
      if (!(st?.phase === 'ok' && ck?.me != null)) { t?.remove(); return; }
      if (!t) { t = document.createElement('button'); t.type = 'button'; t.id = 'cv-tile'; t.className = 'hl-card'; t.setAttribute('data-cv-open', ''); tiles.append(t); dispatchEvent(new Event('resize')); }
      t.setAttribute('data-hl-tip', tip);
      t.innerHTML = `<span class="hl-glyph"><svg viewBox="0 0 64 22" aria-hidden="true"><path d="M4 11 h14 M18 11 l10 -6 h28 M18 11 l10 6 h28 M40 5 v12"/><circle class="g-f" cx="58" cy="5" r="3"/></svg></span><b class="hl-big">${PCT(ck.me)}%</b><span class="hl-lab">${esc(RES.length === 1 ? `still ${KEPT} in orthologs` : 'conserved in orthologs')}${ck.other != null ? ` (others ${PCT(ck.other)}%)` : ''}</span><span class="hl-kind">Conservation</span>`;
      return;
    }
    const html = `<button type="button" class="chip cv-chip" id="cv-chip" data-cv-open${tipAttr(tip)}>${esc(text)}</button>`;
    if (old) old.outerHTML = html; else host.insertAdjacentHTML('beforeend', html);
  }
  (K.hasData ||= {})['p-cons'] = () => ST[curAcc()]?.phase === 'ok';
  (K.proteinFolds ||= []).push((p, rec, fold) => {
    if (!rec.seq) return '';
    ST[p.acc] ||= { phase: 'idle', seq: rec.seq, sites: (rec.marks || []).map(m => m[0]) };
    return fold('p-cons', 'Conservation across species', sumOf(ST[p.acc]), bodyHtml(p.acc), false);
  });
  const baseProt = K.sections.protein;
  if (baseProt) K.sections.protein = () => {
    const s = baseProt(), at = s.findIndex(x => x[0] === 'p-regions');
    if (document.getElementById('p-cons')) s.splice(at < 0 ? s.length : at, 0, ['p-cons', 'Conservation across species', 1]);
    return s;
  };
  K.clicks.push(
    ['[data-cv-pos]', el => { UI.pos = +el.dataset.cvPos; redraw(); K.site?.focus(curAcc(), UI.pos, { from: 'conserve' }); }],
    ['[data-cv-retry]', el => K.loadProtein(el.dataset.cvRetry).then(rec => start(el.dataset.cvRetry, rec, true))],
    ['[data-cv-open]', () => { const f = document.getElementById('p-cons'); if (f) { f.open = true; f.scrollIntoView({ block: 'start' }); } }],
    ['[data-cvexp]', btn => { const acc = curAcc(), st = ST[acc]; if (st?.phase !== 'ok') { alert('The orthologs have not arrived, so there is nothing to download yet.'); return; }
      const name = `${D.site.id}_${slug(gene(acc))}_conservation_${slug(lab(acc, UI.pos))}`;
      K.exportFigure(btn.dataset.cvexp, () => figure(acc), name, btn, () => tsv(acc)); }]);
  function redraw() {
    const acc = curAcc(), st = ST[acc]; if (st?.phase !== 'ok') return;
    const fig = document.getElementById('cv-fig'); if (fig) fig.innerHTML = figure(acc).svg;
    document.querySelectorAll('[data-cv-pos]').forEach(b => b.classList.toggle('cur', +b.dataset.cvPos === UI.pos));
    const sel = document.getElementById('cv-pos'); if (sel) sel.value = String(UI.pos);
  }
  // a site focused in another view is the one shown here, where this protein's table has it
  K.site?.on(e => { if (e.kind !== 'focus' || e.pos == null || e.from === 'conserve' || e.acc !== curAcc() || !ST[e.acc]?.sites?.includes(e.pos) || UI.pos === e.pos) return; UI.pos = e.pos; redraw(); });
  document.addEventListener('change', e => {
    if (e.target.id === 'cv-set') {
      UI.set = e.target.value;
      try { localStorage.setItem(SET_KEY, UI.set); } catch (err) { /* storage blocked: this visit only */ }
      const acc = curAcc();
      Object.keys(ST).forEach(k => { if (k !== acc) delete ST[k]; });      // other proteins start again, with the new set, when opened
      if (acc) K.loadProtein(acc).then(rec => { if (curAcc() === acc) start(acc, rec, true); });
    }
    else if (e.target.id === 'cv-pos') { UI.pos = +e.target.value; redraw(); }
    else if (e.target.id === 'cv-flank') { UI.flank = +e.target.value; redraw(); }
  });

  // =================================================================================================================
  // The selection's sequence logo and comparison (Overview)
  // =================================================================================================================
  const LUI = { flank: 7, mode: CV.logo_mode === 'freq' ? 'freq' : 'bits', order: 'protein', rows: 50, open: false };
  const FLANKS = [3, 5, 7, 10, 15];
  const AA_BITS = Math.log2(20);
  // Residue frequencies at each position of the windows (padding and unknown letters left out) and the information
  // content in bits, with the small-sample correction of Schneider et al. (1986): log2(20) - H - 19 / (2 ln 2 n).
  function columns(wins, span, flank) {
    const cols = [];
    for (let k = span - flank; k <= span + flank; k++) {
      const c = {}; let n = 0;
      for (const w of wins) { const a = w[k]; if (CHEM[a]) { c[a] = (c[a] || 0) + 1; n++; } }
      let H = 0; for (const a in c) { const f = c[a] / n; H -= f * Math.log2(f); }
      const ic = n ? Math.max(0, AA_BITS - H - 19 / (2 * Math.LN2 * n)) : 0;
      cols.push({ rel: k - span, n, ic, c, freqs: Object.keys(c).map(a => [a, c[a] / n]).sort((x, y) => x[1] - y[1]) });
    }
    return cols;
  }
  const SD = () => K.sel.data();
  const haveWindows = () => { const d = SD(); return !!(d && d.wide && d.marks.length && K.sel.active()); };
  let cached = { key: '' };
  function sets() {
    const d = SD(), c = K.sel.compute(), key = JSON.stringify([S.q, S.f, c.marks.length]);
    if (cached.key === key) return cached;
    const chosen = new Set(c.marks), sel = [], oth = [];
    d.marks.forEach((m, i) => { const w = m.w; if (!w || w.length !== 2 * d.wide.span + 1) return; (chosen.has(i) ? sel : oth).push({ pi: m[0], pos: m[1], w, i }); });
    return (cached = { key, sel, oth, span: d.wide.span });
  }
  const fmtDelta = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(100 * v));
  const rel = r => (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r);
  const topList = (col, n) => col.freqs.slice().reverse().slice(0, n).map(([a, f]) => `${a} ${PCT(f)}%`).join(' · ');
  // the residue a position gains and loses most, selection against the other marks
  function shifts(cs, co) {
    return cs.map((c, k) => {
      let up = ['', 0], dn = ['', 0];
      if (c.n && co[k].n) for (const a of Object.keys(CHEM)) { const d = (c.c[a] || 0) / c.n - (co[k].c[a] || 0) / co[k].n; if (d > up[1]) up = [a, d]; if (d < dn[1]) dn = [a, d]; }
      return { up, dn };
    });
  }
  function ordered(list) {
    const sp = sets().span, o = LUI.order, name = x => (protOf(D.proteins[x.pi][0])?.[1] || D.proteins[x.pi][0]);
    const key = o === 'right' ? x => x.w.slice(sp + 1) : o === 'left' ? x => x.w.slice(0, sp).split('').reverse().join('') : x => name(x) + ':' + String(x.pos).padStart(6, '0');
    return list.map(x => [key(x), x]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(x => x[1]);
  }
  // a logo as drawn letters; tips: hover columns (the page, not the export)
  function logoSvg(cols, x0, y, cw, LH, tips, who) {
    const bits = LUI.mode === 'bits', maxV = AA_BITS, ticks = bits ? [0, 1, 2, 3, 4] : [0, 0.5, 1], ink = K.PAL.ink;
    let g = `<line x1="${x0 - 6}" x2="${x0 - 6}" y1="${y}" y2="${y + LH}" stroke="#9aa5ab"/>`;
    for (const t of ticks) { const ty = y + LH - (t / (bits ? maxV : 1)) * LH; g += `<line x1="${x0 - 9}" x2="${x0 - 6}" y1="${r1(ty)}" y2="${r1(ty)}" stroke="#9aa5ab"/><text x="${x0 - 12}" y="${r1(ty + 3)}" font-size="9.5" text-anchor="end" fill="${K.PAL.muted}">${t}</text>`; }
    g += `<text x="${x0 - 40}" y="${y + LH / 2 + 3}" font-size="10" text-anchor="end" fill="${K.PAL.muted}">${bits ? 'bits' : 'frequency'}</text>`;
    cols.forEach((c, k) => {
      let base = y + LH; const total = bits ? c.ic : 1;
      for (const [a, f] of c.freqs) {
        const h = f * total / (bits ? maxV : 1) * LH; if (h < 0.6) continue;
        g += `<text x="${x0 + k * cw}" y="0" font-size="100" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${COL[CHEM[a]]}" textLength="${cw - 1}" lengthAdjust="spacingAndGlyphs" transform="translate(0 ${r1(base)}) scale(1 ${(h / 71.6).toFixed(4)})">${a}</text>`;
        base -= h;
      }
      if (tips && c.n) g += `<rect class="cv-col" x="${x0 + k * cw}" y="${y}" width="${cw}" height="${LH}" fill="transparent"${tipAttr(`<b>${esc(who)} · position ${rel(c.rel)}</b><br>${int(c.n)} sites · ${c.ic.toFixed(2)} bits<br>${esc(topList(c, 5))}`)}/>`;
    });
    return g;
  }
  const offsets = (cols, x0, y, cw, flank) => cols.map((c, k) => (c.rel === 0 || k % 2 === flank % 2 ? `<text x="${x0 + k * cw + cw / 2}" y="${y}" font-size="10" text-anchor="middle" fill="${c.rel === 0 ? K.PAL.ink : K.PAL.muted}"${c.rel === 0 ? ' font-weight="700"' : ''}>${rel(c.rel)}</text>` : '')).join('');
  function logoFigure(tips) {
    const s = sets(), flank = Math.min(LUI.flank, s.span), ncol = 2 * flank + 1, Wd = 760, x0 = 190, cw = Math.max(10, Math.min(24, Math.floor((Wd - x0 - 24) / ncol)));
    const cs = columns(s.sel.map(x => x.w), s.span, flank), co = columns(s.oth.map(x => x.w), s.span, flank), LH = 90, rh = 15, sh = shifts(cs, co);
    const rowsAll = ordered(s.sel), rows = rowsAll.slice(0, LUI.rows);
    let g = '', y = 0;
    const head = t => { g += `<text x="20" y="${y + 12}" font-size="12.5" font-weight="700" fill="${K.PAL.ink}">${esc(t)}</text>`; y += 22; };
    head(`Your ${int(s.sel.length)} ${s.sel.length === 1 ? W.mark : W.marks}, aligned at the ${W.mark}`);
    g += logoSvg(cs, x0, y, cw, LH, tips, 'Your selection'); y += LH + 14; g += offsets(cs, x0, y - 2, cw, flank); y += 8;
    rows.forEach(x => {
      const acc = D.proteins[x.pi][0];
      g += `<text x="20" y="${y + rh - 4}" font-size="10.5" fill="${K.PAL.ink}">${esc(`${gene(acc)} ${lab(acc, x.pos)}`)}</text>`;
      for (let k = 0; k < ncol; k++) g += cell(x.w[s.span - flank + k], x0 + k * cw, y + 1, cw, rh - 1, '');
      y += rh;
    });
    g += `<rect x="${x0 + flank * cw}" y="${y - rows.length * rh}" width="${cw}" height="${rows.length * rh + 1}" fill="none" stroke="${K.PAL.ink}" stroke-width="1.2"/>`;
    if (rowsAll.length > rows.length) { g += `<text x="20" y="${y + 12}" font-size="10" fill="${K.PAL.muted}">${int(rows.length)} of ${int(rowsAll.length)} windows drawn; the logo uses all of them</text>`; }
    y += 30;
    head(`Compared with the other ${int(s.oth.length)} ${W.marks}`);
    g += logoSvg(co, x0, y, cw, LH, tips, `The other ${W.marks}`); y += LH + 14; g += offsets(co, x0, y - 2, cw, flank); y += 22;
    g += `<text x="20" y="${y + 12}" font-size="12.5" font-weight="700" fill="${K.PAL.ink}">What the selection gains and loses</text>`; y += 22;
    [['up', 'More often'], ['dn', 'Less often']].forEach(([key, label]) => {
      g += `<text x="20" y="${y + 15}" font-size="10.5" fill="${K.PAL.ink}">${label} than the others</text>`;
      sh.forEach((d, k) => {
        const [a, v] = d[key], x = x0 + k * cw, big = Math.abs(v) >= 0.02;
        g += (big ? cell(a, x, y + 1, cw, 15, '') + `<text x="${x + cw / 2}" y="${y + 27}" font-size="8" text-anchor="middle" fill="${K.PAL.muted}">${fmtDelta(v)}</text>` : `<text x="${x + cw / 2}" y="${y + 13}" font-size="11" text-anchor="middle" fill="${K.PAL.muted}">·</text>`);
        if (tips && cs[k].n && co[k].n) g += `<rect class="cv-col" x="${x}" y="${y}" width="${cw}" height="30" fill="transparent"${tipAttr(`<b>Position ${rel(cs[k].rel)}</b><br>${big ? `${esc(a)} ${key === 'up' ? 'gains' : 'loses'} ${Math.abs(Math.round(100 * v))} points: ${PCT((cs[k].c[a] || 0) / cs[k].n)}% of your selection, ${PCT((co[k].c[a] || 0) / co[k].n)}% of the others` : 'no residue changes by 2 points or more'}`)}/>`;
      });
      y += 34;
    });
    const lg = legend(20, y + 6, Wd); g += lg.svg; y += lg.h + 6;
    return K.figureFrame({ title: 'Selected sites aligned at the mark, with their logo', sub: `${K.sel.describe()}: ${int(s.sel.length)} ${W.marks} with a sequence window of ${int(2 * s.span + 1)}, against ${int(s.oth.length)} other ${W.marks}`,
      body: g, bodyH: y, W: Wd, note: `The logo stacks ${LUI.mode === 'bits' ? `residues scaled by information content: log2(20) minus the Shannon entropy and the small-sample correction (Schneider et al. 1986), so a position held by one residue approaches ${AA_BITS.toFixed(1)} bits` : 'residue frequencies at each position'}; padding past a protein’s end is left out. Gains and losses are in percentage points, selection minus the other ${W.marks}; descriptive, not tested.` });
  }
  const logoTsv = () => {
    const s = sets(), flank = Math.min(LUI.flank, s.span), cs = columns(s.sel.map(x => x.w), s.span, flank), co = columns(s.oth.map(x => x.w), s.span, flank), aas = Object.keys(CHEM).sort();
    const line = (who, cols) => cols.flatMap(c => aas.map(a => [who, c.rel, c.n, c.ic.toFixed(4), a, c.c[a] || 0, c.n ? ((c.c[a] || 0) / c.n).toFixed(4) : ''].join('\t')));
    return K.preamble('Site alignment and sequence logo', `the residue counts at each position of the sequence windows of the selection and of the other ${W.marks}; then the selection's aligned windows`) +
      ['set\tposition\tsites\tinformation_bits\tresidue\tcount\tfrequency'].concat(line('selection', cs), line('others', co)).join('\n') +
      '\n\n# Aligned windows of the selection\nprotein\taccession\tposition\twindow\n' +
      ordered(s.sel).map(x => { const acc = D.proteins[x.pi][0]; return [gene(acc), acc, lab(acc, x.pos), x.w.slice(s.span - flank, s.span + flank + 1)].join('\t'); }).join('\n') + '\n';
  };
  const summaryText = () => {
    const s = sets(), cs = columns(s.sel.map(x => x.w), s.span, Math.min(LUI.flank, s.span)), co = columns(s.oth.map(x => x.w), s.span, Math.min(LUI.flank, s.span)), sh = shifts(cs, co);
    let best = null; sh.forEach((d, k) => { if (cs[k].rel !== 0 && d.up[1] > (best?.v ?? 0)) best = { v: d.up[1], a: d.up[0], rel: cs[k].rel }; });
    return `${int(s.sel.length)} ${s.sel.length === 1 ? W.mark : W.marks} aligned` + (best && best.v >= 0.02 ? ` · most over-represented: ${best.a} at ${rel(best.rel)} (${fmtDelta(best.v)} points)` : '');
  };
  const logoSection = () => {
    if (!CV.logo || !haveWindows() || !sets().sel.length) return '';
    return `<details class="apart cv-logo" id="sel-logo"${LUI.open ? ' open' : ''}><summary><span class="apart-h">Logo and comparison</span> <span class="apart-sum muted" id="cv-logo-sum">${esc(summaryText())}</span></summary><div id="cv-logo-body"></div></details>`;
  };
  // high on a selection's Overview: before the other blocks, for a selection too small to test as for one that can be
  (K.selLead ||= []).unshift(logoSection);
  (K.selSmall ||= []).unshift(logoSection);
  // "Sequence logo" in the selection line: opens it (and goes to the Overview that holds it)
  const logoBtn = () => (CV.logo && haveWindows() && sets().sel.length ? `<button class="btn small" type="button" data-go-logo title="The selected ${esc(W.marks)}' sequence windows aligned, as a logo and against the other ${esc(W.marks)}">Sequence logo</button>` : '');
  K.logoBtn = logoBtn; K.logoSection = logoSection;      // the cards front end's chip row and home (kit-front.js)
  (K.selTools ||= []).push(logoBtn);
  K.clicks.push(['[data-go-logo]', () => {
    LUI.open = true;
    if (S.view !== 'overview' || S.arg || S.vs !== 'residues') K.go('overview', { arg: '', vs: 'residues' });
    const show = () => { const d = document.getElementById('sel-logo'); if (!d) return; d.open = true; fillLogo(); d.scrollIntoView({ block: 'start' }); };
    show(); setTimeout(show, 60);
  }]);
  // the logo's controls, exports and figure: in the selection's Overview fold, and on the figure panels page (kit-figures.js)
  function logoCard() {
    const s = sets(), opt = (v, cur, t) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`;
    return `<div class="cv-card"><div class="cv-top">` +
      K.expBar(['svg', 'png', 'tsv'], 'lgexp', 'the site alignment and logo', 'logo') + '</div>' +
      `<div class="cv-ctl"><label>Flank <select id="lg-flank">${FLANKS.filter(f => f <= s.span).map(f => opt(f, LUI.flank, '±' + f)).join('')}</select></label> ` +
      `<label>Logo <select id="lg-mode">${opt('bits', LUI.mode, 'Information (bits)')}${opt('freq', LUI.mode, 'Frequency')}</select></label> ` +
      `<label>Order <select id="lg-order">${opt('protein', LUI.order, 'Protein and position')}${opt('right', LUI.order, 'Sequence after the ' + W.mark)}${opt('left', LUI.order, 'Sequence before the ' + W.mark)}</select></label> ` +
      `<label>Rows <select id="lg-rows">${[10, 30, 50, 100].map(v => opt(v, LUI.rows, String(v))).join('')}</select></label></div>` +
      `<div class="cv-fig" id="lg-fig">${logoFigure(true).svg}</div></div>`;
  }
  function fillLogo() {
    const el = document.getElementById('sel-logo'), body = document.getElementById('cv-logo-body');
    if (!el || !body || !el.open) return;
    body.innerHTML = logoCard();
  }
  K.logoPanel = () => { const d = SD(); return CV.logo && d && d.wide ? { n: sets().sel.length, html: logoCard } : null; };
  (K.afterRender ||= []).push(() => {
    if (S.view === 'protein') { const acc = curAcc(), f = document.getElementById('p-cons'); if (acc && f) { const st = ST[acc]; if (st && st.phase === 'idle') K.loadProtein(acc).then(rec => { if (curAcc() === acc) start(acc, rec); }); else chip(acc); } }
    else if (S.view === 'overview') fillLogo();
  });
  document.addEventListener('toggle', e => { if (e.target.id === 'sel-logo') { LUI.open = e.target.open; fillLogo(); } }, true);
  document.addEventListener('change', e => {
    const k = { 'lg-flank': 'flank', 'lg-mode': 'mode', 'lg-order': 'order', 'lg-rows': 'rows' }[e.target.id]; if (!k) return;
    LUI[k] = k === 'flank' || k === 'rows' ? +e.target.value : e.target.value;
    const fig = document.getElementById('lg-fig'); if (fig) fig.innerHTML = logoFigure(true).svg;
    const sum = document.getElementById('cv-logo-sum'); if (sum) sum.textContent = summaryText();
  });
  K.clicks.push(['[data-lgexp]', btn => K.exportFigure(btn.dataset.lgexp, () => logoFigure(false), `${D.site.id}_site_alignment_logo_selection`, btn, logoTsv)]);

  K.tips.push(['[data-cv-tip]', el => el.dataset.cvTip || '']);

  // ---- Method ---------------------------------------------------------------------------------------------------------
  const doi = (id, t) => `<a href="https://doi.org/${esc(id)}">${esc(t)}</a>`;
  (K.methodParts ||= []).push(() => `<section id="m-conserve"><h3>Conservation across species</h3>` +
    `<p>On a protein’s page, the ${esc(ENS.xref)} gene from UniProt’s cross-references is sent from your browser to Ensembl Compara (REST at ${esc(ENS.rest)}) for orthologs in the species of the set you choose (${esc(PRESETS.length ? PRESETS.map(p => `${p.label}: ${p.list.map(s => s.label).join(', ')}`).join('; ') : CATALOGUE.map(s => s.label).join(', '))}). ` +
    `Each species uses its ortholog of highest identity, with Ensembl’s pairwise protein alignment. Positions of the ${esc(D.run.snapshot?.release || 'snapshot')} sequence map to the Ensembl ${esc(ENS.source)} protein directly when the sequences are identical or nested, otherwise through a unique 15-residue anchor around each ${esc(W.mark)}. Without one, the position shows as not mapped. ` +
    `Columns follow the ${esc(ENS.source)} sequence, so insertions in other species are not shown. A residue is kept when the ortholog has the same residue there${SIMILAR.size ? `. ${esc([...SIMILAR].join(', '))} is shown as a conservative change and not counted as kept` : ''}.</p>` +
    `<p>The chip (“${RES.length === 1 ? 'still ' + esc(KEPT) : 'conserved'} in orthologs”) is the mean, over the protein’s ${esc(W.marks)}, of the share of species that align the ${esc(W.mark)} and keep it. It is compared with the protein’s other ${esc(W.residues)} (${esc(RES.join(', ') || 'the profile’s residues')}) by a two-sided Wilcoxon rank-sum test (normal approximation, with tie and continuity corrections). Each residue counts once however many species align it, and fewer than three on either side are not tested. ` +
    `It describes one protein and changes no number on this page. If UniProt or Ensembl does not answer, the card says so and nothing else depends on it. ` +
    `Exports: SVG and PNG of the alignment around the chosen ${esc(W.mark)}, and a TSV of every ${esc(W.mark)} in every species. ${doi('10.1093/database/bav096', 'Herrero et al. 2016')}; ${doi('10.1093/bioinformatics/btu613', 'Yates et al. 2015')}.</p></section>` +
    (CV.logo ? `<section id="m-logo"><h3>Site alignment and sequence logo</h3><p>On a selection’s Overview, the selected ${esc(W.marks)} are aligned at the ${esc(W.mark)} using the ${int(2 * (SD()?.wide?.span ?? 15) + 1)}-residue windows of the canonical sequences (the motif finder’s). Positions past a protein’s end are blank. ` +
      `The logo uses every selected ${esc(W.mark)} with a window. “Frequency” stacks the residue frequencies at each position. “Information” scales each stack by its information content, log2(20) minus the Shannon entropy and the small-sample correction 19 / (2 ln 2 n) (Schneider et al. 1986, ${doi('10.1016/0022-2836(86)90165-8', 'J Mol Biol 188:415')}), so a position held by one residue reaches about ${AA_BITS.toFixed(1)} bits at most. ` +
      `Colors follow WebLogo’s chemistry scheme (Crooks et al. 2004, ${doi('10.1101/gr.849004', 'Genome Res 14:1188')}). The same logo is drawn for the other ${esc(W.marks)}, and each position shows the residue the selection gains and loses most against them, in percentage points. ` +
      `This describes the windows; the Overview’s motif questions are the tests. Exports: SVG, PNG and a TSV of the counts per position and the aligned windows.</p></section>` : ''));
  const baseMethod = K.sections.method;
  K.sections.method = () => {
    const s = baseMethod(), at = s.findIndex(x => x[0] === 'm-g2');
    s.splice(at < 0 ? s.length : at, 0, ['m-conserve', 'Conservation across species', 1], ...(CV.logo ? [['m-logo', 'Site alignment and sequence logo', 1]] : []));
    return s;
  };

  K.conserve = { modelOf, keepOf, columns, ensgOf, orthoUrl };      // for the tests

  // ---- style -----------------------------------------------------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `.cv-chip { cursor: pointer; color: var(--ink-2); font: inherit; font-size: 0.85rem; }
.cv-chip:hover { border-color: var(--accent); color: var(--accent-dark); }
.cv-test { margin: 0.5rem 0; }
.cv-set { margin: 0.3rem 0 0; } .cv-set select { font: inherit; padding: 0.15rem 0.35rem; border: 1px solid var(--line-strong); border-radius: 0.35rem; background: var(--surface); color: var(--ink); }
.cv-sum { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; margin: 0.5rem 0; }
.cv-wrap { overflow-x: auto; margin: 0.4rem 0; }
.cv-tbl { border-collapse: collapse; font-size: 0.82rem; }
.cv-tbl th, .cv-tbl td { padding: 0.15rem 0.4rem; text-align: center; border: 1px solid var(--line); white-space: nowrap; }
.cv-tbl tbody th { text-align: left; font-weight: 600; }
.cv-tbl td { font-family: ui-monospace, Menlo, Consolas, monospace; min-width: 1.8rem; }
.cv-tbl .cv-k { background: color-mix(in srgb, var(--accent) 30%, var(--surface)); font-weight: 700; }
.cv-tbl .cv-s { background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
.cv-tbl .cv-o { background: var(--surface-2); color: var(--ink-2); }
.cv-tbl .cv-g, .cv-tbl .cv-u { color: var(--muted); }
.cv-tbl .linkish.cur { font-weight: 700; text-decoration: underline; }
.cv-ctl { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; margin: 0.6rem 0; font-size: 0.85rem; }
.cv-fig { overflow-x: auto; background: #fff; border: 1px solid var(--line); border-radius: 0.4rem; padding: 0.3rem; }
.cv-fig svg { display: block; max-width: 100%; height: auto; }
.cv-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.8rem 1.2rem; flex-wrap: wrap; }
.cv-card { padding: 0.4rem 0; }
.cv-col:hover { fill: rgba(0, 0, 0, 0.08); }`;
  document.head.appendChild(css);
});
