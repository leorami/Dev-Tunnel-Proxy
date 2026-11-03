'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createFixedOwnerActivationHost}=require('../utils/fixed-owner-activation-host.cjs');
const {createAuthenticatedReloadClient}=require('../utils/owner-authenticated-reload.cjs');
const {createProductionRouteMutationService}=require('../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../utils/exclusive-route-mutation-lock.cjs');
const ID='a'.repeat(64),IMG='sha256:'+'b'.repeat(64),SECRET=crypto.randomBytes(32);
async function setup(t,{active=true}={}){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'dp-v5-owner-host-'));const root=path.join(base,'owner');
 for(const p of ['apps','overrides','config','build/sites-enabled','.artifacts','.artifacts/locks'])await fs.mkdir(path.join(root,p),{recursive:true});
 await fs.chmod(path.join(root,'.artifacts/locks'),0o700);
 const sockdir=path.join(base,'socket');await fs.mkdir(sockdir,{mode:0o700});
 const history=[];let expectedBody='location /fresh/ {}';
 const execFileImpl=(_binary,args,options,cb)=>{
  history.push(args.join(' '));
  if(args[0]==='inspect')return cb(null,ID+' '+IMG+' true\n','');
  if(args[0]==='exec'&&args[2]==='nginx')return cb(null,'','');
  return cb(new Error('unapproved invocation'),'','');
 };
 const host=createFixedOwnerActivationHost({privateDirectory:sockdir,approvedOwnerRoot:root,secret:SECRET,
  approvedContainerId:ID,approvedImage:IMG,dockerBinary:'/usr/bin/docker',execFileImpl,
  verifyActiveRoute:async(_signal,digest)=>{
   const b=await fs.readFile(path.join(root,'build/sites-enabled/apps.generated.conf'));
   return active&&crypto.createHash('sha256').update(b).digest('hex')===digest&&b.toString().includes(expectedBody);
  }});
 await host.start();t.after(async()=>{await host.stop();await fs.rm(base,{force:true,recursive:true});});
 const activation=createAuthenticatedReloadClient({socketPath:host.socketPath,secret:SECRET});
 const svc=createProductionRouteMutationService({root,activation,generateBundle:async()=>{
  const names=(await fs.readdir(path.join(root,'apps'))).filter(x=>x.endsWith('.conf')).sort();
  const bodies=await Promise.all(names.map(n=>fs.readFile(path.join(root,'apps',n),'utf8')));
  await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),bodies.join('\n'));
 },lock:createExclusiveMutationLock({directory:path.join(root,'.artifacts/locks')})});
 return {root,history,host,activation,svc};
}
test('real file -> hash-bound HMAC -> fixed Docker argv -> verified route -> HTTP 200',async t=>{
 const x=await setup(t);const r=await x.svc.install('fresh','location /fresh/ {}');
 assert.equal(r.httpStatus,200);assert.equal(r.code,'ACTIVATION_VERIFIED_BY_HOST_CALLBACK');
 assert.deepEqual(x.history,[
 'inspect --format {{.Id}} {{.Image}} {{.State.Running}} '+ID,
 'exec '+ID+' nginx -t',
 'inspect --format {{.Id}} {{.Image}} {{.State.Running}} '+ID,
 'exec '+ID+' nginx -s reload',
 'inspect --format {{.Id}} {{.Image}} {{.State.Running}} '+ID]);
 assert.match(await fs.readFile(path.join(x.root,'apps/fresh.conf'),'utf8'),/fresh/);
 await assert.rejects(fs.lstat(path.join(x.root,'.artifacts/route-mutation-inflight')),{code:'ENOENT'});
});
test('host denies hash mismatch before invoking any Docker action',async t=>{
 const x=await setup(t);const out=await x.activation.activate({expectedBundleSha256:'0'.repeat(64)});
 assert.equal(out.status,'BUNDLE_DIGEST_MISMATCH');assert.deepEqual(x.history,[]);
});
test('failed active-route proof after reload quarantines both host and route data',async t=>{
 const x=await setup(t,{active:false});const r=await x.svc.install('fresh','location /fresh/ {}');
 assert.equal(r.httpStatus,503);assert.equal(r.code,'ACTIVATION_INDETERMINATE');
 assert.equal((await x.svc.install('next','location /next/ {}')).code,'ROUTE_STATE_QUARANTINED');
 assert.equal((await x.activation.activate({expectedBundleSha256:'0'.repeat(64)})).status,'BLOCKED_QUARANTINED');
});
test('host composition rejects missing trusted active route verifier',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'dp-v5-missing-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 assert.throws(()=>createFixedOwnerActivationHost({privateDirectory:base,approvedOwnerRoot:base,secret:SECRET,
  approvedContainerId:ID,approvedImage:IMG,dockerBinary:'/usr/bin/docker'}),/INVALID_/);
});
