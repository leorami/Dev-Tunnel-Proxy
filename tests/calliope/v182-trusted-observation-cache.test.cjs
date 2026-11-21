'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createTrustedObservationCache,
  OBSERVATION_TTL_MS,
  MAX_OBSERVATION_SESSIONS,
} = require('../../utils/calliope-trusted-observation-cache.cjs');

const key = (i) => i.toString(16).padStart(40, '0');
const observed = (route = '/demo/', status = 503) => ({
  route, status,
  code: status >= 200 && status < 300 ? 'LOCAL_HTTP_OK' : 'LOCAL_HTTP_NOT_GREEN',
  mode: 'LOCAL_HTTP_HEAD_ONLY',
  redirectFollowed: false,
  healingPerformed: false,
});

test('fresh trusted 503 gets SERVER time, never attacker-supplied age or heal authority', () => {
  let now = 1000000;
  const cache = createTrustedObservationCache({now: () => now});
  const candidate = {...observed(), at: now + 5000000};
  assert.equal(cache.record(key(1), candidate), true);
  const row = cache.read(key(1));
  assert.equal(row.at, now);
  assert.equal(row.route, '/demo/');
  assert.equal(row.status, 503);
  assert.equal(row.healingPerformed, false);
  assert.equal(row.redirectFollowed, false);
  assert.ok(Object.isFrozen(row));
  now += OBSERVATION_TTL_MS - 1;
  assert.equal(cache.read(key(1))?.status, 503);
  now += 1;
  assert.equal(cache.read(key(1)), null);
});

test('clock rollback purges old assertions rather than making them live forever', () => {
  let now = 4000000;
  const cache = createTrustedObservationCache({now: () => now});
  assert.equal(cache.record(key(1), observed()), true);
  now -= 1;
  assert.equal(cache.read(key(1)), null);
});

test('failed or unsafe new HEAD replaces prior status, never silently retains old 503', () => {
  const cache = createTrustedObservationCache({now: () => 1000});
  assert.equal(cache.record(key(1), observed()), true);
  assert.equal(cache.record(key(1), null), false);
  assert.equal(cache.read(key(1)), null);
  assert.equal(cache.record(key(1), observed()), true);
  assert.equal(cache.record(key(1), observed('/admin/secrets', 503)), false);
  assert.equal(cache.read(key(1)), null);
});

test('bounded cross-session isolation, oldest eviction and explicit logout deletion', () => {
  const cache = createTrustedObservationCache({now: () => 1000});
  assert.equal(cache.record('browser-supplied-owner-id', observed()), false);
  for (let i = 1; i <= MAX_OBSERVATION_SESSIONS + 3; i++) {
    assert.equal(cache.record(key(i), observed('/demo/', 503)), true);
  }
  assert.equal(cache.read(key(1)), null);
  assert.equal(cache.read(key(4))?.status, 503);
  assert.equal(cache.read(key(MAX_OBSERVATION_SESSIONS + 3))?.status, 503);
  cache.invalidate(key(4));
  assert.equal(cache.read(key(4)), null);
  assert.equal(cache.read(key(5))?.status, 503);
});
