'use strict';
/**
 * V184 CTO source-only release identity contract. No owner Mac, credentials,
 * Docker, network, file staging or protected branch mutations.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const manifest=require('../../docs/release/DEVPROXY_V184_CALLIOPE_SOURCE_IDENTITY.json');
const {assessCalliopeReleaseSourceIdentity}=require('../../utils/calliope-release-source-identity.cjs');

const CHANGED=[
  'utils/proxyConfigAPI.js',
  'status/status.html',
  'utils/calliope-grounded-local-turn.cjs',
  'utils/calliope-local-model-complete.cjs',
  'utils/calliope-owner-session-brain.cjs',
  'utils/calliope-owner-session-runtime.cjs',
  'utils/calliope-trusted-observation-cache.cjs',
];
const COMPAT=[
  'utils/rc2-calliope-grounded-followup.cjs',
  'utils/rc2-local-calliope-evidence.cjs',
  'utils/rc2-local-calliope-observe-explain.cjs',
  'utils/rc2-inline-docker-policy.cjs',
  'utils/admin-session-security.cjs',
  'status/common.js',
  'status/common.css',
  'status/config.js',
  'status/vendor/marked.min.js',
  'status/vendor/purify.min.js',
  'status/vendor/lucide.min.js',
  'status/assets/calliope_heart_stethoscope.svg',
  'status/assets/logo.svg',
];
function baseline(){
  const result={};
  for(const item of manifest.changedRuntimeFiles)result[item.path]=item.mainGitBlobSha1;
  for(const item of manifest.requiredCompatibilityFiles)result[item.path]=item.candidateGitBlobSha1;
  return result;
}
function candidate(){
  const result=baseline();
  for(const item of manifest.changedRuntimeFiles)result[item.path]=item.candidateGitBlobSha1;
  return result;
}
function assess(observed,m=manifest){
  return assessCalliopeReleaseSourceIdentity({manifest:m,observed});
}
function neverAuthorizes(r){
  for(const k of ['liveInstallAuthorized','productionChangeAuthorized','apiRestartAuthorized',
    'protectedMergeAuthorized','loadedProcessAttested','ownerUatAccepted']) assert.equal(r[k],false,k);
}
test('frozen reviewed source identity closure is exact and excludes secrets/host paths',()=>{
  assert.equal(manifest.schema,'devproxy.calliope.release-source-identity.v1');
  assert.equal(manifest.repository,'leorami/Dev-Tunnel-Proxy');
  assert.equal(manifest.baselineMainSha,'590bcf2a980b434f533ddacac43a24a777a933e7');
  assert.equal(manifest.reviewedCandidateSha,'95017398f6d1d64f4fc43b89e264641604e08fba');
  assert.deepEqual(manifest.changedRuntimeFiles.map(x=>x.path),CHANGED);
  assert.deepEqual(manifest.requiredCompatibilityFiles.map(x=>x.path),COMPAT);
  assert.equal(manifest.changedRuntimeFiles.length,7);
  assert.equal(manifest.requiredCompatibilityFiles.length,13);
  assert.equal(manifest.changedRuntimeFiles.filter(x=>x.mainGitBlobSha1===null).length,5);
  const str=JSON.stringify(manifest);
  assert.doesNotMatch(str,/docker\.sock|\.env|SECRET|PASSWORD|NGROK_|ownerEnvFile/i);
});
test('old supported exact baseline plus absent five new modules is a safe PREDICATE only, not GO',()=>{
  const a=assess(baseline());
  assert.equal(a.status,'STAGING_PREDICATES_MATCH_BASELINE_ONLY');
  neverAuthorizes(a);
  assert.equal(a.hostAttested,false);
});
test('candidate identical bytes still cannot attest loaded process, owner UAT or permit restart',()=>{
  const a=assess(candidate());
  assert.equal(a.status,'SOURCE_CANDIDATE_MATCHED_INPUT_NOT_HOST_ATTESTED');
  neverAuthorizes(a);
  assert.equal(a.hostAttested,false);
});
test('partial installation never greenlights further copying or restart',()=>{
  const partial=baseline();
  partial['utils/calliope-owner-session-runtime.cjs']=manifest.changedRuntimeFiles[5].candidateGitBlobSha1;
  const a=assess(partial);
  assert.equal(a.status,'PARTIAL_SOURCE_INSTALL_BLOCKED');
  neverAuthorizes(a);
});
test('dirty unsupported installed preimage halts instead of overwriting owner work',()=>{
  const dirty=baseline();
  dirty['utils/proxyConfigAPI.js']='f'.repeat(40);
  const a=assess(dirty);
  assert.equal(a.status,'UNRECONCILED_PREIMAGE_BLOCKED');
  neverAuthorizes(a);
});
test('unexpected dependency identities and missing compatibility block release',()=>{
  const mismatched=baseline();
  mismatched['utils/admin-session-security.cjs']='f'.repeat(40);
  const a=assess(mismatched);
  assert.equal(a.status,'DEPENDENCY_PARITY_BLOCKED');
  neverAuthorizes(a);
  const absent=baseline();
  absent['status/vendor/marked.min.js']=null;
  assert.equal(assess(absent).status,'DEPENDENCY_PARITY_BLOCKED');
});
test('forged authority input or extra path is rejected; caller claims are never host proof',()=>{
  const poisoned={...baseline(),'/private/owner/.env':'f'.repeat(40)};
  assert.equal(assess(poisoned).status,'INVALID_SOURCE_IDENTITY_INPUT');
  const key=baseline();
  const response=assessCalliopeReleaseSourceIdentity({manifest,observed:key,ownerApproved:true});
  assert.equal(response.status,'INVALID_SOURCE_IDENTITY_INPUT');
  neverAuthorizes(response);
});
test('manifest tampering with missing file, duplicate or authority flags rejects release',()=>{
  const short={...manifest,changedRuntimeFiles:manifest.changedRuntimeFiles.slice(1)};
  assert.equal(assess(baseline(),short).status,'INVALID_SOURCE_IDENTITY_MANIFEST');
  const dupe={...manifest,changedRuntimeFiles:[...manifest.changedRuntimeFiles,manifest.changedRuntimeFiles[0]]};
  assert.equal(assess(baseline(),dupe).status,'INVALID_SOURCE_IDENTITY_MANIFEST');
  const flag={...manifest,authority:{...manifest.authority,liveInstall:true}};
  assert.equal(assess(baseline(),flag).status,'INVALID_SOURCE_IDENTITY_MANIFEST');
});
