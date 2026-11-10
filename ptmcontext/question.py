"""A residue question of several tests, each with its own class and its own background.

A layer places every candidate residue in a class, and residue_tests compares the marks with the other candidates of
their proteins. Some questions are a family of yes-or-no tests instead, each against the residues its evidence could
have reached: is a mark more often at an RNA crosslink, among the residues of the proteins with a crosslink? at a PDB
interface, among the residues a structure observed? inside an RNA-bound peptide, among the residues of the peptides
the experiment measured? This module runs such a question from a site file, for any mark and any organism:

  tests      one row per test (and method), in the order listed; each test names its category (and stratum), what
             puts a residue in it, and which candidates it counts
  strata     optional: every test again on part of its candidates (outside disordered regions, inside domains, ...),
             rows test by test, stratum by stratum

What puts a residue in a test's class:

  inside: <role>            the residue is inside a unit of the role, or within: N residues of one
  value: <role>             the residue's value (a per-residue table) is at_most, below, at_least or above a threshold

Which candidates a test counts, the measured background (each may be one role or a list; every one applies):

  proteins_with: <role>     only the proteins with a unit of the role ({role, on_candidates: true}: a unit that
                            holds a candidate residue)
  covered_by: <role>        only the residues inside a unit of the role: the residues an experiment measured or a
                            structure modeled
  outside_of: <role>        only the residues outside every unit of the role
  with_value: <role>        only the residues the per-residue table has a value for
  unless: <motif rule>      not the residues whose window matches the rule (the profile's motif syntax: all, any)

candidates_from: marks (default: the residues of the proteins with a counted mark) or marks_and_left_out (also those of
the proteins whose only marks are left out, as the release's lower-confidence view counts them; the left-out marks
themselves are on neither side).

counting says what the two tests count: proteins_with_both (the default, as residue_tests: the pooled test counts the
marks on proteins with another candidate, and the within-protein test the proteins with both) or every_candidate
(every candidate residue of the test counts in the pooled test, and the within-protein row reports those counts; it is
left out when the test has one protein), the convention of the Methylarginine Site Explorer's interaction tests.

q is Benjamini-Hochberg over the question's rows, within each method. A test that reads an input which is not present
(a checksum_only input the build's root does not hold) is left out, and the run says so.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from . import layers as L
from . import stats
from .profile import _matches, check_residues

RESTRICT = ('proteins_with', 'covered_by', 'outside_of', 'with_value', 'unless')
CLASS_KEYS = ('inside', 'within', 'value', 'at_most', 'below', 'at_least', 'above')
TEST_KEYS = {
    'category',
    'stratum',
    'label',
    'suffix',
    'help',
    'background',
    'background_within',
    *CLASS_KEYS,
    *RESTRICT,
}
COUNTING = ('proteins_with_both', 'every_candidate')


def _list(v) -> list:
    return [] if v is None else list(v) if isinstance(v, list) else [v]


def expand(spec: dict) -> list[dict]:
    """The question's tests, each with every key it inherits (the analysis's defaults, then the test's, then the
    stratum's; the background restrictions add up), and its code: the category, with _<stratum> for strata other
    than all."""
    tests, strata = spec.get('tests') or [], spec.get('strata') or [{'stratum': 'all'}]
    out, seen = [], set()
    for t in tests:
        unknown = sorted(set(t) - TEST_KEYS)
        if unknown:
            raise ValueError(f'{spec["id"]}: test {t.get("category")!r} has keys it does not know: {unknown}')
        for s in strata:
            bad = sorted(set(s) - TEST_KEYS - {'stratum'})
            if bad:
                raise ValueError(f'{spec["id"]}: stratum {s.get("stratum")!r} has keys it does not know: {bad}')
            x = {
                k: spec[k]
                for k in TEST_KEYS
                if k in spec and k not in RESTRICT and k not in ('category', 'label', 'help')
            }
            x.update({k: v for k, v in t.items() if k not in RESTRICT})
            x.update({k: v for k, v in s.items() if k not in RESTRICT})
            for k in RESTRICT:
                x[k] = _list(spec.get(k)) + _list(t.get(k)) + _list(s.get(k))
            x['stratum'] = s.get('stratum', t.get('stratum', 'all'))
            x['code'] = x['category'] if x['stratum'] == 'all' else f'{x["category"]}_{x["stratum"]}'
            if x['code'] in seen:
                raise ValueError(f'{spec["id"]}: two tests have the code {x["code"]!r}')
            seen.add(x['code'])
            if bool(x.get('inside')) == bool(x.get('value')):
                raise ValueError(
                    f'{spec["id"]}: test {x["code"]!r} needs inside: <role> or value: <role> (one of them)'
                )
            if x.get('value') and sum(k in x for k in ('at_most', 'below', 'at_least', 'above')) != 1:
                raise ValueError(
                    f'{spec["id"]}: test {x["code"]!r} reads values: give one of at_most, below, at_least, above'
                )
            out.append(x)
    return out


def _role_of(r) -> str:
    return r['role'] if isinstance(r, dict) else r


def roles_of(spec: dict) -> list[str]:
    """Every role a question reads, in the order its tests name them."""
    out = []
    for t in expand(spec):
        out += test_roles(t)
    return list(dict.fromkeys(out))


def test_roles(t: dict) -> list[str]:
    return [_role_of(t[k]) for k in ('inside', 'value') if t.get(k)] + [
        _role_of(r) for k in ('proteins_with', 'covered_by', 'outside_of', 'with_value') for r in t[k]
    ]


def covered(acc: np.ndarray, pos: np.ndarray, units: pd.DataFrame, window: int = 0) -> np.ndarray:
    """Whether each residue (accession, position) is inside a unit, or within window residues of one."""
    out = np.zeros(len(acc), dtype=bool)
    if not len(units) or not len(acc):
        return out
    ids = {a: i for i, a in enumerate(sorted(set(units['accession'])))}
    span = 10**7  # longer than any protein, with its window
    ua = units['accession'].map(ids).to_numpy(dtype=np.int64)
    starts = ua * span + (units['start'].to_numpy(dtype=np.int64) - window + span // 2)
    ends = ua * span + (units['end'].to_numpy(dtype=np.int64) + window + span // 2)
    order = np.argsort(starts, kind='stable')
    starts, ends = starts[order], np.maximum.accumulate(ends[order])
    ra = pd.Series(acc).map(ids)
    have = ra.notna().to_numpy()
    keys = ra[have].to_numpy(dtype=np.int64) * span + (pos[have].astype(np.int64) + span // 2)
    idx = np.searchsorted(starts, keys, side='right') - 1
    out[have] = (idx >= 0) & (ends[np.maximum(idx, 0)] >= keys)
    return out


class Question:
    """The tests of one question on a site's candidate residues: run() gives its statistics rows; kept holds, per test,
    what the protein pages and the browser need (which marks it counts and has in its class, per-protein counts)."""

    def __init__(self, ctx: L.Context, spec: dict):
        self.ctx, self.spec = ctx, spec
        self.tests = expand(spec)
        self.counting = spec.get('counting', 'proteins_with_both')
        if self.counting not in COUNTING:
            raise ValueError(f'{spec["id"]}: counting must be one of {COUNTING}')
        self.left_out_tests: list[dict] = []

    def _units(self, ref) -> pd.DataFrame:
        """The units of a role, or of the rows a reference keeps ({role, where: [conditions on the units' columns]})."""
        from .units import select_rows

        role = _role_of(ref)
        u = self.ctx.units(role, (self.spec.get('kinds') or {}).get(role, role))
        return (
            select_rows(u, {'include': ref.get('where', [])}, self.ctx.snapshot)
            if isinstance(ref, dict) and ref.get('where')
            else u
        )

    def run(self, marked: pd.DataFrame, left_out: pd.DataFrame | None = None, keep: dict | None = None) -> pd.DataFrame:
        ctx, profile, snap = self.ctx, self.ctx.profile, self.ctx.snapshot
        marked = marked[['accession', 'position']].copy()
        marked['position'] = marked['position'].astype(int)
        marked = marked[marked['accession'].isin(snap.sequences)].drop_duplicates()
        bad = check_residues(profile, snap, marked)
        if len(bad):
            raise ValueError(
                f'{len(bad)} marked residues are not {profile.residues} on the snapshot, e.g. {bad.head(3).to_dict("records")}'
            )
        prots = set(marked['accession'])
        if self.spec.get('candidates_from') == 'marks_and_left_out' and left_out is not None and len(left_out):
            prots |= set(left_out['accession']) & set(snap.sequences)  # their proteins' other residues count too
        cand = snap.residues(profile.residues, accessions=sorted(prots))
        key = cand['accession'].astype(str) + ':' + cand['position'].astype(str)
        is_m = key.isin(set(marked['accession'] + ':' + marked['position'].astype(str))).to_numpy()
        is_l = np.zeros(len(cand), dtype=bool)
        if left_out is not None and len(left_out):
            is_l = (
                key.isin(
                    set(left_out['accession'].astype(str) + ':' + left_out['position'].astype(int).astype(str))
                ).to_numpy()
                & ~is_m
            )
        acc, pos = cand['accession'].to_numpy(), cand['position'].to_numpy(dtype=np.int64)
        windows = None
        fisher, within, kept = [], [], {}
        bg_default = profile.background('marked_proteins')
        for t in self.tests:
            missing = list(dict.fromkeys(r for r in test_roles(t) if r not in ctx.inputs))
            if missing:
                self.left_out_tests.append({'code': t['code'], 'roles': missing})
                continue
            m = ~is_l
            for r in t['proteins_with']:
                on_cand = isinstance(r, dict) and r.get('on_candidates')
                u = self._units(r)
                prots = set(acc[covered(acc, pos, u)]) if on_cand else set(u['accession'])
                m &= np.isin(acc, list(prots))
            for r in t['covered_by']:
                m &= covered(acc, pos, self._units(r))
            for r in t['outside_of']:
                m &= ~covered(acc, pos, self._units(r))
            for r in t['with_value']:
                v = ctx.values(_role_of(r))
                m &= pd.MultiIndex.from_arrays([acc, pos]).isin(
                    pd.MultiIndex.from_arrays([v['accession'], v['position']])
                )
            for rule in t['unless']:
                if windows is None:
                    windows = snap.windows(cand, max(profile.motif_flank, 10)).to_numpy()
                m &= ~np.array([_matches(rule, w) for w in windows])
            if t.get('inside'):
                cls = covered(acc, pos, self._units(t['inside']), int(t.get('within', 0)))
            else:
                v = ctx.values(_role_of(t['value'])).set_index(['accession', 'position'])['value']
                vals = v.reindex(pd.MultiIndex.from_arrays([acc, pos])).to_numpy(dtype=float)
                with np.errstate(invalid='ignore'):
                    cls = (
                        vals <= t['at_most']
                        if 'at_most' in t
                        else vals < t['below']
                        if 'below' in t
                        else vals >= t['at_least']
                        if 'at_least' in t
                        else vals > t['above']
                    )
                cls &= ~np.isnan(vals)
            sub = pd.DataFrame({'accession': acc[m], 'position': pos[m], 'marked': is_m[m], 'in': cls[m]})
            g = (
                sub.assign(
                    a=sub['marked'] & sub['in'],
                    b=sub['marked'] & ~sub['in'],
                    c=~sub['marked'] & sub['in'],
                    d=~sub['marked'] & ~sub['in'],
                )
                .groupby('accession', sort=True)[['a', 'b', 'c', 'd']]
                .sum()
            )
            tables = [tuple(int(x) for x in r) for r in g.to_numpy()]
            bg = t.get('background', bg_default)
            bgw = t.get('background_within', bg + ', each protein a stratum')
            f, w = self._rows(t, tables, bg, bgw)
            fisher += f
            within += w
            kept[t['code']] = {'counted': sub[['accession', 'position', 'marked', 'in']], 'per_protein': g}
        for rows in (fisher, within):
            idx = [
                i
                for i, r in enumerate(rows)
                if r['p'] is not None and not (isinstance(r['p'], float) and math.isnan(r['p']))
            ]
            for i, q in zip(idx, stats.benjamini_hochberg([rows[i]['p'] for i in idx])):
                rows[i]['q'] = q
        if keep is not None:
            keep.update(
                question=True,
                tests=kept,
                codes=[t['code'] for t in self.tests if t['code'] in kept],
                left_out_tests=self.left_out_tests,
            )
        return pd.DataFrame(fisher + within)

    def _rows(self, t: dict, tables: list, bg: str, bgw: str) -> tuple[list, list]:
        aid, cat, stratum = self.spec['id'], t['category'], t['stratum']
        if self.counting == 'every_candidate':  # every candidate; the within-protein row reports the same counts
            a, b, c, d = (sum(x[k] for x in tables) for k in range(4))
            strata = tables if len(tables) > 1 else None
        else:  # marks on proteins with another candidate; strata with both
            a, b = (sum(x[k] for x in tables if x[2] + x[3]) for k in (0, 1))
            c, d = (sum(x[k] for x in tables) for k in (2, 3))
            strata = [x for x in tables if x[0] + x[1] and x[2] + x[3]]
        fisher, within = [], []
        if a + b + c + d:
            odds = stats.haldane_odds_ratio(a, b, c, d)
            fisher.append(
                {
                    'analysis': aid,
                    'category': cat,
                    'stratum': stratum,
                    'a': a,
                    'b': b,
                    'c': c,
                    'd': d,
                    'odds_ratio': odds,
                    'log2_odds_ratio': stats.log2_or_nan(odds),
                    'p': stats.fisher_p(a, b, c, d),
                    'method': 'fisher',
                    'background': bg,
                }
            )
        if strata:
            if self.counting != 'every_candidate':
                a, b, c, d = (sum(x[k] for x in strata) for k in range(4))
            odds, lo, hi, p, used = stats.mantel_haenszel_ci(strata)
            ok = odds is not None and math.isfinite(odds) and odds > 0
            within.append(
                {
                    'analysis': aid,
                    'category': cat,
                    'stratum': stratum,
                    'a': a,
                    'b': b,
                    'c': c,
                    'd': d,
                    'odds_ratio': odds if ok else None,
                    'log2_odds_ratio': math.log2(odds) if ok else None,
                    'odds_ratio_ci_low': lo if ok else None,
                    'odds_ratio_ci_high': hi if ok else None,
                    'p': p,
                    'method': 'mantel_haenszel',
                    'background': bgw,
                    'n_strata': used,
                }
            )
        return fisher, within


def distinct_labels(aid: str, tests: list[dict], labels: dict) -> dict:
    """Every class of a question has a label of its own (a card lists them as rows). Two tests that differ only by
    stratum share the test's label, so the stratum is added to the label ("Any interface (ordered)") unless the site gave
    a `suffix` or its own `labels`; labels that are still the same are an error, named by the site check."""
    count: dict = {}
    for v in labels.values():
        count[v] = count.get(v, 0) + 1
    out = {}
    for t in tests:
        v = labels[t['code']]
        if count[v] > 1 and t['stratum'] != 'all':
            v = f'{v} ({t["stratum"].replace("_", " ")})'
        out[t['code']] = v
    seen: dict = {}
    for code, v in out.items():
        if v in seen:
            raise ValueError(
                f'{aid}: classes {seen[v]!r} and {code!r} have the same label {v!r}: give one a label or suffix'
            )
        seen[v] = code
    return out


def question_layer(spec: dict) -> L.Layer:
    """What the website shows of a question, as a flags layer would describe itself (its tests are its classes; the
    roles its tests read; the tracks the site file asks it to draw)."""
    tests = expand(spec)
    labels = {
        t['code']: (
            f'{t["label"]}{t.get("suffix", "")}'
            if t.get('label')
            else (spec.get('labels') or {}).get(t['code']) or t['code'].replace('_', ' ')
        )
        for t in tests
    }
    labels = distinct_labels(spec['id'], tests, labels)
    helps = {t['code']: t.get('help') or (spec.get('help') or {}).get(t['code'], '') for t in tests}
    tracks = []
    for role, tr in (spec.get('tracks') or {}).items():
        kind = (spec.get('kinds') or {}).get(role, role)

        def drawn(ctx, accs, role=role, kind=kind):
            if role not in ctx.inputs:
                return pd.DataFrame(columns=['accession', 'start', 'end', 'label', 'source'])
            u = ctx.units(role, kind)
            return u[u['accession'].isin(accs)]

        tracks.append(
            L.Track(
                tr.get('kind', role),
                tr.get('title', role.replace('_', ' ')),
                tr.get('style', 'segments'),
                drawn,
                roles=(role,),
                help=tr.get('help', ''),
                colours=tuple((tr.get('colours') or {}).items()),
            )
        )
    return L.Layer(
        'tests',
        'flags',
        spec.get('describe', f'{len(tests)} tests, each against its own background'),
        lambda r, c: pd.DataFrame(index=r.index),
        needs=tuple(roles_of(spec)),
        title=spec.get('title', spec['id']),
        labels=labels,
        help=helps,
        question=spec.get('question', ''),
        sub=spec.get('sub', ''),
        section=spec.get('section', ''),
        tracks=tuple(tracks),
    )
