"""Conservation across species and the selection's logo (CONTRACTS.md, "Conservation across species"): the site file's
block is checked, reaches the page's data, and the module (assets/kit-conserve.js) does its sums on any site's residues."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import jsonschema
import pytest
import yaml

from ptmcontext import web
from ptmcontext.web import conserve

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
GOOD = {
    'ensembl': {'rest': 'https://rest.ensembl.org', 'xref': 'Ensembl', 'source': 'human'},
    'species': [{'id': 'mus_musculus', 'label': 'Mouse'}, {'id': 'danio_rerio', 'label': 'Zebrafish'}],
    'logo': True,
}


def _site(block, patterns=True):
    web_ = {'protein': {'conservation': block}} if block is not None else {}
    if patterns:
        web_['search'] = {'patterns': {'at': 'pattern', 'span': 15}}
    return {'website': web_}


def test_a_site_without_the_block_has_nothing_to_check():
    assert conserve.problems(_site(None)) == []


def test_the_block_is_checked():
    assert conserve.problems(_site(GOOD)) == []
    bad = dict(
        GOOD,
        ensembl={'rest': 'http://x', 'xref': ''},
        species=[{'id': 'Mouse', 'label': 'M'}, {'id': 'a_b', 'label': 'x'}, {'id': 'a_b', 'label': 'y'}],
        similar=['KK'],
    )
    out = ' | '.join(conserve.problems(_site(bad)))
    for part in (
        'ensembl.source: missing',
        'ensembl.xref: missing',
        'not an https address',
        "'Mouse' is not an Ensembl species name",
        "'a_b' listed twice",
        "'KK' is not one residue letter",
    ):
        assert part in out
    assert 'set website.search.patterns' in ' '.join(conserve.problems(_site(GOOD, patterns=False)))
    assert conserve.problems(_site(dict(GOOD, species=[]))) == [
        'website.protein.conservation.species: no species to align'
    ]


def test_the_presets_are_checked():
    ok = dict(
        GOOD,
        presets=[
            {'id': 'a', 'label': 'A', 'species': ['mus_musculus']},
            {'id': 'b', 'label': 'B', 'species': ['mus_musculus', 'danio_rerio']},
        ],
        default='b',
    )
    assert conserve.problems(_site(ok)) == []
    bad = dict(
        ok,
        presets=[
            {'id': 'a', 'label': 'A', 'species': ['mus_musculus']},
            {'id': 'a', 'label': 'A', 'species': ['xx_yy']},
        ],
        default='zzz',
    )
    out = ' | '.join(conserve.problems(_site(bad)))
    for part in (
        "'a' listed twice",
        "'xx_yy' is not in website.protein.conservation.species",
        "'zzz' is not the id of a preset",
    ):
        assert part in out


def test_the_schema_takes_the_block_and_the_bundled_sites_pass():
    schema = json.loads((ROOT / 'ptmcontext' / 'schemas' / 'site.schema.json').read_text())
    for name in ('methylarginine', 'yeast_phospho'):
        site = yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())
        jsonschema.validate(site, schema)
        assert conserve.problems(site) == []
        assert conserve.config(site)['species'], name
    with pytest.raises(jsonschema.ValidationError):
        site = yaml.safe_load((ROOT / 'sites' / 'yeast_phospho.yaml').read_text())
        site['website']['protein']['conservation']['species'][0]['extra'] = 1
        jsonschema.validate(site, schema)


def test_the_module_comes_before_the_core():
    assert 'kit-conserve.js' in web.MODULES and web.MODULES.index('kit-conserve.js') < web.MODULES.index('kit.js')
    assert (ASSETS / 'kit-conserve.js').exists()


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_sums_use_the_profiles_residues_and_the_site_files_species():
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop;
global.PTMC_STATS = {{ chi2sf1: s => Math.exp(-s / 2) }};
global.document = {{ addEventListener: noop, createElement: () => ({{}}), head: {{ appendChild: noop }}, getElementById: () => null }};
const D = {{ residues: ['S', 'T'], run: {{}}, proteins: [], protein_view: {{ conservation: {json.dumps(dict(GOOD, ensembl={'rest': 'https://r/', 'xref': 'EnsemblFungi', 'source': 'saccharomyces_cerevisiae', 'compara': 'fungi'}))} }} }};
const K = {{ D, W: {{ mark: 'phosphosite', marks: 'phosphosites', residues: 'serines and threonines' }}, S: {{}}, esc: s => String(s ?? ''), int: n => String(n), sections: {{}}, clicks: [], tips: [] }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-conserve.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const C = K.conserve;
const seq = 'ASAATAAS';
const ortho = (name, tgt) => ({{ sp: name, name, h: {{ source: {{ align_seq: seq }}, target: {{ align_seq: tgt, perc_id: 80, protein_id: 'P' + name }} }} }});
const model = C.modelOf(seq, [2, 5], [ortho('a', 'ASAATAAT'), ortho('b', 'AAAAAAAS')]);
const ck = C.keepOf(seq, model);
const cols = C.columns(Array(40).fill('AAAAS'), 2, 2);
console.log(JSON.stringify({{ url: C.orthoUrl('ENSG1'), at: model.rows.map(r => [r.at(2), r.at(5), r.at(1)]), me: ck.me, other: ck.other, n1: ck.n1, n2: ck.n2,
  ic: cols[2].ic, ic0: cols[0].ic, gene: C.ensgOf({{ uniProtKBCrossReferences: [{{ database: 'Ensembl', properties: [{{ key: 'GeneId', value: 'ENSG9.3' }}] }}, {{ database: 'EnsemblFungi', properties: [{{ key: 'GeneId', value: 'YBR160W' }}] }}] }}) }}));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert (
        out['url'].startswith('https://r/homology/id/saccharomyces_cerevisiae/ENSG1?')
        and 'compara=fungi;' in out['url']
        and 'target_species=mus_musculus;target_species=danio_rerio' in out['url']
    )
    assert out['at'] == [['S', 'T', 'A'], ['A', 'A', 'A']]
    assert out['n1'] == 2 and out['n2'] == 1  # S2 and T5 against S8: the profile's S and T only, not the A's
    assert out['me'] == pytest.approx(0.5) and out['other'] == pytest.approx(0.5)
    assert out['ic'] == pytest.approx(
        __import__('math').log2(20) - 19 / (2 * __import__('math').log(2) * 40)
    )  # the small-sample correction
    assert out['ic0'] == pytest.approx(out['ic'])
    assert out['gene'] == 'YBR160W'  # the database the site file names, not any other
