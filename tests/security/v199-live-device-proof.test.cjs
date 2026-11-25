'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');

process.env.NODE_ENV='test';
process.env.ADMIN_PASSWORD='v199-test-admin-password-32b';
process.env.DEVPROXY_TRUSTED_ORIGINS='http://127.0.0.1:18080';
process.env.PROXY_API_BASE_PATH='/devproxy/api';
delete process.env.DEVPROXY_V199_ENROLLMENT_DIR;
delete process.env.DEVPROXY_V199_MAILBOX_DIR;

const {createTransportIdentity,signDeviceProof}=require('../../utils/devproxy-v199-device-proof.cjs');
const {openEnrollmentRegistry}=require('../../utils/devproxy-v199-enrollment-registry.cjs');
const api=require('../../utils/proxyConfigAPI.js');

const TRUSTED_ORIGIN='http://127.0.0.1:18080';
const PASSWORD='v199-test-admin-password-32b';
const SENDER_SIGNAL='ab'.repeat(32);
const RECIPIENT_SIGNAL='cd'.repeat(32);

function privateDir(prefix){
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),prefix)));
  fs.chmodSync(dir,0o700);
  return dir;
}
function request(port,{method,urlPath,headers,raw}){
  return new Promise((resolve,reject)=>{
    const req=http.request({
      host:'127.0.0.1',port,method,path:urlPath,
      headers:{
        accept:'application/json',
        ...(raw?{'content-type':'application/json','content-length':raw.length}:{}),
        ...headers
      }
    },(res)=>{
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>{
        const text=Buffer.concat(chunks).toString('utf8');
        let json=null;try{json=text?JSON.parse(text):null;}catch{json=null;}
        resolve({status:res.statusCode,headers:res.headers,json,raw:text});
      });
    });
    req.on('error',reject);
    if(raw)req.write(raw);
    req.end();
  });
}
async function withServer(fn){
  const server=http.createServer((req,res)=>{
    Promise.resolve(api.handle(req,res)).catch((err)=>{
      res.writeHead(500,{'content-type':'application/json'});
      res.end(JSON.stringify({ok:false,error:String(err&&err.message)}));
    });
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{await fn(server.address().port);}
  finally{await new Promise(r=>server.close(r));}
}
function packet(){
  const now=Date.now();
  return {
    version:1,recipient:'calliope',messageId:crypto.randomBytes(32).toString('hex'),
    signalMessageType:3,ciphertextBase64url:crypto.randomBytes(88).toString('base64url'),
    createdAtMs:now-1000,expiresAtMs:now+9000
  };
}
function signedHeaders({identity,method,pathname,body,extra}){
  const time=String(Date.now());
  const nonce=crypto.randomBytes(32).toString('hex');
  const sig=signDeviceProof({
    privateKeyPkcs8:identity.transportPrivateKeyPkcs8,
    method,pathname,body,time,nonce,deviceId:identity.deviceId
  });
  return {
    origin:TRUSTED_ORIGIN,
    'x-devproxy-device-id':identity.deviceId,
    'x-devproxy-device-nonce':nonce,
    'x-devproxy-device-time':time,
    'x-devproxy-device-sig':sig,
    ...extra
  };
}

test('signed enrolled sender delivers opaque ciphertext; test header, replay and revocation do not',async()=>{
  const enrollment=privateDir('devproxy-v199-enroll-');
  // A live nonce ledger is owner-provisioned, not silently auto-created.
  fs.mkdirSync(path.join(enrollment,'proof-nonces'),{mode:0o700});
  const mailbox=privateDir('devproxy-v199-mail-');
  const registry=openEnrollmentRegistry(enrollment);
  const trajectory=createTransportIdentity();
  const calliope=createTransportIdentity();
  for(const [role,identity,signal,peer] of [
    ['trajectory',trajectory,SENDER_SIGNAL,RECIPIENT_SIGNAL],
    ['calliope',calliope,RECIPIENT_SIGNAL,SENDER_SIGNAL]
  ]){
    registry.enroll({
      version:1,role,deviceId:identity.deviceId,revoked:false,
      transportPublicKeySpki:identity.transportPublicKeySpki,
      signalIdentitySha256:signal,peerSignalIdentitySha256:peer
    });
  }
  process.env.DEVPROXY_V199_ENROLLMENT_DIR=enrollment;
  process.env.DEVPROXY_V199_MAILBOX_DIR=mailbox;
  api.__setPrivateSignalServiceForTests(null);
  const source=fs.readFileSync(require.resolve('../../utils/devproxy-v199-live-signal-service.cjs'),'utf8');
  assert.equal(source.includes("headers['x-devproxy-signal-peer']"),false);
  assert.equal(source.includes('()=>true'),false);
  await withServer(async(port)=>{
    const logged=await request(port,{
      method:'POST',urlPath:'/admin/login',
      raw:Buffer.from(JSON.stringify({password:PASSWORD})),
      headers:{origin:TRUSTED_ORIGIN}
    });
    assert.equal(logged.status,200,logged.raw);
    const cookie=String(logged.headers['set-cookie'][0]).split(';')[0];
    const body=Buffer.from(JSON.stringify(packet()));
    const pathName='/devproxy/api/signal/private/deliver';
    const headerOnly=await request(port,{
      method:'POST',urlPath:pathName,raw:body,
      headers:{origin:TRUSTED_ORIGIN,cookie,'x-devproxy-signal-peer':'trajectory'}
    });
    assert.equal(headerOnly.status,503);
    assert.equal(headerOnly.json.error,'SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED');
    const signed=signedHeaders({identity:trajectory,method:'POST',pathname:pathName,body});
    const bad=await request(port,{
      method:'POST',urlPath:pathName,raw:body,
      headers:{...signed,cookie,'x-devproxy-signal-peer':'trajectory'}
    });
    assert.equal(bad.status,503);
    const accepted=signedHeaders({identity:trajectory,method:'POST',pathname:pathName,body});
    const ok=await request(port,{
      method:'POST',urlPath:pathName,raw:body,headers:{...accepted,cookie}
    });
    assert.equal(ok.status,200,ok.raw);
    assert.equal(ok.json.status,'PRIVATE_MAILBOX_ENQUEUED');
    assert.equal(ok.raw.includes('proxy.status'),false);
    const replay=await request(port,{
      method:'POST',urlPath:pathName,raw:body,headers:{...accepted,cookie}
    });
    assert.equal(replay.status,503);
    registry.revoke(calliope.deviceId);
    const nextBody=Buffer.from(JSON.stringify(packet()));
    const revoked=await request(port,{
      method:'POST',urlPath:pathName,raw:nextBody,
      headers:{...signedHeaders({identity:trajectory,method:'POST',pathname:pathName,body:nextBody}),cookie}
    });
    assert.equal(revoked.status,403,revoked.raw);
  });
  delete process.env.DEVPROXY_V199_ENROLLMENT_DIR;
  delete process.env.DEVPROXY_V199_MAILBOX_DIR;
});


test('V202 real signed private API routes both directions, each inbox and ACK stays recipient scoped',async()=>{
 const enrollment=privateDir('devproxy-v202-enroll-'),mailbox=privateDir('devproxy-v202-mail-');
 fs.mkdirSync(path.join(enrollment,'proof-nonces'),{mode:0o700});
 const registry=openEnrollmentRegistry(enrollment);
 const trajectory=createTransportIdentity(),calliope=createTransportIdentity();
 try{
  for(const [role,identity,signal,peer] of [
    ['trajectory',trajectory,SENDER_SIGNAL,RECIPIENT_SIGNAL],
    ['calliope',calliope,RECIPIENT_SIGNAL,SENDER_SIGNAL]
  ]) registry.enroll({version:1,role,deviceId:identity.deviceId,revoked:false,
    transportPublicKeySpki:identity.transportPublicKeySpki,
    signalIdentitySha256:signal,peerSignalIdentitySha256:peer});
  process.env.DEVPROXY_V199_ENROLLMENT_DIR=enrollment;
  process.env.DEVPROXY_V199_MAILBOX_DIR=mailbox;
  api.__setPrivateSignalServiceForTests(null);
  await withServer(async port=>{
   const logged=await request(port,{method:'POST',urlPath:'/admin/login',
     raw:Buffer.from(JSON.stringify({password:PASSWORD})),headers:{origin:TRUSTED_ORIGIN}});
   assert.equal(logged.status,200);
   const cookie=String(logged.headers['set-cookie'][0]).split(';')[0];
   const root='/devproxy/api/signal/private';
   async function signed(identity,method,route,value){
    const pathname=root+'/'+route;
    const raw=value===undefined?undefined:Buffer.from(JSON.stringify(value));
    return request(port,{method,urlPath:pathname,raw,headers:{
      ...signedHeaders({identity,method,pathname,body:raw}),cookie
    }});
   }
   const outbound=packet(),reply={...packet(),recipient:'trajectory'};
   const send=await signed(trajectory,'POST','deliver',outbound);
   assert.equal(send.status,200,send.raw);
   const back=await signed(calliope,'POST','deliver',reply);
   assert.equal(back.status,200,back.raw);
   for(const [who,pkt] of [[trajectory,reply],[calliope,outbound]]){
    const inbox=await signed(who,'GET','inbox');
    assert.equal(inbox.status,200,inbox.raw);
    assert.deepEqual(inbox.json.items.map(x=>x.messageId),[pkt.messageId]);
    assert.equal(inbox.json.items[0].ciphertextBase64url,pkt.ciphertextBase64url);
    const other=pkt===outbound?reply:outbound;
    assert.equal((await signed(who,'POST','ack',{messageId:other.messageId})).status,403);
   }
   assert.equal((await signed(calliope,'POST','deliver',packet())).status,403,'self destination must be denied');
   assert.equal((await signed(trajectory,'POST','deliver',{...packet(),recipient:'trajectory'})).status,403);
   assert.equal((await signed(trajectory,'POST','ack',{messageId:reply.messageId})).status,200);
   assert.equal((await signed(calliope,'POST','ack',{messageId:outbound.messageId})).status,200);
   assert.equal((await signed(trajectory,'GET','inbox')).json.items.length,0);
   registry.revoke(calliope.deviceId);
   assert.equal((await signed(trajectory,'GET','inbox')).status,403);
   assert.equal((await signed(calliope,'POST','deliver',{...packet(),recipient:'trajectory'})).status,503);
  });
 }finally{
  delete process.env.DEVPROXY_V199_ENROLLMENT_DIR;
  delete process.env.DEVPROXY_V199_MAILBOX_DIR;
  fs.rmSync(enrollment,{recursive:true,force:true});fs.rmSync(mailbox,{recursive:true,force:true});
 }
});
