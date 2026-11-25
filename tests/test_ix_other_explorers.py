"""The Interactions page of the four human explorers: the interface questions have one home there (a tile row, the tests),
the Overview keeps one pointer, the tiles, the lede and the card say a range from the same rows, a closest distance
under 2.0 Å is flagged in display only, a set question held at a fold ceiling says it in a sentence, and a count tile
names no top row."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
SITES = ('methylarginine', 'methyllysine', 'lysine', 'phospho')
MOVED = ('pdb_interface', 'predicted_interface', 'pdb_interface_na', 'intact')


def _web(name):
    return yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())['website']


def _page(name):
    return next(p for p in _web(name)['pages'] if p['id'] == 'interactions')


def _sections(pg):
    return {s['id']: s for g in pg['groups'] for s in g['sections']}


def _flat(blocks):
    for b in blocks:
        yield b
        if b['kind'] == 'fold':
            yield from _flat(b['blocks'])


@pytest.mark.parametrize('name', SITES)
def test_the_page_has_a_tile_row_and_opens_its_first_group(name):
    pg = _page(name)
    assert len(pg['highlights']) >= 3
    key_test = 'ix-na' if name == 'methylarginine' else 'ixs-pdb'  # the contact test, or the interface tests
    opened = [g for g in pg['groups'] if g.get('open') is True]
    assert len(opened) == 1 and key_test in {s['id'] for s in opened[0]['sections']}
    secs = _sections(pg)
    assert all(h['section'] in secs for h in pg['highlights'] if h.get('section'))


@pytest.mark.parametrize('name', ('methyllysine', 'lysine', 'phospho'))
def test_the_interface_questions_have_one_home(name):
    web = _web(name)
    pg = _page(name)
    page_rows = {r['analysis'] for s in _sections(pg).values() for b in _flat(s['blocks']) for r in b.get('rows') or []}
    on_overview = {
        c['analysis']
        for sec in web['overview']['sections']
        for c in sec.get('cards') or []
        if isinstance(c, dict) and 'analysis' in c
    }
    here = {a for a in MOVED if a in page_rows}
    assert {'pdb_interface', 'predicted_interface', 'intact'} <= here
    assert not (here & on_overview)  # a card on the Overview would be a second home
    ov = pg['overview']
    assert ov['rows'] == [] and ov['section'] == 'Interactions and enzymes'  # one pointer, no tests of its own
    assert pg['aliases']['ixg-structures'] == 'ixg-structures-and-models'


@pytest.mark.parametrize('name', SITES)
def test_a_tile_says_its_range_over_rows_its_card_has(name):
    """A tile's rows are among the first six rows of its section's tile block, which the card (tileBody) counts; the
    page's answer line speaks of the same rows as the tiles."""
    pg = _page(name)
    secs = _sections(pg)

    def key(r):
        return (r['analysis'], r['category'])

    for h in pg['highlights']:
        if not h.get('rows') or not h.get('section'):
            continue
        sec = secs[h['section']]
        block = sec['blocks'][min(sec.get('tile', 0), len(sec['blocks']) - 1)]
        if block['kind'] != 'forest':
            continue
        card = {key(r) for r in block['rows'][:6]}
        assert {key(r) for r in h['rows']} <= card, (h['label'], h['section'])
    ans = {key(r) for r in (pg.get('answer') or {}).get('rows', [])}
    tiles = {key(r) for h in pg['highlights'] for r in h.get('rows') or []}
    assert ans <= tiles
    if ans:
        card = {key(r) for r in secs['ixs-cells']['blocks'][1]['rows'][:6]}
        assert ans == card  # the lede, the tiles and the card: one set of six rows


def test_an_rna_test_is_named_by_its_denominator_in_one_place():
    """The page's rows carry no label of their own for a crosslink test: the question's class label is the one name
    in the tiles, the Overview and the tables, and it says what the fold is among."""
    text = (ROOT / 'sites' / 'methylarginine.yaml').read_text()
    page = text[text.index('\n  pages:\n') :]
    assert not re.search(r'\{analysis: crosslink, category: \w+, label:', page)
    tests = yaml.safe_load(text)['analyses']
    labels = {t['category']: t['label'] for a in tests if a['id'] == 'crosslink' for t in a['tests']}
    assert labels['rbrid_residue_among_measured'] == 'RNA-contact residue (RBR-ID), among arginines RBR-ID measured'
    assert labels['rbrid_residue'] == 'RNA-contact residue (RBR-ID), among all arginines of proteins with one'
    assert len(set(labels.values())) == len(labels)


def test_a_contact_under_two_angstroms_is_flagged_in_display_only():
    card = (ASSETS / 'kit-sitecard.js').read_text()
    page = (ASSETS / 'kit-interactions.js').read_text()
    assert 'CLASH_A = 2.0' in card and 'possible model clash' in card
    assert 'const contactClash = (b) => !!b && b.dist < CLASH_A' in card
    assert card.count('contactClash(b)') >= 2  # the phrase (and so the TSV) and the card's line
    assert 'K.card.contact.clash(x.best)' in page  # the list's distance cell
    # contactBest still returns the closest row: nothing is dropped
    assert 'if (!best || +r.distance < best.dist)' in card


def test_a_table_tile_names_no_top_row_and_counts_a_few_chips():
    page = (ASSETS / 'kit-interactions.js').read_text()
    assert 'Top: ' not in page
    assert 'b.chips && colIdx(t, b.chips) >= 0' in page and '.size <= 4' in page


def test_a_set_question_at_its_ceiling_says_so_and_keeps_the_chart_behind_a_toggle():
    kit = (ASSETS / 'kit.js').read_text()
    assert 'function ceilingLine(a, rows)' in kit
    assert 'top.eff < 0.9 * cap' in kit
    assert '<summary>Show the chart</summary>' in kit
    # no new statistic: the ceiling is all proteins over the marked ones, from the question's own counts
    assert 'total / marked' in kit


def test_the_overview_pointer_tile_links_the_page_when_it_has_no_tests():
    page = (ASSETS / 'kit-interactions.js').read_text()
    assert "ov.rows.length ? K.link(pg.id, 'overview') : K.link(pg.id)" in page
