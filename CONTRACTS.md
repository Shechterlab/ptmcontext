# Contracts

Nine plain-data formats, and the tables the protein pages show (at the end). Code on either side of a contract can change freely; a contract changes only with its
`schema_version`, and every file is checked against its schema before it is used.

| Contract | Format | Schema | Written by | Read by |
|---|---|---|---|---|
| **Mark file** (the mark profile) | YAML | `ptmcontext/schemas/profile.schema.json` | a person (`sites/marks/<mark>.yaml`, named by the site file's `mark:` path) | the layers (motifs), the tests (residues, words) |
| **Site** | YAML | `ptmcontext/schemas/site.schema.json` | a person | `ptmc run` |
| **Input manifest** | JSON | `ptmcontext/schemas/inputs.schema.json` | `ptmc stage`, `ptmc inputs record` | every build |
| **Unit table** | TSV | `ptmcontext/schemas/units.schema.json` | stagers, other repositories | the layers |
| **Statistics row** | TSV | `ptmcontext/schemas/statistics.schema.json` | every test | releases, websites, parity |
| **Set families** | YAML | `ptmcontext/schemas/set_families.schema.json` | a person (a site's own data file, `sites/data/`) | protein-set questions that gather sets into families |
| **Per-mark table** | TSV (any columns; the site file names its key and the columns kept) | `marks.tables` in `ptmcontext/schemas/site.schema.json` | a source, another repository, a user | the website's count questions (`website.counts`) |
| **Map rows** | TSV in any layout, mapped to the format's columns in the site file | `ptmcontext/schemas/site.schema.json` (`website.protein.map.rows`) | a backend's release, or a person | `ptmc run` (map_items.tsv), the protein map |
| **Context marks** | TSV (any layout; the site file names its key columns) | `context_marks` in `ptmcontext/schemas/site.schema.json` | a release (PTM_Pipeline v1.5.0: phosphorylation, methyllysine, acetylation and other lysine acylation), any residue table | `ptmc run`, the website (map row, site card, filters, tables, downloads), the `near_marks` layer |
| **Set hierarchy** | TSV | below (`hierarchy:` in the site schema) | an ontology's export, a person | the website's views of an ontology question |
| **Published set results** | TSV (any columns) | below (`reference.tables` in the site schema) | a release, another pipeline | the parity check of one protein-set question |
| **Citation** | YAML (CITATION.cff 1.2.0) | [citation-file-format.github.io](https://citation-file-format.github.io/) | a person | every page and download; GitHub and Zenodo read it too |
| **Structure evidence** | TSV, columns named in the site file | `website.protein.structure` in `ptmcontext/schemas/site.schema.json` | a release, a lab, any table mapped to it | the protein page's 3D viewer (`kit-3d.js`) |
| **Conservation across species** | none (read live) | `website.protein.conservation` in `ptmcontext/schemas/site.schema.json` | any site | the protein page's conservation card and the selection's logo (`kit-conserve.js`) |
| **RNA and DNA interactions** | TSV, columns named in the site file | `website.protein.nucleic` in `ptmcontext/schemas/site.schema.json` | a release, a lab, any table mapped to it | the protein page's RNA and DNA card (`kit-prna.js`) |

### Mark file

A mark file holds everything specific to one modification: residues, state codes, writers (with ids and citations),
motif families, stickers and the words the pages use. The package carries none: a site file names its mark file by
path in `mark:`, relative to the repository that holds the site file (`mark: sites/marks/<mark>.yaml`); a bare id
(`mark: methylarginine`) is an error. Sites of one mark share one file. `ptmcontext/schemas/profile.schema.json` is the
schema; `ptmc check` validates it. `words` also supply the generic nouns the pages say (a marked residue, a stickers
noun), so no page text names a mark.

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
- A residue question may count only the residues inside the IDRs (`only_in: idr`) or inside the regions of an interval
  table (`only_in: {role, kind}`), or only the residues of some letters that fit a motif (`only_in: {residues: ST, motif:
  {pattern: "[ST]P", start: 0}, flank: 10}`, `motif` as a motif family's pattern, so that a question can be asked of one class
  of residues, and `residues` alone for one residue type), or only the residues some marks are reported on
  (`only_in: {marks: [ids]}`: `site` for the site's own counted marks, every one whatever the question's `marks_where`, a
  context mark's id or a part of the marks, `marks.parts`; a question asked again among the residues a method finds
  modified at all, as a control for how detectable each residue is): the marks and candidate residues outside are counted
  on neither side (and a class layer is needed, so that the website can tell the marks outside). A residue question's
  `background` (and `background_within`, default `<background>, <within protein>`) replaces the words of its rows'
  background column. The `neighbours` layer (`with: {window, residues,
  many, noun}`) places a residue in `none`, `one` or `two_plus` (`many` or more) according to how many residues of a
  set lie within `window` residues of it on either side; the set is `with.residues` or the mark profile's `stickers`.
- A question (residue, several tests, or protein sets; not `conditional_logit`) may count only a part of the marks
  (`marks_where`: a condition, or `all_of` conditions, on the marks table's columns, as `marks.exclude` reads them):
  the marks with a kept row that meets it, e.g. the lysines with a row whose `state` is `me3`; a mark may meet several
  subsets. The marks outside are other residues in a residue question (the website shows them as not counted in it, as
  marks outside `only_in`), and not marked proteins in a protein-set question; a residue question needs a class layer
  for this. run.json's `analyses.<id>.marks_where` records `{where, marks, proteins}`. Rather than copy each question
  by hand, a site lists `marks_subsets: [{id, label, where, analyses: [question ids], note?}]`: at load, each listed
  question gets a copy `<id>_<subset id>` with `marks_where` set, its title followed by `, <label>`, `note` added to
  its `sub`, and the base question's `family` (its title, unless it has one) with `family_label: <label>`, so that the
  sidebar lists a question and its subsets as one entry. A question without a title or family cannot be repeated.
- Questions that are variants of one base (the same test at other window sizes, or inside IDRs) may share a
  `family:` (any text, the entry's name). The website's Sections sidebar then lists them as one entry with a caret
  that reveals the variants, each named by what differs: its title less the family's name (and any leading
  punctuation; a trailing parenthesis joins with a comma, so "X, in IDRs (within 3)" under family "X" reads
  "in IDRs, within 3"), or the question's own `family_label:` where that reads badly; the full title is the entry's
  tooltip. The questions, their pages and their statistics are unchanged. Group headings in that
  sidebar are the Overview's `website.overview.sections` names, each a disclosure that is open only when it holds the
  current page (a reader's own choice is kept for the session).
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
- `enricher` on partner classes (`sets: {input: <role of the partners table>, partner_classes: <id of its website.tables protein_partners table>}`): a set for each class of `website.search.partners.classes` (read as the page's partner filter reads them), holding the proteins with a partner in the class; the proteins the table lists are the annotated ones, so with `universe: annotated` the background is the proteins with any partner (a protein with none cannot be in a set, and well-studied proteins have both partners and marks).
- `enricher` on sets made by overlapping rules (`sets.exclusive: false`): each rule takes every row whose conditions
  hold, so a row may be in several sets (a CD-CODE membership whose roles are "driver; member" is in the driver set and
  in the member set). A protein is in a set when any of its rows is.
- `conditional_logit` (`test: conditional_logit`, `covariates:`; `ptmcontext/model.py`): one conditional logistic
  regression (`ptmstats.conditional_logit`; Breslow & Day 1980, the several-factor form of Mantel–Haenszel) with a
  stratum for each protein, the marks the cases and the other candidate residues the controls, on the whole dataset (the
  browser does not refit it for a selection). One row per factor and model: `category` the factor's name, `stratum`
  `adjusted` (all factors together) or `alone` (that factor in a model by itself), `odds_ratio` with its Wald 95% CI,
  Wald `p`, `q` (Benjamini–Hochberg over the factors of the model), `n_strata` the proteins with a mark and another
  candidate residue. `a, b, c, d`: for a yes-or-no factor the marks with and without it and the other candidate residues
  with and without it; for a number, `a` marks and `c` other candidate residues only. A factor is a layer's classes
  (`is`), a flags layer's flags (`flags`), or a number summed over a window of the sequence with weights
  (`window_sum: {window, weights}`, the residue itself left out, `per` its unit). A factor that does not vary is left
  out and the run says so. Mark such an analysis `new: true`.
- `enricher` on calls (`sets.member_when: [conditions]`): the table has a row for each protein and set the source
  tests; every protein of its rows is in the background, and a member of a row's set only where the conditions hold
  (a per-protein call, such as "its bound RNAs gather here").
- `mann_whitney` on a protein-set analysis (`sizes: {value, log2, background}`): for each set within the size limits,
  the number every background protein has for it (a column of the sets' table, member or not; log2 of it, 0 as
  -inf), marked proteins against the others, two-sided Mann-Whitney U (SciPy's default); `a` and `c` count the
  proteins compared, `b` and `d` are empty; q is Benjamini-Hochberg over the sets (a p that cannot be computed as 1).
- `mantel_haenszel` on a protein-set analysis: the same 2×2 split by a protein covariate (PaxDb abundance decile, and
  `none` for proteins without a value); its `a, b, c, d` add up to the `enricher` row's. For sets of another
  identifier, an identifier takes the highest value of the proteins that map to it (`combine: max`), and the deciles
  are those of the background's identifiers.
- A **question of several tests** (an analysis with `tests:`, `ptmcontext/question.py`): each test is one category
  (and stratum) with its own background, a yes-or-no class against the candidates its evidence could reach. A test puts a
  candidate in its class by `inside: <role>` (inside a unit of the role, or `within: N` residues of one; `{role, where:
  [conditions on the units' columns]}` keeps some units) or by `value: <role>` with one of `at_most, below, at_least,
  above` (a per-residue table). It counts only the candidates every restriction keeps: `proteins_with: <role>` (proteins
  with a unit; `on_candidates: true`, a unit holding a candidate), `covered_by` (inside a unit: the residues an experiment
  measured), `outside_of`, `with_value`, `unless: <motif rule>` (not the residues whose window matches, the profile's
  syntax). Restrictions add up from the analysis, the test and the stratum (`strata:`, every test again on part of its
  candidates; the row's `stratum`, and its class code `<category>_<stratum>`). `counting: proteins_with_both` (default,
  as above) or `every_candidate` (the pooled test counts every candidate the test keeps, and the within-protein row
  reports those counts; no within-protein row for a test of one protein). `background` names the background per test. A test's `label` names its class; a stratum may add a `suffix` (`", ordered regions"`) to the label of each test it repeats. Classes that would share a label take the stratum's name (`Any interface (domain)`), and two classes with the same label that way are an error.
- `enricher` on **one set per item** (`sets.each`): each item is a set: the proteins with a unit in its `units` roles or
  listed in its `table` (`{input, protein, include, exclude}`), tested against its own universe (`universe_units`: the
  proteins with a unit there; else the analysis's universe), one hypergeometric test each, BH over the items;
  `order: as_listed` keeps the items' order.
- A test or set that reads an input which is absent (a `checksum_only` input the build's root does not hold) is left
  out, and `run.json` says so (`analyses.<id>.left_out`); the parity check then leaves its reference rows out and does
  not compare `q` of that question (BH needs every row).
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
- `maps`: each `{analysis, regions?, name, short?, method?, cells?, how?, ref?, doi?, url?, licence?, min_members?, graded?}`; `analysis`
  is a protein-set question whose sets are the map's compartments, `regions` (optional) another whose sets are the same
  map's regions. The grids' columns, in order. A map tested within abundance strata (`abundance:`) is compared within them
  (its `mantel_haenszel` rows); one without, by its fold enrichment.
- `graded: true` on a map: it grades proteins (a probability band) instead of naming a place, so a protein page says its
  classes apart from the places, in lower case.
- Cell zoom: a drawing of the cell (the Overview's map, the protein page's own) opens at full size in a dialog with
  zoom and pan (the **Enlarge** button); a click on a part lists the proteins that sit in it,
  50 to a page, each linked to its protein page, within the selection when there is one.
- `regions`: rows `{label, set? (default label), part?, name?, in_text?}`, the sets of each map's regions question.
- `compartments`: groups `{group, rows}`, each row `{label, sets: {analysis: set}, part?, also?, name?, in_text?}`: the
  set it is in each map; the part of the drawings it colors, and `also` the parts it colors when they have no row of
  their own; its name on the drawings (default label) and inside a sentence (default lower case).
- `drawings`: `[{drawing, title?}]`, the kit's drawings shown. Their parts are `ptmcontext/config/cell_drawings.json`
  (geometry only: `cell` has cytosol, microtubules, actin, pm, er, ribosomes, nucleus, golgi, mito, endolyso, perox,
  granules, pbodies, centrosome; `nucleus` has nucleoplasm, chromatin, periphery, perinucleolar, nucleolus, speckles,
  paraspeckles, pml, cajal, bodies, envelope, pores). A part no row colors is drawn outlined and not labeled; what a
  part is called on a page is the row's name, never the kit's.
- A part (and a region, on the tile) takes the median log2 odds ratio of the maps that have it; it is colored when at
  least half of them differ that way (q ≤ 0.05 and 1.1× or more), gray otherwise.
- `title, question, intro, note`: words.

The kit draws the cell for other pages too: `K.cell.list()` (the drawings, their parts and phone crop, the crop from
`config/cell_drawings.json`), `K.cell.parts(scoped?)` (every part a `website.cell` row colors: its row, tone, direction
`more`/`less`/`ns`/`na`, the median log2 odds ratio and each map's own) and `K.cell.draw(el, drawing, {scoped, crop, labels, onPart})`
(the drawing as the cell page draws it; `onPart` takes a click on a part).

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

`reference.excused: [{analysis, method, category, stratum?, why}]` names reference rows the published inputs cannot
rebuild (a value a supporting table gives rounded, say): both sides' row is left out, every other row (q too) is
compared, and the run logs and records the reason (`parity.checked[].excused`).

`reference.background: {input, accession, analysis, category, others, all?}` is a table of each protein's other
candidate residues per residue question and class (a release's denominators, one row per protein, question and class;
`all`, default `*`, the class meaning every other candidate). The run compares it, row by row, with what it counts
(`protein_counts.tsv`: `others_in`, and `others_total` for `all`), for each question it ran; a class the rebuild
counts and the table lacks must hold none. Each question is one `parity.checked` entry, method `background`.

## Unit table

`unit_id, accession, start, end, kind, source`, then the unit's own columns. 1-based, inclusive, on the snapshot's
sequences. Domain units add `subtype` (domain, repeat), `ref` (the source's accession), `label` (its name) and
`members` (member-database accessions).

## Marks

Any TSV with an accession column and a position column; the site file names them and selects rows with `include` and
`exclude` conditions (`equals`, `in`, `contains`; `{all_of: [conditions]}` holds for a row when every listed condition does, to set aside rows that are one value in one column and another in a second, as `marks.exclude`, `left_out`, `marks_select` and `marks.add` read it). Positions must be on the snapshot's sequences. `marks.add` appends the rows of
further tables (each its manifest `input`, with its own `include`, `exclude` and `left_out`: rows counted on neither side).
`set: {column: value}` on an entry writes that column on every row the table gives (after its conditions are read), so
tables of several kinds of mark make one marks table with a type column (a filter, a color, a `marks_where` subset).
`marks.parts: [{id, where}]` names parts of the site's own marks (the kept rows a condition holds for): a `near_marks`
question may read one as `with: {marks: <id>}`, like a context mark but with no map row, filter or card line of its own
(`window: 0` asks whether a lysine of one type is also of another). The id must not be a context mark's.
A site's `variants` run the same questions on other marks (`not_compared`: questions a variant runs but does not
check against its reference, each with why): each has a `label`, tables to add (`marks_add`) and its own
`reference`, and `attributes` of the marks it adds; `marks_select: {include, exclude, left_out}` replaces the site's own row conditions for the variant (the main view sets some rows of the table aside, the variant counts them, from the same table: `{exclude: []}`); `ptmc run --variant <name>` writes it under
`<outputs.folder>/variants/<name>` and records `variant` in run.json, and `ptmc web --variant <name>` builds its website in
`<outputs.folder>/web/<name>/`. The site's own page lists the variants that have been run (`variants`: name, label,
description, href) and a variant's page names its way back (`variant.base`): a switch in the toolbar keeps the page and selection.

`marks.attributes` keeps columns of the marks table for the website only (no test reads them): each has a name
(letters, digits and `_`), its `column`, a `label`, a `kind` (`category`, `list` or `number`), and optionally the
`separator` of a list (default `; `), display names for its `values`, a `link` (another column, aligned item by item,
and a URL with `{}`, as each study to its DOI), `records` (a value that is a database, linked to its own record of the
protein: a URL with `{acc}`), `colours`, `colour` (the map and Sites tab may color by it), `filter`, `control`
(`chips`, or `select` for many values) and `help`. `bands: [t1, t2, ...]` cuts a number column into the classes `b0` (below `t1`), `b1` (from `t1`), ... (empty where the cell is no number): a
category attribute (`kind: category`, `values: {b0: Below 0.2, ...}`) that a `kind: values` count question or a filter can use.
`optional: true` makes the attribute exist only where the marks table has its `column`: without it `ptmc run` leaves the
attribute out, and with it everything the site file builds on it (filters, table columns and downloads, `website.counts`
questions that read it and the Overview cards naming them, header tiles, map colorings); `ptmc web` does the same for a run
that lacks the column. One site file then serves a table before and after a column (a functional score) is merged into it.
`join_rows: true` (a list) is for a mark on several rows of its table, one per methylation degree say: the mark keeps every row's values, each once, in the order of the rows (else the first row's); `present: true` makes the value whether the column holds anything
(`yes` or `no`: "changed in tumors" over a column of changes); `pair_with` names a second list column in step with the
first, and each value becomes `<value>:<its partner>` (a perturbation and its call; lists of different lengths are an
error). A mark on several rows takes the first kept row's values.

`presence_only: [value, ...]` on an attribute names values of it (the RBDmap fragment and pCLAP peptide codes, say) whose
peptides, fragments and extents may not be published. The website keeps the flag at each mark, with its label from
`values`, and nothing that places the stretch: `ptmc web` leaves out of every `website.tables` table the rows whose `kind`
or `group` is one of them, and from the protein map every stretch (`start` < `end`) of such a class, so a map row shows
them only through `marks: true` (a dot at each flagged site). `ptmc check` names a value the attribute does not list and
a map row that reads such a class from a table. Statistics and parity do not change: the tests read the inputs, not the
website.

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

## Context marks

Other modifications shown beside a site's own mark, declared in the site file as `context_marks:` (a list). Each entry:

| Field | Required | Is |
|---|---|---|
| `id` | yes | lower-case letters, digits and `_`; the role `context_<id>`, the map row `ctx_<id>`, the attributes `ctx_near_<id>` and `ctx_n_<id>` |
| `label`, `plural`, `noun`, `short` | label | the mark's name ("Phosphosite"), its plural, the word inside a sentence (default: the label, lower-cased), and its short lane name in the map's "All modifications" block (default: the label) |
| `input` | yes | a manifest entry (CHECKSUM and license as any input): a table of residues, one row per residue and state |
| `columns` | yes | `accession` and `position` (1-based, on the snapshot); optional `residue` (rows whose letter differs from the snapshot are dropped), `state`, `evidence`, `sources` (`; `-separated), `score` (a number column; read where the table has it, treated as absent where it has not) |
| `subset` | no | `{id, at_least and/or at_most, label?, default?: subset \| all}`: the marks whose `columns.score` passes (a "near high-score phosphosites" variant). Active only where the table has the score column; see below |
| `replaces_ptm_kinds` | no | kinds of the protein map's live UniProt "Other PTMs" row (`config/uniprot_ptm_kinds.json`, such as `Phospho`) this entry covers: that row leaves them out (`website.protein.map.hide_ptm_kinds`, which a site may also write), so one mark has one source |
| `exclude` | no | rows left out, on any column of the table: `[{column, in: [values]}]` (one table read as several marks: "other acylations" is the acylation table without `acyl_type: acetyl`); the map row leaves them out too |
| `same_residue` | no | `true`: also say, per residue, that the residue itself is in this table: the attribute `ctx_same` ("Also modified at this residue", a list shown on the site card, of the marks and their states), the filter `ctx_same_<id>` and a download column. A residue's own row never counts as "near" |
| `drop_evidence` | no | values of `columns.evidence` whose rows are dropped (default `[by-similarity]`; `[]` keeps all) |
| `colour`, `colour_dark` | yes, no | the map row's tick |
| `citation` | yes | `cite` (and `short`, `doi`, `url`, `licence`) for the table |
| `sources` | no | each value of `columns.sources` with its paper, as `website.protein.map.sources` |

`website.context_window` (default 7) is how many residues on either side count as near; `website.context_after` is the
map row the context rows follow (default `ptm`), `website.context_group` the Filters group's name.

What follows from the entries, with nothing else written: the input role; a protein-map row per entry (ticks, hover
with state, evidence and sources); in the run, per mark `a.ctx_near` ("Other marks nearby": the marks within the
window with signed distance, nearest first) and `a.ctx_near_<id>` (yes or no), and per protein `p.ctx_n_<id>` (the
entry's residues on it); on the website, "Other marks nearby" on the site card, the filter "Has a <noun> within ±N", a
"Nearby marks" column of the Sites table and one count column per entry of the Proteins table (all off by default under
Columns), and the same columns in the downloads (where the site file lists them: `website.sites.table`,
`website.proteins.columns`, `.download`, `website.filters`). They are context only: a context mark never changes which
residues are marks or any statistic.

Built-in layers take optional `with:` parameters; their labels and questions follow the values (the defaults are the
v1.4.3 release's): `disorder`, `domain`, `domain_context` `{window: 20}` (residues from a region's edge that count as
its boundary); `idr` `{window: 20, min_length: 20}` (the shortest merged disordered region that is an IDR);
`idr_charge` `{min_length: 20}`; `structure_context` `{near: 10, mid: 30}`. `domain_class` reads its classes from the
site: `with: {classes: sites/data/domain_classes.json}`, a path relative to the repository that holds the site file, to
a JSON or YAML file `{domain_classes: [{label, patterns: [regular expression, ...]}, ...]}` (the first class whose
pattern matches the lower-cased domain name, subtype and members names it). `ptmc stage mobidb --feature <key>` stages
another MobiDB feature than the release's `prediction-disorder-th_50`.

`website.search.patterns.near_examples` (a list of `{pattern, label}`) gives the suggestions after the `near` key; the box
quotes the first in its help, and a site that lists none suggests none. `website.legacy_routes` maps an older site's
protein-page section keys (`p-dom`) to the folds that hold them now.

**A subset by score.** An entry with `columns.score` and `subset: {id: high, at_least: 0.5}` adds, where the table has a
score column holding numbers: the attribute `ctx_near_<id>_<subset id>` ("has a <noun> (<subset>) within ±N", yes/no, with
its filter, under the entry's other filters); and a second protein-map row, `ctx_<id>_<subset id>`, with each tick's
score in its hover, drawn before the row of all the entry's marks. The subset row is shown at first and the row of all
marks is off (`subset.default: all` reverses them); the label of the row shown is a link that switches to the other
(map row `swap`), and the reader's choice is kept in the browser. Where the table lacks the column (a release before the
scores were merged into it), `ptmc run` writes none of this, and `ptmc web` drops the row, the attribute and its filter
and shows every mark at first, so one site file serves the table before and after. The score never enters a statistic by itself. A `near_marks` question may name the subset as its marks
(`marks: <id>_<subset id>`); the table is registered under that key only where the scores exist, so such a question is
for a site whose table has them (a run without the key stops with the missing context mark).

The `near_marks` layer (`with: {marks: <id>, window, noun}`) is the question "Near other marks": residues by whether a
mark of the entry lies within `window` residues on either side, the residue itself left out: `near`, `none`. Mark such an
analysis `new: true`; both tests run as for any residue question.

`window: 0` is the same-residue question: residues by whether the residue itself is in the entry's table (labels, question and
title follow; give `labels:` to name it, such as "Also reported acetylated"). The comparison is the question's usual one,
the marks against the other residues of the same proteins (the within-protein Mantel-Haenszel), so the number of studies
of a protein does not drive it; it speaks of reported residues, not of one molecule.

## Motif families

`layer: motif_families` is a question of named patterns of the sequence around each residue, with no code: a flags layer
(each family a class, tested as the mark profile's motif families are), read from the site file's `with:`:

```yaml
- id: kinase_motifs
  layer: motif_families
  new: true
  with:
    flank: 10                      # residues read either side (default 10)
    noun: kinase motif             # words: title, question, sub, section as for any made layer
    families:
      - {name: proline_directed, label: "[ST]-P", help: "Pro at +1", pattern: "[ST]P", start: 0, cite: "..."}
      - {name: basophilic, label: "R-x-x-[ST]", pattern: "R..[ST]", start: -3}
      - name: either                                   # several patterns: any one
        patterns: [{pattern: "DSG..S", start: -1}, {pattern: "DSG..S", start: -5}]
      - {name: shared_arginine, pattern: "R..[ST]", start: -3, marks: [{mark: methylarginine, at: -3}]}
```

A `pattern` is a regular expression (Python `re`) over the residues from `start` on, matched at that offset from the residue
(0 is the residue itself, negative upstream: `R..[ST]` with `start: -3` puts the Arg three before and the Ser or Thr on the
residue). It matches only if the residue lies inside the match and the match holds no position past either end of the
chain; `.` therefore never reads off the chain. `start` runs from `-flank` to 0. A family names `pattern` and `start`, or
`patterns` (any one matches). `marks` adds conditions on the site's context marks (`{mark: <context mark id>, at: N}` or
`within: [lo, hi]`, N from the residue): all must hold, so a motif's residue can be required to carry another mark. A
family has `name` (letters, digits, `_`), `label`, `help` and `cite` (documentation only), and optionally `among`: a string of residue letters (`ST`). A family with `among` is tested only among residues of those letters, in the class and in the background alike, in both tests (a motif of serines and threonines is not compared with the tyrosines, whose share of the background alone would move its odds ratio; a family that every residue of its `among` fits has an odds ratio of 1 by construction, so it is not worth a row). Unknown keys, a pattern that
does not compile, a `start` outside the window and a `marks` condition without its mark are errors, named by `ptmc run`.

## Map rows

The protein map's own rows: evidence along a protein that no question tests (crosslinks, interfaces, changes in
tumors, dense windows, ...). One format serves three shapes; a table in any layout is mapped to it in the site file
(`website.protein.map.rows[].from[].columns`), so a release's table, a backend's export or a user's own file in the same
shape gives the same row:

| Field | Type | Required | Is |
|---|---|---|---|
| `accession` | string | yes | the protein (an entry of the snapshot; other accessions are left out) |
| `start`, `end` | integer | a region | 1-based, inclusive, on the snapshot's sequence; items outside it are left out |
| `position` | integer | a residue | instead of start and end |
| `class` | code | no | what the item is; the row's `classes` give each code its words, mark (`tick`, `box`, `pred`, `dot`, `diamond`, `named`) and color, in drawing order, and items of other codes are left out. Several columns may be named: their values are joined with `:` (`dna_crosslink:candidate_residue`) |
| `label` | string | no | its words: a column, or a template naming columns, `{column}` or `{column:.2g}` for a number |
| `value` | number | no | a count or score: a per-site count (tumors carrying a change), partners at an interface; the row's `value` gives its words (`one`, `many`, with `{n}`), and may size ticks (`size`) or shade boxes (`opacity: [from, to]`) by it |
| `ref` | string | no | an accession of its own (an InterPro entry), linked by `config/ref_links.json` |
| `sources` | list (`; `) | no | the sources behind it; `website.protein.map.sources` gives each its words and paper (`cite`, `doi`) |

- a **per-residue list**: `accession`, `position`, and `class` or `label` (RNA-crosslinked residues);
- a **region list**: `accession`, `start`, `end`, and `class`, `label`, `ref` (fragments, binding regions, windows);
- a **per-site count**: `accession`, `position`, `label` and `value` (each change of a site and the tumors carrying it).

Options of a table: `role` (a role of `inputs:`, so the file is in a manifest) or `marks: true` (the marks table, its
accession and position by default); `include`/`exclude` conditions as for marks; `split`, a separator: cells of
`class`, `label`, `value` and `ref` holding lists in step become one item per entry (lists of different lengths are an
error); `values`, codes of a column in words (`{column: {code: words}}`); `sep` for a table that is not tab-separated.
A table's `optional: true` gives no items where its table lacks a column the mapping names (a release that adds a score
later). `at_least` and `at_most` keep rows by a number in a column (a cell that is not a number meets neither). A row's
`swap: <row id>` makes its label a link that turns it off and the named row on (a subset first, all one click away).
A row's `link` is a page about its evidence for a pinned item with no link of its own: a URL with `{gene}`, `{label}` (the
item's label) and `{position}`; a row the pipeline computes (a track, a motif found in the sequence) links to its Method
section instead. A row may instead be found in each protein's sequence (`sequence: {motif, min, gap, label, strong}`: runs of at least
`min` matches of a regular expression, each within `gap` residues of the one before). A row whose data a protein lacks is
not drawn on it, and a site without rows has none.

**The site's own marks by a score.** `website.protein.map.marks_view: {attribute, at_least, label?}` draws the site's own marks
on the protein map at first only where the number attribute (`kind: number`) is at least `at_least`; a mark without a
number is hidden too. The label of the marks row ("<marks>: <label>") is a link that shows every mark (and back); the
reader's choice is kept in the browser. The attribute is usually `optional` (a score merged into the table later): where
the run lacks it the whole row of marks is drawn as before. It is the map-row `swap` of the context marks for the marks
the site itself counts; no statistic, count or filter changes.

**The "All modifications" block.** `website.protein.map.combined_marks: {default?, label?, order?, min_marks?, split?}` (or `false`)
draws, at the top of the rows, one compact block for the site's own modification and every context mark: a thin lane
(9 px) for each modification, its short name on the left (`Kme`, `Rme`, `Sph/Tph/Yph`, `Kac`, `Kacyl`, `Kub`, `Ksu`) and a
tick at each position in the modification's color, the site's own first. A lane the protein has no marks for is not drawn.
Below the lanes a legend with the counts turns a modification off and on (a keyboard-reachable button with
`aria-pressed`; one that is off is struck through and loses its lane). The short name of the site's own modification is
`short` in its mark profile (default: the state codes joined by `/`); a context mark's is `short` in its `context_marks`
entry (default: its label). The rows of the context marks (map rows with `context_mark: <id>`, which `context_marks`
writes) are folded behind the block: the "Show each modification" button above the map (and the Rows menu) unfolds them.
`default` is `folded` (the default) or `unfolded`; `order` names the modifications in the legend's and the lanes' order,
`site` for the site's own and a context mark's id for the others (the rest follow); `split: {attribute, short?}` draws the
site's own marks as one lane for each value of that attribute the protein has (a site whose marks are several
modifications, the kind of each in a column: `Kac`, `Kub`, `Ksu`, `Kcr`, ...), named by `short` (default: the value's label)
and colored as the attribute's values, a mark with several values in each of their lanes; `min_marks` (default 3) is the fewest
modifications, the site's own included, for which the block is drawn; `label` renames it (default "All modifications").
The fold and the modifications turned off are kept for the browser session. The PDF, SVG and PNG exports draw the block and
its legend as shown, and the per-modification rows when unfolded.

**Rows that start off.** `website.protein.map.default_off: [row id, ...]` lists map rows that are off until the reader
turns them on in the Rows menu (kept in the browser; "Default rows" restores the list). The built-in ids are `ptm` (the
grey live UniProt row of other modifications: glycosylation, lipidation, cross-links, the rest), `variants`, `mutagen`,
`pdb`, `plddt`, `uni_dom`, `regions` and `residues`; a site's own row is `cf:<id>`. The three sites list `ptm`.

**The order of the map's rows.** The Rows menu lists the rows with a handle: drag it, or focus it and press the up and
down arrow keys (the arrow buttons do the same); "Reset order" restores the default. The order is kept in the browser and
in the address as `rows=<id>,<id>,...` (only when it is not the default), so a link keeps it, and the PDF, SVG and PNG
exports draw the rows in it. The exports' sizes are the screen layout, a single column (85 mm), a double column (180 mm) or
a custom width in millimeters; the text is laid out to print at no less than 6 pt, with the key and the citation.

**Map hovers.** `website.protein.map.hover` sets what the hovers of the protein map say; the rest is on the pinned card
(a click on a context mark) and the site card (a click on a site). `site` lists the fields of a site's hover, in order:
`name` (residue and position, and the color class), `chips` (a line of short evidence chips), `nearby` (the context marks
within `window` residues, default 10, with signed distance and, where a subset row carries it, a score; at most
`nearby_max`, default 3, then "+n more"), `window` (the sequence window), `classes` (the site's questions), `attributes`
(every attribute with a value), `shown` (the shown-not-counted line) and `click`. The default is `[name, chips, nearby,
click]`. `chips` lists the attributes of the chip line (an attribute name, or `{attribute, count: "PMIDs"}` to show the
number of values and that word; a number attribute shows its label and value); the default is the first three attributes
marked `provenance`, each at most two values. `context` lists the fields of a context mark's hover: `mark`, `residue`
(residue and position), `detail` (the row's label: state, evidence, score), `score` (a number the item carries), `source`
(its sources, where the detail does not name them) and `click`; the default is `[mark, residue, detail, source, click]`.
On a touch screen the first tap on a mark shows its hover and a second tap opens the detail.

`ptmc run` writes `map_items.tsv` (`accession, row, start, end, class, label, value, ref, sources`, for the proteins
with a mark); `ptmc web` splits it into `data/map/NN.json` (`map_shards` files of about 0.4 MB, by the sum of an accession's character codes modulo their number: `{accession: [[row
index, start, end, class, label, value, ref, sources], ...]}`, empty trailing fields left out) and names the rows in
order in the site data (`map_rows`).

## Input manifest entries

`file, md5, source, version, licence` (required), `role` (`input` or `reference_output`), `note`, and three optional
fields: `columns`, a column mapping for a file no reader knows (intervals: `accession, start, end`, and `label, ref,
subtype, class`; per-residue values: `accession, position, value`; lists of residues: `accession, position`;
`include`/`exclude` conditions (a website table's also `at_least` and `at_most`, on a number); `kind`; `sep`),
`record`, the source's own page for a protein (a URL with `{acc}`), and `redistribution: checksum_only` for a file whose
terms forbid copying it: only its MD5 is recorded, it is read from the root a build is given, and what needs it is left
out (and said so) where it is absent. A table a protein-set question reads that is not tab-separated says so with
`columns: {sep: ","}` alone; every table of a protein-set question is read with it. Two entries may read one file in
two ways (each its own name and mapping); `columns` may be a list of mappings (each partner of a pair, side by side in
one row), whose units are read together.

Where a mapping finds its units, besides `start` and `end`: `position` (one residue, or a list with `separator`; with
`residue`, the letter there: a row whose letter differs from the snapshot is dropped), `ranges` (`"363-363,531-531"`),
`residues` (`"R169,A203"`, every letter checked, else the row is dropped), `marked_in` (a sequence from `start` whose
lower-case letters are the residues). Checks against the snapshot: `sequence` (the unit's own sequence; `relocate: true`
moves a unit to the only place the snapshot reads it), `sequence_start`/`sequence_end` (read elsewhere than the unit),
`gene` (an accession not on the snapshot replaced by its gene's entry), `canonical` (an isoform read as its entry),
`start_offset`, `max_length`, `max_per_row`, `unique_within` (rows grouped by these columns kept only where the group
places one residue). Conditions (`include`, `exclude`, `where`): `equals`, `in`, `contains`, `matches` (a regular
expression the whole cell matches), `at_least`, `at_most` (numbers; a cell that is not a number meets neither),
`same_as` (another column's value), `on_snapshot` (an accession, isoform suffix dropped, of the snapshot).

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
| `tracks.json` | per kind of drawn unit | `{kind, title, style, help, roles, analysis, colours?, values?}`: `style` is `domains` (boxes on the backbone), `disorder` (the backbone's wave) or `segments` (a row of boxes); `analysis` names the question whose classes color it; `values`, for a kind whose units carry numbers (a layer's `Track.values`), is `{table, columns: [{name, label, help}]}` |
| `units_<kind>.tsv` | one per unit of a kind with `values`, on a protein with a mark | `accession, start, end, length, class`, the value columns (up to 6 significant digits, empty for missing), `marks` (the counted marks inside) and `other_candidates` (the other candidate residues inside; left-out marks on neither side, as the tests count them). The IDR charge layer writes `units_idr.tsv`: each IDR with `f_plus, f_minus, fcr, ncpr, kappa, region` (its Das–Pappu region, 1 to 5; `class` r1 to r5) and, when the mark profile names `stickers` (aromatic residues, say), `stickers, sticker_spacing, sticker_free` (how many, the median distance between neighbors, the longest stretch without one; a description for the IDRs page, never tested) |
| `protein_sets.json` | per protein-set question | `{N, marked_in_background, sets: {set: {M, marked}}, identifiers?, covariate?, marked_in_any?, filter_sets?, scores?}`: the background size, its marked proteins, and each tested set's size and marked proteins; for the Filters panel, the marked proteins in any of the source's sets (`filter.any`), the untested sets holding a marked protein with their names (`filter.sets: all`) and, with a `scores` table, `{label, help, levels, max, sets: {set: {protein: score}}, any: {protein: best score}}` over the marked proteins (no test reads these); with an abundance input, `covariate: {input, value, strata, proteins: {accession: [value, decile]}}` for the marked proteins, the deciles the stratified test used, and `counts: {codes, N, sets}`, the background's proteins in each stratum overall and in each set (from the lowest decile, then `none`); with `values`, `values: {columns, marked: {accession: [number or null per column]}, others: {column: sorted numbers}}` (columns with `background: true`); for sets of another identifier, `marked_in_background`, `marked` and the covariate's keys are identifiers, and `identifiers: {noun, nouns, proteins: {accession: [identifier]}}` gives each marked protein's identifiers in the background; absent when the site has no protein-set question |
| `protein_sets.json` | per protein-set question | `{N, marked_in_background, sets: {set: {M, marked}}, identifiers?, covariate?, marked_in_any?, filter_sets?, scores?}`: the background size, its marked proteins, and each tested set's size and marked proteins; for the Filters panel, the marked proteins in any of the source's sets (`filter.any`), the untested sets holding a marked protein with their names (`filter.sets: all`) and, with a `scores` table, `{label, help, levels, max, sets: {set: {protein: score}}, any: {protein: best score}}` over the marked proteins (no test reads these); with an abundance input, `covariate: {input, value, strata, proteins: {accession: [value, decile]}}` for the marked proteins, the deciles the stratified test used; for sets of another identifier, `marked_in_background`, `marked` and the covariate's keys are identifiers, and `identifiers: {noun, nouns, proteins: {accession: [identifier]}}` gives each marked protein's identifiers in the background; with a `hierarchy`, `parents: {set: [parent sets]}` (each tested set's parents among the tested sets) and `root`; for sets gathered into families, `gathers: {family: [set ids]}` (each tested family's own sets, which a website's table of member sets groups by); absent when the site has no protein-set question |
| `overlap_members.json` | when `website.overlap.terms_from` names protein-set questions | `{universe: [every reviewed protein of the snapshot], sets: {question: {set: [index into universe]}}}`: every protein of each tested set, the proteins without a mark too (a set of genes holds the proteins with one of its genes). Not in `protein_sets.json`; not read by any test |
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
include `fcr` and `ncpr` gives the site an IDRs page (`kit-idrs.js`), a top tab by default. `website.tabs.idrs: {as: section, question: <analysis id>}` drops the tab and makes the page the page of that question (after the question's own classes), reached from its Overview tile; `#idrs` and `#idrs?...` open it with `f=`, `q=` and `hl=` kept. The one-file copy inlines them when they fit.

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
| `site_table` | site | any columns, under `values:` | a table in a site's Evidence row (`card.tables`), each column labeled and formatted by the site file |
| `protein_values` | `accession` | `aliases` (other names a search or an old link may use), and any columns under `values:` | the whole-protein line of the card, a headline card's hover; `aliases` make `#TDP-43` and a search for an alias find the protein |
| `protein_records` | `accession` | any columns, under `values:`; several rows a protein | the RNA and DNA interactions card: bound regions, DNA-binding profiles, RNA Bind-n-Seq and eCLIP experiments |
| `lookup` | `key` | any columns under `values:` | the sources of the citation box and of the card's links (`label`, `citation`, `doi`, `licence`) |
| `site_evidence` | site | **`kind`** (a code: the values of the card's evidence attribute), `partner`, `partner_accession`, `ids` (a list of entry ids, e.g. PDB), `score` (number), `detail` | the card's interaction evidence: the entries at the site by kind, the partners named in a tag |
| `bound_windows` | site | **`window`** (the bound chain around the contacted unit: one letter a unit, `[X]` a contacted unit, `-` past the chain's end), **`kind`** (a code: rna, dna, …), `type` (a code), `name`, `entry` (an id), `entries` (a count, for a row that stands for several), `distance` (Å), `offset` (k when the residue i + k makes the contact; empty or 0: the site), `preparation`, `chain`, `nucleotides`, `numbers`, `distances` (the contacted units, their author numbers and Å, lists in the same order) | the card's bound sequences, aligned on the contacted unit; the sites table's contacts column |
| `residue_evidence` | `accession` | **`start`**, **`end`** (integers; a residue: start = end), **`kind`** (a code), `source` | the card's line on evidence at or within `span` residues of the site (crosslinks, bound stretches) |
| `site_records` | site | **`group`** (a code: what the record shows), `partner`, `partner_name`, `partner_accession`, `partner_kind` (protein, self, rna, dna, gene, small_molecule, … : labels from the site file), `species`, `source` (PDB, IntAct, …), `id`, `method`, `context`, `state` (the site in the experiment: a code), `state_detail`, `other_marks`, `pubmed`, `doi`, `citation`, `title` | "Who binds it, and how it was found" (records grouped by `group`, rows by partner, state and source), the writer-and-reader lines, and on a protein without marks the records naming it as `partner_accession` |
| `site_measurements` | site | **`condition`** (a code), **`call`** (a code: the site file gives each a mark and words), `n`, `n_down`, `n_up` (counts), `value` (a log2 change), `q`, `rule` | the perturbation marks of the card and the sites table, and every measurement in the Evidence row |
| `source_records` | site | **`source`** (a code: a value of the site's provenance attribute), `doi`, `reference`, `pubmed` (ids), `source_table`, `peptide` (modifications in brackets after their residue: `GR(me)G`), `state`, `enzyme`, `sample`, `detail`, `reported_accession`, `reported_position`, `check` (a code: how the record was placed) | the Evidence row's source records, the site's residue marked in each peptide |
| `protein_partners` (a table that lists each pair once says `both_ways: {partner: <column naming the row's first protein>}`: every row is also read the other way round) | `accession` | **`partner_accession`**, **`score`** (number), `partner`, `partner_marked` (true/false), `classes` (a list of codes) | the card's partners of some classes (`card.writer.partners`), and on a protein without marks the proteins with marks associated with it |
| `protein_records` | `accession` | any columns: the site file names each (`columns:` maps the input's column to the name the card reads; `values:` keeps others under their own names); several rows a protein | the protein page's cards (below): locations, condensate memberships, dependency, experiments, clustering |

`ptmc web` keeps each protein's rows beside its page (`data/e/NN.json`, `e_shards` files of about 0.4 MB by the rule of `map_shards`), the rows that name a
protein without marks as a partner (`site_records`, `protein_partners`) on that protein's light page (`data/u/NN.json`, `u_shards` files,
with its name, length and sequence from the snapshot; `data/u/index.json` lists those proteins), and lookups in the
page's data (`D.lookups`); `D.tables` gives each table's format and columns. In a shard, a string seen twice or more is
written once (`_s`) and its places hold its index; positions, `start` and `end` are the only numbers.

The site card and the sites table read the site file's `website.protein.card` and `website.protein.table` for their
words: the codes' labels, the sentences, the marks of each call, which columns the Columns menu offers and which show
first. `website.protein.numbering` numbers some proteins as papers do (a gene or name pattern and an offset: histones
without their initiator methionine): their positions are shown and read in links with it.

## Protein page cards

Context cards on a protein's page, each a fold with an id, on when the site file names it under `website.protein.cards` and
absent when it does not (`kit-pcards.js`; `ptmc check` reports what a card misses, `web/pcards.py`). Each reads tables of
`website.tables` in the `protein_records` format (above), whose columns the card names; a protein with no row in them is told
so, and the Experiments card is hidden for it. The words (titles, sources, labels, notes) are the site's; no source is named
in the module. Live parts are asked by accession and fall back to a line saying the source did not answer.

| Card (fold) | Table(s) and their columns | What it shows |
|---|---|---|
| `location` (`p-cond`) | `hpa.table`: `location`, `main` (`1` or `true`), `reliability`; `condensates.members`: `condensate` (id), `score` (0 to `max_score`), `roles`, `evidence`, `pmids` (`; `-separated); `condensates.names` (a `lookup` with `name`, `condensate_type`) | its locations, main first, each linking to the proteins at it (`hpa.analysis`); `maps: true` draws it in `website.cell`'s drawings, a part colored when a map places it, and lists each map's compartments; every condensate membership, most confident first, with stars, role, evidence, papers (named live when `pubmed` gives the summary service's address) |
| `dependency` (`p-depmap`) | `table`: `lines`, `dependent`, `median`, `common_essential`, `histogram` (bin counts, `; `-separated, over `histogram.from` to `.to`), `lineages` (`name|lines|mean`, `; `-separated) | how many lines depend on the gene, the histogram, the lineages; the marks' changes are `website.protein.card.changes` (the attributes and counts of the site card), listed per mark |
| `perturbations` (`p-pert`) | none of its own: `website.protein.card.calls` (its `tables`, `attributes`, `conditions`, `marks`, `words`) | a mark per call, a row per mark, a column per experiment the protein has |
| `experiments` (`p-exp`) | `table`: `position`, `region`, `perturbation`, `system`, `species`, `readout`, `direction` (`decreased`, `increased`, `no_change`), `finding`, `figure`, `reference`, `doi`, `read_from`, `in_release` | the curated experiments on the protein |
| `clustering` (`p-cluster`) | `table`: `spacing_min`, `spacing_median`, `max_<n>` for each of `windows`, `window_size`, `window_start`, `window_end`, `window_sites`, `window_log2`, `window_q`, `architecture`, `clusters` (`; ` between clusters, `,` between positions) | median spacing, the most marks within n residues, the top window, the architecture |
| `other_ptms` (`p-ptm`) | `table`: a `residue_evidence` table whose `kind` is the modification (`kinds` labels them, in order) | the count of each kind, and those within `near` residues of a mark |

The Disease card is the protein-set card of `website.protein.sets`; an entry may take an `id` (the fold's), `live`
(`uniprot: true` lists the diseases UniProt curates for the entry; `open_targets: {graphql, size, page}` the Open Targets
Platform's association scores for the entry's Ensembl gene, named by the UniProt cross-reference the conservation card
uses) and `term_groups: {terms, families}` (the protein's enriched terms of one question, grouped by the families, other
questions of the card, that gather them; a term in none is "Other / unassigned").

`website.protein.order` lists the folds, first to last, by id; a fold the list lacks follows the one before it, one the page
lacks is skipped. Without it the folds keep the page's own order. `sites/methylarginine.yaml` lists the explorer's order:
`p-map`, `p-cc`, `p-ix`, `p-na`, `p-sites`, `p-score`, `p-pert`, `p-exp`, `p-struct`, `p-cond`, `p-dis`, `p-depmap`, `p-kinds`,
`p-regions`, `p-cons`, `p-cluster`, `p-ptm`, `p-seq`.
`website.protein.groups` gathers the folds under a few headings: a list of `{id: g-..., title, folds: [p-...]}`. Each group is a
fold of its own that holds its folds in `order`, and "Open all" and "Close all" sit above them. A group starts open when one of its
folds does; a fold no group lists follows the one before it; a fold in two groups is a `ptmc check` problem.
`website.protein.open` lists the folds that start open (without it, each fold's own default: the map and the sites). A
fold that shows live or optional data opens only when the protein has it: the orthologs (`p-cons`) when they arrive, the
network (`p-ix`) when the site's partner table has partners. A reader's own opening or closing is kept.

## Conservation across species

A protein page can show each mark in the orthologs of other species, and a selection can show its marks' sequence windows
aligned and as a logo. Neither reads a table: the orthologs come live from Ensembl Compara, and the windows are the
motif finder's (`website.search.patterns`, which builds them from the snapshot sequences). A site without
`website.protein.conservation` lacks the card and the logo; `ptmc check` reports what the block misses.

```yaml
website:
  protein:
    conservation:
      ensembl: {rest: "https://rest.ensembl.org", xref: Ensembl, source: human}
      species: [{id: mus_musculus, label: Mouse}, {id: saccharomyces_cerevisiae, label: Yeast}]
      presets: [{id: to_yeast, label: To yeast, species: [mus_musculus, saccharomyces_cerevisiae]}]
      default: to_yeast
      similar: [K]
      logo: true
```

- `ensembl.rest`: the REST address (https); `ensembl.xref`: the database in the protein's UniProt cross-references that
  names its Ensembl gene (the first one is used); `ensembl.source`: the query species' name in the homology endpoint;
  `ensembl.compara` (optional): the Compara set when the species are not vertebrates (`fungi` for yeast). Where Ensembl
  has no Compara set with suitable species for an organism, the site leaves the block out and has neither card.
- `species`: Ensembl species names with the label shown, in the order shown. For each, the ortholog with the highest
  identity is used, with Ensembl's pairwise protein alignment.
- `presets` (optional): the sets of species the reader chooses between, as `{id, label, species: [ids of `species`], note?}`; the card
  shows a select, remembers the choice in the browser and asks Ensembl again for the new set. `default` is the id used until the
  reader chooses (the first preset without it). Without presets every species listed is aligned. Choose sets that still
  align: close relatives, then a spread across the clade. An ortholog Ensembl lacks for a gene is listed as having none.
- `similar`: residue letters shown as a conservative change (they do not count as kept). Optional.
- `logo`: offer the selection's alignment and logo (needs `website.search.patterns`). Optional.

The residues compared are the profile's (`D.residues`): a mark is kept in a species when that species' aligned residue
equals the human residue at the mark; the marks are compared with the protein's other residues of the profile's
letters, each counted once, by the means of their shares and a two-sided Wilcoxon rank-sum test.

## Structure evidence

What a site knows about its marks in 3D structures, for the protein page's viewer (`kit-3d.js`). The structures
themselves come live, by UniProt accession: the AlphaFold DB model, the PDB entries PDBe maps to the protein (SIFTS),
their coordinates from RCSB, and predicted complexes from AlphaFold DB and ProtVar. A site with no structure evidence
still gets all of that; the evidence adds the contacts, the bound RNA and DNA, the predicted partners and colorings.

Each part names a table of `website.tables` (above, "Tables the protein pages show") in the format it reads, and may
keep some of its rows (`include`/`exclude`, on the format's columns), map the table's kind codes to the viewer's
(`kinds:`), and give the page's `label` and `help`. Every part is optional; a site without one simply lacks it.

| Part | Table format | What the viewer reads |
|---|---|---|
| `contacts` | `site_evidence` | per mark, `kind` (mapped by `kinds:` to `rna`, `dna`, `protein`, `self`; anything else is drawn as other), `ids` (the PDB entries), `partner`, `partner_accession` |
| `bound` | `bound_windows` | per mark and entry, `entry`, `kind` (`rna`, `dna`, `hybrid`), `type`, `name`, `window`, and to draw the contacted nucleotides `chain` (the nucleic acid's author chain id), `nucleotides`, `numbers` (their author numbers) and `distances` (Å), lists in the same order |
| `predicted` | `site_evidence` | per mark, `partner`, `partner_accession`, `ids` (the model: an AlphaFold DB model id `AF-…`, or a ProtVar pair `ACC1_ACC2` in the order it was made), `score` |
| `residues` | `residue_evidence` | runs of residues (`accession`, `start`, `end`), for the colorings |

`residues` holds the viewer's colorings: `colourings: [{id, label, none, help, classes}]`, each class `{id, label,
color}` with either `where` (conditions on the table's format columns, all holding) or `all` (the residues in every one
of the other classes named). A residue takes the first class it is in, in the order listed; `colour` is a hex color
or one of the viewer's names (`rna`, `dna`, `protein`, `self`, `ev`, `rna_pale`, `dna_pale`), which follow the themes.

The mark's chemical components in PDB entries come from the profile's states (`pdb_component`); the viewer lists the
entries that model one and draws them. The other colorings are the site's own: its domains and disordered regions as on
the map, each segments track by its classes, and the marks by the map's color attribute.

`ptmc web` puts each protein's part into its record in `data/p/NN.json`, as `s3d`:

| Key | Rows |
|---|---|
| `c` | `[position, kind, [entries, lower case], partner, partner accession]` |
| `b` | `[position, entry, chain, kind, type, molecule, [nucleotides], [author numbers], [distances], window]` |
| `p` | `[position, partner, partner accession, source, model, score, distance]` |
| `r` | `{colouring id: [[class index, start, end], ...]}` (classes made with `all` are drawn by the page) |

and the page's data a `structure` block: the components (`code, state, label`), each part's `label` and `help`, the
manifest input each part's table reads (`inputs`) and the colorings without their conditions.

## RNA and DNA interactions

A card on the protein page (`kit-prna.js`, the fold `p-na`) with the RNA and DNA a protein meets, one tab per kind. It is read
from `website.protein.nucleic`, through the tables of `website.tables`, and reuses what the 3D viewer reads (above, "Structure
evidence": `contacts` and `bound`). A site without the block lacks the card, a part it does not write is absent, and so is
the card of a protein that has no data in any part (`ptmc check`: `web.nucleic.problems`).

```yaml
website:
  protein:
    nucleic:
      title: RNA and DNA interactions
      kinds: {rna: RNA, dna: DNA}            # the card's kinds (the viewer's kinds) and their words
      near: {table: contacts_near, label: "in contact through a neighboring residue"}
      regions: {table: nucleic_regions, kinds: {rna: rna, dna: dna}, fields: {start: start, end: end, kind: nucleic_acid, entries: n_entries, sites: methylarginines}}
      crosslinks: {table: residues, span: 5, kinds: {rna_crosslink: rna, dna_crosslink: dna}}
      flags: {attribute: evidence, kind: rna, values: {rbdmap_fragment: RBDmap, pclap_peptide: pCLAP}}
      motifs: {table: dna_motifs, kind: dna, url: "https://jaspar.elixir.no/matrix/{id}/", fields: {id: matrix_id, name: name, class: tf_class, family: tf_family, consensus: consensus}}
      rbns: {table: rna_bind_n_seq, kind: rna, url: "...{id}", fields: {id: ..., conc: ..., kmers: ..., scores: ...}}
      eclip: {table: eclip, kind: rna, url: {ENCODE: "...{id}"}, fields: {id, source, cell, peaks, genes, gene_peaks, kmers, ratios, same, regions: {CDS: col, ...}}}
```

| Part | Table format | What the card shows |
|---|---|---|
| (viewer) `structure.bound` | `bound_windows` | per kind, the marks in contact (4 Å), their bound sequences and entries (the viewer's `s3d.b`); `structure.contacts` adds the PDB interfaces (`s3d.c`) |
| `near` | `bound_windows` | rows with `offset`: the marks that touch RNA or DNA through a neighboring residue (not shown again when in contact) |
| `regions` | `protein_records` | runs of residues bound in structures: `start`, `end`, `kind`, `entries` (a count), `sites` (marks inside, `; `-separated, `<accession>:<residue><position>`) |
| `crosslinks` | `residue_evidence` | residues crosslinked in cells: only rows with `start` = `end` are listed, `kinds` maps the table's codes to the card's kinds; `span` is how near a mark counts |
| `flags` | none | the marks whose attribute `values` hold a listed code, as a per-mark flag with its label: no peptide, fragment or extent is ever listed |
| `motifs`, `rbns`, `eclip` | `protein_records` | one row per profile or experiment, each field named by `fields`; `kmers` and `scores`, `genes` and `gene_peaks` are `; `-lists in the same order; `eclip.fields.regions` maps a region label to the column of its peak count; `url` (a string, or one per value of the `source` field) takes `{id}` |

The card's summary and tab titles count what it finds: the marks in contact, those in contact through a neighboring
residue, the residues crosslinked (and the marks within `span` of one), the bound regions, and which in-vitro or in-cell
data exist. A part with `kind` belongs to that tab only. Measured peptides and their extents (pCLAP, RBDmap) are never
published here: a site leaves them out of the tables it names and gives only a per-mark flag.

## The Proteins and Sites pages

Both pages read only data in the formats above, named in the site file, so another site, or a user's tables in the same
formats, gets the same pages with no code (`kit-tables.js`, `kit-sites.js`; `ptmc check` names what a block gets wrong,
`site.table_view_problems`; `tests/test_tables_pages.py`). A block a site does not write is replaced by a default; a
column whose data a site lacks is left out.

**`website.proteins`** (the Proteins page). `columns`: the table's columns after the protein and its count of marks (of
the selection, "/ total" when that differs), offered in the Columns menu (`default: true` shows at first; the reader's
choice is kept in the browser). Each `{id, label, menu?, default?, fixed? (always shown, not in the menu), help? (the header's hover), hide? (xs: dropped below
36rem; sm: below 56rem)}` and one of:

| Key | Value | Shows |
|---|---|---|
| `show` | `map`, `length`, `share`, `candidates` | the marks as ticks along the protein (the selection's tall, colored by the color attribute), its length, its marks over its candidate residues, its candidate residues |
| `counts` | `{attribute, values: {code: label}, dashed?: [codes]}` | the protein's marks (of the selection) with each value of a mark attribute, as chips |
| `classes` | `{analysis, classes: [codes]}` | the share of the protein's marks in these classes of a residue question |
| `attribute` | a protein attribute (`proteins.attributes`), with `format?`: `count` (a list's length), `l2` (signed, true minus), `p`, `int` | the value |
| `template` | `"{a} in {b} aa"` over protein attributes, `where?: {attribute, max?, min?}`, `sort?: <attribute>` | the words, when the condition holds |

Default: a site map, the length and the share. `download`: the TSV's columns, each `{name}` and one of `value`
(`accession, gene, entry, protein, aliases, length, candidates, marks, marks_shown`), `attribute` (a protein attribute;
a list joined with `;`), `classes` (the count of the protein's marks in them), `counts: {attribute, value}`.

**`website.sites`** (the Sites page; `quick: [attribute, ...]` names the colored attributes that get a quick filter above the table, default all; rows are wrapped by default, with a Compact rows button). Fixed columns: the protein, the site (numbered as `website.protein.numbering` says,
"UniProt R3" below; tags for the values of a list attribute, `site_tags: {attribute, values: {code: tag}}`), the color
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
| `partners: {table, key?, label?, gene_label?, score_label?, help?, classes?: {code: label \| class}, interpro?, attribute?: {id, label?, help?}, marked?, other?, scores?: [x]}` | a `protein_partners` table | filters `b:class` (a partner of a class code, `marked`, or `other`: neither), `b:gene` (a gene or accession), `b:score` (the partners counted: score at least x); search key `<key>:<class>` or `<key>:<gene>`. `data/partners.json` (read when first used; inlined in the one-file copy): `{genes, accessions, classes, bits (a partner's classes as bits), marked (0/1), rows: {protein index: [partner index, score × 1000, ...]}}` |

A **partner class** (`classes.<code>`) is a label, or `{label, role: writer | reader | anti-reader | cofactor | eraser, reads?, interpro?: [IPR...],
genes?: [symbol or accession], genes_file?: <path>, except?: [codes], pmid?, help?}`. `genes_file` is a tab-separated table with a header (lines starting with `#` are skipped, and record the query and date that made it) in the repository, usually under `sites/data/`: the values of its `accession` and `gene` columns are members as `genes` are. Its members are the partners with one of the genes, or with one of the InterPro ids
(read from the entry intervals of the site's input role named by `interpro`: columns `canonical_UniProtAC`, `interpro_accession`), less the members of the
classes in `except`; when classes are given this way the table's `classes` column is not read. The chip's hover shows the role, what it reads, the help and the
PMID. `attribute` adds a list attribute to the marks (the classes of the partners of a mark's protein, written into the run's `marks.tsv` as `a.<id>` when the
website is built), which a `kind: values` count question can tile. Site-file defaults the kit keeps off when absent: `website.sites.sort: {by: <column id>, desc?}`,
`website.protein.open_partners`, `website.protein.conservation.logo_mode: freq | bits`, `website.overview.statistic_label`.
An Overview card's `beside: {analysis, label}` adds a line under the tile's rows with another question's result for the tile's
first class, "<label>: 2.5×, q y" in the statistic and method the tile shows (the same question asked another way: a control,
such as `only_in: {marks: [...]}`, or the same pair from one source); a list of them adds a line each, in order. The other
question keeps its own page and rows in the downloads. A question's page links to the other questions of its `family` (the
same question for each type, say), so that variants left off the Overview stay one click away.
`website.overview.random_maps: {n: 3, title?, min_marks?, open?, enabled?}` (kit-random.js) is a closed fold, "Example proteins", at the end of the Overview: `n` proteins drawn at random, each end to end as one row in the protein map's style, with a small "Draw three others" link; absent or `enabled: false`, nothing is drawn.

**Header, folds and the footer.** `website.header.compact` (default true): the full header band (title, counts, citation line) shows on the Overview at the top only; every other page, and a question opened from the Overview, has a 56 px band with the site name (a link to the Overview), and only the search, the selection line and the tabs stay in view (on a phone they slide away on the way down and back on the way up, and are not animated under reduced motion); false keeps the full band everywhere. `website.overview.draw_first` (default 2) is how many Overview sections are drawn in full; `website.overview.cell_first: false` keeps the section whose card draws the cell (`drawing: true`) where the site file lists it, under its heading, instead of opening the Overview with it; later ones are a heading and a line, drawn when opened or scrolled to (a selection draws all). Examples start closed: `website.overview.starting_points.open`, `random_maps.open`, `website.pages[].groups[].open` and `groups[].sections[].open` (a `place: top` section) are false unless true. Folds are open or closed for one visit; a saved selection ("Save") stores the open folds with it and restores them when opened, and the address does not carry them. The footer shows "updated <date>" (the `ptmc web` time, `data.built`) with the kit version and short commit.

A filter group of `website.filters` places these filters by key (`keys: ["d:marks", "o:other_ptms", "m:at", "b:class", "b:gene",
"b:score"]`); a module may add kinds of its own (`K.filterKinds[kind]`: `valid`, `test`, and optionally `control`, `label`,
`value`) and search keys (`K.searchTerms[key]`: values → `[filter key, values]` or `{error}`). A protein attribute with
`control: chips` is offered as chips (match any). A term that cannot be read selects nothing and says why under the search.

`page_rows` is a free format with no key (rows of no site or protein: complexes, say): only a page reads it. A table a
page names (`website.pages`) is also written whole to `data/pages/<name>.json`: `{key, columns: [{name, type, label,
help?, values?}], rows: [[protein index, position?, values...]]}`, its key `residue` (a site-keyed format), `protein`
(keyed by accession) or `none`, a row's protein an index into the page's protein list (rows of proteins without a mark
left out of a keyed table), lists as arrays, flags as 0 or 1, numbers as numbers, missing as null. A column's type comes
from its name in the format (`partner_accession` a protein, `ids` and `classes` lists, `score` and `distance` numbers,
`partner_marked` a flag, `pubmed`, `doi`, `window` a sequence), else the page's `columns:` (`<column>` or
`<table>.<column>`: `label`, `type`, `values`, `help`); a free column is text unless the page says otherwise. With a
selection, a `residue` table keeps the rows of selected marks (and, for a block that compares, the other residues of
their proteins), a `protein` table the rows of proteins with a selected mark. `D.page_tables` gives each its key,
columns and rows; the one-file copy inlines the small ones.

## The front block (website.front)

A block of its own, not a regrouping of `website.overview.sections`. The page's data carries `front`, the block as
`ptmcontext/front.py` resolves it: the Overview's tiles read its short names, row labels and pathways, and the gene-list
test reads it too. The Overview opens with the cell and the nucleus drawn when a section card is
`{analysis: <website.cell.id>, drawing: true}`. The cards front end (`mode: cards`, a home of cards and a Sections menu)
was removed; `mode` takes only `classic`, and the `cards[]` and `rows` keys below are no longer
drawn by any page (only a cell card's `chip` word and the cards' `facets` are read); `topics[]` and `tiles[]` were removed. Without a block, the cards derive from the analyses' `section`
fields: one card per section in the order sections first appear.

| key | what |
| --- | --- |
| `mode` | `classic` (the only value) |
| `rows` | rows per home card (default 5) |
| `cards[]` | `title`, and `key` (its address word), `short`, `chip` (the word for what a row selects), `note` (a line under the card and under its questions' titles), `sections` (the analyses' sections it holds), `analyses` (questions it names, in order), `cell` (the cell drawing; needs `website.cell`), `rows`, `facets[]` (`analysis`, `label`, `measure: fold or odds`), `home` (`analysis` of a facet, and `classes` to show or else `top` and `q_max`) |
| `more` | heading of the card for the questions no card holds (default "More questions"); `false` when every question is in a card |
| `short` | question id to a short name (4 words or fewer) |
| `row_labels` | question id to class or set code to a short row label (a code is unique only within its question) |
| `summary_only` | question id to class codes left out of a card's summary rows, still on the question's page |
| `glossary` | the site's own terms and their hover text (fold, odds ratio and q are the kit's) |
| `examples` | the example chips: a search, or `{label, query}` (default: `website.examples`) |
| `pathways[]` | the pathway view, below: `analyses` (protein-set questions whose sets are pathways), `hierarchy` (`input` role, `set`, `parents`, `name`, `separator`), `members` (`input` role, `set`, `protein`), `source` (`name`, `version`, `licence`, `url`, `link` with `{}` for a set's id) |

`ptmc check` (`site.website_problems`) reports an analysis, section, facet, class or question the block names that the
site does not have, a measure that does not fit the question, a question in two cards, a second card with the same key,
`cell: true` without `website.cell`, a `home` that is not one of the card's facets, and, with `more: false`, a question no
card holds (every question must be reachable).

### The pathway view

`pathways` gives the rows of a pathway question a **Proteins** button that opens the pathway's sub-pathways as groups of
protein chips (methylated first, filled, with their sites; the others outlined; "k of n methylated in your selection"; the
address keeps `pw=<set>`). `ptmc web` writes the record of every tested set from the two tables into `data/pathways/NN.json` (16 files; a set is in
the file numbered the sum of its id's character codes modulo 16, a map from set id to record), read only
when a pathway is opened: `{id, name, top, n, acc, gene, groups: [{id, name, m}]}`, `gene` empty for a protein the site
lists. Genes of other proteins come from the snapshot's FASTA. The hierarchy table has a set id column and a parents column;
the members table a set id and a UniProt accession per row. Nothing is asked of the source's service; the page links to it.
The one-file copy has no pathway files and so no button. A site without `pathways` has none.

### The Overlap page

`#overlap?t=<terms>` (kit-overlap.js; `website.overlap`, schema in site.schema.json) compares two to `max_terms` (at most 4) terms. The address keeps the
terms (`t`, comma-separated, each percent-encoded: `s:<question>:<set>` a set of a protein-set question, `c:<question>:<class>` a class of another
question, `f:readers:<family>` and `f:enzymes:<class>`, `a:<attribute>:<value>` a protein attribute, `sel` the current selection, `sv:<name>` a
selection saved in this browser, `g:<names>` a pasted list), the unit (`ou`) and the open region (`or`); an old link's `ov` is read and ignored.

```yaml
website:
  overlap:
    terms_from: [panther_class, reactome_pathway]   # questions whose sets (protein-set) or classes are terms
    max_terms: 4
    leave_out: {some_question: [set_id]}             # sets not offered and not written (data that is not public)
    notes: {some_question: one main location per protein}   # shown under its terms in the picker
    term_sources:                                    # more terms, from a table of (term, protein) pairs
      - id: go_bp
        title: GO biological process
        members: {input: go_bp_annotations, protein: uniprot_accession, set: go_id, include: [{column: non_iea, equals: "true"}]}   # the evidence option: drop `include` to keep every annotation
        names: {input: go_bp_terms, id: go_id, name: go_name}
        min_size: 5
        max_size: 5000
        cite: ["Gene Ontology Consortium, Genetics 224:iyad031 (2023), doi:10.1093/genetics/iyad031", "Ashburner et al., Nat Genet 25:25 (2000), doi:10.1038/75556"]
    units: [proteins, sites, enzymes, readers]       # default [proteins, sites]; a unit with nothing to show is hidden
    enzymes: {roles: [writer, eraser]}               # classes of website.search.partners with these roles, by gene or genes_file
    readers:                                         # a protein is a reader when it carries any listed entry
      source: interpro_entries                       # a role: the table of InterPro entries (columns below)
      columns: {accession: canonical_UniProtAC, ids: [interpro_accession, member_database_accessions]}   # the defaults
      families:
        - {name: Tudor, ids: [IPR002999, PF00567], note: "..."}   # a new family is one entry; check each id on InterPro
```

Data. `ptmc run` writes `overlap_members.json` (above) for the questions in `terms_from`; `ptmc web` turns it into `data/overlap/universe.json`
(`{acc}`), `data/overlap/sets/<question>.json` (`{set: [index]}`) and `data/overlap/families.json` (`{readers: [{id, name, ids, note, m}],
enzymes: [{id, name, role, m}]}`, `m` indices into the universe), each read when the page first needs it, and gives the page `D.overlap`. A site run
before this key existed shows only the proteins with sites (no test). The page reads `selection.json` only through one accessor (`DATA.sd`).

A term source's members are read from the run's recorded inputs at `ptmc web` (it needs a run made with the inputs in the manifest), kept for the proteins of the reviewed proteome with `min_size` to `max_size` of them, and written to `data/overlap/sources/<id>/terms.json` (`{terms: [[id, name, proteins]]}`, read when the page opens, for the picker) and `<NN>.json` (`{term: [index]}`; a term's file is the sum of its id's character codes modulo `shards`, default 16; read when the term is chosen). The term is `x:<source>:<id>` in the address. The picker shows the term's id and size and finds it by either. An export that uses one of its terms carries the source's `cite` lines.

Regions. A region holds the elements (proteins, sites, or the proteins of the readers or enzymes) in exactly its terms. Proteins, enzymes and readers:
n in the region, k of them with sites, M of the N reviewed proteins with sites; fold = (k/n)/(M/N); p = P(X >= k), X hypergeometric(N, M, n)
(`ptmstats.hypergeom_sf`, the one-sided test of the protein-set engine, on the same counts: the test is symmetric in the marked proteins and the set,
and `tests/test_overlap.py` checks it equals the engine's `statistics.tsv` row of a question run over every reviewed protein); q = Benjamini-Hochberg over
the regions shown (the whole terms have a q of their own). Sites: the sites of the region (a site is in a term when its protein is, or, for a class or a
selection, when it is) with, only where every term describes proteins, Fisher's exact test (`ptmstats.fisher_p`) of the residues of the proteins with
sites, the sites in the region against the other candidate residues there and outside, pooled as the residue questions' "across all proteins" rows; with a
term that describes sites, counts only. A region of fewer than 5 elements is counted, not tested (no fold, p or q, and left out of the Benjamini-Hochberg family); a fold of 0 is shown as 0x; a region with a fold between 0.8 and 1.25 and q below 0.001 is flagged "large set; small effect"; the picker marks a term of over a quarter of the reviewed proteins "very broad" and shows every term's size. Both `sets.each` and ordinary protein-set questions can be terms. Figure. One row grammar for any number of terms: a block of the terms ("every protein of each term", which is also the colour key) and a block of the
regions, largest first. A region row has a membership dot matrix (filled in the term's colour when in, a small hollow dot when out) with a short label
("only B", "A + C"), a split size bar (with sites, then without; the tip reads "k / n") and the share with sites as a bar from the baseline rule (the
share of all reviewed proteins) to the region's share, with its 95% Wilson interval, filled (more `--more`, fewer `--less`) where q < 0.05 and hollow
where not; the values are the share, the fold and q. A region under 5 is counted ("3 of 3 · not tested"). One very large value cuts the size axis
(its bars are marked //). For 2 or 3 terms an area-proportional Euler glyph sits above (circles fitted to the exclusive regions by Nelder-Mead, counts
labelled inside at the pole of inaccessibility or outside on a leader, nothing overlapping; the largest misfit is stated when above 1%); a row and its
region in the glyph highlight together, and either selects. No glyph for 4 terms. The Sites unit shows the fold on a log axis centred at 1x with the
odds ratio's Woolf interval. The layout is a container query (a narrow figure puts the values under the bars). Keys and colour tokens are `--ov1` to
`--ov4` (terms, `validate_palette.js` passes for slots 1 to 4 in light and dark) and `--ov-k`, `--ov-n`, `--ov-ref`, `--ov-fill`; the directions are the
site's `--more` and `--less`. The export is the same rows as one SVG, 940 px wide (SVG, PNG), and the TSV adds `ci95_lo`, `ci95_hi` (Wilson interval of
the share; Woolf interval of the odds ratio for sites) and `tested` (0 or 1).

### The gene-list test

`#list?q=<names>` (kit-genelist.js) tests a pasted list of genes or proteins against every set of the protein-set questions
the front block's cards hold (their `facets` of kind `protein_sets`; a card's other questions are not tested). Enter in the search on two or more names and nothing
else opens it, and the selection bar's **Test this list** button links to it; both read the names with the search's own parser
(`K.sel.parse`), so names matched by another name are listed ("Matched by another name: TLS -> FUS") and names not found are
listed with any one-edit suggestion ("Not found"), never dropped silently. For each question its source's own background is
used: `selection.json` `protein_sets[<id>]`, `in_background` (the marked proteins, or genes through `of`, that the source
annotates), and each set's members within it. With n of the list in the background, N the background, M of it in the set
and k of the list in the set: fold = (k/n)/(M/N), p = P(X >= k) for X hypergeometric(N, M, n) (one-sided; p = 1 at k = 0),
q = Benjamini-Hochberg over every set of every question tested, small sets and k = 0 included. The function is
`ptmstats.gene_list_test` and its browser twin `PTMC_STATS.listTest` (kit-stats.js); `packages/ptmstats/tests/test_list_test.py`
checks that both equal SciPy's `hypergeom.sf` and `benjamini_hochberg`. The page shows the sets with k >= 1 by p (20, then
**Show all**; `all=1` in the address): Set, Kind (the question, "(genes)" for a gene source), In list (k of n), In set /
background (M / N), Fold, p (one-sided hypergeometric), q (Benjamini-Hochberg, <sets> sets), under the labeled note "A new
test, not in the release statistics" with the caveat that a chosen list is not a random draw. Its TSV (`<site>_gene_list_test.tsv`)
has the usual `#` preamble (version, selection) and `# Input`, `# Genes tested`, `# Matched by another name`, `# Not found`,
then `set, set_id, question, kind, in_list, list_in_background, in_set, background, fold, p, q` for every set tested. The
test is computed in the browser only: `statistics.tsv` and the parity with the release do not change.

### Variants and downloads

The site card opens with the variants at the residue: UniProt's natural variants (disease named) and the site's `changes`;
the map labels every variant that falls on a mark. The search reads `R216C` (that position in every protein) and
`FUS R216C` (the site; the change is not matched), and says what it matched.

Every TSV a question writes has the header lines (`#`) with the citation and the selection in words. Print shows the
selection, the version and the citation (a block only Print shows); the PDF's foot carries them; a link that names a page,
a protein or a selection carries `dv`; a variant's downloads (the lower-confidence version) carry its name in the file
name and in the header.

## Page features: highlight, table figures, small words and switches

**Highlight (`hl=`).** The Highlight box (and `hl=` in a link) takes a pasted list of genes, accessions or sites ("FUS R216"),
separated by commas, semicolons or lines. It marks them in every figure that plots individual items (an IDR, a site, a
protein) with a ring and, for 12 or fewer, a label, and lists them in a small table beside the figure, in its export and as
TSV. It narrows nothing: counts, tests and tables do not use it. A name that matches nothing is reported ("not found"),
never dropped; lists can be saved in the browser. The selection itself is highlighted too. Code: `kit-hilite.js`
(`K.hl`); a statistic never reads it.

**Table figures.** Every table of a page with more than two rows gets PDF, SVG and PNG buttons beside its TSV, drawn from
the rows the page shows (the same sort, filter and page; a long table is drawn to its first rows and says so; the TSV has
them all). Code: `kit-tabfig.js` (`K.tableFigure`, `K.tableExport`); the markup it reads is under "Page hooks".

**`website.placeholders`** (examples inside the page's input boxes, so no gene or motif of one site shows on another):
`highlight` (genes and sites for the Highlight box: `FUS, TDP-43, HNRNPA1 R218`), `partners` (gene symbols for the partner
network's Always-include box), `motif` (example motifs for the motif box and the search help: `GXRG, [RK]XR`) and
`motif_either` (an example of alternatives for the motif hint: `RGG,GAR`). A box without one shows no example.

**`website.default_background`**: the text most questions give as their `background:`; the Method page states a question's
background only when it differs. **`website.protein.conservation.reference`**: the source organism's name as the
conservation card labels its own sequence (and the TSV column `reference_residue`); default "Reference".

**`website.features`** switches parts of the page off; each is on unless set to `false`:

| key | switches off |
|---|---|
| `structure_3d` | the 3D viewer: the protein page's 3D fold, the Show in 3D buttons and the live structure lists |
| `highlight` | the Highlight box, pasted lists and the rings and labels in the charts |
| `table_figures` | the PDF, SVG and PNG buttons on tables (the TSV downloads stay) |

`tests/test_features.py` runs each module with its switch off and on.

## Page hooks (markup that modules read from each other)

A few modules read the page's markup instead of a `K.*` call. These attributes and classes are therefore part of the
contract: a module that draws them keeps them, and a module that reads them reads only these.

| Hook | Drawn by | Read by | Meaning |
|---|---|---|---|
| `tbody tr[data-acc="ACC"]` | the tables (`kit-tables.js`, `kit-sites.js`, `kit-proteins.js`) | `kit-hilite.js` | a row about one protein |
| `tbody tr[data-goto="ACC/POS"]` | the sites tables | `kit-hilite.js` | a row about one site (protein accession, position) |
| `a[href*="#protein/"]` | any module | `kit-hilite.js` | a link to a protein (`#protein/ACC` or `#protein/GENE/ACC`) or, with `/POS`, a site; a row holding one is tinted when its protein or site is highlighted. Links inside `.crumb`, `nav`, `.tabs`, headings, `#hl-bar`, `.fr-nav` and `.hl-row` are left alone |
| `tr.hl-row` | `kit-hilite.js` | `kit-tabfig.js` | a highlighted row, tinted in the table's figure too |
| `svg.minimap` | `kit-tables.js` | `kit-tabfig.js` | the protein map in a table cell; the figure redraws it from the SVG |
| `i.ix-on`, `i.ix-off` | `kit-interactions.js` | `kit-tabfig.js` | a yes or no dot in a table cell; the figure and the download write them as the characters for yes and no |
| `.results-head .cx` | the pages' heads (`kit-sites.js`, `kit-idrs.js`, `kit-figures.js`) | `kit-tabfig.js` (`K.pageCx()`) | the line that says what the page shows now; it becomes the figure's subtitle |
| `.tbl-card`, `.tbl-wrap`, `.cv-wrap` | the pages | `kit-tabfig.js` | the box a table sits in, where its figure buttons go |
| `.exp`, `.fr-dl`, `.hl-tbl` | the download menus and the highlight list | `kit-tabfig.js` | tables inside these are not given figure buttons |

`K.tilekit` (`kit-tile.js`) is optional for the Overview tiles: without it a tile has no downloads and no ruler.

## What the page reads at once and what it reads later

`index.html` holds the data of the first screen (`site-data`). Two files are read only when something asks for them:
`data/selection.json` (every mark with its classes and attributes) when a search, a filter, a selection in the address, the
Filters tab or a page that tests a selection first needs it (`K.sel.data()`), and `data/site.json` for the values of the
protein attributes (`proteins.attributes`) that the Overview's starting points (`website.overview.starting_points`: what a
list ranks by, filters on and shows) do not list. The page's data names them in `late: {file, protein_attributes: [name]}`;
until the file is in, such an attribute reads as missing (`attribute_specs` and `protein_attributes.specs` stay inline,
since filters name them) and the page draws again when it arrives (`kit-late.js`). The one-file copy
(`<site id>.html`) has everything inline, no `late` and nothing to fetch.

## Values by name (data.column_index)

A mark's record in a protein file is `[position, window, classes, attributes]`: the classes follow `mark_columns` (one
per question) and the attributes `mark_attributes` (one per `marks.attributes` entry), in the site's own order; a row of
`proteins` follows `column_index.proteins` (accession, gene, name, length, marks, candidates, entry). The page's data
carries `column_index` (`mark_columns`, `mark_attributes`, `proteins`: name to place). A page finds a value by name
(`K.cols.markAttr(m, name)`, `K.cols.markClass(m, name)`, `K.cols.field(p, name)`; kit-cols.js), never by a fixed
place, so a site with other questions or attributes gets its own values, and a name the site lacks gives nothing.

## Website pages

A page of sections (`website.pages`, `kit-interactions.js`), each section a list of blocks, every block reading
the statistics rows, the marks' attributes or a table of `website.tables` (above) by name. A page registers its tab and its sections in the
sidebar; `#<page id>/<section id>` opens one section alone, with Previous and Next. A block whose data the site does
not have is left out; a section with no block left, and a page with no section left, are not shown.

```yaml
website:
  pages:
    - id: <id>                 # the address (#<id>) and the tab
      tab: <label>
      title: <the page's question>
      sub: <one line under it>
      method: <how it was made: the Method page's section for the page>
      answer: {rows: [<row refs>], more: "<sentence with {list}>", none: "<sentence>"}   # the answer sentence
      highlights: [<highlight>]          # cards under it
      overview: {section: <Overview section>, title: <tile>, bar: <category attribute>, rows: [<row refs>], findings: [<finding>], sub: <...>}
      groups:
        - name: <group>
          sections:
            - {id: <id>, title: <title>, question: <question>, tile: <block index for the tile, default 0>, blocks: [<block>]}
```

A **row ref** is `{analysis, category, label?, group?}` (a statistics row; `category` is the class code, for a question
of several tests `<category>` or `<category>_<stratum>`). A **highlight** is `{rows: [row refs], label, tag, section}`
(the range of their effects where they differ, "1.3–1.7×"), `{count: {attribute, values}, label, tag, section}` (marks
with any of those values of a list attribute, as "261 · 91" for several groups: `counts: [{attribute, values}]`), or
`{share: {table, of, flag}, label, tag, section}` (the share of a table's distinct `of` values whose `flag` is true). The
Overview question's **findings** (`overview.findings`, the first three also on its tile, the rest behind "Show N more")
are each `{lead, rows: [row refs with phrase], section}`, one sentence that says every row's direction (more often,
less often, about as often, or not significantly more or less often) with its numbers behind it, or `{share, label,
section}`; with a selection, the rows are the selection's retest. Without `findings`, each overview row that differs.

Blocks (`kind`):

| Kind | Reads | Draws |
|---|---|---|
| `forest` | `rows: [row refs]` (with `group` headings), `method` (default within each protein) | odds ratios with 95% CIs, counts, q; with a selection, its rows tested again in the browser beside the whole dataset's |
| `lines` | `analysis`, `series: [category]`, `x: {<stratum>: <number>}`, `x_label` | each series' odds ratio against x (a question's strata), with CI bands |
| `sets` | `analysis` (a protein-set question) | each set: marked proteins in it against all, fold, q, and its reading within abundance deciles |
| `shares` | `attribute` (a category attribute of the marks) | a stacked bar of its values among the (selected) marks |
| `combinations` | `attribute` (a list attribute), `values` (columns, in order), `top` | an UpSet-style table: each value's marks, and the commonest combinations; a click selects them |
| `matrix` | `attribute` (a list attribute: columns), `rows: [{filter, value, label, group}]` (a filter key as the Filters panel's: `a:<analysis>`, `t:<attribute>`) | odds ratio of each row feature among the marks with each column value against those without (pooled or within proteins), with n |
| `checker` | `attributes: [names]`, `tables: [names]` | a search box: a mark's values and its rows in those tables |
| `example` | `tracks: [kinds]`, `protein` (default accession or gene) | one protein's map with those tracks, chosen in a box |
| `table` | `table`, `columns: [names]`, `group_by`, `chips` (a column whose values filter), `sort`, `limit`, `search` | the rows (a selection's own), sortable, with links |
| `bars` | `table` (key protein), `label` (a column), `groups: {column, values: {code: title}}`, `top` | for each group value, the labels counted by distinct (selected) proteins |
| `pairs` | `table` (key protein), `label`, `rows: {column, value}`, `cols: {column, value}` | a matrix: proteins that both a row label and a column label pair with |
| `histogram` | `table` (key residue), `value` (a number column), `step`, `max` | the values of marks against the other residues, binned |
| `text` | `text` | a paragraph |

Every block offers PDF, SVG, PNG (figures) and TSV (its rows), each with the provenance block, and a Method link.

## The landing page

`ptmc pages` writes one card per built site (ptmcontext/web/landing.py), each a single link into its site. From the site file:
`website.name`, `band`, `accent`, `accent_dark` (the card's colors), `art` (its header picture), `logo` (an SVG file: the mark beside the card's title, and the site's header mark and favicon; `icon` is its older name), `landing.tagline` (the hook),
`landing.question` (what a reader can ask), `landing.cta` (the button; else the config's `cta`, `{marks}` being the profile's
plural word), `website.stats` (a list attribute adds a third number: how many studies or databases). From the site's build
(`run.json`, `web/glance.json`): the marks and proteins counted and the strongest finding; a build without them gives a
card without those lines. The strongest result is chosen from the build (the largest effect among the significant rows, one
per question, on at least 20 marks) unless `website.landing.findings` names one. A site whose outputs are missing is left out with a warning under `--skip-missing`, else the build stops.

The page's own words are a landing config (`ptmc pages --landing FILE`, else `landing.yml` beside the first site file):
`title`, `description`, `lede`, `logo` (an SVG file for the page's header and favicon), `switcher: {label}` (the word of the sites' header and sticky-bar switcher, "PTM"; else a site file's `website.switcher.label`; written to `sites.json`), `intro` (paragraphs), `cta`, `order` (card ids), `groups` (`[{id, title, note, compact}]`:
rows of cards, a card going in the group named by its site's `landing.group`, else the first; a `compact` row has smaller cards,
e.g. other organisms), `footer: {links: [{label, url}], note}`,
and `soon`: cards without a link for sites not built yet (`id`, `name`, `tagline`, `question`, `band`, `accent`,
`accent_dark`, `art`, `badge`, `cta`). Replace a `soon` entry by the site's file in the command when it is built.

## The entry pictures

The Overview's start panel and each landing-page card draw three pictures from the site's own statistics (`web/glance.json`,
`D.glance`): one bar of where the marks fall (a question whose classes add up to the marks), the three strongest findings
(one per question, q <= 0.05, at least 20 marks) and, on the site only, one example protein as a map. Without a choice
in the site file they are computed; `website.start` (`share: {analysis, classes, labels}`, `findings: [{analysis, class}]`,
`protein`) names them, and `website.landing` (`share`, `findings`, `tagline`) overrides them for the landing card; `website.landing.from_section: <Overview section>` chooses the landing card's result from that section's questions only (the card that draws the cell stands for the `website.cell` maps), so the card's result (`landing_findings` in `glance.json`) matches what the Overview opens with; the start panel keeps its own. `website.landing.unlisted: true` builds the
site's folder with `ptmc pages` but leaves its card off the landing page. `ptmc pages` also writes `sites.json` beside the folders
(`{sites: [{id, label, listed, in_switcher}]}`, the label being `landing.label` or the mark profile's name): the header's "Mark" menu
(kit-switch.js) reads it, lists the listed sites, lists an unlisted site only in the menu of an unlisted site or where its own
`landing.in_switcher` is true, and opens the chosen site with the reader's search (`q=`), highlight (`hl=`) and filters (`f=`); the
filters the target does not have are dropped, and the target says how many in a short notice. A site served alone has no
`sites.json` and no menu.
