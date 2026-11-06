"""The pathway view's data (website.front.pathways): one small file per tested set of a pathway question, built from the
site's own hierarchy and membership tables (CONTRACTS.md, 'The pathway view'): the pathway's proteins, its sub-pathways as
groups of them, and the genes of those the site has no marks on. The counts a page shows ("k of n methylated") are
those of the file and the site's protein list, worked out here by hand on the ontology toy of test_set_views."""
from __future__ import annotations

import json

import yaml
from test_set_views import MARKED, ONTO, _page, _site

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.front import problems
from ptmcontext.web import pathways as PW

PATHWAYS = [{'analyses': ['onto'], 'hierarchy': {'input': 'onto_terms', 'set': 'id', 'parents': 'is_a', 'name': 'label'},
             'members': {'input': 'onto_members', 'set': 'term', 'protein': 'protein'},
             'source': {'name': 'Toy ontology', 'version': '7', 'licence': 'CC BY 4.0', 'link': 'https://example.org/term/{}'}}]


def _built(tmp_path, pathways=PATHWAYS):
    root = _site(tmp_path)
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['website']['front'] = {'mode': 'cards', **({'pathways': pathways} if pathways else {})}
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    return root, web.build(p, log=lambda *_: None)


def _file(index, set_id):
    return json.loads((index.parent / 'data' / 'pathways' / PW.file_name(set_id)).read_text())


def test_a_pathway_file_holds_its_members_groups_and_genes(tmp_path):
    root, index = _built(tmp_path)
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    listing = {r[0]: r for r in _page(index)['proteins']}
    assert set(listing) == set(MARKED)                      # the site's list: the marked proteins
    top = _file(index, 'D0')                                # a top-level set: no parent; its groups are its sub-pathways
    assert top['top'] is True and top['name'] == 'disease' and top['n'] == len(ONTO['D0']) == 7
    assert sorted(top['acc']) == sorted(ONTO['D0'])
    assert [g['id'] for g in top['groups']] == ['D1', 'D3']
    by = {g['id']: {top['acc'][j] for j in g['m']} for g in top['groups']}
    assert by == {'D1': set(ONTO['D1']), 'D3': set(ONTO['D3'])}
    # methylated of n: the proteins of the file that the site lists
    k = lambda ids: len([a for a in ids if a in listing])           # noqa: E731
    assert (k(top['acc']), len(top['acc'])) == (4, 7)
    assert (k(by['D1']), len(by['D1'])) == (3, 4) and (k(by['D3']), len(by['D3'])) == (1, 3)
    # a gene is only written for a protein the site lists no marks on (the page reads the rest from its own list)
    for a, g in zip(top['acc'], top['gene']):
        assert g == ('' if a in listing else f'G{a}')
    # a set with one sub-pathway with proteins; D4's parent is D2
    d1 = _file(index, 'D1')
    assert d1['top'] is False and [g['id'] for g in d1['groups']] == ['D2'] and d1['n'] == 4
    d2 = _file(index, 'D2')
    assert [g['id'] for g in d2['groups']] == ['D4'] and d2['n'] == 3
    # D4 is under the question's minimum set size: it is not tested, so it has no file
    assert not (index.parent / 'data' / 'pathways' / PW.file_name('D4')).exists()
    # the page learns where the files are and what to say about their source, and the one-file copy has none
    front = _page(index)['front']
    assert front['pathways'] == [{'analyses': ['onto'], 'dir': 'data/pathways/', 'source': PATHWAYS[0]['source']}]
    one = (index.parent / 'toy.html').read_text()
    assert '"pathways"' not in one.split('<script id="site-data"')[1].split('</script>')[0]


def test_a_site_without_the_block_builds_no_pathway_files(tmp_path):
    _, index = _built(tmp_path, pathways=None)
    assert not (index.parent / 'data' / 'pathways').exists()
    assert 'pathways' not in _page(index)['front']


def test_the_check_names_a_pathway_entry_that_does_not_fit(tmp_path):
    root, _ = _built(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    bad = {'analyses': ['nope', 'motif_missing'], 'hierarchy': {'input': 'no_such_role', 'set': 'id', 'parents': 'is_a'},
           'members': {'input': 'onto_members', 'set': 'term', 'protein': 'protein'}}
    site['website']['front']['pathways'] = [bad]
    out = problems(site)
    assert any("'nope' is not a question" in x for x in out) and any("'no_such_role' is not a role" in x for x in out)
    site['website']['front']['pathways'] = [{**PATHWAYS[0], 'analyses': ['onto']}]
    assert problems(site) == []
