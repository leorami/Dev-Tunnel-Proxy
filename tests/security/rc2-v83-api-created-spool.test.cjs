'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createApiOwnedSpool}=require('../../scripts/rc2-create-api-spool.cjs');
async function fixture(){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dp-v83-api-spool-')));
 await fs.chmod(root,0o700);const parent=path.join(root,'parent');await fs.mkdir(parent,{mode:0o700});await fs.chmod(parent,0o1770);
 const directory=path.join(parent,'spool');return {root,parent,directory,run:()=>createApiOwnedSpool({directory}),close:()=>fs.rm(root,{recursive:true,force:true})};}
const reject=async change=>{const f=await fixture();try{await change(f);await assert.rejects(f.run,/RC2_API_SPOOL_/);}finally{await f.close();}};
test('RED: API nonroot process creates spool CHILD 0700 with five private queue dirs, not parent bind root',async()=>{
 const f=await fixture();try{await f.run();const owner=process.getuid();
  const st=await fs.stat(f.directory);assert.equal(st.uid,owner);assert.equal(st.mode&0o777,0o700);
  for(const leaf of ['requests','responses','replay','prepared','acks']){
   const s=await fs.stat(path.join(f.directory,leaf));assert.equal(s.uid,owner);assert.equal(s.mode&0o777,0o700);
  }
  assert.equal((await fs.stat(f.parent)).mode&0o1777,0o1770);
 }finally{await f.close()}
});
test('RED: safe restart validates already owned spool instead of resetting or clearing',async()=>{const f=await fixture();try{await f.run();await fs.writeFile(path.join(f.directory,'requests','marker'),'persist\n');await f.run();assert.equal(await fs.readFile(path.join(f.directory,'requests','marker'),'utf8'),'persist\n')}finally{await f.close()}});
test('RED: reject parent with no sticky bit',()=>reject(f=>fs.chmod(f.parent,0o770)));
test('RED: reject parent world-writable even with sticky bit',()=>reject(f=>fs.chmod(f.parent,0o1777)));
test('RED: reject symlinked parent',async()=>{const f=await fixture();try{const link=path.join(f.root,'link');await fs.symlink(f.parent,link);await assert.rejects(()=>createApiOwnedSpool({directory:path.join(link,'spool')}),/RC2_API_SPOOL_/)}finally{await f.close()}});
test('RED: reject existing spool owned by wrong filesystem identity or with unsafe mode',async()=>{const f=await fixture();try{await fs.mkdir(f.directory,{mode:0o755});await assert.rejects(f.run,/RC2_API_SPOOL_/)}finally{await f.close()}});
test('RED: rejects a symlink replacing the private spool leaf',async()=>{const f=await fixture();try{await fs.symlink('/tmp',f.directory);await assert.rejects(f.run,/RC2_API_SPOOL_/)}finally{await f.close()}});
test('RED: spooled request data is not modified across safe startup revalidation',async()=>{const f=await fixture();try{await f.run();const p=path.join(f.directory,'responses','signed.json');await fs.writeFile(p,'do-not-touch');const before=await fs.stat(p);await f.run();assert.equal(await fs.readFile(p,'utf8'),'do-not-touch');assert.equal((await fs.stat(p)).mtimeMs,before.mtimeMs)}finally{await f.close()}});
test('RED: no root API may create or accept the spool',async()=>{const f=await fixture();try{await assert.rejects(()=>createApiOwnedSpool({directory:f.directory,identity:()=>({uid:0,gid:20})}),/RC2_API_SPOOL_/)}finally{await f.close()}});
test('RED: relative, traversal or wrong leaf path denied',async()=>{const f=await fixture();try{for(const d of ['spool','/tmp/../private/spool',path.join(f.parent,'queue')])await assert.rejects(()=>createApiOwnedSpool({directory:d}),/RC2_API_SPOOL_/)}finally{await f.close()}});
test('RED: no directory creation outside pinned parent on failed check',async()=>{const f=await fixture();try{await fs.chmod(f.parent,0o1777);await assert.rejects(f.run,/RC2_API_SPOOL_/);await assert.rejects(()=>fs.stat(f.directory),{code:'ENOENT'})}finally{await f.close()}});
