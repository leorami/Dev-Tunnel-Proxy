'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {createSpoolClient,provisionPrivateQueue}=require('../../utils/rc1-activation-spool.cjs');
const {createClosureGatedHostDriver}=require('../../utils/rc1-closure-gated-host-driver.cjs');
const {createGuardedNonliveHostWorker}=require('../../utils/rc1-v7-guarded-host-worker-nonlive.cjs');
const TRUSTED_HOST_VIEW=Object.freeze({confD:['default.conf'],siteEnabled:['apps.generated.conf']});
async function fixture({hook,hostView=async()=>TRUSTED_HOST_VIEW}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv9-spool-'));await fs.chmod(root,0o700);
 const paths={approved:path.join(root,'approved'),spool:path.join(root,'spool'),fence:path.join(root,'fence')};
 for(const k of Object.keys(paths))await fs.mkdir(paths[k],{mode:0o700});
 for(const rel of ['config','build','build/sites-enabled'])await fs.mkdir(path.join(paths.approved,rel),{mode:0o700});
 const files={
  main:path.join(paths.approved,'config/nginx.production.conf'),
  default:path.join(paths.approved,'config/default.production.conf'),
  bundle:path.join(paths.approved,'build/sites-enabled/apps.generated.conf')};
 await fs.writeFile(files.main,'events{}\nhttp { include /etc/nginx/mime.types; include /etc/nginx/conf.d/*.conf; }\n');
 await fs.writeFile(files.default,'server { include /etc/nginx/conf.d/sites-enabled/*.conf; }\n');
 await fs.writeFile(files.bundle,'location /x { return 200; }\n');
 await provisionPrivateQueue({directory:paths.spool});
 const trace=[],secret=crypto.randomBytes(32);
 const driver={
  attest:async()=>{trace.push('attest');return true;},
  execute:async action=>{trace.push(action);if(hook)await hook({action,paths,files});return 0;}
 };
 const gate=createClosureGatedHostDriver({approvedRoot:paths.approved,driver,verifyActiveRoute:async()=>true,hostView});
 const worker=createGuardedNonliveHostWorker({spoolDirectory:paths.spool,fenceDirectory:paths.fence,
  approvedRoot:paths.approved,secret,driver:gate.driver,verifyActiveRoute:gate.verifyActiveRoute,timeoutMs:1800});
 const client=createSpoolClient({directory:paths.spool,secret,nonce:()=>crypto.randomBytes(16).toString('hex')});
 async function act(){const manifest=await createCandidateManifest({approvedRoot:paths.approved});
  const ticket=await client.submit({expectedCandidateSha256:manifest.candidateSha256});
  const processed=await worker.processOne(ticket.requestId);
  return {manifest,processed,reply:await client.readResult(ticket)};
 }
 const fencePresent=()=>fs.lstat(path.join(paths.fence,'host-operation-inflight')).then(()=>true,e=>e.code==='ENOENT'?false:Promise.reject(e));
 return {root,paths,files,trace,act,fencePresent,close:()=>fs.rm(root,{recursive:true,force:true})};
}
test('host callback plus strict closure passes HMAC → nginx test/reload → route proof, synthetic only',async()=>{
 const f=await fixture();try{const r=await f.act();
  assert.equal(r.reply.verified,true);assert.equal(r.reply.status,'RELOAD_AND_VERIFICATION_REPORTED');
  assert.deepEqual(f.trace,['attest','nginx-test','attest','nginx-reload','attest']);
  assert.equal(await f.fencePresent(),false);
 }finally{await f.close();}
});
test('v6 3-file HMAC stays SAME with rogue glob-loaded conf; v9 blocks privileged action',async()=>{
 const f=await fixture();try{
  const before=(await createCandidateManifest({approvedRoot:f.paths.approved})).candidateSha256;
  await fs.writeFile(path.join(f.paths.approved,'build/sites-enabled/unbound.conf'),'location /admin { return 200; }');
  const after=(await createCandidateManifest({approvedRoot:f.paths.approved})).candidateSha256;
  assert.equal(after,before,'v6 hash does not cover extra .conf');
  const r=await f.act();assert.equal(r.reply.status,'BLOCKED_CONTAINER_IDENTITY');
  assert.deepEqual(f.trace,[]);assert.equal(await f.fencePresent(),false);
 }finally{await f.close();}
});
test('signed malicious route bundle with nested include is denied even when HMAC is valid',async()=>{
 const f=await fixture();try{
  await fs.appendFile(f.files.bundle,'include /tmp/external.conf;\n');
  const r=await f.act();assert.equal(r.reply.status,'BLOCKED_CONTAINER_IDENTITY');
  assert.deepEqual(f.trace,[]);assert.equal(await f.fencePresent(),false);
 }finally{await f.close();}
});
test('new unbound config inserted during nginx-test stops BEFORE reload with diagnostic',async()=>{
 const f=await fixture({hook:async ({action,paths})=>{if(action==='nginx-test')await fs.writeFile(path.join(paths.approved,'build/sites-enabled/rogue.conf'),'x');}});
 try{const r=await f.act();assert.equal(r.reply.status,'BLOCKED_CONTAINER_IDENTITY');
  assert.ok(f.trace.includes('nginx-test'));assert.ok(!f.trace.includes('nginx-reload'));
  assert.equal(await f.fencePresent(),false);
 }finally{await f.close();}
});
test('new unbound config inserted DURING reload retains quarantine, no signed success',async()=>{
 const f=await fixture({hook:async ({action,paths})=>{if(action==='nginx-reload')await fs.writeFile(path.join(paths.approved,'build/sites-enabled/rogue.conf'),'x');}});
 try{const r=await f.act();assert.equal(r.reply.status,'HOST_OPERATION_INDETERMINATE');
  assert.ok(f.trace.includes('nginx-reload'));assert.equal(await f.fencePresent(),true);
 }finally{await f.close();}
});
test('host-view with unexpected conf.d file blocks all fixed actions before Docker calls',async()=>{
 const f=await fixture({hostView:async()=>({confD:['default.conf','shadow.conf'],siteEnabled:['apps.generated.conf']})});
 try{const r=await f.act();assert.equal(r.reply.status,'BLOCKED_CONTAINER_IDENTITY');
  assert.deepEqual(f.trace,[]);
 }finally{await f.close();}
});
