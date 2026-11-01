"""Run a site from its config file (sites/<id>.yaml): every analysis it lists, into one statistics table, with a run
record, and the parity check against its reference when it names one.

Changing the mark, the inputs or the analyses is changing the file, never the code.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

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


def select_marks(spec: dict, table: pd.DataFrame, snapshot: Snapshot, profile) -> tuple[pd.DataFrame, dict]:
    """The marked residues a site counts, and a report of what was left out and why."""
    keep = pd.Series(True, index=table.index)
    for cond in spec.get('include', []):
        keep &= _holds(table, cond)
    for cond in spec.get('exclude', []):
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


@dataclass
class SiteRun:
    site: dict
    rows: pd.DataFrame
    record: dict
    parity: list[Result] = field(default_factory=list)

    @property
    def parity_ok(self) -> bool:
        return all(r.equal for r in self.parity)


def protein_outputs(snap: Snapshot, profile, marked: pd.DataFrame, kept: dict, ctx: L.Context) -> dict[str, pd.DataFrame]:
    """What the protein pages read: each marked residue with its window and its class in every analysis (marks.tsv);
    each protein's marks and other candidate residues per class (protein_counts.tsv); the proteins (proteins.tsv); and
    the regions the layers placed residues against (units.tsv)."""
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
    accs = sorted(set(m['accession']))
    n_marks = m.groupby('accession').size()
    cand = snap.residues(profile.residues, accessions=accs).groupby('accession').size()
    proteins = pd.DataFrame([{**{'accession': a}, **{k: snap.describe(a)[k] for k in ('gene', 'name', 'entry')},
                              'length': snap.length(a), 'sequence_md5': snap.sequence_md5(a),
                              'marks': int(n_marks.get(a, 0)), 'candidates': int(cand.get(a, 0))} for a in accs])
    units = []
    for key, kind in (('units:disordered', 'disordered'), ('units:idr', 'idr'), ('units:domain', 'domain')):
        u = ctx._cache.get(key)
        if u is not None and len(u):
            u = u[u['accession'].isin(set(accs))]
            units.append(pd.DataFrame({'accession': u['accession'], 'kind': kind, 'start': u['start'], 'end': u['end'],
                                       'label': u['label'] if 'label' in u.columns else ''}))
    return {'marks.tsv': m.sort_values(['accession', 'position']), 'protein_counts.tsv': pd.concat(counts, ignore_index=True),
            'proteins.tsv': proteins, 'units.tsv': pd.concat(units, ignore_index=True) if units else pd.DataFrame(columns=['accession', 'kind', 'start', 'end', 'label'])}


def run(site_path: str | Path, root: str | Path, allow_untrusted: bool = False, out_root: str | Path | None = None,
        write: bool = True, log=print) -> SiteRun:
    t0 = time.time()
    site = load_site(site_path)
    if site.get('status') == 'offline_pilot' and not allow_untrusted:
        raise PermissionError(f"site {site['id']} is an offline pilot: run it with allow_untrusted (ptmc run --allow-untrusted)")
    roles = site.get('inputs', {})
    names = [site['snapshot']['input'], site['marks']['input'], *roles.values()]
    if site.get('reference', {}).get('statistics'):
        names.append(site['reference']['statistics'])
    manifest = manifest_of(site)
    paths = I.resolve(root, names, manifest=manifest, allow_untrusted=allow_untrusted)
    profile = load_profile(site['mark'])
    snap = Snapshot.from_fasta(paths[site['snapshot']['input']], release=site['snapshot']['release'])
    ctx = L.Context(snap, profile, {role: paths[name] for role, name in roles.items()},
                    trusted_plugins=tuple(site.get('trusted_plugins', [])))
    table = pd.read_csv(paths[site['marks']['input']], sep='\t', dtype=str, keep_default_na=False, low_memory=False)
    marked, report = select_marks(site['marks'], table, snap, profile)
    log(f"{site['id']}: {report['counted']:,} {profile.word('marks')} on {report['proteins']:,} proteins "
        f"({report['rows']:,} rows read, {report['selected']:,} selected)")
    parts, layers_used, kept = [], {}, {}
    for analysis in site['analyses']:
        layer = L.get(analysis['layer'], ctx)
        layers_used[analysis['id']] = {'layer': layer.name, 'origin': layer.origin}
        methods = analysis.get('methods', ['fisher', 'mantel_haenszel'])
        kept[analysis['id']] = {}
        parts.append(RT.residue_test(ctx, marked, layer, analysis['id'], methods=methods, keep=kept[analysis['id']]))
        log(f"  {analysis['id']:18s} {len(parts[-1]):3d} rows")
    rows = pd.concat(parts, ignore_index=True)
    record = {
        'tool': 'ptmcontext', 'version': __version__, 'code_commit': code_commit(), 'site': site['id'],
        'site_repository_commit': code_commit(root_of(site)),
        'site_config_md5': md5_file(site_path),
        'written': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'snapshot': snap.record(),
        'profile': profile.id, 'marks': report, 'analyses': layers_used,
        'manifest': str(manifest.relative_to(root_of(site))) if manifest.is_relative_to(root_of(site)) else str(manifest), 'roles': roles,
        'inputs': {n: {'file': str(p), 'md5': md5_file(p)} for n, p in sorted(paths.items())},
        'trusted_plugins': list(ctx.trusted_plugins), 'seconds': round(time.time() - t0, 1),
    }
    result = SiteRun(site, rows, record)
    ref = site.get('reference', {}).get('statistics')
    if ref:
        reference = ST.read(paths[ref])
        for analysis in site['analyses']:
            for r in compare(rows[rows['analysis'] == analysis['id']], reference, analysis['id']):
                result.parity.append(r)
                log(f'  parity {r.analysis:18s} {r.method:16s} {r.rows:3d} rows  {"equal" if r.equal else "DIFFERENT"}')
        record['parity'] = {'reference': ref, 'equal': result.parity_ok,
                            'checked': [{'analysis': r.analysis, 'method': r.method, 'rows': r.rows, 'equal': r.equal} for r in result.parity]}
    if write:
        folder = Path(out_root or root_of(site)) / site['outputs']['folder']
        ST.write(rows, folder / 'statistics.tsv')
        record['output'] = {'statistics.tsv': md5_file(folder / 'statistics.tsv')}
        for name, frame in protein_outputs(snap, profile, marked, kept, ctx).items():
            frame.to_csv(folder / name, sep='\t', index=False, lineterminator='\n')
            record['output'][name] = md5_file(folder / name)
        (folder / 'run.json').write_text(json.dumps(record, indent=1) + '\n')
        log(f'  -> {folder}')
    return result
