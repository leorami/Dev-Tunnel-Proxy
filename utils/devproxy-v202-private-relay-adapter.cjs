'use strict';
/**
 * Source-only least-privilege two-way reply adapter.
 * Host-owned endpoint credential is not ADMIN_PASSWORD and is not a public listener.
 * Pairing identity stays on the enrolled device proof; this file never enrolls.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createPrivateSignalCiphertextAdmission}=require('./calliope-private-signal-admission.cjs');
const {isPrivateSignalMailbox}=require('./calliope-private-signal-mailbox.cjs');

const THREAD=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;
const SHA=/^[a-f0-9]{64}$/;

function sha256(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function readServiceCredential(credentialPath){
  if(typeof credentialPath!=='string'||!path.isAbsolute(credentialPath)||
     path.normalize(credentialPath)!==credentialPath)
    throw Error('SERVICE_CREDENTIAL_DENIED');
  let fd;
  try{
    fd=fs.openSync(credentialPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    const st=fs.fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||(st.mode&0o777)!==0o600||
       (typeof process.getuid==='function'&&st.uid!==process.getuid()))
      throw Error('SERVICE_CREDENTIAL_DENIED');
    const bytes=fs.readFileSync(fd);
    if(!Buffer.isBuffer(bytes)||bytes.length!==32)
      throw Error('SERVICE_CREDENTIAL_DENIED');
    const admin=process.env.ADMIN_PASSWORD;
    if(typeof admin==='string'&&admin.length>0&&bytes.equals(Buffer.from(admin,'utf8')))
      throw Error('SERVICE_CREDENTIAL_NOT_ADMIN');
    return bytes;
  }catch(err){
    if(err&&(err.message==='SERVICE_CREDENTIAL_DENIED'||
             err.message==='SERVICE_CREDENTIAL_NOT_ADMIN'))throw err;
    throw Error('SERVICE_CREDENTIAL_DENIED');
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
  }
}
function createPrivateRelayAdapter({
  service,credentialPath,senderProof,now=Date.now
}={}){
  if(!service||!isPrivateSignalMailbox(service.mailbox)||
     typeof service.resolveAuthenticatedSender!=='function'||
     typeof service.isRecipientEnrolled!=='function')
    throw Error('SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED');
  const credential=readServiceCredential(credentialPath);
  function hostOwnedBinding({threadId,recipientSignalKeySha256}={}){
    if(typeof threadId!=='string'||!THREAD.test(threadId))
      throw Error('HOST_THREAD_REQUIRED');
    if(typeof recipientSignalKeySha256!=='string'||!SHA.test(recipientSignalKeySha256))
      throw Error('RECIPIENT_MISMATCH');
    return Object.freeze({
      origin:'host',
      ownerSessionSha256:sha256(Buffer.concat([credential,Buffer.from('\n'+threadId,'utf8')])),
      threadId,
      recipientSignalKeySha256
    });
  }
  async function enqueueReply(reply){
    if(!reply||typeof reply.ciphertext!=='string'||![2,3].includes(reply.messageType))
      return Object.freeze({ok:false,status:'PRIVATE_MAILBOX_DENIED'});
    let principal;
    try{principal=service.resolveAuthenticatedSender(senderProof);}
    catch{return Object.freeze({ok:false,status:'SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED'});}
    if(!principal)return Object.freeze({ok:false,status:'SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED'});
    let at;
    try{at=now();}catch{return Object.freeze({ok:false,status:'PRIVATE_MAILBOX_DENIED'});}
    if(!Number.isSafeInteger(at)||at<=1)
      return Object.freeze({ok:false,status:'PRIVATE_MAILBOX_DENIED'});
    let gate;
    try{
      gate=createPrivateSignalCiphertextAdmission({
        now,
        resolveAuthenticatedSender:service.resolveAuthenticatedSender,
        isRecipientEnrolled:service.isRecipientEnrolled
      });
    }catch{return Object.freeze({ok:false,status:'SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED'});}
    const messageId=sha256(Buffer.from(reply.ciphertext,'base64url'));
    const admitted=gate.admit({
      version:1,recipient:principal.recipient,messageId,
      signalMessageType:reply.messageType,ciphertextBase64url:reply.ciphertext,
      createdAtMs:at-1,expiresAtMs:at+20000
    },senderProof);
    if(!admitted.ok)return admitted;
    return service.mailbox.enqueue(admitted);
  }
  return Object.freeze({hostOwnedBinding,enqueueReply});
}
module.exports=Object.freeze({createPrivateRelayAdapter,readServiceCredential});
