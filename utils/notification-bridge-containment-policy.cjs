'use strict';
/**
 * Pure preflight/after gates for ONE authorized macOS notification-bridge
 * containment. No process signals, launchctl, network, tokens or filesystem.
 * The separate owner's grant and a just-in-time second live identity check
 * are mandatory; a READY result is never an execution authorization.
 */
const path = require('node:path');
const LABEL = 'com.leorami.devtunnelproxy.notifications.bridge';
const ADDRESS = '127.0.0.1';
const PORT = 17888;
const SNAP_FIELDS = ['ownerUid', 'listener', 'process', 'supervisor', 'protected'];
const LISTENER_FIELDS = ['address', 'port', 'count', 'pid'];
const PROCESS_FIELDS = ['pid', 'uid', 'startedAt', 'executable', 'script'];
const JOB_FIELDS = ['state', 'label', 'domain', 'pid', 'inspectionComplete'];
const PROTECTED_FIELDS = ['notificationsEnginePid', 'macWorkerPid'];
const AFTER_FIELDS = ['bridgeListenerCount', 'remainedAbsentSeconds',
  'protectedServiceIdentityUnchanged', 'bridgeJobNotAutoRestarting'];
function result(code, extras = {}) {
  return Object.freeze({ code, noEffectsPerformed: true, readOnly: true,
    requiresIndependentOwnerGrant: true, ...extras });
}
function exactOwnData(o, fields) {
  try {
    if (!o || typeof o !== 'object' || Array.isArray(o) ||
        Object.getPrototypeOf(o) !== Object.prototype) return false;
    const keys = Reflect.ownKeys(o);
    if (keys.length !== fields.length || !fields.every(k => keys.includes(k))) return false;
    return fields.every(k => {
      const descriptor = Object.getOwnPropertyDescriptor(o, k);
      return descriptor && Object.hasOwn(descriptor, 'value');
    });
  } catch { return false; }
}
function positivePid(n) { return Number.isSafeInteger(n) && n > 1; }
function validUid(n) { return Number.isSafeInteger(n) && n >= 1; }
function canonicalFile(file, suffix) {
  return typeof file === 'string' && file.length < 1024 &&
    file.startsWith('/') && path.posix.normalize(file) === file &&
    !file.split('/').includes('..') && !file.split('/').includes('.') &&
    !/[\x00-\x1f\x7f]/.test(file) && file.endsWith(suffix);
}
function validated(x) {
  if (!exactOwnData(x, SNAP_FIELDS) ||
      !exactOwnData(x.listener, LISTENER_FIELDS) ||
      !exactOwnData(x.process, PROCESS_FIELDS) ||
      !exactOwnData(x.supervisor, JOB_FIELDS) ||
      !exactOwnData(x.protected, PROTECTED_FIELDS)) return false;
  const { listener: l, process: p, supervisor: s, protected: protectedIds } = x;
  if (!validUid(x.ownerUid) || l.address !== ADDRESS || l.port !== PORT ||
      l.count !== 1 || !positivePid(l.pid) ||
      p.pid !== l.pid || p.uid !== x.ownerUid ||
      typeof p.startedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(p.startedAt) ||
      !Number.isFinite(Date.parse(p.startedAt)) ||
      !canonicalFile(p.executable, '/node') ||
      !canonicalFile(p.script, '/macos/notifications-bridge.js') ||
      ![protectedIds.notificationsEnginePid, protectedIds.macWorkerPid].every(
        n => n === null || positivePid(n)) ||
      l.pid === protectedIds.notificationsEnginePid ||
      l.pid === protectedIds.macWorkerPid ||
      s.inspectionComplete !== true) return false;
  if (s.state === 'NONE_VERIFIED') {
    return s.label === null && s.domain === null && s.pid === null;
  }
  if (s.state === 'MATCHED_BRIDGE_JOB') {
    return s.label === LABEL && s.domain === 'gui/' + x.ownerUid && s.pid === l.pid;
  }
  return false;
}
function sameIdentity(x, previous) {
  return x.ownerUid === previous.ownerUid &&
    x.listener.address === previous.listener.address &&
    x.listener.port === previous.listener.port &&
    x.listener.count === previous.listener.count &&
    x.listener.pid === previous.listener.pid &&
    x.process.pid === previous.process.pid &&
    x.process.uid === previous.process.uid &&
    x.process.startedAt === previous.process.startedAt &&
    x.process.executable === previous.process.executable &&
    x.process.script === previous.process.script &&
    x.supervisor.state === previous.supervisor.state &&
    x.supervisor.label === previous.supervisor.label &&
    x.supervisor.domain === previous.supervisor.domain &&
    x.supervisor.pid === previous.supervisor.pid &&
    x.protected.notificationsEnginePid === previous.protected.notificationsEnginePid &&
    x.protected.macWorkerPid === previous.protected.macWorkerPid;
}
function evaluateBridgeContainmentPreflight(observation, earlier = null) {
  try {
    if (!validated(observation) ||
        (earlier !== null && (!validated(earlier) || !sameIdentity(observation, earlier)))) {
      return result('BRIDGE_CONTAINMENT_NO_GO');
    }
    if (observation.supervisor.state === 'MATCHED_BRIDGE_JOB') {
      return result('BRIDGE_CONTAINMENT_READY_MATCHED_JOB', {
        targetPid: observation.listener.pid, targetLabel: LABEL,
        intendedAction: 'BOOTOUT_EXACT_BRIDGE_JOB_THEN_RECHECK',
      });
    }
    return result('BRIDGE_CONTAINMENT_READY_UNSUPERVISED', {
      targetPid: observation.listener.pid,
      intendedAction: 'GRACEFUL_SIGTERM_EXACT_BRIDGE_ONLY',
    });
  } catch { return result('BRIDGE_CONTAINMENT_NO_GO'); }
}
function evaluateBridgeContainmentAfter(observation) {
  try {
    if (!exactOwnData(observation, AFTER_FIELDS) ||
        observation.bridgeListenerCount !== 0 ||
        !Number.isFinite(observation.remainedAbsentSeconds) ||
        observation.remainedAbsentSeconds < 20 ||
        observation.protectedServiceIdentityUnchanged !== true ||
        observation.bridgeJobNotAutoRestarting !== true) {
      return result('BRIDGE_CONTAINMENT_UNVERIFIED');
    }
    return result('BRIDGE_CONTAINED_VERIFIED');
  } catch { return result('BRIDGE_CONTAINMENT_UNVERIFIED'); }
}
module.exports = { evaluateBridgeContainmentPreflight, evaluateBridgeContainmentAfter };
