"""Round-4 page fixes: Network key wording, Help, one heading on question pages, old links, set tables, the shares beside a
set's fold, the Interactions summaries, and the phone layout."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def _t(name):
    return (ASSETS / name).read_text()


def _links(site):
    return yaml.safe_load((ROOT / 'sites' / f'{site}.yaml').read_text())['website']['legacy_links']


def test_network_key_says_how_many_carry_the_term():
    assert 'carry this term`' in _t('kit-network.js')


def test_help_does_not_name_a_marker_no_tile_carries():
    assert 'tiles marked ⇄' not in _t('kit-help.js')


def test_a_question_page_has_one_heading_and_no_second_lede():
    js = _t('kit-counts.js')
    assert '<div class="card-head"><div><h3>' not in js
    assert "(c.sub ? '' : esc(c.question" in js
    assert '<div class="card-head"><div><h3>' not in _t('kit-factors.js')


def test_old_links_reach_the_renamed_places():
    kit = _t('kit.js')
    assert '/^sec-./.test(view)' in kit and 'evidence:' in kit and 'disease:' in kit
    assert _links('phospho')['pdb_interface_na'] == '#interactions/ixs-pdb'
    assert _links('methylarginine')['ix_cells'] == '#interactions/ixs-cells'
    # the jump lands again while the sections above it fill in
    assert 'scrollMarginTop' in kit


def test_a_set_table_shows_25_rows_and_the_ceiling_sentence():
    ix = _t('kit-interactions.js')
    assert 'SETS_TOP = 25' in ix and 'K.ceilingLine(' in ix
    assert 'K.ceilingLine' in _t('kit.js')


def test_the_pair_beside_a_sets_fold_is_the_pair_the_fold_is_computed_from():
    kit = _t('kit.js')
    assert 'const share2Of = (r) => (isSetRow(r) ? (r.a + r.c) / (r.a + r.b + r.c + r.d) : share2(r))' in kit
    assert '${pcD(share1(r))} vs ${pcD(share2Of(r))}' in kit


def test_the_interactions_summaries_quote_the_same_rows():
    ix = _t('kit-interactions.js')
    assert 'Folds ${range' not in ix
    assert 'pg.answer?.rows' in ix and 'b.rows.length > pickR.length' in ix


def test_phone_layout_is_shorter():
    css, d3 = _t('kit.css'), _t('kit-3d.js')
    assert '.xm-pagebar + .page-head h2' in css and '.scope:not(.selected)' in css
    assert 'class="s3d-more"' in d3 and "matchMedia('(max-width: 40rem)')" in d3
