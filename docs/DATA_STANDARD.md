# Standard for adding data to PTMcontext and PTM_Pipeline

Status: current practice as of PTM_Pipeline release v1.6.0 and ptmcontext `develop`. The versioning rule (section 7) and the contributor metadata sheet (section 3) are adopted. Anything still a proposal is marked "(proposed)". Where this page and PTM_Pipeline's `DECISIONS_v1.5.1.md` differ, the decisions file wins.

Two repositories are involved. PTM_Pipeline stages, validates and merges source data into a versioned, checksummed release (CC BY-NC-SA 4.0). ptmcontext reads that release through `inputs.json` and `sites/*.inputs.json` (path, MD5, source, version, licence) and builds the website from `sites/*.yaml`. Data enter PTM_Pipeline first and ptmcontext second. Each ptmcontext manifest row pins the release file by MD5 and the PTM_Pipeline commit (the sites read release v1.6.0). The step-by-step recipe for ptmcontext is [ADDING_DATA.md](../ADDING_DATA.md).

## 1. Scope

| Kind of addition | Where it goes | Code needed |
|---|---|---|
| A. A new study's sites for an existing mark | A staging script writes `inputs/marks/<study>_<mark>_sites.tsv`; `SOURCES` in `scripts/56_build_context_marks.py` registers it; `scripts/56` merges it into `human_<mark>_sites_<version>.tsv` | One staging script (today `scripts/60`, `61`; a generic stager is proposed) and one `SOURCES` entry |
| B. A new mark or a new site set | `MARKS` and `FILE_MARKS` in `scripts/56`; `config/site_sets.json` (residues, modified components) for interactions; a `sites/marks/<mark>.yaml` and `sites/<site>.yaml` in ptmcontext | Yes, reviewed by the owner |
| C. A new annotation layer or protein set (pathways, disease, locations, disorder, regions, per-residue values) | PTM_Pipeline: `scripts/NN_stage_<name>.py`, a `Layer` in `scripts/release_layers.py` (`ADDING_A_SOURCE.md`). ptmcontext: a manifest entry plus an `analyses:` block in the site YAML (`ADDING_DATA.md`) | Staging script; the YAML needs no code |
| D. A new interaction source (structures, crosslinks, RNA/DNA binding, PPI) | `scripts/37` and `scripts/64_export_site_interactions.py`; tables `supporting/<site set>_<table>_<version>.tsv`; ptmcontext `website.tables` mapping (`CONTRACTS.md`) | Step in `scripts/64`; YAML mapping |
| E. An investigator's own sites by browser upload (proposed) | The file stays in the reader's browser (route A) and is never added to a release. If the investigator wants it in the release, it becomes kind A (route B) after the full gate below | Browser checker (proposed) |

Interaction records (D) and layers (C) are keyed by site or protein and add no sites. Kind A and B add sites and change high-confidence counts, so they are held to the full gate.

## 2. Acceptance criteria (gate)

A source is accepted only if it passes all four. The maintainer records the result in the source's manifest row and `STUDIES.md` section.

1. **Licence compatible with CC BY-NC-SA 4.0.**
   - Accepted without exception: CC0, CC BY 4.0, CC BY-SA 4.0, CC BY-NC 4.0, CC BY-NC-SA 4.0, and equally open terms (for example, public domain, ODbL with attribution recorded). State the exact text and URL, and the date checked.
   - Needs a written exception from the owner, recorded in the manifest and the README: a journal supplement with no notice of its own whose article is not open access (the Ochoa 2020, Hendriks 2017 and Akimov 2018 derived tables are published this way: derived records only, cited, raw download kept out of Git); a CC BY-NC-ND article supplement redistributed unmodified (the Maron 2021 and ProMetheusDB supplements). An exception is not a precedent. Raw downloads that cannot be redistributed are `checksum_only` in the MANIFEST.
   - Not accepted: "All Rights Reserved", no stated licence, or terms that forbid download or redistribution without a written agreement.
   - Worked judgments. CPLM 4.0 states no licence (copyright notice "All Rights Reserved") and compiles sites from other databases as well as papers; it is removed from all context marks (release v1.5.1), and `scripts/56` stops on a CPLM table (`EXCLUDED_SOURCES`). PhosphoSitePlus: its July 2026 terms forbid downloading without a written agreement, so it stays out of the context marks and of interaction data unless the owner obtains one (its methylarginine records enter the existing release only through the compiled Maron 2021 table and are not counted as independent evidence). dbPTM and qPTM: all rights reserved or unstated, out. iPTMnet: its licence page says CC BY-NC-SA 4.0 while its readme also mentions CC BY 4.0; the stricter terms apply, and its upstream databases keep their own terms and must be cited.
   - A database that offers two licences: follow the stricter and say so in the README.
2. **Published and citable.** A peer-reviewed article with a DOI or PMID, or a public dataset accession (PRIDE/ProteomeXchange PXD, jPOST, MassIVE) tied to a citable description. Preprints without a deposited dataset do not qualify. Unpublished data never enter (decision D4, `ADDING_DATA.md` step 1).
3. **Organism and reference.** Human (NCBI taxon 9606), mapped to the reference proteome in use (UniProt 2026_03, UP000005640, reviewed canonical sequences). Another organism needs its own reference proteome staged first (kind B; the yeast phospho site is the precedent) and a stated release.
4. **Site-level localization evidence.** The source reports a residue position, with a localization score or probability from the search engine, or a curated assignment, or a peptide or window that determines the residue. Peptide-level or protein-level data with no site assignment are not sites.

## 3. Required metadata per source

One row per source in the staging script's constants (`LICENSE`, `CITATION`, `SOURCE`, `SOURCE_RELEASE`), the staged summary JSON, `inputs/MANIFEST.tsv`, `inputs/marks/raw_files.tsv`, `SOURCES` in `scripts/56`, and `studies_<version>.tsv`. Fields marked (proposed) are not all captured today. Outside contributors send every field on the fixed metadata sheet, [templates/contribution/metadata_template.tsv](../templates/contribution/metadata_template.tsv); the maintainer copies it into `inputs/marks/<source_id>_metadata.json` (proposed).

| Field | Content | Today |
|---|---|---|
| `source_id` | Stable identifier, `Author2026` style; also the `source` string in the TSV | `SOURCES` key |
| `label` | Display name (Hendriks 2017) | `SOURCES` / `studies.tsv` |
| `citation` | Full reference in the house format | `SOURCES.citation` |
| DOI / PMID | Both where they exist | in docstring and citation |
| dataset accession | PXD, jPOST, MassIVE ID, or "none" | docstring only; make a field (proposed) |
| licence, URL, date checked | Exact text, page URL, date | `SOURCES.license`, `.url`; date checked (proposed) |
| version / release / date downloaded | Release name or date | `source_release`, `raw_files.tsv` |
| download URL | Direct file URL | `raw_files.tsv` |
| MD5 (and SHA-256) | Of every raw file | `raw_files.tsv`, MANIFEST |
| organism, reference proteome release | 9606; UniProt 2026_03 | MANIFEST (FASTA row) |
| mark | Unimod and PSI-MOD terms; states (me1, me2, me3, phospho, ub, sumo, acyl type) | `states:` in `sites/marks/*.yaml` carries PSI-MOD; Unimod (proposed) |
| residues | One-letter codes | `residues:` in the mark file |
| evidence class | `experimental`, `text-mined`, `by-similarity`, `unspecified` | column `evidence_class` |
| method | Enrichment (antibody, reagent, His-tag pulldown), instrument, search engine and version | staging docstring and `STUDIES.md`; structured fields (proposed) |
| FDR and localization thresholds | PSM, peptide, site FDR; localization probability cutoff applied by the authors or by the maintainer | docstring; structured (proposed) |
| laboratory or consortium | Senior investigators and institution; needed for independence (section 6) | methylarginine only (curated groups); required for all marks (proposed) |
| aggregator or direct | `direct` if the study reports its own experiment; `aggregator` if it re-reports others (then list upstream studies or databases) | `upstream_sources` column for aggregators; field (proposed) |
| sample, cell types, conditions | Cell lines, tissues, treatments | per-source column (for example `hendriks_cell_lines`) |

## 4. Required columns per site row

Staged format today (the ten columns of `inputs/marks/README.md`). The contributor format for outside submissions is the `ptm-sites/1` TSV ([template](../templates/contribution/sites_template.tsv); a checker is proposed): a `# key: value` header block carrying the section 3 fields, then this table.

| Column | Status | Rule |
|---|---|---|
| `accession` (`canonical_UniProtAC` once staged) | required | UniProt accession; isoforms allowed in the submission (see section 5) |
| `position` | required | 1-based, on the accession's sequence as the study used it |
| `residue` | required | One letter; must match the sequence |
| `mark` | required | Code from the mark file |
| `state` | required for marks with states | `me1`, `me2`, `me3`, `phospho`, `ub`, `sumo`, acyl type; `me` if the degree is not stated |
| `evidence_class` | required | `experimental` for MS or direct assay |
| `window` (15 to 51 residues, centered) or `peptide` plus the site's offset | recommended; required where the accession is an isoform or an unreviewed entry | Lets the row be placed by sequence; `scripts/window_sites.py` uses the ±7 core |
| `localization_probability` | required for MS evidence; omit only when the study states curated localization | 0 to 1 (percent is converted) |
| `pmids` | required for a database; recommended otherwise | PubMed IDs, `;` separated |
| `cell_line`, `condition` | recommended | Free text, `;` separated |
| `source`, `source_release` | set by the stager | |

Minimal example (submission format):

```
# schema: ptm-sites/1
# source_id: Smith2026
# citation: Smith J et al., Nat Methods 1:1 (2026)
# doi: 10.1000/example   pmid: 00000000   dataset: PXD000000
# organism: 9606   reference_proteome: UniProt 2026_03
# mark: sumoylation   residues: K   evidence_class: experimental
# license: CC BY 4.0 (https://example.org/license, checked 2026-11-19)
accession	position	residue	state	window	localization_probability	cell_line
P35637	216	K	sumo	GRGGGSGGKGGSGGR	0.98	HeLa
```

## 5. Validation rules and failing rows

Coded checks, run by the staging script before a row is kept (today in `scripts/window_sites.py`, `common.residue_is` and each stager; one shared checker with a browser twin is proposed):

1. **Residue matches the sequence.** The reference sequence has the stated residue at the position.
2. **Position in range.** 1 to protein length.
3. **Accession on the reference.** A canonical reviewed entry, or a secondary accession mapped to exactly one current entry (`secondary_accession`); otherwise `no_canonical_accession`.
4. **Unique mapping.** A window or peptide placing the site must occur once in the candidate sequence (`window_not_unique`, `window_not_in_canonical`, `bad_window`). A row that does not fit at the given position but whose window core occurs once is `relocated` and keeps `source_position`.
5. **Localized.** MS rows meet the stated localization threshold, or are not localized to one residue (`unresolved_not_localised` in the methylarginine pipeline).
6. **Duplicates.** Rows landing on the same residue and state become one row; their sources and cell lines are merged.
7. **Isoforms.** An isoform accession (`P12345-2`) is never numbered on the canonical sequence unless a window or peptide places it; the row is `relocated` or rejected. Never renumber silently (`ADDING_DATA.md` step 3).
8. **Evidence class.** Only the four allowed values.

Failing rows are not dropped silently. They go to `inputs/marks/<source>_rejected.tsv` with a reason code and detail, counts go into the summary JSON, and the study's `STUDIES.md` section reports them. For methylarginine, unplaced records appear in the lower-confidence tables (`human_methylarginine_lower_confidence_sites_*.tsv`, `statistics_with_lower_confidence_*.tsv`). A lower-confidence table for the context marks is proposed. A rejection rate above 20% of rows is reported to the owner before merge (proposed).

## 6. Independence and the high-confidence rule

High confidence is a website control, not a release tier. Release tables keep every row (D5). For the context marks a site is high confidence when it has at least 2 independent units, counted over experimental records only:

- Each distinct PubMed ID counts once.
- A direct dataset counts as one unit and so does any paper it is also cited by (Berryhill 2023, Ochoa 2020, Hendriks 2017 and Akimov 2018 are one unit each).
- Databases count only through the papers they cite. UniProt and iPTMnet add units only by their PMIDs, and an aggregator's re-reporting of a direct dataset is the same unit, not a second one.
- Records with `evidence_class` other than `experimental` (text-mined, by similarity, unspecified) never count.

For methylarginine the existing control stays: two or more studies, with curated laboratory groups counted once, and PhosphoSitePlus, UniProt, IEDB and ProMetheusDB not counted. Extending laboratory grouping to the context marks is proposed.

The contributor must declare: the laboratory or consortium (and any shared senior investigators with studies already in the release); whether the dataset is direct or an aggregator; the upstream studies or databases it re-reports, with PMIDs; whether the same raw data appear under another accession; and whether the sites include re-analyses of public data (then name the original dataset). Declarations are checked by the maintainer against `studies_<version>.tsv` and the laboratory table.

## 7. Provenance and reproducibility

Required before merge, all checked by tests or `md5sum -c`:

1. `inputs/MANIFEST.tsv` row for each staged file: path, bytes, MD5, rows, `redistribution` (`git`, `zenodo` or `checksum_only`), content, source URL, version or date, citation, licence, derived-from, how made.
2. `inputs/marks/raw_files.tsv` row for each raw download: URL, size, MD5, SHA-256, date (`common.upsert_tsv_rows`, `refresh_manifest_row`). Large raw files live in `PTM_data/` and the release's Zenodo archive, not Git.
3. A staging script `scripts/NN_stage_<name>.py` that is deterministic: a second run on the same download gives the same bytes. It writes the sites, rejected and summary JSON files (counts, versions, input MD5s).
4. `SOURCES` entry (licence, URL, citation) in `scripts/56`; the build stops on an unknown source.
5. Release folder `releases/vX.Y.Z/`: `MD5SUMS` for every file, `release.json` (commit, carried-over files with `from_md5` and `md5`), `README.md` (counts table, licence and non-commercial notes), `CHANGES.md` (an entry for the source with counts and the effect on existing rows), `data_dictionary.tsv` (every new column with type and codes), `STUDIES.md` and `studies_<version>.tsv` (one section per study).
6. ptmcontext: manifest entries in `inputs.json` or `sites/<site>.inputs.json` with `file`, `md5`, `source` (URL or commit), `version`, `licence`, `role`, and `note`; `ptmc inputs --root DATA` must list each as `ok`. A file with no traceable origin is marked `NOT TRUSTED` and cannot enter a committed result.

Versioning. A published release folder is never rewritten (`CONTRIBUTING.md`). Policy: a **minor** release (v1.6.0) for new sources, marks or layers. A **patch** release (v1.5.2) for corrections and rebuilds that add no new content: a fix in text, a bug fix in a derived column, or metadata corrections. Removing a source for licence reasons is a minor release, or, before first publication, a rebuild in place (as for CPLM in v1.6.0).

## 8. Checklists

**Maintainer: PTM_Pipeline**

1. Run the gate (section 2); record licence text, URL and date checked. Stop and ask the owner on any exception.
2. Download to `PTM_data/`; record URL, size, MD5, SHA-256, date in `raw_files.tsv`.
3. Write or reuse the staging script; run with `--fasta` and `--history`; check the rejected table and summary counts.
4. Write the MANIFEST row and register the source in `SOURCES` in `scripts/56` (new mark: `MARKS`, `FILE_MARKS`, `config/site_sets.json`).
5. Open a feature branch; run `scripts/56 --version vX.Y.Z --release-date YYYY-MM-DD`; run `python -m pytest -q tests` and `md5sum -c MD5SUMS`.
6. Recompute README counts and high-confidence counts; write the `CHANGES.md` entry, the data dictionary entries and the `STUDIES.md` section.
7. Rerun `scripts/64` if sites changed (interaction tables follow the sites).
8. PR to `develop`; the owner merges. Only the owner merges to `main`, tags and publishes the GitHub release (Zenodo archives it).

**Maintainer: ptmcontext**

1. Wait for the PTM_Pipeline release commit or tag; copy the file entries (MD5, source, version, licence) into `sites/<site>.inputs.json` and `inputs.json`.
2. Edit the site file only: add the source to the `sources` column values and help text, add a chip or filter if needed (no code change); update the Methods, README and credit text and `*.citation.cff`.
3. Move the pin; run `ptmc check sites/<site>.yaml --root DATA`, the parity test against the release copies, and the audits; CI must be green.
4. Merge the branch (main session), then update citations to the version DOI after release.

**Outside contributor: what to send**

1. The `ptm-sites/1` file (section 4, [template](../templates/contribution/sites_template.tsv)), or a table in the paper's own layout plus a column mapping.
2. The filled metadata sheet ([template](../templates/contribution/metadata_template.tsv); fields of section 3), including laboratory, direct or aggregator, thresholds and the licence text with URL.
3. The citation, DOI or PMID, and dataset accession.
4. Written confirmation that the data are published and that you may share them under CC BY-NC-SA 4.0 (or the source's own terms).
5. A contact address (never published). Expect a rejected-rows report in return.

## 9. What will not be accepted

- Unpublished data, including unpublished MS and analyses, and data under embargo. They belong in a private repository as a plugin (`ADDING_DATA.md` step 6).
- Sources with all rights reserved, no stated licence, or terms barring download or redistribution (CPLM 4.0, dbPTM, qPTM, PhosphoSitePlus without a written agreement).
- Predicted-only sites (machine-learning predictions, motif scans) presented as experimental. Predicted layers may enter as annotation (kind C), labeled predicted, never as sites.
- Text-mined, by-similarity or unspecified records counted as high-confidence evidence.
- Peptide-level or protein-level data without site assignment; sites with no localization evidence.
- Compiled tables that carry no localization and add nothing beyond their upstream studies, counted as independent evidence.
- Files with no traceable origin (`NOT TRUSTED`), or with no checksum.
- Positions on another sequence version or an isoform that cannot be placed by window or peptide (such rows are rejected with a reason, not renumbered).
- Silent edits to a published release folder or to rows after the fact.
- Another organism without its own reference proteome.
