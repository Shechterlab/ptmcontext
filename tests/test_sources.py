"""Several sources filling one role, and the SHEPHARD stager: offline, on tables built by hand."""

from pathlib import Path
import json

import jsonschema
import pandas as pd
import pytest

from ptmcontext import inputs as I
from ptmcontext import layers as L
from ptmcontext import stage
from ptmcontext import units as U
from ptmcontext.profile import validate
from ptmcontext.snapshot import Snapshot

MARKS = Path(__file__).resolve().parents[1] / 'sites' / 'marks'


def _domains(rows, source):
    return U.make_units(
        pd.DataFrame(rows, columns=['accession', 'start', 'end', 'label']).assign(subtype='domain', ref='', members=''),
        'domain',
        source,
        keep=U.DOMAIN_COLUMNS,
    )


CURATED = _domains([('A', 10, 50, 'kinase'), ('B', 5, 20, 'RRM')], 'curated')
PREDICTED = _domains([('A', 12, 60, 'Pkinase'), ('C', 1, 30, 'WD40')], 'predicted')


def test_first_of_fills_only_the_proteins_the_first_source_leaves_without():
    out = U.combine([CURATED, PREDICTED], 'first_of')
    assert out[['accession', 'start', 'source']].values.tolist() == [
        ['A', 10, 'curated'],
        ['B', 5, 'curated'],
        ['C', 1, 'predicted'],
    ]


def test_all_of_keeps_every_source():
    out = U.combine([CURATED, PREDICTED], 'all_of')
    assert sorted(out['source']) == ['curated', 'curated', 'predicted', 'predicted']


def test_an_unknown_rule_is_refused():
    with pytest.raises(ValueError, match='unknown rule'):
        U.combine([CURATED], 'best_of')


def test_a_layer_reads_a_role_filled_by_several_inputs(tmp_path):
    a, b = tmp_path / 'a.tsv', tmp_path / 'b.tsv'
    U.write_units(CURATED, a)
    U.write_units(PREDICTED, b)
    snap = Snapshot({'A': 'S' * 100, 'B': 'S' * 100, 'C': 'S' * 100, 'D': 'S' * 100})
    ctx = L.Context(snap, None, {'domains': L.Several('first_of', (a, b))})
    res = pd.DataFrame({'accession': ['A', 'C', 'D'], 'position': [55, 10, 10]})
    cats = L.BUILT_IN['domain_context'](res, ctx)['category'].tolist()
    # A: 5 past the curated domain's end (the predicted one, which covers 55, is not read); C: inside its predicted domain
    assert cats == ['boundary', 'in_domain', 'no_domain_annotation']
    with pytest.raises(TypeError, match='several inputs'):
        ctx.path('domains')


def test_site_roles_name_one_input_or_several():
    site = {
        'snapshot': {'input': 'fa'},
        'marks': {'input': 'm'},
        'inputs': {'disorder': 'mobidb', 'domains': {'first_of': ['uniprot', 'ecod']}},
        'reference': {'statistics': 'ref'},
    }
    assert I.site_input_names(site) == ['fa', 'm', 'mobidb', 'uniprot', 'ecod', 'ref']
    assert I.role_inputs({'all_of': ['x', 'y']}) == ('all_of', ['x', 'y'])
    with pytest.raises(ValueError):
        I.role_inputs({'first_of': ['x'], 'all_of': ['y']})


def test_the_site_schema_takes_first_of_and_refuses_other_rules():
    base = {
        'schema_version': 1,
        'id': 's',
        'title': 't',
        'mark': str(MARKS / 'phospho.yaml'),
        'snapshot': {'input': 'fa', 'release': 'UniProt 2026_03'},
        'marks': {'input': 'm', 'accession': 'a', 'position': 'p'},
        'analyses': [{'id': 'x', 'layer': 'disorder'}],
        'outputs': {'folder': 'out/s'},
    }
    validate({**base, 'inputs': {'domains': {'first_of': ['a', 'b']}}}, 'site')
    for bad in ({'best_of': ['a', 'b']}, {'first_of': ['a']}):  # one input needs no rule
        with pytest.raises(jsonschema.ValidationError):
            validate({**base, 'inputs': {'domains': bad}}, 'site')


def test_shephard_domains_keep_only_identical_sequences(tmp_path):
    (tmp_path / 'theirs.fasta').write_text('>sp|A|X\nMKKLLS\n>sp|B|Y\nMKKLLT\n')
    (tmp_path / 'ours.fasta').write_text('>sp|A|X\nMKKLLS\n>sp|B|Y\nMKKLLA\n')  # B has changed since
    (tmp_path / 'dom.tsv').write_text(
        'A\t1\t4\tDomainMapper_1\tdomain_type:Pkinase\tECOD_F_ID:206.1.1.2\tECOD_T_group:Protein kinase-like (PK-like)\tECOD_X_group:Protein kinase-like (PK-like)\n'
        'B\t2\t5\tDomainMapper_1\tdomain_type:RRM_1\tECOD_F_ID:304.4.1.1\tECOD_T_group:Alpha-beta plaits\tECOD_X_group:Ferredoxin-like\n'
    )
    out = tmp_path / 'inputs'
    r = stage.shephard_domains(
        tmp_path / 'dom.tsv',
        tmp_path / 'theirs.fasta',
        tmp_path / 'ours.fasta',
        out,
        tmp_path / 'm.json',
        'x_shephard_ecod_domains',
        'c5c956c0ff',
        'ECOD domains (DomainMapper)',
    )
    assert r == {'domains': 2, 'kept': 1, 'proteins': 1, 'identical_entries': 1}
    u = U.read_units(out / 'x_shephard_ecod_domains.tsv')
    assert u[['accession', 'ref', 'label']].values.tolist() == [
        ['A', '206.1.1.2', 'Pkinase · Protein kinase-like (PK-like)']
    ]
    entry = json.loads((tmp_path / 'm.json').read_text())['inputs']['x_shephard_ecod_domains']
    assert entry['file'] == 'inputs/x_shephard_ecod_domains.tsv' and entry['licence'].startswith('MIT')


def test_class_sets_at_the_top_in_groups_and_below(tmp_path):
    from ptmcontext.set_tests import class_sets

    (tmp_path / 'onto.tsv').write_text(
        'id\tname\tparent\nR\troot\t\nT1\tenzyme\tR\nT2\treceptor\tR\n'
        'S1\tkinase\tT1\nS2\tprotein kinase\tS1\nS3\tGPCR\tT2\n'
    )
    (tmp_path / 'cls.tsv').write_text('acc\tids\nA\tS2\nB\tS1;T1\nC\tS3\nD\t\n')
    paths = {'cls': tmp_path / 'cls.tsv', 'onto': tmp_path / 'onto.tsv'}
    src = {
        'input': 'cls',
        'protein': 'acc',
        'classes': 'ids',
        'ontology': {'input': 'onto', 'id': 'id', 'name': 'name', 'parent': 'parent', 'root': 'R'},
    }
    pairs = lambda **kw: sorted(  # noqa: E731
        map(tuple, class_sets({**src, **kw}, paths, {'A', 'B', 'C', 'D', 'E'})[['set', 'protein']].values.tolist())
    )  # noqa: E731
    assert pairs(level='top') == [('enzyme', 'A'), ('enzyme', 'B'), ('receptor', 'C')]
    # a protein's classes count with every class above them; the unclassified set takes the rest of the universe
    assert pairs(level='below_top', unclassified='none') == [
        ('GPCR', 'C'),
        ('kinase', 'A'),
        ('kinase', 'B'),
        ('none', 'D'),
        ('none', 'E'),
        ('protein kinase', 'A'),
    ]
    assert pairs(level='top', groups={'catalytic': ['T1'], 'signalling': ['T2']}) == [
        ('catalytic', 'A'),
        ('catalytic', 'B'),
        ('signalling', 'C'),
    ]
    with pytest.raises(ValueError, match='every top-level class once'):
        class_sets({**src, 'level': 'top', 'groups': {'catalytic': ['T1']}}, paths, set())
