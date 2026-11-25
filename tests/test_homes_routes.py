"""Routes to one fact land in one place: the landing search keeps a site, the Network panel and the protein page share one
network address, section links scroll below the toolbar through one helper, and a tile about one protein opens its section.
The scripts run in the browser; these read their source."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def _src(name):
    return (ASSETS / name).read_text()


def test_the_landing_search_opens_the_site_of_a_gene_and_residue_in_the_explorers_own_address():
    js = _src('land-search.js')
    assert '#protein/${path}${site ?' in js and 'new URLSearchParams({ q })' in js
    assert '#/protein/' not in js  # the old form that dropped the site
    assert 'N.read(names, known)' in js  # "H4 R3", "TP53 S15": the explorer reads the position in its numbering


def test_every_link_to_a_protein_in_the_network_is_built_by_one_function():
    net = _src('kit-network.js')
    assert "K.net = { link: (acc) => K.link('network', '', { p: acc })" in net
    assert net.count("K.link('network', '', {") == 1  # only inside K.net.link
    assert 'K.net.link(p.acc)' in net and "K.link('protein', pageArg(nd.acc))" in net
    assert '${acc}/${st[1]}' in net  # a selection naming one site keeps it on "Open protein page"


def test_the_partners_line_of_a_network_card_says_what_it_counts_and_points_to_the_home_count():
    net, pix, folds = _src('kit-network.js'), _src('kit-pix.js'), _src('kit-pfolds.js')
    assert 'with ${W.marks} in this network' in net and 'K.pix?.countNote' in net
    assert 'protein partners (STRING) in <a href=' in pix and "acc + '/interactions'" in pix
    assert 'K.pix.partnersOf(tb).length' in folds and 'partnersOf(tb).sort' in pix  # one list for the fold and the page


def test_section_links_scroll_through_the_one_landing_helper():
    prot, kit, ixn, opn = _src('kit-proteins.js'), _src('kit.js'), _src('kit-interactions.js'), _src('kit-openlink.js')
    assert 'K.landOn = landOn' in prot and 'const landOnCard = () =>' in prot
    assert 'K.landOn(find)' in kit  # the Methods page
    assert 'K.landOn?.(() => document.getElementById(`ix-${arg}`))' in ixn
    assert 'K.landOn?.(() => document.getElementById(id))' in opn


def test_a_tile_about_one_proteins_own_facts_opens_its_section_for_a_one_protein_selection():
    kit, prot, cell = _src('kit.js'), _src('kit-proteins.js'), _src('kit-cell.js')
    assert "link('protein', D.proteins[[...ids][0]][0], { open: fold })" in kit and 'ids?.size === 1' in kit
    assert 'tileHref(t.dataset.tile)' in kit
    assert 'K.proteinHome = (aid)' in prot and 'D.protein_view?.context' in prot
    assert "'p-cell'" in cell and 'K.cellHome' in cell


def test_partner_lists_say_protein_and_name_the_protein_by_gene_and_accession():
    pix, card, pnet = _src('kit-pix.js'), _src('kit-sitecard.js'), _src('kit-pnet.js')
    assert 'Protein partners (STRING)' in pix and 'Proteins at the sites' in pix and 'Protein network' in pnet
    assert 'K.card.protRef' in pix and 'protRef,' in card  # one drawing of a partner, here and in the site card
    assert 'https://www.uniprot.org/uniprotkb/${encodeURIComponent(acc)}' in card  # not in the dataset: UniProt
    assert 'data-jump="${id}"' in pix and "go('pn-net'" in pix and 'id="pn-net"' in pnet and 'id="pix-string"' in pix
    assert '(K.protActions ||= []).push' in pix  # a header button on the protein page
