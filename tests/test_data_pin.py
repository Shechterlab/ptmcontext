"""tools/check_data_pin.py: the data pin is one commit everywhere, and a tag, when set, resolves to it."""

import importlib.util
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('check_data_pin', ROOT / 'tools' / 'check_data_pin.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def _copy(tmp_path, tag):
    shutil.copytree(ROOT / '.github', tmp_path / '.github')
    shutil.copytree(ROOT / 'sites', tmp_path / 'sites', ignore=shutil.ignore_patterns('data', 'art', 'marks'))
    shutil.copy(ROOT / 'inputs.json', tmp_path / 'inputs.json')
    pin = json.loads((ROOT / 'data_pin.json').read_text())
    pin['tag'] = tag
    (tmp_path / 'data_pin.json').write_text(json.dumps(pin))
    return pin


def test_the_repository_pins_one_commit_everywhere():
    assert mod.problems(root=ROOT, offline=True) == []
    assert json.loads((ROOT / 'data_pin.json').read_text())['tag'] == 'v1.7.0'


def test_a_tag_must_resolve_to_the_pinned_commit(tmp_path):
    pin = _copy(tmp_path, 'v1.7.0')
    ok = f'{pin["commit"]}\trefs/tags/v1.7.0\n'
    assert mod.problems(root=tmp_path, ls_remote=lambda: ok) == []
    assert any('does not exist' in x for x in mod.problems(root=tmp_path, ls_remote=lambda: ''))
    assert any(
        'resolves to' in x for x in mod.problems(root=tmp_path, ls_remote=lambda: f'{"0" * 40}\trefs/tags/v1.7.0\n')
    )
    assert mod.problems(root=tmp_path, offline=True) == []


def test_a_workflow_at_another_commit_is_named(tmp_path):
    _copy(tmp_path, 'TODO(tag)')
    wf = tmp_path / '.github' / 'workflows' / 'pages.yml'
    wf.write_text(wf.read_text().replace('7fd0c2bd5f7618bebf99975dcf1012b3abcd293e', 'a' * 40))
    assert any('pages.yml' in x for x in mod.problems(root=tmp_path))
