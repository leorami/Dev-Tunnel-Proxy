'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateBridgeContainmentPreflight,
  evaluateBridgeContainmentAfter,
} = require('../../utils/notification-bridge-containment-policy.cjs');

const BRIDGE = 'com.leorami.devtunnelproxy.notifications.bridge';
const ENGINE = 'com.leorami.devtunnelproxy.notifications';
function snapshot() {
  return {
    ownerUid: 501,
    listener: { address: '127.0.0.1', port: 17888, count: 1, pid: 9401 },
    process: {
      pid: 9401, uid: 501, startedAt: '2026-11-05T18:33:01Z',
      executable: '/opt/homebrew/bin/node',
      script: '/Users/test/source/macos/notifications-bridge.js',
    },
    supervisor: {
      state: 'NONE_VERIFIED', label: null, domain: null, pid: null,
      inspectionComplete: true,
    },
    protected: { notificationsEnginePid: 9201, macWorkerPid: 9301 },
  };
}
test('RED: unique, owned, unsupervised bridge permits only exact graceful stop', () => {
  const got = evaluateBridgeContainmentPreflight(snapshot());
  assert.equal(got.code, 'BRIDGE_CONTAINMENT_READY_UNSUPERVISED');
  assert.equal(got.targetPid, 9401);
  assert.equal(got.intendedAction, 'GRACEFUL_SIGTERM_EXACT_BRIDGE_ONLY');
  assert.equal(got.requiresIndependentOwnerGrant, true);
  assert.equal(got.noEffectsPerformed, true);
  assert.equal(Object.isFrozen(got), true);
});
test('RED: matched per-user bridge job may be booted out, never the notifications engine', () => {
  const input = snapshot();
  input.supervisor = {
    state: 'MATCHED_BRIDGE_JOB', label: BRIDGE, domain: 'gui/501',
    pid: 9401, inspectionComplete: true,
  };
  const got = evaluateBridgeContainmentPreflight(input);
  assert.equal(got.code, 'BRIDGE_CONTAINMENT_READY_MATCHED_JOB');
  assert.equal(got.intendedAction, 'BOOTOUT_EXACT_BRIDGE_JOB_THEN_RECHECK');
  assert.equal(got.targetLabel, BRIDGE);
  assert.notEqual(got.targetLabel, ENGINE);
});
test('RED: ambiguous, multiple and non-loopback listeners are NO_GO', () => {
  for (const bad of [
    { count: 2 }, { count: 0 }, { count: -1 }, { pid: 0 },
    { port: 8080 }, { address: '0.0.0.0' }, { address: '::1' },
  ]) {
    const x = snapshot(); Object.assign(x.listener, bad);
    assert.equal(evaluateBridgeContainmentPreflight(x).code, 'BRIDGE_CONTAINMENT_NO_GO');
  }
});
test('RED: PID, start-time, ownership and script drift cannot target other processes', () => {
  for (const mutation of [
    x => { x.process.pid = 999; },
    x => { x.process.uid = 0; },
    x => { x.process.startedAt = ''; },
    x => { x.process.script = '/Users/test/source/macos/notifications-engine.js'; },
    x => { x.process.script = '/Users/test/source/macos/../notifications-bridge.js'; },
    x => { x.process.executable = '/usr/bin/python3'; },
    x => { x.listener.pid = x.protected.notificationsEnginePid; },
    x => { x.listener.pid = x.protected.macWorkerPid; },
  ]) {
    const x = snapshot(); mutation(x);
    assert.equal(evaluateBridgeContainmentPreflight(x).code, 'BRIDGE_CONTAINMENT_NO_GO');
  }
});
test('RED: unknown supervisor or job mismatch cannot authorize launchctl changes', () => {
  for (const supervisor of [
    { state: 'UNKNOWN', label: null, domain: null, pid: null, inspectionComplete: false },
    { state: 'MATCHED_BRIDGE_JOB', label: ENGINE, domain: 'gui/501', pid: 9401, inspectionComplete: true },
    { state: 'MATCHED_BRIDGE_JOB', label: BRIDGE, domain: 'gui/502', pid: 9401, inspectionComplete: true },
    { state: 'MATCHED_BRIDGE_JOB', label: BRIDGE, domain: 'gui/501', pid: 9201, inspectionComplete: true },
    { state: 'NONE_VERIFIED', label: BRIDGE, domain: 'gui/501', pid: 9401, inspectionComplete: true },
    { state: 'NONE_VERIFIED', label: null, domain: null, pid: null, inspectionComplete: false },
  ]) {
    const x = snapshot(); x.supervisor = supervisor;
    assert.equal(evaluateBridgeContainmentPreflight(x).code, 'BRIDGE_CONTAINMENT_NO_GO');
  }
});
test('RED: a second inspection must exactly match process identity before execution', () => {
  const before = snapshot(); const after = snapshot();
  assert.equal(evaluateBridgeContainmentPreflight(after, before).code, 'BRIDGE_CONTAINMENT_READY_UNSUPERVISED');
  after.process.startedAt = '2026-11-07T12:00:00Z';
  assert.equal(evaluateBridgeContainmentPreflight(after, before).code, 'BRIDGE_CONTAINMENT_NO_GO');
});
test('RED: proof of zero listener, stability and unchanged protected services is required to close', () => {
  const after = { bridgeListenerCount: 0, remainedAbsentSeconds: 20,
    protectedServiceIdentityUnchanged: true, bridgeJobNotAutoRestarting: true };
  const good = evaluateBridgeContainmentAfter(after);
  assert.equal(good.code, 'BRIDGE_CONTAINED_VERIFIED');
  assert.equal(good.noEffectsPerformed, true);
  assert.equal(Object.isFrozen(good), true);
  for (const bad of [
    { bridgeListenerCount: 1 }, { remainedAbsentSeconds: 1 },
    { protectedServiceIdentityUnchanged: false },
    { bridgeJobNotAutoRestarting: false },
  ]) assert.equal(evaluateBridgeContainmentAfter({ ...after, ...bad }).code,
    'BRIDGE_CONTAINMENT_UNVERIFIED');
});
test('RED: malformed and accessor-controlled observations fail closed', () => {
  for (const x of [null, {}, [], new Date(), { ...snapshot(), unexpected: true }]) {
    assert.equal(evaluateBridgeContainmentPreflight(x).code, 'BRIDGE_CONTAINMENT_NO_GO');
  }
  const x = snapshot(); let accessed = false;
  Object.defineProperty(x.process, 'pid', {
    enumerable: true, get() { accessed = true; throw Error('NO_GETTER'); },
  });
  assert.equal(evaluateBridgeContainmentPreflight(x).code, 'BRIDGE_CONTAINMENT_NO_GO');
  assert.equal(accessed, false);
});
