"""Round-4 fixes: a set typed in full opens the larger set, two sets of a group never share a name, the card's counts agree
with the site table, the card leads with residue evidence, the sites table opens in position order."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'
SITES = Path(web.__file__).parents[2] / 'sites'


def _src(name):
    return (ASSETS / name).read_text()


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_name_typed_in_full_ranks_the_larger_set_first_and_names_stay_distinct():
    script = f"""
global.window = global;
const raw = {{ sources: [{{ key: 'p:c', group: 'Condensates' }}, {{ key: 'p:o', group: 'Organelle IP' }}],
  terms: [[0, 'SMALL', 'Stress granule', 1], [0, 'BIG', 'Stress granule (CD-CODE)', 768], [1, 'og', 'Stress granule (organelle IP)', 144]] }};
let K = {{ D: {{ term_index: null }} }};
window.PTMC_MODULES = []; eval({json.dumps(_src('kit-terms.js'))}); window.PTMC_MODULES[0](K);
const ix = K.terms.prepare(raw);
const top = K.terms.rank(ix, 'stress granule').map((h) => h.t.id + '=' + h.t.name);
console.log(JSON.stringify(top));
"""
    out = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout
    top = json.loads(out)
    assert top[0] == 'BIG=Stress granule (CD-CODE)'
    names = [t.split('=', 1)[1] for t in top]
    assert len(names) == len(set(names))
    assert 'SMALL=Stress granule (CD-CODE SMALL)' in top


def test_the_card_counts_tumors_as_the_site_table_does_and_adds_them_to_the_variants_line():
    js = _src('kit-sitecard.js')
    assert 'function sampleCounts' in js and 'K.prop.at(acc, s.id, pos, true)' in js
    assert 'without hypermutated: ' in js
    assert 'vc.line(c.tb, c.acc, c.pos, true)' in js and 'hasChanges' in js
    assert 'CCN.filter((x) => changesAt(tb, x, pos).length)' in js


def test_the_card_leads_with_residue_evidence_and_keeps_the_structures_closed():
    js = _src('kit-sitecard.js')
    body = js[js.index('function evidenceBlock') :]
    body = body[: body.index('</section>')]
    assert body.index('around(c)') < body.index('spanning(c)') < body.index('wholeProtein(c)')
    assert 'entries(c) +' not in body
    assert '<details class="sp-more"><summary>Structures' in js
    assert 'WR.partners' in js and 'sg.none' not in js


def test_the_sites_table_opens_in_position_order_and_the_writer_header_marks_no_source():
    st = _src('kit-sitetable.js')
    assert "const ST = { key: 'site', dir: 1 }" in st
    for name in ('kit-sitetable.js', 'kit-sites.js'):
        assert "role_labels?.writer || 'Writer'" in _src(name)
    ph = yaml.safe_load((SITES / 'phospho.yaml').read_text())
    assert ph['website']['protein']['card']['role_labels']['writer'] == 'Kinase'


def test_phospho_marks_are_named_pS_pT_pY_on_the_map_and_the_landing_art():
    assert re.search(r'^short: "pS/pT/pY"', (SITES / 'marks' / 'phospho.yaml').read_text(), re.MULTILINE)
    svg = (SITES / 'art' / 'phospho-hero.svg').read_text()
    assert '>pS</text>' in svg and '>Sph</text>' not in svg


def test_the_landing_example_opens_the_variants():
    assert 'R213?open=sc-variants' in (SITES / 'landing.yml').read_text()


def test_a_long_tick_label_moves_left_or_is_cut_rather_than_dropped():
    js = _src('kit-map.js')
    assert 'more`);' in js and 'for (const flip of rightFirst' in js
