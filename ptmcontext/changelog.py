"""The app's release list, read from CHANGELOG.md at build time so the Help page stays in step with it.

A release is a heading `## X.Y.Z (YYYY-MM-DD)`. The lines of `> ` that follow it are its summary (3 to 5 short lines).
The heading `## Unreleased` is not a release.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
HEADING = re.compile(r'^## (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)\s*$')
LINK = re.compile(r'\[([^\]]+)\]\([^)]+\)')


def _plain(text: str) -> str:
    return LINK.sub(r'\1', text).replace('`', '').strip()


def releases(path: str | Path | None = None) -> list[dict]:
    """Newest first: `[{version, date, lines}]`. Empty when there is no CHANGELOG.md (an installed copy)."""
    path = Path(path) if path else REPO / 'CHANGELOG.md'
    if not path.exists():
        return []
    out: list[dict] = []
    current = None
    for line in path.read_text().splitlines():
        if line.startswith('## '):
            m = HEADING.match(line)
            current = {'version': m.group(1), 'date': m.group(2), 'lines': []} if m else None
            if current:
                out.append(current)
        elif current is not None and line.startswith('> '):
            current['lines'].append(_plain(line[2:]))
    return out
