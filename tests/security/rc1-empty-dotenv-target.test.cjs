'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {prepareEmptyDotenvTarget:run}=require('../../utils/rc1-empty-dotenv-target.cjs');
function fixture(t){
 const stageRoot=fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-ro-'));
 const candidateRoot=path.join(stageRoot,'candidate');
 fs.mkdirSync(candidateRoot,{mode:0o700});
 t.after(()=>fs.rmSync(stageRoot,{recursive:true,force:true}));
 return {stageRoot,candidateRoot};
}
const expect=(x,code)=>{assert.equal(x.code,code);assert.equal(x.productionChangeAuthorized,false);assert.equal(x.secretBytesRead,false);};
test('RED: plan alone creates nothing, and does not authorize a live action',t=>{
 const x=fixture(t),target=path.join(x.candidateRoot,'.env');
 expect(run({...x,apply:false}),'READY_PRIVATE_STAGE_ONLY');
 assert.equal(fs.existsSync(target),false);
});
test('RED: explicit test-owned apply creates empty private regular placeholder, idempotently',t=>{
 const x=fixture(t),target=path.join(x.candidateRoot,'.env');
 expect(run({...x,apply:true}),'CREATED_EMPTY_PRIVATE_PLACEHOLDER');
 let st=fs.lstatSync(target);assert.ok(st.isFile());assert.equal(st.size,0);
 assert.equal(st.mode&0o777,0o600);assert.equal(st.nlink,1);
 expect(run({...x,apply:true}),'ALREADY_EMPTY_PRIVATE_PLACEHOLDER');
 st=fs.lstatSync(target);assert.equal(st.size,0);
});
test('RED: existing nonempty owner-like config cannot be overwritten or read',t=>{
 const x=fixture(t),target=path.join(x.candidateRoot,'.env');
 fs.writeFileSync(target,'SYNTHETIC_OWNER_SECRET_DO_NOT_COPY',{mode:0o600});
 expect(run({...x,apply:true}),'BLOCKED_EXISTING_TARGET');
 assert.equal(fs.readFileSync(target,'utf8'),'SYNTHETIC_OWNER_SECRET_DO_NOT_COPY');
});
test('RED: target symlink cannot redirect a write into any existing file',t=>{
 const x=fixture(t),outside=path.join(x.stageRoot,'outside');
 fs.writeFileSync(outside,'SYNTHETIC_KEEP',{mode:0o600});
 fs.symlinkSync(outside,path.join(x.candidateRoot,'.env'));
 expect(run({...x,apply:true}),'BLOCKED_EXISTING_TARGET');
 assert.equal(fs.readFileSync(outside,'utf8'),'SYNTHETIC_KEEP');
});
test('RED: candidate root symlink is rejected without any outside writes',t=>{
 const x=fixture(t),out=path.join(x.stageRoot,'other');fs.mkdirSync(out);
 fs.rmdirSync(x.candidateRoot);fs.symlinkSync(out,x.candidateRoot);
 expect(run({...x,apply:true}),'BLOCKED_SYMLINK');
 assert.equal(fs.existsSync(path.join(out,'.env')),false);
});
test('RED: stage must be an owner-private 0700 directory',t=>{
 const x=fixture(t);fs.chmodSync(x.stageRoot,0o755);
 expect(run({...x,apply:true}),'BLOCKED_STAGE_PERMISSIONS');
 assert.equal(fs.existsSync(path.join(x.candidateRoot,'.env')),false);
});
test('RED: candidate must be a direct child, no traversal or foreign root',t=>{
 const x=fixture(t);
 expect(run({...x,candidateRoot:path.dirname(x.stageRoot),apply:true}),'BLOCKED_STAGE_BOUNDARY');
 expect(run({...x,candidateRoot:path.join(x.stageRoot,'..','alien'),apply:true}),'BLOCKED_STAGE_BOUNDARY');
});
test('RED: Git worktree rejected to protect accepted product and owner checkout',t=>{
 const x=fixture(t);fs.mkdirSync(path.join(x.candidateRoot,'.git'));
 expect(run({...x,apply:true}),'BLOCKED_GIT_WORKTREE');
 assert.equal(fs.existsSync(path.join(x.candidateRoot,'.env')),false);
});
test('RED: hardlinked empty file cannot be mistaken for owned placeholder',t=>{
 const x=fixture(t),outside=path.join(x.stageRoot,'outside');fs.writeFileSync(outside,'',{mode:0o600});
 fs.linkSync(outside,path.join(x.candidateRoot,'.env'));
 expect(run({...x,apply:true}),'BLOCKED_EXISTING_TARGET');
});
test('RED: permissive existing empty placeholder blocked, never silently chmod',t=>{
 const x=fixture(t),p=path.join(x.candidateRoot,'.env');fs.writeFileSync(p,'',{mode:0o644});
 expect(run({...x,apply:true}),'BLOCKED_EXISTING_TARGET');
 assert.equal(fs.lstatSync(p).mode&0o777,0o644);
});
test('RED: accessor, unknown field, invalid shape rejected and never echoed',t=>{
 const x=fixture(t),v={...x,apply:true};Object.defineProperty(v,'stageRoot',{get(){throw Error('PRIVATE_HOST_PATH');}});
 const out=run(v);assert.notEqual(out.code,'CREATED_EMPTY_PRIVATE_PLACEHOLDER');
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE_HOST_PATH|devproxy-ro-/);
 for(const bad of [null,[],{},Object.assign({...x,apply:true},{password:'SECRET_DO_NOT_ECHO'})]){
  const x=run(bad);assert.equal(x.productionChangeAuthorized,false);
  assert.doesNotMatch(JSON.stringify(x),/SECRET_DO_NOT_ECHO/);
 }
});
