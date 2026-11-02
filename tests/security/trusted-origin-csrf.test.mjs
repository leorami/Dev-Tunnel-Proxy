/** RED-first trusted-origin CSRF boundary for cookie mutations vs bearer callers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {
  adminRequestOriginAllowed,
  normalizeTrustedOrigins,
} = require('../../utils/admin-session-security.cjs');

test('normalizeTrustedOrigins keeps exact http(s) origins only', () => {
  const set = normalizeTrustedOrigins('http://127.0.0.1:18080, https://your-proxy.example.ngrok.app https://bad/path');
  assert.equal(set.has('http://127.0.0.1:18080'), true);
  assert.equal(set.has('https://your-proxy.example.ngrok.app'), true);
  assert.equal(set.size, 2);
});

test('cookie POST missing Origin is denied even when trusted list is configured', () => {
  assert.equal(
    adminRequestOriginAllowed(undefined, {
      trustedOrigins: ['http://127.0.0.1:18080'],
      authMode: 'cookie',
      method: 'POST',
    }),
    false,
  );
});

test('bearer POST missing Origin remains allowed as a distinct non-browser boundary', () => {
  assert.equal(
    adminRequestOriginAllowed(undefined, {
      trustedOrigins: ['http://127.0.0.1:18080'],
      authMode: 'bearer',
      method: 'POST',
    }),
    true,
  );
});

test('empty trusted list denies every presented Origin', () => {
  assert.equal(
    adminRequestOriginAllowed('http://127.0.0.1:18080', {
      trustedOrigins: [],
      authMode: 'cookie',
      method: 'POST',
    }),
    false,
  );
});
