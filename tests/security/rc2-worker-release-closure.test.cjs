'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {inspectTestOnlyWorkerReleaseClosure,inspectReviewedWorkerReleaseClosure,
 REVIEWED_WORKER_FILES,REVIEWED_COMMIT_SHA}=require('../../utils/rc2-worker-release-closure.cjs');
const blob=content=>createHash('sha1').update('blob '+Buffer.byteLength(content)+'\0'+content).digest('hex');
async function fixture(){
 const scratch=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-release-closure-')));
 await fs.chmod(scratch,0o700);
 const product=path.join(scratch,'product');await fs.mkdir(product,{mode:0o755});
 for(const sub of ['scripts','utils'])await fs.mkdir(path.join(product,sub),{mode:0o755});
 const files=[{path:'scripts/worker.cjs',content:'module.exports=42;\n'},
  {path:'utils/dependency.cjs',content:'module.exports=3;\n'}];
 const manifest=[];
 for(const entry of files){
  await fs.writeFile(path.join(product,entry.path),entry.content,{mode:0o644});
  manifest.push({path:entry.path,gitBlobSha:blob(entry.content)});
 }
 return {scratch,product,files,manifest,close:()=>fs.rm(scratch,{recursive:true,force:true})};
}
const inspect=f=>inspectTestOnlyWorkerReleaseClosure({approvedRoot:f.product,reviewedFiles:f.manifest});
test('RED: exact staged synthetic files are read-only, never live source/process authority',async()=>{
 const f=await fixture();try{
  const got=await inspect(f);
  assert.equal(got.code,'TEST_ONLY_WORKER_CLOSURE_MATCH');
  assert.equal(got.readOnly,true);
  for(const field of ['productionChangeAuthorized','runningProcessAttested','ownerApprovalGranted','productStageModified'])
   assert.equal(got[field],false);
 }finally{await f.close()}
});
test('RED: one changed transitive module fails without falsely passing unchanged entrypoint',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.product,'utils/dependency.cjs'),'module.exports=4;\n');
  assert.equal((await inspect(f)).code,'TEST_ONLY_WORKER_CLOSURE_MISMATCH');
 }finally{await f.close()}
});
test('RED: symlinks and hardlinks cannot impersonate a reviewed module',async()=>{
 for(const variant of ['symlink','hardlink']){
  const f=await fixture();try{
   const file=path.join(f.product,'utils/dependency.cjs');
   if(variant==='symlink'){await fs.rename(file,file+'.real');await fs.symlink(file+'.real',file)}
   else await fs.link(file,file+'.extra');
   assert.equal((await inspect(f)).code,'WORKER_CLOSURE_UNSAFE');
  }finally{await f.close()}
 }
});
test('RED: nonsticky writable ancestor directory is unsafe despite secure leaf files',async()=>{
 const f=await fixture();try{
  await fs.chmod(f.scratch,0o777);
  assert.equal((await inspect(f)).code,'WORKER_CLOSURE_UNSAFE');
 }finally{await f.close()}
});
test('RED: root-owned sticky /tmp is compatible with secure owned product descendants',async()=>{
 const f=await fixture();try{
  assert.equal((await inspect(f)).code,'TEST_ONLY_WORKER_CLOSURE_MATCH');
 }finally{await f.close()}
});
test('RED: writable source folder or module fails closed',async()=>{
 for(const variant of ['source','module']){
  const f=await fixture();try{
   await fs.chmod(variant==='source'?path.join(f.product,'utils'):
    path.join(f.product,'utils/dependency.cjs'),0o777);
   assert.equal((await inspect(f)).code,'WORKER_CLOSURE_UNSAFE');
  }finally{await f.close()}
 }
});
test('RED: invalid manifests, accessor input and path traversal are unverified',async()=>{
 const f=await fixture();try{
  const cases=[{approvedRoot:f.product,reviewedFiles:[{path:'../escape.cjs',gitBlobSha:'a'.repeat(40)}]},
   {approvedRoot:f.product,reviewedFiles:[...f.manifest,...f.manifest]},
   {approvedRoot:f.product,reviewedFiles:f.manifest,installNow:true},
   {approvedRoot:f.product,reviewedFiles:[]},
   {approvedRoot:f.product,reviewedFiles:f.manifest.map(x=>({...x,gitBlobSha:'x'.repeat(40)}))}];
  for(const input of cases)assert.equal((await inspectTestOnlyWorkerReleaseClosure(input)).code,'WORKER_CLOSURE_UNVERIFIED');
  const getter={reviewedFiles:f.manifest};Object.defineProperty(getter,'approvedRoot',{get(){throw Error('getter called')}});
  assert.equal((await inspectTestOnlyWorkerReleaseClosure(getter)).code,'WORKER_CLOSURE_UNVERIFIED');
 }finally{await f.close()}
});
test('RED: production entry rejects wrong reviewed release commit, never accepts caller-selected hashes',async()=>{
 const f=await fixture();try{
  assert.equal((await inspectReviewedWorkerReleaseClosure({approvedRoot:f.product,reviewedCommitSha:'0'.repeat(40)})).code,'WORKER_CLOSURE_UNVERIFIED');
  assert.equal((await inspectReviewedWorkerReleaseClosure({approvedRoot:f.product,reviewedCommitSha:REVIEWED_COMMIT_SHA,reviewedFiles:f.manifest})).code,'WORKER_CLOSURE_UNVERIFIED');
  assert.equal(REVIEWED_WORKER_FILES.length,12);
  assert.equal(new Set(REVIEWED_WORKER_FILES.map(x=>x.path)).size,12);
 }finally{await f.close()}
});
test('RED: operator-private lock and spool are never read, written or cleared',async()=>{
 const f=await fixture();try{
  const sentinel=path.join(f.product,'host-worker-singleton.lock');
  await fs.writeFile(sentinel,'PRESERVE',{mode:0o600});
  const b=await fs.readFile(sentinel);
  await inspect(f);
  assert.deepEqual(await fs.readFile(sentinel),b);
 }finally{await f.close()}
});
test('RED: public outcome is frozen and contains neither source paths nor expected hashes',async()=>{
 const f=await fixture();try{
  const results=[await inspect(f),await inspectTestOnlyWorkerReleaseClosure({}),
   await inspectReviewedWorkerReleaseClosure({})];
  for(const out of results){
   assert.equal(Object.isFrozen(out),true);
   const raw=JSON.stringify(out);
   for(const secret of [f.scratch,'worker.cjs',f.manifest[0].gitBlobSha,REVIEWED_COMMIT_SHA])
    assert.equal(raw.includes(secret),false);
  }
 }finally{await f.close()}
});
