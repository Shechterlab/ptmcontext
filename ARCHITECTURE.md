# Architecture

One background, many marks and units. Everything that is the same for every modification and every proteome is
written once, here; everything that differs is a file.

## The pieces

| Piece | Is | Lives in | Contract |
|---|---|---|---|
| **snapshot** | the reference sequences (UniProt release, FASTA MD5) every position refers to | `ptmcontext/snapshot.py` | the FASTA's MD5 |
| **manifest** | every input file: source, release or date, license, MD5 | `inputs.json`, or a site's own `sites/<site>.inputs.json` | `schemas/inputs.schema.json` |
| **staging** | the only step that uses the network: download, convert to a contract, record in a manifest | `ptmcontext/stage.py`, `ptmc stage` | the unit and marks tables |
| **units** | regions as rows: disordered regions, IDRs, domains, flanks, segments, sites | `ptmcontext/units.py` | `schemas/units.schema.json` |
| **layers** | an annotation of every candidate residue: a class (disorder, domain context, the charge of its IDR, ...) or flags (motifs) | `ptmcontext/layers/` | a `Layer` reading **roles** (`disorder`, `domains`) |
| **profile** | everything specific to one mark: residues, states, enzymes, motifs, words | `sites/marks/<mark>.yaml` | `schemas/profile.schema.json` |
| **tests** | is the mark over-represented in a class, pooled and within protein | `ptmcontext/residue_tests.py`, `stats.py` | statistics rows |
| **statistics** | one table every test writes into, in the published release's columns and formatting | `ptmcontext/statistics.py` | `schemas/statistics.schema.json` |
| **site** | one file choosing the mark, the snapshot, the inputs for each role, the marks, the analyses, a reference | `sites/<site>.yaml`, `ptmc run` | `schemas/site.schema.json` |
| **parity** | a published output the rebuild must equal, row for row | `ptmcontext/parity.py` | the reference table's MD5 |
| **citation** | how a site is cited, its data sources, version and date | `sites/<site>.citation.cff`; the kit's own `CITATION.cff` | Citation File Format 1.2.0 |
| **website** | the site's pages: Overview cards, every test, Method; downloads of every figure and table | `ptmcontext/web/`, `ptmc web` | the site file's `website:` block |

```
           ptmc stage                    ptmc run sites/<site>.yaml
upstream ───────────► staged files ──► snapshot ─┬─► candidate residues (profile.residues)
(UniProt, MobiDB, …)  + manifest (MD5)            ├─► layers, by role (disorder, domains, motif, …)
                                                  ├─► marks (site file: which table, which rows)
                                                  └─► residue tests ─► statistics.tsv + run.json
                                                                        ├─► parity vs reference (if any)
                                                                        └─► ptmc web ─► out/<site>/web/ (+ CITATION.cff)
```

## Adding a question or a source without code

- **Inputs** are read by a manifest entry's column mapping (`columns`), else by the first registered reader that knows
  the file (`units.READERS`: the unit table, staged MobiDB, staged InterPro; a trusted plugin may add one).
- **Layers** are built in, made from a site file's parameters (`layers.FACTORIES`: `regions` for any interval table,
  `residue_values` for any per-residue value, `residue_lists` for tables that list residues), or trusted plugins. A
  residue question may count only the proteins a table lists (`proteins:`). Each declares the roles it reads and,
  optionally, what it draws (`Layer.tracks`: a kind of region, its style, the roles it comes from, and the numbers each
  region carries, `Track.values`, which the run writes with the marks inside each region).
- **The run records what the website shows**: each layer's words (title, labels, help, question, shape) in `run.json`,
  its regions in `units.tsv` and what each kind is in `tracks.json`. The website reads these, so it shows a plugin's
  or a configured layer's question exactly as a built-in one, and draws any track; it knows no layer by name.
- **Protein-set questions** read any (set, protein) table or class hierarchy (`set_tests.py`), or make their sets
  from a table's columns by rules (a protein in the first set whose conditions hold: a value at least a threshold, a
  share of two columns, a flag). Sets keyed by another
  identifier (Entrez genes) come with the tables that map the site's proteins to it (`identifiers`), and sets gathered
  into families by name with the site's own rules file (`sets.families`, `sites/data/`): curated vocabulary is a site's
  data, never code. A table's rows may be kept by what other tables say of one of its columns (`sets.where`: CD-CODE's
  members of human proteins, in human condensates that are not synthetic), its members brought to current entries
  through an accession history (`sets.history`), and its rows written in a release's own order (`order`).
- **Stagers** are a registry (`stage.STAGERS`); the per-proteome paths a stager needs live in `ptmcontext/config/`.

## The website

`ptmc web sites/<site>.yaml` writes `out/<site>/web/index.html` with `assets/` (for GitHub Pages) and `<site>.html`
(one file, for offline use; `ptmc pages` leaves it out of the published site). Layout and behavior are the kit's, in the Methylarginine Site Explorer's look: the header
band with its accent rule, the search with example chips, tabs with counts, cards of dot rows, light and dark themes.
A site's `website:` block sets its name, tagline, band colors and accent (`band`, `accent`, `accent_dark`: every site
should set them; a site that sets none gets neutral greys, and exports, the band's link tints and the drawn protein follow
the accent), type, icon, header picture, lab, links,
example searches, the tiles under the header (`stats`), what the Overview opens with (`overview`: sections of tiles,
each a question with its most telling classes) and the groups of the Filters panel (`filters`); a site without a
picture gets a drawn protein with its marks. `ptmc check` confirms that every analysis and attribute these name exists.

**Pages.** Overview (tiles: each question with its classes at a glance and its answer, grouped in sections; a
tile opens its figure, and a class in it selects its marks), Sites (every mark: its protein, state, the studies that
report it, the 15 residues around it, its context), Proteins (every protein with a mark, searchable by gene, accession, name or a gene list), a page
per protein (its map of domains, disordered regions and marks; how its marks compare with its own other residues; its
marks one by one; live cards from UniProt, AlphaFold DB and PDBe), IDRs (when the run wrote IDR parameters: every IDR
in the Das–Pappu diagram of states, the diagram's regions compared, κ with and without marks, every IDR in a table; it
describes, and the residue tests are the statistics), All tests and Method. `ptmc run` writes what the
protein pages read beside the statistics (`marks.tsv`, `protein_counts.tsv`, `proteins.tsv`, `units.tsv`); `ptmc
web` splits it into 64 files, so a protein page loads one.

**Live sources add, never change.** UniProt (function, and a check that the sequence is still the one the results were
computed on: a banner says so when it is not), AlphaFold DB (its confidence drawn on the map only when its sequence is
the same) and the 3D structure (`kit-3d.js`, with 3Dmol.js loaded when it opens): the PDB chain that models most of the
protein or any entry and chain, the AlphaFold model, homologous structures and predicted complexes, read live by
accession from AlphaFold DB, PDBe, RCSB and ProtVar, colored like the map, with ChimeraX, PyMOL and coordinate
downloads. What the marks touch in those structures comes from the site's own tables when it has them
(`website.protein.structure`, CONTRACTS.md "Structure evidence"); every export says which parts were live and which
were the site's. `K.show3d(acc, {pos, entry, chain})` opens it at a mark from anywhere. Each says where it came from
and when, and fails softly.

**Selections.** The search (genes, accessions, sites such as `GENE R216`, terms such as `motif:RGG,GAR`) and the
Filters panel make a selection; every page then shows it, and the Overview tests it again in the browser, as the site's
own rows were: residue questions within each protein (Mantel–Haenszel) and pooled (Fisher), the selected marks against
the other candidate residues of their own proteins; protein-set questions by the hypergeometric test over the sets the
site tested. A question the selection was made with (or one reading the same data) is shown, not tested; a selection of
fewer than 10 proteins or 30 marks is shown, not tested. The browser's numbers match SciPy to about 1e-9
(`tests/test_web_stats.py`). The original explorer's links (`#P35637`, `#P35637/R216`, `#about`) open the same pages.

**Modules.** `kit.js` is the core; the others register with it through `window.PTMC_MODULES` and are loaded in the order of `MODULES` in `ptmcontext/web/__init__.py`, which matters (a module reads what an earlier one put on `K`). A module knows no mark, source or organism by name: its words come from the page's data. The names of the kit's state (`D`, `W`, `S`, `K`, `A`, `PV`, `R`, `RUN`, `ST` and the others) are listed at the head of `kit.js`; the markup modules read from each other is in CONTRACTS.md, "Page hooks".

| Module | What it does |
|---|---|
| `kit-busy.js` | a quiet progress bar and screen-reader status while a data file of the site is still coming (wraps `fetch`) |
| `kit-papers.js` | PubMed identifiers: `K.papers.ids(value)` splits on `;`, `,` or space, `K.papers.links(ids)` is one link each, a long list collapsed to "N papers" |
| `kit-cols.js` | values by name (`K.cols`): a mark record's classes and attributes by column name, whatever a site has |
| `kit-late.js` | data read when first asked for (`D.late`: the protein attributes' values in `data/site.json`) |
| `kit-stats.js` | the tests in the browser; this is `ptmstats.js` of packages/ptmstats, copied under that name |
| `kit-select.js` | the selection model, `K.sel`: search, filters, selections and their tests; no page of its own, no document needed |
| `kit-rail.js` | the sidebar (Sections, Filters), the selection line and saved selections; a row that selects goes to the page top |
| `kit-search.js` | the search box's suggestions and the line under it that says what it read |
| `kit-near.js` | filters that read more than a mark's own classes: nearby marks, motif patterns, partners |
| `kit-selview.js` | a selection's Overview beyond its tiles: what sets it apart, in brief |
| `kit-shown.js` | marks shown and counted nowhere (the variants' lower-confidence rows) |
| `kit-link.js` | `K.site`: the one channel that links a protein's sites between the views that show them |
| `kit-tabfig.js` | a table of the page drawn as a figure (PDF, SVG, PNG beside TSV); `website.features.table_figures` switches it off |
| `kit-hilite.js` | highlighting genes and sites in figures (`K.hl`, the `hl=` list); `website.features.highlight` switches it off |
| `kit-map.js` | the protein map: marks as lollipops over the domains and regions, with rows from named sources |
| `kit-3d.js` | the protein page's 3D structure (3Dmol.js loaded when it opens); `website.features.structure_3d` switches it off |
| `kit-columns.js` | a table's optional columns in a Columns menu, remembered per table |
| `kit-tablefit.js` | marks a table wider than its card (`.has-x`) and puts a "scroll sideways" hint above it; the edge fade and the visible scrollbar are in `kit.css` |
| `kit-sitecard.js` | the site card's blocks, the sites table's cells and Evidence rows, the citation box |
| `kit-pagepdf.js` | a page as an A4 PDF without the print dialog |
| `kit-proteins.js` | a page per protein (map, its marks, live cards) and the protein page's sections registry (`K.proteinFoldSections`) |
| `kit-tables.js` | the Proteins tab and the parts the Proteins and Sites pages share (`website.proteins`) |
| `kit-sites.js` | the Sites tab (`website.sites`) |
| `kit-idrs.js` | the IDRs page (a tab, or with `website.tabs.idrs.as: section` a question's page): charge diagram, regions compared, every IDR in a table |
| `kit-compare.js` | the way in to comparing marks with marks (`vs=cmp`) |
| `kit-questions.js` | one question seen several ways on an Overview card (views, more sets, protein cards of sets) |
| `kit-start.js` | starting points on the Overview: ranked proteins and ready-made selections |
| `kit-random.js` | example proteins drawn at random at the end of the Overview |
| `kit-counts.js` | count questions (`website.counts`): tiles, pages, filters and Method sections of questions answered by counting |
| `kit-cell.js` | where in the cell: maps of the cell as one question (`website.cell`) |
| `kit-values.js` | a protein-set question drawn with its proteins' numbers (`website.set_views`) |
| `kit-factors.js` | several factors at once (a conditional-logit analysis) |
| `kit-help.js` | the start panel, the Help page, keyboard shortcuts, focus and screen-reader help |
| `kit-conserve.js` | conservation across species and the selection's sequence logo (`website.protein.conservation`) |
| `kit-interactions.js` | pages of sections laid out by the site file (`website.pages`; the Interactions page) |
| `kit-pcards.js` | the protein page's context cards (`website.protein.cards`) |
| `kit-pnet.js` | protein interactions (STRING, live) and interaction evidence at a glance |
| `kit-prna.js` | RNA and DNA interactions: the `p-na` fold |
| `kit-pfolds.js` | the protein page's folds: a picture in each header, and the This protein / Dataset context switch |
| `kit-pix.js` | the protein page's Interactions view, site first |
| `kit-genelist.js` | the gene-list test (`#list`) |
| `kit-pathway.js` | the pathway view (`website.front.pathways`) |
| `kit-tile.js` | the Overview tiles' rows, axis, answer line and download menu (`K.tilekit`) |
| `kit-figures.js` | the figure panels page ("Make figures") |
| `kit.js` | the core: state in the URL, tabs, Overview, All tests, Method, figures and downloads; runs the modules last |

The protein page's sections are registered, not wrapped: a module that adds a fold pushes `[id, title, level]` onto `K.proteinFoldSections`, and the core lists them once, as the page arranges its folds by the site's `website.protein.order` and `groups`. The cards front end (`website.front.mode: cards`) was removed; the front block (`website.front`) still gives the tiles their short names, row labels and pathways.

**Comparisons.** What a selection is compared with is the Overview's baseline: the other residues of its proteins (the
site's own tests), the site's other marks ("what sets it apart"), or another selection's marks (`vs=cmp`, `cmp=` its
search and filters; `#compare` picks one saved in the browser). Against marks, every question and every attribute of
the marks (as `@<name>`) is tested pooled (Fisher, Woolf's CI), within proteins with marks in both groups, and within
studies: Mantel–Haenszel over marks reported by exactly the same sources (`website.compare.stratify`), so a
difference is not which studies report the marks. Tiles show each class as two shares; a lead sentence gives the
differences with most evidence (CI bound nearer 1, at least 10 marks) and whether each holds under the other two
tests; attributes marked `provenance: true` are shown as a caveat ("How they were found"), not as findings. The
questions a selection was made with are left out, and marks two selections share are left out of both. One engine
(`kit-select.js`, `contrast`) serves every question, so tiles, opened questions, hovers and downloads work the same
for every baseline. The browser's within-study test equals `ptmcontext.stats.mantel_haenszel` on the same tables.

**One question, several ways.** An Overview card may show one question through several protein-set questions
(`views`: two vocabularies of disease, say, a switch on its page), with more sets tested apart behind a button (`more`),
the sets its families gather each with its own test (`members`: a table with a picker of families) and, for a question
whose sets form an ontology (`hierarchy`), its most specific enriched sets, its tree and a table of every tested set
(`ontology`). `kit-questions.js` draws them from the site file's words and the run's `parents`, `root` and `gathers`;
protein pages get cards of the protein's own sets (`website.protein.sets`), each linked to the set's page (`link`). A
question its release keeps outside its statistics table is checked against that table (`reference.tables`).

**The protein page** shows what the site's tables say of each mark (`website.tables`, in the formats of CONTRACTS.md, mapped from any source's columns in the site file): the site card's interaction evidence, bound sequences, records of who binds it, writer and reader, the methylation state by source; the sites table's optional columns and Evidence rows (every source record, every measurement); how to cite the protein's marks. A protein without marks has a light page (its map, the records naming it as a partner, its partners with marks). It also shows, from data the site already has: the protein's sets in each protein-set question with
the site's result for each and its abundance decile as the tests used it; every region the questions read, with the
marks inside; and the sequence with its marks, as FASTA.

**Count questions** (`website.counts`) describe rather than test: how many marks each value of an attribute has (the
studies or databases that report them, say) and how many values each mark has; or a table of experiments, each with
the marks it measured, those whose call went down and up, and the median change. They read the marks' attributes and
per-mark tables (`marks.tables`: several rows per mark, kept by `ptmc run` for the website), in the formats CONTRACTS.md
gives, so any site with such data gets them from its site file alone. A selection is counted again in the browser; a
selection too small to test still gets them, as counts hold for any selection. A click on a value or an experiment
sets its filter and opens the Sites page.

**The protein map's own rows** (`website.protein.map`) show evidence along a protein that no question tests: each row
reads tables in one format (CONTRACTS.md, Map rows: a residue list, a region list or a per-site count), named by a role
and mapped column by column in the site file, so a release's table, a backend's export or a user's file gives the same
row; or it finds runs of a motif in the sequence. `ptmc run` writes the items (`map_items.tsv`, `ptmcontext/map_rows.py`),
`ptmc web` one file per protein shard (`data/map/`), and `kit-map.js` draws them by the classes, marks and colors the
site file gives, with the papers of their sources. The same block adds color modes made from the marks' attributes
(hollow classes; hatched marks) and the papers behind the rows' sources. A row a protein has no data for is absent, and
a site without the block has none of this. PDB interfaces (PDBe-KB) are a live row of the kit's own, for any site.

**The header's citation line** names the studies and databases that report the most marks (the list attribute a header
tile counts), each linked to its paper, and how many there are in all.

**Every download is standard.** Each card offers PDF, SVG, PNG and TSV, and the statistics page a TSV of the rows shown.
Each carries the same block: what it shows, the test and correction and the reading rule, the citation and data sources
(from the site's CITATION.cff), the site's version and date, the kit's version and commit, the sequences (release, FASTA
MD5) and every input's MD5, the run's date, and when and from where it was exported. The block is visible in the figure,
and in the file's own metadata: SVG `<metadata>` (JSON), PNG text fields and its 300 dpi, PDF document properties with
Arimo (an Arial-like face) embedded; every export is set in Arial, Helvetica or Arimo, and the TSV's `#` lines (readers skip them: `pandas.read_csv(..., comment='#')`).

### Linked sites

`kit-link.js` is the one channel between the views of a protein's sites: `K.site.hover(acc, pos, {from})` (a light highlight),
`K.site.focus(acc, pos, {from})` (the focused site, `null` clears it), `K.site.residue(acc, pos, {from})` (a position that is not a
site) and `K.site.on(fn)`. The map, the sequence, the sites table, the site card, the 3D viewer and the conservation table each
subscribe and none calls another; the protein page turns a focus into the card and the address. Elements with `data-msite`,
`tr[data-site]` and `data-cv-pos` are linked by delegation. The residue's label comes from the profile. `tests/test_site_link.py`.

## Rules the structure enforces

- **Change a site by changing its file.** Mark, organism, inputs and analyses are in `sites/<site>.yaml`; no code
  names a residue, a mark or an organism.
- **Layers read roles, sites bind roles to inputs.** The domain layers read whatever unit table fills `domains`: InterPro
  for the human release; for yeast, UniProt's features, then SHEPHARD's ECOD domains for the proteins UniProt leaves
  without (`first_of`). A new source needs a stager, not a new layer. A role filled by several inputs names its rule:
  `first_of` (each protein's units from the first input that has any for it, so no protein mixes two sources'
  boundaries) or `all_of` (every input's units).
- **A build never touches the network** and refuses any file whose MD5 differs from its manifest.
- **Other repositories' code is not run.** Their outputs are data with MD5s. Their layers come in only as plugins that
  a site names as trusted, recorded with their version in every run record.
- **Results are proven, not assumed.** A site with a reference fails if any row changes. A question the reference
  does not have says so (`new: true`): it is left out of the parity check and marked new on the website.

## How other repositories use it

| Repository | Uses | How |
|---|---|---|
| PTM_Pipeline (methylarginine) | the tests, statistics, snapshot and release format | `pip install` at a tag; its study parsers and PRMT layers stay its own |
| idr-explorer | units (IDRs, segments), the tests on a selection | a site file; IDR charge layers as a plugin or built in once their definitions are settled |
| a private repository | the kit, plus its own layers | a plugin package that the kit loads only when a site trusts it; nothing private enters this repository |

## Not yet built

Isoform-to-canonical placement of marks; the site union from study tables; the remaining protein-set sources
(functional classes, the nuclear-body proteomes, GO binding, the eCLIP maps of RNA);
measured backgrounds (candidates limited to residues covered by detected peptides); unit-level tests (IDRs as the
unit); the release writer (sites and proteins tables, data dictionary, README, CHANGES, MD5SUMS). On the website:
comparing two selections, "what sets it apart", the Figures view, and the protein page's class, pathway, abundance,
conservation and sequence sections.
