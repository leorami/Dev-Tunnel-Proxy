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
  // The same two enrolled, mutually pinned devices are the only allowed
  // sender/recipient pair, in either direction. No caller-selected role.
  function otherRole(role){
    return role==='trajectory'?'calliope':role==='calliope'?'trajectory':null;
  }
  function activeProof(proof){
    if(!proof||!otherRole(proof.role))return null;
    const record=registry.lookup(proof.deviceId);
    return record&&!record.revoked&&record.role===proof.role?record:null;
  }
  function enrolledPair(senderRole){
    const recipientRole=otherRole(senderRole);
    if(!recipientRole)return null;
    const sender=registry.role(senderRole),recipient=registry.role(recipientRole);
    if(!sender||!recipient||
       sender.deviceId===recipient.deviceId||
       sender.signalIdentitySha256===recipient.signalIdentitySha256||
       sender.peerSignalIdentitySha256!==recipient.signalIdentitySha256||
       recipient.peerSignalIdentitySha256!==sender.signalIdentitySha256)return null;
    return {sender,recipient};
  }
  function resolveAuthenticatedSender(proof){
    const record=activeProof(proof);
    if(!record)return null;
    const pair=enrolledPair(record.role);
    if(!pair||pair.sender.deviceId!==record.deviceId)return null;
    return {
      sender:pair.sender.role,project:'devproxy',recipient:pair.recipient.role,
      senderSignalKeySha256:pair.sender.signalIdentitySha256,
      recipientSignalKeySha256:pair.recipient.signalIdentitySha256
    };
  }
  function authenticatedRecipient(proof){
    const record=activeProof(proof);
    if(!record)return null;
    const pair=enrolledPair(otherRole(record.role));
    return pair&&pair.recipient.deviceId===record.deviceId?record.role:null;
  }
  function isRecipientEnrolled(principal){
    if(!principal||!otherRole(principal.recipient))return false;
    const pair=enrolledPair(otherRole(principal.recipient));
    if(!pair)return false;
    const {sender,recipient}=pair;
    if(principal.sender!==undefined&&principal.sender!==sender.role)return false;
    if(principal.project!==undefined&&principal.project!=='devproxy')return false;
    if(principal.senderSignalKeySha256!==undefined&&
       principal.senderSignalKeySha256!==sender.signalIdentitySha256)return false;
    if(principal.recipientSignalKeySha256!==undefined&&
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
