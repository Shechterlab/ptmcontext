# Contracts

Nine plain-data formats, and the tables the protein pages show (at the end). Code on either side of a contract can change freely; a contract changes only with its
`schema_version`, and every file is checked against its schema before it is used.

| Contract | Format | Schema | Written by | Read by |
|---|---|---|---|---|
| **Mark profile** | YAML | `ptmcontext/schemas/profile.schema.json` | a person | the layers (motifs), the tests (residues, words) |
| **Site** | YAML | `ptmcontext/schemas/site.schema.json` | a person | `ptmc run` |
| **Input manifest** | JSON | `ptmcontext/schemas/inputs.schema.json` | `ptmc stage`, `ptmc inputs record` | every build |
| **Unit table** | TSV | `ptmcontext/schemas/units.schema.json` | stagers, other repositories | the layers |
| **Statistics row** | TSV | `ptmcontext/schemas/statistics.schema.json` | every test | releases, websites, parity |
| **Set families** | YAML | `ptmcontext/schemas/set_families.schema.json` | a person (a site's own data file, `sites/data/`) | protein-set questions that gather sets into families |
| **Per-mark table** | TSV (any columns; the site file names its key and the columns kept) | `marks.tables` in `ptmcontext/schemas/site.schema.json` | a source, another repository, a user | the website's count questions (`website.counts`) |
| **Map rows** | TSV in any layout, mapped to the format's columns in the site file | `ptmcontext/schemas/site.schema.json` (`website.protein.map.rows`) | a backend's release, or a person | `ptmc run` (map_items.tsv), the protein map |
| **Set hierarchy** | TSV | below (`hierarchy:` in the site schema) | an ontology's export, a person | the website's views of an ontology question |
| **Published set results** | TSV (any columns) | below (`reference.tables` in the site schema) | a release, another pipeline | the parity check of one protein-set question |
| **Citation** | YAML (CITATION.cff 1.2.0) | [citation-file-format.github.io](https://citation-file-format.github.io/) | a person | every page and download; GitHub and Zenodo read it too |
| **Structure evidence** | TSV, columns named in the site file | `website.protein.structure` in `ptmcontext/schemas/site.schema.json` | a release, a lab, any table mapped to it | the protein page's 3D viewer (`kit-3d.js`) |
| **Conservation across species** | none (read live) | `website.protein.conservation` in `ptmcontext/schemas/site.schema.json` | any site | the protein page's conservation card and the selection's logo (`kit-conserve.js`) |

## Statistics row

The columns, their order and their formatting are those of the Methylarginine Site Explorer's
`statistics_<version>.tsv`, unchanged: `analysis, category, stratum, a, b, c, d, odds_ratio, log2_odds_ratio,
fold_enrichment, log2_fold_enrichment, p, q, method, background, n_strata, odds_ratio_ci_low, odds_ratio_ci_high`.
Integers without decimals, numbers in up to 6 significant digits, empty for missing.

Conventions:

- `fisher`: pooled 2x2 test; Haldane–Anscombe odds ratio (0.5 added to each cell), two-sided Fisher p.
- `mantel_haenszel`: each protein a stratum; Mantel–Haenszel odds ratio, Robins–Breslow–Greenland 95% CI, the
  continuity-corrected CMH statistic floored at 0 (a count within 0.5 of its expectation gives p = 1).
- Both count the same marks: those on a protein with at least one other candidate residue, unless the analysis counts
  them all (`marks_alone: count`: a protein with marks only adds to `a` and `b` of both, and nothing to the
  within-protein odds ratio or test, its table not being informative). An analysis may count only the marks and
  candidate residues of the proteins a table lists (`proteins:`; its `label` is added to the pooled rows' background).
- Rows are in the order the analysis gives (`order:`, a list of categories), else: pooled residue rows by odds ratio,
  within-protein rows by category, protein-set rows by p.
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
  the `enricher` rows' order. A key `{categories: [...]}` puts the rows of those categories first, in its order (a
  residue question takes the same keys).
- `enricher` on sets made by rules (`sets.rules`): each row of a table goes to the set of the first rule whose
  conditions all hold for it (`equals`, `in`, `contains` on text; `at_least` and `below` on a column's number or the
  `ratio` of two columns, missing where the second is 0 or empty; a rule without conditions takes every row left);
  the source annotates every protein of the table's rows.
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

## Maps of the cell and numbers per protein (website blocks)

Two website blocks read only what protein-set questions already write, so any site whose maps or numbers come as
protein-set tables gets them with no code (`ptmc check` names what they get wrong; `tests/test_cell_and_values.py`).

**`website.cell`** (kit-cell.js): several maps of the cell as one question, its address `#overview/<id>`.
- `maps`: each `{analysis, regions?, name, short?, method?, cells?, how?, ref?, doi?, url?, licence?, min_members?}`; `analysis`
  is a protein-set question whose sets are the map's compartments, `regions` (optional) another whose sets are the same
  map's regions. The grids' columns, in order. A map tested within abundance strata (`abundance:`) is compared within them
  (its `mantel_haenszel` rows); one without, by its fold enrichment.
- `regions`: rows `{label, set? (default label), part?, name?, in_text?}`, the sets of each map's regions question.
- `compartments`: groups `{group, rows}`, each row `{label, sets: {analysis: set}, part?, also?, name?, in_text?}`: the
  set it is in each map; the part of the drawings it colours, and `also` the parts it colours when they have no row of
  their own; its name on the drawings (default label) and inside a sentence (default lower case).
- `drawings`: `[{drawing, title?}]`, the kit's drawings shown. Their parts are `ptmcontext/config/cell_drawings.json`
  (geometry only: `cell` has cytosol, microtubules, actin, pm, er, ribosomes, nucleus, golgi, mito, endolyso, perox,
  granules, pbodies, centrosome; `nucleus` has nucleoplasm, chromatin, periphery, perinucleolar, nucleolus, speckles,
  paraspeckles, pml, cajal, bodies, envelope, pores). A part no row colours is drawn outlined and not labelled; what a
  part is called on a page is the row's name, never the kit's.
- A part (and a region, on the tile) takes the median log2 odds ratio of the maps that have it; it is coloured when at
  least half of them differ that way (q ≤ 0.05 and 1.1× or more), grey otherwise.
- `title, question, intro, note`: words.

**`website.set_views`** (kit-values.js): a protein-set question drawn with its proteins' numbers. Each `{analysis,
meter?, meter_words?, population?, intro?, box?: {value, title?, sub?, axis?}, caveat?, chips?: [{title, note?, value? |
share?: [column, column], sets?, order?, max?}], residue?, credit?}`: the set whose share the tile shows, a column drawn
as box plots and compared (Mann–Whitney; the set's share by Fisher's test), lists of the proteins with the lowest or
highest number or share of two columns (within some sets), and a residue question shown with it. The analysis names its
numbers with **`values`**: `{input? (default the sets' table), protein? (default the sets' protein column), columns:
[name | {name, label?, help?, background?}], include?, exclude?}`, each protein's first row; a column with `background:
true` also keeps every other background protein's number. No test reads them.
## Set hierarchy

For a protein-set question whose sets form an ontology (each set holding the members of the sets under it, as the
Disease Ontology's gene sets do), a table with one row per set: a column of set ids, as the sets table names them, and a
column of each set's parents (ids joined by `separator`, default `;`; spaces around ids are ignored; empty for the root).
Any other column is ignored. The question names it with `hierarchy: {input: <role>, set: <column>, parents: <column>,
separator, root: <id>}`; `root` (optional) is the set every other lies under. No test reads it: the run keeps each
tested set's parents among the tested sets (`protein_sets.json`, `parents` and `root`), and the website draws the
question's most specific sets, its tree and its table from them. A question without one is shown as a plain list.

| column | type | required | meaning |
|---|---|---|---|
| (set) | string | yes | the set's id, as in the sets table (`DOID:332`) |
| (parents) | list of strings | yes | its parents' ids (`DOID:0050155;DOID:231`), empty for the root |

A set's own page (`link`, a URL with `{}` for the set's id) is linked wherever the website names the set.

## Published set results

A question whose rows a release keeps outside its statistics table (in a supporting table) is checked against that
table: `reference.tables.<question>: {input, columns, sep, rows}` in the site file (or in a variant's `reference`). The
table may have any layout: `columns` names its column for each value, so a release's own headers, clusterProfiler's or a
user's are mapped in the site file, never in code.

| value | `columns` key | required | compared as |
|---|---|---|---|
| the set's id | `set` | yes | text, stripped |
| marked members in the set (k) | `a` | yes | integer |
| the set's size in the background (M) | `M` | no | integer (a + c of the statistics row) |
| fold enrichment | `fold_enrichment` | yes | 6 significant digits |
| p | `p` | yes | 6 significant digits |
| q (Benjamini–Hochberg over the question's sets) | `q` | yes | 6 significant digits |

`rows` says which of the question's tested sets the table lists: `all` (default; the same sets), `enriched` (exactly
those at q ≤ 0.05) or `some` (each listed set is checked, the others are not). The run records each such check in
`run.json` (`parity.checked`, with `reference` naming the table); a question checked this way is not marked new.

## Unit table

`unit_id, accession, start, end, kind, source`, then the unit's own columns. 1-based, inclusive, on the snapshot's
sequences. Domain units add `subtype` (domain, repeat), `ref` (the source's accession), `label` (its name) and
`members` (member-database accessions).

## Marks

Any TSV with an accession column and a position column; the site file names them and selects rows with `include` and
`exclude` conditions (`equals`, `in`, `contains`). Positions must be on the snapshot's sequences. `marks.add` appends the rows of
further tables (each its manifest `input`, with its own `include`, `exclude` and `left_out`: rows counted on neither side).
A site's `variants` run the same questions on other marks: each has a `label`, tables to add (`marks_add`) and its own
`reference`, and `attributes` of the marks it adds; `ptmc run --variant <name>` writes it under
`<outputs.folder>/variants/<name>` and records `variant` in run.json, and `ptmc web --variant <name>` builds its website in
`<outputs.folder>/web/<name>/`. The site's own page lists the variants that have been run (`variants`: name, label,
description, href) and a variant's page names its way back (`variant.base`): a switch in the toolbar keeps the page and selection.

`marks.attributes` keeps columns of the marks table for the website only (no test reads them): each has a name
(letters, digits and `_`), its `column`, a `label`, a `kind` (`category`, `list` or `number`), and optionally the
`separator` of a list (default `; `), display names for its `values`, a `link` (another column, aligned item by item,
and a URL with `{}`, as each study to its DOI), `records` (a value that is a database, linked to its own record of the
protein: a URL with `{acc}`), `colours`, `colour` (the map and Sites tab may colour by it), `filter`, `control`
(`chips`, or `select` for many values) and `help`. `present: true` makes the value whether the column holds anything
(`yes` or `no`: "changed in tumours" over a column of changes); `pair_with` names a second list column in step with the
first, and each value becomes `<value>:<its partner>` (a perturbation and its call; lists of different lengths are an
error). A mark on several rows takes the first kept row's values.

`proteins` (optional) keeps facts of each marked protein for the website, from a table with one row per protein: its manifest
`input`, its `accession` column, and `attributes` as for marks (name -> {column, label, kind, ...}; `present` too). The run
writes `protein_attributes.tsv` (`accession`, then `p.<name>` per attribute, for every marked protein, empty where the table
has no row), and the page receives `protein_attributes: {specs, values: {name: [one value per protein of the list, numbers as
numbers]}}` (`K.proteinAttr(accession, name)`). The Overview's `starting_points` rank proteins by `marks` or a number
attribute (`lists: [{title, by, order, where: {attribute, max, min}, show, n, help}]`) and offer ready-made selections
(`quick: [{label, query, view}]`); a list whose attribute a site lacks is left out. A filter group's `proteins` lists
protein-level filters (key `r:<name>`): a number attribute with its `levels` and `direction` (at least, or at most, the
threshold, with an optional second condition `also`), a category's values, or `marks` (the protein's count of marks).

## Per-mark tables and count questions

A **per-mark table** (`marks.tables.<name>` in the site file) is any table with several rows per mark: one row per
mark and experiment, say. It names its mark one of two ways, as the site file's `key` says:

| `key` | The row's mark |
|---|---|
| `{marks: <column of the marks table>, table: <its column>}` | the mark whose marks-table row (the first kept, as for attributes) has the same value (a site id such as `P12345:R216`) |
| `{accession: <column>, position: <column>}` | the residue those columns give, on the snapshot's sequences |

and keeps the `columns` the site file lists, as text. Nothing else is required; any column may be empty. Rows for marks
the site does not count are dropped. Tab-separated, unless its manifest entry says `columns: {sep: ...}`. No test reads
it: it serves the website's count questions only.

A **count question** (`website.counts.<id>`) is answered by counting marks, not by a test, and needs no code:

- `kind: values` counts a `list` or `category` attribute of the marks (`attribute`): each value's marks; for a list,
  the marks with that value alone; and how many values each mark has, 1 to `bins` (default 5) or more, read from a
  `number` attribute (whose "at least" filter then serves the distribution's rows) or from the list's length.
- `kind: responses` is a table of experiments (`rows`, in order). Each row counts the marks it measured (`n`), those
  whose call is `calls.down` and those whose call is `calls.up` (a mark with several rows in the experiment is counted
  once, in each direction one of its rows has), and the median of a numeric `change` column over its marks (each
  mark's own median first). A row's calls come from a per-mark table (`table`, the rows where every `where: {column:
  value}` holds, the call in column `call`, default `call`) or from a paired list attribute (`attribute` with
  `pair_with`, the partner of the value `value`: `<value>:<call>`); its change only from a table. `listed: true` says
  the experiment lists only its changed marks, so its count is not a share. A row's id (`id`, default `value`, else
  the `where` values joined by `_`) names it in links and filters.

Its words (`title, question, sub, head, note, method`; a values count's `unit: [one, several]`, `noun`,
`distribution`, `two_or_more`; a responses count's `first` and `group` column headings and each row's `name, note, short, group,
kind`) come from the site file. The Overview places it by naming its id among the cards (`wide: true` spans two columns);
a header tile opens it with `opens: <id>`; `legacy_links` may name it. Its id may not be an analysis's or an
attribute's (the search reads `key:value` by those names); `ptmc check` names any attribute, table or column a count
names that the site file does not keep. A site without counts has none of this.

## Map rows

The protein map's own rows: evidence along a protein that no question tests (crosslinks, interfaces, changes in
tumours, dense windows, ...). One format serves three shapes; a table in any layout is mapped to it in the site file
(`website.protein.map.rows[].from[].columns`), so a release's table, a backend's export or a user's own file in the same
shape gives the same row:

| Field | Type | Required | Is |
|---|---|---|---|
| `accession` | string | yes | the protein (an entry of the snapshot; other accessions are left out) |
| `start`, `end` | integer | a region | 1-based, inclusive, on the snapshot's sequence; items outside it are left out |
| `position` | integer | a residue | instead of start and end |
| `class` | code | no | what the item is; the row's `classes` give each code its words, mark (`tick`, `box`, `pred`, `dot`, `diamond`, `named`) and colour, in drawing order, and items of other codes are left out. Several columns may be named: their values are joined with `:` (`dna_crosslink:candidate_residue`) |
| `label` | string | no | its words: a column, or a template naming columns, `{column}` or `{column:.2g}` for a number |
| `value` | number | no | a count or score: a per-site count (tumours carrying a change), partners at an interface; the row's `value` gives its words (`one`, `many`, with `{n}`), and may size ticks (`size`) or shade boxes (`opacity: [from, to]`) by it |
| `ref` | string | no | an accession of its own (an InterPro entry), linked by `config/ref_links.json` |
| `sources` | list (`; `) | no | the sources behind it; `website.protein.map.sources` gives each its words and paper (`cite`, `doi`) |

- a **per-residue list**: `accession`, `position`, and `class` or `label` (RNA-crosslinked residues);
- a **region list**: `accession`, `start`, `end`, and `class`, `label`, `ref` (fragments, binding regions, windows);
- a **per-site count**: `accession`, `position`, `label` and `value` (each change of a site and the tumours carrying it).

Options of a table: `role` (a role of `inputs:`, so the file is in a manifest) or `marks: true` (the marks table, its
accession and position by default); `include`/`exclude` conditions as for marks; `split`, a separator: cells of
`class`, `label`, `value` and `ref` holding lists in step become one item per entry (lists of different lengths are an
error); `values`, codes of a column in words (`{column: {code: words}}`); `sep` for a table that is not tab-separated.
A row may instead be found in each protein's sequence (`sequence: {motif, min, gap, label, strong}`: runs of at least
`min` matches of a regular expression, each within `gap` residues of the one before). A row whose data a protein lacks is
not drawn on it, and a site without rows has none.

`ptmc run` writes `map_items.tsv` (`accession, row, start, end, class, label, value, ref, sources`, for the proteins
with a mark); `ptmc web` splits it into `data/map/NN.json` (64 shards by the protein files' rule: `{accession: [[row
index, start, end, class, label, value, ref, sources], ...]}`, empty trailing fields left out) and names the rows in
order in the site data (`map_rows`).

## Input manifest entries

`file, md5, source, version, licence` (required), `role` (`input` or `reference_output`), `note`, and two optional
fields: `columns`, a column mapping for a file no reader knows (intervals: `accession, start, end`, and `label, ref,
subtype, class`; per-residue values: `accession, position, value`; lists of residues: `accession, position`;
`include`/`exclude` conditions; `kind`; `sep`), and `record`, the source's own page for a protein (a URL with `{acc}`).
A table a protein-set question reads that is not tab-separated says so with `columns: {sep: ","}` alone; every table of
a protein-set question is read with it.

## What `ptmc run` writes for the website

`run.json` keeps, for each residue question, its layer, origin (`ptmcontext`, or a plugin's package and version), its
parameters (`with`) and its words (`shape, title, describe, labels, help, question, sub, section, needs, ordered,
groups`), so the website needs no layer code.

A question's classes, as its chart and tiles show them:

| Field | Type | From | Meaning |
|---|---|---|---|
| `labels` | object, class code → label | the layer (or the profile's motif families; for protein sets `set_names.tsv`) | the class's name; its key order is the classes' own order |
| `help` | object, class code → text (optional) | the layer, the profile | the class's meaning, shown after its name ("RGG · Gly at +1 and +2") and in its hover |
| `ordered` | boolean (default false) | the site file's analysis (`ordered`), else the layer (`Layer.ordered`) | the classes keep the order of `labels` (from inside a domain outwards, the lowest bin up); otherwise they are sorted by effect, the sets that differ first, catch-all classes ("No …") and classes without a test last |
| `groups` | list of `{name, classes}` (optional) | the site file's analysis (`groups`), else the layer (`Layer.groups`) | headed groups of the classes, in order; a class in no group follows them under a rule. `ptmc check` reports a class a group names that the question does not have, or one in two groups |

Each row of the chart is a statistics row of the question and the test shown (`enricher` for a protein-set question):
its counts (`a / a+b`, the marks in the class of all marks; `c / c+d`, the other residues or proteins), its effect
(`odds_ratio` or `fold_enrichment`) with `odds_ratio_ci_low`/`high`, and `q`. A row with an empty odds ratio (no protein
has residues both in the class and outside it, so no within-protein test) is drawn with its counts and "—". For a
protein-set question with `mantel_haenszel` rows (within abundance deciles, `abundance:` in the site file), the value
carries that test's reading (✓ more, ≈ about the same, ○ no difference, ▼ fewer) where either test differs. With a
selection, the rows are its own, tested again in the browser, each with the whole dataset's value as a tick. A question
without labels, help, order or deciles simply shows less.

Beside `statistics.tsv` and `run.json`, in `out/<site>/`:

| File | Rows | Columns |
|---|---|---|
| `marks.tsv` | one per counted mark | `accession, position, residue, window_15`, one column per residue question (its class; motifs `;`-joined), then `a.<attribute>` (and `a.<attribute>.link`) |
| `protein_counts.tsv` | (protein, analysis, class) | `accession, analysis, category, marks_in, others_in, marks_total, others_total` |
| `proteins.tsv` | one per protein with a mark | `accession, gene, name, entry, length, sequence_md5, marks, candidates` |
| `units.tsv` | one per drawn unit | `accession, kind, start, end, label, source, class, ref` |
| `tracks.json` | per kind of drawn unit | `{kind, title, style, help, roles, analysis, colours?, values?}`: `style` is `domains` (boxes on the backbone), `disorder` (the backbone's wave) or `segments` (a row of boxes); `analysis` names the question whose classes colour it; `values`, for a kind whose units carry numbers (a layer's `Track.values`), is `{table, columns: [{name, label, help}]}` |
| `units_<kind>.tsv` | one per unit of a kind with `values`, on a protein with a mark | `accession, start, end, length, class`, the value columns (up to 6 significant digits, empty for missing), `marks` (the counted marks inside) and `other_candidates` (the other candidate residues inside; left-out marks on neither side, as the tests count them). The IDR charge layer writes `units_idr.tsv`: each IDR with `f_plus, f_minus, fcr, ncpr, kappa, region` (its Das–Pappu region, 1 to 5; `class` r1 to r5) |
| `protein_sets.json` | per protein-set question | `{N, marked_in_background, sets: {set: {M, marked}}, identifiers?, covariate?, marked_in_any?, filter_sets?, scores?}`: the background size, its marked proteins, and each tested set's size and marked proteins; for the Filters panel, the marked proteins in any of the source's sets (`filter.any`), the untested sets holding a marked protein with their names (`filter.sets: all`) and, with a `scores` table, `{label, help, levels, max, sets: {set: {protein: score}}, any: {protein: best score}}` over the marked proteins (no test reads these); with an abundance input, `covariate: {input, value, strata, proteins: {accession: [value, decile]}}` for the marked proteins, the deciles the stratified test used, and `counts: {codes, N, sets}`, the background's proteins in each stratum overall and in each set (from the lowest decile, then `none`); with `values`, `values: {columns, marked: {accession: [number or null per column]}, others: {column: sorted numbers}}` (columns with `background: true`); for sets of another identifier, `marked_in_background`, `marked` and the covariate's keys are identifiers, and `identifiers: {noun, nouns, proteins: {accession: [identifier]}}` gives each marked protein's identifiers in the background; absent when the site has no protein-set question |
| `protein_sets.json` | per protein-set question | `{N, marked_in_background, sets: {set: {M, marked}}, identifiers?, covariate?, marked_in_any?, filter_sets?, scores?}`: the background size, its marked proteins, and each tested set's size and marked proteins; for the Filters panel, the marked proteins in any of the source's sets (`filter.any`), the untested sets holding a marked protein with their names (`filter.sets: all`) and, with a `scores` table, `{label, help, levels, max, sets: {set: {protein: score}}, any: {protein: best score}}` over the marked proteins (no test reads these); with an abundance input, `covariate: {input, value, strata, proteins: {accession: [value, decile]}}` for the marked proteins, the deciles the stratified test used; for sets of another identifier, `marked_in_background`, `marked` and the covariate's keys are identifiers, and `identifiers: {noun, nouns, proteins: {accession: [identifier]}}` gives each marked protein's identifiers in the background; with a `hierarchy`, `parents: {set: [parent sets]}` (each tested set's parents among the tested sets) and `root`; for sets gathered into families, `gathers: {family: [set ids]}` (each tested family's own sets, which a website's table of member sets groups by); absent when the site has no protein-set question |
| `set_names.tsv` | per set | `analysis, set, name` |
| `marks_<name>.tsv` | per row of a per-mark table (`marks.tables.<name>`) on a counted mark | `accession, position`, then the columns it keeps (text), in the table's order; `run.json` records each table's rows read and kept (`mark_tables`) |
| `shown_marks.tsv` | one per residue `marks.left_out` (or a variant's `marks_add` `left_out`) keeps pending, on a protein of the snapshot, at a residue it has, and not itself a counted mark | `accession, position, residue, window_15`, then `a.<attribute>` (and `.link`) as `marks.tsv` (from the pending rows): shown on the website, never counted or tested. Header only where the site leaves nothing out |
| `shown_proteins.tsv` | one per protein of `shown_marks.tsv` with no counted mark | `accession, gene, name, entry, length, sequence_md5` |

`ptmc web` turns these into `data/p/NN.json` (64 shards of protein records: marks with their classes and attributes,
units as `[kind, start, end, label, source index, class, ref]`) and `data/selection.json`: `analyses`, `classes` and
`attributes` (the distinct values, which the rows code by index), `attribute_names` (their order), `attribute_links`,
`marks` (`[protein index, position, [class codes per analysis], [attribute codes per attribute], window]`), `others`
(per analysis, protein and class: the other candidate residues), `others_total` (per protein: candidates − marks),
`counted` (per residue question that counts only some proteins or every mark, from `run.json`: `skip`, the indices of
the marked proteins it leaves out, and `alone`, whether it counts the marks of a protein with no other candidate) and
`protein_sets` (from `protein_sets.json`; for sets of another identifier, members are coded by index into its `ids`,
with `of`, each marked protein's identifiers, and `unit`, their name in the plural, so a selection is tested on its
proteins' identifiers; a covariate's `counts` for the questions `website.cell` names, and `values` with their marked proteins coded by index; `any`, `more: [[set, [proteins]]]` and `scores` serve the filters: `p:<analysis>` takes a set or
`*` (in any set), and `s:<analysis>` a score threshold, which then counts the memberships scored at least that); and,
when a track has `values`, `data/units.json`: by kind, `{columns, classes, rows}`, a row
`[protein index, start, end, class code, the values (null for missing), marks, other_candidates]`. A track whose values
include `fcr` and `ncpr` gives the site an IDRs page (`kit-idrs.js`). The one-file copy inlines them when they fit.

With rows in `shown_marks.tsv`, each protein record gets `shown: [[position, window, [], [attribute values]]]` (laid out as
its `marks`, the values in the order of `mark_attributes`), each protein of `shown_proteins.tsv` a record of its own
(`marks: []`, `shown_only: true`), and the page data `shown_marks: {n, proteins: [[accession, gene, name, length,
entry]], rows: [[accession, position, window, [attribute values]]], counted_like}` (`counted_like`: the counted marks
that `website.shown_marks.counted.when` holds for) and `shown_view` (the site file's `website.shown_marks`). They are
not in `data/selection.json`, `counts`, or any test; the map draws them as hatched ticks, the protein page and the
Sites page (behind a toggle, on by default) list them with the tag, and the note gives the numbers
(`kit-shown.js`). A site without them gets none of these keys.

With `website.counts`, the page data carry `count_questions`: per count id, its words and the whole dataset's counts. A values
count: `{kind: 'values', attribute, list, number, top, bins, unit, noun, distribution, total, values: [[value, label,
marks, marks with it alone (null for a category), link id]] (most marks first), dist: [marks with 1 .. bins or more],
none, multi, two_or_more}` (`multi`: marks with two or more). A responses count: `{kind: 'responses', calls: {down, up}, first,
group, tables, attributes, rows: [{id, name, note, short, group, kind, listed, filter, n, down, up, median, changes}]}`,
where `filter` is the filter a row's click sets (`[t:<attribute>, <value>:<down>]`, or `[null, id]`: the count's own
filter `c:<count id>`, whose values are row ids, keeping each row's down marks). `data/selection.json` then holds
`count_questions: {<count id>: [per row: [[mark index, 1 if down + 2 if up, its change or null]]]}`, so a selection is counted
again in the browser (`kit-counts.js`).

## Tables the protein pages show

What a protein page shows beyond the marks and their questions (the site card's blocks, the sites table's columns and
Evidence rows, the citation box, a protein's light page) comes from tables in these formats. A site names each table
under `website.tables` with the manifest input it reads, its `format`, and `columns`, which maps each column of the
format to a column of the input (or to several, joined with `; `); `include` and `exclude` keep rows as elsewhere. The
release's own tables are one source of them (`sites/methylarginine.yaml` maps them); a site with other data maps its own
columns, and a block whose table a site does not name is absent. No test reads them. `ptmc check` names a column the
mapping or a block gets wrong (`site.card_problems`, `web.tables.problems`).

A **site** is named by one column, `<accession>:<residue><position>` or `<accession>:<position>` (`Q01844:R575`), or by
an `accession` and a `position` column; positions are on the snapshot's sequences (UniProt numbering, whatever the page
shows). Every value is text unless said otherwise; empty means not known. Lists are `; `-separated.

| Format | Key | Columns (required in bold) | Read by |
|---|---|---|---|
| `site_values` | site | any columns, listed under `values:` and kept under their own names | blocks naming a column: the methylation state by source, the counts beside a list of changes, the nearest domain, source positions |
| `site_table` | site | any columns, under `values:` | a table in a site's Evidence row (`card.tables`), each column labelled and formatted by the site file |
| `protein_values` | `accession` | `aliases` (other names a search or an old link may use), and any columns under `values:` | the whole-protein line of the card, a headline card's hover; `aliases` make `#TDP-43` and a search for an alias find the protein |
| `lookup` | `key` | any columns under `values:` | the sources of the citation box and of the card's links (`label`, `citation`, `doi`, `licence`) |
| `site_evidence` | site | **`kind`** (a code: the values of the card's evidence attribute), `partner`, `partner_accession`, `ids` (a list of entry ids, e.g. PDB), `score` (number), `detail` | the card's interaction evidence: the entries at the site by kind, the partners named in a tag |
| `bound_windows` | site | **`window`** (the bound chain around the contacted unit: one letter a unit, `[X]` a contacted unit, `-` past the chain's end), **`kind`** (a code: rna, dna, …), `type` (a code), `name`, `entry` (an id), `entries` (a count, for a row that stands for several), `distance` (Å), `offset` (k when the residue i + k makes the contact; empty or 0: the site), `preparation`, `chain`, `nucleotides`, `numbers`, `distances` (the contacted units, their author numbers and Å, lists in the same order) | the card's bound sequences, aligned on the contacted unit; the sites table's contacts column |
| `residue_evidence` | `accession` | **`start`**, **`end`** (integers; a residue: start = end), **`kind`** (a code), `source` | the card's line on evidence at or within `span` residues of the site (crosslinks, bound stretches) |
| `site_records` | site | **`group`** (a code: what the record shows), `partner`, `partner_name`, `partner_accession`, `partner_kind` (protein, self, rna, dna, gene, small_molecule, … : labels from the site file), `species`, `source` (PDB, IntAct, …), `id`, `method`, `context`, `state` (the site in the experiment: a code), `state_detail`, `other_marks`, `pubmed`, `doi`, `citation`, `title` | "Who binds it, and how it was found" (records grouped by `group`, rows by partner, state and source), the writer-and-reader lines, and on a protein without marks the records naming it as `partner_accession` |
| `site_measurements` | site | **`condition`** (a code), **`call`** (a code: the site file gives each a mark and words), `n`, `n_down`, `n_up` (counts), `value` (a log2 change), `q`, `rule` | the perturbation marks of the card and the sites table, and every measurement in the Evidence row |
| `source_records` | site | **`source`** (a code: a value of the site's provenance attribute), `doi`, `reference`, `pubmed` (ids), `source_table`, `peptide` (modifications in brackets after their residue: `GR(me)G`), `state`, `enzyme`, `sample`, `detail`, `reported_accession`, `reported_position`, `check` (a code: how the record was placed) | the Evidence row's source records, the site's residue marked in each peptide |
| `protein_partners` | `accession` | **`partner_accession`**, **`score`** (number), `partner`, `partner_marked` (true/false), `classes` (a list of codes) | the card's partners of some classes (`card.writer.partners`), and on a protein without marks the proteins with marks associated with it |

`ptmc web` keeps each protein's rows beside its page (`data/e/NN.json`, the shards of `data/p`), the rows that name a
protein without marks as a partner (`site_records`, `protein_partners`) on that protein's light page (`data/u/NN.json`,
with its name, length and sequence from the snapshot; `data/u/index.json` lists those proteins), and lookups in the
page's data (`D.lookups`); `D.tables` gives each table's format and columns. In a shard, a string seen twice or more is
written once (`_s`) and its places hold its index; positions, `start` and `end` are the only numbers.

The site card and the sites table read the site file's `website.protein.card` and `website.protein.table` for their
words: the codes' labels, the sentences, the marks of each call, which columns the Columns menu offers and which show
first. `website.protein.numbering` numbers some proteins as papers do (a gene or name pattern and an offset: histones
without their initiator methionine): their positions are shown and read in links with it.

## Conservation across species

A protein page can show each mark in the orthologues of other species, and a selection can show its marks' sequence windows
aligned and as a logo. Neither reads a table: the orthologues come live from Ensembl Compara, and the windows are the
motif finder's (`website.search.patterns`, which builds them from the snapshot sequences). A site without
`website.protein.conservation` lacks the card and the logo; `ptmc check` reports what the block misses.

```yaml
website:
  protein:
    conservation:
      ensembl: {rest: "https://rest.ensembl.org", xref: Ensembl, source: human}
      species: [{id: mus_musculus, label: Mouse}, {id: saccharomyces_cerevisiae, label: Yeast}]
      similar: [K]
      logo: true
```

- `ensembl.rest`: the REST address (https); `ensembl.xref`: the database in the protein's UniProt cross-references that
  names its Ensembl gene (the first one is used); `ensembl.source`: the query species' name in the homology endpoint;
  `ensembl.compara` (optional): the Compara set when the species are not vertebrates (`fungi` for yeast). Where Ensembl
  has no Compara set with suitable species for an organism, the site leaves the block out and has neither card.
- `species`: Ensembl species names with the label shown, in the order shown. For each, the orthologue with the highest
  identity is used, with Ensembl's pairwise protein alignment.
- `similar`: residue letters shown as a conservative change (they do not count as kept). Optional.
- `logo`: offer the selection's alignment and logo (needs `website.search.patterns`). Optional.

The residues compared are the profile's (`D.residues`): a mark is kept in a species when that species' aligned residue
equals the human residue at the mark; the marks are compared with the protein's other residues of the profile's
letters, each counted once, by the means of their shares and a two-sided Wilcoxon rank-sum test.

## Structure evidence

What a site knows about its marks in 3D structures, for the protein page's viewer (`kit-3d.js`). The structures
themselves come live, by UniProt accession: the AlphaFold DB model, the PDB entries PDBe maps to the protein (SIFTS),
their coordinates from RCSB, and predicted complexes from AlphaFold DB and ProtVar. A site with no structure evidence
still gets all of that; the evidence adds the contacts, the bound RNA and DNA, the predicted partners and colourings.

Each part names a table of `website.tables` (above, "Tables the protein pages show") in the format it reads, and may
keep some of its rows (`include`/`exclude`, on the format's columns), map the table's kind codes to the viewer's
(`kinds:`), and give the page's `label` and `help`. Every part is optional; a site without one simply lacks it.

| Part | Table format | What the viewer reads |
|---|---|---|
| `contacts` | `site_evidence` | per mark, `kind` (mapped by `kinds:` to `rna`, `dna`, `protein`, `self`; anything else is drawn as other), `ids` (the PDB entries), `partner`, `partner_accession` |
| `bound` | `bound_windows` | per mark and entry, `entry`, `kind` (`rna`, `dna`, `hybrid`), `type`, `name`, `window`, and to draw the contacted nucleotides `chain` (the nucleic acid's author chain id), `nucleotides`, `numbers` (their author numbers) and `distances` (Å), lists in the same order |
| `predicted` | `site_evidence` | per mark, `partner`, `partner_accession`, `ids` (the model: an AlphaFold DB model id `AF-…`, or a ProtVar pair `ACC1_ACC2` in the order it was made), `score` |
| `residues` | `residue_evidence` | runs of residues (`accession`, `start`, `end`), for the colourings |

`residues` holds the viewer's colourings: `colourings: [{id, label, none, help, classes}]`, each class `{id, label,
colour}` with either `where` (conditions on the table's format columns, all holding) or `all` (the residues in every one
of the other classes named). A residue takes the first class it is in, in the order listed; `colour` is a hex colour
or one of the viewer's names (`rna`, `dna`, `protein`, `self`, `ev`, `rna_pale`, `dna_pale`), which follow the themes.

The mark's chemical components in PDB entries come from the profile's states (`pdb_component`); the viewer lists the
entries that model one and draws them. The other colourings are the site's own: its domains and disordered regions as on
the map, each segments track by its classes, and the marks by the map's colour attribute.

`ptmc web` puts each protein's part into its record in `data/p/NN.json`, as `s3d`:

| Key | Rows |
|---|---|
| `c` | `[position, kind, [entries, lower case], partner, partner accession]` |
| `b` | `[position, entry, chain, kind, type, molecule, [nucleotides], [author numbers], [distances], window]` |
| `p` | `[position, partner, partner accession, source, model, score, distance]` |
| `r` | `{colouring id: [[class index, start, end], ...]}` (classes made with `all` are drawn by the page) |

and the page's data a `structure` block: the components (`code, state, label`), each part's `label` and `help`, the
manifest input each part's table reads (`inputs`) and the colourings without their conditions.

## The Proteins and Sites pages

Both pages read only data in the formats above, named in the site file, so another site, or a user's tables in the same
formats, gets the same pages with no code (`kit-tables.js`, `kit-sites.js`; `ptmc check` names what a block gets wrong,
`site.table_view_problems`; `tests/test_tables_pages.py`). A block a site does not write is replaced by a default; a
column whose data a site lacks is left out.

**`website.proteins`** (the Proteins page). `columns`: the table's columns after the protein and its count of marks (of
the selection, "/ total" when that differs), offered in the Columns menu (`default: true` shows at first; the reader's
choice is kept in the browser). Each `{id, label, menu?, default?, help? (the header's hover), hide? (xs: dropped below
36rem; sm: below 56rem)}` and one of:

| Key | Value | Shows |
|---|---|---|
| `show` | `map`, `length`, `share`, `candidates` | the marks as ticks along the protein (the selection's tall, coloured by the colour attribute), its length, its marks over its candidate residues, its candidate residues |
| `counts` | `{attribute, values: {code: label}, dashed?: [codes]}` | the protein's marks (of the selection) with each value of a mark attribute, as chips |
| `classes` | `{analysis, classes: [codes]}` | the share of the protein's marks in these classes of a residue question |
| `attribute` | a protein attribute (`proteins.attributes`), with `format?`: `count` (a list's length), `l2` (signed, true minus), `p`, `int` | the value |
| `template` | `"{a} in {b} aa"` over protein attributes, `where?: {attribute, max?, min?}`, `sort?: <attribute>` | the words, when the condition holds |

Default: a site map, the length and the share. `download`: the TSV's columns, each `{name}` and one of `value`
(`accession, gene, entry, protein, aliases, length, candidates, marks, marks_shown`), `attribute` (a protein attribute;
a list joined with `;`), `classes` (the count of the protein's marks in them), `counts: {attribute, value}`.

**`website.sites`** (the Sites page). Fixed columns: the protein, the site (numbered as `website.protein.numbering` says,
"UniProt R3" below; tags for the values of a list attribute, `site_tags: {attribute, values: {code: tag}}`), the colour
attribute (a dot and `short` labels: `{attribute: {code: label}}`, heading `state_label`) and the window ±7 (the site
boxed, the profile's residues bold, `window.colours: {letter: colour}`, `·` past the ends) with the tags of each flags
question (`tags: {analysis: {order?, hide?}}`; when given, only those questions). `table`: the optional columns, in the
protein page's column format (`website.protein.table.columns`, which is the default): `attribute`, `analyses`, or
`show` of the site card's blocks (`status, tags, sequences, around, calls, states, changes, nearest_domain`, read from
`website.tables`, and `nearest`: the distance to the protein's nearest other mark), with `sort?` (mark attributes: a
category by its values' order, a list by how many values, a call by its mark), `help?`, `hide?`. An evidence tag
(`data-ev-kind`) opens what the site's `site_evidence` and `residue_evidence` rows say of those kinds at the site,
without peptide sequences. `download`: each `{name}` and one of `value` (`accession, gene, entry, protein, site,
position, numbering, window, residue, nearest`), `attribute` (codes; `labels: true` for labels, `links: true` for its
link column, `lookup: <column>` for the citation lookup's column), `analysis` (codes or `labels`), `protein` (a protein
attribute), or `table` with `column` (the rows' values) or `field` (distinct values, lists split; `count: true` for
their number; `with: <column>` writes `value:number`), filtered by `kinds` and `where: {column: value}`. Every row of
the selection, in the table's order, under the kit's `#` lines; lists joined with `;`; the file
`<marks>_<proteins|sites>[_selection]_<date>.tsv`.

**`website.selection_cards`**: "Your selection" for a selection of one set of a protein-set question (keyed by the
question: the site's own test of that set) or one value of a list attribute (`@<name>`: its reference from the citation
lookup): `{eyebrow?, url? (with {set}), link? (its label), note?}`.

**Enriched features** (both pages) read only the selection data: every class of each residue question and every value
of each mark attribute, the selection's marks against the others (the selection module's contrast, pooled).

The page's own data (`site-data`) carry the statistics rows once, as the text of `statistics.tsv` (`statistics_tsv`);
the page reads its rows from it. Each protein-set question there has, when the site gives them, `link` (its sets' own
pages), `parents` and `root` (from its hierarchy), `gathers` (for a family question an Overview card names under
`members`: each family's own sets among the member question's tested sets) with `gathers_all` (how many sets each family
gathers, tested or not) and `checked_against` (the manifest name of its `reference.tables` entry). An Overview card may
show one question several ways (`views`: each a protein-set question with its `label`), more sets tested apart behind a
button (`more`), the member sets of its families (`members`: the question testing them one by one, `of` the family
questions) and, for a question with a hierarchy, an ontology view (`ontology`: `short`, `compare`, `tree`, `glosses`);
`website.protein.sets` gives cards of a protein's own sets. All of these are words and choices of the site file; a site
without them shows its questions as plain lists.

## Search and its filters (website.search)

What the search reads beyond genes, accessions, entry names and the questions' keys, and the filters that read more than a
mark's own classes. Every part is optional; a site without a part has none of it (no suggestion, filter or key), and
`ptmc check` names a part that refers to what the site lacks (`web/search.py`, `problems`). The data come in the formats
above, mapped from any source's columns under `website.tables`; nothing else is read. `tests/test_search.py` builds a toy
site from a few rows in each format.

| Part | Reads | Gives |
|---|---|---|
| other names | `aliases` of a `protein_values` table; `shorthand: {name: accession}` | a protein found by any of them, also without hyphens, spaces and dots (TDP-43, TDP43) and written in two words (hnRNP A1); "Matched by another name" under the search |
| numbering | `website.protein.numbering` (genes or names, `offset`, `note`) | positions typed in a search read as the protein's page numbers them (H3 R2 is UniProt R3), said under the search |
| sites | the marks | `GENE R216`, `GENE 216`, `GENE:R216`, `GENE_216`, `GENE-R216`, `GENE/216`, and a name with its site in one word (`H4R3`, when the letter is a residue of the profile); a site that is no mark: "No <mark> reported at GENE R999" |
| `patterns: {at, near, span}` | the snapshot's sequences | `<at>:GXRG` a pattern (residue letters, `X . * ?` any, `[ST]` a choice, 2 to 10 positions; `,` or `\|` for either) with one of its positions on the mark; `<near>:PRPR` anywhere within `span` residues (default 15). A key that is also a question keeps its classes (`motif:RGG`). `ptmc web` writes each mark's window, `selection.json` `wide: {span, w: [string per mark]}` (`-` past the chain's ends). Filter keys `m:at`, `m:near` (values: patterns) |
| `terms: {key: {label?, help?, values: {word: {filter key: [values]}}}}` | the site's filters | search words that stand for filters (`go:rna` → `r:go_rna` experimental or other evidence); a word holds when all its filters hold, words of one term match any; a key shared with a question or attribute reads its own words first. Filter key `x:<key>` |
| `spacing: {label?, within?}` | the marks | filter `d:marks`: another mark of the site within N residues |
| `nearby: {table: {key?, label, help?, kinds?: {code: label}, within: [N]}}` | a `residue_evidence` table of `website.tables` | filter `o:<table>`, values `<kind>@<N>` (`*` any kind; `@0` at the mark): a residue of that kind on the protein within N; search key `<key>:<kind>`, `<key>:<kind>@N`, `<key>:N`. `selection.json` `nearby: {<table>: {kinds, d: [per kind: [mark index, distance, ...]]}}`, distances up to the largest of `within` |
| `partners: {table, key?, label?, gene_label?, score_label?, help?, classes?: {code: label}, marked?, other?, scores?: [x]}` | a `protein_partners` table | filters `b:class` (a partner of a class code, `marked`, or `other`: neither), `b:gene` (a gene or accession), `b:score` (the partners counted: score at least x); search key `<key>:<class>` or `<key>:<gene>`. `data/partners.json` (read when first used; inlined in the one-file copy): `{genes, accessions, classes, bits (a partner's classes as bits), marked (0/1), rows: {protein index: [partner index, score × 1000, ...]}}` |

A filter group of `website.filters` places these filters by key (`keys: ["d:marks", "o:other_ptms", "m:at", "b:class", "b:gene",
"b:score"]`); a module may add kinds of its own (`K.filterKinds[kind]`: `valid`, `test`, and optionally `control`, `label`,
`value`) and search keys (`K.searchTerms[key]`: values → `[filter key, values]` or `{error}`). A protein attribute with
`control: chips` is offered as chips (match any). A term that cannot be read selects nothing and says why under the search.
