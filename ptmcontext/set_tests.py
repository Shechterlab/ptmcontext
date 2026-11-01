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
ontology that places them, at the top level (optionally gathered into groups the site file names) or below it.
"""
from __future__ import annotations

import math

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


def roles_of(spec: dict) -> list[str]:
    """The roles a protein-set analysis reads: its sets (and their ontology), names and covariate."""
    return [r for r in (spec['sets']['input'], spec['sets'].get('ontology', {}).get('input'), spec.get('names', {}).get('input'),
                        spec.get('abundance', {}).get('input')) if r]


def _read(path) -> pd.DataFrame:
    return pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False, low_memory=False)


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


def read_sets(spec: dict, paths: dict, universe: set | None = None) -> tuple[pd.DataFrame, dict]:
    """(set, protein) pairs and the sets' names, from the tables a site's analysis names."""
    src = spec['sets']
    if 'classes' in src:
        return class_sets(src, paths, universe or set()), {}
    t = _select(pd.read_csv(paths[src['input']], sep='\t', dtype=str, keep_default_na=False, low_memory=False), src)
    pairs = pd.DataFrame({'set': t[src['set']].astype(str), 'protein': t[src['protein']].astype(str).str.split('-').str[0]}).drop_duplicates()
    names = {}
    if spec.get('names'):
        nm = spec['names']
        n = _select(pd.read_csv(paths[nm['input']], sep='\t', dtype=str, keep_default_na=False, low_memory=False), nm)
        names = dict(zip(n[nm['set']].astype(str), n[nm['name']].astype(str)))
        if nm.get('include') or nm.get('exclude'):          # a filter on the names restricts the sets tested
            pairs = pairs[pairs['set'].isin(set(names))]
    return pairs, names


def background_of(universe: set, pairs: pd.DataFrame, whole_universe: bool) -> set:
    return set(universe) if whole_universe else set(universe) & set(pairs['protein'])


def enricher(targets: set, universe: set, pairs: pd.DataFrame, whole_universe: bool = False, min_size: int = 1,
             max_size: int = 10 ** 6) -> pd.DataFrame:
    """One row per tested set: set, k, n, M, N, fold, p, q."""
    background = background_of(universe, pairs, whole_universe)
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


def stratified_rows(spec: dict, paths: dict, rows: pd.DataFrame, pairs: pd.DataFrame, targets: set, universe: set) -> pd.DataFrame:
    """The same sets again within strata of a covariate (abundance: a Mantel-Haenszel odds ratio across its deciles,
    with its 95% CI and the continuity-corrected CMH test; BH within the analysis): whether an enrichment holds among
    proteins of similar abundance. The a, b, c, d are the test's own."""
    ab = spec['abundance']
    t = pd.read_csv(paths[ab['input']], sep='\t', dtype=str, keep_default_na=False)
    values = pd.to_numeric(t.set_index(ab['protein'])[ab['value']], errors='coerce').dropna()
    values = values[~values.index.duplicated()]
    background = sorted(background_of(universe, pairs, spec.get('whole_universe', False)))
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


def protein_set_test(spec: dict, paths: dict, marked_proteins: set, snapshot_proteins: set) -> tuple[pd.DataFrame, dict]:
    """Statistics rows of one protein-set analysis of a site, and the names of its sets."""
    if spec['sets'].get('unclassified') and spec.get('universe') != 'snapshot':
        raise ValueError(f"{spec['id']}: an unclassified set needs universe: snapshot")
    pairs, names = read_sets(spec, paths, set(snapshot_proteins))
    universe = set(pairs['protein']) if spec.get('universe', 'annotated') == 'annotated' else set(snapshot_proteins)
    res = enricher(marked_proteins & universe, universe, pairs, whole_universe=spec.get('whole_universe', False),
                   min_size=spec.get('min_size', 1), max_size=spec.get('max_size', 10 ** 6))
    res = res.sort_values(['p', 'set'], kind='stable')
    rows = [{'analysis': spec['id'], 'category': r['set'], 'stratum': 'all', 'a': r['k'], 'b': r['n'] - r['k'], 'c': r['M'] - r['k'],
             'd': r['N'] - r['M'] - r['n'] + r['k'], 'fold_enrichment': r['fold'],
             'log2_fold_enrichment': math.log2(r['fold']) if r['fold'] > 0 else np.nan, 'p': r['p'], 'q': r['q'],
             'method': 'enricher', 'background': spec.get('background', 'other proteins of the universe'), 'n_strata': ''}
            for r in res.to_dict('records')]
    out = pd.DataFrame(rows)
    if spec.get('abundance') and len(out):
        out = pd.concat([out, stratified_rows(spec, paths, out, pairs, marked_proteins & universe, universe)], ignore_index=True)
    return out, names
