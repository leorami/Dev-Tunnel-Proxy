"""V178 CTO RED-first public application browser allowlist contract.
Unimplemented in source; do not replace assertions with a fake app or bypass auth.
"""
import sys
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'visuals'))
import capture_public_login as browser_evidence

class PublicProxiedAppContract(unittest.TestCase):
    def validated(self, url, allowlist=('/known-public-app/',), approved=True):
        self.assertTrue(hasattr(browser_evidence, 'validate_public_app_target'),
                        'RED: a separate explicit public-app gate is not yet implemented')
        return browser_evidence.validate_public_app_target(
            url, approved_paths=allowlist, owner_public_approved=approved)

    def test_one_explicitly_public_origin_path_may_be_captured(self):
        self.assertTrue(self.validated('https://ramileo.ngrok.app/known-public-app/'))

    def test_no_private_admin_api_status_or_dashboard_routes(self):
        for path in ('/status', '/health', '/reports', '/dashboard',
                     '/admin/login', '/devproxy/api/settings', '/routes.json'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.validated('https://ramileo.ngrok.app' + path)

    def test_absent_owner_public_intent_and_unknown_routes_denied(self):
        with self.assertRaises(ValueError):
            self.validated('https://ramileo.ngrok.app/known-public-app/', approved=False)
        with self.assertRaises(ValueError):
            self.validated('https://ramileo.ngrok.app/unknown-app/')

    def test_url_aliases_cross_origin_and_leaky_parameters_denied(self):
        for url in ('http://ramileo.ngrok.app/known-public-app/',
                    'https://another.example/known-public-app/',
                    'https://ramileo.ngrok.app/known-public-app/?token=secret',
                    'https://ramileo.ngrok.app/known-public-app/#fragment',
                    'https://ramileo.ngrok.app/known-public-app/%2e%2e/admin',
                    'https://evil@ramileo.ngrok.app/known-public-app/'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.validated(url)

if __name__ == '__main__':
    unittest.main()
