"""The Mutations page: cancer-type names from one config list, the Overview's tiles reused, one tested denominator."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext/web/assets'


def test_tcga_project_names_cover_the_33_codes():
    names = json.loads((ROOT / 'ptmcontext/config/tcga_projects.json').read_text())['names']
    assert len(names) == 33
    assert all(k.startswith('TCGA-') and v and not v.startswith('TCGA') for k, v in names.items())
    assert 'group_names' in (ROOT / 'ptmcontext/web/propensity.py').read_text()


def test_page_reuses_overview_tiles_and_names():
    js = (ASSETS / 'kit-mutations.js').read_text()
    for q in ('cancer_change', 'clinvar_plp', 'gnomad_variant'):
        assert f"'{q}'" in js
    assert 'K.tilesOf' in js and 'cancerName(g)' in js
    assert 'K.tilesOf' in (ASSETS / 'kit.js').read_text()
    # the old links keep opening their views
    assert "VIEWS = ['ranked', 'oncoprint', 'clinvar', 'waterfall']" in js
    # the default table lists sites with q < 0.05; the top 20 by p is a toggle
    assert 'Show the top ${RANK_N} by p' in js


def test_the_tab_and_page_are_named_mutations_at_the_same_address():
    src = (Path(__file__).resolve().parents[1] / 'ptmcontext/web/assets/kit-mutations.js').read_text()
    assert "['mutations', 'Mutations'," in src and '<h2>Mutations</h2>' in src and "title: () => 'Mutations'" in src
    assert 'Disease variants' not in src
