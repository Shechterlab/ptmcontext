"""Every table and card that offers a TSV offers PDF, SVG and PNG beside it (kit-tabfig.js draws a page's table as a figure
through the kit's figure frame; the IDR regions have a drawing of their own). No module may write an export bar of TSV alone."""

from __future__ import annotations

import re
from pathlib import Path

from ptmcontext import web

ASSETS = Path(web.__file__).parent / 'assets'


def test_no_export_bar_offers_tsv_alone():
    alone = {}
    for f in sorted(ASSETS.glob('kit*.js')):
        for m in re.finditer(r"expBar\(\[\s*'tsv'\s*\]", f.read_text()):
            alone[f.name] = alone.get(f.name, 0) + 1
    assert alone == {}


def test_the_table_figure_module_is_loaded_before_its_users_and_exports_the_api():
    assert 'kit-tabfig.js' in web.MODULES and web.MODULES.index('kit-tabfig.js') < web.MODULES.index('kit-proteins.js')
    src = (ASSETS / 'kit-tabfig.js').read_text()
    assert 'K.figureFrame(' in src and 'tableFigure, tableExport' in src
    for name in ('kit-tables.js', 'kit-sites.js', 'kit-proteins.js', 'kit-questions.js', 'kit-idrs.js'):
        assert 'K.tableExport(' in (ASSETS / name).read_text() or 'regionsFigure' in (ASSETS / name).read_text()
