'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createGuardedNonliveHostWorker}=require('../../utils/rc1-v7-guarded-host-worker-nonlive.cjs');
const {provisionPrivateQueue,createSpoolClient}=require('../../utils/rc1-activation-spool.cjs');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
async function fixture({driver,verifyActiveRoute}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv8-guard-'));await fs.chmod(root,0o700);
 const approved=path.join(root,'approved'),spool=path.join(root,'spool'),fence=path.join(root,'fence');
 for(const dir of [approved,spool,fence])await fs.mkdir(dir,{mode:0o700});
 for(const dir of ['build','build/sites-enabled','config'])await fs.mkdir(path.join(approved,dir),{mode:0o700});
 for(const [p,data]of[
 ['build/sites-enabled/apps.generated.conf','location /guard { return 200; }\n'],
 ['config/default.production.conf','server { listen 80; }\n'],
 ['config/nginx.production.conf','http { server { listen 80; } }\n']])await fs.writeFile(path.join(approved,p),data,{mode:0o600});
 await provisionPrivateQueue({directory:spool});
 const secret=crypto.randomBytes(32);let i=0;
 const client=createSpoolClient({directory:spool,secret,nonce:()=> (++i).toString(16).padStart(32,'0')});
 const wrappedDriver=driver||{attest:async()=>true,execute:async()=>0};
 const worker=createGuardedNonliveHostWorker({spoolDirectory:spool,fenceDirectory:fence,approvedRoot:approved,
  secret,driver:wrappedDriver,verifyActiveRoute:verifyActiveRoute|| (async()=>true)});
 async function process(){const digest=(await createCandidateManifest({approvedRoot:approved})).candidateSha256;
  const ticket=await client.submit({expectedCandidateSha256:digest});const receipt=await worker.processOne(ticket.requestId);
  return{receipt,signed:await client.readResult(ticket)};}
 const marker=()=>fs.lstat(path.join(fence,'host-operation-inflight')).then(()=>true,e=>e.code==='ENOENT'?false:Promise.reject(e));
 return {root,approved,spool,fence,worker,process,marker,close:()=>fs.rm(root,{recursive:true,force:true})};
}
test('RED: replaced global marker during pre-reload validation failure must not return benign 422-safe status',async()=>{
 let fence;
 const driver={attest:async()=>true,execute:async action=>{
  if(action==='nginx-test'){
   const p=path.join(fence,'host-operation-inflight');
   await fs.rename(p,path.join(fence,'old-host-marker'));
   await fs.writeFile(p,'attacker-marker',{mode:0o600});
   return 1;
  }
  return 0;
 }};
 const f=await fixture({driver});fence=f.fence;
 try{
  const r=await f.process();
  assert.equal(r.signed.status,'HOST_OPERATION_INDETERMINATE');
  assert.equal(await f.marker(),true);
  assert.equal(await fs.readFile(path.join(f.fence,'host-operation-inflight'),'utf8'),'attacker-marker');
 }finally{await f.close();}
});
test('RED: disappearing marker during pre-reload failure cannot report safe validation failure',async()=>{
 let fence;
 const driver={attest:async()=>true,execute:async action=>{
  if(action==='nginx-test'){await fs.unlink(path.join(fence,'host-operation-inflight'));return 1;}
  return 0;
 }};
 const f=await fixture({driver});fence=f.fence;
 try{
  const r=await f.process();
  assert.equal(r.signed.status,'HOST_OPERATION_INDETERMINATE');
  assert.equal(await f.marker(),false);
 }finally{await f.close();}
});
test('RED: candidate changed during active-route verification must retain the global host quarantine',async()=>{
 let approved;
 const verifyActiveRoute=async()=>{
  await fs.writeFile(path.join(approved,'config/default.production.conf'),'server { deny all; }\n');
  return true;
 };
 const f=await fixture({verifyActiveRoute});approved=f.approved;
 try{
  const r=await f.process();
  assert.equal(r.signed.status,'HOST_OPERATION_INDETERMINATE');
  assert.equal(await f.marker(),true);
 }finally{await f.close();}
});
test('normal benign nginx-test failure still clears host marker and returns signed diagnostic',async()=>{
 const f=await fixture({driver:{attest:async()=>true,execute:async action=>action==='nginx-test'?1:0}});
 try{const r=await f.process();assert.equal(r.signed.status,'NGINX_VALIDATION_FAILED');assert.equal(await f.marker(),false);}
 finally{await f.close();}
});
test('normal verified candidate remains unchanged, host marker clears and signed success is visible',async()=>{
 const f=await fixture();try{
  const r=await f.process();assert.equal(r.signed.verified,true);assert.equal(r.signed.status,'RELOAD_AND_VERIFICATION_REPORTED');
  assert.equal(await f.marker(),false);
 }finally{await f.close();}
});
