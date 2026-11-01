"""The rebuild equals release v1.4.3 of the Methylarginine Site Explorer, row for row and as written: every residue-level row
of its statistics table (motif, disorder, domain context, domain class, structure context; pooled and within protein)
and every row of its PANTHER, Reactome, Human Protein Atlas, disease-family and CD-CODE condensate tests (clusterProfiler's
enricher, and the same sets within PaxDb abundance deciles; the disease families count Entrez genes, the condensates are
tested against the proteome and against the proteins in any condensate)."""
from pathlib import Path

from ptmcontext import site as S

REPO = Path(__file__).resolve().parents[1]
EXPECTED = {'motif': 22, 'disorder': 8, 'domain_context': 10, 'domain_class': 28, 'structure_context': 14,
            'panther_group': 22, 'panther_class': 50, 'panther_subclass': 254,
            'disease_family': 16, 'disease_family_additional': 30, 'condensate': 80, 'condensate_proteome': 80,
            'reactome_top_level': 58, 'reactome_pathway': 3410, 'hpa_location': 96}


def test_methylarginine_site_equals_release_v1_4_3(reference_root):
    result = S.run(REPO / 'sites' / 'methylarginine.yaml', reference_root, write=False, log=lambda *_: None, skip_new=True)
    failed = [(r.analysis, r.method, r.diffs) for r in result.parity if not r.equal]
    assert not failed, failed
    rows = {}
    for r in result.parity:
        rows[r.analysis] = rows.get(r.analysis, 0) + r.rows
    assert rows == EXPECTED
    assert sum(rows.values()) == 4178             # of the release's 4,659
