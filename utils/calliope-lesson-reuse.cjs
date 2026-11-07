'use strict';
/**
 * Deterministic admitted-lesson store for Cursor→Calliope teaching reuse.
 * Stores REVIEW_REQUIRED candidates only. Recognition of an equivalent Next.js
 * redirect failure offers the reviewed propose path — never auto-heals.
 * Duplicate imports and conflicting claims preserve the original lesson.
 */
const crypto=require('node:crypto');
const {proposeNextjsRedirectLoopRepair}=require('./calliope-redirect-loop-proposal.cjs');
const {compileNextjsRedirectLessonEvidence}=require('./calliope-lesson-evidence-compiler.cjs');

const SHA64=/^[a-f0-9]{64}$/;

function createLessonStore(){
 const byId=new Map();
 const outcomes=[];

 function admit(candidate){
  if(!candidate||candidate.status!=='REVIEW_REQUIRED'||
     typeof candidate.lessonId!=='string'||typeof candidate.lessonFingerprint!=='string'||
     !candidate.evidence||!SHA64.test(candidate.evidence.beforeSha256)||
     !SHA64.test(candidate.evidence.afterSha256)||
     candidate.ownerApprovalGranted===true||candidate.executionAuthorized===true||
     candidate.healingPerformed===true||candidate.runnable===true||
     candidate.rawConfigIncluded===true||candidate.installedAbility===true)
   return Object.freeze({ok:false,code:'INVALID_OR_PRIVILEGED_CANDIDATE',healingPerformed:false});
  const existing=byId.get(candidate.lessonId);
  if(existing){
   if(existing.lessonFingerprint===candidate.lessonFingerprint){
    outcomes.push(Object.freeze({type:'DUPLICATE_IGNORED',lessonId:candidate.lessonId}));
    return Object.freeze({ok:true,code:'DUPLICATE_IGNORED',lessonId:candidate.lessonId,
     healingPerformed:false,overwrote:false});
   }
   outcomes.push(Object.freeze({
    type:'CONFLICT_PRESERVED_ORIGINAL',lessonId:candidate.lessonId,
    originalFingerprint:existing.lessonFingerprint,
    rejectedFingerprint:candidate.lessonFingerprint
   }));
   return Object.freeze({ok:false,code:'CONFLICT_PRESERVED_ORIGINAL',lessonId:candidate.lessonId,
    healingPerformed:false,overwrote:false,
    originalFingerprint:existing.lessonFingerprint});
  }
  const frozen=Object.freeze({
   lessonId:candidate.lessonId,
   lessonFingerprint:candidate.lessonFingerprint,
   issueType:candidate.issueType,
   route:candidate.route,
   beforeSha256:candidate.evidence.beforeSha256,
   afterSha256:candidate.evidence.afterSha256,
   browserEvidenceDigest:candidate.evidence.browserEvidenceDigest,
   offeredAbilityId:candidate.offeredAbility&&candidate.offeredAbility.id,
   provenanceVerified:candidate.provenanceVerified===true,
   admittedAt:Date.now()
  });
  byId.set(candidate.lessonId,frozen);
  outcomes.push(Object.freeze({type:'ADMITTED',lessonId:candidate.lessonId}));
  return Object.freeze({ok:true,code:'ADMITTED',lessonId:candidate.lessonId,
   healingPerformed:false,overwrote:false});
 }

 function recognizeNextjsRedirectFailure({source,route}={}){
  const proposal=proposeNextjsRedirectLoopRepair({source,route});
  if(proposal.status!=='PATCH_PROPOSAL_ONLY')
   return Object.freeze({
    status:'NO_MATCH',code:proposal.status,healingPerformed:false,
    executionAuthorized:false,offeredAbility:null
   });
  const matches=[...byId.values()].filter(l=>
   l.issueType==='nextjs_redirect_loop'&&
   l.beforeSha256===proposal.beforeSha256&&
   l.afterSha256===proposal.afterSha256);
  if(!matches.length){
   // Equivalent failure class: same changeType proposal against any admitted nextjs lesson
   const classMatches=[...byId.values()].filter(l=>l.issueType==='nextjs_redirect_loop');
   if(!classMatches.length)
    return Object.freeze({
     status:'NO_ADMITTED_LESSON',healingPerformed:false,executionAuthorized:false,
     offeredAbility:null,proposalStatus:'PATCH_PROPOSAL_ONLY',
     beforeSha256:proposal.beforeSha256,afterSha256:proposal.afterSha256
    });
   // Second disposable failure with equivalent repair shape: offer reviewed propose path.
   return Object.freeze({
    status:'EQUIVALENT_FAILURE_OFFERS_REVIEWED_PROPOSE',
    healingPerformed:false,executionAuthorized:false,ownerApprovalGranted:false,
    offeredAbility:Object.freeze({
     id:'nginx.nextjs_redirect.propose',
     registryStatus:'CONTRACT_ONLY_NOT_INSTALLED',
     runnable:false
    }),
    matchedLessonIds:Object.freeze(classMatches.map(l=>l.lessonId)),
    beforeSha256:proposal.beforeSha256,afterSha256:proposal.afterSha256,
    requires:Object.freeze([
     'exact_target_hash','authenticated_owner_review','v92_locked_cas','real_browser_host_verify'
    ]),
    note:'Recognition is not autonomous heal; owner review + CAS still required'
   });
  }
  return Object.freeze({
   status:'EXACT_LESSON_REPLAY_AVAILABLE',
   healingPerformed:false,executionAuthorized:false,ownerApprovalGranted:false,
   offeredAbility:Object.freeze({
    id:'nginx.nextjs_redirect.propose',
    registryStatus:'CONTRACT_ONLY_NOT_INSTALLED',
    runnable:false
   }),
   matchedLessonIds:Object.freeze(matches.map(l=>l.lessonId)),
   beforeSha256:proposal.beforeSha256,afterSha256:proposal.afterSha256,
   requires:Object.freeze([
    'exact_target_hash','authenticated_owner_review','v92_locked_cas','real_browser_host_verify'
   ])
  });
 }

 function requestMissingAbility(id){
  if(typeof id!=='string'||!/^[a-z][a-z0-9_.-]{2,95}$/.test(id))
   return Object.freeze({ok:false,code:'INVALID_ABILITY_ID',runnable:false,healingPerformed:false});
  const req=Object.freeze({
   ok:true,status:'NEW_ABILITY_REQUEST_NOT_IMPLEMENTED',
   requestedAbilityId:id,runnable:false,executionAuthorized:false,
   healingPerformed:false,ownerApprovalGranted:false,
   note:'Missing ability is a review request only; never self-grants privileges'
  });
  outcomes.push(Object.freeze({type:'MISSING_ABILITY_REQUESTED',id}));
  return req;
 }

 function snapshot(){
  return Object.freeze({
   lessons:Object.freeze([...byId.values()]),
   outcomes:Object.freeze(outcomes.slice())
  });
 }

 return Object.freeze({admit,recognizeNextjsRedirectFailure,requestMissingAbility,snapshot,
  compile:compileNextjsRedirectLessonEvidence});
}

module.exports={createLessonStore};
