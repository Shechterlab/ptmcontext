"""A yes/no attribute reads as a plain term (CONTRACTS.md, "Yes/no attributes"): its label is the chip and its query word
(`query`, else its name) the search text, with no value; key:true of older links is still read, never shown. A toy site
with a true/false protein attribute and a yes/no mark attribute checks the data the page gets and the selection module
(kit-select.js, run in Node)."""

from __future__ import annotations

import json
import shutil
import subprocess

import pandas as pd
import pytest
import yaml

from ptmcontext import site as S
from test_search import ASSETS, _build, _page_data, _toy


def _flagged(tmp_path):
    root = _toy(tmp_path)
    data = root / 'data'
    pt = pd.read_csv(data / 'proteins.tsv', sep='\t', dtype=str, keep_default_na=False)
    pt['ok'] = ['true', 'false']
    pt.to_csv(data / 'proteins.tsv', sep='\t', index=False)
    mk = pd.read_csv(data / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    mk['rev'] = ['Yes', '', 'Yes', '', 'Yes', '']
    mk.to_csv(data / 'marks.tsv', sep='\t', index=False)
    mf = json.loads((root / 'sites' / 'toy.inputs.json').read_text())
    from ptmcontext.snapshot import md5_file

    for n in ('proteins', 'marks'):
        key = 'toy_proteins' if n == 'proteins' else 'toy_marks'
        mf['inputs'][key]['md5'] = md5_file(data / f'{n}.tsv')
    (root / 'sites' / 'toy.inputs.json').write_text(json.dumps(mf))
    cfg = yaml.safe_load((root / 'sites' / 'toy.yaml').read_text())
    cfg['proteins']['attributes']['ok'] = {
        'column': 'ok',
        'label': 'Thing protein',
        'kind': 'category',
        'query': 'thing',
    }
    cfg['marks']['attributes']['rev'] = {'column': 'rev', 'label': 'Reviewed site', 'kind': 'category', 'filter': True}
    (root / 'sites' / 'toy.yaml').write_text(yaml.safe_dump(cfg, sort_keys=False))
    assert S.website_problems(S.load_site(root / 'sites' / 'toy.yaml')) == []
    return root


def test_a_yes_no_attribute_gets_its_flag_and_query_word_from_its_data(tmp_path):
    index = _build(_flagged(tmp_path))
    data = _page_data(index)
    ok = data['protein_attributes']['specs']['ok']
    assert ok['flag'] == 'true' and ok['query'] == 'thing'  # the spec's own query word
    rev = data['attribute_specs']['rev']
    assert rev['flag'] == 'Yes' and rev['query'] == 'rev'  # no query word: the attribute's name
    assert 'flag' not in data['protein_attributes']['specs']['go']  # a category with other values is no flag
    assert 'flag' not in data['attribute_specs']['kind']


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_flag_reads_as_a_plain_term_and_the_old_form_is_still_read(tmp_path):
    index = _build(_flagged(tmp_path))
    data = _page_data(index)
    if data.get('late'):
        data['protein_attributes']['values'].update(
            json.loads((index.parent / data['late']['file']).read_text())['protein_attributes']
        )
    sel = (index.parent / 'data' / 'selection.json').read_text()
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop; global.innerWidth = 1400; global.requestAnimationFrame = f => 0;
global.localStorage = {{ getItem: () => null, setItem: noop }}; global.CSS = {{ escape: s => s }};
const inline = {{ 'selection-data': {json.dumps(sel)} }};
global.document = {{ getElementById: id => (inline[id] ? {{ textContent: inline[id] }} : null), addEventListener: noop, querySelector: () => null,
  querySelectorAll: () => [], documentElement: {{ style: {{ setProperty: noop }} }}, body: {{ classList: {{ toggle: noop, contains: () => false }} }} }};
const fs = require('fs');
for (const f of ['kit-select.js', 'kit-rail.js']) eval(fs.readFileSync({json.dumps(str(ASSETS))} + '/' + f, 'utf8'));
const D = {json.dumps(data)}, esc = s => String(s ?? ''), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}}, vs: 'residues' }}, esc, int: n => String(n), cap: t => t, clicks: [], render: noop, writeHash: noop,
  link: v => '#' + v, decorate: r => r, sections: {{}}, views: {{}}, tabs: [] }};
window.PTMC_MODULES.forEach(m => m(K));
(async () => {{
  await K.sel.ready;
  const marks = q => K.sel.select(q, {{}}).marks.map(i => {{ const m = K.sel.data().marks[i]; return D.proteins[m[0]][0] + ':' + m[1]; }}).sort();
  const out = {{ plain: marks('thing'), old: marks('ok:true'), older: marks('thing:true'), name: marks('ok:false'), mark: marks('rev'), markOld: marks('rev:Yes') }};
  K.S.q = 'thing rev';
  out.cons = K.sel.compute().cons.map(c => [c[0], c[1], c[2], c[3]]);
  out.phrases = [K.sel.flagPhrase('r:ok', ['true']), K.sel.flagPhrase('r:ok', ['false']), K.sel.flagPhrase('t:rev', ['Yes']), K.sel.flagPhrase('r:go', ['none'])];
  out.bar = K.sel.bar(); out.summary = K.sel.summary();
  K.S.f = {{ 'r:ok': ['false'] }}; out.barF = K.sel.bar();
  K.sel.dropTerm('thing'); out.afterDrop = K.S.q;
  out.canon = K.sel.canonQ('ONE ok:true thing:true rev:Yes ok:false go:none');
  out.known = [K.sel.isTermKey('thing'), K.sel.isTermKey('ok'), K.sel.isTermKey('nothing')];
  console.log(JSON.stringify(out));
}})();"""
    out = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
    p1 = ['P1:2', 'P1:32', 'P1:5']
    assert out['plain'] == p1 and out['old'] == p1 and out['older'] == p1  # the plain word, key:true and the word:true
    assert out['name'] == ['P2:2', 'P2:25', 'P2:29']  # ok:false is still read
    assert out['mark'] == out['markOld'] and out['mark']  # a mark attribute the same way
    # the chips' text: the term as typed (no value) and the filter in words (the label)
    assert [c[3] for c in out['cons']] == ['thing', 'rev']
    assert out['phrases'] == ['Thing protein', 'Not Thing protein', 'Reviewed site', None]
    assert out['afterDrop'] == 'rev'  # the chip's × removes the bare word
    # the selection line: a chip with the label alone, no value; a filter on the no value reads "Not ..."
    assert 'Thing protein' in out['bar'] and 'Reviewed site' in out['bar'] and 'true' not in out['bar'].lower()
    assert 'Yes' not in out['bar'] and 'sel-val' not in out['bar'] and 'Not Thing protein' in out['barF']
    assert 'true' not in out['summary'].lower() and 'Thing protein' in out['summary']
    assert out['canon'] == 'ONE thing thing rev ok:false go:none'  # an old link's key:true is shown as the word
    assert out['known'] == [True, True, False]
