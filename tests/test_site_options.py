"""Options a second mark's site needs, on toy data: a mark on several rows keeps all their values (join_rows), a variant
that counts rows the main view sets aside from the same table (marks_select), a table that lists each pair once and is
read both ways with a numeric cut (both_ways, at_least), and a site left off the landing page's list but in its menu
(landing.unlisted, sites.json)."""

from __future__ import annotations

import json

import pandas as pd
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.web import tables as T

from test_help import _toy


def test_a_mark_on_several_rows_keeps_every_value():
    table = pd.DataFrame(
        {
            'acc': ['P1', 'P1', 'P1', 'P2'],
            'pos': ['2', '2', '2', '5'],
            'state': ['me1', 'me2', 'me1', 'me3'],
            'ev': ['x', 'y', 'x', 'z'],
        }
    )
    marked = pd.DataFrame({'accession': ['P1', 'P2'], 'position': [2, 5]})
    spec = {
        'accession': 'acc',
        'position': 'pos',
        'attributes': {
            'state': {'column': 'state', 'kind': 'list', 'join_rows': True},
            'ev': {'column': 'ev', 'kind': 'list'},  # without it: the first row's
        },
    }
    out = S.mark_attributes(spec, table, marked)
    assert out['a.state'].tolist() == ['me1; me2', 'me3']
    assert out['a.ev'].tolist() == ['x', 'z']


def test_a_variant_may_count_the_rows_the_main_view_sets_aside():
    site = {
        'id': 's',
        'marks': {'input': 'm', 'exclude': [{'column': 'c', 'equals': 'weak'}]},
        'outputs': {'folder': 'out/s'},
        'variants': {'all': {'label': 'All', 'marks_select': {'exclude': []}}, 'plain': {'label': 'Plain'}},
    }
    assert S.with_variant(site, 'all')['marks'].get('exclude') == []
    assert S.with_variant(site, 'plain')['marks']['exclude'] == [{'column': 'c', 'equals': 'weak'}]
    assert S.with_variant(site, None)['marks']['exclude'] == [{'column': 'c', 'equals': 'weak'}]


def test_a_table_of_pairs_is_read_both_ways_above_a_score(tmp_path):
    f = tmp_path / 'pairs.tsv'
    pd.DataFrame(
        {
            'a': ['P1', 'P1', 'P2'],
            'ga': ['G1', 'G1', 'G2'],
            'b': ['P2', 'P3', 'P3'],
            'gb': ['G2', 'G3', 'G3'],
            's': ['800', '500', '900'],
        }
    ).to_csv(f, sep='\t', index=False)
    spec = {
        'format': 'protein_partners',
        'columns': {'accession': 'a', 'partner_accession': 'b', 'partner': 'gb', 'score': 's'},
        'both_ways': {'partner': 'ga'},
        'include': [{'column': 's', 'at_least': 700}],
    }
    got = T.read(spec, f)
    assert sorted(zip(got['accession'], got['partner_accession'], got['partner'])) == [
        ('P1', 'P2', 'G2'),
        ('P2', 'P1', 'G1'),
        ('P2', 'P3', 'G3'),
        ('P3', 'P2', 'G2'),
    ]


def test_an_unlisted_site_is_built_but_not_on_the_landing_page_and_is_in_the_menu(tmp_path):
    root, a = _toy(tmp_path, 'toya')
    _, b = _toy(tmp_path, 'toyb')
    spec = yaml.safe_load(b.read_text())
    spec['website']['landing'] = {'unlisted': True, 'in_switcher': True, 'label': 'Second'}
    b.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    for p in (a, b):
        S.run(p, root=root / 'data', log=lambda *_: None)
        web.build(p, log=lambda *_: None)
    land = web.pages([a, b], tmp_path / 'site', out_root=root, log=lambda *_: None).read_text()
    assert land.count('class="land-card live"') == 1 and 'href="toyb/"' not in land
    assert (tmp_path / 'site' / 'toyb' / 'index.html').exists()
    reg = json.loads((tmp_path / 'site' / 'sites.json').read_text())['sites']
    assert reg == [
        {'id': 'toya', 'label': 'Toy toya', 'listed': True, 'in_switcher': False},
        {'id': 'toyb', 'label': 'Second', 'listed': False, 'in_switcher': True},
    ]
