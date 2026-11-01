"""Citations and versions, read from CITATION.cff files (Citation File Format 1.2.0), so they are edited as text and
never typed into code. The kit's own file is CITATION.cff at the repository root; each site names its own
(site file: citation). Every export of a site carries the formatted citation, the site's version and the kit's.
"""
from __future__ import annotations

from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]


def read(path: str | Path) -> dict:
    data = yaml.safe_load(Path(path).read_text())
    if not isinstance(data, dict) or str(data.get('cff-version', '')) != '1.2.0':
        raise ValueError(f'{path}: not a CITATION.cff (cff-version 1.2.0)')
    for key in ('title', 'version'):
        if not isinstance(data.get(key), str):
            raise ValueError(f'{path}: {key} must be quoted text (YAML reads 1.10 as 1.1)')
    return data


def _author(a: dict) -> str:
    if a.get('name'):
        return a['name']
    return f"{a.get('family-names', '')} {a.get('given-names', '')}".strip()


def format_reference(ref: dict) -> str:
    """Authors. Title. Journal Volume:start-end (Year). Short, in the style the lab's sites cite with."""
    authors = [_author(a) for a in ref.get('authors', [])]
    names = ', '.join(a for a in authors if a != 'et al.') + (' et al.' if 'et al.' in authors else '')
    where = ref.get('journal', '')
    if ref.get('volume'):
        where += f" {ref['volume']}"
        if ref.get('start'):
            where += f":{ref['start']}" + (f"–{ref['end']}" if ref.get('end') else '')
    text = '. '.join(p.rstrip('.') for p in (names, ref.get('title', '')) if p)
    year = f" ({ref['year']})" if ref.get('year') else ''
    if where.strip():
        text += f'. {where.strip()}{year}'
    else:
        text += f"{'. ' + ref['publisher'] if ref.get('publisher') else ''}{year}"
    return text + '.'


def short_reference(ref: dict) -> str:
    """First author (et al.) and year, for a figure's credit line: 'Blum et al. 2025'."""
    authors = [a for a in ref.get('authors', []) if _author(a) != 'et al.']
    many = len(ref.get('authors', [])) > 1
    first = (authors[0].get('family-names') or authors[0].get('name', '')) if authors else ''
    return f"{first}{' et al.' if many else ''} {ref.get('year', '')}".strip()


def site_citation(site: dict) -> dict:
    """What a site's pages and exports say about citing it and about its version."""
    if not site.get('citation'):
        return {}
    path = Path(site.get('__root__', REPO)) / site['citation']
    data = read(path)
    pref = data.get('preferred-citation')
    return {
        'file': site['citation'], 'title': data['title'], 'version': data['version'],
        'date': str(data.get('date-released', '')), 'doi': data.get('doi', ''), 'url': data.get('url', ''),
        'licence': data.get('license', ''), 'message': data.get('message', ''),
        'preferred': {'text': format_reference(pref), 'short': short_reference(pref), 'doi': pref.get('doi', '')} if pref else None,
        'references': [{'text': format_reference(r), 'short': short_reference(r), 'doi': r.get('doi', '')}
                       for r in data.get('references', [])],
        'cff': path.read_text(),
    }


def kit_citation() -> dict:
    """The kit's title, version and code URL: from its CITATION.cff in a checkout, else from the installed package."""
    if (REPO / 'CITATION.cff').exists():
        data = read(REPO / 'CITATION.cff')
        return {'title': data['title'], 'version': data['version'], 'url': data.get('repository-code', ''), 'licence': data.get('license', '')}
    from importlib import metadata
    meta = metadata.metadata('ptmcontext')
    return {'title': f"ptmcontext: {meta.get('Summary', '')}", 'version': metadata.version('ptmcontext'),
            'url': 'https://github.com/Shechterlab/ptmcontext', 'licence': meta.get('License', 'MIT')}
