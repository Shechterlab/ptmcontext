"""The kit names no organism, motif or protein of a site: the words come from the site file (website.placeholders,
website.default_background, website.protein.conservation.reference), so another site's page never shows them."""
from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
LITERALS = ['GXRG', 'RGG,GAR', 'GENE R216', 'other reviewed human proteins', 'human_residue', 'Locations, condensates and diseases',
            'anchored on the human sequence', 'the same residue as the human one']


def _kit():
    return '\n'.join(p.read_text() for p in sorted(ASSETS.glob('*.js')))


def test_no_site_wording_in_the_kit():
    text = _kit()
    for lit in LITERALS:
        assert lit not in text, lit
    assert not re.search(r"\b(line|row)\('Human'", text)


def test_the_site_files_carry_their_own_words():
    for name, ref in (('methylarginine', 'Human'), ('yeast_phospho', 'S. cerevisiae')):
        web = yaml.safe_load((ROOT / 'sites' / f'{name}.yaml').read_text())['website']
        assert web['protein']['conservation']['reference'] == ref
        assert web['placeholders']['motif'] and web['placeholders']['motif_either']


def test_the_yeast_build_has_none_of_it():
    page = ROOT / 'out' / 'yeast_phospho' / 'web' / 'index.html'
    if not page.exists():
        return
    html = page.read_text()
    data = json.loads(re.search(r'id="site-data"[^>]*>(.*?)</script>', html, re.S).group(1))
    assert data['site']['placeholders']['motif'] and 'GXRG' not in data['site']['placeholders']['motif']
    assert data['protein_view']['conservation']['reference'] == 'S. cerevisiae'
    for lit in ('GXRG', 'GENE R216', 'other reviewed human proteins'):
        assert lit not in html, lit
