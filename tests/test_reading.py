"""website.reading: what the website ranks and colors, the same defaults for every site (two maps agreeing on a part
of the cell, 20 proteins a side in each, 30 proteins in a ranked set) unless a site file says otherwise. The entry
pictures choose their findings the way the Overview reads its rows: by the fold, in the direction the test agrees with,
a set by its test within abundance deciles, and never a small set or one whose every member is marked. A toy site
carries the option to its page; the checks name a bad value."""

from __future__ import annotations

import json
import re

import pytest
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.web.glance import findings, fold_of
from test_search import _toy

SETS = [{'id': 'sets', 'kind': 'protein_sets', 'title': 'Sets', 'labels': {}}]
RES = [{'id': 'res', 'kind': 'residue', 'title': 'Residues', 'labels': {}}]


def _set(cat, a, b, c, d, q=1e-6, fold=None):
    n, M, N = a + b, a + c, a + b + c + d
    return {
        'analysis': 'sets',
        'category': cat,
        'method': 'enricher',
        'a': a,
        'b': b,
        'c': c,
        'd': d,
        'or': None,
        'fold': fold if fold is not None else a / n / (M / N),
        'q': q,
    }


def test_a_small_set_or_one_at_the_ceiling_is_not_chosen_and_the_option_lowers_the_floor():
    rows = [
        _set('small', 25, 975, 1, 9000),  # 26 proteins: the largest fold, too small to rank
        _set('ceiling', 60, 940, 0, 9000),  # every member marked
        _set('big', 200, 800, 300, 8700),
    ]
    got = findings(SETS, rows)
    assert [f['class'] for f in got] == ['big'] and abs(got[0]['eff'] - rows[2]['fold']) < 1e-12
    assert findings(SETS, rows, reading={'min_set': 20})[0]['class'] == 'small'


def test_a_set_tested_within_abundance_deciles_is_read_by_that_test():
    rows = [_set('big', 200, 800, 300, 8700)]
    strat = {**rows[0], 'method': 'mantel_haenszel', 'or': 1.3, 'fold': None, 'q': 0.2}
    assert findings(SETS, rows + [strat]) == []
    assert findings(SETS, rows + [{**strat, 'q': 0.01}])[0]['class'] == 'big'
    assert findings(SETS, rows + [{**strat, 'q': 0.01, 'or': 0.8}]) == []  # the deciles point the other way


def test_a_residue_finding_is_its_fold_in_the_direction_its_test_agrees_with():
    row = {'analysis': 'res', 'category': 'x', 'method': 'mantel_haenszel', 'a': 300, 'b': 700, 'c': 2000}
    row |= {'d': 18000, 'or': 4.8, 'fold': None, 'q': 1e-9}
    assert abs(fold_of(row) - 0.3 / 0.1) < 1e-12
    assert findings(RES, [row])[0]['eff'] == fold_of(row)
    assert findings(RES, [{**row, 'or': 0.9}]) == []  # pooled more often, within proteins less often: not chosen


def test_the_option_is_checked_and_reaches_the_page(tmp_path):
    root = _toy(tmp_path, with_search=False)
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['website']['reading'] = {'min_set': 0}
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    with pytest.raises(Exception, match='min_set'):
        S.website_problems(S.load_site(p))
    site['website']['reading'] = {'min_set': 12, 'min_maps': 3}
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    assert not [x for x in S.website_problems(S.load_site(p)) if 'reading' in x]
    S.run(p, root=root / 'data', log=lambda *_: None)
    index = web.build(p, log=lambda *_: None)
    d = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    assert d['reading'] == {'min_set': 12, 'min_maps': 3}


def test_the_landing_card_reads_the_cell_as_the_cell_card_does():
    from ptmcontext.web.glance import cell_findings

    def m(aid, cat, a, c, q=1e-6, n=1000, N=10000):
        return {**_set(cat, a, n - a, c, N - n - c, q), 'analysis': aid}

    cell = {
        'id': 'where',
        'title': 'Where',
        'compartments': [
            {
                'group': 'g',
                'rows': [
                    {'label': 'Tiny', 'part': 'tiny', 'sets': {'m1': 'tiny', 'm2': 'tiny'}},  # 15 marked: too few
                    {'label': 'One map', 'part': 'one', 'sets': {'m1': 'one'}},
                    {'label': 'Both', 'part': 'both', 'sets': {'m1': 'both', 'm2': 'both'}},
                ],
            }
        ],
    }
    rows = [
        m('m1', 'tiny', 15, 5),
        m('m2', 'tiny', 15, 5),
        m('m1', 'one', 300, 100),
        m('m1', 'both', 200, 300),
        m('m2', 'both', 150, 250),
    ]
    got = cell_findings(rows, cell)
    assert [f['label'] for f in got] == ['Both'] and got[0]['maps'] == 2
    folds = sorted(r['fold'] for r in rows[3:])
    assert abs(got[0]['eff'] - (folds[0] * folds[1]) ** 0.5) < 1e-9  # the median of two: their geometric mean
    assert [f['label'] for f in cell_findings(rows, cell, {'min_maps': 1, 'min_group': 5})][:1] == ['Tiny']


def test_a_landing_card_whose_section_has_no_finding_borrows_none_and_findings_come_from_the_overview():
    from ptmcontext.web.glance import glance
    from ptmcontext.web.landing import _result

    f = {'label': 'Histones', 'eff': 300.0, 'dir': 'more'}
    assert _result({'landing_findings': [], 'findings': [f]}) == ''
    assert 'Histones' in _result({'findings': [f]})
    rows = [_set('big', 200, 800, 300, 8700)]
    other = [{**rows[0], 'analysis': 'sets_type'}]
    an = SETS + [{**SETS[0], 'id': 'sets_type'}]
    g = glance(an, rows + other, 1000, None, shown={'sets'})
    assert [x['analysis'] for x in g['findings']] == ['sets']
