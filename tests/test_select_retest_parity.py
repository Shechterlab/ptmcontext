"""A selection's retests in the browser (kit-select.js, run in Node) give the rows the run gives (the Python engine) when
the selection holds every mark: the same counts, odds ratio and p for each class. A toy site of three residues holds
the cases the browser once got wrong: flags tested among some of the residues only (a motif family's `among`), a
question of several tests counted on proteins with marks and other candidates (pooled and within-protein counts), a
question that counts only the residues inside some regions (only_in), and a question whose classes exclude each other
(a selection made with one of them tests none). No real mark, source or site is named."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'
ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _toy(tmp_path):
    rng = np.random.default_rng(11)
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    seqs = {f'P{i:02d}': 'M' + ''.join(rng.choice(list('STYPAGDERKLIVSTP'), size=89)) for i in range(36)}
    (data / 'toy.fasta').write_text(
        ''.join(f'>sp|{a}|{a}_TOY {a} OS=Toy OX=1 GN=G{a} PE=1 SV=1\n{s}\n' for a, s in seqs.items())
    )
    marks, regions = [], []
    for i, (a, s) in enumerate(seqs.items()):
        cand = [k + 1 for k, c in enumerate(s) if c in 'STY']
        if i % 3 == 2:
            continue  # a third of the proteins have no mark
        # some proteins with a region have their marks outside it only: no stratum there, other candidates all the same
        marks += [(a, p, 'x') for p in cand[:: 3 + i % 2] if i % 6 or p > 50]
        if i % 2 == 0:
            regions.append((a, 10, 45))
        if i % 4 == 0:  # a short region holding only marks: the test inside it has no other candidate there
            first = cand[0]
            regions.append((a, first, first))
    pd.DataFrame(marks, columns=['acc', 'pos', 'kind']).drop_duplicates(['acc', 'pos']).to_csv(
        data / 'marks.tsv', sep='\t', index=False
    )
    pd.DataFrame(regions, columns=['protein', 'from', 'to']).to_csv(data / 'regions.tsv', sep='\t', index=False)

    def entry(f, **kw):
        return {
            'file': f,
            'md5': md5_file(data / f),
            'source': 'synthetic, for a test',
            'version': 'test 1',
            'licence': 'CC0 1.0',
            **kw,
        }

    manifest = {
        'schema_version': 1,
        'inputs': {
            'toy_fasta': entry('toy.fasta', version='Toy 2026_01'),
            'toy_marks': entry('marks.tsv'),
            'toy_regions': entry('regions.tsv', columns={'accession': 'protein', 'start': 'from', 'end': 'to'}),
        },
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    site = {
        'schema_version': 1,
        'id': 'toy',
        'title': 'A toy site',
        'status': 'working',
        'mark': str(MARKS / 'phospho.yaml'),
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': {'regions': 'toy_regions'},
        'marks': {
            'input': 'toy_marks',
            'accession': 'acc',
            'position': 'pos',
            'residue_mismatch': 'error',
            'attributes': {'kind': {'column': 'kind', 'label': 'Kind', 'kind': 'category', 'filter': True}},
        },
        'analyses': [
            {
                'id': 'fams',
                'layer': 'motif_families',
                'new': True,
                'with': {
                    'noun': 'toy motif',
                    'families': [
                        {'name': 'stp', 'label': 'S/T-P', 'pattern': '[ST]P', 'start': 0, 'among': 'ST'},
                        {'name': 'yp', 'label': 'Y-x-P', 'pattern': 'Y.P', 'start': 0, 'among': 'Y'},
                        {'name': 'acid', 'label': 'x-x-D/E', 'pattern': '..[DE]', 'start': 0},
                    ],
                },
            },
            {'id': 'reg', 'layer': 'regions', 'new': True, 'with': {'role': 'regions', 'window': 5, 'noun': 'region'}},
            {
                'id': 'multi',
                'title': 'Regions, two ways',
                'new': True,
                'tests': [
                    {'category': 'inside', 'inside': 'regions', 'proteins_with': 'regions', 'label': 'Inside'},
                    {'category': 'inside_y', 'inside': 'regions', 'covered_by': 'regions', 'label': 'Inside, among'},
                ],
            },
            {
                'id': 'reg_only',
                'layer': 'neighbours',
                'new': True,
                'with': {'window': 3, 'noun': 'aromatic residue'},
                'only_in': {'role': 'regions'},
            },
        ],
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer', 'compare': {'min_proteins': 3, 'min_marks': 5}},
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


RUN = r"""
const fs = require('fs');
global.window = global; const noop = () => {};
const el = () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, querySelectorAll: () => [], classList: { toggle: noop } });
global.document = { createElement: el, body: el(), addEventListener: noop, getElementById: () => null, querySelectorAll: () => [] };
global.matchMedia = () => ({ matches: false }); global.addEventListener = noop;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(SEL, 'utf8'))) });
eval(fs.readFileSync(BUILT + '/kit-stats.js', 'utf8'));
eval(fs.readFileSync(ASSETS + '/kit-select.js', 'utf8'));
const html = fs.readFileSync(INDEX, 'utf8');
const D = JSON.parse(html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const A = Object.fromEntries(D.analyses.map((a) => [a.id, a]));
const S0 = { q: '', f: {}, vs: 'residues', m: 'mantel_haenszel' };
const K = { D, W: D.words, A, S: S0, esc: (s) => String(s ?? ''), int: (n) => String(n), cap: (t) => t, clicks: [], afterRender: [],
  paramsIn: [], paramsOut: [], views: {}, tabs: [], sections: {}, decorate: (r) => r, render: noop, writeHash: noop, link: (v) => '#' + v,
  go: noop, fxn: (v) => String(v), fq: (v) => String(v), PADJ: 0.05, holdStatus: () => null, tabName: (v, n) => n, rowsFor: () => [],
  fkeyOf: (a) => (a.kind === 'protein_sets' ? 'p:' : 'a:') + a.id, vsOn: () => false };
K.selOn = () => K.sel.active();
window.PTMC_MODULES.forEach((m) => m(K));
(async () => {
  K.sel.data(); await K.sel.ready;
  const out = {};
  Object.assign(S0.f, FILTER);
  for (const aid of AIDS)
    for (const m of ['fisher', 'mantel_haenszel'])
      out[aid + '|' + m] = (K.sel.retest(aid, m) || []).map((r) => ({ category: r.category, a: r.a, b: r.b, c: r.c, d: r.d, or: r.or, p: r.p, q: r.q, descriptive: !!r.descriptive }));
  console.log(JSON.stringify(out));
})();
"""


def _retest(index, aids, filt):
    head = (
        f'const ASSETS = {json.dumps(str(ASSETS))}, BUILT = {json.dumps(str(index.parent / "assets"))}, '
        f'INDEX = {json.dumps(str(index))}, SEL = {json.dumps(str(index.parent / "data" / "selection.json"))}, '
        f'AIDS = {json.dumps(aids)}, FILTER = {json.dumps(filt)};'
    )
    run = subprocess.run(['node', '-e', head + RUN], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1500:]
    return json.loads(run.stdout)


def _built(tmp_path):
    root = _toy(tmp_path)
    path = root / 'sites' / 'toy.yaml'
    assert S.website_problems(S.load_site(path)) == []
    S.run(path, root=root / 'data', log=lambda *_: None)
    index = web.build(path, log=lambda *_: None)
    stats = pd.read_csv(root / 'out' / 'toy' / 'statistics.tsv', sep='\t', keep_default_na=False)
    return root, index, stats


def _close(x, y):
    if x in (None, '', 'nan') or y in (None, '', 'nan'):
        return x in (None, '', 'nan') and y in (None, '', 'nan')
    x, y = float(x), float(y)
    return abs(x - y) <= 1e-4 * max(abs(x), abs(y), 1e-12)


def test_every_mark_retested_in_the_browser_gives_the_runs_rows(tmp_path):
    root, index, stats = _built(tmp_path)
    aids = ['fams', 'reg', 'multi', 'reg_only']
    got = _retest(index, aids, {'t:kind': ['x']})  # every mark has kind x: the selection holds them all
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    assert set(sel['among']['fams'].values()) == {'ST', 'Y'} and len(sel['residues']) == len(sel['marks'])
    checked = 0
    for aid in aids:
        for m in ('fisher', 'mantel_haenszel'):
            run = stats[(stats['analysis'] == aid) & (stats['method'] == m)]
            for r in got[f'{aid}|{m}']:
                cat = r['category']
                row = run[(run['category'] == cat) | (run['category'] + '_' + run['stratum'].astype(str) == cat)]
                assert len(row) == 1, (aid, m, cat)
                row = row.iloc[0]
                assert (r['a'], r['b'], r['c'], r['d']) == tuple(int(row[k]) for k in 'abcd'), (
                    aid,
                    m,
                    cat,
                    r,
                    dict(row),
                )
                assert _close(r['or'], row['odds_ratio']) and _close(r['p'], row['p']), (aid, m, cat, r, dict(row))
                checked += 1
    # the cases themselves are there: a flag among S and T (its b and d count no tyrosine), a within-protein row of a
    # question of several tests and of an only_in question (c and d count the proteins with both only)
    assert checked >= 20
    st = stats[(stats['analysis'] == 'fams') & (stats['category'] == 'stp') & (stats['method'] == 'fisher')].iloc[0]
    acid = stats[(stats['analysis'] == 'fams') & (stats['category'] == 'acid') & (stats['method'] == 'fisher')].iloc[0]
    assert st['a'] + st['b'] < acid['a'] + acid['b'] and st['c'] + st['d'] < acid['c'] + acid['d']
    for aid, cat in (('multi', 'inside_y'), ('reg_only', 'none')):
        f, w = (
            stats[(stats['analysis'] == aid) & (stats['method'] == m) & (stats['category'] == cat)].iloc[0]
            for m in ('fisher', 'mantel_haenszel')
        )
        assert f['c'] + f['d'] > w['c'] + w['d'], aid


def test_a_selection_made_with_one_class_of_a_question_whose_classes_exclude_each_other_tests_none(tmp_path):
    root, index, stats = _built(tmp_path)
    got = _retest(index, ['reg'], {'a:reg': ['in_reg']})
    for m in ('fisher', 'mantel_haenszel'):
        rows = got[f'reg|{m}']
        assert rows and all(r['descriptive'] and r['q'] is None for r in rows), rows


VS = r"""
(async () => {
  K.sel.data(); await K.sel.ready;
  Object.assign(S0, STATE);
  const fam = {};
  for (const id of AIDS) fam[id] = (K.sel.contrast(id, METHOD) || []).map((r) => ({ category: r.category, p: r.p, q: r.q, descriptive: !!r.descriptive }));
  console.log(JSON.stringify({ fam, features: K.sel.residueFeatures(), mixed: K.sel.contrastGroups().mixed }));
})();
"""


def _vs(index, state, method, aids):
    head = (
        f'const ASSETS = {json.dumps(str(ASSETS))}, BUILT = {json.dumps(str(index.parent / "assets"))}, '
        f'INDEX = {json.dumps(str(index))}, SEL = {json.dumps(str(index.parent / "data" / "selection.json"))}, '
        f'AIDS = {json.dumps(aids)}, FILTER = {{}}, STATE = {json.dumps(state)}, METHOD = {json.dumps(method)};'
    )
    body = RUN.split('(async () => {')[0] + VS
    run = subprocess.run(['node', '-e', head + body], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1500:]
    return json.loads(run.stdout)


def test_against_the_other_marks_q_is_corrected_across_every_question_shown(tmp_path):
    from ptmstats import benjamini_hochberg

    root, index, stats = _built(tmp_path)
    aids = ['fams', 'multi', 'reg_only', 'reg', '@kind']
    out = _vs(index, {'vs': 'marks', 'f': {'a:fams': ['stp']}}, 'mantel_haenszel', aids)
    # chosen by a residue feature: the page names it in its caveat
    assert out['features'] and out['mixed'] > 3
    rows = [r for a in aids for r in out['fam'][a] if not r['descriptive'] and r['p'] is not None]
    q = benjamini_hochberg([r['p'] for r in rows])
    assert len(rows) > 3 and all(abs(r['q'] - x) < 1e-12 for r, x in zip(rows, q))


def test_a_selection_of_whole_proteins_is_not_tested_pooled_against_the_other_marks(tmp_path):
    root, index, stats = _built(tmp_path)
    genes = 'GP00 GP01 GP03 GP04 GP06'
    out = _vs(index, {'vs': 'marks', 'q': genes}, 'fisher', ['reg', 'fams'])
    assert out['mixed'] == 0 and out['features'] == []
    rows = [r for a in ('reg', 'fams') for r in out['fam'][a]]
    assert rows and all(r['descriptive'] and r['p'] is None for r in rows)
