"""Clicks and looks of the tile rows and the Sites/Proteins tables, checked in the kit's source (no browser here)."""

from __future__ import annotations

import re
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _js(name):
    return (ASSETS / name).read_text()


def test_a_page_tile_opens_inside_a_folded_section():
    # the tile sits in a section fold (<details>): its click guard must only skip links and rows inside the tile itself
    src = _js('kit-interactions.js')
    line = next(x for x in src.splitlines() if "['[data-ix-tile]'" in x)
    assert 'el.contains(inner)' in line and "closest('a,button,summary,details,[data-f]')" in line


def test_a_page_tile_row_selects_like_the_overviews():
    src = _js('kit-interactions.js')
    mini = src[src.index('function miniForest') : src.index('const range = rs')]
    assert 'class="trow pick" data-f="a:' in mini and 'data-v=' in mini and 'role="button"' in mini


def test_the_bound_histogram_tile_draws_at_the_tile_width():
    src = _js('kit-interactions.js')
    assert 'function histBody(b, ex, Wd = 760, H0 = 220, fz = 1)' in src
    tile = next(
        x
        for x in src.splitlines()
        if "case 'histogram': { const h = histData(b); if (!h) return loading(); const L" in x
    )
    m = re.search(r'histBody\(b, false, (\d+), (\d+), ([\d.]+)\)', tile)
    assert m and int(m.group(1)) <= 400 and float(m.group(3)) >= 1.2 and f'viewBox="0 0 {m.group(1)} ' in tile


def test_reported_by_is_gray_chips_one_per_line():
    js, css = _js('kit-sites.js'), _js('kit.css')
    assert 'xs.slice(0, 2)' in js and "startsWith('<a ')" in js and 'xs.length > 2' in js
    assert '.sites-tbl .src-tags > a' in css and 'flex-direction: column' in css and 'var(--surface-2)' in css


def test_the_figure_panels_page_is_registered_and_gives_the_sites_page_its_button():
    from ptmcontext import web

    assert 'kit-figures.js' in web.MODULES and web.MODULES.index('kit-figures.js') < web.MODULES.index('kit.js')
    fig, tables, sites = _js('kit-figures.js'), _js('kit-tables.js'), _js('kit-sites.js')
    assert 'K.views.figures = ' in fig and 'if (!K.logoPanel) return;' in fig
    assert 'K.views.figures ?' in tables and 'Make figures' in tables and 'K.tables.figuresBtn()' in sites
    assert 'K.logoPanel = ' in _js('kit-conserve.js')


def test_the_proteins_table_follows_the_explorers_defaults():
    import yaml

    cols = yaml.safe_load((Path(__file__).resolve().parents[1] / 'sites' / 'methylarginine.yaml').read_text())[
        'website'
    ]['proteins']['columns']
    by = {c['id']: c for c in cols}
    assert by['map'].get('fixed') and not by['map'].get('default')
    assert [i for i in by if by[i].get('default')] == ['ix', 'idr', 'cond', 'density']
    assert not by['loc'].get('default') and not by['len'].get('default') and not by['share'].get('default')
    assert "K.density.defaults.proteins = 'comfortable'" in _js('kit-tables.js')


def test_default_columns_follow_the_defaults_while_the_data_arrives():
    js = _js('kit-columns.js')
    assert 'untouched' in js and 'delete state[table]' in js and 'untouched.delete(t)' in js


def test_a_sidebar_jump_opens_every_fold_around_its_section():
    # protein-page sections sit inside closed group folds; opening only the section left nothing to scroll to
    js = _js('kit-rail.js')
    assert "d = d.parentElement?.closest('details')" in js


def test_the_sidebar_tabs_keep_the_filter_count_on_one_line():
    css = (Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets' / 'kit.css').read_text()
    assert '.rail-head .seg button { flex: 1; font-weight: 600; white-space: nowrap; }' in css
    assert '.rail-head { display: flex; flex-wrap: wrap;' in css


def test_the_sidebar_lists_every_page_with_the_current_ones_sections():
    js = _js('kit-rail.js')
    assert "document.querySelectorAll('#tabs a.tab')" in js and 'toc-secs' in js
    # a jump from the drawer closes it, and focus goes back to the opener without scrolling the page back up
    assert 'if (R.open && !pinned()) { R.open = false; rail(); }' in js
    assert 'focus({ preventScroll: true })' in js
