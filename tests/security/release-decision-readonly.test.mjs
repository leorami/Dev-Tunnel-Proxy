/** DEVPROXY RC1 RELEASE RED first: pure evidence classification; no live reads or writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {assessReleaseEvidence,formatRedactedDecision,RELEASE_GATES}=require('../../utils/release-decision.cjs');

const verified=Object.freeze({
  sourceTests:'PASS',
  productionCompose:'PASS',
  node18Parity:'PASS',
  fixtureBrowser:'PASS',
  macBridgeMock:'PASS',
  currentImageIdentified:'PASS',
});
const allEvidence=Object.fromEntries(RELEASE_GATES.map(x=>[x,'PASS']));

test('returned RC1 packaging proof is still NO-GO without baseline and durable rollback',()=>{
 const result=assessReleaseEvidence(verified);
 assert.equal(result.recommendation,'NO_GO');
 assert.equal(result.releaseAuthorized,false);
 for(const blocked of [
   'rollbackArchiveVerified','routeBaselineRecorded','publicIngressPlanReviewed',
   'ownerStagingUat','macBridgeOwnerPlan','ownerExplicitApproval'
 ])assert.ok(result.blockers.includes(blocked),blocked);
});

test('image IDs alone are not a saved and restorable rollback artifact',()=>{
 const proof={...verified, currentImageIdentified:'PASS',
   rollbackArchiveVerified:'NOT_RUN',routeBaselineRecorded:'PASS'};
 const result=assessReleaseEvidence(proof);
 assert.equal(result.recommendation,'NO_GO');
 assert.ok(result.blockers.includes('rollbackArchiveVerified'));
});

test('source evidence cannot claim release authorization even with every gate marked PASS',()=>{
 const result=assessReleaseEvidence(allEvidence);
 assert.equal(result.recommendation,'READY_FOR_OWNER_DECISION');
 assert.equal(result.releaseAuthorized,false);
 assert.equal(result.installed,false);
 assert.equal(result.ownerActionRequired,true);
});

test('any FAIL, BLOCKED or missing gate forces NO-GO',()=>{
 for(const bad of ['FAIL','BLOCKED','NOT_RUN',null,undefined,'PASS but needs review',true]){
   const result=assessReleaseEvidence({...allEvidence,publicIngressPlanReviewed:bad});
   assert.equal(result.recommendation,'NO_GO',String(bad));
 }
 assert.equal(assessReleaseEvidence(undefined).recommendation,'NO_GO');
 assert.equal(assessReleaseEvidence('PASS').recommendation,'NO_GO');
});

test('separate macOS bridge owner plan is mandatory even when proxy is otherwise ready',()=>{
 const result=assessReleaseEvidence({...allEvidence,macBridgeOwnerPlan:'BLOCKED'});
 assert.equal(result.recommendation,'NO_GO');
 assert.ok(result.blockers.includes('macBridgeOwnerPlan'));
});

test('public ingress and route baseline must be distinct evidence gates',()=>{
 for(const key of ['routeBaselineRecorded','publicIngressPlanReviewed']){
  const result=assessReleaseEvidence({...allEvidence,[key]:'NOT_RUN'});
  assert.ok(result.blockers.includes(key));
 }
});

test('text report cannot echo arbitrary secret-bearing fields from caller',()=>{
 const classified=assessReleaseEvidence({...verified,
   ADMIN_PASSWORD:'PRIVATE_MARKER_DO_NOT_PRINT',token:'PRIVATE_MARKER_DO_NOT_PRINT',
   currentUrl:'https://private.invalid/PRIVATE_MARKER_DO_NOT_PRINT',
   note:'PRIVATE_MARKER_DO_NOT_PRINT'});
 const output=formatRedactedDecision(classified);
 assert.match(output,/NO_GO/);
 assert.doesNotMatch(output,/PRIVATE_MARKER_DO_NOT_PRINT/);
 assert.doesNotMatch(output,/https?:\/\//);
 assert.doesNotMatch(output,/sha256:/);
});

test('decision module and CLI never inspect live Docker, access secrets or issue HTTP calls',()=>{
 const mod=fs.readFileSync(new URL('../../utils/release-decision.cjs',import.meta.url),'utf8');
 assert.doesNotMatch(mod,/child_process|execSync|spawnSync|fetch\(|https?\.request|curl|\.env|admin-session\.json|readFileSync|writeFileSync/);
});


test('readiness CLI consumes optional fixture evidence but never emits private fields',()=>{
 const script=new URL('../../scripts/release-decision-readonly.mjs',import.meta.url).pathname;
 const partial=spawnSync(process.execPath,[script],{encoding:'utf8',
   input:JSON.stringify({...verified,secret:'PRIVATE_MARKER_DO_NOT_PRINT'})});
 assert.equal(partial.status,2);
 assert.match(partial.stdout,/Recommendation: NO_GO/);
 assert.doesNotMatch(partial.stdout,/PRIVATE_MARKER_DO_NOT_PRINT/);
 const complete=spawnSync(process.execPath,[script],{encoding:'utf8',input:JSON.stringify(allEvidence)});
 assert.equal(complete.status,0);
 assert.match(complete.stdout,/READY_FOR_OWNER_DECISION/);
 assert.match(complete.stdout,/Release authority: OWNER_ONLY/);
 assert.doesNotMatch(complete.stdout,/Deployment performed: YES/);
});

test('readiness CLI rejects invalid or oversized input without printing it',()=>{
 const script=new URL('../../scripts/release-decision-readonly.mjs',import.meta.url).pathname;
 for(const input of ['PRIVATE_MARKER_DO_NOT_PRINT', '{broken', 'x'.repeat(12000)]){
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',input});
  assert.equal(result.status,2);
  assert.match(result.stdout,/NO_GO/);
  assert.doesNotMatch(result.stdout,/PRIVATE_MARKER_DO_NOT_PRINT/);
  assert.doesNotMatch(result.stderr,/PRIVATE_MARKER_DO_NOT_PRINT/);
 }
});
