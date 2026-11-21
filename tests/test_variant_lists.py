"""Variant lists in files of their own (CONTRACTS.md, `variant_counts[].lazy`): the rows leave the table shard, a count per
residue stays, and the columnar, dictionary-encoded file reads back as the rows."""

from __future__ import annotations

import json
import subprocess

from ptmcontext.web import variants as V

ENTRY = {
    'id': 'cv',
    'lazy': True,
    'tables': ['cv_S', 'cv_T'],
    'highlight': {'column': 'cls', 'matches': '(Pathogenic|Likely pathogenic)([;,/].*)?'},
    'fields': [{'column': 'stars', 'type': 'stars'}, {'column': 'af', 'type': 'sci'}, {'column': 'n', 'type': 'int'}],
}
COLS = ['position', 'alt', 'vid', 'cls', 'stars', 'af', 'n']


def _rows():
    header = {'cv_S': {'columns': COLS}, 'cv_T': {'columns': COLS}, 'other': {'columns': ['position', 'x']}}
    rows = {
        'P1': {
            'cv_S': [[12, 'R', 'v1', 'Pathogenic', '2', '0.07381234', '3'], [40, 'N', 'v2', 'Benign', '1', '', '0']],
            'cv_T': [
                [12, 'Q', 'v3', 'Likely pathogenic/Pathogenic', '1', '1.2345e-06', '1'],
                [7, 'A', 'v4', 'Benign', '', '', ''],
            ],
            'other': [[5, 'z']],
        },
        'P2': {'cv_S': [[3, 'R', 'v5', 'Benign', '1', '2e-05', '1']]},
        'P3': {'other': [[1, 'y']]},
    }
    return header, rows


def test_split_leaves_a_count_per_residue_and_takes_the_rows_out():
    header, rows = _rows()
    lists, spec = V.split([ENTRY], header, rows)
    assert 'cv_S' not in rows['P1'] and 'cv_T' not in rows['P1'] and rows['P1']['other'] == [[5, 'z']]
    assert rows['P1']['_vc']['cv'] == [
        7,
        1,
        0,
        5,
        2,
        2,
        28,
        1,
        0,
    ]  # position 7: 1 variant; 12: 2, both highlighted; 40: 1
    assert '_vc' not in rows['P3'] and list(lists) == ['P1', 'P2']
    assert spec['cv']['kinds'] == ['pos', 'str', 'str', 'str', 'int', 'float', 'int']


def test_the_file_reads_back_as_the_rows():
    header, rows = _rows()
    lists, spec = V.split([ENTRY], header, rows)
    n, files = V.shards(lists, spec)
    assert n == 1 and len(files) == 1
    f = json.loads(json.dumps(files[0]))
    s = f['_s']
    block = f['P1']['cv']
    pos, last = [], 0
    for d in block[0]:
        last += d
        pos.append(last)
    assert pos == [7, 12, 12, 40]
    word = lambda v: s[v] if isinstance(v, int) else v  # noqa: E731
    assert [word(v) for v in block[1]] == ['A', 'R', 'Q', 'N']
    assert block[4] == [None, 2, 1, 1] and block[5] == [None, 0.0738, 1.23e-06, None]
    assert 'Benign' in s and all(isinstance(x, str) for x in s)


def test_the_hash_matches_the_page(tmp_path):
    accs = ['P04637', 'A0A024R1R8', 'Q9Y6K9', 'P02649-2']
    js = (
        'const h=(a,n)=>{let x=0;for(const c of a)x=(Math.imul(x,31)+c.charCodeAt(0))>>>0;return x%n};'
        f'console.log(JSON.stringify({accs!r}.map(a=>[h(a,7),h(a,331)])))'
    )
    got = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
    assert got == [[V.hash_shard(a, 7), V.hash_shard(a, 331)] for a in accs]
