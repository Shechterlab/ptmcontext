"""The percent view of the maps of the cell (kit-cell.js, website.cell.default_view), on the toy site of
test_cell_and_values: the share of each compartment's proteins that carry at least one mark. The counts are made when
the site is built (cell_pct), then drawn by the page; each is checked against a hand count of the toy tables. Nothing
here names a source or a mark."""

from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml
from test_cell_and_values import _toy

from ptmcontext import site as S
from ptmcontext import web

ASSETS = Path(__file__).resolve().parents[1] / 'ptmcontext' / 'web' / 'assets'
STATS = Path(__file__).resolve().parents[1] / 'packages' / 'ptmstats' / 'ptmstats' / 'ptmstats.js'

# The toy: P1-P5 carry a mark. Map A places P1-P10: nucleus P1-P4, cytosol P5-P7, membrane P8-P10. Map B places P1-P8:
# nuclear P1-P3, cyto P4-P8. Regions of map A: inside P1-P4, outside P5-P10. Counted by hand:
HAND = {
    'map_a': {'N': 10, 'n': 5, 'sets': {'nucleus': [4, 4], 'cytosol': [3, 1], 'membrane': [3, 0]}},
    'map_b': {'N': 8, 'n': 5, 'sets': {'nuclear': [3, 3], 'cyto': [5, 2]}},
    'regions_a': {'N': 10, 'n': 5, 'sets': {'inside': [4, 4], 'outside': [6, 1]}},
}


def _build(tmp_path, view=None):
    root = _toy(tmp_path)
    path = root / 'sites' / 'toy.yaml'
    if view:
        site = yaml.safe_load(path.read_text())
        site['website']['cell']['default_view'] = view
        path.write_text(yaml.safe_dump(site, sort_keys=False, allow_unicode=True))
    assert S.website_problems(S.load_site(path)) == []
    S.run(path, root=root / 'data', log=lambda *_: None)
    index = web.build(path, log=lambda *_: None)
    return json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )


def test_the_counts_are_made_at_build_time_and_equal_a_hand_count(tmp_path):
    data = _build(tmp_path)
    assert data['cell_pct'] == HAND
    assert data['cell_proteome'] == {'N': 12, 'n': 5}  # 5 of the toy's 12 reviewed proteins carry a mark


def test_a_site_file_may_only_name_the_two_views(tmp_path):
    root = _toy(tmp_path)
    path = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(path.read_text())
    site['website']['cell']['default_view'] = 'share'
    path.write_text(yaml.safe_dump(site, sort_keys=False, allow_unicode=True))
    with pytest.raises(Exception, match='default_view'):
        S.load_site(path)


def _run(tmp_path, data, selected, min_group=2, patch=''):
    tmp_path.mkdir(parents=True, exist_ok=True)
    dfile = tmp_path / 'd.json'
    dfile.write_text(json.dumps(data))
    sel = json.dumps(selected)
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop; global.requestAnimationFrame = f => 0; global.matchMedia = () => ({{ matches: false }});
const el0 = () => ({{ style: {{}}, setAttribute: noop, appendChild: noop, remove: noop, querySelectorAll: () => [], dataset: {{}} }});
global.document = {{ createElement: el0, head: {{ appendChild: noop }}, body: {{ appendChild: noop }}, addEventListener: noop, getElementById: () => null, querySelectorAll: () => [] }};
const D = JSON.parse(require('fs').readFileSync({json.dumps(str(dfile))}, 'utf8')), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const NL = String.fromCharCode(10), TAB = String.fromCharCode(9);
const [head, ...lines] = D.statistics_tsv.trim().split(NL), col = Object.fromEntries(head.split(TAB).map((c, k) => [c, k]));
const num = v => (v === '' || v === 'nan' ? null : v === 'inf' ? 1e300 : Number(v));
D.rows = lines.map(l => {{ const x = l.split(TAB), g = c => x[col[c]];
  return {{ analysis: g('analysis'), category: g('category'), method: g('method'), a: +g('a'), b: +g('b'), c: +g('c'), d: +g('d'), or: num(g('odds_ratio')), fold: num(g('fold_enrichment')),
    lo: num(g('odds_ratio_ci_low')), hi: num(g('odds_ratio_ci_high')), p: num(g('p')), q: num(g('q')), strata: g('n_strata') ? +g('n_strata') : null }}; }});
const P = (a, b) => Array.from({{ length: b - a + 1 }}, (_, i) => 'P' + (a + i));
{patch}
const sets = {{
  map_a: {{ N: 10, in_background: P(1, 5), sets: [['nucleus', 4, P(1, 4)], ['cytosol', 3, ['P5']], ['membrane', 3, []]] }},
  map_b: {{ N: 8, in_background: P(1, 5), sets: [['nuclear', 3, P(1, 3)], ['cyto', 5, ['P4', 'P5']]] }},
}};
const sel = {sel};
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}} }}, esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), int: n => String(n), cap: s => s[0].toUpperCase() + s.slice(1),
  READ: {{ min_maps: 2, min_group: {min_group} }},
  fx: x => x.toFixed(2) + '×', fxn: x => x.toFixed(2), fq: q => q.toExponential(1), PADJ: 0.05, MIN_EFFECT: 1.1, LESS: 1 / 1.1, MIN: {{}}, link: (...a) => '#' + a.join('/'), render: noop, writeHash: noop,
  selOn: () => sel.length > 0, vsOn: () => false, questions: {{}}, methods: [], clicks: [], tips: [], afterRender: [], expBar: () => '', figureFrame: noop, preamble: () => '', exportFigure: noop, tw: s => 6 * s.length, wrap: s => [s], fit: s => s, detailsLink: () => '',
  sel: {{ data: () => ({{ protein_sets: sets }}), testable: () => true, setHas: () => false, compute: () => ({{ proteins: new Set(sel) }}), namesProteins: () => false,
    ownSets: () => ({{ all: false, sets: new Set() }}), MIN: {{ proteins: 1, marks: 1 }} }} }};
eval(require('fs').readFileSync({json.dumps(str(STATS))}, 'utf8'));
eval(require('fs').readFileSync({json.dumps(str(ASSETS / 'kit-cell.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const by = Object.fromEntries(K.cell.percent().map(p => [p.part, p]));
const fold = Object.fromEntries(K.cell.parts().map(p => [p.part, p.value]));
console.log(JSON.stringify({{ by, fold, answer: K.cell.answer(undefined, 'percent'), range: K.cell.percentRange(), z: K.cell.zRange() }}));"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-800:]
    return json.loads(run.stdout)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_each_part_shows_the_median_share_of_its_proteins_with_a_mark(tmp_path):
    out = _run(tmp_path, _build(tmp_path / 'b', 'percent'), [])
    by = out['by']
    assert by['nucleoplasm']['share'] == 1 and by['nucleoplasm']['value'] == '100% · 4 proteins'  # 4/4 and 3/3
    assert by['pm']['share'] == 0 and by['pm']['value'] == '0% · 3 proteins'  # one map: 0 of 3
    assert by['cytosol']['share'] == pytest.approx((1 / 3 + 2 / 5) / 2)  # the median of two maps
    assert by['cytosol']['value'] == '37% · 4 proteins' and by['cytosol']['maps'] == 2
    assert [by[k]['tone'] for k in ('nucleoplasm', 'cytosol', 'pm')] == ['p4', 'p1', 'p0']  # fifths of 100%
    assert out['answer'] == (
        'Fewer than half of the compartments have methylarginines on more than half their proteins; '
        'nucleus (100%) and cytosol (37%) the most, membrane (0%) the least.'
    )


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_with_a_selection_a_part_shows_the_share_of_its_proteins_that_are_in_it(tmp_path):
    # P1, P2 and P5 are selected: map A has 2 of 4 in the nucleus and 1 of 3 in the cytosol; map B 2 of 3 and 1 of 5
    out = _run(tmp_path, _build(tmp_path / 'b', 'percent'), ['P1', 'P2', 'P5'])
    by = out['by']
    assert by['nucleoplasm']['share'] == pytest.approx((2 / 4 + 2 / 3) / 2)
    assert by['cytosol']['share'] == pytest.approx((1 / 3 + 1 / 5) / 2)
    assert by['pm']['share'] == 0
    assert by['nucleoplasm']['whole'] == 1  # the whole site's share, kept for the hover
    assert by['nucleoplasm']['value'] == '58% in selection'
    assert by['nucleoplasm']['tone'] == 'p4' and by['pm']['tone'] == 'p0'  # fifths of the largest share


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_fold_view_is_kept_and_says_how_many_proteins_carry_a_mark_where_it_has_too_few(tmp_path):
    out = _run(tmp_path, _build(tmp_path / 'b'), [], min_group=20)
    # fewer than 20 unmarked proteins in the part: the coverage beside, the median of the two maps (1 of 3, 2 of 5)
    assert out['fold']['cytosol'] == 'too few without one to compare (37% carry one)'


HIGH = {
    'map_a': {'N': 100, 'n': 96, 'sets': {'nucleus': [40, 38], 'cytosol': [30, 29], 'membrane': [30, 29]}},
    'map_b': {'N': 80, 'n': 77, 'sets': {'nuclear': [30, 29], 'cyto': [50, 48]}},
}


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_where_nearly_every_protein_has_a_mark_the_ramp_is_fitted_to_the_data_and_the_sentence_says_so(tmp_path):
    out = _run(tmp_path, _build(tmp_path / 'b'), [], patch=f'D.cell_pct = {json.dumps(HIGH)};')
    # the overall share is 96%: the ramp runs from the lowest share (38 of 40 = 95%) to 100%
    assert out['range'] == {'lo': 0.95, 'hi': 1}
    assert out['by']['nucleoplasm']['tone'] == 'p0'  # 95% and 97% of 40 and 30: the lowest step
    assert out['answer'] == (
        'Nearly every mapped protein carries a methylarginine (96%); nucleus (96%) and cytosol (96%) the fewest.'
    )


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_range_option_overrides_the_default_and_a_low_share_keeps_the_full_range(tmp_path):
    assert _run(tmp_path / 'a', _build(tmp_path / 'b'), [])['range'] == {'lo': 0, 'hi': 1}  # 50% overall
    out = _run(
        tmp_path / 'c', _build(tmp_path / 'd'), [], patch=f"D.cell_pct = {json.dumps(HIGH)}; D.cell.range = 'full';"
    )
    assert out['range'] == {'lo': 0, 'hi': 1}


Z = {
    'map_a': {'N': 1000, 'n': 440, 'sets': {'nucleus': [100, 80], 'cytosol': [200, 90], 'membrane': [100, 30]}},
    'map_b': {'N': 500, 'n': 220, 'sets': {'nuclear': [50, 40], 'cyto': [100, 45]}},
}


def _z(k, n, p_all):
    return (k / n - p_all) / math.sqrt(p_all * (1 - p_all) / n)


def _median(xs):
    xs = sorted(xs)
    h = len(xs) // 2
    return xs[h] if len(xs) % 2 else (xs[h - 1] + xs[h]) / 2


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_z_view_gives_each_part_the_binomial_z_of_its_share_with_a_bh_q_across_the_parts(tmp_path):
    out = _run(tmp_path, _build(tmp_path / 'b', 'zscore'), [], patch=f'D.cell_pct = {json.dumps(Z)};')
    by = out['by']
    # hand computation: z = (p - p_all) / sqrt(p_all (1 - p_all) / n) in each map, the median over the maps of the part
    z = {
        'nucleoplasm': _median([_z(80, 100, 0.44), _z(40, 50, 0.44)]),
        'cytosol': _median([_z(90, 200, 0.44), _z(45, 100, 0.44)]),
        'pm': _z(30, 100, 0.44),  # one map
    }
    for part, v in z.items():
        assert by[part]['z'] == pytest.approx(v)
    assert by['nucleoplasm']['value'] == 'z +6.2' and by['pm']['value'] == 'z −2.8'
    # two-sided normal p, then Benjamini-Hochberg across the three parts
    p = {k: math.erfc(abs(v) / math.sqrt(2)) for k, v in z.items()}
    order = sorted(p, key=p.get)
    q, floor = {}, 1.0
    for rank in range(len(order), 0, -1):
        k = order[rank - 1]
        floor = min(floor, p[k] * len(order) / rank)
        q[k] = floor
    for part in z:
        assert by[part]['q'] == pytest.approx(q[part], rel=1e-6)
    # colored only where q <= 0.05 and |z| >= 2: quarters of |z| = 10 on the diverging ramp, gray otherwise
    assert [by[k]['tone'] for k in ('nucleoplasm', 'cytosol', 'pm')] == ['m2', 'ns', 'f1']
    assert out['answer'] == (
        '44% of mapped proteins carry a methylarginine; nucleus (z +6.2) stands out most above that, '
        'membrane (z −2.8) most below.'
    )


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_with_a_selection_the_z_compares_the_selection_in_a_part_with_its_overall_share(tmp_path):
    # P1, P2 and P5 are selected: of the 5 marked proteins map A places, 3 are in the selection (the share among all: 3/10)
    out = _run(tmp_path, _build(tmp_path / 'b', 'zscore'), ['P1', 'P2', 'P5'])
    by = out['by']
    # map A's nucleus: 2 of its 4 proteins are in the selection; the selection is 3 of the map's 10 placed proteins
    za = _z(2, 4, 3 / 10)
    zb = _z(2, 3, 3 / 8)  # map B's nuclear set: 2 of 3; 3 of the map's 8 placed proteins
    assert by['nucleoplasm']['z'] == pytest.approx((za + zb) / 2)
