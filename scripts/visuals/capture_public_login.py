#!/usr/bin/env python3
"""Source-verified PUBLIC login / approved-public app screenshot capture; no owner credentials or private paths."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
from urllib.parse import urlparse, parse_qs, unquote

PUBLIC_URL = 'https://ramileo.ngrok.app/admin/login?redirect=/status'
PUBLIC_ORIGIN_HOST = 'ramileo.ngrok.app'
PNG = bytes.fromhex('89504e470d0a1a0a')
SHA40 = re.compile(r'^[0-9a-f]{40}$')
VIEWPORTS = {'desktop': (1365, 900), 'mobile': (390, 844)}
# Live public Encast full-page captures are a few thousand pixels tall. Stop before an unbounded crawl.
MAX_PUBLIC_PAGE_HEIGHT = 20000
MAX_PUBLIC_SCROLL_STEPS = 40
SCROLL_SETTLE_MS = 200
# Always deny these even if an operator mistakenly allowlists them.
PRIVATE_PATH_PREFIXES = (
    '/admin', '/status', '/health', '/reports', '/dashboard', '/devproxy/api',
)
PRIVATE_PATH_EXACT = frozenset({
    '/routes.json', '/status', '/health', '/reports', '/dashboard',
})

def validate_target(url: str, allow_loopback: bool = False) -> None:
    p = urlparse(url)
    if p.username or p.password or p.fragment or p.params:
        raise ValueError('Unsafe URL components')
    if p.scheme == 'http' and allow_loopback and p.hostname in ('localhost', '127.0.0.1'):
        pass
    elif p.scheme == 'https' and p.hostname == PUBLIC_ORIGIN_HOST and p.port is None:
        pass
    else:
        raise ValueError('Only canonical public login origin is allowed')
    if p.path != '/admin/login' or parse_qs(p.query) != {'redirect': ['/status']}:
        raise ValueError('Only the public login page is allowed')

def validate_public_app_target(
        url: str,
        approved_paths: tuple[str, ...] | list[str] = (),
        owner_public_approved: bool = False,
        allow_loopback: bool = False) -> bool:
    """Fail-closed gate for ONE explicit owner-public proxied app path.

    Requires both an exact path allowlist membership and owner_public_approved.
    Rejects private/admin surfaces, aliases, credentials, query tokens, fragments,
    and encoded path traversal. No wildcard or auto-discovery bypass.
    """
    if not owner_public_approved:
        raise ValueError('Owner public intent is required')
    if not approved_paths:
        raise ValueError('Explicit public-route allowlist is required')
    allow = tuple(approved_paths)
    for item in allow:
        if not isinstance(item, str) or not item.startswith('/') or '*' in item:
            raise ValueError('Allowlist entries must be exact absolute paths')
    p = urlparse(url)
    if p.username or p.password or p.fragment or p.params:
        raise ValueError('Unsafe URL components')
    if p.query:
        raise ValueError('Query parameters are not allowed on public app captures')
    if p.scheme == 'http' and allow_loopback and p.hostname in ('localhost', '127.0.0.1'):
        pass
    elif p.scheme == 'https' and p.hostname == PUBLIC_ORIGIN_HOST and p.port is None:
        pass
    else:
        raise ValueError('Only the canonical HTTPS public proxy origin is allowed')
    path = p.path or ''
    decoded = unquote(path)
    if path != decoded or '..' in decoded.split('/'):
        raise ValueError('Encoded or traversal paths are not allowed')
    if path in PRIVATE_PATH_EXACT or any(
            path == prefix or path.startswith(prefix + '/')
            for prefix in PRIVATE_PATH_PREFIXES):
        raise ValueError('Private or management routes are not allowed')
    if path not in allow:
        raise ValueError('Path is not on the explicit public-route allowlist')
    return True

def _public_scroll_metrics(page) -> dict:
    return page.evaluate('''() => {
        const el = document.scrollingElement || document.documentElement || document.body;
        const view = window.innerHeight || 0;
        const height = el ? el.scrollHeight : 0;
        return {y: window.scrollY || 0, view, height, maxScroll: Math.max(0, height - view)};
    }''')

def _settle_visible_public_assets(page, everywhere: bool = False) -> None:
    """Wait for intersection frames, fonts, and in-view image decode. Does not edit DOM or CSS."""
    page.evaluate('''async (everywhere) => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        const images = Array.from(document.images || []);
        const pending = images.map((img) => {
            if (img.complete) return Promise.resolve();
            if (!everywhere) {
                const rect = img.getBoundingClientRect();
                const view = window.innerHeight || 1;
                if (rect.bottom < -view || rect.top > view * 2) return Promise.resolve();
            }
            const decode = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
            return Promise.race([decode, new Promise((resolve) => setTimeout(resolve, 1000))]);
        });
        await Promise.race([
            Promise.all([fonts, ...pending]),
            new Promise((resolve) => setTimeout(resolve, everywhere ? 2500 : 1500)),
        ]);
    }''', everywhere)

def stabilize_public_app_page(page) -> None:
    """Scroll a guest page in viewport steps so real lazy/intersection content can run, then return to the top.

    No navigation, clicks, typing, DOM writes, or CSS edits. Oversized pages and stuck scroll raise.
    """
    page.evaluate('window.scrollTo(0, 0)')
    metrics = _public_scroll_metrics(page)
    if metrics['view'] < 1:
        raise RuntimeError('Public page viewport height is not usable')
    if metrics['height'] > MAX_PUBLIC_PAGE_HEIGHT:
        raise RuntimeError(
            'Public page is taller than the bounded capture height '
            f'({int(metrics["height"])}px > {MAX_PUBLIC_PAGE_HEIGHT}px)')
    reached_bottom = False
    stuck = 0
    for _step in range(MAX_PUBLIC_SCROLL_STEPS):
        metrics = _public_scroll_metrics(page)
        if metrics['height'] > MAX_PUBLIC_PAGE_HEIGHT:
            raise RuntimeError(
                'Public page grew past the bounded capture height '
                f'({int(metrics["height"])}px > {MAX_PUBLIC_PAGE_HEIGHT}px)')
        if metrics['y'] >= metrics['maxScroll'] - 2:
            reached_bottom = True
            break
        before = metrics['y']
        # Overlap consecutive viewports so a section is not visible only on a boundary.
        step_px = max(1, int(metrics['view'] * 0.75))
        page.evaluate('(dy) => window.scrollBy(0, dy)', step_px)
        page.wait_for_timeout(SCROLL_SETTLE_MS)
        _settle_visible_public_assets(page, everywhere=False)
        after = _public_scroll_metrics(page)['y']
        if after <= before + 1:
            stuck += 1
            if stuck >= 2:
                raise RuntimeError(
                    'Public page did not scroll; stopping before a false full-page capture')
        else:
            stuck = 0
    if not reached_bottom:
        raise RuntimeError('Public page scroll did not reach the bottom within the step bound')
    _settle_visible_public_assets(page, everywhere=True)
    page.evaluate('window.scrollTo(0, 0)')
    _settle_visible_public_assets(page, everywhere=False)
    page.wait_for_timeout(50)

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

def capture_public_app(
        url: str,
        output_dir: Path,
        proxy_source_sha: str,
        app_source_sha: str,
        *,
        approved_paths: tuple[str, ...] | list[str],
        owner_public_approved: bool,
        app_source_label: str,
        required_markers: tuple[str, ...] | list[str] = (),
        browser_binary: str | None = None,
        allow_loopback: bool = False) -> dict:
    """Capture ONE approved-public proxied app with a fresh guest browser context.

    App source SHA is recorded separately from proxy source SHA. Live HTML is
    hashed as served evidence; Vite/Next transforms mean byte equality with the
    app repo index is not required. Markers prove the intended public shell.
    """
    from playwright.sync_api import sync_playwright
    validate_public_app_target(
        url, approved_paths=approved_paths,
        owner_public_approved=owner_public_approved, allow_loopback=allow_loopback)
    if not SHA40.fullmatch(proxy_source_sha) or not SHA40.fullmatch(app_source_sha):
        raise ValueError('Expected full 40-character Git source SHAs')
    if not app_source_label or not str(app_source_label).strip():
        raise ValueError('App source label is required')
    if str(app_source_label).startswith('/') or '..' in str(app_source_label):
        raise ValueError('App source label must be a short non-path provenance string')
    markers = tuple(required_markers)
    if not markers:
        raise ValueError('At least one required public-app marker is required')
    if output_dir.exists():
        raise ValueError('Refusing to replace existing capture output')
    parsed_url = urlparse(url)
    approved_path = parsed_url.path
    origin = (parsed_url.scheme, parsed_url.hostname, parsed_url.port)
    result = {
        'kind': 'ACTUAL_PUBLIC_APP' if parsed_url.scheme == 'https' else 'OFFLINE_PUBLIC_APP_FIXTURE',
        'proxySourceSha': proxy_source_sha,
        'appSourceSha': app_source_sha,
        'appSourceLabel': app_source_label,
        'approvedPath': approved_path,
        'requiredMarkers': list(markers),
        'originalPixels': True,
        'ownerAuthenticated': False,
        'privilegedAppUat': False,
        'cookiesUsed': False,
        'shots': [],
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
                # Fresh context: no storage/cookies from prior captures.
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
                    raise RuntimeError('Approved public app did not return HTTP 200')
                ctype = (response.headers.get('content-type') or '').lower()
                if 'text/html' not in ctype:
                    raise RuntimeError('Approved public app did not serve HTML')
                body = response.body()
                live_hash = hashlib.sha256(body).hexdigest()
                text = body.decode('utf-8', 'replace')
                for marker in markers:
                    if marker not in text:
                        raise RuntimeError('Required public-app marker missing from served HTML')
                if 'type="password"' in text.lower() or 'admin login' in text.lower():
                    raise RuntimeError('Refusing capture that looks like auth or private admin UI')
                target = urlparse(page.url)
                if ((target.scheme, target.hostname, target.port) != origin
                        or target.path != approved_path):
                    raise RuntimeError('Unexpected navigation away from approved public path')
                if attempted_unsafe:
                    raise RuntimeError('Public app attempted out-of-scope requests')
                # Fresh context starts with no cookies; do not reuse owner tabs/storage.
                try:
                    page.wait_for_load_state('networkidle', timeout=20000)
                except Exception:
                    # Still accept a marker-validated HTML shell if SPA assets are slow.
                    page.wait_for_timeout(1500)
                page.evaluate('document.fonts.ready')
                stabilize_public_app_page(page)
                target = urlparse(page.url)
                if ((target.scheme, target.hostname, target.port) != origin
                        or target.path != approved_path):
                    raise RuntimeError(
                        'Unexpected navigation away from approved public path during scroll')
                raw = page.screenshot(type='png', full_page=True, animations='disabled')
                iw, ih = png_dimensions(raw)
                if iw != width or ih < height:
                    raise RuntimeError('Screenshot viewport proof mismatch')
                name = f'devproxy-public-app-{label}.png'
                images[name] = raw
                result['shots'].append({
                    'name': name, 'sha256': hashlib.sha256(raw).hexdigest(),
                    'width': iw, 'height': ih,
                    'viewport': {'width': width, 'height': height},
                    'servedHtmlSha256': live_hash,
                    'contentType': ctype.split(';')[0].strip(),
                    'deniedOutOfScopeRequests': len(attempted_unsafe),
                })
                result['servedHtmlSha256'] = live_hash
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
    parser.add_argument('--source-sha', required=True,
                        help='Proxy repository Git SHA (40 hex)')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--browser-binary')
    parser.add_argument('--allow-loopback-fixture', action='store_true')
    parser.add_argument('--public-app', action='store_true',
                        help='Capture one approved-public proxied app (not login)')
    parser.add_argument('--approved-path', action='append', default=[],
                        help='Exact path allowlist entry (repeatable)')
    parser.add_argument('--owner-public-approved', action='store_true')
    parser.add_argument('--app-source-sha', default='',
                        help='Separate app repository Git SHA (40 hex)')
    parser.add_argument('--app-source-label', default='',
                        help='Short non-secret app provenance label')
    parser.add_argument('--required-marker', action='append', default=[],
                        help='Substring that must appear in served HTML')
    args = parser.parse_args()
    if args.public_app:
        data = capture_public_app(
            args.url, args.output_dir, args.source_sha, args.app_source_sha,
            approved_paths=tuple(args.approved_path),
            owner_public_approved=args.owner_public_approved,
            app_source_label=args.app_source_label,
            required_markers=tuple(args.required_marker),
            browser_binary=args.browser_binary,
            allow_loopback=args.allow_loopback_fixture)
        print(json.dumps({
            'result': data['kind'], 'count': len(data['shots']),
            'approvedPath': data['approvedPath'],
            'appSourceSha': data['appSourceSha'],
            'proxySourceSha': data['proxySourceSha'],
            'servedHtmlSha256': data.get('servedHtmlSha256'),
        }, sort_keys=True))
        return
    data = capture(args.url, args.source_file, args.output_dir, args.source_sha,
                   args.browser_binary, args.allow_loopback_fixture)
    print(json.dumps({
        'result': data['kind'], 'count': len(data['shots']),
        'sourceHtmlSha256': data['sourceHtmlSha256'],
    }, sort_keys=True))

if __name__ == '__main__':
    main()
