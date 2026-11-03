/* The entry pictures: where the marks fall (one bar), the strongest findings (small bars, each linking to its question)
   and one example protein drawn as a map. All from the site's own statistics, chosen in ptmcontext/web/glance.py
   (D.glance) and the site file (website.start: share, findings, protein). Offers K.glance.html() for the start panel
   and fills the protein map after the page is drawn. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int } = K;
  const G = D.glance || {};
  const TR = Object.fromEntries((D.tracks || []).map(t => [t.kind, t]));
  const pct = (n, t) => { const v = 100 * n / t; return v >= 10 ? Math.round(v) : v >= 1 ? +v.toFixed(1) : '< 1'; };
  const fx = e => { const v = e >= 1 ? e : 1 / e; return (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '×'; };
  const qx = q => (q == null ? '' : q < 1e-300 ? 'q < 1e-300' : q >= 0.001 ? 'q ' + (+q.toPrecision(1)) : 'q ' + q.toExponential(0).replace('e-', 'e−'));
  const SPEC = D.start || {};

  function shareHtml() {
    const s = G.share; if (!s || !s.parts?.length) return '';
    const top = s.parts.filter(p => p.slot).sort((a, b) => b.n - a.n)[0] || s.parts[0];
    return `<div class="gl-share"><p class="gl-lead"><b class="gl-big">${esc(String(pct(top.n, s.total)))}%</b> <span>${esc(top.label)}</span></p>` +
      `<div class="gl-bar" role="img" aria-label="${esc(s.parts.map(p => `${p.label} ${pct(p.n, s.total)}%`).join(', '))}">` +
      s.parts.map(p => `<i class="gl-seg s${p.slot}" style="flex:${p.n} 1 0"></i>`).join('') + '</div>' +
      `<ul class="gl-legend">${s.parts.map(p => `<li><i class="gl-sw s${p.slot}"></i>${esc(p.label)} <b>${esc(String(pct(p.n, s.total)))}%</b></li>`).join('')}</ul></div>`;
  }
  function findingsHtml() {
    const f = (G.findings || []).filter(x => D.analyses.some(a => a.id === x.analysis)); if (!f.length) return '';
    return `<ol class="gl-finds">${f.map(x => {
      const w = Math.min(1, Math.abs(Math.log2(x.eff)) / 4) * 50;
      return `<li><a href="${esc(K.link('overview', x.analysis))}" title="${esc(x.title)}: ${esc(x.label)}, ${fx(x.eff)} ${x.dir === 'more' ? 'more' : 'less'} often (${esc(qx(x.q))}). Open the question.">` +
        `<span class="gl-name">${esc(x.label)}</span><span class="gl-axis" aria-hidden="true"><i class="gl-fill ${x.dir}" style="${x.dir === 'more' ? 'left:50%' : 'right:50%'};width:${w}%"></i></span>` +
        `<span class="gl-val ${x.dir}">${fx(x.eff)} ${x.dir}</span><span class="gl-q">${esc(qx(x.q))}</span></a></li>`; }).join('')}</ol>`;
  }
  // the example protein: the site file's (gene or accession), else the one with the most marks
  const example = () => { const P = D.proteins || [], key = String(SPEC.protein || '').toUpperCase();
    return (key && P.find(p => p[0].toUpperCase() === key || (p[1] || '').toUpperCase() === key)) || P.slice().sort((a, b) => b[4] - a[4])[0]; };
  function proteinHtml() {
    const p = example(); if (!p || !K.loadProtein || !K.views?.protein) return '';
    return `<div class="gl-prot"><p class="gl-lead"><a href="${esc(K.link('protein', p[0]))}"><b>${esc(p[1] || p[0])}</b></a> <span class="muted">${int(p[3])} aa, ${int(p[4])} ${esc(W.marks)}</span></p>` +
      `<svg class="gl-map" viewBox="0 0 400 44" data-gl-acc="${esc(p[0])}" role="img" aria-label="${esc(p[1] || p[0])} from end to end"></svg>` +
      `<ul class="gl-legend"><li><i class="gl-sw s1"></i>disordered</li><li><i class="gl-sw dom"></i>domain</li><li><i class="gl-sw mk"></i>${esc(W.mark)}</li></ul></div>`;
  }
  function drawMap(el, rec, len) {
    const X = x => 6 + (x - 0.5) / len * 388, y0 = 28, out = [`<line x1="6" x2="394" y1="${y0}" y2="${y0}" stroke="var(--line-strong)" stroke-width="2"/>`];
    (rec.units || []).forEach(([k, s, e, lab]) => { const t = TR[k]; if (!t || t.style === 'segments') return;
      const w = Math.max(1.5, X(e + 0.5) - X(s - 0.5)).toFixed(1);
      out.push(t.style === 'disorder' ? `<rect x="${X(s - 0.5).toFixed(1)}" y="${y0 - 3}" width="${w}" height="6" rx="2" class="gl-dis"/>`
        : `<rect x="${X(s - 0.5).toFixed(1)}" y="${y0 - 7}" width="${w}" height="14" rx="3" class="gl-dom"><title>${esc(lab || t.title)}</title></rect>`); });
    (rec.marks || []).forEach(m => out.push(`<line x1="${X(m[0]).toFixed(1)}" x2="${X(m[0]).toFixed(1)}" y1="${y0 - 9}" y2="${y0 - 20}" class="gl-mk"/><circle cx="${X(m[0]).toFixed(1)}" cy="${y0 - 21}" r="2.6" class="gl-mkc"/>`));
    el.innerHTML = out.join('');
  }
  (K.afterRender ||= []).push(() => {
    const el = document.querySelector('svg[data-gl-acc]'); if (!el || el.dataset.drawn) return;
    const p = (D.proteins || []).find(x => x[0] === el.dataset.glAcc); el.dataset.drawn = '1';
    K.loadProtein(el.dataset.glAcc).then(rec => { if (el.isConnected) drawMap(el, rec, p[3] || 1); }, () => {});
  });
  K.glance = { html: () => { const a = shareHtml(), b = findingsHtml(), c = proteinHtml();
    return a || b || c ? `<div class="gl"><div class="gl-col">${a}${b}</div>${c}</div>` : ''; } };
});
