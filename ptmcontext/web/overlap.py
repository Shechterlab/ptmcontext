"""The Overlap page's data (website.overlap; CONTRACTS.md, 'The Overlap page').

    data/overlap/universe.json   {acc: [every reviewed protein of the snapshot]}
    data/overlap/sets/<aid>.json {set id: [index into acc]}   (one file per protein-set question in terms_from)
    data/overlap/families.json   {readers: [{id, name, ids, note, m: [index]}], enzymes: [{id, name, role, m: [index]}]}

The sets come from the run's overlap_members.json (every protein of each tested set, the ones without a mark too);
reader families from the site's domain annotation (a protein is a reader when it carries any listed Pfam or InterPro
entry); enzymes from the classes of website.search.partners whose role is one of overlap.enzymes.roles (genes, or a
genes_file, matched to the snapshot's primary gene names). Nothing here names a source or a mark."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

DIR = 'data/overlap'
ROLES = ('writer', 'eraser')


def _write(path: Path, value) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, separators=(',', ':'), ensure_ascii=False)
    path.write_text(text)
    return len(text)


def reader_members(cfg: dict, frame) -> dict[str, set]:
    """family name -> the accessions in `frame` (columns: the cfg's accession and ids) with any of the family's ids."""
    cols = cfg.get('columns') or {}
    acc, id_cols = (
        cols.get('accession', 'canonical_UniProtAC'),
        cols.get('ids')
        or [
            'interpro_accession',
            'member_database_accessions',
        ],
    )
    out: dict[str, set] = {}
    for fam in cfg['families']:
        want = set(fam['ids'])
        hit = frame[acc].astype(str).str.strip() == ''  # all False, same index
        for c in id_cols:
            if c in frame.columns:
                hit |= frame[c].astype(str).isin(want)
        out[fam['name']] = set(frame.loc[hit, acc])
    return out


def enzyme_members(classes: dict, roles, genes: dict[str, str], root: Path | None) -> list[dict]:
    """[{id, name, role, members: set}] of the partner classes with one of the roles, resolved to accessions by the
    snapshot's primary gene names (genes: accession -> gene)."""
    from .search import members_file

    by_gene: dict[str, set] = {}
    for a, g in genes.items():
        if g:
            by_gene.setdefault(g.upper(), set()).add(a)
    out = []
    for code, c in classes.items():
        if not isinstance(c, dict) or c.get('role') not in roles:
            continue
        names = {str(g).upper() for g in c.get('genes') or []} | members_file(root, c)
        mem = {a for n in names for a in by_gene.get(n, ())} | {a for a in genes if a.upper() in names}
        out.append({'id': code, 'name': c['label'], 'role': c['role'], 'members': mem})
    return out


def build(site: dict, run: dict, folder: Path, listing: list, fasta: Path, out: Path, log=print) -> dict:
    """Write the Overlap page's files; return what the page reads to find them (D.overlap), or {} when the site has no
    overlap block."""
    import pandas as pd

    from ..snapshot import parse_fasta_headers
    from .search import _paths

    web = site.get('website') or {}
    cfg = web.get('overlap')
    target = out / DIR
    shutil.rmtree(target, ignore_errors=True)
    if not cfg:
        return {}
    units = list(cfg.get('units') or ['proteins', 'sites'])
    page = {
        'terms_from': list(cfg.get('terms_from') or []),
        'max_terms': int(cfg.get('max_terms', 4)),
        'units': [],
        'dir': DIR + '/',
    }
    members = folder / 'overlap_members.json'
    uni: list[str] = []
    if members.exists():
        raw = json.loads(members.read_text())
        uni = raw['universe']
        _write(target / 'universe.json', {'acc': uni})
        leave = cfg.get('leave_out') or {}
        for aid, sets in raw['sets'].items():
            sets = {k: v for k, v in sets.items() if k not in leave.get(aid, ())}
            _write(target / 'sets' / f'{aid}.json', sets)
        page['sets'] = sorted(raw['sets'])
        log(f'  overlap: {len(uni):,} proteins, {len(raw["sets"])} questions of sets')
    elif any(
        a.get('test') == 'protein_sets' and a['id'] in page['terms_from'] and not a['sets'].get('each')
        for a in site.get('analyses', [])
    ):
        log('  overlap: run again (ptmc run) to write the sets of every protein; proteins without a mark are left out')
    ix = {a: i for i, a in enumerate(uni)}
    fams: dict[str, list] = {}
    paths = _paths(run)
    genes = {a: v.get('gene', '') for a, v in parse_fasta_headers(fasta).items()} if fasta.exists() else {}
    rd = cfg.get('readers')
    if rd and 'readers' in units and uni:
        name = (site.get('inputs') or {}).get(rd['source'], rd['source'])
        path = paths.get(name) if isinstance(name, str) else None
        if path is None:
            log(f'  overlap: readers: {rd["source"]} is missing or changed since the run; readers left out')
        else:
            cols = rd.get('columns') or {}
            use = [cols.get('accession', 'canonical_UniProtAC')] + list(
                cols.get('ids') or ['interpro_accession', 'member_database_accessions']
            )
            frame = pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False, usecols=lambda c: c in use)
            found = reader_members(rd, frame)
            fams['readers'] = [
                {
                    'id': f['name'],
                    'name': f['name'],
                    'ids': f['ids'],
                    'note': f.get('note', ''),
                    'm': sorted(ix[a] for a in found[f['name']] if a in ix),
                }
                for f in rd['families']
            ]
    en = cfg.get('enzymes')
    pt = ((web.get('search') or {}).get('partners') or {}).get('classes') or {}
    if en is not None and 'enzymes' in units and uni and pt:
        roles = en.get('roles') or list(ROLES)
        rows = enzyme_members(pt, roles, genes, Path(site.get('__root__', '.')))
        fams['enzymes'] = [
            {'id': r['id'], 'name': r['name'], 'role': r['role'], 'm': sorted(ix[a] for a in r['members'] if a in ix)}
            for r in rows
        ]
    fams = {k: v for k, v in fams.items() if any(f['m'] for f in v)}
    if fams:
        _write(target / 'families.json', fams)
    page['units'] = [u for u in units if u in ('proteins', 'sites') or u in fams]
    if 'proteins' in page['units'] and not uni:
        page['partial'] = True  # no sets of every protein: only the proteins with a mark
    page['families'] = {
        k: [
            {'id': f['id'], 'name': f['name'], 'n': len(f['m']), **({'ids': f['ids']} if 'ids' in f else {})} for f in v
        ]
        for k, v in fams.items()
    }
    page['notes'] = dict(cfg.get('notes') or {})  # a question's note under its terms
    page['leave_out'] = dict(cfg.get('leave_out') or {})
    page['n'] = len(uni)
    page['family_notes'] = {f['id']: f['note'] for f in fams.get('readers', []) if f.get('note')}
    return page
