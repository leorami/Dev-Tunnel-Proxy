'use strict';
// Inert recovery decision contract. No Docker, network, host paths or credentials.
// The runtime source must corroborate all asserted booleans privately, not here.
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateP0RestorationEvidence,ACCEPTED_RC1_SHA}=require('../../utils/p0-restoration-evidence.cjs');
const fixture=()=>({
  candidateSha:ACCEPTED_RC1_SHA,
  priorRc1CutoverGatesRevalidated:true,
  privateOwnerEvidenceAttested:true,
  exactResolvedComposeOverlayVerified:true,
  privateImageAndConfigRollbackRehearsed:true,
  trustedOriginsPrivate:true,
  sharedNginxApiConfigDigest:true,
  candidateImagePinned:true,
  sessionAnd17RoutesContinuity:true,
  anonymousHealthMinimal:true,
  anonymousRoutesDenied:true,
  anonymousArtifactsDenied:true,
  directApiPort3001LoopbackOnly:true,
  notificationsPort3002LoopbackOnly:true,
  directChatHistoryRequiresAuth:true,
  noPublicDirectNotificationWrites:true,
  macBridgeAndNgrokPreserved:true,
  noOwnerCheckoutOrMasterMutation:true,
  scopedProxyAndApiOnly:true,
  disposableNegativeTestsPassed:true,
  noLegacySwitcherOrGeneralCompose:true,
  rollbackOperatorAndBudgetReady:true
});
const result=(input)=>evaluateP0RestorationEvidence(input);
test('historical P0 drift or missing fields always BLOCK before owner decision',()=>{
  const x=result({});
  assert.equal(x.status,'BLOCKED');
  assert.equal(x.productionChangeAuthorized,false);
  assert.equal(x.performedActions,false);
  assert.ok(x.blockers.length>0);
});
test('private complete evidence is still only OWNER_DECISION_REQUIRED, never deployment permission',()=>{
  const x=result(fixture());
  assert.equal(x.status,'OWNER_DECISION_REQUIRED');
  assert.equal(x.productionChangeAuthorized,false);
  assert.equal(x.performedActions,false);
  assert.deepEqual(x.blockers,[]);
});
test('wrong SHA or candidate proxy image fails closed',()=>{
  for(const patch of [{candidateSha:'62a4d7babae986ade1feb0fd6dbe7dd32532523a'},{candidateImagePinned:false}]){
    const x=result({...fixture(),...patch});
    assert.equal(x.status,'BLOCKED');
    assert.equal(x.productionChangeAuthorized,false);
  }
});
test('direct port and anonymous artifact regressions independently block recovery',()=>{
  for(const key of ['directApiPort3001LoopbackOnly','notificationsPort3002LoopbackOnly',
    'directChatHistoryRequiresAuth','noPublicDirectNotificationWrites',
    'anonymousArtifactsDenied','anonymousHealthMinimal','anonymousRoutesDenied']){
      const x=result({...fixture(),[key]:false});
      assert.equal(x.status,'BLOCKED',key);
      assert.ok(x.blockers.includes(key),key);
  }
});
test('no private backup or different effective Compose blocks',()=>{
  for(const key of ['exactResolvedComposeOverlayVerified','privateImageAndConfigRollbackRehearsed',
    'trustedOriginsPrivate','sharedNginxApiConfigDigest','sessionAnd17RoutesContinuity',
    'noLegacySwitcherOrGeneralCompose']){
      const x=result({...fixture(),[key]:false});
      assert.equal(x.status,'BLOCKED',key);
  }
});
test('unattested source evidence and owner-policy barriers always block',()=>{
  for(const key of ['privateOwnerEvidenceAttested','priorRc1CutoverGatesRevalidated',
    'noOwnerCheckoutOrMasterMutation','disposableNegativeTestsPassed','rollbackOperatorAndBudgetReady']){
      const x=result({...fixture(),[key]:false});
      assert.equal(x.status,'BLOCKED',key);
  }
});
test('reject extra input fields containing secrets, raw inspect, path, URL or passwords',()=>{
  for(const field of ['rawDockerInspect','adminPassword','mountSource','trustedOriginValue','sessionToken']){
    const x=result({...fixture(),[field]:'SECRET_MUST_NOT_BE_LOGGED'});
    assert.equal(x.status,'BLOCKED');
    assert.equal(x.productionChangeAuthorized,false);
    assert.doesNotMatch(JSON.stringify(x),/SECRET_MUST_NOT_BE_LOGGED/);
  }
});
test('reject getter properties and arrays rather than evaluating possibly dangerous evidence',()=>{
  const obj=fixture();Object.defineProperty(obj,'candidateSha',{enumerable:true,get(){throw Error('must not evaluate');}});
  assert.equal(result(obj).status,'BLOCKED');
  assert.equal(result([]).status,'BLOCKED');
});
