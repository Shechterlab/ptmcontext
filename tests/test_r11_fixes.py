"""Round-11 fixes: the sites table names its count columns in words."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'
ROOT = Path(web.__file__).parents[2]


def _src(name):
    return (ASSETS / name).read_text()


def test_the_sites_table_names_its_count_column_by_the_count_noun_not_k():
    st = _src('kit-sitetable.js')
    assert "sub: 'k'" not in st
    assert 'sub: noun(s)' in st
    assert '>k: ' not in st and 'st-note">k:' not in st
    assert '(k: samples' not in st


def test_the_cancer_card_is_two_cards_and_the_old_fold_id_opens_the_mutations_card():
    pc = _src('kit-pcards.js')
    assert "'p-dependency', 'Cancer cell dependency (DepMap)'" in pc
    assert "'p-mutations', 'Mutations in tumors and cell lines'" in pc
    assert "'p-depmap': 'p-mutations'" in _src('kit-openlink.js')
    assert "'p-depmap': 'p-mutations'" in _src('kit-proteins.js')
    for site in ('methylarginine', 'methyllysine', 'lysine', 'phospho'):
        prot = yaml.safe_load((ROOT / 'sites' / f'{site}.yaml').read_text())['website']['protein']
        folds = [f for g in prot['groups'] for f in g['folds']]
        assert 'p-depmap' not in prot['order'] and 'p-depmap' not in folds, site
        assert folds.index('p-mutations') + 1 == folds.index('p-germline') > folds.index('p-dependency'), site
        assert prot['cards']['dependency']['title'] == 'Cancer cell dependency (DepMap)', site


def test_compared_with_is_printed_once_in_a_group_of_the_compare_table():
    js = _src('land-compare.js')
    assert 'onlyGroup && !seen.cw' in js and 'const seen = { cw: false }' in js


def test_the_all_tests_question_list_follows_the_overview_order_and_names_a_cell_map_once():
    js = _src('kit.js')
    assert 'methodOrder()\n        .filter((a) => !K.listHides(a))' in js
    assert '[...D.analyses.map(' not in js and '...D.analyses.map((a) => [a.id, a.title])' not in js
    assert 'K.listTitle = ' in js and 'K.regionsOf = ' in js


def test_the_protein_sets_list_follows_the_overview_order_and_lists_a_question_once():
    pr = _src('kit-proteins.js')
    assert 'K.questionOrder()' in pr and '!K.listHides(a)' in pr
    assert 'ctxNames' not in _src('kit-pfolds.js')


def test_the_mutations_page_lists_every_site_from_the_waterfall_file_until_a_selection_needs_the_marks():
    mu = _src('kit-mutations.js')
    assert 'const lean = () => !K.sel.active() && PR.wf?.known;' in mu
    assert 'if (!lean() && !K.sel.data())' in mu
    prop = (ROOT / 'ptmcontext' / 'web' / 'propensity.py').read_text()
    assert "wf['known'] = {" in prop and "'known': True" in prop


def _hover(html_text, html=True):
    js = _src('kit.js')
    block = js[js.index('const HOVER_MAX') : js.index('(window.PTMC_MODULES || []).forEach((f) => f(K));')]
    script = f'const K = {{}}; {block}\nconsole.log(JSON.stringify(K.shortHover({json.dumps(html_text)}, {str(html).lower()})));'
    return json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_hover_over_forty_words_keeps_its_first_lines_and_footer_and_a_short_one_is_unchanged():
    short = '<b>R3</b><br>Nucleus<br><span class="muted">Click for details</span>'
    assert _hover(short) == short
    long = (
        '<b>Nucleolus</b>: 58% of 256 proteins have at least one methylarginine'
        '<br>+14 percentage points from 44% among all mapped proteins; effect +0.2 (small), OR 1.5, z +4.7, q 3e-24 '
        'and a good many more words that go on and on and on, with more detail than a hover should hold'
        '<br>Human Cell Map: 58% (141 of 244); effect +0.2, OR 1.45 (1.12-1.88), z +2.7, phi 15.70'
        '<br><span class="muted">Click to select these proteins</span>'
    )
    out = _hover(long)
    words = len(re.findall(r"[A-Za-z0-9][\w'’-]*", re.sub(r'<[^>]*>', ' ', out)))
    assert words <= 40 and out.startswith('<b>Nucleolus</b>') and out.endswith('Click to select these proteins</span>')
    assert 'Human Cell Map' not in out and '+14 percentage points from 44% among all mapped proteins' in out
    title = '\n'.join(['· TCGA', '12 tumors; 15 in all', 'observed/expected 0.25 · q 1.00', 'x ' * 40, 'last line'])
    cut = _hover(title, False)
    assert cut.startswith('· TCGA\n12 tumors') and 'last line' not in cut


def test_the_3d_toggle_stops_saying_searching_when_the_scan_ends_for_any_reason():
    js = _src('kit-3d.js')
    assert "if (T.mol !== shown || (shown && shown.mode !== 'af')) return paintSrc();" in js
    assert 'if (T.acc === acc) paintSrc(); // the toggle stops saying it is searching' in js


def test_the_mutations_page_has_no_dangling_showing_all_line():
    assert 'Showing all' not in _src('kit-mutations.js')


def test_the_rail_names_are_one_vocabulary_and_the_enzyme_groups_sit_under_one_heading():
    for site in ('methylarginine', 'methyllysine', 'lysine', 'phospho'):
        y = yaml.safe_load((ROOT / 'sites' / f'{site}.yaml').read_text())
        names = [g['name'] for g in y['website']['filters']]
        assert 'Protein interactions' not in names and 'Databases' not in names, site
        assert 'Studies and databases' in names, site
        assert {a.get('section') for a in y['analyses']} - {'Protein interactions'}, site
        assert 'Protein interactions' not in {a.get('section') for a in y['analyses']}, site
    ma = yaml.safe_load((ROOT / 'sites' / 'methylarginine.yaml').read_text())['website']['filters']
    ph = yaml.safe_load((ROOT / 'sites' / 'phospho.yaml').read_text())['website']['filters']
    assert [g['name'] for g in ma if g.get('heading') == 'Enzymes and readers'] == [
        'PRMT inhibitors, knockouts and knockdowns'
    ]
    assert [g['name'] for g in ph if g.get('heading') == 'Enzymes and readers'] == ['Kinase motifs', 'Reader motifs']
    assert 'g.heading && gs[gi - 1]?.heading !== g.heading' in _src('kit-rail.js')


def test_the_site_card_drops_condition_names_that_name_no_condition_and_links_its_variants_label():
    sc = _src('kit-sitecard.js')
    assert 'NO_COND.has(t.toLowerCase())' in sc and 'D.no_condition' in sc
    assert "lab('Variants', 'p-germline,p-mutations'" in sc
    init = (ROOT / 'ptmcontext' / 'web' / '__init__.py').read_text()
    assert "'no_condition': sorted(disease_families.NO_CONDITION)" in init
