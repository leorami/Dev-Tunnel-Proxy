'use strict';
/**
 * Nonlive, owner-authorization-agnostic integration adapter between the
 * approved v5 route transaction's activation.activate({expectedBundleSha256})
 * seam and v6's HMAC-authenticated, three-file digest-bound private file spool.
 *
 * No Docker, listener, sidecar, host worker, env write, or source mutation.
 * No imports from the web API; it is installed only after separate authority.
 * A timed-out submitted request is always INDETERMINATE; never retry or delete
 * it automatically because a host worker might process that request later.
 */
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {PROTOCOL,CANDIDATE_PATHS,createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');
const HEX=/^[0-9a-f]{64}$/;
const NONCE=/^[0-9a-f]{32,64}$/;
const SUCCESS='RELOAD_AND_VERIFICATION_REPORTED';
const REJECT='NGINX_VALIDATION_FAILED';
const result=status=>Object.freeze({status,productionChangeAuthorized:false,liveAttested:false});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function validManifest(m){
 if(!m||typeof m!=='object'||m.protocol!==PROTOCOL||!HEX.test(m.candidateSha256||'')||
  !Array.isArray(m.parts)||m.parts.length!==CANDIDATE_PATHS.length)return false;
 return m.parts.every((p,i)=>p&&p.path===CANDIDATE_PATHS[i]&&
  Number.isSafeInteger(p.bytes)&&p.bytes>0&&HEX.test(p.sha256||''));
}
function validResponse(r){
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.getPrototypeOf(r)!==Object.prototype||
  Reflect.ownKeys(r).length!==2||r.verified!==true||typeof r.status!=='string')return false;
 return Reflect.ownKeys(r).every(k=>typeof k==='string'&&['status','verified'].includes(k)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(r,k),'value'));
}
function createRouteActivationSpoolAdapter({approvedRoot,spoolClient,
 manifestReader=createCandidateManifest,clock=()=>performance.now(),wait=pause,
 timeoutMs=12000,pollMs=75}={}){
 if(typeof approvedRoot!=='string'||!path.isAbsolute(approvedRoot)||path.normalize(approvedRoot)!==approvedRoot||
  approvedRoot==='/'||approvedRoot.endsWith(path.sep)||!spoolClient||
  typeof spoolClient.submit!=='function'||typeof spoolClient.readResult!=='function'||
  typeof manifestReader!=='function'||typeof clock!=='function'||typeof wait!=='function'||
  !Number.isInteger(timeoutMs)||timeoutMs<25||timeoutMs>30000||
  !Number.isInteger(pollMs)||pollMs<5||pollMs>1000||pollMs>timeoutMs)
  throw Error('INVALID_SPOOL_ACTIVATION_CONFIG');
 async function checkedCandidate(expectedBundleSha256){
  const m=await manifestReader({approvedRoot});
  if(!validManifest(m))throw Error('INVALID_CANDIDATE_MANIFEST');
  if(m.parts[0].sha256!==expectedBundleSha256)throw Error('MISMATCHED_TRANSACTION_BUNDLE');
  return m;
 }
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
  try{candidate=await bounded(()=>checkedCandidate(expectedBundleSha256));}
  catch(e){return result(e?.message==='MISMATCHED_TRANSACTION_BUNDLE'?
   'CONFIG_SET_DIGEST_MISMATCH':e?.message==='HOST_DEADLINE_EXPIRED'?
   'BLOCKED_UNAVAILABLE':'CONFIG_SET_UNVERIFIABLE');}
  if(signal?.aborted)return result('BLOCKED_UNAVAILABLE');
  let ticket;
  // Once submission begins it may already have published even if the promise
  // later rejects or times out. Such an error MUST NOT be called a safe no-op.
  try{ticket=await bounded(()=>spoolClient.submit({expectedCandidateSha256:candidate.candidateSha256}));}
  catch{return result('HOST_OPERATION_INDETERMINATE');}
  if(!ticket||typeof ticket!=='object'||!NONCE.test(ticket.requestId||'')||
   ticket.expectedCandidateSha256!==candidate.candidateSha256)
   return result('HOST_OPERATION_INDETERMINATE');
  for(;;){
   if(signal?.aborted)return result('HOST_OPERATION_INDETERMINATE');
   const now=clock();
   if(!Number.isFinite(now)||now-started>=timeoutMs)return result('HOST_OPERATION_INDETERMINATE');
   let response;
   try{response=await bounded(()=>spoolClient.readResult(ticket));}
   catch{return result('HOST_OPERATION_INDETERMINATE');}
   if(signal?.aborted||clock()-started>=timeoutMs)return result('HOST_OPERATION_INDETERMINATE');
   if(response!==null&&response!==undefined){
    if(!validResponse(response))return result('HOST_OPERATION_INDETERMINATE');
    if(response.status!==SUCCESS&&response.status!==REJECT)
     return result('HOST_OPERATION_INDETERMINATE');
    // A valid signed host response is still insufficient when file bytes have
    // changed before our caller can settle its transaction.
    try{
     const latest=await bounded(()=>checkedCandidate(expectedBundleSha256));
     if(signal?.aborted||latest.candidateSha256!==candidate.candidateSha256||
        clock()-started>=timeoutMs)return result('HOST_OPERATION_INDETERMINATE');
    }catch{return result('HOST_OPERATION_INDETERMINATE');}
    return result(response.status);
   }
   const remaining=timeoutMs-(clock()-started);
   if(!Number.isFinite(remaining)||remaining<=0)return result('HOST_OPERATION_INDETERMINATE');
   try{await bounded(()=>wait(Math.min(pollMs,remaining)));}
   catch{return result('HOST_OPERATION_INDETERMINATE');}
  }
 }
 return Object.freeze({activate});
}
module.exports={createRouteActivationSpoolAdapter};
