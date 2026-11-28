'use strict';
/**
 * Isolated in-process HTTP proof of the default-disabled private mailbox.
 * No Docker, nginx, ngrok, live Config API, or owner-host directory.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');

process.env.NODE_ENV='test';
process.env.ADMIN_PASSWORD='v198-test-admin-password-32b';
process.env.DEVPROXY_TRUSTED_ORIGINS='http://127.0.0.1:18080';
process.env.PROXY_API_BASE_PATH='/devproxy/api';

const {createPrivateSignalMailbox}=require('../../utils/calliope-private-signal-mailbox.cjs');
const api=require('../../utils/proxyConfigAPI.js');

const NOW=1800000000000;
const SHA='a'.repeat(64);
const TRUSTED_ORIGIN='http://127.0.0.1:18080';
const PASSWORD='v198-test-admin-password-32b';
const FLAGS=['ownerApprovalGranted','exportAuthorized','executionAuthorized',
 'healingPerformed','liveAttested','productionChangeAuthorized'];

function principal(){return {sender:'trajectory',project:'demo-studio',
  recipient:'calliope',senderSignalKeySha256:SHA,recipientSignalKeySha256:'c'.repeat(64)};}
function packet(){
 return {version:1,recipient:'calliope',messageId:crypto.randomBytes(32).toString('hex'),
  signalMessageType:3,ciphertextBase64url:Buffer.from(crypto.randomBytes(88)).toString('base64url'),
  createdAtMs:NOW-1000,expiresAtMs:NOW+9000};
}
function sandbox(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v198-http-')));
 fs.chmodSync(root,0o700);
 const dir=path.join(root,'mailbox');
 fs.mkdirSync(dir,{mode:0o700});
 return {root,dir,close(){fs.rmSync(root,{recursive:true,force:true});}};
}
function noAuthority(json){
 for(const flag of FLAGS)assert.equal(json[flag],false,flag);
}
function request(port,{method,urlPath,body,headers,raw}){
 const payload=raw!=null?raw:(body==null?null:Buffer.from(JSON.stringify(body),'utf8'));
 return new Promise((resolve,reject)=>{
  const req=http.request({
   host:'127.0.0.1',port,method,path:urlPath,
   headers:{
    accept:'application/json',
    ...(payload?{'content-type':'application/json','content-length':payload.length}:{}),
    ...headers
   }
  },(res)=>{
   const chunks=[];
   res.on('data',c=>chunks.push(c));
   res.on('end',()=>{
    const text=Buffer.concat(chunks).toString('utf8');
    let json=null;try{json=text?JSON.parse(text):null;}catch{json=null;}
    resolve({status:res.statusCode,headers:res.headers,raw:text,json});
   });
  });
  req.on('error',reject);
  if(payload)req.write(payload);
  req.end();
 });
}
async function login(port){
 const res=await request(port,{
  method:'POST',urlPath:'/admin/login',body:{password:PASSWORD},
  headers:{origin:TRUSTED_ORIGIN}
 });
 assert.equal(res.status,200,res.raw);
 const cookie=String(res.headers['set-cookie'][0]).split(';')[0];
 return cookie;
}
async function withApi(fn,serviceFactory){
 const box=sandbox();
 const server=http.createServer((req,res)=>{
  Promise.resolve(api.handle(req,res)).catch((err)=>{
   res.writeHead(500,{'content-type':'application/json'});
   res.end(JSON.stringify({ok:false,error:String(err&&err.message)}));
  });
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {port}=server.address();
 try{
  if(serviceFactory){
   api.__setPrivateSignalServiceForTests(serviceFactory(box.dir));
  }else{
   api.__setPrivateSignalServiceForTests(null);
  }
  await fn({port,dir:box.dir});
 }finally{
  api.__setPrivateSignalServiceForTests(null);
  await new Promise(r=>server.close(r));
  box.close();
 }
}
function enrolledService(directory,overrides={}){
 const mailbox=createPrivateSignalMailbox({directory,now:()=>NOW,maxMessages:8});
 const revoked=overrides.revoked||new Set();
 return {
  mailbox,now:()=>NOW,
  peerFromRequest(req){
   const peer=req.headers['x-devproxy-signal-peer'];
   if(peer==='trajectory'||peer==='calliope')return {device:peer};
   return null;
  },
  resolveAuthenticatedSender(proof){
   if(!proof||proof.device!=='trajectory')return null;
   return principal();
  },
  authenticatedRecipient(proof){
   if(!proof||proof.device!=='calliope')return null;
   return 'calliope';
  },
  isRecipientEnrolled(p){
   if(revoked.has(p&&p.recipient))return false;
   return p&&p.recipient==='calliope';
  },
  ...overrides
 };
}

test('anonymous GET/POST to the private mailbox are 401; OPTIONS cannot CORS-bypass',async()=>{
 await withApi(async({port})=>{
  const get=await request(port,{method:'GET',urlPath:'/devproxy/api/signal/private/inbox'});
  assert.equal(get.status,401);
  const csrf=await request(port,{method:'POST',urlPath:'/devproxy/api/signal/private/deliver',body:packet()});
  assert.equal(csrf.status,403);
  const post=await request(port,{
   method:'POST',urlPath:'/devproxy/api/signal/private/deliver',body:packet(),
   headers:{origin:TRUSTED_ORIGIN}
  });
  assert.equal(post.status,401);
  const opt=await request(port,{method:'OPTIONS',urlPath:'/devproxy/api/signal/private/deliver'});
  assert.equal(opt.status,401);
  assert.equal(opt.headers['access-control-allow-origin'],undefined);
  assert.equal(opt.headers['access-control-allow-methods'],undefined);
 });
});

test('authenticated browser without machine identity is 503 SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED',async()=>{
 await withApi(async({port})=>{
  const cookie=await login(port);
  const res=await request(port,{
   method:'POST',urlPath:'/devproxy/api/signal/private/deliver',body:packet(),
   headers:{origin:TRUSTED_ORIGIN,cookie}
  });
  assert.equal(res.status,503);
  assert.equal(res.json.error,'SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED');
  noAuthority(res.json);
 });
});

test('unknown methods and nested path injection stay forbidden after auth',async()=>{
 await withApi(async({port})=>{
  const cookie=await login(port);
  const put=await request(port,{
   method:'PUT',urlPath:'/devproxy/api/signal/private/deliver',
   headers:{origin:TRUSTED_ORIGIN,cookie,'x-devproxy-signal-peer':'trajectory'}
  });
  assert.ok([401,404,405].includes(put.status));
  const nested=await request(port,{
   method:'GET',urlPath:'/devproxy/api/signal/private/inbox/../reports/list',
   headers:{origin:TRUSTED_ORIGIN,cookie,accept:'application/json'}
  });
  assert.ok([401,403,404].includes(nested.status));
 },(dir)=>enrolledService(dir));
});

test('wrong, revoked, or sender-as-recipient peers cannot receive ciphertext',async()=>{
 const revoked=new Set();
 await withApi(async({port})=>{
  const cookie=await login(port);
  const pkt=packet();
  const headers={origin:TRUSTED_ORIGIN,cookie,'x-devproxy-signal-peer':'trajectory'};
  const ok=await request(port,{method:'POST',urlPath:'/devproxy/api/signal/private/deliver',body:pkt,headers});
  assert.equal(ok.status,200,ok.raw);
  const senderInbox=await request(port,{
   method:'GET',urlPath:'/devproxy/api/signal/private/inbox',
   headers:{origin:TRUSTED_ORIGIN,cookie,'x-devproxy-signal-peer':'trajectory'}
  });
  assert.equal(senderInbox.status,403);
  revoked.add('calliope');
  const denied=await request(port,{
   method:'GET',urlPath:'/devproxy/api/signal/private/inbox',
   headers:{origin:TRUSTED_ORIGIN,cookie,'x-devproxy-signal-peer':'calliope'}
  });
  assert.equal(denied.status,403);
 },(dir)=>enrolledService(dir,{revoked}));
});

test('body size, extra JSON authority fields and nonce-like purpose injection are denied',async()=>{
 await withApi(async({port})=>{
  const cookie=await login(port);
  const headers={origin:TRUSTED_ORIGIN,cookie,'x-devproxy-signal-peer':'trajectory'};
  const huge=await request(port,{
   method:'POST',urlPath:'/devproxy/api/signal/private/deliver',
   headers:{...headers,'content-length':String(60000)},
   raw:Buffer.alloc(60000,97)
  });
  assert.equal(huge.status,413);
  const extra=await request(port,{
   method:'POST',urlPath:'/devproxy/api/signal/private/deliver',
   body:{...packet(),purpose:'artifact.export',path:'/etc/passwd',ownerApproved:true},
   headers
  });
  assert.equal(extra.status,403);
  noAuthority(extra.json);
 },(dir)=>enrolledService(dir));
});

test('test-only injected peer can enqueue, recipient poll, ack; restart does not redeliver',async()=>{
 await withApi(async({port,dir})=>{
  const cookie=await login(port);
  const pkt=packet();
  const sendHeaders={origin:TRUSTED_ORIGIN,cookie,'x-devproxy-signal-peer':'trajectory'};
  const recvHeaders={origin:TRUSTED_ORIGIN,cookie,'x-devproxy-signal-peer':'calliope'};
  const delivered=await request(port,{
   method:'POST',urlPath:'/devproxy/api/signal/private/deliver',body:pkt,headers:sendHeaders
  });
  assert.equal(delivered.status,200,delivered.raw);
  assert.equal(delivered.json.status,'PRIVATE_MAILBOX_ENQUEUED');
  assert.equal(Object.hasOwn(delivered.json,'ciphertextBase64url'),false);
  noAuthority(delivered.json);
  const inbox=await request(port,{method:'GET',urlPath:'/devproxy/api/signal/private/inbox',headers:recvHeaders});
  assert.equal(inbox.status,200);
  assert.equal(inbox.json.items.length,1);
  assert.equal(inbox.json.items[0].ciphertextBase64url,pkt.ciphertextBase64url);
  const acked=await request(port,{
   method:'POST',urlPath:'/devproxy/api/signal/private/ack',
   body:{messageId:pkt.messageId},headers:recvHeaders
  });
  assert.equal(acked.status,200);
  api.__setPrivateSignalServiceForTests(enrolledService(dir));
  const after=await request(port,{method:'GET',urlPath:'/devproxy/api/signal/private/inbox',headers:recvHeaders});
  assert.equal(after.json.items.length,0);
  const replay=await request(port,{
   method:'POST',urlPath:'/devproxy/api/signal/private/deliver',body:pkt,headers:sendHeaders
  });
  assert.equal(replay.status,409);
 },(dir)=>enrolledService(dir));
});

test('source never treats admin cookie or OPTIONS CORS as Signal enrollment',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../utils/proxyConfigAPI.js'),'latin1');
 assert.match(src,/SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED/);
 assert.match(src,/isPrivateSignalNamespace/);
 assert.match(src,/Access-Control-Allow-Origin': '\*'/);
 const start=src.indexOf('if (isPrivateSignalNamespace(u.pathname)){');
 const privateBlock=src.slice(start,src.indexOf('} else if (req.method === \'OPTIONS\'){',start));
 assert.match(privateBlock,/OPTIONS/);
 assert.match(privateBlock,/401/);
 assert.doesNotMatch(privateBlock,/Access-Control-Allow-Origin/);
 assert.doesNotMatch(src,/DEVPROXY_SIGNAL_MAILBOX_DIR|SIGNAL_PRIVATE_ENABLE/);
});
