"""The entry pages' pictures, chosen from a site's own statistics: where its marks fall (one analysis whose classes
partition the marks) and its strongest findings (one row per question). A site file may name them (website.start.share,
website.start.findings, and website.landing; website.landing.from_section limits the computed findings to the questions
of one Overview section); without them they are computed here, so another site gets the same
pictures with no code. The result is embedded in the site's page (D.glance) and written to web/glance.json for the
landing page."""

from __future__ import annotations

import math

MIN_N = 20  # a finding rests on at least this many marks (or proteins) in the class
PADJ, MIN_EFFECT = 0.05, 1.1
N_FINDINGS = 3
BIG = 1e299  # an infinite odds ratio travels as 1e300: not a number to draw


def _eff(r: dict):
    e = r.get('or') if r.get('or') is not None else r.get('fold')
    return e if e is not None and 0 < e < BIG else None


def _preferred(a: dict) -> str:
    return 'enricher' if a.get('kind') == 'protein_sets' else 'mantel_haenszel'


def _label(a: dict, cat: str) -> str:
    return (a.get('labels') or {}).get(cat) or str(cat).replace('_', ' ')


def share(analyses: list, rows: list, counted: int, spec: dict | None = None) -> dict | None:
    """The classes of one residue question, as shares of the counted marks: the site's choice (analysis, and optionally
    classes in the order to show, labels to use), else the first question whose classes add up to the marks."""
    spec = spec or {}
    by_id = {a['id']: a for a in analyses}
    tries = (
        [by_id[spec['analysis']]]
        if spec.get('analysis') in by_id
        else [a for a in analyses if a.get('kind') == 'residue' and a.get('shape') == 'class']
    )
    for a in tries:
        got: dict[str, int] = {}
        method = None
        for r in rows:
            if r['analysis'] != a['id']:
                continue
            method = method or r['method']
            if r['method'] == method:
                got[r['category']] = r['a']
        total = sum(got.values())
        if len(got) < 2 or not total or (not spec.get('analysis') and abs(total - counted) > 0.01 * counted):
            continue
        order = [c for c in (spec.get('classes') or list(a.get('labels') or {})) if c in got]
        order += [c for c in got if c not in order]
        shown = (
            [c for c in order if c in spec['classes']] if spec.get('classes') else order[:3]
        )  # three series colors at most; the rest is 'other'
        parts = [
            {'class': c, 'label': (spec.get('labels') or {}).get(c) or _label(a, c), 'n': got[c], 'slot': i + 1}
            for i, c in enumerate(shown)
            if got[c]
        ]
        rest = total - sum(p['n'] for p in parts)
        if rest > 0.01 * total:  # a sliver is left out of the picture
            parts.append({'class': '', 'label': 'other', 'n': rest, 'slot': 0})
        return {'analysis': a['id'], 'title': a.get('title', a['id']), 'total': total, 'parts': parts}
    return None


def findings(
    analyses: list,
    rows: list,
    spec: list | None = None,
    n: int = N_FINDINGS,
    row_labels: dict | None = None,
    only: set | None = None,
) -> list:
    """The strongest results, one per question: named by the site (analysis and class), else the largest effects at
    q <= 0.05 that rest on at least MIN_N marks, by the question's usual test. `only`: the questions to choose from."""
    by_id = {a['id']: a for a in analyses}
    methods: dict[str, set] = {}
    for r in rows:
        methods.setdefault(r['analysis'], set()).add(r['method'])
    pool = []
    for r in rows:
        a = by_id.get(r['analysis'])
        if (
            not a
            or (only is not None and a['id'] not in only)
            or r['method'] != (_preferred(a) if _preferred(a) in methods[a['id']] else sorted(methods[a['id']])[0])
        ):
            continue
        e = _eff(r)
        if e is None or r['q'] is None or r['q'] > PADJ or not (e >= MIN_EFFECT or e <= 1 / MIN_EFFECT):
            continue
        pool.append((a, r, e))

    def item(a, r, e):
        # the label the question's own page gives the row (website.front.row_labels), else the class's label
        lab = ((row_labels or {}).get(a['id']) or {}).get(r['category']) or _label(a, r['category'])
        return {
            'analysis': a['id'],
            'class': r['category'],
            'title': a.get('title', a['id']),
            'label': lab,
            'eff': e,
            'q': r['q'],
            'n': r['a'],
            'dir': 'more' if e >= 1 else 'less',
            'sets': a.get('kind') == 'protein_sets',
        }

    out = []
    for s in spec or []:
        hit = [
            (a, r, e)
            for a, r, e in pool
            if a['id'] == s['analysis'] and r['category'] == s.get('class', s.get('category'))
        ]
        if hit:
            out.append(item(*hit[0]))
    if spec:
        return out[:n]
    seen = set()
    for a, r, e in sorted((x for x in pool if x[1]['a'] >= MIN_N), key=lambda x: -abs(math.log(x[2]))):
        if a['id'] not in seen:
            seen.add(a['id'])
            out.append(item(a, r, e))
    return out[:n]


def glance(
    analyses: list,
    rows: list,
    counted: int,
    start: dict | None,
    landing: dict | None = None,
    row_labels: dict | None = None,
    only: set | None = None,
) -> dict:
    """What the entry pages draw. The landing page's own choices (website.landing) win over the start panel's."""
    start, landing = start or {}, landing or {}
    out = {
        'share': share(analyses, rows, counted, landing.get('share') or start.get('share')),
        'findings': findings(analyses, rows, landing.get('findings') or start.get('findings'), row_labels=row_labels),
    }
    if only is not None and not landing.get('findings'):  # the landing card's own, from one Overview section
        out['landing_findings'] = findings(analyses, rows, None, row_labels=row_labels, only=only)
    return out
