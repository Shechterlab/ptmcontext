import json
import re
import tomllib
from pathlib import Path

import pytest

import ptmcontext
from ptmcontext import citation as C
from ptmcontext import web
from ptmcontext.site import load_site

REPO = Path(__file__).resolve().parents[1]
SITES = sorted((REPO / 'sites').glob('*.yaml'))


def test_one_version_everywhere():
    py = tomllib.loads((REPO / 'pyproject.toml').read_text())['project']['version']
    assert py == ptmcontext.__version__ == C.kit_citation()['version']


@pytest.mark.parametrize('path', [p for p in SITES if 'citation' in load_site(p)], ids=lambda p: p.stem)
def test_site_citations_read_and_cite_by_doi(path):
    cit = C.site_citation(load_site(path))
    assert cit['version'] and cit['title']
    for ref in ([cit['preferred']] if cit['preferred'] else []) + cit['references']:
        assert ref['text'].endswith('.') and re.fullmatch(r'10\.\d{4,9}/\S+', ref['doi']), ref


def test_reference_format():
    ref = {'authors': [{'family-names': 'Blum', 'given-names': 'M'}, {'name': 'et al.'}], 'title': 'InterPro in 2025',
           'journal': 'Nucleic Acids Res', 'volume': 53, 'start': 'D444', 'end': 'D456', 'year': 2025}
    assert C.format_reference(ref) == 'Blum M et al. InterPro in 2025. Nucleic Acids Res 53:D444–D456 (2025).'
    assert C.short_reference(ref) == 'Blum et al. 2025'


def test_white_on_band_contrast():
    # the default band and the graphite band both carry white text at WCAG AA
    assert web.contrast('#ffffff', '#155e75') >= 4.5 and web.contrast('#ffffff', '#334155') >= 4.5


def test_web_build_from_a_synthetic_run(tmp_path):
    site = load_site(REPO / 'sites' / 'yeast_phospho.yaml')
    folder = tmp_path / site['outputs']['folder']
    folder.mkdir(parents=True)
    header = ('analysis\tcategory\tstratum\ta\tb\tc\td\todds_ratio\tlog2_odds_ratio\tfold_enrichment\tlog2_fold_enrichment\tp\tq\tmethod\t'
              'background\tn_strata\todds_ratio_ci_low\todds_ratio_ci_high')
    rows = ['disorder\tdisordered\tall\t30\t10\t100\t200\t4.05\t2.02\t\t\t1e-10\t2e-10\tmantel_haenszel\tother residues\t25\t3.8\t4.3',
            'disorder\tordered\tall\t10\t30\t200\t100\t0.14\t-2.84\t\t\t1e-9\t2e-9\tmantel_haenszel\tother residues\t24\t0.12\t0.15']
    (folder / 'statistics.tsv').write_text('\n'.join([header, *rows]) + '\n')
    (folder / 'run.json').write_text(json.dumps({
        'written': '2026-11-01T00:00:00+00:00', 'code_commit': 'abc', 'marks': {'counted': 40, 'proteins': 5, 'rows': 40, 'selected': 40,
        'not_on_snapshot': 0, 'residue_mismatch': 0}, 'snapshot': {'release': 'UniProt 2026_03', 'fasta_md5': '0' * 32, 'entries': 1},
        'inputs': {'uniprot_fasta': {'file': 'x.fasta', 'md5': '0' * 32}}, 'roles': {}}))
    index = web.build(REPO / 'sites' / 'yeast_phospho.yaml', out_root=tmp_path, log=lambda *_: None)
    page = index.read_text()
    assert 'Yeast Phosphosite Explorer' in page and 'assets/kit.js' in page
    data = json.loads(re.search(r'<script id="site-data" type="application/json">(.*?)</script>', page, re.S).group(1))
    assert data['citation']['version'] == C.site_citation(site)['version']
    # the rows travel once, as the statistics table's text, which the page reads its rows from
    assert 'rows' not in data and [x.split('\t')[1] for x in data['statistics_tsv'].splitlines()[1:]] == ['disordered', 'ordered']
    assert data['partners'] == {'species': 4932}            # the partners card asks STRING for budding yeast
    one_file = (index.parent / 'yeast_phospho.html').read_text()
    assert 'src="assets/kit.js"' not in one_file and 'function figure(' in one_file


def test_page_holds_still_while_script_fills_it():
    """The page keeps room for what script fills in later, and a control's handler is scoped to its own card."""
    wd = REPO / 'ptmcontext' / 'web'
    tpl, css = (wd / 'template.html').read_text(), (wd / 'assets' / 'kit.css').read_text()
    # the narrow header is chosen before first paint, by the same rule as the router (the Overview alone is wide)
    assert "classList.add('slim')" in tpl.split('<script id="site-data"')[0]
    for rule in ('#view {', '.hero-stats {', '.tabs {', '.scope {', '.fn {'):
        assert re.search(r'^' + re.escape(rule) + r'[^}]*min-height', css, re.M), rule
    # the protein site card and the count cards both use data-cexp: the site card's handler must not take the others
    assert "'#site-card [data-cexp]'" in (wd / 'assets' / 'kit-proteins.js').read_text()
