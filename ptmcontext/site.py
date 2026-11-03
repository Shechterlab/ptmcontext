"""Run a site from its config file (sites/<id>.yaml): every analysis it lists, into one statistics table, with a run
record, and the parity check against its reference when it names one.

Changing the mark, the inputs or the analyses is changing the file, never the code.
"""
from __future__ import annotations

import copy

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from . import __version__
from . import inputs as I
from . import layers as L
from . import residue_tests as RT
from . import statistics as ST
from .parity import Result, compare, compare_table
from .profile import check_residues, load_profile, read_config, validate
from .snapshot import Snapshot, md5_file

REPO = Path(__file__).resolve().parents[1]


def code_commit(path: Path = REPO) -> str:
    """The commit of the git checkout holding path ('' outside git), with '-dirty' when it has uncommitted changes."""
    import subprocess
    try:
        head = subprocess.run(['git', '-C', str(path), 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
        dirty = subprocess.run(['git', '-C', str(path), 'status', '--porcelain', '--untracked-files=no'], capture_output=True, text=True).stdout.strip()
        return head + ('-dirty' if dirty else '')
    except Exception:      # noqa: BLE001  (not a git checkout: an installed package)
        return ''


def load_site(path: str | Path) -> dict:
    """A site file, validated. Its paths (manifest, citation, pictures, outputs) are relative to the repository that
    holds it (the folder above sites/), which may be this one or any repository that installs ptmcontext."""
    site = read_config(path)
    validate(site, 'site')
    site['__root__'] = str(Path(path).resolve().parent.parent)
    return site


def with_variant(site: dict, name: str | None) -> dict:
    """The site with one of its variants applied (site['variants'][name]): its tables added to the marks, its own
    reference, and its outputs under <outputs.folder>/variants/<name>. The site itself when name is None."""
    if not name:
        return site
    v = (site.get('variants') or {}).get(name)
    if v is None:
        raise ValueError(f"{site['id']} has no variant {name!r} (it has {sorted(site.get('variants') or {}) or 'none'})")
    out = copy.deepcopy(site)
    out['marks'] = {**out['marks'], 'add': [*out['marks'].get('add', []), *v.get('marks_add', [])],
                    'attributes': {**out['marks'].get('attributes', {}), **v.get('attributes', {})}}
    if 'reference' in v:
        out['reference'] = v['reference']
    out['outputs'] = {**out['outputs'], 'folder': str(Path(out['outputs']['folder']) / 'variants' / name)}
    out['variant'] = {'name': name, 'label': v['label'], 'description': v.get('description', '')}
    if v.get('not_compared'):          # questions the variant's inputs cannot rebuild: run, but not checked against its reference
        out['variant']['not_compared'] = dict(v['not_compared'])
    return out


def read_marks_table(site: dict, paths: dict) -> tuple[pd.DataFrame, dict]:
    """The marks table: the marks input, with the rows of each marks.add table that its conditions keep appended (a
    column one table lacks is empty in the other). Also how many rows each added table gave."""
    read = lambda n: pd.read_csv(paths[n], sep='\t', dtype=str, keep_default_na=False, low_memory=False)  # noqa: E731
    table, added = read(site['marks']['input']), {}
    for add in site['marks'].get('add', []):
        extra = read(add['input'])
        keep = pd.Series(True, index=extra.index)
        for cond in add.get('include', []):
            keep &= _holds(extra, cond)
        for cond in add.get('exclude', []):
            keep &= ~_holds(extra, cond)
        # rows of the table counted on neither side (as marks.left_out), marked so select_marks leaves them out
        aside = pd.Series(False, index=extra.index)
        for cond in add.get('left_out', []):
            aside |= _holds(extra, cond)
        aside &= ~keep
        added[add['input']] = {'marks': int(keep.sum()), 'left_out': int(aside.sum())} if add.get('left_out') else int(keep.sum())
        table = pd.concat([table, extra[keep], extra[aside].assign(**{LEFT_OUT_COLUMN: 'yes'})], ignore_index=True).fillna('')
    return table, added


LEFT_OUT_COLUMN = '__left_out_by_add__'


def marks_spec(site: dict, table: pd.DataFrame) -> dict:
    """The marks section as select_marks reads it: with the rows an added table sets aside among those left out."""
    spec = site['marks']
    if LEFT_OUT_COLUMN in table.columns:
        spec = {**spec, 'left_out': [*spec.get('left_out', []), {'column': LEFT_OUT_COLUMN, 'equals': 'yes'}]}
    return spec


def _analysis_words(site: dict) -> dict:
    """For each residue analysis whose layer is built in or made from parameters: its shape and its class codes (a
    flags layer without labels of its own takes the profile's motif families). Plugins are not loaded to check a file."""
    out = {}
    try:
        fams = [f['name'] for f in load_profile(site['mark']).motif_families]
    except Exception:              # noqa: BLE001  (a profile problem is reported elsewhere)
        fams = []
    for a in site.get('analyses', []):
        if a.get('tests'):                               # a question of several tests: its tests are its classes
            from .question import question_layer
            try:
                layer = question_layer(a)
            except (ValueError, KeyError, TypeError):
                continue
            out[a['id']] = {'shape': 'flags', 'classes': set(layer.labels), 'needs': list(layer.needs)}
            continue
        if a.get('test') == 'protein_sets' or not (a.get('layer') in L.BUILT_IN or a.get('layer') in L.FACTORIES):
            continue
        try:
            layer = L.get(a['layer'], None, a.get('with'), a['id'])
        except (ValueError, KeyError, TypeError):
            continue
        classes = set(layer.labels) or (set(fams) if layer.shape == 'flags' else None)
        out[a['id']] = {'shape': layer.shape, 'classes': classes, 'needs': list(layer.needs)}
    return out


def roles_missing(site: dict) -> list[str]:
    """Residue analyses whose layer reads a role the site file does not fill, and questions of several tests that do
    not make (a test with neither inside nor value, two tests of one code, ...)."""
    roles = set(site.get('inputs', {}))
    out = [f"{aid}: reads role {r!r}, which inputs: does not fill" for aid, w in _analysis_words(site).items() for r in w['needs'] if r not in roles]
    out += [f"{a['id']}: proteins: reads role {a['proteins']['input']!r}, which inputs: does not fill" for a in site.get('analyses', [])
            if a.get('proteins') and a['proteins']['input'] not in roles]
    from .question import expand
    for a in site.get('analyses', []):
        if a.get('tests'):
            try:
                expand(a)
            except ValueError as exc:
                out.append(str(exc))
    return out


def mapping_problems(site: dict, root: str | Path) -> list[str]:
    """Column mappings (a manifest entry's columns) that name a column its file does not have, read from the files."""
    out, entries = [], I.load(manifest_of(site))
    for name in I.site_input_names(site):
        maps = entries.get(name, {}).get('columns')
        path = Path(root) / entries.get(name, {}).get('file', '')
        if not maps or not path.exists():
            continue
        for cols in (maps if isinstance(maps, list) else [maps]):
            have = set(pd.read_csv(path, sep=cols.get('sep', '\t'), nrows=0).columns)
            named = {cols[k] for k in ('accession', 'start', 'end', 'position', 'value', 'label', 'ref', 'subtype', 'class', 'ranges', 'residues',
                                       'marked_in', 'residue', 'sequence', 'gene', 'sequence_start', 'sequence_end') if cols.get(k)}
            named |= {c['column'] for c in cols.get('include', []) + cols.get('exclude', [])} | set(cols.get('unique_within') or [])
            named |= {c['same_as'] for c in cols.get('include', []) + cols.get('exclude', []) if c.get('same_as')}
            if named - have:
                out.append(f"input {name}: its column mapping names columns {path.name} does not have: {sorted(named - have)} (it has {sorted(have)})")
    from .web.tables import source_columns
    for tid, tb in ((site.get('website') or {}).get('tables') or {}).items():      # the tables the protein pages show
        path = Path(root) / entries.get(tb['input'], {}).get('file', '')
        if not path.exists():
            continue
        have = set(pd.read_csv(path, sep=tb.get('sep', '\t'), nrows=0).columns)
        missing = [c for c in source_columns(tb) if c not in have]
        if missing:
            out.append(f"website.tables.{tid}: {path.name} has no columns {missing}")
    from . import map_rows as MR                 # the protein map's rows: their own column mappings
    files = {role: [Path(root) / entries.get(n, {}).get('file', '') for n in I.role_inputs(v)[1]] for role, v in (site.get('inputs') or {}).items()}
    marks = entries.get(site['marks']['input'], {}).get('file')
    return out + MR.mapping_problems(site, files, Path(root) / marks if marks else None)


def count_row_id(row: dict) -> str:
    """A responses row's id in links and filters: its own, else its attribute value, else its where values joined by _."""
    if row.get('id'):
        return row['id']
    if row.get('value'):
        return row['value']
    return '_'.join(str(v) for v in (row.get('where') or {}).values()).lower().replace('-', '')


def count_problems(site: dict) -> list[str]:
    """What a count question (website.counts) names that the site file does not have: an attribute of the wrong kind, a
    per-mark table it does not keep, a table column it does not keep, a row without calls. Its id must not be an
    analysis or an attribute (the search reads 'key:value' terms by those names)."""
    ids = {x['id'] for x in site.get('analyses', [])}
    from .web.search import derived_attribute
    attrs = {**((site.get('marks') or {}).get('attributes') or {}), **derived_attribute(site)}
    tables = (site.get('marks') or {}).get('tables') or {}
    out = []
    for cid, c in ((site.get('website') or {}).get('counts') or {}).items():
        at = f'website.counts.{cid}'
        if cid in ids or cid in attrs:
            out.append(f"{at}: {cid!r} is already an analysis or an attribute; give the count another id")
        if c['kind'] == 'values':
            a = attrs.get(c.get('attribute', ''))
            if not a:
                out.append(f"{at}: no attribute {c.get('attribute')!r} in marks.attributes")
            elif a.get('kind', 'category') not in ('list', 'category'):
                out.append(f"{at}: attribute {c['attribute']!r} is a {a.get('kind')}; counting its values needs a list or a category")
            if c.get('number') and attrs.get(c['number'], {}).get('kind') != 'number':
                out.append(f"{at}: number {c['number']!r} is not a number attribute of the marks")
            for k in ('rows', 'calls', 'group', 'first'):
                if k in c:
                    out.append(f"{at}: {k} is for a responses count")
            continue
        for k in ('attribute', 'number', 'top', 'bins', 'unit', 'noun', 'distribution', 'two_or_more'):
            if k in c:
                out.append(f"{at}: {k} is for a values count")
        if not c.get('rows'):
            out.append(f"{at}: a responses count lists its rows")
        if not c.get('calls'):
            out.append(f"{at}: a responses count names its calls ({{down: ..., up: ...}})")
        seen = set()
        for i, r in enumerate(c.get('rows') or []):
            rid, where = count_row_id(r), f"{at}.rows[{i}] ({r.get('name')!r})"
            if not rid or rid in seen:
                out.append(f"{where}: its id {rid!r} is empty or not unique; give it an id")
            seen.add(rid)
            if not r.get('attribute') and not r.get('table'):
                out.append(f"{where}: its calls come from an attribute (attribute, value) or a table (table, where)")
            if r.get('attribute'):
                a = attrs.get(r['attribute'])
                if not a or not a.get('pair_with'):
                    out.append(f"{where}: {r['attribute']!r} is not a paired list attribute (marks.attributes ... pair_with)")
                if not r.get('value'):
                    out.append(f"{where}: with attribute, name the value whose partner is the call")
            if r.get('table'):
                t = tables.get(r['table'])
                if not t:
                    out.append(f"{where}: no table {r['table']!r} in marks.tables")
                    continue
                named = [*(r.get('where') or {}), *([] if r.get('attribute') else [r.get('call', 'call')]), *([r['change']] if r.get('change') else [])]
                miss = [x for x in named if x not in t['columns']]
                if miss:
                    out.append(f"{where}: marks.tables.{r['table']} does not keep {miss} (columns: {t['columns']})")
            elif r.get('where') or r.get('change') or r.get('call'):
                out.append(f"{where}: where, call and change read a table: name it")
    return out


def mark_table_problems(site: dict, root: str | Path) -> list[str]:
    """The per-mark tables' columns (marks.tables), read from the files' headers: the key and every kept column."""
    out, entries = [], I.load(manifest_of(site))
    marks_entry = entries.get(site['marks']['input'], {})
    marks_path = Path(root) / marks_entry.get('file', '')
    marks_cols = set(pd.read_csv(marks_path, sep='\t', nrows=0).columns) if marks_path.is_file() else None
    for name, t in ((site.get('marks') or {}).get('tables') or {}).items():
        e = entries.get(t['input'])
        if not e:
            out.append(f"marks.tables.{name}: input {t['input']!r} is not in the manifest")
            continue
        path = Path(root) / e['file']
        if not path.is_file():
            continue
        have = set(pd.read_csv(path, sep=(e.get('columns') or {}).get('sep', '\t'), nrows=0).columns)
        key = t['key']
        need = [key.get('table') or key['accession'], *([] if 'marks' in key else [key['position']]), *t['columns']]
        if set(need) - have:
            out.append(f"marks.tables.{name}: {path.name} has no column {sorted(set(need) - have)}")
        if 'marks' in key and marks_cols is not None and key['marks'] not in marks_cols:
            out.append(f"marks.tables.{name}: the marks table has no column {key['marks']!r}")
    return out


def website_problems(site: dict) -> list[str]:
    """What the website block names that the site file does not have: a tile, filter or example naming an analysis
    or a mark attribute that is not defined, or an attribute's colours for values it does not list. The schema checks
    each block's shape; this checks that the blocks agree with each other (ptmc check)."""
    ids = {x['id'] for x in site.get('analyses', [])}
    attrs = (site.get('marks') or {}).get('attributes') or {}
    web = site.get('website') or {}
    counts = web.get('counts') or {}
    out = count_problems(site)
    questions = ids | set(counts)                       # what a card, a header tile or an old link may open
    out += cell_problems(site) + set_view_problems(site) + table_view_problems(site)
    if (web.get('cell') or {}).get('id'):
        ids = ids | {web['cell']['id']}        # the maps of the cell are one question of the website's own
        questions = questions | {web['cell']['id']}
    sets = {a['id']: a for a in site.get('analyses', []) if a.get('test') == 'protein_sets'}
    for sec in (web.get('overview') or {}).get('sections', []):
        for c in sec.get('cards', []):
            aid = c if isinstance(c, str) else c.get('analysis')
            if aid not in questions:
                out.append(f"website.overview, section {sec.get('name')!r}: no analysis {aid!r}")
            if isinstance(c, dict):
                out += view_problems(c, sets, f"website.overview card {aid!r}")
    for g in web.get('filters') or []:
        out += [f"website.filters, group {g.get('name')!r}: no analysis {a!r}" for a in g.get('analyses', []) if a not in ids]
        out += [f"website.filters, group {g.get('name')!r}: no attribute {a!r} in marks.attributes" for a in g.get('attributes', []) if a not in attrs]
    for st in web.get('stats') or []:
        if isinstance(st, dict) and st['attribute'] not in attrs:
            out.append(f"website.stats: no attribute {st['attribute']!r} in marks.attributes")
        elif isinstance(st, dict) and attrs[st['attribute']].get('kind') != 'list':
            out.append(f"website.stats: attribute {st['attribute']!r} is not a list (its distinct values are counted)")
        if isinstance(st, dict) and st.get('opens') and st['opens'] not in questions:
            out.append(f"website.stats: {st['attribute']!r} opens {st['opens']!r}, which is not a question of this site")
    st = (web.get('compare') or {}).get('stratify')
    if st and (st not in attrs or attrs[st].get('kind') != 'list'):
        out.append(f"website.compare.stratify: {st!r} is not a list attribute of the marks")
    words = _analysis_words(site)
    for a in (web.get('sites') or {}).get('columns', []):
        if a not in ids:
            out.append(f"website.sites.columns: no analysis {a!r}")
        elif words.get(a, {}).get('shape') == 'flags':
            out.append(f"website.sites.columns: {a!r} has flags (several per residue): it shows as tags beside the window, not as a column")
    set_ids = {a['id'] for a in site.get('analyses', []) if a.get('test') == 'protein_sets'}
    pattrs = (site.get('proteins') or {}).get('attributes') or {}
    for lst in ((web.get('overview') or {}).get('starting_points') or {}).get('lists', []):
        for n in [lst['by'], (lst.get('where') or {}).get('attribute')]:
            if n and n != 'marks' and (n not in pattrs or pattrs[n].get('kind') != 'number'):
                out.append(f"website.overview.starting_points: {lst['title']!r} reads {n!r}, which is not a number attribute of proteins (proteins.attributes)")
    for g in web.get('filters') or []:
        for n in g.get('proteins', []):
            if n != 'marks' and n not in pattrs:
                out.append(f"website.filters {g['name']!r}: no protein attribute {n!r} (proteins.attributes, or marks)")
    for n in (web.get('sites') or {}).get('attributes', []):
        if n not in attrs:
            out.append(f"website.sites.attributes: no attribute {n!r}")
    for f in (web.get('protein') or {}).get('facts', []):
        if f.get('attribute'):
            if f['attribute'] not in attrs:
                out.append(f"website.protein.facts: no attribute {f['attribute']!r} in marks.attributes")
            continue
        if f.get('count'):
            continue
        if not f.get('analysis'):
            out.append("website.protein.facts: a card counts marks (count: marks), an attribute's values or a question's classes")
        elif f['analysis'] not in ids:
            out.append(f"website.protein.facts: no analysis {f['analysis']!r}")
        elif f['analysis'] not in set_ids and not f.get('classes') and not f.get('best'):
            out.append(f"website.protein.facts: {f['analysis']!r} is a residue question: name the classes to count")
        elif f['analysis'] not in set_ids and f.get('classes') and words.get(f['analysis'], {}).get('classes') is not None:
            bad = [c for c in f['classes'] if c not in words[f['analysis']]['classes']]
            if bad:
                out.append(f"website.protein.facts: {f['analysis']!r} has no class {bad} (it has {sorted(words[f['analysis']]['classes'])})")
    for name, lp in (web.get('legacy_params') or {}).items():
        if lp.get('variant') and lp['variant'] not in (site.get('variants') or {}):
            out.append(f"website.legacy_params: {name!r} opens the variant {lp['variant']!r}, which this site does not have")
        kind, _, id_ = (lp.get('key') or ':').partition(':')
        if lp.get('key') and not ((kind == 'a' and id_ in ids) or (kind == 'p' and id_ in ids) or (kind in 'tn' and id_ in attrs) or (kind == 'r' and (id_ == 'marks' or id_ in ((site.get('proteins') or {}).get('attributes') or {})))):
            out.append(f"website.legacy_params: {name!r} sets {lp['key']!r}, which is not a filter of this site")
    for key, to in (web.get('search_aliases') or {}).items():
        if to not in ids and to not in attrs:
            out.append(f"website.search_aliases: {key!r} means {to!r}, which is neither a question nor an attribute of this site")
    out += card_problems(site)
    sm = web.get('shown_marks')
    if sm:                                    # the shown marks' tag: attributes of the marks, or of a variant's marks
        known = set(attrs) | {n for v in (site.get('variants') or {}).values() for n in (v.get('attributes') or {})}
        named = [('counted.when', c['attribute']) for c in (sm.get('counted') or {}).get('when', [])]
        named += [('tests', n) for n in (sm.get('tests') or {}).get('attributes', [])] + [('also', n) for n in sm.get('also', [])]
        out += [f"website.shown_marks.{where}: no attribute {n!r} in marks.attributes or a variant's attributes" for where, n in named if n not in known]
        bad = sorted(set(re.findall(r'\{(\w+)\}', sm.get('note', ''))) - {'all', 'counted', 'shown', 'others'})
        if bad:
            out.append(f"website.shown_marks.note: no number {bad} (it has {{all}}, {{counted}}, {{shown}}, {{others}})")
    for ref in [site.get('reference') or {}, *[(v.get('reference') or {}) for v in (site.get('variants') or {}).values()]]:
        out += [f"reference.tables: {aid!r} is not a protein-set question" for aid in (ref.get('tables') or {}) if aid not in sets]
    for k, card in enumerate((web.get('protein') or {}).get('sets', [])):
        out += [f"website.protein.sets[{k}] ({card['title']!r}): {a!r} is not a protein-set question" for a in card['analyses'] if a not in sets]
    page_ids = {pg['id'] for pg in web.get('pages') or []}
    for key, to in (web.get('legacy_links') or {}).items():
        if to.startswith('#'):
            if to[1:].split('/')[0] not in page_ids | {'overview', 'statistics', 'method', 'proteins', 'sites', 'idrs'}:
                out.append(f"website.legacy_links: {key!r} opens {to!r}, which is not a page of this site")
        elif not to.startswith('?') and to not in questions:
            out.append(f"website.legacy_links: {key!r} opens {to!r}, which is not a question of this site")
    for where, blk in (('start', web.get('start') or {}), ('landing', web.get('landing') or {})):
        if (blk.get('share') or {}).get('analysis') not in (None, *ids):
            out.append(f"website.{where}.share: {blk['share']['analysis']!r} is not a question of this site")
        out += [f"website.{where}.findings: {f['analysis']!r} is not a question of this site" for f in blk.get('findings') or [] if f['analysis'] not in ids]
    out += page_problems(site)
    from .web.search import problems as search_problems, search_keys
    out += search_problems(site)
    keys = search_keys(site)
    for ex in [*(web.get('examples') or []), *(x.get('query', '') for x in (web.get('start') or {}).get('examples') or [])]:
        key = ex.split(':', 1)[0] if ':' in ex else None
        if key is not None and key not in keys:
            out.append(f"website.examples: {ex!r} names no search key of this site (a question, an attribute or a website.search key)")
    for name, a in attrs.items():
        if a.get('values') and a.get('colours'):
            out += [f"marks.attributes.{name}: a colour for {v!r}, which is not among its values" for v in a['colours'] if v not in a['values']]
        if a.get('records') and a.get('kind') != 'list':
            out.append(f"marks.attributes.{name}: records are for a list attribute")
    # headed groups of a question's classes: each class in one group, and (where the classes are known) one of its own
    for a in site.get('analyses', []):
        seen: set = set()
        for g in a.get('groups') or []:
            twice = [c for c in g['classes'] if c in seen]
            seen.update(g['classes'])
            if twice:
                out.append(f"analyses.{a['id']}.groups: {twice} in more than one group")
            known = words.get(a['id'], {}).get('classes')
            if known is not None and set(g['classes']) - known:
                out.append(f"analyses.{a['id']}.groups, group {g['name']!r}: no class {sorted(set(g['classes']) - known)} (it has {sorted(known)})")
    from .map_rows import problems as map_problems
    from .web.conserve import problems as conserve_problems       # the conservation card (website.protein.conservation)
    from .web.structure import problems as structure_problems     # the 3D viewer's tables (website.protein.structure)
    return out + map_problems(site) + structure_problems(site) + conserve_problems(site)


def table_view_problems(site: dict) -> list[str]:
    """What the Proteins and Sites pages' columns and downloads (website.proteins, website.sites, website.selection_cards)
    name that the site file does not have: a protein attribute, a mark attribute, a question, a class or a table."""
    web = site.get('website') or {}
    attrs = (site.get('marks') or {}).get('attributes') or {}
    pattrs = (site.get('proteins') or {}).get('attributes') or {}
    words = _analysis_words(site)
    kinds = {a['id']: a.get('test') for a in site.get('analyses', [])}
    tables = web.get('tables') or {}
    out = []

    def need(where, name, pool, what):
        if name and name not in pool:
            out.append(f"{where}: no {what} {name!r}")

    def classes(where, spec):
        a = spec.get('analysis')
        need(where, a, kinds, 'analysis')
        labels = words.get(a, {}).get('classes') or set()
        if a in kinds and labels:
            out.extend(f"{where}: {a!r} has no class {c!r}" for c in spec.get('classes', []) if c not in labels)
    pv = web.get('proteins') or {}
    for c in pv.get('columns', []):
        w = f"website.proteins.columns {c['id']!r}"
        need(w, c.get('attribute'), pattrs, 'protein attribute (proteins.attributes)')
        need(w, (c.get('counts') or {}).get('attribute'), attrs, 'attribute of the marks')
        if c.get('classes'):
            classes(w, c['classes'])
        for n in re.findall(r'\{(\w+)\}', c.get('template', '')) + [(c.get('where') or {}).get('attribute'), c.get('sort')]:
            need(w, n, pattrs, 'protein attribute (proteins.attributes)')
    for c in pv.get('download', []):
        w = f"website.proteins.download {c['name']!r}"
        need(w, c.get('attribute'), pattrs, 'protein attribute (proteins.attributes)')
        need(w, (c.get('counts') or {}).get('attribute'), attrs, 'attribute of the marks')
        if c.get('classes'):
            classes(w, c['classes'])
    sv = web.get('sites') or {}
    for c in sv.get('table', []):
        w = f"website.sites.table {c['id']!r}"
        need(w, c.get('attribute'), attrs, 'attribute of the marks')
        for a in c.get('analyses', []):
            need(w, a, kinds, 'analysis')
        for n in ([c['sort']] if isinstance(c.get('sort'), str) else c.get('sort') or []):
            need(w, n, attrs, 'attribute of the marks')
    for c in sv.get('download', []):
        w = f"website.sites.download {c['name']!r}"
        need(w, c.get('attribute'), attrs, 'attribute of the marks')
        need(w, c.get('analysis'), kinds, 'analysis')
        need(w, c.get('protein'), pattrs, 'protein attribute (proteins.attributes)')
        need(w, c.get('table'), tables, 'table in website.tables')
        if c.get('table') and not (c.get('column') or c.get('field')):
            out.append(f"{w}: a table's column (column, or field)")
    for n in sv.get('short') or {}:
        need('website.sites.short', n, attrs, 'attribute of the marks')
    need('website.sites.site_tags', (sv.get('site_tags') or {}).get('attribute'), attrs, 'attribute of the marks')
    for a in sv.get('tags') or {}:
        need('website.sites.tags', a, kinds, 'analysis')
    for k in web.get('selection_cards') or {}:
        if k.startswith('@'):
            need('website.selection_cards', k[1:], attrs, 'attribute of the marks')
        elif kinds.get(k) != 'protein_sets':
            out.append(f"website.selection_cards: {k!r} is not a protein-set question")
    return out


def cell_drawings() -> dict:
    """The kit's drawings of a cell and the parts each has (config/cell_drawings.json), which website.cell rows colour."""
    return json.loads((Path(__file__).parent / 'config' / 'cell_drawings.json').read_text())['drawings']


def cell_problems(site: dict) -> list[str]:
    """What website.cell names that the site does not have: a map that is not a protein-set question, a row's set in a
    map it does not list, a part no drawing it shows has (ptmc check)."""
    cell = (site.get('website') or {}).get('cell')
    if not cell:
        return []
    sets = {a['id']: a for a in site.get('analyses', []) if a.get('test') == 'protein_sets'}
    out = []
    if cell['id'] in {a['id'] for a in site.get('analyses', [])}:
        out.append(f"website.cell.id: {cell['id']!r} is also an analysis: give the maps of the cell an id of their own")
    maps = [m['analysis'] for m in cell['maps']]
    for m in cell['maps']:
        for key in ('analysis', 'regions'):
            if m.get(key) and m[key] not in sets:
                out.append(f"website.cell.maps: {m[key]!r} is not a protein-set question of this site")
    drawings = cell_drawings()
    parts = {p for d in cell.get('drawings', []) for p in drawings[d['drawing']]['parts']}
    rows = [('regions', r) for r in cell.get('regions', [])] + [(g['group'], r) for g in cell['compartments'] for r in g['rows']]
    for where, r in rows:
        out += [f"website.cell.compartments ({where}), {r['label']!r}: {a!r} is not one of website.cell.maps" for a in r.get('sets', {}) if a not in maps]
        bad = [p for p in [r.get('part'), *r.get('also', [])] if p and p not in parts]
        if bad:
            out.append(f"website.cell ({where}), {r['label']!r}: no drawing shown has the part {bad} (the drawings' parts: {sorted(parts)})")
    if cell.get('regions') and not any(m.get('regions') for m in cell['maps']):
        out.append('website.cell.regions: no map names its regions question (maps: regions:)')
    return out


def set_view_problems(site: dict) -> list[str]:
    """What website.set_views names that the site does not have: a question without values, a column its values do not
    list (ptmc check)."""
    analyses = {a['id']: a for a in site.get('analyses', [])}
    out = []
    for v in (site.get('website') or {}).get('set_views') or []:
        a = analyses.get(v['analysis'])
        if not a or a.get('test') != 'protein_sets':
            out.append(f"website.set_views: {v['analysis']!r} is not a protein-set question of this site")
            continue
        cols = {(c['name'] if isinstance(c, dict) else c): (c if isinstance(c, dict) else {}) for c in (a.get('values') or {}).get('columns', [])}
        if not cols:
            out.append(f"website.set_views: {v['analysis']!r} has no values (values: columns)")
            continue
        box = (v.get('box') or {}).get('value')
        if box and not cols.get(box, {}).get('background'):
            out.append(f"website.set_views, {v['analysis']!r}: box: {box!r} is not a column of its values with background: true")
        for ch in v.get('chips', []):
            out += [f"website.set_views, {v['analysis']!r}: chips {ch['title']!r}: {c!r} is not a column of its values"
                    for c in [ch.get('value'), *(ch.get('share') or [])] if c and c not in cols]
        rules = {r['set'] for r in (a.get('sets') or {}).get('rules', [])}
        named = [v.get('meter'), *[s for ch in v.get('chips', []) for s in ch.get('sets', [])]]
        if rules:
            out += [f"website.set_views, {v['analysis']!r}: no set {s!r} (its rules make {sorted(rules)})" for s in named if s and s not in rules]
        r = v.get('residue')
        if r and (r not in analyses or analyses[r].get('test') == 'protein_sets'):
            out.append(f"website.set_views, {v['analysis']!r}: residue: {r!r} is not a residue question of this site")
    return out


def card_problems(site: dict) -> list[str]:
    """What the protein page reads that the site file does not have: a table not in website.tables or not in the
    format a block reads, a table that does not fit its format, an attribute not in marks.attributes, a question not
    among the analyses, a numbering rule that is not a regular expression."""
    import re

    from .web.tables import problems as table_problems
    web = site.get('website') or {}
    tables, attrs = web.get('tables') or {}, (site.get('marks') or {}).get('attributes') or {}
    ids = {x['id'] for x in site.get('analyses', [])}
    prot = web.get('protein') or {}
    out = [x for name, spec in tables.items() for x in table_problems(name, spec)]

    def table(where, name, *formats):
        if name not in tables:
            out.append(f"website.protein.{where}: no table {name!r} in website.tables")
        elif formats and tables[name].get('format') not in formats:
            out.append(f"website.protein.{where}: table {name!r} is {tables[name].get('format')}, not {' or '.join(formats)}")

    def attr(where, name):
        if name and name not in attrs:
            out.append(f"website.protein.{where}: no attribute {name!r} in marks.attributes")
    card = prot.get('card') or {}
    for a in card.get('hide') or []:
        attr('card.hide', a)
    ev = card.get('evidence') or {}
    attr('card.evidence.status', ev.get('status'))
    if ev.get('tags'):
        attr('card.evidence.tags', ev['tags'].get('attribute'))
        if ev['tags'].get('partners'):
            table('card.evidence.tags.partners', ev['tags']['partners'], 'site_evidence')
    if ev.get('entries'):
        table('card.evidence.entries', ev['entries']['table'], 'site_evidence')
    for n in (ev.get('sequences') or {}).get('tables', []):
        table('card.evidence.sequences', n, 'bound_windows')
    if ev.get('around'):
        table('card.evidence.around', ev['around']['table'], 'residue_evidence')
    if ev.get('protein'):
        if ev['protein'].get('table'):
            table('card.evidence.protein', ev['protein']['table'], 'protein_values')
        pattrs = (site.get('proteins') or {}).get('attributes') or {}
        out.extend(f"website.protein.card.evidence.protein: no attribute {v['attribute']!r} in proteins.attributes" for v in ev['protein'].get('values', []) if v.get('attribute') and v['attribute'] not in pattrs)
    for k, s in enumerate((card.get('states') or []) + (card.get('changes') or [])):
        attr(f'card.states/changes[{k}]', s.get('attribute'))
        if s.get('table'):
            table(f'card.states/changes[{k}]', s['table'], 'site_values')
    if card.get('calls'):
        for n in card['calls'].get('tables', []):
            table('card.calls', n, 'site_measurements')
        for a in (card['calls'].get('attributes') or {}):
            attr('card.calls', a)
    if card.get('records'):
        table('card.records', card['records']['table'], 'site_records')
        attr('card.records', card['records'].get('groups'))
    if card.get('writer'):
        w = card['writer']
        for rule in (w.get('suggest') or {}).get('rules', []):
            attr('card.writer.suggest', rule.get('attribute'))
        if w.get('partners'):
            table('card.writer.partners', w['partners']['table'], 'protein_partners')
    if card.get('sources'):
        table('card.sources', card['sources']['table'], 'source_records')
        attr('card.sources', card['sources'].get('attribute'))
    for k, x in enumerate(card.get('tables') or []):
        table(f'card.tables[{k}]', x['table'], 'site_table')
    if card.get('cite'):
        attr('card.cite', card['cite'].get('attribute'))
        if card['cite'].get('lookup'):
            table('card.cite', card['cite']['lookup'], 'lookup')
    for k, f in enumerate(prot.get('facts') or []):
        if isinstance(f.get('tip'), dict) and f['tip'].get('table'):
            table(f'facts[{k}].tip', f['tip']['table'], 'protein_values')
        if isinstance(f.get('tip'), dict):
            pattrs = (site.get('proteins') or {}).get('attributes') or {}
            out.extend(f"website.protein.facts[{k}].tip: no attribute {v['attribute']!r} in proteins.attributes" for v in f['tip'].get('values', []) if v.get('attribute') and v['attribute'] not in pattrs)
    tb = prot.get('table') or {}
    attr('table.filter', tb.get('filter'))
    for c in tb.get('columns', []):
        attr(f"table.columns.{c['id']}", c.get('attribute'))
        out.extend(f"website.protein.table.columns.{c['id']}: no analysis {a!r}" for a in c.get('analyses', []) if a not in ids)
    if tb.get('nearest_domain'):
        table('table.nearest_domain', tb['nearest_domain']['table'], 'site_values')
    for k, n in enumerate(prot.get('numbering') or []):
        for key in ('genes', 'names'):
            try:
                re.compile(n.get(key, ''))
            except re.error as e:
                out.append(f"website.protein.numbering[{k}].{key}: not a regular expression ({e})")
    return out


def view_problems(card: dict, sets: dict, where: str) -> list[str]:
    """What an Overview card's views, more sets and member sets name that the site does not have: each must be a
    protein-set question; a card's first view is the card's own question; members gather the sets of family questions
    (sets.families) and an ontology view needs its question's hierarchy."""
    out = []
    views = card.get('views') or []
    if views and views[0]['analysis'] != card['analysis']:
        out.append(f"{where}: its first view is {views[0]['analysis']!r}; the first view is the card's own question")
    for v in [card, *views]:
        aid = v.get('analysis')
        if v is not card and aid not in sets:
            out.append(f"{where}: view {v.get('label')!r} names {aid!r}, which is not a protein-set question")
        if v.get('more') and v['more']['analysis'] not in sets:
            out.append(f"{where}: more names {v['more']['analysis']!r}, which is not a protein-set question")
        mem = v.get('members')
        if mem:
            if mem['analysis'] not in sets:
                out.append(f"{where}: members names {mem['analysis']!r}, which is not a protein-set question")
            for o in mem['of']:
                if not (sets.get(o['analysis']) or {}).get('sets', {}).get('families'):
                    out.append(f"{where}: members of {o['analysis']!r}, which does not gather sets into families (sets.families)")
        if v.get('ontology') is not None and aid in sets and not sets[aid].get('hierarchy'):
            out.append(f"{where}: an ontology view of {aid!r} needs its hierarchy (the sets' parents)")
    return out


def page_problems(site: dict) -> list[str]:
    """What the website's pages (website.pages) and their tables (website.tables) name that the site does not have:
    an analysis, a class, an attribute, a table or one of its columns, a section; and tables mapped wrongly."""
    web = site.get('website') or {}
    ids = {x['id']: x for x in site.get('analyses', [])}
    attrs = (site.get('marks') or {}).get('attributes') or {}
    tables = web.get('tables') or {}
    words = _analysis_words(site)
    out = []

    def classes_of(aid):
        a = ids.get(aid) or {}
        if a.get('tests'):
            from .question import expand
            try:
                return {t['code'] for t in expand(a)} | {t['category'] for t in expand(a)}
            except ValueError:
                return None
        return (words.get(aid) or {}).get('classes')

    def rowrefs(where, refs):
        for r in refs or []:
            if r['analysis'] not in ids:
                out.append(f"{where}: no analysis {r['analysis']!r}")
                continue
            cl = classes_of(r['analysis'])
            if cl is not None and ids[r['analysis']].get('test') != 'protein_sets' and r['category'] not in cl:
                out.append(f"{where}: {r['analysis']!r} has no class {r['category']!r}")

    def attr(where, name, kind=None):
        if name not in attrs:
            out.append(f"{where}: no attribute {name!r} in marks.attributes")
        elif kind and attrs[name].get('kind') != kind:
            out.append(f"{where}: attribute {name!r} is not a {kind}")

    def table(where, name, cols=()):
        if name not in tables:
            out.append(f"{where}: no table {name!r} in website.tables")
            return
        have = (set(tables[name].get('columns') or {}) - {'site'}) | set(tables[name].get('values') or []) | {'accession', 'position'}
        out.extend(f"{where}: table {name!r} has no column {c!r}" for c in cols if c and c not in have)
    for pg in web.get('pages') or []:
        here = f"website.pages.{pg['id']}"
        secs = {s_['id'] for g in pg['groups'] for s_ in g['sections']}
        rowrefs(f'{here}.answer', (pg.get('answer') or {}).get('rows'))
        ov = pg.get('overview') or {}
        rowrefs(f'{here}.overview', ov.get('rows'))
        if ov.get('bar'):
            attr(f'{here}.overview.bar', ov['bar'], 'category')
        for h in pg.get('highlights') or []:
            rowrefs(f'{here}.highlights', h.get('rows'))
            for c in h.get('counts') or []:
                attr(f'{here}.highlights', c['attribute'], 'list')
            if h.get('share'):
                table(f'{here}.highlights', h['share']['table'], [h['share']['of'], h['share']['flag']])
            if h.get('section') and h['section'] not in secs:
                out.append(f"{here}.highlights: no section {h['section']!r}")
        for g in pg['groups']:
            for sec in g['sections']:
                w = f"{here}.{sec['id']}"
                for b in sec['blocks']:
                    k = b['kind']
                    if k == 'forest':
                        rowrefs(w, b.get('rows'))
                    elif k in ('lines', 'sets'):
                        if b.get('analysis') not in ids:
                            out.append(f"{w}: {k} needs analysis: one of the site's questions (not {b.get('analysis')!r})")
                        elif k == 'sets' and ids[b['analysis']].get('test') != 'protein_sets':
                            out.append(f"{w}: sets reads a protein-set question; {b['analysis']!r} is not one")
                    elif k == 'shares':
                        attr(w, b.get('attribute', ''), 'category')
                    elif k in ('combinations', 'matrix'):
                        attr(w, b.get('attribute', ''), 'list')
                        for r in (b.get('rows') or []) if k == 'matrix' else []:
                            f = r.get('filter', '')
                            if f.startswith('a:') and f[2:] not in ids:
                                out.append(f"{w}: matrix row filter {f!r}: no analysis {f[2:]!r}")
                            elif f.startswith('t:') and f[2:] not in attrs:
                                out.append(f"{w}: matrix row filter {f!r}: no attribute {f[2:]!r}")
                    elif k == 'checker':
                        for a_ in b.get('attributes') or []:
                            attr(w, a_)
                        for t in b.get('tables') or []:
                            table(w, t)
                    elif k in ('table', 'bars', 'pairs', 'histogram'):
                        if not b.get('table'):
                            out.append(f"{w}: {k} needs table:")
                            continue
                        cols = list(b.get('columns') or []) + [b.get(x) for x in ('group_by', 'chips', 'sort', 'label', 'partner', 'value', 'by', 'among', 'members')]
                        cols += [(b.get('groups') or {}).get('column')] + [(b.get(x) or {}).get('column') if isinstance(b.get(x), dict) else None for x in ('rows', 'cols')]
                        table(w, b['table'], cols)
    return out


def root_of(site: dict) -> Path:
    return Path(site.get('__root__', REPO))


def manifest_of(site: dict) -> Path:
    root = root_of(site)
    if site.get('manifest'):
        return root / site['manifest']
    return root / 'inputs.json' if (root / 'inputs.json').exists() else I.MANIFEST


def _holds(frame: pd.DataFrame, cond: dict) -> pd.Series:
    col = frame[cond['column']].astype(str)
    if 'equals' in cond:
        return col == cond['equals']
    if 'in' in cond:
        return col.isin(set(cond['in']))
    return col.str.contains(cond['contains'], regex=False)


def listed_proteins(spec: dict, ctx: L.Context) -> set:
    """The proteins a residue question counts (proteins: the accessions in a column of a table that fills a role, on
    the rows its include and exclude conditions keep): only their marks and candidate residues are counted."""
    t = pd.read_csv(ctx.path(spec['input']), sep='\t', dtype=str, keep_default_na=False, low_memory=False)
    if spec['column'] not in t.columns:
        raise ValueError(f"proteins: role {spec['input']} has no column {spec['column']!r}")
    keep = pd.Series(True, index=t.index)
    for cond in spec.get('include', []):
        keep &= _holds(t, cond)
    for cond in spec.get('exclude', []):
        keep &= ~_holds(t, cond)
    return set(t.loc[keep, spec['column']].astype(str).str.strip()) - {''}


def left_out_marks(spec: dict, table: pd.DataFrame) -> pd.DataFrame:
    """The rows a site keeps pending (marks.left_out conditions, any of which holds): counted on neither side of a
    residue test, neither as marks nor as other residues."""
    conds = spec.get('left_out') or []
    if not conds:
        return pd.DataFrame(columns=['accession', 'position'])
    hit = pd.Series(False, index=table.index)
    for cond in conds:
        hit |= _holds(table, cond)
    for cond in spec.get('include', []):              # a row include or exclude drops is not pending: it is dropped
        hit &= _holds(table, cond)
    for cond in spec.get('exclude', []):
        hit &= ~_holds(table, cond)
    rows = table[hit]
    out = pd.DataFrame({'accession': rows[spec['accession']].astype(str).str.strip(), 'position': pd.to_numeric(rows[spec['position']], errors='coerce')})
    return out.dropna().astype({'position': int}).drop_duplicates().reset_index(drop=True)


def select_marks(spec: dict, table: pd.DataFrame, snapshot: Snapshot, profile) -> tuple[pd.DataFrame, dict]:
    """The marked residues a site counts, and a report of what was left out and why. Rows a left_out condition holds
    for are not marks (left_out_marks counts them on neither side)."""
    keep = pd.Series(True, index=table.index)
    for cond in spec.get('include', []):
        keep &= _holds(table, cond)
    for cond in spec.get('exclude', []):
        keep &= ~_holds(table, cond)
    for cond in spec.get('left_out', []):
        keep &= ~_holds(table, cond)
    rows = table[keep]
    pos = pd.to_numeric(rows[spec['position']], errors='coerce')
    marked = pd.DataFrame({'accession': rows[spec['accession']].astype(str).str.strip(), 'position': pos})
    report = {'rows': int(len(table)), 'selected': int(keep.sum()), 'no_position': int(pos.isna().sum())}
    marked = marked[marked['position'].notna()].astype({'position': int})
    in_snap = marked['accession'].isin(snapshot.sequences)
    report['not_on_snapshot'] = int((~in_snap).sum())
    marked = marked[in_snap].drop_duplicates()
    bad = check_residues(profile, snapshot, marked)
    report['residue_mismatch'] = int(len(bad))
    if len(bad):
        if spec.get('residue_mismatch', 'error') == 'error':
            raise ValueError(f'{len(bad)} marks are not on {profile.residues} of the snapshot, e.g. {bad.head(3).to_dict("records")}')
        marked = marked.drop(index=bad.index)
    report['counted'] = int(len(marked))
    report['proteins'] = int(marked['accession'].nunique())
    return marked.reset_index(drop=True), report


def mark_attributes(spec: dict, table: pd.DataFrame, marked: pd.DataFrame, rows: str = 'kept') -> pd.DataFrame:
    """For each counted mark, the columns the site file keeps for the website (marks.attributes), as text; a mark on
    several rows of the table takes its first row's. Columns 'a.<name>' (and 'a.<name>.link'), keyed by accession and
    position. rows='left_out' reads the rows marks.left_out keeps pending instead (for the sites shown, not counted).
    Nothing here changes which marks are counted."""
    attrs = spec.get('attributes') or {}
    if not attrs:
        return pd.DataFrame(columns=['accession', 'position'])
    clash = [n for n in attrs if not (n[:1].isalpha() and n.replace('_', 'a').isalnum())]
    if clash:
        raise ValueError(f'marks.attributes: names must be letters, digits and _ only: {clash}')
    keep = pd.Series(True, index=table.index)            # the rows select_marks keeps, so a dropped row lends nothing
    for cond in spec.get('include', []):
        keep &= _holds(table, cond)
    for cond in spec.get('exclude', []):
        keep &= ~_holds(table, cond)
    pending = pd.Series(False, index=table.index)
    for cond in spec.get('left_out', []):
        pending |= _holds(table, cond)
    table = table[keep & (pending if rows == 'left_out' else ~pending)]
    cols, paired = {}, {}
    for name, a in attrs.items():
        cols[f'a.{name}'] = a['column']
        if a.get('link'):
            cols[f'a.{name}.link'] = a['link']['column']
        if a.get('pair_with'):
            paired[f'a.{name}'] = a['pair_with']
    missing = sorted({c for c in [*cols.values(), *paired.values()] if c not in table.columns})
    if missing:
        raise ValueError(f'marks.attributes name columns the marks table does not have: {missing}')
    t = pd.DataFrame({'accession': table[spec['accession']].astype(str).str.strip(),
                      'position': pd.to_numeric(table[spec['position']], errors='coerce')})
    for out, col in cols.items():
        t[out] = table[col].astype(str)
    for name, a in attrs.items():
        out = f'a.{name}'
        if a.get('present'):                 # whether the column holds anything: 'yes' or 'no'
            t[out] = t[out].str.strip().ne('').map({True: 'yes', False: 'no'})
        elif out in paired:                  # two lists in step: each value is "<value>:<its partner>"
            sep = a.get('separator', '; ')
            t[out] = [sep.join(f'{x}:{y}' for x, y in _zip_lists(u, v, sep, out)) for u, v in zip(t[out], table[paired[out]].astype(str))]
    t = t.dropna(subset=['position']).astype({'position': int}).drop_duplicates(['accession', 'position'])
    return marked[['accession', 'position']].merge(t, on=['accession', 'position'], how='left').fillna('')


def shown_marks(spec: dict, table: pd.DataFrame, pending: pd.DataFrame, snap: Snapshot, marked: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The residues marks.left_out keeps pending, for the website to show beside the marks and count nowhere: at a
    residue the snapshot has and not itself a counted mark, with their window and attributes (as marks.tsv's columns)
    (shown_marks.tsv). And the proteins among them with no counted mark (shown_proteins.tsv: accession, gene, name,
    entry, length, sequence_md5), so the website can give each a page. Nothing here is counted or tested."""
    from .snapshot import window
    cols = ['accession', 'position', 'residue', 'window_15']
    m = pending.copy() if len(pending) else pd.DataFrame(columns=['accession', 'position'])
    if len(m):
        m = m[[a in snap and snap.residue_at(a, p) != '' for a, p in zip(m['accession'], m['position'])]]
        counted = set(zip(marked['accession'], marked['position']))
        m = m[[(a, p) not in counted for a, p in zip(m['accession'], m['position'])]]
    m['residue'] = [snap.residue_at(a, p) for a, p in zip(m['accession'], m['position'])]
    m['window_15'] = [window(snap.sequences[a], p, 7) for a, p in zip(m['accession'], m['position'])]
    attrs = mark_attributes(spec, table, m[['accession', 'position']], rows='left_out') if len(m) else None
    if attrs is not None and len(attrs.columns) > 2:
        m = m.merge(attrs, on=['accession', 'position'], how='left').fillna('')
    m = (m if len(m) else pd.DataFrame(columns=cols)).sort_values(['accession', 'position']).reset_index(drop=True)
    alone = sorted(set(m['accession']) - set(marked['accession']))
    prot = pd.DataFrame([{'accession': a, **{k: snap.describe(a)[k] for k in ('gene', 'name', 'entry')},
                          'length': snap.length(a), 'sequence_md5': snap.sequence_md5(a)} for a in alone],
                        columns=['accession', 'gene', 'name', 'entry', 'length', 'sequence_md5'])
    return m, prot


def _kept_rows(spec: dict, table: pd.DataFrame) -> pd.DataFrame:
    """The marks table's rows select_marks keeps (include, exclude, left_out), so a dropped row lends nothing."""
    keep = pd.Series(True, index=table.index)
    for cond in spec.get('include', []):
        keep &= _holds(table, cond)
    for cond in spec.get('exclude', []) + spec.get('left_out', []):
        keep &= ~_holds(table, cond)
    return table[keep]


def mark_tables(spec: dict, table: pd.DataFrame, marked: pd.DataFrame, paths: dict, formats: dict | None = None) -> tuple[dict, dict]:
    """For each per-mark table of the site (marks.tables): its rows for the counted marks, as accession, position and
    the columns it keeps (text), in the table's order; and a report of how many rows it had and kept. A row names its
    mark through a column of the marks table (key: {marks, table}: a mark takes its first kept row's value, as
    mark_attributes) or by its own accession and position columns. Rows of marks not counted are dropped. Nothing here
    changes which marks are counted or any test."""
    tables = spec.get('tables') or {}
    out, report = {}, {}
    if not tables:
        return out, report
    bad = [n for n in tables if not (n[:1].isalpha() and n.replace('_', 'a').isalnum())]
    if bad:
        raise ValueError(f'marks.tables: names must be letters, digits and _ only: {bad}')
    kept = _kept_rows(spec, table)
    for name, t in tables.items():
        path = paths[t['input']]
        sep = ((formats or {}).get(str(path)) or {}).get('sep', '\t')
        rows = pd.read_csv(path, sep=sep, dtype=str, keep_default_na=False, low_memory=False)
        key, cols = t['key'], list(t['columns'])
        need = [key.get('table') or key['accession'], *([] if 'marks' in key else [key['position']]), *cols]
        missing = [c for c in dict.fromkeys(need) if c not in rows.columns]
        if missing:
            raise ValueError(f"marks.tables.{name}: {path.name} has no column {missing} (it has {list(rows.columns)})")
        if {'accession', 'position'} & set(cols):
            raise ValueError(f"marks.tables.{name}: 'accession' and 'position' name the mark; keep other columns")
        if 'marks' in key:
            if key['marks'] not in kept.columns:
                raise ValueError(f"marks.tables.{name}: the marks table has no column {key['marks']!r}")
            ids = pd.DataFrame({'accession': kept[spec['accession']].astype(str).str.strip(),
                                'position': pd.to_numeric(kept[spec['position']], errors='coerce'), '_key': kept[key['marks']].astype(str)})
            ids = ids.dropna(subset=['position']).astype({'position': int}).drop_duplicates(['accession', 'position'])
            ids = marked[['accession', 'position']].merge(ids, on=['accession', 'position'], how='inner')
            j = rows[[key['table'], *cols]].rename(columns={key['table']: '_key'}).merge(ids, on='_key', how='inner')
        else:
            r = pd.DataFrame({'accession': rows[key['accession']].astype(str).str.strip(),
                              'position': pd.to_numeric(rows[key['position']], errors='coerce'), **{c: rows[c] for c in cols}})
            r = r.dropna(subset=['position']).astype({'position': int})
            j = r.merge(marked[['accession', 'position']], on=['accession', 'position'], how='inner')
        frame = j[['accession', 'position', *cols]].reset_index(drop=True)
        out[name] = frame
        report[name] = {'input': t['input'], 'rows': int(len(rows)), 'kept': int(len(frame)),
                        'marks': int(len(frame[['accession', 'position']].drop_duplicates()))}
    return out, report


def _zip_lists(u: str, v: str, sep: str, name: str) -> list:
    xs, ys = ([p.strip() for p in str(w).split(sep.strip() or sep) if p.strip()] for w in (u, v))
    if len(xs) != len(ys):
        raise ValueError(f'marks.attributes {name}: pair_with lists differ in length ({u!r} and {v!r})')
    return list(zip(xs, ys))


def protein_attributes(spec: dict, table: pd.DataFrame, accessions) -> pd.DataFrame:
    """For each marked protein, the columns the site file keeps for the website (proteins.attributes), as text: one row
    per protein (the table's first row for it), 'p.<name>' columns; a protein the table lacks has them empty."""
    attrs = spec.get('attributes') or {}
    bad = [n for n in attrs if not (n[:1].isalpha() and n.replace('_', 'a').isalnum())]
    if bad:
        raise ValueError(f'proteins.attributes: names must be letters, digits and _ only: {bad}')
    missing = sorted({a['column'] for a in attrs.values()} - set(table.columns) | ({spec['accession']} - set(table.columns)))
    if missing:
        raise ValueError(f'proteins.attributes name columns the protein table does not have: {missing}')
    t = pd.DataFrame({'accession': table[spec['accession']].astype(str).str.strip()})
    for name, a in attrs.items():
        col = table[a['column']].astype(str)
        t[f'p.{name}'] = col.str.strip().ne('').map({True: 'yes', False: 'no'}) if a.get('present') else col
    t = t.drop_duplicates('accession')
    return pd.DataFrame({'accession': sorted(accessions)}).merge(t, on='accession', how='left').fillna('')


@dataclass
class SiteRun:
    site: dict
    rows: pd.DataFrame
    record: dict
    parity: list[Result] = field(default_factory=list)

    @property
    def parity_ok(self) -> bool:
        return all(r.equal for r in self.parity)


def protein_outputs(snap: Snapshot, profile, marked: pd.DataFrame, kept: dict, ctx: L.Context,
                    attributes: pd.DataFrame | None = None, layers: dict | None = None) -> dict:
    """What the protein pages read: each marked residue with its window and its class in every analysis (marks.tsv);
    each protein's marks and other candidate residues per class (protein_counts.tsv); the proteins (proteins.tsv); and
    the regions the layers draw (units.tsv, and what each kind is: tracks.json); and, for a kind whose track carries
    numbers (Track.values), each of its regions with them and with the marks and other candidate residues inside it
    (units_<kind>.tsv)."""
    from .snapshot import window
    m = marked[['accession', 'position']].copy()
    m['residue'] = [snap.residue_at(a, p) for a, p in zip(m['accession'], m['position'])]
    m['window_15'] = [window(snap.sequences[a], p, 7) for a, p in zip(m['accession'], m['position'])]
    counts = []
    for aid, k in kept.items():
        if k.get('question'):            # a question of several tests: a mark's tests in its class, and those that count it
            inn, cnt, rows_ = {}, {}, []
            for code in k['codes']:
                t = k['tests'][code]
                mk = t['counted'][t['counted']['marked']]
                for a, p, i in zip(mk['accession'], mk['position'], mk['in']):
                    cnt.setdefault((a, p), []).append(code)
                    if i:
                        inn.setdefault((a, p), []).append(code)
                g = t['per_protein']
                rows_.append(pd.DataFrame({'accession': g.index, 'analysis': aid, 'category': code, 'marks_in': g['a'].to_numpy(),
                                           'others_in': g['c'].to_numpy(), 'marks_total': (g['a'] + g['b']).to_numpy(),
                                           'others_total': (g['c'] + g['d']).to_numpy()}))
            m[aid] = [';'.join(inn.get((a, p), [])) for a, p in zip(m['accession'], m['position'])]
            m[f'n.{aid}'] = [';'.join(cnt.get((a, p), [])) for a, p in zip(m['accession'], m['position'])]
            if rows_:
                counts.append(pd.concat(rows_, ignore_index=True))
            continue
        ann, is_m, is_l = k['annotated'], k['is_marked'], k['is_left']
        mk = ann[is_m].set_index(['accession', 'position'])
        if k['columns'] is None:
            m[aid] = [mk['category'].get((a, p), '') for a, p in zip(m['accession'], m['position'])]
            g = ann[~is_l].assign(marked=is_m[~is_l]).groupby(['accession', 'category', 'marked']).size().unstack(fill_value=0)
            g = g.reindex(columns=[True, False], fill_value=0).rename(columns={True: 'marks_in', False: 'others_in'}).reset_index()
        else:
            flags = k['columns']
            m[aid] = [';'.join(f for f in flags if bool(mk[f].get((a, p), False))) for a, p in zip(m['accession'], m['position'])]
            sub = ann[~is_l].assign(marked=is_m[~is_l])
            g = sub.groupby(['accession', 'marked'])[flags].sum().stack().rename('n').reset_index().rename(columns={'level_2': 'category'})
            g = g.pivot_table(index=['accession', 'category'], columns='marked', values='n', fill_value=0)
            g = g.reindex(columns=[True, False], fill_value=0).rename(columns={True: 'marks_in', False: 'others_in'}).reset_index()
        tot = ann[~is_l].assign(marked=is_m[~is_l]).groupby(['accession', 'marked']).size().unstack(fill_value=0).reindex(columns=[True, False], fill_value=0)
        g[['marks_in', 'others_in']] = g[['marks_in', 'others_in']].astype(int)
        g['marks_total'] = g['accession'].map(tot[True]).astype(int)
        g['others_total'] = g['accession'].map(tot[False]).astype(int)
        g.insert(1, 'analysis', aid)
        counts.append(g[g['marks_in'] + g['others_in'] > 0])
    if attributes is not None and len(attributes.columns) > 2:
        m = m.merge(attributes, on=['accession', 'position'], how='left').fillna('')
    accs = sorted(set(m['accession']))
    n_marks = m.groupby('accession').size()
    cand = snap.residues(profile.residues, accessions=accs).groupby('accession').size()
    proteins = pd.DataFrame([{**{'accession': a}, **{k: snap.describe(a)[k] for k in ('gene', 'name', 'entry')},
                              'length': snap.length(a), 'sequence_md5': snap.sequence_md5(a),
                              'marks': int(n_marks.get(a, 0)), 'candidates': int(cand.get(a, 0))} for a in accs])
    valued: dict = {}
    units, tracks = drawn_tracks(layers or {}, ctx, set(accs), values=valued)
    # a site of protein-set questions only has no class counts: the table keeps its columns
    count_cols = ['accession', 'analysis', 'category', 'marks_in', 'others_in', 'marks_total', 'others_total']
    out = {'marks.tsv': m.sort_values(['accession', 'position']),
           'protein_counts.tsv': pd.concat(counts, ignore_index=True) if counts else pd.DataFrame(columns=count_cols),
           'proteins.tsv': proteins, 'units.tsv': units, 'tracks.json': tracks}
    if valued:
        # the candidate residues as the tests counted them (any question's: they are the same residues)
        k = next((v for v in kept.values() if 'annotated' in v), None)
        if k is not None:
            cand, is_m, is_l = k['annotated'][['accession', 'position']], k['is_marked'], k['is_left']
        else:
            cand = snap.residues(profile.residues, accessions=accs)[['accession', 'position']]
            keys = set(zip(marked['accession'], marked['position'].astype(int)))
            is_m = pd.Series([(a, int(p)) in keys for a, p in zip(cand['accession'], cand['position'])], index=cand.index)
            is_l = pd.Series(False, index=cand.index)
        for t in tracks:
            if t['kind'] in valued:
                out[t['values']['table']] = unit_values(valued[t['kind']], [c['name'] for c in t['values']['columns']], cand, is_m, is_l)
    return out


def unit_values(units: pd.DataFrame, columns: list[str], residues: pd.DataFrame, is_marked: pd.Series, is_left: pd.Series) -> pd.DataFrame:
    """Each unit with the numbers its track carries (Track.values) and what is inside it: `marks` (the counted marks)
    and `other_candidates` (the other candidate residues, left-out marks counted on neither side, as the tests count
    them). Columns: accession, start, end, length, class, the values (up to 6 significant digits, empty for missing),
    marks, other_candidates."""
    units = units.sort_values(['accession', 'start', 'end'], kind='stable')
    acc, start, end = units['accession'].astype(str).to_numpy(), units['start'].astype(int).to_numpy(), units['end'].astype(int).to_numpy()
    out = pd.DataFrame({'accession': acc, 'start': start, 'end': end, 'length': end - start + 1,
                        'class': units['class'].astype(str).to_numpy() if 'class' in units.columns else ''})
    for c in columns:
        out[c] = [ST.cell(v, 'number') for v in units[c]] if c in units.columns else ''
    r_acc, r_pos = residues['accession'].astype(str).to_numpy(), residues['position'].to_numpy(dtype=np.int64)

    def inside(keep: np.ndarray) -> np.ndarray:
        by = {a: np.sort(g.to_numpy()) for a, g in pd.Series(r_pos[keep]).groupby(r_acc[keep])}
        empty = np.array([], dtype=np.int64)
        return np.array([np.searchsorted(by.get(a, empty), e, 'right') - np.searchsorted(by.get(a, empty), s, 'left')
                         for a, s, e in zip(acc, start, end)], dtype=np.int64)
    m, left = is_marked.to_numpy(dtype=bool), is_left.to_numpy(dtype=bool)
    out['marks'] = inside(m)
    out['other_candidates'] = inside(~m & ~left)
    return out


UNIT_OUT = ['accession', 'kind', 'start', 'end', 'label', 'source', 'class', 'ref']


def layer_words(layer: L.Layer) -> dict:
    """What the website shows of a layer, kept in run.json so the website needs no layer code (a plugin's included)."""
    return {'shape': layer.shape, 'title': layer.title, 'describe': layer.describe, 'labels': dict(layer.labels),
            'help': dict(layer.help), 'question': layer.question, 'sub': layer.sub, 'section': layer.section, 'needs': list(layer.needs),
            'ordered': bool(layer.ordered), 'groups': [{'name': g, 'classes': list(cs)} for g, cs in layer.groups]}


def drawn_tracks(layers: dict, ctx: L.Context, accs: set, values: dict | None = None) -> tuple[pd.DataFrame, list[dict]]:
    """The regions the run's layers draw on the protein pages (Layer.tracks), as one unit table (units.tsv), and what
    each is (tracks.json: its title, style, help, the roles it comes from, and the analysis whose classes colour it, or
    the classes its own units carry). Layers drawing one kind from the same roles share a track (the one whose units
    carry a class is kept); the same kind from other roles is a track of its own, named kind.role. A track that carries
    numbers (Track.values) says so (`values`: the table they go to and its columns), and values, if given, receives its
    units with them, by kind."""
    chosen: dict[tuple, tuple] = {}
    for aid, layer in layers.items():
        for t in layer.tracks:
            u = t.units(ctx, accs)
            has_class = 'class' in u.columns and (u['class'].astype(str) != '').any()
            key = (t.kind, tuple(t.roles))
            if key not in chosen or (has_class and not chosen[key][2]):
                chosen[key] = (t, u, has_class, aid)
    kinds = [k for k, _ in chosen]
    frames, meta = [], []
    for (kind, roles), (t, u, has_class, aid) in chosen.items():
        tid = kind if kinds.count(kind) == 1 or kinds.index(kind) == list(chosen).index((kind, roles)) else f"{kind}.{'.'.join(roles)}"
        classes = sorted({str(c) for c in u['class']} - {''}) if has_class else []
        own = has_class and not set(classes) <= set(layers[aid].labels)       # the file's own classes, not the question's
        meta.append({'kind': tid, 'title': t.title, 'style': t.style, 'help': t.help, 'roles': list(t.roles),
                     'analysis': aid if has_class and not own else '', **({'classes': classes} if own else {}),
                     **({'colours': dict(t.colours)} if t.colours else {}),
                     **({'values': {'table': f'units_{tid}.tsv', 'columns': [{'name': c, 'label': lab, 'help': h} for c, lab, h in t.values]}}
                        if t.values else {})})
        if t.values and values is not None:
            values[tid] = u
        if len(u):
            frames.append(pd.DataFrame({c: (u[c].to_numpy() if c in u.columns else '') for c in UNIT_OUT if c != 'kind'} | {'kind': tid})[UNIT_OUT])
    return (pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=UNIT_OUT)), meta


def input_formats(names: list[str], paths: dict, entries: dict) -> dict:
    """Each input's column mapping, by its manifest name (two entries may read one file in two ways), and by its path
    (a file's separator, which every mapping of one file shares)."""
    out = {}
    for n in names:
        cols = entries.get(n, {}).get('columns')
        if not cols or n not in paths:
            continue
        out[n] = cols
        out.setdefault(str(paths[n]), cols if isinstance(cols, dict) else {'sep': cols[0].get('sep', '\t')})
    return out


def run(site_path: str | Path, root: str | Path, allow_untrusted: bool = False, out_root: str | Path | None = None,
        write: bool = True, log=print, skip_new: bool = False, variant: str | None = None) -> SiteRun:
    """Run a site: its analyses, statistics rows and run record, and its parity check. skip_new leaves out the analyses
    marked new (not in the reference), for a parity check alone; variant runs one of the site's variants."""
    t0 = time.time()
    site = with_variant(load_site(site_path), variant)
    if site.get('status') == 'offline_pilot' and not allow_untrusted:
        raise PermissionError(f"site {site['id']} is an offline pilot: run it with allow_untrusted (ptmc run --allow-untrusted)")
    roles = site.get('inputs', {})
    names = I.site_input_names(site)
    manifest = manifest_of(site)
    paths = I.resolve(root, names, manifest=manifest, allow_untrusted=allow_untrusted, allow_absent=True)
    absent = [n for n in names if n not in paths]          # checksum_only inputs this root does not hold
    for n in absent:
        log(f"  absent {n}: checksum_only (its terms forbid redistribution) and not under {root}")
    staged = I.load(manifest).get(site['snapshot']['input'], {}).get('version', '')
    release = site['snapshot']['release']
    if staged and release.split()[-1] not in staged:
        raise ValueError(f"the site file says its sequences are {release}, but the staged file is {staged!r}: "
                         f"update snapshot.release in {Path(site_path).name} (and every result that depends on it), or stage {release}")
    profile = load_profile(site['mark'])
    snap = Snapshot.from_fasta(paths[site['snapshot']['input']], release=site['snapshot']['release'])
    def fill(value):
        rule, given = I.role_inputs(value)
        given = [n for n in given if n in paths]        # an absent checksum_only input leaves its role's others
        if not given:
            return None
        return paths[given[0]] if rule == 'one' else L.Several(rule, tuple(paths[n] for n in given), tuple(given))
    entries = I.load(manifest)
    filled = {role: fill(value) for role, value in roles.items()}
    ctx = L.Context(snap, profile, {r: v for r, v in filled.items() if v is not None},
                    trusted_plugins=tuple(site.get('trusted_plugins', [])),
                    formats=input_formats(names, paths, entries),
                    names={role: I.role_inputs(v)[1][0] for role, v in roles.items() if I.role_inputs(v)[0] == 'one'})
    table, added = read_marks_table(site, paths)
    spec = marks_spec(site, table)
    marked, report = select_marks(spec, table, snap, profile)
    if added:
        report['added'] = added
    pending = left_out_marks(spec, table)
    report['left_out'] = int(len(pending))
    attributes = mark_attributes(spec, table, marked)
    per_mark, per_mark_report = mark_tables(spec, table, marked, paths, ctx.formats)
    log(f"{site['id']}: {report['counted']:,} {profile.word('marks')} on {report['proteins']:,} proteins "
        f"({report['rows']:,} rows read, {report['selected']:,} selected)")
    for name, r in per_mark_report.items():
        log(f"  table {name:18s} {r['kept']:,} of {r['rows']:,} rows, on {r['marks']:,} {profile.word('marks')} (website only)")
    parts, layers_used, kept, set_names, set_keep, layer_objs = [], {}, {}, [], {}, {}
    if skip_new:
        site = {**site, 'analyses': [a for a in site['analyses'] if not a.get('new')]}
    for analysis in site['analyses']:
        if analysis.get('test') == 'protein_sets':
            from .set_tests import families_file, protein_set_test, roles_of
            unit_roles = {r['role'] if isinstance(r, dict) else r for it in analysis['sets'].get('each', [])
                          for k in ('units', 'universe_units') for r in ([it[k]] if isinstance(it.get(k), (str, dict)) else it.get(k) or [])}
            several = [r for r in roles_of(analysis) if isinstance(ctx.inputs.get(r), L.Several) and r not in unit_roles]
            if several:
                raise ValueError(f"{analysis['id']}: a protein-set test reads one table per role, but {several} name several inputs")
            set_keep[analysis['id']] = {}
            left = []
            rows_, names = protein_set_test(analysis, ctx.inputs, set(marked['accession']), set(snap.sequences), keep=set_keep[analysis['id']],
                                            root=root_of(site), formats=ctx.formats, ctx=ctx, left_out=left)
            parts.append(rows_)
            set_names += [(analysis['id'], k, names.get(k, '')) for k in rows_['category']] if len(rows_) else []
            set_names += [(analysis['id'], k, v['name']) for k, v in set_keep[analysis['id']].get('filter_sets', {}).items()]   # offered, not tested
            layers_used[analysis['id']] = {'test': 'protein_sets', 'sets': analysis['sets'].get('input') or [it['set'] for it in analysis['sets']['each']]}
            if analysis['sets'].get('each'):            # each set's code, so that parity can leave out the sets not run
                layers_used[analysis['id']]['tests'] = [{'code': it['set'], 'category': it['set'], 'stratum': 'all'} for it in analysis['sets']['each']]
            if left:
                layers_used[analysis['id']]['left_out'] = left
                for lt in left:
                    log(f"  {analysis['id']}: set {lt['code']} left out (reads {', '.join(lt['roles'])}, not present)")
            if analysis['sets'].get('families'):          # the site's own rules file, as read
                rules = families_file(analysis, root_of(site))
                layers_used[analysis['id']]['families'] = {'file': analysis['sets']['families']['rules'], 'md5': md5_file(rules),
                                                           'lists': analysis['sets']['families'].get('lists', [])}
            if analysis.get('identifiers'):
                layers_used[analysis['id']]['identifiers'] = {'noun': analysis['identifiers'].get('noun', 'identifier'),
                                                              'map': [s['input'] for s in analysis['identifiers']['map']]}
            if analysis.get('hierarchy'):                  # the sets' parents, for the website's ontology views
                layers_used[analysis['id']]['hierarchy'] = analysis['hierarchy']['input']
            for k in ('where', 'history'):                 # the tables that keep its rows, and bring its members to entries
                if analysis['sets'].get(k):
                    layers_used[analysis['id']][k] = analysis['sets'][k]
            log(f"  {analysis['id']:18s} {len(rows_):3d} rows")
            continue
        if analysis.get('tests'):                          # a question of several tests, each with its own background
            from .question import Question, question_layer
            q, layer = Question(ctx, analysis), question_layer(analysis)
            layer_objs[analysis['id']] = layer
            kept[analysis['id']] = {}
            parts.append(q.run(marked, left_out=pending if len(pending) else None, keep=kept[analysis['id']]))
            layers_used[analysis['id']] = {'layer': 'tests', 'origin': layer.origin, 'counting': q.counting,
                                           'tests': [{k: t[k] for k in ('code', 'category', 'stratum')} for t in q.tests],
                                           **({'left_out': q.left_out_tests} if q.left_out_tests else {}), **layer_words(layer)}
            for lt in q.left_out_tests:
                log(f"  {analysis['id']}: test {lt['code']} left out (reads {', '.join(lt['roles'])}, not present)")
            log(f"  {analysis['id']:18s} {len(parts[-1]):3d} rows")
            continue
        layer = L.get(analysis['layer'], ctx, analysis.get('with'), analysis['id'])
        layer_objs[analysis['id']] = layer
        layers_used[analysis['id']] = {'layer': layer.name, 'origin': layer.origin, **({'with': analysis['with']} if analysis.get('with') else {}),
                                       **layer_words(layer)}
        methods = analysis.get('methods', ['fisher', 'mantel_haenszel'])
        kept[analysis['id']] = {}
        only = listed_proteins(analysis['proteins'], ctx) if analysis.get('proteins') else None
        if only is not None:                              # the marked proteins this question leaves out, for the website
            layers_used[analysis['id']]['proteins'] = {
                'input': analysis['proteins']['input'], 'column': analysis['proteins']['column'], 'listed': len(only),
                'not_counted': sorted(set(marked['accession']) - only)}
        if analysis.get('marks_alone'):
            layers_used[analysis['id']]['marks_alone'] = analysis['marks_alone']
        parts.append(RT.residue_test(ctx, marked, layer, analysis['id'], methods=methods, keep=kept[analysis['id']],
                                     left_out=pending if len(pending) else None, proteins=only,
                                     alone=analysis.get('marks_alone', 'drop'), order=analysis.get('order'),
                                     pooled_label=(analysis.get('proteins') or {}).get('label', '')))
        log(f"  {analysis['id']:18s} {len(parts[-1]):3d} rows")
    rows = pd.concat(parts, ignore_index=True)
    record = {
        'tool': 'ptmcontext', 'version': __version__, 'code_commit': code_commit(), 'site': site['id'],
        'site_repository_commit': code_commit(root_of(site)),
        'site_config_md5': md5_file(site_path),
        'written': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'snapshot': snap.record(),
        'profile': profile.id, 'marks': report, 'analyses': layers_used, **({'variant': site['variant']} if site.get('variant') else {}),
        'manifest': str(manifest.relative_to(root_of(site))) if manifest.is_relative_to(root_of(site)) else str(manifest), 'roles': roles,
        'inputs': {n: {'file': str(p), 'md5': md5_file(p)} for n, p in sorted(paths.items())},
        **({'absent': {n: 'checksum_only, not under the root' for n in absent}} if absent else {}),
        'trusted_plugins': list(ctx.trusted_plugins), 'seconds': round(time.time() - t0, 1),
    }
    if per_mark_report:                                # tables kept for the website: what each held and kept
        record['mark_tables'] = per_mark_report
    result = SiteRun(site, rows, record)
    ref = site.get('reference', {}).get('statistics')
    tables = site.get('reference', {}).get('tables') or {}
    if ref or tables:
        reference = ST.read(paths[ref]) if ref else None
        for analysis in site['analyses']:
            own = tables.get(analysis['id'])
            if own:                                          # a published table of its own (a release's supporting table)
                published = pd.read_csv(paths[own['input']], sep=own.get('sep', '\t'), dtype=str, keep_default_na=False)
                found = [compare_table(rows, published, analysis['id'], own)]   # not `table`: the marks table is read below
            elif analysis.get('new') or reference is None:   # not in the reference: nothing to compare it with
                log(f"  new    {analysis['id']:18s} not in the reference")
                continue
            else:
                why = ((site.get('variant') or {}).get('not_compared') or {}).get(analysis['id'])
                if why:                                      # a variant whose inputs cannot rebuild it (it says why)
                    log(f"  not compared {analysis['id']:18s} in this variant: {why}")
                    continue
                partial = [t['code'] for t in (layers_used.get(analysis['id']) or {}).get('left_out', [])]
                found = compare(rows[rows['analysis'] == analysis['id']], reference, analysis['id'],
                                leave_out=[(t['category'], t['stratum']) for t in layers_used[analysis['id']]['tests']
                                           if t['code'] in partial] if partial else None)
            for r in found:
                result.parity.append(r)
                log(f'  parity {r.analysis:18s} {r.method:16s} {r.rows:3d} rows  {"equal" if r.equal else "DIFFERENT"}'
                    + (f'  (against {r.reference})' if r.reference else '')
                    + (f' (partial: {r.skipped} rows need absent inputs; q not compared)' if r.skipped else ''))
        record['parity'] = {'reference': ref, 'equal': result.parity_ok, 'new': [a['id'] for a in site['analyses'] if a.get('new') and a['id'] not in tables],
                            'checked': [{'analysis': r.analysis, 'method': r.method, 'rows': r.rows, 'equal': r.equal, **({'reference': r.reference} if r.reference else {}),
                                         **({'not_checked': r.skipped, 'q_compared': False} if r.skipped else {})}
                                        for r in result.parity]}
    if write:
        folder = Path(out_root or root_of(site)) / site['outputs']['folder']
        ST.write(rows, folder / 'statistics.tsv')
        record['output'] = {'statistics.tsv': md5_file(folder / 'statistics.tsv')}
        outs = protein_outputs(snap, profile, marked, kept, ctx, attributes, layers=layer_objs)
        outs['shown_marks.tsv'], outs['shown_proteins.tsv'] = shown_marks(spec, table, pending, snap, marked)
        outs['set_names.tsv'] = pd.DataFrame(set_names, columns=['analysis', 'set', 'name'])
        if site.get('proteins'):                       # per-protein facts the website shows (proteins.attributes)
            ptable = pd.read_csv(paths[site['proteins']['input']], sep='\t', dtype=str, keep_default_na=False, low_memory=False)
            outs['protein_attributes.tsv'] = protein_attributes(site['proteins'], ptable, set(marked['accession']))
        for name, frame in per_mark.items():           # per-mark tables, for the website's count questions
            outs[f'marks_{name}.tsv'] = frame
        for stale in folder.glob('marks_*.tsv'):       # a table the site file no longer keeps
            if stale.name not in outs:
                stale.unlink()
        from . import map_rows as MR             # the protein map's own rows, from the site's tables (website.protein.map)
        if MR.input_rows(site):
            accs = set(marked['accession'])
            files = {role: (I.role_inputs(v)[0], [paths[n] for n in I.role_inputs(v)[1] if n in paths])   # absent checksum_only inputs left out
                     for role, v in roles.items()}
            outs['map_items.tsv'] = MR.items(site, files, table, accs, {a: snap.length(a) for a in accs})
            record['map_rows'] = {r['id']: int((outs['map_items.tsv']['row'] == r['id']).sum()) for r in MR.input_rows(site)}
        elif (folder / 'map_items.tsv').exists():
            (folder / 'map_items.tsv').unlink()
        if set_keep:                                   # for testing a selection again on the website
            (folder / 'protein_sets.json').write_text(json.dumps(set_keep, separators=(',', ':')) + '\n')
            record['output']['protein_sets.json'] = md5_file(folder / 'protein_sets.json')
        elif (folder / 'protein_sets.json').exists():
            (folder / 'protein_sets.json').unlink()
        for stale in folder.glob('units_*.tsv'):         # a kind that no longer carries values
            if stale.name not in outs:
                stale.unlink()
        for name, frame in outs.items():
            if name.endswith('.json'):
                (folder / name).write_text(json.dumps(frame, indent=1, ensure_ascii=False) + '\n')
            else:
                frame.to_csv(folder / name, sep='\t', index=False, lineterminator='\n')
            record['output'][name] = md5_file(folder / name)
        (folder / 'run.json').write_text(json.dumps(record, indent=1) + '\n')
        from .web import search as SE                  # a mark attribute derived from the site's partners (website.search)
        if SE.derived_attribute(site):
            SE.derive(site, folder, log, write=True)
            record['output']['marks.tsv'] = md5_file(folder / 'marks.tsv')
            (folder / 'run.json').write_text(json.dumps(record, indent=1) + '\n')
        log(f'  -> {folder}')
    return result
