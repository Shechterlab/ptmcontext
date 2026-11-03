"""A site's page of sections, its questions of several tests and its tables, from a toy site whose files are in the
contracts' formats (CONTRACTS.md: a question of several tests, sets.each, Tables the protein pages show, Website pages): each test counts
its own background, the tables come out in the contract's columns and the website receives the page and its tables.
The tables are in the formats of the protein pages' tables. Nothing here names a mark, a source or a page: a site with other data gets the same page from its own file."""
from __future__ import annotations

import json
import re

import pandas as pd
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

#                 1        10        20        30        40
P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'    # R at 2, 5, 11, 22, 32, 43
P2 = 'MRAAARAAARAAAAAAAAAAAAAARAAAR'                  # R at 2, 6, 10, 25, 29
P3 = 'MRAAAR'                                         # no mark


def _toy_site(tmp_path, pages=True):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(''.join(f'>sp|{a}|{g}_TOY {g} protein OS=Toy OX=1 GN={g} PE=1 SV=1\n{s}\n'
                                            for a, g, s in [('P1', 'ONE', P1), ('P2', 'TWO', P2), ('P3', 'THREE', P3)]))
    pd.DataFrame({'acc': ['P1', 'P1', 'P1', 'P2', 'P2'], 'pos': [2, 5, 32, 2, 25],
                  'status': ['exp', 'exp', 'none', 'pred', 'none'], 'ev': ['xl; pdb', 'xl', '', 'pdb', '']}).to_csv(data / 'marks.tsv', sep='\t', index=False)
    # crosslinked residues in their own layout: the protein, the residue and its letter (P2 9 is not an R: dropped)
    pd.DataFrame({'protein': ['P1', 'P1', 'P2', 'P2'], 'site': [5, 22, 6, 9], 'aa': ['R', 'R', 'R', 'R']}).to_csv(data / 'xl.tsv', sep='\t', index=False)
    # the residues an experiment measured: intervals
    pd.DataFrame({'protein': ['P1', 'P2'], 'from': [1, 20], 'to': [12, 29]}).to_csv(data / 'measured.tsv', sep='\t', index=False)
    # records at sites ("ACC:R5"), in a layout of their own; a protein without marks is left out of the page's table
    pd.DataFrame({'site_id': ['P1:R5', 'P1:R5', 'P2:R25', 'P9:R1'], 'kind': ['binds', 'writes', 'binds', 'binds'],
                  'partner': ['P2', 'Q99999', 'P1', 'P1'], 'pmid': ['1', '2', '3', '5']}).to_csv(data / 'records.tsv', sep='\t', index=False)
    pd.DataFrame({'protein': ['P1', 'P1', 'P2'], 'partner': ['P2', 'Q99999', 'Q99999'], 'gene': ['TWO', 'NINE', 'NINE'], 'string': ['0.9', '0.8', '0.7'],
                  'marked': ['true', 'false', 'false'], 'classes': ['reader', 'reader', 'reader']}).to_csv(data / 'partners.tsv', sep='\t', index=False)

    def entry(f, **kw):
        return {'file': f, 'md5': md5_file(data / f), 'source': 'synthetic, for a test', 'version': 'test 1', 'licence': 'CC0 1.0', **kw}
    manifest = {'schema_version': 1, 'inputs': {
        'toy_fasta': entry('toy.fasta', version='Toy 2026_01'),
        'toy_marks': entry('marks.tsv'),
        'toy_xl': entry('xl.tsv', columns={'accession': 'protein', 'position': 'site', 'residue': 'aa'}),
        'toy_measured': entry('measured.tsv', columns={'accession': 'protein', 'start': 'from', 'end': 'to'}),
        'toy_records': entry('records.tsv'),
        'toy_partners': entry('partners.tsv'),
    }}
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    site = {
        'schema_version': 1, 'id': 'toy', 'title': 'A toy site', 'status': 'working', 'mark': 'methylarginine',
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': {'crosslinks': 'toy_xl', 'measured': 'toy_measured'},
        'marks': {'input': 'toy_marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error',
                  'attributes': {'status': {'column': 'status', 'label': 'Evidence', 'kind': 'category', 'values': {'exp': 'Experimental', 'pred': 'Predicted', 'none': 'None'}},
                                 'ev': {'column': 'ev', 'label': 'Kinds', 'kind': 'list', 'values': {'xl': 'Crosslink', 'pdb': 'Structure'}}}},
        'analyses': [
            {'id': 'xl', 'title': 'Crosslinks', 'counting': 'every_candidate',
             'tests': [{'category': 'crosslink', 'inside': 'crosslinks', 'proteins_with': 'crosslinks', 'label': 'Crosslinked residue'},
                       {'category': 'crosslink_measured', 'inside': 'crosslinks', 'covered_by': 'measured', 'label': 'Crosslinked, among measured',
                        'background': 'other residues the experiment measured'}]},
            {'id': 'near', 'title': 'Near a crosslink', 'counting': 'every_candidate',
             'tests': [{'category': 'crosslink', 'inside': 'crosslinks', 'proteins_with': 'crosslinks'}],
             'strata': [{'stratum': 'within_0', 'within': 0}, {'stratum': 'within_3', 'within': 3}]},
            {'id': 'bound', 'test': 'protein_sets', 'title': 'Proteins with a crosslink', 'universe': 'snapshot', 'whole_universe': True,
             'sets': {'each': [{'set': 'crosslinked', 'name': 'Crosslinked protein', 'units': 'crosslinks'}]}},
        ],
        'outputs': {'folder': 'out/toy'},
        'website': {'name': 'Toy Explorer'},
    }
    if pages:
        site['website']['tables'] = {      # the formats of CONTRACTS.md, "Tables the protein pages show"
            'records': {'input': 'toy_records', 'format': 'site_records', 'columns': {'site': 'site_id', 'group': 'kind', 'partner_accession': 'partner', 'pubmed': 'pmid'}},
            'partners': {'input': 'toy_partners', 'format': 'protein_partners',
                         'columns': {'accession': 'protein', 'partner_accession': 'partner', 'partner': 'gene', 'score': 'string',
                                     'partner_marked': 'marked', 'classes': 'classes'}},
        }
        site['website']['pages'] = [{
            'id': 'contacts', 'tab': 'Contacts', 'title': 'Are the marks at contacts?',
            'answer': {'more': '{marks} sit {list} more often.', 'rows': [{'analysis': 'xl', 'category': 'crosslink', 'phrase': 'at crosslinks'}]},
            'columns': {'records.group': {'label': 'Record', 'values': {'binds': 'Binds it'}}},
            'highlights': [{'share': {'table': 'partners', 'of': 'partner_accession', 'flag': 'partner_marked'}, 'label': 'of partners marked', 'section': 'who'}],
            'overview': {'section': 'Contacts', 'bar': 'status', 'rows': [{'analysis': 'xl', 'category': 'crosslink'}],
                         'findings': [{'lead': 'In cells', 'section': 'tests', 'rows': [{'analysis': 'xl', 'category': 'crosslink', 'phrase': 'at crosslinks'}]},
                                      {'share': {'table': 'partners', 'of': 'partner_accession', 'flag': 'partner_marked'}, 'label': 'of partners marked'}]},
            'groups': [{'name': 'Tests', 'sections': [
                {'id': 'tests', 'title': 'The tests', 'blocks': [
                    {'kind': 'forest', 'rows': [{'analysis': 'xl', 'category': 'crosslink'}, {'analysis': 'xl', 'category': 'crosslink_measured'}]},
                    {'kind': 'lines', 'analysis': 'near', 'series': ['crosslink'], 'x': {'within_0': 0, 'within_3': 3}},
                    {'kind': 'sets', 'analysis': 'bound'}]},
                {'id': 'evidence', 'title': 'The evidence', 'blocks': [{'kind': 'shares', 'attribute': 'status'}, {'kind': 'combinations', 'attribute': 'ev'}]},
                {'id': 'who', 'title': 'Who', 'blocks': [{'kind': 'table', 'table': 'records', 'group_by': 'group', 'columns': ['accession', 'partner_accession', 'pubmed']},
                                                          {'kind': 'bars', 'table': 'partners', 'label': 'partner', 'partner': 'partner_accession', 'groups': {'column': 'classes', 'values': {'reader': 'Readers'}}}]},
            ]}]}]
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False, allow_unicode=True))
    return root


def _rows(run, aid, method):
    r = run.rows
    return r[(r['analysis'] == aid) & (r['method'] == method)].set_index(['category', 'stratum'])


def test_each_test_counts_its_own_background(tmp_path):
    root = _toy_site(tmp_path)
    run = S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    f = _rows(run, 'xl', 'fisher')
    # P1: marks 2, 5, 32 and others 11, 22, 43; crosslinked 5, 22. P2: marks 2, 25, others 6, 10, 29; crosslinked 6
    assert tuple(f.loc[('crosslink', 'all'), ['a', 'b', 'c', 'd']]) == (1, 4, 2, 4)
    # among the measured residues only (P1 1-12: 2, 5, 11; P2 20-29: 25, 29)
    assert tuple(f.loc[('crosslink_measured', 'all'), ['a', 'b', 'c', 'd']]) == (1, 2, 0, 2)
    assert f.loc[('crosslink_measured', 'all'), 'background'] == 'other residues the experiment measured'
    mh = _rows(run, 'xl', 'mantel_haenszel')                     # every_candidate: the within-protein row reports them
    assert tuple(mh.loc[('crosslink', 'all'), ['a', 'b', 'c', 'd']]) == (1, 4, 2, 4)
    n = _rows(run, 'near', 'fisher')                              # strata: within 0 and 3 residues of a crosslink
    assert tuple(n.loc[('crosslink', 'within_0'), ['a', 'b', 'c', 'd']]) == (1, 4, 2, 4)
    assert tuple(n.loc[('crosslink', 'within_3'), ['a', 'b', 'c', 'd']]) == (2, 3, 2, 4)
    s = _rows(run, 'bound', 'enricher')                           # one set per item: proteins with a crosslink
    assert tuple(s.loc[('crosslinked', 'all'), ['a', 'b', 'c', 'd']]) == (2, 0, 0, 1)
    rec = json.loads((root / 'out' / 'toy' / 'run.json').read_text())['analyses']
    assert [t['code'] for t in rec['near']['tests']] == ['crosslink_within_0', 'crosslink_within_3']


def test_a_page_reads_its_tables_in_the_contracts_columns(tmp_path):
    root = _toy_site(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    assert S.website_problems(site) == []
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    page = index.read_text()
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    assert [p['id'] for p in data['pages']] == ['contacts']
    assert data['page_tables']['records'] == {'key': 'residue', 'n': 3, 'columns': [
        {'name': 'group', 'type': 'text', 'label': 'Record', 'values': {'binds': 'Binds it'}},
        {'name': 'partner_accession', 'type': 'accession', 'label': 'Partner accession'}, {'name': 'pubmed', 'type': 'pubmed', 'label': 'Pubmed'}]}
    pidx = {p[0]: i for i, p in enumerate(data['proteins'])}
    t = json.loads((index.parent / 'data' / 'pages' / 'records.json').read_text())
    assert t['rows'] == [[pidx['P1'], 5, 'binds', 'P2', '1'], [pidx['P1'], 5, 'writes', 'Q99999', '2'], [pidx['P2'], 25, 'binds', 'P1', '3']]
    p = json.loads((index.parent / 'data' / 'pages' / 'partners.json').read_text())
    assert p['columns'][0]['name'] == 'partner_accession' and p['rows'][0][0] == pidx['P1'] and [c['type'] for c in p['columns']][-2:] == ['flag', 'list']
    assert p['rows'][0][-2:] == [1, ['reader']]
    assert 'kit-interactions.js' in page and 'id="page-table-data"' in (index.parent / 'toy.html').read_text()
    # the selection data carries what a question of several tests needs to test a selection again
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    assert 'xl' in sel['by_test'] and 'near' in sel['by_test']


def test_a_page_names_only_what_the_site_has(tmp_path):
    root = _toy_site(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    blocks = site['website']['pages'][0]['groups'][0]['sections'][0]['blocks']
    blocks.append({'kind': 'table', 'table': 'nowhere'})
    blocks.append({'kind': 'forest', 'rows': [{'analysis': 'xl', 'category': 'no_such_test'}]})
    blocks.append({'kind': 'shares', 'attribute': 'ev'})
    site['website']['legacy_links'] = {'old-key': '#contacts', 'gone': '#nowhere'}
    problems = S.website_problems(site)
    assert any("no table 'nowhere'" in p for p in problems)
    assert any("has no class 'no_such_test'" in p for p in problems)
    assert any("attribute 'ev' is not a category" in p for p in problems)
    assert any("'#nowhere', which is not a page" in p for p in problems)
    assert not any('old-key' in p for p in problems)
    assert not any('findings' in p for p in problems)          # the toy's own findings name what it has


def test_an_overview_finding_names_what_the_site_has(tmp_path):
    root = _toy_site(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    fs = site['website']['pages'][0]['overview']['findings']
    fs.append({'rows': [{'analysis': 'xl', 'category': 'no_such_test'}], 'section': 'nowhere'})
    fs.append({'label': 'neither rows nor a share'})
    fs.append({'share': {'table': 'missing', 'of': 'a', 'flag': 'b'}, 'label': 'x'})
    problems = [p for p in S.website_problems(site) if 'overview.findings' in p]
    assert any("has no class 'no_such_test'" in p for p in problems)
    assert any("no section 'nowhere'" in p for p in problems)
    assert any('rows: or share:, one of them' in p for p in problems)
    assert any("no table 'missing'" in p for p in problems)


def test_a_site_without_pages_writes_no_tables(tmp_path):
    root = _toy_site(tmp_path, pages=False)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1))
    assert data['pages'] == [] and data['page_tables'] == {} and not (index.parent / 'data' / 'pages').exists()
