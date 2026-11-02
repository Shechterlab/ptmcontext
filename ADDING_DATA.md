# Adding data: a guide for an AI agent (and for people)

Follow these steps in order. Each ends with a check that must pass before the next. Stop and ask the owner where a
step says so. Read [AGENTS.md](AGENTS.md) first; its rules override anything here.

## 0. Decide what the data is

Every new dataset is exactly one of these. If it is none of them, stop and ask.

| It is | Example | It becomes |
|---|---|---|
| **sequences** | a new UniProt release, another organism | a snapshot: `ptmc stage uniprot <proteome>` |
| **regions** | disorder, domains, flanks, charged segments, a lab's own regions | any table of intervals filling a **role**: a **unit table** (`schemas/units.schema.json`), or any layout its manifest entry maps with `columns`; a new kind of region is tested by the `regions` layer (no code) |
| **marked residues** | a PTM site list, an MS experiment's sites | a **marks table** (accession, position, plus any columns) selected by a site file |
| **a mark** | a modification not yet profiled | a **profile** (`ptmcontext/profiles/<mark>.yaml`) |
| **a per-residue value** | AlphaFold pLDDT, conservation, a variant-effect score | a per-residue table read by a **column mapping**, tested by the `residue_values` layer (no code) |
| **a per-protein annotation** | pathways, locations, classes, condensates, abundance | a (set, protein) table or class hierarchy for a **protein-set test** (no code); rows kept by other tables (`where`), old accessions through a history (`history`) |
| **a per-gene annotation** | disease terms (DisGeNET), any sets keyed by another identifier | a (set, identifier) table, with the tables that map the site's proteins to that identifier, for a **protein-set test** (no code); families of its sets by name: a rules file in `sites/data/` |
| **a published result to match** | a release's statistics table | a `reference_output` entry: read only to check parity |

## 1. Check the terms before downloading

- Find the licence on the source's own site. Record it word for word; if none is stated, write `none stated`.
- Unpublished lab data and analyses (unpublished MS included) never enter this repository. They go in a
  private repository as a plugin (step 6). **If unsure whether something is published, stop and ask.**
- A source that forbids redistribution is staged outside the repository and recorded with its MD5 only.

## 2. Stage it

Staging is the only step that touches the network. Prefer an existing stager:

```bash
ptmc stage uniprot UP000002311 --out DATA/inputs --manifest sites/<site>.inputs.json --prefix <site>
ptmc stage mobidb --out DATA/inputs --manifest sites/<site>.inputs.json --prefix <site>
```

For a new source, add a function to `ptmcontext/stage.py` that downloads, writes the table in the contract's
format and calls `stage.record(...)`. Requirements:

- the upstream URL, the source's release (from the response or the file, never from memory) or else the download
  date, and the licence go into the manifest entry;
- retries with backoff, and batching where the service limits a request (MobiDB: 1,000 proteins);
- coverage is reported (how many entries got data), and written into the entry's `note`.

For a file you were given rather than downloaded:

```bash
ptmc inputs record <name> <path under root> --root DATA --source "<where it came from>" --version "<release or date>" --licence "<licence>"
```

A file with no traceable origin is recorded with a note that starts `NOT TRUSTED`: the build refuses it unless a run
says `--allow-untrusted`, and nothing computed from it is committed.

**Check:** `ptmc inputs --root DATA` lists the entry as `ok`.

## 3. Put it in a contract

- Regions: a unit table with `unit_id, accession, start, end, kind, source` (1-based, inclusive, on the snapshot's
  sequences). Domains add `subtype, ref, label, members`.
- Marks: any TSV with an accession and a position column; the site file says which columns and which rows.
- Positions must be on the snapshot's sequences. **Isoform accessions (`P12345-2`) and positions on other sequence
  versions are not placed by this package yet**: the site file's `residue_mismatch` decides whether such rows fail the
  run (`error`, the default) or are dropped and counted (`drop`). Never silently re-number.

A table in its own layout needs no conversion: say in its manifest entry which columns hold what, and which rows to
keep, and every build reads it the same way (`ptmc inputs record ... --columns '<json>'` writes it):

```json
"lab_condensates": {"file": "...", "md5": "...", "source": "...", "version": "...", "licence": "...",
  "columns": {"accession": "uniprot", "start": "from", "end": "to", "label": "name",
              "include": [{"column": "evidence", "equals": "curated"}]},
  "record": "https://example.org/protein/{acc}"}
"scores": {"file": "...", "...": "...", "columns": {"accession": "entry", "position": "resnum", "value": "score"}}
```

`record` (optional) is the source's own page for a protein; the protein pages link it. A file that is not
tab-separated says so (`"sep": ","`). A format read often may instead get a reader (`ptmcontext.units.register_reader`,
in the package or a trusted plugin).

**Check:** `ptmc check sites/<site>.yaml --root DATA` passes: it reads each mapped file's header and names any column
the mapping gets wrong. A unit table (not a mapped file) also reads with `ptmcontext.units.read_units`.

## 4. Wire it into a site

Edit the site file only (`sites/<site>.yaml`); do not change code to change a site.

```yaml
inputs:
  disorder: <manifest name>     # the role a layer reads, and the input that fills it
  domains:                      # or several inputs, with the rule that combines them:
    first_of: [<curated>, <predicted>]    # each protein's units from the first that has any (or all_of: every input's)
marks:
  input: <manifest name>
  include: [{column: ..., in: [...]}]   # rows kept; exclude drops rows (their residues count as other residues)
  left_out: [{column: ..., contains: ...}]   # rows kept pending: counted on neither side
analyses:
  - {id: <analysis>, layer: <layer>}                     # a residue test, by a built-in or trusted plugin layer
  - id: <analysis>                                       # a residue test of any table of regions: no code
    layer: regions
    with: {role: <role>, kind: <kind>, window: 20, noun: condensate-forming region}   # words, colours optional
  - id: <analysis>                                       # a residue test of any per-residue value: no code
    layer: residue_values
    with: {role: <role>, bins: [50, 70, 90], classes: [very_low, low, confident, very_high], noun: pLDDT,
           colours: {very_high: "#0053d6"}}
```

The class codes these make are what filters, `website.protein.facts` and `labels:` use: for `regions`, `in_<id>`,
`<id>_boundary`, `outside_<id>` and `no_<id>` (the analysis id, or `with: code`); for `residue_values`, the classes
given, lowest first, with a value equal to a threshold in the class above it (90 is `very_high` here), and `no_value`
(or `with: missing`) where a residue has none. `ptmc check` names any `with:` key a layer does not know, any role it
reads that `inputs:` does not fill, and any fact naming a class the question does not make. Two `regions` questions
reading different roles may share a `kind`: each keeps its own row of the map.

```yaml
  - id: <analysis>                                       # a protein-set test
    test: protein_sets
    sets: {input: <role>, set: <column>, protein: <column>, include: [...]}
    names: {input: <role>, set: <column>, name: <column>}
    min_size: 10
    max_size: 500
    abundance: {input: <role>, protein: <column>, value: <column>}   # optional: repeat within abundance deciles
  - id: <analysis>                                       # sets from a class hierarchy (PANTHER, a GO slim)
    test: protein_sets
    sets:
      input: <role>                                      # each protein's class ids
      protein: <column>
      classes: <column>
      ontology: {input: <role>, id: <column>, name: <column>, parent: <column>, root: <root id>}
      level: top                                         # or below_top; top may add groups: {name: [top ids]}
      unclassified: <set name>                           # the universe's proteins with no class, as a set
    universe: snapshot
    whole_universe: true
  - id: <analysis>                                       # sets of another identifier (genes), gathered into families
    test: protein_sets
    identifiers:                                         # each protein's identifiers, through these tables in turn
      noun: gene                                         # words for the website: "genes of marked proteins"
      nouns: genes
      map:
        - {input: <role>, from: <accession column>, to: <column>, separator: ";", take: first}   # first of a list
        - {input: <role>, from: <column>, to: <identifier column>}                                # every row's
    sets:
      input: <role>                                      # (set, identifier) pairs
      set: <column>
      protein: <identifier column>
      families: {rules: sites/data/<site>_<vocabulary>.yaml, by: <name column>, lists: [<list>]}   # optional
    universe: snapshot                                   # every protein's identifiers; the background: those in any set
    abundance: {input: <role>, protein: <column>, value: <column>, combine: max}   # an identifier: its proteins' highest
```

A (set, protein) table that needs other tables to say which of its rows count (the organism of a member, the kind of a
set), whose members are named by older accessions, or whose rows the release lists in its own order:

```yaml
  - id: <analysis>                                       # CD-CODE condensates, as sites/methylarginine.yaml
    test: protein_sets
    sets:
      input: <role>                                      # (set, protein) rows
      set: <column>
      protein: <column>
      where:                                             # rows kept: the column's value is the key of a row that counts
        - {column: <protein column>, input: <role>, key: <column>, include: [{column: species_name, equals: Homo sapiens}]}
        - {column: <set column>, input: <role>, key: <column>, exclude: [{column: condensate_type, equals: synthetic}]}
      history: {input: <role>, from: key, to: accession, include: [{column: kind, equals: secondary}]}   # old -> entry
    names: {input: <role>, set: <column>, name: <column>}
    universe: annotated                                  # the proteins in any kept set (or snapshot, whole_universe: true)
    min_size: 5
    order: [{by: fold_enrichment, descending: true}, {by: a, descending: true}]   # default: ascending p, then name
    scores: {input: <role>, set: <column>, protein: <column>, value: <column>, label: <words>, levels: [2, 3, 4, 5], max: 5}
    filter: {label: <words>, any: <words for "in any set">, sets: all}   # the Filters panel's control
```

A `where` condition on the protein column compares entries (an isoform counts as its entry); one table may fill several
conditions. `history` keeps a member that is an entry of the snapshot, brings one the history maps to exactly one entry
to it, and drops any other (sets of proteins only). `order` writes the rows in the order a release lists them; the fold
enrichment is compared exactly, so equal fractions tie. `scores` (a value per membership, CD-CODE's confidence, say) and
`filter` are for the website only: the control lists the tested sets (or every set holding a marked protein, `sets:
all`), an option for marks on a protein in any set, and a threshold on the scores. A comma-separated table says so in
its manifest entry: `"columns": {"sep": ","}`.

Which sets make a family is curated vocabulary: it goes in a site's own data file under `sites/data/`, never in code
(`ptmcontext/schemas/set_families.schema.json`; `sites/data/methylarginine_disease_families.yaml` gathers DisGeNET's
terms into the release's disease families). Each family is a list of regular expressions matched against the set's
name; exact-name `overrides` come first; families sit in ordered `lists`, a name taking the first family that matches,
list by list, and each analysis tests the families of the lists it names. A set no rule places is in no family, but its
identifiers still count as annotated (the background). `ptmc check` reads the rules file, the lists an analysis names
and every column its tables must have; the run records the file's MD5. Record each mapping table in the manifest like
any input: the identifiers are only as good as the map.

Columns of the marks table the website should keep (to colour sites, filter them, and show where each comes from)
go under `marks.attributes`; no test reads them:

```yaml
marks:
  attributes:
    state: {column: <column>, label: <name on the page>, kind: category, values: {<value>: <label>}, colour: true, filter: true}
    studies: {column: <column>, label: Studies, kind: list, separator: "; ", link: {column: <ids column>, url: "https://doi.org/{}"}, filter: true,
              provenance: true}   # how a mark was found, not what it is: a caveat when marks are compared, and the
                                  # within-study strata (website.compare.stratify names another)
    changed: {column: <changes column>, present: true, label: Changed in tumours, kind: category,
              values: {"yes": Changed, "no": Not changed}, filter: true}           # a yes/no filter over a column of changes
    response: {column: <perturbations>, pair_with: <their calls>, label: Responses, kind: list, control: select,
               filter: true}                                                       # each value "<perturbation>:<call>"
```

A question answered by counting rather than testing (how many marks each source reports; how many marks each experiment
measured and changed) is a count question, `website.counts` (CONTRACTS.md, Per-mark tables and count questions). Its
data are an attribute of the marks, or a table with several rows per mark, kept under `marks.tables` with the column that
names each row's mark and the columns to keep; the site file maps the table's own columns (`where`, `call`, `change`),
so a release's supporting table and a user's own table in the same shape give the same question:

```yaml
marks:
  tables:
    experiments: {input: <manifest name>, key: {marks: site_id, table: site_id}, columns: [treatment, call, log2_change]}
website:
  counts:
    sources: {kind: values, attribute: studies, number: n_studies, title: Provenance, unit: [source, sources]}
    responses:
      kind: responses
      title: Responses
      calls: {down: decreased, up: increased}
      rows:
        - {name: Drug A, table: experiments, where: {treatment: A}, change: log2_change}
        - {name: Knockout B, attribute: <a pair_with attribute>, value: ko_b}       # calls from '<value>:<call>' pairs
  overview: {sections: [{name: Sources, cards: [sources, {analysis: responses, wide: true}]}]}
```

The website's Overview tiles, filter groups and header tiles are `website.overview`, `website.filters` and
`website.stats`; the Sites tab's columns `website.sites.columns`; the protein page's fact tiles and extra links
`website.protein.facts` and `website.protein.links: [{label, url: "...{acc}..."}]` (`sites/methylarginine.yaml` shows
the others). Without them the kit lists
every question and offers every filterable attribute. A new question appears on every page with no kit change: its
tile, its filter, its rows in All tests and the downloads, its column if named, and, if its layer draws regions, a row
of the protein map (`tests/test_new_sources.py` builds such a site from scratch).

**Check:** `ptmc run sites/<site>.yaml --root DATA` runs, and `out/<site>/run.json` lists every input with its MD5.

## 5. Prove it

- A new layer gets a unit test with a known answer built by hand (`tests/test_layers.py` shows how).
- A layer that reproduces a published table gets a parity check: add the table as a `reference_output` and a
  `reference:` block to the site; `ptmc run` then compares every row.
- A change that moves any number of a site with a reference fails its parity test. If the change is meant, the owner
  decides; record it in the site's CHANGES, never by editing the reference.

**Check:** `pytest` passes.

## 6. Code from another repository

Layers written elsewhere (a private repository's regions, a collaborator's score) come in as plugins: an installed
package that offers a `ptmcontext.Layer` under the entry-point group `ptmcontext.layers`. A plugin loads only when
the site names its package under `trusted_plugins`, and the run record keeps its version. Do not copy another
repository's code into this one without the owner's review; do not run another repository's scripts from here.

## 7. Cite it, version it, publish it

- Add the source to the site's citation file (`sites/<site>.citation.cff`, under `references:`), with its DOI checked on
  Crossref (`https://api.crossref.org/works/<doi>`), never written from memory. Every page and download of the site
  then cites it.
- A new release of a site: change `version:` and `date-released:` in the same file, then `ptmc run` and `ptmc web`. The
  version, the date and the citation are read from that file everywhere; nothing else needs editing.
- The kit's own version lives in `pyproject.toml`, `ptmcontext/__init__.py` and `CITATION.cff`; a test fails if they
  differ.

## 8. Write down what you did

In the pull request: what was added, its licence, its coverage, the checks run and their output, and anything that
could not be verified. Never claim a check passed that was not run.
