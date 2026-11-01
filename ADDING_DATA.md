# Adding data: a guide for an AI agent (and for people)

Follow these steps in order. Each ends with a check that must pass before the next. Stop and ask the owner where a
step says so. Read [AGENTS.md](AGENTS.md) first; its rules override anything here.

## 0. Decide what the data is

Every new dataset is exactly one of these. If it is none of them, stop and ask.

| It is | Example | It becomes |
|---|---|---|
| **sequences** | a new UniProt release, another organism | a snapshot: `ptmc stage uniprot <proteome>` |
| **regions** | disorder, domains, flanks, charged segments, a lab's own regions | a **unit table** (`schemas/units.schema.json`) filling a **role** (`disorder`, `domains`, ...) |
| **marked residues** | a PTM site list, an MS experiment's sites | a **marks table** (accession, position, plus any columns) selected by a site file |
| **a mark** | a modification not yet profiled | a **profile** (`ptmcontext/profiles/<mark>.yaml`) |
| **a per-residue or per-protein annotation** | AlphaFold pLDDT, abundance, a score | a **layer** (code) or a unit table, if it is regions |
| **a published result to match** | a release's statistics table | a `reference_output` entry: read only to check parity |

## 1. Check the terms before downloading

- Find the licence on the source's own site. Record it word for word; if none is stated, write `none stated`.
- Unpublished lab data (MicroDomains, dtIDR material, unpublished MS) never enter this repository. They go in a
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

**Check:** `ptmc check sites/<site>.yaml` passes, and a unit table reads with `ptmcontext.units.read_units`.

## 4. Wire it into a site

Edit the site file only (`sites/<site>.yaml`); do not change code to change a site.

```yaml
inputs:
  disorder: <manifest name>     # the role a layer reads, and the input that fills it
  domains:                      # or several inputs, with the rule that combines them:
    first_of: [<curated>, <predicted>]    # each protein's units from the first that has any (or all_of: every input's)
marks:
  input: <manifest name>
  include: [{column: ..., in: [...]}]
analyses:
  - {id: <analysis>, layer: <layer>}                     # a residue test
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
```

**Check:** `ptmc run sites/<site>.yaml --root DATA` runs, and `out/<site>/run.json` lists every input with its MD5.

## 5. Prove it

- A new layer gets a unit test with a known answer built by hand (`tests/test_layers.py` shows how).
- A layer that reproduces a published table gets a parity check: add the table as a `reference_output` and a
  `reference:` block to the site; `ptmc run` then compares every row.
- A change that moves any number of a site with a reference fails its parity test. If the change is meant, the owner
  decides; record it in the site's CHANGES, never by editing the reference.

**Check:** `pytest` passes.

## 6. Code from another repository

Layers written elsewhere (a private repository's flanks, a collaborator's score) come in as plugins: an installed
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
