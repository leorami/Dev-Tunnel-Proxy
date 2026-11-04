'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {createSignedCandidateRequest}=require('../../utils/rc1-content-bound-activation-request.cjs');
const {createTwoPhaseHostSettlement,createVerifiedApiSettlementAck,
  readVerifiedFinalSettlement}=require('../../utils/rc1-two-phase-host-settlement.cjs');
const SECRET=Buffer.from('a3'.repeat(32),'hex');
async function fixture(){
 const dir=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'dpv13-receipt-'));
 await fs.chmod(dir,0o700);
 const approvedRoot=path.join(dir,'approved'),directory=path.join(dir,'lease');
 await fs.mkdir(approvedRoot,{mode:0o700});await fs.mkdir(directory,{mode:0o700});
 await fs.mkdir(path.join(directory,'replay'),{mode:0o700});
 for(const [rel,value] of [
  ['config/nginx.production.conf','events{}\nhttp{}\n'],
  ['config/default.production.conf','server { listen 80; }\n'],
  ['build/sites-enabled/apps.generated.conf','location /abc/ { return 200; }\n']
 ]){
  const file=path.join(approvedRoot,rel);await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,value,{mode:0o600});
 }
 const digest=(await createCandidateManifest({approvedRoot})).candidateSha256;
 const req=()=>createSignedCandidateRequest({secret:SECRET,expectedCandidateSha256:digest});
 const host=(options={})=>createTwoPhaseHostSettlement({directory,approvedRoot,secret:SECRET,
  verifyHostPrepared:async()=>true,verifyActiveRoute:async()=>true,...options});
 async function held(){const h=host(),request=req();await h.begin({request});const prepared=await h.prepare({requestId:request.requestId});
  const ack=await createVerifiedApiSettlementAck({prepared,secret:SECRET,approvedRoot});return {h,request,prepared,ack};}
 const read=(prepared,overrides={})=>readVerifiedFinalSettlement({directory,approvedRoot,prepared,secret:SECRET,...overrides});
 return {dir,directory,approvedRoot,req,host,held,read,close:()=>fs.rm(dir,{recursive:true,force:true})};
}

test('RED: successful host settle persists the authenticated final receipt in replay file',async()=>{
 const f=await fixture();try{
  const {h,request,ack}=await f.held();const final=await h.settle({ack});
  const file=path.join(f.directory,'replay',request.requestId);
  const st=await fs.lstat(file);
  assert.equal(st.isFile(),true);assert.equal(st.nlink,1);assert.equal(st.mode&0o777,0o600);
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  assert.deepEqual(saved,final);
 }finally{await f.close();}
});
test('RED: final receipt can be read after response delivery is lost, but never authorizes live action',async()=>{
 const f=await fixture();try{
  const {h,prepared,ack}=await f.held();await h.settle({ack});
  const recovered=await f.read(prepared);
  assert.equal(recovered.code,'DURABLE_FINAL_RECEIPT_RECOVERED');
  assert.equal(recovered.recovered,true);
  assert.equal(recovered.productionChangeAuthorized,false);
  assert.equal(recovered.liveAttested,false);
  assert.equal(recovered.ownerUatApproved,false);
  assert.equal('finalReceipt' in recovered,false);
 }finally{await f.close();}
});
test('RED: recovery cannot accept a prepared receipt while the inflight host fence remains',async()=>{
 const f=await fixture();try{
  const {prepared}=await f.held();
  const result=await f.read(prepared);
  assert.equal(result.recovered,false);
  assert.equal(result.code,'DURABLE_FINAL_RECEIPT_QUARANTINED');
 }finally{await f.close();}
});
test('RED: host replay digest stays reserved and sealed after successful settle',async()=>{
 const f=await fixture();try{
  const {h,request,ack}=await f.held();await h.settle({ack});
  const file=path.join(f.directory,'replay',request.requestId);
  await assert.rejects(()=>f.host().begin({request}),/HOST_SETTLEMENT_REPLAY_DENIED/);
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).status,'HOST_SETTLEMENT_CLOSED');
 }finally{await f.close();}
});
test('RED: foreign prepared message never reuses another transaction final receipt',async()=>{
 const f=await fixture();try{
  const {h,prepared,ack}=await f.held();await h.settle({ack});
  const foreign={...prepared,requestId:'f'.repeat(32)};
  const r=await f.read(foreign);
  assert.equal(r.recovered,false);
  assert.equal(r.productionChangeAuthorized,false);
 }finally{await f.close();}
});

test('host cannot recover a positive final receipt if clearing PREPARED marker failed',async()=>{
 const f=await fixture();try{
  let checks=0;const h=f.host({verifyActiveRoute:async()=>{
   checks++;
   if(checks===2){
    const p=path.join(f.directory,'host-settlement-prepared.json');
    const body=await fs.readFile(p);
    await fs.rename(p,path.join(f.directory,'prepared-original.json'));
    await fs.writeFile(p,body,{mode:0o600});
   }
   return true;
  }});
  const request=f.req();await h.begin({request});
  const prepared=await h.prepare({requestId:request.requestId});
  const ack=await createVerifiedApiSettlementAck({prepared,secret:SECRET,approvedRoot:f.approvedRoot});
  await assert.rejects(()=>h.settle({ack}),/SETTLEMENT_MARKER_CHANGED/);
  const saved=JSON.parse(await fs.readFile(path.join(f.directory,'replay',request.requestId),'utf8'));
  assert.equal(saved.status,'HOST_SETTLEMENT_CLOSED');
  assert.equal((await f.read(prepared)).code,'DURABLE_FINAL_RECEIPT_QUARANTINED');
  assert.equal((await f.read(prepared)).recovered,false);
  await assert.rejects(()=>f.host().begin({request:f.req()}),/HOST_SETTLEMENT_QUARANTINED/);
 }finally{await f.close();}
});
test('changed candidate bytes after success make historical receipt stale, not live proof',async()=>{
 const f=await fixture();try{
  const {h,prepared,ack}=await f.held();await h.settle({ack});
  await fs.appendFile(path.join(f.approvedRoot,'config/default.production.conf'),'# later change\n');
  const r=await f.read(prepared);
  assert.equal(r.recovered,false);
  assert.equal(r.code,'DURABLE_FINAL_RECEIPT_STALE_CONFIG');
 }finally{await f.close();}
});
test('tampered signed final HMAC never verifies as crash-recovered',async()=>{
 const f=await fixture();try{
  const {h,prepared,ack}=await f.held();await h.settle({ack});
  const file=path.join(f.directory,'replay',prepared.requestId);
  const r=JSON.parse(await fs.readFile(file,'utf8'));
  await fs.writeFile(file,JSON.stringify({...r,finalMac:'0'.repeat(64)})+'\n');
  assert.equal((await f.read(prepared)).code,'UNTRUSTED_DURABLE_FINAL_RECEIPT');
 }finally{await f.close();}
});
test('hard-linked final receipt is rejected without following untrusted inode',async()=>{
 const f=await fixture();try{
  const {h,prepared,ack}=await f.held();await h.settle({ack});
  const file=path.join(f.directory,'replay',prepared.requestId);
  await fs.link(file,path.join(f.dir,'outside-hardlink'));
  assert.equal((await f.read(prepared)).code,'DURABLE_FINAL_RECEIPT_UNVERIFIABLE');
 }finally{await f.close();}
});
test('symlink replacing finalized replay record cannot make recovery read its outside content',async()=>{
 const f=await fixture();try{
  const {h,prepared,ack}=await f.held();await h.settle({ack});
  const file=path.join(f.directory,'replay',prepared.requestId),outside=path.join(f.dir,'outside');
  await fs.rename(file,path.join(f.directory,'replay','sealed-original'));
  await fs.writeFile(outside,'private-outside\n',{mode:0o600});
  await fs.symlink(outside,file);
  assert.equal((await f.read(prepared)).code,'DURABLE_FINAL_RECEIPT_UNVERIFIABLE');
  assert.equal(await fs.readFile(outside,'utf8'),'private-outside\n');
 }finally{await f.close();}
});
test('old completed receipt is not reported when a new signed host action is inflight',async()=>{
 const f=await fixture();try{
  const {h,prepared,ack}=await f.held();await h.settle({ack});
  await f.host().begin({request:f.req()});
  assert.equal((await f.read(prepared)).code,'DURABLE_FINAL_RECEIPT_QUARANTINED');
 }finally{await f.close();}
});
test('read-only final audit leaves receipt exact and never returns secret or private path',async()=>{
 const f=await fixture();try{
  const {h,prepared,ack}=await f.held();await h.settle({ack});
  const file=path.join(f.directory,'replay',prepared.requestId),before=await fs.readFile(file);
  const first=await f.read(prepared),second=await f.read(prepared);
  assert.deepEqual(first,second);
  assert.deepEqual(await fs.readFile(file),before);
  const str=JSON.stringify(first);
  assert.equal(str.includes(f.dir),false);assert.equal(str.includes(SECRET.toString('hex')),false);
  assert.equal(str.includes(prepared.challenge),false);
  assert.equal('reset' in first,false);assert.equal('clear' in first,false);
 }finally{await f.close();}
});

test('real child-process kill after prepared removal never reports false recovered success',async()=>{
 const {spawnSync}=require('node:child_process');
 const f=await fixture();try{
  const child=spawnSync(process.execPath,[
   path.join(__dirname,'../helpers/rc1-v13-kill-before-reply.cjs'),f.directory,f.approvedRoot,'after-prepared-unlink'
  ],{timeout:5000,encoding:'utf8'});
  assert.equal(child.signal,'SIGKILL',child.stderr);
  const prepared=JSON.parse(await fs.readFile(path.join(f.directory,'test-prepared.json'),'utf8'));
  const saved=JSON.parse(await fs.readFile(path.join(f.directory,'replay',prepared.requestId),'utf8'));
  assert.equal(saved.status,'HOST_SETTLEMENT_CLOSED');
  const r=await f.read(prepared);
  assert.equal(r.code,'DURABLE_FINAL_RECEIPT_QUARANTINED');
  assert.equal(r.recovered,false);
 }finally{await f.close();}
});
test('real child-process kill immediately after final fence removal leaves recoverable signed receipt',async()=>{
 const {spawnSync}=require('node:child_process');
 const f=await fixture();try{
  const child=spawnSync(process.execPath,[
   path.join(__dirname,'../helpers/rc1-v13-kill-before-reply.cjs'),f.directory,f.approvedRoot,'after-inflight-unlink'
  ],{timeout:5000,encoding:'utf8'});
  assert.equal(child.signal,'SIGKILL',child.stderr);
  const prepared=JSON.parse(await fs.readFile(path.join(f.directory,'test-prepared.json'),'utf8'));
  const r=await f.read(prepared);
  assert.equal(r.code,'DURABLE_FINAL_RECEIPT_RECOVERED');
  assert.equal(r.recovered,true);
  assert.equal(r.productionChangeAuthorized,false);
  // Starting a new settlement does not change the historical replay record.
  const prev=await fs.readFile(path.join(f.directory,'replay',prepared.requestId));
  await f.host().begin({request:f.req()});
  assert.deepEqual(await fs.readFile(path.join(f.directory,'replay',prepared.requestId)),prev);
 }finally{await f.close();}
});
