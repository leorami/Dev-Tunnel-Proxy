'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHostOperationQuarantine}=require('../../utils/rc1-host-operation-quarantine.cjs');
async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv7-host-'));
  await fs.chmod(root,0o700);
  return {root,close:()=>fs.rm(root,{recursive:true,force:true})};
}
async function expectMarker(root,present){
  const p=path.join(root,'host-operation-inflight');
  const s=await fs.lstat(p).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  assert.equal(Boolean(s),present);
  if(s){assert.equal(s.isFile(),true);assert.equal(s.mode&0o777,0o600);assert.equal(s.nlink,1);}
}
const GOOD=Object.freeze({status:'RELOAD_AND_VERIFICATION_REPORTED',containerIdentityVerified:true,activeRouteVerified:true,candidateDigestVerified:true});
test('valid fixed-action verified completion is released and permits subsequent action',async()=>{
 const f=await fixture();try{
  const q=createHostOperationQuarantine({directory:f.root});
  assert.equal((await q.run(()=>GOOD)).status,'VERIFIED_HOST_OPERATION');await expectMarker(f.root,false);
  assert.equal((await q.run(()=>GOOD)).status,'VERIFIED_HOST_OPERATION');
 }finally{await f.close();}
});
test('failure remains durable quarantined across object recreation',async()=>{
 const f=await fixture();try{
  const q=createHostOperationQuarantine({directory:f.root});
  assert.equal((await q.run(()=>{throw Error('nginx reload unclear')})).status,'HOST_OPERATION_INDETERMINATE');
  await expectMarker(f.root,true);
  const q2=createHostOperationQuarantine({directory:f.root});
  assert.equal((await q2.run(()=>{throw Error('SHOULD_NOT_RUN')})).status,'HOST_OPERATION_QUARANTINED');
 }finally{await f.close();}
});
test('two simultaneous callers serialize with exclusive sentinel',async()=>{
 const f=await fixture();try{
  const q=createHostOperationQuarantine({directory:f.root});let release, signalStarted;
  const started=new Promise(resolve=>{signalStarted=resolve;});
  const pending=q.run(()=>new Promise(resolve=>{release=()=>resolve(GOOD);signalStarted();}));
  await started;assert.equal(typeof release,'function');
  assert.equal((await q.run(()=>GOOD)).status,'HOST_OPERATION_QUARANTINED');
  release();assert.equal((await pending).status,'VERIFIED_HOST_OPERATION');
 }finally{await f.close();}
});
test('separate instances cannot run overlapping host commands',async()=>{
 const f=await fixture();try{
  const q=createHostOperationQuarantine({directory:f.root});const q2=createHostOperationQuarantine({directory:f.root});let release,signalStarted;
  const started=new Promise(resolve=>{signalStarted=resolve;});
  const one=q.run(()=>new Promise(resolve=>{release=()=>resolve(GOOD);signalStarted();}));
  await started;
  assert.equal((await q2.run(()=>GOOD)).status,'HOST_OPERATION_QUARANTINED');
  release();assert.equal((await one).status,'VERIFIED_HOST_OPERATION');
 }finally{await f.close();}
});
test('a stale marker is never automatically removed or stolen',async()=>{
 const f=await fixture();try{
  const p=path.join(f.root,'host-operation-inflight');await fs.writeFile(p,'crash\n',{mode:0o600});
  assert.equal((await createHostOperationQuarantine({directory:f.root}).run(()=>GOOD)).status,'HOST_OPERATION_QUARANTINED');
  assert.equal(await fs.readFile(p,'utf8'),'crash\n');
 }finally{await f.close();}
});
test('a malicious symlink marker is never followed or removed',async()=>{
 const f=await fixture();const other=await fixture();try{
  const outside=path.join(other.root,'victim');await fs.writeFile(outside,'safe');
  await fs.symlink(outside,path.join(f.root,'host-operation-inflight'));
  assert.equal((await createHostOperationQuarantine({directory:f.root}).run(()=>GOOD)).status,'HOST_OPERATION_QUARANTINED');
  assert.equal(await fs.readFile(outside,'utf8'),'safe');
 }finally{await f.close();await other.close();}
});
test('insecure directory permissions fail before executing privileged code',async()=>{
 const f=await fixture();try{
  await fs.chmod(f.root,0o755);let ran=false;
  assert.equal((await createHostOperationQuarantine({directory:f.root}).run(()=>{ran=true;return GOOD;})).status,'HOST_WORKSPACE_UNSAFE');
  assert.equal(ran,false);await expectMarker(f.root,false);
 }finally{await f.close();}
});
test('symlink workspace is rejected even when it points at private directory',async()=>{
 const f=await fixture();const other=await fixture();try{
  const link=path.join(other.root,'link');await fs.symlink(f.root,link);
  assert.equal((await createHostOperationQuarantine({directory:link}).run(()=>GOOD)).status,'HOST_WORKSPACE_UNSAFE');
  await expectMarker(f.root,false);
 }finally{await f.close();await other.close();}
});
test('invalid workspace root or missing execute callback is denied',async()=>{
 assert.throws(()=>createHostOperationQuarantine({directory:'/'}),/INVALID_HOST_QUARANTINE_CONFIG/);
 const f=await fixture();try{
  assert.equal((await createHostOperationQuarantine({directory:f.root}).run(null)).status,'HOST_OPERATION_INVALID');
  await expectMarker(f.root,false);
 }finally{await f.close();}
});
test('unverified or inconsistent success claims are quarantined, never pass',async()=>{
 const candidates=[null,'RELOAD_AND_VERIFICATION_REPORTED',{},
   {status:'RELOAD_AND_VERIFICATION_REPORTED'},
   {...GOOD,activeRouteVerified:false},
   {...GOOD,containerIdentityVerified:false},
   {...GOOD,candidateDigestVerified:false},
   {...GOOD,productionChangeAuthorized:true},
   {...GOOD,other:'unexpected'}];
 for(const c of candidates){const f=await fixture();try{
  assert.equal((await createHostOperationQuarantine({directory:f.root}).run(()=>c)).status,'HOST_OPERATION_INDETERMINATE');
  await expectMarker(f.root,true);
 }finally{await f.close();}}
});
test('marker replacement during operation blocks deletion of attacker-owned inode',async()=>{
 const f=await fixture();try{
  const q=createHostOperationQuarantine({directory:f.root});
  const got=await q.run(async()=>{
   const p=path.join(f.root,'host-operation-inflight');
   await fs.rename(p,path.join(f.root,'old-marker'));
   await fs.writeFile(p,'replacement',{mode:0o600});
   return GOOD;
  });
  assert.equal(got.status,'HOST_OPERATION_INDETERMINATE');
  assert.equal(await fs.readFile(path.join(f.root,'host-operation-inflight'),'utf8'),'replacement');
 }finally{await f.close();}
});
test('module provides no recovery/reset or arbitrary execution interface',async()=>{
 const f=await fixture();try{
  const q=createHostOperationQuarantine({directory:f.root});
  assert.deepEqual(Object.keys(q),['run']);
  assert.equal('reset' in q,false);assert.equal('clear' in q,false);
 }finally{await f.close();}
});
test('rejected callback does not leave an unhandled rejection and leaves quarantine',async()=>{
 const f=await fixture();try{
  const q=createHostOperationQuarantine({directory:f.root});
  assert.equal((await q.run(async()=>Promise.reject(Error('abort')))).status,'HOST_OPERATION_INDETERMINATE');
  await expectMarker(f.root,true);
 }finally{await f.close();}
});
test('unresponsive privileged callback times out, aborts, and leaves durable quarantine',async()=>{
 const f=await fixture();try{
  let sawAbort=false;
  const q=createHostOperationQuarantine({directory:f.root,timeoutMs:35});
  const r=await q.run(signal=>new Promise(resolve=>{
   signal.addEventListener('abort',()=>{sawAbort=true;resolve(GOOD);},{once:true});
  }));
  assert.equal(sawAbort,true);
  assert.equal(r.status,'HOST_OPERATION_INDETERMINATE');
  await expectMarker(f.root,true);
 }finally{await f.close();}
});
test('late callback success after deadline cannot clear quarantine marker',async()=>{
 const f=await fixture();try{
  let finish;
  const q=createHostOperationQuarantine({directory:f.root,timeoutMs:35});
  const r=await q.run(()=>new Promise(resolve=>{finish=()=>resolve(GOOD);}));
  assert.equal(r.status,'HOST_OPERATION_INDETERMINATE');
  finish();await new Promise(resolve=>setTimeout(resolve,15));
  await expectMarker(f.root,true);
  assert.equal((await q.run(()=>GOOD)).status,'HOST_OPERATION_QUARANTINED');
 }finally{await f.close();}
});
test('timeout cannot be disabled or unbounded by caller',()=>{
 assert.throws(()=>createHostOperationQuarantine({directory:'/tmp/test',timeoutMs:0}),/INVALID_HOST_QUARANTINE_CONFIG/);
 assert.throws(()=>createHostOperationQuarantine({directory:'/tmp/test',timeoutMs:900000}),/INVALID_HOST_QUARANTINE_CONFIG/);
});
