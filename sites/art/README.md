# Site art

Header pictures, icons and the lab logo the site files name (`website.art`, `website.icon`, `website.lab.logo`). The
methylarginine drawing, its icon and the Shechter lab logo are the lab's own, taken as files from the Methylarginine
Site Explorer (Shechterlab/PTM_Pipeline `docs/index.html` and `docs/assets/`, commit b0d9049). A site without `art`
gets a drawn protein with its marks, made by the kit.

**Regenerated art.** The header pictures of the three marks (`*-hero.svg`) and the logos (`*_logo.svg`, `ptmcontext_logo.svg`
for the landing page) are written by `tools/make_ptm_art.py` (not run by the build): each structure is a side chain from the
C-alpha (wavy bond to the backbone) drawn by RDKit from the SMILES in `ptm-structures.tsv` (also in each `<g data-smiles>`),
at one bond length, 120 degree angles, explicit charges (guanidinium and ammonium +, phosphate 2-); the methyl groups or the
phosphate take the site's light accent. Each logo is one family: a tile in the site's band, a white lens with the accent as its
glass and the mark (R, K, P) in it. The older hand-drawn text below describes the first versions.

The methyllysine drawing (Kme1, Kme2 and Kme3: a lysine side chain with one, two or three methyl groups on the ε-amine,
in the style of the methylarginine drawing) and its icon (the same magnifying glass in the site's purple) are drawn for
the Methyllysine Site Explorer (`methyllysine-hero.svg`, `methyllysine-icon.svg`).

The phosphosite drawing (phosphoserine, phosphothreonine and phosphotyrosine: the side chains -CH2-O-PO3(2-), -CH(CH3)-O-PO3(2-)
and -CH2-C6H4-O-PO3(2-), in the style of the methylarginine drawing, with the phosphate in cyan) and its icon are drawn for the
Phosphosite Explorer (`phospho-hero.svg`, `phospho-icon.svg`).

The lysine modification drawing (acetyllysine Kac, and the isopeptide bonds of ubiquitin, Kub, to Gly76 and of SUMO to its
C-terminal Gly, drawn as -NH-CO-CH2-NH-Ub and -SUMO, the Gly and the bond in the site's light lime) and its logo (the lens with a
K, in the site's deep green band) are written by the same tool from the SMILES in `ptm-structures.tsv`
(`lysine-hero.svg`, `lysine_logo.svg`).
