'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/release-lanes.json'), 'utf8'));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__pycache__') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

function discovered() {
  const found = [];
  for (const rel of walk(path.join(ROOT, 'tests/security'))) {
    if (/\.test\.(cjs|mjs)$/.test(rel)) found.push(path.relative(ROOT, rel));
  }
  for (const rel of walk(path.join(ROOT, 'tests/docs'))) {
    if (/\.(cjs|mjs)$/.test(rel)) found.push(path.relative(ROOT, rel));
  }
  for (const rel of walk(path.join(ROOT, 'tests/visuals'))) {
    if (/\/test_.*\.py$/.test(`/${rel}`)) found.push(path.relative(ROOT, rel));
  }
  for (const rel of walk(path.join(ROOT, 'test'))) {
    const name = path.relative(ROOT, rel);
    if (/^test\/ui\/tests\/.+\.spec\.ts$/.test(name)) found.push(name);
    else if (/^test\/[^/]+\.js$/.test(name)) found.push(name);
    else if (/^test\/(e2e|integration|unit)\/.+\.test\.js$/.test(name)) found.push(name);
  }
  return found.sort();
}

test('every discovered test is in exactly one release lane', () => {
  const files = discovered();
  const lanes = manifest.lanes;
  assert.equal(manifest.version, 1);
  const assigned = [];
  for (const [lane, entries] of Object.entries(lanes)) {
    assert.ok(['pure-node', 'nginx-fixture', 'libsignal-native', 'browser', 'blocked-capability'].includes(lane), lane);
    for (const entry of entries) {
      const file = typeof entry === 'string' ? entry : entry.path;
      assigned.push(file);
      assert.equal(fs.existsSync(path.join(ROOT, file)), true, file);
      if (lane === 'blocked-capability') {
        assert.equal(typeof entry.reason, 'string');
        assert.ok(entry.reason.length > 20, file);
        assert.equal(file.startsWith('tests/security/'), false, file);
      }
    }
  }
  assigned.sort();
  assert.deepEqual(assigned, files);
  assert.equal(new Set(assigned).size, assigned.length);
});

test('the nginx lane is the real fixture files and security tests are not blocked', () => {
  assert.deepEqual(manifest.lanes['nginx-fixture'].slice().sort(), [
    'tests/security/v171-four-auth-prefix-nginx.test.cjs',
    'tests/security/v190-eight-api-native-nginx.test.cjs',
    'tests/security/v215-frontend-install-nginx.test.cjs',
    'tests/security/v216-frontend-install-nginx.test.cjs',
  ]);
  const security = discovered().filter((file) => file.startsWith('tests/security/'));
  assert.ok(security.length >= 176);
  const blocked = new Set(manifest.lanes['blocked-capability'].map((entry) => entry.path));
  assert.deepEqual(security.filter((file) => blocked.has(file)), []);
});
