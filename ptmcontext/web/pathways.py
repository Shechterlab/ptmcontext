"""The pathway view's data (website.front.pathways): for every set a pathway question tests, one small file,
data/pathways/<set>.json, read only when a reader opens that pathway (kit-pathway.js). It holds the pathway's name, every
protein of it (accession and, for those the site has no methylation for, the gene) and its sub-pathways as lists of
those proteins, from the site's own hierarchy table and set-membership table; nothing is asked of the source's service.

    {id, name, top, n, acc: [accession], gene: [symbol, or '' for a protein of the site's own list],
     groups: [{id, name, m: [index into acc]}]}

`n` is the proteins of the pathway; a pathway with no sub-pathway with proteins is one group, itself. A top-level pathway
(one with no parent) is marked `top`: the page ranks its groups by the methylated proteins of the selection."""
from __future__ import annotations

import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

from ..snapshot import md5_file, parse_fasta_headers

DIR = 'data/pathways'


def file_name(set_id: str) -> str:
    """The file of a set: its id with anything but letters, digits and . _ - replaced (kit-pathway.js does the same)."""
    return re.sub(r'[^A-Za-z0-9._-]', '_', str(set_id)) + '.json'


def _path(site: dict, run: dict, ref: str, log) -> Path | None:
    """The file of a role (website.front.pathways names roles of the site's inputs, as its analyses do)."""
    name = (site.get('inputs') or {}).get(ref)
    if not isinstance(name, str):
        log(f'  pathway view: {ref} is not a role of one file; left out')
        return None
    rec = (run.get('inputs') or {}).get(name)
    f = Path(rec['file']) if rec else None
    if f is None or not f.exists() or md5_file(f) != rec.get('md5'):
        log(f'  pathway view: {ref} ({name}) is missing or changed since the run; left out')
        return None
    return f


def build(site: dict, run: dict, kept: dict, listing: list, fasta: Path, out: Path, log=print) -> list[dict]:
    """Write the pathway files of every `website.front.pathways` entry; give the page what it reads to find them:
    [{analyses, dir, source: {name, version, licence, link, url}}] (an entry whose inputs are missing is left out)."""
    import pandas as pd
    cfgs = (((site.get('website') or {}).get('front') or {}).get('pathways')) or []
    folder = out / DIR
    shutil.rmtree(folder, ignore_errors=True)
    if not cfgs:
        return []
    genes = {r[0]: r[1] for r in listing}
    names: dict[str, str] | None = None
    result = []
    for cfg in cfgs:
        h, m = cfg['hierarchy'], cfg['members']
        hf, mf = _path(site, run, h['input'], log), _path(site, run, m['input'], log)
        if not hf or not mf:
            continue
        tested = set()
        for aid in cfg['analyses']:
            tested |= set((kept.get(aid) or {}).get('sets', {}))
        ht = pd.read_csv(hf, sep=h.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False)
        sep = h.get('separator', ';')
        kids, parents = defaultdict(list), {}
        for s, ps in zip(ht[h['set']].str.strip(), ht[h['parents']]):
            ps = [x.strip() for x in ps.split(sep) if x.strip()]
            parents[s] = ps
            for p in ps:
                kids[p].append(s)
        title = dict(zip(ht[h['set']].str.strip(), ht[h.get('name', h['set'])]))
        mt = pd.read_csv(mf, sep=m.get('sep', '\t'), dtype=str, keep_default_na=False, low_memory=False)
        members: dict[str, set] = defaultdict(set)
        for s, p in zip(mt[m['set']].str.strip(), mt[m['protein']].str.strip()):
            members[s].add(p)
        todo = [s for s in tested if s in title]
        if names is None and todo:
            names = {a: v.get('gene', '') for a, v in parse_fasta_headers(fasta).items()} if fasta.exists() else {}
        folder.mkdir(parents=True, exist_ok=True)
        for sid in todo:
            groups = [c for c in kids.get(sid, []) if members.get(c)] or [sid]
            accs = sorted(set().union(*(members[g] for g in groups)) | members.get(sid, set()))
            ix = {a: i for i, a in enumerate(accs)}
            d = {'id': sid, 'name': title[sid], 'top': not parents.get(sid), 'n': len(members.get(sid, ())), 'acc': accs,
                 'gene': ['' if a in genes else (names or {}).get(a) or a for a in accs],
                 'groups': [{'id': g, 'name': title.get(g, g), 'm': sorted(ix[a] for a in members.get(g, ()) if a in ix)} for g in groups]}
            (folder / file_name(sid)).write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
        src = dict(cfg.get('source') or {})
        result.append({'analyses': list(cfg['analyses']), 'dir': DIR + '/', 'source': src})
        log(f"  pathway view: {len(todo):,} pathways of {', '.join(cfg['analyses'])}, {sum(f.stat().st_size for f in folder.glob('*.json')) / 1e6:.1f} MB")
    return result
