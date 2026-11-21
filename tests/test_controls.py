"""Controls: a question repeated with one change (a part of the marks counted by independent groups, proteins set
aside, only the residues of detectable peptides), each a new question that names the question it controls."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest
import yaml

from ptmcontext import site as S
from ptmcontext.residue_tests import digest_lengths
from ptmcontext.snapshot import md5_file

from test_new_sources import _toy_site


def test_distinct_groups_count_a_laboratory_once_and_a_database_not_at_all():
    frame = pd.DataFrame({'studies': ['A; B', 'A; DB', 'L1; L2', 'L1; C', 'DB', '']})
    cond = {
        'column': 'studies',
        'distinct_at_least': 2,
        'groups': {'lab': ['L1', 'L2']},
        'not_counted': ['DB'],
    }
    assert list(S._holds(frame, cond)) == [True, False, False, True, False, False]
    with pytest.raises(ValueError, match='both in a group and not counted'):
        S._holds(frame, {**cond, 'not_counted': ['L1']})


def test_distinct_units_pool_a_marks_rows_and_count_a_paper_once():
    frame = pd.DataFrame(
        {
            'acc': ['P1', 'P1', 'P2', 'P3', 'P4', 'P4', 'P5', 'P6'],
            'pos': [1, 1, 5, 7, 9, 9, 2, 3],
            'sources': [
                'UniProt; Hendriks 2017',  # the same paper twice: one unit
                'Ochoa 2020; iPTMnet',  # P1 pools its rows: 28112733 + Ochoa
                'Ochoa 2020; UniProt',  # Ochoa alone: one unit
                'UniProt; iPTMnet',  # databases add nothing
                'UniProt',
                'UniProt',
                'UniProt; Akimov 2018',
                'UniProt',
            ],
            'pmids': ['28112733', '', '', '111;222', '333', '444', '29967540', '555;666'],
            'evidence_class': [
                'experimental',
                'experimental',
                'experimental',
                'experimental',
                'experimental',
                'by-similarity',  # gives no units: P4 has one
                'experimental',
                'by-similarity',  # P6: nothing counts
            ],
        }
    )
    cond = {
        'distinct_units_at_least': 2,
        'units': {
            'columns': ['pmids'],
            'direct': {
                'column': 'sources',
                'map': {
                    'Ochoa 2020': 'Ochoa 2020',
                    'Hendriks 2017': '28112733',
                    'Akimov 2018': '29967540',
                },
            },
            'only_where': {'column': 'evidence_class', 'equals': 'experimental'},
        },
    }
    key = frame['acc'] + ':' + frame['pos'].astype(str)
    got = dict(zip(key, S._holds(frame, cond, key)))
    assert got == {'P1:1': True, 'P2:5': False, 'P3:7': True, 'P4:9': False, 'P5:2': False, 'P6:3': False}
    # the paper cited by a database and also a direct dataset counts once
    both = frame.iloc[[0]].assign(pmids='28112733')
    assert not S._holds(both, cond, key.iloc[[0]]).iloc[0]
    with pytest.raises(ValueError, match='marks_where only'):
        S._holds(frame, cond)


def test_distinct_units_are_pooled_per_type_when_per_is_given():
    """One lysine with an acetyl record of paper A, a ubiquitin record of paper B and a second ubiquitin record of
    paper C: pooled over all rows it has three units; per type, only the ubiquitin rows reach two."""
    frame = pd.DataFrame(
        {
            'acc': ['P1', 'P1', 'P1', 'P2', 'P2'],
            'pos': [1, 1, 1, 4, 4],
            'type': ['acetyl', 'ubiquitin', 'ubiquitin', 'sumo', 'sumo'],
            'pmids': ['1', '2', '3', '7', '7'],
        }
    )
    cond = {'distinct_units_at_least': 2, 'units': {'columns': ['pmids']}}
    key = frame['acc'] + ':' + frame['pos'].astype(str)
    assert list(S._holds(frame, cond, key)) == [True, True, True, False, False]
    assert list(S._holds(frame, {**cond, 'per': 'type'}, key)) == [False, True, True, False, False]
    with pytest.raises(ValueError, match='per column'):
        S._holds(frame, {**cond, 'per': 'nope'}, key)


def test_digest_peptide_lengths_leave_the_residue_itself_uncut():
    # cuts after K3 (next R), not after R4 (next P), after K8 and R12; K15 is the last residue
    seq = 'MAKRPGGKAAARSTK'
    got = digest_lengths(seq, np.array([1, 3, 4, 8, 9, 13, 15]), 'KR', 'P')
    assert list(got) == [3, 8, 5, 9, 4, 3, 3]
    assert list(digest_lengths('MAAAA', np.array([2]), 'KR', 'P')) == [5]  # no cut at all


def _with_controls(tmp_path, controls):
    root = _toy_site(tmp_path)
    data = root / 'data'
    pd.DataFrame(
        {
            'acc': ['P1', 'P1', 'P1', 'P2', 'P2'],
            'pos': [2, 5, 32, 2, 25],
            'studies': ['X; Y', 'X; DB', 'L1; L2', 'X; Z', 'Y'],
        }
    ).to_csv(data / 'marks.tsv', sep='\t', index=False)
    pd.DataFrame({'entry': ['P1', 'P2'], 'kind': ['histone', 'other']}).to_csv(
        data / 'kinds.tsv', sep='\t', index=False
    )
    man = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    man['inputs']['toy_marks']['md5'] = md5_file(data / 'marks.tsv')
    man['inputs']['toy_kinds'] = {
        'file': 'kinds.tsv',
        'md5': md5_file(data / 'kinds.tsv'),
        'source': 'synthetic, for a test',
        'version': 'test 1',
        'licence': 'CC0 1.0',
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man, indent=1))
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['inputs']['kinds'] = 'toy_kinds'
    site['analyses'][1]['title'] = 'Model confidence'
    site['controls'] = controls
    import jsonschema

    schema = json.loads((S.Path(S.__file__).parent / 'schemas' / 'site.schema.json').read_text())
    jsonschema.validate(site, schema)
    path = root / 'sites' / 'toy.yaml'
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    return root, path


def test_controls_repeat_a_question_with_one_change_and_name_it(tmp_path):
    controls = [
        {
            'id': 'hc',
            'label': 'high-confidence sites',
            'note': 'Two independent studies',
            'analyses': ['confidence'],
            'marks_where': {
                'column': 'studies',
                'distinct_at_least': 2,
                'groups': {'lab': ['L1', 'L2']},
                'not_counted': ['DB'],
            },
            'marks_outside': 'left_out',
        },
        {
            'id': 'nohist',
            'label': 'histones set aside',
            'analyses': ['confidence'],
            'without_proteins': {
                'input': 'kinds',
                'column': 'entry',
                'include': [{'column': 'kind', 'equals': 'histone'}],
            },
        },
        {
            'id': 'detect',
            'label': 'in detectable peptides',
            'analyses': ['confidence'],
            'only_in': {'digest': {'after': 'G', 'min_length': 4, 'max_length': 40}},
        },
    ]
    root, path = _with_controls(tmp_path, controls)
    loaded = S.load_site(path)
    ids = [a['id'] for a in loaded['analyses']]
    assert ids == ['condensates', 'confidence', 'confidence_hc', 'confidence_nohist', 'confidence_detect']
    hc = loaded['analyses'][2]
    assert hc['control_of'] == 'confidence' and hc['control_label'] == 'high-confidence sites' and hc['new']
    assert hc['family'] == 'Model confidence' and hc['title'] == 'Model confidence, high-confidence sites'
    assert loaded['analyses'][1]['family'] == 'Model confidence' and 'control_of' not in loaded['analyses'][1]
    run = S.run(path, root=root / 'data', log=lambda *_: None)
    f = run.rows[run.rows['method'] == 'fisher']
    total = f.groupby('analysis').apply(lambda g: int((g['a'] + g['b']).iloc[0])).to_dict()
    # high-confidence: P1 2 (X, Y) and P2 2 (X, Z); not P1 5 (DB not counted), P1 32 (one laboratory) or P2 25
    assert total['confidence'] == 5 and total['confidence_hc'] == 2
    assert total['confidence_nohist'] == 2  # P1 set aside: P2's two sites
    # the sites outside the subset are on neither side: P1 has 9 arginines, P2 7; 2 marked, 3 left out
    hc_rows = f[f['analysis'] == 'confidence_hc']
    assert int((hc_rows['c'] + hc_rows['d']).iloc[0]) == (P_ARGS - 5)
    used = run.record['analyses']
    assert used['confidence_hc']['marks_where']['outside'] == 'left_out'
    assert used['confidence_hc']['control_of'] == 'confidence'
    assert used['confidence_nohist']['without_proteins']['marked_proteins'] == 1
    assert used['confidence_nohist']['proteins']['not_counted'] == ['P1']
    # cut after G: P1's arginines at 2 and 5 sit in short peptides (MRG, GR...), so fewer marks count
    assert total['confidence_detect'] < total['confidence']
    bad = [{**controls[0], 'marks_where': None}]
    bad[0].pop('marks_where')
    bad[0].pop('marks_outside')
    site = yaml.safe_load(path.read_text())
    site['controls'] = bad
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    with pytest.raises(ValueError, match='names no change'):
        S.load_site(path)


P_ARGS = sum(s.count('R') for s in ('MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR', 'MRAAARAAARAAAAAAAAAAAAAARAAAR'))


@pytest.mark.skipif(not __import__('shutil').which('node'), reason='needs Node')
def test_the_browser_retests_a_flags_control_as_the_run(tmp_path):
    """A motif (flags) question on a part of the marks, the others on neither side: a selection of every mark, tested
    again in the browser, counts what the run counted (the marks it leaves out are listed, not read from no flag)."""
    from node_harness import _run
    from test_search import _toy

    from ptmcontext import web

    root = _toy(tmp_path, with_search=False)
    p = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(p.read_text())
    site['website']['front'] = {'mode': 'classic'}
    site['website']['compare'] = {'min_proteins': 1, 'min_marks': 1}
    site['controls'] = [
        {
            'id': 'x',
            'label': 'kind x',
            'analyses': ['motif'],
            'min_marks': 1,
            'marks_where': {'column': 'kind', 'equals': 'x'},
            'marks_outside': 'left_out',
        }
    ]
    p.write_text(yaml.safe_dump(site, sort_keys=False))
    run = S.run(p, root=root / 'data', log=lambda *_: None)
    index = web.build(p, log=lambda *_: None)
    out = _run(
        tmp_path,
        index,
        """
      await K.sel.ready; K.sel.data(); await K.sel.ready;
      K.S.q = 'ONE TWO'; K.sel.select && K.sel.select('ONE TWO');
      const rows = (m) => (K.sel.rows('motif_x', m) || []).map(r => [r.category, r.a, r.b, r.c, r.d]);
      console.log(JSON.stringify({ mh: rows('mantel_haenszel'), fi: rows('fisher'), ctl: D.analyses.find(a => a.id === 'motif_x').control_of }));""",
    )
    assert out['ctl'] == 'motif'
    for m, key in (('mantel_haenszel', 'mh'), ('fisher', 'fi')):
        py = run.rows[(run.rows['analysis'] == 'motif_x') & (run.rows['method'] == m)]
        want = {r.category: [r.a, r.b, r.c, r.d] for r in py.itertuples() if r.a + r.c}
        got = {c: v for c, *v in out[key]}
        assert got and {c: got[c] for c in want if c in got} == {c: want[c] for c in want if c in got}, (m, got, want)


ASSETS = S.Path(S.__file__).parent / 'web' / 'assets'


@pytest.mark.skipif(not __import__('shutil').which('node'), reason='needs Node')
def test_a_control_verdict_follows_its_key_on_the_tiles_fold():
    """The verdict is read on the fold the tiles show (with the test's q and side), as the Controls table's key says:
    the cases of the review (Janus IDR inside IDRs: 1.5x then 0.95x at OR 0.78, q 8.2e-7; a phosphosite class at 0.99x,
    OR 0.82, q 0.010) are reversed, not lost."""
    import re
    import subprocess

    js = (ASSETS / 'kit.js').read_text()
    fn = re.search(r'  function ctlVerdict\(r, c\) \{.*?\n  \}\n', js, re.S).group(0)
    prog = (
        'const MIN_EFFECT = 1.1, PADJ = 0.05; const valOf = (r) => r.shown ?? r.eff; const ctlTest = (r) => r.adj || r;'
        + fn
        + """
// dir as the kit reads it from the fold; shown: the fold, eff: the test's odds ratio
const R = (dir, shown, eff, q) => ({ dir, shown, eff: eff ?? shown, q: q ?? (dir === 'ns' ? 0.5 : 1e-9) });
console.log(JSON.stringify([
  ctlVerdict(R('more', 3), R('more', 2)),
  ctlVerdict(R('more', 3), R('less', 0.4)),
  ctlVerdict(R('more', 3), R('ns', 1.5)),
  ctlVerdict(R('more', 3), R('ns', 1.01)),
  ctlVerdict(R('less', 0.5), R('more', 2)),
  ctlVerdict(R('ns', 1), R('more', 2)),
  ctlVerdict(R('more', 3), undefined),
  ctlVerdict(R('more', 1.5, 1.4, 3.2e-19), R('same', 0.95, 0.78, 8.2e-7)),
  ctlVerdict(R('more', 2.5, 2.1, 2.2e-34), R('same', 0.99, 0.82, 0.01)),
  ctlVerdict(R('more', 2), R('same', 0.95, 0.78, 0.2)),
  ctlVerdict(R('more', 2), R('same', 0.95, 1.2, 1e-6)),
  ctlVerdict(R('more', 2), R('same', 1.05, 1.04, 1e-6))]));"""
    )
    out = json.loads(subprocess.run(['node', '-e', prog], capture_output=True, text=True, check=True).stdout)
    assert out == [
        'holds',
        'reversed',
        'weaker',
        'lost',
        'reversed',
        'new',
        'not tested',
        'reversed',  # Janus IDR inside IDRs
        'reversed',  # the phosphosite class
        'lost',  # the other side without q <= 0.05
        'lost',  # the fold and the test pointing different ways: no reading
        'lost',  # under 1.1x the same way
    ]
    # the key printed above the table says the same
    key = re.search(r'const CTL_KEY =(.*?);\n', js, re.S).group(1)
    for words in (
        'reversed: the other side of 1×, at q ≤ 0.05',
        'lost: under 1.1× the same way',
        'weaker: at least 1.1×',
    ):
        assert words in key.replace("' +\n    '", '').replace("'", ''), words


def test_the_controls_table_shows_the_fold_and_the_badge_says_one_sentence():
    js = (ASSETS / 'kit.js').read_text()
    block = js[js.index('  function controlsBlock(a, m) {') :]
    block = block[: block.index('\n  }\n')]
    # the fold the tiles show, the odds ratio and q in the tooltip and the accessible name
    assert 'fx(valOf(r))' in block and 'title="${esc(d)}"' in block and 'aria-label=' in block
    assert 'fx(r.eff)' not in block
    # drawn with a selection on too, labelled as the whole dataset's
    assert 'if (vsOn() || selOn()) return' not in block and '(whole dataset)' in block
    tip = js[js.index('  const failTip = (f) =>') :]
    tip = tip[: tip.index(';\n')]
    assert 'This result' in tip and 'f.when' in tip and 'OR' not in tip and ' q ' not in tip


def test_a_failed_control_keeps_its_row_with_a_badge_in_the_kit():
    js = (ASSETS / 'kit.js').read_text()
    # by default lost and reversed count; the site file may add weaker or switch the badges off
    assert "OV.control_badges?.verdicts || ['lost', 'reversed']" in js and 'OV.control_badges === false' in js
    # the badge sits after the tile row (not inside its button), links to Methods > Controls, and the row's name says it
    assert 'class="ctl-fail"' in js and 'class="ctl-badge" href="${esc(link(\'method\', \'controls\'))}"' in js
    assert 'id="q-controls"' in js
    assert "Doesn't hold ${" in js and 'badge: fails.map(failText)' in js
    assert '<span class="vh">, ${esc(x.badge)}</span>' in (ASSETS / 'kit-tile.js').read_text()
    css = (ASSETS / 'kit.css').read_text()
    badge = css[css.index('.ctl-badge {') :]
    badge = badge[: badge.index('}')]
    assert 'var(--muted)' in badge and '--more' not in badge  # muted, not the alarm colour
    schema = json.loads((S.Path(S.__file__).parent / 'schemas' / 'site.schema.json').read_text())
    import jsonschema

    ov = schema['properties']['website']['properties']['overview']
    jsonschema.validate({'control_badges': {'verdicts': ['lost', 'weaker']}}, ov)
    jsonschema.validate({'control_badges': False}, ov)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate({'control_badges': {'verdicts': ['holds']}}, ov)


def _playwright():
    import shutil
    import subprocess

    if not shutil.which('node') or not shutil.which('npm'):
        return None
    root = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True).stdout.strip()
    ok = subprocess.run(['node', '-e', "require('playwright')"], env={**__import__('os').environ, 'NODE_PATH': root})
    return root if ok.returncode == 0 else None


CLICK = r"""
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 900 } }), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(process.argv[2] + '/index.html#overview');
  await p.waitForSelector('.ctl-fail .ctl-badge', { timeout: 20000 });
  const tip = await p.getAttribute('.ctl-fail .ctl-badge', 'title');
  await p.click('.ctl-fail .ctl-badge');
  await p.waitForSelector('#m-controls[open]', { timeout: 15000 });
  const out = {};
  out.hash = await p.evaluate(() => location.hash);
  out.part = await p.evaluate(() => document.querySelector('.msub [aria-current]').textContent);
  // the question's own page still holds its Controls table: each cell shows the fold, its test in the tooltip
  await p.goto(process.argv[2] + '/index.html#overview/motif');
  await p.waitForSelector('#q-controls tbody td span[title]', { timeout: 20000 });
  out.cells = await p.evaluate(() => [...document.querySelectorAll('#q-controls tbody td span[title]')].map((x) => [x.textContent, x.title]));
  console.log(JSON.stringify({ ...out, tip, errs }));
  await b.close();
})();
"""


def test_a_badge_click_opens_methods_controls(tmp_path):
    """In a browser: a tile row whose result a control reverses has a badge; a click on it opens Methods > Controls and
    selects nothing (the row's own click would filter its class)."""
    import functools
    import http.server
    import subprocess
    import threading

    node_root = _playwright()
    if not node_root:
        pytest.skip('needs Node and Playwright')
    root = _toy_site(tmp_path)
    data = root / 'data'
    # one protein with 100 RGG and 100 RA arginines: 60 RGG and 20 RA marks make RGG more often; the control keeps only
    # the RA marks, and RGG is then less often (reversed)
    seq = 'M' + 'RGGA' * 100 + 'RAAA' * 100
    (data / 'toy.fasta').write_text(f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{seq}\n')
    rgg = [2 + 4 * i for i in range(60)]
    ra = [402 + 4 * i for i in range(20)]
    pd.DataFrame({'acc': ['P1'] * 80, 'pos': rgg + ra, 'kind': ['g'] * 60 + ['a'] * 20}).to_csv(
        data / 'marks.tsv', sep='\t', index=False
    )
    man = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    for k in ('toy_fasta', 'toy_marks'):
        man['inputs'][k]['md5'] = md5_file(data / man['inputs'][k]['file'])
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man, indent=1))
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['analyses'] = [{'id': 'motif', 'layer': 'motif', 'title': 'Sequence motifs'}]
    site['controls'] = [
        {
            'id': 'ra',
            'label': 'RA sites only',
            'when': 'only the RA sites are compared',
            'analyses': ['motif'],
            'min_marks': 1,
            'marks_where': {'column': 'kind', 'equals': 'a'},
            'marks_outside': 'left_out',
        }
    ]
    site['website'] = {
        'name': 'Toy Explorer',
        'overview': {'sections': [{'name': 'Where', 'cards': [{'analysis': 'motif', 'title': 'Sequence motifs'}]}]},
    }
    path = root / 'sites' / 'toy.yaml'
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    S.run(path, root=data, log=lambda *_: None)
    from ptmcontext import web

    index = web.build(path, log=lambda *_: None)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(index.parent))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        script = tmp_path / 'click.js'
        script.write_text(CLICK)
        run = subprocess.run(
            ['node', str(script), f'http://127.0.0.1:{httpd.server_address[1]}'],
            capture_output=True,
            text=True,
            timeout=120,
            env={**__import__('os').environ, 'NODE_PATH': node_root},
        )
    finally:
        httpd.shutdown()
    assert run.returncode == 0, run.stderr[-1500:]
    out = json.loads(run.stdout.strip().splitlines()[-1])
    assert out['errs'] == []
    assert (
        out['hash'].startswith('#method/controls') and 'f=' not in out['hash']
    )  # Methods > Controls, no filter of the row
    assert out['part'] == 'Controls'
    assert out['tip'].startswith('This result reverses when only the RA sites are compared (')
    # each cell shows the fold, its test in the tooltip
    assert out['cells'] and all('× q ' in c[0] and c[1].startswith('OR ') and ', q ' in c[1] for c in out['cells'])


def test_a_control_with_too_few_marks_shows_no_result(tmp_path):
    """A control on a part of the marks needs `min_marks` marks (default 100): below it the web data says how many it
    counted (control_too_few), and the kit draws one plain sentence instead of a result, verdicts or badges."""
    from ptmcontext import web

    def control(**extra):
        return {
            'id': 'hc',
            'label': 'high-confidence sites',
            'analyses': ['confidence'],
            'marks_where': {'column': 'studies', 'distinct_at_least': 2},
            **extra,
        }

    root, path = _with_controls(tmp_path, [control()])
    base = {a['id']: a for a in S.load_site(path)['analyses']}
    assert base['confidence_hc']['control_min_marks'] == 100
    assert 'control_min_marks' not in base['confidence']
    root, path = _with_controls(tmp_path / 'b', [control(min_marks=2)])
    assert {a['id']: a for a in S.load_site(path)['analyses']}['confidence_hc']['control_min_marks'] == 2
    run = {'analyses': {'confidence_hc': {'marks_where': {'marks': 83}}}}
    a = {
        'id': 'confidence_hc',
        'control_of': 'confidence',
        'control_label': 'high-confidence sites',
        'control_min_marks': 100,
    }
    assert web._control(a, run)['control_too_few'] == 83
    assert 'control_too_few' not in web._control({**a, 'control_min_marks': 83}, run)  # enough: unchanged
    assert 'control_too_few' not in web._control(a, {})  # no count: nothing hidden
    assert web._control({'id': 'x'}, run) == {}
    js = (ASSETS / 'kit.js').read_text()
    assert 'Too few ${x.control_label' in js and 'A[x.id].control_too_few != null) return;' in js
    schema = json.loads((S.Path(S.__file__).parent / 'schemas' / 'site.schema.json').read_text())
    assert schema['properties']['controls']['items']['properties']['min_marks']['minimum'] == 1
