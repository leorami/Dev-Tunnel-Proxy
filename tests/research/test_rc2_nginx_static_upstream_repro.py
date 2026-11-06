"""Tests for the LOCAL-ONLY nginx static-upstream research harness."""
import contextlib
import http.server
import importlib.util
import os
from pathlib import Path
import threading
import unittest
from unittest import mock

SCRIPT=Path(__file__).with_name("rc2-nginx-static-upstream-repro.py")
SPEC=importlib.util.spec_from_file_location("rc2_nginx_static_repro",SCRIPT)
REPRO=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPRO)

class Quiet(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"fixture")
    def log_message(self,*args):
        return

class SafeLocalNginxResearch(unittest.TestCase):
    def test_red_ignores_host_http_proxy_even_if_no_proxy_is_empty(self):
        server=http.server.ThreadingHTTPServer(("127.0.0.1",0),Quiet)
        worker=threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        try:
            with mock.patch.dict(os.environ,{
                "http_proxy":"http://127.0.0.1:9",
                "HTTP_PROXY":"http://127.0.0.1:9",
                "no_proxy":"",
                "NO_PROXY":""
            }):
                self.assertEqual(REPRO.status("http://127.0.0.1:%d/api"%server.server_address[1]),200)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=2)
    def test_red_refuses_all_nonfixture_hosts_and_schemes_before_network(self):
        disallowed=(
            "http://example.com:18888/api",
            "http://169.254.169.254:18888/api",
            "http://127.0.0.3:18888/api",
            "http://0.0.0.0:18888/api",
            "https://127.0.0.1:18888/api",
            "file:///etc/passwd",
            "http://127.0.0.1:80/api",
            "http://127.0.0.1:18888/api?secret=x",
            "http://someone@127.0.0.1:18888/api",
            "http://127.0.0.1:18888/other",
        )
        for url in disallowed:
            with self.subTest(url=url):
                self.assertEqual(REPRO.status(url),"NON_LOOPBACK_DENIED")
    def test_red_never_invokes_urlopen_proxy_aware_global_helper(self):
        with mock.patch("urllib.request.urlopen",side_effect=AssertionError("untrusted proxy")):
            self.assertNotEqual(REPRO.status("http://127.0.0.1:18888/api"),"NON_LOOPBACK_DENIED")

if __name__=="__main__":
    unittest.main()
