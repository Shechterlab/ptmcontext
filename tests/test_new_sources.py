"""A new data source becomes a new question with no code: a table of regions and a table of per-residue scores, each in
its own column layout, named in a manifest (with a column mapping) and a site file (layer: regions / residue_values,
with: ...). The run tests them, draws them (units.tsv, tracks.json) and records their words (run.json); the website
shows them (site data, selection data) through the same paths as the built-in questions."""
from __future__ import annotations

import json
import re

import pandas as pd
import pytest
import yaml

from ptmcontext import layers as L
from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

#                 1        10        20        30        40
P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
P2 = 'MRAAARAAARAAAAAAAAAAAAAARAAAR'


def _toy_site(tmp_path):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{P1}\n'
                                    f'>sp|P2|TWO_TOY Two protein OS=Toy OX=1 GN=TWO PE=1 SV=1\n{P2}\n')
    pd.DataFrame({'acc': ['P1', 'P1', 'P1', 'P2', 'P2'], 'pos': [2, 5, 32, 2, 25]}).to_csv(data / 'marks.tsv', sep='\t', index=False)
    # a lab's regions, in its own layout: uniprot / from / to / name, with rows of another evidence left out
    pd.DataFrame({'uniprot': ['P1', 'P1', 'P2'], 'from': [1, 30, 20], 'to': [8, 35, 28], 'name': ['N-term', 'mid', 'C-term'],
                  'evidence': ['curated', 'curated', 'predicted']}).to_csv(data / 'condensates.tsv', sep='\t', index=False)
    # a per-residue score, in its own layout: one row per residue
    scores = [('P1', i + 1, 95.0 if i < 10 else 40.0) for i in range(len(P1))] + [('P2', i + 1, 75.0) for i in range(len(P2))]
    pd.DataFrame(scores, columns=['entry', 'resnum', 'score']).to_csv(data / 'scores.tsv', sep='\t', index=False)

    def entry(f, **kw):
        return {'file': f, 'md5': md5_file(data / f), 'source': 'synthetic, for a test', 'version': 'test 1', 'licence': 'CC0 1.0', **kw}
    manifest = {'schema_version': 1, 'inputs': {
        'toy_fasta': entry('toy.fasta', version='Toy 2026_01'),
        'toy_marks': entry('marks.tsv'),
        'toy_condensates': entry('condensates.tsv', record='https://example.org/regions/{acc}',
                                 columns={'accession': 'uniprot', 'start': 'from', 'end': 'to', 'label': 'name',
                                          'include': [{'column': 'evidence', 'equals': 'curated'}]}),
        'toy_scores': entry('scores.tsv', columns={'accession': 'entry', 'position': 'resnum', 'value': 'score'}),
    }}
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    site = {
        'schema_version': 1, 'id': 'toy', 'title': 'A toy site', 'status': 'working', 'mark': 'methylarginine',
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': {'condensates': 'toy_condensates', 'confidence': 'toy_scores'},
        'marks': {'input': 'toy_marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error'},
        'analyses': [
            {'id': 'condensates', 'layer': 'regions', 'with': {'role': 'condensates', 'kind': 'condensate', 'window': 5,
                                                               'noun': 'condensate region'}},
            {'id': 'confidence', 'layer': 'residue_values', 'with': {'role': 'confidence', 'bins': [50, 90],
                                                                     'classes': ['low', 'mid', 'high'], 'noun': 'model confidence',
                                                                     'colours': {'high': '#0053d6'}}},
        ],
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer', 'sites': {'columns': ['condensates']},
                    'protein': {'facts': [{'analysis': 'condensates', 'classes': ['in_condensates']}]}},
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def test_new_tables_become_questions_without_code(tmp_path):
    root = _toy_site(tmp_path)
    run = S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    rows = run.rows
    assert set(rows['analysis']) == {'condensates', 'confidence'}
    # P1's marks at 2, 5 are in its first region; 32 in its second; P2's region is predicted, so left out
    c = rows[(rows['analysis'] == 'condensates') & (rows['method'] == 'fisher')].set_index('category')
    assert c.loc['in_condensates', 'a'] == 3
    assert set(c.index) <= {'in_condensates', 'condensates_boundary', 'outside_condensates', 'no_condensates'}
    v = rows[(rows['analysis'] == 'confidence') & (rows['method'] == 'fisher')].set_index('category')
    assert v.loc['high', 'a'] == 2 and v.loc['low', 'a'] == 1 and v.loc['mid', 'a'] == 2   # P1 2, 5 | 32 | P2 2, 25

    out = root / 'out' / 'toy'
    units = pd.read_csv(out / 'units.tsv', sep='\t', dtype=str, keep_default_na=False)
    assert set(units['kind']) == {'condensate', 'confidence'}
    assert list(units[units['kind'] == 'condensate']['label']) == ['N-term', 'mid']
    runs = units[(units['kind'] == 'confidence') & (units['accession'] == 'P1')]
    assert list(zip(runs['start'], runs['end'], runs['class'])) == [('1', '10', 'high'), ('11', str(len(P1)), 'low')]
    tracks = {t['kind']: t for t in json.loads((out / 'tracks.json').read_text())}
    assert tracks['condensate']['style'] == tracks['confidence']['style'] == 'segments'
    assert tracks['confidence']['analysis'] == 'confidence' and tracks['confidence']['colours'] == {'high': '#0053d6'}
    rec = json.loads((out / 'run.json').read_text())['analyses']
    assert rec['condensates']['layer'] == 'regions' and rec['condensates']['with']['role'] == 'condensates'
    assert rec['confidence']['labels']['high'] == 'model confidence ≥ 90'

    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    page = index.read_text()
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    a = {x['id']: x for x in data['analyses']}
    assert a['condensates']['title'] == 'Condensate regions' and a['condensates']['labels']['in_condensates'] == 'In a condensate region'
    assert a['confidence']['shape'] == 'class' and 'model confidence' in a['confidence']['question']
    assert {t['kind'] for t in data['tracks']} == {'condensate', 'confidence'}
    assert data['inputs']['toy_condensates']['record'] == 'https://example.org/regions/{acc}'
    assert data['sites_view'] == {'columns': ['condensates']}
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    assert sel['analyses'] == ['condensates', 'confidence']
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []


def test_a_layer_made_from_parameters_says_what_it_lacks():
    with pytest.raises(ValueError, match='needs'):
        L.get('regions', None, {}, 'x')
    with pytest.raises(ValueError, match='one more than bins'):
        L.get('residue_values', None, {'role': 'r', 'bins': [1, 2], 'classes': ['a', 'b']}, 'x')
    with pytest.raises(ValueError, match='takes no parameters'):
        L.get('disorder', None, {'role': 'x'}, 'x')


def test_a_file_no_reader_knows_asks_for_a_column_mapping(tmp_path):
    from ptmcontext import units as U
    f = tmp_path / 'odd.tsv'
    pd.DataFrame({'protein': ['P1'], 'a': [1], 'b': [5]}).to_csv(f, sep='\t', index=False)
    with pytest.raises(ValueError, match='column mapping'):
        U.load(f, 'region')
    u = U.load(f, 'region', {'accession': 'protein', 'start': 'a', 'end': 'b'})
    assert list(u.columns[:6]) == U.UNIT_COLUMNS and u.iloc[0]['unit_id'] == 'P1:region:1-5'


def _ctx_with(tmp_path, tables: dict, formats: dict):
    from ptmcontext.profile import load_profile
    from ptmcontext.snapshot import Snapshot
    paths = {}
    for role, frame in tables.items():
        paths[role] = tmp_path / f'{role}.tsv'
        frame.to_csv(paths[role], sep='\t', index=False)
    return L.Context(Snapshot({'P1': P1, 'P2': P2}), load_profile('methylarginine'), paths,
                     formats={str(paths[r]): f for r, f in formats.items()})


def test_two_roles_of_one_kind_keep_a_map_row_each(tmp_path):
    cols = {'accession': 'acc', 'start': 's', 'end': 'e'}
    ctx = _ctx_with(tmp_path, {'lab_a': pd.DataFrame({'acc': ['P1'], 's': [1], 'e': [5]}), 'lab_b': pd.DataFrame({'acc': ['P1'], 's': [20], 'e': [30]})},
                    {'lab_a': cols, 'lab_b': cols})
    layers = {'a': L.get('regions', None, {'role': 'lab_a', 'kind': 'region'}, 'a'), 'b': L.get('regions', None, {'role': 'lab_b', 'kind': 'region'}, 'b')}
    units, tracks = S.drawn_tracks(layers, ctx, {'P1'})
    assert [t['kind'] for t in tracks] == ['region', 'region.lab_b']
    assert sorted(zip(units['kind'], units['start'])) == [('region', 1), ('region.lab_b', 20)]


def test_a_file_s_own_classes_colour_its_row(tmp_path):
    cols = {'accession': 'acc', 'start': 's', 'end': 'e', 'class': 'strength'}
    ctx = _ctx_with(tmp_path, {'hot': pd.DataFrame({'acc': ['P1', 'P1'], 's': [1, 20], 'e': [5, 30], 'strength': ['strong', 'weak']})}, {'hot': cols})
    _, tracks = S.drawn_tracks({'h': L.get('regions', None, {'role': 'hot'}, 'h')}, ctx, {'P1'})
    assert tracks[0]['analysis'] == '' and tracks[0]['classes'] == ['strong', 'weak']


def test_exclude_applies_to_per_residue_tables(tmp_path):
    from ptmcontext import units as U
    f = tmp_path / 'v.tsv'
    pd.DataFrame({'a': ['P1', 'P2'], 'p': [1, 1], 'v': [5.0, 6.0], 'model': ['m1', 'm2']}).to_csv(f, sep='\t', index=False)
    v = U.residue_values(f, {'accession': 'a', 'position': 'p', 'value': 'v', 'exclude': [{'column': 'model', 'equals': 'm1'}]})
    assert list(v['accession']) == ['P2']


def test_a_unit_table_of_several_kinds_is_not_mixed(tmp_path):
    from ptmcontext import units as U
    f = tmp_path / 'u.tsv'
    U.write_units(pd.concat([U.make_units(pd.DataFrame({'accession': ['P1'], 'start': [1], 'end': [5]}), k, 'x') for k in ('flank', 'segment')]), f)
    assert set(U.load(f, 'flank')['kind']) == {'flank'}
    with pytest.raises(ValueError, match='none of them'):
        U.load(f, 'flanks')


def test_an_excluded_row_is_not_pending():
    table = pd.DataFrame({'acc': ['P1', 'P1'], 'pos': ['2', '5'], 'flag': ['pending', 'pending'], 'drop': ['', 'yes']})
    spec = {'accession': 'acc', 'position': 'pos', 'left_out': [{'column': 'flag', 'equals': 'pending'}], 'exclude': [{'column': 'drop', 'equals': 'yes'}]}
    assert list(S.left_out_marks(spec, table)['position']) == [2]


def test_unknown_with_keys_are_named():
    with pytest.raises(ValueError, match="does not know: \\['colour'\\]"):
        L.get('regions', None, {'role': 'r', 'colour': {}}, 'x')


def test_a_variant_adds_marks_from_another_table(tmp_path):
    """A site's variant (variants:) runs the same questions with the rows of another table added to the marks: those its
    conditions keep are marks, those it sets aside are on neither side; it is written beside the site, and its website
    in a folder of the site's, each with a switch to the other."""
    root = _toy_site(tmp_path)
    data = root / 'data'
    # a second table in the marks' own layout: one row counted (P1 R11), one set aside (P1 R22), one dropped (P2 R6)
    pd.DataFrame({'acc': ['P1', 'P1', 'P2'], 'pos': [11, 22, 6], 'counted': ['true', 'false', 'no record']}).to_csv(data / 'extra.tsv', sep='\t', index=False)
    man = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    man['inputs']['toy_extra'] = {'file': 'extra.tsv', 'md5': md5_file(data / 'extra.tsv'), 'source': 'synthetic, for a test',
                                  'version': 'test 1', 'licence': 'CC0 1.0'}
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man, indent=1))
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['variants'] = {'more': {'label': 'With more marks', 'marks_add': [
        {'input': 'toy_extra', 'include': [{'column': 'counted', 'equals': 'true'}], 'left_out': [{'column': 'counted', 'equals': 'false'}]}],
        'attributes': {'tier': {'column': 'counted', 'present': True, 'label': 'Tier', 'kind': 'category',
                                'values': {'no': 'Mark', 'yes': 'Added mark'}, 'filter': True}}}}
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    base = S.run(root / 'sites' / 'toy.yaml', root=data, log=lambda *_: None)
    more = S.run(root / 'sites' / 'toy.yaml', root=data, log=lambda *_: None, variant='more')
    assert more.record['marks']['counted'] == base.record['marks']['counted'] + 1
    assert more.record['marks']['added'] == {'toy_extra': {'marks': 1, 'left_out': 1}} and more.record['variant']['name'] == 'more'

    def tot(run):
        r = run.rows[(run.rows['analysis'] == 'confidence') & (run.rows['method'] == 'fisher')].iloc[0]
        return int(r['a'] + r['b']), int(r['c'] + r['d'])
    (m0, o0), (m1, o1) = tot(base), tot(more)
    assert (m1, o1) == (m0 + 1, o0 - 2)            # R11 moves to the marks; R22 is on neither side
    assert (root / 'out' / 'toy' / 'variants' / 'more' / 'statistics.tsv').exists()

    page = lambda p: json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', p.read_text(), re.S).group(1))  # noqa: E731
    main = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    var = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None, variant='more')
    assert var == root / 'out' / 'toy' / 'web' / 'more' / 'index.html'
    assert page(main)['variants'] == [{'name': 'more', 'label': 'With more marks', 'description': '', 'href': 'more/'}]
    v = page(var)
    assert v['variant']['base'] == '../' and v['variants'] == [] and 'tier' in v['attribute_specs']
    assert 'tier' not in page(main)['attribute_specs']
    with pytest.raises(ValueError, match='no variant'):
        S.run(root / 'sites' / 'toy.yaml', root=data, log=lambda *_: None, variant='other')


def test_a_protein_table_gives_facts_and_starting_points(tmp_path):
    """A table with one row per protein, in its own layout (proteins: input, accession, attributes), gives the website each
    marked protein's facts, numbers as numbers, and the Overview's Starting points rank proteins by them."""
    root = _toy_site(tmp_path)
    data = root / 'data'
    pd.DataFrame({'entry': ['P1', 'P2', 'P9'], 'enrich': ['2.5', '', '9'], 'kind': ['enzyme', 'scaffold', 'other']}).to_csv(data / 'prot.tsv', sep='\t', index=False)
    man = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    man['inputs']['toy_proteins'] = {'file': 'prot.tsv', 'md5': md5_file(data / 'prot.tsv'), 'source': 'synthetic, for a test', 'version': 'test 1', 'licence': 'CC0 1.0'}
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man, indent=1))
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['proteins'] = {'input': 'toy_proteins', 'accession': 'entry', 'attributes': {
        'enrichment': {'column': 'enrich', 'label': 'Enrichment', 'kind': 'number'}, 'kind': {'column': 'kind', 'label': 'Kind', 'kind': 'category'}}}
    site['website']['overview'] = {'starting_points': {'lists': [{'title': 'Most enriched', 'by': 'enrichment', 'n': 3}], 'quick': [{'label': 'all of P1', 'query': 'q=ONE'}]}}
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    S.run(root / 'sites' / 'toy.yaml', root=data, log=lambda *_: None)
    pa = pd.read_csv(root / 'out' / 'toy' / 'protein_attributes.tsv', sep='\t', dtype=str, keep_default_na=False)
    assert list(pa['accession']) == ['P1', 'P2']                      # marked proteins only; P9 has no mark
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    d = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1))
    order = [p[0] for p in d['proteins']]
    vals = dict(zip(order, d['protein_attributes']['values']['enrichment']))
    assert vals == {'P1': 2.5, 'P2': None}                             # the starting points rank by it: on the page
    assert 'kind' not in d['protein_attributes']['values'] and d['late']['protein_attributes'] == ['kind']
    late = json.loads((index.parent / 'data' / 'site.json').read_text())['protein_attributes']   # the rest, read on demand
    assert dict(zip(order, late['kind']))['P2'] == 'scaffold'
    bad = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    bad['website']['overview']['starting_points']['lists'][0]['by'] = 'kind'          # a category, not a number
    bad['website']['filters'] = [{'name': 'Proteins', 'proteins': ['marks', 'enrichment', 'no_such']}]
    (root / 'sites' / 'bad.yaml').write_text(yaml.safe_dump(bad, sort_keys=False))
    problems = S.website_problems(S.load_site(root / 'sites' / 'bad.yaml'))
    assert any('not a number attribute' in p for p in problems)
    assert [p for p in problems if 'protein attribute' in p] == ["website.filters 'Proteins': no protein attribute 'no_such' (proteins.attributes, or marks)"]


def test_a_question_s_class_order_and_groups_come_from_its_layer_or_the_site_file(tmp_path):
    """The chart of a question keeps its classes' own order, under headed groups, when its layer or the site file says
    so: a configured layer's classes are ordered (inside to far, the lowest bin up), and the site file may group them
    or turn the order off. Nothing names a class in code."""
    root = _toy_site(tmp_path)
    path = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(path.read_text())
    conf = next(a for a in site['analyses'] if a['id'] == 'confidence')
    conf['groups'] = [{'name': 'Modelled', 'classes': ['high', 'mid']}, {'name': 'Poorly modelled', 'classes': ['low']}]
    site['analyses'].append({'id': 'condensates_plain', 'layer': 'regions', 'ordered': False,
                             'with': {'role': 'condensates', 'kind': 'condensate', 'code': 'cr', 'noun': 'condensate region'}})
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.website_problems(S.load_site(path)) == []
    S.run(path, root=root / 'data', log=lambda *_: None)
    rec = json.loads((root / 'out' / 'toy' / 'run.json').read_text())['analyses']
    assert rec['condensates']['ordered'] and rec['confidence']['ordered'] and rec['condensates']['groups'] == []
    index = web.build(path, log=lambda *_: None)
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1))
    a = {x['id']: x for x in data['analyses']}
    assert a['condensates']['ordered'] and list(a['condensates']['labels']) == ['in_condensates', 'condensates_boundary', 'outside_condensates', 'no_condensates']
    assert a['confidence']['ordered'] and list(a['confidence']['labels'])[:3] == ['low', 'mid', 'high']
    assert a['confidence']['groups'] == [{'name': 'Modelled', 'classes': ['high', 'mid']}, {'name': 'Poorly modelled', 'classes': ['low']}]
    assert not a['condensates_plain']['ordered'] and a['condensates_plain']['groups'] == []
    # a group naming a class the question does not have is reported by ptmc check
    conf['groups'][0]['classes'].append('very_high')
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    assert any("no class ['very_high']" in p for p in S.website_problems(S.load_site(path)))


def test_marks_left_out_are_shown_and_counted_nowhere(tmp_path):
    """The rows a variant sets aside (marks_add left_out) are written for the website (shown_marks.tsv, and the proteins
    with only these, shown_proteins.tsv): each protein record and the page carry them with the site file's words
    (website.shown_marks), and neither the counts, the selection nor a test does. The site itself shows none."""
    root = _toy_site(tmp_path)
    data = root / 'data'
    P3 = 'MAAARAAAAR'
    with open(data / 'toy.fasta', 'a') as f:
        f.write(f'>sp|P3|THREE_TOY Three protein OS=Toy OX=1 GN=THREE PE=1 SV=1\n{P3}\n')
    # counted: P1 R11; shown: P1 R22 (a marked protein), P3 R5 (a protein with no mark), not P1 R2 (a counted mark)
    pd.DataFrame({'acc': ['P1', 'P1', 'P3', 'P1'], 'pos': [11, 22, 5, 2], 'counted': ['true', 'false', 'false', 'false'],
                  'test': ['pass', 'fail', 'fail', 'fail']}).to_csv(data / 'extra.tsv', sep='\t', index=False)
    man = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    man['inputs']['toy_fasta']['md5'] = md5_file(data / 'toy.fasta')
    man['inputs']['toy_extra'] = {'file': 'extra.tsv', 'md5': md5_file(data / 'extra.tsv'), 'source': 'synthetic, for a test',
                                  'version': 'test 1', 'licence': 'CC0 1.0'}
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man, indent=1))
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['variants'] = {'more': {'label': 'With more marks', 'marks_add': [
        {'input': 'toy_extra', 'include': [{'column': 'counted', 'equals': 'true'}], 'left_out': [{'column': 'counted', 'equals': 'false'}]}],
        'attributes': {'tier': {'column': 'counted', 'present': True, 'label': 'Tier', 'kind': 'category', 'values': {'no': 'Mark', 'yes': 'Added mark'}},
                       'test': {'column': 'test', 'label': 'The test', 'values': {'pass': 'passes', 'fail': 'fails'}}}}}
    site['website']['shown_marks'] = {'label': 'tier two', 'help': 'A mark of the second tier', 'counted': {'when': [{'attribute': 'tier', 'has': ['yes']}], 'help': 'Counted here'},
                                      'shown_help': 'Counted nowhere', 'tests': {'attributes': ['test']}, 'note': '{all} of tier two beside {others}: {counted} counted, {shown} shown'}
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    base = S.run(root / 'sites' / 'toy.yaml', root=data, log=lambda *_: None)
    more = S.run(root / 'sites' / 'toy.yaml', root=data, log=lambda *_: None, variant='more')
    assert more.record['marks']['counted'] == base.record['marks']['counted'] + 1
    out = root / 'out' / 'toy'
    read = lambda p: pd.read_csv(p, sep='\t', dtype=str, keep_default_na=False)  # noqa: E731
    sm = read(out / 'variants' / 'more' / 'shown_marks.tsv')
    assert list(zip(sm['accession'], sm['position'].astype(int))) == [('P1', 22), ('P3', 5)]
    assert list(sm['a.test']) == ['fail', 'fail'] and list(sm['window_15'])[1] == '___MAAARAAAAR__'
    assert list(read(out / 'variants' / 'more' / 'shown_proteins.tsv')['accession']) == ['P3']
    assert 'P3' not in set(read(out / 'variants' / 'more' / 'proteins.tsv')['accession'])
    assert len(read(out / 'shown_marks.tsv')) == 0 and len(read(out / 'shown_proteins.tsv')) == 0

    page = lambda p: json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', p.read_text(), re.S).group(1))  # noqa: E731
    main = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    var = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None, variant='more')
    assert 'shown_marks' not in page(main) and 'shown_view' not in page(main)     # the site itself: as before
    v = page(var)
    names = v['mark_attributes']
    assert v['shown_marks']['n'] == 2 and v['shown_marks']['counted_like'] == 1
    assert v['shown_marks']['proteins'] == [['P3', 'THREE', 'Three protein', len(P3), 'THREE_TOY']]
    assert [r[:3] for r in v['shown_marks']['rows']] == [['P1', 22, sm['window_15'][0]], ['P3', 5, sm['window_15'][1]]]
    assert v['shown_marks']['rows'][0][3][names.index('test')] == 'fail' and v['shown_view']['label'] == 'tier two'
    assert v['counts']['marks'] == more.record['marks']['counted']              # the number of marks is the counted one
    shard = lambda a: json.loads((var.parent / 'data' / 'p' / f'{web.shard_of(a):02d}.json').read_text())[a]  # noqa: E731
    assert [m[0] for m in shard('P1')['shown']] == [22] and 22 not in [m[0] for m in shard('P1')['marks']]
    assert shard('P3')['marks'] == [] and shard('P3')['shown_only'] and [m[0] for m in shard('P3')['shown']] == [5]
    assert 'shown' not in shard('P2')
    sel = json.loads((var.parent / 'data' / 'selection.json').read_text())
    assert len(sel['marks']) == more.record['marks']['counted'] and 'shown' not in json.dumps(sel)
    # the site file's words are checked against the attributes it names
    site['website']['shown_marks']['tests'] = {'attributes': ['nothing']}
    site['website']['shown_marks']['note'] = '{all} and {many}'
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    probs = '\n'.join(S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')))
    assert "shown_marks.tests: no attribute 'nothing'" in probs and "shown_marks.note: no number ['many']" in probs


def test_random_maps_are_configured_in_the_site_file(tmp_path):
    """website.overview.random_maps turns on the Overview's randomly drawn proteins: the module ships with the page, the
    setting reaches the page's data, and a setting out of bounds is refused by the schema."""
    root = _toy_site(tmp_path)
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['website']['overview'] = {'random_maps': {'n': 2, 'title': 'Proteins at random'}}
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    d = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1))
    assert d['overview']['random_maps'] == {'n': 2, 'title': 'Proteins at random'}
    assert 'kit-random.js' in index.read_text() and (index.parent / 'assets' / 'kit-random.js').exists()
    site['website']['overview']['random_maps'] = {'n': 0}
    (root / 'sites' / 'bad.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    with pytest.raises(Exception, match='minimum'):                                    # the schema bounds n
        S.load_site(root / 'sites' / 'bad.yaml')
