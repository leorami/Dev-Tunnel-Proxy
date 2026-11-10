'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {inspectReviewedWorkerSourceStage}=require('../../utils/rc2-reviewed-worker-source-stage.cjs');
const NAME='rc2-pending-host-worker.cjs';
const TEXT="'use strict';\n// synthetic signed refusal test\nmodule.exports={status:'CONFIG_SET_DIGEST_MISMATCH'};\n";
function gitBlob(bytes){return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');}
async function fixture(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-v118-stage-')));
 await fs.chmod(root,0o700);
 const utils=path.join(root,'utils');await fs.mkdir(utils,{mode:0o755});
 const file=path.join(utils,NAME);await fs.writeFile(file,TEXT,{mode:0o644});
 const p={approvedRoot:root,reviewedGitBlobSha:gitBlob(Buffer.from(TEXT,'utf8'))};
 return {root,utils,file,p,close:()=>fs.rm(root,{recursive:true,force:true})};
}
test('RED: matching trusted on-disk module remains ONLY SOURCE evidence, not process attestation',async()=>{
 const f=await fixture();try{
  const r=await inspectReviewedWorkerSourceStage(f.p);
  assert.equal(r.code,'REVIEWED_STAGE_MODULE_MATCH');
  assert.equal(r.readOnly,true);
  assert.equal(r.processIdentityAttested,false);
  assert.equal(r.liveLoadedCodeVerified,false);
  assert.equal(r.productionChangeAuthorized,false);
  assert.equal(r.ownerInstallAuthorized,false);
  assert.equal(r.requiresProcessCorrelation,true);
  assert.equal(await fs.readFile(f.file,'utf8'),TEXT);
 }finally{await f.close();}
});
test('RED: stage drift when same trusted file differs returns only a redacted mismatch',async()=>{
 const f=await fixture();try{
  await fs.writeFile(f.file,TEXT.replace('CONFIG_SET_DIGEST_MISMATCH','OLD_UNSAFE_REJECTION'));
  const r=await inspectReviewedWorkerSourceStage(f.p);
  assert.equal(r.code,'REVIEWED_STAGE_MODULE_MISMATCH');
  assert.equal(r.liveLoadedCodeVerified,false);
  assert.equal(r.productionChangeAuthorized,false);
 }finally{await f.close();}
});
test('RED: missing or empty worker module cannot attest the stage',async()=>{
 for(const variant of ['missing','empty']){const f=await fixture();try{
  if(variant==='missing')await fs.unlink(f.file);
  else await fs.writeFile(f.file,'');
  assert.equal((await inspectReviewedWorkerSourceStage(f.p)).code,'STAGE_SOURCE_UNSAFE');
 }finally{await f.close();}}
});
test('RED: symlink or hardlink impersonation of reviewed module blocks even when bytes match',async()=>{
 for(const variant of ['symlink','hardlink']){const f=await fixture();try{
  if(variant==='symlink'){
   await fs.rename(f.file,f.file+'.real');await fs.symlink(f.file+'.real',f.file);
  }else await fs.link(f.file,f.file+'.other');
  assert.equal((await inspectReviewedWorkerSourceStage(f.p)).code,'STAGE_SOURCE_UNSAFE');
 }finally{await f.close();}}
});
test('RED: group/world writable module, source directory or root blocks',async()=>{
 for(const leaf of ['root','utils','file']){const f=await fixture();try{
  await fs.chmod(f[leaf],0o777);
  assert.equal((await inspectReviewedWorkerSourceStage(f.p)).code,'STAGE_SOURCE_UNSAFE');
 }finally{await f.close();}}
});
test('RED: symlinked source root or utils directory blocks rather than following',async()=>{
 for(const key of ['root','utils']){const f=await fixture();try{
  const old=f[key]+'.old';await fs.rename(f[key],old);await fs.symlink(old,f[key]);
  assert.equal((await inspectReviewedWorkerSourceStage(f.p)).code,'STAGE_SOURCE_UNSAFE');
 }finally{await f.close();}}
});
test('RED: unexpected extra options, accessors, invalid ref or path are not evaluated or accepted',async()=>{
 const f=await fixture();try{
  for(const obj of [
    {...f.p,installNow:true},
    {...f.p,reviewedGitBlobSha:'bad'},
    {...f.p,approvedRoot:f.root+'/..'},
    {...f.p,approvedRoot:'relative'},
    {...f.p,approvedRoot:'/'},
    {...f.p,approvedRoot:'\n'},
    undefined
   ]){
   const r=await inspectReviewedWorkerSourceStage(obj);
   assert.equal(r.code,'STAGE_SOURCE_UNVERIFIED');
  }
  const input={...f.p};
  Object.defineProperty(input,'approvedRoot',{get(){throw Error('getter executed')}});
  assert.equal((await inspectReviewedWorkerSourceStage(input)).code,'STAGE_SOURCE_UNVERIFIED');
 }finally{await f.close();}
});
test('RED: oversized module is rejected without interpreting any arbitrary code',async()=>{
 const f=await fixture();try{
  await fs.writeFile(f.file,Buffer.alloc(1024*1024+1,65));
  assert.equal((await inspectReviewedWorkerSourceStage(f.p)).code,'STAGE_SOURCE_UNSAFE');
 }finally{await f.close();}
});
test('RED: output is constant-shaped/frozen and never reveals source contents, paths or hashes',async()=>{
 const f=await fixture();try{
  for(const r of [await inspectReviewedWorkerSourceStage(f.p),
   await inspectReviewedWorkerSourceStage({...f.p,reviewedGitBlobSha:'0'.repeat(40)}),
   await inspectReviewedWorkerSourceStage({})]){
   const s=JSON.stringify(r);
   assert.equal(Object.isFrozen(r),true);
   for(const sensitive of [f.root,NAME,'CONFIG_SET_DIGEST_MISMATCH',f.p.reviewedGitBlobSha])
    assert.equal(s.includes(sensitive),false);
  }
 }finally{await f.close();}
});
test('RED: helper has no ability to start worker or clear exclusive singleton',async()=>{
 const f=await fixture();try{
  const lock=path.join(f.root,'host-worker-singleton.lock');
  await fs.writeFile(lock,'PRESERVE',{mode:0o600});
  const before=await fs.readFile(lock);
  await inspectReviewedWorkerSourceStage(f.p);
  assert.deepEqual(await fs.readFile(lock),before);
 }finally{await f.close();}
});
