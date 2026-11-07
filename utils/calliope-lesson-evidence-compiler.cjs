'use strict';
/**
 * Bounded Cursor→Calliope lesson admission compiler.
 * Validates exact before/after nginx bytes against the deterministic V91 Next.js
 * redirect proposal, binds provenance identifiers, and emits a non-executable
 * REVIEW_REQUIRED candidate. Never stores raw nginx config, never grants
 * approval/execution, never installs abilities.
 */
const crypto=require('node:crypto');
const {proposeNextjsRedirectLoopRepair}=require('./calliope-redirect-loop-proposal.cjs');

const REPO='leorami/Dev-Tunnel-Proxy';
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const ROUTE=/^[a-z][a-z0-9-]{0,47}$/;
const RELATIVE=/^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.md$/;
const ID=/^[a-z][a-z0-9_-]{2,95}$/;
const HEX=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');

function exact(o,keys){
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).length===keys.length&&
  keys.every(k=>Object.hasOwn(o,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function deny(code,extra={}){
 return Object.freeze({
  status:'REJECTED',code,ownerApprovalGranted:false,executionAuthorized:false,
  healingPerformed:false,learningProven:false,liveAttested:false,
  releaseGateSatisfied:false,runnable:false,rawConfigIncluded:false,...extra
 });
}

/**
 * githubAttestation is optional evidence from an independent GitHub commit read.
 * A bare 40-hex commit string alone never becomes provenanceVerified:true.
 */
function compileNextjsRedirectLessonEvidence(input){
 if(!exact(input,['lessonId','source','route','beforeConfig','afterConfig','browserEvidenceDigest'])&&
    !exact(input,['lessonId','source','route','beforeConfig','afterConfig','browserEvidenceDigest','githubAttestation']))
  return deny('INVALID_LESSON_INPUT');
 const {lessonId,source,route,beforeConfig,afterConfig,browserEvidenceDigest,githubAttestation}=input;
 if(typeof lessonId!=='string'||!ID.test(lessonId)||typeof route!=='string'||!ROUTE.test(route)||
    typeof beforeConfig!=='string'||typeof afterConfig!=='string'||
    !beforeConfig.length||!afterConfig.length||
    Buffer.byteLength(beforeConfig,'utf8')>256*1024||Buffer.byteLength(afterConfig,'utf8')>256*1024||
    /[\u0000\u000d]/.test(beforeConfig)||/[\u0000\u000d]/.test(afterConfig)||
    typeof browserEvidenceDigest!=='string'||!SHA64.test(browserEvidenceDigest)||
    !exact(source,['repository','commit','receipt'])||
    source.repository!==REPO||!SHA40.test(source.commit)||
    !RELATIVE.test(source.receipt)||source.receipt.split('/').includes('..'))
  return deny('INVALID_LESSON_FIELDS');

 // Reject privilege / approval injection via unexpected keys already covered by exact().
 if(githubAttestation!==undefined){
  if(!exact(githubAttestation,['fullSha','exists','repository'])||
     githubAttestation.repository!==REPO||githubAttestation.fullSha!==source.commit||
     githubAttestation.exists!==true)
   return deny('INVALID_GITHUB_ATTESTATION');
 }

 const proposal=proposeNextjsRedirectLoopRepair({source:beforeConfig,route});
 if(proposal.status!=='PATCH_PROPOSAL_ONLY')
  return deny('BEFORE_NOT_KNOWN_REDIRECT_LOOP',{proposalStatus:proposal.status});
 if(proposal.candidateConfig!==afterConfig||
    proposal.beforeSha256!==HEX(beforeConfig)||
    proposal.afterSha256!==HEX(afterConfig))
  return deny('AFTER_DOES_NOT_MATCH_DETERMINISTIC_PROPOSAL');

 // Idempotent good config must not compile as a new lesson from after→after.
 const replay=proposeNextjsRedirectLoopRepair({source:afterConfig,route});
 if(replay.status==='PATCH_PROPOSAL_ONLY')
  return deny('AFTER_STILL_PROPOSABLE');

 const provenanceVerified=githubAttestation!==undefined&&githubAttestation.exists===true&&
  githubAttestation.fullSha===source.commit;
 const core=JSON.stringify([lessonId,source.repository,source.commit,source.receipt,route,
  proposal.beforeSha256,proposal.afterSha256,browserEvidenceDigest,provenanceVerified]);
 return Object.freeze({
  status:'REVIEW_REQUIRED',
  lessonId,
  lessonFingerprint:HEX(core),
  issueType:'nextjs_redirect_loop',
  route,
  source:Object.freeze({repository:source.repository,commit:source.commit,receipt:source.receipt}),
  evidence:Object.freeze({
   beforeSha256:proposal.beforeSha256,
   afterSha256:proposal.afterSha256,
   browserEvidenceDigest,
   changeType:proposal.changeType
  }),
  provenanceStatus:provenanceVerified?'GITHUB_COMMIT_ATTESTED':'COMMIT_SHAPE_ONLY_UNVERIFIED',
  provenanceVerified,
  offeredAbility:Object.freeze({
   id:'nginx.nextjs_redirect.propose',
   registryStatus:'CONTRACT_ONLY_NOT_INSTALLED',
   runnable:false
  }),
  ownerApprovalGranted:false,executionAuthorized:false,healingPerformed:false,
  learningProven:false,liveAttested:false,releaseGateSatisfied:false,
  runnable:false,rawConfigIncluded:false,
  // Explicit: candidate is not an installed ability or production permission.
  installedAbility:false,productionChangeAuthorized:false
 });
}

module.exports={compileNextjsRedirectLessonEvidence};
