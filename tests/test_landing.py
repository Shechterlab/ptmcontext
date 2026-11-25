"""The landing page of `ptmc pages`: every word and colour from YAML (site files and a landing config), a card per site
that is one link and a door into it, a card without a link for a site not built yet, and a site whose outputs are missing."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.web import landing as LP

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
    'license': 'Data: toy license (non-commercial).',
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
    assert (
        '<p class="land-license">Data: toy license (non-commercial).</p>' in land
    )  # the license line, from the config
    # the live card: name, hook, numbers, the site's band, the button from the config's format; no question line and
    # no strongest result unless the config's `card` switches them on
    assert 'Toy toya' in land and 'Toy tagline.' in land
    assert 'What can you ask?' not in land and 'Where do stubs fall?' not in land
    assert 'class="ask"' not in land and 'class="result"' not in land and 'Strongest result' not in land
    assert '--c1:#112233;--c2:#445566' in land and 'Open methylarginines now' in land
    assert '<dl class="nums">' in land and '<dt>proteins</dt>' in land
    # the coming-soon card, from the config: its colors, no link; the config's order puts it first
    assert 'Stub Explorer' in land and '--c1:#1e40af;--c2:#172554;--ac:#0e7490' in land and 'Coming soon' in land
    assert land.index('Stub Explorer') < land.index('Toy toya')
    # the sites' header reads the title as its brand line (a link to this page), from the registry beside the folders
    import json

    reg = json.loads((tmp_path / 'site' / 'sites.json').read_text())
    assert reg['brand'] == 'Toy hub'
    kit = (Path(web.__file__).parent / 'assets' / 'kit-switch.js').read_text()
    assert "className = 'brand-line'" in kit and 'reg.brand' in kit and "a.textContent = 'All explorers'" in kit


def test_the_card_switches_bring_back_the_question_and_the_strongest_result(tmp_path):
    root, a = _built(tmp_path)
    cfg = tmp_path / 'landing.yml'
    cfg.write_text(yaml.safe_dump({**CFG, 'card': {'question': True, 'result': True}}))
    land = web.pages([a], tmp_path / 'site', out_root=root, log=lambda *_: None, landing_config=cfg).read_text()
    assert 'What can you ask?' in land and 'Where do stubs fall?' in land and 'class="ask"' in land
    # the result block itself, as the card draws it from a finding
    from ptmcontext.web import landing as LP

    c = {
        'id': 'x',
        'name': 'X',
        'cta': 'Go',
        'result': LP._result({'findings': [{'eff': 4.0, 'dir': 'more', 'label': 'L'}]}),
    }
    assert 'Strongest result' not in LP.card(c, {}) and 'Strongest result' in LP.card(c, {'card': {'result': True}})


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
    spec['website']['favicon'] = 'art/toya_favicon.svg'
    (root / 'art' / 'toya_favicon.svg').write_text(svg.replace('123456', '0a0b0c'))
    a.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    web.build(a, log=lambda *_: None)  # a bolder favicon: the tab icon only, the header keeps the logo
    page = (out / 'index.html').read_text()
    assert '<link rel="icon" href="assets/favicon.svg">' in page and 'class="site-mark" src="assets/logo.svg"' in page
    assert '0a0b0c' in (out / 'assets' / 'favicon.svg').read_text()
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
    acc, gene, name, sites, *names = idx['p'][0]  # names: the genes and symbols, only where there are any
    assert acc and sites == [0]
    assert idx['sites'][0][
        'residues'
    ]  # the residues of the site's mark: the search offers the explorers that fit a typed one
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


def test_the_mark_takes_one_dot_per_card_in_its_band_colour():
    from ptmcontext.web import landing as LP

    cards = [{'vars': '--c1:#155e75;--c2:#0f3b47'}, {'vars': '--c1:#5b21b6;--c2:#3b0764'}, {'vars': ''}]
    cols = [LP.card_colour(c) for c in cards]
    assert cols == ['#155e75', '#5b21b6', None]
    tpl = '<svg><circle r="20"/><g id="dots" stroke="#fff"><circle cx="19" cy="29" r="4.3" fill="#000"/><circle cx="39" cy="29" r="4.3" fill="#000"/></g></svg>'
    svg = LP.logo_with_dots(tpl, cols)
    assert svg.count('<circle') == 1 + 2 and '#155e75' in svg and '#5b21b6' in svg and '#000' not in svg
    assert LP.logo_with_dots(tpl, [None]) == tpl  # no card colour: the template's own dots stay


def test_the_mark_dots_fit_the_lens_for_one_to_six_cards():
    from ptmcontext.web import landing as LP

    tpl = '<svg><g id="dots"><circle cx="1" cy="1" r="1" fill="#000"/></g></svg>'
    sizes = []
    for n in range(1, 7):
        svg = LP.logo_with_dots(tpl, ['#155e75'] * n)
        pts = [
            (float(x), float(y), float(r)) for x, y, r in re.findall(r'cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"', svg)
        ]
        assert len(pts) == n and all(((x - 29) ** 2 + (y - 29) ** 2) ** 0.5 + r <= 17.05 for x, y, r in pts)
        sizes.append(pts[0][2])
    assert sizes[3] >= 5.9 and sizes == sorted(sizes, reverse=True)  # four dots, each larger than the old 4.3


def test_the_whole_card_is_the_link_target():
    """The title link's ::after covers the card only if nothing between it and the article is positioned: a positioned
    band confined the target to the band, so the call to action and the body did nothing."""
    css = LP.CSS
    assert '.land-card .band { position: relative' not in css
    assert ".land-card h2 a::after { content: ''; position: absolute; inset: 0;" in css


def test_the_scope_and_license_lines_come_from_the_site_file(tmp_path):
    root, a = _toy(tmp_path, 'toyb')
    spec = yaml.safe_load(a.read_text())
    spec['website']['scope'] = 'Holds toy sites. It does not hold toy levels.'
    spec['website']['license'] = 'Data: toy license.'
    a.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    S.run(a, root=root / 'data', log=lambda *_: None)
    web.build(a, log=lambda *_: None)
    page = next((root / 'out').rglob('index.html')).read_text()
    assert '<p class="lede-scope">Holds toy sites. It does not hold toy levels.</p>' in page
    assert '"license":"Data: toy license."' in page.replace('": "', '":"')
    kit = (Path(web.__file__).parent / 'assets' / 'kit.js').read_text()
    assert 'class="dl-license"' in kit and 'D.license' in kit


WN = {
    'title': 'What’s new in each data release',
    'releases': [
        {'title': 'Toy_Pipeline v2.0 data release (2026-02-02)', 'items': ['Newer thing.'], 'doi': '10.1/new'},
        {'title': 'Toy_Pipeline v1.0 data release (2026-01-01)', 'items': ['Older thing.']},
    ],
}


def test_whats_new_is_a_closed_disclosure_at_the_foot_with_one_entry_per_data_release(tmp_path):
    root, a = _built(tmp_path)
    cfg = tmp_path / 'landing.yml'
    cfg.write_text(yaml.safe_dump({**CFG, 'whats_new': WN}))
    land = web.pages([a], tmp_path / 'site', out_root=root, log=lambda *_: None, landing_config=cfg).read_text()
    assert '<details class="land-new"><summary>What’s new in each data release</summary>' in land
    assert '<details class="land-new" open' not in land
    new, old = land.index('Toy_Pipeline v2.0 data release (2026-02-02)'), land.index('Toy_Pipeline v1.0 data release')
    assert new < old  # newest first, as written
    assert land.index('Toy toya') < land.index('class="land-new"') < land.index('</main>')  # below the cards
    assert 'href="https://doi.org/10.1/new"' in land
    assert LP.whats_new(None) == {'title': 'What’s new', 'releases': []}


def test_an_older_whats_new_block_is_one_release_and_a_site_help_reads_the_same_list():
    one = LP.whats_new({'title': 'What’s new in v1', 'items': ['A.'], 'doi': '10.1/x'})
    assert one['releases'] == [{'title': 'What’s new in v1', 'items': ['A.'], 'doi': '10.1/x'}]
    assert LP.whats_new(WN)['releases'][1]['doi'] == ''
    help_js = (Path(web.__file__).parent / 'assets' / 'kit-help.js').read_text()
    assert 'D.whats_new' in help_js and 'WN?.releases' in help_js and '<details${n > 4' in help_js
    for site in ('methylarginine', 'methyllysine', 'lysine', 'phospho'):
        spec = yaml.safe_load((Path(__file__).resolve().parents[1] / 'sites' / f'{site}.yaml').read_text())
        mine = [r['title'] for r in LP.whats_new(spec['website']['whats_new'])['releases']]
        land = [
            r['title']
            for r in LP.whats_new(
                yaml.safe_load((Path(__file__).resolve().parents[1] / 'sites' / 'landing.yml').read_text())['whats_new']
            )['releases']
        ]
        assert mine == land and all('data release (' in t for t in land)


def test_the_license_lines_name_the_commercial_contact_and_no_new_badge_is_drawn():
    root = Path(__file__).resolve().parents[1]
    lines = [yaml.safe_load((root / 'sites' / 'landing.yml').read_text())['license']]
    for site in ('methylarginine', 'methyllysine', 'lysine', 'phospho'):
        lines.append(yaml.safe_load((root / 'sites' / f'{site}.yaml').read_text())['website']['license'])
    assert all('For commercial use, contact info@shechterlab.org' in x for x in lines)
    assets = root / 'ptmcontext' / 'web' / 'assets'
    assert not [f.name for f in assets.glob('kit*') if 'newtag' in f.read_text()]


def test_the_landing_search_reads_a_site_as_the_explorers_do_and_offers_the_fitting_explorers():
    import json
    import subprocess

    assets = Path(__file__).parent.parent / 'ptmcontext' / 'web' / 'assets'
    names = (assets / 'kit-names.js').read_text()
    search = (assets / 'land-search.js').read_text()
    # the notations come from the one shared module, which the explorers' search also calls
    assert 'PTMNames.siteOf' in (assets / 'kit-select.js').read_text()
    assert 'N.siteOf(' in search and 'N.read(' in search and 'N.exact(' in search
    assert 'Searched the first name only' not in search and 'choose a site' not in search
    script = (
        "const window = {}; const known = (n) => (['H4', 'TP53'].includes(n.toUpperCase()) ? { n } : null);"
        + names
        + 'const N = window.PTMNames; const f = (t) => { const s = N.siteOf(t, known); return s && [s.name, s.letter, s.pos]; };'
        "console.log(JSON.stringify(['H4R3', 'TP53-R213', 'TP53_R213', 'TP53/213', 'TP53:R213', 'XYZR3', 'TP53'].map(f)"
        '.concat([N.pos("R213"), N.pos("213"), N.pos("B3"), N.pos("TP53")])));'
    )
    out = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout
    assert json.loads(out) == [
        ['H4', 'R', 3],
        ['TP53', 'R', 213],
        ['TP53', 'R', 213],
        ['TP53', '', 213],
        ['TP53', 'R', 213],
        None,
        None,
        {'letter': 'R', 'pos': 213},
        {'letter': '', 'pos': 213},
        None,
        None,
    ]


def test_a_phrase_with_a_name_and_a_site_is_that_site_and_a_list_needs_two_names_and_no_site():
    import json
    import subprocess

    assets = Path(__file__).parent.parent / 'ptmcontext' / 'web' / 'assets'
    names = (assets / 'kit-names.js').read_text()
    script = (
        "const window = {}; const known = (n) => (['H4', 'TP53', 'FUS', 'EWSR1', 'AKT1'].includes(n.toUpperCase()) ? { n } : null);"
        + names
        + "const r = (t) => { const x = window.PTMNames.read(t.split(' '), known); return x && (x.site ? ['site', x.site.name, x.site.letter + x.site.pos] : x.list ? ['list', ...x.list] : ['one', x.one.name]); };"
        "console.log(JSON.stringify(['TP53 R213 mutation methylation', 'AKT1 T308 phosphorylation', 'FUS EWSR1 TAF15', "
        "'FUS EWSR1 R3', 'TP53 mutation', 'mutation methylation', 'H4 R3'].map(r)));"
    )
    out = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout
    assert json.loads(out) == [
        ['site', 'TP53', 'R213'],
        ['site', 'AKT1', 'T308'],
        ['list', 'FUS', 'EWSR1'],
        ['site', 'FUS', 'R3'],
        ['one', 'TP53'],
        None,
        ['site', 'H4', 'R3'],
    ]


def test_a_search_naming_a_site_is_carried_only_where_it_means_something():
    assets = Path(__file__).parent.parent / 'ptmcontext' / 'web' / 'assets'
    kit, sel, sw = [(assets / f).read_text() for f in ('kit.js', 'kit-select.js', 'kit-switch.js')]
    # the one place a link carries q (kit.js carry, which K.link and K.card.protRef use) and the explorer switcher ask qFor
    assert 'K.sel.qFor(S.q, { segs' in kit and 'qFor(S.q, { segs, residues' in sw
    assert 'function qFor(' in sel and 'qFor,' in sel
