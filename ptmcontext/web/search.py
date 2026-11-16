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
import re
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
                where = f'website.search.terms.{key}.{word}'
                if kind in ('t', 'n') and name not in attrs:
                    out.append(f'{where}: {fk!r}: no attribute {name!r} in marks.attributes')
                elif kind == 't' and attrs[name].get('values') and not attrs[name].get('present'):
                    out += [f'{where}: {name} has no value {v!r}' for v in vals if v not in attrs[name]['values']]
                elif kind == 'r' and name not in pattrs and name != 'marks':
                    out.append(f'{where}: {fk!r}: no attribute {name!r} in proteins.attributes')
                elif kind in ('a', 'p', 's') and name not in ids:
                    out.append(f'{where}: {fk!r}: no analysis {name!r}')
                elif kind not in FILTER_KINDS + ('d', 'm', 'o', 'b'):
                    out.append(f'{where}: {fk!r} is not a filter key (kind:name)')
    for name, n in (sc.get('nearby') or {}).items():
        t = tables.get(name)
        if t is None:
            out.append(f'website.search.nearby.{name}: no table {name!r} in website.tables')
        elif t.get('format') != 'residue_evidence':
            out.append(
                f'website.search.nearby.{name}: website.tables.{name} is {t.get("format")!r}, not residue_evidence'
            )
    pt = sc.get('partners')
    if pt:
        t = tables.get(pt['table'])
        if t is None or t.get('format') != 'protein_partners':
            out.append(
                f'website.search.partners.table: {pt["table"]!r} is not a protein_partners table of website.tables'
            )
        for code, c in (pt.get('classes') or {}).items():
            if not isinstance(c, dict):
                continue
            where = f'website.search.partners.classes.{code}'
            if c.get('role') not in ROLES:
                out.append(f'{where}: role is one of {", ".join(ROLES)}')
            if c.get('interpro') and not pt.get('interpro'):
                out.append(f"{where}: interpro ids need website.search.partners.interpro (a role of the site's inputs)")
            if pt.get('interpro') and pt['interpro'] not in (site.get('inputs') or {}):
                out.append(f"website.search.partners.interpro: {pt['interpro']!r} is not a role of the site's inputs")
            out += [
                f'{where}: {i!r} is not an InterPro id (IPR plus six digits)'
                for i in c.get('interpro') or []
                if not re.fullmatch(r'IPR\d{6}', str(i))
            ]
            out += [f'{where}: except {x!r} is not a class' for x in c.get('except') or [] if x not in pt['classes']]
            if not (c.get('interpro') or c.get('genes') or c.get('genes_file')):
                out.append(f'{where}: name its members, by interpro ids, genes or a genes_file')
            if c.get('genes_file') and not (Path(site.get('__root__', '.')) / c['genes_file']).exists():
                out.append(f'{where}: genes_file {c["genes_file"]!r} does not exist')
    pat = sc.get('patterns') or {}
    if pat.get('near') and (pat['near'] in ids or pat['near'] in attrs):
        out.append(f'website.search.patterns.near: {pat["near"]!r} is a question or an attribute; name another key')
    for g in web.get('filters') or []:
        for k in g.get('keys') or []:
            kind, _, name = k.partition(':')
            where = f'website.filters, group {g.get("name")!r}: key {k!r}'
            if kind == 'd' and name != 'marks':
                out.append(f'{where}: d: takes marks (another mark within some residues)')
            elif kind == 'm' and (name not in ('at', 'near') or not pat.get(name)):
                out.append(f'{where}: needs website.search.patterns.{name}')
            elif kind == 'o' and name not in (sc.get('nearby') or {}):
                out.append(f'{where}: needs website.search.nearby.{name}')
            elif kind == 'b' and (not pt or name not in ('class', 'gene', 'score')):
                out.append(f'{where}: needs website.search.partners (b:class, b:gene or b:score)')
            elif kind not in ('d', 'm', 'o', 'b'):
                out.append(
                    f"{where}: keys are for the modules' filters (d:, m:, o:, b:); name questions and attributes under analyses and attributes"
                )
    return out


ROLES = ('writer', 'reader', 'anti-reader', 'cofactor', 'eraser')


def class_words(pt: dict) -> tuple[dict, dict]:
    """(code: label, code: {role, reads, pmid, help}) of website.search.partners.classes; a class may be just its label
    (its members then come from the table's classes column)."""
    labels, info = {}, {}
    for code, c in (pt.get('classes') or {}).items():
        if isinstance(c, dict):
            labels[code] = c['label']
            info[code] = {k: c[k] for k in ('role', 'reads', 'pmid', 'help') if c.get(k)}
        else:
            labels[code] = c
    return labels, info


def members_file(root: Path | None, c: dict) -> set[str]:
    """The members a partner class lists in its genes_file (upper case): the `accession` and `gene` columns of a
    tab-separated table with a header, lines starting with # skipped (they record the query that made the file)."""
    if not c.get('genes_file'):
        return set()
    import io

    import pandas as pd

    lines = (Path(root or '.') / c['genes_file']).read_text().splitlines()
    t = pd.read_csv(
        io.StringIO('\n'.join(x for x in lines if not x.startswith('#'))),
        sep='\t',
        dtype=str,
        keep_default_na=False,
        quoting=3,
    )
    return {
        str(x).strip().upper() for col in ('accession', 'gene') if col in t.columns for x in t[col] if str(x).strip()
    }


def _members(pt: dict, run: dict, paths: dict, accessions: set) -> dict:
    """code: the accessions in the class (explicit genes are matched later, by symbol), from InterPro ids."""
    want = {
        code: set(c.get('interpro') or [])
        for code, c in (pt.get('classes') or {}).items()
        if isinstance(c, dict) and c.get('interpro')
    }
    if not want:
        return {}
    import pandas as pd

    name = (run.get('roles') or {}).get(pt.get('interpro'), pt.get('interpro'))
    path = paths.get(name)
    if path is None:
        return {}
    ids = set().union(*want.values())
    frame = pd.read_csv(
        path, sep='\t', dtype=str, keep_default_na=False, usecols=['canonical_UniProtAC', 'interpro_accession']
    )
    frame = frame[frame['interpro_accession'].isin(ids)]
    have = {}
    for acc, ipr in zip(frame['canonical_UniProtAC'], frame['interpro_accession']):
        have.setdefault(acc, set()).add(ipr)
    return {code: {a for a, v in have.items() if v & ids_} for code, ids_ in want.items()}


def derived_attribute(site: dict) -> dict:
    """{name: spec} of the mark attribute website.search.partners.attribute asks for: the classes of the partners of a
    mark's protein, so that a count question can tile them (the page's filter for the same is b:class)."""
    pt = ((site.get('website') or {}).get('search') or {}).get('partners') or {}
    a = pt.get('attribute')
    if not a:
        return {}
    labels, _ = class_words(pt)
    return {
        a['id']: {
            'label': a.get('label', 'Partner classes'),
            'kind': 'list',
            'separator': '; ',
            'values': labels,
            'help': a.get('help', ''),
            'derived': True,
        }
    }


def derive(site: dict, folder: Path, log=print, write: bool = False) -> None:
    """The derived attribute (a list of partner class codes): with write (the run, before it records its outputs'
    MD5s), added to the marks of the run's output; without (the web build), only registered among the site's
    attributes when the run wrote it, so that a website build never changes a run's output. Nothing else in
    marks.tsv changes."""
    spec = derived_attribute(site)
    if not spec:
        return
    if not write:
        name = next(iter(spec))
        head = (
            (folder / 'marks.tsv').open().readline().rstrip('\n').split('\t') if (folder / 'marks.tsv').exists() else []
        )
        if f'a.{name}' in head:
            site['marks'].setdefault('attributes', {})[name] = spec[name]
        else:
            log(f'  website.search.partners.attribute: the run has no a.{name} column; run the site again to add it')
        return
    import pandas as pd

    name = next(iter(spec))
    pt = site['website']['search']['partners']
    run = json.loads((folder / 'run.json').read_text())
    paths = _paths(run)
    tspec = (site['website'].get('tables') or {}).get(pt['table'])
    path = paths.get((tspec or {}).get('input'))
    if tspec is None or path is None:
        log(f'  website.search.partners.attribute: the partners table is not in the run record; {name} left out')
        return
    marks = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    accs = sorted(set(marks['accession'])) if 'accession' in marks.columns else sorted(set(marks.iloc[:, 0]))
    p = partners([[a] for a in accs], tspec, path, pt, run, paths, Path(site.get('__root__', '.')))
    codes = [c for c in p['classes'] if c in spec[name]['values']]
    mask = {c: 1 << p['classes'].index(c) for c in codes}
    by = {}
    for k, row in p['rows'].items():
        got = set()
        for i in range(0, len(row), 2):
            got |= {c for c, m in mask.items() if p['bits'][row[i]] & m}
        by[accs[int(k)]] = '; '.join(c for c in codes if c in got)
    col = f'a.{name}'
    marks[col] = [by.get(a, '') for a in (marks['accession'] if 'accession' in marks.columns else marks.iloc[:, 0])]
    marks.to_csv(folder / 'marks.tsv', sep='\t', index=False)
    site['marks'].setdefault('attributes', {})[name] = spec[name]
    log(f'  {name}: {sum(1 for v in marks[col] if v):,} {site["id"]} marks on proteins with a partner of a class')


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
        out.append('-' * max(0, -lo) + seq[max(0, lo) : min(len(seq), hi)] + '-' * max(0, hi - len(seq)))
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
                for a, b in iv[max(0, k - 50) : k + 1]:  # stretches are short: the neighbors suffice
                    x = 0 if a <= pos <= b else min(abs(a - pos), abs(b - pos))
                    best = x if best is None else min(best, x)
                if best is not None and best <= within:
                    d = int(best)
            if d >= 0:
                row += [ix, d]
        dist.append(row)
    return {'kinds': kinds, 'd': dist}


def partners(
    listing: list,
    spec: dict,
    path: Path,
    pt: dict,
    run: dict | None = None,
    paths: dict | None = None,
    root: Path | None = None,
) -> dict:
    """data/partners.json: the partners of the marked proteins (a protein_partners table)."""
    from . import tables as T

    t = T.read(spec, path)
    pidx = {r[0]: i for i, r in enumerate(listing)}
    t = t[t['accession'].isin(pidx)]
    accs = sorted(set(t['partner_accession']))
    aidx = {a: i for i, a in enumerate(accs)}
    gene, bits, marked = [''] * len(accs), [0] * len(accs), [0] * len(accs)
    codes = list(pt.get('classes') or {})
    defs = {c: v for c, v in (pt.get('classes') or {}).items() if isinstance(v, dict)}
    by_ipr = _members(pt, run or {}, paths or {}, set(accs))
    for r in t.to_dict('records'):
        k = aidx[r['partner_accession']]
        gene[k] = gene[k] or r.get('partner', '')
        marked[k] = (
            1
            if str(r.get('partner_marked', '')).lower() in ('true', '1', 'yes') or r['partner_accession'] in pidx
            else marked[k]
        )
        for c in str(r.get('classes', '') or '').split(';'):
            c = c.strip()
            if c and (c in codes or not defs):  # classes defined in the site file take their members from it alone
                if c not in codes:
                    codes.append(c)
                bits[k] |= 1 << codes.index(c)
    for code, c in defs.items():  # members named in the site file: by gene (or accession) and by InterPro id
        genes = {str(g).upper() for g in c.get('genes') or []} | members_file(root, c)
        for k, a in enumerate(accs):
            if a.upper() in genes or gene[k].upper() in genes or a in by_ipr.get(code, ()):
                bits[k] |= 1 << codes.index(code)
    for code, c in defs.items():  # a class less the members of others (the Tudor domains less the curated readers)
        gone = sum(1 << codes.index(x) for x in c.get('except') or [])
        if gone:
            for k in range(len(accs)):
                if bits[k] & gone:
                    bits[k] &= ~(1 << codes.index(code))
    rows: dict[int, list] = {}
    for r in t.to_dict('records'):
        try:
            sc = int(round(float(r['score']) * 1000))
        except ValueError:
            continue
        rows.setdefault(pidx[r['accession']], []).extend([aidx[r['partner_accession']], sc])
    return {
        'genes': gene,
        'accessions': accs,
        'classes': codes,
        'bits': bits,
        'marked': marked,
        'rows': {str(k): v for k, v in rows.items()},
    }


def class_set_pairs(site: dict, inputs: dict, root: Path | None = None, role: str | None = None):
    """(pairs, names, annotated) for a protein-set test of the partner classes (sets.partner_classes: the id of a
    website.tables protein_partners table): a protein is in a class's set when one of its partners is in the class
    (website.search.partners.classes, by InterPro entry, gene or genes_file, as the page's filter reads them). The
    proteins the table lists are the source's own, the background of a test that takes the annotated proteins."""
    import pandas as pd

    from . import tables as T

    pt = ((site.get('website') or {}).get('search') or {}).get('partners') or {}
    tspec = ((site.get('website') or {}).get('tables') or {}).get(pt.get('table'))
    if not pt.get('classes') or not tspec:
        raise ValueError('sets.partner_classes needs website.search.partners (its classes and its table)')
    path = inputs[role or tspec['input']]
    t = T.read(tspec, path)
    accs = sorted(set(t['accession']))
    p = partners([[a] for a in accs], tspec, path, pt, {}, inputs, root)
    labels, _ = class_words(pt)
    codes = [c for c in p['classes'] if c in labels]
    bit = {c: 1 << p['classes'].index(c) for c in codes}
    pairs = set()
    for k, row in p['rows'].items():
        for i in range(0, len(row), 2):
            pairs |= {(c, accs[int(k)]) for c, m in bit.items() if p['bits'][row[i]] & m}
    return pd.DataFrame(sorted(pairs), columns=['set', 'protein']), labels, set(accs)


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
        log(f'  motif finder: windows of {span} residues each side for {len(sel["wide"]["w"]):,} marks')
    near = {}
    for name, n in (sc.get('nearby') or {}).items():
        spec = tables.get(name)
        path = paths.get((spec or {}).get('input'))
        if spec is None or path is None:
            log(f'  website.search.nearby.{name}: its table is not in the run record; left out')
            continue
        within = max(n.get('within') or [20])
        near[name] = nearby(sel, listing, spec, path, within)
        log(f'  nearby {name}: {", ".join(near[name]["kinds"])} within {within} residues')
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
            p = partners(listing, spec, path, pt, run, paths, Path(site.get('__root__', '.')))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(p, separators=(',', ':')))
            labels, info = class_words(pt)
            sc['partners'] = {**pt, 'classes': labels, **({'class_info': info} if info else {})}
            log(
                f'  partners: {sum(len(v) for v in p["rows"].values()) // 2:,} pairs on {len(p["rows"]):,} proteins ({target.stat().st_size / 1e6:.1f} MB)'
            )
    return sc
