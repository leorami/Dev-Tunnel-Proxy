'use strict';
/**
 * Source-only, default-deny DevProxy RC1 cutover decision helper.
 * Operator evidence must be corroborated; this never interacts with Docker,
 * the filesystem, credentials, network, Git, or production.
 */
const EXPECTED_SHA='d89c962fb31a962a518f331bae458e63708e7e86';
const REQUIRED=Object.freeze([
  'stagingOwnerAccepted','controlledReleaseOwnerAuthorized','exactSourceDiffReviewed',
  'approvedCandidateImageTested','trustedBrowserOriginsValidatedPrivately',
  'privateImageRollbackVerified','privateConfigRollbackVerified',
  'originalImageIdsStillAvailable','liveRouteBaselineCaptured',
  'candidateRouteParityTested','anonymousAndSignedInRegressionPassed',
  'hostResourcesVerified','liveComposeDryRunOnly',
  'rollbackProcedureTestedInIsolation','rollbackOperatorReady',
  'macBridgePreserved','ngrokDomainPreserved','ownerCheckoutPreserved',
  'duplicatePRExcluded','publicIngressMetadataPlanReviewed',
]);
const FORBIDDEN=Object.freeze([
  'usesLegacySwitcher','composeDown','hostDockerPruneOrLoad',
  'modifiesLiveSourceBeforeGate','changesBridgeOrLaunchAgent',
  'exposesNewPublicEndpoint','secretsInLogOrGit',
]);
function ownData(input,key){
  const descriptor=input&&typeof input==='object'
    ?Object.getOwnPropertyDescriptor(input,key):undefined;
  return descriptor&&Object.prototype.hasOwnProperty.call(descriptor,'value')
    ?descriptor.value:undefined;
}
function assessCutoverPreflight(input){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const blockers=[];
  if(ownData(value,'candidateSha')!==EXPECTED_SHA)blockers.push('candidateSha');
  if(ownData(value,'changeScope')!=='proxy-and-api-only')blockers.push('changeScope');
  if(ownData(value,'strategy')!=='isolated-source-controlled-recreate')blockers.push('strategy');
  const budget=ownData(value,'acceptedInterruptionBudgetSeconds');
  if(!Number.isInteger(budget)||budget<1||budget>120)blockers.push('acceptedInterruptionBudgetSeconds');
  for(const key of REQUIRED)if(ownData(value,key)!==true)blockers.push(key);
  for(const key of FORBIDDEN)if(ownData(value,key)!==false)blockers.push(key);
  return Object.freeze({
    status:blockers.length===0?'READY_FOR_CONTROLLED_OPERATOR_CUTOVER':'BLOCKED',
    deployed:false,performedActions:false,blockers:Object.freeze(blockers),
  });
}
function formatCutoverPreflight(result){
  const lines=['DevProxy RC1 source-only cutover preflight',
    'Status: '+(result.status==='READY_FOR_CONTROLLED_OPERATOR_CUTOVER'?'READY_FOR_CONTROLLED_OPERATOR_CUTOVER':'BLOCKED'),
    'Deployment performed: NO','Authorization: OPERATOR_CONTROLLED; NOT_AUTOMATIC'];
  for(const key of result.blockers)lines.push('BLOCKER: '+key);
  return lines.join('\n');
}
module.exports={EXPECTED_SHA,REQUIRED,FORBIDDEN,assessCutoverPreflight,formatCutoverPreflight};
