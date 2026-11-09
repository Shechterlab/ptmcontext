"""A stand-in page for running kit modules under Node: the kit modules' K object with the statistics rows of a built toy site."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import yaml
from test_search import _page_data, _toy

from ptmcontext import site as S
from ptmcontext import web

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'

HARNESS = r"""
const fs = require('fs');
global.window = global; const noop = () => {};
const el = () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, querySelectorAll: () => [], classList: { toggle: noop } });
global.document = { createElement: el, body: el(), addEventListener: noop, getElementById: () => null, querySelectorAll: () => [] };
global.matchMedia = () => ({ matches: false }); global.addEventListener = noop;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(SEL, 'utf8'))) });
eval(fs.readFileSync(BUILT + '/kit-stats.js', 'utf8'));
eval(fs.readFileSync(ASSETS + '/kit-select.js', 'utf8'));
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


def toy_build(tmp_path, minimum=None):
    root = _toy(tmp_path, with_search=False)
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['website']['front'] = {'mode': 'classic'}
    if minimum:
        site['website']['compare'] = {'min_proteins': minimum[0], 'min_marks': minimum[1]}
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    return web.build(p, log=lambda *_: None)


def _run(tmp_path, index, body):
    (tmp_path / 'd.json').write_text(json.dumps(_page_data(index)))
    head = (
        f'const ASSETS = {json.dumps(str(ASSETS))}, BUILT = {json.dumps(str(index.parent / "assets"))}, DATA = {json.dumps(str(tmp_path / "d.json"))}, SEL = {json.dumps(str(index.parent / "data" / "selection.json"))};'
        + HARNESS
    )
    run = subprocess.run(['node', '-e', head + '(async () => {' + body + '})();'], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1200:]
    return json.loads(run.stdout)
