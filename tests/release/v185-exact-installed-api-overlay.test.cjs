'use strict';
/**
 * V185 frozen integration contract on the real HISTORICAL on-host API blob.
 * No owner-host access or runtime execution; use Git objects and parse-only VM.
 * Initial source-only RED must be assertion failure against an inert stub.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const {buildCalliopeInstalledApiOverlay}=require('../../utils/rc2-v185-calliope-api-overlay.cjs');

const INSTALLED='7a22ec61531ac7b39c01370e41196775904c274f';
const MAIN_API='bafc60dc0224439e3d726f07e900afdbfce7cf60';
const CANDIDATE_API='79c87fdc83ae5da2bdc22d1670f9d03709aee80d';
const MAIN_COMMIT='590bcf2a980b434f533ddacac43a24a777a933e7';

function blobSha(s){
  const buf=Buffer.from(s,'utf8');
  return crypto.createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
}
function gitObject(args){
  return execFileSync('git',args,{encoding:'utf8',maxBuffer:2*1024*1024});
}
const input={
  installedSource:gitObject(['cat-file','blob',INSTALLED]),
  mainSource:gitObject(['show',MAIN_COMMIT+':utils/proxyConfigAPI.js']),
  reviewedSource:fs.readFileSync('utils/proxyConfigAPI.js','utf8')
};

function actual(){
  return buildCalliopeInstalledApiOverlay(input);
}
test('verified real installed, reviewed main and accepted V182 source all have pinned exact blob identities',()=>{
  assert.equal(blobSha(input.installedSource),INSTALLED);
  assert.equal(blobSha(input.mainSource),MAIN_API);
  assert.equal(blobSha(input.reviewedSource),CANDIDATE_API);
  assert.equal(input.installedSource.includes('createCalliopeAskRuntime'),false);
  assert.equal(input.mainSource.includes('createCalliopeAskRuntime'),false);
  assert.equal(input.reviewedSource.includes('createCalliopeAskRuntime'),true);
});
test('RED until V185: five exact source-only Calliope API insertions reconcile trusted INSTALLED preimage',()=>{
  const r=actual();
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.code,'SOURCE_ONLY_INSTALLED_API_OVERLAY');
  assert.deepEqual(r.insertedLineCounts,[1,5,1,16,6]);
  assert.equal(r.totalInsertions,29);
  assert.equal(typeof r.source,'string');
  assert.notEqual(blobSha(r.source),INSTALLED);
  assert.notEqual(blobSha(r.source),CANDIDATE_API);
  assert.doesNotThrow(()=>new vm.Script(r.source,{filename:'reconciled-proxyConfigAPI.js'}));
  assert.equal(r.source.includes('createCalliopeAskRuntime'),true);
});
test('RED until V185: original reports catalog and Create Route semantics remain byte-identical to installed runtime',()=>{
  const r=actual();
  assert.equal(r.ok,true);
  assert.equal(r.source.includes("require('./reports-list-catalog.cjs')"),false);
  assert.equal(r.source.includes("require('./create-route-install-intent.cjs')"),false);
  assert.equal(r.source.includes('const shouldInstall = options.install !== false;'),true);
  assert.equal(r.source.includes("const installDecision = decideCreateRouteInstall(body);"),false);
  assert.equal(r.source.includes("module.exports.__setRouteMutationServiceForTests"),false);
});
test('RED until V185: installation candidate inherits no source mutation, privilege or owner grant',()=>{
  const r=actual();
  assert.equal(r.ok,true);
  for(const key of ['productionChangeAuthorized','hostAttested','apiRestartAuthorized',
    'protectedMergeAuthorized','ownerUatAccepted','liveAttested','deployed'])assert.equal(r[key],false,key);
  assert.equal(r.source.includes('DEVPROXY_DENY_INLINE_DOCKER'),true);
  assert.equal(r.source.includes("calliopeAskRuntime().rememberAudit("),true);
  assert.equal(r.source.includes("calliopeAskRuntime().invalidate("),true);
});
test('RED until V185: arbitrary baseline drift, patched-once baseline and candidate mismatch fail closed',()=>{
  const r=actual();
  assert.equal(r.ok,true);
  assert.equal(buildCalliopeInstalledApiOverlay({...input,installedSource:input.installedSource+'\n'}).ok,false);
  assert.equal(buildCalliopeInstalledApiOverlay({...input,installedSource:r.source}).ok,false);
  assert.equal(buildCalliopeInstalledApiOverlay({...input,mainSource:input.mainSource.replace('admin/logout','admin/lockout')}).ok,false);
  assert.equal(buildCalliopeInstalledApiOverlay({...input,reviewedSource:input.reviewedSource+'\n'}).ok,false);
  assert.equal(buildCalliopeInstalledApiOverlay({...input,unrequestedOwnerGo:true}).ok,false);
  assert.equal(buildCalliopeInstalledApiOverlay({}).ok,false);
});
