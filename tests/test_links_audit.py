"""The link audit (tools/audit/links.js): it parses, its CI jobs call it (internal on each push, external weekly), and the figure
panels page it found throwing draws before the marks are loaded."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'ptmcontext' / 'web' / 'assets'
node = pytest.mark.skipif(not shutil.which('node'), reason='needs Node')


@node
def test_the_audit_script_parses_and_the_workflows_run_it():
    script = ROOT / 'tools' / 'audit' / 'links.js'
    assert subprocess.run(['node', '--check', str(script)], capture_output=True, check=False).returncode == 0
    tests = (ROOT / '.github' / 'workflows' / 'tests.yml').read_text()
    weekly = (ROOT / '.github' / 'workflows' / 'links.yml').read_text()
    assert 'tools/audit/links.js' in tests and '--external' not in tests
    assert 'cron:' in weekly and '--external' in weekly and 'tools/audit/links.js' in weekly
    assert 'unverified' in weekly and 'unverified' in script.read_text()


@node
def test_the_figure_panels_page_does_not_read_the_marks_before_they_are_loaded():
    script = f"""
const fs = require('fs');
global.window = global; global.document = {{ addEventListener() {{}} }};
let loaded = false, asked = 0;
const K = {{ W: {{ marks: 'sites', mark: 'site' }}, esc: s => String(s), int: n => String(n), folds: {{}}, views: {{}}, loading: t => '<p>' + t + '</p>',
  logoPanel: () => {{ asked++; if (!loaded) throw new TypeError('marks not loaded'); return {{ n: 2, html: () => '' }}; }},
  sel: {{ data: () => (loaded ? {{}} : null), active: () => false }} }};
eval(fs.readFileSync({json.dumps(str(ASSETS / 'kit-figures.js'))}, 'utf8'));
window.PTMC_MODULES.forEach(m => m(K));
const before = K.views.figures.render();
loaded = true;
console.log(JSON.stringify({{ before: before.includes('Loading'), asked, after: K.views.figures.render().includes('Alignment and sequence logo') }}));
"""
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=False)
    assert run.returncode == 0, run.stderr[-600:]
    assert json.loads(run.stdout) == {'before': True, 'asked': 0, 'after': True}


def test_the_figure_panels_use_the_whole_dataset_when_nothing_is_selected():
    assert 'no selection: the whole dataset' in (ASSETS / 'kit-conserve.js').read_text()


@node
def test_the_content_audit_parses_and_is_not_a_ci_job():
    script = ROOT / 'tools' / 'audit' / 'content.js'
    assert subprocess.run(['node', '--check', str(script)], capture_output=True, check=False).returncode == 0
    for wf in (ROOT / '.github' / 'workflows').glob('*.yml'):
        assert 'audit/content.js' not in wf.read_text(), wf.name  # optional: run by hand


@node
def test_the_site_audit_parses_has_time_limits_and_checks_external_links_apart(tmp_path):
    audit = ROOT / 'tools' / 'audit'
    for name in ('all.js', 'external.js', 'links.js'):
        assert subprocess.run(['node', '--check', str(audit / name)], capture_output=True, check=False).returncode == 0
    src = (audit / 'links.js').read_text()
    for flag in ('--concurrency', '--page-seconds', '--budget', '--simple'):
        assert flag in src
    assert "opt('budget') || 12" in src and "opt('page-seconds') || 60" in src
    script = f"""
const http = require('http');
const {{ checkExternal, isBotHost }} = require({json.dumps(str(audit / 'external.js'))});
const hits = [];
const srv = http.createServer((q, r) => {{
  hits.push(q.method + ' ' + q.url);
  if (q.url === '/ok') return r.end('x');
  if (q.url === '/nohead') {{ r.statusCode = q.method === 'HEAD' ? 405 : 200; return r.end('x'); }}
  if (q.url === '/slow') return;
  r.statusCode = 404; r.end('no');
}});
srv.listen(0, '127.0.0.1', async () => {{
  const b = 'http://127.0.0.1:' + srv.address().port;
  const m = new Map(['/ok', '/nohead', '/gone'].map((p) => [b + p, {{ where: 'p', text: p }}]));
  const cache = {json.dumps(str(tmp_path / 'c.json'))};
  const a = await checkExternal(m, {{ cache }});
  const n = hits.length;
  const c = await checkExternal(m, {{ cache }});
  console.log(JSON.stringify({{ ok: a.ok, broken: a.broken.map((x) => x.status), cached: c.cached, again: hits.length - n,
    bot: [isBotHost('www.nature.com'), isBotHost('example.org')] }}));
  srv.close(); process.exit(0);
}});
"""
    env = {k: v for k, v in os.environ.items() if 'proxy' not in k.lower()}
    run = subprocess.run(
        ['node', '-e', script], capture_output=True, text=True, env=env, cwd=str(ROOT), timeout=60, check=False
    )
    assert run.returncode == 0, run.stderr[-600:]
    got = json.loads(run.stdout)
    # the 404 is broken; the two good ones are cached, so the rerun asks only for the broken one (HEAD + GET)
    assert got == {'ok': 2, 'broken': [404], 'cached': 2, 'again': 2, 'bot': [True, False]}


@node
def test_bot_hosts_incl_405_and_reuse_and_selection_wait_are_in_the_audit():
    audit = ROOT / 'tools' / 'audit'
    ext = (audit / 'external.js').read_text()
    assert 'r.status === 403 || r.status === 405' in ext
    assert all(f"'{h}'" in ext for h in ('encodeproject.org', 'ensembl.org', 'string-db.org', 'omim.org'))
    assert "flag('reuse')" in (audit / 'all.js').read_text()
    assert 'Loading' in (audit / 'links.js').read_text()
