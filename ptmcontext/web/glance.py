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


READING = {'min_set': 30, 'min_maps': 2, 'min_group': 20}  # website.reading's defaults, as the kit's
FOLD_METHODS = ('fisher', 'mantel_haenszel', 'study')


def fold_of(r: dict):
    """The fold a row shows: a protein set's fold enrichment, or a residue row's share of the marks in the class over
    the share of the comparison residues in it (pooled counts). None when there is none."""
    if r.get('fold') is not None:
        return r['fold'] if 0 < r['fold'] < BIG else None
    a, b, c, d = (r.get(k) for k in 'abcd')
    if r.get('method') not in FOLD_METHODS or None in (a, b, c, d) or not (a + b and c + d and c):
        return None
    return (a / (a + b)) / (c / (c + d))


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
    locations: dict | None = None,
    reading: dict | None = None,
) -> list:
    """The strongest results, one per question: named by the site (analysis and class), else the largest folds at
    q <= 0.05 that rest on at least MIN_N marks, by the question's usual test, in the direction its test agrees with.
    A protein set tested within abundance deciles is read by that test; a set of fewer than reading.min_set proteins,
    or one whose every member is marked (its fold at the ceiling), is not chosen. `only`: the questions to choose from.
    locations: for a map question, the classes that are locations (a compartment); its other classes (a domain, a
    cluster) are not chosen."""
    rd = {**READING, **(reading or {})}
    by_id = {a['id']: a for a in analyses}
    methods: dict[str, set] = {}
    strat = {}
    for r in rows:
        methods.setdefault(r['analysis'], set()).add(r['method'])
        if r['method'] == 'mantel_haenszel' and (by_id.get(r['analysis']) or {}).get('kind') == 'protein_sets':
            strat[(r['analysis'], r['category'])] = r
    pool = []
    for r in rows:
        a = by_id.get(r['analysis'])
        if (
            not a
            or (only is not None and a['id'] not in only)
            or r['method'] != (_preferred(a) if _preferred(a) in methods[a['id']] else sorted(methods[a['id']])[0])
            or (locations and a['id'] in locations and r['category'] not in locations[a['id']])
        ):
            continue
        e, t, q = fold_of(r), _eff(r), r['q']
        sets = a.get('kind') == 'protein_sets'
        if sets and r['method'] == 'enricher':
            st = strat.get((a['id'], r['category']))
            if st is not None:  # the test within abundance deciles reads the set
                t, q = _eff(st), st['q']
            small = (r.get('a', 0) + r.get('c', 0)) < rd['min_set'] or not r.get('c')
        else:
            small = False
        if e is None:
            e = t
        if (
            e is None
            or q is None
            or q > PADJ
            or not (e >= MIN_EFFECT or e <= 1 / MIN_EFFECT)
            or (t is not None and (e >= 1) != (t >= 1))
        ):
            continue
        pool.append((a, r, e, small))

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
            for a, r, e, _ in pool
            if a['id'] == s['analysis'] and r['category'] == s.get('class', s.get('category'))
        ]
        if hit:
            out.append(item(*hit[0]))
    if spec:
        return out[:n]
    seen = set()
    ranked = [(a, r, e) for a, r, e, small in pool if r['a'] >= MIN_N and not small]
    for a, r, e in sorted(ranked, key=lambda x: -abs(math.log(x[2]))):
        if a['id'] not in seen:
            seen.add(a['id'])
            out.append(item(a, r, e))
    return out[:n]


def cell_findings(rows: list, cell: dict, reading: dict | None = None) -> list:
    """The parts of the cell as the Overview's cell card reads them (kit-cell.js): each compartment row's maps, each map
    its fold read by its test (within abundance strata where it has them), a map speaking for the part only with at
    least min_group marked proteins and as many others there; a part differs when at least min_maps of those maps
    differ the same way (q <= 0.05, a fold of 1.1x or more, the test pointing the same way) and none the other way, by
    their median fold. The parts more often first, largest first; then those less often."""
    rd = {**READING, **(reading or {})}
    by = {}
    for r in rows:
        by[(r['analysis'], r['category'], r['method'])] = r
    out = []
    for group in cell.get('compartments') or []:
        for row in group.get('rows') or []:
            folds, up, down = [], 0, 0
            for aid, cat in (row.get('sets') or {}).items():
                e = by.get((aid, cat, 'enricher'))
                if not e or e.get('fold') is None or e['a'] < rd['min_group'] or (e.get('c') or 0) < rd['min_group']:
                    continue
                st = by.get((aid, cat, 'mantel_haenszel'))
                f, t, q = e['fold'], _eff(st) if st else None, (st or e)['q']
                if not 0 < f < BIG:
                    continue
                folds.append(math.log2(f))
                if q is not None and q <= PADJ and (t is None or (f >= 1) == (t >= 1)):
                    up += f >= MIN_EFFECT
                    down += f <= 1 / MIN_EFFECT
            if not folds:
                continue
            folds.sort()
            h = len(folds) // 2
            med = folds[h] if len(folds) % 2 else (folds[h - 1] + folds[h]) / 2
            if (med > 0 and up >= rd['min_maps'] and not down) or (med < 0 and down >= rd['min_maps'] and not up):
                out.append(
                    {
                        'analysis': cell.get('id'),
                        'class': row.get('part') or row['label'],
                        'title': cell.get('title', cell.get('id')),
                        'label': row.get('name') or row['label'],
                        'eff': 2**med,
                        'q': None,
                        'n': None,
                        'dir': 'more' if med > 0 else 'less',
                        'sets': True,
                        'maps': up + down,
                    }
                )
    # as the cell card's answer reads: the parts where most of all first, then the strongest less often
    return sorted(out, key=lambda f: (f['dir'] != 'more', -abs(math.log(f['eff']))))


def glance(
    analyses: list,
    rows: list,
    counted: int,
    start: dict | None,
    landing: dict | None = None,
    row_labels: dict | None = None,
    only: set | None = None,
    locations: dict | None = None,
    reading: dict | None = None,
    cell: dict | None = None,
    shown: set | None = None,
) -> dict:
    """What the entry pages draw. The landing page's own choices (website.landing) win over the start panel's. cell:
    the site's cell maps when the landing card's section holds them: its parts are read as the cell card reads them,
    not map by map. shown: the questions the Overview shows; a computed finding is one of them (a type's own version of
    a question, on that question's page only, is not chosen)."""
    start, landing = start or {}, landing or {}
    out = {
        'share': share(analyses, rows, counted, landing.get('share') or start.get('share')),
        'findings': findings(
            analyses,
            rows,
            landing.get('findings') or start.get('findings'),
            row_labels=row_labels,
            reading=reading,
            only=shown,
        ),
    }
    if only is not None and not landing.get('findings'):  # the landing card's own, from one Overview section
        maps = {
            aid
            for g in (cell or {}).get('compartments') or []
            for r in g.get('rows') or []
            for aid in r.get('sets') or {}
        }
        rest = findings(
            analyses, rows, None, row_labels=row_labels, only=only - maps, locations=locations, reading=reading
        )
        parts = cell_findings(rows, cell, reading) if cell else []
        out['landing_findings'] = (parts[:1] + rest)[:N_FINDINGS]  # the cell card leads its section
    return out
