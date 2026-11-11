"""The file of a protein in a directory of the website's data that holds fewer, larger shards than data/p (data/e, data/u,
data/map): the sum of the accession's character codes, modulo the number of files there."""

from __future__ import annotations

from pathlib import Path

from ptmcontext import web


def shard_path(folder: Path, acc: str) -> Path:
    return folder / f'{web.shard_of(acc, len(list(folder.glob("[0-9]*.json")))):02d}.json'
