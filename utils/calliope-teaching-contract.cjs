'use strict';
/**
 * A Cursor-solved incident can teach Calliope a lesson, not grant a new tool.
 * This is a pure, deliberately non-executable, consent-first data contract.
 * Any future implementation/privilege changes remain separate reviewed work.
 */
const crypto=require('node:crypto');
const INSTALLED_OBSERVATION_OR_PROPOSAL_IDS=new Set([
 'http.route.observe',
 'nginx.route.diagnostics.observe',
 'nginx.nextjs_redirect.propose'
]);
const POTENTIAL_NEW_IDS=new Set([
 'browser.mixed_content.inspect',
 'nginx.x_forwarded_proto.propose',
 'nginx.route.transactional_patch',
 'docker.container.health.observe'
]);
const ISSUES=new Set(['nextjs_redirect_loop','mixed_content','route_404','nginx_priority']);
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const ID=/^[a-z][a-z0-9_-]{2,95}$/;
const ROUTE=/^[a-z][a-z0-9-]{0,47}$/;
const RELATIVE=/^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.md$/;
function invalid(){throw Error('INVALID_TEACHING_CANDIDATE');}
function exact(o,keys){
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).length===keys.length&&
  keys.every(k=>Object.hasOwn(o,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function createTeachingCandidate(input){
 if(!exact(input,['incidentId','source','diagnosis','evidence','requestedAbilityIds']))invalid();
 const {incidentId,source,diagnosis,evidence,requestedAbilityIds}=input;
 if(typeof incidentId!=='string'||!ID.test(incidentId)||
    !exact(source,['repository','commit','receipt'])||
    source.repository!=='leorami/Dev-Tunnel-Proxy'||!SHA40.test(source.commit)||
    !RELATIVE.test(source.receipt)||source.receipt.split('/').includes('..')||
    !exact(diagnosis,['issueType','route'])||!ISSUES.has(diagnosis.issueType)||
    typeof diagnosis.route!=='string'||!ROUTE.test(diagnosis.route)||
    !exact(evidence,['beforeSha256','afterSha256','testReceipt','replayedInCurrentRc2'])||
    !SHA64.test(evidence.beforeSha256)||!SHA64.test(evidence.afterSha256)||
    evidence.beforeSha256===evidence.afterSha256||
    !RELATIVE.test(evidence.testReceipt)||evidence.testReceipt.split('/').includes('..')||
    typeof evidence.replayedInCurrentRc2!=='boolean'||
    !Array.isArray(requestedAbilityIds)||requestedAbilityIds.length<1||requestedAbilityIds.length>8||
    requestedAbilityIds.some(x=>typeof x!=='string'||
      !(INSTALLED_OBSERVATION_OR_PROPOSAL_IDS.has(x)||POTENTIAL_NEW_IDS.has(x)))||
    new Set(requestedAbilityIds).size!==requestedAbilityIds.length)invalid();
 const proposed=requestedAbilityIds.map(id=>Object.freeze({
  id,
  registryStatus:INSTALLED_OBSERVATION_OR_PROPOSAL_IDS.has(id)
   ?'CONTRACT_ONLY_NOT_INSTALLED':'NEW_ABILITY_REQUEST_NOT_IMPLEMENTED',
  runnable:false
 }));
 const newRequests=Object.freeze(proposed.filter(x=>x.registryStatus==='NEW_ABILITY_REQUEST_NOT_IMPLEMENTED').map(x=>x.id));
 const core=JSON.stringify([incidentId,source.repository,source.commit,source.receipt,
   diagnosis.issueType,diagnosis.route,evidence.beforeSha256,evidence.afterSha256,
   evidence.testReceipt,evidence.replayedInCurrentRc2,requestedAbilityIds]);
 return Object.freeze({
  proposalId:crypto.createHash('sha256').update(core).digest('hex'),
  status:evidence.replayedInCurrentRc2?'REPLAY_REPORTED_PENDING_REVIEW':'HISTORICAL_EVIDENCE_NEEDS_REPLAY',
  issueType:diagnosis.issueType,
  route:diagnosis.route,
  source:Object.freeze({repository:source.repository,commit:source.commit,receipt:source.receipt}),
  evidence:Object.freeze({...evidence}),
  requestedAbilities:Object.freeze(proposed),
  newAbilityRequests:newRequests,
  skillComposition:'UNIMPLEMENTED',
  moduleComposition:'UNIMPLEMENTED',
  ownerApprovalGranted:false,executionAuthorized:false,networkTransferAuthorized:false,
  healingPerformed:false,learningProven:false,
  releaseGateSatisfied:false
 });
}
module.exports={createTeachingCandidate};
