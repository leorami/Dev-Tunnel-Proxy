'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createAuthenticatedReloadBroker,createAuthenticatedReloadClient}=require('../utils/owner-authenticated-reload.cjs');
const KEY=crypto.randomBytes(32),DIGEST=crypto.createHash('sha256').update('EXPECTED_BUNDLE').digest('hex');
async function stack(t,{verifyBundle=async(_,digest)=>digest===DIGEST}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'dp-digest-v5-'));await fs.chmod(directory,0o700);
 const calls=[],broker=createAuthenticatedReloadBroker({directory,secret:KEY,
  driver:{attest:async()=>{calls.push('attest');return true;},execute:async a=>{calls.push(a);return 0;}},
  verifyCandidateBundle:async(s,d)=>{calls.push('digest:'+d);return await verifyBundle(s,d);},
  verifyActiveRoute:async(s,d)=>{calls.push('active:'+d);return d===DIGEST;}});
 await broker.start();t.after(async()=>{await broker.stop();await fs.rm(directory,{recursive:true,force:true});});
 return {calls,client:createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:KEY})};
}
test('missing content digest is rejected without any host commands',async t=>{
 const x=await stack(t);assert.equal((await x.client.activate()).status,'BLOCKED_INVALID_REQUEST');assert.deepEqual(x.calls,[]);
});
test('signed digest is checked before validation and after reload and passed to active-route verifier',async t=>{
 const x=await stack(t);const r=await x.client.activate({expectedBundleSha256:DIGEST});
 assert.equal(r.status,'RELOAD_AND_VERIFICATION_REPORTED');
 assert.deepEqual(x.calls,['digest:'+DIGEST,'attest','nginx-test','attest','nginx-reload','attest','digest:'+DIGEST,'active:'+DIGEST]);
});
test('mismatched signed digest fails before nginx test or reload',async t=>{
 const x=await stack(t);const r=await x.client.activate({expectedBundleSha256:crypto.createHash('sha256').update('SOMETHING_ELSE').digest('hex')});
 assert.equal(r.status,'BUNDLE_DIGEST_MISMATCH');assert.deepEqual(x.calls.filter(x=>x==='nginx-test'||x==='nginx-reload'),[]);
});
test('wrong digest shape rejected locally without network commands',async t=>{
 const x=await stack(t);for(const bad of ['','xyz','a'.repeat(64).toUpperCase(),null]){
   assert.equal((await x.client.activate({expectedBundleSha256:bad})).status,'BLOCKED_INVALID_REQUEST');
 }
 assert.deepEqual(x.calls,[]);
});
