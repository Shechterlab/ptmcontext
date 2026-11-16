"""A page can be a top tab or, from the site file, a section: the IDRs page as the page of a question."""

from __future__ import annotations

from pathlib import Path

from ptmcontext import site as S

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _site(tab: dict) -> dict:
    return {'analyses': [{'id': 'charge'}], 'website': {'tabs': {'idrs': tab}}}


def test_a_tab_is_the_default_and_a_section_names_its_question():
    assert not [p for p in S.website_problems(_site({'label': 'IDRs'})) if 'website.tabs' in p]
    assert not [p for p in S.website_problems(_site({'as': 'section', 'question': 'charge'})) if 'website.tabs' in p]
    bad = S.website_problems(_site({'as': 'section', 'question': 'nope'}))
    assert any("website.tabs.idrs: question 'nope' is not a question" in p for p in bad)
    other = S.website_problems({'analyses': [], 'website': {'tabs': {'sites': {'as': 'section', 'question': 'x'}}}})
    assert any('only the idrs page can be a section' in p for p in other)


def test_the_kit_drops_the_tab_and_redirects_the_old_address():
    idrs = (ASSETS / 'kit-idrs.js').read_text()
    kit = (ASSETS / 'kit.js').read_text()
    assert "D.tabs?.idrs?.as === 'section'" in idrs and 'K.moved.idrs = SECTION' in idrs
    assert idrs.index('K.moved.idrs') < idrs.index('K.tabs.push(() => {')  # the tab is in the else branch
    assert 'K.moved, view' in kit and 'S.arg = K.moved[view]' in kit
