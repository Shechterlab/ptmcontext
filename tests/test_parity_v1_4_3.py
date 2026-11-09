"""The rebuild equals release v1.4.3 of the Methylarginine Site Explorer, row for row and as written: every residue-level row
of its statistics table (motif, disorder, domain context, domain class, structure context; pooled and within protein)
and every row of its PANTHER, Reactome, Human Protein Atlas, disease-family, CD-CODE condensate, cell-map and DepMap
dependency tests (clusterProfiler's enricher, and the same sets within PaxDb abundance deciles; the disease families count
Entrez genes, the condensates are tested against the proteome and against the proteins in any condensate), and its test
of changes at methylarginines in TCGA tumours and DepMap cell lines (pooled and within protein). The variant with the
release's lower-confidence sites equals its second view, statistics_with_lower_confidence_v1.4.3.tsv. The Disease
Ontology terms and the DisGeNET terms one by one, which the release keeps in supporting tables only, equal those tables
term by term, in the site and in the variant (analyses_with_lower_confidence/disease). And its interaction and binding tests: RNA and DNA crosslinks in cells, distance along the chain to RNA evidence, PDB and
predicted interfaces, distance to RNA and DNA in structures, IntAct features (each against the arginines its evidence
could reach), and the proteins found binding RNA or DNA in cells and by GO. Four crosslink rows and four binding_protein
rows read pCLAP's and RBDmap's measured peptides, which may not be republished (checksum_only): they are compared only
when the root holds them, and q is then left out of those two questions' comparison. In the lower-confidence view,
three of them read release tables of the main view's proteins only, so they are run but not compared there
(variants.with_lower_confidence.not_compared). Three eCLIP questions (APEX-seq, TSA-seq, Hi-C subcompartments: where
the RNAs bound by proteins with eCLIP data gather) are rebuilt from the release's per-protein calls
(supporting/eclip_rna_compartments); one Mann-Whitney row is excused there (a tie its rounded odds ratios make). The
nuclear-body eCLIP map and the nuclear-body proteomes (Barutcu et al. 2022) are held for their licence. The residue
questions' denominators equal the release's supporting/arginine_background, protein by protein."""

from pathlib import Path

from ptmcontext import site as S

REPO = Path(__file__).resolve().parents[1]
EXPECTED = {
    'motif': 22,
    'disorder': 8,
    'domain_context': 10,
    'domain_class': 28,
    'structure_context': 14,
    'panther_group': 22,
    'panther_class': 50,
    'panther_subclass': 254,
    'disease_family': 16,
    'disease_family_additional': 30,
    'condensate': 80,
    'condensate_proteome': 80,
    'reactome_top_level': 58,
    'reactome_pathway': 3410,
    'hpa_location': 96,
    'cell_region_hpa': 6,
    'cell_region_hcm': 6,
    'cell_region_organelle_ip': 6,
    'cell_hcm_compartment': 40,
    'cell_hcm_domain': 46,
    'cell_organelle_ip': 40,
    'cell_chromatin': 8,
    'depmap_dependency': 8,
    'cancer_change': 4,
    'go_binding': 8,
    'binding_protein': 10,
    'pdb_interface': 24,
    'predicted_interface': 12,
    'crosslink': 46,
    'sequence_proximity': 60,
    'nucleic_acid_distance': 12,
    'intact': 6,
    'eclip_rna_apexseq': 23,
    'eclip_gene_tsaseq': 3,
    'eclip_gene_hic': 3,
}
# not in the release's statistics table: its supporting tables disease_ontology (every Disease Ontology term tested) and
# disease_terms_tested (every DisGeNET term tested)
SUPPORTING = {'disease_ontology': 1088, 'disease_term': 8334}
# the residue questions' denominators, protein by protein (supporting/arginine_background): main view only
BACKGROUND = {
    'motif': 35585,
    'disorder': 16690,
    'domain_context': 16264,
    'domain_class': 10045,
    'structure_context': 20271,
}
# with pCLAP's and RBDmap's measured peptides under the root (checksum_only), every row of both questions
FULL = {'crosslink': 50, 'binding_protein': 14}


def expected(result, base=EXPECTED) -> dict:
    """The rows compared: every row of a question whose checksum_only inputs the root holds."""
    absent = result.record.get('absent', {})
    return {**base, **({} if absent else FULL)}


def test_methylarginine_site_equals_release_v1_4_3(reference_root):
    result = S.run(
        REPO / 'sites' / 'methylarginine.yaml', reference_root, write=False, log=lambda *_: None, skip_new=True
    )
    failed = [(r.analysis, r.method, r.diffs) for r in result.parity if not r.equal]
    assert not failed, failed
    rows, supporting, background = {}, {}, {}
    for r in result.parity:
        into = background if r.method == 'background' else supporting if r.reference else rows
        into[r.analysis] = into.get(r.analysis, 0) + r.rows
    assert rows == expected(result)
    assert sum(EXPECTED.values()) == 4549  # of the release's 4,659 (4,557 with the measured peptides)
    # the questions the release keeps in supporting tables only, checked against them set by set
    assert supporting == SUPPORTING
    assert background == BACKGROUND
    # one row the release's rounded supporting table cannot rebuild, excused in the site file with why
    assert [(r.analysis, r.method, len(r.excused)) for r in result.parity if r.excused] == [
        ('eclip_rna_apexseq', 'mann_whitney', 1)
    ]


NOT_IN_VARIANT = ('crosslink', 'sequence_proximity', 'nucleic_acid_distance')
EXPECTED_LOWER_CONFIDENCE = {
    **{k: v for k, v in EXPECTED.items() if k not in NOT_IN_VARIANT},
    'panther_subclass': 258,
    'reactome_pathway': 3416,
}
# its own disease tables: every Disease Ontology term tested; the DisGeNET terms enriched (the release lists only those)
SUPPORTING_LOWER_CONFIDENCE = {'disease_ontology': 1091, 'disease_term': 623}


def test_with_lower_confidence_equals_the_release_view(reference_root):
    """The site's variant with the release's lower-confidence sites added (those it counts; the others on neither side)
    equals statistics_with_lower_confidence_v1.4.3.tsv, row for row."""
    result = S.run(
        REPO / 'sites' / 'methylarginine.yaml',
        reference_root,
        write=False,
        log=lambda *_: None,
        skip_new=True,
        variant='with_lower_confidence',
    )
    failed = [(r.analysis, r.method, r.diffs) for r in result.parity if not r.equal]
    assert not failed, failed
    rows, supporting = {}, {}
    for r in result.parity:
        into = supporting if r.reference else rows
        into[r.analysis] = into.get(r.analysis, 0) + r.rows
    assert rows == {**EXPECTED_LOWER_CONFIDENCE, **({} if result.record.get('absent') else {'binding_protein': 14})}
    assert sum(EXPECTED_LOWER_CONFIDENCE.values()) == 4441  # of the release's 4,669
    assert result.record['marks']['counted'] == 13469
    assert supporting == SUPPORTING_LOWER_CONFIDENCE
