"""The fixes from the usability walkthroughs, as the kit's scripts state them: a loading state before any count or verdict, labeled
site rows, a visible Copy link, the numbering note beside a site, readable export names. The scripts run in the browser; these
read them, as the neighboring kit tests do."""

import re
from pathlib import Path

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'


def _js(name):
    return (ASSETS / name).read_text()


def test_a_selection_whose_marks_are_still_coming_shows_no_count_and_no_verdict():
    sel = _js('kit-select.js')
    assert 'const isLoading = () => active() && !SD && !loadFailed;' in sel and 'loading: isLoading' in sel
    for name in ('kit-rail.js', 'kit.js', 'kit-interactions.js', 'kit-tables.js'):
        assert 'K.sel.loading' in _js(name), name
    # the "too few to test" notes come after the loading check
    kit = _js('kit.js')
    assert kit.index('K.sel.loading?.()\n        ? K.loading(K.sel.loadingText())') < kit.index(
        'Too few to test: a selection needs'
    )


def test_site_rows_label_k_and_mute_o_e_for_a_single_change():
    prop = _js('kit-propensity.js')
    assert 'function kOE(' in prop and '(k)' in prop and 'class="muted"' in prop and 'v.k <= 1' in prop
    table = _js('kit-sitetable.js')
    assert 'K.prop.kOE(' in table and 'q ${fq(c.q)}' in table


def test_copy_link_is_a_visible_button_that_says_it_copied():
    rail = _js('kit-rail.js')
    assert 'data-sel-share' in rail and "'Link copied'" in rail


def test_a_pasted_list_gets_one_plain_verdict_and_the_reason_for_untested_sites():
    mu = _js('kit-mutations.js')
    assert 'function listVerdict(' in mu and 'tested ${x.nTested === 1' in mu and 'class="mu-verdict"' in mu
    assert 'no change at its residues of this type' in mu


def test_a_gene_and_a_residue_with_a_position_is_a_site_before_a_fuzzy_name():
    assert 'function siteRow(' in _js('kit-search.js')
    assert '(!SD && !!want)' in _js('kit-select.js')


def test_a_protein_numbered_without_its_initiator_methionine_shows_the_uniprot_position_and_clinvars_own_change():
    mu = _js('kit-mutations.js')
    assert 'const uniNote =' in mu and '(UniProt ${res' in mu
    # ClinVar's change is the residue, the UniProt position and the change: never the page's numbering
    assert re.search(r"const varName = \(r, v\) => `\$\{r\.res \|\| ''\}\$\{r\.pos\}\$\{v\[2\]\}`;", mu)
    assert 'uniprot_position' in mu and 'clinvar_protein_change' in mu


def test_exports_have_readable_column_names():
    table = _js('kit-sitetable.js')
    for name in ('hotspot_note', 'disordered', '_pathogenic_n', '_conditions', 'alphamissense_mean', '_oe'):
        assert name in table, name
    assert 'c.tsvName || c.id' in table
    mu = _js('kit-mutations.js')
    assert 'observed_over_expected' in mu and 'disorder_class' in mu


def test_the_sites_download_names_its_file_and_the_logo_export_is_named_plainly():
    assert 'Site table (TSV)' in _js('kit-sites.js')
    cons = _js('kit-conserve.js')
    assert (
        'Sequence logo counts (TSV)' in cons
        and '_sequence_logo' in cons
        and 'site_alignment_logo_selection' not in cons
    )
