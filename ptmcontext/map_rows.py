"""Rows of the protein map that no question tests: a site's own evidence along each protein, drawn from its inputs.

A site file names them under website.protein.map.rows. A row is read from one or more tables (`from`), each a role of
the site's inputs (or the marks table itself, `marks: true`) with a column mapping into the map-row format
(CONTRACTS.md, "Map rows"):

  accession          the protein
  start, end         a region (1-based, inclusive); or position alone, a residue
  class              what the item is: a code the row's `classes` describe (several columns are joined with ':')
  label              its words: a column, or a template naming columns ("{sites} in {window_aa} aa")
  value              a number it carries (a count, a score)
  ref                an accession of its own (an InterPro entry), linked on the page
  sources            the sources behind it, '; '-separated, each linked to its paper by website.protein.map.sources

so a residue list, a region list and a per-site count are the same format with different columns filled. `split` reads
cells holding lists in step (a site's changes and their counts) as one item each; `include`/`exclude` keep rows, and a
row that lists `classes` keeps only items of those classes. `ptmc run` writes every item on a protein with a mark
(map_items.tsv); `ptmc web` splits them into one file per protein shard, which the map reads when a protein opens. A
row with no item on a protein is not drawn there; a site without rows has none of this.
"""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

ITEM_COLUMNS = ['accession', 'row', 'start', 'end', 'class', 'label', 'value', 'ref', 'sources']
FIELDS = ('accession', 'start', 'end', 'position', 'class', 'label', 'value', 'ref', 'sources')
_FIELD = re.compile(r'\{([^{}:]+)(?::([^{}]*))?\}')


def map_spec(site: dict) -> dict:
    return (((site.get('website') or {}).get('protein') or {}).get('map') or {})


def rows(site: dict) -> list[dict]:
    """The site's map rows, as written."""
    return list(map_spec(site).get('rows') or [])


def input_rows(site: dict) -> list[dict]:
    """The rows read from tables (the others are found in each protein's sequence by the page)."""
    return [r for r in rows(site) if r.get('from')]


def sources_of(row: dict) -> list[dict]:
    """A row's tables, as a list (one table may be written without the list)."""
    f = row.get('from') or []
    return [f] if isinstance(f, dict) else list(f)


def roles_read(site: dict) -> dict[str, list[str]]:
    """role -> the titles of the rows that read it (the marks table is not a role)."""
    out: dict[str, list[str]] = {}
    for r in input_rows(site):
        for f in sources_of(r):
            if f.get('role'):
                out.setdefault(f['role'], []).append(r.get('title', r['id']))
    return out


def template_fields(text: str) -> list[str]:
    return [m.group(1) for m in _FIELD.finditer(str(text))]


def named_columns(f: dict) -> set[str]:
    """Every column of its table a mapping names: its fields, the columns of its label template, its conditions."""
    cols = f.get('columns') or {}
    out = set()
    for k in FIELDS:
        v = cols.get(k)
        if not v:
            continue
        if k == 'label' and '{' in str(v):
            out |= set(template_fields(v))
        elif isinstance(v, list):
            out |= set(v)
        else:
            out.add(v)
    out |= {c['column'] for c in (f.get('include') or []) + (f.get('exclude') or [])}
    out |= set((f.get('values') or {}))
    return out


def _holds(frame: pd.DataFrame, cond: dict) -> pd.Series:
    col = frame[cond['column']].astype(str)
    if 'equals' in cond:
        return col == str(cond['equals'])
    if 'in' in cond:
        return col.isin({str(x) for x in cond['in']})
    return col.str.contains(str(cond['contains']), regex=False)


def _fmt(value: str, spec: str | None) -> str:
    if not spec:
        return value
    try:
        return format(float(value), spec)
    except ValueError:
        return value


def _template(text: str, frame: pd.DataFrame) -> pd.Series:
    """A label from a template: each {column} (or {column:format}, a number's format) filled from its row."""
    names = template_fields(text)
    if not len(frame):
        return pd.Series([], dtype=str, index=frame.index)
    cols = {n: frame[n].astype(str).tolist() for n in dict.fromkeys(names)}

    def one(i):
        return _FIELD.sub(lambda m: _fmt(cols[m.group(1)][i], m.group(2)), text)
    return pd.Series([one(i) for i in range(len(frame))], index=frame.index)


def _split(frame: pd.DataFrame, fields: list[str], sep: str, where: str) -> pd.DataFrame:
    """Cells holding lists, read in step: each entry one item (a column with one entry is repeated for each)."""
    out = []
    for rec in frame.to_dict('records'):
        parts = {f: (str(rec[f]).split(sep) if str(rec[f]) != '' else ['']) for f in fields}
        n = max(len(v) for v in parts.values()) if parts else 1
        bad = {f: len(v) for f, v in parts.items() if len(v) not in (1, n)}
        if bad:
            raise ValueError(f'{where}: cells split by {sep!r} hold lists of different lengths ({bad}, and {n}) for '
                             f'{rec.get("accession")} {rec.get("start")}')
        for k in range(n):
            out.append({**rec, **{f: (v[k] if len(v) == n else v[0]) for f, v in parts.items()}})
    return pd.DataFrame(out, columns=frame.columns)


def read_items(f: dict, table: pd.DataFrame, row: dict, marks_cols: tuple[str, str] | None = None) -> pd.DataFrame:
    """The items one table gives a row: the map-row format's columns, from its column mapping."""
    cols = dict(f.get('columns') or {})
    where = f"website.protein.map.rows {row.get('id')!r}"
    if f.get('marks') and marks_cols:
        cols.setdefault('accession', marks_cols[0])
        if not cols.get('start'):
            cols.setdefault('position', marks_cols[1])
    df = table
    for cond in f.get('include') or []:
        df = df[_holds(df, cond)]
    for cond in f.get('exclude') or []:
        df = df[~_holds(df, cond)]
    missing = sorted(named_columns({**f, 'columns': cols}) - set(df.columns))
    if missing:
        raise ValueError(f'{where}: the table has no column {missing} (it has {sorted(df.columns)[:30]})')
    if not cols.get('accession') or not (cols.get('position') or (cols.get('start') and cols.get('end'))):
        raise ValueError(f'{where}: a table needs accession, and position or start and end, in its columns')
    df = df.copy()
    for col, words in (f.get('values') or {}).items():          # codes in a column, in words
        sep = f.get('split') or '; '
        df[col] = [sep.join(str(words.get(x, x)) for x in str(v).split(sep)) if v != '' else '' for v in df[col].astype(str)]
    out = pd.DataFrame(index=df.index)
    out['accession'] = df[cols['accession']].astype(str).str.strip()
    a, b = (cols['position'], cols['position']) if cols.get('position') else (cols['start'], cols['end'])
    out['start'], out['end'] = df[a].astype(str), df[b].astype(str)
    cls = cols.get('class')
    out['class'] = (df[cls].astype(str) if isinstance(cls, str) else df[list(cls)].astype(str).agg(':'.join, axis=1)) if cls else ''
    lab = cols.get('label')
    out['label'] = (_template(lab, df) if '{' in str(lab) else df[lab].astype(str)) if lab else ''
    for k in ('value', 'ref', 'sources'):
        out[k] = df[cols[k]].astype(str) if cols.get(k) else ''
    if f.get('split'):
        listed = [k for k in ('class', 'label', 'value', 'ref') if cols.get(k) and not (k == 'label' and '{' in str(lab))]
        out = _split(out, listed, f['split'], where)
    out['start'] = pd.to_numeric(out['start'], errors='coerce')
    out['end'] = pd.to_numeric(out['end'], errors='coerce')
    out = out[out['start'].notna() & out['end'].notna()]
    out = out.astype({'start': int, 'end': int})
    mapped = [k for k in ('class', 'label', 'value', 'ref', 'sources') if cols.get(k)]
    if mapped:                                                 # a row of the table that says nothing here: no item
        out = out[(out[mapped].astype(str) != '').any(axis=1)]
    for keep in (f.get('classes'), row.get('classes')):        # the table's own classes, then the row's
        if keep:
            out = out[out['class'].isin(set(keep))]
    out['value'] = pd.to_numeric(out['value'], errors='coerce')
    out['row'] = row['id']
    return out[ITEM_COLUMNS]


def without_extents(frame: pd.DataFrame, site: dict) -> pd.DataFrame:
    """The items minus any stretch (start < end) of a presence-only class (marks.attributes.<name>.presence_only): only the
    per-mark flags of such a class are kept."""
    from .site import presence_only
    hide = presence_only(site)
    if not hide or frame.empty:
        return frame
    cls = frame['class'].astype(str).map(lambda c: bool(hide & set(c.split(':'))))
    return frame[~(cls & (frame['start'].astype(int) != frame['end'].astype(int)))]


def items(site: dict, paths: dict, marks_table: pd.DataFrame, accessions: set, lengths: dict | None = None) -> pd.DataFrame:
    """Every item of every map row on the given proteins (map_items.tsv). paths: role -> (rule, the files that fill
    it, in the site's order; first_of: a protein's items from the first file that has any for it); marks_table: the
    marks as the run read them (with any added table's rows). Items outside a protein's sequence are dropped."""
    marks = site['marks']
    frames, tables = [], {}

    def table(path: Path, sep: str = '\t') -> pd.DataFrame:
        key = (str(path), sep)
        if key not in tables:
            tables[key] = pd.read_csv(path, sep=sep, dtype=str, keep_default_na=False, low_memory=False)
        return tables[key]
    for row in input_rows(site):
        for f in sources_of(row):
            if f.get('marks'):
                got = [read_items(f, marks_table, row, (marks['accession'], marks['position']))]
            else:
                rule, files = paths[f['role']]
                got, seen = [], set()
                for p in files:
                    one = read_items(f, table(p, f.get('sep', '\t')), row)
                    if rule == 'first_of':
                        one = one[~one['accession'].isin(seen)]
                        seen |= set(one['accession'])
                    got.append(one)
            frames += [g[g['accession'].isin(accessions)] for g in got]
    if not frames:
        return pd.DataFrame(columns=ITEM_COLUMNS)
    out = pd.concat(frames, ignore_index=True)
    if lengths:
        n = out['accession'].map(lengths)
        out = out[(out['start'] >= 1) & (out['start'] <= out['end']) & (out['end'] <= n.fillna(0))]
    out = without_extents(out, site)
    out = out.drop_duplicates()
    out['value'] = [('' if pd.isna(v) else f'{v:.0f}' if float(v).is_integer() else f'{v:.6g}') for v in out['value']]
    order = {r['id']: k for k, r in enumerate(input_rows(site))}
    return out.assign(_o=out['row'].map(order)).sort_values(['accession', '_o', 'start', 'end'], kind='stable').drop(columns='_o').reset_index(drop=True)


def problems(site: dict) -> list[str]:
    """What the map block names that the site file does not have (ptmc check): a row's role, a color mode's attribute."""
    spec, out = map_spec(site), []
    roles = set(site.get('inputs') or {})
    attrs = {**((site.get('marks') or {}).get('attributes') or {}),     # a variant's marks may carry more
             **{k: a for v in (site.get('variants') or {}).values() for k, a in (v.get('attributes') or {}).items()}}
    ids = [r['id'] for r in rows(site)]
    out += [f"website.protein.map.rows: the id {i!r} is used twice" for i in sorted({i for i in ids if ids.count(i) > 1})]
    for r in rows(site):
        where = f"website.protein.map.rows {r['id']!r}"
        if bool(r.get('from')) == bool(r.get('sequence')):
            out.append(f'{where}: give it either from: (tables) or sequence: (a motif found in the sequence)')
        for f in sources_of(r):
            if not f.get('marks') and f.get('role') not in roles:
                out.append(f"{where}: reads role {f.get('role')!r}, which inputs: does not fill (or give marks: true for the marks table)")
            if f.get('marks') and f.get('role'):
                out.append(f'{where}: a table is either marks: true or a role, not both')
        for c in (r.get('classes') or {}):
            if not isinstance(r['classes'][c], dict):
                out.append(f'{where}: class {c!r} needs its words ({{label: ...}})')
        if r.get('sequence'):
            for k in ('motif', 'min'):
                if k not in r['sequence']:
                    out.append(f'{where}: sequence: needs {k}')
            try:
                re.compile(r['sequence'].get('motif', ''))
                re.compile((r['sequence'].get('strong') or {}).get('motif', ''))
            except re.error as e:
                out.append(f'{where}: its motif is not a regular expression ({e})')
    for cond in spec.get('hatch') or []:
        if cond.get('attribute') not in attrs:
            out.append(f"website.protein.map.hatch: no attribute {cond.get('attribute')!r} in marks.attributes (or a variant's)")
    for m in spec.get('colour_by') or []:
        if isinstance(m, str):
            if m not in attrs:
                out.append(f'website.protein.map.colour_by: no attribute {m!r} in marks.attributes')
            continue
        for k, c in enumerate(list(m.get('classes') or [])):
            for cond in c.get('when') or []:
                if cond.get('attribute') not in attrs:
                    out.append(f"website.protein.map.colour_by {m.get('id')!r}, class {k + 1}: no attribute {cond.get('attribute')!r} in marks.attributes")
                if 'matches' in cond:
                    try:
                        re.compile(cond['matches'])
                    except re.error as e:
                        out.append(f"website.protein.map.colour_by {m.get('id')!r}: {cond['matches']!r} is not a regular expression ({e})")
    return out


def mapping_problems(site: dict, files: dict[str, list[Path]], marks_path: Path | None) -> list[str]:
    """Columns a row's mapping names that its table does not have, read from the tables' headers."""
    out = []
    for r in input_rows(site):
        for f in sources_of(r):
            paths = [marks_path] if f.get('marks') else files.get(f.get('role'), [])
            want = named_columns(f)
            if f.get('marks'):
                want |= {site['marks']['accession'], site['marks']['position']} - {None}
            for p in paths:
                if p is None or not Path(p).exists():
                    continue
                have = set(pd.read_csv(p, sep=f.get('sep', '\t'), nrows=0).columns)
                if want - have:
                    out.append(f"website.protein.map.rows {r['id']!r}: {Path(p).name} has no column {sorted(want - have)}")
    return out
