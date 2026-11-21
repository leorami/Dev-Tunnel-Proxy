import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'visuals'))
from capture_public_login import (
    validate_target, validate_public_app_target, png_dimensions, capture, capture_public_app)

SHA = 'a' * 40
APP_SHA = 'b' * 40
HTML = b'<!doctype html><html><title>Fixture only</title><body><h1>Admin Login</h1><form><input type="password"></form></body></html>'
PUBLIC_APP_HTML = (
    b'<!doctype html><html lang="en" data-encast-theme="warm">'
    b'<head><title>Encast</title></head>'
    b'<body><div id="root"><main>Public fixture app</main></div></body></html>'
)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/admin/login?redirect=/status':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(HTML)
        elif self.path == '/encast/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(PUBLIC_APP_HTML)
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *args): pass

class CaptureTests(unittest.TestCase):
    def test_reject_admin_and_external(self):
        urls = [
            'https://ramileo.ngrok.app/status',
            'https://ramileo.ngrok.app/admin/login?redirect=/dashboard',
            'http://ramileo.ngrok.app/admin/login?redirect=/status',
            'https://other.example/admin/login?redirect=/status',
            'https://evil@ramileo.ngrok.app/admin/login?redirect=/status',
        ]
        for url in urls:
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_target(url)

    def test_public_login_valid(self):
        validate_target('https://ramileo.ngrok.app/admin/login?redirect=/status')

    def test_png_rejects_non_png(self):
        with self.assertRaises(ValueError):
            png_dimensions(b'not a PNG')

    @unittest.skipIf(os.environ.get('BROWSER_ADMIN_BLOCKED') == '1',
        'Browser navigation blocked in CTO sandbox; GitHub Linux CI MUST run unskipped')
    def test_real_chromium_source_exact_fixture(self):
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with tempfile.TemporaryDirectory() as dirname:
            root = Path(dirname)
            source = root / 'login.html'
            source.write_bytes(HTML)
            dest = root / 'capture'
            try:
                result = capture(
                    f'http://127.0.0.1:{server.server_port}/admin/login?redirect=/status',
                    source, dest, SHA, shutil.which('chromium'), allow_loopback=True)
                self.assertEqual(result['kind'], 'OFFLINE_FIXTURE_ONLY')
                self.assertEqual(len(result['shots']), 2)
                for shot in result['shots']:
                    raw = (dest / shot['name']).read_bytes()
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), shot['sha256'])
                    self.assertEqual(png_dimensions(raw), (shot['width'], shot['height']))
                self.assertFalse(json.loads((dest / 'manifest.json').read_text())['ownerAuthenticated'])
            finally:
                server.shutdown()
                server.server_close()

    def test_public_app_gate_accepts_allowlisted_path(self):
        self.assertTrue(validate_public_app_target(
            'https://ramileo.ngrok.app/encast/',
            approved_paths=('/encast/',), owner_public_approved=True))

    @unittest.skipIf(os.environ.get('BROWSER_ADMIN_BLOCKED') == '1',
        'Browser navigation blocked in CTO sandbox; GitHub Linux CI MUST run unskipped')
    def test_real_chromium_public_app_fixture(self):
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with tempfile.TemporaryDirectory() as dirname:
            dest = Path(dirname) / 'public-app'
            try:
                result = capture_public_app(
                    f'http://127.0.0.1:{server.server_port}/encast/',
                    dest, SHA, APP_SHA,
                    approved_paths=('/encast/',),
                    owner_public_approved=True,
                    app_source_label='encast-fixture',
                    required_markers=('data-encast-theme', '<title>Encast</title>'),
                    browser_binary=shutil.which('chromium'),
                    allow_loopback=True)
                self.assertEqual(result['kind'], 'OFFLINE_PUBLIC_APP_FIXTURE')
                self.assertEqual(len(result['shots']), 2)
                self.assertEqual(result['appSourceSha'], APP_SHA)
                self.assertEqual(result['proxySourceSha'], SHA)
                self.assertFalse(result['ownerAuthenticated'])
                for shot in result['shots']:
                    raw = (dest / shot['name']).read_bytes()
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), shot['sha256'])
                    self.assertEqual(png_dimensions(raw), (shot['width'], shot['height']))
            finally:
                server.shutdown()
                server.server_close()

if __name__ == '__main__':
    unittest.main()
