"""Motif families (a generic question over named patterns around each residue), optional columns (an attribute that
exists only where the marks table has its column), a context mark's subset by score, and a partner class listed in a file:
each on a toy site, none naming a real mark."""

from __future__ import annotations

import json
import re

import pandas as pd
import pytest
import yaml

from ptmcontext import context_marks as CM
from ptmcontext import layers as L
from ptmcontext import optional as OP
from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import Snapshot

from pathlib import Path

from test_context_marks import ENTRY, _toy
from ptmcontext.profile import load_profile

#          1         11        21
MARK = Path(__file__).resolve().parents[1] / 'sites' / 'marks' / 'phospho.yaml'
SEQ = 'MRAAAKSPAAEEAAKRAASTPAAAAAAAAAAAAAAAAAAAAAAA'


def _layer(families, **kw):
    return L.get('motif_families', None, {'families': families, **kw}, 'mf')


def _flags(families, seq=SEQ, residues=('S', 'T'), ctx=None, **kw):
    snap = Snapshot({'P': seq})
    cand = snap.residues(list(residues))
    c = ctx or L.Context(snap, load_profile(MARK), {})
    out = _layer(families, **kw)(cand, c)
    return dict(zip(cand['position'], zip(*[out[k] for k in out.columns]))), list(out.columns)


def test_patterns_are_anchored_at_an_offset_and_the_residue_must_lie_inside_the_match():
    fams = [
        {'name': 'pro', 'pattern': '[ST]P', 'start': 0},
        {'name': 'basic3', 'pattern': 'R..[ST]', 'start': -3},
        {'name': 'acid3', 'pattern': '[ST]..[DE]', 'start': 0},
        {'name': 'either', 'patterns': [{'pattern': 'R[ST]', 'start': -1}, {'pattern': '[ST]..K', 'start': 0}]},
    ]
    got, cols = _flags(fams)
    assert cols == ['pro', 'basic3', 'acid3', 'either']
    # M1 R2 A A A K6 S7 P8 A A E11 E12 A A K15 R16 A A S19 T20 P21: each residue against the four families
    assert got[7] == (True, False, False, False)  # S-P; no R three before; A three after; no R-S/T, no S-x-x-K
    assert got[19] == (False, True, False, False)  # R16 three before; T20 follows, not P
    assert got[20] == (True, False, False, False)  # T-P
    # a second pattern of a family: S-x-x-K (S12? no) -- add K at +3 of a serine
    got2, _ = _flags(
        [{'name': 'e', 'patterns': [{'pattern': 'R[ST]', 'start': -1}, {'pattern': '[ST]..K', 'start': 0}]}],
        seq='RSAAAATAAK',
    )
    assert got2[2] == (True,) and got2[7] == (True,)  # R-S by the first pattern, T-x-x-K by the second


def test_padding_past_the_chain_end_never_matches():
    got, _ = _flags([{'name': 'tail', 'pattern': '[ST]..', 'start': 0}], seq='AAAAST')
    assert got[5] == (False,) and got[6] == (False,)  # the pattern runs off the end of the chain
    got, _ = _flags([{'name': 'head', 'pattern': 'R..[ST]', 'start': -3}], seq='RAASAT')
    assert got[4] == (True,) and got[6] == (False,)


def test_a_context_mark_can_be_required_at_an_offset(tmp_path):
    snap = Snapshot({'P': SEQ})
    ctx = L.Context(snap, load_profile(MARK), {})
    ctx.context = {
        'ra': pd.DataFrame(
            {'accession': ['P'], 'position': [16], 'residue': ['R'], 'state': ['m'], 'evidence': [''], 'sources': ['']}
        )
    }
    fams = [{'name': 'shared', 'pattern': 'R..[ST]', 'start': -3, 'marks': [{'mark': 'ra', 'at': -3}]}]
    got, _ = _flags(fams, ctx=ctx)
    assert got[19] == (True,)  # R16 is a mark of the context table
    ctx.context = {'ra': ctx.context['ra'].assign(position=[15])}
    assert _flags(fams, ctx=ctx)[0][19] == (False,)  # a mark elsewhere
    with pytest.raises(KeyError, match='no context mark'):
        _flags(fams, ctx=L.Context(snap, load_profile(MARK), {}))


def test_bad_families_are_named():
    for bad, msg in [
        ([{'name': 'x', 'pattern': '[', 'start': 0}], 'bad pattern'),
        ([{'name': 'x', 'pattern': 'S', 'start': 1}], 'outside the window'),
        ([{'name': 'x', 'pattern': 'S', 'start': -30}], 'outside the window'),
        ([{'name': 'x'}], 'give a pattern'),
        ([{'name': 'x', 'pattern': 'S'}, {'name': 'x', 'pattern': 'T'}], 'two motif families'),
        ([{'name': 'x', 'pattern': 'S', 'colour': 'red'}], 'unknown keys'),
        ([{'name': 'x', 'pattern': 'S', 'marks': [{'mark': 'a'}]}], 'marks condition'),
    ]:
        with pytest.raises(ValueError, match=msg):
            _layer(bad)
    with pytest.raises(ValueError, match='does not know'):
        _layer([{'name': 'x', 'pattern': 'S'}], window=3)


def test_its_classes_are_the_families_with_their_words():
    lay = _layer([{'name': 'pro', 'label': 'S/T-P', 'help': 'Pro at +1', 'pattern': '[ST]P'}], noun='kinase motif')
    assert lay.shape == 'flags' and lay.labels == {'pro': 'S/T-P'} and lay.help == {'pro': 'Pro at +1'}
    assert lay.title == 'Kinase motif families'


# ---- optional columns, a score subset and a file of members on a toy site ---------------------------------------------


def _site_with(tmp_path, scored: bool, graded: bool):
    root = _toy(tmp_path)
    data = root / 'data'
    path = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(path.read_text())
    ctx = pd.read_csv(data / 'ctx.tsv', sep='\t', dtype=str)
    if scored:
        ctx['sc'] = [f'{(i % 10) / 10:.1f}' for i in range(len(ctx))]
        ctx.to_csv(data / 'ctx.tsv', sep='\t', index=False)
    marks = pd.read_csv(data / 'marks.tsv', sep='\t', dtype=str)
    if graded:
        marks['grade'] = ['high' if i % 2 else 'low' for i in range(len(marks))]
        marks.to_csv(data / 'marks.tsv', sep='\t', index=False)
    # the manifest holds the new bytes
    from ptmcontext.snapshot import md5_file

    mf = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    for k, f in (('toy_ctx', 'ctx.tsv'), ('toy_marks', 'marks.tsv')):
        mf['inputs'][k]['md5'] = md5_file(data / f)
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(mf))
    site['context_marks'][0]['columns']['score'] = 'sc'
    site['context_marks'][0]['subset'] = {'id': 'high', 'at_least': 0.5}
    site['marks']['attributes'] = {
        'grade': {
            'column': 'grade',
            'label': 'Grade',
            'kind': 'category',
            'values': {'high': 'High', 'low': 'Low'},
            'filter': True,
            'optional': True,
        }
    }
    site['analyses'].append(
        {
            'id': 'flags',
            'layer': 'motif_families',
            'new': True,
            'with': {
                'families': [
                    {'name': 'rk', 'label': 'R-x-K', 'pattern': 'R.K', 'start': -2},
                    {
                        'name': 'shared',
                        'label': 'S-x-x-R',
                        'pattern': '[SK]..R',
                        'start': 0,
                        'marks': [{'mark': 'ctx', 'at': 0}],
                    },
                ],
                'noun': 'toy motif',
            },
        }
    )
    web_ = site['website']
    web_['counts'] = {
        'grades': {
            'kind': 'values',
            'attribute': 'grade',
            'title': 'Grades',
            'question': 'Which grades?',
            'sub': 's',
            'unit': ['grade', 'grades'],
            'noun': 'grades',
            'top': 2,
        }
    }
    web_['filters'] = [{'name': 'Grade', 'attributes': ['grade']}, {'name': 'Motifs', 'analyses': ['motif']}]
    web_['overview'] = {
        'sections': [{'name': 'Counts', 'cards': ['grades']}, {'name': 'Motifs', 'cards': [{'analysis': 'flags'}]}]
    }
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    return root, path


def _built(root, path):
    S.run(path, root=root / 'data', log=lambda *_: None)
    index = web.build(path, log=lambda *_: None)
    d = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    return d, pd.read_csv(root / 'out' / 'toy' / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)


def test_with_the_columns_the_attribute_the_subset_and_their_rows_appear(tmp_path):
    root, path = _site_with(tmp_path, scored=True, graded=True)
    assert S.website_problems(S.load_site(path)) == []
    d, marks = _built(root, path)
    assert 'grade' in d['attribute_specs'] and 'a.grade' in marks.columns
    assert 'ctx_near_ctx_high' in d['attribute_specs'] and 'a.ctx_near_ctx_high' in marks.columns
    rows = {r['id']: r for r in d['protein_view']['map']['rows']}
    assert rows['ctx_ctx_high']['default'] == 'off' and rows['ctx_ctx_high']['swap'] == 'ctx_ctx'
    assert rows['ctx_ctx']['default'] == 'on' and rows['ctx_ctx']['swap'] == 'ctx_ctx_high'  # every mark first
    assert list(rows).index('ctx_ctx_high') < list(rows).index('ctx_ctx')
    assert 'grades' in d['count_questions'] and 'flags' in json.dumps(d['overview'])
    assert [g['name'] for g in d['filters']][:1] == ['Grade']
    items = pd.read_csv(root / 'out' / 'toy' / 'map_items.tsv', sep='\t', dtype=str, keep_default_na=False)
    high = items[items['row'] == 'ctx_ctx_high']
    assert len(high) and high['label'].str.contains('sc 0').all()
    assert len(high) < len(items[items['row'] == 'ctx_ctx'])  # a subset of the marks


def test_without_the_columns_everything_built_on_them_is_left_out(tmp_path):
    root, path = _site_with(tmp_path, scored=False, graded=False)
    d, marks = _built(root, path)
    assert 'grade' not in d['attribute_specs'] and 'a.grade' not in marks.columns
    assert 'ctx_near_ctx_high' not in d['attribute_specs'] and 'a.ctx_near_ctx_high' not in marks.columns
    rows = {r['id']: r for r in d['protein_view']['map']['rows']}
    assert 'ctx_ctx_high' not in rows and 'swap' not in rows['ctx_ctx'] and rows['ctx_ctx']['default'] == 'on'
    assert 'grades' not in d['count_questions'] and 'ctx_near_ctx' in d['attribute_specs']
    assert 'Grade' not in [g['name'] for g in d['filters']] and 'grades' not in json.dumps(d['overview'])


def test_prune_forgets_the_attribute_its_filters_counts_and_cards():
    site = {
        'marks': {'attributes': {'a': {'column': 'x', 'optional': True}, 'b': {'column': 'y'}}},
        'website': {
            'filters': [{'name': 'A', 'attributes': ['a']}, {'name': 'B', 'attributes': ['a', 'b']}],
            'counts': {'ca': {'kind': 'values', 'attribute': 'a'}, 'cb': {'kind': 'values', 'attribute': 'b'}},
            'stats': [{'attribute': 'a'}, {'attribute': 'b'}],
            'overview': {'sections': [{'name': 'S', 'cards': ['ca', 'cb', {'analysis': 'ca'}]}]},
        },
    }
    assert OP.prune_marks(site, pd.DataFrame({'y': []})) == ['a']
    w = site['website']
    assert list(site['marks']['attributes']) == ['b'] and w['filters'] == [{'name': 'B', 'attributes': ['b']}]
    assert list(w['counts']) == ['cb'] and w['stats'] == [{'attribute': 'b'}]
    assert w['overview']['sections'][0]['cards'] == ['cb']
    assert (
        OP.prune_marks({'marks': {'attributes': {'a': {'column': 'x', 'optional': True}}}}, pd.DataFrame({'x': []}))
        == []
    )


def test_a_subset_needs_a_score_column_and_a_threshold():
    s = {'context_marks': [{**ENTRY, 'subset': {'id': 'hi', 'at_least': 0.5}}], 'website': {}}
    assert any('needs columns.score' in p for p in CM.problems(s))
    e = {**ENTRY, 'columns': {**ENTRY['columns'], 'score': 'sc'}}
    assert CM.problems({'context_marks': [{**e, 'subset': {'id': 'hi', 'at_least': 0.5}}]}) == []
    assert any('at_least or at_most' in p for p in CM.problems({'context_marks': [{**e, 'subset': {'id': 'hi'}}]}))


def test_a_partner_class_lists_its_members_in_a_file(tmp_path):
    from ptmcontext.web.search import members_file

    (tmp_path / 'sites' / 'data').mkdir(parents=True)
    (tmp_path / 'sites' / 'data' / 'k.tsv').write_text(
        '# a query, a date\n# another line\naccession\tgene\nP1\tg1\nP2\t\n'
    )
    assert members_file(tmp_path, {'genes_file': 'sites/data/k.tsv'}) == {'P1', 'G1', 'P2'}
    assert members_file(tmp_path, {}) == set()


def test_the_subset_is_a_context_table_of_its_own_only_where_scores_exist(tmp_path):
    e = {
        **ENTRY,
        'columns': {**{k: v for k, v in ENTRY['columns'].items() if k != 'residue'}, 'score': 'sc'},
        'subset': {'id': 'hi', 'at_least': 0.5},
    }
    f = tmp_path / 'c.tsv'
    pd.DataFrame(
        [
            ('P', 11, 'S', 'phospho', 'experimental', 'x', '0.9'),
            ('P', 20, 'S', 'phospho', 'experimental', 'x', '0.2'),
            ('P', 22, 'S', 'phospho', 'experimental', 'x', ''),
        ],
        columns=['ac', 'pos', 'aa', 'st', 'ev', 'src', 'sc'],
    ).to_csv(f, sep='\t', index=False)
    site = {'context_marks': [e]}
    got = CM.tables(site, {'ctx_table': f}, Snapshot({'P': 'A' * 30}))
    assert list(got['phos']['position']) == [11, 20, 22] and list(got['phos_hi']['position']) == [11]
    # a table without the column: the entry still reads, with no subset
    g = tmp_path / 'd.tsv'
    pd.read_csv(f, sep='\t').drop(columns='sc').to_csv(g, sep='\t', index=False)
    assert list(CM.tables(site, {'ctx_table': g}, Snapshot({'P': 'A' * 30}))) == ['phos']


def test_a_number_column_is_cut_into_bands():
    table = pd.DataFrame({'a': ['P', 'P', 'P', 'P'], 'p': ['1', '2', '3', '4'], 'v': ['0.1', '0.5', '0.9', '']})
    spec = {
        'accession': 'a',
        'position': 'p',
        'attributes': {'band': {'column': 'v', 'kind': 'category', 'bands': [0.2, 0.5]}},
    }
    marked = pd.DataFrame({'accession': ['P'] * 4, 'position': [1, 2, 3, 4]})
    out = S.mark_attributes(spec, table, marked)
    assert list(out['a.band']) == ['b0', 'b2', 'b2', '']  # 0.5 is from the second threshold


def test_marks_view_is_validated_and_reaches_the_map_config(tmp_path):
    root, path = _site_with(tmp_path, scored=True, graded=True)
    site = yaml.safe_load(path.read_text())
    site['website'].setdefault('protein', {}).setdefault('map', {})['marks_view'] = {
        'attribute': 'grade',
        'at_least': 0.5,
        'label': 'grade ≥ 0.5',
    }
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.website_problems(S.load_site(path)) == []
    d, _ = _built(root, path)
    assert d['protein_view']['map']['marks_view'] == {'attribute': 'grade', 'at_least': 0.5, 'label': 'grade ≥ 0.5'}
    site['website']['protein']['map']['marks_view'] = {'attribute': 'grade'}  # a threshold is required
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    with pytest.raises(Exception):
        S.load_site(path)


def test_a_family_with_among_is_tested_against_its_own_residues_only():
    from ptmcontext.residue_tests import residue_test

    # two proteins: S and T sites with Pro after, and Y sites. Each family is counted only among its residues.
    seqs = {'P': 'SPASAYAYAYAT', 'Q': 'TPAYASAYAYAS'}
    snap = Snapshot(seqs)
    ctx = L.Context(snap, load_profile(MARK), {})
    marked = pd.DataFrame({'accession': ['P', 'P', 'P', 'Q', 'Q', 'Q'], 'position': [1, 6, 8, 1, 4, 8]})
    fams = [
        {'name': 'pro', 'pattern': '[ST]P', 'start': 0, 'among': 'st'},
        {'name': 'tyr', 'pattern': 'Y', 'start': 0, 'among': 'Y'},
        {'name': 'any', 'pattern': '[STY]', 'start': 0},
    ]
    rows = residue_test(ctx, marked, _layer(fams), 'x', methods=('fisher',)).set_index('category')
    # S/T candidates: P has S1 S4 T12, Q has T1 S6 S12; marked S/T: P1, Q1
    assert (rows.loc['pro', ['a', 'b', 'c', 'd']] == [2, 0, 0, 4]).all()
    # Y candidates: P 6 8 10, Q 4 8 10; marked Y: P6, P8, Q4, Q8; the S/T residues are not in this background
    assert (rows.loc['tyr', ['a', 'b', 'c', 'd']] == [4, 0, 2, 0]).all()
    # no among: every candidate residue, as before
    assert rows.loc['any', 'a'] == 6 and rows.loc['any', 'a'] + rows.loc['any', 'b'] == 6
    with pytest.raises(ValueError, match='among'):
        _layer([{'name': 'bad', 'pattern': 'S', 'among': 'S1'}])


def test_strata_of_one_test_get_distinct_labels():
    from ptmcontext import question as Q

    spec = {
        'id': 'q',
        'tests': [{'category': 'any', 'inside': 'r', 'label': 'Any interface'}],
        'strata': [{'stratum': 'all'}, {'stratum': 'ordered', 'suffix': ', ordered regions'}, {'stratum': 'domain'}],
    }
    labels = Q.question_layer(spec).labels
    # the site's suffix, else the stratum's name; the first keeps the test's own label
    assert labels == {
        'any': 'Any interface',
        'any_ordered': 'Any interface, ordered regions',
        'any_domain': 'Any interface (domain)',
    }
    two = {'id': 'q', 'tests': [{'category': c, 'inside': 'r', 'label': 'Same'} for c in ('a', 'b')]}
    with pytest.raises(ValueError, match='same label'):
        Q.question_layer(two)


def test_only_in_residues_and_motif_count_one_class_of_residues():
    from ptmcontext.residue_tests import residue_test

    snap = Snapshot({'P': 'SPASAYAYATP' + 'AAAA', 'Q': 'TPAYASAYAYAS'})
    ctx = L.Context(snap, load_profile(MARK), {})
    marked = pd.DataFrame({'accession': ['P', 'P', 'Q'], 'position': [1, 4, 4]})
    layer = L.get('motif_families', None, {'families': [{'name': 'any', 'pattern': '[STY]'}]}, 'mf')
    both = residue_test(
        ctx, marked, layer, 'x', methods=('fisher',), only_in={'residues': 'ST', 'motif': {'pattern': '[ST]P'}}
    )
    # only S/T followed by P count: P1, P10 (T10 then P11), Q1; marks among them: P1 only (P4 and Q4 do not fit)
    r = both.set_index('category').loc['any']
    assert (r['a'], r['b'], r['c'], r['d']) == (1, 0, 2, 0)
    ty = residue_test(ctx, marked, layer, 'x', methods=('fisher',), only_in={'residues': 'y'})
    assert (ty['a'].iloc[0], ty['c'].iloc[0]) == (1, 4)  # the five tyrosines of the two proteins, one marked (Q4)
    with pytest.raises(ValueError, match='unknown keys'):
        residue_test(ctx, marked, layer, 'x', only_in={'residues': 'S', 'where': 1})


def test_partner_classes_give_each_class_the_proteins_with_a_partner_in_it(tmp_path):
    from ptmcontext.web import search as SE

    f = tmp_path / 'string.tsv'
    f.write_text(
        'protein_a\tprotein_b\tgene_b\tgene_a\tscore\n'
        'P1\tW1\tWRT\tAAA\t900\nP2\tW1\tWRT\tBBB\t900\nP3\tR1\tRDR\tCCC\t900\nP4\tP1\tAAA\tDDD\t900\n'
    )
    site = {
        'website': {
            'tables': {
                't': {
                    'input': 'string',
                    'format': 'protein_partners',
                    'both_ways': {'partner': 'gene_a'},
                    'columns': {
                        'accession': 'protein_a',
                        'partner_accession': 'protein_b',
                        'partner': 'gene_b',
                        'score': 'score',
                    },
                }
            },
            'search': {
                'partners': {
                    'table': 't',
                    'classes': {
                        'writer': {'label': 'a writer', 'role': 'writer', 'genes': ['WRT']},
                        'reader': {'label': 'a reader', 'role': 'reader', 'genes': ['RDR']},
                    },
                }
            },
        }
    }
    pairs, names, annotated = SE.class_set_pairs(site, {'string_partners': f}, None, 'string_partners')
    got = {s: set(g['protein']) for s, g in pairs.groupby('set')}
    # P1 and P2 have the writer as a partner (read both ways, so W1 itself has P1 and P2 as partners but is no writer's partner)
    assert got == {'writer': {'P1', 'P2'}, 'reader': {'P3'}}
    assert names == {'writer': 'a writer', 'reader': 'a reader'}
    assert annotated == {'P1', 'P2', 'P3', 'P4', 'W1', 'R1'}  # every protein the table lists: the background


def test_similar_sets_are_grouped_by_the_jaccard_index_of_their_marked_proteins():
    from ptmcontext.web import similar_sets

    sets = {
        'a1': {'M': 9, 'marked': ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']},
        'a2': {'M': 9, 'marked': ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']},  # 9 of 10: 0.9
        'b': {'M': 3, 'marked': ['p1', 'p2', 'p3']},
        'c': {'M': 2, 'marked': ['q1', 'q2']},
        'c2': {'M': 2, 'marked': ['q1', 'q2']},
        'none': {'M': 4, 'marked': []},
    }
    assert similar_sets(sets, {'jaccard': 0.9}) == [['a1', 'a2'], ['c', 'c2']]
    assert similar_sets(sets, {}) == [['c', 'c2']]  # identical only
    with pytest.raises(ValueError, match='jaccard'):
        similar_sets(sets, {'jaccard': 0})
