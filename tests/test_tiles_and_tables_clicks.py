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
    mini = src[src.index('function miniForest'):src.index('const range = rs')]
    assert 'class="trow pick" data-f="a:' in mini and 'data-v=' in mini and 'role="button"' in mini


def test_the_bound_histogram_tile_draws_at_the_tile_width():
    src = _js('kit-interactions.js')
    assert 'function histBody(b, ex, Wd = 760, H0 = 220, fz = 1)' in src
    tile = next(x for x in src.splitlines() if "case 'histogram': { const h = histData(b); if (!h) return loading(); const L" in x)
    m = re.search(r'histBody\(b, false, (\d+), (\d+), ([\d.]+)\)', tile)
    assert m and int(m.group(1)) <= 400 and float(m.group(3)) >= 1.2 and f'viewBox="0 0 {m.group(1)} ' in tile


def test_reported_by_is_gray_chips_one_per_line():
    js, css = _js('kit-sites.js'), _js('kit.css')
    assert 'xs.slice(0, 2)' in js and "startsWith('<a ')" in js and 'xs.length > 2' in js
    assert '.sites-tbl .src-tags > a' in css and 'flex-direction: column' in css and 'var(--surface-2)' in css
