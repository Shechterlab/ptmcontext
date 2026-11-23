"""A site that declares data release X reads and links release X only: every input path of its manifest and every
download link points into releases/X (and, in a URL, at tag X). A reference to another release must be listed in
HISTORICAL, with the reason."""

import json
import re
import tomllib

import pytest
import yaml

import ptmcontext
from conftest import REPO
from ptmcontext.changelog import releases

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


# ---- the app version: one number everywhere (VERSIONING.md) ----

SITE_CFF = sorted((REPO / 'sites').glob('*.citation.cff'))


def _app_version():
    return tomllib.loads((REPO / 'pyproject.toml').read_text())['project']['version']


def test_the_app_version_is_the_same_in_every_file():
    v = _app_version()
    assert re.fullmatch(r'\d+\.\d+\.\d+', v), f'pyproject.toml version {v} is not MAJOR.MINOR.PATCH'
    assert ptmcontext.__version__ == v
    assert yaml.safe_load((REPO / 'CITATION.cff').read_text())['version'] == v
    assert SITE_CFF, 'no site citation files found'
    wrong = {p.name: yaml.safe_load(p.read_text())['version'] for p in SITE_CFF}
    assert all(x == v for x in wrong.values()), f'site citation versions differ from {v}: {wrong}'


def test_citation_dates_match_the_changelog_date_of_the_version():
    v = _app_version()
    dates = {r['version']: r['date'] for r in releases()}
    assert v in dates, f'CHANGELOG.md has no heading "## {v} (YYYY-MM-DD)"'
    for p in [REPO / 'CITATION.cff', *SITE_CFF]:
        assert str(yaml.safe_load(p.read_text())['date-released']) == dates[v], (
            f'{p.name}: date-released differs from the changelog'
        )


def test_the_changelog_lists_each_release_with_a_short_summary():
    rel = releases()
    assert rel and rel[0]['version'] == _app_version(), 'the newest dated heading must be the current version'
    for r in rel:
        assert 3 <= len(r['lines']) <= 5, f'{r["version"]}: the summary (lines starting "> ") needs 3 to 5 lines'
        assert all(len(x) <= 120 for x in r['lines']), f'{r["version"]}: summary lines must be short'
    text = (REPO / 'CHANGELOG.md').read_text()
    assert re.search(r'^## Unreleased\s*$', text, re.M), 'CHANGELOG.md keeps a "## Unreleased" heading'
    versions = [tuple(map(int, r['version'].split('.'))) for r in rel]
    assert versions == sorted(versions, reverse=True), 'releases are listed newest first'


def test_readme_and_versioning_name_no_other_version():
    v = _app_version()
    pin = json.loads((REPO / 'data_pin.json').read_text())['release']
    for name in ('README.md', 'VERSIONING.md'):
        text = (REPO / name).read_text()
        apps = set(re.findall(r'App: PTMcontext (\d+\.\d+\.\d+)', text))
        data = set(re.findall(r'Data: PTM_Pipeline (v\d+\.\d+\.\d+)', text))
        assert apps <= {v}, f'{name} names app versions {apps}, the app is {v}'
        assert data <= {pin}, f'{name} names data releases {data}, data_pin.json pins {pin}'
    assert 'VERSIONING.md' in (REPO / 'README.md').read_text()
    assert 'VERSIONING.md' in (REPO / 'CONTRACTS.md').read_text()


def test_zenodo_metadata_agrees_with_the_citation_file():
    z = json.loads((REPO / '.zenodo.json').read_text())
    c = yaml.safe_load((REPO / 'CITATION.cff').read_text())
    assert z['title'] == 'PTMcontext' and z['license'] == c['license'] == 'MIT'
    assert [a['name'] for a in z['creators']] == [a['name'] for a in c['authors']]
    assert any(r['identifier'] == '10.5281/zenodo.22696798' for r in z['related_identifiers'])
