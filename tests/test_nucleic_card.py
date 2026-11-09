"""The protein page's RNA and DNA interactions card (CONTRACTS.md, "RNA and DNA interactions"): a toy site's tables, in
their own layouts, are mapped in website.protein.nucleic; they reach each protein's record in the formats' columns, the
card (kit-prna.js, run in Node) counts them with the site file's words, a protein without data and a site without the
block have no card, and the checks name a mapping that misses a table or a column."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pandas as pd
import pytest
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file
from ptmcontext.web import nucleic as N

P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
P2 = 'MRAAARAAARAAAAAAAAAAAAAARAAAR'
ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _toy(tmp_path, nucleic=True):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(
        f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{P1}\n>sp|P2|TWO_TOY Two protein OS=Toy OX=1 GN=TWO PE=1 SV=1\n{P2}\n'
    )
    pd.DataFrame({'acc': ['P1', 'P1', 'P2'], 'pos': [2, 5, 2], 'ev': ['flagged_x', '', '']}).to_csv(
        data / 'marks.tsv', sep='\t', index=False
    )
    pd.DataFrame(
        {
            'site': ['P1:R5'],
            'entry': ['1ABC'],
            'na_chain': ['C'],
            'na': ['rna'],
            'what': ['an RNA'],
            'nts': ['G3; U4'],
            'nums': ['3; 4'],
            'dists': ['2.9; 3.8'],
            'win': ['--AG[G][U]C--'],
        }
    ).to_csv(data / 'bound.tsv', sep='\t', index=False)
    pd.DataFrame({'site': ['P1:R2'], 'na': ['rna'], 'win': ['AC[G]UA'], 'off': ['3'], 'entry': ['1abc']}).to_csv(
        data / 'near.tsv', sep='\t', index=False
    )
    pd.DataFrame(
        {
            'protein': ['P1', 'P1'],
            'a': ['1', '4'],
            'b': ['6', '4'],
            'what': ['rna', 'rna'],
            'n': ['2', '1'],
            'inside': ['P1:R2; P1:R5', ''],
        }
    ).to_csv(data / 'regions.tsv', sep='\t', index=False)
    pd.DataFrame({'protein': ['P1', 'P1'], 'from': [3, 8], 'to': [3, 12], 'type': ['xl_rna', 'xl_rna']}).to_csv(
        data / 'xl.tsv', sep='\t', index=False
    )
    pd.DataFrame(
        {
            'protein': ['P1'],
            'exp': ['EXP1'],
            'line': ['K562'],
            'src': ['LAB'],
            'peaks': ['100'],
            'cds': ['30'],
            'utr': ['70'],
            'genes': ['G1; G2'],
            'gp': ['5; 4'],
            'five': ['AAAAA; CCCCC'],
        }
    ).to_csv(data / 'eclip.tsv', sep='\t', index=False)

    def entry(f, **kw):
        return {
            'file': f,
            'md5': md5_file(data / f),
            'source': 'synthetic, for a test',
            'version': 'test 1',
            'licence': 'CC0 1.0',
            **kw,
        }

    names = ['bound', 'near', 'regions', 'xl', 'eclip']
    (root / 'sites' / 'toy.inputs.json').write_text(
        json.dumps(
            {
                'schema_version': 1,
                'inputs': {
                    'toy_fasta': entry('toy.fasta', version='Toy 2026_01'),
                    'toy_marks': entry('marks.tsv'),
                    **{f'toy_{n}': entry(f'{n}.tsv') for n in names},
                },
            },
            indent=1,
        )
    )
    tables = {
        'bound': {
            'input': 'toy_bound',
            'format': 'bound_windows',
            'columns': {
                'site': 'site',
                'window': 'win',
                'kind': 'na',
                'name': 'what',
                'entry': 'entry',
                'chain': 'na_chain',
                'nucleotides': 'nts',
                'numbers': 'nums',
                'distances': 'dists',
            },
        },
        'near': {
            'input': 'toy_near',
            'format': 'bound_windows',
            'columns': {'site': 'site', 'window': 'win', 'kind': 'na', 'offset': 'off', 'entry': 'entry'},
        },
        'regions': {
            'input': 'toy_regions',
            'format': 'protein_records',
            'columns': {'accession': 'protein'},
            'values': ['a', 'b', 'what', 'n', 'inside'],
        },
        'xl': {
            'input': 'toy_xl',
            'format': 'residue_evidence',
            'columns': {'accession': 'protein', 'start': 'from', 'end': 'to', 'kind': 'type'},
        },
        'eclip': {
            'input': 'toy_eclip',
            'format': 'protein_records',
            'columns': {'accession': 'protein'},
            'values': ['exp', 'line', 'src', 'peaks', 'cds', 'utr', 'genes', 'gp', 'five'],
        },
    }
    card = {
        'kinds': {'rna': 'RNA', 'dna': 'DNA'},
        'near': {'table': 'near'},
        'regions': {
            'table': 'regions',
            'kinds': {'rna': 'rna'},
            'fields': {'start': 'a', 'end': 'b', 'kind': 'what', 'entries': 'n', 'sites': 'inside'},
        },
        'crosslinks': {'table': 'xl', 'span': 2, 'kinds': {'xl_rna': 'rna'}},
        'flags': {'attribute': 'ev', 'kind': 'rna', 'values': {'flagged_x': 'Flag X'}},
        'eclip': {
            'table': 'eclip',
            'kind': 'rna',
            'url': {'LAB': 'https://example.org/{id}'},
            'fields': {
                'id': 'exp',
                'source': 'src',
                'cell': 'line',
                'peaks': 'peaks',
                'genes': 'genes',
                'gene_peaks': 'gp',
                'kmers': 'five',
                'regions': {'CDS': 'cds', '3′ UTR': 'utr'},
            },
        },
    }
    site = {
        'schema_version': 1,
        'id': 'toy',
        'title': 'A toy site',
        'status': 'working',
        'mark': 'methylarginine',
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': {},
        'marks': {
            'input': 'toy_marks',
            'accession': 'acc',
            'position': 'pos',
            'residue_mismatch': 'error',
            'attributes': {'ev': {'column': 'ev', 'label': 'Evidence', 'kind': 'list', 'values': {'flagged_x': 'X'}}},
        },
        'analyses': [{'id': 'motif', 'layer': 'motif'}],
        'outputs': {'folder': 'out/toy'},
        'website': {
            'name': 'Toy Explorer',
            'tables': tables,
            'protein': {'structure': {'bound': {'table': 'bound'}}, **({'nucleic': card} if nucleic else {})},
        },
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def _build(root):
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    return web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)


def test_the_toy_mapping_is_clean_and_a_wrong_one_is_named(tmp_path):
    root = _toy(tmp_path)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    assert S.website_problems(site) == [] and N.problems(site) == []
    bad = json.loads(json.dumps(site))
    bad['website']['protein']['nucleic'].update(
        {
            'eclip': {'table': 'nowhere'},
            'regions': {'table': 'regions', 'kinds': {'rna': 'protein'}, 'fields': {'start': 'zzz'}},
        }
    )
    bad['website']['protein']['nucleic']['near'] = {'table': 'regions'}
    got = ' | '.join(N.problems(bad))
    assert (
        "no table 'nowhere'" in got
        and "has no column 'zzz'" in got
        and 'not one of kinds' in got
        and 'the card reads a bound_windows table' in got
    )


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_card_counts_what_the_tables_hold_and_a_protein_without_data_has_none(tmp_path):
    root = _toy(tmp_path)
    index = _build(root)
    folder = index.parent / 'data'
    page = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    assert page['tables']['regions'] == {'format': 'protein_records', 'columns': ['a', 'b', 'what', 'n', 'inside']}
    assert page['protein_view']['nucleic']['kinds'] == {'rna': 'RNA', 'dna': 'DNA'}

    def record(acc):
        sh = json.loads((folder / 'p' / f'{web.shard_of(acc):02d}.json').read_text())
        return sh[acc]

    def tables(acc):
        sh = json.loads((folder / 'e' / f'{web.shard_of(acc):02d}.json').read_text())
        return {**sh.get(acc, {}), '_s': sh.get('_s', [])}

    script = f"""
global.window = {{}}; global.document = {{ getElementById: () => null, querySelector: () => null, addEventListener: () => {{}} }};
const D = {json.dumps(page)}, esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const TB = {json.dumps({'P1': tables('P1'), 'P2': tables('P2')})}, REC = {json.dumps({'P1': record('P1'), 'P2': record('P2')})};
for (const f of ['kit-sitecard.js', 'kit-prna.js']) eval(require('fs').readFileSync({json.dumps(str(ASSETS))} + '/' + f, 'utf8'));
const K = {{ D, W: D.words, esc, int: n => String(n), cap: t => String(t)[0].toUpperCase() + String(t).slice(1), clicks: [], link: (v, a) => '#' + v + '/' + a, sections: {{ protein: () => [] }},
  map: {{ attrColour: () => '#000' }}, prot: {{ tables: acc => TB[acc], shownPos: (a, q) => q }} }};
window.PTMC_MODULES.forEach(m => m(K));
const fold = (id, title, sum, body) => JSON.stringify({{ id, title, sum, body }});
const out = {{}};
for (const acc of ['P1', 'P2']) out[acc] = K.proteinFolds.map(f => f({{ acc, gene: acc }}, REC[acc], fold)).join('');
console.log(JSON.stringify(out));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert out['P2'] == ''  # no data in any part: no card
    f = json.loads(out['P1'])
    assert f['id'] == 'p-na'
    assert (
        'RNA: 1 site in structural contact (side chain within 4 Å), 1 more' in f['sum']
        and '1 residue crosslinked in cells (2 sites within 2 residues of one)' in f['sum']
    )
    assert '2 bound regions in structures' in f['sum'] and 'eCLIP' in f['sum'] and 'DNA: none recorded' in f['sum']
    body = f['body']
    assert (
        'sites within' in f['sum'] and '8–12' not in body
    )  # a crosslinked stretch is not listed: only single residues
    assert (
        '<b class="nt hit">G</b>' in body
        and 'via i+3' in body
        and 'Flag X' in body
        and 'href="https://example.org/EXP1"' in body
    )
    assert 'G1' in body and 'AAAAA' in body and '1ABC' in body


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_site_without_the_block_has_no_card(tmp_path):
    root = _toy(tmp_path, nucleic=False)
    index = _build(root)
    page = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    assert 'nucleic' not in (page.get('protein_view') or {})
    script = f"""
global.window = {{}}; const D = {json.dumps(page)}, K = {{ D, W: D.words, esc: s => s, int: String, cap: String, clicks: [], card: {{}}, prot: {{ tables: () => ({{}}) }} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-prna.js'))}, 'utf8')); window.PTMC_MODULES.forEach(m => m(K));
console.log(JSON.stringify({{ folds: (K.proteinFolds || []).length }}));"""
    assert json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout) == {
        'folds': 0
    }
