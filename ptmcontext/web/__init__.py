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
import math
import shutil
from importlib import resources
from pathlib import Path

from .. import __version__
from .. import layers as L
from .. import statistics as ST
from ..citation import kit_citation, site_citation
from ..inputs import load as load_manifest
from ..inputs import role_inputs, site_input_names
from ..profile import load_profile
from ..site import code_commit, load_site, manifest_of, root_of

FONTS = {
    'heading': "'IBM Plex Serif', Georgia, 'Times New Roman', serif",
    'body': "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
    'mono': "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    'stylesheet': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Serif:wght@500;600;700'
                  '&family=Inter:wght@400;500;600;700&display=swap',
}
DEFAULT_BAND = ['#155e75', '#0f3b47']
# the page's scripts, in load order: modules register with the core, which starts last
MODULES = ('kit-stats.js', 'kit-select.js', 'kit-map.js', 'kit-proteins.js', 'kit-sites.js', 'kit.js')
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
        """A number for JSON: an infinite odds ratio (every set member marked) as 1e300, which the page prints as
        '> 1,000' as the explorer does; NaN and an empty cell as None. JSON has no infinity."""
        try:
            x = float(v) if v != '' else None
        except ValueError:
            return None
        if x is None or math.isnan(x):
            return None
        return 1e300 if x == math.inf else 0.0 if x == -math.inf else x
    rows = [{'analysis': r['analysis'], 'category': r['category'], 'method': r['method'],
             'a': int(r['a']), 'b': int(r['b']), 'c': int(r['c']), 'd': int(r['d']),
             'or': num(r['odds_ratio']), 'fold': num(r['fold_enrichment']), 'lo': num(r['odds_ratio_ci_low']), 'hi': num(r['odds_ratio_ci_high']),
             'p': num(r['p']), 'q': num(r['q']), 'strata': int(r['n_strata']) if r['n_strata'] else None}
            for r in stats.to_dict('records')]
    set_names = {}
    if (folder / 'set_names.tsv').exists():
        import pandas as pd
        for r in pd.read_csv(folder / 'set_names.tsv', sep='\t', dtype=str, keep_default_na=False).to_dict('records'):
            set_names.setdefault(r['analysis'], {})[r['set']] = r['name']
    analyses = []
    for a in site['analyses']:
        if a.get('test') == 'protein_sets':
            analyses.append({'id': a['id'], 'kind': 'protein_sets', 'title': a.get('title', a['id']), 'question': a.get('question', ''),
                             'sub': a.get('sub', ''), 'section': a.get('section', 'Kinds of protein'), 'layer': '', 'describe': a.get('background', ''),
                             'labels': set_names.get(a['id'], {}), 'help': {}, 'new': bool(a.get('new'))})
            continue
        layer = L.BUILT_IN.get(a['layer'])
        labels, helps = _labels(layer, profile)
        analyses.append({'id': a['id'], 'kind': 'residue', 'title': a.get('title') or (layer.title if layer else a['id']),
                         'question': a.get('question') or _fill(layer.question if layer else '', profile.words),
                         'sub': _fill(layer.sub if layer else '', profile.words), 'layer': a['layer'],
                         'section': a.get('section') or (layer.section if layer else ''),
                         'describe': layer.describe if layer else '', 'labels': labels, 'help': helps, 'new': bool(a.get('new'))})
    web = site['website']
    # each input by its name and version, and what this site uses it for
    entries = load_manifest(manifest_of(site))
    uses = {site['snapshot']['input']: 'sequences', site['marks']['input']: profile.words['marks']}
    order = site_input_names(site)            # the table lists them as the site file does: a role's sources in its order
    roles = {}
    for role, value in site.get('inputs', {}).items():
        rule, names = role_inputs(value)
        for i, name in enumerate(names):
            roles[name] = role
            uses[name] = role if rule == 'one' or i == 0 else f"{role}, for proteins with none from the row{'s' if i > 1 else ''} above" if rule == 'first_of' else f'{role}, with the row{"s" if i > 1 else ""} above'
    if site.get('reference', {}).get('statistics'):
        uses[site['reference']['statistics']] = 'checking the rebuild'
    inputs = {name: {'version': entries.get(name, {}).get('version', ''), 'licence': entries.get(name, {}).get('licence', ''),
                     'use': uses.get(name, ''), 'role': roles.get(name, '')}
              for name in sorted(run.get('inputs', {}), key=lambda n: order.index(n) if n in order else len(order))}
    return {
        'inputs': inputs,
        'partners': web.get('partners'),
        'overview': web.get('overview'), 'filters': web.get('filters'), 'stats': web.get('stats'),
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


SHARDS = 64


def shard_of(accession: str) -> int:
    """The protein file an accession is in: the sum of its character codes, modulo 64 (kit.js computes the same)."""
    return sum(map(ord, accession)) % SHARDS


def protein_data(folder: Path, snapshot_fasta: Path | None) -> tuple[tuple[list, list, list], dict]:
    """((the protein list for the Proteins tab, the mark columns, the regions' sources), the per-protein records by
    shard) from a run's per-protein outputs. A region is [kind, start, end, label, index of its source]."""
    import pandas as pd

    from ..snapshot import parse_fasta
    if not (folder / 'proteins.tsv').exists():
        return ([], [], [], []), {}
    prot = pd.read_csv(folder / 'proteins.tsv', sep='\t', dtype={'accession': str}, keep_default_na=False)
    marks = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    counts = pd.read_csv(folder / 'protein_counts.tsv', sep='\t', dtype={'accession': str, 'analysis': str, 'category': str}, keep_default_na=False)
    units = pd.read_csv(folder / 'units.tsv', sep='\t', dtype={'accession': str, 'label': str}, keep_default_na=False)
    if 'source' not in units.columns:
        units['source'] = ''
    sources = sorted(set(units['source']))
    src_index = {s: i for i, s in enumerate(sources)}
    seqs = parse_fasta(snapshot_fasta) if snapshot_fasta and snapshot_fasta.exists() else {}
    analyses = [c for c in marks.columns if c not in ('accession', 'position', 'residue', 'window_15') and not c.startswith('a.')]
    attrs = [c for c in marks.columns if c.startswith('a.')]          # a.<name> and a.<name>.link: the site file's marks.attributes
    listing = [[r['accession'], r['gene'], r['name'], int(r['length']), int(r['marks']), int(r['candidates'])] for r in prot.to_dict('records')]
    shards: dict[int, dict] = {}
    m_by = {a: g for a, g in marks.groupby('accession')}
    c_by = {a: g for a, g in counts.groupby('accession')}
    u_by = {a: g for a, g in units.groupby('accession')}
    for r in prot.to_dict('records'):
        a = r['accession']
        mg, cg, ug = m_by.get(a), c_by.get(a), u_by.get(a)
        rec = {'entry': r['entry'], 'md5': r['sequence_md5'], 'seq': seqs.get(a, ''),
               'marks': [[int(x['position']), x['window_15'], [x[k] for k in analyses], [x[k] for k in attrs]] for x in mg.to_dict('records')] if mg is not None else [],
               'counts': {}, 'totals': {}, 'units': [[u['kind'], int(u['start']), int(u['end']), u['label'], src_index[u['source']]] for u in ug.to_dict('records')] if ug is not None else []}
        if cg is not None:
            for aid, g in cg.groupby('analysis'):
                rec['counts'][aid] = [[c['category'], int(c['marks_in']), int(c['others_in'])] for c in g.to_dict('records')]
                rec['totals'][aid] = [int(g['marks_total'].iloc[0]), int(g['others_total'].iloc[0])]
        shards.setdefault(shard_of(a), {})[a] = rec
    return (listing, analyses, sources, [c[2:] for c in attrs]), shards


def selection_data(folder: Path, listing: list, analyses: list) -> dict:
    """What the browser needs to filter the marks and test a selection again: every mark with its protein, position,
    class in each residue question and attributes (dictionary-coded), and each protein's other candidate residues per
    class (from protein_counts.tsv), so the within-protein and pooled tests can be recomputed on any subset."""
    import pandas as pd
    marks = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    counts = pd.read_csv(folder / 'protein_counts.tsv', sep='\t', dtype={'accession': str, 'analysis': str, 'category': str}, keep_default_na=False)
    pidx = {r[0]: i for i, r in enumerate(listing)}
    attrs = [c for c in marks.columns if c.startswith('a.') and not c.endswith('.link')]
    classes, codes = {}, {}
    for aid in analyses:
        vals = sorted({v for x in marks[aid] for v in (x.split(';') if x else [])} | set(counts.loc[counts['analysis'] == aid, 'category']))
        classes[aid] = vals
        codes[aid] = {v: i for i, v in enumerate(vals)}
    avals, acodes = {}, {}
    for c in attrs:
        vals = sorted({v for x in marks[c] for v in x.split('; ')}) if c else []
        avals[c[2:]] = vals
        acodes[c] = {v: i for i, v in enumerate(vals)}
    rows = []
    for r in marks.to_dict('records'):
        rows.append([pidx[r['accession']], int(r['position']),
                     [[codes[a][v] for v in r[a].split(';')] if r[a] else [] for a in analyses],
                     [[acodes[c][v] for v in r[c].split('; ')] for c in attrs], r['window_15']])
    # a list value's link (a study's DOI), the same wherever the value appears
    links = {}
    for c in attrs:
        if c + '.link' in marks.columns:
            m = {}
            for vals, ids in zip(marks[c], marks[c + '.link']):
                for v, i in zip(vals.split('; '), ids.split('; ')):
                    if v and i:
                        m.setdefault(v, i)
            links[c[2:]] = m
    others = {}
    for aid, g in counts[counts['others_in'].astype(int) > 0].groupby('analysis'):
        per = {}
        for r in g.itertuples(index=False):
            per.setdefault(pidx[r.accession], {})[codes[aid][r.category]] = int(r.others_in)
        others[aid] = per
    # each protein's other candidate residues, the same for every question (a protein with none is left out of the
    # tests: its marks have nothing to be compared with)
    others_total = [int(r[5]) - int(r[4]) for r in listing]
    # protein-set questions: each tested set's size in the background and its marked proteins (protein_sets.json)
    sets = {}
    if (folder / 'protein_sets.json').exists():
        for aid, k in json.loads((folder / 'protein_sets.json').read_text()).items():
            if not k:
                continue
            sets[aid] = {'N': k['N'], 'in_background': [pidx[a] for a in k['marked_in_background'] if a in pidx],
                         'sets': [[s, v['M'], [pidx[a] for a in v['marked'] if a in pidx]] for s, v in k['sets'].items()]}
    return {'analyses': analyses, 'classes': classes, 'attributes': avals, 'attribute_links': links, 'marks': rows, 'others': others,
            'others_total': others_total, 'protein_sets': sets}


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
    run = data['run']
    fasta = Path(run.get('inputs', {}).get(site['snapshot']['input'], {}).get('file', ''))
    (listing, mark_columns, unit_sources, mark_attrs), shards = protein_data(folder, fasta)
    data['proteins'] = listing
    data['mark_columns'] = mark_columns
    data['mark_attributes'] = mark_attrs
    if listing:
        import pandas as pd
        mk = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
        data['attribute_counts'] = {a: len({v for x in mk[f'a.{a}'] for v in x.split(s.get('separator', '; ')) if v})
                                    for a, s in site['marks'].get('attributes', {}).items() if f'a.{a}' in mk.columns}
    data['attribute_specs'] = site['marks'].get('attributes', {})
    data['unit_sources'] = unit_sources
    data['shards'] = SHARDS if shards else 0
    if listing:
        sel = selection_data(folder, listing, mark_columns)
        (out / 'data').mkdir(parents=True, exist_ok=True)
        (out / 'data' / 'selection.json').write_text(json.dumps(sel, separators=(',', ':')))
        log(f"  selection data: {len(sel['marks']):,} marks, {(out / 'data' / 'selection.json').stat().st_size / 1e6:.1f} MB")
    if shards:
        (out / 'data' / 'p').mkdir(parents=True, exist_ok=True)
        for k, recs in shards.items():
            (out / 'data' / 'p' / f'{k:02d}.json').write_text(json.dumps(recs, separators=(',', ':')))
    inline_proteins = json.dumps({f'{k:02d}': v for k, v in shards.items()}, separators=(',', ':')).replace('</', '<\\/')
    inline_selection = (out / 'data' / 'selection.json').read_text().replace('</', '<\\/') if (out / 'data' / 'selection.json').exists() else ''
    if len(inline_proteins) > 12_000_000:
        log(f'  the one-file copy leaves out the protein pages ({len(inline_proteins) / 1e6:.0f} MB); index.html has them')
        inline_proteins = '{}'

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
            js = (f'<script id="protein-data" type="application/json">{inline_proteins}</script>'
                  + (f'<script id="selection-data" type="application/json">{inline_selection}</script>' if inline_selection else '')
                  + ''.join(f'<script>{_asset("assets/" + n).read_text()}</script>' for n in MODULES))
        else:
            css = '<link rel="stylesheet" href="assets/kit.css">'
            js = ''.join(f'<script src="assets/{n}"></script>' for n in MODULES)
        text = _asset('template.html').read_text()
        for key, value in {'{{NAME}}': html.escape(web['name']), '{{TAGLINE}}': html.escape(web.get('tagline', '')),
                           '{{ICON_HREF}}': icon_href, '{{THEME}}': theme, '{{ART}}': art, '{{LAB}}': lab,
                           '{{LINKS}}': links, '{{CITE}}': cite_html, '{{VERSION}}': version,
                           '{{FONTS}}': (f'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
                                         f'<link rel="stylesheet" href="{html.escape(fonts["stylesheet"])}">') if fonts.get('stylesheet') else '',
                           '<link rel="stylesheet" href="assets/kit.css">': css, '<script src="assets/kit.js"></script>': js,
                           '{{DATA}}': json.dumps(data, separators=(',', ':'), allow_nan=False).replace('</', '<\\/')}.items():
            text = text.replace(key, value)
        return text

    for name in ('kit.css', *MODULES):
        shutil.copyfile(_asset(f'assets/{name}'), out / 'assets' / name)
    (out / 'assets' / 'icon.svg').write_text(icon)
    if logo:
        (out / 'assets' / 'lab.svg').write_text(logo)
    (out / 'index.html').write_text(page(inline=False))
    (out / f'{site["id"]}.html').write_text(page(inline=True))
    log(f'  -> {out / "index.html"} (with assets/) and {out / (site["id"] + ".html")} (one file)')
    return out / 'index.html'


def pages(site_paths: list, out: str | Path, out_root: str | Path | None = None, log=print) -> Path:
    """One folder to publish (GitHub Pages, or any static host): each site's website under its id, and a landing page
    in the same look listing them. Run ptmc run and ptmc web for each site first."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    (out / '.nojekyll').write_text('')
    cards, lab = [], None
    for sp in site_paths:
        site = load_site(sp)
        web = site.get('website', {})
        src = Path(out_root or root_of(site)) / site['outputs']['folder'] / 'web'
        if not (src / 'index.html').exists():
            raise FileNotFoundError(f'{src}/index.html: run ptmc web {sp} first')
        dest = out / site['id']
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
        run = json.loads((src.parent / 'run.json').read_text())
        cit = site_citation(site)
        profile = load_profile(site['mark'])
        band = web.get('band', DEFAULT_BAND)
        lab = lab or web.get('lab')
        cards.append(
            f'<a class="site-card" href="{html.escape(site["id"])}/"><span class="band" style="background:linear-gradient(160deg,{band[0]},{band[1]})">'
            f'<b>{html.escape(web.get("name", site["title"]))}</b></span><span class="body"><span>{html.escape(web.get("tagline", ""))}</span>'
            f'<span class="muted">{run["marks"]["counted"]:,} {html.escape(profile.words["marks"])} on {run["marks"]["proteins"]:,} proteins · '
            f'{html.escape(run["snapshot"]["release"])}{" · version " + html.escape(cit["version"]) if cit else ""}</span><span class="open">Open ›</span></span></a>')
        log(f'  {site["id"]} -> {dest}')
    kit = kit_citation()
    lab_html = (f'<a class="brand-mark" href="{html.escape(lab.get("url", "#"))}"><span>{html.escape(lab.get("name", ""))}'
                f'<small>{html.escape(lab.get("affiliation", ""))}</small></span></a>') if lab else ''
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Protein modification sites</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{html.escape(FONTS['stylesheet'])}">
<link rel="stylesheet" href="{html.escape(site_paths and load_site(site_paths[0])['id'])}/assets/kit.css">
<style>
.sites {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(min(22rem, 100%), 1fr)); gap: 1rem; padding-block: 1.5rem 3rem; }}
.site-card {{ display: grid; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; box-shadow: var(--shadow); color: var(--ink); text-decoration: none; }}
.site-card:hover {{ box-shadow: var(--shadow-hover); }}
.site-card .band {{ padding: 1.1rem 1.1rem 1rem; color: #fff; border-bottom: 3px solid var(--accent-l); }}
.site-card .band b {{ font-family: var(--font-heading); font-size: 1.3rem; font-weight: 600; }}
.site-card .body {{ display: grid; gap: 0.4rem; padding: 0.9rem 1.1rem 1rem; font-size: 0.92rem; }}
.site-card .open {{ color: var(--accent); font-weight: 600; }}
</style></head>
<body><header class="hero"><div class="wrap"><div class="brand"><h1>Protein modification sites</h1><div class="brand-side">{lab_html}</div></div>
<div class="lede"><p class="lede-what">Each site below is one file: a modification, a proteome and a set of questions. All of them run the same tests,
within each protein and pooled, and offer the same pages and downloads.</p>
<p class="lede-note">Built with <a href="{html.escape(kit['url'])}">ptmcontext</a> {html.escape(kit['version'])}.</p></div></div></header>
<main class="wrap"><div class="sites">{''.join(cards)}</div></main></body></html>
"""
    (out / 'index.html').write_text(page)
    log(f'  -> {out / "index.html"}')
    return out / 'index.html'
