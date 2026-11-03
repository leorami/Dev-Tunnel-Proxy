'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createRouteActivationSpoolAdapter}=require('../../utils/rc1-v8-spool-activation-adapter.cjs');
const {createProductionRouteMutationService}=require('../../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../../utils/exclusive-route-mutation-lock.cjs');
const {createSpoolClient,createSpoolHost,provisionPrivateQueue}=require('../../utils/rc1-activation-spool.cjs');

const SUCCESS='RELOAD_AND_VERIFICATION_REPORTED';
async function fixture({hostStatus=SUCCESS,respond=true}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv8-txn-'));await fs.chmod(root,0o700);
 for(const d of ['apps','overrides','config','build','build/sites-enabled','.artifacts','.artifacts/route-mutation-locks','queue']){
  await fs.mkdir(path.join(root,d),{mode:0o700});
 }
 for(const [p,data] of [
  ['config/default.production.conf','server { listen 80; }\n'],
  ['config/nginx.production.conf','http { server { listen 80; } }\n'],
  ['build/sites-enabled/apps.generated.conf','# empty apps\n']])await fs.writeFile(path.join(root,p),data,{mode:0o600});
 await provisionPrivateQueue({directory:path.join(root,'queue')});
 const secret=crypto.randomBytes(32);let seq=0;
 const client=createSpoolClient({directory:path.join(root,'queue'),secret,nonce:()=>{seq++;return seq.toString(16).padStart(32,'0');}});
 const host=createSpoolHost({directory:path.join(root,'queue'),approvedRoot:root,secret,executeVerified:async()=>hostStatus});
 const spool={submit:async args=>{const ticket=await client.submit(args);if(respond)await host.processOne(ticket.requestId);return ticket;},readResult:client.readResult};
 const activation=createRouteActivationSpoolAdapter({approvedRoot:root,spoolClient:spool,timeoutMs:75,pollMs:10});
 const generateBundle=async()=>{
  const names=(await fs.readdir(path.join(root,'apps'))).filter(p=>p.endsWith('.conf')).sort();
  const sources=await Promise.all(names.map(name=>fs.readFile(path.join(root,'apps',name),'utf8')));
  await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),`# apps\n${sources.join('\n')}`);
  await fs.writeFile(path.join(root,'.artifacts/bundle-diagnostics.json'),JSON.stringify({count:names.length}));
  await fs.writeFile(path.join(root,'.artifacts/override-conflicts.json'),'[]');
 };
 const lock=createExclusiveMutationLock({directory:path.join(root,'.artifacts/route-mutation-locks')});
 const mutation=createProductionRouteMutationService({root,activation,generateBundle,lock,allowConfigEdit:false});
 return {root,mutation,close:()=>fs.rm(root,{recursive:true,force:true})};
}
test('v8 adapter connects v5 real route install to v6 HMAC spool and reload callback with no Docker',async()=>{
 const f=await fixture();try{
  const r=await f.mutation.install('newroute','location /newroute { return 200; }\n');
  assert.equal(r.httpStatus,200);assert.equal(r.ok,true);
  assert.match(await fs.readFile(path.join(f.root,'apps/newroute.conf'),'utf8'),/newroute/);
  assert.match(await fs.readFile(path.join(f.root,'build/sites-enabled/apps.generated.conf'),'utf8'),/newroute/);
  await assert.rejects(()=>fs.lstat(path.join(f.root,'.artifacts/route-mutation-inflight')),{code:'ENOENT'});
 }finally{await f.close();}
});
test('v8 host signed validation denial rolls back app, generated bundle and sidecars, clears marker',async()=>{
 const f=await fixture({hostStatus:'NGINX_VALIDATION_FAILED'});try{
  const before=await fs.readFile(path.join(f.root,'build/sites-enabled/apps.generated.conf'));
  const r=await f.mutation.install('rejected','location /rejected { fake_nginx_error; }');
  assert.equal(r.httpStatus,422);assert.equal(r.code,'NGINX_CANDIDATE_REJECTED_ROLLED_BACK');
  await assert.rejects(()=>fs.lstat(path.join(f.root,'apps/rejected.conf')),{code:'ENOENT'});
  assert.deepEqual(await fs.readFile(path.join(f.root,'build/sites-enabled/apps.generated.conf')),before);
  await assert.rejects(()=>fs.lstat(path.join(f.root,'.artifacts/bundle-diagnostics.json')),{code:'ENOENT'});
  await assert.rejects(()=>fs.lstat(path.join(f.root,'.artifacts/override-conflicts.json')),{code:'ENOENT'});
  await assert.rejects(()=>fs.lstat(path.join(f.root,'.artifacts/route-mutation-inflight')),{code:'ENOENT'});
 }finally{await f.close();}
});
test('no active host after submitted signed request leaves v5 route transaction quarantined, not success',async()=>{
 const f=await fixture({respond:false});try{
  const first=await f.mutation.install('hanging','location /hanging { return 200; }');
  assert.equal(first.httpStatus,503);assert.equal(first.code,'ACTIVATION_INDETERMINATE');
  const marker=await fs.lstat(path.join(f.root,'.artifacts/route-mutation-inflight'));assert.equal(marker.isFile(),true);
  const second=await f.mutation.install('another','location /another { return 200; }');
  assert.equal(second.httpStatus,503);assert.equal(second.code,'ROUTE_STATE_QUARANTINED');
 }finally{await f.close();}
});
test('config/default.production.conf edits are still blocked even with complete 3-file HMAC binding',async()=>{
 const f=await fixture();try{
  const before=await fs.readFile(path.join(f.root,'config/default.production.conf'));
  const r=await f.mutation.editConfig('default.production.conf','server { deny all; }');
  assert.equal(r.httpStatus,503);assert.equal(r.code,'BLOCKED_CONFIG_MOUNT_UNATTESTED');
  assert.deepEqual(await fs.readFile(path.join(f.root,'config/default.production.conf')),before);
  await assert.rejects(()=>fs.lstat(path.join(f.root,'.artifacts/route-mutation-inflight')),{code:'ENOENT'});
 }finally{await f.close();}
});
