'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessSecureRollback, ACCEPTED_RC1_SHA } = require('../../utils/rc1-secure-rollback-contract.cjs');
const SECURE_IMAGE = 'sha256:' + 'a'.repeat(64);
const LEGACY_IMAGE = 'sha256:' + 'b'.repeat(64);
const CFG = 'c'.repeat(64);
const ROUTES = 'd'.repeat(64);
const MOUNTS = 'e'.repeat(64);
const origins = 'f'.repeat(64);
const secureBaseline = () => ({
  attestedFromApprovedRelease: true,
  sourceSha: ACCEPTED_RC1_SHA,
  proxyImageId: SECURE_IMAGE,
  nginxConfigSha256: CFG,
  routesSha256: ROUTES,
  mountsSha256: MOUNTS,
  trustedOriginsSha256: origins,
});
const fallback = () => ({
  sourceSha: ACCEPTED_RC1_SHA,
  proxyImageId: SECURE_IMAGE,
  nginxConfigSha256: CFG,
  routesSha256: ROUTES,
  mountsSha256: MOUNTS,
  trustedOriginsSha256: origins,
  minimalHealth: true,
  routesPrivate: true,
  artifactsPrivate: true,
  adminPasswordDisclosureAbsent: true,
  directApiLoopbackOnly: true,
  notificationsLoopbackOnly: true,
  browserOriginPolicyApplied: true,
  rollbackTestedWithinBudget: true,
  trustedReadOnlyRuntimeAttestation: true,
  ownerAdminCredentialPreserved: true,
  activeSessionsPreserved: true,
});
const run = (o = {}) => assessSecureRollback({
  secureBaseline: secureBaseline(),
  proposedFallback: fallback(),
  legacyImageId: LEGACY_IMAGE,
  ...o,
});
const denied = x => { assert.equal(x.securitySafe, false); assert.equal(x.productionChangeAuthorized, false); assert.equal(x.performedActions, false); };
test('complete synthetic approved RC1-equivalent fallback is PLAN_ONLY and never a deployment GO', () => {
  const x = run();
  assert.equal(x.code, 'RC1_SECURITY_MATCH_PLAN_ONLY');
  assert.equal(x.securitySafe, false);
  assert.equal(x.rc1MatchedMetadata, true);
  assert.equal(x.productionChangeAuthorized, false);
  assert.equal(x.performedActions, false);
});
test('pre-RC1 image is an availability fallback, never a confidentiality-safe rollback', () => {
  const x = run({ proposedFallback: {...fallback(), proxyImageId: LEGACY_IMAGE} });
  denied(x);
  assert.equal(x.code, 'LEGACY_AVAILABILITY_FALLBACK_INSECURE');
});
test('unrecognized different image also cannot pass', () => {
  const x=run({proposedFallback:{...fallback(),proxyImageId:'sha256:'+'9'.repeat(64)}});
  denied(x); assert.equal(x.code,'SECURITY_BASELINE_MISMATCH');
});
test('separate API and nginx config parity and mounts are required', () => {
  for(const key of ['nginxConfigSha256','routesSha256','mountsSha256','trustedOriginsSha256','sourceSha']) {
    const x=run({proposedFallback:{...fallback(),[key]:key==='sourceSha'?'0'.repeat(40):'0'.repeat(64)}});
    denied(x); assert.equal(x.code,'SECURITY_BASELINE_MISMATCH',key);
  }
});
test('no claims can bypass missing explicit confidentiality assertions', () => {
  for(const key of ['minimalHealth','routesPrivate','artifactsPrivate','adminPasswordDisclosureAbsent',
    'directApiLoopbackOnly','notificationsLoopbackOnly','browserOriginPolicyApplied',
    'rollbackTestedWithinBudget','trustedReadOnlyRuntimeAttestation']) {
    for(const value of [false, undefined]){
      const x=run({proposedFallback:{...fallback(),[key]:value}});
      denied(x); assert.equal(x.code,'EVIDENCE_INCOMPLETE',key+'='+value);
    }
  }
});
test('a synthetic staging password or unverified sessions cannot be called a secure fallback', () => {
  for(const key of ['ownerAdminCredentialPreserved','activeSessionsPreserved']) {
    const x=run({proposedFallback:{...fallback(),[key]:false}});
    denied(x);
    assert.equal(x.code,'EVIDENCE_INCOMPLETE',key);
  }
});
test('untrusted baseline is never allowed to prove itself', () => {
  const x=run({secureBaseline:{...secureBaseline(),attestedFromApprovedRelease:false}});
  denied(x); assert.equal(x.code,'UNTRUSTED_SECURE_BASELINE');
});
test('untrusted SHA/product source is blocked', () => {
  const x=run({secureBaseline:{...secureBaseline(),sourceSha:'0'.repeat(40)}});
  denied(x); assert.equal(x.code,'UNTRUSTED_SECURE_BASELINE');
});
test('missing baseline, fallback, or legacy ID fails closed', () => {
  for(const v of [{secureBaseline:null},{proposedFallback:null},{legacyImageId:null},{}]) {
    const x=v.secureBaseline===undefined&&v.proposedFallback===undefined&&v.legacyImageId===undefined?assessSecureRollback({}):run(v);
    denied(x); assert.notEqual(x.code,'RC1_SECURITY_MATCH_PLAN_ONLY');
  }
});
test('unexpected fields (including raw secrets, inspect, paths) are refused without echo', () => {
  for(const field of ['secret','ngrokToken','rawDockerInspect','rawMountPath']){
    const x=run({proposedFallback:{...fallback(),[field]:'SENSITIVE_MUST_NOT_ECHO'}});
    denied(x); assert.equal(x.code,'INVALID_EVIDENCE');
    assert.doesNotMatch(JSON.stringify(x),/SENSITIVE_MUST_NOT_ECHO/);
  }
});
test('accessor traps are not invoked', () => {
  const f=fallback(); Object.defineProperty(f,'routesSha256',{enumerable:true,get(){throw new Error('TOUCHED_SECRET');}});
  const x=run({proposedFallback:f}); denied(x); assert.equal(x.code,'INVALID_EVIDENCE');
});
test('array and prototype pollution shaped evidence fails closed', () => {
  for(const x of [[], Object.assign(Object.create({adminPasswordDisclosureAbsent:true}),fallback())]){
    const result=run({proposedFallback:x}); denied(result); assert.equal(result.code,'INVALID_EVIDENCE');
  }
});
test('mutating caller fields does not affect immutable result', () => {
  const x=run(); assert.equal(Object.isFrozen(x),true);
  assert.throws(()=>{x.code='AUTH';},TypeError);
});
