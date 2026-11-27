"""The phone's Overview: the cell tile's part lists keep each value clear of its label at 360 and 390 px, the cell tile's
summary and legend read as short lines, the variant switch is reachable in the filters drawer, and a section holding one tile
of its own name shows that name once."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from test_controls import _playwright

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
CELL = (ASSETS / 'kit-cell.js').read_text()
KIT = (ASSETS / 'kit.js').read_text()
RAIL = (ASSETS / 'kit-rail.js').read_text()
CSS = (ASSETS / 'kit.css').read_text()

LABELS = [
    ('Stress granules (cell map)', 'effect +0.6'),
    ('Ribosomes and translation', 'effect +0.6'),
    ('Endosomes and lysosomes', 'effect −0.4'),
    ('P-bodies (cell map)', 'effect +0.4'),
    ('Peroxisomes', 'effect −0.3'),
    ('Actin cortex', 'effect +0.3'),
    ('Paraspeckles', 'effect +1.2'),
    ('Nuclear bodies', 'effect +0.4'),
    ('Chromatin', 'effect +0.2'),
    ('Nucleolus', 'effect +0.2'),
]

PAGE = """<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://%(css)s">
<body style="margin:0;padding:0 16px"><div class="cp-cols">%(cols)s</div></body>"""

CHECK = r"""
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(), out = {};
  for (const w of [360, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    await p.goto('file://' + process.argv[2]);
    out[w] = await p.$$eval('.cp-row', (rows) => rows.map((r) => {
      const a = r.querySelector('.cp-n').getBoundingClientRect(), v = r.querySelector('b').getBoundingClientRect();
      return { t: r.querySelector('.cp-n').textContent, hit: a.left < v.right && v.left < a.right && a.top < v.bottom && v.top < a.bottom,
               words: r.querySelector('.cp-n').scrollWidth > r.querySelector('.cp-n').clientWidth };
    }));
    await p.close();
  }
  console.log(JSON.stringify(out));
  await b.close();
})();
"""


def test_a_part_list_value_never_overlaps_its_label_at_phone_widths(tmp_path):
    node_root = _playwright()
    if not node_root:
        pytest.skip('needs Node and Playwright')
    half = len(LABELS) // 2
    cols = ''.join(
        '<section class="cp-col"><h4>x</h4><ul class="cp-list">'
        + ''.join(
            f'<li><button type="button" class="cp-row"><i class="kd"></i><span class="cp-n">{a}</span><b>{b}</b></button></li>'
            for a, b in rows
        )
        + '</ul></section>'
        for rows in (LABELS[:half], LABELS[half:])
    )
    page = tmp_path / 'grid.html'
    page.write_text(PAGE % {'css': str(ASSETS / 'kit.css'), 'cols': cols})
    script = tmp_path / 'check.js'
    script.write_text(CHECK)
    run = subprocess.run(
        ['node', str(script), str(page)],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
        env={**__import__('os').environ, 'NODE_PATH': node_root},
    )
    assert run.returncode == 0, run.stderr[-1500:]
    out = json.loads(run.stdout.strip().splitlines()[-1])
    for w, rows in out.items():
        assert len(rows) == len(LABELS)
        assert not [r['t'] for r in rows if r['hit']], w
        assert not [r['t'] for r in rows if r['words']], w  # no label wider than its box


def test_the_part_lists_are_one_column_on_a_phone_and_their_labels_wrap_by_words():
    assert '@media (max-width: 520px) {\n  .cp-cols {\n    grid-template-columns: minmax(0, 1fr);' in CSS
    assert '.cp-n {\n  min-width: 0;\n  overflow-wrap: break-word;' in CSS


def test_the_effect_summary_has_one_pair_of_parentheses_per_part_and_the_legend_is_one_line_per_item():
    assert 'ith = (p) => `${inText(p.row)}, ${hText(p.h)}`' in CELL
    key = CELL[CELL.index('function pctKey') :]
    key = key[: key.index('const { range, ref } = parts(scoped')]
    order = [
        'effect: share against all mapped proteins',
        'Filled: q ≤ ${Q_MAX} and |effect| ≥ ${MIN_H}',
        'Outline: q ≤ ${Q_MAX}, |effect| &lt; ${MIN_H}',
        'Hatched: q &gt; ${Q_MAX}',
        'pctRefWords(scoped, ref)',
        ' not measured',
    ]
    at = [key.index(s) for s in order]
    assert at == sorted(at)
    assert 'Filled where' not in key and 'pk-lines' in key and '.pk-lines .cell-key{flex:1 0 100%}' in CELL


def test_the_variant_switch_is_in_the_filters_drawer_on_a_phone_and_not_in_the_scrolling_tab_bar():
    assert "matchMedia('(max-width: 700px)').matches ? K.variantSwitch()" in RAIL
    assert '${phoneVariant()}${savedHtml()}' in RAIL
    assert '@media (max-width: 700px) {\n  #tabs .vswitch {\n    display: none;' in CSS
    assert 'location.href = e.target.dataset.variantHref + location.hash' in KIT  # one handler for both copies


def test_a_section_with_one_tile_of_its_own_name_shows_the_name_once():
    assert 'tileTitle(x.cards[0]) === head(x)' in KIT
    assert "x.cell || namedByTile(x) ? ' vh' : ''" in KIT


HEADINGS = r"""
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(), p = await b.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(process.argv[2] + '/index.html#protein/ONE/P1');
  await p.waitForSelector('.prot-head', { timeout: 30000 });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() => [...document.querySelectorAll('h2, h3')].map((h) => [h.textContent.trim(), !!h.closest('details:not([open])')]));
  console.log(JSON.stringify({ out, errs }));
  await b.close();
})();
"""


def test_a_protein_page_has_no_heading_without_text(tmp_path):
    """Headings inside a shut fold read as empty to innerText; none is empty in the markup."""
    import functools
    import http.server
    import threading

    from test_search import _build, _toy

    node_root = _playwright()
    if not node_root:
        pytest.skip('needs Node and Playwright')
    index = _build(_toy(tmp_path))
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(index.parent))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        script = tmp_path / 'headings.js'
        script.write_text(HEADINGS)
        run = subprocess.run(
            ['node', str(script), f'http://127.0.0.1:{httpd.server_address[1]}'],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
            env={**__import__('os').environ, 'NODE_PATH': node_root},
        )
    finally:
        httpd.shutdown()
    assert run.returncode == 0, run.stderr[-1500:]
    out = json.loads(run.stdout.strip().splitlines()[-1])
    assert out['errs'] == [] and out['out']
    assert not [h for h in out['out'] if not h[0]]
