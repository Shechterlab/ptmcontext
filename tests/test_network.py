"""The network view (website.network): the clustering and the labels in Python and in the browser's twin, the data files a
site without or with the block gets, and the contract's checks (CONTRACTS.md, 'The network view')."""

from __future__ import annotations

import json
import random
import re
import shutil
import subprocess
from pathlib import Path

import pandas as pd
import pytest
import yaml
from test_set_views import MARKED, _site

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file
from ptmcontext.web import network as NW

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
STATS = Path(__file__).resolve().parents[1] / 'packages' / 'ptmstats' / 'ptmstats' / 'ptmstats.js'


def _graph():
    """Three planted communities (cliques of 8, 6 and 5 proteins, thinned) joined by single weak edges."""
    rnd = random.Random(7)
    groups = [list(range(0, 8)), list(range(8, 14)), list(range(14, 19))]
    edges = []
    for g in groups:
        for i in g:
            for j in g:
                if i < j and rnd.random() < 0.85:
                    edges.append((i, j, 900))
    edges += [(3, 9, 450), (11, 15, 450)]
    return 19, edges, groups


def test_louvain_finds_the_planted_communities_and_numbers_them_by_size():
    n, edges, groups = _graph()
    comm = NW.louvain(n, edges)
    assert [len({comm[i] for i in g}) for g in groups] == [1, 1, 1]
    assert sorted(set(comm)) == [0, 1, 2]
    assert [comm.count(c) for c in (0, 1, 2)] == [8, 6, 5]  # community 0 is the largest
    assert NW.louvain(n, edges) == comm  # the same answer every time
    assert NW.louvain(3, []) == [0, 1, 2]  # no edge, no merging
    # a heavier resolution splits at least as finely
    assert len(set(NW.louvain(n, edges, 3.0))) >= len(set(comm))


def test_a_cluster_is_named_by_its_smallest_p_and_a_broad_term_is_left_out():
    # 60 proteins: cluster 0 (10 proteins) all hold term 0 and 3 hold term 2; cluster 1 holds term 1; term 3 is everywhere
    comm = [0] * 10 + [1] * 10 + [2] * 40
    ann = [[0, 3] + ([2] if i < 3 else []) for i in range(10)]
    ann += [[1, 3] for _ in range(10)]
    ann += [[3] for _ in range(40)]
    # terms 0 and 1 annotate only their clusters; term 2 three proteins of cluster 0 (and none else)
    terms = [['pathway A', 0, 'A'], ['pathway B', 0, 'B'], ['small', 0, 'S'], ['everything', 0, 'ALL']]
    opt = {**NW.DEFAULTS, 'min_term': 3}
    lab = NW.label_clusters(comm, ann, terms, opt)
    assert [x['term'] for x in lab[:2]] == ['pathway A', 'pathway B']
    assert lab[0]['k'] == 10 and lab[0]['M'] == 10 and lab[0]['N'] == 60 and lab[0]['q'] < 1e-6
    assert lab[2]['term'] is None  # no term is enriched in the rest
    # 'everything' annotates all 60: above the broad-term limit, and never a label
    assert all(x.get('term') != 'everything' for x in lab)
    # excluding a term by id moves the label on
    out = NW.label_clusters(comm, ann, terms, {**opt, 'exclude': ['A']})
    assert out[0]['term'] != 'pathway A'


def _full(n=40, seed=3):
    rnd = random.Random(seed)
    nodes = [[f'P{i:03d}', f'G{i:03d}', rnd.randint(1, 30)] for i in range(n)]
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            same = i // 10 == j // 10
            if rnd.random() < (0.5 if same else 0.02):
                edges.append([i, j, 3 if rnd.random() < 0.2 else 1, rnd.choice([0, 0, 750, 950]) if True else 0])
    edges = [[a, b, f if s or f & 2 else 1, s or 800] for a, b, f, s in edges]
    terms = [[f'term {k}', 0, f'T{k}', k + 2] for k in range(4)]
    # a second source: a shallow and a deep term for each block of ten, so q ties and the depth decides
    terms += [[f'alt {k}{d}', 1, f'A{k}{d}', 3 + 4 * d] for k in range(4) for d in (0, 1)]
    ann = [[i // 10, 4 + 2 * (i // 10), 5 + 2 * (i // 10)] + ([] if i % 5 else [3]) for i in range(n)]
    return {
        'sources': [
            {'kind': 'pairs', 'id': 'p'},
            {'kind': 'groups', 'id': 'g', 'weight': 700},
        ],
        'nodes': nodes,
        'edges': edges,
        'terms': terms,
        'ann': ann,
    }


OPT = {**NW.DEFAULTS, 'top': 300}


def test_a_view_keeps_the_top_proteins_drops_isolated_ones_and_obeys_the_sources():
    full = _full()
    v = NW.make_view(full, {**OPT, 'top': 12})
    # the 12 proteins with the most sites (ties by gene), cut to those with an edge among them
    top = sorted(range(40), key=lambda i: (-full['nodes'][i][2], full['nodes'][i][1]))[:12]
    assert set(v['nodes']) <= set(top)
    deg = {i: 0 for i in v['nodes']}
    for a, b, *_ in v['edges']:
        deg[v['nodes'][a]] += 1
        deg[v['nodes'][b]] += 1
    assert deg and all(d > 0 for d in deg.values())  # no isolated node
    assert len(v['comm']) == len(v['nodes']) and sum(x['n'] for x in v['labels']) == len(v['nodes'])
    assert len(v['labels']) == len(set(v['comm']))
    # only the scored source: no edge carries the group bit; a threshold above every score leaves nothing
    only = NW.make_view(full, OPT, sources=[0])
    assert all(not f & 2 for _, _, f, _ in only['edges'])
    assert NW.make_view(full, {**OPT, 'min_score': 1001}, sources=[0])['nodes'] == []
    # a selection is cut to its own proteins
    pick = NW.make_view(full, OPT, select=set(range(10, 20)))
    assert set(pick['nodes']) <= set(range(10, 20))
    # edges at a stricter score are a subset
    strict = NW.make_view(full, {**OPT, 'min_score': 900}, sources=[0])
    assert len(strict['edges']) <= len(only['edges'])


def test_the_browser_twin_gives_the_same_clusters_and_labels(tmp_path):
    if shutil.which('node') is None:
        pytest.skip('needs Node.js')
    full = _full()
    cases = [
        (OPT, None, None),
        ({**OPT, 'top': 25}, None, [0]),
        ({**OPT, 'min_score': 900}, set(range(5, 33)), None),
        ({**OPT, 'resolution': 1.5}, set(range(0, 40, 2)), [0, 1]),
        ({**OPT, 'label': 1, 'min_overlap': 2}, None, None),
        ({**OPT, 'label': 0, 'top': 30}, set(range(3, 40)), None),
    ]
    want = [NW.make_view(full, o, s, e) for o, s, e in cases]
    prog = (
        'global.window=global;const fs=require("fs");'
        f'eval(fs.readFileSync({json.dumps(str(STATS))},"utf8"));eval(fs.readFileSync({json.dumps(str(ASSETS / "kit-netcore.js"))},"utf8"));'
        'const K={};window.PTMC_MODULES.forEach(m=>m(K));const IN=JSON.parse(fs.readFileSync(0,"utf8"));'
        'console.log(JSON.stringify(IN.cases.map(c=>K.netcore.makeView(IN.F,c[0],c[1]?new Set(c[1]):null,c[2]))));'
    )
    inp = json.dumps({'F': full, 'cases': [[o, sorted(s) if s is not None else None, e] for o, s, e in cases]})
    run = subprocess.run(['node', '-e', prog], input=inp, capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    got = json.loads(run.stdout)
    for a, b in zip(want, got):
        assert a['nodes'] == b['nodes'] and a['edges'] == b['edges'] and a['comm'] == b['comm']
        assert [x.get('term') for x in a['labels']] == [x.get('term') for x in b['labels']]
        for x, y in zip(a['labels'], b['labels']):
            assert abs((x.get('q') or 0) - (y.get('q') or 0)) < 1e-9


# ---- a site with the block ------------------------------------------------------------------------------------------------
def _network(extra=None):
    cfg = {
        'title': 'Network',
        'about': 'One network.',
        'edges': [
            {
                'id': 'pairs',
                'kind': 'pairs',
                'label': 'Scored links',
                'input': 'links',
                'min_score': 700,
                'cite': 'Links paper',
            },
            {
                'id': 'groups',
                'kind': 'groups',
                'label': 'Complexes',
                'input': 'cplx',
                'where': {'curation': 'curated'},
                'max_size': 4,
            },
        ],
        'label_from': [
            {
                'label': 'Terms',
                'input': 'ann',
                'set': 'term',
                'protein': 'protein',
                'names': {'input': 'ann_names', 'set': 'term', 'name': 'name', 'depth': 'depth', 'size': 'size'},
                'min_term': 2,
                'cite': 'Terms paper',
            }
        ],
        'color_by': [
            {'id': 'share', 'name': 'Share', 'kind': 'sequential', 'column': 'residue', 'values': ['R']},
            {'id': 'main', 'name': 'Main class', 'kind': 'categorical', 'column': 'residue'},
        ],
        'top': 50,
        'min_cluster': 2,
        'tile': {'section': 'Tests', 'text': 'x'},
    }
    cfg.update(extra or {})
    return cfg


def _with_network(tmp_path, cfg):
    """The toy site of test_set_views with a table of links, complexes and terms for its proteins (P1 to P7)."""
    root = _site(tmp_path)
    data = root / 'data'
    pd.DataFrame(
        [
            ('P1', 'P2', 900),
            ('P2', 'P3', 800),
            ('P1', 'P3', 750),
            ('P5', 'P6', 950),
            ('P3', 'P5', 400),
            ('P6', 'P7', 700),
        ],
        columns=['protein_a', 'protein_b', 'combined_score'],
    ).to_csv(data / 'links.tsv', sep='\t', index=False)
    pd.DataFrame(
        [
            ('C1', 'curated', 'P1'),
            ('C1', 'curated', 'P5'),
            ('C2', 'predicted', 'P2'),
            ('C2', 'predicted', 'P3'),
            ('C3', 'curated', 'P1'),
            ('C3', 'curated', 'P2'),
            ('C3', 'curated', 'P3'),
            ('C3', 'curated', 'P4'),
            ('C3', 'curated', 'P6'),
        ],
        columns=['complex_id', 'curation', 'uniprot_accession'],
    ).to_csv(data / 'cplx.tsv', sep='\t', index=False)
    pd.DataFrame(
        [('TA', p, 'true') for p in ('P1', 'P2')]
        + [('TA', 'P3', 'false')]  # P3 holds term A on IEA alone
        + [('TB', p, 'true') for p in ('P5', 'P6', 'P7')],
        columns=['term', 'protein', 'non_iea'],
    ).to_csv(data / 'ann.tsv', sep='\t', index=False)
    pd.DataFrame([('TA', 'term A', 4, 900), ('TB', 'term B', 2, 30)], columns=['term', 'name', 'depth', 'size']).to_csv(
        data / 'ann_names.tsv', sep='\t', index=False
    )
    mp = root / 'sites' / 'toy.inputs.json'
    man = json.loads(mp.read_text())
    for name, f in [('links', 'links.tsv'), ('cplx', 'cplx.tsv'), ('ann', 'ann.tsv'), ('ann_names', 'ann_names.tsv')]:
        man['inputs'][name] = {
            'file': f,
            'md5': md5_file(data / f),
            'source': 'synthetic',
            'version': 't',
            'licence': 'CC0 1.0',
        }
    mp.write_text(json.dumps(man, indent=1))
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['inputs'].update({k: k for k in ('links', 'cplx', 'ann', 'ann_names')})
    site['website'] = {
        **(site.get('website') or {}),
        'network': cfg,
        'overview': {'sections': [{'name': 'Tests', 'cards': []}]},
    }
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    return root, p


def _built(tmp_path, cfg):
    root, p = _with_network(tmp_path, cfg)
    S.run(p, root=root / 'data', log=lambda *_: None)
    return root, p, web.build(p, log=lambda *_: None)


def test_the_block_writes_two_lazy_files_and_a_page_config_but_not_the_first_payload(tmp_path):
    root, p, index = _built(tmp_path, _network())
    d = index.parent / 'data'
    view, full = json.loads((d / 'network.json').read_text()), json.loads((d / 'network_full.json').read_text())
    # the default view: P1-P3 (links 900, 800, 750) and P1-P5 (a curated complex); P3-P5 is 400, under the floor
    assert view['nodes'] == ['P1', 'P2', 'P3', 'P5']
    assert len(view['gene']) == len(view['sites']) == len(view['nodes']) == len(view['comm'])
    assert full['acc'] == sorted(full['acc']) and len(full['edges']) % 4 == 0
    assert [t[0] for t in full['terms']] == ['term A']  # term B has one marked protein, under min_term 2
    assert [c['id'] for c in full['color']] == ['share', 'main']
    assert full['color'][0]['v'] == [1.0] * 4 and full['color'][1]['cats'] == ['R'] and full['color'][1]['v'] == [0] * 4
    # the first-view payload has the page's config (small), never the graph
    html = index.read_text()
    assert '"files":{"view":"data/network.json"' in html and '"edges":[[0,' not in html
    # the one-file copy has no network view
    one = (index.parent / 'toy.html').read_text()
    assert '"files":{"view":' not in one


def _terms(tmp_path, lab):
    root, p, index = _built(tmp_path, _network({'label_from': [{**_network()['label_from'][0], **lab}]}))
    full = json.loads((index.parent / 'data' / 'network_full.json').read_text())
    data = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    return full, data['network']['labels']


def test_only_non_iea_rows_count_by_default_and_a_shallow_term_is_left_out(tmp_path):
    full, labels = _terms(tmp_path, {})
    n_a = sum(0 in a for a in full['ann'])
    assert n_a == 2 and full['terms'][0] == [
        'term A',
        0,
        'TA',
        4,
    ]  # P3's IEA-only row is not counted; depth rides along
    assert labels[0]['non_iea'] is True and labels[0]['min_depth'] == 0
    full, labels = _terms(tmp_path / 'b', {'non_iea': False})
    # counting P3's IEA-only row too, term A covers 3 of the 4 nodes: over the 50% a table may hold, so it is left out
    assert full['terms'] == [] and labels[0]['non_iea'] is False
    full, _ = _terms(tmp_path / 'c', {'min_term': 1, 'min_depth': 3})
    assert [t[0] for t in full['terms']] == ['term A']  # term B lies 2 steps below the root
    # a term that annotates more proteins of the whole proteome than max_size is too general to name a cluster
    full, labels = _terms(tmp_path / 'e', {'min_term': 1, 'max_size': 100})
    assert [t[0] for t in full['terms']] == ['term B'] and labels[0]['max_size'] == 100
    full, _ = _terms(tmp_path / 'd', {'min_term': 1})
    assert [t[0] for t in full['terms']] == ['term A', 'term B']


def test_equal_q_goes_to_the_deeper_term_and_a_source_can_be_chosen():
    # the same 10 proteins hold two terms, so p and q are equal: the deeper term names the cluster
    comm = [0] * 10 + [1] * 50
    ann = [[0, 1, 2] for _ in range(10)] + [[2] for _ in range(50)]
    terms = [['shallow', 0, 'S', 3], ['deep', 0, 'D', 7], ['other source', 1, 'O', 9]]
    opt = {**NW.DEFAULTS, 'max_fraction': 0.5, 'label': 0}
    assert NW.label_clusters(comm, ann, terms, opt)[0]['term'] == 'deep'
    assert NW.label_clusters(comm, ann, terms, {**opt, 'label': None})[0]['term'] in ('deep', 'other source')
    only1 = NW.label_clusters(comm, [[2] for _ in ann], terms, {**opt, 'label': 1, 'max_fraction': 1})
    assert only1[0].get('term') in (None, 'other source')
    # a source the terms do not have names no cluster
    assert NW.label_clusters(comm, ann, terms, {**opt, 'label': 5})[0]['term'] is None


def test_complex_edges_skip_predicted_and_large_complexes_and_the_default_matches_make_view(tmp_path):
    root, p, index = _built(tmp_path, _network())
    full = json.loads((index.parent / 'data' / 'network_full.json').read_text())
    E = full['edges']
    edges = {(full['acc'][E[i]], full['acc'][E[i + 1]]): (E[i + 2], E[i + 3]) for i in range(0, len(E), 4)}
    assert edges[('P1', 'P5')][0] & 2  # a curated complex of two
    assert ('P2', 'P3') in edges and not edges[('P2', 'P3')][0] & 2  # C2 is predicted: only the link
    assert ('P1', 'P4') not in edges  # C3 has 5 members, over max_size 4
    assert ('P3', 'P5') not in edges  # 400 is under the floor and no complex joins them
    assert edges[('P1', 'P2')][0] & 1 and edges[('P1', 'P2')][1] == 900


def test_a_site_without_the_block_has_no_files_and_the_checks_name_what_is_missing(tmp_path):
    root, p, index = _built(tmp_path, _network())
    site = yaml.safe_load(p.read_text())
    del site['website']['network']
    assert S.network_problems(site) == []
    bad = _network({'edges': [{'kind': 'pairs', 'input': 'nope'}], 'tile': {'section': 'Missing'}})
    site['website']['network'] = bad
    problems = S.network_problems(site)
    assert any("no input role 'nope'" in x for x in problems) and any(
        "no Overview section 'Missing'" in x for x in problems
    )
    # a site file without the block rebuilds without its files
    p.write_text(
        yaml.safe_dump(
            {**yaml.safe_load(p.read_text()), 'website': {k: v for k, v in site['website'].items() if k != 'network'}}
        )
    )
    index2 = web.build(p, log=lambda *_: None)
    assert not (index2.parent / 'data' / 'network.json').exists()
    assert not (index2.parent / 'data' / 'network_full.json').exists()


def test_the_colour_by_values_follow_the_marks(tmp_path):
    marks = pd.DataFrame(
        {
            'base': ['A', 'A', 'A', 'B', 'B', 'C'],
            'flag': ['yes', 'no', 'yes', 'no', '', ''],
            'cls': ['x', 'x;y', 'y', 'z', 'z', ''],
        }
    )
    nodes = ['A', 'B', 'C', 'D']
    seq = NW.color_values(
        marks, {'id': 's', 'name': 'S', 'kind': 'sequential', 'column': 'flag', 'values': ['yes']}, nodes
    )
    assert seq['v'] == [0.667, 0.0, None, None]  # C and D have no site with a value
    cat = NW.color_values(
        marks, {'id': 'c', 'name': 'C', 'kind': 'categorical', 'column': 'cls', 'max_values': 2}, nodes
    )
    # A: x twice, y twice (x;y counts both): tie to the first alphabetically, x; B: z; C, D: none
    assert cat['cats'] == ['x', 'z']
    assert cat['v'][3] == -1 and cat['v'][2] == -1 and cat['v'][0] != cat['v'][1]
    # more values than max_values: the rest are 'Other'
    many = NW.color_values(
        marks, {'id': 'c', 'name': 'C', 'kind': 'categorical', 'column': 'cls', 'max_values': 1}, nodes
    )
    assert many['cats'][-1] == 'Other'


def test_the_marked_proteins_of_the_toy_are_the_nodes(tmp_path):
    root, p, index = _built(tmp_path, _network())
    full = json.loads((index.parent / 'data' / 'network_full.json').read_text())
    assert set(full['acc']) <= set(MARKED)


def test_every_site_offers_the_disorder_colouring_first_and_the_protein_link(tmp_path):
    root = Path(__file__).resolve().parents[1]
    for name in ('methylarginine', 'methyllysine', 'phospho', 'lysine'):
        net = yaml.safe_load((root / 'sites' / f'{name}.yaml').read_text())['website']['network']
        ids = [c['id'] for c in net['color_by']]
        assert ids[0] == 'disordered', (
            name
        )  # the Colour by menu: Cluster, then the share of sites in disordered regions
        assert (
            net['color_by'][0]['name'] == 'Share of sites in disordered regions'
            and net['color_by'][0]['kind'] == 'sequential'
        )
        assert net['protein_link'] is True and net['controls'][:2] == ['clusters', 'colour'], name


def test_the_protein_link_switch_reaches_the_page_and_defaults_to_on(tmp_path):
    for k, extra in enumerate(({}, {'protein_link': False})):
        root, p, index = _built(tmp_path / str(k), _network(extra))
        data = json.loads(
            re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(
                1
            )
        )
        assert data['network']['protein_link'] is (not extra)


def _coverage_case():
    # three clusters of twenty; terms: A holds for 6 of cluster 0 and 6 of cluster 1, B for 4 of cluster 0 (a thin one with the
    # smallest p), G for 5 of cluster 1, Z for 3 of cluster 2 (under a quarter of it)
    comm = [0] * 20 + [1] * 20 + [2] * 20
    ann = [[] for _ in comm]
    for i in range(6):
        ann[i].append(0)
    for i in range(4):
        ann[i].append(1)
    for i in range(20, 26):
        ann[i].append(0)
    for i in range(26, 31):
        ann[i].append(2)
    for i in range(40, 43):
        ann[i].append(3)
    terms = [
        ['alpha, via a long mechanism', 0, 'A', 4],
        ['beta', 0, 'B', 4],
        ['gamma', 0, 'G', 4],
        ['zeta', 0, 'Z', 4],
    ]
    return comm, ann, terms, {**NW.DEFAULTS, 'min_term': 3, 'max_fraction': 0.3, 'max_q': 1.0}


def test_a_term_names_a_cluster_only_if_it_holds_for_a_fair_share_and_names_one_cluster():
    comm, ann, terms, opt = _coverage_case()
    lab = NW.label_clusters(comm, ann, terms, opt)
    # cluster 0: B has the smallest q but holds for 4 of 20 (0.2, under 0.25); A holds for 6 of 20 (0.3)
    assert lab[0]['term'] == 'alpha, via a long mechanism' and lab[0]['k'] == 6
    # cluster 1: A is taken (a term names one cluster), so the next term that holds for a quarter of it: gamma, 5 of 20
    assert lab[1]['term'] == 'gamma'
    # cluster 2: zeta holds for 3 of 20 (0.15, under a quarter): it still names the cluster, marked thin (its share is shown)
    assert lab[2]['term'] == 'zeta' and lab[2]['thin'] and not lab[0].get('thin')
    # thin_term: genes leaves such a cluster to its busiest proteins
    assert NW.label_clusters(comm, ann, terms, {**opt, 'thin_term': 'genes'})[2]['term'] is None
    # no significant term at all: no name from a term, whatever thin_term says
    assert NW.label_clusters(comm, ann, terms, {**opt, 'max_q': 1e-12})[2]['term'] is None
    # with no coverage asked for, the thin term names cluster 0 and the others follow
    lax = NW.label_clusters(comm, ann, terms, {**opt, 'min_coverage': 0})
    assert lax[0]['term'] == 'beta'
    # no term significant at max_q: the term of the smallest p that holds for a quarter of the cluster names it, marked weak
    # (cluster 0: alpha, 6 of 20; beta holds for 4 only), with weak_p 0 it stays unnamed
    weak = NW.label_clusters(comm, ann, terms, {**opt, 'max_q': 1e-12, 'weak_p': 0.5})
    assert weak[0]['term'] == 'alpha, via a long mechanism' and weak[0]['weak'] and not weak[0].get('thin')
    assert weak[0]['q'] > 1e-12 and weak[2]['term'] is None  # zeta holds for under a quarter: no weak name
    assert NW.label_clusters(comm, ann, terms, {**opt, 'max_q': 1e-12, 'weak_p': 0})[0]['term'] is None


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_the_browser_twin_names_clusters_by_the_same_coverage_and_uniqueness_rule():
    comm, ann, terms, opt = _coverage_case()
    opts = [
        opt,
        {**opt, 'min_coverage': 0},
        {**opt, 'thin_term': 'genes'},
        {**opt, 'max_q': 1e-12, 'weak_p': 0.5},
        {**opt, 'max_q': 1e-12, 'weak_p': 0},
    ]
    want = [NW.label_clusters(comm, ann, terms, o) for o in opts]
    prog = (
        'global.window=global;const fs=require("fs");'
        f'eval(fs.readFileSync({json.dumps(str(STATS))},"utf8"));eval(fs.readFileSync({json.dumps(str(ASSETS / "kit-netcore.js"))},"utf8"));'
        'const K={};window.PTMC_MODULES.forEach(m=>m(K));const IN=JSON.parse(fs.readFileSync(0,"utf8"));'
        'console.log(JSON.stringify(IN.opts.map(o=>K.netcore.labelClusters(IN.comm,IN.ann,IN.terms,o))));'
    )
    run = subprocess.run(
        ['node', '-e', prog],
        input=json.dumps({'comm': comm, 'ann': ann, 'terms': terms, 'opts': opts}),
        capture_output=True,
        text=True,
    )
    assert run.returncode == 0, run.stderr[-800:]
    got = json.loads(run.stdout)
    for w, g in zip(want, got):
        assert [x.get('term') for x in w] == [x.get('term') for x in g]
        assert [bool(x.get('thin')) for x in w] == [bool(x.get('thin')) for x in g]
        assert [bool(x.get('weak')) for x in w] == [bool(x.get('weak')) for x in g]


def test_every_cluster_has_its_busiest_proteins_for_a_name_and_the_layout_uses_it():
    from ptmcontext.web import netlayout as NL

    full = _full()
    v = NW.make_view(
        full, {**OPT, 'min_coverage': 1.01, 'thin_term': 'genes'}
    )  # no term holds for all of a cluster: every cluster is named by genes
    assert all(x.get('term') is None and len(x['genes']) == 3 for x in v['labels'])
    # the busiest three of cluster 0, most sites first
    members = sorted(
        (full['nodes'][g] for i, g in enumerate(v['nodes']) if v['comm'][i] == 0), key=lambda n: (-n[2], n[1], n[0])
    )
    assert v['labels'][0]['genes'] == [n[1] for n in members[:3]]
    view = {
        'gene': [full['nodes'][g][1] for g in v['nodes']],
        'sites': [full['nodes'][g][2] for g in v['nodes']],
        'comm': v['comm'],
        'edges': v['edges'],
        'labels': v['labels'],
    }
    out = NL.layout(view, 'desktop')
    assert all(lb['short'] is None and not lb['name'].startswith('Cluster') for lb in out['clabels'])


def test_a_thin_term_names_its_cluster_with_its_share_in_the_figure():
    from ptmcontext.web import netlayout as NL

    full = _full()
    v = NW.make_view(full, {**OPT, 'min_coverage': 1.01, 'thin_term': 'genes'})
    labels = [dict(x) for x in v['labels']]
    labels[0].update(term='chromatin organization', k=2, thin=True)  # 2 of 10 proteins: 20%
    view = {
        'gene': [full['nodes'][g][1] for g in v['nodes']],
        'sites': [full['nodes'][g][2] for g in v['nodes']],
        'comm': v['comm'],
        'edges': v['edges'],
        'labels': labels,
    }
    out = NL.layout(view, 'desktop')
    assert any('20%' in lb['name'] for lb in out['clabels'])
    # a weak term carries its q, and a cluster with no term is called Unnamed with its proteins
    labels[0].update(thin=False, weak=True, q=0.1076)
    out = NL.layout({**view, 'labels': labels}, 'desktop')
    assert any('q 0.11' in lb['name'] for lb in out['clabels'])
    assert any(lb['name'].startswith('Unnamed: ') for lb in out['clabels'])


# ---- link types, enzyme roles and node size -------------------------------------------------------------------------------
def _typed_full():
    """Four sources: scored experiments (bit 0) and databases (bit 1), complexes (bit 2), a functional layer that is off (bit 3)."""
    full = _full()
    rnd = random.Random(5)
    full['sources'] = [
        {'kind': 'pairs', 'id': 'e', 'family': 'S'},
        {'kind': 'pairs', 'id': 'd', 'family': 'S'},
        {'kind': 'groups', 'id': 'g', 'weight': 700},
        {'kind': 'functional', 'id': 'f', 'weight': 400, 'off': True},
    ]
    full['edges'] = [[a, b, rnd.choice([1, 2, 3, 4, 8, 9, 12]), rnd.choice([750, 950])] for a, b, _, _ in full['edges']]
    return full


def test_a_layer_marked_off_is_left_out_until_asked_for_and_two_scored_sources_share_the_threshold():
    full = _typed_full()
    v = NW.make_view(full, OPT)  # the default: all but the layer
    assert all(not f & 8 for _, _, f, _ in v['edges'])
    both = NW.make_view(full, OPT, sources=[0, 1, 2, 3])
    assert any(f & 8 for _, _, f, _ in both['edges'])
    # an edge that only the layer gives joins the network with the layer, with no score threshold
    assert len(both['edges']) >= len(v['edges'])
    # a threshold above every score drops the scored types, not the complexes
    high = NW.make_view(full, {**OPT, 'min_score': 1001}, sources=[0, 1, 2])
    assert all(f & 4 and not f & 3 for _, _, f, _ in high['edges'])
    assert NW.default_sources(full['sources']) == [0, 1, 2]


def test_the_browser_twin_takes_the_same_default_sources_and_scored_bits():
    if shutil.which('node') is None:
        pytest.skip('needs Node.js')
    full = _typed_full()
    cases = [
        (OPT, None),
        (OPT, [0, 1, 2, 3]),
        ({**OPT, 'min_score': 900}, [1, 2]),
        ({**OPT, 'min_score': 1001}, [0, 1, 2]),
    ]
    want = [NW.make_view(full, o, None, e) for o, e in cases]
    prog = (
        'global.window=global;const fs=require("fs");'
        f'eval(fs.readFileSync({json.dumps(str(STATS))},"utf8"));eval(fs.readFileSync({json.dumps(str(ASSETS / "kit-netcore.js"))},"utf8"));'
        'const K={};window.PTMC_MODULES.forEach(m=>m(K));const IN=JSON.parse(fs.readFileSync(0,"utf8"));'
        'console.log(JSON.stringify(IN.cases.map(c=>K.netcore.makeView(IN.F,c[0],null,c[1]||undefined))));'
    )
    run = subprocess.run(
        ['node', '-e', prog], input=json.dumps({'F': full, 'cases': cases}), capture_output=True, text=True
    )
    assert run.returncode == 0, run.stderr[-800:]
    for a, b in zip(want, json.loads(run.stdout)):
        assert a['nodes'] == b['nodes'] and a['edges'] == b['edges'] and a['comm'] == b['comm']


def _split(tmp_path, channels=True, functional=True, columns=True):
    root, p = _with_network(tmp_path, _network())
    data = root / 'data'
    links = pd.read_csv(data / 'links.tsv', sep='\t')
    if columns:
        links['experiments'] = [900, 0, 750, 950, 400, 0]
        links['database'] = [0, 800, 500, 0, 0, 700]
    links.to_csv(data / 'links.tsv', sep='\t', index=False)
    pd.DataFrame(
        [('P1', 'P6', 800), ('P1', 'P2', 750), ('P2', 'P5', 300)], columns=['protein_a', 'protein_b', 'combined_score']
    ).to_csv(data / 'fn.tsv', sep='\t', index=False)
    cx = pd.read_csv(data / 'cplx.tsv', sep='\t')
    cx['complex_name'] = [f'complex {c}' for c in cx['complex_id']]
    cx.to_csv(data / 'cplx.tsv', sep='\t', index=False)
    man = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    for name, f in [('links', 'links.tsv'), ('cplx', 'cplx.tsv'), ('fn', 'fn.tsv')]:
        man['inputs'][name] = {
            **man['inputs'].get(name, {}),
            'file': f,
            'md5': md5_file(data / f),
            'source': 'synthetic',
            'version': 't',
            'licence': 'CC0 1.0',
        }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man, indent=1))
    site = yaml.safe_load(p.read_text())
    net = site['website']['network']
    if channels:
        net['edges'][0]['channels'] = [
            {'id': 'exp', 'label': 'experiments', 'column': 'experiments'},
            {'id': 'db', 'label': 'databases', 'column': 'database', 'min': 500},
        ]
    net['edges'][1]['name'] = 'complex_name'
    site['inputs']['fn'] = 'fn'
    net['edges'].append(
        {
            'id': 'fn',
            'kind': 'functional',
            'label': 'Functional',
            'input': 'fn',
            'optional': True,
            'default': False,
            'min_score': 700,
        }
        if functional
        else {'id': 'fn', 'kind': 'functional', 'label': 'Functional', 'input': 'missing_role', 'optional': True}
    )
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    return root, p, web.build(p, log=lambda *_: None)


def test_links_are_split_by_channel_and_name_their_complexes_and_a_functional_layer_is_off_by_default(tmp_path):
    root, p, index = _split(tmp_path)
    d = index.parent / 'data'
    full = json.loads((d / 'network_full.json').read_text())
    ids = [s['id'] for s in full['sources']]
    assert ids == ['pairs_exp', 'pairs_db', 'groups', 'fn']
    exp, db, grp, fn = full['sources']
    assert exp['family'] == db['family'] == 'Scored links' and exp['label'] == 'Scored links, experiments'
    assert exp['style']['opacity'] > db['style']['opacity'] and not exp['style']['dash'] and fn['style']['dash']
    assert grp['style']['width'] > exp['style']['width'] and fn['off'] is True and 'off' not in exp
    E = full['edges']
    edges = {(full['acc'][E[i]], full['acc'][E[i + 1]]): (i // 4, E[i + 2]) for i in range(0, len(E), 4)}
    k, fl = edges[('P1', 'P2')]
    assert (
        fl & 1 and not fl & 2 and fl & 8 and full['extra']['pairs_exp'][k] == 900
    )  # experiments only, and the layer's
    assert full['extra']['fn'][k] == 750
    k, fl = edges[('P2', 'P3')]
    assert fl & 2 and not fl & 1 and full['extra']['pairs_db'][k] == 800
    k, fl = edges[('P1', 'P3')]
    assert fl & 1 and fl & 2  # experiments 750 and databases 500 (the minimum)
    assert not any(f & 2 for (a, b), (_, f) in edges.items() if (a, b) == ('P5', 'P6'))
    # the complexes that give a link are named for its tooltip
    names = {n for n, _ in full['groups']['groups']}
    assert names == {'complex C1'}  # C3 is over max_size 4; C2 is predicted
    # the first view leaves the layer out: P1-P6 is a layer link only (and P1, P6 are not linked otherwise)
    view = json.loads((d / 'network.json').read_text())
    assert all(not f & 8 for _, _, f, _ in view['edges'])
    cfg = re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    assert json.loads(cfg)['network']['sources'][3]['off'] is True


def test_without_the_channel_columns_links_are_not_split_and_an_optional_source_without_a_table_is_left_out(tmp_path):
    logs = []
    root, p = _with_network(tmp_path / 'a', _network())
    site = yaml.safe_load(p.read_text())
    site['website']['network']['edges'][0]['channels'] = [
        {'id': 'exp', 'label': 'experiments', 'column': 'experiments'},
        {'id': 'db', 'label': 'databases', 'column': 'database'},
    ]
    site['website']['network']['edges'].append(
        {
            'id': 'fn',
            'kind': 'functional',
            'label': 'Functional',
            'input': 'no_such_role',
            'optional': True,
            'default': False,
        }
    )
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    web.build(p, log=logs.append)
    assert any('no experiments, database column' in x for x in logs)
    assert S.network_problems(site) == []  # an optional source needs no role
    index = web.build(p, log=lambda *_: None)
    full = json.loads((index.parent / 'data' / 'network_full.json').read_text())
    assert [s['id'] for s in full['sources']] == ['pairs', 'groups'] and 'extra' not in full


def test_every_site_has_the_four_link_types_configured_and_the_roles_where_it_has_enzyme_classes():
    root = Path(__file__).resolve().parents[1]
    for name in ('methylarginine', 'methyllysine', 'phospho', 'lysine'):
        site = yaml.safe_load((root / 'sites' / f'{name}.yaml').read_text())
        net = site['website']['network']
        kinds = {e['id']: e for e in net['edges']}
        assert [c['id'] for c in kinds['string_physical']['channels']] == ['experiments', 'databases'], name
        assert kinds['complex_portal']['name'] == 'complex_name'
        fn = kinds['string_functional']
        assert fn['kind'] == 'functional' and fn['optional'] and fn['default'] is False
        assert [x for x in S.network_problems(site) if 'tile' not in x] == [], name
        classes = ((site['website'].get('search') or {}).get('partners') or {}).get('classes') or {}
        has_roles = any(isinstance(c, dict) and c.get('role') for c in classes.values())
        assert (net.get('outline', {}).get('kind') == 'role') == has_roles, name
        assert all(c['kind'] != 'role' for c in net['color_by']), name


def test_the_role_colouring_reads_the_site_classes_and_marks_none_and_several():
    site = {
        '__root__': '.',
        'website': {
            'search': {
                'partners': {
                    'classes': {
                        'w1': {'label': 'a writer', 'role': 'writer', 'genes': ['GA', 'GB']},
                        'e1': {'label': 'an eraser', 'role': 'eraser', 'genes': ['GB', 'GC']},
                        'r1': {'label': 'a reader', 'role': 'reader', 'genes': ['gd']},
                        'x': {'label': 'a cofactor', 'role': 'cofactor', 'genes': ['GE']},
                    }
                }
            }
        },
    }
    nodes = ['A', 'B', 'C', 'D', 'E', 'F']
    genes = {a: f'G{a}' for a in nodes}
    out = NW.role_values(site, {}, {'id': 'role', 'name': 'Role', 'kind': 'role'}, nodes, genes)
    assert out['cats'] == ['Writer', 'Eraser', 'Reader', 'More than one'] and out['kind'] == 'categorical'
    # A writer, B writer and eraser, C eraser, D reader (symbols match in any case), E (cofactor, not asked) and F none
    assert out['v'] == [0, 3, 1, 2, -1, -1] and out['none_label'] == 'No role'
    only = NW.role_values(
        site, {}, {'id': 'r', 'name': 'R', 'kind': 'role', 'roles': ['writer'], 'none': 'Other'}, nodes, genes
    )
    assert only['cats'] == ['Writer'] and only['v'] == [0, 0, -1, -1, -1, -1] and only['none_label'] == 'Other'
    problems = S.network_problems(
        {'inputs': {}, 'website': {'network': {'edges': [], 'outline': {'id': 'r', 'kind': 'role'}}}}
    )
    assert any('needs website.search.partners.classes' in x for x in problems)


def test_density_is_sites_per_100_candidates_and_the_default_view_is_drawn_by_it(tmp_path):
    assert NW.density(5, 50) == 10.0 and NW.density(3, 0) == 100.0 and NW.density(0, 0) == 0.0
    assert NW.size_units('sites', 7, 70) == 7.0
    assert NW.size_units('density', 5, 50) == round(NW.DENSITY_UNIT * 10, 3)
    assert NW.size_units('density', 1, 1000) == NW.MIN_UNITS  # a node never vanishes
    root, p, index = _built(tmp_path, _network())
    view = json.loads((index.parent / 'data' / 'network.json').read_text())
    full = json.loads((index.parent / 'data' / 'network_full.json').read_text())
    assert len(view['cand']) == len(view['size']) == len(view['nodes']) and len(full['cand']) == len(full['acc'])
    for s, c, z in zip(view['sites'], view['cand'], view['size']):
        assert c >= s and z == NW.size_units('density', s, c)
    # the layout was made on the size, not the number of sites: the proteins' radii follow it
    assert view['layout']['desktop']
    data = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    assert data['network']['size'] == {'default': 'density', 'unit': NW.DENSITY_UNIT}
    root2, p2, index2 = _built(tmp_path / 'sites', _network({'size': {'default': 'sites'}}))
    v2 = json.loads((index2.parent / 'data' / 'network.json').read_text())
    assert v2['size'] == [float(s) for s in v2['sites']]


def test_the_abundance_decile_and_binding_colours_read_the_runs_protein_sets(tmp_path):
    (tmp_path / 'protein_sets.json').write_text(
        json.dumps(
            {
                'abund': {
                    'covariate': {'strata': 10, 'proteins': {'A': [1.0, '1'], 'B': [99.0, '10'], 'C': [None, 'none']}}
                },
                'bind': {
                    'sets': {
                        'r1': {'M': 3, 'marked': ['A', 'B']},
                        'r2': {'M': 1, 'marked': ['C']},
                        'd1': {'M': 1, 'marked': ['B', 'D']},
                    }
                },
            }
        )
    )
    nodes = ['A', 'B', 'C', 'D', 'E']
    dec = NW.decile_values(tmp_path, {'id': 'ab', 'name': 'Abundance', 'analysis': 'abund'}, nodes, lambda *_: None)
    assert dec['kind'] == 'decile' and dec['n'] == 10 and dec['v'] == [1, 10, None, None, None]
    spec = {
        'id': 'bd',
        'name': 'Binding',
        'rna': [
            {'analysis': 'bind', 'set': 'r1'},
            {'analysis': 'bind', 'set': 'r2'},
            {'analysis': 'bind', 'set': 'gone'},
        ],
        'dna': [{'analysis': 'bind', 'set': 'd1'}],
    }
    got = NW.binding_values(tmp_path, spec, nodes, lambda *_: None)
    # A RNA, B both, C RNA, D DNA, E neither
    assert got['kind'] == 'binding' and got['cats'] == ['RNA', 'DNA', 'RNA and DNA'] and got['v'] == [0, 2, 0, 1, -1]
    assert got['none_label'] == 'Neither'
    assert NW.decile_values(tmp_path, {'id': 'x', 'analysis': 'nope'}, nodes, lambda *_: None) is None
    assert (
        NW.binding_values(tmp_path, {'id': 'x', 'rna': [{'analysis': 'nope', 'set': 's'}]}, nodes, lambda *_: None)
        is None
    )
    site = {
        'inputs': {},
        'analyses': [{'id': 'abund'}],
        'website': {
            'network': {
                'edges': [],
                'color_by': [
                    {'id': 'a', 'kind': 'decile', 'analysis': 'abund'},
                    {'id': 'b', 'kind': 'binding', 'rna': [{'analysis': 'zzz', 'set': 's'}]},
                ],
            }
        },
    }
    assert [x for x in S.network_problems(site) if 'no analysis' in x] == [
        "website.network color_by 'b': no analysis 'zzz'"
    ]


def test_node_area_follows_the_sites_up_to_the_cap_in_both_layouts():
    from ptmcontext.web import netlayout as NL

    assert [round(NL.radius(s) ** 2 / s, 6) for s in (1, 4, 16, 36)] == [round(NL.R_PER_SITE**2, 6)] * 4
    assert NL.radius(10000) == NL.R_MAX and NL.radius(0) == 0 and NL.radius(5, 2) == 2 * NL.radius(5)
    js = (ASSETS / 'kit-netlayout.js').read_text()
    assert f'R_PER_SITE = {NL.R_PER_SITE}' in js and f'R_MAX = {int(NL.R_MAX)}' in js


def test_the_page_draws_link_types_a_key_with_switches_and_puts_the_key_in_the_exports():
    js = (ASSETS / 'kit-network.js').read_text()
    for needle in (
        'data-nw-src',  # a checkbox per link type in the key
        'linkKeyHtml()',
        'exportLinkKey(keyItem)',  # the whole-network export
        'exportSizeKey(keyItem, FX,',
        'exportColourKey(keyItem, FX,',
        'exportOutlineKey(keyItem, FX)',  # the enzyme-role ring is in the exports' keys
        "p.set('size', UI.size)",  # the size choice is a readable address key, omitted at the default
        "p.set('outline', 'none')",
        '<title>${esc(whyText(',  # the tooltip that says why a link exists
        "p.set('sources', UI.src.map((i) => SRC[i].id).join())",  # readable address, defaults omitted
    ):
        assert needle in js, needle
    assert js.count('exportLinkKey(keyItem);') == 2  # the whole network and the pinned frame


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_the_network_follows_the_selection_when_a_filters_own_file_arrives_after_the_marks():
    """The selection text is the same before and after a filter's file arrives, but what it holds is not: the network
    must be drawn again, not kept as the empty drawing of the first moment."""
    from test_netlayout import _harness, _node

    full = _full()
    file = {
        'sources': full['sources'],
        'acc': [n[0] for n in full['nodes']],
        'gene': [n[1] for n in full['nodes']],
        'sites': [n[2] for n in full['nodes']],
        'edges': [x for e in full['edges'] for x in e],
        'terms': full['terms'],
        'ann': full['ann'],
    }
    prog = _harness(
        """
const el=()=>({addEventListener(){}});
global.matchMedia=()=>({matches:false,addEventListener(){}});
global.document=el();global.document.querySelectorAll=()=>[];
global.localStorage={getItem(){return null},setItem(){}};
global.location={hash:'#network'};
global.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(JSON.parse(JSON.stringify(IN.file)))});
window.PTMC_MODULES.length=0;
eval(fs.readFileSync(IN.net,'utf8'));
let held=false;
const K2={D:{site:{id:'x'},counts:{proteins:40},network:{options:{steps:[400,700],min_score:700,top:300,min_cluster:5,cluster_range:[4,16,1],max_shown:8},
 sources:[{kind:'pairs',id:'p',label:'L'},{kind:'groups',id:'g',label:'G'}],labels:[{label:'GO'},{label:'R'}],color_by:[],files:{view:'v.json',full:'f.json'}}},
 W:{marks:'sites',mark:'site',proteins:'proteins'},esc:(s)=>String(s),int:(n)=>String(n),S:{view:'network'},netcore:K.netcore,netlayout:K.netlayout,
 views:{},tabs:[],clicks:[],tips:[],sections:{},methods:[],afterRender:[],paramsIn:[],paramsOut:[],
 sel:{active:()=>true,data:()=>({}),describe:()=>'als',key:()=>String(held),nProteins:()=>(held?40:0),protSelected:()=>held},
 render:()=>{},writeHash:()=>{},link:(v)=>'#'+v,loading:(t)=>t,fold:()=>'',tabName:(v,n)=>n,ACT:{resetView:'Reset view'},fq:String,fxn:String,expBar:()=>'',tt:()=>''};
window.PTMC_MODULES.forEach(m=>m(K2));
const nothing=()=>{try{return /nothing to draw/.test(String(K2.views.network.render()))}catch(e){return 'ERR '+e.message}};
K2.views.network.render();
setTimeout(()=>{const before=nothing();held=true;const after=nothing();console.log(JSON.stringify({before,after}))},50);
"""
    )
    got = _node(prog, {'net': str(ASSETS / 'kit-network.js'), 'file': file})
    assert got == {'before': True, 'after': False}, got


def test_the_background_decides_which_terms_are_broad_and_what_is_enriched():
    # a selection of 20 proteins that all hold term 0: against its own proteins the term is in all of them (broad, left out);
    # against a proteome of 1000 where 50 hold it, it names the cluster
    comm = [0] * 10 + [1] * 10
    ann = [[0] for _ in range(20)]
    terms = [['chromatin organization', 0, 'C']]
    opt = {**NW.DEFAULTS, 'min_term': 3, 'background': 'drawn'}
    assert NW.label_clusters(comm, ann, terms, opt)[0]['term'] is None
    bg = {'N': [1000], 'M': [50]}
    lab = NW.label_clusters(comm, ann, terms, opt, bg)
    assert lab[0]['term'] == 'chromatin organization' and lab[0]['M'] == 50 and lab[0]['N'] == 1000
    # max_fraction applies to the background: a term in 30% of the proteome is dropped though it is rare in the selection
    assert NW.label_clusters(comm, ann, terms, opt, {'N': [1000], 'M': [300]})[0]['term'] is None
    # `site` counts every protein the network can draw; `proteome` takes the table made with the network
    full = {'terms': terms, 'ann': [[0]] * 20 + [[]] * 180, 'nodes': [None] * 200, 'bg': bg}
    assert NW.background(full, {'background': 'drawn'}) is None
    assert NW.background(full, {'background': 'proteome'}) == bg
    assert NW.background(full, {'background': 'site'}) == {'N': [200], 'M': [20]}
