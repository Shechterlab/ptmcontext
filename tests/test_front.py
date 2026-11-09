"""website.front, the cards front end's own block (CONTRACTS.md, "The cards front end"): its shape, what it may name,
the cards a site gets without it, and that a classic site's data is unchanged. Nothing here names a mark or a source:
the toy site's questions stand in."""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path

import pytest
from test_pages import _toy_site

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.front import problems, question_ids, resolve
from ptmcontext.profile import validate

REPO = Path(__file__).resolve().parents[1]


def _site(tmp_path, **front):
    n = len(list(tmp_path.iterdir()))
    (tmp_path / f'toy{n}').mkdir()
    site = S.load_site(_toy_site(tmp_path / f'toy{n}') / 'sites' / 'toy.yaml')
    if front:
        site['website']['front'] = front
    return site


def test_the_shipped_sites_agree_with_their_front_blocks():
    for name in ('methylarginine', 'yeast_phospho'):
        site = S.load_site(REPO / 'sites' / f'{name}.yaml')
        assert 'front' in site['website']  # both sites say their mode
        assert S.website_problems(site) == []
        assert site['website']['front']['mode'] == 'classic'  # the shipped sites open with the classic layout
        r = resolve(site)
        assert 'mode' not in r
        placed = [q for c in r['cards'] for q in c['questions']] + r['more']['questions']
        assert sorted(placed) == sorted(question_ids(site)) and len(placed) == len(set(placed))  # every question once


def test_without_a_block_the_cards_come_from_the_sections():
    site = S.load_site(REPO / 'sites' / 'yeast_phospho.yaml')
    r = resolve(site)
    assert [c['title'] for c in r['cards']] == ['Sequence motif', 'Structural context', 'Position in the protein']
    assert r['more']['questions'] == []
    for c in r['cards']:
        assert (
            c['home']['top'] == 5
            and c['home']['q_max'] == 0.05
            and c['home']['analysis'] in {f['analysis'] for f in c['facets']}
        )
    assert all(f['measure'] == 'odds' for c in r['cards'] for f in c['facets'])
    assert 'which_factor' in r['cards'][2]['questions'] and 'which_factor' not in {
        f['analysis'] for f in r['cards'][2]['facets']
    }


def test_a_toy_site_gets_cards_and_a_more_card(tmp_path):
    r = resolve(_site(tmp_path))
    assert {f['analysis']: f['measure'] for c in r['cards'] for f in c['facets']} == {
        'xl': 'odds',
        'near': 'odds',
        'bound': 'fold',
    }
    r = resolve(
        _site(
            tmp_path,
            cards=[{'title': 'Contacts', 'analyses': ['xl']}],
            more='Others',
            rows=3,
            examples=['ONE', {'label': 'Two', 'query': 'TWO P2'}],
        )
    )
    assert r['more'] == {'title': 'Others', 'questions': ['near', 'bound']} and r['cards'][0]['rows'] == 3
    assert r['examples'] == [{'label': 'ONE', 'query': 'ONE'}, {'label': 'Two', 'query': 'TWO P2'}]


def test_the_schema_takes_the_front_block(tmp_path):
    site = _site(
        tmp_path,
        mode='classic',
        rows=4,
        cards=[
            {
                'title': 'A',
                'analyses': ['xl'],
                'facets': [{'analysis': 'xl', 'measure': 'odds'}],
                'home': {'analysis': 'xl', 'top': 2},
            }
        ],
        short={'xl': 'X'},
        row_labels={'xl': {'crosslink': 'Crosslinked'}},
        summary_only={'xl': ['crosslink_measured']},
        glossary={'XL': 'a crosslink'},
        examples=[{'label': 'a', 'query': 'b'}],
    )
    validate({k: v for k, v in copy.deepcopy(site).items() if k != '__root__'}, 'site')
    assert problems(site) == []
    for bad in (
        {'mode': 'cards'},
        {'mode': 'both'},
        {'rows': 0},
        {'cards': []},
        {'cards': [{'analyses': ['xl']}]},
        {'extra': 1},
        {'examples': [{'label': 'a'}]},
        {'cards': [{'title': 'A', 'home': {'top': 3}}]},
    ):
        site['website']['front'] = bad
        with pytest.raises(Exception):  # noqa: B017  (the schema's own error)
            validate({k: v for k, v in copy.deepcopy(site).items() if k != '__root__'}, 'site')


def test_the_front_names_only_what_the_site_has(tmp_path):
    site = _site(
        tmp_path,
        cards=[
            {
                'title': 'A',
                'key': 'a',
                'analyses': ['xl', 'nowhere'],
                'sections': ['No such section'],
                'cell': True,
                'facets': [{'analysis': 'bound', 'measure': 'odds'}, {'analysis': 'ghost'}],
                'home': {'analysis': 'xl', 'classes': ['crosslink']},
            },
            {'title': 'B', 'key': 'a', 'analyses': ['xl']},
        ],
        short={'ghost': 'G'},
        row_labels={'xl': {'no_class': 'x'}},
        summary_only={'ghost': ['x']},
    )
    out = problems(site, S._analysis_words(site))
    for want in (
        "'nowhere' is not a question",
        "no section 'No such section'",
        'the site has no website.cell',
        "'ghost' is not a question",
        "'bound' is measured as 'fold'",
        "a second card with the key 'a'",
        "'xl' is already in the card 'a'",
        "home: 'xl' is not one of the card's facets",
        "short: 'ghost'",
        "row_labels: 'xl' has no class 'no_class'",
        "summary_only: 'ghost'",
    ):
        assert any(want in p for p in out), (want, out)
    assert any('front' in p for p in S.website_problems(site))  # ptmc check reports them


def test_every_question_is_reachable(tmp_path):
    assert problems(_site(tmp_path, cards=[{'title': 'A', 'analyses': ['xl']}], more=False)) == [
        "website.front: more: false, but no card holds ['bound', 'near']; a question must be reachable"
    ]
    assert problems(_site(tmp_path, cards=[{'title': 'A', 'analyses': ['xl', 'near', 'bound']}], more=False)) == []


def test_the_data_carries_the_front(tmp_path):
    def data_of(site_front):
        root = _toy_site(tmp_path / ('c' if 'cards' in site_front else 'plain'))
        import yaml

        p = root / 'sites' / 'toy.yaml'
        s = yaml.safe_load(p.read_text())
        s['website']['front'] = site_front
        p.write_text(yaml.safe_dump(s, sort_keys=False))
        S.run(p, root=root / 'data', log=lambda *_: None)
        page = web.build(p, log=lambda *_: None).read_text()
        return json.loads(
            re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1)
        )

    assert 'short' in data_of({'mode': 'classic'})['front']  # the tiles read its short names, row labels and pathways
    d = data_of({'mode': 'classic', 'cards': [{'title': 'Contacts', 'analyses': ['xl']}]})['front']
    assert (
        'mode' not in d
        and d['cards'][0]['facets'][0]['label'] == 'Crosslinks'
        and d['more']['questions'] == ['near', 'bound']
    )


def test_topics_and_share_tiles_resolve_and_are_checked(tmp_path):
    base = _site(tmp_path)
    qs = question_ids(base)
    site = _site(
        tmp_path,
        mode='classic',
        topics=[{'title': 'All', 'questions': qs}],
        tiles=[{'title': 'T', 'rows': [{'analysis': qs[0], 'class': 'x'}]}],
    )
    fr = resolve(site)
    assert fr['topics'] == [{'title': 'All', 'questions': qs}] and fr['tiles'][0]['rows'][0]['analysis'] == qs[0]
    assert not [p for p in problems(site) if 'topics' in p]
    bad = _site(
        tmp_path,
        mode='classic',
        topics=[{'title': 'X', 'questions': ['nope']}],
        tiles=[{'title': 'T', 'rows': [{'analysis': 'nope', 'class': 'x'}]}],
    )
    msgs = problems(bad)
    assert any('topics[0]' in m and 'nope' in m for m in msgs) and any('tiles[0]' in m for m in msgs)


def test_the_cards_front_end_is_gone_from_the_kit():
    assets = REPO / 'ptmcontext' / 'web' / 'assets'
    assert not (assets / 'kit-front.js').exists() and not (assets / 'kit-sections.js').exists()
    assert 'kit-front.js' not in web.MODULES and 'kit-sections.js' not in web.MODULES
    text = '\n'.join(p.read_text() for p in assets.glob('kit*.js'))
    assert not re.search(r"K\.front\b|front\??\.mode|mode === 'cards'|mode !== 'cards'", text)
    css = (assets / 'kit.css').read_text()
    assert 'body.cards' not in css and '.fr-home' not in css and '.fr-card' not in css
