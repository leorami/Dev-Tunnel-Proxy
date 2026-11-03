'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {prepareNestedMountTargets:run}=require('../../utils/rc1-nested-mount-targets.cjs');
function fixture(t) {
 const stageRoot=fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-nested-'));
 fs.chmodSync(stageRoot,0o700);
 const candidateRoot=path.join(stageRoot,'candidate');
 fs.mkdirSync(candidateRoot,{mode:0o700});
 fs.mkdirSync(path.join(candidateRoot,'apps'),{mode:0o700});
 fs.mkdirSync(path.join(candidateRoot,'overrides'),{mode:0o700});
 fs.mkdirSync(path.join(candidateRoot,'config'),{mode:0o700});
 fs.writeFileSync(path.join(candidateRoot,'config','default.production.conf'),'FIXTURE_ONLY_NO_SECRETS');
 t.after(()=>fs.rmSync(stageRoot,{recursive:true,force:true}));
 return {stageRoot,candidateRoot};
}
function expect(result,code){
 assert.equal(result.code,code);
 assert.equal(result.productionChangeAuthorized,false);
 assert.equal(result.secretBytesRead,false);
 assert.equal(result.productionMutation,false);
 assert.equal(Object.isFrozen(result),true);
}
test('RED: plan-only detects all three missing nested targets and creates nothing',t=>{
 const x=fixture(t);
 const r=run({...x,apply:false});
 expect(r,'MISSING_PRIVATE_MOUNT_TARGETS');
 assert.deepEqual(r.missing,['ENV_FILE','ARTIFACTS_DIR','SITES_DIR']);
 assert.equal(fs.existsSync(path.join(x.candidateRoot,'.env')),false);
 assert.equal(fs.existsSync(path.join(x.candidateRoot,'.artifacts')),false);
 assert.equal(fs.existsSync(path.join(x.candidateRoot,'build')),false);
});
test('RED: apply creates only empty .env and required directories in private candidate',t=>{
 const x=fixture(t);
 expect(run({...x,apply:true}),'STAGED_PRIVATE_MOUNT_TARGETS_ONLY');
 const file=fs.lstatSync(path.join(x.candidateRoot,'.env'));
 assert.equal(file.isFile(),true);assert.equal(file.size,0);assert.equal(file.mode&0o777,0o600);
 for(const dir of ['.artifacts','build','build/sites-enabled']){
  const s=fs.lstatSync(path.join(x.candidateRoot,dir));
  assert.equal(s.isDirectory(),true,dir);assert.equal(s.isSymbolicLink(),false);
  assert.equal(s.mode&0o777,0o700);
 }
 assert.equal(fs.readFileSync(path.join(x.candidateRoot,'config/default.production.conf'),'utf8'),'FIXTURE_ONLY_NO_SECRETS');
 assert.deepEqual(fs.readdirSync(x.candidateRoot).sort(),['.artifacts','.env','apps','build','config','overrides']);
});
test('RED: complete private mountpoint staging is idempotent and never modifies existing source',t=>{
 const x=fixture(t);
 expect(run({...x,apply:true}),'STAGED_PRIVATE_MOUNT_TARGETS_ONLY');
 expect(run({...x,apply:false}),'READY_PRIVATE_MOUNT_TARGETS_ONLY');
 expect(run({...x,apply:true}),'ALREADY_STAGED_PRIVATE_MOUNT_TARGETS');
 assert.equal(fs.lstatSync(path.join(x.candidateRoot,'.env')).size,0);
});
test('RED: missing required source app dirs and release config cannot be silently created',t=>{
 for(const item of ['apps','overrides','config/default.production.conf']){
  const x=fixture(t);fs.rmSync(path.join(x.candidateRoot,item),{recursive:true});
  const r=run({...x,apply:true});
  expect(r,'BLOCKED_PRODUCT_STRUCTURE');
  assert.equal(fs.existsSync(path.join(x.candidateRoot,'.env')),false);
 }
});
test('RED: pre-existing credential file is not read or overwritten',t=>{
 const x=fixture(t),file=path.join(x.candidateRoot,'.env');
 fs.writeFileSync(file,'SYNTHETIC_OWNER_CREDENTIAL_DO_NOT_COPY',{mode:0o600});
 expect(run({...x,apply:true}),'BLOCKED_EXISTING_TARGET');
 assert.equal(fs.readFileSync(file,'utf8'),'SYNTHETIC_OWNER_CREDENTIAL_DO_NOT_COPY');
 assert.equal(fs.existsSync(path.join(x.candidateRoot,'.artifacts')),false);
});
test('RED: an attack using symlinked build subtree must not touch outside directory',t=>{
 const x=fixture(t),out=path.join(x.stageRoot,'outside');
 fs.mkdirSync(out);fs.symlinkSync(out,path.join(x.candidateRoot,'build'));
 expect(run({...x,apply:true}),'BLOCKED_SYMLINK_MOUNT_TARGET');
 assert.deepEqual(fs.readdirSync(out),[]);
 assert.equal(fs.existsSync(path.join(x.candidateRoot,'.env')),false);
});
test('RED: symlinked artifacts target and symlinked approved structure fail closed',t=>{
 for(const item of ['.artifacts','apps']){
  const x=fixture(t),outside=path.join(x.stageRoot,'outside-'+item.replace('.',''));
  fs.mkdirSync(outside,{mode:0o700});
  if(item==='apps')fs.rmdirSync(path.join(x.candidateRoot,item));
  fs.symlinkSync(outside,path.join(x.candidateRoot,item));
  const r=run({...x,apply:true});
  expect(r,item==='apps'?'BLOCKED_PRODUCT_STRUCTURE':'BLOCKED_SYMLINK_MOUNT_TARGET');
  assert.deepEqual(fs.readdirSync(outside),[]);
 }
});
test('RED: an unexpected .git worktree is never a staging candidate',t=>{
 const x=fixture(t);fs.mkdirSync(path.join(x.candidateRoot,'.git'));
 expect(run({...x,apply:true}),'BLOCKED_GIT_WORKTREE');
 assert.equal(fs.existsSync(path.join(x.candidateRoot,'.env')),false);
});
test('RED: root stage permissions remain private and direct-child only',t=>{
 const x=fixture(t);fs.chmodSync(x.stageRoot,0o755);
 expect(run({...x,apply:true}),'BLOCKED_STAGE_PERMISSIONS');
 fs.chmodSync(x.stageRoot,0o700);
 expect(run({...x,candidateRoot:path.dirname(x.stageRoot),apply:true}),'BLOCKED_STAGE_BOUNDARY');
});
test('RED: invalid input and accessor fields cannot read or echo secrets',t=>{
 const x=fixture(t);
 for(const bad of [null,[],{},Object.assign({...x,apply:true},{password:'SYNTHETIC_SECRET'})]){
  const r=run(bad);assert.equal(r.productionChangeAuthorized,false);
  assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_SECRET/);
 }
 const obj={...x,apply:true};
 Object.defineProperty(obj,'candidateRoot',{get(){throw Error('SECRET_GETTER');}});
 const result=run(obj);assert.equal(result.productionChangeAuthorized,false);
 assert.doesNotMatch(JSON.stringify(result),/SECRET_GETTER/);
});
