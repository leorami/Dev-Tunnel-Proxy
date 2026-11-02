'use strict';
// Pure RC1 P0 recovery evidence contract. Source/test only; never authorizes
// production writes, Docker calls, HTTP probes, credentials or deploys.
const ACCEPTED_RC1_SHA='d89c962fb31a962a518f331bae458e63708e7e86';
const REQUIRED=Object.freeze([
  'priorRc1CutoverGatesRevalidated','privateOwnerEvidenceAttested',
  'exactResolvedComposeOverlayVerified','privateImageAndConfigRollbackRehearsed',
  'trustedOriginsPrivate','sharedNginxApiConfigDigest','candidateImagePinned',
  'sessionAnd17RoutesContinuity','anonymousHealthMinimal','anonymousRoutesDenied',
  'anonymousArtifactsDenied','directApiPort3001LoopbackOnly',
  'notificationsPort3002LoopbackOnly','directChatHistoryRequiresAuth',
  'noPublicDirectNotificationWrites','macBridgeAndNgrokPreserved',
  'noOwnerCheckoutOrMasterMutation','scopedProxyAndApiOnly',
  'disposableNegativeTestsPassed','noLegacySwitcherOrGeneralCompose',
  'rollbackOperatorAndBudgetReady'
]);
const FIELD_KEYS=new Set(['candidateSha',...REQUIRED]);
function blocked(blockers){
  return Object.freeze({status:'BLOCKED',blockers:Object.freeze(blockers),
    deployed:false,performedActions:false,productionChangeAuthorized:false});
}
function evaluateP0RestorationEvidence(input){
  try{
    if(!input||typeof input!=='object'||Array.isArray(input))return blocked(['INVALID_EVIDENCE']);
    const proto=Object.getPrototypeOf(input);
    if(proto!==Object.prototype && proto!==null)return blocked(['INVALID_EVIDENCE']);
    const keys=Reflect.ownKeys(input);
    if(keys.some(k=>typeof k!=='string'||!FIELD_KEYS.has(k)))return blocked(['UNRECOGNIZED_EVIDENCE_FIELDS']);
    const get=(k)=>{
      const d=Object.getOwnPropertyDescriptor(input,k);
      return d&&Object.prototype.hasOwnProperty.call(d,'value')?d.value:undefined;
    };
    const blockers=[];
    if(get('candidateSha')!==ACCEPTED_RC1_SHA)blockers.push('candidateSha');
    for(const k of REQUIRED)if(get(k)!==true)blockers.push(k);
    if(blockers.length)return blocked(blockers);
    // Verified planning evidence cannot substitute for an explicit owner decision.
    return Object.freeze({status:'OWNER_DECISION_REQUIRED',blockers:Object.freeze([]),
      deployed:false,performedActions:false,productionChangeAuthorized:false});
  }catch{
    return blocked(['INVALID_EVIDENCE']);
  }
}
module.exports={ACCEPTED_RC1_SHA,REQUIRED,evaluateP0RestorationEvidence};
