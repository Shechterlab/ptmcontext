"""Context marks: the generic input (read, evidence filter, expansion of the site file), the near_marks question, the
columns a run derives, and a toy site that builds it into a website."""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml

from ptmcontext import context_marks as CM
from ptmcontext import layers as L
from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.profile import load_profile
from ptmcontext.snapshot import Snapshot, md5_file

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'

#          1         11        21
SEQ = 'MRYAARAAAFSAAAAAKAAWWAARAAAAAAAAAAAAAAAAARY'
ENTRY = {
    'id': 'phos',
    'label': 'Phosphosite',
    'input': 'ctx_table',
    'columns': {
        'accession': 'ac',
        'position': 'pos',
        'residue': 'aa',
        'state': 'st',
        'evidence': 'ev',
        'sources': 'src',
    },
    'colour': '#6D3FC0',
    'citation': {'cite': 'A test source'},
}
ROWS = [  # accession, position, residue, state, evidence, sources
    ('P', 11, 'S', 'phospho', 'experimental', 'UniProt; iPTMnet'),
    ('P', 17, 'K', 'me1', 'by-similarity', 'UniProt'),  # dropped by default
    ('P', 17, 'K', 'me2', 'experimental', 'UniProt'),
    ('P', 12, 'S', 'phospho', 'experimental', 'iPTMnet'),  # the snapshot has A there: the letter differs
    ('P', 99, 'S', 'phospho', 'experimental', 'iPTMnet'),  # off the sequence
    ('Q', 3, 'S', 'phospho', 'text-mined', 'iPTMnet'),  # not on the snapshot
]


@pytest.fixture
def table(tmp_path):
    f = tmp_path / 'ctx.tsv'
    pd.DataFrame(ROWS, columns=['ac', 'pos', 'aa', 'st', 'ev', 'src']).to_csv(f, sep='\t', index=False)
    return f


def test_read_filters_evidence_and_checks_residues_against_the_snapshot(table):
    snap = Snapshot({'P': SEQ})
    got = CM.read(ENTRY, table, snap)
    assert list(zip(got['position'], got['state'])) == [(11, 'phospho'), (17, 'me2')]
    assert set(CM.read({**ENTRY, 'drop_evidence': []}, table, snap)['evidence']) == {'experimental', 'by-similarity'}
    assert len(CM.read(ENTRY, table)) == 5  # without a snapshot only the filter applies
    with pytest.raises(ValueError, match='has no column'):
        CM.read({**ENTRY, 'columns': {**ENTRY['columns'], 'state': 'nope'}}, table)


def test_near_leaves_the_residue_out_and_orders_by_distance(table):
    t = CM.read(ENTRY, table, Snapshot({'P': SEQ}))
    res = pd.DataFrame({'accession': ['P', 'P', 'P', 'Q'], 'position': [6, 11, 27, 6]})
    n = CM.near(res, t, 7)
    assert list(n['n']) == [1, 1, 0, 0]  # R6: S11 (K17 is 11 away); S11 sees K17 (6), not itself
    assert n.at[1, 'hits'] == [(17, 6)] and n.at[0, 'hits'] == [(11, 5)]
    assert list(CM.near(res, t, 10)['n']) == [1, 1, 1, 0]  # R6 does not reach K17 (11 away); R27 reaches it (10)
    assert CM.signed(-3) == '−3' and CM.signed(4) == '+4'


def test_the_layer_is_generic_over_the_entry(table):
    snap = Snapshot({'P': SEQ})
    ctx = L.Context(snap, load_profile(MARKS / 'methylarginine.yaml'), {})
    ctx.context = {'phos': CM.read(ENTRY, table, snap)}
    layer = L.get('near_marks', ctx, {'marks': 'phos', 'window': 7, 'noun': 'phosphosite'}, 'near_phos')
    cand = snap.residues(['R'])
    out = layer(cand, ctx)['category']
    assert dict(zip(cand['position'], out)) == {2: 'none', 6: 'near', 24: 'near', 42: 'none'}  # R24: K17 is 7 away
    assert layer.labels['near'] == 'A phosphosite within ±7' and layer.shape == 'class'
    with pytest.raises(ValueError):
        L.get('near_marks', ctx, {'marks': 'phos'}, 'x')  # a window is needed
    with pytest.raises(ValueError, match='does not know'):
        L.get('near_marks', ctx, {'marks': 'phos', 'window': 3, 'residues': ['K']}, 'x')
    with pytest.raises(KeyError, match='no context mark'):
        L.get('near_marks', ctx, {'marks': 'zzz', 'window': 3}, 'x')(cand, ctx)


def _site(extra=None):
    return {
        'context_marks': [ENTRY],
        'website': {
            'context_window': 9,
            'filters': [{'name': 'Other', 'analyses': []}],
            'sites': {'table': [], 'download': []},
            'proteins': {'columns': [], 'download': []},
        },
        **(extra or {}),
    }


def test_expand_writes_what_the_site_file_would(table):
    s = CM.expand(_site())
    assert s['inputs'] == {'context_phos': 'ctx_table'} and CM.window(s) == 9
    row = s['website']['protein']['map']['rows'][0]
    assert row['id'] == 'ctx_phos' and row['mark'] == 'tick' and row['after'] == 'ptm'
    assert row['from']['exclude'] == [{'column': 'ev', 'in': ['by-similarity']}]
    assert row['from']['columns']['label'] == '{st} · {ev} · {src}'
    w = s['website']
    assert [c['id'] for c in w['sites']['table']] == ['ctx_near'] and w['sites']['table'][0]['default'] is False
    assert w['proteins']['columns'][0]['attribute'] == 'ctx_n_phos' and w['proteins']['columns'][0]['default'] is False
    assert w['filters'][-1]['attributes'] == ['ctx_near_phos'] and w['sites']['download'][-1]['name'] == 'phos_within_9'
    marks, prots = CM.specs(s)
    assert marks['ctx_near_phos']['label'] == 'Has a phosphosite within ±9' and prots['ctx_n_phos']['kind'] == 'number'


def test_a_context_mark_can_replace_a_kind_of_the_live_uniprot_row():
    s = CM.expand(_site({'context_marks': [{**ENTRY, 'replaces_ptm_kinds': ['Phospho']}]}))
    assert s['website']['protein']['map']['hide_ptm_kinds'] == ['Phospho']
    assert 'hide_ptm_kinds' not in CM.expand(_site())['website']['protein']['map']
    assert 'HIDE_PTM.has(ptmKind(f))' in (ASSETS / 'kit-map.js').read_text()


def test_problems_are_named():
    bad = _site()
    bad['context_marks'] = [{**ENTRY, 'columns': {'accession': 'ac', 'position': 'pos'}}, {**ENTRY, 'id': 'Bad Id'}]
    out = CM.problems(bad)
    assert any('drop_evidence needs columns.evidence' in p for p in out) and any('lower-case' in p for p in out)
    with pytest.raises(ValueError, match='context_marks'):
        CM.expand(bad)


def test_the_schema_checks_the_entries():
    from ptmcontext.profile import validate

    doc = {'context_marks': [{k: v for k, v in ENTRY.items() if k != 'colour'}]}
    with pytest.raises(Exception):
        validate({**_toy_doc(), **doc}, 'site')
    validate({**_toy_doc(), 'context_marks': [ENTRY]}, 'site')


def _toy_doc():
    return {
        'schema_version': 1,
        'id': 't',
        'title': 'T',
        'mark': str(MARKS / 'methylarginine.yaml'),
        'snapshot': {'input': 'f', 'release': 'x'},
        'marks': {'input': 'm', 'accession': 'a', 'position': 'p'},
        'analyses': [{'id': 'motif', 'layer': 'motif'}],
        'outputs': {'folder': 'o'},
    }


def _toy(tmp_path):
    rng = np.random.default_rng(5)
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
    pd.DataFrame(marks, columns=['acc', 'pos']).to_csv(data / 'marks.tsv', sep='\t', index=False)
    ser = snap.residues(['S', 'K'])  # context marks: on the serines and lysines of some proteins, near some arginines
    ctx = ser[ser['accession'].map(lambda a: int(a[1:]) % 4 != 1)].copy()
    ctx['ev'] = np.where(np.arange(len(ctx)) % 5 == 0, 'by-similarity', 'experimental')
    ctx['src'] = 'UniProt; iPTMnet'
    ctx[['accession', 'position', 'residue', 'ev', 'src']].to_csv(data / 'ctx.tsv', sep='\t', index=False)
    entry = lambda f, **kw: {  # noqa: E731
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
            'toy_ctx': entry('ctx.tsv'),
        },
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    site = {
        'schema_version': 1,
        'id': 'toy',
        'title': 'A toy site',
        'status': 'working',
        'mark': str(MARKS / 'methylarginine.yaml'),
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'marks': {'input': 'toy_marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error'},
        'context_marks': [
            {
                'id': 'ctx',
                'label': 'Serine or lysine',
                'input': 'toy_ctx',
                'columns': {
                    'accession': 'accession',
                    'position': 'position',
                    'residue': 'residue',
                    'evidence': 'ev',
                    'sources': 'src',
                },
                'colour': '#6D3FC0',
                'citation': {'cite': 'A toy source'},
                'sources': {'UniProt': {'cite': 'A', 'doi': '10.1/x'}},
            }
        ],
        'analyses': [
            {'id': 'motif', 'layer': 'motif'},
            {
                'id': 'near_ctx',
                'layer': 'near_marks',
                'with': {'marks': 'ctx', 'window': 6, 'noun': 'toy mark'},
                'new': True,
                'title': 'Near toy marks',
            },
        ],
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer', 'context_window': 6},
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def test_a_toy_site_runs_the_question_derives_the_columns_and_builds_the_page(tmp_path):
    root = _toy(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    assert S.roles_missing(site) == [] and site['inputs'] == {'context_ctx': 'toy_ctx'}
    run = S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    rows = run.rows[run.rows['analysis'] == 'near_ctx']
    assert set(rows['category']) <= {'near', 'none'} and set(rows['method']) == {'fisher', 'mantel_haenszel'}
    assert run.record['analyses']['near_ctx']['layer'] == 'near_marks'
    assert 'toy_ctx' in {v for v in (run.record.get('inputs') or {})} or 'context_ctx' in run.record['inputs']
    folder = root / 'out' / 'toy'
    marks = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    assert {'a.ctx_near', 'a.ctx_near_ctx'} <= set(marks.columns) and set(marks['a.ctx_near_ctx']) <= {'yes', 'no'}
    near = marks[marks['a.ctx_near_ctx'] == 'yes']
    assert len(near) and all(
        re.fullmatch(r'Serine or lysine [SK]\d+ \([+−]\d+\)(; .*)?', v) for v in near['a.ctx_near']
    )
    assert (marks.loc[marks['a.ctx_near_ctx'] == 'no', 'a.ctx_near'] == '').all()
    prot = pd.read_csv(folder / 'protein_attributes.tsv', sep='\t', dtype=str, keep_default_na=False)
    assert prot['p.ctx_n_ctx'].astype(int).sum() > 0
    items = pd.read_csv(folder / 'map_items.tsv', sep='\t', dtype=str, keep_default_na=False)
    got = items[items['row'] == 'ctx_ctx']
    assert len(got) and not got['label'].str.contains('by-similarity').any()
    assert got['sources'].str.contains('UniProt; iPTMnet').all()

    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    d = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    specs = d['attribute_specs']
    assert 'ctx_near' in specs and specs['ctx_near_ctx']['label'] == 'Has a serine or lysine within ±6'
    assert 'ctx_ctx' in json.dumps(d['map_rows']) and d['site']['name'] == 'Toy Explorer'


MARK_IDS = ['methylarginine', 'methyllysine', 'phospho', 'acetyl', 'acyl', 'ubiquitin', 'sumo']


def _seven():
    return _site(
        {
            'context_marks': [
                {
                    **ENTRY,
                    'id': i,
                    'label': i.capitalize(),
                    'short': f'S{k}',
                    'colour': f'#{(k + 1) * 0x2A3B4C % 0xFFFFFF:06X}',
                }
                for k, i in enumerate(MARK_IDS)
            ]
        }
    )


def test_seven_context_marks_each_make_a_row_that_folds_behind_the_combined_row():
    s = CM.expand(_seven())
    rows = s['website']['protein']['map']['rows']
    assert [r['id'] for r in rows] == ['ctx_' + i for i in MARK_IDS]
    assert [r['context_mark'] for r in rows] == MARK_IDS  # the kit folds rows that name a context mark
    assert len({r['colour'] for r in rows}) == 7
    assert [r['short'] for r in rows] == [
        f'S{k}' for k in range(7)
    ]  # each lane's short name in the All modifications block


def test_the_schema_checks_the_combined_row_and_the_hover_settings():
    import jsonschema

    from ptmcontext.profile import schema

    sch = {'$schema': schema('site')['$schema'], '$defs': schema('site')['$defs'], '$ref': '#/$defs/protein_map'}

    def validate(doc, _name):
        jsonschema.validate(doc, sch)

    def site(map_):
        return map_

    validate(
        site(
            {
                'default_off': ['ptm'],
                'combined_marks': {
                    'default': 'folded',
                    'order': ['site', 'phos'],
                    'label': 'All marks',
                    'min_marks': 3,
                },
                'hover': {
                    'site': ['name', 'chips', 'nearby', 'click'],
                    'chips': ['sources', {'attribute': 'pmids', 'count': 'PMIDs'}],
                    'context': ['mark', 'residue', 'detail', 'source', 'click'],
                    'window': 10,
                    'nearby_max': 3,
                },
            }
        ),
        'site',
    )
    validate(site({'combined_marks': False}), 'site')
    validate(site({'combined_marks': {'split': {'attribute': 'kind', 'short': {'acetyl': 'Kac'}}}}), 'site')
    for bad in (
        {'combined_marks': {'default': 'half'}},
        {'combined_marks': {'split': {'short': {'acetyl': 'Kac'}}}},
        {'combined_marks': {'colour': 'red'}},
        {'default_off': 'ptm'},
        {'hover': {'site': ['sequence']}},
        {'hover': {'context': ['colour']}},
        {'hover': {'fields': []}},
    ):
        with pytest.raises(Exception):
            validate(site(bad), 'site')


def test_the_kit_reads_the_combined_row_and_hover_settings_and_keeps_the_pieces_accessible():
    js = (ASSETS / 'kit-map.js').read_text()
    for name in ('CFG.combined_marks', 'CFG.hover', 'context_mark', 'sessionStorage', 'aria-pressed', 'data-map-fold'):
        assert name in js, name
    # the All modifications block: a thin lane for each modification (seven here), its short name on the left, a tick at
    # each position, lanes the protein has no marks for left out, the site's own first
    for name in (
        'All modifications',
        'profile_short',
        'CFG.default_off',
        'lanes.forEach',
        'd.pts.length && !M.combOff',
        'CMB.split',  # the site's own lane split by an attribute: a lane for each value the protein has
    ):
        assert name in js, name
    assert 'SHAPES' not in js and 'All marks' not in js
    prot = (ASSETS / 'kit-proteins.js').read_text()
    assert "HV.site || ['name', 'chips', 'nearby', 'click']" in prot and 'K.map?.nearby' in prot


@pytest.mark.parametrize('name', ['methylarginine', 'methyllysine', 'phospho', 'lysine'])
def test_the_site_files_set_the_combined_row_and_the_hovers(name):
    m = S.load_site(Path(__file__).resolve().parents[1] / 'sites' / f'{name}.yaml')['website']['protein']['map']
    assert m['combined_marks']['default'] == 'folded'
    split = m['combined_marks'].get('split')
    if split:  # a site of several modifications: a lane for each, named by its code (every value has a name)
        values = S.load_site(Path(__file__).resolve().parents[1] / 'sites' / f'{name}.yaml')['marks']['attributes']
        assert set(split['short']) == set(values[split['attribute']]['values'])
    assert m['default_off'] == ['ptm']  # the grey live UniProt row starts off
    assert all(r.get('short') for r in m['rows'] if r['id'].startswith('ctx_'))
    assert m['hover']['site'][0] == 'name' and m['hover']['chips'] and 'context' in m['hover']
    assert all(r.get('context_mark') for r in m['rows'] if r['id'].startswith('ctx_'))


def test_exclude_splits_one_table_into_marks(table):
    snap = Snapshot({'P': SEQ})
    only_me2 = {**ENTRY, 'exclude': [{'column': 'st', 'in': ['phospho']}]}
    assert list(CM.read(only_me2, table, snap)['state']) == ['me2']
    row = CM.expand(_site({'context_marks': [only_me2]}))['website']['protein']['map']['rows'][0]
    assert row['from']['exclude'] == [{'column': 'ev', 'in': ['by-similarity']}, {'column': 'st', 'in': ['phospho']}]
    with pytest.raises(ValueError, match='has no column'):
        CM.read({**ENTRY, 'exclude': [{'column': 'zz', 'in': ['x']}]}, table)
    with pytest.raises(ValueError, match='exclude is a list'):
        CM.expand(_site({'context_marks': [{**ENTRY, 'exclude': [{'column': 'st'}]}]}))


def test_same_residue_question_and_columns(table):
    snap = Snapshot({'P': SEQ})
    entry = {**ENTRY, 'same_residue': True}
    t = CM.read(entry, table, snap)  # P11 phospho, P17 me2
    cand = snap.residues(['K', 'S', 'R'])
    assert list(CM.same(cand, t)) == [p in (11, 17) for p in cand['position']]
    ctx = L.Context(snap, load_profile(MARKS / 'methylarginine.yaml'), {})
    ctx.context = {'phos': t}
    layer = L.get('near_marks', ctx, {'marks': 'phos', 'window': 0, 'noun': 'phosphosite'}, 'same_phos')
    out = dict(zip(cand['position'], layer(cand, ctx)['category']))
    assert out[11] == 'near' and out[17] == 'near' and out[6] == 'none'
    assert layer.labels['near'] == 'Also has a phosphosite' and 'also a phosphosite site' in layer.question
    marks, _ = CM.specs(CM.expand(_site({'context_marks': [entry]})))
    assert marks['ctx_same']['kind'] == 'list' and marks['ctx_same_phos']['filter'] is True
    assert 'ctx_same_phos' not in CM.specs(CM.expand(_site()))[0]
    m = pd.DataFrame({'accession': ['P', 'P'], 'position': [11, 12]})
    a, _ = CM.derive({'context_marks': [entry], 'website': {}}, {'phos': t}, m, {'P'})
    assert list(a['a.ctx_same_phos']) == ['yes', 'no'] and list(a['a.ctx_same']) == ['Phosphosite (phospho)', '']
    assert list(a['a.ctx_near_phos']) == ['yes', 'yes']  # the same residue is not "near": R12 sees S11 and K17


@pytest.mark.parametrize('name', ['methylarginine', 'methyllysine', 'phospho', 'lysine'])
def test_each_mark_file_names_its_lane(name):
    prof = yaml.safe_load((Path(__file__).resolve().parents[1] / 'sites' / 'marks' / f'{name}.yaml').read_text())
    assert prof['short']


def test_only_in_marks_asks_the_same_residue_question_among_the_residues_found_modified():
    """only_in: {marks: [...]}: count only the residues some mark is reported on ('site' for the site's own counted marks,
    every one, or a context mark or part by id): a control for residues a method finds far more often than others."""
    from ptmcontext.residue_tests import residue_test

    snap = Snapshot({'P': 'KAKAKAKAKAKA'})  # lysines at 1, 3, 5, 7, 9, 11
    ctx = L.Context(snap, load_profile(MARKS / 'methyllysine.yaml'), {})
    frame = lambda ps: pd.DataFrame({'accession': ['P'] * len(ps), 'position': ps})  # noqa: E731
    ctx.context = {'ub': frame([3, 5, 7])}
    ctx.own_marks = frame([1, 3, 5])  # the site's counted marks; the question's own (its marks_where) are 1 and 3
    layer = L.get('near_marks', ctx, {'marks': 'ub', 'window': 0, 'noun': 'ubiquitination site'}, 'same_ub')
    cells = lambda r: tuple(int(r[k]) for k in 'abcd')  # noqa: E731
    near = lambda rows: rows.set_index('category').loc['near']  # noqa: E731
    every = residue_test(ctx, frame([1, 3]), layer, 'same_ub', methods=('fisher',))
    assert cells(near(every)) == (1, 1, 2, 2)  # the other lysines: 5, 7 (ub) and 9, 11
    among = residue_test(ctx, frame([1, 3]), layer, 'same_ub', methods=('fisher',), only_in={'marks': ['site', 'ub']})
    assert cells(near(among)) == (1, 1, 2, 0)  # 9 and 11 carry no mark: counted on neither side
    with pytest.raises(ValueError, match="no mark 'nope'"):
        residue_test(ctx, frame([1, 3]), layer, 'x', only_in={'marks': ['nope']})
    with pytest.raises(ValueError, match='unknown keys'):
        residue_test(ctx, frame([1, 3]), layer, 'x', only_in={'marks': ['ub'], 'role': 'r'})


def test_only_in_marks_names_known_marks_and_a_card_s_beside_reads_a_question():
    from ptmcontext.profile import validate

    site = S.load_site(Path(__file__).resolve().parents[1] / 'sites' / 'lysine.yaml')
    ctl = {a['id']: a for a in site['analyses']}['same_ac_ub_modified']
    # among the lysines with a modification other than the two compared (which would otherwise decide who counts)
    assert ctl['only_in'] == {'marks': ['sumoylation', 'other_acylation', 'methyllysine']}
    assert ctl['marks_where'] == {'column': 'acyl_type', 'equals': 'acetyl'}
    assert ctl['background'].startswith('other lysines with another modification')
    bad = {**site, 'analyses': [{**ctl, 'only_in': {'marks': ['site', 'acylation']}}]}
    assert any("only_in reads mark 'acylation'" in p for p in S.roles_missing(bad))
    cards = [c for s in site['website']['overview']['sections'] for c in s['cards'] if isinstance(c, dict)]
    beside = {c['analysis']: c['beside']['analysis'] for c in cards if c.get('beside')}
    assert beside['same_ac_ub'] == 'same_ac_ub_modified' and len(beside) == 6
    with pytest.raises(Exception):
        validate({**site, 'analyses': [{**ctl, 'only_in': {'marks': []}}]}, 'site')
    js = (ASSETS / 'kit.js').read_text()
    assert 'card.beside' in js and 'tbeside' in js
