"""The mutation propensity the website shows (website.propensity, CONTRACTS.md, "Mutation propensity"), from the release's
per-residue tables: for each source (TCGA, DepMap, ClinVar, gnomAD) the changes observed at a residue against the changes its
codon predicts (O/E, with a q from a binomial test; the release's data dictionary defines every column).

Three kinds of file, all read only when something asks for them:

  data/m/NNN.json   per protein, like data/g: {accession: {source id: block}}, a few proteins to a file, the file of a protein
                    by variants.hash_shard (kit-propensity.js computes the same). A block is columnar, one entry per residue
                    of the site's residue types that is a known site or has a change, the positions as differences:
                      p   position deltas      k   changes seen (samples or variants)    e   expected changes
                      o   O/E (k / e)          q   Benjamini-Hochberg q of the upper tail (null: not tested)
                    TCGA and DepMap repeat k, e, o, q without the hypermutated samples (k2, e2, o2, q2). `u`: the rows
                    that had no weighted expectation (the entry has no coding sequence that matches its UniProt sequence),
                    written with the unweighted expectation and a null q; gnomAD `l`: [row, q, ...] for the rows with
                    q_lower < 0.05 (fewer variants than expected). Numbers keep two significant digits.
  data/wf.json      the waterfall's numbers: samples profiled per group, each known site's changed samples per group, and
                    the curve of the other residues of the same type
  data/onco.json    the oncoprint's numbers: every TCGA sample (project, hypermutated or not, coding calls per Mb) and, for each
                    known site, the samples with a change at it

The functions here are pure (they take the tables read); kit-propensity.js and kit-mutations.js read the files.
"""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import pandas as pd

from ..snapshot import md5_file
from . import variants as V

DIR = 'data/m'
G_BYTES = V.G_SHARD_BYTES
CURVE_POINTS = 64  # points of the curve of the other residues (log-spaced ranks)
Q_RING = 0.05
HYPER_PER_MB = 10  # coding calls per Mb: the release's threshold (Campbell et al., Cell 171:1042 (2017))


def sig(x, digits: int = 2):
    """A number to `digits` significant digits, None for a missing one."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    if x == 0:
        return 0
    return float(f'{x:.{digits}g}')


def _cols(src: dict, cohort: bool) -> dict:
    """The columns of a source's table that carry the numbers of one cohort ('' all samples, '_no_hypermutated')."""
    s = '_no_hypermutated' if cohort else ''
    return {
        'k': f'k{s}',
        'e': f'expected{s}',
        'o': f'oe{s}',
        'q': f'q_upper{s}',
        'eu': f'expected_unweighted{s}',
        'ou': f'oe_unweighted{s}',
    }


def _numbers(df: pd.DataFrame, cohort: bool) -> dict:
    """k, e, o, q as lists for the rows of `df`, with the unweighted expectation where the weighted one is missing; and
    the row numbers that fell back (q is then missing: the test needs the weights)."""
    c = _cols({}, cohort)
    k = df[c['k']]
    weighted = df[c['e']].notna()
    e = df[c['e']].where(weighted, df[c['eu']])
    o = df[c['o']].where(weighted, df[c['ou']])
    q = df[c['q']].where(weighted)
    fallback = [i for i, w in enumerate(weighted.tolist()) if not w and pd.notna(e.iat[i])]
    return {
        'k': [None if pd.isna(x) else int(x) for x in k],
        'e': [sig(x) for x in e],
        'o': [sig(x) for x in o],
        'q': [sig(x) for x in q],
        'u': fallback,
    }


def block(df: pd.DataFrame, somatic: bool, lower: bool = False) -> dict:
    """One protein's rows of one source (sorted by position) as a columnar block (see the module's docstring)."""
    df = df.sort_values('position').reset_index(drop=True)
    pos = df['position'].astype(int).tolist()
    p = [pos[0]] + [b - a for a, b in zip(pos, pos[1:])]
    a = _numbers(df, False)
    out = {'p': p, 'k': a['k'], 'e': a['e'], 'o': a['o'], 'q': a['q']}
    if a['u']:
        out['u'] = a['u']
    if somatic:
        b = _numbers(df, True)
        out.update({'k2': b['k'], 'e2': b['e'], 'o2': b['o'], 'q2': b['q']})
        if b['u'] and b['u'] != a['u']:
            out['u2'] = b['u']
    if lower and 'q_lower' in df:
        low = [(i, sig(x)) for i, x in enumerate(df['q_lower'].tolist()) if pd.notna(x) and x < Q_RING]
        if low:
            out['l'] = [v for i, x in low for v in (i, x)]
    return out


def decode(blk: dict) -> list[dict]:
    """The rows of a block as dicts (the Python twin of kit-propensity.js rowsOf; the tests compare them)."""
    pos, last, rows = blk['p'], 0, []
    u, u2 = set(blk.get('u', [])), set(blk.get('u2', blk.get('u', [])))
    low = dict(zip(blk.get('l', [])[::2], blk.get('l', [])[1::2]))
    for i, d in enumerate(pos):
        last += d
        r = {'pos': last, 'k': blk['k'][i], 'e': blk['e'][i], 'o': blk['o'][i], 'q': blk['q'][i], 'u': i in u}
        if 'k2' in blk:
            r.update({'k2': blk['k2'][i], 'e2': blk['e2'][i], 'o2': blk['o2'][i], 'q2': blk['q2'][i], 'u2': i in u2})
        if i in low:
            r['ql'] = low[i]
        rows.append(r)
    return rows


def read_source(path: Path, residues: list[str], somatic: bool, lower: bool) -> pd.DataFrame:
    want = ['canonical_UniProtAC', 'position', 'residue', 'k', 'expected', 'oe', 'q_upper', 'expected_unweighted', 'oe_unweighted']
    if somatic:
        want += [f'{c}_no_hypermutated' for c in ('k', 'expected', 'oe', 'q_upper', 'expected_unweighted', 'oe_unweighted')]
    if lower:
        want += ['q_lower']
    df = pd.read_csv(path, sep='\t', usecols=lambda c: c in want or c in ('oe_status', 'site_sets', 'samples_profiled', 'samples_profiled_no_hypermutated'))
    return df[df['residue'].isin(residues)]


def shard_files(blocks: dict[str, dict[str, dict]]) -> tuple[int, dict[int, dict]]:
    """({file number: {accession: {source: block}}}), about G_BYTES each; a protein is never split."""
    total = sum(len(json.dumps(b, separators=(',', ':'))) for b in blocks.values())
    n = max(1, -(-total // G_BYTES))
    files: dict[int, dict] = {k: {} for k in range(n)}
    for acc, b in blocks.items():
        files[V.hash_shard(acc, n)][acc] = b
    return n, files


# ---- the frequencies of the waterfall --------------------------------------------------------------------------------------


def curve(freqs: list[float], total: int, points: int = CURVE_POINTS) -> list:
    """The ranked frequencies of the residues that have a change, as [M, N, ranks, values]: M of them, among N residues in all
    (the other N - M have none, a flat tail), sampled at log-spaced ranks (rank 1 is the highest). Values keep three
    significant digits."""
    v = sorted((x for x in freqs if x > 0), reverse=True)
    m = len(v)
    if not m:
        return [0, total, [], []]
    ranks = sorted({1, m} | {int(round(m ** (i / (points - 1)))) for i in range(points)})
    ranks = [r for r in ranks if 1 <= r <= m]
    return [m, total, ranks, [sig(v[r - 1], 3) for r in ranks]]


def frequency_payload(
    freq: pd.DataFrame,
    den: pd.DataFrame,
    marks: dict[str, set[int]],
    totals: dict[str, int],
    pooled: dict[str, pd.DataFrame],
    sources: list[dict],
) -> dict:
    """The waterfall's file (data/wf.json).

    groups[src]: the group names; den[src]: [[profiled, profiled without hypermutated], ...] in that order, and 'all' the
    sums; sites[acc]: [[position, residue, [group index, changed, changed without hypermutated, ...] per source], ...] for
    the known sites with a change; bg[src][cohort][residue][group index or ''] the curve of the non-site residues."""
    out: dict = {'groups': {}, 'den': {}, 'all': {}, 'sites': {}, 'bg': {}}
    for s in sources:
        fs = s.get('frequency_source')
        if not fs:
            continue
        d = den[den['source'] == fs].fillna({'group': ''})
        groups = d['group'].tolist()
        out['groups'][s['id']] = groups
        out['den'][s['id']] = [[int(a), int(b)] for a, b in zip(d['samples_profiled'], d['samples_profiled_no_hypermutated'])]
        out['all'][s['id']] = [int(d['samples_profiled'].sum()), int(d['samples_profiled_no_hypermutated'].sum())]
    sites: dict[str, dict[int, list]] = {}
    for si, s in enumerate(sources):
        fs = s.get('frequency_source')
        if not fs:
            continue
        gi = {g: i for i, g in enumerate(out['groups'][s['id']])}
        f = freq[freq['source'] == fs].copy()
        f['group'] = f['group'].fillna('')
        f['isite'] = [p in marks.get(a, ()) for a, p in zip(f['canonical_UniProtAC'], f['position'])]
        on = f[f['isite']]
        for a, p, r, g, m1, m2 in zip(
            on['canonical_UniProtAC'], on['position'], on['residue'], on['group'],
            on['samples_mutated'], on['samples_mutated_no_hypermutated'],
        ):
            per = sites.setdefault(a, {}).setdefault(int(p), [r] + [[] for _ in sources])
            per[1 + si] += [gi[g], int(m1), int(m2)]
        # the curve of the residues that are not known sites
        bg: dict = {'all': {}, 'no_hypermutated': {}}
        non = f[~f['isite']]
        den_by = {g: out['den'][s['id']][i] for g, i in gi.items()}
        for cohort, mcol, k in (('all', 'samples_mutated', 0), ('no_hypermutated', 'samples_mutated_no_hypermutated', 1)):
            for res, n_total in totals.items():
                sub = non[non['residue'] == res]
                per_g: dict = {}
                for g, grp in sub.groupby('group'):
                    dn = den_by[g][k]
                    if dn:
                        per_g[str(gi[g])] = curve((grp[mcol] / dn).tolist(), n_total)
                # pooled over every group: the propensity table's own counts
                pt = pooled[s['id']]
                pt = pt[(pt['residue'] == res) & ~pt['isite']]
                col, dcol = ('k', 'samples_profiled') if k == 0 else ('k_no_hypermutated', 'samples_profiled_no_hypermutated')
                dd = pt[dcol]
                per_g[''] = curve((pt[col] / dd.where(dd > 0)).fillna(0).tolist(), n_total)
                bg[cohort][res] = per_g
        out['bg'][s['id']] = bg
    out['sites'] = {a: [[p, *per] for p, per in sorted(v.items())] for a, v in sites.items()}  # [pos, residue, per source...]
    return out


# ---- the oncoprint -------------------------------------------------------------------------------------------------------


def onco_payload(burden: pd.DataFrame, changes: list[pd.DataFrame], marks: dict[str, set[int]]) -> dict:
    """The oncoprint's file (data/onco.json): samples [[id without 'TCGA-', project index, hypermutated 0/1, coding calls per
    Mb], ...]; projects; sites {accession: [[position, [sample index * 2 + 1 for a stop change, else * 2, ...]], ...]}."""
    b = burden[burden['source'] == 'tcga_mc3'].reset_index(drop=True)
    projects = sorted(b['group'].dropna().unique().tolist())
    pi = {p: i for i, p in enumerate(projects)}
    at = {sid: i for i, sid in enumerate(b['sample_id'])}
    samples = [
        [str(sid).removeprefix('TCGA-'), pi[g], int(bool(h)), sig(x, 3)]
        for sid, g, h, x in zip(b['sample_id'], b['group'], b['hypermutated'], b['burden_per_mb'])
    ]
    sites: dict[str, dict[int, dict[int, int]]] = {}
    for df in changes:
        for a, p, s, alt in zip(df['canonical_UniProtAC'], df['position'], df['sample_id'], df['alt']):
            if int(p) not in marks.get(a, ()) or s not in at:
                continue
            cell = sites.setdefault(a, {}).setdefault(int(p), {})
            cell[at[s]] = max(cell.get(at[s], 0), 1 if alt == '*' else 0)
    return {
        'projects': projects,
        'samples': samples,
        'sites': {a: [[p, [i * 2 + st for i, st in sorted(cells.items())]] for p, cells in sorted(v.items())] for a, v in sites.items()},
    }


# ---- the build -----------------------------------------------------------------------------------------------------------


def _path(run: dict, name: str | None, log, what: str) -> Path | None:
    rec = (run.get('inputs') or {}).get(name or '')
    f = Path(rec['file']) if rec else None
    if f is None or not f.exists() or md5_file(f) != rec.get('md5'):
        log(f'  mutation propensity: {what} ({name}) is missing or changed since the run; left out')
        return None
    return f


def summaries(site_id: str, run: dict, cfg: dict, log) -> dict:
    """The small tables the Method and the views quote: the set's O/E over its proteins (site_set_propensity), the controls'
    results, the check against permutation. All short."""
    out: dict = {}
    f = _path(run, cfg.get('site_sets'), log, 'site sets')
    if f:
        d = pd.read_csv(f, sep='\t')
        d = d[d['site_set'] == (cfg.get('set') or site_id)]
        keep = ['residue', 'source', 'cohort', 'proteins', 'sites', 'observed', 'expected', 'oe', 'p_upper', 'p_lower', 'oe_status']
        out['sets'] = [
            {k: (sig(v, 4) if isinstance(v, float) else v) for k, v in r.items() if not (isinstance(v, float) and math.isnan(v))}
            for r in d[keep].to_dict('records')
        ]
        if len(d):
            out['set_label'] = d['label'].iloc[0]
            out['iterations'] = int(d['iterations'].iloc[0])
    f = _path(run, cfg.get('controls'), log, 'controls')
    if f:
        d = pd.read_csv(f, sep='\t')
        g = d.groupby(['kind', 'source', 'cohort', 'result']).size().reset_index(name='n')
        out['controls'] = g.to_dict('records')
    f = _path(run, cfg.get('validation'), log, 'validation')
    if f:
        d = pd.read_csv(f, sep='\t')
        keep = ['source', 'cohort', 'units', 'residues', 'binomial_p05', 'permutation_p05', 'both_p05', 'agreement_p05', 'iterations']
        out['validation'] = [
            {k: (sig(v, 4) if isinstance(v, float) else v) for k, v in r.items()} for r in d[keep].to_dict('records')
        ]
    return out


def build(site: dict, run: dict, listing: list, records: dict, seqs: dict, out: Path, log=print) -> dict | None:
    """Write data/m, data/wf.json and data/onco.json for `website.propensity` and return what the page reads about them
    (`D.propensity`); None when the site has none or its tables are missing."""
    cfg = (site.get('website') or {}).get('propensity')
    shutil.rmtree(out / DIR, ignore_errors=True)
    for f in ('wf.json', 'onco.json'):
        (out / 'data' / f).unlink(missing_ok=True)
    if not cfg or not listing:
        return None
    residues = list(cfg['residues'])
    marks = {a: {m[0] for m in (r.get('marks') or [])} for a, r in records.items()}
    acc = set(marks)
    sources, blocks, pooled = [], {}, {}
    n_rows = 0
    for s in cfg['sources']:
        f = _path(run, s['table'], log, s['id'])
        if not f:
            continue
        somatic = s.get('kind') == 'somatic'
        lower = s.get('kind') == 'germline' and s.get('lower_tail', False)
        full = read_source(f, residues, somatic, lower)
        descriptive = bool(len(full) and 'oe_status' in full and (full['oe_status'] == 'descriptive').all())
        df = full[full['canonical_UniProtAC'].isin(acc)]  # the proteins with a mark: the only cards that show a lollipop
        for a, g in df.groupby('canonical_UniProtAC'):
            blocks.setdefault(a, {})[s['id']] = block(g, somatic, lower)
        n_rows += len(df)
        sources.append(
            {
                **{k: v for k, v in s.items() if k not in ('table',)},
                'descriptive': descriptive,
                'rows': int(len(df)),
            }
        )
        if somatic:  # every residue with a change, for the curve of the residues that are not sites
            full = full.copy()
            full['isite'] = [p in marks.get(a, ()) for a, p in zip(full['canonical_UniProtAC'], full['position'])]
            pooled[s['id']] = full
    if not blocks:
        return None
    n, files = shard_files(blocks)
    (out / DIR).mkdir(parents=True, exist_ok=True)
    for k, f in files.items():
        (out / DIR / f'{k:03d}.json').write_text(json.dumps(f, separators=(',', ':')))
    size = sum(p.stat().st_size for p in (out / DIR).glob('*.json'))
    log(f'  mutation propensity: {n_rows:,} residues of {len(blocks):,} proteins in {n} files ({size / 1e6:.1f} MB), read when a card is opened')
    res: dict = {
        'shards': n,
        'residues': residues,
        'sources': sources,
        'hypermutated': {'per_mb': HYPER_PER_MB},
        'summary': summaries(site['id'], run, cfg, log),
    }
    # the waterfall and oncoprint files
    ff, df_, bf = (_path(run, cfg.get(k), log, k) for k in ('frequency', 'denominators', 'burden'))
    if ff and df_ and bf and pooled:
        freq = pd.read_csv(ff, sep='\t', dtype={'group': str})
        freq = freq[freq['residue'].isin(residues)]
        den = pd.read_csv(df_, sep='\t', dtype={'group': str})
        totals = {r: 0 for r in residues}
        for a, sq in seqs.items():
            for i, ch in enumerate(sq):
                if ch in totals:
                    totals[ch] += 1
        known = 0
        for a, ps in marks.items():
            for p in ps:
                ch = (seqs.get(a) or '')[p - 1 : p]
                if ch in totals:
                    totals[ch] -= 1
                    known += 1
        wf = frequency_payload(freq, den, marks, totals, pooled, [s for s in sources if s.get('frequency_source')])
        wf['sites_total'] = known
        text = json.dumps(wf, separators=(',', ':'))
        (out / 'data' / 'wf.json').write_text(text)
        res['wf'] = {'file': 'data/wf.json'}
        log(f'  mutation frequency: wf.json {len(text) / 1e3:.0f} KB')
        ch = [
            pd.read_csv(p, sep='\t', usecols=['canonical_UniProtAC', 'position', 'alt', 'sample_id'])
            for p in (_path(run, c, log, c) for c in cfg.get('changes') or [])
            if p
        ]
        if ch:
            burden = pd.read_csv(bf, sep='\t', dtype={'group': str})
            op = onco_payload(burden, ch, marks)
            text = json.dumps(op, separators=(',', ':'))
            (out / 'data' / 'onco.json').write_text(text)
            res['onco'] = {'file': 'data/onco.json'}
            log(f'  oncoprint: onco.json {len(text) / 1e3:.0f} KB')
    return res
