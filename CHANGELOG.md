# Changes

## 0.2.0 (2026-11-11)

What changed for readers of the three sites (methylarginine, methyllysine, phosphosites):

- The methyllysine and phosphosite sites read PTM_Pipeline v1.5.0 at commit bdb5b86.
- Each statistic row on the methyllysine and phosphosite sites says "each protein analyzed separately" and "with each
  abundance decile analyzed separately" instead of "a stratum". The methylarginine site keeps the v1.4.3 wording.
- Protein map row labels that do not fit wrap onto two lines instead of ending in "…", on the page and in exports.
- The citation and licence notes state only the source, the citation, the DOI and the licence of each input.

For the code: the export audits (text overlap, legends) run in `tests.yml`, one job per site, so a Pages deploy no
longer waits for them. A mark profile can set `words.within_protein`.
