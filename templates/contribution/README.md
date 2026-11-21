# Contributing sites

Send two files for each source. The rules behind them are in [docs/DATA_STANDARD.md](../../docs/DATA_STANDARD.md).

1. `metadata_template.tsv`: one row per field, with the value in the second column. Fill every row; write `none`
   where a field does not apply. Keep the field names. The example values are placeholders to replace.
2. `sites_template.tsv`: the `ptm-sites/1` file. Edit the `# key: value` header block, then list one site per row
   under the column header. The two example rows are placeholders to delete. `window` is 15 to 51 residues centered
   on the site; `localization_probability` runs from 0 to 1.

Only published data are accepted, under terms compatible with CC BY-NC-SA 4.0. Send both files with the paper's own
supplement table if that is simpler for you. A report of any rejected rows is sent back. The contact address is never
published.
