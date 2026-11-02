'use strict';
/**
 * Source-only RC1 release evidence classifier. It never accesses host state,
 * inspects containers, reads secrets, calls a network or grants authority.
 * PASS claims must be backed by independently reviewed external receipts.
 */
const RELEASE_GATES=Object.freeze([
  'sourceTests',
  'productionCompose',
  'node18Parity',
  'fixtureBrowser',
  'macBridgeMock',
  'currentImageIdentified',
  'rollbackArchiveVerified',
  'routeBaselineRecorded',
  'publicIngressPlanReviewed',
  'ownerStagingUat',
  'macBridgeOwnerPlan',
  'ownerExplicitApproval',
]);
const VALID_STATES=new Set(['PASS','FAIL','BLOCKED','NOT_RUN']);
function assessReleaseEvidence(input){
  const candidate=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const gates={};
  const blockers=[];
  for(const key of RELEASE_GATES){
    // Never dereference attacker-controlled getters or prototype fields;
    // a receipt must be explicit own data with an exact gate-state value.
    const descriptor=Object.getOwnPropertyDescriptor(candidate,key);
    const value=descriptor&&Object.prototype.hasOwnProperty.call(descriptor,'value')
      &&VALID_STATES.has(descriptor.value)?descriptor.value:'NOT_RUN';
    gates[key]=value;
    if(value!=='PASS')blockers.push(key);
  }
  return Object.freeze({
    recommendation:blockers.length===0?'READY_FOR_OWNER_DECISION':'NO_GO',
    ownerActionRequired:true,
    releaseAuthorized:false,
    installed:false,
    gates:Object.freeze(gates),
    blockers:Object.freeze(blockers),
  });
}
function formatRedactedDecision(result){
  const valid=result&&typeof result==='object'?result:assessReleaseEvidence(null);
  // Render constant gate names and a strict allowlisted status only.
  const lines=['DevProxy RC1 owner release evidence'];
  const outcome=valid.recommendation==='READY_FOR_OWNER_DECISION'
    ?'READY_FOR_OWNER_DECISION':'NO_GO';
  lines.push('Recommendation: '+outcome);
  for(const gate of RELEASE_GATES){
    const status=VALID_STATES.has(valid.gates?.[gate])?valid.gates[gate]:'NOT_RUN';
    lines.push(gate+': '+status);
  }
  lines.push('Release authority: OWNER_ONLY');
  lines.push('Deployment performed: NO');
  return lines.join('\n');
}
module.exports={RELEASE_GATES,assessReleaseEvidence,formatRedactedDecision};
