"""A site that declares data release X reads and links release X only: every input path of its manifest and every
download link points into releases/X (and, in a URL, at tag X). A reference to another release must be listed in
HISTORICAL, with the reason."""

import json
import re

import pytest
import yaml

from conftest import REPO

# Deliberately older releases: (site, path or URL tail) -> why.
HISTORICAL: dict = {}

SITES = sorted(p for p in (REPO / 'sites').glob('*.yaml') if p.name != 'landing.yml')
RELEASE_PATH = re.compile(r'releases/(v\d+\.\d+\.\d+)/')
TAG_URL = re.compile(r'PTM_Pipeline/(?:tree/|blob/)?(v\d+\.\d+\.\d+)/')


def _declared(site):
    return ((site.get('website') or {}).get('dataset') or {}).get('version')


def _allowed(name, text):
    return any(n == name and tail in text for (n, tail) in HISTORICAL)


@pytest.mark.parametrize('path', SITES, ids=lambda p: p.stem)
def test_inputs_and_downloads_follow_the_declared_release(path):
    site = yaml.safe_load(path.read_text())
    version = _declared(site)
    if not version:
        pytest.skip('the site declares no data release')
    manifest = REPO / site.get('manifest', 'inputs.json')
    texts = [e['file'] for e in json.loads(manifest.read_text())['inputs'].values()]
    texts += [e.get('source', '') for e in json.loads(manifest.read_text())['inputs'].values()]
    texts += [d['url'] for d in (site['website'].get('downloads') or [])]
    texts.append(site['website']['dataset'].get('url', ''))
    wrong = []
    for text in texts:
        if _allowed(path.stem, text):
            continue
        found = set(RELEASE_PATH.findall(text)) | set(TAG_URL.findall(text))
        if found - {version}:
            wrong.append(text)
    assert not wrong, f'{path.name} declares {version} but reads or links: {wrong[:5]}'


def test_the_citation_file_names_the_declared_release():
    for path in SITES:
        site = yaml.safe_load(path.read_text())
        version = _declared(site)
        cff = path.with_suffix('.citation.cff')
        if version and cff.exists():
            found = set(re.findall(r'v\d+\.\d+\.\d+', yaml.safe_load(cff.read_text()).get('title', '')))
            # the methylarginine title also names v1.4.3, the release whose data its data equal
            assert not found or version in found, f'{cff.name}: title names {found}, the site declares {version}'


DATED = re.compile(r'(?:release|Release) (v\d+\.\d+\.\d+)(?: of [\w]+)? \((?:commit \w+, )?(\d{4}-\d{2}-\d{2})\)')


@pytest.mark.parametrize('path', SITES, ids=lambda p: p.stem)
def test_a_dated_mention_of_the_declared_release_carries_its_date(path):
    """The release's date is declared once (website.dataset.date); a manifest line that dates the same release says it."""
    site = yaml.safe_load(path.read_text())
    ds = (site.get('website') or {}).get('dataset') or {}
    if not ds.get('version'):
        pytest.skip('the site declares no data release')
    manifest = json.loads((REPO / site.get('manifest', 'inputs.json')).read_text())['inputs']
    wrong = []
    for name, e in manifest.items():
        for version, date in DATED.findall(e.get('version', '')):
            if version == ds['version'] and date != ds['date']:
                wrong.append((name, date))
    assert not wrong, f'{path.name}: dataset.date is {ds["date"]}, the manifest says {wrong[:3]}'
