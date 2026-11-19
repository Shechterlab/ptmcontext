"""Changes counted at each residue (CONTRACTS.md, "Changes at residues"): the residue_changes table format counts a list
of changes (one row per tumor sample or cell line) per site and new residue, and website.protein.card.change_counts is
checked against the tables it names."""

from __future__ import annotations

import pandas as pd

from ptmcontext.web import pcards
from ptmcontext.web import tables as T


def _write(tmp_path):
    p = tmp_path / 'changes.tsv'
    pd.DataFrame(
        {
            'ac': ['P1', 'P1', 'P1', 'P1', 'P2', 'P2'],
            'pos': ['12', '12', '12', '30', '5', ''],
            'to': ['R', 'R', 'N', '*', 'Q', 'Q'],
            'sample': ['s1', 's2', 's3', 's1', 's1', 's2'],
        }
    ).to_csv(p, sep='\t', index=False)
    return p


def test_residue_changes_are_counted_per_site_and_new_residue(tmp_path):
    spec = {'input': 'x', 'format': 'residue_changes', 'columns': {'accession': 'ac', 'position': 'pos', 'alt': 'to'}}
    assert T.problems('c', spec) == []
    t = T.read(spec, _write(tmp_path))
    rows = {(r.accession, r.position): (r.alt, r.n) for r in t.itertuples() if r.alt in 'R*Q'}
    assert rows == {('P1', 12): ('R', '2'), ('P1', 30): ('*', '1'), ('P2', 5): ('Q', '1')}
    p1 = t[(t.accession == 'P1') & (t.position == 12)]
    assert list(p1['alt']) == ['R', 'N'] and list(p1['n']) == ['2', '1']  # most first
    assert len(t) == 4  # the row without a position is dropped


def test_a_table_without_the_new_residue_column_is_named():
    spec = {'input': 'x', 'format': 'residue_changes', 'columns': {'accession': 'ac', 'position': 'pos'}}
    assert any("needs a column 'alt'" in m for m in T.problems('c', spec))


def test_change_counts_are_checked_against_their_tables():
    site = {
        'website': {
            'tables': {
                'ch': {
                    'input': 'a',
                    'format': 'residue_changes',
                    'columns': {'accession': 'a', 'position': 'p', 'alt': 'x'},
                },
                'bg': {
                    'input': 'b',
                    'format': 'protein_records',
                    'columns': {'accession': 'a', 'residue': 'r', 'residues': 'n'},
                    'values': ['k'],
                },
                'other': {'input': 'c', 'format': 'lookup', 'columns': {'key': 'k'}},
            },
            'protein': {
                'card': {
                    'change_counts': [
                        {'id': 'ok', 'tables': ['ch'], 'background': 'bg', 'count': 'k'},
                        {'id': 'bad', 'tables': ['other', 'nope'], 'background': 'bg', 'count': 'missing'},
                        {'id': 'none'},
                    ]
                }
            },
        }
    }
    out = pcards.problems(site)
    assert not any('change_counts[0]' in m for m in out)
    text = '\n'.join(out)
    assert "change_counts[1].tables: 'other' is a lookup table" in text
    assert "change_counts[1].tables: no table 'nope'" in text
    assert "no column 'missing'" in text
    assert 'change_counts[2]: names no tables' in text and 'change_counts[2]: names no background table' in text
