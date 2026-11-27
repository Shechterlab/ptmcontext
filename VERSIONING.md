# Versioning

Two versions are named everywhere, each with its label:

- **App: PTMcontext 0.6.0.** The website's software. One number for the kit and for every explorer. There is no separate
  site version. Each explorer's citation file (`sites/<site>.citation.cff`) carries the same `version:`.
- **Data: PTM_Pipeline v1.7.0 (doi:10.5281/zenodo.24429699).** The data release the explorers read. It is pinned in
  `data_pin.json`.

The app version lives in `pyproject.toml`, `ptmcontext/__init__.py`, `CITATION.cff` and every `sites/*.citation.cff`.
`tests/test_release_version_consistency.py` fails when they differ, when `CHANGELOG.md` has no dated heading for the
version, or when this file or the README names a different version.

## What each number means

Semantic versioning, `MAJOR.MINOR.PATCH`.

| Bump | When | Examples |
|---|---|---|
| MAJOR | An old link, URL parameter or export column stops working. | A page address is renamed without a redirect. A URL parameter (`ml=`, `mv=`) changes meaning. A column of a TSV download is renamed or removed. |
| MINOR | A new page or feature, or a newly pinned data release. | The Disease variants page. A new question on an explorer. `data_pin.json` moves from v1.7.0 to v1.8.0. |
| PATCH | A fix or a wording change. | A label that overlapped. A typo. A tooltip that said the wrong thing. |

Rules of thumb:

- A new column at the end of a download is MINOR. Renaming or removing one is MAJOR.
- A new URL parameter is MINOR. Old addresses must keep opening what they opened.
- A newly pinned PTM_Pipeline release is at least a MINOR bump, even when no code changed.
- Before 1.0.0, a MAJOR change still raises MINOR (0.6.0 to 0.7.0) and the changelog says what broke. The paper's draft
  makes it 1.0.0.

## The data pin

`data_pin.json` names the PTM_Pipeline tag and commit the explorers read. Moving it means a new release, so it is at
least a MINOR bump of the app. `python3 tools/check_data_pin.py --require-tag` checks that the workflows and manifests
name the pinned commit and that the tag exists and points at it. CI runs it. Run it before tagging.

## Release checklist

The owner makes releases. Agents work on branches and never tag.

1. Merge `develop` into `main` (a pull request, reviewed).
2. On `main`, set the new version in `pyproject.toml`, `ptmcontext/__init__.py`, `CITATION.cff` and every
   `sites/*.citation.cff`, with `date-released:` set to the release date.
3. In `CHANGELOG.md`, rename `## Unreleased` to `## X.Y.Z (YYYY-MM-DD)`, put a summary of three to five `> ` lines
   under the heading (Help shows them under "What changed in the site"), and add a new empty `## Unreleased`.
4. Run the checks: `pytest -q` and `python3 tools/check_data_pin.py --require-tag`.
5. Commit, then tag: `git tag -a vX.Y.Z -m "PTMcontext X.Y.Z"` and `git push origin vX.Y.Z`.
6. Create a GitHub release from the tag (Releases, Draft a new release, choose the tag, Publish). Zenodo archives
   when a release is published and gives the software its own DOI.
7. Add the software DOI to the README and `CITATION.cff` (`doi:`) in the next commit on `develop`.

Old versions are kept as tagged source plus the Zenodo DOI. Built copies are not archived. To see an old version, check
out its tag and build it.

## Zenodo

Zenodo's GitHub integration archives a repository's GitHub releases. Its documentation describes releases and does not
say that a plain tag is archived, so create the release (step 6). Setup, once: in Zenodo, link the GitHub account, open
GitHub in the profile menu, click Sync now and switch the repository on
([Zenodo: enable a repository](https://help.zenodo.org/docs/github/enable-repository/)).
`.zenodo.json` gives Zenodo the title, authors, license and the related identifier (the PTM_Pipeline concept DOI
10.5281/zenodo.22696798). Keep it in step with `CITATION.cff`.

## Deploys

Today, a push to `develop` or `main` deploys the live site (the explorers are still being tested). A tag only marks a
release.

From 1.0.0 the live site deploys only from a tag on `main`, and `develop` goes to an unlisted preview address. The
workflow `.github/workflows/pages.yml` is ready for the first half. To switch:

1. Set the repository variable `PAGES_MODE` to `tags` (Settings, Secrets and variables, Actions, Variables).
2. Allow the tags `v*` in the `github-pages` environment (Settings, Environments, github-pages, Deployment branches and
   tags).

After that, pushes to `develop` and `main` still build every explorer, so a broken build shows, but they do not deploy.
A tag `vX.Y.Z` builds and deploys. Delete the variable (or set it to `develop`) to go back to today's behavior.

The unlisted preview is not built yet. GitHub Pages serves one site per repository, so a preview needs a second place,
for example Pages of a separate preview repository that the `deploy` job pushes `_site` to.
