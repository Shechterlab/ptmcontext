"""Stickers, condensate roles and the several-factor model: the sticker-context layer (residues by how many sticker
residues lie near), a question restricted to IDRs (only_in), the conditional logistic regression on the candidate
residues (ptmcontext.model), sets made by rules that overlap (a membership with two roles), the IDRs' aromatic
patterning, the map's source links, and a toy site that builds all of it into a website."""

from __future__ import annotations

import io
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml

import ptmstats
from ptmcontext import inputs as I  # noqa: F401  (the manifest reader the toy site uses)
from ptmcontext import layers as L
from ptmcontext import model as MD
from ptmcontext import residue_tests as RT
from ptmcontext import set_tests as ST
from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.layers.charge import sticker_patterning
from ptmcontext.layers.configured import sticker_counts
from ptmcontext.profile import load_profile
from ptmcontext.snapshot import Snapshot, md5_file

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
#          1         11        21
SEQ = 'MRYAARAAAFRAAAAAAWWAARAAAAAAAAAAAAAAAAARY'


# ---- the layer -------------------------------------------------------------------------------------------------------
def test_sticker_counts_leave_the_residue_out_and_stop_at_the_ends():
    # aromatic residues at 3, 10, 18, 19 and 41; arginines at 2, 6, 11, 22 and 40
    res = pd.DataFrame({'accession': ['P'] * 5, 'position': [2, 6, 11, 22, 40]})
    assert list(sticker_counts(res, {'P': SEQ}, set('YFW'), 3)) == [
        1,
        1,
        1,
        1,
        1,
    ]  # Y3; Y3 (F10 is 4 away); F10; W19; Y41
    assert list(sticker_counts(res, {'P': SEQ}, set('YFW'), 1)) == [1, 0, 1, 0, 1]
    # the residue itself is left out: the Y at 41 sees no sticker within 3, the R at 40 sees it
    assert list(
        sticker_counts(pd.DataFrame({'accession': ['P', 'P'], 'position': [41, 19]}), {'P': SEQ}, set('YFW'), 3)
    ) == [0, 1]
    # a window past the ends counts what is there
    assert list(sticker_counts(pd.DataFrame({'accession': ['P'], 'position': [1]}), {'P': SEQ}, set('YFW'), 50)) == [5]
    assert list(sticker_counts(pd.DataFrame({'accession': ['P'], 'position': [41]}), {'P': SEQ}, set('YFW'), 50)) == [4]


def test_the_neighbours_layer_classes_and_the_profiles_stickers():
    snap = Snapshot({'P': SEQ})
    ctx = L.Context(snap, load_profile(MARKS / 'methylarginine.yaml'), {})
    layer = L.get('neighbours', ctx, {'window': 5, 'noun': 'aromatic residue'}, 'sticker_context_5')
    cand = snap.residues(['R'])
    out = layer(cand, ctx)['category']
    n = sticker_counts(cand, snap.sequences, set('YFW'), 5)
    assert list(out) == ['none' if k == 0 else 'one' if k == 1 else 'two_plus' for k in n]
    assert set(out) <= {'none', 'one', 'two_plus'} and len(set(out)) > 1
    assert layer.labels['one'] == 'One aromatic residue within ±5' and layer.labels['two_plus'].startswith(
        '2 or more aromatic residue'
    )
    # the site file's own set wins over the profile's
    only_w = L.get('neighbours', ctx, {'window': 5, 'residues': ['W']}, 'w')(cand, ctx)['category']
    assert list(only_w) != list(out)
    with pytest.raises(ValueError):
        L.get('neighbours', ctx, {}, 'x')  # a window is needed
    bare = load_profile(MARKS / 'methylarginine.yaml')
    bare.data.pop('stickers')
    with pytest.raises(ValueError, match='names no stickers'):
        L.get('neighbours', L.Context(snap, bare, {}), {'window': 3}, 'x')(cand, L.Context(snap, bare, {}))


def test_the_profile_names_its_stickers_and_the_schema_checks_them():
    st = load_profile(MARKS / 'methylarginine.yaml').stickers
    assert (
        st['residues'] == ['Y', 'F', 'W']
        and st['nouns'] == 'aromatic residues'
        and st['heading'] == 'Aromatic patterning'
    )
    assert load_profile(MARKS / 'phospho.yaml').stickers['residues'] == ['Y', 'F', 'W']
    bad = dict(load_profile(MARKS / 'methylarginine.yaml').data, stickers={'residues': ['aromatic']})
    with pytest.raises(Exception):
        from ptmcontext.profile import validate

        validate(bad, 'profile')


def test_sticker_patterning_describes_spacing():
    #            0123456789
    assert sticker_patterning('AAYAAAYAAA', set('YFW')) == (2, 4.0, 3)  # gaps 4; free runs 2, 3, 3
    assert sticker_patterning('AAAA', set('YFW')) == (0, None, 4)
    assert sticker_patterning('AYAAAA', set('YFW')) == (1, None, 4)
    assert sticker_patterning('YFWY', set('YFW')) == (4, 1.0, 0)


# ---- a question restricted to IDRs ----------------------------------------------------------------------------------
def _ctx(tmp_path, seqs, regions):
    snap = Snapshot(seqs)
    mobidb = tmp_path / 'mobidb.tsv'
    pd.DataFrame(regions, columns=['canonical_UniProtAC', 'fragment_start', 'fragment_end']).to_csv(
        mobidb, sep='\t', index=False
    )
    return L.Context(snap, load_profile(MARKS / 'methylarginine.yaml'), {'disorder': mobidb})


def test_only_in_idr_counts_the_residues_inside_idrs(tmp_path):
    #            1         11        21        31   35        55
    seq = 'A' * 5 + 'RYR' + 'A' * 22 + 'RRFR' + 'A' * 20 + 'RW' + 'A' * 10  # R at 6, 8, 31, 32, 34 and 55
    ctx = _ctx(tmp_path, {'P': seq}, [['P', 1, 32]])  # one IDR of 32 residues
    marked = pd.DataFrame({'accession': ['P', 'P', 'P'], 'position': [6, 8, 55]})
    cand = pd.DataFrame({'accession': ['P'] * 6, 'position': [6, 8, 31, 32, 34, 55]})
    assert list(RT.inside_regions(ctx, cand, 'idr')) == [True, True, True, True, False, False]
    layer = L.get('neighbours', ctx, {'window': 3, 'residues': ['Y', 'F', 'W']}, 'n')
    keep = {}
    rows = RT.residue_test(ctx, marked, layer, 'n', only_in='idr', keep=keep)
    f = rows[rows['method'] == 'fisher'].set_index('category')
    # inside the IDR: marked 6 and 8 (Y7 beside both), others 31 and 32 (F33): all four have one aromatic residue near
    assert (int(f.loc['one', 'a']), int(f.loc['one', 'b']), int(f.loc['one', 'c']), int(f.loc['one', 'd'])) == (
        2,
        0,
        2,
        0,
    )
    assert keep['restricted'] is True and set(keep['annotated']['position']) == {
        6,
        8,
        31,
        32,
    }  # the mark at 55 and the R at 34 are outside
    plain = RT.residue_test(ctx, marked, layer, 'n', keep=(k2 := {}))
    assert set(k2['annotated']['position']) == {6, 8, 31, 32, 34, 55} and k2['restricted'] is False
    assert (int(plain[plain['method'] == 'fisher'].set_index('category').loc['one', 'a']), len(plain)) != (2, 0)
    with pytest.raises(ValueError):
        RT.inside_regions(ctx, cand, 'domains')


# ---- the several-factor model ---------------------------------------------------------------------------------------
def _model_world(tmp_path, n_prot=60, seed=5):
    rng = np.random.default_rng(seed)
    seqs, marks, regions = {}, [], []
    for i in range(n_prot):
        s = ''.join(rng.choice(list('RAAAAKDEGYFSTLV'), size=90))
        seqs[f'P{i:03d}'] = s
        regions.append([f'P{i:03d}', 1, 40])
    ctx = _ctx(tmp_path, seqs, regions)
    snap = ctx.snapshot
    cand = snap.residues(['R'])
    n5 = sticker_counts(cand, seqs, set('YFW'), 5)
    inside = (cand['position'] <= 40).to_numpy()
    w = np.exp(0.9 * inside + 0.5 * (n5 > 0))
    cand = cand.assign(w=w)
    for acc, g in cand.groupby('accession'):
        k = min(len(g) - 1, 2)
        if k < 1:
            continue
        p = g['w'] / g['w'].sum()
        for pos in rng.choice(g['position'].to_numpy(), size=k, replace=False, p=p.to_numpy()):
            marks.append((acc, int(pos)))
    return ctx, pd.DataFrame(marks, columns=['accession', 'position'])


def test_the_model_equals_a_direct_fit_and_the_single_factor_rows(tmp_path):
    ctx, marked = _model_world(tmp_path)
    spec = {
        'id': 'which',
        'covariates': [
            {'name': 'in_idr', 'layer': 'idr', 'is': ['idr']},
            {'name': 'aromatic', 'layer': 'neighbours', 'with': {'window': 5}, 'is': ['one', 'two_plus']},
            {'name': 'charge', 'window_sum': {'window': 7, 'weights': {'K': 1, 'R': 1, 'D': -1, 'E': -1}}, 'per': 2},
        ],
    }
    assert MD.covariate_problems(spec) == []
    rows, fit = MD.conditional_model(ctx, marked, spec)
    assert fit['converged'] and fit['dropped'] == [] and fit['strata'] > 30
    # the same fit by hand, on the candidate residues the tests use
    cand, is_m, _ = RT.candidates_and_marks(ctx, marked)
    X = MD.design(ctx, spec, cand)
    assert set(np.unique(X['in_idr'])) <= {0.0, 1.0}
    manual = ptmstats.conditional_logit(is_m.astype(int), X.to_numpy(), cand['accession'].to_numpy(), list(X.columns))
    adj = rows[rows['stratum'] == 'adjusted'].set_index('category')
    assert np.allclose(adj['odds_ratio'].astype(float).to_numpy(), manual['odds_ratio'])
    assert np.allclose(adj['odds_ratio_ci_low'].astype(float).to_numpy(), manual['ci_low'])
    assert (adj['method'] == 'conditional_logit').all() and (adj['n_strata'] == fit['strata']).all()
    # the planted effects come out: in an IDR and next to aromatic residues more often
    assert adj.loc['in_idr', 'odds_ratio'] > 1.5 and adj.loc['aromatic', 'odds_ratio'] > 1.0
    # a factor alone is a model of its own
    alone = rows[rows['stratum'] == 'alone'].set_index('category')
    one = ptmstats.conditional_logit(
        is_m.astype(int), X[['in_idr']].to_numpy(), cand['accession'].to_numpy(), ['in_idr']
    )
    assert np.isclose(alone.loc['in_idr', 'odds_ratio'], one['odds_ratio'][0])
    # counts: a yes-or-no factor has four, a number has marks and others only
    assert int(adj.loc['in_idr', 'a']) + int(adj.loc['in_idr', 'b']) == fit['marks']
    assert pd.isna(adj.loc['charge', 'b']) or adj.loc['charge', 'b'] == ''
    # q is Benjamini-Hochberg over the factors of each model
    assert np.allclose(
        adj['q'].astype(float).to_numpy(), ptmstats.benjamini_hochberg(adj['p'].astype(float).to_numpy())
    )
    # every statistics value is writable in the statistics table
    from ptmcontext import statistics as ST_

    ST_.lines(rows)


def test_a_factor_that_does_not_vary_is_left_out_and_said(tmp_path):
    ctx, marked = _model_world(tmp_path, n_prot=20)
    spec = {
        'id': 'which',
        'covariates': [
            {'name': 'in_idr', 'layer': 'idr', 'is': ['idr']},
            {
                'name': 'never',
                'layer': 'neighbours',
                'with': {'window': 3, 'residues': ['C']},
                'is': ['one', 'two_plus'],
            },
        ],
    }
    rows, fit = MD.conditional_model(ctx, marked, spec)
    assert fit['dropped'] == ['never']
    never = rows[rows['category'] == 'never']
    assert never['odds_ratio'].isna().all() and len(never) == 2


def test_the_model_checks_its_factors():
    bad = {
        'id': 'm',
        'covariates': [
            {'name': 'a', 'layer': 'idr'},
            {'name': 'a', 'layer': 'nope', 'is': ['x']},
            {'name': 'b', 'layer': 'motif', 'is': ['RG']},
            {'name': 'c', 'layer': 'idr', 'is': ['nothing']},
            {'name': 'd', 'window_sum': {'window': 3}},
            {'name': 'e', 'layer': 'idr', 'is': ['idr'], 'window_sum': {'window': 3, 'weights': {'K': 1}}},
        ],
    }
    problems = ' | '.join(MD.covariate_problems(bad))
    for part in (
        "covariate 'a' is listed twice",
        "no layer 'nope'",
        'is: reads a class layer',
        "has no class ['nothing']",
        'window_sum needs window and weights',
        'needs layer: or window_sum:',
    ):
        assert part in problems
    assert MD.covariate_problems({'id': 'm'}) == ['m: a conditional_logit analysis needs covariates']


# ---- sets with overlapping rules (a membership with several roles) --------------------------------------------------
def test_rules_can_overlap_so_a_membership_with_two_roles_is_in_both():
    t = pd.DataFrame({'protein': ['A', 'B', 'C', 'A'], 'roles': ['driver; member', 'member', 'unknown', 'client']})
    rules = [
        {'set': 'driver', 'when': [{'column': 'roles', 'contains': 'driver'}]},
        {'set': 'member', 'when': [{'column': 'roles', 'contains': 'member'}]},
        {'set': 'client', 'when': [{'column': 'roles', 'contains': 'client'}]},
    ]
    first = ST.rule_sets({'protein': 'protein', 'rules': rules}, t)
    assert sorted(map(tuple, first.values)) == [
        ('client', 'A'),
        ('driver', 'A'),
        ('member', 'B'),
    ]  # A's first rule only
    both = ST.rule_sets({'protein': 'protein', 'rules': rules, 'exclusive': False}, t)
    assert sorted(map(tuple, both.values)) == [('client', 'A'), ('driver', 'A'), ('member', 'A'), ('member', 'B')]


# ---- a toy site builds it all into a website -----------------------------------------------------------------------
def _toy_site(tmp_path):
    rng = np.random.default_rng(11)
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    seqs = {f'P{i:02d}': ''.join(rng.choice(list('RAAAAKDEGYFSLV'), size=70)) for i in range(40)}
    (data / 'toy.fasta').write_text(
        ''.join(f'>sp|{a}|{a}_TOY {a} OS=Toy OX=1 GN=G{a} PE=1 SV=1\n{s}\n' for a, s in seqs.items())
    )
    snap = Snapshot(seqs)
    cand = snap.residues(['R'])
    marks = [
        (a, int(g['position'].iloc[0])) for a, g in cand.groupby('accession') if len(g) > 2 and int(a[1:]) % 2 == 0
    ]
    marks += [
        (a, int(g['position'].iloc[1])) for a, g in cand.groupby('accession') if len(g) > 3 and int(a[1:]) % 3 == 0
    ]
    pd.DataFrame(marks, columns=['acc', 'pos']).drop_duplicates().to_csv(data / 'marks.tsv', sep='\t', index=False)

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
        'inputs': {'toy_fasta': entry('toy.fasta', version='Toy 2026_01'), 'toy_marks': entry('marks.tsv')},
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    analyses = [
        {'id': 'motif', 'layer': 'motif'},
        {
            'id': 'sticker_context_5',
            'layer': 'neighbours',
            'with': {'window': 5, 'noun': 'aromatic residue'},
            'new': True,
            'title': 'Next to aromatic residues',
        },
        {
            'id': 'which_factor',
            'test': 'conditional_logit',
            'new': True,
            'title': 'Which factor matters most?',
            'question': 'Which factors?',
            'covariates': [
                {
                    'name': 'aromatic',
                    'label': 'Aromatic within 5',
                    'layer': 'neighbours',
                    'with': {'window': 5},
                    'is': ['one', 'two_plus'],
                },
                {'name': 'rg', 'label': 'RG', 'layer': 'motif', 'flags': ['RG', 'RGG']},
                {
                    'name': 'charge',
                    'label': 'Net charge',
                    'window_sum': {'window': 7, 'weights': {'K': 1, 'D': -1, 'E': -1}},
                },
            ],
        },
    ]
    site = {
        'schema_version': 1,
        'id': 'toy',
        'title': 'A toy site',
        'status': 'working',
        'mark': str(MARKS / 'methylarginine.yaml'),
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'marks': {'input': 'toy_marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error'},
        'analyses': analyses,
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer'},
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def test_a_toy_site_runs_the_sticker_question_and_the_model_and_builds_the_page(tmp_path):
    root = _toy_site(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    assert S.roles_missing(site) == [] and S.website_problems(site) == []
    run = S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    rows = run.rows
    stick = rows[rows['analysis'] == 'sticker_context_5']
    assert set(stick['category']) <= {'none', 'one', 'two_plus'} and set(stick['method']) == {
        'fisher',
        'mantel_haenszel',
    }
    model = rows[rows['analysis'] == 'which_factor']
    assert (
        set(model['method']) == {'conditional_logit'}
        and set(model['stratum']) == {'adjusted', 'alone'}
        and len(model) == 6
    )
    # new questions are marked, not compared with a release; the run records them and the fit
    assert (
        run.record['analyses']['which_factor']['model']['strata'] > 0
        and run.record['analyses']['which_factor']['test'] == 'conditional_logit'
    )
    folder = root / 'out' / 'toy'
    assert 'which_factor' not in pd.read_csv(folder / 'marks.tsv', sep='\t').columns  # no class per mark
    assert (folder / 'statistics.tsv').read_text().count('conditional_logit') == 6

    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    d = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    a = {x['id']: x for x in d['analyses']}
    assert (
        a['which_factor']['kind'] == 'module'
        and a['which_factor']['model']
        and a['which_factor']['labels']['rg'] == 'RG'
        and a['which_factor']['new']
    )
    assert [c['name'] for c in d['models']['which_factor']['covariates']] == ['aromatic', 'rg', 'charge']
    assert d['models']['which_factor']['fit']['strata'] > 0
    tsv = pd.read_csv(
        io.StringIO(d['statistics_tsv']), sep='\t', dtype=str, keep_default_na=False
    )  # the page reads its rows from this table
    assert set(tsv.loc[tsv['analysis'] == 'which_factor', 'stratum']) == {'adjusted', 'alone'}
    assert d['stickers']['residues'] == ['Y', 'F', 'W'] and 'kit-factors.js' in index.read_text()
    assert (
        'which_factor' not in json.loads((index.parent / 'data' / 'selection.json').read_text())['analyses']
    )  # not refitted for a selection


def test_an_only_in_question_gets_its_own_counts_for_a_selection(tmp_path):
    root = _toy_site(tmp_path)
    mob = root / 'data' / 'mobidb.tsv'
    pd.DataFrame(
        [[f'P{i:02d}', 1, 25] for i in range(40)], columns=['canonical_UniProtAC', 'fragment_start', 'fragment_end']
    ).to_csv(mob, sep='\t', index=False)
    mf = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    mf['inputs']['toy_disorder'] = {
        'file': 'mobidb.tsv',
        'md5': md5_file(mob),
        'source': 'synthetic',
        'version': 'test 1',
        'licence': 'CC0 1.0',
        'role': 'input',
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(mf, indent=1))
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['inputs'] = {'disorder': 'toy_disorder'}
    site['analyses'].append(
        {
            'id': 'sticker_in_idrs',
            'layer': 'neighbours',
            'with': {'window': 5, 'noun': 'aromatic residue'},
            'only_in': 'idr',
            'new': True,
        }
    )
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.roles_missing(S.load_site(root / 'sites' / 'toy.yaml')) == []
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    d = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    assert {x['id']: x for x in d['analyses']}['sticker_in_idrs']['only_in'] is True
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    bt = sel['by_test']['sticker_in_idrs']
    marks = pd.read_csv(root / 'out' / 'toy' / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    prots = pd.read_csv(root / 'out' / 'toy' / 'proteins.tsv', sep='\t', dtype=str)['accession'].tolist()
    per = {prots.index(a): g for a, g in marks.groupby('accession')}
    for pi, (others, positions) in {int(p): v for p, v in bt['0'].items()}.items():
        mine = per[pi]
        assert sorted(positions) == sorted(
            int(x) for x in mine.loc[mine['sticker_in_idrs'] == '', 'position']
        )  # the marks outside the IDRs, which no class counts
    assert any(positions for _, positions in bt['0'].values()) and len(bt['0']) < len(
        prots
    )  # and a protein with no residue inside is left out
    # a flags layer cannot say which marks are outside
    site['analyses'].append({'id': 'bad', 'layer': 'motif', 'only_in': 'idr'})
    (root / 'sites' / 'bad.yaml').write_text(yaml.safe_dump({**site, 'id': 'bad'}, sort_keys=False))
    assert any('only_in' in p for p in S.roles_missing(S.load_site(root / 'sites' / 'bad.yaml')))


# ---- the kit: the protein cards' title, the map's hovers and source links ---------------------------------------------
def test_the_protein_cards_name_no_enzyme_family():
    js = (ASSETS / 'kit-pcards.js').read_text()
    assert 'PRMT' not in js  # the site file (or the profile's word for its enzymes) sets the title
    assert 'W.writer' in js


def test_the_map_ends_every_hover_with_a_click_line_and_pins_a_source_link():
    js = (ASSETS / 'kit-map.js').read_text()
    assert 'Click for details and links' in js and 'const sourceLine' in js
    assert js.count('src: {') >= 5  # tracks, domains, segment rows and the site's own rows say which row they belong to
    schema = json.loads(
        (Path(__file__).resolve().parents[1] / 'ptmcontext' / 'schemas' / 'site.schema.json').read_text()
    )
    assert json.dumps(schema).count('"link"') >= 1


def test_the_methylarginine_site_sets_the_cards_title_and_the_rows_links():
    site = yaml.safe_load((Path(__file__).resolve().parents[1] / 'sites' / 'methylarginine.yaml').read_text())
    assert site['website']['protein']['cards']['perturbations']['title'] == 'PRMT inhibitors, knockouts and knockdowns'
    rows = {r['id']: r for r in site['website']['protein']['map']['rows']}
    assert (
        '{gene}' in rows['tcga']['link']
        and '{gene}' in rows['depmap']['link']
        and rows['tcga']['link'].startswith('https://')
    )
    new = {a['id'] for a in site['analyses'] if a.get('new')}
    assert {
        'sticker_context_3',
        'sticker_context_5',
        'sticker_context_3_idr',
        'sticker_context_5_idr',
        'which_factor',
        'condensate_role',
    } <= new
