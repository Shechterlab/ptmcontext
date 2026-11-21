"""What a typed search, gene list or chosen site is read as (kit-select.js, run in Node on a toy site): the residue typed
with a position is checked against the sequence (in the protein's own numbering), a word that is a name is not a site,
commas separate names, and an isoform id says it is read as its canonical entry."""

from __future__ import annotations

import json
import shutil
import subprocess

import pytest
from sel_parts import selection_text
from test_search import _build, _page_data, _toy


from test_search import ASSETS, P1, P2, P3  # noqa: E402


def _run(tmp_path, body):
    root = _toy(tmp_path)
    index = _build(root)
    data = _page_data(index)
    if data.get('late'):
        data['protein_attributes']['values'].update(
            json.loads((index.parent / data['late']['file']).read_text())['protein_attributes']
        )
    # a name that looks like a site (P7 for TWO), as P53 is an alias of TP53
    data['protein_aliases']['P2'] = 'P7'
    script = f"""
const noop = () => {{}};
global.window = global; global.addEventListener = noop; global.innerWidth = 1400; global.requestAnimationFrame = f => 0;
global.localStorage = {{ getItem: () => null, setItem: noop }}; global.CSS = {{ escape: s => s }};
const inline = {{ 'selection-data': {json.dumps(selection_text(index.parent))} }};
global.document = {{ getElementById: id => (inline[id] ? {{ textContent: inline[id] }} : null), addEventListener: noop, querySelector: () => null,
  querySelectorAll: () => [], documentElement: {{ style: {{ setProperty: noop }} }}, body: {{ classList: {{ toggle: noop, contains: () => false }} }} }};
const fs = require('fs');
for (const f of ['kit-seldata.js', 'kit-select.js', 'kit-near.js']) eval(fs.readFileSync({json.dumps(str(ASSETS))} + '/' + f, 'utf8'));
const D = {json.dumps(data)}, esc = s => String(s ?? ''), A = Object.fromEntries(D.analyses.map(a => [a.id, a]));
const SEQS = {json.dumps({'P1': P1, 'P2': P2, 'P3': P3})};
const K = {{ D, W: D.words, A, S: {{ q: '', f: {{}}, vs: 'residues' }}, esc, int: n => String(n), cap: t => t, clicks: [], render: noop, writeHash: noop,
  link: v => '#' + v, decorate: r => r, sections: {{}}, views: {{}}, tabs: [], loadProtein: acc => Promise.resolve({{ seq: SEQS[acc] }}) }};
window.PTMC_MODULES.forEach(m => m(K));
const names = ids => ids.map(i => D.proteins[i][0]);
(async () => {{
  await K.sel.ready;
  const out = {{}};
  {body}
  console.log(JSON.stringify(out));
}})();"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr[-1500:]
    return json.loads(run.stdout)


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_residue_typed_is_checked_in_the_proteins_own_numbering(tmp_path):
    out = _run(
        tmp_path,
        """
    for (const q of ['ONE R5', 'ONE K5', 'ONE R4', 'TWO R1', 'TWO K1', 'ONE R999', 'ONE 5', 'ONE:K5', 'ONE_K5', 'ONE K5 ONE R32'])
      { const p = K.sel.parse(q); out[q] = { sites: p.sites.map(x => x.slice(0, 2)), rejected: p.rejected }; }
    // the sequence decides where no mark is: position 3 is G
    const p1 = K.sel.byAcc.P1;
    await K.sel.seqReady(p1);
    out.seq = { g3: K.sel.siteProblem(p1, 3, 'R'), g3ok: K.sel.siteProblem(p1, 3, 'G'), end: K.sel.siteProblem(p1, 44, 'R') };
    out.chosen_select = K.sel.select('ONE K5', {}).marks;
""",
    )
    assert out['ONE R5']['sites'] == [[0, 5]] and out['ONE R5']['rejected'] == []
    assert out['ONE K5']['sites'] == [] and out['ONE K5']['rejected'] == ['ONE position 5 is R, not K.']
    assert out['ONE R4']['rejected'] == []  # G at 4: no mark there, the sequence is not in yet
    # histone-style numbering (TWO is shown without its first residue): R1 is UniProt 2
    assert out['TWO R1']['sites'] == [[1, 2]] and out['TWO R1']['rejected'] == []
    assert out['TWO K1']['sites'] == [] and 'TWO position 1 is R, not K' in out['TWO K1']['rejected'][0]
    assert 'has no position 999' in out['ONE R999']['rejected'][0] and out['ONE R999']['sites'] == []
    assert out['ONE 5']['rejected'] == []  # no residue typed: nothing to check
    assert out['ONE:K5']['rejected'] and out['ONE_K5']['rejected']
    assert out['ONE K5 ONE R32']['sites'] == [[0, 32]] and len(out['ONE K5 ONE R32']['rejected']) == 1
    assert out['seq']['g3'].startswith('ONE position 3 is G, not R.') and out['seq']['g3ok'] is None
    assert 'ends at 43' in out['seq']['end']
    assert out['chosen_select'] == []  # a rejected site selects nothing


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_an_off_by_one_numbering_is_suggested(tmp_path):
    out = _run(
        tmp_path,
        """
    const p1 = K.sel.byAcc.P1;
    await K.sel.seqReady(p1);
    out.msg = K.sel.siteProblem(p1, 4, 'R');   // G at 4; R at 5
""",
    )
    assert out['msg'] == 'ONE position 4 is G, not R. R5 matches; the numbering may differ by one.'


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_word_that_is_a_name_is_not_a_site_and_commas_separate_names(tmp_path):
    out = _run(
        tmp_path,
        """
    for (const q of ['ONE P7', 'ONE R5 P7', 'ONE,TWO', 'ONE; TWO', 'ONE R5, TWO R1', 'ONE,TWO,ONE', 'ONE R5,R32', 'P1-2', 'p1-2 TWO', 'ONE,FOOBAR'])
      { const p = K.sel.parse(q); out[q] = { genes: names(p.genes), sites: p.sites.map(x => D.proteins[x[0]][0] + ':' + x[1]), missing: p.missing,
        rejected: p.rejected, absent: p.absent, dups: p.dups, isoforms: p.isoforms, notes: K.sel.notesOf(p) }; }
""",
    )
    # P7 names TWO: a gene, not a site of ONE
    assert out['ONE P7']['genes'] == ['P1', 'P2'] and out['ONE P7']['sites'] == [] and out['ONE P7']['missing'] == []
    assert out['ONE R5 P7']['genes'] == ['P2'] and out['ONE R5 P7']['sites'] == ['P1:5']
    assert out['ONE,TWO']['genes'] == ['P1', 'P2'] and out['ONE; TWO']['genes'] == ['P1', 'P2']
    assert out['ONE R5, TWO R1']['sites'] == ['P1:5', 'P2:2']
    assert out['ONE R5,R32']['sites'] == ['P1:5', 'P1:32']
    assert out['ONE,TWO,ONE']['genes'] == ['P1', 'P2', 'P1'] and out['ONE,TWO,ONE']['dups'] == ['ONE']
    assert out['ONE,FOOBAR']['absent'] == ['FOOBAR']
    for q in ('P1-2', 'p1-2 TWO'):
        assert out[q]['isoforms'][0][1] == 'P1' and out[q]['genes'][0] == 'P1'
    assert out['P1-2']['notes'] == ['Using the canonical isoform P1; positions refer to it.']


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_a_key_value_term_keeps_its_commas_and_old_chosen_site_links_still_read(tmp_path):
    out = _run(
        tmp_path,
        """
    out.term = K.sel.parse('ONE binding:yes,no').terms;
    for (const x of ['P1:5', 'P1:R5', 'P1:5:R', 'ONE:R5', 'TWO:R1', 'TWO:1', 'p1:5', 'nonsense:5', 'P1:', '5'])
      out[x] = K.sel.siteKey(x);
    out.near = { short: Object.keys(K.sel.parse('ONNE').typos), end: Object.keys(K.sel.parse('ONEE').typos) };
""",
    )
    assert out['term'] == [['binding', 'yes,no']]
    assert out['P1:5'] == {'key': 'P1:5', 'res': ''}
    assert out['P1:R5'] == out['P1:5:R'] == {'key': 'P1:5', 'res': 'R'}
    assert out['ONE:R5'] == {'key': 'P1:5', 'res': 'R'}  # the gene form, as the page numbers it
    assert out['TWO:R1'] == {'key': 'P2:2', 'res': 'R'} and out['TWO:1']['key'] == 'P2:2'
    assert out['p1:5']['key'] == 'P1:5'
    assert out['nonsense:5'] is None and out['P1:'] is None and out['5'] is None
    # a short word gains a letter only at its end: ONNE is not read as ONE, ONEE is
    assert out['near']['short'] == [] and out['near']['end'] == ['ONEE']


@pytest.mark.skipif(not shutil.which('node'), reason='needs Node')
def test_the_landing_finder_searches_the_first_of_several_names_and_says_so():
    script = r"""
const fs = require('fs'); global.window = global;
const els = {}; const mk = id => (els[id] = { id, value: '', innerHTML: '', textContent: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, querySelector: () => null, querySelectorAll: () => [] });
global.document = { getElementById: id => mk(id) };
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ sites: [{ id: 'a', label: 'A' }],
  p: [['P04637', 'TP53', 'Cellular tumor antigen p53', [0], ['TP53'], []], ['P00533', 'EGFR', 'Epidermal growth factor receptor', [0], ['EGFR'], []]] }) });
eval(fs.readFileSync(ASSETS + '/kit-names.js', 'utf8')); eval(fs.readFileSync(ASSETS + '/land-search.js', 'utf8'));
(async () => {
  const out = {};
  for (const q of ['TP53 S15', 'EGFR,TP53', 'TP53', 'FOO BAR']) {
    els['land-q'].value = q; els['land-q'].handlers.focus?.();
    els['land-q'].handlers.input(); await new Promise(r => setTimeout(r, 20));
    out[q] = [els['land-hits'].innerHTML.includes('P04637') ? 'TP53' : els['land-hits'].innerHTML.includes('P00533') ? 'EGFR' : '', els['land-say'].textContent];
  }
  console.log(JSON.stringify(out));
})();"""
    run = subprocess.run(
        ['node', '-e', f'const ASSETS = {json.dumps(str(ASSETS))};' + script], capture_output=True, text=True
    )
    assert run.returncode == 0, run.stderr[-1500:]
    out = json.loads(run.stdout)
    assert out['TP53 S15'][0] == 'TP53' and 'first name only, TP53' in out['TP53 S15'][1]
    assert out['EGFR,TP53'][0] == 'EGFR' and 'first name only, EGFR' in out['EGFR,TP53'][1]
    assert out['TP53'][0] == 'TP53' and 'first name' not in out['TP53'][1]
    assert out['FOO BAR'][0] == '' and out['FOO BAR'][1].endswith('No protein with that name or accession in these sites.')
