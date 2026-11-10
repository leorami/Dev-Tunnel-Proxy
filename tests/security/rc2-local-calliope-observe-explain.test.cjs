'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {explainLocalCalliopeCapability}=require('../../utils/rc2-local-calliope-observe-explain.cjs');

test('RED: fixed-host observation question states exact proof limits without executing',()=>{
 const r=explainLocalCalliopeCapability('What does a fixed-host route observation prove?');
 assert.equal(r.ok,true);
 assert.equal(r.mode,'local_observation_limits');
 assert.equal(r.usedAI,false);
 assert.equal(r.healingPerformed,false);
 assert.equal(r.liveAttested,false);
 assert.equal(r.executionAuthorized,false);
 assert.match(r.answer,/HEAD/i);
 assert.match(r.answer,/does NOT prove/i);
 assert.match(r.answer,/never opens caller-supplied arbitrary URLs/i);
 assert.ok(r.sources.includes('utils/rc2-secure-http-audit.cjs'));
});

test('RED: reviewed heal question explains propose/ticket/CAS without authorizing apply',()=>{
 const r=explainLocalCalliopeCapability('How does Calliope fix a Next.js redirect loop?');
 assert.equal(r.ok,true);
 assert.equal(r.mode,'local_reviewed_heal_explain');
 assert.equal(r.healingPerformed,false);
 assert.equal(r.executionAuthorized,false);
 assert.equal(r.productionChangeAuthorized,false);
 assert.match(r.answer,/reviewTicket/i);
 assert.match(r.answer,/does not auto-heal/i);
 assert.match(r.answer,/403/);
 assert.ok(r.sources.includes('utils/calliope-owner-nextjs-heal-skill.cjs'));
});

test('RED: unrelated question does not fake a capability explanation',()=>{
 const r=explainLocalCalliopeCapability('What is the capital of France?');
 assert.equal(r.ok,false);
 assert.equal(r.code,'NO_LOCAL_CAPABILITY_EXPLAIN');
});

test('RED: overlong query rejected before any explanation',()=>{
 const r=explainLocalCalliopeCapability('x'.repeat(600));
 assert.equal(r.ok,false);
});
