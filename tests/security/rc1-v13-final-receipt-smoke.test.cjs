'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {createSignedCandidateRequest}=require('../../utils/rc1-content-bound-activation-request.cjs');
const {createTwoPhaseHostSettlement,createVerifiedApiSettlementAck,
 readVerifiedFinalSettlement}=require('../../utils/rc1-two-phase-host-settlement.cjs');
async function fixture(){
 const base=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'devproxy-v13-ledger-'));
 await fs.chmod(base,0o700);
 const directory=path.join(base,'host'),approvedRoot=path.join(base,'approved');
 await fs.mkdir(directory,{mode:0o700});await fs.mkdir(path.join(directory,'replay'),{mode:0o700});
 await fs.mkdir(approvedRoot,{mode:0o700});
 for(const [relative,content] of [
  ['config/nginx.production.conf','events{}\nhttp{}\n'],
  ['config/default.production.conf','server{listen 80;}\n'],
  ['build/sites-enabled/apps.generated.conf','location /ok/ { return 200; }\n']
 ]){
  const file=path.join(approvedRoot,relative);
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,content,{mode:0o600});
 }
 const secret=crypto.randomBytes(32);
 const digest=(await createCandidateManifest({approvedRoot})).candidateSha256;
 const host=createTwoPhaseHostSettlement({directory,approvedRoot,secret,
  verifyHostPrepared:async()=>true,verifyActiveRoute:async()=>true});
 const request=createSignedCandidateRequest({secret,expectedCandidateSha256:digest});
 await host.begin({request});
 const prepared=await host.prepare({requestId:request.requestId});
 const ack=await createVerifiedApiSettlementAck({prepared,secret,approvedRoot});
 const recover=()=>readVerifiedFinalSettlement({directory,approvedRoot,prepared,secret});
 return {base,directory,approvedRoot,host,prepared,ack,recover,close:()=>fs.rm(base,{recursive:true,force:true})};
}
test('RED: sealed signed host-final is persisted before returning final success',async()=>{
 const f=await fixture();try{
  const final=await f.host.settle({ack:f.ack});
  const file=path.join(f.directory,'replay',f.prepared.requestId);
  const st=await fs.lstat(file);
  assert.equal(st.mode&0o777,0o600);assert.equal(st.nlink,1);
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),final);
  const recovered=await f.recover();
  assert.equal(recovered.code,'DURABLE_FINAL_RECEIPT_RECOVERED');
  assert.equal(recovered.productionChangeAuthorized,false);
  assert.equal(recovered.liveAttested,false);
 }finally{await f.close();}
});
test('unsettled host fence blocks every positive recovery',async()=>{
 const f=await fixture();try{
  const r=await f.recover();
  assert.equal(r.recovered,false);
  assert.equal(r.code,'DURABLE_FINAL_RECEIPT_QUARANTINED');
 }finally{await f.close();}
});
test('signed replay corruption prevents recovery and exposes no paths or secret',async()=>{
 const f=await fixture();try{
  await f.host.settle({ack:f.ack});
  const file=path.join(f.directory,'replay',f.prepared.requestId);
  const body=JSON.parse(await fs.readFile(file,'utf8'));
  await fs.writeFile(file,JSON.stringify({...body,finalMac:'0'.repeat(64)})+'\n');
  const recovered=await f.recover();
  assert.equal(recovered.recovered,false);
  assert.equal(recovered.code,'UNTRUSTED_DURABLE_FINAL_RECEIPT');
  assert.equal(JSON.stringify(recovered).includes(f.base),false);
 }finally{await f.close();}
});
test('changed candidate after historical settlement blocks stale replay proof',async()=>{
 const f=await fixture();try{
  await f.host.settle({ack:f.ack});
  await fs.appendFile(path.join(f.approvedRoot,'config/default.production.conf'),'# drift\n');
  const recovered=await f.recover();
  assert.equal(recovered.recovered,false);
  assert.equal(recovered.code,'DURABLE_FINAL_RECEIPT_STALE_CONFIG');
 }finally{await f.close();}
});
