"""Layers: annotations placed on the snapshot's residues, which tests count marks against.

A layer is a function from residues (a frame with accession and position) to columns on the same rows:

  shape 'class'  one column, `category`: each residue's class (disordered, disorder_boundary, ...);
  shape 'flags'  one boolean column per flag (the motif families).

A layer may also say what it draws on the protein pages (Layer.tracks): the regions it placed residues against, each
kind of region one row of the map, styled 'domains' (boxes on the backbone), 'disorder' (the backbone's wave) or
'segments' (a row of boxes, coloured by their class when they have one), and the numbers each region carries
(Track.values), which the run writes with the marks inside each region. The website draws whatever tracks the run's
layers declare; it knows no layer by name.

Some layers are made from a site file's parameters (factories: an analysis `{layer: regions, with: {...}}`), so a new
table of regions or of per-residue values becomes a new question without code.

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


@dataclass(frozen=True)
class Several:
    """A role filled by several inputs, combined by a rule (units.combine: first_of or all_of)."""

    rule: str
    paths: tuple[Path, ...]


@dataclass
class Context:
    """What a layer may read: the snapshot, the mark profile, the inputs by the role they fill (a file, or Several), and
    the plugins trusted for this run."""

    snapshot: Snapshot
    profile: Profile | None = None
    inputs: dict[str, Path | Several] = field(default_factory=dict)
    trusted_plugins: tuple[str, ...] = ()
    formats: dict[str, dict] = field(default_factory=dict)     # an input's path -> its manifest column mapping
    _cache: dict = field(default_factory=dict, repr=False)

    def path(self, name: str) -> Path:
        if name not in self.inputs:
            raise KeyError(f'input {name!r} is not given (inputs: {sorted(self.inputs)})')
        if isinstance(self.inputs[name], Several):
            raise TypeError(f'role {name!r} is filled by several inputs: read it with Context.units')
        return Path(self.inputs[name])

    def units(self, role: str, kind: str):
        """The units of a kind that fill a role, from its one input or its several combined; read once per run. Each
        file is read by its manifest entry's column mapping, if it has one (Context.formats), else by a reader that
        knows it (units.READERS)."""
        from .. import units as U

        def make():
            if role not in self.inputs:
                raise KeyError(f'input {role!r} is not given (inputs: {sorted(self.inputs)})')
            given = self.inputs[role]
            if isinstance(given, Several):
                return U.combine([U.load(p, kind, self.formats.get(str(p))) for p in given.paths], given.rule)
            return U.load(given, kind, self.formats.get(str(given)))
        return self.cached(f'units:{role}:{kind}', make)          # two roles may hold units of one kind

    def values(self, role: str):
        """A per-residue table (accession, position, value) that fills a role, by its manifest column mapping."""
        from .. import units as U
        path = self.path(role)
        cols = self.formats.get(str(path))
        if not cols:
            raise ValueError(f'role {role!r}: a per-residue table needs a column mapping (columns: {{accession, position, value}}) in its manifest entry')
        return self.cached(f'values:{role}', lambda: U.residue_values(path, cols))

    def listed(self, role: str):
        """The residues a table lists (accession, position) that fills a role, by its manifest column mapping."""
        from .. import units as U
        path = self.path(role)
        cols = self.formats.get(str(path))
        if not cols or not cols.get('accession') or not cols.get('position'):
            raise ValueError(f'role {role!r}: a list of residues needs a column mapping (columns: {{accession, position}}) in its manifest entry')
        return self.cached(f'listed:{role}', lambda: U.listed_residues(path, cols))

    def cached(self, key: str, make: Callable):
        if key not in self._cache:
            self._cache[key] = make()
        return self._cache[key]

    def input_record(self) -> dict:
        def one(p):
            return {'path': str(p), 'md5': md5_file(p)}
        return {name: ({'rule': p.rule, 'inputs': [one(x) for x in p.paths]} if isinstance(p, Several) else one(p))
                for name, p in sorted(self.inputs.items())}


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
    section: str = ''                        # the Overview section it is listed under
    tracks: tuple = ()                       # what it draws on the protein pages (Track), if anything

    def __call__(self, residues: pd.DataFrame, ctx: Context) -> pd.DataFrame:
        missing = [n for n in self.needs if n not in ctx.inputs]
        if missing:
            raise KeyError(f'layer {self.name} needs inputs {missing}')
        out = self.compute(residues, ctx)
        if self.shape == 'class' and 'category' not in out.columns:
            raise ValueError(f'layer {self.name}: a class layer must return a category column')
        return out


@dataclass(frozen=True)
class Track:
    """One kind of region a layer draws on the protein pages. units(ctx, accessions) gives them as a unit table (with
    label, and class when the boxes are coloured by the layer's classes); roles are the inputs they come from (for the
    hovers' provenance and the source's own record links); a track with classes takes the labels of the analysis that
    drew it. Two layers drawing the same kind share one row: the one whose units carry a class is kept.

    values are numbers each unit carries in a column of its own, ((column, label, help), ...): the run writes them in a
    table of their own, one row per unit with the marks and other candidate residues inside it (units_<kind>.tsv)."""

    kind: str
    title: str
    style: str                               # 'domains', 'disorder' or 'segments'
    units: Callable[['Context', set], pd.DataFrame]
    roles: tuple[str, ...] = ()
    help: str = ''
    colours: tuple = ()                      # ((class, colour), ...): the site's own colours for its classes
    values: tuple = ()                       # ((column, label, help), ...): numbers each unit carries


BUILT_IN: dict[str, Layer] = {}
FACTORIES: dict[str, Callable[[dict, str], Layer]] = {}


def register(name: str, shape: str, describe: str, needs: tuple[str, ...] = (), title: str = '',
             labels: dict | None = None, help: dict | None = None, question: str = '', sub: str = '', section: str = 'Structural context',
             tracks: tuple = ()):
    """Decorator for the package's own layers."""
    def wrap(fn):
        BUILT_IN[name] = Layer(name, shape, describe, fn, tuple(needs), title=title or name.replace('_', ' ').capitalize(),
                               labels=dict(labels or {}), help=dict(help or {}), question=question, sub=sub, section=section,
                               tracks=tuple(tracks))
        return fn
    return wrap


def factory(name: str):
    """Decorator for a layer made from a site file's parameters: fn(params, analysis_id) -> Layer."""
    def wrap(fn):
        FACTORIES[name] = fn
        return fn
    return wrap


def plugins() -> dict[str, metadata.EntryPoint]:
    """Layers that installed packages offer, by name; listed, not loaded."""
    return {ep.name: ep for ep in metadata.entry_points(group=ENTRY_POINT_GROUP)}


def get(name: str, ctx: Context | None = None, params: dict | None = None, analysis: str = '') -> Layer:
    """A built-in layer, a layer made from parameters (a factory, with the analysis's `with:`), or a plugin layer whose
    distribution the context trusts."""
    if name in FACTORIES:
        return FACTORIES[name](dict(params or {}), analysis or name)
    if params:
        raise ValueError(f'layer {name!r} takes no parameters (with:); layers made from parameters: {sorted(FACTORIES)}')
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
    from dataclasses import replace
    return replace(layer, origin=f'{dist} {version}'.strip())


def available() -> list[dict]:
    rows = [{'name': n, 'shape': lay.shape, 'origin': lay.origin, 'describe': lay.describe} for n, lay in sorted(BUILT_IN.items())]
    rows += [{'name': n, 'shape': 'class', 'origin': 'ptmcontext (made from with:)', 'describe': (fn.__doc__ or '').strip().split('\n')[0]}
             for n, fn in sorted(FACTORIES.items())]
    for n, ep in sorted(plugins().items()):
        rows.append({'name': n, 'shape': '?', 'origin': f'plugin: {ep.dist.name if ep.dist else "?"} (not loaded)',
                     'describe': ep.value})
    return rows


from . import charge, configured, context, domains, motifs  # noqa: E402,F401  (registers the built-in layers)
