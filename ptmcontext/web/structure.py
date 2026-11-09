"""What the protein page's 3D viewer (assets/kit-3d.js) reads from the site's own tables.

The viewer's structures come live from AlphaFold DB, PDBe and RCSB, as the Methylarginine Site Explorer's did. What a
site knows about its marks in those structures comes from its website.tables (CONTRACTS.md, "Tables the protein pages
show"), named in `website.protein.structure` (CONTRACTS.md, "Structure evidence"):

  contacts   a site_evidence table: the PDB entries (ids) in which a mark touches a partner of a kind
  bound      a bound_windows table: the RNA or DNA a mark touches in an entry, its chain, nucleotides and distances
  predicted  a site_evidence table: predicted complexes with a mark at the interface (partner, model in ids, score)
  residues   a residue_evidence table: runs of residues, for the viewer's colorings, each a list of classes, each class
             the rows its conditions (on the format's columns) keep

The kind codes and words are the site file's; this module knows none of them. Each protein's part goes into its
record in the protein shards (`s3d`), so a page reads it with the protein.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd


PARTNER_KINDS = ('rna', 'dna', 'protein', 'self')  # what the viewer draws a contact as; anything else is "other"


def config(site: dict) -> dict:
    return ((site.get('website') or {}).get('protein') or {}).get('structure') or {}


PARTS = ('contacts', 'bound', 'predicted', 'residues')
FORMAT = {
    'contacts': 'site_evidence',
    'bound': 'bound_windows',
    'predicted': 'site_evidence',
    'residues': 'residue_evidence',
}


def _table(site: dict, part: str) -> dict | None:
    name = (config(site).get(part) or {}).get('table')
    return ((site.get('website') or {}).get('tables') or {}).get(name) if name else None


def roles(site: dict) -> dict[str, str]:
    """The manifest inputs the viewer reads, with what for (the Method page's Data table)."""
    words = {
        'contacts': 'the 3D viewer: PDB entries with a contact at a mark',
        'bound': 'the 3D viewer: the RNA and DNA bound at a mark',
        'predicted': 'the 3D viewer: predicted complexes at a mark',
        'residues': 'the 3D viewer: colors along the chain',
    }
    out: dict[str, list] = {}
    for part in PARTS:
        tb = _table(site, part)
        if tb:
            out.setdefault(tb['input'], []).append(words[part])
    return {n: '; '.join(w) for n, w in out.items()}


def problems(site: dict) -> list[str]:
    """What website.protein.structure names that the site file does not have (ptmc check)."""
    cfg, tables, out = config(site), (site.get('website') or {}).get('tables') or {}, []
    for part in PARTS:
        if not cfg.get(part):
            continue
        name = cfg[part]['table']
        if name not in tables:
            out.append(f'website.protein.structure.{part}: no table {name!r} in website.tables')
        elif tables[name].get('format') != FORMAT[part]:
            out.append(
                f'website.protein.structure.{part}: table {name!r} is {tables[name].get("format")!r}; the viewer reads a {FORMAT[part]} table here'
            )
    for c in (cfg.get('residues') or {}).get('colourings', []):
        ids = [k['id'] for k in c['classes']]
        for k in c['classes']:
            bad = [x for x in k.get('all', []) if x not in ids or x == k['id']]
            if bad:
                out.append(
                    f'website.protein.structure.residues, coloring {c["id"]!r}, class {k["id"]!r}: all names {bad}, not other classes of it'
                )
            if not k.get('where') and not k.get('all'):
                out.append(
                    f'website.protein.structure.residues, coloring {c["id"]!r}, class {k["id"]!r}: give where (the rows it keeps) or all'
                )
    return out


def site_data(site: dict, profile) -> dict | None:
    """The viewer's words and choices for the page: the mark's chemical components in PDB entries (from the profile's
    states), the colorings and their classes, and which manifest inputs each part comes from."""
    cfg = config(site)
    states = [s for s in profile.data.get('states', []) if s.get('pdb_component')]
    out = {
        'components': [{'code': s['pdb_component'], 'state': s['code'], 'label': s.get('label', '')} for s in states]
    }
    out['inputs'] = {part: [_table(site, part)['input']] for part in PARTS if cfg.get(part) and _table(site, part)}
    for key in ('contacts', 'bound', 'predicted'):
        if cfg.get(key):
            out[key] = {k: cfg[key][k] for k in ('label', 'help') if k in cfg[key]}
    if cfg.get('residues'):
        out['colourings'] = [
            {
                'id': c['id'],
                'label': c['label'],
                'none': c.get('none', ''),
                'help': c.get('help', ''),
                'classes': [{k: v for k, v in x.items() if k != 'where'} for x in c['classes']],
            }
            for c in cfg['residues'].get('colourings', [])
        ]
    return out


def _holds(frame: pd.DataFrame, cond: dict) -> pd.Series:
    col = frame[cond['column']].astype(str)
    if 'equals' in cond:
        return col == cond['equals']
    if 'in' in cond:
        return col.isin(set(cond['in']))
    return col.str.contains(cond['contains'], regex=False)


def _keep(frame: pd.DataFrame, spec: dict) -> pd.DataFrame:
    keep = pd.Series(True, index=frame.index)
    for cond in spec.get('include', []):
        keep &= _holds(frame, cond)
    for cond in spec.get('exclude', []):
        keep &= ~_holds(frame, cond)
    return frame[keep]


def _split(v, sep: str = '; ') -> list[str]:
    return [x.strip() for x in str(v if v is not None else '').split(sep) if x.strip()]


def _num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if x != x else (int(x) if x.is_integer() else round(x, 3))


def protein_parts(site: dict, paths: dict[str, Path], accessions: set[str]) -> dict[str, dict]:
    """Each protein's part of the viewer's tables (`s3d` of its record), for the proteins with a mark:
      c  contacts   [position, kind, [entries], partner, partner accession]
      b  bound      [position, entry, chain, kind, type, molecule, [nucleotides], [author numbers], [distances], window]
      p  predicted  [position, partner, partner accession, source, model, score, distance]
      r  residues   {colouring: [[class index, start, end], ...]}
    Each table is read in its format (tables.read); paths: the run's input files by manifest name."""
    from . import tables as T

    cfg = config(site)
    out: dict[str, dict] = {}
    put = lambda acc, key: out.setdefault(acc, {}).setdefault(key, [])  # noqa: E731
    col = lambda r, c: (  # noqa: E731
        '' if r.get(c) is None or (isinstance(r.get(c), float) and r.get(c) != r.get(c)) else str(r.get(c))
    )  # noqa: E731

    def frame(part):
        tb = _table(site, part)
        f = T.read(tb, paths[tb['input']])
        f = _keep(f, cfg[part])
        key = 'accession'
        return f[f[key].astype(str).isin(accessions)]

    if cfg.get('contacts'):
        kinds = cfg['contacts'].get('kinds') or {}
        for r in frame('contacts').to_dict('records'):
            kind = str(kinds.get(r['kind'], r['kind'])).lower()
            put(r['accession'], 'c').append(
                [
                    int(r['position']),
                    kind if kind in PARTNER_KINDS else 'other',
                    [e.lower() for e in _split(col(r, 'ids'))],
                    col(r, 'partner'),
                    col(r, 'partner_accession'),
                ]
            )
    if cfg.get('bound'):
        kinds = cfg['bound'].get('kinds') or {}
        for r in frame('bound').to_dict('records'):
            put(r['accession'], 'b').append(
                [
                    int(r['position']),
                    col(r, 'entry').lower(),
                    col(r, 'chain'),
                    str(kinds.get(r['kind'], r['kind'])).lower(),
                    col(r, 'type'),
                    col(r, 'name'),
                    _split(col(r, 'nucleotides')),
                    [_num(x) for x in _split(col(r, 'numbers'))],
                    [_num(x) for x in _split(col(r, 'distances'))],
                    col(r, 'window'),
                ]
            )
    if cfg.get('predicted'):
        for r in frame('predicted').to_dict('records'):
            model = (_split(col(r, 'ids')) or [''])[0]
            put(r['accession'], 'p').append(
                [
                    int(r['position']),
                    col(r, 'partner'),
                    col(r, 'partner_accession'),
                    col(r, 'source'),
                    model,
                    _num(col(r, 'score')),
                    None,
                ]
            )
    if cfg.get('residues'):
        f = frame('residues')
        for c in cfg['residues'].get('colourings', []):
            for k, cls in enumerate(c['classes']):
                if not cls.get('where'):
                    continue  # a class made of other classes (all:) is drawn by the page
                g = f
                for cond in cls['where']:
                    g = g[_holds(g, cond)]
                for acc, a, b in sorted(
                    set(zip(g['accession'].astype(str), g['start'].astype(int), g['end'].astype(int)))
                ):
                    out.setdefault(acc, {}).setdefault('r', {}).setdefault(c['id'], []).append([k, a, b])
    return out


def add(site: dict, run: dict, shards: dict[int, dict], log=print) -> None:
    """Each protein's part of the viewer's tables into its record (rec['s3d']), from the files the run read."""
    cfg = config(site)
    if not cfg or not shards:
        return
    paths = {n: Path(v['file']) for n, v in (run.get('inputs') or {}).items()}
    need = {_table(site, part)['input'] for part in PARTS if cfg.get(part) and _table(site, part)}
    missing = sorted(n for n in need if n not in paths or not paths[n].exists())
    if missing:
        log(f'  3D viewer: the run did not read {missing}; run the site again (ptmc run) to show its tables')
        return
    recs = {acc: rec for sh in shards.values() for acc, rec in sh.items()}
    parts = protein_parts(site, paths, set(recs))
    for acc, part in parts.items():
        recs[acc]['s3d'] = part
    n = {k: sum(len(p.get(k, [])) for p in parts.values()) for k in ('c', 'b', 'p')}
    log(
        f'  3D viewer: {len(parts):,} proteins with structure evidence ({n["c"]:,} contact rows, {n["b"]:,} bound RNA/DNA, {n["p"]:,} predicted)'
    )
