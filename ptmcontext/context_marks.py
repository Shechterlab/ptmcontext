"""Context marks: other modifications shown beside a site's own mark, declared in the site file (`context_marks:`).

Each entry names a manifest input (a table of residues), its key columns, an optional state column and evidence filter,
a color and a citation (CONTRACTS.md, "Context marks"). Nothing here knows a mark by name: `expand` turns the entries into
what the site file would otherwise spell out (an input role, a protein-map row, filter and table entries), `read` reads
one table, `near` finds the context marks within a window of each residue, and `derive` writes the per-mark and
per-protein columns the website shows. They are never part of a statistic, except through a `near_marks` question.
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

DEFAULT_WINDOW = 7
DEFAULT_DROP = ['by-similarity']
ROLE = 'context_{}'
COLUMNS = ('accession', 'position', 'residue', 'state', 'evidence', 'sources')


def entries(site: dict) -> list[dict]:
    return list(site.get('context_marks') or [])


def window(site: dict) -> int:
    return int(((site.get('website') or {}).get('context_window')) or DEFAULT_WINDOW)


def role(entry: dict) -> str:
    return ROLE.format(entry['id'])


def noun(entry: dict) -> str:
    """The mark as a lower-case word inside a sentence ('phosphosite'), unless written with capitals inside."""
    n = entry.get('noun') or entry['label']
    return n if any(c.isupper() for c in n[1:]) else n[:1].lower() + n[1:]


def drop(entry: dict) -> list[str]:
    return list(entry['drop_evidence']) if 'drop_evidence' in entry else DEFAULT_DROP


def problems(site: dict) -> list[str]:
    out, seen = [], set()
    for e in entries(site):
        where = f'context_marks.{e.get("id")}'
        if e.get('id') in seen:
            out.append(f'{where}: two entries with one id')
        seen.add(e.get('id'))
        if not re.fullmatch(r'[a-z][a-z0-9_]*', str(e.get('id', ''))):
            out.append(f'{where}: ids are lower-case letters, digits and _')
        cols = e.get('columns') or {}
        for k in ('accession', 'position'):
            if not cols.get(k):
                out.append(f'{where}: columns needs {k!r}')
        if drop(e) and not cols.get('evidence'):
            out.append(f'{where}: drop_evidence needs columns.evidence (or drop_evidence: [])')
        if site.get('inputs', {}).get(role(e)) not in (None, e['input']):
            out.append(f'{where}: inputs.{role(e)} is already filled')
    return out


def read(entry: dict, path: str | Path, snapshot=None) -> pd.DataFrame:
    """The entry's table: accession, position (int), residue, state, evidence, sources (text, '' where the entry names
    no column), the evidence filter applied; with a snapshot, rows whose residue the snapshot does not have dropped.
    One row per residue and state."""
    cols = entry['columns']
    df = pd.read_csv(path, sep=entry.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False)
    missing = sorted({c for c in (cols[k] for k in COLUMNS if cols.get(k))} - set(df.columns))
    if missing:
        raise ValueError(f'context_marks.{entry["id"]}: {Path(path).name} has no column {missing}')
    out = pd.DataFrame({k: (df[cols[k]].astype(str).str.strip() if cols.get(k) else '') for k in COLUMNS})
    out['position'] = pd.to_numeric(out['position'], errors='coerce')
    keep = out['position'].notna() & out['accession'].ne('')
    if drop(entry):
        keep &= ~out['evidence'].isin(drop(entry))
    out = out[keep].astype({'position': int})
    if snapshot is not None and len(out):
        ok = [a in snapshot and snapshot.residue_at(a, p) != '' for a, p in zip(out['accession'], out['position'])]
        out = out[ok]
        if cols.get('residue'):  # a row whose letter differs from the snapshot is dropped, as for unit tables
            out = out[
                [
                    snapshot.residue_at(a, p) == r or r == ''
                    for a, p, r in zip(out['accession'], out['position'], out['residue'])
                ]
            ]
    return out.drop_duplicates(['accession', 'position', 'state']).reset_index(drop=True)


def tables(site: dict, paths: dict, snapshot=None) -> dict[str, pd.DataFrame]:
    """id -> table, for the entries whose input a run has."""
    return {e['id']: read(e, paths[e['input']], snapshot) for e in entries(site) if e['input'] in paths}


def sites_of(table: pd.DataFrame) -> pd.DataFrame:
    """One row per residue: its states, evidences and sources joined with '; '."""
    if table.empty:
        return pd.DataFrame(columns=['accession', 'position', 'residue', 'state', 'evidence', 'sources'])
    j = lambda s: '; '.join(dict.fromkeys(x for x in s if x))  # noqa: E731
    return table.groupby(['accession', 'position'], sort=True, as_index=False).agg(
        residue=('residue', 'first'), state=('state', j), evidence=('evidence', j), sources=('sources', j)
    )


def near(residues: pd.DataFrame, table: pd.DataFrame, w: int) -> pd.DataFrame:
    """For each (accession, position) row of residues (in order): the context marks within w residues of it on either
    side, the residue itself left out. Columns: n, nearest (the smallest distance, -1 for none) and hits (a list of
    (position, signed distance), nearest first; the sign is that of mark minus residue)."""
    by = {a: g['position'].to_numpy() for a, g in sites_of(table).groupby('accession')}
    n, nearest, hits = [], [], []
    for a, p in zip(residues['accession'], residues['position'].astype(int)):
        ps = by.get(a)
        found = []
        if ps is not None:
            found = sorted(
                ((int(q), int(q) - p) for q in ps if q != p and abs(int(q) - p) <= w), key=lambda t: (abs(t[1]), t[1])
            )
        n.append(len(found))
        nearest.append(abs(found[0][1]) if found else -1)
        hits.append(found)
    return pd.DataFrame({'n': n, 'nearest': nearest, 'hits': hits}, index=residues.index)


def signed(d: int) -> str:
    return f'+{d}' if d > 0 else f'−{abs(d)}'


# ---- what the site file would otherwise spell out ------------------------------------------------------------------


def map_row(entry: dict, after: str) -> dict:
    cols = entry['columns']
    parts = [f'{{{cols[k]}}}' for k in ('state', 'evidence', 'sources') if cols.get(k)]
    row = {
        'id': 'ctx_' + entry['id'],
        'title': entry['label'],
        'help': entry.get('help')
        or f"{entry['label']} positions from the site's {entry['input']} input; hover a tick for its source and evidence",
        'after': after,
        'from': {
            'role': role(entry),
            'columns': {
                'accession': cols['accession'],
                'position': cols['position'],
                'label': ' · '.join(parts) if parts else entry['label'],
                **({'sources': cols['sources']} if cols.get('sources') else {}),
            },
            **({'exclude': [{'column': cols['evidence'], 'in': drop(entry)}]} if drop(entry) else {}),
        },
        'mark': 'tick',
        'labels': 'marks',
        'key': entry['label'],
        'colour': entry['colour'],
        'colour_dark': entry.get('colour_dark', entry['colour']),
        'default': entry.get('default', 'on'),
    }
    return row


def attribute_names(entry: dict) -> dict[str, str]:
    return {'near': f'ctx_near_{entry["id"]}', 'count': f'ctx_n_{entry["id"]}'}


def specs(site: dict) -> tuple[dict, dict]:
    """(mark attributes, protein attributes) the run derives from the entries (names without the a. and p. prefixes)."""
    w, marks, prots = window(site), {}, {}
    if not entries(site):
        return marks, prots
    marks['ctx_near'] = {
        'label': 'Other marks nearby',
        'kind': 'list',
        'separator': '; ',
        'help': f'Other modifications within ±{w} residues of the site, with the distance in residues '
        f'(minus: toward the N terminus). Context only: from ' + ', '.join(e['label'] for e in entries(site)),
        'derived': True,
    }
    for e in entries(site):
        a = attribute_names(e)
        marks[a['near']] = {
            'label': f'Has a {noun(e)} within ±{w}',
            'kind': 'category',
            'values': {'yes': f'{e["label"]} within ±{w}', 'no': f'None within ±{w}'},
            'filter': True,
            'help': f'{e["label"]} (from {e["citation"].get("short", e["label"])}) within {w} residues of the site on either side',
            'derived': True,
        }
        prots[a['count']] = {
            'label': e.get('plural') or e['label'] + 's',
            'kind': 'number',
            'help': f'How many {noun(e)}s the protein has (context marks of the site file)',
            'derived': True,
        }
    return marks, prots


def expand(site: dict) -> dict:
    """The site with each entry's input role, map row, filters, table columns and downloads added (all a site file may
    also write by hand). Called by load_site, after the schema check."""
    es = entries(site)
    if not es:
        return site
    bad = problems(site)
    if bad:
        raise ValueError('context_marks: ' + '; '.join(bad))
    inputs = site.setdefault('inputs', {})
    web = site.setdefault('website', {})
    mmap = web.setdefault('protein', {}).setdefault('map', {})
    srcs = mmap.setdefault('sources', {})
    after = web.get('context_after', 'ptm')
    rows = mmap.setdefault('rows', [])
    for e in es:
        inputs[role(e)] = e['input']
        rows.append(map_row(e, after))
        if e.get('replaces_ptm_kinds'):
            mmap['hide_ptm_kinds'] = [*mmap.get('hide_ptm_kinds', []), *e['replaces_ptm_kinds']]
        after = 'ctx_' + e['id']
        for name, c in (e.get('sources') or {}).items():
            srcs.setdefault(name, dict(c))
    marks, prots = specs(site)
    # the Filters panel: one group, only where the site lists groups itself
    if web.get('filters') is not None:
        web['filters'].append(
            {
                'name': web.get('context_group', 'Other marks'),
                'attributes': [n for n in marks if marks[n].get('filter')],
            }
        )
    sites = web.setdefault('sites', {})
    if isinstance(sites.get('table'), list):
        sites['table'].append(
            {
                'id': 'ctx_near',
                'label': 'Nearby marks',
                'menu': 'Nearby marks (other modifications)',
                'attribute': 'ctx_near',
                'default': False,
                'help': marks['ctx_near']['help'],
            }
        )
    pcols = (web.get('proteins') or {}).get('columns')
    if isinstance(pcols, list):
        for e in es:
            n = attribute_names(e)['count']
            pcols.append(
                {
                    'id': n,
                    'label': prots[n]['label'],
                    'attribute': n,
                    'default': False,
                    'hide': 'sm',
                    'help': prots[n]['help'],
                }
            )
    dl = (web.get('proteins') or {}).get('download')
    if isinstance(dl, list):
        for e in es:
            n = attribute_names(e)['count']
            dl.append({'name': f'{e["id"]}_sites', 'attribute': n})
    card = (web.get('protein') or {}).get('card')
    if isinstance(card, dict):  # the card lists the marks nearby in one row; the yes/no filters repeat it
        card['hide'] = [*card.get('hide', []), *[attribute_names(e)['near'] for e in es]]
    sdl = sites.get('download')
    if isinstance(sdl, list):
        sdl.append({'name': 'other_marks_nearby', 'attribute': 'ctx_near'})
        for e in es:
            sdl.append({'name': f'{e["id"]}_within_{window(site)}', 'attribute': attribute_names(e)['near']})
    return site


# ---- the run's derived columns --------------------------------------------------------------------------------------


def derive(
    site: dict, ctx_tables: dict[str, pd.DataFrame], marked: pd.DataFrame, accessions
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(per-mark columns 'a.<name>', per-protein columns 'p.<name>') keyed by accession (and position)."""
    w = window(site)
    m = marked[['accession', 'position']].reset_index(drop=True)
    a = m.copy()
    kept = [e for e in entries(site) if e['id'] in ctx_tables]
    hits = {e['id']: near(m, ctx_tables[e['id']], w) for e in kept}
    for e in kept:
        a[f'a.{attribute_names(e)["near"]}'] = ['yes' if n else 'no' for n in hits[e['id']]['n']]
    letters = {}
    for e in kept:
        c = sites_of(ctx_tables[e['id']])
        letters[e['id']] = dict(zip(zip(c['accession'], c['position']), c['residue']))
    tokens = []
    for i, acc in enumerate(m['accession']):
        t = []
        for e in kept:
            for pos, d in hits[e['id']].at[i, 'hits']:
                t.append((abs(d), d, f'{e["label"]} {letters[e["id"]].get((acc, pos), "")}{pos} ({signed(d)})'))
        tokens.append('; '.join(x[2] for x in sorted(t)))
    a['a.ctx_near'] = tokens
    p = pd.DataFrame({'accession': sorted(accessions)})
    for e in kept:
        cnt = sites_of(ctx_tables[e['id']]).groupby('accession').size()
        p[f'p.{attribute_names(e)["count"]}'] = [str(int(cnt.get(x, 0))) for x in p['accession']]
    return a, p


def register(site: dict, folder: Path, log=print) -> None:
    """Register the derived attributes among the site's own, for the columns the run wrote (the web build never
    changes a run's output; a run made before the entries existed is told to be run again)."""
    marks, prots = specs(site)
    if not marks:
        return

    def head(name):
        f = Path(folder) / name
        return f.open().readline().rstrip('\n').split('\t') if f.exists() else []

    have = head('marks.tsv')
    got = {n: s for n, s in marks.items() if f'a.{n}' in have}
    if len(got) < len(marks):
        log('  context_marks: the run has no such columns in marks.tsv; run the site again to add them')
    site['marks'].setdefault('attributes', {}).update(got)
    ph = head('protein_attributes.tsv')
    pgot = {n: s for n, s in prots.items() if f'p.{n}' in ph}
    if pgot:
        site.setdefault('proteins', {}).setdefault('attributes', {}).update(pgot)
