'use strict';
/**
 * RED-first fixtures for cross-process v13 settlement over the HMAC spool.
 * Uses temporary directories and in-process host/API roles. Does NOT attest
 * Mac Docker, install a worker, or authorize production.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {
  createCrossProcessSettlementHost,
  createCrossProcessSettlementActivation,
  provisionSettlementSpool
}=require('../../utils/rc2-cross-process-settlement.cjs');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');

const SECRET=crypto.randomBytes(32);
const CANDIDATE_PATHS=[
  'build/sites-enabled/apps.generated.conf',
  'config/default.production.conf',
  'config/nginx.production.conf'
];

async function seedRoot(root){
 for(const rel of CANDIDATE_PATHS){
  const full=path.join(root,rel);
  await fs.mkdir(path.dirname(full),{recursive:true});
  await fs.writeFile(full,'# fixture '+rel+'\n',{mode:0o600});
 }
 await fs.mkdir(path.join(root,'.artifacts'),{recursive:true,mode:0o700});
}

async function withTemp(fn){
 // Settlement requires realpath(dir)===dir; resolve macOS /var → /private/var.
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dp-rc2-xproc-')));
 try{
  const root=path.join(base,'root');
  const spool=path.join(base,'spool');
  const lease=path.join(base,'lease');
  await fs.mkdir(root,{recursive:true});
  await fs.mkdir(spool,{mode:0o700});
  await fs.mkdir(lease,{mode:0o700});
  await fs.mkdir(path.join(lease,'replay'),{mode:0o700});
  await seedRoot(root);
  await provisionSettlementSpool({directory:spool});
  return await fn({root,spool,lease});
 }finally{
  await fs.rm(base,{recursive:true,force:true});
 }
}

test('cross-process settlement times out when API never publishes an independent ACK',async()=>{
 await withTemp(async({root,spool,lease})=>{
  const {createSpoolClient}=require('../../utils/rc1-activation-spool.cjs');
  const host=createCrossProcessSettlementHost({
   spoolDirectory:spool,leaseDirectory:lease,approvedRoot:root,secret:SECRET,
   executeFixedHostAction:async()=>true,
   verifyHostPrepared:async()=>true,
   verifyActiveRoute:async()=>true,
   ackTimeoutMs:150,pollMs:20
  });
  const manifest=await createCandidateManifest({approvedRoot:root});
  const client=createSpoolClient({
   directory:spool,secret:SECRET,now:Date.now,
   nonce:()=>crypto.randomBytes(16).toString('hex')
  });
  const ticket=await client.submit({expectedCandidateSha256:manifest.candidateSha256});
  const hostResult=await host.processOne(ticket.requestId);
  assert.equal(hostResult.status,'HOST_OPERATION_INDETERMINATE');
  const prepared=await fs.readFile(path.join(spool,'prepared',ticket.requestId+'.json'),'utf8');
  assert.match(prepared,/HOST_PREPARED_AWAITING_API_SETTLEMENT/);
  await assert.rejects(()=>fs.readFile(path.join(spool,'acks',ticket.requestId+'.json')),/ENOENT/);
 });
});

test('cross-process settlement succeeds only when API independently ACKs prepared host state',async()=>{
 await withTemp(async({root,spool,lease})=>{
  const host=createCrossProcessSettlementHost({
   spoolDirectory:spool,leaseDirectory:lease,approvedRoot:root,secret:SECRET,
   executeFixedHostAction:async()=>true,
   verifyHostPrepared:async()=>true,
   verifyActiveRoute:async()=>true,
   ackTimeoutMs:3000,pollMs:20
  });
  const activation=createCrossProcessSettlementActivation({
   approvedRoot:root,spoolDirectory:spool,secret:SECRET,timeoutMs:4000,pollMs:20
  });
  const manifest=await createCandidateManifest({approvedRoot:root});
  const activatePromise=activation.activate({expectedBundleSha256:manifest.parts[0].sha256});
  const requestDir=path.join(spool,'requests');
  let id='';
  for(let attempt=0;attempt<200 && !id;attempt+=1){
   const names=(await fs.readdir(requestDir)).filter(name=>name.endsWith('.json'));
   if(names.length===1) id=names[0].replace(/\.json$/,'');
   else await new Promise(r=>setTimeout(r,15));
  }
  assert.match(id,/^[0-9a-f]{32}$/);
  const hostPromise=host.processOne(id);
  const [apiResult,hostResult]=await Promise.all([activatePromise,hostPromise]);
  assert.equal(hostResult.status,'RELOAD_AND_VERIFICATION_REPORTED');
  assert.equal(apiResult.status,'RELOAD_AND_VERIFICATION_REPORTED');
  assert.equal(apiResult.productionChangeAuthorized,false);
  assert.equal(apiResult.liveAttested,false);
  const prepared=await fs.readFile(path.join(spool,'prepared',id+'.json'),'utf8');
  const ack=await fs.readFile(path.join(spool,'acks',id+'.json'),'utf8');
  assert.match(prepared,/HOST_PREPARED_AWAITING_API_SETTLEMENT/);
  assert.match(ack,/API_SETTLEMENT_ACK_V12/);
 });
});

test('cross-process settlement refuses digest mismatch before host action',async()=>{
 await withTemp(async({root,spool,lease})=>{
  const host=createCrossProcessSettlementHost({
   spoolDirectory:spool,leaseDirectory:lease,approvedRoot:root,secret:SECRET,
   executeFixedHostAction:async()=>{throw Error('should-not-run');},
   verifyHostPrepared:async()=>true,
   verifyActiveRoute:async()=>true
  });
  const activation=createCrossProcessSettlementActivation({
   approvedRoot:root,spoolDirectory:spool,secret:SECRET,timeoutMs:2000,pollMs:20
  });
  const bad=await activation.activate({
   expectedBundleSha256:'0'.repeat(64)
  });
  assert.equal(bad.status,'CONFIG_SET_DIGEST_MISMATCH');
  const names=await fs.readdir(path.join(spool,'requests'));
  assert.equal(names.length,0);
  // Host against empty id is unauthorized.
  const r=await host.processOne('ab'.repeat(16));
  assert.equal(r.code,'REQUEST_NOT_AUTHORIZED');
 });
});

test('the host waits through a briefly linked ack publish instead of failing the first read',async()=>{
 await withTemp(async({root,spool,lease})=>{
  const {createSpoolClient}=require('../../utils/rc1-activation-spool.cjs');
  const {createVerifiedApiSettlementAck}=require('../../utils/rc1-two-phase-host-settlement.cjs');
  const host=createCrossProcessSettlementHost({
   spoolDirectory:spool,leaseDirectory:lease,approvedRoot:root,secret:SECRET,
   executeFixedHostAction:async()=>true,
   verifyHostPrepared:async()=>true,
   verifyActiveRoute:async()=>true,
   ackTimeoutMs:3000,pollMs:20
  });
  const manifest=await createCandidateManifest({approvedRoot:root});
  const client=createSpoolClient({
   directory:spool,secret:SECRET,now:Date.now,
   nonce:()=>crypto.randomBytes(16).toString('hex')
  });
  const ticket=await client.submit({expectedCandidateSha256:manifest.candidateSha256});
  const hostPromise=host.processOne(ticket.requestId);
  const preparedPath=path.join(spool,'prepared',ticket.requestId+'.json');
  let preparedRaw=null;
  for(let attempt=0;attempt<150;attempt+=1){
   try{preparedRaw=await fs.readFile(preparedPath,'utf8');break;}
   catch(error){if(error.code!=='ENOENT')throw error;}
   await new Promise(r=>setTimeout(r,20));
  }
  assert.ok(preparedRaw);
  const ack=await createVerifiedApiSettlementAck({
   prepared:JSON.parse(preparedRaw),secret:SECRET,approvedRoot:root
  });
  const ackDir=path.join(spool,'acks');
  const finalPath=path.join(ackDir,ticket.requestId+'.json');
  const holdPath=path.join(ackDir,'.hold-'+ticket.requestId);
  const tempPath=path.join(ackDir,'.tmp-'+ticket.requestId);
  await fs.writeFile(tempPath,JSON.stringify(ack)+'\n',{mode:0o600});
  await fs.link(tempPath,finalPath);
  await fs.link(tempPath,holdPath);
  await fs.unlink(tempPath);
  assert.equal((await fs.stat(finalPath)).nlink,2);
  await new Promise(r=>setTimeout(r,300));
  await fs.unlink(holdPath);
  const hostResult=await hostPromise;
  assert.equal(hostResult.status,'RELOAD_AND_VERIFICATION_REPORTED');
 });
});

test('Calliope inline docker gate blocks when activation spool env is set',async()=>{
 const prev=process.env.DEVPROXY_ACTIVATION_SPOOL_DIR;
 process.env.DEVPROXY_ACTIVATION_SPOOL_DIR='/tmp/devproxy-spool-fixture';
 try{
  // Reload module not required: gate reads env at call time.
  const {regenerateNginxBundle}=require('../../utils/calliopeHealing.js');
  await assert.rejects(()=>regenerateNginxBundle(),/BLOCKED_INLINE_DOCKER/);
 }finally{
  if(prev===undefined)delete process.env.DEVPROXY_ACTIVATION_SPOOL_DIR;
  else process.env.DEVPROXY_ACTIVATION_SPOOL_DIR=prev;
 }
});
