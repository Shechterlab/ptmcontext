# Changes

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
