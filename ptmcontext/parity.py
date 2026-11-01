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
