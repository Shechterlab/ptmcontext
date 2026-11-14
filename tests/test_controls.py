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
def test_a_control_verdict_names_lost_reversed_and_weaker():
    import re
    import subprocess

    js = (ASSETS / 'kit.js').read_text()
    fn = re.search(r'  function ctlVerdict\(r, c\) \{.*?\n  \}\n', js, re.S).group(0)
    prog = (
        'const MIN_EFFECT = 1.1; const valOf = (r) => r.shown ?? r.eff;'
        + fn
        + """
const R = (dir, eff) => ({ dir, eff });
console.log(JSON.stringify([
  ctlVerdict(R('more', 3), R('more', 2)), ctlVerdict(R('more', 3), R('less', 0.4)), ctlVerdict(R('more', 3), R('ns', 1.5)),
  ctlVerdict(R('more', 3), R('ns', 1.01)), ctlVerdict(R('less', 0.5), R('more', 2)), ctlVerdict(R('ns', 1), R('more', 2)),
  ctlVerdict(R('more', 3), undefined)]));"""
    )
    out = json.loads(subprocess.run(['node', '-e', prog], capture_output=True, text=True, check=True).stdout)
    assert out == ['holds', 'reversed', 'weaker', 'lost', 'reversed', 'new', 'not tested']


def test_a_failed_control_keeps_its_row_with_a_badge_in_the_kit():
    js = (ASSETS / 'kit.js').read_text()
    # by default lost and reversed count; the site file may add weaker or switch the badges off
    assert "OV.control_badges?.verdicts || ['lost', 'reversed']" in js and 'OV.control_badges === false' in js
    # the badge sits after the tile row (not inside its button), opens the Controls table, and the row's name says it
    assert 'class="ctl-fail"' in js and 'data-ctl-go=' in js and 'id="q-controls"' in js
    assert 'fails control: ${f.label}' in js and 'badge: fails.map(failText)' in js
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
