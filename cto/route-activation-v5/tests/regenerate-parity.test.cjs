'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createProductionRouteMutationService}=require('../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../utils/exclusive-route-mutation-lock.cjs');
async function fixture(t,{status='RELOAD_AND_VERIFICATION_REPORTED',activation=true,failBundle=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-regen-v4-'));
 for(const d of ['apps','overrides','config','build/sites-enabled','.artifacts','.artifacts/locks'])await fs.mkdir(path.join(root,d),{recursive:true});
 await fs.chmod(path.join(root,'.artifacts/locks'),0o700);
 const bundle=path.join(root,'build/sites-enabled','apps.generated.conf');const diag=path.join(root,'.artifacts','bundle-diagnostics.json');
 await fs.writeFile(bundle,'OLD_BUNDLE');await fs.writeFile(diag,'OLD_DIAGNOSTICS');
 t.after(async()=>fs.rm(root,{recursive:true,force:true}));
 let activations=0;
 const svc=createProductionRouteMutationService({root,
  activation:activation?{activate:async()=>{activations++;return {status,productionChangeAuthorized:false,liveAttested:false};}}:null,
  generateBundle:async()=>{await fs.writeFile(bundle,'NEW_BUNDLE');await fs.writeFile(diag,'NEW_DIAGNOSTICS');if(failBundle)throw Error('failure');},
  lock:createExclusiveMutationLock({directory:path.join(root,'.artifacts','locks')})});
 return {svc,bundle,diag,activations:()=>activations};
}
test('regenerate without reload preserves current API behavior without invoking host',async t=>{
 const f=await fixture(t,{activation:false});const r=await f.svc.regenerate({reload:false});
 assert.equal(r.httpStatus,200);assert.equal(r.reloaded,false);assert.equal(f.activations(),0);
 assert.equal(await fs.readFile(f.bundle,'utf8'),'NEW_BUNDLE');
});
test('regenerate with reload requires broker before touching generated config',async t=>{
 const f=await fixture(t,{activation:false});const r=await f.svc.regenerate({reload:true});
 assert.equal(r.httpStatus,503);assert.equal(await fs.readFile(f.bundle,'utf8'),'OLD_BUNDLE');
});
test('regenerate with reload validates and confirms full host activation',async t=>{
 const f=await fixture(t);const r=await f.svc.regenerate({reload:true});
 assert.equal(r.httpStatus,200);assert.equal(r.reloaded,true);assert.equal(f.activations(),1);
});
test('regenerate rejected candidate restores bundle and both diagnostics',async t=>{
 const f=await fixture(t,{status:'NGINX_VALIDATION_FAILED'});const r=await f.svc.regenerate({reload:true});
 assert.equal(r.httpStatus,422);assert.equal(r.reloaded,false);assert.equal(await fs.readFile(f.bundle,'utf8'),'OLD_BUNDLE');
 assert.equal(await fs.readFile(f.diag,'utf8'),'OLD_DIAGNOSTICS');
});
test('regenerate generator error restores bytes and reports failure',async t=>{
 const f=await fixture(t,{failBundle:true});const r=await f.svc.regenerate({reload:false});
 assert.equal(r.httpStatus,422);assert.equal(await fs.readFile(f.bundle,'utf8'),'OLD_BUNDLE');
 assert.equal(await fs.readFile(f.diag,'utf8'),'OLD_DIAGNOSTICS');
});
