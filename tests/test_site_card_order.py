"""The site card's order and its partner counts (kit-sitecard.js, run in Node; kit-proteins.js read as text)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
SITES = Path(__file__).resolve().parents[1] / 'sites'


def _run(body: str, view: dict):
    script = f"""
global.window = {{}}; global.document = {{ getElementById: () => null, addEventListener: () => {{}} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-papers.js'))}, 'utf8'));
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-sitecard.js'))}, 'utf8'));
const D = {{ protein_view: Object.assign({{ card: {{}} }}, {json.dumps(view)}), tables: {{}}, attribute_specs: {{}}, words: {{}} }};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const K = {{ D, W: D.words, esc, int: n => String(n), cap: t => String(t)[0].toUpperCase() + String(t).slice(1), clicks: [],
  link: (v, a, o) => '#' + v + '/' + a + (o && o.open ? '?open=' + o.open : ''), exp: {{ label: k => k }}, map: {{}}, preamble: () => '', CIT: {{}},
  download: () => {{}}, prot: {{ byName: () => '' }} }};
window.PTMC_MODULES[0](K);
window.PTMC_MODULES[1](K);
{body}"""
    return json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)


COLS = ['position', 'group', 'partner_kind', 'partner', 'partner_accession', 'species', 'source', 'id', 'pubmed']
ROWS = [
    # KDM4A binds in three structures and one IntAct record: still one partner
    [3, 'binds_methylated', 'protein', 'KDM4A', 'O75164', '', 'PDB', '5fwe', '1'],
    [3, 'binds_methylated', 'protein', 'KDM4A', 'O75164', '', 'PDB', '5FWF', '1'],
    [3, 'binds_methylated', 'protein', 'KDM4A', 'O75164', '', 'PDB', '5FWG', '2'],
    [3, 'binds_methylated', 'protein', 'KDM4A', 'O75164', '', 'IntAct', 'EBI-1', '3'],
    [3, 'binds_unmodified', 'protein', 'KDM4A', 'O75164', '', 'PDB', '2GFA', '4'],
    [3, 'binds_unmodified', 'protein', 'UHRF1', 'Q96T88', '', 'PDB', '3DB3', '5'],
]
VIEW = {
    'card': {
        'records': {
            'table': 'rec',
            'species': 'Homo sapiens',
            'urls': {'PDB': 'https://x/{id}'},
            'summary': [{'label': 'binds methylated', 'groups': ['binds_methylated'], 'role': 'reader'}],
            'rollup': [
                {'label': 'Binds it methylated', 'groups': ['binds_methylated']},
                {'label': 'Binds the residue, unmodified', 'groups': ['binds_unmodified']},
            ],
            'span': {'group': 'binds_unmodified', 'label': 'In a structure whose peptide spans {site}'},
        }
    }
}


def _ctx(extra: str) -> str:
    return f"""
D.tables.rec = {{ columns: {json.dumps(COLS)} }};
const tb = {{ rec: {json.dumps(ROWS)}, _s: [] }};
const c = {{ acc: 'P62805', pos: 3, label: 'R3', tb, gene: 'H4', isListed: () => false }};
{extra}"""


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_records_are_counted_by_distinct_partner():
    out = _run(
        _ctx(
            'const h = K.card.recordsBlock(c);'
            'console.log(JSON.stringify([h.match(/class="sp-sum">([^<]*)/)[1], h.match(/\\d+ partners?/g)]));'
        ),
        VIEW,
    )
    text, heads = out
    assert text.startswith('2 partners, 5 papers')  # 6 records, 2 partners
    assert 'binds it methylated 1' in text and 'unmodified 2' in text
    assert 'record' not in text.split(':')[0]
    assert heads[1] == '1 partner' and '1 partner' in heads and '2 partners' in heads


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_reader_line_leads_with_the_residue_specific_binders_and_their_structure():
    out = _run(_ctx('console.log(JSON.stringify(K.card.cardSummary(c, {})));'), VIEW)
    assert '>Binds it methylated</a>' in out and 'KDM4A' in out and '(5FWE)' in out


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_structure_span_group_is_closed_and_named_for_the_site():
    out = _run(_ctx('console.log(JSON.stringify(K.card.recordsBlock(c)));'), VIEW)
    g = out.split('id="sc-rec-binds_unmodified"')[1].split('>')[0]
    assert 'open' not in g
    assert 'In a structure whose peptide spans R3' in out and 'Binds it unmodified' not in out
    assert 'id="sc-rec-binds_methylated"' in out


def test_the_card_order_in_the_source():
    src = (ASSETS / 'kit-proteins.js').read_text()
    # Variants closed unless the reader opened it (a link's open= still opens it by id)
    assert "SC_OPEN.get('variants') === true ? ' open' : ''" in src and 'id="sc-variants"' in src
    # one closed list for the questions and the attributes
    assert "group('more-questions'" not in src and "group('attributes'" not in src
    assert '`Other attributes (${nMore})`' in src
    # the Overview's order: variants, interactions, position, experiments, then the sources and the closed list
    assert src.index("group('site'") < src.index("group('records'")
    assert (
        src.index('varBlock +')
        < src.index('${wr}${recs}${ev}')
        < src.index('<section class="sc-site">')
        < src.index('<section class="sc-src">')
        < src.index('<section class="sc-more">')
    )


def test_every_explorer_names_the_structure_span_group():
    for name in ('methylarginine', 'methyllysine', 'lysine', 'phospho'):
        assert (
            'span: {group: binds_unmodified, label: "In a structure whose peptide spans {site}"}'
            in (SITES / f'{name}.yaml').read_text()
        )
