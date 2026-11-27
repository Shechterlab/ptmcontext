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
            'n': 20,
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
                    'n_no_hypermutated': 20,
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
        [
            ('P1', 2, 2, 2.0, 1.0, 0.4, 0, 0, 0, 0.9),
            ('P1', 5, 1, 2.0, 1.0, 1.0, 0, 0, 0, 0.01),
            ('P1', 11, 1, 2.0, 1.0, 1.0, 0, 0, 0, 0.5),
            ('P2', 25, 0, 3.0, 1.0, 1.0, 0, 0, 0, 0.001),
        ],
        nh=False,
        lower=True,
    ).to_csv(data / 'prop_gnomad.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'canonical_UniProtAC': ['P1', 'P1', 'P1', 'P1'],
            'position': [2, 2, 5, 11],
            'af': [1e-5, 2e-5, 1e-6, 5e-5],
        }
    ).to_csv(data / 'gchg.tsv', sep='\t', index=False)
    # ClinVar changes: P1 2 has two named pathogenic variants and one with no condition; P1 5 is benign; P1 11 is not a site
    pd.DataFrame(
        {
            'canonical_UniProtAC': ['P1', 'P1', 'P1', 'P1', 'P1', 'P2', 'P1'],
            'position': [2, 2, 2, 5, 11, 25, 2],
            'alt': ['H', 'C', '*', 'K', 'Q', 'L', 'D'],
            'variation_id': [101, 102, 103, 104, 105, 106, 107],
            'clinsig_simple': [1, 1, 1, 0, 1, 1, 1],
            'germline_classification': [
                'Pathogenic',
                'Likely pathogenic',
                'Pathogenic',
                'Benign',
                'Pathogenic',
                'Pathogenic/Likely pathogenic',
                'Conflicting classifications of pathogenicity',
            ],
            'review_stars': [2, 1, 0, 1, 3, 1, 1],
            'conditions': [
                'Toy cancer syndrome|not specified',
                'Toy cancer syndrome; Rare thing',
                'not provided',
                'Toy cancer syndrome',
                'Toy cancer syndrome',
                'Rare thing',
                'Toy cancer syndrome',
            ],
        }
    ).to_csv(data / 'cv_chg.tsv', sep='\t', index=False)
    # the release's family rules, as a file that must be read and never run
    (data / 'fam_rules.py').write_text(
        'FAMILY_RULES = [("Cancer / neoplasia", r"cancer")]\n'
        'ADDITIONAL_FAMILY_RULES = [("Eye and ear", r"retina")]\n'
        'CURATED_OVERRIDES = {"Rare thing": ("Eye and ear", "included", "curated")}\n'
        'raise RuntimeError("the family file was run")\n'
    )
    freq = pd.DataFrame(
        [
            ('P1', 2, 'R', 'tcga_mc3', 'TCGA-AA', 2, 60, 1, 50),
            ('P1', 2, 'R', 'tcga_mc3', 'TCGA-BB', 1, 40, 0, 30),
            ('P1', 11, 'R', 'tcga_mc3', 'TCGA-AA', 1, 60, 1, 50),  # not a site
            ('P1', 2, 'R', 'depmap_24q4', 'Lung', 0, 10, 0, 8),
        ],
        columns=[
            'canonical_UniProtAC',
            'position',
            'residue',
            'source',
            'group',
            'samples_mutated',
            'samples_profiled',
            'samples_mutated_no_hypermutated',
            'samples_profiled_no_hypermutated',
        ],
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
            'sample_id': [
                'TCGA-01-0001-01',
                'TCGA-01-0002-01',
                'TCGA-01-0003-01',
                'TCGA-01-0001-01',
                'TCGA-01-0004-01',
            ],
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
        'toy_cv': 'cv_chg.tsv',
        'toy_fam': 'fam_rules.py',
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
            {
                'id': 'tcga',
                'label': 'TCGA',
                'long': 'TCGA tumors',
                'kind': 'somatic',
                'table': 'toy_prop_tcga',
                'frequency_source': 'tcga_mc3',
                'unit': ['tumor', 'tumors'],
            },
            {
                'id': 'depmap',
                'label': 'DepMap',
                'kind': 'somatic',
                'table': 'toy_prop_depmap',
                'frequency_source': 'depmap_24q4',
            },
            {'id': 'clinvar', 'label': 'ClinVar', 'kind': 'germline', 'table': 'toy_prop_clinvar'},
            {'id': 'gnomad', 'label': 'gnomAD', 'kind': 'germline', 'table': 'toy_prop_gnomad', 'lower_tail': True},
        ],
        'frequency': 'toy_freq',
        'denominators': 'toy_den',
        'burden': 'toy_burden',
        'changes': ['toy_chg'],
        'germline_changes': ['toy_gchg'],
        'clinvar_changes': ['toy_cv'],
        'clinvar_pathogenic': {
            'column': 'germline_classification',
            'matches': '(Pathogenic|Likely pathogenic)([;,/].*)?',
        },
        'disease_families': 'toy_fam',
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
    assert pr['wf'] == {'file': 'data/wf.json', 'known': True} and pr['onco'] == {'file': 'data/onco.json'}
    assert pr['summary']['set_label'] == 'Toy (R)'
    assert {(c['kind'], c['result'], c['n']) for c in pr['summary']['controls']} == {
        ('oncohistone', 'fail', 1),
        ('recurrent hotspot', 'pass', 2),
    }


def test_the_inherited_disease_file_counts_variants_by_the_release_families(built):
    _, _, index, data = built
    assert data['propensity']['cv'] == {'file': 'data/cv.json'}
    cv = json.loads((index.parent / 'data' / 'cv.json').read_text())
    # the families by total, the catch-all (none here) last; each condition name once, with its family
    assert cv['fam'] == ['Cancer / neoplasia', 'Eye and ear'] and cv['other'] == -1
    assert cv['cond'] == [['Toy cancer syndrome', 0], ['Rare thing', 1]]
    assert cv['unnamed'] == 1  # a variant that names no condition is counted, not listed
    sites = {a: dict((p, v) for p, v in rows) for a, rows in cv['sites'].items()}
    assert set(sites) == {'P1', 'P2'} and set(sites['P1']) == {
        2
    }  # a benign variant, a conflicting one (107, clinsig_simple 1) and a residue that is no site are left out
    assert sites['P1'][2] == [[101, 2, 'H', [0]], [102, 1, 'C', [0, 1]]]
    assert sites['P2'][25] == [[106, 1, 'L', [1]]]


def test_the_family_rules_are_read_as_text_and_the_release_rule_is_applied(tmp_path):
    from ptmcontext.web import disease_families as DF

    f = tmp_path / 'rules.py'
    f.write_text(
        'FAMILY_RULES = [("A", r"alpha"), ("B", r"beta")]\nADDITIONAL_FAMILY_RULES = [("C", r"gamma")]\n'
        'CURATED_OVERRIDES = {"beta alpha": ("C", "included", "x")}\nraise SystemExit("run")\n'
    )
    rules = DF.read_rules(f)  # the file would stop the interpreter if it were run
    assert DF.family(rules, 'Alpha beta') == 'A'  # the first audited rule wins, case does not matter
    assert DF.family(rules, 'beta alpha') == 'C'  # an override comes first
    assert DF.family(rules, 'a gamma thing') == 'C'  # then the additional rules
    assert DF.family(rules, 'nothing') == DF.UNASSIGNED
    assert DF.condition_names('Alpha| not specified ;See cases;beta ; alpha;;') == ['Alpha', 'beta', 'alpha']
    assert DF.condition_names(None) == [] and DF.condition_names(float('nan')) == []
    f.write_text('FAMILY_RULES = []\n')
    with pytest.raises(ValueError):
        DF.read_rules(f)


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
    assert wf['groups']['tcga'] == [
        'TCGA-AA',
        'TCGA-BB',
        'TCGA-CC',
    ]  # TCGA-CC has no changed sample and is still a group
    assert wf['den']['tcga'] == [[60, 50], [40, 30], [5, 5]] and wf['all']['tcga'] == [105, 85]
    # only the sites (P1:2) are listed with their changed samples: [group, changed, changed without hypermutated] triples
    entry = wf['sites']['P1'][0]
    assert entry[:2] == [2, 'R'] and entry[2] == [
        0,
        2,
        1,
        1,
        1,
        0,
    ]  # TCGA-AA 2 of 1 (without hypermutated), TCGA-BB 1 of 0
    assert 'P2' not in wf['sites']  # P2:25 has no row of the frequency table
    # the curve of the signed score of the residues that are not sites: P1:11 (O/E 1.7, p 0.6: -log10 0.6 = 0.22) and P2:6 (no test: 0)
    assert wf['bg']['tcga']['all']['R'] == [2, 2, [1, 2], [0.222, 0]]


def test_the_waterfall_file_has_o_e_and_q_of_the_sites_with_a_change_in_both_cohorts(built):
    root, sp, index, data = built
    wf = json.loads((index.parent / 'data' / 'wf.json').read_text())
    # only known sites with a change: P1:2 (k 3, O/E 6, q 0.01; without hypermutated k 1, O/E 3.3, q 0.2)
    # [position, O/E, q, k, expected, p (more), p (fewer)] and the same without hypermutated; the toy's p_upper is not its binomial, so
    # there is no lower tail (None) and the opposite p is left out where it says nothing
    st = wf['stats']['tcga']['P1']
    assert [e[0] for e in st] == [2] and st[0][1:] == [6, 0.01, 3, 0.5, 0.01, None, 3.3, 0.2, 1, 0.3, 0.2, None]
    assert wf['lower']['tcga'] == [False, False]
    p2 = wf['stats']['tcga']['P2'][0]
    assert p2[2] is None and len(p2) == 7  # no weights: no q; both cohorts alike, so one set of numbers


def test_the_frequency_file_lists_the_known_sites_with_no_change_by_expected(built):
    root, sp, index, data = built
    wf = json.loads((index.parent / 'data' / 'wf.json').read_text())
    # known sites only (P1:5; P1:2 has changes), the cohort's own expected count
    assert wf['zero']['tcga']['all'] == [
        ['P1', 5, 'R', 0.4, None]
    ]  # [accession, position, residue, expected, p (fewer)]
    assert wf['zero']['tcga']['no_hypermutated'] == [['P1', 5, 'R', 0.3, None]]
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
    assert gn['sites']['P1'] == [
        [2, 'R', 2, 3e-05, 1, 0.4, 0.9, 2, 0.9, 0.4],
        [5, 'R', 1, 1e-06, 0.5, 1, 0.01, 2, 0.01, 1],
    ]
    assert gn['sites']['P2'] == [[25, 'R', 0, 0, 0, 1, 0.001, 3, 0.001, 1]]
    assert gn['bg']['R'] == [
        1,
        1,
        [1],
        [-0.301],
    ]  # the signed curve: P1:11 is the one residue that is not a site (O/E 0.5, p_lower 0.5)


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


PR_DATA = {
    'propensity': {
        'shards': 7,
        'sources': [{'id': 'tcga', 'label': 'TCGA', 'kind': 'somatic'}],
        'hypermutated': {'per_mb': 10},
    }
}


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
    blk = {
        'p': [2, 3],
        'k': [3, 0],
        'e': [0.5, 0.4],
        'o': [6, 0],
        'q': [0.01, 1],
        'pu': [0.004, 1],
        'k2': [1, 0],
        'e2': [0.3, 0.3],
        'o2': [3.3, 0],
        'q2': [0.2, 1],
        'pu2': [0.08, 1],
    }
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
    assert 'K.prop.lollipop' in cards and 'K.prop.siteLine' in (ASSETS / 'kit-proteins.js').read_text()


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
    got = _node('console.log(JSON.stringify([0.04996, 0.0499, 0.05, 0.0512, 0.2].map(K.prop.fq)));', PR_DATA)
    assert got == ['< 0.05', '< 0.05', '0.050', '0.051', '0.20']


# ---- the signed score and the lower tail ------------------------------------------------------------------------------------


def test_the_signed_score_has_a_side_for_every_o_e_and_zero_at_one():
    assert PR.signed_score(3.0, 1e-4, 1.0) == pytest.approx(4.0)  # more than expected: -log10 of the upper p, up
    assert PR.signed_score(0.2, 0.99, 1e-3) == pytest.approx(-3.0)  # fewer: log10 of the lower p, down
    assert PR.signed_score(0.0, 1.0, 0.01) == pytest.approx(-2.0)  # a site with no change goes down by its lower p
    assert PR.signed_score(1.0, 0.5, 0.6) == 0.0  # O/E 1 is on the line
    assert (
        PR.signed_score(2.0, None, 0.5) is None and PR.signed_score(0.5, 0.5, None) is None
    )  # the side's p is missing: no test
    assert PR.signed_score(None, 0.1, 0.1) is None
    assert (
        PR.signed_score(2.0, 0.0, 1.0) == PR.SCORE_CAP and PR.signed_score(0.5, 1.0, 0.0) == -PR.SCORE_CAP
    )  # an underflowed p
    got = PR.signed_scores(
        [3.0, 0.2, 0.0, 1.0, 2.0, np.nan], [1e-4, 0.99, 1.0, 0.5, np.nan, 0.1], [1.0, 1e-3, 0.01, 0.6, 1.0, 0.1]
    )
    assert got[:4] == pytest.approx([4.0, -3.0, -2.0, 0.0]) and np.isnan(got[4]) and np.isnan(got[5])


def _binomial_table(rows: int, seed: int = 3) -> pd.DataFrame:
    """A source table whose p_upper is the binomial upper tail of its k, n and expected, stored to four significant digits."""
    from scipy.stats import binom

    rng = np.random.default_rng(seed)
    n = rng.integers(1, 400, rows)
    e = rng.uniform(0.01, 20, rows).clip(max=n * 0.9)
    k = rng.binomial(n, e / n)
    pu = binom.sf(k - 1, n, e / n)
    d = pd.DataFrame({'k': k, 'n': n, 'expected': np.round(e, 6), 'p_upper': [float(f'{x:.4g}') for x in pu]})
    for c in ('k', 'n', 'expected', 'p_upper'):
        d[c + '_no_hypermutated'] = d[c]
    return d


def test_the_release_p_upper_is_reproduced_by_its_own_binomial_before_a_lower_tail_is_computed():
    d = _binomial_table(3000)
    rows, abs_diff, rel_diff = PR.upper_reproduces(d, False)
    assert rows == 3000 and rel_diff < 6e-4 and PR.lower_tail_ok(d, False) and PR.lower_tail_ok(d, True)
    up, lo, ok = PR.binom_tails(d, False)
    assert ok.all() and (lo + up >= 1 - 1e-9).all()  # P(X <= k) + P(X >= k) = 1 + P(X = k)
    assert (lo[d['k'] == 0] > 0).all()  # no change still has a lower tail: P(X = 0)
    bad = d.copy()
    bad.loc[7, 'p_upper'] *= 1.2  # one row the release's model does not give back
    assert not PR.lower_tail_ok(bad, False) and PR.lower_tail_ok(bad, True)
    assert not PR.lower_tail_ok(d.drop(columns=['n']), False)  # without n there is nothing to check


def test_the_lower_tail_of_a_somatic_source_is_computed_where_the_release_p_upper_is_reproduced():
    d = _binomial_table(40)
    d['canonical_UniProtAC'] = 'P1'
    d['position'] = range(1, 41)
    d['residue'] = 'R'
    d['isite'] = d['position'] <= 20
    d['oe'] = d['k'] / d['expected']
    for c in ('oe', 'q_upper'):
        d[c] = d['oe'] if c == 'oe' else 0.5
        d[c + '_no_hypermutated'] = d[c]
    d['samples_profiled'] = d['samples_profiled_no_hypermutated'] = 100
    d['expected_unweighted'] = d['expected_unweighted_no_hypermutated'] = d['expected']
    d['oe_unweighted'] = d['oe_unweighted_no_hypermutated'] = d['oe']
    d['site_sets'] = ''
    wf = PR.frequency_payload(
        pd.DataFrame(
            [('P1', 2, 'R', 'tcga_mc3', 'A', 1, 100, 1, 100)],
            columns=[
                'canonical_UniProtAC',
                'position',
                'residue',
                'source',
                'group',
                'samples_mutated',
                'samples_profiled',
                'samples_mutated_no_hypermutated',
                'samples_profiled_no_hypermutated',
            ],
        ),
        pd.DataFrame(
            {
                'source': ['tcga_mc3'],
                'group': ['A'],
                'samples_profiled': [100],
                'samples_profiled_no_hypermutated': [100],
            }
        ),
        {'P1': set(range(1, 21))},
        {'R': 20},
        {'tcga': d},
        [{'id': 'tcga', 'frequency_source': 'tcga_mc3'}],
    )
    assert wf['lower']['tcga'] == [True, True]
    up, lo, _ = PR.binom_tails(d, False)
    got = {e[0]: e for e in wf['stats']['tcga']['P1']}
    site = d[d['isite'] & (d['k'] > 0)]
    assert len(got) == len(site)
    for i, r in site.iterrows():
        e = got[int(r['position'])]
        assert e[6] in (None, PR.sig(float(lo[i]))) and e[5] in (None, PR.sig(float(r['p_upper'])))
        if r['oe'] < 1:
            assert e[6] == PR.sig(float(lo[i]))  # a site with fewer than expected has its lower tail
    z = wf['zero']['tcga']['all']
    for _, pos, _, _, pl in z:
        assert pl == PR.sig(float(lo[d.index[d['position'] == pos][0]]))


def test_the_waterfall_payload_stays_within_a_fifth_of_the_old_layout():
    """The old layout of a site with a change: [position, O/E, q, O/E, q] (about 36 bytes with its frequency counts' share of the
    file) and 72 KB of frequency curves per file. The new stats entry carries k, expected and both tails for two cohorts and the
    curves are one signed curve per cohort: the file grows by less than a fifth (measured on methylarginine: 390 KB before)."""
    rng = np.random.default_rng(1)
    sites = 3000
    o = [float(f'{x:.2g}') for x in rng.lognormal(0, 1, sites)]
    e = [float(f'{x:.2g}') for x in rng.uniform(0.01, 3, sites)]
    new = [
        [int(i)]
        + PR._cohort(o[i], 0.5, int(rng.integers(0, 5)), e[i], 0.12, 0.99)
        + PR._cohort(o[i], 0.5, 1, e[i], 0.14, 0.97)
        for i in range(sites)
    ]
    per_site = len(json.dumps(new, separators=(',', ':'))) / sites
    assert (
        per_site <= 80
    )  # was 36; 3,100 TCGA sites plus 840 DepMap sites in methylarginine: +160 KB, against 68 KB of curves removed
    bg = PR.signed_curve(rng.normal(0, 1, 200000))
    assert len(json.dumps(bg, separators=(',', ':'))) < 2000  # four of them in a file


def test_the_signed_curve_keeps_both_ends_of_the_ranking():
    c = PR.signed_curve([5.0, 1.0, 0.0, 0.0, -0.5, -9.0, np.nan])
    assert c[:2] == [7, 7] and c[2][0] == 1 and c[2][-1] == 7
    assert c[3][0] == 5 and c[3][-1] == -9 and c[3] == sorted(c[3], reverse=True)


# ---- the page's twins: the signed score and the label layout ----------------------------------------------------------------------


def test_the_signed_score_is_the_same_in_python_and_the_page():
    cases = [
        [3.0, 1e-4, 1.0],
        [0.2, 0.99, 1e-3],
        [0.0, 1.0, 0.01],
        [1.0, 0.5, 0.6],
        [2.0, None, 0.5],
        [0.5, 0.5, None],
        [None, 0.1, 0.1],
        [2.0, 0.0, 1.0],
        [0.5, 1.0, 0.0],
    ]
    got = _node(
        f'console.log(JSON.stringify({json.dumps(cases)}.map(([o, a, b]) => K.prop.signed(o, a, b))));', PR_DATA
    )
    want = [PR.signed_score(*c) for c in cases]
    assert got == pytest.approx(want, nan_ok=True) or all(
        (g is None and w is None) or g == pytest.approx(w) for g, w in zip(got, want)
    )


LAYOUT = r"""
const box = { x0: 40, y0: 10, x1: 400, y1: 240 };
const crowded = [...Array(14).keys()].map((i) => ({ key: i, x: 60 + i * 3, y: 20 + i * 9, w: 80, h: 15 }));
const a = K.prop.layoutLabels(crowded, box, [{ x: 300, y: 10, w: 90, h: 15 }]);
const b = K.prop.layoutLabels(crowded, box, [{ x: 300, y: 10, w: 90, h: 15 }]);
const ends = [...[14, 20, 27, 33, 39].map((y, i) => ({ key: 't' + i, x: 62 + i * 0.3, y, w: 85, h: 15 })), ...[222, 226, 231, 236, 238].map((y, i) => ({ key: 'b' + i, x: 395 - i * 0.3, y, w: 85, h: 15 }))];
const real = K.prop.layoutLabels(ends, box);
const lone = K.prop.layoutLabels([{ key: 'a', x: 200, y: 120, w: 70, h: 15 }], box);
const tight = K.prop.layoutLabels([...Array(12).keys()].map((i) => ({ key: i, x: 50 + i, y: 20, w: 90, h: 15 })), { x0: 40, y0: 10, x1: 150, y1: 45 });
console.log(JSON.stringify({ a, same: JSON.stringify(a) === JSON.stringify(b), real, lone, tight }));
"""


def test_labels_never_overlap_and_each_has_a_leader_or_sits_beside_its_point():
    out = _node(LAYOUT, PR_DATA)
    a = out['a']
    assert out['same']  # deterministic: the same input gives the same layout
    assert len(a['placed']) + len(a['dropped']) == 14 and len(a['placed']) >= 8
    boxes = a['placed'] + [{'x': 300, 'y': 10, 'w': 90, 'h': 15}]
    for i, p in enumerate(boxes):
        assert 40 <= p['x'] and p['x'] + p['w'] <= 400 and 10 <= p['y'] and p['y'] + p['h'] <= 240  # inside the room
        for q in boxes[i + 1 :]:
            assert not (
                p['x'] < q['x'] + q['w']
                and q['x'] < p['x'] + p['w']
                and p['y'] < q['y'] + q['h']
                and q['y'] < p['y'] + p['h']
            )
    # no leader runs through another label (sampled along the segment)
    for p in a['placed']:
        if not p['leader']:
            continue
        x1, y1, x2, y2 = p['leader']
        for s in range(1, 20):
            x, y = x1 + (x2 - x1) * s / 20, y1 + (y2 - y1) * s / 20
            for q in boxes:
                if q is not p and 'leader' in q:
                    assert not (q['x'] < x < q['x'] + q['w'] and q['y'] < y < q['y'] + q['h'])
    real = out[
        'real'
    ]  # the five top and five bottom sites, as drawn: the anchors nearly on top of each other, none dropped
    assert not real['dropped'] and len(real['placed']) == 10
    for i, p in enumerate(real['placed']):
        for q in real['placed'][i + 1 :]:
            assert not (
                p['x'] < q['x'] + q['w']
                and q['x'] < p['x'] + p['w']
                and p['y'] < q['y'] + q['h']
                and q['y'] < p['y'] + p['h']
            )
    lone = out['lone']['placed'][0]
    assert lone['leader'] is None and abs(lone['x'] - 205) < 8  # beside its point, no leader
    assert out['tight']['dropped'] and len(out['tight']['placed']) < 12  # only what cannot fit is dropped


# ---- a protein dominated by one residue (the dominant hotspot flag) -------------------------------------------------------------


def _hot_rows(rows):
    """rows: (accession, residue, position, k, q, k without hypermutated, q without hypermutated)."""
    return pd.DataFrame(
        [
            {
                'canonical_UniProtAC': a,
                'residue': r,
                'position': p,
                'k': k,
                'q_upper': q,
                'k_no_hypermutated': k2,
                'q_upper_no_hypermutated': q2,
            }
            for a, r, p, k, q, k2, q2 in rows
        ]
    )


def test_hotspot_flag_needs_enough_changes_and_enough_of_them_at_enriched_residues():
    df = _hot_rows(
        [
            # TP53's release values (k, k without hypermutated); q marks the residues enriched (q < 0.05), the rest are made up
            ('TP53', 'R', 273, 252, 0.001, 218, 0.001),
            ('TP53', 'R', 248, 207, 0.001, 185, 0.001),
            ('TP53', 'R', 175, 154, 0.001, 133, 0.001),
            ('TP53', 'R', 282, 85, 0.01, 77, 0.01),
            ('TP53', 'R', 213, 87, 0.5, 61, 0.5),
            ('TP53', 'R', 196, 52, 0.5, 45, 0.5),
            ('TP53', 'R', 1, 303, 0.5, 213, 0.5),
            # one enriched residue with 40 of 100 changes (the top residue 49 is not enriched): flagged, with one position
            ('ONE', 'R', 10, 40, 0.02, 40, 0.02),
            ('ONE', 'R', 11, 49, 0.2, 49, 0.2),
            ('ONE', 'R', 12, 11, np.nan, 11, np.nan),
            # the same, without hypermutated samples the enriched residue holds 10 of 60: 17%, not flagged there
            ('COH', 'R', 1, 40, 0.01, 10, 0.01),
            ('COH', 'R', 2, 50, 0.5, 50, 0.5),
            # below 20 changes: not flagged though every one is at an enriched residue
            ('FEW', 'R', 5, 19, 0.001, 19, 0.001),
            # a big top residue that is not enriched: nothing to explain
            ('TOP', 'R', 1, 60, 0.4, 60, 0.4),
            ('TOP', 'R', 2, 40, 0.06, 40, 0.06),
            # 20 changes, 5 at an enriched residue: 25% < 30%
            ('LOW', 'R', 1, 5, 0.01, 5, 0.01),
            ('LOW', 'R', 2, 15, 0.9, 15, 0.9),
            # another residue type of TP53 has its own count (3 < 20); rows with no change count nothing
            ('TP53', 'K', 1, 3, 0.001, 3, 0.001),
            ('NONE', 'R', 9, 0, 0.001, 0, 0.001),
        ]
    )
    allc = PR.hotspots(df, False)
    assert allc['TP53'] == [['R', 61, [273, 248, 175, 282]]]  # 698 of 1,140; the most changes first
    assert allc['ONE'] == [['R', 40, [10]]]
    assert allc['COH'] == [['R', 44, [1]]]  # 40 of 90
    assert set(allc) == {'TP53', 'ONE', 'COH'}  # not FEW, TOP, LOW, NONE
    nh = PR.hotspots(df, True)
    assert nh['TP53'] == [['R', 66, [273, 248, 175, 282]]]  # 613 of 932 (the release's total is 932)
    assert 'COH' not in nh and nh['ONE'] == [['R', 40, [10]]]
    assert set(PR.hotspots(df, False, min_changes=19, min_share=0.2)) == {'TP53', 'ONE', 'COH', 'FEW', 'LOW'}
    assert PR.hotspots(df.drop(columns='q_upper'), False) == {}


def _flagless(x):
    """A payload without its hotspot entries."""
    if isinstance(x, dict):
        return {k: _flagless(v) for k, v in x.items() if k not in ('h', 'h2', 'hot', 'hotspot')}
    return x


def test_the_flag_is_in_every_payload_and_no_statistic_changes(tmp_path_factory):
    outs = {}
    for name, extra in (('plain', {}), ('low', {'hotspot_min_changes': 4, 'hotspot_min_share': 0.5})):
        root, sp = _toy_propensity(tmp_path_factory.mktemp(name))
        if extra:
            site = yaml.safe_load(sp.read_text())
            site['website']['propensity'].update(extra)
            sp.write_text(yaml.safe_dump(site, sort_keys=False))
        S.run(sp, root=root / 'data', log=lambda *_: None)
        index = web.build(sp, log=lambda *_: None)
        d = index.parent / 'data'
        n = _page_data(index)['propensity']['shards']
        outs[name] = {
            'm': {a: _shard(index, a, n)[a] for a in ('P1', 'P2')},
            'wf': json.loads((d / 'wf.json').read_text()),
            'gn': json.loads((d / 'gn.json').read_text()),
            'page': _page_data(index)['propensity'],
        }
    plain, low = outs['plain'], outs['low']
    # the toy's changes are few: nothing is flagged by default (P1 has 4 TCGA changes, under 20)
    assert not any(k in b for a in plain['m'].values() for b in a.values() for k in ('h', 'h2'))
    assert plain['wf']['hot'] == {
        'tcga': {'all': {}, 'no_hypermutated': {}},
        'depmap': {'all': {}, 'no_hypermutated': {}},
    }
    assert 'hot' not in plain['gn'] and plain['page']['hotspot'] == {'min_changes': 20, 'min_share': 0.3}
    # with the thresholds lowered: P1 has 4 TCGA changes in all samples, 3 at position 2 (q 0.01, enriched); without
    # hypermutated samples none of its residues is enriched (q 0.2, 0.5); gnomAD and DepMap have no enriched residue of P1
    p1 = low['m']['P1']
    assert p1['tcga']['h'] == [['R', 75, [2]]] and 'h2' not in p1['tcga']
    assert 'h' not in p1['gnomad'] and 'h' not in p1['depmap'] and 'clinvar' not in low['wf']['hot']
    assert 'h' not in p1['clinvar']  # descriptive: nothing to explain
    assert low['wf']['hot']['tcga'] == {'all': {'P1': [['R', 75, [2]]]}, 'no_hypermutated': {}}
    assert 'hot' not in low['gn']
    assert low['page']['hotspot'] == {'min_changes': 4, 'min_share': 0.5}
    # no k, expected, O/E, p or q differs
    assert _flagless(plain['m']) == _flagless(low['m'])
    assert _flagless(plain['wf']) == _flagless(low['wf'])
    assert _flagless(plain['gn']) == _flagless(low['gn'])


def test_default_waterfall_labels_skip_flagged_sites_and_keep_the_readers_own():
    rows = [
        {'y': 30, 'hot': {'self': True}},  # an enriched residue of the protein is a real enrichment: labeled
        {'y': 20, 'hot': {'self': False}},  # another residue of that protein: skipped
        {'y': 10},
        {'y': 5},
        {'y': 0},
        {'y': -2},
        {'y': -9, 'hot': {'self': False}},  # skipped
        {'y': -12, 'hot': {'self': False}},  # skipped
        {'y': -30},
    ]
    got = _node(
        f"""const m = {{ rows: {json.dumps(rows)}, n: {len(rows)} }};
        const h3 = {{ res: 'R', pct: 54, pos: [273, 248, 175], self: false }}, h1 = {{ res: 'R', pct: 31, pos: [175], self: false }},
          h5 = {{ res: 'R', pct: 60, pos: [1, 2, 3, 4, 5], self: false }}, list = [['R', 54, [273, 248, 175]]];
        console.log(JSON.stringify({{ all: K.prop.defaultLabels(m, 9, false), phone: K.prop.defaultLabels(m, 9, true),
        zoom: K.prop.defaultLabels(m, 4, false),
        tip: K.prop.hotTip('P04637', h3, 'changes', true),
        tipv: K.prop.hotTip('P04637', h1, 'variants', false),
        tips: K.prop.hotTip('P04637', {{ ...h3, self: true }}, 'changes', true),
        tip1: K.prop.hotTip('P04637', {{ ...h1, self: true }}, 'changes', true),
        note: K.prop.hotNote('P04637', h3, 'tcga'),
        notes: K.prop.hotNote('P04637', {{ ...h3, self: true }}, 'tcga'),
        many: K.prop.hotName('P04637', h5),
        pick: [K.prop.hotPick(list, 'R', 248), K.prop.hotPick(list, 'R', 10), K.prop.hotPick(list, 'K', 3), K.prop.hotPick(null, 'R', 1)] }}));""",
        {
            'propensity': PR_DATA['propensity'],
            'proteins': [['P04637', 'TP53']],
        },
    )
    assert got['all'] == [0, 2, 3, 8, 5]  # skipped 1, 6, 7; the top end then the bottom end
    assert got['phone'] == [0, 2, 3, 8, 5]  # 3 each end: positives 0, 2, 3; negatives 8, 5
    assert got['zoom'] == [0, 2, 3]  # zoomed in: only the top end shows
    assert got['tip'] == (
        "54% of this protein's changes are at TP53 R273, R248, R175. The expected count at its other residues "
        "is inflated, so 'fewer' here mostly reflects that hotspot."
    )
    assert (
        got['tipv']
        == "31% of this protein's variants are at TP53 R175. The expected count at its other residues is inflated."
    )
    assert got['tips'] == (
        "This residue is one of the enriched residues (TP53 R273, R248, R175) with 54% of this protein's changes."
    )
    assert got['tip1'] == "31% of this protein's changes are at this residue."
    assert got['note'] == "54% of this protein's changes are at R273, R248 and R175"
    assert got['notes'] == "this site is one of the enriched residues with 54% of this protein's changes"
    assert got['many'] == 'TP53 R1, R2, R3 and 2 more'
    assert got['pick'][0]['self'] and got['pick'][0]['pos'] == [273, 248, 175] and got['pick'][0]['pct'] == 54
    assert got['pick'][1]['self'] is False and got['pick'][2] is None and got['pick'][3] is None


def test_gene_list_highlights_every_site_and_labels_the_most_extreme_one_per_protein():
    rows = [  # rank order, by signed score y
        {'acc': 'P53', 'y': 40},
        {'acc': 'FUS', 'y': 3},
        {'acc': 'P53', 'y': 2},
        {'acc': 'XXX', 'y': 1},
        {'acc': 'FUS', 'y': 0},
        {'acc': 'P53', 'y': -5},
        {'acc': 'FUS', 'y': -9},
        {'acc': 'P53', 'y': -30},
        {'acc': 'XXX', 'y': -40},
        {'acc': 'EWS', 'y': None},
    ]
    got = _node(
        f"""const rows = {json.dumps(rows)};
        const a = K.prop.geneHits(rows, new Set(['P53', 'FUS', 'EWS']), 10);
        const z = K.prop.geneHits(rows, new Set(['P53', 'FUS']), 5);
        console.log(JSON.stringify({{ a: [a.labels, [...a.marked].sort((x, y) => x - y), a.genes, a.sites, a.up, a.down],
          z: [z.labels, z.sites, z.up, z.down], none: K.prop.geneHits(rows, new Set(), 10).labels,
          words: K.prop.geneWords('tp53, FUS;EWSR1\\nTAF15  TP53 fus'),
          back: K.prop.geneWords(K.prop.geneWords('tp53, FUS;EWSR1\\nTAF15').join(',')),
          cap: K.prop.geneWords(Array.from({{ length: 80 }}, (_, i) => 'G' + i).join(' ')).length }}));""",
        PR_DATA,
    )
    assert got['a'] == [
        [0, 6, 9],
        [0, 1, 2, 4, 5, 6, 7, 9],
        3,
        8,
        3,
        3,
    ]  # FUS: |-9| at rank 6 beats |3|; EWS has only a null
    assert got['z'] == [[0, 1], 7, 3, 3]  # only the ranks drawn carry a label; the counts cover every rank
    assert got['none'] == []
    assert got['words'] == ['tp53', 'FUS', 'EWSR1', 'TAF15']  # one entry per name, in order, any separator
    assert got['cap'] == 60
    assert got['back'] == got['words']  # the address: wg is the words joined by commas, and reads back the same


def test_the_waterfall_file_lists_every_site_with_its_residue_for_the_mutations_page(built):
    root, sp, index, data = built
    wf = json.loads((index.parent / 'data' / 'wf.json').read_text())
    marks = {}
    for line in (root / 'data' / 'marks.tsv').read_text().splitlines()[1:]:
        acc, pos, *_ = line.split('\t')
        marks.setdefault(acc, set()).add(int(pos))
    got = {a: {int(t[1:]) for t in v.split()} for a, v in wf['known'].items()}
    assert got == marks and all(t[0].isalpha() for v in wf['known'].values() for t in v.split())
