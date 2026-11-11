"""The tables the protein pages show (CONTRACTS.md, "Tables the protein pages show"): a toy site hands a few rows in each
format, from tables in their own column layouts mapped in the site file, and the website keeps them per protein in the
format's columns (data/e), on a protein without marks the rows naming it (data/u), lookups and other names in the page's
data; the site card's blocks (kit-sitecard.js, run in Node) show them with the site file's words. A site without the
tables has none of it, and the checks name a mapping that misses a column."""

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
from shard_files import shard_path
from ptmcontext.snapshot import md5_file
from ptmcontext.web import tables as T

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'

#    1        10        20        30
P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
P2 = 'MRAAARAAARAAAAAAAAAAAAAARAAAR'
P3 = 'MKKKKKKKKKKKKKKKKKKKKK'  # no candidate residue marked: a light page
ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _toy(tmp_path, with_tables=True):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(
        f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{P1}\n'
        f'>sp|P2|TWO_TOY Two protein OS=Toy OX=1 GN=TWO PE=1 SV=1\n{P2}\n'
        f'>sp|P3|THREE_TOY Three protein OS=Toy OX=1 GN=THREE PE=1 SV=1\n{P3}\n'
    )
    pd.DataFrame(
        {
            'acc': ['P1', 'P1', 'P2'],
            'pos': [2, 5, 25],
            'state': ['me1', 'me2', 'me1'],
            'src': ['LabA; LabB', 'LabA', 'LabB'],
            'doi': ['10.1/a; 10.1/b', '10.1/a', '10.1/b'],
            'ev': ['xl; pred', 'pdb', ''],
        }
    ).to_csv(data / 'marks.tsv', sep='\t', index=False)
    # each table in its own layout: the site file maps its columns to the format's
    pd.DataFrame(
        {
            'where': ['P1:R2', 'P1:R2', 'P2:R25'],
            'what': ['pdb', 'pred', 'pdb'],
            'who': ['', 'TWO', ''],
            'entries': ['1abc; 2def', '', '3ghi'],
        }
    ).to_csv(data / 'evidence.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'where': ['P1:R2', 'P1:R2'],
            'chainwin': ['--AC[G]U--', '--AC[G]U--'],
            'na': ['rna', 'rna'],
            'kind_of': ['oligo_t', 'oligo_t'],
            'pdb': ['1abc', '2def'],
            'made': ['synthetic', 'synthetic'],
            'dist': ['3.1', '2.9'],
        }
    ).to_csv(data / 'windows.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'where': ['P1:R2', 'P1:R5', 'P2:R25'],
            'cls': ['binder', 'binder', 'binder'],
            'gene': ['TWO', 'THREE', 'THREE'],
            'acc2': ['P2', 'P3', 'P3'],
            'pk': ['protein', 'protein', 'protein'],
            'db': ['PDB', 'PDB', 'IntAct'],
            'id': ['1abc', '2def', 'EBI-1'],
            'st': ['me1', 'me2', 'arginine'],
            'paper': ['Ann et al., J (2020)', 'Bob et al., J (2021)', ''],
        }
    ).to_csv(data / 'records.tsv', sep='\t', index=False)
    pd.DataFrame(
        {'where': ['P1:R2', 'P1:R5'], 'cond': ['ko_a', 'ko_a'], 'res': ['down', 'flat'], 'n': ['2', '1']}
    ).to_csv(data / 'measures.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'placed': ['P1:R2', 'P1:R2', ''],
            'lab': ['LabA', 'LabB', 'LabA'],
            'pep': ['MR(me)GGR', 'RGGR', 'X'],
            'how': ['ok_code', 'near_code', ''],
        }
    ).to_csv(data / 'sources.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'protein': ['P1', 'P1'],
            'partner': ['P2', 'P3'],
            'pgene': ['TWO', 'THREE'],
            'sc': ['0.9', '0.8'],
            'cl': ['writer', ''],
        }
    ).to_csv(data / 'partners.tsv', sep='\t', index=False)
    pd.DataFrame({'protein': ['P1', 'P2'], 'other_names': ['UNO', ''], 'arg_q': ['0.01', '0.5']}).to_csv(
        data / 'proteins.tsv', sep='\t', index=False
    )
    pd.DataFrame(
        {
            'id': ['LabA', 'LabB'],
            'label': ['Lab A 2020', 'Lab B 2021'],
            'citation': ['Ann et al., J 1:1 (2020)', 'Bob et al., J 2:2 (2021)'],
            'doi': ['10.1/a', '10.1/b'],
        }
    ).to_csv(data / 'labs.tsv', sep='\t', index=False)
    names = ['evidence', 'windows', 'records', 'measures', 'sources', 'partners', 'proteins', 'labs']

    def entry(f, **kw):
        return {
            'file': f,
            'md5': md5_file(data / f),
            'source': 'synthetic, for a test',
            'version': 'test 1',
            'licence': 'CC0 1.0',
            **kw,
        }

    manifest = {
        'schema_version': 1,
        'inputs': {
            'toy_fasta': entry('toy.fasta', version='Toy 2026_01'),
            'toy_marks': entry('marks.tsv'),
            **{f'toy_{n}': entry(f'{n}.tsv') for n in names},
        },
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    tables = {
        'ev': {
            'input': 'toy_evidence',
            'format': 'site_evidence',
            'columns': {'site': 'where', 'kind': 'what', 'partner': 'who', 'ids': 'entries'},
        },
        'win': {
            'input': 'toy_windows',
            'format': 'bound_windows',
            'columns': {
                'site': 'where',
                'window': 'chainwin',
                'kind': 'na',
                'type': 'kind_of',
                'entry': 'pdb',
                'preparation': 'made',
                'distance': 'dist',
            },
        },
        'rec': {
            'input': 'toy_records',
            'format': 'site_records',
            'columns': {
                'site': 'where',
                'group': 'cls',
                'partner': 'gene',
                'partner_accession': 'acc2',
                'partner_kind': 'pk',
                'source': 'db',
                'id': 'id',
                'state': 'st',
                'citation': 'paper',
            },
        },
        'meas': {
            'input': 'toy_measures',
            'format': 'site_measurements',
            'columns': {'site': 'where', 'condition': 'cond', 'call': 'res', 'n': 'n'},
        },
        'src': {
            'input': 'toy_sources',
            'format': 'source_records',
            'columns': {'site': 'placed', 'source': 'lab', 'peptide': 'pep', 'check': 'how'},
        },
        'str': {
            'input': 'toy_partners',
            'format': 'protein_partners',
            'columns': {
                'accession': 'protein',
                'partner_accession': 'partner',
                'partner': 'pgene',
                'score': 'sc',
                'classes': 'cl',
            },
        },
        'prot': {
            'input': 'toy_proteins',
            'format': 'protein_values',
            'columns': {'accession': 'protein', 'aliases': 'other_names'},
            'values': ['arg_q'],
        },
        'labs': {
            'input': 'toy_labs',
            'format': 'lookup',
            'columns': {'key': 'id'},
            'values': ['label', 'citation', 'doi'],
        },
    }
    card = {
        'evidence': {
            'status': 'state',
            'tags': {
                'attribute': 'ev',
                'short': {'xl': 'XL', 'pred': 'pred.'},
                'tone': {'xl': 'a'},
                'predicted': ['pred'],
                'partners': 'ev',
            },
            'entries': {'table': 'ev', 'kinds': {'pdb': 'Structure'}, 'url': 'https://example.org/{id}'},
            'sequences': {
                'tables': ['win'],
                'kinds': {'rna': 'RNA'},
                'types': {'oligo_t': 'Toy oligo'},
                'designed': {'preparation': 'synthetic', 'label': 'designed'},
            },
        },
        'calls': {
            'tables': ['meas'],
            'conditions': {'ko_a': 'Knockout A'},
            'marks': {'down': 'v'},
            'quiet': 'no change',
        },
        'records': {
            'title': 'Who binds it',
            'table': 'rec',
            'groups': 'rec_class',
            'states': {'arginine': 'unmodified'},
        },
        'writer': {
            'who': [{'label': 'Binds it', 'groups': ['binder'], 'none': 'nobody'}],
            'partners': {'table': 'str', 'classes': {'writer': 'Writers of {gene}'}, 'none': 'none'},
        },
        'sources': {
            'table': 'src',
            'attribute': 'studies',
            'checks': {'ok_code': 'Placed well', 'near_code': 'Placed near'},
            'warn': ['near_code'],
        },
        'cite': {'attribute': 'studies', 'lookup': 'labs'},
    }
    site = {
        'schema_version': 1,
        'id': 'toy',
        'title': 'A toy site',
        'status': 'working',
        'mark': str(MARKS / 'methylarginine.yaml'),
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'inputs': {},
        'marks': {
            'input': 'toy_marks',
            'accession': 'acc',
            'position': 'pos',
            'residue_mismatch': 'error',
            'attributes': {
                'state': {
                    'column': 'state',
                    'label': 'State',
                    'kind': 'category',
                    'colour': True,
                    'values': {'me1': 'One', 'me2': 'Two'},
                },
                'studies': {
                    'column': 'src',
                    'label': 'Labs',
                    'kind': 'list',
                    'link': {'column': 'doi', 'url': 'https://doi.org/{}'},
                    'provenance': True,
                },
                'ev': {
                    'column': 'ev',
                    'label': 'Evidence',
                    'kind': 'list',
                    'values': {'xl': 'Crosslink', 'pred': 'Predicted', 'pdb': 'Structure'},
                },
                'rec_class': {'column': 'state', 'label': 'Record', 'kind': 'list', 'values': {'binder': 'Binds it'}},
            },
        },
        'analyses': [{'id': 'motif', 'layer': 'motif'}],
        'outputs': {'folder': 'out/toy'},
        'website': {
            'name': 'Toy Explorer',
            **(
                {'tables': tables, 'protein': {'card': card, 'numbering': [{'genes': '^TWO$', 'offset': -1}]}}
                if with_tables
                else {}
            ),
        },
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def _page_data(index):
    return json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )


def _rows(folder, acc):
    """A protein's rows in a shard, its repeated strings read back (a site-keyed row's first value is its position)."""
    sh = json.loads(shard_path(folder, acc).read_text())
    s = sh.get('_s', [])
    back = lambda xs: [s[x] if isinstance(x, int) else x for x in xs]  # noqa: E731
    return {
        n: [[r[0], *back(r[1:])] if r and isinstance(r[0], int) else back(r) for r in rows]
        for n, rows in sh.get(acc, {}).items()
    }


def test_the_tables_reach_each_protein_in_their_formats(tmp_path):
    root = _toy(tmp_path)
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    assert S.mapping_problems(S.load_site(root / 'sites' / 'toy.yaml'), root / 'data') == []
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = _page_data(index)
    assert data['tables']['ev'] == {'format': 'site_evidence', 'columns': ['position', 'kind', 'partner', 'ids']}
    assert data['tables']['src']['columns'][:2] == ['position', 'source']
    assert data['lookups']['labs']['LabB']['citation'] == 'Bob et al., J 2:2 (2021)'
    assert data['protein_aliases'] == {'P1': 'UNO'}
    e = index.parent / 'data' / 'e'
    p1 = _rows(e, 'P1')
    assert sorted(p1) == ['ev', 'meas', 'prot', 'rec', 'src', 'str', 'win']
    assert [r[0] for r in p1['src']] == [2, 2]  # a record placed nowhere is not kept
    assert [r[:2] for r in p1['meas']] == [[2, 'ko_a'], [5, 'ko_a']]
    # a protein without marks: its record on its light page, the rows that name it, and the index that finds it
    u = json.loads(shard_path(index.parent / 'data' / 'u', 'P3').read_text())
    p3 = u['P3']
    assert p3['gene'] == 'THREE' and p3['seq'] == P3
    assert sorted(p3['tables']) == ['rec', 'str']
    idx = json.loads((index.parent / 'data' / 'u' / 'index.json').read_text())
    assert ['P3', 'THREE', 'THREE_TOY', 3] in idx


def test_a_site_without_the_tables_has_none_of_it(tmp_path):
    root = _toy(tmp_path, with_tables=False)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = _page_data(index)
    assert 'tables' not in data and not (index.parent / 'data' / 'e').exists()


def test_a_mapping_that_misses_a_column_is_named():
    assert T.problems('x', {'input': 'i', 'format': 'bound_windows', 'columns': {'site': 's', 'window': 'w'}}) == [
        "website.tables.x: the bound_windows format needs a column 'kind'"
    ]
    assert 'no format' in T.problems('x', {'input': 'i', 'format': 'nothing', 'columns': {}})[0]
    assert any(
        'has no column' in x
        for x in T.problems(
            'x', {'input': 'i', 'format': 'site_evidence', 'columns': {'site': 's', 'kind': 'k', 'colour': 'c'}}
        )
    )
    assert any(
        'name the site' in x
        for x in T.problems('x', {'input': 'i', 'format': 'site_evidence', 'columns': {'kind': 'k'}})
    )


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_site_card_shows_the_formats_with_the_site_files_words(tmp_path):
    root = _toy(tmp_path)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = _page_data(index)
    shard = json.loads(shard_path(index.parent / 'data' / 'e', 'P1').read_text())
    tb = {**shard['P1'], '_s': shard.get('_s', [])}
    script = f"""
global.window = {{}}; global.document = {{ getElementById: () => null, addEventListener: () => {{}} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-papers.js'))}, 'utf8'));
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-sitecard.js'))}, 'utf8'));
const D = {json.dumps(data)}, esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const K = {{ D, W: D.words, esc, int: n => String(n), cap: t => String(t)[0].toUpperCase() + String(t).slice(1), clicks: [], link: (v, a) => '#' + v + '/' + a,
  map: {{ attrColour: () => '#000' }}, preamble: () => '', CIT: {{}}, download: () => {{}} }};
window.PTMC_MODULES[0](K);
window.PTMC_MODULES[1](K);
const attrs = {{ state: 'me1', ev: 'xl; pred', studies: 'LabA; LabB', rec_class: '' }};
const c = {{ p: {{ acc: 'P1' }}, tb: {json.dumps(tb)}, acc: 'P1', pos: 2, gene: 'ONE', label: 'R2', seq: {json.dumps(P1)}, window: '______MRGGRAAAA',
  shown: q => q, attr: n => attrs[n] ?? '', attrHtml: (n, v) => v, isListed: a => a === 'P2' }};
console.log(JSON.stringify({{ ev: K.card.evidenceBlock(c), rec: K.card.recordsBlock(c), wr: K.card.writerBlock(c), calls: K.card.calls(c),
  row: K.card.evidenceRow(c), cite: K.card.citeBox('the toy sites', [1], (m, n) => attrs[n], true), five: K.card.calls({{ ...c, pos: 5 }}) }}));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert 'XL' in out['ev'] and 'pred. TWO' in out['ev']  # tags: short words, the predicted partner
    assert 'Structure</b>' in out['ev'] and '1ABC' in out['ev'] and '2DEF' in out['ev']  # the entries at the site
    assert (
        '<b class="nt hit">G</b>' in out['ev']
        and 'Toy oligo' in out['ev']
        and 'designed' in out['ev']
        and '2 entries' in out['ev']
    )
    assert (
        'Who binds it' in out['rec']
        and 'Binds it' in out['rec']
        and 'Ann et al., J (2020)' in out['rec']
        and 'href="#protein/P2"' in out['rec']
    )
    assert 'Binds it' in out['wr'] and 'TWO' in out['wr'] and 'Writers of ONE' in out['wr']
    assert '<b>v</b>Knockout A' in out['calls'] and 'no change' in out['five']
    assert (
        'Placed well' in out['row']
        and 'Placed near' in out['row']
        and '⚠' in out['row']
        and '<span class="c" title="This site">' in out['row']
    )
    assert 'Ann et al., J 1:1 (2020)' in out['cite'] and 'doi:10.1/b' in out['cite']


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_sites_pages_one_small_file_draws_the_same_blocks_as_the_shards(tmp_path):
    """data/sites_default.json holds only the rows the default columns' blocks read; each of those blocks, at every
    marked site, comes out the same from it as from the protein's whole shard."""
    root = _toy(tmp_path)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    data = _page_data(index)
    folder = index.parent / 'data'
    assert data['sites_default']['blocks'] == ['status', 'tags', 'sequences', 'around', 'calls']
    assert 'ev' in data['sites_default']['tables'] and 'meas' in data['sites_default']['tables']
    small = json.loads((folder / 'sites_default.json').read_text())
    whole = json.loads(shard_path(folder / 'e', 'P1').read_text())
    assert (folder / 'sites_default.json').stat().st_size < sum(f.stat().st_size for f in (folder / 'e').glob('*.json'))
    script = f"""
global.window = {{}}; global.document = {{ getElementById: () => null, addEventListener: () => {{}} }};
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-papers.js'))}, 'utf8'));
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-sitecard.js'))}, 'utf8'));
const D = {json.dumps(data)}, esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const K = {{ D, W: D.words, esc, int: n => String(n), cap: t => String(t)[0].toUpperCase() + String(t).slice(1), clicks: [], link: (v, a) => '#' + v + '/' + a,
  map: {{ attrColour: () => '#000' }}, preamble: () => '', CIT: {{}}, download: () => {{}} }};
window.PTMC_MODULES[0](K);
window.PTMC_MODULES[1](K);
const attrs = {{ state: 'me1', ev: 'xl; pred', studies: 'LabA; LabB', rec_class: '' }};
const full = {{ ...{json.dumps(whole)}['P1'], _s: {json.dumps(whole.get('_s', []))} }}, part = {{ ...({json.dumps(small)}['P1'] || {{}}), _s: {json.dumps(small.get('_s', []))} }};
const draw = (tb, pos) => {{ const c = {{ p: {{ acc: 'P1' }}, tb, acc: 'P1', pos, gene: 'ONE', label: 'R' + pos, seq: '', window: '', shown: q => q,
  attr: n => attrs[n] ?? '', attrHtml: (n, v) => v, isListed: () => true }};
  return ['badge', 'tags', 'sequences', 'around', 'calls'].map(k => K.card[k](c, true)).join('|'); }};
const out = {{}}; [2, 5, 32].forEach(p => {{ out[p] = [draw(full, p), draw(part, p)]; }});
console.log(JSON.stringify(out));"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    for pos, (a, b) in out.items():
        assert a == b, pos
    assert any(len(a) > 40 for a, _ in out.values())
