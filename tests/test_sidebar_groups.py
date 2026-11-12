"""The Sections sidebar: group headings and question families are disclosures, open only around the current page."""

from __future__ import annotations

from pathlib import Path

import yaml
from test_search import _build, _page_data, _toy

from ptmcontext import site as S

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
SITES = Path(__file__).resolve().parents[1] / 'sites'


def test_a_family_set_in_the_site_file_reaches_the_page_data(tmp_path):
    root = _toy(tmp_path)
    path = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(path.read_text())
    site['analyses'][0]['family'] = 'Toy motifs'
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.website_problems(S.load_site(path)) == []
    assert [a.get('family') for a in _page_data(_build(root))['analyses']] == ['Toy motifs']


def test_a_question_without_a_family_has_none(tmp_path):
    root = _toy(tmp_path)
    assert 'family' not in _page_data(_build(root))['analyses'][0]


def test_the_variants_of_a_question_share_a_family_in_the_site_files():
    for name, aid in (('methylarginine', 'sticker_context'), ('yeast_phospho', 'sticker_context')):
        site = S.load_site(SITES / f'{name}.yaml')
        v = [a for a in site['analyses'] if a['id'].startswith(aid)]
        assert len(v) == 4 and {a.get('family') for a in v} == {'Next to aromatic residues'}, name
    # every family has two or more questions, and the family key is in the schema
    import json

    schema = json.loads((Path(S.__file__).parent / 'schemas' / 'site.schema.json').read_text())
    assert '"family"' in json.dumps(schema)
    for p in SITES.glob('*.yaml'):
        fam = [a['family'] for a in S.load_site(p).get('analyses', []) if a.get('family')]
        assert all(fam.count(f) >= 2 for f in fam), p.name


def test_the_sidebar_opens_a_group_only_around_the_current_page():
    js = (ASSETS / 'kit-rail.js').read_text()
    # a group or family is open by the reader's choice this session, else only when it holds the current page
    assert 'key in tocOpen ? tocOpen[key] : has' in js
    assert 'sessionStorage.setItem(TOC_KEY' in js and 'aria-expanded' in js and 'aria-controls' in js
    assert 'g.kids.some(isCur)' in js and 'vs.some(isCur)' in js
    # variants are grouped by the analysis' family key, not by their titles
    assert 'A[c.analysis].family' in (ASSETS / 'kit.js').read_text()
    css = (ASSETS / 'kit.css').read_text()
    assert ".toc .tgl[aria-expanded='true'] .car::before" in css and '.toc .toc-kids[hidden]' in css


def _fam_label(title, family, own=None):
    import json
    import re
    import subprocess

    js = (ASSETS / 'kit-rail.js').read_text()
    fn = re.search(r'  function famLabel\(.*?\n  \}\n', js, re.S).group(0)
    out = subprocess.run(
        [
            'node',
            '-e',
            f'{fn}\nconsole.log(JSON.stringify(famLabel([0, {json.dumps(title)}, 1, 0, {json.dumps(family)}, {json.dumps(own)}])))',
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def test_a_family_entry_shows_only_what_differs():
    fam = 'Next to aromatic residues'
    assert _fam_label(f'{fam} (within 3)', fam) == 'within 3'
    assert _fam_label(f'{fam}, in IDRs (within 5)', fam) == 'in IDRs, within 5'
    assert _fam_label(f'{fam}: in IDRs', fam) == 'in IDRs'
    assert _fam_label('Something else', fam) == 'Something else'  # not a prefix: the title
    assert _fam_label(fam, fam) == fam  # nothing differs: the title
    assert _fam_label(f'{fam} (within 3)', fam, 'close') == 'close'  # the question's own label wins


def test_family_label_is_in_the_schema_and_reaches_the_page_data(tmp_path):
    import json

    schema = json.loads((Path(S.__file__).parent / 'schemas' / 'site.schema.json').read_text())
    assert '"family_label"' in json.dumps(schema)
    root = _toy(tmp_path)
    path = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(path.read_text())
    site['analyses'][0].update(family='Toy motifs', family_label='first')
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.website_problems(S.load_site(path)) == []
    a = _page_data(_build(root))['analyses'][0]
    assert (a['family'], a['family_label']) == ('Toy motifs', 'first')
    # the full title is untouched, and the rail names it as the entry's tooltip
    assert a['title'] == site['analyses'][0].get('title', a['title'])
    assert 'title="${esc(lab)}"' in (ASSETS / 'kit-rail.js').read_text()


def test_every_overview_section_lists_its_questions_drawn_or_not():
    kit = (ASSETS / 'kit.js').read_text()
    assert 'const later =' not in kit and 'K.ovDrawThrough' in kit
    rail = (ASSETS / 'kit-rail.js').read_text()
    # a tile of a section not drawn yet draws the section, then scrolls to the tile
    assert 'K.ovDrawThrough?.(el.dataset.jump)' in rail


def test_pages_leave_out_the_one_file_copy_and_web_still_writes_it(tmp_path):
    from ptmcontext import web

    root = _toy(tmp_path)
    index = _build(root)
    assert (index.parent / 'toy.html').exists()
    out = tmp_path / 'pub'
    web.pages([root / 'sites' / 'toy.yaml'], out, log=lambda *_: None)
    assert (out / 'toy' / 'index.html').exists() and not (out / 'toy' / 'toy.html').exists()
    assert not list(out.rglob('toy.html'))
    wf = (Path(__file__).resolve().parents[1] / '.github' / 'workflows' / 'pages.yml').read_text()
    assert (
        'actions/upload-artifact@v4' in wf
        and 'retention-days: 30' in wf
        and 'out/${{ matrix.site }}/web/${{ matrix.site }}.html' in wf
        and '!out/${{ matrix.site }}/web/${{ matrix.site }}.html' in wf
    )
