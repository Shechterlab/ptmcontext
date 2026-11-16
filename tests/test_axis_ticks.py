"""Axis labels that would overlap are thinned (kit.js thinTicks), the 1× always kept; the page does it by what the
browser measures (thinAxesDom), the exports by the text measure. Run under Node with a fixed-width text measure."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

KIT = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets' / 'kit.js'


def _thin(items, width, size=10, gap=5):
    src = KIT.read_text()
    a = src.index('  function thinTicks(')
    b = src.index('  // on the page: the axis labels of a chart or a tile')
    code = (
        'const tw = (t, size) => t.length * size * 0.6;\n'
        + src[a:b]
        + f'\nconsole.log(JSON.stringify(thinTicks({json.dumps(items)}, {width}, {size}, {gap}).map(t => t.lab)));'
    )
    run = subprocess.run(['node', '-e', code], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    return json.loads(run.stdout)


def _ticks(labs, xs):
    return [{'x': x, 'lab': lab} for lab, x in zip(labs, xs)]


def test_overlapping_labels_are_dropped_and_the_one_stays():
    # "0.4×1×2.5×" on a narrow card: 6 px a character, 100 px wide, labels at 20%, 50% and 80% do not touch
    t = _ticks(['0.4×', '1×', '2.5×'], [0.2, 0.5, 0.8])
    assert _thin(t, 200) == ['0.4×', '1×', '2.5×']
    assert _thin(t, 70) == ['1×']  # 21 px between centres, 23 needed
    assert '1×' in _thin(t, 40)
    # "1×1.25×": the neighbours of the 1× go first
    u = _ticks(['1×', '1.25×', '1.5×'], [0.5, 0.58, 0.66])
    got = _thin(u, 120)
    assert got[0] == '1×' and len(got) < 3
    # no two kept labels touch: every pair is a gap apart
    many = _ticks([f'{v}×' for v in ('0.25', '0.4', '0.6', '1', '1.5', '2.5', '4')], [i / 6 for i in range(7)])
    kept = _thin(many, 150, 10, 5)
    assert '1×' in kept and len(kept) < 7


def test_the_page_and_the_export_both_thin_their_axis():
    src = KIT.read_text()
    assert 'thinTicks(M.axis.ticks, X1 - X0, 10)' in src  # the SVG, PNG and PDF exports
    assert "querySelectorAll('.qaxis .ticks, .fr-ax .tk')" in src  # the card on the page, at its drawn width


def test_rows_of_a_question_of_tests_are_coded_by_stratum():
    # the page reads the statistics table itself: a test repeated on a stratum is the class <category>_<stratum>, as the build codes it,
    # so "Any interface" in three strata is three rows with three labels
    src = KIT.read_text()
    assert "category: coded ? `${g('category')}_${g('stratum')}` : g('category')" in src
