"""The statistics row: every test, for any unit and mark, is one row of one table (CONTRACTS.md).

The columns, their order and their formatting are those of the Methylarginine Site Explorer's statistics_<version>.tsv:
integers without decimals, numbers in up to 6 significant digits, empty for missing. q is Benjamini-Hochberg within
(analysis, method).
"""
from __future__ import annotations

import math
from pathlib import Path

import pandas as pd

COLUMNS: list[tuple[str, str]] = [
    ('analysis', 'code'), ('category', 'string'), ('stratum', 'string'),
    ('a', 'integer'), ('b', 'integer'), ('c', 'integer'), ('d', 'integer'),
    ('odds_ratio', 'number'), ('log2_odds_ratio', 'number'), ('fold_enrichment', 'number'), ('log2_fold_enrichment', 'number'),
    ('p', 'number'), ('q', 'number'), ('method', 'code'), ('background', 'string'), ('n_strata', 'integer'),
    ('odds_ratio_ci_low', 'number'), ('odds_ratio_ci_high', 'number'),
]
NAMES = [c for c, _ in COLUMNS]


def _missing(v) -> bool:
    return v is None or v is pd.NA or (isinstance(v, str) and v == '') or (isinstance(v, float) and math.isnan(v))


def cell(value, kind: str) -> str:
    if kind == 'integer':
        return '' if _missing(value) else str(int(value))
    if kind == 'number':
        return '' if _missing(value) else f'{float(value):.6g}'
    return '' if _missing(value) else str(value)


def lines(rows: pd.DataFrame) -> list[str]:
    """The rows as TSV lines, without the header."""
    rows = rows.reindex(columns=NAMES)
    out = []
    for r in rows.itertuples(index=False):
        values = [cell(v, kind) for v, (_, kind) in zip(r, COLUMNS)]
        for v in values:
            if '\t' in v or '\n' in v or ';' in v:
                raise ValueError(f'a separator inside a statistics value: {v!r}')
        out.append('\t'.join(values))
    return out


def write(rows: pd.DataFrame, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='') as fh:
        fh.write('\t'.join(NAMES) + '\n')
        for line in lines(rows):
            fh.write(line + '\n')


def read(path: str | Path) -> pd.DataFrame:
    return pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False)
