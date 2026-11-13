# Changes

## Unreleased

- New Network tab (all four sites): the proteins with sites as one network, with STRING physical links and curated
  Complex Portal complexes as edges, grouped into Louvain clusters, each named by its most enriched GO biological process
  (q on hover; a menu names them by Reactome pathway instead). A GO term counts only if it lies at least three steps below
  the root, annotates 5 or more and at most 20% of the network's proteins, and rests on evidence other than IEA; the
  smallest q wins, and equal q goes to the deeper term. Long names are shortened in the figure only.
  Colour by cluster or by the share of sites in disordered regions, the domain class, and (phosphosites) the kinase and
  reader motif classes. A selection is clustered again in the browser. Table view, SVG, PNG and TSV exports, a
  tile on the Overview. For the code: `website.network` (schema, CONTRACTS.md, `ptmcontext/web/network.py`,
  `kit-netcore.js`, `kit-network.js`). The sites read PTM_Pipeline at commit 4557062 (the merge of its pull request 24), which stages
  the GO biological process tables (`inputs/annotation/go_bp_human_2026-11-04.tsv` and `go_bp_terms_2026-11-04.tsv`; GO
  Consortium, Genetics 224:iyad031 (2023), doi:10.1093/genetics/iyad031; Ashburner et al., Nat Genet 25:25 (2000),
  doi:10.1038/75556; CC BY 4.0); the CI and Pages checkouts are pinned to it.
- The Network figure is laid out in groups: every cluster has a region of its own, clusters of look-alike colours are
  kept apart, links between clusters are drawn as one band per pair, names sit beside the regions in a short form, and
  hovering a protein or a cluster lights what it is joined to. The default figure is laid out when the site is built; a
  phone gets its own portrait layout with numbered badges and a list. A Clusters menu asks for a number of clusters. A GO term
  must also annotate at most 1,500 proteins of the proteome to name a cluster. The exports (slide, or paper at 180 mm)
  carry a title that is a claim, one sentence, a key and a short credit; commit, file names and address stay in the file's
  metadata. Cluster slot 6 is now a brown.

## 0.3.1 (2026-11-13)

What changed for readers:

- All sites read PTM_Pipeline v1.5.0 at commit 5fadf74, whose SUMOylation and ubiquitination tables add two proteome-wide
  mass-spectrometry studies as sources of their own: Hendriks et al. 2017 (SUMO-2 sites in HeLa and U2OS cells; 48,593
  SUMOylation rows instead of 39,633) and Akimov et al. 2018 (UbiSite, Hep2 and Jurkat cells; 125,771 ubiquitination rows
  instead of 123,932). The "near SUMOylation" and "near ubiquitination" questions of the methylarginine, methyllysine and
  phosphosite sites change with them; their citations name both studies.
- Lysine site: Hendriks 2017 and Akimov 2018 are in the Databases filter, with their cell lines (filters) and localization
  probabilities (on the site card), so SUMO or ubiquitin sites can be seen without CPLM 4.0. The same-lysine pairs are
  also asked with the SUMOylation sites of Hendriks 2017 and the ubiquitination sites of Akimov 2018 alone, shown as a
  second line under each pair's tile. The header counts sources, five now.
- The line under a pair tile reads like the tile itself: "Among lysines with another modification: 2.5×, q 1.8e-261".
- The Overview opens with its question, color key and test switch, then the sections in the sidebar's order; on the lysine
  site the same-lysine pairs follow the cell directly. The lysine Overview shows each question once, for all types
  together; the per-type versions (chromatin, histones, protein classes, disorder and the rest) stay on each question's page,
  which links to them, in All tests and in the downloads.
- An address with a leading slash, such as `#/protein/P68431` or `#/protein/H3C1`, opens the protein page.

For the code: an Overview card's `beside` may be a list of lines; a question's page links to the other questions of its
`family`; `tools/audit/links.js --budget MINUTES` stops starting pages after that time and lists the rest, `--verbose`
prints each break as found, and a SIGTERM writes the report so far; the tests workflow's link audit sets workers and a
budget per site (two workers for the lysine site).

## 0.3.0 (2026-11-12)

What changed for readers:

- A fourth site, the Lysine Modification Explorer: human lysine acetylation, other acylations (crotonylation,
  2-hydroxyisobutyrylation, succinylation, malonylation and others), ubiquitination and SUMOylation sites from UniProt,
  iPTMnet and CPLM 4.0, each lysine compared with the other lysines of its protein, for all types and for each type with
  at least 200 lysines. It is on the landing page and in the site menu of every site.
- On the lysine site's Overview, the "same lysine, different modifications" pairs (acetylation and ubiquitination,
  acetylation and SUMOylation, ubiquitination and SUMOylation, and each with methylation) come right after the cell maps.
  Each pair is also tested among lysines with another modification only (a type other than the two compared, methylation
  included), still within each protein, because mass spectrometry finds some lysines far more often than others; the
  result is shown beside the pair's own and is in the statistics download.
- All sites read PTM_Pipeline v1.5.0 at commit e1852ba, whose acetylation and acylation tables now include CPLM 4.0
  (53,177 acetylation sites instead of 4,597; 15 other acyl types). The "near acetylation" and "near other acylation"
  questions of the methylarginine, methyllysine and phosphosite sites change with them.
- The protein map opens with an "All modifications" block: a thin lane for each modification with its short name (Kme,
  Rme, Sph/Tph/Yph, Kac, Kub, Ksu, ...); on the lysine site each lysine modification has its own lane. The grey UniProt row
  of other modifications starts off.
- The cell and nucleus maps on a protein page name every compartment: found here, not found here, or not tested. The
  line under them reads "Found in".
- Table cells break at spaces, never inside a word. Reader-facing wording is plainer throughout.

For the code: `only_in: {marks: [ids]}` counts only the residues some marks are reported on (`site` for the site's own
marks, a context mark or a part of the marks); a residue question's `background` names its rows' background; an Overview
card's `beside: {analysis, label}` shows another question's result on the tile; `combined_marks.split` gives the site's
own marks a lane for each value of an attribute; `marks.add[].set` and `marks.parts` make one marks table of several
kinds. The Pages workflow builds each site in its own job and then assembles them; the tests workflow runs lint, tests
and the link audit of each site side by side.

## 0.2.0 (2026-11-11)

What changed for readers of the three sites (methylarginine, methyllysine, phosphosites):

- The methyllysine and phosphosite sites read PTM_Pipeline v1.5.0 at commit bdb5b86.
- Each statistic row on the methyllysine and phosphosite sites says "each protein analyzed separately" and "with each
  abundance decile analyzed separately" instead of "a stratum". The methylarginine site keeps the v1.4.3 wording.
- Protein map row labels that do not fit wrap onto two lines instead of ending in "…", on the page and in exports.
- The citation and licence notes state only the source, the citation, the DOI and the licence of each input.

For the code: the export audits (text overlap, legends) run in `tests.yml`, one job per site, so a Pages deploy no
longer waits for them. A mark profile can set `words.within_protein`.
