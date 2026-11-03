/* Two-way linking of a protein's sites: hovering or clicking a site in any view lights it in every view that is open.
   One small channel; each view subscribes, and none calls another.
     K.site.hover(acc, pos|null, {from})    a light highlight, nothing moves
     K.site.focus(acc, pos|null, {from})    the focused site (null clears it); the protein page opens its card and the hash
     K.site.follow(acc, pos|null)           the page's address changed to this site (Back, a link): the views follow, the hash is not written
     K.site.residue(acc, pos|null, {from})  a position that is not a site (a click in 3D): marked on the map and the sequence
     K.site.on(fn) -> off                   fn({kind: 'hover' | 'focus' | 'residue', acc, pos, from})
   Elements carrying data-msite (map marks, sequence), tr[data-site] (the sites table) and data-cv-pos (conservation) are
   linked here by delegation, and take the class lk-hover or lk-res from the channel's state. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const subs = new Set();
  const st = { acc: null, hover: null, focus: null, residue: null };
  const emit = (kind, acc, pos, o) => {
    const e = { kind, acc, pos: pos == null ? null : +pos, from: (o && o.from) || '' };
    st[kind] = e.pos == null ? null : e.pos; st.acc = acc;
    subs.forEach(fn => { try { fn(e); } catch (err) { console.error(err); } });
  };
  const same = (kind, acc, pos) => st.acc === acc && st[kind] === (pos == null ? null : +pos);
  K.site = {
    state: st,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    hover(acc, pos, o) { if (!same('hover', acc, pos)) emit('hover', acc, pos, o); },
    focus(acc, pos, o) { st.hover = null; if (!same('focus', acc, pos)) emit('focus', acc, pos, o); },     // the site already focused: nothing to redraw
    follow(acc, pos) { st.hover = null; emit('focus', acc, pos, { from: 'history' }); },                  // the address changed (Back, a link): the views follow, nothing is written
    residue(acc, pos, o) { if (!same('residue', acc, pos)) emit('residue', acc, pos, o); },
  };
  if (typeof document === 'undefined' || !document.addEventListener) return;
  const SEL = {
    hover: p => `[data-msite="${p}"], tr[data-site="${p}"], [data-cv-pos="${p}"]`,
    residue: p => `[data-r="${p}"], [data-msite="${p}"]`,
  };
  const CLS = { hover: 'lk-hover', residue: 'lk-res' };
  const apply = (kind, pos) => {
    document.querySelectorAll('.' + CLS[kind]).forEach(el => el.classList.remove(CLS[kind]));
    if (pos != null) document.querySelectorAll(SEL[kind](pos)).forEach(el => el.classList.add(CLS[kind]));
  };
  K.site.on(e => { if (e.kind !== 'focus') apply(e.kind, e.pos); else { apply('hover', null); apply('residue', null); } });
  K.site.reapply = () => { apply('hover', st.hover); apply('residue', st.residue); };
  // the page's protein, and where the pointer is
  const accNow = () => (K.S.view === 'protein' ? String(K.S.arg || '').split('/')[0] : '');
  const target = e => { const el = e.target.closest?.('[data-msite], tr[data-site], [data-cv-pos]'); if (!el) return null;
    const pos = +(el.dataset.msite ?? el.dataset.site ?? el.dataset.cvPos); const acc = accNow();
    return acc && pos ? { acc, pos, from: el.closest('.seq') ? 'sequence' : el.closest('svg') ? 'map' : el.closest('.cv-wrap') ? 'conserve' : 'table' } : null; };
  document.addEventListener('mouseover', e => { const t = target(e); if (t) K.site.hover(t.acc, t.pos, t); });
  document.addEventListener('mouseout', e => { const t = target(e); if (t && !e.relatedTarget?.closest?.(`[data-msite="${t.pos}"], tr[data-site="${t.pos}"], [data-cv-pos="${t.pos}"]`)) K.site.hover(t.acc, null, t); });
  document.addEventListener('focusin', e => { const t = target(e); if (t) K.site.hover(t.acc, t.pos, t); });
  document.addEventListener('focusout', e => { const t = target(e); if (t) K.site.hover(t.acc, null, t); });
  // the keyboard: Enter on a site focuses it (a table row does so in its own handler), Esc clears the focus
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const el = e.target.closest?.('[data-msite]'); const t = el && target(e);
      if (t) { e.preventDefault(); K.site.focus(t.acc, t.pos, t); }
    } else if (e.key === 'Escape' && st.focus != null && accNow() && !document.querySelector('dialog[open]')) K.site.focus(accNow(), null, { from: 'keyboard' });
  });
  const css = document.createElement('style');
  css.textContent = `.lk-hover { transition: none; }
tr.lk-hover > td { background: color-mix(in srgb, var(--accent) 10%, transparent); }
svg .lk-hover { filter: drop-shadow(0 0 2.5px var(--accent)); }
.seq .sq-m.lk-hover, .seq .lk-res { outline: 1.5px solid var(--accent); outline-offset: 0; border-radius: 2px; }
.seq .sq-m.on { background: var(--accent); color: var(--on-accent); }
.seq i[data-r] { font-style: normal; }
.cv-tbl button.lk-hover { text-decoration: underline; color: var(--accent-dark); }
.lk-box { max-height: 30rem; overflow: auto; }
.lk-box thead th { position: sticky; top: 0; z-index: 1; background: var(--surface); }
[data-msite]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`;
  document.head.appendChild(css);
});
