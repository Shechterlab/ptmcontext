"""ptmcontext: one proteome background, many units and marks.

snapshot      the reference sequences (UniProt release, MD5)
profile       a mark's residues, states, enzymes, motifs and words, as data (a mark file, sites/marks/<mark>.yaml)
units         regions of proteins as rows: disordered regions, IDRs, domains, flanks, sites
layers        annotations on residues (built in, or plugins from trusted packages)
residue_tests is a mark over-represented in a class of residues, pooled and within protein
statistics    the one table every test writes into
inputs        the manifest every input file is checked against
"""

__version__ = '0.1.0'
