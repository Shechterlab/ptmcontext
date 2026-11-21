"""Mutation propensity (CONTRACTS.md, "Mutation propensity"): the writers of data/m, data/wf.json and data/onco.json, from a toy
site with a table of every source in the release's columns; the Python and JavaScript twins (the file of a protein, a block read
back as rows); the site file's checks."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml
from test_protein_tables import _page_data, _toy

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file
from ptmcontext.web import propensity as PR
from ptmcontext.web import variants as V

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
NA = np.nan


def _prop_rows(rows, nh=True, lower=False, status='test'):
    """A source table of the release: rows (acc, pos, k, e, eu, q, k2, e2, q2, ql); o = k / e."""
    out = []
    for acc, pos, k, e, eu, q, k2, e2, q2, ql in rows:
        r = {
            'canonical_UniProtAC': acc,
            'position': pos,
            'residue': 'R',
            'site_sets': 'toy' if pos in (2, 5, 25) else '',
            'k': k,
            'expected': e,
            'oe': (k / e) if e == e and e else NA,
            'expected_unweighted': eu,
            'oe_unweighted': k / eu,
            'q_upper': q,
            'p_upper': q,
            'samples_profiled': 100,
            'samples_profiled_no_hypermutated': 80,
            'oe_status': status,
        }
        if nh:
            r.update(
                {
                    'k_no_hypermutated': k2,
                    'expected_no_hypermutated': e2,
                    'oe_no_hypermutated': (k2 / e2) if e2 == e2 and e2 else NA,
                    'expected_unweighted_no_hypermutated': eu,
                    'oe_unweighted_no_hypermutated': k2 / eu,
                    'q_upper_no_hypermutated': q2,
                    'p_upper_no_hypermutated': q2,
                }
            )
        if lower:
            r['q_lower'] = ql
            r['p_lower'] = ql
        out.append(r)
    return pd.DataFrame(out)


def _toy_propensity(tmp_path):
    root = _toy(tmp_path)
    data = root / 'data'
    tcga = _prop_rows(
        [
            ('P1', 2, 3, 0.5, 0.4, 0.01, 1, 0.3, 0.2, NA),  # a known site with a ring
            ('P1', 5, 0, 0.4, 0.4, 1.0, 0, 0.3, 1.0, NA),  # a known site with no change
            ('P1', 11, 1, 0.6, 0.4, 0.6, 1, 0.5, 0.5, NA),  # another residue with a change
            ('P2', 25, 2, NA, 1.0, NA, 2, NA, NA, NA),  # no coding sequence: unweighted, no q
            ('P2', 6, 1, NA, 1.0, NA, 0, NA, NA, NA),
        ]
    )
    tcga.to_csv(data / 'prop_tcga.tsv', sep='\t', index=False)
    depmap = _prop_rows([('P1', 2, 0, 0.1, 0.1, 1.0, 0, 0.1, 1.0, NA)])
    depmap.to_csv(data / 'prop_depmap.tsv', sep='\t', index=False)
    _prop_rows([('P1', 2, 2, 1.2, 1.0, 0.4, 0, 0, 0, NA)], nh=False, status='descriptive').to_csv(
        data / 'prop_clinvar.tsv', sep='\t', index=False
    )
    _prop_rows(
        [('P1', 2, 2, 2.0, 1.0, 0.4, 0, 0, 0, 0.9), ('P1', 5, 1, 2.0, 1.0, 1.0, 0, 0, 0, 0.01), ('P1', 11, 1, 2.0, 1.0, 1.0, 0, 0, 0, 0.5), ('P2', 25, 0, 3.0, 1.0, 1.0, 0, 0, 0, 0.001)], nh=False, lower=True
    ).to_csv(data / 'prop_gnomad.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'canonical_UniProtAC': ['P1', 'P1', 'P1', 'P1'],
            'position': [2, 2, 5, 11],
            'af': [1e-5, 2e-5, 1e-6, 5e-5],
        }
    ).to_csv(data / 'gchg.tsv', sep='\t', index=False)
    freq = pd.DataFrame(
        [
            ('P1', 2, 'R', 'tcga_mc3', 'TCGA-AA', 2, 60, 1, 50),
            ('P1', 2, 'R', 'tcga_mc3', 'TCGA-BB', 1, 40, 0, 30),
            ('P1', 11, 'R', 'tcga_mc3', 'TCGA-AA', 1, 60, 1, 50),  # not a site
            ('P1', 2, 'R', 'depmap_24q4', 'Lung', 0, 10, 0, 8),
        ],
        columns=['canonical_UniProtAC', 'position', 'residue', 'source', 'group', 'samples_mutated', 'samples_profiled',
                 'samples_mutated_no_hypermutated', 'samples_profiled_no_hypermutated'],
    )
    freq.to_csv(data / 'freq.tsv', sep='\t', index=False)
    pd.DataFrame(
        [
            ('tcga_mc3', 'TCGA-AA', 60, 50),
            ('tcga_mc3', 'TCGA-BB', 40, 30),
            ('tcga_mc3', 'TCGA-CC', 5, 5),  # a group with no changed sample
            ('depmap_24q4', 'Lung', 10, 8),
        ],
        columns=['source', 'group', 'samples_profiled', 'samples_profiled_no_hypermutated'],
    ).to_csv(data / 'den.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'source': ['tcga_mc3'] * 4,
            'sample_id': ['TCGA-01-0001-01', 'TCGA-01-0002-01', 'TCGA-01-0003-01', 'TCGA-01-0004-01'],
            'group': ['TCGA-AA', 'TCGA-AA', 'TCGA-BB', 'TCGA-BB'],
            'burden_per_mb': [1.5, 55.0, 2.0, 3.0],
            'hypermutated': [False, True, False, False],
        }
    ).to_csv(data / 'burden.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'canonical_UniProtAC': ['P1', 'P1', 'P1', 'P1', 'P2'],
            'position': [2, 2, 2, 11, 25],
            'alt': ['H', 'C', '*', 'K', 'Q'],
            'sample_id': ['TCGA-01-0001-01', 'TCGA-01-0002-01', 'TCGA-01-0003-01', 'TCGA-01-0001-01', 'TCGA-01-0004-01'],
        }
    ).to_csv(data / 'chg.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'site_set': ['toy', 'toy'],
            'label': ['Toy (R)'] * 2,
            'residue': ['R'] * 2,
            'source': ['tcga_mc3'] * 2,
            'cohort': ['all', 'no_hypermutated'],
            'proteins': [2, 2],
            'sites': [3, 3],
            'observed': [5, 3],
            'expected': [1.0, 1.0],
            'oe': [5.0, 3.0],
            'p_upper': [0.01, 0.04],
            'p_lower': [1.0, 1.0],
            'iterations': [10000, 10000],
            'oe_status': ['test', 'test'],
        }
    ).to_csv(data / 'sets.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'kind': ['oncohistone', 'recurrent hotspot', 'recurrent hotspot'],
            'source': ['tcga_mc3'] * 3,
            'cohort': ['all'] * 3,
            'result': ['fail', 'pass', 'pass'],
            'control': ['a', 'b', 'c'],
        }
    ).to_csv(data / 'ctl.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'source': ['tcga_mc3'],
            'cohort': ['all'],
            'units': [10],
            'residues': [100],
            'binomial_p05': [5],
            'permutation_p05': [5],
            'both_p05': [5],
            'agreement_p05': [1.0],
            'iterations': [10000],
        }
    ).to_csv(data / 'val.tsv', sep='\t', index=False)
    mf = root / 'sites' / 'toy.inputs.json'
    man = json.loads(mf.read_text())
    names = {
        'toy_prop_tcga': 'prop_tcga.tsv',
        'toy_prop_depmap': 'prop_depmap.tsv',
        'toy_prop_clinvar': 'prop_clinvar.tsv',
        'toy_prop_gnomad': 'prop_gnomad.tsv',
        'toy_freq': 'freq.tsv',
        'toy_den': 'den.tsv',
        'toy_burden': 'burden.tsv',
        'toy_chg': 'chg.tsv',
        'toy_gchg': 'gchg.tsv',
        'toy_sets': 'sets.tsv',
        'toy_ctl': 'ctl.tsv',
        'toy_val': 'val.tsv',
    }
    for k, f in names.items():
        man['inputs'][k] = {
            'file': f,
            'md5': md5_file(data / f),
            'source': 'synthetic, for a test',
            'version': 'test 1',
            'licence': 'CC0 1.0',
        }
    mf.write_text(json.dumps(man, indent=1))
    sp = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(sp.read_text())
    site['website']['propensity'] = {
        'residues': ['R'],
        'set': 'toy',
        'sources': [
            {'id': 'tcga', 'label': 'TCGA', 'long': 'TCGA tumors', 'kind': 'somatic', 'table': 'toy_prop_tcga', 'frequency_source': 'tcga_mc3', 'unit': ['tumor', 'tumors']},
            {'id': 'depmap', 'label': 'DepMap', 'kind': 'somatic', 'table': 'toy_prop_depmap', 'frequency_source': 'depmap_24q4'},
            {'id': 'clinvar', 'label': 'ClinVar', 'kind': 'germline', 'table': 'toy_prop_clinvar'},
            {'id': 'gnomad', 'label': 'gnomAD', 'kind': 'germline', 'table': 'toy_prop_gnomad', 'lower_tail': True},
        ],
        'frequency': 'toy_freq',
        'denominators': 'toy_den',
        'burden': 'toy_burden',
        'changes': ['toy_chg'],
        'germline_changes': ['toy_gchg'],
        'site_sets': 'toy_sets',
        'controls': 'toy_ctl',
        'validation': 'toy_val',
    }
    sp.write_text(yaml.safe_dump(site, sort_keys=False))
    return root, sp


@pytest.fixture(scope='module')
def built(tmp_path_factory):
    root, sp = _toy_propensity(tmp_path_factory.mktemp('prop'))
    S.run(sp, root=root / 'data', log=lambda *_: None)
    index = web.build(sp, log=lambda *_: None)
    return root, sp, index, _page_data(index)


def _shard(index, acc, n):
    return json.loads((index.parent / 'data' / 'm' / f'{V.hash_shard(acc, n):03d}.json').read_text())


def test_the_site_file_names_what_exists(built):
    root, sp, *_ = built
    site = S.load_site(sp)
    assert S.propensity_problems(site) == []
    site['website']['propensity']['sources'][0]['table'] = 'no_such_table'
    site['website']['propensity']['sources'][1]['card'] = 'no_card'
    site['website']['propensity']['sources'].append(dict(site['website']['propensity']['sources'][2]))
    got = S.propensity_problems(site)
    assert any('no_such_table' in x for x in got)
    assert any('no_card' in x for x in got)
    assert any('used twice' in x for x in got)
    site['website']['propensity']['denominators'] = ''
    assert any('frequency_source needs' in x for x in S.propensity_problems(site))


def test_the_page_is_told_what_the_files_hold(built):
    *_, data = built
    pr = data['propensity']
    assert [s['id'] for s in pr['sources']] == ['tcga', 'depmap', 'clinvar', 'gnomad']
    assert [s['descriptive'] for s in pr['sources']] == [False, False, True, False]
    assert pr['residues'] == ['R'] and pr['hypermutated'] == {'per_mb': 10}
    assert pr['wf'] == {'file': 'data/wf.json'} and pr['onco'] == {'file': 'data/onco.json'}
    assert pr['summary']['set_label'] == 'Toy (R)'
    assert {(c['kind'], c['result'], c['n']) for c in pr['summary']['controls']} == {
        ('oncohistone', 'fail', 1),
        ('recurrent hotspot', 'pass', 2),
    }


def test_a_protein_block_has_its_rows_in_both_cohorts(built):
    root, sp, index, data = built
    sh = _shard(index, 'P1', data['propensity']['shards'])
    rows = {r['pos']: r for r in PR.decode(sh['P1']['tcga'])}
    assert sorted(rows) == [2, 5, 11]  # every residue of the table, known site or not
    assert rows[2]['k'] == 3 and rows[2]['o'] == 6 and rows[2]['q'] == 0.01 and rows[2]['k2'] == 1
    assert rows[5]['o'] == 0 and rows[5]['k'] == 0  # a known site with no change keeps its row
    assert 'k2' not in PR.decode(sh['P1']['clinvar'])[0]  # a germline source has one cohort
    g = PR.decode(sh['P1']['gnomad'])
    assert g[1]['ql'] == 0.01  # the lower tail, only where q_lower < 0.05
    assert 'ql' not in g[0]


def test_an_entry_without_weights_falls_back_to_the_unweighted_expectation_and_has_no_q(built):
    root, sp, index, data = built
    rows = PR.decode(_shard(index, 'P2', data['propensity']['shards'])['P2']['tcga'])
    r = {x['pos']: x for x in rows}[25]
    assert r['u'] and r['q'] is None and r['e'] == 1 and r['o'] == 2
    assert r['u2'] and r['q2'] is None


def test_the_waterfall_file_counts_sites_per_group_and_keeps_a_group_without_changes(built):
    root, sp, index, data = built
    wf = json.loads((index.parent / 'data' / 'wf.json').read_text())
    assert wf['groups']['tcga'] == ['TCGA-AA', 'TCGA-BB', 'TCGA-CC']  # TCGA-CC has no changed sample and is still a group
    assert wf['den']['tcga'] == [[60, 50], [40, 30], [5, 5]] and wf['all']['tcga'] == [105, 85]
    # only the sites (P1:2) are listed with their changed samples: [group, changed, changed without hypermutated] triples
    entry = wf['sites']['P1'][0]
    assert entry[:2] == [2, 'R'] and entry[2] == [0, 2, 1, 1, 1, 0]  # TCGA-AA 2 of 1 (without hypermutated), TCGA-BB 1 of 0
    assert 'P2' not in wf['sites']  # P2:25 has no row of the frequency table
    # the curve of the residues that are not sites: P1:11 is the only one with a change, among 8 (11 arginines less 3 sites)
    m, n, ranks, vals = wf['bg']['tcga']['all']['R']['0']
    assert (m, n, ranks, vals) == (1, 8, [1], [0.0167])  # 1 of 60 TCGA-AA samples
    assert wf['bg']['tcga']['all']['R']['']  # pooled over every group, from the propensity table


def test_the_waterfall_file_has_o_e_and_q_of_the_sites_with_a_change_in_both_cohorts(built):
    root, sp, index, data = built
    wf = json.loads((index.parent / 'data' / 'wf.json').read_text())
    # only known sites with a change: P1:2 (k 3, O/E 6, q 0.01; without hypermutated k 1, O/E 3.3, q 0.2)
    st = wf['stats']['tcga']['P1']
    assert [e[0] for e in st] == [2] and st[0][1:] == [6, 0.01, 3.3, 0.2]
    assert 'P2' in wf['stats']['tcga'] and wf['stats']['tcga']['P2'][0][2] is None  # no weights: no q


def test_the_frequency_file_lists_the_known_sites_with_no_change_by_expected(built):
    root, sp, index, data = built
    wf = json.loads((index.parent / 'data' / 'wf.json').read_text())
    # known sites only (P1:5; P1:2 has changes), the cohort's own expected count
    assert wf['zero']['tcga']['all'] == [['P1', 5, 'R', 0.4]]
    assert wf['zero']['tcga']['no_hypermutated'] == [['P1', 5, 'R', 0.3]]
    assert data['propensity']['zero_rows'] == 1000


def test_a_block_has_the_raw_p_of_the_upper_tail_and_gnomad_the_lower(built):
    root, sp, index, data = built
    sh = _shard(index, 'P1', data['propensity']['shards'])
    t = {r['pos']: r for r in PR.decode(sh['P1']['tcga'])}
    assert t[2]['pu'] == 0.01 and t[2]['pu2'] == 0.2
    g = {r['pos']: r for r in PR.decode(sh['P1']['gnomad'])}
    assert g[2]['pl'] == 0.9 and g[5]['pl'] == 0.01 and 'pl' not in t[2]


def test_the_germline_file_counts_variants_and_lists_the_depleted_sites_with_none(built):
    root, sp, index, data = built
    assert data['propensity']['gn'] == {'file': 'data/gn.json', 'source': 'gnomad'}
    gn = json.loads((index.parent / 'data' / 'gn.json').read_text())
    # [position, residue, k (variants), summed af, O/E, q (more), q (fewer), expected, raw p (fewer), raw p (more)]: P1:2 has two variants (af 1e-5 + 2e-5) and
    # q_lower 0.9; P1:5 one variant and q_lower 0.01; P2:25 has none and q_lower 0.001, so it is listed (the most depleted)
    assert gn['sites']['P1'] == [[2, 'R', 2, 3e-05, 1, 0.4, 0.9, 2, 0.9, 0.4], [5, 'R', 1, 1e-06, 0.5, 1, 0.01, 2, 0.01, 1]]
    assert gn['sites']['P2'] == [[25, 'R', 0, 0, 0, 1, 0.001, 3, 0.001, 1]]
    assert gn['bg']['R'] == [1, 8, [1], [1]]  # the curve of k: P1:11 has one variant, among the 8 arginines that are not sites


def test_the_oncoprint_file_joins_samples_to_their_burden_and_marks_a_stop(built):
    root, sp, index, data = built
    oc = json.loads((index.parent / 'data' / 'onco.json').read_text())
    assert oc['projects'] == ['TCGA-AA', 'TCGA-BB']
    assert oc['samples'][1] == ['01-0002-01', 0, 1, 55.0]  # hypermutated
    cells = dict((p, c) for p, c in oc['sites']['P1'])
    assert sorted(cells) == [2]  # P1:11 is not a site
    assert sorted(cells[2]) == [0 * 2, 1 * 2, 2 * 2 + 1]  # two missense, and sample 2's stop (alt *)
    assert [c for p, c in oc['sites']['P2']] == [[3 * 2]]


def test_the_curve_keeps_the_ranked_values_it_samples():
    f = list(np.random.default_rng(1).random(500) ** 8)
    m, n, ranks, vals = PR.curve(f + [0.0] * 20, 1000)
    srt = sorted(f, reverse=True)
    assert m == 500 and n == 1000 and ranks[0] == 1 and ranks[-1] == 500
    assert all(abs(v - float(f'{srt[r - 1]:.3g}')) < 1e-12 for r, v in zip(ranks, vals))
    assert len(ranks) <= PR.CURVE_POINTS + 2
    assert PR.curve([0, 0], 5) == [0, 5, [], []]


def test_blocks_round_trip_and_keep_two_digits():
    df = pd.DataFrame(
        {
            'position': [30, 7, 12],
            'k': [1, 2, 0],
            'expected': [0.123456, 12.3456, 0.0],
            'oe': [8.1000, 0.16, 0.0],
            'q_upper': [0.00012345, 1.0, 1.0],
            'p_upper': [0.00005, 1.0, 1.0],
            'expected_unweighted': [0.2, 0.2, 0.2],
            'oe_unweighted': [5.0, 10.0, 0.0],
        }
    )
    b = PR.block(df, somatic=False)
    assert b['p'] == [7, 5, 18]  # sorted, as differences
    rows = PR.decode(b)
    assert [r['pos'] for r in rows] == [7, 12, 30]
    assert rows[0]['e'] == 12 and rows[2]['e'] == 0.12 and rows[2]['q'] == 0.00012


# ---- the JavaScript twins, run in Node -----------------------------------------------------------------------------------------

STUB = r"""
const fs = require('fs');
global.window = global; const noop = () => {};
const el = () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop });
global.document = { createElement: el, head: el(), body: el(), addEventListener: noop, querySelectorAll: () => [] };
const D = JSON.parse(process.argv[2]);
const K = { D, W: { mark: 'site' }, S: {}, esc: (s) => String(s ?? ''), int: (n) => String(n), clicks: [], paramsIn: [], paramsOut: [] };
eval(fs.readFileSync(process.argv[1], 'utf8'));
window.PTMC_MODULES.forEach((m) => m(K));
"""


def _node(body, data):
    if not shutil.which('node'):
        pytest.skip('needs Node')
    run = subprocess.run(
        ['node', '-e', STUB + body, str(ASSETS / 'kit-propensity.js'), json.dumps(data)], capture_output=True, text=True
    )
    assert run.returncode == 0, run.stderr[-1500:]
    return json.loads(run.stdout)


PR_DATA = {'propensity': {'shards': 7, 'sources': [{'id': 'tcga', 'label': 'TCGA', 'kind': 'somatic'}], 'hypermutated': {'per_mb': 10}}}


def test_the_file_of_a_protein_is_the_same_in_python_and_the_page():
    accs = ['P68431', 'Q9UQ80', 'P04637', 'A0A024RBG1', 'O00571-2']
    got = _node(f'console.log(JSON.stringify({accs!r}.map((a) => K.prop.hashOf(a, 37))));', PR_DATA)
    assert got == [V.hash_shard(a, 37) for a in accs]


def test_a_block_reads_back_as_the_same_rows_in_python_and_the_page(built):
    root, sp, index, data = built
    sh = _shard(index, 'P1', data['propensity']['shards'])
    for src in ('tcga', 'gnomad'):
        blk = sh['P1'][src]
        js = _node(f'console.log(JSON.stringify(K.prop.rowsOf({json.dumps(blk)})));', PR_DATA)
        py = PR.decode(blk)
        # the page leaves a key out where Python writes False, so compare what the page reads
        norm = lambda r: {k: v for k, v in r.items() if v is not False}  # noqa: E731
        assert [norm(r) for r in js] == [norm(r) for r in py]


def test_the_page_reads_the_cohort_the_reader_chose():
    blk = {'p': [2, 3], 'k': [3, 0], 'e': [0.5, 0.4], 'o': [6, 0], 'q': [0.01, 1], 'pu': [0.004, 1], 'k2': [1, 0], 'e2': [0.3, 0.3], 'o2': [3.3, 0], 'q2': [0.2, 1], 'pu2': [0.08, 1]}
    got = _node(
        f"""
global.fetch = async () => ({{ ok: true, json: async () => ({json.dumps({'P1': {'tcga': blk}})}) }});
(async () => {{
  await K.prop.load('P1');
  const pick = (v) => v && {{ k: v.k, o: v.o, q: v.q, p: v.p, nh: v.nh }};
  console.log(JSON.stringify([pick(K.prop.at('P1', 'tcga', 2, false)), pick(K.prop.at('P1', 'tcga', 2, true)), K.prop.at('P1', 'tcga', 3, true)]));
}})();
""",
        PR_DATA,
    )
    assert got == [
        {'k': 1, 'o': 3.3, 'q': 0.2, 'p': 0.08, 'nh': True},
        {'k': 3, 'o': 6, 'q': 0.01, 'p': 0.004, 'nh': False},
        None,
    ]


def test_the_three_times_flag_is_gone_from_every_page_module_and_the_docs():
    """The lollipop (circle size, ring) replaced the old "at least 3 times the protein's average" flag everywhere."""
    for f in [*ASSETS.glob('kit-*.js'), ASSETS / 'kit.css']:
        text = f.read_text()
        assert 'flag_ratio' not in text and 'cc-flag' not in text and 'data-cc-flag' not in text, f.name
        assert 'protein average' not in text.replace('protein average per', ''), f.name
    contracts = (Path(__file__).resolve().parents[1] / 'CONTRACTS.md').read_text()
    assert 'is gone' in contracts and 'chip to show only those' not in contracts


def test_both_protein_cards_draw_a_lollipop_for_each_source_of_the_site():
    cards = (ASSETS / 'kit-pcards.js').read_text()
    assert cards.count('lollipopFor(') == 3  # the definition, the cancer card and the germline card
    assert 'K.prop.lollipop' in cards and "K.prop.siteLine" in (ASSETS / 'kit-proteins.js').read_text()


def test_the_oncoprint_colors_are_three_different_validated_hues_in_both_themes():
    """missense, stop gained and a hypermutated tumor's burden are categorical slots 1 to 3 of the dataviz palette (checked with
    its validate_palette.js: light #2a78d6 #eb6834 #1baf7a, dark #3987e5 #d95926 #199e70); no two share a color."""
    import re

    text = (ASSETS / 'kit-mutations.js').read_text()
    light = re.findall(r':root\{--onc-1:(#\w+);--onc-2:(#\w+);--onc-3:(#\w+);', text)[0]
    dark = re.findall(r'--onc-1:(#\w+);--onc-2:(#\w+);--onc-3:(#\w+);--wf-hot:#e66767', text)[0]
    assert light == ('#2a78d6', '#eb6834', '#1baf7a') and dark == ('#3987e5', '#d95926', '#199e70')
    assert len(set(light)) == 3 and len(set(dark)) == 3
    assert "['#2a78d6', '#eb6834']" in text  # the exports use the light slots too


def test_rounding_never_carries_a_p_below_0_05_up_to_0_05():
    """Q8WXF1 R520 has a lower-tail p of 0.04986: two digits would write 0.05 and the page would miss it (13 sites in the
    release, 12 on the page)."""
    assert PR.sig(0.04986) == 0.0499 and PR.sig(0.0499) == 0.0499 and PR.sig(0.05) == 0.05 and PR.sig(0.0504) == 0.05
    assert PR.sig(0.0123456) == 0.012 and PR.sig(0.99) == 0.99 and PR.sig(0.04986, 3) == 0.0499


HOLM_CASES = [
    ([0.01, 0.04, 0.03], [0.03, 0.06, 0.06]),  # 3 × 0.01; 2 × 0.03 = 0.06; 1 × 0.04 = 0.04, held at the 0.06 before it
    ([0.5, 0.02, 0.02], [0.5, 0.06, 0.06]),  # a tie: both get the larger of 3 × 0.02 and 2 × 0.02
    ([0.001, 0.9, 0.021, 0.02], [0.004, 0.9, 0.06, 0.06]),  # the monotonic step: 2 × 0.021 = 0.042 is raised to 0.06
    ([0.6, 0.7], [1.0, 1.0]),  # capped at 1
    ([0.2], [0.2]),
    ([], []),
]


@pytest.mark.parametrize('ps, want', HOLM_CASES)
def test_holm_adjustment_in_the_page_matches_hand_values_and_statsmodels(ps, want):
    got = _node(f'console.log(JSON.stringify(K.prop.holm({json.dumps(ps)})));', PR_DATA)
    assert [round(x, 12) for x in got] == pytest.approx(want, abs=1e-12)
    if ps:
        from statsmodels.stats.multitest import multipletests

        ref = multipletests(ps, method='holm')[1]
        assert got == pytest.approx(list(ref), abs=1e-12)


def test_q_just_under_the_ring_is_not_printed_as_0_050():
    """A q of 0.04996 keeps its ring (q < 0.05), so it must not read 'q 0.050'."""
    got = _node("console.log(JSON.stringify([0.04996, 0.0499, 0.05, 0.0512, 0.2].map(K.prop.fq)));", PR_DATA)
    assert got == ['< 0.05', '< 0.05', '0.050', '0.051', '0.20']
