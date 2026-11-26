"""Gates for the V214 synthetic Status capture. No browser and no network."""
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "capture_status_synthetic",
    ROOT / "scripts" / "visuals" / "capture_status_synthetic.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SyntheticStatusGate(unittest.TestCase):
    def test_repository_blobs_match_v214_receipt(self):
        head = MODULE.verify_repository(ROOT)
        self.assertEqual(len(head), 40)

    def test_blob_drift_is_refused(self):
        drifted = dict(MODULE.EXPECTED_BLOBS)
        drifted["status/status.html"] = "0" * 40
        with self.assertRaises(MODULE.CaptureError):
            MODULE.assert_blob_map({"status/status.html": MODULE.EXPECTED_BLOBS["status/status.html"]}, drifted)

    def test_owner_hosts_and_mutations_are_refused(self):
        refused = [
            ("GET", "https://ramileo.ngrok.app/status/status.html"),
            ("GET", "http://127.0.0.1:17888/health"),
            ("GET", "http://localhost/status/status.html"),
            ("GET", "https://example-tunnel.invalid/status/status.html"),
            ("POST", "https://devproxy-fixture.invalid/devproxy/api/ai/audit"),
            ("GET", "https://devproxy-fixture.invalid/routes.json?token=secret"),
        ]
        for method, url in refused:
            self.assertNotEqual(MODULE.classify_request(method, url), "fulfill", url)
        self.assertEqual(
            MODULE.classify_request("GET", "https://devproxy-fixture.invalid/routes.json"),
            "fulfill",
        )
        self.assertEqual(
            MODULE.classify_request("GET", "https://devproxy-fixture.invalid/status/status.html"),
            "fulfill",
        )

    def test_denied_requests_stay_on_the_fixture_origin(self):
        denied = []
        self.assertEqual(
            MODULE.record_denial(denied, "GET", "https://ramileo.ngrok.app/status/status.html"),
            "deny-external",
        )
        self.assertEqual(denied, [])
        self.assertEqual(
            MODULE.record_denial(denied, "POST", "https://devproxy-fixture.invalid/devproxy/api/ai/ask"),
            "deny-fixture",
        )
        self.assertEqual(denied, [{
            "method": "POST",
            "origin": "https://devproxy-fixture.invalid",
            "path": "/devproxy/api/ai/ask",
        }])

    def test_fixture_has_no_owner_host(self):
        path = ROOT / "scripts" / "visuals" / "fixtures" / "v214_status_synthetic.json"
        raw = path.read_text(encoding="utf-8")
        self.assertNotIn("ngrok.app", raw)
        self.assertNotIn("localhost", raw)
        fixture = MODULE.load_fixture(path)
        ambiguous = MODULE.routes_document(fixture, "ambiguous")
        decoded = MODULE.routes_document(fixture, "decoded")
        self.assertEqual(ambiguous["nginxConflicts"]["totalConflicts"], 2)
        self.assertEqual(decoded["nginxWarnings"][0].count("gamma-docs.conf"), 2)
        statuses = {
            item["status"]
            for target in ambiguous["summary"].values()
            for item in target.values()
        }
        self.assertEqual(statuses, {200, 307, 308, 401, 404, 503})

    def test_manifest_matches_the_origin_extractor_contract(self):
        frame = {
            "file": "status-desktop-light-drawer-open.png",
            "width": 1365,
            "height": 900,
            "sha256": "a" * 64,
            "theme": "light",
            "kind": "SOURCE_RECONSTRUCTED_PREVIEW",
        }
        manifest = MODULE.build_manifest("b" * 40, [frame], fixture_sha256="c" * 64, served_sha="b" * 40)
        self.assertIs(manifest["syntheticOnly"], True)
        self.assertEqual(manifest["testedSourceSha"], manifest["servedSha"])
        self.assertEqual(manifest["framework"], "web")
        self.assertIs(manifest["macosRunnerAvailable"], False)
        self.assertIs(manifest["ownerData"], False)
        with self.assertRaises(MODULE.CaptureError):
            MODULE.build_manifest("b" * 40, [frame], fixture_sha256="c" * 64, served_sha="d" * 40)
        with self.assertRaises(MODULE.CaptureError):
            MODULE.build_manifest(
                "b" * 40,
                [frame],
                fixture_sha256="c" * 64,
                denied_requests=[{"method": "GET", "origin": "https://ramileo.ngrok.app", "path": "/"}],
            )

    def test_status_paths_cannot_escape_the_status_directory(self):
        self.assertIsNone(MODULE.status_file(ROOT, "/status/../scripts/visuals/capture_status_synthetic.py"))
        self.assertIsNone(MODULE.status_file(ROOT, "/status/status.html/../../README.md"))
        self.assertTrue(str(MODULE.status_file(ROOT, "/status/status.html")).endswith("status/status.html"))


if __name__ == "__main__":
    unittest.main()
