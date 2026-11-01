"""The unit table: one row per region of a protein that something is counted in or drawn as.

Columns (CONTRACTS.md, schemas/units.schema.json): unit_id, accession, start, end, kind, source, then any columns of
the unit's own. start and end are 1-based and inclusive. kind is a short word: disordered (a MobiDB region as given),
idr (disordered regions merged and at least 20 residues), domain, flank, segment, site, ... A site is a unit of
length 1, so the same tests and drawings serve residues and regions.

Builders here read the inputs PTM_Pipeline stages (inputs/annotation/). Units made in another repository (MicroDomains'
flanks, the IDR Explorer's charged segments) are written as a unit table there and read with read_units.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd

from .snapshot import Snapshot

UNIT_COLUMNS = ['unit_id', 'accession', 'start', 'end', 'kind', 'source']


def make_units(frame: pd.DataFrame, kind: str, source: str, accession: str = 'accession', start: str = 'start',
               end: str = 'end', keep: Iterable[str] = ()) -> pd.DataFrame:
    """A unit table from any table of intervals: rows without a numeric start and end are dropped."""
    keep = list(keep)
    out = pd.DataFrame({
        'accession': frame[accession].astype(str).str.strip(),
        'start': pd.to_numeric(frame[start], errors='coerce'),
        'end': pd.to_numeric(frame[end], errors='coerce'),
    })
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
    df = pd.read_csv(path, sep='\t', dtype={'accession': str, 'kind': str, 'source': str, 'unit_id': str}, keep_default_na=False)
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
    return make_units(df, 'disordered', f'MobiDB ({Path(path).name})', accession='canonical_UniProtAC',
                      start='fragment_start', end='fragment_end', keep=[c for c in ('mobidb_annotation_key',) if c in df.columns])


# Domain units carry, beside the six contract columns: subtype (domain or repeat), ref (the source's accession),
# label (its name) and members (member-database accessions, if any). The nearest-domain rule and the domain classes
# read only these, so any source that fills them (InterPro, UniProt features, Pfam, a lab's own) serves.
DOMAIN_COLUMNS = ['subtype', 'ref', 'label', 'members']


def interpro_domains(path: str | Path, types: Iterable[str] = ('domain', 'repeat')) -> pd.DataFrame:
    """InterPro intervals as staged (canonical_UniProtAC, fragment_start, fragment_end, interpro_*), of the given
    InterPro types (the release uses domain and repeat)."""
    df = pd.read_csv(path, sep='\t', low_memory=False)
    df = df[df['interpro_type'].astype(str).isin(set(types))].rename(columns={
        'interpro_type': 'subtype', 'interpro_accession': 'ref', 'interpro_name': 'label', 'member_database_accessions': 'members'})
    return make_units(df, 'domain', f'InterPro ({Path(path).name})', accession='canonical_UniProtAC', start='fragment_start',
                      end='fragment_end', keep=DOMAIN_COLUMNS)


def load(path: str | Path, kind: str) -> pd.DataFrame:
    """Units of a kind from a file in any of the formats this package reads: a unit table (the contract), or a staged
    MobiDB or InterPro table."""
    cols = set(pd.read_csv(path, sep='\t', nrows=0).columns)
    if set(UNIT_COLUMNS) <= cols:
        units = read_units(path)
        units = units[units['kind'] == kind] if kind in set(units['kind']) else units
        for c in DOMAIN_COLUMNS if kind == 'domain' else []:
            if c not in units.columns:
                units[c] = ''
        return units.reset_index(drop=True)
    if kind == 'disordered' and {'canonical_UniProtAC', 'fragment_start', 'fragment_end'} <= cols:
        return mobidb_disorder(path)
    if kind == 'domain' and 'interpro_type' in cols:
        return interpro_domains(path)
    raise ValueError(f'{path}: not a unit table, nor a staged MobiDB or InterPro table, for units of kind {kind}')


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
    return make_units(pd.DataFrame(rows, columns=['accession', 'start', 'end']), 'idr', f'merged {disordered["source"].iloc[0] if len(disordered) else ""}, >= {min_len} aa')


def by_accession(units: pd.DataFrame) -> dict[str, tuple]:
    """accession -> (starts, ends) arrays, for the layers that place residues against units."""
    out = {}
    for acc, group in units.groupby('accession', sort=False):
        out[acc] = (group['start'].to_numpy(dtype=int), group['end'].to_numpy(dtype=int))
    return out
