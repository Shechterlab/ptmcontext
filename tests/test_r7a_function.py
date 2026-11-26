"""Round-7 function and layout fixes, read from the sources."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def src(name: str) -> str:
    return (ASSETS / name).read_text()


def test_a_listed_entry_is_opened_first_and_the_toggle_names_only_the_entry_being_loaded():
    js = src('kit-3d.js')
    start = js[js.index('function startPdbOrAf') : js.index('function start()')]
    assert 'const afFirst' in start and 'entriesAt(pos)' in start
    assert start.index('showPdb(e, ch, pos)') < start.index('scanSite(acc, pos).then(() => {\n              if (T.acc')
    assert 'T.loadingId = id' in js and 'loading ? { id: loading }' in js
    assert '!T.loadingId && !scanSite.shown' in js
