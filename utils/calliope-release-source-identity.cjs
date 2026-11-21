'use strict';
/**
 * Pure review of caller-provided Git blob identities for the Calliope feature
 * slice. NEVER evidence of host ownership, process-loaded code, human approval,
 * rollback readiness, or a grant to stage/merge/restart. No I/O or side effects.
 */
const HEX=/^[0-9a-f]{40}$/;
const CHANGED=Object.freeze([
 'utils/proxyConfigAPI.js','status/status.html',
 'utils/calliope-grounded-local-turn.cjs',
 'utils/calliope-local-model-complete.cjs',
 'utils/calliope-owner-session-brain.cjs',
 'utils/calliope-owner-session-runtime.cjs',
 'utils/calliope-trusted-observation-cache.cjs'
]);
const COMPAT=Object.freeze([
 'utils/rc2-calliope-grounded-followup.cjs',
 'utils/rc2-local-calliope-evidence.cjs',
 'utils/rc2-local-calliope-observe-explain.cjs',
 'utils/rc2-inline-docker-policy.cjs',
 'utils/admin-session-security.cjs',
 'status/common.js','status/common.css','status/config.js',
 'status/vendor/marked.min.js','status/vendor/purify.min.js',
 'status/vendor/lucide.min.js',
 'status/assets/calliope_heart_stethoscope.svg','status/assets/logo.svg'
]);
const ROOT_KEYS=Object.freeze([
 'schema','repository','baselineMainSha','reviewedCandidateSha',
 'authority','scope','changedRuntimeFiles','requiredCompatibilityFiles'
]);
const AUTH_KEYS=Object.freeze([
 'protectedMerge','liveInstall','apiRestart','nginxReload','hostWorkerAction','ownerUatAccepted'
]);
function exactOwn(obj,keys){
 try{
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||
     Object.getPrototypeOf(obj)!==Object.prototype||
     Reflect.ownKeys(obj).length!==keys.length)return false;
  const own=Object.keys(obj);
  return keys.every(key=>own.includes(key)&&
    Object.hasOwn(Object.getOwnPropertyDescriptor(obj,key),'value'));
 }catch{return false;}
}
function validManifest(m){
 if(!exactOwn(m,ROOT_KEYS))return false;
 if(m.schema!=='devproxy.calliope.release-source-identity.v1'||
    m.repository!=='leorami/Dev-Tunnel-Proxy'||
    m.baselineMainSha!=='590bcf2a980b434f533ddacac43a24a777a933e7'||
    m.reviewedCandidateSha!=='95017398f6d1d64f4fc43b89e264641604e08fba'||
    typeof m.scope!=='string'||m.scope.length<20||m.scope.length>500||
    !exactOwn(m.authority,AUTH_KEYS)||
    AUTH_KEYS.some(key=>m.authority[key]!==false)||
    !Array.isArray(m.changedRuntimeFiles)||m.changedRuntimeFiles.length!==CHANGED.length||
    !Array.isArray(m.requiredCompatibilityFiles)||m.requiredCompatibilityFiles.length!==COMPAT.length)return false;
 for(let i=0;i<CHANGED.length;i++){
  const v=m.changedRuntimeFiles[i];
  if(!exactOwn(v,['path','mainGitBlobSha1','candidateGitBlobSha1'])||
     v.path!==CHANGED[i]||!HEX.test(v.candidateGitBlobSha1)||
     (i<2?!HEX.test(v.mainGitBlobSha1):v.mainGitBlobSha1!==null)||
     v.mainGitBlobSha1===v.candidateGitBlobSha1)return false;
 }
 for(let i=0;i<COMPAT.length;i++){
  const v=m.requiredCompatibilityFiles[i];
  if(!exactOwn(v,['path','candidateGitBlobSha1'])||v.path!==COMPAT[i]||
     !HEX.test(v.candidateGitBlobSha1))return false;
 }
 return true;
}
function out(status){
 return Object.freeze({
  status,
  hostAttested:false,
  loadedProcessAttested:false,
  liveInstallAuthorized:false,
  productionChangeAuthorized:false,
  apiRestartAuthorized:false,
  protectedMergeAuthorized:false,
  ownerUatAccepted:false,
 });
}
function assessCalliopeReleaseSourceIdentity(input){
 if(!exactOwn(input,['manifest','observed']))return out('INVALID_SOURCE_IDENTITY_INPUT');
 const {manifest,observed}=input;
 if(!validManifest(manifest))return out('INVALID_SOURCE_IDENTITY_MANIFEST');
 const paths=[...CHANGED,...COMPAT];
 if(!exactOwn(observed,paths)||paths.some(path=>
    observed[path]!==null&&!HEX.test(observed[path])))
  return out('INVALID_SOURCE_IDENTITY_INPUT');
 for(const item of manifest.requiredCompatibilityFiles){
  if(observed[item.path]!==item.candidateGitBlobSha1)
   return out('DEPENDENCY_PARITY_BLOCKED');
 }
 let baseline=0,candidate=0;
 for(const item of manifest.changedRuntimeFiles){
  const value=observed[item.path];
  if(value===item.candidateGitBlobSha1)candidate++;
  else if(value===item.mainGitBlobSha1)baseline++;
  else return out('UNRECONCILED_PREIMAGE_BLOCKED');
 }
 if(baseline>0&&candidate>0)return out('PARTIAL_SOURCE_INSTALL_BLOCKED');
 if(baseline===CHANGED.length)return out('STAGING_PREDICATES_MATCH_BASELINE_ONLY');
 if(candidate===CHANGED.length)return out('SOURCE_CANDIDATE_MATCHED_INPUT_NOT_HOST_ATTESTED');
 return out('UNRECONCILED_PREIMAGE_BLOCKED');
}
module.exports=Object.freeze({assessCalliopeReleaseSourceIdentity});
