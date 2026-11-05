'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessApprovedApiOnlyPostcheck:check}=require('../../utils/rc2-approved-api-only-postcheck.cjs');
const id=c=>c.repeat(64),commit=c=>c.repeat(40);
function evidence(){
 const before={proxyId:id('1'),apiId:id('2'),ngrokId:id('3'),
  proxyImage:id('a'),apiImage:id('b'),bridgeFingerprint:id('c'),
  masterSha:commit('d'),ownerDirtyFingerprint:id('e'),routeFingerprint:id('f'),
  workerPid:96350,workerSingleton:true};
 return {authorizationComment:6672650274,phase:'POST_API_ONLY_RECREATE',
  before,after:{...before,apiId:id('4'),apiImage:id('5')},
  privateChecks:{
   approvedHttpsOriginExactlyAdded:true,existingLoopbackOriginsPreserved:true,
   apiUserNonroot50420:true,apiReadOnlySource:true,apiNoDockerSocket:true,
   protectedOwnerEnvAndCredentialsPreserved:true,sessionContinuity:true,
   hmacSecretAndSpoolPreserved:true,supervisedWorkerResponsive:true,
   onlyOneApiRecreate:true,noProxyRestartOrReload:true,
   apiImageAndSourceReviewed:true,apiDnsMatchesProxyUpstream:true,
   noAdditionalServices:true,nginxConfigAnd17RoutesIdentical:true,
   healthyHttpsNegativePassword401:true,untrustedOrigin403:true,
   localAskSignedIn200:true,anonymousHealthMinimalNoStore:true,
   rollbackArtifactsAndRehearsalConfirmed:true
  }
 };
}
test('RED: all green PRIVATE evidence still only requests independent CTO review, never grants authorization',()=>{
 const r=check(evidence());
 assert.deepEqual(r,{code:'API_ONLY_POSTCHECK_REVIEW_ONLY',evidenceConsistent:true,
   liveDeploymentAttested:false,productionChangeAuthorized:false,
   performedActions:false,ownerUatApproved:false});
 assert.equal(Object.isFrozen(r),true);
});
test('RED: exact owner decision reference and POST phase mandatory',()=>{
 for(const change of [x=>x.authorizationComment=123,x=>x.phase='PREFLIGHT',
   x=>x.phase='DEPLOYED',x=>x.ownerApproved=true]){
  const e=evidence();change(e);assert.equal(check(e).evidenceConsistent,false);
 }
});
test('RED: API must change, not proxy, ngrok, worker, bridge, owner source or routes',()=>{
 const mustStay=['proxyId','ngrokId','proxyImage','bridgeFingerprint',
   'masterSha','ownerDirtyFingerprint','routeFingerprint','workerPid','workerSingleton'];
 for(const field of mustStay){
  const e=evidence();e.after[field]=typeof e.after[field]==='number'?456:
   typeof e.after[field]==='boolean'?false:id('6');
  assert.equal(check(e).evidenceConsistent,false,field);
 }
 const e=evidence();e.after.apiId=e.before.apiId;
 assert.equal(check(e).evidenceConsistent,false);
});
test('RED: API-only allowlisted fields contain only approved evidence keys',()=>{
 const e=evidence();e.after.proxyRestarted=true;
 assert.equal(check(e).evidenceConsistent,false);
 e.after.proxyRestarted=undefined;
 assert.equal(check(e).evidenceConsistent,false);
});
test('RED: all origin/auth/session/HMAC/rollback and API security checks mandatory',()=>{
 for(const k of Object.keys(evidence().privateChecks)){
  const e=evidence();e.privateChecks[k]=false;
  assert.equal(check(e).evidenceConsistent,false,k);
 }
});
test('RED: stale nginx static upstream DNS after API IP change must be explicitly blocked',()=>{
 const e=evidence();e.privateChecks.apiDnsMatchesProxyUpstream=false;
 assert.equal(check(e).code,'API_ONLY_DNS_UPSTREAM_ROLLBACK_REQUIRED');
 assert.equal(check(e).productionChangeAuthorized,false);
});
test('RED: real API ID and pinned image digests must be exact full format',()=>{
 for(const mutate of [e=>e.after.apiId='bad',e=>e.after.apiImage='sha256:bad',
  e=>e.before.proxyId='short',e=>e.before.masterSha='abc',
  e=>e.after.workerPid='96350',e=>e.before.workerSingleton=1]){
  const e=evidence();mutate(e);assert.equal(check(e).evidenceConsistent,false);
 }
});
test('RED: unapproved owner domains, sessions, credentials and paths never echoed',()=>{
 const e=evidence();e.privateHostname='private-ngrok-owner.example';
 const r=check(e);assert.equal(r.evidenceConsistent,false);
 assert.equal(JSON.stringify(r).includes(e.privateHostname),false);
});
test('RED: injected getters, arrays, missing objects and prototype substitutions fail closed',()=>{
 for(const x of [null,false,[],{},'hi',4,undefined])assert.equal(check(x).evidenceConsistent,false);
 const e=evidence();Object.defineProperty(e.after,'apiId',{get(){throw Error('SECRET')},enumerable:true});
 assert.equal(check(e).evidenceConsistent,false);
 const g=evidence();Object.setPrototypeOf(g.privateChecks,null);
 assert.equal(check(g).evidenceConsistent,false);
});
test('RED: all extra nested fields and accessors must fail closed before reading any secret values',()=>{
 const e=evidence();e.privateChecks.cookie='SECRET';
 assert.equal(check(e).evidenceConsistent,false);
 const f=evidence();Object.defineProperty(f.privateChecks,'localAskSignedIn200',{get(){throw Error('SECRET')},enumerable:true});
 assert.equal(check(f).evidenceConsistent,false);
});
test('RED: same image allowed if reviewed, API ID still must differ',()=>{
 const e=evidence();e.after.apiImage=e.before.apiImage;
 assert.equal(check(e).evidenceConsistent,true);
});
