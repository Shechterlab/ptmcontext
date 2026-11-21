"""The network view's data (website.network): one network of the site's proteins, grouped into clusters, each cluster named by
its most enriched term (CONTRACTS.md, 'The network view'). Everything is read from tables the site's inputs name; nothing is
asked of a service.

Two files are written, both read only when a reader opens the view (kit-network.js), neither in the first-view payload:

    data/network.json       the default view: the top `top` proteins by site count, the edges among them, the clusters
                            (Louvain) and each cluster's term. What the page draws at first.
    data/network_full.json  every site protein with an edge, the edges, each term's proteins and the colour-by values: what
                            the browser needs to make the same network again for a selection or other options.

The clustering (`louvain`) and the labelling (`label_clusters`) are the Python twin of kit-netcore.js: the same steps in the
same order on the same integers, so that the page's default and this file's agree (tests/test_network.py runs both).
"""

from __future__ import annotations

import base64
import json
import math
from collections import Counter, defaultdict
from functools import lru_cache
from itertools import combinations
from pathlib import Path

import pandas as pd
from ptmstats import benjamini_hochberg, hypergeom_sf

from ..snapshot import md5_file
from .netlayout import layout, short_name

DEFAULTS = {
    'top': 300,
    'min_cluster': 5,
    'max_clusters': 8,
    'resolution': 1.0,
    'max_q': 0.05,
    'min_coverage': 0.25,
    'thin_term': 'best',
    'weak_p': 0.05,
    'background': 'proteome',
    'min_overlap': 3,
    'min_term': 5,
    'max_fraction': 0.2,
    'label': 0,
    'clusters': None,
    'min_score': 700,
    'complex_weight': 700,
    'complex_max_size': 40,
}
GROUPISH = ('groups', 'functional')  # sources whose edges are a presence, not a threshold of the score
# how a link type is drawn, as multiples of the figure's own link: dashed or not, width, opacity, tint (the colour of the
# cluster darkened), and `rank` (which type names an edge that several give: the highest). The site may set any of them.
STYLE = {
    'pairs': {'dash': False, 'width': 1.0, 'opacity': 1.0, 'tint': False, 'rank': 2},
    'channel': {'dash': False, 'width': 1.0, 'opacity': 0.6, 'tint': False, 'rank': 1},
    'groups': {'dash': False, 'width': 2.4, 'opacity': 1.8, 'tint': True, 'rank': 3},
    'functional': {'dash': True, 'width': 1.0, 'opacity': 0.6, 'tint': False, 'rank': 0},
}
DENSITY_UNIT = (
    0.4  # a node's area is DENSITY_UNIT * density in the layout's units of one site (density 100 reaches the cap)
)
MIN_UNITS = 0.9  # the smallest drawn node, as the node of one site is
SIZES = ('density', 'sites')
STEPS = (400, 700, 900)  # the STRING thresholds the page offers, from the floor up
EPS = 1e-12


def default_sources(cfg: list) -> list[int]:
    """The sources a view uses until the reader chooses: all but those the site file marks `default: false`."""
    return [i for i, s in enumerate(cfg) if not s.get('off')]


def base(acc: str) -> str:
    return str(acc).split('-')[0].upper()


# ---- clustering: Louvain (Blondel et al. 2008), deterministic -----------------------------------------------------------
def louvain(n: int, edges: list, resolution: float = 1.0) -> list[int]:
    """Community of each of n nodes for weighted undirected edges [(i, j, w)] (integer weights). Nodes are visited in index
    order; a node moves to the neighbouring community of the largest modularity gain, ties to the lower community number,
    and stays unless a move gains more than EPS. Communities are numbered by size, then by their lowest node index."""
    adj = [dict() for _ in range(n)]
    for i, j, w in edges:
        if i == j:
            continue
        adj[i][j] = adj[i].get(j, 0) + w
        adj[j][i] = adj[j].get(i, 0) + w
    nbrs = [sorted(a.items()) for a in adj]
    loop = [0] * n
    node_comm = list(range(n))
    for _level in range(100):
        size = len(nbrs)
        deg = [sum(w for _, w in nbrs[i]) + loop[i] for i in range(size)]
        m2 = sum(deg)
        if m2 == 0:
            break
        comm = list(range(size))
        tot = deg[:]
        moved_any = False
        for _sweep in range(100):
            moved = False
            for i in range(size):
                ci = comm[i]
                wc: dict[int, int] = {}
                for j, w in nbrs[i]:
                    wc[comm[j]] = wc.get(comm[j], 0) + w
                tot[ci] -= deg[i]
                best = ci
                best_gain = wc.get(ci, 0) - resolution * tot[ci] * deg[i] / m2
                for c in sorted(wc):
                    if c == ci:
                        continue
                    gain = wc[c] - resolution * tot[c] * deg[i] / m2
                    if gain > best_gain + EPS:
                        best, best_gain = c, gain
                tot[best] += deg[i]
                comm[i] = best
                if best != ci:
                    moved = moved_any = True
            if not moved:
                break
        if not moved_any:
            break
        first: dict[int, int] = {}
        for i in range(size):
            first.setdefault(comm[i], i)
        order = sorted(first, key=lambda c: first[c])
        renum = {c: k for k, c in enumerate(order)}
        nxt = [dict() for _ in order]
        nloop = [0] * len(order)
        for i in range(size):
            ci = renum[comm[i]]
            nloop[ci] += loop[i]
            for j, w in nbrs[i]:
                cj = renum[comm[j]]
                if ci == cj:
                    nloop[ci] += w
                else:
                    nxt[ci][cj] = nxt[ci].get(cj, 0) + w
        node_comm = [renum[comm[c]] for c in node_comm]
        nbrs = [sorted(a.items()) for a in nxt]
        loop = nloop
    sizes = Counter(node_comm)
    low: dict[int, int] = {}
    for i, c in enumerate(node_comm):
        low.setdefault(c, i)
    rank = {c: k for k, c in enumerate(sorted(sizes, key=lambda c: (-sizes[c], low[c])))}
    return [rank[c] for c in node_comm]


# ---- a chosen number of clusters: the resolution that gets closest ---------------------------------------------------------
def resolutions() -> list[float]:
    """The resolutions tried for a chosen number of clusters: 0.25 and then 24 steps of 15% (to about 5.6), made by repeated
    multiplication so that the browser's twin has the same numbers."""
    out, r = [], 0.25
    for _ in range(24):
        out.append(r)
        r = r * 1.15
    return out


def communities(n: int, edges: list, opt: dict) -> list[int]:
    """The clusters of a graph: Louvain at the options' resolution, or, when `opt['clusters']` names a number, the
    partition among those of the resolutions of `resolutions()` that has the number of clusters (communities of
    `min_cluster` or more proteins) closest to it; of equal distance the resolution nearest the default one (in ratio),
    then the lower. A graph that cannot reach it gives the nearest it can."""
    target = opt.get('clusters')
    if not target:
        return louvain(n, edges, opt['resolution'])
    best = None
    for res in resolutions():
        comm = louvain(n, edges, res)
        size = Counter(comm)
        count = sum(1 for v in size.values() if v >= opt['min_cluster'])
        key = (abs(count - int(target)), abs(math.log(res / opt['resolution'])))
        if best is None or key < best[0]:
            best = (key, comm)
    return best[1]


# ---- labels: the most enriched term of each cluster ---------------------------------------------------------------------
def label_clusters(comm: list[int], ann: list[list[int]], terms: list, opt: dict, bg: dict | None = None) -> list[dict]:
    """For each cluster (a community number, in order), the term of the smallest one-sided hypergeometric p among the
    terms the cluster has `min_overlap` or more proteins in, that annotate `min_term` or more of the network's N proteins
    and no more than `max_fraction` of them (broad terms are left out), against all the network's proteins. q is
    Benjamini-Hochberg over the terms tested in that cluster. The label is the term of the smallest q (equal to 1e-9
    relative), a tie going to the deeper term, then the smaller p, then the term with fewer proteins, then the name. A
    cluster whose best q is above `max_q` has no label. A term must also hold for `min_coverage` or more of the
    cluster's proteins (the best term that does is taken, the next best when the first would be too thin). When no term
    does, `thin_term: best` (default) takes the significant term of the smallest q (a tie going to the larger share of the
    cluster) and the label carries its share; `thin_term: genes` leaves the cluster to its busiest proteins. No term
    names two clusters (larger clusters choose first; two terms with one short name count as one). A cluster still without a
    name takes, when `weak_p` is above 0, the term of the smallest p (p <= weak_p, coverage as above) although its q is above
    `max_q`; the row carries `weak: True` and the label its q. With `opt['label']` set,
    only the terms of that source (the second number of a term) are used. `bg` ({'N': [proteins of each source's
    background], 'M': [proteins of the background each term annotates]}, see `background`) replaces the cluster's own
    network as the background of the test and of the `min_term` and `max_fraction` rules; without it the network drawn is."""
    N = len(comm)
    members = defaultdict(list)
    for i, c in enumerate(comm):
        members[c].append(i)
    count: dict[int, int] = Counter(t for a in ann for t in a)
    if bg:
        count = {t: bg['M'][t] for t in count}
    Nt = (lambda t: bg['N'][terms[t][1]]) if bg else (lambda t: N)  # noqa: E731
    ok = {
        t
        for t, m in count.items()
        if m >= opt['min_term']
        and m / Nt(t) <= opt['max_fraction']
        and (opt.get('label') is None or terms[t][1] == opt['label'])
        and not (terms[t][2] in opt.get('exclude', ()) or terms[t][0] in opt.get('exclude', ()))
    }
    out = []
    used_ids: set = set()
    used_names: set = set()
    for c in range(len(members)):
        mem = members[c]
        n = len(mem)
        k_of = Counter(t for i in mem for t in ann[i] if t in ok)
        tested = sorted(t for t, k in k_of.items() if k >= opt['min_overlap'])
        row = {'n': n, 'term': None}
        if tested:
            ps = [hypergeom_sf(k_of[t], Nt(t), count[t], n) for t in tested]
            qs = [float(x) for x in benjamini_hochberg(ps)]

            def key(j):
                return (
                    -(terms[tested[j]][3] if len(terms[tested[j]]) > 3 else 0),
                    ps[j],
                    count[tested[j]],
                    terms[tested[j]][0],
                )

            remaining = list(range(len(tested)))
            while remaining:
                best = remaining[0]
                for j in remaining[1:]:
                    a, b = qs[j], qs[best]
                    same = abs(a - b) <= 1e-9 * max(a, b)
                    if (same and key(j) < key(best)) or (not same and a < b):
                        best = j
                if qs[best] > opt['max_q']:
                    break
                t = tested[best]
                name = short_name(terms[t][0])
                # the term must hold for a fair share of the cluster, and no term names two clusters
                if k_of[t] / n >= opt['min_coverage'] and terms[t][2] not in used_ids and name not in used_names:
                    used_ids.add(terms[t][2])
                    used_names.add(name)
                    row = {
                        'n': n,
                        'term': terms[t][0],
                        'id': terms[t][2],
                        'source': terms[t][1],
                        'p': ps[best],
                        'q': qs[best],
                        'k': k_of[t],
                        'M': count[t],
                        'N': Nt(t),
                    }
                    break
                remaining.remove(best)
            if row['term'] is None and opt.get('thin_term', 'best') == 'best':
                # no term holds for a fair share: the significant term of the smallest q (tie: larger share), shown with its share
                cand = [
                    j
                    for j in range(len(tested))
                    if qs[j] <= opt['max_q']
                    and terms[tested[j]][2] not in used_ids
                    and short_name(terms[tested[j]][0]) not in used_names
                ]
                if cand:
                    j = cand[0]
                    for x in cand[1:]:
                        same = abs(qs[x] - qs[j]) <= 1e-9 * max(qs[x], qs[j])
                        kx, kj = k_of[tested[x]], k_of[tested[j]]
                        if (same and (kx > kj or (kx == kj and key(x) < key(j)))) or (not same and qs[x] < qs[j]):
                            j = x
                    t = tested[j]
                    used_ids.add(terms[t][2])
                    used_names.add(short_name(terms[t][0]))
                    row = {
                        'n': n,
                        'term': terms[t][0],
                        'id': terms[t][2],
                        'source': terms[t][1],
                        'p': ps[j],
                        'q': qs[j],
                        'k': k_of[t],
                        'M': count[t],
                        'N': Nt(t),
                        'thin': True,
                    }
            if row['term'] is None and opt.get('weak_p', 0) > 0:
                # nothing is significant after correction (a selection's own background is rich in what it is about): the term of
                # the smallest p that holds for a fair share and has p <= weak_p, written with its q
                cand = [
                    j
                    for j in range(len(tested))
                    if ps[j] <= opt['weak_p']
                    and k_of[tested[j]] / n >= opt['min_coverage']
                    and terms[tested[j]][2] not in used_ids
                    and short_name(terms[tested[j]][0]) not in used_names
                ]
                if cand:
                    j = min(
                        cand,
                        key=lambda j: (
                            ps[j],
                            -(terms[tested[j]][3] if len(terms[tested[j]]) > 3 else 0),
                            count[tested[j]],
                            terms[tested[j]][0],
                        ),
                    )
                    t = tested[j]
                    used_ids.add(terms[t][2])
                    used_names.add(short_name(terms[t][0]))
                    row = {
                        'n': n,
                        'term': terms[t][0],
                        'id': terms[t][2],
                        'source': terms[t][1],
                        'p': ps[j],
                        'q': qs[j],
                        'k': k_of[t],
                        'M': count[t],
                        'N': Nt(t),
                        'weak': True,
                    }
        if tested:  # the three terms of the smallest q the cluster was tested on, for its tooltip
            near = sorted(range(len(tested)), key=lambda j: (qs[j], ps[j], terms[tested[j]][0]))[:3]
            row['top'] = [[terms[tested[j]][0], k_of[tested[j]], count[tested[j]], qs[j]] for j in near]
        out.append(row)
    return out


def background(full: dict, opt: dict) -> dict | None:
    """The background the clusters' terms are tested against (`opt['background']`): `drawn` (None: the proteins of the view),
    `site` (every protein the site's network can draw) or `proteome` (every annotated reviewed protein, counted when the
    network was made: full['bg']; the site's own when a source has no proteome table). {'N': per source, 'M': per term}."""
    mode = opt.get('background', 'proteome')
    if mode == 'drawn':
        return None
    if mode == 'proteome' and full.get('bg'):
        return full['bg']
    n_src = max([t[1] for t in full['terms']], default=-1) + 1
    count = Counter(t for a in full['ann'] for t in a)
    return {'N': [len(full['nodes'])] * n_src, 'M': [count.get(t, 0) for t in range(len(full['terms']))]}


# ---- the graph a view draws -----------------------------------------------------------------------------------------------
def make_view(full: dict, opt: dict, select: set | None = None, sources: list | None = None) -> dict:
    """The network of `full` (nodes, edges, terms) for the options: candidates (the selection, when given) cut to the top
    `top` by site count, the edges among them that the enabled sources and the score threshold keep, isolated nodes dropped,
    Louvain on the rest, a label for each cluster. Nodes keep the order of `full` (by accession)."""
    cfg = full['sources']
    en = default_sources(cfg) if sources is None else sources
    bit = {i: 1 << i for i in range(len(cfg))}
    mask = sum(bit[i] for i in en)
    pairs_bit = sum(1 << i for i, s in enumerate(cfg) if s['kind'] == 'pairs')
    nodes = full['nodes']
    cand = [i for i in range(len(nodes)) if select is None or i in select]
    cand.sort(key=lambda i: (-nodes[i][2], nodes[i][1], nodes[i][0]))
    keep = set(cand[: opt['top']])
    edges = []
    for a, b, fl, score in full['edges']:
        if a not in keep or b not in keep:
            continue
        fl &= mask
        w = 0
        if fl & pairs_bit and score >= opt['min_score']:
            w = score
        else:
            fl &= ~pairs_bit
        for i, s in enumerate(cfg):
            if s['kind'] in GROUPISH and fl & bit[i]:
                w = max(w, s['weight'])
        if w:
            edges.append((a, b, fl, score, w))
    live = sorted({x for e in edges for x in e[:2]})
    pos = {g: k for k, g in enumerate(live)}
    comm = communities(len(live), [(pos[a], pos[b], w) for a, b, _, _, w in edges], opt)
    ann = [full['ann'][g] for g in live]
    labels = label_clusters(comm, ann, full['terms'], opt, background(full, opt))
    # the three proteins with most sites of each cluster: its name when no term names it
    by_c: dict = defaultdict(list)
    for i, g in enumerate(live):
        by_c[comm[i]].append(g)
    for c, row in enumerate(labels):
        top = sorted(by_c[c], key=lambda g: (-full['nodes'][g][2], full['nodes'][g][1], full['nodes'][g][0]))[:3]
        row['genes'] = [full['nodes'][g][1] for g in top]
    return {
        'nodes': live,
        'edges': [[pos[a], pos[b], fl, score] for a, b, fl, score, _ in edges],
        'comm': comm,
        'labels': labels,
    }


# ---- reading the site's tables ----------------------------------------------------------------------------------------------
def _path(site: dict, run: dict, ref: str, log) -> Path | None:
    name = (site.get('inputs') or {}).get(ref)
    if not isinstance(name, str):
        log(f'  network view: {ref} is not a role of one file; left out')
        return None
    rec = (run.get('inputs') or {}).get(name)
    f = Path(rec['file']) if rec else None
    if f is None or not f.exists() or md5_file(f) != rec.get('md5'):
        log(f'  network view: {ref} ({name}) is missing or changed since the run; left out')
        return None
    return f


def _table(path: Path, sep: str = '\t') -> pd.DataFrame:
    return pd.read_csv(path, sep=sep, dtype=str, keep_default_na=False, low_memory=False)


def _where(df: pd.DataFrame, where: dict | None) -> pd.DataFrame:
    for col, val in (where or {}).items():
        df = df[df[col] == str(val)]
    return df


def settings(cfg: dict) -> dict:
    """The block's options with the defaults filled in."""
    opt = {
        k: cfg.get(k, v) for k, v in DEFAULTS.items() if k not in ('min_score', 'complex_weight', 'complex_max_size')
    }
    pairs = next((e for e in cfg['edges'] if e.get('kind') == 'pairs'), None)
    opt['min_score'] = int(cfg.get('min_score', (pairs or {}).get('min_score', DEFAULTS['min_score'])))
    opt['floor'] = int(cfg.get('floor', opt['min_score']))
    opt['steps'] = sorted({opt['min_score']} | {s for s in STEPS if s >= opt['floor']})
    opt['exclude'] = list(cfg.get('exclude_terms') or [])
    cl = cfg.get('clusters') or {}
    opt['clusters'] = int(cl['default']) if isinstance(cl.get('default'), int) else None
    opt['cluster_range'] = [int(cl.get('min', 4)), int(cl.get('max', 16)), int(cl.get('step', 1))]
    opt['max_shown'] = max(int(cfg.get('max_clusters', DEFAULTS['max_clusters'])), opt['clusters'] or 0)
    return opt


def color_values(marks: pd.DataFrame, spec: dict, nodes: list) -> dict:
    """One colour-by entry for the nodes (base accessions): a sequential one is the share of the protein's sites whose
    column holds one of `values` (None where the protein has no site with a value); a categorical one is the value most of
    the protein's sites hold (ties to the first in alphabetical order), the commonest `max_values` values (default 8)
    named and the rest 'Other'. The column may hold several values joined by `separator` (default ';')."""
    col, sep = spec['column'], spec.get('separator', ';')
    df = marks[['base', col]]
    out = {k: spec[k] for k in ('id', 'name', 'kind') if k in spec}
    if spec['kind'] == 'sequential':
        want = {str(v) for v in spec.get('values', [])} or None
        got: dict[str, list] = defaultdict(lambda: [0, 0])
        for b, v in zip(df['base'], df[col]):
            if v == '':
                continue
            parts = [p.strip() for p in str(v).split(sep)]
            g = got[b]
            g[1] += 1
            g[0] += 1 if (want is None or any(p in want for p in parts)) else 0
        out['v'] = [round(got[a][0] / got[a][1], 3) if a in got and got[a][1] else None for a in nodes]
        return out
    per: dict[str, Counter] = defaultdict(Counter)
    for b, v in zip(df['base'], df[col]):
        for p in {x.strip() for x in str(v).split(sep)} - {''}:
            per[b][p] += 1
    top: dict[str, str] = {a: sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] for a, c in per.items()}
    freq = Counter(top.get(a) for a in nodes if a in top)
    names = [k for k, _ in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))][: int(spec.get('max_values', 8))]
    ix = {k: i for i, k in enumerate(names)}
    out['cats'] = names + (['Other'] if len(freq) > len(names) else [])
    out['v'] = [ix.get(top[a], len(names)) if a in top else -1 for a in nodes]
    return out


def role_values(site: dict, run: dict, spec: dict, nodes: list, genes: dict) -> dict:
    """The colour-by entry of a `role` spec: what each node protein is to the site's mark, from the site's own enzyme and
    reader classes (website.search.partners.classes, each with a `role`): writer, eraser, reader. A protein in classes of
    several roles is `several`; one in none has the value -1 (no role). `roles` (default writer, eraser, reader) are the
    categories, in that order, `labels` their names."""
    from .search import _members, _paths, members_file

    pt = ((site.get('website') or {}).get('search') or {}).get('partners') or {}
    classes = {k: c for k, c in (pt.get('classes') or {}).items() if isinstance(c, dict) and c.get('role')}
    roles = list(spec.get('roles') or ['writer', 'eraser', 'reader'])
    labels = {**{r: r.capitalize() for r in roles}, **(spec.get('labels') or {})}
    root = Path(site.get('__root__', '.'))
    by_ipr = _members(pt, run or {}, _paths(run or {}), set(nodes)) if pt else {}
    by_gene: dict[str, set] = defaultdict(set)
    for a in nodes:
        if genes.get(a):
            by_gene[str(genes[a]).upper()].add(a)
    held: dict[str, set] = defaultdict(set)
    for code, c in classes.items():
        if c['role'] not in roles:
            continue
        names = {str(g).upper() for g in c.get('genes') or []} | members_file(root, c)
        acc = {base(a) for a in by_ipr.get(code, ())} | {a for n in names for a in by_gene.get(n, ())}
        acc |= {a for a in nodes if a.upper() in names}
        for a in acc:
            held[a].add(c['role'])
    cats = [labels[r] for r in roles]
    several = any(len(v) > 1 for v in held.values())
    if several:
        cats.append(spec.get('several', 'More than one'))
    v = []
    for a in nodes:
        h = held.get(a, set())
        v.append(-1 if not h else (len(cats) - 1 if len(h) > 1 else roles.index(next(iter(h)))))
    return {
        **{k: spec[k] for k in ('id', 'name') if k in spec},
        'kind': 'categorical',
        'cats': cats,
        'none_label': spec.get('none', 'No role'),
        'v': v,
    }


def density(sites: int, candidates: int) -> float:
    """Sites per 100 of the protein's own candidate residues (the residues of the site's mark, counted in its sequence)."""
    return 100.0 * sites / max(int(candidates), int(sites), 1)


def size_units(mode: str, sites: int, candidates: int) -> float:
    """What the layout draws a node by, in its units of one site (radius = 2.2 * sqrt(units), capped): the number of
    sites, or DENSITY_UNIT times the density."""
    if mode == 'sites':
        return float(sites)
    return round(max(MIN_UNITS, DENSITY_UNIT * density(sites, candidates)), 3)


@lru_cache(maxsize=2)
def _sets_file(path: str, mtime: float) -> dict:
    return json.loads(Path(path).read_text()) or {}


def _covariate_set(folder: Path, analysis: str, log) -> dict | None:
    """One analysis of the run's protein_sets.json (its sets' marked proteins and its abundance strata)."""
    f = folder / 'protein_sets.json'
    if not f.exists():
        log(f'  network view: {f.name} is missing; the options that read it are left out')
        return None
    return _sets_file(str(f), f.stat().st_mtime).get(analysis)


def decile_values(folder: Path, spec: dict, nodes: list, log=print) -> dict | None:
    """The abundance-decile colour-by entry: each protein's decile (1 the lowest, 10 the highest; None without a value)
    among the proteins of the analysis `analysis`, as that analysis used the abundance table as its strata (the run's
    protein_sets.json), so that the figure and the statistics place a protein in the same decile."""
    a = _covariate_set(folder, spec.get('analysis', ''), log)
    cov = ((a or {}).get('covariate') or {}).get('proteins')
    if not cov:
        log(f'  network view: {spec.get("id")}: analysis {spec.get("analysis")!r} has no abundance strata; left out')
        return None
    got = {base(k): v[1] for k, v in cov.items()}
    n = int((a['covariate'] or {}).get('strata', 10))
    return {
        **{k: spec[k] for k in ('id', 'name') if k in spec},
        'kind': 'decile',
        'n': n,
        'v': [int(got[x]) if str(got.get(x, '')).isdigit() else None for x in nodes],
    }


def binding_values(folder: Path, spec: dict, nodes: list, log=print) -> dict | None:
    """The nucleic-acid binding colour-by entry: RNA, DNA, both, or neither, from the published protein sets the spec
    names (`rna` and `dna`, each a list of {analysis, set}): a protein in any set of a side binds that side."""
    held: dict[str, set] = {'rna': set(), 'dna': set()}
    found = 0
    for side in held:
        for ref in spec.get(side) or []:
            a = _covariate_set(folder, ref.get('analysis', ''), log)
            row = ((a or {}).get('sets') or {}).get(ref.get('set', ''))
            if row is None:
                log(f'  network view: {spec.get("id")}: no set {ref.get("analysis")}/{ref.get("set")}; skipped')
                continue
            found += 1
            held[side] |= {base(x) for x in row.get('marked', [])}
    if not found:
        return None
    labels = {**{'rna': 'RNA', 'dna': 'DNA', 'both': 'RNA and DNA'}, **(spec.get('labels') or {})}
    v = []
    for x in nodes:
        r, d = x in held['rna'], x in held['dna']
        v.append(2 if r and d else 0 if r else 1 if d else -1)
    return {
        **{k: spec[k] for k in ('id', 'name') if k in spec},
        'kind': 'binding',
        'cats': [labels['rna'], labels['dna'], labels['both']],
        'none_label': spec.get('none', 'Neither'),
        'v': v,
    }


def build(site: dict, run: dict, listing: list, folder: Path, out: Path, log=print) -> dict | None:
    """Write data/network.json and data/network_full.json; return what the page reads (the block's words and options, the
    files), or None when the block is absent or an input is missing."""
    cfg = ((site.get('website') or {}).get('network')) or None
    for f in ('network.json', 'network_full.json'):
        (out / 'data' / f).unlink(missing_ok=True)
    if not cfg:
        return None
    opt = settings(cfg)
    # the nodes: the site's proteins with sites, by base accession (the canonical entry's accession when the site lists it)
    prot: dict[str, list] = {}
    for r in listing:
        b = base(r[0])
        if int(r[4]) <= 0:
            continue
        p = prot.setdefault(b, [r[0], r[1] or r[0], 0, 0])
        if r[0] == b:
            p[0] = r[0]
        p[2] += int(r[4])
        p[3] += int(r[5])
    srcs, rows = [], {}
    pair_keys = {}
    extra: dict[str, dict] = defaultdict(
        dict
    )  # source id -> {(a, b): score} for the sources that have a score of their own
    members: dict[str, list] = {}  # source id -> [[name, [protein, ...]]]: the groups that give an edge, for its hover
    if sum(e.get('kind') == 'pairs' for e in cfg['edges']) > 1:
        log('  network view: more than one scored-pairs source; left out')
        return None

    def style_of(e, key):
        return {**STYLE[key], **(e.get('style') or {})}

    for e in cfg['edges']:
        kind = e['kind']
        f = _path(site, run, e['input'], log)
        if f is None:
            if e.get('optional'):
                continue
            return None
        df = _table(f, e.get('sep', '\t'))
        entry = {
            'id': e.get('id', kind),
            'label': e.get('label', e.get('id', kind)),
            'kind': kind,
            'cite': e.get('cite', ''),
            'url': e.get('url', ''),
            'style': style_of(e, kind),
        }
        if e.get('default') is False:
            entry['off'] = True
        if kind in ('pairs', 'functional'):
            col = e.get('score', 'combined_score')
            sc = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
            floor = opt['floor'] if kind == 'pairs' else int(e.get('min_score', DEFAULTS['min_score']))
            keep = sc >= floor
            a_col, b_col = e.get('a', 'protein_a'), e.get('b', 'protein_b')
            chans = list(e.get('channels') or [])
            absent = [c['column'] for c in chans if c['column'] not in df.columns]
            if absent:
                log(
                    f'  network view: {entry["label"]} has no {", ".join(absent)} column; its links are not split by channel'
                )
                chans = []
            if kind == 'pairs':
                entry['min_score'] = opt['min_score']
            else:
                entry['weight'] = int(e.get('weight', 400))
            if chans:
                subs = []
                for k, ch in enumerate(chans):
                    sub = {
                        **entry,
                        'id': f'{entry["id"]}_{ch["id"]}',
                        'label': f'{entry["label"]}, {ch["label"]}',
                        'family': entry['label'],
                        'channel_min': int(ch.get('min', 1)),
                        'style': {
                            **STYLE['pairs' if k == 0 else 'channel'],
                            **(ch.get('style') or e.get('style') or {}),
                        },
                    }
                    subs.append(
                        (
                            len(srcs),
                            sub,
                            pd.to_numeric(df[ch['column']][keep], errors='coerce').fillna(0).astype(int).tolist(),
                        )
                    )
                    srcs.append(sub)
            else:
                subs = [(len(srcs), entry, None)]
                srcs.append(entry)
            for r, (a, b, s) in enumerate(zip(df[a_col][keep], df[b_col][keep], sc[keep])):
                a, b = base(a), base(b)
                if not (a in prot and b in prot and a != b):
                    continue
                key = (a, b) if a < b else (b, a)
                if kind == 'pairs':
                    pair_keys[key] = max(pair_keys.get(key, 0), int(s))
                else:
                    extra[entry['id']][key] = max(extra[entry['id']].get(key, 0), int(s))
                row = rows.setdefault(key, [0, 0])
                for si, sub, series in subs:
                    if series is None:
                        row[0] |= 1 << si
                    else:
                        v = series[r]
                        if v >= sub['channel_min']:
                            row[0] |= 1 << si
                            extra[sub['id']][key] = v
            continue
        si = len(srcs)
        entry['weight'] = int(e.get('weight', DEFAULTS['complex_weight']))
        entry['max_size'] = int(e.get('max_size', DEFAULTS['complex_max_size']))
        df = _where(df, e.get('where'))
        mem: dict[str, set] = defaultdict(set)
        title: dict[str, str] = {}
        gcol, pcol, ncol = e.get('group', 'complex_id'), e.get('protein', 'uniprot_accession'), e.get('name')
        for k, (g, p) in enumerate(zip(df[gcol], df[pcol])):
            mem[g].add(base(p))
            if ncol and ncol in df.columns and g not in title:
                title[g] = str(df[ncol].iloc[k])
        used = 0
        listed = []
        for g, ps in mem.items():
            if len(ps) > entry['max_size']:
                continue
            inn = sorted(p for p in ps if p in prot)
            used += 1
            for a, b in combinations(inn, 2):
                rows.setdefault((a, b), [0, 0])[0] |= 1 << si
            if len(inn) >= 2:
                listed.append([title.get(g, g), inn])
        entry['groups_used'] = used
        members[entry['id']] = listed
        srcs.append(entry)
    nodes = sorted({x for k in rows for x in k})
    ix = {a: i for i, a in enumerate(nodes)}
    order = sorted([ix[a], ix[b], v[0], pair_keys.get((a, b), 0), (a, b)] for (a, b), v in rows.items())
    edges = [x[:4] for x in order]
    extra_out = {sid: [d.get(x[4], 0) for x in order] for sid, d in extra.items() if d}
    groups_out = {sid: [[n, [ix[p] for p in ps if p in ix]] for n, ps in lst] for sid, lst in members.items() if lst}
    # which of the site's proteins have a link at the default score (a bit each, in the order of the protein list): the page
    # shows no "See in network" button for a protein with none
    pbit = sum(1 << i for i, s in enumerate(srcs) if s['kind'] == 'pairs')
    on = sum(1 << i for i in default_sources(srcs))
    linked = set()
    for a, b, fl, sc in edges:
        if (fl & pbit & on and sc >= opt['min_score']) or fl & ~pbit & on:
            linked.add(nodes[a])
            linked.add(nodes[b])
    bits = bytearray((len(listing) + 7) // 8)
    for k, r in enumerate(listing):
        if base(r[0]) in linked:
            bits[k >> 3] |= 1 << (k & 7)
    # the terms of the labels: sets annotating at least min_term of the nodes
    terms, ann = [], [[] for _ in nodes]
    labels = []
    bg_n: list[int] = []
    bg_m: list[int] = []
    for lab in cfg.get('label_from') or []:
        li = len(labels)  # the source's number among those read
        mf = _path(site, run, lab['input'], log)
        nf = _path(site, run, lab['names']['input'], log) if lab.get('names') else None
        if mf is None:
            continue
        mt = _table(mf)
        has_iea = 'non_iea' in mt.columns
        if lab.get('non_iea', True) and has_iea:
            mt = mt[mt['non_iea'] == 'true']
        every = mt[lab['protein']].map(base)  # the whole annotated proteome of this source: the labels' background
        bg_n.append(int(every.nunique()))
        whole_count = mt.assign(_p=every).groupby(lab['set'])['_p'].nunique().to_dict()
        mt = mt[every.isin(ix)]
        names, depth, whole = {}, {}, {}
        if nf is not None:
            nt = _table(nf)
            nt = _where(nt, {c['column']: c['equals'] for c in lab['names'].get('include', [])})
            names = dict(zip(nt[lab['names']['set']], nt[lab['names'].get('name', lab['names']['set'])]))
            if lab['names'].get('size'):
                whole = {
                    s: int(d) for s, d in zip(nt[lab['names']['set']], nt[lab['names']['size']]) if d.strip().isdigit()
                }
            if lab['names'].get('depth'):
                depth = {
                    s: int(d) for s, d in zip(nt[lab['names']['set']], nt[lab['names']['depth']]) if d.strip().isdigit()
                }
        lowest = int(lab.get('min_depth', 0))
        cap = int(lab.get('max_size', 0))
        by_set: dict[str, set] = defaultdict(set)
        for s, p in zip(mt[lab['set']], mt[lab['protein']].map(base)):
            by_set[s].add(p)
        lo = int(lab.get('min_term', opt['min_term']))
        for s in sorted(by_set):
            if len(by_set[s]) < lo or len(by_set[s]) / max(1, len(nodes)) > 0.5:
                continue
            if lowest and depth.get(s, 0) < lowest:
                continue
            if cap and whole.get(s, 0) > cap:  # too common in the whole proteome to say what a cluster is about
                continue
            t = len(terms)
            terms.append([names.get(s, s), li, s, depth.get(s, 0)])
            bg_m.append(int(whole_count.get(s, len(by_set[s]))))
            for p in by_set[s]:
                ann[ix[p]].append(t)
        labels.append(
            {k: lab.get(k, '') for k in ('label', 'cite', 'url')}
            | {
                'id': lab.get('id', f'label{li}'),
                'min_depth': lowest,
                'max_size': cap,
                'non_iea': bool(lab.get('non_iea', True) and has_iea),
            }
        )
    wants_cols = any('column' in c for c in cfg.get('color_by') or [])
    cols = _table(folder / 'marks.tsv') if wants_cols else None
    if cols is not None:
        cols['base'] = cols['accession'].map(base)
    color = []
    for c in cfg.get('color_by') or []:
        if c.get('kind') == 'decile':
            got = decile_values(folder, c, nodes, log)
        elif c.get('kind') == 'binding':
            got = binding_values(folder, c, nodes, log)
        elif 'column' in c and cols is not None and c['column'] in cols.columns:
            got = color_values(cols, c, nodes)
        else:
            got = None
        if got:
            color.append(got)
    outline = None
    if (cfg.get('outline') or {}).get('kind') == 'role':
        outline = role_values(site, run, cfg['outline'], nodes, {a: prot[a][1] for a in nodes})
        if all(x < 0 for x in outline['v']):
            outline = None
    size_mode = (cfg.get('size') or {}).get('default', 'density')
    full = {
        'sources': srcs,
        'nodes': [prot[a] for a in nodes],
        'edges': edges,
        'terms': terms,
        'ann': ann,
        **({'bg': {'N': bg_n, 'M': bg_m}} if len(bg_n) == len(labels) and terms else {}),
    }
    view = make_view(full, opt)
    default = {
        'nodes': [full['nodes'][g][0] for g in view['nodes']],
        'gene': [full['nodes'][g][1] for g in view['nodes']],
        'sites': [full['nodes'][g][2] for g in view['nodes']],
        'cand': [full['nodes'][g][3] for g in view['nodes']],
        'size': [size_units(size_mode, full['nodes'][g][2], full['nodes'][g][3]) for g in view['nodes']],
        'edges': view['edges'],
        'comm': view['comm'],
        'labels': view['labels'],
    }
    # what a node shows besides its size, for the default view's cards: the abundance decile, the binding class, the enzyme role
    for key, kind in (('dec', 'decile'), ('bind', 'binding')):
        spec = next((c for c in color if c['kind'] == kind), None)
        if spec:
            default[key] = [spec['v'][g] for g in view['nodes']]
    if outline:
        default['role'] = [outline['v'][g] for g in view['nodes']]
    lay_in = {k: default[k] for k in ('gene', 'comm', 'edges', 'labels')} | {'sites': default['size']}
    default['layout'] = {v: layout(lay_in, v, opt['min_cluster'], opt['max_shown']) for v in ('desktop', 'phone')}
    (out / 'data').mkdir(parents=True, exist_ok=True)

    def dump(name, value):
        text = json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
        (out / 'data' / name).write_text(text)
        return len(text)

    n1 = dump('network.json', default)
    n2 = dump(
        'network_full.json',
        {
            'sources': srcs,
            'acc': [p[0] for p in full['nodes']],
            'gene': [p[1] for p in full['nodes']],
            'sites': [p[2] for p in full['nodes']],
            'cand': [p[3] for p in full['nodes']],
            'edges': [x for e in edges for x in e],
            'terms': terms,
            'ann': ann,
            **({'bg': full['bg']} if 'bg' in full else {}),
            'color': color,
            **({'outline': outline} if outline else {}),
            **({'extra': extra_out} if extra_out else {}),
            **({'groups': groups_out} if groups_out else {}),
        },
    )
    log(
        f'  network view: {len(default["nodes"])} nodes, {len(default["edges"])} edges and '
        f'{len(set(default["comm"]))} clusters by default ({n1 / 1e3:.0f} KB); {len(nodes):,} proteins and '
        f'{len(edges):,} edges in all ({n2 / 1e6:.1f} MB)'
    )
    shown = [x for x in view['labels'] if x['n'] >= opt['min_cluster']][: opt['max_clusters']]
    keys = ('title', 'about', 'lead', 'controls', 'tile', 'claim')
    return {
        **{k: cfg[k] for k in keys if cfg.get(k)},
        'files': {'view': 'data/network.json', 'full': 'data/network_full.json'},
        'protein_link': bool(cfg.get('protein_link', True)),
        'linked': base64.b64encode(bytes(bits)).decode(),
        'protein_preview': bool(cfg.get('protein_preview', True)),
        'options': {k: opt[k] for k in DEFAULTS if k in opt}
        | {
            'steps': opt['steps'],
            'floor': opt['floor'],
            'exclude': opt['exclude'],
            'cluster_range': opt['cluster_range'],
            'max_shown': opt['max_shown'],
        },
        'sources': srcs,
        'labels': labels,
        'default': {
            'nodes': len(default['nodes']),
            'edges': len(default['edges']),
            'clusters': len(shown),
            'top_labels': [x['term'] for x in shown if x.get('term')][:3],
        },
        'color_by': [{k: c[k] for k in ('id', 'name', 'kind', 'cats', 'none_label') if k in c} for c in color],
        **(
            {'outline': {k: outline[k] for k in ('id', 'name', 'cats', 'none_label') if k in outline}}
            if outline
            else {}
        ),
        'size': {'default': size_mode if size_mode in SIZES else 'density', 'unit': DENSITY_UNIT},
    }
