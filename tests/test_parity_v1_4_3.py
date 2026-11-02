"""The rebuild equals release v1.4.3 of the Methylarginine Site Explorer, row for row and as written: every residue-level row
of its statistics table (motif, disorder, domain context, domain class, structure context; pooled and within protein)
and every row of its PANTHER, Reactome, Human Protein Atlas, disease-family, CD-CODE condensate, cell-map and DepMap
dependency tests (clusterProfiler's enricher, and the same sets within PaxDb abundance deciles; the disease families count
Entrez genes, the condensates are tested against the proteome and against the proteins in any condensate), and its test
of changes at methylarginines in TCGA tumours and DepMap cell lines (pooled and within protein). The variant with the
release's lower-confidence sites equals its second view, statistics_with_lower_confidence_v1.4.3.tsv. The Disease
Ontology terms and the DisGeNET terms one by one, which the release keeps in supporting tables only, equal those tables
term by term, in the site and in the variant (analyses_with_lower_confidence/disease)."""
from pathlib import Path

from ptmcontext import site as S

REPO = Path(__file__).resolve().parents[1]
EXPECTED = {'motif': 22, 'disorder': 8, 'domain_context': 10, 'domain_class': 28, 'structure_context': 14,
            'panther_group': 22, 'panther_class': 50, 'panther_subclass': 254,
            'disease_family': 16, 'disease_family_additional': 30, 'condensate': 80, 'condensate_proteome': 80,
            'reactome_top_level': 58, 'reactome_pathway': 3410, 'hpa_location': 96,
            'cell_region_hpa': 6, 'cell_region_hcm': 6, 'cell_region_organelle_ip': 6, 'cell_hcm_compartment': 40,
            'cell_hcm_domain': 46, 'cell_organelle_ip': 40, 'cell_chromatin': 8, 'depmap_dependency': 8, 'cancer_change': 4}
# not in the release's statistics table: its supporting tables disease_ontology (every Disease Ontology term tested) and
# disease_terms_tested (every DisGeNET term tested)
SUPPORTING = {'disease_ontology': 1088, 'disease_term': 8334}


def test_methylarginine_site_equals_release_v1_4_3(reference_root):
    result = S.run(REPO / 'sites' / 'methylarginine.yaml', reference_root, write=False, log=lambda *_: None, skip_new=True)
    failed = [(r.analysis, r.method, r.diffs) for r in result.parity if not r.equal]
    assert not failed, failed
    rows, supporting = {}, {}
    for r in result.parity:
        into = supporting if r.reference else rows
        into[r.analysis] = into.get(r.analysis, 0) + r.rows
    assert rows == EXPECTED
    assert sum(rows.values()) == 4342             # of the release's 4,659
    # the questions the release keeps in supporting tables only, checked against them set by set
    assert supporting == SUPPORTING


EXPECTED_LOWER_CONFIDENCE = {**EXPECTED, 'panther_subclass': 258, 'reactome_pathway': 3416}
# its own disease tables: every Disease Ontology term tested; the DisGeNET terms enriched (the release lists only those)
SUPPORTING_LOWER_CONFIDENCE = {'disease_ontology': 1091, 'disease_term': 623}


def test_with_lower_confidence_equals_the_release_view(reference_root):
    """The site's variant with the release's lower-confidence sites added (those it counts; the others on neither side)
    equals statistics_with_lower_confidence_v1.4.3.tsv, row for row."""
    result = S.run(REPO / 'sites' / 'methylarginine.yaml', reference_root, write=False, log=lambda *_: None, skip_new=True,
                   variant='with_lower_confidence')
    failed = [(r.analysis, r.method, r.diffs) for r in result.parity if not r.equal]
    assert not failed, failed
    rows, supporting = {}, {}
    for r in result.parity:
        into = supporting if r.reference else rows
        into[r.analysis] = into.get(r.analysis, 0) + r.rows
    assert rows == EXPECTED_LOWER_CONFIDENCE
    assert sum(rows.values()) == 4352             # of the release's 4,669
    assert result.record['marks']['counted'] == 13469
    assert supporting == SUPPORTING_LOWER_CONFIDENCE
