'use strict';
/**
 * TEST-OWNED nonlive production-shaped v5 .activate() bridge proving the exact
 * durable v12 two-phase settle lifecycle. No file-spool worker or Docker is
 * started. This is NOT an owner-authorized runtime transport or release path.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');
const {createSignedCandidateRequest}=require('./rc1-content-bound-activation-request.cjs');
const {createVerifiedApiSettlementAck,verifySignedFinalSettlement}=require('./rc1-two-phase-host-settlement.cjs');
const DIGEST=/^[0-9a-f]{64}$/;
const NONLIVE=Object.freeze({evidenceClass:'synthetic',runtimeAttestation:'NOT_RUNTIME_ATTESTED',
 ownerAuthorizationEstablished:false,deployed:false,productionChangeAuthorized:false,
 liveAttested:false,wiredToProxyConfigAPI:false});
function createNonliveSettlementActivation({approvedRoot,secret,host,simulateFixedHostAction,
 beforeApiAck,afterApiAck}={}){
 if(typeof approvedRoot!=='string'||!path.isAbsolute(approvedRoot)||!Buffer.isBuffer(secret)||secret.length<32||
    !host||typeof host.begin!=='function'||typeof host.prepare!=='function'||typeof host.settle!=='function'||
    typeof simulateFixedHostAction!=='function'||
    (beforeApiAck!==undefined&&typeof beforeApiAck!=='function')||
    (afterApiAck!==undefined&&typeof afterApiAck!=='function'))throw Error('INVALID_NONLIVE_SETTLEMENT_ACTIVATION');
 async function activate({expectedBundleSha256}={}){
  if(typeof expectedBundleSha256!=='string'||!DIGEST.test(expectedBundleSha256))
   return Object.freeze({...NONLIVE,status:'HOST_OPERATION_INDETERMINATE'});
  try{
   const bundle=await fs.readFile(path.join(approvedRoot,'build/sites-enabled/apps.generated.conf'));
   const got=crypto.createHash('sha256').update(bundle).digest('hex');
   if(got!==expectedBundleSha256)throw Error('BUNDLE_PRECHECK_MISMATCH');
   const manifest=await createCandidateManifest({approvedRoot});
   const request=createSignedCandidateRequest({secret,expectedCandidateSha256:manifest.candidateSha256});
   await host.begin({request});
   if(await simulateFixedHostAction({request})!==true)throw Error('HOST_ACTION_NOT_VERIFIED');
   const prepared=await host.prepare({requestId:request.requestId});
   if(beforeApiAck)await beforeApiAck();
   const ack=await createVerifiedApiSettlementAck({prepared,secret,approvedRoot});
   if(afterApiAck)await afterApiAck();
   const final=await host.settle({ack});
   if(!verifySignedFinalSettlement({response:final,prepared,secret}).ok)throw Error('UNTRUSTED_FINAL_HOST_SETTLEMENT');
   const post=await createCandidateManifest({approvedRoot});
   if(post.candidateSha256!==manifest.candidateSha256)throw Error('HOST_SETTLEMENT_POSTCHECK_CHANGED');
   return Object.freeze({...NONLIVE,status:'RELOAD_AND_VERIFICATION_REPORTED'});
  }catch{return Object.freeze({...NONLIVE,status:'HOST_OPERATION_INDETERMINATE'});}
 }
 return Object.freeze({...NONLIVE,activate});
}
module.exports={createNonliveSettlementActivation,NONLIVE};
