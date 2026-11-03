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
    skipped: int = 0              # reference rows not compared: their tests read inputs that are not present
    excused: list[str] = field(default_factory=list)   # reference rows the site file excuses (reference.excused): why


def compare(rows: pd.DataFrame, reference: pd.DataFrame, analysis: str, leave_out: list[tuple[str, str]] | None = None,
            excused: list[dict] | None = None) -> list[Result]:
    """For each method of the analysis in the reference, whether the rebuilt rows equal the reference's, as written
    (same rows, same order, same text). leave_out: (category, stratum) of tests that could not be run (they read a
    checksum_only input the root does not hold); their reference rows are not compared, and neither is q in the
    others' (Benjamini-Hochberg over the question's rows needs the rows left out): rows checks every other column.
    excused: rows the site file says the rebuild cannot reproduce ({method, category, stratum, why}): both sides' row
    is left out, and every other row (q too) is compared."""
    got = ST.lines(rows)
    m = ST.NAMES.index('method')
    qi = ST.NAMES.index('q')
    out = []
    ref = reference[reference['analysis'] == analysis]
    if ref.empty:
        return [Result(analysis, '-', 0, False, [('', f'the reference has no rows for {analysis}')])]
    skip = set(leave_out or [])
    for method in sorted(set(ref['method'])):
        r_m = ref[ref['method'] == method]
        hold = ~pd.Series(list(zip(r_m['category'], r_m['stratum'])), index=r_m.index).isin(skip) if skip else pd.Series(True, index=r_m.index)
        exp = ['\t'.join(r) for r in r_m[hold].reindex(columns=ST.NAMES).itertuples(index=False)]
        g = [line for line in got if line.split('\t')[m] == method]
        exc = {(e['category'], e.get('stratum', 'all')): e['why'] for e in excused or [] if e['method'] == method}
        if exc:
            ci, si = ST.NAMES.index('category'), ST.NAMES.index('stratum')
            out_ = lambda line: (line.split('\t')[ci], line.split('\t')[si]) not in exc  # noqa: E731
            exp, g = [x for x in exp if out_(x)], [x for x in g if out_(x)]
        if skip:
            drop_q = lambda line: '\t'.join(v if k != qi else '' for k, v in enumerate(line.split('\t')))  # noqa: E731
            exp, g = [drop_q(x) for x in exp], [drop_q(x) for x in g]
        diffs = [(a, b) for a, b in zip(g, exp) if a != b]
        if len(g) != len(exp):
            diffs.append((f'{len(g)} rows', f'{len(exp)} rows'))
        out.append(Result(analysis, method, len(exp), g == exp, diffs[:5], skipped=int((~hold).sum()),
                          excused=[f'{c}: {w}' for (c, _), w in exc.items()]))
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


def compare_background(counts: pd.DataFrame, table: pd.DataFrame, ref: dict) -> list[Result]:
    """Each protein's other candidate residues per residue question and class (protein_counts: others_in, and
    others_total for the class ref.all names) against a published table of them (a release's denominators), row by
    row for each question the table holds; a class of the rebuild the table lacks must count none."""
    acc, an, cat, oth, every = ref['accession'], ref['analysis'], ref['category'], ref['others'], ref.get('all', '*')
    out = []
    # a protein's other candidates in all, from any of these questions (each counts every candidate of the protein)
    anyq = counts[counts['analysis'].isin(set(table[an]))].drop_duplicates('accession').set_index('accession')['others_total'].astype(int).to_dict()
    for a in sorted(set(table[an])):
        t = table[table[an] == a]
        c = counts[counts['analysis'] == a]
        mine = {(r.accession, r.category): int(r.others_in) for r in c.itertuples()}
        totals = {**anyq, **c.drop_duplicates('accession').set_index('accession')['others_total'].astype(int).to_dict()}
        diffs = []
        for x, k, v in zip(t[acc], t[cat], t[oth]):
            got = totals.get(x) if k == every else mine.get((x, k))
            if got is None and k != every:
                got = 0 if x in totals else None
            if got != int(v):
                diffs.append((f'{x} {k}: {got}', f'{v}'))
        theirs = set(zip(t[acc], t[cat]))
        diffs += [(f'{x} {k}: {v}', 'absent') for (x, k), v in mine.items() if v and (x, k) not in theirs]
        out.append(Result(a, 'background', len(t), not diffs, diffs[:5], reference=ref['input']))
    return out
