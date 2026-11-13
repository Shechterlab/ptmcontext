"""The Overlap page (kit-overlap.js, web/overlap.py, website.overlap) on a toy site: the run writes every protein of each set
(the ones without a mark too) beside protein_sets.json, the web build writes the page's files, and the browser's numbers for
the regions equal the Python protein-set engine (statistics.tsv rows of a question over every reviewed protein) and ptmstats'
hypergeometric and Fisher tests. A made-up reader family and enzyme class take their members from the site file alone."""

from __future__ import annotations

import json
import shutil
import subprocess

import pandas as pd
import pytest
import yaml
from node_harness import ASSETS, HARNESS
from test_search import _page_data
from test_set_views import _site

import ptmstats
from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file
from ptmcontext.web import overlap as OV

FAMILY = {'name': 'Madeup', 'ids': ['IPR999999', 'PF99999'], 'note': 'a made-up family'}


def _build(tmp_path):
    root = _site(tmp_path, views=False)
    data = root / 'data'
    pd.DataFrame(
        {
            'canonical_UniProtAC': ['P1', 'P1', 'P4', 'P6', 'P7'],
            'interpro_accession': ['IPR000001', 'IPR999999', 'IPR000002', 'IPR000001', 'IPR000003'],
            'member_database_accessions': ['PF00001', 'PTHR1', 'PF99999', 'PF00001', 'PF00003'],
        }
    ).to_csv(data / 'entries.tsv', sep='\t', index=False)
    pd.DataFrame(
        {
            'prot': ['P1', 'P2', 'P3', 'P1', 'P5', 'P7', 'P2-2', 'P8'],
            'term': ['G1', 'G1', 'G1', 'G2', 'G2', 'G3', 'G2', 'G2'],
            'curated': ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no'],
        }
    ).to_csv(data / 'terms_table.tsv', sep='\t', index=False)
    pd.DataFrame({'term': ['G1', 'G2', 'G3'], 'label': ['first process', 'second process', 'third process']}).to_csv(
        data / 'term_names.tsv', sep='\t', index=False
    )
    mp = root / 'sites' / 'toy.inputs.json'
    man = json.loads(mp.read_text())
    man['inputs']['entries'] = {
        'file': 'entries.tsv',
        'md5': md5_file(data / 'entries.tsv'),
        'source': 'synthetic, for a test',
        'version': 'test 1',
        'licence': 'CC0 1.0',
    }
    for k, f in (('src_members', 'terms_table.tsv'), ('src_names', 'term_names.tsv')):
        man['inputs'][k] = {**man['inputs']['entries'], 'file': f, 'md5': md5_file(data / f)}
    mp.write_text(json.dumps(man, indent=1))
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['inputs'].update({'interpro_entries': 'entries', 'src_members': 'src_members', 'src_names': 'src_names'})
    for a in site['analyses']:
        if a['id'] == 'onto':
            a['whole_universe'] = True  # every reviewed protein is the background: the overlap page's own universe
    site['website']['overlap'] = {
        'terms_from': ['onto', 'term'],
        'max_terms': 4,
        'leave_out': {'term': ['T4']},
        'notes': {'onto': 'a note'},
        'units': ['proteins', 'sites', 'readers'],
        'term_sources': [
            {
                'id': 'proc',
                'title': 'Made-up processes',
                'members': {
                    'input': 'src_members',
                    'protein': 'prot',
                    'set': 'term',
                    'include': [{'column': 'curated', 'equals': 'yes'}],
                },
                'names': {'input': 'src_names', 'id': 'term', 'name': 'label'},
                'min_size': 2,
                'max_size': 5,
                'cite': ['A. Author, Journal 1 (2026), doi:10.0000/made-up'],
            }
        ],
        'readers': {'source': 'interpro_entries', 'families': [FAMILY]},
    }
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(p, root=root / 'data', log=lambda *_: None)
    return root, web.build(p, log=lambda *_: None)


def test_reader_and_enzyme_members_come_from_the_site_file():
    frame = pd.DataFrame(
        {
            'canonical_UniProtAC': ['A', 'A', 'B', 'C'],
            'interpro_accession': ['IPR1', 'IPR2', 'IPR3', 'IPR4'],
            'member_database_accessions': ['PF1', 'PTHR', 'PF9', 'PF4'],
        }
    )
    got = OV.reader_members({'families': [{'name': 'X', 'ids': ['IPR3', 'PF4']}, {'name': 'Y', 'ids': ['PF1']}]}, frame)
    assert got == {'X': {'B', 'C'}, 'Y': {'A'}}
    rows = OV.enzyme_members(
        {
            'w': {'label': 'W', 'role': 'writer', 'genes': ['GB']},
            'r': {'label': 'R', 'role': 'reader', 'genes': ['GA']},
        },
        ['writer', 'eraser'],
        {'A': 'GA', 'B': 'GB'},
        None,
    )
    assert [(r['id'], r['members']) for r in rows] == [('w', {'B'})]


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_overlap_numbers_equal_the_python_engine(tmp_path):
    root, index = _build(tmp_path)
    out = root / 'out' / 'toy'
    ov = index.parent / 'data' / 'overlap'
    raw = json.loads((out / 'overlap_members.json').read_text())
    assert raw['universe'] == [f'P{i}' for i in range(1, 9)]  # every reviewed protein, P8 and P4 included
    assert 'members' not in json.loads((out / 'protein_sets.json').read_text())['onto']
    assert (ov / 'universe.json').exists() and (ov / 'sets' / 'onto.json').exists()
    term_sets = json.loads((ov / 'sets' / 'term.json').read_text())
    assert 'T3' in term_sets and 'T4' not in term_sets  # a set left out is not written
    src = ov / 'sources' / 'proc'
    assert json.loads((src / 'terms.json').read_text())['terms'] == [
        ['G1', 'first process', 3],
        ['G2', 'second process', 3],
    ]  # G3 has one protein; the uncurated row and the isoform suffix
    shard = OV.shard_name('G2')
    assert json.loads((src / shard).read_text())['G2'] == sorted([raw['universe'].index(a) for a in ('P1', 'P2', 'P5')])
    fams = json.loads((ov / 'families.json').read_text())
    assert [(f['name'], f['m']) for f in fams['readers']] == [('Madeup', [0, 3])]  # P1 by IPR, P4 by Pfam
    page = _page_data(index)
    assert (
        page['overlap']['units'] == ['proteins', 'sites', 'readers']
        and page['overlap']['families']['readers'][0]['ids'] == FAMILY['ids']
    )
    (tmp_path / 'd.json').write_text(json.dumps(page))
    head = (
        f'const ASSETS = {json.dumps(str(ASSETS))}, BUILT = {json.dumps(str(index.parent / "assets"))}, DATA = {json.dumps(str(tmp_path / "d.json"))}, '
        f'SEL = {json.dumps(str(index.parent / "data" / "selection.json"))}, OV = {json.dumps(str(ov))};'
    )
    harness = HARNESS.replace(
        'window.PTMC_MODULES.forEach',
        "eval(fs.readFileSync(ASSETS + '/kit-overlap.js', 'utf8')); window.PTMC_MODULES.forEach",
    )
    body = """
      const sel = global.fetch;
      global.fetch = u => String(u).startsWith('data/overlap/')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(OV + '/' + String(u).slice(13), 'utf8'))) })
        : sel(u);
      K.fx = v => String(v); K.preamble = (t, w) => '# ' + t + ': ' + w + NL; K.g6 = v => String(v);
      K.sel.data(); await K.sel.ready;
      const r2 = await K.overlap.compute(['s:onto:D2', 's:onto:D3'], 'proteins', 1);
      const r3 = await K.overlap.compute(['s:onto:D1', 's:onto:D2', 's:term:T3'], 'proteins', 1);
      const rx = await K.overlap.compute(['x:proc:G1', 's:onto:D3'], 'proteins', 1);
      const core = K.overlap.core;
      const wil = [[0, 5], [3, 3], [7, 26], [89, 133], [3429, 13447], [1, 1]].map(([k, n]) => core.wilson(k, n));
      const REG = [[2, 158], [1, 129], [4, 26], [5, 3], [3, 1]].map(([m, n]) => ({ m, n }));
      const eu = core.glyphLayout([133, 159, 29], REG, { w: 300, h: 210 });
      const eu2 = core.glyphLayout([5, 4], [{ m: 1, n: 3 }, { m: 2, n: 2 }, { m: 3, n: 2 }], { w: 300, h: 210 });
      const boxes = eu.boxes.map(b => [b.x, b.y, b.x + b.w, b.y + b.h]);
      const sc = core.sizeScale([13680, 13447, 159, 133, 129, 112, 46, 26, 3, 1]);
      const rs = await K.overlap.compute(['s:onto:D2', 's:onto:D3'], 'sites', 1);
      const rr = await K.overlap.compute(['s:onto:D1', 'f:readers:Madeup'], 'readers', 1);
      const rd = await K.overlap.compute(['s:onto:D2', 's:onto:D3'], 'proteins');
      const strip = r => ({ ts: r.ts.map(t => t.id), rows: r.rows, totals: r.totals, N: r.N, M: r.M, test: r.test });
      console.log(JSON.stringify({ r2: strip(r2), r3: strip(r3), rs: strip(rs), rr: strip(rr), wil, err3: eu.err, err2: eu2.err, boxes, cutBrk: sc.brk, cutMax: sc.max, nLabels: eu.labels.length, rd: strip(rd), rx: strip(rx), tables: [r2, rs, rx].map(r => K.overlap.tableHtml(r)), tsvx: K.overlap.tsv(rx), tsv: K.overlap.tsv(r2) }));
    """
    run = subprocess.run(
        ['node', '-e', head + harness + '(async () => {' + body + '})();'], capture_output=True, text=True
    )
    assert run.returncode == 0, run.stderr[-1500:]
    j = json.loads(run.stdout)
    # the engine's own rows (whole universe: N = 8) for the sets of the question 'onto'
    stats = pd.read_csv(out / 'statistics.tsv', sep='\t')
    eng = stats[(stats['analysis'] == 'onto') & (stats['method'] == 'enricher')].set_index('category')
    for tot, term in zip(j['r2']['totals'], ['D2', 'D3']):
        row = eng.loc[term]
        assert (tot['N'], tot['M'], tot['k'], tot['n']) == (8, 4, row['a'], row['a'] + row['c'])
        # statistics.tsv keeps 6 digits; the hypergeometric is symmetric in the marked and the set
        assert tot['p'] == pytest.approx(row['p'], rel=1e-5)
        assert tot['fold'] == pytest.approx(row['fold_enrichment'], rel=1e-5)
    # every region equals ptmstats' test on its own counts, and q is Benjamini-Hochberg across the regions shown
    for key in ('r2', 'r3'):
        shown = [r for r in j[key]['rows'] if r['mask'] and r['n']]
        assert shown
        for r in shown:
            assert r['p'] == pytest.approx(ptmstats.hypergeom_sf(r['k'], 8, 4, r['n']) if r['k'] else 1.0, rel=1e-9)
        q = ptmstats.benjamini_hochberg([r['p'] for r in shown])
        assert [r['q'] for r in shown] == pytest.approx(list(q), rel=1e-9)
    r = {x['mask']: x for x in j['r2']['rows']}
    assert (r[1]['n'], r[1]['k'], r[1]['sites']) == (3, 3, 3) and (r[2]['n'], r[2]['k'], r[2]['sites']) == (3, 1, 1)
    # sites: the pooled Fisher test over the residues of the proteins with sites (3 other candidates each)
    s = {x['mask']: x for x in j['rs']['rows']}
    assert (s[1]['n'], s[2]['n']) == (3, 1) and j['rs']['test'] == 'sites'
    assert s[1]['p'] == pytest.approx(ptmstats.fisher_p(3, 9, 1, 3), rel=1e-9)
    assert s[2]['p'] == pytest.approx(ptmstats.fisher_p(1, 3, 3, 9), rel=1e-9)
    # readers: the unit holds the reader family's proteins (P1, P4); D1 holds both
    q = {x['mask']: x for x in j['rr']['rows']}
    assert q[3]['n'] == 2 and q[3]['k'] == 1
    assert j['tsv'].startswith('# ') and 'region\tterms\tproteins' in j['tsv']
    # a region of fewer than 5 proteins is counted, not tested, and is left out of the Benjamini-Hochberg family
    assert all(
        r['few'] and r['p'] is None and r['q'] is None and r['fold'] is None
        for r in j['rd']['rows']
        if r['mask'] and r['n']
    )
    assert all(t['few'] for t in j['rd']['totals'])  # D2 and D3 hold 3 proteins each
    # a term source's terms are terms like the others: G1 is P1-P3, D3 is P5-P7; the citation goes into the file
    assert j['rx']['ts'] == ['x:proc:G1', 's:onto:D3']
    rx = {x['mask']: x for x in j['rx']['rows']}
    assert (rx[1]['n'], rx[1]['k'], rx[2]['n'], rx[2]['k']) == (3, 3, 3, 1)
    assert 'doi:10.0000/made-up' in j['tsvx'] and 'doi:10.0000/made-up' not in j['tsv']
    # the tables have real rows, in every unit
    for html in j['tables']:
        assert 'undefined' not in html and html.count('<tr') >= 3
        assert html.count('<th scope="row">') >= 2
    # the Wilson whisker equals the Python function; the 3-term glyph is fitted (misfit under 1%) with no overlapping label boxes
    for lo_hi, (k, n) in zip(j['wil'], [(0, 5), (3, 3), (7, 26), (89, 133), (3429, 13447), (1, 1)]):
        lo, hi = ptmstats.wilson_interval(k, n)
        assert lo_hi[0] == pytest.approx(lo, abs=1e-12) and lo_hi[1] == pytest.approx(hi, abs=1e-12)
    assert j['err3'] < 0.01 and j['nLabels'] == 5
    bx = j['boxes']
    assert all(
        not (a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]) for i, a in enumerate(bx) for b in bx[i + 1 :]
    )
    assert j['cutBrk'] == 13447 and j['cutMax'] < 200  # one huge value cuts the axis
    # the columns the export adds
    assert 'ci95_lo\tci95_hi' in j['tsv'] and j['tsv'].split('\n')[-3].count('\t') >= 9
