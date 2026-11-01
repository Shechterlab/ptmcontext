# Design review: is a shared proteome kit the right idea?

1 November 2026. Written to decide, not to sell. Every number below was measured in this session; every outside claim
links to its source. "Not verified" means exactly that.

## Verdict

**Build it, but narrower and named for what it does.** The case for a shared core is strongest for the statistics and
the release format, and weakest for a general "proteome model" and a home-made protein viewer:

- **Build:** the statistical core (where do marks fall in proteins, pooled and within protein), the file contracts,
  staging with checksums, the release writer and parity checks. Nothing published does this as reusable software
  (section 5).
- **Don't build:** a general data model for all proteome biology (SHEPHARD exists), or a new 3D viewer or sequence
  track library (Mol\* and Nightingale exist and are maintained).
- **Name:** `ptmcontext`, free on PyPI and in GitHub's repository search. "proteome-kit" would be read as a reagent kit
  or as mass-spec processing.
- **Paper:** a J Proteome Res *Software Tools and Resources* Article (deadline 31 Dec 2026) is reachable if it
  presents the Methylarginine Site Explorer with this engine. The hook is in your own release: pooled tests mislead
  often (section 6).

## 1. Do we need a Python kit?

Yes. The evidence that one is needed is not tidiness but correctness:

- **The copies of the statistics have already diverged in a way that changes results.**
  - glu_proteomics' Mantel–Haenszel (`glu/ptm.py:135`) uses statsmodels' `test_null_odds(correction=True)`.
    PTM_Pipeline's `scripts/common.py:446-449` documents why it stopped using that call: in sparse tables it
    "came out significant" with nothing observed.
  - glu's `category_enrichment` builds its 2×2 background differently from PTM_Pipeline's `fisher_like_enrichment`.
- **The website code moves by copying.** idr-explorer copies 135 declarations out of `explorer.js` at a pinned
  commit, which is already behind: `fmtL2` differs from the current explorer.
- **The pipeline is tied to one residue.**
  - PTM_Pipeline is 42,032 lines in 96 scripts, and 34 of them compare residues with `'R'` directly.
  - About 850 of `explorer.js`'s 18,125 lines name the mark.
- **The pilot shows the alternative works.** About 2,000 lines of Python reproduce 3,646 published statistics rows byte for byte.
  It runs three sites from three YAML files and no code changes.

**What it does:** stage sources from upstream into checksummed files; place candidate residues on one snapshot;
annotate them with layers (each reading a *role* such as `disorder` or `domains` that a site binds to a concrete
source); select marks; run the tests; write statistics rows and a run record; compare with a reference.

**What it should not do:** parse each study's supplementary tables, apply PRMT perturbation rules or make paper
figures. Those are site-specific "site packs" that stay in each site's repository.

## 2. What would it build?

Measured against PTM_Pipeline v1.4.3's outputs (audit of `releases/v1.4.3/` and `docs/data/`):

| Output | Generic? | In the kit |
|---|---|---|
| Statistics: residue-level tests (motif, disorder, domain context, domain class, structure context) | generic | **done**: 82 of 82 rows identical |
| Statistics: protein-set tests for Reactome top level, Reactome pathways and HPA locations, with their PaxDb-decile repeats | generic | **done**: 3,564 of 3,564 rows identical |
| Statistics: everything else (1,013 of 4,659 rows: PANTHER classes, condensates, interfaces, crosslinks, cell maps, eCLIP) | mostly generic | not yet |
| Site table, proteins table, lower-confidence sites | generic schema, mark-specific columns | not yet: needs isoform placement and a site-union builder |
| data dictionary, README, CHANGES, MD5SUMS, release.json | generic | not yet |
| Website data (`docs/data/*.json`) | mostly generic; DepMap, HPA and other layers are human-only | not yet |
| Website | generic shell, mark-specific panels | not yet |

So the pilot covers **78% of the statistics rows** (3,646 of 4,659), and the hardest part to get right: identical
numbers from an independent implementation. The order of work in section 8 adds the rest one parity check at a time.

## 3. Would others use it, for other proteomes?

**The provisioning run** staged budding yeast from upstream only and ran it:

- **Staging:** `ptmc stage uniprot UP000002311` and `ptmc stage mobidb` took about 50 s. They got UniProt 2026_03,
  6,067 reviewed entries, 7,311 modified residues and 5,343 domains and repeats. MobiDB disordered regions came
  for 6,036 entries.
- **Run:** `ptmc run sites/yeast_phospho.yaml` took 21 s. It counted 5,930 phosphosites with experimental or
  large-scale evidence, on 1,936 proteins.
- **Results are biologically sensible:**
  - disordered regions, within protein: OR 4.1 (95% CI 3.8–4.3);
  - S/T-P: 6.8;
  - the human phosphosite pilot gives 3.7 and 7.2.
- **It broke in three places:**
  - **The domain layers were tied to InterPro's file format.** Fixed: layers now read roles, and any unit table can
    fill a role. InterPro's bulk file is 17 GB, so yeast uses UniProt's own domain features.
  - **MobiDB serves at most 1,000 proteins per request**, and its paging parameters had no effect. Fixed: accessions
    are batched.
  - **Isoforms.** 50,100 of the 119,238 human phosphosite rows selected from iPTMnet are on isoform accessions.
    **Open:** isoform-to-canonical placement is not built.

**Who else needs it:** any lab with a site list (an MS experiment, a database export) that wants to know where the
sites concentrate without being misled by which proteins it detected. Three things would make it useful to them:

1. `pip install` plus one YAML file and their table.
2. **Measured backgrounds**: candidates limited to residues on peptides the experiment detected. Stratifying by protein
   removes bias *between* proteins but not *within* a protein. Sites far from cleavage sites are detected less
   ([bioRxiv 2022](https://doi.org/10.1101/2022.11.28.518163)), and reviewers will raise it.
3. Isoform placement.

## 4. Does the web side integrate live sources?

**Today the Methylarginine Site Explorer calls about 20 services from the browser:**
- UniProt REST, AlphaFold DB (models, pLDDT, AlphaMissense, complexes);
- PDBe (best structures, coverage, interface residues), RCSB Search, Data and Files, ProtVar;
- STRING, QuickGO, ENCODE, ChIP-Atlas, Open Targets, NCBI E-utilities, Ensembl;
- the 3Dmol and Cytoscape libraries.

**How it guards against drift:**
- Only UniProt is checked: the live sequence MD5 is compared with the snapshot's (`explorer.js:916-922`), and on a
  mismatch the positional data is dropped with a warning.
- **The IDR Explorer's copy of that check never runs**, because nothing fills `REFMD5` (`ptm-core.js:206, 264`;
  `idr.js` never sets it). If UniProt changes a sequence, positions will be shown on the new sequence without
  warning. This is a bug to fix there.
- STRING's species is hard-coded as 9606 (`explorer.js:10355, 12959, 13134`). It has to become a site setting before
  any other organism works.

**Can a static site keep doing this?** Yes. UniProt REST, AlphaFold DB, PDBe SIFTS, PDBe-KB, RCSB Data and Search,
InterPro and MobiDB all answered with `Access-Control-Allow-Origin: *` on 1 Nov 2026 (prior-art survey).

**The rule for the web kit:**
- The snapshot is the record.
- A live source is enrichment: labelled with its source and date, it never changes a published number, it fails
  softly, and it is drift-checked wherever the source has a version.

**Build or reuse:**
- **Keep** what makes the sites distinctive: layout, search, tables, selections retested in the browser, exports with
  credits.
- **Evaluate before the next new page** rather than maintaining custom code: [Mol\*](https://doi.org/10.1093/nar/gkab314)
  (the PDBe and RCSB viewer; MIT; v5.13.1, Oct 2026) and [Nightingale](https://doi.org/10.1093/bioadv/vbad064)
  (UniProt's and InterPro's track components; MIT; v5.11.1, Oct 2026).
- **Not verified:** whether Nightingale's tracks export to SVG and PDF the way your figures must.

## 5. Prior art: does this already exist?

Survey of 1 Nov 2026, from the tools' code and papers:

| Tool | Closest to | Has | Lacks |
|---|---|---|---|
| [StructureMap](https://doi.org/10.1371/journal.pbio.3001636) (Mann lab) | the statistics | pooled Fisher against unmodified residues of the same type; Fisher per protein; permutation within protein | a protein-stratified pooled estimate (Mantel–Haenszel); a background limited to marked proteins; any detection control; a website. Last commit and release 9 Jan 2025 |
| [SHEPHARD](https://doi.org/10.1093/bioinformatics/btad488) (Holehouse lab) | the data model | Proteome / Protein / Domain / Site / Track; TSV interchange; precomputed files for human and 12 other proteomes | inferential statistics: none in the package (checked in its code); versioned outputs; a website. Its `LICENSE` file is LGPL-3.0 while `pyproject.toml` says MIT (checked); last commit 25 Jul 2026 |
| [KSTAR](https://doi.org/10.1038/s41467-022-32017-5) (Naegle lab) | detection-aware nulls | null matched on each site's study bias | phospho and human only; estimates kinase activity, not where sites fall |
| AlphaMap, PTMVision, PTMExplorer | the website | sequence and structure views of PTMs | statistics |
| dbPTM, qPTM, iPTMnet, PhosphoSitePlus, PTMcode 2, ProteomeScout | the data | site compendia | region tests |

Precedents to cite for the idea of a protein-conditioned null:
[Beltrao et al. 2012](https://doi.org/10.1016/j.cell.2012.05.036) (sites reassigned at random within each protein),
StructureMap, and KSTAR. No tool was found that packages pooled and protein-stratified (Mantel–Haenszel) tests side by
side, for any mark and any proteome, with versioned outputs. **The statistics are incremental; the reusable,
release-grade implementation is new.** The paper should claim the second, not the first.

## 6. Paper and grant

**The finding that carries a paper is already in v1.4.3.** Of the 121 tests in its statistics table that have both a
pooled (Fisher) and a within-protein (Mantel–Haenszel) row:

- **33** are significant pooled (q ≤ 0.05, at least 1.1×) but not within proteins. Examples:
  - nearest domain an RRM/KH: 3.66 pooled, 0.94 within (q 0.65);
  - PDB RNA interfaces: 1.88 pooled, 0.85 within (q 0.25).
- **31** change direction.
- **6** are significant in opposite directions:
  - AlphaFold-Multimer interfaces: four rows, e.g. pDockQ ≥ 0.23, 1.18 pooled and 0.70 within;
  - inter-domain linkers: 0.79 pooled, 1.37 within;
  - repeat/superfamily domains: 0.76 pooled, 1.39 within.

**Venues:**

| Venue | Fit | Constraint |
|---|---|---|
| [J Proteome Res, Software Tools and Resources Part 5](https://axial.acs.org/analytical-chemistry/call-for-papers-software-tools-and-resources-part-5) | best: an Article for a new tool; web interfaces preferred | **31 Dec 2026**; the tool free and working at submission; a citable release (DOI) with CITATION.cff; a table of inputs, operations and outputs |
| [Bioinformatics Application Note](https://academic.oup.com/bioinformatics/pages/author-guidelines) | the engine alone | 4 pages |
| [NAR Web Server issue](https://academic.oup.com/nar/pages/submission_webserver) | only if users can submit their own site lists | proposals year-round from Nov 2026 |
| [NAR Database issue](https://academic.oup.com/nar/pages/ms_prep_database) | the explorer as a database | inquiry by 1 Jul 2027. **Ask:** if NAR counts the Cell Chem Biol paper as the Explorer's first description, the 18-month rule applies (not verified) |

**The dtIDR story and the grant:**
- The engine is how the domain-adjacency analysis becomes reproducible: a site file, a trusted private plugin from
  MicroDomains for the flank scores, and a parity test once published.
- Nothing dtIDR enters a public repository before the PI approves.
- A grant can cite the engine's DOI as shared infrastructure.
- Publishing the engine first (methods) and the dtIDR biology later keeps the unpublished concept protected.

## 7. Alternatives considered

| Option | For | Against | Verdict |
|---|---|---|---|
| Generalise PTM_Pipeline in place (the original brief) | no parity gap | no repository should be the master; 42k lines tied to one residue | no |
| Build on SHEPHARD | mature model; many proteomes | no statistics; licence conflict to resolve first; outside the lab's control, against the trust rule | interoperate (read and write its TSVs), don't depend |
| Extend StructureMap | has residue-matched tests | dormant since Jan 2025; AlphaFold-centred; no stratified estimate | cite; perhaps wrap its exposure measure as a layer |
| Snakemake or Nextflow only | orchestration, caching | no data model or statistics; a site runs in under a minute | add later if a release needs many steps |
| A residue table in Parquet with DuckDB | ad hoc queries over 11.4M human residues | heavier in the browser than today's per-protein counts | later, as a cache at most |
| **A narrow engine + site files + plugins** (this pilot) | parity proven; second organism by configuration; private work stays private | a small lab maintaining one more package | **yes** |

## 8. Order of work

If the JPR deadline is the target (8 weeks):

1. **Week 0:** choose the name and create the repository; push the pilot; add CITATION.cff.
2. **Weeks 1–2:** isoform placement; measured backgrounds.
3. **Weeks 2–3:** protein-set tests in Python, with parity against the clusterProfiler rows. *Done for Reactome and
   HPA (3,564 rows); PANTHER, condensates and cell maps remain.*
4. **Weeks 3–4:** the release writer; v0.1.0 with a Zenodo DOI.
5. **Weeks 4–6:**
   - a "your sites" report page from `pk` output (the rendered pilot page is the seed);
   - live UniProt and AlphaFold cards with drift checks;
   - fix the IDR Explorer's drift check.
6. **Weeks 6–8:** manuscript.

**Risks:**
- Parity beyond the residue tests may take longer, especially the clustering permutation nulls.
- One maintainer.
- The NC-SA licences of some sources carry over to any site table that includes them.
