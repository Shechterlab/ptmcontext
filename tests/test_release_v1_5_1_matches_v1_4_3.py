"""One-time check: the v1.5.1 methylarginine files the parity test reads are byte for byte the v1.4.3 files, as the
v1.5.1 release states (release.json, carried_over: from_md5 equals md5), so parity against v1.5.1 is parity against
v1.4.3. Skipped when the root holds no v1.4.3 files."""

import hashlib
import json
import re

import pytest

from conftest import REPO

MA6 = {
    'site_interactions',
    'site_interaction_records',
    'nucleic_acid_contacts',
    'nucleic_acid_near_sites',
    'nucleic_acid_proximal_sites',
    'residue_evidence',
}


def _md5(path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def _v143(rel: str) -> str:
    """The v1.4.3 path of a v1.5.1 file: the name's version, and no methylarginine_ prefix on the six interaction tables."""
    m = re.fullmatch(r'supporting/methylarginine_(.+)_v1\.5\.1\.tsv', rel)
    if m and m.group(1) in MA6:
        rel = f'supporting/{m.group(1)}_v1.5.1.tsv'
    return 'releases/v1.4.3/' + rel.replace('_v1.5.1.', '_v1.4.3.')


def test_methylarginine_files_of_v1_5_1_are_those_of_v1_4_3(reference_root):
    rel_dir = reference_root / 'releases' / 'v1.5.1'
    if not (reference_root / 'releases' / 'v1.4.3' / 'human_methylarginine_sites_v1.4.3.tsv').exists():
        pytest.skip('the v1.4.3 files are not in the checkout (add releases/v1.4.3 to its sparse list)')
    if not (rel_dir / 'release.json').exists():
        pytest.skip(
            'the v1.5.1 files are not in the checkout (the sites read v1.6.0; add releases/v1.5.1 to its sparse list)'
        )
    carried = json.loads((rel_dir / 'release.json').read_text())['carried_over']
    inputs = json.loads((REPO / 'inputs.json').read_text())['inputs']
    compared = 0
    for entry in inputs.values():
        # the manifest reads v1.6.0 now: the same tables, named for v1.5.1
        f = entry['file'].replace('releases/v1.6.0/', 'releases/v1.5.1/').replace('_v1.6.0.', '_v1.5.1.')
        if not f.startswith('releases/v1.5.1/'):
            continue
        rel = f[len('releases/v1.5.1/') :]
        if rel not in carried or 'methylarginine' not in rel and not rel.startswith('analyses'):
            continue
        info = carried[rel]
        assert info['from_md5'] == info['md5'], f'{rel}: the release says its content changed'
        old = reference_root / _v143(rel)
        if rel.startswith('analyses'):
            old = reference_root / 'releases' / 'v1.4.3' / rel
        if not old.exists():
            continue
        assert _md5(old) == _md5(reference_root / f), f'{rel} differs from {old.name}'
        compared += 1
    assert compared >= 10, compared
