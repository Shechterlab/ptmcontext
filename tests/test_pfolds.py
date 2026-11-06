"""The cards front end's protein page (kit-pfolds.js, kit-pix.js and the site card's merged rows): the site file's blocks are
checked by website_problems, the schema takes them, the bundled sites pass, and the modules know no mark, source or organism."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import jsonschema
import pytest
import yaml

from ptmcontext import site as site_mod
from ptmcontext.web import MODULES

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'


def _site(**protein):
    return {'analyses': [{'id': 'a1'}, {'id': 'a2'}], 'website': {'protein': protein}}


def test_the_card_blocks_name_known_analyses():
    good = {'card': {'hide_questions': ['a1'], 'primary_questions': ['a2'], 'merge': [{'label': 'Both', 'analyses': ['a1', 'a2'], 'parts': ['x', 'y']}]}}
    assert not [x for x in site_mod.website_problems(_site(**good)) if 'card.' in x]
    bad = {'card': {'hide_questions': ['zz'], 'merge': [{'label': 'M', 'analyses': ['a1', 'nope'], 'parts': ['x']}, {'analyses': ['a1']}]},
           'cards': {'location': {'rna_maps': ['gone']}}, 'context': {'p-cond': ['missing']}}
    out = ' | '.join(site_mod.website_problems(_site(**bad)))
    for part in ("hide_questions: no analysis 'zz'", "merge[0]: no analysis 'nope'", 'parts and analyses differ', 'merge[1]: needs a label', "rna_maps: no analysis 'gone'", "context.p-cond: no analysis 'missing'"):
        assert part in out


def test_the_schema_takes_headings_context_and_the_bundled_sites_pass():
    schema = json.loads((ROOT / 'ptmcontext' / 'schemas' / 'site.schema.json').read_text())
    for name in ('methylarginine', 'yeast_phospho'):
        jsonschema.validate(yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text()), schema)
    ma = yaml.safe_load((ROOT / 'sites' / 'methylarginine.yaml').read_text())
    ma['website']['protein']['headings'][0]['id'] = 'bad id'
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(ma, schema)
    assert not site_mod.website_problems(yaml.safe_load((ROOT / 'sites' / 'methylarginine.yaml').read_text()))


def test_the_modules_are_listed_and_name_nothing_of_a_site():
    assert 'kit-pfolds.js' in MODULES and 'kit-pix.js' in MODULES and MODULES.index('kit-pix.js') < MODULES.index('kit.js')
    for name in ('kit-pfolds.js', 'kit-pix.js'):
        text = (ASSETS / name).read_text()
        assert not re.search(r'methyl|arginine|yeast|phospho|FUS\b|human', text, re.I), name
        if shutil.which('node'):
            assert subprocess.run(['node', '--check', str(ASSETS / name)], capture_output=True).returncode == 0


def test_the_classic_protein_page_uses_the_same_modules():
    """The fold pictures, the site-first interactions and the folded 3D options are not gated on the cards front end; the classic
    groups take a context switch, and the site card's variants box is on both layouts."""
    for name in ('kit-pfolds.js', 'kit-pix.js'):
        assert "mode !== 'cards'" not in (ASSETS / name).read_text()
    assert 'K.pix) {' in (ASSETS / 'kit-pnet.js').read_text()
    assert 'const varBlock = `' in (ASSETS / 'kit-proteins.js').read_text()
    ma = yaml.safe_load((ROOT / 'sites' / 'methylarginine.yaml').read_text())
    groups = ma['website']['protein']['groups']
    assert any(g.get('switch') for g in groups) and any('p-cell' in g['folds'] for g in groups)
    schema = json.loads((ROOT / 'ptmcontext' / 'schemas' / 'site.schema.json').read_text())
    jsonschema.Draft202012Validator.check_schema(schema)
