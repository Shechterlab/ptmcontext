/* A quiet progress cue: a thin bar at the top edge of the window (fixed, so nothing moves) and a hidden status line for
   screen readers, shown when a data file of the site is still coming after 300 ms. Reads the site's own files only
   (relative URLs): it wraps fetch, so every module is covered. K.busy(label, promise) holds it for other waits. Under
   reduced motion the bar is still, not sliding. A module of the site kit: K.busy. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const DELAY = 300;
  let n = 0, timer = 0, shown = false, bar = null, msg = null, label = '';
  const mount = () => {
    if (bar || !document.body) return;
    bar = document.createElement('div'); bar.id = 'busy'; bar.hidden = true; bar.setAttribute('aria-hidden', 'true'); bar.innerHTML = '<i></i>';
    msg = document.createElement('div'); msg.className = 'vh'; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    document.body.append(bar, msg);
  };
  const sync = () => {
    mount(); if (!bar) return;
    const on = n > 0 && shown;
    bar.hidden = !on; msg.textContent = on ? label || 'Loading' : '';
    document.documentElement.toggleAttribute('data-busy', on);
  };
  const start = text => { n++; if (text) label = text; if (!timer && !shown) timer = setTimeout(() => { timer = 0; shown = true; sync(); }, DELAY); };
  const done = () => { if (--n > 0) return; n = 0; clearTimeout(timer); timer = 0; shown = false; label = ''; sync(); };
  const mine = u => { try { const x = new URL(typeof u === 'string' ? u : u.url, location.href); return x.origin === location.origin && /\/data\//.test(x.pathname); } catch (e) { return false; } };
  const f0 = window.fetch;
  if (f0) window.fetch = function (u, o) {
    if (!mine(u)) return f0.apply(this, arguments);
    start('Loading data');
    // fetch settles at the headers; the file is in when the body has been read (a body nobody reads is let go after 30 s)
    let over = false; const end = () => { if (!over) { over = true; done(); } }, cap = setTimeout(end, 30000);
    const p = f0.apply(this, arguments);
    p.then(r => { for (const k of ['json', 'text', 'arrayBuffer', 'blob']) { const g = r[k].bind(r); r[k] = () => { const q = g(); q.then(end, end); return q; }; } }, end);
    p.then(() => 0, () => clearTimeout(cap));
    return p;
  };
  K.busy = (text, p) => { start(text); Promise.resolve(p).then(done, done); return p; };
});
