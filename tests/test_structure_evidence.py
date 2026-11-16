"""The 3D viewer's structure evidence (CONTRACTS.md, "Structure evidence"): any site's tables, in their own layouts, named
in website.protein.structure and mapped there to the contract's fields, reach each protein's record (s3d) and the
page's data; a site without them builds the same and gets only the live structures."""

from __future__ import annotations

from pathlib import Path
import json
import re

import pandas as pd
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'

#                 1        10        20        30        40
P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
P2 = 'MRAAARAAARAAAAAAAAAAAAAARAAAR'


def _toy(tmp_path, structure: bool):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(
        f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{P1}\n'
        f'>sp|P2|TWO_TOY Two protein OS=Toy OX=1 GN=TWO PE=1 SV=1\n{P2}\n'
    )
    pd.DataFrame({'acc': ['P1', 'P1', 'P1', 'P2', 'P2'], 'pos': [2, 5, 32, 2, 25]}).to_csv(
        data / 'marks.tsv', sep='\t', index=False
    )
    # a lab's own tables, each in its own layout: contacts as accession + position columns, with a row of another kind
    pd.DataFrame(
        {
            'protein': ['P1', 'P1', 'P2', 'P1'],
            'residue': [5, 32, 25, 2],
            'partner_type': ['RNA', 'protein', 'homodimer', 'RNA'],
            'pdb': ['1abc; 2XYZ', '3def', '4ghi', '1abc'],
            'with': ['', 'TWO', '', ''],
            'with_acc': ['', 'P2', '', ''],
            'evidence': ['structure', 'structure', 'structure', 'model'],
        }
    ).to_csv(data / 'contacts.tsv', sep='\t', index=False)
    # bound nucleic acid in the release's layout (site as ACC:Rpos)
    pd.DataFrame(
        {
            'site': ['P1:R5'],
            'entry': ['1ABC'],
            'na_chain': ['C'],
            'na': ['rna'],
            'what': ['an RNA'],
            'nts': ['G3; U4'],
            'nums': ['3; 4'],
            'dists': ['2.9; 3.8'],
            'win': ['--AG[G][U]C--'],
        }
    ).to_csv(data / 'bound.tsv', sep='\t', index=False)
    # evidence along the chain, as runs
    pd.DataFrame(
        {
            'acc': ['P1', 'P1', 'P1', 'P2'],
            'from': [1, 4, 30, 20],
            'to': [6, 5, 35, 28],
            'type': ['xl', 'xl', 'region', 'secret'],
        }
    ).to_csv(data / 'residues.tsv', sep='\t', index=False)

    # a per-residue score, so the site has a question of its own
    pd.DataFrame(
        [('P1', i + 1, 90.0) for i in range(len(P1))] + [('P2', i + 1, 20.0) for i in range(len(P2))],
        columns=['entry', 'resnum', 'score'],
    ).to_csv(data / 'scores.tsv', sep='\t', index=False)

    def entry(f, **kw):
        return {
            'file': f,
            'md5': md5_file(data / f),
            'source': 'synthetic, for a test',
            'version': 'test 1',
            'licence': 'CC0 1.0',
            **kw,
        }

    inputs = {
        'toy_fasta': entry('toy.fasta', version='Toy 2026_01'),
        'toy_marks': entry('marks.tsv'),
        'toy_scores': entry('scores.tsv', columns={'accession': 'entry', 'position': 'resnum', 'value': 'score'}),
    }
    roles = {'scores': 'toy_scores'}
    if structure:
        inputs |= {
            'toy_contacts': entry('contacts.tsv'),
            'toy_bound': entry('bound.tsv'),
            'toy_residues': entry('residues.tsv'),
        }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps({'schema_version': 1, 'inputs': inputs}, indent=1))
    site = {
        'schema_version': 1,
        'id': 'toy',
        'title': 'A toy site',
        'status': 'working',
        'mark': str(MARKS / 'methylarginine.yaml'),
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': roles,
        'marks': {'input': 'toy_marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error'},
        'analyses': [
            {
                'id': 'score',
                'layer': 'residue_values',
                'with': {'role': 'scores', 'bins': [50], 'classes': ['low', 'high'], 'noun': 'score'},
            }
        ],
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer'},
    }
    if structure:
        site['website']['tables'] = {
            'evidence': {
                'input': 'toy_contacts',
                'format': 'site_evidence',
                'include': [{'column': 'evidence', 'equals': 'structure'}],
                'columns': {
                    'accession': 'protein',
                    'position': 'residue',
                    'kind': 'partner_type',
                    'ids': 'pdb',
                    'partner': 'with',
                    'partner_accession': 'with_acc',
                },
            },
            'bound': {
                'input': 'toy_bound',
                'format': 'bound_windows',
                'columns': {
                    'site': 'site',
                    'entry': 'entry',
                    'chain': 'na_chain',
                    'kind': 'na',
                    'name': 'what',
                    'nucleotides': 'nts',
                    'numbers': 'nums',
                    'distances': 'dists',
                    'window': 'win',
                },
            },
            'runs': {
                'input': 'toy_residues',
                'format': 'residue_evidence',
                'columns': {'accession': 'acc', 'start': 'from', 'end': 'to', 'kind': 'type'},
            },
        }
        site['website']['protein'] = {
            'structure': {
                'contacts': {
                    'table': 'evidence',
                    'kinds': {'RNA': 'rna', 'homodimer': 'self'},
                    'label': 'Contacts in the PDB',
                },
                'bound': {'table': 'bound'},
                'residues': {
                    'table': 'runs',
                    'colourings': [
                        {
                            'id': 'xl',
                            'label': 'Crosslinks',
                            'none': 'None',
                            'classes': [
                                {'id': 'both', 'label': 'Both', 'colour': 'ev', 'all': ['xl', 'region']},
                                {
                                    'id': 'xl',
                                    'label': 'Crosslinked',
                                    'colour': 'rna',
                                    'where': [{'column': 'kind', 'equals': 'xl'}],
                                },
                                {
                                    'id': 'region',
                                    'label': 'In a region',
                                    'colour': '#123456',
                                    'where': [{'column': 'kind', 'equals': 'region'}],
                                },
                            ],
                        }
                    ],
                },
            }
        }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def _page(index):
    page = index.read_text()
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    recs = {}
    for f in (index.parent / 'data' / 'p').glob('*.json'):
        recs.update(json.loads(f.read_text()))
    return data, recs


def test_structure_tables_in_their_own_layouts_reach_the_page(tmp_path):
    root = _toy(tmp_path, structure=True)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    assert S.website_problems(site) == []
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    data, recs = _page(web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None))
    s1, s2 = recs['P1']['s3d'], recs['P2']['s3d']
    # contacts: the structure rows only; entries split and lower-cased; the table's own kinds mapped to the viewer's
    assert sorted(s1['c']) == [[5, 'rna', ['1abc', '2xyz'], '', ''], [32, 'protein', ['3def'], 'TWO', 'P2']]
    assert s2['c'] == [[25, 'self', ['4ghi'], '', '']]
    # bound: the mark from a combined site column, lists split, numbers as numbers
    assert s1['b'] == [[5, '1abc', 'C', 'rna', '', 'an RNA', ['G3', 'U4'], [3, 4], [2.9, 3.8], '--AG[G][U]C--']]
    # residues: each class's runs by its conditions; a class of all: is the page's to draw; rows no class names are left out
    assert sorted(s1['r']['xl']) == [[1, 1, 6], [1, 4, 5], [2, 30, 35]]
    assert 'r' not in s2
    st = data['structure']
    assert {c['code'] for c in st['components']} == {'NMM', 'DA2', '2MR'}  # the profile's states
    assert st['inputs'] == {'contacts': ['toy_contacts'], 'bound': ['toy_bound'], 'residues': ['toy_residues']}
    assert st['contacts'] == {'label': 'Contacts in the PDB'}
    assert [c['id'] for c in st['colourings'][0]['classes']] == ['both', 'xl', 'region'] and 'where' not in st[
        'colourings'
    ][0]['classes'][1]
    assert 'the 3D viewer' in data['inputs']['toy_contacts']['use']


def test_a_site_without_structure_tables_gets_the_live_viewer_only(tmp_path):
    root = _toy(tmp_path, structure=False)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    data, recs = _page(web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None))
    assert all('s3d' not in r for r in recs.values())
    assert set(data['structure']) == {'components', 'inputs'} and data['structure']['inputs'] == {}
    assert 'kit-3d.js' in (root / 'out' / 'toy' / 'web' / 'index.html').read_text()


def test_a_structure_block_that_names_what_the_site_lacks_is_reported(tmp_path):
    root = _toy(tmp_path, structure=True)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    st = site['website']['protein']['structure']
    st['bound']['table'] = 'nowhere'
    st['residues']['colourings'][0]['classes'][0]['all'] = ['xl', 'missing']
    problems = S.website_problems(site)
    assert any("no table 'nowhere'" in p for p in problems)
    assert any("all names ['missing']" in p for p in problems)
