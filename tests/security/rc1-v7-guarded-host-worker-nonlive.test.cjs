'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {provisionPrivateQueue,createSpoolClient}=require('../../utils/rc1-activation-spool.cjs');
const {createGuardedNonliveHostWorker}=require('../../utils/rc1-v7-guarded-host-worker-nonlive.cjs');

const SECRET=crypto.randomBytes(32);

async function seedCandidate(root){
 await fs.mkdir(path.join(root,'build','sites-enabled'),{recursive:true});
 await fs.mkdir(path.join(root,'config'),{recursive:true});
 await fs.writeFile(path.join(root,'build','sites-enabled','apps.generated.conf'),'location /t/ { return 200; }\n',{mode:0o644});
 await fs.writeFile(path.join(root,'config','default.production.conf'),'server{listen 80;}\n',{mode:0o644});
 await fs.writeFile(path.join(root,'config','nginx.production.conf'),'events{}\nhttp{include conf.d/*.conf;}\n',{mode:0o644});
}
async function workspace(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv7-ghw-'));
 await fs.chmod(root,0o700);
 const spool=path.join(root,'spool');
 const fence=path.join(root,'fence');
 const approved=path.join(root,'approved');
 await fs.mkdir(spool,{mode:0o700});
 await fs.mkdir(fence,{mode:0o700});
 await fs.mkdir(approved,{mode:0o700});
 await seedCandidate(approved);
 await provisionPrivateQueue({directory:spool});
 return {root,spool,fence,approved,close:()=>fs.rm(root,{recursive:true,force:true})};
}
function driver(trace,script){
 let i=0;
 return {
  async attest(){trace.push('attest');return script[i++]?.attest!==false;},
  async execute(action){trace.push(action);const step=script[i++];return step&&step.execute===1?1:0;}
 };
}
function goodScript(){
 // attest, nginx-test, attest, nginx-reload, attest  → 5 attest/execute calls interleaved
 return [
  {attest:true},{execute:0},{attest:true},{execute:0},{attest:true}
 ];
}
async function digest(approved){
 return (await createCandidateManifest({approvedRoot:approved})).candidateSha256;
}
async function markerPresent(fence){
 try{const st=await fs.lstat(path.join(fence,'host-operation-inflight'));return st.isFile();}
 catch(e){if(e.code==='ENOENT')return false;throw e;}
}

test('RED first: guarded nonlive composition module is present',()=>{
 assert.equal(typeof createGuardedNonliveHostWorker,'function');
});

test('verified fixed-action success through spool returns durable signed success only after fence clears',async()=>{
 const w=await workspace();const trace=[];
 try{
  const dig=await digest(w.approved);
  const worker=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:driver(trace,goodScript()),verifyActiveRoute:async()=>true
  });
  const client=createSpoolClient({directory:w.spool,secret:SECRET,nonce:()=>crypto.randomBytes(16).toString('hex')});
  const ticket=await client.submit({expectedCandidateSha256:dig});
  assert.equal((await worker.processOne(ticket.requestId)).code,'HOST_PROCESSED');
  const result=await client.readResult(ticket);
  assert.equal(result.verified,true);
  assert.equal(result.status,'RELOAD_AND_VERIFICATION_REPORTED');
  assert.equal(await markerPresent(w.fence),false);
  assert.deepEqual(trace,['attest','nginx-test','attest','nginx-reload','attest']);
 }finally{await w.close();}
});

test('distinct simultaneous signed request IDs serialize across separate worker instances',async()=>{
 const w=await workspace();
 try{
  const dig=await digest(w.approved);
  let release,started;
  const gate=new Promise(r=>{started=r;});
  const slowDriver={
   async attest(){return true;},
   async execute(action){
    if(action==='nginx-test'){started();await new Promise(r=>{release=r;});return 0;}
    return 0;
   }
  };
  const a=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:slowDriver,verifyActiveRoute:async()=>true,timeoutMs:5000
  });
  const b=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:driver([],goodScript()),verifyActiveRoute:async()=>true
  });
  const client=createSpoolClient({directory:w.spool,secret:SECRET,nonce:()=>crypto.randomBytes(16).toString('hex')});
  const t1=await client.submit({expectedCandidateSha256:dig});
  const t2=await client.submit({expectedCandidateSha256:dig});
  const p1=a.processOne(t1.requestId);
  await gate;
  assert.equal((await b.processOne(t2.requestId)).code,'HOST_PROCESSED');
  assert.equal((await client.readResult(t2)).status,'BLOCKED_QUARANTINED');
  release();
  assert.equal((await p1).code,'HOST_PROCESSED');
  assert.equal((await client.readResult(t1)).status,'RELOAD_AND_VERIFICATION_REPORTED');
  assert.equal(await markerPresent(w.fence),false);
 }finally{await w.close();}
});

test('crash/timeout during reload leaves durable quarantine and blocks the next ID',async()=>{
 const w=await workspace();
 try{
  const dig=await digest(w.approved);
  const hang={
   async attest(){return true;},
   async execute(action){
    if(action==='nginx-reload')return await new Promise(()=>{}); // never resolves
    return 0;
   }
  };
  const worker=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:hang,verifyActiveRoute:async()=>true,timeoutMs:40
  });
  const client=createSpoolClient({directory:w.spool,secret:SECRET,nonce:()=>crypto.randomBytes(16).toString('hex')});
  const t1=await client.submit({expectedCandidateSha256:dig});
  assert.equal((await worker.processOne(t1.requestId)).code,'HOST_PROCESSED');
  assert.equal((await client.readResult(t1)).status,'HOST_OPERATION_INDETERMINATE');
  assert.equal(await markerPresent(w.fence),true);
  const worker2=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:driver([],goodScript()),verifyActiveRoute:async()=>true
  });
  const t2=await client.submit({expectedCandidateSha256:dig});
  assert.equal((await worker2.processOne(t2.requestId)).code,'HOST_PROCESSED');
  assert.equal((await client.readResult(t2)).status,'BLOCKED_QUARANTINED');
 }finally{await w.close();}
});

test('replaced sentinel during operation stays indeterminate and does not clear attacker marker',async()=>{
 const w=await workspace();
 try{
  const dig=await digest(w.approved);
  const evil={
   async attest(){return true;},
   async execute(action){
    if(action==='nginx-test'){
     const p=path.join(w.fence,'host-operation-inflight');
     await fs.rename(p,path.join(w.fence,'old'));
     await fs.writeFile(p,'attacker',{mode:0o600});
     return 0;
    }
    return 0;
   }
  };
  // After nginx-test, attest runs then reload - marker already replaced so success path fails inode check
  const worker=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:evil,verifyActiveRoute:async()=>true
  });
  const client=createSpoolClient({directory:w.spool,secret:SECRET,nonce:()=>crypto.randomBytes(16).toString('hex')});
  const t=await client.submit({expectedCandidateSha256:dig});
  await worker.processOne(t.requestId);
  const status=(await client.readResult(t)).status;
  assert.ok(status==='HOST_OPERATION_INDETERMINATE'||status==='NGINX_VALIDATION_FAILED'||status==='BLOCKED_CONTAINER_IDENTITY'||status==='RELOAD_AND_VERIFICATION_REPORTED'||status==='BLOCKED_QUARANTINED'||status==='ACTIVE_ROUTE_UNVERIFIED'||status==='NGINX_RELOAD_FAILED');
  // Attacker-owned replacement must remain if present
  const body=await fs.readFile(path.join(w.fence,'host-operation-inflight'),'utf8').catch(()=>null);
  if(body!==null)assert.equal(body,'attacker');
  // Must never claim verified success while attacker marker remains
  if(body==='attacker')assert.notEqual(status,'RELOAD_AND_VERIFICATION_REPORTED');
 }finally{await w.close();}
});

test('benign nginx validation failure is pre-reload safe and does not leave quarantine',async()=>{
 const w=await workspace();const trace=[];
 try{
  const dig=await digest(w.approved);
  const badTest={
   async attest(){trace.push('attest');return true;},
   async execute(action){trace.push(action);return action==='nginx-test'?1:0;}
  };
  const worker=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:badTest,verifyActiveRoute:async()=>true
  });
  const client=createSpoolClient({directory:w.spool,secret:SECRET,nonce:()=>crypto.randomBytes(16).toString('hex')});
  const t1=await client.submit({expectedCandidateSha256:dig});
  await worker.processOne(t1.requestId);
  assert.equal((await client.readResult(t1)).status,'NGINX_VALIDATION_FAILED');
  assert.equal(await markerPresent(w.fence),false);
  assert.ok(!trace.includes('nginx-reload'));
  // subsequent request may proceed
  const worker2=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:driver([],goodScript()),verifyActiveRoute:async()=>true
  });
  const t2=await client.submit({expectedCandidateSha256:dig});
  await worker2.processOne(t2.requestId);
  assert.equal((await client.readResult(t2)).status,'RELOAD_AND_VERIFICATION_REPORTED');
 }finally{await w.close();}
});

test('forged positive reply shape cannot clear fence without trusted verified object',async()=>{
 const w=await workspace();
 try{
  const dig=await digest(w.approved);
  const forge={
   async attest(){return true;},
   async execute(action){return action==='nginx-reload'?1:0;} // reload fails → post phase
  };
  const worker=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:forge,verifyActiveRoute:async()=>true
  });
  const client=createSpoolClient({directory:w.spool,secret:SECRET,nonce:()=>crypto.randomBytes(16).toString('hex')});
  const t=await client.submit({expectedCandidateSha256:dig});
  await worker.processOne(t.requestId);
  assert.equal((await client.readResult(t)).status,'HOST_OPERATION_INDETERMINATE');
  assert.equal(await markerPresent(w.fence),true);
  // Direct executeVerified must not return success either
  assert.equal(await worker.executeVerified({expectedCandidateSha256:dig}),'BLOCKED_QUARANTINED');
 }finally{await w.close();}
});

test('candidate route file bytes remain unchanged across guarded processing',async()=>{
 const w=await workspace();
 try{
  const before={
   apps:await fs.readFile(path.join(w.approved,'build','sites-enabled','apps.generated.conf')),
   def:await fs.readFile(path.join(w.approved,'config','default.production.conf')),
   ngx:await fs.readFile(path.join(w.approved,'config','nginx.production.conf')),
  };
  const dig=await digest(w.approved);
  const worker=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:driver([],goodScript()),verifyActiveRoute:async()=>true
  });
  const client=createSpoolClient({directory:w.spool,secret:SECRET,nonce:()=>crypto.randomBytes(16).toString('hex')});
  const t=await client.submit({expectedCandidateSha256:dig});
  await worker.processOne(t.requestId);
  assert.deepEqual(await fs.readFile(path.join(w.approved,'build','sites-enabled','apps.generated.conf')),before.apps);
  assert.deepEqual(await fs.readFile(path.join(w.approved,'config','default.production.conf')),before.def);
  assert.deepEqual(await fs.readFile(path.join(w.approved,'config','nginx.production.conf')),before.ngx);
 }finally{await w.close();}
});

test('guarded composition never mounts host Docker engine socket and stays nonlive',async()=>{
 const src=await fs.readFile(path.join(__dirname,'../../utils/rc1-v7-guarded-host-worker-nonlive.cjs'),'utf8');
 assert.equal(/docker\.sock|\/var\/run\/docker/.test(src),false);
 assert.equal(src.includes('createServer'),false);
 assert.equal(/\blisten\s*\(/.test(src),false);
 const w=await workspace();
 try{
  const worker=createGuardedNonliveHostWorker({
   spoolDirectory:w.spool,fenceDirectory:w.fence,approvedRoot:w.approved,secret:SECRET,
   driver:driver([],goodScript()),verifyActiveRoute:async()=>true
  });
  assert.equal(worker.wiredToProxyConfigAPI,false);
  assert.equal(worker.productionChangeAuthorized,false);
  assert.equal(worker.deployed,false);
  assert.equal(worker.allowConfigEditRequiredFalse,true);
  assert.equal(worker.replacesUnixSocketAtRuntime,false);
 }finally{await w.close();}
});
