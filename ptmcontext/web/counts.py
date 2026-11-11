"""The count questions of a site's website (website.counts): questions answered by counting its marks, not by a test.

    values     how many marks each value of a list or category attribute has; for a list, how many have that value
               alone, and how many values each mark has (1, 2, ..., bins or more), from a number attribute or the
               list's length (the studies that report each site, say)
    responses  a table of experiments: each counts the marks it measured, those whose call went down and up, and the
               median of a change column over them; a row's calls come from a paired list attribute (each value
               '<experiment>:<call>') or from a per-mark table (marks.tables, kept by ptmc run as marks_<name>.tsv)

ptmc web writes the whole dataset's counts into the page (counts_data's first part), so a tile draws at once, and each
responses row's marks into data/selection.json (its second part: [mark index, 1 down + 2 up, change]), so the browser
counts a selection again (kit-counts.js). Nothing here is a test, and no number changes a statistic.
"""

from __future__ import annotations

import statistics
from pathlib import Path

import pandas as pd

from ..site import count_row_id


def _median(values: list[float]):
    return statistics.median(values) if values else None


def _num(v: str):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if x != x else x  # NaN is no value


def values_count(c: dict, marks: pd.DataFrame, attrs: dict) -> dict:
    """A values count over the whole dataset: each value's marks and marks with it alone; the distribution of the
    number of values per mark (1 .. bins, the last 'bins or more'), and how many have none or two or more."""
    name, spec = c['attribute'], attrs[c['attribute']]
    col = marks.get(f'a.{name}', pd.Series([''] * len(marks)))
    is_list = spec.get('kind') == 'list'
    sep = spec.get('separator', '; ')
    lists = [[v for v in (x.split(sep) if is_list else [x]) if v] if x else [] for x in col]
    n_of = (
        [int(v) if (v := _num(x)) is not None else 0 for x in marks[f'a.{c["number"]}']]
        if c.get('number') and f'a.{c["number"]}' in marks.columns
        else [len(x) for x in lists]
    )
    count, only = {}, {}
    for vs in lists:
        for v in dict.fromkeys(vs):
            count[v] = count.get(v, 0) + 1
        if len(set(vs)) == 1:
            only[vs[0]] = only.get(vs[0], 0) + 1
    links = {}
    if f'a.{name}.link' in marks.columns:
        for vals, ids in zip(col, marks[f'a.{name}.link']):
            for v, i in zip(vals.split(sep) if vals else [], ids.split(sep) if ids else []):
                if v and i:
                    links.setdefault(v, i)
    labels = spec.get('values') or {}
    rows = sorted(count, key=lambda v: (-count[v], labels.get(v, v)))
    bins = c.get('bins', 5)
    dist = [0] * bins
    for n in n_of:
        if n >= 1:
            dist[min(n, bins) - 1] += 1
    return {
        'kind': 'values',
        'attribute': name,
        'list': is_list,
        'number': c.get('number', ''),
        'top': c.get('top', 5),
        'bins': bins,
        'unit': c.get('unit', ['value', 'values']),
        'noun': c.get('noun', spec.get('label', name).lower()),
        'distribution': c.get('distribution', ''),
        'total': int(len(marks)),
        'two_or_more': c.get('two_or_more', f'with two or more {c.get("unit", ["value", "values"])[1]}'),
        'values': [
            [v, labels.get(v, v), count[v], only.get(v, 0) if is_list else None, links.get(v, '')] for v in rows
        ],
        'dist': dist,
        'none': int(sum(1 for n in n_of if n < 1)),
        'multi': int(sum(1 for n in n_of if n >= 2)),
    }


def responses_count(c: dict, marks: pd.DataFrame, attrs: dict, folder: Path) -> tuple[dict, list]:
    """A responses count: per row (an experiment), the marks it measured, those down and up, and the median change;
    and each row's marks as [mark index, 1 if down + 2 if up, change], for counting a selection again."""
    index = {(a, int(p)): i for i, (a, p) in enumerate(zip(marks['accession'], marks['position']))}
    down, up = c['calls']['down'], c['calls']['up']
    cache: dict[str, pd.DataFrame] = {}

    def table(name: str) -> pd.DataFrame:
        if name not in cache:
            path = folder / f'marks_{name}.tsv'
            if not path.exists():
                raise FileNotFoundError(f'{path}: run the site again (ptmc run) to keep its table {name!r}')
            cache[name] = pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False)
        return cache[name]

    rows, entries = [], []
    for r in c['rows']:
        calls: dict[int, list[str]] = {}
        changes: dict[int, list[float]] = {}
        if r.get('attribute'):  # '<value>:<call>' pairs of a list attribute
            sep = attrs[r['attribute']].get('separator', '; ')
            pre = r['value'] + ':'
            for i, x in enumerate(marks[f'a.{r["attribute"]}']):
                for pair in x.split(sep) if x else []:
                    if pair.startswith(pre):
                        calls.setdefault(i, []).append(pair[len(pre) :])
        if r.get('table'):
            t = table(r['table'])
            keep = pd.Series(True, index=t.index)
            for col, val in (r.get('where') or {}).items():
                keep &= t[col] == val
            for rec in t[keep].to_dict('records'):
                i = index.get((rec['accession'], int(rec['position'])))
                if i is None:
                    continue
                if not r.get('attribute'):
                    calls.setdefault(i, []).append(rec[r.get('call', 'call')])
                if r.get('change') and (v := _num(rec[r['change']])) is not None:
                    changes.setdefault(i, []).append(v)
        flags = {i: (1 if down in cs else 0) + (2 if up in cs else 0) for i, cs in calls.items()}
        per = {i: _median(changes.get(i, [])) for i in calls}
        med = _median([v for v in per.values() if v is not None])
        rid = count_row_id(r)
        filt = [f't:{r["attribute"]}', f'{r["value"]}:{down}'] if r.get('attribute') else [None, rid]
        rows.append(
            {
                'id': rid,
                'name': r['name'],
                'note': r.get('note', ''),
                'short': r.get('short') or ' '.join(x for x in (r['name'], r.get('group', '')) if x),
                'group': r.get('group', ''),
                'kind': r.get('kind', ''),
                'listed': bool(r.get('listed')),
                'filter': filt,
                'n': len(calls),
                'down': sum(1 for f in flags.values() if f & 1),
                'up': sum(1 for f in flags.values() if f & 2),
                'median': None if med is None else round(med, 6),
                'changes': bool(r.get('change')),
            }
        )
        entries.append([[i, flags[i], None if per[i] is None else round(per[i], 6)] for i in sorted(calls)])
    return {
        'kind': 'responses',
        'calls': {'down': down, 'up': up},
        'group': c.get('group', 'Group'),
        'first': c.get('first', 'Experiment'),
        'rows': rows,
    }, entries


def tested_rows(site: dict, folder: Path, aid: str) -> dict | None:
    """The test that goes with a count card (counts.<id>.tested_by: a protein-set question of the site): its title and, for
    each set it tested, the marked proteins in the set against all, the background's share, the fold enrichment and q. None
    when the run has no such rows (the card then says nothing of a test)."""
    f = folder / 'statistics.tsv'
    if not f.exists():
        return None
    st = pd.read_csv(f, sep='\t', dtype=str, keep_default_na=False)
    st = st[(st['analysis'] == aid) & (st['method'] == 'enricher')]
    if not len(st):
        return None
    spec = next((a for a in site['analyses'] if a['id'] == aid), {})
    names = {}
    if (folder / 'set_names.tsv').exists():
        sn = pd.read_csv(folder / 'set_names.tsv', sep='\t', dtype=str, keep_default_na=False)
        names = {r['set']: r['name'] for r in sn.to_dict('records') if r.get('analysis') == aid and r.get('name')}

    def num(v):
        try:
            return float(v)
        except ValueError:
            return None

    rows = []
    for r in st.to_dict('records'):
        k, b, m, d = (int(r[x]) for x in ('a', 'b', 'c', 'd'))
        rows.append(
            {
                'category': r['category'],
                'label': names.get(r['category'], r['category']),
                'k': k,  # marked proteins with a partner in the class
                'n': k + b,  # marked proteins tested
                'M': k + m,  # proteins in the background with one
                'N': k + b + m + d,  # the background
                'fold': num(r['fold_enrichment']),
                'q': num(r['q']),
            }
        )
    return {
        'id': aid,
        'title': spec.get('title', aid),
        'background': spec.get('background', ''),
        'rows': sorted(rows, key=lambda x: (x['q'] is None, x['q'] or 0, x['label'])),
    }


def counts_data(site: dict, folder: Path) -> tuple[dict, dict]:
    """(the page's count questions, with the whole dataset's counts; each responses question's marks per row, for
    data/selection.json). Empty when the site has none."""
    counts = (site.get('website') or {}).get('counts') or {}
    if not counts or not (folder / 'marks.tsv').exists():
        return {}, {}
    marks = pd.read_csv(folder / 'marks.tsv', sep='\t', dtype=str, keep_default_na=False)
    from .search import derived_attribute

    attrs = {**(site['marks'].get('attributes') or {}), **derived_attribute(site)}
    page, sel = {}, {}
    for cid, c in counts.items():
        words = {k: c[k] for k in ('title', 'question', 'sub', 'head', 'note', 'method') if c.get(k)}
        if c['kind'] == 'values':
            page[cid] = {**words, **values_count(c, marks, attrs)}
            if c.get('tested_by'):
                page[cid]['tested'] = tested_rows(site, folder, c['tested_by'])
        else:
            body, rows = responses_count(c, marks, attrs, folder)
            tables = site['marks'].get('tables') or {}
            body['tables'] = [
                [t, tables[t]['input']] for t in sorted({r['table'] for r in c['rows'] if r.get('table')})
            ]
            body['attributes'] = sorted({r['attribute'] for r in c['rows'] if r.get('attribute')})
            page[cid] = {**words, **body}
            sel[cid] = rows
    return page, sel
