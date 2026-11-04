'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createPendingOnlyHostWorker}=require('../../utils/rc2-pending-host-worker.cjs');
const A='a'.repeat(32),B='b'.repeat(32);
async function fixture(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dpv82-pending-')));await fs.chmod(root,0o700);
 const spool=path.join(root,'spool'),lease=path.join(root,'lease');
 for(const dir of [spool,lease,path.join(spool,'requests'),path.join(spool,'responses'),path.join(lease,'replay')])await fs.mkdir(dir,{mode:0o700});
 const req=(id)=>path.join(spool,'requests',id+'.json');const reply=(id)=>path.join(spool,'responses',id+'.json');const replay=(id)=>path.join(lease,'replay',id);
 return {root,spool,lease,req,reply,replay,close:()=>fs.rm(root,{recursive:true,force:true})};
}
const worker=(f,processOne)=>createPendingOnlyHostWorker({spoolDirectory:f.spool,leaseDirectory:f.lease,worker:{processOne}});
test('RED: scans ONLY pending requests; durable response prevents processing again',async()=>{const f=await fixture();try{
 await fs.writeFile(f.req(A),'{}',{mode:0o600});let count=0;
 const w=worker(f,async(id)=>{count++;await fs.writeFile(f.reply(id),'{}',{mode:0o600});return {code:'HOST_PROCESSED',status:'RELOAD_AND_VERIFICATION_REPORTED'}});
 assert.equal((await w.scanOnce()).length,1);assert.deepEqual(await w.scanOnce(),[]);assert.equal(count,1);
 }finally{await f.close();}});
test('RED: completed replay without response is indeterminate and never re-executed',async()=>{const f=await fixture();try{
 await fs.writeFile(f.req(A),'{}',{mode:0o600});await fs.writeFile(f.replay(A),'durable',{mode:0o600});
 const w=worker(f,async()=>{throw Error('must not execute')});await assert.rejects(()=>w.scanOnce(),/HOST_WORKER_UNRESOLVED_REPLAY/);
 }finally{await f.close();}});
test('RED: historical completed request with reply and replay skips cleanly',async()=>{const f=await fixture();try{
 for(const file of [f.req(A),f.reply(A),f.replay(A)])await fs.writeFile(file,'{}',{mode:0o600});
 const w=worker(f,async()=>{throw Error('must not execute')});assert.deepEqual(await w.scanOnce(),[]);
 }finally{await f.close();}});
test('RED: request symlink refused before fixed action',async()=>{const f=await fixture();try{
 const outside=path.join(f.root,'outside');await fs.writeFile(outside,'{}',{mode:0o600});await fs.symlink(outside,f.req(A));
 await assert.rejects(()=>worker(f,async()=>{throw Error('must not execute')}).scanOnce(),/HOST_WORKER_UNSAFE_QUEUE/);
 }finally{await f.close();}});
test('RED: existing reply symlink cannot be used to skip untrusted request',async()=>{const f=await fixture();try{
 await fs.writeFile(f.req(A),'{}',{mode:0o600});await fs.symlink(f.req(A),f.reply(A));
 await assert.rejects(()=>worker(f,async()=>{throw Error('must not execute')}).scanOnce(),/HOST_WORKER_UNSAFE_QUEUE/);
 }finally{await f.close();}});
test('RED: replay reservation symlink fails closed',async()=>{const f=await fixture();try{
 await fs.writeFile(f.req(A),'{}',{mode:0o600});await fs.symlink(f.req(A),f.replay(A));
 await assert.rejects(()=>worker(f,async()=>{throw Error('must not execute')}).scanOnce(),/HOST_WORKER_UNSAFE_QUEUE/);
 }finally{await f.close();}});
test('RED: world-writable spool requests directory is unsafe',async()=>{const f=await fixture();try{
 await fs.chmod(path.join(f.spool,'requests'),0o777);
 await assert.rejects(()=>worker(f,async()=>[]).scanOnce(),/HOST_WORKER_UNSAFE_QUEUE/);
 }finally{await f.close();}});
test('RED: invalid host response quarantines; never continues to second request',async()=>{const f=await fixture();try{
 for(const id of [A,B])await fs.writeFile(f.req(id),'{}',{mode:0o600});let times=0;
 const w=worker(f,async()=>{times++;return {code:'HOST_PROCESSED',status:'HOST_OPERATION_INDETERMINATE'}});
 await assert.rejects(()=>w.scanOnce(),/HOST_WORKER_INDETERMINATE/);assert.equal(times,1);
 }finally{await f.close();}});
test('RED: unauthorized request quarantines without continuing',async()=>{const f=await fixture();try{
 await fs.writeFile(f.req(A),'{}',{mode:0o600});const w=worker(f,async()=>({code:'REQUEST_NOT_AUTHORIZED'}));
 await assert.rejects(()=>w.scanOnce(),/HOST_WORKER_INDETERMINATE/);
 }finally{await f.close();}});
test('RED: request names filtered strictly and untrusted hidden files do not trigger actions',async()=>{const f=await fixture();try{
 await fs.writeFile(path.join(f.spool,'requests','bad;id.json'),'{}',{mode:0o600});let count=0;
 const w=worker(f,async()=>{count++;return {code:'HOST_PROCESSED',status:'RELOAD_AND_VERIFICATION_REPORTED'}});
 assert.deepEqual(await w.scanOnce(),[]);assert.equal(count,0);
 }finally{await f.close();}});
test('RED: request queue never removes or alters owner files',async()=>{const f=await fixture();try{
 await fs.writeFile(f.req(A),'{}',{mode:0o600});const before=await fs.readFile(f.req(A));
 const w=worker(f,async()=>({code:'HOST_PROCESSED',status:'RELOAD_AND_VERIFICATION_REPORTED'}));
 await assert.rejects(()=>w.scanOnce(),/HOST_WORKER_INDETERMINATE/);
 assert.deepEqual(await fs.readFile(f.req(A)),before);
 }finally{await f.close();}});
test('RED: no processing more than bounded 64 requests per scan',async()=>{const f=await fixture();try{
 for(let i=0;i<65;i++)await fs.writeFile(f.req(i.toString(16).padStart(32,'0')),'{}',{mode:0o600});
 const w=worker(f,async()=>{throw Error('not allowed')});await assert.rejects(()=>w.scanOnce(),/HOST_WORKER_QUEUE_LIMIT/);
 }finally{await f.close();}});
