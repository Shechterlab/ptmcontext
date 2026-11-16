"""website.export: one Download menu for every figure and page (kit-export.js, CONTRACTS.md, "The Download menu"). The
formats, their words and the sizes come from the site file over the kit's defaults; the schema takes the block, and the
checks name a size used twice or a default that is not one of them. The module runs on a stand-in page under Node."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import jsonschema
import pytest
import yaml

from ptmcontext import site as S

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
SCHEMA = json.loads((ROOT / 'ptmcontext' / 'schemas' / 'site.schema.json').read_text())
HARNESS = r"""
const fs = require('fs');
global.window = global; const noop = () => {};
global.document = { addEventListener: noop, querySelectorAll: () => [], getElementById: () => null };
global.localStorage = { getItem: () => null, setItem: noop };
const cfg = JSON.parse(process.argv[3]);
const K = { D: { export: cfg, site: { id: 'toy', name: 'Toy' } }, esc: s => String(s), clicks: [], afterRender: [], EXP_HELP: { pdf: 'p', svg: 's', png: 'n', tsv: 't' } };
eval(fs.readFileSync(process.argv[2], 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const f = { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="860" height="500" viewBox="0 0 860 500"></svg>', W: 860, H: 500 };
const kinds = ['pdf', 'svg', 'png', 'tsv'];
const html = K.exp.menu(kinds, 'zexp', 'the toy');
const before = K.exp.preset().id;
K.exp.setPreset('paper');
const g = K.exp.apply({ ...f });
console.log(JSON.stringify({
  presets: K.exp.presets().map(p => p.id), before, after: K.exp.preset().id, formats: K.exp.formats(kinds),
  items: [...html.matchAll(/data-zexp="(\w+)"[^>]*>([^<]*)</g)].map(m => [m[1], m[2]]),
  presetButtons: [...html.matchAll(/data-xm-preset="([\w-]+)"/g)].map(m => m[1]),
  mm: g.mm, dpi: g.dpi, svg: g.svg.match(/^<svg[^>]*>/)[0], px: K.exp.px(g).match(/^<svg[^>]*>/)[0], width: K.exp.width(960),
  csv: K.exp.csv('# note\na\tb\n1\tx,y\n2\tsay "hi"'),
  tsvOnly: K.exp.menu(['tsv'], 'zexp', 'rows'),
}));
"""


def _run(tmp_path, cfg):
    script = tmp_path / 'run.js'
    script.write_text(HARNESS)
    out = subprocess.run(
        ['node', str(script), str(ASSETS / 'kit-export.js'), json.dumps(cfg)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_defaults_are_two_sizes_and_the_four_formats(tmp_path):
    r = _run(tmp_path, {})
    assert r['presets'] == ['screen', 'paper'] and r['before'] == 'screen' and r['after'] == 'paper'
    assert r['formats'] == ['pdf', 'svg', 'png', 'tsv']
    assert [k for k, _ in r['items']] == ['pdf', 'svg', 'png', 'tsv']
    assert r['presetButtons'] == ['screen', 'paper']
    # a figure at paper is 180 mm wide, its height following; the PDF draws the same SVG in pixels
    assert r['mm'] == 180 and r['dpi'] == 300 and r['width'] == 680
    assert 'width="180mm" height="104.7mm"' in r['svg'] and 'width="860" height="500"' in r['px']
    assert r['csv'] == '# note\na,b\n1,"x,y"\n2,"say ""hi"""'
    assert 'xm-toggle' not in r['tsvOnly'] and 'data-zexp="tsv"' in r['tsvOnly']  # rows only: a button, not a menu


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_site_file_chooses_formats_words_and_sizes(tmp_path):
    cfg = {
        'formats': ['svg', 'pdf', 'csv'],
        'labels': {'pdf': 'Vector PDF'},
        'presets': [
            {'id': 'web', 'label': 'Web', 'width': 1200},
            {'id': 'column', 'label': 'One column (89 mm)', 'mm': 89, 'width': 340, 'dpi': 600},
        ],
        'default_preset': 'column',
    }
    r = _run(tmp_path, cfg)
    assert r['formats'] == ['svg', 'pdf', 'csv']  # the site's order; csv is the rows of the figure's TSV
    assert r['items'] == [['svg', 'SVG'], ['pdf', 'Vector PDF'], ['csv', 'Data (CSV)']]
    assert r['before'] == 'column' and r['presetButtons'] == ['web', 'column']
    assert r['presets'] == ['web', 'column']


def test_the_schema_takes_the_block_and_the_bundled_sites_need_none():
    ok = {
        'formats': ['pdf', 'png'],
        'presets': [{'id': 'screen', 'label': 'Screen'}, {'id': 'paper', 'label': 'Paper', 'mm': 180, 'dpi': 300}],
        'default_preset': 'paper',
        'page_pdf': False,
        'pages': ['overview'],
    }
    export = SCHEMA['properties']['website']['properties']['export']
    jsonschema.validate(ok, export)
    for bad in ({'formats': ['doc']}, {'presets': [{'id': 'A b', 'label': 'x'}]}, {'presets': [{'id': 'a'}]}, {'x': 1}):
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(bad, export)


def test_the_checks_name_a_size_used_twice_and_a_default_that_is_not_one():
    def probs(cfg):
        return S.export_problems({'website': {'export': cfg}})

    assert S.export_problems({'website': {}}) == []
    assert probs({'presets': [{'id': 'a', 'label': 'A'}, {'id': 'b', 'label': 'B', 'mm': 90}]}) == []
    assert any('used twice' in x for x in probs({'presets': [{'id': 'a', 'label': 'A'}, {'id': 'a', 'label': 'B'}]}))
    assert any(
        'not one of the presets' in x for x in probs({'presets': [{'id': 'a', 'label': 'A'}], 'default_preset': 'z'})
    )
    assert any('needs mm' in x for x in probs({'presets': [{'id': 'a', 'label': 'A', 'dpi': 300}]}))


def test_the_menu_is_the_only_place_that_lists_a_download_button():
    # every figure's buttons come from K.expBar (the menu); a module does not draw its own row of PDF/SVG/PNG buttons
    for js in sorted(ASSETS.glob('kit*.js')):
        if js.name in (
            'kit-export.js',
            'kit-3d.js',
            'kit-cell.js',
        ):  # the 3D viewer's toolbar; the cell's per-drawing items
            continue
        assert 'toUpperCase()}</button>`' not in js.read_text() or 'data-s3d' in js.read_text(), js.name


def test_the_yaml_of_a_bundled_site_loads_with_the_block_added():
    site = yaml.safe_load((ROOT / 'sites' / 'methylarginine.yaml').read_text())
    site['website']['export'] = {'default_preset': 'paper', 'presets': [{'id': 'paper', 'label': 'Paper', 'mm': 180}]}
    assert S.export_problems(site) == []


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_print_size_is_listed_after_the_screen_size(tmp_path):
    cfg = {'presets': [{'id': 'paper', 'label': 'Paper', 'mm': 180}, {'id': 'screen', 'label': 'Screen'}]}
    assert _run(tmp_path, cfg)['presetButtons'] == ['screen', 'paper']


def test_pdf_text_is_set_in_the_sites_own_fonts():
    kit = (ASSETS / 'kit.js').read_text()
    # the PDF embeds the site's body and monospace faces, shipped as files (OFL), not Arimo or the standard fonts
    for name in ('Inter-Regular', 'Inter-Bold', 'IBMPlexMono-Regular', 'IBMPlexMono-Bold'):
        assert (ASSETS / 'fonts' / 'pdf' / f'{name}.ttf').is_file() and name in kit
    assert 'Arimo' not in kit and 'DejaVuSans.ttf' not in kit
    # the file name no longer carries the print width
    assert 'f.mm}mm' not in kit
