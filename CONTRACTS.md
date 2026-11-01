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

`marks.attributes` keeps columns of the marks table for the website only (no test reads them): each has a name
(letters, digits and `_`), its `column`, a `label`, a `kind` (`category`, `list` or `number`), and optionally the
`separator` of a list (default `; `), display names for its `values`, a `link` (another column, aligned item by item,
and a URL with `{}`, as each study to its DOI), `records` (a value that is a database, linked to its own record of the
protein: a URL with `{acc}`), `colours`, `colour` (the map and Sites tab may colour by it), `filter` and `help`. A mark
on several rows takes the first kept row's values.

## Input manifest entries

`file, md5, source, version, licence` (required), `role` (`input` or `reference_output`), `note`, and two optional
fields: `columns`, a column mapping for a file no reader knows (intervals: `accession, start, end`, and `label, ref,
subtype, class`; per-residue values: `accession, position, value`; `include`/`exclude` conditions; `kind`; `sep`), and
`record`, the source's own page for a protein (a URL with `{acc}`).

## What `ptmc run` writes for the website

`run.json` keeps, for each residue question, its layer, origin (`ptmcontext`, or a plugin's package and version), its
parameters (`with`) and its words (`shape, title, describe, labels, help, question, sub, section, needs`), so the
website needs no layer code.

Beside `statistics.tsv` and `run.json`, in `out/<site>/`:

| File | Rows | Columns |
|---|---|---|
| `marks.tsv` | one per counted mark | `accession, position, residue, window_15`, one column per residue question (its class; motifs `;`-joined), then `a.<attribute>` (and `a.<attribute>.link`) |
| `protein_counts.tsv` | (protein, analysis, class) | `accession, analysis, category, marks_in, others_in, marks_total, others_total` |
| `proteins.tsv` | one per protein with a mark | `accession, gene, name, entry, length, sequence_md5, marks, candidates` |
| `units.tsv` | one per drawn unit | `accession, kind, start, end, label, source, class, ref` |
| `tracks.json` | per kind of drawn unit | `{kind, title, style, help, roles, analysis, colours?}`: `style` is `domains` (boxes on the backbone), `disorder` (the backbone's wave) or `segments` (a row of boxes); `analysis` names the question whose classes colour it |
| `protein_sets.json` | per protein-set question | `{N, marked_in_background, sets: {set: {M, marked}}}`: the background size, its marked proteins, and each tested set's size and marked proteins; absent when the site has no protein-set question |
| `set_names.tsv` | per set | `analysis, set, name` |

`ptmc web` turns these into `data/p/NN.json` (64 shards of protein records: marks with their classes and attributes,
units as `[kind, start, end, label, source index, class, ref]`) and `data/selection.json`: `analyses`, `classes` and
`attributes` (the distinct values, which the rows code by index), `attribute_names` (their order), `attribute_links`,
`marks` (`[protein index, position, [class codes per analysis], [attribute codes per attribute], window]`), `others`
(per analysis, protein and class: the other candidate residues), `others_total` (per protein: candidates − marks) and
`protein_sets` (from `protein_sets.json`). The one-file copy inlines both when they fit.
