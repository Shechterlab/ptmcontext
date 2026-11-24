"""Polish of the explorers' views: the inherited-disease list has no sideways scroll, the protein page and the Network link to
each other, and the regular views keep their explanations in Help. The scripts run in the browser; these read their source."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _src(name):
    return (ASSETS / name).read_text()


def test_the_inherited_disease_list_is_one_wrapping_row_a_site_with_a_chip_for_each_family():
    js = _src('kit-mutations.js')
    assert 'class="mu-cvl"' in js and 'class="mu-chipset"' in js and 'data-mu-order' in js
    assert 'mu-cvw' not in js and 'mu-cvt' not in js and 'mu-fam' not in js  # the sideways-scrolling grid is gone
    assert 'flex-wrap:wrap' in js and 'overflow-x:auto' not in js.split('.mu-cv{')[1].split("',")[0]
    for kept in ('data-mu-stars', 'data-mu-more', 'data-mu-cell', 'clinvarTsv', 'clinvarSvg'):
        assert kept in js  # the review filter, Show more, the family detail and the exports stay


def test_the_protein_page_and_the_network_link_to_each_other_from_the_site_file_alone():
    pnet, net = _src('kit-pnet.js'), _src('kit-network.js')
    assert 'See this protein in the Network view' in pnet and 'K.netHref?.(p)' in pnet
    assert "K.net = { link: (acc) => K.link('network', '', { p: acc }) }" in net and 'NC.protein_link === false' in net
    assert (
        'live STRING partners are on its protein page' in net
        and '${one.acc}/interactions' in net
        and 'D.partners' in net
    )
