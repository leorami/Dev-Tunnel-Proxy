'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createSignedCandidateRequest,verifySignedCandidateRequest,signCandidateReply,verifySignedCandidateReply,ACTION}=require('../../utils/rc1-content-bound-activation-request.cjs');
const secret=Buffer.alloc(32,0x31);
const digest='a'.repeat(64);
const nonce='b'.repeat(32);
const NOW=1783190000000;
const make=()=>createSignedCandidateRequest({secret,expectedCandidateSha256:digest,now:()=>NOW,nonce:()=>nonce});
test('v2 binds full candidate content set in fixed action and version',()=>{
 const r=make();
 assert.equal(r.type,ACTION);
 assert.equal(r.expectedCandidateSha256,digest);
 assert.deepEqual(verifySignedCandidateRequest({request:r,secret,now:()=>NOW}),{ok:true,code:'CONTENT_BOUND_REQUEST_VERIFIED'});
 assert.equal(Object.hasOwn(r,'expectedBundleSha256'),false);
});
test('mutating candidate digest invalidates MAC even if bundle digest same',()=>{
 const r={...make(),expectedCandidateSha256:'c'.repeat(64)};
 assert.equal(verifySignedCandidateRequest({request:r,secret,now:()=>NOW}).ok,false);
});
test('mutating action, ID or timestamp invalidates MAC',()=>{
 for(const [key,v]of [['type','VALIDATE_GENERIC'],['requestId','c'.repeat(32)],['ts',NOW+1]]){
  const r={...make(),[key]:v};
  assert.equal(verifySignedCandidateRequest({request:r,secret,now:()=>NOW}).ok,false,key);
 }
});
test('rejects expired and future requests',()=>{
 assert.equal(verifySignedCandidateRequest({request:make(),secret,now:()=>NOW+45001}).ok,false);
 assert.equal(verifySignedCandidateRequest({request:make(),secret,now:()=>NOW-45001}).ok,false);
});
test('rejects replay and malformed input keys via caller-managed used nonce set',()=>{
 const r=make();
 assert.equal(verifySignedCandidateRequest({request:r,secret,now:()=>NOW,seenNonces:new Set([nonce])}).ok,false);
 assert.equal(verifySignedCandidateRequest({request:{...r,arbitraryCommand:'docker run'},secret,now:()=>NOW}).ok,false);
});
test('rejects missing, undersized, or overlength secret',()=>{
 for(const key of [Buffer.alloc(0),Buffer.alloc(31),Buffer.alloc(129),null,'text']){
  assert.throws(()=>createSignedCandidateRequest({secret:key,expectedCandidateSha256:digest,now:()=>NOW,nonce:()=>nonce}),/INVALID_SIGNING_CONFIGURATION/);
 }
});
test('rejects malformed nonces and noncanonical digests before MAC calculation',()=>{
 for(const candidate of [digest.toUpperCase(),digest.slice(1),null]){
  assert.throws(()=>createSignedCandidateRequest({secret,expectedCandidateSha256:candidate,now:()=>NOW,nonce:()=>nonce}),/INVALID_SIGNING_CONFIGURATION/);
 }
 assert.throws(()=>createSignedCandidateRequest({secret,expectedCandidateSha256:digest,now:()=>NOW,nonce:()=>"oops"}),/INVALID_SIGNING_CONFIGURATION/);
});
test('signs fixed successful host response bound to request and expected content set',()=>{
 const request=make();
 const response=signCandidateReply({secret,request,status:'RELOAD_AND_VERIFICATION_REPORTED'});
 assert.equal(verifySignedCandidateReply({response,request,secret}).ok,true);
 assert.equal(response.productionChangeAuthorized,false);
 assert.equal(response.liveAttested,false);
});
test('fake, unsigned or stale successful host response cannot become proof',()=>{
 const request=make();
 const response=signCandidateReply({secret,request,status:'RELOAD_AND_VERIFICATION_REPORTED'});
 for(const fake of [{...response,replyMac:'0'.repeat(64)},
  {...response,expectedCandidateSha256:'f'.repeat(64)},
  {...response,requestId:'c'.repeat(32)},
  {...response,liveAttested:true},
  {...response,productionChangeAuthorized:true},
  {...response,dockerCommand:'arbitrary'},
  {status:'RELOAD_AND_VERIFICATION_REPORTED'}]){
  assert.equal(verifySignedCandidateReply({response:fake,request,secret}).ok,false);
 }
});
test('rejects unknown host response status, not optimistic success',()=>{
 const request=make();
 assert.throws(()=>signCandidateReply({secret,request,status:'GO_FOR_DEPLOY'}),/INVALID_REPLY_STATUS/);
});
test('domain separation prevents request MAC being used as reply MAC',()=>{
 const request=make();
 const res=signCandidateReply({secret,request,status:'RELOAD_AND_VERIFICATION_REPORTED'});
 assert.equal(verifySignedCandidateReply({response:{...res,replyMac:request.mac},request,secret}).ok,false);
});
