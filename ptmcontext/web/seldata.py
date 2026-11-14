"""The selection data (what the browser filters and tests a selection with) written in parts (CONTRACTS.md, "Selection
data in parts"), so each view reads only what it shows.

data/sel/core.json     the small part every reader needs: questions, classes, attribute names and values, the shard
                       map and the counts a first page shows (marks per attribute value, marks, proteins)
data/sel/m.NNN.json    the marks of some proteins, {ix: their indices in the whole list, rows: the rows}; proteins are
                       in the order the Sites page lists them, so its first page is the first one or two files
data/sel/s.NNN.json    for the same proteins, which protein sets each is in (the protein pages read only this)
data/sel/a.NNN.json    the values of an attribute with very many (a score, a peptide), read when a column shows it or with the whole
data/sel/x.<key>.json  every other large part, read with the whole selection (tests, retests, filters)

The whole selection is these parts put back together (kit-seldata.js does it); the one-file copy inlines it."""

import json
from pathlib import Path

MARK_SHARD_BYTES = 600_000  # about what a marks file holds (raw): a few hundred KB compressed
OWN_FILE_MIN = 32_000  # a part of the selection larger than this has a file of its own
VOCAB_MAX = 2000  # an attribute with more distinct values than this has its values in a file of its own
CORE_KEYS = ('analyses', 'classes', 'attributes', 'attribute_names', 'attribute_links')
SEL_FILE_VERSION = 1


def _j(value) -> str:
    return json.dumps(value, separators=(',', ':'))


def protein_order(listing: list, with_marks: set) -> list[int]:
    """The proteins with marks in the Sites page's first order: by the name shown (gene, else accession), lower case."""
    return sorted(with_marks, key=lambda i: (str(listing[i][1] or listing[i][0]).lower(), i))


def _get(d: dict, p: int):
    return d[p] if p in d else d.get(str(p))


def set_slices(sets: dict) -> tuple[dict, dict]:
    """(meta, by_protein): the protein sets without their members, and for each protein, per question, the sets it is
    in (indices into the question's `sets`, then its `more`), its covariate value, its scores and values, and whether
    it is in the background. Equal to what
    kit-select.js reads from the whole (setHas, covariate.proteins, in_background)."""
    meta, by = {}, {}
    for aid, ps in sets.items():
        m = {k: v for k, v in ps.items() if k not in ('in_background', 'any', 'of', 'sets', 'more')}
        m['sets'] = [[s[0], s[1]] for s in ps['sets']]
        if ps.get('more'):
            m['more'] = [x[0] for x in ps['more']]
        if 'covariate' in ps:
            m['covariate'] = {k: v for k, v in ps['covariate'].items() if k not in ('proteins', 'counts')}
        if 'scores' in ps:
            m['scores'] = {'sets': sorted(ps['scores']['sets'])}
        if 'values' in ps:
            m['values'] = {'columns': ps['values']['columns']}
        meta[aid] = m
        of = ps.get('of')
        members: dict[int, list] = {}  # protein -> the sets it is in, as indices
        if of:
            holders: dict = {}
            for p, us in of.items():
                for u in us:
                    holders.setdefault(u, []).append(int(p))
            for k, s in enumerate(ps['sets']):
                for p in {q for u in s[2] for q in holders.get(u, [])}:
                    members.setdefault(p, []).append(k)
            bg = {q for u in ps['in_background'] for q in holders.get(u, [])}
        else:
            for k, s in enumerate(ps['sets']):
                for p in s[2]:
                    members.setdefault(p, []).append(k)
            bg = set(ps['in_background'])
        for j, s in enumerate(ps.get('more') or []):  # offered by the filter, not tested: the members as listed
            for p in s[1]:
                members.setdefault(p, []).append(len(ps['sets']) + j)
        cov = (ps.get('covariate') or {}).get('proteins') or {}
        sc = ps.get('scores') or {}
        val = (ps.get('values') or {}).get('marked') or {}
        for p in set(members) | bg | {int(x) for x in cov} | {int(x) for x in val}:
            rec = {}
            if p in members:
                rec['n'] = members[p]
            if p in bg:
                rec['b'] = 1
            if _get(cov, p) is not None:
                rec['c'] = _get(cov, p)
            if sc:
                by_set = {s: _get(v, p) for s, v in sc['sets'].items()}
                by_set = {s: v for s, v in by_set.items() if v is not None}
                if by_set:
                    rec['sc'] = by_set
                a = _get(sc['any'], p)
                if a is not None:
                    rec['a'] = a
            if _get(val, p) is not None:
                rec['v'] = _get(val, p)
            by.setdefault(p, {})[aid] = rec
    return meta, by


def write(sel: dict, listing: list, out: Path, log=print) -> dict:
    """Write the parts under out/data/sel and return the core (also written). `sel` is left as it was."""
    d = out / 'data' / 'sel'
    if d.exists():
        for f in d.iterdir():
            f.unlink()
    d.mkdir(parents=True, exist_ok=True)
    marks = sel['marks']
    by_protein: dict[int, list[int]] = {}
    for i, r in enumerate(marks):
        by_protein.setdefault(r[0], []).append(i)
    order = protein_order(listing, set(by_protein))
    shard_of = [-1] * len(listing)
    shards: list[list[int]] = []  # the proteins of each file
    size = 0
    for p in order:
        n = sum(len(_j(marks[i])) + 1 for i in by_protein[p])
        if not shards or (size and size + n > MARK_SHARD_BYTES):
            shards.append([])
            size = 0
        shards[-1].append(p)
        size += n
        shard_of[p] = len(shards) - 1
    for k, prots in enumerate(shards):
        ix = [i for p in prots for i in by_protein[p]]
        (d / f'm.{k:03d}.json').write_text(f'{{"ix":{_j(ix)},"rows":{_j([marks[i] for i in ix])}}}')
    parts: dict = {
        'v': SEL_FILE_VERSION,
        'n_marks': len(marks),
        'n_proteins': len(by_protein),
        'shard_of': shard_of,
        'marks': [f'm.{k:03d}.json' for k in range(len(shards))],
    }
    core = {k: sel[k] for k in CORE_KEYS if k in sel}
    # the marks of each attribute value, over the whole list: what the Sites page's quick filters show first
    names = sel.get('attribute_names') or list(sel.get('attributes', {}))
    big = {n for n in names if len(sel['attributes'][n]) > VOCAB_MAX}
    counts = [None if n in big else [0] * len(sel['attributes'][n]) for n in names]
    for r in marks:
        for ti, ks in enumerate(r[3]):
            if counts[ti] is not None:
                for k in ks:
                    counts[ti][k] += 1
    parts['attr_counts'] = counts
    # an attribute with very many values keeps them in a file; the core holds an empty list in their place
    parts['vocab'] = {}
    for n in names:
        if n in big:
            parts['vocab'][n] = f'a.{len(parts["vocab"]):03d}.json'
            (d / parts['vocab'][n]).write_text(_j(sel['attributes'][n]))
    core['attributes'] = {n: ([] if n in big else v) for n, v in sel['attributes'].items()}
    # the protein sets: without their members in the core, each protein's own in a file beside its marks
    if sel.get('protein_sets'):
        meta, by = set_slices(sel['protein_sets'])
        core['protein_sets_meta'] = meta
        files = []
        for k, prots in enumerate(shards):
            files.append(f's.{k:03d}.json')
            (d / files[-1]).write_text(_j({str(p): by[p] for p in prots if p in by}))
        parts['sets'] = files
    # every other part: a small one in the core, a large one in a file
    own = {}
    for k, v in sel.items():
        if k in CORE_KEYS or k == 'marks':
            continue
        text = _j(v)
        if len(text) > OWN_FILE_MIN or k == 'protein_sets':
            (d / f'x.{k}.json').write_text(text)
            own[k] = f'x.{k}.json'
        else:
            core[k] = v
    parts['extra'] = own
    core['parts'] = parts
    (d / 'core.json').write_text(_j(core))
    total = sum(f.stat().st_size for f in d.iterdir())
    log(
        f'  selection data: {len(marks):,} marks in {len(shards)} files of about {MARK_SHARD_BYTES // 1000} KB, '
        f'{total / 1e6:.1f} MB in all; the core is {(d / "core.json").stat().st_size / 1e6:.2f} MB'
    )
    return core


def read(folder: Path) -> dict:
    """The whole selection from its parts (for tests and tools): what kit-select.js reads."""
    d = Path(folder) / 'data' / 'sel' if (Path(folder) / 'data' / 'sel').exists() else Path(folder)
    core = json.loads((d / 'core.json').read_text())
    parts = core.pop('parts')
    marks: list = [None] * parts['n_marks']
    for f in parts['marks']:
        s = json.loads((d / f).read_text())
        for i, r in zip(s['ix'], s['rows']):
            marks[i] = r
    core.pop('protein_sets_meta', None)
    for n, f in parts.get('vocab', {}).items():
        core['attributes'][n] = json.loads((d / f).read_text())
    for k, f in parts['extra'].items():
        core[k] = json.loads((d / f).read_text())
    core['marks'] = marks
    return core
