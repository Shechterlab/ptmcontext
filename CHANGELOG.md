## 0.5.0 (unreleased)

- Yes/no attributes (true/false, yes/no, 1/0) read as plain terms: the attribute's label is the chip and its `query` word (default: its name; `als_ftd` for the ALS/FTD gene attribute) the search text, with no value. `als_ftd_gene:true` still works in older links and is never shown.
- Landing cards without the "Strongest result" block and the italic question line; `card: {result, question}` in the landing config brings them back (default false).
- A small brand line (the landing config's `title`) above each explorer's name links to the landing page; the header's "All sites" link is gone, the sticky bar keeps it.
- Overlap page (`website.overlap`): two to four terms (protein sets, classes, reader families, enzymes, the selection, a gene list) as rows of regions (a membership matrix, a split size bar, the share with sites against all reviewed proteins with its 95% interval) and, for two or three terms, an area-proportional diagram, with proteins, proteins with sites, fold, a hypergeometric test against all reviewed proteins and Benjamini-Hochberg q for each region; also for sites, enzymes and readers. A "Compare with..." button on the rows of protein-set questions. Reader families (Tudor; chromodomain, PHD, MBT, PWWP; 14-3-3, SH2, BRCT; bromodomain, YEATS) are listed in the site files with their Pfam and InterPro ids.
- Overlap terms from GO biological process (propagated annotations without computational-only evidence, 5 to 5,000 proteins), listed by name, GO id and size; one generic `term_sources` entry in the site file (data from PTM_Pipeline's staged GO tables; cite Gene Ontology Consortium 2023 and Ashburner et al. 2000).
- `ptmc run` writes `overlap_members.json` (every protein of each set) for the questions an Overlap block names; the statistics are unchanged.
- Controls: a site file can repeat questions with one change each (`controls:`), and each question's page shows its
  controls beside its result (holds, weaker or lost), not as Overview tiles. The changes: a part of the marks
  counted by independent groups (`distinct_at_least`, with one laboratory's studies counted once and databases not at
  all), the other marks on neither side (`marks_outside: left_out`); proteins set aside (`without_proteins`); only the
  residues in a detectable tryptic peptide (`only_in: {digest}`). The Method page lists them. A result that fails a
  control (lost or reversed; `website.overview.control_badges`) keeps its tile row, with a muted badge naming the control
  that opens its Controls table.
- Methylarginine site: motif, disorder, IDR charge and aromatic-neighbour questions on the high-confidence sites (at
  least two independent studies) and the motif and disorder questions on the sites found without methylarginine
  antibodies; the near-modification and IDR charge questions inside IDRs. The release's rows are unchanged.
- Lysine and methyllysine sites: the same-lysine pairs and chromatin probability with the histones set aside; the
  near-modification and IDR charge questions inside IDRs. Lysine and phosphosite sites: disorder, structure, domain
  class and IDR charge counted only in detectable tryptic peptides.
- A flags question (motifs) may count a part of the marks or only some regions: the run lists the marks it leaves out.
- New Network tab (all four sites): the proteins with sites as one network, with STRING physical links and curated
  Complex Portal complexes as edges, grouped into Louvain clusters, each named by its most enriched GO biological process
  (q on hover; a menu names them by Reactome pathway instead). A GO term counts only if it lies at least three steps below
  the root, annotates 5 or more and at most 20% of the network's proteins, and rests on evidence other than IEA; the
  smallest q wins, and equal q goes to the deeper term. Long names are shortened in the figure only.
  Colour by cluster or by the share of sites in disordered regions, the domain class, and (phosphosites) the kinase and
  reader motif classes. A selection is clustered again in the browser. Table view, SVG, PNG and TSV exports, a
  tile on the Overview. For the code: `website.network` (schema, CONTRACTS.md, `ptmcontext/web/network.py`,
  `kit-netcore.js`, `kit-network.js`). The sites read PTM_Pipeline at commit 4557062 (the merge of its pull request 24), which stages
  the GO biological process tables (`inputs/annotation/go_bp_human_2026-11-04.tsv` and `go_bp_terms_2026-11-04.tsv`; GO
  Consortium, Genetics 224:iyad031 (2023), doi:10.1093/genetics/iyad031; Ashburner et al., Nat Genet 25:25 (2000),
  doi:10.1038/75556; CC BY 4.0); the CI and Pages checkouts are pinned to it.
- The Network figure is laid out in groups: every cluster has a region of its own, clusters of look-alike colours are
  kept apart, links between clusters are drawn as one band per pair, names sit beside the regions in a short form, and
  hovering a protein or a cluster lights what it is joined to. The default figure is laid out when the site is built; a
  phone gets its own portrait layout with numbered badges and a list. A Clusters menu asks for a number of clusters. A GO term
  must also annotate at most 1,500 proteins of the proteome to name a cluster. The exports (slide, or paper at 180 mm)
  carry a title that is a claim, one sentence, a key and a short credit; commit, file names and address stay in the file's
  metadata. Cluster slot 6 is now a brown. The controls are one row (Clusters, Colour by, Find a gene, the buttons and the
  downloads) with the others under More options, closed; the summary and the key share one line above the figure, so that
  the figure starts on the first screen of a laptop.

- Network: the Colour by menu offers the share of sites in disordered regions (five steps of the style guide's blue), a **See in
  network** button on every protein page opens the network with that protein shown, its cluster lit and the drawing zoomed
  to it (the address is `#network?p=<accession>`; a protein outside the default view makes the page draw more proteins or
  only the protein and its partners, or says why it is not there), and under the button a small drawing of the protein among
  its cluster. The button carries the selection and filters. Find genes takes a pasted list and counts and lists what it
  found. The section under the figure is called Method and is four sentences and the citations.
- Header: "All sites" sits on the switcher's row, so the lab block and links stay above the structure drawing. The sticky bar shows the short site name.
- Cell maps: a part where the maps do not agree reads "maps disagree" (was "fewer than N maps").
- Lysine header drawing: SUMOylation is labelled "SUMO", not "Ksu".

## 0.4.0 (2026-11-13)

What changed for readers:

- Each row of an Overview tile shows the fold: the share of the sites in the class over the share of the comparison
  residues in it (for a protein set, its fold enrichment). The test it rests on is beneath it: the odds ratio with its
  95% interval and q (for a set also tested within abundance deciles, that test). The counts are on hover. The odds
  ratio stays on each question's page and in the downloads. Only a fold is labelled "fold".
- A row counts as more or less often when q ≤ 0.05, the fold is at least 1.1× (or at most 1/1.1) and the test points
  the same way. A row the test could not estimate reads "not tested (too few)", not "no difference".
- A protein set tested within abundance deciles is read by that test on its tile. A set of fewer than 30 proteins, or
  one whose every member is modified (its fold at the ceiling, tied with every other such set), stays on its question's
  page but is not ranked on a tile or chosen as a landing finding.
- The maps of the cell show the fold in each map. A part of the cell is colored and ranked only when at least two maps,
  each with at least 20 modified and 20 other proteins in that part, find a difference the same way and none the other
  way. A selection that names its proteins is said to be "not compared" there, not "about as often".
- The landing card's strongest result is chosen the way the site reads its rows; for the cell it is the cell card's own
  reading. The landing intro says which questions compare residues within a protein and which compare proteins.
- Selections: retests of a motif family tested among some residues only (the phosphosite reader and kinase motifs)
  count only the residues of that type, as the site's own rows do; within-protein rows of questions of several tests and
  of questions counted inside regions count the comparison residues of the proteins with both; a selection made with one
  class of a question whose classes exclude each other tests none of them. With every site selected, the browser's
  retests now equal the site's rows on all four sites.
- "How does it differ?" (against the other sites): q is corrected across every question shown, not question by question.
  A selection of whole proteins (a gene list, a set) is shown there as shares, not tested pooled, since sites on one
  protein are not independent. A selection chosen by a feature of the residue (a motif, a class, sites nearby) says that
  its comparison residues were not chosen that way.
- Wording: phosphosite "Is it functional?" is "Reader motifs and functional scores"; the methyllysine ARKS motif is
  labelled R-K-S/T, the rule it applies; the IDR charge and predicted-interface questions say that their row against
  all residues partly restates disorder; the lysine histone question says that a very large fold on a type found on
  few proteins shows where that type has been looked for.

- Protein map: every phosphosite is drawn at first (FUS showed "Phosphosites (0)" while 27 sites were listed); the functional
  score cut (0.5 or more) is an option, and its label says how many of the sites it keeps.
- Site switcher: the protein page that is open goes with you when the other site has that protein; otherwise you land on its
  Overview. The menu's links are real addresses (they open in a new tab).
- Every site's header and sticky bar link back to the landing page; the landing page has a search for a gene or UniProt
  accession that lists the sites with that protein and links to each protein page.
- The gene-list chip no longer shows double commas; Escape closes the Rows menu and returns the focus to its button.
- AlphaFold DB complexes are asked for at once only where the site's tables name a predicted partner, else on request (the
  lookup answers 404 for most proteins); an Ensembl homology request the service refuses reads as "no ortholog".
- The site card's rows are in folds: the site, its questions and its sources open; more questions and other attributes closed.
- The histone question's filter says how many marked proteins are in none of its sets (no entry in the source table).
- Phosphosite protein map: "Color phosphosites by" offers the kinase motif class.
- Phone protein map: more width for the tracks.
- On the way down every page slides the search, selection line and tabs away and keeps one thin bar: the site name, the way home, the
  switcher, a search, the pages (wide screens) and the selection's counts with a filter dot. They return on the way up.
  `website.header.scroll_bar` and `website.header.bar` set it.

- Sources are called "Studies and databases" on the methylarginine, methyllysine and lysine websites (header, card title, filter group, "reported by 2 or more studies or databases"); phosphosite sources are "Databases".
- The cell tile says how many maps its odds ratios rest on (one to five), not always five.
- "Site" for the website is now "website" or "explorer"; "site" means a modification site only.
- Internal words removed from reader text: the data release commit, "read live", file names, the `kinase_motifs:` example chip, CPLM's Exp./Dat. codes.
- TSA-seq and Hi-C are described as the position of the genes of bound RNAs, not of the RNAs.
- Lactylation, not lactoylation. Phosphorylated residues in motifs are written pS, pT and pY. SUMO is written SUMO, not Ksu, which read like Ksucc. "Kacyl" is "Acyl".
- The website menu lists the same names, in the same order, as the landing page.
- US spelling (gray, license, neighborhood, centered).

For the code: `website.reading: {min_maps, min_group, min_set}` (defaults 2, 20, 30); `among_counts.tsv` and
selection.json `among`, `among_others`, `residues` carry a motif family's `among` to the browser; run.json keeps a flags
layer's `among`.

Numbers on the four Overviews that changed (old → new; 0.3.1 against 0.4.0 on the same statistics, PTM_Pipeline
5fadf74). The statistics themselves are unchanged: every value below is the change from the odds ratio to the fold as
the row's number, or a row that is now shown or no longer shown because of the rules above (a set read by its test
within abundance deciles, sets under 30 proteins or at the fold ceiling not ranked, the cell's two-map rule, rows whose
fold and test disagree). "no longer shown" / "now shown" are rows of a tile; the parts are the cell card's lists.

Landing cards, strongest result: methylarginine paraspeckles 2.0× → stress granules (cell map) 1.6×; methyllysine
centrosome 1.8× → actin cortex 1.5×; phosphosites actin cytoskeleton 1.14× → mitochondria 0.85× less often; lysine
chromatin (probability ≥ 0.8) 1.7× (as published) → none (no part of the cell differs in two maps, so the card shows no result).

**Methylarginine**

- Where in the cell: answer "More often in the nucleus overall (2.3×) and the cytoplasm overall (1.3×); most of all in paraspeckles (21×), stress granules (cell map) (3.0×) and P-bodies (2.7×). Less in the organelles and membranes overall (0.41×)." → "More often in the nucleus overall (1.3×) and the cytoplasm overall (1.14×); most of all in stress granules (cell map) (1.6×), nuclear bodies (1.4×) and nuclear speckles (1.3×). Less in the organelles and membranes overall (0.78×).". parts Stress granules (cell map) 3.0× → 1.6×; Nucleus 2.3× → 1.3×; Endosomes and lysosomes 0.47× → 0.60×; Endoplasmic reticulum 0.57× → 0.73×; Nuclear bodies 2.6× → 1.4×; Nucleoplasm 2.1× → 1.18×; Chromatin 1.9× → 1.2×; Nuclear speckles 1.8× → 1.3×; Nucleolus 1.4× → 1.2×; Nuclear envelope 0.78× → n.s.. parts no longer listed: P-bodies (2.7×); Peroxisomes (0.44×). parts now listed: Golgi apparatus (0.75×); Plasma membrane (0.76×).
- Protein classes: no longer shown: Modifying enzymes (1.13×); Cytoskeleton (1.11×). now shown: Immunity and defence (0.15×); Signalling: receptors, ligands and modulators (0.51×).
- Reactome pathways (top level): no longer shown: Circadian clock (1.9×); DNA Replication (1.8×). now shown: Sensory Perception (0.30×); Drug ADME (0.55×).
- Protein subclasses: no longer shown: Hsp70 family chaperone (4.3×); chaperonin (3.9×); translation elongation factor (3.4×); intermediate filament binding protein (3.3×); tubulin (3.0×). now shown: translation factor (2.7×); microtubule binding motor protein (2.7×); RNA processing factor (2.7×); immunoglobulin receptor superfamily (0.11×); peptide hormone (0.15×).
- Roles in condensates: no longer shown: Drivers (1.19×). answer "More often: Drivers (1.19×)." → none.
- Structural context: IDR >30 aa from any domain 2.1× → 1.5×; IDR 11–30 aa from a domain 1.3× → 1.8×; IDR ≤10 aa from a domain 1.19× → 1.7×; Disordered domain 1.12× → 1.4×; Folded domain 0.48× → 0.68×; Ordered, outside domains 0.89× → 0.82×.
- IDR charge: Weakly charged IDR 3.3× → 2.3×; Janus IDR 1.4× → 1.5×; Strong polyampholyte IDR 0.70× → 0.89×. no longer shown: Positively charged IDR (0.31×).
- Nearest domain class: RNA-associated zinc finger 1.9× → 1.3×; DNA-binding 1.5× → 1.3×; RNA helicase 0.49× → 0.88×; Chromatin reader 0.60× → 0.70×. no longer shown: Repeat / superfamily (1.4×).
- Sequence motifs: RGG 19× → 21×; GRG 16× → 18×; RG 6.8× → 5.2×; DR 3.1× → 2.7×; RE 0.36× → 0.38×; RD 0.51× → 0.56×.
- Aromatics within 3: One aromatic residue within ±3 1.07× → 1.09×.
- Aromatics within 3, IDRs: 2 or more aromatic residues within ±3 1.9× → 2.7×; One aromatic residue within ±3 1.4× → 1.6×.
- Aromatics within 5, IDRs: 2 or more aromatic residues within ±5 1.6× → 2.2×; One aromatic residue within ±5 1.3× → 1.4×.
- Disease: no longer shown: ALS / motor neuron / FTD (1.3×); Myopathy / muscle / cardiomyopathy (1.2×); Alzheimer / tau / dementia (1.15×); Parkinsonism (1.14×); Developmental / congenital syndromes (1.11×).
- Protein classes (PANTHER): no longer shown: DNA metabolism protein (1.6×); membrane traffic protein (1.2×). now shown: defense/immunity protein (0.15×); transmembrane signal receptor (0.17×).
- Biomolecular condensates (vs other condensates): no longer shown: DHX9 Stress Granules (2.0×). now shown: Paraspeckle (1.4×).
- Reactome pathways (all levels): no longer shown: Folding of actin by CCT/TriC (3.8×); Cytosolic tRNA aminoacylation (3.5×); Z-decay: degradation of maternal mRNAs by zygotically expressed factors (3.5×); Signal attenuation (3.4×). now shown: L13a-mediated translational silencing of Ceruloplasmin expression (3.1×); SARS-CoV-1 modulates host translation machinery (3.1×); Expression and translocation of olfactory receptors (0.05×); Creation of C4 and C2 activators (0.05×).
- Human Protein Atlas locations: no longer shown: Calyx (1.5×); Primary cilium tip (1.5×); Nuclear speckles (1.2×); Nuclear bodies (1.17×); Cytosol (1.16×). now shown: Mitotic spindle (1.3×); Centriolar satellite (1.3×); Cytokinetic bridge (1.3×); Vesicles (0.73×); Golgi apparatus (0.75×).
- Cell Map compartments: no longer shown: miscellaneous (1.3×); nucleolus (1.2×). now shown: microtubule cytoskeleton (1.14×); ER membrane (0.40×); endosome, lysosome (0.60×).
- Cell Map domains: now shown: centrosome enriched, P-body enriched (1.11×); nuclear outer membrane-ER membrane network (0.59×); mitochondrial outer membrane, peroxisome (0.63×).
- Organelle IP: no longer shown: P-body (1.7×); Nucleus (1.3×). now shown: Lysosome (0.44×); Trans-Golgi (0.47×).
- Chromatin probability: now shown: Chromatin probability 0.2–0.5 (0.78×); Chromatin probability 0.5–0.8 (1.03×).
- Disorder context: In an IDR 2.1× → 1.5×; Ordered 0.51× → 0.63×; Ordered, ≤20 aa from an IDR 0.91× → 0.92×.
- Domain context: Domain-distal 2.1× → 1.3×; In domain 0.51× → 0.74×. no longer shown: Inter-domain linker (1.4×).

**Methyllysine**

- Where in the cell: answer "More often in the nucleus overall (2.0×) and the cytoplasm overall (1.11×); most of all in paraspeckles (2.5×), nuclear speckles (2.0×) and nucleolus (2.0×). Less in the organelles and membranes overall (0.54×)." → "More often in the nucleus overall (1.3×); most of all in actin cortex (1.5×), nuclear speckles (1.5×) and nucleolus (1.4×). Less in the organelles and membranes overall (0.76×).". parts Nucleus 2.0× → 1.3×; Mitochondria 0.58× → 0.73×; Actin cortex 1.7× → 1.5×; Centrosome 1.7× → 1.2×; Endosomes and lysosomes 0.61× → 0.75×; Nuclear speckles 2.0× → 1.5×; Nucleolus 2.0× → 1.4×; Chromatin 1.9× → 1.4×; Nuclear bodies 1.7× → n.s.; Nucleoplasm 1.6× → 1.2×; Nuclear envelope 0.78× → n.s.. parts no longer listed: Peroxisomes (0.53×). parts now listed: Endoplasmic reticulum (0.76×).
- Chromatin probability: now shown: Chromatin probability 0.2–0.5 (0.84×).
- Histones and other proteins, Kme3: no longer shown: Histones (2.2×). answer "More often: Histones (2.2×)." → none.
- Protein classes: now shown: Immunity and defence (0.25×); Signalling: receptors, ligands and modulators (0.68×).
- Protein classes (PANTHER), grouped, Kme1: no longer shown: Scaffolds, adaptors and chaperones (1.3×). now shown: Immunity and defence (0.13×); Signalling: receptors, ligands and modulators (0.60×).
- Protein classes (PANTHER), grouped, Kme2: now shown: Immunity and defence (0.19×); Signalling: receptors, ligands and modulators (0.63×).
- Protein classes (PANTHER), grouped, Kme3: no longer shown: RNA processing and translation (1.5×); Scaffolds, adaptors and chaperones (1.4×). now shown: Immunity and defence (0.23×); Signalling: receptors, ligands and modulators (0.60×); Metabolic enzymes (0.92×).
- Reactome pathways (top level): no longer shown: Cell Cycle (1.7×); Programmed Cell Death (1.7×). now shown: Sensory Perception (0.45×); Metabolism (0.93×).
- Protein subclasses: no longer shown: intermediate filament binding protein (4.6×); actin binding motor protein (3.2×); Hsp70 family chaperone (3.2×); DNA helicase (3.2×); tubulin (3.0×); chaperonin (2.9×). now shown: histone modifying enzyme (2.8×); actin and actin related protein (2.6×); HMG box transcription factor (2.2×); ATP-binding cassette (ABC) transporter (2.2×); immunoglobulin receptor superfamily (0.23×); cytokine (0.31×).
- Disorder context: IDR 1.3× → 1.2×; Ordered, >20 aa from an IDR 0.76× → 0.85×.
- Disorder context, Kme1: IDR 1.3× → 1.2×; Ordered, >20 aa from an IDR 0.74× → 0.84×.
- Disorder context, Kme2: IDR 1.3× → 1.16×; Ordered, >20 aa from an IDR 0.78× → 0.88×.
- Disorder context, Kme3: IDR 1.5× → 1.2×; Ordered, >20 aa from an IDR 0.78× → 0.90×; Ordered, ≤20 aa from an IDR 0.88× → 0.91×.
- Charge of the IDR: Weakly charged IDR 1.5× → 1.4×; Janus IDR 1.4× → 1.3×.
- Structural context: IDR ≤10 aa from a domain 1.3× → 1.9×; IDR >30 aa from any domain 1.3× → 1.13×; IDR 11–30 aa from a domain 1.19× → 1.5×; Disordered domain 1.18× → 1.3×; Folded domain 0.73× → 0.88×.
- Sequence motifs: Ser or Thr at +1 1.3× → 1.2×; Gly at −1 1.2× → 1.3×; Another Lys at −1 or +1 0.73× → 0.77×; Arg at −1 0.74× → 0.80×. now shown: Lys or Arg within ±3 (0.94×).
- Near phosphosites (±10 residues): A phosphosite within ±10 1.3× → 1.4×.
- Near phosphosites (±10 residues), Kme1: A phosphosite within ±10 1.4× → 1.5×.
- Near phosphosites (±10 residues), Kme2: A phosphosite within ±10 1.3× → 1.4×.
- Near phosphosites (±10 residues), Kme3: A phosphosite within ±10 1.4× → 1.3×.
- Near high-score phosphosites (±10 residues): A high-score phosphosite within ±10 1.4× → 2.5×.
- Near high-score phosphosites (±10 residues), Kme1: A high-score phosphosite within ±10 1.5× → 2.8×.
- Near methylarginines (±10 residues): A methylarginine within ±10 1.5× → 2.6×.
- Protein complexes: no longer shown: Neural progenitor-specific SWI/SNF ATP-dependent chromatin remodeling complex, ARID1A-SMARCA2 variant (+3 similar) (3.9×); Neural progenitor-specific SWI/SNF ATP-dependent chromatin remodeling complex, ARID1A-SMARCA4 variant (+3 similar) (3.9×); Polycomb repressive complex 2.1, EZH1-RBBP7-PCL2-PALI1 variant (3.9×); Polycomb repressive complex 2.1,EZH2-RBBP7-PCL2-PALI1 variant (3.9×); Polycomb repressive complex 2.1,EZH2-RBBP7-PCL3-PALI1 variant (3.9×); Polycomb repressive complex 2.1, EZH1-RBBP7-PCL3-PALI1 variant (3.9×); Neuron-specific SWI/SNF ATP-dependent chromatin remodeling complex, ARID1A-SMARCA2 variant (+3 similar) (3.5×). answer "More often: Neural progenitor-specific SWI/SNF ATP-dependent chromatin remodeling complex, ARID1A-SMARCA2 variant (+3 similar) (3.9×), Neural progenitor-specific SWI/SNF ATP-dependent chromatin remodeling complex, ARID1A-SMARCA4 variant (+3 similar) (3.9×)." → none.
- Disease: no longer shown: Parkinsonism (1.11×); Immune / inflammatory (1.07×). now shown: Cancer / neoplasia (1.05×).
- Protein classes (PANTHER): no longer shown: RNA metabolism protein (1.5×); translational protein (1.5×). now shown: defense/immunity protein (0.25×); intercellular signal molecule (0.43×).
- Reactome pathways (all levels): no longer shown: Attenuation phase (3.7×); ALK mutants bind TKIs (3.5×); Attachment of bacteria to epithelial cells (3.5×); Biofilm formation (3.5×); Formation of the embryonic stem cell BAF (esBAF) complex (3.5×); Formation of the polybromo-BAF (pBAF) complex (3.4×); Replacement of protamines by nucleosomes in the male pronucleus (3.3×). now shown: ERCC6 (CSB) and EHMT2 (G9a) positively regulate rRNA expression (3.3×); MET activates PTK2 signaling (3.3×); RNA Polymerase I Promoter Opening (3.2×); ChAHP complex assembly (3.2×); Regulation of endogenous retroelements by Piwi-interacting RNAs (piRNAs) (3.1×); Expression and translocation of olfactory receptors (0.14×); Olfactory Signaling Pathway (0.16×).
- Human Protein Atlas locations: no longer shown: Mitotic spindle (1.4×); Basal body (1.4×). now shown: Vesicles (0.80×); Mitochondria (0.84×).
- Human Cell Map compartments: no longer shown: cytoplasmic ribonucleoprotein granule (1.2×); chromatin (1.2×). now shown: mitochondrial inner membrane, mitochondrial intermembrane space (0.46×); ER membrane (0.55×).
- Human Cell Map domains: now shown: mitochondrial outer membrane, peroxisome (0.59×); nuclear outer membrane-ER membrane network (0.62×).
- Organelle IP: no longer shown: Translation (1.4×); Stress granules (cell map) (1.3×). now shown: Lysosome (0.41×); ERGIC (0.55×).
- Biomolecular condensates (vs other condensates): no longer shown: Leucocyte nuclear body (1.9×); IMP1 RNP granule (1.8×); PML body (1.19×).
- Domain context: Domain-distal 1.2× → 1.06×; Outside, ≤20 aa from a domain 1.13× → 1.2×; In domain 0.77× → 0.92×. no longer shown: Inter-domain linker (1.2×).

**Phosphosites**

- Where in the cell: answer "More often in the nucleus overall (2.5×) and the cytoplasm overall (1.9×); most of all in stress granules (cell map) (8.6×), nuclear bodies (3.4×) and chromatin (2.8×). Less in the organelles and membranes overall (0.31×)." → "No region differs from other proteins of similar abundance in at least 2 maps.". parts Stress granules (cell map) 8.6× → n.s.; Mitochondria 0.23× → 0.85×; Endoplasmic reticulum 0.45× → 0.87×; Nuclear bodies 3.4× → n.s.; Chromatin 2.8× → n.s.; Nuclear speckles 2.5× → n.s.; Nucleoplasm 2.1× → n.s.. parts no longer listed: Nucleus (2.5×); Centrosome (2.1×); Plasma membrane (2.0×). parts now listed: Endosomes and lysosomes (0.86×); P-bodies (n.s.); Golgi apparatus (n.s.).
- Chromatin probability: now shown: Chromatin probability 0.2–0.5 (0.97×).
- Protein classes: no longer shown: Protein-modifying enzymes (1.13×); Cytoskeleton, adhesion and matrix (1.09×). now shown: Immunity and defence (0.49×); Signalling: receptors, ligands and modulators (0.81×); Metabolic enzymes (0.98×).
- Reactome pathways (top level): no longer shown: Cell Cycle (1.4×); Programmed Cell Death (1.4×). now shown: Sensory Perception (0.40×); Drug ADME (0.80×).
- Protein subclasses: no longer shown: non-receptor tyrosine protein kinase (1.7×); Hsp70 family chaperone (1.7×); intermediate filament binding protein (1.7×); damaged DNA-binding protein (1.6×); SNARE protein (1.6×); mutase (1.5×); actin binding motor protein (1.5×). now shown: non-receptor serine/threonine protein kinase (1.5×); histone modifying enzyme (1.5×); C4 zinc finger nuclear receptor (1.5×); guanyl-nucleotide exchange factor (1.5×); RNA splicing factor (1.5×); immunoglobulin (0.16×); cytokine (0.16×).
- Disorder context: IDR 4.8× → 2.4×; Ordered, >20 aa from an IDR 0.20× → 0.32×; Ordered, ≤20 aa from an IDR 0.72× → 0.81×.
- Charge of the IDR: Janus IDR 2.9× → 3.1×; Strong polyampholyte IDR 2.8× → 3.6×; Weakly charged IDR 2.7× → 2.1×; Negatively charged IDR 2.1× → 2.5×.
- Structural context: IDR >30 aa from any domain 3.5× → 2.4×; IDR 11–30 aa from a domain 2.8× → 3.0×; IDR ≤10 aa from a domain 2.1× → 2.5×; Folded domain 0.20× → 0.37×; Ordered, outside domains 0.58× → 0.63×.
- Nearest domain class: Chromatin reader 1.2× → 1.6×; Catalytic enzyme domain 1.11× → 1.05×; Chromatin catalytic / remodeler 0.55× → 0.92×; Protein-protein repeat / scaffold 0.69× → 0.79×. now shown: RNA helicase (0.98×).
- Kinase motif classes: S/T-P (proline-directed) 6.0× → 4.0×; R-x-x-S/T (basic at -3) 2.2× → 2.0×.
- Reader motifs: Polo-box (S-Sph/Tph-P) 6.1× → 4.7×; 14-3-3 mode 1 (R-S-x-Sph-x-P) 5.6× → 6.4×; 14-3-3, relaxed (R-x-x-Sph-x-P) 3.9× → 3.5×; SH2 PI3K (Yph-M/V-x-M) 2.3× → 2.7×; beta-TrCP phosphodegron (D-Sph-G-x-x-Sph) 1.9× → 2.1×; BRCT (Sph-x-x-F) 0.67× → 0.63×.
- Near methylarginines (±10 residues): A methylarginine within ±10 1.5× → 3.0×.
- Near methyllysines (±10 residues): A methyllysine within ±10 1.3× → 2.4×.
- Shared arginine: R-x-x-S/T, the Arg methylated 2.6× → 5.3×; R-x-S/T, the Arg methylated 2.2× → 4.3×.
- Interfaces in PDB structures: Any interface 1.2× → 1.5×; Protein interface 1.2× → 1.5×; Any interface, ordered regions 1.2× → 1.5×; Protein interface, ordered regions 1.2× → 1.5×; Any interface, in domains 1.19× → 1.3×; Protein interface, in domains 1.17× → 1.3×.
- Predicted interfaces: pDockQ ≥ 0.23 0.47× → 0.66×; pDockQ ≥ 0.5 0.50× → 0.67×; pDockQ ≥ 0.23, ordered regions 0.64× → 0.96×; pDockQ ≥ 0.5, ordered regions 0.68× → 0.97×. no longer shown: pDockQ ≥ 0.5, disordered regions (0.71×); pDockQ ≥ 0.23, disordered regions (0.81×).
- IntAct binding regions and mutations: IntAct binding region 3.3× → 3.7×; Mutation changes an interaction 2.0× → 1.3×; Binding region, disordered residues 1.5× → 2.1×.
- Protein classes (PANTHER): no longer shown: translational protein (1.4×); chaperone (1.3×); membrane traffic protein (1.2×). now shown: protein-binding activity modulator (1.2×); intercellular signal molecule (0.47×); defense/immunity protein (0.49×).
- Reactome pathways (all levels): no longer shown: RHOC GTPase cycle (1.5×); SUMOylation of chromatin organization proteins (1.5×); SUMOylation of RNA binding proteins (1.5×); SUMOylation of DNA replication proteins (1.5×); Signaling by moderate kinase activity BRAF mutants (1.5×); Signaling by RAS mutants (1.5×); Paradoxical activation of RAF signaling by kinase inactive BRAF (1.5×). now shown: RAC2 GTPase cycle (1.4×); SUMO E3 ligases SUMOylate target proteins (1.4×); Transport of Mature Transcript to Cytoplasm (1.4×); Nuclear Envelope (NE) Reassembly (1.4×); RHOA GTPase cycle (1.4×); Beta defensins (0.12×); Expression and translocation of olfactory receptors (0.13×).
- Human Protein Atlas locations: no longer shown: Nucleoli rim (1.14×); Nucleoplasm (1.05×). now shown: Principal piece (0.86×); Vesicles (0.90×); Mitochondria (0.93×); Nuclear bodies (1.06×).
- Human Cell Map compartments: no longer shown: microtubule cytoskeleton (1.08×); plasma membrane (1.06×); actin cytoskeleton, cytosol (1.06×); nucleolus (1.06×). now shown: mitochondrial inner membrane, mitochondrial intermembrane space (0.74×); ER lumen (0.77×); ER membrane (0.82×); mitochondrial matrix (0.85×).
- Human Cell Map domains: no longer shown: microtubule cytoskeleton (1.09×); paraspeckles (1.09×); cytoplasmic ribonucleoprotein granule (1.08×). now shown: ER lumen (0.77×); mitochondrial inner membrane, mitochondrial intermembrane space, mitochondrial matrix (0.82×); nuclear outer membrane-ER membrane network (0.93×).
- Organelle IP: no longer shown: Proteasome (1.13×); Translation (1.10×). now shown: Mitochondrion (0.80×); Lysosome (0.82×).
- Biomolecular condensates (vs other condensates): now shown: Centrosome (1.00×).
- Domain context: Domain-distal 2.4× → 1.5×; Inter-domain linker 2.0× → 1.4×; Outside, ≤20 aa from a domain 1.5× → 1.3×; In domain 0.27× → 0.49×.

**Lysine**

- Where in the cell: answer "More often in the nucleus overall (2.9×) and the cytoplasm overall (1.4×); most of all in chromatin (13×), nucleoplasm (2.1×) and nuclear bodies (1.6×). Less in the organelles and membranes overall (0.41×)." → "No region differs from other proteins of similar abundance in at least 2 maps.". parts Nucleus 2.9× → n.s.; Plasma membrane 0.57× → n.s.; Chromatin 13× → n.s.; Nucleoplasm 2.1× → n.s.; Nuclear bodies 1.6× → n.s.; Nucleolus 1.5× → n.s.. parts no longer listed: Endoplasmic reticulum (n.s.); Stress granules (cell map) (n.s.). parts now listed: Golgi apparatus (n.s.); Mitochondria (n.s.).
- Chromatin probability: now shown: Chromatin probability 0.2–0.5 (0.97×).
- Acetylated and ubiquitinated lysines: Also reported ubiquitinated 4.7× → 3.0×.
- Acetylated and SUMOylated lysines: Also reported SUMOylated 3.0× → 2.8×.
- Ubiquitinated and SUMOylated lysines: Also reported SUMOylated 4.7× → 3.9×.
- Acetylated and methylated lysines: Also reported methylated 1.8× → 2.8×.
- Ubiquitinated and methylated lysines: Also reported methylated 1.8× → 2.2×.
- SUMOylated and methylated lysines: Also reported methylated 1.7× → 1.9×.
- Histones and other proteins: no longer shown: Histones (1.3×). answer "More often: Histones (1.3×)." → none.
- Protein classes: no longer shown: Metabolic enzymes (1.16×). now shown: Immunity and defence (0.39×); Signalling: receptors, ligands and modulators (0.67×); Cytoskeleton, adhesion and matrix (0.94×).
- Reactome pathways (top level): no longer shown: DNA Replication (1.4×); Cell Cycle (1.3×). now shown: Sensory Perception (0.34×); Neuronal System (0.85×).
- Protein subclasses: no longer shown: aminoacyl-tRNA synthetase (1.6×); exoribonuclease (1.6×); DNA helicase (1.6×); damaged DNA-binding protein (1.6×); DNA-directed DNA polymerase (1.6×); translation elongation factor (1.6×); mutase (1.6×). now shown: RNA splicing factor (1.5×); ribosomal protein (1.5×); RNA methyltransferase (1.5×); RNA helicase (1.5×); translation factor (1.5×); immunoglobulin (0.10×); antimicrobial response protein (0.21×).
- Disorder context: Ordered, ≤20 aa from an IDR 1.3× → 1.18×; IDR 0.77× → 0.85×; Ordered, >20 aa from an IDR 0.94× → 0.99×.
- Charge of the IDR: Positively charged IDR 0.20× → 0.68×; Negatively charged IDR 0.46× → 0.77×; Strong polyampholyte IDR 0.56× → 0.79×; Janus IDR 0.91× → 0.83×.
- Structural context: Ordered, outside domains 1.3× → 1.11×; IDR >30 aa from any domain 0.75× → 0.78×; Disordered domain 0.91× → 0.99×. no longer shown: IDR ≤10 aa from a domain (0.91×); IDR 11–30 aa from a domain (0.91×); Folded domain (0.94×).
- Nearest domain class: Chromatin catalytic / remodeler 1.3× → 1.6×; DNA-binding 1.19× → 1.2×; Catalytic enzyme domain 1.11× → 1.13×. no longer shown: Repeat / superfamily (1.11×); Chromatin reader (0.85×).
- Sequence motifs: ψ-K-x-D/E 2.3× → 1.9×; Asp or Glu within ±3 1.4× → 1.11×; Arg at −1 0.53× → 0.63×; Another Lys at −1 or +1 0.55× → 0.70×. no longer shown: Ser or Thr at +1 (1.03×). now shown: Lys or Arg within ±3 (0.93×).
- Near methylarginines (±10 residues): A methylarginine within ±10 1.3× → 3.0×.
- Near methyllysines (±10 residues): A methyllysine within ±10 1.14× → 1.6×.
- Near phosphosites (±10 residues): A phosphosite within ±10 1.3× → 1.7×.
- Near high-score phosphosites (±10 residues): A high-score phosphosite within ±10 1.4× → 2.5×.
- Predicted interfaces: pDockQ ≥ 0.5 1.07× → 1.3×; pDockQ ≥ 0.23 1.06× → 1.4×.
- IntAct binding regions and mutations: no longer shown: IntAct binding region (0.89×). answer "Less often: IntAct binding region (0.89×)." → none.
- RNA and DNA interfaces in PDB structures: no longer shown: RNA interface (0.70×); RNA interface, ordered regions (0.75×); DNA interface, ordered regions (0.79×); DNA interface (0.80×). answer "Less often: RNA interface (0.70×)." → none.
- Disease: no longer shown: ALS / motor neuron / FTD (1.10×); Myopathy / muscle / cardiomyopathy (1.10×); Parkinsonism (1.06×); Developmental / congenital syndromes (1.05×); Alzheimer / tau / dementia (1.04×); Cancer / neoplasia (1.03×).
- Protein classes (PANTHER): no longer shown: cytoskeletal protein (1.2×); gene-specific transcriptional regulator (1.2×). now shown: defense/immunity protein (0.39×); transmembrane signal receptor (0.39×).
- Reactome pathways (all levels): no longer shown: mRNA Splicing (1.4×); mRNA Splicing - Major Pathway (1.4×); mRNA Polyadenylation (1.4×); HATs acetylate histones (1.4×); Nucleotide Excision Repair (1.4×); Regulation of PLK1 Activity at G2/M Transition (1.4×); CLEC7A (Dectin-1) signaling (1.4×). now shown: mRNA 3'-end processing (1.4×); Processing of Capped Intron-Containing Pre-mRNA (1.4×); G2/M Checkpoints (1.4×); Late Phase of HIV Life Cycle (1.4×); HCMV Infection (1.4×); Expression and translocation of olfactory receptors (0.09×); Olfactory Signaling Pathway (0.11×).
- Human Protein Atlas locations: no longer shown: Peroxisomes (1.3×); Mitochondria (1.09×); Primary cilium (1.09×). now shown: Plasma membrane (0.86×); Vesicles (0.89×); Golgi apparatus (0.91×).
- Human Cell Map compartments: no longer shown: nuclear body (1.03×). now shown: cell junction (0.94×).
- Human Cell Map domains: now shown: endosome, lysosome (0.96×); cell junction, plasma membrane (0.98×).
- Organelle IP: no longer shown: Nucleolus (1.04×); Stress granules (cell map) (1.03×). now shown: Recycling endosome (0.93×); Plasma membrane (0.97×); Mitochondrion (0.99×).
- Biomolecular condensates (vs other condensates): no longer shown: P-body (1.04×); Stress granule (1.04×); Nucleolus (1.03×). now shown: Presynaptic clusters and postsynaptic densities (0.99×).
- Domain context: Outside, ≤20 aa from a domain 1.14× → 1.19×; Domain-distal 0.92× → 0.88×. no longer shown: Inter-domain linker (1.16×); In domain (0.92×).

## 0.3.1 (2026-11-13)

What changed for readers:

- All sites read PTM_Pipeline v1.5.0 at commit 5fadf74, whose SUMOylation and ubiquitination tables add two proteome-wide
  mass-spectrometry studies as sources of their own: Hendriks et al. 2017 (SUMO-2 sites in HeLa and U2OS cells; 48,593
  SUMOylation rows instead of 39,633) and Akimov et al. 2018 (UbiSite, Hep2 and Jurkat cells; 125,771 ubiquitination rows
  instead of 123,932). The "near SUMOylation" and "near ubiquitination" questions of the methylarginine, methyllysine and
  phosphosite sites change with them; their citations name both studies.
- Lysine site: Hendriks 2017 and Akimov 2018 are in the Databases filter, with their cell lines (filters) and localization
  probabilities (on the site card), so SUMO or ubiquitin sites can be seen without CPLM 4.0. The same-lysine pairs are
  also asked with the SUMOylation sites of Hendriks 2017 and the ubiquitination sites of Akimov 2018 alone, shown as a
  second line under each pair's tile. The header counts sources, five now.
- The line under a pair tile reads like the tile itself: "Among lysines with another modification: 2.5×, q 1.8e-261".
- The Overview opens with its question, color key and test switch, then the sections in the sidebar's order; on the lysine
  site the same-lysine pairs follow the cell directly. The lysine Overview shows each question once, for all types
  together; the per-type versions (chromatin, histones, protein classes, disorder and the rest) stay on each question's page,
  which links to them, in All tests and in the downloads.
- An address with a leading slash, such as `#/protein/P68431` or `#/protein/H3C1`, opens the protein page.
- The Methods page lists the 200 sources that report the most sites (the lysine site's PubMed IDs drew a page of about
  200,000 elements, which crashed the browser); every one stays in the Sites download. The lysine site's selection data
  is 119 MB instead of about 200 MB, so pages that test a selection need less memory.

For the code: an Overview card's `beside` may be a list of lines; a question's page links to the other questions of its
`family`; `tools/audit/links.js --budget MINUTES` stops starting pages after that time and lists the rest, `--verbose`
prints each break as found, and a SIGTERM writes the report so far; the tests workflow's link audit sets workers and a
budget per site (two workers for the lysine site); in the selection data a question that counts some marks only
(`only_in`, `marks_where`) has one table for all its classes (`by_test[id].all`, `outside: unclassed`).

## 0.3.0 (2026-11-12)

What changed for readers:

- A fourth site, the Lysine Modification Explorer: human lysine acetylation, other acylations (crotonylation,
  2-hydroxyisobutyrylation, succinylation, malonylation and others), ubiquitination and SUMOylation sites from UniProt,
  iPTMnet and CPLM 4.0, each lysine compared with the other lysines of its protein, for all types and for each type with
  at least 200 lysines. It is on the landing page and in the site menu of every site.
- On the lysine site's Overview, the "same lysine, different modifications" pairs (acetylation and ubiquitination,
  acetylation and SUMOylation, ubiquitination and SUMOylation, and each with methylation) come right after the cell maps.
  Each pair is also tested among lysines with another modification only (a type other than the two compared, methylation
  included), still within each protein, because mass spectrometry finds some lysines far more often than others; the
  result is shown beside the pair's own and is in the statistics download.
- All sites read PTM_Pipeline v1.5.0 at commit e1852ba, whose acetylation and acylation tables now include CPLM 4.0
  (53,177 acetylation sites instead of 4,597; 15 other acyl types). The "near acetylation" and "near other acylation"
  questions of the methylarginine, methyllysine and phosphosite sites change with them.
- The protein map opens with an "All modifications" block: a thin lane for each modification with its short name (Kme,
  Rme, Sph/Tph/Yph, Kac, Kub, Ksu, ...); on the lysine site each lysine modification has its own lane. The grey UniProt row
  of other modifications starts off.
- The cell and nucleus maps on a protein page name every compartment: found here, not found here, or not tested. The
  line under them reads "Found in".
- Table cells break at spaces, never inside a word. Reader-facing wording is plainer throughout.

For the code: `only_in: {marks: [ids]}` counts only the residues some marks are reported on (`site` for the site's own
marks, a context mark or a part of the marks); a residue question's `background` names its rows' background; an Overview
card's `beside: {analysis, label}` shows another question's result on the tile; `combined_marks.split` gives the site's
own marks a lane for each value of an attribute; `marks.add[].set` and `marks.parts` make one marks table of several
kinds. The Pages workflow builds each site in its own job and then assembles them; the tests workflow runs lint, tests
and the link audit of each site side by side.

## 0.2.0 (2026-11-11)

What changed for readers of the three sites (methylarginine, methyllysine, phosphosites):

- The methyllysine and phosphosite sites read PTM_Pipeline v1.5.0 at commit bdb5b86.
- Each statistic row on the methyllysine and phosphosite sites says "each protein analyzed separately" and "with each
  abundance decile analyzed separately" instead of "a stratum". The methylarginine site keeps the v1.4.3 wording.
- Protein map row labels that do not fit wrap onto two lines instead of ending in "…", on the page and in exports.
- The citation and licence notes state only the source, the citation, the DOI and the licence of each input.

For the code: the export audits (text overlap, legends) run in `tests.yml`, one job per site, so a Pages deploy no
longer waits for them. A mark profile can set `words.within_protein`.
