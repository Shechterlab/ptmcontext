"""The unit table: one row per region of a protein that something is counted in or drawn as.

Columns (CONTRACTS.md, schemas/units.schema.json): unit_id, accession, start, end, kind, source, then any columns of
the unit's own. start and end are 1-based and inclusive. kind is a short word: disordered (a MobiDB region as given),
idr (disordered regions merged and at least 20 residues), domain, flank, segment, site, ... A site is a unit of
length 1, so the same tests and drawings serve residues and regions.

Builders here read the inputs PTM_Pipeline stages (inputs/annotation/). Units made in another repository (a lab's own
regions, the IDR Explorer's charged segments) are written as a unit table there and read with read_units.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import pandas as pd

from .snapshot import Snapshot

UNIT_COLUMNS = ['unit_id', 'accession', 'start', 'end', 'kind', 'source']


def make_units(
    frame: pd.DataFrame,
    kind: str,
    source: str,
    accession: str = 'accession',
    start: str = 'start',
    end: str = 'end',
    keep: Iterable[str] = (),
) -> pd.DataFrame:
    """A unit table from any table of intervals: rows without a numeric start and end are dropped."""
    keep = list(keep)
    out = pd.DataFrame(
        {
            'accession': frame[accession].astype(str).str.strip(),
            'start': pd.to_numeric(frame[start], errors='coerce'),
            'end': pd.to_numeric(frame[end], errors='coerce'),
        }
    )
    for col in keep:
        out[col] = frame[col].to_numpy()
    out = out[out['start'].notna() & out['end'].notna()].copy()
    out['start'] = out['start'].astype(int)
    out['end'] = out['end'].astype(int)
    out['kind'] = kind
    out['source'] = source
    out['unit_id'] = out['accession'] + ':' + kind + ':' + out['start'].astype(str) + '-' + out['end'].astype(str)
    out = out.sort_values(['accession', 'start', 'end'], kind='stable').reset_index(drop=True)
    return out[UNIT_COLUMNS + keep]


def read_units(path: str | Path) -> pd.DataFrame:
    """A unit table written by any repository (TSV), checked for the contract's columns."""
    df = pd.read_csv(
        path, sep='\t', dtype={'accession': str, 'kind': str, 'source': str, 'unit_id': str}, keep_default_na=False
    )
    missing = [c for c in UNIT_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f'{path}: not a unit table, missing {missing}')
    df['start'] = df['start'].astype(int)
    df['end'] = df['end'].astype(int)
    return df


def write_units(units: pd.DataFrame, path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    units.to_csv(path, sep='\t', index=False, lineterminator='\n')


def mobidb_disorder(path: str | Path) -> pd.DataFrame:
    """MobiDB disordered regions as staged (canonical_UniProtAC, fragment_start, fragment_end), one unit per region as
    given: the units the release's disorder classes are read against."""
    df = pd.read_csv(path, sep='\t', low_memory=False)
    return make_units(
        df,
        'disordered',
        f'MobiDB ({Path(path).name})',
        accession='canonical_UniProtAC',
        start='fragment_start',
        end='fragment_end',
        keep=[c for c in ('mobidb_annotation_key',) if c in df.columns],
    )


# Domain units carry, beside the six contract columns: subtype (domain or repeat), ref (the source's accession),
# label (its name) and members (member-database accessions, if any). The nearest-domain rule and the domain classes
# read only these, so any source that fills them (InterPro, UniProt features, Pfam, a lab's own) serves.
DOMAIN_COLUMNS = ['subtype', 'ref', 'label', 'members']


def interpro_domains(path: str | Path, types: Iterable[str] = ('domain', 'repeat')) -> pd.DataFrame:
    """InterPro intervals as staged (canonical_UniProtAC, fragment_start, fragment_end, interpro_*), of the given
    InterPro types (the release uses domain and repeat)."""
    df = pd.read_csv(path, sep='\t', low_memory=False)
    df = df[df['interpro_type'].astype(str).isin(set(types))].rename(
        columns={
            'interpro_type': 'subtype',
            'interpro_accession': 'ref',
            'interpro_name': 'label',
            'member_database_accessions': 'members',
        }
    )
    return make_units(
        df,
        'domain',
        f'InterPro ({Path(path).name})',
        accession='canonical_UniProtAC',
        start='fragment_start',
        end='fragment_end',
        keep=DOMAIN_COLUMNS,
    )


# ---- readers: how a file becomes units -------------------------------------------------------------------------------
# A file is read by, in order: the column mapping its manifest entry gives (`columns`, any layout, no code), else the
# first registered reader that recognizes its columns. The package registers the unit table (the contract) and the
# staged MobiDB and InterPro tables; a trusted plugin may register more with register_reader when it loads.


@dataclass(frozen=True)
class Reader:
    name: str
    detect: Callable[[set, str], bool]  # (the file's columns, the kind asked for) -> can it read it
    read: Callable[[Path, str], pd.DataFrame]
    describe: str = ''


READERS: list[Reader] = []


def register_reader(name: str, detect: Callable[[set, str], bool], describe: str = ''):
    """Decorator: a reader for one more file format. Later registrations are tried after earlier ones."""

    def wrap(fn):
        READERS[:] = [r for r in READERS if r.name != name] + [Reader(name, detect, fn, describe)]
        return fn

    return wrap


def _holds(frame: pd.DataFrame, cond: dict, snapshot: Snapshot | None = None) -> pd.Series:
    """Whether each row meets a condition: equals, in or contains (text); matches (a regular expression the whole cell
    matches); at_least or at_most (a number; a cell that is
    not a number meets neither); same_as (the cell equals another column's); on_snapshot (the cell, an accession with
    any isoform suffix dropped, is a protein of the snapshot, or with false is not)."""
    col = frame[cond['column']].astype(str)
    if 'equals' in cond:
        return col == cond['equals']
    if 'in' in cond:
        return col.isin({str(x) for x in cond['in']})
    if 'contains' in cond:
        return col.str.contains(cond['contains'], regex=False)
    if 'matches' in cond:
        return col.str.fullmatch(cond['matches']).fillna(False).astype(bool)
    if 'at_least' in cond or 'at_most' in cond:
        num = pd.to_numeric(col, errors='coerce')
        return num >= float(cond['at_least']) if 'at_least' in cond else num <= float(cond['at_most'])
    if 'same_as' in cond:
        return col == frame[cond['same_as']].astype(str)
    if 'on_snapshot' in cond:
        if snapshot is None:
            raise ValueError(f'a condition on_snapshot ({cond["column"]}) needs the snapshot')
        return col.str.split('-').str[0].isin(set(snapshot.sequences)) == bool(cond['on_snapshot'])
    raise ValueError(
        f'a condition needs equals, in, contains, matches, at_least, at_most, same_as or on_snapshot: {cond}'
    )


def select_rows(df: pd.DataFrame, columns: dict, snapshot: Snapshot | None = None) -> pd.DataFrame:
    """The rows a column mapping keeps: every include condition holds, no exclude condition does."""
    for cond in columns.get('include', []):
        df = df[_holds(df, cond, snapshot)]
    for cond in columns.get('exclude', []):
        df = df[~_holds(df, cond, snapshot)]
    return df


# What a column mapping may give for where its units are, besides start and end:
#   position   one residue per row, or a list of them (separator); with residue, the residue(s) the row names there
#   ranges     a list of start-end ranges ("363-363,531-531"), each a unit
#   residues   a list of residues written with their letter ("R169,A203"), each a unit; a row whose letters disagree
#              with the snapshot anywhere is dropped (it numbers another sequence)
#   marked_in  a sequence starting at start whose lower-case letters mark residues ("LYKEELEQTyhAK"), each a unit
# and checks against the snapshot's sequences:
#   residue    the residue a row names at its position: a residue that differs is dropped
#   sequence   the interval's sequence: kept where the snapshot reads it there; with relocate, moved to the only place
#              the snapshot reads it, else dropped
#   gene       an accession not on the snapshot is replaced by the snapshot's entry of this gene (when one has it)
#   canonical  an isoform accession (P12345-2) is read as its entry (with residue or sequence checks, which then hold)
#   start_offset  added to start (1 for a table whose starts count from 0)
#   sequence_start, sequence_end  where the sequence is read, when not at the unit itself (a peptide's, for the
#                 longer region around it that the row gives)
#   max_length    units longer than this are dropped
#   max_per_row   rows naming more residues than this are dropped (before the checks)
#   unique_within rows grouped by these columns: a group is kept only when it places exactly one residue
MAPPING_KEYS = (
    'accession',
    'start',
    'end',
    'position',
    'ranges',
    'residues',
    'marked_in',
    'residue',
    'sequence',
    'relocate',
    'gene',
    'canonical',
    'start_offset',
    'sequence_start',
    'sequence_end',
    'max_length',
    'separator',
    'max_per_row',
    'unique_within',
    'label',
    'ref',
    'subtype',
    'class',
    'kind',
    'sep',
    'include',
    'exclude',
    'value',
)


def _gene_map(snapshot: Snapshot) -> dict[str, str]:
    """Gene name -> the snapshot entry of that gene, for the gene names one entry holds (the last in accession order
    otherwise, as a dict built in that order keeps it)."""
    out = {}
    for acc in sorted(snapshot.sequences):
        g = snapshot.describe(acc).get('gene', '')
        if g:
            out[g] = acc
    return out


def mapped_spans(df: pd.DataFrame, columns: dict, snapshot: Snapshot | None = None) -> pd.DataFrame:
    """(row, accession, start, end) of every unit a column mapping finds in the rows of a table (CONTRACTS.md, Input
    manifest entries): one per row (start and end), or several (a list of positions, ranges or lettered residues, the
    marked letters of a sequence), each checked against the snapshot where the mapping says so."""
    unknown = sorted(set(columns) - set(MAPPING_KEYS))
    if unknown:
        raise ValueError(f'a column mapping has keys it does not know: {unknown} (known: {sorted(MAPPING_KEYS)})')
    needs_seq = any(columns.get(k) for k in ('residues', 'marked_in', 'residue', 'sequence', 'gene'))
    if needs_seq and snapshot is None:
        raise ValueError('this column mapping checks residues or sequences: it needs the snapshot')
    seqs = snapshot.sequences if snapshot is not None else {}
    acc = df[columns['accession']].astype(str).str.strip()
    if columns.get('canonical'):
        acc = acc.str.split('-').str[0]
    if columns.get('gene'):
        genes = _gene_map(snapshot)
        off = ~acc.isin(set(seqs))
        acc = acc.where(~off, df[columns['gene']].astype(str).map(genes).fillna(acc))
    sep = columns.get('separator')
    rows: list[tuple[int, str, int, int]] = []
    listed: dict[int, int] = {}  # row -> how many residues it names, before the checks
    offset = int(columns.get('start_offset', 0))

    def num(v):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None

    if columns.get('ranges'):
        for i, a, v in zip(df.index, acc, df[columns['ranges']].astype(str)):
            parts = [x for x in v.split(sep or ',') if x.strip()]
            listed[i] = len(parts)
            for x in parts:
                lo, _, hi = x.strip().partition('-')
                lo, hi = num(lo), num(hi or lo)
                if lo is not None and hi is not None:
                    rows.append((i, a, lo, hi))
    elif columns.get('residues'):
        for i, a, v in zip(df.index, acc, df[columns['residues']].astype(str)):
            items = [x.strip() for x in v.split(sep or ',') if x.strip()]
            listed[i] = len(items)
            s = seqs.get(a, '')
            ok = bool(items) and all(
                x[1:].isdigit() and 1 <= int(x[1:]) <= len(s) and s[int(x[1:]) - 1] == x[0] for x in items
            )
            if ok:
                rows += [(i, a, int(x[1:]), int(x[1:])) for x in items]
    elif columns.get('marked_in'):
        for i, a, st, v in zip(df.index, acc, df[columns['start']], df[columns['marked_in']].astype(str)):
            st = num(st)
            marked = [k for k, c in enumerate(v) if c.islower()]
            listed[i] = len(marked)
            if st is None:
                continue
            s = seqs.get(a, '')
            for k in marked:
                q = st + offset + k
                if 0 < q <= len(s) and s[q - 1] == v[k].upper():
                    rows.append((i, a, q, q))
    elif columns.get('position') and not columns.get('start'):
        res_col = columns.get('residue')
        for i, a, v, r in zip(
            df.index, acc, df[columns['position']].astype(str), df[res_col].astype(str) if res_col else [''] * len(df)
        ):
            ps = [x.strip() for x in (v.split(sep) if sep else [v])]
            rs = [x.strip() for x in (r.split(sep) if sep else [r])] if res_col else [None] * len(ps)
            listed[i] = len([x for x in ps if x])
            s = seqs.get(a, '')
            for p_, r_ in zip(ps, rs):
                q = num(p_)
                if q is None:
                    continue
                if res_col and not (r_ and 0 < q <= len(s) and s[q - 1] == r_):
                    continue
                rows.append((i, a, q, q))
    else:
        seq_col = columns.get('sequence')
        apart = bool(columns.get('sequence_start'))  # the sequence is read elsewhere than at the unit
        s0c, s1c = columns.get('sequence_start', columns['start']), columns.get('sequence_end', columns['end'])
        for i, a, st, en, pep, q0, q1 in zip(
            df.index,
            acc,
            df[columns['start']],
            df[columns['end']],
            df[seq_col].astype(str) if seq_col else [None] * len(df),
            df[s0c],
            df[s1c],
        ):
            st, en = num(st), num(en)
            listed[i] = 1
            if st is None or en is None:
                continue
            st += offset
            if seq_col:
                s = seqs.get(a, '')
                if not s or not pep:
                    continue
                if apart:
                    q0, q1 = num(q0), num(q1)
                    if q0 is None or q1 is None or s[q0 + offset - 1 : q1] != pep:
                        continue
                elif not (st > 0 and s[st - 1 : en] == pep):
                    if not columns.get('relocate'):
                        continue
                    hit = s.find(pep)
                    if hit < 0 or s.find(pep, hit + 1) >= 0:
                        continue
                    st, en = hit + 1, hit + len(pep)
            rows.append((i, a, st, en))
    out = pd.DataFrame(rows, columns=['row', 'accession', 'start', 'end'])
    if columns.get('max_length') is not None:
        out = out[out['end'] - out['start'] + 1 <= int(columns['max_length'])]
    if columns.get('max_per_row') is not None:
        cap = int(columns['max_per_row'])
        out = out[out['row'].map(listed).fillna(0) <= cap]
    if columns.get('unique_within'):
        keys = df.loc[out['row'], columns['unique_within']].astype(str).agg('\x1f'.join, axis=1).to_numpy()
        one = (
            pd.Series(list(zip(out['accession'], out['start'])), index=out.index).groupby(keys).transform('nunique')
            == 1
        )
        out = out[one.to_numpy()]
    return out.reset_index(drop=True)


def from_columns(
    path: str | Path, kind: str, columns: dict | list, source: str = '', snapshot: Snapshot | None = None
) -> pd.DataFrame:
    """Units from any table of intervals, by a column mapping (a manifest entry's `columns`): accession and where the
    units are (start and end, or a position, ranges, lettered residues or marked letters: mapped_spans); label, ref,
    subtype, class (optional) name more columns; include/exclude keep rows as a site's marks do; kind, if given, must
    match the kind asked for. A list of mappings reads several tables side by side in one file (each partner of a
    pair, say), their units together."""
    if isinstance(columns, list):
        parts = [from_columns(path, kind, c, source, snapshot) for c in columns]
        return (
            combine(parts, 'all_of')
            if parts
            else make_units(pd.DataFrame(columns=['accession', 'start', 'end']), kind, source)
        )
    if columns.get('kind') and columns['kind'] != kind:
        raise ValueError(f'{path}: its manifest entry gives units of kind {columns["kind"]!r}, not {kind!r}')
    df = pd.read_csv(path, sep=columns.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False)
    df = select_rows(df, columns, snapshot)
    extra = {k: columns[k] for k in ('label', 'ref', 'subtype', 'class') if columns.get(k)}
    where = [
        columns[k]
        for k in (
            'accession',
            'start',
            'end',
            'position',
            'ranges',
            'residues',
            'marked_in',
            'residue',
            'sequence',
            'gene',
            'sequence_start',
            'sequence_end',
        )
        if columns.get(k)
    ] + list(columns.get('unique_within') or [])
    missing = sorted((set(where) | set(extra.values())) - set(df.columns))
    if missing:
        raise ValueError(f'{path}: the manifest entry names columns the file does not have: {missing}')
    spans = mapped_spans(df, columns, snapshot)
    frame = pd.DataFrame(
        {'accession': spans['accession'].to_numpy(), 'start': spans['start'].to_numpy(), 'end': spans['end'].to_numpy()}
    )
    for k, col in extra.items():
        frame[k] = df.loc[spans['row'], col].to_numpy()
    units = make_units(frame, kind, source or Path(path).name, keep=list(extra))
    for c in DOMAIN_COLUMNS if kind == 'domain' else []:
        if c not in units.columns:
            units[c] = ''
    return units


def residue_values(path: str | Path, columns: dict, snapshot: Snapshot | None = None) -> pd.DataFrame:
    """A per-residue table (accession, position, value) by a column mapping {accession, position, value}; rows without
    a number are dropped. One value per residue: the first row's."""
    df = select_rows(
        pd.read_csv(path, sep=columns.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False),
        columns,
        snapshot,
    )
    missing = sorted({columns[k] for k in ('accession', 'position', 'value')} - set(df.columns))
    if missing:
        raise ValueError(f'{path}: the manifest entry names columns the file does not have: {missing}')
    out = pd.DataFrame(
        {
            'accession': df[columns['accession']].astype(str).str.strip(),
            'position': pd.to_numeric(df[columns['position']], errors='coerce'),
            'value': pd.to_numeric(df[columns['value']], errors='coerce'),
        }
    ).dropna()
    return out.astype({'position': int}).drop_duplicates(['accession', 'position']).reset_index(drop=True)


def listed_residues(path: str | Path, columns: dict) -> pd.DataFrame:
    """The residues a table lists (accession, position), by a column mapping {accession, position}: a residue is listed
    once however many rows name it (a change seen in several tumors, say); rows without a position are dropped."""
    df = pd.read_csv(path, sep=columns.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False)
    for cond in columns.get('include', []):
        df = df[_holds(df, cond)]
    for cond in columns.get('exclude', []):
        df = df[~_holds(df, cond)]
    missing = sorted({columns[k] for k in ('accession', 'position')} - set(df.columns))
    if missing:
        raise ValueError(f'{path}: the manifest entry names columns the file does not have: {missing}')
    out = pd.DataFrame(
        {
            'accession': df[columns['accession']].astype(str).str.strip(),
            'position': pd.to_numeric(df[columns['position']], errors='coerce'),
        }
    ).dropna()
    return out.astype({'position': int}).drop_duplicates().reset_index(drop=True)


@register_reader('unit_table', lambda cols, kind: set(UNIT_COLUMNS) <= cols, 'the unit table of CONTRACTS.md')
def _unit_table(path: Path, kind: str) -> pd.DataFrame:
    units = read_units(path)
    kinds = set(units['kind'])
    if kind in kinds:
        units = units[units['kind'] == kind]
    elif len(kinds) > 1:  # never mix kinds silently
        raise ValueError(
            f'{path}: a unit table of kinds {sorted(kinds)}, none of them {kind!r}: name the kind (with: kind)'
        )
    for c in DOMAIN_COLUMNS if kind == 'domain' else []:
        if c not in units.columns:
            units[c] = ''
    return units.reset_index(drop=True)


register_reader(
    'mobidb',
    lambda cols, kind: kind == 'disordered' and {'canonical_UniProtAC', 'fragment_start', 'fragment_end'} <= cols,
    'MobiDB disordered regions as ptmc stage mobidb writes them',
)(lambda path, kind: mobidb_disorder(path))
register_reader(
    'interpro',
    lambda cols, kind: kind == 'domain' and 'interpro_type' in cols,
    'InterPro domain and repeat intervals as staged',
)(lambda path, kind: interpro_domains(path))


def load(
    path: str | Path, kind: str, columns: dict | list | None = None, snapshot: Snapshot | None = None
) -> pd.DataFrame:
    """Units of a kind from a file: by its column mapping if it has one, else by the first reader that knows it."""
    if columns:
        return from_columns(path, kind, columns, snapshot=snapshot)
    cols = set(pd.read_csv(path, sep='\t', nrows=0).columns)
    for r in READERS:
        if r.detect(cols, kind):
            return r.read(Path(path), kind)
    raise ValueError(
        f'{path}: no reader knows this file for units of kind {kind!r} (readers: {[r.name for r in READERS]}); '
        f'give its manifest entry a column mapping (columns: {{accession, start, end, ...}})'
    )


COMBINE_RULES = ('first_of', 'all_of')


def combine(frames: list[pd.DataFrame], rule: str) -> pd.DataFrame:
    """Units of one kind from several sources, in the order a site lists them.

    first_of  each protein's units from the first source that has any for it: a later source fills only the proteins
              the earlier ones leave without (curated domains first, predicted ones for the rest), so no protein mixes
              two sources' boundaries;
    all_of    every source's units.
    """
    if rule not in COMBINE_RULES:
        raise ValueError(f'unknown rule {rule!r}: use one of {COMBINE_RULES}')
    parts, seen = [], set()
    for f in frames:
        parts.append(f[~f['accession'].isin(seen)] if rule == 'first_of' else f)
        seen |= set(f['accession'])
    cols = list(dict.fromkeys(c for f in frames for c in f.columns))
    out = pd.concat([p.reindex(columns=cols) for p in parts], ignore_index=True)
    for c in cols:
        if c not in UNIT_COLUMNS and out[c].dtype == object:
            out[c] = out[c].fillna('')
    return out.sort_values(['accession', 'start', 'end'], kind='stable').reset_index(drop=True)


def merge_spans(spans) -> list[list[int]]:
    """Overlapping 1-based inclusive intervals merged (idrkit.merge_intervals)."""
    out: list[list[int]] = []
    for a, b in sorted(spans):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def idrs(disordered: pd.DataFrame, snapshot: Snapshot, min_len: int = 20) -> pd.DataFrame:
    """IDRs: each protein's disordered units clipped to its sequence, merged where they overlap, of at least min_len
    residues (idrkit.idr_intervals, which the IDR Explorer uses)."""
    rows = []
    for acc, group in disordered.groupby('accession', sort=True):
        if acc not in snapshot:
            continue
        n = snapshot.length(acc)
        clipped = [(max(1, a), min(n, b)) for a, b in zip(group['start'], group['end']) if b >= 1 and a <= n]
        rows += [(acc, a, b) for a, b in merge_spans(clipped) if b - a + 1 >= min_len]
    return make_units(
        pd.DataFrame(rows, columns=['accession', 'start', 'end']),
        'idr',
        f'merged {disordered["source"].iloc[0] if len(disordered) else ""}, >= {min_len} aa',
    )


def by_accession(units: pd.DataFrame) -> dict[str, tuple]:
    """accession -> (starts, ends) arrays, for the layers that place residues against units."""
    out = {}
    for acc, group in units.groupby('accession', sort=False):
        out[acc] = (group['start'].to_numpy(dtype=int), group['end'].to_numpy(dtype=int))
    return out
