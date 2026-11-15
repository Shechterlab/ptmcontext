"""The selection data of a built site (data/sel/, written in parts) as the tests read it: whole, as text, or its size."""

import json

from ptmcontext.web import seldata


def selection_of(folder) -> dict:
    return seldata.read(folder / 'data' / 'sel')


def selection_text(folder) -> str:
    return json.dumps(selection_of(folder), separators=(',', ':'))


def selection_size(folder) -> int:
    return sum(f.stat().st_size for f in (folder / 'data' / 'sel').iterdir())
