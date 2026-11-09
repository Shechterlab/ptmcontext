"""The gene-list test page (kit-genelist.js) on a toy site: a pasted list is read by the search's parser
(a name not found is reported, not dropped), and each set of the cards' protein-set questions is tested within its own
source's background; the page's rows equal ptmstats.gene_list_test on selection.json, which the package checks against
SciPy. Nothing is added to statistics.tsv."""
from __future__ import annotations

import json
import shutil
import subprocess

import pytest
import yaml
from node_harness import ASSETS, HARNESS
from test_search import _page_data
from test_set_views import _site

import ptmstats
from ptmcontext import site as S
from ptmcontext import web


def _build(tmp_path):
    root = _site(tmp_path, views=False)
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['website']['front'] = {'cards': [{'title': 'Disease', 'analyses': ['onto', 'term', 'fam'], 'facets': [{'analysis': 'onto'}, {'analysis': 'term'}], 'home': {'analysis': 'onto'}}]}
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    return root, web.build(p, log=lambda *_: None)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_list_page_rows_equal_the_python_reference(tmp_path):
    root, index = _build(tmp_path)
    stats_before = (root / 'out' / 'toy' / 'statistics.tsv').read_text()
    assert (index.parent / 'assets' / 'kit-genelist.js').exists()
    (tmp_path / 'd.json').write_text(json.dumps(_page_data(index)))
    head = (f"const ASSETS = {json.dumps(str(ASSETS))}, BUILT = {json.dumps(str(index.parent / 'assets'))}, DATA = {json.dumps(str(tmp_path / 'd.json'))}, "
            f"SEL = {json.dumps(str(index.parent / 'data' / 'selection.json'))};")
    harness = HARNESS.replace("window.PTMC_MODULES.forEach", "eval(fs.readFileSync(ASSETS + '/kit-genelist.js', 'utf8')); window.PTMC_MODULES.forEach")
    body = """
      K.fx = v => String(v); K.fq = v => String(v); K.g6 = v => String(v); K.preamble = (t, w) => '# ' + t + ': ' + w + NL;
      K.sel.data(); await K.sel.ready;
      const L = K.geneList.read('GP1 gp2 GP4 FOOBAR');
      S0.q = 'GP1 gp2 GP4 FOOBAR'; S0.view = 'list';
      const html = K.views.list.render('');
      console.log(JSON.stringify({ qs: K.geneList.questions, prots: L.prots.map(i => D.proteins[i][0]), notFound: L.notFound, rows: K.geneList.test(L.prots), html, tsv: K.geneList.tsv() }));
    """
    run = subprocess.run(['node', '-e', head + harness + '(async () => {' + body + '})();'], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1500:]
    out = json.loads(run.stdout)
    assert out['qs'] == ['onto', 'term']
    assert sorted(out['prots']) == ['P1', 'P2'] and out['notFound'] == ['GP4', 'FOOBAR']      # P4 has no mark: not found, said
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    acc = [p[0] for p in _page_data(index)['proteins']]
    listed = [acc.index('P1'), acc.index('P2')]
    ref = ptmstats.gene_list_test([(aid, listed, sel['protein_sets'][aid]['in_background'], [(s, m) for s, _, m in sel['protein_sets'][aid]['sets']]) for aid in out['qs']])
    assert len(out['rows']) == len(ref) > 0
    for j, p in zip(out['rows'], ref):
        assert (j['question'], j['set'], j['k'], j['n'], j['M'], j['N']) == (p['question'], p['set'], p['k'], p['n'], p['M'], p['N'])
        assert j['p'] == pytest.approx(p['p'], rel=1e-9) and j['q'] == pytest.approx(p['q'], rel=1e-9)
    h = out['html']
    assert 'A new test, not in the release statistics' in h and 'chosen, not drawn at random' in h
    assert 'Not found' in h and 'FOOBAR' in h and 'p (one-sided hypergeometric)' in h and f'q (Benjamini–Hochberg, {len(ref)} sets)' in h
    assert '# Genes tested (2)' in out['tsv'] and '# Not found: GP4, FOOBAR' in out['tsv'] and '# Input: GP1 gp2 GP4 FOOBAR' in out['tsv']
    assert len(out['tsv'].strip().split('\n')) == 1 + 4 + 1 + len(ref)
    assert (root / 'out' / 'toy' / 'statistics.tsv').read_text() == stats_before
