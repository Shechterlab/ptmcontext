/* Marks shown and counted nowhere: the rows the site keeps pending (marks.left_out; a variant's lower-confidence sites
   that its statistics leave out), read from the page's data (D.shown_marks: the count, the proteins with only these,
   and every one as [accession, position, window, attribute values]) and each protein's record (rec.shown, laid out
   as a mark). They are never in selection.json, a count or a test: the map draws them hatched beside the marks, the
   protein page and the Sites page list them with a tag. The tag's words, its hover (the results of the tests the site
   file names), the counted marks that carry it too and the note come from the site file (website.shown_marks). A
   site without such marks gets nothing from this module. A module of the site kit. */
(window.PTMC_MODULES ||= []).push(K => {
  'use strict';
  const { D, esc, int } = K;
  const DATA = D.shown_marks || null, CFG = D.shown_view || null;
  const SPECS = D.attribute_specs || {}, AT = D.mark_attributes || [];
  // a mark's values of an attribute, as a list (m[3] in the order of D.mark_attributes)
  const valsOf = (m, name) => { const s = SPECS[name]; if (!s) return []; const v = String(m[3]?.[AT.indexOf(name)] ?? ''); return v === '' ? [] : s.kind === 'list' ? v.split(s.separator || '; ') : [v]; };
  const RX = {};
  const holds = (m, c) => {
    if (!SPECS[c.attribute] || AT.indexOf(c.attribute) < 0) return false;   // an attribute these marks lack never holds
    const v = valsOf(m, c.attribute);
    if (c.has && !v.some(x => c.has.includes(x))) return false;
    if (c.lacks && v.some(x => c.lacks.includes(x))) return false;
    if (c.matches != null && !v.some(x => (RX[c.matches] ||= new RegExp(c.matches)).test(x))) return false;
    if (c.empty != null && (v.length === 0) !== c.empty) return false;
    return true;
  };
  const WHEN = CFG?.counted?.when || [];
  const label = () => CFG?.label || 'shown only';
  const vlab = (n, v) => (SPECS[n]?.values || {})[v] ?? v;
  // a counted mark the site file names as like them (a variant's added marks)
  const counted = m => !!CFG && WHEN.length > 0 && WHEN.every(c => holds(m, c));
  // the tag's hover: what it is, the tests, the rest, and whether it is counted
  function tip(m, only) {
    const tests = (CFG.tests?.attributes || []).filter(n => SPECS[n] && valsOf(m, n).length).map(n => `${SPECS[n].label} ${valsOf(m, n).map(v => vlab(n, v)).join('/')}`);
    const also = (CFG.also || []).filter(n => SPECS[n] && valsOf(m, n).length).map(n => `${SPECS[n].label} ${valsOf(m, n).map(v => vlab(n, v)).join(' and ')}`);
    const end = only ? CFG.shown_help : CFG.counted?.help;
    return [CFG.help || '', tests.length ? `${CFG.tests.label || 'Tests'}: ${tests.join('; ')}` : '', end || '', ...also].filter(Boolean).map(t => t.replace(/[.\s]+$/, '')).join('. ') + '.';
  }
  // the tag for a mark (only: shown and counted nowhere), '' for a mark the site file does not name
  const tag = (m, only) => (CFG && (only || counted(m)) ? `<span class="tag lc-tag" title="${esc(tip(m, only))}">${esc(label())}</span>` : '');
  // [accession, position, window, values] as a mark of a protein record: [position, window, [], values]
  const asMark = r => [r[1], r[2], [], r[3]];
  const PROTS = Object.fromEntries((DATA?.proteins || []).map(([acc, gene, name, len, entry]) => [acc, { acc, gene, name, len, entry, marks: 0, cand: 0, i: null, shownOnly: true }]));
  // the note: the numbers in the site file's words, with the tag's swatch
  function note() {
    if (!DATA || !CFG?.note) return '';
    const like = DATA.counted_like || 0, n = DATA.n, nums = { all: like + n, counted: like, shown: n, others: (D.counts?.marks || 0) - like };
    return `<p class="note lc-note" id="lc-note"><span class="lc-swatch" aria-hidden="true"></span><span>${esc(CFG.note).replace(/\{(\w+)\}/g, (x, k) => (k in nums ? `<b>${int(nums[k])}</b>` : x))}</span></p>`;
  }
  K.shown = {
    on: !!DATA, cfg: CFG || {}, label, tip, tag, counted, holds, note, asMark,
    row: () => CFG?.row || `${label()}, not counted`,
    n: () => DATA?.n || 0,
    rows: () => DATA?.rows || [],
    // a protein with only these marks: its page is drawn from its record like any other's
    protein: key => { const u = String(key || '').toUpperCase(); return PROTS[key] || PROTS[u] || Object.values(PROTS).find(p => String(p.gene || '').toUpperCase() === u) || null; },
    proteins: () => Object.values(PROTS),
  };
  if (DATA) {
    const css = document.createElement('style');
    css.textContent = '.lc-tag{font:500 .72rem/1.4 var(--font-body);letter-spacing:0;text-transform:none;vertical-align:middle;background:repeating-linear-gradient(135deg,transparent 0 3px,color-mix(in srgb,var(--muted) 22%,transparent) 3px 5px);border:1px dashed var(--muted);color:var(--ink)}' +
      '.lc-note{display:flex;gap:.6rem;align-items:flex-start}.lc-swatch{flex:none;width:18px;height:18px;margin-top:.15rem;border:1.5px solid var(--muted);border-radius:4px;background:repeating-linear-gradient(135deg,transparent 0 3px,var(--muted) 3px 4.5px)}' +
      'tr.lc-row td{background:repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in srgb,var(--muted) 7%,transparent) 6px 9px)}';
    document.head.appendChild(css);
  }
});
