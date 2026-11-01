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


# ---- readers: how a file becomes units -------------------------------------------------------------------------------
# A file is read by, in order: the column mapping its manifest entry gives (`columns`, any layout, no code), else the
# first registered reader that recognises its columns. The package registers the unit table (the contract) and the
# staged MobiDB and InterPro tables; a trusted plugin may register more with register_reader when it loads.

@dataclass(frozen=True)
class Reader:
    name: str
    detect: Callable[[set, str], bool]        # (the file's columns, the kind asked for) -> can it read it
    read: Callable[[Path, str], pd.DataFrame]
    describe: str = ''


READERS: list[Reader] = []


def register_reader(name: str, detect: Callable[[set, str], bool], describe: str = ''):
    """Decorator: a reader for one more file format. Later registrations are tried after earlier ones."""
    def wrap(fn):
        READERS[:] = [r for r in READERS if r.name != name] + [Reader(name, detect, fn, describe)]
        return fn
    return wrap


def _holds(frame: pd.DataFrame, cond: dict) -> pd.Series:
    col = frame[cond['column']].astype(str)
    if 'equals' in cond:
        return col == cond['equals']
    if 'in' in cond:
        return col.isin({str(x) for x in cond['in']})
    return col.str.contains(cond['contains'], regex=False)


def from_columns(path: str | Path, kind: str, columns: dict, source: str = '') -> pd.DataFrame:
    """Units from any table of intervals, by a column mapping (a manifest entry's `columns`):
    {accession, start, end} name its columns; label, ref, subtype, class (optional) name more; include/exclude keep
    rows as a site's marks do ({column, equals | in | contains}); kind, if given, must match the kind asked for."""
    if columns.get('kind') and columns['kind'] != kind:
        raise ValueError(f'{path}: its manifest entry gives units of kind {columns["kind"]!r}, not {kind!r}')
    df = pd.read_csv(path, sep=columns.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False)
    for cond in columns.get('include', []):
        df = df[_holds(df, cond)]
    for cond in columns.get('exclude', []):
        df = df[~_holds(df, cond)]
    extra = {k: columns[k] for k in ('label', 'ref', 'subtype', 'class') if columns.get(k)}
    missing = sorted(({columns[k] for k in ('accession', 'start', 'end')} | set(extra.values())) - set(df.columns))
    if missing:
        raise ValueError(f'{path}: the manifest entry names columns the file does not have: {missing}')
    df = df.rename(columns={v: k for k, v in extra.items()})
    units = make_units(df, kind, source or Path(path).name, accession=columns['accession'], start=columns['start'],
                       end=columns['end'], keep=list(extra))
    for c in DOMAIN_COLUMNS if kind == 'domain' else []:
        if c not in units.columns:
            units[c] = ''
    return units


def residue_values(path: str | Path, columns: dict) -> pd.DataFrame:
    """A per-residue table (accession, position, value) by a column mapping {accession, position, value}; rows without
    a number are dropped. One value per residue: the first row's."""
    df = pd.read_csv(path, sep=columns.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False)
    for cond in columns.get('include', []):
        df = df[_holds(df, cond)]
    for cond in columns.get('exclude', []):
        df = df[~_holds(df, cond)]
    missing = sorted({columns[k] for k in ('accession', 'position', 'value')} - set(df.columns))
    if missing:
        raise ValueError(f'{path}: the manifest entry names columns the file does not have: {missing}')
    out = pd.DataFrame({'accession': df[columns['accession']].astype(str).str.strip(),
                        'position': pd.to_numeric(df[columns['position']], errors='coerce'),
                        'value': pd.to_numeric(df[columns['value']], errors='coerce')}).dropna()
    return out.astype({'position': int}).drop_duplicates(['accession', 'position']).reset_index(drop=True)


def listed_residues(path: str | Path, columns: dict) -> pd.DataFrame:
    """The residues a table lists (accession, position), by a column mapping {accession, position}: a residue is listed
    once however many rows name it (a change seen in several tumours, say); rows without a position are dropped."""
    df = pd.read_csv(path, sep=columns.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False)
    for cond in columns.get('include', []):
        df = df[_holds(df, cond)]
    for cond in columns.get('exclude', []):
        df = df[~_holds(df, cond)]
    missing = sorted({columns[k] for k in ('accession', 'position')} - set(df.columns))
    if missing:
        raise ValueError(f'{path}: the manifest entry names columns the file does not have: {missing}')
    out = pd.DataFrame({'accession': df[columns['accession']].astype(str).str.strip(),
                        'position': pd.to_numeric(df[columns['position']], errors='coerce')}).dropna()
    return out.astype({'position': int}).drop_duplicates().reset_index(drop=True)


@register_reader('unit_table', lambda cols, kind: set(UNIT_COLUMNS) <= cols, 'the unit table of CONTRACTS.md')
def _unit_table(path: Path, kind: str) -> pd.DataFrame:
    units = read_units(path)
    kinds = set(units['kind'])
    if kind in kinds:
        units = units[units['kind'] == kind]
    elif len(kinds) > 1:                                   # never mix kinds silently
        raise ValueError(f'{path}: a unit table of kinds {sorted(kinds)}, none of them {kind!r}: name the kind (with: kind)')
    for c in DOMAIN_COLUMNS if kind == 'domain' else []:
        if c not in units.columns:
            units[c] = ''
    return units.reset_index(drop=True)


register_reader('mobidb', lambda cols, kind: kind == 'disordered' and {'canonical_UniProtAC', 'fragment_start', 'fragment_end'} <= cols,
                'MobiDB disordered regions as ptmc stage mobidb writes them')(lambda path, kind: mobidb_disorder(path))
register_reader('interpro', lambda cols, kind: kind == 'domain' and 'interpro_type' in cols,
                'InterPro domain and repeat intervals as staged')(lambda path, kind: interpro_domains(path))


def load(path: str | Path, kind: str, columns: dict | None = None) -> pd.DataFrame:
    """Units of a kind from a file: by its column mapping if it has one, else by the first reader that knows it."""
    if columns:
        return from_columns(path, kind, columns)
    cols = set(pd.read_csv(path, sep='\t', nrows=0).columns)
    for r in READERS:
        if r.detect(cols, kind):
            return r.read(Path(path), kind)
    raise ValueError(f'{path}: no reader knows this file for units of kind {kind!r} (readers: {[r.name for r in READERS]}); '
                     f'give its manifest entry a column mapping (columns: {{accession, start, end, ...}})')


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
    return make_units(pd.DataFrame(rows, columns=['accession', 'start', 'end']), 'idr', f'merged {disordered["source"].iloc[0] if len(disordered) else ""}, >= {min_len} aa')


def by_accession(units: pd.DataFrame) -> dict[str, tuple]:
    """accession -> (starts, ends) arrays, for the layers that place residues against units."""
    out = {}
    for acc, group in units.groupby('accession', sort=False):
        out[acc] = (group['start'].to_numpy(dtype=int), group['end'].to_numpy(dtype=int))
    return out
