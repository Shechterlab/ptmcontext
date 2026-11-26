"""The protein page's order and counts: sections in the theme order on every human explorer, no list of counts for one
protein, set names as chips, one sentence for clustering, one nearby-marks function with a printed window and threshold,
and the RNA-binding region ranges read as text (they were read as indexes into the shard's string table)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
HUMAN = ('methylarginine', 'methyllysine', 'lysine', 'phospho')
THEME = ['p-sitetab', 'p-ptm', 'p-depmap', 'p-germline', 'p-cc', 'p-ix', 'p-na', 'p-pert', 'p-cons', 'p-struct']


def read(name: str) -> str:
    return (ASSETS / name).read_text()


def protein(site: str) -> dict:
    return yaml.safe_load((ROOT / 'sites' / f'{site}.yaml').read_text())['website']['protein']


def test_sections_follow_the_theme_order_on_every_human_explorer():
    for site in HUMAN:
        p = protein(site)
        order = p['order']
        assert 'p-score' not in order and all('p-score' not in g['folds'] for g in p['groups']), site
        at = [order.index(x) for x in THEME]
        assert at == sorted(at), site
        # the details come last, and the where-in-the-cell fold starts closed
        assert order.index('p-cell') > order.index('p-struct') and 'p-cell' not in p['open'], site
        folds = [f for g in p['groups'] for f in g['folds']]
        assert folds == [x for x in order if x in folds] and sorted(folds) == sorted(order), site
        assert all(set(g) <= {'id', 'title', 'folds', 'switch'} for g in p['groups']), site


def test_old_score_links_land_on_the_site_table():
    assert "'p-score': 'p-sitetab'" in read('kit-openlink.js')
    assert "'p-score': 'p-sitetab'" in read('kit-proteins.js')
    js = read('kit-proteins.js')
    assert 'function scoreRows' not in js and 'untestedNote' in js


def test_set_names_are_chips_without_folds_or_q():
    js = read('kit-proteins.js')
    body = js.split('function kindsHtml(p) {')[1].split('// ---- domains and regions')[0]
    assert 'class="chip"' in body and 'K.rowsTile' not in body and 'data-kinds-all' in body


def test_clustering_is_one_sentence_with_the_picture_behind_a_toggle():
    js = read('kit-pcards.js')
    body = js.split('function clusteringBuild(p, rec, tb) {')[1].split('// ---- Other PTMs')[0]
    assert 'no more bunched than its' in body and 'more than the spacing of its' in body
    assert '<details class="pc-more">' in body and 'Most significant cluster' not in body
    ma = (ROOT / 'sites' / 'methylarginine.yaml').read_text()
    assert 'label: Densest cluster' in ma and 'label: Most significant cluster' not in ma


def test_nearby_marks_have_one_function_with_window_and_cutoff():
    cols, mp = read('kit-cols.js'), read('kit-map.js')
    assert 'K.nearIn = (cm, from, win = K.nearWindow())' in cols and 'K.nearWindow = ()' in cols
    # no other place does the windowed count
    for name in ('kit-map.js', 'kit-pcards.js', 'kit-proteins.js'):
        assert 'Math.abs(q - f) <= win' not in read(name), name
    # the legend counts the protein's marks and prints a score cut-off beside them
    assert 'shownN = d.total' in mp and '`${shownN} of ${d.all}, ${d.cut}`' in mp
    pc = read('kit-pcards.js')
    assert 'K.nearIn(cm, marks, win)' in pc and 'closest' not in pc.split('function ptmsBuild')[1][:3000]
    assert 'K.map?.nearMarks?.(p.acc, [m[0]])' in read('kit-proteins.js')
    assert 'context_window' in (ROOT / 'ptmcontext' / 'web' / '__init__.py').read_text()


def test_context_cutoff_filter_says_what_it_leaves():
    from ptmcontext import context_marks as CM

    site = {
        'website': {'context_window': 10},
        'context_marks': [
            {
                'id': 'phospho',
                'label': 'Phosphosite',
                'citation': {'short': 'X'},
                'columns': {'score': 'score'},
                'subset': {'id': 'high', 'at_least': 0.5, 'label': 'score ≥ 0.5'},
            }
        ],
    }
    marks, _ = CM.specs(site)
    assert marks['ctx_near_phospho_high']['values']['no'] == 'No phosphosite (score ≥ 0.5) within ±10'
    assert marks['ctx_near_phospho']['values']['no'] == 'None within ±10'


def test_nucleic_region_bounds_are_read_as_text():
    js = read('kit-sitecard.js')
    assert "NUMS.has(c) && TH[name].format !== 'protein_records'" in js


def test_protein_preview_wording_and_place():
    js = read('kit-network.js')
    assert 'shown of ${j.labels[c].n} in the cluster' in js
    assert 'STRING partners are in this cluster' in js
    assert 'previewSlot' in js and 'K.net?.previewSlot?.(p)' in read('kit-pnet.js')


def test_js_files_parse():
    for name in (
        'kit-pcards.js',
        'kit-proteins.js',
        'kit-map.js',
        'kit-network.js',
        'kit-pnet.js',
        'kit-sitecard.js',
        'kit-cols.js',
    ):
        subprocess.run(['node', '--check', str(ASSETS / name)], check=True)
    json.dumps(protein('methylarginine')['order'])
