"""The landing page of `ptmc pages`: one card per site, each a door into that site.

Every word and choice comes from YAML: a card from the site file (`website.name`, `band`, `accent`, `art`,
`landing.tagline`, `landing.question`, `landing.cta`, `landing.label`, `website.stats`) and the numbers and the one
striking result from the site's own build (`run.json`, `web/glance.json`); the page's title, intro, footer links and
the cards of sites not built yet (`soon`) from a landing config (`ptmc pages --landing`, else `landing.yml` beside the
first site file). See CONTRACTS.md, "The landing page".
"""

from __future__ import annotations

import html
import math
import re
from pathlib import Path

import yaml

_COLOUR = re.compile(r'^#[0-9a-fA-F]{3,8}$')

SEARCH_JS = (Path(__file__).parent / 'assets' / 'land-search.js').read_text()
SEARCH_HTML = (
    '<section class="land-search" role="search" aria-label="Find a protein">'
    '<label for="land-q">Find a protein</label>'
    '<input id="land-q" type="search" autocomplete="off" spellcheck="false" placeholder="Gene name or UniProt accession" '
    'aria-controls="land-hits">'
    '<p class="say" id="land-say" role="status"></p><ul id="land-hits" aria-label="Proteins found"></ul></section>'
)

CSS = """
.land-search { max-width: 46rem; padding-block: 1rem 0; display: grid; gap: 0.4rem; }
.land-search label { font-weight: 600; }
.land-search input { font: inherit; padding: 0.55rem 0.8rem; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); color: var(--ink); width: 100%; box-sizing: border-box; }
.land-search .say { margin: 0; color: var(--muted); font-size: 0.88rem; min-height: 1.2em; }
.land-search ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
.land-search li { display: flex; flex-wrap: wrap; gap: 0.2rem 1rem; justify-content: space-between; padding: 0.45rem 0.7rem; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.land-search .hit-sites { display: inline-flex; flex-wrap: wrap; gap: 0.2rem 0.7rem; }
.land-search .muted { color: var(--muted); }
.land-intro { max-width: 46rem; padding-block: 1.5rem 0.25rem; display: grid; gap: 0.5rem; color: var(--ink-2); font-size: 1.02rem; line-height: 1.55; }
.land-intro p { margin: 0; }
.land-intro p:first-child { color: var(--ink); font-size: 1.15rem; }
.sites { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(26rem, 100%), 1fr)); gap: 1.25rem; padding: 1rem 0 1.5rem; list-style: none; margin: 0; }
.sites > li { display: flex; }
.sites > li > .land-card { flex: 1; min-width: 0; }
.land-group { padding-block: 1rem 0; }
.land-group > h2 { margin: 0.5rem 0 0; font-size: 1.15rem; }
.land-group > p { margin: 0.2rem 0 0; color: var(--ink-2); }
.sites.compact { grid-template-columns: repeat(auto-fill, minmax(min(20rem, 100%), 1fr)); }
.sites.compact .art { display: none; }
.sites.compact .band { min-height: 5.5rem; }
.sites.compact .land-card h2 { font-size: 1.1rem; }
.sites.compact .land-card .hook { font-size: 0.95rem; }
.land-card { --c1: var(--band-1); --c2: var(--band-2); --ac: var(--accent-l); --acd: var(--accent-d); position: relative; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; box-shadow: var(--shadow); color: var(--ink); transition: transform 0.18s ease, box-shadow 0.18s ease; }
.land-card.live:hover { transform: translateY(-4px); box-shadow: var(--shadow-hover); }
.land-card.live:has(a:focus-visible) { outline: 3px solid var(--ac); outline-offset: 3px; }
.land-card .band { position: relative; display: flex; flex-direction: column; justify-content: flex-end; gap: 0.35rem; min-height: 11rem; padding: 0.9rem 1.1rem 0.9rem; background: linear-gradient(160deg, var(--c1), var(--c2)); border-bottom: 4px solid var(--ac); color: #fff; }
.land-card .art { height: 6.8rem; color: rgba(255, 255, 255, 0.88); }
.land-card .art svg { display: block; width: 100%; height: 100%; }
.land-card h2 { margin: 0; display: flex; align-items: center; gap: 0.6rem; font-size: 1.3rem; line-height: 1.2; }
.land-card .card-logo { flex: none; width: 36px; height: 36px; border-radius: 8px; }
.land-title { display: flex; align-items: center; gap: 0.7rem; }
.land-card h2 a { color: #fff; text-decoration: none; }
.land-card h2 a::after { content: ''; position: absolute; inset: 0; z-index: 1; }
.land-card .badge { position: absolute; top: 0.8rem; right: 0.8rem; padding: 0.15rem 0.65rem; border-radius: 999px; background: rgba(255, 255, 255, 0.18); border: 1px solid rgba(255, 255, 255, 0.55); font-size: 0.78rem; font-weight: 600; letter-spacing: 0.02em; }
.land-card .body { flex: 1; display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.1rem 1.1rem; font-size: 0.95rem; }
.land-card .body p { margin: 0; }
.land-card .hook { font-weight: 600; font-size: 1.02rem; }
.land-card .ask { color: var(--ink-2); font-style: italic; }
.land-card .nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr)); gap: 0.5rem; margin: 0; padding: 0.6rem 0; border-block: 1px solid var(--line); }
.land-card .nums div { display: flex; flex-direction: column; justify-content: flex-start; gap: 0.1rem; }
.land-card .nums dd { margin: 0; order: -1; font-family: var(--font-heading); font-size: 1.45rem; font-weight: 700; line-height: 1.1; }
.land-card .nums dt { color: var(--muted); font-size: 0.8rem; }
.land-card .result { display: grid; gap: 0.3rem; color: var(--ink-2); font-size: 0.88rem; }
.land-card .result small { color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
.land-card .result .rbar { display: block; position: relative; height: 0.5rem; border-radius: 999px; background: var(--surface-2); }
.land-card .result .rbar::before { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--line-strong); }
.land-card .result .rbar i { position: absolute; top: 0; bottom: 0; border-radius: 999px; background: var(--ac); }
.land-card .result .rbar i.less { background: var(--muted); }
.land-card .cta { margin-top: auto; align-self: flex-start; display: inline-flex; align-items: center; min-height: 44px; padding: 0.55rem 1.1rem; border-radius: 999px; background: var(--c1); color: #fff; font-weight: 600; transition: transform 0.18s ease; }
.land-card.live:hover .cta { transform: translateX(3px); }
.land-card.soon { background: var(--surface-2); box-shadow: none; }
.land-card.soon .band { filter: saturate(0.8); }
.land-card.soon .cta { background: transparent; color: var(--muted); border: 1px dashed var(--line-strong); }
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) .land-card .cta { background: var(--acd); color: #111; } :root:not([data-theme='light']) .land-card.soon .cta { background: transparent; color: var(--muted); } }
:root[data-theme='dark'] .land-card .cta { background: var(--acd); color: #111; }
:root[data-theme='dark'] .land-card.soon .cta { background: transparent; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .land-card, .land-card .cta { transition: none; } .land-card.live:hover, .land-card.live:hover .cta { transform: none; } }
.land-foot { margin-top: 2rem; padding-block: 1.25rem 2.5rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.88rem; display: grid; gap: 0.5rem; }
.land-foot p, .land-foot ul { max-width: 62rem; margin: 0; }
.land-foot ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1.25rem; font-size: 0.95rem; }
.land-foot a { display: inline-block; min-height: 24px; }
.hero :focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
"""


def load_config(path: str | Path | None, first_site: str | Path | None = None) -> dict:
    """The landing config: the given file, else landing.yml beside the first site file, else nothing."""
    if path is None and first_site is not None:
        beside = Path(first_site).parent / 'landing.yml'
        path = beside if beside.exists() else None
    return (yaml.safe_load(Path(path).read_text()) or {}) if path else {}


def _colour(value, default: str | None) -> str | None:
    return value if isinstance(value, str) and _COLOUR.match(value) else default


def _vars(band, accent, accent_dark) -> str:
    out = []
    for name, v in (
        ('c1', band[0] if band else None),
        ('c2', band[1] if band else None),
        ('ac', accent),
        ('acd', accent_dark),
    ):
        v = _colour(v, None)
        if v:
            out.append(f'--{name}:{v}')
    return ';'.join(out)


def _number(n) -> str:
    return f'{n:,}' if isinstance(n, int) else html.escape(str(n))


def _result(gl: dict) -> str:
    """The site's strongest finding as a sentence with a small bar (the odds ratio on a log axis, centred on 1×)."""
    fs = (gl or {}).get('landing_findings') or (gl or {}).get('findings') or []
    if not fs:
        return ''
    f = fs[0]
    e = f['eff']
    w = min(1, abs(math.log2(e)) / 4) * 50
    vtxt = (
        '> 1,000'
        if e >= 1000
        else format(e, '.0f')
        if e >= 10
        else format(e, '.1f')
        if e >= 1.2
        else format(e, '.2f')
        if e >= 0.01
        else '< 0.01'
    )
    more = f['dir'] == 'more'
    side = 'left' if more else 'right'
    return (
        f'<p class="result"><small>Strongest result</small><span><b>{html.escape(f["label"])}</b>: {vtxt}× '
        f'{"more" if more else "less"} often</span>'
        f'<span class="rbar" role="img" aria-label="{vtxt} times {"more" if more else "less"} often"><i class="{f["dir"]}" style="{side}:50%;width:{w:.0f}%"></i></span></p>'
    )


def card(c: dict, cfg: dict) -> str:
    """One card. `c`: id, name, hook, question, nums [(value, label)], result (html), art (svg text), vars (css), cta,
    href (None for a site not built yet), badge."""
    live = bool(c.get('href'))
    name = html.escape(c['name'])
    sid = html.escape(c['id'])
    title = f'<a href="{html.escape(c["href"])}">{name}</a>' if live else name
    art = f'<div class="art" aria-hidden="true">{c["art"]}</div>' if c.get('art') else ''
    logo = (
        f'<img class="card-logo" src="{html.escape(c["logo"])}" alt="" width="36" height="36">' if c.get('logo') else ''
    )
    badge = f'<span class="badge">{html.escape(c["badge"])}</span>' if c.get('badge') else ''
    nums = ''.join(f'<div><dt>{html.escape(str(k))}</dt><dd>{_number(v)}</dd></div>' for v, k in c.get('nums') or [])
    arrow = html.escape(c['cta'])
    off = '' if live else ' aria-disabled="true"'
    return (
        f'<li><article class="land-card {"live" if live else "soon"}" id="{sid}" aria-labelledby="card-{sid}" style="{c.get("vars", "")}">'
        f'<div class="band">{badge}{art}<h2 id="card-{sid}">{logo}{title}</h2></div><div class="body">'
        + (f'<p class="hook">{html.escape(c["hook"])}</p>' if c.get('hook') else '')
        + (f'<p class="ask">{html.escape(c["question"])}</p>' if c.get('question') else '')
        + (f'<dl class="nums">{nums}</dl>' if nums else '')
        + c.get('result', '')
        + f'<span class="cta"{off}>{arrow}</span></div></article></li>'
    )


def soon_card(s: dict, cfg: dict) -> dict:
    band = [_colour(x, None) for x in (s.get('band') or [])][:2]
    return {
        'id': s['id'],
        'name': s.get('name') or s['id'],
        'hook': s.get('tagline'),
        'question': s.get('question'),
        'art': Path(s['art']).read_text() if s.get('art') and Path(s['art']).exists() else '',
        'vars': _vars(
            band if len(band) == 2 and all(band) else None, s.get('accent'), s.get('accent_dark') or s.get('accent')
        ),
        'group': s.get('group'),
        'badge': s.get('badge') or cfg.get('soon_label') or 'Coming soon',
        'cta': s.get('cta') or cfg.get('soon_cta') or 'In preparation',
        'nums': [],
    }


def ordered(cards: list[dict], cfg: dict) -> list[dict]:
    """The config's `order` (ids) first, the rest as built."""
    order = [str(x) for x in cfg.get('order') or []]
    rank = {k: i for i, k in enumerate(order)}
    return sorted(cards, key=lambda c: rank.get(c['id'], len(rank)))


def page(
    cards: list[dict],
    cfg: dict,
    *,
    kit_css: str | None,
    lab_html: str,
    fonts_css: str,
    built_with: str,
    logo: str | None = None,
    search: bool = False,
) -> str:
    title = html.escape(cfg.get('title') or 'ptmcontext')
    desc = html.escape(cfg.get('description') or '')
    lede = html.escape(cfg.get('lede') or '')
    intro = ''.join(f'<p>{html.escape(p)}</p>' for p in cfg.get('intro') or [])
    links = ''.join(
        f'<li><a href="{html.escape(x["url"])}">{html.escape(x["label"])}</a></li>'
        for x in (cfg.get('footer') or {}).get('links') or []
    )
    note = (cfg.get('footer') or {}).get('note')
    groups = [g for g in cfg.get('groups') or [] if g.get('id')] or [{'id': None}]
    ids = {g['id'] for g in groups}
    sections = ''
    for k, g in enumerate(groups):
        # a card belongs to the group its site file names (landing.group); without one, to the first group
        mine = [c for c in ordered(cards, cfg) if c.get('group') == g['id'] or (k == 0 and c.get('group') not in ids)]
        if not mine:
            continue
        head = (
            f'<h2>{html.escape(g["title"])}</h2>' + (f'<p>{html.escape(g["note"])}</p>' if g.get('note') else '')
            if g.get('title')
            else ''
        )
        sections += (
            f'<section class="land-group"{" aria-labelledby=" + chr(34) + "grp-" + html.escape(str(g["id"])) + chr(34) if head else ""}>'
            + head.replace('<h2>', f'<h2 id="grp-{html.escape(str(g["id"]))}">', 1)
            + f'<ul class="sites{" compact" if g.get("compact") else ""}">'
            + ''.join(card(c, cfg) for c in mine)
            + '</ul></section>'
        )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
{f'<link rel="icon" href="{html.escape(logo)}">' if logo else ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{html.escape(fonts_css)}">
{f'<link rel="stylesheet" href="{html.escape(kit_css)}">' if kit_css else ''}
<style>{CSS}</style></head>
<body><a class="skip" href="#sites">Skip to the sites</a>
<header class="hero"><div class="wrap"><div class="brand"><h1{' class="land-title"' if logo else ''}>{f'<img class="site-mark" src="{html.escape(logo)}" alt="" width="52" height="52">' if logo else ''}{title}</h1><div class="brand-side">{lab_html}</div></div>
{f'<div class="lede"><p class="lede-what">{lede}</p></div>' if lede else ''}</div></header>
<main class="wrap" id="sites">
{f'<section class="land-intro" aria-label="About">{intro}</section>' if intro else ''}
{SEARCH_HTML if search else ''}
<h2 class="vh">The sites</h2>
{sections}</main>
<footer class="wrap land-foot">{f'<ul aria-label="Citation and code">{links}</ul>' if links else ''}{f'<p>{html.escape(note)}</p>' if note else ''}
<p>{built_with}</p>
<p>No cookies, no tracking: every test runs in your browser, and nothing you search or select leaves it.</p></footer>{f'<script>{SEARCH_JS}</script>' if search else ''}</body></html>
"""
