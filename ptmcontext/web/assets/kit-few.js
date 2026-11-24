/* The "about these sites" layout for a small selection (a few sites), the same on every tab that offers it: per site a
   one-line header, a row of key facts (chips that open the section they come from), then compact sections that start
   folded with a one-line summary each. A tab hands over its own sites and sections; this module knows no mark, source or
   page by name. A module of the site kit: K.few.
     K.few.active(n)        true when the selection is small: some selection of at most K.few.MAX sites, or one too small to test
     K.few.html({ title, note, sites, more })
        sites: [{ key, head (html), facts: [{ text (html), to? (a section id of this site) }],
                  sections: [{ id, title, sum (a plain-text line), body (html; a section without one is left out) }] }]
        more: how many selected sites are not listed */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, esc, int, W } = K;
  const MAX = 25;
  const slug = (s) => String(s).replace(/[^\w]+/g, '-');
  const fid = (site, sid) => `few-${slug(site.key)}-${slug(sid)}`;
  const active = (n) => !!K.sel?.active() && n > 0 && (!K.sel.testable() || n <= MAX);
  function siteHtml(s) {
    const secs = (s.sections || []).filter((x) => x.body),
      have = new Set(secs.map((x) => x.id)),
      chips = (s.facts || [])
        .map((f) =>
          f.to && have.has(f.to)
            ? `<button type="button" class="chip-btn few-chip" data-open-fold="${esc(fid(s, f.to))}">${f.text}</button>`
            : `<span class="few-chip">${f.text}</span>`
        )
        .join('');
    return (
      `<div class="few-site"><p class="few-head">${s.head}</p>${chips ? `<div class="few-facts">${chips}</div>` : ''}` +
      (secs.length
        ? `<div class="few-secs">${secs.map((x) => K.fold(fid(s, x.id), esc(x.title), esc(x.sum || ''), x.body, false)).join('')}</div>`
        : '') +
      '</div>'
    );
  }
  function html(o) {
    const sites = o.sites || [];
    return (
      `<section class="pcard few"><h3>${esc(o.title || `About your selected ${W.marks}`)}</h3>` +
      (o.more
        ? `<p class="small muted"${o.note ? ` title="${esc(o.note)}"` : ''}>Showing the first ${int(sites.length)} of ${int(sites.length + o.more)}.</p>`
        : '') +
      sites.map(siteHtml).join('') +
      '</section>'
    );
  }
  // ---- what the tabs share: the selected sites, and a site's or a protein's name as a link -----------------------------
  const prot = (i) => D.proteins[i] || [];
  const shownAt = (pi, pos) => (K.prot?.shownPos ? K.prot.shownPos(prot(pi)[0], pos) : pos);
  // the site's name comes from the protein module (the row's own residue), the same everywhere
  const siteLink = (pi, pos) => {
    const name = K.prot?.siteLabel ? K.prot.siteLabel(prot(pi)[0], pos) : `${shownAt(pi, pos)}`;
    return (
      `<a href="${esc(K.link('protein', `${prot(pi)[0]}/${name}`))}"><b>${esc(prot(pi)[1] || prot(pi)[0] || '')}</b> ` +
      `${esc(name)}</a>`
    );
  };
  const protLink = (pi) =>
    `<a href="${esc(K.link('protein', prot(pi)[0]))}"><b>${esc(prot(pi)[1] || prot(pi)[0] || '')}</b></a>`;
  // the selected sites in protein and position order: { all: how many, list: the first MAX as mark rows [protein, position, ...] }
  function picked() {
    const sd = K.sel?.peek?.();
    if (!sd || !K.sel.active()) return null;
    const all = [...(K.sel.compute().marks || [])]
      .map((i) => sd.marks[i])
      .filter(Boolean)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return { all: all.length, list: all.slice(0, MAX) };
  }
  // the same chip for a count: "3 variants", "1 variant"
  const count = (n, w) => `${int(n)} ${w}${n === 1 ? '' : 's'}`;
  K.few = { MAX, active, html, siteLink, protLink, picked, count };
  const style = document.createElement('style');
  style.id = 'kit-few-css';
  style.textContent = `
.few-site { border: 1px solid var(--line); border-radius: 0.6rem; padding: 0.5rem 0.8rem; margin-top: 0.5rem; min-width: 0; }
.few-head { margin: 0 0 0.3rem; font-size: 1rem; }
.few-facts { display: flex; flex-wrap: wrap; gap: 0.3rem 0.4rem; margin-bottom: 0.3rem; }
.few-chip { display: inline-flex; align-items: center; gap: 0.3rem; border: 1px solid var(--line-strong); border-radius: 999px; padding: 0.05rem 0.6rem; font-size: 0.8rem; color: var(--ink-2); background: var(--surface); font-family: inherit; }
button.few-chip { cursor: pointer; } button.few-chip:hover { background: var(--wash); }
.few-secs .pfold { margin: 0.2rem 0; } .few-secs .pfold > summary h3 { font-size: 0.9rem; }
.few-secs .sc-ix { margin: 0; }
`;
  document.head.appendChild(style);
});
