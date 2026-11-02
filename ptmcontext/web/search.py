"""The search's words and the filters that read more than the marks' own classes (website.search; CONTRACTS.md,
"Search and its filters"). No test reads any of it.

- shorthand: other names for proteins, as papers write them (H4 for an accession); the search reads them as it reads
  a gene or an alias of the site's protein_values table.
- patterns: the motif finder. ptmc web writes each mark's sequence window of `span` residues each side (from the
  snapshot) beside the selection data, and the page matches a pattern there: covering the mark (`at`) or anywhere
  (`near`).
- terms: search keys that stand for filters (go:rna -> the protein attribute go_rna, experimental or other evidence).
  A term may share its key with a question or an attribute: its words are read first, any other value as before.
- spacing: another mark of the site within some residues (computed in the page from the marks).
- nearby: for each residue_evidence table named, each mark's distance to the nearest residue of each kind on its
  protein, so a filter keeps the marks with one within N residues.
- partners: a protein_partners table, kept whole for the marked proteins in data/partners.json (read when a partner
  filter is first used): each partner's gene, accession, classes and whether it is marked, and each marked protein's
  partners with their scores.
"""
from __future__ import annotations

import json
from pathlib import Path

FILTER_KINDS = ('a', 'p', 's', 't', 'n', 'r', 'c')


def search_keys(site: dict) -> set[str]:
    """Every key a search term (key:value) may use on this site."""
    web = site.get('website') or {}
    sc = web.get('search') or {}
    keys = {a['id'] for a in site.get('analyses', [])} | set((site.get('marks') or {}).get('attributes') or {})
    keys |= set(((site.get('proteins') or {}).get('attributes') or {}))
    keys |= set(web.get('search_aliases') or {}) | set(sc.get('terms') or {}) | set(web.get('counts') or {})
    pat = sc.get('patterns') or {}
    keys |= {pat[k] for k in ('at', 'near') if pat.get(k)}
    keys |= {n.get('key') or t for t, n in (sc.get('nearby') or {}).items()}
    if sc.get('partners'):
        keys.add(sc['partners'].get('key') or 'binds')
    if sc.get('spacing') and sc['spacing'].get('key'):
        keys.add(sc['spacing']['key'])
    return keys


def problems(site: dict) -> list[str]:
    """What website.search and the filter groups' keys name that the site does not have."""
    web = site.get('website') or {}
    sc = web.get('search') or {}
    out = []
    ids = {a['id']: a for a in site.get('analyses', [])}
    attrs = (site.get('marks') or {}).get('attributes') or {}
    pattrs = (site.get('proteins') or {}).get('attributes') or {}
    tables = web.get('tables') or {}
    for key, t in (sc.get('terms') or {}).items():
        for word, fl in (t.get('values') or {}).items():
            for fk, vals in fl.items():
                kind, _, name = fk.partition(':')
                where = f"website.search.terms.{key}.{word}"
                if kind in ('t', 'n') and name not in attrs:
                    out.append(f"{where}: {fk!r}: no attribute {name!r} in marks.attributes")
                elif kind == 't' and attrs[name].get('values') and not attrs[name].get('present'):
                    out += [f"{where}: {name} has no value {v!r}" for v in vals if v not in attrs[name]['values']]
                elif kind == 'r' and name not in pattrs and name != 'marks':
                    out.append(f"{where}: {fk!r}: no attribute {name!r} in proteins.attributes")
                elif kind in ('a', 'p', 's') and name not in ids:
                    out.append(f"{where}: {fk!r}: no analysis {name!r}")
                elif kind not in FILTER_KINDS + ('d', 'm', 'o', 'b'):
                    out.append(f"{where}: {fk!r} is not a filter key (kind:name)")
    for name, n in (sc.get('nearby') or {}).items():
        t = tables.get(name)
        if t is None:
            out.append(f"website.search.nearby.{name}: no table {name!r} in website.tables")
        elif t.get('format') != 'residue_evidence':
            out.append(f"website.search.nearby.{name}: website.tables.{name} is {t.get('format')!r}, not residue_evidence")
    pt = sc.get('partners')
    if pt:
        t = tables.get(pt['table'])
        if t is None or t.get('format') != 'protein_partners':
            out.append(f"website.search.partners.table: {pt['table']!r} is not a protein_partners table of website.tables")
    pat = sc.get('patterns') or {}
    if pat.get('near') and (pat['near'] in ids or pat['near'] in attrs):
        out.append(f"website.search.patterns.near: {pat['near']!r} is a question or an attribute; name another key")
    for g in web.get('filters') or []:
        for k in g.get('keys') or []:
            kind, _, name = k.partition(':')
            where = f"website.filters, group {g.get('name')!r}: key {k!r}"
            if kind == 'd' and name != 'marks':
                out.append(f"{where}: d: takes marks (another mark within some residues)")
            elif kind == 'm' and (name not in ('at', 'near') or not pat.get(name)):
                out.append(f"{where}: needs website.search.patterns.{name}")
            elif kind == 'o' and name not in (sc.get('nearby') or {}):
                out.append(f"{where}: needs website.search.nearby.{name}")
            elif kind == 'b' and (not pt or name not in ('class', 'gene', 'score')):
                out.append(f"{where}: needs website.search.partners (b:class, b:gene or b:score)")
            elif kind not in ('d', 'm', 'o', 'b'):
                out.append(f"{where}: keys are for the modules' filters (d:, m:, o:, b:); name questions and attributes under analyses and attributes")
    return out


def _paths(run: dict) -> dict:
    from ..snapshot import md5_file
    out = {}
    for name, rec in (run.get('inputs') or {}).items():
        f = Path(rec.get('file', ''))
        if f.exists() and md5_file(f) == rec.get('md5'):
            out[name] = f
    return out


def windows(sel: dict, listing: list, seqs: dict, span: int) -> list[str]:
    """Each mark's sequence, `span` residues each side ('-' past the chain's ends), in the order of sel['marks']."""
    out = []
    for m in sel['marks']:
        seq = seqs.get(listing[m[0]][0], '')
        i = m[1] - 1
        lo, hi = i - span, i + span + 1
        out.append('-' * max(0, -lo) + seq[max(0, lo):min(len(seq), hi)] + '-' * max(0, hi - len(seq)))
    return out


def nearby(sel: dict, listing: list, spec: dict, path: Path, within: int) -> dict:
    """For one residue_evidence table: its kinds, and for each kind the marks with a residue of that kind on their
    protein within `within` residues, with the distance to the nearest (0 inside a stretch): a flat list
    [mark index, distance, mark index, distance, ...]."""
    import bisect

    from . import tables as T
    t = T.read(spec, path)
    kinds = sorted(set(t['kind']) - {''})
    by = {}
    for (acc, kind), g in t.groupby(['accession', 'kind']):
        by[(acc, kind)] = sorted(zip(g['start'], g['end']))
    dist = []
    for kind in kinds:
        row = []
        for ix, m in enumerate(sel['marks']):
            iv = by.get((listing[m[0]][0], kind))
            d = -1
            if iv:
                pos = m[1]
                k = bisect.bisect_right(iv, (pos, 10**9))
                best = None
                for a, b in iv[max(0, k - 50):k + 1]:          # stretches are short: the neighbours suffice
                    x = 0 if a <= pos <= b else min(abs(a - pos), abs(b - pos))
                    best = x if best is None else min(best, x)
                if best is not None and best <= within:
                    d = int(best)
            if d >= 0:
                row += [ix, d]
        dist.append(row)
    return {'kinds': kinds, 'd': dist}


def partners(listing: list, spec: dict, path: Path, classes: list) -> dict:
    """data/partners.json: the partners of the marked proteins (a protein_partners table)."""
    from . import tables as T
    t = T.read(spec, path)
    pidx = {r[0]: i for i, r in enumerate(listing)}
    t = t[t['accession'].isin(pidx)]
    accs = sorted(set(t['partner_accession']))
    aidx = {a: i for i, a in enumerate(accs)}
    gene, bits, marked = [''] * len(accs), [0] * len(accs), [0] * len(accs)
    codes = list(classes)
    for r in t.to_dict('records'):
        k = aidx[r['partner_accession']]
        gene[k] = gene[k] or r.get('partner', '')
        marked[k] = 1 if str(r.get('partner_marked', '')).lower() in ('true', '1', 'yes') or r['partner_accession'] in pidx else marked[k]
        for c in str(r.get('classes', '') or '').split(';'):
            c = c.strip()
            if c:
                if c not in codes:
                    codes.append(c)
                bits[k] |= 1 << codes.index(c)
    rows: dict[int, list] = {}
    for r in t.to_dict('records'):
        try:
            sc = int(round(float(r['score']) * 1000))
        except ValueError:
            continue
        rows.setdefault(pidx[r['accession']], []).extend([aidx[r['partner_accession']], sc])
    return {'genes': gene, 'accessions': accs, 'classes': codes, 'bits': bits, 'marked': marked,
            'rows': {str(k): v for k, v in rows.items()}}


def data(site: dict, run: dict, sel: dict, listing: list, fasta: Path | None, out: Path, log=print) -> dict:
    """Add the search's data to the selection data (windows, nearby distances); write data/partners.json; return
    what the page's own data carry (D.search)."""
    web = site.get('website') or {}
    sc = dict(web.get('search') or {})
    if not sc:
        return {}
    tables = web.get('tables') or {}
    paths = _paths(run)
    pat = sc.get('patterns')
    if pat and fasta and fasta.exists():
        from ..snapshot import parse_fasta
        span = int(pat.get('span', 15))
        sel['wide'] = {'span': span, 'w': windows(sel, listing, parse_fasta(fasta), span)}
        log(f"  motif finder: windows of {span} residues each side for {len(sel['wide']['w']):,} marks")
    near = {}
    for name, n in (sc.get('nearby') or {}).items():
        spec = tables.get(name)
        path = paths.get((spec or {}).get('input'))
        if spec is None or path is None:
            log(f'  website.search.nearby.{name}: its table is not in the run record; left out')
            continue
        within = max(n.get('within') or [20])
        near[name] = nearby(sel, listing, spec, path, within)
        log(f"  nearby {name}: {', '.join(near[name]['kinds'])} within {within} residues")
    if near:
        sel['nearby'] = near
    sc['nearby'] = {k: v for k, v in (sc.get('nearby') or {}).items() if k in near}
    pt = sc.get('partners')
    target = out / 'data' / 'partners.json'
    if target.exists():
        target.unlink()
    if pt:
        spec = tables.get(pt['table'])
        path = paths.get((spec or {}).get('input'))
        if spec is None or path is None:
            log('  website.search.partners: its table is not in the run record; left out')
            sc.pop('partners')
        else:
            p = partners(listing, spec, path, list((pt.get('classes') or {})))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(p, separators=(',', ':')))
            log(f"  partners: {sum(len(v) for v in p['rows'].values()) // 2:,} pairs on {len(p['rows']):,} proteins ({target.stat().st_size / 1e6:.1f} MB)")
    return sc
