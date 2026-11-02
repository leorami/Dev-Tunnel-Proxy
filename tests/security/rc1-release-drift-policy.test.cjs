'use strict';
// CTO RED-first guard: inert metadata fixtures only. No Docker, network or owner files.
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessReleaseMutationPlan}=require('../../utils/rc1-release-drift-policy.cjs');
const SHA='d89c962fb31a962a518f331bae458e63708e7e86';
const healthy=()=>({
  attested:true, liveSource:'accepted_rc1', proxyImage:'accepted_rc1',
  publicHealth:'minimal', anonymousRoutes:'denied',
  managementPorts:'loopback', apiDockerSocket:'rw',
  privateConfigPreserved:true, routeFingerprintPreserved:true
});
const proposal=()=>({
  sourceSha:SHA, exactPrivateMounts:true, sharedConfigDigest:true,
  trustedOriginsPreserved:true, rollbackReady:true, verifiedDisposable:true
});
const check=(action, live=healthy(), candidate=proposal())=>assessReleaseMutationPlan({action,live,candidate});

test('R0 observed drift cannot be approved by any ordinary smart-build mutation',()=>{
  const live={...healthy(),liveSource:'owner_checkout',proxyImage:'different',
    publicHealth:'full_report',anonymousRoutes:'open',managementPorts:'all_interfaces'};
  for(const action of ['up','restart','apply']){
    const result=check(action,live);
    assert.equal(result.code,'P0_DRIFT_BLOCKED',action);
    assert.equal(result.productionChangeAuthorized,false);
    assert.equal(result.mutationAllowed,false);
  }
});

test('default checkout Compose is not a safe replacement for an installed protected RC1 overlay',()=>{
  const candidate={...proposal(),sourceSha:'62a4d7babae986ade1feb0fd6dbe7dd32532523a',
    exactPrivateMounts:false,sharedConfigDigest:false,trustedOriginsPreserved:false};
  const result=check('up',healthy(),candidate);
  assert.equal(result.code,'REPLACEMENT_PLAN_BLOCKED');
  assert.equal(result.mutationAllowed,false);
});

test('verified RC1-compatible candidate is only a plan, never automatic production authorization',()=>{
  const result=check('apply');
  assert.equal(result.code,'PLAN_COMPATIBLE_OWNER_GATE');
  assert.equal(result.productionChangeAuthorized,false);
  assert.equal(result.mutationAllowed,false);
});

test('missing observations and untrusted metadata fail closed',()=>{
  for(const live of [null,{}, {...healthy(),attested:false}, {...healthy(),anonymousRoutes:'unknown'}]){
    const result=check('restart',live);
    assert.equal(result.mutationAllowed,false);
    assert.notEqual(result.code,'PLAN_COMPATIBLE_OWNER_GATE');
  }
});

test('missing candidate rollback/provenance/continuity fails closed',()=>{
  for(const field of ['exactPrivateMounts','sharedConfigDigest','trustedOriginsPreserved','rollbackReady','verifiedDisposable']){
    const candidate={...proposal(),[field]:false};
    const result=check('apply',healthy(),candidate);
    assert.equal(result.code,'REPLACEMENT_PLAN_BLOCKED',field);
    assert.equal(result.mutationAllowed,false);
  }
});

test('unsupported command and suspicious metadata cannot authorize change',()=>{
  for(const action of ['down','deploy','',null,{'x':'up'}]){
    const result=check(action);
    assert.equal(result.code,'INVALID_INPUT');
    assert.equal(result.mutationAllowed,false);
  }
});

test('pure policy may not ingest secrets, source paths or container inspect JSON',()=>{
  const input={action:'up',live:{...healthy(),rawDockerInspect:{Mounts:[]}},candidate:proposal()};
  const result=assessReleaseMutationPlan(input);
  assert.equal(result.code,'INVALID_INPUT');
  assert.equal(result.mutationAllowed,false);
  assert.doesNotMatch(JSON.stringify(result),/Mounts|\/Users\/|token|password/i);
});
