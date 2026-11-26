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
