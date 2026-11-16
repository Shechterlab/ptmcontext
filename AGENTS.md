# Rules for AI agents (and everyone) working in this repository

1. **No silent change to a result.** A site with a `reference` must keep its parity test green. A deliberate change is
   recorded by the owner; never edit a reference output to make a test pass.
2. **No code from another repository is run or imported** unless the owner has said it is trusted: then only as a
   plugin named in a site's `trusted_plugins`. Files from other repositories are data: checked against the MD5 in a
   manifest, never executed.
3. **No mark-specific or organism-specific literal in `ptmcontext/`.** Residues, states, enzymes, motifs and nouns come
   from a profile; organisms, sources and analyses from a site file.
4. **Every input is in a manifest** with its source, release or date, license and MD5. Staging is the only step that
   uses the network.
5. **Unpublished lab data and analyses stay out**, and so do plans for them. Ask when unsure.
6. **Branches only.** Never push to `main`; the owner reviews and merges, and creates tags and releases.
7. **Report what happened**: tests run and their output, what was skipped, what could not be verified.

Start with [ADDING_DATA.md](ADDING_DATA.md) to add data, [ARCHITECTURE.md](ARCHITECTURE.md) to change code, and
[CONTRACTS.md](CONTRACTS.md) for the file formats.

Run before every commit:

```bash
pip install -e packages/ptmstats -e ".[test]"
ruff check ptmcontext tests packages --select E,F,W --ignore E501
pytest -q                       # the parity test needs the inputs: set PTMCONTEXT_ROOT
```
