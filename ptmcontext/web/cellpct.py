"""The share of each compartment's proteins that carry at least one mark (kit-cell.js, the "percent with sites" view of
the maps of the cell). Counted at build time from the protein sets the run keeps: for each map the proteins it places
(its background, reviewed proteins), and for each compartment or region a row names, how many of its proteins are in the
background and how many of them are marked. Nothing here names a mark, a map or a compartment."""

from __future__ import annotations


def cell_percent(cell: dict, kept: dict) -> dict:
    """{analysis: {N: proteins the map places, n: of them marked, sets: {set: [proteins, marked]}}} for each map of
    website.cell and its regions question, for the sets that a row of the cell names (website.cell.compartments, regions).
    A map the run holds no protein sets for is left out."""
    want: dict[str, set] = {}
    for g in cell.get('compartments') or []:
        for r in g.get('rows') or []:
            for aid, s in (r.get('sets') or {}).items():
                want.setdefault(aid, set()).add(s)
    for m in cell.get('maps') or []:
        if m.get('regions'):
            want.setdefault(m['regions'], set()).update(r.get('set') or r['label'] for r in cell.get('regions') or [])
    out = {}
    for aid, names in want.items():
        k = kept.get(aid)
        if not k or not k.get('sets'):
            continue
        out[aid] = {
            'N': k['N'],
            'n': len(k['marked_in_background']),
            'sets': {s: [v['M'], len(v['marked'])] for s, v in k['sets'].items() if s in names},
        }
    return out


def cell_proteome(run: dict) -> dict | None:
    """The reviewed proteins that carry a mark over all the reviewed proteins of the snapshot, from what the run wrote
    (run.json: the snapshot's entries and the marked proteins): the key's proteome-wide share. None where the run does
    not say."""
    N = (run.get('snapshot') or {}).get('entries')
    n = (run.get('marks') or {}).get('proteins')
    return {'N': N, 'n': n} if N and n is not None else None
