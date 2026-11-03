'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {createRouteActivationSpoolAdapter}=require('../../utils/rc1-v8-spool-activation-adapter.cjs');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {createSpoolClient,createSpoolHost,provisionPrivateQueue}=require('../../utils/rc1-activation-spool.cjs');
const HEX='b'.repeat(64);
const SUCCESS='RELOAD_AND_VERIFICATION_REPORTED';
const AUTHED=Object.freeze({status:SUCCESS,verified:true});
const resultStatus = r=>r&&r.status;
async function tempFixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-v8-root-'));
 await fs.chmod(root,0o700);
 for(const dir of ['build','build/sites-enabled','config','queue']){
  await fs.mkdir(path.join(root,dir),{mode:0o700});
 }
 for(const [name,text] of [
  ['build/sites-enabled/apps.generated.conf','location /v8 { return 200; }\n'],
  ['config/default.production.conf','server { listen 80; }\n'],
  ['config/nginx.production.conf','http { include /etc/nginx/conf.d/*.conf; }\n']])
  await fs.writeFile(path.join(root,name),text,{mode:0o600});
 const secret=crypto.randomBytes(32);
 await provisionPrivateQueue({directory:path.join(root,'queue')});
 const manifest=await createCandidateManifest({approvedRoot:root});
 const expectedBundleSha256=manifest.parts[0].sha256;
 let seq=0;
 const client=createSpoolClient({directory:path.join(root,'queue'),secret,nonce:()=> (++seq).toString(16).padStart(32,'0')});
 const host=createSpoolHost({directory:path.join(root,'queue'),approvedRoot:root,secret,
  executeVerified:async()=>SUCCESS});
 return {root,client,host,manifest,expectedBundleSha256,close:()=>fs.rm(root,{recursive:true,force:true})};
}
test('cannot import unimplemented adapter before CTO source exists [RED]',()=>{
 assert.equal(typeof createRouteActivationSpoolAdapter,'function');
});
test('real candidate digest must match the v5 transactional bundle digest before any queue message',async()=>{
 const f=await tempFixture();let calls=0;
 try{
  const spool={submit:async()=>{calls++;return {};},readResult:async()=>null};
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:spool});
  const r=await a.activate({expectedBundleSha256:HEX});
  assert.equal(resultStatus(r),'CONFIG_SET_DIGEST_MISMATCH');assert.equal(calls,0);
  assert.equal(r.liveAttested,false);assert.equal(r.productionChangeAuthorized,false);
 }finally{await f.close();}
});
test('invalid bundle digest fails before filesystem queue creation or read',async()=>{
 const f=await tempFixture();let called=0;
 try{
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:{submit:async()=>{called++;},readResult:async()=>{called++;}}});
  for(const bad of ['','$'.repeat(64),null,undefined,12,'f'.repeat(63)]){
   const r=await a.activate({expectedBundleSha256:bad});
   assert.equal(r.status,'BLOCKED_INVALID_REQUEST');
  }
  assert.equal(called,0);
 }finally{await f.close();}
});
test('unreadable or missing security config is refused before host activation',async()=>{
 const f=await tempFixture();let calls=0;
 try{
  await fs.unlink(path.join(f.root,'config/nginx.production.conf'));
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:{submit:async()=>{calls++;},readResult:async()=>null}});
  assert.equal((await a.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'CONFIG_SET_UNVERIFIABLE');
  assert.equal(calls,0);
 }finally{await f.close();}
});
test('submit failure is indeterminate because queue publication might have happened',async()=>{
 const f=await tempFixture();try{
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:{submit:async()=>{throw Error('EACCES');},readResult:async()=>AUTHED}});
  assert.equal((await a.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'HOST_OPERATION_INDETERMINATE');
 }finally{await f.close();}
});
test('a post-submit missing host reply is indeterminate and cannot be safely retried',async()=>{
 const f=await tempFixture();let writes=0;try{
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:{submit:async()=>{writes++;return{requestId:'a'.repeat(32),expectedCandidateSha256:f.manifest.candidateSha256};},readResult:async()=>null},timeoutMs:40,pollMs:10});
  assert.equal((await a.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'HOST_OPERATION_INDETERMINATE');
  assert.equal(writes,1);
 }finally{await f.close();}
});
test('valid authenticated success only with verified host reply and matching immutable ticket',async()=>{
 const f=await tempFixture();try{
  const spool={submit:async()=>({requestId:'c'.repeat(32),expectedCandidateSha256:f.manifest.candidateSha256}),readResult:async()=>AUTHED};
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:spool});
  const r=await a.activate({expectedBundleSha256:f.expectedBundleSha256});
  assert.equal(r.status,SUCCESS);assert.equal(r.liveAttested,false);assert.equal(r.productionChangeAuthorized,false);
 }finally{await f.close();}
});
test('forged unsigned success never becomes reload verified',async()=>{
 const f=await tempFixture();try{
  const spool={submit:async()=>({requestId:'c'.repeat(32),expectedCandidateSha256:f.manifest.candidateSha256}),readResult:async()=>({status:SUCCESS,verified:false})};
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:spool});
  assert.equal((await a.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'HOST_OPERATION_INDETERMINATE');
 }finally{await f.close();}
});
test('host nginx validation reject may be surfaced with signed evidence without claiming success',async()=>{
 const f=await tempFixture();try{
  const spool={submit:async()=>({requestId:'c'.repeat(32),expectedCandidateSha256:f.manifest.candidateSha256}),readResult:async()=>({status:'NGINX_VALIDATION_FAILED',verified:true})};
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:spool});
  assert.equal((await a.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'NGINX_VALIDATION_FAILED');
 }finally{await f.close();}
});
test('all uncertain reload, callback, bad reply and spoofed states remain indeterminate',async()=>{
 const f=await tempFixture();try{
  for(const reply of [
   {status:'ACTIVE_ROUTE_UNVERIFIED',verified:true},
   {status:'NGINX_RELOAD_FAILED',verified:true},
   {status:'HOST_OPERATION_INDETERMINATE',verified:true},
   {status:SUCCESS,verified:true,foo:'excess'},
   'success',null,{},
  ]){
   const spool={submit:async()=>({requestId:'c'.repeat(32),expectedCandidateSha256:f.manifest.candidateSha256}),readResult:async()=>reply};
   const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:spool,timeoutMs:30,pollMs:10});
   const r=await a.activate({expectedBundleSha256:f.expectedBundleSha256});
   assert.notEqual(r.status,SUCCESS);
  }
 }finally{await f.close();}
});
test('unexpected response ticket digest or malformed id fails closed',async()=>{
 const f=await tempFixture();try{
  for(const ticket of [{requestId:'z',expectedCandidateSha256:f.manifest.candidateSha256},{requestId:'c'.repeat(32),expectedCandidateSha256:'0'.repeat(64)}]){
   let read=false;
   const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:{submit:async()=>ticket,readResult:async()=>{read=true;return AUTHED;}}});
   assert.equal((await a.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'HOST_OPERATION_INDETERMINATE');assert.equal(read,false);
  }
 }finally{await f.close();}
});
test('signed round trip using genuine v6 spool and trusted fake host callback',async()=>{
 const f=await tempFixture();try{
  const original=f.client.submit.bind(f.client);
  const spool={submit:async params=>{const ticket=await original(params);await f.host.processOne(ticket.requestId);return ticket;},readResult:f.client.readResult};
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:spool});
  const r=await a.activate({expectedBundleSha256:f.expectedBundleSha256});
  assert.equal(r.status,SUCCESS);
  assert.equal(r.productionChangeAuthorized,false);assert.equal(r.liveAttested,false);
 }finally{await f.close();}
});
test('real spool cannot complete after changed security config',async()=>{
 const f=await tempFixture();try{
  const original=f.client.submit.bind(f.client);
  const spool={submit:async params=>{const ticket=await original(params);await fs.writeFile(path.join(f.root,'config/default.production.conf'),'server { deny all; }');await f.host.processOne(ticket.requestId);return ticket;},readResult:f.client.readResult};
  const a=createRouteActivationSpoolAdapter({approvedRoot:f.root,spoolClient:spool});
  const r=await a.activate({expectedBundleSha256:f.expectedBundleSha256});
  assert.equal(r.status,'HOST_OPERATION_INDETERMINATE');
 }finally{await f.close();}
});

test('hanging submit cannot exceed one global operation deadline, regardless of later file publish',async()=>{
 const f=await tempFixture();try{
  const adapter=createRouteActivationSpoolAdapter({approvedRoot:f.root,timeoutMs:45,pollMs:10,
   spoolClient:{submit:()=>new Promise(()=>{}),readResult:async()=>AUTHED}});
  const before=Date.now();
  assert.equal((await adapter.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'HOST_OPERATION_INDETERMINATE');
  assert.ok(Date.now()-before<300);
 }finally{await f.close();}
});
test('hanging signed result retrieval cannot exceed one global operation deadline',async()=>{
 const f=await tempFixture();try{
  const adapter=createRouteActivationSpoolAdapter({approvedRoot:f.root,timeoutMs:45,pollMs:10,
   spoolClient:{submit:async()=>({requestId:'c'.repeat(32),expectedCandidateSha256:f.manifest.candidateSha256}),readResult:()=>new Promise(()=>{})}});
  const before=Date.now();
  assert.equal((await adapter.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'HOST_OPERATION_INDETERMINATE');
  assert.ok(Date.now()-before<300);
 }finally{await f.close();}
});
test('hanging manifest reader cannot submit a request or exceed deadline',async()=>{
 const f=await tempFixture();let submit=0;try{
  const adapter=createRouteActivationSpoolAdapter({approvedRoot:f.root,timeoutMs:45,pollMs:10,
   manifestReader:()=>new Promise(()=>{}),
   spoolClient:{submit:async()=>{submit++;},readResult:async()=>AUTHED}});
  const before=Date.now();
  assert.equal((await adapter.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'BLOCKED_UNAVAILABLE');
  assert.ok(Date.now()-before<300);assert.equal(submit,0);
 }finally{await f.close();}
});
test('late success reply cannot cross global deadline or clear indeterminate route state',async()=>{
 const f=await tempFixture();try{
  const adapter=createRouteActivationSpoolAdapter({approvedRoot:f.root,timeoutMs:35,pollMs:10,
   spoolClient:{submit:async()=>({requestId:'c'.repeat(32),expectedCandidateSha256:f.manifest.candidateSha256}),readResult:async()=>{await new Promise(resolve=>setTimeout(resolve,80));return AUTHED;}}});
  assert.equal((await adapter.activate({expectedBundleSha256:f.expectedBundleSha256})).status,'HOST_OPERATION_INDETERMINATE');
 }finally{await f.close();}
});
test('abort during in-flight signed response never turns late success into accepted activation',async()=>{
 const f=await tempFixture();try{
  const abort=new AbortController();
  const adapter=createRouteActivationSpoolAdapter({approvedRoot:f.root,timeoutMs:200,pollMs:10,
   spoolClient:{submit:async()=>({requestId:'c'.repeat(32),expectedCandidateSha256:f.manifest.candidateSha256}),readResult:async()=>{abort.abort();return AUTHED;}}});
  assert.equal((await adapter.activate({expectedBundleSha256:f.expectedBundleSha256,signal:abort.signal})).status,'HOST_OPERATION_INDETERMINATE');
 }finally{await f.close();}
});
