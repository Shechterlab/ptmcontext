"""Staging: download a proteome's sources from upstream, write them in the formats the layers read, and record each
file (source URL, release or date, license, MD5) in a site's input manifest.

  ptmc stage uniprot UP000002311 --out DIR --manifest sites/yeast_phospho.inputs.json
  ptmc stage mobidb  --out DIR --manifest ...      (after uniprot: it reads the accessions from the FASTA)
  ptmc stage shephard s_cerevisiae --out DIR ...   (after uniprot: SHEPHARD's ECOD domains on identical sequences)

Staging is the only step that touches the network. A build reads only staged files and checks their MD5s, so a
release can be rebuilt offline, and a source that changes upstream changes nothing until it is staged again.
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .snapshot import md5_file, parse_fasta
from .units import DOMAIN_COLUMNS, make_units, write_units

UNIPROT = 'https://rest.uniprot.org/uniprotkb/stream'
MOBIDB = 'https://mobidb.org/api/download'
MOBIDB_FEATURE = 'prediction-disorder-th_50'
MOBIDB_BATCH = 200  # MobiDB serves at most 1,000 proteins per request; accessions go in the URL
FEATURE_FIELDS = 'accession,gene_primary,length,ft_mod_res,ft_domain,ft_repeat'
# ECO codes of UniProt evidence: experimental (manual), large-scale experiments, by similarity, others
ECO = {
    'ECO:0000269': 'experimental',
    'ECO:0007744': 'large_scale',
    'ECO:0000250': 'by_similarity',
    'ECO:0000255': 'sequence_analysis',
    'ECO:0000305': 'curator_inference',
}


def _get(url: str, retries: int = 6) -> tuple[bytes, dict]:
    """A download, tried up to six times with waits of 2, 4, 8, 16 and 32 s: an upstream server error (UniProt
    answers 500 when busy) does not fail a deploy unless it lasts over a minute."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ptmcontext-stage'})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read(), {k.lower(): v for k, v in r.headers.items()}
        except Exception:  # noqa: BLE001  (network: retry with backoff, then raise)
            if attempt == retries - 1:
                raise
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError('unreachable')


def _today() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def record(
    manifest: Path, name: str, root: Path, file: Path, source: str, version: str, licence: str, note: str = ''
) -> None:
    """Add or replace a manifest entry for a staged file."""
    data = json.loads(manifest.read_text()) if manifest.exists() else {'schema_version': 1, 'inputs': {}}
    entry = {
        'file': str(file.relative_to(root)),
        'md5': md5_file(file),
        'source': source,
        'version': version,
        'licence': licence,
        'role': 'input',
    }
    if note:
        entry['note'] = note
    data['inputs'][name] = entry
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def uniprot(proteome: str, out: Path, manifest: Path, prefix: str) -> dict:
    """Reviewed entries of a UniProt proteome: the FASTA, and the modified residues and domain and repeat features,
    each as the tables the layers and marks read."""
    out.mkdir(parents=True, exist_ok=True)
    query = f'(proteome:{proteome}) AND (reviewed:true)'
    q = urllib.parse.quote(query)
    fasta_bytes, headers = _get(f'{UNIPROT}?format=fasta&query={q}')
    release = headers.get('x-uniprot-release', '')
    fasta = out / f'{prefix}_uniprot_{release}.fasta'
    fasta.write_bytes(fasta_bytes)
    tsv_bytes, headers2 = _get(f'{UNIPROT}?format=tsv&fields={FEATURE_FIELDS}&query={q}')
    if headers2.get('x-uniprot-release', '') != release:
        raise RuntimeError('UniProt changed release between the two downloads: stage again')
    features = out / f'{prefix}_uniprot_{release}_features.tsv'
    features.write_bytes(tsv_bytes)
    version = f'UniProt {release} ({headers.get("x-uniprot-release-date", "")}), downloaded {_today()}'
    root = out.parent
    record(manifest, 'uniprot_fasta', root, fasta, f'{UNIPROT}?format=fasta&query={query}', version, 'CC BY 4.0')
    record(
        manifest,
        'uniprot_features',
        root,
        features,
        f'{UNIPROT}?format=tsv&fields={FEATURE_FIELDS}&query={query}',
        version,
        'CC BY 4.0',
    )
    table = pd.read_csv(features, sep='\t', dtype=str, keep_default_na=False)
    mods = uniprot_mod_res(table)
    mods_path = out / f'{prefix}_uniprot_{release}_mod_res.tsv'
    mods.to_csv(mods_path, sep='\t', index=False, lineterminator='\n')
    record(
        manifest,
        'uniprot_mod_res',
        root,
        mods_path,
        f'derived from uniprot_features ({md5_file(features)})',
        version,
        'CC BY 4.0',
    )
    domains = uniprot_domains(table, release)
    dom_path = out / f'{prefix}_uniprot_{release}_domains.tsv'
    write_units(domains, dom_path)
    record(
        manifest,
        'uniprot_domains',
        root,
        dom_path,
        f'derived from uniprot_features ({md5_file(features)})',
        version,
        'CC BY 4.0',
    )
    return {'release': release, 'entries': len(parse_fasta(fasta)), 'mod_res': len(mods), 'domains': len(domains)}


FEATURE = re.compile(r'(MOD_RES|DOMAIN|REPEAT) (<?\d+)(?:\.\.(>?\d+))?;(.*?)(?=(?:MOD_RES|DOMAIN|REPEAT) <?\d|$)')


def _features(cell: str):
    for kind, a, b, rest in FEATURE.findall(cell or ''):
        note = re.search(r'/note="([^"]*)"', rest)
        evid = re.search(r'/evidence="([^"]*)"', rest)
        yield kind, a, b or a, note.group(1) if note else '', evid.group(1) if evid else ''


def evidence_class(evidence: str) -> str:
    """The strongest kind of evidence a feature cites: experimental > large_scale > curator_inference >
    sequence_analysis > by_similarity > other."""
    found = {ECO.get(code.split('|')[0].strip(), 'other') for code in evidence.split(',') if code.strip()}
    for kind in ('experimental', 'large_scale', 'curator_inference', 'sequence_analysis', 'by_similarity'):
        if kind in found:
            return kind
    return 'other' if found else 'none'


def uniprot_mod_res(table: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for acc, gene, cell in zip(table['Entry'], table['Gene Names (primary)'], table['Modified residue']):
        for kind, a, _, note, evid in _features(cell):
            if kind == 'MOD_RES' and a.isdigit():
                rows.append(
                    {
                        'accession': acc,
                        'gene': gene,
                        'position': int(a),
                        'modification': note,
                        'evidence_class': evidence_class(evid),
                        'evidence': evid,
                    }
                )
    return pd.DataFrame(rows, columns=['accession', 'gene', 'position', 'modification', 'evidence_class', 'evidence'])


def uniprot_domains(table: pd.DataFrame, release: str) -> pd.DataFrame:
    """UniProt DOMAIN and REPEAT features as domain units (subtype domain or repeat; label: the feature's note). Fuzzy
    ends (<1, >300) are read as the position given."""
    rows = []
    for acc, dcell, rcell in zip(table['Entry'], table['Domain [FT]'], table['Repeat']):
        for kind, a, b, note, _ in [*_features(dcell), *_features(rcell)]:
            rows.append(
                {
                    'accession': acc,
                    'start': int(a.strip('<>')),
                    'end': int(b.strip('<>')),
                    'subtype': kind.lower(),
                    'ref': '',
                    'label': note,
                    'members': '',
                }
            )
    df = pd.DataFrame(rows, columns=['accession', 'start', 'end', *DOMAIN_COLUMNS])
    return make_units(df, 'domain', f'UniProt {release} DOMAIN and REPEAT features', keep=DOMAIN_COLUMNS)


def mobidb(fasta: Path, out: Path, manifest: Path, prefix: str, feature: str = MOBIDB_FEATURE) -> dict:
    """MobiDB disordered regions (feature, default the consensus prediction-disorder-th_50 the release uses) of every
    entry of a staged FASTA, in batches of accessions, as the staged MobiDB table."""
    accs = list(parse_fasta(fasta))
    rows, raw_lines, header = [], [], ''
    for i in range(0, len(accs), MOBIDB_BATCH):
        batch = accs[i : i + MOBIDB_BATCH]
        body, _ = _get(f'{MOBIDB}?acc={",".join(batch)}&format=tsv')
        lines = body.decode().splitlines()
        if not lines:
            continue
        header = lines[0]
        raw_lines += lines[1:]
        for line in lines[1:]:
            acc, feat, spans, *_ = line.split('\t')
            if feat != feature or acc not in batch:
                continue
            for k, span in enumerate(spans.split(','), start=1):
                a, b = span.split('..')
                rows.append(
                    {
                        'canonical_UniProtAC': acc,
                        'fragment_start': int(a),
                        'fragment_end': int(b),
                        'mobidb_annotation_key': feat,
                        'mobidb_region_index': k,
                    }
                )
    raw = out / f'{prefix}_mobidb_{_today()}_raw.tsv'
    raw.write_text(header + '\n' + '\n'.join(raw_lines) + '\n')
    table = pd.DataFrame(rows)
    path = out / f'{prefix}_mobidb_{_today()}_disorder_intervals.tsv'
    table.to_csv(path, sep='\t', index=False, lineterminator='\n')
    covered = table['canonical_UniProtAC'].nunique() if len(table) else 0
    root = out.parent
    record(
        manifest,
        'mobidb_disorder',
        root,
        path,
        f'{MOBIDB}?acc=<{len(accs)} accessions of uniprot_fasta>&format=tsv, feature {feature}',
        f'MobiDB API, downloaded {_today()}',
        'CC BY 4.0 (as listed for MobiDB)',
        note=f'{covered} of {len(accs)} entries have {feature} regions; the API does not report a release, so the download date is the version',
    )
    return {'entries': len(accs), 'with_regions': covered, 'regions': len(table)}


# SHEPHARD's precomputed ECOD domains, per proteome folder of shephard-data, pinned to a commit (config: a new
# proteome is a new entry there, not code)
_SHEPHARD = json.loads((Path(__file__).resolve().parent / 'config' / 'shephard_proteomes.json').read_text())
SHEPHARD_DATA, SHEPHARD_RAW, SHEPHARD_COMMIT = _SHEPHARD['repository'], _SHEPHARD['raw'], _SHEPHARD['commit']
SHEPHARD_ECOD = {k: (v['domains'], v['fasta']) for k, v in _SHEPHARD['proteomes'].items()}


def shephard(
    proteome: str, snapshot_fasta: Path, out: Path, manifest: Path, prefix: str, commit: str = SHEPHARD_COMMIT
) -> dict:
    """SHEPHARD's ECOD domains for a proteome, downloaded from shephard-data at a commit and kept on the entries whose
    sequence is identical to the snapshot's (shephard_domains). The two downloaded files are kept beside the staged
    table, and their MD5s go in the manifest's note."""
    if proteome not in SHEPHARD_ECOD:
        raise ValueError(f'no SHEPHARD ECOD file known for {proteome!r}: known are {sorted(SHEPHARD_ECOD)}')
    raw = out / 'shephard_raw'
    raw.mkdir(parents=True, exist_ok=True)
    files = []
    for rel in SHEPHARD_ECOD[proteome]:
        body, _ = _get(f'{SHEPHARD_RAW}/{commit}/{rel}')
        path = raw / f'{commit[:7]}_{Path(rel).name}'
        path.write_bytes(body)
        files.append(path)
    return shephard_domains(
        files[0],
        files[1],
        snapshot_fasta,
        out,
        manifest,
        f'{prefix}_shephard_ecod_domains',
        commit,
        'ECOD domains (DomainMapper)',
        upstream=files,
        source=f'{SHEPHARD_DATA}/blob/{commit}/{SHEPHARD_ECOD[proteome][0]}',
    )


def shephard_domains(
    domains_tsv: Path,
    their_fasta: Path,
    snapshot_fasta: Path,
    out: Path,
    manifest: Path,
    name: str,
    commit: str,
    describe: str,
    upstream: list[Path] = (),
    source: str = '',
) -> dict:
    """Domains from a SHEPHARD domains file (accession, start, end, domain_type, key:value ...), as domain units, kept
    only on entries whose sequence in SHEPHARD's FASTA is identical to the snapshot's: their files were computed on
    older UniProt sequences, and a position on a changed sequence is not a position on ours."""
    ours, theirs = parse_fasta(snapshot_fasta), parse_fasta(their_fasta)
    same = {a for a in ours if theirs.get(a) == ours[a]}
    rows = []
    for line in Path(domains_tsv).read_text().splitlines():
        parts = line.rstrip('\n').split('\t')
        if len(parts) < 4 or not parts[1].isdigit():
            continue
        kv = dict(p.split(':', 1) for p in parts[4:] if ':' in p)
        # the label: the family's short name, then ECOD's topology and, if it differs, its possible-homology group
        t, x = kv.get('ECOD_T_group', ''), kv.get('ECOD_X_group', '')
        rows.append(
            {
                'accession': parts[0],
                'start': int(parts[1]),
                'end': int(parts[2]),
                'subtype': 'domain',
                'ref': kv.get('ECOD_F_ID', kv.get('domain_type', '')),
                'label': ' · '.join(dict.fromkeys(v for v in (kv.get('domain_type', ''), t, x) if v)),
                'members': '',
            }
        )
    df = pd.DataFrame(rows, columns=['accession', 'start', 'end', *DOMAIN_COLUMNS])
    kept = df[df['accession'].isin(same)]
    units = make_units(kept, 'domain', f'SHEPHARD {describe}, shephard-data {commit[:7]}', keep=DOMAIN_COLUMNS)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f'{name}.tsv'
    write_units(units, path)
    got = '; '.join(f'{p.name} MD5 {md5_file(p)}' for p in upstream)
    record(
        manifest,
        name,
        out.parent,
        path,
        source or f'{SHEPHARD_DATA}/tree/{commit} ({Path(domains_tsv).name})',
        f'shephard-data {commit[:7]}',
        'MIT (shephard-data LICENSE)',
        note=f"{len(kept):,} of {len(df):,} domains kept: those on the {len(same):,} entries whose sequence equals the snapshot's"
        + (f'. Downloaded: {got}' if got else ''),
    )
    return {
        'domains': len(df),
        'kept': len(kept),
        'proteins': kept['accession'].nunique(),
        'identical_entries': len(same),
    }


# ---- stagers, by name: ptmc stage <name> -------------------------------------------------------------------------------
# Each takes the command line's arguments (proteome, out, manifest, prefix, commit) and returns what it staged. A
# trusted plugin may add one with register_stager when it loads.
STAGERS: dict = {}


def register_stager(name: str, describe: str = ''):
    def wrap(fn):
        STAGERS[name] = (fn, describe)
        return fn

    return wrap


def _snapshot_fasta(out: Path, prefix: str) -> Path:
    fasta = sorted(Path(out).glob(f'{prefix}_uniprot_*.fasta'))
    if not fasta:
        raise FileNotFoundError(f'stage uniprot first: no {prefix}_uniprot_*.fasta in {out}')
    return fasta[-1]


@register_stager('uniprot', 'a UniProt proteome (its sequences, modified residues and domains): needs a proteome id')
def _stage_uniprot(a) -> dict:
    if not a.proteome:
        raise ValueError('ptmc stage uniprot needs a UniProt proteome id (e.g. UP000002311)')
    return uniprot(a.proteome, Path(a.out), Path(a.manifest), a.prefix)


@register_stager('mobidb', "MobiDB disordered regions for the staged proteome's entries")
def _stage_mobidb(a) -> dict:
    return mobidb(_snapshot_fasta(a.out, a.prefix), Path(a.out), Path(a.manifest), a.prefix)


@register_stager(
    'shephard', "SHEPHARD's ECOD domains for a proteome folder of shephard-data (config/shephard_proteomes.json)"
)
def _stage_shephard(a) -> dict:
    if a.proteome not in SHEPHARD_ECOD:
        raise ValueError(f'ptmc stage shephard needs a shephard-data proteome folder: one of {sorted(SHEPHARD_ECOD)}')
    return shephard(
        a.proteome,
        _snapshot_fasta(a.out, a.prefix),
        Path(a.out),
        Path(a.manifest),
        a.prefix,
        a.commit or SHEPHARD_COMMIT,
    )
