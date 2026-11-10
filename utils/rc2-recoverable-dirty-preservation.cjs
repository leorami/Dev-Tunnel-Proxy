'use strict';
/**
 * Audited owner-work preservation decision distinct from formal clean-source PASS.
 * Accepts the combination of byte-exact dirty replay + exhaustive inventory
 * attestation + original archive tar attestation + secure nonroot recovery
 * evidence while keeping sourceDirty:true and formalCleanPass:false.
 * Never alone authorizes production cutover or Origin-five AFTER claims.
 */
function exact(o,keys){
 try{return !!o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).length===keys.length&&
  keys.every(k=>{const d=Object.getOwnPropertyDescriptor(o,k);return !!d&&Object.hasOwn(d,'value');});}
 catch{return false;}
}
function deny(code){
 return Object.freeze({
  code,ok:false,sourceDirty:true,formalCleanPass:false,
  ownerWorkPreserved:'UNKNOWN',recoverableDirtyPreservation:false,
  releaseAuthorized:false,productionChangeAuthorized:false,deployed:false,
  ownerUatApproved:false,sourceCurrent:'UNKNOWN',originFiveAfterAttested:false
 });
}
/**
 * @param {{
 *  sourceDirty:true,
 *  byteReplay:{code:string,ownerWorkByteReplayVerified:boolean,sourceDirty:boolean,formalCleanPass:boolean,releaseAuthorized:boolean},
 *  dirtyInventoryExhaustiveAttested:boolean,
 *  originalArchiveTarAttested:boolean,
 *  secureNonrootCandidateRestoreAttested:boolean,
 *  featureScopeOwnerAuthorized?:boolean
 * }} input
 */
function assessRecoverableDirtyPreservation(input={}){
 if(!exact(input,['sourceDirty','byteReplay','dirtyInventoryExhaustiveAttested',
  'originalArchiveTarAttested','secureNonrootCandidateRestoreAttested']) &&
  !exact(input,['sourceDirty','byteReplay','dirtyInventoryExhaustiveAttested',
  'originalArchiveTarAttested','secureNonrootCandidateRestoreAttested','featureScopeOwnerAuthorized']))
  return deny('RECOVERABLE_DIRTY_PRESERVATION_INPUT_INVALID');
 if(input.sourceDirty!==true)return deny('RECOVERABLE_DIRTY_PRESERVATION_REQUIRES_DIRTY_TRUE');
 const br=input.byteReplay;
 if(!br||typeof br!=='object'||Array.isArray(br)||Object.getPrototypeOf(br)!==Object.prototype)
  return deny('RECOVERABLE_DIRTY_PRESERVATION_INPUT_INVALID');
 if(br.code!=='OWNER_DIRTY_BYTE_REPLAY_MATCHED'||br.ownerWorkByteReplayVerified!==true||
    br.sourceDirty!==true||br.formalCleanPass!==false||br.releaseAuthorized!==false)
  return deny('RECOVERABLE_DIRTY_BYTE_REPLAY_REQUIRED');
 if(input.dirtyInventoryExhaustiveAttested!==true)
  return deny('RECOVERABLE_DIRTY_INVENTORY_EXHAUSTIVE_REQUIRED');
 if(input.originalArchiveTarAttested!==true)
  return deny('RECOVERABLE_DIRTY_ORIGINAL_ARCHIVE_TAR_REQUIRED');
 if(input.secureNonrootCandidateRestoreAttested!==true)
  return deny('RECOVERABLE_DIRTY_SECURE_NONROOT_RESTORE_REQUIRED');
 const feature=Object.hasOwn(input,'featureScopeOwnerAuthorized')?
  input.featureScopeOwnerAuthorized:false;
 // Preservation evidence can be complete while cutover remains unauthorized.
 return Object.freeze({
  code:'VERIFIED_RECOVERABLE_DIRTY_PRESERVATION',
  ok:true,
  sourceDirty:true,
  formalCleanPass:false,
  ownerWorkPreserved:'VERIFIED_BYTE_REPLAY_AND_INVENTORY',
  recoverableDirtyPreservation:true,
  releaseAuthorized:false,
  productionChangeAuthorized:false,
  deployed:false,
  ownerUatApproved:false,
  sourceCurrent:'UNKNOWN',
  originFiveAfterAttested:false,
  featureScopeOwnerAuthorized:feature===true,
  cutoverPermittedByThisModule:false
 });
}
module.exports={assessRecoverableDirtyPreservation};
