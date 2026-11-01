"""Protein-set questions whose sets hold another identifier (genes), and sets gathered into families by name: a small
proteome built by hand, with the answer worked out on paper."""
from pathlib import Path

import pytest
from scipy.stats import hypergeom

from ptmcontext import set_tests as T

RULES = r"""schema_version: 1
case_sensitive: false
overrides:
  - {name: Ataxia Telangiectasia, family: null}
  - {name: Carcinoma of the brain, family: Neuro}
lists:
  - name: first
    families:
      - {family: Neuro, match: ['amyotrophic', '\bals\b']}
      - {family: Cancer, match: [carcinoma]}
  - name: second
    families:
      - {family: Signs, match: [carcinoma, 'weak']}
"""


def write(path: Path, rows: list[list[str]]) -> Path:
    path.write_text('\n'.join('\t'.join(r) for r in rows) + '\n')
    return path


@pytest.fixture()
def tables(tmp_path):
    (tmp_path / 'sites' / 'data').mkdir(parents=True)
    (tmp_path / 'sites' / 'data' / 'families.yaml').write_text(RULES)
    paths = {
        # P1's primary names are a list (its first counts); P4 has none; P2 and P6 share a gene
        'entries': write(tmp_path / 'entries.tsv', [['Entry', 'Gene Names (primary)'], ['P1', 'A; A2'], ['P2', 'B'], ['P3', 'C'],
                                                    ['P4', ''], ['P5', 'D'], ['P6', 'B'], ['P7', 'E']]),
        # symbol A names two genes (1 and 11); A2 is never reached
        'symbols': write(tmp_path / 'symbols.tsv', [['symbol', 'entrez_id'], ['A', '1'], ['A', '11'], ['A2', '99'], ['B', '2'],
                                                    ['C', '3'], ['D', '4'], ['E', '5']]),
        'terms': write(tmp_path / 'terms.tsv', [['term_id', 'term_name', 'entrez_id'],
                                                ['T1', 'Amyotrophic lateral sclerosis', '1'], ['T1', 'Amyotrophic lateral sclerosis', '2'],
                                                ['T2', 'Breast CARCINOMA', '2'], ['T2', 'Breast CARCINOMA', '3'],
                                                ['T3', 'Muscle weakness', '4'],
                                                ['T4', 'Ataxia Telangiectasia', '11'],
                                                ['T5', 'Carcinoma of the brain', '3']]),
        'abundance': write(tmp_path / 'abundance.tsv', [['acc', 'pct'], ['P1', '5'], ['P2', '10'], ['P6', '30'], ['P3', '50']]),
    }
    return tmp_path, paths


def spec(lists=None, **kw):
    fam = {'rules': 'sites/data/families.yaml', 'by': 'term_name', **({'lists': lists} if lists else {})}
    return {'id': 'fam', 'test': 'protein_sets', 'universe': 'snapshot',
            'identifiers': {'noun': 'gene', 'nouns': 'genes', 'map': [
                {'input': 'entries', 'from': 'Entry', 'to': 'Gene Names (primary)', 'separator': ';', 'take': 'first'},
                {'input': 'symbols', 'from': 'symbol', 'to': 'entrez_id'}]},
            'sets': {'input': 'terms', 'set': 'term_id', 'protein': 'entrez_id', 'families': fam}, **kw}


def test_identifiers_through_tables_in_turn(tables):
    _, paths = tables
    got = T.identifiers_of(spec()['identifiers'], paths, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'])
    assert got == {'P1': {'1', '11'}, 'P2': {'2'}, 'P3': {'3'}, 'P4': set(), 'P5': {'4'}, 'P6': {'2'}, 'P7': {'5'}, 'P8': set()}


def test_families_by_name_override_then_first_rule_list_by_list(tables):
    root, _ = tables
    rules = T.load_families(root / 'sites' / 'data' / 'families.yaml')
    names = {'T1': 'Amyotrophic lateral sclerosis', 'T2': 'Breast CARCINOMA', 'T3': 'Muscle weakness',
             'T4': 'Ataxia Telangiectasia', 'T5': 'Carcinoma of the brain', 'T6': 'Signs of ALS', 'T7': 'nothing'}
    # T2 matches Cancer and Signs: the first list wins; T5 is placed by its override, T4 by its override in none
    assert T.place(names, rules) == {'T1': ('Neuro', 'first'), 'T2': ('Cancer', 'first'), 'T3': ('Signs', 'second'),
                                     'T5': ('Neuro', 'first'), 'T6': ('Neuro', 'first')}


def test_gene_sets_count_genes_against_the_genes_with_a_term(tables):
    root, paths = tables
    keep = {}
    rows, names = T.protein_set_test(spec(['first']), paths, {'P1', 'P3'}, {f'P{i}' for i in range(1, 8)}, keep=keep, root=root)
    # universe: the genes of the proteome {1, 11, 2, 3, 4, 5}; background: those with any term {1, 2, 3, 4, 11}, whether
    # or not the term is in a family tested here (T3) or in any family (T4); targets: P1's and P3's genes {1, 11, 3}
    N, n = 5, 3
    want = {'Neuro': (2, 3), 'Cancer': (1, 2)}          # (k, M): Neuro = T1 + T5 = {1, 2, 3}; Cancer = T2 = {2, 3}
    got = {r['category']: (r['a'], r['b'], r['c'], r['d'], r['p']) for r in rows.to_dict('records')}
    assert set(got) == set(want)
    for fam, (k, M) in want.items():
        assert got[fam][:4] == (k, n - k, M - k, N - M - n + k)
        assert got[fam][4] == pytest.approx(hypergeom.sf(k - 1, N, M, n))
    assert names == {}
    assert keep['N'] == N and keep['marked_in_background'] == ['1', '11', '3']
    assert keep['identifiers']['proteins'] == {'P1': ['1', '11'], 'P3': ['3']} and keep['identifiers']['nouns'] == 'genes'
    assert keep['sets']['Neuro'] == {'M': 3, 'marked': ['1', '3']}


def test_whole_universe_and_the_gene_covariate(tables):
    root, paths = tables
    s = spec(['second'], whole_universe=True, abundance={'input': 'abundance', 'protein': 'acc', 'value': 'pct', 'combine': 'max', 'strata': 2})
    keep = {}
    rows, _ = T.protein_set_test(s, paths, {'P1', 'P3', 'P5'}, {f'P{i}' for i in range(1, 8)}, keep=keep, root=root)
    enr = rows[rows['method'] == 'enricher'].iloc[0]
    # every gene of the proteome is the background (N 6); Signs = {4}, held by P5
    assert (enr['category'], enr['a'], enr['b'], enr['c'], enr['d']) == ('Signs', 1, 3, 0, 2)
    strat = rows[rows['method'] == 'mantel_haenszel']
    assert len(strat) == 1 and tuple(strat.iloc[0][['a', 'b', 'c', 'd']]) == (1, 3, 0, 2)
    # a gene takes the highest value of its proteins: gene 2 is P2's 10 and P6's 30
    values = T.covariate(s, paths, T.identifiers_of(s['identifiers'], paths, [f'P{i}' for i in range(1, 8)]))
    assert values.to_dict() == {'1': 5.0, '11': 5.0, '2': 30.0, '3': 50.0}
    assert keep['covariate']['proteins']['4'] == [None, 'none']


def test_check_names_what_is_wrong(tables):
    root, paths = tables
    bad = spec(['first', 'third'], names={'input': 'terms', 'set': 'term_id', 'name': 'term_name'})
    bad['identifiers']['map'][0]['to'] = 'Gene'
    problems = T.spec_problems(bad, root, paths)
    assert any('third' in p for p in problems) and any('drop names' in p for p in problems)
    assert any("no column ['Gene']" in p for p in problems)
    assert not T.spec_problems(spec(['first']), root, paths)
    with pytest.raises(ValueError, match='named by their families'):
        T.protein_set_test(bad, paths, {'P1'}, {'P1'}, root=root)


def test_a_family_in_two_lists_is_refused(tmp_path):
    (tmp_path / 'r.yaml').write_text("schema_version: 1\nlists:\n  - {name: a, families: [{family: X, match: [x]}]}\n"
                                     "  - {name: b, families: [{family: X, match: [y]}]}\n")
    with pytest.raises(ValueError, match='is in lists'):
        T.load_families(tmp_path / 'r.yaml')
