'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createTransportIdentity}=require('../../utils/devproxy-v199-device-proof.cjs');
const {openEnrollmentRegistry}=require('../../utils/devproxy-v199-enrollment-registry.cjs');
const {createPrivateSignalMailbox}=require('../../utils/calliope-private-signal-mailbox.cjs');
const {createLivePrivateSignalService}=require('../../utils/devproxy-v199-live-signal-service.cjs');
const {createPrivateRelayAdapter}=require('../../utils/devproxy-v202-private-relay-adapter.cjs');

const NOW=1_800_000_000_000;
const SENDER_SIGNAL='ab'.repeat(32);
const RECIPIENT_SIGNAL='cd'.repeat(32);

function privateDir(prefix){
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),prefix)));
  fs.chmodSync(dir,0o700);
  return dir;
}
function writeCredential(dir,bytes){
  const file=path.join(dir,'relay.cred');
  const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|
    fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{
    fs.writeFileSync(fd,bytes);
    fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
  return file;
}
function enrolledService(root){
  const enrollment=path.join(root,'enroll');
  const mailboxDir=path.join(root,'mail');
  fs.mkdirSync(enrollment,{mode:0o700});
  fs.mkdirSync(path.join(enrollment,'proof-nonces'),{mode:0o700});
  fs.mkdirSync(mailboxDir,{mode:0o700});
  const registry=openEnrollmentRegistry(enrollment);
  const trajectory=createTransportIdentity();
  const calliope=createTransportIdentity();
  registry.enroll({
    version:1,role:'trajectory',deviceId:trajectory.deviceId,revoked:false,
    transportPublicKeySpki:trajectory.transportPublicKeySpki,
    signalIdentitySha256:SENDER_SIGNAL,peerSignalIdentitySha256:RECIPIENT_SIGNAL
  });
  registry.enroll({
    version:1,role:'calliope',deviceId:calliope.deviceId,revoked:false,
    transportPublicKeySpki:calliope.transportPublicKeySpki,
    signalIdentitySha256:RECIPIENT_SIGNAL,peerSignalIdentitySha256:SENDER_SIGNAL
  });
  const mailbox=createPrivateSignalMailbox({directory:mailboxDir,now:()=>NOW});
  const service=createLivePrivateSignalService({enrollmentDir:enrollment,mailbox,now:()=>NOW});
  return {root,enrollment,mailboxDir,trajectory,calliope,service,mailbox};
}

test('missing or admin-password credential is denied; adapter never copies ADMIN_PASSWORD',()=>{
  const source=fs.readFileSync(require.resolve('../../utils/devproxy-v202-private-relay-adapter.cjs'),'utf8');
  assert.equal(source.includes('ADMIN_PASSWORD='),false);
  assert.match(source,/SERVICE_CREDENTIAL_NOT_ADMIN/);
  const root=privateDir('devproxy-v202-cred-');
  try{
    const env=enrolledService(root);
    assert.throws(()=>createPrivateRelayAdapter({
      service:env.service,credentialPath:path.join(root,'missing.cred'),
      senderProof:{deviceId:env.calliope.deviceId,role:'calliope'}
    }),/SERVICE_CREDENTIAL_DENIED/);
    process.env.ADMIN_PASSWORD='A'.repeat(32);
    const reused=writeCredential(root,Buffer.from(process.env.ADMIN_PASSWORD,'utf8'));
    assert.throws(()=>createPrivateRelayAdapter({
      service:env.service,credentialPath:reused,
      senderProof:{deviceId:env.calliope.deviceId,role:'calliope'}
    }),/SERVICE_CREDENTIAL_NOT_ADMIN/);
  }finally{
    delete process.env.ADMIN_PASSWORD;
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('host-owned binding and opaque reply enqueue are idempotent with matching durable receipt',async()=>{
  const root=privateDir('devproxy-v202-adapter-');
  try{
    const env=enrolledService(root);
    const credentialPath=writeCredential(root,crypto.randomBytes(32));
    const adapter=createPrivateRelayAdapter({
      service:env.service,credentialPath,now:()=>NOW,
      senderProof:{deviceId:env.calliope.deviceId,role:'calliope'}
    });
    const binding=adapter.hostOwnedBinding({
      threadId:'room-thread-a',recipientSignalKeySha256:RECIPIENT_SIGNAL
    });
    assert.equal(binding.origin,'host');
    assert.match(binding.ownerSessionSha256,/^[a-f0-9]{64}$/);
    const packet={messageType:3,ciphertext:crypto.randomBytes(88).toString('base64url')};
    const first=await adapter.enqueueReply(packet);
    assert.equal(first.ok,true,first.status);
    assert.equal(first.status,'PRIVATE_MAILBOX_ENQUEUED');
    assert.equal(first.role,'calliope');
    assert.equal(first.recipient,'trajectory');
    assert.match(first.ciphertextDigest,/^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(first,'ciphertextBase64url'),false);
    const retry=await adapter.enqueueReply(packet);
    assert.equal(retry.ok,true);
    assert.equal(retry.messageId,first.messageId);
    assert.equal(retry.recipient,first.recipient);
    assert.equal(retry.role,first.role);
    assert.equal(retry.ciphertextDigest,first.ciphertextDigest);
    assert.equal(env.mailbox.list('trajectory').items.length,1);
    const clash=await adapter.enqueueReply({
      messageType:3,ciphertext:crypto.randomBytes(88).toString('base64url')
    });
    // Different ciphertext is a new message unless messageId collides; messageId is digest.
    assert.equal(clash.ok,true);
    assert.notEqual(clash.messageId,first.messageId);
    const listed=env.mailbox.list('trajectory');
    assert.equal(listed.items.length,2);
    assert.equal((await adapter.enqueueReply({messageType:1,ciphertext:packet.ciphertext})).ok,false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('revoked or cross-recipient sender cannot enqueue a reply',async()=>{
  const root=privateDir('devproxy-v202-deny-');
  try{
    const env=enrolledService(root);
    const credentialPath=writeCredential(root,crypto.randomBytes(32));
    const registry=openEnrollmentRegistry(env.enrollment);
    registry.revoke(env.calliope.deviceId);
    const adapter=createPrivateRelayAdapter({
      service:env.service,credentialPath,now:()=>NOW,
      senderProof:{deviceId:env.calliope.deviceId,role:'calliope'}
    });
    const denied=await adapter.enqueueReply({
      messageType:3,ciphertext:crypto.randomBytes(88).toString('base64url')
    });
    assert.equal(denied.ok,false);
    assert.equal(env.mailbox.list('trajectory').items.length,0);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
