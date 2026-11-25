"""The Filters sidebar lists every group and chip plainly; the header is one row off the Overview; level and cluster names are plain."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def test_the_filters_panel_is_the_plain_list_of_groups_and_chips():
    js = (ASSETS / 'kit-rail.js').read_text()
    for gone in ('data-rail-find', 'Find a filter', 'ptmc-fgroups-', 'CHIPS_SHOWN', 'chipRow(', 'data-fmore'):
        assert gone not in js, gone
    assert 'data-fgroup-clear' in js and 'rail-foot' in js


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
