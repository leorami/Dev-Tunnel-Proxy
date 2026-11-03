'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createExclusiveMutationLock}=require('../utils/exclusive-route-mutation-lock.cjs');
async function setup(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-route-lock-'));await fs.chmod(dir,0o700);return {dir,close:()=>fs.rm(dir,{recursive:true,force:true})};}
test('RED: file lock serializes two independently constructed controllers',async()=>{
 const x=await setup();try{
  const a=createExclusiveMutationLock({directory:x.dir});const b=createExclusiveMutationLock({directory:x.dir});
  const lease=await a.acquire();assert(lease);
  assert.equal(await b.acquire(),null);
  await lease.release();
  const next=await b.acquire();assert(next);await next.release();
 }finally{await x.close();}
});
test('RED: deny symlink/private-dir escape and fail-closed lock collision',async()=>{
 const x=await setup();try{
  const l=createExclusiveMutationLock({directory:x.dir});const lease=await l.acquire();
  try{assert.equal((await fs.lstat(path.join(x.dir,'route-mutation.lock'))).mode&0o777,0o600);}finally{await lease.release();}
  await fs.symlink('/etc/passwd',path.join(x.dir,'route-mutation.lock'));
  assert.equal(await l.acquire(),null);
  await fs.unlink(path.join(x.dir,'route-mutation.lock'));
  const publicDir=path.join(x.dir,'public');await fs.mkdir(publicDir,{mode:0o777});await fs.chmod(publicDir,0o755);
  const bad=createExclusiveMutationLock({directory:publicDir});
  await assert.rejects(()=>bad.acquire(),/PRIVATE|LOCK/);
 }finally{await x.close();}
});
test('RED: lock is not unlinked if its leaf inode was replaced',async()=>{
 const x=await setup();try{
  const l=createExclusiveMutationLock({directory:x.dir});const lease=await l.acquire();
  await fs.rename(path.join(x.dir,'route-mutation.lock'),path.join(x.dir,'old.lock'));
  await fs.writeFile(path.join(x.dir,'route-mutation.lock'),'replacement');
  await assert.rejects(()=>lease.release(),/IDENTITY|REPLACED|LOCK/);
  assert.equal(await fs.readFile(path.join(x.dir,'route-mutation.lock'),'utf8'),'replacement');
 }finally{await x.close();}
});
const {createRouteMutationTransaction}=require('../utils/route-activation-transaction.cjs');
test('RED: route transaction refuses mutation when cross-process lock is missing',async()=>{
 let writes=0;const t=createRouteMutationTransaction({io:{read:async()=>null,write:async()=>{writes++},remove:async()=>{},generateBundle:async()=>{}},activation:{validate:async()=>true,reload:async()=>true,verifyRoute:async()=>true}});
 assert.equal((await t.apply({name:'test',content:'safe'})).status,'BLOCKED_NO_EXCLUSIVE_LOCK');assert.equal(writes,0);
});
