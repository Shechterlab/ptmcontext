"""The Overview's section names are short noun phrases; the former names still open the same place."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = {
    'Where in the cell': 'Localization',
    'Which proteins': 'Classes and pathways',
    'Where in the protein': 'Position in the protein',
}


def slug(name):
    return re.sub(r'\W+', '-', name).strip('-').lower()


def test_site_files_use_the_new_section_names():
    for site in ('methylarginine', 'methyllysine', 'lysine', 'phospho'):
        text = (ROOT / 'sites' / f'{site}.yaml').read_text()
        for old in OLD:
            assert not re.search(rf'^\s+(- )?name: {old}\s*$', text, re.MULTILINE), (site, old)
            assert not re.search(rf'^\s+(from_)?section: {old}\b', text, re.MULTILINE), (site, old)
        assert re.search(r'^\s+- name: Localization\s*$', text, re.MULTILINE), site
        assert re.search(r'^\s+from_section: Localization\b', text, re.MULTILINE), site


def test_shared_order_uses_the_new_names():
    shared = json.loads((ROOT / 'ptmcontext/config/overview_groups.json').read_text())['shared']
    assert shared[:3] == list(OLD.values())


def test_old_section_links_are_mapped():
    js = (ROOT / 'ptmcontext/web/assets/kit.js').read_text()
    for old, new in OLD.items():
        assert f"'{slug(old)}': '{slug(new)}'" in js
