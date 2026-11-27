#!/usr/bin/env node
/* The whole site in one run: the four explorers, the landing page and Compare, then every external link once.
   node tools/audit/all.js <site-base-url> [--out-dir dir] [--concurrency N] [--budget MINUTES] [--page-seconds S] [--parallel N]
     [--no-external] [--reuse] [--cache file] [--only lysine,compare] [--no-selection]
   Each target runs tools/audit/links.js (explorers: the full page and control audit; the landing page and Compare: --simple), up to
   --parallel of them at a time (default 2), each with its own JSON report and log in the out dir. The external addresses of all of them are
   deduped and checked once by tools/audit/external.js. Writes summary.tsv (one row per finding) and summary.md to the out dir.
   Exit 1 when an internal link is broken, a control is dead, a page throws, or an external link answers 4xx/5xx. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { checkExternal } = require('./external.js');

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || '').replace(/\/+$/, '');
if (!base) {
  console.error(
    'usage: all.js <site-base-url> [--out-dir dir] [--concurrency N] [--budget MIN] [--page-seconds S] [--parallel N] [--no-external]'
  );
  process.exit(2);
}
const opt = (k) => (args.indexOf('--' + k) >= 0 ? args[args.indexOf('--' + k) + 1] : null);
const flag = (k) => args.includes('--' + k);
const outDir = path.resolve(opt('out-dir') || fs.mkdtempSync(path.join(os.tmpdir(), 'ptmc-audit-')));
fs.mkdirSync(outDir, { recursive: true });
const TARGETS = [
  { name: 'lysine', kind: 'explorer', url: `${base}/lysine/` },
  { name: 'methyllysine', kind: 'explorer', url: `${base}/methyllysine/` },
  { name: 'methylarginine', kind: 'explorer', url: `${base}/methylarginine/` },
  { name: 'phospho', kind: 'explorer', url: `${base}/phospho/` },
  { name: 'landing', kind: 'page', url: `${base}/` },
  { name: 'compare', kind: 'page', url: `${base}/compare/` },
].filter((t) => !opt('only') || opt('only').split(',').includes(t.name));

const passthrough = [];
for (const k of ['concurrency', 'budget', 'page-seconds', 'max', 'later-links', 'page-links'])
  if (opt(k)) passthrough.push('--' + k, opt(k));
if (flag('no-selection')) passthrough.push('--no-selection');

const runTarget = (t) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    if (flag('reuse') && fs.existsSync(path.join(outDir, `${t.name}.json`))) {
      // --reuse: the report of an earlier run in this out dir stands (the summary and the external check are redone)
      const report = JSON.parse(fs.readFileSync(path.join(outDir, `${t.name}.json`), 'utf8'));
      return resolve({ ...t, seconds: 0, code: 0, report });
    }
    const log = fs.createWriteStream(path.join(outDir, `${t.name}.log`));
    const a = [path.join(__dirname, 'links.js'), t.url, '--out', path.join(outDir, `${t.name}.json`), ...passthrough];
    if (t.kind === 'page') a.push('--simple');
    const p = spawn('node', a, { stdio: ['ignore', 'ignore', 'pipe'] });
    p.stderr.pipe(log);
    p.on('close', (code) => {
      let report = null;
      try {
        report = JSON.parse(fs.readFileSync(path.join(outDir, `${t.name}.json`), 'utf8'));
      } catch (e) {
        /* the run died before writing */
      }
      console.error(`${t.name}: done in ${Math.round((Date.now() - t0) / 1000)} s (exit ${code})`);
      resolve({ ...t, seconds: Math.round((Date.now() - t0) / 1000), code, report });
    });
  });

(async () => {
  const T0 = Date.now();
  const results = [];
  let next = 0;
  const lane = async () => {
    for (;;) {
      const t = TARGETS[next++];
      if (!t) return;
      results.push(await runTarget(t));
    }
  };
  await Promise.all(Array.from({ length: +(opt('parallel') || 2) }, lane));
  results.sort((x, y) => TARGETS.findIndex((t) => t.name === x.name) - TARGETS.findIndex((t) => t.name === y.name));

  const rows = []; // [kind, target, where, address, text, why]
  const urls = new Map();
  for (const r of results) {
    const rp = r.report;
    if (!rp) {
      rows.push(['failed', r.name, '', r.url, '', `the run wrote no report (exit ${r.code}); see ${r.name}.log`]);
      continue;
    }
    rp.broken.forEach((b) => rows.push(['broken link', r.name, b.where, b.href, b.text, b.why]));
    rp.dead.forEach((b) => rows.push(['dead control', r.name, b.where, '', b.control, b.why]));
    rp.errors.forEach((b) => rows.push(['page error', r.name, b.where, '', b.control || '', b.why]));
    (rp.sampled || []).forEach((x) => rows.push(['sampled', r.name, x, '', '', '']));
    rp.skipped.forEach((s) => rows.push(['skipped', r.name, s, '', '', '']));
    (rp.externalUrls || []).forEach((u) => urls.has(u.url) || urls.set(u.url, { where: u.where, text: u.text }));
  }
  let ext = null;
  const e0 = Date.now();
  if (!flag('no-external')) {
    ext = await checkExternal(urls, { cache: opt('cache') || path.join(outDir, 'external-cache.json') });
    ext.seconds = Math.round((Date.now() - e0) / 1000);
    fs.writeFileSync(path.join(outDir, 'external.json'), JSON.stringify(ext, null, 1));
    ext.broken.forEach((b) => rows.push(['external broken', '', b.where, b.url, b.text, `HTTP ${b.status}`]));
    ext.unverified.forEach((b) => rows.push(['external unverified', '', b.where, b.url, b.text, b.why]));
  }
  const secs = Math.round((Date.now() - T0) / 1000);
  const tsv = (c) => String(c ?? '').replace(/[\t\n\r]+/g, ' ');
  fs.writeFileSync(
    path.join(outDir, 'summary.tsv'),
    [['kind', 'target', 'where', 'address', 'visible text', 'why'], ...rows]
      .map((r) => r.map(tsv).join('\t'))
      .join('\n') + '\n'
  );

  const md = [
    `# Link audit of ${base}`,
    '',
    `Total time: ${Math.floor(secs / 60)} min ${secs % 60} s (${new Date().toISOString()}).`,
    '',
  ];
  md.push(
    '| Target | Pages | Links | Controls | Broken | Dead | Errors | Skipped | Time |',
    '|---|---|---|---|---|---|---|---|---|'
  );
  for (const r of results) {
    const c = r.report?.checked || { pages: 0, links: 0, controls: 0 };
    const n = (k) => (r.report ? r.report[k].length : '?');
    md.push(
      `| ${r.name} | ${c.pages} | ${c.links} | ${c.controls} | ${n('broken')} | ${n('dead')} | ${n('errors')} | ${n('skipped')} | ${r.seconds} s |`
    );
  }
  const section = (title, kind, fmt) => {
    const rs = rows.filter((r) => r[0] === kind);
    md.push('', `## ${title} (${rs.length})`, '');
    if (!rs.length) md.push('None.');
    rs.forEach((r) => md.push(`- ${fmt(r)}`));
  };
  const q = (s) => '`' + String(s).replace(/`/g, "'") + '`';
  section('Broken internal links', 'broken link', (r) => `${r[1]}, ${r[2]}: ${q(r[3])} "${r[4]}": ${r[5]}`);
  section('Dead controls', 'dead control', (r) => `${r[1]}, ${r[2]}: ${r[4]}: ${r[5]}`);
  section('Page errors', 'page error', (r) => `${r[1]}, ${r[2]} ${r[4]}: ${r[5]}`);
  section('Skipped or not finished', 'skipped', (r) => `${r[1]}: ${r[2]}`);
  section('Pages with links sampled (--page-links)', 'sampled', (r) => `${r[1]}: ${r[2]}`);
  section('Failed runs', 'failed', (r) => `${r[1]}: ${r[5]}`);
  if (ext) {
    md.push(
      '',
      `## External links`,
      '',
      `${urls.size} distinct addresses: ${ext.ok} ok (${ext.cached} from the 24 h cache), ${ext.broken.length} broken, ${ext.unverified.length} unverified; ${ext.seconds} s.`
    );
    section('Broken external links', 'external broken', (r) => `${q(r[3])} "${r[4]}" on ${r[2]}: ${r[5]}`);
    const by = {};
    ext.unverified.forEach((u) => (by[u.host] = by[u.host] || []).push(u));
    md.push('', `## Unverified external links, by host (${ext.unverified.length})`, '');
    if (!ext.unverified.length) md.push('None.');
    Object.entries(by)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([h, us]) =>
        md.push(`- ${h} (${us.length}): ${[...new Set(us.map((u) => u.why))].join('; ')}; e.g. ${q(us[0].url)}`)
      );
  }
  fs.writeFileSync(path.join(outDir, 'summary.md'), md.join('\n') + '\n');
  console.error(`${rows.length} findings in ${secs} s; see ${path.join(outDir, 'summary.md')}`);
  process.exit(rows.some((r) => !['skipped', 'sampled', 'external unverified'].includes(r[0])) ? 1 : 0);
})();
