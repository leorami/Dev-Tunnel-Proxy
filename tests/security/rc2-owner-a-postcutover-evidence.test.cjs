'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessOwnerACutoverReceipt}=require('../../utils/rc2-owner-a-postcutover-evidence.cjs');
const SHA='a'.repeat(64),SHA_B='b'.repeat(64),SHA_C='c'.repeat(64),SHA_D='d'.repeat(64);
const ID='1'.repeat(64),ID2='2'.repeat(64),ID3='3'.repeat(64),ID4='4'.repeat(64);
const ID5='5'.repeat(64);
function fixture(){
 const before={
  proxyId:ID,apiId:ID2,ngrokId:ID3,bridgeFingerprint:SHA,
  ownerGitHead:'6'.repeat(40),ownerDirtyDigest:SHA_B,sourceDirty:true,
  routeSetDigest:SHA_C,routeCount:17,trustedOriginsDigest:SHA_D
 };
 const after={...before,proxyId:ID4,apiId:ID5};
 return {ownerScope:'A',ownerDecisionIssueComment:6669437050,phase:'POSTCUTOVER',
  before,after,originFive:{
   sourceCurrent:'PASS',singleRuntime:'PASS',noShadowApps:'PASS',
   realAppVerified:'PASS',ownerWorkPreserved:'PASS'
  },
  checks:{
   apiNonroot:true,apiReadOnlyRoot:true,noDockerSocket:true,
   nginxSyntaxAndBrotliVerified:true,anonymousMgmtDenied:true,
   authenticatedSessionPreserved:true,csrfAndOriginsVerified:true,
   localAskVerified:true,reviewedHealTicketVerified:true,
   externalModelAndEmbeddingDisabled:true,inlineDockerAutoHealDisabled:true,
   hmacHostWorkerVerified:true,loopbackManagementPorts:true,
   secureRollbackAvailable:true,onlyTwoServicesRecreated:true
  }
 };
}
const assess=()=>assessOwnerACutoverReceipt(fixture());
test('RED: complete redacted AFTER evidence is coherent but NEVER runtime attestation or release authority',()=>{
 const r=assess();assert.equal(r.code,'POSTCUTOVER_RECEIPT_COHERENT_REVIEW_ONLY');
 assert.equal(r.evidenceConsistent,true);
 for(const k of ['productionChangeAuthorized','performedActions','liveRuntimeIndependentlyVerified','ownerUatApproved'])
  assert.equal(r[k],false);
 assert.equal(r.deploymentStatus,'UNATTESTED');
 assert.deepEqual(Object.keys(r).sort(),
  ['code','evidenceConsistent','productionChangeAuthorized','performedActions',
   'liveRuntimeIndependentlyVerified','ownerUatApproved','deploymentStatus'].sort());
});
test('RED: reject scope B and forged owner approval reference',()=>{
 for(const v of ['B','C',true,null]){
  const f=fixture();f.ownerScope=v;
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
 }
 const f=fixture();f.ownerDecisionIssueComment=12345;
 assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
});
test('RED: reject STARTED, PREPARE and source-only phases with no real AFTER',()=>{
 for(const v of ['STARTED','PREFLIGHT','PREPARE','DISPOSABLE','DEPLOYED']){
  const f=fixture();f.phase=v;
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
 }
});
test('RED: require new proxy AND new API IDs, without changing ngrok ID',()=>{
 for(const key of ['proxyId','apiId','ngrokId']){
  const f=fixture();
  f.after[key]=f.before[key]===(key==='ngrokId'?ID3:f.before[key])
    ?(key==='ngrokId'?ID4:f.before[key]):ID3;
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false,key);
 }
});
test('RED: require 17 unchanged route identities; never accept counts-only parity',()=>{
 for(const mutate of [f=>f.before.routeCount=16,f=>f.after.routeCount=18,
  f=>f.after.routeSetDigest=SHA_D]){
  const f=fixture();mutate(f);
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
 }
});
test('RED: exact owner work dirty contents and source HEAD must not drift',()=>{
 for(const mutate of [f=>f.before.sourceDirty=false,f=>f.after.sourceDirty=false,
  f=>f.after.ownerDirtyDigest=SHA_C,f=>f.after.ownerGitHead='9'.repeat(40)]){
  const f=fixture();mutate(f);
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
 }
});
test('RED: require ngrok, bridge and trusted browser origin continuity',()=>{
 for(const key of ['ngrokId','bridgeFingerprint','trustedOriginsDigest']){
  const f=fixture();f.after[key]=(key==='ngrokId'?ID4:SHA_B);
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false,key);
 }
});
test('RED: all five Origin invariants PASS only after real cutover',()=>{
 for(const key of Object.keys(fixture().originFive)){
  for(const val of ['UNKNOWN','NOT_RUN','FAIL',true]){
   const f=fixture();f.originFive[key]=val;
   assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false,key);
  }
 }
});
test('RED: reject broken auth/CSRf/AI scope/worker/rollback even if Origin reports PASS',()=>{
 for(const key of Object.keys(fixture().checks)){
  const f=fixture();f.checks[key]=false;
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false,key);
 }
});
test('RED: block redacted receipt if it contains extra private data / credentials',()=>{
 const f=fixture();f.secret='SHOULD_NEVER_BE_LOGGED';
 const r=assessOwnerACutoverReceipt(f);
 assert.equal(r.evidenceConsistent,false);
 assert.equal(JSON.stringify(r).includes('SHOULD_NEVER_BE_LOGGED'),false);
});
test('RED: no poisoned getters, prototype objects, or executable data',()=>{
 const f=fixture();Object.defineProperty(f.before,'proxyId',{get(){throw Error('SECRET_LEAK')},enumerable:true});
 assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
 const g=fixture();Object.setPrototypeOf(g.after, null);
 assert.equal(assessOwnerACutoverReceipt(g).evidenceConsistent,false);
});
test('RED: deny wrong or missing identifiers (SHA-256 / 40-char Git / 64-char Docker)',()=>{
 const invalid=[
  f=>f.before.proxyId='short',f=>f.after.apiId='2'.repeat(40),
  f=>f.after.routeSetDigest='none',
  f=>f.after.ownerGitHead='0'.repeat(64),
  f=>f.after.bridgeFingerprint='',
  f=>f.before.ownerDirtyDigest='x'.repeat(64)
 ];
 for(const mutate of invalid){
  const f=fixture();mutate(f);
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
 }
});
test('RED: denies missing, unknown, or cyclic input without leaking contents',()=>{
 for(const v of [null,undefined,[],false,1,'',{}]){
  const r=assessOwnerACutoverReceipt(v);assert.equal(r.evidenceConsistent,false);
 }
 const f=fixture();f.cycle=f;
 assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
});
test('RED: empty arrays in place of required records reject',()=>{
 for(const k of ['before','after','originFive','checks']){
  const f=fixture();f[k]=[];
  assert.equal(assessOwnerACutoverReceipt(f).evidenceConsistent,false);
 }
});
