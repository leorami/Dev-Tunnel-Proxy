'use strict';
/**
 * An adversarial, SOURCE-ONLY assessor of a redacted POST-CUTOVER receipt.
 *
 * It deliberately cannot assert live runtime truth: actual Docker, source,
 * network, browser, host-worker, session and owner-git evidence must be
 * independently collected by the operator, then reviewed by the CTO.
 * A self-reported PASS is never authorization, an actual host observation,
 * confirmation of deployment, or approval of UAT.
 *
 * No filesystem/network/host actions; never echo private input fields.
 */
const HEX64=/^[a-f0-9]{64}$/;
const GIT40=/^[a-f0-9]{40}$/;
const BEFORE_KEYS=Object.freeze([
 'proxyId','apiId','ngrokId','bridgeFingerprint','ownerGitHead',
 'ownerDirtyDigest','sourceDirty','routeSetDigest','routeCount',
 'trustedOriginsDigest'
]);
const FIVE=Object.freeze([
 'sourceCurrent','singleRuntime','noShadowApps','realAppVerified',
 'ownerWorkPreserved'
]);
const CHECKS=Object.freeze([
 'apiNonroot','apiReadOnlyRoot','noDockerSocket',
 'nginxSyntaxAndBrotliVerified','anonymousMgmtDenied',
 'authenticatedSessionPreserved','csrfAndOriginsVerified',
 'localAskVerified','reviewedHealTicketVerified',
 'externalModelAndEmbeddingDisabled','inlineDockerAutoHealDisabled',
 'hmacHostWorkerVerified','loopbackManagementPorts',
 'secureRollbackAvailable','onlyTwoServicesRecreated'
]);
const INPUT=Object.freeze([
 'ownerScope','ownerDecisionIssueComment','phase','before','after',
 'originFive','checks'
]);
const OK=Object.freeze({
 code:'POSTCUTOVER_RECEIPT_COHERENT_REVIEW_ONLY',
 evidenceConsistent:true,
 productionChangeAuthorized:false,performedActions:false,
 liveRuntimeIndependentlyVerified:false,ownerUatApproved:false,
 deploymentStatus:'UNATTESTED'
});
const BLOCKED=Object.freeze({
 code:'POSTCUTOVER_RECEIPT_INCOMPLETE',
 evidenceConsistent:false,
 productionChangeAuthorized:false,performedActions:false,
 liveRuntimeIndependentlyVerified:false,ownerUatApproved:false,
 deploymentStatus:'UNATTESTED'
});
function exact(obj,keys){
 if(obj===null||typeof obj!=='object'||Array.isArray(obj)||
  Object.getPrototypeOf(obj)!==Object.prototype)return false;
 const ownKeys=Reflect.ownKeys(obj);
 if(ownKeys.length!==keys.length||ownKeys.some(k=>!keys.includes(k)))return false;
 for(const key of keys){
  const d=Object.getOwnPropertyDescriptor(obj,key);
  if(!d||!Object.prototype.hasOwnProperty.call(d,'value'))return false;
 }
 return true;
}
const field=(obj,k)=>Object.getOwnPropertyDescriptor(obj,k).value;
function validateSnapshot(o){
 if(!exact(o,BEFORE_KEYS))return false;
 for(const k of ['proxyId','apiId','ngrokId']){
  if(!HEX64.test(field(o,k)))return false;
 }
 for(const k of ['bridgeFingerprint','ownerDirtyDigest','routeSetDigest','trustedOriginsDigest']){
  if(!HEX64.test(field(o,k)))return false;
 }
 return GIT40.test(field(o,'ownerGitHead'))&&field(o,'sourceDirty')===true&&
  field(o,'routeCount')===17;
}
function assessOwnerACutoverReceipt(input){
 try{
  if(!exact(input,INPUT)||
     field(input,'ownerScope')!=='A'||
     field(input,'ownerDecisionIssueComment')!==6669437050||
     field(input,'phase')!=='POSTCUTOVER')return BLOCKED;
  const before=field(input,'before'),after=field(input,'after'),
   five=field(input,'originFive'),checks=field(input,'checks');
  if(!validateSnapshot(before)||!validateSnapshot(after)||
   !exact(five,FIVE)||!exact(checks,CHECKS))return BLOCKED;
  if(field(before,'proxyId')===field(after,'proxyId')||
    field(before,'apiId')===field(after,'apiId')||
    field(after,'proxyId')===field(after,'apiId'))return BLOCKED;
  for(const k of ['ngrokId','bridgeFingerprint','ownerGitHead','ownerDirtyDigest',
   'routeSetDigest','trustedOriginsDigest','routeCount','sourceDirty']){
   if(field(before,k)!==field(after,k))return BLOCKED;
  }
  if(FIVE.some(k=>field(five,k)!=='PASS'))return BLOCKED;
  if(CHECKS.some(k=>field(checks,k)!==true))return BLOCKED;
  return OK;
 }catch{return BLOCKED;}
}
module.exports={assessOwnerACutoverReceipt};
