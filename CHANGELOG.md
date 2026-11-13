# Changes

## Unreleased

What changed for readers:

- Protein map: every phosphosite is drawn at first (FUS showed "Phosphosites (0)" while 27 sites were listed); the functional
  score cut (0.5 or more) is an option, and its label says how many of the sites it keeps.
- Site switcher: the protein page that is open goes with you when the other site has that protein; otherwise you land on its
  Overview. The menu's links are real addresses (they open in a new tab).
- Every site's header and sticky bar link back to the landing page; the landing page has a search for a gene or UniProt
  accession that lists the sites with that protein and links to each protein page.
- The gene-list chip no longer shows double commas; Escape closes the Rows menu and returns the focus to its button.
- AlphaFold DB complexes are asked for at once only where the site's tables name a predicted partner, else on request (the
  lookup answers 404 for most proteins); an Ensembl homology request the service refuses reads as "no ortholog".
- The site card's rows are in folds: the site, its questions and its sources open; more questions and other attributes closed.
- The histone question's filter says how many marked proteins are in none of its sets (no entry in the source table).
- Phosphosite protein map: "Color phosphosites by" offers the kinase motif class.
- Phone protein map: more width for the tracks.

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
