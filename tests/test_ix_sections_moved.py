"""Sections of a page that moved or went (website.pages[].aliases), a section's tile as an Overview tile of its own
(overview.tiles), and the blocks the Interactions page gained (tiles, contact_list, pointer, fold, and a lines block that
says its chart in a sentence): the checks name what a site file misses, a fold's blocks reach the page tables, and an old
id still opens where its section is now (kit-openlink.js, run in Node)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from test_pages import _toy_site

from ptmcontext import site as S
from ptmcontext import web

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _page(tmp_path):
    root = _toy_site(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    return site, site['website']['pages'][0]


def test_aliases_tiles_and_new_blocks_are_checked(tmp_path):
    site, pg = _page(tmp_path)
    pg['aliases'] = {'old-section': 'tests', 'old-fold': 'ixg-tests'}
    pg['overview']['tiles'] = {'section': 'More', 'sections': ['tests', 'who']}
    sec = pg['groups'][0]['sections'][0]
    sec['blocks'] += [
        {'kind': 'tiles', 'tiles': [{'label': 'at a crosslink', 'row': {'analysis': 'xl', 'category': 'crosslink'}}]},
        {'kind': 'pointer', 'text': 'See', 'protein': 'ONE'},
        {
            'kind': 'fold',
            'label': 'Show more',
            'blocks': [{'kind': 'forest', 'rows': [{'analysis': 'xl', 'category': 'crosslink'}]}],
        },
    ]
    sec['blocks'][1]['sentence'] = {'residue': 'crosslink', 'inside': 'inside a peptide'}
    assert S.website_problems(site) == []


def test_a_bad_alias_tile_or_inner_block_is_named(tmp_path):
    site, pg = _page(tmp_path)
    pg['aliases'] = {'old': 'nowhere'}
    pg['overview']['tiles'] = {'section': 'More', 'sections': ['missing']}
    sec = pg['groups'][0]['sections'][0]
    sec['blocks'] += [
        {'kind': 'tiles', 'tiles': [{'label': 'x', 'row': {'analysis': 'xl', 'category': 'no_such_test'}}]},
        {'kind': 'fold', 'label': 'Show', 'blocks': [{'kind': 'table', 'table': 'nowhere'}]},
        {
            'kind': 'contact_list',
            'table': 'nowhere',
            'modeled': {'table': 'records', 'entry': 'no_col', 'state': 'group'},
        },
    ]
    sec['blocks'][1]['sentence'] = {'residue': 'not_a_series', 'inside': 'inside'}
    problems = S.website_problems(site)
    assert any("'old' opens 'nowhere'" in p for p in problems)
    assert any("overview.tiles: no section 'missing'" in p for p in problems)
    assert any("has no class 'no_such_test'" in p for p in problems)
    assert any("no table 'nowhere'" in p for p in problems)  # inside the fold, and the contact list's
    assert any('sentence.residue is not one of its series' in p for p in problems)
    assert any("table 'records' has no column 'no_col'" in p for p in problems)


def test_a_folds_blocks_reach_the_page_tables():
    blocks = [
        {'kind': 'forest'},
        {
            'kind': 'fold',
            'blocks': [
                {'kind': 'histogram', 'table': 'a'},
                {'kind': 'fold', 'blocks': [{'kind': 'table', 'table': 'b'}]},
            ],
        },
    ]
    assert [b['kind'] for b in web._flat_blocks(blocks)] == ['forest', 'histogram', 'table']


def test_an_old_id_opens_where_the_section_is_now():
    js = f"""
    global.window = {{ PTMC_MODULES: [], fetch: undefined }};
    global.document = {{ addEventListener() {{}}, querySelectorAll: () => [], getElementById: () => null }};
    require({json.dumps(str(ASSETS / 'kit-openlink.js'))});
    const K = {{ S: {{ view: 'x', arg: '' }}, paramsIn: [], hashOut: [], D: {{ pages: [{{ aliases: {{ 'old-fold': 'new-fold' }} }}] }} }};
    window.PTMC_MODULES.forEach((m) => m(K));
    console.log(JSON.stringify([K.foldId('old-fold'), K.foldId('other')]));
    """
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout
    assert json.loads(out) == ['new-fold', 'other']


def test_the_card_and_the_page_word_a_contact_through_one_helper():
    card = (ASSETS / 'kit-sitecard.js').read_text()
    page = (ASSETS / 'kit-interactions.js').read_text()
    assert 'best: contactBest,' in card and 'phrase: contactPhrase,' in card
    assert card.count('const contactBest') == 1 and 'contactBest' not in page
    assert 'K.card.contact.best' in page and 'K.card.contact.phrase' in page
    assert 'In contact with ${contactWord' in card
