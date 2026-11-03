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
from urllib.parse import quote

from .. import __version__
from .. import layers as L
from .. import statistics as ST
from ..citation import kit_citation, site_citation
from ..inputs import load as load_manifest
from ..inputs import role_inputs, site_input_names
from ..profile import load_profile
from ..site import code_commit, load_site, manifest_of, root_of
from .counts import counts_data
from . import structure as S3D

FONTS = {
    'heading': "'IBM Plex Serif', Georgia, 'Times New Roman', serif",
    'body': "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
    'mono': "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    'stylesheet': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Serif:wght@500;600;700'
                  '&family=Inter:wght@400;500;600;700&display=swap',
}
DEFAULT_BAND = ['#155e75', '#0f3b47']
# the page's scripts, in load order: modules register with the core, which starts last
MODULES = ('kit-stats.js', 'kit-select.js', 'kit-search.js', 'kit-near.js', 'kit-selview.js', 'kit-shown.js', 'kit-map.js', 'kit-3d.js', 'kit-columns.js', 'kit-sitecard.js', 'kit-pagepdf.js', 'kit-proteins.js', 'kit-tables.js', 'kit-sites.js', 'kit-idrs.js', 'kit-compare.js', 'kit-questions.js', 'kit-start.js', 'kit-counts.js', 'kit-cell.js', 'kit-values.js', 'kit-help.js', 'kit-conserve.js', 'kit.js')
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


def _labels(layer: dict | None, profile) -> tuple[dict, dict]:
    """(labels, definitions) of a layer's categories: the layer's own, or for a flags layer without its own (motifs)
    the profile's families."""
    if not layer:
        return {}, {}
    if layer['shape'] == 'flags' and not layer.get('labels'):
        fams = profile.motif_families
        return ({f['name']: f.get('label', f['name'].replace('_', ' ')) for f in fams}, {f['name']: f.get('help', '') for f in fams})
    return dict(layer.get('labels') or {}), dict(layer.get('help') or {})


def _layer_words(a: dict, run: dict) -> dict | None:
    """A residue analysis's layer as the website shows it: as its run recorded it (built in, made from with:, or a
    plugin), or, for a run written before runs recorded it, the built-in layer's own words."""
    rec = (run.get('analyses') or {}).get(a['id']) or {}
    if 'shape' in rec:
        return rec
    layer = L.BUILT_IN.get(a.get('layer', ''))
    if layer is None:
        return None
    from ..site import layer_words
    return layer_words(layer)


def _class_order(a: dict, words: dict) -> dict:
    """Whether a question's classes keep their own order on the website (that of its labels: from inside a domain
    outwards, say) and their headed groups: the site file's (an analysis's `ordered` and `groups`), else its layer's,
    as the run recorded them; a run written before runs recorded them takes the built-in layer's."""
    built = L.BUILT_IN.get(a.get('layer', ''))
    ordered = a.get('ordered', words.get('ordered', bool(built and built.ordered)))
    groups = a.get('groups') if 'groups' in a else words.get('groups', [{'name': g, 'classes': list(cs)} for g, cs in (built.groups if built else ())])
    return {'ordered': bool(ordered), 'groups': [{'name': g['name'], 'classes': list(g['classes'])} for g in groups or []]}


def _fill(template: str, words: dict) -> str:
    w = {'marks': words['marks'], 'residues': words['residues'], 'marked': words['marked'], 'Marked': words['marked'].capitalize(),
         'Marks': words['marks'][:1].upper() + words['marks'][1:]}
    return template.format(**w) if template else ''


def _tracks(folder: Path) -> list[dict]:
    """What each kind of region on the protein pages is (tracks.json, from the run's layers). A run written before
    runs recorded it gets each kind of its units.tsv drawn plainly, as a row of boxes."""
    if (folder / 'tracks.json').exists():
        return json.loads((folder / 'tracks.json').read_text())
    if not (folder / 'units.tsv').exists():
        return []
    import pandas as pd
    kinds = pd.read_csv(folder / 'units.tsv', sep='\t', dtype=str, keep_default_na=False, usecols=['kind'])['kind'].unique()
    return [{'kind': k, 'title': k.replace('_', ' ').capitalize(), 'style': 'segments', 'help': '', 'roles': [], 'analysis': ''} for k in kinds]


def reporters(site: dict, folder: Path) -> dict | None:
    """The studies and databases that report the marks, most marks first, for the header's citation line: the list
    attribute a header tile counts (website.stats), else the first list attribute linked to papers. Each is
    [value, label, its paper's id, marks]."""
    attrs = site['marks'].get('attributes') or {}
    name = next((st['attribute'] for st in (site.get('website', {}).get('stats') or []) if isinstance(st, dict)), None)
    name = name if name in attrs else next((n for n, a in attrs.items() if a.get('kind') == 'list' and a.get('link')), None)
    if not name or not (folder / 'marks.tsv').exists():
        return None
    import pandas as pd
    spec, col = attrs[name], f'a.{name}'
    mk = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    if col not in mk.columns:
        return None
    sep, counts, ids = spec.get('separator', '; '), {}, {}
    links = mk[col + '.link'] if col + '.link' in mk.columns else [''] * len(mk)
    for vals, lks in zip(mk[col], links):
        vs, ls = (vals.split(sep) if vals else []), (lks.split(sep) if lks else [])
        for k, v in enumerate(vs):
            counts[v] = counts.get(v, 0) + 1
            if k < len(ls) and ls[k]:
                ids.setdefault(v, ls[k])
    items = sorted(counts.items(), key=lambda x: (-x[1], x[0]))
    return {'attribute': name, 'label': spec.get('label', name), 'url': (spec.get('link') or {}).get('url', ''),
            'items': [[v, (spec.get('values') or {}).get(v, v), ids.get(v, ''), n] for v, n in items if v]}


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
    kept = json.loads((folder / 'protein_sets.json').read_text()) if (folder / 'protein_sets.json').exists() else {}
    ref_tables = (site.get('reference') or {}).get('tables') or {}
    ontology = set_structure(site, kept)
    for a in site['analyses']:
        if a.get('test') == 'protein_sets':
            from ..set_tests import question_roles
            analyses.append({'id': a['id'], 'kind': 'protein_sets', 'shape': 'sets', 'stratified': bool(a.get('abundance')), 'roles': question_roles(a),
                             **({'link': a['link']} if a.get('link') else {}),       # each set's own page
                             **ontology.get(a['id'], {}),                            # its sets' parents, its families' own sets
                             **({'checked_against': ref_tables[a['id']]['input']} if a['id'] in ref_tables else {}),
                             **({'unit': (a['identifiers'].get('nouns') or 'identifiers')} if a.get('identifiers') else {}),
                             **({'filter': a['filter']} if a.get('filter') else {}),     # the words of its filter control
                             **({'scores': {k: a['scores'][k] for k in ('label', 'help', 'levels', 'max') if k in a['scores']}} if a.get('scores') else {}),
                             'title': a.get('title', a['id']), 'question': a.get('question', ''),
                             'sub': a.get('sub', ''), 'section': a.get('section', 'Kinds of protein'), 'layer': '', 'describe': a.get('background', ''),
                             'labels': {**set_names.get(a['id'], {}), **(a.get('labels') or {})}, 'help': dict(a.get('help') or {}),
                             'new': bool(a.get('new')), **_class_order(a, {})})
            continue
        layer = _layer_words(a, run)
        labels, helps = _labels(layer, profile)
        lw = layer or {}
        analyses.append({'id': a['id'], 'kind': 'residue', 'shape': lw.get('shape', 'class'), 'roles': list(lw.get('needs', [])),
                         'title': a.get('title') or lw.get('title') or a['id'],
                         'question': a.get('question') or _fill(lw.get('question', ''), profile.words),
                         'sub': a.get('sub') or _fill(lw.get('sub', ''), profile.words), 'layer': a['layer'],
                         'section': a.get('section') or lw.get('section', ''),
                         'describe': lw.get('describe', ''), 'labels': labels, 'help': helps, 'new': bool(a.get('new')), **_class_order(a, lw)})
    web = site['website']
    # each input by its name and version, and what this site uses it for
    entries = load_manifest(manifest_of(site))
    uses = {site['snapshot']['input']: 'sequences', site['marks']['input']: profile.words['marks']}
    order = site_input_names(site)            # the table lists them as the site file does: a role's sources in its order
    roles = {}
    # what each role is used for, in words: the questions that read it (a role no question reads keeps its name)
    readers = {}
    for a, spec in zip(analyses, site['analyses']):
        for r in a['roles']:
            readers.setdefault(r, []).append(a['title'])
        ab = (spec.get('abundance') or {}).get('input')
        if ab:
            readers.setdefault(ab, []).append(f"abundance deciles of {a['title']}")
        for step in (spec.get('identifiers') or {}).get('map', []):      # the tables that map proteins to the sets' identifiers
            readers.setdefault(step['input'], []).append(f"proteins to {a.get('unit', 'identifiers')} for {a['title']}")
        vals = (spec.get('values') or {}).get('input') or ((spec.get('sets') or {}).get('input') if spec.get('values') else None)
        if vals and vals not in a['roles']:                               # numbers shown beside the sets
            readers.setdefault(vals, []).append(f"the numbers shown with {a['title']}")
        hist = ((spec.get('sets') or {}).get('history') or {}).get('input')
        if hist:                                                          # members' older accessions to current entries
            readers.setdefault(hist, []).append(f"older accessions of the members of {a['title']}")
    from ..map_rows import roles_read                  # the tables the protein map's own rows read
    for role, titles in roles_read(site).items():
        readers.setdefault(role, []).append('the protein map: ' + ', '.join(dict.fromkeys(titles)))
    for role, value in site.get('inputs', {}).items():
        rule, names = role_inputs(value)
        what = '; '.join(dict.fromkeys(readers.get(role, []))) or role.replace('_', ' ')
        for i, name in enumerate(names):
            roles.setdefault(name, []).append(role)
            prev = uses.get(name)
            uses[name] = (prev + '; ' if prev and name in roles and len(roles[name]) > 1 else '') + (what if rule == 'one' or i == 0 else f"{what}, for proteins with none from the row{'s' if i > 1 else ''} above" if rule == 'first_of' else f'{what}, with the row{"s" if i > 1 else ""} above')
    counts = web.get('counts') or {}
    for name, t in (site['marks'].get('tables') or {}).items():   # per-mark tables: the count questions that read them
        titles = [c['title'] for c in counts.values() if any(r.get('table') == name for r in c.get('rows', []))]
        uses[t['input']] = f"each {profile.words['mark']}'s rows" + (f", for {'; '.join(titles)}" if titles else '')
    if site.get('reference', {}).get('statistics'):
        uses[site['reference']['statistics']] = 'the parity check'
    for tid, tb in (web.get('tables') or {}).items():      # the tables the protein pages show
        uses[tb['input']] = (uses[tb['input']] + '; ' if uses.get(tb['input']) else '') + f"the protein pages ({tid.replace('_', ' ')})"
    for name, what in S3D.roles(site).items():                            # the 3D viewer reads some of them
        uses[name] = (uses[name] + '; ' if uses.get(name) else '') + what
    titles = {a['id']: a.get('title', a['id']) for a in site['analyses']}
    for aid, x in ((site.get('reference') or {}).get('tables') or {}).items():   # a published table of one question
        uses[x['input']] = f"the parity check of {titles.get(aid, aid)}"
    inputs = {name: {'version': entries.get(name, {}).get('version', ''), 'licence': entries.get(name, {}).get('licence', ''),
                     'use': uses.get(name, ''), 'role': (roles.get(name) or [''])[0], 'roles': roles.get(name, []),
                     'record': entries.get(name, {}).get('record', '')}
              for name in sorted(run.get('inputs', {}), key=lambda n: order.index(n) if n in order else len(order))}
    return {
        'inputs': inputs,
        'partners': web.get('partners'),
        'ptm_kinds': json.loads((Path(__file__).resolve().parents[1] / 'config' / 'uniprot_ptm_kinds.json').read_text())['kinds'],
        'ref_links': json.loads((Path(__file__).resolve().parents[1] / 'config' / 'ref_links.json').read_text())['links'],
        'protein_links': json.loads((Path(__file__).resolve().parents[1] / 'config' / 'protein_links.json').read_text())['links'],
        'tracks': _tracks(folder),
        'profile_uniprot': profile.data.get('uniprot_features', []),
        'overview': web.get('overview'), 'filters': web.get('filters'), 'stats': web.get('stats'),
        'sites_view': web.get('sites'), 'proteins_view': web.get('proteins'), 'selection_cards': web.get('selection_cards') or {}, 'protein_view': web.get('protein'), 'compare': web.get('compare'), 'legacy_links': web.get('legacy_links') or {}, 'search_aliases': web.get('search_aliases') or {}, 'legacy_params': web.get('legacy_params') or {}, 'dataset': web.get('dataset'), 'downloads': web.get('downloads') or [], 'download_terms': web.get('download_terms', ''),
        # the maps of the cell as one question (kit-cell.js) and the parts of the kit's drawings; protein-set questions
        # drawn with their proteins' numbers (kit-values.js)
        **({'cell': web['cell'], 'cell_drawings': _cell_drawings()} if web.get('cell') else {}),
        **({'set_views': web['set_views']} if web.get('set_views') else {}),
        # the start panel's words and examples (kit-help.js); without them it chooses from the examples
        **({'start': web['start']} if web.get('start') else {}),
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


def set_structure(site: dict, kept: dict) -> dict:
    """What the website's views of protein-set questions read beside the rows, from the run's protein_sets.json: for a
    question with a hierarchy, each tested set's parents and the root (an ontology's tree and its most specific sets);
    for a question gathering sets into families that an Overview card names as members' families, each family's own
    sets among the member question's tested sets (terms by family)."""
    out: dict[str, dict] = {}
    for a in site['analyses']:
        k = kept.get(a['id']) or {}
        if a.get('hierarchy') and k.get('parents') is not None:
            out.setdefault(a['id'], {}).update({'parents': k['parents'], 'root': k.get('root', '')})
    cards = [c for sec in ((site.get('website') or {}).get('overview') or {}).get('sections', []) for c in sec.get('cards', []) if isinstance(c, dict)]
    for v in [x for c in cards for x in [c, *(c.get('views') or [])]]:
        mem = v.get('members')
        if not mem:
            continue
        tested = set((kept.get(mem['analysis']) or {}).get('sets', {}))
        for o in mem['of']:
            g = (kept.get(o['analysis']) or {}).get('gathers') or {}
            out.setdefault(o['analysis'], {})['gathers'] = {f: [s for s in ss if s in tested] for f, ss in g.items()}
            out[o['analysis']]['gathers_all'] = {f: len(ss) for f, ss in g.items()}     # every set of the family, tested or not
    return out


SHARDS = 64


def _cell_drawings() -> dict:
    from ..site import cell_drawings
    return {k: sorted(d['parts']) for k, d in cell_drawings().items()}


def stratum_questions(web: dict) -> set:
    """The protein-set questions whose strata counts a page needs, to test a selection within the abundance deciles
    (the maps of the cell and their regions)."""
    cell = web.get('cell') or {}
    return {x for m in cell.get('maps', []) for x in (m.get('analysis'), m.get('regions')) if x}


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
    units = pd.read_csv(folder / 'units.tsv', sep='\t', dtype=str, keep_default_na=False)
    if 'source' not in units.columns:
        units['source'] = ''
    sources = sorted(set(units['source']))
    src_index = {s: i for i, s in enumerate(sources)}
    seqs = parse_fasta(snapshot_fasta) if snapshot_fasta and snapshot_fasta.exists() else {}
    analyses = [c for c in marks.columns if c not in ('accession', 'position', 'residue', 'window_15') and not c.startswith('a.')]
    attrs = [c for c in marks.columns if c.startswith('a.')]          # a.<name> and a.<name>.link: the site file's marks.attributes
    listing = [[r['accession'], r['gene'], r['name'], int(r['length']), int(r['marks']), int(r['candidates']), r.get('entry', '')]
               for r in prot.to_dict('records')]
    shards: dict[int, dict] = {}
    m_by = {a: g for a, g in marks.groupby('accession')}
    c_by = {a: g for a, g in counts.groupby('accession')}
    u_by = {a: g for a, g in units.groupby('accession')}
    for r in prot.to_dict('records'):
        a = r['accession']
        mg, cg, ug = m_by.get(a), c_by.get(a), u_by.get(a)
        rec = {'entry': r['entry'], 'md5': r['sequence_md5'], 'seq': seqs.get(a, ''),
               'marks': [[int(x['position']), x['window_15'], [x[k] for k in analyses], [x[k] for k in attrs]] for x in mg.to_dict('records')] if mg is not None else [],
               'counts': {}, 'totals': {}, 'units': [[u['kind'], int(u['start']), int(u['end']), u['label'], src_index[u['source']], u.get('class', ''), u.get('ref', '')] for u in ug.to_dict('records')] if ug is not None else []}
        if cg is not None:
            for aid, g in cg.groupby('analysis'):
                rec['counts'][aid] = [[c['category'], int(c['marks_in']), int(c['others_in'])] for c in g.to_dict('records')]
                rec['totals'][aid] = [int(g['marks_total'].iloc[0]), int(g['others_total'].iloc[0])]
        shards.setdefault(shard_of(a), {})[a] = rec
    return (listing, analyses, sources, [c[2:] for c in attrs]), shards


def _holds_mark(values: dict, specs: dict, cond: dict) -> bool:
    """A mark condition ({attribute, has, lacks, empty}) on one mark's attribute values, as the page reads it (an
    attribute the marks lack never holds)."""
    s = specs.get(cond['attribute'])
    if s is None or cond['attribute'] not in values:
        return False
    v = values[cond['attribute']]
    vs = [x for x in (v.split(s.get('separator', '; ')) if s.get('kind') == 'list' else [v]) if x != '']
    if cond.get('has') and not any(x in cond['has'] for x in vs):
        return False
    if cond.get('lacks') and any(x in cond['lacks'] for x in vs):
        return False
    if cond.get('empty') is not None and (not vs) != cond['empty']:
        return False
    return True


def shown_data(folder: Path, site: dict, attrs: list, shards: dict, snapshot_fasta: Path | None) -> dict | None:
    """The marks a site shows and counts nowhere (shown_marks.tsv, marks.left_out): each into its protein's record as
    rec['shown'] ([position, window, [], attribute values], as a mark), a record for each protein with only these
    (shown_proteins.tsv), and for the page their count, those proteins ([accession, gene, name, length, entry]) and
    every one as a row of the Sites page ([accession, position, window, attribute values]). With the counted marks
    the site file names as like them (website.shown_marks.counted.when), for the variant's note. None when there are
    none: the page is then as before. Never in selection.json, the counts or a test."""
    import pandas as pd

    from ..snapshot import parse_fasta
    path = folder / 'shown_marks.tsv'
    if not path.exists():
        return None
    sm = pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False)
    if not len(sm):
        return None
    cols = [f'a.{a}' for a in attrs]
    val = lambda r: [r.get(c, '') for c in cols]  # noqa: E731
    recs = {acc: rec for sh in shards.values() for acc, rec in sh.items()}
    alone = pd.read_csv(folder / 'shown_proteins.tsv', sep='\t', dtype=str, keep_default_na=False) if (folder / 'shown_proteins.tsv').exists() else pd.DataFrame(columns=['accession'])
    seqs = parse_fasta(snapshot_fasta) if len(alone) and snapshot_fasta and snapshot_fasta.exists() else {}
    proteins = []
    for r in alone.to_dict('records'):
        a = r['accession']
        proteins.append([a, r['gene'], r['name'], int(r['length']), r['entry']])
        rec = {'entry': r['entry'], 'md5': r['sequence_md5'], 'seq': seqs.get(a, ''), 'marks': [], 'counts': {}, 'totals': {}, 'units': [], 'shown_only': True}
        shards.setdefault(shard_of(a), {})[a] = rec
        recs[a] = rec
    rows = []
    for r in sm.to_dict('records'):
        a, pos = r['accession'], int(r['position'])
        if a in recs:
            recs[a].setdefault('shown', []).append([pos, r['window_15'], [], val(r)])
        rows.append([a, pos, r['window_15'], val(r)])
    cfg = (site.get('website') or {}).get('shown_marks') or {}
    when = (cfg.get('counted') or {}).get('when') or []
    like = 0
    if when and (folder / 'marks.tsv').exists():
        specs = site['marks'].get('attributes', {})
        mk = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
        for r in mk.to_dict('records'):
            values = {a: r[f'a.{a}'] for a in specs if f'a.{a}' in r}
            like += all(_holds_mark(values, specs, c) for c in when)
    return {'n': len(rows), 'proteins': proteins, 'rows': rows, 'counted_like': like}


def map_data(folder: Path, site: dict) -> tuple[list[str], dict]:
    """The protein map's own rows (map_items.tsv, website.protein.map.rows): the rows' ids, and each protein's items
    by shard, an item [row index, start, end, class, label, value, ref, sources] without its empty tail."""
    from ..map_rows import input_rows
    ids = [r['id'] for r in input_rows(site)]
    if not ids or not (folder / 'map_items.tsv').exists():
        return [], {}
    import pandas as pd
    df = pd.read_csv(folder / 'map_items.tsv', sep='\t', dtype=str, keep_default_na=False)
    index = {r: k for k, r in enumerate(ids)}
    shards: dict[int, dict] = {}
    for rec in df.to_dict('records'):
        if rec['row'] not in index:
            continue
        v = float(rec['value']) if rec['value'] != '' else None
        item = [index[rec['row']], int(rec['start']), int(rec['end']), rec['class'], rec['label'],
                (int(v) if v is not None and v.is_integer() else v), rec['ref'], rec['sources']]
        while len(item) > 3 and item[-1] in ('', None):
            item.pop()
        shards.setdefault(shard_of(rec['accession']), {}).setdefault(rec['accession'], []).append(item)
    return ids, shards


def selection_data(folder: Path, listing: list, analyses: list, specs: dict | None = None, strata_for: set | None = None) -> dict:
    """What the browser needs to filter the marks and test a selection again: every mark with its protein, position,
    class in each residue question and attributes (dictionary-coded), and each protein's other candidate residues per
    class (from protein_counts.tsv), so the within-protein and pooled tests can be recomputed on any subset."""
    import pandas as pd
    marks = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    counts = pd.read_csv(folder / 'protein_counts.tsv', sep='\t', dtype={'accession': str, 'analysis': str, 'category': str}, keep_default_na=False)
    pidx = {r[0]: i for i, r in enumerate(listing)}
    attrs = [c for c in marks.columns if c.startswith('a.') and not c.endswith('.link')]
    specs = specs or {}
    seps = {c: (specs.get(c[2:], {}).get('separator', '; ') if specs.get(c[2:], {}).get('kind') == 'list' else None) for c in attrs}
    split = lambda c, x: (x.split(seps[c]) if seps[c] else [x])  # noqa: E731
    classes, codes = {}, {}
    for aid in analyses:
        vals = sorted({v for x in marks[aid] for v in (x.split(';') if x else [])} | set(counts.loc[counts['analysis'] == aid, 'category']))
        classes[aid] = vals
        codes[aid] = {v: i for i, v in enumerate(vals)}
    avals, acodes = {}, {}
    for c in attrs:
        vals = sorted({v for x in marks[c] for v in split(c, x)})
        avals[c[2:]] = vals
        acodes[c] = {v: i for i, v in enumerate(vals)}
    rows = []
    for r in marks.to_dict('records'):
        rows.append([pidx[r['accession']], int(r['position']),
                     [[codes[a][v] for v in r[a].split(';')] if r[a] else [] for a in analyses],
                     [[acodes[c][v] for v in split(c, r[c])] for c in attrs], r['window_15']])
    # a list value's link (a study's DOI), the same wherever the value appears
    links = {}
    for c in attrs:
        if c + '.link' in marks.columns:
            m = {}
            for vals, ids in zip(marks[c], marks[c + '.link']):
                for v, i in zip(split(c, vals), split(c, ids)):
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
    # a residue question that counts only some proteins (proteins:) skips the others' marks, and one that counts the
    # marks of a protein with no other candidate residue (marks_alone: count) keeps them (run.json says which)
    counted = {}
    run = json.loads((folder / 'run.json').read_text()) if (folder / 'run.json').exists() else {}
    for aid, used in (run.get('analyses') or {}).items():
        if aid in analyses and (used.get('proteins') or used.get('marks_alone') == 'count'):
            counted[aid] = {'skip': sorted(pidx[a] for a in (used.get('proteins') or {}).get('not_counted', []) if a in pidx),
                            'alone': used.get('marks_alone') == 'count'}
    # protein-set questions: each tested set's size in the background and its marked proteins (protein_sets.json)
    sets = {}
    if (folder / 'protein_sets.json').exists():
        for aid, k in json.loads((folder / 'protein_sets.json').read_text()).items():
            if not k:
                continue
            if k.get('identifiers'):                   # sets of other identifiers (genes): coded by index, with each
                ids = k['identifiers']                 # marked protein's identifiers in the background (of)
                uids = sorted({u for us in ids['proteins'].values() for u in us} | set(k['marked_in_background']))
                uidx = {u: i for i, u in enumerate(uids)}
                sets[aid] = {'N': k['N'], 'ids': uids, 'unit': ids.get('nouns', 'identifiers'),
                             'of': {pidx[a]: [uidx[u] for u in us] for a, us in ids['proteins'].items() if a in pidx},
                             'in_background': [uidx[u] for u in k['marked_in_background']],
                             'sets': [[s, v['M'], [uidx[u] for u in v['marked']]] for s, v in k['sets'].items()]}
                if k.get('covariate'):                 # a protein shows the covariate of its first identifier with one
                    cv = k['covariate']
                    first = {pidx[a]: next((cv['proteins'][u] for u in us if u in cv['proteins']), None) for a, us in ids['proteins'].items() if a in pidx}
                    sets[aid]['covariate'] = {'input': cv['input'], 'value': cv['value'], 'strata': cv['strata'],
                                              'proteins': {i: x for i, x in first.items() if x is not None}}
                continue
            sets[aid] = {'N': k['N'], 'in_background': [pidx[a] for a in k['marked_in_background'] if a in pidx],
                         'sets': [[s, v['M'], [pidx[a] for a in v['marked'] if a in pidx]] for s, v in k['sets'].items()]}
            if k.get('marked_in_any') is not None and k['marked_in_any'] != k['marked_in_background']:
                sets[aid]['any'] = [pidx[a] for a in k['marked_in_any'] if a in pidx]   # in any of the source's sets
            if k.get('filter_sets'):                   # sets the filter offers that were not tested (too small, say)
                sets[aid]['more'] = [[s, [pidx[a] for a in v['marked'] if a in pidx]] for s, v in k['filter_sets'].items()]
            if k.get('scores'):                        # each set's marked members' scores, and each one's best (any)
                sc = k['scores']
                sets[aid]['scores'] = {'sets': {s: {pidx[a]: v for a, v in m.items() if a in pidx} for s, m in sc['sets'].items()},
                                       'any': {pidx[a]: v for a, v in sc['any'].items() if a in pidx}}
            if k.get('covariate'):                     # each marked protein's covariate and its decile, as the test used
                cv = k['covariate']
                sets[aid]['covariate'] = {'input': cv['input'], 'value': cv['value'], 'strata': cv['strata'],
                                          'proteins': {pidx[a]: x for a, x in cv['proteins'].items() if a in pidx}}
                if aid in (strata_for or ()) and cv.get('counts'):   # the background in each stratum, overall and per set
                    sets[aid]['covariate']['counts'] = cv['counts']
            if k.get('values'):                        # numbers per protein: the marked proteins', the others' sorted
                v = k['values']
                sets[aid]['values'] = {'columns': v['columns'], 'marked': {pidx[a]: x for a, x in v['marked'].items() if a in pidx},
                                       'others': v['others']}
    return {'analyses': analyses, 'classes': classes, 'attributes': avals, 'attribute_names': [c[2:] for c in attrs], 'attribute_links': links, 'marks': rows, 'others': others,
            'others_total': others_total, 'counted': counted, 'protein_sets': sets}


def unit_value_data(folder: Path, listing: list, tracks: list[dict]) -> dict:
    """The regions whose track carries numbers (tracks.json `values`, from units_<kind>.tsv), for the pages that read
    them: by kind, the value columns, the classes (which the rows code by index) and one row per region, [protein index,
    start, end, class code, the values (null for missing), marks, other candidate residues]. Regions on a protein
    without a mark are not drawn, so they are not here either."""
    import pandas as pd
    pidx = {r[0]: i for i, r in enumerate(listing)}
    out = {}
    for t in tracks:
        spec = t.get('values') or {}
        path = folder / spec.get('table', '')
        if not spec.get('table') or not path.exists():
            continue
        cols = [c['name'] for c in spec.get('columns', [])]
        u = pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False)
        u = u[u['accession'].isin(pidx)]
        classes = sorted(set(u['class']) - {''})
        code = {c: i for i, c in enumerate(classes)}

        def num(v):
            if v == '':
                return None
            x = float(v)
            return int(x) if x.is_integer() else x
        rows = [[pidx[r['accession']], int(r['start']), int(r['end']), code.get(r['class'], -1), *[num(r.get(c, '')) for c in cols],
                 int(r['marks']), int(r['other_candidates'])] for r in u.to_dict('records')]
        out[t['kind']] = {'columns': cols, 'classes': classes, 'rows': rows}
    return out


def protein_tables(specs: dict, run: dict, data: dict, listing: list, fasta: Path, out: Path, log=print) -> tuple[dict, int]:
    """Pack the site's website.tables (tables.py) for the protein pages: each protein's rows into data/e/NN.json (the
    shards of data/p), the rows that name a protein without marks into its light page's record in data/u/NN.json (with its
    name, length and sequence from the snapshot), and an index of those proteins (data/u/index.json). Adds the tables'
    columns (D.tables), lookups (D.lookups) and other names of the proteins (D.protein_aliases) to the page's data. A
    table whose input the run did not record is left out, with a line saying so."""
    import hashlib

    from ..snapshot import md5_file, parse_fasta, parse_fasta_headers
    from . import tables as T
    for d in ('e', 'u'):
        if (out / 'data' / d).exists():
            shutil.rmtree(out / 'data' / d)
    if not specs:
        return {}, 0
    paths = {}
    for name, rec in (run.get('inputs') or {}).items():
        f = Path(rec.get('file', ''))
        if f.exists() and md5_file(f) == rec.get('md5'):
            paths[name] = f
        elif any(s['input'] == name for s in specs.values()):
            log(f'  input {name}: {f} is missing or changed since the run; its tables are left out')
    marked = {r[0] for r in listing}
    seqs = parse_fasta(fasta) if fasta and fasta.exists() else {}
    head = parse_fasta_headers(fasta) if fasta and fasta.exists() else {}
    header, rows, partner, lookups = T.pack(specs, paths, marked, set(seqs) | marked, log=log)
    data['tables'] = header
    data['lookups'] = lookups
    aliases = {}
    for name, spec in specs.items():
        if spec.get('format') == 'protein_values' and 'aliases' in (header.get(name) or {}).get('columns', []):
            k = header[name]['columns'].index('aliases')
            for acc, tb in rows.items():
                for r in tb.get(name, []):
                    if r[k]:
                        aliases[acc] = '; '.join(dict.fromkeys(filter(None, (aliases.get(acc, '') + '; ' + r[k]).split('; '))))
    data['protein_aliases'] = aliases
    shards: dict[int, dict] = {}
    for acc, tb in rows.items():
        shards.setdefault(shard_of(acc), {})[acc] = tb
    (out / 'data' / 'e').mkdir(parents=True, exist_ok=True)
    for k in range(SHARDS):                            # every shard, so a protein with no rows reads an empty one
        shards[k] = T.dedupe(shards.get(k, {}))
        (out / 'data' / 'e' / f'{k:02d}.json').write_text(json.dumps(shards[k], separators=(',', ':'), default=int))
    # the light pages: every protein of the snapshot without a mark, with the rows naming it as a partner
    light: dict[int, dict] = {}
    index = []
    for acc, seq in seqs.items():
        if acc in marked:
            continue
        h = head.get(acc, {})
        light.setdefault(shard_of(acc), {})[acc] = {'gene': h.get('gene', ''), 'name': h.get('name', ''), 'entry': h.get('entry', ''), 'seq': seq,
                                                    'md5': hashlib.md5(seq.encode()).hexdigest().upper(), 'tables': partner.get(acc, {})}
        index.append([acc, h.get('gene', ''), h.get('entry', ''), sum(len(v) for v in partner.get(acc, {}).values())])
    (out / 'data' / 'u').mkdir(parents=True, exist_ok=True)
    for k in range(SHARDS):
        (out / 'data' / 'u' / f'{k:02d}.json').write_text(json.dumps(T.dedupe(light.get(k, {})), separators=(',', ':'), default=int))
    (out / 'data' / 'u' / 'index.json').write_text(json.dumps(index, separators=(',', ':')))
    size = sum(f.stat().st_size for f in (out / 'data' / 'e').glob('*.json'))
    log(f'  protein tables: {len(header)} tables, {len(rows):,} proteins ({size / 1e6:.1f} MB); {len(index):,} proteins without marks')
    return shards, len(index)


def build(site_path: str | Path, out_root: str | Path | None = None, log=print, variant: str | None = None) -> Path:
    """The site's website, in <outputs.folder>/web; a variant's (site variants:, run first with ptmc run --variant) in
    <outputs.folder>/web/<variant>, so the two link to each other and deploy together."""
    from ..site import with_variant
    base = load_site(site_path)
    site = with_variant(base, variant)
    if 'website' not in site:
        raise ValueError(f"{site_path}: no website block; add website: {{name: ...}} to the site file")
    web = site['website']
    profile = load_profile(site['mark'])
    root = root_of(site)
    folder = Path(out_root or root) / site['outputs']['folder']
    if not (folder / 'statistics.tsv').exists():
        raise FileNotFoundError(f"{folder}/statistics.tsv: run the site first (ptmc run {site_path}{' --variant ' + variant if variant else ''})")
    main = Path(out_root or root) / base['outputs']['folder']
    out = main / 'web' / variant if variant else folder / 'web'
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
    # the switch between the site and its variants: each variant that has been run, and the way back
    if variant:
        data['variant'] = {**site['variant'], 'base': '../'}
    data['variants'] = [{'name': n, 'label': v['label'], 'description': v.get('description', ''), 'href': f'{n}/'}
                        for n, v in (base.get('variants') or {}).items() if not variant and (main / 'variants' / n / 'statistics.tsv').exists()]
    cit = data['citation']
    run = data['run']
    fasta = Path(run.get('inputs', {}).get(site['snapshot']['input'], {}).get('file', ''))
    (listing, mark_columns, unit_sources, mark_attrs), shards = protein_data(folder, fasta)
    data['proteins'] = listing
    # per-protein facts (proteins.attributes), aligned with the protein list; numbers as numbers
    if listing and (folder / 'protein_attributes.tsv').exists() and site.get('proteins'):
        import pandas as pd
        pa = pd.read_csv(folder / 'protein_attributes.tsv', sep='\t', dtype=str, keep_default_na=False).set_index('accession')
        specs = site['proteins']['attributes']

        def val(name, v):
            if specs[name].get('kind') == 'number':
                try:
                    return float(v) if v != '' else None
                except ValueError:
                    return None
            return v
        data['protein_attributes'] = {'specs': specs, 'values': {n: [val(n, pa.at[r[0], f'p.{n}']) if r[0] in pa.index else None for r in listing]
                                                                 for n in specs if f'p.{n}' in pa.columns}}
    data['mark_columns'] = mark_columns
    data['mark_attributes'] = mark_attrs
    if listing:
        import pandas as pd
        mk = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
        data['attribute_counts'] = {a: len({v for x in mk[f'a.{a}'] for v in x.split(s.get('separator', '; ')) if v})
                                    for a, s in site['marks'].get('attributes', {}).items() if f'a.{a}' in mk.columns}
    data['attribute_specs'] = site['marks'].get('attributes', {})
    data['reporters'] = reporters(site, folder)
    # questions answered by counting the marks (website.counts): the whole dataset's counts in the page, each
    # experiment's marks in selection.json
    data['count_questions'], sel_counts = counts_data(site, folder)
    data['structure'] = S3D.site_data(site, profile)
    # the marks shown and counted nowhere (marks.left_out): into the protein records and the page, never the selection
    shown = shown_data(folder, site, mark_attrs, shards, fasta) if listing else None
    if shown:
        data['shown_marks'], data['shown_view'] = shown, web.get('shown_marks') or {}
        log(f"  shown, not counted: {shown['n']:,} {data['words']['marks']}, {len(shown['proteins']):,} proteins with these alone")
    S3D.add(site, run, shards, log)             # each protein's structure evidence, into its record (s3d)
    data['unit_sources'] = unit_sources
    data['shards'] = SHARDS if shards else 0
    if listing:
        sel = selection_data(folder, listing, mark_columns, site['marks'].get('attributes', {}), stratum_questions(web))
        if sel_counts:
            sel['count_questions'] = sel_counts
    if shards:
        (out / 'data' / 'p').mkdir(parents=True, exist_ok=True)
        for k, recs in shards.items():
            (out / 'data' / 'p' / f'{k:02d}.json').write_text(json.dumps(recs, separators=(',', ':')))
    # the protein map's own rows: one file per shard, which the map reads when a protein opens
    map_ids, map_shards = map_data(folder, site)
    data['map_rows'], data['map_shards'] = map_ids, (SHARDS if map_shards else 0)
    if (out / 'data' / 'map').exists():
        shutil.rmtree(out / 'data' / 'map')
    if map_shards:
        (out / 'data' / 'map').mkdir(parents=True, exist_ok=True)
        for k, recs in map_shards.items():
            (out / 'data' / 'map' / f'{k:02d}.json').write_text(json.dumps(recs, separators=(',', ':')))
        log(f"  map rows: {sum(len(v) for sh in map_shards.values() for v in sh.values()):,} items in {', '.join(map_ids)}")
    inline_map = json.dumps({f'{k:02d}': v for k, v in map_shards.items()}, separators=(',', ':')).replace('</', '<\\/') if map_shards else ''
    # the regions whose track carries numbers (the IDRs and their charge), read by the page that shows them
    values = unit_value_data(folder, listing, data['tracks']) if listing else {}
    if values:
        (out / 'data').mkdir(parents=True, exist_ok=True)
        (out / 'data' / 'units.json').write_text(json.dumps(values, separators=(',', ':'), allow_nan=False))
        for t in data['tracks']:
            if t['kind'] in values:
                t['values'] = {**t['values'], 'n': len(values[t['kind']]['rows'])}
        log('  region values: ' + ', '.join(f"{len(v['rows']):,} {k}" for k, v in values.items()))
    elif (out / 'data' / 'units.json').exists():
        (out / 'data' / 'units.json').unlink()
    # the tables the protein pages show (website.tables, in the formats of CONTRACTS.md): each protein's rows beside its
    # page (data/e), the rows naming a protein without marks on its own light page (data/u), lookups in the page
    ev_shards, light = protein_tables(web.get('tables') or {}, run, data, listing, fasta, out, log) if listing else ({}, 0)
    data['light_pages'] = light
    if listing:
        # the search's words and the filters that read more than the marks' classes (website.search): windows and
        # distances beside the marks, the partners in their own file
        from . import search as SR
        data['search'] = SR.data(site, run, sel, listing, fasta, out, log)
        (out / 'data').mkdir(parents=True, exist_ok=True)
        (out / 'data' / 'selection.json').write_text(json.dumps(sel, separators=(',', ':')))
        log(f"  selection data: {len(sel['marks']):,} marks, {(out / 'data' / 'selection.json').stat().st_size / 1e6:.1f} MB")
    inline_values = (out / 'data' / 'units.json').read_text().replace('</', '<\\/') if values else ''
    inline_proteins = json.dumps({f'{k:02d}': v for k, v in shards.items()}, separators=(',', ':')).replace('</', '<\\/')
    inline_selection = (out / 'data' / 'selection.json').read_text().replace('</', '<\\/') if (out / 'data' / 'selection.json').exists() else ''
    inline_partners = (out / 'data' / 'partners.json').read_text().replace('</', '<\\/') if (out / 'data' / 'partners.json').exists() else ''
    # the one-file copy holds the protein pages and their tables up to the site's limit (website.one_file_max_mb)
    cap = int(web.get('one_file_max_mb', 64) * 1_000_000)
    if len(inline_proteins) > cap:
        log(f'  the one-file copy leaves out the protein pages ({len(inline_proteins) / 1e6:.0f} MB, over {cap / 1e6:.0f} MB); index.html has them')
        inline_proteins = '{}'
    inline_tables = json.dumps({f'{k:02d}': v for k, v in ev_shards.items()}, separators=(',', ':'), default=int).replace('</', '<\\/')
    if inline_proteins == '{}' or len(inline_proteins) + len(inline_tables) > cap:
        inline_tables = '{}'
    if inline_proteins == '{}' or len(inline_proteins) + len(inline_map) > cap:
        inline_map = ''

    # the rows travel once, as the statistics table's own text (for its downloads): the page reads its rows from it
    page_data = {k: v for k, v in data.items() if k != 'rows'}

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
        # the studies that report the marks, most first: the original asked readers to cite those whose marks they use
        rep = data.get('reporters')
        # the studies that report the marks, as one link to their list (the original asked readers to cite them)
        studies = (f'the <a href="#method/sources">{len(rep["items"])} {html.escape(rep["label"].lower())}</a> that report the {html.escape(data["words"]["marks"])} you use'
                   if rep and rep['items'] else '')
        if not cit:
            cite_html = ''
        elif pref:
            cite_html = (f'<p class="lede-cite">Please cite <a href="https://doi.org/{html.escape(pref["doi"])}">{html.escape(pref["short"])}</a>, '
                         + (f'{studies}, ' if studies else '') + 'and the original data sources (<a href="#method/cite">how to cite</a>).</p>')
        else:
            cite_html = (f'<p class="lede-cite">Please cite {studies + " and " if studies else ""}the original data sources '
                         f'(<a href="#method/cite">how to cite</a>).</p>')
        version = ''
        if cit:
            version = f'Version {html.escape(cit["version"])}' + (f' ({human_date(cit["date"])})' if cit.get('date') else '')
            if cit.get('doi'):
                version += (f' · <a class="doi-badge" href="https://doi.org/{html.escape(cit["doi"])}"><span>DOI</span>'
                            f'<span>{html.escape(cit["doi"])}</span></a>')
        ds = web.get('dataset')
        if ds:                                         # the data release shown, with its archive DOI
            name = html.escape(ds.get('label', 'dataset'))
            v = html.escape(ds['version'])
            version += (f'{" · " if version else ""}{name} ' + (f'<a href="{html.escape(ds["url"])}">{v}</a>' if ds.get('url') else v)
                        + (f' <a class="doi-badge" href="https://doi.org/{html.escape(ds["doi"])}"><span>DOI</span><span>{html.escape(ds["doi"])}</span></a>' if ds.get('doi') else ''))
        version += (f'{" · " if version else ""}<a href="#method">method</a> · '
                    + ('<a href="#method/download">download the data</a>' if web.get('downloads') else '<a href="#sites">download the sites</a>'))
        if inline:
            css = f'<style>{_asset("assets/kit.css").read_text()}</style>'
            js = (f'<script id="protein-data" type="application/json">{inline_proteins}</script>'
                  + (f'<script id="table-data" type="application/json">{inline_tables}</script>' if inline_tables != '{}' else '')
                  + (f'<script id="map-data" type="application/json">{inline_map}</script>' if inline_map else '')
                  + (f'<script id="selection-data" type="application/json">{inline_selection}</script>' if inline_selection else '')
                  + (f'<script id="partners-data" type="application/json">{inline_partners}</script>' if inline_partners else '')
                  + (f'<script id="unit-values" type="application/json">{inline_values}</script>' if inline_values else '')
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
                           '{{DATA}}': json.dumps(page_data, separators=(',', ':'), allow_nan=False).replace('</', '<\\/')}.items():
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


def _licence_words(spdx: str) -> str:
    """CC-BY-NC-SA-4.0 -> CC BY-NC-SA 4.0; MIT stays MIT."""
    return spdx.replace('CC-', 'CC ', 1).rsplit('-', 1)[0] + ' ' + spdx.rsplit('-', 1)[1] if spdx.startswith('CC-') else spdx


def pages(site_paths: list, out: str | Path, out_root: str | Path | None = None, log=print, skip_missing: bool = False) -> Path:
    """One folder to publish (GitHub Pages, or any static host): each site's website under its id, and a landing page
    in the same look listing them. Run ptmc run and ptmc web for each site first; with skip_missing, a site whose
    website was not built (its sources could not be fetched) is left out with a warning instead of failing the rest."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    (out / '.nojekyll').write_text('')
    cards, lab = [], None
    for sp in site_paths:
        site = load_site(sp)
        web = site.get('website', {})
        src = Path(out_root or root_of(site)) / site['outputs']['folder'] / 'web'
        if not (src / 'index.html').exists():
            if skip_missing:
                log(f'  warning: {sp} has no website ({src}/index.html); left out of this build')
                continue
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
        # each site's card: what it holds (its tagline, how many marks on how many proteins, its questions, its
        # sequences, version and licence) and three ways to start in it, the same as its own start panel
        sid, name, marks_word = html.escape(site['id']), html.escape(web.get('name', site['title'])), html.escape(profile.words['marks'])
        # the questions, named as the site's Overview groups them (its sections), else by their own titles
        n_q = len(run.get('analyses') or {})
        titles = [x['name'] for x in ((web.get('overview') or {}).get('sections') or []) if x.get('name')] \
            or [(site_analysis.get('title') if isinstance(site_analysis, dict) else None) or a.get('title') or k
                for (k, a), site_analysis in zip((run.get('analyses') or {}).items(), [*(site.get('analyses') or []), *[None] * n_q])]
        starts = [x for x in ((web.get('start') or {}).get('examples') or []) if x.get('query')] or [{'query': e} for e in (web.get('examples') or [])]
        start_links = ''.join(f'<li><a href="{sid}/#overview?q={html.escape(quote(x["query"]))}">{html.escape(x.get("label") or x["query"])}'
                              + (f' <span class="mono">{html.escape(x["query"])}</span>' if x.get('label') else '') + '</a></li>' for x in starts[:3])
        facts = [f'{run["marks"]["counted"]:,} {marks_word} on {run["marks"]["proteins"]:,} proteins',
                 f'{n_q} question{"s" if n_q != 1 else ""}' + (f': {html.escape(", ".join(t for t in titles[:5]))}{", …" if len(titles) > 5 else ""}' if titles else ''),
                 f'sequences: {html.escape(run["snapshot"]["release"])}']
        if cit:
            facts.append(f'version {html.escape(cit["version"])}' + (f' · data {html.escape(_licence_words(cit.get("licence", "")))}' if cit.get('licence') else ''))
        cards.append(
            f'<article class="land-card" aria-labelledby="card-{sid}"><div class="band" style="background:linear-gradient(160deg,{band[0]},{band[1]})">'
            f'<h2 id="card-{sid}"><a href="{sid}/">{name}</a></h2></div><div class="body"><p>{html.escape(web.get("tagline", ""))}</p>'
            f'<ul class="facts">{"".join(f"<li>{f}</li>" for f in facts)}</ul>'
            + (f'<p class="start-h">Start with</p><ul class="starts">{start_links}</ul>' if start_links else '')
            + f'<p><a class="open" href="{sid}/">Open the {name} ›</a></p></div></article>')
        log(f'  {site["id"]} -> {dest}')
    kit = kit_citation()
    lab_html = (f'<a class="brand-mark" href="{html.escape(lab.get("url", "#"))}"><span>{html.escape(lab.get("name", ""))}'
                f'<small>{html.escape(lab.get("affiliation", ""))}</small></span></a>') if lab else ''
    kit_link = f'<a href="{html.escape(kit["url"])}">ptmcontext</a>'
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Where modifications fall in proteins · ptmcontext</title>
<meta name="description" content="Websites, one per modification and proteome, that test where modification sites fall in proteins and which kinds of protein carry them.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{html.escape(FONTS['stylesheet'])}">
<link rel="stylesheet" href="{html.escape(site_paths and load_site(site_paths[0])['id'])}/assets/kit.css">
<style>
.sites {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(min(24rem, 100%), 1fr)); gap: 1rem; padding-block: 0.5rem 1rem; }}
.land-card {{ position: relative; display: grid; grid-template-rows: auto 1fr; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; box-shadow: var(--shadow); color: var(--ink); }}
.land-card:hover, .land-card:focus-within {{ box-shadow: var(--shadow-hover); }}
.land-card .band {{ padding: 1.1rem 1.1rem 1rem; border-bottom: 3px solid var(--accent-l); }}
.land-card h2 {{ font-size: 1.3rem; }}
.land-card h2 a {{ color: #fff; text-decoration: none; }}
.land-card h2 a:hover {{ text-decoration: underline; }}
.land-card h2 a:focus-visible {{ outline: 3px solid #fff; outline-offset: 3px; }}
.land-card .body {{ display: grid; align-content: start; gap: 0.5rem; padding: 0.9rem 1.1rem 1.1rem; font-size: 0.92rem; }}
.land-card .body p {{ margin: 0; }}
.facts {{ margin: 0; padding-left: 1.1rem; color: var(--ink-2); display: grid; gap: 0.15rem; }}
.start-h {{ font-weight: 600; margin-top: 0.3rem !important; }}
.starts {{ list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }}
.starts a {{ display: inline-flex; gap: 0.4rem; align-items: center; min-height: 32px; padding: 0.2rem 0.7rem; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-2); color: var(--ink); text-decoration: none; }}
.starts a:hover {{ border-color: var(--accent); }}
.starts .mono {{ color: var(--accent-dark); }}
.land-card .open {{ font-weight: 600; display: inline-block; min-height: 24px; }}
.how {{ max-width: 62rem; padding-block: 1.25rem 0.5rem; }}
.how h2 {{ font-size: 1.25rem; margin-bottom: 0.4rem; }}
.how ol {{ margin: 0; padding-left: 1.3rem; display: grid; gap: 0.25rem; }}
.land-foot {{ margin-top: 2rem; padding-block: 1rem 2rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.85rem; }}
.land-foot p {{ max-width: 62rem; margin: 0 0 0.4rem; }}
.hero :focus-visible {{ outline: 3px solid #fff; outline-offset: 2px; }}
</style></head>
<body><a class="skip" href="#sites">Skip to the sites</a>
<header class="hero"><div class="wrap"><div class="brand"><h1>Where modifications fall in proteins</h1><div class="brand-side">{lab_html}</div></div>
<div class="lede"><p class="lede-what">Each website below holds the sites of one protein modification in one proteome, and asks where they fall: in disordered
regions, domains and motifs, and on which kinds of protein. Every question is tested two ways, within each protein (Mantel–Haenszel) and pooled
(Fisher), and tested again on any selection you make: a protein, a list of genes, a class.</p>
<p class="lede-note">The websites are built by {kit_link} {html.escape(kit['version'])}, which makes each one from a single file that names its modification,
its sequences, its data and its questions, so every site has the same pages, tests and downloads.</p></div></div></header>
<main class="wrap" id="sites">
<section class="how" aria-labelledby="how-h"><h2 id="how-h">How to start</h2><ol>
<li>Pick a site below, or one of its starts: a list of genes, a class or one site.</li>
<li>Type a gene, a list of genes or a term in its search box: the Overview tests every question again on your selection, in your browser.</li>
<li>Open a protein for its map, the evidence for each site and its structures; every figure and table downloads as PDF, SVG, PNG or TSV with how to cite it.</li>
</ol><p class="muted">On every site, <b>Help</b> explains the search, the figures and the downloads, and <kbd>?</kbd> lists the keyboard shortcuts.</p></section>
<h2 class="vh">The sites</h2>
<div class="sites">{''.join(cards)}</div></main>
<footer class="wrap land-foot"><p>Code: {kit_link}, {html.escape(_licence_words(kit.get('licence', 'MIT')))} licence. Each site's data are under the licence its page states.</p>
<p>No cookies, no tracking: every test runs in your browser, and nothing you search or select leaves it.</p></footer></body></html>
"""
    (out / 'index.html').write_text(page)
    log(f'  -> {out / "index.html"}')
    return out / 'index.html'
