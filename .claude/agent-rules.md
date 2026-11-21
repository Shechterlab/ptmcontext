# Shared rules for this repository's subagents

Read AGENTS.md first; its rules hold. Also:

- **Spend few tokens.** Grep before you read, and read line ranges, not whole files. The original explorer
  (`PTM_Pipeline` `docs/assets/explorer.js` at tag v1.6.0, the data root's docs/ at f042367; about 18k lines) is grep-only. Prefer a script that measures over a
  screenshot that you look at, and take a screenshot only to confirm a fix. Don't rerun the full pipeline unless
  your change can alter its output; `pytest -q -k <area>` comes before the full suite.
- **Never `pip install`** (it repoints the shared `ptmc` command and packages for everyone). Run your copy's code as
  `PYTHONPATH=$PWD:$PWD/packages/ptmstats python3 -m ptmcontext.cli ...` and test with the same `PYTHONPATH`.
- **Scope.** Do only the task you were given. List other problems you find in your report; don't fix them.
- **Commit as you go**, in the worktree you are given. It may be detached (no branch); that's intended. Never create,
  push or delete branches, and never merge. The owner keeps a single branch, `develop`; your commits are merged by hash.
- **Data that stays out:** unpublished lab data (functional-class labels), the Barutcu nuclear-body calls (license
  pending), and pCLAP/RBDmap peptide sequences or extents. Never write "dtIDR", "domain-tethered" or "domain flanks".
  Don't call code from the other lab repositories.
- **CPLM 4.0:** it states no license and compiles other databases. On 2026-11-17 the owner decided to exclude it from
  all context marks (this replaces the 2026-11-09 decision to include it). Do not add CPLM data to any release, site or
  table, and do not describe it as a source.
- **Modular.** New data formats go in CONTRACTS.md and are mapped in the site file (the schema, plus
  `site.website_problems`). No site-specific literal goes in `ptmcontext/`. Add a toy-site test.
- **Commit messages:** a subject line, a blank line, then an optional body. No trailers, no co-author lines, no session
  links and no model or assistant names anywhere. Commit with the repository's configured identity; don't set an author.
- **Report in at most 250 words:** what changed (files, commit), the checks you ran and their result, and what is
  left. No recap of the task.
