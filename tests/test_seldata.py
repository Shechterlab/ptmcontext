"""The selection data in parts (ptmcontext/web/seldata.py, kit-seldata.js, CONTRACTS.md "Selection data in parts"): the
parts put back together are the whole the one-file copy inlines; a protein's own file says what the whole says of it
(the sets it is in, its covariate, its place in the background); the marks files hold every mark once, proteins in the
Sites page's first order."""

from __future__ import annotations

import json
import re
import shutil
import subprocess

import pytest
from node_harness import ASSETS
from sel_parts import selection_of
from test_overlap import _build


def _inline(index):
    one = next(p for p in index.parent.glob('*.html') if p.name != 'index.html').read_text()
    return json.loads(
        re.search(r'<script id="selection-data" type="application/json">(.*?)</script>', one, re.S).group(1)
    )


def test_the_parts_are_the_whole(tmp_path):
    _, index = _build(tmp_path)
    whole = selection_of(index.parent)
    assert whole == _inline(index)
    d = index.parent / 'data' / 'sel'
    core = json.loads((d / 'core.json').read_text())
    parts = core['parts']
    assert 'marks' not in core and 'protein_sets' not in core and parts['n_marks'] == len(whole['marks'])
    assert not (index.parent / 'data' / 'selection.json').exists()
    # every mark once, in the file of its protein; a protein is never split between files
    seen, home = set(), {}
    for k, f in enumerate(parts['marks']):
        s = json.loads((d / f).read_text())
        assert len(s['ix']) == len(s['rows'])
        for i, r in zip(s['ix'], s['rows']):
            assert i not in seen and r == whole['marks'][i] and home.setdefault(r[0], k) == k
            seen.add(i)
    assert len(seen) == len(whole['marks']) and all(parts['shard_of'][p] == k for p, k in home.items())
    assert all(parts['shard_of'][p] == -1 for p in range(len(parts['shard_of'])) if p not in home)
    # the Sites page's first order: by the name shown, so its first page is in the first file
    names = [(json.loads((d / f).read_text())['rows'][0][0]) for f in parts['marks']]
    assert names == sorted(names, key=lambda p: (str(_name(index, p)).lower(), p))
    # the attribute counts are the marks per value
    for ti, name in enumerate(whole['attribute_names']):
        want = [0] * len(whole['attributes'][name])
        for m in whole['marks']:
            for k in m[3][ti]:
                want[k] += 1
        assert parts['attr_counts'][ti] == want


def _name(index, p):
    data = json.loads(
        re.search(r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S).group(1)
    )
    row = data['proteins'][p]
    return row[1] or row[0]


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_protein_file_says_what_the_whole_says_of_the_protein(tmp_path):
    _, index = _build(tmp_path)
    d = index.parent / 'data' / 'sel'
    (tmp_path / 'd.json').write_text(
        json.dumps(
            json.loads(
                re.search(
                    r'<script id="site-data" type="application/json">(.*?)</script>', index.read_text(), re.S
                ).group(1)
            )
        )
    )
    script = f"""
const fs = require('fs');
global.window = global; const noop = () => {{}};
global.fetch = u => {{ const f = String(u).split('data/sel/')[1]; return Promise.resolve({{ ok: !!f, json: () => Promise.resolve(JSON.parse(fs.readFileSync({json.dumps(str(d))} + '/' + f, 'utf8'))) }}); }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-seldata.js'))}, 'utf8'));
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-select.js'))}, 'utf8'));
const D = JSON.parse(fs.readFileSync({json.dumps(str(tmp_path / 'd.json'))}, 'utf8')), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
let renders = 0;
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}}, vs: 'residues' }}, esc: s => String(s ?? ''), int: n => String(n), cap: t => t, clicks: [], render: () => {{ renders++; }}, writeHash: () => {{}},
  link: v => '#' + v, decorate: r => r, sections: {{}}, views: {{}}, tabs: [] }};
window.PTMC_MODULES.forEach(m => m(K));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {{
  const out = {{ first: K.sel.pdata(0), asked: [] }};
  for (let i = 0; i < 100 && D.proteins.some((_, pi) => !K.sel.pdata(pi)); i++) await sleep(5);
  const view = () => {{
    const r = {{}};
    D.proteins.forEach((_, pi) => {{
      const pd = K.sel.pdata(pi);
      if (!pd) return;
      for (const [aid, ps] of Object.entries(pd.protein_sets)) {{
        const names = ps.sets.map(x => x[0]).filter(s => K.sel.setHas(aid, s, pi));
        r[aid + '/' + pi] = [names, ps.in_background.includes(pi), ps.covariate ? ps.covariate.proteins[pi] ?? null : null];
      }}
    }});
    return r;
  }};
  out.slice = view();
  out.loadedWhole = !!K.sel.peek();
  K.sel.data(); await K.sel.ready;
  out.whole = view();
  out.marksOf = K.seld.marksOf ? 1 : 0;
  console.log(JSON.stringify(out));
}})();
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1200:]
    out = json.loads(run.stdout)
    assert out['first'] is None and not out['loadedWhole']  # the first ask starts the file and says "not yet"
    assert out['slice'] and out['slice'] == out['whole']
    assert any(v[0] for v in out['slice'].values())  # the toy has proteins in sets
