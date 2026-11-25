"""Fewer things at once: the score and protein-class folds start closed, an empty source is one muted line drawn by one
helper, a protein's localization names only where it is found, and a small selection folds the unchanged tiles."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
SITES = Path(__file__).resolve().parents[1] / 'sites'


def read(name: str) -> str:
    return (ASSETS / name).read_text()


def test_kinds_fold_starts_closed_and_score_fold_is_gone():
    js = read('kit-proteins.js')
    assert "fold('p-kinds', 'Protein classes and pathways', '', kindsHtml(p), false)" in js
    assert "'p-score'" not in js.split('const fold = (id, title, sum, body, open, pin)')[1].split('K.pfoldsSwitch')[0]
    for site in SITES.glob('*.yaml'):
        for line in site.read_text().splitlines():
            if line.startswith('    open: ['):
                assert 'p-score' not in line and 'p-kinds' not in line, site.name


def test_no_data_is_one_helper():
    kit = read('kit.js')
    assert 'K.noData = (text) =>' in kit and 'class="muted nodata"' in kit
    for name in ('kit-pcards.js', 'kit-pix.js', 'kit-pnet.js'):
        assert 'K.noData(' in read(name), name
    assert 'No condensate membership recorded' not in read('kit-pcards.js')
    assert 'condensates for this protein.' in read('kit-pcards.js')


def test_protein_localization_names_only_found_compartments():
    js = read('kit-cell.js')
    assert 'ds: false, all: false' in js
    assert '!ONEUI.ds && !ONEUI.all && !P[k].found' in js
    assert 'data-cellone-all' in js and 'Show all compartments' in js


def test_small_selection_folds_unchanged_tiles():
    js = read('kit.js')
    assert 'small && tileH(c).startsWith(\'<article class="tile" id="tile-\')' in js
    assert 'unchanged by this selection' in js and 'class="ov-unch"' in js
    assert '.ov-unch' in read('kit.css')
