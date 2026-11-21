#!/usr/bin/env python3
"""Source-verified PUBLIC login screenshot capture; no owner credentials or private paths."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
from urllib.parse import urlparse, parse_qs

PUBLIC_URL = 'https://ramileo.ngrok.app/admin/login?redirect=/status'
PNG = bytes.fromhex('89504e470d0a1a0a')
SHA40 = re.compile(r'^[0-9a-f]{40}$')
VIEWPORTS = {'desktop': (1365, 900), 'mobile': (390, 844)}

def validate_target(url: str, allow_loopback: bool = False) -> None:
    p = urlparse(url)
    if p.username or p.password or p.fragment or p.params:
        raise ValueError('Unsafe URL components')
    if p.scheme == 'http' and allow_loopback and p.hostname in ('localhost', '127.0.0.1'):
        pass
    elif p.scheme == 'https' and p.hostname == 'ramileo.ngrok.app' and p.port is None:
        pass
    else:
        raise ValueError('Only canonical public login origin is allowed')
    if p.path != '/admin/login' or parse_qs(p.query) != {'redirect': ['/status']}:
        raise ValueError('Only the public login page is allowed')

def png_dimensions(raw: bytes) -> tuple[int, int]:
    if len(raw) < 33 or raw[:8] != PNG or raw[12:16] != b'IHDR':
        raise ValueError('Not a PNG')
    return struct.unpack('>II', raw[16:24])

def capture(url: str, source_file: Path, output_dir: Path, source_sha: str,
            browser_binary: str | None = None, allow_loopback: bool = False) -> dict:
    from playwright.sync_api import sync_playwright
    validate_target(url, allow_loopback)
    if not SHA40.fullmatch(source_sha):
        raise ValueError('Expected full 40-character Git source SHA')
    if output_dir.exists():
        raise ValueError('Refusing to replace existing capture output')
    source_hash = hashlib.sha256(source_file.read_bytes()).hexdigest()
    parsed_url = urlparse(url)
    origin = (parsed_url.scheme, parsed_url.hostname, parsed_url.port)
    result = {
        'kind': 'ACTUAL_PUBLIC_LOGIN' if parsed_url.scheme == 'https' else 'OFFLINE_FIXTURE_ONLY',
        'sourceSha': source_sha, 'sourceFile': 'status/login.html',
        'sourceHtmlSha256': source_hash, 'originalPixels': True,
        'ownerAuthenticated': False, 'privilegedAppUat': False, 'shots': [],
    }
    images = {}
    with sync_playwright() as p:
        settings = {'headless': True}
        if browser_binary:
            settings['executable_path'] = browser_binary
        browser = p.chromium.launch(**settings)
        try:
            for label, (width, height) in VIEWPORTS.items():
                context = browser.new_context(
                    viewport={'width': width, 'height': height},
                    service_workers='block', accept_downloads=False)
                page = context.new_page()
                attempted_unsafe = []
                def guard(route):
                    req = route.request
                    target = urlparse(req.url)
                    if req.method not in ('GET', 'HEAD') or (
                        target.scheme, target.hostname, target.port) != origin:
                        attempted_unsafe.append('non-readonly or external request')
                        route.abort()
                    else:
                        route.continue_()
                page.route('**/*', guard)
                response = page.goto(url, wait_until='domcontentloaded', timeout=25000)
                if not response or response.status != 200:
                    raise RuntimeError('Public login did not return HTTP 200')
                live_hash = hashlib.sha256(response.body()).hexdigest()
                if live_hash != source_hash:
                    raise RuntimeError('Live HTML byte mismatch against repository source')
                target = urlparse(page.url)
                if (target.scheme, target.hostname, target.port) != origin or target.path != '/admin/login':
                    raise RuntimeError('Unexpected navigation away from public login')
                if (page.locator('h1').inner_text().strip() != 'Admin Login' or
                        page.locator('input[type="password"]').count() != 1):
                    raise RuntimeError('Expected public login form not rendered')
                if attempted_unsafe:
                    raise RuntimeError('Public login attempted out-of-scope requests')
                page.evaluate('document.fonts.ready')
                raw = page.screenshot(type='png', full_page=True, animations='disabled')
                iw, ih = png_dimensions(raw)
                if iw != width or ih < height:
                    raise RuntimeError('Screenshot viewport proof mismatch')
                name = f'devproxy-login-{label}.png'
                images[name] = raw
                result['shots'].append({
                    'name': name, 'sha256': hashlib.sha256(raw).hexdigest(),
                    'width': iw, 'height': ih,
                    'viewport': {'width': width, 'height': height},
                    'htmlSha256': live_hash,
                })
                context.close()
        finally:
            browser.close()
    output_dir.mkdir(parents=True, exist_ok=False)
    for name, raw in images.items():
        (output_dir / name).write_bytes(raw)
    (output_dir / 'manifest.json').write_text(
        json.dumps(result, sort_keys=True, indent=2) + '\n')
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default=PUBLIC_URL)
    parser.add_argument('--source-file', type=Path, default=Path('status/login.html'))
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--browser-binary')
    parser.add_argument('--allow-loopback-fixture', action='store_true')
    args = parser.parse_args()
    data = capture(args.url, args.source_file, args.output_dir, args.source_sha,
                   args.browser_binary, args.allow_loopback_fixture)
    print(json.dumps({
        'result': data['kind'], 'count': len(data['shots']),
        'sourceHtmlSha256': data['sourceHtmlSha256'],
    }, sort_keys=True))

if __name__ == '__main__':
    main()
