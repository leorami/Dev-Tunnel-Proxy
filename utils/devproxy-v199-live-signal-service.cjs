'use strict';
/**
 * Host-owned live mailbox service. Enrollment is a verified device signature.
 * The x-devproxy-signal-peer test header is never accepted here.
 */
const url=require('node:url');
const {createPrivateSignalMailbox}=require('./calliope-private-signal-mailbox.cjs');
const {openEnrollmentRegistry}=require('./devproxy-v199-enrollment-registry.cjs');
const {verifyDeviceProof}=require('./devproxy-v199-device-proof.cjs');

function createLivePrivateSignalService({enrollmentDir,mailbox,now=Date.now}){
  if(!mailbox)throw Error('LIVE_MAILBOX_REQUIRED');
  const registry=openEnrollmentRegistry(enrollmentDir);
  function authenticateRequest(req,rawBody){
    const parsed=url.parse(req.url,true);
    const record=verifyDeviceProof({
      method:req.method,
      pathname:parsed.pathname||'',
      body:Buffer.isBuffer(rawBody)?rawBody:Buffer.alloc(0),
      headers:req.headers,
      lookup:registry.lookup,
      now,
      consumeNonce:registry.consumeNonce
    });
    if(!record)return null;
    return Object.freeze({deviceId:record.deviceId,role:record.role});
  }
  function resolveAuthenticatedSender(proof){
    if(!proof||proof.role!=='trajectory')return null;
    const sender=registry.lookup(proof.deviceId);
    const recipient=registry.role('calliope');
    if(!sender||sender.revoked||sender.role!=='trajectory'||!recipient)return null;
    return {
      sender:'trajectory',project:'devproxy',recipient:'calliope',
      senderSignalKeySha256:sender.signalIdentitySha256,
      recipientSignalKeySha256:recipient.signalIdentitySha256
    };
  }
  function authenticatedRecipient(proof){
    if(!proof||proof.role!=='calliope')return null;
    const record=registry.lookup(proof.deviceId);
    if(!record||record.revoked||record.role!=='calliope')return null;
    return 'calliope';
  }
  function isRecipientEnrolled(principal){
    if(!principal||principal.recipient!=='calliope')return false;
    const recipient=registry.role('calliope');
    const sender=registry.role('trajectory');
    if(!recipient||!sender)return false;
    // An authenticated transport sender is not sufficient: both ends must
    // pin each OTHER's real libsignal identity fingerprint, not merely self.
    if(sender.peerSignalIdentitySha256!==recipient.signalIdentitySha256||
       recipient.peerSignalIdentitySha256!==sender.signalIdentitySha256)
      return false;
    if(typeof principal.senderSignalKeySha256==='string'&&
       principal.senderSignalKeySha256!==sender.signalIdentitySha256)return false;
    if(typeof principal.recipientSignalKeySha256==='string'&&
       principal.recipientSignalKeySha256!==recipient.signalIdentitySha256)return false;
    return true;
  }
  return Object.freeze({
    mailbox,now,authenticateRequest,resolveAuthenticatedSender,
    authenticatedRecipient,isRecipientEnrolled,registry
  });
}
function loadLivePrivateSignalService(){
  const enrollmentDir=process.env.DEVPROXY_V199_ENROLLMENT_DIR;
  const mailboxDir=process.env.DEVPROXY_V199_MAILBOX_DIR;
  if(!enrollmentDir||!mailboxDir)return null;
  try{
    const mailbox=createPrivateSignalMailbox({directory:mailboxDir});
    return createLivePrivateSignalService({enrollmentDir,mailbox});
  }catch{return null;}
}
module.exports=Object.freeze({createLivePrivateSignalService,loadLivePrivateSignalService});
