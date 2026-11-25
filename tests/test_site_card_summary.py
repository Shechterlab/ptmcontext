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


def _run(body: str):
    script = f"""
global.window = {{}}; global.document = {{ getElementById: () => null, addEventListener: () => {{}} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-papers.js'))}, 'utf8'));
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-sitecard.js'))}, 'utf8'));
const D = {{ protein_view: {{ card: {{}} }}, tables: {{}}, attribute_specs: {{}}, words: {{}} }};
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
