'use strict';
/**
 * RC2 owner-approved cutover regression: exercise the ACTUAL signed
 * cross-process refusal through the pending queue and exclusive supervisor.
 * All identities, HMAC keys, files and processes here are synthetic.
 * No production worker, Docker, routes or owner-private source are touched.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {createSpoolClient}=require('../../utils/rc1-activation-spool.cjs');
const {createCrossProcessSettlementHost,provisionSettlementSpool}=
 require('../../utils/rc2-cross-process-settlement.cjs');
const {createPendingOnlyHostWorker}=require('../../utils/rc2-pending-host-worker.cjs');
const {createExclusiveHostWorkerService}=require('../../utils/rc2-exclusive-host-worker-service.cjs');
const {verifySignedCandidateReply}=require('../../utils/rc1-content-bound-activation-request.cjs');

async function fixture(){
 const top=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-v120-refusal-')));
 await fs.chmod(top,0o700);
 const root=path.join(top,'product'),spool=path.join(top,'spool'),lease=path.join(top,'lease');
 for(const d of [root,spool,lease,path.join(lease,'replay')])await fs.mkdir(d,{mode:0o700});
 for(const name of ['build/sites-enabled/apps.generated.conf',
  'config/default.production.conf','config/nginx.production.conf']){
  const file=path.join(root,name);
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  await fs.writeFile(file,'# synthetic reviewed fixture '+name+'\n',{mode:0o600});
 }
 await provisionSettlementSpool({directory:spool});
 const secret=randomBytes(32),id=randomBytes(16).toString('hex');
 return {top,root,spool,lease,secret,id,
  request:()=>path.join(spool,'requests',id+'.json'),
  response:()=>path.join(spool,'responses',id+'.json'),
  replay:()=>path.join(lease,'replay',id),
  lock:()=>path.join(lease,'host-worker-singleton.lock'),
  close:()=>fs.rm(top,{recursive:true,force:true})};
}

test('signed host digest refusal remains terminal and the sole supervisor survives to a second scan',async()=>{
 const f=await fixture();try{
  const client=createSpoolClient({directory:f.spool,secret:f.secret,nonce:()=>f.id});
  const ticket=await client.submit({expectedCandidateSha256:'0'.repeat(64)});
  let hostActions=0,scans=0;
  const host=createCrossProcessSettlementHost({
   spoolDirectory:f.spool,leaseDirectory:f.lease,approvedRoot:f.root,secret:f.secret,
   executeFixedHostAction:async()=>{hostActions++;throw Error('UNAUTHORIZED_HOST_ACTION')},
   verifyHostPrepared:async()=>{throw Error('UNEXPECTED_PREPARED')},
   verifyActiveRoute:async()=>{throw Error('UNEXPECTED_ROUTE')}
  });
  const queue=createPendingOnlyHostWorker({spoolDirectory:f.spool,leaseDirectory:f.lease,worker:host});
  const ctl=new AbortController();
  const supervisor=createExclusiveHostWorkerService({leaseDirectory:f.lease,
   worker:{scanOnce:async()=>{scans++;const out=await queue.scanOnce();if(scans===2)ctl.abort();return out;}},
   pollMs:20,wait:async()=>{}});
  const completion=await supervisor.runUntilStopped({signal:ctl.signal});
  assert.equal(completion.code,'HOST_WORKER_STOPPED_CLEANLY');
  assert.equal(completion.count,1);
  assert.equal(scans,2);
  assert.equal(hostActions,0);
  const request=JSON.parse(await fs.readFile(f.request(),'utf8'));
  const signed=JSON.parse(await fs.readFile(f.response(),'utf8'));
  const verified=verifySignedCandidateReply({response:signed,request,secret:f.secret});
  assert.equal(verified.ok,true);
  assert.equal(verified.status,'CONFIG_SET_DIGEST_MISMATCH');
  assert.equal(signed.productionChangeAuthorized,false);
  assert.equal(signed.liveAttested,false);
  assert.deepEqual(await fs.readdir(path.join(f.spool,'prepared')),[]);
  await assert.rejects(()=>fs.lstat(f.replay()),/ENOENT/);
  await assert.rejects(()=>fs.lstat(f.lock()),/ENOENT/);
  assert.equal(ticket.requestId,f.id);
 }finally{f.secret.fill(0);await f.close()}
});

test('missing durable reply is indeterminate; singleton remains crash-quarantined',async()=>{
 const f=await fixture();try{
  await fs.writeFile(f.request(),'{}',{mode:0o600});
  const queue=createPendingOnlyHostWorker({spoolDirectory:f.spool,leaseDirectory:f.lease,
   worker:{processOne:async()=>({code:'HOST_PROCESSED',status:'CONFIG_SET_DIGEST_MISMATCH'})}});
  const supervisor=createExclusiveHostWorkerService({leaseDirectory:f.lease,worker:queue});
  await assert.rejects(()=>supervisor.runOnce(),/HOST_WORKER_SCAN_INDETERMINATE/);
  assert.equal((await fs.lstat(f.lock())).mode&0o777,0o600);
  await assert.rejects(()=>fs.lstat(f.response()),/ENOENT/);
 }finally{f.secret.fill(0);await f.close()}
});

test('unresolved replay after signed refusal cannot be waived or auto-cleaned',async()=>{
 const f=await fixture();try{
  await fs.writeFile(f.request(),'{}',{mode:0o600});
  await fs.writeFile(f.replay(),'unsettled',{mode:0o600});
  let executed=false;
  const queue=createPendingOnlyHostWorker({spoolDirectory:f.spool,leaseDirectory:f.lease,
   worker:{processOne:async()=>{executed=true;throw Error('MUST_NOT_RUN')}}});
  const supervisor=createExclusiveHostWorkerService({leaseDirectory:f.lease,worker:queue});
  await assert.rejects(()=>supervisor.runOnce(),/HOST_WORKER_SCAN_INDETERMINATE/);
  assert.equal(executed,false);
  await fs.lstat(f.replay());
  await fs.lstat(f.lock());
 }finally{f.secret.fill(0);await f.close()}
});
