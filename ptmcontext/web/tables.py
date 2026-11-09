"""The tables the protein pages show (website.tables): each a manifest input in one of the formats of CONTRACTS.md
("Tables the protein pages show"), its columns mapped to the format's by the site file. No test reads them; ptmc web
keeps each protein's rows beside its page (data/e/NN.json), a lookup table whole, and the rows that name a protein
without marks as a partner on that protein's own page (data/u/NN.json).

A format names its key (a site, a protein or a lookup key), the columns it requires and those it may have. A site is
named by one column, '<accession>:<residue><position>' or '<accession>:<position>', or by an accession and a position
column. 'Free' formats (site_values, protein_values, protein_records, site_table, lookup) keep the value columns the site file lists,
under their own names; the blocks that show them name them in the site file.
"""

from __future__ import annotations

import re
from pathlib import Path

FORMATS: dict[str, dict] = {
    'site_values': {'key': 'site', 'free': True},
    'site_table': {'key': 'site', 'free': True},
    'protein_values': {'key': 'accession', 'free': True, 'optional': ['aliases']},
    'lookup': {'key': 'key', 'free': True},
    'site_evidence': {
        'key': 'site',
        'required': ['kind'],
        'optional': ['partner', 'partner_accession', 'ids', 'score', 'detail'],
    },
    'bound_windows': {
        'key': 'site',
        'required': ['window', 'kind'],
        'optional': [
            'type',
            'name',
            'entry',
            'entries',
            'distance',
            'offset',
            'preparation',
            'chain',
            'nucleotides',
            'numbers',
            'distances',
        ],
    },
    'residue_evidence': {'key': 'accession', 'required': ['start', 'end', 'kind'], 'optional': ['source']},
    'site_records': {
        'key': 'site',
        'required': ['group'],
        'partner': 'partner_accession',
        'optional': [
            'partner',
            'partner_name',
            'partner_accession',
            'partner_kind',
            'species',
            'source',
            'id',
            'method',
            'context',
            'state',
            'state_detail',
            'other_marks',
            'pubmed',
            'doi',
            'citation',
            'title',
        ],
    },
    'site_measurements': {
        'key': 'site',
        'required': ['condition', 'call'],
        'optional': ['n', 'n_down', 'n_up', 'value', 'q', 'rule'],
    },
    'source_records': {
        'key': 'site',
        'required': ['source'],
        'optional': [
            'doi',
            'reference',
            'pubmed',
            'source_table',
            'peptide',
            'state',
            'enzyme',
            'sample',
            'detail',
            'reported_accession',
            'reported_position',
            'check',
        ],
    },
    'protein_records': {'key': 'accession', 'free': True, 'open': True},
    'page_rows': {'key': 'none', 'free': True},  # rows of no site or protein (complexes, say): read by a page only
    'protein_partners': {
        'key': 'accession',
        'required': ['partner_accession', 'score'],
        'partner': 'partner_accession',
        'optional': ['partner', 'partner_marked', 'classes'],
    },
}
SITE_ID = re.compile(r'^(.+):[A-Za-z]?(\d+)$')


def key_columns(fmt: str) -> list[str]:
    """The contract columns that name a row's site, protein or key."""
    key = FORMATS[fmt]['key']
    return ['site', 'accession', 'position'] if key == 'site' else [] if key == 'none' else [key]


def problems(name: str, spec: dict) -> list[str]:
    """What a table's spec gets wrong against its format: a format that does not exist, a required column not mapped, a
    mapped column the format does not have, a key it cannot read."""
    fmt = FORMATS.get(spec.get('format'))
    where = f'website.tables.{name}'
    if fmt is None:
        return [f'{where}: no format {spec.get("format")!r} (formats: {sorted(FORMATS)})']
    cols = spec.get('columns') or {}
    out = [
        f'{where}: the {spec["format"]} format needs a column {c!r}' for c in fmt.get('required', []) if c not in cols
    ]
    known = set(fmt.get('required', [])) | set(fmt.get('optional', [])) | set(key_columns(spec['format']))
    if not fmt.get('open'):  # an open format's columns are named by the card that reads them
        out += [f'{where}: the {spec["format"]} format has no column {c!r}' for c in cols if c not in known]
    if fmt['key'] == 'site' and 'site' not in cols and not ('accession' in cols and 'position' in cols):
        out.append(f'{where}: name the site of each row: a site column, or accession and position')
    elif fmt['key'] not in ('site', 'none') and fmt['key'] not in cols:
        out.append(f'{where}: the {spec["format"]} format is keyed by {fmt["key"]!r}: map it')
    if spec.get('values') and not fmt.get('free'):
        out.append(
            f'{where}: values: is for the free formats (site_values, site_table, protein_values, protein_records, lookup)'
        )
    return out


def source_columns(spec: dict) -> list[str]:
    """Every column of the input a table reads."""
    out = []
    for v in (spec.get('columns') or {}).values():
        out += v if isinstance(v, list) else [v]
    out += spec.get('values', []) + [c['column'] for c in spec.get('include', []) + spec.get('exclude', [])]
    return list(dict.fromkeys(out))


def _keep(frame, conds, keep: bool):
    import pandas as pd

    if not conds:
        return frame
    hold = pd.Series(True, index=frame.index)
    for c in conds:
        col = frame[c['column']].astype(str)
        if 'equals' in c:
            m = col == str(c['equals'])
        elif 'in' in c:
            m = col.isin([str(x) for x in c['in']])
        else:
            m = col.str.contains(str(c.get('contains', '')), regex=False)
        hold &= m
    return frame[hold] if keep else frame[~hold]


def read(spec: dict, path: Path):
    """A table in its format: the contract columns (a list-mapped column joined with '; '), then its value columns; with
    'accession' and 'position' (int) for a site-keyed table. Rows the spec's include and exclude conditions drop are gone."""
    import pandas as pd

    fmt = FORMATS[spec['format']]
    cols = spec.get('columns') or {}
    frame = pd.read_csv(
        path,
        sep=spec.get('sep', '\t'),
        dtype=str,
        keep_default_na=False,
        low_memory=False,
        usecols=source_columns(spec),
    )
    for c in spec.get('include', []):  # every include condition holds
        frame = _keep(frame, [c], True)
    for c in spec.get('exclude', []):  # a row any exclude condition holds for is dropped
        frame = _keep(frame, [c], False)
    hide = set(
        spec.get('presence_only') or []
    )  # presence-only values (the site's marks.attributes): their rows never leave the run
    if hide:
        for c in ('kind', 'group'):
            if c in cols and not isinstance(cols[c], list):
                frame = frame[~frame[cols[c]].map(lambda v: bool(hide & set(str(v).split('; '))))]
            elif isinstance(cols.get(c), list):
                frame = frame[
                    ~frame[cols[c]].agg(lambda r: bool(hide & {x for v in r for x in str(v).split('; ')}), axis=1)
                ]
    out = pd.DataFrame(index=frame.index)
    for c, src in cols.items():
        out[c] = (
            frame[src].agg(lambda r: '; '.join(dict.fromkeys(x for v in r for x in str(v).split('; ') if x)), axis=1)
            if isinstance(src, list)
            else frame[src]
        )
    for v in spec.get('values', []):
        out[v] = frame[v]
    for c in ('start', 'end'):  # a stretch's ends are numbers (as a site's position)
        if spec['format'] == 'residue_evidence' and c in out.columns:
            out = out[out[c].str.fullmatch(r'\d+')]
            out[c] = out[c].astype(int)
    if fmt['key'] == 'site':
        if 'site' in cols:
            m = out['site'].str.extract(SITE_ID)
            out['accession'], out['position'] = m[0], m[1]
            out = out.drop(columns=['site'])
        out = out[out['accession'].notna() & out['position'].notna() & (out['position'] != '')]
        out['position'] = out['position'].astype(int)
    return out


def pack(specs: dict, paths: dict, proteins: set, everyone: set, log=print) -> tuple[dict, dict, dict, dict]:
    """(header, per-protein rows of the proteins with marks, rows naming a protein without marks as a partner, lookups).
    header: {table: {format, columns}}, columns as each packed row holds them (a site-keyed row starts with its position);
    rows: {accession: {table: [row, ...]}}; partner rows: {accession: {table: [[partner's accession, row], ...]}}."""
    header, rows, partner, lookups = {}, {}, {}, {}
    for name, spec in specs.items():
        path = paths.get(spec['input'])
        if path is None:
            log(
                f'  website.tables.{name}: input {spec["input"]} is not in the run record (run the site again); left out'
            )
            continue
        fmt = FORMATS[spec['format']]
        if fmt['key'] == 'none':  # a page's rows, not a protein's: the page reads them whole
            continue
        t = read(spec, path)
        if fmt['key'] == 'key':
            lookups[name] = {r['key']: {c: r[c] for c in t.columns if c != 'key'} for r in t.to_dict('records')}
            header[name] = {'format': spec['format'], 'columns': [c for c in t.columns if c != 'key']}
            log(f'  table {name}: {len(lookups[name]):,} rows (lookup)')
            continue
        site_keyed = fmt['key'] == 'site'
        cols = ([] if not site_keyed else ['position']) + [
            c for c in t.columns if c != 'accession' and (c != 'position' or not site_keyed)
        ]
        header[name] = {'format': spec['format'], 'columns': cols}
        kept = t[t['accession'].isin(proteins)]
        for acc, g in kept.groupby('accession', sort=False):
            rows.setdefault(acc, {})[name] = [list(r) for r in g[cols].itertuples(index=False, name=None)]
        n_partner = 0
        if fmt.get('partner') and fmt['partner'] in t.columns:
            others = t[t[fmt['partner']].isin(everyone - proteins)]
            for acc, g in others.groupby(fmt['partner'], sort=False):
                partner.setdefault(acc, {})[name] = [
                    [a, *r] for a, r in zip(g['accession'], g[cols].itertuples(index=False, name=None))
                ]
                n_partner += len(g)
        log(
            f'  table {name}: {len(kept):,} rows on {kept["accession"].nunique():,} proteins'
            + (f', {n_partner:,} naming a protein without marks' if n_partner else '')
        )
    return header, rows, partner, lookups


def dedupe(shard: dict, min_len: int = 8) -> dict:
    """A shard with its repeated strings (min_len characters or more, seen twice or more) written once, in '_s', and
    each place they stood holding their index there. Table values are strings, but a site's position and a stretch's
    start and end, so a number in any other column is such an index (kit-sitecard.js reads them back)."""
    from collections import Counter

    seen: Counter = Counter()

    def walk(rows, skip_first):
        for r in rows:
            for x in r[1:] if skip_first else r:
                if isinstance(x, str) and len(x) >= min_len:
                    seen[x] += 1

    for rec in shard.values():
        for name, rows in (rec.get('tables', rec) if isinstance(rec, dict) else {}).items():
            if isinstance(rows, list):
                walk(rows, False)
    strings = [s for s, n in seen.items() if n > 1]
    if not strings:
        return shard
    index = {s: i for i, s in enumerate(strings)}
    sub = lambda x: index.get(x, x) if isinstance(x, str) else x  # noqa: E731

    def recode(tables):
        return {
            name: [[r[0], *map(sub, r[1:])] if r and not isinstance(r[0], str) else list(map(sub, r)) for r in rows]
            if isinstance(rows, list)
            else rows
            for name, rows in tables.items()
        }

    out = {'_s': strings}
    for acc, rec in shard.items():
        out[acc] = {**rec, 'tables': recode(rec['tables'])} if 'tables' in rec else recode(rec)
    return out


# the blocks of a site card the Sites page draws in its default columns, and the card settings naming the tables each reads
DEFAULT_BLOCKS = ('status', 'tags', 'sequences', 'around', 'calls')


def default_tables(card: dict) -> list[str]:
    """The tables the card blocks of DEFAULT_BLOCKS read (website.protein.card): the partner table of the tags, the bound
    windows' tables, the table of the residues around a site and the tables of the calls."""
    ev = card.get('evidence') or {}
    names = [
        (ev.get('tags') or {}).get('partners'),
        *((ev.get('sequences') or {}).get('tables') or []),
        (ev.get('around') or {}).get('table'),
        *((card.get('calls') or {}).get('tables') or []),
    ]
    return list(dict.fromkeys(n for n in names if n))


def compact_defaults(header: dict, rows: dict, names: list[str], positions: dict) -> dict:
    """One small file for the Sites page's default columns: of each protein, the rows of `names` the blocks read. A table
    keyed by site keeps the rows at the protein's marked positions (`positions`: accession to a set); any other keeps all
    its rows, as the blocks read it by range. Same layout as a shard of data/e, strings written once."""
    names = [n for n in names if n in header]
    out = {}
    for acc, tb in rows.items():
        keep = {}
        for n in names:
            rs = tb.get(n)
            if not rs:
                continue
            cols = header[n]['columns']
            if 'position' in cols:
                k, ok = cols.index('position'), positions.get(acc, set())
                rs = [r for r in rs if r[k] in ok]
            if rs:
                keep[n] = rs
        if keep:
            out[acc] = keep
    return dedupe(out)
