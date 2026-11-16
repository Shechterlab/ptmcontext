"""The mark file (the "profile"): everything that is specific to one modification, as data (sites/marks/<mark>.yaml).

The rest of the code reads the residue, the states, the motifs and the words for text from here, so no module carries
a mark-specific literal. schemas/profile.schema.json is the contract.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

import pandas as pd

from .snapshot import Snapshot

REPO = Path(__file__).resolve().parents[1]


def _packaged(kind: str, name: str) -> Path:
    return Path(str(resources.files('ptmcontext') / kind / name))


def schema(name: str) -> dict:
    """A contract schema shipped with the package: profile, units, statistics or inputs."""
    return json.loads(_packaged('schemas', f'{name}.schema.json').read_text())


def validate(document: dict, name: str) -> None:
    """Raise jsonschema.ValidationError if document breaks the named contract."""
    import jsonschema

    jsonschema.validate(document, schema(name))


@dataclass
class Profile:
    data: dict

    @property
    def id(self) -> str:
        return self.data['id']

    @property
    def residues(self) -> list[str]:
        return list(self.data['residues'])

    @property
    def words(self) -> dict:
        return self.data['words']

    def word(self, key: str) -> str:
        return self.data['words'][key]

    @property
    def motif_flank(self) -> int:
        return int(self.data.get('motifs', {}).get('window_flank', 7))

    @property
    def motif_families(self) -> list[dict]:
        return list(self.data.get('motifs', {}).get('families', []))

    @property
    def stickers(self) -> dict | None:
        """The profile's sticker residues ({residues, noun, nouns}), or None when it names none."""
        s = self.data.get('stickers')
        return (
            None
            if not s
            else {
                'residues': list(s['residues']),
                'noun': s.get('noun', 'sticker residue'),
                'nouns': s.get('nouns', s.get('noun', 'sticker residue') + 's'),
                'heading': s.get('heading', 'Sticker patterning'),
            }
        )

    @property
    def within_protein(self) -> str:
        """How a within-protein background says that each protein is analyzed on its own (words.within_protein; default
        'each protein a stratum')."""
        return self.words.get('within_protein', 'each protein a stratum')

    def background(self, scope: str, letters: str | None = None) -> str:
        """The background wording of a statistics row, from the profile's words (e.g. 'other arginines of the
        methylated proteins'). letters: the residues a class is compared with, when it is not all of the mark's
        residues (a family's `among`), named from words.residue_names."""
        w = self.words
        residues = self.residue_list(letters) if letters else w['residues']
        if scope == 'marked_proteins':
            return f'other {residues} of the {w["marked"]} proteins'
        if scope == 'same_protein':
            return f'other {residues} of the same protein, {self.within_protein}'
        if scope == 'proteome':
            return f'other {residues} of the proteome'
        raise ValueError(f'unknown background scope {scope!r}')

    def residue_list(self, letters: str) -> str:
        """The plural names of some residues, in the order given: 'serines and threonines' for 'ST' (words.residue_names
        maps each letter to its singular name)."""
        names = self.data.get('residue_names') or {}
        missing = [x for x in letters if x not in names]
        if missing:
            raise ValueError(f'words.residue_names has no name for {missing} (the profile needs one for each residue)')
        parts = [names[x] + 's' for x in letters]
        return parts[0] if len(parts) == 1 else ', '.join(parts[:-1]) + ' and ' + parts[-1]

    def motif_flags(self, windows: pd.Series) -> pd.DataFrame:
        """One boolean column per motif family (named by the family), from sequence windows centered on the residue."""
        families = self.motif_families
        return pd.DataFrame(
            [{f['name']: _matches(f, w) for f in families} for w in windows],
            index=windows.index,
            columns=[f['name'] for f in families],
        ).astype(bool)

    def motif_columns(self) -> list[str]:
        return [f['name'] for f in self.motif_families]


def _at(window: str, offset: int) -> str:
    center = len(window) // 2
    i = center + offset
    return window[i] if 0 <= i < len(window) else '_'


def _condition(cond: dict, window: str) -> bool:
    letters = set(cond['in'])
    if 'at' in cond:
        return _at(window, int(cond['at'])) in letters
    lo, hi = cond['within']
    return any(_at(window, i) in letters for i in range(int(lo), int(hi) + 1) if i != 0)


def _matches(family: dict, window: str) -> bool:
    """A family matches when every condition of 'all' holds and, if 'any' is given, at least one of its conditions.
    A condition is {'at': offset, 'in': letters} (the residue at that offset is one of the letters) or
    {'within': [lo, hi], 'in': letters} (some residue at an offset from lo to hi, the center excluded, is one of them).
    Offsets past the window or the protein read as '_'."""
    if not all(_condition(c, window) for c in family.get('all', [])):
        return False
    anys = family.get('any', [])
    return any(_condition(c, window) for c in anys) if anys else True


def read_config(path: str | Path) -> dict:
    """A YAML or JSON file as data (YAML read safely: no code, no custom tags)."""
    path = Path(path)
    text = path.read_text()
    if path.suffix in ('.yaml', '.yml'):
        import yaml

        return yaml.safe_load(text)
    return json.loads(text)


def load_profile(path: str | Path) -> Profile:
    """A mark file (YAML or JSON) by its path, validated against the contract. A bare id no longer resolves: the
    package carries no mark content, so each site file names its mark file by path (`mark:`)."""
    p = Path(path)
    if not p.suffix or not p.is_file():
        raise ValueError(
            f'{str(path)!r} is not a mark file: a mark is given by the path of its file (for example '
            f'sites/marks/<mark>.yaml, relative to the repository that holds the site file), not by a packaged id'
        )
    data = read_config(p)
    validate(data, 'profile')
    return Profile(data)


def site_profile(site: dict) -> Profile:
    """The mark file the site's `mark` names (a path relative to the repository that holds the site file)."""
    return load_profile(Path(site.get('__root__', REPO)) / site['mark'])


def check_residues(profile: Profile, snapshot: Snapshot, marked: pd.DataFrame) -> pd.DataFrame:
    """The marked rows whose residue on the snapshot is not one of the profile's residues (empty when all are)."""
    res = [snapshot.residue_at(a, int(p)) for a, p in zip(marked['accession'], marked['position'])]
    bad = marked[[r not in profile.residues for r in res]].copy()
    bad['reference_residue'] = [r for r in res if r not in profile.residues]
    return bad
