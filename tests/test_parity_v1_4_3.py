"""The rebuild equals release v1.4.3 of the Methylarginine Site Explorer: every residue-level row of its statistics
table (motif, disorder, domain context, domain class, structure context; pooled and within protein), as written."""
from pathlib import Path

from proteomekit import site as S

REPO = Path(__file__).resolve().parents[1]


def test_methylarginine_site_equals_release_v1_4_3(reference_root):
    result = S.run(REPO / 'sites' / 'methylarginine.yaml', reference_root, write=False, log=lambda *_: None)
    assert result.parity, 'no parity rows were checked'
    failed = [(r.analysis, r.method, r.diffs) for r in result.parity if not r.equal]
    assert not failed, failed
    assert sum(r.rows for r in result.parity) == 82
