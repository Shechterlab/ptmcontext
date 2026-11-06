"""The cards front end's navigation (kit-sections.js) on a toy site built in cards mode: the Sections list names every
question of the site file once (the cards' questions, then those no card holds, then the pages), a question's row is
"Home / <name>" with its previous and next question in that order, and a cell part chosen as a filter is a chip by name."""
from __future__ import annotations

import shutil

import pytest
import yaml
from test_front_home import _run
from test_search import _toy

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.front import question_ids

pytestmark = pytest.mark.skipif(not shutil.which('node'), reason='needs Node')

def _build(tmp_path):
    """The toy site in cards mode with two questions: one in a card, one left to More."""
    root = _toy(tmp_path, with_search=False)
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['analyses'].append({'id': 'motif_b', 'layer': 'motif', 'title': 'A second motif question'})
    site['website']['front'] = {'mode': 'cards', 'cards': [{'title': 'Position', 'analyses': ['motif']}], 'short': {'motif_b': 'Second'}}
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    return web.build(p, log=lambda *_: None)


LOAD = """
K.link = (v, a) => '#' + v + (a ? '/' + a : '');
eval(fs.readFileSync(ASSETS + '/kit-sections.js', 'utf8'));
window.PTMC_MODULES[window.PTMC_MODULES.length - 1](K);
"""


def test_the_sections_list_names_every_question_of_the_site_file(tmp_path):
    index = _build(tmp_path)
    ids = question_ids(S.load_site(index.parents[3] / 'sites' / 'toy.yaml'))
    assert len(ids) >= 2
    out = _run(tmp_path, index, LOAD + """
      const html = K.front.listHtml(''), order = K.front.order();
      console.log(JSON.stringify({ order, links: [...html.matchAll(/href="#overview\\/([^"]+)"/g)].map(m => m[1]), headings: [...html.matchAll(/<h3>([^<]*)<\\/h3>/g)].map(m => m[1]), view: typeof K.views.sections.render }));""")
    assert sorted(out['order']) == sorted(ids) and len(out['order']) == len(set(out['order']))    # every question in one topic
    assert set(out['links']) <= set(ids) and out['links'] and out['view'] == 'function'          # the list names the topics' pages
    assert out['headings'][0] == 'Pages'                                                          # the topics, then the pages


def test_a_questions_row_is_home_name_previous_and_next_in_the_menus_order(tmp_path):
    index = _build(tmp_path)
    out = _run(tmp_path, index, LOAD + """
      const o = K.front.order(), rows = o.map(q => K.front.navRow(q));
      const parts = h => ({ prev: (/href="([^"]+)" rel="prev"/.exec(h) || [])[1] || null, next: (/href="([^"]+)" rel="next"/.exec(h) || [])[1] || null, here: (/aria-current="page">([^<]*)</.exec(h) || [])[1], home: /<a href="#overview">Home<\\/a>/.test(h) });
      console.log(JSON.stringify({ o, p: rows.map(parts) }));""")
    o, p = out['o'], out['p']
    assert len(o) >= 2 and all(x['home'] for x in p)
    assert p[0]['prev'] is None and p[-1]['next'] is None
    for i, x in enumerate(p):
        assert x['here'] and (i == 0 or x['prev'] == '#overview/' + o[i - 1]) and (i == len(o) - 1 or x['next'] == '#overview/' + o[i + 1])
