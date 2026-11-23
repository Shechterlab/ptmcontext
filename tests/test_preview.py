"""Link previews (ptmcontext/web/preview.py): the Open Graph tags and the images ptmc pages writes."""

import re

import pytest

from ptmcontext.web import preview as PV

CARD = {
    'id': 'x',
    'href': 'x/',
    'name': 'Example Site Explorer',
    'hook': 'Example sites from public databases.',
    'nums': [(1234, 'sites'), (56, 'proteins')],
    'vars': '--c1:#155e75;--c2:#0f3b47;--ac:#c2410c',
}


def test_tags_with_and_without_a_base_url():
    full = PV.tags('T', 'D', 'https://h/x/', 'https://h/x/preview.png', 'B')
    assert 'og:image" content="https://h/x/preview.png"' in full and 'summary_large_image' in full
    bare = PV.tags('T', 'D', None, None, 'B')
    assert 'og:title' in bare and 'og:image' not in bare and 'og:url' not in bare


def test_the_image_alt_does_not_repeat_the_title():
    def alt(t, d):
        return re.search(r'og:image:alt" content="([^"]*)"', PV.tags(t, d, 'https://h/', 'https://h/p.png', 'B')).group(
            1
        )

    assert alt('PTMcontext', 'PTMcontext: analysis tools.') == 'PTMcontext: analysis tools.'
    assert alt('Site', 'Sites from databases.') == 'Site: Sites from databases.'


def test_put_in_head_replaces_rather_than_repeats(tmp_path):
    page = tmp_path / 'index.html'
    page.write_text('<html><head><title>t</title></head><body></body></html>')
    PV.put_in_head(page, PV.tags('A', 'D', None, None, 'B'))
    PV.put_in_head(page, PV.tags('Z', 'D', None, None, 'B'))
    text = page.read_text()
    assert text.count('og:title') == 1 and 'content="Z"' in text and text.index('og:title') < text.index('</head>')


def test_images_are_1200_by_630():
    Image = pytest.importorskip('PIL.Image')
    import io

    for png in (PV.site_image(CARD, 'B'), PV.landing_image([CARD, CARD], 'B', 'Line')):
        assert Image.open(io.BytesIO(png)).size == (PV.W, PV.H)
