"""The Overview's order (the question's heading and key first, then the sections as the site lists them, each under its
own heading), the family links on a question's page, an Overview card's list of `beside` lines, and an address with a
leading slash ('#/protein/P68431'), which opens the protein page."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest

from ptmcontext import site as S
from ptmcontext.profile import validate

ROOT = Path(__file__).resolve().parents[1]
KIT = (ROOT / 'ptmcontext' / 'web' / 'assets' / 'kit.js').read_text()


def _overview_body():
    i = KIT.index('  function overview() {')
    return KIT[i : KIT.index('\n  }\n', i)]


def test_the_overview_draws_its_heading_first_and_the_sections_in_their_order():
    body = _overview_body()
    # no section is lifted above the heading: the cell's section is drawn where the site lists it, like the others
    assert 'cellTop' not in body and 'restSecs' not in body
    ret = body[body.index('    return (\n      (S.arg ?') :]
    assert ret.index('lead()') < ret.index('secs +')


def test_a_question_page_links_to_its_family():
    assert 'function familyLine(a)' in KIT and 'familyLine(a) +' in KIT
    assert 'The same question:' in KIT


def test_beside_takes_one_line_or_a_list(tmp_path):
    site = S.load_site(ROOT / 'sites' / 'lysine.yaml')
    cards = [c for s in site['website']['overview']['sections'] for c in s['cards'] if isinstance(c, dict)]
    card = next(c for c in cards if c['analysis'] == 'same_ub_su')
    assert [b['analysis'] for b in S.beside_lines(card)] == ['same_ub_su_modified', 'same_ub_su_studies']
    assert S.beside_lines({'beside': {'analysis': 'x', 'label': 'X'}}) == [{'analysis': 'x', 'label': 'X'}]
    assert S.beside_lines({}) == []
    # a toy site: a list naming a question the site does not have is a problem, as a single line is
    toy = json.loads(json.dumps(site))
    sec = toy['website']['overview']['sections'][1]
    sec['cards'] = [
        {
            'analysis': 'same_ac_ub',
            'beside': [{'analysis': 'same_ac_ub_modified', 'label': 'A'}, {'analysis': 'nope', 'label': 'B'}],
        }
    ]
    assert any("beside reads no analysis 'nope'" in p for p in S.website_problems(toy))
    with pytest.raises(Exception):
        validate(
            {
                **toy,
                'website': {
                    **toy['website'],
                    'overview': {
                        **toy['website']['overview'],
                        'sections': [{**sec, 'cards': [{'analysis': 'same_ac_ub', 'beside': []}]}],
                    },
                },
            },
            'site',
        )
    assert 'Array.isArray(card.beside)' in KIT


def test_an_address_with_a_leading_slash_reads_as_the_site_s_own():
    line = re.search(r'const hashPath = \(h\) => [^\n]+;', KIT).group(0)
    js = (
        line
        + "\nconsole.log(JSON.stringify(['#/protein/P68431', '#//protein/TP53/K372', '#protein/P68431', '#overview', ''].map(hashPath)));"
    )
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout
    assert json.loads(out) == ['protein/P68431', 'protein/TP53/K372', 'protein/P68431', 'overview', '']
    # read by readHash and written back in the site's own form (S.legacy)
    assert 'hashPath(location.hash).split' in KIT and 'routed || slashed ||' in KIT


def test_the_methods_page_lists_at_most_200_sources():
    # the lysine site's PubMed IDs (tens of thousands) drew a Methods page of about 200,000 elements, which crashed the
    # browser of the link audit: the most frequent are listed, every one stays in the Sites download
    i = KIT.index('  function sourcesSection() {')
    body = KIT[i : KIT.index('\n  function citeSection', i)]
    assert 'const SOURCES_SHOWN = 200;' in KIT and '.slice(0, SOURCES_SHOWN)' in body
