"""A mark attribute's `presence_only` values (CONTRACTS.md, marks.attributes): a toy site lists a peptide kind whose
sequences and extents may not be published, in a residue table, a site-evidence table and a map row; the website keeps the
flag at each site, with its label, and no start, end or sequence of it reaches any file of the build."""
from __future__ import annotations

import copy
import json

import pandas as pd
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
SECRET = 'QQQWWWKKKPEP'                  # a measured peptide's sequence
CODE = 'toy_peptide'


def _toy(tmp_path):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{P1}\n')
    pd.DataFrame({'acc': ['P1', 'P1'], 'pos': [2, 32], 'ev': [f'{CODE}; xl', 'xl']}).to_csv(data / 'marks.tsv', sep='\t', index=False)
    pd.DataFrame({'uniprot': ['P1', 'P1', 'P1'], 'from': [1, 20, 32], 'to': [8, 27, 32], 'what': [CODE, CODE, 'xl'],
                  'seq': [SECRET, SECRET, '']}).to_csv(data / 'evidence.tsv', sep='\t', index=False)
    pd.DataFrame({'where': ['P1:R2', 'P1:R2', 'P1:R32'], 'what': [CODE, 'xl', 'xl'],
                  'detail': [f'1-8 {SECRET}', 'crosslinked', 'crosslinked']}).to_csv(data / 'site_ev.tsv', sep='\t', index=False)

    def entry(f, **kw):
        return {'file': f, 'md5': md5_file(data / f), 'source': 'synthetic, for a test', 'version': 'test 1', 'licence': 'CC0 1.0', **kw}
    names = {'toy_fasta': 'toy.fasta', 'toy_marks': 'marks.tsv', 'toy_evidence': 'evidence.tsv', 'toy_site_ev': 'site_ev.tsv'}
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps({'schema_version': 1, 'inputs': {k: entry(f, **({'version': 'Toy 2026_01'} if k == 'toy_fasta' else {})) for k, f in names.items()}}, indent=1))
    site = {
        'schema_version': 1, 'id': 'toy', 'title': 'A toy site', 'status': 'working', 'mark': 'methylarginine',
        'manifest': 'sites/toy.inputs.json', 'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': {'evidence': 'toy_evidence'},
        'marks': {'input': 'toy_marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error', 'attributes': {
            'ev': {'column': 'ev', 'label': 'Evidence', 'kind': 'list', 'values': {CODE: 'Toy peptide', 'xl': 'Crosslink'}, 'presence_only': [CODE]}}},
        'analyses': [{'id': 'motif', 'layer': 'motif'}],
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer',
                    'tables': {'res': {'input': 'toy_evidence', 'format': 'residue_evidence', 'columns': {'accession': 'uniprot', 'start': 'from', 'end': 'to', 'kind': 'what'}},
                               'sev': {'input': 'toy_site_ev', 'format': 'site_evidence', 'columns': {'site': 'where', 'kind': 'what', 'detail': 'detail'}}},
                    'protein': {'map': {'rows': [
                        {'id': 'evidence', 'title': 'Evidence in cells',
                         'from': [{'role': 'evidence', 'columns': {'accession': 'uniprot', 'start': 'from', 'end': 'to', 'class': 'what'}},
                                  {'marks': True, 'columns': {'class': 'ev'}, 'split': '; ', 'classes': [CODE]}],
                         'classes': {CODE: {'label': 'In a toy peptide (site only)', 'mark': 'dot'}, 'xl': {'label': 'Crosslink', 'mark': 'tick'}}}]}}},
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False, allow_unicode=True))
    return root, site


def test_extents_of_a_presence_only_source_never_reach_the_build(tmp_path):
    root, site = _toy(tmp_path)
    loaded = S.load_site(root / 'sites' / 'toy.yaml')
    assert S.presence_only(loaded) == {CODE} and S.website_problems(loaded) == []
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    seen = {}
    for f in (index.parent).rglob('*'):
        if f.is_file() and f.suffix in ('.json', '.html', '.tsv'):
            seen[f] = f.read_text(errors='replace')
    assert seen and not [f for f, t in seen.items() if SECRET in t]                    # no sequence
    out = root / 'out' / 'toy'
    items = pd.read_csv(out / 'map_items.tsv', sep='\t', dtype=str, keep_default_na=False)
    flagged = items[items['class'] == CODE]
    assert list(zip(flagged['start'], flagged['end'])) == [('2', '2')]               # the flag at the site, no stretch
    # no stretch of the kind in the map shard or the tables' shards, and the other kinds are kept
    shard = json.loads((index.parent / 'data' / 'map' / f'{web.shard_of("P1"):02d}.json').read_text())['P1']
    assert [i[1:3] for i in shard if i[3] == CODE] == [[2, 2]]
    ev = json.loads((index.parent / 'data' / 'e' / f'{web.shard_of("P1"):02d}.json').read_text())['P1']
    assert all(CODE not in json.dumps(rows) for rows in ev.values())
    assert [r[0] for r in ev['sev']] == [2, 32] and ev['res'] == [[32, 32, 'xl']]


def test_a_presence_only_value_the_attribute_lacks_is_named(tmp_path):
    root, site = _toy(tmp_path)
    bad = copy.deepcopy(site)
    bad['marks']['attributes']['ev']['presence_only'] = ['nope']
    assert any('presence_only' in p and 'nope' in p for p in S.website_problems(bad))
    bad = copy.deepcopy(site)
    bad['website']['protein']['map']['rows'][0]['from'][0]['include'] = [{'column': 'what', 'in': [CODE]}]
    assert any('draws' in p and CODE in p for p in S.website_problems(bad))
