"""The cell and nucleus drawings open large in a <dialog> (Esc and × close it), with zoom (wheel, pinch, + and −) and pan; a click on
a part lists the proteins the maps place there, how many maps each, linked to their pages, the highlighted ones first (kit-cell.js)."""

from __future__ import annotations

from pathlib import Path

SRC = (Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets' / 'kit-cell.js').read_text()


def test_the_large_view_is_a_dialog_with_zoom_pan_and_a_protein_list():
    assert "document.createElement('dialog')" in SRC and 'showModal()' in SRC and 'data-cz="close"' in SRC
    assert (
        "'wheel'" in SRC
        and "'pointermove'" in SRC
        and 'data-cz="more"' in SRC
        and 'data-cz="less"' in SRC
        and 'data-cz="reset"' in SRC
    )
    assert 'data-cell-zoom' in SRC and 'function zoomList' in SRC and 'K.hl?.state()' in SRC and 'data-cz-page' in SRC
    assert 'const PER = 50' in SRC


def test_the_inline_labels_are_larger():
    assert '.cd-name{font-size:14px' in SRC and '.cd-val{font-size:13px' in SRC


def test_a_click_on_the_drawing_opens_it_large():
    from pathlib import Path

    js = (Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets' / 'kit-cell.js').read_text()
    assert "K.clicks.push(['.cell-draw svg, .cell-block svg, [data-cell-one] svg'" in js
