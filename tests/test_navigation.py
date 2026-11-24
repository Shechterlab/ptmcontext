"""The navigation: the same tabs on every explorer in one order (greyed, with a reason, when a site lacks the data), Compare
sets, Methods with its five parts and the table of every test, the one footer, the Key findings strip, and the sidebar's
shared group order. A toy site, built and opened in a browser where one is available."""

from __future__ import annotations

import functools
import http.server
import json
import subprocess
import threading
from pathlib import Path

import jsonschema
import pandas as pd
import pytest
import yaml
from ci_sites import PUBLISHED
from test_controls import _playwright
from test_new_sources import _toy_site
from test_search import _build, _page_data, _toy

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.snapshot import md5_file

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
KIT = (ASSETS / 'kit.js').read_text()
SCHEMA = json.loads((Path(S.__file__).parent / 'schemas' / 'site.schema.json').read_text())
WEBSITE = SCHEMA['properties']['website']['properties']


def test_the_tabs_are_the_same_on_every_site_in_one_order():
    order = "const TAB_ORDER = ['overview', 'proteins', 'sites', 'interactions', 'network', 'method', 'help'];"
    assert order in KIT
    # a tab the site lacks is greyed out with its reason on hover, never left out
    assert 'class="tab off" role="link" aria-disabled="true"' in KIT and 'K.tabEmpty(v)' in KIT
    # the overlap of protein sets is no tab: it opens from a set's row, the selection bar and old addresses
    assert "overlap: 'Compare sets'" not in KIT and "method: 'Methods'" in KIT
    assert "K.tabs.push(() => ['overlap'" not in (ASSETS / 'kit-overlap.js').read_text()
    # the All tests tab is gone: its table is a part of Methods
    assert "['statistics'," not in KIT and "view === 'statistics'" in KIT  # only the old address is read
    assert 'id="m-every"><h3>All tests</h3>' in KIT


def test_old_addresses_and_the_words_they_replace():
    assert "if (view === 'statistics') [view, rest] = ['method', ['every']];" in KIT
    assert "view === 'compare' && !rest[0]" in KIT and "['overlap', []]" in KIT
    assert "btn('ov', 'Overlap with another set ›')" in KIT
    for name in ('lysine', 'methylarginine', 'methyllysine', 'phospho', 'yeast_phospho'):
        text = (Path(__file__).resolve().parents[1] / 'sites' / f'{name}.yaml').read_text()
        assert 'All tests' not in text and 'Methods & data' not in text and 'label: Documentation' not in text
        assert 'Code & data' not in text


def test_the_schema_takes_the_empty_reason_key_findings_and_the_group_order():
    tabs = WEBSITE['tabs']
    jsonschema.validate({'interactions': {'empty': 'No interaction data for this modification yet'}}, tabs)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate({'interactions': {'reason': 'x'}}, tabs)
    ov = WEBSITE['overview']
    jsonschema.validate(
        {'key_findings': {'count': 3, 'min_fold': 1.2, 'pin': ['a/b'], 'exclude': [{'analysis': 'c'}]}}, ov
    )
    jsonschema.validate({'key_findings': False, 'group_order': ['Localization', 'Classes and pathways']}, ov)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate({'key_findings': {'count': 9}}, ov)


def test_every_site_lists_the_shared_groups_in_the_shared_order(tmp_path):
    cfg = json.loads(
        (Path(__file__).resolve().parents[1] / 'ptmcontext' / 'config' / 'overview_groups.json').read_text()
    )
    for name in PUBLISHED:
        site = S.load_site(Path(__file__).resolve().parents[1] / 'sites' / f'{name}.yaml')
        names = [x['name'] for x in site['website']['overview']['sections']]
        shared = [n for n in names if n in cfg['shared']]
        assert shared == [n for n in cfg['shared'] if n in names], name
        # a site's own words for a shared group are a mistake: "Interactions" for "Interactions and enzymes"
        assert 'Interactions' not in names, name
    root = _toy(tmp_path, with_search=False)
    assert _page_data(_build(root))['overview_groups'] == {'shared': cfg['shared'], 'last': cfg['last']}
    path = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(path.read_text())
    site.setdefault('website', {}).setdefault('overview', {})['group_order'] = ['B', 'A']
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    assert not [x for x in S.website_problems(S.load_site(path)) if 'group_order' in x]
    assert _page_data(web.build(path, log=lambda *_: None))['overview_groups']['shared'] == ['B', 'A']


BROWSE = r"""
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(), out = { errs: [] };
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', (e) => out.errs.push(e.message));
  const go = async (h) => { await p.goto(process.argv[2] + '/index.html' + h); await p.waitForSelector('#tabs a.tab', { state: 'attached', timeout: 20000 }); await p.waitForTimeout(800); };
  await go('#overview');
  out.tabs = await p.$$eval('#tabs .tab:not(.rail-btn)', (t) => t.map((x) => [x.textContent.trim(), x.getAttribute('href') || 'off', x.title]));
  out.foot = await p.$$eval('#foot-links a, #foot-links button', (t) => t.map((x) => x.textContent.trim()));
  out.kf = await p.$$eval('.keyfind li', (t) => t.map((x) => x.textContent.trim()));
  out.badge = await p.$$eval('.ctl-badge', (t) => t.map((x) => x.getAttribute('href')));
  await go('#statistics?a=motif');
  out.stat = { hash: await p.evaluate(() => location.hash), open: await p.$$eval('details.mfold[open] h3', (t) => t.map((x) => x.textContent)), rows: await p.$$eval('#m-every tbody tr', (t) => t.length), dl: await p.$$eval('#m-every #dl', (t) => t.length) };
  await go('#method/cite');
  out.cite = { menu: await p.$$eval('.msub a', (t) => t.map((x) => x.textContent + (x.getAttribute('aria-current') ? '*' : ''))), shown: await p.$$eval('details.mfold:not([hidden]) h3', (t) => t.map((x) => x.textContent)) };
  await go('#method');
  out.tests = await p.$$eval('details.mfold:not([hidden]) h3', (t) => t.map((x) => x.textContent));
  await go('#method/privacy');
  out.privacy = await p.evaluate(() => document.querySelector('.msub [aria-current]').textContent);
  await go('#compare');
  out.compare = await p.evaluate(() => location.hash);
  await go('#help');
  out.help = await p.$$eval('#view h3', (t) => t.map((x) => x.textContent));
  if (out.badge.length) {
    await go('#overview');
    await p.click('.ctl-badge');
    await p.waitForTimeout(800);
    out.badgeTo = { hash: await p.evaluate(() => location.hash), part: await p.evaluate(() => document.querySelector('.msub [aria-current]').textContent), open: await p.$$eval('#m-controls[open]', (t) => t.length) };
  }
  console.log(JSON.stringify(out));
  await b.close();
})();
"""


def _serve_and_browse(tmp_path, index):
    node_root = _playwright()
    if not node_root:
        pytest.skip('needs Node and Playwright')
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(index.parent))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        script = tmp_path / 'browse.js'
        script.write_text(BROWSE)
        run = subprocess.run(
            ['node', str(script), f'http://127.0.0.1:{httpd.server_address[1]}'],
            capture_output=True,
            text=True,
            timeout=180,
            env={**__import__('os').environ, 'NODE_PATH': node_root},
        )
    finally:
        httpd.shutdown()
    assert run.returncode == 0, run.stderr[-1500:]
    return json.loads(run.stdout.strip().splitlines()[-1])


def test_a_toy_site_in_a_browser(tmp_path):
    root = _toy_site(tmp_path)
    data = root / 'data'
    # one protein with 100 RGG and 100 RA arginines: 60 RGG and 20 RA marks make RGG more often; the control keeps only
    # the RA marks, so RGG is then less often (reversed): the result fails its control
    seq = 'M' + 'RGGA' * 100 + 'RAAA' * 100
    (data / 'toy.fasta').write_text(f'>sp|P1|ONE_TOY One protein OS=Toy OX=1 GN=ONE PE=1 SV=1\n{seq}\n')
    rgg = [2 + 4 * i for i in range(60)]
    ra = [402 + 4 * i for i in range(20)]
    pd.DataFrame({'acc': ['P1'] * 80, 'pos': rgg + ra, 'kind': ['g'] * 60 + ['a'] * 20}).to_csv(
        data / 'marks.tsv', sep='\t', index=False
    )
    man = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    for k in ('toy_fasta', 'toy_marks'):
        man['inputs'][k]['md5'] = md5_file(data / man['inputs'][k]['file'])
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(man, indent=1))
    site = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    site['analyses'] = [{'id': 'motif', 'layer': 'motif', 'title': 'Sequence motifs'}]
    site['controls'] = [
        {
            'id': 'ra',
            'label': 'RA sites only',
            'when': 'only the RA sites are compared',
            'analyses': ['motif'],
            'min_marks': 1,
            'marks_where': {'column': 'kind', 'equals': 'a'},
            'marks_outside': 'left_out',
        }
    ]
    site['website'] = {
        'name': 'Toy Explorer',
        'tabs': {'network': {'empty': 'No network for the toy yet'}},
        'overview': {'sections': [{'name': 'Where', 'cards': [{'analysis': 'motif', 'title': 'Sequence motifs'}]}]},
    }
    path = root / 'sites' / 'toy.yaml'
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    assert S.website_problems(S.load_site(path)) == []
    S.run(path, root=data, log=lambda *_: None)
    out = _serve_and_browse(tmp_path, web.build(path, log=lambda *_: None))
    assert out['errs'] == []
    names = [t[0].split(' ')[0] for t in out['tabs']]
    assert [n for n in names] == [
        'Overview',
        'Proteins',
        'Sites',
        'Interactions',
        'Network',
        'Methods',
        'Help',
    ]
    off = {t[0]: t[2] for t in out['tabs'] if t[1] == 'off'}
    assert off['Network'] == 'No network for the toy yet'
    assert off['Interactions'] == 'No interaction data for this modification yet'
    assert [t[1] for t in out['tabs'] if t[0] in ('Methods', 'Help', 'Overview')] == ['#overview', '#method', '#help']
    # the one footer
    assert out['foot'] == ['Cite', 'Methods', 'Keyboard shortcuts', 'Source code ↗', 'Privacy']
    # the result fails its control, so it is not a key finding; its badge links to Methods > Controls
    assert out['kf'] == [] and out['badge'] and all(h.startswith('#method/controls') for h in out['badge'])
    assert out['badgeTo']['hash'].startswith('#method/controls') and out['badgeTo']['part'] == 'Controls'
    assert out['badgeTo']['open'] == 1
    # the old address of the table of tests: a section of Methods, filtered by the question
    assert out['stat']['hash'].startswith('#method/every') and 'a=motif' in out['stat']['hash']
    assert 'All tests' in out['stat']['open'] and out['stat']['rows'] > 0 and out['stat']['dl'] == 1
    assert out['cite']['menu'] == ['Tests', 'Controls', 'Sources', 'Cite*', 'Download']
    assert 'Licenses and privacy' in out['cite']['shown'] and 'All tests' not in out['cite']['shown']
    assert 'How the tests work' in out['tests'] and 'All tests' in out['tests']
    assert out['privacy'] == 'Cite'
    assert out['compare'] == '#overview'  # the toy has no sets to compare: the address falls back to the Overview
    assert out['help'] == ['Searching', 'Filters', 'Reading a figure', 'Badges and terms']


def test_a_card_has_one_download_and_the_protein_page_cell_card_has_one_row_of_controls():
    cell = (ASSETS / 'kit-cell.js').read_text()
    # the protein page's card: one Download for the card (what it holds is chosen inside it), not one per drawing
    assert "block(k, `The ${d.drawing}`, 'cell-fig cell-onep', false)" in cell
    assert 'data-cell-inc="${k}"' in cell and 'aria-label="Include"' in cell
    # its controls: the map (all or one) and the dataset's shading with the protein's compartments outlined
    assert 'data-cellone="${esc(k)}"' in cell and 'data-cellone-ds' in cell and "parts(false, 'fold')" in cell
    assert '.cg-c.mine{' in cell and "ONEUI.map === 'all'" in cell
    # no row of format buttons anywhere: every caller goes through the one menu
    assert 'data-cell-exp="${k}" data-cell-fig="${fig}"' in cell  # the Both entries sit inside the menu's list
