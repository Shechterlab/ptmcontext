"""The site card's summary (kit-sitecard.js, run in Node): the writers UniProt names in a modified residue's text, and
the card's lines, each present only with content."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'

# UniProt "Modified residue" texts, as the REST API gives them
STRINGS = [
    'Phosphothreonine; by IKKE, PDPK1 and TBK1',
    'Phosphoserine; by ATM, ATR, CHEK1 and CHEK2',
    'Phosphoserine; by autocatalysis',
    'Phosphotyrosine; by SRC and ABL1; alternate',
    'Phosphoserine; by CK2',
    'Omega-N-methylarginine; by PRMT1',
    'N6-methyllysine',
    'Phosphoserine',
]


def _run(body: str, view: dict | None = None):
    script = f"""
global.window = {{}}; global.document = {{ getElementById: () => null, addEventListener: () => {{}} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-papers.js'))}, 'utf8'));
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-sitecard.js'))}, 'utf8'));
const D = {{ protein_view: Object.assign({{ card: {{}} }}, {json.dumps(view or {})}), tables: {{}}, attribute_specs: {{}}, words: {{}} }};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const K = {{ D, W: D.words, esc, int: n => String(n), cap: t => String(t)[0].toUpperCase() + String(t).slice(1), clicks: [],
  link: (v, a, o) => '#' + v + '/' + a + (o && o.open ? '?open=' + o.open : ''), exp: {{ label: k => k }}, map: {{}}, preamble: () => '', CIT: {{}},
  download: () => {{}}, prot: {{ byName: n => (n === 'PDPK1' ? 'O15530' : '') }} }};
window.PTMC_MODULES[0](K);
window.PTMC_MODULES[1](K);
{body}"""
    return json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_uniprot_writers_come_from_the_by_clause():
    out = _run(f'console.log(JSON.stringify({json.dumps(STRINGS)}.map(s => K.card.uniWriters(s))));')
    assert out == [
        ['IKKE', 'PDPK1', 'TBK1'],
        ['ATM', 'ATR', 'CHEK1', 'CHEK2'],
        [],  # autocatalysis is not an enzyme to name
        ['SRC', 'ABL1'],  # a later ";" segment ("alternate") is not part of the list
        ['CK2'],
        ['PRMT1'],
        [],
        [],
    ]


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_summary_has_a_line_only_with_content():
    out = _run(
        """
const c = { acc: 'P1', pos: 308, label: 'T308', tb: {}, gene: 'AKT1', isListed: a => a === 'O15530' };
const uni = [{ type: 'Modified residue', description: 'Phosphothreonine; by IKKE, PDPK1 and TBK1' }];
console.log(JSON.stringify({ none: K.card.cardSummary(c, {}), uni: K.card.cardSummary(c, { uni, near: 'Phosphosite S1 (-2)' }) }));"""
    )
    assert out['none'] == ''  # no placeholder lines
    assert out['uni'].count('<div>') == 2  # writer, nearby marks: nothing else has content
    assert '(UniProt)' in out['uni'] and '>IKKE</b></a>, ' in out['uni'] and 'href="#protein/O15530"' in out['uni']
    assert 'sc-uniprot' in out['uni'] and 'Phosphosite S1' in out['uni']


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_every_writer_name_is_a_link():
    """Listed protein -> its page here; alias -> the listed protein; unlisted or family name -> a UniProt search
    (human, reviewed); never a guessed accession."""
    out = _run(
        """
K.prot.byName = n => ({ PDPK1: 'O15530', IKKE: 'Q14164' })[n] || '';
K.prot.isListed = () => true;
const c = { acc: 'P1', pos: 15, label: 'S15', tb: {}, gene: 'TP53', isListed: K.prot.isListed };
const uni = [{ type: 'Modified residue', description: 'Phosphoserine; by PDPK1, IKKE, PRMT5, AMPK and PRPK' }];
console.log(JSON.stringify(K.card.cardSummary(c, { uni })));"""
    )
    assert 'href="#protein/O15530"' in out  # listed
    assert 'href="#protein/Q14164"' in out and '>IKKE</b>' in out  # alias of a listed protein
    assert 'uniprotkb/' not in out.replace('uniprotkb?', '')  # no guessed accession
    for n in ('PRMT5', 'AMPK', 'PRPK'):  # unlisted or family names: a human reviewed gene search
        assert f'query=gene%3A{n}+AND+organism_id%3A9606+AND+reviewed%3Atrue' in out


def test_by_name_resolves_through_gene_symbols_only():
    src = (ASSETS / 'kit-proteins.js').read_text()
    line = next(x for x in src.splitlines() if 'byName:' in x)
    assert 'P_SYM' in line and 'nameOf' not in line  # not the free-text aliases ("AMPK" is a complex, not PRKAA2)
    assert 'D.protein_symbols' in src


COMPLEXES = ['AMPK', 'CK2', 'CK1', 'IKK', 'PKA', 'PKC', 'CaMKII', 'CDK', 'MAPK', 'ERK', 'PP2A', 'PP1']


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_complex_names_never_resolve_to_one_protein():
    """AMPK is a gene alias of PRKAA2 and CK2 of CSNK2A1, but they name complexes; IKKE and PRPK are single-gene aliases."""
    out = _run(
        """
K.prot.byName = n => ({ AMPK: 'P54646', CK2: 'P68400', IKKE: 'Q14164', PRPK: 'Q96S44' })[n] || '';
K.prot.isListed = () => true;
const c = { acc: 'P1', pos: 15, label: 'S15', tb: {}, gene: 'TP53', isListed: K.prot.isListed };
const uni = [{ type: 'Modified residue', description: 'Phosphoserine; by CK2, AMPK, IKKE and PRPK' }];
console.log(JSON.stringify(K.card.cardSummary(c, { uni })));""",
        {'complex_names': COMPLEXES},
    )
    assert 'P54646' not in out and 'P68400' not in out  # no complex links to one member
    for n in ('AMPK', 'CK2'):
        assert f'query=gene%3A{n}+AND+organism_id%3A9606+AND+reviewed%3Atrue' in out
    assert 'href="#protein/Q14164"' in out and 'href="#protein/Q96S44"' in out  # single-gene aliases stay


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_complex_names_are_configured_not_coded():
    assert 'AMPK' not in (ASSETS / 'kit-sitecard.js').read_text()
    root = ASSETS.parents[2]
    for site in ('lysine', 'methyllysine', 'methylarginine', 'phospho'):
        text = (root / 'sites' / f'{site}.yaml').read_text()
        assert 'complex_names:' in text and 'PP2A' in text, site


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_other_species_fold_after_the_human_records_and_an_eraser_line_shows():
    cols = ['position', 'group', 'partner_kind', 'partner', 'partner_accession', 'species']
    rec = lambda g, n, sp='': [15, g, 'protein', n, '', sp]
    rows = [
        rec('writes', 'PRMT1'),
        rec('writes', 'PRMT7', 'Trypanosoma brucei'),
        rec('writes', 'prmt-5', 'Caenorhabditis elegans'),
        rec('removes', 'JMJD4'),
        rec('removes', 'kdm-1', 'Caenorhabditis elegans'),
        rec('binds', 'KDM4A'),
        rec('binds', 'PRMT7', 'Trypanosoma brucei'),
        rec('only', 'hrp1', 'Mus musculus'),
    ]
    summary = [
        {'label': 'Writes', 'groups': ['writes'], 'role': 'writer'},
        {'label': 'erases', 'groups': ['removes'], 'role': 'eraser'},
        {'label': 'binds', 'groups': ['binds'], 'role': 'reader'},
    ]
    view = {'card': {'records': {'table': 'rec', 'species': 'Homo sapiens', 'summary': summary}}}
    out = _run(
        f"""
D.tables.rec = {{ columns: {json.dumps(cols)} }};
const tb = {{ rec: {json.dumps(rows)}, _s: [] }};
const c = {{ acc: 'P1', pos: 15, label: 'R3', tb, gene: 'H4', isListed: () => false }};
console.log(JSON.stringify(K.card.cardSummary(c, {{}})));""",
        view,
    )
    assert out.count('<dt>') == 3 and '>Eraser</a>' in out
    w = out.split('Writer</a>')[1].split('</dd>')[0]
    assert w.index('PRMT1') < w.index('+2 in other species') < w.index('PRMT7') and '(T. brucei)' in w
    assert w.count('<details') == 1 and '(C. elegans)' in w
    e = out.split('Eraser</a>')[1].split('</dd>')[0]
    assert 'JMJD4' in e and '+1 in other species' in e and 'kdm-1' in e
    b = out.split('Binding proteins</a>')[1].split('</dd>')[0]
    assert b.startswith('</a>') is False and '1: ' in b
    assert 'KDM4A' in b and '+1 in other species' in b


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_line_of_only_other_species_says_no_human_and_folds_the_names():
    cols = ['position', 'group', 'partner_kind', 'partner', 'partner_accession', 'species']
    rows = [[15, 'binds', 'protein', 'hrp1', '', 'Mus musculus']]
    view = {
        'card': {
            'records': {
                'table': 'rec',
                'species': 'Homo sapiens',
                'summary': [{'label': 'binds', 'groups': ['binds'], 'role': 'reader'}],
            }
        }
    }
    out = _run(
        f"""
D.tables.rec = {{ columns: {json.dumps(cols)} }};
const c = {{ acc: 'P1', pos: 15, label: 'R3', tb: {{ rec: {json.dumps(rows)}, _s: [] }}, gene: 'H4', isListed: () => false }};
console.log(JSON.stringify(K.card.cardSummary(c, {{}})));""",
        view,
    )
    assert 'No human binder' in out and '1 in other species ▸' in out
    assert 'hrp1' in out and '(M. musculus)' in out
