'use strict';
/**
 * NONLIVE v8 closeout composition: approved v5 route-mutation interface +
 * CTO v8 HMAC spool adapter + CTO-corrected v7 crash-fenced host worker.
 * Does not wire proxyConfigAPI.js, install a host worker, open listeners,
 * touch owner .artifacts, enable config edit, or mutate live Docker.
 */
const crypto=require('node:crypto');
const path=require('node:path');
const {createProductionRouteMutationService}=require('./production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('./exclusive-route-mutation-lock.cjs');
const {createRouteActivationSpoolAdapter}=require('./rc1-v8-spool-activation-adapter.cjs');
const {createGuardedNonliveHostWorker,provisionPrivateQueue}=require('./rc1-v7-guarded-host-worker-nonlive.cjs');
const {createSpoolClient}=require('./rc1-activation-spool.cjs');
const {createCandidateManifest,CANDIDATE_PATHS,PROTOCOL}=require('./rc1-route-candidate-manifest.cjs');

const NONLIVE=Object.freeze({
 label:'NONLIVE_API_HOST_SPOOL_CLOSEOUT_V8',
 productionChangeAuthorized:false,
 deployed:false,
 wiredToProxyConfigAPI:false,
 allowConfigEditRequiredFalse:true,
 replacesUnixSocketAtRuntime:false,
 candidatePaths:CANDIDATE_PATHS,
 protocol:PROTOCOL,
 remainingGap:(
  'After v7 fence clear and signed spool reply, the outer v8 adapter (and/or '+
  'v5 transaction) re-hashes the three-file candidate set. A hostile writer '+
  'can still mutate config between fence clear and that post-check. Closing '+
  'it needs a least-privileged, cross-process integrity lock or content lease '+
  'held from pre-reload attestation through outer post-check — not granted here.'
 )
});

/**
 * Build an in-process, test-owned mutation surface identical in shape to the
 * approved API's createProductionRouteMutationService({activation}) seam.
 * Host callbacks are fake/fixed-action drivers only; never real Docker.
 */
function createNonliveV8ApiHostCloseoutCandidate({
 root,spoolDirectory,fenceDirectory,secret,driver,verifyActiveRoute,
 generateBundle,now=Date.now,timeoutMs=12000,pollMs=20
}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||typeof generateBundle!=='function'||
    !Buffer.isBuffer(secret)||secret.length<32||!driver||typeof verifyActiveRoute!=='function')
  throw Error('INVALID_NONLIVE_V8_CLOSEOUT_CANDIDATE');

 const worker=createGuardedNonliveHostWorker({
  spoolDirectory,fenceDirectory,approvedRoot:root,secret,driver,verifyActiveRoute,now,timeoutMs
 });
 const client=createSpoolClient({
  directory:spoolDirectory,secret,now,
  nonce:()=>crypto.randomBytes(16).toString('hex')
 });
 // Host processes each published ticket inside submit so tests stay in-process
 // without a second application/server (Origin single-canonical-app boundary).
 const spoolClient={
  submit:async(args)=>{
   const ticket=await client.submit(args);
   await worker.processOne(ticket.requestId);
   return ticket;
  },
  readResult:client.readResult
 };
 const activation=createRouteActivationSpoolAdapter({
  approvedRoot:root,spoolClient,timeoutMs,pollMs
 });
 const lock=createExclusiveMutationLock({
  directory:path.join(root,'.artifacts','route-mutation-locks')
 });
 const mutation=createProductionRouteMutationService({
  root,activation,generateBundle,lock,allowConfigEdit:false
 });
 return Object.freeze({
  ...NONLIVE,
  mutation,
  activation,
  worker,
  createCandidateManifest,
  createRouteActivationSpoolAdapter,
  createGuardedNonliveHostWorker,
  provisionPrivateQueue
 });
}

module.exports={
 createNonliveV8ApiHostCloseoutCandidate,
 NONLIVE,
 provisionPrivateQueue
};
