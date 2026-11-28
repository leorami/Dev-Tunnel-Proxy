'use strict';

// Source contract for the historical UI specs that still match the current
// pages. This does not start a browser and it does not contact the owner.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertIsolatedBaseUrl } = require('../../test/ui/isolated-base-url.cjs');

const ROOT = path.resolve(__dirname, '../..');

const PORTED = [
  'test/ui/tests/calliope-chips.spec.ts',
  'test/ui/tests/calliope-toggle.spec.ts',
  'test/ui/tests/calliope-toggle-comprehensive.spec.ts',
  'test/ui/tests/status.spec.ts',
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('ported UI specs are named by this source contract', () => {
  const own = read('tests/security/v217-current-source-ui.test.cjs');
  for (const file of PORTED) assert.match(own, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('status, health, and the shared shell still expose the current toggle and chips', () => {
  const status = read('status/status.html');
  const health = read('status/health.html');
  const reports = read('status/reports.html');
  const shared = read('status/common.v215-dfd52e64df59.js');
  for (const html of [status, health]) {
    assert.match(html, /id="calliopeOpen"/);
    assert.match(html, /aria-pressed="false"/);
  }
  assert.match(status, /id="aiDrawer"/);
  assert.match(status, /ai-drawer collapsed/);
  assert.match(status, /id="aiHealingHistory"/);
  assert.match(status, /id="aiHealingStatus"/);
  assert.match(reports, /common\.v215-dfd52e64df59\.js/);
  assert.match(shared, /id="calliopeOpen"/);
  assert.match(shared, /id="aiHealingStatus"/);
  assert.match(shared, /aria-pressed/);
  assert.match(status, /Dev Tunnel Proxy/);
});

test('the UI runner refuses a missing or owner-host base URL', () => {
  assert.throws(() => assertIsolatedBaseUrl(undefined), /UI_BASE_URL/);
  assert.throws(() => assertIsolatedBaseUrl('http://localhost:8080'), /127\.0\.0\.1/);
  assert.equal(assertIsolatedBaseUrl('http://127.0.0.1:9'), 'http://127.0.0.1:9');
  assert.match(read('test/ui/playwright.config.ts'), /assertIsolatedBaseUrl\(process\.env\.UI_BASE_URL\)/);
});
