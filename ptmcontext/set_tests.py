"""Are the marked proteins over-represented in a set of proteins (a pathway, a location, a class), against a universe?

The test is clusterProfiler's enricher, written out so it needs no R: the one-sided hypergeometric test with
Benjamini-Hochberg over the sets tested, and the fold enrichment (k/n)/(M/N). The release's statistics were made with
clusterProfiler itself, and tests/test_parity_v1_4_3.py checks these rows against them.

  background  the universe; or, by default, the universe proteins in at least one set (clusterProfiler's own rule)
  tested      the sets holding at least one target, of min_size to max_size background proteins
  a, b, c, d  k; n - k; M - k; N - M - n + k

A site file names everything else: which table holds the sets, which columns name the set and the protein, which rows
to keep, the names of the sets, the universe and the sizes. Nothing here names a source.

Sets come from a table of (set, protein) pairs, from a class hierarchy (class_sets): each protein's classes and the
ontology that places them, at the top level (optionally gathered into groups the site file names) or below it, or from
rules on a table's columns (rule_sets): each row in the set of the first rule that holds for it (a value at least a
threshold, a share of two columns, a flag), so classes cut from numbers need no table of their own. The sets
of a table may be gathered into families by their names (families: a site's own rules file), and may be keyed by an
identifier other than the site's proteins (identifiers: the tables that map each protein to it, as UniProt entries to
Entrez genes); the test then counts those identifiers, and its universe is the site's proteins' identifiers.

A table's rows may be kept by what other tables say of one of its columns (where: its proteins' organism in a protein
table, its sets' kind in a set table), and members named by an older accession may be brought to the snapshot's current
entry through an accession history (history). A file that is not tab-separated says so in its manifest entry
(columns.sep), and the rows of an analysis may be written in an order of its own (order).
"""
from __future__ import annotations

import math
import re
from fractions import Fraction
from pathlib import Path

import numpy as np
import pandas as pd

from . import stats


def _holds(frame: pd.DataFrame, cond: dict) -> pd.Series:
    col = frame[cond['column']].astype(str)
    if 'equals' in cond:
        return col == cond['equals']
    if 'in' in cond:
        return col.isin(set(cond['in']))
    return col.str.contains(cond['contains'], regex=False)


def _select(frame: pd.DataFrame, spec: dict) -> pd.DataFrame:
    keep = pd.Series(True, index=frame.index)
    for cond in spec.get('include', []):
        keep &= _holds(frame, cond)
    for cond in spec.get('exclude', []):
        keep &= ~_holds(frame, cond)
    return frame[keep]


def _number(frame: pd.DataFrame, cond: dict) -> pd.Series:
    """The number a numeric condition reads: a column, or the ratio of two (NaN where the denominator is 0 or empty)."""
    if 'ratio' in cond:
        num, den = (pd.to_numeric(frame[c], errors='coerce') for c in cond['ratio'])
        return num / den.where(den != 0)
    return pd.to_numeric(frame[cond['column']], errors='coerce')


def _rule_holds(frame: pd.DataFrame, cond: dict) -> pd.Series:
    """A rule's condition: equals, in or contains on a column's text, or at_least and below on a number (a value
    missing fails both)."""
    if 'at_least' in cond or 'below' in cond:
        v = _number(frame, cond)
        out = v.notna()
        if 'at_least' in cond:
            out &= v >= float(cond['at_least'])
        if 'below' in cond:
            out &= v < float(cond['below'])
        return out
    return _holds(frame, cond)


def rule_sets(src: dict, frame: pd.DataFrame) -> pd.DataFrame:
    """(set, protein) pairs from rules (sets.rules): each row of the table goes to the set of the first rule whose
    conditions (when) all hold for it; a rule without conditions takes every row left; a row no rule takes is in no
    set. A protein on several rows is in the set of each. With exclusive: false each rule takes every row whose
    conditions hold, so a row may be in several sets (a membership with the roles driver and member is in both)."""
    rest = pd.Series(True, index=frame.index)
    out = []
    for rule in src['rules']:
        hit = rest.copy()
        for cond in rule.get('when', []):
            hit &= _rule_holds(frame, cond)
        out.append(pd.DataFrame({'set': rule['set'], 'protein': frame.loc[hit, src['protein']].astype(str).to_numpy()}))
        if src.get('exclusive', True):
            rest &= ~hit
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame(columns=['set', 'protein'])


def _refs(v) -> list:
    return [] if v is None else list(v) if isinstance(v, list) else [v]


def _role(ref) -> str:
    return ref['role'] if isinstance(ref, dict) else ref


def item_roles(item: dict) -> list[str]:
    """The roles one set of sets.each reads: its units or table, and its universe."""
    return list(dict.fromkeys([_role(r) for r in _refs(item.get('units'))] + ([item['table']['input']] if item.get('table') else [])
                              + [_role(r) for r in _refs(item.get('universe_units'))]))


def question_roles(spec: dict) -> list[str]:
    """The roles holding what a protein-set analysis asks about: its sets (their ontology, the tables whose rows keep
    them, their members' scores) and their names; for sets.each, every item's units, table and universe."""
    src = spec['sets']
    if src.get('each'):
        return list(dict.fromkeys(r for it in src['each'] for r in item_roles(it)))
    roles = [src['input'], src.get('ontology', {}).get('input'), *(w['input'] for w in src.get('where', [])),
             (spec.get('scores') or {}).get('input'), spec.get('names', {}).get('input'), (spec.get('hierarchy') or {}).get('input')]
    return list(dict.fromkeys(r for r in roles if r))


def map_roles(spec: dict) -> list[str]:
    """The roles of the tables that map the site's proteins to the sets' identifiers (none when the sets hold proteins),
    or the sets' members to the snapshot's entries (an accession history)."""
    steps = [step['input'] for step in (spec.get('identifiers') or {}).get('map', [])]
    return list(dict.fromkeys(steps + [r for r in [(spec['sets'].get('history') or {}).get('input')] if r]))


def roles_of(spec: dict) -> list[str]:
    """Every role a protein-set analysis reads: its sets (their ontology, where tables and scores), names, identifier
    map or history, and covariate."""
    return list(dict.fromkeys(question_roles(spec) + map_roles(spec) + [r for r in [spec.get('abundance', {}).get('input'), values_role(spec)] if r]))


def values_role(spec: dict) -> str | None:
    """The role of the table of per-protein numbers a protein-set question shows beside its sets (values:), by default
    the sets' own table."""
    v = spec.get('values')
    return (v.get('input') or spec['sets']['input']) if v else None


def protein_values(spec: dict, paths: dict, background: set, targets: set, formats: dict | None = None) -> dict:
    """Per-protein numbers the website shows beside a question's sets (values: the columns of a table, each protein's
    first row; no test reads them): each marked protein's values in the background, and, for the columns marked
    background: true, every other background protein's values, sorted (missing ones left out), so a page can draw and
    compare any group of marked proteins with the rest."""
    v = spec['values']
    t = _select(_read(paths[values_role(spec)], formats), v)
    prot = _entry(t[v.get('protein') or spec['sets']['protein']])
    cols = [c['name'] if isinstance(c, dict) else c for c in v['columns']]
    nums = pd.DataFrame({c: pd.to_numeric(t[c], errors='coerce') for c in cols}).set_index(prot.to_numpy())
    nums = nums[~nums.index.duplicated()]
    nums = nums[nums.index.isin(background)]
    clean = lambda x: None if pd.isna(x) else float(x)  # noqa: E731
    marked = nums[nums.index.isin(targets)].sort_index()
    others = nums[~nums.index.isin(targets)]
    return {'columns': [c if isinstance(c, dict) else {'name': c} for c in v['columns']],
            'marked': {a: [clean(x) for x in row] for a, row in zip(marked.index, marked.to_numpy())},
            'others': {c['name']: sorted(float(x) for x in others[c['name']].dropna()) for c in v['columns'] if isinstance(c, dict) and c.get('background')}}


def strata_counts(background: list, dec: dict, members: pd.Series) -> dict:
    """The background's proteins in each stratum of the covariate, overall (N) and in each set (sets), so that a page
    can repeat the stratified test on any group of marked proteins (whose strata it has): codes in order, the deciles
    from the lowest, then none."""
    codes = sorted(set(dec.values()), key=lambda c: (c == 'none', int(c) if c != 'none' else 0))
    at = {c: i for i, c in enumerate(codes)}
    count = lambda us: np.bincount([at[dec[u]] for u in us if u in dec], minlength=len(codes)).tolist()  # noqa: E731
    return {'codes': codes, 'N': count(background), 'sets': {s: count(g) for s, g in members.items()}}


def _read(path, formats: dict | None = None) -> pd.DataFrame:
    """A table as text; its separator is its manifest entry's (columns.sep: formats, path -> the entry's columns),
    else a tab."""
    sep = ((formats or {}).get(str(path)) or {}).get('sep', '\t')
    return pd.read_csv(path, sep=sep, dtype=str, keep_default_na=False, low_memory=False)


def _entry(values: pd.Series) -> pd.Series:
    """UniProt accessions as entries: an isoform (P12345-2) counts as its entry."""
    return values.astype(str).str.split('-').str[0]


def kept_by(t: pd.DataFrame, where: list, paths: dict, formats: dict | None = None, entries: set = frozenset()) -> pd.DataFrame:
    """The rows of t that every condition of where keeps: a condition names a column of t, another table (input), the
    column of that table holding the same values (key) and which of its rows count (include, exclude); a row of t is
    kept when its value is the key of a row that counts. A column in entries holds UniProt accessions, compared as
    entries (an isoform counts as its entry) on both sides."""
    keep = pd.Series(True, index=t.index)
    for w in where:
        other = _select(_read(paths[w['input']], formats), w)
        if w['column'] in entries:
            keep &= _entry(t[w['column']]).isin(set(_entry(other[w['key']])))
        else:
            keep &= t[w['column']].astype(str).str.strip().isin(set(other[w['key']].astype(str).str.strip()))
    return t[keep]


def current_entries(members: pd.Series, history: dict, paths: dict, entries: set, formats: dict | None = None) -> pd.Series:
    """Members brought to the snapshot's entries through an accession history: a member that is an entry stays; one
    the history maps (from -> to, on the rows include and exclude keep) to exactly one entry becomes that entry; any
    other is dropped (empty)."""
    h = _select(_read(paths[history['input']], formats), history)
    targets = pd.DataFrame({'old': h[history['from']].astype(str).str.strip(), 'new': h[history['to']].astype(str).str.strip()})
    targets = targets[targets['new'].isin(entries)].drop_duplicates().groupby('old')['new'].agg(list)
    current = {old: new[0] for old, new in targets.items() if len(new) == 1}
    return pd.Series([m if m in entries else current.get(m, '') for m in members], index=members.index, dtype=object)


ORDER_COLUMNS = ('a', 'b', 'c', 'd', 'fold_enrichment', 'p', 'q', 'category')


def _order_values(rows: pd.DataFrame, by: str) -> list:
    """The values rows are ordered by: a column, except the fold enrichment, which is compared exactly, as the
    fraction of its counts (k/n)/(M/N) = a(a+b+c+d) / ((a+b)(a+c)): sets of 4 in 6 and 14 in 21 tie, as they do in
    the release, where floating point would set them one ulp apart."""
    if by == 'fold_enrichment':
        return [Fraction(int(a) * int(a + b + c + d), int(a + b) * int(a + c))
                for a, b, c, d in zip(rows['a'], rows['b'], rows['c'], rows['d'])]
    return list(rows[by])


def ordered(rows: pd.DataFrame, order: list | None) -> pd.DataFrame:
    """The rows in the order an analysis names (order: [{by, descending}], the first key first; a tie keeps the
    order before: ascending p, then the set's name). A key {categories: [...]} puts the rows of those categories
    first, in its order, and the others after them. Without one, as they are."""
    for key in reversed(order or []):
        if 'categories' in key:
            rank = {c: i for i, c in enumerate(key['categories'])}
            if len(rows):
                rows = rows.iloc[sorted(range(len(rows)), key=lambda i: rank.get(rows['category'].iloc[i], len(rank)))]
            continue
        if key['by'] not in ORDER_COLUMNS:
            raise ValueError(f"order: {key['by']!r} is not one of {ORDER_COLUMNS}")
        if len(rows):                                   # a stable sort, so a tie keeps the order of the keys after it
            values = _order_values(rows, key['by'])
            idx = sorted(range(len(rows)), key=values.__getitem__, reverse=key.get('descending', False))
            rows = rows.iloc[idx]
    return rows.reset_index(drop=True)


def identifiers_of(spec: dict, paths: dict, proteins, formats: dict | None = None) -> dict[str, set]:
    """Each protein's identifiers in the sets' own terms (identifiers.map): the tables in turn, each step taking the
    values of its `to` column on the rows whose `from` column holds an identifier of the step before (the protein's
    accession, first). With a separator a value is a list, of which `take: first` keeps the first item (default: all
    items). Empty values are dropped; a protein may end with several identifiers, or none."""
    current = {p: {p} for p in proteins}
    for step in spec['map']:
        t = _read(paths[step['input']], formats)
        sep, first = step.get('separator'), step.get('take', 'all') == 'first'
        lookup: dict[str, set] = {}
        for key, value in zip(t[step['from']].astype(str), t[step['to']].astype(str)):
            items = [x.strip() for x in value.split(sep)] if sep else [value.strip()]
            items = [x for x in (items[:1] if first else items) if x]
            if items:
                lookup.setdefault(key.strip(), set()).update(items)
        current = {p: set().union(*(lookup.get(x, set()) for x in ids)) if ids else set() for p, ids in current.items()}
    return current


def load_families(path) -> dict:
    """A site's rules for placing sets into families by name (schemas/set_families.schema.json), checked: a family is
    named once across the lists, and an override names one of them (or null)."""
    from .profile import read_config, validate
    rules = read_config(path)
    validate(rules, 'set_families')
    seen: dict[str, str] = {}
    for lst in rules['lists']:
        for f in lst['families']:
            if f['family'] in seen:
                raise ValueError(f"{Path(path).name}: family {f['family']!r} is in lists {seen[f['family']]!r} and {lst['name']!r}")
            seen[f['family']] = lst['name']
            for pat in f['match']:
                try:
                    re.compile(pat)
                except re.error as exc:
                    raise ValueError(f"{Path(path).name}: family {f['family']!r}: pattern {pat!r} is not a regular expression ({exc})")
    if len({x['name'] for x in rules['lists']}) != len(rules['lists']):
        raise ValueError(f'{Path(path).name}: two lists share a name')
    bad = [o['name'] for o in rules.get('overrides', []) if o['family'] is not None and o['family'] not in seen]
    if bad:
        raise ValueError(f'{Path(path).name}: overrides name families no list has: {bad}')
    return rules


def place(names: dict, rules: dict) -> dict:
    """set -> (family, list) for each set whose name an override or a rule places; the others are in no family. An
    override (exact name) comes first; then the first family whose rule matches, list by list."""
    flags = 0 if rules.get('case_sensitive') else re.I
    list_of = {f['family']: lst['name'] for lst in rules['lists'] for f in lst['families']}
    compiled = [(f['family'], [re.compile(p, flags) for p in f['match']]) for lst in rules['lists'] for f in lst['families']]
    overrides = {o['name']: o['family'] for o in rules.get('overrides', [])}
    out = {}
    for s, name in names.items():
        if name in overrides:
            fam = overrides[name]
        else:
            fam = next((f for f, pats in compiled if any(p.search(name) for p in pats)), None)
        if fam is not None:
            out[s] = (fam, list_of[fam])
    return out


def families_file(spec: dict, root) -> Path:
    """The rules file of an analysis whose sets are gathered into families, relative to the site's repository."""
    return Path(root or '.') / spec['sets']['families']['rules']


def class_sets(src: dict, paths: dict, universe: set, formats: dict | None = None) -> pd.DataFrame:
    """(set, protein) pairs from a class hierarchy, each set named by its class's name (or its group's).

      level top        each protein's top-level classes (the root's children above its classes); with groups, the
                       group of each top-level class instead
      level below_top  every class below the top level that a protein's classes are, or lie under
      unclassified     the universe's proteins with no set at this level, as one more set of this name
    """
    onto = src['ontology']
    o = _read(paths[onto['input']], formats)
    name = dict(zip(o[onto['id']], o[onto['name']]))
    parent = dict(zip(o[onto['id']], o[onto['parent']]))
    root = onto['root']
    if len(set(name.values())) != len(name):
        raise ValueError(f"{onto['input']}: two classes share a name, and sets are named by their class")

    def lineage(c: str) -> list[str]:                    # the class and its ancestors, up to the top level
        out = []
        while c in parent and c != root:
            out.append(c)
            c = parent[c]
        return out
    tops = {c for c, p in parent.items() if p == root}
    group_of = {}
    for g, members in (src.get('groups') or {}).items():
        for c in members:
            if c in group_of:
                raise ValueError(f'top-level class {c} is in two groups: {group_of[c]!r} and {g!r}')
            group_of[c] = g
    if src.get('groups') and set(group_of) != tops:
        raise ValueError(f'the groups must hold every top-level class once: missing {sorted(tops - set(group_of))}, '
                         f'not top-level {sorted(set(group_of) - tops)}')
    t = _read(paths[src['input']], formats)
    sep = src.get('separator', ';')
    pairs = set()
    for acc, ids in zip(t[src['protein']].astype(str).str.split('-').str[0], t[src['classes']]):
        closure = {a for c in (ids.split(sep) if ids else []) for a in lineage(c)}
        if src['level'] == 'top':
            for c in closure & tops:
                pairs.add((group_of[c] if group_of else name[c], acc))
        else:
            pairs.update((name[c], acc) for c in closure - tops)
    out = pd.DataFrame(sorted(pairs), columns=['set', 'protein'])
    if src.get('unclassified'):
        rest = sorted(set(universe) - set(out['protein']))
        out = pd.concat([out, pd.DataFrame({'set': src['unclassified'], 'protein': rest})], ignore_index=True)
    return out


def set_table(spec: dict, paths: dict, universe: set | None = None, formats: dict | None = None) -> tuple[pd.DataFrame, pd.Series]:
    """The rows of an analysis's (set, protein) table it keeps, and their members: rows its include and exclude keep,
    then those its where conditions keep (each on another table); members as entries (an isoform counts as its
    entry) unless the sets hold other identifiers; with a history, members brought to the snapshot's entries
    (universe), and the rows of members it cannot place dropped."""
    src = spec['sets']
    ids = bool(spec.get('identifiers'))
    if ids and src.get('history'):
        raise ValueError(f"{spec['id']}: sets.history brings UniProt accessions to the snapshot's entries: it is not for sets of other identifiers")
    t = _select(_read(paths[src['input']], formats), src)
    if src.get('where'):
        t = kept_by(t, src['where'], paths, formats, entries=set() if ids else {src['protein']})
    members = t[src['protein']].astype(str)
    if not ids:                                           # UniProt accessions: an isoform counts as its entry
        members = _entry(members)
    if src.get('history'):
        members = current_entries(members, src['history'], paths, set(universe or ()), formats)
        t, members = t[members != ''], members[members != '']
    return t, members


def read_sets(spec: dict, paths: dict, universe: set | None = None, root=None, formats: dict | None = None,
              gathered: dict | None = None) -> tuple[pd.DataFrame, dict, set]:
    """(set, protein) pairs, the sets' names, and the identifiers the source annotates (what the background is drawn
    from), from the tables a site's analysis names (set_table: the rows kept and their members). With families, each
    set is replaced by its family (sets.families: the rules file, relative to root, the column whose names they read,
    and the lists tested); the source still annotates every identifier of its table, in a family or not. gathered, if
    given, receives each tested family's own sets (family -> sorted set ids), for a website's table of member sets."""
    src = spec['sets']
    if 'classes' in src:
        pairs = class_sets(src, paths, universe or set(), formats)
        return pairs, {}, set(pairs['protein'])
    t, members = set_table(spec, paths, universe, formats)
    if 'rules' in src:                                   # sets by rules on the table's columns: the source annotates
        pairs = rule_sets(src, t.assign(**{src['protein']: members}))   # every protein of its rows, in a set or not
        return pairs.drop_duplicates(), {}, set(members)
    pairs = pd.DataFrame({'set': t[src['set']].astype(str).to_numpy(), 'protein': members.to_numpy()})
    held = None
    if src.get('member_when'):                           # rows of every protein the source tests; members only where
        hold = pd.Series(True, index=t.index)            # these hold (the others are the background)
        for cond in src['member_when']:
            hold &= _rule_holds(t, cond)
        held, pairs = set(members), pairs[hold.to_numpy()]
    pairs = pairs.drop_duplicates()
    names = {}
    if spec.get('names'):
        nm = spec['names']
        n = _select(_read(paths[nm['input']], formats), nm)
        names = dict(zip(n[nm['set']].astype(str), n[nm['name']].astype(str)))
        if nm.get('include') or nm.get('exclude'):          # a filter on the names restricts the sets tested
            pairs = pairs[pairs['set'].isin(set(names))]
    annotated = set(pairs['protein']) if held is None else held
    if src.get('families'):
        fam = src['families']
        rules = load_families(families_file(spec, root))
        known = {x['name'] for x in rules['lists']}
        wanted = set(fam.get('lists') or known)
        if wanted - known:
            raise ValueError(f"{spec['id']}: sets.families.lists names lists {sorted(wanted - known)} the rules file does not have ({sorted(known)})")
        by = fam.get('by', src['set'])
        placed = place(dict(zip(t[src['set']].astype(str), t[by].astype(str))), rules)
        if gathered is not None:
            for s, (f, lst) in sorted(placed.items()):
                if lst in wanted:
                    gathered.setdefault(f, []).append(s)
        pairs = pd.DataFrame({'set': [placed[s][0] if s in placed and placed[s][1] in wanted else None for s in pairs['set']],
                              'protein': pairs['protein'].to_numpy()}).dropna().drop_duplicates()
        names = {}
    return pairs, names, annotated


def spec_problems(spec: dict, root=None, files: dict | None = None, formats: dict | None = None) -> list[str]:
    """What ptmc check finds wrong in a protein-set analysis: a families rules file that is missing or breaks its
    contract, lists it does not have, names beside families, combine without identifiers, a history or scores on sets
    of other identifiers, an order by a column the rows do not have; and, given files (role -> path; formats: path ->
    its manifest entry's columns, for its separator), columns its tables do not have."""
    out, src, aid = [], spec['sets'], spec['id']
    if src.get('each'):                                  # one set per item: its table's columns, its roles filled
        for it in src['each']:
            tb = it.get('table')
            if not tb and not it.get('units'):
                out.append(f"{aid}: set {it['set']!r} needs units: or table:")
            path = (files or {}).get(tb['input']) if tb else None
            if tb and path is not None and Path(path).exists():
                have = set(pd.read_csv(path, sep='\t', nrows=0).columns)
                cols = {tb['protein']} | {c['column'] for c in tb.get('include', []) + tb.get('exclude', [])}
                if cols - have:
                    out.append(f"{aid}: set {it['set']!r}: role {tb['input']} ({Path(path).name}) has no column {sorted(cols - have)}")
        return out
    fam = src.get('families')
    if fam:
        path = families_file(spec, root)
        if spec.get('names'):
            out.append(f'{aid}: sets gathered into families are named by their families: drop names:')
        if not path.exists():
            out.append(f"{aid}: sets.families.rules: no file {fam['rules']}")
        else:
            try:
                rules = load_families(path)
            except Exception as exc:              # noqa: BLE001  (reported, not raised: check lists every problem)
                out.append(f"{aid}: sets.families.rules {fam['rules']}: {exc}")
            else:
                known = {x['name'] for x in rules['lists']}
                if set(fam.get('lists', [])) - known:
                    out.append(f"{aid}: sets.families.lists {sorted(set(fam['lists']) - known)}: {fam['rules']} has lists {sorted(known)}")
    if (spec.get('abundance') or {}).get('combine') and not spec.get('identifiers'):
        out.append(f'{aid}: abundance.combine is for sets of other identifiers (identifiers:)')
    if spec.get('identifiers') and src.get('history'):
        out.append(f"{aid}: sets.history brings UniProt accessions to the snapshot's entries: it is not for sets of other identifiers")
    if spec.get('identifiers') and spec.get('scores'):
        out.append(f'{aid}: scores are a value per member protein: not for sets of other identifiers')
    out += [f"{aid}: order by {k['by']!r}: the rows have {list(ORDER_COLUMNS)}" for k in spec.get('order', []) if 'by' in k and k['by'] not in ORDER_COLUMNS]
    conds = lambda x: [c['column'] for c in x.get('include', []) + x.get('exclude', [])]  # noqa: E731
    rule_cols = [c for r in src.get('rules', []) for cond in r.get('when', []) for c in (cond.get('ratio') or [cond.get('column')])]
    named = [(src['input'], [src.get('set'), src['protein'], src.get('classes'), (fam or {}).get('by')] + conds(src) + rule_cols
              + [w['column'] for w in src.get('where', [])])]
    named += [(w['input'], [w['key']] + conds(w)) for w in src.get('where', [])]
    if src.get('history'):
        named.append((src['history']['input'], [src['history']['from'], src['history']['to']] + conds(src['history'])))
    if spec.get('scores'):
        sc = spec['scores']
        named.append((sc['input'], [sc['set'], sc['protein'], sc['value']] + conds(sc)))
    if src.get('ontology'):
        o = src['ontology']
        named.append((o['input'], [o['id'], o['name'], o['parent']]))
    if spec.get('names'):
        n = spec['names']
        named.append((n['input'], [n['set'], n['name']] + [c['column'] for c in n.get('include', []) + n.get('exclude', [])]))
    if spec.get('hierarchy'):
        h = spec['hierarchy']
        named.append((h['input'], [h['set'], h['parents']]))
    for step in (spec.get('identifiers') or {}).get('map', []):
        named.append((step['input'], [step['from'], step['to']]))
    if spec.get('abundance'):
        named.append((spec['abundance']['input'], [spec['abundance']['protein'], spec['abundance']['value']]))
    if spec.get('values'):
        v = spec['values']
        if spec.get('identifiers'):
            out.append(f'{aid}: values are numbers per protein: not for sets of other identifiers')
        named.append((values_role(spec), [v.get('protein') or src['protein']] + [c['name'] if isinstance(c, dict) else c for c in v['columns']] + conds(v)))
    for role, cols in named:
        path = (files or {}).get(role)
        if path is None or not Path(path).exists():
            continue
        sep = ((formats or {}).get(str(path)) or {}).get('sep', '\t')
        have = set(pd.read_csv(path, sep=sep, nrows=0).columns)
        missing = sorted({c for c in cols if c} - have)
        if missing:
            out.append(f'{aid}: role {role} ({Path(path).name}) has no column {missing}')
    return out


def set_parents(spec: dict, paths: dict, tested: set, formats: dict | None = None) -> dict[str, list[str]]:
    """Each tested set's parents among the tested sets (hierarchy: a table of sets and their parents), for the
    website's ontology views; no test reads it. In an ontology whose sets hold the members of the sets under them
    (an ontology's gene sets, say) every parent of a tested set is tested too."""
    h = spec['hierarchy']
    t = _read(paths[h['input']], formats)
    sep = h.get('separator', ';')
    out = {}
    for s, ps in zip(t[h['set']].astype(str).str.strip(), t[h['parents']].astype(str)):
        if s in tested:
            out[s] = [x for x in dict.fromkeys(x.strip() for x in ps.split(sep)) if x in tested and x != s]
    return out


def background_of(universe: set, annotated: set, whole_universe: bool) -> set:
    """The universe, or its identifiers the source annotates (clusterProfiler's own rule)."""
    return set(universe) if whole_universe else set(universe) & set(annotated)


def enricher(targets: set, universe: set, pairs: pd.DataFrame, whole_universe: bool = False, min_size: int = 1,
             max_size: int = 10 ** 6, annotated: set | None = None) -> pd.DataFrame:
    """One row per tested set: set, k, n, M, N, fold, p, q. annotated: the identifiers the source annotates (by
    default those in a set)."""
    background = background_of(universe, set(pairs['protein']) if annotated is None else annotated, whole_universe)
    members = pairs[pairs['protein'].isin(background)].groupby('set')['protein'].agg(set)
    hits = set(targets) & background
    n, N = len(hits), len(background)
    rows = []
    for s, genes in members.items():
        k, M = len(genes & hits), len(genes)
        if k and min_size <= M <= max_size:
            rows.append({'set': s, 'k': k, 'n': n, 'M': M, 'N': N, 'fold': (k / n) / (M / N), 'p': stats.hypergeom_sf(k, N, M, n)})
    out = pd.DataFrame(rows, columns=['set', 'k', 'n', 'M', 'N', 'fold', 'p'])
    out['q'] = stats.benjamini_hochberg(out['p']) if len(out) else []
    return out


def deciles(proteins: list, values: pd.Series, n: int = 10) -> np.ndarray:
    """Each protein's decile of a covariate among the proteins given (1 the lowest), or 'none' without a value: the
    quantile edges of the values, a value placed with the edges to its right (as the release's abundance_strata.py)."""
    v = values.reindex(proteins)
    have = v.notna().to_numpy()
    out = np.full(len(proteins), 'none', dtype=object)
    if have.any():
        edges = np.quantile(v[have].to_numpy(dtype=float), np.linspace(0, 1, n + 1))
        out[have] = np.clip(np.searchsorted(edges, v[have].to_numpy(dtype=float), side='right'), 1, n).astype(str)
    return out


def covariate(spec: dict, paths: dict, id_of: dict | None = None, formats: dict | None = None) -> pd.Series:
    """The abundance covariate (abundance: a value per protein, its first row where a protein has several). For sets
    of other identifiers, each identifier takes the highest value of the site's proteins that map to it (combine: max)."""
    ab = spec['abundance']
    t = _read(paths[ab['input']], formats)
    values = pd.to_numeric(t.set_index(ab['protein'])[ab['value']], errors='coerce').dropna()
    values = values[~values.index.duplicated()]
    if id_of is None:
        return values
    combine = {'max': max}[ab.get('combine', 'max')]
    out: dict[str, float] = {}
    for p, ids in id_of.items():
        if p in values.index:
            v = float(values[p])
            for u in ids:
                out[u] = combine(out[u], v) if u in out else v
    return pd.Series(out, dtype=float)


def stratified_rows(spec: dict, rows: pd.DataFrame, pairs: pd.DataFrame, targets: set, background: set, values: pd.Series) -> pd.DataFrame:
    """The same sets again within strata of a covariate (abundance: a Mantel-Haenszel odds ratio across its deciles,
    with its 95% CI and the continuity-corrected CMH test; BH within the analysis): whether an enrichment holds among
    proteins of similar abundance. The a, b, c, d are the test's own."""
    ab = spec['abundance']
    background = sorted(background)
    layer = deciles(background, values, ab.get('strata', 10))
    codes, idx = np.unique(layer.astype(str), return_inverse=True)
    k = len(codes)
    pos = {u: i for i, u in enumerate(background)}
    is_t = np.array([u in targets for u in background])
    n_t, n_all = np.bincount(idx[is_t], minlength=k), np.bincount(idx, minlength=k)
    members = pairs[pairs['protein'].isin(pos)].groupby('set')['protein'].agg(list)
    out = []
    for r in rows.to_dict('records'):
        in_set = np.zeros(len(background), dtype=bool)
        in_set[[pos[u] for u in members.get(r['category'], [])]] = True
        both, n_s = np.bincount(idx[is_t & in_set], minlength=k), np.bincount(idx[in_set], minlength=k)
        tables = [(int(both[i]), int(n_t[i] - both[i]), int(n_s[i] - both[i]), int(n_all[i] - n_t[i] - n_s[i] + both[i])) for i in range(k)]
        if tuple(sum(x[j] for x in tables) for j in range(4)) != (r['a'], r['b'], r['c'], r['d']):
            raise ValueError(f"{spec['id']} {r['category']}: the strata do not add up to the test's counts")
        odds, lo, hi, p, used = stats.mantel_haenszel_ci(tables)
        out.append({**{x: r[x] for x in ('analysis', 'category', 'stratum', 'a', 'b', 'c', 'd')},
                    'odds_ratio': odds, 'log2_odds_ratio': math.log2(odds) if odds and odds > 0 and math.isfinite(odds) else None,
                    'odds_ratio_ci_low': lo, 'odds_ratio_ci_high': hi, 'p': p, 'method': 'mantel_haenszel',
                    'background': r['background'] + ab.get('label', ', each abundance decile a stratum'), 'n_strata': used})
    res = pd.DataFrame(out)
    if len(res):
        res['q'] = stats.benjamini_hochberg(res['p'].astype(float))
    return res


def membership_scores(spec: dict, paths: dict, entries: set, formats: dict | None = None) -> dict[str, dict[str, float]]:
    """set -> protein -> score from an analysis's scores table (scores: a value for each of a set's members, as
    CD-CODE's confidence that a protein belongs to a condensate): the highest a protein has in a set, members as
    entries and, with the sets' history, brought to the snapshot's entries as the sets are. For the website's filter
    only: no test reads it."""
    sc = spec['scores']
    t = _select(_read(paths[sc['input']], formats), sc)
    members = _entry(t[sc['protein']])
    if spec['sets'].get('history'):
        members = current_entries(members, spec['sets']['history'], paths, entries, formats)
    values = pd.to_numeric(t[sc['value']], errors='coerce')
    frame = pd.DataFrame({'set': t[sc['set']].astype(str).to_numpy(), 'protein': members.to_numpy(), 'value': values.to_numpy()})
    frame = frame[(frame['protein'] != '') & frame['value'].notna()]
    out: dict[str, dict[str, float]] = {}
    for s, g in frame.groupby('set'):
        out[s] = g.groupby('protein')['value'].max().to_dict()
    return out


def _proteins_of(refs, ctx, select) -> set:
    out = set()
    for ref in _refs(refs):
        role = _role(ref)
        u = ctx.units(role, role)
        if isinstance(ref, dict) and ref.get('where'):
            u = select(u, {'include': ref['where']}, ctx.snapshot)
        out |= set(u['accession'])
    return out


def each_set_test(spec: dict, ctx, marked_proteins: set, snapshot_proteins: set, keep: dict | None = None,
                  left_out: list | None = None, formats: dict | None = None) -> tuple[pd.DataFrame, dict]:
    """Protein-set rows for sets.each: one set per item, the proteins with a unit in its roles or listed in its table,
    each tested against its own universe (the proteins with a unit in its universe_units roles, among the site's
    proteins; else the analysis's universe), as one enricher job per set; BH over the sets; the abundance strata are the
    deciles of each set's own universe. An item reading an input that is not present is left out (left_out)."""
    from .units import select_rows
    universe = set(snapshot_proteins)
    targets_all = set(marked_proteins)
    found, own_bg, pairs_all, bgs = [], {}, [], {}
    values = covariate(spec, ctx.inputs, formats=formats) if spec.get('abundance') else None
    for it in spec['sets']['each']:
        missing = [r for r in item_roles(it) if r not in ctx.inputs]
        if missing:
            if left_out is not None:
                left_out.append({'code': it['set'], 'roles': missing})
            continue
        members = _proteins_of(it.get('units'), ctx, select_rows)
        if it.get('table'):
            tb = it['table']
            t = _select(_read(ctx.inputs[tb['input']], formats), tb)
            members |= set(t[tb['protein']].astype(str).str.split('-').str[0])
        U = (_proteins_of(it['universe_units'], ctx, select_rows) & universe) if it.get('universe_units') else universe
        res = enricher(targets_all & U, U, pd.DataFrame({'set': it['set'], 'protein': sorted(members & U)}, columns=['set', 'protein']),
                       whole_universe=True, min_size=spec.get('min_size', 1), max_size=spec.get('max_size', 10 ** 6))
        if not len(res):
            continue
        r = res.iloc[0].to_dict()
        r['background'] = it.get('background', spec.get('background', 'other proteins of the universe'))
        found.append(r)
        bgs[it['set']] = U
        own_bg[it['set']] = bool(it.get('universe_units'))
        pairs_all.append(pd.DataFrame({'set': it['set'], 'protein': sorted(members & U)}))
    res = pd.DataFrame(found, columns=['set', 'k', 'n', 'M', 'N', 'fold', 'p', 'background'])
    res['q'] = stats.benjamini_hochberg(res['p']) if len(res) else []
    if spec.get('order') != 'as_listed':                # by the order's keys, else ascending p, then set
        res = res.sort_values(['p', 'set'], kind='stable').reset_index(drop=True)
        keyed = ordered(pd.DataFrame({'category': res['set'], 'a': res['k'], 'b': res['n'] - res['k'], 'c': res['M'] - res['k'],
                                      'd': res['N'] - res['M'] - res['n'] + res['k'], 'fold_enrichment': res['fold'], 'p': res['p'],
                                      'q': res['q'], 'row': range(len(res))}), spec.get('order'))
        res = res.iloc[list(keyed['row'])]
    pairs = pd.concat(pairs_all, ignore_index=True) if pairs_all else pd.DataFrame(columns=['set', 'protein'])
    rows = [{'analysis': spec['id'], 'category': r['set'], 'stratum': 'all', 'a': r['k'], 'b': r['n'] - r['k'], 'c': r['M'] - r['k'],
             'd': r['N'] - r['M'] - r['n'] + r['k'], 'fold_enrichment': r['fold'],
             'log2_fold_enrichment': math.log2(r['fold']) if r['fold'] > 0 else np.nan, 'p': r['p'], 'q': r['q'],
             'method': 'enricher', 'background': r['background'], 'n_strata': ''} for r in res.to_dict('records')]
    out = pd.DataFrame(rows)
    if keep is not None:
        keep.update({'N': len(universe), 'marked_in_background': sorted(targets_all & universe), 'sets': {}})
        for r in res.to_dict('records'):
            g = set(pairs.loc[pairs['set'] == r['set'], 'protein'])
            keep['sets'][r['set']] = {'M': len(g), 'marked': sorted(g & targets_all),
                                      **({'N': len(bgs[r['set']]), 'marked_in_background': sorted(targets_all & bgs[r['set']])} if own_bg[r['set']] else {})}
        if values is not None:
            ab = spec['abundance']
            bg = sorted(universe)
            dec = dict(zip(bg, deciles(bg, values, ab.get('strata', 10))))
            keep['covariate'] = {'input': ab['input'], 'value': ab['value'], 'strata': ab.get('strata', 10),
                                 'proteins': {u: [float(values[u]) if u in values.index else None, dec[u]] for u in sorted(targets_all & universe)}}
    if values is not None and len(out):
        parts = [stratified_rows(spec, out[out['category'] == r['category']], pairs[pairs['set'] == r['category']], targets_all & bgs[r['category']],
                                 bgs[r['category']], values) for r in rows]
        mh = pd.concat(parts, ignore_index=True)
        mh['q'] = stats.benjamini_hochberg(mh['p'].astype(float))
        out = pd.concat([out, mh], ignore_index=True)
    return out, {it['set']: it['name'] for it in spec['sets']['each'] if it.get('name')}


def protein_set_test(spec: dict, paths: dict, marked_proteins: set, snapshot_proteins: set,
                     keep: dict | None = None, root=None, formats: dict | None = None, ctx=None,
                     left_out: list | None = None) -> tuple[pd.DataFrame, dict]:
    """Statistics rows of one protein-set analysis of a site, and the names of its sets. keep, if given, receives what
    a website needs to test a selection of the marked proteins again: the background's size, which marked proteins (or
    their identifiers) are in it, each tested set's size and marked members, and, for sets of other identifiers, each
    marked protein's identifiers; and, for its filters, the marked proteins (identifiers) in any of the source's sets
    and, with a scores table, each set's marked members' scores. root: the site's repository, which a families rules
    file is relative to; formats: path -> its manifest entry's columns (a file's separator). ctx: the site's layer
    context, for sets made from units (sets.each); left_out receives the sets.each items whose inputs are absent."""
    if spec['sets'].get('each'):
        if ctx is None:
            raise ValueError(f"{spec['id']}: sets.each reads units: it needs the site's context")
        return each_set_test(spec, ctx, marked_proteins, snapshot_proteins, keep, left_out, formats)
    if spec['sets'].get('unclassified') and spec.get('universe') != 'snapshot':
        raise ValueError(f"{spec['id']}: an unclassified set needs universe: snapshot")
    if spec['sets'].get('families') and spec.get('names'):
        raise ValueError(f"{spec['id']}: sets gathered into families are named by their families: drop names:")
    if spec.get('scores') and spec.get('identifiers'):
        raise ValueError(f"{spec['id']}: scores are a value per member protein: not for sets of other identifiers")
    id_of = identifiers_of(spec['identifiers'], paths, sorted(snapshot_proteins), formats) if spec.get('identifiers') else None
    proteome = set().union(*id_of.values()) if id_of is not None else set(snapshot_proteins)
    targets = set().union(*(id_of[p] for p in marked_proteins if p in id_of)) if id_of is not None else set(marked_proteins)
    gathered: dict[str, list] = {}
    pairs, names, annotated = read_sets(spec, paths, proteome, root, formats, gathered=gathered)
    universe = annotated if spec.get('universe', 'annotated') == 'annotated' else proteome
    whole = spec.get('whole_universe', False)
    background = background_of(universe, annotated, whole)
    res = enricher(targets & universe, universe, pairs, whole_universe=whole, min_size=spec.get('min_size', 1),
                   max_size=spec.get('max_size', 10 ** 6), annotated=annotated)
    res = res.sort_values(['p', 'set'], kind='stable')
    values = covariate(spec, paths, id_of, formats) if spec.get('abundance') else None
    if keep is not None:
        members = pairs[pairs['protein'].isin(background)].groupby('set')['protein'].agg(set)
        size_ok = members[members.map(len).between(spec.get('min_size', 1), spec.get('max_size', 10 ** 6))]
        keep.update({'N': len(background), 'marked_in_background': sorted(targets & background),
                     'sets': {s: {'M': len(g), 'marked': sorted(g & targets)} for s, g in size_ok.items()}})
        if spec.get('hierarchy'):                        # each tested set's parents, for the website's ontology views
            keep['parents'] = set_parents(spec, paths, set(keep['sets']), formats)
            root_set = spec['hierarchy'].get('root')
            if root_set in keep['sets']:
                keep['root'] = root_set
        if gathered:                                     # each family's own sets, for the website's table of member sets
            keep['gathers'] = {f: ss for f, ss in sorted(gathered.items()) if f in keep['sets']}
        if (spec.get('filter') or {}).get('any'):        # the filter offers "in any of its sets"
            keep['marked_in_any'] = sorted(targets & annotated)
        if (spec.get('filter') or {}).get('sets') == 'all':     # the filter offers the untested sets too
            held = pairs[pairs['protein'].isin(targets)].groupby('set')['protein'].agg(set)
            keep['filter_sets'] = {s: {'name': names.get(s, ''), 'marked': sorted(g)} for s, g in held.items() if s not in keep['sets']}
        if spec.get('scores'):                           # each set's marked members' scores, for the website's filter
            sc = membership_scores(spec, paths, set(snapshot_proteins), formats)
            keep['scores'] = {'label': spec['scores'].get('label', spec['scores']['value']), 'max': spec['scores'].get('max'),
                              'levels': spec['scores'].get('levels', []), 'help': spec['scores'].get('help', ''),
                              'sets': {s: {p: v for p, v in sorted(sc.get(s, {}).items()) if p in targets}
                                       for s in [*keep['sets'], *keep.get('filter_sets', {})] if sc.get(s)}}
            best: dict[str, float] = {}                  # each marked protein's highest score in any of the source's sets
            for s in set(pairs['set']) & set(sc):
                for p, v in sc[s].items():
                    if p in targets:
                        best[p] = max(best.get(p, v), v)
            keep['scores']['any'] = dict(sorted(best.items()))
        if id_of is not None:                            # each marked protein's identifiers in the background
            ids = spec['identifiers']
            keep['identifiers'] = {'noun': ids.get('noun', 'identifier'), 'nouns': ids.get('nouns', 'identifiers'),
                                   'proteins': {p: sorted(id_of[p] & background) for p in sorted(marked_proteins) if id_of.get(p, set()) & background}}
        if values is not None:                           # each marked protein's (or identifier's) covariate and decile
            ab = spec['abundance']
            bg = sorted(background)
            dec = dict(zip(bg, deciles(bg, values, ab.get('strata', 10))))
            keep['covariate'] = {'input': ab['input'], 'value': ab['value'], 'strata': ab.get('strata', 10),
                                 'proteins': {u: [float(values[u]) if u in values.index else None, dec[u]] for u in sorted(targets & background)},
                                 'counts': strata_counts(bg, dec, size_ok)}
        if spec.get('values'):                           # per-protein numbers shown beside the sets (no test reads them)
            keep['values'] = protein_values(spec, paths, background, targets, formats)
    rows = [{'analysis': spec['id'], 'category': r['set'], 'stratum': 'all', 'a': r['k'], 'b': r['n'] - r['k'], 'c': r['M'] - r['k'],
             'd': r['N'] - r['M'] - r['n'] + r['k'], 'fold_enrichment': r['fold'],
             'log2_fold_enrichment': math.log2(r['fold']) if r['fold'] > 0 else np.nan, 'p': r['p'], 'q': r['q'],
             'method': 'enricher', 'background': spec.get('background', 'other proteins of the universe'), 'n_strata': ''}
            for r in res.to_dict('records')]
    out = ordered(pd.DataFrame(rows), spec.get('order'))
    if spec.get('abundance') and len(out):
        out = pd.concat([out, stratified_rows(spec, out, pairs, targets & universe, background, values)], ignore_index=True)
    if spec.get('sizes'):
        out = pd.concat([out, size_rows(spec, paths, pairs, targets & universe, background, formats)], ignore_index=True)
    return out, names


def size_rows(spec: dict, paths: dict, pairs: pd.DataFrame, targets: set, background: set, formats: dict | None = None) -> pd.DataFrame:
    """For each set of the background's size limits (min_size, max_size; with a marked member or not), a number every protein of the background has for it (sizes.value, a column of the sets'
    table on the row of that protein and set, called a member or not; log2 of it with sizes.log2), the marked proteins
    against the others: a two-sided Mann-Whitney U test, BH over the sets (a p that cannot be computed counts as 1).
    a and c count the proteins compared. Whether the marked proteins' values differ, not only their calls."""
    src, sz = spec['sets'], spec['sizes']
    t, members = set_table(spec, paths, None, formats)
    v = pd.to_numeric(t[sz['value']], errors='coerce')
    if sz.get('log2'):
        v = v.map(lambda x: (math.log2(x) if x > 0 else -math.inf) if pd.notna(x) else np.nan)
    frame = pd.DataFrame({'set': t[src['set']].astype(str).to_numpy(), 'protein': members.to_numpy(), 'v': v.to_numpy()})
    frame = frame[frame['protein'].isin(background) & frame['v'].notna()]
    out = []
    sizes = pairs[pairs['protein'].isin(background)].groupby('set')['protein'].nunique()
    for c in sorted(sizes[sizes.between(spec.get('min_size', 1), spec.get('max_size', 10 ** 6))].index.astype(str)):
        f = frame[frame['set'] == c].drop_duplicates('protein')
        yes, no = f.loc[f['protein'].isin(targets), 'v'].tolist(), f.loc[~f['protein'].isin(targets), 'v'].tolist()
        out.append({'analysis': spec['id'], 'category': c, 'stratum': 'all', 'a': len(yes), 'b': None, 'c': len(no), 'd': None,
                    'p': stats.mann_whitney_p(yes, no), 'method': 'mann_whitney', 'n_strata': '',
                    'background': sz.get('background', f"the {sz['value']} of each other protein of the background")})
    res = pd.DataFrame(out)
    if len(res):
        res['q'] = stats.benjamini_hochberg([1.0 if math.isnan(p) else p for p in res['p']])
    return res
