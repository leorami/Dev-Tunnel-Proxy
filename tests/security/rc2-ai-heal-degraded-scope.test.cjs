'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {listAiHealDegradedScope,DEGRADED_POST,PRESERVED_TRANSACTIONAL_POST}=
 require('../../utils/rc2-ai-heal-degraded-scope.cjs');
test('RED: degraded AI heal inventory is decision-ready and never a GO',()=>{
 const r=listAiHealDegradedScope();
 assert.equal(r.code,'OWNER_SCOPE_DECISION_REQUIRED');
 assert.equal(r.productionChangeAuthorized,false);
 assert.equal(r.deployed,false);
 assert.equal(r.ownerUatApproved,false);
 assert.equal(r.safeReplacementStatus,'PARTIAL_OBSERVATION_PLUS_ONE_REVIEWED_REDIRECT_SKILL');
 assert.ok(DEGRADED_POST.includes('ai/audit-and-heal'));
 assert.ok(!DEGRADED_POST.includes('apps/scan'));
 assert.ok(!DEGRADED_POST.includes('ai/self-check'));
 assert.ok(r.partialSafePostPaths.includes('apps/scan'));
 assert.ok(r.partialSafePostPaths.includes('ai/audit'));
 assert.ok(r.partialSafePostPaths.includes('ai/self-check'));
 assert.ok(PRESERVED_TRANSACTIONAL_POST.includes('apps/install'));
 assert.ok(PRESERVED_TRANSACTIONAL_POST.includes('apps/create-route'));
 assert.ok(PRESERVED_TRANSACTIONAL_POST.includes('apps/apply-reviewed-nextjs-redirect'));
 assert.ok(r.hostMediatedFixedActions.includes('apps/apply-reviewed-nextjs-redirect'));
 assert.ok(!PRESERVED_TRANSACTIONAL_POST.includes('ai/advanced-heal'));
});
test('RED: inventory objects are immutable snapshots',()=>{
 assert.throws(()=>{DEGRADED_POST.push('x');});
 assert.throws(()=>{listAiHealDegradedScope().degradedPostPaths.pop();});
});
