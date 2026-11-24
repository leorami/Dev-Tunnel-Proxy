'use strict';
/* V200 RED-first: enrolled Signal identity fingerprints must be reciprocal. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createTransportIdentity}=require('../../utils/devproxy-v199-device-proof.cjs');
const {openEnrollmentRegistry}=require('../../utils/devproxy-v199-enrollment-registry.cjs');
const {createPrivateSignalMailbox}=require('../../utils/calliope-private-signal-mailbox.cjs');
const {createLivePrivateSignalService}=require('../../utils/devproxy-v199-live-signal-service.cjs');
function sandbox(){
 const parent=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v200-peers-')));
 fs.chmodSync(parent,0o700);
 const enrollment=path.join(parent,'enrollment'),mailbox=path.join(parent,'mailbox');
 fs.mkdirSync(enrollment,{mode:0o700});
 fs.mkdirSync(mailbox,{mode:0o700});
 fs.mkdirSync(path.join(enrollment,'proof-nonces'),{mode:0o700});
 return {parent,enrollment,mailbox,close(){fs.rmSync(parent,{recursive:true,force:true});}};
}
test('RED: independent peer enrollment cannot accept asymmetric Signal fingerprints',()=>{
 const s=sandbox();
 try{
  const r=openEnrollmentRegistry(s.enrollment);
  const a=createTransportIdentity(),b=createTransportIdentity();
  const tra='ab'.repeat(32),cal='cd'.repeat(32);
  r.enroll({version:1,role:'trajectory',deviceId:a.deviceId,revoked:false,
   transportPublicKeySpki:a.transportPublicKeySpki,signalIdentitySha256:tra,peerSignalIdentitySha256:cal});
  r.enroll({version:1,role:'calliope',deviceId:b.deviceId,revoked:false,
   transportPublicKeySpki:b.transportPublicKeySpki,signalIdentitySha256:cal,
   peerSignalIdentitySha256:'ef'.repeat(32)});
  const svc=createLivePrivateSignalService({enrollmentDir:s.enrollment,
   mailbox:createPrivateSignalMailbox({directory:s.mailbox})});
  assert.equal(svc.isRecipientEnrolled({recipient:'calliope'}),false,
   'a peer must refuse one-sided/mismatched identity pins');
 }finally{s.close();}
});
test('GREEN control: reciprocal Signal fingerprints and distinct Ed25519 transport identities are enrolled',()=>{
 const s=sandbox();
 try{
  const r=openEnrollmentRegistry(s.enrollment);
  const a=createTransportIdentity(),b=createTransportIdentity();
  const tra='ab'.repeat(32),cal='cd'.repeat(32);
  r.enroll({version:1,role:'trajectory',deviceId:a.deviceId,revoked:false,
   transportPublicKeySpki:a.transportPublicKeySpki,signalIdentitySha256:tra,peerSignalIdentitySha256:cal});
  r.enroll({version:1,role:'calliope',deviceId:b.deviceId,revoked:false,
   transportPublicKeySpki:b.transportPublicKeySpki,signalIdentitySha256:cal,peerSignalIdentitySha256:tra});
  const svc=createLivePrivateSignalService({enrollmentDir:s.enrollment,
   mailbox:createPrivateSignalMailbox({directory:s.mailbox})});
  assert.equal(svc.isRecipientEnrolled({recipient:'calliope'}),true);
 }finally{s.close();}
});
