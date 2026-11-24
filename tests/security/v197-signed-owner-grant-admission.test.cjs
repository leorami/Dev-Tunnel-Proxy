'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {
  createCalliopeOwnerGrantVerifier,ownerGrantSigningBytes
}=require('../../utils/calliope-owner-describe-grant.cjs');
const {messageSigningBytes}=require('../../utils/calliope-agent-envelope.cjs');
const {createDurableCalliopeReplayLedger}=require('../../utils/calliope-durable-replay-ledger.cjs');

const NOW=1800000000000;
const SHA='a'.repeat(64),SOURCE='b'.repeat(40),SESSION='c'.repeat(64);
const RECIPIENT_SIGNAL='d'.repeat(64);
const FLAGS=['ownerApprovalGranted','exportAuthorized','executionAuthorized',
 'healingPerformed','liveAttested','productionChangeAuthorized'];

const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
const getNonce=()=>crypto.randomBytes(32).toString('base64url');
const mkDir=()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v197-source-only-')));
  const dir=path.join(root,'ledger');
  fs.mkdirSync(dir,{mode:0o700});
  return {root,dir,clean:()=>fs.rmSync(root,{recursive:true,force:true})};
};

function fixture({revoked=()=>false,active=()=>true,now=()=>NOW}={}){
 const dir=mkDir();
 const issuer=crypto.generateKeyPairSync('ed25519');
 const outsider=crypto.generateKeyPairSync('ed25519');
 const sender=crypto.generateKeyPairSync('ed25519');
 const signingHash=sha256(sender.publicKey.export({format:'der',type:'spki'}));
 const grantNonce=getNonce();
 const request={
   version:1,audience:'devproxy.calliope.agent.v1',sender:'trajectory',
   project:'demo-studio',purpose:'artifact.describe',artifactSha256:SHA,
   issuedAtMs:NOW-500,expiresAtMs:NOW+15000,nonce:grantNonce
 };
 const signRequest=(data=request,key=sender.privateKey)=>({
   ...data,signature:crypto.sign(null,messageSigningBytes(data),key).toString('base64url')
 });
 const grant={
   version:1,audience:'devproxy.calliope.owner-describe-grant.v1',
   issuer:'trajectory-owner-session',ownerSessionSha256:SESSION,
   sender:'trajectory',senderSigningKeySha256:signingHash,
   recipient:'calliope',recipientSignalKeySha256:RECIPIENT_SIGNAL,
   project:'demo-studio',purpose:'artifact.describe',
   artifactSha256:SHA,sourceCommit:SOURCE,requestNonce:grantNonce,
   issuedAtMs:NOW-1000,expiresAtMs:NOW+10000
 };
 const signGrant=(data=grant,key=issuer.privateKey)=>({
   ...data,signature:crypto.sign(null,ownerGrantSigningBytes(data),key).toString('base64url')
 });
 const config={
   issuerPublicKey:issuer.publicKey,
   senderPublicKey:sender.publicKey,
   ownerSessionSha256:SESSION,
   recipientSignalKeySha256:RECIPIENT_SIGNAL,
   project:'demo-studio',sender:'trajectory',recipient:'calliope',
   sourceCommit:SOURCE,artifactSha256:SHA,now,
   isRevoked:revoked,isEnrollmentActive:active,
   replayLedger:createDurableCalliopeReplayLedger({directory:dir.dir,maxEntries:16})
 };
 const verifier=createCalliopeOwnerGrantVerifier(config);
 return {issuer,outsider,sender,grant,request,signGrant,signRequest,verifier,config,dir,
  cleanup:()=>dir.clean()};
}
function noAuthority(result){
 for(const flag of FLAGS)assert.equal(result[flag],false,flag);
 for(const field of ['path','url','downloadUrl','bytes','content','privateKey','grantId',
   'ownerConsent','approvalId','ownerSessionSha256','recipientSignalKeySha256']){
   assert.equal(Object.hasOwn(result,field),false,field);
 }
 assert.equal(Object.isFrozen(result),true);
}

test('RED: real issuer signature + actual agent signature + pinned pairing + durable nonce produce inert candidate only',()=>{
 const f=fixture();
 try{
   const result=f.verifier.verify(f.signGrant(),f.signRequest());
   assert.equal(result.ok,true);
   assert.equal(result.status,'SIGNED_OWNER_GRANT_CANDIDATE_ONLY');
   assert.equal(result.sender,'trajectory');
   assert.equal(result.recipient,'calliope');
   assert.equal(result.project,'demo-studio');
   assert.equal(result.artifactSha256,SHA);
   assert.equal(result.sourceCommit,SOURCE);
   noAuthority(result);
   const duplicate=f.verifier.verify(f.signGrant(),f.signRequest());
   assert.equal(duplicate.ok,false,'exact signed-message nonce may not be admitted twice');
   noAuthority(duplicate);
 }finally{f.cleanup()}
});

test('RED: a replay after process reconstruction is rejected by real V196 disk reservation',()=>{
 const f=fixture();
 try{
   const g=f.signGrant(),req=f.signRequest();
   assert.equal(f.verifier.verify(g,req).ok,true);
   const fresh=createCalliopeOwnerGrantVerifier(f.config);
   assert.equal(fresh.verify(g,req).ok,false);
 }finally{f.cleanup()}
});

test('RED: untrusted issuer, private issuer key, wrong signing identity and omitted durable store are denied',()=>{
 const f=fixture();
 try{
   const bad=f.signGrant(f.grant,f.outsider.privateKey);
   assert.equal(f.verifier.verify(bad,f.signRequest()).ok,false);
   assert.equal(f.verifier.verify(f.signGrant(),f.signRequest(f.request,f.outsider.privateKey)).ok,false);
   assert.throws(()=>createCalliopeOwnerGrantVerifier({...f.config,issuerPublicKey:f.issuer.privateKey}),/PUBLIC_KEY|ED25519/);
   assert.throws(()=>createCalliopeOwnerGrantVerifier({...f.config,replayLedger:undefined}),/DURABLE_REPLAY_REQUIRED/);
   assert.throws(()=>createCalliopeOwnerGrantVerifier({...f.config,replayLedger:{reserve:()=>true}}),/DURABLE_REPLAY_REQUIRED/);
 }finally{f.cleanup()}
});

test('RED: signed owner record cannot be retargeted to another sender, recipient, Signal key, session or artifact',()=>{
 const changes=[
  {sender:'another-agent'},{recipient:'stranger'}, {recipientSignalKeySha256:'e'.repeat(64)},
  {senderSigningKeySha256:'e'.repeat(64)},{ownerSessionSha256:'e'.repeat(64)},
  {project:'other-project'},{artifactSha256:'f'.repeat(64)},
  {sourceCommit:'d'.repeat(40)},{requestNonce:getNonce()},
  {purpose:'artifact.export'},{issuer:'other-issuer'}
 ];
 for(const changed of changes){
   const f=fixture();
   try{
     const result=f.verifier.verify(f.signGrant({...f.grant,...changed}),f.signRequest());
     assert.equal(result.ok,false,JSON.stringify(changed));
     noAuthority(result);
   }finally{f.cleanup()}
 }
});

test('RED: changed grant shape, forged ownerApproved, export, path and unknown fields fail closed',()=>{
 const extra=[
  {ownerApproved:true},{ownerApprovalGranted:true},{exportAuthorized:true},
  {path:'/private/owner'},{url:'https://example.invalid/private'},
  {bytes:'SECRET'}, {grantId:'forged'}, {sessionToken:'forged'}
 ];
 for(const additional of extra){
  const f=fixture();
  try{
   const grant=f.signGrant();
   const result=f.verifier.verify({...grant,...additional},f.signRequest());
   assert.equal(result.ok,false);
   noAuthority(result);
  }finally{f.cleanup()}
 }
 const f=fixture();
 try{
   assert.equal(f.verifier.verify(Object.assign(Object.create({unsafe:true}),f.signGrant()),f.signRequest()).ok,false);
 }finally{f.cleanup()}
});

test('RED: expiry, future issuance, extended grant and altered signature cannot mint candidate',()=>{
 for(const changed of [
  {expiresAtMs:NOW},{issuedAtMs:NOW+1,expiresAtMs:NOW+4000},
  {issuedAtMs:NOW-61000,expiresAtMs:NOW+10000},
  {expiresAtMs:NOW+61000},{version:2},{audience:'other.issuer'}
 ]){
  const f=fixture();
  try{
   assert.equal(f.verifier.verify(f.signGrant({...f.grant,...changed}),f.signRequest()).ok,false,JSON.stringify(changed));
  }finally{f.cleanup()}
 }
 const f=fixture();
 try{
  const authentic=f.signGrant();
  assert.equal(f.verifier.verify({...authentic,artifactSha256:'f'.repeat(64)},f.signRequest()).ok,false);
 }finally{f.cleanup()}
});

test('RED: revoked session, revoked grant, unknown enrollment and callback failure deny rather than degrade',()=>{
 const cases=[
  {revoked:()=>true},
  {active:()=>false},
  {revoked:()=>{throw Error('REVOKE_SERVICE_DOWN')}},
  {active:()=>{throw Error('PAIRING_SERVICE_DOWN')}},
  {revoked:()=>Promise.resolve(false)},
  {active:()=>Promise.resolve(true)}
 ];
 for(const options of cases){
   const f=fixture(options);
   try{
    const result=f.verifier.verify(f.signGrant(),f.signRequest());
    assert.equal(result.ok,false);
    noAuthority(result);
   }finally{f.cleanup()}
 }
});

test('RED: synthetically signed grant without authenticated V191 request is never admitted',()=>{
 const f=fixture();
 try{
  for(const request of [
   {ok:true,project:'demo-studio',sender:'trajectory'},
   {...f.signRequest(),ownerApproved:true},
   {...f.signRequest(),purpose:'heal.execute'},
   {...f.signRequest(),artifactSha256:'f'.repeat(64)},
   {...f.signRequest(),nonce:getNonce()}
  ]){
   const result=f.verifier.verify(f.signGrant(),request);
   assert.equal(result.ok,false);
   noAuthority(result);
  }
 }finally{f.cleanup()}
});

test('RED: issuer attestation only cannot inspect owner files or elevate app authority',()=>{
 const f=fixture();
 try{
  const source=fs.readFileSync(require.resolve('../../utils/calliope-owner-describe-grant.cjs'),'utf8');
  assert.doesNotMatch(source,/require\(['"](?:node:)?(?:fs|net|https?|child_process|worker_threads)['"]\)/);
  assert.doesNotMatch(source,/process\.env|\.readFile|\.writeFile|\bspawn\s*\(|\bexecSync\s*\(/);
  const result=f.verifier.verify(f.signGrant(),f.signRequest());
  noAuthority(result);
 }finally{f.cleanup()}
});
