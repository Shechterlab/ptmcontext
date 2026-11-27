"""Site numbering without the initiator methionine: one rule, in Python and in the page, driven by the site file."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml
from node_harness import ASSETS, HARNESS, toy_build
from ci_sites import PUBLISHED
from test_search import _page_data

from ptmcontext.web import numbering as N

REPO = Path(__file__).resolve().parents[1]
SITES = PUBLISHED


def _rules(site='methyllysine'):
    web = yaml.safe_load((REPO / 'sites' / f'{site}.yaml').read_text())['website']
    return N.rules_for_page(web['protein']['numbering'])


# a histone, a non-histone whose UniProt entry records the initiator methionine as removed (UniProt numbering since 2026-11), and a protein that keeps it
H3 = ('P68431', 'H3C1; H3C2; H3C3', 'Histone H3.1')
REMOVED = ('Q9UQ80', 'PA2G4', 'Proliferation-associated protein 2G4')
KEPT = ('P04637', 'TP53', 'Cellular tumor antigen p53')


def test_offset_rule():
    rules = _rules()
    assert N.offset(*H3, rules) == -1  # a histone: always, whatever its entry says
    assert N.offset(*REMOVED, rules) == 0  # only the histones are numbered without it; every other protein as UniProt
    assert N.offset(*KEPT, rules) == 0  # unchanged UniProt numbering
    assert N.offset('P0', '', 'Histone H2A type 1', rules) == -1  # without a gene, the name says histone
    assert N.offset('P0', 'TP53', 'x', []) == 0


@pytest.mark.parametrize('site', SITES)
def test_every_human_site_numbers_the_same_proteins(site):
    r = _rules(site)
    assert any(x.get('genes') for x in r) and not any(x.get('removed_met') for x in r)
    assert [N.offset(*p, r) for p in (H3, REMOVED, KEPT)] == [-1, 0, 0]


def test_the_page_reads_one_rule(tmp_path):
    """kit-select.js defines the rule once (K.numbering); the site card, the protein page, the map, the Sites table and
    the search all read it, and it gives the offsets Python gives, for P68431 (the card and the page agree)."""
    if not shutil.which('node'):
        pytest.skip('needs Node')
    src = ''.join((ASSETS / f).read_text() for f in ('kit-proteins.js', 'kit-select.js'))
    assert len(re.findall(r'protein_view\?\.numbering', src)) == 1
    index = toy_build(tmp_path)
    data = _page_data(index)
    data['protein_view'] = {**(data.get('protein_view') or {}), 'numbering': _rules()}
    (tmp_path / 'd.json').write_text(json.dumps(data))
    head = (
        f'const ASSETS = {json.dumps(str(ASSETS))}, BUILT = {json.dumps(str(index.parent / "assets"))}, '
        f'DATA = {json.dumps(str(tmp_path / "d.json"))}, SEL = {json.dumps(str(index.parent / "data" / "sel"))};'
        + HARNESS
    )
    body = (
        'const ps = [["P68431","H3C1; H3C2","Histone H3.1"],["Q9UQ80","PA2G4","x"],["P04637","TP53","x"]].map(([acc,gene,name]) => ({acc,gene,name}));'
        'console.log(JSON.stringify(ps.map(p => K.numbering(p)?.offset ?? 0)));'
    )
    run = subprocess.run(['node', '-e', head + '(async () => {' + body + '})();'], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1200:]
    assert json.loads(run.stdout) == [N.offset(*p, _rules()) for p in (H3, REMOVED, KEPT)] == [-1, 0, 0]


def test_every_protein_card_residue_name_carries_the_accession():
    import re
    from pathlib import Path

    js = (Path(__file__).resolve().parents[1] / 'ptmcontext/web/assets/kit-pcards.js').read_text()
    calls = re.findall(r'siteName\(rec, [^)]*\)', js)
    assert calls and all(c.count(',') == 2 for c in calls), calls
