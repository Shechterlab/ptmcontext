"""Protein-page fixes read from the kit's source: no class shared between a tile caption and a hidden label, a failed
lookup that is not an empty answer, and the Other PTMs card read from the map's own marks."""

import re
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _src(name):
    return (ASSETS / name).read_text()


def test_the_tile_caption_class_is_not_a_visually_hidden_label():
    hidden = re.compile(r'\.([\w-]+)\s*\{[^}]*clip:\s*rect\(0')
    hid = {m for f in ASSETS.glob('kit*.js') for m in hidden.findall(f.read_text())}
    hid |= set(hidden.findall(_src('kit.css')))
    assert 'class="hl-lab"' in _src('kit-proteins.js') and 'hl-lab' not in hid


def test_an_ortholog_request_that_fails_is_not_reported_as_no_ortholog():
    js = _src('kit-conserve.js')
    assert 'type=orthologues' in js  # the value Ensembl's homology endpoint accepts
    assert not re.search(r'400\|404', js)  # an HTTP error is never turned into an empty answer
    assert 'is unavailable right now' in js and 'data-cv-retry' in js


def test_the_other_ptms_card_reads_the_maps_context_marks():
    cards, mp = _src('kit-pcards.js'), _src('kit-map.js')
    assert 'K.map.contextMarks(' in cards and 'function contextMarks(' in mp


def test_a_protein_section_has_a_plain_name_in_the_address_and_the_logo_opens_without_a_selection():
    js = _src('kit-proteins.js')
    assert "'p-struct': 'structure'" in js and 'K.markSection = markSection' in js
    assert 'K.markSection?.(jumpId)' in _src('kit-rail.js')
    cons = _src('kit-conserve.js')
    assert '(!c.active || c.marks)' in cons  # marks is null while no search or filter is set
