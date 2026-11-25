'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {messageSigningBytes}=require('../../utils/calliope-agent-envelope.cjs');
const {createCalliopeArtifactDescriptorGate}=require('../../utils/calliope-artifact-descriptor-gate.cjs');

const NOW=1800000000000;
const HASH='a'.repeat(64), OTHER='b'.repeat(64), SOURCE='c'.repeat(40);
const metadata=()=>({project:'demo-studio',artifactSha256:HASH,sourceCommit:SOURCE,
  mediaType:'image/png',byteLength:12800,capturedAtMs:NOW-1000});
const grant=()=>({sender:'trajectory',project:'demo-studio',purpose:'artifact.describe',
  artifactSha256:HASH,sourceCommit:SOURCE,issuedAtMs:NOW-1000,expiresAtMs:NOW+10000});
const flags=['ownerApprovalGranted','exportAuthorized','executionAuthorized',
  'healingPerformed','liveAttested','productionChangeAuthorized'];

function setup({artifacts=[metadata()],trustedGrants=[grant()],now=()=>NOW}={}) {
  const signer=crypto.generateKeyPairSync('ed25519'),outsider=crypto.generateKeyPairSync('ed25519');
  const gate=createCalliopeArtifactDescriptorGate({
    identities:{trajectory:{publicKey:signer.publicKey,projects:['demo-studio']}},
    artifacts,trustedGrants,now
  });
  function sign(overrides={},key=signer.privateKey) {
    const msg={version:1,audience:'devproxy.calliope.agent.v1',sender:'trajectory',
      project:'demo-studio',purpose:'artifact.describe',artifactSha256:HASH,
      issuedAtMs:NOW-500,expiresAtMs:NOW+20000,
      nonce:crypto.randomBytes(32).toString('base64url'),...overrides};
    return {...msg,signature:crypto.sign(null,messageSigningBytes(msg),key).toString('base64url')};
  }
  return {gate,sign,signer,outsider};
}
function assertNoAuthority(result) {
  for(const name of flags) assert.equal(result[name],false,name);
  for(const name of ['path','url','downloadUrl','bytes','content','ownerConsent',
    'grantId','accessToken','approvalId','absolutePath']) {
    assert.equal(Object.hasOwn(result,name),false,name);
  }
}

test('valid V191-signed metadata and independent server-owned grant produce only inert descriptor',()=>{
  const {gate,sign}=setup();
  const outcome=gate.describe(sign());
  assert.equal(outcome.ok,true);
  assert.equal(outcome.status,'DESCRIPTOR_CANDIDATE_ONLY');
  assert.equal(outcome.sender,'trajectory');
  assert.equal(outcome.project,'demo-studio');
  assert.equal(outcome.artifactSha256,HASH);
  assert.deepEqual(outcome.descriptor,{mediaType:'image/png',byteLength:12800,
    sourceCommit:SOURCE,capturedAtMs:NOW-1000});
  assert.equal(Object.isFrozen(outcome),true);
  assert.equal(Object.isFrozen(outcome.descriptor),true);
  assertNoAuthority(outcome);
});

test('valid signed metadata identity is insufficient without trusted grant AND source-locked manifest',()=>{
  const cases=[
    {artifacts:[],trustedGrants:[grant()]},
    {artifacts:[metadata()],trustedGrants:[]},
    {artifacts:[{...metadata(),sourceCommit:'d'.repeat(40)}],trustedGrants:[grant()]},
    {artifacts:[metadata()],trustedGrants:[{...grant(),sourceCommit:'d'.repeat(40)}]},
    {artifacts:[metadata()],trustedGrants:[{...grant(),sender:'intruder'}]},
    {artifacts:[metadata()],trustedGrants:[{...grant(),project:'other-project'}]},
    {artifacts:[metadata()],trustedGrants:[{...grant(),artifactSha256:OTHER}]},
    {artifacts:[metadata()],trustedGrants:[{...grant(),expiresAtMs:NOW}]},
    {artifacts:[metadata()],trustedGrants:[{...grant(),issuedAtMs:NOW+1000,expiresAtMs:NOW+2000}]}
  ];
  for(const item of cases){
    const {gate,sign}=setup(item);
    const outcome=gate.describe(sign());
    assert.equal(outcome.ok,false,JSON.stringify(item));
    assertNoAuthority(outcome);
  }
});

test('caller-supplied approval, path, URL, bytes and forged verified envelope fail closed',()=>{
  const {gate,sign}=setup();
  const valid=sign();
  for(const extra of [
    {ownerApproved:true},{ownerApprovalGranted:true},{verified:true},
    {path:'/Users/owner/.ssh/id_ed25519'},{url:'https://example.invalid/file'},
    {bytes:'private-data'},{grantId:'fake'},{purpose:'artifact.export'}
  ]){
    const outcome=gate.describe({...valid,...extra});
    assert.equal(outcome.ok,false,JSON.stringify(extra));
    assertNoAuthority(outcome);
  }
  assert.equal(gate.describe({ok:true,status:'SIGNED_METADATA_ONLY',sender:'trajectory',
    project:'demo-studio',purpose:'artifact.describe',artifactSha256:HASH}).ok,false);
});

test('wrong signer, changed signed digest, replay and expiration are denied',()=>{
  const {gate,sign,outsider}=setup();
  const actual=sign();
  for(const bad of [sign({},outsider.privateKey),{...actual,artifactSha256:OTHER},
    sign({expiresAtMs:NOW-10}),sign({sender:'other'})]) {
    const outcome=gate.describe(bad);
    assert.equal(outcome.ok,false);
    assertNoAuthority(outcome);
  }
  assert.equal(gate.describe(actual).ok,true);
  const duplicate=gate.describe(actual);
  assert.equal(duplicate.ok,false);
  assertNoAuthority(duplicate);
});

test('configuration with paths, private bytes, duplicate identities or ambiguous schema is rejected',()=>{
  const cases=[
    {artifacts:[{...metadata(),path:'/private'}],trustedGrants:[grant()]},
    {artifacts:[{...metadata(),content:'private'}],trustedGrants:[grant()]},
    {artifacts:[{...metadata(),downloadUrl:'https://x.invalid'}],trustedGrants:[grant()]},
    {artifacts:[{...metadata(),mediaType:'text/html'}],trustedGrants:[grant()]},
    {artifacts:[{...metadata(),byteLength:8*1024*1024}],trustedGrants:[grant()]},
    {artifacts:[metadata(),metadata()],trustedGrants:[grant()]},
    {artifacts:[metadata()],trustedGrants:[{...grant(),ownerApproved:true}]},
    {artifacts:[metadata()],trustedGrants:[grant(),grant()]},
    {artifacts:[Object.assign(Object.create({inherited:true}),metadata())],trustedGrants:[grant()]}
  ];
  for(const input of cases){
    assert.throws(()=>setup(input),/INVALID_|DUPLICATE_/);
  }
});

test('stable copied manifest and grant prevents upstream objects from mutating eligibility',()=>{
  const artifact=metadata(),trustedGrant=grant();
  const {gate,sign}=setup({artifacts:[artifact],trustedGrants:[trustedGrant]});
  artifact.sourceCommit='d'.repeat(40);
  trustedGrant.sender='intruder';
  const outcome=gate.describe(sign());
  assert.equal(outcome.ok,true);
  assert.equal(outcome.descriptor.sourceCommit,SOURCE);
  assertNoAuthority(outcome);
});

test('clock exceptions and stale/out-of-range timestamps do not become descriptor permission',()=>{
  const {gate,sign}=setup({now:()=>{throw Error('CLOCK_UNAVAILABLE')}});
  assert.equal(gate.describe(sign()).ok,false);
  const late=setup({now:()=>NOW+10001});
  assert.equal(late.gate.describe(late.sign({issuedAtMs:NOW+9000,expiresAtMs:NOW+25000})).ok,false);
});

test('code is purely observational and cannot import filesystem/network/host executors',()=>{
  const code=fs.readFileSync(require.resolve('../../utils/calliope-artifact-descriptor-gate.cjs'),'utf8');
  assert.doesNotMatch(code,/require\(['"](?:node:)?(?:fs|net|http|https|child_process|worker_threads|node:module)['"]\)/);
  assert.doesNotMatch(code,/process\.env|\.writeFile|\.readFile|\.unlink|execFile|spawn\s*\(/);
});
