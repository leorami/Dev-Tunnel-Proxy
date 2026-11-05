'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTeachingCandidate}=require('../../utils/calliope-teaching-contract.cjs');
const BASE={
 incidentId:'cursor-lyra-redirect-loop-2025-10-26',
 source:{repository:'leorami/Dev-Tunnel-Proxy',commit:'a'.repeat(40),receipt:'test/CALLIOPE_TRAINING_COMPLETE.md'},
 diagnosis:{issueType:'nextjs_redirect_loop',route:'lyra'},
 evidence:{beforeSha256:'b'.repeat(64),afterSha256:'c'.repeat(64),testReceipt:'test/CALLIOPE_TRAINING_SUCCESS.md',replayedInCurrentRc2:false},
 requestedAbilityIds:['http.route.observe','nginx.nextjs_redirect.propose']
};
const candidate=overrides=>createTeachingCandidate({...BASE,...overrides});
test('RED: historical Cursor-to-Calliope lesson is a proposal, never an installed executable',()=>{
 const result=candidate();
 assert.equal(result.status,'HISTORICAL_EVIDENCE_NEEDS_REPLAY');
 assert.equal(result.ownerApprovalGranted,false);
 assert.equal(result.executionAuthorized,false);
 assert.equal(result.networkTransferAuthorized,false);
 assert.equal(result.learningProven,false);
 assert.equal(result.requestedAbilities.length,2);
});
test('RED: a reported verified replay still needs separate approval and implementation',()=>{
 const result=candidate({evidence:{...BASE.evidence,replayedInCurrentRc2:true}});
 assert.equal(result.status,'REPLAY_REPORTED_PENDING_REVIEW');
 assert.equal(result.executionAuthorized,false);
 assert.equal(result.ownerApprovalGranted,false);
});
test('RED: unimplemented ability becomes an explicit bounded capability request',()=>{
 const result=candidate({requestedAbilityIds:['http.route.observe','nginx.nextjs_redirect.propose','browser.mixed_content.inspect']});
 assert.deepEqual(result.newAbilityRequests,['browser.mixed_content.inspect']);
 assert.equal(result.executionAuthorized,false);
});
test('RED: no embedded shell, arbitrary code or privilege parameters are admitted',()=>{
 assert.throws(()=>candidate({shell:'docker exec dev-proxy sh'}),/INVALID_TEACHING_CANDIDATE/);
 assert.throws(()=>candidate({requestedAbilityIds:['shell.run']}),/INVALID_TEACHING_CANDIDATE/);
 assert.throws(()=>candidate({source:{...BASE.source,token:'private'}}),/INVALID_TEACHING_CANDIDATE/);
});
test('RED: proof cannot have arbitrary URL/host, unsafe path or fake full SHA',()=>{
 assert.throws(()=>candidate({source:{...BASE.source,receipt:'../../.env'}}),/INVALID_TEACHING_CANDIDATE/);
 assert.throws(()=>candidate({source:{...BASE.source,commit:'abc'}}),/INVALID_TEACHING_CANDIDATE/);
 assert.throws(()=>candidate({evidence:{...BASE.evidence,testReceipt:'https://evil.test/?secret=1'}}),/INVALID_TEACHING_CANDIDATE/);
 assert.throws(()=>candidate({diagnosis:{...BASE.diagnosis,route:'../admin'}}),/INVALID_TEACHING_CANDIDATE/);
});
test('RED: stable proposal ID and no mutation of source objects',()=>{
 const input=structuredClone(BASE);
 const a=createTeachingCandidate(input),b=createTeachingCandidate(input);
 assert.equal(a.proposalId,b.proposalId);
 assert.deepEqual(input,BASE);
 assert.equal(Object.isFrozen(a),true);
 assert.equal(Object.isFrozen(a.requestedAbilities),true);
});
test('RED: invalid object prototypes and explicit approval injection fail closed',()=>{
 assert.throws(()=>createTeachingCandidate(Object.assign(Object.create({admin:true}),BASE)),/INVALID_TEACHING_CANDIDATE/);
 assert.throws(()=>candidate({ownerApprovalGranted:true}),/INVALID_TEACHING_CANDIDATE/);
 assert.throws(()=>candidate({evidence:{...BASE.evidence,productionChangeAuthorized:true}}),/INVALID_TEACHING_CANDIDATE/);
});
