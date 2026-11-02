"""The protein map's own rows come from tables in the map-row format (CONTRACTS.md, Map rows), mapped in the site file,
with no code: a region list and a per-residue list in a lab's own layout, a per-site count from the marks table, and a
motif found in the sequence. The run writes their items (map_items.tsv); the website splits them by protein shard and
names the rows; a protein without items has none, and a site without rows has no map data at all."""
from __future__ import annotations

import json
import re

import pandas as pd
import pytest
import yaml

from ptmcontext import map_rows as MR
from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

#                 1        10        20        30        40
P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
P2 = 'MRAAARAAARAAAAAAAAAAAAAARAAAR'


def _toy(tmp_path, rows=True):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{P1}\n'
                                    f'>sp|P2|TWO_TOY Two protein OS=Toy OX=1 GN=TWO PE=1 SV=1\n{P2}\n')
    # the marks, with a per-site count in two columns in step: each change of the site and the samples carrying it
    pd.DataFrame({'acc': ['P1', 'P1', 'P1', 'P2', 'P2'], 'pos': [2, 5, 32, 2, 25],
                  'changes': ['R2C; R2H', '', 'R32W', '', ''], 'samples': ['3; 1', '', '1', '', ''],
                  'flags': ['near_a; far', '', 'near_a', '', '']}).to_csv(data / 'marks.tsv', sep='\t', index=False)
    # a lab's evidence along its proteins, in its own layout: regions and single residues, one class column
    pd.DataFrame({'uniprot': ['P1', 'P1', 'P1', 'P1', 'P9'], 'from': [1, 20, 32, 40, 1], 'to': [8, 25, 32, 50, 5],
                  'what': ['fragment', 'fragment', 'crosslink', 'fragment', 'fragment'], 'how': ['MS; XL', 'MS', 'XL', 'MS', 'MS'],
                  'n': [2, 5, 1, 1, 1]}).to_csv(data / 'evidence.tsv', sep='\t', index=False)

    def entry(f, **kw):
        return {'file': f, 'md5': md5_file(data / f), 'source': 'synthetic, for a test', 'version': 'test 1', 'licence': 'CC0 1.0', **kw}
    manifest = {'schema_version': 1, 'inputs': {'toy_fasta': entry('toy.fasta', version='Toy 2026_01'), 'toy_marks': entry('marks.tsv'),
                                                'toy_evidence': entry('evidence.tsv', version='Toy evidence 2026')}}
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    site = {
        'schema_version': 1, 'id': 'toy', 'title': 'A toy site', 'status': 'working', 'mark': 'methylarginine',
        'manifest': 'sites/toy.inputs.json', 'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': {'evidence': 'toy_evidence'},
        'marks': {'input': 'toy_marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error',
                  'attributes': {'flags': {'column': 'flags', 'label': 'Flags', 'kind': 'list'}}},
        'analyses': [{'id': 'motif', 'layer': 'motif'}],
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer'},
    }
    if rows:
        site['website']['protein'] = {'map': {
            'colour_by': [{'id': 'near', 'label': 'Near a', 'classes': [{'label': 'near', 'colour': '#111111', 'when': [{'attribute': 'flags', 'has': ['near_a']}]}],
                           'otherwise': {'label': 'not near', 'colour': '#999999', 'hollow': True}}],
            'sources': {'XL': {'label': 'Crosslinks', 'cite': 'Someone 2026', 'doi': '10.1/x'}},
            'rows': [
                {'id': 'evidence', 'title': 'Evidence in cells',
                 'from': {'role': 'evidence', 'columns': {'accession': 'uniprot', 'start': 'from', 'end': 'to', 'class': 'what', 'value': 'n', 'sources': 'how'},
                          'exclude': [{'column': 'from', 'equals': '40'}]},
                 'classes': {'fragment': {'label': 'Bound fragment', 'mark': 'box', 'opacity': 0.3}, 'crosslink': {'label': 'Crosslinked residue', 'mark': 'tick'}}},
                {'id': 'changes', 'title': 'Changes', 'from': {'marks': True, 'columns': {'label': 'changes', 'value': 'samples'}, 'split': '; '},
                 'labels': 'marks', 'value': {'one': 'in {n} sample', 'many': 'in {n} samples', 'size': True}},
                {'id': 'near', 'title': 'Near flags', 'from': {'marks': True, 'columns': {'class': 'flags', 'label': '{acc} site {pos}'}, 'split': '; ', 'classes': ['near_a']}},
                {'id': 'rg', 'title': 'RG-rich', 'sequence': {'motif': 'RGG?', 'min': 2, 'gap': 40, 'label': 'RG-rich'}},
            ]}}
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False, allow_unicode=True))
    return root


def test_map_rows_from_tables_in_the_contract_format(tmp_path):
    root = _toy(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    assert S.website_problems(site) == [] and S.mapping_problems(site, root / 'data') == []
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    out = root / 'out' / 'toy'
    items = pd.read_csv(out / 'map_items.tsv', sep='\t', dtype=str, keep_default_na=False)
    assert list(items.columns) == MR.ITEM_COLUMNS
    ev = items[items['row'] == 'evidence']
    # P9 is not a protein of the site, 40-50 is excluded and runs past P1's end anyway
    assert list(zip(ev['start'], ev['end'], ev['class'], ev['value'], ev['sources'])) == [
        ('1', '8', 'fragment', '2', 'MS; XL'), ('20', '25', 'fragment', '5', 'MS'), ('32', '32', 'crosslink', '1', 'XL')]
    ch = items[items['row'] == 'changes']
    # a per-site count: each change of a site one item, its count beside it; sites with none give nothing
    assert list(zip(ch['accession'], ch['start'], ch['label'], ch['value'])) == [('P1', '2', 'R2C', '3'), ('P1', '2', 'R2H', '1'), ('P1', '32', 'R32W', '1')]
    near = items[items['row'] == 'near']
    assert list(zip(near['start'], near['class'], near['label'])) == [('2', 'near_a', 'P1 site 2'), ('32', 'near_a', 'P1 site 32')]
    assert set(items['accession']) == {'P1'}                 # P2 has no item: its map has none of these rows
    assert json.loads((out / 'run.json').read_text())['map_rows'] == {'evidence': 3, 'changes': 3, 'near': 2}

    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    page = index.read_text()
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    assert data['map_rows'] == ['evidence', 'changes', 'near'] and data['map_shards'] == 64
    assert [r['id'] for r in data['protein_view']['map']['rows']] == ['evidence', 'changes', 'near', 'rg']
    assert data['inputs']['toy_evidence']['use'] == 'the protein map: Evidence in cells'
    key = f"{web.shard_of('P1'):02d}"
    shard = json.loads((index.parent / 'data' / 'map' / f'{key}.json').read_text())
    assert shard['P1'][0] == [0, 1, 8, 'fragment', '', 2, '', 'MS; XL']
    assert [0, 32, 32, 'crosslink', '', 1, '', 'XL'] in shard['P1'] and [1, 2, 2, '', 'R2C', 3] in shard['P1']
    assert 'P2' not in shard
    one = (index.parent / 'toy.html').read_text()             # the one-file copy carries them inline
    assert '<script id="map-data" type="application/json">' in one


def test_a_site_without_map_rows_has_no_map_data(tmp_path):
    root = _toy(tmp_path, rows=False)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    assert not (root / 'out' / 'toy' / 'map_items.tsv').exists()
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1))
    assert data['map_rows'] == [] and data['map_shards'] == 0 and not (index.parent / 'data' / 'map').exists()


def test_map_rows_say_what_they_lack(tmp_path):
    root = _toy(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    rows = site['website']['protein']['map']['rows']
    rows[0]['from']['role'] = 'nothing'
    rows[1]['from']['columns']['value'] = 'no_such_column'
    site['website']['protein']['map']['colour_by'][0]['classes'][0]['when'][0]['attribute'] = 'missing'
    probs = S.website_problems(site)
    assert any("reads role 'nothing'" in x for x in probs) and any("no attribute 'missing'" in x for x in probs)
    rows[0]['from']['role'] = 'evidence'
    assert any('no_such_column' in x for x in S.mapping_problems(site, root / 'data'))
    # lists of different lengths in step are an error, not a guess
    t = pd.DataFrame({'acc': ['P1'], 'pos': ['2'], 'changes': ['R2C; R2H'], 'samples': ['3; 1; 4']})
    with pytest.raises(ValueError, match='different lengths'):
        MR.read_items({'marks': True, 'columns': {'label': 'changes', 'value': 'samples'}, 'split': '; '}, t, {'id': 'x'}, ('acc', 'pos'))
