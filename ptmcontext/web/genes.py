"""Proteins encoded by several genes: one readable name, and the full list.

UniProt gives one accession to proteins that several genes encode (histone H4: 14 genes, H4C1 to H4C16 and H4-16). The
FASTA header names the first, so a page that read it alone would call the protein "H4C1". website.protein.genes names a
table that lists every gene of an accession (`input`, with the accession column `from` and the gene column `to`, split at
`separator`). A protein with two or more genes then shows a short name (the page's label, card titles and network labels)
and keeps the list (`encoded by 14 genes`, and search finds each). The short name is the first of the `short` rules
(`pattern`, `replace`: regular-expression substitution on the first gene) that gives the same name for every gene; without
one, the common start of the genes. Nothing here names a gene family: the rules are the site file's.

`symbols` names a tab-separated table (an `accession` column, `previous` and `alias` columns of symbols separated by
"; "; # lines are comments) of the old and alternative symbols of the proteins (sites/data/hgnc_symbols.tsv, staged from
the HGNC complete set by tools/stage_hgnc_symbols.py). The page's search, links and the landing search find a protein by
them too.
"""

from __future__ import annotations

import csv
import os
import re
from pathlib import Path


def _short(genes: list[str], rules: list[dict]) -> str:
    for r in rules:
        out = {re.sub(r['pattern'], r['replace'], g) if re.search(r['pattern'], g) else None for g in genes}
        if len(out) == 1 and None not in out:
            return out.pop()
    start = os.path.commonprefix(genes).rstrip('-_. ')
    return start if len(start) >= 2 else genes[0]


def load(spec: dict | None, path: str | Path | None) -> dict[str, dict]:
    """{accession: {'short': name, 'genes': [every gene]}} for the proteins of the table with two or more genes."""
    if not spec or not path or not Path(path).exists():
        return {}
    sep = spec.get('separator', ';')
    rules = spec.get('short') or []
    out = {}
    with Path(path).open(newline='') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            genes = [g.strip() for g in str(r.get(spec['to'], '')).split(sep) if g.strip()]
            if len(genes) > 1 and r.get(spec['from']):
                out[r[spec['from']]] = {'short': _short(genes, rules), 'genes': genes}
    return out


REPO = Path(__file__).resolve().parents[2]


def symbols(spec: dict | None) -> dict[str, list[str]]:
    """{accession: previous and alias symbols} from website.protein.genes.symbols."""
    if not spec or not spec.get('symbols'):
        return {}
    p = Path(spec['symbols'])
    p = p if p.is_absolute() or p.exists() else REPO / p
    if not p.exists():
        return {}
    out: dict[str, list[str]] = {}
    with p.open(newline='') as f:
        for r in csv.DictReader((ln for ln in f if not ln.startswith('#')), delimiter='\t'):
            names = [x.strip() for k in ('previous', 'alias') for x in str(r.get(k, '')).split(';') if x.strip()]
            if r.get('accession') and names:
                out[r['accession']] = list(dict.fromkeys(names))
    return out


def for_site(site: dict, folder: str | Path) -> tuple[dict, dict]:
    """(proteins with several genes, symbols) of a site, its inputs read from the run's run.json in `folder`."""
    import json

    spec = ((site.get('website') or {}).get('protein') or {}).get('genes')
    if not spec:
        return {}, {}
    run = Path(folder) / 'run.json'
    inputs = json.loads(run.read_text()).get('inputs', {}) if run.exists() else {}
    return load(spec, (inputs.get(spec['input']) or {}).get('file')), symbols(spec)
