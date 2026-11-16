"""Wherever an odds ratio is shown, the share in each group stands beside it ("22.8% vs 14.6%"), on screen, in the drawn
figure and as TSV columns; the statistics themselves are unchanged (kit.js sharePair, the IDR regions, the interactions forest)."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def test_the_share_pair_is_on_screen_in_the_figure_and_in_the_tsv():
    kit, idrs, ix = [(ASSETS / n).read_text() for n in ('kit.js', 'kit-idrs.js', 'kit-interactions.js')]
    assert 'const sharePair' in kit and 'K.sharePair = sharePair' in kit
    assert kit.count('shareSpan(r)') >= 2  # the tile rows and the question rows
    assert "'share_in_class', 'share_in_others'" in kit and "'share_in_set', 'share_in_others'" in kit
    assert 'within_protein_share_in_region' in idrs and 'K.sharePair(t)' in idrs
    assert "'share_in_group', 'share_in_others'" in ix and 'K.sharePair(r)' in ix
