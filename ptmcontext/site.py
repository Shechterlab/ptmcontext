"""Run a site from its config file (sites/<id>.yaml): every analysis it lists, into one statistics table, with a run
record, and the parity check against its reference when it names one.

Changing the mark, the inputs or the analyses is changing the file, never the code.
"""
from __future__ import annotations

import copy

import json
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
from .parity import Result, compare
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
    """Residue analyses whose layer reads a role the site file does not fill."""
    roles = set(site.get('inputs', {}))
    out = [f"{aid}: reads role {r!r}, which inputs: does not fill" for aid, w in _analysis_words(site).items() for r in w['needs'] if r not in roles]
    out += [f"{a['id']}: proteins: reads role {a['proteins']['input']!r}, which inputs: does not fill" for a in site.get('analyses', [])
            if a.get('proteins') and a['proteins']['input'] not in roles]
    return out


def mapping_problems(site: dict, root: str | Path) -> list[str]:
    """Column mappings (a manifest entry's columns) that name a column its file does not have, read from the files."""
    out, entries = [], I.load(manifest_of(site))
    for name in I.site_input_names(site):
        cols = entries.get(name, {}).get('columns')
        path = Path(root) / entries.get(name, {}).get('file', '')
        if not cols or not path.exists():
            continue
        have = set(pd.read_csv(path, sep=cols.get('sep', '\t'), nrows=0).columns)
        named = {cols[k] for k in ('accession', 'start', 'end', 'position', 'value', 'label', 'ref', 'subtype', 'class') if cols.get(k)}
        named |= {c['column'] for c in cols.get('include', []) + cols.get('exclude', [])}
        if named - have:
            out.append(f"input {name}: its column mapping names columns {path.name} does not have: {sorted(named - have)} (it has {sorted(have)})")
    return out


def website_problems(site: dict) -> list[str]:
    """What the website block names that the site file does not have: a tile, filter or example naming an analysis
    or a mark attribute that is not defined, or an attribute's colours for values it does not list. The schema checks
    each block's shape; this checks that the blocks agree with each other (ptmc check)."""
    ids = {x['id'] for x in site.get('analyses', [])}
    attrs = (site.get('marks') or {}).get('attributes') or {}
    web = site.get('website') or {}
    out = []
    for sec in (web.get('overview') or {}).get('sections', []):
        for c in sec.get('cards', []):
            aid = c if isinstance(c, str) else c.get('analysis')
            if aid not in ids:
                out.append(f"website.overview, section {sec.get('name')!r}: no analysis {aid!r}")
    for g in web.get('filters') or []:
        out += [f"website.filters, group {g.get('name')!r}: no analysis {a!r}" for a in g.get('analyses', []) if a not in ids]
        out += [f"website.filters, group {g.get('name')!r}: no attribute {a!r} in marks.attributes" for a in g.get('attributes', []) if a not in attrs]
    for st in web.get('stats') or []:
        if isinstance(st, dict) and st['attribute'] not in attrs:
            out.append(f"website.stats: no attribute {st['attribute']!r} in marks.attributes")
        elif isinstance(st, dict) and attrs[st['attribute']].get('kind') != 'list':
            out.append(f"website.stats: attribute {st['attribute']!r} is not a list (its distinct values are counted)")
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
    for n in (web.get('sites') or {}).get('attributes', []):
        if n not in attrs:
            out.append(f"website.sites.attributes: no attribute {n!r}")
    for f in (web.get('protein') or {}).get('facts', []):
        if f['analysis'] not in ids:
            out.append(f"website.protein.facts: no analysis {f['analysis']!r}")
        elif f['analysis'] not in set_ids and not f.get('classes'):
            out.append(f"website.protein.facts: {f['analysis']!r} is a residue question: name the classes to count")
        elif f['analysis'] not in set_ids and words.get(f['analysis'], {}).get('classes') is not None:
            bad = [c for c in f['classes'] if c not in words[f['analysis']]['classes']]
            if bad:
                out.append(f"website.protein.facts: {f['analysis']!r} has no class {bad} (it has {sorted(words[f['analysis']]['classes'])})")
    for key, to in (web.get('legacy_links') or {}).items():
        if not to.startswith('?') and to not in ids:
            out.append(f"website.legacy_links: {key!r} opens {to!r}, which is not a question of this site")
    for ex in web.get('examples') or []:
        key = ex.split(':', 1)[0] if ':' in ex else None
        if key is not None and key not in ids and key not in attrs:
            out.append(f"website.examples: {ex!r} names neither an analysis nor an attribute")
    for name, a in attrs.items():
        if a.get('values') and a.get('colours'):
            out += [f"marks.attributes.{name}: a colour for {v!r}, which is not among its values" for v in a['colours'] if v not in a['values']]
        if a.get('records') and a.get('kind') != 'list':
            out.append(f"marks.attributes.{name}: records are for a list attribute")
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


def mark_attributes(spec: dict, table: pd.DataFrame, marked: pd.DataFrame) -> pd.DataFrame:
    """For each counted mark, the columns the site file keeps for the website (marks.attributes), as text; a mark on
    several rows of the table takes its first row's. Columns 'a.<name>' (and 'a.<name>.link'), keyed by accession and
    position. Nothing here changes which marks are counted."""
    attrs = spec.get('attributes') or {}
    if not attrs:
        return pd.DataFrame(columns=['accession', 'position'])
    clash = [n for n in attrs if not (n[:1].isalpha() and n.replace('_', 'a').isalnum())]
    if clash:
        raise ValueError(f'marks.attributes: names must be letters, digits and _ only: {clash}')
    keep = pd.Series(True, index=table.index)            # the rows select_marks keeps, so a dropped row lends nothing
    for cond in spec.get('include', []):
        keep &= _holds(table, cond)
    for cond in spec.get('exclude', []) + spec.get('left_out', []):
        keep &= ~_holds(table, cond)
    table = table[keep]
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


def _zip_lists(u: str, v: str, sep: str, name: str) -> list:
    xs, ys = ([p.strip() for p in str(w).split(sep.strip() or sep) if p.strip()] for w in (u, v))
    if len(xs) != len(ys):
        raise ValueError(f'marks.attributes {name}: pair_with lists differ in length ({u!r} and {v!r})')
    return list(zip(xs, ys))


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
    out = {'marks.tsv': m.sort_values(['accession', 'position']), 'protein_counts.tsv': pd.concat(counts, ignore_index=True),
           'proteins.tsv': proteins, 'units.tsv': units, 'tracks.json': tracks}
    if valued:
        # the candidate residues as the tests counted them (any question's: they are the same residues)
        k = next(iter(kept.values()), None)
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
            'help': dict(layer.help), 'question': layer.question, 'sub': layer.sub, 'section': layer.section, 'needs': list(layer.needs)}


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
    paths = I.resolve(root, names, manifest=manifest, allow_untrusted=allow_untrusted)
    staged = I.load(manifest).get(site['snapshot']['input'], {}).get('version', '')
    release = site['snapshot']['release']
    if staged and release.split()[-1] not in staged:
        raise ValueError(f"the site file says its sequences are {release}, but the staged file is {staged!r}: "
                         f"update snapshot.release in {Path(site_path).name} (and every result that depends on it), or stage {release}")
    profile = load_profile(site['mark'])
    snap = Snapshot.from_fasta(paths[site['snapshot']['input']], release=site['snapshot']['release'])
    def fill(value):
        rule, given = I.role_inputs(value)
        return paths[given[0]] if rule == 'one' else L.Several(rule, tuple(paths[n] for n in given))
    entries = I.load(manifest)
    ctx = L.Context(snap, profile, {role: fill(value) for role, value in roles.items()},
                    trusted_plugins=tuple(site.get('trusted_plugins', [])),
                    formats={str(paths[n]): entries[n]['columns'] for n in names if entries.get(n, {}).get('columns')})
    table, added = read_marks_table(site, paths)
    spec = marks_spec(site, table)
    marked, report = select_marks(spec, table, snap, profile)
    if added:
        report['added'] = added
    pending = left_out_marks(spec, table)
    report['left_out'] = int(len(pending))
    attributes = mark_attributes(spec, table, marked)
    log(f"{site['id']}: {report['counted']:,} {profile.word('marks')} on {report['proteins']:,} proteins "
        f"({report['rows']:,} rows read, {report['selected']:,} selected)")
    parts, layers_used, kept, set_names, set_keep, layer_objs = [], {}, {}, [], {}, {}
    if skip_new:
        site = {**site, 'analyses': [a for a in site['analyses'] if not a.get('new')]}
    for analysis in site['analyses']:
        if analysis.get('test') == 'protein_sets':
            from .set_tests import families_file, protein_set_test, roles_of
            several = [r for r in roles_of(analysis) if isinstance(ctx.inputs.get(r), L.Several)]
            if several:
                raise ValueError(f"{analysis['id']}: a protein-set test reads one table per role, but {several} name several inputs")
            set_keep[analysis['id']] = {}
            rows_, names = protein_set_test(analysis, ctx.inputs, set(marked['accession']), set(snap.sequences), keep=set_keep[analysis['id']],
                                            root=root_of(site), formats=ctx.formats)
            parts.append(rows_)
            set_names += [(analysis['id'], k, names.get(k, '')) for k in rows_['category']] if len(rows_) else []
            set_names += [(analysis['id'], k, v['name']) for k, v in set_keep[analysis['id']].get('filter_sets', {}).items()]   # offered, not tested
            layers_used[analysis['id']] = {'test': 'protein_sets', 'sets': analysis['sets']['input']}
            if analysis['sets'].get('families'):          # the site's own rules file, as read
                rules = families_file(analysis, root_of(site))
                layers_used[analysis['id']]['families'] = {'file': analysis['sets']['families']['rules'], 'md5': md5_file(rules),
                                                           'lists': analysis['sets']['families'].get('lists', [])}
            if analysis.get('identifiers'):
                layers_used[analysis['id']]['identifiers'] = {'noun': analysis['identifiers'].get('noun', 'identifier'),
                                                              'map': [s['input'] for s in analysis['identifiers']['map']]}
            for k in ('where', 'history'):                 # the tables that keep its rows, and bring its members to entries
                if analysis['sets'].get(k):
                    layers_used[analysis['id']][k] = analysis['sets'][k]
            log(f"  {analysis['id']:18s} {len(rows_):3d} rows")
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
        'trusted_plugins': list(ctx.trusted_plugins), 'seconds': round(time.time() - t0, 1),
    }
    result = SiteRun(site, rows, record)
    ref = site.get('reference', {}).get('statistics')
    if ref:
        reference = ST.read(paths[ref])
        for analysis in site['analyses']:
            if analysis.get('new'):                          # not in the reference: nothing to compare it with
                log(f"  new    {analysis['id']:18s} not in the reference")
                continue
            for r in compare(rows[rows['analysis'] == analysis['id']], reference, analysis['id']):
                result.parity.append(r)
                log(f'  parity {r.analysis:18s} {r.method:16s} {r.rows:3d} rows  {"equal" if r.equal else "DIFFERENT"}')
        record['parity'] = {'reference': ref, 'equal': result.parity_ok, 'new': [a['id'] for a in site['analyses'] if a.get('new')],
                            'checked': [{'analysis': r.analysis, 'method': r.method, 'rows': r.rows, 'equal': r.equal} for r in result.parity]}
    if write:
        folder = Path(out_root or root_of(site)) / site['outputs']['folder']
        ST.write(rows, folder / 'statistics.tsv')
        record['output'] = {'statistics.tsv': md5_file(folder / 'statistics.tsv')}
        outs = protein_outputs(snap, profile, marked, kept, ctx, attributes, layers=layer_objs)
        outs['set_names.tsv'] = pd.DataFrame(set_names, columns=['analysis', 'set', 'name'])
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
        log(f'  -> {folder}')
    return result
