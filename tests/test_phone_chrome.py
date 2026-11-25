"""Layout of the page chrome: one landing routine below the sticky bars, no sideways scroll on a phone, a one-row header,
one Methods entry (tabs and footer, not the header links)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def _t(name):
    return (ASSETS / name).read_text()


def test_the_landing_uses_the_real_height_of_the_sticky_bars():
    kit, prot, css = _t('kit.js'), _t('kit-proteins.js'), _t('kit.css')
    assert "setProperty('--sticky-h'" in kit and 'dockH()' in kit.split("'--sticky-h'")[1][:80]
    assert "getPropertyValue('--sticky-h')" in prot
    assert 'new ResizeObserver' in prot.split('function landOn')[1].split('K.landOn = landOn')[0]
    assert css.count('var(--sticky-h, var(--toolbar-h, 0px))') >= 3
    # no second scroll routine: the open-link module calls the shared one
    assert 'K.landOn?.(' in _t('kit-openlink.js')


def test_nothing_widens_a_phone_page():
    css, prop = _t('kit.css'), _t('kit-propensity.js')
    assert '.tbl-wrap:has(> .sites-tbl) {' in css and '.tbl-wrap {\n    overflow-x: visible;' not in css
    assert '@media (max-width:40rem){.pr-s{white-space:normal}' in prop
    assert 'position: fixed;\n    top: auto;' in css.split('.col-pop {')[-1]


def test_the_header_is_one_row_on_a_phone_off_the_home_page():
    css, kit = _t('kit.css'), _t('kit.js')
    tpl = (ROOT / 'ptmcontext' / 'web' / 'template.html').read_text()
    assert "classList.toggle('compact-phone'" in kit and "add('compact-phone')" in tpl
    assert '@media (max-width: 700px) {\n  body.compact-phone .hero {' in css
    assert 'body.compact-phone:not(.has-selection) .toolbar .scope' in css


def test_methods_is_in_the_tabs_and_the_footer_not_the_header_links():
    for f in ('methylarginine', 'methyllysine', 'lysine', 'phospho', 'yeast_phospho'):
        text = (ROOT / 'sites' / f'{f}.yaml').read_text()
        assert 'url: "#method"}' not in text, f


def test_the_landing_stays_pinned_until_the_reader_acts_or_the_page_settles():
    land = _t('kit-proteins.js').split('function landOn')[1].split('K.landOn = landOn')[0]
    assert "addEventListener('scroll', go" in land  # the measured top is put back after any move
    assert '15000' in land and 'K.inflight' in land
    assert all(f"'{e}'" in _t('kit-proteins.js') for e in ('click', 'keydown', 'wheel', 'touchstart'))
    assert "style.overflowAnchor = 'none'" in land  # no browser scroll anchoring against the pin
    opn = _t('kit-openlink.js')
    assert 'K.inflight = ' in opn and 'window.fetch = counted' in opn
