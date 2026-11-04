'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {createSignedCandidateRequest}=require('../../utils/rc1-content-bound-activation-request.cjs');
const {createTwoPhaseHostSettlement,createVerifiedApiSettlementAck,verifySignedFinalSettlement}=require('../../utils/rc1-two-phase-host-settlement.cjs');
const SECRET=Buffer.from('2d'.repeat(32),'hex');
async function fixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dpv12-settle-'));
 await fs.chmod(dir,0o700);
 const approvedRoot=path.join(dir,'approved');
 const leaseDir=path.join(dir,'lease');
 await fs.mkdir(approvedRoot,{mode:0o700});
 await fs.mkdir(leaseDir,{mode:0o700});
 await fs.mkdir(path.join(leaseDir,'replay'),{mode:0o700});
 for(const [relative,body] of [
  ['build/sites-enabled/apps.generated.conf','location /ok/ { return 200; }\n'],
  ['config/default.production.conf','server{listen 80;}\n'],
  ['config/nginx.production.conf','events{}\nhttp{}\n']]){
  const p=path.join(approvedRoot,relative);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,body,{mode:0o600});
 }
 const sha=(await createCandidateManifest({approvedRoot})).candidateSha256;
 const request=()=>createSignedCandidateRequest({secret:SECRET,expectedCandidateSha256:sha});
 const mk=(overrides={})=>createTwoPhaseHostSettlement({directory:leaseDir,approvedRoot,secret:SECRET,
  verifyHostPrepared:async()=>true,verifyActiveRoute:async()=>true,...overrides});
 return {dir,leaseDir,approvedRoot,sha,request,mk,close:()=>fs.rm(dir,{recursive:true,force:true})};
}
test('RED: two-phase settlement implementation exists and cannot auto-start Docker',()=>{
 assert.equal(typeof createTwoPhaseHostSettlement,'function');
 assert.equal(typeof createVerifiedApiSettlementAck,'function');
 assert.equal(typeof verifySignedFinalSettlement,'function');
});
test('successful signed host-prepared -> API rehash -> signed ACK -> independently verified final settlement',async()=>{
 const f=await fixture();try{
  const host=f.mk();const req=f.request();
  assert.equal((await host.begin({request:req})).status,'HOST_SETTLEMENT_HELD');
  const prepared=await host.prepare({requestId:req.requestId});
  assert.equal(prepared.status,'HOST_PREPARED_AWAITING_API_SETTLEMENT');
  assert.equal(prepared.productionChangeAuthorized,false);
  const ack=await createVerifiedApiSettlementAck({prepared,secret:SECRET,approvedRoot:f.approvedRoot});
  const final=await host.settle({ack});
  assert.equal(final.status,'HOST_SETTLEMENT_CLOSED');
  assert.equal(final.productionChangeAuthorized,false);
  assert.equal(verifySignedFinalSettlement({response:final,prepared,secret:SECRET}).ok,true);
  await assert.rejects(()=>fs.lstat(path.join(f.leaseDir,'host-settlement-inflight.json')),{code:'ENOENT'});
 }finally{await f.close();}
});
async function held(f){const host=f.mk();const req=f.request();await host.begin({request:req});const prepared=await host.prepare({requestId:req.requestId});return {host,req,prepared};}
async function markerPresent(f){return Boolean(await fs.lstat(path.join(f.leaseDir,'host-settlement-inflight.json')).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)));}

test('unauthenticated request cannot reserve replay or create a host fence',async()=>{
 const f=await fixture();try{
  const req={...f.request(),mac:'0'.repeat(64)};
  await assert.rejects(()=>f.mk().begin({request:req}),/UNAUTHENTICATED/);
  assert.equal(await markerPresent(f),false);
  assert.deepEqual(await fs.readdir(path.join(f.leaseDir,'replay')),[]);
 }finally{await f.close();}
});
test('one held host fence blocks a DIFFERENT valid signed request across separate host instances',async()=>{
 const f=await fixture();try{
  const a=f.mk();const reqA=f.request();await a.begin({request:reqA});
  const reqB=f.request();await assert.rejects(()=>f.mk().begin({request:reqB}),/HOST_SETTLEMENT_QUARANTINED/);
  assert.equal(await markerPresent(f),true);
 }finally{await f.close();}
});
test('host cannot publish prepared success without independent fixed-action attestation',async()=>{
 const f=await fixture();try{
  const h=f.mk({verifyHostPrepared:async()=>false});const req=f.request();await h.begin({request:req});
  await assert.rejects(()=>h.prepare({requestId:req.requestId}),/HOST_SETTLEMENT_INDETERMINATE/);
  assert.equal(await markerPresent(f),true);
 }finally{await f.close();}
});
test('host cannot publish prepared success if loaded route verification fails',async()=>{
 const f=await fixture();try{
  const h=f.mk({verifyActiveRoute:async()=>false});const req=f.request();await h.begin({request:req});
  await assert.rejects(()=>h.prepare({requestId:req.requestId}),/HOST_SETTLEMENT_INDETERMINATE/);
  assert.equal(await markerPresent(f),true);
 }finally{await f.close();}
});
test('no API ACK: host fence persists across coordinator reconstruction (crash-safe)',async()=>{
 const f=await fixture();try{
  const {req}=await held(f);
  await assert.rejects(()=>f.mk().begin({request:f.request()}),/HOST_SETTLEMENT_QUARANTINED/);
  await assert.rejects(()=>f.mk().prepare({requestId:req.requestId}),/HOST_SETTLEMENT_QUARANTINED/);
  assert.equal(await markerPresent(f),true);
 }finally{await f.close();}
});
test('API candidate changed AFTER host prepared cannot produce ACK',async()=>{
 const f=await fixture();try{
  const {prepared}=await held(f);
  await fs.appendFile(path.join(f.approvedRoot,'build/sites-enabled/apps.generated.conf'),'# tamper\n');
  await assert.rejects(()=>createVerifiedApiSettlementAck({prepared,secret:SECRET,approvedRoot:f.approvedRoot}),/API_SETTLEMENT_CANDIDATE_CHANGED/);
  assert.equal(await markerPresent(f),true);
 }finally{await f.close();}
});
test('host candidate changed AFTER API verified ACK cannot release fence',async()=>{
 const f=await fixture();try{
  const {host,prepared}=await held(f);
  const ack=await createVerifiedApiSettlementAck({prepared,secret:SECRET,approvedRoot:f.approvedRoot});
  await fs.appendFile(path.join(f.approvedRoot,'config/default.production.conf'),'# changed after client ack\n');
  await assert.rejects(()=>host.settle({ack}),/HOST_SETTLEMENT_CANDIDATE_CHANGED/);
  assert.equal(await markerPresent(f),true);
 }finally{await f.close();}
});
test('incorrect HMAC or request ID in API ACK denies settlement without clearing durable marker',async()=>{
 const f=await fixture();try{
  const {host,prepared}=await held(f);const ack=await createVerifiedApiSettlementAck({prepared,secret:SECRET,approvedRoot:f.approvedRoot});
  for(const altered of [{...ack,mac:'0'.repeat(64)},{...ack,requestId:'f'.repeat(32)},{...ack,ts:ack.ts+100000}])
   await assert.rejects(()=>host.settle({ack:altered}),/UNTRUSTED_API_SETTLEMENT_ACK/);
  assert.equal(await markerPresent(f),true);
  const result=await host.settle({ack});assert.equal(result.status,'HOST_SETTLEMENT_CLOSED');
 }finally{await f.close();}
});
test('forged host prepared MAC cannot cause API to sign ACK',async()=>{
 const f=await fixture();try{
  const {prepared}=await held(f);
  await assert.rejects(()=>createVerifiedApiSettlementAck({prepared:{...prepared,preparedMac:'0'.repeat(64)},secret:SECRET,approvedRoot:f.approvedRoot}),/UNTRUSTED_HOST_PREPARATION/);
 }finally{await f.close();}
});
test('settled response cannot be forged or cross-bound to other transaction',async()=>{
 const f=await fixture();try{
  const {host,prepared}=await held(f);const ack=await createVerifiedApiSettlementAck({prepared,secret:SECRET,approvedRoot:f.approvedRoot});
  const final=await host.settle({ack});
  assert.equal(verifySignedFinalSettlement({response:final,prepared,secret:SECRET}).ok,true);
  for(const tampered of [{...final,finalMac:'0'.repeat(64)},{...final,status:'HOST_PREPARED_AWAITING_API_SETTLEMENT'},{...final,productionChangeAuthorized:true},{...final,extra:'bad'}])
   assert.equal(verifySignedFinalSettlement({response:tampered,prepared,secret:SECRET}).ok,false);
 }finally{await f.close();}
});
test('duplicate request ID remains rejected even AFTER successful settlement',async()=>{
 const f=await fixture();try{
  const {host,req,prepared}=await held(f);const ack=await createVerifiedApiSettlementAck({prepared,secret:SECRET,approvedRoot:f.approvedRoot});
  await host.settle({ack});
  await assert.rejects(()=>f.mk().begin({request:req}),/HOST_SETTLEMENT_REPLAY_DENIED/);
 }finally{await f.close();}
});
test('world-writable host lease directory is rejected before any privileged callback',async()=>{
 const f=await fixture();try{
  await fs.chmod(f.leaseDir,0o777);await assert.rejects(()=>f.mk().begin({request:f.request()}),/UNSAFE_HOST_SETTLEMENT_DIRECTORY/);
  assert.equal(await markerPresent(f),false);
 }finally{await f.close();}
});
test('symlink settlement marker is never followed, deleted or accepted',async()=>{
 const f=await fixture();try{
  const outside=path.join(f.dir,'outside');await fs.writeFile(outside,'safe\n');
  await fs.symlink(outside,path.join(f.leaseDir,'host-settlement-inflight.json'));
  await assert.rejects(()=>f.mk().begin({request:f.request()}),/HOST_SETTLEMENT_QUARANTINED/);
  assert.equal(await fs.readFile(outside,'utf8'),'safe\n');
 }finally{await f.close();}
});
test('post-ACK host verification must still succeed, even with matching digest',async()=>{
 const f=await fixture();let ready=true;try{
  const h=f.mk({verifyHostPrepared:async()=>ready});const req=f.request();await h.begin({request:req});
  const p=await h.prepare({requestId:req.requestId});const ack=await createVerifiedApiSettlementAck({prepared:p,secret:SECRET,approvedRoot:f.approvedRoot});
  ready=false;await assert.rejects(()=>h.settle({ack}),/HOST_SETTLEMENT_INDETERMINATE/);
  assert.equal(await markerPresent(f),true);
 }finally{await f.close();}
});
test('settlement module contains no Docker, network, worker-start, reset or owner GO API',async()=>{
 const f=await fixture();try{
  const h=f.mk();assert.deepEqual(Object.keys(h),['begin','prepare','settle']);
  for(const key of ['reset','recover','deploy','exec','start'])assert.equal(key in h,false);
  const src=await fs.readFile(path.join(__dirname,'../../utils/rc1-two-phase-host-settlement.cjs'),'utf8');
  assert.equal(/require\(['"]node:child_process|createServer\(|\/var\/run\/docker\.sock/.test(src),false);
 }finally{await f.close();}
});
