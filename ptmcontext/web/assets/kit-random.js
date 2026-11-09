/* Example proteins at the end of the Overview: a closed fold (the same card and fold as the other sections) of a few
   proteins drawn at random, each end to end as one row in the protein page's map style (its domains, disordered regions
   and marks), with a small "Draw three others" link. Configured in website.overview.random_maps: {n: 3, title: "Example
   proteins", min_marks: 3, open: false, enabled: true}. Absent or enabled: false: nothing. Shown on the Overview
   without a selection, last. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, W, esc, int } = K;
  const RM = D.overview?.random_maps;
  if (!RM || RM.enabled === false || !D.proteins?.length || !K.rowMap) return;
  const N = RM.n || 3, TITLE = RM.title || 'Example proteins', MIN = RM.min_marks ?? 3;
  const pool = D.proteins.map((p, i) => i).filter(i => D.proteins[i][4] >= MIN);
  let pick = null;
  const draw = () => { const a = pool.slice(), out = []; while (out.length < N && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); pick = out; };
  const recs = {};
  (K.overviewBlocks ||= []).push(() => {
    if (!pool.length) return '';
    if (!pick) draw();
    const rows = pick.map(pi => { const p = D.proteins[pi];
        return (`<div class="rand-row"><a href="${esc(K.link('protein', p[0]))}"><b>${esc(p[1] || p[0])}</b> <span ` +
            `class="muted">${esc(p[2] || '')}</span></a><span class="muted small">${int(p[4])} ${esc(W.marks)} · ${int(p[3])} aa</span>` +
            `<svg class="rand-map" data-rm="${pi}" role="img" aria-label="${esc(p[1] || p[0])} from end to end">` +
            `</svg></div>`); }).join('');
    return K.fold('sec-random-proteins', esc(TITLE), `${N} proteins`,
      (`<p class="rand-tools"><button type="button" class="linkish small" data-rm-shuffle>Draw ${N === 3 ? 'three' : N} others</button>` +
          `</p><div class="rand-rows">${rows}</div>`), RM.open === true);
  });
  (K.overviewSections ||= []).push(() => (pool.length ? [['sec-random-proteins', TITLE, 1]] : []));
  K.clicks.push(['[data-rm-shuffle]', () => { draw(); K.render(); }]);
  const drawAll = () => {
    document.querySelectorAll('svg[data-rm]').forEach(el => {
      if (!el.closest('details')?.open) return;      // a closed fold draws nothing (and fetches nothing)
      const pi = +el.dataset.rm, acc = D.proteins[pi][0], w = Math.max(320, Math.round(el.getBoundingClientRect().width) || 700);
      el.setAttribute('viewBox', `0 0 ${w} 44`);
      const put = rec => { el.innerHTML = K.rowMap(pi, rec, w, false, true); };
      if (recs[acc]) put(recs[acc]); else { put(null); K.loadProtein(acc).then(rec => { recs[acc] = rec; if (el.isConnected) put(rec); }, () => {}); }
    });
  };
  (K.afterRender ||= []).push(drawAll);
  document.addEventListener('toggle', e => { if (e.target.id === 'sec-random-proteins' && e.target.open) drawAll(); }, true);
});
