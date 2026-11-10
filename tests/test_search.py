"""The search's words and the filters that read more than a mark's classes (website.search; CONTRACTS.md, "Search and
its filters"): a toy site hands a few rows in the contracts' formats (other names in a protein_values table, other
modifications in a residue_evidence table, partners in a protein_partners table), each in its own column layout
mapped in the site file, and the website reads names, sites in a protein's own numbering, motif patterns, residues
nearby, partners and the site's own search words with no code of its own. The selection module (kit-select.js with
kit-near.js, run in Node) then selects the same marks a reader would. A site without website.search has none of it,
and the checks name what a search block gets wrong."""

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

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'

#    1        10        20        30        40
P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
P2 = 'MRAAARAAARAAAAAAAAAAAAAARAAPRPRAAAR'
P3 = 'MKKKKKKKKKKKKKKKKKKKKK'  # no candidate residue marked
ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _toy(tmp_path, with_search=True):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(
        f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{P1}\n'
        f'>sp|P2|TWO_TOY Two protein OS=Toy OX=1 GN=TWO PE=1 SV=1\n{P2}\n'
        f'>sp|P3|THREE_TOY Three protein OS=Toy OX=1 GN=THREE PE=1 SV=1\n{P3}\n'
    )
    # marks: P1 R2, R5, R32; P2 R2, R25, R29 (in PRPR)
    pd.DataFrame(
        {
            'acc': ['P1', 'P1', 'P1', 'P2', 'P2', 'P2'],
            'pos': [2, 5, 32, 2, 25, 29],
            'kind': ['x', 'y', 'x', 'y', 'x', 'y'],
        }
    ).to_csv(data / 'marks.tsv', sep='\t', index=False)
    # each table in its own layout
    pd.DataFrame({'protein': ['P1', 'P2'], 'synonyms': ['Uno-1; FIRST', ''], 'go': ['experimental', 'none']}).to_csv(
        data / 'proteins.tsv', sep='\t', index=False
    )
    pd.DataFrame({'uni': ['P1', 'P1', 'P2'], 'resnum': [4, 40, 10], 'type': ['phos', 'ub', 'phos']}).to_csv(
        data / 'ptms.tsv', sep='\t', index=False
    )
    pd.DataFrame(
        {
            'a': ['P1', 'P1', 'P2'],
            'b': ['P3', 'P2', 'P3'],
            'gb': ['THREE', 'TWO', 'THREE'],
            'sc': ['0.95', '0.75', '0.8'],
            'm': ['false', 'true', 'false'],
            'cl': ['writer', '', 'writer'],
        }
    ).to_csv(data / 'partners.tsv', sep='\t', index=False)

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
            **{f'toy_{n}': entry(f'{n}.tsv') for n in ('proteins', 'ptms', 'partners')},
        },
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    tables = {
        'names': {
            'input': 'toy_proteins',
            'format': 'protein_values',
            'columns': {'accession': 'protein', 'aliases': 'synonyms'},
        },
        'others': {
            'input': 'toy_ptms',
            'format': 'residue_evidence',
            'columns': {'accession': 'uni', 'start': 'resnum', 'end': 'resnum', 'kind': 'type'},
        },
        'friends': {
            'input': 'toy_partners',
            'format': 'protein_partners',
            'columns': {
                'accession': 'a',
                'partner_accession': 'b',
                'partner': 'gb',
                'score': 'sc',
                'partner_marked': 'm',
                'classes': 'cl',
            },
        },
    }
    search = {
        'shorthand': {'U1': 'P1'},
        'patterns': {'at': 'motif', 'near': 'window', 'span': 6},
        'terms': {'binding': {'label': 'Binds', 'values': {'yes': {'r:go': ['experimental']}}}},
        'spacing': {'within': [3, 5]},
        'nearby': {
            'others': {
                'key': 'ptm',
                'label': 'Another mark nearby',
                'kinds': {'phos': 'Phospho', 'ub': 'Ubiquitin'},
                'within': [2, 5, 10],
            }
        },
        'partners': {'table': 'friends', 'key': 'binds', 'classes': {'writer': 'a writer'}, 'scores': [0.7, 0.9]},
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
            'attributes': {'kind': {'column': 'kind', 'label': 'Kind', 'kind': 'category', 'filter': True}},
        },
        'proteins': {
            'input': 'toy_proteins',
            'accession': 'protein',
            'attributes': {'go': {'column': 'go', 'label': 'GO', 'kind': 'category', 'control': 'chips'}},
        },
        'analyses': [{'id': 'motif', 'layer': 'motif'}],
        'outputs': {'folder': 'out/toy'},
        'website': {
            'name': 'Toy Explorer',
            'tables': tables,
            'examples': ['ONE', 'motif:GXRG', 'binds:writer'],
            'protein': {'numbering': [{'genes': '^TWO$', 'offset': -1, 'note': 'Numbered without the first residue'}]},
            'filters': [
                {
                    'name': 'Around',
                    'keys': ['d:marks', 'o:others', 'm:at', 'b:class', 'b:gene', 'b:score'],
                    'proteins': ['go'],
                }
            ],
            **({'search': search} if with_search else {}),
        },
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def _page_data(index):
    return json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )


def _build(root):
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    return web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)


def test_the_search_data_reach_the_page_in_their_formats(tmp_path):
    root = _toy(tmp_path)
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    index = _build(root)
    data = _page_data(index)
    assert data['search']['shorthand'] == {'U1': 'P1'} and set(data['search']['nearby']) == {'others'}
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    acc = [p[0] for p in data['proteins']]
    marks = [(acc[m[0]], m[1]) for m in sel['marks']]
    w = dict(zip(marks, sel['wide']['w']))
    assert sel['wide']['span'] == 6 and w[('P1', 2)] == '-----MRGGRAAA' and w[('P2', 29)] == 'AARAAPRPRAAAR'
    # the other modifications: each mark's nearest of each kind, within the widest distance offered
    nb = sel['nearby']['others']
    assert nb['kinds'] == ['phos', 'ub']
    near = {
        k: {marks[nb['d'][j][i]]: nb['d'][j][i + 1] for i in range(0, len(nb['d'][j]), 2)}
        for j, k in enumerate(nb['kinds'])
    }
    assert near['phos'] == {('P1', 2): 2, ('P1', 5): 1, ('P2', 2): 8}  # P1 S4; P2 at 10
    assert near['ub'] == {('P1', 32): 8}
    pt = json.loads((index.parent / 'data' / 'partners.json').read_text())
    assert (
        pt['accessions'] == ['P2', 'P3']
        and pt['genes'] == ['TWO', 'THREE']
        and pt['marked'] == [1, 0]
        and pt['classes'] == ['writer']
    )
    assert pt['rows'][str(acc.index('P1'))] == [1, 950, 0, 750]


def test_partner_classes_are_read_from_the_site_file_by_gene_and_interpro_id(tmp_path):
    root = _toy(tmp_path)
    data = root / 'data'
    pd.DataFrame({'canonical_UniProtAC': ['P2', 'P3'], 'interpro_accession': ['IPR000001', 'IPR000001']}).to_csv(
        data / 'ipr.tsv', sep='\t', index=False
    )
    mf = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    mf['inputs']['toy_ipr'] = {
        'file': 'ipr.tsv',
        'md5': md5_file(data / 'ipr.tsv'),
        'source': 'synthetic, for a test',
        'version': 'test 1',
        'licence': 'CC0 1.0',
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(mf))
    cfg = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    cfg['inputs']['entries'] = 'toy_ipr'
    cfg['website']['search']['partners'].update(
        {
            'interpro': 'entries',
            'attribute': {'id': 'bound_by'},
            'classes': {
                'curated': {
                    'label': 'a curated reader',
                    'role': 'reader',
                    'reads': 'sDMA',
                    'genes': ['two'],
                    'pmid': '1',
                },
                'family': {
                    'label': 'the family, less the curated',
                    'role': 'cofactor',
                    'interpro': ['IPR000001'],
                    'except': ['curated'],
                },
            },
        }
    )
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(cfg, sort_keys=False))
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    index = _build(root)
    pt = json.loads((index.parent / 'data' / 'partners.json').read_text())
    members = {
        c: {pt['accessions'][k] for k, b in enumerate(pt['bits']) if b >> i & 1} for i, c in enumerate(pt['classes'])
    }
    assert members == {'curated': {'P2'}, 'family': {'P3'}}  # the gene, and the InterPro id less the curated class
    info = _page_data(index)['search']['partners']
    assert (
        info['classes'] == {'curated': 'a curated reader', 'family': 'the family, less the curated'}
        and info['class_info']['curated']['role'] == 'reader'
    )
    run = json.loads(
        (index.parent.parent / 'run.json').read_text()
    )  # the website build left the run's output as recorded
    assert run['output']['marks.tsv'] == md5_file(index.parent.parent / 'marks.tsv')
    marks = pd.read_csv(index.parent.parent / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    assert dict(zip(marks['accession'] + marks['position'], marks['a.bound_by'])) == {
        'P12': 'curated; family',
        'P15': 'curated; family',
        'P132': 'curated; family',
        'P22': 'family',
        'P225': 'family',
        'P229': 'family',
    }


def test_a_class_that_names_what_the_site_lacks_is_named(tmp_path):
    root = _toy(tmp_path)
    cfg = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    cfg['website']['search']['partners']['classes'] = {
        'x': {'label': 'x', 'role': 'reader', 'interpro': ['IPR000001'], 'except': ['y']}
    }
    (root / 'sites' / 'bad.yaml').write_text(yaml.safe_dump(cfg, sort_keys=False))
    problems = S.website_problems(S.load_site(root / 'sites' / 'bad.yaml'))
    assert any("classes.x: except 'y' is not a class" in p for p in problems)
    assert any('need website.search.partners.interpro' in p for p in problems)


def test_a_site_without_a_search_block_has_none_of_it(tmp_path):
    root = _toy(tmp_path, with_search=False)
    site = S.load_site(root / 'sites' / 'toy.yaml')
    problems = S.website_problems(site)
    assert any("'m:at': needs website.search.patterns.at" in p for p in problems)
    assert any("'b:class': needs website.search.partners" in p for p in problems)
    assert any("'motif:GXRG'" not in p and "'binds:writer' names no search key" in p for p in problems)
    index = _build(root)
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    assert 'wide' not in sel and 'nearby' not in sel and not (index.parent / 'data' / 'partners.json').exists()
    assert not _page_data(index).get('search')


def test_a_search_block_that_names_what_the_site_lacks_is_named(tmp_path):
    root = _toy(tmp_path)
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['website']['search']['nearby']['friends'] = {'label': 'x'}  # not a residue_evidence table
    site['website']['search']['terms']['binding']['values']['no'] = {'t:nothing': ['a']}
    site['website']['filters'][0]['keys'].append('o:nowhere')
    (root / 'sites' / 'bad.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    problems = S.website_problems(S.load_site(root / 'sites' / 'bad.yaml'))
    assert (
        "website.search.nearby.friends: website.tables.friends is 'protein_partners', not residue_evidence" in problems
    )
    assert any("'t:nothing': no attribute 'nothing'" in p for p in problems)
    assert any("'o:nowhere': needs website.search.nearby.nowhere" in p for p in problems)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_selection_module_reads_names_sites_patterns_and_neighbours(tmp_path):
    root = _toy(tmp_path)
    index = _build(root)
    data = _page_data(index)
    if data.get(
        'late'
    ):  # the rest of the protein attributes' values come from data/site.json when asked for (kit-late.js)
        data['protein_attributes']['values'].update(
            json.loads((index.parent / data['late']['file']).read_text())['protein_attributes']
        )
    sel = (index.parent / 'data' / 'selection.json').read_text()
    partners = (index.parent / 'data' / 'partners.json').read_text()
    queries = {
        'name': ['UNO-1', {}],
        'norm': ['uno1', {}],
        'shorthand_site': ['U1R5', {}],
        'colon': ['ONE:R32', {}],
        'numbered': ['TWO R24', {}],
        'missing': ['ONE R9', {}],
        'typo': ['ONEE', {}],
        'at': ['motif:XRGG', {}],
        'near': ['window:PRPR', {}],
        'bad_pattern': ['motif:Q', {}],
        'ptm': ['ptm:phos@2', {}],
        'ptm_any': ['ptm:1', {}],
        'binds_class': ['binds:writer', {}],
        'binds_gene': ['binds:TWO', {}],
        'binds_high': ['binds:writer', {'b:score': ['0.9']}],
        'term': ['binding:yes', {}],
        'spacing': ['', {'d:marks': ['3']}],
    }
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop; global.innerWidth = 1400; global.requestAnimationFrame = f => 0;
global.localStorage = {{ getItem: () => null, setItem: noop }}; global.CSS = {{ escape: s => s }};
const inline = {{ 'selection-data': {json.dumps(sel)}, 'partners-data': {json.dumps(partners)} }};
global.document = {{ getElementById: id => (inline[id] ? {{ textContent: inline[id] }} : null), addEventListener: noop, querySelector: () => null,
  querySelectorAll: () => [], documentElement: {{ style: {{ setProperty: noop }} }}, body: {{ classList: {{ toggle: noop, contains: () => false }} }} }};
const fs = require('fs');
for (const f of ['kit-select.js', 'kit-near.js']) eval(fs.readFileSync({json.dumps(str(ASSETS))} + '/' + f, 'utf8'));
const D = {json.dumps(data)}, esc = s => String(s ?? ''), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}}, vs: 'residues' }}, esc, int: n => String(n), cap: t => t, clicks: [], render: noop, writeHash: noop,
  link: v => '#' + v, decorate: r => r, sections: {{}}, views: {{}}, tabs: [] }};
window.PTMC_MODULES.forEach(m => m(K));
(async () => {{
  await K.sel.ready;
  const run = () => {{
    const out = {{}};
    for (const [k, [q, f]] of Object.entries({json.dumps(queries)})) {{
      const r = K.sel.select(q, f), p = K.sel.parse(q);
      out[k] = {{ marks: (r.marks || []).map(i => {{ const m = K.sel.data().marks[i]; return D.proteins[m[0]][0] + ':' + m[1]; }}).sort(), errors: r.errors || [],
        via: p.via, missing: p.missing, numbered: p.numbered.map(x => x.slice(0, 3)), typos: p.typos }};
    }}
    return out;
  }};
  run();                                                  // the first partner filter reads the partners
  await new Promise(r => setTimeout(r, 50));
  console.log(JSON.stringify(run()));
}})();"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    p1 = ['P1:2', 'P1:32', 'P1:5']
    assert out['name']['marks'] == p1 and out['name']['via'] == [['UNO-1', ['ONE']]]
    assert out['norm']['marks'] == p1  # without hyphens, as TDP43 for TDP-43
    assert out['shorthand_site']['marks'] == ['P1:5']
    assert out['colon']['marks'] == ['P1:32']
    assert out['numbered']['marks'] == ['P2:25'] and out['numbered']['numbered'] == [['TWO', 'R24', 'R25']]
    assert out['missing']['marks'] == [] and out['missing']['missing'] == ['ONE R9']
    assert out['typo']['typos'] == {'ONEE': [[0, 'ONE']]} or list(out['typo']['typos']) == ['ONEE']
    assert out['at']['marks'] == ['P1:2', 'P1:32']  # any residue, the mark, G, G
    assert out['near']['marks'] == ['P2:25', 'P2:29']  # PRPR within 6 of each
    assert out['bad_pattern']['marks'] == [] and 'Use 2 to 10 residues' in out['bad_pattern']['errors'][0]
    assert out['ptm']['marks'] == ['P1:2', 'P1:5']
    assert out['ptm_any']['marks'] == ['P1:5']
    assert out['binds_class']['marks'] == sorted(p1 + ['P2:2', 'P2:25', 'P2:29'])  # both bind THREE, a writer
    assert out['binds_gene']['marks'] == p1
    assert out['binds_high']['marks'] == p1  # at 0.9, only P1's partner THREE (0.95)
    assert out['term']['marks'] == p1  # binding:yes stands for the protein attribute go
    assert out['spacing']['marks'] == ['P1:2', 'P1:5']  # another mark within 3


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_selections_retest_counts_equal_the_per_feature_counts(tmp_path):
    """The retest of a selection counts every class in one pass over its marks (featureCounts); the numbers are the ones
    the per-class filters gave: for each question and attribute, over random subsets and strata of many marks."""
    root = _toy(tmp_path)
    index = _build(root)
    data = _page_data(index)
    sel = (index.parent / 'data' / 'selection.json').read_text()
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop; global.innerWidth = 1400; global.requestAnimationFrame = f => 0;
global.localStorage = {{ getItem: () => null, setItem: noop }}; global.CSS = {{ escape: s => s }};
const inline = {{ 'selection-data': {json.dumps(sel)} }};
global.document = {{ getElementById: id => (inline[id] ? {{ textContent: inline[id] }} : null), addEventListener: noop, querySelector: () => null,
  querySelectorAll: () => [], documentElement: {{ style: {{ setProperty: noop }} }}, body: {{ classList: {{ toggle: noop, contains: () => false }} }} }};
const fs = require('fs');
for (const f of ['kit-select.js']) eval(fs.readFileSync({json.dumps(str(ASSETS))} + '/' + f, 'utf8'));
const D = {json.dumps(data)}, esc = s => String(s ?? ''), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}}, vs: 'residues' }}, esc, int: n => String(n), cap: t => t, clicks: [], render: noop, writeHash: noop,
  link: v => '#' + v, decorate: r => r, sections: {{}}, views: {{}}, tabs: [] }};
window.PTMC_MODULES.forEach(m => m(K));
(async () => {{
  const SD = await K.sel.ready; let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const base = SD.marks, ms = [];
  for (let i = 0; i < 300; i++) {{ const m = base[i % base.length];
    ms.push([m[0], m[1], m[2].map(cs => cs.filter(() => rnd() < 0.7).concat(rnd() < 0.2 ? cs.slice(0, 1) : [])), m[3].map(cs => cs.filter(() => rnd() < 0.7))]); }}
  const ids = [...D.analyses.map(a => a.id).filter(a => SD.classes[a]), ...Object.keys(SD.attributes).map(n => '@' + n)];
  const bad = []; let checked = 0;
  for (const q of ids) {{
    const f = K.sel.featuresOf(q);
    for (const sub of [ms, ms.filter(() => rnd() < 0.5), []]) {{
      const got = K.sel.featureCounts(q, sub), want = f.map(x => sub.filter(x.has).length); checked += f.length;
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push([q, got, want]);
    }}
  }}
  console.log(JSON.stringify({{ bad, checked, ids: ids.length }}));
}})();"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    assert out['bad'] == [] and out['checked'] > 3 and out['ids'] > 0
