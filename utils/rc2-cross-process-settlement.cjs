'use strict';
/**
 * Cross-process v13 settlement over the private HMAC file spool.
 * Host and API are separate processes sharing owner-provisioned directories.
 * Fake in-process ACK is forbidden: only the API may createVerifiedApiSettlementAck
 * after independently rehashing the candidate set.
 *
 * Does not start a daemon, open a listener, mount docker.sock, or authorize
 * production by itself. Operator pins and host-worker installation remain
 * mandatory before any live use.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');
const {verifySignedCandidateRequest,signCandidateReply}=require('./rc1-content-bound-activation-request.cjs');
const {createSpoolClient,provisionPrivateQueue}=require('./rc1-activation-spool.cjs');
const {
  createTwoPhaseHostSettlement,
  createVerifiedApiSettlementAck,
  verifySignedFinalSettlement
}=require('./rc1-two-phase-host-settlement.cjs');

const SUCCESS='RELOAD_AND_VERIFICATION_REPORTED';
const PREP_STATUS='HOST_PREPARED_AWAITING_API_SETTLEMENT';
const NONCE=/^[0-9a-f]{32,64}$/;
const HEX=/^[0-9a-f]{64}$/;
const EXTRA=Object.freeze(['prepared','acks']);

function safeDir(dir){
 return typeof dir==='string'&&path.isAbsolute(dir)&&path.normalize(dir)===dir&&
  dir!=='/'&&!dir.endsWith('/')&&!dir.includes('\0');
}
async function privateDir(dir){
 const st=await fs.lstat(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  throw Error('UNSAFE_PRIVATE_QUEUE_DIRECTORY');
}
async function syncDir(dir){const h=await fs.open(dir,'r');try{await h.sync();}finally{await h.close();}}
async function provisionSettlementSpool({directory}={}){
 await provisionPrivateQueue({directory});
 for(const leaf of EXTRA){
  const p=path.join(directory,leaf);
  try{await fs.mkdir(p,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateDir(p);
 }
}
async function writeNoReplace(dir,id,body){
 if(!NONCE.test(id)||typeof body!=='string'||Buffer.byteLength(body)>2048)
  throw Error('INVALID_SPOOL_MESSAGE');
 await privateDir(dir);
 const final=path.join(dir,id+'.json');
 const temp=path.join(dir,'.tmp-'+crypto.randomBytes(12).toString('hex'));
 let fd;
 try{
  fd=await fs.open(temp,'wx',0o600);
  await fd.writeFile(body);await fd.sync();await fd.close();fd=null;
  await fs.link(temp,final);await fs.unlink(temp);await syncDir(dir);
 }catch(e){
  if(fd)await fd.close();try{await fs.unlink(temp);}catch{}
  if(e.code==='EEXIST')throw Error('REQUEST_ALREADY_EXISTS');throw e;
 }
}
async function readPinnedJson(dir,id){
 if(!NONCE.test(id))throw Error('INVALID_REQUEST_ID');
 await privateDir(dir);
 const file=path.join(dir,id+'.json');
 let st;
 try{st=await fs.lstat(file,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||st.size<=0n||st.size>2048n)
  throw Error('UNSAFE_SPOOL_MESSAGE');
 const h=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const a=await h.stat({bigint:true});
  if(a.dev!==st.dev||a.ino!==st.ino||a.size!==st.size||a.nlink!==1n)
   throw Error('UNSAFE_SPOOL_MESSAGE');
  const data=await h.readFile();
  const b=await h.stat({bigint:true});
  if(b.size!==BigInt(data.length)||b.ino!==st.ino||b.mtimeNs!==a.mtimeNs||b.ctimeNs!==a.ctimeNs)
   throw Error('UNSAFE_SPOOL_MESSAGE');
  return JSON.parse(data.toString('utf8'));
 }catch(e){if(e instanceof SyntaxError)throw Error('INVALID_SPOOL_JSON');throw e;}
 finally{await h.close();}
}
function owned(o,keys){
 return o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype&&
  Reflect.ownKeys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)&&
   Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function validPrepared(prepared){
 return owned(prepared,['status','requestId','candidateSha256','challenge','preparedMac',
  'productionChangeAuthorized','liveAttested'])&&
  prepared.status===PREP_STATUS&&NONCE.test(prepared.requestId)&&HEX.test(prepared.candidateSha256)&&
  NONCE.test(prepared.challenge)&&prepared.productionChangeAuthorized===false&&
  prepared.liveAttested===false&&HEX.test(prepared.preparedMac);
}
function pause(ms){return new Promise(r=>setTimeout(r,ms));}

/**
 * Mac-host settlement worker: process exactly one request id.
 * Fixed host actions are injected; this module never shells docker itself.
 */
function createCrossProcessSettlementHost({
  spoolDirectory,leaseDirectory,approvedRoot,secret,
  executeFixedHostAction,verifyHostPrepared,verifyActiveRoute,
  now=Date.now,ackTimeoutMs=10000,pollMs=50
}={}){
 if(!safeDir(spoolDirectory)||!safeDir(leaseDirectory)||!safeDir(approvedRoot)||
    !Buffer.isBuffer(secret)||secret.length<32||secret.length>128||
    typeof executeFixedHostAction!=='function'||typeof verifyHostPrepared!=='function'||
    typeof verifyActiveRoute!=='function'||typeof now!=='function'||
    !Number.isInteger(ackTimeoutMs)||ackTimeoutMs<100||ackTimeoutMs>30000||
    !Number.isInteger(pollMs)||pollMs<5||pollMs>1000)
  throw Error('INVALID_CROSS_PROCESS_SETTLEMENT_HOST');

 async function processOne(id){
  if(!NONCE.test(id))return Object.freeze({code:'INVALID_REQUEST_ID'});
  await provisionSettlementSpool({directory:spoolDirectory});
  let request;
  try{request=await readPinnedJson(path.join(spoolDirectory,'requests'),id);}
  catch{return Object.freeze({code:'REQUEST_NOT_AUTHORIZED'});}
  if(!request||request.requestId!==id||!verifySignedCandidateRequest({request,secret,now}).ok)
   return Object.freeze({code:'REQUEST_NOT_AUTHORIZED'});

  const settlement=createTwoPhaseHostSettlement({
   directory:leaseDirectory,approvedRoot,secret,now,verifyHostPrepared,verifyActiveRoute
  });

  let status='HOST_OPERATION_INDETERMINATE';
  try{
   const before=await createCandidateManifest({approvedRoot});
   if(before.candidateSha256!==request.expectedCandidateSha256)status='CONFIG_SET_DIGEST_MISMATCH';
   else{
    await settlement.begin({request});
    if(await executeFixedHostAction({expectedCandidateSha256:request.expectedCandidateSha256})!==true)
     throw Error('HOST_ACTION_NOT_VERIFIED');
    const prepared=await settlement.prepare({requestId:request.requestId});
    if(!validPrepared(prepared))throw Error('INVALID_HOST_PREPARATION');
    await writeNoReplace(path.join(spoolDirectory,'prepared'),id,JSON.stringify(prepared)+'\n');

    const deadline=now()+ackTimeoutMs;
    let ack=null;
    while(now()<deadline){
     ack=await readPinnedJson(path.join(spoolDirectory,'acks'),id);
     if(ack)break;
     await pause(pollMs);
    }
    if(!ack)throw Error('API_SETTLEMENT_ACK_TIMEOUT');
    const final=await settlement.settle({ack});
    if(!verifySignedFinalSettlement({response:final,prepared,secret}).ok)
     throw Error('UNTRUSTED_FINAL_HOST_SETTLEMENT');
    const after=await createCandidateManifest({approvedRoot});
    if(after.candidateSha256!==request.expectedCandidateSha256)throw Error('POSTCHECK_CHANGED');
    status=SUCCESS;
   }
  }catch{status='HOST_OPERATION_INDETERMINATE';}

  let signed;
  try{signed=signCandidateReply({secret,request,status});}
  catch{signed=signCandidateReply({secret,request,status:'HOST_OPERATION_INDETERMINATE'});}
  try{await writeNoReplace(path.join(spoolDirectory,'responses'),id,JSON.stringify(signed)+'\n');}
  catch{/* response may already exist after crash; leave quarantine */}
  return Object.freeze({code:'HOST_PROCESSED',status});
 }
 return Object.freeze({processOne,provisionSettlementSpool});
}

/**
 * API-side activation.activate({expectedBundleSha256}) adapter.
 * Publishes ACK only after local candidate rehash — never trusts host-made ACK.
 */
function createCrossProcessSettlementActivation({
  approvedRoot,spoolDirectory,secret,now=Date.now,
  clock=()=>performance.now(),wait=pause,timeoutMs=12000,pollMs=50
}={}){
 if(!safeDir(approvedRoot)||!safeDir(spoolDirectory)||!Buffer.isBuffer(secret)||
    secret.length<32||secret.length>128||typeof now!=='function'||typeof clock!=='function'||
    typeof wait!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<25||timeoutMs>30000||
    !Number.isInteger(pollMs)||pollMs<5||pollMs>1000||pollMs>timeoutMs)
  throw Error('INVALID_CROSS_PROCESS_SETTLEMENT_ACTIVATION');

 const client=createSpoolClient({
  directory:spoolDirectory,secret,now,
  nonce:()=>crypto.randomBytes(16).toString('hex')
 });
 const result=status=>Object.freeze({status,productionChangeAuthorized:false,liveAttested:false});

 async function activate({expectedBundleSha256,signal}={}){
  if(typeof expectedBundleSha256!=='string'||!HEX.test(expectedBundleSha256))
   return result('BLOCKED_INVALID_REQUEST');
  if(signal!==undefined&&(!signal||typeof signal.aborted!=='boolean'))
   return result('BLOCKED_INVALID_REQUEST');
  if(signal?.aborted)return result('BLOCKED_UNAVAILABLE');

  const started=clock();
  if(!Number.isFinite(started))return result('BLOCKED_UNAVAILABLE');
  async function bounded(task){
   const remaining=timeoutMs-(clock()-started);
   if(!Number.isFinite(remaining)||remaining<=0)throw Error('HOST_DEADLINE_EXPIRED');
   let timer;
   return await Promise.race([
    Promise.resolve().then(task),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('HOST_DEADLINE_EXPIRED')),remaining);})
   ]).finally(()=>clearTimeout(timer));
  }

  let candidate;
  try{
   candidate=await bounded(()=>createCandidateManifest({approvedRoot}));
   if(!candidate||candidate.parts?.[0]?.sha256!==expectedBundleSha256)
    return result('CONFIG_SET_DIGEST_MISMATCH');
  }catch(e){
   return result(e?.message==='HOST_DEADLINE_EXPIRED'?'BLOCKED_UNAVAILABLE':'CONFIG_SET_UNVERIFIABLE');
  }

  let ticket;
  try{
   await provisionSettlementSpool({directory:spoolDirectory});
   ticket=await bounded(()=>client.submit({expectedCandidateSha256:candidate.candidateSha256}));
  }catch{return result('HOST_OPERATION_INDETERMINATE');}
  if(!ticket||!NONCE.test(ticket.requestId||'')||
     ticket.expectedCandidateSha256!==candidate.candidateSha256)
   return result('HOST_OPERATION_INDETERMINATE');

  let prepared=null;
  for(;;){
   if(signal?.aborted)return result('HOST_OPERATION_INDETERMINATE');
   if(clock()-started>=timeoutMs)return result('HOST_OPERATION_INDETERMINATE');
   try{prepared=await bounded(()=>readPinnedJson(path.join(spoolDirectory,'prepared'),ticket.requestId));}
   catch{return result('HOST_OPERATION_INDETERMINATE');}
   if(prepared)break;
   try{await bounded(()=>wait(pollMs));}catch{return result('HOST_OPERATION_INDETERMINATE');}
  }
  if(!validPrepared(prepared)||prepared.requestId!==ticket.requestId||
     prepared.candidateSha256!==candidate.candidateSha256)
   return result('HOST_OPERATION_INDETERMINATE');

  let ack;
  try{
   ack=await bounded(()=>createVerifiedApiSettlementAck({prepared,secret,approvedRoot,now}));
   await bounded(()=>writeNoReplace(path.join(spoolDirectory,'acks'),ticket.requestId,JSON.stringify(ack)+'\n'));
  }catch{return result('HOST_OPERATION_INDETERMINATE');}

  for(;;){
   if(signal?.aborted)return result('HOST_OPERATION_INDETERMINATE');
   if(clock()-started>=timeoutMs)return result('HOST_OPERATION_INDETERMINATE');
   let response;
   try{response=await bounded(()=>client.readResult(ticket));}
   catch{return result('HOST_OPERATION_INDETERMINATE');}
   if(response!==null&&response!==undefined){
    if(response.verified!==true)return result('HOST_OPERATION_INDETERMINATE');
    if(response.status!==SUCCESS&&response.status!=='NGINX_VALIDATION_FAILED')
     return result('HOST_OPERATION_INDETERMINATE');
    try{
     const latest=await bounded(()=>createCandidateManifest({approvedRoot}));
     if(latest.candidateSha256!==candidate.candidateSha256)
      return result('HOST_OPERATION_INDETERMINATE');
    }catch{return result('HOST_OPERATION_INDETERMINATE');}
    return result(response.status);
   }
   try{await bounded(()=>wait(pollMs));}catch{return result('HOST_OPERATION_INDETERMINATE');}
  }
 }
 return Object.freeze({activate,provisionSettlementSpool});
}

module.exports={
 createCrossProcessSettlementHost,
 createCrossProcessSettlementActivation,
 provisionSettlementSpool
};
