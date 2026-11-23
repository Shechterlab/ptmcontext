"""The Compare marks page of `ptmc pages` (compare.py): each explorer's own statistics row for a paired class, side by side.
The values in compare.json equal the rows of the sites' own statistics tables (the fold is the explorers' own reading of a
row; nothing is recomputed or pooled), a class an explorer does not test is null (not 0), and the page, its link on the
landing page and in sites.json, and its data come from the landing config's `compare` block with no site named in the code."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd
import yaml

from ptmcontext import site as S
from ptmcontext import web
from ptmcontext.web import compare as CP

from test_help import _toy


def _built(tmp_path, ids=('toya', 'toyb')):
    sites = []
    for sid in ids:
        root, p = _toy(tmp_path, sid)
        S.run(p, root=root / 'data', log=lambda *_: None)
        web.build(p, log=lambda *_: None)
        sites.append(p)
    return root, sites


def _cfg(tmp_path, classes, **extra):
    cfg = {
        'title': 'Toy hub',
        'order': ['toya', 'toyb'],
        'compare': {
            'title': 'Compare toys',
            'lede': 'The same questions, asked of each toy.',
            'intro': 'Pick the toys.',
            'statement': 'This page only places each explorer’s published numbers side by side.',
            'columns': {'toya': 'Toy A', 'toyb': 'Toy B'},
            'how': ['Each row is a class.'],
            'groups': [
                {
                    'id': 'seq',
                    'title': 'Sequence',
                    'questions': [{'id': 'motif', 'analysis': 'motif', 'title': 'Motifs', 'classes': classes}],
                }
            ],
            **extra,
        },
    }
    f = tmp_path / 'landing.yml'
    f.write_text(yaml.safe_dump(cfg))
    return f


def _stats(root, sid):
    return pd.read_csv(root / 'out' / sid / 'statistics.tsv', sep='\t', keep_default_na=False)


def test_compare_json_holds_each_sites_own_statistics_rows(tmp_path):
    root, (a, b) = _built(tmp_path)
    st = _stats(root, 'toya')
    mh = st[(st.analysis == 'motif') & (st.method == 'mantel_haenszel')]
    cats = list(mh.category)
    assert cats, 'the toy site tests motif classes'
    cfg = _cfg(
        tmp_path, [{'class': c, 'label': f'Class {c}'} for c in cats] + [{'class': 'no_such_class', 'label': 'Missing'}]
    )
    out = tmp_path / 'site'
    web.pages([a, b], out, out_root=root, log=lambda *_: None, landing_config=cfg)
    data = json.loads((out / 'compare' / 'compare.json').read_text())
    assert [e['id'] for e in data['explorers']] == ['toya', 'toyb'] and data['explorers'][0]['short'] == 'Toy A'
    rows = {r['class']: r for r in data['groups'][0]['questions'][0]['rows']}
    checked = 0
    for sid in ('toya', 'toyb'):
        s = _stats(root, sid)
        s = s[(s.analysis == 'motif') & (s.method == 'mantel_haenszel')].set_index('category')
        for cat in cats:
            cell = rows[cat]['cells'][sid]
            if cat not in s.index:
                assert cell is None
                continue
            r = s.loc[cat]
            if cell['state'] != 'ok':
                continue
            # the fold the explorers show: the share of the marks in the class over the share of the comparison residues in it
            fold = (r.a / (r.a + r.b)) / (r.c / (r.c + r.d)) if r.c > 0 and r.a + r.b > 0 and r.c + r.d > 0 else None
            expect = (
                fold if fold is not None else float(r.odds_ratio)
            )  # without a comparison share, the test's own effect
            assert cell['v'] == (None if expect == float('inf') else expect)
            assert cell['or'] == (None if float(r.odds_ratio) == float('inf') else float(r.odds_ratio))
            assert cell['q'] == float(r.q) and cell['n'] == int(r.a)
            checked += 1
            assert cell['group'] == r.background and cell['test'] == 'within each protein'
    assert checked, 'at least one cell was compared with its statistics row'
    # a class no explorer tests is "not tested" (null), never 0
    assert all(c is None for c in rows['no_such_class']['cells'].values())
    # the same numbers are inline in the page, which says in one line what it does
    page = (out / 'compare' / 'index.html').read_text()
    assert 'id="cmp-data"' in page and 'only places each explorer’s published numbers side by side' in page
    assert '<title>Compare toys: Toy hub</title>' in page and '../toya/assets/kit.css' in page
    assert 'How to read this' in page


def test_the_landing_page_and_the_sites_link_to_the_page(tmp_path):
    root, (a, b) = _built(tmp_path)
    cfg = _cfg(tmp_path, [{'class': 'RGG', 'label': 'RGG'}])
    out = tmp_path / 'site'
    land = web.pages([a, b], out, out_root=root, log=lambda *_: None, landing_config=cfg).read_text()
    assert re.search(r'<p class="land-compare"><a href="compare/">Compare toys</a>', land)
    reg = json.loads((out / 'sites.json').read_text())
    assert reg['pages'] == [{'id': 'compare', 'label': 'Compare toys', 'href': 'compare/'}]


def test_without_a_compare_block_or_with_one_site_there_is_no_page(tmp_path):
    root, (a, b) = _built(tmp_path)
    plain = tmp_path / 'plain.yml'
    plain.write_text(yaml.safe_dump({'title': 'Toy hub', 'order': ['toya', 'toyb']}))
    out = tmp_path / 'site'
    land = web.pages([a, b], out, out_root=root, log=lambda *_: None, landing_config=plain).read_text()
    assert (
        not (out / 'compare').exists()
        and 'land-compare' not in land
        and 'pages' not in json.loads((out / 'sites.json').read_text())
    )
    # one explorer built: nothing to compare, said in the log
    log = []
    cfg = _cfg(tmp_path, [{'class': 'RGG', 'label': 'RGG'}])
    out2 = tmp_path / 'site2'
    web.pages([a], out2, out_root=root, log=log.append, landing_config=cfg)
    assert not (out2 / 'compare').exists() and any('fewer than two explorers' in x for x in log)


def test_a_site_named_but_not_built_is_left_out_with_a_note(tmp_path):
    root, (a, b) = _built(tmp_path)
    c = _cfg(tmp_path, [{'class': 'RGG', 'label': 'RGG'}])
    cfg = yaml.safe_load(c.read_text())
    cfg['compare']['columns']['toyc'] = 'Toy C'
    c.write_text(yaml.safe_dump(cfg))
    log = []
    out = tmp_path / 'site'
    web.pages([a, b], out, out_root=root, log=log.append, landing_config=c)
    data = json.loads((out / 'compare' / 'compare.json').read_text())
    assert data['skipped'] == ['toyc'] and [e['id'] for e in data['explorers']] == ['toya', 'toyb']
    assert any('toyc is not built' in x for x in log)
    assert 'toyc is not built, so it is not in this comparison.' in (out / 'compare' / 'index.html').read_text()


def test_a_cell_is_read_the_way_the_explorers_read_a_row():
    row = lambda **k: {  # noqa: E731
        'a': 10,
        'b': 90,
        'c': 20,
        'd': 880,
        'or': 4.5,
        'fold': None,
        'lo': 2.0,
        'hi': 9.0,
        'p': 1e-5,
        'q': 1e-4,
        'background': 'g',
        **k,
    }
    an = {'kind': 'residue', 'title': 'T', 'labels': {'x': 'Own name'}}
    rows = {('t', 'x'): {'mantel_haenszel': row()}}
    c = CP.cell(rows, an, 't', 'x')
    assert c['v'] == (10 / 100) / (20 / 900) and c['dir'] == 'more' and c['label'] == 'Own name'
    # q above 0.05: no difference; a missing row: None (not tested), a row with no effect: too few
    assert CP.cell({('t', 'x'): {'mantel_haenszel': row(q=0.2)}}, an, 't', 'x')['dir'] == 'ns'
    assert CP.cell(rows, an, 't', 'y') is None
    assert CP.cell({('t', 'x'): {'mantel_haenszel': row(**{'or': None})}}, an, 't', 'x')['state'] == 'few'
    # a protein set shows its fold enrichment; its q and direction are read from the test within abundance deciles
    sets = {'kind': 'protein_sets', 'title': 'S'}
    srows = {
        ('s', 'x'): {
            'enricher': row(**{'or': None, 'fold': 2.0, 'q': 1e-9}),
            'mantel_haenszel': row(**{'or': 0.5, 'q': 0.3}),
        }
    }
    s = CP.cell(srows, sets, 's', 'x')
    assert s['v'] == 2.0 and s['measure'] == 'fold enrichment' and s['q'] == 0.3 and s['dir'] == 'ns' and s['q_test']
    # the fold and the test point different ways at q <= 0.05: no reading, and it says so
    split = {
        ('s', 'x'): {'enricher': row(**{'or': None, 'fold': 1.5}), 'mantel_haenszel': row(**{'or': 0.8, 'q': 0.01})}
    }
    assert CP.cell(split, sets, 's', 'x')['split'] is True


def test_no_site_or_mark_literal_in_the_compare_code():
    src = (Path(web.__file__).parent / 'compare.py').read_text() + (
        Path(web.__file__).parent / 'assets' / 'land-compare.js'
    ).read_text()
    assert not re.search(r'#[0-9a-fA-F]{6}\b', src.split('const INK')[0])  # the page's colors are the kit's
    assert not re.search(r'methyl|arginine|lysine|phospho|yeast|Shechter', src, re.I)
    assert not re.search(r'dtIDR|domain-tethered|domain flanks', src)


def test_the_pages_workflow_uploads_what_the_compare_page_reads():
    """The assemble job has only what each build job uploads; the Compare marks page reads these files of every site."""
    wf = (Path(__file__).resolve().parents[1] / '.github' / 'workflows' / 'pages.yml').read_text()
    for name in ('run.json', 'statistics.tsv', 'set_names.tsv', 'protein_sets.json'):
        assert f'out/${{{{ matrix.site }}}}/{name}' in wf, f'pages.yml does not upload {name}'
