"""Layers: annotations placed on the snapshot's residues, which tests count marks against.

A layer is a function from residues (a frame with accession and position) to columns on the same rows:

  shape 'class'  one column, `category`: each residue's class (disordered, disorder_boundary, ...);
  shape 'flags'  one boolean column per flag (the motif families).

Built-in layers are registered here when the package loads. A layer written in another repository is a plugin: an
installed package that declares it under the entry-point group `ptmcontext.layers`. Plugins are never loaded because
they are installed. A run loads only the plugins it names as trusted (Context.trusted_plugins, or `ptmc --trust NAME`),
and records each plugin's distribution and version in its provenance.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from importlib import metadata
from pathlib import Path
from typing import Callable

import pandas as pd

from ..profile import Profile
from ..snapshot import Snapshot, md5_file

ENTRY_POINT_GROUP = 'ptmcontext.layers'


@dataclass
class Context:
    """What a layer may read: the snapshot, the mark profile, named input files, and the plugins trusted for this run."""

    snapshot: Snapshot
    profile: Profile | None = None
    inputs: dict[str, Path] = field(default_factory=dict)
    trusted_plugins: tuple[str, ...] = ()
    _cache: dict = field(default_factory=dict, repr=False)

    def path(self, name: str) -> Path:
        if name not in self.inputs:
            raise KeyError(f'input {name!r} is not given (inputs: {sorted(self.inputs)})')
        return Path(self.inputs[name])

    def cached(self, key: str, make: Callable):
        if key not in self._cache:
            self._cache[key] = make()
        return self._cache[key]

    def input_record(self) -> dict:
        return {name: {'path': str(p), 'md5': md5_file(p)} for name, p in sorted(self.inputs.items())}


@dataclass(frozen=True)
class Layer:
    name: str
    shape: str                 # 'class' or 'flags'
    describe: str
    compute: Callable[[pd.DataFrame, Context], pd.DataFrame]
    needs: tuple[str, ...] = ()
    origin: str = 'ptmcontext'
    title: str = ''                          # a short heading for pages and figures
    labels: dict = field(default_factory=dict)   # category code -> a short label
    help: dict = field(default_factory=dict)     # category code -> its definition, shown on hover
    question: str = ''                       # the question a page asks of it; {marks}, {residues} come from the profile
    sub: str = ''                            # the line under its figure's title

    def __call__(self, residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
        missing = [n for n in self.needs if n not in ctx.inputs]
        if missing:
            raise KeyError(f'layer {self.name} needs inputs {missing}')
        out = self.compute(residues, ctx)
        if self.shape == 'class' and 'category' not in out.columns:
            raise ValueError(f'layer {self.name}: a class layer must return a category column')
        return out


BUILT_IN: dict[str, Layer] = {}


def register(name: str, shape: str, describe: str, needs: tuple[str, ...] = (), title: str = '',
             labels: dict | None = None, help: dict | None = None, question: str = '', sub: str = ''):
    """Decorator for the package's own layers."""
    def wrap(fn):
        BUILT_IN[name] = Layer(name, shape, describe, fn, tuple(needs), title=title or name.replace('_', ' ').capitalize(),
                               labels=dict(labels or {}), help=dict(help or {}), question=question, sub=sub)
        return fn
    return wrap


def plugins() -> dict[str, metadata.EntryPoint]:
    """Layers that installed packages offer, by name; listed, not loaded."""
    return {ep.name: ep for ep in metadata.entry_points(group=ENTRY_POINT_GROUP)}


def get(name: str, ctx: Context | None = None) -> Layer:
    """A built-in layer, or a plugin layer whose distribution the context trusts."""
    if name in BUILT_IN:
        return BUILT_IN[name]
    eps = plugins()
    if name not in eps:
        raise KeyError(f'no layer {name!r} (built in: {sorted(BUILT_IN)}; offered by installed packages: {sorted(eps)})')
    ep = eps[name]
    dist = ep.dist.name if ep.dist else ''
    trusted = ctx.trusted_plugins if ctx else ()
    if dist not in trusted and name not in trusted:
        raise PermissionError(f'layer {name!r} comes from the package {dist!r}, which this run does not trust; '
                              f'trust it explicitly (Context.trusted_plugins or ptmc --trust {dist})')
    layer = ep.load()
    if not isinstance(layer, Layer):
        raise TypeError(f'entry point {name!r} of {dist!r} is not a ptmcontext Layer')
    version = ep.dist.version if ep.dist else ''
    return Layer(layer.name, layer.shape, layer.describe, layer.compute, layer.needs, origin=f'{dist} {version}'.strip(),
                 title=layer.title, labels=layer.labels, help=layer.help, question=layer.question, sub=layer.sub)


def available() -> list[dict]:
    rows = [{'name': n, 'shape': lay.shape, 'origin': lay.origin, 'describe': lay.describe} for n, lay in sorted(BUILT_IN.items())]
    for n, ep in sorted(plugins().items()):
        rows.append({'name': n, 'shape': '?', 'origin': f'plugin: {ep.dist.name if ep.dist else "?"} (not loaded)',
                     'describe': ep.value})
    return rows


from . import context, domains, motifs  # noqa: E402,F401  (registers the built-in layers)
