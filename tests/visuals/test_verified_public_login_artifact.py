import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'visuals'))
from verify_public_login_artifact import verify_and_extract, EvidenceError

SHA = 'a' * 40
HTML = b'<h1>Admin Login</h1>'
HASH = hashlib.sha256(HTML).hexdigest()

def png(w=2, h=3):
    return bytes.fromhex('89504e470d0a1a0a') + struct.pack('>I', 13) + b'IHDR' + struct.pack('>II', w, h) + bytes([8, 2, 0, 0, 0]) + bytes(4) + b'payload'

def archive(tamper=None):
    contents = {'devproxy-login-desktop.png': png(3, 2), 'devproxy-login-mobile.png': png(2, 3)}
    manifest = {'kind':'ACTUAL_PUBLIC_LOGIN','originalPixels':True,'ownerAuthenticated':False,
        'privilegedAppUat':False,'sourceSha':SHA,'sourceFile':'status/login.html',
        'sourceHtmlSha256':HASH,
        'shots':[{'name':name,'sha256':hashlib.sha256(raw).hexdigest(),
                  'htmlSha256':HASH,'width':(3 if 'desktop' in name else 2),
                  'height':(2 if 'desktop' in name else 3),
                  'viewport': {'width':(3 if 'desktop' in name else 2), 'height':1}}
                  for name,raw in contents.items()]}
    if tamper: tamper(manifest, contents)
    b=io.BytesIO()
    with zipfile.ZipFile(b,'w') as z:
        z.writestr('manifest.json',json.dumps(manifest))
        for k,v in contents.items(): z.writestr(k,v)
    return b.getvalue()

class EvidenceTests(unittest.TestCase):
    def assertDenied(self, binary):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(EvidenceError):
                verify_and_extract(binary, Path(d)/'output', expected_source_sha=SHA,
                    expected_html_sha=HASH, sandbox_root=Path(d))
            self.assertFalse((Path(d)/'output').exists())

    def test_genuine_artifact_extracted_only_after_all_checks(self):
        with tempfile.TemporaryDirectory() as d:
            data=verify_and_extract(archive(), Path(d)/'verified', expected_source_sha=SHA,
                    expected_html_sha=HASH, sandbox_root=Path(d))
            self.assertEqual(len(data),2)
            for frame in data:
                self.assertTrue(frame['path'].is_file())
                self.assertEqual(hashlib.sha256(frame['path'].read_bytes()).hexdigest(),frame['sha256'])
                self.assertIn('![',frame['markdown'])
                self.assertIn('sandbox:/mnt/data/',frame['markdown'])

    def test_reject_manifest_sha_lie(self):
        self.assertDenied(archive(lambda m, c: m['shots'][0].update(sha256='f'*64)))

    def test_reject_owner_authenticated(self):
        self.assertDenied(archive(lambda m, c: m.update(ownerAuthenticated=True)))

    def test_reject_wrong_source_pointer(self):
        self.assertDenied(archive(lambda m, c: m.update(sourceSha='b'*40)))

    def test_reject_extra_file(self):
        self.assertDenied(archive(lambda m, c: c.update({'private.json':b'{}'})))

    def test_reject_traversal(self):
        self.assertDenied(archive(lambda m, c: c.update({'../private.png':b'poison'})))

    def test_reject_untrusted_kind(self):
        self.assertDenied(archive(lambda m, c: m.update(kind='PRIVATE_AUTHENTICATED_VIEW')))

    def test_reject_incorrect_viewport(self):
        self.assertDenied(archive(lambda m, c: m['shots'][0].update(width=999)))

    def test_reject_truncated_png(self):
        def tamper(m,c):
            c['devproxy-login-desktop.png'] = b'not png'
            m['shots'][0]['sha256'] = hashlib.sha256(b'not png').hexdigest()
        self.assertDenied(archive(tamper))

if __name__ == '__main__': unittest.main()
