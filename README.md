# ptmcontext (working name; `ptmcontext` proposed)

Where do modifications fall in proteins, tested fairly? One reference proteome, any mark (methylarginine,
phosphosites, methyllysine ...), any regions (disorder, IDRs, domains, motifs, a lab's own), and two tests for every
class: **pooled** (Fisher) and **within protein** (Mantel–Haenszel, each protein a stratum), written in the statistics
table of the Methylarginine Site Explorer's releases.

A site is a YAML file. Changing the mark, the organism or the analyses is changing the file:

```bash
pip install -e ".[test]"
ptmc stage uniprot UP000002311 --out DATA/inputs --manifest sites/yeast_phospho.inputs.json --prefix yeast
ptmc stage mobidb --out DATA/inputs --manifest sites/yeast_phospho.inputs.json --prefix yeast
ptmc stage shephard s_cerevisiae --out DATA/inputs --manifest sites/yeast_phospho.inputs.json --prefix yeast
ptmc run sites/yeast_phospho.yaml --root DATA          # -> out/yeast_phospho/statistics.tsv and run.json
ptmc web sites/yeast_phospho.yaml                      # -> out/yeast_phospho/web/: the site, in the Methylarginine Site Explorer's look
```

## Status (pilot)

- **Parity:** `sites/methylarginine.yaml` rebuilds 3,646 of the 4,659 rows (78%) of release v1.4.3's statistics table
  byte for byte, from the release's inputs, without running any of its code (`tests/test_parity_v1_4_3.py`):
  - the 82 residue-level rows (motif, disorder, domain context, domain class, structure context; pooled and within
    protein);
  - the 3,564 protein-set rows for Reactome top-level groups, Reactome pathways and HPA locations (clusterProfiler's
    `enricher`, rewritten in Python, and its repeat within PaxDb abundance deciles).

  The rest (PANTHER classes, condensates, interfaces, crosslinks, cell maps, eCLIP) come next, one parity check at a
  time.
- **A second organism by configuration:** yeast phosphosites staged from UniProt 2026_03, MobiDB and SHEPHARD in
  about 50 s and run in 21 s. UniProt's domain features cover 1,937 of 6,067 yeast proteins; SHEPHARD's ECOD domains
  fill 2,506 more, so 79% of the phosphosites (4,702 of 5,930) are on a protein with domain data, up from 47%.
- **A website per site, from its file:** `ptmc web` gives the Methylarginine Site Explorer's look with the site's own
  colours, pictures and words; every figure and table downloads as PDF, SVG, PNG and TSV carrying its description,
  citation (from the site's `CITATION.cff`), versions and provenance.
- **Not built yet:** isoform placement, measured backgrounds, the release writer, the remaining 1,013 rows. See
  [docs/DESIGN_REVIEW.md](docs/DESIGN_REVIEW.md) for why this design, the alternatives, prior art and the order of work.

## Publishing

`.github/workflows/pages.yml` builds every site from its sources on each merge to `main` and publishes them with a
landing page on GitHub Pages (Settings → Pages → Source: GitHub Actions). By hand:

```bash
ptmc pages sites/methylarginine.yaml sites/yeast_phospho.yaml --out _site   # after ptmc run and ptmc web for each
```

## Read next

| | |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | the pieces and the rules they enforce |
| [CONTRACTS.md](CONTRACTS.md) | the five file formats |
| [ADDING_DATA.md](ADDING_DATA.md) | adding a source, a mark or a site: a step-by-step guide written for AI agents |
| [AGENTS.md](AGENTS.md) | the rules for anyone, human or AI, changing this repository |

## Licence

Code: MIT ([LICENSE](LICENSE)). Inputs keep their sources' terms, recorded in each manifest; this repository
redistributes no input data.
