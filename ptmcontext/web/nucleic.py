"""What the protein page's RNA and DNA interactions card (assets/kit-prna.js) reads from the site file.

The card gathers what a site knows of a protein's RNA and DNA: the marks in contact with them in PDB structures (the 3D
viewer's `contacts` and `bound` tables, website.protein.structure, and a `near` table for contact through a neighbouring
residue), the runs of residues bound in structures (`regions`), residues crosslinked in living cells (`crosslinks`), the
sequences bound (the viewer's bound windows; DNA-binding profiles in `motifs`), RNA Bind-n-Seq (`rbns`) and eCLIP
(`eclip`). It reads `website.protein.nucleic` as it stands (CONTRACTS.md, "RNA and DNA interactions"); this module checks it
(ptmc check) and names the manifest inputs it reads. It knows no organism, source or kind code: the kinds, the tables and
their columns are the site's. A part the site does not write is absent, and so is the card of a protein without data.
"""
from __future__ import annotations

PARTS = ('near', 'regions', 'crosslinks', 'motifs', 'rbns', 'eclip')
FORMAT = {'near': 'bound_windows', 'regions': 'protein_records', 'crosslinks': 'residue_evidence', 'motifs': 'protein_records',
          'rbns': 'protein_records', 'eclip': 'protein_records'}
WORDS = {'near': 'RNA and DNA touching a residue beside a mark', 'regions': 'runs of residues bound to RNA or DNA in structures',
         'crosslinks': 'residues crosslinked to RNA or DNA in cells', 'motifs': 'DNA-binding profiles', 'rbns': 'RNA Bind-n-Seq',
         'eclip': 'eCLIP'}


def config(site: dict) -> dict:
    return ((site.get('website') or {}).get('protein') or {}).get('nucleic') or {}


def _table(site: dict, part: str) -> dict | None:
    name = (config(site).get(part) or {}).get('table')
    return ((site.get('website') or {}).get('tables') or {}).get(name) if name else None


def roles(site: dict) -> dict[str, str]:
    """The manifest inputs the card reads, with what for (the Method page's Data table)."""
    out: dict[str, list] = {}
    for part in PARTS:
        tb = _table(site, part)
        if tb:
            out.setdefault(tb['input'], []).append(f'the RNA and DNA interactions card: {WORDS[part]}')
    return {n: '; '.join(w) for n, w in out.items()}


def _columns(tb: dict) -> set[str]:
    return set(tb.get('columns') or {}) | set(tb.get('values') or [])


def problems(site: dict) -> list[str]:
    """What website.protein.nucleic names that the site file does not have (ptmc check)."""
    cfg = config(site)
    if not cfg:
        return []
    w, tables = 'website.protein.nucleic', (site.get('website') or {}).get('tables') or {}
    out, kinds = [], set(cfg.get('kinds') or {})
    structure = ((site.get('website') or {}).get('protein') or {}).get('structure') or {}
    if not (structure.get('bound') or cfg.get('near') or cfg.get('regions')):
        out.append(f'{w}: no part reads structures; give near or regions, or website.protein.structure.bound')
    for part in PARTS:
        spec = cfg.get(part)
        if not spec:
            continue
        name = spec.get('table')
        tb = tables.get(name)
        if tb is None:
            out.append(f'{w}.{part}: no table {name!r} in website.tables')
            continue
        if tb.get('format') != FORMAT[part]:
            out.append(f"{w}.{part}: table {name!r} is {tb.get('format')!r}; the card reads a {FORMAT[part]} table here")
            continue
        have = _columns(tb)
        for field, col in (spec.get('fields') or {}).items():
            cols = list(col.values()) if isinstance(col, dict) else [col]
            out += [f'{w}.{part}.fields.{field}: table {name!r} has no column {c!r}' for c in cols if c not in have]
        if spec.get('kind') and spec['kind'] not in kinds:
            out.append(f"{w}.{part}.kind: {spec['kind']!r} is not one of kinds {sorted(kinds)}")
        out += [f'{w}.{part}.kinds: {v!r} is not one of kinds {sorted(kinds)}' for v in (spec.get('kinds') or {}).values() if v not in kinds]
        if part in ('regions', 'crosslinks') and not (spec.get('kinds') or {}):
            out.append(f'{w}.{part}.kinds: map the table\'s kind codes to the card\'s kinds')
    fl = cfg.get('flags')
    if fl:
        attrs = (site.get('marks') or {}).get('attributes') or {}
        if fl['attribute'] not in attrs:
            out.append(f"{w}.flags.attribute: no mark attribute {fl['attribute']!r}")
        if fl.get('kind') and fl['kind'] not in kinds:
            out.append(f"{w}.flags.kind: {fl['kind']!r} is not one of kinds {sorted(kinds)}")
    return out
