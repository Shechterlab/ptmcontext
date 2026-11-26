"""Round 8: shorter visible text, no electrical-ground glyph, plain busy note."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def src(name):
    return (ASSETS / name).read_text(encoding='utf-8')


def test_site_files_lose_the_long_notes():
    assert 'Published results per explorer, by class.' in (ROOT / 'sites' / 'landing.yml').read_text()
    assert 'not recomputed' not in (ROOT / 'sites' / 'landing.yml').read_text()
    assert 'Several Tudor domains' not in (ROOT / 'sites' / 'methylarginine.yaml').read_text()


def test_partner_and_record_lines_are_short():
    pix, pnet, card = src('kit-pix.js'), src('kit-pnet.js'), src('kit-sitecard.js')
    assert 'Writers or readers on record:' in pix and 'STRING physical, score ≥' in pix
    assert 'themselves' not in pix
    assert 'Matched by UniProt accession' in pnet and 'An association is to the whole protein and does not' not in pnet
    assert "' — ' + esc(RC.help[g])" not in card and 'title="${esc(RC.help[g])}"' in card


def test_conservation_structure_and_variant_legends():
    assert 'Conserved as ${esc(KEPT)}:' in src('kit-conserve.js') and 'Wilcoxon rank-sum p =' not in src(
        'kit-conserve.js'
    )
    d3 = src('kit-3d.js')
    assert 'RCSB sequence search (MMseqs2), live.' in d3 and 'touch: the ' not in d3
    assert 'q: adjusted for the sites tested.' in src('kit-sitetable.js')


def test_help_and_changelog_are_terse():
    h = src('kit-help.js')
    assert 'Protein: gene, UniProt accession or entry name.' in h and 'A cell is the number of variants' not in h
    assert 'Families come from' not in h and 'sites ranked by signed −log10 p' in h
    log = (ROOT / 'CHANGELOG.md').read_text()
    assert 'American spelling throughout' not in log and 'Citation and license notes state only' not in log


def test_no_ground_glyph_and_plain_busy_note():
    for name in ('kit.js', 'kit-rail.js'):
        assert '⏚' not in src(name)
    assert 'Updating…' in src('kit.js') and 'Updating: testing' not in src('kit.js')
