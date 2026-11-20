"""Variants counted at each residue (CONTRACTS.md, "Changes at residues"): website.protein.card.variant_counts and the
germline card are checked against the tables they name, and a per-variant table is read as a site_table."""

from __future__ import annotations

import pandas as pd

from ptmcontext.web import pcards
from ptmcontext.web import tables as T


def _site(variant_counts, cards=None):
    return {
        'website': {
            'tables': {
                'vt': {
                    'input': 'a',
                    'format': 'site_table',
                    'columns': {'accession': 'ac', 'position': 'pos'},
                    'values': ['alt', 'vid', 'cls'],
                },
                'bg': {
                    'input': 'b',
                    'format': 'protein_records',
                    'columns': {'accession': 'a', 'residue': 'r', 'residues': 'n'},
                    'values': ['k'],
                },
                'rc': {
                    'input': 'c',
                    'format': 'residue_changes',
                    'columns': {'accession': 'a', 'position': 'p', 'alt': 'x'},
                },
            },
            'protein': {'card': {'variant_counts': variant_counts}, **({'cards': cards} if cards else {})},
        }
    }


def test_variants_are_read_one_row_each(tmp_path):
    p = tmp_path / 'v.tsv'
    pd.DataFrame(
        {
            'ac': ['P1', 'P1', 'P2'],
            'pos': ['12', '12', '5'],
            'alt': ['R', 'N', 'Q'],
            'vid': ['1', '2', '3'],
            'cls': ['Pathogenic', 'Benign', ''],
        }
    ).to_csv(p, sep='\t', index=False)
    spec = _site([])['website']['tables']['vt']
    assert T.problems('vt', spec) == []
    t = T.read(spec, p)
    assert len(t) == 3 and list(t.columns) == ['accession', 'position', 'alt', 'vid', 'cls']
    assert list(t['position']) == [12, 12, 5]


def test_variant_counts_are_checked_against_their_tables():
    good = {
        'id': 'ok',
        'tables': ['vt'],
        'background': 'bg',
        'count': 'k',
        'highlight': {'column': 'cls', 'equals': 'Pathogenic'},
        'fields': [{'column': 'cls'}],
        'link': {'column': 'vid', 'url': 'https://example.org/{}'},
    }
    assert pcards.problems(_site([good], {'germline': {}})) == []
    bad = {
        'id': 'bad',
        'tables': ['rc', 'nope'],
        'background': 'bg',
        'count': 'missing',
        'fields': [{'column': 'zzz'}],
    }
    text = '\n'.join(pcards.problems(_site([bad, {'id': 'none'}])))
    assert "variant_counts[0].tables: 'rc' is a residue_changes table" in text
    assert "variant_counts[0].tables: no table 'nope'" in text
    assert "no column 'missing'" in text
    assert 'variant_counts[1]: names no tables' in text and 'variant_counts[1]: names no background table' in text


def test_a_germline_card_without_sources_is_named():
    out = pcards.problems(_site([], {'germline': {}}))
    assert any('cards.germline: names no sources' in m for m in out)
