"""On a protein's page the cell and nucleus maps name every compartment: found here (with the number of studies), not found
here, or not tested; the line under them says "Found in"."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def test_every_compartment_is_named_on_the_protein_page():
    js = (ASSETS / 'kit-cell.js').read_text()
    for word in (
        "'Found here'",
        "'Not found here'",
        "'Not tested'",
        "' study' : ' studies'",
        'not found here',
        'not tested',
    ):
        assert word in js, word
    assert "tone: hit.length ? 'u2' : tested ? 'ns' : 'na'" in js


def test_the_line_under_the_maps_says_found_in_and_no_placed_wording_remains():
    pc = (ASSETS / 'kit-pcards.js').read_text()
    assert '<b>Found in:</b>' in pc and 'Placed in' not in pc and 'places it' not in pc
