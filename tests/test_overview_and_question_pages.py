"""The Overview and question pages: one section order for every explorer, pointers instead of copies, and a question
page that leads with its strongest rows."""

import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SITES = ('methylarginine', 'methyllysine', 'lysine', 'phospho')
KIT = (ROOT / 'ptmcontext/web/assets/kit.js').read_text()


def _site(name):
    return yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())['website']


def test_the_site_own_sections_follow_enzymes_and_readers_and_precede_other_modifications():
    cfg = json.loads((ROOT / 'ptmcontext/config/overview_groups.json').read_text())
    assert cfg['shared'] == [
        'Localization',
        'Disease associations',
        'Classes and pathways',
        'Enzymes and readers',
        '*',
        'Other modifications',
        'Position in the protein',
    ]
    assert cfg['last'] == ['More questions', 'Studies and databases']
    # the kit ranks a section the list does not name at the star, not after the closing groups
    assert 'star >= 0 ? star : 1e6' in KIT and "G.shared.indexOf('*')" in KIT


def test_the_overview_has_the_short_heading_the_cell_first_and_repeats_no_other_tab():
    for name in SITES:
        w = _site(name)
        assert 'question' not in w['overview'] and w['overview']['cell_first'] is True, name
        assert w['overview']['random_maps']['enabled'] is False, name
        assert 'tile' not in w['network'], name
        names = [s['name'] for s in w['overview']['sections']]
        assert 'RNA and DNA binding' not in names, name
        links = [s.get('links') for s in w['overview']['sections'] if s['name'] == 'Enzymes and readers']
        # lysine has no enzymes or readers to show: its complexes and interfaces are on the Interactions page
        assert links == ([] if name == 'lysine' else [['interactions', 'network']]), name
    assert 'on_overview !== true' in (ROOT / 'ptmcontext/web/assets/kit-start.js').read_text()


def test_one_note_beside_the_test_switch_not_a_mark_on_every_tile():
    assert 'changes with the Test switch' not in KIT and 'class="tsw"' not in KIT
    assert 'class="tnote' in KIT


def test_key_findings_rank_by_effect_among_q_at_most_005():
    assert 'KF?.min_fold ?? 1.25' in KIT
    assert 'cands.sort((x, y) => y.v - x.v || x.q - y.q)' in KIT


def test_the_cell_drawing_and_the_atlas_have_their_own_names():
    for name in SITES:
        w = _site(name)
        assert w['cell']['title'] == 'Localization', name
        titles = {
            a['id']: a.get('title') for a in yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())['analyses']
        }
        assert titles['hpa_location'] == 'Human Protein Atlas locations', name


def test_a_question_page_has_tiles_then_the_table_then_closed_controls_and_the_pager_last():
    i = KIT.index('function focus(aid)')
    body = KIT[i : i + 9000]
    assert body.index('qTiles(a, rows, card)') < body.index('familyLine(a)')
    assert 'ctl +\n      familyLine(a) +\n      bar;' in body
    assert '<details class="pcard controls" id="q-controls"' in KIT
    assert 't.open = true' in KIT
    assert "inFocus ? '' : `<h3>" in KIT


def test_the_overview_heading_is_key_findings_and_the_strongest_results_row_is_off_by_default():
    assert '<h2>Key findings</h2>${tools}${tnote}' in KIT and 'OV.question' not in KIT
    assert 'if (KF?.enabled !== true ||' in KIT
    for name in SITES:
        assert 'enabled' not in (_site(name)['overview'].get('key_findings') or {}), name


def test_figures_come_before_tables_and_text_on_the_interactions_and_disease_variants_pages():
    ix = (ROOT / 'ptmcontext/web/assets/kit-interactions.js').read_text()
    assert '!FIG[x[0].kind] - !FIG[y[0].kind] || x[1] - y[1]' in ix and 'blocksHtml(pg, s), s.open' in ix
    mu = (ROOT / 'ptmcontext/web/assets/kit-mutations.js').read_text()
    assert '`${lead}${tilesHtml()}${note}${bar}${body}' in mu
    assert mu.index('<h3>Top TCGA sites</h3>') < mu.index('whyCommon(o);')


def test_the_interactions_contact_tests_open_above_the_group_cards():
    text = (ROOT / 'sites' / 'methylarginine.yaml').read_text()
    sec = text.split('- id: ix-nac')[1].split('blocks:')[0]
    assert 'place: top' in sec and 'open: true' in sec
