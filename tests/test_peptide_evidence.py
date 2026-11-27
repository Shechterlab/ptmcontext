"""RNA- and DNA-bound peptides on the site card (kit-sitecard.js, run in Node): each peptide's sequence with the site
residue marked, its extent, its study as a link and its dataset; and the site file keeps RBDmap and pCLAP out of them."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
SITE = yaml.safe_load((ROOT / 'sites' / 'methylarginine.yaml').read_text())
PEP = SITE['website']['protein']['card']['evidence']['peptides']
SOURCES = SITE['website']['protein']['map']['sources']
COLS = ['position', 'kind', 'detail', 'source']


def _run(body: str):
    view = {
        'card': {'evidence': {'peptides': PEP, 'tags': {'tone': {}}}},
        'map': {'sources': SOURCES},
    }
    script = f"""
global.window = {{}}; global.document = {{ getElementById: () => null, addEventListener: () => {{}} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-papers.js'))}, 'utf8'));
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-sitecard.js'))}, 'utf8'));
const D = {{ protein_view: {json.dumps(view)}, tables: {{ interactions: {{ columns: {json.dumps(COLS)} }} }}, attribute_specs: {{}}, words: {{}} }};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const K = {{ D, W: D.words, esc, int: n => String(n), cap: t => String(t)[0].toUpperCase() + String(t).slice(1), clicks: [],
  link: (v, a) => '#' + v + '/' + a, exp: {{ label: k => k }}, map: {{}}, preamble: () => '', CIT: {{}}, download: () => {{}}, prot: {{}} }};
window.PTMC_MODULES[0](K);
window.PTMC_MODULES[1](K);
{body}"""
    return json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_peptides_are_read_from_the_release_detail():
    out = _run(
        """
const rng = K.card.peptideList('capri_adj_peptide', '200-221 MLEQLDMRRDVQEIFRLTPHEK, 200-221 MLEQLDMRRDVQEIFRLTPHEK');
const dna = K.card.peptideList('dna_crosslink', 'peptide 2-6 AAgGR, 2-6 AAGgR (lower case: the residues)');
const xl = K.card.peptideList('rna_crosslink', 'a crosslinked residue. FQIGD[Y]LDIAIT at 139 (226.0 Da)');
const none = K.card.peptideList('pdb_rna', '1-5 AAAAA');
console.log(JSON.stringify({ rng, dna: dna.map(e => [e.start, e.end, e.seq, [...e.mark]]), xl: xl.map(e => [e.start, e.end, e.seq, [...e.mark]]), none }));"""
    )
    assert (
        len(out['rng']) == 1 and out['rng'][0]['start'] == 200 and out['rng'][0]['end'] == 221
    )  # a repeat is one peptide
    assert out['dna'] == [[2, 6, 'AAGGR', [2, 3]]]  # the lower-case letters, merged
    assert out['xl'] == [[134, 145, 'FQIGDYLDIAIT', [5]]]  # the start comes from "at 139" and the marked residue
    assert out['none'] == []  # a kind the site file does not list has no peptides


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_card_shows_sequence_extent_study_and_dataset():
    out = _run(
        """
const tb = { interactions: [[216, 'capri_adj_peptide', '210-218 AAAAAARGG', 'CAPRI'], [216, 'rbrid_residue', '205-216 QQDRGGRGRGGR (log2 1, p 1e-3)', '']] };
const c = { acc: 'P35637', pos: 216, label: 'R216', tb, gene: 'FUS', shown: q => q };
console.log(JSON.stringify({ html: K.card.peptides(c), cols: K.card.peptideColumns }));"""
    )
    h = out['html']
    assert 'AAAAAA<b class="pep-site" title="the site, R216">R</b>GG' in h and '210–218' in h
    assert 'href="https://doi.org/10.1038/s41467-019-10585-3"' in h and 'Panhale et al.' in h
    assert (
        'PRIDE PXD013338' in h and 'PRIDE PXD035484' in h
    )  # the dataset beside each study (a row without a source takes its kind's)
    assert out['cols'] == {'sequence': 'Sequence', 'study': 'Study', 'dataset': 'Dataset'}


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_long_peptide_shows_its_stretch_and_all_of_it():
    seq = ''.join('ACDEFGHIKLMNPQRSTVWY'[i % 20] for i in range(200))
    out = _run(
        f"""
const e = K.card.peptideList('capri_xl_peptide', '1-200 {seq}')[0];
console.log(JSON.stringify(K.card.peptideHtml(e, 100, q => q)));"""
    )
    assert '…' in out and 'full peptide (200 residues)' in out and seq[:20] in out


def test_rbdmap_and_pclap_peptides_stay_out():
    """Their peptides, fragments and extents may not be republished (marks.attributes.evidence.presence_only)."""
    hide = set(SITE['marks']['attributes']['evidence']['presence_only'])
    assert hide and not hide & set(PEP['kinds'])
    srcs = {s for k in PEP['kinds'].values() for s in k.get('sources', [])}
    assert not {'RBDmap', 'pCLAP'} & srcs
    for blk in (
        b
        for pg in SITE['website']['pages']
        for g in pg['groups']
        for s in g['sections']
        for b in s['blocks']
        if b.get('peptides')
    ):
        assert set(blk['columns']) <= set(PEP['columns']) | {'accession', 'kind'}


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_peptide_beside_the_site_says_how_far_off():
    out = _run(
        """
const a = K.card.peptideList('capri_xl_peptide', '15-31 KLFIGGLSFETTDESLR')[0];
const b = K.card.peptideList('capri_xl_peptide', '2-8 SKSESPK')[0];
const c = K.card.peptideList('capri_xl_peptide', '2-14 SKSESPKEPEQLR')[0];
console.log(JSON.stringify([a, b, c].map(e => K.card.peptideHtml(e, 14, q => q, 'R14'))));"""
    )
    assert 'does not cover R14; starts 1 residue after it' in out[0]
    assert 'does not cover R14; ends 6 residues before it' in out[1]
    assert 'does not cover' not in out[2]


def test_the_table_collapses_identical_rows_and_counts_them():
    src = (ASSETS / 'kit-interactions.js').read_text()
    assert 'function collapse(' in src and 'NREC.get(r) || 1' in src and "'n_records'" in src
