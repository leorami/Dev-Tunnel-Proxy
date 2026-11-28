import unittest


class V217OneSkip(unittest.TestCase):
    @unittest.skip('recorded skip, not a pass')
    def test_skipped(self):
        self.assertTrue(True)
