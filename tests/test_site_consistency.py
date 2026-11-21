"""The four human sites (methylarginine, methyllysine, lysine, phospho) show the same protein-page cards, in the same order,
wherever the release has data for the residue: a card one site names and another leaves out is a decision to write down, not
an accident. Cards that read data only one residue has (PRMT perturbations, curated experiments, clustering) are the
exceptions listed here."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

SITES = ('methylarginine', 'methyllysine', 'lysine', 'phospho')
ROOT = Path(__file__).resolve().parents[1]
# the release has no table of these for lysine, serine, threonine or tyrosine
ARGININE_ONLY_CARDS = {'perturbations', 'experiments', 'clustering'}


@pytest.fixture(scope='module')
def web():
    return {s: yaml.safe_load((ROOT / 'sites' / f'{s}.yaml').read_text())['website'] for s in SITES}


def test_the_cards_every_site_has(web):
    for s, w in web.items():
        cards = set(w['protein']['cards'])
        assert {'location', 'dependency', 'germline', 'other_ptms'} <= cards, s
        assert {'p-dis'} <= {x.get('id') for x in w['protein']['sets']}, s
        assert (cards - ARGININE_ONLY_CARDS) == {'location', 'dependency', 'germline', 'other_ptms'}, s


def test_the_layout_is_the_same(web):
    for key in ('order', 'groups', 'headings', 'context', 'open'):
        want = web['methylarginine']['protein'][key]
        for s, w in web.items():
            assert w['protein'][key] == want, f'{s}: website.protein.{key}'


def test_changes_and_variants_are_counted_at_every_candidate_residue(web):
    for s, w in web.items():
        card = w['protein']['card']
        assert [x['id'] for x in card['change_counts']] == ['tcga', 'depmap'], s
        assert [x['id'] for x in card['variant_counts']] == ['clinvar', 'gnomad'], s
        assert w['protein']['facts'], s


def test_the_rna_and_dna_card_has_the_same_tabs(web):
    for s, w in web.items():
        assert {'regions', 'motifs', 'rbns', 'eclip', 'crosslinks', 'near'} <= set(w['protein']['nucleic']), s
        sections = [x['id'] for g in w['pages'][0]['groups'] for x in g['sections']]
        assert 'ix-pref' in sections, s
