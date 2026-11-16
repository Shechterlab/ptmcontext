"""Export figures keep labels apart: the funnel's point names avoid tick labels and cut the gridlines, a wrapped row
label of the protein map has a line pitch of more than its font size, and the regions figure sizes its bars to leave
room for the share and the count."""

from __future__ import annotations

import re
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def test_funnel_names_keep_off_ticks_and_gridlines_are_cut_under_names():
    js = (ASSETS / 'kit-cell.js').read_text()
    assert 'tickBoxes.some((o) => hit(box, o))' in js
    # the gridlines are drawn last, as segments with a gap under each name, not in the tick loops
    assert 'gridLines.push(' in js and 'const names = placed.slice(pts.length)' in js
    loops = js[js.index('const tickBoxes') : js.index('const drawn')]
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
