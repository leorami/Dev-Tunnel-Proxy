'use strict';
/**
 * V198 product-facing ciphertext ingress *admission boundary*, not a live
 * relay, Signal client, permission issuer, message store, or file exporter.
 * The real receiving service MUST supply a trusted server-owned identity
 * resolver and recipient enrollment registry. Neither caller-supplied JSON
 * nor an encrypted message can assert that a human approved disclosure.
 */
const DENY=Object.freeze({ok:false,status:'PRIVATE_SIGNAL_INGRESS_DENIED',
 ownerApprovalGranted:false,exportAuthorized:false,executionAuthorized:false,
 healingPerformed:false,liveAttested:false,productionChangeAuthorized:false});
const FLAGS=Object.freeze({ownerApprovalGranted:false,exportAuthorized:false,
 executionAuthorized:false,healingPerformed:false,liveAttested:false,
 productionChangeAuthorized:false});
const FIELDS=Object.freeze(['version','recipient','messageId','signalMessageType',
 'ciphertextBase64url','createdAtMs','expiresAtMs']);
const PRINCIPAL=Object.freeze(['sender','project','recipient',
 'senderSignalKeySha256','recipientSignalKeySha256']);
const NAME=/^[a-z][a-z0-9-]{0,47}$/;
const SHA=/^[a-f0-9]{64}$/;
const B64=/^[A-Za-z0-9_-]+$/;
function exact(input,fields){
 try{
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.getPrototypeOf(input)!==Object.prototype||
     Reflect.ownKeys(input).length!==fields.length)return null;
  const out=Object.create(null);
  for(const name of fields){
   const d=Object.getOwnPropertyDescriptor(input,name);
   if(!d||!Object.hasOwn(d,'value'))return null;
   out[name]=d.value;
  }
  return out;
 }catch{return null;}
}
function createPrivateSignalCiphertextAdmission({
 now=Date.now,resolveAuthenticatedSender,isRecipientEnrolled,
 maxCiphertextBytes=32768
}={}){
 if(typeof now!=='function'||
    typeof resolveAuthenticatedSender!=='function'||
    typeof isRecipientEnrolled!=='function'||
    !Number.isSafeInteger(maxCiphertextBytes)||
    maxCiphertextBytes<256||maxCiphertextBytes>65536)
   throw Error('TRUSTED_RELAY_AUTHENTICATOR_REQUIRED');
 function admit(input,sessionProof){
  const p=exact(input,FIELDS);
  if(!p||p.version!==1||typeof p.recipient!=='string'||
     !NAME.test(p.recipient)||typeof p.messageId!=='string'||
     !SHA.test(p.messageId)||![2,3].includes(p.signalMessageType)||
     typeof p.ciphertextBase64url!=='string'||
     p.ciphertextBase64url.length<43||
     p.ciphertextBase64url.length>Math.ceil(maxCiphertextBytes*4/3)+4||
     !B64.test(p.ciphertextBase64url)||
     !Number.isSafeInteger(p.createdAtMs)||
     !Number.isSafeInteger(p.expiresAtMs))return DENY;
  let at;
  try{at=now();}catch{return DENY;}
  if(!Number.isSafeInteger(at)||at<=0||
     p.createdAtMs<=0||p.createdAtMs>at||
     p.createdAtMs<=at-60000||
     p.expiresAtMs<=at||p.expiresAtMs<=p.createdAtMs||
     p.expiresAtMs>at+60000||p.expiresAtMs-p.createdAtMs>60000)return DENY;
  let bytes;
  try{bytes=Buffer.from(p.ciphertextBase64url,'base64url');}catch{return DENY;}
  if(bytes.length<32||bytes.length>maxCiphertextBytes||
     bytes.toString('base64url')!==p.ciphertextBase64url)return DENY;
  // Only trusted host code must provide this resolver. An untrusted callback
  // that always returns an enrolled identity cannot establish authentication.
  let principal;
  try{principal=exact(resolveAuthenticatedSender(sessionProof),PRINCIPAL);}
  catch{return DENY;}
  if(!principal||
     typeof principal.sender!=='string'||!NAME.test(principal.sender)||
     typeof principal.project!=='string'||!NAME.test(principal.project)||
     typeof principal.recipient!=='string'||!NAME.test(principal.recipient)||
     principal.sender===principal.recipient||
     principal.recipient!==p.recipient||
     typeof principal.senderSignalKeySha256!=='string'||
     !SHA.test(principal.senderSignalKeySha256)||
     typeof principal.recipientSignalKeySha256!=='string'||
     !SHA.test(principal.recipientSignalKeySha256))return DENY;
  try{
   if(isRecipientEnrolled(Object.freeze({...principal}))!==true)return DENY;
  }catch{return DENY;}
  // This response permits a future trusted recipient-scoped queue to
  // consider the opaque bytes. It never claims successful cryptographic
  // verification, routing, delivery, owner consent, or app execution.
  return Object.freeze({
   ok:true,status:'PRIVATE_DELIVERY_CANDIDATE_ONLY',
   sender:principal.sender,recipient:principal.recipient,
   project:principal.project,messageId:p.messageId,
   signalMessageType:p.signalMessageType,
   ciphertextBase64url:p.ciphertextBase64url,
   byteLength:bytes.length,...FLAGS
  });
 }
 return Object.freeze({admit});
}
module.exports=Object.freeze({createPrivateSignalCiphertextAdmission});
