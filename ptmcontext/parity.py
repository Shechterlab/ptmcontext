"""Parity with a reference output: the rebuild recomputes published rows and compares them, line by line.

The reference is read as data (a TSV whose MD5 the input manifest records); no code of the repository that wrote it is
run. Parity is how the rebuild earns the right to replace a pipeline: one check per analysis, kept as a test.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from . import statistics as ST


@dataclass
class Result:
    analysis: str
    method: str
    rows: int
    equal: bool
    diffs: list[tuple[str, str]] = field(default_factory=list)
    reference: str = ''          # a table of its own (an analysis's reference), not the site's statistics reference


def compare(rows: pd.DataFrame, reference: pd.DataFrame, analysis: str) -> list[Result]:
    """For each method of the analysis in the reference, whether the rebuilt rows equal the reference's, as written
    (same rows, same order, same text)."""
    got = ST.lines(rows)
    m = ST.NAMES.index('method')
    out = []
    ref = reference[reference['analysis'] == analysis]
    if ref.empty:
        return [Result(analysis, '-', 0, False, [('', f'the reference has no rows for {analysis}')])]
    for method in sorted(set(ref['method'])):
        exp = ['\t'.join(r) for r in ref[ref['method'] == method].reindex(columns=ST.NAMES).itertuples(index=False)]
        g = [line for line in got if line.split('\t')[m] == method]
        diffs = [(a, b) for a, b in zip(g, exp) if a != b]
        if len(g) != len(exp):
            diffs.append((f'{len(g)} rows', f'{len(exp)} rows'))
        out.append(Result(analysis, method, len(exp), g == exp, diffs[:5]))
    return out


def _g6(v) -> str:
    return ST.cell(float(v), 'number') if str(v).strip() != '' else ''


def compare_table(rows: pd.DataFrame, table: pd.DataFrame, analysis: str, ref: dict) -> Result:
    """A protein-set question's enricher rows against a published table in its own columns (ref.columns: the set's id,
    a, optionally the set's size M, fold_enrichment, p and q), set by set: the counts equal and the numbers equal as the
    statistics table writes them (6 significant digits). ref.rows says which sets the table lists: every tested set
    (all: the same sets), those at q <= 0.05 (enriched: exactly those), or some (each listed set is checked). For a
    question a release keeps in a supporting table only."""
    cols, listed = ref['columns'], ref.get('rows', 'all')
    got = rows[(rows['analysis'] == analysis) & (rows['method'] == 'enricher')]

    def values(r, a, m, f, p, q):
        return (int(r[a]), *([int(r[m])] if 'M' in cols else []), _g6(r[f]), _g6(r[p]), _g6(r[q]))
    mine = {str(r['category']): (int(r['a']), *([int(r['a']) + int(r['c'])] if 'M' in cols else []),
                                 _g6(r['fold_enrichment']), _g6(r['p']), _g6(r['q'])) for r in got.to_dict('records')}
    theirs = {str(r[cols['set']]).strip(): values(r, cols['a'], cols.get('M'), cols['fold_enrichment'], cols['p'], cols['q'])
              for r in table.to_dict('records')}
    if listed == 'enriched':
        q = dict(zip(got['category'].astype(str), pd.to_numeric(got['q'], errors='coerce')))
        mine = {s: v for s, v in mine.items() if q[s] <= 0.05}
    keys = sorted(theirs) if listed == 'some' else sorted(set(mine) | set(theirs))
    what = 'a, M, fold, p, q' if 'M' in cols else 'a, fold, p, q'
    diffs = [(f'{s}: {what} = {mine.get(s)}', f'{theirs.get(s)}') for s in keys if mine.get(s) != theirs.get(s)]
    return Result(analysis, 'enricher', len(theirs), not diffs, diffs[:5], reference=ref['input'])
