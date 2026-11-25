"""The Filters sidebar is calm by default: group names only, a find box, the top 8 values, and the open groups kept."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def test_groups_are_collapsed_and_say_how_many_filters_are_active():
    js = (ASSETS / 'kit-rail.js').read_text()
    assert (
        '${n} active</span>' in js and ' of ${' not in js.split('function filtersTab')[1].split('function applyFind')[0]
    )
    assert 'data-rail-find' in js and 'Find a filter' in js
    # the selection bar says how many marks; the sidebar does not repeat it
    assert 'rail-foot' not in js


def test_open_groups_are_kept_per_explorer_behind_try_catch():
    js = (ASSETS / 'kit-rail.js').read_text()
    assert 'ptmc-fgroups-${D.site.id}' in js
    assert js.count('ptmc-fgroups-') == 2  # one read, one write
    assert 'R.autoOpened' in js  # a group with a filter in use starts open
    assert 'phone() && one' in js  # one open group at a time on a phone


def test_long_groups_show_eight_values_and_show_all():
    js = (ASSETS / 'kit-rail.js').read_text()
    assert 'CHIPS_SHOWN = 8' in js and 'Show all ${items.length}' in js
    assert js.count('chipRow(') >= 4  # the definition and the three chip lists
    assert 'fchip fmore' in js or '\'class="fchip fmore' in js or 'fchip fmore' in js.replace('\\', '')
    css = (ASSETS / 'kit.css').read_text()
    assert '.fchips:not(.all) > .fmore' in css


def test_the_header_is_one_row_on_a_wide_screen_off_the_overview():
    css = (ASSETS / 'kit.css').read_text()
    assert 'body.compact-phone:not(.slim) .hero .lede' in css and '.hero-stats' in css


def test_threshold_levels_can_carry_plain_words_and_clusters_are_named_plainly():
    select = (ASSETS / 'kit-select.js').read_text()
    rail = (ASSETS / 'kit-rail.js').read_text()
    assert 'K.levelText' in select and 'K.levelText(sp, v)' in rail  # one home for a level's words
    yaml = (Path(__file__).resolve().parents[1] / 'sites' / 'methylarginine.yaml').read_text()
    assert 'Dense patch of methylarginines' in yaml and 'Where the clusters sit' in yaml
    assert 'Clustering and crosstalk' not in yaml and 'Protein has a significant dense region' not in yaml
    for word in ('dtIDR', 'domain-tethered', 'domain flanks'):
        assert word not in yaml
