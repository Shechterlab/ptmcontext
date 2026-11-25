"""The Compare marks page of `ptmc pages`: each explorer's own result for the questions they share, side by side.

Nothing is recomputed. A cell is the row an explorer's own statistics table holds for a class, read the way that
explorer's page reads it (the fold it shows, the odds ratio and q of its test, the test's name and its comparison
group, n); a class an explorer does not test is "not tested", never 0. The questions and classes to pair, their labels
and the page's words come from the landing config's `compare` block (sites/landing.yml); no site is named here.
Written beside the landing page: compare/index.html (the page, with its data inline) and compare/compare.json.
See CONTRACTS.md, "Compare marks".
"""

from __future__ import annotations

import csv
import html
import json
from pathlib import Path

PADJ, MIN_EFFECT = 0.05, 1.1  # the explorers' reading: q at most 0.05 and a fold of at least 1.1 either way (kit.js)
FOLD_METHODS = ('fisher', 'mantel_haenszel', 'study')  # a residue row's fold is read from these rows' counts
BIG = 1e300  # an infinite odds ratio (every set member marked), as the explorers write it

# the explorers name a test by the words below (kit.js METHOD, testName): the same words, from the row's method
TEST_NAMES = {
    'mantel_haenszel': 'within each protein',
    'fisher': 'across all proteins',
    'study': 'within studies',
    'mann_whitney': 'by size (Mann-Whitney)',
}
SET_TEST_NAMES = {
    'enricher': 'proteins, hypergeometric',
    'mantel_haenszel': 'proteins, within abundance deciles (estimate)',
}
SET_NOTE = 'Not adjusted for protein abundance; abundant proteins have more detected sites.'

MATCH = Path(__file__).parent / 'assets' / 'land-match.js'  # the search's matching, shared with the landing page
ASSET = Path(__file__).parent / 'assets' / 'land-compare.js'

CSS = """
.cmp-wrap { max-width: 78rem; }
.cmp-intro { max-width: 46rem; margin: 1.5rem 0 0.25rem; font-size: 1.15rem; line-height: 1.5; }
.cmp-statement { max-width: 46rem; margin: 0 0 1rem; color: var(--ink-2); line-height: 1.5; }
.cmp-how { max-width: 46rem; margin: 0 0 1.25rem; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.cmp-how > summary { cursor: pointer; padding: 0.65rem 0.9rem; font-weight: 600; min-height: 24px; }
.cmp-how > div { padding: 0 0.9rem 0.6rem; color: var(--ink-2); line-height: 1.5; }
.cmp-how p { margin: 0 0 0.6rem; }
.cmp-bar { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; align-items: flex-end; margin: 0 0 0.75rem; }
.cmp-bar fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.cmp-bar legend, .cmp-bar label.cmp-lab { font-size: 0.85rem; color: var(--muted); padding: 0; display: block; margin-bottom: 0.2rem; }
.cmp-picks { display: flex; flex-wrap: wrap; gap: 0.35rem 0.5rem; }
.cmp-picks label { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 36px; padding: 0 0.7rem; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); cursor: pointer; }
.cmp-picks input { margin: 0; width: 1rem; height: 1rem; }
.cmp-picks i { width: 0.7rem; height: 0.7rem; border-radius: 50%; display: inline-block; }
.cmp-find { flex: 1 1 16rem; max-width: 26rem; }
.cmp-find input { font: inherit; width: 100%; box-sizing: border-box; min-height: 36px; padding: 0 0.6rem; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); color: var(--ink); }
.cmp-n { display: block; min-height: 1.3em; margin-top: 0.15rem; font-size: 0.85rem; color: var(--muted); }
.cmp-n .linkish { font: inherit; padding: 0; border: 0; background: none; color: inherit; text-decoration: underline; cursor: pointer; }
.cmp-bar select { font: inherit; min-height: 36px; padding: 0 0.6rem; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); color: var(--ink); max-width: 100%; }
.cmp-dl { position: relative; margin-left: auto; }
.cmp-dl > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; min-height: 36px; padding: 0 0.9rem; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); font-weight: 600; }
.cmp-dl > summary::-webkit-details-marker { display: none; }
.cmp-dl[open] > summary { background: var(--surface-2); }
.cmp-dl .cmp-menu { position: absolute; right: 0; top: calc(100% + 0.3rem); z-index: 5; min-width: 13rem; display: grid; padding: 0.3rem; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow-hover); }
.cmp-dl .cmp-menu button { font: inherit; text-align: left; min-height: 40px; padding: 0 0.7rem; border: 0; border-radius: 7px; background: none; color: var(--ink); cursor: pointer; }
.cmp-dl .cmp-menu button:hover, .cmp-dl .cmp-menu button:focus-visible { background: var(--surface-2); }
.cmp-legend { display: flex; flex-wrap: wrap; gap: 0.3rem 1.25rem; margin: 0 0 0.75rem; padding: 0; list-style: none; font-size: 0.85rem; color: var(--ink-2); }
.cmp-legend li { display: inline-flex; align-items: center; gap: 0.35rem; }
.cmp-frame { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); max-width: 100%; }
.cmp-frame:focus-visible { outline: 3px solid var(--accent-dark); outline-offset: 2px; }
.cmp-table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 44rem; font-size: 0.92rem; }
.cmp-table th, .cmp-table td { padding: 0.45rem 0.7rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.cmp-table thead th { position: sticky; top: 0; z-index: 2; background: var(--surface-2); font-weight: 600; border-top: 4px solid var(--c, var(--line-strong)); vertical-align: bottom; }
.cmp-table thead th a { color: inherit; }
.cmp-table tbody th[scope=row] { position: sticky; left: 0; z-index: 1; background: var(--surface); font-weight: 500; min-width: 11rem; max-width: 16rem; }
.cmp-table thead th:first-child { left: 0; z-index: 3; }
.cmp-table tbody th[scope=row], .cmp-table tr.q > th, .cmp-table thead th:first-child { border-right: 1px solid var(--line-strong); }
.cmp-sort { font: inherit; font-size: 0.8rem; background: none; border: 0; padding: 0.15rem 0; color: var(--muted); cursor: pointer; text-decoration: underline dotted; min-height: 24px; display: block; }
.cmp-sort[aria-pressed=true] { color: var(--ink); font-weight: 600; }
.cmp-table tr.q > th, .cmp-table tr.q > td { background: var(--surface-2); font-size: 0.8rem; color: var(--ink-2); font-weight: 400; border-bottom: 1px solid var(--line-strong); }
.cmp-table tr.q > th { font-size: 0.95rem; color: var(--ink); font-weight: 700; }
.cmp-table tr.q .q-test { display: block; }
.cmp-table tr.q .q-group { display: block; color: var(--muted); }
.cmp-table tr.q .q-line { display: block; position: sticky; left: 12rem; width: min(60rem, calc(100vw - 3.5rem - 12rem)); color: var(--muted); }
.cmp-table tr.q .q-dag { margin-left: 0.15rem; font-weight: 400; color: var(--muted); cursor: help; }
.cmp-table tr.q-d > th { padding: 0; }
.cmp-table tr.q .q-flag { display: block; color: var(--more); font-weight: 600; }
.cmp-gh td { background: var(--surface); padding: 0.9rem 0.7rem 0.3rem; border-bottom: 0; }
.cmp-gh td > * { position: sticky; left: 0.7rem; max-width: min(40rem, calc(100vw - 4.5rem)); }
.cmp-table tr.q > th { position: sticky; left: 0; z-index: 1; min-width: 11rem; max-width: 16rem; }
.cmp-gh h2 { margin: 0; font-size: 1.1rem; }
.cmp-gh p { margin: 0.15rem 0 0; font-size: 0.85rem; color: var(--ink-2); }
.cmp-table td.c { white-space: nowrap; font-variant-numeric: tabular-nums; }
.cmp-table td.c .m { vertical-align: middle; margin-right: 0.35rem; }
.cmp-table td.c .v { font-weight: 600; }
.cmp-table td.c.more .v { color: var(--more); }
.cmp-table td.c.less .v { color: var(--less); }
.cmp-table td.c .s { display: block; margin-left: 1.75rem; font-size: 0.78rem; color: var(--muted); font-weight: 400; }
.cmp-table td.nt { color: var(--muted); font-style: italic; }
.cmp-note { max-width: 46rem; margin: 0.75rem 0 0; color: var(--ink-2); font-size: 0.9rem; }
.cmp-empty { padding: 1rem; color: var(--muted); }
.cmp-dot-more { fill: var(--more); stroke: var(--more); }
.cmp-dot-less { fill: var(--less); stroke: var(--less); }
.cmp-dot-same { fill: var(--same); stroke: var(--same); }
.cmp-dot-ns { fill: var(--surface); stroke: var(--same); stroke-width: 1.5; }
.cmp-ring { fill: none; stroke-width: 1.2; opacity: 0.55; }
.cmp-ring.more { stroke: var(--more); } .cmp-ring.less { stroke: var(--less); } .cmp-ring.same { stroke: var(--same); }
@media (max-width: 640px) { .cmp-table tr.q .q-line { left: 9rem; width: calc(100vw - 3.5rem - 9rem); } .cmp-table tr.q > th { min-width: 7.5rem; max-width: 9rem; font-size: 0.85rem; } .cmp-dl { margin-left: 0; } .cmp-bar { gap: 0.6rem 1rem; } .cmp-table tbody th[scope=row] { min-width: 7.5rem; max-width: 9rem; font-size: 0.85rem; } .cmp-table th, .cmp-table td { padding: 0.4rem 0.5rem; } }
"""


# ---- the data -----------------------------------------------------------------------------------------------------------
def _num(v):
    """A number from a statistics cell: an empty cell or NaN is None; an infinite odds ratio is 1e300, as the explorers write it."""
    if v is None or v == '' or v == 'nan':
        return None
    if v == 'inf':
        return BIG
    if v == '-inf':
        return 0.0
    try:
        x = float(v)
    except ValueError:
        return None
    return None if x != x else x


def read_rows(path: Path) -> dict:
    """An explorer's statistics.tsv as {(analysis, category): {method: row}}: the numbers as its page reads them, the
    comparison group (`background`) as the table words it. A question of several tests (another stratum) is skipped:
    only the rows of stratum `all`."""
    out: dict = {}
    with open(path, newline='') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            if r.get('stratum') not in ('all', '', None):
                continue
            out.setdefault((r['analysis'], r['category']), {})[r['method']] = {
                'a': int(r['a']) if r['a'] != '' else None,
                'b': int(r['b']) if r['b'] != '' else None,
                'c': int(r['c']) if r['c'] != '' else None,
                'd': int(r['d']) if r['d'] != '' else None,
                'or': _num(r['odds_ratio']),
                'fold': _num(r['fold_enrichment']),
                'lo': _num(r['odds_ratio_ci_low']),
                'hi': _num(r['odds_ratio_ci_high']),
                'p': _num(r['p']),
                'q': _num(r['q']),
                'background': r.get('background', ''),
            }
    return out


def _direction(v, t, q) -> str:
    """The explorers' reading of a row (kit.js dir): q at most 0.05, the fold and the test pointing the same way, a fold of at least 1.1 either way."""
    if v is None or q is None or q > PADJ:
        return 'ns'
    if t is not None and (v >= 1) != (t >= 1):
        return 'ns'
    return 'more' if v >= MIN_EFFECT else 'less' if v <= 1 / MIN_EFFECT else 'same'


def cell(rows: dict, analysis: dict, aid: str, cat: str) -> dict | None:
    """One explorer's result for a class, as its own page shows it, or None when it has no row for it.

    A residue question is read by its default test (within each protein): the fold is the share of the marks in the class
    over the share of the comparison residues in it, from that row's counts; the odds ratio, its interval and q are the
    test's. A protein-set question shows the fold enrichment of its hypergeometric row, with the direction and q read from
    its test within abundance deciles where it has one."""
    by = rows.get((aid, cat))
    if not by:
        return None
    sets = analysis.get('kind') == 'protein_sets'
    r = by.get('enricher' if sets else 'mantel_haenszel')
    if r is None:
        return None
    eff = r['or'] if r['or'] is not None else r['fold']
    if eff is None:
        return {'state': 'few', 'analysis': aid, 'title': analysis.get('title', aid)}
    shown = None
    if sets:
        shown = r['fold']
    elif None not in (r['a'], r['b'], r['c'], r['d']) and r['a'] + r['b'] > 0 and r['c'] + r['d'] > 0 and r['c'] > 0:
        shown = (r['a'] / (r['a'] + r['b'])) / (r['c'] / (r['c'] + r['d']))
    v = shown if shown is not None else eff
    # a protein set is read by its own hypergeometric row (fold, q, direction), not adjusted for protein abundance; the test
    # within abundance deciles is an estimate that goes beside it (`est`), never into the reading
    est = by.get('mantel_haenszel') if sets else None
    if est is not None and est['or'] is None:
        est = None
    t = r  # the row that carries the reading
    t_eff = t['or'] if t['or'] is not None else t['fold']
    few = t_eff is None or t['p'] is None
    out = {
        'state': 'few' if few else 'ok',
        'analysis': aid,
        'title': analysis.get('title', aid),
        'v': None if v >= BIG else v,  # the explorers print a fold of 1,000 or more as "> 1,000"
        'big': v >= BIG,
        'measure': 'fold enrichment' if sets else 'fold',
        'or': None if sets or t_eff is None or t_eff >= BIG else t_eff,
        'lo': None if sets or t['lo'] is None or t['lo'] >= BIG else t['lo'],
        'hi': None if sets or t['hi'] is None or t['hi'] >= BIG else t['hi'],
        'q': t['q'],
        'dir': _direction(v, t_eff, t['q']),
        # q at most 0.05 but the fold and the test point different ways: the explorers give no reading (hollow)
        'split': bool(t['q'] is not None and t['q'] <= PADJ and t_eff is not None and (v >= 1) != (t_eff >= 1)),
        'n': r['a'],
        'test': SET_TEST_NAMES['enricher'] if sets else TEST_NAMES['mantel_haenszel'],
        'est': None
        if est is None
        else {
            'or': None if est['or'] >= BIG else est['or'],
            'lo': None if est['lo'] is None or est['lo'] >= BIG else est['lo'],
            'hi': None if est['hi'] is None or est['hi'] >= BIG else est['hi'],
            'q': est['q'],
            'test': SET_TEST_NAMES['mantel_haenszel'],
        },
        'group': r['background'],
        'label': (analysis.get('labels') or {}).get(cat) or cat.replace('_', ' '),
    }
    return out


def explorer_entry(site: dict, folder: Path, web_cfg: dict, label: str, short: str | None, href: str) -> dict:
    """The explorer's identity and what a file made from this page must say about it: its name, its data release and
    DOI (website.dataset) and the citation its own exports give (its citation file)."""
    from ..citation import site_citation

    ds = web_cfg.get('dataset') or {}
    cit = site_citation(site) or {}
    pref = cit.get('preferred') or {}
    return {
        'id': site['id'],
        'label': label,
        'short': short or label,
        'href': href,
        'band': (web_cfg.get('band') or [None])[0],
        'release': {k: ds[k] for k in ('version', 'date', 'doi', 'url') if ds.get(k)},
        'app': {k: cit[k] for k in ('version', 'date', 'doi') if cit.get(k)},
        'cite': {'text': pref.get('text', ''), 'doi': pref.get('doi', '')},
    }


def build_data(cfg: dict, built: list[dict], log=print) -> dict | None:
    """compare.json: for each paired question and class, each built explorer's cell. `built`: the explorers (the entry of
    explorer_entry, plus `rows` and `analyses`: its statistics and its analyses as site_data lists them) in page order.
    None when the config has no `compare` block or fewer than two explorers are built."""
    spec = cfg.get('compare')
    if not spec:
        return None
    if len(built) < 2:
        log('  compare: fewer than two explorers are built; the Compare marks page is left out')
        return None
    explorers = [{k: v for k, v in e.items() if k not in ('rows', 'analyses')} for e in built]
    groups, notes = [], []
    for g in spec.get('groups') or []:
        qs = []
        for q in g.get('questions') or []:
            aid = q['analysis']
            per_site = {e['id']: (q.get('per') or {}).get(e['id'], {}) for e in built}
            analyses = {
                e['id']: next((a for a in e['analyses'] if a['id'] == per_site[e['id']].get('analysis', aid)), None)
                for e in built
            }
            tests = {}
            for e in built:
                a = analyses[e['id']]
                if a is None:
                    continue
                sets = a.get('kind') == 'protein_sets'
                tests[e['id']] = {
                    'test': SET_TEST_NAMES['enricher'] if sets else TEST_NAMES['mantel_haenszel'],
                    'note': SET_NOTE if sets else '',
                    'kind': 'sets' if sets else 'residues',
                    'title': a.get('title', aid),
                    'analysis': per_site[e['id']].get('analysis', aid),
                }
            rows = []
            for c in q.get('classes') or []:
                cells = {}
                for e in built:
                    a = analyses[e['id']]
                    ov = (c.get('per') or {}).get(e['id'], {})
                    cells[e['id']] = (
                        cell(
                            e['rows'],
                            a,
                            ov.get('analysis', per_site[e['id']].get('analysis', aid)),
                            ov.get('class', c['class']),
                        )
                        if a is not None
                        else None
                    )
                # one label source: the name the explorers give the class (when they agree), else the page file's
                own = {x['label'] for x in cells.values() if x and x.get('label')} - {c['class'].replace('_', ' ')}
                rows.append(
                    {
                        'id': f'{q["id"]}:{c["class"]}',
                        'class': c['class'],
                        'label': next(iter(own)) if len(own) == 1 else c.get('label') or c['class'],
                        'cells': cells,
                    }
                )
            # an explorer that has none of the question's classes does not test it here
            for e in built:
                if e['id'] in tests and not any(row['cells'].get(e['id']) for row in rows):
                    del tests[e['id']]
            # the test and the comparison group each explorer used for the question (as its rows say), one per explorer
            for e in built:
                t = tests.get(e['id'])
                if not t:
                    continue
                groups_seen = {
                    row['cells'][e['id']]['group']
                    for row in rows
                    if row['cells'].get(e['id']) and row['cells'][e['id']].get('group')
                }
                t['group'] = sorted(groups_seen)[0] if groups_seen else ''
                if len(groups_seen) > 1:
                    t['group_all'] = sorted(groups_seen)
            same = len({(t['test'], t['kind']) for t in tests.values()}) <= 1
            q_out = {
                'id': q['id'],
                'title': q.get('title') or aid,
                'analysis': aid,
                'tests': tests,
                'same_test': same,
                'rows': rows,
            }
            if not same:
                notes.append(
                    f'{q["id"]}: the explorers do not use the same test ({sorted({t["test"] for t in tests.values()})})'
                )
            # the same class under another name in another explorer: say it (the page shows each explorer's own label)
            for row in rows:
                names = {e: c['label'] for e, c in row['cells'].items() if c and c.get('label')}
                if len(set(names.values())) > 1:
                    row['own_labels'] = names
                    notes.append(
                        f'{row["id"]}: the explorers name the class differently ({sorted(set(names.values()))})'
                    )
            qs.append(q_out)
        groups.append({'id': g['id'], 'title': g.get('title') or g['id'], 'note': g.get('note', ''), 'questions': qs})
    for n in notes:
        log(f'  compare: {n}')
    return {
        'version': 1,
        'title': spec.get('title') or 'Compare marks',
        'statement': spec.get('statement', ''),
        'explorers': explorers,
        'groups': groups,
        'notes': notes,
    }


# ---- the page -----------------------------------------------------------------------------------------------------------
def page(
    data: dict, spec: dict, *, cfg: dict, kit_css, fonts_css, lab_html, built_with, logo, favicon, skipped: list
) -> str:
    """The Compare marks page, in the landing page's look (kit.css). It sits in compare/, so each address is one level up."""
    from . import landing as LP

    title = html.escape(spec.get('title') or 'Compare marks')
    lede = html.escape(spec.get('lede') or '')
    how = ''.join(f'<p>{html.escape(p)}</p>' for p in spec.get('how') or [])
    links = ''.join(
        f'<li><a href="{html.escape(x["url"])}">{html.escape(x["label"])}</a></li>'
        for x in (cfg.get('footer') or {}).get('links') or []
    )
    brand = html.escape(cfg.get('title') or 'ptmcontext')
    blob = json.dumps(data, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
    note = ''.join(f'<p class="cmp-note">{html.escape(s)}</p>' for s in skipped)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}: {brand}</title>
<meta name="description" content="{html.escape(spec.get('intro') or '')}">
{f'<link rel="icon" href="../{html.escape(favicon or logo)}">' if favicon or logo else ''}
<link rel="stylesheet" href="../{html.escape(fonts_css)}">
{f'<link rel="stylesheet" href="../{html.escape(kit_css)}">' if kit_css else ''}
<style>{LP.CSS}{CSS}</style>
<script>try {{ var t = localStorage.getItem('ptmc-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; }} catch (e) {{}}</script></head>
<body><a class="skip" href="#cmp-main">Skip to the comparison</a>
<header class="hero"><div class="wrap"><div class="brand"><div class="brand-name"><a class="brand-line" href="../">{brand}</a><h1{' class="land-title"' if logo else ''}>{f'<img class="site-mark" src="../{html.escape(logo)}" alt="" width="52" height="52">' if logo else ''}{title}</h1></div><div class="brand-side">{lab_html}</div></div>
{f'<div class="lede"><p class="lede-what">{lede}</p></div>' if lede else ''}</div></header>
<main class="wrap cmp-wrap" id="cmp-main">
<p class="cmp-intro">{html.escape(spec.get('intro') or '')}</p>
<p class="cmp-statement">{html.escape(spec.get('statement') or '')}</p>
<details class="cmp-how"><summary>How to read this</summary><div>{how}</div></details>
<div id="cmp-app"><noscript><p class="cmp-note">This page needs JavaScript. The same numbers are in <a href="compare.json">compare.json</a>.</p></noscript></div>
{note}
</main>
<footer class="wrap land-foot"><ul aria-label="Footer"><li><a href="../">All explorers</a></li>{links}<li><a href="compare.json">Data (JSON)</a></li><li><a href="#privacy">Privacy</a></li></ul>
<span class="theme-switch" role="group" aria-label="Color theme"><button type="button" data-theme-choice="auto">Auto</button><button type="button" data-theme-choice="light">Light</button><button type="button" data-theme-choice="dark">Dark</button></span>
<p>{built_with}</p>
<p id="privacy">No cookies, no tracking. The numbers are copied from each explorer's own build; this page asks no other site for data. A PDF download loads one script from cdnjs.cloudflare.com.</p></footer>
<script id="cmp-data" type="application/json">{blob}</script>
<script>{LP.THEME_JS}</script><script>{MATCH.read_text()}</script><script>{ASSET.read_text()}</script></body></html>
"""


def link_html(spec: dict) -> str:
    """The landing page's link to the page: one line above the explorers."""
    return (
        f'<p class="land-compare"><a href="compare/">{html.escape(spec.get("title") or "Compare marks")}</a>'
        f' <span class="muted">{html.escape(spec.get("link_note") or spec.get("lede") or "")}</span></p>'
    )


LINK_CSS = '.land-compare { margin: 0.5rem 0 0; font-size: 1rem; } .land-compare a { font-weight: 600; } .land-compare .muted { color: var(--muted); }'


def add_link(text: str, spec: dict) -> str:
    """The landing page with its link to the page, above the explorers' heading (the landing page's own code is unchanged)."""
    anchor = '<h2 class="vh">The explorers</h2>'
    if anchor not in text:
        return text
    text = text.replace(anchor, link_html(spec) + '\n' + anchor, 1)
    return text.replace('</style>', LINK_CSS + '</style>', 1)


def write(out: Path, data: dict, text: str) -> Path:
    d = out / 'compare'
    d.mkdir(parents=True, exist_ok=True)
    (d / 'compare.json').write_text(json.dumps(data, indent=1, ensure_ascii=False))
    (d / 'index.html').write_text(text)
    return d / 'index.html'
