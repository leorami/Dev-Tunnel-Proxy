'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {inspectHostWorkerSingleton}=require('../../utils/rc2-host-worker-singleton-inspection.cjs');
async function fixture(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-v113-')));
 await fs.chmod(root,0o700);
 const lock=path.join(root,'host-worker-singleton.lock');
 const put=(pid,other={})=>fs.writeFile(lock,JSON.stringify({protocol:'DEVPROXY_HOST_WORKER_V1',pid,...other})+'\n',{mode:0o600});
 return {root,lock,put,close:()=>fs.rm(root,{recursive:true,force:true})};
}
test('RED: absent singleton is NOT proof of a functioning supervised worker',async()=>{
 const f=await fixture();try{
  const r=await inspectHostWorkerSingleton({leaseDirectory:f.root,isPidAlive:()=>true});
  assert.equal(r.code,'WORKER_SINGLETON_ABSENT');assert.equal(r.workerRunningVerified,false);assert.equal(r.productionChangeAuthorized,false);
 }finally{await f.close()}
});
test('RED: present lock with dead pid is fail-closed crash quarantine, never deleted',async()=>{
 const f=await fixture();try{
  await f.put(1234567);const before=await fs.readFile(f.lock);
  const r=await inspectHostWorkerSingleton({leaseDirectory:f.root,isPidAlive:()=>false});
  assert.equal(r.code,'WORKER_SINGLETON_CRASH_QUARANTINE');assert.equal(r.workerRunningVerified,false);
  assert.deepEqual(await fs.readFile(f.lock),before);
 }finally{await f.close()}
});
test('RED: living PID is NOT proof of worker identity or process durability',async()=>{
 const f=await fixture();try{
  await f.put(process.pid);
  const r=await inspectHostWorkerSingleton({leaseDirectory:f.root,isPidAlive:()=>true});
  assert.equal(r.code,'WORKER_SINGLETON_PID_PRESENT_UNVERIFIED');assert.equal(r.workerRunningVerified,false);
  assert.equal(r.durableSupervisorVerified,false);
 }finally{await f.close()}
});
test('RED: unknown process liveness cannot be represented as live',async()=>{
 const f=await fixture();try{
  await f.put(12345);
  const r=await inspectHostWorkerSingleton({leaseDirectory:f.root});
  assert.equal(r.code,'WORKER_SINGLETON_PID_UNVERIFIED');assert.equal(r.workerRunningVerified,false);
 }finally{await f.close()}
});
test('RED: liveness probe failure remains unverified, not dead',async()=>{
 const f=await fixture();try{
  await f.put(12345);
  const r=await inspectHostWorkerSingleton({leaseDirectory:f.root,isPidAlive:()=>{throw Error('probe unavailable')}});
  assert.equal(r.code,'WORKER_SINGLETON_PID_UNVERIFIED');
 }finally{await f.close()}
});
test('RED: reject publicly readable lock without reading its content',async()=>{
 const f=await fixture();try{
  await f.put(1);await fs.chmod(f.lock,0o644);
  const r=await inspectHostWorkerSingleton({leaseDirectory:f.root,isPidAlive:()=>true});
  assert.equal(r.code,'WORKER_SINGLETON_UNSAFE');
 }finally{await f.close()}
});
test('RED: refuse symlink lock; never follow or modify target',async()=>{
 const f=await fixture();try{
  const outside=path.join(f.root,'outside');await fs.writeFile(outside,'KEEP');await fs.symlink(outside,f.lock);
  const r=await inspectHostWorkerSingleton({leaseDirectory:f.root});
  assert.equal(r.code,'WORKER_SINGLETON_UNSAFE');assert.equal(await fs.readFile(outside,'utf8'),'KEEP');
 }finally{await f.close()}
});
test('RED: refuse hardlinked lock and preserve both links',async()=>{
 const f=await fixture();try{
  await f.put(12345);const sibling=path.join(f.root,'other');await fs.link(f.lock,sibling);
  const r=await inspectHostWorkerSingleton({leaseDirectory:f.root});
  assert.equal(r.code,'WORKER_SINGLETON_UNSAFE');await fs.lstat(sibling);await fs.lstat(f.lock);
 }finally{await f.close()}
});
test('RED: refuse malformed, extra-property, or oversized lock without guessing',async()=>{
 const bad=['not json','{"protocol":"DEVPROXY_HOST_WORKER_V1","pid":-1}',
  '{"protocol":"DEVPROXY_HOST_WORKER_V1","pid":123,"extra":"x"}',
  '{"protocol":"DEVPROXY_HOST_WORKER_V0","pid":123}', 'x'.repeat(500)];
 for(const item of bad){const f=await fixture();try{
  await fs.writeFile(f.lock,item,{mode:0o600});
  assert.equal((await inspectHostWorkerSingleton({leaseDirectory:f.root})).code,'WORKER_SINGLETON_UNSAFE');
 }finally{await f.close()}}
});
test('RED: world-readable lease directory cannot attest singleton',async()=>{
 const f=await fixture();try{
  await f.put(12345);await fs.chmod(f.root,0o755);
  assert.equal((await inspectHostWorkerSingleton({leaseDirectory:f.root})).code,'WORKER_SINGLETON_UNSAFE');
 }finally{await f.close()}
});
test('RED: symlinked lease directory cannot attest singleton',async()=>{
 const f=await fixture();try{
  await f.put(12345);const alias=path.join(f.root,'alias');await fs.symlink(f.root,alias);
  assert.equal((await inspectHostWorkerSingleton({leaseDirectory:alias})).code,'WORKER_SINGLETON_UNSAFE');
 }finally{await f.close()}
});
test('RED: outcome reveals no PID, owner private path, secret or queue content',async()=>{
 const f=await fixture();try{
  await f.put(444444);
  const result=await inspectHostWorkerSingleton({leaseDirectory:f.root,isPidAlive:()=>true});
  const json=JSON.stringify(result);
  for(const sensitive of [f.root,'444444','activation.secret','/spool'])assert.equal(json.includes(sensitive),false);
  assert.equal(result.readOnly,true);assert.equal(result.ownerMacAttested,false);
 }finally{await f.close()}
});
