"""website.features: the 3D viewer, the highlight and the table figures are on unless the site file switches them off
(CONTRACTS.md, Website pages). Each module is run on a stand-in page with the switch off and on, and the schema takes the block."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import jsonschema
import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
SCHEMA = json.loads((ROOT / 'ptmcontext' / 'schemas' / 'site.schema.json').read_text())
HARNESS = r"""
const fs = require('fs'), vm = require('vm');
const [file, feat] = process.argv.slice(2);
const deep = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : deep()), apply: () => deep(), construct: () => deep(), set: () => true });
const doc = deep();
const win = { PTMC_MODULES: [], addEventListener() {}, matchMedia: () => ({ matches: false }), document: doc };
const K = { D: { proteins: [[]], site: { features: JSON.parse(feat) }, residues: ['R'], analyses: [], structure: {}, words: {} }, W: new Proxy({}, { get: () => 'x' }), esc: String, int: Number, S: {}, cap: String,
  clicks: [], afterRender: [], tips: [], PAL: {}, sel: null, expBar: () => '', tw: () => 0, map: {} };
const ctx = vm.createContext({ window: win, document: doc, console, localStorage: { getItem: () => null, setItem() {} }, matchMedia: win.matchMedia, MutationObserver: class { observe() {} }, getComputedStyle: () => ({}), addEventListener() {}, requestAnimationFrame() {}, setTimeout, clearTimeout, URL, Set, Map });
vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
const KP = new Proxy(K, { get: (t, k) => (k in t ? t[k] : deep()) });
try { win.PTMC_MODULES.forEach(f => f(KP)); } catch (e) { console.log(JSON.stringify({ error: String(e) })); process.exit(0); }
console.log(JSON.stringify({ s3d: !!K.s3d, show3d: typeof K.show3d, hl: !!K.hl, hlAny: K.hl ? K.hl.any() : null, afterRender: K.afterRender.length, clicks: K.clicks.length, tableFigure: typeof K.tableFigure, tableBars: typeof K.tableBars }));
"""
OFF = {'structure_3d': False, 'highlight': False, 'table_figures': False}


def _run(module, features, tmp_path):
    script = tmp_path / 'run.js'
    script.write_text(HARNESS)
    out = subprocess.run(['node', str(script), str(ASSETS / module), json.dumps(features)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


needs_node = pytest.mark.skipif(not shutil.which('node'), reason='node is not installed')


def test_the_schema_takes_the_block_and_the_bundled_sites_leave_everything_on():
    props = SCHEMA['properties']['website']['properties']['features']['properties']
    assert set(props) == {'structure_3d', 'highlight', 'table_figures'}
    for name in ('methylarginine', 'yeast_phospho'):
        site = yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())
        assert 'features' not in site['website']
        site['website']['features'] = OFF
        jsonschema.validate(site, SCHEMA)
        site['website']['features'] = {'highlight': 'no'}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(site, SCHEMA)
        site['website']['features'] = {'nonsense': True}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(site, SCHEMA)


def test_the_features_reach_the_page_data():
    assert "'features': web.get('features') or {}" in (ROOT / 'ptmcontext' / 'web' / '__init__.py').read_text()


@needs_node
def test_the_3d_viewer_can_be_switched_off(tmp_path):
    on, off = _run('kit-3d.js', {}, tmp_path), _run('kit-3d.js', OFF, tmp_path)
    assert on['s3d'] and on['show3d'] == 'function'
    assert not off['s3d'] and off['show3d'] == 'undefined'


@needs_node
def test_the_highlight_can_be_switched_off(tmp_path):
    on, off = _run('kit-hilite.js', {}, tmp_path), _run('kit-hilite.js', OFF, tmp_path)
    assert on['afterRender'] > 0 and on['clicks'] > 0
    assert off['afterRender'] == 0 and off['clicks'] == 0 and off['hl'] and off['hlAny'] is False


@needs_node
def test_the_table_figures_can_be_switched_off(tmp_path):
    on, off = _run('kit-tabfig.js', {}, tmp_path), _run('kit-tabfig.js', OFF, tmp_path)
    assert on['afterRender'] == 1
    assert off['afterRender'] == 0          # no bars are added after a render
    assert off['tableFigure'] == 'function'   # the TSV downloads still use the module
