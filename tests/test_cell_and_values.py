"""The maps of the cell as one question (website.cell) and a protein-set question drawn with its proteins' numbers
(website.set_views), on a toy site: two maps of compartments and one of regions, each a (set, protein) table; a table of
numbers per protein whose classes are made by rules. The run keeps what the pages read (each set's background in each
abundance stratum; each marked protein's numbers and the others' sorted), the website carries the blocks, and the check
names what the blocks get wrong. Nothing here names a source: the same files in another site's columns give the same."""
from __future__ import annotations

import json
import re

import pandas as pd
import yaml

from ptmcontext import set_tests as T
from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

PROTS = [f'P{i}' for i in range(1, 13)]
SEQ = 'MRGGRAAAAARAAAAAAAAAR'


def _toy(tmp_path):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(''.join(f'>sp|{p}|T{p}_TOY Toy {p} OS=Toy OX=1 GN=G{p} PE=1 SV=1\n{SEQ}\n' for p in PROTS))
    marked = PROTS[:5]                                       # P1-P5 carry a mark
    pd.DataFrame({'acc': marked, 'pos': [2] * 5}).to_csv(data / 'marks.tsv', sep='\t', index=False)
    # two maps of compartments, in their own columns: the first places 10 proteins, the second 8
    pd.DataFrame({'uniprot': PROTS[:10], 'where': ['nucleus'] * 4 + ['cytosol'] * 3 + ['membrane'] * 3}).to_csv(data / 'map_a.tsv', sep='\t', index=False)
    pd.DataFrame({'protein': PROTS[:8], 'cluster': ['nuclear'] * 3 + ['cyto'] * 5}).to_csv(data / 'map_b.tsv', sep='\t', index=False)
    pd.DataFrame({'uniprot': PROTS[:10], 'region': ['inside'] * 4 + ['outside'] * 6}).to_csv(data / 'regions_a.tsv', sep='\t', index=False)
    pd.DataFrame({'acc': PROTS, 'level': [float(i) for i in range(12)]}).to_csv(data / 'abundance.tsv', sep='\t', index=False)
    # numbers per protein: a score, two counts and a flag the classes are made from
    pd.DataFrame({'id': PROTS, 'score': [-2.0, -1.5, -0.2, 0.1, None, -0.5, 0.0, 0.3, -1.0, 0.2, 0.4, -0.1],
                  'hit': [9, 5, 1, 0, 0, 2, 0, 0, 6, 0, 0, 1], 'tried': [10] * 12,
                  'core': ['yes', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'yes', 'no', 'no', 'no']}).to_csv(data / 'numbers.tsv', sep='\t', index=False)

    def entry(f):
        return {'file': f, 'md5': md5_file(data / f), 'source': 'synthetic, for a test', 'version': 'test 1', 'licence': 'CC0 1.0'}
    files = {'fasta': 'toy.fasta', 'marks': 'marks.tsv', 'map_a': 'map_a.tsv', 'map_b': 'map_b.tsv', 'regions_a': 'regions_a.tsv',
             'abundance': 'abundance.tsv', 'numbers': 'numbers.tsv'}
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps({'schema_version': 1, 'inputs': {k: entry(f) for k, f in files.items()}}))
    ab = {'input': 'abundance', 'protein': 'acc', 'value': 'level', 'strata': 2}
    site = {
        'schema_version': 1, 'id': 'toy', 'title': 'A toy site', 'status': 'working', 'mark': 'methylarginine', 'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'fasta', 'release': 'Toy 1'},
        'inputs': {k: k for k in files if k not in ('fasta', 'marks')},
        'marks': {'input': 'marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error'},
        'analyses': [
            {'id': 'map_a', 'test': 'protein_sets', 'sets': {'input': 'map_a', 'set': 'where', 'protein': 'uniprot'}, 'whole_universe': True, 'abundance': ab},
            {'id': 'map_b', 'test': 'protein_sets', 'sets': {'input': 'map_b', 'set': 'cluster', 'protein': 'protein'}, 'whole_universe': True, 'abundance': ab},
            {'id': 'regions_a', 'test': 'protein_sets', 'sets': {'input': 'regions_a', 'set': 'region', 'protein': 'uniprot'}, 'whole_universe': True, 'abundance': ab},
            {'id': 'classes', 'test': 'protein_sets', 'whole_universe': True,
             'sets': {'input': 'numbers', 'protein': 'id', 'rules': [{'set': 'core', 'when': [{'column': 'core', 'equals': 'yes'}]}, {'set': 'rest'}]},
             'values': {'columns': [{'name': 'score', 'label': 'a score', 'background': True}, 'hit', 'tried']}},
            {'id': 'motif', 'layer': 'motif'},
        ],
        'outputs': {'folder': 'out/toy'},
        'website': {
            'name': 'Toy Explorer',
            'overview': {'sections': [{'name': 'Where', 'cards': ['where', 'classes', 'motif']}]},
            'legacy_links': {'old-cell': 'where'},
            'cell': {'id': 'where', 'title': 'Where in the toy cell',
                     'maps': [{'analysis': 'map_a', 'regions': 'regions_a', 'name': 'Map A'}, {'analysis': 'map_b', 'name': 'Map B'}],
                     'regions': [{'label': 'Inside', 'set': 'inside', 'part': 'nucleus'}, {'label': 'Outside', 'set': 'outside'}],
                     'compartments': [{'group': 'Inside', 'rows': [{'label': 'Nucleus', 'part': 'nucleoplasm', 'sets': {'map_a': 'nucleus', 'map_b': 'nuclear'}}]},
                                      {'group': 'Outside', 'rows': [{'label': 'Cytosol', 'part': 'cytosol', 'sets': {'map_a': 'cytosol', 'map_b': 'cyto'}},
                                                                    {'label': 'Membrane', 'part': 'pm', 'sets': {'map_a': 'membrane'}}]}],
                     'drawings': [{'drawing': 'cell'}, {'drawing': 'nucleus'}]},
            'set_views': [{'analysis': 'classes', 'meter': 'core', 'meter_words': 'in the core', 'box': {'value': 'score'},
                           'chips': [{'title': 'Lowest', 'value': 'score'}, {'title': 'Most hit', 'share': ['hit', 'tried'], 'sets': ['rest'], 'order': 'descending'}],
                           'residue': 'motif'}],
        },
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False, allow_unicode=True))
    return root


def test_maps_of_the_cell_and_numbers_reach_the_pages(tmp_path):
    root = _toy(tmp_path)
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    out = root / 'out' / 'toy'
    ps = json.loads((out / 'protein_sets.json').read_text())
    # each set's background proteins in each stratum add up to its size, and the strata to the background
    a = ps['map_a']
    counts = a['covariate']['counts']
    assert counts['codes'] == ['1', '2'] and sum(counts['N']) == a['N'] == 10
    assert {s: sum(v) for s, v in counts['sets'].items()} == {s: v['M'] for s, v in a['sets'].items()} == {'nucleus': 4, 'cytosol': 3, 'membrane': 3}
    assert counts['sets']['nucleus'] == [4, 0]                # P1-P4 have the lowest levels: the first stratum
    # the numbers: each marked protein's (P5 has no score), and the other background proteins' scores, sorted
    v = ps['classes']['values']
    assert [c['name'] if isinstance(c, dict) else c for c in v['columns']] == ['score', 'hit', 'tried']
    assert v['marked']['P1'] == [-2.0, 9.0, 10.0] and v['marked']['P5'] == [None, 0.0, 10.0]
    assert v['others'] == {'score': [-1.0, -0.5, -0.1, 0.0, 0.2, 0.3, 0.4]}
    assert {s: x['M'] for s, x in ps['classes']['sets'].items()} == {'core': 2, 'rest': 10}

    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    page = index.read_text()
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    assert data['cell']['id'] == 'where' and set(data['cell_drawings']) == {'cell', 'nucleus'} and 'nucleoplasm' in data['cell_drawings']['nucleus']
    assert data['set_views'][0]['analysis'] == 'classes' and data['legacy_links']['old-cell'] == 'where'
    assert 'kit-cell.js' in page and 'kit-values.js' in page
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    # the strata only for the maps of the cell; the numbers coded by protein index
    assert 'counts' in sel['protein_sets']['map_a']['covariate'] and 'counts' in sel['protein_sets']['regions_a']['covariate']
    pidx = {r[0]: i for i, r in enumerate(data['proteins'])}
    assert sel['protein_sets']['classes']['values']['marked'][str(pidx['P1'])] == [-2.0, 9.0, 10.0]


def test_the_check_names_what_the_blocks_get_wrong(tmp_path):
    root = _toy(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    cell = site['website']['cell']
    cell['maps'].append({'analysis': 'motif', 'name': 'not a map'})
    cell['compartments'][0]['rows'][0]['sets']['map_c'] = 'x'
    cell['compartments'][0]['rows'][0]['also'] = ['vacuole']
    view = site['website']['set_views'][0]
    view['box'] = {'value': 'hit'}
    view['chips'][0]['value'] = 'nothing'
    view['meter'] = 'middle'
    p = '\n'.join(S.website_problems(site))
    assert "'motif' is not a protein-set question" in p and "'map_c' is not one of website.cell.maps" in p and "['vacuole']" in p
    assert "box: 'hit' is not a column of its values with background: true" in p and "'nothing' is not a column" in p and "no set 'middle'" in p


def test_values_are_not_for_sets_of_other_identifiers():
    spec = {'id': 'x', 'test': 'protein_sets', 'identifiers': {'map': []}, 'sets': {'input': 'r', 'set': 's', 'protein': 'p'}, 'values': {'columns': ['v']}}
    assert any('not for sets of other identifiers' in x for x in T.spec_problems(spec))
