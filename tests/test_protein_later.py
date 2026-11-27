"""A large protein page draws a closed section with a long body only when it is opened (kit-proteins.js): the section keeps its
title and summary, its body waits empty (data-later), opening it (or Open all, or the page's PDF and print) draws it, and the
modules that refill a section's body leave a waiting one alone. The link check opens those sections to check their links."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def _src(name):
    return (ASSETS / name).read_text()


def test_a_long_closed_section_waits_and_is_drawn_when_opened():
    s = _src('kit-proteins.js')
    assert 'later = !o && body.length > LATER_CHARS' in s
    assert "<div class=\"pfold-body\"${later ? ' data-later' : ''}>${later ? '' : body}</div>" in s
    assert "d.querySelector?.(':scope > .pfold-body[data-later]')" in s and 'setTimeout(drawOpened, 0)' in s
    assert 'K.drawOpenFolds = drawOpened' in s


def test_pdf_and_print_draw_the_waiting_sections_and_modules_leave_them_alone():
    assert _src('kit-export.js').count('K.drawOpenFolds?.()') == 2
    assert "host.hasAttribute('data-later')" in _src('kit-sitetable.js')
    assert "body.hasAttribute('data-later')" in _src('kit-conserve.js')
    assert "el.hasAttribute('data-later')" in _src('kit-prna.js')


def test_the_link_check_opens_the_waiting_sections():
    s = (ROOT / 'tools' / 'audit' / 'links.js').read_text()
    assert 'window.PTMC.drawOpenFolds()' in s and "opt('later-links') || 150" in s


def test_the_maps_change_labels_follow_the_pages_numbering():
    # a histone's TCGA, DepMap and variant labels arrive in UniProt numbering ("R46G"); the map shows them as its sites ("R45G")
    s = _src('kit-map.js')
    assert 'const renum = (q, lab) =>' in s
    assert "xs.map((x) => renum(x[1], x[4]) + (x[5] > 1 ? ` ×${x[5]}` : '')).join(', ')" in s
    assert s.count('renum(x[1], x[4])') >= 5
