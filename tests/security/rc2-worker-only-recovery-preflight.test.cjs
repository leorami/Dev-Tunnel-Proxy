'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {inspectWorkerOnlyRecoveryPreflight}=require('../../utils/rc2-worker-only-recovery-preflight.cjs');
const NAMES=['requests','responses','prepared','acks','replay'];
async function fixture(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-v115-')));
 await fs.chmod(root,0o700);
 const spool=path.join(root,'spool'),lease=path.join(root,'lease');
 for(const dir of [spool,lease,...NAMES.map(n=>path.join(spool,n)),path.join(lease,'replay')])await fs.mkdir(dir,{mode:0o700});
 const lock=path.join(lease,'host-worker-singleton.lock');
 await fs.writeFile(lock,JSON.stringify({protocol:'DEVPROXY_HOST_WORKER_V1',pid:12345})+'\n',{mode:0o600});
 const params={spoolDirectory:spool,leaseDirectory:lease,
  isPidAlive:async()=>false,countWorkers:async()=>0,attestPin:async()=>true};
 return {root,spool,lease,lock,params,close:()=>fs.rm(root,{recursive:true,force:true})};
}
const inspect=f=>inspectWorkerOnlyRecoveryPreflight(f.params);
test('RED: clean post-crash evidence returns recheck-needed code; it never clears lock or grants runtime mutation',async()=>{
 const f=await fixture();try{
  const before=await fs.readFile(f.lock);
  const r=await inspect(f);
  assert.equal(r.code,'WORKER_ONLY_PREFLIGHT_SATISFIED');
  assert.equal(r.lockCleared,false);assert.equal(r.productionChangeAuthorized,false);assert.equal(r.workerStarted,false);
  assert.deepEqual(await fs.readFile(f.lock),before);
 }finally{await f.close()}
});
test('RED: any live worker blocks recovery even when singleton PID is dead',async()=>{
 const f=await fixture();try{f.params.countWorkers=async()=>1;
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED');
 }finally{await f.close()}
});
test('RED: a live singleton PID blocks cleanup',async()=>{
 const f=await fixture();try{f.params.isPidAlive=async()=>true;
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED');
 }finally{await f.close()}
});
test('RED: unknown PID liveness or missing callbacks never passes',async()=>{
 const f=await fixture();try{
  f.params.isPidAlive=async()=>undefined;
  assert.notEqual((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_SATISFIED');
  for(const key of ['countWorkers','attestPin','isPidAlive']){
   const p={...f.params};delete p[key];
   assert.notEqual((await inspectWorkerOnlyRecoveryPreflight(p)).code,'WORKER_ONLY_PREFLIGHT_SATISFIED');
  }
 }finally{await f.close()}
});
test('RED: a mismatched current proxy/worker pin blocks worker-only recovery',async()=>{
 const f=await fixture();try{f.params.attestPin=async()=>false;
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED');
 }finally{await f.close()}
});
test('RED: every populated new-epoch signed spool directory blocks recovery',async()=>{
 for(const leaf of NAMES){const f=await fixture();try{
  await fs.writeFile(path.join(f.spool,leaf,'unresolved.json'),'keep',{mode:0o600});
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED',leaf);
  assert.equal(await fs.readFile(path.join(f.spool,leaf,'unresolved.json'),'utf8'),'keep');
 }finally{await f.close()}}
});
test('RED: replay reservation or unexpected lease item blocks recovery',async()=>{
 for(const leaf of ['replay/id','unknown-marker']){const f=await fixture();try{
  await fs.writeFile(path.join(f.lease,leaf),'preserve',{mode:0o600});
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED',leaf);
 }finally{await f.close()}}
});
test('RED: symlink queue leaf blocks without following or modifying target',async()=>{
 const f=await fixture();try{
  const leaf=path.join(f.spool,'requests');
  await fs.rmdir(leaf);await fs.symlink(f.lease,leaf);
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_UNSAFE');
  await fs.lstat(leaf);
 }finally{await f.close()}
});
test('RED: world-readable private queue path blocks recovery',async()=>{
 const f=await fixture();try{
  await fs.chmod(path.join(f.spool,'acks'),0o755);
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_UNSAFE');
 }finally{await f.close()}
});
test('RED: absent singleton must never be treated as safe-to-remove',async()=>{
 const f=await fixture();try{
  await fs.unlink(f.lock);
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED');
 }finally{await f.close()}
});
test('RED: changed lock inode between checks blocks unsafe clearance',async()=>{
 const f=await fixture();try{
  let n=0;f.params.attestPin=async()=>{if(++n===1){await fs.unlink(f.lock);await fs.writeFile(f.lock,JSON.stringify({protocol:'DEVPROXY_HOST_WORKER_V1',pid:12345})+'\n',{mode:0o600});}return true};
  assert.notEqual((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_SATISFIED');
 }finally{await f.close()}
});
test('RED: worker appearing in the second sample blocks recovery',async()=>{
 const f=await fixture();try{
  let n=0;f.params.countWorkers=async()=>++n===1?0:1;
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED');
 }finally{await f.close()}
});
test('RED: pin binding drift in second sample blocks recovery',async()=>{
 const f=await fixture();try{
  let n=0;f.params.attestPin=async()=>++n===1;
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED');
 }finally{await f.close()}
});
test('RED: changed queue between independent samples blocks recovery and preserves bytes',async()=>{
 const f=await fixture();try{
  let n=0;f.params.attestPin=async()=>{if(++n===1)await fs.writeFile(path.join(f.spool,'requests','race'),'preserve',{mode:0o600});return true};
  assert.equal((await inspect(f)).code,'WORKER_ONLY_PREFLIGHT_BLOCKED');
  assert.equal(await fs.readFile(path.join(f.spool,'requests','race'),'utf8'),'preserve');
 }finally{await f.close()}
});
test('RED: diagnostics never include private paths, PID, queue names or secret',async()=>{
 const f=await fixture();try{
  const j=JSON.stringify(await inspect(f));
  for(const sensitive of [f.root,'12345','activation.secret','host-worker-singleton.lock'])assert.equal(j.includes(sensitive),false);
 }finally{await f.close()}
});
