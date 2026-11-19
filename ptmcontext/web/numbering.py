"""Site numbering: which proteins the page numbers as papers do, and by how much.

website.protein.numbering is a list of rules; the first that matches a protein gives its offset (shown position =
UniProt position + offset). A rule matches by gene (`genes`, a regular expression on the first gene symbol), by name
(`names`, for a protein without a gene) or by accession (`removed_met`: a table of the proteins whose UniProt entry
records the initiator methionine as removed). The page (kit-select.js, `K.numbering`) applies the same rule; this module
is the Python side, for the rules sent to the page and for anything built here.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def accessions(path: str | Path) -> list[str]:
    """The accessions of a `removed_met` table (an `accession` column; lines starting with # are comments)."""
    p = Path(path)
    p = p if p.is_absolute() or p.exists() else REPO / p
    with p.open(newline='') as f:
        rows = csv.DictReader((ln for ln in f if not ln.startswith('#')), delimiter='\t')
        return sorted({r['accession'] for r in rows if r.get('accession')})


def rules_for_page(rules: list[dict] | None) -> list[dict]:
    """The rules as the page reads them: a `removed_met` table becomes the list of accessions `accs`."""
    out = []
    for r in rules or []:
        r = dict(r)
        if r.get('removed_met'):
            r['accs'] = accessions(r['removed_met'])
        out.append(r)
    return out


def offset(acc: str, gene: str, name: str, rules: list[dict] | None) -> int:
    """The offset of a protein: that of the first rule that matches it, else 0 (UniProt numbering)."""
    g = re.split(r'[\s;,]+', str(gene or '').strip())[0]
    for r in rules or []:
        if acc in (r.get('accs') or ()):
            return int(r['offset'])
        if r.get('genes') or r.get('names'):
            hit = (
                bool(r.get('genes') and re.search(r['genes'], g))
                if g
                else bool(r.get('names') and re.search(r['names'], name or '', re.I))
            )
            if hit:
                return int(r['offset'])
    return 0
