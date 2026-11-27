"""The Overview's Disease associations tile lists the organ-system classes of the Disease Ontology's DO_AGR_slim: the same
fixed list of DOIDs on every explorer."""

import csv
import os
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
SITES = ('methylarginine', 'methyllysine', 'lysine', 'phospho')
TERMS = 'inputs/disease/hdo_2026-09-30_terms.tsv'
SLIM = [
    ('DOID:162', 'cancer'),
    ('DOID:863', 'nervous system disease'),
    ('DOID:150', 'disease of mental health'),
    ('DOID:1287', 'cardiovascular system disease'),
    ('DOID:2914', 'immune system disease'),
    ('DOID:0014667', 'disease of metabolism'),
    ('DOID:28', 'endocrine system disease'),
    ('DOID:17', 'musculoskeletal system disease'),
    ('DOID:74', 'hematopoietic system disease'),
    ('DOID:77', 'gastrointestinal system disease'),
    ('DOID:1579', 'respiratory system disease'),
    ('DOID:18', 'urinary system disease'),
    ('DOID:15', 'reproductive system disease'),
    ('DOID:16', 'integumentary system disease'),
    ('DOID:0050155', 'sensory system disease'),
]


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
    assert all(x == lists[0] for x in lists) and lists[0] == [d for d, _ in SLIM]


def test_the_listed_classes_are_terms_of_the_ontology_with_the_slims_names():
    root = Path(os.environ.get('PTMCONTEXT_ROOT', ROOT.parent / 'PTM_Pipeline'))
    path = root / TERMS
    if not path.exists():
        pytest.skip(f'no {path}')
    names = {r['term_id']: r['name'] for r in csv.DictReader(path.open(), delimiter='\t')}
    assert {d: names.get(d) for d, _ in SLIM} == dict(SLIM)


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
    assert ids == [d for d, _ in SLIM] and [c['label'] for c in q['classes']] == [n for _, n in SLIM]
