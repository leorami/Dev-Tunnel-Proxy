'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createCalliopeAgentEnvelopeVerifier,messageSigningBytes}=
 require('../../utils/calliope-agent-envelope.cjs');

const AT=1800000000000;
const HASH='a'.repeat(64);
function setup({maxSeen=128}={}){
 const keys=crypto.generateKeyPairSync('ed25519');
 const other=crypto.generateKeyPairSync('ed25519');
 const verifier=createCalliopeAgentEnvelopeVerifier({
  identities:{trajectory:{publicKey:keys.publicKey,projects:['demo-studio','aperture']}},
  now:()=>AT,maxSeen
 });
 function sign(overrides={},key=keys.privateKey){
  const msg={version:1,audience:'devproxy.calliope.agent.v1',
   sender:'trajectory',project:'demo-studio',purpose:'artifact.describe',
   artifactSha256:HASH,issuedAtMs:AT-500,expiresAtMs:AT+20000,
   nonce:crypto.randomBytes(32).toString('base64url'),...overrides};
  return {...msg,signature:crypto.sign(null,messageSigningBytes(msg),key).toString('base64url')};
 }
 return {verifier,keys,other,sign};
}
test('valid signed metadata proves identity without file/export/host execution authority',()=>{
 const {verifier,sign}=setup();
 const result=verifier.verifyEnvelope(sign());
 assert.equal(result.ok,true);
 assert.equal(result.status,'SIGNED_METADATA_ONLY');
 for(const flag of ['ownerApprovalGranted','exportAuthorized','executionAuthorized',
   'healingPerformed','liveAttested','productionChangeAuthorized'])
   assert.equal(result[flag],false,flag);
 assert.equal(result.artifactSha256,HASH);
 assert.equal(Object.hasOwn(result,'path'),false);
 assert.equal(Object.hasOwn(result,'bytes'),false);
});
test('replay and unique-nonce capacity fail closed until expiry',()=>{
 const {verifier,sign}=setup({maxSeen:1});
 const first=sign(),second=sign();
 assert.equal(verifier.verifyEnvelope(first).ok,true);
 assert.equal(verifier.verifyEnvelope(first).ok,false);
 assert.equal(verifier.verifyEnvelope(second).ok,false);
});
test('signature tampering, unknown sender, unauthorized project and wrong signing key denied',()=>{
 const {verifier,sign,other}=setup();
 const signed=sign();
 for(const tampered of [
  {...signed,project:'aperture'},
  {...signed,artifactSha256:'b'.repeat(64)},
  {...signed,sender:'not-registered'},
  sign({project:'unknown-project'}),
  sign({},other.privateKey),
  {...signed,signature:'A'.repeat(86)}
 ]) assert.equal(verifier.verifyEnvelope(tampered).ok,false);
});
test('domain, intent, time bounds and strict shape reject unsafe or ambiguous requests',()=>{
 const {verifier,sign}=setup();
 const base=sign();
 for(const input of [
  {...base,purpose:'artifact.export'},
  {...base,purpose:'heal.execute'},
  {...base,audience:'any-other-audience'},
  {...base,version:2},
  {...base,issuedAtMs:AT+20000,expiresAtMs:AT+30000},
  {...base,issuedAtMs:AT-61000,expiresAtMs:AT-1000},
  {...base,expiresAtMs:AT+70000},
  {...base,path:'/Users/owner/.ssh/id_ed25519'},
  {...base,ownerApproved:true},
  Object.assign(Object.create({inherited:true}),base),
  {...base,nonce:'not-base64url'},
  {...base,signature:'not-signature'}
 ]) assert.equal(verifier.verifyEnvelope(input).ok,false);
});
test('invalid identities and non-Ed25519 keys rejected before accepting messages',()=>{
 const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 assert.throws(()=>createCalliopeAgentEnvelopeVerifier({
  identities:{trajectory:{publicKey:rsa.publicKey,projects:['demo-studio']}}}),/ONLY_ED25519/);
 assert.throws(()=>createCalliopeAgentEnvelopeVerifier({
  identities:{trajectory:{publicKey:'invalid',projects:['demo-studio']}}}),/INVALID_AGENT_PUBLIC_KEY/);
 assert.throws(()=>createCalliopeAgentEnvelopeVerifier({identities:{}}),/INVALID_AGENT_IDENTITY/);
});
test('all sender verification outcomes keep denial response authority flags false',()=>{
 const {verifier,sign}=setup();
 const result=verifier.verifyEnvelope({...sign(),purpose:'artifact.export'});
 assert.equal(result.ok,false);
 for(const flag of ['ownerApprovalGranted','exportAuthorized','executionAuthorized',
   'healingPerformed','liveAttested','productionChangeAuthorized'])
   assert.equal(result[flag],false);
});
