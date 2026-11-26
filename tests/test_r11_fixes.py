"""Round-11 fixes: the sites table names its count columns in words."""

from pathlib import Path

import yaml

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'
ROOT = Path(web.__file__).parents[2]


def _src(name):
    return (ASSETS / name).read_text()


def test_the_sites_table_names_its_count_column_by_the_count_noun_not_k():
    st = _src('kit-sitetable.js')
    assert "sub: 'k'" not in st
    assert 'sub: noun(s)' in st
    assert '>k: ' not in st and 'st-note">k:' not in st
    assert '(k: samples' not in st


def test_the_cancer_card_is_two_cards_and_the_old_fold_id_opens_the_mutations_card():
    pc = _src('kit-pcards.js')
    assert "'p-dependency', 'Cancer cell dependency (DepMap)'" in pc
    assert "'p-mutations', 'Mutations in tumors and cell lines'" in pc
    assert "'p-depmap': 'p-mutations'" in _src('kit-openlink.js')
    assert "'p-depmap': 'p-mutations'" in _src('kit-proteins.js')
    for site in ('methylarginine', 'methyllysine', 'lysine', 'phospho'):
        prot = yaml.safe_load((ROOT / 'sites' / f'{site}.yaml').read_text())['website']['protein']
        folds = [f for g in prot['groups'] for f in g['folds']]
        assert 'p-depmap' not in prot['order'] and 'p-depmap' not in folds, site
        assert folds.index('p-mutations') + 1 == folds.index('p-germline') > folds.index('p-dependency'), site
        assert prot['cards']['dependency']['title'] == 'Cancer cell dependency (DepMap)', site


def test_compared_with_is_printed_once_in_a_group_of_the_compare_table():
    js = _src('land-compare.js')
    assert 'onlyGroup && !seen.cw' in js and 'const seen = { cw: false }' in js


def test_the_all_tests_question_list_follows_the_overview_order_and_names_a_cell_map_once():
    js = _src('kit.js')
    assert 'methodOrder()\n        .filter((a) => !K.listHides(a))' in js
    assert '[...D.analyses.map(' not in js and '...D.analyses.map((a) => [a.id, a.title])' not in js
    assert 'K.listTitle = ' in js and 'K.regionsOf = ' in js


def test_the_protein_sets_list_follows_the_overview_order_and_lists_a_question_once():
    pr = _src('kit-proteins.js')
    assert 'K.questionOrder()' in pr and '!K.listHides(a)' in pr
    assert 'ctxNames' not in _src('kit-pfolds.js')
