"""The header (website.header.compact), the build time in the footer's data, and the closed-by-default folds' switches
(open, enabled, draw_first) in a toy site's file: the schema takes them, the page carries them."""
from __future__ import annotations

import json
import re

from ptmcontext import site as S
from ptmcontext import web

from test_help import _toy


def _build(tmp_path, sid, **website):
    root, p = _toy(tmp_path, sid)
    import yaml
    d = yaml.safe_load(p.read_text())
    d['website'].update(website)
    p.write_text(yaml.safe_dump(d, sort_keys=False, allow_unicode=True))
    assert S.website_problems(S.load_site(p)) == []
    S.run(p, root=root / 'data', log=lambda *_: None)
    page = web.build(p, log=lambda *_: None).read_text()
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    return page, data


def test_the_compact_header_is_on_unless_the_site_turns_it_off(tmp_path):
    page, data = _build(tmp_path, 'toyh')
    assert '<body class="">' in page and data['header'] == {}
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', data['built'])        # the footer's "updated"
    page, data = _build(tmp_path, 'toyi', header={'compact': False})
    assert '<body class="full-header">' in page and data['header'] == {'compact': False}


def test_fold_switches_are_in_the_schema_and_reach_the_page(tmp_path):
    _, data = _build(tmp_path, 'toyj', overview={'draw_first': 1, 'random_maps': {'n': 2, 'enabled': False, 'open': True},
                                                    'starting_points': {'open': True}})
    assert data['overview']['draw_first'] == 1 and data['overview']['random_maps']['enabled'] is False
    assert data['overview']['starting_points']['open'] is True
