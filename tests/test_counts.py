"""Count questions (website.counts) from data in the contract's format (CONTRACTS.md, Per-mark tables and count
questions): a toy site whose marks table has a list attribute, a number attribute and a paired list attribute, and a
per-mark table of experiments, builds both kinds of count tile and question with no code; a site without them has
none; and, on the release's own tables, the counts equal the original explorer's Provenance and PRMT tiles."""

from __future__ import annotations

import copy
import json
import re
import tempfile
from pathlib import Path

import pandas as pd
import pytest
import yaml

from ptmcontext import inputs as I
from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file
from ptmcontext.web.counts import counts_data

REPO = Path(__file__).resolve().parents[1]
#                 1        10        20        30        40
P1 = 'MRGGRAAAAARAAAAAAAAAARAAAAAAAAARGGAAAAAAAAR'
P2 = 'MRAAARAAARAAAAAAAAAAAAAARAAAR'
MARKS = pd.DataFrame(
    {  # five marks, with the sources that report each and two experiments
        'acc': ['P1', 'P1', 'P1', 'P2', 'P2'],
        'pos': [2, 5, 32, 2, 25],
        'mark_id': ['P1:2', 'P1:5', 'P1:32', 'P2:2', 'P2:25'],
        'sources': ['A; B', 'A', 'A; B; C', 'C', ''],
        'n_sources': ['2', '1', '3', '1', '0'],
        'exps': ['ko; kd', 'ko', '', 'kd', 'ko'],
        'exp_calls': ['down; up', 'none', '', 'down', 'down'],
    }
)
RESPONSES = pd.DataFrame(
    {  # the per-mark table: one row per mark, experiment and condition
        'mark': ['P1:2', 'P1:2', 'P1:5', 'P1:32', 'P2:2', 'P2:2', 'P9:1'],
        'treatment': ['T', 'T', 'T', 'T', 'T', 'U', 'T'],
        'condition': ['x', 'y', 'x', 'x', 'x', 'x', 'x'],
        'result': ['down', 'up', 'none', 'down', 'down', 'down', 'down'],
        'change': ['-2', '1', '0.5', '-1', '-3', '', '-9'],
    }
)


def _toy_site(tmp_path, counts=True):
    root = tmp_path / 'repo'
    (root / 'sites').mkdir(parents=True)
    data = root / 'data'
    data.mkdir()
    (data / 'toy.fasta').write_text(
        f'>sp|P1|ONE_TOY One OS=Toy OX=1 GN=ONE PE=1 SV=1\n{P1}\n>sp|P2|TWO_TOY Two OS=Toy OX=1 GN=TWO PE=1 SV=1\n{P2}\n'
    )
    MARKS.to_csv(data / 'marks.tsv', sep='\t', index=False)
    RESPONSES.to_csv(data / 'responses.tsv', sep='\t', index=False)

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
            'toy_responses': entry('responses.tsv'),
        },
    }
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(manifest, indent=1))
    marks = {
        'input': 'toy_marks',
        'accession': 'acc',
        'position': 'pos',
        'residue_mismatch': 'error',
        'attributes': {
            'sources': {
                'column': 'sources',
                'label': 'Sources',
                'kind': 'list',
                'values': {'A': 'Source A'},
                'filter': True,
            },
            'n_sources': {'column': 'n_sources', 'label': 'Sources reporting it', 'kind': 'number', 'filter': True},
            'exp': {'column': 'exps', 'pair_with': 'exp_calls', 'label': 'Experiments', 'kind': 'list', 'filter': True},
        },
    }
    website = {'name': 'Toy Explorer'}
    if counts:
        marks['tables'] = {
            'responses': {
                'input': 'toy_responses',
                'key': {'marks': 'mark_id', 'table': 'mark'},
                'columns': ['treatment', 'condition', 'result', 'change'],
            }
        }
        website['counts'] = {
            'reported': {
                'kind': 'values',
                'attribute': 'sources',
                'number': 'n_sources',
                'title': 'Who reports them',
                'bins': 3,
                'unit': ['source', 'sources'],
                'top': 2,
            },
            'responses': {
                'kind': 'responses',
                'title': 'Responses',
                'calls': {'down': 'down', 'up': 'up'},
                'group': 'Condition',
                'rows': [
                    {
                        'name': 'T',
                        'group': 'x',
                        'table': 'responses',
                        'where': {'treatment': 'T', 'condition': 'x'},
                        'call': 'result',
                        'change': 'change',
                    },
                    {
                        'name': 'T',
                        'group': 'y',
                        'table': 'responses',
                        'where': {'treatment': 'T', 'condition': 'y'},
                        'call': 'result',
                    },
                    {'name': 'KO', 'attribute': 'exp', 'value': 'ko'},
                    {
                        'name': 'Never measured',
                        'id': 'never',
                        'table': 'responses',
                        'where': {'treatment': 'Z'},
                        'call': 'result',
                    },
                ],
            },
        }
        website['overview'] = {
            'sections': [{'name': 'Counted', 'cards': ['reported', {'analysis': 'responses', 'wide': True}]}]
        }
        website['legacy_links'] = {'old-key': 'responses'}
        website['stats'] = ['marks', {'attribute': 'sources', 'label': 'sources', 'opens': 'reported'}]
    site = {
        'schema_version': 1,
        'id': 'toy',
        'title': 'A toy site',
        'status': 'working',
        'mark': 'methylarginine',
        'manifest': 'sites/toy.inputs.json',
        'snapshot': {'input': 'toy_fasta', 'release': 'Toy 2026_01'},
        'marks': marks,
        'analyses': [{'id': 'motif', 'layer': 'motif'}],
        'outputs': {'folder': 'out/toy'},
        'website': website,
    }
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(site, sort_keys=False))
    return root


def _page_data(index: Path) -> dict:
    return json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )


def test_count_questions_from_a_toy_site(tmp_path):
    root = _toy_site(tmp_path)
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    assert S.mark_table_problems(S.load_site(root / 'sites' / 'toy.yaml'), root / 'data') == []
    run = S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    assert 'toy_responses' in run.record['inputs']  # checked against its MD5 and recorded
    assert run.record['mark_tables']['responses'] == {
        'input': 'toy_responses',
        'rows': 7,
        'kept': 6,
        'marks': 4,
    }  # P9:1 is no mark
    kept = pd.read_csv(root / 'out' / 'toy' / 'marks_responses.tsv', sep='\t', dtype=str, keep_default_na=False)
    assert list(kept.columns) == ['accession', 'position', 'treatment', 'condition', 'result', 'change']
    assert list(kept['position']) == ['2', '2', '5', '32', '2', '2']  # the table's order

    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    d = _page_data(index)
    assert d['counts'] == {'marks': 5, 'proteins': 2}  # the page's own counts are untouched
    v = d['count_questions']['reported']
    assert v['total'] == 5 and v['list'] and v['number'] == 'n_sources'
    assert [x[:4] for x in v['values']] == [['A', 'Source A', 3, 1], ['B', 'B', 2, 0], ['C', 'C', 2, 1]]
    assert v['dist'] == [2, 1, 1] and v['none'] == 1 and v['multi'] == 2  # 1, 2, 3 or more sources; one has none
    assert v['two_or_more'] == 'with two or more sources'
    r = {x['id']: x for x in d['count_questions']['responses']['rows']}
    # T x: P1:2 down (-2), P1:5 none (0.5), P1:32 down (-1), P2:2 down (-3)
    assert (r['t_x']['n'], r['t_x']['down'], r['t_x']['up'], r['t_x']['median']) == (4, 3, 0, -1.5)
    assert r['t_x']['filter'] == [None, 't_x'] and r['t_x']['short'] == 'T x'
    assert (r['t_y']['n'], r['t_y']['down'], r['t_y']['up'], r['t_y']['median'], r['t_y']['changes']) == (
        1,
        0,
        1,
        None,
        False,
    )
    # from the paired attribute: P1:2 down, P1:5 none, P2:25 down
    assert (r['ko']['n'], r['ko']['down'], r['ko']['up']) == (3, 2, 0) and r['ko']['filter'] == ['t:exp', 'ko:down']
    assert r['never']['n'] == 0
    assert d['legacy_links'] == {'old-key': 'responses'}
    sel = json.loads((index.parent / 'data' / 'selection.json').read_text())
    marks = pd.read_csv(root / 'out' / 'toy' / 'marks.tsv', sep='\t', dtype=str)
    idx = {(a, int(p)): i for i, (a, p) in enumerate(zip(marks['accession'], marks['position']))}
    tx = sel['count_questions']['responses'][0]
    assert sorted(tx) == sorted(
        [[idx[('P1', 2)], 1, -2], [idx[('P1', 5)], 0, 0.5], [idx[('P1', 32)], 1, -1], [idx[('P2', 2)], 1, -3]]
    )
    assert 'kit-counts.js' in index.read_text()


def test_a_site_without_counts_has_none(tmp_path):
    root = _toy_site(tmp_path, counts=False)
    S.run(root / 'sites' / 'toy.yaml', root=root / 'data', log=lambda *_: None)
    assert not list((root / 'out' / 'toy').glob('marks_*.tsv'))
    index = web.build(root / 'sites' / 'toy.yaml', log=lambda *_: None)
    assert _page_data(index)['count_questions'] == {}
    assert 'count_questions' not in json.loads((index.parent / 'data' / 'selection.json').read_text())


def test_count_questions_are_checked(tmp_path):
    site = S.load_site(_toy_site(tmp_path) / 'sites' / 'toy.yaml')
    bad = copy.deepcopy(site)
    c = bad['website']['counts']
    c['reported']['attribute'] = 'n_sources'  # a number, not a list
    c['responses']['rows'].append({'name': 'No calls'})  # neither attribute nor table
    c['responses']['rows'].append(
        {'name': 'Bad', 'id': 'bad', 'table': 'responses', 'where': {'dose': '1'}}
    )  # a column not kept
    c['responses']['rows'].append({'name': 'Unpaired', 'id': 'unpaired', 'attribute': 'sources', 'value': 'A'})
    c['sources'] = {'kind': 'values', 'attribute': 'sources', 'title': 'Clash'}  # an attribute's name
    bad['website']['stats'][1]['opens'] = 'nowhere'
    problems = S.website_problems(bad)
    for word in (
        'is a number',
        'calls come from an attribute',
        "does not keep ['dose'",
        'not a paired list attribute',
        'already an analysis or an attribute',
        "opens 'nowhere'",
    ):
        assert any(word in p for p in problems), (word, problems)


def test_release_counts_equal_the_original_explorer(reference_root):
    """The Provenance and PRMT tiles of the original explorer (live, release v1.4.3), from the release's site table
    and its supporting tables as the site file maps them: every count, share and median change."""
    site = S.load_site(REPO / 'sites' / 'methylarginine.yaml')
    paths = I.resolve(reference_root, I.site_input_names(site), manifest=S.manifest_of(site), allow_absent=True)
    table = pd.read_csv(paths[site['marks']['input']], sep='\t', dtype=str, keep_default_na=False, low_memory=False)
    spec = site['marks']
    marked = pd.DataFrame(
        {'accession': table[spec['accession']], 'position': table[spec['position']].astype(int)}
    ).drop_duplicates()
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        S.mark_attributes(spec, table, marked).to_csv(folder / 'marks.tsv', sep='\t', index=False)
        for name, frame in S.mark_tables(spec, table, marked, paths)[0].items():
            frame.to_csv(folder / f'marks_{name}.tsv', sep='\t', index=False)
        page, sel = counts_data(site, folder)
    v = page['provenance']
    assert len(v['values']) == 19 and v['total'] == 11632
    assert [x[2:4] for x in v['values'][:5]] == [[7443, 1229], [7260, 1643], [2233, 203], [1569, 46], [1482, 338]]
    assert v['dist'] == [4451, 4437, 915, 493, 1336] and v['multi'] == 7181
    rows = {
        r['id']: (r['n'], r['down'], r['up'], None if r['median'] is None else round(r['median'], 2))
        for r in page['perturbations']['rows']
    }
    assert rows == {
        'gsk591_mma': (725, 71, 70, 0.10),
        'gsk591_adma': (548, 80, 60, -0.27),
        'gsk591_sdma': (435, 100, 28, -0.33),
        'ms023_mma': (725, 114, 128, 0.0),
        'ms023_adma': (548, 104, 86, -0.35),
        'ms023_sdma': (435, 42, 84, 0.03),
        'carm1_ko_mcf7': (363, 249, 2, -1.93),
        'carm1_ko_mdamb231': (179, 111, 0, -1.68),
        'prmt7_ko_hct116': (333, 26, 3, -0.18),
        'prmt1_kd_hek293t': (752, 60, 68, -0.48),
        'prmt5i_epz015666_hela': (338, 241, 1, -3.90),
        'prmt7_kd_hek293': (795, 266, 0, -0.20),
        'prmt7i_sgc3027_hek293': (847, 455, 0, -0.97),
        'carm1_kd_hek293': (962, 560, 0, -3.35),
        'prmt5_kd_hek293': (385, 385, 0, -6.64),
    }
    assert [len(x) for x in sel['perturbations']] == [
        725,
        548,
        435,
        725,
        548,
        435,
        363,
        179,
        333,
        752,
        338,
        795,
        847,
        962,
        385,
    ]


@pytest.mark.parametrize('name', ['a-b', '2x', ''])
def test_per_mark_table_names_are_plain(name):
    with pytest.raises(ValueError):
        S.mark_tables(
            {
                'accession': 'acc',
                'position': 'pos',
                'tables': {name: {'input': 'x', 'key': {'marks': 'm', 'table': 'm'}, 'columns': ['c']}},
            },
            pd.DataFrame({'acc': ['P1'], 'pos': ['1']}),
            pd.DataFrame({'accession': ['P1'], 'position': [1]}),
            {},
        )
