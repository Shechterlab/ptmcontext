"""One question seen several ways, from data in the contracts' formats (CONTRACTS.md: Set hierarchy, Published set
results, Set families) and a site file, with no code: a toy site whose sets form an ontology (a hierarchy table), whose
terms are gathered into families (a rules file) and also tested one by one, and whose ontology question is checked
against a published table in a layout of its own. The run keeps what the website draws (each tested set's parents, the
root, each family's own sets); the website receives it, with the views, more sets and member sets the site file names;
a site without them gets none of it."""

from __future__ import annotations

import json
import re

import pandas as pd
import pytest
import yaml
from scipy.stats import hypergeom

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

SEQ = 'MRGGRAAAARAAAAR'
PROTEINS = [f'P{i}' for i in range(1, 9)]
MARKED = ['P1', 'P2', 'P3', 'P5']
# the ontology's sets, each holding the members of the sets under it (as DOSE's Disease Ontology gene sets do)
ONTO = {
    'D0': ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
    'D1': ['P1', 'P2', 'P3', 'P4'],
    'D2': ['P1', 'P2', 'P3'],
    'D3': ['P5', 'P6', 'P7'],
    'D4': ['P1'],
}
NAMES = {
    'D0': 'disease',
    'D1': 'nervous system disease',
    'D2': 'motor neuron disease',
    'D3': 'cancer',
    'D4': 'a rare one',
}
PARENTS = {'D0': '', 'D1': 'D0', 'D2': 'D1; DX', 'D3': 'D0', 'D4': 'D2'}  # DX: a parent no set of the table has
TERMS = {
    'T1': ('Amyotrophic lateral sclerosis', ['P1', 'P2']),
    'T2': ('ALS type 4', ['P2', 'P3']),
    'T3': ('Breast carcinoma', ['P5', 'P6']),
    'T4': ('An odd sign', ['P4', 'P5']),
}
RULES = r"""schema_version: 1
lists:
  - name: main
    families:
      - {family: Neuro, match: ['amyotrophic', '\bals\b']}
      - {family: Cancer, match: [carcinoma]}
  - name: more
    families:
      - {family: Signs, match: ['\bsign']}
"""


def _expected():
    """The ontology question's rows worked out by hand: background P1-P7 (P8 has no set), 4 of them marked."""
    N, n, out = 7, 4, {}
    for s, mem in ONTO.items():
        k, M = len(set(mem) & set(MARKED)), len(mem)
        if k and M >= 2:
            out[s] = {'k': k, 'M': M, 'fold': (k / n) / (M / N), 'p': float(hypergeom.sf(k - 1, N, M, n))}
    order = sorted(out, key=lambda s: out[s]['p'])  # Benjamini-Hochberg, by hand
    q, m = {}, len(order)
    for i in range(m - 1, -1, -1):
        s = order[i]
        q[s] = min(out[s]['p'] * m / (i + 1), q[order[i + 1]] if i + 1 < m else 1.0)
    for s in out:
        out[s]['q'] = q[s]
    return out


def _site(tmp_path, views=True):
    root = tmp_path / 'repo'
    (root / 'sites' / 'data').mkdir(parents=True)
    (root / 'sites' / 'data' / 'families.yaml').write_text(RULES)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(
        ''.join(f'>sp|{p}|{p}_TOY Protein {p} OS=Toy OX=1 GN=G{p} PE=1 SV=1\n{SEQ}\n' for p in PROTEINS)
    )
    pd.DataFrame({'acc': MARKED, 'pos': [2] * len(MARKED)}).to_csv(data / 'marks.tsv', sep='\t', index=False)
    pd.DataFrame([(s, p) for s, mem in ONTO.items() for p in mem], columns=['term', 'protein']).to_csv(
        data / 'onto_members.tsv', sep='\t', index=False
    )
    # the hierarchy, in the contract's format: a set id column and a parents column (here also a name column)
    pd.DataFrame([(s, NAMES[s], PARENTS[s]) for s in ONTO], columns=['id', 'label', 'is_a']).to_csv(
        data / 'onto_terms.tsv', sep='\t', index=False
    )
    pd.DataFrame(
        [(t, name, p) for t, (name, mem) in TERMS.items() for p in mem], columns=['term_id', 'term_name', 'protein']
    ).to_csv(data / 'terms.tsv', sep='\t', index=False)
    # a published table of the ontology question's results, in a layout of its own
    exp = _expected()
    pd.DataFrame(
        [(s, v['k'], v['M'], f'{v["fold"]:.10g}', f'{v["p"]:.10g}', f'{v["q"]:.10g}') for s, v in exp.items()],
        columns=['ID', 'hits', 'size', 'FE', 'pval', 'padj'],
    ).to_csv(data / 'published.tsv', sep='\t', index=False)

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
        'inputs': {
            'toy_fasta': entry('toy.fasta', version='Toy 2026_01'),
            'toy_marks': entry('marks.tsv'),
            'onto_members': entry('onto_members.tsv'),
            'onto_terms': entry('onto_terms.tsv'),
            'terms': entry('terms.tsv'),
            'published': entry('published.tsv', role='reference_output'),
        },
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    fam = lambda lst: {'rules': 'sites/data/families.yaml', 'by': 'term_name', 'lists': [lst]}  # noqa: E731
    sets = lambda **kw: {'test': 'protein_sets', 'universe': 'snapshot', **kw}  # noqa: E731
    site = {
        'schema_version': 1,
        'id': 'toy',
        'title': 'A toy site',
        'status': 'working',
        'mark': 'methylarginine',
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': {'onto_members': 'onto_members', 'onto_terms': 'onto_terms', 'terms': 'terms'},
        'marks': {'input': 'toy_marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error'},
        'analyses': [
            {
                'id': 'onto',
                'title': 'Ontology',
                **sets(
                    sets={'input': 'onto_members', 'set': 'term', 'protein': 'protein'},
                    names={'input': 'onto_terms', 'set': 'id', 'name': 'label'},
                    min_size=2,
                    link='https://example.org/term/{}',
                    **(
                        {'hierarchy': {'input': 'onto_terms', 'set': 'id', 'parents': 'is_a', 'root': 'D0'}}
                        if views
                        else {}
                    ),
                ),
            },
            {
                'id': 'fam',
                'title': 'Families',
                **sets(sets={'input': 'terms', 'set': 'term_id', 'protein': 'protein', 'families': fam('main')}),
            },
            {
                'id': 'fam_more',
                'title': 'More families',
                **sets(sets={'input': 'terms', 'set': 'term_id', 'protein': 'protein', 'families': fam('more')}),
            },
            {
                'id': 'term',
                'title': 'Terms',
                **sets(
                    sets={'input': 'terms', 'set': 'term_id', 'protein': 'protein'},
                    names={'input': 'terms', 'set': 'term_id', 'name': 'term_name'},
                    min_size=2,
                ),
            },
        ],
        'reference': {
            'tables': {
                'onto': {
                    'input': 'published',
                    'columns': {
                        'set': 'ID',
                        'a': 'hits',
                        'M': 'size',
                        'fold_enrichment': 'FE',
                        'p': 'pval',
                        'q': 'padj',
                    },
                }
            }
        },
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer'},
    }
    if views:
        site['website']['overview'] = {
            'sections': [
                {
                    'name': 'Kinds',
                    'cards': [
                        {
                            'analysis': 'fam',
                            'title': 'Disease',
                            'views': [
                                {
                                    'label': 'Families',
                                    'analysis': 'fam',
                                    'more': {'analysis': 'fam_more', 'label': 'Show {n} more'},
                                    'members': {
                                        'analysis': 'term',
                                        'of': [{'analysis': 'fam', 'label': 'main families'}, {'analysis': 'fam_more'}],
                                        'nouns': 'terms',
                                    },
                                },
                                {
                                    'label': 'Ontology',
                                    'analysis': 'onto',
                                    'ontology': {'short': 2, 'compare': 1, 'tree': 2, 'glosses': {'D1': ['nerves']}},
                                },
                            ],
                        },
                        'fam_more',
                    ],
                }
            ]
        }
        site['website']['protein'] = {'sets': [{'title': 'Disease', 'analyses': ['onto', 'term', 'fam', 'fam_more']}]}
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def _page(index):
    return json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )


def test_an_ontology_and_families_seen_several_ways(tmp_path):
    root = _site(tmp_path)
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    run = S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    # the ontology question equals the published table in its own layout, set by set; it is not marked new
    [chk] = [r for r in run.parity if r.analysis == 'onto']
    assert chk.equal and chk.rows == 4 and chk.reference == 'published'
    assert run.record['parity']['checked'][0]['reference'] == 'published' and run.record['parity']['new'] == []
    rows = run.rows[run.rows['analysis'] == 'onto'].set_index('category')
    assert set(rows.index) == {'D0', 'D1', 'D2', 'D3'}  # D4 has one member: under min_size
    assert rows.loc['D2', 'a'] == 3 and rows.loc['D2', 'a'] + rows.loc['D2', 'c'] == 3

    kept = json.loads((root / 'out' / 'toy' / 'protein_sets.json').read_text())
    # parents among the tested sets only (DX is none, D4 is not tested), and the root
    assert (
        kept['onto']['parents'] == {'D0': [], 'D1': ['D0'], 'D2': ['D1'], 'D3': ['D0']} and kept['onto']['root'] == 'D0'
    )
    # each tested family's own sets, by the rules file's lists
    assert kept['fam']['gathers'] == {'Cancer': ['T3'], 'Neuro': ['T1', 'T2']} and kept['fam_more']['gathers'] == {
        'Signs': ['T4']
    }

    data = _page(web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None))
    a = {x['id']: x for x in data['analyses']}
    assert (
        a['onto']['parents']['D2'] == ['D1']
        and a['onto']['root'] == 'D0'
        and a['onto']['link'] == 'https://example.org/term/{}'
    )
    assert a['onto']['checked_against'] == 'published' and not a['onto']['new']
    # the member question's tested sets, by family, for the table of member sets
    assert a['fam']['gathers'] == {'Cancer': ['T3'], 'Neuro': ['T1', 'T2']} and a['fam_more']['gathers'] == {
        'Signs': ['T4']
    }
    assert a['fam']['gathers_all'] == {'Cancer': 1, 'Neuro': 2}
    card = data['overview']['sections'][0]['cards'][0]
    assert [v['analysis'] for v in card['views']] == ['fam', 'onto'] and card['views'][1]['ontology']['glosses'] == {
        'D1': ['nerves']
    }
    assert data['protein_view']['sets'][0]['analyses'] == ['onto', 'term', 'fam', 'fam_more']
    # the page carries the rows once, as the statistics table's text
    assert 'rows' not in data and data['statistics_tsv'].startswith('analysis\tcategory')
    assert data['inputs']['published']['use'] == 'the parity check of Ontology'


def test_a_published_table_that_differs_is_found(tmp_path):
    root = _site(tmp_path)
    pub = root / 'data' / 'published.tsv'
    t = pd.read_csv(pub, sep='\t', dtype=str)
    t.loc[t['ID'] == 'D2', 'hits'] = '2'
    t.to_csv(pub, sep='\t', index=False)
    man = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    man['inputs']['published']['md5'] = md5_file(pub)
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man))
    run = S.run(root / 'sites' / 'toy.yaml', root=root / 'data', write=False, log=lambda *_: None)
    [chk] = [r for r in run.parity if r.analysis == 'onto']
    assert not chk.equal and 'D2' in chk.diffs[0][0]
    # a table listing only some sets checks those
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['reference']['tables']['onto']['rows'] = 'some'
    t[t['ID'] != 'D2'].to_csv(pub, sep='\t', index=False)
    man['inputs']['published']['md5'] = md5_file(pub)
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man))
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    run = S.run(root / 'sites' / 'toy.yaml', root=root / 'data', write=False, log=lambda *_: None)
    [chk] = [r for r in run.parity if r.analysis == 'onto']
    assert chk.equal and chk.rows == 3


def test_without_them_the_site_has_none_of_it(tmp_path):
    root = _site(tmp_path, views=False)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    data = _page(web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None))
    a = {x['id']: x for x in data['analyses']}
    assert 'parents' not in a['onto'] and 'gathers' not in a['fam'] and not (data.get('protein_view') or {}).get('sets')


@pytest.mark.parametrize(
    'card, problem',
    [
        (
            {'analysis': 'fam', 'views': [{'label': 'x', 'analysis': 'onto'}, {'label': 'y', 'analysis': 'fam'}]},
            "the first view is the card's own",
        ),
        (
            {'analysis': 'fam', 'members': {'analysis': 'term', 'of': [{'analysis': 'onto'}]}},
            'does not gather sets into families',
        ),
        ({'analysis': 'term', 'ontology': {}}, 'needs its hierarchy'),
        ({'analysis': 'fam', 'more': {'analysis': 'nothing'}}, 'not a protein-set question'),
    ],
)
def test_check_names_what_a_card_gets_wrong(tmp_path, card, problem):
    root = _site(tmp_path, views=False)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    site['website']['overview'] = {'sections': [{'name': 'Kinds', 'cards': [card]}]}
    assert any(problem in p for p in S.website_problems(site)), S.website_problems(site)
