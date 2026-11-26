"""Round-11 fixes: the sites table names its count columns in words."""

from pathlib import Path

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'


def _src(name):
    return (ASSETS / name).read_text()


def test_the_sites_table_names_its_count_column_by_the_count_noun_not_k():
    st = _src('kit-sitetable.js')
    assert "sub: 'k'" not in st
    assert 'sub: noun(s)' in st
    assert '>k: ' not in st and 'st-note">k:' not in st
    assert '(k:' not in st
