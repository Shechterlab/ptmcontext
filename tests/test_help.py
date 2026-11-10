"""Help for every reader (kit-help.js) and the landing page: a toy site with a start panel in its site file, and one
without, built and listed; the check names a start that searches a key the site does not have."""

from __future__ import annotations

from pathlib import Path
import json
import re

import pandas as pd
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'

PROTS = [f'P{i}' for i in range(1, 9)]
SEQ = 'MRGGRAAAAARAAAAAAAAAR'


def _toy(tmp_path, sid, start=None):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True, exist_ok=True)
    data = root / 'data'
    data.mkdir(exist_ok=True)
    (data / 'toy.fasta').write_text(
        ''.join(f'>sp|{p}|T{p}_TOY Toy {p} OS=Toy OX=1 GN=G{p} PE=1 SV=1\n{SEQ}\n' for p in PROTS)
    )
    pd.DataFrame({'acc': PROTS[:5], 'pos': [2] * 5}).to_csv(data / 'marks.tsv', sep='\t', index=False)
    entry = {
        f: {
            'file': n,
            'md5': md5_file(data / n),
            'source': 'synthetic, for a test',
            'version': 'test 1',
            'licence': 'CC0 1.0',
        }
        for f, n in {'fasta': 'toy.fasta', 'marks': 'marks.tsv'}.items()
    }
    (root / 'sites' / f'{sid}.inputs.json').write_text(json.dumps({'schema_version': 1, 'inputs': entry}))
    website = {'name': f'Toy {sid}', 'tagline': 'Toy marks.', 'examples': ['GP1', 'GP1 R2', 'GP1 GP2 GP3', 'motif:RGG']}
    if start:
        website['start'] = start
    site = {
        'schema_version': 1,
        'id': sid,
        'title': 'A toy site',
        'status': 'working',
        'mark': str(MARKS / 'methylarginine.yaml'),
        'manifest': f'sites/{sid}.inputs.json',
        'snapshot': {'input': 'fasta', 'release': 'Toy 1'},
        'inputs': {},
        'marks': {'input': 'marks', 'accession': 'acc', 'position': 'pos', 'residue_mismatch': 'error'},
        'analyses': [{'id': 'motif', 'layer': 'motif'}],
        'outputs': {'folder': f'out/{sid}'},
        'website': website,
    }
    path = root / 'sites' / f'{sid}.yaml'
    path.write_text(yaml.safe_dump(site, sort_keys=False, allow_unicode=True))
    return root, path


START = {
    'title': 'Start here',
    'text': 'What the toy site is.',
    'examples': [
        {'label': 'A list of genes', 'query': 'GP1 GP2 GP3', 'help': 'Their marks, tested again.'},
        {'label': 'A motif', 'query': 'motif:RGG'},
    ],
}


def test_the_start_panel_and_help_reach_the_page_and_the_landing_page(tmp_path):
    root, a = _toy(tmp_path, 'toya', START)
    _, b = _toy(tmp_path, 'toyb')
    for p in (a, b):
        assert S.website_problems(S.load_site(p)) == []
        S.run(p, root=root / 'data', log=lambda *_: None)
        index = web.build(p, log=lambda *_: None)
        page = index.read_text()
        assert 'kit-help.js' in page and 'role="tablist"' not in page  # the tabs are a list of pages
        data = json.loads(
            re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1)
        )
        assert data.get('start') == (START if p == a else None)  # absent: the kit chooses from the examples
    land = web.pages([a, b], tmp_path / 'site', out_root=root, log=lambda *_: None).read_text()
    assert '<html lang="en">' in land and 'class="skip"' in land and '<main' in land and '<footer' in land
    assert 'How to start' not in land and land.count('class="land-card"') == 2
    # the configured starts for one site, the examples for the other; each opens that site with the search filled
    assert 'href="toya/#overview?q=GP1%20GP2%20GP3">GP1 GP2 GP3' in land and 'href="toyb/#overview?q=GP1">GP1' in land
    assert (root / 'out' / 'toya' / 'web' / 'glance.json').exists()
    # no link inside another (a card is an article with its own links, not one link)
    assert not re.search(r'<a [^>]*>(?:(?!</a>).)*<a ', land, re.S)


def test_the_check_names_a_start_the_site_cannot_search(tmp_path):
    _, p = _toy(tmp_path, 'toyc', {'examples': [{'query': 'disease:ALS'}]})
    assert any("'disease:ALS' names no search key of this site" in x for x in S.website_problems(S.load_site(p)))


def _row(analysis, category, a, eff, q, method='mantel_haenszel'):
    return {'analysis': analysis, 'category': category, 'method': method, 'a': a, 'or': eff, 'fold': None, 'q': q}


def test_the_entry_pictures_come_from_the_statistics_or_the_site_file():
    from ptmcontext.web.glance import glance

    analyses = [
        {
            'id': 'where',
            'kind': 'residue',
            'shape': 'class',
            'title': 'Where',
            'labels': {'in': 'inside', 'out': 'outside', 'edge': 'edge', 'x': 'x'},
        },
        {'id': 'sets', 'kind': 'protein_sets', 'shape': 'sets', 'title': 'Sets', 'labels': {'s1': 'Set one'}},
    ]
    rows = [
        _row('where', 'in', 60, 3.0, 1e-9),
        _row('where', 'out', 30, 0.4, 1e-5),
        _row('where', 'edge', 10, 1.0, 0.5),
        _row('sets', 's1', 25, 5.0, 1e-4, 'enricher'),
        _row('sets', 's1', 25, 1.2, 0.4),
        _row('sets', 's2', 5, 40.0, 1e-6, 'enricher'),
    ]
    g = glance(analyses, rows, 100, None)
    assert [(p['label'], p['n']) for p in g['share']['parts']] == [('inside', 60), ('outside', 30), ('edge', 10)]
    # one finding per question, by the usual test, ranked by effect, on at least 20 marks (s2 has 5)
    assert [(f['analysis'], f['class']) for f in g['findings']] == [('sets', 's1'), ('where', 'in')]
    named = glance(
        analyses,
        rows,
        100,
        {
            'share': {'analysis': 'where', 'classes': ['in'], 'labels': {'in': 'in it'}},
            'findings': [{'analysis': 'where', 'class': 'out'}],
        },
    )
    assert [p['label'] for p in named['share']['parts']] == ['in it', 'other'] and named['findings'][0]['dir'] == 'less'
    assert glance(analyses, rows, 1000, None)['share'] is None  # no question's classes add up to the marks
