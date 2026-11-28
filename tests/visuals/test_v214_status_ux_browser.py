"""RED-first browser checks for the V214 Status refresh, conflict card, and mobile header.

The pages are served by Playwright interception only. No listener is started.
"""
from __future__ import annotations

import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

from tests.visuals.status_browser_harness import PAGES, StatusBrowser

ROOT = Path(__file__).resolve().parents[2]
HEADER_LIMIT_PX = 128
CONTROL_MIN_PX = 44
NAV_LABELS = ("Status", "Health", "Reports", "Dashboard", "Create Route")
TOOL_IDS = ("reloadConfigs", "viewToggle", "themeToggle", "calliopeOpen")


class StatusUxBrowser(unittest.TestCase):
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

    def test_visible_refresh_rereads_the_last_scan_once_and_reloads(self):
        page = self.session.open(PAGES["status"], 1365, 900, "light")
        self._wait_status(page)
        button = page.locator("body > header #reloadConfigs")
        title = button.get_attribute("title") or ""
        label = button.get_attribute("aria-label") or ""
        self.assertIn("last scan report", title.lower(), title)
        self.assertIn("last scan report", label.lower(), label)
        self.session.traffic.clear()
        page.evaluate(
            """() => {
              window.__sawReportReread = false;
              const watch = () => {
                const status = document.getElementById('headerRefreshStatus');
                if (status && (status.textContent || '').includes('Report re-read')) {
                  window.__sawReportReread = true;
                }
              };
              new MutationObserver(watch).observe(document.documentElement, {
                subtree: true, childList: true, characterData: true,
              });
            }"""
        )
        with page.expect_navigation(wait_until="domcontentloaded", timeout=8000):
            button.click()
            page.wait_for_function("() => window.__sawReportReread === true", timeout=5000)
        stamped = self.session.stamped_route_reads()
        self.assertEqual(len(stamped), 1, self.session.traffic)
        self.assertEqual(self.session.non_get(), [])

    def test_fast_double_click_rereads_the_report_once(self):
        page = self.session.open(PAGES["status"], 1365, 900, "dark")
        self._wait_status(page)
        self.session.traffic.clear()
        page.evaluate(
            """() => {
              const control = document.querySelector('body > header #reloadConfigs');
              control.click();
              control.click();
            }"""
        )
        page.wait_for_timeout(500)
        self.assertEqual(len(self.session.stamped_route_reads()), 1, self.session.traffic)
        self.assertEqual(self.session.non_get(), [])

    def test_conflict_card_actions_stay_inside_the_card_on_a_phone(self):
        overflows = []
        for width in (360, 390):
            for theme in ("light", "dark"):
                for conflict_key in ("ambiguous", "decoded"):
                    page = self.session.open(
                        PAGES["status"], width, 844, theme, conflict_key=conflict_key,
                    )
                    self._wait_status(page)
                    page.locator("#conflictCard").scroll_into_view_if_needed()
                    offenders = page.evaluate(_CARD_OVERFLOW_JS)
                    if offenders:
                        overflows.append({"width": width, "theme": theme, "conflicts": conflict_key, "offenders": offenders})
                    self.assertFalse(page.evaluate(_HORIZONTAL_SCROLL_JS), f"{width} {theme} {conflict_key}")
                    for control_id in ("conflictFixBtn", "conflictAckBtn"):
                        box = page.locator(f"#{control_id}").bounding_box()
                        self.assertIsNotNone(box, control_id)
                        self.assertGreaterEqual(box["height"], CONTROL_MIN_PX, f"{control_id} {width} {theme}")
        self.assertEqual(overflows, [])

    def test_mobile_header_stays_short_and_keeps_every_control(self):
        for width, height in ((390, 844), (360, 740)):
            for theme in ("light", "dark"):
                for name in ("status", "health", "reports"):
                    page = self.session.open(PAGES[name], width, height, theme)
                    if name == "status":
                        self._wait_status(page)
                    header_height = page.evaluate(
                        "() => document.querySelector('body > header').getBoundingClientRect().height"
                    )
                    self.assertLessEqual(
                        header_height, HEADER_LIMIT_PX,
                        f"{name} {width}x{height} {theme} header {header_height}",
                    )
                    self.assertFalse(page.evaluate(_HORIZONTAL_SCROLL_JS), f"{name} {width} {theme}")
                    labels = page.evaluate(
                        """() => [...document.querySelectorAll('body > header nav a')]
                          .map((link) => link.textContent.trim())"""
                    )
                    self.assertEqual(tuple(labels), NAV_LABELS, f"{name} {width} {theme}")
                    for control_id in TOOL_IDS:
                        self.assertEqual(
                            page.locator(f"body > header #{control_id}").count(), 1,
                            f"{name} missing {control_id}",
                        )
                    cramped = page.evaluate(_CONTROLS_IN_VIEW_JS, {"min": CONTROL_MIN_PX})
                    self.assertEqual(cramped, [], f"{name} {width} {theme} {cramped}")

    def test_desktop_header_stays_one_row_and_conflict_actions_stay_on_the_title_row(self):
        page = self.session.open(PAGES["status"], 1365, 900, "light")
        self._wait_status(page)
        layout = page.evaluate(
            """() => {
              const header = document.querySelector('body > header');
              const brand = header.querySelector('h1');
              const nav = header.querySelector('.header-nav');
              const tools = header.querySelector('.header-tools');
              const title = document.querySelector('#conflictCard .card-title');
              const action = document.querySelector('#conflictFixBtn');
              return {
                headerHeight: header.getBoundingClientRect().height,
                brandTop: brand.getBoundingClientRect().top,
                navTop: nav.getBoundingClientRect().top,
                toolsTop: tools.getBoundingClientRect().top,
                titleTop: title.getBoundingClientRect().top,
                actionTop: action.getBoundingClientRect().top,
              };
            }"""
        )
        self.assertLessEqual(layout["headerHeight"], 96, layout)
        self.assertLess(abs(layout["brandTop"] - layout["navTop"]), 20, layout)
        self.assertLess(abs(layout["brandTop"] - layout["toolsTop"]), 20, layout)
        self.assertLess(abs(layout["titleTop"] - layout["actionTop"]), 24, layout)

    def _wait_status(self, page):
        page.wait_for_function(
            """() => {
              const card = document.getElementById('conflictCard');
              const apps = document.querySelector('#apps .app');
              return !!apps && !!card && !card.classList.contains('hidden')
                && document.body.innerText.includes('Reported conflict count');
            }""",
            timeout=20000,
        )


_CARD_OVERFLOW_JS = """() => {
  const problems = [];
  for (const card of document.querySelectorAll('.card')) {
    if (card.classList.contains('hidden') || card.offsetParent === null) continue;
    const bounds = card.getBoundingClientRect();
    for (const control of card.querySelectorAll('button, a.btn')) {
      const rect = control.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) {
        problems.push({
          id: control.id || '',
          text: (control.textContent || '').trim().slice(0, 40),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          cardLeft: Math.round(bounds.left),
          cardRight: Math.round(bounds.right),
        });
      }
    }
  }
  return problems;
}"""

_HORIZONTAL_SCROLL_JS = (
    "() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"
)

_CONTROLS_IN_VIEW_JS = """({min}) => {
  const problems = [];
  const controls = [
    ...document.querySelectorAll('body > header nav a'),
    ...document.querySelectorAll('body > header .header-tools button'),
  ];
  for (const control of controls) {
    control.scrollIntoView({block: 'nearest', inline: 'nearest'});
    const rect = control.getBoundingClientRect();
    const inView = rect.top >= -1 && rect.left >= -1
      && rect.bottom <= window.innerHeight + 1
      && rect.right <= window.innerWidth + 1;
    if (!inView || rect.width < min - 0.5 || rect.height < min - 0.5) {
      problems.push({
        text: (control.getAttribute('aria-label') || control.textContent || control.id || '').trim().slice(0, 40),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        inView,
      });
    }
  }
  return problems;
}"""


if __name__ == "__main__":
    unittest.main()
