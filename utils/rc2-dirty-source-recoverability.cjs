'use strict';
/**
 * Separates git dirtiness from owner-work recoverability.
 * Never invents sourceDirty:false, never authorizes release/cutover.
 * Inputs are already-redacted inventories (relative paths + sha256 only).
 */
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return false;
 const actual=Reflect.ownKeys(o);
 return actual.length===keys.length&&keys.every(k=>Object.hasOwn(o,k)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
const HEX=/^[a-f0-9]{64}$/;
function classifyDirtySourceRecoverability({
 sourceDirty,dirtyRelativePaths,archivedMatches,supplementMatches
}={}){
 const fail=(code)=>Object.freeze({
  code,sourceDirty:sourceDirty===true,recoverable:false,
  sourceCurrent:'UNKNOWN',ownerWorkPreserved:'UNKNOWN',
  productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
  formalCleanPass:false
 });
 if(typeof sourceDirty!=='boolean')return fail('DIRTY_RECOVERY_INPUT_INVALID');
 if(sourceDirty===false){
  // A clean tree is not this classifier's success path; keep formal clean separate.
  return Object.freeze({
   code:'SOURCE_CLEAN_NOT_DIRTY_RECOVERY_CASE',sourceDirty:false,recoverable:null,
   sourceCurrent:'UNKNOWN',ownerWorkPreserved:'UNKNOWN',
   productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
   formalCleanPass:false
  });
 }
 if(!Array.isArray(dirtyRelativePaths)||!Array.isArray(archivedMatches)||!Array.isArray(supplementMatches))
  return fail('DIRTY_RECOVERY_INPUT_INVALID');
 if(dirtyRelativePaths.some(p=>typeof p!=='string'||!p.length||p.startsWith('/')||p.includes('\\')||p.includes('..'))||
    [...archivedMatches,...supplementMatches].some(x=>!exact(x,['path','sha256'])||
      typeof x.path!=='string'||!HEX.test(x.sha256)))
  return fail('DIRTY_RECOVERY_INPUT_INVALID');
 const covered=new Set([
  ...archivedMatches.map(x=>x.path),
  ...supplementMatches.map(x=>x.path)
 ]);
 const missing=dirtyRelativePaths.filter(p=>!covered.has(p));
 if(missing.length){
  return Object.freeze({
   code:'DIRTY_OWNER_PATHS_UNACCOUNTED',sourceDirty:true,recoverable:false,
   unaccountedCount:missing.length,
   sourceCurrent:'UNKNOWN',ownerWorkPreserved:'UNKNOWN',
   productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
   formalCleanPass:false
  });
 }
 return Object.freeze({
  code:'VERIFIED_RECOVERABLE_DIRTY_SOURCE',
  sourceDirty:true,
  recoverable:true,
  dirtyCount:dirtyRelativePaths.length,
  archivedMatchCount:archivedMatches.length,
  supplementMatchCount:supplementMatches.length,
  // Recoverability evidence is NOT a formal clean-source PASS and not a GO.
  sourceCurrent:'UNKNOWN',
  ownerWorkPreserved:'PARTIAL_PRIVATE_ARCHIVE_AND_SUPPLEMENT',
  productionChangeAuthorized:false,
  deployed:false,
  ownerUatApproved:false,
  formalCleanPass:false
 });
}
module.exports={classifyDirtySourceRecoverability};
