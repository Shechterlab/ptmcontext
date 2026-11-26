"""Round 10, order: the owner's order of groups on the filter rail, the Compare page, Methods, Interactions, the Overview
of lysine, the site card and Help."""

from __future__ import annotations

from pathlib import Path

import yaml
from test_context_marks import ENTRY, _site, table  # noqa: F401

from ptmcontext import context_marks as CM

ROOT = Path(__file__).resolve().parents[1]
HUMAN = ('methylarginine', 'methyllysine', 'lysine', 'phospho')
RAIL_FIRST = ['Localization', 'Disease associations and mutations', 'Classes and pathways']


def site(name: str) -> dict:
    return yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())


def test_a_filters_group_of_the_context_name_holds_its_place(table):  # noqa: F811
    s = _site()
    s['website']['filters'] = [{'name': 'Other modifications'}, {'name': 'Last', 'analyses': []}]
    w = CM.expand(s)['website']
    assert [g['name'] for g in w['filters']] == ['Other modifications', 'Last']
    assert w['filters'][0]['attributes'] == ['ctx_near_phos']


def test_every_explorer_lists_the_filter_groups_in_the_owner_order():
    for n in HUMAN:
        names = [g['name'] for g in site(n)['website']['filters']]
        assert names[: len(RAIL_FIRST)] == RAIL_FIRST, n
        assert names[-1] in ('Studies and databases', 'Databases'), n
        assert 'Disease associations and variants' not in names
        assert names.index('Other modifications') < names.index('Sequence motif'), n
        assert names.index('Sequence motif') < names.index('Structural context'), n


def test_compare_lists_its_groups_in_the_owner_order():
    ids = [g['id'] for g in yaml.safe_load((ROOT / 'sites' / 'landing.yml').read_text())['compare']['groups']]
    assert ids == ['cell', 'disease', 'panther', 'condensates', 'nucleic', 'disorder', 'motifs']


def test_methods_lists_the_questions_in_the_overview_order_with_controls_last():
    js = (ROOT / 'ptmcontext' / 'web' / 'assets' / 'kit.js').read_text()
    assert 'const methodOrder = () =>' in js
    assert 'methodOrder().map(questionMethod)' in js and '...methodOrder().map((a) => [`m-q-${a.id}`' in js
    assert 'D.analyses.map(questionMethod)' not in js
    assert 'a.control_of ? 2e6 : 0' in js


def test_the_interactions_page_lists_partners_then_structures_then_rna_and_dna():
    for n in HUMAN:
        pg = next(p for p in site(n)['website']['pages'] if p['id'] == 'interactions')
        names = [g['name'] for g in pg['groups']]
        body = [x for x in names if x != 'Summary']
        assert body == ['Binding proteins and partners', 'Structures and models', 'RNA and DNA'], n
        assert names[0] == ('Summary' if n == 'methylarginine' else body[0]), n
        assert not [s for g in pg['groups'] for s in g['sections'] if s.get('place') == 'top'], n
        assert pg['groups'][names.index('Binding proteins and partners')].get('open') is True
    ma = next(p for p in site('methylarginine')['website']['pages'] if p['id'] == 'interactions')
    last = ma['groups'][-1]
    assert last['name'] == 'RNA and DNA' and 'ix-nac' in [s['id'] for s in last['sections']]


def test_lysine_overview_puts_its_modification_sections_next_to_other_modifications():
    order = site('lysine')['website']['overview']['group_order']
    i = order.index('Other modifications')
    assert order[i + 1 : i + 3] == ['Same lysine, different modifications', 'Modification type']
    assert order.index('Enzymes and readers') < i < order.index('Position in the protein')


def test_methyllysine_classes_show_the_all_states_tiles_and_fold_the_per_state_ones():
    sec = next(
        s for s in site('methyllysine')['website']['overview']['sections'] if s['name'] == 'Classes and pathways'
    )
    ids = [c['analysis'] for c in sec['cards']]
    per_state = [i for i in ids if i.endswith(('_me1', '_me2', '_me3'))]
    assert per_state and ids[-len(per_state) :] == per_state
    assert sec['show'] == len(ids) - len(per_state)


def test_the_four_site_files_pass_the_site_checks():
    from ptmcontext import site as S

    for n in HUMAN:
        assert not S.website_problems(S.load_site(ROOT / 'sites' / f'{n}.yaml')), n


def test_the_site_card_has_a_mutations_block_then_an_interactions_block():
    src = (ROOT / 'ptmcontext/web/assets/kit-proteins.js').read_text()
    card = (ROOT / 'ptmcontext/web/assets/kit-sitecard.js').read_text()
    assert '<h4>Mutations at ${esc(siteOf(p, m[0]))}</h4>' in src and 'id="sc-variants"' in src
    assert 'Variants at' not in src
    assert src.index('id="sc-variants"') < src.index('id="sc-interactions"') < src.index('${wr}${recs}${ev}')
    assert "group('records', 'Sources'" in src and 'UniProt and sources' not in src
    assert '<summary>Key</summary>' not in card
