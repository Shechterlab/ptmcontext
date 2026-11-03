"""What the protein page's conservation card and the selection's logo (assets/kit-conserve.js) read from the site file.

The orthologues come live from Ensembl Compara (REST), for the Ensembl gene that UniProt's cross-references name for
the protein; the logo is drawn from the sequence windows the motif finder already holds (website.search.patterns). The
page reads `website.protein.conservation` as it stands (CONTRACTS.md, "Conservation across species"); this module
checks it (ptmc check). It knows no organism, species or residue: the species list, the Ensembl address and the
cross-reference database are the site's, the residues are the profile's.
"""
from __future__ import annotations

import re


def config(site: dict) -> dict:
    return ((site.get('website') or {}).get('protein') or {}).get('conservation') or {}


def problems(site: dict) -> list[str]:
    """What website.protein.conservation names that the site file does not have (ptmc check)."""
    cfg = config(site)
    if not cfg:
        return []
    out, w = [], 'website.protein.conservation'
    ens = cfg.get('ensembl') or {}
    for key in ('rest', 'xref', 'source'):
        if not ens.get(key):
            out.append(f'{w}.ensembl.{key}: missing')
    if ens.get('rest') and not re.match(r'^https://[^/\s]+(/\S*)?$', ens['rest']):
        out.append(f"{w}.ensembl.rest: {ens['rest']!r} is not an https address")
    if ens.get('compara') and not re.match(r'^[a-z_]+$', ens['compara']):
        out.append(f"{w}.ensembl.compara: {ens['compara']!r} is not an Ensembl Compara set name (lower case)")
    ids = [s.get('id', '') for s in cfg.get('species') or []]
    if not ids:
        out.append(f'{w}.species: no species to align')
    out += [f'{w}.species: {i!r} is not an Ensembl species name (lower case, underscores)' for i in ids if not re.match(r'^[a-z][a-z0-9_]*$', i)]
    out += [f'{w}.species: {i!r} listed twice' for i in sorted({i for i in ids if ids.count(i) > 1})]
    have = set(ids)
    presets = cfg.get('presets') or []
    pids = [x.get('id', '') for x in presets]
    out += [f'{w}.presets: {i!r} listed twice' for i in sorted({i for i in pids if pids.count(i) > 1})]
    for pr in presets:
        out += [f"{w}.presets[{pr.get('id')}]: {i!r} is not in website.protein.conservation.species" for i in pr.get('species') or [] if i not in have]
    if cfg.get('default') and cfg['default'] not in pids:
        out.append(f"{w}.default: {cfg['default']!r} is not the id of a preset")
    out += [f'{w}.similar: {x!r} is not one residue letter' for x in cfg.get('similar') or [] if not re.match(r'^[A-Z]$', str(x))]
    if cfg.get('logo') and not ((site.get('website') or {}).get('search') or {}).get('patterns'):
        out.append(f'{w}.logo: the logo is drawn from the motif finder\'s sequence windows; set website.search.patterns')
    return out
