'use strict';
/**
 * V197: source-only verifier for a FUTURE owner-session issuer-signed,
 * request-nonce-bound, recipient-specific ARTIFACT DESCRIPTION grant.
 *
 * The real authenticated issuer, owner-consent ceremony, recipient pairing,
 * trustworthy loaded artifact/source and secure runtime have NOT been built.
 * A synthetic signature and a caller-provided callback DO NOT prove consent.
 *
 * This component cannot read files, create/issue grants, authorize exports,
 * open network endpoints, mutate host state, or speak Signal Protocol.
 * All authority flags stay FALSE, even when a candidate is admitted.
 */
const crypto=require('node:crypto');
const {createCalliopeAgentEnvelopeVerifier}=require('./calliope-agent-envelope.cjs');
const NO_AUTH=Object.freeze({
 ownerApprovalGranted:false,exportAuthorized:false,executionAuthorized:false,
 healingPerformed:false,liveAttested:false,productionChangeAuthorized:false
});
const DENY=Object.freeze({ok:false,status:'SIGNED_OWNER_GRANT_REJECTED',...NO_AUTH});
const DOMAIN='DEVPROXY-CALLIOPE-OWNER-DESCRIBE-GRANT-V1\n';
const AUDIENCE='devproxy.calliope.owner-describe-grant.v1';
const PURPOSE='artifact.describe';
const SIGNED=Object.freeze([
 'version','audience','issuer','ownerSessionSha256','sender',
 'senderSigningKeySha256','recipient','recipientSignalKeySha256',
 'project','purpose','artifactSha256','sourceCommit',
 'requestNonce','issuedAtMs','expiresAtMs'
]);
const ALL=Object.freeze([...SIGNED,'signature']);
const NAME=/^[a-z][a-z0-9-]{0,47}$/;
const SHA256=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const NONCE=/^[A-Za-z0-9_-]{43}$/;
const SIGNATURE=/^[A-Za-z0-9_-]{86}$/;

function exactFields(input,keys){
 try{
  if(input===null||typeof input!=='object'||Array.isArray(input)||
    Object.getPrototypeOf(input)!==Object.prototype||
    Reflect.ownKeys(input).length!==keys.length)return null;
  const data=Object.create(null);
  for(const field of keys){
   const descriptor=Object.getOwnPropertyDescriptor(input,field);
   if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   data[field]=descriptor.value;
  }
  return data;
 }catch{return null;}
}
function onlyPublicEd25519(value){
 if(value instanceof crypto.KeyObject){
  if(value.type!=='public'||value.asymmetricKeyType!=='ed25519')
   throw Error('INVALID_ISSUER_PUBLIC_KEY');
  return value;
 }
 let privateMaterial=false;
 try{crypto.createPrivateKey(value);privateMaterial=true;}catch{}
 if(privateMaterial)throw Error('INVALID_ISSUER_PUBLIC_KEY');
 let result;
 try{result=crypto.createPublicKey(value);}catch{
  throw Error('INVALID_ISSUER_PUBLIC_KEY');
 }
 if(result.type!=='public'||result.asymmetricKeyType!=='ed25519')
  throw Error('INVALID_ISSUER_PUBLIC_KEY');
 return result;
}
function ownerGrantSigningBytes(message){
 const fields=SIGNED.map(field=>{
  const descriptor=message&&Object.getOwnPropertyDescriptor(message,field);
  if(!descriptor||!Object.hasOwn(descriptor,'value'))
   throw Error('INVALID_OWNER_GRANT_MESSAGE');
  return descriptor.value;
 });
 return Buffer.from(DOMAIN+JSON.stringify(fields),'utf8');
}
function createCalliopeOwnerGrantVerifier({
 issuerPublicKey,senderPublicKey,ownerSessionSha256,
 recipientSignalKeySha256,project,sender,recipient,sourceCommit,
 artifactSha256,now=Date.now,isRevoked,isEnrollmentActive,replayLedger
}={}){
 const pinnedIssuer=onlyPublicEd25519(issuerPublicKey);
 const pinnedSender=onlyPublicEd25519(senderPublicKey);
 if(typeof now!=='function'||typeof isRevoked!=='function'||
    typeof isEnrollmentActive!=='function'||
    typeof ownerSessionSha256!=='string'||!SHA256.test(ownerSessionSha256)||
    typeof recipientSignalKeySha256!=='string'||!SHA256.test(recipientSignalKeySha256)||
    typeof sourceCommit!=='string'||!COMMIT.test(sourceCommit)||
    typeof artifactSha256!=='string'||!SHA256.test(artifactSha256)||
    typeof sender!=='string'||!NAME.test(sender)||
    typeof recipient!=='string'||!NAME.test(recipient)||
    typeof project!=='string'||!NAME.test(project)||
    sender===recipient)
   throw Error('INVALID_OWNER_GRANT_CONFIG');
 const senderSigningKeySha256=crypto.createHash('sha256').update(
   pinnedSender.export({format:'der',type:'spki'})).digest('hex');
 const issuerSigningKeySha256=crypto.createHash('sha256').update(
   pinnedIssuer.export({format:'der',type:'spki'})).digest('hex');
 if(issuerSigningKeySha256===senderSigningKeySha256)
  throw Error('ISSUER_SIGNER_KEY_SEPARATION');
 // The SAME V191 verifier enforces signed sender identity and the genuine
 // V196 file-backed nonce reservation. Strict durable mode is mandatory.
 const requests=createCalliopeAgentEnvelopeVerifier({
   identities:{[sender]:{publicKey:pinnedSender,projects:[project]}},
   now,replayLedger,requireDurableReplay:true
 });
 function verify(grantInput,requestInput){
  const grant=exactFields(grantInput,ALL);
  if(!grant)return DENY;
  const {
   version,audience,issuer,ownerSessionSha256:session,
   sender:grantSender,senderSigningKeySha256:signingHash,
   recipient:grantRecipient,recipientSignalKeySha256:signalHash,
   project:grantProject,purpose,artifactSha256:grantArtifactSha256,
   sourceCommit:grantSource,requestNonce,issuedAtMs,expiresAtMs,signature
  }=grant;
  if(version!==1||audience!==AUDIENCE||
     issuer!=='trajectory-owner-session'||purpose!==PURPOSE||
     grantSender!==sender||grantRecipient!==recipient||
     grantProject!==project||session!==ownerSessionSha256||
     signingHash!==senderSigningKeySha256||
     signalHash!==recipientSignalKeySha256||
     grantArtifactSha256!==artifactSha256||grantSource!==sourceCommit||
     typeof requestNonce!=='string'||!NONCE.test(requestNonce)||
     typeof signature!=='string'||!SIGNATURE.test(signature)||
     !Number.isSafeInteger(issuedAtMs)||!Number.isSafeInteger(expiresAtMs)||
     issuedAtMs<=0||expiresAtMs<=issuedAtMs||
     expiresAtMs-issuedAtMs>60000)return DENY;
  let at;
  try{at=now();}catch{return DENY;}
  if(!Number.isSafeInteger(at)||at<=0||issuedAtMs>at||
     issuedAtMs<at-60000||expiresAtMs<=at)return DENY;
  let raw;
  try{raw=Buffer.from(signature,'base64url');}catch{return DENY;}
  if(raw.length!==64||raw.toString('base64url')!==signature)return DENY;
  try{
   if(!crypto.verify(null,ownerGrantSigningBytes(grant),pinnedIssuer,raw))
    return DENY;
  }catch{return DENY;}
  // These callbacks must be wired only to the trusted owner-authenticated
  // issuer and enrolled device service in a later, separately approved task.
  // Unknown, asynchronous, unavailable or non-boolean answers FAIL CLOSED.
  try{
   if(isRevoked({issuer,ownerSessionSha256:session,requestNonce,
      recipient:grantRecipient,project:grantProject})!==false)return DENY;
   if(isEnrollmentActive({sender:grantSender,recipient:grantRecipient,
      senderSigningKeySha256:signingHash,
      recipientSignalKeySha256:signalHash,project:grantProject})!==true)
    return DENY;
  }catch{return DENY;}
  // Compare only the required signed request fields *before* using up the
  // durable nonce; V191 will independently validate the ENTIRE strict
  // request, signature, sender, project, timestamp, intent, audience.
  try{
   if(!requestInput||requestInput.sender!==sender||
     requestInput.project!==project||
     requestInput.purpose!==PURPOSE||
     requestInput.artifactSha256!==artifactSha256||
     requestInput.nonce!==requestNonce||
     !Number.isSafeInteger(requestInput.issuedAtMs)||
     !Number.isSafeInteger(requestInput.expiresAtMs)||
     requestInput.issuedAtMs>issuedAtMs||
     requestInput.expiresAtMs<expiresAtMs)return DENY;
  }catch{return DENY;}
  const verified=requests.verifyEnvelope(requestInput);
  if(!verified.ok)return DENY;
  // This asserts a signed issuer record matching one signed requester and
  // the pinned expected context. It DOES NOT prove actual human consent,
  // app enrollment, correct source bytes, owner approval or release.
  return Object.freeze({
   ok:true,status:'SIGNED_OWNER_GRANT_CANDIDATE_ONLY',sender,recipient,
   project,artifactSha256,sourceCommit,...NO_AUTH
  });
 }
 return Object.freeze({verify});
}
module.exports=Object.freeze({
 createCalliopeOwnerGrantVerifier,ownerGrantSigningBytes
});
