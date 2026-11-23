"""Link previews: the image and the Open Graph tags that Slack, Teams, iMessage, LinkedIn and others read to draw a card
for a shared link (https://ogp.me/). `ptmc pages` writes one image per site (<id>/preview.png) and one for the landing
page (preview.png), from the same numbers as the landing cards, and puts the tags in each page's head. A link's part
after '#' never reaches the service that draws the card, so every link to a site shares that site's card.

The image needs Pillow; without it, the pages get the tags without an image."""

from __future__ import annotations

import html
import io
import re
from pathlib import Path

W, H = 1200, 630
FONTS = Path(__file__).parent / 'assets' / 'fonts' / 'pdf'


def _rgb(c: str | None, default: tuple[int, int, int]) -> tuple[int, int, int]:
    m = re.fullmatch(r'#?([0-9a-fA-F]{6})', (c or '').strip())
    if not m:
        return default
    v = m.group(1)
    return tuple(int(v[i : i + 2], 16) for i in (0, 2, 4))


def _vars(css: str) -> dict:
    return dict(re.findall(r'--(\w+):(#[0-9a-fA-F]{3,8})', css or ''))


def _num(n) -> str:
    try:
        return f'{int(n):,}'
    except (TypeError, ValueError):
        return str(n)


def _gradient(img, top, bottom):
    from PIL import ImageDraw

    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))


def _font(bold: bool, size: int):
    from PIL import ImageFont

    return ImageFont.truetype(str(FONTS / ('Inter-Bold.ttf' if bold else 'Inter-Regular.ttf')), size)


def _wrap(d, text: str, font, width: int, lines: int) -> list[str]:
    out, cur = [], ''
    for w in text.split():
        nxt = (cur + ' ' + w).strip()
        if d.textlength(nxt, font=font) <= width:
            cur = nxt
        else:
            out.append(cur)
            cur = w
    out.append(cur)
    out = [x for x in out if x]
    if len(out) > lines:
        out = out[:lines]
        out[-1] = out[-1].rstrip('.,;') + '…'
    return out


def _png(img) -> bytes:
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def site_image(card: dict, brand: str) -> bytes | None:
    """A site's preview: its band colors, name, one line on what it holds, and its numbers (the landing card's)."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    v = _vars(card.get('vars'))
    c1, c2 = _rgb(v.get('c1'), (30, 41, 59)), _rgb(v.get('c2'), (15, 23, 42))
    ac = _rgb(v.get('ac'), (194, 65, 12))
    img = Image.new('RGB', (W, H))
    _gradient(img, c1, c2)
    d = ImageDraw.Draw(img)
    x = 72
    d.text((x, 64), brand, font=_font(True, 30), fill=(255, 255, 255, 200))
    y = 150
    for line in _wrap(d, card.get('name', ''), _font(True, 66), W - 2 * x, 2):
        d.text((x, y), line, font=_font(True, 66), fill=(255, 255, 255))
        y += 80
    y += 10
    for line in _wrap(d, card.get('hook', ''), _font(False, 32), W - 2 * x, 2):
        d.text((x, y), line, font=_font(False, 32), fill=(226, 232, 240))
        y += 44
    nx = x
    for value, label in (card.get('nums') or [])[:3]:
        if value is None:
            continue
        big, small = _num(value), str(label)
        d.text((nx, 430), big, font=_font(True, 72), fill=(255, 255, 255))
        d.text((nx, 518), small, font=_font(False, 30), fill=(226, 232, 240))
        nx += max(d.textlength(big, font=_font(True, 72)), d.textlength(small, font=_font(False, 30))) + 80
    d.rectangle([0, H - 14, W, H], fill=ac)
    return _png(img)


def landing_image(cards: list[dict], title: str, lede: str) -> bytes | None:
    """The landing page's preview: its title and line, and one tile per listed site with its first number."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    img = Image.new('RGB', (W, H))
    _gradient(img, (30, 41, 59), (15, 23, 42))
    d = ImageDraw.Draw(img)
    x = 64
    d.text((x, 56), title, font=_font(True, 64), fill=(255, 255, 255))
    for i, line in enumerate(_wrap(d, lede, _font(False, 32), W - 2 * x, 2)):
        d.text((x, 140 + 44 * i), line, font=_font(False, 32), fill=(226, 232, 240))
    live = [c for c in cards if c.get('href')][:4]
    if live:
        gap = 24
        tw = (W - 2 * x - gap * (len(live) - 1)) / len(live)
        for i, c in enumerate(live):
            v = _vars(c.get('vars'))
            c1, ac = _rgb(v.get('c1'), (51, 65, 85)), _rgb(v.get('ac'), (194, 65, 12))
            lx, t = x + i * (tw + gap), 270
            d.rounded_rectangle([lx, t, lx + tw, t + 290], radius=18, fill=c1)
            d.rectangle([lx, t + 276, lx + tw, t + 290], fill=ac)
            # the name in up to three lines, its size cut until its longest word fits the tile
            name, size = c.get('name', ''), 30
            while size > 16 and max(d.textlength(w, font=_font(True, size)) for w in name.split() or ['']) > tw - 40:
                size -= 1
            ty = t + 22
            for line in _wrap(d, name, _font(True, size), tw - 40, 3):
                d.text((lx + 22, ty), line, font=_font(True, size), fill=(255, 255, 255))
                ty += round(size * 1.25)
            nums = [n for n in (c.get('nums') or []) if n[0] is not None]
            if nums:
                d.text((lx + 22, t + 150), _num(nums[0][0]), font=_font(True, 52), fill=(255, 255, 255))
                d.text((lx + 22, t + 214), str(nums[0][1]), font=_font(False, 26), fill=(226, 232, 240))
    return _png(img)


def tags(title: str, description: str, url: str | None, image: str | None, site_name: str) -> str:
    """The Open Graph and Twitter card tags for a page's head; with no base url, only those that need none."""
    e = html.escape
    # a description that already starts with the title is not prefixed with it again
    alt = description if re.match(re.escape(title) + r'(?!\w)', description, re.I) else f'{title}: {description}'
    out = [
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{e(site_name)}">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(description)}">',
    ]
    if url:
        out.append(f'<meta property="og:url" content="{e(url)}">')
    if url and image:
        out += [
            f'<meta property="og:image" content="{e(image)}">',
            f'<meta property="og:image:width" content="{W}">',
            f'<meta property="og:image:height" content="{H}">',
            f'<meta property="og:image:alt" content="{e(alt)}">',
            '<meta name="twitter:card" content="summary_large_image">',
            f'<meta name="twitter:image" content="{e(image)}">',
        ]
    else:
        out.append('<meta name="twitter:card" content="summary">')
    return ''.join(out)


def put_in_head(page: Path, head: str) -> None:
    """Put `head` just before the page's </head> (once: a rebuilt page gets its tags replaced, not repeated)."""
    text = page.read_text()
    text = re.sub(r'<!-- link preview -->.*?<!-- /link preview -->', '', text, flags=re.S)
    text = text.replace('</head>', f'<!-- link preview -->{head}<!-- /link preview --></head>', 1)
    page.write_text(text)
