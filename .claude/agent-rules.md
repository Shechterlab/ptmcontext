# Shared rules for this repository's subagents

Read AGENTS.md first; its rules hold. Also:

- **Spend few tokens.** Grep before you read, and read line ranges, not whole files. The original explorer
  (`PTM_Pipeline/docs/assets/explorer.js`, about 18k lines) is grep-only. Prefer a script that measures over a
  screenshot that you look at, and take a screenshot only to confirm a fix. Don't rerun the full pipeline unless
  your change can alter its output; `pytest -q -k <area>` comes before the full suite.
- **Scope.** Do only the task you were given. List other problems you find in your report; don't fix them.
- **Commit as you go**, on your own branch in your own worktree. Never push or merge unless told to.
- **Data that stays out:** unpublished lab data (functional-class labels), the Barutcu nuclear-body calls (licence
  pending), pCLAP/RBDmap peptide sequences or extents, and CPLM tables. Never write "dtIDR", "domain-tethered" or
  "domain flanks". Don't call code from the other lab repositories.
- **Modular.** New data formats go in CONTRACTS.md and are mapped in the site file (the schema, plus
  `site.website_problems`). No site-specific literal goes in `ptmcontext/`. Add a toy-site test.
- **Commit messages:** a subject line, a blank line, then an optional body. No trailers, no co-author lines, no session
  links and no model or assistant names anywhere. Commit with the repository's configured identity; don't set an author.
- **Report in at most 250 words:** what changed (files, commit), the checks you ran and their result, and what is
  left. No recap of the task.
