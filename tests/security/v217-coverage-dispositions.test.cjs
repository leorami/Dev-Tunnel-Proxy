'use strict';

// Every historical test under test/ has one disposition. A blocked file is not a pass.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/release-lanes.json'), 'utf8'));
const { EXECUTED, PORTED, SUPERSEDED, BLOCKED } = require('./fixtures/v217-dispositions.cjs');

function laneFiles(lane) {
  return manifest.lanes[lane].map((entry) => (typeof entry === 'string' ? entry : entry.path));
}

test('pure unit files run in the pure-node lane and are not blocked', () => {
  const pure = new Set(laneFiles('pure-node'));
  const blocked = new Set(laneFiles('blocked-capability'));
  for (const file of EXECUTED) {
    assert.equal(pure.has(file), true, file);
    assert.equal(blocked.has(file), false, file);
  }
  assert.deepEqual(manifest.lanes['blocked-capability'], BLOCKED);
});

test('blocked entries name a disposition, the original tests, and evidence', () => {
  const allowed = new Set(['ported', 'superseded', 'manual', 'capability-blocked']);
  const seen = new Set();
  for (const entry of manifest.lanes['blocked-capability']) {
    assert.equal(seen.has(entry.path), false, entry.path);
    seen.add(entry.path);
    assert.equal(allowed.has(entry.disposition), true, entry.path);
    assert.ok(Array.isArray(entry.originalTests) && entry.originalTests.length > 0, entry.path);
    assert.equal(entry.originalTests.every((name) => typeof name === 'string' && name.length > 3), true, entry.path);
    assert.equal(fs.existsSync(path.join(ROOT, entry.evidence)), true, entry.evidence);
    assert.notEqual(entry.reason, 'Historical manual, browser, or live-app diagnostic. It is not an isolated release test. V216 does not run it and does not point it at the owner.');
    const evidence = fs.readFileSync(path.join(ROOT, entry.evidence), 'utf8');
    assert.match(evidence, new RegExp(entry.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    if (entry.disposition === 'capability-blocked') {
      assert.equal(typeof entry.capability, 'string', entry.path);
      assert.ok(entry.capability.length > 40, entry.path);
      assert.match(evidence, new RegExp(entry.capability.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    if (entry.disposition === 'superseded') {
      assert.equal(SUPERSEDED.includes(entry.path), true, entry.path);
      assert.match(fs.readFileSync(path.join(ROOT, 'tests/security/v162-secure-dashboard-truthful-actions.test.cjs'), 'utf8'), /LEGACY_UNSETTLED_MANAGEMENT_BLOCKED/);
    }
    if (entry.disposition === 'ported') {
      assert.match(evidence, /calliopeOpen/);
    }
  }
  assert.deepEqual([...seen].filter((file) => SUPERSEDED.includes(file)).sort(), [...SUPERSEDED].sort());
  assert.deepEqual([...seen].filter((file) => PORTED.includes(file)).sort(), [...PORTED].sort());
});

test('superseded heal expectations are the current secure-mode refusal', () => {
  const blocked = manifest.lanes['blocked-capability'];
  for (const file of SUPERSEDED) {
    const entry = blocked.find((item) => item.path === file);
    assert.equal(entry.disposition, 'superseded', file);
    assert.match(entry.reason, /secure/);
  }
});
