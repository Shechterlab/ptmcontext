"""Stage 3 on the toy site: a variant in the search is read as its site and says so; a front card's note reaches the
page's data; the built kit carries no cards front end. (The 3D view, the protein page's layout and the map's labels need a browser: the
Playwright checks of the stage cover them.)"""
from __future__ import annotations

import shutil

import pytest
import yaml
from node_harness import _run, toy_build
from test_search import _toy

from ptmcontext import site as S
from ptmcontext.front import resolve

node = pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
STUBS = """
K.g6 = v => (v == null ? '' : String(+Number(v).toPrecision(6)));
K.preamble = (t, w) => '# ' + t + NL + '# What: ' + w + NL;
K.selText = () => (K.sel.active() ? K.sel.describe() : 'whole dataset');
K.download = () => {};
"""


@node
def test_a_variant_in_the_search_is_read_as_its_site(tmp_path):
    index = toy_build(tmp_path)
    out = _run(tmp_path, index, """
      await K.sel.ready; K.sel.data(); await K.sel.ready;
      const r = D.residues[0], a = K.sel.parse(r + '2K'), b = K.sel.parse('P1 ' + r + '5K'), s = K.sel.select(r + '2K');
      console.log(JSON.stringify({ pos: a.positions, variants: b.variants, sites: b.sites.length, n: (s.marks || []).length, proteins: s.proteins ? s.proteins.size : 0 }));""")
    assert out['pos'] == [['R', 2, 'K']] and out['n'] == 2 and out['proteins'] == 2     # R2 of both proteins, the change not matched
    assert out['variants'] and out['variants'][0][2:] == [5, 'K'] and out['sites'] == 1  # P1 R5K: the site P1 R5, and it says so


@node
def test_a_front_cards_note_reaches_the_pages_data(tmp_path):
    root = _toy(tmp_path, with_search=False)
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['website']['front'] = {'mode': 'classic', 'cards': [{'title': 'Position', 'analyses': ['motif'], 'note': 'Association, not causation.'}]}
    assert resolve(S.load_site_from_dict(site) if hasattr(S, 'load_site_from_dict') else site)['cards'][0]['note'] == 'Association, not causation.'


@node
def test_the_built_kit_has_the_variant_download_name_and_no_cards_front_end(tmp_path):
    index = toy_build(tmp_path)
    kit = (index.parent / 'assets' / 'kit.js').read_text()
    assert 'm-columns' not in kit and 'vSlug' in kit
    assert not (index.parent / 'assets' / 'kit-front.js').exists() and not (index.parent / 'assets' / 'kit-sections.js').exists()
