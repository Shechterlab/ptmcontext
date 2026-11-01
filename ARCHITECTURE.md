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
  `residue_values` for any per-residue value), or trusted plugins. Each declares the roles it reads and, optionally,
  what it draws (`Layer.tracks`: a kind of region, its style, the roles it comes from).
- **The run records what the website shows**: each layer's words (title, labels, help, question, shape) in `run.json`,
  its regions in `units.tsv` and what each kind is in `tracks.json`. The website reads these, so it shows a plugin's
  or a configured layer's question exactly as a built-in one, and draws any track; it knows no layer by name.
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
marks one by one; live cards from UniProt, AlphaFold DB and PDBe), All tests and Method. `ptmc run` writes what the
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
read-out, exports), `kit-proteins.js` (the Proteins tab and the protein page) and `kit-sites.js` (the Sites tab). A new
view is a new module.

**Every download is standard.** Each card offers PDF, SVG, PNG and TSV, and the statistics page a TSV of the rows shown.
Each carries the same block: what it shows, the test and correction and the reading rule, the citation and data sources
(from the site's CITATION.cff), the site's version and date, the kit's version and commit, the sequences (release, FASTA
MD5) and every input's MD5, the run's date, and when and from where it was exported. The block is visible in the figure,
and in the file's own metadata: SVG `<metadata>` (JSON), PNG text fields and its 300 dpi, PDF document properties with
Inter and IBM Plex Serif embedded, and the TSV's `#` lines (readers skip them: `pandas.read_csv(..., comment='#')`).

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
| idr-explorer | units (IDRs, flanks, segments), the tests on a selection | a site file; IDR charge layers as a plugin or built in once their definitions are settled |
| MicroDomains (private) | everything, plus its private layers | a plugin package that the kit loads only when a site trusts it; nothing private enters this repository |
| glu_proteomics (private) | the statistics, instead of its own copies | `pip install` at a tag |

## Not yet built

Isoform-to-canonical placement of marks; the site union from study tables; the remaining protein-set sources
(condensates, functional classes, cell maps);
measured backgrounds (candidates limited to residues covered by detected peptides); unit-level tests (IDRs as the
unit); the release writer (sites and proteins tables, data dictionary, README, CHANGES, MD5SUMS). On the website:
comparing two selections, "what sets it apart", the Figures view, and the protein page's class, pathway, abundance,
conservation and sequence sections.
