"""Export figures keep labels apart: the funnel's point names avoid tick labels and cut the gridlines, a wrapped row
label of the protein map has a line pitch of more than its font size, and the regions figure sizes its bars to leave
room for the share and the count."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _place(pts, fixed, lines, frame):
    src = (ASSETS / 'kit-cell.js').read_text()
    a = src.index('  function placeFunnelNames(')
    b = src.index('  function funnelSvg(')
    code = (
        src[a:b]
        + f'\nconsole.log(JSON.stringify(placeFunnelNames({json.dumps(pts)}, {json.dumps(fixed)}, {json.dumps(lines)}, {json.dumps(frame)})));'
    )
    run = subprocess.run(['node', '-e', code], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    return json.loads(run.stdout)


def test_funnel_name_placer_leaves_no_overlap_on_a_crowded_set():
    # 40 points in a 300 x 120 frame, names 60 px wide: not all can be named, those that are never touch anything
    pts = [{'x': 20 + (i * 37) % 260, 'y': 15 + (i * 53) % 90, 'w': 60} for i in range(40)]
    fixed = [{'x': 100, 'y': 50, 'w': 40, 'h': 14}]
    lines = [[[0, 60], [300, 60]]]
    frame = {'x0': 0, 'y0': 0, 'x1': 300, 'y1': 120}
    got = _place(pts, fixed, lines, frame)
    assert got == _place(pts, fixed, lines, frame)  # deterministic
    boxes = [(c['x'], c['y'], c['x'] + 60, c['y'] + 13) for c in got if c]
    assert 5 < len(boxes) < 40
    for i, a in enumerate(boxes):
        assert a[0] >= 0 and a[2] <= 300 and a[1] >= 0 and a[3] <= 120
        for b in boxes[i + 1 :]:
            assert a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1]
        assert a[2] <= 100 or a[0] >= 140 or a[3] <= 50 or a[1] >= 64  # the fixed box
        assert a[3] <= 60 or a[1] >= 60  # the line
        for p in pts:  # no name covers a dot
            assert a[2] < p['x'] - 5 or a[0] > p['x'] + 5 or a[3] < p['y'] - 5 or a[1] > p['y'] + 5


def test_funnel_name_placer_takes_the_right_side_when_free_and_a_leader_when_boxed_in():
    frame = {'x0': 0, 'y0': 0, 'x1': 300, 'y1': 120}
    one = _place([{'x': 50, 'y': 60, 'w': 60}], [], [], frame)[0]
    assert one['a'] == 'start' and one['lead'] is None
    # a name too wide for the frame is dropped, not squeezed in
    assert _place([{'x': 50, 'y': 60, 'w': 400}], [], [], frame) == [None]
    # a name whose near places are taken by a wall of other dots goes further off, on a leader
    ring = [{'x': 50 + 14 * dx, 'y': 60 + 14 * dy, 'w': 60} for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
    got = _place([{'x': 50, 'y': 60, 'w': 20}] + [{**r, 'w': 1} for r in ring], [], [], frame)
    assert got[0] is None or got[0]['lead']


def test_funnel_names_keep_off_ticks_and_gridlines_are_cut_under_names():
    js = (ASSETS / 'kit-cell.js').read_text()
    # the tick labels, axis titles and reference labels are boxes the placer keeps clear of
    assert 'fixedBoxes.push(' in js and 'placeFunnelNames(' in js
    # the gridlines are drawn last, as segments with a gap under each name, not in the tick loops
    assert 'gridLines.push(' in js and 'names = []' in js
    loops = js[js.index('const fixedBoxes') : js.index('const drawn')]
    assert 'class="cb-grid"' not in loops


def test_wrapped_map_row_label_has_a_line_pitch_above_its_font_size():
    js = (ASSETS / 'kit-map.js').read_text()
    ys = re.findall(r'y="\$\{r1\(yMid ([-+]) ([\d.]+)\)\}" font-size="10" font-weight="600"', js)
    assert len(ys) == 2
    first, second = (float(f'{s}{v}') for s, v in ys)
    assert second - first >= 12  # a 10 px font's text box is about 11.5 px tall


def test_regions_figure_bars_leave_room_for_share_and_count():
    js = (ASSETS / 'kit-idrs.js').read_text()
    assert 'X.barW = Math.max(24, Math.min(X.barW, X.cnt - wCount - 10 - wShare - 6 - X.bar))' in js
