"""Names and wording built in the kit (review 6): one name for each thing, read from the site file where it has one."""

from __future__ import annotations

from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'


def read(name):
    return (ASSETS / name).read_text()


def test_enzyme_role_names_come_from_the_site_file():
    card = read('kit-sitecard.js')
    assert "RL.writer || 'Writer'" in card and "RL.eraser || 'Eraser'" in card
    assert 'role_labels' in read('kit-sites.js') and 'role_labels' in read('kit-sitetable.js')
    assert "'Kinase" not in card and "'Phosphatase" not in card


def test_disease_variants_names_and_one_home():
    js = read('kit-mutations.js')
    assert "['clinvar', 'ClinVar pathogenic']" in js and "'Inherited disease'" not in js
    assert '`${s.label} ${u}, ranked by p`' in js
    assert "mv: 'clinvar'" in js and 'K.questionHome' in js
    kit = read('kit.js')
    assert 'K.questionHome?.(id)' in kit and 'K.questionHome?.(S.arg)' in kit
    # a link to a question whose home is another page goes there directly (no old #overview/<id> address in a page)
    assert "view === 'overview' && arg && !extra && (K.questionHome?.(arg) || movedHome(arg))" in kit
    assert 'const old = (D.legacy_links || {})[id];' in kit


def test_generated_sentences_and_headings():
    kit = read('kit.js')
    assert '>Strongest results${' in kit and '>Key findings${' not in kit
    assert 'vs all proteins tested' in kit and 'vs other ${esc(W.residues)}' in kit
    assert 'Located in ${nPl} of ${ms.length} maps' in read('kit-pcards.js')
    assert 'Site spacing and sequence' in read('kit-pcards.js')
    assert 'conserved as ${KEPT}' in read('kit-conserve.js')
    assert 'none observed' in read('kit-propensity.js') and 'none seen' not in read('kit-sitetable.js')


def test_enter_applies_the_top_term_match():
    js = read('kit-search.js')
    tail = js.split("} else if (e.key === 'Enter') {")[1][:500]
    assert "top[0]?.kind === 'termsel'" in tail and 'choose(0)' in tail
