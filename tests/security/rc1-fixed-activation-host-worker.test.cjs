'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {provisionPrivateQueue,createSpoolClient}=require('../../utils/rc1-activation-spool.cjs');
const {createFixedActivationHostWorker}=require('../../utils/rc1-fixed-activation-host-worker.cjs');
const secret=Buffer.alloc(32,62),NOW=1783190000000;
async function context(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-worker-'));
 await fs.mkdir(path.join(root,'config'));await fs.mkdir(path.join(root,'build','sites-enabled'),{recursive:true});
 await fs.writeFile(path.join(root,'config','default.production.conf'),'server { deny all; }\n');
 await fs.writeFile(path.join(root,'config','nginx.production.conf'),'events {}\nhttp {}\n');
 await fs.writeFile(path.join(root,'build','sites-enabled','apps.generated.conf'),'location /x { proxy_pass http://x; }\n');
 const queue=path.join(root,'broker-ipc');await fs.mkdir(queue,{mode:0o700});await provisionPrivateQueue({directory:queue});
 const digest=(await createCandidateManifest({approvedRoot:root})).candidateSha256;
 const client=createSpoolClient({directory:queue,secret,now:()=>NOW,nonce:()=>Math.random().toString(16).slice(2).padEnd(32,'0').slice(0,32)});
 return {root,queue,digest,client,cleanup:()=>fs.rm(root,{recursive:true,force:true})};
}
function setup(f,{attest=true,testExit=0,reloadExit=0,active=true}={}){
 const actions=[];
 const driver={
  attest:async()=>{actions.push('attest');return attest;},
  execute:async action=>{actions.push(action);return action==='nginx-test'?testExit:reloadExit;}
 };
 const worker=createFixedActivationHostWorker({directory:f.queue,approvedRoot:f.root,secret,driver,
  verifyActiveRoute:async()=>{actions.push('active-route');return active;},now:()=>NOW});
 return {worker,actions};
}
test('typed host-worker proves validated fixed-action command order and signed response',async t=>{
 const f=await context();t.after(f.cleanup);const {worker,actions}=setup(f);
 const ticket=await f.client.submit({expectedCandidateSha256:f.digest});
 assert.deepEqual(await worker.processOne(ticket.requestId),{code:'HOST_PROCESSED'});
 assert.deepEqual(actions,['attest','nginx-test','attest','nginx-reload','attest','active-route']);
 assert.deepEqual(await f.client.readResult(ticket),{status:'RELOAD_AND_VERIFICATION_REPORTED',verified:true});
});
test('invalid nginx config cannot cause reload',async t=>{
 const f=await context();t.after(f.cleanup);const {worker,actions}=setup(f,{testExit:1});
 const ticket=await f.client.submit({expectedCandidateSha256:f.digest});await worker.processOne(ticket.requestId);
 assert.deepEqual(actions,['attest','nginx-test']);
 assert.deepEqual(await f.client.readResult(ticket),{status:'NGINX_VALIDATION_FAILED',verified:true});
});
test('unapproved Docker container/image identity cannot cause nginx execution',async t=>{
 const f=await context();t.after(f.cleanup);const {worker,actions}=setup(f,{attest:false});
 const ticket=await f.client.submit({expectedCandidateSha256:f.digest});await worker.processOne(ticket.requestId);
 assert.deepEqual(actions,['attest']);
 assert.deepEqual(await f.client.readResult(ticket),{status:'BLOCKED_CONTAINER_IDENTITY',verified:true});
});
test('failed reload never yields success, and replay is blocked',async t=>{
 const f=await context();t.after(f.cleanup);const {worker,actions}=setup(f,{reloadExit:1});
 const ticket=await f.client.submit({expectedCandidateSha256:f.digest});await worker.processOne(ticket.requestId);
 assert.deepEqual(await f.client.readResult(ticket),{status:'NGINX_RELOAD_FAILED',verified:true});
 assert.equal((await worker.processOne(ticket.requestId)).code,'REPLAY_ALREADY_RESERVED');
 assert.equal(actions.includes('active-route'),false);
});
test('active route must actually be verified following reload',async t=>{
 const f=await context();t.after(f.cleanup);const {worker}=setup(f,{active:false});
 const ticket=await f.client.submit({expectedCandidateSha256:f.digest});await worker.processOne(ticket.requestId);
 assert.deepEqual(await f.client.readResult(ticket),{status:'ACTIVE_ROUTE_UNVERIFIED',verified:true});
});
test('host worker cannot process unapproved attacker-controlled candidate digest',async t=>{
 const f=await context();t.after(f.cleanup);const {worker,actions}=setup(f);
 const ticket=await f.client.submit({expectedCandidateSha256:'1'.repeat(64)});
 await worker.processOne(ticket.requestId);
 assert.equal(actions.length,0);
 assert.deepEqual(await f.client.readResult(ticket),{status:'CONFIG_SET_DIGEST_MISMATCH',verified:true});
});
test('host worker does not invoke Docker before processOne is explicitly called',async t=>{
 const f=await context();t.after(f.cleanup);const {worker,actions}=setup(f);
 await f.client.submit({expectedCandidateSha256:f.digest});
 assert.equal(actions.length,0);
 assert.equal(typeof worker.processOne,'function');
});
test('hanging host callback times out and persists replay quarantine',async t=>{
 const f=await context();t.after(f.cleanup);
 const driver={attest:async()=>new Promise(()=>{}),execute:async()=>{throw Error('should not run');}};
 const worker=createFixedActivationHostWorker({directory:f.queue,approvedRoot:f.root,secret,
  driver,verifyActiveRoute:async()=>true,now:()=>NOW,timeoutMs:500});
 const ticket=await f.client.submit({expectedCandidateSha256:f.digest});
 await worker.processOne(ticket.requestId);
 assert.deepEqual(await f.client.readResult(ticket),{status:'HOST_OPERATION_INDETERMINATE',verified:true});
 assert.equal((await worker.processOne(ticket.requestId)).code,'REPLAY_ALREADY_RESERVED');
});
