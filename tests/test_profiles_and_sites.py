from pathlib import Path

import jsonschema
import pandas as pd
import pytest
import yaml

from ptmcontext import inputs as I
from ptmcontext import layers as L
from ptmcontext.profile import load_profile, validate
from ptmcontext.site import load_site

REPO = Path(__file__).resolve().parents[1]
PROFILES = sorted(p.stem for p in (REPO / 'ptmcontext' / 'profiles').glob('*.yaml'))
SITES = sorted((REPO / 'sites').glob('*.yaml'))


@pytest.mark.parametrize('name', PROFILES)
def test_packaged_profiles_meet_the_contract(name):
    p = load_profile(name)
    assert p.residues and p.background('marked_proteins').startswith('other ')


@pytest.mark.parametrize('path', SITES, ids=lambda p: p.stem)
def test_site_configs_name_known_inputs_layers_and_profiles(path):
    site = load_site(path)
    load_profile(site['mark'])
    manifest = I.load(REPO / site['manifest']) if site.get('manifest') else I.load()
    for name in [site['snapshot']['input'], site['marks']['input'], *site.get('inputs', {}).values()]:
        assert name in manifest, name
    for a in site['analyses']:
        if a.get('test') == 'protein_sets':
            assert a['sets']['input'] in site['inputs'] and (not a.get('names') or a['names']['input'] in site['inputs'])
        else:
            assert a['layer'] in L.BUILT_IN, a['layer']


def test_yaml_number_trap_is_caught():
    # unquoted, YAML 1.1 reads 2026_03 as the integer 202603: the schema refuses it
    site = yaml.safe_load((REPO / 'sites' / 'methylarginine.yaml').read_text())
    site['snapshot']['release'] = yaml.safe_load('release: 2026_03')['release']
    assert site['snapshot']['release'] == 202603
    with pytest.raises(jsonschema.ValidationError):
        validate(site, 'site')


def test_manifest_meets_the_contract():
    assert 'uniprot_fasta' in I.load()


# motif rules, on windows built by hand (centre = the residue, flank 7)
def w(left: str, right: str) -> str:
    return left.rjust(7, '_') + 'R' + right.ljust(7, '_')


@pytest.mark.parametrize('window,family,expected', [
    (w('AAAAAAA', 'GGAAAAA'), 'RGG', True),
    (w('AAAAAAA', 'GAAAAAA'), 'RGG', False),
    (w('AAAAAAG', 'GAAAAAA'), 'GRG', True),
    (w('AAAAAGA', 'AAAAAAA'), 'GAR', True),
    (w('AAAAARA', 'AAAAAAA'), 'RXR', True),
    (w('AAAAAAA', 'ARAAAAA'), 'RXR', True),
    (w('AAAAAAA', 'AAAAAAA'), 'RXR', False),
    (w('APAAAAA', 'AAAAAAA'), 'CARM1_proline_rich', False),   # P at -6: outside -5..+5
    (w('AAPAAAA', 'AAAAAAA'), 'CARM1_proline_rich', True),    # P at -5
    (w('AAPAAAA', 'AAAAAAA'), 'CARM1_hydrophobic_proline', True),
    (w('GGPGGGG', 'GGGGGGG'), 'CARM1_hydrophobic_proline', False),
    (w('', 'GG'), 'RGG', True),                               # at a protein end the window is padded
])
def test_methylarginine_motif_rules(window, family, expected):
    p = load_profile('methylarginine')
    assert bool(p.motif_flags(pd.Series([window]))[family].iloc[0]) is expected
