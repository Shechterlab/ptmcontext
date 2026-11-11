"""The Proteins and Sites pages from the site file alone (CONTRACTS.md, "The Proteins and Sites pages"): a toy site names
its Proteins columns (a site map, counts of its marks by an attribute's values, the share of its marks in some classes,
a protein attribute), its Sites columns (attributes, the site card's blocks from its tables, the nearest mark) and both
downloads' columns; the pages (kit-tables.js, kit-sites.js, run in Node) show them and the downloads hold them. The
checks name a column the site file does not have, and a site without these blocks still gets both pages."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from ptmcontext import site as S
from ptmcontext import web
from test_protein_tables import _page_data, _toy

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'

PROTEINS = {
    'columns': [
        {'id': 'map', 'label': 'Site map', 'show': 'map', 'default': True},
        {
            'id': 'st',
            'label': 'States',
            'counts': {'attribute': 'state', 'values': {'me1': 'one', 'me2': 'two'}, 'dashed': ['me2']},
            'default': True,
        },
        {'id': 'mot', 'label': 'In RG', 'classes': {'analysis': 'motif', 'classes': ['RG']}, 'default': True},
        {'id': 'q', 'label': 'Arg q', 'attribute': 'arg_q', 'format': 'p'},
    ],
    'download': [
        {'name': 'gene', 'value': 'gene'},
        {'name': 'acc', 'value': 'accession'},
        {'name': 'n', 'value': 'marks_shown'},
        {'name': 'q', 'attribute': 'arg_q'},
        {'name': 'in_rg', 'classes': {'analysis': 'motif', 'classes': ['RG']}},
    ],
}
SITES = {
    'short': {'state': {'me1': 'M1', 'me2': 'M2'}},
    'table': [
        {'id': 'ix', 'label': 'Evidence', 'show': ['status', 'tags'], 'default': True},
        {'id': 'src', 'label': 'Reported by', 'attribute': 'studies', 'default': True},
        {'id': 'nn', 'label': 'Nearest', 'show': ['nearest']},
    ],
    'download': [
        {'name': 'gene', 'value': 'gene'},
        {'name': 'site', 'value': 'site'},
        {'name': 'state', 'attribute': 'state', 'labels': True},
        {'name': 'refs', 'attribute': 'studies', 'lookup': 'citation'},
        {'name': 'dois', 'attribute': 'studies', 'links': True},
        {'name': 'entries', 'table': 'ev', 'field': 'ids'},
        {'name': 'n_entries', 'table': 'ev', 'field': 'ids', 'count': True},
        {'name': 'nearest', 'value': 'nearest'},
        {'name': 'q', 'protein': 'arg_q'},
    ],
}


def _site(tmp_path, blocks=True):
    root = _toy(tmp_path)
    path = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(path.read_text())
    site['proteins'] = {
        'input': 'toy_proteins',
        'accession': 'protein',
        'attributes': {'arg_q': {'column': 'arg_q', 'label': 'Arg q', 'kind': 'number'}},
    }
    if blocks:
        site['website'].update(
            {'proteins': PROTEINS, 'sites': SITES, 'selection_cards': {'@studies': {'eyebrow': 'A lab'}}}
        )
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    return root, path


def test_the_blocks_are_checked(tmp_path):
    root, path = _site(tmp_path)
    site = S.load_site(path)
    assert S.website_problems(site) == []
    site['website']['proteins']['columns'][1]['counts']['attribute'] = 'nothing'
    site['website']['proteins']['columns'][2]['classes']['classes'] = ['XYZ']
    site['website']['sites']['download'][5]['table'] = 'missing'
    site['website']['selection_cards']['motif'] = {}
    probs = S.table_view_problems(site)
    assert "website.proteins.columns 'st': no attribute of the marks 'nothing'" in probs
    assert "website.proteins.columns 'mot': 'motif' has no class 'XYZ'" in probs
    assert "website.sites.download 'entries': no table in website.tables 'missing'" in probs
    assert "website.selection_cards: 'motif' is not a protein-set question" in probs


def _node(index, body):
    data = _page_data(index)
    if data.get(
        'late'
    ):  # the rest of the protein attributes' values are read from data/site.json when asked for (kit-late.js)
        data['protein_attributes']['values'].update(
            json.loads((index.parent / data['late']['file']).read_text())['protein_attributes']
        )
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    files = [ASSETS / n for n in ('kit-columns.js', 'kit-sitecard.js', 'kit-tables.js', 'kit-sites.js')]
    script = f"""
const fs = require('fs'), path = require('path'), WEB = {json.dumps(str(index.parent))};
global.window = {{}}; global.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
global.document = {{ getElementById: () => null, addEventListener: () => {{}}, querySelectorAll: () => [] }};
global.fetch = u => Promise.resolve({{ ok: fs.existsSync(path.join(WEB, u)), json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(WEB, u), 'utf8'))) }});
global.requestAnimationFrame = f => setTimeout(f, 0); global.scrollTo = () => {{}}; global.scrollY = 0;
{''.join(f"eval(fs.readFileSync({json.dumps(str(f))}, 'utf8'));" for f in files)}
const D = {json.dumps(data)}, SD = {json.dumps(sel)};
SD.numbers = {{}};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const A = Object.fromEntries(D.analyses.map(a => [a.id, a])), S = {{ q: '', f: {{}}, view: 'sites' }};
let got = null;
const K = {{ D, W: D.words, A, S, esc, int: n => String(n), cap: t => String(t)[0].toUpperCase() + String(t).slice(1), clicks: [], tips: [], tabs: [], views: {{}}, sections: {{}}, methods: [],
  link: (v, a) => '#' + v + '/' + (a || ''), map: {{ attrColour: () => '#000' }}, preamble: () => '# head\\n', CIT: {{}}, download: () => {{}}, render: () => {{}}, go: () => {{}}, writeHash: () => {{}},
  expBar: (k, a) => `<span data-${{a}}></span>`, exportFigure: (kind, make, name, el, tsv) => {{ got = {{ name, tsv: tsv() }}; }}, proteinAttr: (acc, n) => D.protein_attributes.values[n][D.proteins.findIndex(p => p[0] === acc)],
  PADJ: 0.05, fxn: v => String(v), fq: v => String(v), pct: () => '', fx: v => String(v),
  sel: {{ data: () => SD, active: () => false, compute: () => ({{ active: false }}), nMarks: () => SD.marks.length, valueLabel: (n, v) => (D.attribute_specs[n]?.values || {{}})[v] ?? v,
    classLabel: (a, c) => c, listHtml: (n, vs) => vs.join(', '), selectedCountByProtein: () => ({{}}), contrastGroups: () => null, MIN_SIDE: 10 }} }};
window.PTMC_MODULES.forEach(f => f(K));
const click = sel => K.clicks.find(([s]) => s === sel)[1];
(async () => {{ {body} }})();"""
    return json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_pages_show_and_download_the_site_files_columns(tmp_path):
    root, path = _site(tmp_path)
    S.run(path, root=root / 'data', log=lambda *_: None)
    index = web.build(path, log=lambda *_: None)
    out = _node(
        index,
        """
const prot = K.views.proteins.render();
click('[data-ptsv]')(null); const ptsv = got.tsv, pname = got.name;
K.views.sites.render(); await new Promise(r => setTimeout(r, 50));
const sites = K.views.sites.render();
await click('[data-sites-exp]')({ textContent: '', disabled: false }); await new Promise(r => setTimeout(r, 50));
console.log(JSON.stringify({ prot, ptsv, pname, sites, stsv: got.tsv, sname: got.name, methods: K.methods.map(m => m.id) }));""",
    )
    p, s = out['prot'], out['sites']
    # the Proteins page: the protein, its marks, the site map, the counts by state (two of one, dashed), the RG share
    assert (
        'Site map' in p
        and '<svg class="minimap"' in p
        and 'aria-label="Mark positions along ONE"' in p.replace('Methylarginine', 'Mark')
    )
    assert '1 one</span>' in p and 'ixs dashed' in p and 'In RG' in p
    assert 'Arg q' in p  # in the Columns menu, not shown at first
    assert 'Copy gene list' in p and 'How to cite' in p
    head, *rows = [r for r in out['ptsv'].splitlines() if not r.startswith('#')]
    assert head.split('\t') == ['gene', 'acc', 'n', 'q', 'in_rg']
    assert rows[0].split('\t')[:4] == ['ONE', 'P1', '2', '0.01']
    assert out['pname'].endswith('_proteins_' + out['pname'][-10:]) and '_selection' not in out['pname']
    # the Sites page: short labels, the evidence tags from the tables, the studies; the download from every source
    assert 'M1' in s and 'XL' in s and 'Reported by' in s and 'Nearest' in s
    head, *rows = [r for r in out['stsv'].splitlines() if not r.startswith('#')]
    assert head.split('\t') == [c['name'] for c in SITES['download']]
    r2 = dict(zip(head.split('\t'), rows[0].split('\t')))
    assert r2['gene'] == 'ONE' and r2['site'] == 'R2' and r2['state'] == 'M1'
    assert r2['refs'] == 'Ann et al., J 1:1 (2020);Bob et al., J 2:2 (2021)' and r2['dois'] == '10.1/a;10.1/b'
    assert r2['entries'] == '1abc;2def' and r2['n_entries'] == '2' and r2['nearest'] == '3' and r2['q'] == '0.01'
    assert 'tables' in out['methods']


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_site_without_the_blocks_gets_both_pages(tmp_path):
    root, path = _site(tmp_path, blocks=False)
    S.run(path, root=root / 'data', log=lambda *_: None)
    index = web.build(path, log=lambda *_: None)
    out = _node(
        index,
        """
const prot = K.views.proteins.render(); const sites = K.views.sites.render();
click('[data-ptsv]')(null); console.log(JSON.stringify({ prot, sites, ptsv: got.tsv }));""",
    )
    assert 'Length' in out['prot'] and 'minimap' in out['prot']
    assert 'Sequence (±7 residues)' in out['sites'] and 'R2' in out['sites']
    assert [r for r in out['ptsv'].splitlines() if not r.startswith('#')][0].startswith('accession\tgene')
