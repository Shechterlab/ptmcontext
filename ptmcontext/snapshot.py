"""The proteome snapshot: the one set of reference sequences every layer, unit and mark is placed on.

Positions are 1-based, as UniProt gives them. A snapshot is identified by its FASTA's MD5, which every output records,
so a result can always be traced to the sequences it was computed on.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import pandas as pd


def md5_file(path: str | Path) -> str:
    h = hashlib.md5()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def parse_fasta(path: str | Path) -> dict[str, str]:
    """Accession -> sequence of a UniProt FASTA (the accession between the first two '|'), as PTM_Pipeline
    scripts/common.parse_fasta reads it."""
    sequences: dict[str, list[str]] = {}
    current = ''
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith('>'):
            header = line[1:]
            parts = header.split('|')
            current = parts[1].strip() if len(parts) >= 2 else header.split()[0]
            sequences[current] = []
            continue
        if current:
            sequences[current].append(line)
    return {acc: ''.join(chunks) for acc, chunks in sequences.items()}


def parse_fasta_headers(path: str | Path) -> dict[str, dict]:
    """Accession -> entry name, protein name and gene of a UniProt FASTA header
    ('>sp|P04637|P53_HUMAN Cellular tumor antigen p53 OS=Homo sapiens OX=9606 GN=TP53 PE=1 SV=4')."""
    out = {}
    for line in Path(path).read_text().splitlines():
        if not line.startswith('>'):
            continue
        parts = line[1:].split('|')
        if len(parts) < 3:
            continue
        entry, _, rest = parts[2].partition(' ')
        name = rest.split(' OS=')[0].strip()
        gene = rest.split(' GN=')[1].split(' ')[0] if ' GN=' in rest else ''
        out[parts[1].strip()] = {'entry': entry, 'name': name, 'gene': gene}
    return out


def clean(seq: str) -> str:
    """Upper-case letters only (common.clean_aa_sequence)."""
    return ''.join(ch for ch in str(seq).upper() if 'A' <= ch <= 'Z')


def window(seq: str, position: int, flank: int, pad: str = '_') -> str:
    """The 2*flank+1 residues centered on a 1-based position, padded at the ends (common.sequence_window)."""
    seq = clean(seq)
    if not seq or position < 1:
        return ''
    left = max(0, position - flank - 1)
    right = min(len(seq), position + flank)
    missing_left = flank - (position - 1 - left)
    missing_right = flank - (right - position)
    return pad * missing_left + seq[left:right] + pad * missing_right


@dataclass
class Snapshot:
    """Reference sequences with their release and checksum."""

    sequences: dict[str, str]
    release: str = ''
    source: str = ''
    fasta_md5: str = ''
    meta: dict = field(default_factory=dict)

    @classmethod
    def from_fasta(cls, path: str | Path, release: str = '', source: str = '', expect_md5: str = '') -> 'Snapshot':
        path = Path(path)
        md5 = md5_file(path)
        if expect_md5 and md5 != expect_md5:
            raise ValueError(f'{path}: MD5 {md5}, expected {expect_md5}')
        snap = cls(parse_fasta(path), release=release, source=source or path.name, fasta_md5=md5)
        snap.meta['headers'] = parse_fasta_headers(path)
        return snap

    @classmethod
    def from_uniprot_release(cls, folder: str | Path) -> 'Snapshot':
        """A folder staged as PTM_Pipeline's inputs/reference/: uniprot_release.json names the FASTA and its MD5."""
        folder = Path(folder)
        meta = json.loads((folder / 'uniprot_release.json').read_text())
        snap = cls.from_fasta(
            folder / meta['fasta'],
            release=f'UniProt {meta["release"]}',
            source=meta.get('query', ''),
            expect_md5=meta.get('fasta_md5', ''),
        )
        snap.meta = meta
        return snap

    def __contains__(self, accession: str) -> bool:
        return accession in self.sequences

    def length(self, accession: str) -> int:
        return len(self.sequences[accession])

    def lengths(self) -> dict[str, int]:
        return {acc: len(seq) for acc, seq in self.sequences.items()}

    def residue_at(self, accession: str, position: int) -> str:
        seq = self.sequences.get(accession, '')
        return seq[position - 1] if 1 <= position <= len(seq) else ''

    def residues(self, letters: Iterable[str], accessions: Iterable[str] | None = None) -> pd.DataFrame:
        """Every residue of the given letters (the candidates of a mark): accession, position, residue, in sequence
        order of the FASTA (common.residue_background_from_sequences)."""
        letters = {str(x).upper() for x in letters}
        selected = None if accessions is None else set(accessions)
        acc_out, pos_out, res_out = [], [], []
        for acc, seq in self.sequences.items():
            if selected is not None and acc not in selected:
                continue
            for i, aa in enumerate(clean(seq), start=1):
                if aa in letters:
                    acc_out.append(acc)
                    pos_out.append(i)
                    res_out.append(aa)
        return pd.DataFrame({'accession': acc_out, 'position': pos_out, 'residue': res_out})

    def windows(self, frame: pd.DataFrame, flank: int) -> pd.Series:
        """The sequence window of each (accession, position) row of frame."""
        return pd.Series(
            [window(self.sequences.get(a, ''), int(p), flank) for a, p in zip(frame['accession'], frame['position'])],
            index=frame.index,
            dtype=object,
        )

    def describe(self, accession: str) -> dict:
        """Entry name, protein name and gene of an accession, from the FASTA header ('' where absent)."""
        return self.meta.get('headers', {}).get(accession, {'entry': '', 'name': '', 'gene': ''})

    def sequence_md5(self, accession: str) -> str:
        """The MD5 of a sequence as UniProt reports it (upper-case hex), for checking a live entry against it."""
        return hashlib.md5(clean(self.sequences.get(accession, '')).encode()).hexdigest().upper()

    def record(self) -> dict:
        """What an output records about the sequences it was computed on."""
        return {
            'release': self.release,
            'source': self.source,
            'fasta_md5': self.fasta_md5,
            'entries': len(self.sequences),
        }
