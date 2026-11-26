"""A site typed in a search (H3 K4, H3K4me3, H4R3me2s, TP53 K120): read by the one parser in kit-names.js, a mark code dropped;
a short symbol is not found by the start of another protein's alias; the landing page routes a site to the explorer that
holds that exact residue (proteins-sites.json) and a category to Enter when no symbol is exactly the text."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
needs_node = pytest.mark.skipif(not shutil.which('node'), reason='needs Node')


def _node(body):
    script = (
        f'global.window = {{}}; require({json.dumps(str(ASSETS / "kit-names.js"))}); const N = window.PTMNames; {body}'
    )
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=False)
    assert run.returncode == 0, run.stderr
    return json.loads(run.stdout)


@needs_node
def test_a_site_after_a_protein_is_a_site_even_when_it_is_also_a_symbol():
    out = _node(
        """
        const known = (w) => ({ H3: [1], K4: [2], K9: [3], 'H3.3': [4], TP53: [5], FUS: [6], EWSR1: [7] })[w];
        const r = (s) => N.read(s.split(' '), known);
        console.log(JSON.stringify([r('H3 K4'), r('H3 K9'), r('H3.3 K4me3'), r('TP53 R213 mutation'), r('FUS EWSR1'), r('K4')]));
        """
    )
    assert [out[0]['site'][k] for k in ('name', 'letter', 'pos')] == ['H3', 'K', 4]
    assert out[1]['site']['pos'] == 9
    assert out[2]['site']['name'] == 'H3.3' and out[2]['site']['mark'] == 'me3'
    assert out[3]['site']['pos'] == 213 and out[4]['list'] == ['FUS', 'EWSR1']
    assert out[5] == {'one': {'name': 'K4', 'hit': [2]}}  # alone it is a name


@needs_node
def test_a_mark_code_after_a_position_is_read_and_dropped():
    out = _node(
        """
        const known = (n) => ({ H3: 1, H4: 2, TP53: 3 })[n];
        console.log(JSON.stringify([N.pos('K4me3'), N.pos('R3me2s'), N.pos('S15ph'), N.pos('K120'), N.pos('216'), N.pos('K4xx'),
          N.siteOf('H3K4me3', known), N.siteOf('H4R3me2s', known), N.siteOf('TP53-K120ac', known)]));
        """
    )
    assert (out[0]['pos'], out[0]['mark']) == (4, 'me3') and out[1]['mark'] == 'me2s' and out[2]['mark'] == 'ph'
    assert out[3]['mark'] == '' and out[4]['pos'] == 216 and out[5] is None
    assert [(x['name'], x['letter'], x['pos'], x['mark']) for x in out[6:]] == [
        ('H3', 'K', 4, 'me3'),
        ('H4', 'R', 3, 'me2s'),
        ('TP53', 'K', 120, 'ac'),
    ]


@needs_node
def test_a_short_symbol_is_not_found_by_the_start_of_another_symbol():
    out = _node(
        """
        const row = (acc, gene, aliases) => ({ acc, gene, genes: [gene], aliases, name: gene, w: 1 });
        const rows = [row('A', 'H4C1', ['H4', 'H4/n']), row('B', 'CDV3', ['H41']), row('C', 'SERF2', ['H4F5rel']),
          row('D', 'ITIH4', ['H4P']), row('E', 'EWSR1', ['EWS'])];
        console.log(JSON.stringify([N.rank(rows, 'H4').map((h) => h.row.gene), N.rank(rows, 'EWSR').map((h) => h.row.gene)]));
        """
    )
    assert out == [['H4C1'], ['EWSR1']]  # a longer text still reaches the start of a symbol


def test_every_parser_reads_a_position_through_the_one_function():
    sel, land = (ASSETS / 'kit-select.js').read_text(), (ASSETS / 'land-search.js').read_text()
    assert 'window.PTMNames.pos(toks[j])' in sel and 'POS_RE' not in sel
    assert 'N.siteOf(q, known)' in land and 'N.read(names, known)' in land


def test_the_landing_search_routes_a_site_by_the_explorer_that_holds_it():
    js = (ASSETS / 'land-search.js').read_text()
    assert "fetch('proteins-sites.json')" in js and 'holds(row, k, site)' in js
    assert "' (protein only)'" in js
    # Enter: an exact current symbol, else the category the words match, else the first protein
    assert 'h.tier === 0 && (!h.via || h.row.short.includes(h.via))' in js and 'go.cat' in js


def test_the_marked_sites_index_gives_each_protein_its_positions_as_the_page_numbers_them(tmp_path):
    import pandas as pd

    from ptmcontext.web import _marked_sites

    (tmp_path / 'marks.tsv').write_text('accession\tposition\tresidue\nP1\t120\tK\nP1\t4\tK\nP2\t5\tK\nP3\t9\tR\n')
    ptab = pd.DataFrame({'accession': ['P1', 'P2', 'P3'], 'gene': ['TP53', 'H3C1', 'X'], 'name': ['a', 'b', 'c']})
    rules = [{'genes': r'^H3C\d+$', 'offset': -1}]
    got = _marked_sites(tmp_path, ptab, rules)
    assert got == {'P1': 'K4 K120', 'P2': 'K4', 'P3': 'R9'}  # histone H3 K4 is UniProt K5
    assert _marked_sites(tmp_path / 'none', ptab, rules) == {}


@needs_node
def test_a_typed_accession_ranks_its_protein_first():
    out = _node(
        """
        const rows = [{ acc: 'A0A0U1RRI6', gene: 'CENPVL3', name: 'x', genes: [], aliases: [], ids: [0], w: 1 },
          { acc: 'P04637', gene: 'TP53', name: 'y', genes: [], aliases: [], ids: [0], w: 1 }];
        console.log(JSON.stringify([N.rank(rows, 'A0A0U1RRI6', 12), N.rank(rows, 'a0a0u1rri6', 12)].map((r) => r.map((h) => h.row.acc))));
        """
    )
    assert out == [['A0A0U1RRI6'], ['A0A0U1RRI6']]
