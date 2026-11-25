"""robots.txt and sitemap.xml for the folder `ptmc pages` publishes."""

from __future__ import annotations

import html

DEFAULT_URL = 'https://shechterlab.github.io/ptmcontext/'


def crawl_files(cfg: dict, site_ids: list[str], compare: bool) -> tuple[str, str]:
    """(robots.txt, sitemap.xml) for the published folder: the landing page, Compare marks and each explorer's root, at
    absolute addresses under the config's `url` (else DEFAULT_URL)."""
    base = (cfg.get('url') or DEFAULT_URL).rstrip('/') + '/'
    paths = ['', *(['compare/'] if compare else []), *(f'{i}/' for i in site_ids)]
    urls = ''.join(f'  <url><loc>{html.escape(base + p)}</loc></url>\n' for p in paths)
    sitemap = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n'
    return f'User-agent: *\nAllow: /\n\nSitemap: {base}sitemap.xml\n', sitemap
