"""The protein page's table of sites and their variants (assets/kit-sitetable.js): drawn from the site file's sources and map
rows, with no site named in the code. Run on a toy page in Node with the parts of the kit it reads stubbed."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'


def test_the_module_is_listed_before_the_core_and_names_no_site():
    assert web.MODULES.index('kit-sitetable.js') < web.MODULES.index('kit.js')
    code = re.sub(r'/\*.*?\*/|//[^\n]*$', '', (ASSETS / 'kit-sitetable.js').read_text(), flags=re.S | re.M)
    for word in ('TCGA', 'DepMap', 'gnomAD', 'ClinVar', 'methylarginine', 'phospho', 'arginine'):
        assert word not in code, word


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_table_sorts_flags_and_downloads_from_the_sources_it_is_given():
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop;
const el = {{ id: '', querySelector: () => null }};
global.document = {{ addEventListener: noop, createElement: () => ({{}}), head: {{ appendChild: noop }}, getElementById: () => null }};
global.fetch = () => new Promise(noop);
const sources = [
  {{ id: 'a', label: 'Alpha', long: 'Alpha tumors', kind: 'somatic', unit: ['tumor', 'tumors'] }},
  {{ id: 'g', label: 'Gamma', kind: 'germline', unit: ['variant', 'variants'], lower_tail: true }},
  {{ id: 'c', label: 'Clin', kind: 'germline', descriptive: true }},
];
const cells = {{
  'a:1': {{ k: 5, o: 3, e: 1.5, q: 0.2, p: 0.01 }}, 'a:2': {{ k: 9, o: 4, e: 2, q: 0.01, p: 0.001, hot: {{ self: true }} }}, 'a:3': {{ k: 0, o: 0, e: 1, q: 1, p: 1 }},
  'g:1': {{ k: 1, o: 1, e: 1, q: 1, p: 1 }}, 'g:2': {{ k: 0, o: 0.1, e: 3, q: 1, p: 1, ql: 0.02, pl: 0.001 }}, 'g:3': {{ k: 2, o: 1, e: 2, q: 1, p: 1 }},
}};
const D = {{ site: {{ id: 'toy' }}, run: {{}}, proteins: [], tracks: [{{ kind: 'dis', style: 'disorder' }}],
  propensity: {{ sources }}, protein_view: {{ site_table: {{ title: 'My table' }} }} }};
const K = {{ D, W: {{ mark: 'site', marks: 'sites' }}, S: {{}}, esc: s => String(s ?? ''), int: n => String(n), clicks: [], us: s => s, link: (v, a) => '#' + v + '/' + a,
  loading: () => '', expBar: () => '', preamble: (t, w) => '# ' + t + '\\n# What: ' + w + '\\n', exportFigure: (k, f, n, b, tsv) => (global.TSV = tsv()),
  prop: {{ ring: 0.05, desc: id => id === 'c', cfg: D.propensity, state: {{ hyper: false }}, peek: () => ({{}}), load: () => Promise.resolve(),
    at: (acc, id, pos) => cells[id + ':' + pos] || null, fo: o => String(o), kOE: (id, v) => v.k + ' changes · O/E ' + v.o, fq: q => String(q), tip: () => 'tip', hotNote: () => 'a hotspot', hyperSwitch: () => '', onHyper: noop }},
  prot: {{ siteLabel: (a, p) => 'X' + p, stateText: m => m[2], stateLabel: () => 'State' }},
  card: {{ peek: () => ({{}}), load: () => Promise.resolve(), vc: {{ entries: [{{ id: 'c', label: 'Clin', highlight: {{ label: 'P/LP' }} }}],
    siteVariants: (tb, pos) => [{{ x: {{ label: 'Clin' }}, n: pos, hot: pos === 2 ? 1 : 0 }}],
    sites: (tb, x, ps) => ({{ any: ps.length, hot: ps.filter(p => p === 2).length, of: ps.length }}),
    line: (tb, acc, pos) => '<a>' + pos + ' variants</a>', text: (tb, pos) => 'Clin: ' + pos + ' variants' }} }},
  map: {{ namedRows: () => [], namedChanges: () => false }}, protState: () => ({{ p: {{ acc: 'P1', gene: 'G1' }}, rec }}) }};
const rec = {{ marks: [[3, 'w', 'on'], [1, 'w', 'off'], [2, 'w', 'on']], units: [['dis', 2, 2]] }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-sitetable.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
let args;
K.proteinFolds[0]({{ acc: 'P1', gene: 'G1' }}, rec, (...a) => ((args = a), ''));
const rows = [...args[3].matchAll(/<tr><td[^>]*><a[^>]*>(X\\d)<\\/a>/g)].map(m => m[1]);
K.clicks.find(c => c[0] === '[data-stexp]')[1]({{ dataset: {{ stexp: 'tsv' }} }});
console.log(JSON.stringify({{ id: args[0], title: args[1], sum: args[2], rows, tsv: global.TSV, sections: K.proteinFoldSections }}));"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1500:]
    out = json.loads(run.stdout)
    assert out['id'] == 'p-sitetab' and out['title'] == 'My table'
    assert out['rows'] == ['X2', 'X1', 'X3']  # the strongest first: q 0.01, 0.2, 1
    assert out['sum'] == '3 sites; 1 with q < 0.05 in Alpha; 1 with Clin P/LP variants'  # the site card's counter
    lines = out['tsv'].splitlines()
    head = next(i for i, ln in enumerate(lines) if not ln.startswith('#'))
    assert lines[head].split('\t') == [
        'uniprot_position',
        'site',
        'state',
        'a_tumors_changed',
        'a_oe',
        'a_q',
        'g_variants_changed',
        'g_oe',
        'g_q',
        'variants',
        'hotspot_note',
        'disordered',
    ]
    by = {ln.split('\t')[0]: ln.split('\t') for ln in lines[head + 1 :]}
    assert [by[p][2] for p in '123'] == ['off', 'on', 'on']
    assert (
        by['2'][5] == '0.01' and by['2'][8] == '0.02'
    )  # a source with a lower tail gives q for fewer where it is significant
    assert by['2'][10] == 'Alpha' and by['1'][10] == '' and by['2'][11] == 'yes' and by['3'][11] == 'no'
    assert by['2'][9] == 'Clin: 2 variants'  # one value, from the site card's own text
    assert out['sections'][-1][0] == 'p-sitetab'


def test_a_sites_variants_have_one_counter_and_other_pages_show_its_line():
    card = (ASSETS / 'kit-sitecard.js').read_text()
    table = (ASSETS / 'kit-sitetable.js').read_text()
    pcards = (ASSETS / 'kit-pcards.js').read_text()
    prot = (ASSETS / 'kit-proteins.js').read_text()
    # the home: the site card's module counts, words and links; its variant block is a fold the address can open
    for name in ('siteVariants', 'variantSites', 'variantWords', 'variantLine'):
        assert f'const {name} =' in card, name
    assert "K.link('protein', `${acc}/${pos}`, { open: 'sc-variants' })" in card
    assert 'id="sc-variants"' in prot
    # the protein's germline fold and the table's summary read it, and the table no longer reads cv.json or lists variants
    assert (
        'VCK.sites(' in pcards
        and 'VCK.hot(x, v.r)' not in pcards.split('function germlineSource')[1].split('const lol')[0]
    )
    assert (
        'cv.json' not in re.sub(r'/\*.*?\*/', '', table, flags=re.DOTALL)
        and 'cvAt' not in table
        and 'CV.cond' not in table
    )
    assert 'K.card.vc.line(vtb, acc, pos)' in table and 'st-vars' not in table
