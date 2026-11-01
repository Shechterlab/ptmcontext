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


def load_site(path: str | Path) -> dict:
    site = read_config(path)
    validate(site, 'site')
    return site


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
    manifest = REPO / site['manifest'] if site.get('manifest') else I.MANIFEST
    paths = I.resolve(root, names, manifest=manifest, allow_untrusted=allow_untrusted)
    profile = load_profile(site['mark'])
    snap = Snapshot.from_fasta(paths[site['snapshot']['input']], release=site['snapshot']['release'])
    ctx = L.Context(snap, profile, {role: paths[name] for role, name in roles.items()},
                    trusted_plugins=tuple(site.get('trusted_plugins', [])))
    table = pd.read_csv(paths[site['marks']['input']], sep='\t', dtype=str, keep_default_na=False, low_memory=False)
    marked, report = select_marks(site['marks'], table, snap, profile)
    log(f"{site['id']}: {report['counted']:,} {profile.word('marks')} on {report['proteins']:,} proteins "
        f"({report['rows']:,} rows read, {report['selected']:,} selected)")
    parts, layers_used = [], {}
    for analysis in site['analyses']:
        layer = L.get(analysis['layer'], ctx)
        layers_used[analysis['id']] = {'layer': layer.name, 'origin': layer.origin}
        methods = analysis.get('methods', ['fisher', 'mantel_haenszel'])
        parts.append(RT.residue_test(ctx, marked, layer, analysis['id'], methods=methods))
        log(f"  {analysis['id']:18s} {len(parts[-1]):3d} rows")
    rows = pd.concat(parts, ignore_index=True)
    record = {
        'tool': 'ptmcontext', 'version': __version__, 'site': site['id'], 'site_config_md5': md5_file(site_path),
        'written': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'snapshot': snap.record(),
        'profile': profile.id, 'marks': report, 'analyses': layers_used,
        'manifest': str(manifest.relative_to(REPO)) if manifest.is_relative_to(REPO) else str(manifest), 'roles': roles,
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
        folder = Path(out_root or REPO) / site['outputs']['folder']
        ST.write(rows, folder / 'statistics.tsv')
        record['output'] = {'statistics.tsv': md5_file(folder / 'statistics.tsv')}
        (folder / 'run.json').write_text(json.dumps(record, indent=1) + '\n')
        log(f'  -> {folder}')
    return result
