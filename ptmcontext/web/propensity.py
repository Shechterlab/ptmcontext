"""The mutation propensity the website shows (website.propensity, CONTRACTS.md, "Mutation propensity"), from the release's
per-residue tables: for each source (TCGA, DepMap, ClinVar, gnomAD) the changes observed at a residue against the changes its
codon predicts (O/E, with a q from a binomial test; the release's data dictionary defines every column).

Three kinds of file, all read only when something asks for them:

  data/m/NNN.json   per protein, like data/g: {accession: {source id: block}}, a few proteins to a file, the file of a protein
                    by variants.hash_shard (kit-propensity.js computes the same). A block is columnar, one entry per residue
                    of the site's residue types that is a known site or has a change, the positions as differences:
                      p   position deltas      k   changes seen (samples or variants)    e   expected changes
                      o   O/E (k / e)          q   Benjamini-Hochberg q of the upper tail (null: not tested)
                      pu  raw p of the upper tail (null: not tested)
                    TCGA and DepMap repeat k, e, o, q, pu without the hypermutated samples (k2, e2, o2, q2, pu2); gnomAD
                    adds `pl`, the raw p of the lower tail (fewer than expected). `u`: the rows
                    that had no weighted expectation (the entry has no coding sequence that matches its UniProt sequence),
                    written with the unweighted expectation and a null q; gnomAD `l`: [row, q, ...] for the rows with
                    q_lower < 0.05 (fewer variants than expected). Numbers keep two significant digits.
  data/wf.json      the waterfall's numbers: samples profiled per group, each known site's changed samples per group, O/E, q,
                    k, expected and both tails of each site with a change (TCGA and DepMap: the lower tail is computed here
                    with the release's binomial, only where it gives back the release's p_upper), and the signed-score curve
                    of the other residues of the same type
  data/onco.json    the oncoprint's numbers: every TCGA sample (project, hypermutated or not, coding calls per Mb) and, for each
                    known site, the samples with a change at it

A protein whose changes sit mostly at a few enriched residues (TP53 R175, R248, R273) inflates the expected count at its other residues of the
type, so they look depleted. `hotspots` flags such a protein per source, cohort and residue type (data/m block `h`, `h2`; data/wf.json
`hot`; data/gn.json `hot`): [[residue, share in percent, [positions of its enriched residues, most changes first]], ...]. It changes no k, expected, O/E, p or q.

The functions here are pure (they take the tables read); kit-propensity.js and kit-mutations.js read the files.
"""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import binom

from ..snapshot import md5_file
from . import variants as V

DIR = 'data/m'
G_BYTES = V.G_SHARD_BYTES
ZERO_ROWS = 1000  # the sites with no change listed per source (the most expected changes first)
CURVE_POINTS = 64  # points of the curve of the other residues (log-spaced ranks)
Q_RING = 0.05
HYPER_PER_MB = 10  # coding calls per Mb: the release's threshold (Campbell et al., Cell 171:1042 (2017))
SCORE_CAP = 300  # the signed score of a p that underflows to 0 (the release stores p to 4 significant digits)
REPRO_TOL = 6e-4  # relative: the release stores p_upper to 4 significant digits (half a unit in the fourth is 5e-4)
CURVE_ENDS = 48  # points of the signed curve, from each end (log-spaced ranks)
HOT_MIN_CHANGES = (
    20  # a protein is dominated by its enriched residues when its changes at residues of a type total at least this ...
)
HOT_MIN_SHARE = (
    0.30  # ... and the residues of that type with q < 0.05 carry at least this share of them (website.propensity)
)


def signed_score(o, pu, pl, cap: float = SCORE_CAP):
    """The waterfall's height of a site: -log10 of the upper-tail p when it has more than expected (O/E above 1), log10 of the
    lower-tail p (a negative number) when it has fewer (O/E below 1), 0 at O/E 1. None when the side's p is missing (no test).
    kit-mutations.js (K.prop.signed) is the twin."""
    if o is None or (isinstance(o, float) and math.isnan(o)):
        return None
    if o == 1:
        return 0.0
    p = pu if o > 1 else pl
    if p is None or (isinstance(p, float) and math.isnan(p)):
        return None
    if p <= 0:
        return float(cap) if o > 1 else -float(cap)
    s = -math.log10(p) if o > 1 else math.log10(p)
    return max(-cap, min(cap, s))


def signed_scores(o, pu, pl) -> np.ndarray:
    """`signed_score` over arrays (NaN where it is None)."""
    o, pu, pl = (np.asarray(x, dtype=float) for x in (o, pu, pl))
    with np.errstate(divide='ignore', invalid='ignore'):
        up = np.where(pu > 0, -np.log10(pu), SCORE_CAP)
        dn = np.where(pl > 0, np.log10(pl), -SCORE_CAP)
    s = np.where(o > 1, np.where(np.isnan(pu), np.nan, up), np.where(o < 1, np.where(np.isnan(pl), np.nan, dn), 0.0))
    s = np.where(np.isnan(o), np.nan, s)
    return np.clip(s, -SCORE_CAP, SCORE_CAP)


def binom_tails(df: pd.DataFrame, cohort: bool) -> tuple[pd.Series, pd.Series, pd.Series]:
    """The release's own model for each row of a source table: k ~ Binomial(n, expected / n). Returns P(X >= k), P(X <= k) and
    the rows where it applies (a weighted expectation and n above 0), as Series on df's index (NaN elsewhere)."""
    s = '_no_hypermutated' if cohort else ''
    if 'n' + s not in df:
        nan = pd.Series(np.nan, index=df.index)
        return nan, nan, pd.Series(False, index=df.index)
    k, n, e = (df[c + s] for c in ('k', 'n', 'expected'))
    ok = n.notna() & (n > 0) & e.notna() & k.notna()
    kk, nn = k.where(ok, 0).to_numpy(float), n.where(ok, 1).to_numpy(float)
    p = np.clip(e.where(ok, 0).to_numpy(float) / nn, 0, 1)
    upper = pd.Series(np.where(ok, binom.sf(kk - 1, nn, p), np.nan), index=df.index)
    lower = pd.Series(np.where(ok, binom.cdf(kk, nn, p), np.nan), index=df.index)
    return upper, lower, ok


def upper_reproduces(df: pd.DataFrame, cohort: bool) -> tuple[int, float, float]:
    """Whether the release's p_upper is the binomial upper tail of its own k, n and expected, to the rounding it stores (four
    significant digits): (rows checked, largest absolute difference, largest relative difference). The lower tail of a source
    that has none is computed only when this holds."""
    s = '_no_hypermutated' if cohort else ''
    if 'n' + s not in df or 'p_upper' + s not in df:
        return 0, math.nan, math.nan
    upper, _, ok = binom_tails(df, cohort)
    stored = df['p_upper' + s]
    ok = ok & stored.notna()
    a, b = upper[ok].to_numpy(float), stored[ok].to_numpy(float)
    if not len(a):
        return 0, math.nan, math.nan
    d = np.abs(a - b)
    with np.errstate(divide='ignore', invalid='ignore'):
        rel = np.where(b > 0, d / b, np.where(a > 1e-300, np.inf, 0.0))  # a stored 0 is an underflow
    return int(len(a)), float(d.max()), float(rel.max())


def lower_tail_ok(df: pd.DataFrame, cohort: bool) -> bool:
    n, _, rel = upper_reproduces(df, cohort)
    return n > 0 and rel <= REPRO_TOL


def sig(x, digits: int = 2):
    """A number to `digits` significant digits, None for a missing one; a value under 0.05 stays under it."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    if x == 0:
        return 0
    r = float(f'{x:.{digits}g}')
    # rounding never carries a value below 0.05 up to 0.05 (a ring, a count of sites with p < 0.05): 0.04986 stays under it
    return 0.0499 if x < Q_RING <= r else r


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
        'pu': f'p_upper{s}',
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
        'pu': [sig(x) for x in df[c['pu']].where(weighted)],
        'u': fallback,
    }


def hotspots(
    df: pd.DataFrame, cohort: bool, min_changes: int = HOT_MIN_CHANGES, min_share: float = HOT_MIN_SHARE
) -> dict[str, list]:
    """{accession: [[residue, share in percent, [position, ...]], ...]} for the proteins dominated by their enriched residues: per
    protein and residue type, the changes (k, summed over the rows of the release table, where every row with k > 0 is present)
    total at least `min_changes` and the residues that are themselves enriched (q_upper < 0.05 in the table) carry at least
    `min_share` of them. The positions are those enriched residues, the most changes first (a tie goes to the lower position).
    `cohort`: without the hypermutated samples."""
    s = '_no_hypermutated' if cohort else ''
    kc, qc = 'k' + s, 'q_upper' + s
    if kc not in df or qc not in df:
        return {}
    d = df[['canonical_UniProtAC', 'residue', 'position', kc, qc]]
    d = d[d[kc] > 0].sort_values([kc, 'position'], ascending=[False, True])
    keys = ['canonical_UniProtAC', 'residue']
    tot = d.groupby(keys)[kc].sum()
    en = d[d[qc] < Q_RING]
    got = en.groupby(keys)[kc].sum().reindex(tot.index).fillna(0)
    share = got / tot
    hit = (tot >= min_changes) & (share >= min_share) & (got > 0)
    where = en.groupby(keys)['position'].apply(lambda x: [int(v) for v in x])  # already most changes first
    out: dict[str, list] = {}
    for a, r in sorted(hit[hit].index):
        out.setdefault(a, []).append([r, int(round(share[(a, r)] * 100)), where[(a, r)]])
    return out


def block(df: pd.DataFrame, somatic: bool, lower: bool = False) -> dict:
    """One protein's rows of one source (sorted by position) as a columnar block (see the module's docstring)."""
    df = df.sort_values('position').reset_index(drop=True)
    pos = df['position'].astype(int).tolist()
    p = [pos[0]] + [b - a for a, b in zip(pos, pos[1:])]
    a = _numbers(df, False)
    out = {'p': p, 'k': a['k'], 'e': a['e'], 'o': a['o'], 'q': a['q'], 'pu': a['pu']}
    if (
        'residue' in df and df['residue'].nunique() > 1
    ):  # the residue letter of each row, where the protein has more than one type
        out['r'] = ''.join(df['residue'])
    if a['u']:
        out['u'] = a['u']
    if somatic:
        b = _numbers(df, True)
        out.update({'k2': b['k'], 'e2': b['e'], 'o2': b['o'], 'q2': b['q'], 'pu2': b['pu']})
        if b['u'] and b['u'] != a['u']:
            out['u2'] = b['u']
    if lower and 'q_lower' in df:
        low = [(i, sig(x)) for i, x in enumerate(df['q_lower'].tolist()) if pd.notna(x) and x < Q_RING]
        if low:
            out['l'] = [v for i, x in low for v in (i, x)]
        out['pl'] = [None if pd.isna(x) else sig(x) for x in df['p_lower']]
    return out


def decode(blk: dict) -> list[dict]:
    """The rows of a block as dicts (the Python twin of kit-propensity.js rowsOf; the tests compare them)."""
    pos, last, rows = blk['p'], 0, []
    u, u2 = set(blk.get('u', [])), set(blk.get('u2', blk.get('u', [])))
    low = dict(zip(blk.get('l', [])[::2], blk.get('l', [])[1::2]))
    for i, d in enumerate(pos):
        last += d
        r = {
            'pos': last,
            'k': blk['k'][i],
            'e': blk['e'][i],
            'o': blk['o'][i],
            'q': blk['q'][i],
            'pu': blk['pu'][i],
            'u': i in u,
        }
        if 'k2' in blk:
            r.update(
                {
                    'k2': blk['k2'][i],
                    'e2': blk['e2'][i],
                    'o2': blk['o2'][i],
                    'q2': blk['q2'][i],
                    'pu2': blk['pu2'][i],
                    'u2': i in u2,
                }
            )
        if 'pl' in blk:
            r['pl'] = blk['pl'][i]
        if i in low:
            r['ql'] = low[i]
        rows.append(r)
    return rows


def read_source(path: Path, residues: list[str], somatic: bool, lower: bool) -> pd.DataFrame:
    want = [
        'canonical_UniProtAC',
        'position',
        'residue',
        'k',
        'n',
        'expected',
        'oe',
        'q_upper',
        'p_upper',
        'expected_unweighted',
        'oe_unweighted',
    ]
    if somatic:
        want += [
            f'{c}_no_hypermutated'
            for c in ('k', 'n', 'expected', 'oe', 'q_upper', 'p_upper', 'expected_unweighted', 'oe_unweighted')
        ]
    if lower:
        want += ['q_lower', 'p_lower']
    df = pd.read_csv(
        path,
        sep='\t',
        usecols=lambda c: (
            c in want or c in ('oe_status', 'site_sets', 'samples_profiled', 'samples_profiled_no_hypermutated')
        ),
    )
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


def signed_curve(scores, points: int = CURVE_ENDS) -> list:
    """The ranked signed scores of a set of residues (NaN: no test, counted as 0), highest first, as [N, N, ranks, values] (the
    shape of `curve`, with no flat tail): sampled at log-spaced ranks from the top and from the bottom, so that both ends of the
    ranking keep their shape. Values keep three significant digits."""
    v = np.sort(np.nan_to_num(np.asarray(scores, dtype=float), nan=0.0))[::-1]
    n = len(v)
    if not n:
        return [0, 0, [], []]
    steps = [int(round(n ** (i / (points - 1)))) for i in range(points)]
    ranks = sorted({1, n} | {r for r in steps if 1 <= r <= n} | {n + 1 - r for r in steps if 1 <= r <= n})
    return [n, n, ranks, [sig(float(v[r - 1]), 3) for r in ranks]]


def _p(x):
    """A raw p to two significant digits, None when missing."""
    return None if x is None or pd.isna(x) else sig(float(x))


def _int(x):
    """A float that is a whole number as an int (shorter in JSON: 1 for 1.0)."""
    return int(x) if isinstance(x, float) and x == int(x) else x


def _cohort(o, q, k, e, pu, pl) -> list:
    """[O/E, q, k, expected, p (more), p (fewer)] of one cohort for `stats`: the p of the side the other way (above 0.5, so a p
    that says nothing) is left out, as null."""
    if o is not None:
        if o > 1 and pl is not None and pl > 0.5:
            pl = None
        elif o <= 1 and pu is not None and pu > 0.5:
            pu = None
    return [_int(x) for x in (o, q, k, e, pu, pl)]


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
    the known sites with a change; bg[src][cohort][residue] the curve of the signed score of the non-site residues
    (`signed_curve`); lower[src]: [all, without hypermutated], whether the site computed the lower tail (the release's p_upper
    is reproduced by its own binomial); stats[src][acc]: [[position, c1 (6 numbers), c2 (6 numbers, left out when it equals c1)], ...],
    each cohort c = [O/E, q, k, expected, raw p of the upper tail, raw p of the lower tail] (a p above 0.5 on the side opposite
    to O/E is null); zero[src][cohort]: [[acc, position, residue,
    expected, raw p of the lower tail], ...] for known sites with no change."""
    out: dict = {'groups': {}, 'den': {}, 'all': {}, 'sites': {}, 'bg': {}, 'lower': {}}
    for s in sources:
        fs = s.get('frequency_source')
        if not fs:
            continue
        d = den[den['source'] == fs].fillna({'group': ''})
        groups = d['group'].tolist()
        out['groups'][s['id']] = groups
        out['den'][s['id']] = [
            [int(a), int(b)] for a, b in zip(d['samples_profiled'], d['samples_profiled_no_hypermutated'])
        ]
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
            on['canonical_UniProtAC'],
            on['position'],
            on['residue'],
            on['group'],
            on['samples_mutated'],
            on['samples_mutated_no_hypermutated'],
        ):
            per = sites.setdefault(a, {}).setdefault(int(p), [r] + [[] for _ in sources])
            per[1 + si] += [gi[g], int(m1), int(m2)]
        # the lower tail the release lacks for a somatic source, by its own model, where that model gives its p_upper back
        pt = pooled[s['id']]
        lower_ok = [lower_tail_ok(pt, False), lower_tail_ok(pt, True)]
        out['lower'][s['id']] = lower_ok
        tails = []
        for cohort in (False, True):
            _, lo, _ = binom_tails(pt, cohort)
            tails.append(lo if lower_ok[int(cohort)] else lo * np.nan)
        pl1, pl2 = tails
        # the curve of the signed score of the residues that are not known sites (the sites' own scores are in `stats`)
        bg: dict = {'all': {}, 'no_hypermutated': {}}
        non = ~pt['isite'].to_numpy(bool)
        for cohort, sfx, pl in (('all', '', pl1), ('no_hypermutated', '_no_hypermutated', pl2)):
            w = pt['expected' + sfx].notna()
            sc = signed_scores(pt['oe' + sfx].where(w), pt['p_upper' + sfx].where(w), pl)
            for res in totals:
                bg[cohort][res] = signed_curve(sc[non & (pt['residue'] == res).to_numpy(bool)])
        out['bg'][s['id']] = bg
        # O/E, q, k, expected and both tails of each known site with a change, in both cohorts: the points of the waterfall
        keep = pt['isite'] & ((pt['k'] > 0) | (pt['k_no_hypermutated'] > 0))
        on_ = pt[keep].sort_values(['canonical_UniProtAC', 'position'])
        a_, b_ = _numbers(on_, False), _numbers(on_, True)
        la, lb = pl1[on_.index], pl2[on_.index]
        st: dict[str, list] = {}
        for i, (acc_, pos_) in enumerate(zip(on_['canonical_UniProtAC'], on_['position'])):
            c1 = _cohort(a_['o'][i], a_['q'][i], a_['k'][i], a_['e'][i], a_['pu'][i], _p(la.iat[i]))
            c2 = _cohort(b_['o'][i], b_['q'][i], b_['k'][i], b_['e'][i], b_['pu'][i], _p(lb.iat[i]))
            st.setdefault(acc_, []).append([int(pos_), *c1] + ([] if c1 == c2 else c2))
        out.setdefault('stats', {})[s['id']] = st
        # the known sites with no change that a table can list: the ZERO_ROWS with the most expected changes, per cohort
        zero = {}
        for cohort, kc, ec, lo in (
            ('all', 'k', 'expected', pl1),
            ('no_hypermutated', 'k_no_hypermutated', 'expected_no_hypermutated', pl2),
        ):
            z = pt[pt['isite'] & (pt[kc] == 0) & pt[ec].notna()].sort_values(ec, ascending=False).head(ZERO_ROWS)
            zero[cohort] = [
                [a_, int(p_), r_, _int(sig(float(e_))), _p(l_)]
                for a_, p_, r_, e_, l_ in zip(z['canonical_UniProtAC'], z['position'], z['residue'], z[ec], lo[z.index])
            ]
        out.setdefault('zero', {})[s['id']] = zero
    out['sites'] = {
        a: [[p, *per] for p, per in sorted(v.items())] for a, v in sites.items()
    }  # [pos, residue, per source...]
    return out


def germline_payload(changes: list[pd.DataFrame], prop: pd.DataFrame, totals: dict[str, int]) -> dict:
    """The germline waterfall's file (data/gn.json). A residue's height is k, the number of gnomAD variants with a missense or
    stop change there (the count the O/E test uses); its summed allele frequency (`af`: allele count over allele number, added
    over the variants) is kept for the tooltip. sites[acc]: [[position, residue, k, summed af, O/E, q (more), q (fewer),
    expected], ...] for the known sites with a variant, those with none and raw p_lower < 0.05, and the ZERO_ROWS with none and the most expected
    (p_lower: raw p of the lower tail; the last is the raw upper p); bg[residue]:
    the curve of the signed score over the other residues (`signed_curve`)."""
    ch = pd.concat([c[['canonical_UniProtAC', 'position', 'af']] for c in changes])
    af = ch.groupby(['canonical_UniProtAC', 'position'])['af'].sum().rename('sum_af').reset_index()
    d = prop.merge(af, on=['canonical_UniProtAC', 'position'], how='left')
    d['sum_af'] = d['sum_af'].fillna(0.0)
    w = d['expected'].notna()
    sc = signed_scores(d['oe'].where(w), d['p_upper'].where(w), d['p_lower'] if 'p_lower' in d else np.nan)
    non = ~d['isite'].to_numpy(bool)
    bg = {res: signed_curve(sc[non & (d['residue'] == res).to_numpy(bool)]) for res in totals}
    low = d['p_lower'] < 0.05 if 'p_lower' in d else pd.Series(False, index=d.index)
    zero = d[d['isite'] & (d['k'] == 0)]
    top0 = zero.sort_values('expected', ascending=False).head(ZERO_ROWS).index
    keep = d['isite'] & ((d['k'] > 0) | low | d.index.isin(top0))
    on = d[keep].sort_values(['canonical_UniProtAC', 'position'])
    nums = _numbers(on, False)
    ql = [sig(x) if pd.notna(x) else None for x in on['q_lower']] if 'q_lower' in on else [None] * len(on)
    pl = [sig(x) if pd.notna(x) else None for x in on['p_lower']] if 'p_lower' in on else [None] * len(on)
    sites: dict[str, list] = {}
    for i, (a, p, r) in enumerate(zip(on['canonical_UniProtAC'], on['position'], on['residue'])):
        sites.setdefault(a, []).append(
            [
                int(p),
                r,
                nums['k'][i],
                sig(float(on['sum_af'].iat[i]), 3),
                nums['o'][i],
                nums['q'][i],
                ql[i],
                nums['e'][i],
                pl[i],
                nums['pu'][i],
            ]
        )
    return {'sites': sites, 'bg': bg}


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
        'sites': {
            a: [[p, [i * 2 + st for i, st in sorted(cells.items())]] for p, cells in sorted(v.items())]
            for a, v in sites.items()
        },
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
        keep = [
            'residue',
            'source',
            'cohort',
            'proteins',
            'sites',
            'observed',
            'expected',
            'oe',
            'p_upper',
            'p_lower',
            'oe_status',
        ]
        out['sets'] = [
            {
                k: (sig(v, 4) if isinstance(v, float) else v)
                for k, v in r.items()
                if not (isinstance(v, float) and math.isnan(v))
            }
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
        keep = [
            'source',
            'cohort',
            'units',
            'residues',
            'binomial_p05',
            'permutation_p05',
            'both_p05',
            'agreement_p05',
            'iterations',
        ]
        out['validation'] = [
            {k: (sig(v, 4) if isinstance(v, float) else v) for k, v in r.items()} for r in d[keep].to_dict('records')
        ]
    return out


def build(site: dict, run: dict, listing: list, records: dict, seqs: dict, out: Path, log=print) -> dict | None:
    """Write data/m, data/wf.json and data/onco.json for `website.propensity` and return what the page reads about them
    (`D.propensity`); None when the site has none or its tables are missing."""
    cfg = (site.get('website') or {}).get('propensity')
    shutil.rmtree(out / DIR, ignore_errors=True)
    for f in ('wf.json', 'onco.json', 'gn.json'):
        (out / 'data' / f).unlink(missing_ok=True)
    if not cfg or not listing:
        return None
    residues = list(cfg['residues'])
    hot_cfg = (cfg.get('hotspot_min_changes', HOT_MIN_CHANGES), cfg.get('hotspot_min_share', HOT_MIN_SHARE))
    marks = {a: {m[0] for m in (r.get('marks') or [])} for a, r in records.items()}
    acc = set(marks)
    sources, blocks, pooled, germ, hot = [], {}, {}, {}, {}
    n_rows = 0
    for s in cfg['sources']:
        f = _path(run, s['table'], log, s['id'])
        if not f:
            continue
        somatic = s.get('kind') == 'somatic'
        lower = s.get('kind') == 'germline' and s.get('lower_tail', False)
        full = read_source(f, residues, somatic, lower)
        descriptive = bool(len(full) and 'oe_status' in full and (full['oe_status'] == 'descriptive').all())
        df = full[
            full['canonical_UniProtAC'].isin(acc)
        ]  # the proteins with a mark: the only cards that show a lollipop
        h = {}  # the proteins dominated by their enriched residues (ClinVar is descriptive: no test, nothing to explain)
        if not descriptive:
            for c in (False, True) if somatic else (False,):
                h[c] = {a: v for a, v in hotspots(full, c, *hot_cfg).items() if a in acc}
        hot[s['id']] = h
        for a, g in df.groupby('canonical_UniProtAC'):
            b = blocks.setdefault(a, {})[s['id']] = block(g, somatic, lower)
            for c, key in ((False, 'h'), (True, 'h2')):
                if a in h.get(c, {}):
                    b[key] = h[c][a]
        n_rows += len(df)
        sources.append(
            {
                **{k: v for k, v in s.items() if k not in ('table',)},
                'descriptive': descriptive,
                'rows': int(len(df)),
            }
        )
        if somatic or lower:  # every residue with a change, for the curve of the residues that are not sites
            full = full.copy()
            full['isite'] = [p in marks.get(a, ()) for a, p in zip(full['canonical_UniProtAC'], full['position'])]
            (pooled if somatic else germ)[s['id']] = full
    if not blocks:
        return None
    n, files = shard_files(blocks)
    (out / DIR).mkdir(parents=True, exist_ok=True)
    for k, f in files.items():
        (out / DIR / f'{k:03d}.json').write_text(json.dumps(f, separators=(',', ':')))
    size = sum(p.stat().st_size for p in (out / DIR).glob('*.json'))
    log(
        f'  mutation propensity: {n_rows:,} residues of {len(blocks):,} proteins in {n} files ({size / 1e6:.1f} MB), read when a card is opened'
    )
    res: dict = {
        'shards': n,
        'residues': residues,
        'sources': sources,
        'hypermutated': {'per_mb': HYPER_PER_MB},
        'zero_rows': ZERO_ROWS,
        'hotspot': {'min_changes': hot_cfg[0], 'min_share': hot_cfg[1]},
        'summary': summaries(site['id'], run, cfg, log),
    }
    # the waterfall and oncoprint files
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
    ff, df_, bf = (_path(run, cfg.get(k), log, k) for k in ('frequency', 'denominators', 'burden'))
    if ff and df_ and bf and pooled:
        freq = pd.read_csv(ff, sep='\t', dtype={'group': str})
        freq = freq[freq['residue'].isin(residues)]
        den = pd.read_csv(df_, sep='\t', dtype={'group': str})
        wf = frequency_payload(freq, den, marks, totals, pooled, [s for s in sources if s.get('frequency_source')])
        wf['sites_total'] = known
        wf['hot'] = {
            s['id']: {'all': hot[s['id']].get(False, {}), 'no_hypermutated': hot[s['id']].get(True, {})}
            for s in sources
            if s.get('frequency_source') and hot.get(s['id'])
        }
        for sid, ok in wf['lower'].items():
            for cohort, good in zip((False, True), ok):
                n_, d_, r_ = upper_reproduces(pooled[sid], cohort)
                log(
                    f'  lower tail, {sid}{" without hypermutated" if cohort else ""}: p_upper {"reproduced" if good else "NOT reproduced"} '
                    f'by Binomial(n, expected / n) for {n_:,} rows (max abs diff {d_:.2g}, max rel {r_:.2g})'
                    + ('' if good else '; sites with O/E < 1 are drawn at 0')
                )
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
    gc = [p for p in (_path(run, c, log, c) for c in cfg.get('germline_changes') or []) if p]
    if gc and germ:
        sid, prop = next(iter(germ.items()))
        gn = germline_payload(
            [pd.read_csv(p, sep='\t', usecols=['canonical_UniProtAC', 'position', 'af']) for p in gc], prop, totals
        )
        if hot.get(sid, {}).get(False):
            gn['hot'] = hot[sid][False]
        text = json.dumps(gn, separators=(',', ':'))
        (out / 'data' / 'gn.json').write_text(text)
        res['gn'] = {'file': 'data/gn.json', 'source': sid}
        log(f'  germline frequency: gn.json {len(text) / 1e3:.0f} KB')
    return res
