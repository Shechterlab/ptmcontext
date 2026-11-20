"""Stage sites/data/hgnc_symbols.tsv: the previous and alias gene symbols of the proteins the sites show.

Usage: python3 tools/stage_hgnc_symbols.py HGNC_COMPLETE_SET.txt OUT.tsv PROTEINS.tsv [PROTEINS.tsv ...]

HGNC complete set (https://www.genenames.org/download/, CC0 1.0): the file is read as data, never run. The proteins are
those of the sites' proteins.tsv / shown_proteins.tsv (an `accession` column); only accessions of those files are kept,
and only the accession, the approved symbol(s), and the previous and alias symbols. `website.protein.genes.symbols`
reads the result, so a search finds a protein by an old or alternative symbol (HIST1H4B, H3F3B).
"""

from __future__ import annotations

import csv
import sys


def main(hgnc: str, out: str, *tables: str) -> None:
    accs: set[str] = set()
    for t in tables:
        with open(t, newline='') as f:
            accs.update(r['accession'] for r in csv.DictReader(f, delimiter='\t') if r.get('accession'))
    rows: dict[str, dict[str, list[str]]] = {}
    with open(hgnc, newline='') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            if r.get('status') != 'Approved':
                continue
            for acc in filter(None, r['uniprot_ids'].split('|')):
                if acc in accs:
                    d = rows.setdefault(acc, {'symbol': [], 'previous': [], 'alias': []})
                    d['symbol'].append(r['symbol'])
                    d['previous'] += [x for x in r['prev_symbol'].split('|') if x]
                    d['alias'] += [x for x in r['alias_symbol'].split('|') if x]
    with open(out, 'w', newline='') as f:
        f.write(
            '# HGNC complete set (HGNC, EMBL-EBI): approved symbols with their previous and alias symbols, for the proteins of the sites.\n'
            '# Source: https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt, downloaded 2026-11-20; CC0 1.0.\n'
            '# Only accessions in the sites\' protein lists and rows with a previous or alias symbol are kept; symbols are separated by "; ".\n'
            '# Read by website.protein.genes (symbols): the search finds a protein by these symbols too. Rebuild: tools/stage_hgnc_symbols.py.\n'
        )
        w = csv.writer(f, delimiter='\t', lineterminator='\n')
        w.writerow(['accession', 'symbol', 'previous', 'alias'])
        for acc in sorted(rows):
            d = rows[acc]
            prev, alias = (list(dict.fromkeys(d[k])) for k in ('previous', 'alias'))
            alias = [a for a in alias if a not in d['symbol']]
            if prev or alias:
                w.writerow([acc, '; '.join(dict.fromkeys(d['symbol'])), '; '.join(prev), '; '.join(alias)])


if __name__ == '__main__':
    main(*sys.argv[1:])
