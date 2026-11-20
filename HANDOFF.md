# Handoff between the website and the data

Who does what:

- **This website session owns `ptmcontext`** (code, site files, workflows, this repository's tests).
- **The PTM_Pipeline session owns the data and its releases** (tables, `releases/`, manifests of the data repository).
- **The owner merges every pull request**, merges `develop` into `main`, and tags and publishes releases (GitHub and Zenodo).
- Agents never push to `main`, never tag, and never add AI attribution to commits or pull requests.

How a data release reaches the sites:

1. The data session sends a commit of PTM_Pipeline (the release candidate).
2. The website pins it (`data_pin.json`, the workflows, the manifests), builds the four sites, runs the checks and replies "ok to tag".
3. The owner tags the data repository. The data session sends the tag commit and the Zenodo DOI.
4. The website repins to the tag (`tag` in `data_pin.json`, `ref:` in the workflows), adds the DOI where the `TODO(v1.6.0 DOI)` markers stand (landing.yml, each site file, `whats_new`), runs `python tools/check_data_pin.py` and pushes to `develop`.

The pin is one commit hash (full) and one tag name. `tools/check_data_pin.py` checks that the workflows and the manifests name the pinned commit; with the tag set, it also asks the data repository (`git ls-remote`) whether the tag resolves to that commit. While the tag is `TODO(...)`, the check passes locally with a notice and fails in CI (`--require-tag`): a site is not published from an untagged data release.

See [CONTRACTS.md](CONTRACTS.md) for the file formats, [ADDING_DATA.md](ADDING_DATA.md) and [AGENTS.md](AGENTS.md) for the rules of work (this repository has no CONTRIBUTING.md; the data repository's is the one for data), and [CHANGELOG.md](CHANGELOG.md) for what each change did.
