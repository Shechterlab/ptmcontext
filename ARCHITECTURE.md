# Architecture

One background, many marks and units. Everything that is the same for every modification and every proteome is
written once, here; everything that differs is a file.

## The pieces

| Piece | Is | Lives in | Contract |
|---|---|---|---|
| **snapshot** | the reference sequences (UniProt release, FASTA MD5) every position refers to | `ptmcontext/snapshot.py` | the FASTA's MD5 |
| **manifest** | every input file: source, release or date, licence, MD5 | `inputs.json`, or a site's own `sites/<site>.inputs.json` | `schemas/inputs.schema.json` |
| **staging** | the only step that uses the network: download, convert to a contract, record in a manifest | `ptmcontext/stage.py`, `ptmc stage` | the unit and marks tables |
| **units** | regions as rows: disordered regions, IDRs, domains, flanks, segments, sites | `ptmcontext/units.py` | `schemas/units.schema.json` |
| **layers** | an annotation of every candidate residue: a class (disorder, domain context, the charge of its IDR, ...) or flags (motifs) | `ptmcontext/layers/` | a `Layer` reading **roles** (`disorder`, `domains`) |
| **profile** | everything specific to one mark: residues, states, enzymes, motifs, words | `ptmcontext/profiles/<mark>.yaml` | `schemas/profile.schema.json` |
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
(one file, for sharing). Layout and behaviour are the kit's, in the Methylarginine Site Explorer's look: the header
band with its orange rule, the search with example chips, tabs with counts, cards of dot rows, light and dark themes.
A site's `website:` block sets its name, tagline, band colours, accent, type, icon, header picture, lab, links,
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
computed on: a banner says so when it is not), AlphaFold DB (the model in 3D with 3Dmol, and its confidence drawn on the
map only when its sequence is the same) and PDBe (experimental structures, one row per entry, with the marks each
covers). Each says where it came from and when, and fails softly.

**Selections.** The search (genes, accessions, sites such as `GENE R216`, terms such as `motif:RGG,GAR`) and the
Filters panel make a selection; every page then shows it, and the Overview tests it again in the browser, as the site's
own rows were: residue questions within each protein (Mantel–Haenszel) and pooled (Fisher), the selected marks against
the other candidate residues of their own proteins; protein-set questions by the hypergeometric test over the sets the
site tested. A question the selection was made with (or one reading the same data) is shown, not tested; a selection of
fewer than 10 proteins or 30 marks is shown, not tested. The browser's numbers match SciPy to about 1e-9
(`tests/test_web_stats.py`). The original explorer's links (`#P35637`, `#P35637/R216`, `#about`) open the same pages.

**Modules.** `kit.js` is the core (state in the URL, tabs, Overview, All tests, Method, figures and downloads); the
others register with it through `window.PTMC_MODULES`: `kit-stats.js` (the tests, for selections), `kit-select.js`
(search, filters, the sidebar, selections and their tests), `kit-map.js` (the protein map: rows, hovers, pins, zoom,
read-out, exports), `kit-proteins.js` (the Proteins tab and the protein page), `kit-sites.js` (the Sites tab), `kit-tables.js` (the Proteins tab and the parts both tabs share: Columns, site maps, Your selection, Enriched features, empty states, citation box, downloads in the site file's columns: `website.proteins`, `website.sites`),
`kit-idrs.js` (the IDRs tab, from a track whose values include `fcr` and `ncpr`), `kit-sitecard.js` (the site card's blocks, the sites table's Evidence rows and the citation box, from the tables of CONTRACTS.md's "Tables the protein pages show"), `kit-cell.js` (several maps of the cell as one question: `website.cell`; the drawings' parts in `config/cell_drawings.json`), `kit-values.js` (a protein-set question with its proteins' numbers: `website.set_views`) and `kit-compare.js` (what sets a
selection apart from the other marks, and two selections side by side). `kit-counts.js` (questions answered by counting the marks rather than testing them, `website.counts`: their tiles, pages, filters, downloads and Method sections; a module's question draws its own tile and page through `A[id].tile` and `A[id].page`, and may add a kind of filter, `K.filterKinds`). A new view is a new module; a module may draw a question of its own or its own tile and page for one (`K.questions`) and add a Method section (`K.methods`).

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

**The header's citation line** names the studies and databases that report the most marks (the list attribute a header
tile counts), each linked to its paper, and how many there are in all.

**Every download is standard.** Each card offers PDF, SVG, PNG and TSV, and the statistics page a TSV of the rows shown.
Each carries the same block: what it shows, the test and correction and the reading rule, the citation and data sources
(from the site's CITATION.cff), the site's version and date, the kit's version and commit, the sequences (release, FASTA
MD5) and every input's MD5, the run's date, and when and from where it was exported. The block is visible in the figure,
and in the file's own metadata: SVG `<metadata>` (JSON), PNG text fields and its 300 dpi, PDF document properties with
Arimo (an Arial-like face) embedded; every export is set in Arial, Helvetica or Arimo, and the TSV's `#` lines (readers skip them: `pandas.read_csv(..., comment='#')`).

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
