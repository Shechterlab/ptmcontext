"""The cards front end's home (kit-front.js) on a toy site built in cards mode: each home card's values are the rows of
statistics.tsv (the kit reads them, nothing is recomputed), and a selection's values are K.sel's own retest of the same
question (a subset at or over the site's minimum), while a selection under it leaves the card on the whole dataset."""
from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml
from test_search import _page_data, _toy

from ptmcontext import site as S
from ptmcontext import web

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _cards_build(tmp_path, minimum=None):
    root = _toy(tmp_path, with_search=False)
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['website']['front'] = {'mode': 'cards', 'cards': [{'title': 'Position', 'analyses': ['motif'], 'home': {'analysis': 'motif', 'top': 4, 'q_max': 1}}]}
    if minimum:
        site['website']['compare'] = {'min_proteins': minimum[0], 'min_marks': minimum[1]}
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    return web.build(p, log=lambda *_: None)


HARNESS = r"""
const fs = require('fs');
global.window = global; const noop = () => {};
const el = () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, querySelectorAll: () => [], classList: { toggle: noop } });
global.document = { createElement: el, body: el(), addEventListener: noop, getElementById: () => null, querySelectorAll: () => [] };
global.matchMedia = () => ({ matches: false }); global.addEventListener = noop;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(SEL, 'utf8'))) });
eval(fs.readFileSync(BUILT + '/kit-stats.js', 'utf8'));
eval(fs.readFileSync(ASSETS + '/kit-select.js', 'utf8'));
eval(fs.readFileSync(ASSETS + '/kit-front.js', 'utf8'));
const D = JSON.parse(fs.readFileSync(DATA, 'utf8')), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const NL = String.fromCharCode(10), TAB = String.fromCharCode(9);
const [head, ...lines] = D.statistics_tsv.trim().split(NL), col = Object.fromEntries(head.split(TAB).map((c, k) => [c, k]));
const num = v => (v === '' || v === 'nan' ? null : v === 'inf' ? 1e300 : Number(v));
D.rows = lines.map(l => { const x = l.split(TAB), g = c => x[col[c]];
  return { analysis: g('analysis'), category: g('category'), method: g('method'), a: +g('a'), b: +g('b'), c: +g('c'), d: +g('d'), or: num(g('odds_ratio')), fold: num(g('fold_enrichment')),
    lo: num(g('odds_ratio_ci_low')), hi: num(g('odds_ratio_ci_high')), p: num(g('p')), q: num(g('q')) }; });
const dirOf = r => (r.q == null || r.q > 0.05 ? 'ns' : r.eff >= 1.1 ? 'more' : r.eff <= 1 / 1.1 ? 'less' : 'same');
const decorate = rows => { rows.forEach(r => { r.eff = r.or ?? r.fold; r.label = r.category; r.dir = dirOf(r); }); return rows; };
decorate(D.rows);
const S0 = { q: '', f: {}, vs: 'residues', m: 'mantel_haenszel' };
const K = { D, W: D.words, A, S: S0, esc: s => String(s ?? ''), int: n => String(n), cap: t => t, clicks: [], afterRender: [], paramsIn: [], paramsOut: [], views: {}, tabs: [], sections: {}, decorate,
  render: noop, writeHash: noop, link: v => '#' + v, go: noop, fxn: v => String(v), fq: v => String(v), PADJ: 0.05, holdStatus: () => null, tabName: (v, n) => n,
  rowsFor: (a, m) => D.rows.filter(r => r.analysis === a.id && (a.kind === 'protein_sets' ? r.method === 'enricher' : r.method === m) && r.eff != null),
  fkeyOf: a => (a.kind === 'protein_sets' ? 'p:' : 'a:') + a.id, vsOn: () => false };
K.selOn = () => K.sel.active();
K.rowsOf = (a, m) => (K.selOn() ? K.sel.rows(a.id, a.kind === 'protein_sets' ? 'enricher' : m) || [] : K.rowsFor(a, m));
window.PTMC_MODULES.forEach(m => m(K));
"""


def _run(tmp_path, index, body):
    (tmp_path / 'd.json').write_text(json.dumps(_page_data(index)))
    head = f"const ASSETS = {json.dumps(str(ASSETS))}, BUILT = {json.dumps(str(index.parent / 'assets'))}, DATA = {json.dumps(str(tmp_path / 'd.json'))}, SEL = {json.dumps(str(index.parent / 'data' / 'selection.json'))};" + HARNESS
    run = subprocess.run(['node', '-e', head + '(async () => {' + body + '})();'], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1200:]
    return json.loads(run.stdout)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_home_card_values_are_the_statistics_rows(tmp_path):
    index = _cards_build(tmp_path)
    assert (index.parent / 'assets' / 'kit-front.js').exists()
    assert re.search(r'<body class="cards slim"', index.read_text())
    out = _run(tmp_path, index, """
      const card = K.front.cards[0], r = K.front.homeRows(card);
      console.log(JSON.stringify({ rows: r.rows.map(x => [x.aid, x.cat, x.v, x.n, x.live]), html: K.front.home().includes('class="fr-card"') }));""")
    tsv = {(r['analysis'], r['category']): r for r in csv.DictReader((index.parent.parent / 'statistics.tsv').open(), delimiter='\t') if r['method'] == 'mantel_haenszel'}
    assert out['rows'] and out['html']
    for aid, cat, v, n, live in out['rows']:
        row = tsv[(aid, cat)]
        assert v == pytest.approx(float(row['odds_ratio'])) and n == int(row['a']) and live is False


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_subset_is_tested_again_as_the_selection_model_does(tmp_path):
    index = _cards_build(tmp_path, minimum=(1, 1))
    out = _run(tmp_path, index, """
      K.S.f = { 't:kind': ['x'] };
      await K.sel.ready; K.sel.data(); await K.sel.ready;
      const card = K.front.cards[0], r = K.front.homeRows(card), direct = K.sel.rows(card.home.analysis, 'mantel_haenszel') || [];
      console.log(JSON.stringify({ testable: K.sel.testable(), rows: r.rows.map(x => [x.cat, x.v, x.live]), direct: direct.map(x => [x.category, x.or]) }));""")
    assert out['testable'] and out['rows']
    direct = dict((c, v) for c, v in out['direct'])
    for cat, v, live in out['rows']:
        assert live is True and v == direct[cat]


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_selection_under_the_minimum_keeps_the_whole_dataset(tmp_path):
    index = _cards_build(tmp_path, minimum=(50, 500))
    out = _run(tmp_path, index, """
      K.S.f = { 't:kind': ['x'] };
      await K.sel.ready; K.sel.data(); await K.sel.ready;
      const r = K.front.homeRows(K.front.cards[0]), html = K.front.home();
      console.log(JSON.stringify({ testable: K.sel.testable(), live: r.rows.map(x => x.live), banner: /Showing the whole dataset/.test(html) }));""")
    assert out['testable'] is False and out['banner'] and not any(out['live'])
