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
