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


def test_domain_names_inside_boxes_never_share_a_span():
    # domains over one span (nested entries from two databases) would write two centred names on top of each other;
    # a name goes inside its box only where no earlier name already stands there, else under the backbone or not at all
    body = JS[JS.index('const below = [],') : JS.index('Object.assign(c, { below, dis, segs })')]
    assert 'named = []' in body and 'named.some(' in body and 'named.push(' in body
    assert body.index('named.some(') < body.index('named.push(') < body.index('below.push(')
    # and a name is drawn after every box, or a box over another would hide it
    assert 'inside.push(' in body and 'parts.push(...inside)' in JS
