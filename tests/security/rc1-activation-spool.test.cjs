'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {provisionPrivateQueue,createSpoolClient,createSpoolHost}=require('../../utils/rc1-activation-spool.cjs');
const SECRET=Buffer.alloc(32,79),ALT=Buffer.alloc(32,11);
const TIME=1783190000000;
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-spool-'));
 await fs.mkdir(path.join(root,'config'));await fs.mkdir(path.join(root,'build','sites-enabled'),{recursive:true});
 await fs.writeFile(path.join(root,'config','nginx.production.conf'),'events {}\nhttp {}\n');
 await fs.writeFile(path.join(root,'config','default.production.conf'),'server { location / { deny all; } }\n');
 await fs.writeFile(path.join(root,'build','sites-enabled','apps.generated.conf'),'location /safe { proxy_pass http://safe; }\n');
 const queue=path.join(root,'ipc');await fs.mkdir(queue,{mode:0o700});
 await provisionPrivateQueue({directory:queue});
 const expectedCandidateSha256=(await createCandidateManifest({approvedRoot:root})).candidateSha256;
 return {root,queue,expectedCandidateSha256,cleanup:()=>fs.rm(root,{recursive:true,force:true})};
}
function deps(f,s=SECRET,nonce='c'.repeat(32)){
 const client=createSpoolClient({directory:f.queue,secret:s,now:()=>TIME,nonce:()=>nonce});
 const host=createSpoolHost({directory:f.queue,approvedRoot:f.root,secret:s,now:()=>TIME,
  executeVerified:async()=> 'RELOAD_AND_VERIFICATION_REPORTED'});
 return {client,host};
}
test('private shared-file queue proves fixed signed config-set activation without Unix socket or server',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client,host}=deps(f);
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 assert.equal(ticket.requestId,'c'.repeat(32));
 assert.equal(await client.readResult(ticket),null);
 assert.equal((await host.processOne(ticket.requestId)).code,'HOST_PROCESSED');
 assert.deepEqual(await client.readResult(ticket),{status:'RELOAD_AND_VERIFICATION_REPORTED',verified:true});
 assert.equal((await fs.stat(path.join(f.queue,'requests',ticket.requestId+'.json'))).mode&0o777,0o600);
});
test('host independently rejects different config bytes before privileged callback',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client}=deps(f);
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 await fs.writeFile(path.join(f.root,'config','default.production.conf'),'server { allow all; }');
 let called=0;
 const host=createSpoolHost({directory:f.queue,approvedRoot:f.root,secret:SECRET,now:()=>TIME,
  executeVerified:async()=>{called++;return 'RELOAD_AND_VERIFICATION_REPORTED';}});
 assert.equal((await host.processOne(ticket.requestId)).code,'HOST_PROCESSED');
 assert.equal(called,0);
 assert.deepEqual(await client.readResult(ticket),{status:'CONFIG_SET_DIGEST_MISMATCH',verified:true});
});
test('wrong signer cannot induce privileged callback',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const client=createSpoolClient({directory:f.queue,secret:ALT,now:()=>TIME,nonce:()=> 'd'.repeat(32)});
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 let called=0;
 const host=createSpoolHost({directory:f.queue,approvedRoot:f.root,secret:SECRET,now:()=>TIME,
  executeVerified:async()=>{called++;return 'RELOAD_AND_VERIFICATION_REPORTED';}});
 assert.equal((await host.processOne(ticket.requestId)).code,'REQUEST_NOT_AUTHORIZED');
 assert.equal(called,0);
});
test('durable replay reservation prevents second host execution',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const client=deps(f).client;
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 let called=0;
 const host=createSpoolHost({directory:f.queue,approvedRoot:f.root,secret:SECRET,now:()=>TIME,
  executeVerified:async()=>{called++;return 'RELOAD_AND_VERIFICATION_REPORTED';}});
 assert.equal((await host.processOne(ticket.requestId)).code,'HOST_PROCESSED');
 assert.equal((await host.processOne(ticket.requestId)).code,'REPLAY_ALREADY_RESERVED');
 assert.equal(called,1);
});
test('cannot overwrite existing request file or choose traversal ID',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client,host}=deps(f);
 await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 await assert.rejects(client.submit({expectedCandidateSha256:f.expectedCandidateSha256}),/REQUEST_ALREADY_EXISTS/);
 assert.equal((await host.processOne('../passwd')).code,'INVALID_REQUEST_ID');
});
test('symlinked queue directory fails closed before any mutation',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const p=path.join(f.queue,'requests');await fs.rename(p,p+'.real');await fs.symlink(p+'.real',p);
 const {client}=deps(f);
 await assert.rejects(client.submit({expectedCandidateSha256:f.expectedCandidateSha256}),/UNSAFE_PRIVATE_QUEUE_DIRECTORY/);
});
test('host rejects altered request file even when ticket has a legitimate name',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client,host}=deps(f);
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 const p=path.join(f.queue,'requests',ticket.requestId+'.json');
 const req=JSON.parse(await fs.readFile(p,'utf8'));req.expectedCandidateSha256='f'.repeat(64);
 await fs.writeFile(p,JSON.stringify(req));
 assert.equal((await host.processOne(ticket.requestId)).code,'REQUEST_NOT_AUTHORIZED');
});
test('client rejects tampered signed host reply instead of claiming success',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client,host}=deps(f);
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 await host.processOne(ticket.requestId);
 const p=path.join(f.queue,'responses',ticket.requestId+'.json');
 const response=JSON.parse(await fs.readFile(p,'utf8'));response.replyMac='0'.repeat(64);
 await fs.writeFile(p,JSON.stringify(response));
 assert.deepEqual(await client.readResult(ticket),{status:'BLOCKED_BAD_REPLY',verified:false});
});
test('host reports indeterminate when candidate content changes after callback',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client}=deps(f);
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 const host=createSpoolHost({directory:f.queue,approvedRoot:f.root,secret:SECRET,now:()=>TIME,
  executeVerified:async()=>{await fs.writeFile(path.join(f.root,'config','nginx.production.conf'),'events { worker_connections 1; }');return 'RELOAD_AND_VERIFICATION_REPORTED';}});
 await host.processOne(ticket.requestId);
 assert.deepEqual(await client.readResult(ticket),{status:'HOST_OPERATION_INDETERMINATE',verified:true});
});
test('host callback exceptions do not make a success; replay remains quarantined',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client}=deps(f);
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 const host=createSpoolHost({directory:f.queue,approvedRoot:f.root,secret:SECRET,now:()=>TIME,
  executeVerified:async()=>{throw Error('DOCKER_NOT_AVAILABLE');}});
 assert.equal((await host.processOne(ticket.requestId)).code,'HOST_PROCESSED');
 assert.deepEqual(await client.readResult(ticket),{status:'HOST_OPERATION_INDETERMINATE',verified:true});
 assert.equal((await host.processOne(ticket.requestId)).code,'REPLAY_ALREADY_RESERVED');
});
test('readResult handles missing response without initiating live action',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client}=deps(f);
 const ticket=await client.submit({expectedCandidateSha256:f.expectedCandidateSha256});
 assert.equal(await client.readResult(ticket),null);
});
test('overpermissive queue directory refuses processing, without status success',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const {client}=deps(f);
 await fs.chmod(path.join(f.queue,'requests'),0o755);
 await assert.rejects(client.submit({expectedCandidateSha256:f.expectedCandidateSha256}),/UNSAFE_PRIVATE_QUEUE_DIRECTORY/);
});
