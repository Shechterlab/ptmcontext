"""Variant lists kept in their own per-protein files (website.protein.card.variant_counts[].lazy, CONTRACTS.md).

A source with `lazy: true` lists one row per variant at every candidate residue, far more than the page needs until the
reader opens the card. Its rows leave the protein's table shard (data/e) and go, columnar and dictionary-encoded, into
data/g/NNN.json (a few proteins each, `D.variant_detail.shards` files); the shard keeps, per protein, only a count and a
highlighted count per residue (`_vc`), which is all the site card's line and the closed card's summary read.

data/g record of a protein: {source id: [position deltas, column 1, column 2, ...]}, the columns in the order of
D.variant_detail.entries[id].columns (the first is the position, written as the difference from the one before). A text
column holds, for a text the shard repeats, its index in the shard's '_s'; a number column (`int`, `float`) holds a number,
or null when the cell is empty. `float` keeps three significant digits.
"""

from __future__ import annotations

import json
import re
from collections import Counter

# the uncompressed bytes one file of the variant lists holds, about (a protein's list is never split)
G_SHARD_BYTES = 150_000


def hash_shard(accession: str, n: int) -> int:
    """The file of a protein's variant list: a 31-multiplier hash of its characters, modulo `n` (kit-sitecard.js computes the
    same; the sum of character codes the other files use piles up on few values for many files)."""
    h = 0
    for c in accession:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h % n


def lazy_entries(card: dict) -> list[dict]:
    """The variant_counts sources whose rows are kept in their own files."""
    return [x for x in (card or {}).get('variant_counts') or [] if x.get('lazy')]


def kinds(entry: dict, columns: list[str]) -> list[str]:
    """How each column of a source is written: pos (the position), int, float (a field of type int or stars, or sci) or str."""
    typ = {f.get('column'): f.get('type') for f in entry.get('fields') or []}
    out = []
    for c in columns:
        t = typ.get(c)
        out.append('pos' if c == 'position' else 'int' if t in ('int', 'stars') else 'float' if t == 'sci' else 'str')
    return out


def _is_hot(entry: dict, row: dict) -> bool:
    h = entry.get('highlight')
    if not h:
        return False
    v = str(row.get(h['column'], ''))
    if h.get('matches'):
        return re.fullmatch(h['matches'], v) is not None
    return v == str(h.get('equals'))


def _num(v, kind: str):
    if v is None or v == '':
        return None
    try:
        x = float(v)
    except ValueError:
        return None
    return int(x) if kind == 'int' else float(f'{x:.3g}')


def split(entries: list[dict], header: dict, rows: dict) -> tuple[dict, dict]:
    """Take the rows of the sources in `entries` out of `rows` ({accession: {table: [row, ...]}}), leaving each protein's
    `_vc` ({id: [position delta, count, highlighted, ...]} for the residues with a variant). Returns (the lists:
    {accession: {id: columnar block}} with text still as text, the spec for the page: {id: {columns, kinds}})."""
    spec, lists = {}, {}
    taken: set[str] = set()
    for x in entries:
        tabs = [t for t in x.get('tables') or [] if t in header]
        if not tabs:
            continue
        cols = header[tabs[0]]['columns']
        spec[x['id']] = {'columns': cols, 'kinds': kinds(x, cols)}
        taken.update(tabs)
        for acc, tb in rows.items():
            have = [r for t in tabs for r in tb.get(t, [])]
            if not have:
                continue
            have.sort(key=lambda r: int(r[0]))  # stable: the order of the tables within a position
            objs = [dict(zip(cols, r)) for r in have]
            counts: dict[int, list[int]] = {}
            for r, o in zip(have, objs):
                c = counts.setdefault(int(r[0]), [0, 0])
                c[0] += 1
                c[1] += _is_hot(x, o)
            flat, last = [], 0
            for pos in sorted(counts):
                flat += [pos - last, *counts[pos]]
                last = pos
            tb.setdefault('_vc', {})[x['id']] = flat
            lists.setdefault(acc, {})[x['id']] = have
    for tb in rows.values():
        for t in taken:
            tb.pop(t, None)
    return lists, spec


def encode(lists: dict, spec: dict) -> dict:
    """The lists of `split` as columnar blocks, a protein's list is one column per field (see the module's docstring). The
    text of every column is dictionary-encoded where it repeats, in the shard's own '_s' (done in `shards`)."""
    out = {}
    for acc, per in lists.items():
        out[acc] = {}
        for sid, have in per.items():
            ks = spec[sid]['kinds']
            block, last = [], 0
            for j, k in enumerate(ks):
                if k == 'pos':
                    col = []
                    for r in have:
                        p = int(r[j])
                        col.append(p - last)
                        last = p
                    block.append(col)
                elif k == 'str':
                    block.append([r[j] for r in have])
                else:
                    block.append([_num(r[j], k) for r in have])
            out[acc][sid] = block
    return out


def shards(lists: dict, spec: dict) -> tuple[int, dict[int, dict]]:
    """(number of files, {file number: {'_s': [texts], accession: {id: block}}}), each file about G_SHARD_BYTES."""
    blocks = encode(lists, spec)
    total = sum(len(json.dumps(b, separators=(',', ':'))) for b in blocks.values())
    n = max(1, -(-total // G_SHARD_BYTES))
    files: dict[int, dict] = {k: {} for k in range(n)}
    for acc, b in blocks.items():
        files[hash_shard(acc, n)][acc] = b
    for k, f in files.items():
        seen: Counter = Counter()
        for b in f.values():
            for sid, block in b.items():
                for col, kind in zip(block, spec[sid]['kinds']):
                    if kind == 'str':
                        seen.update(col)
        words = [s for s, c in seen.most_common() if c > 1]
        at = {s: i for i, s in enumerate(words)}
        for b in f.values():
            for sid, block in b.items():
                for j, kind in enumerate(spec[sid]['kinds']):
                    if kind == 'str':
                        block[j] = [at.get(s, s) for s in block[j]]
        if words:
            f['_s'] = words
    return n, files
