#!/usr/bin/env python3
"""Generate the sites' header pictures (sites/art/<site>-hero.svg) of the modified residues from SMILES with RDKit.

A design-time tool, never run by the build; the SVGs it writes are committed. RDKit is not a dependency of ptmcontext:
    pip install --target .tools rdkit && PYTHONPATH=.tools python3 tools/make_ptm_art.py

Every structure is one side chain from the C-alpha (a wavy bond to the backbone, the first atom of the SMILES), drawn
by RDKit's depictor (120 degree angles) at one fixed bond length, turned so the C-alpha-to-C-gamma line is horizontal and
the C-beta is up, and set at the same C-alpha x and y in each column, so the three structures of a site, and the sites,
share one scale and one baseline. Charges are explicit in the SMILES. The strokes are currentColor (white in the header
band); the accent atoms (methyl groups, the phosphate) take the site's light accent. Each structure's SMILES is kept in
its <g data-smiles=...> and in sites/art/ptm-structures.tsv.
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

from rdkit import Chem, Geometry
from rdkit.Chem import rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D

ART = Path(__file__).resolve().parent.parent / 'sites' / 'art'
BOND = 12.5  # RDKit's fixedBondLength (units per angstrom): a bond is 1.5x as long on the page
PHOSPHATE = '[O-]P(=O)([O-])O'  # -OPO3(2-), the accent group of the phospho site
# site -> accent colour, [(name, caption, smiles, accent substructure SMARTS, atoms of the zigzag spine)]
SITES = {
    'methylarginine': (
        '#fdba74',
        'Monomethylarginine (Rme1), asymmetric (Rme2a) and symmetric (Rme2s) dimethylarginine',
        [
            ('Rme1', 'monomethyl', '*CCCCNC(=[NH2+])NC', '[CH3]', 7),
            ('Rme2a', 'asymmetric dimethyl', '*CCCCNC(=[NH2+])N(C)C', '[CH3]', 7),
            ('Rme2s', 'symmetric dimethyl', '*CCCCNC(=[N+]([H])C)NC', '[CH3]', 7),
        ],
    ),
    'methyllysine': (
        '#fdba74',
        'Monomethyllysine (Kme1), dimethyllysine (Kme2) and trimethyllysine (Kme3)',
        [
            ('Kme1', 'monomethyl', '*CCCCC[N+]([H])([H])C', '[CH3]', 7),
            ('Kme2', 'dimethyl', '*CCCCC[N+]([H])(C)C', '[CH3]', 7),
            ('Kme3', 'trimethyl', '*CCCCC[N+](C)(C)C', '[CH3]', 7),
        ],
    ),
    'phospho': (
        '#67e8f9',
        'Phosphoserine (Sph), phosphothreonine (Tph) and phosphotyrosine (Yph)',
        [
            ('Sph', 'phosphoserine', '*CCOP([O-])([O-])=O', PHOSPHATE, 'ser'),
            ('Tph', 'phosphothreonine', '*CC(OP([O-])([O-])=O)C', PHOSPHATE, 'thr'),
            ('Yph', 'phosphotyrosine', '*CCc1ccc(OP([O-])([O-])=O)cc1', PHOSPHATE, 'tyr'),
        ],
    ),
}


def cross(coords: dict, p: int, ester: int, minus: tuple[int, int], oxo: int) -> None:
    """Lay out the phosphate's three other oxygens on P at 90 degrees: the P=O in line with the ester bond, the two O-
    above and below it, symmetric about the P-O axis."""
    px, py = coords[p].x, coords[p].y
    phi = math.atan2(coords[ester].y - py, coords[ester].x - px)
    for idx, turn in ((minus[0], 90), (oxo, 180), (minus[1], 270)):
        a = phi + math.radians(turn)
        coords[idx] = Geometry.Point2D(px + 1.5 * math.cos(a), py + 1.5 * math.sin(a))


def layout(kind: str) -> dict:
    """Fixed coordinates (bond length 1.5) of the phospho structures, C-alpha at (0, 0 or dy)."""
    P = Geometry.Point2D
    if kind in ('ser', 'thr'):
        # the C-alpha to C-beta bond is horizontal, the C-beta to O bond runs 60 degrees up from it and the O-P bond is
        # horizontal again, so the P=O continues the axis as for Tyr; every angle is 120 degrees. Atoms: 0 stub (down
        # left of the C-alpha), 1 C-alpha, 2 C-beta, 3 O, 4 P, 5 and 6 O-, 7 =O, 8 the Thr methyl (down right of C-beta)
        hx, hy = 1.5 * math.cos(math.radians(60)), 1.5 * math.sin(math.radians(60))
        c = {0: P(-hx, -hy), 1: P(0.0, 0.0), 2: P(1.5, 0.0), 3: P(1.5 + hx, hy), 4: P(3.0 + hx, hy)}
        cross(c, 4, 3, (5, 6), 7)
        if kind == 'thr':
            c[8] = P(1.5 + hx, -hy)
        return c
    # Tyr: the C-beta-to-ring bond and the whole para axis (ring, O, P, =O) are horizontal, the C-alpha is 60 degrees up
    # from the C-beta and the stub runs left from it: every angle 120 degrees, the P=O continuing the axis
    hx, hy = 1.5 * math.cos(math.radians(60)), 1.5 * math.sin(math.radians(60))
    y = -hy
    c = {0: P(-1.5, 0.0), 1: P(0.0, 0.0), 2: P(hx, y)}
    # atoms 3 ipso, 4 ortho, 5 meta, 6 para, 7 O, 8 P, 9 and 10 O-, 11 =O, 12 meta, 13 ortho
    ring = {3: (0.0, 0.0), 4: (0.75, 1.299), 5: (2.25, 1.299), 6: (3.0, 0.0), 12: (2.25, -1.299), 13: (0.75, -1.299)}
    for i, (rx, ry) in ring.items():
        c[i] = P(hx + 1.5 + rx, y + ry)
    c[7] = P(c[6].x + 1.5, y)
    c[8] = P(c[7].x + 1.5, y)
    cross(c, 8, 7, (9, 10), 11)
    return c


def depict(smiles: str, accent_smarts: str, spine):
    """(mol, svg body, C-alpha x, y, extent, accent atoms) of one structure, extent relative to the C-alpha."""
    ps = Chem.SmilesParserParams()
    ps.removeHs = False  # a charged N keeps the H atoms its SMILES writes: they are drawn on their own bonds, away from the charge
    mol = Chem.MolFromSmiles(smiles, ps)
    for a in mol.GetAtoms():
        if a.GetAtomicNum() == 0:
            a.SetProp('atomLabel', ' ')  # the backbone stub is a bare end of the wavy bond
    mol.GetBondWithIdx(0).SetBondDir(Chem.BondDir.UNKNOWN)  # wavy
    methyls = [
        a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() == 6 and a.GetDegree() == 1 and a.GetTotalNumHs() == 3
    ]
    for i in methyls:
        mol.GetAtomWithIdx(i).SetProp(
            'atomLabel', ' '
        )  # written below, so that its bond ends at the C and nothing crosses it
    rdDepictor.SetPreferCoordGen(False)
    # the first `spine` atoms (the stub, C-alpha and the chain) are a fixed zigzag of 120 degree angles, the stub down, the
    # C-alpha up; the depictor places the rest (branches, ring, phosphate) around them
    dx, dy = 1.5 * math.cos(math.radians(30)), 1.5 * math.sin(math.radians(30))
    if isinstance(spine, str):  # the phospho structures are laid out atom by atom (see layout)
        fixed = layout(spine)
    else:
        fixed = {i: Geometry.Point2D((i - 1) * dx, dy if i % 2 else 0.0) for i in range(spine)}
    rdDepictor.Compute2DCoords(mol, coordMap=fixed)
    d = rdMolDraw2D.MolDraw2DSVG(600, 400)
    o = d.drawOptions()
    o.fixedBondLength = BOND
    o.fixedFontSize = 12
    o.clearBackground = False
    o.bondLineWidth = 1.6
    o.multipleBondOffset = 0.14
    o.additionalAtomLabelPadding = 0.12
    o.useBWAtomPalette()
    o.padding = 0.0
    d.DrawMolecule(mol)
    d.FinishDrawing()
    svg = d.GetDrawingText()
    body = svg.split('<!-- END OF HEADER -->', 1)[1].rsplit('</svg>', 1)[0]
    ca = d.GetDrawCoords(1)
    acc = set()
    for m in mol.GetSubstructMatches(Chem.MolFromSmarts(accent_smarts)):
        acc.update(m)
    body = methyl_labels(body, mol, d, methyls, acc)
    # the extent is that of everything drawn (atoms, labels and charges are paths), relative to the C-alpha
    nums = [float(v) for dd in re.findall(r" d='([^']*)'", body) for v in re.findall(r'-?\d+\.?\d*', dd)]
    xs, ys = nums[0::2], nums[1::2]
    ext = [min(xs), max(xs), min(ys), max(ys)]
    for x0, x1, y0, y1 in TEXT_BOX:
        ext = [min(ext[0], x0), max(ext[1], x1), min(ext[2], y0), max(ext[3], y1)]
    TEXT_BOX.clear()
    ext = (ext[0] - ca.x, ext[1] - ca.x, ext[2] - ca.y, ext[3] - ca.y)
    return mol, body, (ca.x, ca.y), ext, acc


TEXT_BOX: list[tuple[float, float, float, float]] = []


def methyl_labels(body: str, mol, d, methyls: list[int], acc: set[int]) -> str:
    """Each methyl group as text, CH3 where it points right or up or down, H3C where it points left, its C on the atom, and
    its bond shortened to stop short of the C. Painted later with the accent like the rest (class `lbl atom-N`)."""
    for i in methyls:
        nb = mol.GetAtomWithIdx(i).GetNeighbors()[0].GetIdx()
        p, q = d.GetDrawCoords(i), d.GetDrawCoords(nb)
        vx, vy = p.x - q.x, p.y - q.y
        n = math.hypot(vx, vy)
        r = 5.5
        sx, sy = p.x - vx / n * r, p.y - vy / n * r  # where the bond now ends
        left = (
            vx < 4
        )  # H3C unless it points clearly right: a vertical one then grows leftwards, away from the group beside it
        label = (
            'H<tspan font-size="8.8" dy="3.2">3</tspan><tspan dy="-3.2">C</tspan>'
            if left
            else 'CH<tspan font-size="8.8" dy="3.2">3</tspan>'
        )
        x = p.x + 4.3 if left else p.x - 4.3
        body = re.sub(
            rf"(<path class='bond-\d+ atom-{nb} atom-{i}'[^>]* d=')M ([\d.]+),([\d.]+) L [\d.]+,[\d.]+'",
            lambda m: f"{m.group(1)}M {m.group(2)},{m.group(3)} L {sx:.1f},{sy:.1f}'",
            body,
        )
        body = re.sub(
            rf"(<path class='bond-\d+ atom-{i} atom-{nb}'[^>]* d=')M [\d.]+,[\d.]+ L ([\d.]+),([\d.]+)'",
            lambda m: f"{m.group(1)}M {sx:.1f},{sy:.1f} L {m.group(2)},{m.group(3)}'",
            body,
        )
        TEXT_BOX.append((x - 25 if left else x, x if left else x + 25, p.y - 9, p.y + 9))  # the label's extent
        body += (
            f"<text class='lbl atom-{i}' x='{x:.1f}' y='{p.y + 4.5:.1f}' text-anchor='{'end' if left else 'start'}' "
            f"font-size='12' fill='#000000'>{label}</text>\n"
        )
    return body


def paint(body: str, mol, acc: set[int], accent: str) -> str:
    """Strokes and fills to currentColor, the accent atoms and the bonds between them (or to a terminal one) to `accent`."""
    leaf = {i for i in acc if mol.GetAtomWithIdx(i).GetDegree() == 1}

    def one(m):
        tag = m.group(0)
        cls = re.search(r"class='([^']*)'", tag)
        ids = [int(x) for x in re.findall(r'atom-(\d+)', cls.group(1))] if cls else []
        if cls and cls.group(1).startswith('bond-'):
            hot = all(i in acc for i in ids) or any(i in leaf for i in ids)
        else:
            hot = bool(ids) and ids[0] in acc
        col = accent if hot else 'currentColor'
        return re.sub(r'#000000', col, tag)

    return re.sub(r'<(?:path|ellipse|rect|text)[^>]*>', one, body)


def build(site: str):
    accent, label, items = SITES[site]
    parts, rows = [], []
    drawn = [depict(smi, acc, sp) for _, _, smi, acc, sp in items]
    gap = 22
    x = 0.0
    top = min(d[3][2] for d in drawn)
    bottom = max(d[3][3] for d in drawn)
    cap_y = bottom + 30
    for (name, caption, smi, _, _), (mol, body, ca, box, acc) in zip(items, drawn):
        left, right = box[0], box[1]
        ox = x - left
        centre = x + (right - left) / 2
        g = f'<g id="{name}" data-smiles="{smi}" transform="translate({ox + 0:.1f},{-top:.1f}) translate({-ca[0]:.1f},{-ca[1]:.1f})">'
        # (the drawing's C-alpha was at ca in RDKit's canvas; the translate moves it to the column's origin)
        parts.append(
            g
            + paint(body, mol, acc, accent)
            + '</g>'
            + f'<text x="{centre:.1f}" y="{cap_y - top:.1f}" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">{name}</text>'
            f'<text x="{centre:.1f}" y="{cap_y - top + 14:.1f}" text-anchor="middle" font-size="11" fill="currentColor">{caption}</text>'
        )
        rows.append((site, name, caption, smi))
        x += right - left + gap
    width = x - gap
    height = cap_y - top + 14
    pad = 6
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width + 2 * pad:.0f}" height="{height + 2 * pad:.0f}" '
        f'viewBox="{-pad} {-pad} {width + 2 * pad:.0f} {height + 2 * pad:.0f}" role="img" '
        f'aria-label="{label}" font-family="Arial, Helvetica, Arimo, \'Liberation Sans\', sans-serif" stroke-linecap="round">'
        f'<desc>Side chains from the C-alpha (wavy bond to the backbone), drawn from SMILES with RDKit '
        f'(tools/make_ptm_art.py): {"; ".join(f"{n} {s}" for _, n, _, s in rows)}</desc>' + ''.join(parts) + '</svg>\n'
    )
    return svg, rows


# The logos: one family, a tile in the site's band colour, a white lens whose glass is the site's accent, the mark in it (R, K, P
# as strokes, no font) and a white handle. White on the accent is at least 5:1; strokes are 5 units of 64, so the letter holds at 16 px.
GLYPH = {
    'R': 'M24,40V18H31A6,6 0 0 1 31,30H24M30,30L37,40',
    'K': 'M24,18V40M36,18L24,29M28,26L37,40',
    'P': 'M24,40V18H31A6,6 0 0 1 31,30H24',
}
LOGOS = {  # site -> (band colour, accent, glyph, title)
    'methylarginine': ('#155e75', '#c2410c', 'R', 'Methylarginine Site Explorer'),
    'methyllysine': ('#5b21b6', '#b45309', 'K', 'Methyllysine Site Explorer'),
    'phospho': ('#1e40af', '#0e7490', 'P', 'Phosphosite Explorer'),
}


def logo(band: str, glass: str, inner: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{title}">'
        f'<rect width="64" height="64" rx="14" fill="{band}"/>'
        '<rect x=".75" y=".75" width="62.5" height="62.5" rx="13.5" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.5"/>'
        f'<circle cx="29" cy="29" r="20" fill="{glass}"/>'
        '<circle cx="29" cy="29" r="20" fill="none" stroke="#f8fafc" stroke-width="6"/>'
        '<path d="M44,44L57,57" stroke="#f8fafc" stroke-width="9" stroke-linecap="round"/>'
        f'{inner}</svg>\n'
    )


def write_logos():
    for site, (band, accent, g, title) in LOGOS.items():
        inner = f'<path transform="translate(29 29) scale(.8) translate(-29 -29)" d="{GLYPH[g]}" fill="none" stroke="#f8fafc" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'
        (ART / f'{site}_logo.svg').write_text(logo(band, accent, inner, title))
    dots = ''.join(
        f'<circle cx="{x}" cy="29" r="4.3" fill="{c}"/>' for x, c in ((19, '#fb923c'), (29, '#fbbf24'), (39, '#22d3ee'))
    )
    (ART / 'ptmcontext_logo.svg').write_text(logo('#1e293b', '#334155', dots, 'Human protein modification sites'))


def main(argv):
    write_logos()
    rows = []
    for site in argv[1:] or SITES:
        svg, r = build(site)
        (ART / f'{site}-hero.svg').write_text(svg)
        rows += r
        print(site, len(svg), 'bytes')
    if not argv[1:]:
        (ART / 'ptm-structures.tsv').write_text(
            'site\tname\tcaption\tsmiles\n' + ''.join('\t'.join(r) + '\n' for r in rows)
        )


if __name__ == '__main__':
    main(sys.argv)
