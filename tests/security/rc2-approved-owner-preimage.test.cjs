'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyApprovedOwnerPreimage}=require('../../utils/rc2-approved-owner-preimage.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
test('RED: locked fresh preimage exact digest matches, no live approval implied',()=>{
 const bytes=Buffer.from('original-owner-route\n','utf8');
 const r=verifyApprovedOwnerPreimage({expectedBeforeSha256:sha(bytes),currentBytes:bytes});
 assert.equal(r.status,'MATCH');assert.equal(r.ownerApprovalGranted,false);
 assert.equal(r.productionChangeAuthorized,false);assert.equal(r.healingPerformed,false);
 assert.ok(Object.isFrozen(r));
});
test('RED: stale preimage fails, never declares action authorized',()=>{
 const r=verifyApprovedOwnerPreimage({expectedBeforeSha256:sha('before'),currentBytes:Buffer.from('after')});
 assert.equal(r.status,'STALE');assert.equal(r.productionChangeAuthorized,false);
});
test('RED: previously absent target cannot satisfy approved existing snapshot',()=>{
 assert.equal(verifyApprovedOwnerPreimage({expectedBeforeSha256:sha('before'),currentBytes:null}).status,'STALE');
});
test('RED: invalid hash and any missing/hash-short bypass rejected',()=>{
 for(const v of [null,undefined,'','a'.repeat(63),'A'.repeat(64),'../owner','bad']){
  const r=verifyApprovedOwnerPreimage({expectedBeforeSha256:v,currentBytes:Buffer.from('hello')});
  assert.equal(r.status,'INVALID',String(v));
 }
});
test('RED: current bytes must be a real Buffer, not string or fake typed array',()=>{
 for(const v of ['owner',new Uint8Array(5),{},undefined]){
  const r=verifyApprovedOwnerPreimage({expectedBeforeSha256:sha('owner'),currentBytes:v});
  assert.equal(r.status,'INVALID');
 }
});
test('RED: untrusted parameters, getters and prototypes rejected',()=>{
 const base={expectedBeforeSha256:sha('owner'),currentBytes:Buffer.from('owner')};
 assert.equal(verifyApprovedOwnerPreimage({...base,ownerApprovalGranted:true}).status,'INVALID');
 assert.equal(verifyApprovedOwnerPreimage(Object.assign(Object.create({evil:true}),base)).status,'INVALID');
 const withGetter=Object.defineProperty({},'expectedBeforeSha256',{enumerable:true,get(){throw Error('should not run');}});
 Object.defineProperty(withGetter,'currentBytes',{enumerable:true,value:Buffer.from('owner')});
 assert.equal(verifyApprovedOwnerPreimage(withGetter).status,'INVALID');
});
test('RED: original bytes are not mutated and output does not disclose config or digest',()=>{
 const data=Buffer.from('very-private-owner-config\n');const before=Buffer.from(data);
 const r=verifyApprovedOwnerPreimage({expectedBeforeSha256:sha(data),currentBytes:data});
 assert.deepEqual(data,before);
 assert.equal(r.data,undefined);assert.equal(r.expectedBeforeSha256,undefined);
 assert.deepEqual(Object.keys(r),['status','ownerApprovalGranted','productionChangeAuthorized','healingPerformed']);
});
