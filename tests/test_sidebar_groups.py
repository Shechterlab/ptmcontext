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
