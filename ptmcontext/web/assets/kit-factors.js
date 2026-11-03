/* Several factors at once (a conditional_logit analysis, ptmcontext/model.py): one conditional logistic regression with a
   stratum for each protein, the marked residues against the other candidate residues of their proteins. The tile lists
   the factors with the odds ratio each has taking all of them together; the question's page draws them as a forest
   plot, beside the same factor alone, and tabulates both. The rows are the statistics table's (method
   conditional_logit; stratum adjusted or alone). The model is fitted for the whole dataset only: a selection is not
   refitted in the browser, and the tile and page say so. The words are the site file's. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, A, esc, int } = K;
  const MODELS = D.models || {};
  const IDS = Object.keys(MODELS).filter(id => A[id]);
  if (!IDS.length) return;
  const Z95 = 1.959963984540054;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fxo = v => (v == null ? '–' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  const fp = p => (p == null ? '–' : p === 0 ? '< 1e-300' : p < 1e-3 ? p.toExponential(1) : p.toFixed(3));

  // ---- the model's rows, by factor, strongest evidence first ---------------------------------------------------------
  const zOf = r => (r && r.or > 0 && r.lo > 0 && r.hi > 0 ? Math.log(r.or) / ((Math.log(r.hi) - Math.log(r.lo)) / (2 * Z95)) : null);
  function factors(id) {
    const M = MODELS[id], rows = s => D.rows.filter(r => r.analysis === id && r.method === 'conditional_logit' && r.stratum === s);
    const adj = Object.fromEntries(rows('adjusted').map(r => [r.category, r])), alone = Object.fromEntries(rows('alone').map(r => [r.category, r]));
    return M.covariates.map(c => ({ ...c, adj: adj[c.name], alone: alone[c.name], z: zOf(adj[c.name]) }))
      .sort((x, y) => Math.abs(y.z ?? 0) - Math.abs(x.z ?? 0));
  }
  const reading = r => (!r || r.or == null ? 'not estimated' : r.dir === 'more' ? 'more often' : r.dir === 'less' ? 'less often' : r.q != null && r.q <= K.PADJ ? 'about the same (within 1.1×)' : 'no clear difference');
  const arrow = r => (r.dir === 'more' ? '▲ ' : r.dir === 'less' ? '▼ ' : '');
  const unitOf = f => (f.numeric ? ` for each ${f.per === 1 ? '' : f.per + ' '}unit up` : '');

  // ---- the tile -----------------------------------------------------------------------------------------------------
  // a track from 1/8 to 8 on a log scale, the 1× line in the middle, the interval as a bar and the estimate as a dot
  const LO = Math.log2(1 / 8), HI = Math.log2(8);
  const pos = v => 100 * (Math.min(HI, Math.max(LO, Math.log2(Math.max(v, 1e-9)))) - LO) / (HI - LO);
  function mini(r) {
    if (!r || r.or == null) return '<span class="fm-track"><i class="fm-one"></i></span>';
    const a = pos(r.lo ?? r.or), b = pos(r.hi ?? r.or);
    return `<span class="fm-track ${r.dir}"><i class="fm-one"></i><i class="fm-ci" style="left:${a.toFixed(1)}%;width:${Math.max(0.5, b - a).toFixed(1)}%"></i><i class="fm-dot" style="left:${pos(r.or).toFixed(1)}%"></i></span>`;
  }
  const info = id => {
    const f = MODELS[id].fit || {};
    return `${int(f.strata || 0)} proteins with a ${W.mark} and another ${W.residue} · ${int(f.marks || 0)} ${W.marks}`;
  };
  function tile(id, card) {
    const a = A[id], fs = factors(id);
    return `<article class="tile fm-tile${card.wide ? ' wide' : ''}" id="tile-${esc(id)}" data-tile="${esc(id)}" data-fid="${esc(id)}" tabindex="0"><header><h3>${esc(card.title || a.title)}${a.new && D.run.parity ? ' <span class="newtag" title="Not in the published release: a question this rebuild adds">new</span>' : ''}</h3>` +
      `${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'fexp', a.title, id).replace('class="exp"', 'class="exp texp"')}${K.detailsLink(id)}</header>` +
      `<p class="tstat">Odds ratio, taking all factors together</p>` +
      `<div class="fm-rows">${fs.map(f => `<div class="fm-row" data-ftip="${esc(f.name)}" data-fid="${esc(id)}"><span class="lab">${esc(f.label)}</span>${mini(f.adj)}` +
        `<span class="val ${f.adj ? f.adj.dir : ''}">${f.adj && f.adj.or != null ? esc(arrow(f.adj) + K.fx(f.adj.or)) : '–'}</span></div>`).join('')}</div>` +
      `<div class="fm-axis"><span></span><span class="fm-ax"><i>1/8×</i><i>1×</i><i>8×</i></span><span></span></div>` +
      `<p class="tfoot">${esc(info(id))}. The strongest evidence is listed first.</p>` +
      (K.selOn() ? `<p class="twhole"><span>Whole dataset</span> the model is fitted once, on every ${esc(W.mark)}; it is not refitted for your selection</p>` : '') + '</article>';
  }

  // ---- the forest plot: all factors together (filled) and each alone (hollow) -----------------------------------------
  const pal = ex => (ex ? { ink: K.PAL.ink, muted: K.PAL.muted, line: K.PAL.line, strong: '#c7d4d9', bg: K.PAL.bg, more: K.PAL.more, less: K.PAL.less, same: K.PAL.same }
    : { ink: css('--ink'), muted: css('--muted'), line: css('--line'), strong: css('--line-strong'), bg: css('--surface'), more: css('--more'), less: css('--less'), same: css('--same') });
  const txt = (P, x, y, t, o = {}) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 12}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill || P.ink}">${esc(t)}</text>`;
  const FW = 760, FL = 250, FR = 24, RH = 40;
  function forest(id, ex) {
    const P = pal(ex), fs = factors(id), vals = fs.flatMap(f => [f.adj, f.alone]).filter(r => r && r.or != null).flatMap(r => [r.lo ?? r.or, r.hi ?? r.or, r.or]);
    const lo = Math.min(-1, Math.floor(Math.log2(Math.max(1 / 16, Math.min(...vals, 1))))), hi = Math.max(1, Math.ceil(Math.log2(Math.min(16, Math.max(...vals, 1)))));
    const X = v => FL + (Math.min(hi, Math.max(lo, Math.log2(Math.max(v, 1e-9)))) - lo) / (hi - lo) * (FW - FL - FR);
    const parts = [], top = 30;
    for (let t = lo; t <= hi; t++) {
      parts.push(`<line x1="${X(2 ** t).toFixed(1)}" x2="${X(2 ** t).toFixed(1)}" y1="${top - 6}" y2="${top + fs.length * RH}" stroke="${t === 0 ? P.strong : P.line}" stroke-width="${t === 0 ? 1.6 : 0.7}"/>`,
        txt(P, X(2 ** t), top - 12, t >= 0 ? `${2 ** t}×` : `1/${2 ** -t}×`, { size: 10.5, anchor: 'middle', fill: P.muted }));
    }
    const mark = (r, y, filled, shift) => {
      if (!r || r.or == null) return '';
      const c = r.dir === 'more' ? P.more : r.dir === 'less' ? P.less : P.same, cy = y + shift;
      return `<line x1="${X(r.lo ?? r.or).toFixed(1)}" x2="${X(r.hi ?? r.or).toFixed(1)}" y1="${cy}" y2="${cy}" stroke="${c}" stroke-width="${filled ? 2.2 : 1.4}"/>` +
        `<circle cx="${X(r.or).toFixed(1)}" cy="${cy}" r="${filled ? 5 : 4}" fill="${filled && (r.dir === 'more' || r.dir === 'less') ? c : P.bg}" stroke="${c}" stroke-width="1.6"/>`;
    };
    fs.forEach((f, k) => {
      const y = top + k * RH + RH / 2;
      parts.push(txt(P, FL - 12, y + 4, f.label, { anchor: 'end', size: 12.5 }), mark(f.alone, y, false, 9), mark(f.adj, y, true, -5));
    });
    return { body: parts.join(''), H: top + fs.length * RH + 24, fs };
  }
  const legend = [['#b42318', '#b42318', 'more often (q ≤ 0.05, ≥ 1.1×)'], ['#334155', '#334155', 'less often'], ['#ffffff', '#8a96a0', 'no clear difference']];
  const noteOf = id => `Each odds ratio compares a ${W.mark} with the other ${W.residues} of the same protein (one stratum per protein, ${info(id)}). The filled marks are the factor's odds ratio taking all the factors together, so the others are held fixed; the hollow marks are the same factor in a model by itself. Bars are 95% confidence intervals (Wald). Factors that go together (a motif that sits in disordered regions, say) share an effect when taken alone and split it when taken together. Listed by the strength of the evidence taking all together (the size of the estimate over its standard error). A conditional logistic regression (Breslow & Day 1980), the several-factor form of the Mantel–Haenszel test; an association, not a cause.`;
  function figure(id) {
    const f = forest(id, true), a = A[id];
    return K.figureFrame({ title: a.title, sub: `${a.question} Odds ratio of each factor; ${info(id)}`, legend, body: f.body, bodyH: f.H, W: FW, note: noteOf(id), extra: { figure_kind: 'factors', analysis: id } });
  }
  function tsv(id) {
    const a = A[id], fs = factors(id), c = r => (r && r.or != null ? [r.or, r.lo, r.hi, r.q].map(v => (v == null ? '' : +v.toPrecision(6))) : ['', '', '', '']);
    return K.preamble(a.title, `${a.question} A conditional logistic regression, one stratum per protein: ${info(id)}. Whole dataset. ${noteOf(id)}`) +
      ['factor', 'definition', 'per_unit', 'together_odds_ratio', 'together_ci_low', 'together_ci_high', 'together_q', 'alone_odds_ratio', 'alone_ci_low', 'alone_ci_high', 'alone_q', 'together_z'].join('\t') + '\n' +
      fs.map(f => [f.label, f.help, f.numeric ? f.per : '', ...c(f.adj), ...c(f.alone), f.z == null ? '' : +f.z.toFixed(3)].join('\t')).join('\n') + '\n';
  }

  // ---- the page -----------------------------------------------------------------------------------------------------
  function page(id, card) {
    const a = A[id], M = MODELS[id], f = forest(id, false), fit = M.fit || {};
    const cell = r => (r && r.or != null ? `<b>${esc(K.fx(r.or))}</b> <span class="muted small">(${esc(K.fx(r.lo))} to ${esc(K.fx(r.hi))}), q ${esc(K.fq(r.q))}</span>` : '<span class="muted">not estimated</span>');
    const rows = f.fs.map(x => `<tr><td class="wrapok"><b>${esc(x.label)}</b><br><span class="muted small">${esc(x.help)}</span></td>` +
      `<td>${cell(x.adj)}<br><span class="fm-read ${x.adj ? x.adj.dir : ''}">${esc(reading(x.adj))}${esc(unitOf(x))}</span></td><td>${cell(x.alone)}<br><span class="fm-read ${x.alone ? x.alone.dir : ''}">${esc(reading(x.alone))}</span></td>` +
      `<td class="num">${x.adj && x.adj.b != null ? `${int(x.adj.a)} of ${int(x.adj.a + x.adj.b)}<br><span class="muted small">others ${int(x.adj.c)} of ${int(x.adj.c + x.adj.d)}</span>` : `${int(x.adj?.a || 0)} ${esc(W.marks)}<br><span class="muted small">${int(x.adj?.c || 0)} others</span>`}</td></tr>`).join('');
    const drop = (fit.dropped || []).length ? `<p class="note small muted">Left out because it does not vary: ${esc(fit.dropped.join(', '))}.</p>` : '';
    return `<div class="card-head"><div><h3>${esc(card.title || a.title)}</h3><p class="sub">${esc(a.sub || '')}</p></div>${K.expBar(['pdf', 'svg', 'png', 'tsv'], 'fexp', a.title, id)}</div>` +
      `<div class="fm-legend"><span class="fm-key more"></span>more often <span class="fm-key less"></span>less often <span class="fm-key same"></span>no clear difference · filled: all factors together · hollow: the factor alone</div>` +
      `<div class="fm-plot"><svg viewBox="0 0 ${FW} ${f.H}" class="fm-svg" role="img" aria-label="${esc(a.title)}: odds ratio of each factor, together and alone">${f.body}</svg></div>` +
      `<div class="tbl-card"><table class="tbl fm-tbl"><thead><tr><th>Factor</th><th>Taking all factors together</th><th>On its own</th><th class="num">${esc(W.marks)} with it</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      `<p class="note small muted">${esc(noteOf(id))}</p>${drop}` +
      `<p class="note small muted">${esc(info(id))}${fit.lr_p != null ? `. The model as a whole against none of the factors: likelihood-ratio p ${esc(fp(fit.lr_p))}` : ''}.` +
      ` Whole dataset: this model is fitted once, on every ${esc(W.mark)}, and is not refitted for a selection${K.selOn() ? ' (the table above is the whole dataset)' : ''}.</p>`;
  }

  for (const id of IDS) {
    A[id].tile = card => tile(id, card);
    K.questions[id] = { tile: card => tile(id, card), page: card => `<div class="fm-page" data-fid="${esc(id)}">${page(id, card)}</div>` };
  }
  K.tips.push(['[data-ftip]', el => { const id = el.dataset.fid, f = factors(id).find(x => x.name === el.dataset.ftip); return f ? tipHtml(f) : ''; }]);
  function tipHtml(f) {
    return `<b>${esc(f.label)}</b>${f.help ? `<br>${esc(f.help)}` : ''}<br>Taking all factors together: ${f.adj && f.adj.or != null ? `${esc(K.fx(f.adj.or))}${esc(unitOf(f))} (95% CI ${esc(K.fx(f.adj.lo))} to ${esc(K.fx(f.adj.hi))}), q ${esc(K.fq(f.adj.q))}: ${esc(reading(f.adj))}` : 'not estimated'}` +
      `<br>On its own: ${f.alone && f.alone.or != null ? `${esc(K.fx(f.alone.or))}, q ${esc(K.fq(f.alone.q))}` : 'not estimated'}`;
  }
  const name = id => `${D.site.id}_${id}`;
  K.clicks.push(['[data-fexp]', el => { const id = el.closest('[data-fid]')?.dataset.fid || IDS[0]; K.exportFigure(el.dataset.fexp, () => figure(id), name(id), el, () => tsv(id)); }]);
  document.addEventListener('keydown', e => {
    const el = e.target.closest?.('.fm-tile');
    if (el && (e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); location.hash = K.link('overview', el.dataset.tile); }
  });

  // ---- the look -----------------------------------------------------------------------------------------------------
  const st = document.createElement('style');
  st.id = 'kit-factors-css';
  st.textContent = `.fm-rows{display:grid;gap:.3rem;margin:.15rem 0 .1rem}
.fm-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 3.6rem;gap:.55rem;align-items:center;font-size:.86rem;line-height:1.25}
.fm-row .lab{overflow-wrap:anywhere}.fm-row .val{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.fm-row .val.more{color:var(--more);font-weight:600}.fm-row .val.less{color:var(--less);font-weight:600}
.fm-track{position:relative;display:block;height:18px}.fm-track .fm-one{position:absolute;left:50%;top:0;bottom:0;width:0;border-left:1.5px solid var(--line-strong)}
.fm-track .fm-ci{position:absolute;top:50%;height:2px;margin-top:-1px;background:var(--same)}
.fm-track .fm-dot{position:absolute;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;border:2px solid var(--same);background:var(--surface);box-sizing:border-box}
.fm-track.more .fm-ci{background:var(--more)}.fm-track.more .fm-dot{border-color:var(--more);background:var(--more)}
.fm-track.less .fm-ci{background:var(--less)}.fm-track.less .fm-dot{border-color:var(--less);background:var(--less)}
.fm-axis{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 3.6rem;font-size:.72rem;color:var(--muted);margin-top:.1rem}
.fm-ax{display:flex;justify-content:space-between}.fm-ax i{font-style:normal}
.fm-plot{overflow-x:auto}.fm-svg{width:100%;min-width:560px;height:auto;display:block}
.fm-legend{display:flex;flex-wrap:wrap;gap:.3rem .6rem;align-items:center;font-size:.8rem;color:var(--muted);margin:.4rem 0}
.fm-key{display:inline-block;width:.7rem;height:.7rem;border-radius:50%;border:2px solid var(--same);background:var(--surface)}
.fm-key.more{border-color:var(--more);background:var(--more)}.fm-key.less{border-color:var(--less);background:var(--less)}
.fm-read{font-size:.78rem;color:var(--muted)}.fm-read.more{color:var(--more)}.fm-read.less{color:var(--less)}
@media (max-width:520px){.fm-row{grid-template-columns:minmax(0,1fr) minmax(0,.8fr) 3.3rem}}`;
  document.head.appendChild(st);
});
