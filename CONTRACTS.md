# Contracts

Seven plain-data formats. Code on either side of a contract can change freely; a contract changes only with its
`schema_version`, and every file is checked against its schema before it is used.

| Contract | Format | Schema | Written by | Read by |
|---|---|---|---|---|
| **Mark profile** | YAML | `ptmcontext/schemas/profile.schema.json` | a person | the layers (motifs), the tests (residues, words) |
| **Site** | YAML | `ptmcontext/schemas/site.schema.json` | a person | `ptmc run` |
| **Input manifest** | JSON | `ptmcontext/schemas/inputs.schema.json` | `ptmc stage`, `ptmc inputs record` | every build |
| **Unit table** | TSV | `ptmcontext/schemas/units.schema.json` | stagers, other repositories | the layers |
| **Statistics row** | TSV | `ptmcontext/schemas/statistics.schema.json` | every test | releases, websites, parity |
| **Set families** | YAML | `ptmcontext/schemas/set_families.schema.json` | a person (a site's own data file, `sites/data/`) | protein-set questions that gather sets into families |
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
- `enricher` on sets of another identifier (`identifiers`: Entrez genes, say): each of the site's proteins is mapped
  to it through the tables the site file names, in turn, and `a, b, c, d` count identifiers (the marked proteins'
  identifiers in the set, ...); the universe is the proteins' identifiers (`universe: snapshot`) or those in a set.
- `enricher` on sets gathered into families (`sets.families`): each set goes to at most one family by its name (a
  site's rules file, below) and a family holds the members of its sets; the background is still the universe's
  identifiers the source annotates, in any of its sets whether in a family or not.
- `enricher` on a table whose rows other tables keep (`sets.where`): a row is kept when the value in its column is the
  key of a row of the other table that the condition's `include` and `exclude` keep, every condition holding (CD-CODE's
  members of human proteins, through its protein table, in human condensates that are not synthetic, through its
  condensate table); on the protein column accessions are compared as entries. With `sets.history` (an accession
  history: `from` an old accession `to` the entry), a member that is a snapshot entry stays, one the history maps to
  exactly one entry becomes it, and any other is dropped, before the sets, the universe and the background are drawn.
- Rows are written by ascending p, then set name, unless the analysis names an `order` (`by` a row's `a, b, c, d,
  fold_enrichment, p, q` or `category`, `descending`), first key first, a tie keeping the order before. Fold enrichment
  is compared exactly, as the fraction a(a+b+c+d)/((a+b)(a+c)), so 4 of 6 and 14 of 21 tie. The stratified rows follow
  the `enricher` rows' order.
- `mantel_haenszel` on a protein-set analysis: the same 2×2 split by a protein covariate (PaxDb abundance decile, and
  `none` for proteins without a value); its `a, b, c, d` add up to the `enricher` row's. For sets of another
  identifier, an identifier takes the highest value of the proteins that map to it (`combine: max`), and the deciles
  are those of the background's identifiers.
- `q`: Benjamini–Hochberg within (analysis, method).
- An effect is reported at q ≤ 0.05 and at least 1.1× either way.

## Set families

A site's curated vocabulary for gathering the sets of a protein-set table into families by name (DisGeNET terms into
disease families, say), as data: `schema_version`, `lists` (in order of precedence, each a `name` and its `families`,
each a `family` and `match`, a list of Python regular expressions), and optionally `overrides` (exact names placed
before any rule: `{name, family}`, `family: null` for none), `case_sensitive` (default false), `title`, `source` and
`note`s. A name takes the family of the first rule it matches, list by list (a later list sees only the names no earlier
list places); a name nothing places is in no family and is not tested. A family is in one list only. An analysis names
the file (`sets.families.rules`, relative to the site's repository), the column whose names the rules read (`by`), and
the lists whose families it tests (`lists`; default every list); the run records the file's MD5.

## Unit table

`unit_id, accession, start, end, kind, source`, then the unit's own columns. 1-based, inclusive, on the snapshot's
sequences. Domain units add `subtype` (domain, repeat), `ref` (the source's accession), `label` (its name) and
`members` (member-database accessions).

## Marks

Any TSV with an accession column and a position column; the site file names them and selects rows with `include` and
`exclude` conditions (`equals`, `in`, `contains`). Positions must be on the snapshot's sequences. `marks.add` appends the rows of
further tables (each its manifest `input`, with its own `include`, `exclude` and `left_out`: rows counted on neither side).
A site's `variants` run the same questions on other marks: each has a `label`, tables to add (`marks_add`) and its own
`reference`; `ptmc run --variant <name>` writes it under `<outputs.folder>/variants/<name>` and records `variant` in run.json.

`marks.attributes` keeps columns of the marks table for the website only (no test reads them): each has a name
(letters, digits and `_`), its `column`, a `label`, a `kind` (`category`, `list` or `number`), and optionally the
`separator` of a list (default `; `), display names for its `values`, a `link` (another column, aligned item by item,
and a URL with `{}`, as each study to its DOI), `records` (a value that is a database, linked to its own record of the
protein: a URL with `{acc}`), `colours`, `colour` (the map and Sites tab may colour by it), `filter`, `control`
(`chips`, or `select` for many values) and `help`. `present: true` makes the value whether the column holds anything
(`yes` or `no`: "changed in tumours" over a column of changes); `pair_with` names a second list column in step with the
first, and each value becomes `<value>:<its partner>` (a perturbation and its call; lists of different lengths are an
error). A mark on several rows takes the first kept row's values.

## Input manifest entries

`file, md5, source, version, licence` (required), `role` (`input` or `reference_output`), `note`, and two optional
fields: `columns`, a column mapping for a file no reader knows (intervals: `accession, start, end`, and `label, ref,
subtype, class`; per-residue values: `accession, position, value`; `include`/`exclude` conditions; `kind`; `sep`), and
`record`, the source's own page for a protein (a URL with `{acc}`). A table a protein-set question reads that is not
tab-separated says so with `columns: {sep: ","}` alone; every table of a protein-set question is read with it.

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
| `tracks.json` | per kind of drawn unit | `{kind, title, style, help, roles, analysis, colours?, values?}`: `style` is `domains` (boxes on the backbone), `disorder` (the backbone's wave) or `segments` (a row of boxes); `analysis` names the question whose classes colour it; `values`, for a kind whose units carry numbers (a layer's `Track.values`), is `{table, columns: [{name, label, help}]}` |
| `units_<kind>.tsv` | one per unit of a kind with `values`, on a protein with a mark | `accession, start, end, length, class`, the value columns (up to 6 significant digits, empty for missing), `marks` (the counted marks inside) and `other_candidates` (the other candidate residues inside; left-out marks on neither side, as the tests count them). The IDR charge layer writes `units_idr.tsv`: each IDR with `f_plus, f_minus, fcr, ncpr, kappa, region` (its Das–Pappu region, 1 to 5; `class` r1 to r5) |
| `protein_sets.json` | per protein-set question | `{N, marked_in_background, sets: {set: {M, marked}}, identifiers?, covariate?, marked_in_any?, filter_sets?, scores?}`: the background size, its marked proteins, and each tested set's size and marked proteins; for the Filters panel, the marked proteins in any of the source's sets (`filter.any`), the untested sets holding a marked protein with their names (`filter.sets: all`) and, with a `scores` table, `{label, help, levels, max, sets: {set: {protein: score}}, any: {protein: best score}}` over the marked proteins (no test reads these); with an abundance input, `covariate: {input, value, strata, proteins: {accession: [value, decile]}}` for the marked proteins, the deciles the stratified test used; for sets of another identifier, `marked_in_background`, `marked` and the covariate's keys are identifiers, and `identifiers: {noun, nouns, proteins: {accession: [identifier]}}` gives each marked protein's identifiers in the background; absent when the site has no protein-set question |
| `set_names.tsv` | per set | `analysis, set, name` |

`ptmc web` turns these into `data/p/NN.json` (64 shards of protein records: marks with their classes and attributes,
units as `[kind, start, end, label, source index, class, ref]`) and `data/selection.json`: `analyses`, `classes` and
`attributes` (the distinct values, which the rows code by index), `attribute_names` (their order), `attribute_links`,
`marks` (`[protein index, position, [class codes per analysis], [attribute codes per attribute], window]`), `others`
(per analysis, protein and class: the other candidate residues), `others_total` (per protein: candidates − marks) and
`protein_sets` (from `protein_sets.json`; for sets of another identifier, members are coded by index into its `ids`,
with `of`, each marked protein's identifiers, and `unit`, their name in the plural, so a selection is tested on its
proteins' identifiers; `any`, `more: [[set, [proteins]]]` and `scores` serve the filters: `p:<analysis>` takes a set or
`*` (in any set), and `s:<analysis>` a score threshold, which then counts the memberships scored at least that); and,
when a track has `values`, `data/units.json`: by kind, `{columns, classes, rows}`, a row
`[protein index, start, end, class code, the values (null for missing), marks, other_candidates]`. A track whose values
include `fcr` and `ncpr` gives the site an IDRs page (`kit-idrs.js`). The one-file copy inlines them when they fit.
