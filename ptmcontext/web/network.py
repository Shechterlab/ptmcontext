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

import json
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

import pandas as pd
from ptmstats import benjamini_hochberg, hypergeom_sf

from ..snapshot import md5_file

DEFAULTS = {
    'top': 300,
    'min_cluster': 5,
    'max_clusters': 8,
    'resolution': 1.0,
    'max_q': 0.05,
    'min_overlap': 3,
    'min_term': 5,
    'max_fraction': 0.2,
    'label': 0,
    'min_score': 700,
    'complex_weight': 700,
    'complex_max_size': 40,
}
STEPS = (400, 700, 900)  # the STRING thresholds the page offers, from the floor up
EPS = 1e-12


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


# ---- labels: the most enriched term of each cluster ---------------------------------------------------------------------
def label_clusters(comm: list[int], ann: list[list[int]], terms: list, opt: dict) -> list[dict]:
    """For each cluster (a community number, in order), the term of the smallest one-sided hypergeometric p among the
    terms the cluster has `min_overlap` or more proteins in, that annotate `min_term` or more of the network's N proteins
    and no more than `max_fraction` of them (broad terms are left out), against all the network's proteins. q is
    Benjamini-Hochberg over the terms tested in that cluster. The label is the term of the smallest q (equal to 1e-9
    relative), a tie going to the deeper term, then the smaller p, then the term with fewer proteins, then the name. A
    cluster whose best q is above `max_q` has no label. With `opt['label']` set, only the terms of that source (the
    second number of a term) are used."""
    N = len(comm)
    members = defaultdict(list)
    for i, c in enumerate(comm):
        members[c].append(i)
    count: dict[int, int] = Counter(t for a in ann for t in a)
    ok = {
        t
        for t, m in count.items()
        if m >= opt['min_term']
        and m / N <= opt['max_fraction']
        and (opt.get('label') is None or terms[t][1] == opt['label'])
        and not (terms[t][2] in opt.get('exclude', ()) or terms[t][0] in opt.get('exclude', ()))
    }
    out = []
    for c in range(len(members)):
        mem = members[c]
        n = len(mem)
        k_of = Counter(t for i in mem for t in ann[i] if t in ok)
        tested = sorted(t for t, k in k_of.items() if k >= opt['min_overlap'])
        row = {'n': n, 'term': None}
        if tested:
            ps = [hypergeom_sf(k_of[t], N, count[t], n) for t in tested]
            qs = [float(x) for x in benjamini_hochberg(ps)]

            def key(j):
                return (
                    -(terms[tested[j]][3] if len(terms[tested[j]]) > 3 else 0),
                    ps[j],
                    count[tested[j]],
                    terms[tested[j]][0],
                )

            best = 0
            for j in range(1, len(tested)):
                a, b = qs[j], qs[best]
                same = abs(a - b) <= 1e-9 * max(a, b)
                if (same and key(j) < key(best)) or (not same and a < b):
                    best = j
            if qs[best] <= opt['max_q']:
                t = tested[best]
                row = {
                    'n': n,
                    'term': terms[t][0],
                    'id': terms[t][2],
                    'source': terms[t][1],
                    'p': ps[best],
                    'q': qs[best],
                    'k': k_of[t],
                    'M': count[t],
                    'N': N,
                }
        out.append(row)
    return out


# ---- the graph a view draws -----------------------------------------------------------------------------------------------
def make_view(full: dict, opt: dict, select: set | None = None, sources: list | None = None) -> dict:
    """The network of `full` (nodes, edges, terms) for the options: candidates (the selection, when given) cut to the top
    `top` by site count, the edges among them that the enabled sources and the score threshold keep, isolated nodes dropped,
    Louvain on the rest, a label for each cluster. Nodes keep the order of `full` (by accession)."""
    cfg = full['sources']
    en = list(range(len(cfg))) if sources is None else sources
    bit = {i: 1 << i for i in range(len(cfg))}
    mask = sum(bit[i] for i in en)
    pairs_bit = next((1 << i for i, s in enumerate(cfg) if s['kind'] == 'pairs'), 0)
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
            if s['kind'] == 'groups' and fl & bit[i]:
                w = max(w, s['weight'])
        if w:
            edges.append((a, b, fl, score, w))
    live = sorted({x for e in edges for x in e[:2]})
    pos = {g: k for k, g in enumerate(live)}
    comm = louvain(len(live), [(pos[a], pos[b], w) for a, b, _, _, w in edges], opt['resolution'])
    ann = [full['ann'][g] for g in live]
    labels = label_clusters(comm, ann, full['terms'], opt)
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
        p = prot.setdefault(b, [r[0], r[1] or r[0], 0])
        if r[0] == b:
            p[0] = r[0]
        p[2] += int(r[4])
    srcs, rows = [], {}
    pair_keys = {}
    for si, e in enumerate(cfg['edges']):
        f = _path(site, run, e['input'], log)
        if f is None:
            return None
        df = _table(f, e.get('sep', '\t'))
        entry = {
            'id': e.get('id', e['kind']),
            'label': e.get('label', e.get('id', e['kind'])),
            'kind': e['kind'],
            'cite': e.get('cite', ''),
            'url': e.get('url', ''),
        }
        if e['kind'] == 'pairs':
            entry['min_score'] = opt['min_score']
            sc = pd.to_numeric(df[e.get('score', 'combined_score')], errors='coerce').fillna(0).astype(int)
            keep = sc >= opt['floor']
            for a, b, s in zip(df[e.get('a', 'protein_a')][keep], df[e.get('b', 'protein_b')][keep], sc[keep]):
                a, b = base(a), base(b)
                if a in prot and b in prot and a != b:
                    key = (a, b) if a < b else (b, a)
                    pair_keys[key] = max(pair_keys.get(key, 0), int(s))
                    rows.setdefault(key, [0, 0])[0] |= 1 << si
        else:
            entry['weight'] = int(e.get('weight', DEFAULTS['complex_weight']))
            entry['max_size'] = int(e.get('max_size', DEFAULTS['complex_max_size']))
            df = _where(df, e.get('where'))
            mem: dict[str, set] = defaultdict(set)
            for g, p in zip(df[e.get('group', 'complex_id')], df[e.get('protein', 'uniprot_accession')]):
                mem[g].add(base(p))
            used = 0
            for g, ps in mem.items():
                if len(ps) > entry['max_size']:
                    continue
                inn = sorted(p for p in ps if p in prot)
                used += 1
                for a, b in combinations(inn, 2):
                    rows.setdefault((a, b), [0, 0])[0] |= 1 << si
            entry['groups_used'] = used
        srcs.append(entry)
    if sum(s['kind'] == 'pairs' for s in srcs) > 1:
        log('  network view: more than one scored-pairs source; left out')
        return None
    nodes = sorted({x for k in rows for x in k})
    ix = {a: i for i, a in enumerate(nodes)}
    edges = sorted([ix[a], ix[b], v[0], pair_keys.get((a, b), 0)] for (a, b), v in rows.items())
    # the terms of the labels: sets annotating at least min_term of the nodes
    terms, ann = [], [[] for _ in nodes]
    labels = []
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
        mt = mt[mt[lab['protein']].map(base).isin(ix)]
        names, depth = {}, {}
        if nf is not None:
            nt = _table(nf)
            nt = _where(nt, {c['column']: c['equals'] for c in lab['names'].get('include', [])})
            names = dict(zip(nt[lab['names']['set']], nt[lab['names'].get('name', lab['names']['set'])]))
            if lab['names'].get('depth'):
                depth = {
                    s: int(d) for s, d in zip(nt[lab['names']['set']], nt[lab['names']['depth']]) if d.strip().isdigit()
                }
        lowest = int(lab.get('min_depth', 0))
        by_set: dict[str, set] = defaultdict(set)
        for s, p in zip(mt[lab['set']], mt[lab['protein']].map(base)):
            by_set[s].add(p)
        lo = int(lab.get('min_term', opt['min_term']))
        for s in sorted(by_set):
            if len(by_set[s]) < lo or len(by_set[s]) / max(1, len(nodes)) > 0.5:
                continue
            if lowest and depth.get(s, 0) < lowest:
                continue
            t = len(terms)
            terms.append([names.get(s, s), li, s, depth.get(s, 0)])
            for p in by_set[s]:
                ann[ix[p]].append(t)
        labels.append(
            {k: lab.get(k, '') for k in ('label', 'cite', 'url')}
            | {
                'id': lab.get('id', f'label{li}'),
                'min_depth': lowest,
                'non_iea': bool(lab.get('non_iea', True) and has_iea),
            }
        )
    cols = _table(folder / 'marks.tsv') if cfg.get('color_by') else None
    if cols is not None:
        cols['base'] = cols['accession'].map(base)
    color = [color_values(cols, c, nodes) for c in cfg.get('color_by') or [] if c['column'] in cols.columns]
    full = {
        'sources': srcs,
        'nodes': [prot[a] for a in nodes],
        'edges': edges,
        'terms': terms,
        'ann': ann,
    }
    view = make_view(full, opt)
    default = {
        'nodes': [full['nodes'][g][0] for g in view['nodes']],
        'gene': [full['nodes'][g][1] for g in view['nodes']],
        'sites': [full['nodes'][g][2] for g in view['nodes']],
        'edges': view['edges'],
        'comm': view['comm'],
        'labels': view['labels'],
    }
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
            'edges': [x for e in edges for x in e],
            'terms': terms,
            'ann': ann,
            'color': color,
        },
    )
    log(
        f'  network view: {len(default["nodes"])} nodes, {len(default["edges"])} edges and '
        f'{len(set(default["comm"]))} clusters by default ({n1 / 1e3:.0f} KB); {len(nodes):,} proteins and '
        f'{len(edges):,} edges in all ({n2 / 1e6:.1f} MB)'
    )
    shown = [x for x in view['labels'] if x['n'] >= opt['min_cluster']][: opt['max_clusters']]
    keys = ('title', 'about', 'tile')
    return {
        **{k: cfg[k] for k in keys if cfg.get(k)},
        'files': {'view': 'data/network.json', 'full': 'data/network_full.json'},
        'options': {k: opt[k] for k in DEFAULTS if k in opt}
        | {'steps': opt['steps'], 'floor': opt['floor'], 'exclude': opt['exclude']},
        'sources': srcs,
        'labels': labels,
        'default': {
            'nodes': len(default['nodes']),
            'edges': len(default['edges']),
            'clusters': len(shown),
            'top_labels': [x['term'] for x in shown if x.get('term')][:3],
        },
        'color_by': [{k: c[k] for k in ('id', 'name', 'kind', 'cats') if k in c} for c in color],
    }
