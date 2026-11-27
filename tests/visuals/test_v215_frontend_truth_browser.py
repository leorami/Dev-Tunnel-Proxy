"""RED-first intercepted browser checks for Health and Reports truth.

Pages are served by Playwright interception only. No listener is started.
"""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

from tests.visuals.status_browser_harness import PAGES, StatusBrowser

ROOT = Path(__file__).resolve().parents[2]
OTHER_SCAN = "2024-01-02T03:04:05.000Z"
POPULATED_LIST = json.dumps({
    "ok": True,
    "items": [{
        "name": "health-synthetic.json",
        "size": 128,
        "mtimeMs": 1762144381466,
    }],
    "pagination": {"total": 1},
}).encode("utf-8")


class FrontendTruthBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.session = StatusBrowser(ROOT, self.browser)

    def tearDown(self):
        self.session.close_page()

    def test_negative_fractional_and_unsafe_conflicts_are_unknown_and_not_green(self):
        for mode in ("negative", "fraction", "text", "unsafe"):
            page = self.session.open(PAGES["health"], 390, 844, "light", routes=mode)
            self._wait_health(page)
            conflicts = self._field(page, "scan-conflicts")
            self.assertEqual(conflicts["text"], "Unknown", mode)
            self.assertNotIn("ok", conflicts["className"].split(), mode)
            self.assertNotIn("reported on that scan", conflicts["text"], mode)
            self.assertNotIn("-1", conflicts["text"], mode)

    def test_scan_time_ignores_a_different_status_report_timestamp(self):
        page = self.session.open(
            PAGES["health"], 390, 844, "light",
            routes="missing",
            status_at=OTHER_SCAN,
        )
        self._wait_health(page)
        when = self._field(page, "scan-time")
        self.assertEqual(when["text"], "Unknown")
        self.assertNotIn(OTHER_SCAN, when["text"])
        self.assertNotIn("ok", self._field(page, "scan-conflicts")["className"].split())

    def test_malformed_health_json_is_not_announced_as_a_successful_reread(self):
        page = self.session.open(PAGES["health"], 390, 844, "dark", health="malformed")
        self._wait_health(page)
        self._click_refresh(page)
        observed = self._field(page, "observed-health")
        feedback = self._feedback(page)
        self.assertEqual(observed["text"], "Unavailable")
        self.assertNotIn("ok", observed["className"].split())
        self.assertNotIn("health re-read", feedback["text"].lower())
        self.assertIn("unavailable", feedback["text"].lower())
        self.assertTrue(feedback["error"], feedback)

    def test_a_slow_first_health_read_cannot_overwrite_a_newer_one(self):
        page = self.session.open(
            PAGES["health"], 390, 844, "light",
            health="not-ok",
            hold_once=("/health.json",),
        )
        self.session.health_mode = "ok"
        self._click_refresh(page)
        page.wait_for_function(
            """() => {
              const status = document.getElementById('headerRefreshStatus');
              const observed = document.getElementById('observed-health');
              return !!status && /health re-read/i.test(status.textContent)
                && !!observed && observed.textContent.trim() === 'Proxy responding';
            }""",
            timeout=8000,
        )
        released = self.session.release_held("/health.json", body=b'{"status":"error"}')
        self.assertEqual(released, 1)
        page.wait_for_timeout(400)
        observed = self._field(page, "observed-health")
        feedback = self._feedback(page)
        self.assertEqual(observed["text"], "Proxy responding")
        self.assertNotIn("not ok", observed["text"].lower())
        self.assertIn("health re-read", feedback["text"].lower())
        self.assertFalse(feedback["error"], feedback)

    def test_proxy_liveness_stays_separate_from_the_historical_report(self):
        page = self.session.open(
            PAGES["health"], 1365, 900, "light",
            health="ok",
            routes="missing",
            status_at=OTHER_SCAN,
        )
        self._wait_health(page)
        text = page.evaluate("() => document.body.innerText")
        self.assertIn("Proxy liveness", text)
        self.assertIn("Historical proxy", text)
        self.assertIn("Historical targets", text)
        self.assertIn("not upstream or application health", text.lower())
        observed = self._field(page, "observed-health")
        report = self._field(page, "report-available")
        self.assertEqual(observed["text"], "Proxy responding")
        self.assertEqual(report["text"], "Unavailable")
        self.assertEqual(self._field(page, "scan-time")["text"], "Unknown")
        self.assertIn(self.session.fixture["proxyUrl"], self._field(page, "ngrok-url")["text"])
        self.assertNotEqual(observed["text"], report["text"])

    def test_missing_routes_never_paint_a_green_conflict_count(self):
        page = self.session.open(PAGES["health"], 390, 844, "dark", routes="invalid")
        self._wait_health(page)
        conflicts = self._field(page, "scan-conflicts")
        self.assertEqual(conflicts["text"], "Unknown")
        self.assertNotIn("ok", conflicts["className"].split())
        self._click_refresh(page)
        feedback = self._feedback(page)
        self.assertNotIn("health re-read", feedback["text"].lower())
        self.assertTrue(feedback["error"], feedback)

    def test_genuine_empty_catalog_is_distinct_from_malformed_success(self):
        empty = self.session.open(PAGES["reports"], 390, 844, "light", reports="empty")
        self._wait_reports(empty)
        empty_state = self._catalog(empty)
        self.assertEqual(empty_state["catalog"], "empty")
        self.assertIn("No reports found", empty_state["text"])
        self.assertNotIn("could not be read", empty_state["text"].lower())

        for mode in ("malformed", "ok-no-items", "bad-total", "negative-total", "unsafe-total", "page-gap"):
            page = self.session.open(PAGES["reports"], 390, 844, "dark", reports=mode)
            self._wait_reports(page)
            state = self._catalog(page)
            self.assertEqual(state["catalog"], "malformed", mode)
            self.assertIn("could not be read", state["text"].lower(), mode)
            self.assertNotIn("No reports found", state["text"], mode)
            self._click_refresh(page)
            feedback = self._feedback(page)
            self.assertNotIn("report list re-read", feedback["text"].lower(), mode)
            self.assertTrue(feedback["error"], feedback)

    def test_out_of_range_page_recovers_once_onto_a_genuine_empty_catalog(self):
        page = self.session.open(PAGES["reports"], 390, 844, "light", reports="paged")
        self._wait_reports(page)
        self.session.reports_mode = "shrunk"
        self.session.traffic.clear()
        page.evaluate("() => load(2)")
        page.wait_for_function(
            """() => {
              const rows = document.getElementById('rows');
              return !!rows && rows.dataset.catalog === 'empty';
            }""",
            timeout=8000,
        )
        page.wait_for_timeout(300)
        listed = self._list_reads()
        self.assertEqual(
            [item["query"] for item in listed],
            ["page=2&limit=10", "page=1&limit=10"],
            listed,
        )
        state = self._catalog(page)
        self.assertEqual(state["catalog"], "empty")
        self.assertIn("No reports found", state["text"])

    def test_failed_recovery_stops_instead_of_claiming_an_empty_catalog(self):
        page = self.session.open(PAGES["reports"], 390, 844, "light", reports="recover-malformed")
        self._wait_reports(page)
        self.session.traffic.clear()
        page.evaluate("() => load(2)")
        page.wait_for_function(
            """() => {
              const rows = document.getElementById('rows');
              return !!rows && rows.dataset.catalog === 'malformed';
            }""",
            timeout=8000,
        )
        page.wait_for_timeout(300)
        listed = self._list_reads()
        self.assertEqual(len(listed), 2, listed)
        self.assertIn("page=2", listed[0]["query"])
        self.assertIn("page=1", listed[1]["query"])
        state = self._catalog(page)
        self.assertEqual(state["catalog"], "malformed")
        self.assertNotIn("No reports found", state["text"])
        self.assertNotIn("report list re-read", self._feedback(page)["text"].lower())

    def test_a_slow_report_list_cannot_overwrite_a_newer_read(self):
        page = self.session.open(
            PAGES["reports"], 390, 844, "light",
            reports="populated",
            hold_once=("/devproxy/api/reports/list*",),
        )
        self.session.reports_mode = "empty"
        self._click_refresh(page)
        page.wait_for_function(
            """() => {
              const rows = document.getElementById('rows');
              const status = document.getElementById('headerRefreshStatus');
              return !!rows && rows.dataset.catalog === 'empty'
                && !!status && /report list re-read/i.test(status.textContent);
            }""",
            timeout=8000,
        )
        released = self.session.release_held("/devproxy/api/reports/list", body=POPULATED_LIST)
        self.assertEqual(released, 1)
        page.wait_for_timeout(400)
        state = self._catalog(page)
        self.assertEqual(state["catalog"], "empty")
        self.assertNotIn("health-synthetic.json", state["text"])
        self.assertIn("report list re-read", self._feedback(page)["text"].lower())
        self.assertFalse(self._feedback(page)["error"])

    def test_versioned_health_document_does_not_gain_the_unversioned_stylesheet(self):
        page = self.session.open(PAGES["health"], 390, 844, "light")
        self._wait_health(page)
        state = page.evaluate(
            """() => ({
              links: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => ({
                href: link.getAttribute('href'),
                marker: link.getAttribute('data-dtp-shared-style'),
              })),
              script: (document.querySelector('script[src*="common"]') || {}).src
                ? document.querySelector('script[src*="common"]').getAttribute('src')
                : '',
            })"""
        )
        shared = [item for item in state["links"] if item["href"] and "common" in item["href"]]
        self.assertEqual(shared, [{
            "href": "/status/common.v215-42c0928ec30a.css",
            "marker": "v215",
        }], state)
        self.assertEqual(state["script"], "/status/common.v215-dfd52e64df59.js")

    def test_dashboard_header_is_its_own_in_the_browser(self):
        page = self.session.open("/dashboard/index.html", 1365, 900, "light", ready="dashboard")
        state = page.evaluate(
            """() => {
              const header = document.querySelector('body > header');
              const links = [...header.querySelectorAll('a')].map((link) => ({
                text: link.textContent.trim(),
                href: link.getAttribute('href'),
              }));
              return {
                links,
                reload: !!header.querySelector('#reloadConfigs'),
                theme: !!header.querySelector('#themeToggle'),
                page: document.body.getAttribute('data-page'),
                attach: typeof (window.DTP && window.DTP.attachHeader),
              };
            }"""
        )
        self.assertEqual(
            [item["text"] for item in state["links"]],
            ["Status", "Health", "Reports", "Dashboard"],
        )
        self.assertEqual(
            [item["href"] for item in state["links"]],
            ["/status", "/health", "/reports", "/dashboard/"],
        )
        self.assertFalse(state["reload"], state)
        self.assertTrue(state["theme"], state)
        self.assertEqual(state["page"], "dashboard")
        self.assertNotEqual(state["attach"], "function", state)

    def _wait_health(self, page):
        page.wait_for_function(
            """() => {
              const observed = document.getElementById('observed-health');
              return !!observed && observed.textContent && observed.textContent.trim() !== '—';
            }""",
            timeout=8000,
        )

    def _wait_reports(self, page):
        page.wait_for_function(
            """() => {
              const rows = document.getElementById('rows');
              return !!rows && !/Loading reports/.test(rows.innerText);
            }""",
            timeout=8000,
        )

    def _click_refresh(self, page):
        page.locator("body > header #reloadConfigs").click()
        page.wait_for_function(
            """() => {
              const status = document.getElementById('headerRefreshStatus');
              return !!status && status.textContent.trim().length > 0;
            }""",
            timeout=8000,
        )

    def _field(self, page, element_id):
        return page.evaluate(
            """(id) => {
              const el = document.getElementById(id);
              return {
                text: el ? el.textContent.trim() : '',
                className: el ? el.className : '',
              };
            }""",
            element_id,
        )

    def _feedback(self, page):
        return page.evaluate(
            """() => {
              const status = document.getElementById('headerRefreshStatus');
              return {
                text: status ? status.textContent.trim() : '',
                error: !!(status && status.classList.contains('is-error')),
              };
            }"""
        )

    def _catalog(self, page):
        return page.evaluate(
            """() => {
              const rows = document.getElementById('rows');
              return {
                catalog: rows ? (rows.dataset.catalog || '') : '',
                text: rows ? rows.innerText : '',
              };
            }"""
        )

    def _list_reads(self):
        return [
            item for item in self.session.traffic
            if item["outcome"] == "fulfill" and item["path"].startswith("/devproxy/api/reports/list")
        ]


if __name__ == "__main__":
    unittest.main()
