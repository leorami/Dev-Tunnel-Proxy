'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveAttestedSourceSha,
  selectGrantSourceSha,
} = require('../../utils/cto-observer-source-attestation.cjs');

const SHA = '952aa2625990f8da60784a8c6a63759b47b43569';

test('resolveAttestedSourceSha reads only exact 40-hex env values', () => {
  assert.equal(resolveAttestedSourceSha({}), null);
  assert.equal(resolveAttestedSourceSha({ DEVPROXY_SOURCE_SHA: 'short' }), null);
  assert.equal(resolveAttestedSourceSha({ DEVPROXY_SOURCE_SHA: SHA }), SHA);
  assert.equal(resolveAttestedSourceSha({ DEVPROXY_GIT_SHA: SHA }), SHA);
});

test('selectGrantSourceSha never trusts mismatched caller SHA', () => {
  assert.equal(selectGrantSourceSha({
    attestedSourceSha: SHA,
    requestedSourceSha: 'f'.repeat(40),
  }).ok, false);
  assert.deepEqual(selectGrantSourceSha({
    attestedSourceSha: SHA,
  }), { ok: true, sourceSha: SHA });
});
