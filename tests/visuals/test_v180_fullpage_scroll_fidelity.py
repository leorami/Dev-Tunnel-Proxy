"""V180 CTO RED-first: full-page screenshots must activate real below-fold content.

The current V178 implementation screenshots from the top without scrolling;
multiple Encast below-fold cards remain blurry placeholders in ORIGINAL PNGs.
This fixture is synthetic and read-only. It does not access protected UI.
"""
import os
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'visuals'))
from capture_public_login import stabilize_public_app_page  # intentionally missing on V178 main

FIXTURE = r"""
<!doctype html><html><head><style>
body { margin: 0; }
.top { height: 1050px; background: #eee; }
.lazy { margin: 100px 0 400px; height: 400px; background: #ddd; filter: blur(18px); }
.lazy.ready { filter: none; background: #2a7; }
</style></head><body>
<div class="top">Public hero</div>
<section class="lazy" data-ready="false">Below fold 1</section>
<section class="lazy" data-ready="false">Below fold 2</section>
<script>
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    entry.target.classList.add('ready');
    entry.target.dataset.ready = 'true';
    observer.unobserve(entry.target);
  }
}, {threshold: 0.10});
document.querySelectorAll('.lazy').forEach(el => observer.observe(el));
</script>
</body></html>
"""

class PublicFullpageScrollTests(unittest.TestCase):
    @unittest.skipIf(os.environ.get('BROWSER_ADMIN_BLOCKED') == '1',
        'Local Chromium denied by CTO container; mandatory unskipped Ubuntu CI')
    def test_scroll_reveals_lazy_sections_then_restores_top(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context(viewport={'width':390,'height':844})
                page = context.new_page()
                page.set_content(FIXTURE, wait_until='load')
                page.wait_for_timeout(120)
                self.assertEqual(page.locator('.lazy.ready').count(), 0,
                                 'Fixture must begin with below-fold placeholders')
                stabilize_public_app_page(page)
                page.wait_for_timeout(150)
                self.assertEqual(page.locator('.lazy.ready').count(), 2,
                                 'Capture must scroll visibly to activate lower content')
                self.assertEqual(page.evaluate('Math.round(window.scrollY)'), 0,
                                 'Capture must restore original top viewport after scrolling')
                self.assertEqual(page.url, 'about:blank',
                                 'Visual stabilization cannot navigate or submit writes')
                context.close()
            finally:
                browser.close()

if __name__ == '__main__': unittest.main()
