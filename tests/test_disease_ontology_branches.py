"""The Overview's Disease associations tile lists the Disease Ontology's branches: the same fixed list of DOIDs on every
explorer, the children of "disease of anatomical entity" (DOID:7) and the other children of "disease" (DOID:4)."""

import csv
import os
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
SITES = ('methylarginine', 'methyllysine', 'lysine', 'phospho')
TERMS = 'inputs/disease/hdo_2026-09-30_terms.tsv'


def _card(name):
    site = yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())
    sec = next(s for s in site['website']['overview']['sections'] if s['name'] == 'Disease associations')
    return sec['cards'][0], site


def test_every_explorer_lists_the_same_branches_and_keeps_the_disgenet_views_on_the_page():
    lists = []
    for name in SITES:
        card, _ = _card(name)
        assert card['analysis'] == 'disease_ontology'
        assert card['title'] == 'Disease classes (Disease Ontology)'
        lists.append(card['classes'])
        assert [v['analysis'] for v in card['views']] == ['disease_ontology', 'disease_family']
        assert card['views'][1]['more']['analysis'] == 'disease_family_additional'
    assert all(x == lists[0] for x in lists) and len(set(lists[0])) == len(lists[0]) == 20


def test_the_listed_branches_are_the_children_of_DOID_7_and_DOID_4():
    root = Path(os.environ.get('PTMCONTEXT_ROOT', ROOT.parent / 'PTM_Pipeline'))
    path = root / TERMS
    if not path.exists():
        pytest.skip(f'no {path}')
    kids = {}
    for r in csv.DictReader(path.open(), delimiter='\t'):
        for p in filter(None, (r['parents'] or '').split(';')):
            kids.setdefault(p, set()).add(r['term_id'])
    want = (kids['DOID:4'] - {'DOID:7'}) | kids['DOID:7']
    assert set(_card('methylarginine')[0]['classes']) == want


def test_a_card_with_classes_draws_exactly_those_rows():
    src = (ROOT / 'ptmcontext/web/assets/kit.js').read_text()
    assert 'function pickListed(rows, card)' in src
    assert 'const choose = (rs) => (card.classes ? pickListed(rs, card) : pick(rs, max, card));' in src


@pytest.mark.parametrize('name', SITES)
def test_the_protein_page_lists_the_proteins_branches_and_keeps_disgenet_behind_a_heading(name):
    _, site = _card(name)
    card = next(c for c in site['website']['protein']['sets'] if c['id'] == 'p-dis')
    assert card['branches'] == 'disease_ontology'
    assert set(card['behind']['analyses']) == {'disease_term', 'disease_family', 'disease_family_additional'}
    assert set(card['behind']['analyses']) <= set(card['analyses'])
    fact = next(f for f in site['website']['protein']['facts'] if f.get('analysis') == 'disease_ontology')
    assert fact['branches'] is True
    assert site['website']['protein']['context']['p-dis'] == ['disease_ontology']


def test_compare_lists_branches_of_the_overview_list():
    land = yaml.safe_load((ROOT / 'sites/landing.yml').read_text())
    grp = next(g for g in land['compare']['groups'] if g['id'] == 'disease')
    (q,) = grp['questions']
    assert q['analysis'] == 'disease_ontology'
    ids = [c['class'] for c in q['classes']]
    assert len(ids) == len(set(ids)) and set(ids) <= set(_card('methylarginine')[0]['classes'])
