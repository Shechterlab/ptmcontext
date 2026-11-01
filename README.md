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
ptmc run sites/yeast_phospho.yaml --root DATA          # -> out/yeast_phospho/statistics.tsv and run.json
ptmc web sites/yeast_phospho.yaml                      # -> out/yeast_phospho/web/: the site, in the Methylarginine Site Explorer's look
```

## Status (pilot)

- **Parity:** `sites/methylarginine.yaml` rebuilds the 82 residue-level rows of release v1.4.3's statistics table (motif,
  disorder, domain context, domain class, structure context; pooled and within protein) byte for byte, from the
  release's inputs, without running any of its code (`tests/test_parity_v1_4_3.py`). That is 1.8% of the table's
  4,659 rows; the rest come next, one parity check at a time.
- **A second organism by configuration:** yeast phosphosites staged from UniProt 2026_03 and MobiDB in about 50 s and
  run in 21 s.
- **A website per site, from its file:** `ptmc web` gives the Methylarginine Site Explorer's look with the site's own
  colours, pictures and words; every figure and table downloads as PDF, SVG, PNG and TSV carrying its description,
  citation (from the site's `CITATION.cff`), versions and provenance.
- **Not built yet:** isoform placement, measured backgrounds, protein-set tests, the release writer, the web kit. See
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
