from pathlib import Path

import jsonschema
import pandas as pd
import pytest
import yaml

from ptmcontext import inputs as I
from ptmcontext.set_tests import roles_of
from ptmcontext import layers as L
from ptmcontext.profile import load_profile, site_profile, validate
from ptmcontext.site import load_site

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'

REPO = Path(__file__).resolve().parents[1]
PROFILES = sorted(p.stem for p in (REPO / 'sites' / 'marks').glob('*.yaml'))
SITES = sorted((REPO / 'sites').glob('*.yaml'))


@pytest.mark.parametrize('name', PROFILES)
def test_mark_files_meet_the_contract(name):
    p = load_profile(MARKS / f'{name}.yaml')
    assert p.residues and p.background('marked_proteins').startswith('other ')


@pytest.mark.parametrize('path', SITES, ids=lambda p: p.stem)
def test_site_configs_name_known_inputs_layers_and_profiles(path):
    site = load_site(path)
    site_profile(site)
    manifest = I.load(REPO / site['manifest']) if site.get('manifest') else I.load()
    for name in I.site_input_names(site):
        assert name in manifest, name
    for a in site['analyses']:
        if a.get('test') == 'protein_sets':
            assert all(r in site['inputs'] for r in roles_of(a)), roles_of(a)
        elif a.get('tests'):  # a question of several tests: every role its tests read is filled
            from ptmcontext.question import roles_of as test_roles

            assert all(r in site['inputs'] for r in test_roles(a)), test_roles(a)
        elif a.get('test') == 'conditional_logit':  # several factors: each reads a layer whose roles are filled
            from ptmcontext.model import covariate_problems, covariate_roles

            assert covariate_problems(a) == [] and all(r in site['inputs'] for r in covariate_roles(a)), (
                covariate_roles(a)
            )
        else:
            assert (
                a['layer'] in L.BUILT_IN or a['layer'] in L.FACTORIES or a['layer'] in site.get('trusted_plugins', [])
            ), a['layer']


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


@pytest.mark.parametrize(
    'window,family,expected',
    [
        (w('AAAAAAA', 'GGAAAAA'), 'RGG', True),
        (w('AAAAAAA', 'GAAAAAA'), 'RGG', False),
        (w('AAAAAAG', 'GAAAAAA'), 'GRG', True),
        (w('AAAAAGA', 'AAAAAAA'), 'GAR', True),
        (w('AAAAARA', 'AAAAAAA'), 'RXR', True),
        (w('AAAAAAA', 'ARAAAAA'), 'RXR', True),
        (w('AAAAAAA', 'AAAAAAA'), 'RXR', False),
        (w('APAAAAA', 'AAAAAAA'), 'CARM1_proline_rich', False),  # P at -6: outside -5..+5
        (w('AAPAAAA', 'AAAAAAA'), 'CARM1_proline_rich', True),  # P at -5
        (w('AAPAAAA', 'AAAAAAA'), 'CARM1_hydrophobic_proline', True),
        (w('GGPGGGG', 'GGGGGGG'), 'CARM1_hydrophobic_proline', False),
        (w('', 'GG'), 'RGG', True),  # at a protein end the window is padded
    ],
)
def test_methylarginine_motif_rules(window, family, expected):
    p = load_profile(MARKS / 'methylarginine.yaml')
    assert bool(p.motif_flags(pd.Series([window]))[family].iloc[0]) is expected


def test_a_bare_mark_id_no_longer_resolves():
    with pytest.raises(ValueError, match='not a mark file'):
        load_profile('methylarginine')


def test_a_toy_site_reads_its_own_mark_file_by_path(tmp_path):
    """The mark file lives in the repository that holds the site file; the package carries no mark content."""
    from ptmcontext.profile import REPO as PKG_REPO

    data = yaml.safe_load((MARKS / 'phospho.yaml').read_text())
    data['id'] = 'toymark'
    (tmp_path / 'sites' / 'marks').mkdir(parents=True)
    (tmp_path / 'sites' / 'marks' / 'toymark.yaml').write_text(yaml.safe_dump(data))
    site = {'mark': 'sites/marks/toymark.yaml', '__root__': str(tmp_path)}
    assert site_profile(site).id == 'toymark'
    with pytest.raises(ValueError, match='not a mark file'):
        site_profile({'mark': 'sites/marks/missing.yaml', '__root__': str(tmp_path)})
    assert not list((PKG_REPO / 'ptmcontext').rglob('profiles'))
