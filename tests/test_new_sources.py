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
