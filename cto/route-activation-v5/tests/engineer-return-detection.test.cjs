'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reconcilePrimaryReturn}=require('../utils/engineer-return-detection.cjs');
const sha='beb845e84a9a82a5dea5b5329a97497422011f5e';
const returned=`## Engineer-I RETURNED -- route parity\nReceipt SHA: ${sha}\n34/34 PASS, HTTP 422 after files written`;
const reviewed='CTO SOURCE/RECEIPT REVIEW -- ACCEPT TEST EVIDENCE; REJECT READY-FOR-GO LABEL. RO_ROUTE_MUTATION_PARITY_BLOCKED / NOT_DEPLOYED';
const good=()=>({childPR:{head_sha:sha,head:'engineer/devproxy-p0-ro-code-rw-route-parity-20261103',draft:true,state:'open'},
 parentComments:[{body:returned}],childReceipt:{commitSha:sha,path:'docs/receipts/DEVPROXY_P0_RO_CODE_RW_ROUTE_DATA_PARITY_ENGINEER_COMPLETION.md',body:'STARTED -> IMPLEMENTING -> VERIFYING -> RETURNED'},
 reviewComments:[{body:reviewed}]});
test('existing open draft PR can be genuinely returned, CTO-reviewed, release-blocked',()=>{
 const r=reconcilePrimaryReturn(good());assert.equal(r.lifecycle,'RETURNED');assert.equal(r.review,'REVIEWED');assert.equal(r.release,'BLOCKED');assert.equal(r.currentSha,sha);assert.equal(r.needsNewDispatch,false);
});
test('return remains returned across repeated identical checks',()=>{
 const a=reconcilePrimaryReturn(good());const b=reconcilePrimaryReturn(good());assert.deepEqual(a,b);
});
test('new head SHA after return cannot silently inherit old completion',()=>{
 const x=good();x.childPR.head_sha='a'.repeat(40);assert.equal(reconcilePrimaryReturn(x).lifecycle,'RETURN_SHA_DRIFT');
});
test('parent comment without a matching child receipt cannot establish completed source',()=>{
 const x=good();delete x.childReceipt;assert.equal(reconcilePrimaryReturn(x).lifecycle,'UNVERIFIED');
});
test('draft/open PR alone is not evidence of work in progress',()=>{
 const x=good();x.parentComments=[];x.reviewComments=[];x.childReceipt=null;assert.equal(reconcilePrimaryReturn(x).lifecycle,'UNVERIFIED');
});
test('reported green tests do not overrule CTO acceptance or 422 after persistent writes',()=>{
 const x=good();x.reviewComments=[];const r=reconcilePrimaryReturn(x);assert.equal(r.lifecycle,'RETURNED');assert.equal(r.review,'PENDING');assert.equal(r.release,'UNVERIFIED');
});
test('only actual STARTED evidence supports implementing, never PR creation',()=>{
 const x=good();x.parentComments=[{body:'Engineer-I STARTED -- source reviewed, implementation underway'}];x.childReceipt=null; x.reviewComments=[];
 assert.equal(reconcilePrimaryReturn(x).lifecycle,'STARTED');
});
test('rejects spoofed non-string return and invalid shas',()=>{
 const x=good();x.childPR.head_sha='short';assert.equal(reconcilePrimaryReturn(x).lifecycle,'UNVERIFIED');
});
