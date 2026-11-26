"""Round-5 structural fixes: where a link lands, the cohort named beside k, the indirect writer in the summary, the 3D
toggle that says when no entry resolves the site, the share preset, the landing build, plural labels (read from the sources)."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def src(name: str) -> str:
    return (ASSETS / name).read_text()


def test_a_link_to_a_block_of_the_site_card_lands_on_that_block():
    proteins, openlink = src('kit-proteins.js'), src('kit-openlink.js')
    assert 'K.openedIn = (root)' in openlink
    assert 'K.openedIn?.(card) || card' in proteins


def test_the_site_table_names_the_cohort_of_k_for_somatic_sources():
    st = src('kit-sitetable.js')
    assert "s.kind === 'somatic'" in st and 'cohortTag()' in st and 'SRC.map(kName)' in st


def test_the_site_table_has_a_with_a_writer_chip_from_the_existing_writer_column():
    st = src('kit-sitetable.js')
    assert 'data-stwriter' in st and 'ST.writerFirst' in st and 'role_labels?.writer' in st


def test_the_summary_writer_line_marks_perturbation_writers_indirect_from_one_function():
    card = src('kit-sitecard.js')
    assert card.count('function suggestedWriters') == 1
    assert card.count('suggestedWriters(c)') == 3  # its definition, the block's reasons and the summary line's names
    assert '(indirect)</span>' in card


def test_the_3d_toggle_says_when_no_entry_resolves_the_site_and_the_model_comes_first():
    js = src('kit-3d.js')
    assert 'No experimental structure at ${rl(siteNow())}' in js and 'T.noneAt' in js
    assert js.index('return showAf()') < js.index('scanSite(acc, pos).then(')


def test_the_proteins_presets_can_rank_by_the_share_column():
    tables, site = src('kit-tables.js'), (ROOT / 'ptmcontext' / 'site.py').read_text()
    assert "n === 'share'" in tables and "('marks', 'share')" in site
    for name in ('methyllysine', 'lysine', 'phospho'):
        assert 'by: share' in (ROOT / 'sites' / f'{name}.yaml').read_text()


def test_the_landing_footer_names_the_build_and_labels_pluralize():
    web = (ROOT / 'ptmcontext' / 'web' / '__init__.py').read_text()
    assert '(build ' in web and 'code_commit()' in web
    assert "protein${n === 1 ? '' : 's'}" in src('kit-search.js').replace('"', "'")
    assert 'carry this term' in src('kit-netlayout.js')


def test_a_set_row_names_the_group_of_its_second_share():
    assert "' (all proteins)'" in src('kit.js')
