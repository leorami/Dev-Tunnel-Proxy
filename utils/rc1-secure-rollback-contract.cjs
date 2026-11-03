'use strict';
/**
 * Source-only P0 operator recovery metadata contract.
 * An availability rollback to an old image does not restore confidentiality.
 * Does NOT corroborate a trusted baseline, read Docker, inspect owner files,
 * establish current runtime state, or grant permission to deploy.
 */
const ACCEPTED_RC1_SHA='d89c962fb31a962a518f331bae458e63708e7e86';
const BASELINE=new Set(['attestedFromApprovedRelease','sourceSha','proxyImageId',
  'nginxConfigSha256','routesSha256','mountsSha256','trustedOriginsSha256']);
const FALLBACK=new Set(['sourceSha','proxyImageId','nginxConfigSha256',
  'routesSha256','mountsSha256','trustedOriginsSha256',
  'minimalHealth','routesPrivate','artifactsPrivate',
  'adminPasswordDisclosureAbsent','directApiLoopbackOnly','notificationsLoopbackOnly',
  'browserOriginPolicyApplied','rollbackTestedWithinBudget','trustedReadOnlyRuntimeAttestation',
  'ownerAdminCredentialPreserved','activeSessionsPreserved']);
const REQUIRED_CONTROLS=[...FALLBACK].filter(k=>!BASELINE.has(k));
const TOP=new Set(['secureBaseline','proposedFallback','legacyImageId']);
function plainData(value, keys){
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)return false;
  const fields=Reflect.ownKeys(value);
  if(fields.some(k=>typeof k!=='string'||!keys.has(k)))return false;
  return fields.every(k=>{
    const d=Object.getOwnPropertyDescriptor(value,k);
    return d&&Object.prototype.hasOwnProperty.call(d,'value');
  });
}
function data(o,k){return Object.getOwnPropertyDescriptor(o,k)?.value;}
const sha64 = s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const image = s=>typeof s==='string'&&/^sha256:[0-9a-f]{64}$/.test(s);
function answer(code, rc1MatchedMetadata=false){return Object.freeze({
  code,rc1MatchedMetadata,securitySafe:false,
  productionChangeAuthorized:false,performedActions:false,deployed:false
});}
function assessSecureRollback(input){
  try{
    if(!plainData(input,TOP))return answer('INVALID_EVIDENCE');
    const b=data(input,'secureBaseline'),f=data(input,'proposedFallback'),old=data(input,'legacyImageId');
    if(!plainData(b,BASELINE)||!plainData(f,FALLBACK)||!image(old))return answer('INVALID_EVIDENCE');
    const oldAttested=data(b,'attestedFromApprovedRelease');
    if(oldAttested!==true||data(b,'sourceSha')!==ACCEPTED_RC1_SHA||
      !image(data(b,'proxyImageId'))||
      !['nginxConfigSha256','routesSha256','mountsSha256','trustedOriginsSha256']
        .every(k=>sha64(data(b,k)))||data(b,'proxyImageId')===old){
      return answer('UNTRUSTED_SECURE_BASELINE');
    }
    if(data(f,'proxyImageId')===old)return answer('LEGACY_AVAILABILITY_FALLBACK_INSECURE');
    if(data(f,'sourceSha')!==ACCEPTED_RC1_SHA||
       !image(data(f,'proxyImageId'))||
       data(f,'proxyImageId')!==data(b,'proxyImageId')||
       !['nginxConfigSha256','routesSha256','mountsSha256','trustedOriginsSha256']
         .every(k=>sha64(data(f,k))&&data(f,k)===data(b,k))){
      return answer('SECURITY_BASELINE_MISMATCH');
    }
    if(REQUIRED_CONTROLS.some(k=>data(f,k)!==true))return answer('EVIDENCE_INCOMPLETE');
    return answer('RC1_SECURITY_MATCH_PLAN_ONLY',true);
  }catch{
    return answer('INVALID_EVIDENCE');
  }
}
module.exports={ACCEPTED_RC1_SHA,assessSecureRollback};
