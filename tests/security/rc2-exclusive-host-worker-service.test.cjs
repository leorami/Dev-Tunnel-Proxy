'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createExclusiveHostWorkerService}=require('../../utils/rc2-exclusive-host-worker-service.cjs');
async function fixture(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dpv82-service-')));
 await fs.chmod(root,0o700);
 return {root,lock:path.join(root,'host-worker-singleton.lock'),close:()=>fs.rm(root,{force:true,recursive:true})};
}
test('RED: cooperative host scan holds and clears durable exclusive singleton',async()=>{const f=await fixture();try{
 const controller=new AbortController(),calls=[];
 const service=createExclusiveHostWorkerService({leaseDirectory:f.root,
  worker:{scanOnce:async()=>{calls.push(1);controller.abort();return []}},pollMs:25});
 const r=await service.runUntilStopped({signal:controller.signal});
 assert.equal(r.code,'HOST_WORKER_STOPPED_CLEANLY');assert.equal(calls.length,1);
 await assert.rejects(()=>fs.lstat(f.lock),/ENOENT/);
 }finally{await f.close();}});
test('RED: concurrent host service refused even if other request IDs',async()=>{const f=await fixture();try{
 const ctl=new AbortController();let ready;const inside=new Promise(r=>{ready=r});
 let release;const pending=new Promise(r=>{release=r});
 const a=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>{ready();await pending;ctl.abort();return []}}});
 const first=a.runUntilStopped({signal:ctl.signal});await inside;
 const b=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>{throw Error('must not run')}}});
 await assert.rejects(()=>b.runOnce(),/HOST_WORKER_ALREADY_ACTIVE/);
 release();await first;
 }finally{await f.close();}});
test('RED: stale singleton after host crash never auto-deleted',async()=>{const f=await fixture();try{
 await fs.writeFile(f.lock,'stale',{mode:0o600});
 const s=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>[]}});
 await assert.rejects(()=>s.runOnce(),/HOST_WORKER_ALREADY_ACTIVE/);
 assert.equal(await fs.readFile(f.lock,'utf8'),'stale');
 }finally{await f.close();}});
test('RED: symbolic singleton lock cannot be followed or deleted',async()=>{const f=await fixture();try{
 const outside=path.join(f.root,'outside');await fs.writeFile(outside,'preserve',{mode:0o600});await fs.symlink(outside,f.lock);
 const s=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>[]}});
 await assert.rejects(()=>s.runOnce(),/HOST_WORKER_ALREADY_ACTIVE/);
 assert.equal(await fs.readFile(outside,'utf8'),'preserve');
 }finally{await f.close();}});
test('RED: unknown scan outcome retains quarantine instead of clearing singleton',async()=>{const f=await fixture();try{
 const s=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>{throw Error('host timeout')}}});
 await assert.rejects(()=>s.runOnce(),/HOST_WORKER_SCAN_INDETERMINATE/);
 assert.equal((await fs.lstat(f.lock)).mode&0o777,0o600);
 }finally{await f.close();}});
test('RED: worker service rejects world readable lease root',async()=>{const f=await fixture();try{
 await fs.chmod(f.root,0o755);
 const s=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>[]}});
 await assert.rejects(()=>s.runOnce(),/HOST_WORKER_PRIVATE_LEASE_UNSAFE/);
 }finally{await f.close();}});
test('RED: worker service rejects symlinked lease root',async()=>{const f=await fixture();try{
 const alias=path.join(f.root,'alias');await fs.symlink(f.root,alias);
 const s=createExclusiveHostWorkerService({leaseDirectory:alias,worker:{scanOnce:async()=>[]}});
 await assert.rejects(()=>s.runOnce(),/HOST_WORKER_PRIVATE_LEASE_UNSAFE/);
 }finally{await f.close();}});
test('RED: normal one-shot service cleans singleton and returns no private response',async()=>{const f=await fixture();try{
 const s=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>[{code:'HOST_PROCESSED',secret:'do not log'}]}});
 const result=await s.runOnce();assert.deepEqual(result,{code:'HOST_WORKER_SCAN_COMPLETE',count:1,productionChangeAuthorized:false,deployed:false});
 assert.equal(JSON.stringify(result).includes('do not log'),false);
 await assert.rejects(()=>fs.stat(f.lock),/ENOENT/);
 }finally{await f.close();}});
test('RED: invalid scan response retained as quarantine, not a fake success',async()=>{const f=await fixture();try{
 const s=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>({code:'OK'})}});
 await assert.rejects(()=>s.runOnce(),/HOST_WORKER_SCAN_INDETERMINATE/);
 await fs.lstat(f.lock);
 }finally{await f.close();}});
test('RED: abort-before-start does not create singleton',async()=>{const f=await fixture();try{
 const ctl=new AbortController();ctl.abort();const s=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>{throw Error('must not run')}}});
 const r=await s.runUntilStopped({signal:ctl.signal});assert.equal(r.code,'HOST_WORKER_STOPPED_CLEANLY');
 await assert.rejects(()=>fs.lstat(f.lock),/ENOENT/);
 }finally{await f.close();}});
test('RED: abort while a host operation is in flight waits until settled before unlocking',async()=>{const f=await fixture();try{
 const ctl=new AbortController();let resume;const held=new Promise(r=>{resume=r});let started;const first=new Promise(r=>{started=r});
 const s=createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>{started();await held;return []}}});
 const task=s.runUntilStopped({signal:ctl.signal});await first;ctl.abort();
 assert.equal((await fs.stat(f.lock)).isFile(),true);resume();await task;
 await assert.rejects(()=>fs.stat(f.lock),/ENOENT/);
 }finally{await f.close();}});
test('RED: separate SIGKILL process leaves persistent singleton for manual review',async()=>{const f=await fixture();try{
 const child=spawnSync(process.execPath,[path.join(__dirname,'../helpers/rc2-kill-host-service.cjs'),f.root],{encoding:'utf8',timeout:5000});
 assert.equal(child.signal,'SIGKILL',child.stderr);
 assert.equal((await fs.stat(f.lock)).isFile(),true);
 await assert.rejects(()=>createExclusiveHostWorkerService({leaseDirectory:f.root,worker:{scanOnce:async()=>[]}}).runOnce(),/HOST_WORKER_ALREADY_ACTIVE/);
 }finally{await f.close();}});
