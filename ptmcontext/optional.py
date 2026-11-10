"""Optional columns: a mark attribute marked `optional: true` (a column a later release of the table may add, a score)
exists only where the marks table has its column. Where it has not, the attribute and everything the site file builds on
it (filters, table columns and downloads, count questions and the Overview cards that show them, header tiles, map
colorings) are left out, so one site file serves the table before and after the column arrives.

`prune_marks` is applied by `ptmc run` to the marks table it reads, `prune_run` by `ptmc web` to the columns a run wrote.
Nothing here names a column or a mark.
"""

from __future__ import annotations

from pathlib import Path


def _optional(site: dict) -> dict[str, dict]:
    attrs = (site.get('marks') or {}).get('attributes') or {}
    return {n: a for n, a in attrs.items() if a.get('optional')}


def forget(site: dict, names: set[str]) -> set[str]:
    """Remove the mark attributes `names` from the site and every block of its website that reads them. Returns the ids
    of the count questions removed with them."""
    if not names:
        return set()
    attrs = (site.get('marks') or {}).get('attributes') or {}
    for n in names:
        attrs.pop(n, None)
    web = site.get('website') or {}
    counts = web.get('counts') or {}
    gone = {cid for cid, c in counts.items() if isinstance(c, dict) and c.get('attribute') in names}
    for cid in gone:
        counts.pop(cid)
    drop = names | gone

    def hit(x) -> bool:
        if isinstance(x, str):
            return x in drop
        if not isinstance(x, dict):
            return False
        at, an, op = x.get('attribute'), x.get('analysis'), x.get('opens')
        return (
            (isinstance(at, str) and at in names)
            or (isinstance(an, str) and an in gone)
            or (isinstance(op, str) and op in gone)
        )

    def clean(node):
        if isinstance(node, list):
            node[:] = [clean(x) for x in node if not hit(x)]
        elif isinstance(node, dict):
            for k, v in list(node.items()):
                if isinstance(v, dict) and hit(v):
                    node.pop(k)
                elif k == 'attributes' and isinstance(v, list):
                    node[k] = [a for a in v if a not in names]
                    if not node[k] and not any(node.get(o) for o in ('analyses', 'keys', 'proteins', 'sets')):
                        node['__empty__'] = True  # a filter group left with nothing: dropped by its parent
                else:
                    clean(v)
        return node

    clean(web)

    def sweep(node):
        if isinstance(node, list):
            node[:] = [sweep(x) for x in node if not (isinstance(x, dict) and x.get('__empty__'))]
        elif isinstance(node, dict):
            for v in node.values():
                sweep(v)
        return node

    sweep(web)
    return gone


def prune_marks(site: dict, table) -> list[str]:
    """Forget the optional attributes whose column the marks table lacks. Returns their names."""
    miss = {n for n, a in _optional(site).items() if a.get('column') not in table.columns}
    forget(site, miss)
    return sorted(miss)


def prune_run(site: dict, folder: str | Path) -> list[str]:
    """Forget the optional attributes the run did not write (no a.<name> column in marks.tsv)."""
    f = Path(folder) / 'marks.tsv'
    if not f.exists():
        return []
    have = f.open().readline().rstrip('\n').split('\t')
    miss = {n for n in _optional(site) if f'a.{n}' not in have}
    forget(site, miss)
    return sorted(miss)
