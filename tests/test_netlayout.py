"""The network figure's layout (ptmcontext/web/netlayout.py) and its browser twin (kit-netlayout.js): the same figure every
time, no overlaps, labels that touch nothing, clusters of confusable colours kept apart; and a chosen number of clusters,
reached the same way in Python and in the browser."""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest
from test_network import OPT, _full

from ptmcontext.web import netlayout as NL
from ptmcontext.web import network as NW

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
STATS = Path(__file__).resolve().parents[1] / 'packages' / 'ptmstats' / 'ptmstats' / 'ptmstats.js'


def _view():
    """Four clusters of ten proteins, with their labels, as the layout takes them."""
    full = _full()
    v = NW.make_view(full, OPT)
    nodes = [full['nodes'][g] for g in v['nodes']]
    labels = [dict(x, term=f'term {i} (a detail), via a long mechanism clause') for i, x in enumerate(v['labels'])]
    return {
        'gene': [n[1] for n in nodes],
        'sites': [n[2] for n in nodes],
        'comm': v['comm'],
        'edges': v['edges'],
        'labels': labels,
    }


def _inside(h, p):
    return all(
        (h[(m + 1) % len(h)][0] - h[m][0]) * (p[1] - h[m][1]) - (h[(m + 1) % len(h)][1] - h[m][1]) * (p[0] - h[m][0])
        >= 0
        for m in range(len(h))
    )


def _seg(a, b, c, d):
    def o(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0


def _hulls_meet(h1, h2):
    if any(_inside(h1, p) for p in h2) or any(_inside(h2, p) for p in h1):
        return True
    return any(
        _seg(h1[i], h1[(i + 1) % len(h1)], h2[j], h2[(j + 1) % len(h2)]) for i in range(len(h1)) for j in range(len(h2))
    )


def _box_hits_circle(b, cx, cy, r):
    nx, ny = min(max(cx, b[0]), b[2]), min(max(cy, b[1]), b[3])
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r


def _check_invariants(view, L, variant):
    n, k = len(view['gene']), L['k']
    r = [NL.radius(s, k) for s in view['sites']]
    pos = L['pos']
    # no two nodes overlap (positions are rounded to 0.1)
    for i in range(n):
        for j in range(i + 1, n):
            assert math.dist(pos[i], pos[j]) >= r[i] + r[j] - 0.2, (i, j)
    # no cluster label or gene label touches a node, an outline or another label
    boxes = [('c', lb['box']) for lb in L['clabels']] + [('g', lb['box']) for lb in L['glabels']]
    for a in range(len(boxes)):
        for b in range(a + 1, len(boxes)):
            x, y = boxes[a][1], boxes[b][1]
            assert not (x[0] < y[2] and y[0] < x[2] and x[1] < y[3] and y[1] < x[3]), (a, b)
    for kind, box in boxes:
        for i in range(n):
            if kind == 'g' and any(lb['i'] == i and lb['box'] == box for lb in L['glabels']):
                continue  # a gene's own label sits beside its node
            assert not _box_hits_circle(box, pos[i][0], pos[i][1], r[i] - 0.3), (kind, i)
        for h in L['hulls']:
            if kind == 'c':
                assert not any(
                    _inside(h, p) for p in ((box[0], box[1]), (box[2], box[3]), (box[0], box[3]), (box[2], box[1]))
                )
    # no two outlines meet
    for a in range(len(L['hulls'])):
        for b in range(a + 1, len(L['hulls'])):
            assert not _hulls_meet(L['hulls'][a], L['hulls'][b]), (a, b)
    # clusters whose colours look alike are kept 40 units apart (15 on a phone), node edge to node edge
    sh = L['shown']
    comm = view['comm']
    gap_bad = 40.0 if variant == 'desktop' else 15.0
    for a in range(len(sh)):
        for b in range(a + 1, len(sh)):
            if NL.bad_pair(a, b, [NL.slot_of(i) for i in range(len(sh))]):
                d = min(
                    math.dist(pos[i], pos[j]) - r[i] - r[j]
                    for i in range(n)
                    for j in range(n)
                    if comm[i] == sh[a] and comm[j] == sh[b]
                )
                assert d >= gap_bad - 1, (a, b, d)
    # the box holds everything
    for i in range(n):
        assert (
            0 <= pos[i][0] - r[i]
            and pos[i][0] + r[i] <= L['w']
            and 0 <= pos[i][1] - r[i]
            and pos[i][1] + r[i] <= L['h']
        )


@pytest.mark.parametrize('variant', ['desktop', 'phone'])
def test_the_layout_is_the_same_every_time_and_keeps_its_invariants(variant):
    view = _view()
    a = NL.layout(view, variant)
    b = NL.layout(view, variant)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)  # byte for byte
    assert len(a['shown']) == 4 and len(a['pos']) == 40
    assert len(a['clabels']) == 4
    _check_invariants(view, a, variant)
    # a phone has numbered badges and no gene labels; a desktop names the three biggest proteins of each cluster
    if variant == 'phone':
        assert [lb['lines'] for lb in a['clabels']] and not a['glabels']
    else:
        assert 0 < len(a['glabels']) <= 12


def test_the_default_figure_of_the_toy_has_short_names_and_the_full_name_beside_them():
    L = NL.layout(_view(), 'desktop')
    first = min(L['clabels'], key=lambda x: x['c'])
    assert first['short'] == 'term 0' and first['full'].startswith('term 0 (a detail)')
    assert (
        NL.short_name('RNA splicing, via transesterification reactions with bulged adenosine as nucleophile')
        == 'RNA splicing'
    )
    assert NL.short_name('regulation of translation') == 'regulation of translation'
    assert NL.short_name("mRNA 3'-end processing") == "mRNA 3'-end processing"
    assert NL.short_name('protein import (into nucleus), regulation') == 'protein import'
    assert NL.wrap2('intermediate filament cytoskeleton organization') == [
        'intermediate filament',
        'cytoskeleton organization',
    ]


def test_type_for_a_printed_page_is_placed_again_without_laying_out_again():
    view = _view()
    pos = NL.positions(view, 'desktop')
    small = NL.finish(view, pos, 'desktop')
    big = NL.finish(view, pos, 'desktop', 22.0, 18.0)
    assert small['pos'] != [] and small['fs'] == 12.5 and big['fs'] == 22.0
    # the figure is the same one with larger type: the box grows, never shrinks
    assert big['w'] >= small['w'] - 1
    assert all(lb['box'][2] - lb['box'][0] > 0 for lb in big['clabels'])


def _node(prog, payload):
    run = subprocess.run(['node', '-e', prog], input=json.dumps(payload), capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    return json.loads(run.stdout)


def _harness(extra=''):
    return (
        'global.window=global;const fs=require("fs");'
        f'eval(fs.readFileSync({json.dumps(str(STATS))},"utf8"));'
        f'eval(fs.readFileSync({json.dumps(str(ASSETS / "kit-netcore.js"))},"utf8"));'
        f'eval(fs.readFileSync({json.dumps(str(ASSETS / "kit-netlayout.js"))},"utf8"));'
        'const K={};window.PTMC_MODULES.forEach(m=>m(K));const IN=JSON.parse(fs.readFileSync(0,"utf8"));' + extra
    )


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
@pytest.mark.parametrize('variant', ['desktop', 'phone'])
def test_the_browser_twin_lays_out_the_same_figure_within_half_a_unit(variant):
    view = _view()
    want = NL.layout(view, variant)
    got = _node(
        _harness('console.log(JSON.stringify(K.netlayout.layout(IN.view,IN.variant,5,8)));'),
        {'view': view, 'variant': variant},
    )
    assert abs(got['w'] - want['w']) < 0.5 and abs(got['h'] - want['h']) < 0.5
    assert max(math.dist(a, b) for a, b in zip(got['pos'], want['pos'])) < 0.5
    assert got['shown'] == want['shown']
    assert [lb['lines'] for lb in got['clabels']] == [lb['lines'] for lb in want['clabels']]
    assert [lb['i'] for lb in got['glabels']] == [lb['i'] for lb in want['glabels']]
    assert [(b['a'], b['b'], b['n']) for b in got['bundles']] == [(b['a'], b['b'], b['n']) for b in want['bundles']]
    _check_invariants(view, got, variant)


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_the_browser_twin_shortens_names_the_same_way():
    names = [
        'RNA splicing, via transesterification reactions with bulged adenosine as nucleophile',
        'protein import (into nucleus), regulation',
        'chromatin remodeling',
        'regulation of alternative mRNA splicing, via spliceosome',
        None,
    ]
    got = _node(_harness('console.log(JSON.stringify(IN.map(t=>K.netlayout.shortName(t))));'), names)
    assert got == [NL.short_name(t) for t in names]


# ---- a chosen number of clusters ---------------------------------------------------------------------------------------------
def _ring_graph(blocks=12, size=8, seed=5):
    """`blocks` dense groups of `size` proteins in a loose ring, so that coarser resolutions merge neighbours."""
    import random

    rnd = random.Random(seed)
    n = blocks * size
    edges = []
    for b in range(blocks):
        g = range(b * size, (b + 1) * size)
        for i in g:
            for j in g:
                if i < j and rnd.random() < 0.8:
                    edges.append((i, j, 900))
        nxt = ((b + 1) % blocks) * size
        for t in range(3):
            edges.append((b * size + t, nxt + t, 700))
    return n, edges


def test_a_chosen_number_of_clusters_is_the_nearest_the_resolutions_reach_and_is_repeatable():
    n, edges = _ring_graph()
    opt = {**NW.DEFAULTS, 'min_cluster': 3}
    counts = {}
    for target in (3, 6, 12):
        comm = NW.communities(n, edges, {**opt, 'clusters': target})
        assert comm == NW.communities(n, edges, {**opt, 'clusters': target})  # the same partition every time
        sizes = {}
        for c in comm:
            sizes[c] = sizes.get(c, 0) + 1
        counts[target] = sum(1 for v in sizes.values() if v >= 3)
    assert abs(counts[12] - 12) <= 1 and abs(counts[6] - 6) <= 2 and counts[3] <= counts[6] <= counts[12]
    # no target: Louvain at the default resolution, as before
    assert NW.communities(n, edges, {**opt, 'clusters': None}) == NW.louvain(n, edges, opt['resolution'])
    assert [round(r, 6) for r in NW.resolutions()][:3] == [0.25, 0.2875, 0.330625] and len(NW.resolutions()) == 24


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_the_browser_twin_reaches_the_same_clusters_for_a_chosen_number():
    n, edges = _ring_graph()
    cases = [3, 6, 12, 40]
    opt = {**NW.DEFAULTS, 'min_cluster': 3}
    want = [NW.communities(n, edges, {**opt, 'clusters': t}) for t in cases]
    got = _node(
        _harness(
            'console.log(JSON.stringify(IN.cases.map(t=>K.netcore.communities(IN.n,IN.edges,{...IN.opt,clusters:t}))));'
        ),
        {'n': n, 'edges': edges, 'cases': cases, 'opt': {'resolution': opt['resolution'], 'min_cluster': 3}},
    )
    assert got == want
    # and through make_view: a view asked for a number of clusters has the same nodes, clusters and labels in both
    full = _full()
    o = {**OPT, 'clusters': 3, 'min_cluster': 5}
    py = NW.make_view(full, o)
    js = _node(
        _harness('console.log(JSON.stringify(K.netcore.makeView(IN.F,IN.o,null,null)));'),
        {'F': full, 'o': o},
    )
    assert js['comm'] == py['comm'] and js['nodes'] == py['nodes']


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_a_link_to_a_protein_knows_what_the_network_must_change_to_show_it():
    full = _full()
    full['byAcc'] = None
    opt = {**OPT, 'steps': [400, 700, 900]}
    acc = full['nodes'][3][0]
    prog = _harness(
        'const out={};for(const [k,a] of Object.entries(IN.cases))out[k]=K.netcore.focusPlan(IN.F,IN.opt,a,null);'
        'console.log(JSON.stringify(out));'
    )
    got = _node(prog, {'F': full, 'opt': opt, 'cases': {'in': acc, 'iso': 'NOPE', 'iso2': acc.split('-')[0] + '-2'}})
    assert got['in']['status'] == 'ok' and got['iso']['status'] == 'unknown'
    assert got['iso2']['status'] == 'ok' and got['iso2']['gi'] == got['in']['gi']  # an isoform is its base accession
    # what it needs: the rank of the protein and of its best-placed partner by sites, plus one
    order = sorted(
        range(len(full['nodes'])), key=lambda i: (-full['nodes'][i][2], full['nodes'][i][1], full['nodes'][i][0])
    )
    rank = {g: r for r, g in enumerate(order)}
    gi = got['in']['gi']
    partners = [b if a == gi else a for a, b, fl, sc in full['edges'] if gi in (a, b) and (sc >= 700 or fl & 2)]
    assert got['in']['need'] == max(rank[gi], min(rank[g] for g in partners)) + 1
    # a protein whose links are all below the score: lower it; with no link at any score: none
    low = {**full, 'edges': [[a, b, 1, 400] if gi in (a, b) else [a, b, fl, sc] for a, b, fl, sc in full['edges']]}
    none = {**full, 'edges': [e for e in full['edges'] if gi not in e[:2]]}
    res = _node(
        _harness(
            'console.log(JSON.stringify([K.netcore.focusPlan(IN.low,IN.opt,IN.acc,null),K.netcore.focusPlan(IN.none,IN.opt,IN.acc,null)]));'
        ),
        {'low': low, 'none': none, 'opt': opt, 'acc': acc},
    )
    assert res[0]['status'] == 'score' and res[0]['lowerTo'] == 400
    assert res[1]['status'] == 'none'


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_a_pasted_list_of_genes_is_split_matched_and_counted():
    nodes = [{'gene': 'FUS', 'acc': 'P35637'}, {'gene': 'TAF15', 'acc': 'Q92804'}, {'gene': 'EWSR1', 'acc': 'Q01844-2'}]
    text = 'fus, TAF15;\nQ01844  NOPE\tP35637 xyz'
    got = _node(
        _harness('const g=K.netcore.findGenes(IN.text,IN.nodes);console.log(JSON.stringify({...g,hits:[...g.hits]}));'),
        {'text': text, 'nodes': nodes},
    )
    assert got['tokens'] == ['fus', 'TAF15', 'Q01844', 'NOPE', 'P35637', 'xyz']  # each once, in order
    assert sorted(got['hits']) == [0, 1, 2]  # a symbol in any case, an accession, an isoform by its base accession
    assert got['found'] == ['fus', 'TAF15', 'Q01844', 'P35637'] and got['missing'] == ['NOPE', 'xyz']


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_a_name_that_is_no_node_is_read_through_the_main_searchs_other_names():
    nodes = [{'gene': 'TARDBP', 'acc': 'Q13148'}, {'gene': 'FUS', 'acc': 'P35637'}]
    got = _node(
        _harness(
            "const al={TDP43:[{acc:'Q13148'}]};const lk=(t)=>al[t.toUpperCase()]?{ps:al[t.toUpperCase()],via:true}:null;"
            'const g=K.netcore.findGenes(IN.text,IN.nodes,lk);console.log(JSON.stringify({...g,hits:[...g.hits]}));'
        ),
        {'text': 'tdp43 FUS NOPE', 'nodes': nodes},
    )
    assert sorted(got['hits']) == [0, 1] and got['found'] == ['tdp43', 'FUS'] and got['missing'] == ['NOPE']


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_the_preview_of_a_protein_is_it_and_the_busiest_partners_of_its_own_cluster():
    view = _view()
    comm = view['comm']
    hub = max(
        range(len(comm)), key=lambda i: sum(1 for a, b, *_ in view['edges'] if i in (a, b) and comm[a] == comm[b])
    )
    got = _node(
        _harness('console.log(JSON.stringify(K.netcore.previewSlice(IN.view,IN.i,IN.max)));'),
        {'view': view, 'i': hub, 'max': 4},
    )
    partners = {b if a == hub else a for a, b, *_ in view['edges'] if hub in (a, b) and comm[a] == comm[b]}
    assert (
        got['nodes'][0] == hub and len(got['nodes']) == min(4, len(partners)) + 1 and got['partners'] == len(partners)
    )
    want = sorted(partners, key=lambda j: (-view['sites'][j], view['gene'][j], j))[:4]
    assert got['nodes'][1:] == want  # most sites first
    assert all(comm[got['nodes'][a]] == comm[hub] for e in got['edges'] for a in e)  # only links inside the cluster
    assert all(a < len(got['nodes']) and b < len(got['nodes']) for a, b in got['edges'])


@pytest.mark.skipif(shutil.which('node') is None, reason='needs Node.js')
def test_the_see_in_network_link_carries_the_filter_and_follows_the_yaml_switches():
    prog = _harness(
        """
const el=()=>({addEventListener(){}});
global.matchMedia=()=>({matches:false,addEventListener(){}});
global.document=el();global.document.querySelectorAll=()=>[];
global.localStorage={getItem(){return null},setItem(){}};
const mk=(extra)=>{const K2={D:{site:{id:'x'},network:{options:{steps:[700],min_score:700,top:300,min_cluster:5,cluster_range:[4,16,1]},
 sources:[{kind:'pairs',label:'L'}],labels:[{label:'GO'}],color_by:[],files:{view:'v.json',full:'f.json'},...extra}},
 W:{marks:'sites',mark:'site'},esc:(s)=>String(s),int:(n)=>String(n),S:{view:'protein'},netcore:K.netcore,netlayout:K.netlayout,
 views:{},tabs:[],clicks:[],tips:[],sections:{},methods:[],afterRender:[],paramsIn:[],paramsOut:[],sel:{active:()=>true},
 link:(v,a,e)=>'#'+v+(a?'/'+a:'')+'?f=HIGHCONF'+(e?'&'+new URLSearchParams(e):'')};
 window.PTMC_MODULES.forEach(m=>m(K2));return K2.protActions;};
eval(fs.readFileSync(IN.net,'utf8'));
const out=[mk({}),mk({protein_link:false}),mk({protein_preview:false})].map(a=>a.map(f=>f({acc:'P35637',gene:'FUS'})).join(''));
console.log(JSON.stringify(out));
"""
    )
    prog = prog.replace(
        'const K={};window.PTMC_MODULES.forEach(m=>m(K));',
        'const K={};window.PTMC_MODULES.forEach(m=>m(K));window.PTMC_MODULES.length=0;',
    )
    got = _node(prog, {'net': str(ASSETS / 'kit-network.js')})
    assert 'href="#network?f=HIGHCONF&amp;p=P35637"' in got[0] or 'href="#network?f=HIGHCONF&p=P35637"' in got[0]
    assert 'See in network' in got[0] and 'data-nw-prev="P35637"' in got[0]
    assert got[1] == ''  # protein_link: false
    assert 'See in network' in got[2] and 'data-nw-prev' not in got[2]  # protein_preview: false
