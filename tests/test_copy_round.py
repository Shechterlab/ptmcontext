"""Wording and naming round: Key findings flag, ISO dates, landing references, one name per action, glossary, spelling."""

from __future__ import annotations

from pathlib import Path

from ptmcontext.layers.configured import _motif_family
from ptmcontext.profile import load_profile
from ptmcontext.web import _key_findings_off, human_date
from ptmcontext.web.landing import _ref

REPO = Path(__file__).resolve().parents[1]
ASSETS = REPO / 'ptmcontext' / 'web' / 'assets'


def test_key_findings_flag_on_a_question_or_a_motif_family():
    assert _key_findings_off({'id': 'q', 'key_findings': False}, None, None) == {'key_findings': False}
    assert _key_findings_off({'id': 'q'}, None, None) == {}
    fams = [
        {'name': 'circular', 'pattern': 'KA', 'key_findings': False},
        {'name': 'plain', 'pattern': 'KG'},
    ]
    assert _key_findings_off({'id': 'q', 'with': {'families': fams}}, None, None) == {'key_findings_off': ['circular']}
    # a motif layer that reads the mark profile's families
    profile = load_profile(REPO / 'sites' / 'marks' / 'lysine.yaml')
    out = _key_findings_off({'id': 'motif'}, {'shape': 'flags'}, profile)
    assert out == {'key_findings_off': ['SUMO_consensus']}
    assert _motif_family(fams[0], 'q', 5)['name'] == 'circular'  # the key is known to the family checker


def test_the_circular_motifs_are_left_out_of_key_findings_in_the_site_files():
    text = (REPO / 'sites' / 'phospho.yaml').read_text()
    assert 'name: polo_box' in text and 'key_findings: false' in text.split('name: polo_box')[1].split('\n')[0]


def test_dates_are_iso():
    assert human_date('2026-11-01') == '2026-11-01'
    assert human_date('2026-11-01T10:20:30Z') == '2026-11-01'
    js = (ASSETS / 'kit.js').read_text()
    assert '`${m[1]}-${m[2]}-${m[3]}`' in js and 'MONTHS' not in js


def test_landing_references_link_the_dois():
    line = _ref({'label': 'Data', 'doi': '10.5281/zenodo.1', 'all_versions': '10.5281/zenodo.2'})
    assert 'https://doi.org/10.5281/zenodo.1' in line and 'all versions' in line and 'zenodo.2' in line
    assert 'PTM_Pipeline v1.5.1' in _ref({'label': 'Data', 'text': 'PTM_Pipeline v1.5.1', 'url': 'https://x.org'})
    assert _ref({'label': 'Data'}) == ''


def test_one_name_per_action():
    js = (ASSETS / 'kit.js').read_text()
    assert "details: 'Details'" in js and "filters: 'Filters'" in js and "resetView: 'Reset view'" in js
    assert 'details ›' not in js and 'Selection and filters' not in js
    for f in ('kit-cell.js', 'kit-map.js', 'kit-pnet.js', 'kit-network.js'):
        assert 'K.ACT.resetView' in (ASSETS / f).read_text()
    assert 'Reset zoom' not in (ASSETS / 'kit-map.js').read_text()


def test_american_spelling_is_a_display_mapping():
    js = (ASSETS / 'kit.js').read_text()
    assert "defence: 'defense'" in js and 'US_RE' in js and 'usText(a,' in js
    # the data keep the source's own names: only labels and texts are mapped, never a row's category
    assert 'r.category = us(' not in js


def test_shared_glossary_is_filtered_by_use():
    js = (ASSETS / 'kit-help.js').read_text()
    for term in ('IDR', 'aa', 'Janus', 'polyampholyte'):
        assert f"['{term}'," in js
    # terms of one mark live in that site's file, not in the kit
    assert "['PRMT'," not in js and "['RGG'," not in js
    assert 'function glossaryTerms' in js and 're.test(text)' in js
