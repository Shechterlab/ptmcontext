"""The protein map's draw steps share one context object, `c`; a step must not shadow it with a local `c`."""

import re
from pathlib import Path

JS = (Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets' / 'kit-map.js').read_text()


def test_no_draw_step_shadows_the_shared_context_with_a_function_level_c():
    # each draw_* step, and the row helpers it defines, read and move c.y; a `const c = ...` declared at the
    # helper's own level (not inside a loop) would hide the context, as the PDB rows once did
    start = JS.index('function draw_setup(c)')
    end = JS.index('function controls()')
    body = JS[start:end]
    hits = [m.group(0) for m in re.finditer(r'\n {8}const c = [^\n]*', body)]
    assert not hits, hits
