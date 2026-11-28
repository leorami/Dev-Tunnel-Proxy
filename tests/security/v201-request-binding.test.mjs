import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createSignalEndpoint } from '../../utils/devproxy-v199-signal-endpoint.mjs';

const root=process.env.V192_LIBSIGNAL_PACKAGE_ROOT;
const expected=process.env.V192_EXPECTED_LIBSIGNAL_VERSION;
const key=randomBytes(32);
const session='ab'.repeat(32);
const health=()=>({ok:true,mode:'public'});

function dir(){
  const path=realpathSync(mkdtempSync(join(tmpdir(),'devproxy-v201-binding-')));
  chmodSync(path,0o700);
  return path;
}
function open(role,store,readPublicHealth,now){
  return createSignalEndpoint({
    role,storePath:store,sealingKey:key,packageRoot:root,expectedVersion:expected,readPublicHealth,now
  });
}
function sink(failTimes=0){
  const replies=[];
  return {
    replies,
    async enqueueReply(reply){
      if(failTimes>0){failTimes-=1;throw Error('REPLY_SINK_DOWN');}
      replies.push(reply);
      return {ok:true};
    }
  };
}

async function pair(){
  const home=dir();
  const trajectoryStore=join(home,'trajectory.store');
  const calliopeStore=join(home,'calliope.store');
  let clock=1_700_000_000_000;
  const now=()=>clock;
  const trajectory=await open('trajectory',trajectoryStore,undefined,now);
  const calliope=await open('calliope',calliopeStore,health,now);
  trajectory.pinPeer(calliope.identityPublicHex());
  calliope.pinPeer(trajectory.identityPublicHex());
  await trajectory.acceptPeerBundle(await calliope.publicBundle());
  const fields={
    origin:'host',
    ownerSessionSha256:session,
    threadId:'thread-a',
    recipientSignalKeySha256:await calliope.identitySha256()
  };
  return {
    home,trajectoryStore,calliopeStore,trajectory,calliope,fields,
    clock(){return clock;},setClock(value){clock=value;}
  };
}

test('request nonce, session, recipient and thread bind the durable reply',async()=>{
  assert.equal(typeof root,'string');
  assert.match(expected,/^[0-9]+\.[0-9]+\.[0-9]+$/);
  const room=await pair();
  await assert.rejects(()=>room.trajectory.sendProxyStatus({}),/HOST_BINDING_REQUIRED/);
  await assert.rejects(()=>room.trajectory.sendProxyStatus({
    ownerSessionSha256:session,threadId:'thread-a',recipientSignalKeySha256:session
  }),/HOST_BINDING_REQUIRED/);
  await assert.rejects(()=>room.trajectory.sendProxyStatus({
    ...room.fields,recipientSignalKeySha256:'a'.repeat(64)
  }),/RECIPIENT_MISMATCH/);
  const sent=await room.trajectory.sendProxyStatus(room.fields);
  const down=sink(1);
  await assert.rejects(()=>room.calliope.receiveProxyStatus(sent.packet,down),/REPLY_SINK_DOWN/);
  assert.equal(down.replies.length,0);
  const againSink=sink();
  const again=await room.calliope.receiveProxyStatus(sent.packet,againSink);
  assert.equal(again.retry,true);
  assert.equal(again.ackAfterDurable,true);
  assert.equal(againSink.replies.length,1);
  const sealed=readFileSync(room.calliopeStore);
  const repeated=await room.calliope.receiveProxyStatus(sent.packet,againSink);
  assert.equal(repeated.retry,true);
  assert.deepEqual(repeated.reply,again.reply);
  assert.equal(againSink.replies.length,1);
  assert.deepEqual(readFileSync(room.calliopeStore),sealed);
  assert.equal(JSON.stringify(again.reply).includes('proxy.status'),false);
  const wrong={...room.fields,threadId:'thread-b',requestNonce:sent.nonce};
  await assert.rejects(()=>room.trajectory.readProxyStatus(again.reply,wrong),/STATUS_CROSS_THREAD/);
  const foreign={...room.fields,requestNonce:'e'.repeat(64)};
  await assert.rejects(()=>room.trajectory.readProxyStatus(again.reply,foreign),/STATUS_RESULT_UNBOUND|STATUS_CROSS_THREAD/);
  const rendered=await room.trajectory.readProxyStatus(again.reply,{...room.fields,requestNonce:sent.nonce});
  assert.equal(rendered.requestNonce,sent.nonce);
  assert.equal(rendered.threadId,'thread-a');
  assert.equal(rendered.ownerSessionSha256,session);
  await assert.rejects(()=>room.trajectory.readProxyStatus(again.reply,{
    ...room.fields,requestNonce:sent.nonce
  }),/STATUS_RESULT_UNBOUND/);
  rmSync(room.home,{recursive:true,force:true});
});

test('current-time freshness rejects a result after the host clock moves forward',async()=>{
  const room=await pair();
  const sent=await room.trajectory.sendProxyStatus(room.fields);
  const received=await room.calliope.receiveProxyStatus(sent.packet,sink());
  room.setClock(room.clock()+120001);
  await assert.rejects(()=>room.trajectory.readProxyStatus(received.reply,{
    ...room.fields,requestNonce:sent.nonce
  }),/STATUS_STALE/);
  rmSync(room.home,{recursive:true,force:true});
});

test('stale request is rejected and is not accepted after the clock moves back',async()=>{
  const room=await pair();
  const sent=await room.trajectory.sendProxyStatus(room.fields);
  const sentAt=room.clock();
  room.setClock(sentAt+60001);
  await assert.rejects(()=>room.calliope.receiveProxyStatus(sent.packet,sink()),/STATUS_STALE/);
  room.setClock(sentAt);
  await assert.rejects(()=>room.calliope.receiveProxyStatus(sent.packet,sink()),/STATUS_STALE/);
  rmSync(room.home,{recursive:true,force:true});
});
