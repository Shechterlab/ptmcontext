"""The cards front end, stage 3, on the toy site: a card's table says which test, n, p and q, the interval, the data version
and the selection; a variant in the search is read as its site and says so; "Any condensate" for a set filter on every set;
a card's note reaches the page's data. (The 3D view, the protein page's layout and the map's labels need a browser: the
Playwright checks of the stage cover them.)"""
from __future__ import annotations

import shutil

import pytest
import yaml
from test_front_home import _cards_build, _run
from test_search import _toy

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.front import resolve

node = pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
STUBS = """
K.g6 = v => (v == null ? '' : String(+Number(v).toPrecision(6)));
K.preamble = (t, w) => '# ' + t + NL + '# What: ' + w + NL;
K.selText = () => (K.sel.active() ? K.sel.describe() : 'whole dataset');
K.download = () => {};
"""


@node
def test_a_cards_table_carries_the_test_n_p_q_interval_version_and_selection(tmp_path):
    index = _cards_build(tmp_path)
    out = _run(tmp_path, index, STUBS + """
      K.front.home();
      const tsv = K.front.cardTsv(K.front.cards[0].key), lines = tsv.split(NL).filter(l => !l.startsWith('#') && l);
      console.log(JSON.stringify({ head: lines[0].split(TAB), rows: lines.slice(1).map(l => l.split(TAB)) }));""")
    head = out['head']
    for need in ('test', 'measure', 'value', 'ci_low', 'ci_high', 'n', 'p', 'q', 'data_version', 'selection'):
        assert need in head
    assert out['rows'] and all(len(r) == len(head) for r in out['rows'])
    i = head.index('test')
    assert all('Mantel-Haenszel' in r[i] or 'Fisher' in r[i] or 'hypergeometric' in r[i] for r in out['rows'])
    assert all(r[head.index('selection')] == 'whole dataset' for r in out['rows'])


@node
def test_a_variant_in_the_search_is_read_as_its_site(tmp_path):
    index = _cards_build(tmp_path)
    out = _run(tmp_path, index, """
      await K.sel.ready; K.sel.data(); await K.sel.ready;
      const r = D.residues[0], a = K.sel.parse(r + '2K'), b = K.sel.parse('P1 ' + r + '5K'), s = K.sel.select(r + '2K');
      console.log(JSON.stringify({ pos: a.positions, variants: b.variants, sites: b.sites.length, n: (s.marks || []).length, proteins: s.proteins ? s.proteins.size : 0 }));""")
    assert out['pos'] == [['R', 2, 'K']] and out['n'] == 2 and out['proteins'] == 2     # R2 of both proteins, the change not matched
    assert out['variants'] and out['variants'][0][2:] == [5, 'K'] and out['sites'] == 1  # P1 R5K: the site P1 R5, and it says so


@node
def test_a_filter_on_every_set_is_any_not_a_star(tmp_path):
    index = _cards_build(tmp_path)
    out = _run(tmp_path, index, """
      console.log(JSON.stringify({ any: K.front.chipLabel('p:motif', ['*']), one: K.front.chipLabel('a:motif', ['x']) }));""")
    assert out['any'].startswith('Any ') and '*' not in out['any'] and not out['one'].startswith('Any')


def test_a_cards_note_reaches_the_pages_data(tmp_path):
    root = _toy(tmp_path, with_search=False)
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['website']['front'] = {'mode': 'cards', 'cards': [{'title': 'Position', 'analyses': ['motif'], 'note': 'Association, not causation.'}]}
    assert resolve(S.load_site_from_dict(site) if hasattr(S, 'load_site_from_dict') else site)['cards'][0]['note'] == 'Association, not causation.'


@node
def test_the_built_kit_has_the_methods_dictionary_and_the_variant_download_name(tmp_path):
    index = _cards_build(tmp_path)
    kit = (index.parent / 'assets' / 'kit.js').read_text()
    assert 'm-columns' in kit and 'data_version' in kit and 'vSlug' in kit
    assert web is not None
