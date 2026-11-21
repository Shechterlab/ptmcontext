"""Proteins several genes encode: one readable name and the full list, from the site file's rule."""

from __future__ import annotations

import json
import shutil
import subprocess

import pytest
from node_harness import ASSETS, HARNESS, toy_build
from test_search import _page_data

from ptmcontext.web import genes

SPEC = {
    'input': 'entries',
    'from': 'Entry',
    'to': 'Genes',
    'separator': ';',
    'short': [{'pattern': r'^(AB)[C-]\d+$', 'replace': r'\1'}],
}


def _table(tmp_path, rows):
    p = tmp_path / 'entries.tsv'
    p.write_text('Entry\tGenes\n' + ''.join(f'{a}\t{g}\n' for a, g in rows))
    return p


def test_short_name_and_list(tmp_path):
    t = _table(
        tmp_path,
        [('P1', 'ABC1; ABC2; AB-16'), ('P2', 'DEFB4A; DEFB4B'), ('P3', 'TP53'), ('P4', 'X1; Y2'), ('P5', '')],
    )
    out = genes.load(SPEC, t)
    assert set(out) == {'P1', 'P2', 'P4'}  # a single gene, or none, is left as it is
    assert out['P1'] == {'short': 'AB', 'genes': ['ABC1', 'ABC2', 'AB-16']}  # the site's rule
    assert out['P2']['short'] == 'DEFB4'  # no rule: the common start of the genes
    assert out['P4']['short'] == 'X1'  # genes with nothing in common: the first
    assert genes.load(None, t) == {} and genes.load(SPEC, tmp_path / 'none.tsv') == {}


def test_rule_that_does_not_cover_every_gene_falls_back(tmp_path):
    out = genes.load(SPEC, _table(tmp_path, [('P1', 'ABC1; ABD2')]))
    assert out['P1']['short'] == 'AB'  # the common start, the rule gave no one name


def test_every_gene_finds_the_protein(tmp_path):
    if not shutil.which('node'):
        pytest.skip('needs Node')
    index = toy_build(tmp_path)
    data = _page_data(index)
    p = data['proteins'][0]
    data['protein_genes'] = {p[0]: ['ZZA1', 'ZZA2', 'ZZB-16']}
    p[1] = 'ZZ'  # the short name the page shows
    (tmp_path / 'd.json').write_text(json.dumps(data))
    head = (
        f'const ASSETS = {json.dumps(str(ASSETS))}, BUILT = {json.dumps(str(index.parent / "assets"))}, '
        f'DATA = {json.dumps(str(tmp_path / "d.json"))}, SEL = {json.dumps(str(index.parent / "data" / "sel"))};'
        + HARNESS
    )
    body = "console.log(JSON.stringify(['ZZ','ZZA2','zzb-16','ZZC9'].map((t) => (K.sel.lookup(t)?.ps || []).map((q) => q.acc))));"
    run = subprocess.run(['node', '-e', head + '(async () => {' + body + '})();'], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1200:]
    assert json.loads(run.stdout) == [[p[0]], [p[0]], [p[0]], []]


def test_one_ranking_for_the_site_and_the_landing_search():
    """kit-names.js is the one ranking: the site's suggestions and the landing page's hits read it, so a gene of a
    multi-gene protein, a previous symbol and the accession give the same protein, named the same way."""
    if not shutil.which('node'):
        pytest.skip('needs Node')
    rows = [
        {
            'acc': 'P62805',
            'gene': 'H4',
            'genes': ['H4C1', 'H4C2'],
            'aliases': ['HIST1H4B', 'H4-16'],
            'name': 'Histone H4',
            'w': 3,
        },
        {'acc': 'Q9X', 'gene': 'H4X', 'genes': [], 'aliases': [], 'name': 'Other', 'w': 9},
    ]
    js = (ASSETS / 'kit-names.js').read_text()
    body = (
        'global.window = {};' + js + f'const rows = {json.dumps(rows)};'
        "console.log(JSON.stringify(['H4C2','hist1h4b','H4-16','P62805','H4'].map((q) => window.PTMNames.rank(rows, q).map((h) => [h.row.acc, h.label, h.desc, h.via]))));"
    )
    run = subprocess.run(['node', '-e', body], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    out = json.loads(run.stdout)
    assert out[0] == [['P62805', 'H4', 'Histone H4, 2 genes', '']]  # a gene of the protein
    assert out[1][0][0] == 'P62805' and out[1][0][3] == 'HIST1H4B'  # a previous symbol, said as such
    assert out[2][0][0] == 'P62805' and out[3][0][0] == 'P62805'
    assert [h[0] for h in out[4]] == ['P62805', 'Q9X']  # H4 is exact for one, a prefix of the other


def test_symbols_table_is_read(tmp_path):
    p = tmp_path / 's.tsv'
    p.write_text('# c\naccession\tsymbol\tprevious\talias\nP1\tA\tOLD1; OLD2\tALT\nP2\tB\t\t\n')
    assert genes.symbols({'symbols': str(p)}) == {'P1': ['OLD1', 'OLD2', 'ALT']}
    assert genes.symbols({}) == {}
