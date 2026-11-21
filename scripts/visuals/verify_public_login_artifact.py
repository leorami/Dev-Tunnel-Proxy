#!/usr/bin/env python3
"""Fail-closed verifier for the unauthenticated Dev Proxy public-login artifact.

Runs inside the ChatGPT container. Never treats this public-login evidence as
private administrative UI UAT. No network or credentials. The caller must supply
an independently verified expected capture commit and live HTML SHA256.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import stat
import struct
import zipfile

SANDBOX = Path('/mnt/data').resolve()
PNG_SIG = bytes.fromhex('89504e470d0a1a0a')
SOURCE_SHA = re.compile(r'^[0-9a-f]{40}$')
SHA256 = re.compile(r'^[0-9a-f]{64}$')
IMAGES = {'devproxy-login-desktop.png', 'devproxy-login-mobile.png'}
MEMBERS = IMAGES | {'manifest.json'}
MAX_FILE = 8 * 1024 * 1024
MAX_TOTAL = 17 * 1024 * 1024

class EvidenceError(ValueError):
    """A capture is not independently verifiable; do not display or accept it."""

def _deny(message):
    raise EvidenceError(message)

def _png_dimensions(raw):
    if len(raw) < 33 or raw[:8] != PNG_SIG or raw[12:16] != b'IHDR' or raw[8:12] != b'\x00\x00\x00\x0d':
        _deny('invalid_png_header')
    width, height = struct.unpack('>II', raw[16:24])
    if not 1 <= width <= 8192 or not 1 <= height <= 16384:
        _deny('invalid_png_dimensions')
    return width, height

def verify_and_extract(archive, outdir: Path, *, expected_source_sha: str,
                       expected_html_sha: str, sandbox_root: Path = SANDBOX) -> list[dict]:
    """Verify every member BEFORE writing; never overwrite existing output."""
    if not SOURCE_SHA.fullmatch(expected_source_sha) or not SHA256.fullmatch(expected_html_sha):
        _deny('expected_provenance_missing')
    outdir = Path(outdir).resolve()
    sandbox_root = Path(sandbox_root).resolve()
    if outdir == sandbox_root or not outdir.is_relative_to(sandbox_root) or outdir.exists():
        _deny('output_must_be_a_fresh_conversation_directory')
    if isinstance(archive, (bytes, bytearray)):
        archive = io.BytesIO(archive)
    try:
        with zipfile.ZipFile(archive, 'r') as z:
            entries = z.infolist()
            names = [e.filename for e in entries]
            if len(entries) != len(MEMBERS) or set(names) != MEMBERS or len(set(names)) != len(names):
                _deny('unexpected_artifact_members')
            if any(e.is_dir() or e.filename.startswith('/') or '/' in e.filename or '\\' in e.filename
                   or stat.S_ISLNK(e.external_attr >> 16) or e.file_size > MAX_FILE
                   for e in entries):
                _deny('unsafe_artifact_member')
            if sum(e.file_size for e in entries) > MAX_TOTAL:
                _deny('artifact_too_large')
            data = {name: z.read(name) for name in MEMBERS}
    except (zipfile.BadZipFile, RuntimeError, OSError, EOFError) as exc:
        raise EvidenceError('unreadable_artifact') from exc
    try:
        manifest = json.loads(data['manifest.json'])
    except (ValueError, UnicodeDecodeError, TypeError) as exc:
        raise EvidenceError('invalid_manifest') from exc
    if (not isinstance(manifest, dict) or manifest.get('kind') != 'ACTUAL_PUBLIC_LOGIN'
        or manifest.get('originalPixels') is not True
        or manifest.get('ownerAuthenticated') is not False
        or manifest.get('privilegedAppUat') is not False
        or manifest.get('sourceFile') != 'status/login.html'
        or manifest.get('sourceSha') != expected_source_sha
        or manifest.get('sourceHtmlSha256') != expected_html_sha):
        _deny('public_only_provenance_mismatch')
    shots = manifest.get('shots')
    if (not isinstance(shots, list) or len(shots) != 2
        or {s.get('name') for s in shots if isinstance(s, dict)} != IMAGES):
        _deny('invalid_shot_inventory')
    verified = []
    for shot in shots:
        name = shot['name']
        raw = data[name]
        digest = hashlib.sha256(raw).hexdigest()
        width, height = _png_dimensions(raw)
        viewport = shot.get('viewport')
        if (digest != shot.get('sha256') or shot.get('htmlSha256') != expected_html_sha
            or shot.get('width') != width or shot.get('height') != height
            or not isinstance(viewport, dict) or viewport.get('width') != width
            or not isinstance(viewport.get('height'), int)
            or viewport['height'] < 1 or viewport['height'] > height):
            _deny('pixel_or_viewport_manifest_mismatch')
        dest = outdir / name
        label = 'Desktop' if 'desktop' in name else 'Mobile'
        relative = dest.relative_to(sandbox_root).as_posix()
        verified.append({
            'name': name, 'sha256': digest, 'width': width, 'height': height,
            'path': dest, 'classification': 'ACTUAL_UNAUTHENTICATED_PUBLIC_LOGIN_ONLY',
            'markdown': f'![Original Dev Proxy public login - {label} ({width}x{height})](sandbox:/mnt/data/{relative})',
        })
    outdir.mkdir(parents=True, exist_ok=False)
    for shot in verified:
        shot['path'].write_bytes(data[shot['name']])
    return verified

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--artifact', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--source-sha', required=True)
    ap.add_argument('--html-sha', required=True)
    args = ap.parse_args()
    shots = verify_and_extract(args.artifact, args.out,
         expected_source_sha=args.source_sha, expected_html_sha=args.html_sha)
    for shot in shots:
        print(f"{shot['name']} {shot['width']}x{shot['height']} SHA256 {shot['sha256']}")
        print(shot['markdown'])
    print('PUBLIC LOGIN ONLY - NOT AUTHENTICATED ADMIN UAT')

if __name__ == '__main__':
    main()
