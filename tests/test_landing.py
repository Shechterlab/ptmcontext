"""The landing page of `ptmc pages`: every word and colour from YAML (site files and a landing config), a card per site
that is one link and a door into it, a card without a link for a site not built yet, and a site whose outputs are missing."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from ptmcontext import site as S
from ptmcontext import web

from test_help import _toy

CFG = {
    'title': 'Toy hub',
    'description': 'Toy sites.',
    'lede': 'Many toys.',
    'intro': ['One proteome, many marks.', 'Tested within each protein.'],
    'cta': 'Open {marks} now',
    'order': ['stub', 'toya'],
    'soon': [
        {
            'id': 'stub',
            'name': 'Stub Explorer',
            'tagline': 'Stub sites.',
            'question': 'Where do stubs fall?',
            'band': ['#1e40af', '#172554'],
            'accent': '#0e7490',
        }
    ],
    'footer': {'links': [{'label': 'Cite it', 'url': 'https://example.org/cite'}], 'note': 'A footer note.'},
}


def _built(tmp_path, landing=None):
    root, a = _toy(tmp_path, 'toya')
    spec = yaml.safe_load(a.read_text())
    spec['website']['band'] = ['#112233', '#445566']
    spec['website']['landing'] = {'tagline': 'Toy tagline.', 'question': 'What can you ask?', **(landing or {})}
    a.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    S.run(a, root=root / 'data', log=lambda *_: None)
    web.build(a, log=lambda *_: None)
    return root, a


def test_the_landing_page_is_made_of_the_site_file_and_the_landing_config(tmp_path):
    root, a = _built(tmp_path)
    cfg = tmp_path / 'landing.yml'
    cfg.write_text(yaml.safe_dump(CFG))
    land = web.pages([a], tmp_path / 'site', out_root=root, log=lambda *_: None, landing_config=cfg).read_text()
    assert '<title>Toy hub</title>' in land and 'Many toys.' in land and 'Tested within each protein.' in land
    assert 'href="https://example.org/cite">Cite it' in land and 'A footer note.' in land
    # the live card: name, hook, question, numbers, the site's band, the button from the config's format
    assert 'Toy toya' in land and 'Toy tagline.' in land and 'What can you ask?' in land
    assert '--c1:#112233;--c2:#445566' in land and 'Open methylarginines now' in land
    assert '<dl class="nums">' in land and '<dt>proteins</dt>' in land
    # the coming-soon card, from the config: its colors, no link; the config's order puts it first
    assert 'Stub Explorer' in land and '--c1:#1e40af;--c2:#172554;--ac:#0e7490' in land and 'Coming soon' in land
    assert land.index('Stub Explorer') < land.index('Toy toya')


def test_a_card_is_one_link_with_a_label_and_a_soon_card_has_none(tmp_path):
    root, a = _built(tmp_path)
    cfg = tmp_path / 'landing.yml'
    cfg.write_text(yaml.safe_dump(CFG))
    land = web.pages([a], tmp_path / 'site', out_root=root, log=lambda *_: None, landing_config=cfg).read_text()
    cards = re.findall(
        r'<article class="land-card (live|soon)"[^>]*aria-labelledby="(card-[^"]+)".*?</article>', land, re.S
    )
    assert [c[0] for c in cards] == ['soon', 'live']
    for art in re.findall(r'<article.*?</article>', land, re.S):
        links = re.findall(r'<a [^>]*href="([^"]+)"', art)
        assert links == (['toya/'] if 'class="land-card live"' in art else [])
        assert re.search(r'id="card-\w+"', art)
    assert not re.search(r'<a [^>]*>(?:(?!</a>).)*<a ', land, re.S)
    assert ':has(a:focus-visible)' in land and 'inset: 0' in land  # visible focus, the whole card a target
    assert 'aria-disabled="true"' in land and 'prefers-color-scheme: dark' in land and 'prefers-reduced-motion' in land


def test_a_site_without_outputs_is_left_out_or_named_and_the_page_still_builds(tmp_path):
    root, a = _built(tmp_path)
    _, b = _toy(tmp_path, 'toyb')  # never run or built
    warnings = []
    land = web.pages([a, b], tmp_path / 'site', out_root=root, log=warnings.append, skip_missing=True).read_text()
    assert land.count('class="land-card live"') == 1 and any('toyb' in w and 'warning' in w for w in warnings)
    try:
        web.pages([a, b], tmp_path / 'site2', out_root=root, log=lambda *_: None)
        raise AssertionError('a missing site must stop a build without --skip-missing')
    except FileNotFoundError:
        pass
    # every site missing: still a page, no stylesheet of a site that is not there
    only = web.pages([b], tmp_path / 'site3', out_root=root, log=lambda *_: None, skip_missing=True).read_text()
    assert '<main' in only and 'land-card live' not in only.split('</style>')[1] and 'assets/kit.css' not in only


def test_a_build_without_glance_or_run_files_gives_a_card_without_numbers(tmp_path):
    root, a = _built(tmp_path)
    out = root / 'out' / 'toya'
    (out / 'web' / 'glance.json').unlink()
    (out / 'run.json').unlink()
    land = web.pages([a], tmp_path / 'site', out_root=root, log=lambda *_: None).read_text()
    assert 'Toy toya' in land and '<dl class="nums">' not in land and 'Strongest result' not in land


def test_the_landing_config_is_read_from_beside_the_first_site_file(tmp_path):
    root, a = _built(tmp_path)
    (a.parent / 'landing.yml').write_text(yaml.safe_dump({'title': 'Beside hub'}))
    land = web.pages([a], tmp_path / 'site', out_root=root, log=lambda *_: None).read_text()
    assert '<title>Beside hub</title>' in land


def test_no_site_or_mark_specific_literal_in_the_landing_code():
    src = (Path(web.__file__).parent / 'landing.py').read_text()
    pages_src = Path(web.__file__).read_text()
    pages_src = pages_src[pages_src.index('def pages(') :]
    for text in (src, pages_src):
        assert not re.search(r'#[0-9a-fA-F]{6}', text)  # no colour: bands and accents are the site files'
        assert not re.search(r'methyl|arginine|lysine|phospho|yeast|Shechter', text, re.I)


def test_cards_go_in_the_group_their_site_file_names(tmp_path):
    root, a = _built(tmp_path)
    _, b = _toy(tmp_path, 'toyb')
    spec = yaml.safe_load(b.read_text())
    spec['website']['landing'] = {'group': 'other'}
    b.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    S.run(b, root=root / 'data', log=lambda *_: None)
    web.build(b, log=lambda *_: None)
    cfg = tmp_path / 'landing.yml'
    cfg.write_text(
        yaml.safe_dump(
            {**CFG, 'groups': [{'id': 'main'}, {'id': 'other', 'title': 'Other organisms', 'compact': True}]}
        )
    )
    land = web.pages([a, b], tmp_path / 'site', out_root=root, log=lambda *_: None, landing_config=cfg).read_text()
    sections = re.findall(r'<section class="land-group".*?</section>', land, re.S)
    assert len(sections) == 2 and 'Other organisms' not in sections[0] and 'Other organisms' in sections[1]
    assert 'class="sites compact"' in sections[1] and 'href="toyb/"' in sections[1] and 'href="toya/"' in sections[0]
    assert 'Stub Explorer' in sections[0]  # a card without a group goes in the first


def test_the_logo_comes_from_the_site_file_to_the_header_the_favicon_and_the_cards(tmp_path):
    root, a = _toy(tmp_path, 'toya')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#123456"/></svg>'
    (root / 'art').mkdir()
    (root / 'art' / 'toya_logo.svg').write_text(svg)
    (root / 'art' / 'hub_logo.svg').write_text(svg.replace('123456', '654321'))
    spec = yaml.safe_load(a.read_text())
    spec['website']['logo'] = 'art/toya_logo.svg'
    spec['website']['switcher'] = {'label': 'Mod'}
    a.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    S.run(a, root=root / 'data', log=lambda *_: None)
    web.build(a, log=lambda *_: None)
    out = root / 'out' / 'toya' / 'web'
    assert (out / 'assets' / 'logo.svg').read_text() == svg
    page = (out / 'index.html').read_text()
    assert '<link rel="icon" href="assets/logo.svg">' in page and 'class="site-mark" src="assets/logo.svg"' in page
    cfg = tmp_path / 'landing.yml'
    cfg.write_text(yaml.safe_dump({**CFG, 'logo': 'art/hub_logo.svg'}))
    land = web.pages([a], tmp_path / 'site', out_root=root, log=lambda *_: None, landing_config=cfg).read_text()
    assert 'class="card-logo" src="toya/assets/logo.svg"' in land  # the live card's logo, from its site's build
    assert '<link rel="icon" href="logo.svg">' in land and 'class="site-mark" src="logo.svg"' in land
    assert (tmp_path / 'site' / 'logo.svg').read_text().count('654321') == 1
    import json

    assert json.loads((tmp_path / 'site' / 'sites.json').read_text())['switcher_label'] == 'Mod'  # the site file's word


def test_the_landing_search_index_lists_each_protein_with_its_sites(tmp_path):
    import json

    root, a = _built(tmp_path)
    cfg = tmp_path / 'landing.yml'
    cfg.write_text(yaml.safe_dump(CFG))
    land = web.pages([a], tmp_path / 'site', out_root=root, log=lambda *_: None, landing_config=cfg).read_text()
    idx = json.loads((tmp_path / 'site' / 'proteins.json').read_text())
    assert [s['id'] for s in idx['sites']] == ['toya'] and idx['p']
    acc, gene, name, sites = idx['p'][0]
    assert acc and sites == [0]
    # the box, its results and the script are on the page
    assert 'id="land-q"' in land and 'id="land-hits"' in land and "fetch('proteins.json')" in land


def test_the_compact_bar_options_reach_the_page_and_are_checked(tmp_path):
    import json

    import pytest

    root, a = _built(tmp_path)
    spec = yaml.safe_load(a.read_text())
    spec['website']['header'] = {'scroll_bar': True, 'bar': ['home', 'search', 'summary']}
    a.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    assert S.website_problems(S.load_site(a)) == []
    S.run(a, root=root / 'data', log=lambda *_: None)
    page = web.build(a, log=lambda *_: None).read_text()
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    assert data['header']['bar'] == ['home', 'search', 'summary'] and data['header']['scroll_bar'] is True
    # the kit draws the bar's parts from that list
    kit = (Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets' / 'kit.js').read_text()
    assert 'dock-search' in kit and 'dock-sel' in kit and 'HDR.bar' in kit
    spec['website']['header']['bar'] = ['nothing']
    a.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    with pytest.raises(Exception):
        S.load_site(a)
