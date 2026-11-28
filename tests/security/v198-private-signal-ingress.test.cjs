'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {createPrivateSignalCiphertextAdmission}=
  require('../../utils/calliope-private-signal-admission.cjs');

const NOW=1800000000000;
const SHA='a'.repeat(64);
const B64=Buffer.from(crypto.randomBytes(88)).toString('base64url');
const FLAGS=['ownerApprovalGranted','exportAuthorized','executionAuthorized',
 'healingPerformed','liveAttested','productionChangeAuthorized'];
function validPacket(){return {version:1,recipient:'calliope',messageId:'b'.repeat(64),
  signalMessageType:3,ciphertextBase64url:B64,createdAtMs:NOW-1000,expiresAtMs:NOW+9000};}
function principal(){return {sender:'trajectory',project:'demo-studio',
  recipient:'calliope',senderSignalKeySha256:SHA,recipientSignalKeySha256:'c'.repeat(64)};}
function factory(overrides={}){
 return createPrivateSignalCiphertextAdmission({
   now:()=>NOW,
   resolveAuthenticatedSender:()=>principal(),
   isRecipientEnrolled:()=>true,
   ...overrides
 });
}
function noAuthority(result){
  assert.equal(Object.isFrozen(result),true);
  for(const flag of FLAGS) assert.equal(result[flag],false,flag);
  for(const key of ['ownerConsent','key','privateKey','path','url','downloadUrl',
    'exportPath','hostCommand','approvalId','ownerSession','grantId','plaintext',
    'sourceFile','fileBytes','messageBody']){
    assert.equal(Object.hasOwn(result,key),false,key);
  }
}

test('RED: only exact authenticated recipient-bound opaque ciphertext may reach PRIVATE_DELIVERY_CANDIDATE_ONLY',()=>{
 const gate=factory();
 const got=gate.admit(validPacket(),{untrustedSessionHint:'ignored'});
 assert.equal(got.ok,true);
 assert.equal(got.status,'PRIVATE_DELIVERY_CANDIDATE_ONLY');
 assert.equal(got.sender,'trajectory');
 assert.equal(got.recipient,'calliope');
 assert.equal(got.project,'demo-studio');
 assert.equal(got.messageId,'b'.repeat(64));
 assert.equal(got.ciphertextBase64url,B64);
 assert.equal(got.byteLength,88);
 noAuthority(got);
});

test('RED: relay cannot be constructed without host authentication and enrollment verifiers',()=>{
 assert.throws(()=>createPrivateSignalCiphertextAdmission({
   now:()=>NOW,isRecipientEnrolled:()=>true
 }),/TRUSTED_RELAY_AUTHENTICATOR_REQUIRED/);
 assert.throws(()=>createPrivateSignalCiphertextAdmission({
   now:()=>NOW,resolveAuthenticatedSender:()=>principal()
 }),/TRUSTED_RELAY_AUTHENTICATOR_REQUIRED/);
 for(const options of [
  {resolveAuthenticatedSender:()=>({ok:true})},
  {resolveAuthenticatedSender:async()=>principal()},
  {isRecipientEnrolled:async()=>true}
 ]){
  const answer=factory(options).admit(validPacket(),{});
  assert.equal(answer.ok,false);
  noAuthority(answer);
 }
});

test('RED: authenticated sender must be server-attested, never inferred from client body or metadata',()=>{
 for(const extra of [
  {sender:'trajectory'},{project:'demo-studio'}, {ownerApproved:true},
  {authenticated:true},{issuer:'owner'},{recipientSignalKeySha256:SHA},
  {purpose:'artifact.export'}, {path:'/Users/owner/.ssh/id_ed25519'},
  {url:'https://example.invalid/secret'}, {plaintext:'private'}
 ]){
  const answer=factory().admit({...validPacket(),...extra},{});
  assert.equal(answer.ok,false,JSON.stringify(extra));
  noAuthority(answer);
 }
 const g=factory({resolveAuthenticatedSender:()=>null});
 const noAuth=g.admit(validPacket(),{});
 assert.equal(noAuth.ok,false);
 noAuthority(noAuth);
});

test('RED: unregistered, mismatched or unavailable recipient binding fails closed',()=>{
 const cases=[
  {resolveAuthenticatedSender:()=>({...principal(),recipient:'other'})},
  {resolveAuthenticatedSender:()=>({...principal(),senderSignalKeySha256:'bad'})},
  {resolveAuthenticatedSender:()=>({...principal(),recipientSignalKeySha256:'bad'})},
  {resolveAuthenticatedSender:()=>({...principal(),sender:'../private'})},
  {isRecipientEnrolled:()=>false},
  {isRecipientEnrolled:()=>{throw Error('REGISTRY_DOWN')}},
  {resolveAuthenticatedSender:()=>{throw Error('AUTH_DOWN')}},
  {isRecipientEnrolled:()=>Promise.resolve(true)}
 ];
 for(const opts of cases){
  const answer=factory(opts).admit(validPacket(),{});
  assert.equal(answer.ok,false,JSON.stringify(Object.keys(opts)));
  noAuthority(answer);
 }
});

test('RED: only canonical bounded actual Signal ciphertext binary is admitted',()=>{
 for(const extra of [
  {signalMessageType:1},{signalMessageType:4},
  {ciphertextBase64url:''}, {ciphertextBase64url:'plain text'},
  {ciphertextBase64url:'SGVsbG8='}, {ciphertextBase64url:'a'.repeat(65536)},
  {messageId:'abc'}, {recipient:'unknown'},
  {version:2},{createdAtMs:NOW+5},{expiresAtMs:NOW-1},
  {expiresAtMs:NOW+61000},{createdAtMs:0},{createdAtMs:NOW-60010}
 ]){
  const result=factory().admit({...validPacket(),...extra},{});
  assert.equal(result.ok,false,JSON.stringify(extra).slice(0,100));
  noAuthority(result);
 }
});

test('RED: accessor, prototype pollution, symbols, extra own keys and non-JSON shape rejected',()=>{
 const src=validPacket();
 const cases=[
  Object.assign(Object.create({ownerApproved:true}),src),
  Object.assign(Object.create(null),src),
  {...src,[Symbol('invisible')]:true},
  Object.defineProperty({...src},'recipient',{get(){throw Error('GETTER');}}),
  {...src,extra:undefined},
  [src],null
 ];
 for(const data of cases){
  const answer=factory().admit(data,{});
  assert.equal(answer.ok,false);
  noAuthority(answer);
 }
});

test('RED: access callback status must be exact boolean; no promises, truthy strings or anonymous fallback',()=>{
 for(const value of [undefined,null,0,1,'true',{},[],Promise.resolve(true)]){
  const answer=factory({isRecipientEnrolled:()=>value}).admit(validPacket(),{});
  assert.equal(answer.ok,false);
  noAuthority(answer);
 }
});

test('RED: this source-only data plane never reads files, starts processes, decrypts or claims active Signal sessions',()=>{
 const file=require.resolve('../../utils/calliope-private-signal-admission.cjs');
 const source=fs.readFileSync(file,'utf8');
 assert.doesNotMatch(source,/require\(['"](?:node:)?(?:fs|http|https|net|tls|child_process|worker_threads)['"]\)/);
 assert.doesNotMatch(source,/signalDecrypt|signalEncrypt|process\.env|execFile|\.readFile|\.writeFile|\.unlink|spawn\s*\(/);
 const a=factory().admit(validPacket(),{});
 assert.equal(a.ok,true);
 assert.equal(Object.hasOwn(a,'liveAttested'),true);
 assert.equal(a.liveAttested,false);
});
