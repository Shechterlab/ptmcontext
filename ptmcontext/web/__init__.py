"""ptmc web: a static website for a site, from its run's outputs, the `website:` block of its site file and its
CITATION.cff.

Layout and behaviour are the kit's (assets/kit.css, assets/kit.js: the Methylarginine Site Explorer's look). A site
supplies only words, colours, type, an icon, a header picture, links and example searches; its citation, data sources,
version and date come from its CITATION.cff, so they are edited as text. The data are written into the page, so it
opens from a folder, GitHub Pages or a Zenodo archive alike. Two files are written: index.html with its assets/ (for
hosting), and <site>.html with everything inlined (one file, for sharing).
"""
from __future__ import annotations

import base64
import html
import json
import shutil
from importlib import resources
from pathlib import Path

from .. import __version__
from .. import layers as L
from .. import statistics as ST
from ..citation import kit_citation, site_citation
from ..profile import load_profile
from ..inputs import load as load_manifest
from ..site import code_commit, load_site, manifest_of, root_of

FONTS = {
    'heading': "'IBM Plex Serif', Georgia, 'Times New Roman', serif",
    'body': "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
    'mono': "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    'stylesheet': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Serif:wght@500;600;700'
                  '&family=Inter:wght@400;500;600;700&display=swap',
}
DEFAULT_BAND = ['#155e75', '#0f3b47']
DEFAULT_ACCENT, DEFAULT_ACCENT_DARK = '#c2410c', '#fb923c'


def _asset(name: str) -> Path:
    return Path(str(resources.files('ptmcontext') / 'web' / name))


def _rgb(hex_: str) -> tuple[float, float, float]:
    h = hex_.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def contrast(a: str, b: str) -> float:
    """WCAG 2.1 contrast ratio of two colours."""
    def lum(c):
        ch = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in _rgb(c)]
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _mix(hex_: str, other: str, t: float) -> str:
    a, b = _rgb(hex_), _rgb(other)
    return '#' + ''.join(f'{round((x * (1 - t) + y * t) * 255):02x}' for x, y in zip(a, b))


def default_art(profile, accent: str = '#fdba74') -> str:
    """A protein drawn as a line: two folded domains, a disordered stretch between them, and the mark's residues as
    lollipops, in the style of the methylarginine drawing (white lines, the marks in light orange)."""
    res = profile.residues[0]
    heads = [(200, 30), (222, 22), (246, 30), (270, 22), (338, 30)]
    wave = 'M170,70 ' + ' '.join(f'q6.5,{-9 if i % 2 == 0 else 9} 13,0' for i in range(10))
    sticks = ''.join(f'<line x1="{x}" y1="{63 if x < 300 else 57}" x2="{x}" y2="{y + 7}" stroke="currentColor"/>'
                     f'<circle cx="{x}" cy="{y}" r="7.5" fill="{accent}" stroke="none"/><text x="{x}" y="{y + 4.2}" text-anchor="middle" '
                     f'font-size="10" font-weight="700" fill="#0f172a" stroke="none">{html.escape(res)}</text>' for x, y in heads)
    words = profile.words
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 12 496 136" role="img" aria-label="A protein with folded domains, '
            f'a disordered region and {html.escape(words["marks"])}" font-family="Arial, Helvetica, sans-serif" stroke-width="1.6" '
            f'stroke-linecap="round" fill="none">'
            f'<line x1="20" y1="70" x2="60" y2="70" stroke="currentColor"/><rect x="60" y="56" width="110" height="28" rx="8" stroke="currentColor"/>'
            f'<path d="{wave}" stroke="currentColor"/><rect x="300" y="56" width="90" height="28" rx="8" stroke="currentColor"/>'
            f'<line x1="390" y1="70" x2="476" y2="70" stroke="currentColor"/>{sticks}'
            f'<g fill="currentColor" stroke="none" text-anchor="middle"><text x="115" y="104" font-size="11.5">folded domain</text>'
            f'<text x="235" y="104" font-size="11.5">disordered region</text><text x="345" y="104" font-size="11.5">folded domain</text>'
            f'<text x="248" y="128" font-size="14" font-weight="600">{html.escape(words["marks"].capitalize())}</text>'
            f'<text x="248" y="143" font-size="11.5">in folded domains and disordered regions</text></g></svg>')


def default_icon(band: str, accent: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="{band}"/>'
            f'<path d="M5,21 H11 M21,21 H27" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
            f'<rect x="11" y="17.5" width="10" height="7" rx="2" fill="none" stroke="#fff" stroke-width="2"/>'
            f'<line x1="16" y1="17.5" x2="16" y2="11" stroke="#fff" stroke-width="2"/><circle cx="16" cy="8.5" r="3.6" fill="{accent}"/></svg>')


def _labels(layer: L.Layer | None, profile) -> tuple[dict, dict]:
    """(labels, definitions) of a layer's categories: the layer's own, or for motifs the profile's families."""
    if layer is None:
        return {}, {}
    if layer.shape == 'flags':
        fams = profile.motif_families
        return ({f['name']: f.get('label', f['name'].replace('_', ' ')) for f in fams}, {f['name']: f.get('help', '') for f in fams})
    return dict(layer.labels), dict(layer.help)


def _fill(template: str, words: dict) -> str:
    w = {'marks': words['marks'], 'residues': words['residues'], 'marked': words['marked'], 'Marked': words['marked'].capitalize()}
    return template.format(**w) if template else ''


def human_date(iso: str) -> str:
    """2026-11-01 -> 1 November 2026."""
    import datetime as dt
    try:
        d = dt.date.fromisoformat(str(iso)[:10])
    except ValueError:
        return str(iso)
    return f'{d.day} {d.strftime("%B")} {d.year}'


def site_data(site: dict, folder: Path, profile) -> dict:
    stats = ST.read(folder / 'statistics.tsv')
    run = json.loads((folder / 'run.json').read_text())

    def num(v):
        try:
            return float(v) if v != '' else None
        except ValueError:
            return None
    rows = [{'analysis': r['analysis'], 'category': r['category'], 'method': r['method'],
             'a': int(r['a']), 'b': int(r['b']), 'c': int(r['c']), 'd': int(r['d']),
             'or': num(r['odds_ratio']), 'lo': num(r['odds_ratio_ci_low']), 'hi': num(r['odds_ratio_ci_high']),
             'p': num(r['p']), 'q': num(r['q']), 'strata': int(r['n_strata']) if r['n_strata'] else None}
            for r in stats.to_dict('records')]
    analyses = []
    for a in site['analyses']:
        layer = L.BUILT_IN.get(a['layer'])
        labels, helps = _labels(layer, profile)
        analyses.append({'id': a['id'], 'title': a.get('title') or (layer.title if layer else a['id']),
                         'question': a.get('question') or _fill(layer.question if layer else '', profile.words),
                         'sub': _fill(layer.sub if layer else '', profile.words), 'layer': a['layer'],
                         'describe': layer.describe if layer else '', 'labels': labels, 'help': helps})
    web = site['website']
    # each input by its name and version, and what this site uses it for
    entries = load_manifest(manifest_of(site))
    uses = {site['snapshot']['input']: 'sequences', site['marks']['input']: profile.words['marks'],
            **{name: role for role, name in site.get('inputs', {}).items()}}
    if site.get('reference', {}).get('statistics'):
        uses[site['reference']['statistics']] = 'checking the rebuild'
    inputs = {name: {'version': entries.get(name, {}).get('version', ''), 'licence': entries.get(name, {}).get('licence', ''),
                     'use': uses.get(name, '')} for name in run.get('inputs', {})}
    return {
        'inputs': inputs,
        'site': {'id': site['id'], 'name': web['name'], 'tagline': web.get('tagline', ''), 'examples': web.get('examples', []),
                 'lab': web.get('lab', {}).get('name', ''), 'config': f"sites/{site['id']}.yaml"},
        'words': {**profile.words, 'marked_long': profile.words.get('marked_long', profile.words['marked'])},
        'mark': profile.id, 'residues': profile.residues,
        'counts': {'marks': run['marks']['counted'], 'proteins': run['marks']['proteins']},
        'analyses': analyses, 'rows': rows, 'run': run,
        'citation': site_citation(site),
        'kit': {**kit_citation(), 'version': __version__, 'commit': run.get('code_commit') or code_commit()},
        'statistics_tsv': (folder / 'statistics.tsv').read_text(),
    }


def build(site_path: str | Path, out_root: str | Path | None = None, log=print) -> Path:
    site = load_site(site_path)
    if 'website' not in site:
        raise ValueError(f"{site_path}: no website block; add website: {{name: ...}} to the site file")
    web = site['website']
    profile = load_profile(site['mark'])
    root = root_of(site)
    folder = Path(out_root or root) / site['outputs']['folder']
    if not (folder / 'statistics.tsv').exists():
        raise FileNotFoundError(f'{folder}/statistics.tsv: run the site first (ptmc run {site_path})')
    out = folder / 'web'
    (out / 'assets').mkdir(parents=True, exist_ok=True)

    band = web.get('band', DEFAULT_BAND)
    accent, accent_dark = web.get('accent', DEFAULT_ACCENT), web.get('accent_dark', DEFAULT_ACCENT_DARK)
    for c in band:
        if contrast('#ffffff', c) < 4.5:
            log(f'  warning: white text on the band colour {c} has contrast {contrast("#ffffff", c):.1f}:1, under 4.5:1 (WCAG 1.4.3)')
    brand_ink = web.get('brand_ink', band[0])
    brand_ink_dark = web.get('brand_ink_dark', _mix(band[0], '#ffffff', 0.55))
    fonts = {**FONTS, **web.get('fonts', {})}
    theme = (f'--band-1: {band[0]}; --band-2: {band[1]}; --accent-l: {accent}; --accent-d: {accent_dark}; '
             f'--brand-ink-l: {brand_ink}; --brand-ink-d: {brand_ink_dark}; '
             f'--font-heading: {fonts["heading"]}; --font-body: {fonts["body"]}; --font-mono: {fonts["mono"]};')

    icon = (root / web['icon']).read_text() if web.get('icon') else default_icon(band[0], accent_dark)
    art = (root / web['art']).read_text() if web.get('art') else default_art(profile)
    logo = (root / web['lab']['logo']).read_text() if web.get('lab', {}).get('logo') else ''
    data = site_data(site, folder, profile)
    cit = data['citation']

    def page(inline: bool) -> str:
        icon_href = 'data:image/svg+xml;base64,' + base64.b64encode(icon.encode()).decode() if inline else 'assets/icon.svg'
        logo_href = 'data:image/svg+xml;base64,' + base64.b64encode(logo.encode()).decode() if inline else 'assets/lab.svg'
        lab = ''
        if web.get('lab'):
            lb = web['lab']
            img = f'<img src="{logo_href}" alt="" width="30" height="30">' if logo else ''
            lab = (f'<a class="brand-mark" href="{html.escape(lb.get("url", "#"))}" title="{html.escape(lb.get("name", ""))}">{img}'
                   f'<span>{html.escape(lb.get("name", ""))}<small>{html.escape(lb.get("affiliation", ""))}</small></span></a>')
        links = ''.join(f'<a href="{html.escape(x["url"])}">{html.escape(x["label"])}</a>' for x in web.get('links', []))
        pref = (cit or {}).get('preferred')
        if not cit:
            cite_html = ''
        elif pref:
            cite_html = (f'<p class="lede-cite">Please cite <a href="https://doi.org/{html.escape(pref["doi"])}">{html.escape(pref["short"])}</a>, '
                         f'and the original data sources (<a href="#method">how to cite</a>).</p>')
        else:
            cite_html = '<p class="lede-cite">Please cite the original data sources (<a href="#method">how to cite</a>).</p>'
        version = ''
        if cit:
            version = f'Version {html.escape(cit["version"])}' + (f' ({human_date(cit["date"])})' if cit.get('date') else '')
            if cit.get('doi'):
                version += (f' · <a class="doi-badge" href="https://doi.org/{html.escape(cit["doi"])}"><span>DOI</span>'
                            f'<span>{html.escape(cit["doi"])}</span></a>')
        version += f'{" · " if version else ""}<a href="#method">how it was made</a> · <a href="#statistics">download the data</a>'
        if inline:
            css = f'<style>{_asset("assets/kit.css").read_text()}</style>'
            js = f'<script>{_asset("assets/kit.js").read_text()}</script>'
        else:
            css, js = '<link rel="stylesheet" href="assets/kit.css">', '<script src="assets/kit.js"></script>'
        text = _asset('template.html').read_text()
        for key, value in {'{{NAME}}': html.escape(web['name']), '{{TAGLINE}}': html.escape(web.get('tagline', '')),
                           '{{ICON_HREF}}': icon_href, '{{THEME}}': theme, '{{ART}}': art, '{{LAB}}': lab,
                           '{{LINKS}}': links, '{{CITE}}': cite_html, '{{VERSION}}': version,
                           '{{FONTS}}': (f'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
                                         f'<link rel="stylesheet" href="{html.escape(fonts["stylesheet"])}">') if fonts.get('stylesheet') else '',
                           '<link rel="stylesheet" href="assets/kit.css">': css, '<script src="assets/kit.js"></script>': js,
                           '{{DATA}}': json.dumps(data, separators=(',', ':')).replace('</', '<\\/')}.items():
            text = text.replace(key, value)
        return text

    for name in ('kit.css', 'kit.js'):
        shutil.copyfile(_asset(f'assets/{name}'), out / 'assets' / name)
    (out / 'assets' / 'icon.svg').write_text(icon)
    if logo:
        (out / 'assets' / 'lab.svg').write_text(logo)
    (out / 'index.html').write_text(page(inline=False))
    (out / f'{site["id"]}.html').write_text(page(inline=True))
    log(f'  -> {out / "index.html"} (with assets/) and {out / (site["id"] + ".html")} (one file)')
    return out / 'index.html'
