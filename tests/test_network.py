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
                'names': {'input': 'ann_names', 'set': 'term', 'name': 'name', 'depth': 'depth'},
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
    pd.DataFrame([('TA', 'term A', 4), ('TB', 'term B', 2)], columns=['term', 'name', 'depth']).to_csv(
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
