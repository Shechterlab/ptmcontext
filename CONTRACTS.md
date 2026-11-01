# Contracts

Six plain-data formats. Code on either side of a contract can change freely; a contract changes only with its
`schema_version`, and every file is checked against its schema before it is used.

| Contract | Format | Schema | Written by | Read by |
|---|---|---|---|---|
| **Mark profile** | YAML | `ptmcontext/schemas/profile.schema.json` | a person | the layers (motifs), the tests (residues, words) |
| **Site** | YAML | `ptmcontext/schemas/site.schema.json` | a person | `ptmc run` |
| **Input manifest** | JSON | `ptmcontext/schemas/inputs.schema.json` | `ptmc stage`, `ptmc inputs record` | every build |
| **Unit table** | TSV | `ptmcontext/schemas/units.schema.json` | stagers, other repositories | the layers |
| **Statistics row** | TSV | `ptmcontext/schemas/statistics.schema.json` | every test | releases, websites, parity |
| **Citation** | YAML (CITATION.cff 1.2.0) | [citation-file-format.github.io](https://citation-file-format.github.io/) | a person | every page and download; GitHub and Zenodo read it too |

## Statistics row

The columns, their order and their formatting are those of the Methylarginine Site Explorer's
`statistics_<version>.tsv`, unchanged: `analysis, category, stratum, a, b, c, d, odds_ratio, log2_odds_ratio,
fold_enrichment, log2_fold_enrichment, p, q, method, background, n_strata, odds_ratio_ci_low, odds_ratio_ci_high`.
Integers without decimals, numbers in up to 6 significant digits, empty for missing.

Conventions:

- `fisher`: pooled 2x2 test; Haldane–Anscombe odds ratio (0.5 added to each cell), two-sided Fisher p.
- `mantel_haenszel`: each protein a stratum; Mantel–Haenszel odds ratio, Robins–Breslow–Greenland 95% CI, the
  continuity-corrected CMH statistic floored at 0 (a count within 0.5 of its expectation gives p = 1).
- Both count the same marks: those on a protein with at least one other candidate residue.
- `enricher`: protein-set tests (clusterProfiler's `enricher`). `a, b, c, d` are k, n − k, M − k and N − M − n + k
  (marked proteins in the set; other marked proteins; other proteins in the set; the rest of the background). One-sided
  hypergeometric p; `fold_enrichment` (k/n)/(M/N). The background is the universe's proteins in at least one set, or
  the whole universe if the site says so. Sets with no marked protein, or outside the site's sizes, are not tested.
- `mantel_haenszel` on a protein-set analysis: the same 2×2 split by a protein covariate (PaxDb abundance decile, and
  `none` for proteins without a value); its `a, b, c, d` add up to the `enricher` row's.
- `q`: Benjamini–Hochberg within (analysis, method).
- An effect is reported at q ≤ 0.05 and at least 1.1× either way.

## Unit table

`unit_id, accession, start, end, kind, source`, then the unit's own columns. 1-based, inclusive, on the snapshot's
sequences. Domain units add `subtype` (domain, repeat), `ref` (the source's accession), `label` (its name) and
`members` (member-database accessions).

## Marks

Any TSV with an accession column and a position column; the site file names them and selects rows with `include` and
`exclude` conditions (`equals`, `in`, `contains`). Positions must be on the snapshot's sequences.
