"""Disease families of ClinVar condition names, from the release's own rules.

The PTM_Pipeline release assigns each DisGeNET term to a disease family by the first rule its name matches
(`scripts/disease_families.py`: FAMILY_RULES, ADDITIONAL_FAMILY_RULES, CURATED_OVERRIDES). This module reads those three tables
from that file as data (the file is parsed, never imported or run: a file of another repository is data, checked against its MD5
in the manifest) and applies the same rule to a ClinVar condition name. `family` is the release's `classify`, line for line.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

UNASSIGNED = 'Other / unassigned'
NAMES = ('FAMILY_RULES', 'ADDITIONAL_FAMILY_RULES', 'CURATED_OVERRIDES')
# the names ClinVar uses where no condition is given: they name no disease
NO_CONDITION = {'not specified', 'not provided', 'see cases'}


def read_rules(path: Path) -> dict:
    """The three rule tables of the release's family file, read without running it."""
    tree = ast.parse(Path(path).read_text(encoding='utf-8'))
    found = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and getattr(node.targets[0], 'id', None) in NAMES:
            found[node.targets[0].id] = ast.literal_eval(node.value)
    missing = [n for n in NAMES if n not in found]
    if missing:
        raise ValueError(f'{path}: no {", ".join(missing)} (the release changed its family file?)')
    return found


def family(rules: dict, name: str) -> str:
    """The family of one condition name: a curated override, else the first audited rule, else the first additional rule that
    matches; UNASSIGNED when none does (the release's `classify`)."""
    over = rules['CURATED_OVERRIDES'].get(name)
    if over:
        return over[0]
    for fam, pat in rules['FAMILY_RULES']:
        if re.search(pat, name, re.I):
            return fam
    for fam, pat in rules['ADDITIONAL_FAMILY_RULES']:
        if re.search(pat, name, re.I):
            return fam
    return UNASSIGNED


def condition_names(text) -> list[str]:
    """The named conditions of a ClinVar `conditions` cell: split on '|' and ';', stripped, the empty ones and the 'not
    specified', 'not provided' and 'see cases' placeholders dropped, each name once."""
    out = []
    for part in re.split(r'[|;]', '' if text is None or text != text else str(text)):
        n = part.strip()
        if n and n.lower() not in NO_CONDITION and n not in out:
            out.append(n)
    return out
