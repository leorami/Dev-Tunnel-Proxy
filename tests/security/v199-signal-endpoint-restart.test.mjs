import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, realpathSync, chmodSync, rmSync, mkdirSync,
  openSync, writeSync, fsyncSync, closeSync, constants as fsConstants
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createSignalEndpoint } from '../../utils/devproxy-v199-signal-endpoint.mjs';

const require=createRequire(import.meta.url);
const {createPrivateSignalMailbox}=require('../../utils/calliope-private-signal-mailbox.cjs');
const {createPrivateSignalCiphertextAdmission}=require('../../utils/calliope-private-signal-admission.cjs');
const {createTransportIdentity}=require('../../utils/devproxy-v199-device-proof.cjs');
const {openEnrollmentRegistry}=require('../../utils/devproxy-v199-enrollment-registry.cjs');
const {createLivePrivateSignalService}=require('../../utils/devproxy-v199-live-signal-service.cjs');
const {createPrivateRelayAdapter}=require('../../utils/devproxy-v202-private-relay-adapter.cjs');

const root=process.env.V192_LIBSIGNAL_PACKAGE_ROOT;
const expected=process.env.V192_EXPECTED_LIBSIGNAL_VERSION;
const key=randomBytes(32);
const health=()=>({ok:true,mode:'public'});

function dir(){
  const path=realpathSync(mkdtempSync(join(tmpdir(),'devproxy-v199-endpoint-')));
  chmodSync(path,0o700);
  return path;
}
function writeCredential(directory){
  const file=join(directory,'relay.cred');
  const fd=openSync(file,fsConstants.O_CREAT|fsConstants.O_EXCL|
    fsConstants.O_WRONLY|fsConstants.O_NOFOLLOW,0o600);
  try{
    writeSync(fd,randomBytes(32));
    fsyncSync(fd);
  }finally{closeSync(fd);}
  return file;
}
function open(role,store,readPublicHealth){
  return createSignalEndpoint({
    role,storePath:store,sealingKey:key,packageRoot:root,expectedVersion:expected,readPublicHealth
  });
}

test('paired endpoints exchange proxy.status through an opaque mailbox and again after restart',async()=>{
  assert.equal(typeof root,'string');
  assert.match(expected,/^[0-9]+\.[0-9]+\.[0-9]+$/);
  const home=dir();
  const enrollDir=dir();
  mkdirSync(join(enrollDir,'proof-nonces'),{mode:0o700});
  const trajectoryStore=join(home,'trajectory.store');
  const calliopeStore=join(home,'calliope.store');
  const requestBox=dir();
  const replyBox=dir();
  let trajectory=await open('trajectory',trajectoryStore);
  let calliope=await open('calliope',calliopeStore,health);
  const senderSha=await trajectory.identitySha256();
  const recipientSha=await calliope.identitySha256();
  trajectory.pinPeer(calliope.identityPublicHex());
  calliope.pinPeer(trajectory.identityPublicHex());
  await trajectory.acceptPeerBundle(await calliope.publicBundle());
  const registry=openEnrollmentRegistry(enrollDir);
  const trajectoryDevice=createTransportIdentity();
  const calliopeDevice=createTransportIdentity();
  registry.enroll({
    version:1,role:'trajectory',deviceId:trajectoryDevice.deviceId,revoked:false,
    transportPublicKeySpki:trajectoryDevice.transportPublicKeySpki,
    signalIdentitySha256:senderSha,peerSignalIdentitySha256:recipientSha
  });
  registry.enroll({
    version:1,role:'calliope',deviceId:calliopeDevice.deviceId,revoked:false,
    transportPublicKeySpki:calliopeDevice.transportPublicKeySpki,
    signalIdentitySha256:recipientSha,peerSignalIdentitySha256:senderSha
  });
  const replyMailbox=createPrivateSignalMailbox({directory:replyBox});
  const live=createLivePrivateSignalService({
    enrollmentDir:enrollDir,mailbox:replyMailbox
  });
  const adapter=createPrivateRelayAdapter({
    service:live,
    credentialPath:writeCredential(home),
    senderProof:{deviceId:calliopeDevice.deviceId,role:'calliope'}
  });
  const fields=adapter.hostOwnedBinding({
    threadId:'room-thread-a',recipientSignalKeySha256:recipientSha
  });
  const first=await trajectory.sendProxyStatus(fields);
  const requestMailbox=createPrivateSignalMailbox({directory:requestBox});
  const gate=createPrivateSignalCiphertextAdmission({
    now:Date.now,
    resolveAuthenticatedSender:()=>({
      sender:'trajectory',project:'devproxy',recipient:'calliope',
      senderSignalKeySha256:senderSha,recipientSignalKeySha256:recipientSha
    }),
    isRecipientEnrolled:()=>true
  });
  const admitted=gate.admit({
    version:1,recipient:'calliope',messageId:first.nonce,
    signalMessageType:first.packet.messageType,
    ciphertextBase64url:first.packet.ciphertext,
    createdAtMs:Date.now()-1000,expiresAtMs:Date.now()+20000
  },{device:'enrolled'});
  assert.equal(admitted.ok,true,admitted.status);
  assert.equal(admitted.ciphertextBase64url.includes('proxy.status'),false);
  assert.equal(requestMailbox.enqueue(admitted).ok,true);
  const listed=requestMailbox.list('calliope');
  assert.equal(listed.items.length,1);
  assert.equal(JSON.stringify(listed).includes('public'),false);
  const received=await calliope.receiveProxyStatus({
    messageType:listed.items[0].signalMessageType,
    ciphertext:listed.items[0].ciphertextBase64url
  },adapter);
  assert.equal(received.ackAfterDurable,true);
  assert.equal(received.retry,false);
  const replyListed=replyMailbox.list('trajectory');
  assert.equal(replyListed.items.length,1);
  const retried=await calliope.receiveProxyStatus({
    messageType:listed.items[0].signalMessageType,
    ciphertext:listed.items[0].ciphertextBase64url
  },adapter);
  assert.equal(retried.retry,true);
  assert.equal(replyMailbox.list('trajectory').items.length,1);
  assert.equal(requestMailbox.ack({recipient:'calliope',messageId:listed.items[0].messageId}).ok,true);
  const rendered=await trajectory.readProxyStatus(received.reply,{...fields,requestNonce:first.nonce});
  assert.equal(rendered.executable,false);
  assert.equal(rendered.summary.mode,'public');
  assert.equal(rendered.requestNonce,first.nonce);
  assert.equal(rendered.threadId,'room-thread-a');
  trajectory=null;calliope=null;
  trajectory=await open('trajectory',trajectoryStore);
  calliope=await open('calliope',calliopeStore,health);
  const secondFields=adapter.hostOwnedBinding({
    threadId:'room-thread-b',recipientSignalKeySha256:await calliope.identitySha256()
  });
  const second=await trajectory.sendProxyStatus(secondFields);
  const again=await calliope.receiveProxyStatus(second.packet,adapter);
  const afterRestart=await trajectory.readProxyStatus(again.reply,{...secondFields,requestNonce:second.nonce});
  assert.equal(afterRestart.executable,false);
  trajectory.revoke();
  await assert.rejects(()=>trajectory.sendProxyStatus(),/ENDPOINT_REVOKED/);
  rmSync(home,{recursive:true,force:true});
  rmSync(enrollDir,{recursive:true,force:true});
  rmSync(requestBox,{recursive:true,force:true});
  rmSync(replyBox,{recursive:true,force:true});
});
