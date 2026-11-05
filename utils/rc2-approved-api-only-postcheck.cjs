'use strict';
/**
 * Strict source-only verifier for the single owner-authorized RC2 API correction.
 * It evaluates a PRIVATE, redacted pre/post snapshot supplied by an independent
 * reviewer. It does not read, contact, recreate, reload, or authorize anything.
 * Specifically: recreating the API can change Docker DNS, while the running
 * nginx upstream in an unchanged proxy can retain a now-stale resolved IP.
 * That is a mandatory fail-closed rollback boundary, not a reason to restart
 * or reload the proxy beyond the owner's narrow API-only authorization.
 *
 * Real owner hostnames, private IPs, session cookies, secrets, Docker output
 * and filesystem paths never belong in GitHub evidence.
 */
const IDS=/^[a-f0-9]{64}$/;
const SHA=/^[a-f0-9]{40}$/;
const FIELDS=Object.freeze(['proxyId','apiId','ngrokId','proxyImage','apiImage',
 'bridgeFingerprint','masterSha','ownerDirtyFingerprint','routeFingerprint',
 'workerPid','workerSingleton']);
const GATES=Object.freeze([
 'approvedHttpsOriginExactlyAdded','existingLoopbackOriginsPreserved',
 'apiUserNonroot50420','apiReadOnlySource','apiNoDockerSocket',
 'protectedOwnerEnvAndCredentialsPreserved','sessionContinuity',
 'hmacSecretAndSpoolPreserved','supervisedWorkerResponsive',
 'onlyOneApiRecreate','noProxyRestartOrReload','apiImageAndSourceReviewed',
 'apiDnsMatchesProxyUpstream','noAdditionalServices',
 'nginxConfigAnd17RoutesIdentical','healthyHttpsNegativePassword401',
 'untrustedOrigin403','localAskSignedIn200',
 'anonymousHealthMinimalNoStore','rollbackArtifactsAndRehearsalConfirmed'
]);
const INPUT=Object.freeze(['authorizationComment','phase','before','after','privateChecks']);
const positive=Object.freeze({
 code:'API_ONLY_POSTCHECK_REVIEW_ONLY',evidenceConsistent:true,
 liveDeploymentAttested:false,productionChangeAuthorized:false,
 performedActions:false,ownerUatApproved:false
});
const denied=Object.freeze({
 code:'API_ONLY_POSTCHECK_INCOMPLETE',evidenceConsistent:false,
 liveDeploymentAttested:false,productionChangeAuthorized:false,
 performedActions:false,ownerUatApproved:false
});
const staleDns=Object.freeze({
 code:'API_ONLY_DNS_UPSTREAM_ROLLBACK_REQUIRED',evidenceConsistent:false,
 liveDeploymentAttested:false,productionChangeAuthorized:false,
 performedActions:false,ownerUatApproved:false
});
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||
   Object.getPrototypeOf(o)!==Object.prototype)return false;
 const present=Reflect.ownKeys(o);
 if(present.length!==keys.length)return false;
 return present.every(k=>typeof k==='string'&&keys.includes(k)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
const get=(o,k)=>Object.getOwnPropertyDescriptor(o,k).value;
function validSnapshot(s){
 if(!exact(s,FIELDS))return false;
 for(const field of FIELDS){
  const value=get(s,field);
  if(field==='workerPid'){
   if(!Number.isSafeInteger(value)||value<=0)return false;
  }else if(field==='workerSingleton'){
   if(value!==true)return false;
  }else if(field==='masterSha'){
   if(typeof value!=='string'||!SHA.test(value))return false;
  }else if(typeof value!=='string'||!IDS.test(value))return false;
 }
 return true;
}
function assessApprovedApiOnlyPostcheck(input){
 try{
  if(!exact(input,INPUT)||get(input,'authorizationComment')!==6672650274||
     get(input,'phase')!=='POST_API_ONLY_RECREATE')return denied;
  const before=get(input,'before'),after=get(input,'after'),
   checks=get(input,'privateChecks');
  if(!validSnapshot(before)||!validSnapshot(after)||!exact(checks,GATES))
   return denied;
  for(const key of FIELDS){
   if(key!=='apiId'&&key!=='apiImage'&&get(before,key)!==get(after,key))
    return denied;
  }
  if(get(before,'apiId')===get(after,'apiId'))return denied;
  if(get(checks,'apiDnsMatchesProxyUpstream')===false)return staleDns;
  if(GATES.some(k=>get(checks,k)!==true))return denied;
  return positive;
 }catch{return denied;}
}
module.exports={assessApprovedApiOnlyPostcheck};
