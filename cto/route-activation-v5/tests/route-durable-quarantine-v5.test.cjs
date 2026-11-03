'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createProductionRouteMutationService}=require('../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../utils/exclusive-route-mutation-lock.cjs');
async function make(t,status){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-route-journal-v5-'));
 for(const dir of ['apps','overrides','config','build/sites-enabled','.artifacts','.artifacts/locks'])await fs.mkdir(path.join(root,dir),{recursive:true});
 await fs.chmod(path.join(root,'.artifacts/locks'),0o700);
 t.after(async()=>fs.rm(root,{force:true,recursive:true}));let acts=0;
 const svc=createProductionRouteMutationService({root,activation:{activate:async()=>{acts++;return {status,productionChangeAuthorized:false,liveAttested:false};}},
  generateBundle:async()=>fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),'BUNDLE'),
  lock:createExclusiveMutationLock({directory:path.join(root,'.artifacts/locks')})});
 return {root,svc,calls:()=>acts,marker:path.join(root,'.artifacts','route-mutation-inflight')};
}
test('known validated route activation clears crash marker',async t=>{
 const f=await make(t,'RELOAD_AND_VERIFICATION_REPORTED');assert.equal((await f.svc.install('good','route')).httpStatus,200);
 await assert.rejects(fs.lstat(f.marker),{code:'ENOENT'});
});
test('failed validation rolls data back and clears marker for recovery',async t=>{
 const f=await make(t,'NGINX_VALIDATION_FAILED');assert.equal((await f.svc.install('bad','route')).httpStatus,422);
 await assert.rejects(fs.lstat(f.marker),{code:'ENOENT'});
 await assert.rejects(fs.lstat(path.join(f.root,'apps','bad.conf')),{code:'ENOENT'});
});
test('after unknown worker state a durable marker blocks a second app mutation',async t=>{
 const f=await make(t,'NGINX_RELOAD_FAILED');assert.equal((await f.svc.install('old','route')).httpStatus,503);
 assert.equal((await fs.lstat(f.marker)).mode&0o077,0);
 assert.equal((await f.svc.install('new','route')).code,'ROUTE_STATE_QUARANTINED');
 await assert.rejects(fs.lstat(path.join(f.root,'apps','new.conf')),{code:'ENOENT'});
 assert.equal(f.calls(),1);
});
test('orphan crash marker blocks route regenerate before bundle write',async t=>{
 const f=await make(t,'RELOAD_AND_VERIFICATION_REPORTED');await fs.writeFile(f.marker,'owner intervention required',{flag:'wx',mode:0o600});
 const r=await f.svc.regenerate({reload:false});assert.equal(r.code,'ROUTE_STATE_QUARANTINED');
 await assert.rejects(fs.lstat(path.join(f.root,'build/sites-enabled/apps.generated.conf')),{code:'ENOENT'});
});
