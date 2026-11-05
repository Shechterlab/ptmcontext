"""The cards front end's configuration (website.front): which questions each home card shows, the short words, the
glossary, the example searches. A separate block from the classic Overview's sections (website.overview), so the two
fronts can hold different groupings. Without a block, the cards derive from the analyses' section fields.

resolve() gives the page its normalised form (D.front); problems() is what ptmc check reports."""
from __future__ import annotations

import re

MODES = ('classic', 'cards')
DEFAULT_ROWS = 5
DEFAULT_Q_MAX = 0.05
DEFAULT_MORE = 'More questions'


def section_of(a: dict) -> str:
    """The Overview section an analysis is listed under: its own `section`, else its layer's, else the default of its
    kind (the same rule as the website's data)."""
    if a.get('section'):
        return a['section']
    if a.get('test') == 'protein_sets':
        return 'Protein classes and pathways'
    from . import layers as L
    layer = L.BUILT_IN.get(a.get('layer', ''))
    return getattr(layer, 'section', '') or 'Other questions'


def measure_of(a: dict) -> str | None:
    """'fold' for a protein-set question (fold enrichment), 'odds' for a residue question (odds ratio), none for a
    question the kit draws itself (a model)."""
    if a.get('test') == 'protein_sets':
        return 'fold'
    return None if a.get('test') == 'conditional_logit' else 'odds'


def question_ids(site: dict) -> list[str]:
    """Every question the website can open, in the site file's order: the analyses, the counting questions, the cell."""
    web = site.get('website') or {}
    out = [a['id'] for a in site.get('analyses', [])]
    out += [c for c in (web.get('counts') or {}) if c not in out]
    cid = (web.get('cell') or {}).get('id')
    return out + ([cid] if cid and cid not in out else [])


def _slug(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'section'


def _placed(site: dict, card: dict) -> list[str]:
    """The questions of one card: those it names, then those of the sections it names."""
    by_id = {a['id']: a for a in site.get('analyses', [])}
    out = list(card.get('analyses') or [])
    for f in card.get('facets') or []:
        if f['analysis'] not in out:
            out.append(f['analysis'])
    names = set(card.get('sections') or [])
    out += [i for i, a in by_id.items() if section_of(a) in names and i not in out]
    cid = (site.get('website') or {}).get('cell', {}).get('id')
    if card.get('cell') and cid and cid not in out:
        out.append(cid)
    return out


def resolve(site: dict, titles: dict | None = None) -> dict:
    """The front block as the page reads it: mode, cards (each with its questions, facets and home rows), the questions
    left to "More", short words, glossary and examples. `titles` are the analyses' titles as the website shows them."""
    web = site.get('website') or {}
    fr = web.get('front') or {}
    rows = fr.get('rows', DEFAULT_ROWS)
    by_id = {a['id']: a for a in site.get('analyses', [])}
    title = lambda i: (titles or {}).get(i) or (by_id.get(i) or {}).get('title') or i       # noqa: E731
    cards = fr.get('cards')
    if cards is None:                                   # derived: one card per section, in the order sections first appear
        order: dict[str, list[str]] = {}
        for a in site.get('analyses', []):
            order.setdefault(section_of(a), []).append(a['id'])
        cards = [{'key': _slug(s), 'title': s, 'analyses': ids} for s, ids in order.items()]
    out, seen = [], set()
    for c in cards:
        qs = [q for q in _placed(site, c) if q not in seen]
        seen.update(qs)
        facets = c.get('facets')
        if facets is None:
            facets = [{'analysis': q, 'measure': measure_of(by_id[q])} for q in qs if q in by_id and measure_of(by_id[q])]
        facets = [{'analysis': f['analysis'], 'label': f.get('label') or title(f['analysis']),
                   'measure': f.get('measure') or measure_of(by_id.get(f['analysis'], {})) or 'odds'} for f in facets]
        home = dict(c.get('home') or {})
        if not home and facets:
            home = {'analysis': facets[0]['analysis']}
        if home and not home.get('classes'):
            home.setdefault('top', rows)
            home.setdefault('q_max', DEFAULT_Q_MAX)
        out.append({'key': c.get('key') or _slug(c['title']), 'title': c['title'], 'short': c.get('short') or c['title'],
                    'chip': c.get('chip', ''), 'questions': qs, 'facets': facets, 'home': home, 'rows': c.get('rows', rows),
                    'cell': bool(c.get('cell') and (web.get('cell') or {}).get('id'))})
    more = fr.get('more', DEFAULT_MORE)
    left = [q for q in question_ids(site) if q not in seen]
    examples = [e if isinstance(e, dict) else {'label': e, 'query': e} for e in fr.get('examples', web.get('examples') or [])]
    return {'mode': fr.get('mode', 'classic'), 'rows': rows, 'cards': out,
            'more': {'title': more, 'questions': left} if more is not False else {'title': '', 'questions': []},
            'short': {i: (fr.get('short') or {}).get(i) or title(i) for i in question_ids(site)},
            'row_labels': fr.get('row_labels') or {}, 'summary_only': fr.get('summary_only') or {},
            'glossary': fr.get('glossary') or {}, 'examples': examples}


def problems(site: dict, words: dict | None = None) -> list[str]:
    """What website.front names that the site file does not have. `words` is the check's per-analysis class words
    ({analysis: {'classes': [...]}}); without them classes are not checked."""
    web = site.get('website') or {}
    fr = web.get('front')
    if not fr:
        return []
    words = words or {}
    by_id = {a['id']: a for a in site.get('analyses', [])}
    questions = set(question_ids(site))
    sections = {section_of(a) for a in by_id.values()} | {s.get('name') for s in (web.get('overview') or {}).get('sections', [])}
    out = []

    def known(where, i):
        if i not in questions:
            out.append(f'website.front.{where}: {i!r} is not a question of this site')
            return False
        return True

    def classes(where, i, cs):
        have = (words.get(i) or {}).get('classes')
        if have is not None and i in by_id and by_id[i].get('test') != 'protein_sets':
            out.extend(f'website.front.{where}: {i!r} has no class {c!r} (it has {sorted(have)})' for c in cs if c not in have)

    keys, placed = set(), {}
    for n, c in enumerate(fr.get('cards') or []):
        key = c.get('key') or _slug(c['title'])
        where = f'cards[{n}] ({c["title"]!r})'
        if key in keys:
            out.append(f'website.front.{where}: a second card with the key {key!r}')
        keys.add(key)
        for s in c.get('sections') or []:
            if s not in sections:
                out.append(f'website.front.{where}: no section {s!r} (the analyses are in {sorted(x for x in sections if x)})')
        for i in c.get('analyses') or []:
            known(where, i)
        if c.get('cell') and not (web.get('cell') or {}).get('id'):
            out.append(f'website.front.{where}: cell: true, but the site has no website.cell')
        for q in _placed(site, c):
            if q in placed and placed[q][0] != n:
                out.append(f'website.front.{where}: {q!r} is already in the card {placed[q][1]!r}')
            placed.setdefault(q, (n, key))
        facets = c.get('facets') or []
        for f in facets:
            i = f['analysis']
            if not known(where + '.facets', i):
                continue
            m = measure_of(by_id[i]) if i in by_id else None
            if i not in by_id or m is None:
                out.append(f'website.front.{where}.facets: {i!r} is not a question with rows to chart')
            elif f.get('measure') and f['measure'] != m:
                out.append(f'website.front.{where}.facets: {i!r} is measured as {m!r} (a protein-set question is a fold, a residue question an odds ratio), not {f["measure"]!r}')
        home = c.get('home')
        if home:
            if home['analysis'] not in {f['analysis'] for f in facets} | ({f for f in _placed(site, c) if f in by_id and measure_of(by_id[f])} if not facets else set()):
                out.append(f'website.front.{where}.home: {home["analysis"]!r} is not one of the card\'s facets')
            elif home.get('classes'):
                classes(where + '.home', home['analysis'], home['classes'])
    if fr.get('more') is False and (fr.get('cards') is not None):
        left = [q for q in questions if q not in placed]
        if left:
            out.append(f'website.front: more: false, but no card holds {sorted(left)}; a question must be reachable')
    for i in fr.get('short') or {}:
        known('short', i)
    for i, cs in (fr.get('row_labels') or {}).items():
        if known('row_labels', i):
            classes('row_labels', i, list(cs))
    for i, cs in (fr.get('summary_only') or {}).items():
        if known('summary_only', i):
            classes('summary_only', i, cs)
    return out
