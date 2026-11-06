'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createPendingOnlyHostWorker}=require('../../utils/rc2-pending-host-worker.cjs');
const A='a'.repeat(32),B='b'.repeat(32);
async function fixture(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dp-p1-negative-')));
 await fs.chmod(root,0o700);
 const spool=path.join(root,'spool'),lease=path.join(root,'lease');
 for(const dir of [spool,lease,path.join(spool,'requests'),path.join(spool,'responses'),path.join(lease,'replay')])await fs.mkdir(dir,{mode:0o700});
 const req=(id)=>path.join(spool,'requests',id+'.json');
 const reply=(id)=>path.join(spool,'responses',id+'.json');
 const replay=(id)=>path.join(lease,'replay',id);
 return {root,spool,lease,req,reply,replay,close:()=>fs.rm(root,{force:true,recursive:true})};
}
const w=(f,fn)=>createPendingOnlyHostWorker({spoolDirectory:f.spool,leaseDirectory:f.lease,worker:{processOne:fn}});
test('RED: deterministic no-action config mismatch reply does NOT kill exclusive Mac worker',async()=>{
 const f=await fixture();try{
  await fs.writeFile(f.req(A),'{}',{mode:0o600});
  const s=w(f,async id=>{await fs.writeFile(f.reply(id),'signed-refusal',{mode:0o600});return {code:'HOST_PROCESSED',status:'CONFIG_SET_DIGEST_MISMATCH'}});
  const r=await s.scanOnce();
  assert.deepEqual(r,[{code:'HOST_PROCESSED',status:'CONFIG_SET_DIGEST_MISMATCH'}]);
  assert.deepEqual(await s.scanOnce(),[]);
 }finally{await f.close()}
});
test('RED: mismatch response must be durable before worker continues',async()=>{
 const f=await fixture();try{
  await fs.writeFile(f.req(A),'{}',{mode:0o600});
  const s=w(f,async()=>({code:'HOST_PROCESSED',status:'CONFIG_SET_DIGEST_MISMATCH'}));
  await assert.rejects(()=>s.scanOnce(),/HOST_WORKER_INDETERMINATE/);
 }finally{await f.close()}
});
test('RED: mismatch with post-return replay reservation is still indeterminate',async()=>{
 const f=await fixture();try{
  await fs.writeFile(f.req(A),'{}',{mode:0o600});
  const s=w(f,async id=>{
   await fs.writeFile(f.reply(id),'signed-refusal',{mode:0o600});
   await fs.writeFile(f.replay(id),'durable-reservation',{mode:0o600});
   return {code:'HOST_PROCESSED',status:'CONFIG_SET_DIGEST_MISMATCH'};
  });
  await assert.rejects(()=>s.scanOnce(),/HOST_WORKER_INDETERMINATE/);
 }finally{await f.close()}
});
test('RED: mismatch refusal can be followed by a distinct approved current-digest request',async()=>{
 const f=await fixture();try{
  for(const id of [A,B])await fs.writeFile(f.req(id),'{}',{mode:0o600});
  const touched=[];
  const s=w(f,async id=>{
   touched.push(id);
   await fs.writeFile(f.reply(id),'signed-reply',{mode:0o600});
   return {code:'HOST_PROCESSED',status:id===A?'CONFIG_SET_DIGEST_MISMATCH':'RELOAD_AND_VERIFICATION_REPORTED'};
  });
  const r=await s.scanOnce();
  assert.deepEqual(touched,[A,B]);
  assert.equal(r.length,2);
 }finally{await f.close()}
});
test('RED: HOST_OPERATION_INDETERMINATE stays quarantined despite durable negative reply',async()=>{
 const f=await fixture();try{
  await fs.writeFile(f.req(A),'{}',{mode:0o600});
  const s=w(f,async id=>{await fs.writeFile(f.reply(id),'negative',{mode:0o600});return {code:'HOST_PROCESSED',status:'HOST_OPERATION_INDETERMINATE'}});
  await assert.rejects(()=>s.scanOnce(),/HOST_WORKER_INDETERMINATE/);
 }finally{await f.close()}
});
test('RED: reject mismatch reply symlink and hardlink, even when the worker says finished',async()=>{
 for(const mode of ['symlink','hardlink']){
  const f=await fixture();try{
   await fs.writeFile(f.req(A),'{}',{mode:0o600});
   const outside=path.join(f.root,'outside');await fs.writeFile(outside,'unchanged',{mode:0o600});
   const s=w(f,async id=>{if(mode==='symlink')await fs.symlink(outside,f.reply(id));else await fs.link(outside,f.reply(id));return {code:'HOST_PROCESSED',status:'CONFIG_SET_DIGEST_MISMATCH'}});
   await assert.rejects(()=>s.scanOnce(),/HOST_WORKER_UNSAFE_QUEUE/);
   assert.equal(await fs.readFile(outside,'utf8'),'unchanged');
  }finally{await f.close()}
 }
});
