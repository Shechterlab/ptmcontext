"""Are the marked proteins over-represented in a set of proteins (a pathway, a location, a class), against a universe?

The test is clusterProfiler's enricher, written out so it needs no R: the one-sided hypergeometric test with
Benjamini-Hochberg over the sets tested, and the fold enrichment (k/n)/(M/N). The release's statistics were made with
clusterProfiler itself, and tests/test_parity_v1_4_3.py checks these rows against them.

  background  the universe; or, by default, the universe proteins in at least one set (clusterProfiler's own rule)
  tested      the sets holding at least one target, of min_size to max_size background proteins
  a, b, c, d  k; n - k; M - k; N - M - n + k

A site file names everything else: which table holds the sets, which columns name the set and the protein, which rows
to keep, the names of the sets, the universe and the sizes. Nothing here names a source.

Sets come from a table of (set, protein) pairs, or from a class hierarchy (class_sets): each protein's classes and the
ontology that places them, at the top level (optionally gathered into groups the site file names) or below it. The sets
of a table may be gathered into families by their names (families: a site's own rules file), and may be keyed by an
identifier other than the site's proteins (identifiers: the tables that map each protein to it, as UniProt entries to
Entrez genes); the test then counts those identifiers, and its universe is the site's proteins' identifiers.
"""
from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import hypergeom

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


def question_roles(spec: dict) -> list[str]:
    """The roles holding what a protein-set analysis asks about: its sets (and their ontology) and their names."""
    return [r for r in (spec['sets']['input'], spec['sets'].get('ontology', {}).get('input'), spec.get('names', {}).get('input')) if r]


def map_roles(spec: dict) -> list[str]:
    """The roles of the tables that map the site's proteins to the sets' identifiers (none when the sets hold proteins)."""
    return list(dict.fromkeys(step['input'] for step in (spec.get('identifiers') or {}).get('map', [])))


def roles_of(spec: dict) -> list[str]:
    """Every role a protein-set analysis reads: its sets (and their ontology), names, identifier map and covariate."""
    return list(dict.fromkeys(question_roles(spec) + map_roles(spec) + [r for r in [spec.get('abundance', {}).get('input')] if r]))


def _read(path) -> pd.DataFrame:
    return pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False, low_memory=False)


def identifiers_of(spec: dict, paths: dict, proteins) -> dict[str, set]:
    """Each protein's identifiers in the sets' own terms (identifiers.map): the tables in turn, each step taking the
    values of its `to` column on the rows whose `from` column holds an identifier of the step before (the protein's
    accession, first). With a separator a value is a list, of which `take: first` keeps the first item (default: all
    items). Empty values are dropped; a protein may end with several identifiers, or none."""
    current = {p: {p} for p in proteins}
    for step in spec['map']:
        t = _read(paths[step['input']])
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


def class_sets(src: dict, paths: dict, universe: set) -> pd.DataFrame:
    """(set, protein) pairs from a class hierarchy, each set named by its class's name (or its group's).

      level top        each protein's top-level classes (the root's children above its classes); with groups, the
                       group of each top-level class instead
      level below_top  every class below the top level that a protein's classes are, or lie under
      unclassified     the universe's proteins with no set at this level, as one more set of this name
    """
    onto = src['ontology']
    o = _read(paths[onto['input']])
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
    t = _read(paths[src['input']])
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


def read_sets(spec: dict, paths: dict, universe: set | None = None, root=None) -> tuple[pd.DataFrame, dict, set]:
    """(set, protein) pairs, the sets' names, and the identifiers the source annotates (what the background is drawn
    from), from the tables a site's analysis names. With families, each set is replaced by its family (sets.families:
    the rules file, relative to root, the column whose names they read, and the lists tested); the source still
    annotates every identifier of its table, in a family or not."""
    src = spec['sets']
    if 'classes' in src:
        pairs = class_sets(src, paths, universe or set())
        return pairs, {}, set(pairs['protein'])
    t = _select(pd.read_csv(paths[src['input']], sep='\t', dtype=str, keep_default_na=False, low_memory=False), src)
    members = t[src['protein']].astype(str)
    if not spec.get('identifiers'):                       # UniProt accessions: an isoform counts as its entry
        members = members.str.split('-').str[0]
    pairs = pd.DataFrame({'set': t[src['set']].astype(str), 'protein': members}).drop_duplicates()
    names = {}
    if spec.get('names'):
        nm = spec['names']
        n = _select(pd.read_csv(paths[nm['input']], sep='\t', dtype=str, keep_default_na=False, low_memory=False), nm)
        names = dict(zip(n[nm['set']].astype(str), n[nm['name']].astype(str)))
        if nm.get('include') or nm.get('exclude'):          # a filter on the names restricts the sets tested
            pairs = pairs[pairs['set'].isin(set(names))]
    annotated = set(pairs['protein'])
    if src.get('families'):
        fam = src['families']
        rules = load_families(families_file(spec, root))
        known = {x['name'] for x in rules['lists']}
        wanted = set(fam.get('lists') or known)
        if wanted - known:
            raise ValueError(f"{spec['id']}: sets.families.lists names lists {sorted(wanted - known)} the rules file does not have ({sorted(known)})")
        by = fam.get('by', src['set'])
        placed = place(dict(zip(t[src['set']].astype(str), t[by].astype(str))), rules)
        pairs = pd.DataFrame({'set': [placed[s][0] if s in placed and placed[s][1] in wanted else None for s in pairs['set']],
                              'protein': pairs['protein'].to_numpy()}).dropna().drop_duplicates()
        names = {}
    return pairs, names, annotated


def spec_problems(spec: dict, root=None, files: dict | None = None) -> list[str]:
    """What ptmc check finds wrong in a protein-set analysis: a families rules file that is missing or breaks its
    contract, lists it does not have, names beside families, combine without identifiers; and, given files (role ->
    path), columns its tables do not have."""
    out, src, aid = [], spec['sets'], spec['id']
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
    named = [(src['input'], [src.get('set'), src['protein'], src.get('classes'), (fam or {}).get('by')]
              + [c['column'] for c in src.get('include', []) + src.get('exclude', [])])]
    if src.get('ontology'):
        o = src['ontology']
        named.append((o['input'], [o['id'], o['name'], o['parent']]))
    if spec.get('names'):
        n = spec['names']
        named.append((n['input'], [n['set'], n['name']] + [c['column'] for c in n.get('include', []) + n.get('exclude', [])]))
    for step in (spec.get('identifiers') or {}).get('map', []):
        named.append((step['input'], [step['from'], step['to']]))
    if spec.get('abundance'):
        named.append((spec['abundance']['input'], [spec['abundance']['protein'], spec['abundance']['value']]))
    for role, cols in named:
        path = (files or {}).get(role)
        if path is None or not Path(path).exists():
            continue
        have = set(pd.read_csv(path, sep='\t', nrows=0).columns)
        missing = sorted({c for c in cols if c} - have)
        if missing:
            out.append(f'{aid}: role {role} ({Path(path).name}) has no column {missing}')
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
            rows.append({'set': s, 'k': k, 'n': n, 'M': M, 'N': N, 'fold': (k / n) / (M / N), 'p': float(hypergeom.sf(k - 1, N, M, n))})
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


def covariate(spec: dict, paths: dict, id_of: dict | None = None) -> pd.Series:
    """The abundance covariate (abundance: a value per protein, its first row where a protein has several). For sets
    of other identifiers, each identifier takes the highest value of the site's proteins that map to it (combine: max)."""
    ab = spec['abundance']
    t = pd.read_csv(paths[ab['input']], sep='\t', dtype=str, keep_default_na=False)
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


def protein_set_test(spec: dict, paths: dict, marked_proteins: set, snapshot_proteins: set,
                     keep: dict | None = None, root=None) -> tuple[pd.DataFrame, dict]:
    """Statistics rows of one protein-set analysis of a site, and the names of its sets. keep, if given, receives what
    a website needs to test a selection of the marked proteins again: the background's size, which marked proteins (or
    their identifiers) are in it, each tested set's size and marked members, and, for sets of other identifiers, each
    marked protein's identifiers. root: the site's repository, which a families rules file is relative to."""
    if spec['sets'].get('unclassified') and spec.get('universe') != 'snapshot':
        raise ValueError(f"{spec['id']}: an unclassified set needs universe: snapshot")
    if spec['sets'].get('families') and spec.get('names'):
        raise ValueError(f"{spec['id']}: sets gathered into families are named by their families: drop names:")
    id_of = identifiers_of(spec['identifiers'], paths, sorted(snapshot_proteins)) if spec.get('identifiers') else None
    proteome = set().union(*id_of.values()) if id_of is not None else set(snapshot_proteins)
    targets = set().union(*(id_of[p] for p in marked_proteins if p in id_of)) if id_of is not None else set(marked_proteins)
    pairs, names, annotated = read_sets(spec, paths, proteome, root)
    universe = annotated if spec.get('universe', 'annotated') == 'annotated' else proteome
    whole = spec.get('whole_universe', False)
    background = background_of(universe, annotated, whole)
    res = enricher(targets & universe, universe, pairs, whole_universe=whole, min_size=spec.get('min_size', 1),
                   max_size=spec.get('max_size', 10 ** 6), annotated=annotated)
    res = res.sort_values(['p', 'set'], kind='stable')
    values = covariate(spec, paths, id_of) if spec.get('abundance') else None
    if keep is not None:
        members = pairs[pairs['protein'].isin(background)].groupby('set')['protein'].agg(set)
        size_ok = members[members.map(len).between(spec.get('min_size', 1), spec.get('max_size', 10 ** 6))]
        keep.update({'N': len(background), 'marked_in_background': sorted(targets & background),
                     'sets': {s: {'M': len(g), 'marked': sorted(g & targets)} for s, g in size_ok.items()}})
        if id_of is not None:                            # each marked protein's identifiers in the background
            ids = spec['identifiers']
            keep['identifiers'] = {'noun': ids.get('noun', 'identifier'), 'nouns': ids.get('nouns', 'identifiers'),
                                   'proteins': {p: sorted(id_of[p] & background) for p in sorted(marked_proteins) if id_of.get(p, set()) & background}}
        if values is not None:                           # each marked protein's (or identifier's) covariate and decile
            ab = spec['abundance']
            bg = sorted(background)
            dec = dict(zip(bg, deciles(bg, values, ab.get('strata', 10))))
            keep['covariate'] = {'input': ab['input'], 'value': ab['value'], 'strata': ab.get('strata', 10),
                                 'proteins': {u: [float(values[u]) if u in values.index else None, dec[u]] for u in sorted(targets & background)}}
    rows = [{'analysis': spec['id'], 'category': r['set'], 'stratum': 'all', 'a': r['k'], 'b': r['n'] - r['k'], 'c': r['M'] - r['k'],
             'd': r['N'] - r['M'] - r['n'] + r['k'], 'fold_enrichment': r['fold'],
             'log2_fold_enrichment': math.log2(r['fold']) if r['fold'] > 0 else np.nan, 'p': r['p'], 'q': r['q'],
             'method': 'enricher', 'background': spec.get('background', 'other proteins of the universe'), 'n_strata': ''}
            for r in res.to_dict('records')]
    out = pd.DataFrame(rows)
    if spec.get('abundance') and len(out):
        out = pd.concat([out, stratified_rows(spec, out, pairs, targets & universe, background, values)], ignore_index=True)
    return out, names
