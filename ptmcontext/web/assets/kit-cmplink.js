/* The link from a question's page to the same question on the Compare marks page (the sibling compare/ page, compare.json):
     K.compareHref(aid)   the address, or '' when the compare page has no such question for this explorer
     K.compareLink(aid)   the small "Compare across explorers" link (hidden until compare.json says the question is there)
   One helper builds every such address: compare/#q=<the question's name as the compare page spells it>, which that page
   reads as its search. compare.json is asked for once, from the same site; a page opened from a file has no link.
   A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const URL_JSON = '../compare/compare.json';
  let byAid = null, // this explorer's analysis id -> the compare page's question title
    asked = false;
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  K.compareHref = (aid) => {
    const t = byAid?.get(aid);
    return t ? `../compare/#${new URLSearchParams({ q: t })}` : '';
  };
  const fill = () =>
    document.querySelectorAll('a[data-cmp-aid]').forEach((a) => {
      const h = K.compareHref(a.dataset.cmpAid);
      if (h) {
        a.href = h;
        a.hidden = false;
      }
    });
  function load() {
    if (asked || !/^https?:/.test(location.protocol)) return;
    asked = true;
    fetch(URL_JSON)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        byAid = new Map();
        for (const g of d.groups || [])
          for (const q of g.questions || []) {
            const mine = q.tests?.[K.D.site.id];
            if (mine && q.rows?.length) byAid.set(mine.analysis, q.title);
          }
        fill();
      })
      .catch(() => {});
  }
  K.compareLink = (aid) => {
    load();
    const h = K.compareHref(aid);
    return `<a class="tcmp" data-cmp-aid="${esc(aid)}"${h ? ` href="${esc(h)}"` : ' hidden'} title="The same question for every explorer, side by side">Compare across explorers ›</a>`;
  };
});
