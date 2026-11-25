"""The Network page answers in one sentence and lists its clusters; the Proteins tab has preset sorts; the Sites tab has a
quick filter on every explorer; #overview/motif opens the kinase motif classes; and jargon has a plain label. The scripts run
in the browser; these read their source and the site files."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
SITES = ['methylarginine', 'methyllysine', 'lysine', 'phospho']


def _site(name):
    return yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())


def _src(name):
    return (ASSETS / name).read_text()


def test_the_network_page_answers_in_a_sentence_and_lists_its_clusters_under_the_graph():
    js = _src('kit-network.js')
    assert 'function answerText(M, CL, sel0)' in js and 'largest: ${big.map' in js
    assert 'function clusterTableHtml(M, CL)' in js
    # the table follows the figure and its key; the sentence follows the heading
    assert "${key}</div>${CL.nShown ? clusterTableHtml(M, CL) : ''}" in js
    assert 'head + ans + controls(CL)' in js
    # one wording for a term: "26 of 49 carry this term", never a bare "26 of 49"
    assert 'cluster proteins carry this' in js and '} carry it' in js
    assert 'cluster proteins, ${int(c.l.M)}' not in js


def test_every_explorer_has_the_most_sites_preset_and_the_sorts_equal_the_starting_points():
    for s in SITES:
        pre = (_site(s)['website'].get('proteins') or {}).get('presets')
        assert pre and pre[0]['by'] == 'marks', s
    ma = _site('methylarginine')['website']
    start = ma['overview']['starting_points']['lists']
    pre = ma['proteins']['presets']
    assert [p['title'] for p in pre] == ['Most sites', 'Most methylated for their arginine count', 'Dense stretch']
    for a, b in zip(start, pre):  # the same definitions, so the same lists
        for k in ('by', 'order', 'where', 'show', 'n'):
            assert a.get(k) == b.get(k), (a['title'], k)
    js = _src('kit-tables.js')
    assert 'data-tpreset' in js and 'PCFG.presets' in js and 'dir * (pVal(x.p, pre.by) - pVal(y.p, pre.by))' in js


def test_the_sites_tab_has_a_quick_filter_on_every_explorer_and_methyllysine_a_state_column():
    ml = _site('methyllysine')['website']['sites']
    assert ml['quick'] == ['state'] and ml['state'] == 'state'
    assert _site('lysine')['website']['sites']['quick'] == ['acyl_type']
    assert 'quick' in _site('methylarginine')['website']['sites']
    js = _src('kit-sites.js')
    assert "['category', 'list'].includes(SPECS[n].kind)" in js and 'SV.state' in js and 'const stateCell' in js


def test_the_old_motif_address_opens_the_kinase_motif_classes():
    site = _site('phospho')
    assert site['website']['legacy_links']['motif'] == 'kinase_motifs'
    assert 'kinase_motifs' in {a['id'] for a in site['analyses']}


def test_jargon_has_a_plain_label_and_a_help_entry():
    layer = (ROOT / 'ptmcontext' / 'layers' / 'charge.py').read_text()
    for old in ('Janus IDR', 'Strong polyampholyte IDR', 'Weakly charged IDR'):
        assert old not in layer
    help_js = _src('kit-help.js')
    for term in (
        'Moderately charged, mixed',
        'Strongly charged, balanced',
        'Observed/expected',
        'Likely interface',
        'RNA-contact',
    ):
        assert f"'{term}'," in help_js
    for s in SITES:
        text = (ROOT / 'sites' / f'{s}.yaml').read_text()
        for old in ('title: Other PTMs', '"pDockQ ≥ 0.23"', 'CAPRI ADJ', 'RBR-ID+'):
            assert old not in text, (s, old)
    assert all(
        'title: "pathogenic or likely pathogenic (ClinVar)"' in (ROOT / 'sites' / f'{s}.yaml').read_text()
        for s in SITES
    )
    assert "return 'effect '" in _src('kit-cell.js')
    assert 'via the residue' in _src('kit-sitecard.js') and 'via the residue' in _src('kit-prna.js')
