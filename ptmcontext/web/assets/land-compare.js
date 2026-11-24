/* The Compare marks page (compare/index.html of `ptmc pages`): one row per class of a question that several explorers test,
   one column per explorer, each cell that explorer's own published result (fold, q, n; the test and comparison group under the
   question). Nothing is computed here but a sort: the numbers are compare.json's, which the build copied from each explorer's own
   statistics. The reader picks the explorers and a group of questions, sorts the rows by an explorer's fold, and downloads what is
   shown as a table (TSV) or a figure (SVG, PNG, PDF), each with the data release and DOI of every explorer shown.
   Reads <script id="cmp-data"> (the same JSON as compare.json). No site is named here. */
(function () {
  'use strict';
  const node = document.getElementById('cmp-data'),
    root = document.getElementById('cmp-app');
  if (!node || !root) return;
  const D = JSON.parse(node.textContent),
    EX = D.explorers;
  const state = { show: new Set(EX.map((e) => e.id)), group: '', sort: '', desc: true };

  // ---- numbers as the explorers print them (kit.js fxn, fq, int) ---------------------------------------------------------
  const fxn = (v, big) =>
    big
      ? '> 1,000'
      : v == null
        ? '–'
        : v >= 1000
          ? '> 1,000'
          : v >= 10
            ? v.toFixed(0)
            : v >= 1.2
              ? v.toFixed(1)
              : v >= 0.01
                ? v.toFixed(2)
                : '< 0.01';
  const fq = (q) =>
    q == null ? '–' : q === 0 ? '< 1e−300' : q < 1e-3 ? q.toExponential(1).replace('e-', 'e−') : q.toFixed(3);
  const int = (n) => (n == null ? '–' : Number(n).toLocaleString('en-US'));
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ARROW = { more: '▲', less: '▼' };
  const READ = {
    more: 'more often',
    less: 'less often',
    same: 'about the same (within 1.1×)',
    ns: 'no difference (q above 0.05)',
  };
  const readOf = (c) =>
    c.split ? 'no reading: q is 0.05 or less, but the fold and the test point different ways' : READ[c.dir];
  const shown = () => EX.filter((e) => state.show.has(e.id));
  const ok = (c) => c && c.state === 'ok';

  // ---- the dot: filled and ringed when q <= 0.05, hollow when not; the circle grows with the fold ------------------------
  function marker(dir, v, big, size) {
    const s = size || 22,
      m = s / 2,
      f = big ? 1000 : v == null ? 1 : v,
      r = 3.2 + 4.2 * Math.min(1, Math.abs(Math.log2(f)) / 4);
    const ring =
      dir === 'ns' ? '' : `<circle class="cmp-ring ${dir}" cx="${m}" cy="${m}" r="${(r + 2.6).toFixed(1)}"/>`;
    return (
      `<svg class="m" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${ring}` +
      `<circle class="cmp-dot-${dir}" cx="${m}" cy="${m}" r="${r.toFixed(1)}"/></svg>`
    );
  }

  // ---- what is shown: the chosen group, its rows in the chosen order -----------------------------------------------------
  const key = (row) => {
    const c = row.cells[state.sort];
    return ok(c) ? (c.big ? 1e300 : c.v) : null;
  };
  function view() {
    return D.groups
      .filter((g) => !state.group || g.id === state.group)
      .map((g) => ({
        ...g,
        questions: g.questions.map((q) => {
          let rows = q.rows.map((r, i) => ({ r, i }));
          if (state.sort === '_label')
            rows.sort((a, b) => a.r.label.localeCompare(b.r.label) * (state.desc ? -1 : 1) || a.i - b.i);
          else if (state.sort) {
            // folds in the chosen order; a class the explorer does not test goes last, whichever way the order runs
            rows.sort((a, b) => {
              const x = key(a.r),
                y = key(b.r);
              if (x == null || y == null) return x == null && y == null ? a.i - b.i : x == null ? 1 : -1;
              return (state.desc ? y - x : x - y) || a.i - b.i;
            });
          }
          return { ...q, rows: rows.map((x) => x.r) };
        }),
      }));
  }

  // ---- the table ---------------------------------------------------------------------------------------------------------
  function cellTitle(e, c) {
    if (!ok(c)) return `${e.short}: not tested`;
    const ci = c.lo != null && c.hi != null ? ` (${fxn(c.lo)}–${fxn(c.hi)})` : '';
    return (
      `${e.short}: ${c.measure} ${fxn(c.v, c.big)}×, ${readOf(c)}. ` +
      (c.or != null ? `Odds ratio ${fxn(c.or)}${ci}. ` : '') +
      (c.est && c.est.or != null
        ? `${c.est.test}: odds ratio ${fxn(c.est.or)}${c.est.lo != null ? ` (${fxn(c.est.lo)}–${fxn(c.est.hi)})` : ''}, q ${fq(c.est.q)}. `
        : '') +
      `q ${fq(c.q)}. n ${int(c.n)}. Test: ${c.test}. Compared with: ${c.group}.` +
      (c.label ? ` The explorer calls it: ${c.label}.` : '')
    );
  }
  function cellHtml(e, c) {
    if (!c) return '<td class="nt">not tested</td>';
    if (c.state !== 'ok') return `<td class="nt" title="${esc(e.short)}: too few to test">not tested (too few)</td>`;
    return (
      `<td class="c ${c.dir}" title="${esc(cellTitle(e, c))}">${marker(c.dir, c.v, c.big)}` +
      `<span class="v">${ARROW[c.dir] ? ARROW[c.dir] + ' ' : ''}${esc(fxn(c.v, c.big))}×</span>` +
      `<span class="s">q ${esc(fq(c.q))} · n ${esc(int(c.n))}</span></td>`
    );
  }
  function questionRow(q, cols) {
    const flag = q.same_test ? '' : '<span class="q-flag">The explorers do not use the same test here.</span>';
    return (
      `<tr class="q"><th scope="rowgroup">${esc(q.title)}${flag}</th>` +
      cols
        .map((e) => {
          const t = q.tests[e.id];
          return t
            ? `<td><span class="q-test">Test: ${esc(t.test)}</span>${t.note ? `<span class="q-group">${esc(t.note)}</span>` : ''}<span class="q-group">Compared with: ${esc(t.group)}</span></td>`
            : '<td class="nt">not tested</td>';
        })
        .join('') +
      '</tr>'
    );
  }
  function sortBtn(id, label) {
    const on = state.sort === id;
    return (
      `<button type="button" class="cmp-sort" data-sort="${esc(id)}" aria-pressed="${on}">${esc(label)}` +
      `${on ? (state.desc ? ' ▼' : ' ▲') : ''}</button>`
    );
  }
  function table() {
    const cols = shown(),
      v = view();
    if (!cols.length) return '<p class="cmp-empty">Pick at least one explorer.</p>';
    const head =
      `<tr><th scope="col" aria-sort="${state.sort === '_label' ? (state.desc ? 'descending' : 'ascending') : 'none'}">Class${sortBtn('_label', 'Sort by name')}</th>` +
      cols
        .map(
          (e) =>
            `<th scope="col" style="--c:${esc(e.band || '')}" aria-sort="${state.sort === e.id ? (state.desc ? 'descending' : 'ascending') : 'none'}">` +
            `<a href="${esc(e.href)}" title="${esc(e.label)}">${esc(e.short)}</a>${sortBtn(e.id, 'Sort by fold')}</th>`
        )
        .join('') +
      '</tr>';
    const body = v
      .map(
        (g) =>
          `<tr class="cmp-gh"><td colspan="${cols.length + 1}"><h2>${esc(g.title)}</h2>${g.note ? `<p>${esc(g.note)}</p>` : ''}</td></tr>` +
          g.questions
            .map(
              (q) =>
                questionRow(q, cols) +
                q.rows
                  .map(
                    (r) =>
                      `<tr><th scope="row"${
                        r.own_labels
                          ? ` title="${esc(
                              Object.entries(r.own_labels)
                                .map(([k, n]) => k + ': ' + n)
                                .join('; ')
                            )}"`
                          : ''
                      }>${esc(r.label)}</th>` +
                      cols.map((e) => cellHtml(e, r.cells[e.id])).join('') +
                      '</tr>'
                  )
                  .join('')
            )
            .join('')
      )
      .join('');
    return (
      '<div class="cmp-frame" tabindex="0" role="region" aria-label="Comparison table, scrolls sideways">' +
      `<table class="cmp-table"><caption class="vh">Each explorer’s own result for each class</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>`
    );
  }
  const legend = () =>
    '<ul class="cmp-legend" aria-label="Legend">' +
    [
      ['more', 3, '▲ more often (q ≤ 0.05, fold at least 1.1)'],
      ['less', 0.4, '▼ less often (q ≤ 0.05, fold at most 1/1.1)'],
      ['same', 1.05, 'about the same (q ≤ 0.05, fold within 1.1)'],
      ['ns', 1.5, 'hollow: no difference (q above 0.05), or the fold and the test point different ways'],
    ]
      .map(([d, f, t]) => `<li>${marker(d, f, false, 20)}<span>${esc(t)}</span></li>`)
      .join('') +
    '<li><span>Circle size grows with the fold.</span></li><li><span><i>Not tested</i> means the explorer does not test the class, or has too few.</span></li></ul>';

  // ---- the controls ------------------------------------------------------------------------------------------------------
  function frame() {
    root.innerHTML =
      '<div class="cmp-bar">' +
      '<fieldset><legend>Explorers</legend><div class="cmp-picks">' +
      EX.map(
        (e) =>
          `<label><input type="checkbox" data-ex="${esc(e.id)}"${state.show.has(e.id) ? ' checked' : ''}><i style="background:${esc(e.band || 'var(--muted)')}"></i>${esc(e.short)}</label>`
      ).join('') +
      '</div></fieldset>' +
      '<div><label class="cmp-lab" for="cmp-group">Questions</label><select id="cmp-group"><option value="">All questions</option>' +
      D.groups
        .map((g) => `<option value="${esc(g.id)}"${state.group === g.id ? ' selected' : ''}>${esc(g.title)}</option>`)
        .join('') +
      '</select></div>' +
      '<details class="cmp-dl"><summary>Download ▾</summary><div class="cmp-menu" role="menu">' +
      ['tsv|Table (TSV)', 'svg|Figure (SVG)', 'png|Figure (PNG)', 'pdf|Figure (PDF)']
        .map((x) => `<button type="button" role="menuitem" data-dl="${x.split('|')[0]}">${x.split('|')[1]}</button>`)
        .join('') +
      '</div></details></div>' +
      legend() +
      '<div id="cmp-table"></div>';
    draw();
  }
  function draw() {
    document.getElementById('cmp-table').innerHTML = table();
    write();
  }
  function write() {
    try {
      const p = new URLSearchParams();
      if (state.show.size !== EX.length) p.set('x', [...state.show].join(','));
      if (state.group) p.set('g', state.group);
      if (state.sort) p.set('s', state.sort + (state.desc ? '' : ':asc'));
      history.replaceState(null, '', p.toString() ? '#' + p : location.pathname + location.search);
    } catch (e) {
      /* a page without a history: the choices last for the visit */
    }
  }
  function read() {
    try {
      const p = new URLSearchParams(location.hash.slice(1));
      if (p.has('x')) {
        const ids = p
          .get('x')
          .split(',')
          .filter((i) => EX.some((e) => e.id === i));
        state.show = new Set(ids);
      }
      if (p.has('g') && D.groups.some((g) => g.id === p.get('g'))) state.group = p.get('g');
      if (p.has('s')) {
        const [k, d] = p.get('s').split(':');
        if (k === '_label' || EX.some((e) => e.id === k)) {
          state.sort = k;
          state.desc = d !== 'asc';
        }
      }
    } catch (e) {
      /* no readable address: the defaults */
    }
  }
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ex]')) {
      t.checked ? state.show.add(t.dataset.ex) : state.show.delete(t.dataset.ex);
      draw();
    } else if (t.id === 'cmp-group') {
      state.group = t.value;
      draw();
    }
  });
  root.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) {
      const k = s.dataset.sort;
      // a first press sorts high to low (A to Z for the names reads low to high), a second reverses, a third restores the page's order
      if (state.sort !== k) {
        state.sort = k;
        state.desc = k !== '_label';
      } else if (state.desc === (k !== '_label')) state.desc = !state.desc;
      else state.sort = '';
      draw();
      document.querySelector(`[data-sort="${CSS.escape(k)}"]`)?.focus();
      return;
    }
    const d = e.target.closest('[data-dl]');
    if (d) {
      d.closest('details').open = false;
      download(d.dataset.dl);
    }
  });
  document.addEventListener('click', (e) => {
    const m = root.querySelector('.cmp-dl');
    if (m && m.open && !m.contains(e.target)) m.open = false;
  });
  document.addEventListener('keydown', (e) => {
    const m = root.querySelector('.cmp-dl');
    if (e.key === 'Escape' && m && m.open) {
      m.open = false;
      m.querySelector('summary').focus();
    }
  });

  // ---- downloads: the rows shown, with every explorer's data release and DOI -------------------------------------------
  const relText = (e) => {
    const r = e.release || {};
    return r.version
      ? `data release ${r.version}${r.date ? ' (' + r.date + ')' : ''}${r.doi ? ', doi:' + r.doi : ''}`
      : 'data release not recorded';
  };
  const citeText = (e) => (e.cite && e.cite.text ? `${e.cite.text}${e.cite.doi ? ' doi:' + e.cite.doi : ''}` : '');
  const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const where = () => (/^https?:/.test(location.href) ? location.href.replace(/#.*/, '') : '');
  // the standard citation header: what this is, then each explorer shown: its name, data release and DOI, and how to cite it
  function header() {
    const lines = [
      D.title,
      D.statement,
      'Explorers and the data release each reads:',
      ...shown().map(
        (e) =>
          `${e.label}: ${relText(e)}${e.app && e.app.version ? '; explorer version ' + e.app.version + (e.app.date ? ' (' + e.app.date + ')' : '') : ''}.`
      ),
      ...shown()
        .filter(citeText)
        .map((e) => `Cite ${e.short}: ${citeText(e)}`),
      `Exported ${stamp()}${where() ? ' from ' + where() : ''}`,
    ];
    return lines;
  }
  function cellRecord(e, r, q, c) {
    const base = [q.title, r.label, e.label];
    if (!c) return [...base, 'not tested', '', '', '', '', '', '', '', '', '', '', '', '', '', '', c ? c.label : ''];
    if (c.state !== 'ok')
      return [...base, 'not tested (too few)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', c.label || ''];
    return [
      ...base,
      'tested',
      c.big ? '>1000' : c.v == null ? '' : c.v,
      c.measure,
      c.or ?? '',
      c.lo ?? '',
      c.hi ?? '',
      c.q ?? '',
      c.dir,
      c.n ?? '',
      c.test,
      c.est?.or ?? '',
      c.est?.lo ?? '',
      c.est?.hi ?? '',
      c.est?.q ?? '',
      c.group,
      c.label || '',
    ];
  }
  function tsv() {
    const cols = shown(),
      out = header().map((l) => '# ' + l);
    out.push(
      [
        'question',
        'class',
        'explorer',
        'status',
        'fold',
        'measure',
        'odds_ratio',
        'ci_low',
        'ci_high',
        'q',
        'reading',
        'n',
        'test',
        'est_or',
        'est_lo',
        'est_hi',
        'est_q',
        'comparison_group',
        'explorer_class_label',
      ].join('\t')
    );
    view().forEach((g) =>
      g.questions.forEach((q) =>
        q.rows.forEach((r) =>
          cols.forEach((e) =>
            out.push(
              cellRecord(e, r, q, r.cells[e.id])
                .map((x) => String(x).replace(/[\t\n]/g, ' '))
                .join('\t')
            )
          )
        )
      )
    );
    return out.join('\n') + '\n';
  }
  // the figure: the header, the table as drawn on the page (light colors), the legend and each question's tests
  const INK = '#1f2933',
    MUTED = '#52606d',
    LINE = '#cbd2d9',
    COL = { more: '#b42318', less: '#334155', same: '#8a96a0', ns: '#8a96a0' };
  const FONT = 'Inter, Helvetica, Arial, sans-serif';
  const wrap = (text, px, size) => {
    const per = Math.max(20, Math.floor(px / (size * 0.58))),
      words = String(text).split(/\s+/),
      lines = [];
    let cur = '';
    words.forEach((w) => {
      if ((cur + ' ' + w).trim().length > per && cur) {
        lines.push(cur);
        cur = w;
      } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  };
  function figure() {
    const cols = shown(),
      W = 1100,
      pad = 24,
      lab = 250,
      cw = (W - 2 * pad - lab) / Math.max(1, cols.length),
      RH = 32;
    let y = pad,
      body = '';
    const text = (x, yy, s, size, fill, weight, anchor) =>
      `<text x="${x}" y="${yy}" font-size="${size}" fill="${fill}"${weight ? ` font-weight="${weight}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;
    header().forEach((l, i) => {
      const size = i === 0 ? 17 : 11;
      wrap(l, W - 2 * pad, size).forEach((ln, k) => {
        y += i === 0 ? 18 : k === 0 && i === 1 ? 20 : 14;
        body += text(pad, y, ln, size, i === 0 ? INK : MUTED, i === 0 ? 700 : 400);
      });
    });
    y += 18;
    // column heads
    body += text(pad, y + 12, 'Class', 12, INK, 700);
    cols.forEach((e, i) => {
      body +=
        `<rect x="${pad + lab + i * cw}" y="${y - 6}" width="${cw - 8}" height="3" fill="${e.band || LINE}"/>` +
        text(pad + lab + i * cw + 2, y + 12, e.short, 12, INK, 700);
    });
    y += 22;
    body += `<line x1="${pad}" x2="${W - pad}" y1="${y}" y2="${y}" stroke="${INK}"/>`;
    const notes = [];
    view().forEach((g) => {
      y += 22;
      body += text(pad, y, g.title, 14, INK, 700);
      g.questions.forEach((q) => {
        y += 20;
        body +=
          text(pad, y, q.title, 12, INK, 700) +
          (q.same_test ? '' : text(pad + lab, y, 'The explorers do not use the same test here.', 10.5, COL.more, 600));
        notes.push(q);
        q.rows.forEach((r) => {
          y += RH;
          body +=
            `<line x1="${pad}" x2="${W - pad}" y1="${y - RH + 8}" y2="${y - RH + 8}" stroke="${LINE}" stroke-width="0.5"/>` +
            text(pad + 6, y - 8, r.label, 11.5, INK);
          cols.forEach((e, i) => {
            const c = r.cells[e.id],
              x = pad + lab + i * cw;
            if (!ok(c)) {
              body += text(x + 2, y - 8, c ? 'not tested (too few)' : 'not tested', 11, MUTED).replace(
                '<text ',
                '<text font-style="italic" '
              );
              return;
            }
            const f = c.big ? 1000 : c.v == null ? 1 : c.v,
              rad = 3.2 + 4.2 * Math.min(1, Math.abs(Math.log2(f)) / 4),
              cx = x + 11,
              cy = y - 12;
            if (c.dir !== 'ns')
              body += `<circle cx="${cx}" cy="${cy}" r="${(rad + 2.6).toFixed(1)}" fill="none" stroke="${COL[c.dir]}" stroke-width="1.2" opacity="0.55"/>`;
            body += `<circle cx="${cx}" cy="${cy}" r="${rad.toFixed(1)}" fill="${c.dir === 'ns' ? '#ffffff' : COL[c.dir]}" stroke="${COL[c.dir]}" stroke-width="${c.dir === 'ns' ? 1.5 : 1}"/>`;
            body += text(
              x + 28,
              y - 15,
              `${ARROW[c.dir] ? ARROW[c.dir] + ' ' : ''}${fxn(c.v, c.big)}×`,
              11.5,
              c.dir === 'more' || c.dir === 'less' ? COL[c.dir] : INK,
              700
            );
            body += text(x + 28, y - 3, `q ${fq(c.q)} · n ${int(c.n)}`, 9.5, MUTED);
          });
        });
      });
    });
    y += 14;
    body += `<line x1="${pad}" x2="${W - pad}" y1="${y}" y2="${y}" stroke="${INK}"/>`;
    // the legend
    y += 22;
    body += text(
      pad,
      y,
      'Filled dot with a ring: q ≤ 0.05 and the fold at least 1.1 (▲ red more often, ▼ slate less often). Gray: q ≤ 0.05, fold within 1.1. Hollow: q above 0.05.',
      10.5,
      MUTED
    );
    y += 14;
    body += text(
      pad,
      y,
      'Circle size grows with the fold. Not tested: the explorer does not test the class, or has too few. Each cell is that explorer’s own number; nothing is pooled.',
      10.5,
      MUTED
    );
    // the tests and comparison groups
    y += 22;
    body += text(pad, y, 'Test and comparison group, as each explorer states them', 11.5, INK, 700);
    notes.forEach((q) =>
      cols.forEach((e) => {
        const t = q.tests[e.id];
        if (!t) return;
        wrap(`${q.title}, ${e.short}: ${t.test}. Compared with: ${t.group}.`, W - 2 * pad, 10).forEach((ln) => {
          y += 13;
          body += text(pad, y, ln, 10, MUTED);
        });
      })
    );
    y += pad;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}" font-family="${FONT}">` +
      `<title>${esc(D.title)}</title><desc>${esc(header().join(' '))}</desc>` +
      `<rect width="${W}" height="${y}" fill="#ffffff"/>${body}</svg>`;
    return { svg, W, H: y };
  }
  function save(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function png(f, scale) {
    return new Promise((ok2, bad) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = f.W * scale;
        c.height = f.H * scale;
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? ok2(b) : bad(new Error('The PNG could not be made.'))), 'image/png');
      };
      img.onerror = () => bad(new Error('The figure could not be drawn.'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.svg);
    });
  }
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  function loadPdf() {
    if (window.jspdf) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = Object.assign(document.createElement('script'), {
        src: LIB,
        onload: res,
        onerror: () => rej(new Error('The PDF library could not be loaded.')),
      });
      document.head.appendChild(s);
    });
  }
  async function download(kind) {
    const name = 'ptmcontext-compare-marks';
    try {
      if (kind === 'tsv') save(name + '.tsv', new Blob([tsv()], { type: 'text/tab-separated-values' }));
      else {
        const f = figure();
        if (kind === 'svg') save(name + '.svg', new Blob([f.svg], { type: 'image/svg+xml' }));
        else if (kind === 'png') save(name + '.png', await png(f, 2));
        else {
          const [b] = await Promise.all([png(f, 2), loadPdf()]),
            url = await new Promise((r) => {
              const fr = new FileReader();
              fr.onload = () => r(fr.result);
              fr.readAsDataURL(b);
            }),
            pdf = new window.jspdf.jsPDF({
              unit: 'pt',
              format: [f.W, f.H],
              orientation: f.W > f.H ? 'l' : 'p',
              compress: true,
            });
          pdf.addImage(url, 'PNG', 0, 0, f.W, f.H, undefined, 'FAST');
          pdf.setProperties({ title: D.title, subject: header().join(' ') });
          pdf.save(name + '.pdf');
        }
      }
    } catch (err) {
      alert((err && err.message) || 'The download failed.');
    }
  }

  window.PTMC_COMPARE = { data: D, view, tsv, figure, state };
  read();
  frame();
})();
