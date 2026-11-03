"""What the protein page's context cards (assets/kit-pcards.js) read from the site file: website.protein.cards, the fold
order and which folds start open (website.protein.order, .open), and the live parts of a protein-set card
(website.protein.sets[].live, .term_groups). A card is on when the site names it; its tables are tables of website.tables
(CONTRACTS.md, "Protein page cards") and a protein without rows in them says so. The module knows no organism, source
or database: the tables, the columns they carry and the words are the site's. ptmc check reports what a card misses.
"""
from __future__ import annotations

import re

CARDS = ('location', 'dependency', 'perturbations', 'experiments', 'clustering', 'other_ptms')
FOLD = re.compile(r'^p-[a-z0-9-]+$')


def config(site: dict) -> dict:
    return ((site.get('website') or {}).get('protein') or {})


def _cols(spec: dict) -> set[str]:
    return set((spec.get('columns') or {})) | set(spec.get('values') or [])


def problems(site: dict) -> list[str]:
    """What website.protein.cards, order, open and sets[].live name that the site file does not have (ptmc check)."""
    cfg = config(site)
    web = site.get('website') or {}
    tables = web.get('tables') or {}
    out: list[str] = []
    for key in ('order', 'open'):
        out += [f'website.protein.{key}: {x!r} is not a fold id (p-, lower case)' for x in cfg.get(key) or [] if not FOLD.match(str(x))]
        dup = sorted({x for x in cfg.get(key) or [] if (cfg.get(key) or []).count(x) > 1})
        out += [f'website.protein.{key}: {x!r} listed twice' for x in dup]
    seen: dict[str, str] = {}
    for g in cfg.get('groups') or []:
        for x in g.get('folds') or []:
            if x in seen:
                out.append(f"website.protein.groups: {x!r} is in both {seen[x]!r} and {g.get('id')!r}")
            seen[x] = g.get('id')
    ids = {a['id'] for a in site.get('analyses', [])}
    fold_ids = []
    for k, c in enumerate(cfg.get('sets') or []):
        w = f"website.protein.sets[{k}]"
        if c.get('id'):
            fold_ids.append(c['id'])
            if not FOLD.match(c['id']):
                out.append(f"{w}.id: {c['id']!r} is not a fold id (p-, lower case)")
        tg = c.get('term_groups')
        if tg:
            if tg.get('terms') not in c.get('analyses', []):
                out.append(f"{w}.term_groups.terms: {tg.get('terms')!r} is not one of the card's analyses")
            out += [f'{w}.term_groups.families: no analysis {f!r}' for f in tg.get('families', []) if f not in ids]
        ot = (c.get('live') or {}).get('open_targets')
        if ot and not re.match(r'^https://[^/\s]+(/\S*)?$', str(ot.get('graphql', ''))):
            out.append(f"{w}.live.open_targets.graphql: {ot.get('graphql')!r} is not an https address")
    cards = cfg.get('cards') or {}
    out += [f'website.protein.cards: no card {c!r} (cards: {", ".join(CARDS)})' for c in cards if c not in CARDS]

    def need(card: str, what: str, name, fmt: str, cols: tuple[str, ...] = ()):
        w = f'website.protein.cards.{card}.{what}'
        if not name:
            out.append(f'{w}: names no table')
        elif name not in tables:
            out.append(f'{w}: no table {name!r} in website.tables')
        elif tables[name].get('format') != fmt:
            out.append(f"{w}: {name!r} is a {tables[name].get('format')} table; the card reads a {fmt} table")
        else:
            missing = [c for c in cols if c not in _cols(tables[name])]
            out.extend(f'{w}: table {name!r} has no column {c!r} (the card reads it)' for c in missing)

    loc = cards.get('location') or {}
    if 'hpa' in loc:
        need('location', 'hpa.table', (loc['hpa'] or {}).get('table'), 'protein_records', ('location',))
    if 'condensates' in loc:
        cd = loc['condensates'] or {}
        need('location', 'condensates.members', cd.get('members'), 'protein_records', ('condensate', 'score'))
        if cd.get('names'):
            need('location', 'condensates.names', cd['names'], 'lookup', ('name',))
    if 'dependency' in cards:
        need('dependency', 'table', cards['dependency'].get('table'), 'protein_records', ('lines', 'dependent'))
    if 'experiments' in cards:
        need('experiments', 'table', cards['experiments'].get('table'), 'protein_records', ('reference', 'finding'))
    if 'clustering' in cards:
        need('clustering', 'table', cards['clustering'].get('table'), 'protein_records', ('spacing_median',))
    if 'other_ptms' in cards:
        need('other_ptms', 'table', cards['other_ptms'].get('table'), 'residue_evidence')
    if 'perturbations' in cards:
        calls = ((cfg.get('card') or {}).get('calls') or {})
        if not (calls.get('tables') or calls.get('attributes')):
            out.append('website.protein.cards.perturbations: reads the marks of website.protein.card.calls (its tables and attributes); set them')
        for t in calls.get('tables') or []:
            if t not in tables:
                out.append(f'website.protein.card.calls.tables: no table {t!r} in website.tables')
    return out
