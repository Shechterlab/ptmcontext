/* The classic Overview's tile rows, in the cards layout's look: each tile has its own ticked axis (always 1× and at least
   one more label, labels never overlapping, also on a phone), a thin 95% interval bar, the value with a q dot, the number
   of marks or proteins in gray, a hollow dot where the difference is not significant, and a ring for the whole dataset's
   value where a selection was tested again. Also the one-line answer under a tile's title. Pure drawing: the rows and
   their classes come from the kit (kit.js tileState); nothing is computed here. The twin of the cards home's rows
   (kit-front.js), which reads the same classes (kit.css, .fr-row). A module of the site kit: K.tilekit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { W, esc, int } = K;
  const narrow = () => matchMedia('(max-width: 700px)').matches;
  const fmtT = t => (t < 1 ? (Number.isInteger(+(1 / t).toFixed(3)) ? '1/' + Math.round(1 / t) : String(+t.toFixed(2))) : String(+t.toFixed(2)));
  const NICE = [1 / 64, 1 / 32, 1 / 16, 1 / 10, 1 / 8, 1 / 5, 1 / 4, 1 / 3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 32, 64];
  // one axis for a tile: its own values (with their intervals and the whole dataset's), a log scale, labels about 36 px apart
  function axisOf(vals, min = 1.0) {
    const v = vals.filter(x => x > 0 && x < 1e100); v.push(1);
    let a = Math.log2(Math.max(1 / 64, Math.min(...v))) - 0.1, b = Math.log2(Math.min(64, Math.max(...v))) + 0.1;
    if (b - a < min) { const mid = (a + b) / 2; a = mid - min / 2; b = mid + min / 2; }
    const lo = 2 ** a, hi = 2 ** b, L = x => (Math.log2(Math.min(hi, Math.max(lo, x))) - a) / (b - a);
    const gap = 0.3, ticks = [1];           // labels of five characters, 40 px apart on the narrowest track
    NICE.filter(t => t >= lo && t <= hi && t !== 1).sort((p, q) => Math.abs(Math.log2(p)) - Math.abs(Math.log2(q))).forEach(t => { if (ticks.every(u => Math.abs(L(t) - L(u)) >= gap)) ticks.push(t); });
    if (ticks.length < 2) { const far = NICE.filter(t => t >= lo && t <= hi && t !== 1).sort((p, q) => Math.abs(L(q) - L(1)) - Math.abs(L(p) - L(1)))[0]; if (far) ticks.push(far); }
    return { L, ticks: ticks.sort((p, q) => p - q), lo, hi };
  }
  const PX = f => (3 + 94 * f).toFixed(1);                     // the track keeps 3% at each end, so a dot at the end is whole
  // nlab: what the number at the end of each row counts ("proteins", or the marks), said above it
  const axisHtml = (ax, nlab) => `<div class="fr-ax" aria-hidden="true"><span class="tk">${ax.ticks.map(t => `<i${t === 1 ? ' class="one"' : ''} style="left:${PX(ax.L(t))}%">${fmtT(t)}×</i>`).join('')}</span>${nlab ? `<span class="fr-nh">${esc(nlab)}</span>` : ''}</div>`;
  const fin = v => (v != null && Number.isFinite(v) ? Math.min(v, 1e3) : null);
  // x: { label, v, lo: [low, high] | null, q, dir, n, wv, desc, absent, measure }; attrs: the row's own attributes (its click, its hover)
  function rowHtml(x, ax, attrs = '', cls = '') {
    // the selection's own class: its name and a pill, no bar, fold or count
    if (x.mine) return `<div class="fr-row tile-row pick mine${cls ? ' ' + cls : ''}"${attrs}><span class="fr-lab"><span>${esc(x.label)}</span></span><span class="fr-own"><span class="sel-pill">Your selection</span></span></div>`;
    const v = fin(x.v), x1 = PX(ax.L(1)), x2 = v != null ? PX(ax.L(v)) : null;
    const dir = x.absent ? 'ns' : x.dir || 'ns';
    const grid = ax.ticks.filter(t => t !== 1).map(t => `<line class="gl" x1="${PX(ax.L(t))}%" x2="${PX(ax.L(t))}%" y1="0" y2="100%"/>`).join('');
    const cl = b => PX(ax.L(Math.min(64, Math.max(b, 1 / 64))));
    const ci = x.lo ? `<line class="ci ${dir}" x1="${cl(x.lo[0])}%" x2="${cl(x.lo[1])}%" y1="50%" y2="50%"/>` +
      x.lo.map(b => `<line class="cap ${dir}" x1="${cl(b)}%" x2="${cl(b)}%" y1="32%" y2="68%"/>`).join('') : '';
    const ghost = x.wv != null && Number.isFinite(x.wv) ? `<circle class="whole" cx="${PX(ax.L(x.wv))}%" cy="50%" r="4"/>` : '';
    const track = `<svg class="fr-track" aria-hidden="true">${grid}<line class="one" x1="${x1}%" x2="${x1}%" y1="0" y2="100%"/>` +
      (x2 == null ? '' : `<line class="stem ${dir}" x1="${x1}%" x2="${x2}%" y1="50%" y2="50%"/>`) + ci + ghost +
      (x2 == null ? '' : `<circle class="dot ${dir}${x.desc ? ' desc' : ''}" cx="${x2}%" cy="50%" r="4.5"/>`) + '</svg>';
    const val = x.absent ? '–' : K.fxn(v) + '×';
    return `<div class="fr-row tile-row pick dir-${dir}${x.absent ? ' thin' : ''}${cls ? ' ' + cls : ''}"${attrs}><span class="fr-lab"><span>${esc(x.label)}</span></span>${track}` +
      `<span class="fr-val">${esc(val)}<i class="fr-q ${dir}${x.desc ? ' desc' : ''}" aria-hidden="true"></i></span><span class="fr-n">${x.n != null ? int(x.n) : ''}</span></div>`;
  }
  const valsOf = rows => rows.filter(r => !r.mine).flatMap(r => [r.v, r.wv, ...(r.lo || [])]).filter(v => v != null);
  // the one-line answer, from the tile's own rows: the strongest two that are more often and the strongest less often
  function answerOf(rows, fold) {
    const ok = rows.filter(r => !r.absent && !r.mine && r.v != null && !r.desc), sig = r => r.q != null && r.q <= K.PADJ && (r.dir === 'more' || r.dir === 'less');
    const more = ok.filter(r => sig(r) && r.dir === 'more').sort((a, b) => b.v - a.v).slice(0, 2), less = fold ? [] : ok.filter(r => sig(r) && r.dir === 'less').sort((a, b) => a.v - b.v).slice(0, 1);
    const nm = r => `${esc(r.label)} (${K.fxn(r.v)}×)`;
    if (!ok.length) return rows.length && rows.every(r => r.absent) ? 'None of these is in this selection.' : '';
    if (!more.length && !less.length) return `No row here differs from the other ${fold ? 'proteins' : esc(W.residues)}.`;
    return [more.length ? `More often: ${more.map(nm).join(', ')}.` : '', less.length ? `Less often: ${less.map(nm).join(', ')}.` : ''].filter(Boolean).join(' ');
  }
  // a Download menu that opens on a tap: the formats given, and the question's Method
  const dlMenu = (label, kinds, attrs, method) => `<details class="fr-dl tile-dl"><summary aria-label="Download ${esc(label)}" title="Download ${esc(label)}">Download</summary>` +
    `${K.expBar(kinds, attrs, label, method).replace('class="exp"', 'class="exp fr-exp"')}</details>`;
  K.clicks.push(['details.tile-dl', () => {}]);          // a tap on Download opens the menu, not the question
  // one menu open at a time; a tap elsewhere, or a choice, closes it
  document.addEventListener('click', e => { document.querySelectorAll('details.tile-dl[open]').forEach(d => { if (!d.contains(e.target) || e.target.closest('.exp-btn')) d.open = false; }); });
  K.tilekit = { axisOf, axisHtml, rowHtml, valsOf, answerOf, dlMenu, fmtT, narrow };
});
