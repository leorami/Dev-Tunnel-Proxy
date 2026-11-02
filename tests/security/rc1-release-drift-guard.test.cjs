'use strict';
// Fixture-only guard tests. No live Docker mutation; injectable attestations only.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runPremutationGuard,
  isDisposableStack,
  defaultCandidate,
  RELEASE_SHA,
} = require('../../utils/rc1-release-drift-attest.cjs');

const driftedLive = () => ({
  attested: true,
  liveSource: 'owner_checkout',
  proxyImage: 'different',
  publicHealth: 'full_report',
  anonymousRoutes: 'open',
  managementPorts: 'all_interfaces',
  apiDockerSocket: 'rw',
  privateConfigPreserved: true,
  routeFingerprintPreserved: true,
});

const healthyLive = () => ({
  attested: true,
  liveSource: 'accepted_rc1',
  proxyImage: 'accepted_rc1',
  publicHealth: 'minimal',
  anonymousRoutes: 'denied',
  managementPorts: 'loopback',
  apiDockerSocket: 'rw',
  privateConfigPreserved: true,
  routeFingerprintPreserved: true,
});

test('disposable isolated project identity is required for DEVPROXY_DISPOSABLE_STACK', () => {
  assert.equal(isDisposableStack({ DEVPROXY_DISPOSABLE_STACK: '1', COMPOSE_PROJECT_NAME: 'dev-tunnel-proxy' }), false);
  assert.equal(isDisposableStack({ DEVPROXY_DISPOSABLE_STACK: '1', COMPOSE_PROJECT_NAME: 'rc1driftfix' }), true);
  assert.equal(isDisposableStack({ DEVPROXY_DISPOSABLE_STACK: '0', COMPOSE_PROJECT_NAME: 'rc1driftfix' }), false);
});

test('R0-shaped live drift blocks up/restart/apply/down even with a perfect candidate', async () => {
  const candidate = {
    sourceSha: RELEASE_SHA,
    exactPrivateMounts: true,
    sharedConfigDigest: true,
    trustedOriginsPreserved: true,
    rollbackReady: true,
    verifiedDisposable: true,
  };
  for (const action of ['up', 'restart', 'apply', 'down']) {
    const result = await runPremutationGuard(action, { live: driftedLive(), candidate });
    assert.equal(result.mutationAllowed, false, action);
    assert.equal(result.productionChangeAuthorized, false);
    assert.equal(result.code, 'P0_DRIFT_BLOCKED');
  }
});

test('healthy RC1 live still requires owner gate — never auto-mutates', async () => {
  const candidate = {
    sourceSha: RELEASE_SHA,
    exactPrivateMounts: true,
    sharedConfigDigest: true,
    trustedOriginsPreserved: true,
    rollbackReady: true,
    verifiedDisposable: true,
  };
  const result = await runPremutationGuard('apply', { live: healthyLive(), candidate });
  assert.equal(result.mutationAllowed, false);
  assert.equal(result.productionChangeAuthorized, false);
  assert.equal(result.code, 'OWNER_GATE_REQUIRED');
});

test('missing attestation fails closed', async () => {
  const live = {
    attested: false,
    liveSource: 'unknown',
    proxyImage: 'unknown',
    publicHealth: 'unknown',
    anonymousRoutes: 'unknown',
    managementPorts: 'unknown',
    apiDockerSocket: 'unknown',
    privateConfigPreserved: false,
    routeFingerprintPreserved: false,
  };
  const result = await runPremutationGuard('restart', {
    live,
    candidate: defaultCandidate('/tmp', {}),
  });
  assert.equal(result.mutationAllowed, false);
  assert.ok(['EVIDENCE_INCOMPLETE', 'INVALID_INPUT', 'P0_DRIFT_BLOCKED'].includes(result.code));
});

test('management ports all_interfaces is enough to block with other R0 fields', async () => {
  const live = { ...driftedLive(), managementPorts: 'all_interfaces' };
  const result = await runPremutationGuard('up', {
    live,
    candidate: {
      sourceSha: RELEASE_SHA,
      exactPrivateMounts: true,
      sharedConfigDigest: true,
      trustedOriginsPreserved: true,
      rollbackReady: true,
      verifiedDisposable: true,
    },
  });
  assert.equal(result.code, 'P0_DRIFT_BLOCKED');
});

test('disposable stack short-circuits without authorizing production when live names are absent', async () => {
  const result = await runPremutationGuard('up', {
    env: { DEVPROXY_DISPOSABLE_STACK: '1', COMPOSE_PROJECT_NAME: 'devproxy-test-drift' },
    liveContainersPresent: false,
    live: driftedLive(),
  });
  assert.equal(result.code, 'DISPOSABLE_STACK_ALLOWED');
  assert.equal(result.mutationAllowed, true);
  assert.equal(result.productionChangeAuthorized, false);
});

test('disposable bypass refuses while live dev-proxy containers exist', async () => {
  const result = await runPremutationGuard('up', {
    env: { DEVPROXY_DISPOSABLE_STACK: '1', COMPOSE_PROJECT_NAME: 'devproxy-test-drift' },
    liveContainersPresent: true,
  });
  assert.equal(result.code, 'DISPOSABLE_COLLIDES_WITH_LIVE');
  assert.equal(result.mutationAllowed, false);
  assert.equal(result.productionChangeAuthorized, false);
});
