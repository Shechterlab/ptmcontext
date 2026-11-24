"""A protein set is read by its own hypergeometric row: one test gives the fold, the q and the direction. The test within
abundance deciles is an estimate for the hover (r.est), never the headline, the q, the dot or the order."""

import re
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _kit() -> str:
    return (ASSETS / 'kit.js').read_text()


def test_the_estimate_within_deciles_never_sets_the_reading():
    src = _kit()
    # the attach step no longer rewrites a row's direction, effect or q
    attach = re.search(r'if \(st && st\.eff != null\) r\.est = st;', src)
    assert attach, 'the within-deciles row is attached as an estimate only'
    assert 'r.adj' not in src


def test_one_helper_gives_the_reading_and_says_it_is_not_adjusted():
    src = _kit()
    assert 'K.setReading' in src and 'K.readingOf' in src
    assert "measure: 'fold enrichment'" in src and 'adjusted: false' in src
    assert 'Not adjusted for protein abundance; abundant proteins have more detected sites.' in src
    assert "'proteins, hypergeometric'" in src


def test_other_views_take_a_sets_reading_from_the_helper():
    for name in ('kit-pcards.js', 'kit-pfolds.js', 'kit-tables.js'):
        assert 'K.setReading' in (ASSETS / name).read_text() or 'K.readingOf' in (ASSETS / name).read_text(), name
