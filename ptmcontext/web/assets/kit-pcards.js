/* The protein page's context cards (website.protein.cards, CONTRACTS.md "Protein page cards"): Location and condensates,
   Cancer cell lines and tumors, enzyme inhibitors and the like, Experiments, Clustering, Other PTMs; and the live parts of
   a protein-set card (website.protein.sets[].live: UniProt's diseases and Open Targets' scores, asked by accession).
   Each card is on when the site file names it and reads tables of website.tables in the formats of CONTRACTS.md; it knows
   no mark, source or organism by name, and a protein without rows in a card's tables says so. The folds are made through
   the page's fold hooks (K.proteinFolds) and filled when the protein's tables arrive. A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const { D, W, esc, int, cap } = K;
  const PC = D.protein_view?.cards || {},
    LIVE = (D.protein_view?.sets || []).filter((c) => c.live);
  if (!Object.keys(PC).length && !LIVE.length) return;
  const TH = D.tables || {},
    LK = D.lookups || {},
    SPECS = D.attribute_specs || {},
    PADJ = K.PADJ;
  const has = (name) => !!(name && TH[name]);
  const rows = (tb, name) => (has(name) ? K.card.rows(tb, name) : []);
  const list = (v) =>
    String(v ?? '')
      .split(/;\s*/)
      .filter(Boolean);
  const num = (v) => (v === '' || v == null || !isFinite(+v) ? null : +v);
  const fmt3 = (v) => (v == null ? '–' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2));
  const sumList = (xs, n) => xs.slice(0, n).join(', ') + (xs.length > n ? ` +${xs.length - n}` : '');
  const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + 's'}`;
  const qf = (q) => (q >= 0.01 ? q.toFixed(2) : K.fq(q));
  const ext = (href, text, title) =>
    `<a class="ext" href="${esc(href)}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
  const CUR = { p: null, rec: null };
  const meters1 = (label, v, text) => (K.pfolds ? K.pfolds.meters([{ label, v, text }]) : '');
  const word = (obj, k) => (obj || {})[k] ?? String(k).replace(/_/g, ' ');

  // ---- the protein's tables, asked once; every card is painted again when they arrive ---------------------------------
  const TB = {},
    asked = new Set();
  function tables(acc) {
    if (acc in TB) return TB[acc];
    if (!asked.has(acc)) {
      asked.add(acc);
      K.card.load(acc).then((tb) => {
        TB[acc] = tb || {};
        paintAll();
      });
    }
    return undefined;
  }
  // the variant lists of the sources kept in their own files (card.variant_counts[].lazy), asked once when the card is opened
  const DT = {},
    dAsked = new Set();
  function detail(acc) {
    if (acc in DT) return DT[acc];
    if (!dAsked.has(acc)) {
      dAsked.add(acc);
      K.card.loadDetail(acc).then((d) => {
        DT[acc] = d;
        paintAll();
      });
    }
    return undefined;
  }
  const sets = (aid) => {
    const sd = K.sel.meta(),
      ps = sd?.protein_sets?.[aid] || sd?.protein_sets_meta?.[aid];
    return ps ? new Set(ps.sets.map((x) => x[0])) : null;
  };
  const attrVal = (m, name) => K.cols.markAttr(m, name) ?? '';
  const letter = (rec, pos) => (rec.seq || '')[pos - 1] || '';
  const siteName = (rec, pos, acc) => letter(rec, pos) + (acc && K.prot?.shownPos ? K.prot.shownPos(acc, pos) : pos);
  const siteLink = (p, rec, pos) =>
    `<a href="${esc(K.link('protein', `${p.acc}/${pos}`))}">${esc(siteName(rec, pos, p.acc))}</a>`;
  const gene = (p) => p.gene || p.acc;

  // ---- live sources, asked by accession ------------------------------------------------------------------------------
  const UNI = {},
    OT = {},
    PM = {};
  const getJson = (url, opt) =>
    fetch(url, opt).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  function uniprot(acc) {
    if (!(acc in UNI)) {
      UNI[acc] = undefined;
      getJson(`https://rest.uniprot.org/uniprotkb/${acc}.json`)
        .then(
          (j) => {
            const cm = (j.comments || [])
              .filter((c) => c.commentType === 'DISEASE')
              .map((c) => ({
                name: c.disease?.diseaseId || '',
                acronym: c.disease?.acronym || '',
                id: c.disease?.diseaseAccession || '',
                mim:
                  (c.disease?.diseaseCrossReference?.database === 'MIM' ? c.disease.diseaseCrossReference.id : '') ||
                  '',
                note: (c.note?.texts || []).map((t) => t.value).join(' '),
              }))
              .filter((x) => x.name);
            const xref = D.protein_view?.conservation?.ensembl?.xref || 'Ensembl';
            const ensg = [
              ...new Set(
                (j.uniProtKBCrossReferences || [])
                  .filter((x) => x.database === xref)
                  .map((x) => ((x.properties || []).find((q) => q.key === 'GeneId') || {}).value || '')
                  .filter(Boolean)
                  .map((g) => g.split('.')[0])
              ),
            ];
            UNI[acc] = { diseases: cm, ensg };
          },
          () => {
            UNI[acc] = null;
          }
        )
        .then(() => paintAll());
    }
    return UNI[acc];
  }
  function openTargets(id, cfg) {
    if (!(id in OT)) {
      OT[id] = undefined;
      getJson(cfg.graphql, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:
            'query($id:String!){target(ensemblId:$id){approvedSymbol associatedDiseases(page:{index:0,size:' +
            (cfg.size || 12) +
            '}){count rows{score disease{id name} datatypeScores{id score}}}}}',
          variables: { id },
        }),
      })
        .then(
          (d) => {
            OT[id] = d.data?.target ? d.data.target.associatedDiseases : { count: 0, rows: [] };
          },
          () => {
            OT[id] = null;
          }
        )
        .then(() => paintAll());
    }
    return OT[id];
  }
  // short names of papers ("Markmiller 2018"), from PubMed's summary service where the site names its address
  function papers(ids, url) {
    const need = ids.filter((i) => !(i in PM));
    if (!url || !need.length) return;
    need.forEach((i) => {
      PM[i] = '';
    });
    getJson(`${url}?db=pubmed&retmode=json&id=${need.join(',')}`).then(
      (j) => {
        need.forEach((i) => {
          const r = j.result?.[i];
          if (r)
            PM[i] = `${String(r.authors?.[0]?.name || '').split(' ')[0]} ${String(r.pubdate || '').slice(0, 4)}`.trim();
        });
        document.querySelectorAll('[data-pm]').forEach((a) => {
          if (PM[a.dataset.pm]) a.textContent = PM[a.dataset.pm];
        });
      },
      () => {}
    );
  }

  // ---- Location and condensates --------------------------------------------------------------------------------------
  const stars = (n, top) =>
    `<span class="stars" role="img" aria-label="${n} of ${top}">${Array.from(
      { length: top },
      (_, k) => `<i class="${k < n ? 'on' : ''}">★</i>`
    ).join('')}</span>`;
  function hpaHtml(cfg, p, tb) {
    const h = cfg.hpa,
      rs = rows(tb, h.table),
      have = h.analysis ? sets(h.analysis) : null;
    const tag = (r) => ({
      name: r.location,
      main: r.main === '1' || /^true$/i.test(r.main),
      unsure: !!h.unsure && r.reliability === h.unsure,
      rel: r.reliability,
    });
    const ls = rs.map(tag).sort((a, b) => b.main - a.main || a.unsure - b.unsure || a.name.localeCompare(b.name));
    const head = `<h4 class="sub-h">${esc(h.title || 'Locations')} <span class="muted small">${esc(h.source || '')}</span>${
      h.url
        ? ' ' +
          ext(
            h.url
              .replace('{acc}', encodeURIComponent(p.acc.split('-')[0]))
              .replace('{gene}', encodeURIComponent(gene(p))),
            'source ↗'
          )
        : ''
    }</h4>`;
    if (!ls.length) return { sum: [], html: head + '<p class="muted small">Not profiled by this source.</p>' };
    const t = (l) => {
      const cls = `tag loc${l.main ? ' main' : ''}${l.unsure ? ' unsure' : ''}`,
        title = `${l.name}: ${l.main ? 'main' : 'additional'} location${
          l.rel ? `, reliability ${l.rel.toLowerCase()}` : ''
        }`;
      return have?.has(l.name) && !l.unsure
        ? `<button type="button" class="${cls}" data-f="p:${esc(h.analysis)}" data-v="${esc(l.name)}" title="${esc(
            title + (`. Select the ${W.marks} on the proteins ` + `at this location.`)
          )}">${esc(l.name)}</button>`
        : `<span class="${cls}" title="${esc(title)}">${esc(l.name)}${l.unsure ? ' ?' : ''}</span>`;
    };
    return {
      sum: ls.filter((l) => l.main).map((l) => l.name),
      html: head + `<div class="tags loc-tags">${ls.map(t).join(' ')}</div>` + ``,
    };
  }
  // the maps' words on the protein (a table) and the drawings the maps color
  const mapsTable = (p, ms) =>
    `<h4 class="sub-h">Cell maps</h4>` +
    (`<div class="tbl-wrap"><table class="pc-maps"><tbody>${ms
      .map(
        (m) =>
          `<tr><th scope="row">${esc(m.name)}<br><span ` +
          `class="muted small">${esc([m.method, m.cells].filter(Boolean).join(', '))}</span></th>` +
          `<td>${
            m.sets.length
              ? esc(m.sets.join(' · '))
              : m.placed
                ? '<span class="muted">in this map, in none of its compartments</span>'
                : '<span class="muted">not in this map</span>'
          }</td></tr>`
      )
      .join('')}</tbody></table>` +
      `</div>`);
  function mapsHtml(p) {
    if (!K.cell || !K.sel.pdata(p.i)) return '';
    const ms = K.cell.maps(p);
    if (!ms) return '';
    return mapsTable(p, ms) + K.cell.drawings(p);
  }
  // the classic page's own fold right after the protein map: the cell and its nucleus, drawn for this protein, the maps' table folded under them
  const CELLFOLD = !!PC.location?.maps;
  function cellBuild(p) {
    if (!K.cell || !K.sel.pdata(p.i)) return { html: K.loading('Loading…'), wait: true };
    const ms = K.cell.maps(p),
      nar = matchMedia('(max-width: 700px)').matches,
      dr = ms ? (nar ? K.cell.drawingsNarrow(p) : K.cell.drawings(p)) : '';
    if (!ms || !dr) return { html: '', hide: true, pic: '' };
    const sets = [...new Set(ms.filter((m) => !m.graded).flatMap((m) => m.sets))],
      nPl = ms.filter((m) => m.sets.length).length;
    // a map that grades (a probability band) is said apart from the places: "chromatin probability 0.2–0.5"
    const grades = [...new Set(ms.filter((m) => m.graded).flatMap((m) => m.sets))].map(
      (x) => x.charAt(0).toLowerCase() + x.slice(1)
    );
    // a phone: the drawings without their labels, then each place with the maps that put the protein there
    const byPlace = new Map();
    ms.filter((m) => !m.graded).forEach((m) =>
      m.sets.forEach((x) => byPlace.set(x, [...(byPlace.get(x) || []), m.name]))
    );
    const where =
      nar && sets.length
        ? `<ul class="cell-places">${[...byPlace]
            .map(([x, mn]) => `<li><b>${esc(x)}</b> <span ` + `class="muted small">${esc(mn.join(' · '))}</span></li>`)
            .join('')}</ul>`
        : '';
    return {
      html:
        `<div class="cell-pair">${dr}</div>` +
        where +
        (nar && sets.length
          ? ''
          : `<p class="cell-where">${
              sets.length || grades.length
                ? `<b>Found in:</b> ${esc(sets.join(' · '))}${grades.length ? `; ${esc(grades.join(', '))}` : ''}`
                : `<span class="muted">` + `No map finds ${esc(gene(p))} in a compartment.</span>`
            }</p>`) +
        `<details class="pc-mapsfold"><summary>Cell maps table <span class="muted">· each map's words on ${esc(gene(p))}</span></summary>${mapsTable(p, ms)}</details>`,
      sum:
        sets.length || grades.length
          ? `${nPl} of ${ms.length} maps find it: ${sumList(sets, 3)}${
              grades.length ? (sets.length ? '; ' : '') + grades.join(', ') : ''
            }`
          : `${ms.length} maps, none ` + `finds it in a compartment`,
      pic: K.pfolds ? K.pfolds.bigN([[`${nPl}/${ms.length}`, 'maps find it']]) : '',
    };
  }
  // where the RNAs the protein binds gather: for each map of the bound RNAs (protein-set questions), the compartments of the protein's own sets, each with the dataset's test of it
  function rnaMapsHtml(cfg, p) {
    const sd = K.sel.pdata(p.i),
      out = [];
    let any = false;
    for (const aid of cfg.rna_maps) {
      const a = (D.analyses || []).find((x) => x.id === aid),
        ps = sd.protein_sets?.[aid];
      if (!a || !ps) continue;
      const names = ps.sets.map((s) => s[0]).filter((s) => K.sel.setHas(aid, s, p.i));
      const lab = (s) => (a.labels || {})[s] || s.replace(/_/g, ' ');
      const fold = (s) => {
        const r = K.setReading(aid, s);
        return r && r.dir === 'more'
          ? ` <span class="muted ` + `small">(${K.fxn(r.effect)}× across the dataset)</span>`
          : '';
      };
      if (names.length) any = true;
      out.push(
        `<tr><th scope="row">${esc(a.title)}</th><td>${
          names.length
            ? names.map((s) => esc(lab(s)) + fold(s)).join(' · ')
            : '<span class="muted">none of its map’s compartments</span>'
        }</td></tr>`
      );
    }
    if (out.length && !any) return K.noData('No compartments of bound RNAs for this protein.');
    return out.length
      ? `<h4 class="sub-h">Where the RNAs ${esc(gene(p))} binds gather</h4><div class="tbl-wrap">` +
          `<table class="pc-maps"><tbody>${out.join('')}</tbody></table></div>`
      : '';
  }
  function condensatesHtml(cfg, p, rec, tb) {
    const c = cfg.condensates,
      top = c.max_score || 5,
      names = LK[c.names] || {},
      have = c.analysis ? sets(c.analysis) : null;
    const rs = rows(tb, c.members)
      .map((r) => {
        const id = r.condensate,
          nm = names[id] || {};
        return {
          id,
          name: nm.name || id,
          type: nm.condensate_type || '',
          score: num(r.score) ?? -1,
          roles: list(r.roles),
          ev: list(r.evidence).sort(
            (x, y) => Object.keys(c.evidence || {}).indexOf(x) - Object.keys(c.evidence || {}).indexOf(y)
          ),
          pm: list(String(r.pmids || '').replace(/[,\s]+/g, '; ')),
        };
      })
      .sort((a, b) => b.score - a.score || b.pm.length - a.pm.length || a.name.localeCompare(b.name));
    const ids = rs.flatMap((r) => r.pm.slice(0, 3));
    const li = (r) => {
      const roles = r.roles.map((x) => word(c.roles, x)).join(', ') || 'role not given',
        ev = r.ev.map((x) => word(c.evidence, x)),
        pm = r.pm;
      const refs = pm
        .slice(0, 3)
        .map(
          (i) =>
            `<a data-pm="${esc(i)}" href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(i)}/" target="_blank" ` +
            `rel="noopener">${esc(PM[i] || 'PMID ' + i)}</a>`
        )
        .join(', ');
      return (
        `<li><div class="cond-name"><b>${
          have?.has(r.id)
            ? `<button type="button" class="linkish" data-f="p:${esc(c.analysis)}" data-v="${esc(r.id)}" title="Select ` +
              `the ${esc(W.marks)} on the proteins of this condensate">${esc(r.name)}</button>`
            : esc(r.name)
        }</b>` +
        (r.type && r.type !== c.default_type ? ` <span class="tag">${esc(r.type)}</span>` : '') +
        (c.url
          ? ' ' +
            ext(
              c.url.replace('{id}', encodeURIComponent(r.id)),
              `${esc((c.source || '').split(' ')[0] || 'Source')} ↗`,
              `Open in ${c.source || 'the source'}`
            )
          : '') +
        '</div>' +
        `<div class="cond-conf">${stars(Math.max(r.score, 0), top)}<span class="muted small">${esc(roles)}</span></div>` +
        `<div class="cond-ev small">${
          ev.length ? esc(ev.join(' · ')) : '<span class="muted">no evidence type recorded</span>'
        } · ${pm.length ? plural(pm.length, 'publication') : '<span class="muted">no publication recorded</span>'}` +
        (pm.length
          ? ` <span class="muted">${refs}${pm.length > 3 ? ` +${pm.length - 3} more` : ''} · ${ext(
              'https://pubmed.ncbi.nlm.nih.gov/?term=' + pm.map(encodeURIComponent).join('%2C'),
              `all ${pm.length} in PubMed ↗`
            )}</span>`
          : '') +
        '</div></li>'
      );
    };
    papers(ids, c.pubmed);
    const best = rs[0];
    return {
      n: rs.length,
      best,
      html: rs.length
        ? `<h4 class="sub-h">${esc(c.title || 'Condensates')} <span class="muted ` +
          `small">${esc(c.source || '')}</span></h4><ul class="cond-list mine">${rs.map(li).join('')}</ul>`
        : K.noData(`No ${c.source ? c.source.split(' ')[0] + ' ' : ''}condensates for this protein.`),
    };
  }
  function locationBuild(p, rec, tb) {
    const cfg = PC.location,
      bits = [];
    let html = '',
      sum = [];
    if (cfg.hpa) {
      const h = hpaHtml(cfg, p, tb);
      html += h.html;
      sum.push(h.sum.length ? sumList(h.sum, 2) : '');
    }
    if (cfg.maps && !CELLFOLD) html += mapsHtml(p);
    if (cfg.rna_maps?.length && K.sel.pdata(p.i)) html += rnaMapsHtml(cfg, p);
    if (cfg.condensates) {
      const c = condensatesHtml(cfg, p, rec, tb);
      html += c.html;
      const noun = (cfg.condensates.source || '').split(' ')[0];
      sum.push(
        c.n
          ? `${plural(c.n, `${noun} condensate`.trim())}${
              c.best && c.best.score > 0
                ? `, most confident ${c.best.name} (${c.best.score} of ${cfg.condensates.max_score || 5} stars)`
                : ''
            }`
          : `no ${noun} condensate`.replace('  ', ' ')
      );
    }
    bits.push(...sum.filter(Boolean));
    const nLoc = cfg.hpa ? rows(tb, cfg.hpa.table).filter((r) => r.reliability !== cfg.hpa.unsure).length : 0,
      nCond = cfg.condensates ? rows(tb, cfg.condensates.members).length : 0;
    return {
      html,
      sum: bits.join(' · '),
      wait: !!((cfg.maps || cfg.rna_maps?.length) && !K.sel.pdata(p.i)),
      pic:
        K.pfolds && (nLoc || nCond)
          ? K.pfolds.bigN([
              [int(nCond), nCond === 1 ? 'condensate' : 'condensates'],
              [int(nLoc), nLoc === 1 ? 'location' : 'locations'],
            ])
          : '',
    };
  }

  // ---- Cancer cell lines and tumors ----------------------------------------------------------------------------------
  function histSvg(h, g, cfg) {
    const bins = g.map(Number),
      n = bins.length,
      W0 = 460,
      ml = 8,
      mr = 8,
      mb = 38,
      mx = Math.max(1, ...bins),
      lo = h.from,
      hi = h.to,
      bw = (W0 - ml - mr) / n;
    // the marks' labels stand on rows: a label that would meet another one goes a row lower (about 5.6 units a letter)
    const ROW = 12,
      xm = (v) => ml + ((v - lo) / (hi - lo)) * (W0 - ml - mr),
      placed = [];
    const marks = [...(h.marks || [])]
      .sort((a, b) => a.at - b.at)
      .map((m) => {
        const w = String(m.label).length * 5.6 + 6,
          right = m.at > (lo + hi) / 2,
          a = right ? xm(m.at) - 3 - w : xm(m.at) + 3,
          b = a + w;
        let r = 0;
        while (placed.some((q) => q.r === r && a < q.b + 4 && b > q.a - 4)) r++;
        placed.push({ a, b, r });
        return { ...m, r, right };
      });
    const rows = Math.max(0, ...marks.map((m) => m.r)),
      mt = 8 + ROW * rows + (rows ? 10 : 0),
      H0 = 150 + (mt - 8);
    const x = (v) => ml + ((v - lo) / (hi - lo)) * (W0 - ml - mr),
      step = (hi - lo) / n;
    let s = bins
      .map(
        (v, k) =>
          `<rect class="hb" x="${(ml + k * bw + 0.5).toFixed(1)}" y="${(mt + (H0 - mt - mb) * (1 - v / mx)).toFixed(
            1
          )}" width="${(bw - 1).toFixed(1)}" height="${(((H0 - mt - mb) * v) / mx).toFixed(1)}"><title>${(lo + k * step).toFixed(1)} to ${(lo + (k + 1) * step).toFixed(1)}: ${int(v)} lines</title>` +
          `</rect>`
      )
      .join('');
    s += `<line class="ha" x1="${ml}" x2="${W0 - mr}" y1="${H0 - mb}" y2="${H0 - mb}"/>`;
    for (let v = Math.ceil(lo); v <= hi + 1e-9; v += 1)
      s +=
        `<line class="ha" x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${H0 - mb}" y2="${H0 - mb + 4}"/><text ` +
        `class="ht" x="${x(v).toFixed(1)}" y="${H0 - mb + 15}" text-anchor="middle">${v < 0 ? '−' : ''}${Math.abs(v)}</text>`;
    marks.forEach((m) => {
      s +=
        `<line class="hm" x1="${x(m.at).toFixed(1)}" x2="${x(m.at).toFixed(1)}" y1="${8 + m.r * ROW}" y2="${H0 - mb}"/><text ` +
        `class="ht" x="${x(m.at).toFixed(1)}" y="${17 + m.r * ROW}" ${m.right ? 'text-anchor="end" dx="-3"' : 'dx="3"'}>${esc(m.label)}</text>`;
    });
    s += `<text class="ht" x="${ml}" y="${H0 - 4}">${esc(h.axis || '')}</text>`;
    return `<svg class="pc-hist" viewBox="0 0 ${W0} ${H0}" role="img" aria-label="${esc(h.axis || 'histogram')}">${s}</svg>`;
  }
  // ---- changes counted at each residue from per-change tables (card.change_counts): known sites only, or every candidate ----
  // The reader's choice (known sites only at first) is kept in the browser; each count sits beside the protein's average
  // per residue of the same kind, from the background table.
  const CMODE_KEY = 'ptmc-change-mode';
  let CMODE = 'known';
  try {
    CMODE = localStorage.getItem(CMODE_KEY) === 'all' ? 'all' : 'known';
  } catch (e) {
    /* storage may be blocked */
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-cc-mode]');
    if (!b || b.getAttribute('aria-pressed') === 'true') return;
    CMODE = b.dataset.ccMode === 'all' ? 'all' : 'known';
    try {
      localStorage.setItem(CMODE_KEY, CMODE);
    } catch (e) {
      /* storage may be blocked */
    }
    document.querySelectorAll('[data-pc="dependency"], [data-pc="germline"]').forEach((el) => delete el.dataset.pcOk);
    paintAll();
  });
  // a card whose variant lists are in files of their own is filled when it is opened (toggle does not bubble)
  document.addEventListener(
    'toggle',
    (ev) => {
      const el = ev.target.querySelector?.('[data-pc="germline"]');
      if (!el || !ev.target.open) return;
      delete el.dataset.pcOk;
      paintAll();
    },
    true
  );
  // the mutation propensity (kit-propensity.js, data/m): read once a protein, then the cards are painted again
  const pAsked = new Set();
  function propOf(acc) {
    if (!K.prop) return null;
    const v = K.prop.peek(acc);
    if (v === undefined && !pAsked.has(acc)) {
      pAsked.add(acc);
      K.prop.load(acc).then(() => paintAll());
    }
    return v;
  }
  K.prop?.onHyper(() => {
    document.querySelectorAll('[data-pc="dependency"], [data-pc="germline"]').forEach((el) => delete el.dataset.pcOk);
    paintAll();
  });
  // a protein's residues as lollipops for one source (card.change_counts or variant_counts entry `x`): stick = the count the
  // card shows, head = O/E, ring = q < 0.05. '' when the site has no propensity for the entry; `wait` while data/m is read
  function lollipopFor(p, rec, x, counts, known, altsAt) {
    const s = K.prop?.sources.find((q) => q.card === x.id);
    if (!s) return { html: '', wait: false };
    const v = propOf(p.acc);
    if (v === undefined) return { html: K.loading('Loading seen/expected…'), wait: true };
    if (v === null || !v[s.id]) return { html: '', wait: false };
    return {
      wait: false,
      html:
        `<h5 class="pr-h">${esc(s.label)}: changes along the protein, with seen/expected</h5>` +
        K.prop.lollipop({
          acc: p.acc,
          id: s.id,
          seq: rec.seq || '',
          counts,
          known,
          shown: (q) => (K.prot?.shownPos ? K.prot.shownPos(p.acc, q) : q),
          site: (q) => siteName(rec, q, p.acc) + (altsAt?.(q) || ''),
          unit: x.unit,
        }),
    };
  }
  function changeCountsSection(p, rec, tb) {
    const cn = K.card.cc.entries,
      CCK = K.card.cc,
      resSet = new Set(D.residues || []),
      seq = rec.seq || '',
      known = new Set(rec.marks.map((m) => m[0]));
    const order = (l) => (D.residues || []).indexOf(l);
    const cands = [];
    for (let i = 0; i < seq.length; i++) if (resSet.has(seq[i])) cands.push(i + 1);
    const pool = CMODE === 'all' ? cands : [...known].filter((q) => seq[q - 1]).sort((a, b) => a - b);
    const letters = [...new Set(pool.map((q) => seq[q - 1]))].sort((a, b) => order(a) - order(b));
    const tot = (x, q) => CCK.total(CCK.at(tb, x, q));
    const unitOf = (x) => x.unit || ['record', 'records'];
    const lines = cn
      .map((x) =>
        letters
          .map((l) => {
            const qs = pool.filter((q) => seq[q - 1] === l),
              n = qs.reduce((a, q) => a + tot(x, q), 0),
              b = CCK.avg(tb, x, l),
              nm = CCK.residueName(l);
            const per = qs.length ? n / qs.length : null;
            const known1 = CMODE === 'known',
              one = known1 ? `known ${W.mark}` : `candidate ${nm}`,
              many = known1 ? `known ${W.marks}` : `candidate ${CCK.residueNames(l)}`,
              of = known1 && letters.length > 1 ? ` (${CCK.residueNames(l)})` : '';
            return (
              `<li><b>${esc(x.label)}</b>: ${int(n)} ${n === 1 ? 'change' : 'changes'} at its ` +
              `${esc(plural(qs.length, one, many))}${esc(of)} · per ${known1 ? 'site' : esc(nm)}: ` +
              `<b>${CCK.avgText(per)}</b> · protein average per ${esc(nm)}: <b>${CCK.avgText(b?.per)}</b></li>`
            );
          })
          .join('')
      )
      .join('');
    // one row per residue with a change, most changes first
    const all = pool
      .map((q) => ({ q, cells: cn.map((x) => CCK.at(tb, x, q)) }))
      .filter((r) => r.cells.some((v) => v.length));
    const per = all;
    const sumOf = (r) => r.cells.reduce((a, v) => a + CCK.total(v), 0);
    per.sort((a, b) => sumOf(b) - sumOf(a) || a.q - b.q);
    const nSites = cn.map((x, k) => per.filter((r) => r.cells[k].length).length);
    const what =
      CMODE === 'known' ? plural(known.size, W.mark, W.marks) : `${plural(cands.length, 'candidate residue')}`;
    const seg =
      `<div class="seg" role="group" aria-label="Residues counted"><span class="seg-l">Count</span>` +
      [
        ['known', 'Known sites only'],
        ['all', 'All candidate residues'],
      ]
        .map(([k, t]) => `<button type="button" data-cc-mode="${k}" aria-pressed="${CMODE === k}">${t}</button>`)
        .join('') +
      `</div>${K.prop && K.prop.sources.some((s) => s.kind === 'somatic' && cn.some((x) => x.id === s.card)) ? ' ' + K.prop.hyperSwitch('Tumors and cell lines') : ''}`;
    // a protein several genes encode lists a residue once a gene, with a Gene column (a lone gene is the page's title)
    const geneOn = cn.some((x) => CCK.showGene(p.acc, tb, x));
    const genesAt = (r) => {
      const tot = {};
      r.cells.forEach((v) =>
        v.forEach((a) => Object.entries(a.by || {}).forEach(([g, n]) => (tot[g] = (tot[g] || 0) + n)))
      );
      const gs = Object.keys(tot).sort((a, b) => tot[b] - tot[a] || (a < b ? -1 : 1));
      return gs.length ? gs : [''];
    };
    const lines2 = geneOn
      ? per.flatMap((r) => genesAt(r).map((g, i) => ({ r, g, first: i === 0 })))
      : per.map((r) => ({ r, g: '', first: true }));
    const cellOf = (r, k, g, first) => {
      const v = g ? r.cells[k].map((a) => ({ alt: a.alt, n: a.by?.[g] || 0 })).filter((a) => a.n) : r.cells[k];
      return v.length
        ? esc(v.map((a) => siteName(rec, r.q, p.acc) + a.alt + (a.n > 1 ? ' ×' + a.n : '')).join(', '))
        : '<span class="muted">—</span>';
    };
    // each source's residues as lollipops: the count the card shows, O/E and q from the release's propensity tables
    const lol = cn.map((x) => {
      const counts = new Map();
      pool.forEach((q) => {
        const n = tot(x, q);
        if (n) counts.set(q, n);
      });
      return lollipopFor(p, rec, x, counts, known, (q) => {
        const v = CCK.at(tb, x, q);
        return v.length ? ' → ' + v.map((a) => a.alt + (a.n > 1 ? ' ×' + a.n : '')).join(', ') : '';
      });
    });
    const html =
      `<section class="pc-sec pc-cc"><h4>Changes at ${esc(CMODE === 'known' ? W.marks : W.residues)}</h4>${seg}` +
      `<p class="small muted">${
        CMODE === 'known' ? `Known ${esc(W.marks)} only.` : `All ${esc(W.residues)} of the protein.`
      }</p>` +
      `<ul class="small pc-cc-lines">${lines || ''}</ul>` +
      lol.map((l) => l.html).join('') +
      `<p class="small">${cn
        .map(
          (x, k) =>
            `${int(nSites[k])} of ${esc(what)} ${nSites[k] === 1 ? 'has' : 'have'} a change in at least one ` +
            `${esc(unitOf(x)[0])} (${esc(x.label)})`
        )
        .join('; ')}.</p>` +
      (per.length
        ? `<div class="tbl-wrap"><table class="pc-tbl"><thead><tr><th>${CMODE === 'known' ? 'Site' : 'Residue'}</th>${geneOn ? '<th>Gene</th>' : ''}${cn
            .map((x) => `<th>${esc(x.label)}</th>`)
            .join('')}</tr></thead><tbody>` +
          lines2
            .slice(0, 12)
            .map(
              ({ r, g, first }) =>
                `<tr><td>${known.has(r.q) ? siteLink(p, rec, r.q) : esc(siteName(rec, r.q, p.acc))}</td>${
                  geneOn ? `<td>${g ? geneHtml(g) : '<span class="muted">—</span>'}</td>` : ''
                }${cn.map((x, k) => `<td>${cellOf(r, k, g, first)}</td>`).join('')}</tr>`
            )
            .join('') +
          `</tbody></table></div>` +
          (lines2.length > 12
            ? `<p class="muted small">${int(lines2.length - 12)} more ${geneOn ? 'rows' : CMODE === 'known' ? 'sites' : 'residues'} changed.</p>`
            : '')
        : '') +
      (per.length
        ? `<p class="small screen-only"><button type="button" class="linkish" data-vc-dl="cc:${esc(p.acc)}">Download every change of the protein (TSV)</button></p>`
        : '') +
      `</section>`;
    return {
      html,
      nSites,
      nKnown: cn.map((x) => rec.marks.filter((m) => tot(x, m[0])).length),
      wait: lol.some((l) => l.wait),
    };
  }
  // ---- germline variants (card.variant_counts, cards.germline): one section a source, each from a table with a row per
  // variant. The same switch as the change counts (known sites only, or every candidate residue); a variant the entry
  // highlights comes first.
  const VMORE = new Set(); // the sources whose whole list is shown
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-vc-more]');
    if (!b) return;
    const id = b.dataset.vcMore;
    if (VMORE.has(id)) VMORE.delete(id);
    else VMORE.add(id);
    document.querySelectorAll('[data-pc="germline"]').forEach((el) => delete el.dataset.pcOk);
    paintAll();
  });
  const sci = (v) => (!isFinite(v) ? '–' : v === 0 ? '0' : v.toExponential(1).replace('.0e', 'e').replace('e-', 'e−'));
  function fieldCell(f, r) {
    const v = r[f.column];
    if (v === '' || v == null) return '<span class="muted">–</span>';
    if (f.type === 'stars') {
      const top = f.max || 4,
        n = Math.max(0, Math.min(top, +v || 0));
      return `<span class="vc-stars" title="${n} of ${top} review stars" aria-label="${n} of ${top} stars">${'★'.repeat(n)}${'☆'.repeat(top - n)}</span>`;
    }
    if (f.type === 'sci') return esc(sci(+v));
    if (f.type === 'int') return esc(int(+v));
    if (f.words) return esc(f.words[v] ?? v);
    const s = f.separator ? String(v).split(f.separator).filter(Boolean).join('; ') : String(v);
    return f.max && s.length > f.max ? `<span title="${esc(s)}">${esc(s.slice(0, f.max - 1))}…</span>` : esc(s);
  }
  // ---- the changes a card does not show (card.excluded, named by the card's `excluded`): a line with their count and why,
  // from the counts the protein's table shard keeps (`_xc`), and a download of the rows, read from their own file when asked
  // a gene as shown: an Ensembl id (a gene HGNC has no symbol for) reads "unnamed gene" with the id on hover and focus; two
  // overlapping genes ("A;B") read "A, B"
  const geneHtml = (g) =>
    String(g)
      .split(';')
      .map((x) =>
        /^ENSG\d+/.test(x)
          ? `<span class="gene-unnamed" tabindex="0" title="${esc(x)}">unnamed gene</span>`
          : esc(x.trim())
      )
      .join(', ');
  const excludedOf = (cfg) => (D.protein_view?.card?.excluded || []).find((e) => e.id === cfg?.excluded);
  function excludedLine(p, tb, cfg) {
    const x = excludedOf(cfg),
      by = Object.entries(tb._xc?.[x?.id] || {}),
      n = by.reduce((a, [, v]) => a + v, 0);
    if (!x || !n) return '';
    const why = (k) => (x.reasons || {})[k] || String(k).replace(/_/g, ' ');
    const text = by.length === 1 ? why(by[0][0]) : by.map(([k, v]) => `for ${int(v)}, ${why(k)}`).join('; ');
    // fewer than 3 rows are not worth a line: only a small download link (the line says what the rows are from 3 on)
    if (n < 3)
      return `<p class="small muted screen-only pc-excl"><button type="button" class="linkish" data-excl-dl="${esc(x.id)}:${esc(p.acc)}">Download ${n === 1 ? 'the change' : 'the changes'} not shown (TSV)</button></p>`;
    return (
      `<p class="small pc-excl"><b>${int(n)} ${n === 1 ? 'change' : 'changes'} not shown</b>: ${esc(text)}. ` +
      `<button type="button" class="linkish screen-only" data-excl-dl="${esc(x.id)}:${esc(p.acc)}">Download ${n === 1 ? 'it' : 'them'} (TSV)</button></p>`
    );
  }
  // the same downloads in the protein's Download menu, one item a list with at least one excluded row (the counts come with the
  // protein's table shard, so the items are added when it arrives and again after each render)
  function excludedMenu(p, tb) {
    const menu = document.querySelector('.prot-head [data-xm-page] .xm-items');
    if (!menu || !tb) return;
    menu.querySelectorAll('[data-excl-item]').forEach((b) => b.remove());
    const xs = (D.protein_view?.card?.excluded || []).filter(
      (x) => Object.values(tb._xc?.[x.id] || {}).reduce((a, v) => a + v, 0) > 0
    );
    for (const x of xs) {
      const cfg = Object.values(PC).find((c) => c?.excluded === x.id),
        label = xs.length > 1 ? `${cfg?.title || x.id}: changes not shown (TSV)` : 'Changes not shown (TSV)';
      menu.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="exp-btn xm-item" role="menuitem" data-excl-item data-excl-dl="${esc(x.id)}:${esc(p.acc)}" ` +
          `title="The changes of this protein that the page does not show, with the reason for each">${esc(label)}</button>`
      );
    }
  }
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest?.('[data-excl-dl]');
    if (!b) return;
    const [id, acc] = b.dataset.exclDl.split(':'),
      x = (D.protein_view?.card?.excluded || []).find((e) => e.id === id),
      p = CUR.p,
      rec = CUR.rec;
    if (!x || !p || p.acc !== acc) return;
    const d = await K.card.loadDetail(acc);
    const list = d?.[id];
    if (!list) return;
    const seq = rec?.seq || '',
      shown = (q) => (K.prot?.shownPos ? K.prot.shownPos(acc, q) : q),
      why = (k) => (x.reasons || {})[k] || String(k).replace(/_/g, ' ');
    const head = [
      'accession',
      'gene_of_protein',
      'position',
      'site',
      'source',
      'source_id',
      'gene',
      'source_ref',
      'canonical_ref',
      'alt',
      'reason',
      'why',
    ];
    const text = list.map((r) =>
      [
        acc,
        p.gene || '',
        r.position,
        (r.canonical_ref || seq[r.position - 1] || '') + shown(r.position),
        r.source,
        r.source_id,
        r.gene,
        r.source_ref,
        r.canonical_ref,
        r.alt,
        r.reason,
        why(r.reason),
      ]
        .map(tsvCell)
        .join('\t')
    );
    K.download(
      `${acc}_variants_not_shown_${id}.tsv`,
      K.preamble(
        `${p.gene || acc}: variants not shown`,
        `the ${int(list.length)} changes of ${p.gene || acc} that the page does not show, because ${[...new Set(list.map((r) => why(r.reason)))].join(' or ')}; ` +
          `rows of the release's excluded-changes table; position is the position the source gives (UniProt's frame)`
      ) +
        head.join('\t') +
        '\n' +
        text.join('\n') +
        '\n',
      'text/tab-separated-values'
    );
  });
  // the whole list of a source, every candidate residue of the protein, as a TSV (the gene column kept whenever the table has it)
  const tsvCell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
  function listDownload(key) {
    const [kind, a, b] = key.split(':'),
      acc = kind === 'cc' ? a : b,
      p = CUR.p,
      rec = CUR.rec,
      tb = TB[acc];
    if (!p || !rec || !tb) return;
    const seq = rec.seq || '',
      known = new Set(rec.marks.map((m) => m[0])),
      shown = (q) => (K.prot?.shownPos ? K.prot.shownPos(acc, q) : q),
      head = ['source', 'accession', 'gene_of_protein', 'position', 'site', 'known_site', 'residue'];
    let out, name, what;
    if (kind === 'cc') {
      const cn = K.card.cc.entries;
      const gcol = cn.some((x) => x.gene);
      out = [[...head, 'change', ...(gcol ? ['gene'] : []), 'count'].join('\t')];
      cn.forEach((x) =>
        (x.tables || []).forEach((t) =>
          rows(tb, t)
            .slice()
            .sort((u, v) => u.position - v.position)
            .forEach((r) =>
              out.push(
                [
                  x.label,
                  acc,
                  p.gene || '',
                  r.position,
                  seq[r.position - 1] + shown(r.position),
                  known.has(r.position) ? 'yes' : 'no',
                  seq[r.position - 1] || '',
                  seq[r.position - 1] + shown(r.position) + r.alt,
                  ...(gcol ? [r[x.gene] || ''] : []),
                  r.n,
                ]
                  .map(tsvCell)
                  .join('\t')
              )
            )
        )
      );
      name = `${acc}_changes`;
      what = `every change at the residues of ${p.gene || acc} that the sources list, one row per site, new residue and gene, with the number of tumors or cell lines that carry it`;
    } else {
      const x = K.card.vc.entries.find((e) => e.id === a);
      if (!x || !tb._vd?.[x.id]) return;
      const cols = [
        x.alt || 'alt',
        ...(x.gene ? [x.gene] : []),
        ...(x.fields || []).map((f) => f.column),
        ...(x.link ? [x.link.column] : []),
      ];
      out = [[...head, 'change', ...cols.map((c) => (c === (x.alt || 'alt') ? 'alt' : c))].join('\t')];
      tb._vd[x.id].forEach((r) =>
        out.push(
          [
            x.label,
            acc,
            p.gene || '',
            r.position,
            seq[r.position - 1] + shown(r.position),
            known.has(r.position) ? 'yes' : 'no',
            seq[r.position - 1] || '',
            seq[r.position - 1] + shown(r.position) + r[x.alt || 'alt'],
            ...cols.map((c) => r[c]),
          ]
            .map(tsvCell)
            .join('\t')
        )
      );
      name = `${acc}_${x.id}_variants`;
      what = `every ${x.label} variant at the residues of ${p.gene || acc}, one row per variant`;
    }
    K.download(
      name + '.tsv',
      K.preamble(`${p.gene || acc}: ${what.split(',')[0]}`, what + '; the position column is the UniProt position') +
        out.join('\n') +
        '\n',
      'text/tab-separated-values'
    );
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-vc-dl]');
    if (b) listDownload(b.dataset.vcDl);
  });
  function germlineSource(p, rec, tb, x, pool, letters, nKnown) {
    const VCK = K.card.vc,
      seq = rec.seq || '',
      known = new Set(rec.marks.map((m) => m[0])),
      unit = x.unit || ['variant', 'variants'],
      alt = x.alt || 'alt',
      shown = (q) => (K.prot?.shownPos ? K.prot.shownPos(p.acc, q) : q),
      limit = PC.germline?.limit || 12,
      all = pool.flatMap((q) => VCK.at(tb, x, q).map((r) => ({ q, r }))),
      byQ = new Map(),
      mine = VCK.sites(tb, x, pool); // the sites with a variant and with a highlighted one: the site card's counter
    for (const q of pool) {
      const n = VCK.sum(tb, x, q).n;
      if (n) byQ.set(q, n);
    }
    const nHot = mine.hot;
    const known1 = CMODE === 'known';
    const lines = letters
      .map((l) => {
        const qs = pool.filter((q) => seq[q - 1] === l),
          n = qs.reduce((a, q) => a + (byQ.get(q) || 0), 0),
          b = VCK.avg(tb, x, l),
          nm = VCK.residueName(l),
          one = known1 ? `known ${W.mark}` : `candidate ${nm}`,
          many = known1 ? `known ${W.marks}` : `candidate ${VCK.residueNames(l)}`,
          of = known1 && letters.length > 1 ? ` (${VCK.residueNames(l)})` : '';
        return (
          `<li>${int(n)} ${esc(n === 1 ? unit[0] : unit[1])} at its ${esc(plural(qs.length, one, many))}${esc(of)} · ` +
          `per ${known1 ? 'site' : esc(nm)}: <b>${VCK.avgText(qs.length ? n / qs.length : null)}</b> · ` +
          `protein average per ${esc(nm)}: <b>${VCK.avgText(b?.per)}</b></li>`
        );
      })
      .join('');
    const what = known1 ? plural(known.size, W.mark, W.marks) : plural(nKnown.cands, 'candidate residue');
    const hotWord = x.highlight?.label ? ` (${int(nHot)} with ${esc(x.highlight.label)})` : '';
    const sorts = x.sort || [];
    all.sort((a, b) => {
      const h = VCK.hot(x, b.r) - VCK.hot(x, a.r);
      if (h) return h;
      for (const s of sorts) {
        const d = (+b.r[s.column] || 0) - (+a.r[s.column] || 0);
        if (d) return s.order === 'asc' ? -d : d;
      }
      return a.q - b.q;
    });
    const open = VMORE.has(x.id),
      list1 = open ? all : all.slice(0, limit);
    const fields = x.fields || [];
    const geneOn = VCK.showGene(p.acc, tb, x);
    const row = ({ q, r }) => {
      const l = seq[q - 1],
        hot = VCK.hot(x, r),
        link =
          x.link && r[x.link.column]
            ? ext(x.link.url.replace('{}', encodeURIComponent(r[x.link.column])), `${esc(x.label)} ↗`)
            : '';
      return (
        `<tr${hot ? ' class="vc-hot"' : ''}><td>${known.has(q) ? siteLink(p, rec, q) : esc(siteName(rec, q, p.acc))}</td>` +
        `<td>${esc(l + shown(q) + r[alt])}${hot && x.highlight.label ? ` <span class="tag vc-hot-tag" title="${esc(x.highlight.title || '')}">${esc(x.highlight.label)}</span>` : ''}</td>` +
        (geneOn ? `<td>${r[x.gene] ? geneHtml(r[x.gene]) : '<span class="muted">–</span>'}</td>` : '') +
        fields.map((f) => `<td>${fieldCell(f, r)}</td>`).join('') +
        `<td>${link}</td></tr>`
      );
    };
    const counts = new Map();
    pool.forEach((q) => {
      if (byQ.get(q)) counts.set(q, byQ.get(q));
    });
    const lol = lollipopFor(p, rec, x, counts, known, (q) => {
      const v = VCK.at(tb, x, q);
      return v.length ? ' → ' + [...new Set(v.map((r) => r[alt]))].join(', ') : '';
    });
    const html =
      `<section class="pc-sec pc-vc"><h4>${esc(x.label)}</h4>` +
      `<ul class="small pc-cc-lines">${lines}</ul>` +
      lol.html +
      `<p class="small">${int(mine.any)} of ${esc(what)} ${mine.any === 1 ? 'has' : 'have'} a variant${hotWord}.</p>` +
      (all.length
        ? `<div class="tbl-wrap"><table class="pc-tbl"><thead><tr><th>${known1 ? 'Site' : 'Residue'}</th><th>Change</th>${geneOn ? '<th>Gene</th>' : ''}${fields
            .map((f) => `<th>${esc(f.label || f.column)}</th>`)
            .join('')}<th></th></tr></thead><tbody>${list1.map(row).join('')}</tbody></table></div>` +
          (all.length > limit
            ? `<p class="small"><button type="button" class="linkish" data-vc-more="${esc(x.id)}">${
                open ? 'Show fewer' : `Show all ${int(all.length)} ${esc(unit[1])}`
              }</button>${open ? '' : ` <span class="muted">(${int(limit)} shown${x.highlight?.label ? `, ${esc(x.highlight.label)} first` : ''})</span>`}</p>`
            : '')
        : '') +
      (all.length
        ? `<p class="small screen-only"><button type="button" class="linkish" data-vc-dl="vc:${esc(x.id)}:${esc(p.acc)}">Download every ${esc(unit[0])} of the protein (TSV)</button></p>`
        : '') +
      `</section>`;
    return {
      html,
      nHot,
      nSites: mine.any,
      wait: lol.wait,
    };
  }
  function germlineBuild(p, rec, tb, el) {
    const VCK = K.card.vc,
      resSet = new Set(D.residues || []),
      seq = rec.seq || '',
      known = new Set(rec.marks.map((m) => m[0])),
      order = (l) => (D.residues || []).indexOf(l);
    const cands = [];
    for (let i = 0; i < seq.length; i++) if (resSet.has(seq[i])) cands.push(i + 1);
    const pool = CMODE === 'all' ? cands : [...known].filter((q) => seq[q - 1]).sort((a, b) => a - b);
    const letters = [...new Set(pool.map((q) => seq[q - 1]))].sort((a, b) => order(a) - order(b));
    // the closed card's summary: the known sites with a variant, and with a highlighted one (the site card's counter)
    const knownSum = (x) => {
      const c = VCK.sites(
        tb,
        x,
        rec.marks.map((q) => q[0])
      );
      return `${x.label}: ${c.any ? plural(c.any, 'site') : 'no site'} with a variant${x.highlight?.label && c.any ? ` (${int(c.hot)} ${x.highlight.label})` : ''}`;
    };
    const lazy = VCK.entries.some((x) => x.lazy);
    if (lazy && !tb._vd) {
      // the variant lists are in files of their own: read when the card is opened; closed, only the counts show
      const sums = VCK.entries.map((x) => knownSum(x));
      if (!el.closest('details')?.open) return { html: '', sum: sums.join(' · ') };
      const d = detail(p.acc);
      if (d === undefined) return { html: K.loading('Loading the variants…'), sum: sums.join(' · '), wait: true };
      if (d === null) return { html: '<p class="muted">The variants could not be read.</p>', sum: sums.join(' · ') };
      tb._vd = d;
    }
    const secs = VCK.entries.map((x) => germlineSource(p, rec, tb, x, pool, letters, { cands: cands.length }));
    const seg =
      `<div class="seg" role="group" aria-label="Residues counted"><span class="seg-l">Count</span>` +
      [
        ['known', 'Known sites only'],
        ['all', 'All candidate residues'],
      ]
        .map(([k, t]) => `<button type="button" data-cc-mode="${k}" aria-pressed="${CMODE === k}">${t}</button>`)
        .join('') +
      `</div>`;
    const html = `${seg}<p class="small muted">${
      CMODE === 'known' ? `Known ${esc(W.marks)} only.` : `All ${esc(W.residues)} of the protein.`
    }</p><div class="pc-grid pc-grid-wide">${secs.map((s) => s.html).join('')}</div>${excludedLine(p, tb, PC.germline)}`;
    const sum = VCK.entries.map((x) => knownSum(x)).join(' · ');
    return { html, sum, wait: secs.some((s) => s.wait) };
  }
  function dependencyBuild(p, rec, tb) {
    const cfg = PC.dependency,
      r = rows(tb, cfg.table)[0],
      unit = cfg.unit || 'lines',
      g = gene(p);
    let dep = '';
    if (!r) dep = `<p class="muted">No dependency screen covers ${esc(g)}, or it is named by another gene.</p>`;
    else {
      const ce = /^true$/i.test(r.common_essential || ''),
        lines = num(r.lines),
        dn = num(r.dependent),
        bins = String(r.histogram || '')
          .split(';')
          .filter((x) => x !== '');
      dep =
        `<p class="dm-call">${
          ce
            ? '<span class="tag dm-ce" title="Called commonly essential by the screen: among ' +
              'the strongest dependencies of most lines">commonly essential</span> '
            : ''
        }<b>${int(dn)} of ${int(lines)}</b> ${esc(unit)} depend on ${esc(g)}; median ` +
        `gene effect <b>${fmt3(num(r.median))}</b>.</p>` +
        (cfg.histogram && bins.length ? histSvg(cfg.histogram, bins, cfg) : '') +
        (r.lineages
          ? `<p class="small"><span class="flabel">Most dependent lineages</span> ${list(r.lineages)
              .map((x) => {
                const [n, k, m] = x.split('|');
                return `${esc(n)} ${fmt3(num(m))} <span class="muted">(${plural(+k, 'line')})</span>`;
              })
              .join(' · ')} <span class="muted">` + `(mean gene effect)</span></p>`
          : '');
    }
    // the changes at the marks: the site card's changes (website.protein.card.changes), one column each
    const ch = (D.protein_view?.card?.changes || []).filter((x) => SPECS[x.attribute]);
    let chg = '',
      nSites = [];
    if (ch.length) {
      const per = rec.marks
        .map((m) => ({
          pos: m[0],
          cells: ch.map((x) => {
            const sep = SPECS[x.attribute].separator || '; ',
              vals = String(attrVal(m, x.attribute)).split(sep).filter(Boolean);
            const n = has(x.table) && x.counts ? list((K.card.at(tb, x.table, m[0])[0] || {})[x.counts]) : [];
            return { vals, n };
          }),
        }))
        .filter((r) => r.cells.some((c) => c.vals.length));
      nSites = ch.map((x, k) => per.filter((r) => r.cells[k].vals.length).length);
      const total = rec.marks.length;
      chg =
        `<p class="small">${ch
          .map(
            (x, k) =>
              `${int(nSites[k])} of its ${plural(total, W.mark, W.marks)} ${nSites[k] === 1 ? 'has' : 'have'} a change ` +
              `in at least one ${esc((x.unit || ['record'])[0])} (${esc(x.label)})`
          )
          .join('; ')}.</p>` +
        (per.length
          ? `<div class="tbl-wrap"><table class="pc-tbl"><thead><tr><th>Site</th>${ch
              .map((x) => `<th>${esc(x.label)}</th>`)
              .join('')}</tr></thead>` +
            `<tbody>` +
            per
              .sort(
                (a, b) =>
                  b.cells.reduce((s, c) => s + c.n.reduce((q, v) => q + (+v || 0), 0), 0) -
                    a.cells.reduce((s, c) => s + c.n.reduce((q, v) => q + (+v || 0), 0), 0) || a.pos - b.pos
              )
              .slice(0, 12)
              .map(
                (r) =>
                  `<tr><td>${siteLink(p, rec, r.pos)}</td>${r.cells
                    .map(
                      (c, k) =>
                        `<td>${
                          c.vals.length
                            ? esc(c.vals.join(', ')) +
                              (c.n.length
                                ? ` <span class="muted ` + `small">(${c.n.map((v) => '×' + v).join(', ')})</span>`
                                : '')
                            : '<span class="muted">—</span>'
                        }</td>`
                    )
                    .join('')}</tr>`
              )
              .join('') +
            `</tbody></table></div>` +
            (per.length > 12
              ? `<p class="muted small">${int(per.length - 12)} more sites ` +
                `changed; the protein map draws them all.</p>`
              : '')
          : '');
    }
    const cnSec = K.card.cc?.entries.length ? changeCountsSection(p, rec, tb) : null;
    const html =
      `${
        cfg.url ? `<p class="actions">${ext(cfg.url.replace('{gene}', encodeURIComponent(g)), 'Source ↗')}</p>` : ''
      }` +
      `<div class="pc-grid"><section class="pc-sec"><h4>CRISPR dependency</h4>${dep}</section>` +
      (ch.length
        ? `<section class="pc-sec"><h4>Changes at ${esc(W.residues)}</h4>${chg}${cfg.changes_note ? `` : ''}</section>`
        : '') +
      (cnSec ? cnSec.html : '') +
      '</div>' +
      excludedLine(p, tb, cfg) +
      (cfg.note ? `` : '');
    const first = ch[0],
      sum = [
        r
          ? /^true$/i.test(r.common_essential || '')
            ? 'commonly essential'
            : `${int(num(r.dependent))} of ${int(num(r.lines))} lines depend on it`
          : 'not screened',
        ch.length
          ? `${nSites[0] ? plural(nSites[0], 'site') : 'no site'} changed in ${(first.unit || ['', 'records'])[1]}`
          : '',
        cnSec
          ? `${cnSec.nKnown[0] ? plural(cnSec.nKnown[0], 'site') : 'no site'} changed in ${(K.card.cc.entries[0].unit || ['', 'records'])[1]}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
    const depPic =
      r && !/^true$/i.test(r.common_essential || '') && num(r.lines)
        ? meters1(
            'Dependent',
            num(r.dependent) / num(r.lines),
            `${int(num(r.dependent))} of ${int(num(r.lines))} lines`
          )
        : '';
    return { html, sum, pic: depPic, wait: !!cnSec?.wait };
  }

  // ---- inhibitors, knockouts and knockdowns of the mark's enzymes: a site against each experiment, a mark per call -----------------------
  function perturbationsBuild(p, rec, tb) {
    const cfg = PC.perturbations,
      CL = D.protein_view?.card?.calls || {},
      marks = CL.marks || {},
      words = CL.words || {},
      skip = new Set(CL.skip || []);
    const cols = [
      ...Object.entries(CL.attributes || {})
        .filter(([a]) => SPECS[a])
        .map(([a, lab]) => ({ key: 'a:' + a, label: lab, attr: a })),
      ...Object.entries(CL.conditions || {}).map(([c, lab]) => ({ key: 'c:' + c, label: lab, cond: c })),
    ];
    const cell = new Map(); // 'pos|key' -> {call, tip}
    for (const m of rec.marks) {
      for (const c of cols)
        if (c.attr) {
          const v = String(attrVal(m, c.attr));
          if (v && !skip.has(v)) cell.set(`${m[0]}|${c.key}`, { call: v, tip: `${c.label}: ${word(words, v)}` });
        }
      for (const t of CL.tables || [])
        for (const r of K.card.at(tb, t, m[0])) {
          if (skip.has(r.call)) continue;
          const k = `${m[0]}|c:${r.condition}`;
          cell.set(k, {
            call: r.call,
            tip: [
              `${(CL.conditions || {})[r.condition] || r.condition}: ${word(words, r.call)}`,
              r.n
                ? plural(+r.n, 'peptide') + (r.n_down || r.n_up ? ` (${r.n_down || 0} down, ${r.n_up || 0} up)` : '')
                : '',
              r.value !== undefined && r.value !== '' ? `log2 ${num(r.value) > 0 ? '+' : ''}${fmt3(num(r.value))}` : '',
              r.q ? `q ${K.fq(+r.q)}` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          });
        }
    }
    const used = cols.filter((c) => [...cell.keys()].some((k) => k.endsWith('|' + c.key))),
      sites = rec.marks
        .map((m) => m[0])
        .filter((pos) => used.some((c) => cell.has(`${pos}|${c.key}`)))
        .sort((a, b) => a - b);
    const head = ``;
    if (!sites.length)
      return {
        html: head + K.noData(`No quantified ${W.marks} for this protein.`),
        sum: 'not measured',
      };
    const mk = (c) => marks[c] || (c === 'no_significant_change' ? '○' : '?');
    const down = sites.filter((pos) => used.some((c) => cell.get(`${pos}|${c.key}`)?.call === 'decreased')).length;
    const keyP =
      `<p class="pc-key">${Object.entries(marks)
        .map(([c, m]) => `<span><span class="trend c-${esc(c)}"><b>${esc(m)}</b></span> ${esc(word(words, c))}</span>`)
        .join('')}<span>○ no ` +
      `significant change</span><span>blank: not quantified · tap, hover or focus a site for its numbers</span></p>`;
    const html =
      head +
      keyP +
      (`<div class="tbl-wrap"><table class="pc-tbl pert"><thead><tr><th scope="col">` +
        `Site</th>${used.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>`) +
      sites
        .map(
          (pos) =>
            `<tr><th scope="row">${siteLink(p, rec, pos)}</th>${used
              .map((c) => {
                const x = cell.get(`${pos}|${c.key}`);
                return x
                  ? `<td title="${esc(x.tip)}"><span class="trend ` +
                      `c-${esc(x.call)}"><b aria-hidden="true">${esc(mk(x.call))}</b><span class="vh">${esc(word(words, x.call))}</span></span></td>`
                  : '<td class="muted" title="Not quantified">&nbsp;</td>';
              })
              .join('')}</tr>`
        )
        .join('') +
      `</tbody></table></div>` +
      (cfg.note ? `` : '');
    return {
      html,
      sum: `${int(down)} of ${int(sites.length)} quantified sites decreased in at least one`,
      pic: meters1('Decreased', down / sites.length, `${int(down)} of ${int(sites.length)} sites`),
    };
  }

  // ---- Experiments on its methylation ----------------------------------------------------------------------------------
  function experimentsBuild(p, rec, tb) {
    const cfg = PC.experiments,
      rs = rows(tb, cfg.table);
    if (!rs.length) return { hide: true, html: '', sum: '' };
    const dir = (d) =>
      d === 'decreased'
        ? '<b class="trend c-decreased" aria-hidden="true">▼</b><span class="vh">decreased:</span> fell'
        : d === 'increased'
          ? '<b class="trend c-increased" aria-hidden="true">▲</b><span class="vh">increased:</span> rose'
          : d === 'no_change'
            ? 'no change'
            : '—';
    const html =
      `<div class="tbl-wrap"><table class="pc-tbl exp"><thead><tr><th>Site</th><th>Experiment</th><th>` +
      `Readout</th><th>Change</th><th>Finding</th><th>Paper</th></tr></thead><tbody>` +
      rs
        .map(
          (r) =>
            `<tr><td>${
              r.position
                ? siteLink(p, rec, +r.position) +
                  (r.in_release === 'false'
                    ? ` <span class="muted ` + `small">not a ${esc(W.mark)} of this release</span>`
                    : '')
                : esc(r.region)
            }</td>` +
            `<td>${esc(r.perturbation)}<br><span class="muted small">${esc(
              [r.system, r.species].filter(Boolean).join(', ')
            )}</span></td><td>${esc(r.readout)}</td><td>${dir(r.direction)}</td>` +
            `<td>${esc(r.finding)}${r.figure ? ` <span class="muted small">(${esc(r.figure)})</span>` : ''}${
              r.read_from === 'abstract' ? ' <span class="muted small">from the abstract</span>' : ''
            }</td>` +
            `<td>${r.doi ? ext('https://doi.org/' + r.doi, esc(r.reference)) : esc(r.reference)}</td></tr>`
        )
        .join('') +
      '</tbody></table></div>' +
      (cfg.note ? `` : '');
    return { hide: false, html, sum: plural(rs.length, 'experiment') };
  }

  // ---- Clustering ------------------------------------------------------------------------------------------------------
  function clusteringBuild(p, rec, tb) {
    const cfg = PC.clustering,
      r = rows(tb, cfg.table)[0],
      sub = ``;
    if (!r) return { html: sub + `<p class="muted">No clustering is recorded for ${esc(gene(p))}.</p>`, sum: '' };
    const sp = num(r.spacing_median),
      n = rec.marks.length,
      win = num(r.window_size),
      sites = num(r.window_sites),
      q = num(r.window_q);
    const wins = (cfg.windows || []).map((w) => [w, num(r['max_' + w])]).filter(([, v]) => v != null);
    const clusters = list(r.clusters)
      .map((c) => c.split(',').map(Number))
      .filter((c) => c.length);
    const sh = (q) => (K.prot?.shownPos ? K.prot.shownPos(p.acc, +q) : +q);
    const range = `${letter(rec, +r.window_start)}${sh(r.window_start)}–${sh(r.window_end)}`;
    // one sentence answers "are they bunched?"; spacing, windows, architecture and the sequence picture sit behind a toggle
    const bunched = win != null && sites != null && q != null,
      verdict = !bunched
        ? ''
        : q > PADJ
          ? `${esc(gene(p))}’s ${esc(W.marks)} are no more bunched than its ${esc(W.residues)} allow (q ${qf(q)}).`
          : `${int(sites)} ${esc(W.marks)} within ${int(win)} aa (${esc(range)}), more than the spacing of its ${esc(W.residues)} predicts (q ${qf(q)}).`;
    const dl =
      '<dl class="pc-dl">' +
      (sp == null
        ? `<dt>Spacing</dt><dd>${n === 1 ? `a single ${esc(W.mark)}` : 'not recorded'}</dd>`
        : `<dt>Closest ` + `/ median spacing</dt><dd>${int(num(r.spacing_min))} aa / ${int(sp)} aa</dd>`) +
      (wins.length
        ? `<dt>Most ${esc(W.marks)} within</dt><dd>${wins.map(([w, v]) => `${w} aa: ${int(v)}`).join(' · ')}</dd>`
        : '') +
      (r.architecture
        ? `<dt>Architecture</dt><dd>${esc(r.architecture)}${
            clusters.length
              ? `<br><span ` +
                `class="muted small">clusters ${clusters
                  .map((c) => `${sh(c[0])}–${sh(c[c.length - 1])} (${c.length})`)
                  .join(', ')}</span>`
              : ''
          }</dd>`
        : '') +
      '</dl>';
    const len0 = p.len || (rec.seq || '').length || 1,
      bw =
        win != null && r.window_start
          ? [{ a: +r.window_start, b: +r.window_end, cls: 'fp-u fp-u1', tip: 'top window' }]
          : [];
    const pic = K.pfolds
      ? K.pfolds.track(
          len0,
          [
            {
              label: 'Clusters',
              items: [...clusters.map((c) => ({ a: c[0], b: c[c.length - 1], cls: 'fp-u fp-u0' })), ...bw],
            },
            { label: 'Sites', items: rec.marks.map((m) => ({ a: m[0], dot: true, cls: 'fp-site' })) },
          ],
          undefined,
          p.acc
        )
      : '';
    const html =
      sub +
      (verdict ? `<p class="pc-verdict">${verdict}</p>` : '') +
      `<details class="pc-more"><summary>Spacing and sequence picture</summary>${dl}${pic}</details>`;
    return {
      pic: '',
      html,
      sum: !bunched
        ? sp != null
          ? `median spacing ${int(sp)} aa`
          : ''
        : q > PADJ
          ? `not bunched (q ${qf(q)})`
          : `${int(sites)} within ${int(win)} aa (q ${qf(q)})`,
    };
  }

  // ---- Other PTMs ------------------------------------------------------------------------------------------------------
  // the modifications of the protein: the map's own marks (its legend counts) where the site has any, else the site's table
  function ptmsBuild(p, rec, tb) {
    const cfg = PC.other_ptms,
      near = cfg.near || 0,
      marks = rec.marks.map((m) => m[0]),
      ctx = K.map?.ctxIds?.().length ? K.map.contextMarks(p.acc) : undefined;
    if (ctx === null) {
      setTimeout(paintAll, 300);
      return { html: K.loading('Loading…'), wait: true };
    }
    const kinds = ctx ? Object.fromEntries(ctx.map((c) => [c.id, c.label])) : cfg.kinds || {},
      rs = ctx ? ctx.flatMap((c) => c.pos.map((a) => ({ kind: c.id, start: a }))) : rows(tb, cfg.table);
    if (!rs.length)
      return {
        html: `<p class="muted">No other modification is recorded on ${esc(gene(p))}.</p>`,
        sum: 'none recorded',
      };
    // the counts come from the one function (K.nearIn, kit-cols.js): window and score cut-off are its own and are printed
    const kinds0 = [...Object.keys(kinds), ...[...new Set(rs.map((r) => r.kind))].filter((k) => !(k in kinds))],
      cm = ctx
        ? ctx
        : kinds0.map((k) => ({
            id: k,
            label: word(kinds, k),
            short: word(kinds, k),
            pos: [...new Set(rs.filter((r) => r.kind === k).map((r) => r.start))].sort((x, y) => x - y),
            high: null,
            cut: '',
            score: new Map(),
          })),
      win = near ? K.D.context_window || near : 0,
      nm = near && K.nearIn ? K.nearIn(cm, marks, win) : null;
    const by = (k) => rs.filter((r) => r.kind === k);
    const body = kinds0
      .filter((k) => by(k).length)
      .map((k) => {
        const kn = nm?.kinds.find((x) => x.id === k),
          nr = kn ? kn.near : [],
          n = new Set(by(k).map((r) => r.start)).size,
          cutNote = kn?.high != null ? ` <span class="muted">(${int(kn.high)} with ${esc(kn.cut)})</span>` : '';
        return {
          k,
          label: word(kinds, k),
          n,
          near: nr,
          html:
            `<div class="pc-kind"><b>${esc(word(kinds, k))}</b> <span ` +
            `class="num">${int(n)}</span>${cutNote}` +
            (nm
              ? `<p class="small">${
                  nr.length
                    ? `${plural(nr.length, 'site')} within ±${win} aa of a ${esc(W.mark)}${
                        kn.high != null ? ` (${int(kn.nearHigh)} with ${esc(kn.cut)})` : ''
                      }`
                    : `none within ±${win} aa of a ${esc(W.mark)}`
                }${
                  nr.length
                    ? `: ` +
                      nr
                        .slice(0, 12)
                        .map(
                          (r) =>
                            `<span class="tag" ` +
                            `title="${esc(by(k).find((x) => x.start === r.pos)?.source || '')}">${esc(siteName(rec, r.pos, p.acc))} · ${esc(siteName(rec, r.from, p.acc))}</span>`
                        )
                        .join(' ') +
                      (nr.length > 12 ? ` +${nr.length - 12}` : '')
                    : ''
                }</p>`
              : '') +
            '</div>',
        };
      });
    const len1 = p.len || (rec.seq || '').length || 1;
    return {
      pic: K.pfolds
        ? K.pfolds.track(
            len1,
            [
              ...body.slice(0, 2).map((b) => ({
                label: b.label.slice(0, 9),
                items: rs.filter((r) => r.kind === b.k).map((r) => ({ a: r.start, dot: true, cls: 'fp-ptm' })),
              })),
              { label: 'Sites', items: rec.marks.map((m) => ({ a: m[0], dot: true, cls: 'fp-site' })) },
            ],
            undefined,
            p.acc
          )
        : '',
      html: `` + body.map((b) => b.html).join('') + (cfg.note ? `` : ''),
      sum:
        body.map((b) => `${b.label} ${int(b.n)}`).join(' · ') +
        (nm && nm.residues ? ` · ${plural(nm.residues, 'residue')} within ±${win} aa of a ${W.mark}` : ''),
    };
  }

  // ---- the live parts of the Disease card: UniProt's diseases, Open Targets' scores -----------------------------------
  const famNames = (c, p) => {
    const aid = c.term_groups?.families?.[0],
      sd = K.sel.pdata(p.i),
      ps = sd?.protein_sets?.[aid];
    return ps ? ps.sets.map((x) => x[0]).filter((s) => K.sel.setHas(aid, s, p.i)) : [];
  };
  function liveBuild(p, rec, tb, el) {
    const c = LIVE[+el.dataset.pcLive],
      u = c.live.uniprot ? uniprot(p.acc) : null,
      ot = c.live.open_targets;
    let html = '';
    if (c.live.uniprot) {
      html += '<p class="flabel">Curated in UniProt</p>';
      html +=
        u === undefined
          ? '<p class="note">Asking UniProt…</p>'
          : u === null
            ? '<p class="muted">UniProt did not answer. Nothing on this page depends on it.</p>'
            : u.diseases.length
              ? `<ul class="term-list uni-dis">${u.diseases
                  .map(
                    (d) =>
                      `<li><b>${esc(d.name)}</b>${d.acronym ? ` (${esc(d.acronym)})` : ''}` +
                      (d.id
                        ? ' ' +
                          ext(
                            'https://www.uniprot.org/diseases/' + encodeURIComponent(d.id),
                            esc(d.id) + ' ↗',
                            'The UniProt disease entry'
                          )
                        : '') +
                      (d.mim
                        ? ' ' + ext('https://omim.org/entry/' + encodeURIComponent(d.mim), 'MIM ' + esc(d.mim) + ' ↗')
                        : '') +
                      (d.note
                        ? `<br><span class="muted small">${esc(
                            d.note.length > 220 ? d.note.slice(0, 218) + '…' : d.note
                          )}</span>`
                        : '') +
                      '</li>'
                  )
                  .join('')}</ul>`
              : '<p class="muted">No disease involvement curated in UniProt.</p>';
    }
    if (ot) {
      html += '<p class="flabel">Open Targets association scores</p>';
      const id = u && u.ensg && u.ensg[0],
        d = id ? openTargets(id, ot) : null;
      if (u === undefined) html += '<p class="muted">Waiting for UniProt…</p>';
      else if (!id) html += '<p class="muted">No Ensembl gene for this entry.</p>';
      else if (d === undefined) html += '<p class="note">Asking Open Targets…</p>';
      else if (d === null) html += '<p class="muted">Open Targets did not answer.</p>';
      else if (!d.rows.length) html += '<p class="muted">No Open Targets disease associations.</p>';
      else {
        const OT_TYPES = {
          genetic_association: 'genetics',
          somatic_mutation: 'somatic',
          known_drug: 'drugs',
          affected_pathway: 'pathways',
          rna_expression: 'expression',
          literature: 'literature',
          animal_model: 'animal models',
        };
        html +=
          `<ul class="ot-list">${d.rows
            .map((r) => {
              const types = (r.datatypeScores || [])
                .filter((t) => t.score > 0)
                .sort((x, y) => y.score - x.score)
                .slice(0, 3)
                .map((t) => OT_TYPES[t.id] || t.id.replace(/_/g, ' '));
              return (
                `<li><span class="ot-name">${ext(
                  `https://platform.opentargets.org/evidence/${encodeURIComponent(id)}/${encodeURIComponent(r.disease.id)}`,
                  esc(r.disease.name)
                )}${types.length ? ` <span class="muted ` + `small">${esc(types.join(', '))}</span>` : ''}</span>` +
                (`<span class="pc-bar" title="Overall association score ${r.score.toFixed(2)}"><i style="width:${(100 * r.score).toFixed(0)}%"></i></span>` +
                  `<span class="num">${r.score.toFixed(2)}</span></li>`)
              );
            })
            .join('')}</ul>` +
          (`<p class="note">Top ${d.rows.length} of ${int(d.count)} diseases by overall association score (0–1) for ` +
            `this gene. ${
              ot.page
                ? ext(
                    ot.page.replace('{id}', encodeURIComponent(id)).replace('{gene}', encodeURIComponent(gene(p))),
                    'All in Open Targets ↗'
                  ) + ' · '
                : ''
            }CC0</p>`);
      }
    }
    const fam = famNames(c, p),
      sumEl = document.querySelector(`[data-pc-sum="live${el.dataset.pcLive}"]`);
    if (sumEl && u !== undefined)
      sumEl.textContent =
        [
          u
            ? u.diseases.length
              ? 'UniProt: ' +
                sumList(
                  u.diseases.map((d) => d.acronym || d.name),
                  2
                )
              : 'none curated in UniProt'
            : '',
          K.sel.pdata(p.i) ? (fam.length ? 'families: ' + sumList(fam, 2) : 'in no disease family') : '',
        ]
          .filter(Boolean)
          .join(' · ') ||
        c.summary ||
        '';
    const fold0 = el.closest('details');
    if (fold0?.id && K.sel.pdata(p.i))
      K.pfolds?.set(
        fold0.id,
        fam.length ? K.pfolds.bigN([[int(fam.length), fam.length === 1 ? 'disease family' : 'disease families']]) : ''
      );
    return { html, wait: u === undefined || (ot && u && u.ensg[0] && OT[u.ensg[0]] === undefined) };
  }
  const liveAt = (c) => LIVE.findIndex((x) => x.title === c.title); // the page's card is a copy of the site's entry
  K.setsLive = {
    html: (c, p) => (c.live ? `<div class="pc pc-live" data-pc="live" data-pc-live="${liveAt(c)}"></div>` : ''),
    sum: (c, p) => (c.live ? `<span data-pc-sum="live${liveAt(c)}">${esc(c.summary || '')}</span>` : undefined),
  };

  // ---- the folds -----------------------------------------------------------------------------------------------------
  const CARDS = [
    ...(CELLFOLD ? [['location_cell', 'p-cell', 'Localization', cellBuild]] : []),
    ['location', 'p-cond', 'Location', locationBuild],
    ['dependency', 'p-depmap', 'Cancer cell lines', dependencyBuild],
    [
      'perturbations',
      'p-pert',
      `${W.writer ? cap(W.writer) : 'Enzyme'} inhibitors, knockouts and knockdowns`,
      perturbationsBuild,
    ],
    ['experiments', 'p-exp', 'Experiments', experimentsBuild],
    ['clustering', 'p-cluster', 'Clustering', clusteringBuild],
    ['other_ptms', 'p-ptm', 'Other modifications', ptmsBuild],
    ['germline', 'p-germline', 'Germline variants', germlineBuild],
  ].filter(([k]) => PC[k] || k === 'location_cell');
  const BUILD = { live: liveBuild };
  K.pcards = BUILD; // the cards' builders: (protein, record, tables) -> { html, sum }
  K.proteinFolds ||= [];
  for (const [key, id, title, build] of CARDS) {
    BUILD[key] = build;
    K.proteinFolds.push((p, rec, fold) => {
      CUR.p = p;
      CUR.rec = rec;
      if (key === 'location_cell')
        return fold(
          id,
          title,
          `<span data-pc-sum="${key}"></span>`,
          `<div class="pc" ` + `data-pc="${key}"></div>`,
          true
        );
      if (key === 'location' && !(PC.location.hpa || PC.location.maps || PC.location.condensates)) return '';
      const html = fold(
        id,
        esc(PC[key].title || title),
        `<span data-pc-sum="${key}">${esc(PC[key].summary || '')}</span>`,
        `<div class="pc" ` + `data-pc="${key}"></div>`,
        false
      );
      return key === 'experiments' ? html.replace('<details ', '<details hidden ') : html;
    });
  }
  K.proteinFolds.push((p, rec) => {
    CUR.p = p;
    CUR.rec = rec;
    return '';
  }); // the live parts need the protein before the page is drawn
  // the sections of the page's nav: each card registers its fold; the core sorts them (kit-proteins.js)
  (K.proteinFoldSections ||= []).push(...CARDS.map(([kind, id, title]) => [id, () => PC[kind]?.title || title, 1]));

  // ---- painting: each card's box is filled when its tables are here, and again when a live answer arrives -------------
  function paintAll() {
    const p = CUR.p;
    if (!p) return;
    let shownBefore = 0,
      shownNow = 0;
    const nShown = () =>
      CARDS.filter(([, id]) => {
        const f = document.getElementById(id);
        return f && !f.hidden;
      }).length;
    shownBefore = nShown();
    document.querySelectorAll('[data-pc]').forEach((el) => {
      if (el.dataset.pcOk === '1') return;
      const kind = el.dataset.pc,
        tb = tables(p.acc);
      if (tb === undefined) {
        el.innerHTML = K.loading('Loading…');
        return;
      }
      if (kind !== 'live' && !K.sel.pdata(p.i) && kind === 'location' && PC.location.maps) {
        el.innerHTML = K.loading('Loading…');
        return;
      }
      const r = BUILD[kind](p, CUR.rec, tb, el);
      el.innerHTML = r.html;
      el.dataset.nar = matchMedia('(max-width: 700px)').matches ? '1' : '';
      if (!r.wait) el.dataset.pcOk = '1';
      if (kind === 'location_cell') K.cell?.fillOne?.();
      const fold = el.closest('details');
      if (r.hide != null && fold) fold.hidden = !!r.hide;
      const s = document.querySelector(`[data-pc-sum="${kind}"]`);
      if (s && r.sum != null && kind !== 'live') s.textContent = r.sum;
      if (fold?.id && r.pic != null) K.pfolds?.set(fold.id, r.pic);
    });
    excludedMenu(p, TB[p.acc]);
    shownNow = nShown();
    if (shownNow !== shownBefore) K.rail?.(); // a card that appeared or hid is in the sidebar
  }
  (K.afterRender ||= []).push(paintAll);
  // the cell fold is built for the width it met; crossing the phone width builds it again
  let cellT;
  addEventListener('resize', () => {
    clearTimeout(cellT);
    cellT = setTimeout(() => {
      const el = document.querySelector('[data-pc="location_cell"]'),
        n = matchMedia('(max-width: 700px)').matches;
      if (el && el.dataset.pcOk === '1' && (el.dataset.nar === '1') !== n) {
        delete el.dataset.pcOk;
        paintAll();
      }
    }, 200);
  });

  // ---- the look -------------------------------------------------------------------------------------------------------
  const st = document.createElement('style');
  st.id = 'kit-pcards-css';
  st.textContent = [
    '.pc .sub-h{font-size:.95rem;margin:.9rem 0 .35rem}.pc ' +
      '.sub-h:first-child{margin-top:.2rem}.pc .flabel{margin:.8rem 0 .25rem}',
    '.pc .tag.loc.main{font-weight:700}.pc ' +
      '.tag.loc.unsure{opacity:.65;border-style:dashed}.pc ' +
      'button.tag{cursor:pointer;font:inherit;font-size:.82rem}',
    '.pc .stars{display:inline-flex;letter-spacing:1px;margin-right:.5rem}.pc .stars ' +
      'i{font-style:normal;color:var(--line-strong)}.pc .stars ' +
      'i.on{color:var(--accent)}',
    '.pc .cond-list{list-style:none;margin:.3rem 0;padding:0}.pc .cond-list ' +
      'li{padding:.45rem 0;border-bottom:1px solid var(--line)}.pc ' +
      '.cond-name{display:flex;flex-wrap:wrap;gap:.4rem;align-items:baseline}',
    '.pc .cond-conf{margin:.15rem 0}.pc .cond-ev{color:var(--ink-2)}',
    '.pc-maps{border-collapse:collapse;font-size:.88rem;width:auto}.pc-maps ' +
      'th,.pc-maps td{text-align:left;vertical-align:top;padding:.3rem .8rem .3rem ' +
      '0;border-bottom:1px solid var(--line)}.pc-maps ' +
      'th{font-weight:600;white-space:nowrap}',
    '.cell-onep{margin:.5rem 0;max-width:760px}.cell-onep .cell-svg{max-width:100%}',
    '.cell-places{list-style:none;margin:.5rem 0;padding:0}.cell-places ' +
      'li{padding:.35rem 0;border-top:1px solid ' +
      'var(--rule,var(--line,#8884))}.cell-places li ' +
      'b{display:block}.cell-onen{margin:.4rem 0}.cell-onen ' +
      '.cell-draw{width:100%}.cell-onen .cell-svg,.cell-onen ' +
      '.cell-svg.cell-cell,.cell-onen ' +
      '.cell-svg.cell-nucleus{width:100%;height:auto;min-width:0;max-width:none!important;max-height:none!important}',
    '.pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:1rem 2rem}.pc-sec h4{margin:.2rem 0 .4rem;font-size:.95rem}',
    '.pc-hist{width:100%;max-width:460px;height:auto;display:block}.pc-hist ' +
      '.hb{fill:var(--accent);opacity:.75}.pc-hist ' +
      '.ha{stroke:var(--line-strong)}.pc-hist ' +
      '.hm{stroke:var(--muted);stroke-dasharray:3 3}.pc-hist ' +
      '.ht{font-size:10px;fill:var(--muted)}',
    '.pc-tbl{border-collapse:collapse;font-size:.86rem}.pc-tbl th,.pc-tbl ' +
      'td{text-align:left;padding:.3rem .7rem .3rem 0;border-bottom:1px solid ' +
      'var(--line);vertical-align:top}.pc-tbl.pert td,.pc-tbl.pert ' +
      'th{padding-right:.6rem}.pc-tbl th{font-weight:600}',
    '.pc-tbl.exp td{min-width:7rem}.pc-key{display:flex;flex-wrap:wrap;gap:.2rem ' +
      '1rem;font-size:.82rem;color:var(--muted)}',
    '.pc-dl{display:grid;grid-template-columns:minmax(10rem,18rem) 1fr;gap:.4rem ' +
      '1.2rem;margin:.4rem 0}.pc-dl dt{font-weight:600}.pc-dl dd{margin:0}',
    '.pc-kind{margin:.4rem 0}.pc-kind .num{margin-left:.4rem;font-variant-numeric:tabular-nums}',
    '.pc-live .ot-list{list-style:none;margin:.2rem 0;padding:0}.pc-live .ot-list ' +
      'li{display:grid;grid-template-columns:1fr 6rem ' +
      '2.6rem;gap:.6rem;align-items:center;padding:.15rem 0}',
    '.pc-bar{display:block;height:.55rem;background:var(--surface-2);border-radius:3px;overflow:hidden}.pc-bar i{display:block;height:100%;background:var(--accent)}.pc-live .num{text-align:right;font-variant-numeric:tabular-nums}',
    '.pc-live .term-list{list-style:none;margin:.2rem 0;padding:0}.pc-live ' +
      '.term-list li{padding:.25rem 0}.dis-group{margin:.2rem 0}.dis-group ' +
      'summary{cursor:pointer}',
    '@media (max-width:640px){.pc-dl{grid-template-columns:1fr}.pc-live .ot-list ' +
      'li{grid-template-columns:1fr 4rem 2.4rem}}',
  ].join('');
  document.head.appendChild(st);
});
