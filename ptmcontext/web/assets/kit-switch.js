/* The site switcher: a "Mark" menu in the header that lists the sibling sites and opens one with the reader's search
   (q=), highlight (hl=) and filters (f=). The list is sites.json, which `ptmc pages` writes beside the sites' folders
   ({sites: [{id, label, listed, in_switcher}]}); a site served alone has none, and no menu is drawn. A site that is not
   listed on the landing page appears only in the menu of an unlisted site, or where its own file says in_switcher.
   A filter the target site does not have is dropped by it (decode), and the target says how many in a short notice.
   Nothing here names a site. A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, esc, S } = K;
  const here = D?.site?.id;
  const arrived = location.hash; // the address as it came: the notice reads its f= and sw= before the page rewrites it
  const keys = (raw) =>
    String(raw || '')
      .split(';')
      .map((x) => x.split('~')[0])
      .filter(Boolean)
      .map((k) => {
        try {
          return decodeURIComponent(k);
        } catch (e) {
          return k;
        }
      });
  let noted = false;
  const notice = () => {
    if (noted) return;
    const p = new URLSearchParams(arrived.split('?')[1] || ''),
      from = p.get('sw');
    if (!from || !K.sel?.fRaw) return;
    const had = keys(K.sel.fRaw(arrived)),
      kept = new Set(Object.keys(S.f || {})),
      lost = had.filter((k) => !kept.has(k));
    if (!lost.length) return;
    noted = true;
    const n = lost.length,
      box = document.createElement('div');
    box.className = 'switch-note';
    box.setAttribute('role', 'status');
    box.innerHTML =
      `<span>${n} filter${n === 1 ? '' : 's'} from ${esc(from)} ${n === 1 ? 'is' : 'are'} not on this site and ` +
      `${n === 1 ? 'was' : 'were'} dropped. Your search and highlight are kept.</span>` +
      '<button type="button" aria-label="Dismiss this notice">×</button>';
    box.querySelector('button').addEventListener('click', () => box.remove());
    document.querySelector('.toolbar')?.before(box);
  };
  const target = (site, name) => {
    const p = [];
    if (S.q) p.push('q=' + encodeURIComponent(S.q));
    if (S.hl) p.push('hl=' + encodeURIComponent(S.hl));
    const f = K.sel?.encode?.();
    if (f) p.push('f=' + f.replace(/[&#+\s]/g, (c) => encodeURIComponent(c)));
    if (f) p.push('sw=' + encodeURIComponent(name));
    return `../${encodeURIComponent(site)}/#overview` + (p.length ? '?' + p.join('&') : '');
  };
  const build = (list) => {
    const side = document.querySelector('.brand-side');
    if (!side || list.length < 2) return;
    const me = list.find((s) => s.id === here);
    const wrap = document.createElement('div');
    wrap.className = 'site-switch';
    wrap.innerHTML =
      '<button type="button" class="site-switch-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="site-switch-list" ' +
      `title="Open another site">Mark: <b>${esc(me?.label || '')}</b> <span aria-hidden="true">▾</span></button>` +
      '<ul id="site-switch-list" class="site-switch-list" role="menu" aria-label="Sites" hidden>' +
      list
        .map(
          (s) =>
            `<li role="none"><a role="menuitemradio" aria-checked="${s.id === here}" ${s.id === here ? 'aria-current="true" ' : ''}` +
            `href="../${encodeURIComponent(s.id)}/" data-site="${esc(s.id)}" tabindex="-1">${esc(s.label)}</a></li>`
        )
        .join('') +
      '</ul>';
    side.prepend(wrap);
    const btn = wrap.querySelector('button'),
      menu = wrap.querySelector('ul'),
      items = [...menu.querySelectorAll('a')];
    const open = (at) => {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      (items[at] || items.find((a) => a.getAttribute('aria-current')) || items[0]).focus();
    };
    const close = (back) => {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (back) btn.focus();
    };
    btn.addEventListener('click', () => (menu.hidden ? open() : close(true)));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open(e.key === 'ArrowUp' ? items.length - 1 : 0);
      }
    });
    menu.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(i + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i - 1 + items.length) % items.length].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (e.key === 'Tab') close(false);
    });
    menu.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-site]');
      if (!a) return;
      e.preventDefault();
      if (a.dataset.site === here) return close(true);
      location.href = target(a.dataset.site, D.site.name);
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !wrap.contains(e.target)) close(false);
    });
  };
  const start = async () => {
    try {
      const r = await fetch('../sites.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const all = (await r.json()).sites || [],
        mine = all.find((s) => s.id === here),
        // unlisted sites are in the menu of an unlisted site, and where their own file says so
        list = all.filter((s) => s.listed || s.in_switcher || s.id === here || (mine && !mine.listed));
      build(list);
    } catch (e) {
      /* served alone: no list of sites, no menu */
    }
  };
  if (here) {
    start();
    // after the page has read the address (its filters are the ones this site has)
    // (the filters are read once the selection's data is in: poll for them, and say so after 6 s if none were kept)
    const later = () => {
      let tries = 0;
      const t = setInterval(() => {
        if (Object.keys(S.f || {}).length || ++tries > 20) {
          clearInterval(t);
          notice();
        }
      }, 300);
    };
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
  }
});
