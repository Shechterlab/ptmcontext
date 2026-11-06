/* The cards front end's protein page below the map: the folds under four headings, each fold readable while closed (a small
   chart along the protein, a big number or bars at the right of its title), the tab counts, and the switch between what is
   recorded for the protein and the dataset's context. It knows no mark, source or organism by name: the headings are
   website.protein.headings (a title and the fold ids it holds), the pictures read the page's own data (the marks and their
   attributes, the regions, the RNA and DNA model, the tables of website.tables) through the builders that register them with
   K.pfolds.set(foldId, html). A module of the site kit; only on the cards front end. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int } = K;
  if (D.front?.mode !== 'cards') return;
  const PRO = D.protein_view || {}, SPECS = D.attribute_specs || {};
  const PICS = {};                                   // acc|fold id -> html
  const acc = () => K.protState?.().acc || '';
  const VB = 1000;

  // ---- the drawing primitives -----------------------------------------------------------------------------------------
  // a lane: runs and single residues along the protein (items: { a, b, col, cls, tip })
  const lane = (len, items, o = {}) => {
    const h = o.h || 10, x0 = v => Math.max(0, (v - 1) / len * VB), x1 = v => Math.min(VB, v / len * VB);
    const body = items.map(it => { const a = x0(it.a), b = x1(it.b ?? it.a), w = Math.max(b - a, it.b == null ? 3 : 2);
      return `<rect x="${(a - (it.b == null ? Math.max(0, (3 - (b - a)) / 2) : 0)).toFixed(1)}" y="${it.dot ? 2 : 0}" width="${w.toFixed(1)}" height="${it.dot ? h - 4 : h}"${it.col ? ` fill="${esc(it.col)}"` : ''} class="${esc(it.cls || '')}">${it.tip ? `<title>${esc(it.tip)}</title>` : ''}</rect>`; }).join('');
    return `<span class="fp-row"><b>${esc(o.label || '')}</b><svg viewBox="0 0 ${VB} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(o.label || '')}"><line x1="0" x2="${VB}" y1="${h / 2}" y2="${h / 2}" class="fp-base"/>${body}</svg></span>`;
  };
  const track = (len, lanes, key) => `<span class="fpic fp-track">${lanes.map(l => lane(len, l.items, l)).join('')}<span class="fp-axis"><b></b><span>1</span><span>${int(len)} aa</span></span>${key ? `<span class="fp-key">${key}</span>` : ''}</span>`;
  const bigN = pairs => `<span class="fpic fp-big">${pairs.filter(Boolean).map(([n, t]) => `<span><b>${esc(String(n))}</b> ${esc(t)}</span>`).join('')}</span>`;
  // bars: rows { label, v (0-1), ref (a tick, 0-1), text }
  const meters = rows => `<span class="fpic fp-meters">${rows.map(r => `<span class="fp-m"><i>${esc(r.label)}</i><span class="fp-bar"><u style="width:${(100 * Math.max(0, Math.min(1, r.v || 0))).toFixed(1)}%"></u>${r.ref != null ? `<s style="left:${(100 * r.ref).toFixed(1)}%"></s>` : ''}</span><b>${esc(r.text || '')}</b></span>`).join('')}</span>`;
  const pills = xs => `<span class="fpic fp-pills">${xs.map(x => `<span>${esc(x)}</span>`).join('')}</span>`;

  // ---- the registry: a builder says what a fold's picture is; the page puts it in the fold's header -----------------------
  function place(id) {
    const sm = document.querySelector(`details.pfold[id="${id}"] > summary`); if (!sm) return;
    const html = PICS[`${acc()}|${id}`], old = sm.querySelector('.fpic');
    if (!html) { old?.remove(); return; }
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const el = tmp.firstElementChild; if (!el) return;
    if (old) old.replaceWith(el); else sm.append(el);
  }
  function set(id, html) { PICS[`${acc()}|${id}`] = html || ''; place(id); }
  const SITES_LANE = (rec, col) => ({ label: 'Sites', items: rec.marks.map(m => ({ a: m[0], cls: 'fp-site', dot: true, col: col?.(m) })) });

  // ---- the pictures the page can draw from what it holds -------------------------------------------------------------
  function builtin() {
    const st = K.protState?.(); if (!st || !st.rec || !st.p) return;
    const { p, rec, tb, af, pdb } = st, len = p.len || (rec.seq || '').length || 1;
    // interaction evidence, site by site: each site coloured by its status
    const EV = PRO.card?.evidence;
    if (EV?.status && SPECS[EV.status] && K.map?.attrColour) {
      set('p-cc', track(len, [{ label: 'Sites', items: rec.marks.map(m => ({ a: m[0], dot: true, col: K.map.attrColour(EV.status, K.cols.markAttr(m, EV.status)), tip: `${st.siteName?.(m[0]) || m[0]}: ${K.sel?.valueLabel ? K.sel.valueLabel(EV.status, K.cols.markAttr(m, EV.status)) : ''}` })) }]));
    }
    // RNA and DNA: the runs bound in structures, the residues crosslinked in cells and the sites flagged (never a peptide or its extent)
    if (K.prnaModel && tb) {
      let M = null; try { M = K.prnaModel(p, rec, tb); } catch (e) { M = null; }
      if (M) {
        const lanes = Object.entries(M).filter(([, m]) => m.any).map(([k, m]) => {
          const items = [...m.reg.map(r => ({ a: r.a, b: r.b, cls: `fp-k-${k}` })), ...m.xl.map(q => ({ a: q, cls: `fp-k-${k} fp-pt`, dot: true })), ...m.flags.map(([q]) => ({ a: q, cls: `fp-k-${k} fp-soft`, dot: true })), ...[...m.direct.keys()].map(q => ({ a: q, cls: `fp-k-${k} fp-pt`, dot: true }))];
          return { label: K.prnaWord ? K.prnaWord(k) : k.toUpperCase(), items };
        });
        set('p-na', lanes.length ? track(len, [...lanes, SITES_LANE(rec)]) : '');
      }
    }
    // regions: a lane per kind of region
    const kinds = (D.tracks || []).filter(t => rec.units.some(u => u[0] === t.kind)).slice(0, 3);
    if (kinds.length) set('p-regions', track(len, [...kinds.map(t => ({ label: String(t.title || t.kind).replace(/ regions?$/i, '').slice(0, 10), items: rec.units.filter(u => u[0] === t.kind).map(u => ({ a: u[1], b: u[2], cls: `fp-u fp-u${(D.tracks || []).indexOf(t) % 4}`, tip: u[3] || '' })) })), SITES_LANE(rec)]));
    // the sequence: the share of its residues that are marked
    if (p.cand) set('p-seq', meters([{ label: cap0(W.marks), v: rec.marks.length / p.cand, text: `${int(rec.marks.length)} of ${int(p.cand)}` }]));
    // the structure lanes: AlphaFold confidence and the PDB runs (the 3D tab; the count in its label)
    const t3 = [];
    if (af?.plddt?.length === len) {
      const runs = []; af.plddt.forEach((v, i) => { const b = v > 90 ? 0 : v > 70 ? 1 : v > 50 ? 2 : 3, l = runs[runs.length - 1]; if (l && l.b === b && l.z === i) l.z = i + 1; else runs.push({ b, a: i + 1, z: i + 1 }); });
      t3.push({ label: 'pLDDT', items: runs.map(r => ({ a: r.a, b: r.z, col: ['#0053d6', '#65cbf3', '#ffdb13', '#ff7d45'][r.b] })) });
    }
    tabCounts(st);
  }
  const cap0 = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
  // the tab labels carry their counts
  function tabCounts(st) {
    const { rec, tb } = st, set1 = (id, n) => { const b = document.querySelector(`[data-ptab="${id}"]`); if (!b) return; let s = b.querySelector('.pt-n'); if (!n) { s?.remove(); return; } if (!s) { s = document.createElement('span'); s.className = 'pt-n'; b.append(s); } s.textContent = n; };
    set1('p-sites', int(rec.marks.length));
    const pt = PRO.card?.writer?.partners?.table, n = pt && tb && K.card.has(pt) ? K.card.rows(tb, pt).length : 0;
    set1('p-ix', n ? int(n) : '');
  }

  // ---- the headings: the folds of "More about" in labelled groups --------------------------------------------------------
  // html is the folds' markup in the page's order; each fold goes under the heading that lists it, the rest follow the last heading
  K.pfoldsLayout = html => {
    const HS = PRO.headings || [];
    if (!HS.length) return html;
    const parts = html.split(/(?=<details class="pfold" id=")/), lead = /^<details class="pfold" id=/.test(parts[0]) ? '' : parts.shift();
    const idOf = h => (/^<details class="pfold" id="([^"]+)"/.exec(h) || [])[1];
    const at = id => { const k = HS.findIndex(g => (g.folds || []).includes(id)); return k < 0 ? HS.length - 1 : k; };
    const order = id => { const g = HS[at(id)]; const i = (g.folds || []).indexOf(id); return i < 0 ? 999 : i; };
    const sorted = parts.map((h, k) => ({ h, id: idOf(h), k })).sort((a, b) => at(a.id) - at(b.id) || order(a.id) - order(b.id) || a.k - b.k);
    return lead + HS.map((g, n) => {
      const xs = sorted.filter(x => at(x.id) === n); if (!xs.length) return '';
      return `<div class="pheading" data-pheading="${esc(g.id || String(n))}"><h3>${esc(g.title)}</h3>${g.switch ? ctxSwitch() : ''}</div>${xs.map(x => x.h).join('')}`;
    }).join('');
  };

  // ---- the context switch: what is recorded for the protein, or the dataset's own tests of the same sets -----------------------
  const CTX = { mode: 'protein' };
  const ctxSwitch = () => `<span class="seg ctx-seg" role="group" aria-label="Context cards"><button type="button" data-pctx="protein" aria-pressed="${CTX.mode === 'protein'}">This protein</button><button type="button" data-pctx="dataset" aria-pressed="${CTX.mode === 'dataset'}">Dataset context</button></span>` +
    `<span class="muted small ctx-note">${CTX.mode === 'protein' ? 'Locations, condensates and diseases show what is recorded for this protein.' : 'The same sets, as the dataset’s tests rate them across all proteins.'}</span>`;
  // for the protein's own sets of an analysis: each with the dataset's test of it
  function datasetPanel(p, aids) {
    const out = [], sd = K.sel?.data();
    for (const aid of aids) {
      const ps = sd?.protein_sets?.[aid]; if (!ps) continue;
      const names = ps.sets.map(([s]) => s).filter(s => K.sel.setHas(aid, s, p.i));
      const lab = s => (D.analyses.find(a => a.id === aid)?.labels || {})[s] || s;
      const rows = names.map(s => { const rs = D.rows.filter(r => r.analysis === aid && r.category === s && r.dir === 'more'); const r = rs.find(x => x.method === 'enricher') || rs.find(x => x.method === 'mantel_haenszel') || rs[0]; return { s, r }; })
        .filter(x => x.r).sort((a, b) => b.r.eff - a.r.eff).slice(0, 8);
      const title = (D.analyses.find(a => a.id === aid) || {}).title || aid;
      out.push(`<div class="ctx-panel"><h4>${esc(title)}</h4>` + (rows.length ? `<ul class="ctx-list">${rows.map(({ s, r }) => `<li><b>${esc(lab(s))}</b> <span class="muted">${esc(K.fxn(r.eff))}× over-represented among the ${esc(W.marked || 'marked')} proteins, q ${esc(K.fq(r.q))}</span></li>`).join('')}</ul>` : `<p class="muted small">None of this protein’s ${names.length ? int(names.length) + ' ' : ''}sets is over-represented in the dataset.</p>`) + '</div>');
    }
    return out.join('');
  }
  K.pfoldsCtx = () => CTX.mode;
  K.clicks.push(['[data-pctx]', el => { CTX.mode = el.dataset.pctx; K.render(); }]);
  function ctxPanels() {
    const st = K.protState?.(); if (!st?.p) return;
    document.querySelectorAll('.ctx-dataset').forEach(e => e.remove());
    document.querySelector('#view')?.classList.toggle('ctx-dataset-on', CTX.mode === 'dataset');
    if (CTX.mode !== 'dataset') return;
    const cfg = PRO.context || {};
    for (const [id, aids] of Object.entries(cfg)) {
      const body = document.querySelector(`details.pfold[id="${id}"] > .pfold-body`); if (!body) continue;
      const d = document.createElement('div'); d.className = 'ctx-dataset'; d.innerHTML = datasetPanel(st.p, aids) || '<p class="muted small">No dataset-wide test of these sets is available yet.</p>'; body.prepend(d);
    }
  }

  K.pfolds = { set, track, lane, bigN, meters, pills, refresh: () => { builtin(); ctxPanels(); } };
  (K.afterRender ||= []).push(() => { if (!document.querySelector('.pfold')) return; builtin(); ctxPanels(); Object.keys(PICS).filter(k => k.startsWith(acc() + '|')).forEach(k => place(k.split('|')[1])); });
});
