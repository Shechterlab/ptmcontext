"""The term index of the search box (kit-terms.js): every protein set and ontology term a reader may type by name or id.

    data/search/terms.json  {sources: [{id, kind, title, group, key, shards?}], terms: [[source, id, name, n, synonyms?]]}

Two kinds of source, both from data the site already ships:
- `set`: each protein-set question's sets (Reactome, PANTHER, disease families and ontology, condensates, cell
  compartments, ...), by the set's label; choosing one is that question's set filter (p:<question>).
- `term`: each website.overlap.term_sources source (GO biological process); choosing one is the term filter
  (g:<source>), whose members are read from the Overlap page's own files when it is applied.
`n` is the number of proteins with a mark in the term, as the filter would keep them; a term with none is left out. A name
is left empty when it is the id. A family written "A / B / C" is also found by each part. The page reads the file when the
search box is first used. No source or mark is named here: the headings come from website.overlap.groups, else the
question's own title."""

from __future__ import annotations

import json
from pathlib import Path

FILE = 'data/search/terms.json'


def _group_of(cfg: dict) -> dict[str, str]:
    """source or question id -> the heading of the overlap picker's group that lists it."""
    return {i: g['name'] for g in cfg.get('groups') or [] for i in g.get('from') or []}


def _parts(name: str) -> list[str]:
    parts = [p.strip() for p in name.split(' / ')]
    return [p for p in parts if p and p != name] if len(parts) > 1 else []


def set_terms(analysis: dict, ps: dict) -> list[list]:
    """[id, name, n, synonyms] of each set of a protein-set question that has a protein with a mark. `ps` is the
    question's selection data (sets, more, and of: identifier -> proteins, for sets of genes)."""
    labels = analysis.get('labels') or {}
    holders: dict[int, list[int]] = {}
    for p, us in (ps.get('of') or {}).items():
        for u in us:
            holders.setdefault(u, []).append(int(p))
    of = bool(ps.get('of'))

    def count(members) -> int:
        return len({p for u in members for p in holders.get(u, ())}) if of else len(set(members))

    rows = [(s, count(m)) for s, _, m in ps.get('sets') or []] + [(s, count(m)) for s, m in ps.get('more') or []]
    out = []
    for s, n in rows:
        if not n:
            continue
        name = str(labels.get(s) or s)
        row = [str(s), '' if name == str(s) else name, n]
        if _parts(name):
            row.append(_parts(name))
        out.append(row)
    return out


def build(analyses: list[dict], sel: dict, listing: list, overlap: dict | None, out: Path, log=print) -> dict:
    """Write the term index; return what the page reads to find it (D.term_index), or {} when there is nothing to find."""
    from .overlap import shard_name

    cfg_groups = _group_of({'groups': (overlap or {}).get('groups') or []})
    sources: list[dict] = []
    terms: list[list] = []
    for a in analyses:
        ps = (sel.get('protein_sets') or {}).get(a['id'])
        if a.get('kind') != 'protein_sets' or not ps:
            continue
        rows = set_terms(a, ps)
        if not rows:
            continue
        sources.append(
            {
                'id': a['id'],
                'kind': 'set',
                'title': a.get('title', a['id']),
                'group': cfg_groups.get(a['id']) or a.get('title', a['id']),
                'key': 'p:' + a['id'],
            }
        )
        terms += [[len(sources) - 1, *r] for r in rows]
    base = out / 'data' / 'overlap'
    if overlap and (base / 'universe.json').exists():
        marked = {listing[m[0]][0] for m in sel.get('marks') or []}
        acc = json.loads((base / 'universe.json').read_text())['acc']
        is_marked = [a in marked for a in acc]
        for src in overlap.get('sources') or []:
            f = base / 'sources' / src['id'] / 'terms.json'
            if not f.exists():
                continue
            shards: dict[str, dict] = {}
            names = json.loads(f.read_text())['terms']
            sources.append(
                {
                    'id': src['id'],
                    'kind': 'term',
                    'title': src.get('title', src['id']),
                    'group': cfg_groups.get(src['id']) or src.get('title', src['id']),
                    'key': 'g:' + src['id'],
                    'shards': int(src.get('shards', 16)),
                }
            )
            kept = 0
            for tid, name, _ in names:
                sh = shard_name(tid, sources[-1]['shards'])
                if sh not in shards:
                    shards[sh] = json.loads((base / 'sources' / src['id'] / sh).read_text())
                n = sum(1 for i in shards[sh].get(tid, ()) if is_marked[i])
                if n:
                    terms.append([len(sources) - 1, tid, '' if name == tid else name, n])
                    kept += 1
            log(f'  term index: {src["id"]}: {kept:,} of {len(names):,} terms hold a protein with a mark')
    if not terms:
        return {}
    target = out / FILE
    target.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps({'sources': sources, 'terms': terms}, separators=(',', ':'), ensure_ascii=False)
    target.write_text(text)
    log(
        f'  term index: {len(terms):,} terms from {len(sources)} sources, {len(text) / 1e6:.2f} MB (read when the search box is first used)'
    )
    return {
        'file': FILE,
        'n': len(terms),
        'overlap_dir': (overlap or {}).get('dir', ''),
        'sources': [{k: s[k] for k in ('id', 'kind', 'title', 'shards') if k in s} for s in sources],
    }
