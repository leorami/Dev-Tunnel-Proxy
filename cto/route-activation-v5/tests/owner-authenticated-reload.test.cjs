'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const crypto=require('node:crypto');
const {createAuthenticatedReloadBroker,createAuthenticatedReloadClient,ACTION}=require('../utils/owner-authenticated-reload.cjs');
const KEY=crypto.randomBytes(32);
const DIGEST='a'.repeat(64);
async function suite(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dp-v3-'));
 await fs.chmod(dir,0o700);
 const trace=[];
 const driver={attest:async()=>{trace.push('attest');return true;},execute:async(action)=>{trace.push(action);return 0;}};
 const broker=createAuthenticatedReloadBroker({directory:dir,secret:KEY,driver,verifyCandidateBundle:async()=>true,verifyActiveRoute:async()=>{trace.push('verified');return true;}});
 await broker.start();t.after(async()=>{await broker.stop();await fs.rm(dir,{recursive:true,force:true});});
 return {broker,trace,dir};
}
test('valid signed roundtrip actually dispatches fixed validation, reload, verification',async t=>{
 const {broker,trace}=await suite(t);
 const client=createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:KEY});
 const r=await client.activate({expectedBundleSha256:DIGEST});
 assert.equal(r.status,'RELOAD_AND_VERIFICATION_REPORTED');
 assert.deepEqual(trace,['attest','nginx-test','attest','nginx-reload','attest','verified']);
});
test('incorrect secret is denied before Docker interactions',async t=>{
 const {broker,trace}=await suite(t);
 const client=createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:crypto.randomBytes(32)});
 assert.equal((await client.activate({expectedBundleSha256:DIGEST})).status,'BLOCKED_BAD_REPLY');
 assert.deepEqual(trace,[]);
});
test('replayed signed ID is rejected durably by same broker',async t=>{
 const {broker,trace}=await suite(t);
 const client=createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:KEY,nonce:()=>('a'.repeat(32))});
 assert.equal((await client.activate({expectedBundleSha256:DIGEST})).status,'RELOAD_AND_VERIFICATION_REPORTED');
 assert.equal((await client.activate({expectedBundleSha256:DIGEST})).status,'BLOCKED_REPLAY');
 assert.equal(trace.filter(x=>x==='nginx-reload').length,1);
});
test('invalid replay timestamp and malformed body rejected without commands',async t=>{
 const {broker,trace}=await suite(t);
 const client=createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:KEY,now:()=>Date.now()-120000});
 assert.equal((await client.activate({expectedBundleSha256:DIGEST})).status,'BLOCKED_AUTH');
 assert.deepEqual(trace,[]);
 const status=await new Promise(resolve=>{
  const s=net.createConnection(broker.socketPath);let bytes='';
  s.on('connect',()=>s.end(JSON.stringify({type:ACTION,requestId:'c'.repeat(32),ts:Date.now(),mac:'0'.repeat(64),command:'sh'})+'\n'));
  s.on('data',x=>bytes+=x.toString());s.on('end',()=>resolve(JSON.parse(bytes.trim()).status));s.on('error',e=>resolve(e.message));
 });
 assert.equal(status,'BLOCKED_INVALID_REQUEST');assert.deepEqual(trace,[]);
});
test('fail-closed nginx test refuses reload',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dp-v3-')); await fs.chmod(dir,0o700);
 const trace=[];const driver={attest:async()=>true,execute:async(action)=>{trace.push(action);return action==='nginx-test'?1:0;}};
 const broker=createAuthenticatedReloadBroker({directory:dir,secret:KEY,driver,verifyCandidateBundle:async()=>true,verifyActiveRoute:async()=>true});
 await broker.start();t.after(async()=>{await broker.stop();await fs.rm(dir,{recursive:true,force:true});});
 const response=await createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:KEY}).activate({expectedBundleSha256:DIGEST});
 assert.equal(response.status,'NGINX_VALIDATION_FAILED'); assert.deepEqual(trace,['nginx-test']);
});
test('socket and workspace remain owner-private',async t=>{
 const {broker,dir}=await suite(t);
 assert.equal((await fs.lstat(dir)).mode & 0o077,0);
 assert.equal((await fs.lstat(broker.socketPath)).mode & 0o077,0);
});
test('owner consent never inferred from signed transport result',async t=>{
 const {broker}=await suite(t);const r=await createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:KEY}).activate({expectedBundleSha256:DIGEST});
 assert.equal(r.productionChangeAuthorized,false);assert.equal(r.liveAttested,false);
});

test('malicious socket responder cannot forge a success without authenticated reply MAC',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dp-forged-reply-'));await fs.chmod(dir,0o700);
 const socketPath=path.join(dir,'nginx-reload.sock');
 const fake=net.createServer(s=>s.on('data',()=>s.end(JSON.stringify({status:'RELOAD_AND_VERIFICATION_REPORTED',productionChangeAuthorized:false,liveAttested:false})+'\n')));
 await new Promise((resolve,reject)=>{fake.once('error',reject);fake.listen(socketPath,resolve);});
 t.after(async()=>{await new Promise(r=>fake.close(r));await fs.rm(dir,{recursive:true,force:true});});
 const r=await createAuthenticatedReloadClient({socketPath,secret:KEY}).activate({expectedBundleSha256:DIGEST});
 assert.equal(r.status,'BLOCKED_BAD_REPLY');
});
test('fake reply carrying mismatched request ID and MAC cannot claim activated route',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dp-forged-reply-'));await fs.chmod(dir,0o700);
 const socketPath=path.join(dir,'nginx-reload.sock');
 const fake=net.createServer(s=>s.on('data',()=>s.end(JSON.stringify({status:'RELOAD_AND_VERIFICATION_REPORTED',productionChangeAuthorized:false,liveAttested:false,requestId:'a'.repeat(32),replyMac:'f'.repeat(64)})+'\n')));
 await new Promise((resolve,reject)=>{fake.once('error',reject);fake.listen(socketPath,resolve);});
 t.after(async()=>{await new Promise(r=>fake.close(r));await fs.rm(dir,{recursive:true,force:true});});
 const r=await createAuthenticatedReloadClient({socketPath,secret:KEY,nonce:()=>('b'.repeat(32))}).activate({expectedBundleSha256:DIGEST});
 assert.equal(r.status,'BLOCKED_BAD_REPLY');
});
