'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {inspectWorkerLaunchAgentPathProvenance}=require('../../utils/rc2-worker-launchagent-path-provenance.cjs');
const sha=s=>createHash('sha256').update(s).digest('hex');
const NODE_BYTES='reviewed-node-v22';
const WORKER_BYTES='reviewed-rc2-serve';
async function fixture(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-v118-')));
 const dirs=['bin','product','product/scripts','private','private/logs'];
 for(const dir of dirs)await fs.mkdir(path.join(root,dir),{mode:dir.startsWith('private')?0o700:0o755});
 const args={nodeExecutable:path.join(root,'bin/node'),productRoot:path.join(root,'product'),
  privatePinFile:path.join(root,'private/worker.pin.json'),
  privateLogDirectory:path.join(root,'private/logs'),
  reviewedNodeSha256:sha(NODE_BYTES),reviewedWorkerSha256:sha(WORKER_BYTES)};
 await fs.writeFile(args.nodeExecutable,NODE_BYTES,{mode:0o755});
 await fs.writeFile(path.join(args.productRoot,'scripts/rc2-supervised-mac-host-worker.cjs'),WORKER_BYTES,{mode:0o644});
 await fs.writeFile(args.privatePinFile,'SECRET-NEVER-READ',{mode:0o600});
 return {root,args,worker:path.join(args.productRoot,'scripts/rc2-supervised-mac-host-worker.cjs'),
  close:()=>fs.rm(root,{recursive:true,force:true})};
}
const inspect=f=>inspectWorkerLaunchAgentPathProvenance(f.args);
test('RED: reviewed immutable paths report source-only readiness but never authorize install or attest runtime',async()=>{
 const f=await fixture();try{
  const before=await fs.readFile(f.args.privatePinFile);
  const r=await inspect(f);
  assert.equal(r.code,'LAUNCHAGENT_PATHS_REVIEWED_SOURCE_ONLY');
  for(const name of ['installationAuthorized','installed','macProcessAttested','workerRunningVerified'])assert.equal(r[name],false);
  assert.equal(r.readOnly,true);
  assert.deepEqual(await fs.readFile(f.args.privatePinFile),before);
 }finally{await f.close()}
});
test('RED: wrong reviewed Node or worker digest never passes',async()=>{
 for(const field of ['reviewedNodeSha256','reviewedWorkerSha256']){
  const f=await fixture();try{f.args[field]='0'.repeat(64);
   assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED');
  }finally{await f.close()}
 }
});
test('RED: symlinked Node or worker or private pin is blocked, including in-tree links',async()=>{
 for(const field of ['node','worker','pin']){
  const f=await fixture();try{
   const target=field==='node'?f.args.nodeExecutable:field==='worker'?f.worker:f.args.privatePinFile;
   const twin=target+'.orig';await fs.rename(target,twin);await fs.symlink(twin,target);
   assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED',field);
   assert.ok((await fs.readFile(twin)).length>0);
  }finally{await f.close()}
 }
});
test('RED: hardlinked worker or private pin cannot establish exclusive identity',async()=>{
 for(const field of ['worker','pin']){
  const f=await fixture();try{const target=field==='worker'?f.worker:f.args.privatePinFile;
   await fs.link(target,target+'.hardlink');
   assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED');
  }finally{await f.close()}
 }
});
test('RED: world writable executable, product source or worker file is blocked',async()=>{
 for(const key of ['node','root','worker']){
  const f=await fixture();try{
   const target=key==='node'?f.args.nodeExecutable:key==='root'?f.args.productRoot:f.worker;
   await fs.chmod(target,0o777);
   assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED');
  }finally{await f.close()}
 }
});
test('RED: non executable Node binary is blocked, even with approved matching digest',async()=>{
 const f=await fixture();try{await fs.chmod(f.args.nodeExecutable,0o644);
  assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED');
 }finally{await f.close()}
});
test('RED: publicly readable pin or log folder cannot be used for a user LaunchAgent',async()=>{
 for(const key of ['pin','log']){
  const f=await fixture();try{
   await fs.chmod(key==='pin'?f.args.privatePinFile:f.args.privateLogDirectory,key==='pin'?0o644:0o755);
   assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED');
  }finally{await f.close()}
 }
});
test('RED: symlinked private logs or product root are rejected without following',async()=>{
 for(const key of ['log','root']){
  const f=await fixture();try{
   const target=key==='log'?f.args.privateLogDirectory:f.args.productRoot;
   await fs.rename(target,target+'.orig');await fs.symlink(target+'.orig',target);
   assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED');
  }finally{await f.close()}
 }
});
test('RED: preexisting log files must be private regular files, never links',async()=>{
 for(const violation of ['public','symlink','hardlink']){
  const f=await fixture();try{
   const stdout=path.join(f.args.privateLogDirectory,'host-worker.out.log');
   if(violation==='symlink')await fs.symlink(f.args.privatePinFile,stdout);
   else {await fs.writeFile(stdout,'prior log',{mode:violation==='public'?0o644:0o600});
    if(violation==='hardlink')await fs.link(stdout,stdout+'.other');}
   assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED');
  }finally{await f.close()}
 }
});
test('RED: omitted file, untrusted extra fields, and accessors never pass or execute',async()=>{
 const f=await fixture();try{
  await fs.unlink(f.worker);
  assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED');
  assert.equal((await inspectWorkerLaunchAgentPathProvenance({...f.args,installNow:true})).code,'LAUNCHAGENT_SOURCE_UNVERIFIED');
  const input={...f.args};Object.defineProperty(input,'nodeExecutable',{get(){throw Error('bad getter invoked')}});
  assert.equal((await inspectWorkerLaunchAgentPathProvenance(input)).code,'LAUNCHAGENT_SOURCE_UNVERIFIED');
 }finally{await f.close()}
});
test('RED: all public results are redacted and frozen, including the invalid-input result',async()=>{
 const f=await fixture();try{
  const good=await inspect(f),bad=await inspectWorkerLaunchAgentPathProvenance({});
  for(const r of [good,bad]){
   assert.equal(Object.isFrozen(r),true);
   for(const sensitive of [f.root,'SECRET-NEVER-READ','worker.pin.json','reviewed-node-v22'])
    assert.equal(JSON.stringify(r).includes(sensitive),false);
  }
 }finally{await f.close()}
});
test('RED: private pin/logs or Node binary inside mutable product source are never accepted',async()=>{
 for(const variant of ['pin','logs','node']){
  const f=await fixture();try{
   if(variant==='pin'){
    await fs.mkdir(path.join(f.args.productRoot,'.private'),{mode:0o700});
    f.args.privatePinFile=path.join(f.args.productRoot,'.private','worker.pin.json');
    await fs.writeFile(f.args.privatePinFile,'SECRET-NEVER-READ',{mode:0o600});
   }else if(variant==='logs'){
    f.args.privateLogDirectory=path.join(f.args.productRoot,'.private-logs');
    await fs.mkdir(f.args.privateLogDirectory,{mode:0o700});
   }else{
    f.args.nodeExecutable=path.join(f.args.productRoot,'scripts/node');
    await fs.writeFile(f.args.nodeExecutable,NODE_BYTES,{mode:0o755});
   }
   assert.equal((await inspect(f)).code,'LAUNCHAGENT_PATH_TRUST_BLOCKED',variant);
  }finally{await f.close()}
 }
});
