'use strict';
/**
 * NONLIVE v7 composition: v6 HMAC file spool + fixed host sequence wrapped in
 * the CTO durable host-operation crash fence. Does not install a worker,
 * open listeners, touch owner .artifacts, or mount the host Docker engine
 * socket, or alter the running v5 API (allowConfigEdit:false). Live wiring
 * needs separate authority.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSpoolHost,createSpoolClient,provisionPrivateQueue}=require('./rc1-activation-spool.cjs');
const {createHostOperationQuarantine}=require('./rc1-host-operation-quarantine.cjs');
const {createCandidateManifest,CANDIDATE_PATHS}=require('./rc1-route-candidate-manifest.cjs');
const {ACTION}=require('./rc1-content-bound-activation-request.cjs');

const GOOD=Object.freeze({
 status:'RELOAD_AND_VERIFICATION_REPORTED',
 containerIdentityVerified:true,
 activeRouteVerified:true,
 candidateDigestVerified:true
});
const PRE_RELOAD=new Set(['BLOCKED_CONTAINER_IDENTITY','NGINX_VALIDATION_FAILED']);

async function syncDirectory(dir){
 const d=await fs.open(dir,'r');
 try{await d.sync();}finally{await d.close();}
}
async function clearOwnedMarker(fenceDirectory,initial){
 const markerPath=path.join(fenceDirectory,'host-operation-inflight');
 const current=await fs.lstat(markerPath,{bigint:true});
 if(!current.isFile()||current.isSymbolicLink()||current.nlink!==1n||
    current.dev!==initial.dev||current.ino!==initial.ino||
    (current.mode&0o777n)!==0o600n)throw Error('MARKER_IDENTITY_CHANGED');
 await fs.unlink(markerPath);
 await syncDirectory(fenceDirectory);
}
function validateFence(directory){
 return typeof directory==='string'&&path.isAbsolute(directory)&&path.normalize(directory)===directory&&
  directory!=='/'&&!directory.endsWith('/');
}
async function assertPreProvisionedFence(directory){
 const st=await fs.lstat(directory);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid())||
    await fs.realpath(directory)!==directory)throw Error('HOST_FENCE_NOT_PREPROVISIONED');
}

function createGuardedNonliveHostWorker({
 spoolDirectory,fenceDirectory,approvedRoot,secret,driver,verifyActiveRoute,
 now=Date.now,timeoutMs=12000
}={}){
 if(!validateFence(fenceDirectory)||!driver||typeof driver.attest!=='function'||
    typeof driver.execute!=='function'||typeof verifyActiveRoute!=='function'||
    typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<25||timeoutMs>20000)
  throw Error('INVALID_GUARDED_NONLIVE_HOST_WORKER');

 const quarantine=createHostOperationQuarantine({directory:fenceDirectory,timeoutMs});

 async function runFixedSequence(signal,expectedCandidateSha256){
  if(await driver.attest(signal)!==true)return {phase:'pre',status:'BLOCKED_CONTAINER_IDENTITY'};
  if(await driver.execute('nginx-test',signal)!==0)return {phase:'pre',status:'NGINX_VALIDATION_FAILED'};
  if(await driver.attest(signal)!==true)return {phase:'pre',status:'BLOCKED_CONTAINER_IDENTITY'};
  // Reload boundary: failures from here are indeterminate for live workers.
  if(await driver.execute('nginx-reload',signal)!==0)return {phase:'post',status:'NGINX_RELOAD_FAILED'};
  if(await driver.attest(signal)!==true)return {phase:'post',status:'BLOCKED_CONTAINER_IDENTITY'};
  if(await verifyActiveRoute(signal,expectedCandidateSha256)!==true)
   return {phase:'post',status:'ACTIVE_ROUTE_UNVERIFIED'};
  return {phase:'ok',status:'RELOAD_AND_VERIFICATION_REPORTED'};
 }

 async function executeVerified({expectedCandidateSha256}={}){
  await assertPreProvisionedFence(fenceDirectory);
  let preReloadStatus=null;
  const qResult=await quarantine.run(async(signal)=>{
   const markerPath=path.join(fenceDirectory,'host-operation-inflight');
   const initial=await fs.lstat(markerPath,{bigint:true});
   const step=await runFixedSequence(signal,expectedCandidateSha256);
   if(step.phase==='pre'){
    // Only classify a validation rejection as safe AFTER successful and
    // durably verified clearance of our original marker. Otherwise an
    // attacker-replaced or unpersisted marker must remain indeterminate.
    await clearOwnedMarker(fenceDirectory,initial);
    preReloadStatus=step.status;
    throw Object.assign(new Error('PRE_RELOAD_SAFE'),{code:'PRE_RELOAD_SAFE'});
   }
   if(step.phase!=='ok')throw Object.assign(new Error('POST_RELOAD_UNSAFE'),{code:'POST_RELOAD_UNSAFE'});
   // Re-attest all three nginx config files BEFORE allowing the fence to
   // clear. A successful HTTP route probe alone does not prove the candidate
   // bytes still match the exact authenticated activation request.
   const attested=await createCandidateManifest({approvedRoot});
   if(attested.candidateSha256!==expectedCandidateSha256)
    throw Object.assign(new Error('CANDIDATE_CHANGED_AFTER_RELOAD'),{code:'CANDIDATE_CHANGED_AFTER_RELOAD'});
   return GOOD;
  });
  if(preReloadStatus&&PRE_RELOAD.has(preReloadStatus))return preReloadStatus;
  if(qResult.status==='VERIFIED_HOST_OPERATION')return 'RELOAD_AND_VERIFICATION_REPORTED';
  if(qResult.status==='HOST_OPERATION_QUARANTINED')return 'BLOCKED_QUARANTINED';
  return 'HOST_OPERATION_INDETERMINATE';
 }

 const host=createSpoolHost({directory:spoolDirectory,approvedRoot,secret,executeVerified,now});
 return Object.freeze({
  label:'NONLIVE_GUARDED_HOST_WORKER_V7',
  productionChangeAuthorized:false,
  deployed:false,
  wiredToProxyConfigAPI:false,
  allowConfigEditRequiredFalse:true,
  replacesUnixSocketAtRuntime:false,
  action:ACTION,
  candidatePaths:CANDIDATE_PATHS,
  processOne:host.processOne,
  executeVerified,
  createCandidateManifest,
  createSpoolClient:()=>createSpoolClient({directory:spoolDirectory,secret,now,nonce:()=>require('node:crypto').randomBytes(16).toString('hex')}),
 });
}

module.exports={
 createGuardedNonliveHostWorker,
 provisionPrivateQueue,
 GOOD
};
