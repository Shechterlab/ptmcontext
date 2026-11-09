/* The pathway view (website.front.pathways; the Overview's tiles and question pages): a "Proteins" button on the rows of a pathway question opens
   the pathway's sub-pathways as groups of protein chips. A methylated protein is filled, with its sites (those of the
   selection, when there is one); a protein of the pathway with none is an outline, muted; the methylated come first, and
   each group says "k of n methylated in your selection". Chips open the protein's page. The groups follow the filters,
   and the address keeps the pathway (pw=). The pathway's proteins and sub-pathways are one small file (data/pathways/<set>.json,
   built with the site from its own hierarchy and membership tables), read only when it is opened; nothing is asked of the
   pathway source's service, only linked. A module of the site kit; which questions are pathway questions comes from the
   site file, and without the block it does nothing. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, A, S, esc, int } = K;
  const CFG = (D.front && D.front.pathways) || [];
  if (!CFG.length) return;
  const cfgOf = aid => CFG.find(c => c.analyses.includes(aid));
  const PI = Object.fromEntries((D.proteins || []).map((p, i) => [p[0], i]));
  const fileOf = id => String(id).replace(/[^A-Za-z0-9._-]/g, '_') + '.json';
  const SHOWN = 48;
  const cache = {};
  const load = (cfg, id) => (cache[cfg.dir + id] ||= fetch(cfg.dir + fileOf(id)).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).catch(e => { delete cache[cfg.dir + id]; throw e; }));

  // ---- the address: pw=<set> -------------------------------------------------------------------------------------------------
  const onPage = () => S.view === 'overview' && !!S.arg && !!cfgOf(S.arg);
  K.paramsIn.push(p => { S.pw = p.get('pw') || ''; });
  K.paramsOut.push(p => { if (S.pw && onPage()) p.set('pw', S.pw); });
  const setPw = id => { S.pw = id || ''; K.writeHash(true); K.render(); };

  // ---- the card -----------------------------------------------------------------------------------------------------------------
  const nameOf = id => { const r = (K.rowsFor(A[S.arg], S.m) || []).find(x => x.category === id); return r ? r.label : id; };
  function shell(cfg, id) {
    const src = cfg.source || {};
    const out = src.link ? (`<a class="btn small" href="${
esc(src.link.replace('{}', encodeURIComponent(id)))}" target="_blank" ` +
        `rel="noopener">Open in ${esc(src.name || 'the source')}</a>`) : '';
    const by = [src.name ? (src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.name)}</a>` : esc(src.name)) : '', src.version ? esc(src.version) : ''].filter(Boolean).join(' ');
    return (`<section class="pwcard" id="pwcard" aria-labelledby="pwtitle"><header><h2 id="pwtitle" tabindex="-1">${esc(nameOf(id))}</h2><span ` +
        `class="pwtools">${out}<button type="button" class="btn small" data-pw-close aria-label="Close the ` +
        `pathway">×</button></span></header>`) +
      `<div id="pwbody" aria-live="polite"><p class="muted">Loading the pathway’s proteins…</p></div>` +
      (by ? `<p class="pwattr">Pathway from ${by}${
src.licence ? ` (${esc(src.licence)})` : ''}.</p>` : '') + '</section>';
  }
  const sorted = ms => ms.slice().sort((x, y) => y.on - x.on || y.n - x.n || x.g.localeCompare(y.g));
  function fill(d) {
    const box = document.getElementById('pwbody'); if (!box) return;
    document.getElementById('pwtitle').textContent = d.name;
    const act = K.sel.active(), SD = act ? K.sel.data() : null;
    if (act && !SD) { box.innerHTML = '<p class="muted">Loading the selection…</p>'; return; }
    const prots = act ? K.sel.compute().proteins : null, per = act ? K.sel.selectedCountByProtein() : null;
    // each member: its protein on the site, whether it is in the selection, and its sites there
    const mem = d.acc.map((a, j) => { const i = PI[a], here = i !== undefined, on = here && (!prots || prots.has(i));
      return { a, i, here, on, g: here ? (D.proteins[i][1] || a) : d.gene[j] || a, n: !here ? 0 : per ? per[i] || 0 : D.proteins[i][4] }; });
    const groups = d.groups.map(g => { const ms = g.m.map(j => mem[j]); return { ...g, ms, k: ms.filter(x => x.on).length }; });
    if (d.top) groups.sort((x, y) => y.k - x.k || x.name.localeCompare(y.name));
    const word = act ? ' in your selection' : '';
    const chip = x => {
      const sites = `${int(x.n)} ${x.n === 1 ? K.W.mark : K.W.marks}`;
      return x.here
        ? `<a class="pchip${x.on ? ' on' : ' off'}" href="${esc(K.link('protein', x.a))}" title="${
esc(`${x.g} (${x.a}): ${
x.on ? sites + word : 'methylated, but not in your selection'}`)}"><b>${esc(x.g)}</b>${x.on ? `<small>${int(x.n)}</small>` : ''}</a>`
        : `<span class="pchip none" title="${
esc(`${x.g} (${x.a}): none in this dataset`)}"><b>${esc(x.g)}</b></span>`;
    };
    const group = (g, open) => {
      const ms = sorted(g.ms);
      return (`<details class="pwgroup" id="pwg-${esc(String(g.id).replace(/\W/g, '_'))}"${open ? ' open' : ''}><summary>` +
          `<span class="pwgname">${esc(g.name)}</span><span class="pwgk"><b>${int(g.k)}</b> of ${int(ms.length)} methylated${word}</span></summary>`) +
        `<div class="pchips">${ms.slice(0, SHOWN).map(chip).join('')}${
ms.length > SHOWN ? (`<button type="button" ` +
            `class="btn small" data-pw-all="${esc(g.id)}">Show all ${int(ms.length)}</button>`) : ''}</div></details>`;
    };
    const k0 = mem.filter(x => x.on).length, one = d.groups.length === 1;
    box.innerHTML = (`<p class="pwsum"><b>${int(k0)}</b> of ${int(d.acc.length)} proteins in this pathway are ` +
        `methylated${word}${
one ? '' : `, in ${int(d.groups.length)} sub-pathways${
d.top ? ' (those with most methylated proteins first)' : ''}`}.</p>`) +
      (`<p class="pwlegend"><span class="pchip on"><b>GENE</b><small>3</small></span> methylated, with its ${esc(K.W.marks)}${word} <span class="pchip ` +
          `none"><b>GENE</b></span> in the pathway, not methylated here${
act ? ' <span class="pchip off"><b>GENE</b></span> methylated, outside your selection' : ''}</p>`) +
      groups.map((g, n) => group(g, n < (d.top ? 4 : 8))).join('');
    box.querySelectorAll('[data-pw-all]').forEach(b => { b.onclick = () => { const g = groups.find(x => String(x.id) === b.dataset.pwAll); b.parentElement.innerHTML = sorted(g.ms).map(chip).join(''); }; });
  }
  function open(cfg, id) {
    const card = document.getElementById('pwcard'); if (!card) return;
    load(cfg, id).then(d => { if (document.getElementById('pwcard')) fill(d); })
      .catch(() => { const box = document.getElementById('pwbody'); if (box) box.innerHTML = '<p class="muted">The pathway’s proteins could not be loaded.</p>'; });
  }

  // ---- the page: a Proteins button on each row, and the card above the rows ---------------------------------------------------------
  let shownFor = '';
  // the home's pathway card: its rows get the same button, which opens the question's page with the pathway
  function homeButtons() {
    document.querySelectorAll('#view .fr-row[data-f][data-v]').forEach(r => {
      const aid = String(r.dataset.f).split(':')[1]; if (!cfgOf(aid)) return;
      const nx = r.nextElementSibling; if (nx && nx.matches?.('[data-pw-home]')) return;
      r.insertAdjacentHTML('afterend', (`<button type="button" class="btn small pwbtn pwbtn-home" data-pw-home="${esc(r.dataset.v)}" data-aid="${esc(aid)}" aria-label="Proteins ` +
          `of ${
esc(r.querySelector('.fr-lab')?.textContent || r.dataset.v)}">Proteins</button>`));
    });
  }
  function after() {
    if (S.view === 'overview' && !S.arg) homeButtons();      // the home's rows, and the rows of the classic Overview's tiles
    const cfg = onPage() ? cfgOf(S.arg) : null; if (!cfg) return;
    document.querySelectorAll('#view .drow[data-cat]').forEach(r => {
      if (r.querySelector('[data-pw]')) return;
      const name = r.querySelector('.ln')?.textContent || r.dataset.cat;
      r.querySelector('.lab')?.insertAdjacentHTML('beforeend', (` <button type="button" class="btn small pwbtn" ` +
          `data-pw="${esc(r.dataset.cat)}" aria-label="Proteins of ${esc(name)}">Proteins</button>`));
    });
    document.getElementById('pwcard')?.remove();
    if (!S.pw) { shownFor = ''; return; }
    const anchor = document.querySelector('#view .pcard');
    if (!anchor) return;
    anchor.insertAdjacentHTML('beforebegin', shell(cfg, S.pw));
    open(cfg, S.pw);
    if (shownFor !== S.pw) { shownFor = S.pw; const t = document.getElementById('pwtitle'); t?.scrollIntoView({ block: 'start' }); t?.focus({ preventScroll: true }); }
  }
  (K.afterRender ||= []).push(after);
  // the button opens the pathway (not the row's own click, which selects its proteins); × closes it
  document.addEventListener('click', e => {
    const h = e.target.closest?.('[data-pw-home]');
    if (h) { e.preventDefault(); e.stopPropagation(); Object.assign(S, { view: 'overview', arg: h.dataset.aid, pw: h.dataset.pwHome }); K.writeHash(true); K.render(); scrollTo(0, 0); return; }
    const b = e.target.closest?.('[data-pw]'), x = e.target.closest?.('[data-pw-close]');
    if (!b && !x) return;
    e.preventDefault(); e.stopPropagation();
    if (b) setPw(b.dataset.pw);
    else { const id = S.pw; setPw(''); document.querySelector(`[data-pw="${CSS.escape(id)}"]`)?.focus(); }       // closed: back to the row's button
  }, true);
  K.pathways = { cfgOf, fileOf };
});
