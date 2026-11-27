"""RED-first browser checks for the shared Status, Health, and Reports shell.

The pages are served by Playwright interception only. No listener is started.
"""
from __future__ import annotations

import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

from tests.visuals.status_browser_harness import PAGES, StatusBrowser

ROOT = Path(__file__).resolve().parents[2]
HEADER_LIMIT_PX = 128
NARROW_HEADER_LIMIT_PX = 144
CONTROL_MIN_PX = 44
NAV_LABELS = ("Status", "Health", "Reports", "Dashboard", "Create Route")
ICON_TOOLS = ("reloadConfigs", "viewToggle", "themeToggle")
WIDTHS = (320, 360, 390, 430)


class SharedShellBrowser(unittest.TestCase):
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

    def test_header_tools_have_icons_and_accessible_names(self):
        missing = []
        for name in ("status", "health", "reports"):
            page = self.session.open(PAGES[name], 390, 844, "light")
            for control_id in ICON_TOOLS:
                info = page.evaluate(
                    """(id) => {
                      const control = document.querySelector('body > header #' + id);
                      if (!control) return {id, present: false};
                      const name = control.getAttribute('aria-label') || control.getAttribute('title') || '';
                      return {
                        id,
                        present: true,
                        svg: control.querySelectorAll('svg').length,
                        name: name.trim(),
                      };
                    }""",
                    control_id,
                )
                if not info.get("present") or info.get("svg", 0) < 1 or not info.get("name"):
                    missing.append({"page": name, **info})
            calliope = page.evaluate(
                """() => {
                  const control = document.querySelector('body > header #calliopeOpen');
                  if (!control) return {present: false};
                  return {
                    present: true,
                    graphic: control.querySelectorAll('img, svg').length,
                    name: (control.getAttribute('aria-label') || '').trim(),
                  };
                }"""
            )
            if not calliope.get("present") or calliope.get("graphic", 0) < 1 or not calliope.get("name"):
                missing.append({"page": name, id: "calliopeOpen", **calliope})
        self.assertEqual(missing, [])

    def test_status_refresh_keeps_the_icon_button_still_and_reads_once(self):
        page = self.session.open(PAGES["status"], 1365, 900, "light")
        self._wait_status(page)
        # The status page probes the local notification bridge once it finishes
        # drawing. Let that pre-existing read settle so it is not blamed on refresh.
        page.wait_for_timeout(600)
        self._assert_refresh_is_single_flight(
            page,
            predicate=lambda: len(self.session.stamped_route_reads()) == 1,
        )
        self.assertEqual(self.session.non_get(), [])
        self.assertEqual(self.session.external(), [])

    def test_health_refresh_rereads_the_endpoint_and_the_report_once(self):
        page = self.session.open(PAGES["health"], 390, 844, "dark")
        self._wait_health(page)
        before = self._counts(("/health.json", "/status.json", "/routes.json"))
        self.session.traffic.clear()
        self._assert_refresh_is_single_flight(
            page,
            predicate=lambda: self._count_path("/health.json") >= 1
            and self._count_path("/status.json") >= 1
            and self._count_path("/routes.json") >= 1,
        )
        self.assertEqual(self._count_path("/health.json"), 1, self.session.traffic)
        self.assertEqual(self._count_path("/routes.json"), 1, self.session.traffic)
        self.assertGreaterEqual(self._count_path("/status.json"), 1, self.session.traffic)
        self.assertEqual(self.session.non_get(), [])
        self.assertEqual(before, before)

    def test_health_refresh_failure_does_not_instruct_a_scan_or_claim_success(self):
        page = self.session.open(PAGES["health"], 390, 844, "light")
        self._wait_health(page)
        self.session.health_mode = "missing"
        self.session.routes_mode = "missing"
        self.session.status_mode = "missing"
        self.session.traffic.clear()
        page.locator("body > header #reloadConfigs").click()
        page.wait_for_timeout(400)
        feedback = page.evaluate(
            """() => {
              const status = document.getElementById('headerRefreshStatus');
              return status ? status.textContent : '';
            }"""
        )
        lowered = feedback.lower()
        self.assertIn("could not re-read", lowered, feedback)
        for banned in ("scanapps", "smart-build", "reloaded", "configurations reloaded"):
            self.assertNotIn(banned, lowered, feedback)
        self.assertNotIn("scanApps", page.evaluate("() => document.body.innerText"))
        self.assertEqual(self.session.non_get(), [])

    def test_reports_header_refresh_rereads_the_list_once(self):
        page = self.session.open(PAGES["reports"], 390, 844, "light", reports="populated")
        self._wait_reports(page)
        self.session.traffic.clear()
        self._assert_refresh_is_single_flight(
            page,
            predicate=lambda: self._count_path_prefix("/devproxy/api/reports/list") >= 1,
        )
        listed = [
            item for item in self.session.traffic
            if item["path"].startswith("/devproxy/api/reports/list") and item["outcome"] == "fulfill"
        ]
        self.assertEqual(len(listed), 1, self.session.traffic)
        self.assertNotIn("scan", listed[0]["path"])
        self.assertEqual(self.session.non_get(), [])
        self.assertEqual(self.session.external(), [])

    def test_collapsed_drawer_does_not_peek_or_take_focus(self):
        problems = []
        for width, height in ((320, 700), (360, 740), (390, 844), (430, 900), (1365, 900)):
            for name in ("health", "reports"):
                page = self.session.open(PAGES[name], width, height, "light")
                page.wait_for_timeout(250)
                state = page.evaluate(_DRAWER_CLOSED_JS)
                if not state["ok"]:
                    problems.append({"page": name, "width": width, **state})
        self.assertEqual(problems, [])

    def test_opening_the_drawer_moves_focus_and_escape_returns_it(self):
        page = self.session.open(PAGES["health"], 390, 844, "dark")
        page.locator("body > header #calliopeOpen").click()
        page.wait_for_function(
            "() => !document.getElementById('aiDrawer').classList.contains('collapsed')",
            timeout=3000,
        )
        self.assertEqual(page.evaluate("() => document.activeElement.id"), "aiQuery")
        page.keyboard.press("Escape")
        page.wait_for_function(
            "() => document.getElementById('aiDrawer').classList.contains('collapsed')",
            timeout=3000,
        )
        self.assertEqual(page.evaluate("() => document.activeElement.id"), "calliopeOpen")
        closed = page.evaluate(_DRAWER_CLOSED_JS)
        self.assertTrue(closed["ok"], closed)

    def test_health_missing_report_is_unknown_and_separate_from_the_endpoint(self):
        page = self.session.open(
            PAGES["health"], 390, 844, "light",
            health="missing", routes="missing", status_json="missing",
        )
        page.wait_for_timeout(400)
        text = page.evaluate("() => document.body.innerText")
        self.assertNotIn("No conflicts", text)
        self.assertNotIn("2026-11-27", text)
        observed = page.locator("#observed-health")
        conflicts = page.locator("#scan-conflicts")
        when = page.locator("#scan-time")
        caveat = page.locator("#scan-caveat")
        self.assertEqual(observed.count(), 1)
        self.assertEqual(conflicts.count(), 1)
        self.assertEqual(when.count(), 1)
        self.assertEqual(caveat.count(), 1)
        self.assertIn("unavailable", observed.inner_text().lower())
        self.assertIn("unknown", conflicts.inner_text().lower())
        self.assertIn("unknown", when.inner_text().lower())
        self.assertIn("not live health", caveat.inner_text().lower())
        self.assertNotIn("conflict", observed.inner_text().lower())

    def test_health_zero_conflicts_are_a_scan_fact_not_a_live_claim(self):
        page = self.session.open(
            PAGES["health"], 1365, 900, "dark",
            health="ok", routes="zero",
        )
        self._wait_health(page)
        observed = page.locator("#observed-health").inner_text().lower()
        conflicts = page.locator("#scan-conflicts").inner_text().lower()
        self.assertIn("responding", observed)
        self.assertNotIn("conflict", observed)
        self.assertIn("0", conflicts)
        self.assertIn("reported on that scan", conflicts)
        self.assertNotIn("no conflicts", conflicts)
        self.assertIn(
            self.session.fixture["generatedAt"],
            page.locator("#scan-time").inner_text(),
        )

    def test_health_invalid_report_stays_unknown(self):
        page = self.session.open(
            PAGES["health"], 390, 844, "light",
            health="not-ok", routes="invalid", status_json="invalid",
        )
        page.wait_for_timeout(400)
        self.assertIn("not ok", page.locator("#observed-health").inner_text().lower())
        self.assertIn("unknown", page.locator("#scan-conflicts").inner_text().lower())
        self.assertIn("unknown", page.locator("#scan-time").inner_text().lower())
        self.assertIn("unknown", page.locator("#targets").inner_text().lower())

    def test_dismiss_toast_shows_the_message_rather_than_the_type(self):
        page = self.session.open(PAGES["status"], 1365, 900, "light")
        self._wait_status(page)
        page.locator("#conflictAckBtn").click()
        toast = page.locator(".toast").inner_text().strip()
        self.assertIn("Historical conflict report dismissed", toast)
        self.assertNotEqual(toast, "info")

    def test_reports_states_are_distinct_and_cleanup_is_secondary(self):
        empty = self.session.open(PAGES["reports"], 390, 844, "light", reports="empty")
        self._wait_reports(empty)
        empty_text = empty.evaluate("() => document.getElementById('rows').innerText")
        self.assertIn("No reports found", empty_text)
        self.assertNotIn("Could not load", empty_text)
        self.assertNotIn("health-synthetic.json", empty_text)

        failed = self.session.open(PAGES["reports"], 390, 844, "dark", reports="failed")
        self._wait_reports(failed)
        failed_text = failed.evaluate("() => document.getElementById('rows').innerText")
        self.assertIn("Could not load reports", failed_text)
        self.assertNotIn("No reports found", failed_text)

        populated = self.session.open(PAGES["reports"], 390, 844, "light", reports="populated")
        self._wait_reports(populated)
        populated_text = populated.evaluate("() => document.getElementById('rows').innerText")
        self.assertIn("health-synthetic.json", populated_text)
        self.assertNotIn("No reports found", populated_text)
        self.assertNotIn("Could not load", populated_text)

        cleanup = populated.evaluate(
            """() => {
              const details = document.getElementById('reportCleanup');
              const prune = document.getElementById('prune7');
              const latest = document.getElementById('pruneAllButLatest');
              return {
                present: !!details,
                open: !!(details && details.open),
                summary: details ? details.querySelector('summary').textContent : '',
                pruneInside: !!(prune && prune.closest('#reportCleanup')),
                latestInside: !!(latest && latest.closest('#reportCleanup')),
                toolbarPrune: !!document.querySelector('.toolbar #prune7'),
              };
            }"""
        )
        self.assertTrue(cleanup["present"], cleanup)
        self.assertFalse(cleanup["open"], cleanup)
        self.assertIn("Clean up", cleanup["summary"])
        self.assertTrue(cleanup["pruneInside"], cleanup)
        self.assertTrue(cleanup["latestInside"], cleanup)
        self.assertFalse(cleanup["toolbarPrune"], cleanup)

    def test_shared_pages_fit_without_clipping_nav_or_the_page(self):
        problems = []
        for width in WIDTHS:
            limit = NARROW_HEADER_LIMIT_PX if width <= 320 else HEADER_LIMIT_PX
            for theme in ("light", "dark"):
                for name in ("status", "health", "reports"):
                    page = self.session.open(PAGES[name], width, 844, theme)
                    if name == "status":
                        self._wait_status(page)
                    state = page.evaluate(_FIT_JS, {"limit": limit, "min": CONTROL_MIN_PX})
                    if not state["ok"]:
                        problems.append({"page": name, "width": width, "theme": theme, **state})
        self.assertEqual(problems, [])

    def test_dashboard_header_keeps_its_destinations(self):
        html = (ROOT / "dashboard" / "public" / "index.html").read_text(encoding="utf-8")
        header = html[html.index("<header>"):html.index("</header>")]
        for label in ("Status", "Health", "Reports", "Dashboard"):
            self.assertIn(label, header)
        self.assertIn('href="/status"', header)
        self.assertIn('href="/health"', header)
        self.assertIn('href="/reports"', header)
        self.assertIn('href="/dashboard/"', header)
        self.assertIn('id="themeToggle"', header)
        self.assertNotIn("attachHeader", header)

    def _assert_refresh_is_single_flight(self, page, predicate):
        self.session.traffic.clear()
        before = page.evaluate(_BUTTON_BOX_JS)
        page.evaluate(
            """() => {
              const control = document.querySelector('body > header #reloadConfigs');
              control.click();
              control.click();
            }"""
        )
        page.wait_for_timeout(350)
        after = page.evaluate(_BUTTON_BOX_JS)
        self.assertGreaterEqual(after["svg"], 1, after)
        self.assertLess(after["dw"], 2, after)
        self.assertLess(after["dh"], 2, after)
        self.assertLess(abs(after["x"] - before["x"]), 2, {"before": before, "after": after})
        self.assertTrue(predicate(), self.session.traffic)
        self.assertEqual(self.session.non_get(), [], self.session.traffic)
        self.assertEqual(self.session.external(), [], self.session.traffic)
        feedback = page.evaluate(
            """() => {
              const status = document.getElementById('headerRefreshStatus');
              const button = document.querySelector('body > header #reloadConfigs');
              return {
                status: status ? status.textContent.trim() : '',
                button: button ? button.textContent.trim() : '',
              };
            }"""
        )
        self.assertTrue(feedback["status"], feedback)
        self.assertNotIn("Report re-read", feedback["button"])
        self.assertNotIn("Reloaded", feedback["button"])

    def _count_path(self, path: str) -> int:
        return sum(
            1 for item in self.session.traffic
            if item["outcome"] == "fulfill" and item["method"] == "GET" and item["path"] == path
        )

    def _count_path_prefix(self, prefix: str) -> int:
        return sum(
            1 for item in self.session.traffic
            if item["outcome"] == "fulfill" and item["method"] == "GET" and item["path"].startswith(prefix)
        )

    def _counts(self, paths):
        return {path: self._count_path(path) for path in paths}

    def _wait_status(self, page):
        page.wait_for_function(
            """() => {
              const card = document.getElementById('conflictCard');
              const apps = document.querySelector('#apps .app');
              return !!apps && !!card && !card.classList.contains('hidden');
            }""",
            timeout=20000,
        )

    def _wait_health(self, page):
        page.wait_for_function(
            """() => {
              const overall = document.getElementById('observed-health')
                || document.getElementById('overall-status');
              return !!overall && overall.textContent && overall.textContent.trim() !== '—';
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


_BUTTON_BOX_JS = """() => {
  const control = document.querySelector('body > header #reloadConfigs');
  const box = control.getBoundingClientRect();
  const previous = window.__refreshBox || null;
  if (!previous) window.__refreshBox = {x: box.x, y: box.y, width: box.width, height: box.height};
  const origin = window.__refreshBox;
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    svg: control.querySelectorAll('svg').length,
    dw: Math.abs(box.width - origin.width),
    dh: Math.abs(box.height - origin.height),
  };
}"""

_DRAWER_CLOSED_JS = """() => {
  const drawer = document.getElementById('aiDrawer');
  if (!drawer) return {ok: false, reason: 'missing'};
  const rect = drawer.getBoundingClientRect();
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const outside = rect.right <= 1 || rect.left >= viewW - 1 || rect.bottom <= 1 || rect.top >= viewH - 1;
  const hitRight = document.elementFromPoint(viewW - 1, Math.min(viewH / 2, viewH - 1));
  const hitBottom = document.elementFromPoint(Math.min(viewW / 2, viewW - 1), viewH - 1);
  const inside = (node) => !!(node && node.closest && node.closest('#aiDrawer'));
  const focusable = [...drawer.querySelectorAll('button, a, input, textarea, select, [tabindex]')]
    .filter((el) => el.tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true');
  let focused = false;
  for (const el of focusable) {
    el.focus();
    if (document.activeElement === el) {
      focused = true;
      break;
    }
  }
  const ok = drawer.classList.contains('collapsed')
    && outside
    && !inside(hitRight)
    && !inside(hitBottom)
    && !focused
    && (drawer.inert === true || drawer.hasAttribute('inert'));
  return {
    ok,
    collapsed: drawer.classList.contains('collapsed'),
    outside,
    inert: drawer.inert === true || drawer.hasAttribute('inert'),
    focused,
    hitRight: inside(hitRight),
    hitBottom: inside(hitBottom),
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    viewW,
    viewH,
  };
}"""

_FIT_JS = """({limit, min}) => {
  const problems = [];
  const header = document.querySelector('body > header');
  const height = header.getBoundingClientRect().height;
  if (height > limit + 0.5) problems.push({kind: 'header', height: Math.round(height), limit});
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
    problems.push({kind: 'page-scroll', scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth});
  }
  const brand = header.querySelector('h1 .brand');
  if (!brand || brand.scrollWidth > brand.clientWidth + 1 || getComputedStyle(brand).textOverflow === 'ellipsis') {
    problems.push({kind: 'brand'});
  }
  const labels = [...header.querySelectorAll('nav a')].map((link) => link.textContent.trim());
  if (labels.join('|') !== 'Status|Health|Reports|Dashboard|Create Route') {
    problems.push({kind: 'labels', labels});
  }
  const nav = header.querySelector('nav');
  const navRect = nav.getBoundingClientRect();
  for (const link of header.querySelectorAll('nav a')) {
    const rect = link.getBoundingClientRect();
    if (rect.width < 8 || rect.left < -1 || rect.right > window.innerWidth + 1
      || rect.left < navRect.left - 1 || rect.right > navRect.right + 1
      || rect.height < min - 0.5) {
      problems.push({kind: 'nav', text: link.textContent.trim(), left: Math.round(rect.left), right: Math.round(rect.right), height: Math.round(rect.height)});
    }
  }
  const tools = [...header.querySelectorAll('.header-tools button')];
  const boxes = tools.map((control) => {
    const rect = control.getBoundingClientRect();
    return {id: control.id, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)};
  });
  for (const box of boxes) {
    if (box.w < min - 0.5 || box.h < min - 0.5 || box.x < -1 || box.x + box.w > window.innerWidth + 1) {
      problems.push({kind: 'tool', ...box});
    }
  }
  return {ok: problems.length === 0, problems, height: Math.round(height)};
}"""


if __name__ == "__main__":
    unittest.main()
