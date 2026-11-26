"""Names and routes in the site files: no Overview group repeats a tab name, a tile that moved has one home and its old
address, and the questions carry one title wherever they are named."""

from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
SITES = ('methylarginine', 'methyllysine', 'phospho', 'lysine')
OLD_GROUPS = {'Interactions and enzymes', 'Disease and cancer', 'Evidence and studies', 'Which kinases?'}
TITLES = {
    'pdb_interface': 'Interfaces in PDB structures',
    'intact': 'IntAct binding regions and mutations',
    'reactome_top_level': 'Reactome pathways (top level)',
    'disease_family_additional': 'More disease families',
    'condensate': 'Biomolecular condensates, against other condensate proteins',
    'idr_charge': 'Charge of disordered regions',
    'clinvar_plp': 'ClinVar pathogenic or likely pathogenic',
}


def _site(name):
    return yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())


def _sections(site):
    return {s['name']: s for s in site['website']['overview']['sections']}


def _cards(sec):
    return [c if isinstance(c, str) else c.get('analysis') for c in sec['cards']]


@pytest.mark.parametrize('name', SITES)
def test_overview_groups_are_not_tab_names_or_old_names(name):
    names = set(_sections(_site(name)))
    assert not names & OLD_GROUPS
    assert not names & {'Interactions', 'Network', 'Disease variants', 'Methods', 'Proteins', 'Sites'}


@pytest.mark.parametrize('name', SITES)
def test_the_disease_group_shows_all_its_tiles_and_leaves_the_variants_to_their_tab(name):
    sec = _sections(_site(name))['Disease associations']
    assert 'show' not in sec and 'more' not in sec
    cards = _cards(sec)
    assert 'disease_ontology' in cards and 'depmap_dependency' in cards
    assert not {'disease_family', 'disease_family_additional'} & set(cards)
    assert not {'cancer_change', 'clinvar_plp', 'gnomad_variant'} & set(cards)


@pytest.mark.parametrize('name', SITES)
def test_a_moved_tile_is_on_no_overview_group_and_its_old_address_opens_its_new_home(name):
    site = _site(name)
    on_overview = {c for s in site['website']['overview']['sections'] for c in _cards(s)}
    legacy = site['website']['legacy_links']
    for old in ('cancer_change', 'clinvar_plp', 'gnomad_variant'):
        assert old not in on_overview and legacy[old] == '#mutations'
    if name != 'methylarginine':
        ids = {s['id'] for g in site['website']['pages'][0]['groups'] for s in g['sections']}
        assert 'ixs-complexes' in ids and 'complex' not in on_overview
        assert legacy['complex'] == '#interactions/ixs-complexes'
    assert legacy['pdb_interface'] == '#interactions/ixs-pdb'
    assert legacy['intact'] == '#interactions/ixs-intact'


@pytest.mark.parametrize('name', SITES)
def test_the_interactions_groups_are_named_once_and_the_old_group_addresses_still_open(name):
    pg = _site(name)['website']['pages'][0]
    groups = [g['name'] for g in pg['groups']]
    assert 'Binding proteins and partners' in groups
    assert not {'Structures', 'Binding proteins', 'Protein partners and complexes'} & set(groups)
    assert pg['aliases'].get(
        'ixg-binding-proteins' if name != 'methylarginine' else 'ixg-protein-partners-and-complexes'
    ) == ('ixg-binding-proteins-and-partners')
    titles = {s['id']: s['title'] for g in pg['groups'] for s in g['sections']}
    assert titles['ixs-cells'] == 'RNA and DNA crosslinks in cells'
    assert titles['ix-na'] == 'RNA and DNA contacts in structures'
    assert titles['ixs-predicted'] == 'Predicted interfaces'
    assert titles['ixs-intact'] == 'IntAct binding regions and mutations'
    assert 'tiles' not in pg['overview']  # no pointer tiles: the page is the one home


@pytest.mark.parametrize('name', SITES)
def test_a_question_has_one_title_in_the_site_file(name):
    site = _site(name)
    titles = {a['id']: a.get('title') for a in site['analyses']}
    for aid, title in TITLES.items():
        if aid in titles and titles[aid] is not None:
            assert titles[aid] == title, (name, aid)
    shorts = (site['website'].get('front') or {}).get('short') or {}
    for aid, title in shorts.items():
        if aid in TITLES and aid in titles:
            assert title == TITLES[aid], (name, aid)


def test_the_stress_granule_sets_are_named_by_their_source():
    for name in SITES:
        text = (ROOT / 'sites' / f'{name}.yaml').read_text()
        assert 'Stress granule proteome (CD-CODE list)' not in text
        assert 'stress_granule: Stress granule (organelle IP)' in text
    assert 'label: "Stress granule (CD-CODE)"' in (ROOT / 'sites' / 'landing.yml').read_text()


def test_the_sidebar_lists_sections_on_the_overview_only():
    rail = (ROOT / 'ptmcontext/web/assets/kit-rail.js').read_text()
    assert "return S.view === 'overview'\n      ? entries.length" in rail
    assert "S.view === 'overview' || S.view === 'method'" not in rail
