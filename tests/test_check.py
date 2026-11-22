"""ptmc check: a built-in layer with parameters is not reported as taking none, and the columns marks.attributes names are
looked up in the marks table's header when the table is under --root."""

import yaml
from test_new_sources import _toy_site

from ptmcontext import cli
from ptmcontext import layers as L


def _edit(root, fn):
    path = root / 'sites' / 'toy.yaml'
    site = yaml.safe_load(path.read_text())
    fn(site)
    path.write_text(yaml.safe_dump(site, sort_keys=False))
    return path


def test_check_accepts_the_with_of_a_built_in_layer_with_parameters(tmp_path, capsys):
    root = _toy_site(tmp_path)
    path = _edit(
        root, lambda s: s['analyses'].append({'id': 'dc', 'layer': 'domain_class', 'with': {'classes': 'x.yaml'}})
    )
    cli.main(['check', str(path)])
    assert 'takes no with' not in capsys.readouterr().out


def test_check_still_reports_a_parameter_the_layer_does_not_have(tmp_path, capsys):
    root = _toy_site(tmp_path)
    path = _edit(root, lambda s: s['analyses'].append({'id': 'dc', 'layer': 'domain_class', 'with': {'nope': 1}}))
    assert cli.main(['check', str(path)]) == 1
    assert "dc: layer 'domain_class' takes no parameter ['nope']" in capsys.readouterr().out


def test_check_reports_a_with_on_a_layer_without_parameters(tmp_path, capsys):
    root = _toy_site(tmp_path)
    plain = next(n for n, lay in sorted(L.BUILT_IN.items()) if not lay.params)
    path = _edit(root, lambda s: s['analyses'].append({'id': 'dis', 'layer': plain, 'with': {'x': 1}}))
    assert cli.main(['check', str(path)]) == 1
    assert f"layer '{plain}' takes no with:" in capsys.readouterr().out


def _attribute(site, column):
    site['marks']['attributes'] = {'note': {'column': column, 'label': 'Note', 'kind': 'category'}}


def test_check_reports_a_marks_attribute_column_the_table_lacks(tmp_path, capsys):
    root = _toy_site(tmp_path)
    path = _edit(root, lambda s: _attribute(s, 'no_such_column'))
    assert cli.main(['check', str(path), '--root', str(root / 'data')]) == 1
    assert "marks.attributes.note: the marks table has no column ['no_such_column']" in capsys.readouterr().out


def test_check_accepts_a_marks_attribute_column_the_table_has(tmp_path, capsys):
    root = _toy_site(tmp_path)
    path = _edit(root, lambda s: _attribute(s, 'pos'))
    assert cli.main(['check', str(path), '--root', str(root / 'data')]) == 0
    assert 'marks.attributes' not in capsys.readouterr().out


def test_check_skips_the_attribute_columns_without_the_table(tmp_path, capsys):
    root = _toy_site(tmp_path)
    path = _edit(root, lambda s: _attribute(s, 'no_such_column'))
    assert cli.main(['check', str(path), '--root', str(tmp_path / 'empty')]) == 0
    assert 'marks.attributes' not in capsys.readouterr().out
