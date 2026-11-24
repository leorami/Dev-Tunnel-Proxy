import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createSignalEndpoint } from '../../utils/devproxy-v199-signal-endpoint.mjs';

const require=createRequire(import.meta.url);
const {createPrivateSignalMailbox}=require('../../utils/calliope-private-signal-mailbox.cjs');
const {createPrivateSignalCiphertextAdmission}=require('../../utils/calliope-private-signal-admission.cjs');

const root=process.env.V192_LIBSIGNAL_PACKAGE_ROOT;
const expected=process.env.V192_EXPECTED_LIBSIGNAL_VERSION;
const key=randomBytes(32);
const health=()=>({ok:true,mode:'public'});

function dir(){
  const path=realpathSync(mkdtempSync(join(tmpdir(),'devproxy-v199-endpoint-')));
  chmodSync(path,0o700);
  return path;
}
function open(role,store,readPublicHealth){
  return createSignalEndpoint({
    role,storePath:store,sealingKey:key,packageRoot:root,expectedVersion:expected,readPublicHealth
  });
}

test('paired endpoints exchange proxy.status through an opaque mailbox and again after restart',async()=>{
  assert.equal(typeof root,'string');
  // The workflow verifies official upstream stable == npm latest and sets
  // this exact candidate; no historical release may be hardcoded here.
  assert.match(expected,/^[0-9]+\\.[0-9]+\\.[0-9]+$/);
  const home=dir();
  const trajectoryStore=join(home,'trajectory.store');
  const calliopeStore=join(home,'calliope.store');
  const box=dir();
  let trajectory=await open('trajectory',trajectoryStore);
  let calliope=await open('calliope',calliopeStore,health);
  const senderSha=await trajectory.identitySha256();
  const recipientSha=await calliope.identitySha256();
  trajectory.pinPeer(calliope.identityPublicHex());
  calliope.pinPeer(trajectory.identityPublicHex());
  const bundle=await calliope.publicBundle();
  await trajectory.acceptPeerBundle(bundle);
  const first=await trajectory.sendProxyStatus();
  const mailbox=createPrivateSignalMailbox({directory:box});
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
  assert.equal(mailbox.enqueue(admitted).ok,true);
  const listed=mailbox.list('calliope');
  assert.equal(listed.items.length,1);
  assert.equal(JSON.stringify(listed).includes('public'),false);
  const received=await calliope.receiveProxyStatus({
    messageType:listed.items[0].signalMessageType,
    ciphertext:listed.items[0].ciphertextBase64url
  });
  assert.equal(received.ackAfterDurable,true);
  assert.equal(mailbox.ack({recipient:'calliope',messageId:listed.items[0].messageId}).ok,true);
  const rendered=await trajectory.readProxyStatus(received.reply);
  assert.equal(rendered.executable,false);
  assert.equal(rendered.summary.mode,'public');
  trajectory=null;calliope=null;
  trajectory=await open('trajectory',trajectoryStore);
  calliope=await open('calliope',calliopeStore,health);
  const second=await trajectory.sendProxyStatus();
  const again=await calliope.receiveProxyStatus(second.packet);
  const afterRestart=await trajectory.readProxyStatus(again.reply);
  assert.equal(afterRestart.executable,false);
  trajectory.revoke();
  await assert.rejects(()=>trajectory.sendProxyStatus(),/ENDPOINT_REVOKED/);
  rmSync(home,{recursive:true,force:true});
  rmSync(box,{recursive:true,force:true});
});
