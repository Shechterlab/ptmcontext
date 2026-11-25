#!/usr/bin/env node
/* External-link check, apart from the browser audit and fast.
   As a module: const { checkExternal } = require('./external.js'); await checkExternal(Map(url -> {where, text}), options)
   As a command: node tools/audit/external.js urls.json [--cache file] [--out report.json]   (urls.json: {url: {where, text}} or [url, ...])
   Each URL is fetched once for the whole site (deduped by the caller), HEAD first and GET when HEAD fails, with a short timeout, a few
   requests at a time per host. Answers below 400 are cached in a JSON file for 24 hours: a rerun skips them.
   403 and 429 from the hosts in BOT_HOSTS, a bot check, 429, and network failures are "unverified", never broken. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Hosts that answer scripts with 403/429 whatever the page is (publishers, social sites): their 403/429 is unverified, not broken.
// A host matches itself and its subdomains; the host checked is that of the address asked and that of the page it redirected to.
const BOT_HOSTS = [
  'doi.org',
  'sciencedirect.com',
  'cell.com',
  'elsevier.com',
  'wiley.com',
  'tandfonline.com',
  'springer.com',
  'springeropen.com',
  'nature.com',
  'science.org',
  'oup.com',
  'pnas.org',
  'acs.org',
  'jbc.org',
  'rupress.org',
  'biorxiv.org',
  'researchgate.net',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'reddit.com',
  'ncbi.nlm.nih.gov',
];
const PER_HOST = 2; // requests at a time to one host
const TOTAL = 12; // requests at a time
const TIMEOUT = 8000; // ms per request
const TTL = 24 * 3600 * 1000; // a known-good URL is not asked again for this long
const DEFAULT_CACHE = path.join(process.env.AUDIT_SCRATCH || os.tmpdir(), 'ptmcontext-external-cache.json');

const hostOf = (u) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
};
const isBotHost = (h) => BOT_HOSTS.some((b) => h === b || h.endsWith('.' + b));

async function checkExternal(urls, o = {}) {
  const { request } = require('playwright');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const cacheFile = o.cache || DEFAULT_CACHE;
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch (e) {
    /* no cache yet */
  }
  const now = Date.now();
  const res = { ok: 0, cached: 0, checked: 0, broken: [], unverified: [], hosts: {} };
  const todo = [];
  for (const [url, src] of urls) {
    if (/[{}]|%7B/i.test(url)) continue;
    const h = hostOf(url);
    (res.hosts[h] = res.hosts[h] || { urls: 0 }).urls++;
    if (cache[url] && cache[url].ok && now - cache[url].t < TTL) {
      res.ok++;
      res.cached++;
    } else todo.push([url, src, h]);
  }
  const rc = await request.newContext(proxy ? { proxy: { server: proxy } } : {});
  const busy = new Map(); // host -> requests in flight
  let active = 0;
  const queue = todo.slice();
  const fetchOne = async (url) => {
    let status = null,
      err = '',
      challenge = false,
      final = url;
    for (const method of ['head', 'get']) {
      try {
        const r = await rc[method](url, {
          timeout: TIMEOUT,
          maxRedirects: 5,
          headers: { 'user-agent': 'Mozilla/5.0 (link audit)' },
        });
        status = r.status();
        final = r.url();
        challenge = !!r.headers()['cf-mitigated'];
        err = '';
        if (status < 400) break;
      } catch (e) {
        err = String(e.message).split('\n')[0].slice(0, 100);
        status = null;
      }
    }
    return { status, err, challenge, final };
  };
  const record = ([url, src, h], r) => {
    res.checked++;
    const bot = isBotHost(h) || isBotHost(hostOf(r.final));
    if (r.status != null && r.status < 400) {
      res.ok++;
      cache[url] = { ok: true, t: Date.now(), status: r.status };
    } else if (r.status != null && !r.challenge && r.status !== 429 && !(bot && r.status === 403))
      res.broken.push({ url, status: r.status, host: h, ...src });
    else
      res.unverified.push({
        url,
        host: h,
        why: r.challenge
          ? `HTTP ${r.status} (bot check)`
          : r.status != null
            ? `HTTP ${r.status} (${r.status === 429 ? 'rate-limited' : 'blocks scripts'})`
            : r.err || 'no answer',
        ...src,
      });
  };
  await new Promise((resolve) => {
    const pump = () => {
      for (let i = 0; i < queue.length && active < TOTAL; ) {
        const job = queue[i];
        if ((busy.get(job[2]) || 0) >= PER_HOST) {
          i++;
          continue;
        }
        queue.splice(i, 1);
        active++;
        busy.set(job[2], (busy.get(job[2]) || 0) + 1);
        fetchOne(job[0])
          .then((r) => record(job, r))
          .catch((e) => record(job, { status: null, err: String(e.message).slice(0, 100), final: job[0] }))
          .finally(() => {
            active--;
            busy.set(job[2], busy.get(job[2]) - 1);
            pump();
          });
      }
      if (!queue.length && !active) resolve();
    };
    pump();
  });
  await rc.dispose();
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  } catch (e) {
    /* the cache is only a speed-up */
  }
  return res;
}

module.exports = { checkExternal, BOT_HOSTS, isBotHost, hostOf };

if (require.main === module) {
  const a = process.argv.slice(2);
  const opt = (k) => (a.indexOf('--' + k) >= 0 ? a[a.indexOf('--' + k) + 1] : null);
  const file = a.find((x) => !x.startsWith('--') && x !== opt('cache') && x !== opt('out'));
  if (!file) {
    console.error('usage: external.js urls.json [--cache file] [--out report.json]');
    process.exit(2);
  }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const m = new Map(Array.isArray(j) ? j.map((u) => [u, {}]) : Object.entries(j));
  checkExternal(m, { cache: opt('cache') }).then((r) => {
    const s = JSON.stringify(r, null, 1);
    if (opt('out')) fs.writeFileSync(opt('out'), s);
    else console.log(s);
    console.error(`${r.ok} ok (${r.cached} cached), ${r.broken.length} broken, ${r.unverified.length} unverified`);
    process.exit(r.broken.length ? 1 : 0);
  });
}
