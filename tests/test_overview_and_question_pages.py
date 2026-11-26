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


def test_the_site_own_sections_sit_between_position_and_other_modifications():
    cfg = json.loads((ROOT / 'ptmcontext/config/overview_groups.json').read_text())
    assert cfg['shared'][:3] == ['Position in the protein', '*', 'Other modifications']
    assert cfg['last'] == ['More questions', 'Studies and databases']
    # the kit ranks a section the list does not name at the star, not after the closing groups
    assert 'star >= 0 ? star : 1e6' in KIT and "G.shared.indexOf('*')" in KIT


def test_the_overview_asks_the_landing_question_and_repeats_no_other_tab():
    for name in SITES:
        w = _site(name)
        assert w['overview']['question'] == w['landing']['question'], name
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
