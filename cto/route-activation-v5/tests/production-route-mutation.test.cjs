'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createProductionRouteMutationService}=require('../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../utils/exclusive-route-mutation-lock.cjs');
async function fixture(t,{activationStatus='RELOAD_AND_VERIFICATION_REPORTED',bundleFailure=false,withActivation=true,configEdit=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-route-v3-'));
 for(const x of ['apps','overrides','config','build/sites-enabled','.artifacts','.artifacts/locks'])await fs.mkdir(path.join(root,x),{recursive:true});
 await fs.chmod(path.join(root,'.artifacts/locks'),0o700);
 await fs.writeFile(path.join(root,'apps','prior.conf'),'location /prior/ {}');
 await fs.writeFile(path.join(root,'build/sites-enabled','apps.generated.conf'),'PREVIOUS_BUNDLE');
 t.after(async()=>fs.rm(root,{recursive:true,force:true}));
 let calls=0;
 const activation=withActivation?{activate:async()=>{calls++;return {status:activationStatus,productionChangeAuthorized:false,liveAttested:false};}}:null;
 const generateBundle=async()=>{if(bundleFailure)throw Error('synthetic generator failure');
  const entries=await fs.readdir(path.join(root,'apps'));const data=[];
  for(const name of entries.filter(x=>x.endsWith('.conf')))data.push(await fs.readFile(path.join(root,'apps',name),'utf8'));
  await fs.writeFile(path.join(root,'build/sites-enabled','apps.generated.conf'),data.join('\n'));
 };
 const lock=createExclusiveMutationLock({directory:path.join(root,'.artifacts/locks')});
 const service=createProductionRouteMutationService({root,activation,generateBundle,lock,allowConfigEdit:configEdit});
 return {root,service,calls:()=>calls};
}
test('installed route succeeds only with verified host callback',async t=>{
 const f=await fixture(t);const r=await f.service.install('fresh','location /fresh/ {}');
 assert.equal(r.ok,true);assert.equal(r.httpStatus,200);assert.equal(f.calls(),1);
 assert.match(await fs.readFile(path.join(f.root,'build/sites-enabled','apps.generated.conf'),'utf8'),/fresh/);
});
test('missing broker denies before changing any route or bundle',async t=>{
 const f=await fixture(t,{withActivation:false});const r=await f.service.install('fresh','location /fresh/ {}');
 assert.equal(r.ok,false);assert.equal(r.httpStatus,503);
 await assert.rejects(fs.readFile(path.join(f.root,'apps','fresh.conf')));
 assert.equal(await fs.readFile(path.join(f.root,'build/sites-enabled','apps.generated.conf'),'utf8'),'PREVIOUS_BUNDLE');
});
test('nginx validation failure rolls files back and never responds 200',async t=>{
 const f=await fixture(t,{activationStatus:'NGINX_VALIDATION_FAILED'});
 const r=await f.service.install('fresh','location /fresh/ {}');
 assert.equal(r.ok,false);assert.equal(r.httpStatus,422);
 await assert.rejects(fs.readFile(path.join(f.root,'apps','fresh.conf')));
 assert.equal(await fs.readFile(path.join(f.root,'build/sites-enabled','apps.generated.conf'),'utf8'),'PREVIOUS_BUNDLE');
});
test('reload failure is indeterminate, restores disk but does not claim active worker recovery',async t=>{
 const f=await fixture(t,{activationStatus:'NGINX_RELOAD_FAILED'});
 const r=await f.service.install('fresh','location /fresh/ {}');
 assert.equal(r.ok,false);assert.equal(r.httpStatus,503);assert.equal(r.code,'ACTIVATION_INDETERMINATE');
 await assert.rejects(fs.readFile(path.join(f.root,'apps','fresh.conf')));
});
test('failed bundle generation restores routes without contacting host',async t=>{
 const f=await fixture(t,{bundleFailure:true});const r=await f.service.install('fresh','location /fresh/ {}');
 assert.equal(r.httpStatus,422);assert.equal(f.calls(),0);
 await assert.rejects(fs.readFile(path.join(f.root,'apps','fresh.conf')));
});
test('promote uses a real app route and commits only with activation',async t=>{
 const f=await fixture(t);const r=await f.service.promote('prior.conf');
 assert.equal(r.httpStatus,200);
 assert.equal(await fs.readFile(path.join(f.root,'overrides','prior.conf'),'utf8'),'location /prior/ {}');
});
test('existing route preimage is preserved on rejected validation',async t=>{
 const f=await fixture(t,{activationStatus:'NGINX_VALIDATION_FAILED'});
 const r=await f.service.install('prior','bad payload');
 assert.equal(r.httpStatus,422);
 assert.equal(await fs.readFile(path.join(f.root,'apps','prior.conf'),'utf8'),'location /prior/ {}');
});
test('symlink routes never followed or overwritten',async t=>{
 const f=await fixture(t);await fs.symlink('/etc/passwd',path.join(f.root,'apps','escape.conf'));
 const r=await f.service.install('escape','location /escape/ {}');
 assert.equal(r.httpStatus,400);assert.equal(f.calls(),0);
});
test('invalid route names reject traversal and protected source',async t=>{
 const f=await fixture(t);for(const name of ['../utils/x','/app/utils','bad.conf/../utils','name;echo','']){
  const r=await f.service.install(name,'x');assert.equal(r.httpStatus,400);
 }
 assert.equal(f.calls(),0);
});
test('config editing blocked absent independently proven owner config bind parity',async t=>{
 const f=await fixture(t);const r=await f.service.editConfig('default.production.conf','new');
 assert.equal(r.httpStatus,503);assert.equal(f.calls(),0);
});
test('source path cannot be edited through route mutation service',async t=>{
 const f=await fixture(t,{configEdit:true});const r=await f.service.editConfig('proxyConfigAPI.js','evil');
 assert.equal(r.httpStatus,400);assert.equal(f.calls(),0);
});
test('concurrent distinct processes cannot mutate while exclusive lock held',async t=>{
 const f=await fixture(t);const ext=createExclusiveMutationLock({directory:path.join(f.root,'.artifacts/locks')});
 const lease=await ext.acquire();try{const r=await f.service.install('fresh','x');assert.equal(r.httpStatus,423);}
 finally{await lease.release();}assert.equal(f.calls(),0);
});
test('an existing app edit is activated and never edits application source',async t=>{
 const f=await fixture(t);const r=await f.service.editApp('prior.conf','location /after/ {}');
 assert.equal(r.httpStatus,200);
 assert.equal(await fs.readFile(path.join(f.root,'apps','prior.conf'),'utf8'),'location /after/ {}');
});
test('override edit is scoped to override directory',async t=>{
 const f=await fixture(t);const r=await f.service.editOverride('test.conf','location /test/ {}');
 assert.equal(r.httpStatus,200);assert.equal(await fs.readFile(path.join(f.root,'overrides','test.conf'),'utf8'),'location /test/ {}');
});
test('lock release failure never reports success after route activation',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-route-v3-'));
 for(const p of ['apps','overrides','config','build/sites-enabled','.artifacts'])await fs.mkdir(path.join(root,p),{recursive:true});
 t.after(async()=>fs.rm(root,{recursive:true,force:true}));
 const service=createProductionRouteMutationService({root,
  activation:{activate:async()=>({status:'RELOAD_AND_VERIFICATION_REPORTED',productionChangeAuthorized:false,liveAttested:false})},
  generateBundle:async()=>fs.writeFile(path.join(root,'build/sites-enabled','apps.generated.conf'),'new'),
  lock:{acquire:async()=>({release:async()=>{throw Error('lock tampered');}})}});
 const r=await service.install('route','location /route/ {}');
 assert.equal(r.httpStatus,503);assert.equal(r.code,'LOCK_RELEASE_FAILED_OPERATOR_REQUIRED');
});

test('bundle diagnostics and conflicts are rolled back with rejected nginx candidate',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-sidecar-v4-'));
 for(const p of ['apps','overrides','config','build/sites-enabled','.artifacts','.artifacts/locks'])await fs.mkdir(path.join(root,p),{recursive:true});
 await fs.chmod(path.join(root,'.artifacts/locks'),0o700);
 const outp=path.join(root,'.artifacts','bundle-diagnostics.json');
 const conflict=path.join(root,'.artifacts','override-conflicts.json');
 await fs.writeFile(outp,'PREEXISTING_DIAGNOSTICS');
 await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),'PREEXISTING_BUNDLE');
 t.after(async()=>fs.rm(root,{recursive:true,force:true}));
 const service=createProductionRouteMutationService({root,
  activation:{activate:async()=>({status:'NGINX_VALIDATION_FAILED',productionChangeAuthorized:false,liveAttested:false})},
  generateBundle:async()=>{await fs.writeFile(outp,'NEW_DIAGNOSTICS');await fs.writeFile(conflict,'NEW_CONFLICTS');
   await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),'NEW_BUNDLE');},
  lock:createExclusiveMutationLock({directory:path.join(root,'.artifacts/locks')})});
 const r=await service.install('new','location /new/ {}');
 assert.equal(r.httpStatus,422);
 assert.equal(await fs.readFile(outp,'utf8'),'PREEXISTING_DIAGNOSTICS');
 await assert.rejects(fs.lstat(conflict),{code:'ENOENT'});
 assert.equal(await fs.readFile(path.join(root,'build/sites-enabled/apps.generated.conf'),'utf8'),'PREEXISTING_BUNDLE');
 await assert.rejects(fs.lstat(path.join(root,'apps','new.conf')),{code:'ENOENT'});
});
test('bundle generation failure still rolls back all sidecar effects',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-sidecar-v4-'));
 for(const p of ['apps','overrides','config','build/sites-enabled','.artifacts','.artifacts/locks'])await fs.mkdir(path.join(root,p),{recursive:true});
 await fs.chmod(path.join(root,'.artifacts/locks'),0o700);
 t.after(async()=>fs.rm(root,{recursive:true,force:true}));
 const aux=path.join(root,'.artifacts','bundle-diagnostics.json');
 const svc=createProductionRouteMutationService({root,
  activation:{activate:async()=>{throw Error('should not be called');}},
  generateBundle:async()=>{await fs.writeFile(aux,'partial');throw Error('generator failed');},
  lock:createExclusiveMutationLock({directory:path.join(root,'.artifacts/locks')})});
 assert.equal((await svc.install('frag','location /frag/ {}')).httpStatus,422);
 await assert.rejects(fs.lstat(aux),{code:'ENOENT'});
 await assert.rejects(fs.lstat(path.join(root,'apps','frag.conf')),{code:'ENOENT'});
});
