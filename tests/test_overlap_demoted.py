"""The overlap of protein sets is no tab: it opens from a set's row, the selection bar and old addresses, leads with the
modification question, and builds the same selection as the AND of classes made on the Overview."""

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
OVERLAP = (ASSETS / 'kit-overlap.js').read_text()
KIT = (ASSETS / 'kit.js').read_text()
SELECT = (ASSETS / 'kit-select.js').read_text()
RAIL = (ASSETS / 'kit-rail.js').read_text()
COMPARE = (ASSETS / 'kit-compare.js').read_text()


def test_no_tab_but_the_route_and_the_entry_points_remain():
    assert "'overlap'" not in KIT.split('const TAB_ORDER = ')[1].split(';')[0]
    assert "K.tabs.push(() => ['overlap'" not in OVERLAP
    assert 'K.views.overlap = {' in OVERLAP and "view === 'compare' && !rest[0]" in KIT
    # one helper writes the address; the row menu, the rows and the selection bar all use it
    assert 'K.overlapOpen = (terms)' in OVERLAP
    assert 'K.overlapOpen([d.ov])' in KIT and 'K.overlapOpen([K.sel.asSetTerm()' in COMPARE
    assert 'Overlap with another set ›' in OVERLAP and 'Overlap with another set ›' in COMPARE


def test_the_page_leads_with_the_modification_question_and_drops_the_methylated_only_test():
    assert "const TITLE = 'Overlap of protein sets';" in OVERLAP and 'title: () => TITLE' in OVERLAP
    assert 'pairs.marked' not in OVERLAP and 'pairTableHtml' not in OVERLAP and 'tsvPairs' not in OVERLAP
    assert 'data-ov-q' not in OVERLAP and 'Among the ${W.marked} proteins alone' not in OVERLAP
    # the set-vs-set test is one muted line under the diagram
    assert 'ov-pairline muted' in OVERLAP
    assert OVERLAP.index('ov-answer') < OVERLAP.index('id="ov-fig"') < OVERLAP.index('ov-pairline')
    # the picker is search first; the kinds are filters behind a disclosure; no pool size is shown
    assert 'Browse by kind' in OVERLAP and 'to choose from' not in OVERLAP


def test_and_of_classes_is_one_representation():
    # one filter key per protein-set question (p:<question>): AND across questions, OR within one
    assert 'const andOk = (aid, cat)' in SELECT and 'asSetTerm' in SELECT
    assert '<span class="sel-and">AND</span>' in RAIL
    assert 'Add to selection (AND)' in KIT and 'Add to selection (AND)' in OVERLAP
    # the A-and-B region of set classes goes to the Overview as those filters, with no search text
    assert "K.go('overview', { q: '', f: and, qn: null })" in OVERLAP
    assert "f['p:' + m[1]] = [m[2]]" in OVERLAP
